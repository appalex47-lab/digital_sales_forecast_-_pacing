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
t('10 · lenguaje no causal', /no demuestra que una palanca sea la causa/.test(dr.notes.join(' ')) && !/causó|se debe a|causa raíz/i.test(JSON.stringify(dr)));
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
t('15 · resumen: entre 3 y 5 conclusiones, cada una con certeza, fuente y etiqueta', sm.status === 'included' && sm.items.length >= 3 && sm.items.length <= 5 && sm.items.every((i) => i.certainty && i.source && i.tag), sm.items.length);
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
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
