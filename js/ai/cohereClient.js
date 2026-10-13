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

  async function chatJsonRaw({ system, user, schema, apiKey, model = C().diagnostics.cohere.model,
    fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), timeoutMs = C().diagnostics.cohere.timeoutMs,
    temperature = C().diagnostics.cohere.temperature }) {
    // sent: false cuando NADA salió del navegador (sin key o sin red disponible): no se registra en el registro de transparencia
    const fail = (status, msg, sent = true, errorKind = null) => ({ ok: false, status, text: null, errors: [msg], sent, model, errorKind });
    // Si no se entrega explícitamente, reutiliza la conexión Cohere central de la app.
    // Así Diagnóstico, Narrativa, Recovery e Importación comparten exactamente la misma configuración.
    if (!apiKey && FP.cohereConnection && typeof FP.cohereConnection.get === 'function') {
      const connection = FP.cohereConnection.get();
      apiKey = connection && connection.apiKey ? connection.apiKey : '';
      if (!model && connection && connection.model) model = connection.model;
    }
    if (!apiKey) return fail('unavailable', 'Falta la API key de Cohere en Configuración.', false);
    if (!fetchImpl) return fail('unavailable', 'Este navegador no permite llamadas de red.', false);
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
      const timeout = e && e.name === 'AbortError';
      return fail('unavailable', `No se pudo conectar con Cohere (${timeout ? 'tiempo agotado' : 'red o permisos del navegador'}).`, true, timeout ? 'timeout' : 'network');
    }
    if (!res || !res.ok) {
      // Mensajes por tipo de error. Nunca se incluye la key ni el cuerpo de la respuesta (puede repetir datos enviados).
      const code = res ? res.status : 0;
      if (code === 401 || code === 403) return fail('unavailable', `Cohere rechazó la API key (${code}). Revísala o reemplázala en Configuración de RevNavigator.`, true, 'auth');
      if (code === 429) return fail('unavailable', 'Se alcanzó el límite de uso de Cohere (429). Espera un momento o revisa la cuota de tu cuenta.', true, 'quota');
      if (code >= 500) return fail('unavailable', `Cohere no está disponible en este momento (${code}). Intenta más tarde.`, true, 'server');
      return fail('unavailable', `Cohere respondió con error${code ? ` ${code}` : ''}.`, true, 'http');
    }
    let data;
    try { data = await res.json(); } catch (e) { return fail('invalid', 'La respuesta de Cohere no es JSON.', true, 'invalid'); }
    const text = data && data.message && Array.isArray(data.message.content) && data.message.content[0] ? data.message.content[0].text : null;
    return { ok: true, status: 'ok', text, errors: [], sent: true, model };
  }

  /**
   * Llamada a Cohere con registro de transparencia (FP.aiAudit). `audit` es opcional: { purpose, columns: [{ header, examplesSent, protected }] }.
   * Sin `audit` se registra igual con el propósito «Consulta» y el tamaño enviado.
   */
  async function chatJson(args) {
    const t0 = Date.now();
    const r = await chatJsonRaw(args);
    if (r.sent !== false && FP.aiAudit) {
      const a = args.audit || {};
      FP.aiAudit.record({ purpose: a.purpose || 'Consulta', model: r.model || args.model, status: r.status, ok: r.ok, columns: a.columns || [],
        chars: String(args.system || '').length + String(args.user || '').length, ms: Date.now() - t0 });
    }
    return r;
  }

  /** Parseo tolerante a cercas ```json. Nunca lanza. */
  function parseJson(text) {
    try { return { ok: true, value: JSON.parse(String(text || '').replace(/^```(json)?|```$/g, '').trim()) }; }
    catch (e) { return { ok: false, value: null }; }
  }

  FP.cohereClient = { chatJson, parseJson };
})(typeof window !== 'undefined' ? window : globalThis);
