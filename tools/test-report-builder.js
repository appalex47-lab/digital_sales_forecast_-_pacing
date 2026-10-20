// Presentación ejecutiva (PDF): reglas críticas del armador de contenido.  node tools/test-report-builder.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON, Intl, String, Map, Set }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
ctx.FP = { config: { currency: 'MXN', confidenceLabels: { excellent: 'Excelente', sufficient: 'Suficiente', limited: 'Limitada', insufficient: 'Insuficiente' } } };
['js/forecast/methodAdvisor.js', 'js/report/reportBuilder.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const RB = ctx.FP.reportBuilder; let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); if (!c) bad++; };
const blk = (rev) => ({ revenue: rev, orders: null, trafficVolume: null, conversionRate: null, aov: null });
const toDate = (actual, plan) => ({ revenue: { plan, actual, gap: actual !== null && plan !== null ? actual - plan : null, gapPct: actual !== null && plan ? (actual - plan) / plan : null, compliance: actual !== null && plan ? actual / plan : null } });
const days = (arr) => arr.map(([date, counted]) => ({ date, counted, closed: true }));
function mkSeries(o) {
  const months = Array.from({ length: 12 }, (_, i) => ({ key: `2026-${String(i + 1).padStart(2, '0')}`, countedDays: i < 9 ? 30 : 0, plan: blk(o.monthPlan === undefined ? 100 : o.monthPlan), actualToDate: i < 9 ? blk(o.monthActual === undefined ? 95 : o.monthActual) : null, forecast: blk(i < 9 ? (o.monthActual === undefined ? 95 : o.monthActual) : o.monthFc === undefined ? 100 : o.monthFc) }));
  const real = o.real === undefined ? 855 : o.real, plan = o.plan === undefined ? 900 : o.plan, fc = o.fc === undefined ? 1150 : o.fc, goal = o.goal === undefined ? 1200 : o.goal;
  return { channel: 'x', days: o.days || [], months,
    confidence: { level: 'sufficient' },
    annual: { countedDays: o.counted === undefined ? 270 : o.counted, missingActualDays: 95, plan: blk(goal), toDate: toDate(real, plan), forecast: blk(fc), forecastGap: { revenue: { plan: goal, forecast: fc, gap: fc !== null && goal !== null ? fc - goal : null, gapPct: fc !== null && goal ? (fc - goal) / goal : null } } } };
}
const ent = (fc, hist = 'sufficient', cd = 40) => ({ annual: { forecast: { revenue: fc } }, historyAdequacy: hist, fallbackDays: 0, assumptions: { indices: { revenue: { comparableDays: cd }, orders: { comparableDays: cd } } } });
function mkRun(o = {}) {
  const chs = {}; ['ecommerce', 'app', 'whatsapp', 'llamadas'].forEach((c) => { chs[c] = mkSeries({ ...(o.ch || {}), days: o.chDays ? o.chDays[c] : [] }); });
  const tot = mkSeries({ ...(o.total || {}), days: o.totalDays || [] });
  const byCh = {}; Object.keys(chs).forEach((c) => { byCh[c] = { A: ent(1150), B: ent(o.B ?? 1140), C: ent(o.C ?? 1135), D: ent(1130) }; });
  return { year: 2026, cutoff: o.cutoff === undefined ? '2026-09-30' : o.cutoff, referenceDate: '2026-09-30', method: { id: 'B', label: 'Acumulado del año' }, plan: { source: o.noPlan ? 'none' : 'planData', label: 'Plan 2026 v1' },
    settings: { recentWindow: 14, minComparableDays: 5, minWindowCoverage: 0.7 }, channels: chs, total: tot,
    comparison: { byChannel: byCh, total: { A: { forecast: { revenue: 1150 } }, B: { forecast: { revenue: o.B ?? 1140 }, historyAdequacy: 'sufficient' }, C: { forecast: { revenue: o.C ?? 1135 }, historyAdequacy: 'sufficient' }, D: { forecast: { revenue: 1130 }, historyAdequacy: 'sufficient' } } } };
}
const diagOk = () => ({ status: 'ok', attributionMethod: 'sequential', attributionMethodLabel: 'Secuencial (volumen → CR → AOV)', comparison: { label: 'Real vs. plan' }, period: { label: 'Septiembre 2026' }, channel: { label: 'Total digital' },
  result: { currentLabel: 'Real', baselineLabel: 'Plan' }, gap: { abs: -45, pct: -0.05, current: 855, baseline: 900 }, coverage: { unpaired: 0 },
  level1Drivers: [{ driver: 'trafficVolume', label: 'Volumen', baseline: 100, current: 105, deltaPct: 0.05, contribution: 30 }, { driver: 'conversionRate', label: 'CR', baseline: 0.02, current: 0.018, deltaPct: -0.1, contribution: -50 }, { driver: 'aov', label: 'AOV', baseline: 450, current: 440, deltaPct: -0.02, contribution: -25 }], level2: [] });
const base = (o = {}) => ({ app: { name: 'RevNavigator', version: '0.16.5' }, generatedAt: '2026-10-07T15:00:00.000Z', channel: 'total', run: mkRun(), diag: diagOk(), quality: { status: 'warnings', statusText: 'Datos con advertencias', totals: { rejected: 0, missingChannels: 8 }, byType: {} }, filters: [], ...o });
const pg = (rep, id) => rep.pages.find((p) => p.id === id);

// 1 · datos completos
let rep = RB.build(base());
t('1 · completo: portada, pacing, confiabilidad, diagnóstico y anexo incluidos', ['cover', 'pacing', 'reliability', 'drivers', 'annex'].every((id) => pg(rep, id).status === 'included'), rep.included);
const pc = pg(rep, 'pacing');
t('1 · KPIs de pacing con valores crudos y etiqueta', pc.kpis.find((k) => k.id === 'real').value === 855 && pc.kpis.find((k) => k.id === 'real').tag === 'Observado' && pc.kpis.find((k) => k.id === 'forecast').tag === 'Estimado' && pc.kpis.find((k) => k.id === 'plan').tag === 'Calculado');
t('1 · cumplimiento = real ÷ plan comparable', Math.abs(pc.kpis.find((k) => k.id === 'compliance').value - 855 / 900) < 1e-12);
const cum = pc.charts[0];
t('1 · acumulado del forecast cierra con el forecast anual cuando hay 12 meses', cum.forecast[11] === 95 * 9 + 100 * 3 && cum.actual[8] === 95 * 9 && cum.actual[9] === null && cum.cutIndex === 8, cum);
t('1 · el real no se proyecta como 0 tras el corte', cum.actual.slice(9).every((v) => v === null));
t('1 · tabla por canal: 4 canales + Total', pc.tables[0].rows.length === 5 && pc.tables[0].rows[4]._total === true);
t('1 · sin reconciliación cuando todos los canales cuentan', pc.reconciliation === null);
t('1 · páginas numeradas solo las incluidas', rep.pages.filter((p) => p.status === 'included').every((p, i) => p.number === i + 1));
// 2 · un canal incompleto → conciliación del Total
const d = (date, counted) => ({ date, counted, closed: true });
let run2 = mkRun({ totalDays: [d('2026-09-20', true), d('2026-09-21', false), d('2026-09-22', false)], chDays: { ecommerce: [d('2026-09-20', true), d('2026-09-21', true), d('2026-09-22', true)], app: [d('2026-09-20', true), d('2026-09-21', true), d('2026-09-22', true)], whatsapp: [d('2026-09-20', true), d('2026-09-21', false), d('2026-09-22', false)], llamadas: [d('2026-09-20', true), d('2026-09-21', true), d('2026-09-22', true)] } });
rep = RB.build(base({ run: run2 }));
const rc = pg(rep, 'pacing').reconciliation;
t('2 · conciliación: 2 días excluidos por WhatsApp', rc && rc.excludedDays === 2 && Object.keys(rc.byChannel).join() === 'whatsapp', rc);
t('2 · la nota explica suma de canales, Total estricto y diferencia', /Conciliación del Total: 2 días excluidos/.test(pg(rep, 'pacing').notes[0]) && /Total estricto/.test(pg(rep, 'pacing').notes[0]));
rep = RB.build(base({ run: run2, channel: 'ecommerce' }));
t('2 · con un solo canal no se muestra conciliación del Total', pg(rep, 'pacing').reconciliation === null);
// 3 · sin plan: no se inventa
let run3 = mkRun({ noPlan: true, total: { plan: null, goal: null, fc: null, monthPlan: null, monthFc: null } });
rep = RB.build(base({ run: run3 }));
const p3 = pg(rep, 'pacing');
t('3 · sin plan: plan y cumplimiento son null (No disponible), no 0', p3.kpis.find((k) => k.id === 'plan').value === null && p3.kpis.find((k) => k.id === 'compliance').value === null && RB.fmt('moneyC', null) === 'No disponible');
t('3 · sin plan: el titular lo dice y no inventa brecha', /no hay plan comparable/i.test(p3.headline), p3.headline);
t('3 · sin forecast anual: KPI de cierre null y nota explícita', p3.kpis.find((k) => k.id === 'forecast').value === null && p3.notes.some((n) => /forecast al cierre no está disponible/.test(n)));
t('3 · acumulado de plan y forecast con huecos (null), no ceros', pg(rep, 'pacing').charts[0].plan.every((v) => v === null) && pg(rep, 'pacing').charts[0].forecast.slice(9).every((v) => v === null));
// 4 · cero real ≠ faltante
let run4 = mkRun({ total: { real: 0, plan: 900 } });
rep = RB.build(base({ run: run4 }));
const p4 = pg(rep, 'pacing');
t('4 · cero real con días contados: se muestra $0, no «No disponible»', p4.status === 'included' && p4.kpis.find((k) => k.id === 'real').value === 0 && RB.fmt('moneyC', 0) === '$0' && /100\.0 % por debajo/.test(p4.headline), p4.headline);
rep = RB.build(base({ run: mkRun({ total: { real: null, counted: 0 } }) }));
t('4 · real faltante sin días contados: página omitida con motivo (no 0)', pg(rep, 'pacing').status === 'omitted' && /días contados/.test(pg(rep, 'pacing').reason), pg(rep, 'pacing'));
// 5 · método vigente conservado; la herramienta no muta el run
const run5 = mkRun(); const snap = JSON.stringify(run5);
rep = RB.build(base({ run: run5 }));
t('5 · el método seleccionado es el del usuario (B) y no cambia', pg(rep, 'reliability').kpis[0].value === 'B · Acumulado del año' && run5.method.id === 'B');
t('5 · el armador no muta el forecast', JSON.stringify(run5) === snap);
t('5 · el resumen no recomienda cambiar de método', !JSON.stringify(rep).match(/sugier|recomiend\w* (usar|cambiar)/i));
// 6 · métodos muy distintos → advertencia; rango no es intervalo de confianza
rep = RB.build(base({ run: mkRun({ B: 1000, C: 1200 }) }));
const r6 = pg(rep, 'reliability');
t('6 · métodos distintos: advertencia y rango', r6.warning === 'divergence' && r6.charts[0].type === 'range' && r6.charts[0].max > r6.charts[0].min && /no un intervalo de confianza/.test(r6.notes[0]), r6.notes);
t('6 · métodos parecidos: sin advertencia', RB.build(base({ run: mkRun({ B: 1150, C: 1149 }) })).pages.find((p) => p.id === 'reliability').warning === null);
t('6 · el anexo trae la comparación completa de métodos con semáforo', pg(rep, 'annex').methods.length === 4 && pg(rep, 'annex').methods.every((m) => m.status));
// 7 · páginas opcionales omitidas con motivo y listadas en el anexo
rep = RB.build(base());
const opt = ['trends', 'categories', 'customers', 'traffic', 'recovery', 'seasonality'];
t('7 · sin datos: las 6 páginas opcionales se omiten con motivo', opt.every((id) => pg(rep, id).status === 'omitted' && pg(rep, id).reason.length > 10), opt.map((i) => pg(rep, i).status));
t('7 · el anexo lista cada página omitida con su motivo', pg(rep, 'annex').omitted.length === rep.omitted.length && rep.omitted.length >= 6);
t('7 · sin días contados ni páginas inventadas: total = incluidas', rep.total === rep.included.length);
// 8 · filtros en la portada
rep = RB.build(base({ filters: [{ page: 'Evolución', label: 'Categoría Diabetes' }, { page: 'Productos', label: 'Estado Jalisco' }] }));
t('8 · los filtros activos aparecen en la portada', /Evolución: Categoría Diabetes · Productos: Estado Jalisco/.test(pg(rep, 'cover').facts.find((f) => f.id === 'selection').value));
t('8 · sin filtros lo dice', /Sin filtros/.test(pg(RB.build(base()), 'cover').facts.find((f) => f.id === 'selection').value));
t('8 · canal único se nombra', /WhatsApp/.test(pg(RB.build(base({ channel: 'whatsapp' })), 'cover').facts.find((f) => f.id === 'channels').value));
// 9 · corte ≠ último día del período
rep = RB.build(base({ run: mkRun({ cutoff: '2026-09-17' }) }));
t('9 · la portada muestra el corte real y «acumulado al corte»', /17 sep 2026/.test(pg(rep, 'cover').facts.find((f) => f.id === 'cutoff').value) && /acumulado al corte/.test(pg(rep, 'cover').facts[0].value));
t('9 · sin corte: No disponible', pg(RB.build(base({ run: mkRun({ cutoff: null }) })), 'cover').facts.find((f) => f.id === 'cutoff').value === 'No disponible');
// 10 · diagnóstico: cierra, no cierra, faltantes
rep = RB.build(base());
const dr = pg(rep, 'drivers');
t('10 · la atribución cierra exacto con la brecha y se muestra el método', dr.status === 'included' && dr.method.closes && Math.abs(dr.method.sum - dr.method.gap) < 1e-9 && /Secuencial/.test(dr.method.label));
t('10 · cascada: referencia + 3 palancas + real', dr.charts[0].steps.length === 5 && dr.charts[0].steps[0].value === 900 && dr.charts[0].steps[4].value === 855);
t('10 · lenguaje no causal', /no demuestra que sea la causa/.test(dr.notes.join(' ')) && !/causó|se debe a|causa raíz/i.test(JSON.stringify(dr)));
let dg = diagOk(); dg.level1Drivers[0].contribution = 40;
t('10 · si las contribuciones no cierran, no se muestra atribución', pg(RB.build(base({ diag: dg })), 'drivers').status === 'omitted' && /no cierra/.test(pg(RB.build(base({ diag: dg })), 'drivers').reason));
dg = diagOk(); dg.level1Drivers[1].contribution = null; dg.level1Drivers[2].contribution = null;
t('10 · faltan CR y AOV (sin pedidos/tráfico): se omite, no se rellena con 0', pg(RB.build(base({ diag: dg })), 'drivers').status === 'omitted');
t('10 · sin diagnóstico: se omite', pg(RB.build(base({ diag: null })), 'drivers').status === 'omitted');
// 11 · recuperación: meta ausente no se vuelve 0
const rfMk = (h, pr) => ({ total: { horizon: h, horizonSummary: { pressure: { revenue: pr } } }, channels: {} });
rep = RB.build(base({ rf: rfMk({ target: null, remaining: 0, surplus: 0, requiredTotal: 0, futureDays: 85 }, null) }));
t('11 · meta null con remaining 0: se omite (no «ya cumplida»)', pg(rep, 'recovery').status === 'omitted' && /sin meta/i.test(pg(rep, 'recovery').reason), pg(rep, 'recovery'));
rep = RB.build(base({ rf: rfMk({ target: 1200, remaining: 345, surplus: 0, requiredTotal: 345, futureDays: 85 }, { required: 345, plan: 300, delta: 45, pressure: 0.15 }) }));
const rcv = pg(rep, 'recovery');
t('11 · requerimiento diario = requerido ÷ días; sin acciones no inventa responsables', rcv.status === 'included' && Math.abs(rcv.kpis.find((k) => k.id === 'daily').value - 345 / 85) < 1e-9 && rcv.actions.length === 0 && rcv.scenarios.length === 0 && rcv.kpis.find((k) => k.id === 'daily').tag === 'Estimado');
rep = RB.build(base({ rf: rfMk({ target: 1200, remaining: 345, surplus: 0, requiredTotal: 345, futureDays: 85 }, { required: 345, plan: 300, delta: 45, pressure: 0.15 }), recovery: { actions: [{ title: 'Reforzar stock', owner: 'Operaciones', status: 'approved', startDate: '2026-10-10', endDate: '2026-10-20' }], scenarios: [{ name: 'Volumen +5 %', impact: 25 }] } }));
t('11 · acciones registradas sí se muestran con su responsable; escenarios como Estimado', pg(rep, 'recovery').actions[0].owner === 'Operaciones' && pg(rep, 'recovery').scenarios[0].tag === 'Estimado');
// 12 · evolución, categorías, clientes
const trend = { priorities: { status: 'available', drag: [{ entity: 'Prod A', impact: -800, relativeChange: -0.2, pattern: 'decline_sustained', consecutivePeriods: 4 }, { entity: 'Prod B', impact: -300, relativeChange: -0.1, pattern: 'decline_accelerating', consecutivePeriods: 1 }], compensate: [{ entity: 'Prod C', impact: 500, relativeChange: 0.2, pattern: 'growth_sustained', consecutivePeriods: 3 }], totals: { drag: -1100, compensate: 500, balance: -600, dragAbs: 1100, compensateAbs: 500 }, comparison: { baselinePeriod: 'Ago 2026', currentPeriod: 'Sep 2026', baselinePartial: false, currentPartial: false } }, rows: [{ entity: 'Prod A', series: [{ period: '2026-07', value: 10 }, { period: '2026-08', value: 8 }] }], context: { level: 'product', levelLabel: 'Producto', metricLabel: 'Venta', channelLabel: 'Total digital' } };
rep = RB.build(base({ trend, trendFilterLabel: 'Categoría Diabetes' }));
const tr = pg(rep, 'trends');
t('12 · evolución: arrastran y compensan con impacto, patrón y duración', tr.status === 'included' && tr.tables[0].rows[0].entity === 'Prod A' && /Caída sostenida · 4 períodos/.test(tr.tables[0].rows[0].pattern) && tr.tables[0].rows[1].pattern === 'Caída acelerada', tr.tables[0].rows);
t('12 · evolución: una caída puntual no se llama «deterioro»', !/deterioro/i.test(JSON.stringify(tr.tables)) && !/deterioro/i.test(tr.headline));
t('12 · evolución: el filtro aplicado queda en el alcance', tr.scope.filter === 'Categoría Diabetes');
const trP = JSON.parse(JSON.stringify(trend)); trP.priorities.comparison.currentPartial = true;
t('12 · período parcial se avisa', pg(RB.build(base({ trend: trP })), 'trends').scope.partial === true && /parcial/.test(pg(RB.build(base({ trend: trP })), 'trends').notes[0]));
const product = { level: 'category', channel: 'total', period: { from: '2026-09-01', to: '2026-09-30' }, baseline: { label: 'Mes anterior' }, total: { revenue: { current: 1000, baseline: 1100, delta: -100, deltaPct: -0.0909 } }, compensation: { text: '1 grupo(s) cayeron $150, compensados por $50.' },
  rows: [{ key: 'Diabetes', revenue: { current: 400, baseline: 500, delta: -100, deltaPct: -0.2 }, share: 0.4, contribution: 1 }, { key: 'Cardio', revenue: { current: 300, baseline: 290, delta: 10, deltaPct: 0.03 }, share: 0.3, contribution: -0.1 }, { key: 'Nutrición', revenue: { current: 200, baseline: 210, delta: -10, deltaPct: -0.04 }, share: 0.2, contribution: 0.1 }, { key: 'Otros', revenue: { current: 100, baseline: 100, delta: 0, deltaPct: 0 }, share: 0.1, contribution: 0 }] };
rep = RB.build(base({ product }));
const ct = pg(rep, 'categories');
t('12 · categorías: concentración top 3 = 90 % y participación ≠ aporte', ct.status === 'included' && Math.abs(ct.kpis.find((k) => k.id === 'top3').value - 0.9) < 1e-9 && ct.tables[0].columns.some((c) => c.label === 'Participación') && ct.tables[0].columns.some((c) => c.label === 'Aporte al cambio'));
const productSmall = JSON.parse(JSON.stringify(product)); productSmall.total.revenue.delta = -2;
t('12 · categorías: cambio total mínimo → no se muestra el aporte inestable', pg(RB.build(base({ product: productSmall })), 'categories').tables[0].rows.every((r) => r.contribution === null));
const cust = { result: { status: 'ok', summary: { customers: 120, repeatRate: 0.4, revenuePerCustomer: 3000 }, monthly: [{ key: '2026-08', customers: { new: 10, recurrent: 30, reactivated: 5, total: 45 }, reliableNew: true, lapsed: 12, lapsedBase: 40 }, { key: '2026-09', customers: { new: 12, recurrent: 31, reactivated: 4, total: 47 }, reliableNew: false, lapsed: 9, lapsedBase: 45 }], pooled: [{ days: 30, mature: 100, repeatRate: 0.2, ltv: 800 }, { days: 90, mature: 0, repeatRate: null, ltv: null }] }, scopeLabel: 'Toda la empresa' };
rep = RB.build(base({ customers: cust }));
const cc = pg(rep, 'customers');
t('12 · clientes: ventanas sin maduros no se muestran (ni como 0)', cc.status === 'included' && cc.tables[0].rows.length === 1 && cc.tables[0].rows[0].window === '30 días');
t('12 · clientes: historia corta avisa que «nuevo» no es confiable; «no regresaron» es una ventana de un mes', /no es confiable/.test(cc.notes.join(' ')) && /no una pérdida definitiva/.test(cc.notes.join(' ')) && cc.lapsed.count === 9);
t('12 · clientes: sin libro se omite', pg(RB.build(base({ customers: { result: { status: 'empty' } } })), 'customers').status === 'omitted');
// 13 · tráfico
const diagSeg = diagOk(); diagSeg.level2 = [{ dimension: 'device', label: 'Dispositivo', source: 'segments', groups: [{ label: 'Mobile', observations: 20, current: { trafficVolume: 500, conversionRate: 0.02, aov: 400, revenue: 4000 }, metrics: { trafficVolume: { deltaPct: 0.1 }, conversionRate: { deltaPct: 0.05 }, revenue: { deltaPct: 0.12 } } }, { label: 'Desktop', observations: 20, current: { trafficVolume: 300, conversionRate: 0.03, aov: 500, revenue: 4500 }, metrics: { trafficVolume: { deltaPct: -0.1 }, conversionRate: { deltaPct: -0.08 }, revenue: { deltaPct: -0.2 } } }] }];
const tf = pg(RB.build(base({ diag: diagSeg })), 'traffic');
t('13 · tráfico: segmentos reales con CR, AOV y denominador; sin CAC/ROAS inventados', tf.status === 'included' && tf.tables[0].rows.length === 2 && /pedidos ÷ tráfico/.test(tf.scope.denominator) && /no hay CAC ni ROAS/.test(tf.notes.join(' ')));
t('13 · tráfico: solo dimensiones core → se omite', pg(RB.build(base({ diag: { ...diagOk(), level2: [{ dimension: 'channel', source: 'core', groups: [{ label: 'x' }] }] } })), 'traffic').status === 'omitted');
// 14 · estacionalidad y proyección
const proj = { hasData: true, baseYear: 2026, targetYear: 2027, growth: 0.16, base: { total: 1000 }, meta: { total: 1160 }, projection: { total: 1100 }, gap: { total: 60 }, rows: [{ label: 'Ecommerce', base: 600, meta: 700, proj: 660, gap: 40 }], warnings: [] };
const sp = pg(RB.build(base({ projection: proj })), 'seasonality');
t('14 · proyección: meta y proyección etiquetadas Estimado con supuesto visible', sp.status === 'included' && sp.kpis[1].tag === 'Estimado' && /Supuestos/.test(sp.notes.join(' ')) && /no una recomendación/.test(sp.notes.join(' ')));
t('14 · sin historia ni proyección: se omite con motivo', pg(RB.build(base({ projection: { hasData: false }, profiles: {} })), 'seasonality').status === 'omitted');
const idx = Array.from({ length: 12 }, (_, i) => 0.8 + i * 0.03);
t('14 · factores mensuales solo con 12 valores válidos', pg(RB.build(base({ profiles: { ecommerce: { monthly: { available: true, index: idx } }, app: { monthly: { available: true, index: [1, 1] } } } })), 'seasonality').charts[0].series.length === 1);
// 15 · resumen determinista y sin «null»
rep = RB.build(base({ trend, product, rf: rfMk({ target: 1200, remaining: 345, surplus: 0, requiredTotal: 345, futureDays: 85 }, { required: 345, plan: 300, delta: 45, pressure: 0.15 }) }));
const sm = pg(rep, 'summary');
t('15 · resumen: hasta 3 hallazgos, cada una con certeza, fuente y etiqueta', sm.status === 'included' && sm.items.length >= 1 && sm.items.length <= 3 && sm.items.every((i) => i.certainty && i.source && i.tag), sm.items.length);
t('15 · resumen: «qué revisar» solo con respaldo de un cálculo', sm.review && /Prod A/.test(sm.review.text) && /no es una recomendación causal/.test(sm.review.basis));
const strs = []; const walk = (v, k) => { if (typeof v === 'string') strs.push(v); else if (Array.isArray(v)) v.forEach((x) => walk(x)); else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, x]) => walk(x, kk)); }; walk(rep.pages.map((p) => [p.headline, p.notes, p.items, p.facts, p.kpis, p.tables]));
const badStr = strs.find((x) => /\b(null|undefined|NaN)\b/.test(x)); t('15 · ningún texto contiene null/undefined/NaN', !badStr, badStr);
t('15 · resumen sin cálculos válidos: se omite', pg(RB.build(base({ run: null, diag: null })), 'summary').status === 'omitted');
// 16 · privacidad
rep = RB.build(base({ cohereKey: 'SECRET-KEY-123', apiKey: 'SK-ABC', settings: { prefs: 'x' }, businessName: 'Farmacia Secreta', businessContext: { name: 'Farmacia Secreta' } }));
t('16 · el reporte no arrastra claves, preferencias ni nombre del negocio', !/SECRET-KEY|SK-ABC|Farmacia Secreta|prefs/.test(JSON.stringify(rep)));
t('16 · el nombre del negocio solo viaja si se pide (opt-in)', pg(RB.build(base({ businessName: 'Farmacia X', options: { showBusinessName: true } })), 'cover').businessName === 'Farmacia X');
t('16 · formatos: faltante es «No disponible» y cero es $0', RB.fmt('money', undefined) === 'No disponible' && RB.fmt('pct', NaN) === 'No disponible' && RB.fmt('money', 0) === '$0' && RB.fmt('pct', 0) === '0.0 %');
// 17 · anexo: calidad y supuestos
const q = { status: 'warnings', statusText: 'Datos con advertencias', totals: { rejected: 3, missingChannels: 8 }, byType: { actual: { label: 'Venta real', files: 1, rowsRead: 100, imported: 97, rejected: 3, warning: 2, error: 1, duplicateKeys: 0 }, plan: { label: 'Plan', files: 0 } } };
const an = pg(RB.build(base({ quality: q })), 'annex');
t('17 · anexo: calidad por tipo solo de lo cargado, faltantes y supuestos', an.quality.length === 1 && an.quality[0].rejected === 3 && an.missing.some((m) => m.value === 3) && an.assumptions.some((a) => /Ventana reciente/.test(a.item) && /14/.test(a.value)));
t('17 · anexo: backtest no calculado se dice, no se inventa', /no se había calculado/.test(an.backtestNote) && an.backtest.length === 0);
const withBt = pg(RB.build(base({ run: mkRun(), channel: 'ecommerce', backtest: { byChannel: { ecommerce: { B: { 7: { status: 'evaluated', wape: 0.08, planWape: 0.1 } } } } } })), 'annex');
t('17 · anexo: backtest calculado se muestra con su advertencia de comparabilidad', withBt.backtest.length === 1 && withBt.backtest[0].wape === 0.08 && /pueden no ser comparables/.test(withBt.backtestNote), withBt.backtest);
t('17 · definiciones y límites incluyen no-causalidad y generación local', an.definitions.length >= 8 && an.limits.some((l) => /no envía datos/.test(l)) && an.limits.some((l) => /no establecen causas/.test(l)));

