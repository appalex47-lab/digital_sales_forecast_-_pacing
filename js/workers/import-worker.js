/**
 * import-worker.js — lectura, traducción y validación de archivos CSV grandes FUERA del hilo de la página.
 *
 * Con un export de GA4 de 90 MB y 300 mil líneas, hacerlo en la página congelaba RevNavigator ~12 s (traducir 7 s, volver a leer el CSV
 * traducido 5 s) y dejaba todas las filas procesadas en la memoria de la página mientras se revisaban. Aquí vive todo eso; la página solo
 * recibe un resumen y una vista previa para revisar, y al confirmar los registros llegan por bloques.
 *
 * Usa EXACTAMENTE los mismos módulos que la página (config, calendario, métricas, lector de CSV, normalización, validación, importador,
 * traductor de GA4 y reglas de calidad), así que los resultados son los mismos que en el flujo normal. No toca la página ni el almacenamiento.
 *
 * Mensajes (página → worker): stage, reprocess, retype, commit, drop, stats.
 * Mensajes (worker → página): progress, staged, result, records, done, dropped, stats, error.
 */
'use strict';
importScripts('../config/businessContext.js', '../config/config.js', '../calendar/calendar.js', '../calculations/metrics.js', '../import/csv.js',
  '../import/aliases.js', '../import/normalize.js', '../quality/validation.js', '../import/import.js', '../import/ga4Segments.js', '../quality/rules.js');

const FP = self.FP;
const jobs = new Map();
const ISSUE_CAP = 2000;           // problemas que se envían a la pantalla de revisión; el total exacto viaja aparte
const PARSED_PREVIEW = 50;        // filas leídas que se conservan en la pantalla (muestras de columnas)
const CHUNK = 4000;               // registros por mensaje al confirmar

const post = (m) => self.postMessage(m);
const progress = (jobId, phase, done, total) => post({ type: 'progress', jobId, phase, done, total });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Registros ya guardados, reducidos a lo que usa la detección de duplicados: { key, provenance: { fileName, row } }. */
function existingOf(ex) {
  if (!ex || !ex.keys) return [];
  const out = new Array(ex.keys.length);
  for (let i = 0; i < ex.keys.length; i++) out[i] = { key: ex.keys[i], provenance: { fileName: ex.files[ex.fileIdx[i]], row: ex.rows[i] } };
  return out;
}

function countsOf(result) {
  const c = { error: 0, warning: 0 };
  for (const i of result.issues) { if (i.severity === 'error') c.error++; else if (i.severity === 'warning') c.warning++; }
  return c;
}

/** Lo que la pantalla necesita para revisar: resumen, mapeo, primeras filas y una muestra de problemas. */
function previewOf(job) {
  const { staged, result } = job;
  const lim = (FP.config.import && FP.config.import.previewRows) || 20;
  return {
    staged: {
      id: staged.id, fileName: staged.fileName, dataType: staged.dataType, mapping: staged.mapping, dateDetection: staged.dateDetection,
      dateFormat: staged.dateFormat || null, aiMapping: staged.aiMapping || null, createdAt: staged.createdAt,
      parsed: { headers: staged.parsed.headers, delimiter: staged.parsed.delimiter, warnings: staged.parsed.warnings || [], rows: staged.parsed.rows.slice(0, PARSED_PREVIEW), totalRows: staged.parsed.rows.length }
    },
    result: {
      summary: result.summary, mappingIssues: result.mappingIssues, canImport: result.canImport,
      rows: result.rows.slice(0, lim).map((r) => ({ line: r.line, raw: r.raw, record: r.record, issues: r.issues, status: r.status, keyValid: r.keyValid })),
      issues: result.issues.slice(0, ISSUE_CAP), issuesTotal: result.issues.length, issueCounts: countsOf(result),
      willImport: { strict: FP.importer.selectRows(result, { includeErrorRows: false }).length, withErrors: FP.importer.selectRows(result, { includeErrorRows: true }).length },
      remote: true
    }
  };
}

async function runProcess(job, { settings, existing, today, aliases, learned }) {
  if (aliases) FP.aliases.set(aliases);
  if (learned) FP.importer.setLearnedMappings(learned);   // columnas que la IA ya resolvió antes: el mapeo estático las usa, como en la página
  job.settings = settings;
  job.result = await FP.importer.processAsync(job.staged, { settings, existing: existingOf(existing), today, slice: 20000, onProgress: (d, t) => progress(job.id, 'validar', d, t) });
}

