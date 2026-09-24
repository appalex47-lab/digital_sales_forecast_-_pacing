/**
 * weights.js — Estadística robusta y utilidades de pesos (Fase 2).
 *
 * Funciones puras, sin conocimiento de canales ni fechas. Las usa seasonality.js.
 *
 * Metodología de suavizado (documentada también en ARCHITECTURE.md §21):
 *   1. Calcular comportamiento histórico (ratios día / base).
 *   2. Detectar extremos: valores a más de k·σ̂ de la mediana, con σ̂ = MAD × 1.4826.
 *   3. Suavizar según método: winsorizar (recortar al límite) y promediar, media recortada o mediana.
 *   4. Encoger hacia 1 según tamaño de muestra y normalizar de nuevo.
 * Los registros originales nunca se modifican: se trabaja sobre copias de los ratios.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const P = () => FP.config.planning;

  const MAD_SCALE = 1.4826; // convierte MAD en σ para datos normales

  const finite = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

  function mean(xs) { const v = finite(xs); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

  function median(xs) {
    const v = finite(xs).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  /** Desviación absoluta mediana. */
  function mad(xs) {
    const m = median(xs);
    return m === null ? null : median(finite(xs).map((x) => Math.abs(x - m)));
  }

  /** Límites [bajo, alto] fuera de los cuales un valor es extremo. */
  function outlierBounds(xs, k = P().outlierMadK) {
    const m = median(xs), d = mad(xs);
    if (m === null) return null;
    const s = (d || 0) * MAD_SCALE;
    return s === 0 ? [m, m] : [m - k * s, m + k * s];
  }

  /** Cuenta extremos sin modificar nada. */
  function countOutliers(xs, k = P().outlierMadK) {
    const b = outlierBounds(xs, k);
    if (!b || b[0] === b[1]) return 0;
    return finite(xs).filter((x) => x < b[0] || x > b[1]).length;
  }

  function winsorize(xs, k = P().outlierMadK) {
    const b = outlierBounds(xs, k);
    if (!b || b[0] === b[1]) return finite(xs);
    return finite(xs).map((x) => Math.min(b[1], Math.max(b[0], x)));
  }

  function trimmedMean(xs, share = P().trimShare) {
    const v = finite(xs).sort((a, b) => a - b);
    if (!v.length) return null;
    const cut = Math.floor(v.length * share);
    return mean(v.slice(cut, v.length - cut || undefined));
  }

  /** Centro robusto según el método configurado. */
  function robustCenter(xs, method = P().smoothing) {
    const v = finite(xs);
    if (!v.length) return null;
    if (method === 'median') return median(v);
    if (method === 'trimmed_mean') return trimmedMean(v);
    if (method === 'none') return mean(v);
    return mean(winsorize(v)); // winsorized_mean (default)
  }

  /** Error estándar robusto de la media. */
  function robustStdError(xs) {
    const v = finite(xs);
    if (v.length < 2) return null;
    return ((mad(v) || 0) * MAD_SCALE) / Math.sqrt(v.length);
  }

  /** Encoge un factor hacia 1 según n: f' = 1 + (f − 1)·n/(n + k). */
  function shrink(factor, n, k = P().shrinkageK) {
    if (factor === null) return null;
    return 1 + (factor - 1) * (n / (n + k));
  }

  const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

  /** Aplica intensidad α a un factor multiplicativo: f^α (α=0 → 1; α=1 → f). */
  function applyIntensity(factor, alpha) {
    if (factor === null || factor <= 0) return 1;
    return Math.pow(factor, alpha);
  }

  /** Normaliza pesos para que sumen 1. Pesos no finitos o negativos cuentan como 0. Si todo es 0 → uniforme. */
  function normalizeWeights(weights) {
    const w = weights.map((x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0));
    const total = w.reduce((a, b) => a + b, 0);
    return total > 0 ? w.map((x) => x / total) : w.map(() => 1 / w.length);
  }

  /** Normaliza factores para que su promedio sea 1 (conserva la forma). */
  function normalizeToMeanOne(factors) {
    const m = mean(factors);
    return m ? factors.map((f) => (f === null ? null : f / m)) : factors;
  }

  /** Nivel de confianza por umbrales { excellent, sufficient, limited }. */
  function confidenceFrom(n, thresholds) {
    if (n >= thresholds.excellent) return 'excellent';
    if (n >= thresholds.sufficient) return 'sufficient';
    if (n >= thresholds.limited) return 'limited';
    return 'insufficient';
  }

  /** El peor de varios niveles (ignora null = "no aplica"). null si ninguno aplica. */
  function worstConfidence(levels) {
    const order = FP.config.confidenceLevels;
    const v = levels.filter(Boolean);
    if (!v.length) return null;
    return v.reduce((w, l) => (order.indexOf(l) > order.indexOf(w) ? l : w), v[0]);
  }

  FP.weights = {
    MAD_SCALE, mean, median, mad, outlierBounds, countOutliers, winsorize, trimmedMean, robustCenter, robustStdError,
    shrink, clamp, applyIntensity, normalizeWeights, normalizeToMeanOne, confidenceFrom, worstConfidence
  };
})(typeof window !== 'undefined' ? window : globalThis);
