// Decisión y conclusión estructuradas (js/actions/actionPlan.js). Uso: node tools/test-action-decisions.js
global.window = global; global.FP = {};
require('../js/config/config.js'); require('../js/actions/actionPlan.js'); require('../js/ui/guidance/traceability.js');
const AP = FP.actionPlan; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const meas = (id, o = {}) => Object.assign({ measurementId: 'm1', actionId: id, scenarioId: 'sc1', measurementDate: '2026-09-23', window: { start: '2026-09-16', end: '2026-09-22' },
  observedDays: 7, windowDays: 7, consistency: 'consistent', realization: 1.1, delta: { baseline: 1000, observed: 1100 }, metric: 'revenue' }, o);
const mk = () => { const plan = AP.createPlan(2026); const a = AP.createAction(plan, { title: 'A', scenarioId: 'sc1', owner: 'Ana', hypothesis: 'el checkout pierde pedidos' }); return { plan, a }; };
const walk = (plan, a, l) => l.forEach((s) => AP.updateAction(plan, a.actionId, { status: s }));
const D = { decision: 'Corregir el checkout', objective: 'Recuperar conversión', decidedBy: 'Ana', successIndicator: 'CR de app vs base' };
{ const { plan, a } = mk();
  ok('D1 decisión incompleta se rechaza y dice qué falta', !AP.recordDecision(plan, a.actionId, { decision: 'x' }).ok && /objetivo/.test(AP.recordDecision(plan, a.actionId, { decision: 'Hacer algo' }).error));
  const r = AP.recordDecision(plan, a.actionId, D);
  ok('D2 decisión con objetivo y responsable se registra, con fecha y la hipótesis como «a comprobar»', r.ok && a.decision.objective === 'Recuperar conversión' && a.decision.decidedAt && a.decision.hypothesisToTest === 'el checkout pierde pedidos', a.decision);
  ok('D3 la decisión queda en el historial y la hipótesis original no se altera', a.history.some((h) => h.field === 'decision' && h.from === null) && a.hypothesis === 'el checkout pierde pedidos');
  const ch = AP.recordDecision(plan, a.actionId, { ...D, objective: 'Recuperar 0.2 pp' });
  ok('D4 cambiar la decisión conserva el valor anterior en el historial', ch.ok && a.history.filter((h) => h.field === 'decision').length === 2 && a.history[a.history.length - 1].from.objective === 'Recuperar conversión');
  ok('D5 volver a guardar lo mismo no duplica historial', AP.recordDecision(plan, a.actionId, { ...D, objective: 'Recuperar 0.2 pp' }).unchanged === true);
  ok('D6 la decisión sigue ligada a la acción (id) tras el recorrido', a.decision && a.actionId === 'ACT_001');
  const tr = FP.traceability.chain(a, { scenarios: [], measurements: [] });
  ok('D7 la cadena trazable muestra decisión y conclusión (esta última «sin conclusión documentada»)', tr.some((x) => x.kind === 'Decisión' && /Recuperar 0.2/.test(x.detail)) && tr.some((x) => x.kind === 'Conclusión' && /Sin conclusión/.test(x.title)));
}
{ const { plan, a } = mk();
  const C = { outcome: 'keep', justification: 'La venta observada superó la base en la ventana', decidedBy: 'Ana' };
  ok('D8 conclusión sin que la acción esté En medición se rechaza', !AP.recordConclusion(plan, a.actionId, C).ok);
  walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  const r0 = AP.recordConclusion(plan, a.actionId, C);
  ok('D9 conclusión sin medición suficiente se rechaza y la acción sigue pendiente', !r0.ok && /evidencia suficiente/.test(r0.error) && a.status === 'measuring' && !a.conclusion, r0);
  plan.measurements.push(meas(a.actionId, { observedDays: 0, consistency: 'insufficient_data' }));
  ok('D10 con medición insuficiente (sin días con real) también se rechaza', !AP.recordConclusion(plan, a.actionId, C).ok);
  plan.measurements.push(meas(a.actionId));
  ok('D11 conclusión sin justificación se rechaza', !AP.recordConclusion(plan, a.actionId, { ...C, justification: 'ok' }).ok);
  ok('D12 «Ajustar» sin acción siguiente se rechaza', !AP.recordConclusion(plan, a.actionId, { ...C, outcome: 'adjust' }).ok);
  ok('D13 una medición no implica «mantener»: tener medición válida no crea ninguna conclusión', !a.conclusion && a.status === 'measuring');
  const r1 = AP.recordConclusion(plan, a.actionId, C);
  ok('D14 conclusión con medición válida se registra con evidencia, relación con el objetivo y sin cambiar el estado', r1.ok && a.conclusion.evidence.observed === 1100 && a.conclusion.evidence.baseline === 1000 && /No hay un objetivo/.test(a.conclusion.objectiveRelation) && a.status === 'measuring', a.conclusion);
  ok('D15 la evidencia declara que no establece causalidad', /no establece causalidad/.test(a.conclusion.evidence.note));
  AP.recordDecision(plan, a.actionId, D);
  const r2 = AP.recordConclusion(plan, a.actionId, { ...C, outcome: 'adjust', nextAction: 'Probar otro flujo de pago', justification: 'Mejoró pero por debajo de lo esperado' }, 'revisión');
  ok('D16 cambiar la conclusión conserva la anterior (trazabilidad) y relaciona con el objetivo registrado', r2.ok && a.history.filter((h) => h.field === 'conclusion').length === 2 && a.history[a.history.length - 1].from.outcome === 'keep' && /Recuperar conversión/.test(a.conclusion.objectiveRelation), a.history.length);
  ok('D17 la decisión original sigue ahí después de concluir', a.decision.decision === 'Corregir el checkout');
}
{ const { plan, a } = mk(); walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  plan.measurements.push(meas(a.actionId, { consistency: 'not_consistent', delta: { baseline: 1000, observed: 950 } }));
  const keep = AP.recordConclusion(plan, a.actionId, { outcome: 'keep', justification: 'Quiero seguir porque sí', decidedBy: 'Ana' });
  ok('D18 «Mantener» no se permite si la medición no respalda lo esperado', !keep.ok && /no respalda/.test(keep.error), keep);
  ok('D19 con ese resultado sí se puede documentar «Detener» sin afirmar éxito', AP.recordConclusion(plan, a.actionId, { outcome: 'stop', justification: 'No mejoró frente a la línea base', decidedBy: 'Ana' }).ok && a.status === 'measuring'); }
{ const old = AP.hydratePlan({ year: 2026, actions: [{ actionId: 'ACT_009', title: 'vieja', status: 'completed', notes: 'nota libre', history: [] }], measurements: [] }, 2026);
  ok('D20 acciones históricas siguen legibles: sin decisión ni conclusión, las notas libres no se convierten en decisión', old.actions[0].notes === 'nota libre' && !old.actions[0].decision && !old.actions[0].conclusion);
  const tr = FP.traceability.chain(old.actions[0], {});
  ok('D21 la cadena de una acción histórica se arma sin errores', tr.length > 5); }
console.log(fails ? `FALLAS ${fails}/${n}` : `OK ${n}/${n}`); process.exit(fails ? 1 : 0);
