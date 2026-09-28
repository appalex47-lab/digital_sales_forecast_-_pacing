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

  /** Cobertura de una lista de registros canónicos (un tipo de dato). */
  function computeCoverage(records) {
    const dated = records.filter((r) => r.date && r.channel);
    if (!dated.length) {
      return { start: null, end: null, expectedDays: 0, availableDays: 0, pct: null, missingDates: [],
        byChannel: C().channelIds.map((id) => ({ channel: id, days: 0, expectedDays: 0, pct: null, missingDays: 0 })),
        byMetric: C().metricKeys.map((k) => ({ metric: k, present: 0, observed: 0, total: 0, pct: null, observedPct: null })),
        missingChannels: [...C().channelIds], datesWithMissingChannels: 0, zeroRevenueRecords: 0 };
    }
    const dates = dated.map((r) => r.date).sort();
    const start = dates[0], end = dates[dates.length - 1];
    const range = Cal().eachDay(start, end);
    const expectedDays = range.length;

    const daySet = new Set(dates);
    const perChannel = {};
    C().channelIds.forEach((id) => { perChannel[id] = new Set(); });
    dated.forEach((r) => perChannel[r.channel].add(r.date));

    const missingDates = range.filter((d) => !daySet.has(d));
    const datesWithMissingChannels = range.filter((d) => daySet.has(d) && C().channelIds.some((id) => !perChannel[id].has(d))).length;

    // Un registro por llave para no inflar cobertura con duplicados
    const unique = new Map();
    dated.forEach((r) => unique.set(r.key, r));
    const uniq = [...unique.values()];

    return {
      start, end, expectedDays,
      availableDays: daySet.size,
      pct: safePct(daySet.size, expectedDays),
      missingDates,
      byChannel: C().channelIds.map((id) => ({
        channel: id,
        days: perChannel[id].size,
        expectedDays,
        pct: safePct(perChannel[id].size, expectedDays),
        missingDays: expectedDays - perChannel[id].size
      })),
      byMetric: C().metricKeys.map((k) => {
        const present = uniq.filter((r) => r.metrics[k].value !== null).length;
        const observed = uniq.filter((r) => r.metrics[k].source === 'observed').length;
        return { metric: k, present, observed, total: uniq.length, pct: safePct(present, uniq.length), observedPct: safePct(observed, uniq.length) };
      }),
      missingChannels: C().channelIds.filter((id) => perChannel[id].size === 0),
      datesWithMissingChannels,
      zeroRevenueRecords: uniq.filter((r) => r.metrics.revenue.value === 0).length
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
    const recs = S().records(store, dataType);
    const bats = S().batches(store, dataType);
    const coverage = computeCoverage(recs);
    const dups = S().findDuplicates(store, dataType);
    const rowsRead = bats.reduce((a, b) => a + b.rowCount, 0);
    const rejected = bats.reduce((a, b) => a + b.rejected, 0);
    const valid = recs.filter((r) => r.status === 'valid').length;
    const warning = recs.filter((r) => r.status === 'warning').length;
    const error = recs.filter((r) => r.status === 'error').length;
    const issues = bats.flatMap((b) => b.issues);
    const out = {
      dataType,
      label: C().dataTypes[dataType].label,
      files: bats.length,
      rowsRead,
      imported: recs.length,
      rejected,
      valid, warning, error,
      duplicateKeys: dups.length,
      duplicateRecords: dups.reduce((a, g) => a + g.records.length - 1, 0),
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
    if (s.warning > 0 || s.duplicateKeys > 0 || s.missingDates > 0 || s.missingChannels > 0 || s.datesWithMissingChannels > 0) return 'warnings';
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
