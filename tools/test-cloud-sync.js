// Prueba de js/cloud/cloudSync.js con un Supabase simulado (Auth + REST + RLS por usuario). Uso: node tools/test-cloud-sync.js
global.window = global; global.FP = { config: { cloud: { url: 'https://x.supabase.co', publishableKey: 'sb_publishable_test', table: 'cloud_blobs', chunkChars: 50, skipKeys: ['cohereApiKey', 'storageMigration', 'cloudSession'], autoSkipKeys: ['uxSettings', 'productSettings'] } } };
const store = new Map(); global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
require('../js/cloud/cloudSync.js');
const Cl = FP.cloud; let fails = 0;
const ok = (n, c, d) => { if (!c) { fails++; console.log('✘ ' + n + (d ? ' — ' + JSON.stringify(d) : '')); } else console.log('✔ ' + n); };

// --- Supabase simulado ---
let lastOtpBody = null, lastSignupBody = null, needCaptcha = false, mode = '', anonEnabled = true, users = 0; const rows = []; const tokens = new Map(); let calls = [];
const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj, text: async () => (obj === null ? '' : JSON.stringify(obj)) });
async function fake(url, o) {
  calls.push(`${o.method} ${url.replace('https://x.supabase.co', '')}`);
  const u = new URL(url), h = o.headers || {};
  if (h.apikey !== 'sb_publishable_test') return resp(401, { message: 'no apikey' });
  if (u.pathname === '/auth/v1/signup') { lastSignupBody = JSON.parse(o.body || '{}'); if (needCaptcha && !(lastSignupBody.gotrue_meta_security && lastSignupBody.gotrue_meta_security.captcha_token)) return resp(400, { error_code: 'captcha_failed', msg: 'captcha verification process failed' }); if (mode === 'nosignup') return resp(422, { error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' }); if (!anonEnabled) return resp(422, { error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' }); const id = 'user-' + (++users); const t = 'tok-' + id; tokens.set(t, id); return resp(200, { access_token: t, refresh_token: 'r-' + id, expires_in: 3600, user: { id, is_anonymous: true } }); }
  if (u.pathname === '/auth/v1/token') { const b = JSON.parse(o.body); const id = String(b.refresh_token).replace('r-', ''); if (!b.refresh_token.startsWith('r-')) return resp(400, { error: 'bad' }); const t = 'tok2-' + id; tokens.set(t, id); return resp(200, { access_token: t, refresh_token: b.refresh_token, expires_in: 3600, user: { id, is_anonymous: true } }); }
  const emails = (global.__emails = global.__emails || new Map()), pend = (global.__pend = global.__pend || new Map());
  const sessOf = (id, anon, email) => { const t = 'tokE-' + id + '-' + Math.random().toString(36).slice(2, 6); tokens.set(t, id); return { access_token: t, refresh_token: 'r-' + id, expires_in: 3600, user: { id, is_anonymous: anon, email } }; };
  if (u.pathname === '/auth/v1/user' && o.method === 'PUT') { const id = tokens.get(String(h.Authorization || '').replace('Bearer ', '')); if (!id) return resp(401, {}); const em = JSON.parse(o.body).email; if ([...emails.values()].includes(em)) return resp(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' }); if (global.__noConfirm) { emails.set(id, em); return resp(200, { id, email: em }); } pend.set(id, em); return resp(200, { id, new_email: em }); }
  if (u.pathname === '/auth/v1/verify') { const b = JSON.parse(o.body); if (b.type === 'email_change') { const id = [...pend.entries()].find(([, e]) => e === b.email); if (!id || b.token !== '123456') return resp(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); emails.set(id[0], b.email); pend.delete(id[0]); return resp(200, sessOf(id[0], false, b.email)); }
    const id = [...emails.entries()].find(([, e]) => e === b.email); if (!id || b.token !== '654321') return resp(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); return resp(200, sessOf(id[0], false, b.email)); }
  if (u.pathname === '/auth/v1/otp') { const b = JSON.parse(o.body); lastOtpBody = b; if (needCaptcha && !(b.gotrue_meta_security && b.gotrue_meta_security.captcha_token)) return resp(400, { error_code: 'captcha_failed', msg: 'captcha verification process failed' }); if (![...emails.values()].includes(b.email)) return resp(422, { error_code: 'signup_disabled', msg: 'Signups not allowed for otp' }); return resp(200, {}); }
  const uid = tokens.get(String(h.Authorization || '').replace('Bearer ', '')); if (!uid) return resp(401, { message: 'JWT' });
  const mine = rows.filter((r) => r.user_id === uid);
  if (o.method === 'POST') { JSON.parse(o.body).forEach((r) => { if (r.user_id !== uid) throw new Error('RLS'); const i = rows.findIndex((x) => x.user_id === uid && x.key === r.key && x.part === r.part); if (i >= 0) rows[i] = r; else rows.push(r); }); return resp(201, null); }
  const q = (k) => u.searchParams.get(k);
  let sel = mine; const kf = q('key'), pf = q('part');
  if (kf && kf.startsWith('eq.')) sel = sel.filter((r) => r.key === kf.slice(3)); if (kf && kf.startsWith('neq.')) sel = sel.filter((r) => r.key !== kf.slice(4));
  if (pf && pf.startsWith('gte.')) sel = sel.filter((r) => r.part >= +pf.slice(4)); if (pf && pf.startsWith('eq.')) sel = sel.filter((r) => r.part === +pf.slice(3));
  if (o.method === 'DELETE') { sel.forEach((r) => rows.splice(rows.indexOf(r), 1)); return resp(204, null); }
  return resp(200, sel.map((r) => ({ key: r.key, part: r.part, total: r.total, payload: r.payload, updated_at: r.updated_at })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.part - b.part)));
}
global.fetch = fake;

const envs = { settings: { schemaVersion: 1, data: { year: 2026, big: 'x'.repeat(260) } }, 'targets:2026': { schemaVersion: 1, data: { annual: 1000000 } }, cohereApiKey: { data: 'SECRETO' }, actualData: { data: { rows: Array.from({ length: 30 }, (_, i) => [i, 'é', i * 1.5]) } } };
const provider = { keys: async () => Object.keys(envs), read: async (k) => envs[k] };

(async () => {
  mode = 'nosignup'; let r0 = await Cl.upload(provider, {});
  ok('registro apagado: mensaje apunta a «Allow new users to sign up»', !r0.ok && /Allow new users to sign up/.test(r0.error), r0); mode = '';
  needCaptcha = true; Cl.signOut();
  let rc = await Cl.upload(provider, {});
  ok('CAPTCHA exigido y sin token: mensaje claro, sin usuario', !rc.ok && /CAPTCHA/.test(rc.error) && users === 0, rc);
  rc = await Cl.upload(provider, { captchaImpl: async () => ({ ok: true, token: 'TOK-123' }) });
  ok('con token de Turnstile: el registro lo envía en gotrue_meta_security', rc.ok && lastSignupBody.gotrue_meta_security.captcha_token === 'TOK-123', lastSignupBody);
  rc = await Cl.upload(provider, { captchaImpl: async () => ({ ok: false, error: 'Cloudflare rechazó la verificación.' }) }); // ya hay sesión: no pide otra
  ok('con sesión vigente no se vuelve a pedir CAPTCHA', rc.ok);
  needCaptcha = false; Cl.signOut(); users = 0; rows.length = 0; tokens.clear();
  anonEnabled = false;
  let r = await Cl.upload(provider, {});
  ok('anónimos desactivados: error claro y sin filas', !r.ok && /anónimos están desactivados/.test(r.error) && rows.length === 0, r);
  anonEnabled = true;
  r = await Cl.upload(provider, {});
  ok('sube: ok, sesión anónima creada', r.ok && users === 1 && Cl.loadSession().anonymous === true, r);
  ok('la API key de Cohere NO viaja', !rows.some((x) => x.key === 'cohereApiKey' || /SECRETO/.test(x.payload)));
  ok('claves grandes se parten en trozos', rows.filter((x) => x.key === 'settings').length > 3 && rows.every((x) => x.payload.length <= 50));
  ok('3 bloques de datos reportados', r.keys.length === 3, r.keys.map((k) => k.key));
  const v = await Cl.verify(r, {});
  ok('verificación: coincide', v.ok, v);
  const d = await Cl.download({});
  ok('descarga reconstruye idéntico (incl. acentos)', d.ok && JSON.stringify(d.items.find((i) => i.key === 'actualData').envelope) === JSON.stringify(envs.actualData) && JSON.stringify(d.items.find((i) => i.key === 'settings').envelope) === JSON.stringify(envs.settings), d.error);
  // volver a subir con datos más cortos: no deben quedar trozos viejos
  envs.settings = { schemaVersion: 1, data: { year: 2026 } }; r = await Cl.upload(provider, {});
  ok('re-subida más corta limpia trozos sobrantes', r.ok && rows.filter((x) => x.key === 'settings').length === 1 && (await Cl.verify(r, {})).ok);
  // clave local eliminada → se quita de la nube
  delete envs['targets:2026']; r = await Cl.upload(provider, {});
  ok('clave borrada localmente se quita de la nube', r.ok && !rows.some((x) => x.key === 'targets:2026'));
  // otro usuario no ve nada
  const keep = Cl.loadSession(); Cl.signOut(); await Cl.signInAnonymously();
  const d2 = await Cl.download({});
  ok('otra sesión anónima no ve la copia (RLS)', d2.ok && d2.items.length === 0, d2);
  // sesión caducada → renueva con refresh
  localStorage.setItem('fp.cloudSession', JSON.stringify(Object.assign({}, keep, { expires_at: 1 })));
  const n0 = users; const se = await Cl.ensureSession({});
  ok('token caducado: se renueva sin crear usuario nuevo', se.ok && users === n0 && se.session.user_id === keep.user_id, se);
  // trozo faltante → no restaura
  rows.splice(rows.findIndex((x) => x.user_id === keep.user_id && x.key === 'actualData' && x.part === 1), 1);
  const bad = await Cl.download({}); ok('copia incompleta: se rechaza completa', !bad.ok && /incompleta/.test(bad.error), bad);
  // sin sesión: descargar no crea usuario
  Cl.signOut(); const n1 = users; const nd = await Cl.download({});
  ok('sin sesión: descargar no crea usuarios', !nd.ok && users === n1);
  // borrar
  await Cl.signInAnonymously(); const rm = await Cl.remove({}); ok('borrar copia', rm.ok);
  ok('no se llamó a ninguna ruta de Auth admin', !calls.some((c) => /admin/.test(c)));

  // ---- cuenta con correo ----
  Cl.signOut(); users = 0; rows.length = 0; tokens.clear(); global.__emails = new Map(); global.__pend = new Map();
  await Cl.upload(provider, {});   // crea sesión anónima y sube
  const anonId = Cl.loadSession().user_id;
  let e1 = await Cl.linkEmailStart('no-es-correo', {}); ok('correo inválido se rechaza sin llamar a Supabase', !e1.ok && /válido/.test(e1.error));
  global.__noConfirm = true; e1 = await Cl.linkEmailStart('a@x.com', {}); global.__noConfirm = false; global.__emails = new Map();
  ok('«Confirm email» apagado: se explica y no se promete código', !e1.ok && /Confirm email/.test(e1.error), e1);
  e1 = await Cl.linkEmailStart('A@X.com', {}); ok('vincular: pide código (correo normalizado)', e1.ok && e1.email === 'a@x.com', e1);
  let e2 = await Cl.linkEmailConfirm('a@x.com', '000000', {}); ok('código incorrecto: mensaje claro, sigue anónima', !e2.ok && /incorrecto|venció/.test(e2.error) && Cl.loadSession().anonymous === true, e2);
  e2 = await Cl.linkEmailConfirm('a@x.com', '123456', {});
  ok('código correcto: misma cuenta (mismo user_id), ya no anónima y con correo', e2.ok && Cl.loadSession().user_id === anonId && Cl.loadSession().anonymous === false && Cl.loadSession().email === 'a@x.com', Cl.loadSession());
  const dl = await Cl.download({}); ok('tras vincular sigue viendo su copia', dl.ok && dl.items.length >= 2, dl.error);
  let e3 = await Cl.linkEmailStart('b@x.com', {}); ok('si ya tiene correo no se vuelve a vincular', !e3.ok && /ya tiene un correo/.test(e3.error));
  // otro equipo: sesión nueva anónima intenta vincular el mismo correo
  Cl.signOut(); await Cl.signInAnonymously(); let e4 = await Cl.linkEmailStart('a@x.com', {});
  ok('correo ya usado: indica «Entrar con mi correo»', !e4.ok && /Entrar con mi correo/.test(e4.error), e4);
  // entrar con correo (otro equipo)
  Cl.signOut(); let l0 = await Cl.loginStart('zz@x.com', {}); ok('login con correo sin cuenta: mensaje para vincular primero', !l0.ok && /todavía no tiene cuenta/.test(l0.error), l0);
  let l1 = await Cl.loginStart('a@x.com', {}); ok('login: pide código sin crear usuarios', l1.ok && lastOtpBody.create_user === false, lastOtpBody);
  needCaptcha = true; let l1c = await Cl.loginStart('a@x.com', {}); ok('login con CAPTCHA exigido y sin token: error claro', !l1c.ok && /CAPTCHA/.test(l1c.error), l1c);
  l1c = await Cl.loginStart('a@x.com', { captchaImpl: async () => ({ ok: true, token: 'T9' }) }); ok('login con CAPTCHA: envía el token', l1c.ok && lastOtpBody.gotrue_meta_security.captcha_token === 'T9', lastOtpBody); needCaptcha = false;
  let l2 = await Cl.loginConfirm('a@x.com', '654321', {});
  ok('login confirmado: misma cuenta que la original', l2.ok && Cl.loadSession().user_id === anonId && !Cl.loadSession().anonymous, l2);
  const dl2 = await Cl.download({}); ok('desde el otro equipo se restaura la misma copia', dl2.ok && dl2.items.some((i) => i.key === 'settings'), dl2.error);
  // ---- S2: sincronización automática ----
  const isData = (k) => ['dataset', 'actualData'].includes(String(k).split(':')[0]);
  ok('claves chicas viajan solas; datos pesados, secretos y preferencias por dispositivo no', Cl.isAutoKey('targets:2026', isData) && !Cl.isAutoKey('actualData', isData) && !Cl.isAutoKey('cohereApiKey', isData) && !Cl.isAutoKey('uxSettings', isData) && !Cl.isAutoKey('cloudSession', isData));
  const lsData = { settings: { schemaVersion: 1, savedAt: '2026-10-01T10:00:00.000Z', data: { v: 1 } } };
  const writer = { keys: async () => Object.keys(lsData), read: async (k) => lsData[k] || null, write: async (k, e) => { lsData[k] = e; } };
  FP.config.cloud.chunkChars = 5000; rows.length = 0; const pr = await Cl.pushKeys(writer, ['settings'], {});
  ok('pushKeys sube solo lo pedido y usa la fecha de guardado como updated_at', pr.ok && pr.pushed === 1 && rows.length === 1 && rows[0].updated_at === '2026-10-01T10:00:00.000Z', rows[0]);
  let pl = await Cl.pullNewer(writer, isData, {}); ok('misma fecha y contenido: no trae nada', pl.ok && pl.applied.length === 0, pl);
  rows[0].payload = JSON.stringify({ schemaVersion: 1, savedAt: '2026-10-02T10:00:00.000Z', data: { v: 2 } }); rows[0].updated_at = '2026-10-02T10:00:00.000Z';
  pl = await Cl.pullNewer(writer, isData, {}); ok('la nube más nueva se trae y conserva su fecha', pl.applied.join() === 'settings' && lsData.settings.data.v === 2 && lsData.settings.savedAt === '2026-10-02T10:00:00.000Z', lsData);
  lsData.settings = { schemaVersion: 1, savedAt: '2026-10-03T10:00:00.000Z', data: { v: 3 } };
  pl = await Cl.pullNewer(writer, isData, {}); ok('lo local más nuevo NO se pisa con lo viejo de la nube', pl.applied.length === 0 && lsData.settings.data.v === 3, pl);
  rows.push({ user_id: Cl.loadSession().user_id, key: 'cohereApiKey', part: 0, total: 1, payload: JSON.stringify({ savedAt: '2099-01-01T00:00:00Z', data: 'X' }), updated_at: '2099-01-01T00:00:00.000Z' });
  pl = await Cl.pullNewer(writer, isData, {}); ok('claves secretas nunca se traen aunque estén en la nube', !pl.applied.includes('cohereApiKey') && !lsData.cohereApiKey, pl);
  console.log(fails ? `\n${fails} fallas` : '\nTodo OK'); process.exit(fails ? 1 : 0);
})();
