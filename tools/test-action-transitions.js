// Pruebas de las reglas de transición de acciones (js/actions/actionPlan.js). Uso: node tools/test-action-transitions.js
global.window = global; global.FP = {};
require('../js/config/config.js'); require('../js/actions/actionPlan.js');
const AP = FP.actionPlan; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const mk = () => { const plan = AP.createPlan(2026); const a = AP.createAction(plan, { title: 'A', scenarioId: 'sc1', driver: 'conversionRate', channel: 'ecommerce' }); return { plan, a }; };
const meas = (id, o = {}) => Object.assign({ measurementId: 'm' + Math.random(), actionId: id, scenarioId: 'sc1', measurementDate: '2026-09-23', window: { start: '2026-09-16', end: '2026-09-22' },
  observedDays: 7, windowDays: 7, consistency: 'consistent', delta: { baseline: 1000, observed: 1100 }, metric: 'revenue' }, o);
const to = (plan, a, st) => AP.updateAction(plan, a.actionId, { status: st });
const walk = (plan, a, list) => list.forEach((s) => to(plan, a, s));

// camino feliz
{ const { plan, a } = mk();
  ok('T1 propuesta → aprobada', to(plan, a, 'approved').ok);
  ok('T2 aprobada → en curso', to(plan, a, 'in_progress').ok);
  ok('T3 en curso → terminada', to(plan, a, 'completed').ok);
  ok('T4 terminada → en medición', to(plan, a, 'measuring').ok);
  ok('T5 en medición → validada SIN medición se rechaza', !to(plan, a, 'validated').ok && a.status === 'measuring', a.status);
  plan.measurements.push(meas(a.actionId));
  const r = to(plan, a, 'validated');
  ok('T6 en medición → validada con medición válida', r.ok && a.status === 'validated');
  ok('T7 historial: creada + 5 cambios, nada se borra', a.history.length === 6 && a.history[5].to === 'validated', a.history.length);
}
// saltos
{ const { plan, a } = mk();
  ok('T8 propuesta → validada (salto directo) se rechaza y no cambia nada', !to(plan, a, 'validated').ok && a.status === 'proposed' && a.history.length === 1);
  ok('T9 propuesta → en curso se rechaza (aprobar no se omite)', !to(plan, a, 'in_progress').ok);
  ok('T10 propuesta → en medición se rechaza', !to(plan, a, 'measuring').ok);
  walk(plan, a, ['approved']);
  ok('T11 aprobada → terminada se rechaza (aprobar no es ejecutar)', !to(plan, a, 'completed').ok);
  walk(plan, a, ['in_progress', 'completed']);
  ok('T12 terminada → validada se rechaza (terminar no es lograr el resultado)', !to(plan, a, 'validated').ok);
  ok('T13 mensaje explica qué falta', /En medición/.test(to(plan, a, 'validated').error), to(plan, a, 'validated').error);
  ok('T14 estado inexistente se rechaza', !to(plan, a, 'ganadora').ok);
}
// mediciones inválidas
const bad = (label, o, expectText) => { const { plan, a } = mk(); walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  plan.measurements.push(meas(a.actionId, o)); const r = to(plan, a, 'validated');
  ok(label, !r.ok && a.status === 'measuring' && (!expectText || expectText.test(r.error)), r.error); };
bad('T15 medición sin días observados (insufficient) se rechaza', { observedDays: 0, consistency: 'insufficient_data' }, /venta real|datos suficientes/);
bad('T16 medición sin fecha de referencia se rechaza', { measurementDate: null }, /fecha/);
bad('T17 medición sin ventana se rechaza', { window: { start: null, end: null } }, /ventana/);
bad('T18 medición sin línea base se rechaza', { delta: { baseline: null, observed: 5 } }, /línea base/);
bad('T19 medición de otro escenario se rechaza', { scenarioId: 'otro' }, /escenario/);
bad('T20 medición no consistente no se convierte en éxito', { consistency: 'not_consistent' }, /no fue consistente/);
{ const { plan, a } = mk(); const b = AP.createAction(plan, { title: 'B', scenarioId: 'sc1' }); walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  plan.measurements.push(meas(b.actionId)); const r = to(plan, a, 'validated');
  ok('T21 medición vinculada a otra acción se rechaza (no cuenta como evidencia)', !r.ok && /otra acción/.test(AP.measurementProblem(a, meas(b.actionId))), r.error); }
// resultado sin impacto esperado se documenta sin afirmar éxito
{ const { plan, a } = mk(); walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  plan.measurements.push(meas(a.actionId, { consistency: 'not_consistent', delta: { baseline: 1000, observed: 980 } }));
  const r = to(plan, a, 'rejected');
  ok('T22 resultado medido sin el impacto esperado se documenta como Rechazada (no como éxito)', r.ok && a.status === 'rejected'); }
{ const { plan, a } = mk(); walk(plan, a, ['approved', 'in_progress', 'completed', 'measuring']);
  ok('T23 «Rechazada» tras ejecutar sin medición válida se rechaza', !to(plan, a, 'rejected').ok); }
{ const { plan, a } = mk(); ok('T24 una propuesta se puede descartar sin medición', to(plan, a, 'rejected').ok); }
{ const { plan, a } = mk(); walk(plan, a, ['approved', 'in_progress']); ok('T25 detener una acción en curso → Cancelada', to(plan, a, 'cancelled').ok); }
// otros campos no se bloquean; mismo estado es no-op
{ const { plan, a } = mk(); const r = AP.updateAction(plan, a.actionId, { owner: 'Ana', status: 'proposed' });
  ok('T26 cambiar responsable sin cambiar estado funciona', r.ok && a.owner === 'Ana'); }
// nextStates para la interfaz
{ const { plan, a } = mk(); const ns = AP.nextStates(plan, a);
  const get = (s) => ns.find((x) => x.status === s);
  ok('T27 nextStates: desde Propuesta solo Aprobada/Rechazada/Cancelada están permitidas', get('approved').allowed && get('rejected').allowed && !get('validated').allowed && !get('measuring').allowed && get('proposed').current, ns.map((x) => x.status + ':' + x.allowed)); }
// registros anteriores
{ const plan = AP.hydratePlan({ year: 2026, actions: [{ actionId: 'ACT_001', title: 'vieja', status: 'validated', history: [] }], measurements: [] }, 2026);
  const a = plan.actions[0];
  ok('T28 acción histórica «Validada» sin medición se conserva tal cual y se señala', a.status === 'validated' && /Registro anterior/.test(AP.integrityIssue(plan, a) || ''));
  ok('T29 y puede regresarse a En medición (compatibilidad), no se borra nada', to(plan, a, 'measuring').ok && a.history.length === 1);
  ok('T30 una histórica con medición válida no se señala', (() => { plan.measurements.push(meas('ACT_001', { scenarioId: undefined })); a.status = 'validated'; return AP.integrityIssue(plan, a) === null; })()); }
console.log(fails ? `FALLAS ${fails}/${n}` : `OK ${n}/${n}`); process.exit(fails ? 1 : 0);