// 18 · período y alcance por lámina (cada página dice qué período cubre; el corte no se confunde con el período)
const rfOk = rfMk({ type: 'year', key: '2026', target: 1200, actualToDate: 855, remaining: 345, surplus: 0, requiredTotal: 345, futureDays: 85, countedDays: 270 }, { required: 345, plan: 300, delta: 45, pressure: 0.15 });
rep = RB.build(base({ trend, product, rf: rfOk, customers: cust, projection: proj }));
t('18 · pacing declara el año acumulado y el corte', /1 ene – 30 sep 2026/.test(pg(rep, 'pacing').ctx) && /270 días contados/.test(pg(rep, 'pacing').ctx), pg(rep, 'pacing').ctx);
t('18 · pacing separa real acumulado, plan esperado y cierre estimado del año', ['Venta real acumulada al corte', 'Plan esperado al corte', 'Cierre estimado 2026'].every((l) => pg(rep, 'pacing').kpis.some((k) => k.label === l)));
t('18 · confiabilidad: la meta es la anual y la brecha es cierre − meta', pg(rep, 'reliability').kpis.some((k) => k.label === 'Meta anual 2026') && pg(rep, 'reliability').kpis.some((k) => /Cierre estimado − meta anual/.test(k.label)));
t('18 · drivers, evolución, categorías, clientes y recuperación declaran su período', ['drivers', 'trends', 'categories', 'customers', 'recovery'].every((id) => pg(rep, id).ctx && pg(rep, id).ctx.length > 8), ['drivers', 'trends', 'categories', 'customers', 'recovery'].map((id) => pg(rep, id).ctx));
t('18 · evolución y categorías muestran períodos distintos sin mezclarse', /Sep 2026 vs\. Ago 2026/.test(pg(rep, 'trends').ctx) && /01 sep – 30 sep 2026 vs\. Mes anterior/.test(pg(rep, 'categories').ctx), [pg(rep, 'trends').ctx, pg(rep, 'categories').ctx]);
// 19 · período seleccionado vs fecha de corte (datos parciales)
const dgP = diagOk(); dgP.period = { type: 'month', key: '2026-10', label: 'Octubre 2026' }; dgP.coverage = { unpaired: 0, currentRange: ['2026-10-01', '2026-10-20'], baselineRange: ['2026-10-01', '2026-10-20'] };
const drP = pg(RB.build(base({ diag: dgP })), 'drivers');
t('19 · octubre 1–31 con datos al 20: la lámina dice el período y los días observados', /Octubre 2026 \(datos 01 oct – 20 oct 2026\)/.test(drP.ctx) && drP.notes.some((n) => /Período seleccionado: Octubre 2026\. Solo hay datos observados/.test(n) && /mismos días de la referencia/.test(n)), [drP.ctx, drP.notes]);
t('19 · período completo: no se agrega la nota de parcialidad', !pg(RB.build(base({ diag: { ...diagOk(), period: { type: 'month', key: '2026-09', label: 'Septiembre 2026' }, coverage: { unpaired: 0, currentRange: ['2026-09-01', '2026-09-30'] } } })), 'drivers').notes.some((n) => /Solo hay datos observados/.test(n)));
const custP = JSON.parse(JSON.stringify(cust)); custP.result.monthly[custP.result.monthly.length - 1].key = '2026-09';
t('19 · el mes en curso de clientes se avisa como no comparable con meses completos', /en curso/.test(pg(RB.build(base({ customers: custP, run: mkRun({ cutoff: '2026-09-17' }) })), 'customers').ctx) && pg(RB.build(base({ customers: custP, run: mkRun({ cutoff: '2026-09-17' }) })), 'customers').notes.some((n) => /no son comparables con meses completos/.test(n)));
t('19 · con el mes cerrado no hay aviso de mes en curso', !/en curso/.test(pg(RB.build(base({ customers: custP, run: mkRun({ cutoff: '2026-09-30' }) })), 'customers').ctx));
// 20 · conciliación de brechas: cada cifra viene de su fuente y no se fuerza a coincidir
const rcl = pg(rep, 'recovery'), gp = Object.fromEntries(rcl.gaps.map((g) => [g.name, g]));
t('20 · cuatro brechas con su definición y período', rcl.gaps.length === 4 && rcl.gaps.every((g) => g.what && g.period && g.tag), rcl.gaps.map((g) => g.name));
t('20 · brecha a la fecha = real − plan esperado (fuente: pacing)', gp['Brecha a la fecha (pacing)'].value === 855 - 900 && gp['Brecha a la fecha (pacing)'].tag === 'Calculado');
t('20 · brecha del diagnóstico = la del motor de diagnóstico', gp['Brecha del diagnóstico'].value === -45 && /Septiembre 2026/.test(gp['Brecha del diagnóstico'].period));
t('20 · brecha proyectada es Estimado y viene del forecast (cierre − meta)', gp['Brecha proyectada al cierre'].tag === 'Estimado' && gp['Brecha proyectada al cierre'].value === 1150 - 1200 || gp['Brecha proyectada al cierre'].value === 1140 - 1200, gp['Brecha proyectada al cierre']);
t('20 · brecha pendiente = lo que reporta el reforecast (meta − real acumulado)', gp['Brecha pendiente (recuperación)'].value === 345 && /01 oct – 31 dic 2026|oct – 31 dic 2026/.test(gp['Brecha pendiente (recuperación)'].period), gp['Brecha pendiente (recuperación)'].period);
t('20 · la lámina advierte que son brechas distintas que no se suman', /no se suman ni tienen por qué coincidir/.test(rcl.gapsNote || ''));
t('20 · sin diagnóstico no se inventa esa brecha', !pg(RB.build(base({ rf: rfOk, diag: null })), 'recovery').gaps.some((g) => g.name === 'Brecha del diagnóstico'));
t('20 · la meta anual no se presenta como pronóstico', rcl.kpis.find((k) => k.id === 'target').label === 'Meta anual 2026' && rcl.kpis.find((k) => k.id === 'target').tag === 'Calculado' && /no es una proyección/.test(rcl.notes.join(' ')));
// 21 · resumen: hasta 3 hallazgos con criterio fijo
t('21 · resumen: exactamente 3 hallazgos en el orden pacing → drivers → recuperación', sm.items.length === 3 && sm.items.map((i) => i.page).join() === 'pacing,drivers,recovery', sm.items.map((i) => i.page));
t('21 · resumen: el hallazgo de pacing no repite el cierre en un 2.º hallazgo', sm.items.filter((i) => /cierre estimado/.test(i.text)).length === 1);
// 22 · meta 2027 vs proyección por ritmo reciente: la meta no es pronóstico
const spj = pg(RB.build(base({ projection: proj })), 'seasonality');
t('22 · estacionalidad: la meta propuesta se declara supuesto de planeación, no pronóstico', /supuesto de planeación, no un pronóstico/.test(spj.headline) && spj.kpis.some((k) => k.label === 'Proyección por ritmo reciente') && spj.ctx === 'Base 2026 → 2027', [spj.headline, spj.ctx]);
// 23 · robustez de volumen y texto
const longName = 'Complejo vitamínico multimineral con ginseng, ácido fólico y hierro quelado 120 tabletas edición familiar';
const many = Array.from({ length: 60 }, (_, i) => ({ entity: `${longName} ${i}`, impact: -(60 - i) * 10, relativeChange: -0.1, pattern: 'decline_sustained', consecutivePeriods: 3 }));
const trendMany = JSON.parse(JSON.stringify(trend)); trendMany.priorities.drag = many; trendMany.priorities.compensate = many.map((x) => ({ ...x, impact: -x.impact }));
const tm = pg(RB.build(base({ trend: trendMany })), 'trends');
t('23 · 60 filas: la lámina muestra las 5 mayores y no recorta el nombre', tm.tables[0].rows.length === 5 && tm.tables[0].rows[0].entity === `${longName} 0` && tm.tables[0].rows[0].impact === -600);
const prodMany = JSON.parse(JSON.stringify(product)); prodMany.rows = Array.from({ length: 80 }, (_, i) => ({ key: `${longName} ${i}`, revenue: { current: 1000 - i, baseline: 900, delta: 100 - i, deltaPct: 0.1 }, share: 0.01, contribution: 0.01 }));
const cm = pg(RB.build(base({ product: prodMany })), 'categories');
t('23 · 80 grupos: tabla de 6 y gráfica de 6, con nombres completos', cm.tables[0].rows.length === 6 && cm.charts[0].items.length === 6 && cm.charts[0].items[0].label.startsWith(longName));
// 24 · valores no finitos nunca llegan al texto
const dgBad = diagOk(); dgBad.gap = { abs: Infinity, pct: NaN, current: 855, baseline: 900 };
const repBad = RB.build(base({ diag: dgBad, rf: rfMk({ type: 'year', key: '2026', target: 1200, actualToDate: NaN, remaining: undefined, surplus: 0, requiredTotal: Infinity, futureDays: 85 }, { pressure: NaN, plan: NaN }), trend: { priorities: { status: 'available', drag: [{ entity: 'X', impact: NaN, relativeChange: Infinity, pattern: 'stable' }], compensate: [], totals: { drag: NaN, compensate: undefined, balance: null }, comparison: {} }, rows: [], context: {} } }));
const sBad = []; const w2 = (v) => { if (typeof v === 'string') sBad.push(v); else if (Array.isArray(v)) v.forEach(w2); else if (v && typeof v === 'object') Object.values(v).forEach(w2); }; w2(repBad.pages.map((p) => [p.headline, p.notes, p.items, p.facts, p.ctx, p.gaps]));
const bs = sBad.find((x) => /\b(null|undefined|NaN|Infinity)\b/.test(x)); t('24 · valores NaN/Infinity/undefined no aparecen en titulares, notas ni etiquetas', !bs, bs);
t('24 · una brecha infinita no entra a la descomposición', pg(repBad, 'drivers').status === 'omitted');
// 25 · rediseño editorial: narrativa, cierre ejecutivo, sin metadatos de la herramienta en el cuerpo
const rep25 = RB.build(base()), sm25 = pg(rep25, 'summary'), cl25 = pg(rep25, 'closing'), cv25 = pg(rep25, 'cover');
t('25 · el resumen abre con una narrativa y sin textos técnicos', typeof sm25.narrative === 'string' && sm25.narrative.length > 40 && !/Hecho observado|Cálculo aritmético|Pág\./.test(sm25.narrative), sm25.narrative);
t('25 · cada hallazgo trae título, cifra y relevancia en lenguaje de negocio', sm25.items.every((i) => i.title && i.why && 'figure' in i), JSON.stringify(sm25.items.map((i) => i.title)));
t('25 · el cierre ejecutivo tiene cuatro bloques en orden', cl25.status === 'included' && cl25.blocks.map((b) => b.title).join('|') === 'Dónde estamos|Qué sobresalió|Qué debemos mover|Qué debemos vigilar', cl25.blocks && cl25.blocks.map((b) => b.title));
t('25 · el cierre no inventa prioridad sin respaldo', pg(RB.build(base({ trend: null, run: mkRun() })), 'closing').blocks[2].text.length > 10);
t('25 · la portada expone el alcance y el título editorial', cv25.headline === 'Reporte ejecutivo de ventas digitales' && /Total digital/.test(cv25.scope));
t('25 · la confiabilidad del forecast queda marcada como anexo', pg(rep25, 'reliability').annex === true);
t('25 · las etiquetas Observado/Calculado/Estimado son opcionales y no se activan por defecto', rep25.options.showTags === false);
t('25 · sin resultados de pacing no hay cierre', pg(RB.build(base({ run: null, diag: null })), 'closing').status === 'omitted');
const s25 = []; const w25 = (v) => { if (typeof v === 'string') s25.push(v); else if (Array.isArray(v)) v.forEach(w25); else if (v && typeof v === 'object') Object.values(v).forEach(w25); }; w25([sm25.narrative, sm25.items.map((i) => [i.title, i.figure, i.why, i.note]), cl25.blocks]);
const b25 = s25.find((x) => /\b(null|undefined|NaN|Infinity)\b/.test(x)); t('25 · narrativa y cierre sin null/NaN/Infinity', !b25, b25);
// 26 · Categorías y productos: cambio por categoría a la izquierda, participación por subcategoría a la derecha
const catRes = JSON.parse(JSON.stringify(product)); catRes.level = 'category';
const subRes = JSON.parse(JSON.stringify(product)); subRes.level = 'subcategory'; subRes.rows = subRes.rows.map((x) => ({ ...x, key: `Sub ${x.key}` }));
const c26 = pg(RB.build(base({ product: catRes, productByLevel: { category: catRes, subcategory: subRes } })), 'categories');
t('26 · la gráfica de cambio sigue por categoría', /categoría/.test(c26.charts[0].title) && !/^Sub /.test(c26.charts[0].items[0].label), c26.charts[0].title);
t('26 · la tabla de participación va por subcategoría', /Subcategoría/.test(c26.tables[0].title) && c26.tables[0].columns[0].label === 'Subcategoría' && /^Sub /.test(c26.tables[0].rows[0].key), c26.tables[0].title);
t('26 · sin análisis por nivel, la lámina conserva su comportamiento anterior', /Participación en venta/.test(pg(RB.build(base({ product })), 'categories').tables[0].title));
// 27 · orden y filtro único de la presentación
const r27 = RB.build(base({ reportFilter: 'Subcategoría Estatinas' })), ids27 = r27.pages.map((p) => p.id);
t('27 · Categorías y productos va antes de Evolución', ids27.indexOf('categories') < ids27.indexOf('trends'), ids27.join());
t('27 · con filtro, la portada lo declara y aclara qué láminas filtra', pg(r27, 'cover').filterLabel === 'Subcategoría Estatinas' && /categorías, evolución y clientes/.test(pg(r27, 'cover').filterNote));
t('27 · sin filtro, la portada no menciona filtros', !pg(RB.build(base()), 'cover').filterLabel && !pg(RB.build(base()), 'cover').filterNote);
// 28 · foco de la caída: categoría que concentra la caída, desde cuándo, año anterior, dónde
const per = Array.from({ length: 14 }, (_, i) => { const m = (7 + i) % 12; const y = 2025 + Math.floor((7 + i) / 12); return `${y}-${String(m + 1).padStart(2, '0')}`; });   // 2025-08 … 2026-09
const sEnd = per.map((p, i) => ({ period: p, value: i < 6 ? 1000 : 1000 - (i - 5) * 100 })), sRest = per.map((p) => ({ period: p, value: 5000 }));
const focusData = { category: { priorities: { status: 'available', comparison: { currentPeriod: 'Sep 2026' }, totals: { drag: -606, compensate: 50 }, drag: [{ entity: 'Endocrinología', impact: -412, evidenceBreakdown: [{ dimension: 'branch', rows: [{ name: 'SUC12', delta: -100 }, { name: '(sin dato)', delta: -80 }, { name: 'SUC31', delta: -60 }] }] }, { entity: 'Otra', impact: -194 }], compensate: [{ entity: 'Diabetes', impact: 50 }] },
  rows: [{ entity: 'Endocrinología', direction: 'decline', consecutivePeriods: 8, patternStartPeriod: '2026-02', pattern: 'decline_sustained', series: sEnd }, { entity: 'Otra', direction: 'flat', series: sRest }], context: { level: 'category' } },
  subcategory: { priorities: { status: 'available', totals: { drag: -412 }, drag: [{ entity: 'Insulinas', impact: -288 }], compensate: [] } }, delivery: [{ name: 'Domicilio', delta: -90 }, { name: '(sin dato)', delta: -300 }] };
