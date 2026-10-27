// Pruebas de «Exposición» sin oferta (js/promotions/exposureStore.js). Uso: node tools/test-exposures.js
global.window = global; global.FP = {};
require('../js/promotions/exposureStore.js'); require('../js/promotions/offerStore.js'); require('../js/promotions/summaryEngine.js');
const E = FP.exposures; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const reg = E.createRegistry(), it = (sku) => ({ sku, name: `P${sku}`, category: 'C', lab: 'LAB', reasons: ['r'] });
ok('E1 sin nombre no expone', !E.add(reg, [it('1')], {}).ok && !reg.items.length);
ok('E2 fechas inválidas o invertidas se rechazan', !E.add(reg, [it('1')], { by: 'Ana', start: '2026-13-01' }).ok && !E.add(reg, [it('1')], { by: 'Ana', start: '2026-11-10', end: '2026-11-01' }).ok && reg.batchSeq === 0, reg);
const a = E.add(reg, [it('1'), it('2')], { by: 'Ana', start: '2026-11-01', end: '2026-11-10', today: '2026-10-26' });
ok('E3 crea una por SKU con folio EXP-0001, vigente por fechas', a.ok && a.created.length === 2 && a.batchId === 'EXP-0001' && a.created[0].expId === 'E-00001' && a.created[0].createdBy === 'Ana');
ok('E4 estado por fechas: por empezar, vigente, terminada', E.status(reg.items[0], '2026-10-26') === 'upcoming' && E.status(reg.items[0], '2026-11-05') === 'active' && E.status(reg.items[0], '2026-11-11') === 'ended');
ok('E5 sin fechas queda abierta (vigente)', (() => { const r = E.createRegistry(); E.add(r, [it('9')], { by: 'Luis' }); return E.status(r.items[0], '2030-01-01') === 'active'; })());
ok('E6 no repite una vigente ni una por empezar', (() => { const c = E.add(reg, [it('1'), it('3')], { by: 'Luis', today: '2026-10-26' }); return c.ok && c.created.length === 1 && c.skipped[0] === '1'; })());
ok('E7 todo repetido falla y no gasta folio', (() => { const b = reg.batchSeq; const c = E.add(reg, [it('1')], { by: 'Luis', today: '2026-10-26' }); return !c.ok && reg.batchSeq === b; })());
ok('E8 una terminada permite volver a exponer', (() => { const c = E.add(reg, [it('1')], { by: 'Luis', today: '2026-12-01' }); return c.ok && c.created.length === 1; })());
ok('E9 quitar pide nombre, guarda quién y solo sirve si está activa', (() => { const id = reg.items[1].expId; return !E.remove(reg, id, {}).ok && E.remove(reg, id, { by: 'Luis' }).ok && reg.items[1].history.length === 2 && !E.remove(reg, id, { by: 'Luis' }).ok && E.currentFor(reg, '2', '2026-11-05') === null; })());
ok('E10 resumen', (() => { const s = E.summary(reg, '2026-11-05'); return s.removed === 1 && s.active >= 1; })(), E.summary(reg, '2026-11-05'));
ok('E11 se guarda y se lee', (() => { const h = E.hydrate(JSON.parse(JSON.stringify(reg))); return h.items.length === reg.items.length && h.seq === reg.seq && E.hydrate(null).items.length === 0 && E.hydrate({ items: [{ x: 1 }] }).items.length === 0; })());
// No cuenta como oferta: el registro de ofertas y el resumen no lo ven
ok('E12 no hay ofertas por exponer: el registro de ofertas sigue vacío', FP.offers.createRegistry().offers.length === 0);
// Medición: la exposición se convierte en una «promoción» solo para el motor de evaluación
{ const r2 = E.createRegistry(); E.add(r2, [it('1'), it('2'), it('3')], { by: 'Ana', start: '2026-10-05', end: '2026-10-12', today: '2026-10-01' });
  E.add(r2, [it('7')], { by: 'Ana', today: '2026-10-01' });
  const bs = E.batches(r2);
  ok('M1 agrupa por folio y separa los que no tienen fecha de inicio', bs.length === 2 && bs[1].measurable.length === 3 && bs[0].measurable.length === 0 && bs[0].noStart === 1, bs.map((b) => [b.batchId, b.measurable.length, b.noStart]));
  const p = E.asPromotion(bs[1], '2026-10-30');
  ok('M2 la ventana de cada SKU sale de sus fechas', p.skus.length === 3 && p.skus.every((s) => s.realStart === '2026-10-05' && s.realEnd === '2026-10-12') && p.plannedStart === '2026-10-05' && p.plannedEnd === '2026-10-12' && p.channel === 'total' && p.baseline === null);
  E.add(r2, [it('8')], { by: 'Ana', start: '2026-10-20', today: '2026-10-01' });
  ok('M3 sin fecha de fin se mide hasta la última venta cargada', E.asPromotion(E.batches(r2)[0], '2026-10-30').skus[0].realEnd === '2026-10-30');
  const id = r2.items.find((e) => e.sku === '8').expId; E.remove(r2, id, { by: 'Ana', now: '2026-10-25T10:00:00.000Z' });
  ok('M4 si se quitó antes del fin, se mide hasta el día en que se quitó', E.asPromotion(E.batches(r2)[0], '2026-10-30').skus[0].realEnd === '2026-10-25');
  // con el motor real
  require('../js/promotions/promotionEvaluation.js');
  const dates = new Set(), data = new Map(); const PE = FP.promotionEvaluation;
  PE.eachDay('2026-08-01', '2026-10-15').forEach((d) => { dates.add(d); const m = new Map(); ['1', '2', '3'].forEach((s) => m.set(s, { revenue: d >= '2026-10-05' ? 200 : 100, units: 10, orders: 5 })); data.set(d, m); });
  const res = PE.compute(p, { data, dates, max: '2026-10-15' }, { promotions: [], events: [] });
  ok('M5 mide: venta real contra línea base, sube 100 % y no afirma causalidad', res.counts.evaluable === 3 && Math.abs(res.concepts.observedGrowth.revenue - 1) < 1e-9 && res.concepts.causal.status === 'not_demonstrated', res.concepts.observedGrowth); }
console.log(`${n - fails}/${n} pruebas de exposición ${fails ? 'FALLARON' : 'OK'}`);
process.exit(fails ? 1 : 0);
