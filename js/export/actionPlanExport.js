/**
 * actionPlanExport.js — action_plan_export.json (Fase 6).
 * Conserva la trazabilidad completa: gap → driver → señal → hipótesis → escenario → acción → medición.
 * Impacto simulado (escenarios) e impacto observado (mediciones) viven en secciones separadas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  function buildActionPlanExport(analysis, { scenarioStore, actionPlan, constraints = null, diagnosis = null }) {
    const ctx = analysis.context;
    const scenarioIds = new Set((analysis.scenarios || []).map((s) => s.scenarioId));
    const actions = actionPlan ? actionPlan.actions : [];
    const linkedScenarios = scenarioStore ? scenarioStore.scenarios.filter((s) => scenarioIds.has(s.scenarioId) || actions.some((a) => a.scenarioId === s.scenarioId)) : [];
    return {
      schema: 'action_plan_export', schemaVersion: C().schemaVersion,
      metadata: { app: C().app.name, version: C().app.version, algorithmVersion: C().recovery.algorithmVersion,
        source: ctx.source, sourceFile: ctx.sourceFile, referenceDate: ctx.referenceDate,
        note: 'Escenarios = simulaciones, no predicciones. Hipótesis = requieren validación. Mediciones = observado vs baseline vs escenario, sin causalidad.' },
      period: ctx.period, channel: ctx.channel,
      comparison: diagnosis ? diagnosis.comparison : null,
      gap: analysis.gap,
      drivers: analysis.drivers,
      signals: analysis.signals,
      hypotheses: analysis.hypotheses,
      scenarios: linkedScenarios,
      recoveryOptions: analysis.recoveryOptions,
      actions,
      measurements: actionPlan ? actionPlan.measurements : [],
      traceability: actions.map((a) => {
        const sc = linkedScenarios.find((s) => s.scenarioId === a.scenarioId);
        const ms = actionPlan.measurements.filter((m) => m.actionId === a.actionId);
        return { actionId: a.actionId, gap: analysis.gap ? analysis.gap.gapBefore : null, driver: a.driver, signalIds: a.signalIds,
          hypothesisId: a.hypothesisId, scenarioId: a.scenarioId, simulatedImpact: sc ? sc.expectedImpact : null,
          measurementIds: ms.map((m) => m.measurementId), lastObserved: ms.length ? ms[ms.length - 1].observedImpact : null };
      }),
      assumptions: { recovery: analysis.assumptions, constraints },
      dataQuality: analysis.dataQuality,
      generatedAt: new Date().toISOString()
    };
  }

  FP.actionPlanExport = { buildActionPlanExport };
})(typeof window !== 'undefined' ? window : globalThis);
