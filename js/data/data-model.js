/**
 * data-model.js — Contrato de datos interno (schema 1.0.0).
 *
 * Entidades:
 *  - DailyRecord : un día × un canal, con bloques plan / actual / forecast.
 *  - Targets     : metas jerárquicas (año → canal → mes → semana → día).
 *  - Dataset     : colección indexada de DailyRecord para un año.
 *
 * Este módulo crea, valida y consulta estructuras. No calcula forecast
 * ni distribuye metas (fases posteriores).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const Cal = () => FP.calendar;

  const recordId = (date, channel) => `${date}|${channel}`;
  const isChannel = (id) => C().channelIds.includes(id);
  const getChannel = (id) => C().channels.find((c) => c.id === id) || null;

  function emptySources() {
    const s = {};
    C().metricKeys.forEach((k) => { s[k] = null; });
    return s;
  }

  /**
   * Crea un DailyRecord.
   * `plan`, `actual`, `forecast`: valores cargados (parciales).
   * Los faltantes se derivan y quedan marcados como 'calculated' en `sources`.
   */
  function createDailyRecord({ date, channel, dayType = 'regular', holiday = null, event = null,
    season = null, plan = null, actual = null, forecast = null,
    planSource = 'input', actualSource = 'observed' } = {}) {
    const attrs = Cal().getDateAttributes(date);
    if (!attrs) throw new Error(`Fecha inválida: "${date}" (formato esperado YYYY-MM-DD)`);
    if (!isChannel(channel)) throw new Error(`Canal inválido: "${channel}"`);
    if (!C().dayTypes.includes(dayType)) throw new Error(`dayType inválido: "${dayType}"`);

    const record = {
      id: recordId(attrs.date, channel),
      ...attrs,
      channel,
      dayType,
      holiday,
      event,
      season,
      plan: M().emptyBlock(),
      actual: M().emptyBlock(),
      forecast: M().emptyBlock(),
      sources: { plan: emptySources(), actual: emptySources(), forecast: emptySources() },
      validation: { plan: null, actual: null, forecast: null }
    };
    if (plan) setBlock(record, 'plan', plan, planSource);
    if (actual) setBlock(record, 'actual', actual, actualSource);
    if (forecast) setBlock(record, 'forecast', forecast, 'model');
    return record;
  }

  /** Asigna un bloque (plan|actual|forecast) derivando huecos y validando. */
  function setBlock(record, state, values, sourceType = 'observed') {
    if (!C().dataStates.includes(state)) throw new Error(`Estado inválido: "${state}"`);
    const { values: v, sources, rejected } = M().deriveBlock(values, sourceType);
    record[state] = v;
    record.sources[state] = sources;
    record.validation[state] = M().validateBlock(v, sources, rejected);
    return record;
  }

  /* ---------- Metas ---------- */

  function emptyTargetBlock() {
    return { revenue: null, orders: null, trafficVolume: null, conversionRate: null, aov: null };
  }

  /**
   * Metas jerárquicas. En Fase 0 solo se capturan `annual.revenue` y
   * `byChannel[ch].revenue`. byMonth/byWeek/byDay quedan vacíos hasta
   * que exista el algoritmo de distribución.
   *   byMonth: { '2026-09': { total: Block, byChannel: { ecommerce: Block } } }
   */
  function createTargets(year) {
    const byChannel = {};
    C().channelIds.forEach((id) => { byChannel[id] = emptyTargetBlock(); });
    return {
      year,
      currency: C().currency,
      annual: emptyTargetBlock(),
      byChannel,
      byMonth: {},
      byWeek: {},
      byDay: {},
      updatedAt: null
    };
  }

  /** Valida suma de metas por canal contra la meta anual. */
  function validateTargets(targets, metric = 'revenue') {
    const children = C().channelIds.map((id) => targets.byChannel[id] && targets.byChannel[id][metric]);
    return M().validateHierarchy(targets.annual[metric], children);
  }

  /* ---------- Dataset ---------- */

  function createDataset(year, meta = {}) {
    return {
      schemaVersion: C().schemaVersion,
      year,
      meta: { source: null, createdAt: new Date().toISOString(), ...meta },
      records: {} // id → DailyRecord
    };
  }

  function upsertRecord(dataset, record) { dataset.records[record.id] = record; return record; }
  function getRecord(dataset, date, channel) { return dataset.records[recordId(date, channel)] || null; }
  function allRecords(dataset) {
    return Object.values(dataset.records).sort((a, b) =>
      a.date === b.date ? getChannel(a.channel).order - getChannel(b.channel).order : a.date < b.date ? -1 : 1);
  }

  /**
   * Filtra registros por dimensiones.
   * @param {object} q { channel?, granularity?, periodKey?, from?, to? }
   */
  function query(dataset, q = {}) {
    return allRecords(dataset).filter((r) => {
      if (q.channel && r.channel !== q.channel) return false;
      if (q.from && r.date < q.from) return false;
      if (q.to && r.date > q.to) return false;
      if (q.granularity && q.periodKey && Cal().periodKey(r.date, q.granularity) !== q.periodKey) return false;
      return true;
    });
  }

  /** Periodos disponibles en el dataset para una granularidad. */
  function availablePeriods(dataset, granularity) {
    const set = new Set(allRecords(dataset).map((r) => Cal().periodKey(r.date, granularity)));
    return [...set].sort();
  }

  /**
   * Resumen de un periodo por canal y total para un estado.
   * Agrega aditivas y recalcula ratios; cuenta problemas de validación.
   */
  function summarize(dataset, { state = 'actual', granularity = null, periodKey = null } = {}) {
    const recs = query(dataset, { granularity, periodKey });
    const build = (list) => {
      const values = M().aggregateBlocks(list.map((r) => r[state]));
      const days = list.filter((r) => C().additiveMetricKeys.some((k) => r[state][k] !== null)).length;
      const counts = { error: 0, warning: 0 };
      const recordIssues = [];
      list.forEach((r) => {
        const val = r.validation[state];
        if (val && (val.status === 'error' || val.status === 'warning')) {
          counts[val.status]++;
          recordIssues.push({ id: r.id, date: r.date, channel: r.channel, status: val.status, issues: val.issues });
        }
      });
      return { values, days, recordCount: list.length, counts, recordIssues, validation: M().validateBlock(values, {}) };
    };
    const byChannel = {};
    C().channelIds.forEach((id) => { byChannel[id] = build(recs.filter((r) => r.channel === id)); });
    return { state, granularity, periodKey, byChannel, total: build(recs) };
  }

  /** Serialización plana (para storage/export). */
  function serializeDataset(dataset) { return JSON.parse(JSON.stringify(dataset)); }

  /** Rehidrata un dataset guardado; revalida cada registro. */
  function hydrateDataset(raw) {
    if (!raw || typeof raw !== 'object' || !raw.records) return null;
    const ds = createDataset(raw.year, raw.meta || {});
    Object.values(raw.records).forEach((r) => {
      try {
        const rec = createDailyRecord({ date: r.date, channel: r.channel, dayType: r.dayType,
          holiday: r.holiday, event: r.event, season: r.season });
        C().dataStates.forEach((s) => {
          // Restaura solo lo que no fue calculado, para conservar el origen.
          const loaded = {};
          const srcs = (r.sources && r.sources[s]) || {};
          let any = false;
          C().metricKeys.forEach((k) => {
            if (srcs[k] && srcs[k] !== 'calculated' && r[s]) { loaded[k] = r[s][k]; any = true; }
          });
          if (any) setBlock(rec, s, loaded, Object.values(srcs).find((x) => x && x !== 'calculated'));
        });
        upsertRecord(ds, rec);
      } catch (e) { /* registro corrupto: se omite */ }
    });
    return ds;
  }

  FP.dataModel = {
    recordId, isChannel, getChannel,
    createDailyRecord, setBlock,
    createTargets, emptyTargetBlock, validateTargets,
    createDataset, upsertRecord, getRecord, allRecords, query, availablePeriods, summarize,
    serializeDataset, hydrateDataset
  };
})(typeof window !== 'undefined' ? window : globalThis);
