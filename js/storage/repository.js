/**
 * repository.js — Capa de acceso a datos (Fase 8.1).
 *
 *   UI / vistas
 *     ↓
 *   Servicios (app.js, motores)            ← siguen usando la misma interfaz síncrona save/load
 *     ↓
 *   Repositorio (este módulo)
 *     ├── preferencias y banderas ─▶ localStorage (FP.storage)
 *     ├── datos de la app (kv) ────▶ IndexedDB store `kv` (caché en memoria + escritura asíncrona)
 *     └── productos ───────────────▶ IndexedDB `productDays`, `productRollups`, `productCatalog`, `productBatches`
 *
 * Ningún motor ni vista llama a IndexedDB directamente: los datos de la app pasan por
 * createRoutedStorage (misma interfaz que FP.storage) y los productos por FP.productStore.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const IDB = () => FP.idb;

  /**
   * Esquema. v1 (Fase 8.1) y v2 (Fase 8.1.1: productFunnel y venta con estado, sucursal y entrega).
   * Cada store y cada índice responde a una consulta real (ver ARCHITECTURE §79 y §88).
   */
  function upgrade(db, oldVersion = 0, newVersion, tx) {
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('productDays')) {
      const s = db.createObjectStore('productDays', { keyPath: ['date', 'channel'] });
      s.createIndex('channel_date', ['channel', 'date']);
    }
    if (!db.objectStoreNames.contains('productRollups')) {
      const s = db.createObjectStore('productRollups', { keyPath: ['date', 'channel', 'level', 'key'] });
      s.createIndex('level_key_date', ['level', 'key', 'date']);
    }
    if (!db.objectStoreNames.contains('productCatalog')) {
      const s = db.createObjectStore('productCatalog', { keyPath: 'sku' });
      s.createIndex('category', 'category');
      s.createIndex('product', 'product');
    }
    if (!db.objectStoreNames.contains('productBatches')) db.createObjectStore('productBatches', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('productFunnel')) {
      const s = db.createObjectStore('productFunnel', { keyPath: ['date', 'channel'] });
      s.createIndex('channel_date', ['channel', 'date']);
    }
    // v1 → v2: cada bloque de producto (4 métricas, sin dimensiones) se separa en venta v2 + funnel. Sin pérdida.
    if (oldVersion === 1 && tx && FP.productStore) {
      const days = tx.objectStore('productDays'), funnel = tx.objectStore('productFunnel');
      let converted = 0;
      const cur = days.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) {
          tx.objectStore('productRollups').clear();
          tx.objectStore('meta').put({ key: 'productRebuild', pending: true, from: 1, to: 2, converted, at: new Date().toISOString() });
          return;
        }
        const old = c.value;
        if (old && old.schema !== 2) {
          const up = FP.productStore.upgradeV1Block(old);
          c.update(up.sales);
          funnel.put(up.funnel);
          converted++;
        }
        c.continue();
      };
    }
  }

  const STORES = ['kv', 'productDays', 'productFunnel', 'productRollups', 'productCatalog', 'productBatches', 'meta'];

  function createRepository({ name = C().storageDb.name, version = C().storageDb.version } = {}) {
    const cache = new Map();          // key → envelope (datos de la app)
    let db = null;
    let mode = 'none';
    let queue = Promise.resolve();
    let lastError = null;
    let onError = null;

    const repo = {
      get ready() { return mode === 'indexeddb'; },
      get mode() { return mode; },
      get db() { return db; },
      get lastError() { return lastError; },
      set onError(fn) { onError = fn; },
      STORES,

      /** Abre la base y carga la caché kv. Nunca lanza: si falla, mode = 'unavailable'. */
      async init() {
        if (!IDB() || !IDB().available()) { mode = 'unavailable'; lastError = 'IndexedDB no está disponible en este navegador.'; return repo; }
        try {
          db = await IDB().open(name, version, upgrade);
          const rows = await IDB().getAll(db, 'kv');
          rows.forEach((r) => cache.set(r.key, r.envelope));
          mode = 'indexeddb';
        } catch (e) { mode = 'unavailable'; lastError = String(e && e.message || e); }
        return repo;
      },

      /* ----- kv: datos de la app (misma forma de sobre que FP.storage) ----- */
      kvGet(key) { return cache.has(key) ? cache.get(key) : null; },
      kvHas(key) { return cache.has(key); },
      kvKeys() { return [...cache.keys()]; },
      /** Escribe en caché de inmediato y en IndexedDB en cola (orden garantizado). */
      kvSet(key, envelope) {
        cache.set(key, envelope);
        const clone = envelope;
        queue = queue.then(() => IDB().put(db, 'kv', { key, envelope: clone })).catch((e) => { lastError = String(e && e.message || e); if (onError) onError(lastError); });
        return true;
      },
      kvDelete(key) {
        cache.delete(key);
        queue = queue.then(() => IDB().del(db, 'kv', key)).catch((e) => { lastError = String(e && e.message || e); if (onError) onError(lastError); });
      },
      /** Lee directo de IndexedDB (sin caché): la usa la verificación de migración. */
      async kvRead(key) { const r = await IDB().get(db, 'kv', key); return r ? r.envelope : null; },
      /** Escritura esperable (migración). */
      async kvPut(key, envelope) { cache.set(key, envelope); await IDB().put(db, 'kv', { key, envelope }); },
      /** Espera a que terminen las escrituras pendientes. */
      flush() { return queue; },

      async clearAll() {
        cache.clear();
        if (mode !== 'indexeddb') return;
        await queue;
        for (const s of STORES) await IDB().clear(db, s);
      },

      async meta(key) { return mode === 'indexeddb' ? IDB().get(db, 'meta', key) : null; },
      async setMeta(key, value) { if (mode === 'indexeddb') await IDB().put(db, 'meta', { key, ...value }); },
      estimate: () => IDB().estimate(),
      persist: () => IDB().persist(),
      close() { if (db) db.close(); db = null; mode = 'none'; }
    };
    return repo;
  }

  /** ¿Esta clave (sin namespace) es de datos grandes? */
  function isDataKey(key) {
    return C().storageDb.dataKeys.includes(String(key).split(':')[0]);
  }

  /**
   * Almacenamiento enrutado con la MISMA interfaz que FP.storage (save/load/remove/clear, síncrono):
   * los datos van a IndexedDB solo cuando el repositorio está listo y la migración verificada;
   * mientras tanto, todo sigue en localStorage como antes.
   */
  function createRoutedStorage({ ls, repo, dataRouted = () => repo.ready }) {
    let lastError = null;
    const toRepo = (key) => isDataKey(key) && dataRouted();
    const envelope = (data) => ({ schemaVersion: C().schemaVersion, savedAt: new Date().toISOString(), data });
    return {
      get kind() { return dataRouted() ? 'indexedDB + localStorage' : ls.kind; },
      get lastError() { return lastError || repo.lastError || ls.lastError; },
      save(key, data) {
        if (toRepo(key)) {
          try { return repo.kvSet(key, JSON.parse(JSON.stringify(envelope(data)))); } catch (e) { lastError = e.message; return false; }
        }
        return ls.save(key, data);
      },
      load(key) { return toRepo(key) ? repo.kvGet(key) : ls.load(key); },
      remove(key) { if (toRepo(key)) repo.kvDelete(key); else ls.remove(key); },
      /** Borrado explícito del usuario ("Borrar datos guardados"): localStorage de la app + IndexedDB. */
      clear() { ls.clear(); repo.clearAll(); }
    };
  }

  FP.repository = { createRepository, createRoutedStorage, isDataKey, upgrade, STORES };
})(typeof window !== 'undefined' ? window : globalThis);
