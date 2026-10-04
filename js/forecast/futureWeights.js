/**
 * futureWeights.js — Pesos futuros para el reforecast (Fase 4).
 *
 * Arquitectura:  Seasonality Engine (Fase 2) → Plan distribuido → Future Weights → Reforecast Engine
 *
 * El reforecast NO recalcula estacionalidad. El plan original distribuido ya es la salida del motor
 * de estacionalidad: plan_día = meta_mes × peso_diario_normalizado, y la meta de cada mes sale del
 * peso mensual. Por eso el peso futuro de un día es su venta en el plan original:
 *
 *   peso_futuro(d) = plan_original(d).venta
 *   peso_normalizado(d) = peso_futuro(d) / Σ peso_futuro(días futuros del periodo)
 *
 * Normalizar sobre los días restantes de un mes reproduce exactamente los pesos diarios de Fase 2;
 * sobre el resto del año incluye también los pesos mensuales.
 * Cada peso conserva la fuente y confianza de la celda del plan (historical_seasonality, fallback,
 * explicit_plan…). Si el plan viene de planData importado (sin plan distribuido), la fuente es
 * 'explicit_plan' y no hay confianza de estacionalidad.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;

  const cache = new WeakMap();

  /** Celdas del plan original navegables (fromVersion), en caché por objeto de versión. */
  function planCells(planVersion) {
    if (!planVersion) return null;
    if (!cache.has(planVersion)) cache.set(planVersion, FP.planning.fromVersion(planVersion));
    return cache.get(planVersion);
  }

  /**
   * @param {object} p { planVersion (opcional), channel, days (filas del forecast con date y plan) }
   * @returns Map date → { weight, source, confidence }
   */
  function futureWeights({ planVersion = null, channel, days }) {
    const out = new Map();
    const plan = planCells(planVersion);
    const byDate = plan ? new Map(plan.channels[channel].days.map((d) => [d.date, d])) : null;
    days.forEach((d) => {
      const w = d.plan && M().isFiniteNumber(d.plan.revenue) && d.plan.revenue >= 0 ? d.plan.revenue : null;
      const cell = byDate && byDate.get(d.date) ? byDate.get(d.date).cells.revenue : null;
      out.set(d.date, {
        weight: w,
        source: cell ? cell.source : w === null ? 'insufficient_data' : 'explicit_plan',
        confidence: cell ? cell.confidence || null : null
      });
    });
    return out;
  }

  FP.futureWeights = { futureWeights, planCells };
})(typeof window !== 'undefined' ? window : globalThis);
