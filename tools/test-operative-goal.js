#!/usr/bin/env node
/* Objetivo operativo: operativeGoalFrom / setGoalTarget / refreshGoal. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
['js/config/config.js', 'js/actions/actionPlan.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const AP = ctx.FP.actionPlan;
// días: [fecha, ingreso base, pedidos base, tráfico base, ingreso esc, pedidos esc, tráfico esc]
const day = (d, tb, ts) => [d, tb * 0.02 * 500, tb * 0.02, tb, ts * 0.02 * 500, ts * 0.02, ts];
const sc = (driver, ch = 'whatsapp') => ({ scenarioId: 'SC_001_v1', links: { driver }, days: { [ch]: [day('2026-10-01', 1000, 1200), day('2026-10-02', 1000, 1200), day('2026-10-03', 1000, 1200)] } });
let g = AP.operativeGoalFrom(sc('trafficVolume'));
assert(g.metric === 'trafficVolume' && g.base === 3000 && g.target === 3600 && g.delta === 600 && g.unit === 'conversaciones iniciadas' && g.source === 'scenario' && g.edited === false, JSON.stringify(g));
g = AP.operativeGoalFrom(sc('trafficVolume'), { start: '2026-10-02', end: '2026-10-03' }); assert(g.base === 2000 && g.target === 2400 && g.days === 2);
g = AP.operativeGoalFrom(sc('conversionRate')); assert(Math.abs(g.base - 0.02) < 1e-9 && g.label === 'Tasa de conversión');
g = AP.operativeGoalFrom(sc('aov')); assert(Math.abs(g.base - 500) < 1e-9 && g.unit === 'ticket promedio');
assert(AP.operativeGoalFrom(sc('otro')) === null && AP.operativeGoalFrom(null) === null && AP.operativeGoalFrom(sc('trafficVolume'), { start: '2027-01-01', end: '2027-01-02' }) === null);
const two = sc('trafficVolume'); two.days.app = [day('2026-10-01', 500, 600)]; assert(AP.operativeGoalFrom(two).unit === 'tráfico (suma de canales)');
// acción
const plan = AP.createPlan ? AP.createPlan(2026) : { year: 2026, actions: [], measurements: [] };
const goal = AP.operativeGoalFrom(sc('trafficVolume'), { start: '2026-10-01', end: '2026-10-03' });
const a = AP.createAction(plan, { title: 'Push', driver: 'trafficVolume', scenarioId: 'SC_001_v1', operativeGoal: goal });
assert(a.operativeGoal.target === 3600 && a.operativeGoal !== goal, 'se copia');
assert(AP.createAction(plan, { title: 'x' }).operativeGoal === null, 'acciones sin objetivo siguen válidas');
assert(!AP.setGoalTarget(plan, a.actionId, 'abc').ok && !AP.setGoalTarget(plan, a.actionId, -5).ok);
let r = AP.setGoalTarget(plan, a.actionId, 3300); assert(r.ok && a.operativeGoal.delta === 300 && a.operativeGoal.edited === true && a.operativeGoal.scenarioDelta === 600 && a.history.some((h) => h.field === 'operativeGoal'));
a.startDate = '2026-10-01'; a.endDate = '2026-10-02'; AP.refreshGoal(plan, a.actionId, [sc('trafficVolume')]); assert(a.operativeGoal.target === 3300, 'editado no se recalcula');
const b = AP.createAction(plan, { title: 'y', driver: 'trafficVolume', scenarioId: 'SC_001_v1', operativeGoal: goal, startDate: '2026-10-01', endDate: '2026-10-02' });
AP.refreshGoal(plan, b.actionId, [sc('trafficVolume')]); assert(b.operativeGoal.target === 2400 && b.operativeGoal.days === 2, 'sin editar se recalcula con las fechas');
console.log('test-operative-goal: OK');
