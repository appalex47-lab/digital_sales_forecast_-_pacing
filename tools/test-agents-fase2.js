// Pruebas de la Fase 2 · Analista de Números (historia del periodo, ruta) y Auditor de Conversión (embudo por producto).
// Uso: node tools/test-agents-fase2.js     (estado, almacén de productos y motores simulados: no depende de los datos de demo)
global.window = global; global.FP = {};
['js/config/config.js', 'js/analytics/trafficConversionEngine.js', 'js/ai/cohereClient.js', 'js/ai/cohereAnalysisAssistant.js', 'js/agents/analistaDetectors.js', 'js/agents/analistaStory.js',
  'js/agents/auditorDetectors.js', 'js/agents/agentRunner.js', 'js/agents/agentLauncher.js'].forEach((f) => require('../' + f));
let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 500) : ''); } };
const A = FP.agents.analista, ST = FP.agents.story, AU = FP.agents.auditor, R = FP.agents.runner;
const rx = /rentab|margen|ganancia|utilidad|promoci|descuent/i;                    // lo que estos agentes no pueden prometer
const causal = /se debe a|la causa es|esto demuestra|caus[oó] /i;
const textsOf = (f) => JSON.stringify({ ...f, limites: undefined, facts: undefined, detector: undefined });   // los límites sí nombran lo que NO hay (costo, margen…)

// ---------- Estado y motores simulados (plan / canales) ----------
const rv = (plan, actual) => ({ plan, actual, gap: actual - plan, gapPct: (actual - plan) / plan, compliance: actual / plan });
const month = (plan, actual) => ({ key: '2026-09', countedDays: 22, plan: { revenue: plan }, toDate: { revenue: rv(plan, actual) }, forecastGap: { revenue: { gapPct: 0 } } });
const mkState = (chs, extra = {}) => {
  const tot = Object.values(chs).reduce((s, c) => [s[0] + c[0], s[1] + c[1]], [0, 0]), channels = {};
  Object.entries(chs).forEach(([id, c]) => { channels[id] = { months: [month(c[0], c[1])] }; });
  return Object.assign({ fc: { lastActualDate: '2026-09-30', run: { plan: { source: 'file' }, total: { months: [month(tot[0], tot[1])] }, channels } }, quality: { totals: {} }, settings: {}, dx: {} }, extra);
};
const home = (o = {}) => Object.assign({ goal: () => ({ status: 'not_reached', attainment: 0.93, goal: 1000000, cumulative: 930000 }), whyPlan: () => null, why: () => ({ status: 'ok', delta: -5000 }), excluded: () => ({ days: 0, revenue: 0 }) }, o);
const advisor = { advise: () => null };

// ---------- Productos simulados (categorías) ----------
const row = (key, cur, base, o = {}) => ({ key, revenue: { current: cur, baseline: base, delta: cur - base, deltaPct: base ? cur / base - 1 : null }, contributionAbs: cur - base, signals: [],
  drivers: { views: { current: 900, baseline: 1000, deltaPct: -0.1 }, orders: { current: 90, baseline: 100, deltaPct: -0.1 }, revenue: { current: cur, baseline: base }, conversionRate: { delta: -0.002 }, aov: { deltaPct: 0.03 } }, ...o });
const mkProducts = (cats, o = {}) => ({
  calls: [],
  run: async function (a) {
    this.calls.push(a.level + '|' + a.comparison);
    if (o.throws) throw new Error('IndexedDB caído');
    if (a.level === 'category' && a.comparison === 'previous') return { rows: cats, total: { revenue: { current: 1, baseline: cats.reduce((s, r) => s + (r.revenue.baseline || 0), 0) } }, baseline: { label: 'mes anterior (mismos días)' }, geoSignals: o.geo === undefined ? [] : o.geo };
    if (a.level === 'subcategory') return { rows: o.subs || [] };
    return { rows: o.yoy || [] };
  }
});
const store = (m = {}) => ({ meta: { dateMax: '2026-09-30', dateMin: '2026-01-01', batches: 3, ...m } });
const range = () => ({ from: '2026-09-01', to: '2026-09-30' });
const deps = (p, extra = {}) => ({ home: home(extra.home), advisor, products: p, store: store(extra.store), range, traffic: { effects: () => ({ traffic: -1, cr: -2, aov: 3, delta: 0 }) } });
const CH = { ecommerce: [500000, 420000], app: [250000, 235000], whatsapp: [150000, 196000] };
const CATS = [row('Endocrinología', 100000, 512000), row('Cardiología', 300000, 400000), row('Dermo', 200000, 194000), row('Vitaminas', 210000, 150000)];

