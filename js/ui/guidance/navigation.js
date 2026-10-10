/**
 * navigation.js — Navegación agrupada, migas, barra de contexto y filtros persistentes (Fase 7).
 *
 * Grupos: Inicio · Planear · Monitorear · Diagnosticar · Recuperar · Medir y aprender (+ Ayuda).
 * Las vistas existentes no cambian: la navegación solo apunta a ellas (#carga, #pacing, …).
 *
 * Contexto persistente { channel, periodType, periodKey, comparison }: al salir de una vista se lee
 * de sus filtros (extractContext) y al entrar a otra se aplica si es compatible (applyContext).
 * Si una vista no admite algo (p. ej. "día" en el diagnóstico) se ajusta y se EXPLICA en la barra.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const term = (s) => (FP.explain ? FP.explain.term(s) : s);
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const groupOf = (view) => (G().VIEWS[view] ? G().VIEWS[view].group : null);

  /* ---------- Contexto persistente ---------- */

  function extractContext(view, state) {
    const c = { ...state.ux.ctx };
    // Narrativa y Paquete trabajan sobre la misma selección que Diagnóstico (periodo y canal se pueden cambiar en ellas)
    if (view === 'diagnostico' || view === 'narrativa' || view === 'paquete' || view === 'segmentos') Object.assign(c, pick(state.dx.settings, ['channel', 'periodType', 'periodKey', 'comparison']));
    else if (view === 'recovery' && !state.rc.imported) Object.assign(c, pick(state.rc.settings, ['channel', 'periodType', 'periodKey', 'comparison']));
    else if (view === 'pacing') { c.channel = state.fc.channel; if (state.fc.month && state.fc.period !== 'months') { c.periodType = 'month'; c.periodKey = state.fc.month; } }
    else if (view === 'reforecast') { c.channel = state.rf.channel; if (state.rf.month && state.rf.period !== 'months') { c.periodType = 'month'; c.periodKey = state.rf.month; } }
    else if (view === 'inicio') Object.assign(c, { channel: state.ux.home.channel, periodType: state.ux.home.periodType, periodKey: state.ux.home.periodKey || c.periodKey });
    return c;
  }

  function pick(o, keys) { const r = {}; keys.forEach((k) => { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; }); return r; }

  /**
   * Aplica el contexto a la vista de destino. Devuelve una nota si algo tuvo que ajustarse
   * (nunca se cambia en silencio).
   */
  function applyContext(view, state) {
    const c = state.ux.ctx;
    const notes = [];
    const monthKey = c.periodType === 'month' ? c.periodKey : c.periodType === 'day' && c.periodKey ? c.periodKey.slice(0, 7)
      : c.periodType === 'range' && c.periodKey ? c.periodKey.slice(0, 7) : null;
    if (view === 'diagnostico' || view === 'narrativa' || view === 'paquete' || view === 'segmentos') {
      const s = state.dx.settings;
      const before = JSON.stringify([s.channel, s.periodType, s.periodKey, s.comparison]);
      s.channel = c.channel || s.channel;
      if (['month', 'week', 'year'].includes(c.periodType)) { s.periodType = c.periodType; s.periodKey = c.periodKey; }
      else if (monthKey) { s.periodType = 'month'; s.periodKey = monthKey; notes.push('El diagnóstico trabaja por mes, semana o año: se muestra el mes del periodo elegido.'); }
      if (c.comparison) s.comparison = c.comparison;
      // solo se recalcula si la selección cambió (entrar a la vista sin cambiar nada no rehace el diagnóstico ni la narrativa)
      if (JSON.stringify([s.channel, s.periodType, s.periodKey, s.comparison]) !== before) state.dx.run = null;
    } else if (view === 'recovery' && !state.rc.imported) {
      const s = state.rc.settings;
      s.channel = c.channel || s.channel;
      if (c.periodType && c.periodType !== 'range') { s.periodType = c.periodType; s.periodKey = c.periodKey; }
      if (c.comparison) s.comparison = c.comparison;
    } else if (view === 'pacing') {
      state.fc.channel = c.channel || 'total'; state.fc.tableChannel = c.channel || 'total';
      if (monthKey) state.fc.month = monthKey;
      if (c.periodType === 'week' || c.periodType === 'day') notes.push('Pacing muestra el año completo; las tablas por periodo se abren en el mes elegido.');
    } else if (view === 'reforecast') {
      state.rf.channel = c.channel || 'total'; state.rf.tableChannel = c.channel || 'total';
      if (monthKey) state.rf.month = monthKey;
    } else if (view === 'producto' && state.pa) {
      state.pa.channel = c.channel || state.pa.channel || 'total';
      state.pa.result = null;
      if (c.periodType === 'range' || c.periodType === 'week' || c.periodType === 'year') notes.push('Categoría → Producto usa un rango de fechas: se toma el mes del periodo elegido o el último mes con datos.');
    } else if (view === 'inicio') {
      state.ux.home.channel = c.channel || 'total';
      if (c.periodType === 'year' || c.periodType === 'month') { state.ux.home.periodType = c.periodType; state.ux.home.periodKey = c.periodKey; }
      else if (monthKey) { state.ux.home.periodType = 'month'; state.ux.home.periodKey = monthKey; notes.push('Inicio resume por año o mes: se muestra el mes del periodo elegido.'); }
    }
    return notes.join(' ');
  }

  function contextLabel(c) {
    const ch = c.channel && c.channel !== 'total' ? FP.dataModel.getChannel(c.channel).label : 'Total digital';
    let per = '';
    if (c.periodType === 'year') per = `Año ${c.periodKey || ''}`;
    else if (c.periodType === 'month' && c.periodKey) per = `${MONTHS[+c.periodKey.slice(5, 7) - 1]} ${c.periodKey.slice(0, 4)}`;
    else if (c.periodKey) per = c.periodKey;
    const cmp = c.comparison && FP.config.diagnostics.comparisons[c.comparison] ? FP.config.diagnostics.comparisons[c.comparison].label : null;
    return [ch, per, cmp].filter(Boolean).join(' · ');
  }

  /* ---------- Navegación ---------- */

  // Iconos (trazos simples, un solo estilo). Solo presentación.
  const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    inicio: I('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'),
    negocio: I('<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5h6v3"/>'),
    carga: I('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
    calidad: I('<path d="M5 12l4 4 10-10"/>'),
    datos: I('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>'),
    resumen: I('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
    estacionalidad: I('<path d="M3 15c3-8 5-8 9 0s6 8 9 0"/>'),
    plan: I('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    configuracion: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
    pacing: I('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
    reforecast: I('<path d="M4 18l5-6 4 3 7-9"/><path d="M16 6h4v4"/>'),
    diagnostico: I('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    producto: I('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
    analisis: I('<path d="M4 18V8M10 18V5M16 18v-9M22 18H2"/><path d="M4 5l6-2 6 3 6-4"/>'),
    recovery: I('<path d="M4 12a8 8 0 108-8"/><path d="M4 4v5h5"/>'),
    medir: I('<path d="M5 20V10M12 20V4M19 20v-6"/>'),
    narrativa: I('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'),
    proyeccion: I('<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>'),
    segmentos: I('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'),
    paquete: I('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
    ajustes: I('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    ayuda: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17.5v.01"/>')
  };

  /**
   * Menú por secciones (revisión de uso): un solo grupo abierto a la vez.
   *  · Elegir OTRA sección abre su primera página y cierra las demás (queda abierta solo la de la página en la que estás).
   *  · Tocar la sección en la que ya estás la pliega o despliega, sin cambiar de página.
   * El estado abierto/cerrado vive solo en esta sesión (no se guarda).
   */
  const navOpen = {};       // estado efectivo de cada grupo (abierto/cerrado)
  let navLastView = null;
  let navKeepDrawer = false;   // en móvil, al elegir una sección el panel se queda abierto para ver sus opciones
  const CHEV = '<svg class="snav__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  /** Primera página de una sección: la primera vista de su lista (la que se abre al elegir la sección). */
  const firstView = (id) => { const g = G().GROUPS.find((x) => x.id === id); return g ? g.views[0] : null; };

  function toggleGroup(id) {
    const curGroup = groupOf(document.body.dataset.view);
    if (id !== curGroup) {
      const first = firstView(id);
      if (!first) return;
      navKeepDrawer = true;                                   // móvil: el panel no se cierra al elegir la sección
      root.location.hash = '#' + first;                       // el enrutado abre la página; renderNav deja abierta solo esta sección
      return;
    }
    // misma sección: plegar / desplegar sin navegar (conserva el foco del botón)
    const btn = document.querySelector(`.snav__toggle[data-value="${id}"]`);
    if (!btn) return;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    navOpen[id] = open;
    btn.setAttribute('aria-expanded', String(open));
    const box = document.getElementById(btn.getAttribute('aria-controls'));
    if (box) box.hidden = !open;
  }

  /** Sidebar agrupada. Misma arquitectura funcional (GROUPS/VIEWS); ahora con grupos plegables. */
  function renderNav(state) {
    const esc = H().esc;
    const cur = state.view;
    const groups = G().GROUPS;
    const item = (v, label) => `<a href="#${v}" data-nav="${v}" class="snav__item" ${v === cur ? 'aria-current="page"' : ''}>${ICONS[v] || ''}<span>${esc(label)}</span></a>`;
    const learner = state.ux.mode === 'learner';
    // el grupo de la vista actual se abre al entrar a ella; el resto conserva lo que el usuario dejó
    const curGroup = groupOf(cur);
    // al cambiar de vista queda abierta únicamente la sección de la vista actual; las demás se cierran
    if (cur !== navLastView) { groups.forEach((g) => { navOpen[g.id] = g.id === curGroup; }); navLastView = cur; }
    const foldable = (g) => g.views.length > 1 || g.id !== 'inicio';
    $('app-nav').innerHTML = `
      ${groups.map((g) => {
        if (!foldable(g)) return `<div class="snav__group" role="group" aria-label="${esc(g.label)}">${g.views.map((v) => item(v, G().VIEWS[v].title)).join('')}</div>`;
        const open = !!navOpen[g.id];
        return `<div class="snav__group snav__group--foldable" role="group" aria-label="${esc(g.label)}">
        <button type="button" class="snav__toggle" data-action="nav-group" data-value="${esc(g.id)}" aria-expanded="${open}" aria-controls="snav-g-${esc(g.id)}"><span>${esc(g.label)}</span>${CHEV}</button>
        <div class="snav__items" id="snav-g-${esc(g.id)}" ${open ? '' : 'hidden'}>${g.views.map((v) => item(v, G().VIEWS[v].title)).join('')}</div></div>`;
      }).join('')}
      <div class="snav__foot">
        <div class="snav__mode"><span id="snav-mode-l">Modo Aprendiz</span>
          <button type="button" class="switch" role="switch" aria-checked="${learner}" aria-labelledby="snav-mode-l"
            data-action="ux-mode" data-value="${learner ? 'analyst' : 'learner'}"></button></div>
        <a href="#ajustes" data-nav="ajustes" class="snav__item" ${cur === 'ajustes' ? 'aria-current="page"' : ''}>${ICONS.ajustes}<span>Configuración de RevNavigator</span></a>
        <a href="#ayuda" data-nav="ayuda" class="snav__item snav__help" ${cur === 'ayuda' ? 'aria-current="page"' : ''}>${ICONS.ayuda}<span>¿Cómo funciona?</span></a>
      </div>`;
    if (!navKeepDrawer) document.body.classList.remove('nav-open');
    navKeepDrawer = false;
    document.body.dataset.view = cur;
  }

  function renderContextBar(state, status) {
    const esc = H().esc;
    const view = state.view;
    const d = FP.contextEngine.describe(view, status);
    const crumbs = FP.contextEngine.breadcrumbs(view);
    const extra = state.ux.crumbExtra && state.ux.crumbExtra[view] ? state.ux.crumbExtra[view] : [];
    const v = G().VIEWS[view] || {};
    const next = d.nextStep;
    const q = status.data.quality;
    // I-final: misma información y los mismos controles, en el orden en que se leen (migas y acciones → qué veo y qué hago → siguiente paso → contexto y calidad).
    // El orden del DOM coincide con el visual, así que el orden de tabulación no salta.
    const showNext = next.view !== view && view !== 'inicio';   // en Inicio el siguiente paso vive en su propia tarjeta
    $('ux-context').innerHTML = `
      <div class="ux-context__inner${showNext ? '' : ' ux-context__inner--solo'}">
        <div class="ux-context__top">
          <nav aria-label="Ruta" class="breadcrumbs"><ol>${[...crumbs, ...extra].map((c, i, arr) => {
            const target = i === 0 ? 'inicio' : i === 1 && G().GROUPS.find((g) => g.label === c) ? (state.ux.lastByGroup[G().GROUPS.find((g) => g.label === c).id] || G().GROUPS.find((g) => g.label === c).views[0]) : null;
            return `<li>${target && i < arr.length - 1 ? `<a href="#${target}">${esc(c)}</a>` : `<span ${i === arr.length - 1 ? 'aria-current="location"' : ''}>${esc(c)}</span>`}</li>`;
          }).join('')}</ol></nav>
          <div class="ux-context__actions btn-row">
            ${(v.help || []).length ? `<button type="button" class="btn btn--small" data-action="help-section">Ayuda de esta sección</button>` : ''}
            <button type="button" class="btn btn--small" data-action="glossary">Glosario</button>
            <button type="button" class="btn btn--small" data-action="tour-start">${state.ux.tour.step ? `Retomar recorrido (${state.ux.tour.step + 1}/${G().TOUR.length})` : 'Recorrido guiado'}</button>
          </div>
        </div>
        <div class="ux-context__text">
          <p class="ux-context__purpose">${esc(term(d.whatAmISeeing))}${d.whatDoesItMean ? ` <strong>${esc(d.whatDoesItMean)}</strong>` : ''}</p>
          ${d.whatToDo ? `<p class="ux-context__action">${esc(term(d.whatToDo))}</p>` : ''}
        </div>
        ${next.view !== view ? `<div class="next-step"><span class="next-step__label">Siguiente paso</span>
          <strong>${esc(next.label)}</strong><span class="cell-sub">${esc(next.reason)}</span>
          <button type="button" class="btn btn--primary btn--small" data-action="go" data-view="${next.view}">Ir</button></div>` : ''}
        ${['inicio', 'pacing', 'reforecast', 'diagnostico', 'recovery'].includes(view) || q === 'invalid' || q === 'warnings' ? `<div class="ux-context__meta">
          ${['inicio', 'pacing', 'reforecast', 'diagnostico', 'recovery'].includes(view) ? `<p class="ux-context__chips">Contexto: <span class="chip">${esc(contextLabel(state.ux.ctx))}</span>
            ${state.ux.ctxNote ? `<span class="ux-context__note">${esc(state.ux.ctxNote)}</span>` : ''}</p>` : ''}
          ${q === 'invalid' || q === 'warnings' ? `<p class="ux-context__warn" data-quality="${q}" role="status">
            Algunos cálculos pueden estar incompletos. <a href="#calidad">Revisar calidad de datos</a></p>` : ''}
        </div>` : ''}
      </div>
      ${state.ux.mode === 'learner' ? FP.help.learningBar(view, next, status) : ''}
      ${state.ux.mode === 'learner' && state.ux.lesson ? FP.help.lessonCard(state.ux.lesson) : ''}`;
  }

  /** Marca los bloques técnicos (una vez). Sin efecto visible desde que se retiró el modo Ejecutivo. */
  function markAnalystBlocks() {
    G().ANALYST_ONLY.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const target = el.closest('section.panel') || el;
      target.setAttribute('data-analyst', '');
    });
  }

  function applyMode(state) {
    document.body.classList.toggle('mode-learner', state.ux.mode === 'learner');
    document.querySelectorAll('.mode-note').forEach((n) => n.remove());
  }

  FP.navigation = { groupOf, extractContext, applyContext, contextLabel, renderNav, toggleGroup, renderContextBar, markAnalystBlocks, applyMode };
})(typeof window !== 'undefined' ? window : globalThis);
