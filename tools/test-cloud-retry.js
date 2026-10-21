// Nube: reintentos ante fallos temporales (502/520/521/red), lectura por bloques y borrado con avance.  node tools/test-cloud-retry.js
const fs = require('fs'), vm = require('vm');
const store = {};
const ctx = { console, Math, Number, Object, Array, Date, JSON, Intl, String, Map, Set, RegExp, Promise, setTimeout, clearTimeout, Error, encodeURIComponent, isNaN, TextEncoder };
ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
ctx.FP = { config: { cloud: { url: 'https://x.supabase.co', publishableKey: 'pk', table: 'team_blobs', chunkChars: 100, skipKeys: [] } } };
vm.runInContext(fs.readFileSync('js/cloud/cloudSync.js', 'utf8'), ctx);
const C = ctx.FP.cloud; let bad = 0;
const SESSION_KEY = fs.readFileSync('js/cloud/cloudSync.js', 'utf8').match(/SESSION_KEY\s*=\s*'([^']+)'/)[1];
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)), json: async () => body || {} });
(async () => {
  const session = { access_token: 'a' };
  // 1) 521 y luego 200: se recupera solo
  let n = 0; const retries = []; C.setRetryHook((r) => retries.push(r));
  let out = await C.rest('team_blobs?select=key', { session, fetchImpl: async () => (++n < 3 ? res(521) : res(200, [{ key: 'k' }])) });
  t('521, 521 y luego 200: devuelve los datos tras 3 intentos y avisa los reintentos', n === 3 && out[0].key === 'k' && retries.length === 2 && retries[0].status === 521, { n, retries });
  // 2) fallo de red (TypeError) y luego 200
  n = 0; out = await C.rest('team_blobs', { session, fetchImpl: async () => { if (++n < 2) throw new TypeError('Failed to fetch'); return res(200, []); } });
  t('fallo de red una vez: reintenta y funciona', n === 2 && Array.isArray(out));
  // 3) siempre 521: mensaje claro de fallo temporal (no «sin conexión»)
  n = 0; let err = null; try { await C.rest('team_blobs', { session, fetchImpl: async () => { n++; return res(521); } }); } catch (e) { err = e; }
  t('siempre 521: 3 intentos y mensaje «error temporal (521)… no de tu conexión»', n === 3 && err && /error temporal \(521\)/.test(err.message) && /no de tu conexión/.test(err.message), { n, m: err && err.message });
  // 4) siempre fallo de red: mensaje de sin conexión
  n = 0; err = null; try { await C.rest('team_blobs', { session, fetchImpl: async () => { n++; throw new TypeError('x'); } }); } catch (e) { err = e; }
  t('siempre fallo de red: 3 intentos y «Sin conexión con Supabase tras 3 intentos»', n === 3 && /Sin conexión con Supabase tras 3 intentos/.test(err.message));
  // 5) 401/403/404 NO se reintentan
  n = 0; err = null; try { await C.rest('team_blobs', { session, fetchImpl: async () => { n++; return res(401, { message: 'JWT expired' }); } }); } catch (e) { err = e; }
  t('un 401 no se reintenta (es un error real, no temporal)', n === 1 && !!err, { n });
  C.setRetryHook(null);
  // 6) download por bloques: nunca pide todos los payloads en una sola petición
  const rows = { a: ['{"data":', '{"x":1}}'], b: ['{"data":2}'] };
  const urls = [];
  const f = async (u) => {
    urls.push(u); const q = new URL(u).searchParams;
    if (q.get('select') === 'key,part,total,bytes') return res(200, [{ key: 'a', part: 0, total: 2, bytes: 8 }, { key: 'a', part: 1, total: 2, bytes: 8 }, { key: 'b', part: 0, total: 1, bytes: 10 }]);
    const key = q.get('key').replace('eq.', ''), part = Number(q.get('part').replace('eq.', ''));
    return res(200, [{ part, payload: rows[key][part] }]);
  };
  ctx.localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: 'a', expires_at: 9999999999, team_id: 'T', user_id: 'u', email: 'a@b.c' }));
  const prog = [];
  const d = await C.download({ fetchImpl: f, onProgress: (o) => prog.push(o.doneBytes) });
  t('download: arma los sobres y no pide «select=…payload» de todo de una vez', d.ok && d.items.length === 2 && !urls.some((u) => /select=key%2Cpart%2Ctotal%2Cpayload|select=key,part,total,payload/.test(decodeURIComponent(u)) && !/key=eq/.test(decodeURIComponent(u))), { ok: d.ok, urls: urls.slice(0, 5) });
  t('download: informa el avance en bytes (creciente)', prog.length === 3 && prog[2] >= prog[0], prog);
  // 7) remove: borra clave por clave con avance, y barrido final
  const del = []; const pr = [];
  const f2 = async (u, o) => {
    if (o.method === 'DELETE') { del.push(decodeURIComponent(u).split('team_blobs?')[1]); return res(204); }
    return res(200, [{ key: 'a' }, { key: 'b' }]);
  };
  const r = await C.remove({ fetchImpl: f2, onProgress: (o) => pr.push(`${o.index}/${o.of}`) });
  t('remove: borra por clave (a, b), informa 1/2 y 2/2 y hace un barrido final', r.ok && del[0] === 'key=eq.a' && del[1] === 'key=eq.b' && del[2] === 'key=neq.__none__' && pr.join() === '1/2,2/2', { del, pr });
  console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
})();
