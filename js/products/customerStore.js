/**
 * customerStore.js — Libro de clientes (una fila por pedido) en IndexedDB, almacén `meta` (clave `customerLedger`).
 *  - Se guarda en el almacén `meta` con clave `productCustomerLedger`: empieza con «product», así que viaja con los productos a la nube del
 *    equipo (comprimido, mismo tope de 100 MB y misma política de acceso por equipo). Privacidad aprobó el ID de cliente anonimizado en Supabase.
 *  - Nunca va a localStorage ni a las claves de datos generales.
 *  - Se arma al guardar un archivo de venta que trae ID de pedido e ID de cliente; quitar el archivo quita sus pedidos.
 *  - Recargar el mismo archivo reemplaza sus pedidos (no duplica).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const KEY = 'productCustomerLedger';
  let cache = null, loaded = false, loading = null, gen = 0, tail = Promise.resolve();
  /** Las escrituras (guardar, quitar, vaciar) van de una en una: dos a la vez se pisarían sobre copias distintas del libro. */
  const serial = (fn) => { const run = tail.then(fn, fn); tail = run.then(() => {}, () => {}); return run; };
  const analysisCache = new Map();
  const repo = () => (FP.productStore && FP.productStore.repo && FP.productStore.repo.ready ? FP.productStore.repo : null);

  /** Lectura de una sola vez: varias llamadas a la vez comparten la misma lectura (y por lo tanto el mismo objeto). */
  async function load() {
    if (loaded) return cache;
    const r = repo(); if (!r) return null;
    if (!loading) {
      const g = gen;
      loading = r.meta(KEY).then((m) => {
        if (g === gen) { cache = m && m.ledger && Array.isArray(m.ledger.key) ? m.ledger : null; loaded = true; }
        loading = null; return cache;
      }, (e) => { loading = null; throw e; });
    }
    return loading;
  }
  async function save(ledger) {
    const r = repo(); if (!r) throw new Error('IndexedDB no está disponible.');
    await r.setMeta(KEY, { ledger, savedAt: new Date().toISOString() });
    cache = ledger; loaded = true; analysisCache.clear();
  }
  /** Mezcla el borrador de un archivo en el libro. Devuelve el reporte (pedidos nuevos, reemplazados, clientes). */
  const commit = (draftLedger, batch) => serial(() => commitNow(draftLedger, batch));
  async function commitNow(draftLedger, batch) {
    const ledger = (await load()) || FP.customerEngine.emptyLedger();
    const rep = FP.customerEngine.mergeInto(ledger, draftLedger, batch);
    await save(ledger);
    return { ...rep, orders: draftLedger.orders.size, withoutCustomer: draftLedger.stats.withoutCustomer, withoutOrder: draftLedger.stats.withoutOrder, totalOrders: ledger.key.length, totalCustomers: ledger.customers.length };
  }
  const removeBatch = (id) => serial(() => removeNow(id));
  async function removeNow(id) {
    const ledger = await load(); if (!ledger) return { removed: 0 };
    const r = FP.customerEngine.removeBatch(ledger, id);
    if (r.removed) { if (!ledger.key.length) await clearNow(); else await save(ledger); }
    return r;
  }
  const clear = () => serial(clearNow);
  async function clearNow() { const r = repo(); if (r) await r.setMeta(KEY, { ledger: null }); cache = null; loaded = true; analysisCache.clear(); }
  async function info() { const l = await load(); return l ? { orders: l.key.length, customers: l.customers.length, channels: l.channels.slice(), batches: l.batches.map((b) => ({ ...b })) } : null; }
  /** Análisis con caché por opciones (se invalida al cambiar el libro). */
  async function analyze(options) {
    const l = await load(); if (!l) return { status: 'no_ledger' };
    const k = JSON.stringify(options || {});
    if (!analysisCache.has(k)) analysisCache.set(k, FP.customerEngine.analyze(l, options));
    return analysisCache.get(k);
  }
  /** Productos que se compran juntos (con caché por opciones y catálogo; se invalida al cambiar el libro). */
  async function basket(options) {
    const l = await load(); if (!l) return { status: 'no_ledger' };
    const PS = FP.productStore, bySku = PS && PS.catalog ? PS.catalog.bySku : new Map();
    const k = 'b:' + JSON.stringify(options || {}) + ':' + bySku.size;
    if (!analysisCache.has(k)) analysisCache.set(k, FP.basketEngine.analyze(l, bySku, { ...FP.config.products.crossSell, strict: { minPairs: FP.config.products.crossSell.minPairs, minLift: FP.config.products.crossSell.minLift, minConf: FP.config.products.crossSell.minConf }, ...(options || {}) }));
    return analysisCache.get(k);
  }
  function reset() { gen++; loading = null; cache = null; loaded = false; analysisCache.clear(); }

  FP.customerStore = { commit, removeBatch, clear, info, analyze, basket, load, reset };
})(typeof window !== 'undefined' ? window : globalThis);
