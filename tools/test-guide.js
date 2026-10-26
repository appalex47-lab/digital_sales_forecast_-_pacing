// Pruebas de la guía «Ahora haz esto» y del resumen (js/promotions/guideEngine.js). Uso: node tools/test-guide.js
global.window = global; global.FP = {};
require('../js/promotions/offerStore.js'); require('../js/promotions/activationEngine.js'); require('../js/promotions/guideEngine.js');
const O = FP.offers, A = FP.activation, G = FP.guide; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

const reg = O.createRegistry();
const man = (sku, extra) => O.captureManual(reg, Object.assign({ sku, name: 'Producto ' + sku, controlled: 'Ningún Control', discount: '30', start: '2026-11-01', end: '2026-11-15', campaignName: 'Camp demo' }, extra || {}), { by: 'Persona A', now: '2026-10-26T10:00:00.000Z' });
['S1', 'S2', 'S3', 'S4', 'S5'].forEach((s) => man(s));
man('S6', { start: '', end: '' });                      // sin vigencia: aviso
man('S1', { campaignName: 'Otra camp' });               // duplicada de S1 en otro lote, mismas fechas
const today = '2026-10-26';
const an = () => O.analyze(reg);
const prof = (o) => Object.assign({ revenue: 1000, views: 500, conv: 0.02, medConv: 0.02, share: 0.1, typeIds: [], evidence: 'high' }, o);
const recsOf = (profiles) => A.recommendAll({ offers: reg.offers, items: [], profiles: new Map(Object.entries(profiles || {})), params: A.SETTINGS });

// 1. Resumen: conteos, alertas y grupos
let S = G.offerSummary(reg, an(), recsOf({}), A.SETTINGS, today);
ok('R1 cuenta el total y por estado', S.total === 7 && S.byState.received === 7 && S.byState.validated === 0, S.byState);
ok('R2 sin alertas + por revisar = recibidas', S.clean + S.review === 7, S);
ok('R3 las duplicadas y la sin vigencia salen en grupos distintos', S.groups.some((g) => g.id === 'dup' && g.n === 2) && S.groups.some((g) => g.id === 'nodates' && g.n === 1), S.groups);
ok('R4 cada oferta cae en un solo grupo', S.groups.reduce((t, g) => t + g.n, 0) === S.review);
ok('R5 «descuento alto» no es un grupo ni una alerta', !S.groups.some((g) => /alto/i.test(g.title)) && !Object.keys(O.ISSUE).some((k) => /high|alto/.test(k)));

// 2. Validar solo las limpias
const clean = reg.offers.filter((o) => o.state === 'received' && !G.alerts(an().get(o.offerId)).length);
ok('V1 las limpias son las que no tienen ninguna alerta', clean.length === S.clean && clean.length === 4, clean.map((o) => o.sku));
clean.forEach((o) => O.setState(reg, o.offerId, 'validated', { by: 'Persona A' }));
S = G.offerSummary(reg, an(), recsOf({ S2: prof({ typeIds: ['highWeight'] }) }), A.SETTINGS, today);
ok('V2 tras validar quedan por revisar las mismas que antes', S.byState.validated === 4 && S.review === 3 && S.clean === 0, S);

// 3. Matriz y plan de selección (solo Alta/Alta; lo demás se queda fuera y se dice por qué)
const recs = recsOf({ S2: prof({ typeIds: ['lowVisibility'] }), S3: prof({ typeIds: ['lowVisibility'], evidence: 'medium' }), S4: prof({ typeIds: ['unconverted'] }) });
const aaSkus = reg.offers.filter((o) => G.isAA(recs.get(`offer:${o.offerId}`))).map((o) => o.sku);
S = G.offerSummary(reg, an(), recs, A.SETTINGS, today);
let mt = 0; G.LEVELS.forEach((p) => G.LEVELS.forEach((c) => { mt += S.matrix[p][c]; }));
ok('M1 la matriz más «sin sugerencia» suma las ofertas activas', mt + S.noRec === S.active, { mt, noRec: S.noRec, active: S.active });
const plan = G.selectPlan(reg, an(), recs);
ok('P1 el plan solo incluye validadas Alta/Alta', plan.ok.every((o) => o.state === 'validated' && G.isAA(recs.get(`offer:${o.offerId}`))), plan.ok.map((o) => o.sku));
ok('P2 ok + fuera = validadas', plan.ok.length + plan.out.notAA + plan.out.blocked.length === S.byState.validated, { plan: plan.ok.length, out: plan.out });
ok('P3 las Alta/Media no entran al clic', !plan.ok.some((o) => o.sku === 'S3' && recs.get(`offer:${o.offerId}`).confidence !== 'Alta'));
ok('P4 una Alta/Alta sin vigencia no pasa y se explica', (() => { const r2 = O.createRegistry(); const o = O.captureManual(r2, { sku: 'X1', name: 'x', controlled: 'Ningún Control', discount: '30' }, { by: 'P' }); const id = r2.offers[0].offerId; O.setState(r2, id, 'validated', { by: 'P' });
  const rc = new Map([[`offer:${id}`, { priority: 'Alta', confidence: 'Alta', blocked: false, tab: 'offer' }]]); const pl = G.selectPlan(r2, O.analyze(r2), rc); return pl.ok.length === 0 && pl.out.blocked.length === 1 && /vigencia/i.test(pl.out.blocked[0].why); })());

