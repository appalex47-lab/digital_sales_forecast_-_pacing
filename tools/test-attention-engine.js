// Prueba de js/analytics/attentionEngine.js con entradas sintéticas (escenarios A–G del rediseño de Inicio). Uso: node tools/test-attention-engine.js
global.window = global; global.FP = { config: { forecast: { pacingThresholds: { aboveFrom: 1.01, onPlanFrom: 0.99 } } } };
require('../js/calculations/metrics.js'); require('../js/calculations/gap.js'); require('../js/analytics/attentionEngine.js');
const AE = FP.attentionEngine; let fails = 0, n = 0;
const ok = (name, cond, d) => { n++; if (!cond) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } else console.log('✔', name); };

const readyAll = { percent: 100, tier: 'ok', label: 'Listo', allBlockingDone: true, items: [
  { id: 'targets', label: 'Meta anual definida', view: 'resumen', blocking: true, done: true }, { id: 'plan', label: 'Plan distribuido', view: 'plan', blocking: true, done: true },
  { id: 'actual', label: 'Venta real cargada', view: 'carga', blocking: true, done: true }] };
const mk = (o = {}) => {
  const status = { currentModule: 'inicio', year: 2026, channel: 'total', data: { historical: 700, plan: 365, actual: 200, segments: 0, quality: 'ready', qualityText: 'Datos listos' }, targets: { defined: true },
    plan: { original: true, imported: false }, actual: { lastDate: '2026-09-22', countedDays: 265, cutoff: '2026-09-22' },
    forecast: { available: true, method: 'Tendencia reciente', target: 1000000, planToDate: 750000, actualToDate: 760000, compliance: 760000 / 750000, gapToDate: 10000, gapToDatePct: 0.013, forecast: 1010000, forecastGap: 10000, forecastGapPct: 0.01 },
    reforecast: { available: true }, diagnostic: { visited: false, hypotheses: null }, scenarios: { count: 0, withHypothesis: 0 }, actions: { count: 0, open: 0, withoutMeasurement: 0 }, measurements: { count: 0 }, visited: {} };
  const summary = { channel: 'total', period: { type: 'year', key: '2026' }, whyPlan: { status: 'ok', gap: 10000, gapPct: 0.013, coverage: { expected: 265, paired: 265 }, effects: { traffic: 0, cr: 0, aov: 10000, delta: 10000 }, drivers: [] },
    channels: { status: 'ok', rows: [] }, excluded: null, trust: {} };
  const inp = { referenceDate: '2026-09-23', year: 2026, channel: 'total', status, readiness: readyAll, summary, actions: [], measuredActionIds: [], hasProducts: false, progress: {} };
  return Object.assign(inp, o);
};
const under = (inp, extra = {}) => {
  Object.assign(inp.status.forecast, { actualToDate: 700000, compliance: 700000 / 750000, gapToDate: -50000, gapToDatePct: -0.0667, forecast: 940000, forecastGap: -60000, forecastGapPct: -0.06 }, extra);
  inp.summary.whyPlan = { status: 'ok', gap: -50000, gapPct: -0.0667, coverage: { expected: 265, paired: 265 }, effects: { traffic: -5000, cr: -35000, aov: -10000, delta: -50000 },
    drivers: [{ id: 'trafficVolume', label: 'Tráfico', contribution: -5000, baseline: 100000, current: 98000, deltaPct: -0.02 }, { id: 'conversionRate', label: 'Conversión', contribution: -35000, baseline: 0.02, current: 0.0175, deltaPct: -0.125 },
      { id: 'aov', label: 'Ticket', contribution: -10000, baseline: 900, current: 880, deltaPct: -0.022 }] };
  return inp;
};

