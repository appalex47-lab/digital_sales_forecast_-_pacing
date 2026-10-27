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
console.log(`${n - fails}/${n} pruebas de exposición ${fails ? 'FALLARON' : 'OK'}`);
process.exit(fails ? 1 : 0);