// 4. Bloqueadas no cuentan en la matriz
const rb = A.recommendAll({ offers: [Object.assign({}, reg.offers[0], { controlled: 'Controlado' })], items: [], profiles: new Map(), params: A.SETTINGS });
ok('B1 una oferta de control distinto no entra a la matriz', (() => { const t = O.createRegistry(); t.offers = [Object.assign({}, reg.offers[0], { controlled: 'Controlado' })]; const s = G.offerSummary(t, O.analyze(t), rb, A.SETTINGS, today); return s.noRec === 1; })());

// 5. Siguiente paso: el más adelantado con trabajo pendiente
const ns = (offers, promos) => G.nextStep({ offers, promotions: promos || [], today });
const of = (state, extra) => Object.assign({ offerId: 'O' + Math.random(), sku: 'K', state, history: [] }, extra || {});
const pr = (status, extra) => Object.assign({ promoId: 'P-1', name: 'Dermo', status, skus: [], plannedEnd: '2026-12-01' }, extra || {});
ok('N1 sin ofertas: cargar', ns([]).step === 1 && /Cargar/.test(ns([]).button));
ok('N2 recibidas con alertas: revisar, con el conteo', ns([of('received'), of('received')]).step === 2 && /2/.test(ns([of('received'), of('received')]).button));
ok('N3 validadas: armar la promoción en un clic', ns([of('validated')]).step === 2 && ns([of('validated')]).go.action === 'gd-build-promo');
ok('N4 seleccionadas pendientes también entran a armar la promoción', ns([of('selected'), of('selected')]).step === 2 && ns([of('selected'), of('selected')]).go.action === 'gd-build-promo' && /2/.test(ns([of('selected'), of('selected')]).button));
const added = of('selected', { history: [{ field: 'note', to: 'Agregada a la promoción P-1' }] });
ok('N5 seleccionadas que ya están en una promoción no piden crear otra', ns([added]).done === true);
ok('N6 con varias cosas por hacer gana la más adelantada', ns([of('received'), of('validated'), of('selected')]).go.action === 'gd-build-promo' && ns([of('received')], [pr('approved')]).step === 3);
ok('N7 promoción aprobada: ponerla en marcha', ns([], [pr('approved')]).step === 3);
ok('N8 promoción en borrador: abrirla y aprobarla', ns([], [pr('draft')]).step === 3);
ok('N9 publicada con vigencia vencida: medir', ns([], [pr('published', { plannedEnd: '2026-10-01' })]).step === 4);
ok('N10 publicada vigente: nada pendiente', ns([], [pr('published')]).done === true);
ok('N11 todo en orden dice «al día»', ns([of('discarded')]).done === true && ns([of('discarded')]).step === 0);
ok('N12 la lista de pasos marca el actual', G.allSteps({ offers: [of('received')], promotions: [], today }).find((x) => x.n === 2).state === 'now');

// 6. Datos para la promoción creada desde ofertas
const sel = reg.offers.slice(0, 2);
const d = G.draftFromOffers(sel, reg, today);
ok('D1 nombre y fechas salen de las ofertas, sin inventar', d.name === 'Camp demo' && d.plannedStart === '2026-11-01' && d.plannedEnd === '2026-11-15', d);
ok('D2 sin campaña, nombre con la fecha de hoy', G.draftFromOffers([Object.assign({}, sel[0], { campaignName: '' }), Object.assign({}, sel[1], { campaignName: 'Otra' })], reg, today).name === 'Promoción del 2026-10-26');

// 7. Resumen de oportunidades
{ const rec = (sku, p, c, b) => [`sku:${sku}`, { key: `sku:${sku}`, tab: 'potential', sku, priority: p, confidence: c, blocked: !!b, banner: false }];
  const m = new Map([rec('A', 'Alta', 'Alta'), rec('B', 'Alta', 'Media'), rec('C', 'Baja', 'Baja'), rec('D', '—', 'Alta', true)]);
  const o = G.opportunitySummary(m, A.SETTINGS);
  ok('O1 matriz de oportunidades y Alta/Alta', o.total === 4 && o.matrix.Alta.Alta === 1 && o.matrix.Alta.Media === 1 && o.matrix.Baja.Baja === 1 && o.noRec === 1 && o.aa.join() === 'A', o); }

