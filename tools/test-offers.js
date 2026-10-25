// Pruebas de ofertas recibidas (js/promotions/offerStore.js). Uso: node tools/test-offers.js
global.window = global; global.FP = {};
require('../js/promotions/offerStore.js');
const O = FP.offers; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

// Estructura del archivo de ejemplo (datos ficticios): Oracle con «AA», sivec, % DES como fracción, celdas #ERROR!
const H = ['sivec', 'Oracle', 'Categoría', 'Producto', 'Precio', 'status', 'Laboratorio', 'OFERTA', 'PROGRAMA', 'MECANICA', 'PMP+IVA', '% DES', 'PRECIO FINAL CON IVA', 'COMENTARIO ABASTECIMIENTO', 'DISPONIBILIDAD EN PDV', 'Cambio de precio'];
const row = (line, o) => ({ line, values: Object.assign({ sivec: '100.0', Oracle: '7500000000001AA', 'Categoría': 'Dermocosméticos', Producto: 'CREMA DEMO 50G', Precio: '90', status: 'ACTIVO', Laboratorio: 'LAB DEMO', OFERTA: '7292.0', PROGRAMA: '', MECANICA: '', 'PMP+IVA': '100', '% DES': '0.25', 'PRECIO FINAL CON IVA': '75', 'COMENTARIO ABASTECIMIENTO': 'DISPONIBLE', 'DISPONIBILIDAD EN PDV': '0.98', 'Cambio de precio': '' }, o) });
const camp = { name: 'Hot Sale demo', start: '2026-05-25', end: '2026-06-02' };
const build = (rows, c) => O.buildBatch(H, rows, { campaign: c || camp });
const commit = (reg, b, extra) => O.commitBatch(reg, b, Object.assign({ by: 'Persona A', fileName: 'demo.xlsx', sheet: 'Productos finales', campaign: camp, now: '2026-10-24T10:00:00.000Z' }, extra));

