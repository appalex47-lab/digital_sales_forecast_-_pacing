/**
 * reforecastExport.js — reforecast_export.json (Fase 4).
 * Estructura pensada para la futura app de diagnóstico: plan, actual, forecast, reforecast,
 * pendiente, surplus, recovery gap, presión, requerimiento por driver, versiones, supuestos,
 * confianza y validación. Sin integración automática: solo el archivo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const block = (b) => (b ? FP.exporter.toContractBlock(b) : null);
  const series = () => ['total', ...C().channelIds];
  const S = (rf, ch) => (ch === 'total' ? rf.total : rf.channels[ch]);

  function periodOut(p) {
    if (!p) return null;
    return {
      key: p.key, first_date: p.firstDate, last_date: p.lastDate, status: p.status, days: p.days,
      counted_days: p.countedDays, open_days: p.openDays, missing_actual_days: p.missingActualDays,
      plan: block(p.plan), actual_to_date: block(p.actualToDate), forecast: block(p.forecast), reforecast: block(p.reforecast),
      required: block(p.required), plan_open_days: block(p.planOpen),
      recovery_gap: p.recoveryGap, recovery_pressure: p.pressure ? p.pressure.revenue.pressure : null,
      target_remaining: p.targetRemaining, surplus_vs_plan_to_date: p.surplusVsPlanToDate
    };
  }

  function buildReforecastExport(rf, { registry = null, change = null } = {}) {
    const by = (fn) => Object.fromEntries(series().map((ch) => [ch, fn(S(rf, ch), ch)]));
    return {
      schema: 'reforecast_export', schemaVersion: C().schemaVersion, generatedAt: new Date().toISOString(),
      source: { app: C().app.name, version: C().app.version },
      metadata: {
        algorithmVersion: rf.algorithmVersion, method: rf.method, horizon: rf.horizon, year: rf.year,
        cutoff: rf.cutoff, todayStatus: rf.todayStatus, simulated: rf.simulated,
        planVersion: rf.plan, forecast: rf.forecast,
        note: 'Plan = lo que debíamos hacer. Forecast = lo que estimamos que ocurrirá. Reforecast = lo que tendría que ocurrir para conservar la meta. No es una recomendación.'
      },
      referenceDate: rf.referenceDate,
      plan: by((s) => ({ annual: block(s.annual.plan), months: s.months.map((m) => ({ month: m.key, plan: block(m.plan) })) })),
      actual: by((s) => ({ to_date: block(s.annual.actualToDate), counted_days: s.annual.countedDays })),
      forecast: by((s) => ({ annual: block(s.annual.forecast), forecast_method: rf.forecast.method })),
      reforecast: by((s) => ({
        horizon_period: periodOut(s.horizonSummary), annual: periodOut(s.annual),
        months: s.months.map(periodOut), weeks: s.weeks.map(periodOut),
        daily: s.days.map((d) => ({ date: d.date, kind: d.kind, plan: block(d.plan), actual: block(d.actual), partial_actual: block(d.partialActual),
          forecast: block(d.forecast), reforecast: block(d.reforecast), normalized_weight: d.normalizedWeight ?? null,
          weight_source: d.weight ? d.weight.source : null,
          recovery_pressure: d.delta ? d.delta.revenue.pressure : null }))
      })),
      remainingTarget: by((s) => s.horizon),
      surplus: by((s) => ({ vs_target: s.horizon.surplus, vs_plan_to_date: s.annual.surplusVsPlanToDate })),
      recoveryGap: by((s) => ({ horizon: s.horizonSummary ? s.horizonSummary.recoveryGap : null, annual: s.annual.recoveryGap })),
      recoveryPressure: by((s) => ({ horizon: s.horizonSummary && s.horizonSummary.pressure ? s.horizonSummary.pressure : null })),
      driverRequirements: by((s) => s.drivers),
      versions: registry ? registry.versions : [],
      reforecastChange: change,
      assumptions: { assumptionSource: rf.assumptionSource, assumptionLabel: rf.settings.assumptionSources[rf.assumptionSource],
        horizon: rf.horizon, fallback: rf.settings.fallback, zeroWeightFloor: rf.settings.zeroWeightFloor,
        futureWeights: 'Venta diaria del plan original (salida del motor de estacionalidad de Fase 2), normalizada sobre los días futuros del horizonte.' },
      confidence: by((s) => s.confidence),
      validation: rf.validation
    };
  }

  FP.reforecastExport = { buildReforecastExport };
})(typeof window !== 'undefined' ? window : globalThis);