// A · datos completos y venta dentro de meta
let r = AE.evaluate(mk());
ok('A: sin desviación → estado estable, sin alerta de brecha', r.state === 'stable' && !r.findings.some((f) => f.kind === 'gap'), r.findings.map((f) => f.id));
ok('A: el paso principal es monitorear el pacing (no se inventa una acción)', r.route.primary.id === 'monitor' && r.route.primary.view === 'pacing', r.route.primary);
// B · venta debajo de meta
r = AE.evaluate(under(mk()));
ok('B: se detecta la brecha con su monto correcto', r.findings.some((f) => f.id === 'gap' && f.amount === -50000), r.findings.map((f) => f.id));
ok('B: el paso principal abre el diagnóstico', r.route.primary.id === 'review_gap' && r.route.primary.view === 'diagnostico', r.route.primary);
ok('B: propone el forecast como paso posterior (forecast también corto)', r.findings.some((f) => f.id === 'forecast'), r.findings.map((f) => f.id));
ok('B: el hallazgo trae evidencia, respaldo y qué revisar después', r.findings[0].evidence.length >= 2 && r.findings[0].support && r.findings[0].nextCheck, r.findings[0]);
// C · caída de conversión
const cr = r.findings.find((f) => f.id === 'driver_cr');
ok('C: la conversión es el driver con mayor aporte y aparece como hallazgo', Boolean(cr) && cr.amount === -35000, r.findings.map((f) => f.id));
ok('C: no declara causalidad: lo marca como contribución cuantitativa e hipótesis a validar', /no demuestra/i.test(cr.note) && /no demostrada/i.test(cr.hypothesis) && !/causa (es|fue)/i.test(cr.what), cr);
ok('C: sin segmentos explica qué falta', cr.missing.length === 1 && /Segmentos/.test(cr.missing[0]), cr.missing);
const i2 = under(mk()); i2.status.data.segments = 5; const cr2 = AE.evaluate(i2).findings.find((f) => f.id === 'driver_cr');
ok('C: con segmentos ya no declara faltantes', cr2.missing.length === 0, cr2.missing);
ok('C: tráfico (−5 000, 10 % de la brecha) no entra como hallazgo; el ticket (20 %) tampoco (umbral 30 %)', !r.findings.some((f) => f.id === 'driver_traffic' || f.id === 'driver_aov'), r.findings.map((f) => f.id));
// D · ticket en descenso
const d = under(mk()); d.summary.whyPlan.drivers = [{ id: 'trafficVolume', label: 'T', contribution: 0, baseline: 1, current: 1, deltaPct: 0 }, { id: 'conversionRate', label: 'C', contribution: -5000, baseline: 0.02, current: 0.0199, deltaPct: -0.005 },
  { id: 'aov', label: 'A', contribution: -45000, baseline: 900, current: 850, deltaPct: -0.055 }];
d.hasProducts = true; r = AE.evaluate(d); const av = r.findings.find((f) => f.id === 'driver_aov');
ok('D: el ticket aparece con su contexto y enlaza al análisis de mix (Productos)', Boolean(av) && av.next.view === 'producto' && /mix/i.test(av.next.label), av);
d.hasProducts = false; const av2 = AE.evaluate(d).findings.find((f) => f.id === 'driver_aov');
ok('D: sin Productos no inventa una métrica: explica qué falta y manda a Diagnóstico', av2.next.view === 'diagnostico' && av2.missing.some((m) => /Productos/.test(m)), av2);
// E · datos incompletos
const e = under(mk()); e.readiness = { ...readyAll, percent: 45, tier: 'error', label: 'Probablemente incompleto', allBlockingDone: false,
  items: [{ id: 'actual', label: 'Venta real del año', view: 'carga', blocking: true, done: false }, ...readyAll.items.slice(0, 2)] };
