/**
 * import.js — Pipeline de importación (Fase 1).
 *
 *   CSV ──csv.parse──▶ RAW (texto) ──mapping──▶ campos
 *       ──normalize──▶ valores + estado ──validation──▶ issues
 *       ──buildRecord──▶ CANONICAL RECORD ──dataStore.commitBatch──▶ APLICACIÓN
 *
 * Nada llega al modelo principal sin pasar por stage() → process() → commit.
 * La UI nunca lee el CSV original: solo `staged.parsed` (RAW) para mostrar
 * encabezados/muestras y `result` (canónico) para la vista previa.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const N = () => FP.normalize;
  const V = () => FP.validation;
  const M = () => FP.metrics;

  let seq = 0;
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

  /* ---------- Mapeo de columnas ---------- */

  /** Encabezado → campo canónico sugerido (o null = ignorar). */
  function suggestField(header) {
    const h = N().normalizeHeader(header);
    const f = C().importFields.find((x) => N().normalizeHeader(x.key) === h || x.synonyms.includes(h));
    return f ? f.key : null;
  }

  /** { encabezado: campo | null }. Si dos columnas sugieren el mismo campo, gana la primera. */
  function suggestMapping(headers) {
    const used = new Set();
    const mapping = {};
    headers.forEach((h) => {
      const f = suggestField(h);
      mapping[h] = f && !used.has(f) ? f : null;
      if (f) used.add(f);
    });
    return mapping;
  }

  const fieldLabel = (key) => (C().importFields.find((f) => f.key === key) || { label: key }).label;

  /** Problemas del mapeo: columnas obligatorias sin asignar y campos asignados dos veces. */
  function validateMapping(mapping, dataType) {
    const issues = [];
    const count = {};
    Object.values(mapping).forEach((f) => { if (f) count[f] = (count[f] || 0) + 1; });
    Object.entries(count).filter(([, n]) => n > 1).forEach(([f]) => {
      const cols = Object.keys(mapping).filter((h) => mapping[h] === f);
      issues.push(V().issue('DUPLICATE_MAPPING', { field: f, value: cols.join(', '),
        message: `Las columnas ${cols.map((c) => `"${c}"`).join(' y ')} están asignadas a ${fieldLabel(f)}. Deja solo una.` }));
    });
    C().dataTypes[dataType].required.forEach((f) => {
      if (!count[f]) issues.push(V().issue('MISSING_REQUIRED_COLUMN', { field: f,
        message: `Falta asignar una columna a ${fieldLabel(f)}, obligatoria para ${C().dataTypes[dataType].label}.` }));
    });
    return issues;
  }

  /* ---------- Staging ---------- */

  /**
   * Paso 1: lee el archivo y sugiere mapeo. No toca el modelo.
   * @returns staged { id, fileName, dataType, parsed, mapping, dateDetection, createdAt }
   */
  function stage(text, { fileName = 'archivo.csv', dataType, delimiter = null } = {}) {
    if (!C().dataTypes[dataType]) throw new Error(`Tipo de dato inválido: ${dataType}`);
    return makeStaged(FP.csv.parse(text, { delimiter }), fileName, dataType);
  }

  /** Igual que stage() pero desde objetos ya separados (mock, migración). */
  function stageRows(headers, rowObjects, { fileName, dataType }) {
    const parsed = {
      headers, delimiter: null, warnings: [],
      rows: rowObjects.map((values, i) => {
        const v = {};
        headers.forEach((h) => { v[h] = values[h] === null || values[h] === undefined ? '' : String(values[h]); });
        return { line: i + 2, values: v, cellCount: headers.length };
      })
    };
    return makeStaged(parsed, fileName, dataType);
  }

  function makeStaged(parsed, fileName, dataType) {
    const mapping = suggestMapping(parsed.headers);
    const dateHeader = Object.keys(mapping).find((h) => mapping[h] === 'date');
    const dateDetection = dateHeader ? N().detectDateFormat(parsed.rows.map((r) => r.values[dateHeader])) : null;
    return { id: newId('stg'), fileName, dataType, parsed, mapping, dateDetection, createdAt: new Date().toISOString() };
  }

  /* ---------- Registro canónico ---------- */

  /**
   * Fila RAW → registro canónico + resultados de parseo.
   * Celda de métrica: { value, source: observed|calculated|missing|invalid, raw?, note? }
   */
  function buildRecord(values, mapping, { dataType, settings, batchId = null, fileName = null, row = null }) {
    const columns = {};
    Object.entries(mapping).forEach(([h, f]) => { if (f && columns[f] === undefined) columns[f] = h; });
    const rawOf = (f) => (columns[f] !== undefined ? values[columns[f]] : undefined);

    const parse = {
      date: N().normalizeDate(rawOf('date'), { dateFormat: settings.dateFormat }),
      channel: N().normalizeChannel(rawOf('channel')),
      dayType: N().normalizeDayType(rawOf('dayType')),
      event: N().normalizeText(rawOf('event')),
      holiday: N().normalizeText(rawOf('holiday')),
      season: N().normalizeText(rawOf('season')),
      notes: N().normalizeText(rawOf('notes'))
    };
    C().metricKeys.forEach((k) => {
      parse[k] = N().normalizeNumber(rawOf(k), { numberFormat: settings.numberFormat, percent: k === 'conversionRate' });
    });

    // Celdas observadas / inválidas / faltantes
    const metrics = {};
    const usable = {};
    C().metricKeys.forEach((k) => {
      const r = parse[k];
      if (r.status === 'ok') {
        metrics[k] = { value: r.value, source: 'observed' };
        if (r.note) metrics[k].raw = r.raw;
        if (r.value >= 0) usable[k] = r.value; // negativos no se usan para derivar
      } else if (r.status === 'invalid') metrics[k] = { value: null, source: 'invalid', raw: r.raw };
      else metrics[k] = { value: null, source: 'missing' };
    });

    // Derivadas: solo rellenan faltantes; nunca reemplazan observadas ni inválidas.
    const derived = M().deriveBlock(usable, 'observed').values;
    C().metricKeys.forEach((k) => {
      if (metrics[k].source === 'missing' && derived[k] !== null) metrics[k] = { value: derived[k], source: 'calculated' };
    });
    if (metrics.conversionRate.source === 'missing' && usable.trafficVolume === 0) metrics.conversionRate.note = 'No calculable: volumen 0.';
    if (metrics.aov.source === 'missing' && usable.orders === 0) metrics.aov.note = 'No calculable: 0 pedidos.';

    const date = parse.date.status === 'ok' ? parse.date.value : null;
    const channel = parse.channel.status === 'ok' ? parse.channel.value : null;
    const event = parse.event.value, holiday = parse.holiday.value;
    const dayType = parse.dayType.status === 'ok' ? parse.dayType.value : event ? 'event' : holiday ? 'holiday' : 'regular';

    const record = {
      key: date && channel ? `${date}|${channel}|${dataType}` : null,
      dataType, date, channel, dayType,
      holiday, event, season: parse.season.value, notes: parse.notes.value,
      metrics,
      status: 'valid',
      issueCounts: { error: 0, warning: 0 },
      provenance: { batchId, fileName, row, columns }
    };
    return { record, parse };
  }

  /* ---------- Procesamiento (validación completa, sin guardar) ---------- */

  /**
   * Paso 2: aplica mapeo, normaliza, valida y detecta duplicados.
   * @param {object} opts { settings, existing (registros guardados del mismo tipo), today }
   * @returns result { rows, issues, mappingIssues, summary, canImport }
   */
  function process(staged, { settings, existing = [], today = FP.calendar.toISODate(new Date()) } = {}) {
    const mappingIssues = validateMapping(staged.mapping, staged.dataType);
    const expectedCells = staged.parsed.headers.length;
    const rows = staged.parsed.rows.map((r) => {
      const { record, parse } = buildRecord(r.values, staged.mapping,
        { dataType: staged.dataType, settings, fileName: staged.fileName, row: r.line });
      const issues = V().validateRecord(record, { dataType: staged.dataType, tolerance: settings.tolerance, today, parseResults: parse });
      if (r.cellCount !== expectedCells && staged.parsed.delimiter) {
        issues.unshift(V().issue('MALFORMED_ROW', { row: r.line, key: record.key, value: r.cellCount,
          message: `La fila tiene ${r.cellCount} columnas y el encabezado ${expectedCells}.` }));
      }
      return { line: r.line, raw: r.values, record, issues };
    });

    // Duplicados dentro del archivo y contra lo ya almacenado (solo filas con llave válida)
    const keyed = rows.filter((r) => r.record.key).map((r) => r.record);
    const dupIssues = V().findDuplicateIssues(keyed, existing);
    const byRow = new Map(rows.map((r) => [r.line, r]));
    dupIssues.forEach((i) => byRow.get(i.row).issues.push(i));

    rows.forEach((r) => {
      r.status = V().statusFromIssues(r.issues);
      r.keyValid = Boolean(r.record.key);
      r.record.status = r.status;
      r.record.issueCounts = {
        error: r.issues.filter((i) => i.severity === 'error').length,
        warning: r.issues.filter((i) => i.severity === 'warning').length
      };
    });

    const issues = rows.flatMap((r) => r.issues);
    const summary = {
      rows: rows.length,
      valid: rows.filter((r) => r.status === 'valid').length,
      warning: rows.filter((r) => r.status === 'warning').length,
      error: rows.filter((r) => r.status === 'error').length,
      invalidKey: rows.filter((r) => !r.keyValid).length,
      duplicates: dupIssues.length,
      byType: countBy(issues, 'type')
    };
    return { rows, issues, mappingIssues, summary, canImport: mappingIssues.length === 0 && rows.length > 0 };
  }

  const countBy = (list, prop) => list.reduce((acc, x) => { acc[x[prop]] = (acc[x[prop]] || 0) + 1; return acc; }, {});

  /**
   * Qué filas entran al modelo.
   *  - Sin llave válida (fecha o canal con error): nunca.
   *  - Con errores en métricas: solo si includeErrorRows (el valor inválido queda como `invalid`).
   *  - Válidas y con advertencias: siempre.
   */
  function selectRows(result, { includeErrorRows = false } = {}) {
    return result.rows.filter((r) => r.keyValid && (r.status !== 'error' || includeErrorRows));
  }

  /* ---------- Compatibilidad Fase 0 ---------- */

  /** Contratos de Fase 0, ahora derivados de config.dataTypes. */
  const CSV_CONTRACTS = Object.freeze(Object.fromEntries(Object.values(FP.config.dataTypes).map((dt) => [dt.id, {
    id: dt.id, label: dt.label, state: dt.id === 'plan' ? 'plan' : 'actual',
    columns: dt.template.map((name) => {
      const key = suggestField(name);
      return { name, target: key, required: dt.required.includes(key),
        aliases: (FP.config.importFields.find((f) => f.key === key) || { synonyms: [] }).synonyms };
    })
  }])));

  const CHANNEL_ALIASES = Object.freeze(Object.fromEntries(FP.config.channels.map((c) => [c.id, c.aliases])));

  /** Fase 0: devuelve el id del canal o null. */
  function normalizeChannel(value) {
    const r = N().normalizeChannel(value);
    return r.status === 'ok' ? r.value : null;
  }

  /** Fase 0: { ok, mapping, missing, unknown } */
  function validateHeaders(contractId, headers) {
    const mapping = suggestMapping(headers);
    const missing = validateMapping(mapping, contractId).filter((i) => i.type === 'MISSING_REQUIRED_COLUMN').map((i) => i.field);
    const unknown = headers.filter((h) => !mapping[h]);
    return { ok: missing.length === 0, mapping, missing, unknown };
  }

  /** Fase 0: una fila → { input, errors } usando el pipeline canónico. */
  function mapRow(contractId, row, mapping = suggestMapping(Object.keys(row))) {
    const flat = {};
    Object.entries(mapping).forEach(([h, f]) => { flat[h] = f && typeof f === 'object' ? suggestField(f.name) : f; });
    const { record, parse } = buildRecord(row, flat, { dataType: contractId, settings: defaultSettings() });
    const issues = V().validateRecord(record, { dataType: contractId, tolerance: defaultSettings().tolerance, parseResults: parse });
    const state = contractId === 'plan' ? 'plan' : 'actual';
    const values = {};
    C().metricKeys.forEach((k) => { if (record.metrics[k].source === 'observed') values[k] = record.metrics[k].value; });
    return {
      input: { date: record.date, channel: record.channel, dayType: record.dayType, event: record.event,
        holiday: record.holiday, season: record.season, [state]: values },
      errors: issues.filter((i) => i.severity === 'error').map((i) => i.message)
    };
  }

  function defaultSettings() {
    const d = C().import;
    return { tolerance: d.DATA_VALIDATION_TOLERANCE, dateFormat: d.dateFormat, numberFormat: d.numberFormat };
  }

  FP.importer = {
    // Fase 1
    suggestField, suggestMapping, validateMapping, fieldLabel, defaultSettings,
    stage, stageRows, buildRecord, process, selectRows,
    // Fase 0 (compatibilidad)
    CSV_CONTRACTS, CHANNEL_ALIASES, normalizeHeader: (h) => N().normalizeHeader(h), normalizeChannel, validateHeaders, mapRow
  };
})(typeof window !== 'undefined' ? window : globalThis);
