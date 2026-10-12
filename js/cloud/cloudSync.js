/**
 * cloudSync.js — Fase S1: copia en la nube (Supabase) con sesión anónima.
 *
 * Sin dependencias: habla con Auth y REST de Supabase con fetch.
 *  - «Entrar sin login»: POST /auth/v1/signup sin credenciales crea un usuario ANÓNIMO (hay que activar
 *    «Anonymous sign-ins» en el proyecto). Su token se renueva solo; se guarda en localStorage.
 *  - Cada clave de la app (sobre {schemaVersion,savedAt,data}) se serializa y se parte en filas de texto.
 *  - RLS en la base: cada usuario solo ve/escribe sus filas (auth.uid() = user_id).
 *  - La llave publishable es pública por diseño; nunca se usa service_role.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const cfg = () => FP.config.cloud;
  const SESSION_KEY = 'fp.cloudSession';   // fuera del namespace de datos: nunca viaja a la nube ni entra en copias

  /* ---------- sesión ---------- */
  function loadSession() { try { const r = root.localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function saveSession(s) { try { if (s) root.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else root.localStorage.removeItem(SESSION_KEY); } catch (e) { /* sin storage */ } }
  function toSession(j) {
    return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user_id: (j.user && j.user.id) || null, anonymous: !!(j.user && j.user.is_anonymous), email: (j.user && j.user.email) || null };
  }
  function authHeaders(extra) { return Object.assign({ apikey: cfg().publishableKey, 'Content-Type': 'application/json' }, extra || {}); }
  function explain(status, body) {
    const msg = (body && (body.msg || body.message || body.error_description || body.error)) || '';
    const code = (body && (body.error_code || body.code)) || '';
    if (code === 'signup_disabled' || /signups? not allowed/i.test(msg)) return 'Supabase tiene apagado el registro de usuarios (Authentication → Sign In / Providers → User Signups → «Allow new users to sign up»). Los inicios anónimos también lo necesitan. Actívalo y guarda.';
    if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(msg)) return 'Los inicios anónimos están desactivados en Supabase (Authentication → Sign In / Providers → Allow anonymous sign-ins). Actívalos y guarda con «Save changes».';
    if (code === 'captcha_failed' || /captcha/i.test(msg)) return 'Supabase pide CAPTCHA y esta versión de la app todavía no lo envía. Desactiva CAPTCHA en Supabase hasta que lo publiquemos.';
    if (code === 'email_exists' || code === 'identity_already_exists') return 'Ese correo ya tiene una cuenta. Usa «Entrar con mi correo» para abrirla.';
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'Ese correo no es válido.';
    if (code === 'otp_expired' || /expired|invalid/i.test(msg) && code.startsWith('otp')) return 'El código es incorrecto o ya venció. Pide uno nuevo.';
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) return 'Supabase limitó los envíos por ahora (el servicio de correo gratuito permite pocos por hora). Espera unos minutos e inténtalo de nuevo.';
    return `Supabase respondió ${status}${code ? ` (${code})` : ''}${msg ? ': ' + msg : ''}.`;
  }


  /* ---------- CAPTCHA (Cloudflare Turnstile) ---------- */
  let turnstileLoading = null;
  function loadTurnstile() {
    if (root.turnstile) return Promise.resolve(root.turnstile);
    if (turnstileLoading) return turnstileLoading;
    turnstileLoading = new Promise((resolve, reject) => {
      const sc = root.document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true;
      sc.onload = () => (root.turnstile ? resolve(root.turnstile) : reject(new Error('Turnstile no se inicializó.')));
      sc.onerror = () => { turnstileLoading = null; reject(new Error('No se pudo cargar la verificación de Cloudflare (¿bloqueador de anuncios o sin conexión?).')); };
      root.document.head.appendChild(sc);
    });
    return turnstileLoading;
  }
  /** Devuelve { ok:true, token|null } (null = sin CAPTCHA configurado) o { ok:false, error }. */
  async function getCaptchaToken(opts) {
    if (opts && opts.captchaImpl) return opts.captchaImpl();
    const key = cfg().turnstileSiteKey;
    if (!key || !root.document) return { ok: true, token: null };
    let box = null, id = null;
    try {
      const ts = await loadTurnstile();
      box = root.document.createElement('div'); box.id = 'cloud-captcha';
      box.setAttribute('style', 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#fff;padding:6px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.3)');
      root.document.body.appendChild(box);
      const token = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('La verificación de Cloudflare tardó demasiado. Intenta de nuevo.')), 60000);
        id = ts.render(box, { sitekey: key, callback: (tk) => { clearTimeout(t); resolve(tk); }, 'error-callback': () => { clearTimeout(t); reject(new Error('Cloudflare rechazó la verificación. Revisa que el dominio esté en la lista del widget de Turnstile.')); } });
      });
      return { ok: true, token };
    } catch (e) { return { ok: false, error: e.message }; }
    finally { try { if (id !== null && root.turnstile) root.turnstile.remove(id); } catch (e) { /* ya no existe */ } if (box && box.parentNode) box.parentNode.removeChild(box); }
  }

  async function signInAnonymously(fetchImpl, opts) {
    const cp = await getCaptchaToken(opts); if (!cp.ok) return { ok: false, error: cp.error };
    const f = fetchImpl || root.fetch.bind(root);
    let res; try { res = await f(`${cfg().url}/auth/v1/signup`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(cp.token ? { data: {}, gotrue_meta_security: { captcha_token: cp.token } } : { data: {} }) }); }
    catch (e) { return { ok: false, error: 'No se pudo conectar con Supabase (sin conexión o bloqueado).' }; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) return { ok: false, error: explain(res.status, j) };
    const s = toSession(j); saveSession(s); return { ok: true, session: s };
  }
  async function refresh(s, fetchImpl) {
    const f = fetchImpl || root.fetch.bind(root);
    let res; try { res = await f(`${cfg().url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: s.refresh_token }) }); }
    catch (e) { return { ok: false, error: 'No se pudo conectar con Supabase.' }; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) return { ok: false, error: explain(res.status, j), invalid: res.status === 400 || res.status === 401 };
    const n = toSession(j); n.anonymous = s.anonymous; n.user_id = n.user_id || s.user_id; saveSession(n); return { ok: true, session: n };
  }
  /** Sesión vigente: la guardada (renovada si caduca) o una anónima nueva. */
  async function ensureSession(opts) {
    let s = loadSession();
    if (s && s.expires_at - 60 > Math.floor(Date.now() / 1000)) return { ok: true, session: s, created: false };
    if (s) { const r = await refresh(s, opts && opts.fetchImpl); if (r.ok) return { ok: true, session: r.session, created: false }; if (!r.invalid) return r; }
    if (opts && opts.noCreate) return { ok: false, error: 'Sin sesión.' };
    const r = await signInAnonymously(opts && opts.fetchImpl, opts); return r.ok ? { ok: true, session: r.session, created: true } : r;
  }
  function signOut() { saveSession(null); }


  /* ---------- Cuenta con correo (código de 6 dígitos) ---------- */
  async function authCall(path, { method = 'POST', body, session, fetchImpl, loginCtx } = {}) {
    const f = fetchImpl || root.fetch.bind(root);
    const headers = authHeaders(session ? { Authorization: `Bearer ${session.access_token}` } : {});
    let res; try { res = await f(`${cfg().url}/auth/v1/${path}`, { method, headers, body: JSON.stringify(body || {}) }); }
    catch (e) { return { ok: false, error: 'No se pudo conectar con Supabase (sin conexión o bloqueado).' }; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (loginCtx && (j.error_code === 'signup_disabled' || j.error_code === 'otp_disabled' || /signups not allowed/i.test(j.msg || ''))) return { ok: false, error: 'Ese correo todavía no tiene cuenta. Primero vincúlalo con «Vincular mi correo» desde el navegador donde tienes tu copia.' };
      return { ok: false, error: explain(res.status, j) };
    }
    return { ok: true, json: j };
  }
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

  /** Paso 1 de vincular: pide a Supabase asociar el correo a la sesión anónima y mandar un código. */
  async function linkEmailStart(email, opts) {
    email = String(email || '').trim().toLowerCase();
    if (!validEmail(email)) return { ok: false, error: 'Escribe un correo válido.' };
    const se = await ensureSession(Object.assign({}, opts, { noCreate: true }));
    if (!se.ok) return { ok: false, error: 'Primero sube una copia (se crea la sesión) y luego vincula tu correo.' };
    if (!se.session.anonymous) return { ok: false, error: 'Esta sesión ya tiene un correo vinculado.' };
    const r = await authCall('user', { method: 'PUT', body: { email }, session: se.session, fetchImpl: opts && opts.fetchImpl });
    if (!r.ok) return r;
    if (!r.json.new_email) return { ok: false, error: 'Supabase no pidió confirmar el correo (la opción «Confirm email» está apagada), así que no se enviará código. Actívala en Authentication → Sign In / Providers → Email y vuelve a intentar.' };
    return { ok: true, email };
  }
  /** Paso 2 de vincular: confirma el código. La sesión anónima pasa a ser de ese correo, con los mismos datos. */
  async function linkEmailConfirm(email, code, opts) {
    const r = await authCall('verify', { body: { type: 'email_change', email: String(email).trim().toLowerCase(), token: String(code || '').trim() }, fetchImpl: opts && opts.fetchImpl });
    if (!r.ok) return r;
    if (!r.json.access_token) return { ok: false, error: 'Supabase no devolvió una sesión. Pide un código nuevo.' };
    const sess = toSession(r.json); sess.anonymous = false; saveSession(sess); return { ok: true, session: sess };
  }
  /** Entrar con un correo que ya tiene cuenta (otro equipo, o tras borrar el navegador). */
  async function loginStart(email, opts) {
    email = String(email || '').trim().toLowerCase();
    if (!validEmail(email)) return { ok: false, error: 'Escribe un correo válido.' };
    const cp = await getCaptchaToken(opts); if (!cp.ok) return { ok: false, error: cp.error };
    const body = { email, create_user: false }; if (cp.token) body.gotrue_meta_security = { captcha_token: cp.token };
    const r = await authCall('otp', { body, fetchImpl: opts && opts.fetchImpl, loginCtx: true });
    return r.ok ? { ok: true, email } : r;
  }
  async function loginConfirm(email, code, opts) {
    const r = await authCall('verify', { body: { type: 'email', email: String(email).trim().toLowerCase(), token: String(code || '').trim() }, fetchImpl: opts && opts.fetchImpl });
    if (!r.ok) return r;
    if (!r.json.access_token) return { ok: false, error: 'Supabase no devolvió una sesión. Pide un código nuevo.' };
    const sess = toSession(r.json); sess.anonymous = false; saveSession(sess); return { ok: true, session: sess };
  }

  /* ---------- REST ---------- */
  async function rest(path, { method = 'GET', body, prefer, fetchImpl, session } = {}) {
    const f = fetchImpl || root.fetch.bind(root);
    const headers = authHeaders({ Authorization: `Bearer ${session.access_token}` }); if (prefer) headers.Prefer = prefer;
    let res; try { res = await f(`${cfg().url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw new Error('Sin conexión con Supabase.'); }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(explain(res.status, j)); }
    const t = await res.text(); return t ? JSON.parse(t) : null;
  }

  /* ---------- trozos ---------- */
  function split(text, size) { const out = []; for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size)); return out.length ? out : ['']; }
  function digest(text) {   // suma de verificación simple (FNV-1a 32) para comparar sin releer
    let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16);
  }


  /** Sube un sobre (partido en trozos) y borra trozos sobrantes de una subida anterior más larga. */
  async function putKey(session, key, env, fetchImpl) {
    const table = cfg().table, text = JSON.stringify(env), parts = split(text, cfg().chunkChars), at = (env && env.savedAt && !isNaN(Date.parse(env.savedAt))) ? new Date(env.savedAt).toISOString() : new Date().toISOString();   // updated_at = fecha de guardado del dato: base de «gana el más nuevo»
    const rows = parts.map((p, n) => ({ user_id: session.user_id, key, part: n, total: parts.length, payload: p, bytes: p.length, updated_at: at }));
    for (let b = 0; b < rows.length; b += 4) {
      await rest(`${table}?on_conflict=user_id,key,part`, { method: 'POST', body: rows.slice(b, b + 4), prefer: 'resolution=merge-duplicates,return=minimal', fetchImpl, session });
    }
    await rest(`${table}?key=eq.${encodeURIComponent(key)}&part=gte.${parts.length}`, { method: 'DELETE', fetchImpl, session });
    return { text, parts: parts.length, at };
  }

  /**
   * Sube todas las claves. `provider`: { keys():Promise<string[]>, read(key):Promise<envelope|null> }.
   * Devuelve { ok, keys:[{key,bytes,parts,digest}], bytes } o { ok:false, error }.
   */
  async function upload(provider, { onProgress, fetchImpl, captchaImpl } = {}) {
    const se = await ensureSession({ fetchImpl, captchaImpl }); if (!se.ok) return se;
    const session = se.session, table = cfg().table, size = cfg().chunkChars;
    const skip = new Set(cfg().skipKeys), keys = (await provider.keys()).filter((k) => !skip.has(String(k).split(':')[0]));
    const report = []; let total = 0;
    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], env = await provider.read(key); if (!env) continue;
        if (onProgress) onProgress({ key, index: i + 1, of: keys.length });
        const { text, parts } = await putKey(session, key, env, fetchImpl);
        report.push({ key, bytes: text.length, parts, digest: digest(text) }); total += text.length;
      }
      // claves que ya no existen localmente se quitan de la nube (la copia refleja lo local)
      const names = new Set(report.map((r) => r.key));
      const remote = await rest(`${table}?select=key&part=eq.0`, { fetchImpl, session });
      for (const r of remote || []) if (!names.has(r.key)) await rest(`${table}?key=eq.${encodeURIComponent(r.key)}`, { method: 'DELETE', fetchImpl, session });
    } catch (e) { return { ok: false, error: e.message, keys: report }; }
    return { ok: true, keys: report, bytes: total, userId: session.user_id, at: new Date().toISOString() };
  }

  /** Lee de la nube y arma los sobres. Devuelve { ok, items:[{key,envelope,bytes,digest}] }. */
  async function download({ fetchImpl } = {}) {
    const se = await ensureSession({ fetchImpl, noCreate: true }); if (!se.ok) return { ok: false, error: 'Todavía no hay sesión ni copia en la nube en este navegador.' };
    const session = se.session; let rows;
    try { rows = await rest(`${cfg().table}?select=key,part,total,payload&order=key.asc,part.asc`, { fetchImpl, session }); }
    catch (e) { return { ok: false, error: e.message }; }
    const by = new Map(); (rows || []).forEach((r) => { if (!by.has(r.key)) by.set(r.key, []); by.get(r.key)[r.part] = r; });
    const items = [];
    for (const [key, arr] of by) {
      const total = arr[0] ? arr[0].total : 0;
      if (!arr[0] || arr.length < total || Array.from({ length: total }, (_, i) => arr[i]).some((x) => !x)) return { ok: false, error: `La copia de «${key}» está incompleta en la nube. No se restauró nada.` };
      const text = arr.slice(0, total).map((x) => x.payload).join('');
      let envelope; try { envelope = JSON.parse(text); } catch (e) { return { ok: false, error: `La copia de «${key}» está dañada. No se restauró nada.` }; }
      items.push({ key, envelope, bytes: text.length, digest: digest(text) });
    }
    return { ok: true, items, userId: session.user_id };
  }


  /* ---------- S2: sincronización automática de lo liviano ---------- */
  const AUTO_FLAG = 'fp.cloudAuto';   // fuera del namespace de datos: es una preferencia de este navegador
  const autoOn = () => { try { return root.localStorage.getItem(AUTO_FLAG) === '1'; } catch (e) { return false; } };
  const setAuto = (v) => { try { if (v) root.localStorage.setItem(AUTO_FLAG, '1'); else root.localStorage.removeItem(AUTO_FLAG); } catch (e) { /* sin storage */ } };
  const baseKey = (k) => String(k).split(':')[0];
  /** ¿Esta clave viaja sola? Solo claves chicas, sin secretos y sin preferencias por dispositivo. */
  function isAutoKey(key, isDataKey) {
    const b = baseKey(key);
    return !(isDataKey && isDataKey(key)) && !cfg().skipKeys.includes(b) && !cfg().autoSkipKeys.includes(b);
  }

  /** Sube solo estas claves (sin tocar ni borrar las demás de la nube). */
  async function pushKeys(provider, keys, { fetchImpl, captchaImpl } = {}) {
    const se = await ensureSession({ fetchImpl, captchaImpl }); if (!se.ok) return se;
    let n = 0;
    try { for (const key of keys) { const env = await provider.read(key); if (!env) continue; await putKey(se.session, key, env, fetchImpl); n++; } }
    catch (e) { return { ok: false, error: e.message }; }
    return { ok: true, pushed: n, at: new Date().toISOString() };
  }

  /**
   * Trae las claves chicas que en la nube son MÁS NUEVAS que las locales (gana la última escritura; gracias a updated_at
   * del primer trozo). `provider`: { keys, read, write(key, envelope) }. Devuelve { ok, applied:[keys], pushedNewer:[keys] }.
   */
  async function pullNewer(provider, isDataKey, { fetchImpl } = {}) {
    const se = await ensureSession({ fetchImpl, noCreate: true }); if (!se.ok) return { ok: true, applied: [], none: true };
    const session = se.session, applied = [];
    try {
      const metas = await rest(`${cfg().table}?select=key,total,updated_at&part=eq.0`, { fetchImpl, session });
      for (const m of metas || []) {
        if (!isAutoKey(m.key, isDataKey)) continue;
        const local = await provider.read(m.key);
        const localAt = local && local.savedAt ? Date.parse(local.savedAt) : 0, cloudAt = Date.parse(m.updated_at);
        if (!(cloudAt > localAt + 2000)) continue;
        const parts = await rest(`${cfg().table}?select=part,payload&key=eq.${encodeURIComponent(m.key)}&order=part.asc`, { fetchImpl, session });
        if (!parts || parts.length < m.total || Array.from({ length: m.total }, (_, i) => parts.find((x) => x.part === i)).some((x) => !x)) continue;   // incompleta: no se toca lo local
        let env; try { env = JSON.parse(parts.slice().sort((a, b) => a.part - b.part).map((x) => x.payload).join('')); } catch (e) { continue; }
        if (local && JSON.stringify(local) === JSON.stringify(env)) continue;   // mismo contenido: nada que aplicar
        await provider.write(m.key, env); applied.push(m.key);
      }
    } catch (e) { return { ok: false, error: e.message, applied }; }
    return { ok: true, applied };
  }

  /** Compara lo subido con lo que hay en la nube (claves, tamaño y suma de verificación). */
  async function verify(uploadReport, opts) {
    const d = await download(opts); if (!d.ok) return d;
    const remote = new Map(d.items.map((i) => [i.key, i])); const diffs = [];
    uploadReport.keys.forEach((k) => { const r = remote.get(k.key); if (!r) diffs.push(`${k.key}: falta en la nube`); else if (r.digest !== k.digest || r.bytes !== k.bytes) diffs.push(`${k.key}: no coincide`); });
    remote.forEach((_, key) => { if (!uploadReport.keys.some((k) => k.key === key)) diffs.push(`${key}: sobra en la nube`); });
    return { ok: !diffs.length, diffs, keys: uploadReport.keys.length };
  }

  async function remove({ fetchImpl } = {}) {
    const se = await ensureSession({ fetchImpl, noCreate: true }); if (!se.ok) return { ok: true, nothing: true };
    try { await rest(`${cfg().table}?key=neq.__none__`, { method: 'DELETE', fetchImpl, session: se.session }); } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true };
  }

  FP.cloud = { autoOn, setAuto, isAutoKey, pushKeys, pullNewer, linkEmailStart, linkEmailConfirm, loginStart, loginConfirm, validEmail, getCaptchaToken, loadSession, ensureSession, signInAnonymously, signOut, upload, download, verify, remove, digest, split };
})(typeof window !== 'undefined' ? window : globalThis);
