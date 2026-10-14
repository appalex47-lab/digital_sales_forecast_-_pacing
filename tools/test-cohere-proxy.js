// Proxy de Cohere: Edge Function (handler) y modo servidor del cliente.  node tools/test-cohere-proxy.js  (desde la raíz)
const fs = require('fs'), vm = require('vm'), path = require('path');
let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); if (!c) bad++; };
const COHERE_KEY = 'COHERE-SERVER-SECRET-123', USER_TOKEN = 'user-jwt-abc';

(async () => {
  const { handle, sanitize } = await import(path.resolve('supabase/functions/cohere-proxy/handler.js'));
  // ---------- servidor simulado ----------
  let upstream = [], authCalls = 0, cfg = { cohereStatus: 200, user: { id: 'u1', is_anonymous: false }, members: [{ team_id: 'T' }], authOk: true, cohereThrows: false };
  const fakeFetch = async (url, o = {}) => {
    const h = o.headers || {};
    if (url.endsWith('/auth/v1/user')) { authCalls++; return cfg.authOk && h.Authorization === `Bearer ${USER_TOKEN}` ? { ok: true, status: 200, json: async () => cfg.user } : { ok: false, status: 401, json: async () => ({}) }; }
    if (url.includes('/rest/v1/team_members')) return { ok: true, status: 200, json: async () => cfg.members };
    if (url === 'https://api.cohere.com/v2/chat') {
      if (cfg.cohereThrows) throw new Error('boom ' + COHERE_KEY);
      upstream.push({ headers: h, body: JSON.parse(o.body) });
      return { ok: cfg.cohereStatus < 300, status: cfg.cohereStatus, text: async () => JSON.stringify({ message: { content: [{ text: '{"ok":true}' }] }, echo: 'SENT-DATA' }) };
    }
    throw new Error('URL inesperada ' + url);
  };
  const ENV = { COHERE_API_KEY: COHERE_KEY, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', ALLOWED_ORIGINS: 'https://app.example.com' };
  const deps = (over = {}) => ({ env: (k) => ({ ...ENV, ...over })[k], fetch: fakeFetch });
  const good = { model: 'command-a-03-2025', temperature: 0.2, messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], response_format: { type: 'json_object', json_schema: { type: 'object' } } };
  const req = (body, { token = USER_TOKEN, origin = 'https://app.example.com', method = 'POST' } = {}) => new Request('https://x.supabase.co/functions/v1/cohere-proxy', { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  const run = async (r, over) => { const res = await handle(r, deps(over)); let j = null; const tx = await res.text(); try { j = JSON.parse(tx); } catch (e) { /* vacío */ } return { status: res.status, json: j, text: tx, headers: res.headers }; };

  let r = await run(req(good));
  t('camino feliz: 200, reenvía a Cohere con la key DEL SERVIDOR', r.status === 200 && upstream.length === 1 && upstream[0].headers.Authorization === `Bearer ${COHERE_KEY}`, { s: r.status, up: upstream.length });
  t('a Cohere solo viajan los campos permitidos y el contenido intacto', JSON.stringify(Object.keys(upstream[0].body).sort()) === JSON.stringify(['messages', 'model', 'response_format', 'temperature']) && upstream[0].body.messages[1].content === 'u');
  t('la respuesta de Cohere se devuelve tal cual', r.json.message.content[0].text === '{"ok":true}');
  t('CORS: devuelve el origen permitido', r.headers.get('access-control-allow-origin') === 'https://app.example.com');
  t('la key de Cohere nunca aparece en la respuesta', !r.text.includes(COHERE_KEY));

  const pre = await handle(req(null, { method: 'OPTIONS' }), deps()); t('preflight OPTIONS de origen permitido → 204', pre.status === 204 && pre.headers.get('access-control-allow-methods').includes('POST'));
  const pre2 = await handle(req(null, { method: 'OPTIONS', origin: 'https://evil.example' }), deps()); t('preflight de origen NO permitido → 403 sin cabeceras CORS', pre2.status === 403 && !pre2.headers.get('access-control-allow-origin'));
  r = await run(req(good, { origin: 'https://evil.example' })); t('POST desde origen no permitido → 403', r.status === 403 && r.json.error.code === 'origin_not_allowed');
  r = await run(req(null, { method: 'GET' })); t('GET → 405', r.status === 405);

  upstream = [];
  r = await run(req(good, { token: null })); t('sin Authorization → 401 no_session y NO llama a Cohere', r.status === 401 && r.json.error.code === 'no_session' && !upstream.length);
  r = await run(req(good, { token: 'otro-token' })); t('token inválido → 401 y NO llama a Cohere', r.status === 401 && !upstream.length);
  cfg.user = { id: 'a1', is_anonymous: true }; r = await run(req(good)); t('sesión anónima → 401 y NO llama a Cohere', r.status === 401 && !upstream.length); cfg.user = { id: 'u1', is_anonymous: false };
  cfg.members = []; r = await run(req(good)); t('usuario sin equipo → 403 no_team y NO llama a Cohere', r.status === 403 && r.json.error.code === 'no_team' && !upstream.length); cfg.members = [{ team_id: 'T' }];
  r = await run(req(good), { COHERE_API_KEY: '' }); t('sin secreto COHERE_API_KEY → 503 not_configured (explica qué falta)', r.status === 503 && r.json.error.code === 'not_configured' && /COHERE_API_KEY/.test(r.json.error.message));
  r = await run(req(good), { SUPABASE_URL: '' }); t('sin configuración de Supabase → 500', r.status === 500);

  const bads = [['modelo no permitido', { ...good, model: 'gpt-4' }], ['mensajes vacíos', { ...good, messages: [] }], ['rol inválido', { ...good, messages: [{ role: 'tool', content: 'x' }] }], ['contenido no texto', { ...good, messages: [{ role: 'user', content: { a: 1 } }] }], ['temperatura fuera de rango', { ...good, temperature: 5 }], ['response_format raro', { ...good, response_format: { type: 'text' } }], ['demasiados mensajes', { ...good, messages: Array.from({ length: 20 }, () => ({ role: 'user', content: 'x' })) }]];
  for (const [n, b] of bads) { r = await run(req(b)); t(`rechaza: ${n} (400) y no llama a Cohere`, r.status === 400 && !upstream.length, r.status); }
  r = await run(req('no es json')); t('JSON inválido → 400', r.status === 400 && r.json.error.code === 'bad_json');
  r = await run(req({ ...good, messages: [{ role: 'user', content: 'x'.repeat(1_100_000) }] })); t('petición enorme → 413', r.status === 413 && !upstream.length);
  const s = sanitize({ ...good, tools: [{ x: 1 }], documents: ['d'], connectors: ['c'], stream: true, max_tokens: 99999 });
  t('descarta tools/documents/connectors/stream y acota max_tokens', !('tools' in s.body) && !('documents' in s.body) && !('connectors' in s.body) && !('stream' in s.body) && s.body.max_tokens === 4000, s);

  for (const [code, status, expect] of [[401, 502, 'cohere_auth'], [403, 502, 'cohere_auth'], [429, 429, 'cohere_quota'], [500, 502, 'cohere_server'], [400, 400, 'cohere_http']]) {
    cfg.cohereStatus = code; r = await run(req(good));
    t(`Cohere ${code} → ${status} ${expect}, sin reenviar su cuerpo ni la key (un 401 de Cohere NO parece sesión vencida)`, r.status === status && r.json.error.code === expect && !r.text.includes('SENT-DATA') && !r.text.includes(COHERE_KEY), r);
  }
  cfg.cohereStatus = 200; cfg.cohereThrows = true; r = await run(req(good)); t('Cohere no responde → 504 sin filtrar el mensaje original (que traía la key)', r.status === 504 && !r.text.includes(COHERE_KEY), r.text); cfg.cohereThrows = false;

  // ---------- cliente: modo servidor ----------
  const html = fs.readFileSync('index.html', 'utf8');
  const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]).filter((f) => !/js\/(ui|app|worker)/.test(f));
  const store = new Map(); const ctx = { console, Math, Date, JSON, Map, Set, Intl, Number, String, Array, Object, RegExp, Error, Promise, setTimeout, clearTimeout, parseFloat, isNaN, Symbol, Uint8Array, TextEncoder, AbortController, Response, Request };
  ctx.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
  srcs.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  const FP = ctx.FP, SK = 'fp.cloudSession', PK = 'LOCAL-USER-KEY-999';
  const sess = (o = {}) => store.set(SK, JSON.stringify({ access_token: USER_TOKEN, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: 'u1', email: 'a@x.com', anonymous: false, team_id: 'T', team_name: 'Ecommerce', ...o }));
  const calls = [];
  const mkFetch = (respond) => async (url, o) => { calls.push({ url, headers: o.headers, body: o.body }); return respond(url, o); };
  const okResp = () => ({ ok: true, status: 200, json: async () => ({ message: { content: [{ text: '{"ok":true}' }] } }), clone() { return this; } });
  const errResp = (status, code) => ({ ok: false, status, json: async () => (code ? { error: { code } } : {}), clone() { return this; } });
  const chat = (over = {}, resp = okResp) => FP.cohereClient.chatJson({ system: 's', user: 'u', schema: {}, apiKey: '', fetchImpl: mkFetch(resp), ...over });

  store.clear(); t('sin sesión: el proxy no está disponible', FP.cohereProxy.available() === false);
  let c = await chat(); t('sin sesión y sin key: no sale ninguna llamada y el mensaje dice cómo resolverlo', c.ok === false && c.sent === false && !calls.length && /inicia sesión/i.test(c.errors[0]), c);
  sess(); t('con sesión de equipo: el proxy está disponible', FP.cohereProxy.available() === true);
  store.set(SK, JSON.stringify({ ...JSON.parse(store.get(SK)), anonymous: true })); t('sesión anónima no cuenta', FP.cohereProxy.available() === false); sess();
  calls.length = 0; c = await chat();
  t('con sesión: llama al proxy (URL de Supabase) con el token del usuario y SIN la key de Cohere', c.ok && c.via === 'server' && calls.length === 1 && calls[0].url.endsWith('/functions/v1/cohere-proxy') && calls[0].headers.Authorization === `Bearer ${USER_TOKEN}` && !JSON.stringify(calls[0]).includes('api.cohere.com'), calls[0]);
  calls.length = 0; c = await chat({ apiKey: PK });
  t('aunque haya key local, con sesión se prefiere el servidor y la key local NO sale del navegador', c.via === 'server' && !JSON.stringify(calls).includes(PK), calls);
  calls.length = 0; c = await chat({ apiKey: PK }, (u) => (u.includes('/functions/v1/') ? errResp(404) : okResp()));
  t('servidor no instalado (404) + key local → respaldo directo a Cohere, que responde ok', c.ok === true && c.via === 'browser', c);
  const fb = calls.map((x) => x.url); t('el respaldo llamó primero al proxy y luego a Cohere', fb.length === 2 && fb[0].includes('/functions/v1/') && fb[1] === 'https://api.cohere.com/v2/chat', fb);
  calls.length = 0; c = await chat({}, () => errResp(404));
  t('servidor no instalado y sin key: mensaje claro (proxy_setup)', c.ok === false && c.errorKind === 'proxy_setup' && /cohere-proxy/.test(c.errors[0]), c);
  c = await chat({}, () => errResp(503, 'not_configured')); t('servidor sin secreto: dice que falta COHERE_API_KEY', c.errorKind === 'proxy_setup' && /COHERE_API_KEY/.test(c.errors[0]), c);
  for (const [st, code, kind] of [[401, 'no_session', 'no_session'], [403, 'no_team', 'no_session'], [502, 'cohere_auth', 'auth'], [429, 'cohere_quota', 'quota'], [502, 'cohere_server', 'server'], [504, 'cohere_unreachable', 'server'], [400, 'bad_request', 'http']]) {
    c = await chat({}, () => errResp(st, code)); t(`proxy ${st}/${code} → ${kind} con mensaje útil`, c.ok === false && c.errorKind === kind && c.errors[0].length > 10 && !JSON.stringify(c).includes(PK), c);
  }
  const FPc = FP.cloud; store.set(SK, JSON.stringify({ ...JSON.parse(store.get(SK)), expires_at: 1, refresh_token: 'r-x' }));
  calls.length = 0; c = await FP.cohereClient.chatJson({ system: 's', user: 'u', schema: {}, apiKey: '', fetchImpl: async (u) => (u.includes('/auth/v1/token') ? { ok: false, status: 400, json: async () => ({ error: 'bad' }) } : okResp()) });
  t('sesión vencida e imposible de renovar: pide iniciar sesión y NO llama a Cohere', c.ok === false && c.errorKind === 'no_session' && /sesión/i.test(c.errors[0]), c);
  sess(); c = await chat({}, () => { throw new Error('Failed to fetch'); }); t('red caída hacia el servidor → network sin filtrar detalles', c.errorKind === 'network' && /servidor de IA/.test(c.errors[0]), c);
  console.log(bad ? `\n${bad} FALLAS` : '\nOK'); process.exit(bad ? 1 : 0);
})();
