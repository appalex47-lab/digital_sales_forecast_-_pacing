// Pruebas de la evaluación de promociones (js/promotions/promotionEvaluation.js). Uso: node tools/test-promotion-evaluation.js
global.window = global; global.FP = {};
require('../js/promotions/promotionEvaluation.js');
const EV = FP.promotionEvaluation; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const near = (a, b, t = 0.01) => typeof a === 'number' && Math.abs(a - b) <= t;
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

// Datos: del 2026-04-01 al 2026-06-30. Lunes a viernes 100 (50 en fin de semana) hasta el 14 de junio; del 15 al 21: 200 (100 en fin de semana).
// La base «vieja» (20 de abril al 17 de mayo) vale 120/60 para que haya segundo periodo comparable.
function build(from, to, skus) {
  const data = new Map(), dates = new Set();
  for (const d of EV.eachDay(from, to)) {
    dates.add(d); const m = new Map(), we = dow(d) === 0 || dow(d) === 6;
    skus.forEach((s) => { const promoWeek = d >= '2026-06-15' && d <= '2026-06-21'; const old = d >= '2026-04-20' && d <= '2026-05-17';
      const v = promoWeek ? (we ? 100 : 200) : old ? (we ? 60 : 120) : (we ? 50 : 100); m.set(s, { revenue: v, units: v / 10, orders: v / 20 }); });
    data.set(d, m);
  }
  return { data, dates, max: to };
}
const mkPromo = (id, skus, extra) => Object.assign({ promoId: id, name: id, channel: 'ecommerce', status: 'measuring', plannedStart: null, plannedEnd: null, skus: skus.map((s) => (typeof s === 'string' ? { sku: s, realStart: '2026-06-15', realEnd: '2026-06-21', origin: 'digital' } : s)) }, extra || {});

const daily = build('2026-04-01', '2026-06-30', ['X1', 'X2']);
let r = EV.compute(mkPromo('P1', ['X1']), daily, { promotions: [], events: [] });
let it = r.items[0];
ok('E1 se evalúa', it.status === 'ok' && r.counts.evaluable === 1, it);
ok('E2 la base respeta el día de la semana (600, no 7 × promedio)', near(it.expected.revenue, 600), it.expected);
ok('E3 venta durante = 1,200', near(it.actual.revenue, 1200));
ok('E4 crecimiento observado = +100 %', near(it.growth.revenue, 1, 1e-9), it.growth);
ok('E5 incremental = durante − base = 600', near(it.incremental.revenue, 600));
ok('E6 hay rango con el segundo periodo comparable', it.incremental.range && it.incremental.range[1] === 600 && it.incremental.range[0] < 600, it.incremental.range);
ok('E7 causal siempre no demostrado', r.concepts.causal.status === 'not_demonstrated' && /no establece causalidad/.test(r.concepts.causal.text));
ok('E8 sin objetivo numérico lo dice', r.concepts.objective.status === 'no_numeric_objective');
ok('E9 siempre avisa inventario no verificado y sin control', r.warnings.some((w) => w.code === 'inventory') && r.warnings.some((w) => w.code === 'no_control'));
ok('E10 la base son los 28 días previos al inicio', it.baseline.from === '2026-05-18' && it.baseline.to === '2026-06-14' && it.baseline.usable === 28, it.baseline);

// Día compartido: P2 publica el mismo SKU el miércoles y jueves; el incremental se reparte y la venta cuenta una vez
const P2 = mkPromo('P2', [{ sku: 'X1', realStart: '2026-06-17', realEnd: '2026-06-18' }]);
r = EV.compute(mkPromo('P1', ['X1']), daily, { promotions: [P2], events: [] }); it = r.items[0];
ok('E11 días compartidos = 2', it.daysShared === 2 && r.warnings.some((w) => w.code === 'shared_days'), it.daysShared);
ok('E12 el incremental reparte esos días (600 − 50 − 50)', near(it.incremental.revenue, 500), it.incremental);
ok('E13 la venta durante no se duplica', near(it.actual.revenue, 1200));
ok('E14 una promoción cancelada no cuenta como compartida', EV.compute(mkPromo('P1', ['X1']), daily, { promotions: [Object.assign({}, P2, { status: 'cancelled' })], events: [] }).items[0].daysShared === 0);
ok('E15 otra promoción de otro canal no cuenta', EV.compute(mkPromo('P1', ['X1']), daily, { promotions: [Object.assign({}, P2, { channel: 'app' })], events: [] }).items[0].daysShared === 0);

// Base contaminada: otra promoción en la base y un evento
const P3 = mkPromo('P3', [{ sku: 'X1', realStart: '2026-05-25', realEnd: '2026-05-27' }]);
r = EV.compute(mkPromo('P1', ['X1']), daily, { promotions: [P3], events: [{ startDate: '2026-05-20', endDate: '2026-05-20', name: 'Evento' }] }); it = r.items[0];
ok('E16 se sacan de la base los días de otra promoción y de eventos', it.baseline.usable === 24 && it.baseline.excluded.otherPromo === 3 && it.baseline.excluded.event === 1, it.baseline);
ok('E17 el aviso lo dice', r.warnings.some((w) => w.code === 'baseline_excluded'));

