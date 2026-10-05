/**
 * attribution.js — Atribución matemática de una variación multiplicativa (Fase 5).
 *
 *   Revenue = Traffic × CR × AOV      (Orders = Traffic × CR)
 *
 * Métodos:
 *  - 'sequential' (default): se cambia un factor a la vez en el orden configurado
 *      contribución(Traffic) = (T1 − T0) × CR0 × AOV0
 *      contribución(CR)      = T1 × (CR1 − CR0) × AOV0
 *      contribución(AOV)     = T1 × CR1 × (AOV1 − AOV0)
 *    La suma telescópica cierra exacto: Σ = R1 − R0. El resultado depende del orden (se informa).
 *  - 'shapley': promedio de las contribuciones secuenciales sobre TODOS los órdenes posibles
 *    (simétrico: no depende del orden). También cierra exacto.
 * Es una atribución matemática, no causal.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const fin = (v) => M().isFiniteNumber(v);

  const product = (vals) => vals.reduce((a, b) => a * b, 1);

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  }

  /** Contribuciones secuenciales en un orden dado. base/current: { factor: valor } */
  function sequentialOrder(base, current, order) {
    const state = { ...base };
    const out = {};
    let prev = product(order.map((f) => state[f]));
    order.forEach((f) => {
      state[f] = current[f];
      const next = product(order.map((g) => state[g]));
      out[f] = next - prev;
      prev = next;
    });
    return out;
  }

  /**
   * @param {object} base     { trafficVolume, conversionRate, aov }
   * @param {object} current  igual
   * @param {object} opts     { method, order, factors }  factors: ['trafficVolume','conversionRate','aov'] (venta) o sin 'aov' (pedidos)
   * @returns { method, order, factors, contributions, baseValue, currentValue, total, residual, closes, status }
   */
  function attribute(base, current, { method = C().diagnostics.attributionMethod, order = C().diagnostics.attributionOrder, factors = null } = {}) {
    const fs = (factors || order).filter((f) => order.includes(f));
    const ok = fs.every((f) => fin(base && base[f]) && fin(current && current[f]));
    if (!ok) return { method, order: fs, factors: fs, contributions: null, status: 'insufficient_data',
      note: 'Falta volumen, CR o AOV en uno de los lados (p. ej. 0 pedidos o 0 volumen): no se puede atribuir.' };
    let contributions;
    if (method === 'shapley') {
      const perms = permutations(fs);
      contributions = Object.fromEntries(fs.map((f) => [f, 0]));
      perms.forEach((p) => { const c = sequentialOrder(base, current, p); fs.forEach((f) => { contributions[f] += c[f] / perms.length; }); });
    } else {
      contributions = sequentialOrder(base, current, fs);
    }
    const baseValue = product(fs.map((f) => base[f]));
    const currentValue = product(fs.map((f) => current[f]));
    const total = currentValue - baseValue;
    const sum = fs.reduce((a, f) => a + contributions[f], 0);
    return { method, order: fs, factors: fs, contributions, baseValue, currentValue, total, residual: total - sum,
      closes: M().isApproximatelyEqual(sum, total, { relative: 1e-9, absolute: 1e-6 }), status: 'ok' };
  }

  FP.attribution = { attribute, sequentialOrder, permutations };
})(typeof window !== 'undefined' ? window : globalThis);
