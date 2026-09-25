/**
 * distribution.js — Reparto exacto de un total entre partes (Fase 2).
 *
 * Método del mayor residuo (Hamilton) sobre unidades enteras:
 *   1. Convertir el total a unidades (centavos para dinero, unidades para pedidos/volumen).
 *   2. Asignar floor(total × peso) a cada parte.
 *   3. Repartir las unidades sobrantes, una por parte, a los mayores residuos
 *      (empates: la parte de mayor peso, luego la primera).
 * Resultado: la suma de las partes es EXACTAMENTE el total, sin ajustar la meta
 * y sin cargar el redondeo a una sola parte ("el último día").
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const pow10 = (d) => Math.pow(10, d);

  /**
   * @param {number} total
   * @param {number[]} weights  pesos ≥ 0 (se normalizan aquí)
   * @param {object} opts { decimals: 2 dinero | 0 unidades }
   * @returns {number[]} partes con `decimals` decimales, suma exacta = total redondeado a `decimals`
   */
  function distributeTarget(total, weights, { decimals = 2 } = {}) {
    if (!weights.length) return [];
    if (total === null || total === undefined || !Number.isFinite(total)) return weights.map(() => null);
    const scale = pow10(decimals);
    const units = Math.round(total * scale);
    const w = FP.weights.normalizeWeights(weights);
    const sign = units < 0 ? -1 : 1;
    const abs = Math.abs(units);
    const raw = w.map((x) => abs * x);
    const base = raw.map(Math.floor);
    let rest = abs - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - base[i], w: w[i] }))
      .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
    for (let j = 0; rest > 0; j = (j + 1) % order.length, rest--) base[order[j].i] += 1;
    return base.map((u) => (sign * u) / scale);
  }

  /** Normaliza una distribución ya calculada para que cierre en `total` (reparte de nuevo por proporción). */
  function normalizeDistribution(values, total, opts) {
    return distributeTarget(total, values.map((v) => (v > 0 ? v : 0)), opts);
  }

  /** Suma en unidades enteras (evita errores de flotante al validar cierres). */
  function exactSum(values, decimals = 2) {
    const scale = pow10(decimals);
    return values.reduce((a, v) => a + Math.round((v || 0) * scale), 0) / scale;
  }

  FP.distribution = { distributeTarget, normalizeDistribution, exactSum };
})(typeof window !== 'undefined' ? window : globalThis);
