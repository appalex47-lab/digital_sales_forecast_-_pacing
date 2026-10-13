// Hallazgo 3.4: suficiencia del histórico ≠ precisión; backtesting reproducible.  node tools/test-forecast-backtest.js
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]).filter((f) => !/js\/(ui|app|export|worker)/.test(f));
const ctx = { console, Math, Date, JSON, Map, Set, Intl, Number, String, Array, Object, RegExp, Error, Promise, setTimeout, clearTimeout, parseFloat, isNaN, Symbol, Uint8Array, TextEncoder };
ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
srcs.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
const FP = ctx.FP, FE = FP.forecastEngine, Cal = FP.calendar;
let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const cfg = FE.effectiveConfig({});
const year = 2026;
const mk = (days, actualOf, planOf = () => 1000) => Array.from({ length: days }, (_, i) => {
  const date = Cal.toISODate(Cal.addDays(Cal.parseDate(`${year}-01-01`), i));
  const plan = planOf(i), a = actualOf(i);
  const blk = (rev) => ({ revenue: rev, orders: rev / 100, trafficVolume: rev / 2 });
  return { date, counted: a !== null, plan: blk(plan), actual: a === null ? null : blk(a) };
});

// terminología
t('historyAdequacy: excellent→sufficient (ya no se llama «excelente» por tener muchos días)', FE.historyAdequacy('excellent') === 'sufficient' && FE.historyAdequacy('limited') === 'limited' && FE.historyAdequacy('insufficient') === 'insufficient' && FE.historyAdequacy(null) === null);
t('etiquetas visibles hablan de histórico', FP.config.historyAdequacyLabels.sufficient === 'Histórico suficiente' && !/precis|confian/i.test(Object.values(FP.config.historyAdequacyLabels).join(' ')));

// desempeño constante +10 % → el método B predice casi perfecto, el plan sin ajustar no
const steady = mk(150, () => 1100);
const b = FE.backtestRows(steady, { methodId: 'B', cfg, year, horizon: 7 });
t('serie estable +10 %: evaluado, WAPE≈0 y mejor que el plan', b.status === 'evaluated' && b.wape < 0.01 && b.planWape > 0.08 && b.beatsPlan === true, b);
t('sesgo ≈ 0 en la serie estable', Math.abs(b.biasPct) < 0.01);
t('es reproducible (mismo resultado dos veces)', JSON.stringify(FE.backtestRows(steady, { methodId: 'B', cfg, year, horizon: 7 })) === JSON.stringify(b));
t('método A → no evaluado con motivo (su error es el del plan)', FE.backtestRows(steady, { methodId: 'A', cfg, year, horizon: 7 }).status === 'not_evaluated');

// cambio de tendencia: caída a partir del día 120 → el desempeño del pasado sobreestima (sesgo positivo)
const drop = mk(150, (i) => (i < 125 ? 1100 : 700));
const d = FE.backtestRows(drop, { methodId: 'B', cfg, year, horizon: 7 });
t('cambio de tendencia: error real visible y sesgo de SOBREestimación (>0)', d.status === 'evaluated' && d.wape > b.wape && d.biasPct > 0, d);

// histórico escaso
const few = mk(20, () => 1100);
const f = FE.backtestRows(few, { methodId: 'B', cfg, year, horizon: 7 });
t('histórico escaso → «no evaluada» con motivo (no se inventa precisión)', f.status === 'not_evaluated' && /corte|días|histórico/i.test(f.reason) && f.wape === null, f);
t('sin venta real → no evaluada', FE.backtestRows(mk(100, () => null), { methodId: 'B', cfg, year, horizon: 7 }).status === 'not_evaluated');
// ceros
const zeros = mk(150, (i) => (i % 10 === 0 ? 0 : 1100));
const z = FE.backtestRows(zeros, { methodId: 'B', cfg, year, horizon: 7 });
t('días con venta real = 0 se reportan y no rompen el cálculo', z.status === 'evaluated' && z.zeroDays > 0 && Number.isFinite(z.wape), z);
const allZero = FE.backtestRows(mk(150, () => 0), { methodId: 'B', cfg, year, horizon: 7 });
t('todo cero → no evaluada (WAPE indefinido)', allZero.status === 'not_evaluated');
// horizonte
t('horizonte 14 evaluable con histórico suficiente', FE.backtestRows(steady, { methodId: 'B', cfg, year, horizon: 14 }).status === 'evaluated');
// no modifica filas
const snap = JSON.stringify(steady); FE.backtestRows(steady, { methodId: 'C', cfg, year, horizon: 7 });
t('no muta las filas de entrada', JSON.stringify(steady) === snap);
console.log(bad ? `\n${bad} FALLAS` : '\nOK'); process.exit(bad ? 1 : 0);
