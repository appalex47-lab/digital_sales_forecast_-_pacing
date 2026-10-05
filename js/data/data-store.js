/**
 * data-store.js — Modelo canónico de datos cargados (Fase 1).
 *
 *   store = {
 *     historical: { batches: [Batch], records: [CanonicalRecord] },
 *     plan:       { … },
 *     actual:     { … }
 *   }
 *
 * - Cada colección se guarda por separado (historicalData / planData / actualData).
 * - Batch = un archivo importado: metadatos, mapeo, opciones y TODOS sus issues
 *   (incluidos los de filas rechazadas) para trazabilidad.
 * - Duplicados nunca se eliminan; `resolveLatest()` define cuál usa la vista
 *   consolidada (la carga más reciente; dentro de un archivo, la última fila).
 * - `consolidate()` construye el Dataset de Fase 0 (DailyRecord plan/actual)
 *   para que todo lo construido antes siga funcionando sobre datos reales.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const DM = () => FP.dataModel;

  let seq = 0;
  const batchId = () => `bat-${Date.now().toString(36)}-${(++seq).toString(36)}`;

  function emptyCollection() { return { batches: [], records: [] }; }

  function createStore() {
    const s = {};
    C().dataTypeIds.forEach((t) => { s[t] = emptyCollection(); });
    return s;
  }

  const records = (store, dataType) => store[dataType].records;
  const batches = (store, dataType) => store[dataType].batches;
  const allBatches = (store) => C().dataTypeIds.flatMap((t) => store[t].batches);

  /**
   * Agrega un archivo procesado al modelo.
   * @param staged  resultado de importer.stage()
   * @param result  resultado de importer.process()
   * @param opts    { includeErrorRows, settings }
   * @returns batch
   */
  /**
   * Copia independiente de un registro (los guardados no comparten objetos con las filas en revisión). Equivale a la copia por JSON que se
   * usaba (omite los `undefined`), pero sin armar y volver a leer un texto por registro: con 500 mil filas bajó de ~3 s a una fracción.
   * Además comparte (internaliza) las cadenas que se repiten en cada registro —fecha, canal, dimensión, segmento…— en vez de guardar una
   * copia por registro: menos memoria con cientos de miles de registros.
   */
  const INTERN = new Map();
  const intern = (s) => { if (typeof s !== 'string') return s; let v = INTERN.get(s); if (v === undefined) { if (INTERN.size > 200000) INTERN.clear(); INTERN.set(s, s); v = s; } return v; };
  const INTERNED = new Set(['date', 'channel', 'dayType', 'dimension', 'segment', 'segmentKey', 'season', 'holiday', 'event', 'dataType']);
  const INTERNED_KEYS = [...INTERNED];
  function cloneValue(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) { const x = cloneValue(v[i]); a[i] = x === undefined ? null : x; } return a; }
    const o = {};
    for (const k in v) { if (!Object.prototype.hasOwnProperty.call(v, k)) continue; const x = v[k]; if (x === undefined || typeof x === 'function') continue; o[k] = cloneValue(x); }
    return o;
  }
  function cloneRecord(r) {
    const o = {};
    for (const k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      const x = r[k]; if (x === undefined) continue;
      o[k] = INTERNED.has(k) ? intern(x) : cloneValue(x);
    }
    return o;
  }

  function commitBatch(store, staged, result, { includeErrorRows = false, settings = {}, source = null, durationMs = null } = {}) {
    if (!result.canImport) throw new Error('El archivo tiene problemas de mapeo; corrígelos antes de importar.');
    const id = batchId();
    const selected = FP.importer.selectRows(result, { includeErrorRows });
    const acceptedLines = new Set(selected.map((r) => r.line));

    const newRecords = new Array(selected.length);
    for (let i = 0; i < selected.length; i++) {
      const rec = cloneRecord(selected[i].record);
      rec.provenance.batchId = id;
      rec.provenance.fileName = staged.fileName;
      delete rec.provenance.columns; // el mapeo vive una sola vez en el batch
      newRecords[i] = rec;
    }

    const batch = {
      id,
      dataType: staged.dataType,
      fileName: staged.fileName,
      importedAt: new Date().toISOString(),
      rowCount: result.rows.length,
      accepted: newRecords.length,
      rejected: result.rows.length - newRecords.length,
      quarantined: newRecords.filter((r) => r.status === 'quarantined').length,
      source: source || staged.sourceType || 'csv', durationMs,
      detection: staged.detection || null,   // Fase B · tipo de dataset detectado y método   // Fase A · auditoría: tipo de fuente y duración de la carga
      includeErrorRows,
      settings: { ...settings },
      mapping: { ...staged.mapping },
      delimiter: staged.parsed.delimiter,
      summary: result.summary,
      issues: result.issues.map((i) => ({ ...i, batchId: id, fileName: staged.fileName, dataType: staged.dataType,
        rowImported: acceptedLines.has(i.row) }))
    };
    store[staged.dataType].batches.push(batch);
    // Bucle, no push(...newRecords): con ~100 mil registros o más, pasar el arreglo como argumentos desborda la pila («Maximum call stack
    // size exceeded») y «Importar» no hacía nada. Un archivo de Segmentos de 492,029 filas lo provocaba.
    const dest = store[staged.dataType].records;
    for (let i = 0; i < newRecords.length; i++) dest.push(newRecords[i]);
    return batch;
  }

  /**
   * Igual que commitBatch, pero con los registros ya validados y preparados por el Worker de importación (llegan por bloques con el
   * identificador del lote ya puesto). `done` trae lo que calculó el Worker: filas leídas, aceptadas, rechazadas, en cuarentena, resumen,
   * problemas (con rowImported) y mapeo. El lote queda con los mismos campos que el de commitBatch.
   */
  function commitRemote(store, staged, done, records, { id, includeErrorRows = false, settings = {}, source = null, durationMs = null } = {}) {
    const batch = {
      id, dataType: staged.dataType, fileName: staged.fileName, importedAt: new Date().toISOString(),
      rowCount: done.rowCount, accepted: done.accepted, rejected: done.rejected, quarantined: done.quarantined,
      source: source || staged.sourceType || 'csv', durationMs,
      detection: staged.detection || null,
      includeErrorRows, settings: { ...settings }, mapping: { ...done.mapping }, delimiter: done.delimiter,
      summary: done.summary, issues: done.issues
    };
    store[staged.dataType].batches.push(batch);
    const dest = store[staged.dataType].records;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      for (const k of INTERNED_KEYS) if (typeof r[k] === 'string') r[k] = intern(r[k]);   // la copia entre hilos duplica cada cadena: se vuelven a compartir
      dest.push(r);   // bucle: con cientos de miles de registros push(...lista) desborda la pila
    }
    return batch;
  }

  /** Quita un archivo importado y sus registros (acción explícita del usuario). */
  function removeBatch(store, id) {
    C().dataTypeIds.forEach((t) => {
      store[t].batches = store[t].batches.filter((b) => b.id !== id);
      store[t].records = store[t].records.filter((r) => r.provenance.batchId !== id);
    });
  }

  function clearCollection(store, dataType) { store[dataType] = emptyCollection(); }

  /** Grupos de registros con la misma llave (fecha|canal|tipo) y más de una aparición. */
  function findDuplicates(store, dataType) {
    const groups = new Map();
    records(store, dataType).forEach((r) => {
      if (!groups.has(r.key)) groups.set(r.key, []);
      groups.get(r.key).push(r);
    });
    return [...groups.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, records: list }));
  }

  /**
   * Un registro por llave: el último importado gana (orden de inserción).
   * @returns Map key → record
   */
  /* ---------- Rendimiento: resultados en memoria con invalidación automática ----------
   * Con cientos de miles de registros, recorrerlos en cada render (cobertura, resolveLatest, sumas de Segmentos…) tardaba segundos.
   * La firma de una colección es la identidad de su arreglo de registros + cuántos registros y lotes tiene: cambia al importar,
   * quitar, reemplazar o recargar, y entonces los resultados guardados se descartan solos. Los resultados se devuelven tal cual:
   * quien los use no debe modificarlos (hoy todos los consumidores solo leen). */
  const IDS = new WeakMap(); let nextId = 1;
  const idOf = (o) => { let v = IDS.get(o); if (!v) { v = nextId++; IDS.set(o, v); } return v; };
  function signature(store, t) { const c = store[t]; return `${idOf(c.records)}:${c.records.length}:${c.batches.length}`; }
  const MEMO = new WeakMap();
  /** compute() se ejecuta una vez por (store, clave, firma de los tipos indicados). */
  function cached(store, key, types, compute) {
    let m = MEMO.get(store); if (!m) { m = new Map(); MEMO.set(store, m); }
    const sig = types.map((t) => signature(store, t)).join('|');
    const hit = m.get(key);
    if (hit && hit.sig === sig) return hit.value;
    const value = compute();
    m.delete(key); m.set(key, { sig, value });
    // tope: resultados por parámetros (periodo, dimensión, canal…) se acumulan al explorar; se descartan los más antiguos
    if (m.size > 300) { let n = m.size - 300; for (const k of m.keys()) { if (n-- <= 0) break; m.delete(k); } }
    return value;
  }

  function resolveLatest(store, dataType) {
    return cached(store, `latest:${dataType}`, [dataType], () => {
      const map = new Map();
      records(store, dataType).forEach((r) => map.set(r.key, r));
      return map;
    });
  }
  /** Lista de los registros vigentes (el último de cada llave) sin conservar el Map: es lo que necesitan Segmentos y el Diagnóstico. */
  function latestList(store, dataType) {
    return cached(store, `latestList:${dataType}`, [dataType], () => {
      const m = new Map();
      records(store, dataType).forEach((r) => m.set(r.key, r));
      return [...m.values()];
    });
  }
  /**
   * Índice de Segmentos: dimensión → fecha → registros. Una consulta por dimensión y rango de fechas recorre solo esos días y esa
   * dimensión, no toda la colección. { list, byDim: Map(dimension → Map(date → registros[])) }.
   */
  function segmentIndex(store) {
    return cached(store, 'segmentIndex', ['segments'], () => {
      const list = latestList(store, 'segments');
      const byDim = new Map();
      list.forEach((r) => {
        let d = byDim.get(r.dimension); if (!d) byDim.set(r.dimension, (d = new Map()));
        const a = d.get(r.date); if (a) a.push(r); else d.set(r.date, [r]);
      });
      return { list, byDim };
    });
  }

  /** Valores utilizables de un registro canónico: solo observados (lo calculado se re-deriva). */
  function observedValues(rec) {
    const out = {};
    C().metricKeys.forEach((k) => { if (rec.metrics[k].source === 'observed') out[k] = rec.metrics[k].value; });
    return out;
  }

  /**
   * Vista consolidada de un año como Dataset de Fase 0.
   * plan ← planData, actual ← actualData (el histórico queda aparte, para estacionalidad).
   * Valores `invalid` no pasan; `calculated` se vuelve a derivar con el mismo motor.
   */
  function consolidate(store, year, { planFallback = null } = {}) {
    const ds = DM().createDataset(year, { source: 'import', label: 'Datos importados' });
    const plan = resolveLatest(store, 'plan');
    const actual = resolveLatest(store, 'actual');
    const byDayChannel = new Map();
    const collect = (map, kind) => map.forEach((rec) => {
      if (!rec.date || !rec.date.startsWith(`${year}-`)) return;
      const k = `${rec.date}|${rec.channel}`;
      if (!byDayChannel.has(k)) byDayChannel.set(k, {});
      byDayChannel.get(k)[kind] = rec;
    });
    collect(plan, 'plan');
    collect(actual, 'actual');

    // Fase 2: días sin planData toman el plan distribuido original (nunca sobre un plan explícito)
    let fromDistributed = 0;
    if (planFallback) {
      planFallback.forEach((values, k) => {
        if (!k.startsWith(`${year}-`)) return;
        const [date, channel] = k.split('|');
        if (!byDayChannel.has(k)) byDayChannel.set(k, {});
        const pair = byDayChannel.get(k);
        if (!pair.plan) {
          pair.distributed = { date, channel, dayType: 'regular', holiday: null, event: null, season: null, values };
          fromDistributed++;
        }
      });
    }

    byDayChannel.forEach((pair) => {
      const base = pair.actual || pair.plan || pair.distributed;
      const meta = pair.actual && pair.actual.dayType !== 'regular' ? pair.actual : pair.plan && pair.plan.dayType !== 'regular' ? pair.plan : base;
      DM().upsertRecord(ds, DM().createDailyRecord({
        date: base.date,
        channel: base.channel,
        dayType: meta.dayType,
        holiday: meta.holiday,
        event: meta.event,
        season: meta.season,
        plan: pair.plan ? observedValues(pair.plan) : pair.distributed ? pair.distributed.values : null,
        actual: pair.actual ? observedValues(pair.actual) : null
      }));
    });
    ds.meta.planFromDistributed = fromDistributed;
    ds.meta.duplicatesResolved = { plan: findDuplicates(store, 'plan').length, actual: findDuplicates(store, 'actual').length };
    return ds;
  }

  /** Años presentes en una colección (o en todas). */
  function years(store, dataType = null) {
    const types = dataType ? [dataType] : C().dataTypeIds;
    const set = new Set();
    types.forEach((t) => records(store, t).forEach((r) => r.date && set.add(+r.date.slice(0, 4))));
    return [...set].sort();
  }

  function isEmpty(store) { return C().dataTypeIds.every((t) => !store[t].records.length && !store[t].batches.length); }

  /* ---------- Serialización compacta para storage ----------
   * localStorage tiene ~5 MB por sitio. Un registro canónico en JSON ocupa ~600 caracteres;
   * empaquetado como arreglo ocupa ~110. Formato 'packed-v1':
   *   [date, channel, dayType, holiday, event, season, notes, status, nErr, nWarn, batchIndex, row,
   *    ...por métrica en config.metricKeys: [value, sourceCode, raw?, note?] ]
   * sourceCode: o=observed c=calculated m=missing i=invalid q=quarantined (Fase A: 5.º elemento { p: valor interpretado, r: regla })
   */
  const SRC_CODE = { observed: 'o', calculated: 'c', missing: 'm', invalid: 'i', quarantined: 'q' };
  const CODE_SRC = { o: 'observed', c: 'calculated', m: 'missing', i: 'invalid', q: 'quarantined' };

  /** Empaqueta los registros [from, to) con el índice de lotes de la colección (formato 'packed-v1'). */
  function packRecords(col, from = 0, to = col.records.length, index = null) {
    const idx = index || new Map(col.batches.map((b, i) => [b.id, i]));
    const out = [];
    for (let n = from; n < to; n++) {
      const r = col.records[n];
      const a = [
        r.date, r.channel, r.dayType, r.holiday, r.event, r.season, r.notes, r.status,
        r.issueCounts.error, r.issueCounts.warning, idx.has(r.provenance.batchId) ? idx.get(r.provenance.batchId) : -1, r.provenance.row,
        ...C().metricKeys.map((k) => {
          const c = r.metrics[k];
          const m = [c.value, SRC_CODE[c.source]];
          if (c.source === 'quarantined') { m.push(c.raw === undefined ? null : c.raw, c.note || null, { p: c.parsedValue === undefined ? null : c.parsedValue, r: c.rule || null }); return m; }
          if (c.raw !== undefined || c.note) m.push(c.raw === undefined ? null : c.raw);
          if (c.note) m.push(c.note);
          return m;
        })
      ];
      // Fase 5 (aditivo, índice 17): dimensión, segmento y métricas extra
      if (r.dimension || r.extra) a.push({ d: r.dimension || null, s: r.segment || null, k: r.segmentKey || null, x: r.extra || null });
      out.push(a);
    }
    return out;
  }

  function packCollection(col) {
    return { format: 'packed-v1', batches: col.batches, records: packRecords(col) };
  }

  /* ---------- Guardado por bloques (colecciones grandes) ----------
   * Un archivo de Segmentos de ~490 mil filas generaba, al guardar, un solo valor gigante (empaquetado + JSON + copia + clon de IndexedDB)
   * y la pestaña se quedaba sin memoria. Por encima de CHUNK_THRESHOLD registros se guarda en bloques de CHUNK_SIZE bajo claves
   * `<clave>:c<sello>-<n>` y un índice `packed-chunked-v1` en la clave de siempre (se escribe al final: es el interruptor atómico).
   */
  const CHUNK_SIZE = 25000, CHUNK_THRESHOLD = 60000;
  const isChunkedManifest = (d) => Boolean(d && d.format === 'packed-chunked-v1' && Array.isArray(d.batches) && d.chunks > 0);
  const chunkKey = (key, stamp, i) => `${key}:c${stamp}-${i}`;
  /** Clave del bloque i de un índice guardado. Los índices nuevos traen `stamps` (un sello por bloque, porque un guardado puede reutilizar
   *  los bloques llenos del anterior); los antiguos, un solo `stamp`. */
  const chunkKeyOf = (key, manifest, i) => chunkKey(key, (manifest.stamps && manifest.stamps[i]) || manifest.stamp, i);

  /* Guardado incremental: el almacén solo crece con push (importar) y se reemplaza por completo al quitar un lote o limpiar, así que
   * mientras el arreglo de registros y el de lotes sean los mismos objetos, los registros ya guardados no cambiaron. */
  const SAVED = new WeakMap();
  /** Anota qué parte de la colección ya está guardada en bloques: { batchesRef, count, stamps }. */
  function markSaved(col, { count, stamps }) { SAVED.set(col.records, { batchesRef: col.batches, count, stamps }); }
  /** Bloques llenos del guardado anterior que siguen valiendo (ninguno si se quitó un lote, se limpió o se recargó sin anotar). */
  function reusableChunks(col) {
    const m = SAVED.get(col.records);
    if (!m || m.batchesRef !== col.batches || col.records.length < m.count) return { n: 0, stamps: [] };
    const n = Math.min(Math.floor(m.count / CHUNK_SIZE), m.stamps.length);
    return { n, stamps: m.stamps.slice(0, n) };
  }

  /** Rehidrata una colección guardada por bloques. readChunk(i) devuelve el sobre guardado del bloque i (o null si falta). */
  function hydrateChunked(manifest, dataType, readChunk) {
    const recs = []; let missing = 0;
    for (let i = 0; i < manifest.chunks; i++) {
      const env = readChunk(i); const raw = env && env.data ? env.data : null;
      if (!raw || !Array.isArray(raw.records)) { missing++; continue; }
      for (let n = 0; n < raw.records.length; n++) {
        const a = raw.records[n];
        try { if (Array.isArray(a) && a[0] && a[1]) recs.push(unpackRecord(a, manifest.batches, dataType)); } catch (e) { /* omite */ }
      }
    }
    return { collection: { batches: manifest.batches, records: recs }, missingChunks: missing };
  }

  function unpackRecord(a, batchesList, dataType) {
    const b = batchesList[a[10]] || { id: null, fileName: null };
    const metrics = {};
    C().metricKeys.forEach((k, i) => {
      const m = a[12 + i] || [null, 'm'];
      metrics[k] = { value: m[0], source: CODE_SRC[m[1]] || 'missing' };
      if (m.length > 2 && m[2] !== null) metrics[k].raw = m[2];
      if (m.length > 3) metrics[k].note = m[3];
      if (m[1] === 'q') {   // Fase A: la cuarentena conserva su valor original, el interpretado y la regla al guardar y recargar
        const x = m[4] && typeof m[4] === 'object' ? m[4] : {};
        metrics[k] = { value: null, source: 'quarantined', raw: m.length > 2 ? m[2] : null, parsedValue: x.p === undefined ? null : x.p, rule: x.r || null, note: m[3] || '' };
      }
    });
    const rec = {
      key: `${a[0]}|${a[1]}|${dataType}`, dataType, date: a[0], channel: a[1], dayType: a[2],
      holiday: a[3], event: a[4], season: a[5], notes: a[6], metrics, status: a[7],
      issueCounts: { error: a[8], warning: a[9] },
      provenance: { batchId: b.id, fileName: b.fileName, row: a[11] }
    };
    const ex = a[12 + C().metricKeys.length];
    if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
      if (ex.x) rec.extra = ex.x;
      if (ex.d) { rec.dimension = ex.d; rec.segment = ex.s; rec.segmentKey = ex.k; rec.key = `${rec.key}|${ex.d}|${ex.k}`; }
    }
    return rec;
  }

  /** Rehidrata una colección guardada (acepta formato empaquetado o plano; tolera datos corruptos). */
  function hydrateCollection(raw, dataType) {
    if (!raw || !Array.isArray(raw.records) || !Array.isArray(raw.batches)) return emptyCollection();
    if (raw.format === 'packed-v1') {
      const recs = [];
      raw.records.forEach((a) => {
        try { if (Array.isArray(a) && a[0] && a[1]) recs.push(unpackRecord(a, raw.batches, dataType)); } catch (e) { /* omite */ }
      });
      return { batches: raw.batches, records: recs };
    }
    return { batches: raw.batches, records: raw.records.filter((r) => r && r.key && r.metrics) };
  }

  /**
   * Convierte un Dataset de Fase 0 (mock o guardado antiguo) en filas planas
   * para pasarlas por el pipeline de importación. Solo exporta valores cargados.
   */
  function datasetToRows(dataset, state) {
    const rows = [];
    DM().allRecords(dataset).forEach((r) => {
      const src = r.sources[state] || {};
      const loaded = C().metricKeys.filter((k) => src[k] && src[k] !== 'calculated');
      if (!loaded.length) return;
      const row = { fecha: r.date, canal: r.channel, evento: r.event || '', festivo: r.holiday || '', temporada: r.season || '' };
      C().metricKeys.forEach((k) => { row[C().metrics[k].csv] = loaded.includes(k) ? r[state][k] : ''; });
      rows.push(row);
    });
    return { headers: ['fecha', 'canal', ...C().metricKeys.map((k) => C().metrics[k].csv), 'evento', 'festivo', 'temporada'], rows };
  }

  FP.dataStore = { signature, cached, latestList, segmentIndex, cloneRecord, commitRemote, newBatchId: () => batchId(),
    createStore, emptyCollection, records, batches, allBatches,
    commitBatch, removeBatch, clearCollection,
    findDuplicates, resolveLatest, observedValues, consolidate, years, isEmpty,
    packCollection, packRecords, hydrateCollection, hydrateChunked, isChunkedManifest, chunkKey, chunkKeyOf, markSaved, reusableChunks, CHUNK_SIZE, CHUNK_THRESHOLD, datasetToRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
