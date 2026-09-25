/**
 * scenarioValidation.js — Validación de escenarios (Fase 6).
 *
 * Errores (bloquean la simulación): NaN, Infinity, valores negativos, CR resultante > 100 % o < 0,
 * variable no disponible en los datos, segmento inexistente.
 * Advertencias (no bloquean, siempre visibles): cambios que exceden una restricción del usuario.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * Normaliza el objeto de cambios. Todos opcionales; 0 o null = sin cambio.
   *   trafficPct: fracción (0.05 = +5 %)
   *   crMode: 'pp' | 'pct';  crValue: fracción (0.0015 = +0.15 pp; o 0.1 = +10 % relativo)
   *   aovMode: 'pct' | 'abs'; aovValue: fracción o monto
   */
  function normalizeChanges(ch = {}) {
    const num = (v) => (v === null || v === undefined || v === '' ? 0 : typeof v === 'number' ? v : Number(v));
    return {
      trafficPct: num(ch.trafficPct), crMode: ch.crMode === 'pct' ? 'pct' : 'pp', crValue: num(ch.crValue),
      aovMode: ch.aovMode === 'abs' ? 'abs' : 'pct', aovValue: num(ch.aovValue)
    };
  }

  /** Validación de los números de entrada (antes de simular). */
  function validateInputs(changes) {
    const errors = [];
    const c = normalizeChanges(changes);
    [['trafficPct', 'Cambio de volumen'], ['crValue', 'Cambio de CR'], ['aovValue', 'Cambio de AOV']].forEach(([k, l]) => {
      if (!fin(c[k])) errors.push({ field: k, message: `${l}: no es un número válido.` });
    });
    if (fin(c.trafficPct) && c.trafficPct < -1) errors.push({ field: 'trafficPct', message: 'El volumen no puede bajar más de 100 %.' });
    if (c.crMode === 'pct' && fin(c.crValue) && c.crValue < -1) errors.push({ field: 'crValue', message: 'El CR no puede bajar más de 100 %.' });
    if (c.aovMode === 'pct' && fin(c.aovValue) && c.aovValue < -1) errors.push({ field: 'aovValue', message: 'El AOV no puede bajar más de 100 %.' });
    if (c.crMode === 'pp' && fin(c.crValue) && Math.abs(c.crValue) > 1) errors.push({ field: 'crValue', message: 'Un cambio de CR mayor a 100 puntos no es posible.' });
    return { changes: c, errors };
  }

  const usesDriver = (c) => ({ trafficVolume: c.trafficPct !== 0, conversionRate: c.crValue !== 0, aov: c.aovValue !== 0 });

  /** Validación de un bloque diario resultante: sin NaN/Infinity, sin negativos, CR ≤ 100 %. */
  function validateBlock(b) {
    const out = [];
    if (!b) return out;
    ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov'].forEach((k) => {
      const v = b[k];
      if (v === null || v === undefined) return;
      if (!fin(v)) out.push(`${k} no es un número finito`);
      else if (v < 0) out.push(`${k} negativo`);
    });
    if (fin(b.conversionRate) && b.conversionRate > 1) out.push('CR mayor a 100 %');
    return out;
  }

  /**
   * Advertencias por restricciones. El cambio de CR se compara en pp (si viene en %, se convierte
   * con el CR base agregado).
   */
  function constraintWarnings(changes, constraints = {}, baseCR = null) {
    const w = [];
    const c = normalizeChanges(changes);
    const k = constraints || {};
    if (fin(k.maxTrafficIncrease) && c.trafficPct > k.maxTrafficIncrease + 1e-12) {
      w.push({ constraint: 'maxTrafficIncrease', message: `El volumen +${(c.trafficPct * 100).toFixed(1)} % excede la restricción de +${(k.maxTrafficIncrease * 100).toFixed(1)} %.` });
    }
    const crPP = c.crMode === 'pp' ? c.crValue : fin(baseCR) ? baseCR * c.crValue : null;
    if (fin(k.maxCRIncrease) && fin(crPP) && crPP > k.maxCRIncrease + 1e-12) {
      w.push({ constraint: 'maxCRIncrease', message: `El CR +${(crPP * 100).toFixed(2)} pp excede la restricción de +${(k.maxCRIncrease * 100).toFixed(2)} pp.` });
    }
    if (fin(k.maxAOVIncrease) && c.aovMode === 'pct' && c.aovValue > k.maxAOVIncrease + 1e-12) {
      w.push({ constraint: 'maxAOVIncrease', message: `El AOV +${(c.aovValue * 100).toFixed(1)} % excede la restricción de +${(k.maxAOVIncrease * 100).toFixed(1)} %.` });
    }
    return w;
  }

  FP.scenarioValidation = { normalizeChanges, validateInputs, validateBlock, constraintWarnings, usesDriver };
})(typeof window !== 'undefined' ? window : globalThis);
