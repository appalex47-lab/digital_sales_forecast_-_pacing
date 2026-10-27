// Pruebas del motor de activación (js/promotions/activationEngine.js). Uso: node tools/test-activation.js
global.window = global; global.FP = {};
require('../js/promotions/activationEngine.js');
const A = FP.activation; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const prof = (o) => Object.assign({ revenue: 1000, views: 500, conv: 0.02, medConv: 0.02, share: 0.1, typeIds: [], evidence: 'high' }, o);
const offer = (id, sku, o) => Object.assign({ offerId: id, sku, state: 'received', discount: 0.3, mechanic: '30 % de descuento', program: '', controlled: 'Ningún Control', category: 'Cat A', supplyComment: '', catStatus: '' }, o || {});
const item = (sku, o) => Object.assign({ sku, category: 'Cat A', types: [], evidence: { level: 'high' }, revenue: 1000, views: 500, conversion: 0.02, categoryMedianConversion: 0.02, categoryShare: 0.1 }, o || {});
const t = (id) => ({ id });
const run = (offers, items, profiles, params) => A.recommendAll({ offers, items, profiles: new Map(Object.entries(profiles || {})), params });

let r = run([offer('O1', 'S1', { controlled: 'Controlado' })], [], { S1: prof() });
ok('C1 tipo de control distinto de «Ningún Control» bloquea', r.get('offer:O1').blocked && r.get('offer:O1').main === A.SPACE.none && /Controlado/.test(r.get('offer:O1').why), r.get('offer:O1'));
r = run([offer('O1', 'S1', { supplyComment: 'PRODUCTO AGOTADO - FECHA TENTATIVA 30 SEP 26' })], [], { S1: prof() });
ok('C2 producto agotado no se activa ahora', r.get('offer:O1').blocked && r.get('offer:O1').main === A.SPACE.soldout);
r = run([offer('O1', 'S1', { mechanic: 'Descuentos escalonados 20 % 25 % 30 %', share: 0.5 })], [], { S1: prof({ typeIds: ['highWeight'], share: 0.5 }) });
ok('C3 mecánica escalonada nunca va a banner', r.get('offer:O1').main === A.SPACE.ficha && !r.get('offer:O1').banner, r.get('offer:O1'));
r = run([offer('O1', 'S1', { mechanic: 'x'.repeat(200) })], [], { S1: prof({ typeIds: ['highWeight'] }) });
ok('C4 mecánica muy larga se trata como escalonada', r.get('offer:O1').main === A.SPACE.ficha);
r = run([offer('O1', 'S1')], [], { S1: prof({ typeIds: ['unconverted'], conv: 0.005 }) });
ok('C5 demanda no convertida no va a pauta', r.get('offer:O1').main === A.SPACE.search && /pauta no ayuda/.test(r.get('offer:O1').why));
r = run([offer('O1', 'S1', { discount: 0.3 }), offer('O2', 'S2', { discount: 0.1 })], [], { S1: prof({ typeIds: ['lowVisibility'] }), S2: prof({ typeIds: ['lowVisibility'] }) });
ok('C6 visibilidad baja con descuento alto: pauta; con descuento bajo: cuadrícula Home', r.get('offer:O1').main === A.SPACE.paid && r.get('offer:O2').main === A.SPACE.home);
r = run([offer('O1', 'S1', { program: 'Programa ejemplo' })], [], { S1: prof() });
ok('C7 oferta con programa va a CRM', r.get('offer:O1').main === A.SPACE.crm && /Programa ejemplo/.test(r.get('offer:O1').why));
r = run([offer('O1', 'S1')], [], { S1: prof() });
ok('C8 descuento alto sin otra regla: redes con prioridad baja', r.get('offer:O1').main === A.SPACE.social && r.get('offer:O1').priority === 'Baja');
r = run([offer('O1', 'S1', { discount: 0.1 })], [], {});
ok('C9 sin datos de venta: ubicación por defecto con confianza baja y lo dice', r.get('offer:O1').main === A.SPACE.category && r.get('offer:O1').confidence === 'Baja' && r.get('offer:O1').missing.some((m) => /Sin venta/.test(m)), r.get('offer:O1'));
r = run([offer('O1', 'S1', { controlled: '' })], [], { S1: prof() });
ok('C10 tipo de control desconocido no bloquea pero queda como faltante', !r.get('offer:O1').blocked && r.get('offer:O1').missing.some((m) => /Tipo de control/.test(m)));

