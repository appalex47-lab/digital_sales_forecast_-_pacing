// Prueba de js/cloud/cloudSync.js con un Supabase simulado (Auth con contraseña + REST + RLS por EQUIPO). Uso: node tools/test-cloud-sync.js
global.window = global; global.FP = { config: { cloud: { url: 'https://x.supabase.co', publishableKey: 'sb_publishable_test', table: 'team_blobs', chunkChars: 50, skipKeys: ['cohereApiKey', 'storageMigration', 'cloudSession'], autoSkipKeys: ['uxSettings', 'productSettings'], turnstileSiteKey: '' } } };
const store = new Map(); global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
require('../js/cloud/cloudSync.js');
const Cl = FP.cloud; let fails = 0;
const ok = (n, c, d) => { if (!c) { fails++; console.log('✘ ' + n + (d ? ' — ' + JSON.stringify(d) : '')); } else console.log('✔ ' + n); };

// --- Supabase simulado ---
const users = new Map(); // email -> {id, password}
const members = new Map(); // user_id -> team_id
const teams = new Map([['T-A', 'Ecommerce'], ['T-B', 'Otra empresa']]);
const rows = []; const tokens = new Map(); let calls = [], needCaptcha = false, lastBody = null, seq = 0;
const addUser = (email, password, team) => { const id = 'u' + (++seq); users.set(email, { id, password }); if (team) members.set(id, team); return id; };
const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj, text: async () => (obj === null ? '' : JSON.stringify(obj)) });
const sessionOf = (id, email, anon) => { const t = 'tok-' + id + '-' + Math.random().toString(36).slice(2, 7); tokens.set(t, id); return { access_token: t, refresh_token: 'r-' + id, expires_in: 3600, user: { id, email, is_anonymous: !!anon } }; };
async function fake(url, o) {
  calls.push(`${o.method} ${url.replace('https://x.supabase.co', '')}`);
  const u = new URL(url), h = o.headers || {};
  if (h.apikey !== 'sb_publishable_test') return resp(401, { message: 'no apikey' });
  if (u.pathname === '/auth/v1/signup') return resp(422, { error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' });
  if (u.pathname === '/auth/v1/token') {
    const b = JSON.parse(o.body); lastBody = b;
    if (u.searchParams.get('grant_type') === 'refresh_token') { const id = String(b.refresh_token).replace('r-', ''); const em = [...users.entries()].find(([, v]) => v.id === id); if (!em) return resp(400, { error: 'bad' }); return resp(200, sessionOf(id, em[0])); }
    if (needCaptcha && !(b.gotrue_meta_security && b.gotrue_meta_security.captcha_token)) return resp(400, { error_code: 'captcha_failed', msg: 'captcha verification process failed' });
    const us = users.get(b.email); if (!us || us.password !== b.password) return resp(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return resp(200, sessionOf(us.id, b.email));
  }
  const uid = tokens.get(String(h.Authorization || '').replace('Bearer ', '')); if (!uid) return resp(401, { message: 'JWT' });
  const email = [...users.entries()].find(([, v]) => v.id === uid)[0], me = users.get(email);
  if (u.pathname === '/auth/v1/user') {
    if (o.method === 'GET') return resp(200, { id: uid, email, is_anonymous: false });
    const b = JSON.parse(o.body); if (b.password === me.password) return resp(422, { error_code: 'same_password', msg: 'New password should be different from the old password.' });
    me.password = b.password; return resp(200, { id: uid });
  }
  const team = members.get(uid) || null;   // RLS: sin equipo no se ve nada
  if (u.pathname === '/rest/v1/team_members') return resp(200, team ? [{ team_id: team, teams: { name: teams.get(team) } }] : []);
  if (!team) return resp(200, []);
  const mine = rows.filter((r) => r.team_id === team);
  if (o.method === 'POST') { JSON.parse(o.body).forEach((r) => { if (r.team_id !== team) throw new Error('RLS: fila de otro equipo'); const i = rows.findIndex((x) => x.team_id === team && x.key === r.key && x.part === r.part); if (i >= 0) rows[i] = r; else rows.push(r); }); return resp(201, null); }
  const q = (k) => u.searchParams.get(k);
  let sel = mine; const kf = q('key'), pf = q('part');
  if (kf && kf.startsWith('eq.')) sel = sel.filter((r) => r.key === kf.slice(3)); if (kf && kf.startsWith('neq.')) sel = sel.filter((r) => r.key !== kf.slice(4));
  if (pf && pf.startsWith('gte.')) sel = sel.filter((r) => r.part >= +pf.slice(4)); if (pf && pf.startsWith('eq.')) sel = sel.filter((r) => r.part === +pf.slice(3));
  if (o.method === 'DELETE') { sel.forEach((r) => rows.splice(rows.indexOf(r), 1)); return resp(204, null); }
  return resp(200, sel.map((r) => ({ key: r.key, part: r.part, total: r.total, payload: r.payload, updated_at: r.updated_at })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.part - b.part)));
}
global.fetch = fake;
addUser('ana@empresa.com', 'clave-ana-1', 'T-A'); addUser('beto@empresa.com', 'clave-beto-1', 'T-A'); addUser('otro@otra.com', 'clave-otro-1', 'T-B'); addUser('sinequipo@empresa.com', 'clave-sin-1', null);
const envs = { settings: { schemaVersion: 1, data: { year: 2026, big: 'x'.repeat(260) } }, 'targets:2026': { schemaVersion: 1, data: { annual: 1000000 } }, cohereApiKey: { data: 'SECRETO' }, actualData: { schemaVersion: 1, data: { rows: ['Café', 'Año', 'ñandú'] } } };
const provider = { keys: async () => Object.keys(envs), read: async (k) => envs[k] };

(async () => {
  // ---- sin sesión ----
  let r = await Cl.upload(provider, {});
  ok('sin sesión: subir pide iniciar sesión y NO crea usuarios ni llama a signup', !r.ok && /Inicia sesión/.test(r.error) && !calls.some((c) => /signup/.test(c)) && rows.length === 0, r);
  const nd = await Cl.download({}); ok('sin sesión: descargar pide iniciar sesión', !nd.ok && /Inicia sesión/.test(nd.error));
  // sesión anónima heredada (de la versión anterior) se descarta
  localStorage.setItem('fp.cloudSession', JSON.stringify({ access_token: 'x', refresh_token: 'r-x', expires_at: 9999999999, user_id: 'old', anonymous: true }));
  r = await Cl.upload(provider, {}); ok('una sesión anónima heredada se descarta y no sirve', !r.ok && Cl.loadSession() === null, r);
  // ---- login ----
  ok('correo inválido se rechaza sin llamar a Supabase', !(await Cl.loginPassword('no-es-correo', 'x', {})).ok);
  ok('sin contraseña se rechaza', /contraseña/.test((await Cl.loginPassword('ana@empresa.com', '', {})).error));
  let l = await Cl.loginPassword('ana@empresa.com', 'mala', {}); ok('contraseña incorrecta: mensaje claro y sin sesión guardada', !l.ok && /incorrectos/.test(l.error) && Cl.loadSession() === null, l);
  l = await Cl.loginPassword('sinequipo@empresa.com', 'clave-sin-1', {}); ok('usuario sin equipo: se explica y NO se guarda sesión', !l.ok && /ningún equipo/.test(l.error) && Cl.loadSession() === null, l);
  needCaptcha = true; l = await Cl.loginPassword('ana@empresa.com', 'clave-ana-1', {}); ok('CAPTCHA exigido y sin token: error claro', !l.ok && /CAPTCHA/.test(l.error), l);
  l = await Cl.loginPassword('ana@empresa.com', 'clave-ana-1', { captchaImpl: async () => ({ ok: true, token: 'TOK' }) }); ok('con token de Turnstile se envía en gotrue_meta_security', l.ok && lastBody.gotrue_meta_security.captcha_token === 'TOK', lastBody);
  needCaptcha = false; Cl.signOut();
  l = await Cl.loginPassword(' ANA@Empresa.com ', 'clave-ana-1', {});
  ok('login correcto: correo normalizado, trae equipo y guarda sesión', l.ok && l.session.email === 'ana@empresa.com' && l.session.team_id === 'T-A' && l.session.team_name === 'Ecommerce' && Cl.loadSession().team_id === 'T-A', l);
  // ---- datos del equipo ----
  r = await Cl.upload(provider, {});
  ok('sube: ok y las filas llevan team_id del equipo', r.ok && rows.length > 0 && rows.every((x) => x.team_id === 'T-A'), r);
  ok('la API key de Cohere NO viaja', !rows.some((x) => x.key === 'cohereApiKey' || /SECRETO/.test(x.payload)));
  ok('claves grandes se parten en trozos', rows.filter((x) => x.key === 'settings').length > 3 && rows.every((x) => x.payload.length <= 50));
  ok('3 bloques de datos reportados', r.keys.length === 3, r.keys.map((k) => k.key));
  const v = await Cl.verify(r, {}); ok('verificación: coincide', v.ok, v);
  let d = await Cl.download({});
  ok('descarga reconstruye idéntico (incl. acentos)', d.ok && JSON.stringify(d.items.find((i) => i.key === 'actualData').envelope) === JSON.stringify(envs.actualData), d.error);
  envs.settings = { schemaVersion: 1, data: { year: 2026 } }; r = await Cl.upload(provider, {});
  ok('re-subida más corta limpia trozos sobrantes', r.ok && rows.filter((x) => x.key === 'settings').length === 1 && (await Cl.verify(r, {})).ok);
  // ---- mismo equipo, otra persona ----
  Cl.signOut(); await Cl.loginPassword('beto@empresa.com', 'clave-beto-1', {});
  d = await Cl.download({}); ok('otra persona del MISMO equipo ve la misma copia', d.ok && d.items.some((i) => i.key === 'settings') && d.items.some((i) => i.key === 'actualData'), d.error);
  const small = { settings: { schemaVersion: 1, data: { year: 2027 } } };
  r = await Cl.upload({ keys: async () => ['settings'], read: async (k) => small[k] }, {});
  ok('subir desde otro navegador NO borra las claves que subió otra persona del equipo', r.ok && rows.some((x) => x.key === 'actualData') && rows.some((x) => x.key === 'targets:2026'), rows.map((x) => x.key));
  ok('esa subida sí actualiza lo suyo para todo el equipo', JSON.parse(rows.filter((x) => x.key === 'settings').sort((a, b) => a.part - b.part).map((x) => x.payload).join('')).data.year === 2027);
  // ---- otro equipo ----
  Cl.signOut(); await Cl.loginPassword('otro@otra.com', 'clave-otro-1', {});
  d = await Cl.download({}); ok('otro equipo NO ve nada del primero (RLS)', d.ok && d.items.length === 0, d);
  await Cl.upload({ keys: async () => ['settings'], read: async () => ({ schemaVersion: 1, data: { year: 1999 } }) }, {});
  ok('otro equipo escribe en lo suyo sin tocar al primero', rows.filter((x) => x.team_id === 'T-B').length === 1 && JSON.parse(rows.filter((x) => x.team_id === 'T-A' && x.key === 'settings').map((x) => x.payload).join('')).data.year === 2027);
  // ---- caducidad, trozo faltante, borrar ----
  const keep = Cl.loadSession(); localStorage.setItem('fp.cloudSession', JSON.stringify(Object.assign({}, keep, { expires_at: 1 })));
  const se = await Cl.ensureSession({}); ok('token caducado: se renueva y conserva el equipo', se.ok && se.session.user_id === keep.user_id && se.session.team_id === 'T-B', se);
  localStorage.setItem('fp.cloudSession', JSON.stringify(Object.assign({}, keep, { expires_at: 1, refresh_token: 'r-inexistente' })));
  const se2 = await Cl.ensureSession({}); ok('sesión que ya no se puede renovar: pide iniciar sesión y la borra', !se2.ok && /venció|Inicia/.test(se2.error) && Cl.loadSession() === null, se2);
  Cl.signOut(); await Cl.loginPassword('ana@empresa.com', 'clave-ana-1', {});
  rows.splice(rows.findIndex((x) => x.team_id === 'T-A' && x.key === 'actualData' && x.part === 0), 1);
  const bad = await Cl.download({}); ok('copia incompleta: se rechaza completa', !bad.ok && /incompleta/.test(bad.error), bad);
  const rm = await Cl.remove({}); ok('borrar quita solo la copia del equipo', rm.ok && !rows.some((x) => x.team_id === 'T-A') && rows.some((x) => x.team_id === 'T-B'));
  ok('no se llamó a ninguna ruta de Auth admin ni de registro', !calls.some((c) => /admin|signup|otp/.test(c)));
  // ---- cambio de contraseña ----
  let pc = await Cl.changePassword('corta', {}); ok('contraseña corta se rechaza sin llamar a Supabase', !pc.ok && /8 caracteres/.test(pc.error));
  pc = await Cl.changePassword('clave-ana-1', {}); ok('misma contraseña: mensaje claro', !pc.ok && /distinta/.test(pc.error), pc);
  pc = await Cl.changePassword('clave-ana-2-nueva', {}); ok('cambio correcto', pc.ok, pc);
  Cl.signOut(); l = await Cl.loginPassword('ana@empresa.com', 'clave-ana-1', {}); ok('la contraseña vieja ya no entra', !l.ok);
  l = await Cl.loginPassword('ana@empresa.com', 'clave-ana-2-nueva', {}); ok('la nueva sí entra', l.ok);
  Cl.signOut(); pc = await Cl.changePassword('otra-clave-larga', {}); ok('sin sesión no se puede cambiar la contraseña', !pc.ok && /inicia sesión/i.test(pc.error));
  // ---- S2: sincronización automática (sobre el equipo) ----
  await Cl.loginPassword('ana@empresa.com', 'clave-ana-2-nueva', {});
  const isData = (k) => ['dataset', 'actualData'].includes(String(k).split(':')[0]);
  ok('claves chicas viajan solas; datos pesados, secretos y preferencias por dispositivo no', Cl.isAutoKey('targets:2026', isData) && !Cl.isAutoKey('actualData', isData) && !Cl.isAutoKey('cohereApiKey', isData) && !Cl.isAutoKey('uxSettings', isData));
  const lsData = { settings: { schemaVersion: 1, savedAt: '2026-10-01T10:00:00.000Z', data: { v: 1 } } };
  const writer = { keys: async () => Object.keys(lsData), read: async (k) => lsData[k] || null, write: async (k, e) => { lsData[k] = e; } };
  FP.config.cloud.chunkChars = 5000; rows.length = 0; const pr = await Cl.pushKeys(writer, ['settings'], {});
  ok('pushKeys sube solo lo pedido y usa la fecha de guardado como updated_at', pr.ok && pr.pushed === 1 && rows.length === 1 && rows[0].updated_at === '2026-10-01T10:00:00.000Z', rows[0]);
  let pl = await Cl.pullNewer(writer, isData, {}); ok('misma fecha y contenido: no trae nada', pl.ok && pl.applied.length === 0, pl);
  rows[0].payload = JSON.stringify({ schemaVersion: 1, savedAt: '2026-10-02T10:00:00.000Z', data: { v: 2 } }); rows[0].updated_at = '2026-10-02T10:00:00.000Z';
  pl = await Cl.pullNewer(writer, isData, {}); ok('lo que cambió otra persona del equipo se trae', pl.applied.join() === 'settings' && lsData.settings.data.v === 2, pl);
  lsData.settings = { schemaVersion: 1, savedAt: '2026-10-03T10:00:00.000Z', data: { v: 3 } };
  pl = await Cl.pullNewer(writer, isData, {}); ok('lo local más nuevo NO se pisa', pl.applied.length === 0 && lsData.settings.data.v === 3, pl);
  rows.push({ team_id: 'T-A', key: 'cohereApiKey', part: 0, total: 1, payload: JSON.stringify({ savedAt: '2099-01-01T00:00:00Z', data: 'X' }), updated_at: '2099-01-01T00:00:00.000Z' });
  pl = await Cl.pullNewer(writer, isData, {}); ok('claves secretas nunca se traen aunque estén en la nube', !pl.applied.includes('cohereApiKey') && !lsData.cohereApiKey, pl);
  Cl.signOut(); pl = await Cl.pullNewer(writer, isData, {}); ok('sin sesión la sincronización automática no hace nada ni falla', pl.ok && pl.applied.length === 0);
  // ---- retorno desde un enlace de Supabase (hash) ----
  const mkLoc = (hash) => { global.location = { hash, pathname: '/app/', search: '', protocol: 'https:', origin: 'https://x.github.io' }; global.history = { replaceState: (a, b, url) => { global.__url = url; global.location.hash = ''; } }; };
  mkLoc('#/'); ok('sin tokens en el hash: no hace nada', (await Cl.consumeAuthHash({})) === null);
  mkLoc('#ajustes'); ok('hash normal de la app: no hace nada', (await Cl.consumeAuthHash({})) === null);
  const ana = users.get('ana@empresa.com'), tk = sessionOf(ana.id, 'ana@empresa.com');
  mkLoc(`#access_token=${tk.access_token}&refresh_token=RT1&expires_in=3600&type=recovery`);
  let h = await Cl.consumeAuthHash({});
  ok('enlace de recuperación: guarda sesión CON equipo y limpia el hash', h.ok && h.type === 'recovery' && Cl.loadSession().team_id === 'T-A' && global.__url === '/app/#ajustes', h);
  Cl.signOut(); const tk2 = sessionOf(users.get('sinequipo@empresa.com').id, 'sinequipo@empresa.com');
  mkLoc(`#access_token=${tk2.access_token}&refresh_token=RT1&expires_in=3600&type=recovery`);
  h = await Cl.consumeAuthHash({}); ok('enlace de usuario sin equipo: error claro y sin sesión', !h.ok && /ningún equipo/.test(h.error) && Cl.loadSession() === null, h);
  mkLoc('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  h = await Cl.consumeAuthHash({}); ok('enlace vencido: mensaje claro', !h.ok && /venció|ya se usó/.test(h.error), h);
  ok('redirectUrl apunta a la app sin hash', Cl.redirectUrl() === 'https://x.github.io/app/', Cl.redirectUrl());
  console.log(fails ? `\n${fails} fallas` : '\nTodo OK'); process.exit(fails ? 1 : 0);
})();
