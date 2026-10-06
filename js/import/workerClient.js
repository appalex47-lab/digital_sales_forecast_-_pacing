/**
 * workerClient.js — la página habla con el Worker de importación (js/workers/import-worker.js).
 * Si el navegador no puede crear el Worker (p. ej. abriendo index.html como archivo local) `start()` devuelve false y la app usa el flujo normal.
 * Todas las llamadas devuelven promesas; las de larga duración reportan avance. Un error del Worker rechaza la promesa con su mensaje.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const SCRIPT = 'js/workers/import-worker.js';
  let worker = null, startPromise = null, failed = false, seq = 0;
  const pending = new Map();   // jobId → { resolve, reject, onProgress, records }

  function fail(reason) {
    failed = true;
    const err = new Error(reason);
    pending.forEach((p) => p.reject(err)); pending.clear();
    if (worker) { try { worker.terminate(); } catch (e) { /* ya cerrado */ } }
    worker = null; startPromise = null;
  }

  function onMessage(e) {
    const m = e.data || {};
    if (m.type === 'ready' || m.type === 'stats' || m.type === 'dropped') { const p = pending.get(`@${m.type}`); if (p) { pending.delete(`@${m.type}`); p.resolve(m); } return; }
    const p = pending.get(m.jobId);
    if (!p) return;
    if (m.type === 'progress') { if (p.onProgress) p.onProgress(m.phase, m.done, m.total); return; }
    if (m.type === 'records') { for (let i = 0; i < m.records.length; i++) p.records.push(m.records[i]); return; }
    pending.delete(m.jobId);
    if (m.type === 'error') p.reject(new Error(m.message));
    else if (m.type === 'done') p.resolve({ ...m, records: p.records });
    else p.resolve(m);
  }

  /** Crea el Worker (una vez). Resuelve true si responde, false si el navegador no lo permite. */
  function start() {
    if (failed || typeof root.Worker === 'undefined') return Promise.resolve(false);
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve) => {
      try {
        worker = new root.Worker(SCRIPT);
      } catch (e) { fail(String(e && e.message || e)); resolve(false); return; }
      const t = setTimeout(() => { fail('El Worker de importación no respondió.'); resolve(false); }, 8000);
      pending.set('@ready', { resolve: () => { clearTimeout(t); resolve(true); }, reject: () => resolve(false) });
      worker.onmessage = onMessage;
      worker.onerror = (e) => { clearTimeout(t); fail(`El Worker de importación falló: ${e && e.message ? e.message : 'error desconocido'}`); resolve(false); };
    });
    return startPromise;
  }

  function call(msg, { onProgress = null } = {}) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error('El Worker de importación no está disponible.')); return; }
      pending.set(msg.jobId, { resolve, reject, onProgress, records: [] });
      worker.postMessage(msg);
    });
  }

  /** Registros ya guardados reducidos a lo que necesita la detección de duplicados (llave, archivo y fila), en arreglos compactos. */
  function existingOf(records) {
    const files = [], fileIdx = new Uint16Array(records.length), rows = new Int32Array(records.length), keys = new Array(records.length), seen = new Map();
    for (let i = 0; i < records.length; i++) {
      const r = records[i], fn = (r.provenance && r.provenance.fileName) || '';
      let k = seen.get(fn); if (k === undefined) { k = files.length; files.push(fn); seen.set(fn, k); }
      keys[i] = r.key; fileIdx[i] = k; rows[i] = (r.provenance && r.provenance.row) || 0;
    }
    return { keys, files, fileIdx, rows };
  }

  let minOverride = null;   // la configuración está congelada: las pruebas (y quien lo necesite) cambian el umbral aquí
  const minBytes = () => (minOverride !== null ? minOverride : (FP.config.import.workerMinBytes || 0));
  const newJob = () => `j${Date.now().toString(36)}${(++seq).toString(36)}`;

  FP.importWorker = {
    start, existingOf, newJob, minBytes, setMinBytes(n) { minOverride = n; },
    available: () => !failed && Boolean(worker),
    stage: (a, o) => call({ type: 'stage', ...a }, o),
    reprocess: (a, o) => call({ type: 'reprocess', ...a }, o),
    retype: (a, o) => call({ type: 'retype', ...a }, o),
    commit: (a, o) => call({ type: 'commit', ...a }, o),
    drop(jobId) { if (!worker) return Promise.resolve(); return new Promise((res) => { pending.set('@dropped', { resolve: res, reject: res }); worker.postMessage({ type: 'drop', jobId }); }); },
    stats() { return new Promise((res) => { pending.set('@stats', { resolve: res, reject: res }); worker.postMessage({ type: 'stats' }); }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
