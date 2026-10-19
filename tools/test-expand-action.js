#!/usr/bin/env node
/* «Ampliar con IA»: parseExpand / expandAction (Cohere simulado). */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
let reply = null;
const ctx = { console, globalThis: null }; ctx.globalThis = ctx;
ctx.FP = { config: { diagnostics: { cohere: { model: 'm' } } },
  cohereClient: { parseJson: (t) => { try { return { ok: true, value: JSON.parse(t) }; } catch (e) { return { ok: false }; } },
    chatJson: async () => reply } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/ai/cohereActions.js', 'utf8'), ctx);
const A = ctx.FP.cohereActions;
const item = { actionId: 'A1', name: 'Reactivar clientes', driver: 'frecuencia', defaultWindowDays: 14, dataAvailable: true };
const input = (style) => ({ item, hypothesis: { id: 'H1', hypothesis: 'Cae la recompra', driver: 'frecuencia' }, signals: [], scenario: { scenarioId: 'S1', name: 'Base', links: { driver: 'frecuencia' }, expectedImpact: 120000 }, availableDimensions: ['producto'], constraints: {}, style });
const ok = { objective: 'Recuperar recompra', steps: [{ text: 'Segmentar clientes', owner: 'CRM', when: 'Semana 1' }], measure: 'Recompra semanal', dataToReview: ['Base de clientes'], risks: ['Riesgo X'], dontDo: ['No descontar'] };
const run = async (r, style) => { reply = r; return A.expandAction(input(style), { apiKey: 'k' }); };
(async () => {
  let r = await run({ ok: true, status: 'ok', text: JSON.stringify(ok) }, 'detailed');
  assert(r.ok && r.detail.steps.length === 1 && r.detail.risks.length === 1 && r.detail.style === 'detailed' && r.detail.edited === false && r.detail.source === 'cohere');
  r = await run({ ok: true, status: 'ok', text: JSON.stringify(ok) }, 'summary');
  assert(r.ok && r.detail.risks.length === 0 && r.detail.dontDo.length === 0, 'resumido no guarda riesgos');
  r = await run({ ok: true, status: 'ok', text: 'no json' }, 'summary'); assert(!r.ok && r.status === 'invalid');
  r = await run({ ok: true, status: 'ok', text: JSON.stringify({ ...ok, steps: [] }) }, 'summary'); assert(!r.ok);
  r = await run({ ok: true, status: 'ok', text: JSON.stringify({ ...ok, objective: 'La causa es el precio' }) }, 'summary'); assert(!r.ok && /causal/.test(r.errors[0]));
  r = await run({ ok: true, status: 'ok', text: JSON.stringify({ ...ok, measure: 'Subir ventas $999,999' }) }, 'summary'); assert(!r.ok && /cifras/.test(r.errors[0]));
  r = await run({ ok: true, status: 'ok', text: JSON.stringify({ ...ok, measure: 'Llegar a $120,000 de impacto' }) }, 'summary'); assert(r.ok, 'cifra presente en los datos');
  r = await run({ ok: true, status: 'ok', text: JSON.stringify({ ...ok, steps: [{ text: 'Llamar a 3 clientes en 2 días', owner: '', when: '' }] }) }, 'summary'); assert(r.ok, 'números chicos no cuentan');
  r = await run({ ok: false, status: 'error', errors: ['Sin red'] }, 'summary'); assert(!r.ok && r.errors[0] === 'Sin red');
  r = await A.expandAction({}, { apiKey: 'k' }); assert(!r.ok && r.status === 'unavailable');
  console.log('test-expand-action: OK');
})().catch((e) => { console.error(e); process.exit(1); });
