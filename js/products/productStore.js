/**
 * productStore.js — Datos diarios por SKU (Fase 8.1, ampliada en 8.1.1).
 *
 * Dos archivos, dos bloques por día × canal (IndexedDB):
 *   venta  (productDays)   un renglón por SKU × estado × sucursal × tipo de entrega: venta, pedidos, unidades
 *   funnel (productFunnel) un renglón por SKU (GA4): vistas de ficha, agregados al carrito, inicios de checkout,
 *                          compras GA4. El funnel ocurre ANTES de elegir sucursal y entrega: no tiene esas dimensiones.
 *
 * Reglas:
 *  - Estados por celda: observed | missing | invalid. Nunca se convierten en 0 (NaN en columnas tipadas, null al salir).
 *  - Estado (catálogo fijo de 32), sucursal (identificador estable) y tipo de entrega (domicilio | recolección) son
 *    obligatorios en venta: valores no reconocidos se rechazan, no se adivinan.
 *  - Duplicados: llave = fecha + canal + SKU (+ estado + sucursal + entrega en venta; + otra dimensión si se mapea).
 *    Exacto → una vez; conflicto → se conserva la primera y se marca; otra dimensión distinta → se suma.
 *  - Contra lo guardado: idéntico se omite; distinto = conflicto (conservar y marcar, o reemplazar explícito).
 *  - CR del producto = pedidos del SKU-día (todas sus sucursales) ÷ vistas de ficha, solo con ambos observados. Si el
 *    archivo de venta del día × canal está cargado y un SKU con vistas no aparece, sus pedidos son 0 implícito
 *    (el archivo de venta es transaccional). Por estado, sucursal o entrega: CR y funnel NO disponibles.
 *  - Tasas del funnel: vista → carrito, carrito → checkout, checkout → compra (GA4, misma unidad por artículo).
 *  - Cobertura de medición: compras GA4 ÷ unidades reales (señal de calidad del tracking).
 *  - Resúmenes (productRollups) por categoría, subcategoría, estado, sucursal y entrega; se recalculan con ambos
 *    bloques cada vez que cambia cualquiera de los dos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const P = () => C().products;
  const N = () => FP.normalize;
  const IDB = () => FP.idb;
  const ST = { observed: 0, missing: 1, invalid: 2 };
  const KINDS = ['sales', 'funnel'];
  const metricsOf = (kind) => (kind === 'funnel' ? P().funnelMetrics : P().metrics);
  const fieldsOf = (kind) => (kind === 'funnel' ? P().funnelFields : P().fields);
  const typeOf = (kind) => (kind === 'funnel' ? P().funnelType : P().dataType);
  const storeOf = (kind) => (kind === 'funnel' ? 'productFunnel' : 'productDays');
  const GEO = ['state', 'branch', 'delivery'];
  const LEVELS = ['category', 'subcategory', 'state', 'branch', 'delivery'];
  const METRICS = () => [...P().metrics, ...P().funnelMetrics];

  /* ======================= Catálogos de dimensiones ======================= */

  const dims = { states: [], stateKey: new Map(), branches: [], branchKey: new Map(), deliveries: [], deliveryKey: new Map(), _dirty: false };
  const clean = (s) => N().simplify(s).replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
  function resetDims() {
    dims.states = ['(sin dato)', ...P().states.map((s) => s[0])];
    dims.stateKey = new Map();
    P().states.forEach(([name, aliases], i) => { [name, ...aliases].forEach((a) => dims.stateKey.set(clean(a), i + 1)); });
    dims.deliveries = ['(sin dato)', ...P().deliveries.map((d) => d[0])];
    dims.deliveryKey = new Map();
    P().deliveries.forEach(([id, lbl, aliases], i) => { [id, lbl, ...aliases].forEach((a) => dims.deliveryKey.set(clean(a), i + 1)); });
    dims.branches = ['(sin dato)']; dims.branchKey = new Map(); dims._dirty = false;
  }
  const deliveryLabel = (id) => (P().deliveries.find((d) => d[0] === id) || [id, id])[1];
  function stateIdx(raw) { return dims.stateKey.get(clean(raw)) || 0; }
  function deliveryIdx(raw) { return dims.deliveryKey.get(clean(raw)) || 0; }
  function branchIdx(lbl, create = true) {
    const k = clean(lbl);
    if (!k) return 0;
    let i = dims.branchKey.get(k);
    if (i === undefined && create) { i = dims.branches.length; dims.branches.push(String(lbl).trim().replace(/\s+/g, ' ')); dims.branchKey.set(k, i); dims._dirty = true; }
    return i === undefined ? 0 : i;
  }

  /* ======================= Contrato y mapeo ======================= */

  function suggestMapping(headers, kind = 'sales') {
    const used = new Set();
    const map = {};
    headers.forEach((h) => {
      const n = N().normalizeHeader(h);
      const f = fieldsOf(kind).find((x) => N().normalizeHeader(x.key) === n || x.synonyms.includes(n));
      map[h] = f && !used.has(f.key) ? f.key : null;
      if (f) used.add(f.key);
    });
    return map;
  }

  /** Adivina el tipo de archivo por sus encabezados (el usuario puede cambiarlo). */
  function detectKind(headers) {
    const s = suggestMapping(headers, 'sales'), f = suggestMapping(headers, 'funnel');
    const sm = Object.values(s).filter((k) => P().metrics.includes(k)).length;
    const fm = Object.values(f).filter((k) => P().funnelMetrics.includes(k)).length;
    return fm > sm ? 'funnel' : 'sales';
  }

  const label = (key) => ([...P().fields, ...P().funnelFields].find((f) => f.key === key) || { label: key }).label;

  function validateMapping(mapping, kind = 'sales') {
    const issues = [];
    const count = {};
    Object.values(mapping).forEach((f) => { if (f) count[f] = (count[f] || 0) + 1; });
    Object.entries(count).filter(([, n]) => n > 1).forEach(([f]) => issues.push({ type: 'DUPLICATE_MAPPING', severity: 'error', field: f, message: `Dos columnas están asignadas a ${label(f)}. Deja solo una.` }));
    typeOf(kind).required.forEach((f) => { if (!count[f]) issues.push({ type: 'MISSING_REQUIRED_COLUMN', severity: 'error', field: f, message: `Falta asignar la columna de ${label(f)} (obligatoria).` }); });
    if (!metricsOf(kind).some((m) => count[m])) issues.push({ type: 'MISSING_REQUIRED_COLUMN', severity: 'error', field: 'metrics', message: `Asigna al menos una métrica (${metricsOf(kind).map(label).join(', ')}).` });
    return issues;
  }

  /* ======================= Normalización rápida ======================= */

  const PLAIN = /^-?\d+(\.\d+)?$/;
  function numberCell(raw, numberFormat) {
    const s = raw === undefined || raw === null ? '' : String(raw).trim();
    if (s === '') return { state: ST.missing, value: NaN, raw: s };
    let v = PLAIN.test(s) && numberFormat !== 'comma' ? Number(s) : null;
    if (v === null) { const r = N().normalizeNumber(s, { numberFormat }); v = r.status === 'ok' ? r.value : null; }
    if (v === null || !Number.isFinite(v)) return { state: ST.invalid, value: NaN, raw: s, reason: 'invalid' };
    if (v < 0) return { state: ST.invalid, value: NaN, raw: s, reason: 'negative' };
    return { state: ST.observed, value: v, raw: s };
  }

  /* ======================= Procesamiento (sin persistir) ======================= */

  function newIssues() {
    const byType = {};
    return {
      byType, examples: [],
      add(type, severity, line, field, value, message) {
        const t = (byType[type] = byType[type] || { type, severity, count: 0 });
        t.count++;
        if (t.count <= P().issueExamples) this.examples.push({ type, severity, row: line, field, value, message });
      }
    };
  }

  const cellKey = (kind, c) => (kind === 'sales' ? `${c.sku}\u0001${c.stateIdx}\u0001${clean(c.branch)}\u0001${c.deliveryIdx}` : c.sku);

  /**
   * Borrador de un archivo (venta o funnel). `addRow(line, cells)` valida y acumula por llave.
   */
  function createDraft(headers, mapping, { kind = 'sales', dateFormat = 'auto', numberFormat = 'dot' } = {}) {
    if (!dims.states.length) resetDims();
    const idx = {};
    headers.forEach((h, i) => { if (mapping[h]) idx[mapping[h]] = i; });
    const metrics = metricsOf(kind);
    const dateCache = new Map(), chCache = new Map();
    const d = {
      kind, headers, mapping, idx, mappedMetrics: metrics.filter((m) => idx[m] !== undefined),
      hasExtra: kind === 'sales' && idx.extraDimension !== undefined,
      parts: new Map(), catalog: new Map(), issues: newIssues(), conflicts: [],
      summary: { rows: 0, accepted: 0, rejected: 0, exactDuplicates: 0, conflicts: 0, multiplicity: 0, warningRows: 0 },
      dates: new Set(), channels: new Set(), states: new Set(), branches: new Set(), deliveries: new Set(),
      settings: { dateFormat, numberFormat }
    };
    const get = (cells, key) => (idx[key] === undefined ? '' : (cells[idx[key]] === undefined ? '' : String(cells[idx[key]]).trim()));

    d.addRow = function addRow(line, cells) {
      d.summary.rows++;
      let reject = false, warn = false;
      const rawDate = get(cells, 'date');
      let dr = dateCache.get(rawDate);
      if (!dr) { dr = N().normalizeDate(rawDate, { dateFormat }); dateCache.set(rawDate, dr); }
      if (dr.status !== 'ok') { reject = true; d.issues.add(dr.status === 'missing' ? 'MISSING_DATE' : dr.status === 'ambiguous' ? 'AMBIGUOUS_DATE' : 'INVALID_DATE', 'error', line, 'fecha', rawDate, dr.note || 'Fecha inválida.'); }
      const rawCh = get(cells, 'channel');
      let cr = chCache.get(rawCh);
      if (!cr) { cr = N().normalizeChannel(rawCh); chCache.set(rawCh, cr); }
      if (cr.status !== 'ok') { reject = true; d.issues.add(cr.status === 'missing' ? 'MISSING_CHANNEL' : 'INVALID_CHANNEL', 'error', line, 'canal', rawCh, cr.note || 'Canal no reconocido.'); }
      const sku = get(cells, 'sku');
      if (!sku) { reject = true; d.issues.add('MISSING_SKU', 'error', line, 'sku', '', 'La fila no tiene SKU.'); }
      let sIdx = 0, bLabel = '', dIdx = 0;
      if (kind === 'sales') {
        const rs = get(cells, 'state'), rb = get(cells, 'branch'), rd = get(cells, 'delivery');
        if (!rs) { reject = true; d.issues.add('MISSING_STATE', 'error', line, 'estado', '', 'La fila no tiene estado.'); }
        else if (!(sIdx = stateIdx(rs))) { reject = true; d.issues.add('INVALID_STATE', 'error', line, 'estado', rs, `"${rs}" no es un estado reconocido de la República.`); }
        if (!rb) { reject = true; d.issues.add('MISSING_BRANCH', 'error', line, 'sucursal', '', 'La fila no tiene sucursal (obligatoria).'); } else bLabel = rb.replace(/\s+/g, ' ');
        if (!rd) { reject = true; d.issues.add('MISSING_DELIVERY', 'error', line, 'tipo_entrega', '', 'La fila no tiene tipo de entrega.'); }
        else if (!(dIdx = deliveryIdx(rd))) { reject = true; d.issues.add('INVALID_DELIVERY', 'error', line, 'tipo_entrega', rd, `"${rd}" no es un tipo de entrega reconocido (domicilio o recolección).`); }
      }
      if (reject) { d.summary.rejected++; return; }
      if (kind === 'sales') {
        const attrs = {};
        ['product', 'productCode', 'category', 'subcategory', 'brand', 'presentation'].forEach((k) => { attrs[k] = get(cells, k) || null; });
        if (idx.product !== undefined && !attrs.product) { warn = true; d.issues.add('MISSING_PRODUCT', 'warning', line, 'producto', '', 'SKU sin nombre de producto.'); }
        if (idx.category !== undefined && !attrs.category) { warn = true; d.issues.add('MISSING_CATEGORY', 'warning', line, 'categoria', '', 'Producto sin categoría.'); }
        if (idx.subcategory !== undefined && !attrs.subcategory) { warn = true; d.issues.add('MISSING_SUBCATEGORY', 'warning', line, 'subcategoria', '', 'Producto sin subcategoría.'); }
        const prev = d.catalog.get(sku);
        if (!prev) d.catalog.set(sku, { sku, ...attrs, firstLine: line });
        else ['product', 'category', 'subcategory', 'brand'].forEach((k) => {
          if (attrs[k] && prev[k] && attrs[k] !== prev[k]) { warn = true; d.issues.add('SKU_ATTRIBUTE_MISMATCH', 'warning', line, k, attrs[k], `El SKU ${sku} aparece con ${label(k).toLowerCase()} "${attrs[k]}" y antes con "${prev[k]}". Se conserva el primero.`); }
          if (attrs[k] && !prev[k]) prev[k] = attrs[k];
        });
      } else if (!d.catalog.has(sku)) d.catalog.set(sku, { sku, firstLine: line });
      const vals = [], sts = [];
      metrics.forEach((m) => {
        if (idx[m] === undefined) { vals.push(NaN); sts.push(ST.missing); return; }
        const c = numberCell(cells[idx[m]], numberFormat);
        vals.push(c.value); sts.push(c.state);
        if (c.state === ST.invalid) { warn = true; d.issues.add(c.reason === 'negative' ? `NEGATIVE_${m.toUpperCase()}` : `INVALID_${m.toUpperCase()}`, 'warning', line, m, c.raw, c.reason === 'negative' ? `Valor negativo en ${label(m).toLowerCase()}: se guarda como inválido, no como 0.` : `${label(m)} no es un número: se guarda como inválido, no como 0.`); }
      });
      const date = dr.value, channel = cr.value;
      d.dates.add(date); d.channels.add(channel);
      if (kind === 'sales') { d.states.add(sIdx); d.branches.add(bLabel); d.deliveries.add(dIdx); }
      const pk = `${date}|${channel}`;
      if (!d.parts.has(pk)) d.parts.set(pk, new Map());
      const part = d.parts.get(pk);
      const extra = d.hasExtra ? (get(cells, 'extraDimension') || '(vacío)') : '';
      const nc = { sku, stateIdx: sIdx, branch: bLabel, deliveryIdx: dIdx, extra, values: vals, states: sts, line, conflict: false };
      const key = `${cellKey(kind, nc)}\u0001${extra}`;
      const cell = part.get(key);
      if (cell) {
        const identical = cell.states.every((s, i) => s === sts[i] && (s !== ST.observed || cell.values[i] === vals[i]));
        if (identical) { d.summary.exactDuplicates++; d.issues.add('EXACT_DUPLICATE', 'info', line, 'llave', `${date} · ${channel} · ${sku}`, `Duplicado exacto de la fila ${cell.line}: se conserva una vez.`); return; }
        d.summary.conflicts++; cell.conflict = true;
        d.conflicts.push({ date, channel, sku, state: kind === 'sales' ? dims.states[sIdx] : null, branch: bLabel || null, delivery: kind === 'sales' ? dims.deliveries[dIdx] : null, extra, keptLine: cell.line, line, kept: metricsObj(kind, cell.values, cell.states), other: metricsObj(kind, vals, sts) });
        d.issues.add('CONFLICT', 'warning', line, 'llave', `${date} · ${channel} · ${sku}`, `Misma llave que la fila ${cell.line} con métricas distintas: se conserva la primera y se marca para revisión.`);
        return;
      }
      part.set(key, nc);
      d.summary.accepted++;
      if (warn) d.summary.warningRows++;
    };
    return d;
  }

  function metricsObj(kind, values, states) {
    const o = {};
    metricsOf(kind).forEach((m, i) => { o[m] = states[i] === ST.observed ? values[i] : null; o[`${m}State`] = ['observed', 'missing', 'invalid'][states[i]]; });
    return o;
  }

  /** Suma de celdas de una misma llave que solo difieren en "otra dimensión" (multiplicidad válida). */
  function combine(cells, kind = 'sales') {
    const ms = metricsOf(kind);
    const values = ms.map(() => 0), states = ms.map(() => ST.missing), hasObs = ms.map(() => false);
    cells.forEach((c) => ms.forEach((m, i) => {
      if (c.states[i] === ST.invalid) states[i] = ST.invalid;
      else if (c.states[i] === ST.observed) { values[i] += c.values[i]; hasObs[i] = true; }
    }));
    ms.forEach((m, i) => { if (states[i] !== ST.invalid) states[i] = hasObs[i] ? ST.observed : ST.missing; if (states[i] !== ST.observed) values[i] = NaN; });
    return { values, states, line: cells[0].line, conflict: cells.some((c) => c.conflict), multiplicity: cells.length };
  }

  /* ======================= Catálogo de SKU ======================= */

  const catalog = { list: [], bySku: new Map() };

  function catalogIdx(entry) {
    let c = catalog.bySku.get(entry.sku);
    if (!c) {
      c = { sku: entry.sku, idx: catalog.list.length, product: entry.product || null, productCode: entry.productCode || null, category: entry.category || null,
        subcategory: entry.subcategory || null, brand: entry.brand || null, presentation: entry.presentation || null };
      catalog.list.push(c); catalog.bySku.set(c.sku, c);
      c._dirty = true;
    } else {
      ['product', 'productCode', 'category', 'subcategory', 'brand', 'presentation'].forEach((k) => { if (!c[k] && entry[k]) { c[k] = entry[k]; c._dirty = true; } });
    }
    return c.idx;
  }

  /* ======================= Bloques día × canal ======================= */

  function emptyBlock(kind, date, channel, n, batches) {
    const p = { schema: 2, kind, date, channel, n, skuIdx: new Uint32Array(n), row: new Uint32Array(n), flags: new Uint8Array(n),
      state: new Uint8Array(n * metricsOf(kind).length), src: new Uint16Array(n), batches };
    if (kind === 'sales') { p.stateIdx = new Uint8Array(n); p.branchIdx = new Uint16Array(n); p.deliveryIdx = new Uint8Array(n); }
    metricsOf(kind).forEach((m) => { p[m] = new Float64Array(n); });
    return p;
  }

  /** Celdas de un día × canal → bloque con columnas tipadas. */
  function toPartition(date, channel, cellMap, batchId, kind = 'sales') {
    const groups = new Map();
    cellMap.forEach((c) => { const k = cellKey(kind, c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    const p = emptyBlock(kind, date, channel, groups.size, [batchId]);
    let i = 0, multi = 0;
    const ms = metricsOf(kind), w = ms.length;
    groups.forEach((cells) => {
      const c = combine(cells, kind), c0 = cells[0];
      p.skuIdx[i] = catalogIdx({ sku: c0.sku });
      if (kind === 'sales') { p.stateIdx[i] = c0.stateIdx; p.branchIdx[i] = branchIdx(c0.branch); p.deliveryIdx[i] = c0.deliveryIdx; }
      p.row[i] = c.line;
      p.flags[i] = (c.conflict ? 1 : 0) | (c.multiplicity > 1 ? 2 : 0);
      if (c.multiplicity > 1) multi++;
      ms.forEach((m, j) => { p[m][i] = c.values[j]; p.state[i * w + j] = c.states[j]; });
      i++;
    });
    return { part: p, multiplicity: multi };
  }

  const rowKey = (p, i) => (p.kind === 'funnel' ? String(p.skuIdx[i]) : `${p.skuIdx[i]}|${p.stateIdx[i]}|${p.branchIdx[i]}|${p.deliveryIdx[i]}`);

  function cellAt(p, i) {
    const kind = p.kind || 'sales';
    const ms = metricsOf(kind), w = ms.length;
    const o = { kind, sku: catalog.list[p.skuIdx[i]] ? catalog.list[p.skuIdx[i]].sku : null, row: p.row[i], batchId: p.batches[p.src ? p.src[i] : 0] || p.batches[0],
      conflict: Boolean(p.flags[i] & 1), multiplicity: Boolean(p.flags[i] & 2) };
    if (kind === 'sales') { o.state = dims.states[p.stateIdx[i]] || null; o.branch = dims.branches[p.branchIdx[i]] || null; o.delivery = deliveryLabel(dims.deliveries[p.deliveryIdx[i]]) || null; }
    ms.forEach((m, j) => { const st = p.state[i * w + j]; o[m] = st === ST.observed ? p[m][i] : null; o[`${m}State`] = ['observed', 'missing', 'invalid'][st]; });
    return o;
  }

  /** Fusiona un bloque nuevo con el guardado del mismo día × canal y tipo. */
  function mergePartitions(oldP, newP, policy, batchId) {
    const kind = newP.kind || 'sales';
    const ms = metricsOf(kind), w = ms.length;
    const out = new Map();
    const report = { identical: 0, conflicts: 0, replaced: 0, added: 0, details: [] };
    const srcIdx = (p, i) => p.batches[p.src ? p.src[i] : 0] || p.batches[0];
    for (let i = 0; i < oldP.n; i++) out.set(rowKey(oldP, i), { p: oldP, i, batch: srcIdx(oldP, i) });
    for (let i = 0; i < newP.n; i++) {
      const k = rowKey(newP, i);
      const ex = out.get(k);
      if (!ex) { out.set(k, { p: newP, i, batch: batchId }); report.added++; continue; }
      const same = ms.every((m, j) => ex.p.state[ex.i * w + j] === newP.state[i * w + j] && (newP.state[i * w + j] !== ST.observed || ex.p[m][ex.i] === newP[m][i]));
      if (same) { report.identical++; continue; }
      report.conflicts++;
      if (report.details.length < 200) report.details.push({ date: newP.date, channel: newP.channel, stored: cellAt(ex.p, ex.i), incoming: cellAt(newP, i), resolution: policy === 'replace' ? 'replaced' : 'kept_stored' });
      if (policy === 'replace') { out.set(k, { p: newP, i, batch: batchId }); report.replaced++; } else out.set(k, { ...ex, conflict: true });
    }
    const batches = [];
    const bIdx = (b) => { let x = batches.indexOf(b); if (x < 0) { batches.push(b); x = batches.length - 1; } return x; };
    const p = emptyBlock(kind, newP.date, newP.channel, out.size, batches);
    let i = 0;
    out.forEach((e) => {
      p.skuIdx[i] = e.p.skuIdx[e.i]; p.row[i] = e.p.row[e.i]; p.flags[i] = e.p.flags[e.i] | (e.conflict ? 1 : 0); p.src[i] = bIdx(e.batch);
      if (kind === 'sales') { p.stateIdx[i] = e.p.stateIdx[e.i]; p.branchIdx[i] = e.p.branchIdx[e.i]; p.deliveryIdx[i] = e.p.deliveryIdx[e.i]; }
      ms.forEach((m, j) => { p[m][i] = e.p[m][e.i]; p.state[i * w + j] = e.p.state[e.i * w + j]; });
      i++;
    });
    return { part: p, report };
  }

  /* ======================= Agregación (pura) ======================= */

  const NUM = ['revenue', 'orders', 'units', 'views', 'addToCart', 'beginCheckout', 'purchasesGa4', 'cells', 'fcells',
    'crOrders', 'crViews', 'aovRevenue', 'aovOrders', 'cartNum', 'cartDen', 'chkNum', 'chkDen', 'buyNum', 'buyDen', 'trkGa4', 'trkUnits', 'impliedZero', 'conflicts'];

  function newAcc() {
    const a = { obs: [0, 0, 0], missing: [0, 0, 0], invalid: [0, 0, 0], fobs: [0, 0, 0, 0], fmissing: [0, 0, 0, 0], finvalid: [0, 0, 0, 0],
      skus: new Set(), days: new Set(), funnelJoinable: true };
    NUM.forEach((k) => { a[k] = 0; });
    return a;
  }

  function mergeAcc(a, b) {
    NUM.forEach((k) => { a[k] += b[k]; });
    [0, 1, 2].forEach((j) => { a.obs[j] += b.obs[j]; a.missing[j] += b.missing[j]; a.invalid[j] += b.invalid[j]; });
    [0, 1, 2, 3].forEach((j) => { a.fobs[j] += b.fobs[j]; a.fmissing[j] += b.fmissing[j]; a.finvalid[j] += b.finvalid[j]; });
    b.skus.forEach((x) => a.skus.add(x)); b.days.forEach((x) => a.days.add(x));
    a.funnelJoinable = a.funnelJoinable && b.funnelJoinable;
    return a;
  }

  const GROUPS = {
    total: () => 'Total',
    channel: (p) => p.channel,
    date: (p) => p.date,
    category: (p, i, c) => (c && c.category) || '(sin categoría)',
    subcategory: (p, i, c) => (c && c.subcategory) || '(sin subcategoría)',
    product: (p, i, c) => (c && (c.product || c.sku)) || '(sin producto)',
    sku: (p, i, c) => (c ? c.sku : '?'),
    state: (p, i) => dims.states[p.stateIdx[i]] || '(sin dato)',
    branch: (p, i) => dims.branches[p.branchIdx[i]] || '(sin dato)',
    delivery: (p, i) => deliveryLabel(dims.deliveries[p.deliveryIdx[i]]) || '(sin dato)'
  };

  function matchesProduct(c, f) {
    if (!f) return true;
    if (f.category && (!c || (c.category || '(sin categoría)') !== f.category)) return false;
    if (f.subcategory && (!c || (c.subcategory || '(sin subcategoría)') !== f.subcategory)) return false;
    if (f.product && (!c || (c.product || c.sku) !== f.product)) return false;
    if (f.sku && (!c || c.sku !== f.sku)) return false;
    return true;
  }
  function matchesGeo(p, i, f) {
    if (!f) return true;
    if (f.state && (dims.states[p.stateIdx[i]] || '') !== f.state) return false;
    if (f.branch && (dims.branches[p.branchIdx[i]] || '') !== f.branch) return false;
    if (f.delivery && deliveryLabel(dims.deliveries[p.deliveryIdx[i]]) !== f.delivery) return false;
    return true;
  }
  const funnelJoinable = (groupBy, f) => !GEO.includes(groupBy) && !(f && (f.state || f.branch || f.delivery));

  /**
   * Acumula un día × canal (bloque de venta y/o de funnel) en un Map de grupos.
   * El funnel solo se cruza cuando el grupo y los filtros no usan estado, sucursal ni entrega.
   */
  function accumulateJoint(map, salesP, funnelP, { groupBy = 'total', filter = null, cat = catalog.list } = {}) {
    const f = filter || {};
    const join = funnelJoinable(groupBy, f);
    const get = (g) => { if (!map.has(g)) { const a = newAcc(); a.funnelJoinable = join; map.set(g, a); } return map.get(g); };
    const skuOrders = new Map(), skuUnits = new Map();
    if (salesP) {
      for (let i = 0; i < salesP.n; i++) {
        const c = cat[salesP.skuIdx[i]];
        if (!matchesProduct(c, f) || !matchesGeo(salesP, i, f)) continue;
        const a = get(GROUPS[groupBy](salesP, i, c));
        a.cells++; a.skus.add(salesP.skuIdx[i]); a.days.add(salesP.date);
        if (salesP.flags[i] & 1) a.conflicts++;
        const st = (j) => salesP.state[i * 3 + j];
        ['revenue', 'orders', 'units'].forEach((m, j) => {
          const s = st(j);
          if (s === ST.observed) { a[m] += salesP[m][i]; a.obs[j]++; } else if (s === ST.missing) a.missing[j]++; else a.invalid[j]++;
        });
        if (st(0) === ST.observed && st(1) === ST.observed && salesP.orders[i] > 0) { a.aovRevenue += salesP.revenue[i]; a.aovOrders += salesP.orders[i]; }
        if (join) {
          const k = salesP.skuIdx[i];
          const o = skuOrders.get(k) || { v: 0, ok: true }, u = skuUnits.get(k) || { v: 0, ok: true };
          if (st(1) === ST.observed) o.v += salesP.orders[i]; else o.ok = false;
          if (st(2) === ST.observed) u.v += salesP.units[i]; else u.ok = false;
          skuOrders.set(k, o); skuUnits.set(k, u);
        }
      }
    }
    if (join && funnelP) {
      for (let i = 0; i < funnelP.n; i++) {
        const k = funnelP.skuIdx[i], c = cat[k];
        if (!matchesProduct(c, f)) continue;
        const a = get(GROUPS[groupBy](funnelP, i, c));
        a.fcells++; a.skus.add(k); a.days.add(funnelP.date);
        const st = (j) => funnelP.state[i * 4 + j];
        const v = (j, m) => (st(j) === ST.observed ? funnelP[m][i] : null);
        ['views', 'addToCart', 'beginCheckout', 'purchasesGa4'].forEach((m, j) => {
          const s = st(j);
          if (s === ST.observed) { a[m] += funnelP[m][i]; a.fobs[j]++; } else if (s === ST.missing) a.fmissing[j]++; else a.finvalid[j]++;
        });
        const vw = v(0, 'views'), ad = v(1, 'addToCart'), bc = v(2, 'beginCheckout'), pu = v(3, 'purchasesGa4');
        if (vw !== null && ad !== null) { a.cartNum += ad; a.cartDen += vw; }
        if (ad !== null && bc !== null) { a.chkNum += bc; a.chkDen += ad; }
        if (bc !== null && pu !== null) { a.buyNum += pu; a.buyDen += bc; }
        // CR con pedidos reales: si el bloque de venta existe y el SKU no aparece, pedidos = 0 implícito
        if (vw !== null && salesP) {
          const o = skuOrders.get(k);
          if (!o) { a.crViews += vw; a.impliedZero++; } else if (o.ok) { a.crOrders += o.v; a.crViews += vw; }
        }
        if (pu !== null && salesP) {
          const u = skuUnits.get(k);
          if (!u) a.trkGa4 += pu; else if (u.ok) { a.trkGa4 += pu; a.trkUnits += u.v; }
        }
      }
    }
    return map;
  }

  /** Compatibilidad 8.1: acumular un solo bloque (venta o funnel). */
  function accumulatePartition(map, p, opts = {}) {
    return p.kind === 'funnel' ? accumulateJoint(map, null, p, opts) : accumulateJoint(map, p, null, opts);
  }

  /**
   * Métricas finales con estado de disponibilidad:
   * available · partial · missing · invalid · unavailable (no existe o no se puede cruzar) · not_calculable.
   */
  function finalize(acc, avail = null) {
    const av = avail || { sales: P().metrics, funnel: P().funnelMetrics };
    const out = { cells: acc.cells, funnelCells: acc.fcells, skus: acc.skus.size, days: acc.days.size, conflicts: acc.conflicts, impliedZero: acc.impliedZero, funnelJoinable: acc.funnelJoinable };
    const st = (mapped, obs, missing, invalid) => (!mapped ? 'unavailable' : obs === 0 ? (invalid ? 'invalid' : 'missing') : invalid ? 'invalid' : missing ? 'partial' : 'available');
    P().metrics.forEach((m, j) => {
      out[m] = { value: acc.obs[j] ? acc[m] : null, status: st(av.sales.includes(m), acc.obs[j], acc.missing[j], acc.invalid[j]), source: 'observed',
        coverage: acc.cells ? acc.obs[j] / acc.cells : null, missing: acc.missing[j], invalid: acc.invalid[j] };
    });
    const noJoin = 'El funnel ocurre antes de elegir estado, sucursal o entrega: no se puede cruzar con esas dimensiones.';
    const noFunnel = 'No hay funnel cargado para este periodo.';
    P().funnelMetrics.forEach((m, j) => {
      if (!acc.funnelJoinable) { out[m] = { value: null, status: 'unavailable', source: 'observed', note: noJoin }; return; }
      if (!acc.fcells) { out[m] = { value: null, status: 'unavailable', source: 'observed', note: noFunnel }; return; }
      out[m] = { value: acc.fobs[j] ? acc[m] : null, status: st(av.funnel.includes(m), acc.fobs[j], acc.fmissing[j], acc.finvalid[j]), source: 'observed',
        coverage: acc.fcells ? acc.fobs[j] / acc.fcells : null, missing: acc.fmissing[j], invalid: acc.finvalid[j] };
    });
    const ratio = (num, den, needed, formula, emptyNote) => (!acc.funnelJoinable ? { value: null, status: 'unavailable', source: 'calculated', note: noJoin }
      : !acc.fcells ? { value: null, status: 'unavailable', source: 'calculated', note: noFunnel }
        : !needed ? { value: null, status: 'unavailable', source: 'calculated', note: 'Falta una columna del funnel o de venta.' }
          : den > 0 ? { value: num / den, status: 'available', source: 'calculated', formula } : { value: null, status: 'not_calculable', source: 'calculated', note: emptyNote });
    out.conversionRate = ratio(acc.crOrders, acc.crViews, av.funnel.includes('views') && av.sales.includes('orders'), 'pedidos reales ÷ vistas de ficha (SKU-días con ambos)', 'Sin vistas observadas mayores a 0.');
    out.cartRate = ratio(acc.cartNum, acc.cartDen, av.funnel.includes('views') && av.funnel.includes('addToCart'), 'agregados al carrito ÷ vistas', 'Sin vistas.');
    out.checkoutRate = ratio(acc.chkNum, acc.chkDen, av.funnel.includes('addToCart') && av.funnel.includes('beginCheckout'), 'inicios de checkout ÷ agregados al carrito', 'Sin agregados al carrito.');
    out.purchaseRate = ratio(acc.buyNum, acc.buyDen, av.funnel.includes('beginCheckout') && av.funnel.includes('purchasesGa4'), 'compras GA4 ÷ inicios de checkout', 'Sin inicios de checkout.');
    out.trackingCoverage = ratio(acc.trkGa4, acc.trkUnits, av.funnel.includes('purchasesGa4') && av.sales.includes('units'), 'compras GA4 ÷ unidades reales', 'Sin unidades reales en los mismos SKU-días.');
    out.aov = !av.sales.includes('revenue') || !av.sales.includes('orders') ? { value: null, status: 'unavailable', source: 'calculated', note: 'Faltan venta o pedidos.' }
      : acc.aovOrders > 0 ? { value: acc.aovRevenue / acc.aovOrders, status: 'available', source: 'calculated', formula: 'venta ÷ pedidos (renglones con pedidos > 0)' }
        : { value: null, status: 'not_calculable', source: 'calculated', note: 'Sin pedidos mayores a 0: AOV no calculable.' };
    return out;
  }

  /** Resúmenes de un día × canal por nivel (cruzan venta y funnel cuando se puede). */
  function rollupsOf(salesP, funnelP, cat = catalog.list) {
    const ref = salesP || funnelP;
    const out = [];
    LEVELS.forEach((level) => {
      const m = accumulateJoint(new Map(), salesP, funnelP, { groupBy: level, cat });
      m.forEach((acc, key) => {
        const r = { date: ref.date, channel: ref.channel, level, key, skus: [...acc.skus], funnelJoinable: acc.funnelJoinable,
          obs: acc.obs, missing: acc.missing, invalid: acc.invalid, fobs: acc.fobs, fmissing: acc.fmissing, finvalid: acc.finvalid };
        NUM.forEach((k) => { r[k] = acc[k]; });
        out.push(r);
      });
    });
    return out;
  }

  function accFromRollup(r) {
    const a = newAcc();
    NUM.forEach((k) => { a[k] = r[k] || 0; });
    a.obs = r.obs.slice(); a.missing = r.missing.slice(); a.invalid = r.invalid.slice();
    a.fobs = (r.fobs || [0, 0, 0, 0]).slice(); a.fmissing = (r.fmissing || [0, 0, 0, 0]).slice(); a.finvalid = (r.finvalid || [0, 0, 0, 0]).slice();
    r.skus.forEach((x) => a.skus.add(x)); a.days.add(r.date);
    a.funnelJoinable = r.funnelJoinable !== false;
    return a;
  }

  /* ======================= Migración de esquema v1 → v2 (IndexedDB) ======================= */

  /**
   * Bloque v1 (4 métricas por SKU-día, sin dimensiones) → bloque de venta v2 (estado, sucursal y entrega "(sin dato)")
   * + bloque de funnel (solo vistas). No se pierde ningún valor; los resúmenes se recalculan al iniciar.
   */
  function upgradeV1Block(old) {
    const n = old.n;
    const sales = emptyBlock('sales', old.date, old.channel, n, old.batches || ['v1']);
    const funnel = emptyBlock('funnel', old.date, old.channel, n, old.batches || ['v1']);
    for (let i = 0; i < n; i++) {
      [sales, funnel].forEach((b) => { b.skuIdx[i] = old.skuIdx[i]; b.row[i] = old.row[i]; b.flags[i] = old.flags[i]; b.src[i] = old.src ? old.src[i] : 0; });
      ['revenue', 'orders', 'units'].forEach((m, j) => { sales[m][i] = old[m][i]; sales.state[i * 3 + j] = old.state[i * 4 + j]; });
      funnel.views[i] = old.views[i]; funnel.state[i * 4] = old.state[i * 4 + 3];
      ['addToCart', 'beginCheckout', 'purchasesGa4'].forEach((m, j) => { funnel[m][i] = NaN; funnel.state[i * 4 + j + 1] = ST.missing; });
    }
    return { sales, funnel };
  }

  /* ======================= Persistencia (IndexedDB) ======================= */

  let repo = null;
  const emptyMeta = () => ({ mappedMetrics: [], funnelMetrics: [], batches: 0, funnelBatches: 0, dateMin: null, dateMax: null, channels: [], skus: 0, states: [], branches: [], deliveries: [] });
  let meta = emptyMeta();

  async function saveDims() {
    if (!repo || !repo.ready || !dims._dirty) return;
    await repo.setMeta('productDims', { branches: dims.branches });
    dims._dirty = false;
  }

  async function init(r) {
    repo = r;
    catalog.list = []; catalog.bySku = new Map();
    meta = emptyMeta();
    resetDims();
    if (!repo || !repo.ready) return;
    const rows = await IDB().getAll(repo.db, 'productCatalog');
    rows.sort((a, b) => a.idx - b.idx).forEach((c) => { catalog.list[c.idx] = c; catalog.bySku.set(c.sku, c); });
    const dm = await repo.meta('productDims');
    if (dm && Array.isArray(dm.branches)) { dims.branches = dm.branches.slice(); dims.branchKey = new Map(dims.branches.map((b, i) => [clean(b), i]).filter((x) => x[1] > 0)); }
    const m = await repo.meta('products');
    if (m) { const { key, ...rest } = m; meta = { ...meta, ...rest }; }
    const rb = await repo.meta('productRebuild');
    if (rb && rb.pending) {
      // Tras migrar v1 → v2: separar métricas y recalcular todos los resúmenes con ambos bloques
      if ((meta.mappedMetrics || []).includes('views')) { meta.funnelMetrics = ['views']; meta.mappedMetrics = meta.mappedMetrics.filter((x) => x !== 'views'); meta.funnelBatches = meta.batches; }
      const keys = new Set();
      await IDB().iterate(repo.db, 'productDays', {}, (p) => { keys.add(`${p.date}|${p.channel}`); });
      for (const k of keys) { const [d, ch] = k.split('|'); await rebuildRollups(d, ch); }
      await repo.setMeta('products', meta);
      await repo.setMeta('productRebuild', { pending: false, doneAt: new Date().toISOString(), blocks: keys.size });
    }
  }

  const available = () => Boolean(repo && repo.ready);

  async function rebuildRollups(date, channel) {
    const s = await IDB().get(repo.db, 'productDays', [date, channel]);
    const f = await IDB().get(repo.db, 'productFunnel', [date, channel]);
    const tx = repo.db.transaction('productRollups', 'readwrite');
    const rs = tx.objectStore('productRollups');
    rs.delete(IDBKeyRange.bound([date, channel, '', ''], [date, channel, '\uffff', '\uffff']));
    if (s || f) rollupsOf(s, f).forEach((r) => rs.put(r));
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }

  /** Compara un borrador con lo guardado (sin escribir). */
  async function compareWithStored(draft) {
    const kind = draft.kind || 'sales';
    const res = { partitions: draft.parts.size, existingPartitions: 0, identical: 0, conflicts: 0, added: 0 };
    if (!available()) return res;
    const ms = metricsOf(kind), w = ms.length;
    for (const [pk, cells] of draft.parts) {
      const [date, channel] = pk.split('|');
      const old = await IDB().get(repo.db, storeOf(kind), [date, channel]);
      if (!old) { res.added += new Set([...cells.values()].map((c) => cellKey(kind, c))).size; continue; }
      res.existingPartitions++;
      const oldBy = new Map();
      for (let i = 0; i < old.n; i++) {
        const sku = catalog.list[old.skuIdx[i]] ? catalog.list[old.skuIdx[i]].sku : null;
        oldBy.set(kind === 'sales' ? cellKey(kind, { sku, stateIdx: old.stateIdx[i], branch: dims.branches[old.branchIdx[i]] || '', deliveryIdx: old.deliveryIdx[i] }) : sku, i);
      }
      const groups = new Map();
      cells.forEach((c) => { const k = cellKey(kind, c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
      groups.forEach((cs, k) => {
        const i = oldBy.get(k);
        if (i === undefined) { res.added++; return; }
        const c = combine(cs, kind);
        const same = ms.every((m, j) => old.state[i * w + j] === c.states[j] && (c.states[j] !== ST.observed || old[m][i] === c.values[j]));
        if (same) res.identical++; else res.conflicts++;
      });
    }
    return res;
  }

  /** Guarda un borrador procesado (venta o funnel). Nunca borra datos salvo 'replace' explícito en conflictos. */
  async function commit(draft, { fileName, policy = 'keep', onProgress = null } = {}) {
    if (!available()) throw new Error('IndexedDB no está disponible: la carga de productos requiere IndexedDB.');
    const kind = draft.kind || 'sales';
    const id = `pbat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const report = { identical: 0, conflicts: 0, replaced: 0, added: 0, multiplicity: 0, details: [] };
    draft.catalog.forEach((entry) => catalogIdx(entry));
    const dirty = catalog.list.filter((c) => c._dirty);
    if (dirty.length) {
      await IDB().putMany(repo.db, 'productCatalog', dirty.map((c) => { const { _dirty, ...rest } = c; return rest; }), { batchSize: 5000 });
      dirty.forEach((c) => { delete c._dirty; });
    }
    let done = 0;
    const total = draft.parts.size;
    for (const [pk, cells] of draft.parts) {
      const [date, channel] = pk.split('|');
      const built = toPartition(date, channel, cells, id, kind);
      report.multiplicity += built.multiplicity;
      let finalP = built.part;
      const old = await IDB().get(repo.db, storeOf(kind), [date, channel]);
      if (old) {
        const merged = mergePartitions(old, built.part, policy, id);
        finalP = merged.part;
        ['identical', 'conflicts', 'replaced', 'added'].forEach((k) => { report[k] += merged.report[k]; });
        merged.report.details.forEach((x) => { if (report.details.length < 500) report.details.push(x); });
      } else report.added += built.part.n;
      await IDB().put(repo.db, storeOf(kind), finalP);
      await rebuildRollups(date, channel);
      done++;
      if (onProgress && done % 20 === 0) onProgress(done, total);
      if (done % 20 === 0) await IDB().yieldToUI();
    }
    await saveDims();
    const dates = [...draft.dates].sort();
    const batch = {
      id, kind, fileName, importedAt: new Date().toISOString(), policy,
      mapping: draft.mapping, settings: draft.settings, mappedMetrics: draft.mappedMetrics,
      summary: { ...draft.summary, partitions: total, skus: draft.catalog.size, dates: draft.dates.size, dateMin: dates[0] || null, dateMax: dates[dates.length - 1] || null,
        channels: [...draft.channels], states: draft.states.size, branches: draft.branches.size },
      storedMerge: report, issuesByType: draft.issues.byType, issueExamples: draft.issues.examples, conflicts: draft.conflicts.slice(0, 500)
    };
    await IDB().put(repo.db, 'productBatches', batch);
    const all = [meta.dateMin, meta.dateMax, batch.summary.dateMin, batch.summary.dateMax].filter(Boolean).sort();
    meta = { ...meta,
      mappedMetrics: kind === 'sales' ? [...new Set([...(meta.mappedMetrics || []), ...draft.mappedMetrics])] : meta.mappedMetrics,
      funnelMetrics: kind === 'funnel' ? [...new Set([...(meta.funnelMetrics || []), ...draft.mappedMetrics])] : meta.funnelMetrics,
      batches: (meta.batches || 0) + (kind === 'sales' ? 1 : 0), funnelBatches: (meta.funnelBatches || 0) + (kind === 'funnel' ? 1 : 0),
      dateMin: all[0] || null, dateMax: all[all.length - 1] || null,
      channels: [...new Set([...(meta.channels || []), ...draft.channels])], skus: catalog.list.length,
      states: [...new Set([...(meta.states || []), ...[...draft.states].map((i) => dims.states[i])])].sort(),
      branches: [...new Set([...(meta.branches || []), ...draft.branches])].sort(),
      deliveries: [...new Set([...(meta.deliveries || []), ...[...draft.deliveries].map((i) => deliveryLabel(dims.deliveries[i]))])] };
    await repo.setMeta('products', meta);
    return batch;
  }

  /* ======================= Consultas ======================= */

  const rng = (from, to) => IDBKeyRange.bound([from, ''], [to, '\uffff']);
  const chanRange = (channel, from, to) => (channel && channel !== 'total' ? { index: 'channel_date', range: IDBKeyRange.bound([channel, from], [channel, to]) } : { range: rng(from, to) });

  /** Llaves día × canal con datos (de venta o funnel) en un rango. */
  async function keysIn({ from, to, channel = null }) {
    const set = new Set();
    for (const store of ['productDays', 'productFunnel']) await IDB().iterate(repo.db, store, chanRange(channel, from, to), (p) => { set.add(`${p.date}|${p.channel}`); });
    return [...set].sort();
  }

  /** Recorre bloques de venta (compatibilidad 8.1). */
  async function eachPartition({ from, to, channel = null }, fn) {
    if (available()) await IDB().iterate(repo.db, 'productDays', chanRange(channel, from, to), fn);
  }

  /**
   * Agregado por grupo en un rango. Usa productRollups cuando no hay filtros y el grupo es un nivel resumido;
   * si no, cruza día por día los bloques de venta y funnel.
   */
  async function aggregate({ from, to, channel = null, groupBy = 'total', filter = null }) {
    const map = new Map();
    if (!available()) return map;
    const f = filter || {};
    const noFilter = !['category', 'subcategory', 'product', 'sku', 'state', 'branch', 'delivery'].some((k) => f[k]);
    if (noFilter && LEVELS.includes(groupBy)) {
      await IDB().iterate(repo.db, 'productRollups', { index: 'level_key_date', range: IDBKeyRange.bound([groupBy, '', from], [groupBy, '\uffff', to]) }, (r) => {
        if (r.date < from || r.date > to) return;
        if (channel && channel !== 'total' && r.channel !== channel) return;
        const a = accFromRollup(r);
        if (map.has(r.key)) mergeAcc(map.get(r.key), a); else map.set(r.key, a);
      });
      return map;
    }
    const join = funnelJoinable(groupBy, f);
    const keys = await keysIn({ from, to, channel });
    let k = 0;
    for (const key of keys) {
      const [d, ch] = key.split('|');
      const s = await IDB().get(repo.db, 'productDays', [d, ch]);
      const fb = join ? await IDB().get(repo.db, 'productFunnel', [d, ch]) : null;
      accumulateJoint(map, s, fb, { groupBy, filter: f });
      if (++k % 40 === 0) await IDB().yieldToUI();
    }
    return map;
  }

  /** Renglones de un SKU con trazabilidad (venta con dimensiones y funnel). */
  async function skuTrace({ sku, from, to, channel = null }) {
    const c = catalog.bySku.get(sku);
    if (!c || !available()) return [];
    const out = [];
    for (const store of ['productDays', 'productFunnel']) {
      await IDB().iterate(repo.db, store, chanRange(channel, from, to), (p) => {
        for (let i = 0; i < p.n; i++) if (p.skuIdx[i] === c.idx) out.push({ date: p.date, channel: p.channel, ...cellAt(p, i) });
      });
    }
    const batches = new Map();
    for (const r of out) {
      if (!batches.has(r.batchId)) batches.set(r.batchId, await IDB().get(repo.db, 'productBatches', r.batchId));
      const b = batches.get(r.batchId);
      r.fileName = b ? b.fileName : null;
    }
    return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.channel !== b.channel ? (a.channel < b.channel ? -1 : 1) : a.kind < b.kind ? 1 : -1));
  }

  async function listBatches() { return available() ? IDB().getAll(repo.db, 'productBatches') : []; }
  async function counts() {
    if (!available()) return { partitions: 0, skuDays: 0, salesRows: 0, funnelRows: 0 };
    let salesRows = 0, funnelRows = 0, partitions = 0;
    await IDB().iterate(repo.db, 'productDays', {}, (p) => { partitions++; salesRows += p.n; });
    await IDB().iterate(repo.db, 'productFunnel', {}, (p) => { funnelRows += p.n; });
    return { partitions, skuDays: salesRows, salesRows, funnelRows };
  }

  FP.productStore = {
    ST, KINDS, METRICS, metricsOf, fieldsOf, typeOf, storeOf, LEVELS, GEO, dims, resetDims, stateIdx, deliveryIdx, branchIdx, deliveryLabel,
    suggestMapping, detectKind, validateMapping, label, numberCell, createDraft, combine, toPartition, mergePartitions, cellAt,
    newAcc, mergeAcc, accumulateJoint, accumulatePartition, finalize, rollupsOf, accFromRollup, GROUPS, funnelJoinable, upgradeV1Block,
    catalog, init, available, compareWithStored, commit, rebuildRollups, keysIn, eachPartition, aggregate, skuTrace, listBatches, counts,
    get meta() { return meta; },
    reset() { catalog.list = []; catalog.bySku = new Map(); meta = emptyMeta(); resetDims(); },
    _resetCatalog() { catalog.list = []; catalog.bySku = new Map(); resetDims(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
