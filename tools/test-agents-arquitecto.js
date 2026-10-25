// Pruebas del Arquitecto de Ofertas (agente de promociones): tres hallazgos, estados vacíos, IA, preguntas libres y panel.
// Uso: node tools/test-agents-arquitecto.js     (estado y almacén simulados: no depende de los datos de demo)
global.window = global; global.FP = {};
['js/config/config.js', 'js/ai/cohereClient.js', 'js/ai/cohereAnalysisAssistant.js', 'js/promotions/activationEngine.js', 'js/promotions/opportunityEngine.js', 'js/promotions/campaignGoals.js', 'js/promotions/promotionEvaluation.js',
  'js/agents/analistaDetectors.js', 'js/agents/analistaStory.js', 'js/agents/auditorDetectors.js', 'js/agents/arquitectoDetectors.js', 'js/agents/agentRunner.js', 'js/agents/agentLauncher.js'].forEach((f) => require('../' + f));
let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 600) : ''); } };
const AR = FP.agents.arquitecto, R = FP.agents.runner, REG = FP.agents.registry;
const causal = /se debe a|la causa es|esto demuestra|caus[oó] /i, costo = /margen|rentab|inventario|costo/i;
const allText = (f) => JSON.stringify({ ...f, limites: undefined, facts: undefined, detector: undefined });   // los límites sí nombran lo que NO hay

// ---------- Fixtures ----------
const item = (sku, rev, o = {}) => ({ sku, name: `Producto ${sku}`, category: o.cat || 'Vitaminas', types: [{ id: 'highWeight' }], evidence: { level: o.ev || 'high', notes: [] }, revenue: rev, sortKey: rev, conversion: 0.03, categoryMedianConversion: 0.02, categoryShare: 0.3, offers: [] });
const prof = (it) => [it.sku, { revenue: it.revenue, views: 1000, conv: it.conversion, medConv: it.categoryMedianConversion, share: it.categoryShare, typeIds: ['highWeight'], evidence: it.evidence.level, hasFunnel: true }];
const mkItems = (k, o = {}) => Array.from({ length: k }, (_, i) => item(`P${i + 1}`, 50000 - i * 3000, o));
const opp = (items) => ({ items, profiles: new Map(items.map(prof)), period: { label: 'octubre 2026' }, from: '2026-10-01', to: '2026-10-27' });
const batch = (id, name, start, end) => ({ batchId: id, campaign: name, start, end });
const offer = (id, batchId, sku, o = {}) => ({ offerId: id, batchId, sku, name: `Oferta ${sku}`, category: 'Vitaminas', state: 'received', discount: 0.2, controlled: 'Ningún Control', start: o.start || '', end: o.end || '', ...o });
const base = (o = {}) => Object.assign({
  of: { reg: { offers: [], batches: [] } }, pm: { reg: { promotions: [] } }, cg: { reg: { goals: [] } }, ac: { reg: { params: { ...FP.activation.SETTINGS } } }, op: { result: null }, events: []
}, o);
const D = (o = {}) => ({ today: () => '2026-10-28', store: { available: () => true, meta: { dateMax: '2026-10-27' } }, ...o });
const run = (state, o = {}) => AR.detect(state, { deps: D(o) });

