// Pruebas de las salidas de Oportunidades y de las solicitudes de oferta (js/promotions/requestStore.js). Uso: node tools/test-requests.js
global.window = global; global.FP = {};
require('../js/promotions/opportunityEngine.js');
require('../js/promotions/requestStore.js');
require('../js/promotions/offerStore.js'); require('../js/promotions/activationEngine.js'); require('../js/promotions/guideEngine.js');
require('../js/export/promotionExport.js');
const OP = FP.opportunities, RQ = FP.requests; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const T = (...ids) => ids.map((id) => ({ id }));

// Salidas
ok('R1 venta que cae: revisar causa, aunque tenga demanda sin convertir', OP.routeOf(T('declining', 'unconverted'), false).id === 'review');
ok('R2 demanda sin convertir y sin oferta: pedir oferta', OP.routeOf(T('unconverted'), false).id === 'ask');
ok('R3 demanda sin convertir pero con oferta recibida: exponer', OP.routeOf(T('unconverted'), true).id === 'expose');
ok('R4 peso alto: sostener o proteger', OP.routeOf(T('highWeight'), false).id === 'protect' && OP.routeOf(T('highWeight', 'growing'), false).id === 'protect');
ok('R5 visibilidad baja o crecimiento: exponer', OP.routeOf(T('lowVisibility'), false).id === 'expose' && OP.routeOf(T('growing'), false).id === 'expose');
ok('R6 peso alto con demanda sin convertir: pide oferta (Comercial decide con el laboratorio)', OP.routeOf(T('highWeight', 'unconverted'), false).id === 'ask');
ok('R7 cuatro salidas con nombre y orden', OP.ROUTE_ORDER.length === 4 && OP.ROUTE_ORDER.every((k) => OP.ROUTES[k].label));

// Solicitudes
const reg = RQ.createRegistry();
const items = [{ sku: 'A1', name: 'Uno', category: 'C', lab: 'LAB X', reasons: ['r'] }, { sku: 'A2', name: 'Dos', category: 'C', lab: 'LAB Y' }, { sku: 'A3', name: 'Tres', lab: '' }];
ok('Q1 sin nombre no pide', !RQ.create(reg, items, {}).ok && reg.requests.length === 0);
const c1 = RQ.create(reg, items, { by: 'Ana', now: '2026-10-01T10:00:00.000Z' });
ok('Q2 crea una por SKU en un folio', c1.ok && c1.created.length === 3 && c1.batchId === 'PED-0001' && reg.requests.every((r) => r.state === 'asked' && r.to === 'Comercial' && r.askedBy === 'Ana'), c1);
ok('Q3 no repite una solicitud abierta', (() => { const c = RQ.create(reg, [items[0], { sku: 'A9', name: 'Nueve', lab: 'LAB Z' }], { by: 'Ana', now: '2026-10-02T10:00:00.000Z' }); return c.ok && c.created.length === 1 && c.skipped[0] === 'A1' && c.batchId === 'PED-0002'; })());
ok('Q4 si todo está abierto falla y no gasta folio', (() => { const before = reg.batchSeq; const c = RQ.create(reg, [items[0]], { by: 'Ana' }); return !c.ok && reg.batchSeq === before; })());
ok('Q5 «Sin respuesta» a los 7 días, antes «Pedida»', RQ.status(reg.requests[0], '2026-10-07') === 'asked' && RQ.status(reg.requests[0], '2026-10-08') === 'noReply' && RQ.WAIT_DAYS === 7);
ok('Q6 conteos', (() => { const s = RQ.summary(reg, '2026-10-08'); return s.noReply === 3 && s.asked === 1 && s.open === 4; })(), RQ.summary(reg, '2026-10-08'));
ok('Q7 viewOf por SKU', RQ.viewOf(reg, 'A1', '2026-10-08') === 'noReply' && RQ.viewOf(reg, 'A9', '2026-10-08') === 'asked' && RQ.viewOf(reg, 'ZZ', '2026-10-08') === 'none');

