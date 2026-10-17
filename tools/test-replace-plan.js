// Prueba de js/data/replace-plan.js. Uso: node tools/test-replace-plan.js
global.window = global; global.FP = {};
require('../js/data/replace-plan.js');
const RP = FP.replacePlan; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d) : ''); } };
const rec = (date, rev) => ({ key: `${date}|total|actual`, date, metrics: { revenue: { value: rev }, orders: { value: 1 } } });
const mk = (days, f) => days.map((d, i) => rec(d, f ? f(i) : 100));
const D = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(`2026-09-${String(i).padStart(2, '0')}`); return o; };

const old = RP.fromRecords(mk(D(1, 10)));
ok('resumen: filas y rango', old.rows === 10 && old.dateMin === '2026-09-01' && old.dateMax === '2026-09-10');
// igual
let c = RP.compare(old, RP.fromRecords(mk(D(1, 10))));
ok('igual: 10 iguales, sin banderas', c.same === 10 && c.added === 0 && c.changed === 0 && c.removed === 0 && !RP.assess(c).needsConfirm, c);
// agrega 2 días al final
c = RP.compare(old, RP.fromRecords(mk(D(1, 12))));
ok('crece: 2 nuevas, sin banderas', c.added === 2 && c.removed === 0 && !RP.assess(c).needsConfirm, c);
// quita último día → regla periodo
c = RP.compare(old, RP.fromRecords(mk(D(1, 9))));
let a = RP.assess(c);
ok('pierde 1 día al final → periodo', c.removed === 1 && a.flags.some((f) => f.id === 'period') && !a.flags.some((f) => f.id === 'rows'), a);
// quita primer día
c = RP.compare(old, RP.fromRecords(mk(D(2, 10))));
ok('pierde 1 día al inicio → periodo', RP.assess(c).flags.some((f) => f.id === 'period'));
// filas -30 % (hueco en medio, mismo periodo)
const holes = D(1, 10).filter((d) => !['2026-09-03', '2026-09-05', '2026-09-07'].includes(d));
c = RP.compare(old, RP.fromRecords(mk(holes)));
a = RP.assess(c);
ok('-30 % filas → rows, sin periodo', a.flags.some((f) => f.id === 'rows') && !a.flags.some((f) => f.id === 'period'), a);
// -20 % exacto no dispara (umbral es "más de")
const h2 = D(1, 10).filter((d) => !['2026-09-03', '2026-09-05'].includes(d));
ok('-20 % exacto no dispara filas', !RP.assess(RP.compare(old, RP.fromRecords(mk(h2)))).flags.some((f) => f.id === 'rows'));
// venta +6 % en días comunes
c = RP.compare(old, RP.fromRecords(mk(D(1, 10), () => 106)));
a = RP.assess(c);
ok('venta +6 % → revenue, 10 cambiadas', a.flags.some((f) => f.id === 'revenue') && c.changed === 10 && Math.abs(c.overlapPct - 0.06) < 1e-9, c);
c = RP.compare(old, RP.fromRecords(mk(D(1, 10), () => 104)));
ok('venta +4 % no dispara', !RP.assess(c).flags.some((f) => f.id === 'revenue'));
// la venta sólo se mide en días comunes: días extra no cuentan
c = RP.compare(old, RP.fromRecords(mk(D(1, 14))));
ok('días extra no mueven la regla de venta', c.overlapPct === 0 && c.overlapDays === 10);
// umbrales ajustables
ok('umbral ajustable (venta 10 %)', !RP.assess(RP.compare(old, RP.fromRecords(mk(D(1, 10), () => 106))), { revenueChangePct: 0.1 }).flags.some((f) => f.id === 'revenue'));
ok('umbral ajustable (filas 40 %)', !RP.assess(RP.compare(old, RP.fromRecords(mk(holes))), { rowsDropPct: 0.4 }).flags.some((f) => f.id === 'rows'));
// productos (sin llaves): rangos y filas
const pb = (acc, a0, a1, dr) => RP.fromProductBatch({ summary: { accepted: acc, dateMin: a0, dateMax: a1, dayRev: dr } });
c = RP.compare(pb(1000, '2026-09-01', '2026-09-30', { '2026-09-01': 100 }), pb(700, '2026-09-01', '2026-09-30', { '2026-09-01': 100 }));
a = RP.assess(c);
ok('productos: -30 % filas', a.flags.length === 1 && a.flags[0].id === 'rows' && c.added === null, a);
c = RP.compare(pb(1000, '2026-09-01', '2026-09-30', null), pb(1000, '2026-09-02', '2026-09-30', null));
ok('productos sin dayRev: no evalúa venta, sí periodo', c.overlapPct === null && RP.assess(c).flags[0].id === 'period');
// lote anterior sin fechas / vacío
c = RP.compare(RP.fromRecords([]), RP.fromRecords(mk(D(1, 3))));
ok('anterior vacío: sin banderas', !RP.assess(c).needsConfirm);
console.log(fails ? `FALLAS ${fails}/${n}` : `OK ${n}/${n}`); process.exit(fails ? 1 : 0);