const r28 = RB.build(base({ focusData })), sm28 = pg(r28, 'summary'), cl28 = pg(r28, 'closing');
t('28 · el resumen nombra la categoría que concentra la caída y desde cuándo', /Endocrinología/.test(sm28.narrative) && /68 %/.test(sm28.narrative) && /feb 2026/.test(sm28.narrative), sm28.narrative);
t('28 · el hallazgo del foco trae cifra, porcentaje y dónde (subcategoría y farmacias)', sm28.items[1].page === 'focus' && /Insulinas/.test(sm28.items[1].why) && /SUC12/.test(sm28.items[1].why) && !/sin dato/.test(sm28.items[1].why) && sm28.items[1].figure.includes('412'), JSON.stringify(sm28.items[1]));
t('28 · compara con el mismo mes del año anterior y con el resto del negocio', /Frente a sep 2025/.test(sm28.focus.text) && /resto del negocio/.test(sm28.focus.text) && sm28.focus.spark && sm28.focus.spark.since === '2026-02', sm28.focus.text);
t('28 · el cierre apunta a la categoría y dice si hay acciones sobre ella', /Endocrinología/.test(cl28.blocks[2].unit) && /acción registrada|acciones registradas|No hay acciones/.test(cl28.blocks[2].text), cl28.blocks[2].text);
t('28 · sin entidad que concentre al menos una cuarta parte no hay foco (se usa la lectura de siempre)', (() => { const fd = JSON.parse(JSON.stringify(focusData)); fd.category.priorities.drag = [-300, -300, -300].map((v, i) => ({ entity: `E${i}`, impact: v })); fd.category.priorities.totals.drag = -1500; return pg(RB.build(base({ focusData: fd })), 'summary').items.every((i) => i.page !== 'focus'); })());
t('28 · sin análisis por categoría el resumen mantiene su comportamiento anterior', pg(RB.build(base()), 'summary').items.every((i) => i.page !== 'focus'));
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
