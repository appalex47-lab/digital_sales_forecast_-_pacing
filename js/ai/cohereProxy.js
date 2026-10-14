/**
 * cohereProxy.js — Cohere a través del servidor del equipo (Edge Function `cohere-proxy` de Supabase).
 * Con sesión iniciada, las llamadas a Cohere van a tu Supabase con tu sesión; la API key de Cohere vive solo en el secreto del servidor
 * y el navegador nunca la ve. Sin sesión, o si el servidor no está listo, se usa (si existe) la key local como respaldo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const cfg = () => FP.config.cloud;

  /** ¿Hay sesión de equipo? (síncrono, sin red). */
  function available() {
    if (cfg().cohereProxy === false || !FP.cloud) return false;
    const s = FP.cloud.loadSession();
    return Boolean(s && s.team_id && !s.anonymous);
  }
  const endpoint = () => `${cfg().url}/functions/v1/${cfg().cohereProxyName || 'cohere-proxy'}`;

  /** POST al proxy. Devuelve la Response, o lanza si no hay sesión vigente. */
  async function post(body, { fetchImpl, signal } = {}) {
    const f = fetchImpl || (root.fetch ? root.fetch.bind(root) : null);
    if (!f) throw new Error('Este navegador no permite llamadas de red.');
    const se = await FP.cloud.ensureSession({ fetchImpl });
    if (!se.ok) { const e = new Error(se.error || 'Inicia sesión para usar la IA.'); e.code = 'no_session'; throw e; }
    return f(endpoint(), { method: 'POST', headers: { apikey: cfg().publishableKey, Authorization: `Bearer ${se.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  }

  FP.cohereProxy = { available, endpoint, post };
})(typeof window !== 'undefined' ? window : globalThis);
