// Pruebas de metas por campaña (js/promotions/campaignGoals.js). Uso: node tools/test-goals.js
global.window = global; global.FP = {};
require('../js/promotions/promotionStore.js'); require('../js/promotions/campaignGoals.js');
const G = FP.goals; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

{ const reg = G.createRegistry();
  ok('G1 sin campaña no guarda', !G.setGoal(reg, '  ', { revenue: 1000 }, 'A').ok);
  ok('G2 sin quien la fija no guarda', !G.setGoal(reg, 'Buen Fin', { revenue: 1000 }, '').ok);
  ok('G3 exige al menos una meta mayor que cero', !G.setGoal(reg, 'Buen Fin', { revenue: 0, units: '' }, 'A').ok && !G.setGoal(reg, 'Buen Fin', {}, 'A').ok);
  ok('G4 rechaza negativos y no numéricos', !G.setGoal(reg, 'Buen Fin', { revenue: -5 }, 'A').ok && !G.setGoal(reg, 'Buen Fin', { revenue: 'abc' }, 'A').ok);
  const r = G.setGoal(reg, 'Buen Fin', { revenue: 1000000, units: 5000, note: 'Plan 2026' }, 'Alejandro');
  ok('G5 guarda venta, unidades, nota y quién', r.ok && r.goal.revenue === 1000000 && r.goal.units === 5000 && r.goal.createdBy === 'Alejandro' && r.goal.note === 'Plan 2026');
  ok('G6 una sola meta por campaña aunque cambien mayúsculas', G.setGoal(reg, ' buen  fin ', { revenue: 2000000 }, 'Alejandro').ok && reg.goals.length === 1 && reg.goals[0].revenue === 2000000 && reg.goals[0].units === null);
  ok('G7 cada cambio queda en el historial', reg.goals[0].history.some((h) => h.field === 'revenue' && h.from === 1000000 && h.to === 2000000) && reg.goals[0].history.some((h) => h.field === 'units' && h.to === null));
  ok('G8 quitar pide nombre y funciona', !G.removeGoal(reg, 'Buen Fin', '').ok && G.removeGoal(reg, 'Buen Fin', 'A').ok && reg.goals.length === 0);
  const h = G.hydrate(JSON.parse(JSON.stringify(G.setGoal(reg, 'X', { units: 10 }, 'A').ok ? reg : reg)));
  ok('G9 sobrevive a guardar y cargar', h.goals.length === 1 && h.goals[0].units === 10);
}
// Avance
{ const pr = FP.promotions, reg = pr.createRegistry();
  const mk = (name, camp, status) => { const r = pr.createPromotion(reg, { name, createdBy: 'A', plannedStart: '2026-09-20', plannedEnd: '2026-09-30', campaign: camp }); const p = r.promotion; p.status = status; return p; };
  const p1 = mk('P1', 'Buen Fin', 'measuring'), p2 = mk('P2', 'buen fin', 'closed'), p3 = mk('P3', 'Navidad', 'measuring'), p4 = mk('P4', 'Buen Fin', 'proposed');
  const W = { start: '2026-09-20', end: '2026-09-30' };
  const it = (sku, rev, units, inc, win) => ({ sku, status: 'ok', window: win || W, actual: { revenue: rev, units }, incremental: { revenue: inc } });
  const cut = (rev, units, inc, sku = 'S1') => ({ id: 'EV-001', cutoff: '2026-09-30', counts: { evaluable: 1, total: 1 }, items: [it(sku, rev, units, inc)] });
  p1.evaluations = [cut(100, 10, 40, 'S1')]; p2.evaluations = [cut(300, 30, 100, 'S2')];
  const goal = { campaign: 'Buen Fin', revenue: 1000, units: 100 };
  const a = G.progress(goal, reg.promotions);
  ok('A1 suma solo promociones medibles de la campaña (ignora otra campaña y las que no se publicaron)', a.promos.length === 2 && a.revenue === 400 && a.units === 40 && a.incremental === 140, a);
  ok('A2 porcentaje de venta y unidades', Math.abs(a.pctRevenue - 0.4) < 1e-9 && Math.abs(a.pctUnits - 0.4) < 1e-9 && a.status === 'ok');
  p2.evaluations = [];
  const b = G.progress(goal, reg.promotions);
  ok('A3 una promoción sin corte va en «missing» y el avance es parcial', b.missing.length === 1 && b.missing[0].promoId === p2.promoId && b.status === 'partial' && b.revenue === 100, b);
  const live = { [p2.promoId]: { dataMax: '2026-09-28', counts: { evaluable: 1, total: 1 }, items: [it('S2', 500, 50, 90)] } };
  const c = G.progress(goal, reg.promotions, live);
  ok('A4 la evaluación al día reemplaza el corte guardado de esa promoción y se queda con su fecha de datos', c.revenue === 600 && c.status === 'ok' && c.promos.find((x) => x.promoId === p2.promoId).source === 'live' && c.promos.find((x) => x.promoId === p2.promoId).cutoff === '2026-09-28' && c.cutoffMin === '2026-09-28' && c.cutoffMax === '2026-09-30' && !c.allLive, c);
  ok('A5 campaña sin promociones medibles', G.progress({ campaign: 'Nada', revenue: 5 }, reg.promotions).status === 'no_promos');
  ok('A6 meta solo de unidades no inventa porcentaje de venta', G.progress({ campaign: 'Buen Fin', units: 100 }, reg.promotions).pctRevenue === null);
  ok('A7 campañas conocidas: lotes + promociones + metas, sin repetir', JSON.stringify(G.campaignsOf({ batches: [{ campaign: 'Buen Fin' }, { campaign: 'Hot Sale' }] }, reg.promotions, { goals: [{ campaign: 'Navidad' }, { campaign: 'Extra' }] })) === JSON.stringify(['Buen Fin', 'Extra', 'Hot Sale', 'Navidad']));
  { // doble conteo: mismo SKU en dos promociones de la campaña
    p2.evaluations = [cut(300, 30, 100, 'S1')];   // mismo SKU y mismas fechas que P1
    const d = G.progress(goal, reg.promotions);
    ok('A9 el mismo SKU con las mismas fechas en dos promociones cuenta una vez', d.revenue === 100 && d.units === 10 && d.dupes.length === 1 && d.dupes[0].sku === 'S1', d);
    p2.evaluations = [{ id: 'EV-001', cutoff: '2026-09-30', counts: { evaluable: 1, total: 1 }, items: [it('S1', 300, 30, 100, { start: '2026-09-25', end: '2026-10-05' })] }];
    const e = G.progress(goal, reg.promotions);
    ok('A10 un traslape parcial se conserva pero se avisa', e.revenue === 400 && e.partial.length === 1 && e.dupes.length === 0, e);
    p2.evaluations = [cut(300, 30, 100, 'S2')];
    ok('A11 SKU distintos no se tocan', G.progress(goal, reg.promotions).revenue === 400);
    const lv = { [p1.promoId]: { dataMax: '2026-09-30', counts: { evaluable: 1, total: 1 }, items: [it('S1', 120, 12, 50)] }, [p2.promoId]: { dataMax: '2026-09-30', counts: { evaluable: 1, total: 1 }, items: [it('S2', 310, 31, 90)] } };
    const g = G.progress(goal, reg.promotions, lv);
    ok('A12 si todas son al día, allLive y suma lo al día', g.allLive && g.revenue === 430, g);
  }
  ok('A8 la promoción guarda su campaña y se puede editar', pr.updatePromotion(reg, p3.promoId, { campaign: 'Hot Sale' }, 'A').ok && p3.campaign === 'Hot Sale');
}
// Ticket por unidad
{ const rows = [ { sku: 'A', category: 'Genéricos', revenue: 1000, units: 100 }, { sku: 'B', category: 'Genéricos', revenue: 500, units: 50 },
    { sku: 'C', category: 'Oncología', revenue: 90000, units: 30 }, { sku: 'D', category: 'Cuidado personal', revenue: 4000, units: 40 }, { sku: 'E', category: 'X', revenue: 0, units: 0 }, { sku: 'F', category: 'Y', revenue: 50, units: 0 } ];
  const t = G.ticketStats(rows);
  ok('T1 ticket por categoría = venta ÷ unidades, de mayor a menor', t.byCategory.length === 3 && t.byCategory[0].category === 'Oncología' && t.byCategory[0].ticket === 3000 && t.byCategory.find((x) => x.category === 'Genéricos').ticket === 10, t);
  ok('T2 el corte alto/bajo es la mediana entre categorías (la que queda justo en la mediana cuenta como alta)', t.cut === 100 && t.byCategory.find((x) => x.category === 'Oncología').level === 'alto' && t.byCategory.find((x) => x.category === 'Genéricos').level === 'bajo', t);
  ok('T3 filas sin unidades no cuentan', t.skus === 4);
  const ct = G.campaignTicket(['A', 'B', 'ZZ'], rows);
  ok('T4 ticket de los SKU de la campaña (ignora los que no tienen venta)', ct.ticket === 10 && ct.skus === 2 && ct.asked === 3, ct);
  ok('T5 sugerencia: alto → venta, bajo → unidades, sin dato → nada', G.suggestMain(3000, 100) === 'revenue' && G.suggestMain(10, 100) === 'units' && G.suggestMain(null, 100) === null && G.suggestMain(10, null) === null);
  const ic = G.impliedCheck(10000, 500, 10);
  ok('T6 precio implícito ÷ histórico: dentro de la banda no avisa, fuera sí', ic.implied === 20 && ic.off && G.impliedCheck(1100, 100, 10).off === false && G.impliedCheck(1000, 0, 10) === null && G.impliedCheck(1000, 100, null).off === false, ic);
  const dc = G.impliedCheck(1400000, 10000, 200, 0.3);
  ok('T8 con 30 % de descuento promedio, $140 por unidad (−30 % del histórico) es lo esperado y no avisa', dc.expected === 140 && Math.abs(dc.ratio) < 1e-9 && !dc.off && dc.discount === 0.3, dc);
  ok('T9 sin descuento, esa misma captura sí avisa; con descuento y un precio fuera de lo esperado también', G.impliedCheck(1400000, 10000, 200).off === true && G.impliedCheck(2000000, 6000, 200, 0.3).off === true && G.impliedCheck(2000000, 10000, 200, 0.3).off === true);
  ok('T10 descuento inválido (0, 1 o texto) se ignora', G.impliedCheck(1000, 10, 100, 0).expected === 100 && G.impliedCheck(1000, 10, 100, 1).expected === 100 && G.impliedCheck(1000, 10, 100, 'x').expected === 100);
  const wk = (p) => [{ sku: 'A', revenue: p * 10, units: 10 }, { sku: 'Z', revenue: 999, units: 1 }];
  const flat = G.autoBand([100, 100, 100, 100, 100, 100, 100, 100].map(wk), ['A']), noisy = G.autoBand([100, 160, 70, 150, 60, 140, 90, 130].map(wk), ['A']), mid = G.autoBand([100, 112, 94, 108, 96, 110, 98, 104].map(wk), ['A']), few = G.autoBand([100, 100, 100].map(wk), ['A']);
  ok('T12 precio semanal casi fijo → tolerancia mínima de 10 %', flat.auto && flat.band === 0.10 && flat.cv === 0, flat);
  ok('T13 precio semanal muy movido → nunca pasa de 25 %', noisy.auto && noisy.band === 0.25 && noisy.cv > 0.125, noisy);
  ok('T14 variación intermedia → 2 veces la variación, entre 10 % y 25 %', mid.auto && mid.band > 0.10 && mid.band < 0.25 && Math.abs(mid.band - 2 * mid.cv) < 1e-9, mid);
  ok('T15 con menos de 6 semanas con venta no se ajusta: 25 % y lo dice', !few.auto && few.band === 0.25 && few.weeks === 3 && G.autoBand([], ['A']).band === 0.25);
  ok('T16 solo cuentan los SKU de la campaña', G.autoBand([100, 100, 100, 100, 100, 100].map(wk), ['Z']).auto === true && G.autoBand([100, 100, 100, 100, 100, 100].map(wk), ['Q']).auto === false);
  ok('T17 la tolerancia propia manda en el aviso', G.impliedCheck(1150, 100, 10, null, 0.10).off === true && G.impliedCheck(1150, 100, 10, null, 0.25).off === false && G.impliedCheck(1150, 100, 10).band === 0.25);
  const ad = G.avgDiscount([{ sku: 'A', discount: 0.2 }, { sku: 'A', discount: 0.4 }, { sku: 'B', discount: 0.2 }, { sku: 'C', discount: null }, { sku: 'D', discount: 1.5 }]);
  ok('T11 descuento promedio: por SKU el mayor, luego promedio de SKU; ignora vacíos e inválidos', Math.abs(ad.avg - 0.3) < 1e-9 && ad.skus === 2 && G.avgDiscount([]) === null && G.avgDiscount([{ sku: 'A' }]) === null, ad);
  ok('T7 la banda es de 25 %', G.TICKET_BAND === 0.25 && G.impliedCheck(1250, 100, 10).off === false && G.impliedCheck(1300, 100, 10).off === true);
}
// punto de partida automático de la meta
{ const rows = [{ sku: 'A', revenue: 5600, units: 56 }, { sku: 'B', revenue: 11200, units: 28 }, { sku: 'C', revenue: 999, units: 9 }];
  const b = G.baselineSuggestion(['A', 'B'], rows, 56, 10);
  ok('BS1 ritmo de la ventana llevado a los días de la campaña', b && Math.round(b.revenue) === 3000 && Math.round(b.units) === 15 && b.skus === 2, b);
  ok('BS2 sin fechas de campaña o sin SKU con venta no sugiere nada', G.baselineSuggestion(['A'], rows, 56, null) === null && G.baselineSuggestion(['Z'], rows, 56, 10) === null);
  ok('BS3 sin unidades devuelve solo la venta', G.baselineSuggestion(['A'], [{ sku: 'A', revenue: 560, units: 0 }], 56, 28).units === null); }

console.log(fails ? `${fails} fallas de ${n}` : `${n}/${n} pruebas OK`); process.exit(fails ? 1 : 0);
