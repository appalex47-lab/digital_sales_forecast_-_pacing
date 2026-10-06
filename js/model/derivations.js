/**
 * derivations.js — Fase B · motor central de métricas derivadas. Cada fórmula se REGISTRA (id, entradas, fórmula, unidad,
 * requisitos, tolerancia, versión) y se calcula con las funciones que la app ya usaba (FP.metrics.calcAov / calcConversionRate),
 * así que los resultados son idénticos a los existentes. Reglas: no divide entre cero, no usa entradas inválidas, en cuarentena
 * o faltantes, no mezcla periodos ni monedas, y si existe un valor original lo conserva y reporta la diferencia.
 * Convención: conversion_rate es proporción 0–1.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const M = () => FP.metrics;
  const DEFS = {
    aov: { id: 'aov', name: 'AOV (ticket promedio)', inputs: ['revenue', 'orders'], formula: 'revenue / orders', unit: 'currency', version: 1, tolerance: 0.01,
      requires: 'orders > 0', compute: (v) => M().calcAov(v.revenue, v.orders), denominator: 'orders' },
    conversion_rate: { id: 'conversion_rate', name: 'Tasa de conversión', inputs: ['orders', 'sessions'], formula: 'orders / sessions', unit: 'ratio (0–1)', version: 1, tolerance: 0.01,
      requires: 'sessions > 0', compute: (v) => M().calcConversionRate(v.orders, v.sessions), denominator: 'sessions' }
  };
  const REASON = {
    MISSING_DEPENDENCY: (d) => `Falta ${d} para calcularla.`,
    QUARANTINED_DEPENDENCY: (d) => `${d} está en cuarentena; no se usa para calcular.`,
    INVALID_DEPENDENCY: (d) => `${d} no es un número válido.`,
    ZERO_DENOMINATOR: (d) => `${d} es cero: no se puede dividir.`,
    CURRENCY_MISMATCH: () => 'Las entradas vienen en monedas distintas y no hay conversión explícita.',
    PERIOD_MISMATCH: () => 'Las entradas son de periodos distintos.'
  };
  const fin = (v) => typeof v === 'number' && isFinite(v);

  /**
   * @param {string} id  'aov' | 'conversion_rate'
   * @param {object} inputs  { revenue: { value, status?, currency?, period? }, ... } (status: original|normalized|quarantined|invalid|missing)
   * @param {object} [original] valor original de la fuente para la misma métrica (si existe)
   */
  function derive(id, inputs, { original = null } = {}) {
    const d = DEFS[id]; if (!d) throw new Error(`Métrica derivada no registrada: ${id}`);
    const out = { metric: id, value: null, status: 'unavailable', formula: d.formula, dependencies: d.inputs, derivationVersion: d.version, reasons: [] };
    const vals = {};
    for (const k of d.inputs) {
      const x = inputs[k];
      if (x && x.status === 'quarantined') { out.reasons.push({ code: 'QUARANTINED_DEPENDENCY', field: k, text: REASON.QUARANTINED_DEPENDENCY(k) }); continue; }
      if (!x || x.value === null || x.value === undefined || x.status === 'missing') { out.reasons.push({ code: 'MISSING_DEPENDENCY', field: k, text: REASON.MISSING_DEPENDENCY(k) }); continue; }
      if (x.status === 'invalid' || !fin(x.value)) { out.reasons.push({ code: 'INVALID_DEPENDENCY', field: k, text: REASON.INVALID_DEPENDENCY(k) }); continue; }
      vals[k] = x.value;
    }
    const cur = new Set(d.inputs.map((k) => inputs[k] && inputs[k].currency).filter(Boolean));
    if (cur.size > 1) out.reasons.push({ code: 'CURRENCY_MISMATCH', text: REASON.CURRENCY_MISMATCH() });
    const per = new Set(d.inputs.map((k) => inputs[k] && inputs[k].period).filter(Boolean));
    if (per.size > 1) out.reasons.push({ code: 'PERIOD_MISMATCH', text: REASON.PERIOD_MISMATCH() });
    if (!out.reasons.length && vals[d.denominator] === 0) out.reasons.push({ code: 'ZERO_DENOMINATOR', field: d.denominator, text: REASON.ZERO_DENOMINATOR(d.denominator) });
    if (!out.reasons.length) {
      const v = d.compute(vals);
      if (fin(v)) { out.value = v; out.status = 'derived'; }
    }
    if (original && fin(original.value)) {
      out.original = original.value;
      if (fin(out.value)) { const diff = out.value ? Math.abs(original.value - out.value) / Math.abs(out.value) : 0; out.reconciliation = { diffPct: diff, consistent: diff <= d.tolerance }; }
    }
    return out;
  }

  /** Suma métricas aditivas de registros (excluye celdas en cuarentena, inválidas o faltantes) y deriva AOV y CR. */
  function fromRecords(records) {
    const sum = (k) => { let s = 0, n = 0, q = 0; records.forEach((r) => { const c = r.metrics && r.metrics[k]; if (!c) return; if (c.source === 'quarantined') { q++; return; } if (c.source === 'observed' && fin(c.value)) { s += c.value; n++; } }); return { value: n ? s : null, status: n ? 'original' : q ? 'quarantined' : 'missing', count: n, quarantined: q }; };
    const revenue = sum('revenue'), orders = sum('orders'), sessions = sum('trafficVolume');
    return { revenue, orders, sessions, aov: derive('aov', { revenue, orders }), conversion_rate: derive('conversion_rate', { orders, sessions }) };
  }

  FP.derivations = { DEFS, derive, fromRecords };
})(typeof window !== 'undefined' ? window : globalThis);
