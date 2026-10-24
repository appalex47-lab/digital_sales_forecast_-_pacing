// Pruebas de la Fase 1 · Asistentes (Analista de Números): detectores, ejecutor con IA simulada y reglas de seguridad.
// Uso: node tools/test-agents.js        (estado sintético y motores simulados: no depende de los datos de demo)
global.window = global; global.FP = {};
['js/config/config.js', 'js/ai/cohereClient.js', 'js/ai/cohereAnalysisAssistant.js', 'js/agents/analistaDetectors.js', 'js/agents/agentRunner.js', 'js/agents/agentLauncher.js'].forEach((f) => require('../' + f));
let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 400) : ''); } };

const rv = (plan, actual) => ({ plan, actual, gap: actual - plan, gapPct: (actual - plan) / plan, compliance: actual / plan });
const month = (plan, actual, fcPct = 0) => ({ key: '2026-09', countedDays: 22, plan: { revenue: plan }, toDate: { revenue: rv(plan, actual) }, forecastGap: { revenue: { gapPct: fcPct } } });
const mkState = (chs, extra = {}) => {
  const tot = Object.values(chs).reduce((s, c) => ({ p: s.p + c[0], a: s.a + c[1] }), { p: 0, a: 0 });
  const channels = {}; Object.entries(chs).forEach(([id, c]) => { channels[id] = { months: [month(c[0], c[1])] }; });
  return Object.assign({ fc: { lastActualDate: '2026-09-22', run: { plan: { source: 'file' }, total: { months: [month(tot.p, tot.a)] }, channels } }, quality: { totals: {} }, settings: {}, dx: {} }, extra);
};
const dep = (o = {}) => ({
  home: Object.assign({ goal: () => null, whyPlan: () => null, why: () => null, excluded: () => ({ days: 0, revenue: 0 }) }, o.home),
  advisor: Object.assign({ advise: () => null }, o.advisor)
});
const A = FP.agents.analista, R = FP.agents.runner;

// ---- sin datos ----
ok('A1 sin forecast calculado → no_data', A.detect({}, dep()).status === 'no_data');
ok('A2 sin plan (source none) → no_data', A.detect({ fc: { lastActualDate: '2026-09-22', run: { plan: { source: 'none' }, total: {}, channels: {} } } }, dep()).status === 'no_data');
ok('A3 sin venta real → no_data', A.detect({ fc: { run: { plan: { source: 'file' }, total: { months: [] }, channels: {} } } }, dep()).status === 'no_data');

// ---- en plan: nada que reportar ----
{ const r = A.detect(mkState({ ecommerce: [1000, 1005], app: [500, 498], llamadas: [200, 199] }), dep());
  ok('B1 todo en plan → status ok, 0 hallazgos', r.status === 'ok' && r.findings.length === 0 && r.errors.length === 0, r); }

// ---- brecha concentrada ----
{ const st = mkState({ ecommerce: [1000, 1000], app: [500, 500], llamadas: [300, 100] });
  const r = A.detect(st, dep());
  const f = r.findings.find((x) => x.id === 'brecha_concentrada');
  ok('C1 detecta brecha concentrada en Llamadas', !!f && /Llamadas/.test(f.title) && f.owner === 'Contact center', r.findings.map((x) => x.id));
  ok('C2 candidato completo (campos que usa el panel)', f && ['id', 'detector', 'agent', 'score', 'prio', 'owner', 'title', 'resumen', 'que', 'pregunta', 'limites', 'fuente', 'view', 'viewLabel'].every((k) => f[k] !== undefined && f[k] !== '') && Array.isArray(f.evid) && f.evid.length >= 3, f);
  ok('C3 evidencia con k y v de texto', f.evid.every((e) => typeof e.k === 'string' && typeof e.v === 'string' && e.v.length));
  ok('C4 owner del catálogo conocido', A.OWNERS.includes(f.owner));
  ok('C5 cifras del texto vienen del motor ($ y %)', /83\.3%/.test(f.resumen) || /\$/.test(f.resumen), f.resumen);
  ok('C6 prio coherente con score', (f.score >= 70 ? 'Alta' : f.score >= 40 ? 'Media' : 'Baja') === f.prio);
  ok('C7 no afirma causas', !/(se debe a|la causa es|esto demuestra)/i.test(JSON.stringify(f)), f);
  // brecha repartida: ningún canal ≥60% → no se reporta
  const r2 = A.detect(mkState({ ecommerce: [1000, 940], app: [500, 470], llamadas: [300, 282] }), dep());
  ok('C8 brecha repartida entre canales → sin hallazgo de concentración', !r2.findings.some((x) => x.id === 'brecha_concentrada'), r2.findings.map((x) => x.id));
}

