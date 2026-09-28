/**
 * cohereActions.js — Líneas de acción con Cohere (Fase 6, opcional).
 *
 * Cohere puede transformar una hipótesis en POSIBLES líneas de acción, explicar su relación con el
 * driver y sugerir qué información falta. NO calcula venta, CR, AOV, volumen, gap ni impacto, no
 * modifica plan ni actual, no inventa evidencia y no afirma causalidad. El impacto de cualquier línea
 * de acción se calcula aparte, con el motor de escenarios.
 * La respuesta se valida (JSON, campos, driver permitido, señales existentes); si falla, el módulo sigue.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const SYSTEM_RULES = [
    'Eres un analista de operación ecommerce que propone POSIBLES líneas de acción en español de México.',
    'Responde únicamente con JSON: {"actions":[{"actionId","action","rationale","relatedDriver","relatedSignals","informationNeeded"}]}.',
    'Reglas obligatorias:',
    '1. Usa solo la hipótesis, driver, señales y escenario del payload. No inventes datos, cifras, dimensiones, segmentos ni evidencia.',
    '2. No calcules ni cambies cifras (venta, CR, AOV, volumen, gap, impacto). Si citas una cifra, cópiala tal cual.',
    '3. Cada acción es una actividad verificable (revisar, auditar, probar, comunicar), no un resultado garantizado.',
    '4. No afirmes causalidad: la hipótesis requiere validación. Usa "podría", "para validar".',
    '5. relatedDriver solo puede ser trafficVolume, conversionRate o aov. relatedSignals solo ids que existan en signals.',
    '6. No propongas acciones sobre dimensiones que no estén en availableDimensions.',
    '7. informationNeeded lista los datos a revisar antes de ejecutar.',
    '8. Si hay acciones del catálogo que aplican, puedes usar su actionId; si propones una nueva, usa un actionId que empiece con "ai_".',
    '9. Máximo 5 acciones.'
  ].join('\n');

  const RESPONSE_SCHEMA = {
    type: 'object', required: ['actions'],
    properties: { actions: { type: 'array', items: { type: 'object',
      required: ['actionId', 'action', 'rationale', 'relatedDriver', 'relatedSignals', 'informationNeeded'],
      properties: { actionId: { type: 'string' }, action: { type: 'string' }, rationale: { type: 'string' }, relatedDriver: { type: 'string' },
        relatedSignals: { type: 'array', items: { type: 'string' } }, informationNeeded: { type: 'array', items: { type: 'string' } } } } } }
  };

  /** Payload estructurado (sección 24 del brief). Solo datos ya calculados. */
  function buildPayload({ hypothesis, signals = [], scenario = null, availableDimensions = [], dataQuality = {}, constraints = {}, catalog = [] }) {
    return {
      hypothesis: hypothesis ? { id: hypothesis.id, text: hypothesis.hypothesis, evidence: hypothesis.evidence, mechanism: hypothesis.mechanism,
        validationNeeded: hypothesis.validationNeeded, status: 'requires_investigation' } : null,
      driver: hypothesis ? hypothesis.driver : scenario ? scenario.links.driver : null,
      signals: signals.map((s) => ({ id: s.id, metric: s.metric, dimension: s.dimensionLabel, segment: s.label, deltaPct: s.deltaPct, evidence: s.evidence })),
      scenario: scenario ? { id: scenario.scenarioId, name: scenario.name, inputs: scenario.inputs, target: scenario.target,
        simulatedImpact: scenario.expectedImpact, note: 'Impacto simulado, no garantizado.' } : null,
      availableDimensions, dataQuality, constraints,
      catalog: catalog.map((a) => ({ actionId: a.actionId, name: a.name, driver: a.driver, description: a.description }))
    };
  }

  function parseAndValidate(text, { knownSignals, allowed = ['trafficVolume', 'conversionRate', 'aov'] }) {
    const errors = [];
    const p = FP.cohereClient.parseJson(text);
    if (!p.ok) return { ok: false, actions: [], errors: ['La respuesta no es JSON válido.'] };
    if (!p.value || !Array.isArray(p.value.actions)) return { ok: false, actions: [], errors: ['Falta la lista "actions".'] };
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const list = p.value.actions.slice(0, 5).map((a, i) => {
      if (!a || typeof a !== 'object' || !str(a.action)) { errors.push(`Acción ${i + 1}: sin texto.`); return null; }
      if (!allowed.includes(str(a.relatedDriver))) { errors.push(`Acción ${i + 1}: driver no permitido; se descartó.`); return null; }
      const rel = Array.isArray(a.relatedSignals) ? a.relatedSignals.map(String) : [];
      const valid = rel.filter((id) => knownSignals.has(id));
      if (valid.length < rel.length) errors.push(`Acción ${i + 1}: se descartaron señales inexistentes.`);
      return { actionId: str(a.actionId) || `ai_${i + 1}`, action: str(a.action), rationale: str(a.rationale), relatedDriver: str(a.relatedDriver),
        relatedSignals: valid, informationNeeded: Array.isArray(a.informationNeeded) ? a.informationNeeded.map(str).filter(Boolean).slice(0, 6) : [],
        source: 'cohere', status: 'proposed_by_ai' };
    }).filter(Boolean);
    return { ok: list.length > 0, actions: list, errors };
  }

  /** @returns Promise<{ ok, status, actions, errors, model }> — nunca lanza. */
  async function suggestActions(input, { apiKey, model = C().diagnostics.cohere.model, fetchImpl } = {}) {
    if (!input || !input.hypothesis) return { ok: false, status: 'unavailable', actions: [], errors: ['Selecciona una hipótesis: las acciones deben partir de evidencia.'], model };
    const payload = buildPayload(input);
    const r = await FP.cohereClient.chatJson({ system: SYSTEM_RULES, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl,
      user: `Propón posibles líneas de acción para validar o atender esta hipótesis. Datos ya calculados:\n${JSON.stringify(payload)}` });
    if (!r.ok) return { ok: false, status: r.status, actions: [], errors: r.errors, model };
    const v = parseAndValidate(r.text, { knownSignals: new Set((input.signals || []).map((s) => s.id)) });
    return { ...v, status: v.ok ? 'ok' : 'invalid', model };
  }

  FP.cohereActions = { SYSTEM_RULES, RESPONSE_SCHEMA, buildPayload, parseAndValidate, suggestActions };
})(typeof window !== 'undefined' ? window : globalThis);
