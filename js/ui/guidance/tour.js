/**
 * tour.js — Recorrido guiado opcional (Fase 7).
 * Meta → plan → real → pacing → forecast → gap → drivers → señales → hipótesis → recovery → escenario → acción → medición.
 * Fase 9.1: mismo recorrido extendido con plan, real y recovery, agrupado en capítulos para retomarlo por partes.
 * Se puede avanzar, retroceder, salir y retomar. El progreso es de navegación, no del negocio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const steps = () => G().TOUR;
  const current = (state) => steps()[Math.min(Math.max(state.ux.tour.step, 0), steps().length - 1)];

  function render(state) {
    const bar = $('tour-bar');
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    if (!state.ux.tour.active) { bar.hidden = true; bar.innerHTML = ''; return; }
    const esc = H().esc;
    const s = current(state);
    const i = steps().indexOf(s);
    const n = steps().length;
    bar.hidden = false;
    bar.innerHTML = `
      <div class="tour-bar__inner" role="region" aria-label="Recorrido guiado">
        <div class="tour-bar__head">
          <span class="tour-bar__step">Paso ${i + 1} de ${n}</span>
          <span class="tour-bar__progress" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}" aria-label="Progreso del recorrido">
            <span style="width:${((i + 1) / n * 100).toFixed(1)}%"></span></span>
          <strong>${s.chapter ? `${esc(s.chapter)} · ` : ''}${esc(s.title)}</strong>
        </div>
        <dl class="tour-bar__body">
          <div><dt>Qué estamos viendo</dt><dd>${esc(s.what)}</dd></div>
          <div><dt>Por qué importa</dt><dd>${esc(s.why)}</dd></div>
          <div><dt>Qué buscar</dt><dd>${esc(s.lookFor)}</dd></div>
          <div><dt>Qué sigue</dt><dd>${esc(s.next)}</dd></div>
        </dl>
        <div class="btn-row">
          <button type="button" class="btn btn--small" data-action="tour-prev" ${i === 0 ? 'disabled' : ''}>Atrás</button>
          <button type="button" class="btn btn--small btn--primary" data-action="tour-next">${i === n - 1 ? 'Terminar' : 'Siguiente'}</button>
          <button type="button" class="btn btn--small btn--ghost" data-action="tour-exit">Salir (se guarda el paso)</button>
        </div>
      </div>`;
    const target = s.target ? document.querySelector(s.target) : null;
    if (target && state.view === s.view) {
      const box = target.closest('section.panel') || target;
      box.classList.add('tour-target');
      if (box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  FP.tour = { steps, current, render };
})(typeof window !== 'undefined' ? window : globalThis);
