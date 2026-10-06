/**
 * forecast.js — Versionado de plan / forecast (sin algoritmos).
 *
 *   Original Plan  (inmutable, congelado)
 *   Reforecast 01  (basedOn: original-plan)
 *   Reforecast 02  (basedOn: reforecast-01)
 *   Current Forecast → puntero a la versión vigente
 *
 * Fase 0 solo define la estructura y sus garantías:
 *  - El Original Plan se congela (Object.freeze profundo) y no puede reemplazarse.
 *  - Toda redistribución futura crea una versión NUEVA.
 * El cálculo de forecast/reforecast llega en fases posteriores.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const VERSION_TYPES = Object.freeze({
    ORIGINAL_PLAN: 'original_plan',
    REFORECAST: 'reforecast',
    FORECAST: 'forecast'
  });
  const ORIGINAL_PLAN_ID = 'original-plan';

  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  function createRegistry(year) {
    return { schemaVersion: C().schemaVersion, year, versions: [], currentVersionId: null };
  }

  /**
   * Versión = foto de valores por registro (date|channel → bloque de métricas).
   * @param {object} p { id, type, label, basedOn, values, notes, reason }
   */
  function createVersion({ id, type, label, basedOn = null, values = {}, notes = '', reason = null }) {
    if (!Object.values(VERSION_TYPES).includes(type)) throw new Error(`Tipo de versión inválido: "${type}"`);
    return {
      id,
      type,
      label,
      basedOn,
      createdAt: new Date().toISOString(),
      locked: false,
      reason,          // futuro: vínculo con diagnóstico/acción (analysis_export.json)
      notes,
      values
    };
  }

  function getVersion(registry, id) { return registry.versions.find((v) => v.id === id) || null; }
  function getOriginalPlan(registry) { return getVersion(registry, ORIGINAL_PLAN_ID); }
  function getCurrentVersion(registry) { return getVersion(registry, registry.currentVersionId); }
  function listVersions(registry) {
    return registry.versions.map(({ id, type, label, basedOn, createdAt, locked }) => ({ id, type, label, basedOn, createdAt, locked }));
  }

  /** Congela el plan del dataset como Original Plan. Solo puede hacerse una vez. */
  function lockOriginalPlan(registry, dataset) {
    if (getOriginalPlan(registry)) throw new Error('El Original Plan ya existe y no puede modificarse.');
    const values = {};
    Object.values(dataset.records).forEach((r) => { values[r.id] = { ...r.plan }; });
    const v = createVersion({ id: ORIGINAL_PLAN_ID, type: VERSION_TYPES.ORIGINAL_PLAN, label: 'Original Plan', values });
    v.locked = true;
    registry.versions.push(deepFreeze(v));
    if (!registry.currentVersionId) registry.currentVersionId = v.id;
    return v;
  }

  /** Agrega una versión nueva. Nunca reemplaza una existente. */
  function addVersion(registry, version, { makeCurrent = true } = {}) {
    if (version.type === VERSION_TYPES.ORIGINAL_PLAN) throw new Error('Use lockOriginalPlan() para el plan original.');
    if (getVersion(registry, version.id)) throw new Error(`La versión "${version.id}" ya existe.`);
    if (version.basedOn && !getVersion(registry, version.basedOn)) throw new Error(`basedOn desconocido: "${version.basedOn}"`);
    registry.versions.push(version);
    if (makeCurrent) registry.currentVersionId = version.id;
    return version;
  }

  /** Siguiente etiqueta 'Reforecast 01', 'Reforecast 02', … */
  function nextReforecastId(registry) {
    const n = registry.versions.filter((v) => v.type === VERSION_TYPES.REFORECAST).length + 1;
    const nn = String(n).padStart(2, '0');
    return { id: `reforecast-${nn}`, label: `Reforecast ${nn}` };
  }

  /** Rehidrata desde storage, volviendo a congelar el Original Plan. */
  function hydrateRegistry(raw) {
    if (!raw || !Array.isArray(raw.versions)) return null;
    const reg = createRegistry(raw.year);
    raw.versions.forEach((v) => reg.versions.push(v.type === VERSION_TYPES.ORIGINAL_PLAN ? deepFreeze(v) : v));
    reg.currentVersionId = raw.currentVersionId || null;
    return reg;
  }

  FP.forecast = {
    VERSION_TYPES, ORIGINAL_PLAN_ID,
    createRegistry, createVersion, getVersion, getOriginalPlan, getCurrentVersion, listVersions,
    lockOriginalPlan, addVersion, nextReforecastId, hydrateRegistry
  };
})(typeof window !== 'undefined' ? window : globalThis);
