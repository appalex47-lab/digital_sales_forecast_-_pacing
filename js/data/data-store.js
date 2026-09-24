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
  function commitBatch(store, staged, result, { includeErrorRows = false, settings = {} } = {}) {
    if (!result.canImport) throw new Error('El archivo tiene problemas de mapeo; corrígelos antes de importar.');
    const id = batchId();
    const selected = FP.importer.selectRows(result, { includeErrorRows });
    const acceptedLines = new Set(selected.map((r) => r.line));

    const newRecords = selected.map((r) => {
      const rec = JSON.parse(JSON.stringify(r.record));
      rec.provenance.batchId = id;
      rec.provenance.fileName = staged.fileName;
      delete rec.provenance.columns; // el mapeo vive una sola vez en el batch
      return rec;
    });

    const batch = {
      id,
      dataType: staged.dataType,
      fileName: staged.fileName,
      importedAt: new Date().toISOString(),
      rowCount: result.rows.length,
      accepted: newRecords.length,
      rejected: result.rows.length - newRecords.length,
      includeErrorRows,
      settings: { ...settings },
      mapping: { ...staged.mapping },
      delimiter: staged.parsed.delimiter,
      summary: result.summary,
      issues: result.issues.map((i) => ({ ...i, batchId: id, fileName: staged.fileName, dataType: staged.dataType,
        rowImported: acceptedLines.has(i.row) }))
    };
    store[staged.dataType].batches.push(batch);
    store[staged.dataType].records.push(...newRecords);
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
  function resolveLatest(store, dataType) {
    const map = new Map();
    records(store, dataType).forEach((r) => map.set(r.key, r));
    return map;
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
   * sourceCode: o=observed c=calculated m=missing i=invalid
   */
  const SRC_CODE = { observed: 'o', calculated: 'c', missing: 'm', invalid: 'i' };
  const CODE_SRC = { o: 'observed', c: 'calculated', m: 'missing', i: 'invalid' };

  function packCollection(col) {
    const index = new Map(col.batches.map((b, i) => [b.id, i]));
    return {
      format: 'packed-v1',
      batches: col.batches,
      records: col.records.map((r) => [
        r.date, r.channel, r.dayType, r.holiday, r.event, r.season, r.notes, r.status,
        r.issueCounts.error, r.issueCounts.warning, index.has(r.provenance.batchId) ? index.get(r.provenance.batchId) : -1, r.provenance.row,
        ...C().metricKeys.map((k) => {
          const c = r.metrics[k];
          const a = [c.value, SRC_CODE[c.source]];
          if (c.raw !== undefined || c.note) a.push(c.raw === undefined ? null : c.raw);
          if (c.note) a.push(c.note);
          return a;
        })
      ])
    };
  }

  function unpackRecord(a, batchesList, dataType) {
    const b = batchesList[a[10]] || { id: null, fileName: null };
    const metrics = {};
    C().metricKeys.forEach((k, i) => {
      const m = a[12 + i] || [null, 'm'];
      metrics[k] = { value: m[0], source: CODE_SRC[m[1]] || 'missing' };
      if (m.length > 2 && m[2] !== null) metrics[k].raw = m[2];
      if (m.length > 3) metrics[k].note = m[3];
    });
    return {
      key: `${a[0]}|${a[1]}|${dataType}`, dataType, date: a[0], channel: a[1], dayType: a[2],
      holiday: a[3], event: a[4], season: a[5], notes: a[6], metrics, status: a[7],
      issueCounts: { error: a[8], warning: a[9] },
      provenance: { batchId: b.id, fileName: b.fileName, row: a[11] }
    };
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

  FP.dataStore = {
    createStore, emptyCollection, records, batches, allBatches,
    commitBatch, removeBatch, clearCollection,
    findDuplicates, resolveLatest, observedValues, consolidate, years, isEmpty,
    packCollection, hydrateCollection, datasetToRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