// Cierre automático al llegar la oferta
const offers = [{ offerId: 'O1', sku: 'A1', state: 'received', receivedAt: '2026-10-05T09:00:00.000Z' }, { offerId: 'O2', sku: 'A2', state: 'discarded', receivedAt: '2026-10-05T09:00:00.000Z' }, { offerId: 'O3', sku: 'A3', state: 'validated', receivedAt: '2026-09-20T09:00:00.000Z' }];
const done = RQ.reconcile(reg, offers);
ok('Q8 una oferta recibida después de pedir cierra la solicitud', done.length === 1 && reg.requests[0].state === 'received' && reg.requests[0].offerId === 'O1' && reg.requests[0].history.length === 2, done);
ok('Q9 una oferta descartada o anterior a la solicitud no la cierra', reg.requests[1].state === 'asked' && reg.requests[2].state === 'asked');
ok('Q10 tras recibirla, el SKU se puede volver a pedir', RQ.create(reg, [items[0]], { by: 'Ana', now: '2026-10-10T10:00:00.000Z' }).ok);
ok('Q11 cancelar pide nombre y solo sirve si está pedida', !RQ.cancel(reg, reg.requests[1].reqId, {}).ok && RQ.cancel(reg, reg.requests[1].reqId, { by: 'Ana' }).ok && !RQ.cancel(reg, reg.requests[1].reqId, { by: 'Ana' }).ok && RQ.viewOf(reg, 'A2', '2026-10-20') === 'none');
ok('Q12 se guarda y se lee igual', (() => { const h = RQ.hydrate(JSON.parse(JSON.stringify(reg))); return JSON.stringify(RQ.hydrate(JSON.parse(JSON.stringify(h)))) === JSON.stringify(h) && h.requests.length === reg.requests.length && h.seq === reg.seq && h.requests.every((r, i) => r.reqId === reg.requests[i].reqId && r.state === reg.requests[i].state); })());
ok('Q13 un registro dañado no rompe', RQ.hydrate(null).requests.length === 0 && RQ.hydrate({ requests: [{ x: 1 }, null] }).requests.length === 0);
ok('Q14 por laboratorio suma SKU y venta; sin laboratorio al final', (() => { const l = RQ.byLab([{ lab: 'B', revenue: 5 }, { lab: '', revenue: 7 }, { lab: 'A', revenue: 1 }, { lab: 'B', revenue: 5 }]); return l.map((x) => x.lab).join() === 'A,B,Sin laboratorio' && l[1].skus === 2 && l[1].revenue === 10; })());

// Excel por laboratorio
const it = (sku, rev) => ({ sku, name: `P${sku}`, category: 'C', subcategory: 'S', types: [{ label: 'Demanda no convertida', reason: 'x' }], evidence: { level: 'high', notes: [] }, revenue: rev, views: 100, conversion: 0.01 });
const book = FP.promotionExport.buildRequestBook([{ item: it('1', 100), lab: 'Zeta', reqId: 'SOL-00001' }, { item: it('2', 900), lab: 'Alfa', reqId: 'SOL-00002' }, { item: it('3', 50), lab: 'Alfa', reqId: 'SOL-00003' }, { item: it('4', 10), lab: 'Sin laboratorio', reqId: 'SOL-00004' }], { folio: 'PED-0001', by: 'Ana', at: '2026-10-01', period: { from: '2026-09-01', to: '2026-09-30' }, baseline: { label: 'Periodo anterior' } });
const rowsS = book.sheets[0].rows.slice(6);
ok('X1 hoja Solicitud ordenada por laboratorio y venta; sin laboratorio al final', rowsS.map((r) => r[1]).join() === '2,3,1,4', rowsS.map((r) => r[1]));
const flat = JSON.stringify(book);
ok('X2 sin costos, márgenes ni precios', !/costo|margen|precio/i.test(flat.replace(/No incluye costos ni márgenes/g, '')), flat.match(/costo|margen|precio/gi));
ok('X3 hoja «Por laboratorio» con SKU y venta', book.sheets[1].name === 'Por laboratorio' && book.sheets[1].rows.slice(4).length === 3);
ok('X4 el Excel se puede armar', (() => { require('../js/export/zip.js'); require('../js/export/xlsxWriter.js'); const b = FP.xlsxWriter.build(book); return b && b.length > 500; })());

// Barra guía
{ const base = { offers: [], promotions: [{ promoId: 'P1', name: 'x', status: 'closed', skus: [] }], today: '2026-10-26' };
  ok('G1 sin nada pendiente y con pedidas sin respuesta, la barra avisa', (() => { const s = FP.guide.nextStep(Object.assign({}, base, { noReply: 2 })); return !s.done && s.step === 0 && /Comercial/.test(s.title) && s.go.tab === 'oportunidades' && s.go.filter.request === 'noReply'; })(), FP.guide.nextStep(Object.assign({}, base, { noReply: 2 })));
  ok('G2 sin pedidas sin respuesta sigue «al día»', FP.guide.nextStep(Object.assign({}, base, { noReply: 0 })).done === true); }

console.log(`${n - fails}/${n} pruebas de solicitudes ${fails ? 'FALLARON' : 'OK'}`);
process.exit(fails ? 1 : 0);
