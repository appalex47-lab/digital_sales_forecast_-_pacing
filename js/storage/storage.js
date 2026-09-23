/**
 * storage.js — Persistencia local con adaptadores intercambiables.
 *
 * Adaptadores disponibles:
 *  - localStorage (por defecto si el navegador lo permite)
 *  - memoria (respaldo automático: modo privado, cuota llena, file:// restringido)
 *
 * Cada valor se guarda en un sobre { schemaVersion, savedAt, data } para
 * poder migrar el contrato en fases posteriores.
 * Archivos JSON/CSV se manejan en /import y /export, no aquí.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  function memoryAdapter() {
    const mem = new Map();
    return {
      kind: 'memory',
      get: (k) => (mem.has(k) ? mem.get(k) : null),
      set: (k, v) => { mem.set(k, v); },
      remove: (k) => { mem.delete(k); },
      keys: () => [...mem.keys()]
    };
  }

  function localStorageAdapter() {
    try {
      const ls = root.localStorage;
      const probe = '__fp_probe__';
      ls.setItem(probe, '1'); ls.removeItem(probe);
      return {
        kind: 'localStorage',
        get: (k) => ls.getItem(k),
        set: (k, v) => ls.setItem(k, v),
        remove: (k) => ls.removeItem(k),
        keys: () => Object.keys(ls)
      };
    } catch (e) {
      return null;
    }
  }

  function createStorage(adapter = localStorageAdapter() || memoryAdapter()) {
    const ns = C().storage.namespace;
    const fullKey = (k) => `${ns}:${k}`;
    let lastError = null;

    return {
      get kind() { return adapter.kind; },
      get lastError() { return lastError; },

      save(key, data) {
        try {
          adapter.set(fullKey(key), JSON.stringify({ schemaVersion: C().schemaVersion, savedAt: new Date().toISOString(), data }));
          lastError = null;
          return true;
        } catch (e) { lastError = e.message; return false; }
      },

      /** Devuelve { data, schemaVersion, savedAt } o null. */
      load(key) {
        try {
          const raw = adapter.get(fullKey(key));
          if (!raw) return null;
          const env = JSON.parse(raw);
          return env && typeof env === 'object' && 'data' in env ? env : null;
        } catch (e) { lastError = e.message; return null; }
      },

      remove(key) { try { adapter.remove(fullKey(key)); } catch (e) { lastError = e.message; } },

      /** Borra solo las claves de esta app. */
      clear() {
        try { adapter.keys().filter((k) => k.startsWith(`${ns}:`)).forEach((k) => adapter.remove(k)); }
        catch (e) { lastError = e.message; }
      }
    };
  }

  FP.storage = { createStorage, localStorageAdapter, memoryAdapter };
})(typeof window !== 'undefined' ? window : globalThis);
