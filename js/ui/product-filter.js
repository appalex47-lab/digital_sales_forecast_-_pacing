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

  /** «Categoría Diabetes · Sucursal 108» para rótulos. */
  const describe = (f) => KEYS.filter((k) => f && f[k]).map((k) => `${LABEL[k]} ${f[k]}`).join(' · ');

  FP.productFilter = { KEYS, LABEL, active, isActive, options, cascade, describe };
})(typeof window !== 'undefined' ? window : globalThis);
