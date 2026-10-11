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

  // Ruta elegida en la pregunta inicial (Fase 12): A completa · B solo histórico · C empresa nueva. Sin ruta (usuarios previos) = A.
  const PATHS = { A: 'Completa', B: 'Solo histórico', C: 'Empresa nueva' };
  let pathNow = 'A';
  const setPath = (p) => { pathNow = PATHS[p] ? p : 'A'; };
  const steps = () => G().TOUR.filter((s) => (s.paths || 'A').includes(pathNow));
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
    if (noReal && steps()[n].id === 'pacing' && idxOf('recovery') >= 0) return idxOf('recovery');
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
    if (s.id === 'plan' && !h.historical) return 'Ojo: sin histórico el plan original se congela sin volumen, AOV ni CR y ya no se puede rehacer. Si puedes, carga histórico antes de guardar.';
    if (s.id === 'pacing' && !h.actual) return 'Aún no hay venta real: cuando la cargues, esta vista se activa. Mientras tanto el avance aparece vacío.';
    if (s.id === 'drivers' && noH) return 'Sin histórico no se puede comparar contra el año anterior; el diagnóstico usará solo el plan.';
    if (s.id === 'recovery' && noR) return 'Como no cargaste venta real, saltamos Pacing, Forecast y el diagnóstico: aparecerán vacíos hasta que la cargues.';
    return '';
  }

  /**
   * Micro-pasos del paso: se CALCULAN del estado de la app (archivo en revisión, meta guardada, vista previa, plan guardado), no se guardan,
   * así no se desincronizan al cambiar de pantalla o recargar. Los que no tienen resultado detectable (revisar) llevan un botón manual
   * y se guardan en `tour.micro`. Un micro-paso posterior hecho implica los anteriores.
   */
  function microList(state, status, s) {
    if (!s || !s.micro) return [];
    const t = state.ux.tour; const mk = t.micro || {}; const h = has(status);
    const hasData = status.data.historical > 0 || status.data.actual > 0;
    const ps = state.planning || {}; const reg = ps.registry || {}; const hasOriginal = Boolean(reg.originalPlanId);
    const items = (state.staging && state.staging.items) || [];
    const list = s.micro.filter((m) => !m.when || (m.when === 'data') === hasData);
    const own = list.map((m) => {
      const marked = Boolean(mk[`${s.id}.${m.key}`]);
      const staged = items.some((i) => i.staged && i.staged.dataType === s.detect);
      // una marca manual solo vale mientras exista lo que se revisó (la vista previa y el archivo en revisión no sobreviven a recargar)
      let manual = marked;
      if ((s.id === 'datos' || s.id === 'real') && m.key === 'review') manual = marked && (staged || Boolean(h[s.detect]));
      if (s.id === 'plan' && m.key === 'review') manual = marked && (Boolean(ps.preview) || hasOriginal);
      if (s.id === 'plan' && m.key === 'view') manual = marked && hasOriginal;
      if (m.key === 'file') return staged || manual;
      if (m.key === 'commit') return Boolean(h[s.detect]);
      if (s.id === 'meta' && m.key === 'save') return h.target;
      if (s.id === 'plan' && m.key === 'gen') return Boolean(ps.preview) || hasOriginal;
      if (s.id === 'plan' && m.key === 'save') return hasOriginal;
      return manual;
    });
    let later = false; const dn = new Array(list.length);
    for (let i = list.length - 1; i >= 0; i--) { dn[i] = own[i] || later; later = later || dn[i]; }
    const curI = dn.indexOf(false);
    return list.map((m, i) => ({ ...m, done: dn[i], cur: i === curI }));
  }
  const curMicro = (list) => list.find((m) => m.cur) || null;
  const currentMicro = (state) => curMicro(microList(state, FP.contextEngine.collectStatus(state), current(state)));
  /** Ruta a la que conviene pasar cuando ya hay datos (B/C → más completa). Respeta «No por ahora». */
  function upgradeFor(state, status) {
    const t = state.ux.tour; const h = has(status);
    let to = null;
    if (pathNow === 'B' && h.actual) to = 'A';
    else if (pathNow === 'C') to = h.actual ? 'A' : h.historical ? 'B' : null;
    return to && t.upDismissed !== `${pathNow}>${to}` ? to : null;
  }
  /** Marca un micro-paso manual («Ya revisé…», o hecho en pantalla sin estado: calcular/escribir meta). */
  function mark(state, fullKey, soft) {
    const t = state.ux.tour; t.micro = { ...(t.micro || {}), [fullKey]: true };
    if (soft && t.active) render(state);
  }

  /** Dónde avanzar (lo llama render()): paso de acción con su dato listo, paso de micro-pasos terminado, o cambio de micro-paso dentro del mismo paso. */
  function syncTarget(state, status) {
    const t = state.ux.tour; setPath(t.path);
    if (!t.active || t.ended) return null;
    const s = current(state);
    if (!s) return null;
    const i = steps().indexOf(s);
    const adv = () => { const n = nextIdx(state, status, i); return n < 0 ? null : { idx: n, flash: `${s.done} Siguiente: ${steps()[n].title}.` }; };
    const ml = microList(state, status, s);
    if (s.kind === 'action' && done(state, status, s)) return adv();
    if (s.kind === 'micro' && ml.length && ml.every((m) => m.done)) return adv();
    const cm = curMicro(ml);
    const k = cm ? `${s.id}.${cm.key}` : '';
    if (cm && t.lastMicro !== k) {
      const prev = t.lastMicro && t.lastMicro.startsWith(`${s.id}.`) ? t.lastMicroTitle : '';
      return { stay: true, record: { key: k, title: cm.title }, flash: prev ? `Hecho: ${prev}.` : '' };
    }
    return null;
  }

  function summaryRows(state, status) {
    const t = state.ux.tour; const sk = t.skipped || {}; const h = has(status);
    const row = (id) => {
      const s = steps()[idxOf(id)];
      const ok = h[s.detect];
      return { id, name: s.title, status: ok ? 'Hecho' : sk[id] ? 'Omitido' : 'Pendiente', tone: ok ? 'ok' : sk[id] ? 'skip' : 'pend', resume: !ok };
    };
    const rows = ['datos', 'real', 'meta'].filter((id) => idxOf(id) >= 0).map(row);
    rows.push({ id: 'meta', name: pathNow === 'A' ? 'Plan, pacing, forecast, diagnóstico, recuperación y medición' : 'Plan y siguientes pasos', status: t.ended === 'fin' ? 'Revisado' : 'Pendiente', tone: t.ended === 'fin' ? 'ok' : 'pend', resume: t.ended !== 'fin' });
    return rows;
  }

  let lastScrollKey = '';
  /** Resalta la zona del paso (contorno suave) y, con la acción ya pulsada, la del micro-paso con «Es aquí». */
  function highlight(state, s, here, quiet) {
    const status = FP.contextEngine.collectStatus(state);
    const cm = curMicro(microList(state, status, s));
    const sel = here && cm ? cm.target : s.target;
    const target = sel ? document.querySelector(sel) : null;
    if (!target || state.view !== s.view) return;
    const mode = here && cm ? cm.box : 'panel';
    const box = mode === 'self' ? target : mode === 'row' ? (target.closest('.btn-row') || target) : (target.closest('section.panel') || target);
    box.classList.add('tour-target');
    if (here) box.classList.add('tour-target--here');
    const key = `${s.id}:${cm ? cm.key : ''}:${here}`;   // se desplaza solo al activar el paso, el micro-paso o la acción; no en cada re-dibujo (escribir en un campo)
    if (box.scrollIntoView && !quiet && key !== lastScrollKey) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    lastScrollKey = key;
  }

  function render(state) {
    setPath(state.ux.tour.path);
    const bar = $('tour-bar');
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target', 'tour-target--here'));
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
      if ((s.kind === 'action' || s.kind === 'micro') && t.went && !t.ended) highlight(state, s, true, false);
      bar.innerHTML = `<button type="button" class="btn btn--primary tour-pill" data-action="tour-expand">${t.ended ? 'Ver resumen del recorrido' : t.went && (s.kind === 'action' || s.kind === 'micro') ? `Recorrido en espera · paso ${i + 1} de ${n} · Abrir` : `Retomar recorrido · paso ${i + 1} de ${n}`}</button>`;
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
    const upTo = upgradeFor(state, status);
    const head = `<div class="tour-bar__dots" role="img" aria-label="Progreso del recorrido">${dots}</div><button type="button" class="tour-link" data-action="tour-change-path">Ruta: ${esc(PATHS[pathNow])} · Cambiar</button>`;
    const upBox = upTo ? `<div class="tour-up" role="status"><p>${upTo === 'B' ? 'Ya cargaste histórico.' : 'Ya cargaste venta real.'} ¿Pasamos al recorrido ${upTo === 'A' ? 'completo' : 'de «Solo histórico»'}?</p><div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="tour-path-up" data-path="${upTo}">Sí, pasar</button><button type="button" class="btn btn--small" data-action="tour-up-dismiss" data-key="${pathNow}>${upTo}">No por ahora</button></div></div>` : '';
    const ctl = `<span class="tour-bar__ctl"><button type="button" class="tour-link" data-action="tour-pause">Pausar</button><button type="button" class="tour-link" data-action="tour-exit">Salir (se guarda el paso)</button></span>`;

    if (t.ended) {
      const rows = summaryRows(state, status).map((r) => `<li class="tour-sum__row"><span class="tour-chip tour-chip--${r.tone}">${r.status}</span><span>${esc(r.name)}</span>${r.resume ? `<button type="button" class="btn btn--small" data-action="tour-resume" data-step="${r.id}">Retomar</button>` : ''}</li>`).join('');
      bar.innerHTML = `<div class="tour-bar__inner" role="region" aria-label="Recorrido guiado">
        <div class="tour-bar__row">${head}</div>
        <h3 class="tour-bar__title">${t.ended === 'nometa' ? 'Recorrido en pausa: falta tu meta' : 'Recorrido terminado'}</h3>
        <p class="tour-bar__txt">${t.ended === 'nometa' ? 'Sin meta no hay plan, pacing ni forecast. Cuando la tengas, retoma desde aquí; lo ya hecho se conserva.' : pathNow === 'A' ? 'Esto quedó hecho y esto quedó pendiente. Puedes retomar cualquier punto cuando quieras.' : pathNow === 'B' ? 'Siguiente: carga tu venta real. Al detectarla te propongo pasar al recorrido completo.' : 'Pacing, forecast y diagnóstico se activan al cargar venta real. Cuando detecte datos te propongo pasar al recorrido completo.'}</p>
        ${upBox}
        <ul class="tour-sum">${rows}</ul>
        <div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="tour-close">Cerrar recorrido</button>${ctl}</div>
      </div>`;
      return;
    }

    // Viaja con el recorrido (Fase 9.1): mismo cálculo que Inicio, no un progreso distinto.
    const ready = FP.contextEngine.dataReadiness(status);
    const note = noteFor(state, status, s);
    const action = s.kind === 'action';
    const ml = microList(state, status, s); const cm = curMicro(ml);
    const away = state.view !== s.view;
    const guided = action || s.kind === 'micro';
    // Tarjeta compacta (Fase 12): en micro-pasos de lectura/revisión, «Mostrarme dónde» NO cierra la tarjeta; se queda hasta «Ya lo vi» o «Siguiente».
    if (t.compact && t.went && cm && cm.manual && !away) {
      bar.innerHTML = `
      <div class="tour-bar__inner tour-bar__inner--compact" role="region" aria-label="Recorrido guiado">
        <span class="tour-bar__step">Paso ${i + 1} de ${n} · ${esc(s.title)}</span>
        ${t.flash ? `<p class="tour-flash" role="status">${esc(t.flash)}</p>` : ''}
        <p class="tour-compact__txt"><b>${esc(cm.title)}.</b> ${esc(cm.desc)}</p>
        <div class="btn-row">
          <button type="button" class="btn btn--small btn--primary" data-action="tour-micro-done" data-key="${esc(s.id + '.' + cm.key)}">Ya lo vi</button>
          <button type="button" class="btn btn--small" data-action="tour-micro-done" data-key="${esc(s.id + '.' + cm.key)}">Siguiente</button>
          <button type="button" class="tour-link" data-action="tour-compact-off">Ver paso completo</button>
        </div>
        <p class="tour-compact__hint">Esta tarjeta no se cierra sola: se queda hasta que pulses una de las dos.</p>
        ${ctl}
      </div>`;
      highlight(state, s, true, false);
      return;
    }
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
        ${upBox}
        ${t.flash ? `<p class="tour-flash" role="status">${esc(t.flash)}</p>` : ''}
        ${i === 0 ? '<p class="tour-bar__note">Este recorrido enseña el orden completo de la metodología, siempre empezando por los datos. Tu avance real con tus propios datos viaja arriba a la derecha, y el detalle completo está en Inicio.</p>' : ''}
        <dl class="tour-bar__body">
          <div><dt>Qué estamos viendo</dt><dd>${esc(s.what)}</dd></div>
          <div><dt>Por qué importa</dt><dd>${esc(s.why)}</dd></div>
        </dl>
        ${note ? `<p class="tour-cond">${esc(note)}</p>` : ''}
        ${ml.length ? `<p class="tour-micro__n">Micro-paso ${ml.indexOf(cm) + 1} de ${ml.length}</p>
        <ol class="tour-micro">${ml.map((m) => `<li class="tour-micro__li${m.done ? ' is-done' : ''}${m.cur ? ' is-cur' : ''}"><span class="tour-micro__dot" aria-hidden="true">${m.done ? '<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 6.5l2.6 2.6L10 3.5"/></svg>' : ''}</span>
          <span class="tour-micro__t"><b>${esc(m.title)}${m.done ? ' (hecho)' : ''}</b>${m.cur ? `<span class="tour-micro__d">${esc(m.desc)}</span>` : ''}</span></li>`).join('')}</ol>` : ''}
        ${away && guided ? `<p class="tour-cond tour-cond--info">Estás en otra pantalla. Tu avance se conserva (${ml.filter((m) => m.done).length} de ${ml.length || 0}).</p>` : ''}
        ${action && t.went && !ml.length ? `<p class="tour-wait"><span aria-hidden="true"></span>${esc(s.waiting)}</p>` : ''}
        <details class="tour-more"><summary>Qué buscar y qué sigue</summary>
          <dl class="tour-bar__body"><div><dt>Qué buscar</dt><dd>${esc(s.lookFor)}</dd></div><div><dt>Qué sigue</dt><dd>${esc(s.next)}</dd></div></dl>
        </details>
        <div class="btn-row">
          ${guided ? `<button type="button" class="btn btn--small btn--primary" data-action="tour-cta">${esc(away ? (s.cta || 'Ir a la pantalla') : 'Mostrarme dónde')}</button>
            ${cm && cm.manual && !away ? `<button type="button" class="btn btn--small" data-action="tour-micro-done" data-key="${esc(s.id + '.' + cm.key)}">${esc(cm.manual)}</button>` : ''}
            ${action ? `<button type="button" class="btn btn--small" data-action="tour-skip">${esc(pathNow === 'B' && s.skipLabelB ? s.skipLabelB : s.skipLabel)}</button>` : `<button type="button" class="btn btn--small btn--ghost" data-action="tour-next">Siguiente</button>`}`
        : `<button type="button" class="btn btn--small btn--primary" data-action="tour-next">${i === n - 1 ? 'Terminar' : 'Siguiente'}</button>`}
          <button type="button" class="btn btn--small btn--ghost" data-action="tour-prev" ${i === 0 ? 'disabled' : ''}>Atrás</button>
          ${ctl}
        </div>
      </div>`;
    highlight(state, s, guided && t.went, guided && !t.went);
  }

  FP.tour = { steps, current, render, syncTarget, nextIdx, noteFor, has, idxOf, summaryRows, microList, mark, setPath, currentMicro, upgradeFor, PATHS };
})(typeof window !== 'undefined' ? window : globalThis);
