/**
 * actionLibrary.js — Catálogo de acciones POSIBLES (Fase 6).
 *
 * No son recomendaciones: es un catálogo configurable (config.recovery.actionLibrary + acciones del
 * usuario) que se filtra por driver, canal, señales y datos disponibles. Nada se ejecuta.
 *
 *   { actionId, name, description, driver, applicableChannels, applicableSignals, requiredData,
 *     ownerArea, measurementMetric, defaultWindowDays, custom? }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const DRIVERS = ['trafficVolume', 'conversionRate', 'aov'];

  function all(custom = []) { return [...C().recovery.actionLibrary.map((a) => ({ ...a, custom: false })), ...custom.map((a) => ({ ...a, custom: true }))]; }

  /**
   * Acciones aplicables a un contexto. `availableData`: dimensiones y métricas presentes.
   * Una acción que pide datos inexistentes se devuelve marcada, no se oculta.
   */
  function applicable(custom, { driver = null, channel = 'total', signalMetrics = [], availableData = [] } = {}) {
    return all(custom).filter((a) => (!driver || a.driver === driver) &&
      (channel === 'total' || !a.applicableChannels || !a.applicableChannels.length || a.applicableChannels.includes(channel)))
      .map((a) => {
        const missing = (a.requiredData || []).filter((d) => !availableData.includes(d));
        const signalMatch = (a.applicableSignals || []).some((s) => signalMetrics.includes(s));
        return { ...a, missingData: missing, dataAvailable: !missing.length, signalMatch };
      });
  }

  /** Valida y normaliza una acción del usuario. */
  function validateCustom(a) {
    const errors = [];
    if (!a || !String(a.name || '').trim()) errors.push('Falta el nombre de la acción.');
    if (!DRIVERS.includes(a && a.driver)) errors.push('El driver debe ser volumen, CR o AOV.');
    const w = a && a.defaultWindowDays !== undefined && a.defaultWindowDays !== null && a.defaultWindowDays !== '' ? Number(a.defaultWindowDays) : null;
    if (w !== null && (!Number.isFinite(w) || w <= 0)) errors.push('La ventana de medición debe ser un número de días mayor a 0.');
    if (errors.length) return { ok: false, errors };
    return { ok: true, action: {
      actionId: a.actionId || `custom_${Date.now().toString(36)}`, name: String(a.name).trim(), description: String(a.description || '').trim(),
      driver: a.driver, applicableChannels: Array.isArray(a.applicableChannels) ? a.applicableChannels : [], applicableSignals: [a.driver],
      requiredData: [], ownerArea: String(a.ownerArea || '').trim(), measurementMetric: a.measurementMetric || a.driver, defaultWindowDays: w } };
  }

  FP.actionLibrary = { all, applicable, validateCustom, DRIVERS };
})(typeof window !== 'undefined' ? window : globalThis);
