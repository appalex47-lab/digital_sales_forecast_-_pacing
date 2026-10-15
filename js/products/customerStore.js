/**
 * customerStore.js — Libro de clientes (una fila por pedido) en IndexedDB, almacén `meta` (clave `customerLedger`).
 *  - Vive SOLO en este navegador: no es una clave de datos sincronizable ni lo toma la nube del equipo (privacidad del ID de cliente).
 *  - Se arma al guardar un archivo de venta que trae ID de pedido e ID de cliente; quitar el archivo quita sus pedidos.
 *  - Recargar el mismo archivo reemplaza sus pedidos (no duplica).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const KEY = 'customerLedger';
  let cache = null, loaded = false;
  const analysisCache = new Map();
  const repo = () => (FP.productStore && FP.productStore.repo && FP.productStore.repo.ready ? FP.productStore.repo : null);

  async function load() {
    if (loaded) return cache;
    const r = repo(); if (!r) return null;
    const m = await r.meta(KEY);
    cache = m && m.ledger && Array.isArray(m.ledger.key) ? m.ledger : null; loaded = true;
    return cache;
  }
  async function save(ledger) {
    const r = repo(); if (!r) throw new Error('IndexedDB no está disponible.');
    await r.setMeta(KEY, { ledger, savedAt: new Date().toISOString() });
    cache = ledger; loaded = true; analysisCache.clear();
  }
  /** Mezcla el borrador de un archivo en el libro. Devuelve el reporte (pedidos nuevos, reemplazados, clientes). */
  async function commit(draftLedger, batch) {
    const ledger = (await load()) || FP.customerEngine.emptyLedger();
    const rep = FP.customerEngine.mergeInto(ledger, draftLedger, batch);
    await save(ledger);
    return { ...rep, orders: draftLedger.orders.size, withoutCustomer: draftLedger.stats.withoutCustomer, withoutOrder: draftLedger.stats.withoutOrder, totalOrders: ledger.key.length, totalCustomers: ledger.customers.length };
  }
  async function removeBatch(id) {
    const ledger = await load(); if (!ledger) return { removed: 0 };
    const r = FP.customerEngine.removeBatch(ledger, id);
    if (r.removed) { if (!ledger.key.length) await clear(); else await save(ledger); }
    return r;
  }
  async function clear() { const r = repo(); if (r) await r.setMeta(KEY, { ledger: null }); cache = null; loaded = true; analysisCache.clear(); }
  async function info() { const l = await load(); return l ? { orders: l.key.length, customers: l.customers.length, channels: l.channels.slice(), batches: l.batches.map((b) => ({ ...b })) } : null; }
  /** Análisis con caché por opciones (se invalida al cambiar el libro). */
  async function analyze(options) {
    const l = await load(); if (!l) return { status: 'no_ledger' };
    const k = JSON.stringify(options || {});
    if (!analysisCache.has(k)) analysisCache.set(k, FP.customerEngine.analyze(l, options));
    return analysisCache.get(k);
  }
  function reset() { cache = null; loaded = false; analysisCache.clear(); }

  FP.customerStore = { commit, removeBatch, clear, info, analyze, load, reset };
})(typeof window !== 'undefined' ? window : globalThis);
