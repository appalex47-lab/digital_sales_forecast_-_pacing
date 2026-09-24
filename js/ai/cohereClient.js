/**
 * cohereClient.js — Cliente mínimo de Cohere Chat API v2 (compartido; Fase 6).
 *
 * Extraído de cohereDiagnostic.js para no duplicar la llamada de red entre el diagnóstico (Fase 5)
 * y las líneas de acción (Fase 6). Nunca lanza: devuelve un resultado explícito.
 *   { ok, status: 'ok'|'unavailable'|'invalid', text, errors }
 * Cohere nunca calcula cifras: solo recibe payloads ya calculados y devuelve JSON que se valida aparte.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  async function chatJson({ system, user, schema, apiKey, model = C().diagnostics.cohere.model,
    fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), timeoutMs = C().diagnostics.cohere.timeoutMs,
    temperature = C().diagnostics.cohere.temperature }) {
    const fail = (status, msg) => ({ ok: false, status, text: null, errors: [msg] });
    if (!apiKey) return fail('unavailable', 'Falta la API key de Cohere.');
    if (!fetchImpl) return fail('unavailable', 'Este navegador no permite llamadas de red.');
    const body = {
      model, temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object', json_schema: schema }
    };
    let res;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      res = await fetchImpl(C().diagnostics.cohere.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
    } catch (e) {
      return fail('unavailable', `No se pudo conectar con Cohere (${e && e.name === 'AbortError' ? 'tiempo agotado' : 'red o permisos del navegador'}).`);
    }
    if (!res || !res.ok) return fail('unavailable', `Cohere respondió con error${res ? ` ${res.status}` : ''}.`);
    let data;
    try { data = await res.json(); } catch (e) { return fail('invalid', 'La respuesta de Cohere no es JSON.'); }
    const text = data && data.message && Array.isArray(data.message.content) && data.message.content[0] ? data.message.content[0].text : null;
    return { ok: true, status: 'ok', text, errors: [] };
  }

  /** Parseo tolerante a cercas ```json. Nunca lanza. */
  function parseJson(text) {
    try { return { ok: true, value: JSON.parse(String(text || '').replace(/^```(json)?|```$/g, '').trim()) }; }
    catch (e) { return { ok: false, value: null }; }
  }

  FP.cohereClient = { chatJson, parseJson };
})(typeof window !== 'undefined' ? window : globalThis);