// No evaluable: pocos días con dato en la base
const short = build('2026-06-05', '2026-06-30', ['X1']);
r = EV.compute(mkPromo('P1', ['X1']), short, { promotions: [], events: [] });
ok('E18 con menos de 14 días de base no es evaluable y no suma', r.items[0].status === 'not_evaluable' && /utilizables/.test(r.items[0].reason) && r.totals.actual.revenue === 0 && r.concepts.incremental.revenue === null, r.items[0]);

// Fechas planeadas, venta parcial, sin fechas
r = EV.compute(mkPromo('P1', [{ sku: 'X1' }], { plannedStart: '2026-06-15', plannedEnd: '2026-06-21' }), daily, { promotions: [], events: [] });
ok('E19 usa fechas planeadas y lo avisa', r.items[0].status === 'ok' && r.warnings.some((w) => w.code === 'planned_dates'));
const part = build('2026-04-01', '2026-06-18', ['X1']);
r = EV.compute(mkPromo('P1', ['X1']), part, { promotions: [], events: [] });
ok('E20 venta cargada solo hasta el 18: resultado parcial con aviso', r.items[0].truncated === true && r.items[0].days === 4 && r.warnings.some((w) => w.code === 'partial'), r.items[0].days);
r = EV.compute(mkPromo('P1', [{ sku: 'X1' }]), daily, { promotions: [], events: [] });
ok('E21 sin fechas no es evaluable', r.items[0].status === 'not_evaluable' && /fechas/.test(r.items[0].reason));
r = EV.compute(mkPromo('P1', [{ sku: 'X1', realStart: '2026-07-10', realEnd: '2026-07-15' }]), daily, { promotions: [], events: [] });
ok('E22 futuro sin venta cargada no es evaluable', r.items[0].status === 'not_evaluable' && /Todavía no hay venta/.test(r.items[0].reason));

// Dos SKU: un evaluable y otro no; totales solo suman el evaluable
{ const d2 = build('2026-04-01', '2026-06-30', ['X1', 'X2']);
  r = EV.compute(mkPromo('P1', ['X1', { sku: 'X2' }]), d2, { promotions: [], events: [] });
  ok('E23 los totales solo suman SKU evaluables', r.counts.evaluable === 1 && near(r.totals.actual.revenue, 1200) && r.warnings.some((w) => w.code === 'not_evaluable'), r.counts); }

// Cambio de precio unitario derivado: unidades iguales, venta doble
{ const d3 = build('2026-04-01', '2026-06-30', ['X1']); d3.data.forEach((m, d) => { if (d >= '2026-06-15' && d <= '2026-06-21') m.get('X1').units = m.get('X1').units / 2; });
  r = EV.compute(mkPromo('P1', ['X1']), d3, { promotions: [], events: [] });
  ok('E24 avisa cambio de precio unitario derivado', r.items[0].warnings.some((w) => w.code === 'price_change')); }

// Puro: no cambia la promoción
{ const p = mkPromo('P1', ['X1']), before = JSON.stringify(p); EV.compute(p, daily, { promotions: [P2, P3], events: [] }); ok('E25 no modifica la promoción', JSON.stringify(p) === before); }


// Línea base congelada
{ const p = mkPromo('PF', ['X1'], { plannedStart: '2026-06-15', plannedEnd: '2026-06-21' });
  const fz = EV.freeze(p, daily, { now: '2026-06-10T00:00:00Z' });
  ok('F1 congela 56 días anteriores del SKU', fz.skus.X1.from === '2026-04-20' && fz.skus.X1.to === '2026-06-14' && fz.skus.X1.rows.length === 56 && fz.rows === 56, [fz.skus.X1.from, fz.skus.X1.to, fz.rows]);
  ok('F2 guarda ingreso y unidades, nada más', fz.skus.X1.rows[0].length === 3 && JSON.stringify(fz).indexOf('price') < 0);
  const pf = Object.assign({}, p, { baseline: fz });
  const changed = build('2026-04-01', '2026-06-30', ['X1']); // se «recarga» la venta con una base distinta
  for (const d of EV.eachDay('2026-05-18', '2026-06-14')) changed.data.get(d).set('X1', { revenue: 1000, units: 100, orders: 10 });
  const live = EV.compute(p, changed, { promotions: [], events: [] }).items[0], frozen = EV.compute(pf, changed, { promotions: [], events: [] }).items[0];
  ok('F3 sin congelar, la base sigue a la venta recargada', !near(live.expected.revenue, 600), live.expected);
  ok('F4 congelada, la base NO cambia aunque se recargue la venta', frozen.status === 'ok' && near(frozen.expected.revenue, 600) && frozen.baseline.frozen === true, frozen.expected);
  ok('F5 avisa que usa la base congelada', frozen.warnings.some((w) => w.code === 'baseline_frozen'));
  const tot = EV.compute(pf, changed, { promotions: [], events: [] });
  ok('F6 el resultado total lo menciona', tot.warnings.some((w) => w.code === 'baseline_frozen'));
  ok('F7 sin venta antes del inicio congela vacío', EV.freeze(p, { data: new Map(), dates: new Set(), max: null }, {}).rows === 0);
  const empty = Object.assign({}, p, { baseline: EV.freeze(p, { data: new Map(), dates: new Set(), max: null }, {}) });
  ok('F8 base congelada vacía: no evaluable (no usa la venta de hoy)', EV.compute(empty, daily, { promotions: [], events: [] }).items[0].status === 'not_evaluable');
  ok('F9 compute no modifica la base congelada', JSON.stringify(pf.baseline) === JSON.stringify(fz));
}

