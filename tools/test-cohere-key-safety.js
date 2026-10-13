// Hallazgo 3.3: la API key no se filtra por errores, exports ni nube.  node tools/test-cohere-key-safety.js
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]).filter((f) => !/js\/(ui|app|worker)/.test(f));
const ctx = { console, Math, Date, JSON, Map, Set, Intl, Number, String, Array, Object, RegExp, Error, Promise, setTimeout, clearTimeout, parseFloat, isNaN, Symbol, Uint8Array, TextEncoder, AbortController };
ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
srcs.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
const FP = ctx.FP;
let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const KEY = 'SECRET-KEY-1234567890-ABCDEF';
const logs = []; ctx.console = { ...console, log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) };
const call = (status, body, throws) => FP.cohereClient.chatJson({ system: 's', user: 'u', schema: {}, apiKey: KEY,
  fetchImpl: async () => { if (throws) { const e = new Error(throws.msg + ' ' + KEY); e.name = throws.name; throw e; } return { ok: status >= 200 && status < 300, status, json: async () => body }; } });
(async () => {
  const cases = [[401, {}, 'auth'], [403, {}, 'auth'], [429, {}, 'quota'], [500, {}, 'server'], [502, {}, 'server'], [418, {}, 'http']];
  for (const [st, body, kind] of cases) {
    const r = await call(st, body);
    t(`HTTP ${st} → ${kind}, mensaje útil y sin la key`, r.ok === false && r.errorKind === kind && !JSON.stringify(r).includes(KEY), r);
  }
  const net = await call(0, null, { msg: 'Failed to fetch', name: 'TypeError' });
  t('error de red → network, sin filtrar el mensaje original (que podría traer la key)', net.errorKind === 'network' && !JSON.stringify(net).includes(KEY), net);
  const to = await call(0, null, { msg: 'abort', name: 'AbortError' });
  t('timeout → timeout', to.errorKind === 'timeout' && !JSON.stringify(to).includes(KEY));
  const badJson = await FP.cohereClient.chatJson({ system: 's', user: 'u', schema: {}, apiKey: KEY, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) });
  t('respuesta no JSON → invalid', badJson.ok === false && badJson.errorKind === 'invalid');
  const empty = await call(200, {});
  t('respuesta vacía no lanza (text null)', empty.ok === true && empty.text === null);
  const nokey = await FP.cohereClient.chatJson({ system: 's', user: 'u', schema: {}, apiKey: '', fetchImpl: async () => { throw new Error('no debe llamarse'); } });
  t('sin key: no sale ninguna llamada de red', nokey.ok === false && nokey.sent === false);
  t('la key no aparece en consola durante las llamadas', !logs.join('\n').includes(KEY));
  t('cohereApiKey está en skipKeys de la nube (nunca se sube)', FP.config.cloud.skipKeys.includes('cohereApiKey'));
  // exports: ningún exporter menciona la clave
  const exp = Object.keys(FP).filter((k) => /export/i.test(k));
  const src = fs.readdirSync('js/export').map((f) => fs.readFileSync('js/export/' + f, 'utf8')).join('\n');
  t('ningún exporter referencia cohereApiKey / apiKey', !/cohereApiKey|apiKey/.test(src));
  console.log(bad ? `\n${bad} FALLAS` : '\nOK'); process.exit(bad ? 1 : 0);
})();
