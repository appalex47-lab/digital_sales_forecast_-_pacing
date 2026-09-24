/**
 * actionTracking.js — Seguimiento de acciones (Fase 6).
 * Registra mediciones (baseline / escenario / observado) sin borrar las anteriores.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  /** Mide una acción contra su escenario y guarda la medición (append-only). */
  function recordMeasurement(plan, { actionId, scenarios, store, run, measurementDate = null }) {
    const action = plan.actions.find((a) => a.actionId === actionId);
    if (!action) return { ok: false, error: 'Acción inexistente.' };
    const scenario = action.scenarioId ? scenarios.find((s) => s.scenarioId === action.scenarioId) : null;
    if (!scenario) return { ok: false, error: 'La acción no tiene escenario ligado: no hay impacto simulado contra el cual medir.' };
    const m = FP.impactMeasurement.measure({ scenario, action, store, run, measurementDate });
    m.status = m.consistency;
    plan.measurements.push(m);
    return { ok: true, measurement: m };
  }

  function measurementsOf(plan, actionId) { return plan.measurements.filter((m) => m.actionId === actionId); }
  function latest(plan, actionId) { const l = measurementsOf(plan, actionId); return l.length ? l[l.length - 1] : null; }

  FP.actionTracking = { recordMeasurement, measurementsOf, latest };
})(typeof window !== 'undefined' ? window : globalThis);
