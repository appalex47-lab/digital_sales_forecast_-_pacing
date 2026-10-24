#!/usr/bin/env node
/**
 * selftest-node.js — Ejecuta las pruebas del motor (FP.selfTest) en Node, sin navegador.
 *
 * Desde la Fase A las pruebas del motor ya no corren al abrir la app: se ejecutan con el botón «Ejecutar pruebas del motor»
 * y con este script (pensado para la revisión automática de cada cambio). Carga TODOS los scripts de index.html, incluidos
 * los diferidos (type="text/plain" data-lazy), en el mismo orden, dentro de un contexto vm con un DOM mínimo de relleno.
 *
 * Uso:  node tools/selftest-node.js          (desde la raíz del repo)
 * Salida: lista las pruebas fallidas y termina con código 1 si hay alguna; 0 si todas pasan.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"?]+)[^"]*"/g)].map((m) => m[1]);

const noop = () => {};
const el = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false } : k === 'dataset' ? {} : k === 'querySelectorAll' ? () => [] : noop), set: () => true });
const store = {};
const ctx = {
  console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
  setTimeout, clearTimeout, setInterval, clearInterval, URL, Blob, TextEncoder, TextDecoder, structuredClone, Intl, performance,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; } },
  document: { readyState: 'complete', addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), documentElement: el(), head: el() },
  navigator: { userAgent: 'node', language: 'es-MX' }, location: { hash: '', href: 'http://localhost/', search: '' }, addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop })
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

for (const f of files) {
  if (f === 'js/app.js' || f === 'js/lazy.js') continue;   // app.js arranca la interfaz; lazy.js solo existe para el navegador (aquí todo se carga directo)
  try { new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }).runInContext(ctx); }
  catch (e) { console.error(`✘ no cargó ${f}: ${e.message}`); process.exit(2); }
}
if (!ctx.FP || !ctx.FP.selfTest) { console.error('✘ FP.selfTest no está disponible'); process.exit(2); }

const t0 = Date.now();
const r = ctx.FP.selfTest.run();
const fails = (r.results || []).filter((x) => !x.pass);
console.log(`Pruebas del motor: ${r.passed} de ${r.total} correctas (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
fails.forEach((x) => console.log(`✘ ${x.group} › ${x.name}${x.error ? ` — ${x.error}` : ''}`));
process.exit(r.ok && !fails.length ? 0 : 1);