// Potenciales
r = run([], [item('P1', { types: [t('highWeight')], categoryShare: 0.3 })], { P1: prof({ typeIds: ['highWeight'], share: 0.3, conv: 0.03, medConv: 0.02 }) });
ok('P1 potencial de peso alto con conversión no baja: banner sin necesitar descuento', r.get('sku:P1').main === A.SPACE.banner && r.get('sku:P1').tab === 'potential', r.get('sku:P1'));
r = run([], [item('P1', { types: [t('highWeight')], categoryShare: 0.3, conversion: 0.01 })], { P1: prof({ typeIds: ['highWeight'], share: 0.3, conv: 0.01, medConv: 0.02 }) });
ok('P2 potencial de peso alto con conversión baja: no va a banner', r.get('sku:P1').main !== A.SPACE.banner);
r = run([], [item('P1', { types: [t('declining')] })], {});
ok('P3 potencial en caída: revisar antes de colocar', r.get('sku:P1').main === A.SPACE.review);
r = run([], [item('P1', { category: 'Cat A', types: [t('growing')] })], {}, { chronicCategories: 'cat a, otra' });
ok('P4 crónico declarado y en crecimiento: recordatorio de recompra', r.get('sku:P1').main === A.SPACE.crmRepeat);
r = run([], [item('P1', { types: [t('growing')] })], {});
ok('P5 sin categorías crónicas declaradas no inventa CRM', r.get('sku:P1').main === A.SPACE.category);
r = run([offer('O1', 'P1')], [item('P1', { types: [t('highWeight')] })], { P1: prof({ typeIds: ['highWeight'], share: 0.3 }) });
ok('P6 un SKU con oferta vigente solo aparece como oferta', r.has('offer:O1') && !r.has('sku:P1'));
r = run([offer('O1', 'P1', { state: 'discarded' })], [item('P1', { types: [t('highWeight')] })], { P1: prof({ typeIds: ['highWeight'], share: 0.3, conv: 0.03 }) });
ok('P7 con la oferta descartada el SKU vuelve a ser oportunidad', !r.has('offer:O1') && r.has('sku:P1'));

// Tope de banner
const bigO = (id, sku, rev) => [offer(id, sku, { discount: 0.3 }), { [sku]: prof({ typeIds: ['highWeight'], share: 0.3, revenue: rev }) }];
{ const [o1, p1] = bigO('O1', 'S1', 58000), [o2, p2] = bigO('O2', 'S2', 20000);
  const pot = item('P1', { types: [t('highWeight')], categoryShare: 0.3 }); const pp = { P1: prof({ typeIds: ['highWeight'], share: 0.3, conv: 0.03, revenue: 51000 }) };
  const prof3 = Object.assign({}, p1, p2, pp);
  r = run([o1, o2], [pot], prof3, { bannerSlots: 2, bannerMode: 'shared' });
  ok('B1 tope compartido: gana la venta, no el descuento (58 000 y 51 000 entran; 20 000 pasa a Home)', r.get('offer:O1').main === A.SPACE.banner && r.get('sku:P1').main === A.SPACE.banner && r.get('offer:O2').main === A.SPACE.home && /entre Ofertas y plan y Qué impulsar/.test(r.get('offer:O2').why), [r.get('offer:O1').main, r.get('sku:P1').main, r.get('offer:O2').main]);
  r = run([o1, o2], [pot], prof3, { bannerSlots: 1, bannerMode: 'shared' });
  ok('B2 con 1 espacio compartido, la oferta de mayor venta se lo lleva y el potencial pasa a Home', r.get('offer:O1').main === A.SPACE.banner && r.get('sku:P1').main === A.SPACE.home);
  r = run([o1, o2], [pot], prof3, { bannerSlots: 1, bannerMode: 'perTab' });
  ok('B3 un tope por pestaña: cada una conserva su espacio', r.get('offer:O1').main === A.SPACE.banner && r.get('sku:P1').main === A.SPACE.banner && r.get('offer:O2').main === A.SPACE.home);
  r = run([o1], [pot], prof3, { bannerSlots: 0 });
  ok('B4 con 0 espacios nadie va a banner', r.get('offer:O1').main === A.SPACE.home && r.get('sku:P1').main === A.SPACE.home);
}

