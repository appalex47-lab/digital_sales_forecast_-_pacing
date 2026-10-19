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
  const EDITABLE = ['title', 'description', 'owner', 'status', 'startDate', 'endDate', 'notes', 'measurement', 'operativeGoal'];

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
    const n = plan.actions.reduce((m, x) => Math.max(m, Number(String(x.actionId).replace(/\D/g, '')) || 0), 0) + 1;   // máximo, no conteo: tras borrar no se repiten ids
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
      operativeGoal: a.operativeGoal ? JSON.parse(JSON.stringify(a.operativeGoal)) : null,
      detail: a.detail ? JSON.parse(JSON.stringify(a.detail)) : null,   // plan de trabajo ampliado (opcional; p. ej. redactado con IA y editado por la persona)
      createdAt: now,
      history: [{ at: now, field: 'status', from: null, to: 'proposed', note: 'Creada' }]
    };
    plan.actions.push(action);
    return action;
  }

  /* ---------- Reglas de transición de estado (capa de negocio) ----------
   * Estados existentes (no se duplican): proposed = Propuesta · approved = decisión/aprobación registrada · in_progress = en curso ·
   * completed = terminada · measuring = resultado pendiente de medición (todavía sin conclusión) · validated = resultado medido y respaldado ·
   * rejected = descartada, o ejecutada sin que el resultado medido respaldara lo esperado · cancelled = detenida.
   * Aprobar no es ejecutar; terminar no es lograr el resultado; «En medición» no es una conclusión. «Validada» y «Rechazada» tras ejecutar
   * exigen una medición válida de ESA acción con venta real observada: el selector de la interfaz no puede saltarse esta validación. */
  const TRANSITIONS = {
    proposed: ['approved', 'rejected', 'cancelled'],
    approved: ['in_progress', 'cancelled', 'proposed'],
    in_progress: ['completed', 'cancelled', 'approved'],
    completed: ['measuring', 'in_progress', 'cancelled'],
    measuring: ['validated', 'rejected', 'completed', 'cancelled'],
    validated: ['measuring'],
    rejected: ['proposed', 'measuring'],
    cancelled: ['proposed']
  };
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /** ¿Esta medición cuenta como evidencia de ESTA acción? → { ok, why } (why = qué falta). */
  function measurementProblem(action, m) {
    if (!m || typeof m !== 'object') return 'no hay medición';
    if (m.actionId !== action.actionId) return `la medición pertenece a otra acción (${m.actionId || 'sin acción'})`;
    if (action.scenarioId && m.scenarioId !== action.scenarioId) return 'la medición corresponde a otro escenario';
    if (!m.measurementDate) return 'la medición no tiene fecha de referencia';
    if (!m.window || !m.window.start || !m.window.end) return 'la medición no tiene ventana de evaluación';
    if (!(m.observedDays > 0)) return 'todavía no hay venta real en la ventana de medición';
    if (m.consistency === 'insufficient_data' || !m.consistency) return 'la medición no tiene datos suficientes';
    if (!m.delta || !fin(m.delta.baseline) || !fin(m.delta.observed)) return 'a la medición le falta la línea base o el valor observado';
    return null;
  }
  /** Mediciones de la acción que sí son válidas (las más recientes al final). */
  function validMeasurements(plan, action) {
    return (plan.measurements || []).filter((m) => m && m.actionId === action.actionId && !measurementProblem(action, m));
  }
  /** Por qué NO se puede pasar a `to` (texto para la persona) o null si se puede. */
  function transitionProblem(plan, action, to) {
    const from = action.status;
    if (from === to) return null;
    if (!(TRANSITIONS[from] || []).includes(to)) {
      const L = C().recovery.actionStatuses;
      const need = { approved: 'Primero registra la decisión (Aprobada).', in_progress: 'Primero hay que aprobarla.', completed: 'Primero tiene que estar En curso.',
        measuring: 'Primero tiene que estar Terminada.', validated: 'Primero tiene que estar En medición.', rejected: 'Solo se puede rechazar una propuesta, o una acción En medición con resultado medido.' }[to] || '';
      return `No se puede pasar de «${L[from] || from}» a «${L[to] || to}». ${need}`.trim();
    }
    if (to === 'validated' || (to === 'rejected' && ['measuring', 'completed'].includes(from))) {
      const all = (plan.measurements || []).filter((m) => m && m.actionId === action.actionId);
      const valid = validMeasurements(plan, action);
      if (!valid.length) {
        const why = all.length ? measurementProblem(action, all[all.length - 1]) : 'todavía no hay ninguna medición';
        return `No se puede marcar como ${to === 'validated' ? 'Validada' : 'Rechazada con resultado'}: ${why}. Mide la acción en «Medir y aprender» cuando haya venta real en su ventana.`;
      }
      if (to === 'validated' && valid[valid.length - 1].consistency === 'not_consistent') {
        return 'La última medición válida no fue consistente con lo esperado: no se puede marcar como Validada. Documéntala como Rechazada, o ajusta la acción y vuelve a medir.';
      }
    }
    return null;
  }
  /** Estados a los que se puede pasar desde el actual, con el motivo cuando no se puede (para la interfaz). */
  function nextStates(plan, action) {
    return Object.keys(C().recovery.actionStatuses).map((st) => {
      const why = transitionProblem(plan, action, st);
      return { status: st, current: st === action.status, allowed: !why, reason: why };
    });
  }
  /** Revisión de registros anteriores: acciones «Validada» o «Rechazada tras ejecutar» sin medición válida. No se modifican: solo se señalan. */
  function integrityIssue(plan, action) {
    if (action.status === 'validated' && !validMeasurements(plan, action).length) {
      return 'Registro anterior: figura como Validada pero no tiene una medición válida. Mídela o regrésala a «En medición».';
    }
    return null;
  }

  /** Actualiza campos permitidos; cada cambio queda en history. Estados fuera de la lista o transiciones no permitidas se rechazan ANTES de guardar nada. */

  /* ---------- Objetivo operativo (volumen / conversión / ticket a conseguir) ----------
   * El impacto simulado está en dinero; el objetivo operativo dice QUÉ hay que mover para lograrlo (p. ej. +4,200 conversaciones).
   * Sale del escenario guardado (mismos días y la misma agregación que usa la medición), no de la IA. Es opcional y editable. */
  const GOAL_LABEL = { trafficVolume: 'Tráfico', conversionRate: 'Tasa de conversión', aov: 'Ticket promedio' };
  function operativeGoalFrom(scenario, win = null) {
    if (!scenario || !scenario.days) return null;
    const metric = scenario.links && scenario.links.driver; if (!GOAL_LABEL[metric]) return null;
    const t = { b: [0, 0, 0], s: [0, 0, 0] }; let days = 0; const chans = new Set();
    Object.entries(scenario.days).forEach(([ch, list]) => list.forEach((d) => {
      if (win && win.start && (d[0] < win.start || (win.end && d[0] > win.end))) return;
      days++; chans.add(ch); [1, 2, 3].forEach((i) => { t.b[i - 1] += d[i] || 0; t.s[i - 1] += d[i + 3] || 0; });
    }));
    if (!days) return null;
    const val = (x) => (metric === 'trafficVolume' ? x[2] : metric === 'conversionRate' ? (x[2] ? x[1] / x[2] : null) : (x[1] ? x[0] / x[1] : null));
    const base = val(t.b), target = val(t.s); if (base === null || target === null) return null;
    const list = (C().channels || []).filter((c) => chans.has(c.id));
    const unit = metric === 'trafficVolume' ? (list.length === 1 ? String(list[0].trafficLabel || 'Tráfico').toLowerCase() : 'tráfico (suma de canales)') : metric === 'conversionRate' ? 'conversión' : 'ticket promedio';
    return { metric, label: GOAL_LABEL[metric], unit, base, target, delta: target - base, scenarioDelta: target - base, days, source: 'scenario', edited: false };
  }
  /** Cambia el objetivo (valor a conseguir) a mano; queda marcado como editado y en el historial. */
  function setGoalTarget(plan, actionId, target) {
    const a = plan.actions.find((x) => x.actionId === actionId); if (!a || !a.operativeGoal) return { ok: false, error: 'La acción no tiene objetivo operativo.' };
    const n = Number(target); if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'El objetivo debe ser un número mayor o igual a 0.' };
    return updateAction(plan, actionId, { operativeGoal: { ...a.operativeGoal, target: n, delta: n - a.operativeGoal.base, source: 'manual', edited: true } }, 'Objetivo operativo editado');
  }
  /** Si cambian las fechas de la acción y el objetivo viene del escenario (sin editar), se recalcula para esa ventana (también si aún no había). */
  function refreshGoal(plan, actionId, scenarios) {
    const a = plan.actions.find((x) => x.actionId === actionId); if (!a || (a.operativeGoal && a.operativeGoal.edited)) return;
    const sc = scenarios.find((s) => s.scenarioId === a.scenarioId); const g = operativeGoalFrom(sc, { start: a.startDate, end: a.endDate });
    if (g) updateAction(plan, actionId, { operativeGoal: g }, 'Recalculado por cambio de fechas');
  }

  function updateAction(plan, actionId, patch, note = '') {
    const a = plan.actions.find((x) => x.actionId === actionId);
    if (!a) return { ok: false, error: 'Acción inexistente.' };
    if (patch.status !== undefined && !STATUSES().includes(patch.status)) return { ok: false, error: `Estado no permitido: ${patch.status}.` };
    if (patch.status !== undefined && patch.status !== a.status) {
      const why = transitionProblem(plan, a, patch.status);
      if (why) return { ok: false, error: why, code: 'transition' };
    }
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

  /* ---------- Decisión y conclusión estructuradas (Fase 3) ----------
   * Una cosa es el hallazgo, otra la hipótesis (a validar, nunca causa demostrada), otra la decisión, la ejecución, la medición y la conclusión.
   * `decision` y `conclusion` son campos propios de la acción; cada cambio queda en `history` (campo «decision»/«conclusion») con el valor anterior.
   * Se reutilizan los campos existentes: responsable (owner), hipótesis (hypothesis), resultado esperado (expectedImpact), ventana (measurement.windowDays,
   * startDate/endDate) y acción asociada (actionId). Las notas libres antiguas NO se convierten en decisiones. */
  const CONCLUSIONS = {
    keep: { label: 'Mantener', meaning: 'La evidencia disponible respalda continuar con la intervención.' },
    adjust: { label: 'Ajustar', meaning: 'Los resultados justifican cambiar la intervención, su ejecución o sus condiciones.' },
    stop: { label: 'Detener', meaning: 'La evidencia o las condiciones de negocio justifican no continuar.' }
  };
  const txt = (v) => String(v == null ? '' : v).trim();
  const today = () => new Date().toISOString().slice(0, 10);

  /** Registra (o revisa) la decisión y su objetivo. Obligatorios: decisión, objetivo y responsable; lo demás es opcional. */
  function recordDecision(plan, actionId, d, note = '') {
    const a = plan.actions.find((x) => x.actionId === actionId);
    if (!a) return { ok: false, error: 'Acción inexistente.' };
    const decision = txt(d.decision), objective = txt(d.objective), decidedBy = txt(d.decidedBy) || txt(a.owner);
    const missing = [];
    if (decision.length < 3) missing.push('la decisión adoptada');
    if (objective.length < 3) missing.push('el objetivo de la intervención');
    if (!decidedBy) missing.push('el responsable');
    if (missing.length) return { ok: false, error: `Falta ${missing.join(', ')}.`, code: 'incomplete' };
    const next = { decision, objective, decidedBy, decidedAt: txt(d.decidedAt) || today(), successIndicator: txt(d.successIndicator) || null,
      hypothesisToTest: txt(d.hypothesisToTest) || a.hypothesis || null, expectedResult: txt(d.expectedResult) || null };
    const before = a.decision || null;
    if (JSON.stringify(before) === JSON.stringify(next)) return { ok: true, action: a, unchanged: true };
    a.decision = next;
    a.history.push({ at: new Date().toISOString(), field: 'decision', from: before, to: next, note });
    return { ok: true, action: a };
  }

  /** Por qué NO se puede registrar esta conclusión (texto) o null. No cambia nada. */
  function conclusionProblem(plan, a, c) {
    if (!CONCLUSIONS[c.outcome]) return 'Elige Mantener, Ajustar o Detener.';
    if (!['measuring', 'validated', 'rejected'].includes(a.status)) return 'La conclusión se registra cuando la acción está En medición (o ya Validada/Rechazada). Antes no hay resultado que concluir.';
    const valid = validMeasurements(plan, a);
    if (!valid.length) {
      const all = (plan.measurements || []).filter((m) => m && m.actionId === a.actionId);
      return `Todavía no hay evidencia suficiente: ${all.length ? measurementProblem(a, all[all.length - 1]) : 'no hay ninguna medición'}. La acción sigue pendiente; mide cuando haya venta real en su ventana.`;
    }
    if (txt(c.justification).length < 10) return 'Escribe la justificación (qué evidencia te lleva a esta conclusión).';
    if (!(txt(c.decidedBy) || txt(a.owner))) return 'Falta el responsable de la conclusión.';
    if (c.outcome === 'adjust' && txt(c.nextAction).length < 3) return 'Para Ajustar indica qué se cambia (acción siguiente).';
    if (c.outcome === 'keep' && valid[valid.length - 1].consistency === 'not_consistent') return 'La última medición no fue consistente con lo esperado: no respalda Mantener. Elige Ajustar o Detener, o vuelve a medir.';
    return null;
  }

  /** Registra la conclusión estructurada. Una medición por sí sola no concluye nada: la conclusión la toma una persona con su justificación. No cambia el estado de la acción. */
  function recordConclusion(plan, actionId, c, note = '') {
    const a = plan.actions.find((x) => x.actionId === actionId);
    if (!a) return { ok: false, error: 'Acción inexistente.' };
    const why = conclusionProblem(plan, a, c);
    if (why) return { ok: false, error: why, code: 'conclusion' };
    const m = validMeasurements(plan, a).slice(-1)[0];
    const rel = { consistent: 'El resultado observado fue consistente con lo esperado.', partial: 'El resultado observado fue parcialmente consistente con lo esperado.', not_consistent: 'El resultado observado no fue consistente con lo esperado.' }[m.consistency];
    const next = {
      outcome: c.outcome, justification: txt(c.justification), decidedBy: txt(c.decidedBy) || txt(a.owner), decidedAt: txt(c.decidedAt) || today(), nextAction: txt(c.nextAction) || null,
      evidence: { measurementId: m.measurementId, metric: m.metric, window: m.window, observedDays: m.observedDays, windowDays: m.windowDays, baseline: m.delta.baseline, observed: m.delta.observed,
        realization: typeof m.realization === 'number' ? m.realization : null, consistency: m.consistency, note: 'Compara contra la línea base y el escenario; no establece causalidad.' },
      objectiveRelation: `${rel}${a.decision && a.decision.objective ? ` Objetivo registrado: «${a.decision.objective}».` : ' No hay un objetivo registrado en la decisión.'}`
    };
    const before = a.conclusion || null;
    if (JSON.stringify(before) === JSON.stringify(next)) return { ok: true, action: a, unchanged: true };
    a.conclusion = next;
    a.history.push({ at: new Date().toISOString(), field: 'conclusion', from: before, to: next, note });
    return { ok: true, action: a };
  }

  /** Borra una acción del plan y sus mediciones. Devuelve cuántas mediciones se fueron con ella. */
  function deleteAction(plan, actionId) {
    const i = plan.actions.findIndex((a) => a.actionId === actionId);
    if (i < 0) return { ok: false, error: 'Acción inexistente.' };
    const [removed] = plan.actions.splice(i, 1);
    const before = plan.measurements.length;
    for (let k = plan.measurements.length - 1; k >= 0; k--) if (plan.measurements[k].actionId === actionId) plan.measurements.splice(k, 1);
    return { ok: true, removed, removedMeasurements: before - plan.measurements.length };
  }
  /** Acciones que dependen de un escenario (para avisar antes de borrarlo). */
  function actionsOfScenario(plan, scenarioId) { return plan.actions.filter((a) => a.scenarioId === scenarioId); }
  /** Al borrar un escenario, las acciones ligadas se conservan pero quedan sin escenario (queda en su historial). */
  function unlinkScenario(plan, scenarioId) {
    const now = new Date().toISOString(); let n = 0;
    plan.actions.forEach((a) => { if (a.scenarioId === scenarioId) { a.history.push({ at: now, field: 'scenarioId', from: scenarioId, to: null, note: 'Escenario borrado' }); a.scenarioId = null; n++; } });
    return n;
  }

  FP.actionPlan = { GOAL_LABEL, operativeGoalFrom, setGoalTarget, refreshGoal, CONCLUSIONS, recordDecision, recordConclusion, conclusionProblem, TRANSITIONS, measurementProblem, validMeasurements, transitionProblem, nextStates, integrityIssue, deleteAction, actionsOfScenario, unlinkScenario, STATUSES, createPlan, hydratePlan, priorityFactors, createAction, updateAction };
})(typeof window !== 'undefined' ? window : globalThis);
