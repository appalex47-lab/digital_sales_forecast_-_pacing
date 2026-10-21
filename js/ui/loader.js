/**
 * loader.js — compatibilidad: el loader general de las vistas de análisis usa ahora el mismo componente homologado (FP.ui.loader).
 * Estas esperas son cálculos de una sola pieza que no reportan avance real. Para no inventar un porcentaje:
 *  - si la vista pasa `pct` (avance real), se usa tal cual;
 *  - si ya se corrió antes en esta sesión, el % y el «faltan» se ESTIMAN con la duración de la última vez y se rotulan «estimado»;
 *  - la primera vez solo hay barra indeterminada y reloj (no hay base honesta para estimar).
 * `key` identifica la carga: mientras se repinta con la misma clave se conserva el tiempo de inicio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const starts = new Map(), durs = new Map();
  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
  function startOf(key) {
    const now = Date.now(), e = starts.get(key);
    if (e && now - e.last >= 3000) { const d = e.last - e.start; if (d > 800) durs.set(key, d); }   // la carga anterior terminó: se guarda cuánto tardó
    const st = e && now - e.last < 3000 ? e.start : now;
    starts.set(key, { start: st, last: now });
    return st;
  }
  function est(key, st, pct) {
    if (typeof pct === 'number' && Number.isFinite(pct)) return { pct, est: false };
    const d = durs.get(key); if (!d) return { pct: null, est: false };
    return { pct: Math.min(95, ((Date.now() - st) / d) * 100), est: true };
  }
  /** HTML del loader. `detail` es la etapa actual (por ejemplo, el paso del cálculo). */
  function html(label, opts) {
    const o = opts || {}, key = o.key || label, st = startOf(key), e = est(key, st, o.pct);
    return FP.ui.loader.html({ title: label, label: o.detail || 'Calculando…', pct: e.pct, est: e.est, t0: st, key, hint: 'Puede tardar con muchos datos; no es un error.' });
  }
  function tick() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.ldr[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key'), e = starts.get(key); if (!e) return;
      e.last = Date.now();
      if (el.getAttribute('data-est') === '1') { const r = est(key, e.start, null); if (r.pct !== null) FP.ui.loader.update(el, { pct: r.pct }); }
    });
  }
  if (typeof setInterval === 'function') setInterval(tick, 500);
  FP.loader = { html, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
