/**
 * product-filter.js — Selección en cascada (categoría → subcategoría → producto; estado → ciudad → sucursal; tipo de entrega)
 * que se combina con el canal. Solo arma opciones con el catálogo y la geografía ya cargados; el filtrado lo hace productStore.
 * Se usa en Evolución y patrones (toda la página) y en Clientes y LTV.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const KEYS = ['category', 'subcategory', 'product', 'state', 'city', 'branch', 'delivery'];
  const LABEL = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', state: 'Estado', city: 'Ciudad', branch: 'Sucursal', delivery: 'Tipo de entrega' };
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));

  /** Filtro limpio: solo las claves con valor. */
  function active(f) { const o = {}; KEYS.forEach((k) => { if (f && f[k]) o[k] = f[k]; }); return o; }
  const isActive = (f) => Object.keys(active(f)).length > 0;

  /** Opciones de cada selector dado lo ya elegido (cada nivel se acota por el de arriba). */
  function options(f, keys = KEYS) {
    const PS = FP.productStore, sel = f || {}, cat = PS && PS.catalog ? PS.catalog.list : [];
    const inCat = cat.filter((c) => (!sel.category || c.category === sel.category) && (!sel.subcategory || c.subcategory === sel.subcategory));
    let geo = { states: [], cities: [], branches: [], deliveries: [] };
    try { geo = PS.geoOptions({ state: sel.state || undefined, city: sel.city || undefined }); } catch (e) { /* sin geografía */ }
    const all = {
      category: uniq(cat.map((c) => c.category)),
      subcategory: uniq(cat.filter((c) => !sel.category || c.category === sel.category).map((c) => c.subcategory)),
      product: uniq(inCat.map((c) => c.product || c.sku)),
      state: geo.states || [], city: geo.cities || [], branch: (geo.branches || []).map((b) => b.code), delivery: geo.deliveries || []
    };
    const out = {}; keys.forEach((k) => { out[k] = all[k] || []; });
    return out;
  }

  /** Cambia una clave y limpia las que dependen de ella. */
  function cascade(f, key, value) {
    const o = { ...(f || {}) };
    o[key] = value || undefined;
    if (key === 'category') { o.subcategory = undefined; o.product = undefined; }
    else if (key === 'subcategory') o.product = undefined;
    else if (key === 'state') { o.city = undefined; o.branch = undefined; }
    else if (key === 'city') o.branch = undefined;
    return active(o);
  }

  /** Opciones de «Ir a…»: categoría, subcategoría, producto y SKU, cada una con la ruta completa que lleva a ella. */
  let gotoCache = null;
  function gotoOptions(limit = 3000) {
    const PS = FP.productStore, cat = PS && PS.catalog ? PS.catalog.list : [];
    if (gotoCache && gotoCache.src === cat && gotoCache.n === cat.length) return gotoCache.map;
    const map = new Map();
    const path = (c, upTo) => ['category', 'subcategory', 'product', 'sku'].slice(0, upTo).map((lv) => ({ level: lv, key: lv === 'product' ? (c.product || c.sku) : c[lv] })).filter((x) => x.key);
    cat.forEach((c) => {
      if (map.size >= limit) return;
      if (c.category) map.set(`${c.category} · categoría`, path(c, 1));
      if (c.subcategory) map.set(`${c.subcategory}${c.category ? ` (${c.category})` : ''} · subcategoría`, path(c, 2));
      if (c.product || c.sku) map.set(`${c.product || c.sku}${c.product && c.sku ? ` (${c.sku})` : ''} · producto`, path(c, 3));
      if (c.sku) map.set(`${c.sku} · SKU`, path(c, 4));
    });
    gotoCache = { src: cat, n: cat.length, map };
    return map;
  }

  /** «Categoría Diabetes · Sucursal 108» para rótulos. */
  /** Rótulo de un valor: la sucursal se muestra por su nombre (nombre_sucursal); el código solo si no hay nombre. */
  function label(key, value) {
    if (key !== 'branch' || !value) return value;
    try { const b = (FP.productStore.geoOptions({}).branches || []).find((x) => x.code === value); if (b && b.name && b.name !== b.code) return b.name; } catch (e) { /* sin nombres */ }
    return value;
  }
  const describe = (f) => KEYS.filter((k) => f && f[k]).map((k) => `${LABEL[k]} ${label(k, f[k])}`).join(' · ');

  FP.productFilter = { KEYS, LABEL, active, isActive, options, cascade, describe, label, gotoOptions };
})(typeof window !== 'undefined' ? window : globalThis);
