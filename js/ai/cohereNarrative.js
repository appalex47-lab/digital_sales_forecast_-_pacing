/**
 * cohereNarrative.js — Redacción ejecutiva con Cohere (Fase 9.2, opcional).
 *
 *   JavaScript → narrativeEngine.build() → [Cohere redacta] → validación anti-alucinación → UI
 *
 * Cohere recibe la narrativa YA ARMADA (claims con su nivel de certeza y sus cifras) y solo la redacta
 * en prosa ejecutiva. No recibe datos crudos ni puede calcular nada. La respuesta se valida en tres
 * frentes antes de mostrarse:
 *   1. JSON con la forma esperada, campos no vacíos.
 *   2. Ningún número en el texto que no esté ya en el registro de cifras de los claims (con tolerancia
 *      de formato: comas, redondeo a menos decimales). Un número nuevo = respuesta rechazada.
 *   3. Sin lenguaje causal no permitido ("la causa es", "esto demuestra", "se debe a") fuera de una cita
 *      textual de una afirmación que ya lo dijera (no ocurre: ningún claim usa esas frases).
 * Si falla cualquiera, no se muestra: sigue la narrativa determinística de narrativeEngine (nunca vacía).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const FORBIDDEN = [/la causa es/i, /esto demuestra/i, /se debe a/i, /caus[oó] la/i, /qued[oó] demostrado/i];

  const SYSTEM_RULES = [
    'Eres un analista que redacta narrativa ejecutiva de resultados comerciales en español de México.',
    'Responde únicamente con un objeto JSON con la forma {"summary","narrative","missingInfo"}.',
    'Reglas obligatorias:',
    '1. Usa solo las afirmaciones (claims) del payload. No inventes cifras, fechas, canales, productos, ubicaciones ni causas.',
    '2. No recalcules ni cambies ningún número: cítalos exactamente como vienen (puedes redondear para que se lea mejor, nunca inventar uno nuevo).',
    '3. Conserva el nivel de certeza de cada claim: "hecho" y "calculo" se afirman; "driver" se describe como atribución matemática, nunca como causa;',
    '   "senal" se describe como patrón que amerita investigación, nunca como causa confirmada; "hipotesis" siempre con lenguaje de posibilidad',
    '   ("podría", "es consistente con", "una hipótesis a investigar es"); "accion" nunca se presenta como un resultado garantizado.',
    '4. Nunca escribas "la causa es", "esto demuestra" ni "se debe a".',
    '5. Usa la terminología del negocio (businessContext.terms) en vez de los términos genéricos cuando estén definidos.',
    '6. Si una sección viene vacía o falta, dilo brevemente en missingInfo; no la inventes ni la omitas en silencio.',
    '7. summary es un párrafo breve (resumen ejecutivo); narrative es el desarrollo completo, organizado por secciones, en prosa clara y directa.',
    '8. Tono ejecutivo: directo, sin exagerar, sin lenguaje causal injustificado.'
  ].join('\n');

  const RESPONSE_SCHEMA = {
    type: 'object', required: ['summary', 'narrative'],
    properties: { summary: { type: 'string' }, narrative: { type: 'string' }, missingInfo: { type: 'array', items: { type: 'string' } } }
  };

  /** Payload estructurado: solo los claims ya calculados, agrupados por sección y nivel. No hay datos crudos. */
  function buildPayload(n) {
    const bySection = (key) => (n.claims.filter((c) => (n.sections[key] || { claims: [] }).claims.includes(c.id))).map((c) => ({ level: c.level, text: c.text }));
    return {
      businessContext: n.businessContext, period: n.period, channel: n.channel, comparison: n.comparison,
      readyToNarrate: n.readyToNarrate,
      sections: Object.fromEntries(Object.keys(n.sections).map((k) => [k, { claims: bySection(k), empty: n.sections[k].empty }])),
      note: n.note
    };
  }

  /** Todas las cifras citables de la narrativa (unión de los `numbers` de cada claim), normalizadas. */
  function allowedNumbers(n) {
    const set = new Set();
    n.claims.forEach((c) => c.numbers.forEach((x) => set.add(x)));
    return set;
  }

  /** ¿El número extraído del texto de la IA corresponde a alguno permitido? Tolera comas y redondeo. */
  function numberAllowed(tok, allowedSet, allowedFloats) {
    if (allowedSet.has(tok)) return true;
    const v = parseFloat(tok);
    if (!Number.isFinite(v)) return false;
    return allowedFloats.some((a) => Math.abs(a - v) < 0.05 || Math.abs(Math.round(a) - v) < 0.5 || Math.abs(a - v) / Math.max(Math.abs(a), 1) < 0.005);
  }

  /**
   * Valida el texto de Cohere contra la narrativa fuente. Nunca lanza.
   * @returns { ok, errors[], invalidNumbers[] }
   */
  function validateResponse(parsed, narrative) {
    const errors = [];
    if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim() || typeof parsed.narrative !== 'string' || !parsed.narrative.trim()) {
      return { ok: false, errors: ['La respuesta no trae "summary" y "narrative" con texto.'], invalidNumbers: [] };
    }
    const text = `${parsed.summary}\n${parsed.narrative}`;
    FORBIDDEN.forEach((re) => { if (re.test(text)) errors.push(`Usa lenguaje causal no permitido ("${re.source}").`); });
    const allowedSet = allowedNumbers(narrative);
    const allowedFloats = [...allowedSet].map((x) => parseFloat(x)).filter(Number.isFinite);
    const found = FP.narrativeEngine.numbersIn(text);
    const invalidNumbers = [...new Set(found)].filter((tok) => !numberAllowed(tok, allowedSet, allowedFloats));
    if (invalidNumbers.length) errors.push(`Cifras que no vienen de los datos calculados: ${invalidNumbers.slice(0, 5).join(', ')}.`);
    return { ok: errors.length === 0, errors, invalidNumbers };
  }

  /** @returns Promise<{ ok, status, result, errors, model }> — nunca lanza; sin narrative válida, status lo dice. */
  async function narrate(narrative, { apiKey, model = C().diagnostics.cohere.model, fetchImpl } = {}) {
    if (!narrative || !narrative.readyToNarrate || !narrative.readyToNarrate.performance) {
      return { ok: false, status: 'unavailable', result: null, errors: ['No hay suficiente narrativa calculada todavía.'], model };
    }
    const payload = buildPayload(narrative);
    const r = await FP.cohereClient.chatJson({ system: SYSTEM_RULES, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl,
      user: `Redacta la narrativa ejecutiva a partir de esta información ya calculada:\n${JSON.stringify(payload)}` });
    if (!r.ok) return { ok: false, status: r.status, result: null, errors: r.errors, model };
    const p = FP.cohereClient.parseJson(r.text);
    if (!p.ok) return { ok: false, status: 'invalid', result: null, errors: ['La respuesta no es JSON válido.'], model };
    const v = validateResponse(p.value, narrative);
    if (!v.ok) return { ok: false, status: 'invalid', result: null, errors: v.errors, model };
    return { ok: true, status: 'ok', result: { summary: p.value.summary, narrative: p.value.narrative, missingInfo: p.value.missingInfo || [] }, errors: [], model };
  }

  FP.cohereNarrative = { SYSTEM_RULES, RESPONSE_SCHEMA, buildPayload, allowedNumbers, numberAllowed, validateResponse, narrate };
})(typeof window !== 'undefined' ? window : globalThis);
