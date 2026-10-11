/**
 * tour.js — Recorrido guiado interactivo (Fase 7 → Fase 10).
 * Histórico → real → meta → plan → pacing → forecast → gap → drivers → señales → hipótesis → recovery → escenario → acción → medición.
 * Fase 10: los tres primeros pasos son de ACCIÓN: el usuario carga el dato (o dice que no lo tiene) y el recorrido avanza solo al
 * detectar el dato (histórico, real, meta); hay textos condicionales según lo que falte. Tarjeta flotante, no bloquea la pantalla.
 * Se puede avanzar, retroceder, pausar, salir y retomar. El progreso es de navegación, no del negocio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const steps = () => G().TOUR;
  const current = (state) => steps()[Math.min(Math.max(state.ux.tour.step, 0), steps().length - 1)];
  const idxOf = (id) => steps().findIndex((s) => s.id === id);

  /** ¿Ya existe el dato que cada paso de acción espera? (solo lectura; mismo estado que usa Inicio) */
  function has(status) {
    return { historical: status.data.historical > 0, actual: status.data.actual > 0, target: Boolean(status.targets.defined) };
  }
  const done = (state, status, s) => Boolean(s && s.detect && has(status)[s.detect]);

  /** Siguiente paso. Sin venta real se saltan los pasos que la necesitan (pacing … hipótesis) y se sigue en Recuperar. */
  function nextIdx(state, status, i) {
    const n = i + 1;
    if (n >= steps().length) return -1;
    const t = state.ux.tour;
    const noReal = (t.skipped && t.skipped.real) && !has(status).actual;
    if (noReal && steps()[n].id === 'pacing') return idxOf('recovery');
    return n;
  }

  /** Textos condicionales según lo que falte. */
  function noteFor(state, status, s) {
    const t = state.ux.tour; const h = has(status); const sk = t.skipped || {};
    const noH = Boolean(sk.datos) && !h.historical; const noR = Boolean(sk.real) && !h.actual;
    if (s.id === 'real' && noH) return 'Sin histórico no habrá comparación contra el año anterior ni estacionalidad propia; se usará la estacionalidad configurada.';
    if (s.id === 'meta') {
      if (noH && noR) return 'No tienes ni histórico ni venta real. Sin ellos el plan queda sin volumen, AOV ni CR y no hay pacing. Continuemos con tu meta y un plan base; cuando tengas datos, el recorrido te regresa a cargarlos.';
      if (h.historical && noR) return 'Tienes histórico pero no venta real: puedes planear, pero Pacing y Forecast aparecerán vacíos hasta que la cargues.';
      if (noH && h.actual) return 'Sin histórico, el plan no proyecta volumen, AOV ni CR del año anterior.';
    }
    if (s.id === 'drivers' && noH) return 'Sin histórico no se puede comparar contra el año anterior; el diagnóstico usará solo el plan.';
    if (s.id === 'recovery' && noR) return 'Como no cargaste venta real, saltamos Pacing, Forecast y el diagnóstico: aparecerán vacíos hasta que la cargues.';
    return '';
  }

  /** Si el paso actual es de acción y su dato ya existe, devuelve a dónde avanzar (lo llama render()). */
  function syncTarget(state, status) {
    const t = state.ux.tour;
    if (!t.active || t.ended) return null;
    const s = current(state);
    if (!s || s.kind !== 'action' || !done(state, status, s)) return null;
    const n = nextIdx(state, status, steps().indexOf(s));
    if (n < 0) return null;
    return { idx: n, flash: `${s.done} Siguiente: ${steps()[n].title}.` };
  }

  function summaryRows(state, status) {
    const t = state.ux.tour; const sk = t.skipped || {}; const h = has(status);
    const row = (id) => {
      const s = steps()[idxOf(id)];
      const ok = h[s.detect];
      return { id, name: s.title, status: ok ? 'Hecho' : sk[id] ? 'Omitido' : 'Pendiente', tone: ok ? 'ok' : sk[id] ? 'skip' : 'pend', resume: !ok };
    };
    const rows = [row('datos'), row('real'), row('meta')];
    rows.push({ id: 'meta', name: 'Plan, pacing, forecast, diagnóstico, recuperación y medición', status: t.ended === 'fin' ? 'Revisado' : 'Pendiente', tone: t.ended === 'fin' ? 'ok' : 'pend', resume: t.ended !== 'fin' });
    return rows;
  }

  function render(state) {
    const bar = $('tour-bar');
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    const t = state.ux.tour;
    if (!t.active) { bar.hidden = true; bar.innerHTML = ''; bar.classList.remove('tour-bar--pill'); return; }
    const esc = H().esc;
    const status = FP.contextEngine.collectStatus(state);
    const n = steps().length;
    const s = current(state);
    const i = steps().indexOf(s);
    bar.hidden = false;

    if (t.collapsed) {
      bar.classList.add('tour-bar--pill');
      bar.innerHTML = `<button type="button" class="btn btn--primary tour-pill" data-action="tour-expand">${t.ended ? 'Ver resumen del recorrido' : t.went && s.kind === 'action' ? `Recorrido en espera · paso ${i + 1} de ${n} · Abrir` : `Retomar recorrido · paso ${i + 1} de ${n}`}</button>`;
      return;
    }
    bar.classList.remove('tour-bar--pill');

    const sk = t.skipped || {};
    const dots = steps().map((x, k) => {
      const ok = x.kind === 'action' ? done(state, status, x) : (!t.ended && k < i) || t.ended === 'fin';
      const skipped = x.kind === 'action' && !ok && sk[x.id];
      const cur = !t.ended && k === i;
      const label = `${x.title}${ok ? ' · hecho' : skipped ? ' · omitido' : cur ? ' · paso actual' : ''}`;
      return `<span class="tour-dot${ok ? ' tour-dot--ok' : ''}${skipped ? ' tour-dot--skip' : ''}${cur ? ' tour-dot--cur' : ''}" title="${esc(label)}" aria-label="${esc(label)}">${ok ? '<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.5"/></svg>' : ''}</span>`;
    }).join('');
    const head = `<div class="tour-bar__dots" role="img" aria-label="Progreso del recorrido">${dots}</div>`;
    const ctl = `<span class="tour-bar__ctl"><button type="button" class="tour-link" data-action="tour-pause">Pausar</button><button type="button" class="tour-link" data-action="tour-exit">Salir (se guarda el paso)</button></span>`;

    if (t.ended) {
      const rows = summaryRows(state, status).map((r) => `<li class="tour-sum__row"><span class="tour-chip tour-chip--${r.tone}">${r.status}</span><span>${esc(r.name)}</span>${r.resume ? `<button type="button" class="btn btn--small" data-action="tour-resume" data-step="${r.id}">Retomar</button>` : ''}</li>`).join('');
      bar.innerHTML = `<div class="tour-bar__inner" role="region" aria-label="Recorrido guiado">
        <div class="tour-bar__row">${head}</div>
        <h3 class="tour-bar__title">${t.ended === 'nometa' ? 'Recorrido en pausa: falta tu meta' : 'Recorrido terminado'}</h3>
        <p class="tour-bar__txt">${t.ended === 'nometa' ? 'Sin meta no hay plan, pacing ni forecast. Cuando la tengas, retoma desde aquí; lo ya hecho se conserva.' : 'Esto quedó hecho y esto quedó pendiente. Puedes retomar cualquier punto cuando quieras.'}</p>
        <ul class="tour-sum">${rows}</ul>
        <div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="tour-close">Cerrar recorrido</button>${ctl}</div>
      </div>`;
      return;
    }

    // Viaja con el recorrido (Fase 9.1): mismo cálculo que Inicio, no un progreso distinto.
    const ready = FP.contextEngine.dataReadiness(status);
    const note = noteFor(state, status, s);
    const action = s.kind === 'action';
    bar.innerHTML = `
      <div class="tour-bar__inner" role="region" aria-label="Recorrido guiado">
        <div class="tour-bar__row">${head}</div>
        <div class="tour-bar__head">
          <span class="tour-bar__step">Paso ${i + 1} de ${n}</span>
          <span class="tour-bar__progress" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}" aria-label="Progreso del recorrido">
            <span style="width:${((i + 1) / n * 100).toFixed(1)}%"></span></span>
          <span class="tour-bar__ready" title="${esc(ready.label)}. ${esc(ready.note)}">
            <span class="tour-bar__ready-bar"><span class="tour-bar__ready-fill tour-bar__ready-fill--${ready.tier}" style="width:${ready.percent}%"></span></span>
            <span class="tour-bar__ready-pct">Tus datos: ${ready.percent} %</span>
          </span>
        </div>
        <h3 class="tour-bar__title">${s.chapter ? `${esc(s.chapter)} · ` : ''}${esc(s.title)}</h3>
        ${t.flash ? `<p class="tour-flash" role="status">${esc(t.flash)}</p>` : ''}
        ${i === 0 ? '<p class="tour-bar__note">Este recorrido enseña el orden completo de la metodología, siempre empezando por los datos. Tu avance real con tus propios datos viaja arriba a la derecha, y el detalle completo está en Inicio.</p>' : ''}
        <dl class="tour-bar__body">
          <div><dt>Qué estamos viendo</dt><dd>${esc(s.what)}</dd></div>
          <div><dt>Por qué importa</dt><dd>${esc(s.why)}</dd></div>
        </dl>
        ${note ? `<p class="tour-cond">${esc(note)}</p>` : ''}
        ${action && t.went ? `<p class="tour-wait"><span aria-hidden="true"></span>${esc(s.waiting)}</p>` : ''}
        <details class="tour-more"><summary>Qué buscar y qué sigue</summary>
          <dl class="tour-bar__body"><div><dt>Qué buscar</dt><dd>${esc(s.lookFor)}</dd></div><div><dt>Qué sigue</dt><dd>${esc(s.next)}</dd></div></dl>
        </details>
        <div class="btn-row">
          ${action ? `<button type="button" class="btn btn--small btn--primary" data-action="tour-cta">${esc(s.cta)}</button>
            <button type="button" class="btn btn--small" data-action="tour-skip">${esc(s.skipLabel)}</button>`
        : `<button type="button" class="btn btn--small btn--primary" data-action="tour-next">${i === n - 1 ? 'Terminar' : 'Siguiente'}</button>`}
          <button type="button" class="btn btn--small btn--ghost" data-action="tour-prev" ${i === 0 ? 'disabled' : ''}>Atrás</button>
          ${ctl}
        </div>
      </div>`;
    const target = s.target ? document.querySelector(s.target) : null;
    if (target && state.view === s.view) {
      const box = target.closest('section.panel') || target;
      box.classList.add('tour-target');
      if (box.scrollIntoView && !(action && !t.went)) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  FP.tour = { steps, current, render, syncTarget, nextIdx, noteFor, has, idxOf, summaryRows };
})(typeof window !== 'undefined' ? window : globalThis);
