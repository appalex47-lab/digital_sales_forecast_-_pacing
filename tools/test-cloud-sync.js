// Prueba de js/cloud/cloudSync.js con un Supabase simulado (Auth + REST + RLS por usuario). Uso: node tools/test-cloud-sync.js
global.window = global; global.FP = { config: { cloud: { url: 'https://x.supabase.co', publishableKey: 'sb_publishable_test', table: 'cloud_blobs', chunkChars: 50, skipKeys: ['cohereApiKey', 'storageMigration', 'cloudSession'] } } };
const store = new Map(); global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
require('../js/cloud/cloudSync.js');
const Cl = FP.cloud; let fails = 0;
const ok = (n, c, d) => { if (!c) { fails++; console.log('✘ ' + n + (d ? ' — ' + JSON.stringify(d) : '')); } else console.log('✔ ' + n); };

// --- Supabase simulado ---
let mode = '', anonEnabled = true, users = 0; const rows = []; const tokens = new Map(); let calls = [];
const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj, text: async () => (obj === null ? '' : JSON.stringify(obj)) });
async function fake(url, o) {
  calls.push(`${o.method} ${url.replace('https://x.supabase.co', '')}`);
  const u = new URL(url), h = o.headers || {};
  if (h.apikey !== 'sb_publishable_test') return resp(401, { message: 'no apikey' });
  if (u.pathname === '/auth/v1/signup') { if (mode === 'nosignup') return resp(422, { error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' }); if (!anonEnabled) return resp(422, { error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' }); const id = 'user-' + (++users); const t = 'tok-' + id; tokens.set(t, id); return resp(200, { access_token: t, refresh_token: 'r-' + id, expires_in: 3600, user: { id, is_anonymous: true } }); }
  if (u.pathname === '/auth/v1/token') { const b = JSON.parse(o.body); const id = String(b.refresh_token).replace('r-', ''); if (!b.refresh_token.startsWith('r-')) return resp(400, { error: 'bad' }); const t = 'tok2-' + id; tokens.set(t, id); return resp(200, { access_token: t, refresh_token: b.refresh_token, expires_in: 3600, user: { id, is_anonymous: true } }); }
  const uid = tokens.get(String(h.Authorization || '').replace('Bearer ', '')); if (!uid) return resp(401, { message: 'JWT' });
  const mine = rows.filter((r) => r.user_id === uid);
  if (o.method === 'POST') { JSON.parse(o.body).forEach((r) => { if (r.user_id !== uid) throw new Error('RLS'); const i = rows.findIndex((x) => x.user_id === uid && x.key === r.key && x.part === r.part); if (i >= 0) rows[i] = r; else rows.push(r); }); return resp(201, null); }
  const q = (k) => u.searchParams.get(k);
  let sel = mine; const kf = q('key'), pf = q('part');
  if (kf && kf.startsWith('eq.')) sel = sel.filter((r) => r.key === kf.slice(3)); if (kf && kf.startsWith('neq.')) sel = sel.filter((r) => r.key !== kf.slice(4));
  if (pf && pf.startsWith('gte.')) sel = sel.filter((r) => r.part >= +pf.slice(4)); if (pf && pf.startsWith('eq.')) sel = sel.filter((r) => r.part === +pf.slice(3));
  if (o.method === 'DELETE') { sel.forEach((r) => rows.splice(rows.indexOf(r), 1)); return resp(204, null); }
  return resp(200, sel.map((r) => ({ key: r.key, part: r.part, total: r.total, payload: r.payload })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.part - b.part)));
}
global.fetch = fake;

const envs = { settings: { schemaVersion: 1, data: { year: 2026, big: 'x'.repeat(260) } }, 'targets:2026': { schemaVersion: 1, data: { annual: 1000000 } }, cohereApiKey: { data: 'SECRETO' }, actualData: { data: { rows: Array.from({ length: 30 }, (_, i) => [i, 'é', i * 1.5]) } } };
const provider = { keys: async () => Object.keys(envs), read: async (k) => envs[k] };

(async () => {
  mode = 'nosignup'; let r0 = await Cl.upload(provider, {});
  ok('registro apagado: mensaje apunta a «Allow new users to sign up»', !r0.ok && /Allow new users to sign up/.test(r0.error), r0); mode = '';
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
  console.log(fails ? `\n${fails} fallas` : '\nTodo OK'); process.exit(fails ? 1 : 0);
})();
