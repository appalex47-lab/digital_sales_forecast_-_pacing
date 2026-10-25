// Pruebas del resumen de promociones (js/promotions/summaryEngine.js). Uso: node tools/test-summary.js
global.window = global; global.FP = {};
require('../js/promotions/summaryEngine.js');
const S = FP.summary; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };
const of = (id, sku, o) => Object.assign({ offerId: id, batchId: 'LOT-001', sku, state: 'received', discount: 0.3, category: 'Cat A', lab: 'Lab 1', program: '' }, o);
const reg = S.createRegistry();
ok('S1 exige nombre', !S.register(reg, { name: '', skus: ['A'] }).ok && !S.register(reg, { name: 'x', skus: [] }).ok);
ok('S2 registra con id, SKU únicos y sin exigir nombre único', S.register(reg, { name: 'P1', by: 'Ana', skus: ['A', 'B', 'B', 'C', 'D'] }).proposal.id === 'PRP-0001' && S.register(reg, { name: 'P1', skus: ['A'] }).ok && reg.proposals[0].skus.length === 4);
const h = S.hydrate(JSON.parse(JSON.stringify(reg))); ok('S3 hydrate conserva y descarta basura', h.proposals.length === 2 && h.seq === 2 && S.hydrate({ proposals: 5 }).proposals.length === 0 && S.hydrate(null).seq === 0);
const offers = [
  of('O1', 'A', { discount: 0.3, state: 'selected', program: 'Prog 1' }), of('O2', 'A', { discount: 0.35, state: 'received', program: '' }),
  of('O3', 'B', { discount: 0.25, state: 'validated', program: 'Prog 1' }), of('O4', 'Z', { discount: 0.1, category: 'Cat B', lab: 'Lab 2' }),
  of('O5', 'D', { state: 'discarded' }), of('O6', 'C', { batchId: 'LOT-002', discount: 0.2 })
];
const batches = [{ batchId: 'LOT-001', campaign: 'Nov' }, { batchId: 'LOT-002', campaign: 'Dic' }];
const promotions = [{ status: 'published', skus: [{ sku: 'A' }] }, { status: 'proposed', skus: [{ sku: 'B' }] }, { status: 'draft', skus: [{ sku: 'C' }] }];
let r = S.build({ offers, batches, proposals: reg.proposals, promotions, oppTotal: 120, oppItems: [{ sku: 'D', category: 'Cat C' }], group: 'cat' });
ok('S4 embudo', r.funnel.detected === 120 && r.funnel.proposed === 4 && r.funnel.withOffer === 3 && r.funnel.validated === 2 && r.funnel.selected === 1 && r.funnel.inPromo === 2, r.funnel);
ok('S5 descartadas no cuentan como ofertas; sin oferta = D', r.total.sin === 1 && r.total.of === 4 && r.pending.noOffer === 1, r.total);
ok('S6 oferta de SKU no propuesto va a «fuera de propuesta»', r.total.fuera === 1 && r.pending.outside === 1);
ok('S7 SKU con dos ofertas cuenta una vez en SKU y dos en ofertas', r.rows.find((x) => x.label === 'Cat A').sp === 3 && r.rows.find((x) => x.label === 'Cat A').of === 4, r.rows);
ok('S8 pendientes recibidas y validadas', r.pending.received === 3 && r.pending.validated === 1, r.pending);
ok('S9 sin categoría usa Oportunidades', r.rows.some((x) => x.label === 'Cat C' && x.sp === 1 && x.sin === 1));
ok('S10 descuento promedio de las ofertas', Math.abs(r.total.avg - (0.3 + 0.35 + 0.25 + 0.2) / 4) < 1e-9, r.total.avg);
r = S.build({ offers, batches, proposals: reg.proposals, promotions, group: 'prog' });
ok('S11 programa sale de la oferta de mayor descuento (A→sin programa) y B→Prog 1', r.rows.find((x) => x.label === 'Prog 1').sp === 1 && r.rows.find((x) => x.label === 'Sin programa').sp === 3, r.rows);
ok('S12 sin oportunidades calculadas el embudo lo dice con null', r.funnel.detected === null);
r = S.build({ offers, batches, proposals: reg.proposals, promotions, group: 'lab', campaign: 'Dic' });
ok('S13 filtra por campaña y lista campañas', r.campaigns.join() === 'Dic,Nov' && r.total.of === 1 && r.pending.received === 1, r.total);
r = S.build({ offers: [], batches: [], proposals: [], promotions: [], group: 'zzz' });
ok('S14 vacío no truena y el grupo inválido cae en categoría', r.group === 'cat' && r.rows.length === 0 && r.total.cover === null);
{ const brand = S.build({ offers: [], batches: [], proposals: [{ skus: ['Q'] }], promotions: [], oppItems: [{ sku: 'Q', category: 'Cat Q', brand: 'Lab Q' }], group: 'lab' });
  ok('S15 el laboratorio sale del catálogo si el SKU no tiene oferta', brand.rows.length === 1 && brand.rows[0].label === 'Lab Q', brand.rows); }
console.log(fails ? `\n${fails} de ${n} pruebas fallaron` : `\n${n}/${n} pruebas del resumen OK`); process.exit(fails ? 1 : 0);
