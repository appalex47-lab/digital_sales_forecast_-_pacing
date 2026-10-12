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
    if (status === 429) return 'Supabase limitó los intentos por ahora. Espera unos minutos.';
    return `Supabase respondió ${status}${code ? ` (${code})` : ''}${msg ? ': ' + msg : ''}.`;
  }

  async function signInAnonymously(fetchImpl) {
    const f = fetchImpl || root.fetch.bind(root);
    let res; try { res = await f(`${cfg().url}/auth/v1/signup`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ data: {} }) }); }
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
    const r = await signInAnonymously(opts && opts.fetchImpl); return r.ok ? { ok: true, session: r.session, created: true } : r;
  }
  function signOut() { saveSession(null); }

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

  /**
   * Sube todas las claves. `provider`: { keys():Promise<string[]>, read(key):Promise<envelope|null> }.
   * Devuelve { ok, keys:[{key,bytes,parts,digest}], bytes } o { ok:false, error }.
   */
  async function upload(provider, { onProgress, fetchImpl } = {}) {
    const se = await ensureSession({ fetchImpl }); if (!se.ok) return se;
    const session = se.session, table = cfg().table, size = cfg().chunkChars;
    const skip = new Set(cfg().skipKeys), keys = (await provider.keys()).filter((k) => !skip.has(String(k).split(':')[0]));
    const report = []; let total = 0;
    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], env = await provider.read(key); if (!env) continue;
        const text = JSON.stringify(env), parts = split(text, size);
        if (onProgress) onProgress({ key, index: i + 1, of: keys.length });
        const rows = parts.map((p, n) => ({ user_id: session.user_id, key, part: n, total: parts.length, payload: p, bytes: p.length, updated_at: new Date().toISOString() }));
        for (let b = 0; b < rows.length; b += 4) {
          await rest(`${table}?on_conflict=user_id,key,part`, { method: 'POST', body: rows.slice(b, b + 4), prefer: 'resolution=merge-duplicates,return=minimal', fetchImpl, session });
        }
        await rest(`${table}?key=eq.${encodeURIComponent(key)}&part=gte.${parts.length}`, { method: 'DELETE', fetchImpl, session });   // sobrantes de una subida anterior más larga
        report.push({ key, bytes: text.length, parts: parts.length, digest: digest(text) }); total += text.length;
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

  FP.cloud = { loadSession, ensureSession, signInAnonymously, signOut, upload, download, verify, remove, digest, split };
})(typeof window !== 'undefined' ? window : globalThis);
