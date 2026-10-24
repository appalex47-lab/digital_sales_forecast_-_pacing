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

  /** Contexto que se envía a la IA: solo texto y cifras ya calculadas de los candidatos. Sin filas crudas ni datos personales. */
  function buildContext(det, owners) {
    return {
      alcance: { canal: 'Total digital', periodo: det.scope && det.scope.period ? det.scope.period.key : null, ultimaVentaReal: det.scope ? det.scope.lastActual : null },
      responsables: owners,
      candidatos: det.findings.map((f) => ({
        id: f.id, scoreBase: Math.round(f.score), prioridadBase: f.prio, responsableBase: f.owner, titulo: ascii(f.title), resumen: ascii(f.resumen), queVi: ascii(f.que),
        evidencia: f.evid.map((e) => ascii(`${e.k}: ${e.v}`)), siguientePreguntaBase: ascii(f.pregunta), fuente: f.fuente,
        cifras: [...new Set([f.title, f.resumen, f.que, ...f.evid.map((e) => e.v)].flatMap(valuesIn))]
      }))
    };
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
    const owners = ctx.responsables, user = JSON.stringify(ctx, null, 2);
    const call = async (extra) => {
      const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Asistentes · Analista de Números' }, system: SYSTEM_RULES, user: extra ? `${user}\n\n${extra}` : user, schema: RESPONSE_SCHEMA, apiKey: opts.apiKey, model: opts.model, fetchImpl: opts.fetchImpl });
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

  /**
   * Resultado completo del Analista. Nunca lanza.
   * @returns {Promise<{status, scope, findings, lectura, detectors, errors, ai:{status, model?, errors?}}>}
   *   status: 'ok' | 'no_data'; ai.status: 'off' (sin IA configurada o apagada) | 'ok' | 'none' (sin hallazgos que redactar) | 'unavailable' | 'invalid' | 'rejected'
   */
  async function run(state, opts = {}) {
    const det = FP.agents.analista.detect(state, opts.deps);
    const base = { status: det.status, scope: det.scope, detectors: det.detectors, errors: det.errors, lectura: '' };
    if (det.status !== 'ok') return { ...base, findings: [], ai: { status: 'none' } };
    if (!det.findings.length) return { ...base, findings: [], ai: { status: 'none' } };
    const det0 = { ...base, findings: det.findings.map((f) => ({ ...f, ai: false })) };
    const wantsAI = opts.useAI !== false && FP.cohereConnection && FP.cohereConnection.isConfigured() && !(state.settings && state.settings.enableAI === false);
    if (!wantsAI) return { ...det0, ai: { status: 'off' } };
    const ctx = buildContext(det, FP.agents.analista.OWNERS), key = keyOf(ctx);
    if (!opts.force && cache.has(key)) return cache.get(key);
    let r;
    try { r = await callAI(ctx, { apiKey: state.dx && state.dx.apiKey, model: state.dx && state.dx.model, fetchImpl: opts.fetchImpl }); }
    catch (e) { r = { status: 'unavailable', errors: [String(e && e.message || e)] }; }
    if (r.status !== 'ok') return { ...det0, ai: { status: r.status, errors: r.errors || [], errorKind: r.errorKind || null } };
    const m = merge(det, r.items, r.lectura);
    const out = { ...base, findings: m.findings, lectura: m.lectura, ai: { status: 'ok', model: r.model } };
    cache.set(key, out);
    return out;
  }

  FP.agents.runner = { run, buildContext, validate, merge, SYSTEM_RULES, RESPONSE_SCHEMA, clearCache: () => cache.clear() };
})(typeof window !== 'undefined' ? window : globalThis);
