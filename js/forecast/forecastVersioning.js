/**
 * forecastVersioning.js — Snapshots de forecast, cambio y accuracy (Fase 3).
 *
 * Cada vez que el usuario guarda, se crea una versión NUEVA e inmutable (congelada):
 *   { forecastVersion: 'v1', generatedAt, referenceDate, cutoff, method, assumptions, results }
 * Nunca se sobrescribe una versión anterior. Se guardan por año en `forecasts:<año>`.
 *
 * Forecast Change: forecast actual vs la última versión guardada (del mismo método si existe).
 *
 * Accuracy (preparado): para cada versión se evalúan SOLO los meses que no estaban cerrados
 * en su fecha de corte y que hoy ya cerraron completos. Así nunca se usa información que no
 * estaba disponible al generar el forecast. Métricas: error, APE, MAPE, bias, accuracy = 1 − MAPE.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;

  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  function createForecastRegistry(year) { return { year, versions: [] }; }

  const pickBlock = (b) => (b ? { revenue: b.revenue, orders: b.orders, trafficVolume: b.trafficVolume, conversionRate: b.conversionRate, aov: b.aov } : null);

  function seriesResults(s) {
    return {
      annual: s.annual ? { plan: pickBlock(s.annual.plan), actualToDate: pickBlock(s.annual.actualToDate), planToDate: pickBlock(s.annual.planToDate),
        forecast: pickBlock(s.annual.forecast), forecastGapRevenue: s.annual.forecastGap.revenue } : null,
      months: s.months.map((m) => ({ key: m.key, status: m.status, plan: pickBlock(m.plan), actualToDate: pickBlock(m.actualToDate), forecast: pickBlock(m.forecast) })),
      confidence: s.confidence || null
    };
  }

  /** Crea una versión inmutable a partir de una corrida del motor. */
  function createSnapshot(registry, run) {
    const n = registry.versions.length + 1;
    const v = {
      id: `forecast-${run.year}-v${n}`,
      forecastVersion: `v${n}`,
      generatedAt: new Date().toISOString(),
      referenceDate: run.referenceDate,
      cutoff: run.cutoff,
      todayStatus: run.todayStatus,
      algorithmVersion: run.algorithmVersion,
      method: { id: run.method.id, label: run.method.label },
      plan: run.plan,
      assumptions: {
        byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, run.channels[ch].assumptions])),
        settings: { recentWindow: run.settings.recentWindow, driverWindows: run.settings.driverWindows, useHistoricalAsActual: run.settings.useHistoricalAsActual,
          minComparableDays: run.settings.minComparableDays, minWindowCoverage: run.settings.minWindowCoverage }
      },
      results: {
        total: seriesResults(run.total),
        byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, seriesResults(run.channels[ch])]))
      }
    };
    registry.versions.push(deepFreeze(v));
    return v;
  }

  function hydrateForecastRegistry(raw, year) {
    if (!raw || !Array.isArray(raw.versions)) return createForecastRegistry(year);
    return { year: raw.year, versions: raw.versions.map((v) => deepFreeze(v)) };
  }

  /** Última versión guardada (preferentemente del mismo método). */
  function previousVersion(registry, methodId) {
    if (!registry || !registry.versions.length) return null;
    const same = registry.versions.filter((v) => v.method.id === methodId);
    return (same.length ? same : registry.versions)[(same.length ? same : registry.versions).length - 1];
  }

  /**
   * Forecast Change: forecast actual − versión anterior, venta anual por canal y total.
   * @returns null si no hay versiones.
   */
  function forecastChange(registry, run) {
    const prev = previousVersion(registry, run.method.id);
    if (!prev) return null;
    const row = (cur, old) => {
      const a = cur && cur.annual && cur.annual.forecast ? cur.annual.forecast.revenue : null;
      const b = old && old.annual && old.annual.forecast ? old.annual.forecast.revenue : null;
      const g = M().calcGap(b, a);
      return { current: a, previous: b, change: g.abs, changePct: g.pct };
    };
    return {
      previous: { id: prev.id, forecastVersion: prev.forecastVersion, generatedAt: prev.generatedAt, referenceDate: prev.referenceDate, method: prev.method },
      sameMethod: prev.method.id === run.method.id,
      total: row(run.total, prev.results.total),
      byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, row(run.channels[ch], prev.results.byChannel[ch])]))
    };
  }

  /**
   * Accuracy por versión, sin fuga de información futura.
   * @returns [{ id, forecastVersion, referenceDate, evaluatedMonths, mape, bias, accuracy, status, detail }]
   */
  function accuracy(registry, run, channel = 'total') {
    if (!registry) return [];
    const nowSeries = channel === 'total' ? run.total : run.channels[channel];
    const closedNow = new Map(nowSeries.months.filter((m) => m.status === 'closed' && m.missingActualDays === 0 && m.actualToDate)
      .map((m) => [m.key, m.actualToDate.revenue]));
    return registry.versions.filter((v) => v.referenceDate < run.referenceDate).map((v) => {
      const res = channel === 'total' ? v.results.total : v.results.byChannel[channel];
      const detail = (res ? res.months : [])
        .filter((m) => m.status !== 'closed' && closedNow.has(m.key) && m.forecast && M().isFiniteNumber(m.forecast.revenue))
        .map((m) => {
          const actual = closedNow.get(m.key);
          const error = m.forecast.revenue - actual;
          return { month: m.key, forecast: m.forecast.revenue, actual, error, ape: M().safeDivide(Math.abs(error), actual) };
        });
      const apes = detail.map((d) => d.ape).filter(M().isFiniteNumber);
      const mape = apes.length ? apes.reduce((a, b) => a + b, 0) / apes.length : null;
      const sumA = detail.reduce((a, d) => a + d.actual, 0);
      const bias = detail.length ? M().safeDivide(detail.reduce((a, d) => a + d.error, 0), sumA) : null;
      return { id: v.id, forecastVersion: v.forecastVersion, referenceDate: v.referenceDate, method: v.method,
        evaluatedMonths: detail.length, mape, bias, accuracy: mape === null ? null : 1 - mape,
        status: detail.length ? 'ok' : 'insufficient_data', detail };
    });
  }

  FP.forecastVersioning = { createForecastRegistry, createSnapshot, hydrateForecastRegistry, previousVersion, forecastChange, accuracy };
})(typeof window !== 'undefined' ? window : globalThis);