// Registro
{ const reg = A.createRegistry();
  ok('R1 parámetros iniciales', reg.params.discountHigh === 25 && reg.params.bannerSlots === 3 && reg.params.bannerMode === 'shared');
  ok('R2 valida parámetros', !A.setParams(reg, { discountHigh: 120 }).ok && !A.setParams(reg, { bannerSlots: 1.5 }).ok && !A.setParams(reg, { bannerMode: 'x' }).ok && A.setParams(reg, { discountHigh: '30', bannerSlots: 3, bannerMode: 'perTab' }).ok && reg.params.discountHigh === 30);
  ok('R3 cambiar estado pide nombre', !A.setState(reg, 'offer:O1', 'approved', '').ok);
  ok('R4 descartar pide motivo', !A.setState(reg, 'offer:O1', 'discarded', 'Ana', '').ok);
  ok('R5 aprobar guarda quién y cuándo', A.setState(reg, 'offer:O1', 'approved', 'Ana').ok && A.stateOf(reg, 'offer:O1') === 'approved' && reg.items['offer:O1'].history.length === 1);
  ok('R6 el historial solo se agrega', A.setState(reg, 'offer:O1', 'executed', 'Luis').ok && reg.items['offer:O1'].history.length === 2 && reg.items['offer:O1'].history[1].from === 'approved');
  ok('R7 volver a Sugerida limpia el registro', A.setState(reg, 'offer:O1', 'suggested', 'Ana').ok && A.stateOf(reg, 'offer:O1') === 'suggested');
  const h = A.hydrate(JSON.parse(JSON.stringify(reg)));
  ok('R8 hydrate conserva parámetros y descarta basura', h.params.bannerMode === 'perTab' && A.hydrate(null).params.bannerSlots === 3 && Object.keys(A.hydrate({ items: { x: { state: 'raro' } } }).items).length === 0);
}
// Sugerencias de otros
ok('E1 reconoce canales en texto libre', A.spaceKey('Banner principal') === 'banner' && A.spaceKey('WhatsApp') === 'crm' && A.spaceKey('Cuadrícula Home') === 'home' && A.spaceKey('Pauta Meta') === 'paid' && A.spaceKey('RRSS') === 'social' && A.spaceKey('Buscador') === 'search' && A.spaceKey('algo raro') === '' && A.spaceKey('Cuadrícula de categoría') === 'category', ['x']);
{ const rec = { main: A.SPACE.banner, second: A.SPACE.home };
  ok('E2 compara con la sugerencia cargada', A.compare(rec, 'Banner') === 'match' && A.compare(rec, 'Home') === 'second' && A.compare(rec, 'Pauta') === 'differ' && A.compare(rec, 'quizás') === 'unknown' && A.compare(rec, '') === ''); }
{ const reg = A.createRegistry();
  ok('E3 no guarda un archivo vacío', !A.setExternal(reg, { rows: {} }).ok && reg.external === null);
  ok('E4 guarda y limpia las sugerencias cargadas', A.setExternal(reg, { fileName: 'x.xlsx', by: 'Ana', rows: { S1: { space: 'Home', comment: '' } } }).count === 1 && A.hydrate(JSON.parse(JSON.stringify(reg))).external.rows.S1.space === 'Home' && A.clearExternal(reg).ok && reg.external === null); }
{ const it = item('P1', { types: [t('growing')] }); const pf = { P1: prof({ typeIds: ['growing'] }) };
  let q = run([], [it], pf, {}); ok('U1 sin columna ni categoría declarada no sugiere recompra', q.get('sku:P1').main !== A.SPACE.crmRepeat, q.get('sku:P1'));
  q = run([offer('X1', 'P1', { state: 'discarded', use: 'chronic' })], [it], pf, {}); ok('U2 columna Crónico en el archivo de ofertas sugiere recompra', q.get('sku:P1').main === A.SPACE.crmRepeat, q.get('sku:P1'));
  q = run([offer('X1', 'P1', { state: 'discarded', use: 'acute' })], [it], pf, { chronicCategories: 'Cat A' }); ok('U3 «Agudo» en el archivo pesa más que la lista de categorías', q.get('sku:P1').main !== A.SPACE.crmRepeat, q.get('sku:P1'));
  ok('U4 el tope de banner inicial es 3', A.createRegistry().params.bannerSlots === 3); }
console.log(fails ? `\n${fails} de ${n} pruebas fallaron` : `\n${n}/${n} pruebas de activación OK`); process.exit(fails ? 1 : 0);
