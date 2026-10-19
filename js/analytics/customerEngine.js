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
      add({ order, customer, day, channel, revenue }) {
        stats.lines++;
        const o = String(order || '').trim(), c = String(customer || '').trim();
        if (!o) { stats.withoutOrder++; return false; }
        if (!c || ph.has(c.toLowerCase())) { stats.withoutCustomer++; if (fin(revenue)) stats.revenueWithoutCustomer += revenue; return false; }
        if (!fin(revenue)) stats.unknownRevenueLines++;
        const k = `${channel}|${o}`, cur = orders.get(k);
        if (!cur) orders.set(k, { c, d: day, ch: channel, rev: fin(revenue) ? revenue : 0 });
        else { if (day < cur.d) cur.d = day; if (fin(revenue)) cur.rev += revenue; if (cur.c !== c) cur.conflict = true; }
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
    if (b < 0) { L.batches.push({ id: batch.id, fileName: batch.fileName || '' }); b = L.batches.length - 1; }
    const rep = { added: 0, replaced: 0, conflicts: 0, customersAdded: 0 };
    draft.orders.forEach((o, k) => {
      if (o.conflict) rep.conflicts++;
      let ci = cIdx.get(o.c); if (ci === undefined) { ci = L.customers.length; L.customers.push(o.c); cIdx.set(o.c, ci); rep.customersAdded++; }
      let hi = chIdx.get(o.ch); if (hi === undefined) { hi = L.channels.length; L.channels.push(o.ch); chIdx.set(o.ch, hi); }
      const at = kIdx.get(k);
      if (at !== undefined) { L.cust[at] = ci; L.day[at] = o.d; L.ch[at] = hi; L.rev[at] = o.rev; L.bat[at] = b; rep.replaced++; }
      else { kIdx.set(k, L.key.length); L.key.push(k); L.cust.push(ci); L.day.push(o.d); L.ch.push(hi); L.rev.push(o.rev); L.bat.push(b); rep.added++; }
    });
    return rep;
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
    keep.forEach((i) => {
      let c = cMap.get(L.cust[i]); if (c === undefined) { c = customers.length; customers.push(L.customers[L.cust[i]]); cMap.set(L.cust[i], c); }
      let bb = bMap.get(L.bat[i]); if (bb === undefined) { bb = batches.length; batches.push(L.batches[L.bat[i]]); bMap.set(L.bat[i], bb); }
      out.key.push(L.key[i]); out.cust.push(c); out.day.push(L.day[i]); out.ch.push(L.ch[i]); out.rev.push(L.rev[i]); out.bat.push(bb);
    });
    Object.assign(L, out);
    return { removed };
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
      const m = mget(mk);
      (act.get(mk) || act.set(mk, new Set()).get(mk)).add(c);
      m.revenue[curSeg] += L.rev[i]; m.orders[curSeg]++;
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