(async () => {
  // =================== HISTORIA DE NÚMEROS ===================
  let s = await ST.build({}, { deps: deps(mkProducts([])) });
  ok('S0 sin plan ni venta → no_data, sin historia ni ruta', s.status === 'no_data' && !s.findings.length && !s.route.length);

  // Sin archivo de productos: se queda en canales y lo dice
  s = await ST.build(mkState(CH), { deps: { ...deps(mkProducts(CATS)), store: { meta: { batches: 0 } } } });
  ok('S1 sin archivo de productos → historia solo con canales y lo dice en la puerta de confianza', s.status === 'ok' && s.productStatus === 'sin_producto' && /archivo de productos/i.test(s.gate.text) && !s.findings.some((f) => /^categoria|donde_revisar/.test(f.id)), { st: s.productStatus, gate: s.gate });
  ok('S1b aun así hay lead, 4 KPIs y 5 preguntas con respuesta', !!s.headline.lead && s.kpis.length === 4 && s.route.length === 5 && s.route.every((r) => r.q && r.a));

  // Con productos
  const P = mkProducts(CATS, { subs: [row('Insulinas', 20000, 308000), row('Otras', 80000, 204000)], yoy: [row('Endocrinología', 100000, 500000)],
    geo: [{ entity: 'Endocrinología', dimension: 'branch', type: 'geo_concentration', explainedShare: 0.7, variation: { delta: -90000 }, geography: [{ name: 'SUC12' }, { name: 'SUC31' }] }] });
  s = await ST.build(mkState(CH), { deps: deps(P) });
  const byId = (id) => s.findings.find((f) => f.id === id);
  ok('S2 con productos: sección «qué se cae» con la categoría concentrada', !!byId('categoria_cae') && byId('categoria_cae').section === 'cae' && /concentra/.test(byId('categoria_cae').title) && /80%/.test(byId('categoria_cae').title), s.findings.map((f) => f.id));
  ok('S2b cifra grande negativa y barras de máximo 4 filas', byId('categoria_cae').big.tone === 'dn' && /^−\$/.test(byId('categoria_cae').big.value) && byId('categoria_cae').visual.rows.length <= 4);
  ok('S3 «qué crece»: categoría y canal que compensa', byId('categoria_crece') && byId('canal_compensa') && [byId('categoria_crece'), byId('canal_compensa')].every((f) => f.section === 'crece' && f.big.tone === 'up'));
  ok('S4 «dónde revisar»: tabla con 2 subcategorías y 1 pista geográfica', byId('donde_revisar') && byId('donde_revisar').visual.rows.length === 3 && /SUC12 y SUC31/.test(byId('donde_revisar').visual.rows[2][0]), byId('donde_revisar') && byId('donde_revisar').visual);
  ok('S4b la pista hereda la prioridad de la caída que desglosa', byId('donde_revisar').prio === byId('categoria_cae').prio || Math.abs(byId('donde_revisar').score - byId('categoria_cae').score) <= 1);
  ok('S5 cada hallazgo cae en una sección y los ids son únicos', s.findings.every((f) => ['cae', 'crece', 'revisar'].includes(f.section)) && new Set(s.findings.map((f) => f.id)).size === s.findings.length);
  ok('S6 titular: lead + 3 renglones con «Se cae», «Crece» y «Para revisar primero»', /abajo del plan/.test(s.headline.lead) && s.headline.items.map((i) => i.k).join('|') === 'Se cae|Crece|Para revisar primero' && /Insulinas/.test(s.headline.items[2].text), s.headline);
  ok('S7 KPIs: venta real, plan, brecha (rojo) y cierre estimado', s.kpis.map((k) => k.k).join('|') === 'Venta real al corte|Plan a la fecha|Brecha|Cierre estimado del mes' && s.kpis[2].tone === 'dn' && /\$930 mil/.test(s.kpis[3].v), s.kpis);
  ok('S8 ruta de 5 preguntas en orden, la última marcada', s.route.length === 5 && s.route[0].q === '¿Cuánto se pierde y contra qué?' && s.route[4].last === true && s.route.slice(0, 4).every((r) => !r.last));
  ok('S8b respuesta 1 trae la brecha y el cierre contra la meta; la 3 el reparto', /contra el plan/.test(s.route[0].a) && /por debajo de la meta/.test(s.route[0].a) && /vistas/.test(s.route[2].a) && /no una causa/.test(s.route[2].a), s.route[0].a);
  ok('S8c respuesta 4: baja en las dos comparaciones → sostenida', /las dos comparaciones/.test(s.route[3].a), s.route[3].a);
  ok('S8d respuesta 5: acciones con responsable', /1\. Comercial:/.test(s.route[4].a) && /volvemos a medir/.test(s.route[4].a), s.route[4].a);
  ok('S9 no habla de rentabilidad/promociones ni usa lenguaje causal (fuera de los «límites»)', s.findings.every((f) => !rx.test(textsOf(f)) && !causal.test(textsOf(f))) && !rx.test(JSON.stringify(s.route)) && !rx.test(JSON.stringify(s.headline)), s.findings.filter((f) => rx.test(textsOf(f))).map((f) => f.id));
  s.findings.filter((f) => !(f.hipotesis && f.validar && f.accion && A.OWNERS.includes(f.owner) && f.limites && f.fuente && f.title && f.resumen && Array.isArray(f.evid) && f.evid.length)).forEach((f)=>console.log('DBG',f.id,f.owner,!!f.limites,!!f.fuente,f.evid&&f.evid.length));
  ok('S9b todo hallazgo trae lo que pide la tarjeta (hipótesis, cómo validar, acción y responsable del catálogo)', s.findings.every((f) => f.hipotesis && f.validar && f.accion && A.OWNERS.includes(f.owner) && f.limites && f.fuente && f.title && f.resumen && Array.isArray(f.evid) && f.evid.length), s.findings.filter((f) => !(f.hipotesis && f.validar && f.accion)).map((f) => f.id));
  ok('S9c las hipótesis se declaran a validar, no como causa', s.findings.every((f) => !/^(la causa|se debe)/i.test(f.hipotesis)) );

  // Repartida (ninguna categoría pasa de 50 %)
  const spread = [row('A', 250000, 300000), row('B', 250000, 300000), row('C', 250000, 300000), row('D', 250000, 300000), row('E', 900000, 600000)];
  s = await ST.build(mkState(CH), { deps: deps(mkProducts(spread)) });
  ok('S10 caída repartida → «Repartida», no «concentra»', byId('categoria_cae') && /Repartida/.test(byId('categoria_cae').tag) && !/concentra/.test(byId('categoria_cae').title), byId('categoria_cae') && byId('categoria_cae').tag);
  // Inmaterial (<1 % de la base)
  s = await ST.build(mkState(CH), { deps: deps(mkProducts([row('A', 99900, 100000), row('B', 5000000, 5000000)])) });
  ok('S11 una caída menor a 1 % de la venta base no se reporta', !byId('categoria_cae'), s.findings.map((f) => f.id));
  // Rebote (cae contra el mes anterior, no contra el año anterior)
  s = await ST.build(mkState(CH), { deps: deps(mkProducts(CATS, { yoy: [row('Endocrinología', 600000, 500000)] })) });
  ok('S12 cae contra el mes anterior pero no contra el año anterior → posible rebote o estacionalidad', /rebote|estacionalidad/.test(s.route[3].a), s.route[3].a);
  s = await ST.build(mkState(CH), { deps: deps(mkProducts(CATS, { yoy: [] })) });
  ok('S12b sin comparación del año anterior no inventa nada de «sostenido»', !/las dos comparaciones/.test(s.route[3].a), s.route[3].a);
  // Fallas
  s = await ST.build(mkState(CH), { deps: deps(mkProducts(CATS, { throws: true })) });
  ok('S13 el almacén de productos falla → la historia sigue con canales, lo reporta y baja la confianza', s.status === 'ok' && s.errors.some((e) => /IndexedDB/.test(e)) && s.gate.level === 'warn' && s.findings.some((f) => f.id === 'brecha_concentrada'), { errs: s.errors, gate: s.gate });
  s = await ST.build(mkState(CH), { deps: { ...deps(mkProducts(CATS)), store: store({ dateMax: '2026-08-15' }) } });
  ok('S14 el archivo de productos no llega al mes → lo dice y no mezcla meses', s.productStatus === 'sin_mes' && /no cubre este mes/.test(s.gate.text), { st: s.productStatus, gate: s.gate.text });
  // Todo en plan
  s = await ST.build(mkState({ ecommerce: [1000000, 1004000], app: [500000, 499000] }), { deps: deps(mkProducts([row('A', 100, 100)]), { home: { goal: () => null, why: () => null }, store: { batches: 0 } }) });
  ok('S15 todo en plan → titular «en plan» y secciones vacías con texto honesto', /en plan/.test(s.headline.lead) && /Nada relevante/.test(s.headline.items[0].text) && s.kpis[3].v === 's/d', { h: s.headline, k: s.kpis[3] });
  ok('S15b sin meta: la ruta no inventa el cierre del mes', !/forecast del método/.test(s.route[0].a), s.route[0].a);
  // Puerta de confianza con datos que distorsionan
  s = await ST.build(mkState(CH, { quality: { totals: { warning: 3 } } }), { deps: deps(mkProducts(CATS)) });
  ok('S16 avisos de calidad → «Dato con avisos» con enlace a Calidad de datos', s.gate.level === 'warn' && s.gate.title === 'Dato con avisos' && s.gate.view === 'calidad', s.gate);
  s = await ST.build(mkState(CH), { deps: deps(mkProducts(CATS)) });
  ok('S16b sin avisos → «Dato confiable»', s.gate.level === 'ok' && s.gate.title === 'Dato confiable', s.gate);
  // Un motor que lanza no tumba la historia
  s = await ST.build(mkState(CH), { deps: { ...deps(mkProducts(CATS)), home: { goal: () => { throw new Error('boom'); }, whyPlan: () => { throw new Error('boom'); }, why: () => { throw new Error('boom'); }, excluded: () => ({ days: 0 }) } } });
  ok('S17 si los motores de plan fallan no se rompe: sigue con lo que sí hay', s.status === 'ok' && s.route.length === 5 && s.kpis[3].v === 's/d', s.errors);
  // Agrupación por mes en español
  ok('S18 etiquetas de mes y día en español', ST.monthLabel('2026-09') === 'septiembre 2026' && ST.dayLabel('2026-09-30') === '30 sep');

  // =================== AUDITOR DE CONVERSIÓN ===================
  // Fábrica de productos con embudo coherente: cart = views×cartR; chk = cart×chkR; buy = chk×buyR.
  let seq = 0;
  const sku = (name, category, views, cartR, chkR, buyR, o = {}) => {
    const cart = Math.round(views * cartR), chk = Math.round(cart * chkR), buy = Math.round(chk * buyR), units = o.units === undefined ? Math.max(1, buy) : o.units;
    return { sku: `S${++seq}`, name, category, views, cart, chk, purchases: buy, units, revenue: units * (o.price || 100), orders: units, cartNum: cart, cartDen: views, chkNum: chk, chkDen: cart, buyNum: buy, buyDen: chk, trkGa4: buy, trkUnits: units, fcells: 20 };
  };
  const normal = (cat, k, views = 2000) => Array.from({ length: k }, (_, i) => sku(`${cat} normal ${i + 1}`, cat, views + i * 10, 0.04 + (i % 3) * 0.002, 0.55, 0.60));
  const chan = (id, label, views, cartR, chkR, buyR) => { const cart = Math.round(views * cartR), chk = Math.round(cart * chkR), buy = Math.round(chk * buyR); return { id, label, views, cart, chk, purchases: buy, units: buy, revenue: buy * 100, orders: buy, cartNum: cart, cartDen: views, chkNum: chk, chkDen: cart, buyNum: buy, buyDen: chk, trkGa4: buy, trkUnits: buy, fcells: 30 }; };
  const total = (ga4, units) => ({ views: 1e6, cart: 0, chk: 0, purchases: ga4, units, revenue: 0, orders: 0, trkGa4: ga4, trkUnits: units, skus: 100, fcells: 100 });
  const data = (o = {}) => ({ status: 'ok', scope: { key: '2026-09', from: '2026-09-01', to: '2026-09-30', dateMax: '2026-09-30', compareLabel: 'mes anterior (mismos días)' }, skuRows: o.skuRows || [], channels: o.channels || [], total: o.total === undefined ? total(970, 1000) : o.total, mix: o.mix || { status: 'no_segments', dims: [] }, errors: o.errors || [] });
  const ids = (r) => r.findings.map((f) => f.id);

  // --- C1 demanda sin conversión
  let rows = [...normal('Crónicos', 10), sku('Semaglutida 1 mg pluma', 'Crónicos', 18420, 0.012, 0.55, 0.6), sku('Metformina 850 mg', 'Crónicos', 14905, 0.019, 0.55, 0.6), sku('Losartán 50 mg', 'Crónicos', 4900, 0.01, 0.55, 0.6), sku('Producto popular sano', 'Crónicos', 20000, 0.043, 0.55, 0.6)];
  let r = AU.analyze(data({ skuRows: rows }));
  let f = r.findings.find((x) => x.id === 'demanda_sin_conversion');
  ok('U1 detecta productos con muchas vistas y poco carrito (los de 5,000+ vistas)', !!f && f.big.value === '2 productos', f && f.big);
  ok('U1b ordenados por vistas; solo hasta 3 filas; trae la mediana de su categoría', f.visual.rows[0][0] === 'Semaglutida 1 mg pluma' && f.visual.rows.length <= 3 && f.visual.head[3] === 'Mediana cat.');
  ok('U1c el producto con 4,900 vistas (bajo el umbral) y el sano no se señalan', !JSON.stringify(f.visual.rows).includes('Losartán') && !JSON.stringify(f.visual.rows).includes('popular'));
  ok('U1d potencial «ilustrativo», nunca pronóstico', /ilustrativo/.test(f.que) && /No es un pronóstico ni una meta/.test(f.nota) && f.facts.potential > 0, f.nota);
  ok('U1e responsable natural Catálogo / Contenido y vista de Productos', f.owner === 'Catálogo / Contenido' && f.view === 'producto');
  ok('U1f sin muestra limitada (son productos con muchas vistas)', !f.muestraLimitada);
  ok('U1g hipótesis a validar + cómo validarlo + acción + límite de inventario/precios', /hipótesis a validar, no una causa/.test(f.hipotesis) && /Android, iOS y web/.test(f.validar) && /Auditar las 2 fichas/.test(f.accion) && /inventario ni precios de la competencia/.test(f.limites));
  // un producto con muchas vistas pero carrito normal no se señala
  r = AU.analyze(data({ skuRows: [...normal('Crónicos', 10), sku('Normal', 'Crónicos', 30000, 0.04, 0.55, 0.6)] }));
  ok('U1h con carrito normal no hay hallazgo de demanda sin conversión', !ids(r).includes('demanda_sin_conversion'), ids(r));
  // categoría con pocos pares: usa la mediana de todo el catálogo y no revienta
  const lone = [...normal('Crónicos', 10), sku('Huérfano', 'Rara', 9000, 0.005, 0.55, 0.6), sku('Otro de Rara', 'Rara', 450, 0.04, 0.55, 0.6)];
  const pm = AU._peerMedians(lone, (x) => (x.cartDen > 0 ? x.cartNum / x.cartDen : null));
  ok('U1i categoría con menos de 5 pares → mediana de todo el catálogo (se marca «global»)', pm.of('Rara').scope === 'global' && pm.of('Crónicos').scope === 'category' && pm.of('NoExiste').scope === 'global', [pm.of('Rara'), pm.of('Crónicos')]);
  r = AU.analyze(data({ skuRows: lone }));
  ok('U1j y el producto huérfano igual se detecta con esa mediana', ids(r).includes('demanda_sin_conversion'), ids(r));

  // --- C2 conversión sin tráfico
  rows = [...normal('Crónicos', 10), sku('Insulina glargina 100 UI', 'Crónicos', 380, 0.2, 0.9, 0.9, { units: 40 }), sku('Con pocas compras', 'Crónicos', 300, 0.2, 0.9, 0.9, { units: 1 }), sku('Casi sin vistas', 'Crónicos', 20, 0.9, 0.9, 0.9)];
  r = AU.analyze(data({ skuRows: rows }));
  f = r.findings.find((x) => x.id === 'conversion_sin_trafico');
  ok('U2 detecta lo que convierte al menos el doble con menos de 400 vistas', !!f && /Insulina glargina/.test(JSON.stringify(f.visual.rows)), f);
  ok('U2b siempre «muestra limitada» y lo dice en texto y etiqueta', f.muestraLimitada === true && /muestra limitada/i.test(f.que) && /no es un ranking firme/i.test(f.limites));
  ok('U2c no señala lo que tiene menos de 50 vistas', !JSON.stringify(f.visual.rows).includes('Casi sin vistas'));
  ok('U2d prioridad nunca Alta (la muestra es débil)', f.prio !== 'Alta' && f.score < 70, f.score);

  // --- C3 web vs app
  const web = chan('ecommerce', 'Ecommerce', 60000, 0.044, 0.51, 0.63), app = chan('app', 'App', 40000, 0.041, 0.34, 0.61);
  r = AU.analyze(data({ channels: [web, app] }));
  f = r.findings.find((x) => x.id === 'brecha_web_app');
  ok('U3 la brecha web vs app se abre en carrito → checkout', !!f && /Carrito → checkout/.test(f.visual.rows.find((x) => x.low).label) && /App pierde más que Ecommerce/.test(f.title), f && f.title);
  ok('U3b muestra los 3 pasos con ambos canales y marca solo el paso donde se abre', f.visual.type === 'steps' && f.visual.rows.length === 3 && f.visual.rows.filter((x) => x.low).length === 1);
  ok('U3c responsable Producto / UX para ese paso', f.owner === 'Producto / UX' && /Producto \/ UX/.test(f.accion));
  r = AU.analyze(data({ channels: [chan('ecommerce', 'Ecommerce', 60000, 0.044, 0.51, 0.63), chan('app', 'App', 40000, 0.044, 0.50, 0.63)] }));
  ok('U3d diferencia chica o no significativa → sin hallazgo', !ids(r).includes('brecha_web_app'), ids(r));
  r = AU.analyze(data({ channels: [chan('ecommerce', 'Ecommerce', 150, 0.30, 0.9, 0.9), chan('app', 'App', 150, 0.30, 0.2, 0.9)] }));
  ok('U3e con menos de 200 casos por paso no compara (muestra insuficiente)', !ids(r).includes('brecha_web_app'), ids(r));
  r = AU.analyze(data({ channels: [web] }));
  ok('U3f con un solo canal con embudo no inventa la comparación', !ids(r).includes('brecha_web_app'));
  r = AU.analyze(data({ channels: [chan('ecommerce', 'Ecommerce', 60000, 0.030, 0.51, 0.63), chan('app', 'App', 40000, 0.044, 0.51, 0.63)] }));
  ok('U3g si el que pierde es la web lo nombra a ella', /Ecommerce pierde más que App/.test((r.findings.find((x) => x.id === 'brecha_web_app') || {}).title || ''), ids(r));

  // --- C4 concentración
  const heavy = [...normal('Crónicos', 30), ...[18000, 16000, 15000, 14000, 13000].map((v, i) => sku(`Fuga ${i + 1}`, 'Crónicos', v, 0.005, 0.55, 0.6, { price: 400 }))];
  r = AU.analyze(data({ skuRows: heavy }));
  f = r.findings.find((x) => x.id === 'concentracion_fuga');
  ok('U4 pocos productos explican la fuga → hallazgo de concentración', !!f && f.facts.share >= 0.6 && f.facts.n <= 7, f && f.facts);
  ok('U4b lista de los 5 primeros y número de productos con fuga', f.visual.rows.length <= 5 && /Fuga/.test(f.visual.rows[0][0]) && f.facts.products >= 10);
  ok('U4c es escenario ilustrativo, no pronóstico', /ilustrativo/.test(f.que) && /Escenario ilustrativo/.test(f.limites));
  r = AU.analyze(data({ skuRows: [...normal('Crónicos', 5)].concat(Array.from({ length: 4 }, (_, i) => sku(`Poco ${i}`, 'Crónicos', 3000, 0.02, 0.55, 0.6))) }));
  ok('U4d con menos de 10 productos con fuga no habla de concentración', !ids(r).includes('concentracion_fuga'), ids(r));

  // --- C5 fuga por paso
  const cartWeak = [...normal('Crónicos', 40), ...Array.from({ length: 8 }, (_, i) => sku(`Ficha floja ${i + 1}`, 'Crónicos', 6000 + i * 500, 0.008, 0.56, 0.6))];
  r = AU.analyze(data({ skuRows: cartWeak }));
  f = r.findings.find((x) => x.id === 'fuga_por_paso');
  ok('U5 el paso más flojo de los productos con más por recuperar es vista → carrito', !!f && /vista → carrito/.test(f.title) && f.owner === 'Catálogo / Contenido', f && f.title);
  ok('U5b barras con conteos por paso que suman los productos revisados', f.visual.rows.reduce((a, x) => a + x.value, 0) === Number(/de (\d+)/.exec(f.visual.rows[0].text)[1]));
  r = AU.analyze(data({ skuRows: normal('Crónicos', 40) }));
  ok('U5c catálogo homogéneo → no inventa un paso débil', !ids(r).includes('fuga_por_paso') && !ids(r).includes('concentracion_fuga'), ids(r));

  // --- C6 mezcla de tráfico
  const dim = (m) => ({ dimension: 'source', dimensionLabel: 'Fuente', mix: m, segments: 5, minSessions: 100, significant: [] });
  r = AU.analyze(data({ mix: { status: 'ok', dims: [dim({ cr0: 0.020, cr1: 0.017, delta: -0.003, within: -0.0004, mix: -0.0026 })] } }));
  f = r.findings.find((x) => x.id === 'mezcla_trafico');
  ok('U6 el CR baja por mezcla → «sin alerta», prioridad Baja, y dice que no hay problema de ficha ni checkout', !!f && f.sinAlerta === true && f.prio === 'Baja' && /por mezcla, no por conversión/.test(f.title) && /no hay un problema de ficha o checkout/.test(f.resumen), f);
  r = AU.analyze(data({ mix: { status: 'ok', dims: [{ ...dim({ cr0: 0.020, cr1: 0.016, delta: -0.004, within: -0.0034, mix: -0.0006 }), significant: [{ label: 'Redes', crPpDelta: -0.8 }] }] } }));
  f = r.findings.find((x) => x.id === 'mezcla_trafico');
  ok('U6b si pesa la conversión dentro de las fuentes → alerta con responsable Producto / UX', f && !f.sinAlerta && /dentro de las fuentes/.test(f.title) && f.owner === 'Producto / UX' && /Redes/.test(f.resumen) && f.score >= 45, f);
  r = AU.analyze(data({ mix: { status: 'ok', dims: [dim({ cr0: 0.020, cr1: 0.016, delta: -0.004, within: -0.002, mix: -0.002 })] } }));
  ok('U6c mezcla y conversión pesan parecido → lo dice y no culpa a una', /pesan parecido/.test((r.findings.find((x) => x.id === 'mezcla_trafico') || {}).title || ''), ids(r));
  r = AU.analyze(data({ mix: { status: 'ok', dims: [dim({ cr0: 0.020, cr1: 0.02001, delta: 0.00001, within: 0, mix: 0.00001 })] } }));
  ok('U6d un cambio del CR menor a 0.05 puntos no se reporta', !ids(r).includes('mezcla_trafico'));
  r = AU.analyze(data({ mix: { status: 'no_segments', dims: [] } }));
  ok('U6e sin segmentos cargados no inventa nada', !ids(r).includes('mezcla_trafico'));
  r = AU.analyze(data({ mix: { status: 'ok', dims: [dim({ cr0: 0.02, cr1: 0.0215, delta: 0.0015, within: 0.0001, mix: 0.0014 })] } }));
  ok('U6f si el CR sube por mezcla lo dice con «subió»', /subió/.test((r.findings.find((x) => x.id === 'mezcla_trafico') || {}).title || ''));

  // --- Puerta de confianza (cuadre de GA4)
  const gate = (g, u) => AU.cuadreGa4(data({ total: total(g, u) }));
  ok('U7 GA4 dentro de ±10% → cuadra', gate(950, 1000).level === 'ok' && gate(1080, 1000).level === 'ok');
  ok('U7b entre 10% y 25% → cuadra con avisos', gate(850, 1000).level === 'warn' && gate(1200, 1000).level === 'warn');
  ok('U7c más de 25% → no cuadra', gate(600, 1000).level === 'low' && gate(1400, 1000).level === 'low' && /no cuadra/i.test(gate(600, 1000).title));
  ok('U7d sin unidades o sin compras GA4 → no se puede verificar (y lo dice)', gate(100, 0).level === 'unknown' && /no puedo verificar/i.test(gate(100, 0).title) && AU.cuadreGa4(data({ total: null })).level === 'unknown');
  ok('U7e el texto da la cifra: «87 compras por cada 100 unidades»', /87 compras por cada 100 unidades/.test(gate(870, 1000).text), gate(870, 1000).text);
  r = AU.analyze(data({ skuRows: rows, total: total(600, 1000) }));
  ok('U7f si GA4 no cuadra, TODOS los hallazgos bajan de confianza y lo dicen', r.gate.level === 'low' && r.findings.length > 0 && r.findings.every((x) => x.confianza === 'baja' && /GA4 no cuadra/.test(x.limites)), r.findings.map((x) => [x.id, x.confianza]));
  r = AU.analyze(data({ skuRows: rows, total: total(990, 1000) }));
  ok('U7g si cuadra, ningún hallazgo se marca con confianza baja', r.findings.every((x) => !x.confianza));

  // --- Forma de todos los candidatos
  const everything = AU.analyze(data({ skuRows: [...heavy, ...rows, ...cartWeak.slice(40)], channels: [web, app], mix: { status: 'ok', dims: [dim({ cr0: 0.020, cr1: 0.017, delta: -0.003, within: -0.0004, mix: -0.0026 })] }, total: total(940, 1000) }));
  ok('U8 con datos para todo salen los 6 tipos de hallazgo', ['demanda_sin_conversion', 'conversion_sin_trafico', 'brecha_web_app', 'concentracion_fuga', 'mezcla_trafico'].every((id) => ids(everything).includes(id)), ids(everything));
  ok('U8b candidato completo: campos de la tarjeta compartida', everything.findings.every((x) => ['id', 'detector', 'agent', 'score', 'prio', 'owner', 'tag', 'title', 'resumen', 'que', 'pregunta', 'limites', 'fuente', 'view', 'viewLabel', 'hipotesis', 'validar', 'accion'].every((k) => x[k] !== undefined && x[k] !== '') && x.agent === 'auditor' && Array.isArray(x.evid) && x.evid.length), everything.findings.map((x) => x.id));
  ok('U8c responsables del catálogo de la biblioteca de acciones', everything.findings.every((x) => A.OWNERS.includes(x.owner)), everything.findings.map((x) => x.owner));
  ok('U8d ordenados por score y prioridad coherente', everything.findings.every((x, i, a) => (!i || a[i - 1].score >= x.score) && x.prio === (x.score >= 70 ? 'Alta' : x.score >= 40 ? 'Media' : 'Baja')));
  ok('U8e nunca habla de rentabilidad, promociones ni causas (fuera de «límites»)', everything.findings.every((x) => !rx.test(textsOf(x)) && !causal.test(textsOf(x))), everything.findings.filter((x) => rx.test(textsOf(x))).map((x) => x.id));
  ok('U8f toda hipótesis dice que es a validar', everything.findings.every((x) => /hipótesis|a validar|A validar/i.test(x.hipotesis)), everything.findings.filter((x) => !/hipótesis|a validar|A validar/i.test(x.hipotesis)).map((x) => x.id));
  ok('U8g todo hallazgo con cifra grande trae tono', everything.findings.filter((x) => x.big).every((x) => ['dn', 'up', ''].includes(x.big.tone)));
  ok('U8h el único «sin alerta» es la mezcla de tráfico', everything.findings.filter((x) => x.sinAlerta).map((x) => x.id).join() === 'mezcla_trafico');
  // Estados sin datos
  ['no_data', 'sin_embudo', 'sin_mes'].forEach((st) => { const x = AU.analyze({ status: st, scope: null, errors: [], skuRows: [] }); ok(`U9 estado «${st}» → sin hallazgos y sin puerta inventada`, x.status === st && !x.findings.length && x.gate === null, x); });
  // Un detector que falla no tumba a los demás
  const broken = data({ skuRows: heavy, channels: [web, app] }); broken.mix = { status: 'ok', dims: [{ mix: null }] };
  r = AU.analyze(broken);
  ok('U10 un detector con datos raros se omite y se reporta; los demás siguen', r.status === 'ok' && ids(r).includes('concentracion_fuga') && ids(r).includes('brecha_web_app'), { ids: ids(r), errors: r.errors });

  // --- collect con almacén simulado
  const acc = (o) => ({ views: 0, addToCart: 0, beginCheckout: 0, purchasesGa4: 0, units: 0, revenue: 0, orders: 0, cartNum: 0, cartDen: 0, chkNum: 0, chkDen: 0, buyNum: 0, buyDen: 0, trkGa4: 0, trkUnits: 0, fcells: 5, skus: new Set(['x']), ...o });
  const mkStore = (o = {}) => ({
    meta: { dateMax: '2026-09-30', dateMin: '2026-01-01', batches: 2, funnelBatches: 1, funnelMetrics: ['views', 'addToCart', 'beginCheckout', 'purchasesGa4'], channels: ['ecommerce', 'app'], ...(o.meta || {}) },
    catalog: { bySku: new Map([['A1', { sku: 'A1', product: 'Ibuprofeno 400', category: 'Analgésicos' }]]) },
    aggregate: async (a) => {
      if (o.throws) throw new Error('IDB caído');
      if (a.groupBy === 'sku') return new Map([['A1', acc({ views: 1000, addToCart: 40, cartNum: 40, cartDen: 1000, purchasesGa4: 10, units: 10, revenue: 1000 })], ['A2', acc({ views: 0, fcells: 0 })]]);
      return new Map([['Total', acc({ views: 5000, cartNum: 200, cartDen: 5000, trkGa4: 90, trkUnits: 100, units: 100 })]]);
    }
  });
  let cd = await AU.collect({ fc: { lastActualDate: '2026-09-22' } }, { deps: { store: mkStore(), range, home: { mixOf: () => ({ status: 'ok', dims: [] }) } } });
  ok('V1 collect: arma filas por producto (solo con embudo), total y canales, con nombre y categoría del catálogo', cd.status === 'ok' && cd.skuRows.length === 1 && cd.skuRows[0].name === 'Ibuprofeno 400' && cd.skuRows[0].category === 'Analgésicos' && cd.channels.length === 2 && cd.total.trkUnits === 100, cd);
  ok('V1b el rango llega hasta el último día con datos de productos (no más)', cd.scope.to === '2026-09-30' && cd.scope.from === '2026-09-01');
  cd = await AU.collect({ fc: {} }, { deps: { store: mkStore({ meta: { dateMax: '2026-09-15' } }), range, home: {} } });
  ok('V2 el rango se recorta al último día con productos', cd.scope.to === '2026-09-15');
  cd = await AU.collect({ fc: { lastActualDate: '2026-09-22' } }, { deps: { store: mkStore({ meta: { funnelMetrics: [], funnelBatches: 0 } }), range, home: {} } });
  ok('V3 sin embudo cargado → «sin_embudo»', cd.status === 'sin_embudo');
  cd = await AU.collect({ fc: { lastActualDate: '2026-10-22' } }, { deps: { store: mkStore({ meta: { dateMax: '2026-09-30' } }), range: () => ({ from: '2026-10-01', to: '2026-10-31' }), home: {} } });
  ok('V4 productos que no llegan al mes → «sin_mes» con la fecha hasta donde llegan', cd.status === 'sin_mes' && cd.dateMax === '2026-09-30', cd);
  cd = await AU.collect({}, { deps: { store: { meta: { batches: 0 } }, range, home: {} } });
  ok('V5 sin productos → no_data', cd.status === 'no_data');
  cd = await AU.collect({ fc: { lastActualDate: '2026-09-22' } }, { deps: { store: mkStore({ throws: true }), range, home: {} } });
  ok('V6 el almacén falla → no lanza, reporta el error', cd.errors.length >= 1 && cd.errors.every((e) => /IDB caído/.test(e)) && cd.status === 'sin_embudo', cd);
  cd = await AU.collect({ fc: { lastActualDate: '2026-09-22' } }, { deps: { store: mkStore(), range, home: { mixOf: () => { throw new Error('mezcla rota'); } } } });
  ok('V7 los segmentos fallan → el embudo sigue sin la mezcla', cd.status === 'ok' && cd.errors.some((e) => /mezcla rota/.test(e)) && cd.mix.dims.length === 0);

  // =================== EJECUTOR, IA Y PREGUNTAS ===================
  FP.cohereConnection = { isConfigured: () => true };
  let calls = 0, reply = null, sent = null;
  FP.cohereClient.chatJson = async (o) => { calls++; sent = o; return typeof reply === 'function' ? reply() : reply; };
  const ai = (obj) => ({ ok: true, text: JSON.stringify(obj), model: 'test' });
  const audState = { fc: { lastActualDate: '2026-09-22' }, settings: {}, dx: {} };
  const audDeps = { store: mkStore(), range, home: { mixOf: () => ({ status: 'ok', dims: [] }) } };
  // un Auditor con hallazgos reales para el ejecutor: inyectamos el detector
  const fakeDet = { status: 'ok', scope: { channel: 'total', period: { type: 'month', key: '2026-09' }, lastActual: '2026-09-30', from: '2026-09-01', to: '2026-09-30' }, gate: AU.cuadreGa4(data({ total: total(600, 1000) })), findings: everything.findings.map((x) => ({ ...x, confianza: 'baja' })), errors: [], detectors: 6 };
  const realDetect = AU.detect; AU.detect = async () => fakeDet;
  R.clearCache();
  FP.cohereConnection = { isConfigured: () => false };
  let rr = await R.run(audState, { agent: 'auditor' });
  ok('W1 sin IA → hallazgos del motor, puerta de confianza intacta, 0 llamadas', rr.ai.status === 'off' && rr.agent === 'auditor' && rr.findings.length === fakeDet.findings.length && rr.gate && rr.gate.level === 'low' && calls === 0, rr.ai);
  FP.cohereConnection = { isConfigured: () => true };
  const ctx = R.buildContext(fakeDet, A.OWNERS, 'auditor');
  ok('W2 el contexto a la IA lleva la confianza del dato y marca muestra limitada / confianza baja', ctx.confianzaDelDato.nivel === 'low' && ctx.candidatos.some((c) => c.muestraLimitada) && ctx.candidatos.every((c) => c.confianza === 'baja') && /Embudo/.test(ctx.alcance.canal), ctx.alcance);
  ok('W3 las cifras que la IA puede citar incluyen cifra grande, tabla y potencial del motor', (() => { const c = ctx.candidatos.find((x) => x.id === 'demanda_sin_conversion'); return c.cifras.length >= 4; })());
  ok('W4 las reglas del Auditor: no calcular, sin causas, sin rentabilidad/promociones, potencial ilustrativo, muestra limitada', /NO calcules/.test(R.RULES.auditor) && /hipótesis a validar/.test(R.RULES.auditor) && /rentabilidad/.test(R.RULES.auditor) && /promociones/.test(R.RULES.auditor) && /ilustrativo/.test(R.RULES.auditor) && /muestra limitada/.test(R.RULES.auditor) && /Auditor de Conversión/.test(R.RULES.auditor));
  const first = fakeDet.findings[0], second = fakeDet.findings[1];
  reply = () => ai({ lectura: 'GA4 no cuadra con tu venta: lee el embudo como dirección.', hallazgos: [{ id: second.id, prioridad: 'Alta', titulo: second.title, resumen: second.resumen, siguientePregunta: second.pregunta, responsable: second.owner }] });
  R.clearCache(); calls = 0;
  rr = await R.run(audState, { agent: 'auditor' });
  ok('W5 IA válida: reordena, conserva todos los hallazgos y la puerta, y llama con el propósito del Auditor', rr.ai.status === 'ok' && rr.findings[0].id === second.id && rr.findings.length === fakeDet.findings.length && rr.gate.level === 'low' && /Auditor de Conversión/.test(sent.audit.purpose) && sent.system === R.RULES.auditor, { ai: rr.ai, purpose: sent && sent.audit });
  ok('W5b lo que la IA no redactó (cifra grande, tabla, hipótesis, acción) sigue siendo del motor', rr.findings.every((x) => x.big === fakeDet.findings.find((y) => y.id === x.id).big && x.hipotesis === fakeDet.findings.find((y) => y.id === x.id).hipotesis));
  reply = () => ai({ hallazgos: [{ id: first.id, prioridad: 'Alta', titulo: 'Se pierden $9.9 M por semana', resumen: 'Cifra inventada.', siguientePregunta: '¿?', responsable: first.owner }] });
  R.clearCache(); calls = 0;
  rr = await R.run(audState, { agent: 'auditor' });
  ok('W6 cifra que el motor no calculó → rechazada (un reintento) y se muestran textos del motor', rr.ai.status === 'rejected' && calls === 2 && rr.findings.every((x) => x.ai === false) && !/9\.9/.test(JSON.stringify(rr.findings)), { ai: rr.ai, calls });
  reply = () => ai({ hallazgos: [{ id: first.id, prioridad: 'Alta', titulo: 'La causa es el precio', resumen: 'Esto demuestra que la ficha está mal.', siguientePregunta: '¿?', responsable: first.owner }] });
  R.clearCache();
  rr = await R.run(audState, { agent: 'auditor' });
  ok('W7 lenguaje causal → rechazado', rr.ai.status === 'rejected');
  // el texto del motor del Auditor pasa la validación cuando la IA lo repite (cifras con comas, %, M y mil)
  fakeDet.findings.forEach((x) => {
    const c = R.buildContext({ ...fakeDet, findings: [x] }, A.OWNERS, 'auditor');
    const v = R.validate({ hallazgos: [{ id: x.id, prioridad: x.prio, titulo: x.title, resumen: x.resumen, siguientePregunta: x.pregunta, responsable: x.owner }] }, c, A.OWNERS);
    ok(`W8 la IA puede repetir tal cual el texto del motor de «${x.id}»`, v.ok === true, v.errors);
  });
  AU.detect = realDetect;

  // --- Preguntas libres: a quién le toca
  const rq = R.routeQuestion;
  ok('Q1 promociones/descuentos → Arquitecto de Ofertas, no se contesta aquí', rq('analista', '¿Qué promoción me conviene?').to === 'arquitecto' && rq('auditor', 'dame un DESCUENTO para insulinas').to === 'arquitecto' && rq('auditor', '¿hago una oferta 2x1?').to === 'arquitecto');
  ok('Q2 rentabilidad/ganancia/margen/costo → se aclara que la herramienta solo habla de venta', ['¿cuál es el margen de Insulinas?', '¿Cuánto gano con esto?', 'rentabilidad por producto', '¿cuál es el costo del envío?'].every((q) => rq('analista', q) && rq('analista', q).type === 'refuse'), rq('analista', '¿Cuánto gano con esto?'));
  ok('Q3 al Analista le preguntan por el embudo → lo manda al Auditor', rq('analista', '¿Dónde se queda el carrito?').to === 'auditor' && rq('analista', 'conversión del checkout en la app').to === 'auditor');
  ok('Q4 al Auditor le preguntan por plan/meta/forecast → lo manda al Analista', rq('auditor', '¿Llego a la meta del mes?').to === 'analista' && rq('auditor', '¿cómo va el forecast?').to === 'analista');
  ok('Q5 pregunta propia del agente → null (la contesta él)', rq('analista', '¿por qué cae Insulinas?') === null && rq('auditor', '¿qué producto reviso primero?') === null);
  ok('Q6 acentos y mayúsculas no engañan al enrutador', rq('analista', '¿CUÁNTO GANO?').type === 'refuse' && rq('analista', 'PROMOCIÓN').to === 'arquitecto');
  calls = 0;
  let a1 = await R.ask('auditor', '¿Qué promoción hago?', audState);
  ok('Q7 ask: una pregunta de otro asistente se contesta sin llamar a la IA', a1.ok && a1.local && a1.to === 'arquitecto' && /Arquitecto de Ofertas/.test(a1.answer) && calls === 0, a1);
  FP.cohereConnection = { isConfigured: () => false };
  a1 = await R.ask('auditor', '¿qué producto reviso primero?', audState);
  ok('Q8 ask sin IA conectada → lo dice y no inventa', !a1.ok && /IA conectada/.test(a1.errors[0]), a1);
  FP.cohereConnection = { isConfigured: () => true };
  a1 = await R.ask('auditor', '   ', audState);
  ok('Q9 ask con pregunta vacía → pide escribirla', !a1.ok && /Escribe una pregunta/.test(a1.errors[0]));
  AU.detect = async () => fakeDet; R.clearCache(); calls = 0;
  reply = () => ai({ answer: 'Empieza por los productos de la lista de concentración: GA4 no cuadra con tu venta, así que léelo como dirección.', nextQuestion: '¿Qué productos de la lista comparten categoría?' });
  a1 = await R.ask('auditor', '¿qué producto reviso primero?', audState);
  ok('Q10 ask con IA: respuesta válida con la evidencia del motor; usa las reglas de pregunta, no las de ordenar', a1.ok && /lista de concentración/.test(a1.answer) && a1.nextQuestion && sent.system === R.ASK_RULES && /pregunta/.test(sent.user), a1);
  reply = () => ai({ answer: 'Se pierden $88.8 M por culpa del checkout.' });
  R.clearCache(); calls = 0;
  a1 = await R.ask('auditor', '¿cuánto pierdo?', audState);
  ok('Q11 cifra inventada en la respuesta → se descarta (un reintento)', !a1.ok && /no coincide con las cifras/.test(a1.errors[0]) && calls === 2, a1);
  reply = () => ai({ answer: 'La causa es la ficha.' });
  a1 = await R.ask('auditor', '¿por qué?', audState);
  ok('Q12 lenguaje causal en la respuesta → se descarta', !a1.ok, a1);
  reply = () => ({ ok: false, status: 'network', errors: ['sin red'] });
  a1 = await R.ask('auditor', '¿qué reviso?', audState);
  ok('Q13 IA caída → error claro, no lanza', !a1.ok && /sin red/.test(a1.errors[0]), a1);
  AU.detect = async () => ({ status: 'no_data', scope: null, gate: null, findings: [], errors: [], detectors: 6 }); R.clearCache();
  a1 = await R.ask('auditor', '¿qué reviso?', audState);
  ok('Q14 sin datos del agente no se llama a la IA', !a1.ok && /datos suficientes/.test(a1.errors[0]), a1);
  AU.detect = realDetect;

  // --- Caché de detección y firma
  let nDet = 0; AU.detect = async () => { nDet++; return fakeDet; };
  R.clearCache(); R.run.length;
  FP.cohereConnection = { isConfigured: () => false };
  const stA = { fc: { run: { id: 1 }, lastActualDate: '2026-09-22' }, quality: { totals: {} }, settings: {} };
  await R.detect('auditor', stA); await R.detect('auditor', stA);
  ok('X1 la detección se reutiliza mientras no cambien los datos (no se vuelve a leer el almacén)', nDet === 1, nDet);
  await R.detect('auditor', stA, { force: true });
  ok('X2 force la recalcula', nDet === 2, nDet);
  await R.detect('auditor', { ...stA, fc: { run: { id: 2 }, lastActualDate: '2026-09-22' } });
  ok('X3 un cálculo nuevo de plan/forecast cambia la firma y recalcula', nDet === 3, nDet);
  await R.detect('auditor', { ...stA, quality: { totals: { warning: 4 } } });
  ok('X4 nuevos avisos de calidad cambian la firma', nDet === 4, nDet);
  ok('X5 la firma es estable entre llamadas', R.signature(stA) === R.signature(stA) && typeof R.signature({}) === 'string');
  AU.detect = async () => { throw new Error('explotó'); }; R.clearCache();
  const bad = await R.run(stA, { agent: 'auditor' });
  ok('X6 si un agente lanza, run no lanza: devuelve no_data con el error', bad.status === 'no_data' && bad.errors.some((e) => /explotó/.test(e)) && bad.findings.length === 0, bad);
  AU.detect = realDetect;

  // --- Registro y traspaso
  const reg = FP.agents.registry;
  ok('Y1 el traspaso del Analista al Auditor ahora es real (el Auditor está disponible)', reg.AGENTS.auditor.available === true && A.detect(mkState({ ecommerce: [1000, 900], app: [500, 450] }), { home: home({ whyPlan: () => ({ status: 'ok', gap: -2e6, gapPct: -0.05, effects: { traffic: -1.5e6, cr: -1.0e6, aov: 0.5e6 } }), why: () => ({ status: 'ok', delta: 1e6, effects: { traffic: 0.2e6, cr: 0.1e6, aov: 0.7e6 } }) }), advisor }).findings.some((x) => x.handoff && x.handoff.to === 'auditor' && reg.AGENTS[x.handoff.to].available));
  ok('Y2 el rol del Auditor nombra los 4 pasos y que no habla de promociones ni rentabilidad', /vista → carrito → checkout → compra/.test(reg.AGENTS.auditor.role) && /No habla de promociones ni de rentabilidad/.test(reg.AGENTS.auditor.role));
  ok('Y3 el rol del Analista habla de historia, qué se cae y qué crece, y no de ganancia', /qué se cae, qué crece/.test(reg.AGENTS.analista.role) && /no de ganancia/.test(reg.AGENTS.analista.role));

  console.log(fails ? `\n✘ ${fails} de ${n} pruebas fallaron` : `✔ ${n}/${n} pruebas de la Fase 2 (historia de Números y Auditor de Conversión)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✘ excepción en la prueba:', e); process.exit(1); });