r = AE.evaluate(e);
ok('E: con datos incompletos el primer hallazgo es completar la información y estado = bloqueado', r.state === 'blocked' && r.findings[0].id === 'data_missing', r.findings.map((f) => f.id));
ok('E: no certifica un diagnóstico dependiente de datos inválidos (no hay hallazgos de brecha ni drivers)', !r.findings.some((f) => ['gap', 'driver', 'forecast'].includes(f.kind)), r.findings.map((f) => f.id));
ok('E: el paso principal va a preparación de datos y el diagnóstico queda fuera', r.route.primary.id === 'complete_data' && r.route.primary.view === 'carga', r.route.primary);
e.readiness = readyAll; e.status.data.quality = 'invalid'; r = AE.evaluate(e);
ok('E: con errores de calidad el paso principal lleva a Calidad de datos', r.route.primary.view === 'calidad', r.route.primary);
// E2 · al corregir los datos se reevalúa
const e2 = under(mk()); r = AE.evaluate(e2);
ok('E: al corregir los datos se habilita la ruta de diagnóstico', r.route.primary.id === 'review_gap', r.route.primary);
// datos desactualizados
const st = under(mk()); st.status.actual.lastDate = '2026-09-10'; r = AE.evaluate(st);
ok('E: venta real vieja (13 días) → hallazgo de datos desactualizados antes que la brecha y paso «completar datos» primero (Caso 1)', r.findings[0].id === 'data_stale' && r.route.primary.id === 'complete_data' && r.findings.some((f) => f.id === 'gap'), r.findings.map((f) => f.id));
const w2 = mk(); w2.status.data.quality = 'warnings'; r = AE.evaluate(w2);
ok('E: solo avisos de calidad, sin desviación → estado estable y el paso principal es monitorear (un aviso suave no es acción)', r.state === 'stable' && r.route.primary.id === 'monitor' && r.findings.some((f) => f.id === 'data_warnings'), [r.state, r.route.primary.id]);
const w3 = under(mk()); w3.status.data.quality = 'warnings'; r = AE.evaluate(w3);
ok('E: con brecha y avisos de calidad, el paso principal sigue siendo el diagnóstico', r.route.primary.id === 'review_gap', r.route.primary.id);
// F · forecast de cierre insuficiente con buen cumplimiento
const f = mk(); Object.assign(f.status.forecast, { compliance: 1.0, gapToDate: 0, actualToDate: 750000, forecast: 920000, forecastGap: -80000, forecastGapPct: -0.08 });
r = AE.evaluate(f); const fc = r.findings.find((x) => x.id === 'forecast');
ok('F: distingue desempeño acumulado de pronóstico: «vas bien hoy, pero el cierre está en riesgo»', Boolean(fc) && /Vas bien hoy/.test(fc.title) && !r.findings.some((x) => x.id === 'gap'), r.findings.map((x) => x.id));
ok('F: abre forecast y escenarios sin modificar meta ni forecast base', fc.next.view === 'reforecast' && /No modifica la meta/.test(fc.nextCheck), fc.next);
// G · intervención pendiente de medición
const g = mk(); g.status.actions = { count: 1, open: 1, withoutMeasurement: 1 }; g.actions = [{ actionId: 'ACT_001', title: 'Promoción de crónicos', status: 'in_progress', endDate: '2026-09-20' }];
r = AE.evaluate(g);
ok('G: identifica la acción y su fecha, y manda a Seguimiento', r.findings.some((x) => x.id === 'followup' && /ACT_001/.test(x.evidence.join(' ')) && /2026-09-20/.test(x.evidence.join(' '))), r.findings.map((x) => x.id));
g.actions[0].endDate = '2026-10-15'; r = AE.evaluate(g); const w = r.findings.find((x) => x.id === 'followup_wait');
ok('G: si la ventana no ha terminado queda «en espera» con la fecha y no se presenta como observado', Boolean(w) && w.waitingUntil === '2026-10-15' && r.route.primary.state === 'waiting', r.route.primary);
g.actions[0].endDate = '2026-09-20'; g.measuredActionIds = ['ACT_001']; g.status.actions.withoutMeasurement = 0; r = AE.evaluate(g);
ok('G: con la medición registrada ya no hay seguimiento pendiente', !r.findings.some((x) => x.kind === 'followup'), r.findings.map((x) => x.id));
// Estados y progreso
const p = under(mk()); p.progress = { review_gap: { at: '2026-09-23T10:00:00Z' } }; r = AE.evaluate(p);
ok('Estados: un paso abierto pero sin criterio cumplido queda «en curso», no «completado»', r.route.primary.id === 'review_gap' && r.route.primary.state === 'in_progress', r.route.primary);
const p2 = under(mk()); p2.status.visited = { diagnostico: true }; p2.status.diagnostic.hypotheses = 2; r = AE.evaluate(p2);
ok('Estados: con diagnóstico calculado el paso se completa por datos y la ruta avanza (investigar el driver / simular)', r.route.all.find((s) => s.id === 'review_gap').state === 'done' && r.route.primary.id !== 'review_gap', r.route.all.map((s) => s.id + ':' + s.state));
const p3 = under(mk()); r = AE.evaluate(p3);
ok('Estados: el paso del driver está bloqueado mientras no se haga el diagnóstico', r.route.all.find((s) => s.id === 'investigate_cr').state === 'blocked', r.route.all.map((s) => s.id + ':' + s.state));
ok('Rutas: varias rutas candidatas, principal + secundarias sin duplicar pasos', new Set(r.route.all.map((s) => s.id)).size === r.route.all.length && r.route.secondary.length >= 1, r.route.all.map((s) => s.id));
// Respaldo de evidencia
const s1 = under(mk()); s1.status.data.quality = 'ready'; ok('Respaldo: cobertura completa y datos sin avisos → alto', AE.support(s1).level === 'alto', AE.support(s1));
const s2 = under(mk()); s2.summary.whyPlan.coverage = { expected: 100, paired: 70 }; ok('Respaldo: 70 % de días comparados → medio', AE.support(s2).level === 'medio', AE.support(s2));
const s3 = under(mk()); s3.summary.whyPlan.coverage = { expected: 100, paired: 30 }; ok('Respaldo: 30 % de días comparados → bajo', AE.support(s3).level === 'bajo', AE.support(s3));
const s4 = under(mk()); s4.status.data.quality = 'invalid'; ok('Respaldo: datos con errores → bajo', AE.support(s4).level === 'bajo', AE.support(s4));
// canal rezagado
const c = under(mk()); c.summary.channels = { status: 'ok', rows: [{ id: 'app', label: 'App', state: 'ok', pacing: 'below', compliance: 0.9, actual: 100000, forecastGapPct: -0.1 }, { id: 'ecommerce', label: 'Ecommerce', state: 'ok', pacing: 'on_plan', compliance: 1, actual: 1, forecastGapPct: 0 }] };
r = AE.evaluate(c); const ch = r.findings.find((x) => x.id === 'channel_app');
ok('Canal: el canal rezagado enlaza a Pacing con ese canal', Boolean(ch) && ch.next.view === 'pacing' && ch.next.channel === 'app', ch && ch.next);
c.channel = 'app'; ok('Canal: si ya se mira un canal, no se repite el hallazgo por canal', !AE.evaluate(c).findings.some((x) => x.kind === 'channel'));
// varios canales en problema (caso real: WhatsApp rezagado + Ecommerce en el plan a la fecha pero con cierre corto)
const mc = under(mk()); mc.summary.channels = { status: 'ok', rows: [
  { id: 'whatsapp', label: 'WhatsApp', state: 'ok', pacing: 'below', compliance: 0.8, actual: 5e4, forecastGapPct: -0.2 },
  { id: 'ecommerce', label: 'Ecommerce', state: 'ok', pacing: 'on_plan', compliance: 1.0, actual: 9e5, forecastGapPct: -0.08 },
  { id: 'app', label: 'App', state: 'ok', pacing: 'above', compliance: 1.05, actual: 3e5, forecastGapPct: 0.03 }] };
