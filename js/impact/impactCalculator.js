/**
 * impactCalculator.js — Impacto SIMULADO de un escenario (Fase 6).
 *
 * Solo transforma el resultado de FP.scenarioEngine.simulate en la estructura del brief. No calcula
 * nada nuevo: las cifras vienen de la simulación. El impacto simulado nunca se mezcla con el observado
 * (FP.impactMeasurement).
 *
 *   { metric, baseline, scenarioValue, incrementalValue, gapBefore, gapAfter, recoveryPercent, assumptions,
 *     byMetric: { revenue, orders, trafficVolume, conversionRate, aov }, kind: 'simulated' }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  function expectedImpact(result, metric = 'revenue') {
    if (!result || !result.valid) return null;
    const byMetric = {};
    C().metricKeys.forEach((k) => {
      const b = result.base ? result.base[k] : null, s = result.scenario ? result.scenario[k] : null;
      byMetric[k] = { baseline: b, scenarioValue: s,
        incrementalValue: Number.isFinite(b) && Number.isFinite(s) ? s - b : null,
        incrementalPct: Number.isFinite(b) && Number.isFinite(s) && b !== 0 ? s / b - 1 : null };
    });
    const g = result.gap;
    return {
      kind: 'simulated',
      metric, baseline: byMetric[metric].baseline, scenarioValue: byMetric[metric].scenarioValue,
      incrementalValue: byMetric[metric].incrementalValue,
      gapBefore: g.gapBefore, gapAfter: g.gapAfter, recoveryPercent: g.recoveryPercent, remainingPercent: g.remainingPercent,
      digitalIncremental: result.digital ? result.digital.incremental.revenue : null,
      byMetric,
      assumptions: result.assumptions || []
    };
  }

  FP.impactCalculator = { expectedImpact };
})(typeof window !== 'undefined' ? window : globalThis);
