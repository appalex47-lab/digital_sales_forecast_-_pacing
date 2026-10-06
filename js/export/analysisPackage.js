/**
 * analysisPackage.js — Fase 10 · Paquete de análisis.
 * Junta en un .zip los 7 exports que la app ya genera (Pacing y forecast, Reforecast, Diagnóstico, Categoría → Producto,
 * Recovery Center, Narrativa y Plan) más un índice mínimo. Solo LEE los exports: no calcula nada ni cambia su forma.
 * Decisiones del usuario (Fase 10): siempre los 7 archivos (el que no tiene datos viaja vacío, con aviso de qué falta);
 * índice con sello, fecha de corte, año, versión del plan, método y calidad, y por archivo nombre, registros, estado y qué falta;
 * sin API key, sin preferencias y sin datos de Negocio (la narrativa viaja con su contexto de negocio en blanco).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const SCHEMA = 'analysis_package';
  const SCHEMA_VERSION = '1.0.0';

  /** Los 7 exports, en el orden del recorrido. `prefix` es el inicio del nombre de archivo del export individual. */
  const EXPORTS = [
    { key: 'forecast', label: 'Pacing y forecast', schema: 'forecast_export', prefix: 'forecast_export', view: 'pacing' },
    { key: 'reforecast', label: 'Reforecast', schema: 'reforecast_export', prefix: 'reforecast_export', view: 'reforecast' },
    { key: 'analysis', label: 'Diagnóstico', schema: 'analysis_export', prefix: 'analysis_export', view: 'diagnostico' },
    { key: 'categoryProduct', label: 'Categoría → Producto', schema: 'category_product_analysis_export', prefix: 'category_product_analysis_export', view: 'producto' },
    { key: 'actionPlan', label: 'Recovery Center (escenarios y plan de acción)', schema: 'action_plan_export', prefix: 'action_plan_export', view: 'recovery' },
    { key: 'narrative', label: 'Narrativa ejecutiva', schema: 'narrative_export', prefix: 'narrative_export', view: 'narrativa' },
    { key: 'planning', label: 'Plan', schema: 'planning_export', prefix: 'planning_export', view: 'plan' }
  ];

  /** Registros = elementos de la lista más larga del archivo (su tabla principal). Determinista y comparable entre exports. */
  function records(obj) {
    let max = 0;
    const walk = (v, depth) => {
      if (depth > 6 || v === null || typeof v !== 'object') return;
      if (Array.isArray(v)) { if (v.length > max) max = v.length; v.forEach((x) => walk(x, depth + 1)); return; }
      Object.values(v).forEach((x) => walk(x, depth + 1));
    };
    walk(obj, 0);
    return max;
  }

  /** La narrativa lleva el contexto del negocio (nombre y términos): en el paquete viaja en blanco, por decisión del usuario. */
  function redact(key, obj) {
    if (key !== 'narrative' || !obj || typeof obj !== 'object') return { obj, redacted: [] };
    const copy = JSON.parse(JSON.stringify(obj));
    let hit = false;
    const scrub = (o) => { if (!o || typeof o !== 'object') return; if (Object.prototype.hasOwnProperty.call(o, 'businessContext')) { o.businessContext = null; hit = true; } Object.values(o).forEach(scrub); };
    scrub(copy);
    return { obj: copy, redacted: hit ? ['businessContext'] : [] };
  }

  function emptyFile(def, entry, meta) {
    return {
      schema: def.schema, status: 'empty', packageNote: 'Este export no tenía datos al generar el paquete.',
      reason: entry.reason, missing: entry.missing || [], whereToFill: def.view,
      source: { app: meta.app.name, version: meta.app.version, generatedAt: meta.generatedAt }
    };
  }

  /**
   * @param {object} entries  por clave: { file, obj } (con datos) o { reason, missing: [] } (vacío)
   * @param {object} meta     { app:{name,version}, generatedAt, cutoff, year, plan:{id,label,source}, forecastMethod:{id,label}, dataQuality:{status,statusText} }
   * @returns {{ files: {name,text}[], index: object, zipName: string }}
   */
  function build(entries, meta) {
    const files = []; const listed = [];
    for (const def of EXPORTS) {
      const e = entries[def.key] || { reason: 'No se pudo preparar este export.', missing: [] };
      if (e.obj) {
        const { obj, redacted } = redact(def.key, e.obj);
        files.push({ name: e.file, text: JSON.stringify(obj, null, 2) });
        listed.push({ key: def.key, label: def.label, file: e.file, schema: def.schema, status: 'complete', records: records(obj), missing: [], redacted });
      } else {
        const name = `${def.prefix}_vacio.json`;
        files.push({ name, text: JSON.stringify(emptyFile(def, e, meta), null, 2) });
        listed.push({ key: def.key, label: def.label, file: name, schema: def.schema, status: 'empty', records: 0, missing: e.missing || [], reason: e.reason, redacted: [] });
      }
    }
    const index = {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION,
      source: { app: meta.app.name, version: meta.app.version, generatedAt: meta.generatedAt },
      cutoff: meta.cutoff || null, year: meta.year, plan: meta.plan || null, forecastMethod: meta.forecastMethod || null,
      dataQuality: meta.dataQuality || null,
      excluded: ['API key de Cohere', 'preferencias de la herramienta', 'datos de Negocio (la narrativa viaja con businessContext en blanco)'],
      recordsDefinition: 'Elementos de la lista más larga del archivo (su tabla principal).',
      files: listed
    };
    const stamp = (meta.generatedAt || '').slice(0, 10) || 'sin_fecha';
    const readme = [
      `Paquete de análisis · ${meta.app.name} ${meta.app.version}`,
      `Generado: ${meta.generatedAt}`,
      `Fecha de corte: ${meta.cutoff || '—'} · Año: ${meta.year}`,
      `Plan: ${(meta.plan && meta.plan.label) || '—'} · Método de forecast: ${(meta.forecastMethod && `${meta.forecastMethod.id} · ${meta.forecastMethod.label}`) || '—'}`,
      `Calidad de datos: ${(meta.dataQuality && meta.dataQuality.statusText) || '—'}`,
      '',
      'Archivos:',
      ...listed.map((f) => `  ${f.status === 'complete' ? '✓' : '—'} ${f.file} · ${f.label} · ${f.status === 'complete' ? `${f.records} registros` : `vacío: ${f.reason}${f.missing.length ? ` (falta: ${f.missing.join(', ')})` : ''}`}`),
      '',
      'Cada archivo es idéntico al que se descarga desde su vista, salvo la narrativa, que viaja sin el contexto del negocio.',
      'No incluye la API key de Cohere, las preferencias de la herramienta ni los datos de Negocio.',
      'El detalle está en indice.json.'
    ].join('\n');
    return {
      files: [{ name: 'indice.json', text: JSON.stringify(index, null, 2) }, { name: 'LEEME.txt', text: readme }, ...files],
      index, zipName: `revnavigator_paquete_${meta.year}_${stamp}.zip`
    };
  }

  FP.analysisPackage = { SCHEMA, SCHEMA_VERSION, EXPORTS, records, redact, build };
})(typeof window !== 'undefined' ? window : globalThis);
