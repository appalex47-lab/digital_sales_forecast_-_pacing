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
    // Con sesión de equipo, Cohere se llama por el servidor (la key vive en Supabase). La key local solo es respaldo.
    const useProxy = Boolean(FP.cohereProxy && FP.cohereProxy.available());
    if (!apiKey && !useProxy) return fail('unavailable', 'Para usar la IA inicia sesión (la key vive en el servidor del equipo) o pega tu API key de Cohere en Configuración.', false);
    if (!fetchImpl) return fail('unavailable', 'Este navegador no permite llamadas de red.', false);
    const body = {
      model, temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object', json_schema: schema }
    };
    const direct = (ctrl) => fetchImpl(C().diagnostics.cohere.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    let res, via = useProxy ? 'server' : 'browser';
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      if (useProxy) {
        try { res = await FP.cohereProxy.post(body, { fetchImpl, signal: ctrl ? ctrl.signal : undefined }); }
        catch (e) { if (e && e.code === 'no_session') { if (timer) clearTimeout(timer); return fail('unavailable', e.message, false, 'no_session'); } throw e; }
        // Servidor no desplegado o sin secreto: si hay key local se usa como respaldo; si no, se explica qué falta.
        let pj = null;
        if (res && !res.ok) { try { pj = await res.clone().json(); } catch (e) { pj = null; } }
        const pcode = pj && pj.error && pj.error.code;
        if (res && !res.ok && (res.status === 404 || pcode === 'not_configured')) {
          if (apiKey) { res = await direct(ctrl); via = 'browser'; }
          else { if (timer) clearTimeout(timer); return fail('unavailable', res.status === 404 ? 'El servidor de IA del equipo todavía no está instalado en Supabase (función cohere-proxy).' : 'El servidor de IA del equipo no tiene la API key de Cohere (secreto COHERE_API_KEY en Supabase).', true, 'proxy_setup'); }
        } else if (res && !res.ok && pcode) {
          if (timer) clearTimeout(timer);
          if (pcode === 'no_session') return fail('unavailable', 'Tu sesión venció. Inicia sesión de nuevo para usar la IA.', true, 'no_session');
          if (pcode === 'no_team') return fail('unavailable', 'Tu usuario no pertenece a ningún equipo.', true, 'no_session');
          if (pcode === 'cohere_auth') return fail('unavailable', 'Cohere rechazó la API key del servidor. Pide a la persona administradora revisar el secreto COHERE_API_KEY.', true, 'auth');
          if (pcode === 'cohere_quota') return fail('unavailable', 'Se alcanzó el límite de uso de Cohere (429). Espera un momento o revisa la cuota de la cuenta.', true, 'quota');
          if (pcode === 'cohere_server' || pcode === 'cohere_unreachable' || pcode === 'auth_unreachable') return fail('unavailable', 'El servicio de IA no está disponible en este momento. Intenta más tarde.', true, 'server');
          return fail('unavailable', `El servidor de IA respondió con error${res.status ? ` ${res.status}` : ''}.`, true, 'http');
        }
      } else res = await direct(ctrl);
      if (timer) clearTimeout(timer);
    } catch (e) {
      const timeout = e && e.name === 'AbortError';
      return fail('unavailable', `No se pudo conectar con ${useProxy ? 'el servidor de IA' : 'Cohere'} (${timeout ? 'tiempo agotado' : 'red o permisos del navegador'}).`, true, timeout ? 'timeout' : 'network');
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
    return { ok: true, status: 'ok', text, errors: [], sent: true, model, via };
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
