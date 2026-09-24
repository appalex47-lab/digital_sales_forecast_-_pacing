/**
 * actionPlan.js — Plan de acción (Fase 6).
 *
 * Acción = actividad que una persona o equipo ejecuta. Se liga a hipótesis, escenario, driver, canal y
 * periodo. El impacto esperado se COPIA del escenario (simulado) y nunca se mezcla con el observado.
 * Los cambios de estado y de campos se agregan a `history` (append-only): nada se borra.
 *
 *   { actionId, title, description, catalogId, hypothesisId, hypothesis, scenarioId, signalIds, driver,
 *     channel, period, owner, status, priority, expectedImpact, measurement, startDate, endDate, notes,
 *     createdAt, history: [{ at, field, from, to, note }] }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const STATUSES = () => Object.keys(C().recovery.actionStatuses);
  const EDITABLE = ['title', 'description', 'owner', 'status', 'startDate', 'endDate', 'notes', 'measurement'];

  function createPlan(year) { return { year, actions: [], measurements: [] }; }

  function hydratePlan(raw, year) {
    if (!raw || !Array.isArray(raw.actions)) return createPlan(year);
    return { year: raw.year, actions: raw.actions.filter((a) => a && a.actionId), measurements: Array.isArray(raw.measurements) ? raw.measurements : [] };
  }

  /**
   * Prioridad operativa DESCRIPTIVA: factores cuantitativos con su nivel, sin "mejor acción".
   */
  function priorityFactors({ scenario = null, hypothesis = null, periodEnd = null, today = null, constraintsExceeded = false }) {
    const cfg = C().recovery.priority;
    const lvl = (v, hi, mid) => (v === null ? 'n/d' : v >= hi ? 'alta' : v >= mid ? 'media' : 'baja');
    const rec = scenario && scenario.expectedImpact ? scenario.expectedImpact.recoveryPercent : null;
    const share = scenario && scenario.outputs ? scenario.outputs.exposure : null;
    const exposure = typeof share === 'number' ? lvl(share, 0.3, 0.1) : 'n/d';
    let urgency = 'n/d';
    if (periodEnd && today) {
      const days = Math.round((Date.parse(periodEnd) - Date.parse(today)) / 86400000);
      urgency = days < 0 ? 'periodo cerrado' : days <= cfg.urgentDays ? 'alta' : days <= cfg.soonDays ? 'media' : 'baja';
    }
    const evidence = !hypothesis ? 'sin hipótesis ligada' : hypothesis.evidenceLevel === 'localized' ? 'alta' : 'media';
    return {
      simulatedImpact: rec === null ? 'n/d' : lvl(rec, cfg.impactHigh, cfg.impactMedium),
      exposure, urgency, evidence,
      constraints: constraintsExceeded ? 'excede alguna restricción' : 'dentro de restricciones',
      note: 'Factores descriptivos para ordenar la conversación; no indican cuál acción es mejor ni garantizan resultados.'
    };
  }

  function createAction(plan, a) {
    const n = plan.actions.length + 1;
    const now = new Date().toISOString();
    const action = {
      actionId: `ACT_${String(n).padStart(3, '0')}`,
      title: String(a.title || '').trim() || 'Acción sin título', description: a.description || '',
      catalogId: a.catalogId || null, source: a.source || 'catalog',
      hypothesisId: a.hypothesisId || null, hypothesis: a.hypothesis || null,
      scenarioId: a.scenarioId || null, signalIds: a.signalIds || [],
      driver: a.driver || null, channel: a.channel || 'total', period: a.period || null,
      owner: a.owner || '', status: 'proposed', priority: a.priority || null,
      expectedImpact: a.expectedImpact || null,
      measurement: { metric: a.measurementMetric || a.driver || 'revenue', windowDays: a.windowDays || null },
      startDate: a.startDate || null, endDate: a.endDate || null, notes: a.notes || '',
      createdAt: now,
      history: [{ at: now, field: 'status', from: null, to: 'proposed', note: 'Creada' }]
    };
    plan.actions.push(action);
    return action;
  }

  /** Actualiza campos permitidos; cada cambio queda en history. Estados fuera de la lista se rechazan. */
  function updateAction(plan, actionId, patch, note = '') {
    const a = plan.actions.find((x) => x.actionId === actionId);
    if (!a) return { ok: false, error: 'Acción inexistente.' };
    if (patch.status !== undefined && !STATUSES().includes(patch.status)) return { ok: false, error: `Estado no permitido: ${patch.status}.` };
    const now = new Date().toISOString();
    Object.entries(patch).forEach(([k, v]) => {
      if (!EDITABLE.includes(k)) return;
      const before = a[k];
      if (JSON.stringify(before) === JSON.stringify(v)) return;
      a[k] = v;
      a.history.push({ at: now, field: k, from: before === undefined ? null : before, to: v, note });
    });
    return { ok: true, action: a };
  }

  FP.actionPlan = { STATUSES, createPlan, hydratePlan, priorityFactors, createAction, updateAction };
})(typeof window !== 'undefined' ? window : globalThis);