// Exclusiones congeladas y base desfasada
{ const other = { promoId: 'PO', name: 'PO', channel: 'ecommerce', status: 'approved', plannedStart: '2026-06-01', plannedEnd: '2026-06-07', skus: [{ sku: 'X1' }] };
  const p = mkPromo('PG', ['X1'], { plannedStart: '2026-06-15', plannedEnd: '2026-06-21' });
  const fz = EV.freeze(p, daily, { promotions: [other], events: [{ startDate: '2026-05-25', endDate: '2026-05-26' }] });
  ok('F10 congela los días de otra promoción y de evento', fz.skus.X1.excl.promo.length === 7 && fz.skus.X1.excl.event.length === 2 && fz.skus.X1.excl.promo[0] === '2026-06-01', fz.skus.X1.excl);
  const pf = Object.assign({}, p, { baseline: fz });
  const a = EV.compute(pf, daily, { promotions: [], events: [] }).items[0]; // hoy ya no hay otra promoción ni evento, pero la base los sigue sacando
  ok('F11 la base sigue sacando esos días aunque hoy ya no existan', a.baseline.excluded.otherPromo === 7 && a.baseline.excluded.event === 2, a.baseline.excluded);
  ok('F12 sin cambios no hay aviso de base desfasada', EV.staleBaseline(pf).length === 0 && !a.warnings.some((w) => w.code === 'baseline_moved'));
  const moved = JSON.parse(JSON.stringify(pf)); moved.skus[0].realStart = '2026-06-17'; moved.skus[0].realEnd = '2026-06-21';
  const b = EV.compute(moved, daily, { promotions: [], events: [] });
  ok('F13 si cambia el inicio real avisa y propone volver a congelar', EV.staleBaseline(moved)[0].frozenStart === '2026-06-15' && b.items[0].warnings.some((w) => w.code === 'baseline_moved') && b.warnings.some((w) => w.code === 'baseline_moved'), EV.staleBaseline(moved));
}

// Seguimiento durante la vigencia (venta cargada solo hasta el 17 de junio de una vigencia 15–21)
{ const part = build('2026-04-01', '2026-06-17', ['X1', 'X2']);
  const p = mkPromo('PT', ['X1', 'X2'], { plannedStart: '2026-06-15', plannedEnd: '2026-06-21', status: 'published' });
  const r = EV.compute(p, part, { promotions: [], events: [] }), T = EV.track(r);
  ok('T1 cuenta 3 de 7 días de avance', T.progress.withData === 3 && T.progress.total === 7 && near(T.progress.pct, 3 / 7, 1e-9), T.progress);
  ok('T2 acumula día a día (lun 15: real 400 vs base 200 con 2 SKU)', near(T.days[0].actual, 400) && near(T.days[0].expected, 200) && near(T.days[2].cumActual, 1200 + 0) , T.days.map((d) => d.cumActual));
  ok('T3 ritmo = real acumulado ÷ base − 1', near(T.pace, T.cum.actual / T.cum.expected - 1, 1e-9) && T.pace > 0);
  ok('T4 avisa que la venta llega solo al 17 y faltan 4 días', T.alerts.some((a) => /17/.test(a.text) && /4 días/.test(a.text)), T.alerts);
  ok('T5 sin SKU evaluables devuelve vacío', EV.track({ items: [] }).days.length === 0);
  // tres días seguidos por debajo de la base
  const low = build('2026-04-01', '2026-06-17', ['X1']); for (const d of ['2026-06-15', '2026-06-16', '2026-06-17']) low.data.get(d).set('X1', { revenue: 10, units: 1, orders: 1 });
  const T2 = EV.track(EV.compute(mkPromo('PL', ['X1'], { plannedStart: '2026-06-15', plannedEnd: '2026-06-17' }), low, { promotions: [], events: [] }));
  ok('T6 3 días por debajo de la base disparan atención', T2.alerts.some((a) => a.level === 'warn' && /3 días/.test(a.text)), T2.alerts);
  ok('T7 el seguimiento no modifica el resultado', JSON.stringify(EV.compute(p, part, { promotions: [], events: [] }).totals) === JSON.stringify(r.totals));
}

console.log(`${n - fails}/${n} pruebas OK`); process.exit(fails ? 1 : 0);
