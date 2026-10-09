// Pruebas unitarias de pvmEngine y planBridgeEngine (identidades exactas).  node tools/test-pvm-bridge.js
const path = require('path'); global.FP = {};
require(path.join(__dirname, '../js/analytics/pvmEngine.js')); require(path.join(__dirname, '../js/analytics/planBridgeEngine.js'));
let ok = 0, bad = 0; const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); c ? ok++ : bad++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
// Caso conocido: A sube volumen sin cambiar precio; B sube precio sin volumen.
let r = FP.pvmEngine.analyze([{ entity: 'A', r0: 1000, u0: 100, r1: 1500, u1: 150 }, { entity: 'B', r0: 2000, u0: 100, r1: 2200, u1: 100 }]);
t('PVM Σ = Δ', r.reconciliation.ok && near(r.total.delta, 700), r.reconciliation);
t('PVM precio puro de B = 200', near(r.rows.find(x => x.entity === 'B').price, 200), r.rows);
t('PVM sin nuevos/perdidos', r.total.newItems === 0 && r.total.lost === 0);
t('PVM status available', r.status === 'available');
// Con nuevos, perdidos y sin unidades
r = FP.pvmEngine.analyze([{ entity: 'A', r0: 1000, u0: 100, r1: 800, u1: 70 }, { entity: 'N', r0: 0, u0: 0, r1: 500, u1: 20 }, { entity: 'L', r0: 400, u0: 10, r1: 0, u1: 0 },
  { entity: 'X', r0: 300, u0: null, r1: 350, u1: null }, { entity: 'C', r0: 600, u0: 50, r1: 900, u1: 60 }]);
t('PVM con nuevos/perdidos/sin unidades concilia', r.reconciliation.ok && near(r.total.delta, -200 + 500 - 400 + 50 + 300), r.reconciliation);
t('PVM Nuevo = venta actual', near(r.total.newItems, 500)); t('PVM Perdido = −venta base', near(r.total.lost, -400)); t('PVM sin unidades = 50', near(r.total.noUnits, 50));
t('PVM kinds', ['new', 'lost', 'no_units'].every(k => r.rows.some(x => x.kind === k)));
// Volumen + Mezcla por entidad = p0·(u1−u0); Σ mezcla = 0 en unidades iguales
r = FP.pvmEngine.analyze([{ entity: 'A', r0: 100, u0: 10, r1: 200, u1: 20 }, { entity: 'B', r0: 100, u0: 10, r1: 50, u1: 5 }]);
t('PVM Σ mezcla + Σ volumen = p0·Δu', near(r.total.volume + r.total.mix, 10 * 10 + 10 * -5), r.total);
// Sin unidades en nadie
r = FP.pvmEngine.analyze([{ entity: 'A', r0: 100, u0: null, r1: 200, u1: null }]);
t('PVM sin unidades válidas → unavailable', r.status === 'unavailable' && r.reconciliation.ok);
t('PVM vacío → insufficient_data', FP.pvmEngine.analyze([]).status === 'insufficient_data');
// Aleatorio: 200 corridas concilian
let allOk = true; for (let k = 0; k < 200; k++) { const rows = []; for (let i = 0; i < 12; i++) { const z = () => Math.random() < .15; const u0 = z() ? 0 : Math.round(Math.random() * 50), u1 = z() ? 0 : Math.round(Math.random() * 50);
  rows.push({ entity: 'e' + i, r0: u0 ? u0 * (5 + Math.random() * 20) : (Math.random() < .3 ? 100 : 0), u0: Math.random() < .1 ? null : u0, r1: u1 ? u1 * (5 + Math.random() * 20) : (Math.random() < .3 ? 80 : 0), u1: Math.random() < .1 ? null : u1 }); }
  const q = FP.pvmEngine.analyze(rows); if (q.status !== 'insufficient_data' && !q.reconciliation.ok) { allOk = false; console.log(q.reconciliation); break; } }
t('PVM 200 corridas aleatorias concilian', allOk);
// Puente
const plan = { total: 1000, byChannel: { a: { plan: 600, actual: 500 }, b: { plan: 400, actual: 300 } }, coverage: 1 };
let b = FP.planBridgeEngine.analyze({ rows: [{ entity: 'X', current: 500, baseline: 600 }, { entity: 'Y', current: 300, baseline: 200 }, { entity: 'Z', current: 0, baseline: 100 }], plan, actual: 800, baselineTotal: 900 });
t('Puente brecha = real − meta', near(b.gap, -200) && b.status === 'available', b);
t('Puente Σ contribuciones = brecha', b.reconciliation.ok, b.reconciliation);
t('Puente Σ canales = brecha', b.reconciliation.channelOk === true, b.reconciliation);
t('Puente observado − esperado = brecha', near(b.observed - b.expected, b.gap));
b = FP.planBridgeEngine.analyze({ rows: [], plan: { total: null, message: 'sin meta' }, actual: 1, baselineTotal: 1 });
t('Puente sin meta → unavailable con mensaje', b.status === 'unavailable' && b.message === 'sin meta');
b = FP.planBridgeEngine.analyze({ rows: [{ entity: 'X', current: 5, baseline: 5 }], plan: { total: 10, byChannel: null, coverage: 0.5 }, actual: 5, baselineTotal: 5 });
t('Puente cobertura parcial → partial + mensaje', b.status === 'partial' && /50 %/.test(b.message));
console.log(`\n${ok} ok, ${bad} fallan`); process.exit(bad ? 1 : 0);
