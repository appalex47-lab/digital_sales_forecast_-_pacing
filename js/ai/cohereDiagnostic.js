/**
 * cohereDiagnostic.js — Redacción de hipótesis con Cohere (Fase 5, opcional).
 *
 *   JavaScript → cálculos → drivers → señales → [Cohere] → redacción de hipótesis
 *
 * Cohere NO calcula nada: recibe un payload estructurado ya calculado y devuelve JSON con
 * hipótesis. La respuesta se valida: JSON válido, campos obligatorios, prioridades permitidas y
 * relatedSignals que existan en el payload (las inventadas se descartan). Si algo falla, el
 * diagnóstico matemático y las hipótesis por reglas siguen funcionando ("Análisis con IA no disponible").
 *
 * La API key la escribe el usuario; se guarda en este navegador solo si él lo pide. Nunca se exporta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const PRIORITIES = ['high', 'medium', 'low'];

  const SYSTEM_RULES = [
    'Eres un analista que redacta hipótesis de diagnóstico comercial en español de México.',
    'Responde únicamente con un objeto JSON con la forma {"hypotheses":[{"id","hypothesis","priority","justification","relatedSignals","mechanism","investigation"}]}.',
    'Reglas obligatorias:',
    '1. Usa solo la evidencia del payload. No inventes datos, cifras, dimensiones, segmentos, fechas ni causas.',
    '2. No modifiques ningún cálculo ni cifra; cita las cifras tal como vienen.',
    '3. Distingue hecho de hipótesis: toda hipótesis se redacta como posibilidad ("podría", "es posible que") y requiere validación.',
    '4. No conviertas correlación ni contribución matemática en causalidad.',
    '5. relatedSignals solo puede contener ids que existan en level2Signals o level1Drivers.signalIds del payload.',
    '6. priority solo puede ser high, medium o low. Si cambias la prioridad matemática de una señal, explica el criterio en justification.',
    '7. Si una dimensión aparece en dataQuality.unavailableDimensions, no formules hipótesis sobre ella.',
    '8. investigation es una lista de verificaciones concretas; no son recomendaciones comerciales ni acciones.',
    '9. Expresa incertidumbre cuando la confianza de datos sea limitada o insuficiente.'
  ].join('\n');

  const RESPONSE_SCHEMA = {
    type: 'object',
    required: ['hypotheses'],
    properties: {
      hypotheses: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'hypothesis', 'priority', 'justification', 'relatedSignals', 'mechanism', 'investigation'],
          properties: {
            id: { type: 'string' }, hypothesis: { type: 'string' }, priority: { type: 'string' },
            justification: { type: 'string' }, relatedSignals: { type: 'array', items: { type: 'string' } },
            mechanism: { type: 'string' }, investigation: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  };

  /** Payload estructurado para Cohere (sección 27 del brief). Solo datos ya calculados. */
  function buildPayload(diag) {
    const l1 = diag.level1Drivers || [];
    const sigByMetric = (m) => (diag.signals || []).filter((s) => s.level === 1 && s.metric === m).map((s) => s.id);
    return {
      period: diag.period, comparison: diag.comparison, channel: diag.channel,
      revenueGap: { metric: diag.metric, current: diag.result ? diag.result.current[diag.metric] : null,
        baseline: diag.result ? diag.result.baseline[diag.metric] : null, gap: diag.gap ? diag.gap.abs : null, gapPct: diag.gap ? diag.gap.pct : null,
        fact: diag.result ? diag.result.fact : null },
      level1Drivers: l1.map((d) => ({ driver: d.driver, label: d.label, current: d.current, baseline: d.baseline, deltaPct: d.deltaPct,
        contribution: d.contribution, sign: d.sign, signalIds: sigByMetric(d.driver) })),
      mainDriverStatement: diag.level1 ? diag.level1.statement : null,
      level2Signals: (diag.signals || []).slice(0, 25).map((s) => ({ id: s.id, kind: s.kind, metric: s.metric, dimension: s.dimensionLabel,
        segment: s.label, current: s.current, baseline: s.baseline, deltaPct: s.deltaPct, contribution: s.contribution,
        direction: s.direction, priority: s.relevance.priority, evidence: s.evidence, reference: s.reference })),
      rulesHypotheses: (diag.hypotheses || []).map((h) => ({ id: h.id, hypothesis: h.hypothesis, relatedSignals: h.relatedSignals })),
      dataQuality: { confidence: diag.confidence ? diag.confidence.level : null,
        components: diag.confidence ? diag.confidence.components.map((c) => ({ label: c.label, level: c.level, note: c.note })) : [],
        availableDimensions: diag.availability ? diag.availability.available.map((d) => d.label) : [],
        unavailableDimensions: diag.availability ? diag.availability.unavailable.map((d) => d.label) : [] },
      constraints: { attributionMethod: diag.attributionMethodLabel, maxHypotheses: C().diagnostics.cohere.maxHypotheses,
        language: 'es-MX', noActions: true, noCausalClaims: true }
    };
  }

  /**
   * Valida la respuesta. Nunca lanza: devuelve { ok, hypotheses, errors }.
   * @param {string} text  texto devuelto por el modelo
   * @param {Set<string>} knownIds  ids de señales válidas
   */
  function parseAndValidate(text, knownIds) {
    const errors = [];
    let obj;
    try { obj = JSON.parse(String(text || '').replace(/^```(json)?|```$/g, '').trim()); }
    catch (e) { return { ok: false, hypotheses: [], errors: ['La respuesta no es JSON válido.'] }; }
    if (!obj || !Array.isArray(obj.hypotheses)) return { ok: false, hypotheses: [], errors: ['Falta la lista "hypotheses".'] };
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const list = obj.hypotheses.slice(0, C().diagnostics.cohere.maxHypotheses).map((h, i) => {
      if (!h || typeof h !== 'object') { errors.push(`Hipótesis ${i + 1}: formato inválido.`); return null; }
      const text = str(h.hypothesis);
      if (!text) { errors.push(`Hipótesis ${i + 1}: sin texto.`); return null; }
      const related = Array.isArray(h.relatedSignals) ? h.relatedSignals.map(String) : [];
      const valid = related.filter((id) => knownIds.has(id));
      if (valid.length < related.length) errors.push(`Hipótesis ${i + 1}: se descartaron señales inexistentes (${related.filter((id) => !knownIds.has(id)).join(', ')}).`);
      if (!valid.length) { errors.push(`Hipótesis ${i + 1}: no cita señales existentes; se descartó.`); return null; }
      const priority = PRIORITIES.includes(str(h.priority).toLowerCase()) ? str(h.priority).toLowerCase() : 'medium';
      return {
        id: `ai${i + 1}`, hypothesis: text, priority, justification: str(h.justification), mechanism: str(h.mechanism),
        validationNeeded: Array.isArray(h.investigation) ? h.investigation.map(str).filter(Boolean).slice(0, 6) : [],
        relatedSignals: valid, status: 'requires_investigation', statusLabel: 'Requiere investigación', source: 'cohere'
      };
    }).filter(Boolean);
    return { ok: list.length > 0, hypotheses: list, errors };
  }

  /**
   * Llama a Cohere (Chat API v2). `fetchImpl` permite probar sin red.
   * @returns Promise<{ ok, status: 'ok'|'unavailable'|'invalid', hypotheses, errors, model }>
   */
  async function generateWithCohere(diag, { apiKey, model = C().diagnostics.cohere.model, fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), timeoutMs = C().diagnostics.cohere.timeoutMs } = {}) {
    const unavailable = (msg) => ({ ok: false, status: 'unavailable', hypotheses: [], errors: [msg], model });
    if (!diag || diag.status !== 'ok') return unavailable('No hay diagnóstico con datos para enviar.');
    const payload = buildPayload(diag);
    const knownIds = new Set((diag.signals || []).map((s) => s.id));
    const r = await FP.cohereClient.chatJson({ system: SYSTEM_RULES, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl, timeoutMs,
      user: `Genera un JSON con hipótesis a partir de este diagnóstico ya calculado:\n${JSON.stringify(payload)}` });
    if (!r.ok) return { ok: false, status: r.status, hypotheses: [], errors: r.errors, model };
    const text = r.text;
    const v = parseAndValidate(text, knownIds);
    return { ...v, status: v.ok ? 'ok' : 'invalid', model, payload };
  }

  FP.cohereDiagnostic = { SYSTEM_RULES, RESPONSE_SCHEMA, buildPayload, parseAndValidate, generateWithCohere };
})(typeof window !== 'undefined' ? window : globalThis);
