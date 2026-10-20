/**
 * customerEngine.js — Clientes nuevos / recurrentes / reactivados, cohortes de adquisición, retención y LTV.
 * Puro: no toca el DOM, la red ni el almacenamiento. Trabaja sobre un «libro de clientes» (ledger) con una fila por PEDIDO:
 *   { channels:[], batches:[{id,fileName}], customers:[ids], key:[canal|pedido], cust:[idx], day:[días], ch:[idx], rev:[venta], bat:[idx] }
 *
 * Definiciones (todas descriptivas; nada se adivina):
 *  - Cliente NUEVO en un pedido: es su primer pedido en el histórico cargado. «Nuevo» solo es confiable si el histórico cubre
 *    al menos `warmupDays` antes de ese mes; si no, el cliente pudo comprar antes de lo que se cargó (se marca «histórico insuficiente»).
 *  - REACTIVADO: ya había comprado y regresa después de más de `reactivationDays` sin pedidos.
 *  - RECURRENTE: ya había comprado y regresa dentro de `reactivationDays`.
 *  - Segmento de un cliente en un mes = el de su primer pedido de ese mes; todo lo que compra en ese mes cuenta en ese segmento.
 *  - Cohorte = mes del primer pedido. LTV a N días = venta acumulada por cliente en los N días desde su primer pedido (incluye el primero).
 *    Solo cuentan clientes «maduros» (su primer pedido es al menos N días anterior al último dato): sin eso el LTV se subestima.
 *  - Retención a N días = % de clientes maduros con otro pedido (otro día) dentro de los N días desde su primer pedido.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = { reactivationDays: 180, warmupDays: 180, windows: [30, 60, 90, 180, 365], minCohort: 30, maxOffsets: 12 };
  const SEGMENTS = ['new', 'recurrent', 'reactivated'];

  /* ---------- fechas ---------- */
  const dayNum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN; };
  const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const monthOf = (n) => isoOf(n).slice(0, 7);
  const monthStartDay = (key) => dayNum(`${key}-01`);

  /* ---------- libro ---------- */
  const emptyLedger = () => ({ v: 1, channels: [], batches: [], customers: [], key: [], cust: [], day: [], ch: [], rev: [], bat: [] });

  /** Acumulador de un archivo (una fila por pedido). stats cuenta lo que no pudo entrar al libro. */
  function draftLedger(placeholders) {
    const ph = new Set((placeholders || []).map((x) => String(x).toLowerCase()));
    const orders = new Map();
    const stats = { lines: 0, withoutCustomer: 0, withoutOrder: 0, unknownRevenueLines: 0, revenueWithoutCustomer: 0 };
    return {
      orders, stats,
      isPlaceholder: (c) => ph.has(String(c).toLowerCase()),
      hasLines: false,
      add({ order, customer, day, channel, revenue, line }) {
        stats.lines++;
        const o = String(order || '').trim(), c = String(customer || '').trim();
        if (!o) { stats.withoutOrder++; return false; }
        if (!c || ph.has(c.toLowerCase())) { stats.withoutCustomer++; if (fin(revenue)) stats.revenueWithoutCustomer += revenue; return false; }
        if (!fin(revenue)) stats.unknownRevenueLines++;
        const k = `${channel}|${o}`, cur = orders.get(k);
        let o2 = cur;
        if (!cur) { o2 = { c, d: day, ch: channel, rev: fin(revenue) ? revenue : 0 }; orders.set(k, o2); }
        else { if (day < cur.d) cur.d = day; if (fin(revenue)) cur.rev += revenue; if (cur.c !== c) cur.conflict = true; }
        /* Detalle por línea (producto y geografía): permite filtrar a los clientes por categoría, producto, sucursal, etc. Se junta por combinación. */
        if (line) {
          this.hasLines = true;
          const lk = `${line.sku}\u0001${line.stateIdx || 0}\u0001${line.branch || ''}\u0001${line.deliveryIdx || 0}\u0001${line.city || ''}\u0001${line.geoFlags || 0}`;
          const ls = o2.lines || (o2.lines = new Map()), L0 = ls.get(lk);
          if (L0) L0.rev += fin(revenue) ? revenue : 0;
          else ls.set(lk, { sku: line.sku, st: line.stateIdx || 0, br: line.branch || '', dl: line.deliveryIdx || 0, ci: line.city || '', fl: line.geoFlags || 0, rev: fin(revenue) ? revenue : 0 });
        }
        return true;
      }
    };
  }

  /** Mezcla un borrador en el libro. Un pedido que ya existía se REEMPLAZA completo (recargar el mismo archivo no duplica). */
  function mergeInto(ledger, draft, batch) {
    const L = ledger;
    const cIdx = new Map(L.customers.map((c, i) => [c, i]));
    const kIdx = new Map(L.key.map((k, i) => [k, i]));
    const chIdx = new Map(L.channels.map((c, i) => [c, i]));
    let b = L.batches.findIndex((x) => x.id === batch.id);
    if (b < 0) { L.batches.push({ id: batch.id, fileName: batch.fileName || '', lines: Boolean(draft.hasLines) }); b = L.batches.length - 1; }
    else L.batches[b].lines = Boolean(draft.hasLines);
    const rep = { added: 0, replaced: 0, conflicts: 0, customersAdded: 0 };
    const LN = ensureLines(L), replacedRows = new Set(), newLines = [];
    draft.orders.forEach((o, k) => {
      if (o.conflict) rep.conflicts++;
      let ci = cIdx.get(o.c); if (ci === undefined) { ci = L.customers.length; L.customers.push(o.c); cIdx.set(o.c, ci); rep.customersAdded++; }
      let hi = chIdx.get(o.ch); if (hi === undefined) { hi = L.channels.length; L.channels.push(o.ch); chIdx.set(o.ch, hi); }
      const at = kIdx.get(k);
      let row;
      if (at !== undefined) { L.cust[at] = ci; L.day[at] = o.d; L.ch[at] = hi; L.rev[at] = o.rev; L.bat[at] = b; rep.replaced++; replacedRows.add(at); row = at; }
      else { kIdx.set(k, L.key.length); row = L.key.length; L.key.push(k); L.cust.push(ci); L.day.push(o.d); L.ch.push(hi); L.rev.push(o.rev); L.bat.push(b); rep.added++; }
      if (o.lines) o.lines.forEach((l) => newLines.push([row, l]));
    });
    if (replacedRows.size && LN.o.length) {   // el pedido reemplazado trae sus líneas nuevas: se quitan las anteriores
      const keep = []; for (let i = 0; i < LN.o.length; i++) if (!replacedRows.has(LN.o[i])) keep.push(i);
      if (keep.length !== LN.o.length) ['o', 'sku', 'st', 'br', 'dl', 'ci', 'fl', 'rev'].forEach((f) => { LN[f] = keep.map((i) => LN[f][i]); });
    }
    const dIdx = (arr, map, v) => { let i = map.get(v); if (i === undefined) { i = arr.length; arr.push(v); map.set(v, i); } return i; };
    const dm = { sku: new Map(LN.dict.sku.map((v, i) => [v, i])), br: new Map(LN.dict.br.map((v, i) => [v, i])), ci: new Map(LN.dict.ci.map((v, i) => [v, i])) };
    newLines.forEach(([row, l]) => { LN.o.push(row); LN.sku.push(dIdx(LN.dict.sku, dm.sku, l.sku)); LN.st.push(l.st); LN.br.push(dIdx(LN.dict.br, dm.br, l.br)); LN.dl.push(l.dl); LN.ci.push(dIdx(LN.dict.ci, dm.ci, l.ci)); LN.fl.push(l.fl); LN.rev.push(l.rev); });
    return rep;
  }

  /** Tabla de líneas del libro (se crea vacía si el libro es anterior a esta versión: nada se migra ni se borra). */
  function ensureLines(L) {
    if (!L.lines) L.lines = { o: [], sku: [], st: [], br: [], dl: [], ci: [], fl: [], rev: [], dict: { sku: [], br: [], ci: [] } };
    return L.lines;
  }

  /** Quita los pedidos que vinieron de un archivo y compacta clientes y archivos que ya no se usan. */
  function removeBatch(ledger, batchId) {
    const L = ledger, b = L.batches.findIndex((x) => x.id === batchId);
    if (b < 0) return { removed: 0 };
    const keep = []; for (let i = 0; i < L.key.length; i++) if (L.bat[i] !== b) keep.push(i);
    const removed = L.key.length - keep.length;
    const cMap = new Map(), customers = [];
    const bMap = new Map(), batches = [];
    const out = { v: 1, channels: L.channels.slice(), batches, customers, key: [], cust: [], day: [], ch: [], rev: [], bat: [] };
    const rowMap = new Map();   // fila anterior → fila nueva (para las líneas)
    keep.forEach((i) => {
      rowMap.set(i, out.key.length);
      let c = cMap.get(L.cust[i]); if (c === undefined) { c = customers.length; customers.push(L.customers[L.cust[i]]); cMap.set(L.cust[i], c); }
      let bb = bMap.get(L.bat[i]); if (bb === undefined) { bb = batches.length; batches.push(L.batches[L.bat[i]]); bMap.set(L.bat[i], bb); }
      out.key.push(L.key[i]); out.cust.push(c); out.day.push(L.day[i]); out.ch.push(L.ch[i]); out.rev.push(L.rev[i]); out.bat.push(bb);
    });
    if (L.lines) {
      const LN = L.lines, nl = { o: [], sku: [], st: [], br: [], dl: [], ci: [], fl: [], rev: [], dict: LN.dict };
      for (let j = 0; j < LN.o.length; j++) { const r = rowMap.get(LN.o[j]); if (r === undefined) continue; nl.o.push(r); ['sku', 'st', 'br', 'dl', 'ci', 'fl', 'rev'].forEach((f) => nl[f].push(LN[f][j])); }
      out.lines = nl;
    }
    Object.assign(L, out);
    return { removed };
  }

  /** Marca los pedidos que tienen líneas de la selección. Si el libro no trae el detalle por línea (archivos cargados antes), no se inventa: se avisa. */
  function buildFilter(L, filter, n) {
    if (!L.lines || !L.lines.o.length) return { status: 'filter_unavailable', reason: 'no_lines', missingFiles: (L.batches || []).map((b) => b.fileName || b.id) };
    const covered = new Uint8Array(n); for (let j = 0; j < L.lines.o.length; j++) covered[L.lines.o[j]] = 1;
    const miss = new Set(); for (let i = 0; i < n; i++) if (!covered[i]) miss.add(L.bat[i]);
    if (miss.size) return { status: 'filter_unavailable', reason: 'partial', missingFiles: [...miss].map((b) => (L.batches[b] && (L.batches[b].fileName || L.batches[b].id)) || '') };
    const PS = FP.productStore;
    if (!PS || !PS.lineMatcher) return { status: 'filter_unavailable', reason: 'no_matcher', missingFiles: [] };
    const match = PS.lineMatcher(filter), LN = L.lines, d = LN.dict;
    const mask = new Uint8Array(n), rev = new Float64Array(n);
    for (let j = 0; j < LN.o.length; j++) {
      if (!match(d.sku[LN.sku[j]], LN.st[j], d.br[LN.br[j]], LN.dl[j], d.ci[LN.ci[j]], LN.fl[j])) continue;
      const r = LN.o[j]; mask[r] = 1; rev[r] += LN.rev[j];
    }
    return { mask, rev };
  }

  /* ---------- preparación ---------- */

  /** Pedidos ordenados por cliente y día + segmento de cada pedido. */
  function prepare(ledger, options) {
    const o = { ...DEFAULTS, ...(options || {}) }, L = ledger, n = L.key.length;
    const order = new Array(n); for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => (L.cust[a] - L.cust[b]) || (L.day[a] - L.day[b]) || (a - b));
    const seg = new Int8Array(n), seq = new Int32Array(n), gap = new Int32Array(n);   // seg: 0 nuevo, 1 recurrente, 2 reactivado
    const first = new Int32Array(L.customers.length).fill(-1);   // posición en `order` del primer pedido de cada cliente
    const last = new Int32Array(L.customers.length).fill(-1);
    let prevC = -1, prevDay = 0, k = 0;
    for (let p = 0; p < n; p++) {
      const i = order[p], c = L.cust[i];
      if (c !== prevC) { k = 0; first[c] = p; prevC = c; seg[i] = 0; gap[i] = 0; }
      else { gap[i] = L.day[i] - prevDay; seg[i] = gap[i] > o.reactivationDays ? 2 : 1; }
      seq[i] = k++; prevDay = L.day[i]; last[c] = p;
    }
    let minDay = Infinity, maxDay = -Infinity;
    for (let i = 0; i < n; i++) { if (L.day[i] < minDay) minDay = L.day[i]; if (L.day[i] > maxDay) maxDay = L.day[i]; }
    return { o, order, seg, seq, gap, first, last, minDay: n ? minDay : NaN, maxDay: n ? maxDay : NaN };
  }

  /* ---------- análisis ---------- */

  function median(arr) {
    if (!arr.length) return null;
    const a = Float64Array.from(arr).sort(); const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  const addMonthsKey = (key, k) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7);

  function analyze(ledger, options) {
    const L = ledger;
    if (!L || !L.key.length) return { status: 'no_ledger' };
    const P = prepare(L, options), o = P.o, n = L.key.length, nc = L.customers.length;
    const chId = options && options.channel && options.channel !== 'total' ? L.channels.indexOf(options.channel) : -1;
    const from = options && options.from ? dayNum(options.from) : -Infinity, to = options && options.to ? dayNum(options.to) : Infinity;
    /* Filtro por producto o geografía (categoría, subcategoría, producto, SKU, región, estado, ciudad, sucursal, entrega): solo se cuentan los pedidos
       que tienen al menos una línea de esa selección, con la venta de esas líneas. El segmento (nuevo / recurrente / reactivado) sigue siendo el del
       cliente en TODO su histórico, igual que con el canal: «nuevo» = primer pedido con la empresa, no con esa categoría. */
    const hasFilter = Boolean(options && options.filter && Object.values(options.filter).some(Boolean));
    let flt = null;
    if (hasFilter) {
      flt = buildFilter(L, options.filter, n);
      if (flt.status) return flt;
    }

    /* Resumen del histórico completo */
    const ordersPer = new Int32Array(nc), revPer = new Float64Array(nc), chSet = new Array(nc);
    let revRepeat = 0, revTotal = 0; const gaps = [];
    for (let i = 0; i < n; i++) {
      const c = L.cust[i]; ordersPer[c]++; revPer[c] += L.rev[i]; revTotal += L.rev[i];
      if (P.seq[i] > 0) { revRepeat += L.rev[i]; gaps.push(P.gap[i]); }
      const s = chSet[c] || (chSet[c] = new Set()); s.add(L.ch[i]);
    }
    let repeaters = 0, multiChannel = 0;
    for (let c = 0; c < nc; c++) { if (ordersPer[c] > 1) repeaters++; if (chSet[c] && chSet[c].size > 1) multiChannel++; }
    const summary = {
      customers: nc, orders: n, revenue: revTotal, ordersPerCustomer: n / nc, repeatCustomers: repeaters, repeatRate: repeaters / nc,
      revenuePerCustomer: revTotal / nc, repeatRevenueShare: revTotal > 0 ? revRepeat / revTotal : null, medianDaysBetweenOrders: median(gaps),
      multiChannelCustomers: multiChannel, multiChannelRate: multiChannel / nc, firstDay: isoOf(P.minDay), lastDay: isoOf(P.maxDay), spanDays: P.maxDay - P.minDay + 1
    };

    /* Mensual: segmento del cliente en cada mes */
    const months = new Map();
    const mget = (key) => { let m = months.get(key); if (!m) { m = { key, revenue: [0, 0, 0], orders: [0, 0, 0], customers: [0, 0, 0] }; months.set(key, m); } return m; };
    const act = new Map();   // mes → clientes con pedido ese mes (mismo canal/rango) para contar quién no regresó
    let curC = -1, curMonth = '', curSeg = 0, counted = false;
    for (let p = 0; p < n; p++) {
      const i = P.order[p], c = L.cust[i], d = L.day[i];
      if (d < from || d > to) { curC = c; curMonth = ''; counted = false; continue; }
      const mk = monthOf(d);
      if (c !== curC || mk !== curMonth) { curC = c; curMonth = mk; curSeg = P.seg[i]; counted = false; }
      if (chId >= 0 && L.ch[i] !== chId) continue;
      if (flt && !flt.mask[i]) continue;
      const m = mget(mk);
      (act.get(mk) || act.set(mk, new Set()).get(mk)).add(c);
      m.revenue[curSeg] += flt ? flt.rev[i] : L.rev[i]; m.orders[curSeg]++;
      if (!counted) { m.customers[curSeg]++; counted = true; }
    }
    const monthly = [...months.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((m) => {
      const ms = monthStartDay(m.key), known = ms - P.minDay;
      const sum = (a) => a[0] + a[1] + a[2];
      return { key: m.key, revenue: { new: m.revenue[0], recurrent: m.revenue[1], reactivated: m.revenue[2], total: sum(m.revenue) },
        orders: { new: m.orders[0], recurrent: m.orders[1], reactivated: m.orders[2], total: sum(m.orders) },
        customers: { new: m.customers[0], recurrent: m.customers[1], reactivated: m.customers[2], total: sum(m.customers) },
        newShareRevenue: sum(m.revenue) > 0 ? m.revenue[0] / sum(m.revenue) : null,
        lapsed: (() => { const pk = addMonthsKey(m.key, -1), prev = act.get(pk), cur = act.get(m.key); if (!prev || !cur) return null; let n = 0; prev.forEach((c) => { if (!cur.has(c)) n++; }); return n; })(),
        lapsedBase: (() => { const prev = act.get(addMonthsKey(m.key, -1)); return prev ? prev.size : null; })(),
        historyDays: Math.max(0, known), reliableNew: known >= o.warmupDays };
    });

    if (flt) return { status: 'ok', filtered: true, filter: options.filter, options: o, summary, monthly, cohorts: [], pooled: [], byFirstChannel: [], channelsAvailable: L.channels.slice(), maxDay: isoOf(P.maxDay), minDay: isoOf(P.minDay) };

    /* Cohortes por mes del primer pedido */
    const cohorts = new Map();
    const cget = (key) => { let c = cohorts.get(key); if (!c) { c = { key, size: 0, byWindow: o.windows.map(() => ({ mature: 0, repeat: 0, revenue: 0, orders: 0 })), active: new Map() }; cohorts.set(key, c); } return c; };
    const byChannel = new Map();   // canal del primer pedido → ventanas
    const poolW = o.windows.map(() => ({ mature: 0, repeat: 0, revenue: 0, orders: 0 }));
    for (let c = 0; c < nc; c++) {
      const p0 = P.first[c]; if (p0 < 0) continue;
      const i0 = P.order[p0], f = L.day[i0];
      if (f < from || f > to) continue;
      if (chId >= 0 && L.ch[i0] !== chId) continue;
      const co = cget(monthOf(f)); co.size++;
      const fch = L.channels[L.ch[i0]];
      let bc = byChannel.get(fch); if (!bc) { bc = { channel: fch, size: 0, byWindow: o.windows.map(() => ({ mature: 0, repeat: 0, revenue: 0, orders: 0 })) }; byChannel.set(fch, bc); }
      bc.size++;
      const wRev = new Float64Array(o.windows.length), wOrd = new Int32Array(o.windows.length), wRep = new Uint8Array(o.windows.length);
      for (let p = p0; p <= P.last[c]; p++) {
        const i = P.order[p], off = L.day[i] - f;
        o.windows.forEach((W, k) => { if (off <= W) { wRev[k] += L.rev[i]; wOrd[k]++; if (off > 0) wRep[k] = 1; } });
        const am = monthOf(L.day[i]); const set = co.active.get(am) || co.active.set(am, new Set()).get(am); set.add(c);
      }
      o.windows.forEach((W, k) => {
        if (f + W > P.maxDay) return;   // inmaduro: aún no se observó la ventana completa
        [co.byWindow[k], bc.byWindow[k], poolW[k]].forEach((t) => { t.mature++; t.revenue += wRev[k]; t.orders += wOrd[k]; t.repeat += wRep[k]; });
      });
    }
    const lastMonth = monthOf(P.maxDay), lastFull = monthStartDay(lastMonth) + new Date(Date.UTC(+lastMonth.slice(0, 4), +lastMonth.slice(5, 7), 0)).getUTCDate() - 1 <= P.maxDay ? lastMonth : null;
    const addMonths = (key, k) => { const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + k, 1)); return d.toISOString().slice(0, 7); };
    const rate = (t) => (t.mature > 0 ? { mature: t.mature, repeatRate: t.repeat / t.mature, ltv: t.revenue / t.mature, orders: t.orders / t.mature } : { mature: 0, repeatRate: null, ltv: null, orders: null });
    const cohortList = [...cohorts.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((co) => {
      const ms = monthStartDay(co.key), known = ms - P.minDay;
      const retention = [];
      for (let k = 0; k <= o.maxOffsets; k++) {
        const mk = addMonths(co.key, k);
        const complete = mk < lastMonth || (mk === lastMonth && lastFull === lastMonth);
        const set = co.active.get(mk);
        retention.push(complete ? (set ? set.size / co.size : 0) : null);
      }
      return { key: co.key, size: co.size, small: co.size < o.minCohort, reliable: known >= o.warmupDays, historyDays: Math.max(0, known),
        windows: o.windows.map((W, k) => ({ days: W, ...rate(co.byWindow[k]) })), retention };
    });
    const pooled = o.windows.map((W, k) => ({ days: W, ...rate(poolW[k]) }));
    const channels = [...byChannel.values()].sort((a, b) => b.size - a.size).map((c) => ({ channel: c.channel, size: c.size, windows: o.windows.map((W, k) => ({ days: W, ...rate(c.byWindow[k]) })) }));
    return { status: 'ok', options: o, summary, monthly, cohorts: cohortList, pooled, byFirstChannel: channels, channelsAvailable: L.channels.slice(), maxDay: isoOf(P.maxDay), minDay: isoOf(P.minDay) };
  }

  FP.customerEngine = { DEFAULTS, SEGMENTS, dayNum, isoOf, monthOf, emptyLedger, draftLedger, mergeInto, removeBatch, prepare, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