r = AE.evaluate(mc); const mf = r.findings.find((x) => x.kind === 'channel');
ok('Canales: lista TODOS los canales en problema (rezagado o cierre corto), no solo el peor', Boolean(mf) && mf.channels.length === 2 && mf.channels.map((x) => x.id).join() === 'whatsapp,ecommerce', mf && mf.channels);
const mc2 = under(mk()); mc2.summary.channels = { status: 'ok', rows: [
  { id: 'chico', label: 'Chico', state: 'ok', pacing: 'below', compliance: 0.8, actual: 5e4, forecastGapPct: -0.2 },
  { id: 'grande', label: 'Grande', state: 'ok', pacing: 'below', compliance: 0.92, actual: 9e5, forecastGapPct: -0.1 }] };
ok('Canales: se ordenan por monto de brecha (el grande al 92 % antes que el chico al 80 %)', AE.evaluate(mc2).findings.find((x) => x.kind === 'channel').channels.map((x) => x.id).join() === 'grande,chico');
ok('Canales: un canal sano no aparece', !mf.channels.some((x) => x.id === 'app'));
ok('Canales: el paso conserva la lista para la vista', (r.route.all.find((o) => o.id === 'review_channel') || {}).channels && r.route.all.find((o) => o.id === 'review_channel').channels.length === 2);
// visibles
ok('Visibles: máximo 3 hallazgos y el resto va aparte', r.visible.length <= 3 && r.visible.length + r.rest.length === r.findings.length, [r.visible.length, r.rest.length]);

