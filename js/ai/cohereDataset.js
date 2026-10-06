/**
 * cohereDataset.js — Fase H4 · ayuda de la IA cuando la detección por reglas duda entre dos tipos de archivo.
 * Solo se consulta si detectDataset marcó la clasificación como ambigua. Viajan SOLO los encabezados (ningún valor) y los tipos candidatos.
 * La respuesta se valida: el tipo debe ser uno de los candidatos y la confianza al menos 0.70; si no, se conserva la detección por reglas.
 * Nunca bloquea la carga y el usuario puede corregir con «Cargar como». La IA no decide la calidad de los datos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const MIN_CONFIDENCE = 0.7;

  const SCHEMA = (ids) => ({ type: 'object', required: ['datasetType', 'confidence', 'reason'],
    properties: { datasetType: { type: 'string', enum: ids }, confidence: { type: 'number' }, reason: { type: 'string' } } });

  /**
   * @param {object} detection  resultado de FP.canonical.detectDataset
   * @param {string[]} headers  encabezados del archivo
   * @returns {Promise<object>} detección (la misma si no hubo consulta o no se pudo validar; con aiNote si la IA no resolvió)
   */
  async function resolve(detection, headers, { apiKey = '', model = null } = {}) {
    if (!detection || !detection.ambiguous || !detection.alternatives || !detection.alternatives.length) return detection;
    if (!FP.cohereClient || typeof FP.cohereClient.chatJson !== 'function') return detection;
    const cand = [detection.datasetType, ...detection.alternatives.map((a) => a.datasetType)].filter((x, i, a) => a.indexOf(x) === i);
    const profiles = cand.map((id) => FP.canonical.profile(id)).filter(Boolean);
    if (profiles.length < 2) return detection;
    const ids = profiles.map((p) => p.id);
    const system = ['Eres un clasificador de tipos de archivo para un pipeline ETL de datos comerciales.',
      'Elige UNO de los tipos candidatos según los encabezados del archivo. No inventes tipos.',
      'Solo recibes nombres de columnas, nunca valores. Devuelve únicamente JSON válido conforme al schema.', 'Confidence entre 0 y 1; si no hay base suficiente, usa una confianza baja.'].join('\n');
    const user = [`Encabezados: ${JSON.stringify(headers)}`,
      `Tipos candidatos: ${JSON.stringify(profiles.map((p) => ({ id: p.id, label: p.label, identificadores: p.identifiers, esperados: p.expected })))}`].join('\n');
    const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Tipo de archivo (duda entre dos)', columns: headers.map((h) => ({ header: h, examplesSent: 0, protected: null })) },
      system, user, schema: SCHEMA(ids), apiKey, model: model || FP.config.diagnostics.cohere.model });
    if (!r.ok) return r.sent === false ? detection : { ...detection, aiNote: 'La IA no pudo resolver la duda; se conserva la detección por reglas.' };
    const p = FP.cohereClient.parseJson(r.text);
    const v = p.ok && p.value ? p.value : null, conf = v ? Number(v.confidence) : NaN;
    if (!v || !ids.includes(v.datasetType) || !Number.isFinite(conf) || conf < MIN_CONFIDENCE) {
      return { ...detection, aiNote: 'La IA no dio una respuesta válida o segura; se conserva la detección por reglas.' };
    }
    const prof = FP.canonical.profile(v.datasetType), target = prof.appTarget;
    return { ...detection, datasetType: prof.id, label: prof.label, confidence: Math.min(0.9, conf), detectionMethod: 'ai-assisted', ambiguous: false,
      alternatives: ids.filter((id) => id !== prof.id).map((id) => ({ datasetType: id, confidence: null })), aiReason: String(v.reason || '').slice(0, 240),
      suggestedTarget: target, targetMismatch: Boolean(detection.expectedTarget && target && detection.expectedTarget !== target && !(detection.expectedTarget === 'historical' && target === 'actual')) };
  }
  FP.cohereDataset = { resolve, MIN_CONFIDENCE };
})(typeof window !== 'undefined' ? window : globalThis);