(async () => {
  // ---------- Registro ----------
  ok('A1 el Arquitecto está disponible y Promociones lo abre', REG.AGENTS.arquitecto.available === true && REG.defaultAgent('promociones') === 'arquitecto' && !REG.AGENTS.arquitecto.phase);
  ok('A2 el Arquitecto no promete margen ni inventario', !/promete|ganancia/.test(REG.AGENTS.arquitecto.role) && /No habla de margen/.test(REG.AGENTS.arquitecto.role));

  // ---------- Sin nada ----------
  let r = await run(base());
  ok('B1 sin ofertas ni promociones → sin_promos, sin hallazgos', r.status === 'sin_promos' && r.findings.length === 0, r);
  r = await AR.detect({}, { deps: D() });
  ok('B2 estado vacío no lanza', r.status === 'sin_promos' && r.findings.length === 0);

  // ---------- Hallazgo 1: oportunidades altas sin oferta + reloj ----------
  const items = mkItems(4);
  let st = base({ of: { reg: { offers: [offer('O1', 'L1', 'X1')], batches: [batch('L1', 'Buen Fin', '2026-11-02', '2026-11-05')] } }, op: { result: { items, profiles: new Map(items.map(prof)), period: { label: 'octubre 2026' } } } });
  r = await run(st);
  let f1 = r.findings.find((f) => f.id === 'oportunidades_altas');
  ok('C1 encuentra las oportunidades altas sin oferta', !!f1 && f1.facts.n === 4, f1 && f1.facts);
  ok('C2 el reloj: Buen Fin arranca en 5 días → urgente, título lo dice', f1.facts.urgent === true && f1.facts.days === 5 && /Buen Fin/.test(f1.title) && /Arranca en 5 días/.test(f1.tag), f1.title);
  const lejos = await run(base({ ...st, of: { reg: { offers: st.of.reg.offers, batches: [batch('L1', 'Buen Fin', '2026-11-20', '2026-11-25')] } } }));
  const f1b = lejos.findings.find((f) => f.id === 'oportunidades_altas');
  ok('C3 una campaña a 23 días no mete el reloj y la puntuación baja', f1b && !f1b.facts.urgent && f1b.score < f1.score && !/arranca/.test(f1b.title), [f1b && f1b.score, f1.score]);
  ok('C4 6 días no es «a punto de arrancar»; 0 días (hoy) sí', (await run(base({ ...st, of: { reg: { offers: st.of.reg.offers, batches: [batch('L1', 'X', '2026-11-03', '2026-11-05')] } } }))).findings.find((f) => f.id === 'oportunidades_altas').facts.urgent === false
    && (await run(base({ ...st, of: { reg: { offers: st.of.reg.offers, batches: [batch('L1', 'X', '2026-10-28', '2026-11-05')] } } }))).findings.find((f) => f.id === 'oportunidades_altas').facts.days === 0);
  ok('C4b el detalle lista todos los SKU (hasta 30) con SKU, producto, venta, evidencia y dónde colocarlo', f1.lista && f1.lista.visual.rows.length === 4 && f1.lista.visual.head.includes('SKU') && f1.lista.visual.rows[0][0] === 'P1' && /Producto P1/.test(f1.lista.visual.rows[0][1]) && /^\$/.test(f1.lista.visual.rows[0][3]) && f1.lista.visual.rows[0][4] === 'Alta', f1.lista);
  { const many = mkItems(40); const x = (await run(base({ of: st.of, op: { result: opp(many) } }))).findings.find((f) => f.id === 'oportunidades_altas'); ok('C4c con 40 SKU lista 30 y dice que hay más', x.lista.visual.rows.length === 30 && /de 40/.test(x.lista.title), x.lista.title); }
  ok('C5 owner Comercial, evidencia con cifras del motor y hipótesis no causal', f1.owner === 'Comercial' && f1.evid.length >= 5 && !causal.test(allText(f1)) && /hipótesis a validar/.test(f1.hipotesis), f1.evid);
  ok('C6 un SKU que ya tiene oferta no cuenta como sin oferta', (await run(base({ ...st, of: { reg: { offers: [offer('O2', 'L1', 'P1')], batches: st.of.reg.batches } } }))).findings.find((f) => f.id === 'oportunidades_altas').facts.n === 3);
  const inPlan = base({ ...st, pm: { reg: { promotions: [{ promoId: 'PR1', status: 'approved', campaign: 'Buen Fin', plannedStart: '2026-11-02', plannedEnd: '2026-11-05', skus: [{ sku: 'P1' }, { sku: 'P2' }] }] } } });
  ok('C7 un SKU en el plan de una promoción aprobada tampoco cuenta', (await run(inPlan)).findings.find((f) => f.id === 'oportunidades_altas').facts.n === 2);
  ok('C9 sin venta por producto no inventa oportunidades y lo avisa', (await run(base({ of: st.of }), { opp: null })).errors.some((e) => /^oportunidades/.test(e)));
  ok('C10 evidencia baja → muestra limitada', (await run(base({ ...st, op: { result: { items: mkItems(3, { ev: 'low' }), profiles: new Map(mkItems(3, { ev: 'low' }).map(prof)), period: {} } } }))).findings.find((f) => f.id === 'oportunidades_altas').muestraLimitada === true);

  // ---------- Hallazgo 2: banner ----------
  const bannerSt = (k, slots, mode) => base({ of: st.of, op: { result: opp(mkItems(k)) }, ac: { reg: { params: { ...FP.activation.SETTINGS, bannerSlots: slots, bannerMode: mode || 'shared' } } } });
  r = await run(bannerSt(5, 3));
  const f2 = r.findings.find((f) => f.id === 'banner_saturado');
  ok('D1 5 SKU piden banner y hay 3 espacios → hallazgo', !!f2 && f2.facts.total === 5 && f2.facts.slots === 3 && f2.facts.over === 2, f2 && f2.facts);
  ok('D2 con 3 o menos SKU no hay hallazgo', !(await run(bannerSt(3, 3))).findings.some((f) => f.id === 'banner_saturado') && !(await run(bannerSt(2, 3))).findings.some((f) => f.id === 'banner_saturado'));
  ok('D3 quedan en banner los 3 de mayor venta', /Producto P1, Producto P2, Producto P3/.test(f2.evid.find((e) => e.k === 'Los que conservan banner').v), f2.evid);
  ok('D4 el título cuenta los espacios (1 espacio en singular)', /5 SKU piden banner y solo hay 3 espacios/.test(f2.title) && /solo hay 1 espacio$/.test((await run(bannerSt(3, 1))).findings.find((f) => f.id === 'banner_saturado').title));
  ok('D5 con 0 espacios de banner no hay hallazgo (Activación lo apagó)', !(await run(bannerSt(5, 0))).findings.some((f) => f.id === 'banner_saturado'));
  ok('D6 owner Ecommerce, sin causal ni margen', f2.owner === 'Ecommerce' && !causal.test(allText(f2)) && !costo.test(allText(f2)));
  ok('D7 el número de SKU pedidos no depende del tope de Activación (recalcula sin tope)', f2.facts.total === (await run(bannerSt(5, 1))).findings.find((f) => f.id === 'banner_saturado').facts.total);

  // ---------- Hallazgo 3: ritmo ----------
  const PROMO = { promoId: 'PR1', name: 'Vitaminas octubre', status: 'published', campaign: 'Vitaminas', plannedStart: '2026-10-20', plannedEnd: '2026-11-02', skus: [{ sku: 'V1' }, { sku: 'V2' }] };
  const dates = (from, to) => { const out = []; for (let d = from; d <= to; d = AR._addDays(d, 1)) out.push(d); return out; };
  const daily = (from, to, perDay) => async () => ({ data: new Map(dates(from, to).map((d) => [d, new Map([['V1', { revenue: perDay / 2, units: 10, orders: 5 }], ['V2', { revenue: perDay / 2, units: 10, orders: 5 }]])])), dates: new Set(dates(from, to)), max: to });
  const compute = (done) => () => ({ counts: { evaluable: 2, total: 2 }, dataMax: '2026-10-27', items: [{ sku: 'V1', status: 'ok', window: { start: '2026-10-20', end: '2026-11-02' }, actual: { revenue: done / 2, units: 100 } }, { sku: 'V2', status: 'ok', window: { start: '2026-10-20', end: '2026-11-02' }, actual: { revenue: done / 2, units: 100 } }] });
  const goalSt = (target, extra = {}) => base({ of: st.of, pm: { reg: { promotions: [PROMO] } }, cg: { reg: { goals: [Object.assign({ campaign: 'Vitaminas', revenue: target, units: null, history: [] }, extra)] } } });
  // meta 150,000; llevan 93,600; quedan 6 días (28→ 2 nov... corte 27 oct → 6 días) → requerido 9,400; ritmo actual 6,000/día
  r = await run(goalSt(150000), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  const f3 = r.findings.find((f) => f.id.startsWith('ritmo_'));
  ok('E1 ritmo por debajo del requerido → hallazgo con la aritmética exacta', !!f3 && Math.round(f3.facts.required) === 9400 && Math.round(f3.facts.actual) === 6000 && f3.facts.daysLeft === 6 && Math.round(f3.facts.remaining) === 56400, f3 && f3.facts);
  ok('E2 el título dice requerido y actual; evidencia con el avance', /necesita \$9,400 por día y va en \$6,000/.test(f3.title) && f3.evid[0].v.indexOf('62%') === 0, [f3.title, f3.evid]);
  ok('E3 no es pronóstico: lo dice en el resumen y en los límites', /aritmética, no un pronóstico/.test(f3.resumen) && /meta la fijó una persona/.test(f3.limites));
  r = await run(goalSt(150000), { daily: daily('2026-10-14', '2026-10-27', 12000), compute: compute(93600) });
  ok('E4 si el ritmo actual alcanza, no hay hallazgo', !r.findings.some((f) => f.id.startsWith('ritmo_')));
  r = await run(goalSt(90000), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  ok('E5 meta ya cumplida, no hay hallazgo', !r.findings.some((f) => f.id.startsWith('ritmo_')));
  r = await run(goalSt(150000), { daily: daily('2026-10-24', '2026-10-27', 6000), compute: compute(93600) });
  ok('E6 con solo 4 días de venta en la ventana ya no es muestra limitada; con 3 sí', r.findings.find((f) => f.id.startsWith('ritmo_')).muestraLimitada === false
    && (await run(goalSt(150000), { daily: daily('2026-10-25', '2026-10-27', 6000), compute: compute(93600) })).findings.find((f) => f.id.startsWith('ritmo_')).muestraLimitada === true);
  r = await run(goalSt(null, { revenue: null, units: 2000 }), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  ok('E7 una meta en unidades compara unidades, no pesos', !r.findings.some((f) => f.id.startsWith('ritmo_')) || /uds/.test(r.findings.find((f) => f.id.startsWith('ritmo_')).title), r.findings.map((f) => f.title));
  r = await run(base({ of: st.of, pm: { reg: { promotions: [{ ...PROMO, plannedEnd: '2026-10-26' }] } }, cg: goalSt(150000).cg }), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  ok('E8 campaña ya terminada, no hay hallazgo', !r.findings.some((f) => f.id.startsWith('ritmo_')));
  r = await run(base({ of: st.of, pm: { reg: { promotions: [{ ...PROMO, status: 'approved' }] } }, cg: goalSt(150000).cg }), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  ok('E9 promoción sin publicar no tiene ritmo que medir', !r.findings.some((f) => f.id.startsWith('ritmo_')));
  r = await run(goalSt(150000), { daily: async () => { throw new Error('IndexedDB caído'); }, compute: compute(93600) });
  ok('E10 si falla la lectura diaria no lanza y reporta el error', r.status === 'ok' && r.errors.some((e) => /ritmo/.test(e)), r.errors);

  // ---------- Orden, prioridades y contexto ----------
  r = await run(base({ of: st.of, op: { result: opp(mkItems(6)) }, pm: goalSt(150000).pm, cg: goalSt(150000).cg }), { daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) });
  ok('F1 los tres hallazgos conviven y salen de mayor a menor puntaje', ['oportunidades_altas', 'banner_saturado'].every((id) => r.findings.some((f) => f.id === id)) && r.findings.some((f) => f.id.startsWith('ritmo_')) && r.findings.every((f, i, a) => !i || a[i - 1].score >= f.score), r.findings.map((f) => [f.id, f.score]));
  ok('F2 todos son del agente, de revisión, con vista y responsable de la lista', r.findings.every((f) => f.agent === 'arquitecto' && f.section === 'revisar' && f.view === 'promociones' && FP.agents.analista.OWNERS.includes(f.owner) && ['Alta', 'Media', 'Baja'].includes(f.prio)));
  ok('F3 ningún texto del motor usa lenguaje causal ni habla de margen/costo/inventario', r.findings.every((f) => !causal.test(allText(f)) && !costo.test(allText(f))), r.findings.map(allText).filter((t) => causal.test(t) || costo.test(t)));
  ok('F4 un detector que falla no tumba a los demás', (() => { const x = AR.analyze({ status: 'ok', today: '2026-10-28', offers: [], batches: [], promotions: [], params: null, opp: opp(mkItems(2)), rhythm: [], errors: [] }); return x.status === 'ok' && x.errors.some((e) => /bannerSaturado|activación/.test(e)); })());
  const cx = r.contexto;
  ok('F5 el contexto trae campañas, traslapes, ofertas que vencen y avance de metas', cx.campanas.length >= 1 && Array.isArray(cx.traslapes) && Array.isArray(cx.ofertasQueVencen) && cx.avanceDeMetas.length === 1 && cx.altasSinOferta.length >= 1, cx);
  const two = base({ of: { reg: { offers: [offer('O1', 'L1', 'A', { end: '2026-10-31' }), offer('O2', 'L2', 'A')], batches: [batch('L1', 'Buen Fin', '2026-11-13', '2026-11-16'), batch('L2', 'Hot Sale', '2026-11-15', '2026-11-20')] } } });
  const cx2 = (await run(two)).contexto;
  ok('F6 detecta campañas que se pisan con los días y los SKU en común', cx2.traslapes.length === 1 && /Buen Fin y Hot Sale se traslapan 2 días \(15 nov al 16 nov\) con 1 SKU en común/.test(cx2.traslapes[0]), cx2.traslapes);
  ok('F7 ofertas que vencen esta semana', cx2.ofertasQueVencen.length === 1 && /Buen Fin: 1 ofertas vencen desde el 31 oct/.test(cx2.ofertasQueVencen[0]), cx2.ofertasQueVencen);
  const cv = (await run(base({ of: { reg: { offers: [offer('O1', 'L1', 'P1')], batches: [batch('L1', 'X', '2026-11-20', '2026-11-25')] } }, op: { result: opp(mkItems(4)) } }))).contexto.conversion;
  ok('F9 contexto.conversion: fuente del embudo, SKU con y sin oferta, nota de que no mide efecto', cv && /embudo de GA4/.test(cv.fuente) && /en 1 SKU/.test(cv.conOferta) && /en 3 SKU/.test(cv.sinOferta) && /no mide el efecto/.test(cv.nota), cv);

  // ---------- Ejecutor: IA, validación, preguntas ----------
  const ctx = R.buildContext(r, FP.agents.analista.OWNERS, 'arquitecto');
  ok('G1 el contexto de IA trae alcance de promociones, contexto, candidatos y cifras', ctx.alcance.ambito.indexOf('Promociones') === 0 && ctx.contexto && ctx.candidatos.length === r.findings.length && Array.isArray(ctx.cifrasDeContexto) && ctx.candidatos.every((c) => c.cifras.length > 0), Object.keys(ctx));
  ok('G2 las reglas de la IA prohíben margen, descuentos propuestos y causas', /margen/.test(R.RULES.arquitecto) && /No propongas un descuento/.test(R.RULES.arquitecto) && /lenguaje causal/.test(R.RULES.arquitecto) && R.RULES.arquitecto !== R.RULES.auditor);
  const owners = FP.agents.analista.OWNERS;
  const good = { hallazgos: r.findings.map((f) => ({ id: f.id, prioridad: 'Alta', titulo: f.title, resumen: f.resumen, siguientePregunta: f.pregunta, responsable: f.owner })), lectura: 'Hay oportunidades altas sin oferta.' };
  ok('G3 la IA con texto del motor pasa la validación', R.validate(good, ctx, owners).ok);
  const bad = JSON.parse(JSON.stringify(good)); bad.hallazgos[0].resumen = 'Faltan $999,999 de venta.';
  ok('G4 una cifra inventada se rechaza', !R.validate(bad, ctx, owners).ok);
  const causalR = JSON.parse(JSON.stringify(good)); causalR.hallazgos[0].resumen = 'Esto se debe a falta de inventario.'; causalR.hallazgos[0].titulo = 'La causa es el laboratorio';
  ok('G5 el lenguaje causal se rechaza', !R.validate(causalR, ctx, owners).ok);

  const aiState = (o) => base({ ...o, dx: { apiKey: 'k', model: 'm' }, settings: {} });
  FP.cohereConnection = { isConfigured: () => true };
  let calls = 0, lastSystem = '';
  FP.cohereClient.chatJson = async (a) => { calls++; lastSystem = a.system; return { ok: true, text: JSON.stringify(good), model: 'm' }; };
  R.clearCache();
  const full = await R.run(aiState({ of: st.of, op: { result: opp(mkItems(6)) }, pm: goalSt(150000).pm, cg: goalSt(150000).cg }), { agent: 'arquitecto', deps: D({ daily: daily('2026-10-14', '2026-10-27', 6000), compute: compute(93600) }), force: true });
  ok('H1 con IA: ordena y redacta con las reglas del Arquitecto', full.ai.status === 'ok' && full.findings.length === r.findings.length && /Arquitecto de Ofertas/.test(lastSystem), [full.ai, lastSystem.slice(0, 80)]);
  const off = await R.run(base({ of: st.of, op: { result: opp(mkItems(6)) } }), { agent: 'arquitecto', useAI: false, deps: D() });
  ok('H2 sin IA el agente funciona igual con los textos del motor', off.ai.status === 'off' && off.findings.length >= 1 && off.findings.every((f) => f.ai === false));
  ok('H3 sin promociones: status sin_promos y sin llamar a la IA', await (async () => { const c0 = calls; const x = await R.run(aiState({}), { agent: 'arquitecto', deps: D(), force: true }); return x.status === 'sin_promos' && x.findings.length === 0 && calls === c0; })());

  // routeQuestion
  const rq = R.routeQuestion;
  ok('I1 el Analista y el Auditor mandan lo de promociones, banners y campañas al Arquitecto (ya disponible)', rq('analista', '¿Qué promoción me conviene?').to === 'arquitecto' && rq('auditor', '¿Qué pasa con el banner?').to === 'arquitecto' && rq('analista', '¿cómo va la campaña Buen Fin?').to === 'arquitecto');
  ok('I2 el Arquitecto no se manda a sí mismo, y responde las 5 preguntas sugeridas', ['¿Qué campañas se pisan en fechas?', '¿Qué SKU de alta venta no tienen oferta?', '¿Cuál campaña va peor contra su meta?', '¿Qué ofertas vencen esta semana?', '¿Cómo cayó la conversión en los SKU en oferta?'].every((q) => rq('arquitecto', q) === null));
  ok('I3 el Arquitecto rechaza margen, inventario y competencia sin gastar IA', rq('arquitecto', '¿cuál oferta deja más margen?').type === 'refuse' && rq('arquitecto', '¿hay inventario para el 2x1?').type === 'refuse' && rq('arquitecto', 'precio de la competencia').type === 'refuse');

  // ask del Arquitecto: contexto con apoyo
  let sent = null;
  FP.cohereClient.chatJson = async (a) => { sent = a; return { ok: true, text: JSON.stringify({ answer: 'Buen Fin y Hot Sale se traslapan 2 días (15 nov al 16 nov) con 1 SKU en común (Promociones).', nextQuestion: '¿Cuáles son esos SKU?' }), model: 'm' }; };
  const stAsk = aiState({ of: two.of });
  let a1 = await R.ask('arquitecto', '¿Qué campañas se pisan en fechas?', stAsk, { deps: D() });
  ok('J1 ask: responde con la cifra del contexto y usa las reglas del Arquitecto', a1.ok && /traslapan 2 días/.test(a1.answer) && /cita entre paréntesis la fuente/.test(sent.system), a1);
  const payload = JSON.parse(sent.user);
  ok('J2 ask: el contexto lleva traslapes y el apoyo de Embudo y Análisis cuando existe', payload.contexto.traslapes.length === 1 && Array.isArray(payload.apoyo), Object.keys(payload));
  FP.cohereClient.chatJson = async () => ({ ok: true, text: JSON.stringify({ answer: 'Se traslapan 19 días (Promociones).' }), model: 'm' });
  a1 = await R.ask('arquitecto', '¿Qué campañas se pisan en fechas?', stAsk, { deps: D() });
  ok('J3 ask: una cifra que no está en el contexto se descarta', a1.ok === false && /no coincide/.test(a1.errors[0]), a1);
  a1 = await R.ask('arquitecto', '¿Qué campañas se pisan?', aiState({}), { deps: D() });
  ok('J4 ask sin ofertas ni promociones: dice qué falta', a1.ok === false && /Promociones/.test(a1.errors[0]), a1);
  a1 = await R.ask('arquitecto', '¿Cuál oferta deja más margen?', aiState({ of: two.of }), { deps: D() });
  ok('J5 ask: margen se contesta localmente', a1.ok && a1.local && a1.type === 'refuse');

  console.log(fails ? `\n✘ ${fails} de ${n} pruebas fallaron` : `\n✔ ${n}/${n} pruebas del Arquitecto de Ofertas`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✘ error', e); process.exit(1); });