// 8. Rediseño: validación automática, tarjetas de prioridad y venta del periodo
{ const r2 = O.createRegistry();
  const m2 = (sku, e) => O.captureManual(r2, Object.assign({ sku, name: 'P ' + sku, controlled: 'Ningún Control', discount: '30', start: '2026-11-01', end: '2026-11-15', campaignName: 'C' }, e || {}), { by: 'Persona A', now: '2026-10-26T10:00:00.000Z' });
  m2('L1'); m2('L2'); m2('L3', { start: '', end: '' });
  const done = G.autoValidate(r2, 'Automático'), st = (k) => r2.offers.find((o) => o.sku === k).state;
  ok('AV1 las que no tienen ninguna alerta pasan solas a Validada', st('L1') === 'validated' && st('L2') === 'validated', r2.offers.map((o) => [o.sku, o.state]));
  ok('AV2 las que tienen alertas se quedan en Recibida', st('L3') === 'received');
  ok('AV3 queda escrito quién y por qué', r2.offers.find((o) => o.sku === 'L1').history.some((h) => h.field === 'state' && h.by === 'Automático' && /automáticamente/.test(h.note)));
  const l1 = r2.offers.find((o) => o.sku === 'L1'); O.setState(r2, l1.offerId, 'received', { by: 'Persona A' });
  ok('AV4 una devuelta a mano no se vuelve a validar sola', G.autoValidate(r2, 'Automático').length === 0 && st('L1') === 'received');
  ok('AV5 es idempotente', done.length === 2 && G.autoValidate(r2, 'Automático').length === 0);
  const rec = (sku, p, c, rev, miss) => [`sku:${sku}`, { key: `sku:${sku}`, tab: 'potential', sku, priority: p, confidence: c, blocked: false, main: 'Pauta', revenue: rev, missing: miss || [] }];
  const m = new Map([rec('A', 'Alta', 'Alta', 1000), rec('B', 'Alta', 'Baja', 500, ['22 de 60 días con venta']), rec('C', 'Alta', 'Baja', 0, ['22 de 60 días con venta']), rec('D', 'Media', 'Media', 0)]);
  const o = G.opportunitySummary(m, A.SETTINGS), cards = G.priorityCards(o.matrix, m, 'potential');
  ok('PC1 tres tarjetas con SKU, datos suficientes y por revisar', cards.length === 3 && cards[0].n === 3 && cards[0].sure === 1 && cards[0].rest === 2 && cards[1].n === 1 && cards[2].n === 0, cards);
  ok('PC2 la de Alta dice qué falta (motivo más frecuente)', cards[0].why === '22 de 60 días con venta', cards[0]);
  const C = G.actionCounts(m, 'potential', null);
  ok('VP1 venta del periodo suma por acción y es null sin datos', C.rows[0].sale === 1500 && G.actionCounts(new Map([rec('Z', 'Baja', 'Baja', 0)]), 'potential', null).rows[0].sale === null, C.rows);
}

// buildPlan
{ const r3 = O.createRegistry(); const m3 = (sku, e) => O.captureManual(r3, Object.assign({ sku, name: 'P ' + sku, controlled: 'Ningún Control', discount: '30', start: '2026-11-01', end: '2026-11-15', campaignName: 'C' }, e || {}), { by: 'A', now: '2026-10-26T10:00:00.000Z' });
  m3('B1'); m3('B2'); m3('B3', { start: '', end: '' }); G.autoValidate(r3, 'Automático'); r3.offers.find((o) => o.sku === 'B3').state = 'validated';
  const an3 = O.analyze(r3), plan3 = G.buildPlan(r3, an3, new Map());
  ok('BP1 arma con las validadas que se pueden elegir y deja fuera las que no, con su razón', plan3.ok.length === 2 && plan3.out.blocked.length === 1 && /vigencia|fecha/i.test(plan3.out.blocked[0].why), plan3);
  ok('BP2 se puede limitar a las ofertas indicadas', G.buildPlan(r3, an3, new Map(), { ids: [r3.offers[0].offerId] }).ok.length === 1);
  ok('BP3 con aaOnly, sin Alta/Alta no arma nada y cuenta las que quedan fuera', G.buildPlan(r3, an3, new Map(), { aaOnly: true }).out.notAA === 3); }

console.log(`${n - fails}/${n} pruebas pasan.`); process.exit(fails ? 1 : 0);
