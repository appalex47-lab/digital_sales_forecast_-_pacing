// Pruebas de eliminar ofertas y promociones y del conteo de acciones (removalEngine.js, guideEngine.js). Uso: node tools/test-removal.js
global.window = global; global.FP = {};
require('../js/promotions/offerStore.js'); require('../js/promotions/promotionStore.js'); require('../js/promotions/activationEngine.js'); require('../js/promotions/guideEngine.js'); require('../js/promotions/removalEngine.js');
const O = FP.offers, P = FP.promotions, R = FP.removal, G = FP.guide, A = FP.activation; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

const reg = O.createRegistry(), pr = P.createRegistry();
const man = (sku, extra) => O.captureManual(reg, Object.assign({ sku, name: 'Producto ' + sku, controlled: 'Ningún Control', discount: '30', start: '2026-11-01', end: '2026-11-15', campaignName: 'Camp A' }, extra || {}), { by: 'Persona A', now: '2026-10-26T10:00:00.000Z' });
['S1', 'S2', 'S3', 'S4'].forEach((s) => man(s)); man('S5', { campaignName: 'Camp B' });
const id = (sku) => reg.offers.find((o) => o.sku === sku).offerId;
O.setState(reg, id('S2'), 'validated', { by: 'P' }); O.setState(reg, id('S3'), 'validated', { by: 'P' }); O.setState(reg, id('S3'), 'selected', { by: 'P' });
O.setState(reg, id('S4'), 'discarded', { by: 'P', note: 'no va' });
// S2 va a una promoción
const created = P.createPromotion(pr, { name: 'Dermo noviembre', createdBy: 'Persona A' }); const pid = created.promotion.promoId;
P.addSku(pr, pid, O.toPromotionSku(reg.offers.find((o) => o.sku === 'S2')), 'Persona A'); O.addNote(reg, id('S2'), `Agregada a la promoción ${pid}`, 'Persona A');

// 1. Reglas de ofertas
let plan = R.offerPlan(reg, pr, reg.offers.map((o) => o.offerId));
ok('E1 se pueden eliminar Recibidas, Validadas sin promoción y Descartadas', plan.ok.map((o) => o.sku).sort().join() === 'S1,S4,S5', plan.ok.map((o) => o.sku));
ok('E2 la Seleccionada y la que está en una promoción no, y se dice por qué', plan.blocked.length === 2 && plan.blocked.some((b) => /Seleccionada/.test(b.why)) && plan.blocked.some((b) => /Dermo noviembre/.test(b.why)), plan.blocked.map((b) => b.why));
const before = reg.offers.length;
let r = R.removeOffers(reg, pr, [id('S1'), id('S3')]);
ok('E3 elimina las permitidas y deja las bloqueadas', r.ok && r.removed.length === 1 && reg.offers.length === before - 1 && reg.offers.some((o) => o.sku === 'S3'), r.blocked && r.blocked.length);
ok('E4 si nada se puede eliminar, falla sin tocar', !R.removeOffers(reg, pr, [id('S3')]).ok && reg.offers.some((o) => o.sku === 'S3'));
// 2. Archivo completo: el lote desaparece solo si se queda sin ofertas; deshacer lo restaura
const bB = reg.offers.find((o) => o.sku === 'S5').batchId; const nb = reg.batches.length;
r = R.removeOffers(reg, pr, reg.offers.filter((o) => o.batchId === bB).map((o) => o.offerId));
ok('F1 al eliminar todo un archivo, el lote también sale', r.ok && reg.batches.length === nb - 1 && !reg.batches.some((b) => b.batchId === bB));
R.restoreOffers(reg, r.snapshot);
ok('F2 deshacer restaura ofertas y lote en su lugar', reg.offers.some((o) => o.sku === 'S5') && reg.batches.some((b) => b.batchId === bB) && reg.batches.length === nb);
ok('F3 los identificadores de oferta no se reutilizan', (() => { man('S9'); const ids = reg.offers.map((o) => o.offerId); return new Set(ids).size === ids.length; })());