// ---- canales bajo su plan aunque el total vaya arriba (caso octubre: Ecommerce y WhatsApp caen, Llamadas compensa) ----
{ const st = mkState({ ecommerce: [1000, 950], whatsapp: [400, 360], llamadas: [300, 450], app: [500, 500] });
  const r = A.detect(st, dep());
  const f = r.findings.find((x) => x.id === 'canales_bajo_plan');
  ok('C9 total arriba del plan pero Ecommerce y WhatsApp bajo su plan → los reporta en «Se cae»', !!f && f.section === 'cae' && /Ecommerce/.test(f.title) && /WhatsApp/.test(f.title) && !/Llamadas/.test(f.title), r.findings.map((x) => [x.id, x.title]));
  ok('C9b no se reporta como concentración (el total no está bajo el plan)', !r.findings.some((x) => x.id === 'brecha_concentrada'));
  ok('C9c evidencia con plan/real y contra su plan de cada canal, y el total', f && ['Ecommerce: plan / real', 'WhatsApp vs su plan', 'Total contra el plan a la fecha de corte'].every((k) => f.evid.some((e) => e.k === k)), f && f.evid);
  ok('C9d con el total arriba del plan no sube a prioridad Alta', f && f.prio !== 'Alta' && f.score <= 69, f && [f.score, f.prio]);
  ok('C9e no afirma causas ni habla de margen (salvo el límite que aclara que no lo ve)', f && !/(se debe a|la causa es|esto demuestra|margen|ganancia)/i.test(JSON.stringify({ ...f, limites: '' })), f);
  // canal levemente abajo (<1 % de su plan) → ruido, no se reporta
  const r2 = A.detect(mkState({ ecommerce: [1000, 995], llamadas: [300, 330] }), dep());
  ok('C9f un canal apenas abajo de su plan (<1 %) no es hallazgo', !r2.findings.some((x) => x.id === 'canales_bajo_plan'), r2.findings.map((x) => x.id));
  // si D1 ya concentra la brecha, no se duplica
  const r3 = A.detect(mkState({ ecommerce: [1000, 1000], app: [500, 500], llamadas: [300, 100] }), dep());
  ok('C9g si ya sale «brecha concentrada» no se repite como canales bajo su plan', r3.findings.some((x) => x.id === 'brecha_concentrada') && !r3.findings.some((x) => x.id === 'canales_bajo_plan'), r3.findings.map((x) => x.id));
  // todo en plan → nada
  const r4 = A.detect(mkState({ ecommerce: [1000, 1005], app: [500, 498] }), dep());
  ok('C9h todo en plan → ningún canal bajo su plan', !r4.findings.some((x) => x.id === 'canales_bajo_plan'));
}