const handlers = {
  async stage(m) {
    const { jobId, file, fileName, dataType, settings, today, aliases, existing, learned } = m;
    if (aliases) FP.aliases.set(aliases);
    if (learned) FP.importer.setLearnedMappings(learned);
    const t0 = Date.now();
    progress(jobId, 'leer', 0, 1);
    let text = await file.text();
    progress(jobId, 'leer', 1, 1);
    let staged, ga4 = null;
    if (dataType === 'segments' && FP.ga4Segments.detect(text)) {
      progress(jobId, 'traducir', 0, 1); await tick();
      const t = FP.ga4Segments.translateRows(text);
      text = null;
      ga4 = { stats: t.stats };
      if (!t.rows.length) { post({ type: 'staged', jobId, empty: true, ga4 }); return; }
      // mismo resultado que dejaría leer el CSV traducido: encabezados, filas { line, values, cellCount }, delimitador «,» y sin advertencias
      staged = FP.importer.stageParsed({ headers: t.headers, rows: t.rows, delimiter: ',', warnings: [] }, fileName, dataType);
      progress(jobId, 'traducir', 1, 1);
    } else {
      staged = FP.importer.stage(text, { fileName, dataType });
      text = null;
    }
    staged.id = `stgw-${jobId}`;   // identificador propio: no puede coincidir con los que genera la página
    const job = { id: jobId, staged, result: null, settings, ga4, createdMs: Date.now() - t0 };
    jobs.set(jobId, job);
    await runProcess(job, { settings, existing, today, aliases: null, learned: null });
    post({ type: 'staged', jobId, ga4, durationMs: Date.now() - t0, ...previewOf(job) });
  },

  async reprocess(m) {
    const job = jobs.get(m.jobId); if (!job) { post({ type: 'error', jobId: m.jobId, message: 'El archivo en revisión ya no está en memoria.' }); return; }
    if (m.mapping) job.staged.mapping = m.mapping;
    job.staged.dateFormat = m.dateFormat || null;
    await runProcess(job, { settings: m.settings, existing: m.existing, today: m.today, aliases: m.aliases, learned: m.learned });
    post({ type: 'result', jobId: m.jobId, ...previewOf(job) });
  },

  async retype(m) {
    const job = jobs.get(m.jobId); if (!job) { post({ type: 'error', jobId: m.jobId, message: 'El archivo en revisión ya no está en memoria.' }); return; }
    job.staged.dataType = m.dataType;
    job.staged.mapping = FP.importer.suggestMapping(job.staged.parsed.headers);
    await runProcess(job, { settings: m.settings, existing: m.existing, today: m.today, aliases: m.aliases, learned: m.learned });
    post({ type: 'result', jobId: m.jobId, ...previewOf(job) });
  },

  async commit(m) {
    const job = jobs.get(m.jobId); if (!job) { post({ type: 'error', jobId: m.jobId, message: 'El archivo en revisión ya no está en memoria.' }); return; }
    const { staged, result } = job;
    const selected = FP.importer.selectRows(result, { includeErrorRows: Boolean(m.includeErrorRows) });
    const acceptedLines = new Set(selected.map((r) => r.line));
    let quarantined = 0;
    for (let from = 0; from < selected.length; from += CHUNK) {
      const to = Math.min(selected.length, from + CHUNK), chunk = new Array(to - from);
      for (let i = from; i < to; i++) {
        const rec = selected[i].record;
        rec.provenance.batchId = m.batchId; rec.provenance.fileName = staged.fileName; delete rec.provenance.columns;   // el mapeo vive una sola vez en el lote
        if (rec.status === 'quarantined') quarantined++;
        chunk[i - from] = rec;
      }
      post({ type: 'records', jobId: m.jobId, records: chunk });
      progress(m.jobId, 'enviar', to, selected.length);
      await tick();
    }
    const issues = result.issues.map((i) => ({ ...i, batchId: m.batchId, fileName: staged.fileName, dataType: staged.dataType, rowImported: acceptedLines.has(i.row) }));
    post({ type: 'done', jobId: m.jobId, rowCount: result.rows.length, accepted: selected.length, rejected: result.rows.length - selected.length, quarantined,
      summary: result.summary, issues, delimiter: staged.parsed.delimiter, mapping: staged.mapping });
    jobs.delete(m.jobId);
  },

  drop(m) { jobs.delete(m.jobId); post({ type: 'dropped', jobId: m.jobId, left: jobs.size }); },
  stats() { post({ type: 'stats', jobs: jobs.size }); }
};

self.onmessage = (e) => {
  const m = e.data || {};
  const h = handlers[m.type];
  if (!h) return;
  Promise.resolve().then(() => h(m)).catch((err) => post({ type: 'error', jobId: m.jobId || null, message: String((err && err.message) || err), stack: String((err && err.stack) || '').slice(0, 500) }));
};
post({ type: 'ready' });
