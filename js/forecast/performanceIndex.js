/**
 * performanceIndex.js — Índices de desempeño (Fase 3).
 *
 *   índice = actual ÷ plan, sobre los MISMOS días comparables de la ventana.
 *
 * - Venta, pedidos y volumen: Σactual ÷ Σplan.
 * - CR: (Σpedidos ÷ Σvolumen) real ÷ el mismo cociente del plan. AOV: igual con venta ÷ pedidos.
 *   Nunca se promedian ratios diarios.
 * - Día comparable: día contado (≤ cutoff, con real) donde plan y real tienen los componentes
 *   de la métrica.
 * - Suficiencia: al menos `minComparableDays` y `minWindowCoverage` de los días de la ventana.
 *   Si no, status 'insufficient_data' y value null (nunca 0 ni 1 por defecto).
 *
 * Ventanas (config.forecast.windows): ytd, month, last7, last14, last28. Todas terminan en el
 * cutoff. La app muestra todas; no decide cuál es la "correcta".
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const Cal = () => FP.calendar;

  const COMPONENTS = {
    revenue: ['revenue'], orders: ['orders'], trafficVolume: ['trafficVolume'],
    conversionRate: ['orders', 'trafficVolume'], aov: ['revenue', 'orders']
  };

  const has = (b, keys) => b && keys.every((k) => M().isFiniteNumber(b[k]));

  /** Rango [from, to] de una ventana, recortado al año del análisis. */
  function windowRange(windowId, cutoff, year) {
    if (!cutoff) return null;
    const w = C().forecast.windows[windowId];
    if (!w) return null;
    const yStart = `${year}-01-01`;
    if (cutoff < yStart) return null;
    const to = cutoff > `${year}-12-31` ? `${year}-12-31` : cutoff;
    let from;
    if (windowId === 'ytd') from = yStart;
    else if (windowId === 'month') from = `${to.slice(0, 7)}-01`;
    else from = Cal().toISODate(Cal().addDays(Cal().parseDate(to), 1 - w.days));
    if (from < yStart) from = yStart;
    return { from, to, days: Cal().eachDay(from, to).length };
  }

  /**
   * @param {Array} rows   filas diarias { date, counted, plan, actual }
   * @param {object} p     { metric, from, to, windowDays, settings }
   */
  function calculatePerformanceIndex(rows, { metric = 'revenue', from, to, windowDays = null, settings = {} }) {
    const cfg = { ...C().forecast, ...settings };
    const comps = COMPONENTS[metric];
    const inWin = rows.filter((r) => r.date >= from && r.date <= to);
    const comparable = inWin.filter((r) => r.counted && has(r.plan, comps) && has(r.actual, comps));
    const sum = (s, k) => comparable.reduce((a, r) => a + r[s][k], 0);
    const total = windowDays || inWin.length;
    const coverage = M().safeDivide(comparable.length, total);
    let actual = null, plan = null;
    if (comparable.length) {
      if (metric === 'conversionRate') { actual = M().calculateConversionRate(sum('actual', 'orders'), sum('actual', 'trafficVolume')); plan = M().calculateConversionRate(sum('plan', 'orders'), sum('plan', 'trafficVolume')); }
      else if (metric === 'aov') { actual = M().calculateAOV(sum('actual', 'revenue'), sum('actual', 'orders')); plan = M().calculateAOV(sum('plan', 'revenue'), sum('plan', 'orders')); }
      else { actual = sum('actual', metric); plan = sum('plan', metric); }
    }
    const enough = comparable.length >= cfg.minComparableDays && coverage !== null && coverage >= cfg.minWindowCoverage;
    const value = enough ? M().safeDivide(actual, plan) : null;
    return {
      metric, from, to,
      value,
      status: value === null ? 'insufficient_data' : 'ok',
      comparableDays: comparable.length, windowDays: total, coverage,
      actual, plan,
      note: value !== null ? null : !comparable.length ? 'Sin días comparables en la ventana.'
        : !enough ? `Solo ${comparable.length} de ${total} días comparables (mínimo ${cfg.minComparableDays} y ${Math.round(cfg.minWindowCoverage * 100)} %).`
        : 'El plan de la ventana es 0: el índice no se puede calcular.'
    };
  }

  /** Todos los índices: { ventana: { métrica: resultado } }. */
  function calculateAllIndices(rows, { cutoff, year, settings = {} }) {
    const out = {};
    Object.keys(C().forecast.windows).forEach((w) => {
      const range = windowRange(w, cutoff, year);
      out[w] = {};
      C().metricKeys.forEach((m) => {
        out[w][m] = range
          ? { window: w, ...calculatePerformanceIndex(rows, { metric: m, from: range.from, to: range.to, windowDays: range.days, settings }) }
          : { window: w, metric: m, value: null, status: 'insufficient_data', comparableDays: 0, windowDays: 0, coverage: null, note: 'La fecha de referencia es anterior al año.' };
      });
    });
    return out;
  }

  FP.performanceIndex = { COMPONENTS, windowRange, calculatePerformanceIndex, calculateAllIndices };
})(typeof window !== 'undefined' ? window : globalThis);
