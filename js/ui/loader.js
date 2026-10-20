/**
 * loader.js — indicador de carga reutilizable: texto, barra y segundos transcurridos.
 * La barra es indeterminada (no se conoce el total); los segundos avanzan solos aunque la pantalla no se repinte.
 * `key` identifica la carga: mientras se repinta con la misma clave se conserva el tiempo de inicio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const starts = new Map();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };
  function startOf(key) {
    const now = Date.now(), e = starts.get(key);
    const st = e && now - e.last < 3000 ? e.start : now;
    starts.set(key, { start: st, last: now });
    return st;
  }
  /** HTML del loader. `detail` es una segunda línea opcional (por ejemplo, el paso actual). */
  function html(label, opts) {
    const o = opts || {}, st = startOf(o.key || label);
    return `<div class="fp-loader" role="status" aria-live="polite" data-start="${st}"><span class="fp-loader__l">${esc(label)}</span>`
      + `<span class="fp-loader__bar" aria-hidden="true"><i></i></span>`
      + `<span class="fp-loader__t">${esc(fmt(Date.now() - st))} · puede tardar con muchos datos; no es un error</span>`
      + (o.detail ? `<span class="fp-loader__d">${esc(o.detail)}</span>` : '') + `</div>`;
  }
  function tick() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.fp-loader[data-start]').forEach((el) => {
      const t = el.querySelector('.fp-loader__t'); if (!t) return;
      const st = Number(el.getAttribute('data-start')); if (st) { t.textContent = `${fmt(Date.now() - st)} · puede tardar con muchos datos; no es un error`; const e = [...starts.values()].find((v) => v.start === st); if (e) e.last = Date.now(); }
    });
  }
  if (typeof setInterval === 'function') setInterval(tick, 500);
  FP.loader = { html, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