// ===== Etapa 2: cadena de la ruta activa y otras rutas =====
{
  let q = AE.evaluate(under(mk()));
  const ch = q.route.chain;
  ok('E2 cadena brecha: completar datos → brecha → simular → acción → seguimiento', ch.steps.map((x) => x.id).join() === 'complete_data,review_gap,simulate,plan_action,follow_up', ch.steps.map((x) => x.id));
  ok('E2 el estado de cada paso sale de datos: datos listos = hecho, brecha disponible, simular bloqueado, seguimiento bloqueado (sin acción)',
    ch.steps[0].state === 'done' && ch.steps[1].state === 'available' && ch.steps[2].state === 'blocked' && ch.steps[4].state === 'blocked', ch.steps.map((x) => x.id + ':' + x.state));
  ok('E2 avance = pasos hechos de total', ch.doneCount === 1 && ch.total === 5, [ch.doneCount, ch.total]);
  let i = under(mk()); i.status.visited = { diagnostico: true }; i.status.diagnostic = { visited: true, hypotheses: 2 };
  q = AE.evaluate(i);
  ok('E2 con el diagnóstico visto y con hipótesis, la brecha queda hecha y simular se habilita (por datos, no por clic)', q.route.chain.steps[1].state === 'done' && q.route.chain.steps[2].state !== 'blocked', q.route.chain.steps.map((x) => x.id + ':' + x.state));
  ok('E2 un paso hecho no reaparece como pendiente: el principal ya no es la brecha', q.route.primary.id !== 'review_gap' && q.route.chain.steps.find((x) => x.id === 'review_gap').state === 'done', q.route.primary.id);
  ok('E2 ninguna ruta secundaria repite pasos de la ruta activa', q.route.others.every((o) => !q.route.chain.steps.some((c) => c.id === o.id)), q.route.others.map((o) => o.id));
  ok('E2 máximo 3 rutas visibles (activa + 2) y el resto se cuenta', q.route.others.length <= 2 && typeof q.route.moreOthers === 'number', [q.route.others.length, q.route.moreOthers]);
  i = under(mk()); i.summary.channels = { status: 'ok', rows: [{ id: 'whatsapp', label: 'WhatsApp', state: 'ok', pacing: 'below', compliance: 0.9, actual: 1000, forecastGapPct: -0.05 }] };
  q = AE.evaluate(i);
  const oc = q.route.all.find((o) => o.id === 'review_channel');
  ok('E2 el canal rezagado es una ruta candidata y su decisión habilitada está definida', Boolean(oc) && /Reasignar/.test(AE.STEPS.review_channel.decision) && q.route.others.length + q.route.moreOthers >= 2, [q.route.all.map((o) => o.id), q.route.moreOthers]);
  i = mk(); i.status.actions = { count: 1, open: 1, withoutMeasurement: 1 }; i.actions = [{ actionId: 'A1', title: 'Promo', status: 'in_progress', endDate: '2026-10-10' }];
  q = AE.evaluate(i);
  const fu = q.route.chain.steps.find((x) => x.id === 'follow_up');
  ok('E2 intervención con fecha futura: el seguimiento queda «en espera» con su fecha', q.route.primary.id === 'follow_up' && fu.state === 'waiting' && fu.waitingUntil === '2026-10-10', [q.route.primary.id, fu && fu.state]);
  ok('E2 estable: la ruta es solo monitorear', AE.evaluate(mk()).route.chain.steps.map((x) => x.id).join() === 'monitor');
}

