// Pruebas · los asistentes siguen lo que la persona tiene elegido (año, mes o semana, y canal).
// Uso: node tools/test-agents-seleccion.js     (estado, almacén de productos y motores simulados)
global.window = global; global.FP = {};
['js/config/config.js', 'js/analytics/trafficConversionEngine.js', 'js/ai/cohereClient.js', 'js/ai/cohereAnalysisAssistant.js', 'js/agents/analistaDetectors.js', 'js/agents/analistaStory.js',
  'js/agents/auditorDetectors.js', 'js/agents/agentRunner.js', 'js/agents/agentLauncher.js'].forEach((f) => require('../' + f));
let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 500) : ''); } };
const A = FP.agents.analista, ST = FP.agents.story, AU = FP.agents.auditor, R = FP.agents.runner;

// ---------- Estado: un mes (2026-09), una semana (2026-W38) y el año, por total y por canal ----------
const per = (key, plan, actual, extra = {}) => ({ key, countedDays: 7, plan: { revenue: plan }, toDate: { revenue: { plan, actual, gap: actual - plan, gapPct: (actual - plan) / plan, compliance: actual / plan } }, forecastGap: { revenue: { gapPct: 0 } }, ...extra });
const series = (plan, actual) => ({
  months: [per('2026-08', plan, actual), per('2026-09', plan, actual)],
  weeks: [per('2026-W38', plan / 4, actual / 4, { weekStart: '2026-09-14', weekEnd: '2026-09-20' })],
  annual: per('2026', plan * 12, actual * 12)
});
const mk = (ctx = {}, o = {}) => ({
  year: 2026, ux: { ctx },
  fc: { lastActualDate: '2026-09-22', run: { plan: { source: 'file' }, total: series(1000000, 930000), channels: { ecommerce: series(500000, 420000), app: series(250000, 235000), whatsapp: series(150000, 196000) } } },
  quality: { totals: {} }, settings: {}, dx: {}, ...o
});
const calls = [];
const home = () => ({
  goal: (s, ch, p) => { calls.push(['goal', ch, p.type, p.key]); return { status: 'not_reached', attainment: 0.9, goal: 1000000, cumulative: 900000 }; },
  whyPlan: (s, ch, p) => { calls.push(['whyPlan', ch, p.type, p.key]); return { status: 'ok', gap: -70000, gapPct: -0.07, effects: { traffic: -50000, cr: -30000, aov: 10000, delta: -70000 } }; },
  why: (s, ch, p) => { calls.push(['why', ch, p.type, p.key]); return { status: 'ok', delta: -5000 }; },
  excluded: (s, ch, p) => { calls.push(['excluded', ch, p.type, p.key]); return { days: 0, revenue: 0 }; }
});
const advisor = { advise: () => null };
const rangeOf = (t, k) => (t === 'year' ? { from: `${k}-01-01`, to: `${k}-12-31` } : t === 'week' ? { from: '2026-09-14', to: '2026-09-20' } : { from: `${k}-01`, to: `${k}-30` });
const rng = (t, k) => { const r = rangeOf(t, k); return t === 'month' ? { from: `${k}-01`, to: `${k}-30` } : r; };