// 3. Promociones: toda promoción se puede eliminar; las que ya avanzaron piden confirmación reforzada
ok('P1 borrador se puede eliminar sin aviso reforzado', R.promoPlan(P.find(pr, pid)).ok && !R.promoPlan(P.find(pr, pid)).heavy);
const p2 = P.createPromotion(pr, { name: 'Otra', createdBy: 'Persona A', plannedStart: '2026-11-01', plannedEnd: '2026-11-15' }).promotion; P.addSku(pr, p2.promoId, { sku: 'X1', name: 'x', origin: 'digital', reason: 'r' }, 'Persona A');
P.setStatus(pr, p2.promoId, 'proposed', { by: 'Persona A' });
ok('P2 propuesta sin aprobar: sin aviso reforzado', R.promoPlan(P.find(pr, p2.promoId)).ok && !R.promoPlan(P.find(pr, p2.promoId)).heavy);
P.setStatus(pr, p2.promoId, 'approved', { by: 'Persona B', approvedBy: 'Persona B' });
const pl3 = R.promoPlan(P.find(pr, p2.promoId));
ok('P3 aprobada: se puede eliminar, con aviso reforzado y su impacto', pl3.ok && pl3.heavy && pl3.impact.length >= 1, pl3);
ok('P4 sin confirmar el aviso reforzado no se elimina', !R.removePromotion(pr, reg, p2.promoId, { by: 'P', reason: 'x' }).ok && !!P.find(pr, p2.promoId));
const rp2 = R.removePromotion(pr, reg, p2.promoId, { by: 'Persona A', reason: 'Ya no va', ack: true });
ok('P5 confirmada, se elimina y se puede restaurar con su historial', rp2.ok && !P.find(pr, p2.promoId) && R.restorePromotion(pr, rp2.snapshot) && P.find(pr, p2.promoId).history.length > 2);
const p3 = P.createPromotion(pr, { name: 'Prueba', createdBy: 'Persona A' }).promotion; P.setStatus(pr, p3.promoId, 'cancelled', { by: 'Persona A', note: 'error' });
ok('P5b cancelada que nunca avanzó: sin aviso reforzado', R.promoPlan(P.find(pr, p3.promoId)).ok && !R.promoPlan(P.find(pr, p3.promoId)).heavy);
ok('P6 hace falta nombre y motivo', !R.removePromotion(pr, reg, pid, { by: '', reason: 'x' }).ok && !R.removePromotion(pr, reg, pid, { by: 'P', reason: '' }).ok);
const rp = R.removePromotion(pr, reg, pid, { by: 'Persona A', reason: 'Creada por error' });
ok('P7 elimina la promoción y libera sus ofertas', rp.ok && !P.find(pr, pid) && rp.released.length === 1 && !G.addedToPromo(reg.offers.find((o) => o.sku === 'S2')));
const again = P.createPromotion(pr, { name: 'Dermo noviembre', createdBy: 'Persona A' }).promotion.promoId;
ok('P8 el identificador eliminado no se reutiliza', again !== pid && Number(/PRM-\d{4}-(\d{4})/.exec(again)[1]) > Number(/PRM-\d{4}-(\d{4})/.exec(pid)[1]), [pid, again]);
ok('P9 deshacer restaura la promoción y su identificador', R.restorePromotion(pr, rp.snapshot) && !!P.find(pr, pid) && !pr.retired.includes(pid));
ok('P10 el registro hidrata sin perder los identificadores retirados', P.hydrate(JSON.parse(JSON.stringify({ ...pr, retired: ['PRM-2026-0099-X'] }))).retired.includes('PRM-2026-0099-X'));
const pe = P.createPromotion(pr, { name: 'Con corte', createdBy: 'Persona A' }).promotion; pe.evaluations = [{ at: '2026-10-01' }];
ok('P11 con cortes de evaluación también es reforzado', R.promoPlan(pe).heavy && R.promoPlan(pe).impact.some((t) => /corte/.test(t)));

