/**
 * selftest-worker.js — Ejecuta las pruebas del motor (FP.selfTest) en segundo plano (Fase A).
 *
 * Las pruebas tardan segundos; en el hilo principal congelarían la pantalla. Aquí corren aisladas: este Worker tiene su propia copia
 * de los módulos (no toca el estado, el almacenamiento ni los datos de la app abierta) y solo devuelve el resultado.
 * Mensaje de entrada:  { files: [url absoluta de cada script de index.html, en orden, sin app.js ni lazy.js] }
 * Mensaje de salida:   { ok, passed, total, results: [{ group, name, pass, error }] }  |  { error }
 * Usa los mismos rellenos mínimos de document/localStorage que tools/selftest-node.js.
 */
'use strict';
const noop = () => {};
const el = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' ? {} : k === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false } : k === 'dataset' ? {} : k === 'querySelectorAll' ? () => [] : noop), set: () => true });
const store = {};
self.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; } };
self.document = { readyState: 'complete', addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), documentElement: el(), head: el() };
self.window = self;
self.matchMedia = () => ({ matches: false, addEventListener: noop });

self.onmessage = (e) => {
  try {
    importScripts(...e.data.files);
    const r = self.FP.selfTest.run();
    self.postMessage({
      ok: !!r.ok, passed: r.passed, total: r.total,
      results: (r.results || []).map((x) => ({ group: x.group, name: x.name, pass: !!x.pass, error: x.error ? String(x.error) : undefined }))
    });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err).slice(0, 300) });
  }
};
