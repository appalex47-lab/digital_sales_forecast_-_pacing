#!/usr/bin/env node
/* Cohere cita una cifra que no está en el contexto: se repite UNA vez diciéndole cuál; la segunda respuesta se valida igual de estricto. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let replies = [], calls = [];
const ctx = { console }; ctx.globalThis = ctx;
ctx.FP = { config: { diagnostics: { cohere: { model: 'm' } } },
  cohereClient: { parseJson: (t) => { try { return { ok: true, value: JSON.parse(t) }; } catch (e) { return { ok: false }; } },
    chatJson: async (o) => { calls.push(o.user); return replies.shift(); } } };
vm.createContext(ctx);
['js/ai/cohereAnalysisAssistant.js', 'js/ai/cohereActions.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const A = ctx.FP.cohereAnalysisAssistant, X = ctx.FP.cohereActions;
const rep = (obj) => ({ ok: true, status: 'ok', model: 'm', text: JSON.stringify(obj) });
const state = { an: { rows: [], temporal: { currentTotal: 1000 } } };
(async () => {
  // asistente: 1.ª respuesta con cifra inventada, 2.ª correcta
  replies = [rep({ answer: 'Cae 7.9 % en total.', evidence: [] }), rep({ answer: 'El total actual es 1000.', evidence: [] })]; calls = [];
  let r = await A.ask('¿Qué pasa?', state, { apiKey: 'k' });
  assert(r.ok && calls.length === 2 && /rechazada/.test(calls[1]) && /7\.9/.test(calls[1]), 'repite una vez diciendo cuál cifra');
  // asistente: las dos mal → error, solo 2 llamadas
  replies = [rep({ answer: 'Cae 7.9 %.', evidence: [] }), rep({ answer: 'Cae 8.1 %.', evidence: [] })]; calls = [];
  r = await A.ask('¿Qué pasa?', state, { apiKey: 'k' }); assert(!r.ok && calls.length === 2 && /cifras/.test(r.errors[0]), 'segunda inválida → error, sin más reintentos');
  // lenguaje causal NO se reintenta
  replies = [rep({ answer: 'La causa es el precio.', evidence: [] })]; calls = [];
  r = await A.ask('¿Qué pasa?', state, { apiKey: 'k' }); assert(!r.ok && calls.length === 1, 'causal no reintenta');
  // acción ampliada
  const okP = { objective: 'Recuperar', steps: [{ text: 'Probar variantes', owner: 'CRM', when: 'Semana 1' }], measure: 'Conversaciones', dataToReview: [] };
  const inp = { item: { actionId: 'A', name: 'n', driver: 'trafficVolume' }, hypothesis: { id: 'H', hypothesis: 'h' }, scenario: { scenarioId: 'S', name: 's', links: { driver: 'trafficVolume' } }, style: 'summary' };
  replies = [rep({ ...okP, measure: 'Subir $999,999' }), rep(okP)]; calls = [];
  let e = await X.expandAction(inp, { apiKey: 'k' }); assert(e.ok && calls.length === 2 && /rechazada/.test(calls[1]), 'acción: reintento correcto');
  replies = [rep({ ...okP, measure: 'Subir $999,999' }), rep({ ...okP, measure: 'Subir $888,888' })]; calls = [];
  e = await X.expandAction(inp, { apiKey: 'k' }); assert(!e.ok && calls.length === 2, 'acción: segunda inválida → error');
  replies = [rep(okP)]; calls = []; e = await X.expandAction(inp, { apiKey: 'k' }); assert(e.ok && calls.length === 1, 'sin error no hay reintento');
  console.log('test-retry-cifras: OK');
})().catch((x) => { console.error(x); process.exit(1); });
