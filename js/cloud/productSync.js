/**
 * productSync.js — Productos en la nube del equipo.
 *
 * Los productos viven en IndexedDB como bloques día × canal con columnas tipadas (no caben en el sobre {data} de las demás claves),
 * así que se exportan por separado:
 *  - cada bloque se serializa (las columnas tipadas pasan a arreglos), se agrupa en trozos de ~20 000 renglones y se comprime con gzip;
 *  - el trozo viaja como una clave más de la nube (`productsCloud:<almacén>:<n>`), partida en filas de texto por cloudSync;
 *  - el manifiesto (`productsCloud:manifest`) lista los trozos vigentes: lo que no esté ahí se ignora al restaurar y se poda de la nube.
 * Los resúmenes (productRollups) NO viajan: la app los recalcula al restaurar. Esta copia reemplaza a la anterior (gana la última subida).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const PREFIX = 'productsCloud';
  const STORES = ['productDays', 'productFunnel', 'productCatalog', 'productBatches'];
  const META_KEYS_SKIP = ['productGeoRollups', 'productRebuild'];     // se recalculan al restaurar
  const ROWS_PER_CHUNK = 20000;
  const MAX_BYTES = 100 * 1024 * 1024;                                  // tope de texto subido (plan gratuito de Supabase: 500 MB en total)
  const IDB = () => FP.idb;
  const isKey = (k) => String(k).split(':')[0] === PREFIX;

  /* ---------- serialización ---------- */
  const TA = { Float64Array, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };
  const replacer = (k, v) => (ArrayBuffer.isView(v) && !(v instanceof DataView) ? { __ta: v.constructor.name, v: Array.from(v) } : v);
  const reviver = (k, v) => (v && typeof v === 'object' && v.__ta && TA[v.__ta] ? TA[v.__ta].from(v.v) : v);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  async function pipe(u8, stream) {
    const out = await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer(); return new Uint8Array(out);
  }
  async function pack(obj) { return b64(await pipe(new TextEncoder().encode(JSON.stringify(obj, replacer)), new CompressionStream('gzip'))); }
  async function unpack(str) { return JSON.parse(new TextDecoder().decode(await pipe(unb64(str), new DecompressionStream('gzip'))), reviver); }
  const envelope = (data, at) => ({ schemaVersion: 1, savedAt: at, data });

  /* ---------- exportar ---------- */
  async function plan(repo) {
    const db = repo.db, out = {};
    for (const store of STORES) {
      const groups = []; let cur = null;
      if (store === 'productDays' || store === 'productFunnel') {
        await IDB().iterate(db, store, {}, (p) => {
          if (!cur || cur.rows >= ROWS_PER_CHUNK) { cur = { keys: [], rows: 0 }; groups.push(cur); }
          cur.keys.push([p.date, p.channel]); cur.rows += p.n || 0;
        });
      } else {
        const all = await IDB().getAll(db, store);
        for (let i = 0; i < all.length; i += 5000) groups.push({ all: all.slice(i, i + 5000), rows: Math.min(5000, all.length - i) });
      }
      out[store] = groups;
    }
    return out;
  }

  /** Arma todo lo que se va a subir (ya comprimido). Devuelve { items: Map(key → sobre), bytes, rows } o { empty:true } o { tooBig:true, bytes }. */
  async function build(repo, { maxBytes = MAX_BYTES } = {}) {
    if (!repo || !repo.ready) return { empty: true };
    const at = new Date().toISOString(), pl = await plan(repo), items = new Map(), man = { version: 1, at, stores: {}, keys: [] };
    let bytes = 0, rows = 0;
    const put = (key, data) => { items.set(key, envelope(data, at)); man.keys.push(key); bytes += data.z.length; };
    for (const store of STORES) {
      man.stores[store] = { chunks: pl[store].length, rows: pl[store].reduce((a, g) => a + g.rows, 0) };
      if (store === 'productDays') rows = man.stores[store].rows;
      for (let i = 0; i < pl[store].length; i++) {
        const g = pl[store][i]; let recs;
        if (g.all) recs = g.all;
        else { recs = []; for (const k of g.keys) { const r = await IDB().get(repo.db, store, k); if (r) recs.push(r); } }
        put(`${PREFIX}:${store}:${i}`, { store, n: recs.length, z: await pack(recs) });
        if (bytes > maxBytes) return { tooBig: true, bytes };
      }
    }
    const metaRows = (await IDB().getAll(repo.db, 'meta')).filter((m) => /^product/.test(m.key) && !META_KEYS_SKIP.includes(m.key));
    put(`${PREFIX}:meta`, { store: 'meta', n: metaRows.length, z: await pack(metaRows) });
    if (!man.stores.productDays.rows && !man.stores.productFunnel.rows) return { empty: true };
    items.set(`${PREFIX}:manifest`, envelope(man, at));
    return { items, bytes, rows, keys: [...items.keys()], manifest: man };
  }

  /** Proveedor de claves para FP.cloud.upload: lo local + el paquete de productos. */
  function withProducts(localProvider, bundle) {
    return {
      keys: async () => [...(await localProvider.keys()).filter((k) => !isKey(k)), ...(bundle && bundle.items ? bundle.items.keys() : [])],
      read: async (k) => (isKey(k) ? (bundle && bundle.items.get(k)) || null : localProvider.read(k))
    };
  }

  /* ---------- restaurar ---------- */
  /** items: los de FP.cloud.download(). Reemplaza los productos locales por la copia del equipo. Devuelve { ok, rows } o { ok:false, error }. */
  async function restore(repo, items, { onProgress } = {}) {
    const mine = new Map(items.filter((i) => isKey(i.key)).map((i) => [i.key, i.envelope]));
    if (!mine.size) return { ok: true, none: true };
    if (!repo || !repo.ready) return { ok: false, error: 'Este navegador no tiene IndexedDB disponible: no se pueden restaurar los productos.' };
    const man = mine.get(`${PREFIX}:manifest`) && mine.get(`${PREFIX}:manifest`).data;
    if (!man || !Array.isArray(man.keys)) return { ok: false, error: 'La copia de productos de la nube no tiene manifiesto. No se restauró nada de productos.' };
    const miss = man.keys.filter((k) => !mine.has(k));
    if (miss.length) return { ok: false, error: `La copia de productos está incompleta en la nube (faltan ${miss.length} trozos). No se restauró nada de productos.` };
    const decoded = {};
    try {
      let n = 0;
      for (const k of man.keys) {
        if (onProgress) onProgress(n++, man.keys.length);
        const d = mine.get(k).data; (decoded[d.store] = decoded[d.store] || []).push(...await unpack(d.z));
      }
    } catch (e) { return { ok: false, error: 'La copia de productos está dañada. No se restauró nada de productos.' }; }
    const db = repo.db;
    for (const s of [...STORES, 'productRollups']) await IDB().clear(db, s);
    for (const m of await IDB().getAll(db, 'meta')) if (/^product/.test(m.key)) await IDB().del(db, 'meta', m.key);
    for (const store of STORES) if ((decoded[store] || []).length) await IDB().putMany(db, store, decoded[store]);
    for (const m of decoded.meta || []) await IDB().put(db, 'meta', m);
    if (FP.customerStore) FP.customerStore.reset();           // el libro de clientes viaja en `meta`: se vuelve a leer
    if (FP.productStore) await FP.productStore.init(repo);   // recalcula los resúmenes que no viajaron
    return { ok: true, rows: (man.stores.productDays || {}).rows || 0, funnel: (man.stores.productFunnel || {}).rows || 0 };
  }

  FP.productSync = { PREFIX, STORES, MAX_BYTES, isKey, build, withProducts, restore, pack, unpack };
})(typeof window !== 'undefined' ? window : globalThis);
