/**
 * idb.js — Envoltura mínima de IndexedDB (Fase 8 · capa de almacenamiento).
 *
 * Sin dependencias. Funciona en GitHub Pages (https) y en file:// en Chromium.
 * Solo expone primitivas; el diseño de stores y las consultas de negocio viven en la capa de
 * repositorio. Ninguna función de aquí conoce plan, actual ni productos.
 *
 *   available()                           → ¿el navegador tiene IndexedDB?
 *   open(name, version, upgrade)          → Promise<IDBDatabase>
 *   put(db, store, value) / get / del
 *   putMany(db, store, rows, opts)        → inserta por lotes y cede el hilo entre lotes
 *   getAll(db, store, { index, range, limit })
 *   iterate(db, store, { index, range }, fn) → recorre con cursor sin cargar todo a memoria
 *   count(db, store, { index, range })
 *   clear(db, store) / deleteDatabase(name)
 *   estimate() / persist()                → cuota y persistencia (navigator.storage)
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const available = () => {
    try { return typeof root.indexedDB !== 'undefined' && root.indexedDB !== null; } catch (e) { return false; }
  };

  const req = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });

  /** Cede el hilo principal para que la interfaz siga respondiendo. */
  const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

  function open(name, version, upgrade) {
    if (!available()) return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    return new Promise((resolve, reject) => {
      const r = root.indexedDB.open(name, version);
      r.onupgradeneeded = (e) => upgrade(r.result, e.oldVersion, e.newVersion, r.transaction);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('La base está abierta en otra pestaña con una versión anterior. Cierra las demás pestañas de la app.'));
    });
  }

  async function put(db, store, value) {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return done(tx);
  }

  async function get(db, store, key) {
    return req(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function del(db, store, key) {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return done(tx);
  }

  /**
   * Inserta muchas filas en lotes (una transacción por lote) y cede el hilo entre lotes.
   * @param {object} opts { batchSize, onProgress(n, total) }
   */
  async function putMany(db, store, rows, { batchSize = 5000, onProgress = null } = {}) {
    for (let i = 0; i < rows.length; i += batchSize) {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      const end = Math.min(rows.length, i + batchSize);
      for (let j = i; j < end; j++) os.put(rows[j]);
      await done(tx);
      if (onProgress) onProgress(end, rows.length);
      await yieldToUI();
    }
  }

  const source = (db, store, index, mode = 'readonly') => {
    const os = db.transaction(store, mode).objectStore(store);
    return index ? os.index(index) : os;
  };

  async function getAll(db, store, { index = null, range = null, limit } = {}) {
    return req(source(db, store, index).getAll(range, limit));
  }

  async function count(db, store, { index = null, range = null } = {}) {
    return req(source(db, store, index).count(range));
  }

  /** Recorre con cursor; `fn(value)` puede devolver false para detener. */
  function iterate(db, store, { index = null, range = null } = {}, fn) {
    return new Promise((resolve, reject) => {
      const r = source(db, store, index).openCursor(range);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { resolve(); return; }
        if (fn(c.value) === false) { resolve(); return; }
        c.continue();
      };
      r.onerror = () => reject(r.error);
    });
  }

  async function clear(db, store) {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return done(tx);
  }

  function deleteDatabase(name) {
    return new Promise((resolve, reject) => {
      const r = root.indexedDB.deleteDatabase(name);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
      r.onblocked = () => resolve();
    });
  }

  /** { usage, quota } en bytes, o null si el navegador no lo expone. */
  async function estimate() {
    try { return root.navigator && root.navigator.storage && root.navigator.storage.estimate ? await root.navigator.storage.estimate() : null; }
    catch (e) { return null; }
  }

  /** Pide almacenamiento persistente (el navegador no lo borra por presión de espacio). */
  async function persist() {
    try {
      const s = root.navigator && root.navigator.storage;
      if (!s || !s.persist) return { supported: false, persisted: false };
      const already = s.persisted ? await s.persisted() : false;
      return { supported: true, persisted: already || await s.persist() };
    } catch (e) { return { supported: false, persisted: false }; }
  }

  FP.idb = { available, open, put, get, del, putMany, getAll, count, iterate, clear, deleteDatabase, estimate, persist, yieldToUI };
})(typeof window !== 'undefined' ? window : globalThis);
