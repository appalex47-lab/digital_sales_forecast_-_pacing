/**
 * gap.js — Capa explícita de gap (Fase 3).
 *
 *   gap          = actual − plan
 *   gapPct       = (actual − plan) / plan
 *   compliance   = actual / plan               (cumplimiento)
 *   forecastGap  = forecast − plan              (gap esperado al cierre)
 *
 * "Gap contra plan" (lo ocurrido) y "gap esperado al cierre" (lo proyectado) son
 * conceptos distintos y viven en campos distintos. Toda división usa safeDivide:
 * nunca NaN ni Infinity (plan 0 → gapPct y compliance null).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const M = () => FP.metrics;

  /** Gap de `actual` contra `plan`. Reutiliza metrics.calcGap (Fase 0). */
  function calculateGap(plan, actual) {
    const g = M().calcGap(plan, actual);
    return { plan: g.reference, actual: g.value, gap: g.abs, gapPct: g.pct, compliance: g.attainment };
  }

  /** Gap esperado al cierre: forecast contra plan del periodo completo. */
  function calculateForecastGap(plan, forecast) {
    const g = M().calcGap(plan, forecast);
    return { plan: g.reference, forecast: g.value, gap: g.abs, gapPct: g.pct, attainment: g.attainment };
  }

  /**
   * Estado de pacing por cumplimiento. Solo describe la matemática; no juzga causas.
   * @returns 'above' | 'on_plan' | 'below' | 'insufficient_data'
   */
  function pacingStatus(compliance, thresholds = FP.config.forecast.pacingThresholds) {
    if (!M().isFiniteNumber(compliance)) return 'insufficient_data';
    if (compliance >= thresholds.aboveFrom) return 'above';
    if (compliance >= thresholds.onPlanFrom) return 'on_plan';
    return 'below';
  }

  /**
   * Capa de gap de un canal (o total) a partir de las filas de pacing del motor.
   * @param {object} p { days, months, annual } (ver forecastEngine)
   */
  function buildGapLayer({ days, months, annual }, metric = 'revenue') {
    return {
      metric,
      dailyGap: days.filter((d) => d.counted).map((d) => ({ date: d.date, ...pick(d.pacing[metric], ['plan', 'actual', 'gap', 'gapPct', 'compliance']) })),
      cumulativeGap: days.filter((d) => d.counted).map((d) => ({ date: d.date, ...pick(d.cumulative[metric], ['plan', 'actual', 'gap', 'compliance']) })),
      monthlyGap: months.map((m) => ({ month: m.key, toDate: m.toDate[metric], forecastGap: m.forecastGap[metric] })),
      annualGap: annual.toDate[metric],
      forecastGap: annual.forecastGap[metric]
    };
  }

  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o ? o[k] : null]));

  FP.gap = { calculateGap, calculateForecastGap, pacingStatus, buildGapLayer };
})(typeof window !== 'undefined' ? window : globalThis);