// ---- meta, drivers, contradicción, forecast, datos ----
{ const d = dep({
    home: {
      goal: () => ({ status: 'not_reached', attainment: 0.93, goal: 30e6, cumulative: 27.9e6 }),
      whyPlan: () => ({ status: 'ok', gap: -2e6, gapPct: -0.05, effects: { traffic: -1.5e6, cr: -1.0e6, aov: 0.5e6 } }),
      why: () => ({ status: 'ok', delta: 1e6, effects: { traffic: 0.2e6, cr: 0.1e6, aov: 0.7e6 } }),
      excluded: () => ({ days: 2, revenue: 400000 })
    },
    advisor: { advise: () => ({ range: { spreadPct: 0.04, min: 100e6, max: 104e6, minMethod: 'B', maxMethod: 'A' }, suggestion: { current: 'A', method: 'B' } }) }
  });
  const st = mkState({ ecommerce: [1000, 900], app: [500, 450] }, { quality: { totals: { warning: 2 } } });
  const r = A.detect(st, d); const ids = r.findings.map((x) => x.id);
  ['meta_en_riesgo', 'driver_dominante', 'contradiccion_capas', 'forecast_divergente', 'datos_distorsionan'].forEach((id) => ok(`D1 detecta ${id}`, ids.includes(id), ids));
  ok('D2 ordenados de mayor a menor score', r.findings.every((f, i, a) => !i || a[i - 1].score >= f.score));
  ok('D3 ids únicos', new Set(ids).size === ids.length);
  ok('D4 contradicción trae traspaso al Auditor', !!r.findings.find((x) => x.id === 'contradiccion_capas').handoff && r.findings.find((x) => x.id === 'contradiccion_capas').handoff.to === 'auditor');
  ok('D5 el traspaso apunta a un agente del registro', !!FP.agents.registry.AGENTS[r.findings.find((x) => x.id === 'contradiccion_capas').handoff.to]);
  ok('D6 driver dominante = tráfico', /tráfico/.test(r.findings.find((x) => x.id === 'driver_dominante').title));
  ok('D7 meta en riesgo menciona 93.0%', /93\.0%/.test(r.findings.find((x) => x.id === 'meta_en_riesgo').title));
  ok('D8 días excluidos aparecen en datos', /2 día/.test(r.findings.find((x) => x.id === 'datos_distorsionan').resumen));
  ok('D9 todos los detectores reportados en la corrida', r.detectors === A.DETECTOR_COUNT);
}

// ---- un detector que falla no tumba al resto ----
{ const d = dep({ home: { goal: () => { throw new Error('boom'); }, excluded: () => ({ days: 3, revenue: 10 }) } });
  const st1 = mkState({ ecommerce: [1000, 1000], llamadas: [300, 100] }); Object.defineProperty(st1, 'quality', { get() { throw new Error('boom'); } });
  const r = A.detect(st1, d);
  ok('E1 detector que lanza se omite y se reporta', r.status === 'ok' && r.errors.some((e) => /boom/.test(e)) && r.findings.some((x) => x.id === 'brecha_concentrada'), r);
  const r2 = A.detect(mkState({ ecommerce: [1000, 1000], llamadas: [300, 100] }), { home: null, advisor: null });
  ok('E2 sin motores: no lanza', r2.status === 'ok', r2); }

// ---- ejecutor con IA simulada ----
const baseState = () => mkState({ ecommerce: [1000, 1000], app: [500, 500], llamadas: [300, 100] }, { quality: { totals: { warning: 2 } } });
const D = dep({ home: { excluded: () => ({ days: 2, revenue: 400000 }) } });
FP.cohereConnection = { isConfigured: () => true };
let calls = 0, reply = null;
FP.cohereClient.chatJson = async () => { calls++; return typeof reply === 'function' ? reply() : reply; };
const ai = (obj) => ({ ok: true, text: JSON.stringify(obj), model: 'test' });
const det = A.detect(baseState(), D), idList = det.findings.map((f) => f.id);

