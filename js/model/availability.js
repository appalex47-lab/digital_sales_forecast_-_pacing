/**
 * availability.js — Fase B · disponibilidad real de métricas, dimensiones y análisis, con periodos explícitos y comparabilidad.
 * Consume lo que ya produce la Fase A (registros con su estado, celdas en cuarentena, lotes con su fuente) sin repetir validaciones.
 * Resultados en caché por firma de los datos (lotes cargados) + contexto; se invalida sola al cargar o quitar archivos.
 *
 * Estados: available, partial, missing, invalid, quarantined, derived, not_applicable, unavailable_source, incomplete_period,
 * non_comparable. Comparación: both_available, current_only, comparison_only, neither_available, partial_comparison, non_comparable.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const S = () => FP.dataStore;
  const MIN_COVERAGE = 0.8;
  const SEG_DIM = { device: 'device', source: 'source', medium: 'medium', campaign: 'campaign', landing_page: 'landing', customer_type: 'customer_type' };
  const DIM_LABEL = { device: 'Dispositivo', source: 'Fuente', medium: 'Medio', campaign: 'Campaña', landing_page: 'Landing', customer_type: 'Tipo de cliente', category: 'Categoría', geography: 'Geografía', product_id: 'Producto' };
  const NON_GA4 = ['whatsapp', 'llamadas'];

  /* ---------- periodos ---------- */
  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1;
  const shiftYear = (iso, n) => `${+iso.slice(0, 4) + n}${iso.slice(4)}`;
  /** Periodo de comparación explícito: 'previous' (mismo largo, justo antes) o 'yoy' (mismo periodo del año anterior). */
  function comparisonPeriod(cur, kind) {
    if (!cur || !kind) return null;
    if (kind === 'previous') { const n = days(cur.start, cur.end); return { start: addDays(cur.start, -n), end: addDays(cur.start, -1), kind }; }
    return { start: shiftYear(cur.start, -1), end: shiftYear(cur.end, -1), kind: 'yoy' };
  }
  function periodCoverage(records, p, { batches = [] } = {}) {
    if (!p) return null;
    const inP = records.filter((r) => r.date >= p.start && r.date <= p.end);
    const present = new Set(inP.map((r) => r.date)); const exp = days(p.start, p.end);
    const sorted = [...present].sort();
    const last = batches.map((b) => b.importedAt).filter(Boolean).sort().pop() || null;
    return { start: p.start, end: p.end, expectedDays: exp, presentDays: present.size, missingDays: exp - present.size, coverage: exp ? present.size / exp : 0,
      firstDate: sorted[0] || null, lastDate: sorted[sorted.length - 1] || null, rows: inP.length, lastUpdate: last };
  }
  function comparisonStatus(cur, cmp) {
    if (!cmp) return null;
    const a = cur && cur.presentDays > 0, b = cmp && cmp.presentDays > 0;
    if (a && b) return cur.coverage >= MIN_COVERAGE && cmp.coverage >= MIN_COVERAGE ? 'both_available' : 'partial_comparison';
    if (a) return 'current_only'; if (b) return 'comparison_only'; return 'neither_available';
  }

  /* ---------- motivos y acciones (texto específico) ---------- */
  const fmtP = (p) => (p ? `${p.start} a ${p.end}` : '');
  const R = {
    SOURCE_NOT_CONNECTED: { text: () => 'No hay datos de tráfico por dimensión: no se ha cargado un export de GA4 (ni archivo de Segmentos) y todavía no hay conexión directa con GA4.', action: 'IMPORT_GA4_SEGMENTS', todo: () => 'Carga el CSV exportado de GA4 en Carga de datos → Segmentos.' },
    DIMENSION_NOT_IN_QUERY: { text: (x) => `El export de GA4 cargado no trae la columna «${x.label}».`, action: 'ADD_DIMENSION_TO_EXPORT', todo: (x) => `Vuelve a exportar desde GA4 agregando «${x.label}» como fila y cárgalo.` },
    DIMENSION_NOT_IMPORTED: { text: (x) => `El archivo de Segmentos no trae la dimensión «${x.label}».`, action: 'IMPORT_DIMENSION', todo: (x) => `Agrega filas con dimensión «${x.label}» al archivo de Segmentos.` },
    NOT_IN_REQUESTED_PERIOD: { text: (x) => `«${x.label}» existe, pero no para el periodo elegido (${fmtP(x.current)}); los datos van de ${x.first} a ${x.last}.`, action: 'IMPORT_PERIOD', todo: () => 'Carga el export de ese periodo o elige un periodo con datos.' },
    CURRENT_PERIOD_MISSING: { text: (x) => `«${x.label}» solo existe en el periodo de comparación (${fmtP(x.comparison)}), no en el actual (${fmtP(x.current)}).`, action: 'IMPORT_CURRENT_PERIOD', todo: () => 'Carga el export de GA4 del periodo actual.' },
    EMPTY_VALUES: { text: (x) => `«${x.label}» viene en el archivo, pero todas sus filas del periodo están vacías o «Sin dato (not set)».`, action: 'REVIEW_TAGGING', todo: () => 'Revisa el etiquetado en GA4 (parámetros UTM, tipo de usuario).' },
    MOSTLY_EMPTY: { text: (x) => `«${x.label}» trae ${Math.round(x.emptyShare * 100)} % del tráfico sin dato.`, action: 'REVIEW_TAGGING', todo: () => 'Revisa el etiquetado en GA4 antes de sacar conclusiones.' },
    LOW_COVERAGE: { text: (x) => `«${x.label}» cubre ${x.cur.presentDays} de ${x.cur.expectedDays} días del periodo.`, action: 'IMPORT_MISSING_DAYS', todo: () => 'Carga los días que faltan.' },
    COMPARISON_PERIOD_MISSING: { text: (x) => `«${x.label}» está en el periodo actual, pero no hay datos de ${fmtP(x.comparison)} para comparar${x.comparison && x.comparison.kind === 'yoy' ? ' (contra plan, los segmentos se comparan con el mismo periodo del año anterior: no hay plan por segmento)' : ''}.`, action: 'IMPORT_COMPARISON_PERIOD', todo: (x) => `Carga el export de GA4 de ${fmtP(x.comparison)}${x.comparison && x.comparison.kind === 'yoy' ? ', o compara contra el periodo anterior' : ''}.` },
    SCHEMA_DIFFERENCE: { text: (x) => `«${x.label}» existe en los dos periodos, pero sus valores no coinciden (ningún segmento en común); no son comparables.`, action: 'HOMOLOGATE_VALUES', todo: () => 'Homologa los nombres en Configuración → Equivalencias o exporta con el mismo formato.' },
    PARTIAL_COMPARISON: { text: (x) => `El periodo de comparación de «${x.label}» cubre ${x.cmp.presentDays} de ${x.cmp.expectedDays} días.`, action: 'IMPORT_COMPARISON_DAYS', todo: () => 'Carga los días que faltan del periodo de comparación.' },
    CHANNEL_NOT_IN_GA4: { text: (x) => `«${x.label}» no aplica a WhatsApp ni Llamadas: GA4 solo mide el sitio y la app.`, action: 'NONE', todo: () => 'Elige Ecommerce, App o Total digital.' },
    PRODUCTS_NOT_LOADED: { text: (x) => `«${x.label}» sale de los archivos de Productos y no hay ninguno cargado.`, action: 'IMPORT_PRODUCT_SALES', todo: () => 'Carga la venta por producto en Categoría → Producto.' },
    NO_DATA_LOADED: { text: (x) => `No hay ${x.what} cargada.`, action: 'IMPORT_ACTUAL', todo: () => 'Carga la venta real en Carga de datos.' },
    COLUMN_NOT_IMPORTED: { text: (x) => `El archivo no trae «${x.label}» (todas las celdas están vacías).`, action: 'IMPORT_COLUMN', todo: (x) => `Agrega la columna «${x.label}».` },
    QUARANTINED_VALUES: { text: (x) => `${x.quarantined} ${x.quarantined === 1 ? 'celda de' : 'celdas de'} «${x.label}» ${x.quarantined === 1 ? 'está' : 'están'} en cuarentena (negativa o no numérica) y no ${x.quarantined === 1 ? 'suma' : 'suman'}.`, action: 'REVIEW_QUARANTINE', todo: () => 'Revisa Calidad de datos → Cuarentena.' },
    ALL_QUARANTINED: { text: (x) => `Todas las celdas de «${x.label}» del periodo están en cuarentena.`, action: 'REVIEW_QUARANTINE', todo: () => 'Revisa Calidad de datos → Cuarentena.' },
    MISSING_VALUES: { text: (x) => `${x.missing} ${x.missing === 1 ? 'fila del periodo no trae' : 'filas del periodo no traen'} «${x.label}».`, action: 'REVIEW_SOURCE_DATA', todo: () => 'Completa esos valores en el archivo.' },
    INCOMPLETE_DAYS: { text: (x) => `Faltan ${x.cur.missingDays} de ${x.cur.expectedDays} días del periodo.`, action: 'IMPORT_MISSING_DAYS', todo: () => 'Carga los días que faltan o revisa Calidad de datos → fechas faltantes.' },
    NON_ADDITIVE_EXCLUDED: { text: () => 'GA4 trae usuarios, pero no se pueden sumar entre filas ni días (una persona aparece en varias); se excluyen a propósito.', action: 'NONE', todo: () => 'Usa sesiones como volumen.' },
    DERIVATION_BLOCKED: { text: (x) => x.why, action: 'FIX_DEPENDENCY', todo: () => 'Corrige la métrica de la que depende.' }
  };
  const reason = (code, x) => ({ code, text: R[code].text(x), action: R[code].action, todo: R[code].todo(x) });

  /* ---------- caché ---------- */
  let cache = new Map(), sig = '';
  function signature(store) {
    const b = C().dataTypeIds.map((t) => S().batches(store, t).map((x) => x.id).join(',')).join('|');
    const pm = FP.productStore && FP.productStore.meta ? JSON.stringify(FP.productStore.meta.batches || 0) : '';
    return `${b}#${pm}`;
  }
  function memo(store, k, fn) { const s = signature(store); if (s !== sig) { cache = new Map(); sig = s; } if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); }

  /* ---------- acceso a segmentos por el índice del almacén (dimensión → fecha → registros), sin recorrer toda la colección ---------- */
  function segRange(store, dimName, channel, start, end) {
    const byDate = S().segmentIndex(store).byDim.get(dimName); const out = [];
    if (!byDate || !start) return out;
    const keep = (a) => { for (let k = 0; k < a.length; k++) if (channel === 'total' || a[k].channel === channel) out.push(a[k]); };
    const n = days(start, end);
    if (n <= byDate.size) { let d = start; for (let i = 0; i < n; i++) { const a = byDate.get(d); if (a) keep(a); d = addDays(d, 1); } }
    else byDate.forEach((a, d) => { if (d >= start && d <= end) keep(a); });
    return out;
  }
  function segBounds(store, dimName, channel) {
    const byDate = S().segmentIndex(store).byDim.get(dimName); if (!byDate) return null;
    let first = null, last = null;
    byDate.forEach((a, d) => { if (channel !== 'total' && !a.some((r) => r.channel === channel)) return; if (first === null || d < first) first = d; if (last === null || d > last) last = d; });
    return first === null ? null : { first, last };
  }

  /* ---------- dimensiones ---------- */
  function dimension(store, dim, { current, comparison = null, channel = 'total' } = {}) {
    return memo(store, `dim|${dim}|${JSON.stringify([current, comparison, channel])}`, () => {
      const label = DIM_LABEL[dim] || dim; const base = { field: dim, label, reasons: [] };
      const done = (status, codes, x = {}, extra = {}) => ({ ...base, status, reasons: codes.map((c) => reason(c, { label, current, comparison, ...x })), actions: codes.map((c) => R[c].action).filter((a) => a !== 'NONE'), ...extra });
      if (['category', 'geography', 'product_id'].includes(dim)) {
        const has = FP.productStore && FP.productStore.available && FP.productStore.available() && (FP.productStore.meta || {}).batches;
        return has ? { ...base, status: 'available', source: 'product_sales', reasons: [], actions: [] } : done('missing', ['PRODUCTS_NOT_LOADED'], {}, { source: 'product_sales' });
      }
      if (NON_GA4.includes(channel)) return done('not_applicable', ['CHANNEL_NOT_IN_GA4']);
      const bats = S().batches(store, 'segments');
      if (!S().latestList(store, 'segments').length) return done('unavailable_source', ['SOURCE_NOT_CONNECTED'], {}, { source: null });
      const ga4 = bats.some((b) => b.source === 'ga4-csv'); const source = ga4 ? 'ga4_segments' : 'segments_file';
      const bounds = segBounds(store, SEG_DIM[dim], channel);
      if (!bounds) return done('missing', [ga4 ? 'DIMENSION_NOT_IN_QUERY' : 'DIMENSION_NOT_IMPORTED'], {}, { source });
      const inCur0 = segRange(store, SEG_DIM[dim], channel, current.start, current.end);
      const inCmp0 = comparison ? segRange(store, SEG_DIM[dim], channel, comparison.start, comparison.end) : [];
      const cur = periodCoverage(inCur0, current, { batches: bats }); const cmp = comparison ? periodCoverage(inCmp0, comparison, { batches: bats }) : null;
      const comp = comparisonStatus(cur, cmp);
      const extra = { source, current: cur, comparison: cmp, comparisonStatus: comp, totalRows: cur.rows };
      if (!cur.rows && !(cmp && cmp.rows)) return done('incomplete_period', ['NOT_IN_REQUESTED_PERIOD'], { first: bounds.first, last: bounds.last }, extra);
      if (!cur.rows) return done('incomplete_period', ['CURRENT_PERIOD_MISSING'], {}, extra);
      const inCur = inCur0;
      const isEmpty = (r) => !r.segment || /^\s*(sin dato|\(not set\)|not set|\(other\))/i.test(r.segment);
      const tv = (r) => (r.metrics && r.metrics.trafficVolume && typeof r.metrics.trafficVolume.value === 'number' ? r.metrics.trafficVolume.value : 0);
      const totT = inCur.reduce((a, r) => a + tv(r), 0), emptyT = inCur.filter(isEmpty).reduce((a, r) => a + tv(r), 0);
      const availableRows = inCur.filter((r) => !isEmpty(r)).length;
      Object.assign(extra, { availableRows, coverage: cur.coverage, emptyShare: totT ? emptyT / totT : 0 });
      if (!availableRows) return done('invalid', ['EMPTY_VALUES'], {}, extra);
      const codes = [];
      if (extra.emptyShare > 0.5) codes.push('MOSTLY_EMPTY');
      if (cur.coverage < MIN_COVERAGE) codes.push('LOW_COVERAGE');
      if (comparison) {
        if (!cmp.rows) return done('non_comparable', ['COMPARISON_PERIOD_MISSING', ...codes], { cur, cmp }, extra);
        const keys = (rs) => new Set(rs.filter((r) => !isEmpty(r)).map((r) => r.segmentKey || r.segment));
        const kc = keys(inCur), kp = keys(inCmp0);
        // Solo en dimensiones de valores estables (dispositivo, medio, tipo de cliente): campañas y landings cambian de un periodo a otro
        if (['device', 'medium', 'customer_type'].includes(dim) && ![...kc].some((k) => kp.has(k))) return done('non_comparable', ['SCHEMA_DIFFERENCE', ...codes], { cur, cmp }, extra);
        if (cmp.coverage < MIN_COVERAGE) codes.push('PARTIAL_COMPARISON');
      }
      return done(codes.length ? 'partial' : 'available', codes, { cur, cmp, emptyShare: extra.emptyShare }, extra);
    });
  }

  /* ---------- métricas ---------- */
  const APP = { revenue: 'revenue', orders: 'orders', sessions: 'trafficVolume' };
  const MLABEL = { revenue: 'Venta', orders: 'Pedidos', sessions: 'Sesiones / volumen', aov: 'AOV', conversion_rate: 'Tasa de conversión', users: 'Usuarios', new_users: 'Usuarios nuevos', units: 'Unidades' };
  function metric(store, name, { current, comparison = null, channel = 'total', dataType = 'actual' } = {}) {
    return memo(store, `met|${name}|${dataType}|${JSON.stringify([current, comparison, channel])}`, () => {
      const label = MLABEL[name] || name; const base = { field: name, label };
      const done = (status, codes, x = {}, extra = {}) => ({ ...base, status, reasons: codes.map((c) => reason(c, { label, current, comparison, ...x })), actions: codes.map((c) => R[c].action).filter((a) => a !== 'NONE'), ...extra });
      if (name === 'users' || name === 'new_users') return done('not_applicable', ['NON_ADDITIVE_EXCLUDED']);
      if (name === 'units') return dimension(store, 'product_id', {}).status === 'available' ? { ...base, status: 'available', source: 'product_sales', reasons: [], actions: [] } : done('missing', ['PRODUCTS_NOT_LOADED']);
      const all = S().records(store, dataType).filter((r) => channel === 'total' || r.channel === channel);
      const what = dataType === 'actual' ? 'venta real' : dataType;
      if (!all.length) return done('unavailable_source', ['NO_DATA_LOADED'], { what });
      const bats = S().batches(store, dataType);
      const cur = periodCoverage(all, current, { batches: bats }); const cmp = comparison ? periodCoverage(all, comparison, { batches: bats }) : null;
      const inCur = all.filter((r) => r.date >= current.start && r.date <= current.end);
      const extra = { source: dataType, current: cur, comparison: cmp, comparisonStatus: comparisonStatus(cur, cmp), totalRows: inCur.length };
      if (name === 'aov' || name === 'conversion_rate') {
        if (!inCur.length) return done('incomplete_period', ['NOT_IN_REQUESTED_PERIOD'], { first: all.map((r) => r.date).sort()[0], last: all.map((r) => r.date).sort().pop() }, extra);
        const agg = FP.derivations.fromRecords(inCur); const d = agg[name];
        if (d.status === 'derived') return { ...base, status: 'derived', value: d.value, provenance: { type: 'derived', formula: d.formula, dependencies: d.dependencies }, reasons: [], actions: [], ...extra };
        return done('unavailable', ['DERIVATION_BLOCKED'], { why: d.reasons.map((r) => r.text).join(' ') }, { ...extra, derivation: d });
      }
      const k = APP[name];
      if (!inCur.length) return done('incomplete_period', ['NOT_IN_REQUESTED_PERIOD'], { first: all.map((r) => r.date).sort()[0], last: all.map((r) => r.date).sort().pop() }, extra);
      let obs = 0, q = 0, miss = 0;
      inCur.forEach((r) => { const c = r.metrics[k]; if (!c || c.source === 'missing') miss++; else if (c.source === 'quarantined') q++; else if (c.source === 'observed') obs++; });
      Object.assign(extra, { availableRows: obs, coverage: inCur.length ? obs / inCur.length : 0 });
      if (!obs && q) return done('quarantined', ['ALL_QUARANTINED'], {}, extra);
      if (!obs) return done('missing', ['COLUMN_NOT_IMPORTED'], {}, extra);
      const codes = [];
      if (q) codes.push('QUARANTINED_VALUES');
      if (miss) codes.push('MISSING_VALUES');
      if (cur.coverage < 0.95) codes.push('INCOMPLETE_DAYS');
      const status = codes.includes('INCOMPLETE_DAYS') && codes.length === 1 ? 'incomplete_period' : codes.length ? 'partial' : 'available';
      return done(status, codes, { quarantined: q, missing: miss, cur }, extra);
    });
  }

  /* ---------- matriz de compatibilidad de análisis (configuración, no condicionales dispersos) ---------- */
  const ANALYSES = [
    { id: 'revenue_trend', label: 'Tendencia de venta', requires: ['revenue'] },
    { id: 'sessions_trend', label: 'Tendencia de tráfico', requires: ['sessions'] },
    { id: 'conversion', label: 'Conversión', requires: ['orders', 'sessions', 'conversion_rate'] },
    { id: 'aov', label: 'Ticket promedio', requires: ['revenue', 'orders', 'aov'] },
    { id: 'channel_performance', label: 'Desempeño por canal', requires: ['revenue'], channelScope: true },
    { id: 'device_performance', label: 'Desempeño por dispositivo', requires: ['device'], segments: true },
    { id: 'source_performance', label: 'Desempeño por fuente y medio', requires: ['source', 'medium'], segments: true },
    { id: 'campaign_performance', label: 'Desempeño por campaña', requires: ['campaign'], segments: true },
    { id: 'landing_performance', label: 'Desempeño por landing', requires: ['landing_page'], segments: true },
    { id: 'customer_type_performance', label: 'Nuevos y recurrentes', requires: ['customer_type'], segments: true },
    { id: 'product_performance', label: 'Desempeño por producto y categoría', requires: ['product_id', 'category'] },
    { id: 'previous_period_comparison', label: 'Comparación contra el periodo anterior', requires: ['revenue'], compare: 'previous' },
    { id: 'yoy_comparison', label: 'Comparación interanual', requires: ['revenue'], compare: 'yoy' }
  ];
  const DIMS = ['device', 'source', 'medium', 'campaign', 'landing_page', 'customer_type', 'category', 'geography', 'product_id'];
  const RANK = { available: 0, derived: 0, not_applicable: 1, partial: 2, incomplete_period: 2, quarantined: 3, non_comparable: 3, invalid: 4, unavailable: 5, missing: 5, unavailable_source: 5 };
  function analyses(store, ctx) {
    return ANALYSES.map((a) => {
      const cmpP = a.compare ? comparisonPeriod(ctx.current, a.compare) : (a.segments && ctx.comparisonKind ? comparisonPeriod(ctx.current, ctx.comparisonKind) : null);
      const res = a.requires.map((f) => (DIMS.includes(f) ? dimension(store, f, { current: ctx.current, comparison: cmpP, channel: ctx.channel }) : metric(store, f, { current: ctx.current, comparison: cmpP, channel: ctx.channel })));
      let status = res.reduce((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'available');
      const comp = a.compare ? (res[0].comparisonStatus || null) : (res.find((r) => r.comparisonStatus) || {}).comparisonStatus || null;
      if (a.compare && comp && comp !== 'both_available') status = comp === 'partial_comparison' ? 'partial' : 'non_comparable';
      const rec = res.flatMap((r) => r.reasons || []);
      if (a.compare && comp && comp !== 'both_available') rec.push({ code: 'COMPARISON', text: comp === 'current_only' ? `No hay datos de ${fmtP(cmpP)} para comparar.` : comp === 'comparison_only' ? `No hay datos del periodo actual (${fmtP(ctx.current)}).` : comp === 'partial_comparison' ? `La comparación tiene cobertura incompleta (${fmtP(cmpP)}).` : 'No hay datos en ninguno de los dos periodos.', action: 'IMPORT_COMPARISON_PERIOD', todo: `Carga la venta real de ${fmtP(cmpP)}.` });
      const seen = new Set(); const recommendations = rec.filter((r) => { const k = r.code + r.text; if (seen.has(k)) return false; seen.add(k); return true; });
      return { analysis: a.id, label: a.label, status: status === 'derived' ? 'available' : status, requiredFields: a.requires,
        missingFields: res.filter((r) => ['missing', 'unavailable_source', 'unavailable'].includes(r.status)).map((r) => r.field),
        invalidFields: res.filter((r) => ['invalid', 'quarantined'].includes(r.status)).map((r) => r.field),
        partialFields: res.filter((r) => ['partial', 'incomplete_period', 'non_comparable'].includes(r.status)).map((r) => r.field),
        comparisonStatus: comp, comparisonPeriod: cmpP, recommendations };
    });
  }

  FP.availability = { MIN_COVERAGE, comparisonPeriod, periodCoverage, comparisonStatus, dimension, metric, analyses, ANALYSES, REASONS: R, DIM_LABEL, clearCache: () => { cache = new Map(); sig = ''; } };
})(typeof window !== 'undefined' ? window : globalThis);
