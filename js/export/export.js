/**
 * export.js — Contrato de forecast_export.json.
 *
 * Fase 0: define la estructura y la construye desde el estado actual
 * (se usa para vista previa). La descarga del archivo y la integración
 * con la app de diagnóstico (analysis_export.json) llegan después.
 *
 * Convención de salida: snake_case (traffic_volume, conversion_rate)
 * para que otras apps no dependan de nombres internos camelCase.
 * Llave de unión con otras apps: date + channel.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const DM = () => FP.dataModel;

  const FORECAST_EXPORT_SCHEMA = 'forecast_export';

  /** camelCase → snake_case del contrato. */
  function toContractBlock(block) {
    const out = {};
    C().metricKeys.forEach((k) => { out[C().metrics[k].csv] = block ? block[k] : null; });
    return out;
  }

  function metricsDefinition() {
    const f = {
      revenue: 'traffic_volume * conversion_rate * aov',
      orders: 'traffic_volume * conversion_rate',
      traffic_volume: 'observado',
      conversion_rate: 'orders / traffic_volume',
      aov: 'revenue / orders'
    };
    return C().metricKeys.map((k) => {
      const m = C().metrics[k];
      return { key: m.csv, label: m.label, kind: m.kind, additive: m.additive, formula: f[m.csv] };
    });
  }

  /**
   * Construye el objeto forecast_export.
   * @param {object} state  { year, dataset, targets, registry, events, milestones }
   * @param {object} opts   { sampleSize?: number } limita registros (vista previa)
   */
  function buildForecastExport(state, { sampleSize = null } = {}) {
    const records = state.dataset ? DM().allRecords(state.dataset) : [];
    const list = sampleSize ? records.slice(0, sampleSize) : records;
    const dates = records.map((r) => r.date);

    return {
      schema: FORECAST_EXPORT_SCHEMA,
      schemaVersion: C().schemaVersion,
      generatedAt: new Date().toISOString(),
      source: { app: C().app.name, version: C().app.version },
      period: {
        year: state.year,
        start: dates[0] || null,
        end: dates[dates.length - 1] || null,
        granularity: 'day',
        currency: C().currency,
        locale: C().locale
      },
      channels: C().channels.map((c) => ({ id: c.id, label: c.label, traffic_volume_label: c.trafficLabel })),
      metrics_definition: metricsDefinition(),
      targets: state.targets || null,
      records: list.map((r) => ({
        date: r.date,
        channel: r.channel,
        week: r.weekKey,
        day_type: r.dayType,
        holiday: r.holiday,
        event: r.event,
        season: r.season,
        plan: toContractBlock(r.plan),
        actual: toContractBlock(r.actual),
        forecast: toContractBlock(r.forecast),
        gap: {
          actual_vs_plan: {
            revenue: M().calcGap(r.plan.revenue, r.actual.revenue),
            orders: M().calcGap(r.plan.orders, r.actual.orders)
          }
        },
        validation_status: { plan: r.validation.plan && r.validation.plan.status, actual: r.validation.actual && r.validation.actual.status }
      })),
      records_truncated: sampleSize ? records.length > sampleSize : false,
      records_total: records.length,
      events: state.events || [],
      milestones: state.milestones || [],
      forecast_versions: state.registry ? FP.forecast.listVersions(state.registry) : [],
      current_forecast_version: state.registry ? state.registry.currentVersionId : null,
      integration: {
        counterpart_file: C().exportFiles.analysisCounterpart,
        join_keys: ['date', 'channel'],
        loop: ['forecast', 'actual', 'gap', 'diagnosis', 'hypothesis', 'action', 'reforecast']
      }
    };
  }

  /* ======================================================================
     Fase 1: exportación de datos cargados, errores, calidad y consolidado
     ====================================================================== */

  const envelope = (schema, body) => ({
    schema, schemaVersion: C().schemaVersion, generatedAt: new Date().toISOString(),
    source: { app: C().app.name, version: C().app.version }, ...body
  });

  /** Registro canónico → forma exportable (snake_case, celdas con value/source). */
  function canonicalToContract(r) {
    const metrics = {};
    C().metricKeys.forEach((k) => {
      const c = r.metrics[k];
      metrics[C().metrics[k].csv] = { value: c.value, source: c.source, ...(c.raw !== undefined ? { raw: c.raw } : {}), ...(c.note ? { note: c.note } : {}) };
    });
    return {
      key: r.key, data_type: r.dataType, date: r.date, channel: r.channel,
      day_type: r.dayType, holiday: r.holiday, event: r.event, season: r.season, notes: r.notes,
      metrics, status: r.status, issue_counts: r.issueCounts,
      provenance: { batch_id: r.provenance.batchId, file_name: r.provenance.fileName, row: r.provenance.row },
      ...(r.dimension ? { dimension: r.dimension, segment: r.segment, segment_key: r.segmentKey } : {}),
      ...(r.extra ? { extra: r.extra } : {})
    };
  }

  const batchMeta = (b) => ({ id: b.id, data_type: b.dataType, file_name: b.fileName, imported_at: b.importedAt,
    row_count: b.rowCount, accepted: b.accepted, rejected: b.rejected, include_error_rows: b.includeErrorRows,
    mapping: b.mapping, settings: b.settings });

  /** normalized_data.json — modelo canónico completo por tipo. */
  function buildNormalizedExport(store, settings) {
    const collections = {};
    C().dataTypeIds.forEach((t) => {
      collections[t] = { batches: store[t].batches.map(batchMeta), records: store[t].records.map(canonicalToContract) };
    });
    return envelope('normalized_data', { settings, metric_sources: C().metricCellSources, collections });
  }

  /** data_errors.json — todos los issues, incluidos los de filas no importadas. */
  function buildErrorsExport(store) {
    const errors = FP.dataStore.allBatches(store).flatMap((b) => b.issues);
    return envelope('data_errors', {
      catalog: C().errorTypes,
      total: errors.length,
      by_severity: { error: errors.filter((e) => e.severity === 'error').length, warning: errors.filter((e) => e.severity === 'warning').length },
      errors
    });
  }

  /** data_quality.json — resumen de calidad y cobertura. */
  function buildQualityExport(store) {
    return envelope('data_quality', { summary: FP.coverage.summarize(store) });
  }

  /** consolidated_data.json — vista día × canal (plan + actual) por año + forecast_export. */
  function buildConsolidatedExport(store, state) {
    const yearsList = FP.dataStore.years(store).filter((y) => FP.dataStore.years(store, 'plan').includes(y) || FP.dataStore.years(store, 'actual').includes(y));
    const byYear = {};
    yearsList.forEach((y) => {
      const ds = FP.dataStore.consolidate(store, y);
      byYear[y] = buildForecastExport({ ...state, year: y, dataset: ds });
    });
    return envelope('consolidated_data', {
      rule: 'Un registro por fecha + canal. plan ← planData, actual ← actualData; ante duplicados prevalece la carga más reciente. El histórico se exporta en normalized_data.',
      years: byYear
    });
  }

  /** Columnas planas para CSV del modelo normalizado (preparado para fases futuras). */
  function normalizedCsvRows(store, dataType) {
    const headers = ['fecha', 'canal', 'tipo_dato', 'tipo_dia', 'evento', 'festivo', 'temporada',
      ...C().metricKeys.flatMap((k) => [C().metrics[k].csv, `${C().metrics[k].csv}_source`]), 'estado', 'archivo', 'fila'];
    const rows = store[dataType].records.map((r) => {
      const o = { fecha: r.date, canal: r.channel, tipo_dato: r.dataType, tipo_dia: r.dayType, evento: r.event, festivo: r.holiday,
        temporada: r.season, estado: r.status, archivo: r.provenance.fileName, fila: r.provenance.row };
      C().metricKeys.forEach((k) => { o[C().metrics[k].csv] = r.metrics[k].value; o[`${C().metrics[k].csv}_source`] = r.metrics[k].source; });
      return o;
    });
    return { headers, rows };
  }

  /** Plantilla CSV vacía (solo encabezados) de un tipo de dato. */
  function buildTemplate(dataType) {
    if (dataType === 'products') return FP.csv.stringify(C().products.dataType.template, []);
    if (dataType === 'productFunnel') return FP.csv.stringify(C().products.funnelType.template, []);
    return FP.csv.stringify(C().dataTypes[dataType].template, []);
  }

  /** Descarga en el navegador (Blob + enlace temporal). Funciona en GitHub Pages y file://. */
  function download(fileName, content, mime = 'application/json') {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  FP.exporter = {
    FORECAST_EXPORT_SCHEMA, toContractBlock, metricsDefinition, buildForecastExport,
    canonicalToContract, buildNormalizedExport, buildErrorsExport, buildQualityExport, buildConsolidatedExport,
    normalizedCsvRows, buildTemplate, download
  };
})(typeof window !== 'undefined' ? window : globalThis);
