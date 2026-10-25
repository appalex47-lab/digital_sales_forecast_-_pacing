/**
 * agentRunner.js — Fase 1 · Orquesta a un agente: detectores (código) → IA opcional que ordena y redacta → validación → resultado.
 *
 * Reglas que no se negocian (ARCHITECTURE.md · «Fase 1 · Panel de agentes»):
 *  - La IA NUNCA calcula: recibe candidatos con cifras ya calculadas y solo puede reordenarlos, ponerles prioridad/responsable y redactar
 *    título, resumen y siguiente pregunta. La evidencia, «qué vi» y limitaciones son siempre las del motor.
 *  - Sus textos pasan por la misma validación del asistente de Análisis (FP.cohereAnalysisAssistant.validateResponse): sin cifras que no
 *    estén en el contexto, sin lenguaje causal. Si no pasan (tras un reintento) se muestran los textos del motor.
 *  - Nunca se pierde un hallazgo: los que la IA no menciona se agregan al final con su texto del motor.
 *  - Sin IA (sin sesión, sin key, apagada o con error) el panel funciona igual con los textos del motor.
 * Fase 2: el mismo ejecutor sirve a dos agentes (Analista de Números y Auditor de Conversión). Cada uno aporta su `detect` (async) y sus reglas;
 *  la validación, la mezcla con los candidatos del motor y el respaldo sin IA son idénticos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};
  const PRIOS = ['Alta', 'Media', 'Baja'];
  const cache = new Map();   // clave del contexto → resultado ya validado (por sesión; evita repetir la llamada al reabrir el panel)

  const SYSTEM_RULES = [
    'Eres el Analista de Números de RevNavigator, una herramienta de pacing, plan y forecast de venta digital de una operación de ecommerce.',
    'Recibes «candidatos» que el motor ya calculó: cada uno trae sus cifras, su evidencia y un texto base. Tu trabajo es ORDENARLOS y REDACTARLOS mejor, nada más.',
    'Responde en español de México, claro y ejecutivo, para una persona de negocio que decide qué revisar primero.',
    'NO calcules, sumes, restes, promedies ni estimes. Usa SOLO cifras que aparezcan tal cual en el contexto (con el mismo formato). Si no hay cifra para algo, descríbelo sin número.',
    'No inventes canales, periodos, causas ni datos. No uses lenguaje causal («la causa es», «se debe a», «esto demuestra»). Describe qué pasó y dónde, no por qué.',
    'No hables de margen, costos, inventario ni promociones: la herramienta no tiene esos datos.',
    'Devuelve únicamente JSON con: hallazgos (lista) y lectura (una o dos frases con lo más importante).',
    'Cada hallazgo: id (uno de los candidatos), prioridad («Alta», «Media» o «Baja»), titulo (máx. 110 caracteres), resumen (máx. 260 caracteres), siguientePregunta (una pregunta concreta) y responsable (uno de la lista «responsables»).',
    'Ordena los hallazgos de más a menos importante para quien dirige el negocio. Puedes bajar la prioridad base si el hallazgo es menor, pero no inventes hallazgos nuevos ni repitas ids.'
  ].join('\n');

  const RESPONSE_SCHEMA = {
    type: 'object', required: ['hallazgos'],
    properties: {
      lectura: { type: 'string' },
      hallazgos: { type: 'array', items: { type: 'object', required: ['id', 'prioridad', 'titulo', 'resumen', 'siguientePregunta', 'responsable'],
        properties: { id: { type: 'string' }, prioridad: { type: 'string' }, titulo: { type: 'string' }, resumen: { type: 'string' }, siguientePregunta: { type: 'string' }, responsable: { type: 'string' } } } }
    }
  };

  const RULES_AUDITOR = [
    'Eres el Auditor de Conversión de RevNavigator, una herramienta de pacing, plan y forecast de venta digital de una operación de ecommerce.',
    'Recibes «candidatos» que el motor ya calculó sobre el embudo de GA4 por producto (vista, carrito, checkout, compra) y el tráfico: cada uno trae sus cifras, su evidencia y un texto base. Tu trabajo es ORDENARLOS y REDACTARLOS mejor, nada más.',
    'Responde en español de México, claro y ejecutivo, para una persona de negocio que decide qué ficha, paso o canal revisar primero.',
    'NO calcules, sumes, restes, promedies ni estimes. Usa SOLO cifras que aparezcan tal cual en el contexto (con el mismo formato). Si no hay cifra para algo, descríbelo sin número.',
    'No inventes productos, canales, periodos, causas ni datos. No uses lenguaje causal («la causa es», «se debe a», «esto demuestra»): lo que explicas son hipótesis a validar, no causas.',
    'No hables de rentabilidad, margen, costos, inventario, precios de la competencia, promociones ni descuentos: la herramienta no tiene esos datos y las ofertas son de otro asistente.',
    'El «potencial» o la «venta por recuperar» es un escenario ilustrativo; nunca lo presentes como pronóstico, meta o ganancia. Si un hallazgo marca «muestra limitada» o la confianza del dato es baja (GA4 no cuadra), dilo y no lo presentes como ranking firme.',
    'Devuelve únicamente JSON con: hallazgos (lista) y lectura (una o dos frases con lo más importante, empezando por la confianza del dato si no es buena).',
    'Cada hallazgo: id (uno de los candidatos), prioridad («Alta», «Media» o «Baja»), titulo (máx. 110 caracteres), resumen (máx. 260 caracteres), siguientePregunta (una pregunta concreta) y responsable (uno de la lista «responsables»).',
    'Ordena los hallazgos de más a menos importante. Puedes bajar la prioridad base si el hallazgo es menor, pero no inventes hallazgos nuevos ni repitas ids.'
  ].join('\n');
  const RULES_ARQUITECTO = [
    'Eres el Arquitecto de Ofertas de RevNavigator, una herramienta de pacing, plan y forecast de venta digital de una operación de ecommerce.',
    'Recibes «candidatos» que el motor ya calculó sobre las ofertas recibidas, las promociones, las metas por campaña, las oportunidades y los espacios de banner: cada uno trae sus cifras, su evidencia y un texto base. Tu trabajo es ORDENARLOS y REDACTARLOS mejor, nada más.',
    'Responde en español de México, claro y ejecutivo, para una persona de negocio que decide qué oferta, campaña o banner revisar primero.',
    'NO calcules, sumes, restes, promedies ni estimes. Usa SOLO cifras que aparezcan tal cual en el contexto (con el mismo formato). Si no hay cifra para algo, descríbelo sin número.',
    'No inventes SKU, campañas, fechas, descuentos, precios, causas ni datos. No uses lenguaje causal («la causa es», «se debe a», «esto demuestra»): lo que explicas son hipótesis a validar.',
    'No hables de margen, costos, rentabilidad ni inventario: la herramienta no tiene esos datos. No propongas un descuento ni un precio. Una meta es una cifra que decidió una persona: no digas si es buena o mala.',
    'El ritmo requerido es aritmética (lo que falta entre los días que quedan), no un pronóstico. Si un hallazgo marca «muestra limitada», dilo y no lo presentes como firme.',
    'Devuelve únicamente JSON con: hallazgos (lista) y lectura (una o dos frases con lo más importante).',
    'Cada hallazgo: id (uno de los candidatos), prioridad («Alta», «Media» o «Baja»), titulo (máx. 110 caracteres), resumen (máx. 260 caracteres), siguientePregunta (una pregunta concreta) y responsable (uno de la lista «responsables»).',
    'Ordena los hallazgos de más a menos importante. Puedes bajar la prioridad base si el hallazgo es menor, pero no inventes hallazgos nuevos ni repitas ids.'
  ].join('\n');
  const PURPOSE = { analista: 'Asistentes · Analista de Números', auditor: 'Asistentes · Auditor de Conversión', arquitecto: 'Asistentes · Arquitecto de Ofertas' };
  const RULES = { analista: SYSTEM_RULES, auditor: RULES_AUDITOR, arquitecto: RULES_ARQUITECTO };
  const ASK_RULES = [
    'Responde la pregunta de una persona de negocio usando ÚNICAMENTE los candidatos y cifras del contexto. No calcules, sumes ni estimes: usa las cifras tal cual aparecen.',
    'Si la pregunta no se puede contestar con el contexto, dilo con claridad y di qué vista de la app conviene abrir. No inventes causas ni datos; no uses lenguaje causal.',
    'No hables de rentabilidad, margen, costos, inventario ni precios de la competencia. Las promociones son del Arquitecto de Ofertas.',
    'Responde en español de México, en 2 a 5 frases. Devuelve JSON con: answer (texto) y nextQuestion (una pregunta concreta de seguimiento, opcional).'
  ].join('\n');
  const ASK_RULES_ARQ = [
    'Responde la pregunta de una persona de negocio usando ÚNICAMENTE los candidatos, el contexto y el apoyo del contexto. No calcules, sumes ni estimes: usa las cifras tal cual aparecen.',
    'Cuando una respuesta mezcle datos de Promociones con datos de Análisis o del embudo, usa los dos y cita entre paréntesis la fuente de cada cifra (por ejemplo «(Promociones)», «(Oportunidades)», «(Embudo)», «(Análisis)»), tal como vienen en el contexto.',
    'Si la pregunta no se puede contestar con el contexto, dilo con claridad y di qué vista de la app conviene abrir. No inventes causas ni datos; no uses lenguaje causal; si piden el porqué de un cambio, da la cifra y di que los datos no lo explican.',
    'No hables de rentabilidad, margen, costos ni inventario. No propongas descuentos ni precios.',
    'Responde en español de México, en 2 a 5 frases. Devuelve JSON con: answer (texto) y nextQuestion (una pregunta concreta de seguimiento, opcional).'
  ].join('\n');
  const askRulesFor = (agent) => (agent === 'arquitecto' ? ASK_RULES_ARQ : ASK_RULES);
  const ASK_SCHEMA = { type: 'object', required: ['answer'], properties: { answer: { type: 'string' }, nextQuestion: { type: 'string' } } };

  // El motor escribe los negativos con «−» (U+2212); el validador del asistente de Análisis solo reconoce el «-» ASCII como signo.
  // Se envía y se valida con «-» para que una cifra negativa que la IA repite tal cual no se rechace como «no presente en el contexto».
  const ascii = (s) => String(s == null ? '' : s).replace(/\u2212/g, '-');

  /**
   * Valores numéricos (con signo y escala) de las cifras escritas en un texto del motor: «−$200» → -200, «$4.6 M» → 4600000, «96.9%» → 96.9.
   * El validador compara las cifras de la IA contra los NÚMEROS del contexto, no contra el texto; sin esto, una IA que repite «$4.6 M» tal cual se rechazaría.
   */
  const SCALE = { millones: 1e6, 'millón': 1e6, millon: 1e6, M: 1e6, MM: 1e6, miles: 1e3, mil: 1e3, K: 1e3, k: 1e3 };
  function valuesIn(text) {
    const out = [], re = /([-\u2212])?\s?\$?\s?(\d[\d,]*(?:\.\d+)?)(\s?%)?(?:\s?(millones|millón|millon|miles|mil|MM|M|K|k)(?![\wáéíóúñ]))?/g;
    let m; const t = String(text == null ? '' : text);
    while ((m = re.exec(t))) { const v = Number(m[2].replace(/,/g, '')); if (!Number.isFinite(v)) continue; out.push((m[1] ? -1 : 1) * v * ((!m[3] && m[4]) ? SCALE[m[4]] : 1)); }
    return out;
  }

  /** Textos con cifras de una tarjeta (los que la IA puede citar): base + cifra grande, visual, tabla y acción de la Fase 2. */
  function cardTexts(f) {
    const v = f.visual, extra = [];
    if (f.tag) extra.push(f.tag);
    if (f.big) extra.push(f.big.value, f.big.sub);
    if (f.nota) extra.push(f.nota);
    if (f.accion) extra.push(f.accion);
    if (v && v.rows) v.rows.forEach((r) => { if (Array.isArray(r)) extra.push(...r); else extra.push(r.label, r.text, r.aText, r.bText); });
    return [f.title, f.resumen, f.que, ...f.evid.map((e) => e.v), ...extra.filter((x) => typeof x === 'string')];
  }
  /** Contexto que se envía a la IA: solo texto y cifras ya calculadas de los candidatos. Sin filas crudas ni datos personales. */
  function buildContext(det, owners, agent = 'analista') {
    const sheet = [det.contexto, det.apoyo].filter(Boolean);
    const gate = det.gate ? { nivel: det.gate.level, titulo: ascii(det.gate.title), texto: ascii(det.gate.text) } : null;
    return {
      alcance: agent === 'arquitecto'
        ? { ambito: 'Promociones, ofertas y metas por campaña', hoy: det.scope && det.scope.today || null, ultimaVentaReal: det.scope ? det.scope.lastActual : null, campanas: det.scope ? det.scope.campaigns : 0, ofertasRecibidas: det.scope ? det.scope.offers : 0, promociones: det.scope ? det.scope.promotions : 0 }
        : agent === 'auditor'
        ? { canal: `Embudo de GA4 por producto · ${det.scope && det.scope.channelLabel || 'Total digital'}`, periodo: det.scope && det.scope.period ? det.scope.period.key : null, tipoDePeriodo: det.scope && det.scope.period ? det.scope.period.type : null, hasta: det.scope ? det.scope.to || det.scope.lastActual : null }
        : { canal: det.scope && det.scope.channelLabel || 'Total digital', periodo: det.scope && det.scope.period ? det.scope.period.key : null, tipoDePeriodo: det.scope && det.scope.period ? det.scope.period.type : null, ultimaVentaReal: det.scope ? det.scope.lastActual : null },
      ...(gate ? { confianzaDelDato: gate } : {}),
      ...(det.contexto ? { contexto: det.contexto } : {}),
      ...(det.apoyo ? { apoyo: det.apoyo } : {}),
      ...(sheet.length ? { cifrasDeContexto: [...new Set(sheet.flatMap((x) => valuesIn(JSON.stringify(x))))] } : {}),
      responsables: owners,
      candidatos: det.findings.map((f) => ({
        id: f.id, scoreBase: Math.round(f.score), prioridadBase: f.prio, responsableBase: f.owner, titulo: ascii(f.title), resumen: ascii(f.resumen), queVi: ascii(f.que),
        evidencia: f.evid.map((e) => ascii(`${e.k}: ${e.v}`)), siguientePreguntaBase: ascii(f.pregunta), fuente: f.fuente,
        ...(f.muestraLimitada ? { muestraLimitada: true } : {}), ...(f.confianza === 'baja' ? { confianza: 'baja' } : {}),
        cifras: [...new Set([...cardTexts(f), ...(gate ? [det.gate.text] : [])].flatMap(valuesIn))]
      }))
    };
  }

  // ---------- Detección por agente (con caché por firma de datos) ----------
  const detCache = new Map();
  let sigIds = new WeakMap(), sigN = 0;
  const objId = (o) => { if (!o || typeof o !== 'object') return 0; if (!sigIds.has(o)) sigIds.set(o, ++sigN); return sigIds.get(o); };
  /** Firma barata de los datos de los que dependen los agentes: si no cambia, no se vuelve a leer IndexedDB. */
  /** Lo que la persona tiene elegido (canal y año/mes/semana): cambia el resultado, así que forma parte de la firma. */
  function selectionKey(state) {
    const A = FP.agents && FP.agents.analista; if (!A || !A.selection) return '';
    try { const x = A.selection(state); return `${x.channel}/${x.type}/${x.key}`; } catch (e) { return ''; }
  }
  /** Cambios en ofertas, promociones, metas y reglas de Activación (se editan en su lugar, así que se firman por tamaño e historial). */
  function promoSig(s) {
    const h = (x) => (x && x.history ? x.history.length : 0), sum = (a, f) => (a || []).reduce((t, x) => t + f(x), 0);
    try {
      return [s.of && s.of.reg ? `${(s.of.reg.offers || []).length}:${sum(s.of.reg.offers, h)}:${(s.of.reg.batches || []).length}` : '', s.pm && s.pm.reg ? `${(s.pm.reg.promotions || []).length}:${sum(s.pm.reg.promotions, (p) => h(p) + (p.skus || []).length + (p.evaluations || []).length)}` : '',
        s.cg && s.cg.reg ? `${(s.cg.reg.goals || []).length}:${sum(s.cg.reg.goals, h)}` : '', s.ac && s.ac.reg ? JSON.stringify(s.ac.reg.params) : '', objId(s.op && s.op.result)].join('~');
    } catch (e) { return ''; }
  }
  function signature(state) {
    const s = state || {}, m = (FP.productStore && FP.productStore.meta) || {}, q = s.quality && s.quality.totals ? s.quality.totals : {};
    return [promoSig(s), objId(s.fc && s.fc.run), s.fc && s.fc.lastActualDate, objId(s.store), m.batches, m.funnelBatches, m.dateMax, m.skus, q.warning, q.error, q.rejected, s.year, selectionKey(s)].join('|');
  }
  const DETECT = {
    analista: (state, deps) => (FP.agents.story ? FP.agents.story.build(state, { deps }) : Promise.resolve(FP.agents.analista.detect(state, deps))),
    auditor: (state, deps) => FP.agents.auditor.detect(state, { deps }),
    arquitecto: (state, deps) => FP.agents.arquitecto.detect(state, { deps })
  };
  /** Resultado determinista de un agente (sin IA). Nunca lanza. Cachea por firma de datos; `force` lo recalcula. */
  async function detect(agent, state, opts = {}) {
    const key = `${agent}|${signature(state)}`;
    if (!opts.force && !opts.deps && detCache.has(key)) return detCache.get(key);
    let det;
    try { det = await DETECT[agent](state, opts.deps); }
    catch (e) { det = { status: 'no_data', scope: null, findings: [], errors: [String(e && e.message || e)], detectors: 0 }; }
    if (!opts.deps && det.status !== 'no_data') { if (detCache.size > 12) detCache.delete(detCache.keys().next().value); detCache.set(key, det); }
    return det;
  }
  const keyOf = (ctx) => { const s = JSON.stringify(ctx); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return `${s.length}:${h}`; };

  /** Revisa lo que devolvió la IA. Devuelve { ok, errors, items } con items = hallazgos válidos (ids reales, prioridad y responsable de la lista). */
  function validate(parsed, ctx, owners) {
    if (!parsed || !Array.isArray(parsed.hallazgos) || !parsed.hallazgos.length) return { ok: false, errors: ['La IA no devolvió hallazgos.'], items: [] };
    const ids = new Set(ctx.candidatos.map((c) => c.id)), seen = new Set(), items = [];
    parsed.hallazgos.forEach((h) => {
      if (!h || !ids.has(h.id) || seen.has(h.id)) return;
      seen.add(h.id);
      items.push({ id: h.id, prio: PRIOS.includes(h.prioridad) ? h.prioridad : null, owner: owners.includes(h.responsable) ? h.responsable : null,
        title: String(h.titulo || '').trim(), resumen: String(h.resumen || '').trim(), pregunta: String(h.siguientePregunta || '').trim() });
    });
    if (!items.length) return { ok: false, errors: ['La IA devolvió ids que no existen.'], items: [] };
    // Mismo filtro del asistente de Análisis: ninguna cifra que no esté en el contexto, ni lenguaje causal ni dirección contradictoria.
    const text = ascii([parsed.lectura || '', ...items.map((i) => `${i.title}. ${i.resumen}. ${i.pregunta}`)].join('\n'));
    const v = FP.cohereAnalysisAssistant ? FP.cohereAnalysisAssistant.validateResponse({ answer: text, evidence: [] }, ctx) : { ok: true, errors: [] };
    return v.ok ? { ok: true, errors: [], items, lectura: String(parsed.lectura || '').trim() } : { ok: false, errors: v.errors, items: [] };
  }

  /** Une lo que dijo la IA con los candidatos del motor. Lo que la IA no menciona va al final con su texto base. */
  function merge(det, items, lectura) {
    const byId = new Map(det.findings.map((f) => [f.id, f])), used = new Set(), out = [];
    items.forEach((it) => {
      const base = byId.get(it.id); used.add(it.id);
      out.push({ ...base, prio: it.prio || base.prio, owner: it.owner || base.owner, title: it.title || base.title, resumen: it.resumen || base.resumen, pregunta: it.pregunta || base.pregunta, ai: true });
    });
    det.findings.forEach((f) => { if (!used.has(f.id)) out.push({ ...f, ai: false }); });
    return { findings: out, lectura: lectura || '' };
  }

  async function callAI(ctx, opts) {
    const owners = ctx.responsables, user = JSON.stringify(ctx, null, 2), agent = opts.agent || 'analista';
    const call = async (extra) => {
      const r = await FP.cohereClient.chatJson({ audit: { purpose: PURPOSE[agent] }, system: RULES[agent], user: extra ? `${user}\n\n${extra}` : user, schema: RESPONSE_SCHEMA, apiKey: opts.apiKey, model: opts.model, fetchImpl: opts.fetchImpl });
      if (!r.ok) return { fail: { status: r.status || 'unavailable', errors: r.errors || ['No se pudo consultar la IA.'], errorKind: r.errorKind || null } };
      const p = FP.cohereClient.parseJson(r.text);
      if (!p.ok) return { fail: { status: 'invalid', errors: ['La IA respondió en un formato no válido.'] } };
      return { r, v: validate(p.value, ctx, owners) };
    };
    let t = await call(null); if (t.fail) return t.fail;
    if (!t.v.ok && /cifras|subida|causal/.test(t.v.errors[0] || '')) {
      const t2 = await call(`Tu respuesta anterior fue rechazada: ${t.v.errors.join(' ')} Responde de nuevo usando ÚNICAMENTE cifras que aparezcan tal cual en el contexto, sin calcular nada y sin lenguaje causal.`);
      if (t2.fail) return t2.fail; t = t2;
    }
    return t.v.ok ? { status: 'ok', items: t.v.items, lectura: t.v.lectura, model: t.r.model } : { status: 'rejected', errors: t.v.errors };
  }

  const aiOn = (state) => !!(FP.cohereConnection && FP.cohereConnection.isConfigured() && !(state && state.settings && state.settings.enableAI === false));

  /**
   * Resultado completo de un agente. Nunca lanza.
   * @param {object} opts { agent: 'analista'|'auditor' (por defecto analista), useAI, force, deps, fetchImpl }
   * @returns {Promise<{status, scope, findings, lectura, detectors, errors, ai:{status, model?, errors?}, ...extras del agente (gate, headline, kpis, route)}>}
   *   status: 'ok' | 'no_data' | 'sin_embudo' | 'sin_mes'; ai.status: 'off' (sin IA configurada o apagada) | 'ok' | 'none' (sin hallazgos que redactar) | 'unavailable' | 'invalid' | 'rejected'
   */
  async function run(state, opts = {}) {
    const agent = ['auditor', 'arquitecto'].includes(opts.agent) ? opts.agent : 'analista';
    const det = await detect(agent, state, { deps: opts.deps, force: !!opts.force });
    const { findings: _f, sections: _s, ...extras } = det;
    const base = { ...extras, status: det.status, scope: det.scope, detectors: det.detectors, errors: det.errors || [], lectura: '', agent };
    if (det.status !== 'ok' || !det.findings.length) return { ...base, findings: [], ai: { status: 'none' } };
    const det0 = { ...base, findings: det.findings.map((f) => ({ ...f, ai: false })) };
    if (opts.useAI === false || !aiOn(state)) return { ...det0, ai: { status: 'off' } };
    const ctx = buildContext(det, FP.agents.analista.OWNERS, agent), key = `${agent}|${keyOf(ctx)}`;
    if (!opts.force && cache.has(key)) return cache.get(key);
    let r;
    try { r = await callAI(ctx, { agent, apiKey: state.dx && state.dx.apiKey, model: state.dx && state.dx.model, fetchImpl: opts.fetchImpl }); }
    catch (e) { r = { status: 'unavailable', errors: [String(e && e.message || e)] }; }
    if (r.status !== 'ok') return { ...det0, ai: { status: r.status, errors: r.errors || [], errorKind: r.errorKind || null } };
    const m = merge(det, r.items, r.lectura);
    const out = { ...base, findings: m.findings, lectura: m.lectura, ai: { status: 'ok', model: r.model } };
    cache.set(key, out);
    return out;
  }

  // ---------- Pregunta libre: a quién le toca ----------
  const NORM = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /**
   * Antes de gastar una llamada de IA: ¿esta pregunta es de otro asistente o de algo que la herramienta no tiene?
   * Devuelve { type: 'refuse'|'handoff', to?, text } o null si el agente actual puede intentar contestarla.
   */
  function routeQuestion(agent, q) {
    const s = NORM(q);
    if (/rentab|margen|ganancia|utilidad|costo|profit|cuanto gano|cuanto pierdo dinero/.test(s)) return { type: 'refuse', text: 'La herramienta no tiene costos ni margen, así que no puedo hablar de rentabilidad ni de ganancia. Solo hablo de venta, pedidos, ticket, unidades y conversión.' };
    if (agent !== 'arquitecto' && /promoci|oferta|descuent|cupon|rebaja|2x1|bundle|banner|campan|buen fin|meta de la|precio de la competencia|competencia/.test(s)) return { type: 'handoff', to: 'arquitecto', text: 'Las promociones, ofertas, banners y metas por campaña las ve el Arquitecto de Ofertas. Aquí puedo decirte qué se mueve en la venta y dónde se queda la conversión, sin hablar de descuentos.' };
    if (agent === 'arquitecto' && /precio de la competencia|competencia|inventario|stock|existencia/.test(s)) return { type: 'refuse', text: 'La herramienta no tiene inventario ni precios de la competencia, así que no puedo responder eso. Puedo decirte qué ofertas, campañas y metas tienes y cómo van.' };
    if (agent === 'analista' && /embudo|ficha|carrito|checkout|ga4|vistas? de|conversion de (la )?(ficha|producto)|por producto/.test(s)) return { type: 'handoff', to: 'auditor', text: 'Eso es del embudo por producto: el Auditor de Conversión lo ve mejor (fichas, carrito, checkout y brecha web contra app).' };
    if (agent === 'auditor' && /\b(plan|meta|forecast|pronostico|pacing|cumplimiento|cierre del mes)\b/.test(s)) return { type: 'handoff', to: 'analista', text: 'Eso es del plan, la meta y el forecast: el Analista de Números lo ve mejor.' };
    return null;
  }

  /**
   * Responde una pregunta con lo que el motor ya calculó del agente (candidatos, gate y cifras). La respuesta se valida igual que el resto:
   * sin cifras que no estén en el contexto y sin lenguaje causal. Nunca lanza.
   * @returns {Promise<{ok, local?, answer, nextQuestion?, to?, errors?}>}
   */
  async function ask(agent, question, state, opts = {}) {
    const q = String(question || '').trim();
    if (!q) return { ok: false, errors: ['Escribe una pregunta.'] };
    const route = routeQuestion(agent, q);
    if (route) return { ok: true, local: true, answer: route.text, to: route.to || null, type: route.type };
    if (!aiOn(state)) return { ok: false, errors: ['Para preguntar necesito la IA conectada (Configuración → IA).'] };
    const det0 = await detect(agent, state, { deps: opts.deps });
    if (det0.status !== 'ok') return { ok: false, errors: [agent === 'arquitecto' ? 'Todavía no hay ofertas ni promociones registradas para responder (créalas en Promociones).' : 'Todavía no hay datos suficientes para responder (carga plan y venta, o el embudo de productos).'] };
    let det = det0;
    if (agent === 'arquitecto') {   // apoyo: lo que ya calcularon el Auditor (embudo) y el Analista (análisis), cada cifra con su fuente
      const apoyo = [];
      for (const [id, label] of [['auditor', 'Embudo (Auditor de Conversión)'], ['analista', 'Análisis (Analista de Números)']]) {
        try { const x = await detect(id, state, { deps: opts.deps }); if (x.status === 'ok' && x.findings.length) apoyo.push({ fuente: label, hallazgos: x.findings.slice(0, 3).map((f) => ({ titulo: ascii(f.title), resumen: ascii(f.resumen), evidencia: f.evid.map((e) => ascii(`${e.k}: ${e.v}`)) })) }); } catch (e) { /* sin apoyo de ese agente */ }
      }
      det = { ...det0, apoyo };
    }
    const ctx = { pregunta: q, ...buildContext(det, FP.agents.analista.OWNERS, agent) };
    const user = JSON.stringify(ctx, null, 2);
    const call = async (extra) => {
      const r = await FP.cohereClient.chatJson({ audit: { purpose: `${PURPOSE[agent]} · pregunta` }, system: askRulesFor(agent), user: extra ? `${user}\n\n${extra}` : user, schema: ASK_SCHEMA, apiKey: state.dx && state.dx.apiKey, model: state.dx && state.dx.model, fetchImpl: opts.fetchImpl });
      if (!r.ok) return { fail: { ok: false, errors: r.errors || ['No se pudo consultar la IA.'] } };
      const p = FP.cohereClient.parseJson(r.text);
      if (!p.ok || !p.value || typeof p.value.answer !== 'string') return { fail: { ok: false, errors: ['La IA respondió en un formato no válido.'] } };
      const v = FP.cohereAnalysisAssistant ? FP.cohereAnalysisAssistant.validateResponse({ answer: ascii(`${p.value.answer}\n${p.value.nextQuestion || ''}`), evidence: [] }, ctx) : { ok: true, errors: [] };
      return { p: p.value, v };
    };
    let t = await call(null); if (t.fail) return t.fail;
    if (!t.v.ok && /cifras|subida|causal/.test(t.v.errors[0] || '')) {
      const t2 = await call(`Tu respuesta anterior fue rechazada: ${t.v.errors.join(' ')} Responde de nuevo usando ÚNICAMENTE cifras que aparezcan tal cual en el contexto, sin calcular nada y sin lenguaje causal.`);
      if (t2.fail) return t2.fail; t = t2;
    }
    if (!t.v.ok) return { ok: false, errors: ['La respuesta de la IA no coincide con las cifras del motor y se descartó.'] };
    return { ok: true, answer: String(t.p.answer).trim(), nextQuestion: String(t.p.nextQuestion || '').trim() };
  }

  FP.agents.runner = { run, detect, ask, routeQuestion, signature, buildContext, validate, merge, SYSTEM_RULES, RULES, ASK_RULES, ASK_RULES_ARQ, RESPONSE_SCHEMA, clearCache: () => { cache.clear(); detCache.clear(); }, selectionKey };
})(typeof window !== 'undefined' ? window : globalThis);
