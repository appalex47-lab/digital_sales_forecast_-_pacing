/**
 * coverage.js — Cobertura y resumen de calidad (Fase 1).
 *
 * Cobertura = qué tan completo está el dato, sin juzgar si es correcto.
 *  - Temporal: días con al menos un registro vs días del rango (inicio → fin).
 *  - Por canal: días con registro de ese canal vs días del rango.
 *  - Por métrica: % de registros con valor (observado o calculado);
 *    se separa cuánto es observado, porque la estacionalidad debe apoyarse
 *    en datos reales y no en derivados.
 *
 * Falta de dato ≠ cero: un registro con venta 0 cuenta como cubierto;
 * una celda vacía no.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const Cal = () => FP.calendar;
  const S = () => FP.dataStore;
  const safePct = (a, b) => FP.metrics.safeDivide(a, b);

  /**
   * Cobertura de una lista de registros canónicos (un tipo de dato).
   * Una sola pasada sobre los registros y otra sobre los vigentes (sin copiar el arreglo, sin ordenar todas las fechas, sin un
   * arreglo por métrica): con 1.3 millones de registros el cálculo anterior tardaba ~2.6 s. Los resultados son idénticos.
   * @param {object[]} records  todos los registros
   * @param {object[]} [uniqList]  los vigentes (el último de cada llave); si no se da, se calculan
   */
  function computeCoverage(records, uniqList = null) {
    const channelIds = C().channelIds, metricKeys = C().metricKeys;
    const daySet = new Set(); const perChannel = {}; channelIds.forEach((id) => { perChannel[id] = new Set(); });
    let start = null, end = null, n = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.date || !r.channel) continue;
      n++;
      const d = r.date;
      if (start === null || d < start) start = d;
      if (end === null || d > end) end = d;   // «AAAA-MM-DD» se ordena igual como texto que como fecha
      daySet.add(d);
      perChannel[r.channel].add(d);
    }
    if (!n) {
      return { start: null, end: null, expectedDays: 0, availableDays: 0, pct: null, missingDates: [],
        byChannel: channelIds.map((id) => ({ channel: id, days: 0, expectedDays: 0, pct: null, missingDays: 0 })),
        byMetric: metricKeys.map((k) => ({ metric: k, present: 0, observed: 0, total: 0, pct: null, observedPct: null })),
        missingChannels: [...channelIds], datesWithMissingChannels: 0, zeroRevenueRecords: 0 };
    }
    const range = Cal().eachDay(start, end);
    const expectedDays = range.length;
    const missingDates = range.filter((d) => !daySet.has(d));
    const datesWithMissingChannels = range.filter((d) => daySet.has(d) && channelIds.some((id) => !perChannel[id].has(d))).length;

    // Un registro por llave para no inflar cobertura con duplicados
    let uniq = uniqList;
    if (!uniq) { const unique = new Map(); for (let i = 0; i < records.length; i++) { const r = records[i]; if (r.date && r.channel) unique.set(r.key, r); } uniq = [...unique.values()]; }
    const present = new Array(metricKeys.length).fill(0), observed = new Array(metricKeys.length).fill(0);
    let total = 0, zeroRevenue = 0;
    for (let i = 0; i < uniq.length; i++) {
      const r = uniq[i];
      if (!r.date || !r.channel) continue;
      total++;
      for (let m = 0; m < metricKeys.length; m++) {
        const c = r.metrics[metricKeys[m]];
        if (c.value !== null) present[m]++;
        if (c.source === 'observed') observed[m]++;
      }
      if (r.metrics.revenue.value === 0) zeroRevenue++;
    }
    return {
      start, end, expectedDays,
      availableDays: daySet.size,
      pct: safePct(daySet.size, expectedDays),
      missingDates,
      byChannel: channelIds.map((id) => ({
        channel: id,
        days: perChannel[id].size,
        expectedDays,
        pct: safePct(perChannel[id].size, expectedDays),
        missingDays: expectedDays - perChannel[id].size
      })),
      byMetric: metricKeys.map((k, m) => ({ metric: k, present: present[m], observed: observed[m], total, pct: safePct(present[m], total), observedPct: safePct(observed[m], total) })),
      missingChannels: channelIds.filter((id) => perChannel[id].size === 0),
      datesWithMissingChannels,
      zeroRevenueRecords: zeroRevenue
    };
  }

  /**
   * Resumen de calidad de una colección.
   * status:
   *  - 'empty'    sin datos
   *  - 'invalid'  hay filas rechazadas o registros importados con errores → DATOS NO VÁLIDOS
   *  - 'warnings' advertencias, duplicados, fechas o canales faltantes     → DATOS CON ADVERTENCIAS
   *  - 'ready'    todo lo anterior en cero                                   → DATOS LISTOS
   */
  function summarizeCollection(store, dataType) {
    // en memoria por firma de la colección: recorrerla toda (ordenar fechas, agrupar duplicados) tardaba ~2.6 s con 1.3 millones de registros
    return FP.dataStore.cached(store, `coverage:${dataType}`, [dataType], () => summarizeCollectionRaw(store, dataType));
  }
  function summarizeCollectionRaw(store, dataType) {
    const recs = S().records(store, dataType);
    const bats = S().batches(store, dataType);
    const uniq = S().latestList(store, dataType);                    // vigentes (el último de cada llave): se comparte con Segmentos y el Diagnóstico
    const coverage = computeCoverage(recs, uniq);
    // duplicados: registros de más = todos − vigentes. El agrupamiento por llave (un arreglo por llave) solo se hace si los hay.
    const duplicateRecords = recs.length - uniq.length;
    const duplicateKeys = duplicateRecords > 0 ? S().findDuplicates(store, dataType).length : 0;
    const rowsRead = bats.reduce((a, b) => a + b.rowCount, 0);
    const rejected = bats.reduce((a, b) => a + b.rejected, 0);
    let valid = 0, warning = 0, error = 0, quarantined = 0;          // una sola pasada para los cuatro conteos
    for (let i = 0; i < recs.length; i++) { const st = recs[i].status; if (st === 'valid') valid++; else if (st === 'warning') warning++; else if (st === 'error') error++; else if (st === 'quarantined') quarantined++; }
    const issues = bats.flatMap((b) => b.issues);
    const out = {
      dataType,
      label: C().dataTypes[dataType].label,
      files: bats.length,
      rowsRead,
      imported: recs.length,
      rejected,
      valid, warning, error, quarantined,
      duplicateKeys,
      duplicateRecords,
      missingDates: coverage.missingDates.length,
      missingChannels: coverage.missingChannels.length,
      datesWithMissingChannels: coverage.datesWithMissingChannels,
      issueCounts: { error: issues.filter((i) => i.severity === 'error').length, warning: issues.filter((i) => i.severity === 'warning').length },
      issuesByType: issues.reduce((acc, i) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc; }, {}),
      coverage
    };
    // Segmentos (Fase 5) son un desglose opcional de periodos elegidos: los huecos de fechas no degradan el estado.
    out.status = statusOf(dataType === 'segments' ? { ...out, missingDates: 0, missingChannels: 0, datesWithMissingChannels: 0 } : out);
    return out;
  }

  function statusOf(s) {
    if (!s.rowsRead && !s.imported) return 'empty';
    if (s.rejected > 0 || s.error > 0) return 'invalid';
    if (s.warning > 0 || s.quarantined > 0 || s.duplicateKeys > 0 || s.missingDates > 0 || s.missingChannels > 0 || s.datesWithMissingChannels > 0) return 'warnings';
    return 'ready';
  }

  const STATUS_TEXT = {
    empty: 'Sin datos',
    invalid: 'Datos no válidos',
    warnings: 'Datos con advertencias',
    ready: 'Datos listos'
  };

  /** Resumen global: el peor estado entre colecciones con datos. */
  function summarize(store) {
    const base = FP.dataStore.cached(store, 'coverage:all', C().dataTypeIds, () => summarizeRaw(store));
    return { ...base, generatedAt: new Date().toISOString() };   // la marca de hora se renueva en cada llamada (la usa el export de calidad)
  }
  function summarizeRaw(store) {
    const byType = {};
    C().dataTypeIds.forEach((t) => { byType[t] = summarizeCollection(store, t); });
    const list = Object.values(byType);
    const sum = (k) => list.reduce((a, s) => a + s[k], 0);
    const order = ['invalid', 'warnings', 'ready'];
    const present = list.filter((s) => s.status !== 'empty');
    const status = present.length ? order.find((st) => present.some((s) => s.status === st)) : 'empty';
    return {
      generatedAt: new Date().toISOString(),
      status, statusText: STATUS_TEXT[status],
      totals: {
        files: sum('files'), rowsRead: sum('rowsRead'), imported: sum('imported'), rejected: sum('rejected'),
        valid: sum('valid'), warning: sum('warning'), error: sum('error'),
        duplicateKeys: sum('duplicateKeys'), missingDates: sum('missingDates'), missingChannels: sum('missingChannels')
      },
      byType
    };
  }

  FP.coverage = { computeCoverage, summarizeCollection, summarize, STATUS_TEXT };
})(typeof window !== 'undefined' ? window : globalThis);
