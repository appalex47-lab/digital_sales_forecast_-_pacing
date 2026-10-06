/**
 * idb-proof.js — Prueba técnica obligatoria de IndexedDB (Fase 8, paso 14 del alcance).
 *
 * Compara dos diseños para hechos diarios por SKU:
 *  A · una fila por fecha × canal × SKU, con índices (date, sku, category, [channel,date], [category,date])
 *  B · una partición por fecha × canal con columnas tipadas (todos los SKUs del día) + rollup por categoría
 * Mide inserción, consultas, espacio, persistencia tras recargar y si la interfaz se congela.
 * Usa la base 'fp-idb-proof', separada de la app.
 */
(function () {
  'use strict';
  const IDB = window.FP.idb;
  const DB = 'fp-idb-proof';
  const CHANNELS = ['ecommerce', 'app', 'whatsapp', 'llamadas'];
  const $ = (id) => document.getElementById(id);
  const results = [];
  const now = () => performance.now();
  const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
  const fmtMB = (b) => (b === null || b === undefined ? 'n/d' : `${(b / 1048576).toFixed(1)} MB`);

  // Reloj de la interfaz: el máximo hueco entre ticks mide cuánto se congeló la UI
  let tick = 0, lastTick = now(), maxGap = 0, measuring = false;
  setInterval(() => {
    const t = now();
    if (measuring) maxGap = Math.max(maxGap, t - lastTick);
    lastTick = t; $('ticker').textContent = ++tick;
  }, 16);

  function row(n, label, pass, detail) {
    results.push({ n, label, pass, detail });
    $('results').insertAdjacentHTML('beforeend', `<tr><td>${n}</td><td>${label}</td>
      <td class="${pass ? 'ok' : 'fail'}">${pass ? '✓ Cumple' : '✗ No cumple'}</td><td class="muted">${detail}</td></tr>`);
  }
  const progress = (f) => { $('progress').firstElementChild.style.width = `${Math.round(f * 100)}%`; };

  function upgrade(db) {
    if (!db.objectStoreNames.contains('facts_rows')) {
      const s = db.createObjectStore('facts_rows', { keyPath: ['date', 'channel', 'sku'] });
      s.createIndex('date', 'date'); s.createIndex('sku', 'sku'); s.createIndex('category', 'category');
      s.createIndex('channel_date', ['channel', 'date']); s.createIndex('category_date', ['category', 'date']);
    }
    if (!db.objectStoreNames.contains('facts_days')) db.createObjectStore('facts_days', { keyPath: ['date', 'channel'] });
    if (!db.objectStoreNames.contains('rollup_category')) {
      const r = db.createObjectStore('rollup_category', { keyPath: ['date', 'channel', 'category'] });
      r.createIndex('category_date', ['category', 'date']);
    }
    if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'sku' });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
  }

  // Generador determinista (mismo resultado en cada corrida)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const CATS = ['Medicamentos', 'Dermocosmética', 'Cuidado personal', 'Bebés', 'Nutrición', 'Salud sexual', 'Vitaminas', 'Diabetes', 'Crónicos', 'Alta especialidad', 'Ortopedia', 'Higiene'];
  function catalog(nSkus) {
    const r = rng(7);
    return Array.from({ length: nSkus }, (_, i) => {
      const c = CATS[Math.floor(r() * CATS.length)];
      return { idx: i, sku: `SKU${String(100000 + i)}`, category: c, subcategory: `${c} ${1 + Math.floor(r() * 4)}`, product: `Producto ${i}` };
    });
  }
  const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  async function run() {
    $('run').disabled = true; $('results').innerHTML = ''; results.length = 0; progress(0);
    const days = +$('days').value, nSkus = +$('skus').value, nCh = Math.min(4, +$('channels').value);
    const channels = CHANNELS.slice(0, nCh);
    const total = days * nSkus * nCh;
    const withA = $('withA').checked;
    $('plan').textContent = `${days} días × ${nSkus.toLocaleString('es-MX')} SKUs × ${nCh} canales = ${total.toLocaleString('es-MX')} filas diarias por SKU.`;
    const out = { protocol: location.protocol, days, skus: nSkus, channels: nCh, rows: total };
    try {
      await IDB.deleteDatabase(DB);
      const est0 = await IDB.estimate();
      // 1–2 · crear base y stores
      let t = now();
      const db = await IDB.open(DB, 1, upgrade);
      const stores = [...db.objectStoreNames];
      row(1, 'Crear la base', true, `${fmtMs(now() - t)} · origen ${location.protocol}//${location.host || '(archivo local)'}`);
      row(2, 'Crear stores e índices', stores.length === 5, stores.join(', '));

      const cat = catalog(nSkus);
      await IDB.putMany(db, 'catalog', cat, { batchSize: 5000 });
      const start = '2026-01-01';
      const r = rng(11);

      // 3 · insertar (diseño A: filas) midiendo congelamiento de la UI
      measuring = true; maxGap = 0;
      t = now();
      let inserted = 0;
      for (let d = 0; withA && d < days; d++) {
        const date = addDays(start, d);
        const rows = [];
        channels.forEach((ch) => cat.forEach((c) => {
          const views = Math.round(20 + r() * 400), orders = Math.round(views * (0.005 + r() * 0.04));
          rows.push({ date, channel: ch, sku: c.sku, category: c.category, subcategory: c.subcategory,
            revenue: Math.round(orders * (150 + r() * 900) * 100) / 100, orders, units: orders + Math.round(r() * orders), views });
        }));
        await IDB.putMany(db, 'facts_rows', rows, { batchSize: 5000 });
        inserted += rows.length; progress(0.5 * inserted / total);
      }
      const tA = now() - t; const gapA = maxGap; measuring = false;
      const estA = await IDB.estimate();

      // Diseño B: particiones columnar + rollup por categoría
      measuring = true; maxGap = 0; t = now();
      const r2 = rng(11);
      for (let d = 0; d < days; d++) {
        const date = addDays(start, d);
        const parts = [], rolls = new Map();
        channels.forEach((ch) => {
          const n = cat.length;
          const p = { date, channel: ch, skuIdx: new Uint32Array(n), revenue: new Float64Array(n), orders: new Uint32Array(n), units: new Uint32Array(n), views: new Uint32Array(n) };
          cat.forEach((c, i) => {
            const views = Math.round(20 + r2() * 400), orders = Math.round(views * (0.005 + r2() * 0.04));
            const rev = Math.round(orders * (150 + r2() * 900) * 100) / 100, units = orders + Math.round(r2() * orders);
            p.skuIdx[i] = c.idx; p.revenue[i] = rev; p.orders[i] = orders; p.units[i] = units; p.views[i] = views;
            const k = `${ch}|${c.category}`;
            const g = rolls.get(k) || { date, channel: ch, category: c.category, revenue: 0, orders: 0, units: 0, views: 0, skus: 0 };
            g.revenue += rev; g.orders += orders; g.units += units; g.views += views; g.skus++; rolls.set(k, g);
          });
          parts.push(p);
        });
        await IDB.putMany(db, 'facts_days', parts, { batchSize: 50 });
        await IDB.putMany(db, 'rollup_category', [...rolls.values()], { batchSize: 500 });
        progress(0.5 + 0.5 * (d + 1) / days);
      }
      const tB = now() - t; const gapB = maxGap; measuring = false;
      const estB = await IDB.estimate();
      await IDB.put(db, 'meta', { key: 'proof', rows: total, days, skus: nSkus, channels: nCh, at: new Date().toISOString() });
      row(3, 'Insertar datos', true, `${withA ? `A (filas): ${fmtMs(tA)} · ${Math.round(total / (tA / 1000)).toLocaleString('es-MX')} filas/s. ` : ''}B (particiones + rollup): ${fmtMs(tB)} · ${Math.round(total / (tB / 1000)).toLocaleString('es-MX')} SKU-días/s.`);

      const from = addDays(start, Math.max(0, days - 30)), to = addDays(start, days - 1);
      const c0 = CATS[0];
      const target = cat[Math.floor(nSkus / 2)];
      const t0 = {};

      // 4 · leer
      t = now();
      const part0 = await IDB.get(db, 'facts_days', [start, channels[0]]);
      t0.readB = now() - t;
      let one = null;
      if (withA) { t = now(); one = await IDB.get(db, 'facts_rows', [start, channels[0], cat[0].sku]); t0.readA = now() - t; }
      row(4, 'Leer un registro', !!part0 && part0.skuIdx.length === nSkus && (!withA || (one && one.sku === cat[0].sku)),
        `B: partición ${start} ${channels[0]} con ${part0 ? part0.skuIdx.length.toLocaleString('es-MX') : 0} SKUs en ${fmtMs(t0.readB)}${withA ? ` · A: ${fmtMs(t0.readA)}` : ''}`);

      // 5 · por fecha (un día, todos los canales)
      t = now();
      const byDateB = await IDB.getAll(db, 'facts_days', { range: IDBKeyRange.bound([start, ''], [start, '\uffff']) });
      t0.dateB = now() - t;
      let byDate = [];
      if (withA) { t = now(); byDate = await IDB.getAll(db, 'facts_rows', { index: 'date', range: IDBKeyRange.only(start) }); t0.dateA = now() - t; }
      row(5, 'Consultar por fecha', byDateB.length === nCh && (!withA || byDate.length === nSkus * nCh),
        `B: ${byDateB.length} particiones (${(byDateB.length * nSkus).toLocaleString('es-MX')} SKU-días) en ${fmtMs(t0.dateB)}${withA ? ` · A: ${byDate.length.toLocaleString('es-MX')} filas en ${fmtMs(t0.dateA)}` : ''}`);

      // 6 · por SKU (todo el periodo)
      t = now();
      let skuB = 0, skuRevB = 0;
      await IDB.iterate(db, 'facts_days', {}, (p) => { if (p.skuIdx[target.idx] === target.idx) { skuB++; skuRevB += p.revenue[target.idx]; } });
      t0.skuB = now() - t;
      let bySku = [];
      if (withA) { t = now(); bySku = await IDB.getAll(db, 'facts_rows', { index: 'sku', range: IDBKeyRange.only(target.sku) }); t0.skuA = now() - t; }
      row(6, 'Consultar por SKU', skuB === days * nCh && (!withA || bySku.length === days * nCh),
        `B (recorre particiones): serie de ${target.sku} con ${skuB} días-canal en ${fmtMs(t0.skuB)}${withA ? ` · A (índice): ${bySku.length} en ${fmtMs(t0.skuA)}` : ''}`);

      // 7 · por categoría (últimos 30 días): rollup contra suma de SKUs
      t = now();
      const rollRows = await IDB.getAll(db, 'rollup_category', { index: 'category_date', range: IDBKeyRange.bound([c0, from], [c0, to]) });
      const revRoll = rollRows.reduce((a, x) => a + x.revenue, 0);
      t0.catB = now() - t;
      t = now();
      let revScan = 0;
      const inCat = new Uint8Array(nSkus); cat.forEach((c) => { if (c.category === c0) inCat[c.idx] = 1; });
      await IDB.iterate(db, 'facts_days', { range: IDBKeyRange.bound([from, ''], [to, '\uffff']) }, (p) => {
        for (let k = 0; k < p.skuIdx.length; k++) if (inCat[p.skuIdx[k]]) revScan += p.revenue[k];
      });
      t0.catScan = now() - t;
      row(7, 'Consultar por categoría (30 días)', Math.abs(revRoll - revScan) < 1,
        `Rollup: ${rollRows.length} filas en ${fmtMs(t0.catB)} · recalculado desde SKUs en ${fmtMs(t0.catScan)} · misma venta ${revRoll.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`);

      // 8 · filtrar por canal (30 días)
      t = now();
      let chParts = 0, chSkuDays = 0;
      await IDB.iterate(db, 'facts_days', { range: IDBKeyRange.bound([from, ''], [to, '\uffff']) }, (p) => { if (p.channel === channels[0]) { chParts++; chSkuDays += p.skuIdx.length; } });
      t0.chB = now() - t;
      row(8, 'Filtrar por canal (30 días)', chSkuDays === Math.min(30, days) * nSkus, `${chSkuDays.toLocaleString('es-MX')} SKU-días de ${channels[0]} en ${fmtMs(t0.chB)}`);

      // 9 · múltiples registros
      t = now();
      const nParts = await IDB.count(db, 'facts_days');
      const allA = withA ? await IDB.count(db, 'facts_rows') : null;
      row(9, 'Manejar múltiples registros', nParts * nSkus === total && (!withA || allA === total),
        `${(nParts * nSkus).toLocaleString('es-MX')} SKU-días en ${nParts.toLocaleString('es-MX')} particiones, contados en ${fmtMs(now() - t)}`);
      Object.assign(out, { readB_ms: Math.round(t0.readB), dateB_ms: Math.round(t0.dateB), skuB_ms: Math.round(t0.skuB), catRollup_ms: Math.round(t0.catB),
        catScan_ms: Math.round(t0.catScan), channelB_ms: Math.round(t0.chB), dateA_ms: t0.dateA && Math.round(t0.dateA), skuA_ms: t0.skuA && Math.round(t0.skuA) });

      // 12 · UI sin bloqueo
      row(12, 'No congelar la interfaz durante la carga', Math.max(withA ? gapA : 0, gapB) < 250, `Mayor pausa de la interfaz: B ${fmtMs(gapB)}${withA ? ` · A ${fmtMs(gapA)}` : ''} (menos de 250 ms se percibe fluido)`);

      const per = await IDB.persist();
      Object.assign(out, {
        insertA_ms: withA ? Math.round(tA) : null, insertB_ms: Math.round(tB), rowsPerSecB: Math.round(total / (tB / 1000)),
        maxGapA_ms: withA ? Math.round(gapA) : null, maxGapB_ms: Math.round(gapB),
        usageBefore: est0 && est0.usage, usageAfterA: estA && estA.usage, usageAfterB: estB && estB.usage, quota: estB && estB.quota,
        persisted: per
      });
      $('summary').hidden = false;
      $('summary').innerHTML = `<h2 style="margin-top:0">Espacio y proyección</h2>
        <p>Espacio usado: antes ${fmtMB(out.usageBefore)} · después de A ${fmtMB(out.usageAfterA)} · después de B ${fmtMB(out.usageAfterB)} · cuota disponible ${fmtMB(out.quota)}.</p>
        <p>Almacenamiento persistente: ${per.supported ? (per.persisted ? 'concedido' : 'no concedido (el navegador podría liberar espacio bajo presión)') : 'no soportado'}.</p>
        <p class="muted">Recarga la página: la verificación 10 comprueba que los datos siguen ahí.</p>`;
      db.close();
    } catch (e) {
      row('!', 'Error', false, String(e && e.message || e));
      out.error = String(e && e.message || e);
    }
    window.__proof = { results, ...out };
    $('run').disabled = false; progress(1);
  }

  // 10 · persistencia tras recargar (y 11 · origen)
  async function checkPersistence() {
    if (!IDB.available()) { row(0, 'IndexedDB disponible', false, 'Este navegador no expone IndexedDB.'); return; }
    try {
      const db = await IDB.open(DB, 1, upgrade);
      const meta = await IDB.get(db, 'meta', 'proof');
      if (meta) {
        const n = (await IDB.count(db, 'facts_days')) * meta.skus;
        row(10, 'Datos siguen después de recargar', n === meta.rows, `${n.toLocaleString('es-MX')} filas de la corrida del ${meta.at.slice(0, 19).replace('T', ' ')}`);
        window.__persist = { ok: n === meta.rows, rows: n };
      }
      row(11, 'Funciona en este origen', true, `${location.protocol}//${location.host || '(archivo local)'} · en GitHub Pages el origen es https y la base queda ligada a ese dominio`);
      db.close();
    } catch (e) { row(11, 'Funciona en este origen', false, String(e.message || e)); }
  }

  $('run').addEventListener('click', run);
  $('clean').addEventListener('click', async () => { await IDB.deleteDatabase(DB); $('results').innerHTML = ''; $('summary').hidden = true; progress(0); });
  checkPersistence();
})();
