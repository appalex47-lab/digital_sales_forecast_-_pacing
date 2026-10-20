// Lectura explicable de métodos A/B/C/D (semáforo, sugerencia, rango, conciliación del Total).  node tools/test-method-advisor.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/forecast/methodAdvisor.js', 'utf8'), ctx);
const MA = ctx.FP.methodAdvisor; let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const ix = (cd) => ({ revenue: { comparableDays: cd }, orders: { comparableDays: cd } });
const ent = (fc, hist, fb = 0, cd = 40) => ({ annual: { forecast: { revenue: fc } }, historyAdequacy: hist, fallbackDays: fb, assumptions: { indices: ix(cd) } });
const mkRun = (o) => ({ method: { id: 'A' }, settings: { minComparableDays: 5 },
  channels: { ecommerce: { annual: { plan: { revenue: 1000 }, countedDays: o.counted ?? 30, toDate: { revenue: { gap: -50 } } }, days: [] } },
  total: { annual: { plan: { revenue: 1000 }, countedDays: o.counted ?? 30, toDate: { revenue: { gap: -40 } } }, days: [] },
  comparison: { byChannel: { ecommerce: { A: ent(980, null), B: o.B, C: o.C, D: o.D } }, total: { A: { forecast: { revenue: 980 } }, B: { forecast: { revenue: 970 }, historyAdequacy: 'sufficient' }, C: { forecast: { revenue: 970 }, historyAdequacy: 'sufficient' }, D: { forecast: null, historyAdequacy: 'insufficient' } } } });
const base = { B: ent(970, 'sufficient'), C: ent(965, 'sufficient'), D: ent(960, 'sufficient') };
let a = MA.advise({ run: mkRun(base), channel: 'ecommerce' });
t('todos verdes y B≈C → sugiere B (estable)', a.suggestion.method === 'B' && a.suggestion.rule === 'stable' && a.methods.B.light === 'green', a.suggestion);
t('A siempre verde (línea base)', a.methods.A.light === 'green');
t('el método vigente no cambia: solo se sugiere', a.suggestion.current === 'A' && a.suggestion.differsFromCurrent === true);
a = MA.advise({ run: mkRun({ ...base, C: ent(930, 'limited', 0, 14) }), channel: 'ecommerce' });
t('B y C se separan ≥ 2 % de la meta → sugiere C con divergencia y C en amarillo', a.suggestion.method === 'C' && a.suggestion.rule === 'divergence' && a.methods.C.light === 'yellow', [a.suggestion, a.methods.C.light]);
t('rango de cierre entre métodos utilizables', a.range && a.range.min === 930 && a.range.max === 980 && Math.abs(a.range.spreadPct - 0.05) < 1e-9, a.range);
a = MA.advise({ run: mkRun({ ...base, D: ent(null, 'insufficient') }), channel: 'ecommerce' });
t('índice insuficiente → rojo y fuera del rango', a.methods.D.light === 'red' && a.range.max === 980, a.methods.D);
a = MA.advise({ run: mkRun({ ...base, D: ent(960, 'sufficient', 6) }), channel: 'ecommerce' });
t('fallback → amarillo con motivo', a.methods.D.light === 'yellow' && /fallback/.test(a.methods.D.reasons.join(' ')), a.methods.D);
a = MA.advise({ run: mkRun({ ...base, counted: 3 }), channel: 'ecommerce' });
t('pocos días contados → A', a.suggestion.method === 'A' && a.suggestion.rule === 'few_days', a.suggestion);
const bt = { byChannel: { ecommerce: { B: { 7: { status: 'evaluated', wape: 0.08, planWape: 0.1 } }, C: { 7: { status: 'evaluated', wape: 0.05, planWape: 0.1 } }, D: { 7: { status: 'not_evaluated' } } } } };
a = MA.advise({ run: mkRun(base), channel: 'ecommerce', backtest: bt });
t('backtest: gana el de menor error si bate al plan por margen (C 5 % vs 10 %; B 8 % no alcanza el margen del 90 %)', a.suggestion.method === 'C' && a.suggestion.rule === 'backtest', a.suggestion);
a = MA.advise({ run: mkRun(base), channel: 'total', backtest: bt });
t('Total: el backtest por canal no se usa para sugerir', a.suggestion.rule !== 'backtest');
// conciliación del Total
const run = mkRun(base);
const d = (date, counted, closed = true) => ({ date, counted, closed });
run.channels = { ecommerce: { annual: { toDate: { revenue: { gap: -50 } } }, days: [d('2026-09-20', true), d('2026-09-21', true), d('2026-09-22', true)] },
  whatsapp: { annual: { toDate: { revenue: { gap: -20 } } }, days: [d('2026-09-20', true), d('2026-09-21', false), d('2026-09-22', false)] } };
run.total = { annual: { plan: { revenue: 1000 }, toDate: { revenue: { gap: -60 } } }, days: [d('2026-09-20', true), d('2026-09-21', false), d('2026-09-22', false)] };
const rc = MA.totalReconciliation(run);
t('conciliación: 2 días excluidos por falta de real de whatsapp, en un rango', rc.excludedDays === 2 && JSON.stringify(rc.byChannel) === JSON.stringify({ whatsapp: [['2026-09-21', '2026-09-22']] }), rc);
t('conciliación: suma de canales −70, Total estricto −60, diferencia −10', rc.sumChannelsGap === -70 && rc.totalGap === -60 && rc.difference === -10, rc);
const ok = { ...run, total: { ...run.total, days: [d('2026-09-20', true), d('2026-09-21', true), d('2026-09-22', true)] } };
t('sin días excluidos → 0', MA.totalReconciliation(ok).excludedDays === 0);
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