(async () => {
  // =================== Selección ===================
  let sel = A.selection(mk());
  ok('N1 sin contexto: mes de la última venta real y Total digital', sel.type === 'month' && sel.key === '2026-09' && sel.channel === 'total' && !sel.chosen, sel);
  sel = A.selection(mk({ channel: 'app', periodType: 'month', periodKey: '2026-08' }));
  ok('N2 mes y canal elegidos', sel.type === 'month' && sel.key === '2026-08' && sel.channel === 'app' && sel.chosen, sel);
  sel = A.selection(mk({ periodType: 'week', periodKey: '2026-W38' }));
  ok('N3 semana elegida (existe en el plan)', sel.type === 'week' && sel.key === '2026-W38' && sel.chosen, sel);
  sel = A.selection(mk({ periodType: 'year', periodKey: null }));
  ok('N4 año elegido: usa el año de la app', sel.type === 'year' && sel.key === '2026' && sel.chosen, sel);
  sel = A.selection(mk({ periodType: 'week', periodKey: '2026-W01' }));
  ok('N5 semana que no existe → vuelve al mes de la última venta real', sel.type === 'month' && sel.key === '2026-09' && !sel.chosen, sel);
  sel = A.selection(mk({ periodType: 'month', periodKey: '2027-05' }));
  ok('N6 mes que no existe en el plan → vuelve al mes de la última venta real', sel.key === '2026-09' && !sel.chosen, sel);
  sel = A.selection(mk({ channel: 'telepatia', periodType: 'month', periodKey: '2026-08' }));
  ok('N7 canal que no existe → Total digital', sel.channel === 'total' && sel.key === '2026-08', sel);
  sel = A.selection(mk({ periodType: 'day', periodKey: '2026-08-14' }));
  ok('N8 un día suelto se lee como el mes de esa fecha y se avisa', sel.type === 'month' && sel.key === '2026-08' && /mes de la fecha/.test(sel.note || ''), sel);
  sel = A.selection(mk({ periodType: 'range', periodKey: '2026-08-02' }));
  ok('N8b un rango se lee como el mes de su inicio', sel.type === 'month' && sel.key === '2026-08', sel);
  ok('N9 sin estado no lanza', A.selection({}).channel === 'total' && A.selection(null).key === null);
  ok('N10 etiquetas: mes, año y semana en español', A.periodLabel('month', '2026-09') === 'septiembre 2026' && A.periodLabel('year', '2026') === '2026'
    && A.periodLabel('week', '2026-W38', { weekStart: '2026-09-14', weekEnd: '2026-09-20' }) === 'semana del 14 sep al 20 sep' && A.channelLabel('app') === 'App' && A.channelLabel('total') === 'Total digital', [A.periodLabel('week', 'x', { weekStart: '2026-09-14', weekEnd: '2026-09-20' }), A.channelLabel('app')]);

  // =================== Detectores del Analista ===================
  let r = A.detect(mk({ periodType: 'month', periodKey: '2026-08' }), { home: home(), advisor });
  ok('D1 un mes anterior se lee con su propio periodo', r.status === 'ok' && r.scope.period.key === '2026-08' && /agosto 2026/.test(r.scope.label), r.scope);
  calls.length = 0;
  r = A.detect(mk({ periodType: 'year' }), { home: home(), advisor });
  ok('D2 año: periodo year, etiqueta «2026», meta del año y textos «del año»', r.scope.period.type === 'year' && r.scope.label === '2026' && r.findings.some((f) => /meta del año|cierra en|cerró en/.test(JSON.stringify(f))) && !JSON.stringify(r.findings).includes('plan del mes'), r.findings.map((f) => f.title));
  ok('D2b el año usa la serie anual (plan ×12) y los motores de plan reciben el periodo year', r.scope.kpi.plan === 12000000 && calls.some((c) => c[0] === 'goal' && c[2] === 'year') && calls.some((c) => c[0] === 'whyPlan' && c[2] === 'year'), { kpi: r.scope.kpi, calls });
  calls.length = 0;
  r = A.detect(mk({ periodType: 'week', periodKey: '2026-W38' }), { home: home(), advisor });
  ok('D3 semana: periodo week, serie semanal (plan/4) y etiqueta con las fechas', r.scope.period.type === 'week' && r.scope.kpi.plan === 250000 && /14 sep al 20 sep/.test(r.scope.label), r.scope);
  ok('D3b no hay meta semanal: no se pregunta por la meta ni se inventa «meta en riesgo»', !calls.some((c) => c[0] === 'goal') && !r.findings.some((f) => f.id === 'meta_en_riesgo'), calls);
  ok('D3c los textos hablan de la semana, no del mes', r.findings.filter((f) => f.id === 'brecha_concentrada').every((f) => !/del mes|este mes|mes anterior/.test(JSON.stringify([f.evid, f.que, f.validar, f.accion]))) && r.findings.some((f) => f.id === 'brecha_concentrada' && /la semana anterior/.test(f.validar)), r.findings.map((f) => [f.id, f.validar]));
  calls.length = 0;
  r = A.detect(mk({ channel: 'ecommerce', periodType: 'month', periodKey: '2026-09' }), { home: home(), advisor });
  ok('D4 un canal elegido: scope con ese canal y KPI de ese canal (plan 500 mil)', r.scope.channel === 'ecommerce' && r.scope.channelLabel === 'Ecommerce' && r.scope.kpi.plan === 500000, r.scope);
  ok('D4b los motores de plan reciben ese canal (no «total»)', calls.filter((c) => ['goal', 'whyPlan', 'why', 'excluded'].includes(c[0])).every((c) => c[1] === 'ecommerce') && calls.some((c) => c[0] === 'whyPlan'), calls);
  ok('D4c con un solo canal no hay «qué canal concentra» ni «canal que compensa»', !r.findings.some((f) => ['brecha_concentrada', 'canal_compensa'].includes(f.id)), r.findings.map((f) => f.id));
  ok('D4d aun así hay lectura: meta y drivers de ese canal', r.findings.some((f) => f.id === 'meta_en_riesgo') && r.findings.some((f) => f.id === 'driver_dominante'));
  r = A.detect(mk({ periodType: 'month', periodKey: '2026-09' }, { fc: { lastActualDate: '2026-09-22', run: { plan: { source: 'file' }, total: { months: [per('2026-09', 100, 90, { countedDays: 0 })], weeks: [], annual: per('2026', 1, 1) }, channels: {} } } }), { home: home(), advisor });
  ok('D5 el periodo elegido sin venta real → no_data, y avisa que sí eligió algo', r.status === 'no_data' && r.selection && r.selection.chosen === true, r);

  // =================== Historia ===================
  const seen = [];
  const prod = (cats) => ({ run: async (a) => { seen.push({ level: a.level, cmp: a.comparison, t: a.periodType, ch: a.channel, from: a.from, to: a.to }); if (a.level === 'category' && a.comparison === 'previous') return { rows: cats, total: { revenue: { current: 1, baseline: 1000000 } }, baseline: { label: 'semana anterior' }, geoSignals: [] }; return { rows: [] }; } });
  const row = (key, cur, base) => ({ key, revenue: { current: cur, baseline: base, delta: cur - base, deltaPct: cur / base - 1 }, contributionAbs: cur - base, signals: [], drivers: null });
  const stDeps = (p) => ({ home: home(), advisor, products: p, store: { meta: { dateMax: '2026-09-30', dateMin: '2026-01-01', batches: 2 } }, range: rng, traffic: { effects: () => null } });
  let s = await ST.build(mk({ periodType: 'week', periodKey: '2026-W38', channel: 'app' }), { deps: stDeps(prod([row('Endocrinología', 100000, 300000), row('Dermo', 200000, 190000)])) });
  ok('H1 la historia lee categorías con el tipo de periodo y el canal elegidos', seen.length >= 1 && seen.every((x) => x.t === 'week' && x.ch === 'app') && seen[0].from === '2026-09-14' && seen[0].to === '2026-09-20', seen);
  ok('H2 scope de la historia: etiqueta de la semana y canal App', /14 sep al 20 sep/.test(s.scope.label) && s.scope.channelLabel === 'App', s.scope);
  ok('H3 KPI de cierre: sin meta semanal queda «s/d» y dice «de la semana»', s.kpis[3].k === 'Cierre estimado de la semana' && s.kpis[3].v === 's/d', s.kpis);
  ok('H4 las respuestas de la ruta no hablan de «mes» cuando se eligió una semana', !/del mes|este mes/.test(JSON.stringify(s.route)) && /la misma semana del año anterior/.test(JSON.stringify(s.findings.map((f) => f.validar))), s.route.map((x) => x.a));
  seen.length = 0;
  s = await ST.build(mk({ periodType: 'year' }), { deps: stDeps(prod([row('Endocrinología', 100000, 300000)])) });
  ok('H5 año: lee categorías con periodType year, los KPIs hablan del año y el titular existe', seen.every((x) => x.t === 'year' && x.ch === 'total') && s.kpis[3].k === 'Cierre estimado del año' && !!s.headline.lead, { seen: seen[0], k: s.kpis[3] });
  ok('H5b la ruta del año dice «la meta del año»', /la meta del año/.test(s.route[0].a) && !/la meta del mes/.test(s.route[0].a), s.route[0].a);
  s = await ST.build(mk({ periodType: 'month', periodKey: '2026-09' }), { deps: stDeps(prod([row('Endocrinología', 100000, 300000)])) });
  ok('H6 el mes sigue igual que antes (textos «del mes»)', /la meta del mes/.test(s.route[0].a) && s.kpis[3].k === 'Cierre estimado del mes' && /septiembre 2026/.test(s.scope.label), [s.route[0].a, s.scope.label]);
  s = await ST.build(mk({ periodType: 'month', periodKey: '2026-09' }), { deps: { ...stDeps(prod([])), store: { meta: { dateMax: '2026-03-30', dateMin: '2026-01-01', batches: 2 } } } });
  ok('H7 el archivo de productos no llega al periodo elegido: lo dice con ese periodo', s.productStatus === 'sin_mes' && /no cubre este mes/.test(s.gate.text), s.gate);
  s = await ST.build(mk({ periodType: 'week', periodKey: '2026-W38' }), { deps: { ...stDeps(prod([])), store: { meta: { dateMax: '2026-03-30', dateMin: '2026-01-01', batches: 2 } } } });
  ok('H7b …y con una semana dice «esta semana»', /no cubre esta semana/.test(s.gate.text), s.gate);

  // =================== Auditor ===================
  const acc = (o) => ({ views: 0, addToCart: 0, beginCheckout: 0, purchasesGa4: 0, units: 0, revenue: 0, orders: 0, cartNum: 0, cartDen: 0, chkNum: 0, chkDen: 0, buyNum: 0, buyDen: 0, trkGa4: 0, trkUnits: 0, fcells: 5, skus: new Set(['x']), ...o });
  const asked = [];
  const mkStore = () => ({
    meta: { dateMax: '2026-09-30', dateMin: '2026-01-01', batches: 2, funnelBatches: 1, funnelMetrics: ['views'], channels: ['ecommerce', 'app'] },
    catalog: { bySku: new Map() },
    aggregate: async (a) => { asked.push({ from: a.from, to: a.to, channel: a.channel, g: a.groupBy }); return a.groupBy === 'sku' ? new Map([['A1', acc({ views: 600, cartNum: 20, cartDen: 600, purchasesGa4: 5, units: 5, revenue: 500 })]]) : new Map([['Total', acc({ views: 600, cartNum: 20, cartDen: 600, trkGa4: 95, trkUnits: 100, units: 100 })]]); }
  });
  const mixCalls = [];
  const audDeps = { store: mkStore(), range: rng, home: { mixOf: (st, ch, p) => { mixCalls.push([ch, p.type, p.key]); return { status: 'no_segments', dims: [] }; } } };
  let cd = await AU.collect(mk({ periodType: 'week', periodKey: '2026-W38' }), { deps: audDeps });
  ok('E1 el Auditor lee el rango de la semana elegida (no el mes)', cd.status === 'ok' && cd.scope.type === 'week' && cd.scope.from === '2026-09-14' && cd.scope.to === '2026-09-20' && cd.scope.days === 7, cd.scope);
  ok('E1b la comparación se llama «semana anterior» y la etiqueta trae las fechas', cd.scope.compareLabel === 'semana anterior' && /14 sep al 20 sep/.test(cd.scope.label), cd.scope);
  ok('E1c los segmentos se piden para esa semana', mixCalls.some((c) => c[1] === 'week' && c[0] === 'total'), mixCalls);
  asked.length = 0; mixCalls.length = 0;
  cd = await AU.collect(mk({ channel: 'app', periodType: 'month', periodKey: '2026-09' }), { deps: { ...audDeps, store: mkStore() } });
  ok('E2 con un canal elegido el Auditor pide los productos de ese canal', cd.scope.channel === 'app' && asked.length >= 2 && asked.every((a) => a.channel === 'app'), asked);
  ok('E2b …y no compara web contra app (no hay otro canal)', cd.channels.length === 0 && mixCalls.every((c) => c[0] === 'app'), { ch: cd.channels, mixCalls });
  asked.length = 0;
  cd = await AU.collect(mk({ periodType: 'year' }), { deps: { ...audDeps, store: mkStore() } });
  ok('E3 año: rango de todo el año acotado a lo que cubre el archivo', cd.scope.type === 'year' && cd.scope.from === '2026-01-01' && cd.scope.to === '2026-09-30' && cd.scope.days === 273 && cd.scope.compareLabel === 'año anterior', cd.scope);
  cd = await AU.collect(mk({ periodType: 'month', periodKey: '2026-09' }), { deps: { ...audDeps, store: mkStore() } });
  ok('E4 el mes sigue igual: 30 días y «mes anterior (mismos días)»', cd.scope.days === 30 && cd.scope.compareLabel === 'mes anterior (mismos días)', cd.scope);
  cd = await AU.collect(mk({ periodType: 'month', periodKey: '2026-09' }), { deps: { ...audDeps, store: { ...mkStore(), meta: { ...mkStore().meta, dateMax: '2026-03-01' } } } });
  ok('E5 productos que no llegan al periodo elegido → sin_mes con ese periodo', cd.status === 'sin_mes' && cd.scope && cd.scope.key === '2026-09' && cd.dateMax === '2026-03-01', cd);

  // Umbrales por periodo
  const L7 = AU.limitsFor(7), L30 = AU.limitsFor(30), L365 = AU.limitsFor(365);
  ok('E6 los umbrales de vistas se escalan por los días del periodo, con piso', L30.manyViews === 5000 && L30.fewViews === 400 && L7.manyViews === 1167 && L7.fewViews === 100 && L365.manyViews === 60833 && L365.fewViews === 4867 && AU.limitsFor(1).manyViews === 1000 && AU.limitsFor(null) === AU.LIMITS, [L7, L365]);
  ok('E6b los demás umbrales (muestras mínimas, cuadre de GA4) no cambian con el periodo', L7.minChannelDen === 200 && L365.gateOk === 0.10 && L7.minPeers === 5);
  // Un hallazgo con volumen de semana: 2,000 vistas es «muchas» en una semana pero no en un mes
  const sku = (name, views, cartRate) => ({ sku: name, name, category: 'C', views, cart: Math.round(views * cartRate), chk: 1, purchases: 5, units: 5, revenue: 500, orders: 5, cartNum: Math.round(views * cartRate), cartDen: views, chkNum: 5, chkDen: 10, buyNum: 5, buyDen: 5, trkGa4: 5, trkUnits: 5, fcells: 5 });
  const rows = Array.from({ length: 8 }, (_, i) => sku('n' + i, 600 + i * 5, 0.05)).concat([sku('Flojo', 2000, 0.005)]);
  const dat = (scope) => ({ status: 'ok', scope, skuRows: rows, channels: [], total: { trkGa4: 97, trkUnits: 100 }, mix: { status: 'no_segments', dims: [] }, errors: [] });
  let res = AU.analyze(dat({ type: 'month', key: '2026-09', days: 30, from: '2026-09-01', to: '2026-09-30', dateMax: '2026-09-30', compareLabel: 'mes anterior (mismos días)' }));
  ok('E7 con 2,000 vistas en un MES no es «mucha demanda»', !res.findings.some((f) => f.id === 'demanda_sin_conversion'), res.findings.map((f) => f.id));
  res = AU.analyze(dat({ type: 'week', key: '2026-W38', days: 7, from: '2026-09-14', to: '2026-09-20', dateMax: '2026-09-30', compareLabel: 'semana anterior', channel: 'total', channelLabel: 'Total digital', label: 'semana' }));
  const f1 = res.findings.find((f) => f.id === 'demanda_sin_conversion');
  ok('E7b con 2,000 vistas en una SEMANA sí, y el texto dice «en la semana»', !!f1 && /en la semana/.test(f1.resumen) && !/en el mes/.test(JSON.stringify(f1)), f1 && f1.resumen);
  ok('E7c el alcance del Auditor trae tipo de periodo, etiqueta y canal', res.scope.period.type === 'week' && res.scope.label === 'semana' && res.scope.channelLabel === 'Total digital', res.scope);
  res = AU.analyze(dat({ type: 'month', key: '2026-09', days: 30, from: '2026-09-01', to: '2026-09-30', dateMax: '2026-09-30', compareLabel: 'mes anterior (mismos días)' }));
  ok('E8 tras analizar una semana el módulo vuelve a los umbrales del mes (no se queda con los de la semana)', !res.findings.some((f) => f.id === 'demanda_sin_conversion') && AU.cuadreGa4({ total: { trkGa4: 95, trkUnits: 100 } }).level === 'ok');

  // =================== Ejecutor ===================
  const base = mk(), withCtx = (ctx) => ({ ...base, ux: { ctx } });
  const s1 = R.signature(withCtx({ periodType: 'month', periodKey: '2026-09' })), s2 = R.signature(withCtx({ periodType: 'week', periodKey: '2026-W38' })), s3 = R.signature(withCtx({ periodType: 'month', periodKey: '2026-09', channel: 'app' }));
  ok('R1 la firma cambia con el periodo y con el canal elegidos (si no, el panel mostraría datos viejos)', s1 !== s2 && s1 !== s3 && s2 !== s3 && s1 === R.signature(withCtx({ periodType: 'month', periodKey: '2026-09' })), [s1, s2, s3]);
  ok('R2 selectionKey legible y estable', R.selectionKey(mk({ channel: 'app', periodType: 'week', periodKey: '2026-W38' })) === 'app/week/2026-W38');
  const ctx = R.buildContext({ status: 'ok', scope: { channelLabel: 'App', period: { type: 'week', key: '2026-W38' }, lastActual: '2026-09-22' }, findings: [], gate: null }, A.OWNERS, 'analista');
  ok('R3 el contexto a la IA dice qué canal y qué tipo de periodo se leyó', ctx.alcance.canal === 'App' && ctx.alcance.tipoDePeriodo === 'week' && ctx.alcance.periodo === '2026-W38', ctx.alcance);

  console.log(fails ? `\n✘ ${fails} de ${n} pruebas fallaron` : `✔ ${n}/${n} pruebas de selección (periodo y canal elegidos)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✘ excepción en la prueba:', e); process.exit(1); });
