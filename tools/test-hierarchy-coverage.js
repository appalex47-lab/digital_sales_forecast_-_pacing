// Hallazgo 3.1: conciliación de jerarquías con cobertura.  node tools/test-hierarchy-coverage.js  (desde la raíz)
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]).filter((f) => !/js\/(ui|app|export|worker)/.test(f));
const ctx = { console, Math, Date, JSON, Map, Set, Intl, Number, String, Array, Object, RegExp, Error, Promise, setTimeout, clearTimeout, parseFloat, isNaN, Symbol, Uint8Array, TextEncoder };
ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
srcs.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
const M = ctx.FP.metrics, DM = ctx.FP.dataModel;
let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const v = (p, c, tol, o) => M.validateHierarchy(p, c, tol, o);

t('completo y cuadra → reconciled/pass', v(100, [40, 60]).state === 'reconciled' && v(100, [40, 60]).status === 'pass');
t('completo y no cuadra → discrepancy/warning', v(100, [40, 50]).state === 'discrepancy' && v(100, [40, 50]).status === 'warning');
t('cero real cuenta como hijo presente', v(100, [100, 0]).state === 'reconciled' && v(100, [100, 0]).coverage.missing === 0);
t('null NO es cero: padre 100, hijos [100, null] → cobertura incompleta (antes "pass")', v(100, [100, null]).state === 'incomplete_coverage' && v(100, [100, null]).status === 'incomplete');
t('suma parcial menor al padre → cobertura incompleta, no discrepancia falsa', v(100, [40, null, 30]).state === 'incomplete_coverage');
t('undefined y "" se tratan como desconocidos', v(100, [100, undefined, '']).coverage.missing === 2);
t('sin hijos con valor → no evaluable', v(100, [null, null]).state === 'not_evaluable' && v(100, [null, null]).status === 'na');
t('sin padre → no evaluable', v(null, [1, 2]).state === 'not_evaluable');
t('hijos esperados fijados por opts.expected (hijo ausente al final)', v(100, [100], undefined, { expected: 2 }).state === 'incomplete_coverage');
t('llaves duplicadas → discrepancy aunque la suma cuadre', v(100, [50, 50], undefined, { keys: ['a', 'a'] }).state === 'discrepancy' && v(100, [50, 50], undefined, { keys: ['a', 'a'] }).duplicateKeys[0] === 'a');
t('decimales: 0.1+0.2 vs 0.3 cuadra por tolerancia', v(0.3, [0.1, 0.2]).state === 'reconciled');
t('decimales: importe de millones con redondeo de centavos cuadra', v(261000000, [151400000.004, 62000000, 31900000, 15699999.996]).state === 'reconciled');
t('diferencia real mayor a la tolerancia se detecta', v(1000000, [500000, 499000]).state === 'discrepancy');
t('periodo incompleto (meses 1-9 de 12 con valor) → incompleta', v(1200, [100, 100, 100, 100, 100, 100, 100, 100, 100, null, null, null]).coverage.present === 9 && v(1200, [100, 100, 100, 100, 100, 100, 100, 100, 100, null, null, null]).state === 'incomplete_coverage');
t('sumNullable conserva su contrato', M.sumNullable([1, null, undefined, '2']) === 3 && M.sumNullable([null]) === null);
// integración con metas
const tg = DM.createTargets(2026); tg.annual.revenue = 100;
const chs = ctx.FP.config.channelIds;
chs.forEach((id, i) => { tg.byChannel[id] = { revenue: i < chs.length - 1 ? 25 : null }; });
t('metas con un canal sin capturar → cobertura incompleta (no "difiere")', DM.validateTargets(tg).state === 'incomplete_coverage' && DM.validateTargets(tg).coverage.missing === 1, DM.validateTargets(tg));
chs.forEach((id) => { tg.byChannel[id] = { revenue: 25 }; });
t('metas completas que cuadran → reconciled', DM.validateTargets(tg).state === 'reconciled');
chs.forEach((id) => { tg.byChannel[id] = { revenue: 0 }; });
t('metas con ceros reales → discrepancia contra meta anual', DM.validateTargets(tg).state === 'discrepancy');
console.log(bad ? `\n${bad} FALLAS` : '\nOK'); process.exit(bad ? 1 : 0);
