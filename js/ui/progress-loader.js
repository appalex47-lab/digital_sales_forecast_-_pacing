/* Loader homologado de RevNavigator: mismo aspecto, textos y accesibilidad en toda espera larga
 * (carga de archivos, validación y guardado de productos, evolución histórica, nube).
 * Muestra etapa, porcentaje real (si se conoce), tiempo transcurrido y estimación de lo que falta.
 * Sin porcentaje conocido (pct = null) la barra es indeterminada y NO se inventa estimación. */
(function () {
  'use strict';
  const FP = (window.FP = window.FP || {});
  FP.ui = FP.ui || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const known = (p) => typeof p === 'number' && Number.isFinite(p);
  const clamp = (p) => Math.max(0, Math.min(100, Math.round(p)));
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /** «0:23 transcurridos · faltan ≈ 0:40»; la estimación solo aparece con ≥5 % de avance y ≥3 s de reloj. */
  function timeText(t0, pct, now, est) {
    if (!t0) return '';
    const el = (now || Date.now()) - t0;
    let s = `${mmss(el)} transcurridos`;
    if (known(pct) && pct >= 5 && pct < 100 && el >= 3000) s += ` · faltan ≈ ${mmss(el * (100 - pct) / pct)}${est ? ' (estimado con la última vez)' : ''}`;
    return s;
  }

  let timer = null;
  function tick() {
    const els = document.querySelectorAll('.ldr[data-t0]');
    if (!els.length) { clearInterval(timer); timer = null; return; }
    els.forEach((el) => {
      const t = el.querySelector('.ldr__time'); if (!t) return;
      const p = el.getAttribute('data-pct');
      t.textContent = timeText(Number(el.getAttribute('data-t0')), p === '' || p == null ? null : Number(p), null, el.getAttribute('data-est') === '1');
    });
  }
  function ensureTicker() { if (!timer) timer = setInterval(tick, 1000); }

  /** HTML del loader. `t0` (ms epoch) activa el reloj; `pct` null = indeterminado. */
  function html(o) {
    o = o || {};
    const p = known(o.pct) ? clamp(o.pct) : null;
    const label = o.label || 'Trabajando';
    if (o.t0) ensureTicker();
    return `<div class="ldr${p === null ? ' ldr--ind' : ''}${o.compact ? ' ldr--compact' : ''}"${o.id ? ` id="${esc(o.id)}"` : ''} role="progressbar" aria-label="${esc(o.title || label)}" aria-valuemin="0" aria-valuemax="100"${p === null ? '' : ` aria-valuenow="${p}"`} aria-valuetext="${esc(label)}${p === null ? '' : ` · ${p} %`}"${o.t0 ? ` data-t0="${Number(o.t0)}"` : ''} data-pct="${p === null ? '' : p}"${o.est ? ' data-est="1"' : ''}${o.key ? ` data-key="${esc(o.key)}"` : ''}>`
      + `<div class="ldr__head">${o.title ? `<strong class="ldr__title">${esc(o.title)}</strong>` : ''}<span class="ldr__pct">${p === null ? '' : `${p} %`}</span></div>`
      + `<span class="ldr__label">${esc(label)}</span>`
      + `<span class="ldr__bar"><i${p === null ? '' : ` style="width:${p}%"`}></i></span>`
      + `<span class="ldr__time field__hint" aria-hidden="true">${o.t0 ? esc(timeText(o.t0, p, null, o.est)) : ''}</span>`
      + (o.hint ? `<span class="ldr__hint field__hint">${esc(o.hint)}</span>` : '')
      + `</div>`;
  }

  /** Actualiza en sitio (sin redibujar la pantalla). Devuelve false si el loader no está en el DOM. */
  function update(target, o) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return false;
    o = o || {};
    if (o.t0) { el.setAttribute('data-t0', String(o.t0)); ensureTicker(); }
    const p = 'pct' in o ? (known(o.pct) ? clamp(o.pct) : null) : (el.getAttribute('data-pct') === '' ? null : Number(el.getAttribute('data-pct')));
    const lab = el.querySelector('.ldr__label'); if (o.label != null && lab) lab.textContent = o.label;
    el.setAttribute('data-pct', p === null ? '' : String(p));
    el.classList.toggle('ldr--ind', p === null);
    const bar = el.querySelector('.ldr__bar i'); if (bar) bar.style.width = p === null ? '' : `${p}%`;
    const pc = el.querySelector('.ldr__pct'); if (pc) pc.textContent = p === null ? '' : `${p} %`;
    if (p === null) el.removeAttribute('aria-valuenow'); else el.setAttribute('aria-valuenow', String(p));
    el.setAttribute('aria-valuetext', `${lab ? lab.textContent : ''}${p === null ? '' : ` · ${p} %`}`);
    const t = el.querySelector('.ldr__time'), t0 = Number(el.getAttribute('data-t0')) || 0;
    if (t) t.textContent = t0 ? timeText(t0, p, null, el.getAttribute('data-est') === '1') : '';
    return true;
  }

  FP.ui.loader = { html, update, timeText, mmss, tick };
})();
