/**
 * basketEngine.js — Productos que se compran juntos (canasta) para detectar cross-sell. Puro: no toca el DOM, la red ni el almacenamiento.
 * Trabaja sobre el libro de clientes (FP.customerEngine): una fila por pedido y, aparte, las líneas de cada pedido (producto, venta).
 *
 * Definiciones (descriptivas; asociación, no causa):
 *  - Un producto cuenta UNA vez por pedido, aunque se repita. El nivel elige qué es «producto»: SKU, producto o categoría.
 *  - Soporte de un par = pedidos que llevan los dos. Confianza A→B = pedidos con A y B ÷ pedidos con A.
 *  - Lift = confianza ÷ (pedidos con B ÷ pedidos), es decir, cuántas veces más probable es B en un pedido con A que en uno cualquiera. 1 = azar.
 *  - Candidato = par con al menos `minPairs` pedidos juntos, lift ≥ `minLift` y confianza ≥ `minConf` (umbrales provisionales en FP.config).
 *    De cada par se muestra una sola dirección: la de mayor «pedidos con A sin B» (el espacio por probar).
 *  - Solo entran pedidos con detalle por producto (archivos cargados con líneas). Se informa qué parte de los pedidos es.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = { minPairs: 30, minLift: 2, minConf: 0.05, minAnchorOrders: 100, maxItemsPerOrder: 30, topPairs: 20, topCats: 8, prevDays: 90, prevMinOrders: 500 };

  /** Una pasada: pedidos por producto, pares y distribución de la canasta. `keyOf(row)` devuelve la lista de claves distintas del pedido. */
  function pass(rows, keyOf, o) {
    const itemN = new Map(), itemRev = new Map(), pairN = new Map(), partner = new Map();
    const dist = [0, 0, 0, 0]; let N = 0, multi = 0, items = 0, skipped = 0;
    rows.forEach((row) => {
      const ks = keyOf(row); if (!ks.length) return;
      N++; items += ks.length; dist[Math.min(3, ks.length - 1)]++; if (ks.length > 1) multi++;
      ks.forEach((k) => itemN.set(k, (itemN.get(k) || 0) + 1));
      if (ks.length < 2) return;
      if (ks.length > o.maxItemsPerOrder) { skipped++; return; }
      const s = ks.slice().sort();
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const k = s[i] + '\u0001' + s[j]; pairN.set(k, (pairN.get(k) || 0) + 1); }
    });
    return { N, itemN, itemRev, pairN, partner, dist, multi, items, skipped };
  }

  function candidatesOf(P, o) {
    const out = [];
    P.pairN.forEach((n, key) => {
      if (n < o.minPairs) return;
      const [x, y] = key.split('\u0001'), nx = P.itemN.get(x), ny = P.itemN.get(y);
      const lift = (n * P.N) / (nx * ny);
      if (lift < o.minLift) return;
      /* dirección: la del producto con más pedidos como base (más pedidos con A sin B) */
      const [a, b, na, nb] = nx >= ny ? [x, y, nx, ny] : [y, x, ny, nx];
      const conf = n / na;
      if (conf < o.minConf) return;
      out.push({ a, b, n, conf, lift, aOnly: na - n, na, nb });
    });
    return out.sort((p, q) => q.lift - p.lift || q.n - p.n);
  }

  /**
   * @param ledger libro de clientes (customerEngine)
   * @param catalog Map sku → { product, category, subcategory }
   * @param options { level: 'product'|'sku'|'category', channel: id|null, ...DEFAULTS }
   */
  function analyze(ledger, catalog, options) {
    const L = ledger, opt = { ...DEFAULTS, ...(options || {}) }, level = ['sku', 'category'].includes(opt.level) ? opt.level : 'product';
    if (!L || !L.key || !L.key.length) return { status: 'no_ledger' };
    const LN = L.lines;
    if (!LN || !LN.o.length) return { status: 'no_lines', missingFiles: (L.batches || []).map((b) => b.fileName || b.id) };
    const CE = FP.customerEngine, n = L.key.length, cat = catalog || new Map();
    const chId = opt.channel && opt.channel !== 'total' ? L.channels.indexOf(opt.channel) : -1;
    if (opt.channel && opt.channel !== 'total' && chId < 0) return { status: 'no_ledger', reason: 'unknown_channel' };
    /* líneas por pedido (fila del libro) */
    const lines = new Array(n); let totalOrders = 0, withLines = 0;
    for (let j = 0; j < LN.o.length; j++) { const r = LN.o[j]; (lines[r] || (lines[r] = [])).push(j); }
    const meta = (sku) => cat.get(sku) || null;
    const label = {
      sku: (sku) => { const m = meta(sku); return m && m.product ? `${m.product} (${sku})` : sku; },
      product: (sku) => { const m = meta(sku); return (m && (m.product || m.sku)) || sku; },
      category: (sku) => { const m = meta(sku); return (m && m.category) || 'Sin categoría'; }
    };
    const keyAt = (lv, j) => { const sku = LN.dict.sku[LN.sku[j]]; return label[lv](sku); };
    const rowsAll = []; let minDay = Infinity, maxDay = -Infinity, revAll = 0;
    for (let i = 0; i < n; i++) {
      if (chId >= 0 && L.ch[i] !== chId) continue;
      totalOrders++;
      if (!lines[i]) continue;
      withLines++; rowsAll.push(i);
      if (L.day[i] < minDay) minDay = L.day[i]; if (L.day[i] > maxDay) maxDay = L.day[i]; revAll += L.rev[i];
    }
    if (!withLines) return { status: 'ok', empty: true, level, totalOrders, withLines: 0, coverage: 0, channelsAvailable: L.channels.slice(), options: opt };
    const keysOf = (lv) => (i) => { const s = new Set(); lines[i].forEach((j) => s.add(keyAt(lv, j))); return [...s]; };
    const mainKeys = keysOf(level), P = pass(rowsAll, mainKeys, opt);
    const cands = candidatesOf(P, opt);
    /* venta de B por pedido (promedio de lo que vende B cuando aparece) */
    const revOf = new Map(), cntOf = new Map();
    const need = new Set(); cands.slice(0, 200).forEach((c) => { need.add(c.a); need.add(c.b); });
    let revMulti = 0;
    rowsAll.forEach((i) => {
      const per = new Map(); lines[i].forEach((j) => { const k = keyAt(level, j); per.set(k, (per.get(k) || 0) + LN.rev[j]); });
      if (per.size > 1) revMulti += L.rev[i];
      per.forEach((v, k) => { if (need.has(k)) { revOf.set(k, (revOf.get(k) || 0) + v); cntOf.set(k, (cntOf.get(k) || 0) + 1); } });
    });
    const top = cands.slice(0, 200);
    /* por canal: confianza del mismo par en cada canal (solo con todos los canales) */
    let byCh = null;
    if (chId < 0 && top.length) {
      const watch = top.slice(0, opt.topPairs), pn = watch.map(() => L.channels.map(() => 0)), an = watch.map(() => L.channels.map(() => 0));
      const idx = new Map(); watch.forEach((c, k) => { (idx.get(c.a) || idx.set(c.a, []).get(c.a)).push(k); });
      rowsAll.forEach((i) => { const ks = new Set(mainKeys(i)); ks.forEach((a) => { const ws = idx.get(a); if (!ws) return; ws.forEach((k) => { an[k][L.ch[i]]++; if (ks.has(watch[k].b)) pn[k][L.ch[i]]++; }); }); });
      byCh = watch.map((c, k) => L.channels.map((chn, ci) => ({ channel: chn, orders: an[k][ci], conf: an[k][ci] >= opt.minPairs ? pn[k][ci] / an[k][ci] : null })));
    }
    const candidates = top.map((c, k) => ({ ...c, bRevPerOrder: cntOf.get(c.b) ? revOf.get(c.b) / cntOf.get(c.b) : null, byChannel: byCh && byCh[k] ? byCh[k] : null }));
    /* productos ancla: los que más pedidos tienen y qué porcentaje lleva otro producto */
    const best = new Map();
    P.pairN.forEach((m, key) => { const [x, y] = key.split('\u0001'); [[x, y], [y, x]].forEach(([a, b]) => { const cur = best.get(a); if (!cur || m > cur.n) best.set(a, { b, n: m }); }); });
    const withOther = new Map();
    rowsAll.forEach((i) => { const ks = mainKeys(i); if (ks.length > 1) ks.forEach((k) => withOther.set(k, (withOther.get(k) || 0) + 1)); });
    const anchors = [...P.itemN.entries()].filter(([, c]) => c >= opt.minAnchorOrders).map(([k, c]) => ({ item: k, orders: c, withOtherShare: (withOther.get(k) || 0) / c, partner: best.get(k) && best.get(k).n >= opt.minPairs ? best.get(k).b : null }))
      .sort((a, b) => b.withOtherShare - a.withOtherShare || b.orders - a.orders).slice(0, 6);
    /* categorías: lift entre las categorías más vendidas (si el nivel ya es categoría, es el mismo cálculo) */
    let cats = null;
    {
      const PC = level === 'category' ? P : pass(rowsAll, keysOf('category'), opt);
      const names = [...PC.itemN.entries()].sort((a, b) => b[1] - a[1]).slice(0, opt.topCats).map(([k]) => k);
      if (names.length > 1) {
        const lift = names.map((x) => names.map((y) => { if (x === y) return null; const key = x < y ? x + '\u0001' + y : y + '\u0001' + x, m = PC.pairN.get(key) || 0; return m >= opt.minPairs ? (m * PC.N) / (PC.itemN.get(x) * PC.itemN.get(y)) : null; }));
        cats = { names, lift, orders: names.map((k) => PC.itemN.get(k)) };
      }
    }
    /* contra hace N días: qué pares cumplen ahora y no antes (y al revés) */
    let prev = null;
    const cut = maxDay - opt.prevDays, before = rowsAll.filter((i) => L.day[i] <= cut);
    if (before.length >= opt.prevMinOrders && minDay + opt.prevDays < cut) {
      const PB = pass(before, mainKeys, opt), cb = candidatesOf(PB, opt);
      const nowU = new Set(cands.map((c) => [c.a, c.b].sort().join('\u0001'))), wasU = new Set(cb.map((c) => [c.a, c.b].sort().join('\u0001')));
      let fresh = 0, gone = 0; nowU.forEach((k) => { if (!wasU.has(k)) fresh++; }); wasU.forEach((k) => { if (!nowU.has(k)) gone++; });
      prev = { n: wasU.size, fresh, gone, orders: before.length, days: opt.prevDays };
    }
    return { status: 'ok', level, options: opt, totalOrders, withLines, coverage: totalOrders ? withLines / totalOrders : 0, orders: P.N,
      avgItems: P.N ? P.items / P.N : null, multiShare: P.N ? P.multi / P.N : null, multiRevShare: revAll > 0 ? revMulti / revAll : null,
      dist: P.dist.map((c) => (P.N ? c / P.N : 0)), skippedLarge: P.skipped, candidates, anchors, cats, prev,
      channelsAvailable: L.channels.slice(), minDay: CE.isoOf(minDay), maxDay: CE.isoOf(maxDay) };
  }

  FP.basketEngine = { DEFAULTS, analyze, pass, candidatesOf };
})(typeof window !== 'undefined' ? window : globalThis);
