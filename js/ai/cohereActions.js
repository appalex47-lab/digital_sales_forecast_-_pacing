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
    const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Líneas de acción' }, system: SYSTEM_RULES, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl,
      user: `Propón posibles líneas de acción para validar o atender esta hipótesis. Datos ya calculados:\n${JSON.stringify(payload)}` });
    if (!r.ok) return { ok: false, status: r.status, actions: [], errors: r.errors, model };
    const v = parseAndValidate(r.text, { knownSignals: new Set((input.signals || []).map((s) => s.id)) });
    return { ...v, status: v.ok ? 'ok' : 'invalid', model };
  }

  /* ---------- Ampliar una acción del catálogo (plan más robusto) ---------- */

  const EXPAND_RULES = [
    'Eres un analista de operación ecommerce. Desarrollas un PLAN DE TRABAJO para una acción del catálogo, en español de México.',
    'Responde únicamente con JSON: {"objective","steps":[{"text","owner","when"}],"measure","dataToReview":[],"risks":[],"dontDo":[]}.',
    'Reglas obligatorias:',
    '1. Usa solo la acción, hipótesis, driver, señales y escenario del payload. No inventes datos, cifras, segmentos ni evidencia.',
    '2. No calcules ni cambies cifras. Si citas una, cópiala tal cual del payload. No estimes impacto: el impacto lo calcula el motor de escenarios.',
    '3. Cada paso es una actividad verificable (revisar, auditar, medir, probar, comunicar), no un resultado garantizado.',
    '4. No afirmes causalidad: la hipótesis requiere validación. Usa «podría» y «para validar».',
    '5. owner es un área o rol (usa ownerArea de la acción cuando aplique). when es relativo (p. ej. «Semana 1»), nunca una fecha inventada.',
    '6. measure describe cómo se mide con la métrica y la ventana de la acción.',
    '7. dataToReview: datos a revisar antes de ejecutar; indica cuáles faltan según missingData y cuáles ya están disponibles.',
    '8. risks y dontDo: solo si el estilo es detallado; en el estilo resumido devuelve listas vacías.',
    '9. Estilo resumido: de 3 a 4 pasos. Estilo detallado: de 5 a 7 pasos.',
    '10. El payload trae "known" (lo que la herramienta ya sabe de los datos: canal, señales, evidencia) y "operativeGoal" (objetivo operativo ya calculado). NO generes pasos para revisar, auditar o identificar volumen, fuentes, canales o segmentos que "known" ya cubre. Genera solo pasos de EJECUCIÓN: comunicar hallazgos, probar variantes, medir contra el objetivo operativo, ajustar y documentar aprendizajes.',
    '11. measure debe usar la métrica del objetivo operativo (volumen, conversión o ticket) además del impacto simulado, sin inventar cifras.'
  ].join('\n');

  const EXPAND_SCHEMA = {
    type: 'object', required: ['objective', 'steps', 'measure'],
    properties: {
      objective: { type: 'string' },
      steps: { type: 'array', items: { type: 'object', required: ['text', 'owner', 'when'], properties: { text: { type: 'string' }, owner: { type: 'string' }, when: { type: 'string' } } } },
      measure: { type: 'string' },
      dataToReview: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } }, dontDo: { type: 'array', items: { type: 'string' } }
    }
  };

  /** «Ya sabemos»: lo que los datos ya muestran (determinista, sin IA). Se muestra en solo lectura y se guarda con el plan. */
  function knownFacts({ hypothesis, signals = [], goal = null, channelLabel = '' }) {
    const out = [];
    if (channelLabel) out.push(`Canal: ${channelLabel}`);
    signals.slice(0, 4).forEach((s) => { const t = [s.dimensionLabel, s.label].filter(Boolean).join(' · '); out.push(`${t ? t + ': ' : ''}${s.evidence || ''}`.trim()); });
    if (hypothesis && Array.isArray(hypothesis.evidence)) hypothesis.evidence.slice(0, 2).forEach((e) => { if (e && !out.includes(e)) out.push(e); });
    if (goal) { const f = (v) => (FP.format && FP.format.metric ? FP.format.metric(goal.metric, v) : String(v)); out.push(`Objetivo operativo: ${goal.label}${goal.metric === 'trafficVolume' ? ` (${goal.unit})` : ''} ${f(goal.base)} → ${f(goal.target)}`); }
    return out.filter(Boolean).slice(0, 7);
  }

  function expandPayload({ item, hypothesis, signals = [], scenario = null, availableDimensions = [], constraints = {}, style = 'summary', goal = null, channelLabel = '' }) {
    const base = buildPayload({ hypothesis, signals, scenario, availableDimensions, constraints, catalog: [] });
    delete base.catalog;
    return { style: style === 'detailed' ? 'detailed' : 'summary',
      action: { actionId: item.actionId, name: item.name, description: item.description || '', driver: item.driver, ownerArea: item.ownerArea || '', measurementMetric: item.measurementMetric || item.driver,
        windowDays: item.defaultWindowDays || null, signalMatch: Boolean(item.signalMatch), dataAvailable: item.dataAvailable !== false, missingData: item.missingData || [] },
      known: knownFacts({ hypothesis, signals, goal, channelLabel }), operativeGoal: goal ? { metric: goal.metric, label: goal.label, unit: goal.unit, base: goal.base, target: goal.target } : null,
      ...base };
  }

  /** Cifras «de negocio» del texto: con $ o %, o de 4 dígitos o más. Los enteros chicos («semana 2», «14 días») no cuentan como cifra. */
  function bigNumbers(text) {
    const out = [], re = /(\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b)/g; let m;
    while ((m = re.exec(text))) { const n = Number(m[0].replace(/[^0-9.]/g, '')); if (Number.isFinite(n)) out.push(n); }
    return out;
  }
  function payloadNumbers(v, out = new Set()) {
    if (typeof v === 'number' && Number.isFinite(v)) { out.add(Math.abs(v)); out.add(Math.abs(v) * 100); }
    else if (Array.isArray(v)) v.forEach((x) => payloadNumbers(x, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => payloadNumbers(x, out));
    else if (typeof v === 'string') (v.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach((x) => { const n = Number(x.replace(/,/g, '')); if (Number.isFinite(n)) out.add(n); });
    return out;
  }

  function parseExpand(text, payload) {
    const p = FP.cohereClient.parseJson(text);
    if (!p.ok || !p.value || typeof p.value !== 'object') return { ok: false, errors: ['La respuesta no es JSON válido.'] };
    const v = p.value, str = (x) => (typeof x === 'string' ? x.trim() : '');
    const list = (x, n) => (Array.isArray(x) ? x.map(str).filter(Boolean).slice(0, n) : []);
    const steps = (Array.isArray(v.steps) ? v.steps : []).map((s) => ({ text: str(s && s.text), owner: str(s && s.owner), when: str(s && s.when) })).filter((s) => s.text).slice(0, 8);
    const detail = { objective: str(v.objective), steps, measure: str(v.measure), dataToReview: list(v.dataToReview, 8),
      risks: payload.style === 'detailed' ? list(v.risks, 6) : [], dontDo: payload.style === 'detailed' ? list(v.dontDo, 6) : [] };
    if (!detail.objective || !steps.length) return { ok: false, errors: ['La respuesta no trae objetivo y pasos.'] };
    const all = [detail.objective, detail.measure, ...steps.map((s) => `${s.text} ${s.owner} ${s.when}`), ...detail.dataToReview, ...detail.risks, ...detail.dontDo].join('\n');
    if (/la causa es|esto demuestra|se debe a|caus[oó]\s/i.test(all)) return { ok: false, errors: ['La respuesta usa lenguaje causal no permitido.'] };
    const allowed = [...payloadNumbers(payload)];
    const bad = bigNumbers(all).filter((n) => !allowed.some((x) => Math.abs(x - n) < 0.05 || (x > 1 && Math.abs(x - n) / x < 0.005)));
    if (bad.length) return { ok: false, errors: [`Cohere introdujo cifras que no están en tus datos: ${bad.slice(0, 4).join(', ')}.`] };
    return { ok: true, detail, errors: [] };
  }

  /** @returns Promise<{ ok, status, detail, errors, model }> — nunca lanza. Solo redacta un plan de trabajo; no calcula nada. */
  async function expandAction(input, { apiKey, model = C().diagnostics.cohere.model, fetchImpl } = {}) {
    if (!input || !input.item || !input.hypothesis) return { ok: false, status: 'unavailable', detail: null, errors: ['Elige una acción y un escenario ligado a una hipótesis.'], model };
    const payload = expandPayload(input);
    const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Ampliar acción del plan' }, system: EXPAND_RULES, schema: EXPAND_SCHEMA, apiKey, model, fetchImpl,
      user: `Desarrolla el plan de trabajo de esta acción (estilo ${payload.style === 'detailed' ? 'detallado' : 'resumido'}). Datos ya calculados:\n${JSON.stringify(payload)}` });
    if (!r.ok) return { ok: false, status: r.status, detail: null, errors: r.errors, model };
    const v = parseExpand(r.text, payload);
    if (!v.ok) return { ok: false, status: 'invalid', detail: null, errors: v.errors, model };
    return { ok: true, status: 'ok', detail: { ...v.detail, style: payload.style, source: 'cohere', model, generatedAt: new Date().toISOString(), edited: false, known: payload.known, operativeGoal: payload.operativeGoal }, errors: [], model };
  }

  FP.cohereActions = { SYSTEM_RULES, RESPONSE_SCHEMA, buildPayload, parseAndValidate, suggestActions, EXPAND_RULES, EXPAND_SCHEMA, knownFacts, expandPayload, parseExpand, expandAction };
})(typeof window !== 'undefined' ? window : globalThis);