// columnas y SKU
{ const m = O.mapColumns(H);
  ok('C1 Oracle es el SKU', m.map.sku === 'Oracle', m.map);
  ok('C2 sivec queda como referencia, % DES como descuento', m.map.internalId === 'sivec' && m.map.discount === '% DES' && m.map.pmp === 'PMP+IVA' && m.map.finalPrice === 'PRECIO FINAL CON IVA');
  const sx = O.mapColumns(['SKU', 'Oracle', 'Descuento']);
  ok('C3 si hay «SKU» y «Oracle», gana «SKU»', sx.map.sku === 'SKU' && sx.unknown.includes('Oracle'), sx);
  ok('S1 quita el sufijo AA', O.normalizeSku('7500000000001AA').sku === '7500000000001' && O.normalizeSku('7500000000001AA').hadAA);
  ok('S2 SKU sin AA queda igual, con ceros', O.normalizeSku('0310119043202').sku === '0310119043202' && !O.normalizeSku('0310119043202').hadAA);
  ok('S3 quita .0 de Excel', O.normalizeSku('34286.0').sku === '34286');
  ok('S4 #ERROR! no es SKU', O.normalizeSku('#ERROR!').sku === '');
  ok('D1 0.25 → 25 %', O.parseDiscount('0.25') === 0.25 && O.parseDiscount('25') === 0.25 && O.parseDiscount('25 %') === 0.25 && O.parseDiscount('') === null && O.parseDiscount('#ERROR!') === null);
}
// importación y vista previa
{ const b = build([row(2, {}), row(3, { Oracle: '' }), row(4, { Oracle: '7500000000002AA', '% DES': '' }), row(5, { Oracle: '7500000000003AA', '% DES': '#ERROR!', 'PMP+IVA': '', 'PRECIO FINAL CON IVA': '' })]);
  ok('I1 sin SKU se rechaza con su línea', b.rejected.length === 1 && b.rejected[0].line === 3, b.rejected);
  ok('I2 sin % pero con PMP y final: lo calcula y lo marca', b.offers[1].discount === 0.25 && b.offers[1].discountSource === 'calculated', b.offers[1]);
  ok('I3 sin % ni cuenta posible: queda vacío (no se inventa)', b.offers[2].discount === null);
  ok('I4 SKU se guarda sin AA y avisa', b.offers[0].sku === '7500000000001' && b.offers[0].skuHadAA === true);
  ok('I5 hereda la vigencia de la campaña', b.offers[0].start === '2026-05-25' && b.offers[0].end === '2026-06-02');
  ok('I6 oferta «7292.0» queda 7292', b.offers[0].offerCode === '7292');
  const reg = O.createRegistry();
  ok('I7 sin nombre de quien recibe, no guarda', !O.commitBatch(reg, b, { campaign: camp }).ok && reg.offers.length === 0);
  const r = commit(reg, b);
  ok('I8 guarda lote LOT-001 y OF-0001..', r.ok && r.batch.batchId === 'LOT-001' && reg.offers.length === 3 && reg.offers[0].offerId === 'OF-0001' && reg.offers[2].offerId === 'OF-0003');
  ok('I9 todas quedan «Recibida» con origen, fecha y quién', reg.offers.every((o) => o.state === 'received' && o.origin === 'commercial' && o.receivedAt && o.receivedBy === 'Persona A'));
  ok('I10 el lote guarda las líneas rechazadas', reg.batches[0].rejected.length === 1 && reg.batches[0].rowCount === 4 && reg.batches[0].imported === 3);
  ok('I11 historial inicial', reg.offers[0].history.length === 1 && reg.offers[0].history[0].field === 'created');
  ok('I12 fechas de campaña inválidas rechazadas', !commit(O.createRegistry(), build([row(2, {})]), { campaign: { start: '2026-06-02', end: '2026-05-25' } }).ok);
  const bad = O.buildBatch(['Producto', 'Precio'], [], {});
  ok('I13 sin columna de SKU lo dice', bad.missing.length >= 1 && bad.offers.length === 0, bad.missing);
}
// alertas
{ const reg = O.createRegistry();
  commit(reg, build([row(2, {}), row(3, { Oracle: '7500000000010AA', '% DES': '0.9', 'PRECIO FINAL CON IVA': '10' }), row(4, { Oracle: '7500000000011AA', '% DES': '0.4' }), row(5, { Oracle: '7500000000012AA', MECANICA: '3+1', 'Cambio de precio': '26.5' }),
    row(6, { Oracle: '7500000000013AA', 'COMENTARIO ABASTECIMIENTO': 'AGOTADO - FECHA TENTATIVA' }), row(7, { Oracle: '7500000000014AA', 'DISPONIBILIDAD EN PDV': '0.2' }), row(8, { Oracle: '7500000000015AA', 'PRECIO FINAL CON IVA': '120', '% DES': '' }),
    row(9, { Oracle: '7500000000016AA', Precio: '#ERROR!' }), row(10, { Oracle: '7500000000001AA' })]));
  const an = O.analyze(reg), cd = (i) => an.get(reg.offers[i].offerId);
  ok('A1 oferta sana sin alertas de error', O.levelOf(cd(0)) === 'warn' ? cd(0).every((c) => ['sku_aa', 'dup_batch'].includes(c) || O.ISSUE[c].level === 'info') : true, cd(0));
  ok('A2 un descuento muy alto NO genera alerta (el equipo comercial manda)', !cd(1).includes('high_discount') && cd(1).every((c) => c !== 'bad_discount'), cd(1));
  ok('A3 % del archivo distinto a la cuenta avisa', cd(2).includes('inconsistent'));
  ok('A4 mecánica por piezas y cambio de precio son informativos', cd(3).includes('pieces') && cd(3).includes('price_change') && O.levelOf(cd(3).filter((c) => c !== 'sku_aa')) === 'ok', cd(3));
  ok('A5 agotado y baja disponibilidad avisan', cd(4).includes('supply') && cd(5).includes('supply'));
  ok('A6 precio final > PMP avisa (y el % calculado sale negativo = error)', cd(6).includes('price_above') && cd(6).includes('bad_discount'), cd(6));
  ok('A7 celda #ERROR! en referencia avisa', cd(7).includes('error_cells'));
  ok('A8 SKU repetido en el mismo archivo avisa', cd(8).includes('dup_batch'), cd(8));
}
// duplicados entre lotes y fechas
{ const reg = O.createRegistry();
  commit(reg, build([row(2, {})]));
  commit(reg, build([row(2, {})]), { fileName: 'otro.xlsx' });
  ok('U1 mismo SKU en otro lote y mismas fechas: duplicado', O.analyze(reg).get('OF-0001').includes('dup_other') && O.analyze(reg).get('OF-0002').includes('dup_other'));
  commit(reg, build([row(2, {})], { start: '2026-08-01', end: '2026-08-05' }), { campaign: { start: '2026-08-01', end: '2026-08-05' } });
  ok('U2 fechas que no se cruzan: no es duplicado', !O.analyze(reg).get('OF-0003').includes('dup_other'));
  O.setState(reg, 'OF-0002', 'discarded', { by: 'Persona A', note: 'repetida' });
  ok('U3 al descartar una, la otra deja de ser duplicado', !O.analyze(reg).get('OF-0001').includes('dup_other'));
}
// estados
{ const reg = O.createRegistry();
  commit(reg, build([row(2, {}), row(3, { Oracle: '7500000000020AA', '% DES': '', 'PMP+IVA': '', 'PRECIO FINAL CON IVA': '' })]));
  const id = 'OF-0001';
  ok('E1 recibida → seleccionada directo, no', !O.setState(reg, id, 'selected', { by: 'Persona A' }).ok);
  ok('E2 sin quien lo hace, no', !O.setState(reg, id, 'validated', { by: '' }).ok);
  ok('E3 recibida → validada', O.setState(reg, id, 'validated', { by: 'Persona B', note: 'Revisada' }).ok && O.find(reg, id).state === 'validated');
  ok('E4 validada → seleccionada', O.setState(reg, id, 'selected', { by: 'Persona B' }).ok);
  ok('E5 seleccionada no se edita', !O.editOffer(reg, id, 'discount', '30', 'Persona B').ok);
  ok('E6 oferta sin descuento no pasa a validada', !O.setState(reg, 'OF-0002', 'validated', { by: 'Persona B' }).ok);
  ok('E7 descartar exige motivo', !O.setState(reg, 'OF-0002', 'discarded', { by: 'Persona B' }).ok && O.setState(reg, 'OF-0002', 'discarded', { by: 'Persona B', note: 'sin precio' }).ok);
  ok('E8 descartada se puede reabrir', O.setState(reg, 'OF-0002', 'received', { by: 'Persona B' }).ok);
  const h = O.find(reg, id).history;
  ok('E9 el historial conserva cada cambio con quién', h.length === 3 && h[1].from === 'received' && h[1].to === 'validated' && h[1].by === 'Persona B', h);
  const reg2 = O.createRegistry(); commit(reg2, build([row(2, {})], { start: '', end: '' }), { campaign: {} });
  O.setState(reg2, 'OF-0001', 'validated', { by: 'A' });
  ok('E10 sin vigencia puede validarse pero no seleccionarse', !O.setState(reg2, 'OF-0001', 'selected', { by: 'A' }).ok);
  O.editOffer(reg2, 'OF-0001', 'start', '2026-05-25', 'A'); O.editOffer(reg2, 'OF-0001', 'end', '2026-06-02', 'A');
  ok('E11 con vigencia ya puede seleccionarse', O.setState(reg2, 'OF-0001', 'selected', { by: 'A' }).ok);
}
// ediciones sin sobrescribir en silencio
{ const reg = O.createRegistry(); commit(reg, build([row(2, {})]));
  const r = O.editOffer(reg, 'OF-0001', 'discount', '30', 'Persona B');
  const o = O.find(reg, 'OF-0001');
  ok('M1 edita el descuento y lo marca manual', r.ok && o.discount === 0.3 && o.discountSource === 'manual', o.discount);
  ok('M2 el valor anterior queda en el historial', o.history[1].field === 'discount' && o.history[1].from === 0.25 && o.history[1].to === 0.3 && o.history[1].by === 'Persona B');
  ok('M3 descuento fuera de rango rechazado', !O.editOffer(reg, 'OF-0001', 'discount', '120', 'B').ok && !O.editOffer(reg, 'OF-0001', 'discount', 'abc', 'B').ok);
  ok('M4 mismo valor no ensucia el historial', O.editOffer(reg, 'OF-0001', 'discount', '30', 'B').unchanged === true && o.history.length === 2);
  ok('M5 fecha inválida rechazada; fin antes de inicio avisa', !O.editOffer(reg, 'OF-0001', 'start', '2026-13-40', 'B').ok && !!O.editOffer(reg, 'OF-0001', 'end', '2026-05-01', 'B').warning);
  ok('M6 campo no editable rechazado (SKU)', !O.editOffer(reg, 'OF-0001', 'sku', '123', 'B').ok);
  ok('M7 nota queda en el historial', O.addNote(reg, 'OF-0001', 'Llamar al proveedor', 'B').ok && o.history[o.history.length - 1].field === 'note');
}
// filtros y conversión a SKU de promoción
{ const reg = O.createRegistry();
  commit(reg, build([row(2, {}), row(3, { Oracle: '7500000000030AA', Laboratorio: 'OTRO LAB', Producto: 'JARABE X', 'Categoría': 'Respiratorios' })]));
  const an = O.analyze(reg);
  ok('F1 filtra por laboratorio', O.filter(reg, an, { lab: 'OTRO LAB' }).length === 1);
  ok('F2 búsqueda sin acentos ni mayúsculas', O.filter(reg, an, { q: 'jarabe' }).length === 1 && O.filter(reg, an, { q: '7500000000030' }).length === 1);
  ok('F3 filtra por estado', O.filter(reg, an, { state: 'validated' }).length === 0 && O.filter(reg, an, { state: 'received' }).length === 2);
  ok('F4 listas de valores', O.distinct(reg, 'lab').join() === 'LAB DEMO,OTRO LAB');
  const s = O.toPromotionSku(O.find(reg, 'OF-0001'));
  ok('P1 pasa a SKU de promoción con origen «oferta» y su identificador', s.origin === 'offer' && s.offerId === 'OF-0001' && s.sku === '7500000000001' && /25 % de descuento/.test(s.mechanic), s);
  const h = O.hydrate(JSON.parse(JSON.stringify(reg)));
  ok('H1 hidrata igual', h.offers.length === 2 && h.batches.length === 1 && h.settings.lowAvailability === 0.5);
  ok('H2 basura → registro vacío', O.hydrate(null).offers.length === 0 && O.hydrate({ offers: 'x' }).batches.length === 0);
}
{ // Captura manual y plantilla
  const heads = O.TEMPLATE.map((c) => c[0]), mc = O.mapColumns(heads);
  ok('M1 todas las columnas de la plantilla las reconoce la carga de archivos', mc.unknown.length === 0 && O.TEMPLATE.every((c) => mc.map[c[1]] === c[0]), mc);
  const reg = O.createRegistry(); const by = { by: 'Persona A' };
  ok('M2 pide quién captura, SKU y descuento', !O.captureManual(reg, { sku: 'A1', controlled: 'x', discount: '20' }, {}).ok && !O.captureManual(reg, { controlled: 'x', discount: '20' }, by).ok && !O.captureManual(reg, { sku: 'A1', controlled: 'x' }, by).ok);
  ok('M2b exige el tipo de control', !O.captureManual(reg, { sku: 'A1', discount: '20' }, by).ok && /Controlados/.test(O.captureManual(reg, { sku: 'A1', discount: '20' }, by).error));
  ok('M3 rechaza descuento fuera de 0 a 100 y fechas malas', !O.captureManual(reg, { sku: 'A1', controlled: 'x', discount: '120' }, by).ok && !O.captureManual(reg, { sku: 'A1', controlled: 'x', discount: '20', start: '2026-11-10', end: '2026-11-01' }, by).ok && !O.captureManual(reg, { sku: 'A1', controlled: 'x', discount: '20', start: 'mañana' }, by).ok && reg.offers.length === 0);
  const r = O.captureManual(reg, { sku: '7500000000001AA', name: 'Producto demo', category: 'CAT A', lab: 'Lab 1', controlled: 'Ningún Control', program: 'Programa demo', mechanic: '3+1', discount: '25 %', use: 'Crónico', start: '2026-11-01', end: '2026-11-15', campaignName: 'Nov', origin: 'pricing' }, by);
  const o = r.offer || {};
  ok('M4 guarda la oferta como Recibida con sus campos', r.ok && o.sku === '7500000000001' && o.discount === 0.25 && o.state === 'received' && o.program === 'Programa demo' && o.mechanic === '3+1' && o.use === 'chronic' && o.lab === 'Lab 1' && o.start === '2026-11-01' && o.origin === 'pricing' && o.receivedBy === 'Persona A', o);
  ok('M5 crea su lote «Captura manual» con la campaña', r.batch && r.batch.fileName === 'Captura manual' && r.batch.campaign === 'Nov' && reg.batches.length === 1);
  const r3 = O.captureManual(reg, { sku: 'B2', discount: '15', controlled: 'Ningún Control', campaignName: 'Nov', origin: 'pricing' }, by), r4 = O.captureManual(reg, { sku: 'B3', discount: '15', controlled: 'Ningún Control', campaignName: 'Nov', origin: 'commercial' }, by), r5 = O.captureManual(reg, { sku: 'B4', discount: '15', controlled: 'Ningún Control', campaignName: 'Dic', origin: 'pricing' }, by);
  ok('M5b las capturas de la misma campaña y origen comparten lote; otra campaña u origen, otro lote', r3.batch.batchId === r.batch.batchId && r.batch.imported === 2 && r4.batch.batchId !== r.batch.batchId && r5.batch.batchId !== r.batch.batchId && r5.batch.batchId !== r4.batch.batchId && reg.batches.length === 3, reg.batches.map((b) => [b.batchId, b.campaign, b.origin, b.imported]));
  ok('M6 el historial dice quién y de dónde', o.history && o.history[0].by === 'Persona A' && /Captura manual/.test(o.history[0].note));
  const r2 = O.captureManual(reg, { sku: 'ZZ9', discount: '10', use: 'Agudo', controlled: 'Ningún Control' }, by);
  ok('M7 sin fechas ni campaña también se guarda (con aviso de vigencia)', r2.ok && r2.offer.use === 'acute' && O.analyze(reg).get(r2.offer.offerId).includes('no_dates'), r2);
}
console.log(`${n - fails}/${n} pruebas OK${fails ? ` — ${fails} FALLAN` : ''}`);
process.exit(fails ? 1 : 0);