(async () => {
  // sin IA configurada
  FP.cohereConnection = { isConfigured: () => false };
  let r = await R.run(baseState(), { deps: D });
  ok('F1 sin IA → ai off, hallazgos del motor, 0 llamadas', r.ai.status === 'off' && r.findings.length === idList.length && calls === 0, { ai: r.ai, calls });
  ok('F2 sin IA los textos son los del motor', r.findings.every((f) => f.ai === false));
  // IA apagada en Configuración
  FP.cohereConnection = { isConfigured: () => true };
  r = await R.run(Object.assign(baseState(), { settings: { enableAI: false } }), { deps: D });
  ok('F3 enableAI=false → no llama a la IA', r.ai.status === 'off' && calls === 0);
  // respuesta válida: reordena y redacta, usando solo cifras del contexto
  R.clearCache();
  const second = det.findings[1].id, first = det.findings[0].id;
  reply = () => ai({ lectura: 'Revisa primero la brecha por canal.', hallazgos: [{ id: second, prioridad: 'Alta', titulo: 'Revisa esto primero', resumen: det.findings[1].resumen, siguientePregunta: '¿Qué canal puede recuperar más?', responsable: 'Ecommerce' }] });
  r = await R.run(baseState(), { deps: D });
  ok('G1 IA válida → ai ok y 1 llamada', r.ai.status === 'ok' && calls === 1, { ai: r.ai, calls, errors: r.errors });
  ok('G2 lo que la IA menciona va primero y lo demás se conserva (nunca se pierde un hallazgo)', r.findings[0].id === second && r.findings.length === idList.length && r.findings.some((f) => f.id === first), r.findings.map((f) => f.id));
  ok('G3 prioridad/título redactados por la IA, evidencia del motor', r.findings[0].prio === 'Alta' && r.findings[0].title === 'Revisa esto primero' && r.findings[0].ai === true && r.findings[0].evid.length === det.findings[1].evid.length);
  ok('G4 los no mencionados mantienen texto del motor', r.findings.filter((f) => f.id !== second).every((f) => f.ai === false));
  ok('G5 hay lectura de la IA', /brecha por canal/.test(r.lectura));
  // caché: misma entrada, sin nueva llamada
  const c0 = calls; await R.run(baseState(), { deps: D });
  ok('G6 misma entrada → usa caché, no vuelve a llamar', calls === c0);
  const c1 = calls; await R.run(baseState(), { deps: D, force: true });
  ok('G7 force=true vuelve a llamar', calls === c1 + 1);
  // cifra inventada → rechazo (y un reintento) → textos del motor
  R.clearCache(); calls = 0;
  reply = () => ai({ lectura: '', hallazgos: [{ id: first, prioridad: 'Alta', titulo: 'Llamadas cae 77.7% contra el plan', resumen: 'Pérdida de $9.9 M.', siguientePregunta: '¿Y ahora?', responsable: 'Contact center' }] });
  r = await R.run(baseState(), { deps: D });
  ok('H1 cifra inventada → rechazada, se muestran textos del motor', r.ai.status === 'rejected' && r.findings.length === idList.length && r.findings.every((f) => f.ai === false) && !/77\.7/.test(JSON.stringify(r.findings)), { ai: r.ai });
  ok('H2 un solo reintento (2 llamadas)', calls === 2, calls);
  // lenguaje causal
  R.clearCache();
  reply = () => ai({ hallazgos: [{ id: first, prioridad: 'Alta', titulo: 'La causa es el precio', resumen: 'Esto demuestra que bajó por competencia.', siguientePregunta: '¿?', responsable: 'Comercial' }] });
  r = await R.run(baseState(), { deps: D });
  ok('H3 lenguaje causal → rechazado', r.ai.status === 'rejected' && r.findings.every((f) => f.ai === false), r.ai);
  // ids inventados
  R.clearCache();
  reply = () => ai({ hallazgos: [{ id: 'inventado', prioridad: 'Alta', titulo: 'x', resumen: 'y', siguientePregunta: 'z', responsable: 'Comercial' }] });
  r = await R.run(baseState(), { deps: D });
  ok('H4 ids que no existen → se descartan, no se agregan hallazgos', r.ai.status === 'rejected' && r.findings.length === idList.length && !r.findings.some((f) => f.id === 'inventado'), r.ai);
  // responsable/prioridad fuera de catálogo se corrigen con los del motor
  R.clearCache();
  reply = () => ai({ hallazgos: [{ id: first, prioridad: 'Urgentísima', titulo: det.findings[0].title, resumen: det.findings[0].resumen, siguientePregunta: det.findings[0].pregunta, responsable: 'Dirección General' }] });
  r = await R.run(baseState(), { deps: D });
  const f0 = r.findings.find((f) => f.id === first);
  ok('H5 prioridad y responsable inválidos → conserva los del motor', r.ai.status === 'ok' && f0.prio === det.findings[0].prio && f0.owner === det.findings[0].owner, { prio: f0.prio, owner: f0.owner, ai: r.ai, errs: r.errors });
  // la IA repite cifras en millones y negativos tal cual las escribió el motor: debe pasar
  R.clearCache();
  const big = () => mkState({ ecommerce: [100e6, 100e6], app: [50e6, 50e6], llamadas: [30e6, 10e6] });
  const detB = A.detect(big(), D), fb = detB.findings[0];
  reply = () => ai({ hallazgos: [{ id: fb.id, prioridad: 'Alta', titulo: fb.title, resumen: fb.resumen, siguientePregunta: fb.pregunta, responsable: fb.owner }] });
  r = await R.run(big(), { deps: D });
  ok('G8 la IA repite «$20.0 M», «−$20.0 M» y porcentajes del motor → válido', /M/.test(fb.resumen) && r.ai.status === 'ok' && r.findings[0].ai === true, { ai: r.ai, resumen: fb.resumen });
  R.clearCache();
  reply = () => ai({ hallazgos: [{ id: fb.id, prioridad: 'Alta', titulo: fb.title, resumen: fb.resumen.replace('20.0 M', '25.0 M'), siguientePregunta: fb.pregunta, responsable: fb.owner }] });
  r = await R.run(big(), { deps: D });
  ok('G9 una cifra en millones distinta a las del motor → rechazada', r.ai.status === 'rejected', { ai: r.ai, resumen: fb.resumen });
  // falla de red/IA
  R.clearCache();
  reply = () => ({ ok: false, status: 'network', errors: ['sin red'] });
  r = await R.run(baseState(), { deps: D });
  ok('I1 IA caída → ai no ok, hallazgos del motor intactos', r.ai.status === 'network' && r.findings.length === idList.length && r.findings.every((f) => f.ai === false), r.ai);
  reply = () => { throw new Error('explotó'); };
  R.clearCache(); r = await R.run(baseState(), { deps: D });
  ok('I2 excepción en la IA → no lanza, hallazgos del motor', r.ai.status === 'unavailable' && r.findings.length === idList.length, r.ai);
  reply = () => ({ ok: true, text: 'esto no es json', model: 't' }); R.clearCache(); r = await R.run(baseState(), { deps: D });
  ok('I3 respuesta que no es JSON → formato inválido, motor intacto', r.ai.status === 'invalid' && r.findings.length === idList.length, r.ai);
  // sin hallazgos / sin datos: no llama a la IA
  calls = 0; R.clearCache();
  r = await R.run(mkState({ ecommerce: [1000, 1000] }), { deps: dep() });
  ok('J1 nada que reportar → sin llamada a IA', r.status === 'ok' && r.findings.length === 0 && calls === 0 && r.ai.status === 'none', { calls, ai: r.ai });
  r = await R.run({}, { deps: dep() });
  ok('J2 sin datos → no_data, sin llamada a IA', r.status === 'no_data' && calls === 0);
  // el contexto que se envía no lleva datos crudos
  let sent = null; FP.cohereClient.chatJson = async (o) => { sent = o; return { ok: false, status: 'x', errors: [] }; };
  R.clearCache(); await R.run(baseState(), { deps: D });
  ok('K1 el contexto a la IA solo trae candidatos ya calculados', sent && /candidatos/.test(sent.user) && !/"rows"|"sku"|email/i.test(sent.user) && sent.audit && /Analista/.test(sent.audit.purpose), sent && sent.user.slice(0, 200));
  ok('K2 las reglas prohíben calcular y hablar de margen', /NO calcules/.test(R.SYSTEM_RULES) && /margen/.test(R.SYSTEM_RULES));

  // ---- registro de agentes ----
  const reg = FP.agents.registry;
  ok('L1 Analista y Auditor disponibles (Fase 2); Arquitecto «próximamente»', reg.AGENTS.analista.available && reg.AGENTS.auditor.available && !reg.AGENTS.arquitecto.available);
  ok('L2 vista de segmentos y de producto abren el Auditor; ofertas cae en el Analista mientras no exista el Arquitecto', reg.defaultAgent('segmentos') === 'auditor' && reg.defaultAgent('producto') === 'auditor' && reg.suggestedAgent('recovery') === 'arquitecto' && reg.defaultAgent('recovery') === 'analista');
  ok('L3 vista cualquiera → Analista', reg.defaultAgent('pacing') === 'analista' && reg.defaultAgent('inicio') === 'analista');

  console.log(fails ? `\n✘ ${fails} de ${n} pruebas fallaron` : `✔ ${n}/${n} pruebas de asistentes`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✘ excepción en la prueba:', e); process.exit(1); });