// ===== Canales de contacto (WhatsApp, Llamadas): sin GA4, volumen = conversaciones / llamadas =====
{
  const mkc = (ch, o = {}) => { const i = under(mk()); i.channel = ch; i.summary.channel = ch; i.status.data.segments = 50000; i.segmentChannels = ['ecommerce', 'app']; i.status.visited = { diagnostico: true }; i.status.diagnostic = { visited: true, hypotheses: 2 };
    i.summary.whyPlan.drivers = [{ id: 'trafficVolume', label: 'Volumen', contribution: -25000, baseline: 3000, current: 2400, deltaPct: -0.2 }, { id: 'conversionRate', label: 'Conversión', contribution: -20000, baseline: 0.2, current: 0.17, deltaPct: -0.15 }, { id: 'aov', label: 'Ticket', contribution: -5000, baseline: 900, current: 880, deltaPct: -0.02 }];
    return Object.assign(i, o); };
  let q = AE.evaluate(mkc('whatsapp'));
  const tr = q.findings.find((f) => f.id === 'driver_traffic'), cr2 = q.findings.find((f) => f.id === 'driver_cr');
  ok('WA: el hallazgo de volumen habla de «conversaciones», no de sesiones, y no pide segmentos de GA4', Boolean(tr) && /conversaciones/.test(tr.title) && !/sesiones/i.test(tr.title) && tr.missing.length === 0 && !/GA4/.test(tr.missing.join()), tr && [tr.title, tr.missing]);
  ok('WA: el volumen se investiga en Pacing con ese canal (no en Tráfico y conversión/GA4) y la comprobación dice que GA4 aplica a Ecommerce y App', Boolean(tr) && tr.next.view === 'pacing' && tr.next.channel === 'whatsapp' && /GA4 aplica a Ecommerce y App/.test(tr.nextCheck), tr && [tr.next, tr.nextCheck]);
  ok('WA: la hipótesis de volumen menciona campaña, horario o evento y no fuente ni dispositivo', Boolean(tr) && /campaña|horario|evento/.test(tr.hypothesis) && !/dispositivo|fuente/.test(tr.hypothesis), tr && tr.hypothesis);
  ok('WA: la conversión es «de conversaciones a pedido» y no pide GA4', Boolean(cr2) && /conversaciones a pedido/.test(cr2.title) && cr2.missing.length === 0 && /tiempos de respuesta/.test(cr2.hypothesis), cr2 && [cr2.title, cr2.missing]);
  const st = q.route.all.find((x) => x.id === 'investigate_traffic');
  ok('WA: el paso trae resultado esperado y datos adaptados al canal (sin «segmentos de GA4»)', Boolean(st) && /conversaciones/.test(st.expected) && !/GA4/.test(st.needs.join()) && /Ya lo revisé/.test(st.exit), st && [st.expected, st.needs, st.exit]);
  q = AE.evaluate(mkc('llamadas'));
  ok('Llamadas: el volumen se llama «llamadas»', /llamadas/.test(q.findings.find((f) => f.id === 'driver_traffic').title));
  q = AE.evaluate(mkc('ecommerce'));
  ok('Ecommerce con GA4: sigue hablando de sesiones y manda a Tráfico y conversión', q.findings.find((f) => f.id === 'driver_traffic').next.view === 'segmentos' && /sesiones/.test(q.findings.find((f) => f.id === 'driver_traffic').title));
  q = AE.evaluate(mkc('ecommerce', { segmentChannels: ['app'] }));
  ok('Ecommerce sin GA4 propio (solo App lo tiene): se pide cargar segmentos de Ecommerce', q.findings.find((f) => f.id === 'driver_traffic').missing.length === 1 && q.findings.find((f) => f.id === 'driver_traffic').next.view === 'diagnostico');
  q = AE.evaluate(mkc('total'));
  ok('Total digital: usa GA4 si algún canal lo tiene', q.findings.find((f) => f.id === 'driver_traffic').next.view === 'segmentos');
  // un paso de juicio solo se completa si el usuario lo confirma
  let i = mkc('whatsapp'); q = AE.evaluate(i);
  const prim = q.route.primary.id;
  ok('Paso de juicio: sin confirmación sigue siendo el principal y no se completa solo', /^investigate_/.test(prim) && q.route.primary.state !== 'done', [prim, q.route.primary.state]);
  i = mkc('whatsapp', { progress: { [prim]: { at: '2026-09-23T10:00:00Z', reviewed: { at: '2026-09-23T10:05:00Z', note: 'campaña' } } } }); q = AE.evaluate(i);
  ok('Paso de juicio: con «Ya lo revisé» queda hecho y la ruta avanza a otro paso', q.route.all.find((x) => x.id === prim).state === 'done' && q.route.primary.id !== prim, [q.route.primary.id]);
}
console.log(`\nattention-engine: ${n - fails}/${n}`); process.exit(fails ? 1 : 0);
