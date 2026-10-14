// cohere-proxy — la API key de Cohere vive SOLO en el secreto COHERE_API_KEY de Supabase; el navegador nunca la ve.
// Qué hace: (1) valida que quien llama tenga sesión real de Supabase (no anónima), (2) valida que pertenezca a un equipo,
// (3) deja pasar únicamente una petición de chat con campos permitidos, (4) la reenvía a Cohere con la key del servidor.
// Nunca registra (ni devuelve en errores) el contenido enviado ni la key. Lógica pura y probable: index.ts solo la conecta a Deno.

const COHERE_URL = 'https://api.cohere.com/v2/chat';
const MAX_BODY_CHARS = 1_000_000;
const MAX_MESSAGES = 8;
const MAX_TOKENS_CAP = 4000;
const UPSTREAM_TIMEOUT_MS = 55_000;

export function corsHeaders(origin, allowed) {
  const ok = origin && allowed.includes(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}

const json = (status, obj, headers) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const fail = (status, code, message, headers) => json(status, { error: { code, message } }, headers);

/** Deja solo lo necesario para un chat con salida JSON; todo lo demás (tools, documentos, conectores…) se descarta. */
export function sanitize(body) {
  if (!body || typeof body !== 'object') return { error: 'El cuerpo debe ser un objeto JSON.' };
  const { model, temperature, messages, response_format: rf, max_tokens: mt } = body;
  if (typeof model !== 'string' || !/^command-[a-z0-9.\-]{1,60}$/.test(model)) return { error: 'Modelo no permitido.' };
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return { error: 'Mensajes inválidos.' };
  const clean = [];
  for (const m of messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return { error: 'Mensaje inválido.' };
    clean.push({ role: m.role, content: m.content });
  }
  const out = { model, messages: clean };
  if (temperature !== undefined) { if (typeof temperature !== 'number' || !(temperature >= 0 && temperature <= 1)) return { error: 'Temperatura inválida.' }; out.temperature = temperature; }
  if (mt !== undefined) { if (!Number.isInteger(mt) || mt < 1) return { error: 'max_tokens inválido.' }; out.max_tokens = Math.min(mt, MAX_TOKENS_CAP); }
  if (rf !== undefined) { if (!rf || typeof rf !== 'object' || rf.type !== 'json_object') return { error: 'response_format inválido.' }; out.response_format = { type: 'json_object', ...(rf.json_schema && typeof rf.json_schema === 'object' ? { json_schema: rf.json_schema } : {}) }; }
  return { body: out };
}

/**
 * @param {Request} req
 * @param {{ env:(k:string)=>string|undefined, fetch:typeof fetch }} deps
 */
export async function handle(req, deps) {
  const env = deps.env, f = deps.fetch;
  const allowed = String(env('ALLOWED_ORIGINS') || 'https://appalex47-lab.github.io').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, allowed);
  if (req.method === 'OPTIONS') return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: cors });
  if (origin && !allowed.includes(origin)) return fail(403, 'origin_not_allowed', 'Origen no permitido.', cors);
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Usa POST.', cors);

  const cohereKey = env('COHERE_API_KEY'), url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  if (!cohereKey) return fail(503, 'not_configured', 'Falta el secreto COHERE_API_KEY en Supabase (Edge Functions → Secrets).', cors);
  if (!url || !anon) return fail(500, 'server_misconfigured', 'La función no tiene la configuración de Supabase.', cors);

  // 1) sesión real
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return fail(401, 'no_session', 'Inicia sesión para usar la IA.', cors);
  let user;
  try {
    const r = await f(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!r.ok) return fail(401, 'no_session', 'Tu sesión no es válida o venció. Inicia sesión de nuevo.', cors);
    user = await r.json();
  } catch (e) { return fail(502, 'auth_unreachable', 'No pude verificar tu sesión con Supabase.', cors); }
  if (!user || !user.id || user.is_anonymous) return fail(401, 'no_session', 'Las sesiones anónimas no pueden usar la IA.', cors);

  // 2) pertenece a un equipo (RLS: solo ve su propia fila)
  try {
    const r = await f(`${url}/rest/v1/team_members?select=team_id`, { headers: { apikey: anon, Authorization: auth } });
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || !rows.length) return fail(403, 'no_team', 'Tu usuario no pertenece a ningún equipo.', cors);
  } catch (e) { return fail(502, 'auth_unreachable', 'No pude verificar tu equipo con Supabase.', cors); }

  // 3) cuerpo permitido
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_CHARS) return fail(413, 'too_large', 'La petición es demasiado grande.', cors);
  let raw; try { raw = await req.text(); } catch (e) { return fail(400, 'bad_body', 'No pude leer la petición.', cors); }
  if (raw.length > MAX_BODY_CHARS) return fail(413, 'too_large', 'La petición es demasiado grande.', cors);
  let parsed; try { parsed = JSON.parse(raw); } catch (e) { return fail(400, 'bad_json', 'La petición no es JSON.', cors); }
  const s = sanitize(parsed);
  if (s.error) return fail(400, 'bad_request', s.error, cors);

  // 4) a Cohere con la key del servidor
  let res;
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    res = await f(COHERE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cohereKey}` }, body: JSON.stringify(s.body), signal: ctrl.signal });
    clearTimeout(t);
  } catch (e) { return fail(504, 'cohere_unreachable', 'No pude conectar con Cohere (tiempo agotado o red).', cors); }
  // Los errores de Cohere se traducen: nunca se reenvía su cuerpo (puede repetir lo enviado) y un 401 de Cohere no debe parecer un problema de sesión.
  if (res.status === 401 || res.status === 403) return fail(502, 'cohere_auth', 'Cohere rechazó la API key del servidor. Revisa el secreto COHERE_API_KEY.', cors);
  if (res.status === 429) return fail(429, 'cohere_quota', 'Se alcanzó el límite de uso de Cohere.', cors);
  if (!res.ok) return fail(res.status >= 500 ? 502 : 400, res.status >= 500 ? 'cohere_server' : 'cohere_http', `Cohere respondió ${res.status}.`, cors);
  const text = await res.text();
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
}