// 4. Registro de eliminaciones
const log = R.emptyLog(); R.addLog(log, { kind: 'offers', what: 'Archivo demo.xlsx', n: 9, by: 'Persona A', reason: 'Archivo cargado por error' });
ok('L1 una línea por eliminación, la más reciente primero', log.entries.length === 1 && log.entries[0].n === 9 && R.addLog(log, { kind: 'promotion', what: 'X', by: 'B', reason: 'r' }).entries[0].what === 'X');
ok('L2 el registro no guarda precios ni descuentos', !JSON.stringify(log).match(/discount|precio|price/i));
ok('L3 hidrata y descarta basura', R.hydrateLog({ entries: [{ at: '2026-10-26', what: 'a' }, null, { what: 'sin fecha' }] }).entries.length === 1 && R.hydrateLog(null).entries.length === 0);
const big = R.emptyLog(); for (let i = 0; i < 230; i++) R.addLog(big, { kind: 'offers', what: 'o' + i, by: 'P', reason: 'r' });
ok('L4 el registro se limita a 200 líneas', big.entries.length === 200 && big.entries[0].what === 'o229');

// 5. Una oferta quitada de una promoción vuelve a quedar pendiente
const o2 = reg.offers.find((o) => o.sku === 'S2'); O.addNote(reg, o2.offerId, `Agregada a la promoción ${pid}`, 'P'); O.addNote(reg, o2.offerId, `Quitada de la promoción ${pid}`, 'P');
ok('Q1 «Quitada» después de «Agregada» deja la oferta libre; otra «Agregada» la vuelve a marcar', !G.addedToPromo(o2) && (O.addNote(reg, o2.offerId, `Agregada a la promoción ${pid}`, 'P'), G.addedToPromo(o2)));

// 6. Conteo de acciones sugeridas
const rec = (key, tab, sku, main, pri, conf, extra) => [key, Object.assign({ key, tab, sku, main, priority: pri, confidence: conf, blocked: false, missing: [] }, extra || {})];
const recs = new Map([rec('offer:1', 'offer', 'A', 'Banner principal', 'Alta', 'Alta'), rec('offer:2', 'offer', 'B', 'Cuadrícula Home', 'Media', 'Alta', { missing: ['Costo de pauta'] }), rec('offer:3', 'offer', 'B', 'Cuadrícula Home', 'Media', 'Alta', { missing: ['Costo de pauta'] }),
  rec('offer:4', 'offer', 'C', 'Cuadrícula Home', 'Alta', 'Media', { missing: ['Costo de pauta', 'Precio de la competencia'] }), rec('offer:5', 'offer', 'D', 'No activar', '—', 'Alta', { blocked: true }), rec('sku:Z', 'potential', 'Z', 'Pauta', 'Alta', 'Alta')]);
const C = G.actionCounts(recs, 'offer', (k) => (k === 'offer:1' ? 'approved' : 'suggested'));
ok('K1 cuenta SKU distintos por acción', C.rows.find((x) => x.label === 'Cuadrícula Home').n === 2 && C.rows.find((x) => x.label === 'Banner principal').n === 1, C.rows);
ok('K2 reparte por prioridad y cuenta aprobadas', C.rows.find((x) => x.label === 'Cuadrícula Home').m === 1 && C.rows.find((x) => x.label === 'Cuadrícula Home').a === 1 && C.rows.find((x) => x.label === 'Banner principal').approved === 1);
ok('K3 las oportunidades no se mezclan con las ofertas', !C.rows.some((x) => x.label === 'Pauta') && G.actionCounts(recs, 'potential').rows.length === 1);
ok('K4 el orden es el de las acciones (banner primero, no activar al final) y el total cuenta SKU', C.rows[0].label === 'Banner principal' && C.rows[C.rows.length - 1].label === 'No activar' && C.total === 4, C.rows.map((x) => x.label));
const M = G.missingCounts(recs, 'offer');
ok('K5 qué falta se cuenta por SKU distinto y ordena de mayor a menor', M[0].text === 'Costo de pauta' && M[0].n === 2 && M[1].text === 'Precio de la competencia' && M[1].n === 1, M);
const ext = { rows: { A: { space: 'Banner' }, B: { space: 'Buscador' } } };
const X = G.compareExternal(recs, 'offer', ext);
ok('K6 compara con lo compartido: coincide, difiere y sin sugerencia', X.loaded && X.match === 1 && X.differ === 1 && X.none === 1, X);
ok('K7 sin archivo compartido no inventa comparación', G.compareExternal(recs, 'offer', null).loaded === false);

console.log(`${n - fails}/${n} pruebas pasan.`); process.exit(fails ? 1 : 0);
