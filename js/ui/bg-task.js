/**
 * bg-task.js — Indicador de «tarea en segundo plano» (Cuenta y nube: subir, restaurar, borrar).
 *
 * La operación ya sigue corriendo si cambias de pantalla (es red, no una pantalla); esto solo la hace visible desde cualquier vista:
 * una píldora fija abajo a la izquierda con el avance, que al tocarla lleva a Configuración → Cuenta. Se oculta sola cuando estás
 * viendo Cuenta (ahí ya está el avance grande). Al terminar avisa el resultado si estás en otra pantalla. Mientras corre, el navegador
 * pregunta antes de cerrar o recargar la pestaña (cerrarla a medias dejaría la copia incompleta).
 * Sin datos de la app: recibe etiqueta y porcentaje; la lógica de nube sigue en app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  let el = null, active = false, label = '', pct = null, goTo = null, here = () => false;

  function ensure() {
    if (el) return el;
    el = document.createElement('button');
    el.type = 'button'; el.id = 'bg-task'; el.className = 'bg-task'; el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="bg-task__dot" aria-hidden="true"></span><span class="bg-task__txt"></span><span class="bg-task__pct"></span><span class="bg-task__bar" aria-hidden="true"><i></i></span>';
    el.addEventListener('click', () => { if (goTo) goTo(); });
    document.body.appendChild(el);
    return el;
  }
  function paint() {
    if (!el) return;
    const show = active && !here();
    el.hidden = !show;
    if (!show) return;
    el.querySelector('.bg-task__txt').textContent = label;
    el.querySelector('.bg-task__pct').textContent = pct === null ? '' : `${pct} %`;
    const bar = el.querySelector('.bg-task__bar i'); bar.style.width = pct === null ? '' : `${pct}%`;
    el.classList.toggle('bg-task--ind', pct === null);
    el.setAttribute('aria-label', `${label}${pct === null ? '' : `, ${pct} por ciento`}. Toca para ver el detalle.`);
  }
  const warn = (e) => { if (active) { e.preventDefault(); e.returnValue = ''; return ''; } };

  FP.bgTask = {
    /** `opts.here()`: true si el avance ya está a la vista (se oculta la píldora). `opts.goTo()`: lleva al detalle. */
    start(text, opts) {
      opts = opts || {}; active = true; label = text || 'Trabajando'; pct = null; goTo = opts.goTo || null; here = opts.here || (() => false);
      ensure(); root.addEventListener('beforeunload', warn); paint();
    },
    update(text, p) { if (!active) return; if (text) label = text; pct = (p === null || p === undefined || !isFinite(p)) ? null : Math.max(0, Math.min(100, Math.round(p))); paint(); },
    /** Termina; si `msg` y la persona está en otra pantalla, lo avisa con un toast. */
    finish(msg, ms) {
      const away = active && !here();
      active = false; root.removeEventListener('beforeunload', warn); paint();
      if (away && msg && FP.ui && FP.ui.toast) FP.ui.toast(msg, { ms: ms || 7000 });
    },
    /** Repinta (visible/oculta) tras cambiar de pantalla. */
    sync: paint,
    get active() { return active; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
