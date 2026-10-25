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
    if (view === 'diagnostico' || view === 'narrativa' || view === 'presentacion' || view === 'segmentos') Object.assign(c, pick(state.dx.settings, ['channel', 'periodType', 'periodKey', 'comparison']));
    else if (view === 'recovery' && !state.rc.imported) Object.assign(c, pick(state.rc.settings, ['channel', 'periodType', 'periodKey', 'comparison']));
    else if (view === 'pacing') { c.channel = state.fc.channel; if (state.fc.month && state.fc.period !== 'months') { c.periodType = 'month'; c.periodKey = state.fc.month; } }
    else if (view === 'reforecast') { c.channel = state.rf.channel; if (state.rf.month && state.rf.period !== 'months') { c.periodType = 'month'; c.periodKey = state.rf.month; } }
    else if (view === 'inicio') {
      // Con el periodo siguiendo a la fecha (sin fijar) Inicio no lo comparte con las demás vistas: cada una conserva su propio mes por defecto.
      if (state.ux.home.follow === false) Object.assign(c, { channel: state.ux.home.channel, periodType: state.ux.home.periodType, periodKey: state.ux.home.periodKey || c.periodKey });
      else { c.channel = state.ux.home.channel; c.periodType = 'month'; c.periodKey = null; }
    }
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
    if (view === 'diagnostico' || view === 'narrativa' || view === 'presentacion' || view === 'segmentos') {
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
      if ((c.periodType === 'year' || c.periodType === 'month') && c.periodKey) {
        // solo se fija el periodo si el contexto trae uno explícito y distinto del que Inicio ya sigue con la fecha
        if (state.ux.home.follow === false || c.periodType === 'year' || c.periodKey !== state.ux.home.periodKey) state.ux.home.follow = false;
        state.ux.home.periodType = c.periodType; state.ux.home.periodKey = c.periodKey;
      } else if (c.periodType === 'year' || c.periodType === 'month') { /* sin periodo explícito: Inicio conserva el suyo */ }
      else if (monthKey) { state.ux.home.periodType = 'month'; state.ux.home.periodKey = monthKey; state.ux.home.follow = false; notes.push('Inicio resume por año o mes: se muestra el mes del periodo elegido.'); }
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

  /** Versión corta del contexto para el chip junto al título (meses de 3 letras, «vs Plan»); el texto completo va en title/aria-label. */
  function contextLabelShort(c) {
    const ch = c.channel && c.channel !== 'total' ? FP.dataModel.getChannel(c.channel).label : 'Total digital';
    let per = '';
    if (c.periodType === 'year') per = `Año ${c.periodKey || ''}`;
    else if (c.periodType === 'month' && c.periodKey) per = `${MONTHS[+c.periodKey.slice(5, 7) - 1].slice(0, 3)} ${c.periodKey.slice(0, 4)}`;
    else if (c.periodKey) per = c.periodKey;
    const full = c.comparison && FP.config.diagnostics.comparisons[c.comparison] ? FP.config.diagnostics.comparisons[c.comparison].label : null;
    const cmp = full ? full.replace(/^Actual vs /, 'vs ').replace(/^Forecast vs /, 'Forecast vs ') : null;
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
    clientes: I('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 010 6M18 14c2 .6 3 2.5 3 6"/>'),
    cambios: I('<path d="M4 12h4l2-6 4 12 2-6h4"/>'),
    promociones: I('<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1.2"/>'),
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
    presentacion: I('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
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
  let uxMoreOpen = false;      // móvil: el bloque «Qué hay aquí / Qué hago» llega plegado para ver primero los datos
  const toggleMore = () => { uxMoreOpen = !uxMoreOpen; const m = document.getElementById('ux-more'), b = document.querySelector('.ux-head__morebtn'); if (m) m.dataset.open = String(uxMoreOpen); if (b) b.setAttribute('aria-expanded', String(uxMoreOpen)); };
  let navKeepDrawer = false;   // en móvil, al elegir una sección el panel se queda abierto para ver sus opciones
  const CHEV = '<svg class="snav__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  /** Primera página de una sección: la primera vista de su lista (la que se abre al elegir la sección). */
  const firstView = (id) => { const g = G().GROUPS.find((x) => x.id === id); return g ? g.views[0] : null; };

  const isMobileNav = () => !!(root.matchMedia && root.matchMedia('(max-width: 860px)').matches);

  /** Abre o cierra el panel lateral (solo móvil) manteniendo botón, foco y lectores de pantalla sincronizados. */
  function setDrawer(open, { focus = true } = {}) {
    document.body.classList.toggle('nav-open', !!open);
    const t = document.querySelector('.menu-toggle');
    if (t) { t.setAttribute('aria-expanded', String(!!open)); t.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); }
    if (!focus) return;
    if (open) { const a = document.querySelector('#app-nav [aria-current="page"]') || document.querySelector('#app-nav .snav__toggle, #app-nav .snav__item'); if (a) a.focus({ preventScroll: true }); }
    else if (t) t.focus({ preventScroll: true });
  }

  function toggleGroup(id) {
    if (isMobileNav()) {
      // móvil: la sección solo se despliega (una a la vez); la página cambia y el panel se cierra al elegir una página
      const btn = document.querySelector(`.snav__toggle[data-value="${id}"]`); if (!btn) return;
      const open = btn.getAttribute('aria-expanded') !== 'true';
      document.querySelectorAll('.snav__toggle').forEach((b) => {
        const on = b === btn && open; navOpen[b.dataset.value] = on;
        b.setAttribute('aria-expanded', String(on));
        const box = document.getElementById(b.getAttribute('aria-controls')); if (box) box.hidden = !on;
      });
      return;
    }
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
        <button type="button" class="snav__toggle" data-action="nav-group" data-value="${esc(g.id)}" aria-expanded="${open}" aria-controls="snav-g-${esc(g.id)}"><span class="snav__tl"><span>${esc(g.label)}</span>${g.question ? `<span class="snav__q">${esc(g.question)}</span>` : ''}</span>${CHEV}</button>
        <div class="snav__items" id="snav-g-${esc(g.id)}" ${open ? '' : 'hidden'}>${g.views.map((v) => item(v, G().VIEWS[v].title)).join('')}</div></div>`;
      }).join('')}
      <div class="snav__foot">
        <div class="snav__pills" id="snav-pills" role="group" aria-label="Estado de la herramienta"></div>
        <div class="snav__mode"><span id="snav-mode-l">Modo Aprendiz</span>
          <button type="button" class="switch" role="switch" aria-checked="${learner}" aria-labelledby="snav-mode-l"
            data-action="ux-mode" data-value="${learner ? 'analyst' : 'learner'}"></button></div>
        <a href="#ajustes" data-nav="ajustes" class="snav__item" ${cur === 'ajustes' ? 'aria-current="page"' : ''}>${ICONS.ajustes}<span>Configuración de RevNavigator</span></a>
        <a href="#ayuda" data-nav="ayuda" class="snav__item snav__help" ${cur === 'ayuda' ? 'aria-current="page"' : ''}>${ICONS.ayuda}<span>¿Cómo funciona?</span></a>
      </div>`;
    if (!navKeepDrawer) setDrawer(false, { focus: false });
    navKeepDrawer = false;
    document.body.dataset.view = cur;
  }

  /** Fase 2 · el menú conoce la ruta activa: marca la vista del paso actual («Paso N de M») y la del siguiente («Sigue: paso N+1»). Solo añade marcas; no rehace el menú. */
  function markRoute(state) {
    const nav = $('app-nav'); if (!nav) return;
    nav.querySelectorAll('.snav__hint').forEach((e) => e.remove());
    nav.querySelectorAll('[data-route-hint]').forEach((e) => e.removeAttribute('data-route-hint'));
    const o = state.ux && state.ux.origin; if (!o || !o.chain || !o.chain.length) return;
    const i = o.chain.findIndex((c) => c.id === o.step); if (i < 0) return;
    const put = (view, text) => {
      const a = nav.querySelector(`.snav__item[data-nav="${view}"]`); if (!a || a.querySelector('.snav__hint')) return;
      a.insertAdjacentHTML('beforeend', `<span class="snav__hint">${text}</span>`);
      const grp = a.closest('.snav__group'), t = grp && grp.querySelector('.snav__toggle'); if (t) t.setAttribute('data-route-hint', '1');
    };
    put(o.view, `Paso ${i + 1} de ${o.chain.length}`);
    const nx = o.chain[i + 1]; if (nx && nx.view !== o.view && nx.view !== 'inicio') put(nx.view, `Sigue: paso ${i + 2}`);
  }

  /* ---------- Encabezado homologado de cada pantalla ----------
     Mismo orden en las 21 vistas: ceja (grupo · pregunta) → título (nombre del menú) + frase de estado → «Qué hay aquí» → «Qué hago aquí» →
     «Detalle» (el título y la descripción propios de la pantalla, sin perder texto) → contexto → aviso de calidad. El siguiente paso va al final de la página. */
  const CTX_VIEWS = ['inicio', 'pacing', 'reforecast', 'diagnostico', 'recovery'];
  const NO_NEXT = ['inicio', 'ayuda', 'ajustes', 'negocio'];         // Inicio ya trae «¿Qué hago hoy?»; Ayuda y Configuración no son parte del recorrido
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, ' ').trim();
  let learnOpenView = null, lastCtxView = null, helpOpen = false;

  function renderHelpMenu(state) {
    const el = $('topbar-help'); if (!el) return;
    const v = G().VIEWS[state.view] || {};
    const tour = state.ux.tour.step ? `Retomar recorrido (${state.ux.tour.step + 1}/${FP.tour.steps().length})` : 'Recorrido guiado';
    el.innerHTML = `<div class="hmenu">
      <button type="button" class="hmenu__btn" id="help-menu-btn" data-action="help-menu" aria-haspopup="menu" aria-expanded="${helpOpen}" aria-controls="help-menu" aria-label="Ayuda"><span class="hmenu__txt">Ayuda</span><span class="hmenu__q" aria-hidden="true">?</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="hmenu__list" id="help-menu" role="menu" aria-labelledby="help-menu-btn" ${helpOpen ? '' : 'hidden'}>
        ${(v.help || []).length ? '<button type="button" role="menuitem" class="hmenu__item" data-action="help-section">Ayuda de esta sección</button>' : ''}
        <button type="button" role="menuitem" class="hmenu__item" data-action="glossary">Glosario</button>
        <button type="button" role="menuitem" class="hmenu__item" data-action="tour-start">${esc2(tour)}</button>
      </div></div>`;
  }
  const esc2 = (x) => H().esc(x);

  /* Menú de cuenta (avatar): quién está en sesión, equipo y cerrar sesión. */
  let acctOpen = false;
  function renderAccountMenu(state) {
    const el = $('topbar-account'); if (!el) return;
    const ses = state.cloud && state.cloud.session;
    const initials = ses && ses.email ? String(ses.email).replace(/@.*/, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'RN' : 'RN';
    el.innerHTML = `<div class="hmenu hmenu--acct">
      <button type="button" class="avatar avatar--btn" id="acct-menu-btn" data-action="acct-menu" aria-haspopup="menu" aria-expanded="${acctOpen}" aria-controls="acct-menu" aria-label="Cuenta${ses && ses.email ? `: ${esc2(ses.email)}` : ''}" title="${ses ? esc2(ses.email || 'Sesión iniciada') : 'Sin sesión iniciada'}">${esc2(initials)}</button>
      <div class="hmenu__list" id="acct-menu" role="menu" aria-labelledby="acct-menu-btn" ${acctOpen ? '' : 'hidden'}>
        <p class="hmenu__who">${ses ? `<strong>${esc2(ses.email || 'Sesión iniciada')}</strong><span class="cell-sub">Equipo: ${esc2(ses.teamName || '—')}</span>` : '<strong>Sin sesión iniciada</strong><span class="cell-sub">Tus datos solo están en este navegador.</span>'}</p>
        ${ses ? '<button type="button" role="menuitem" class="hmenu__item" data-action="settings-go" data-tab="cuenta">Cuenta y nube</button><button type="button" role="menuitem" class="hmenu__item" data-action="cloud-signout">Cerrar sesión</button>'
      : '<button type="button" role="menuitem" class="hmenu__item" data-action="login-open">Iniciar sesión</button>'}
      </div></div>`;
  }
  function setAcctMenu(open, focusBtn) {
    acctOpen = !!open;
    const btn = $('acct-menu-btn'), list = $('acct-menu'); if (!btn || !list) return;
    btn.setAttribute('aria-expanded', String(acctOpen)); list.hidden = !acctOpen;
    if (acctOpen) { const f = list.querySelector('[role="menuitem"]'); if (f) f.focus(); } else if (focusBtn) btn.focus();
  }
  function toggleAcctMenu() { setAcctMenu(!acctOpen, false); }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (!acctOpen) return;
      const inside = e.target.closest && e.target.closest('#topbar-account'), item = e.target.closest && e.target.closest('.hmenu__item');
      if (!inside || item) setAcctMenu(false, false);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (acctOpen && e.key === 'Escape') { e.preventDefault(); setAcctMenu(false, true); }
      if (acctOpen && e.key === 'Tab') setAcctMenu(false, false);
    });
  }
  function setHelpMenu(open, focusBtn) {
    helpOpen = !!open;
    const btn = $('help-menu-btn'), list = $('help-menu');
    if (!btn || !list) return;
    btn.setAttribute('aria-expanded', String(helpOpen)); list.hidden = !helpOpen;
    if (helpOpen) { const first = list.querySelector('[role="menuitem"]'); if (first) first.focus(); } else if (focusBtn) btn.focus();
  }
  function toggleHelpMenu() { setHelpMenu(!helpOpen, false); }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      if (!helpOpen) return;
      const inside = e.target.closest && e.target.closest('#topbar-help');
      const item = e.target.closest && e.target.closest('.hmenu__item');
      if (!inside || item) setHelpMenu(false, false);
    }, true);
    document.addEventListener('keydown', (e) => {
      const list = $('help-menu'); if (!list) return;
      const items = [...list.querySelectorAll('[role="menuitem"]')];
      if (helpOpen && e.key === 'Escape') { e.preventDefault(); setHelpMenu(false, true); return; }
      if (!helpOpen && e.target && e.target.id === 'help-menu-btn' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setHelpMenu(true); return; }
      if (helpOpen && items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); const i = items.indexOf(document.activeElement); const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1); items[n].focus();
      }
      if (helpOpen && e.key === 'Tab') setHelpMenu(false, false);
    });
    document.addEventListener('toggle', (e) => {
      const d = e.target; if (d && d.classList && d.classList.contains('learn-panel')) learnOpenView = d.open ? d.dataset.learn : null;
    }, true);
  }

  function renderContextBar(state, status) {
    const esc = H().esc;
    const view = state.view;
    if (view !== lastCtxView) { learnOpenView = null; lastCtxView = view; }   // «Aprender en esta vista» entra siempre cerrado
    const d = FP.contextEngine.describe(view, status);
    const crumbs = FP.contextEngine.breadcrumbs(view);
    const extra = state.ux.crumbExtra && state.ux.crumbExtra[view] ? state.ux.crumbExtra[view] : [];
    const v = G().VIEWS[view] || {};
    const next = d.nextStep;
    const grp = G().GROUPS.find((g) => g.id === v.group && g.id !== 'ayuda');
    // título y descripción propios de la pantalla (marcados con data-own-head en su HTML): se muestran aquí, en «Detalle», y ahí se ocultan
    const own = document.querySelector('main:not([hidden]) [data-own-head]');
    const ownTitle = own && own.querySelector('h1,h2') ? own.querySelector('h1,h2').textContent.replace(/\s+/g, ' ').trim() : '';
    const ownDesc = own && own.querySelector('.panel__desc,.ds-lede') ? own.querySelector('.panel__desc,.ds-lede').textContent.replace(/\s+/g, ' ').trim() : '';
    // frase de estado: la primera oración de «qué significa»; el resto de lo que decía la banda pasa a «Qué hay aquí»
    const meaning = d.whatDoesItMean ? String(d.whatDoesItMean).trim() : '';
    const sentences = meaning.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/);
    const headline = sentences[0] ? sentences[0].replace(/\.$/, '') : '';
    const rest = sentences.slice(1).join(' ');
    const what = [term(d.whatAmISeeing), rest].filter(Boolean).join(' ');
    const tone = /por debajo|debajo del plan|requiere/i.test(headline) ? 'neg' : /por encima|encima del plan/i.test(headline) ? 'pos' : 'info';
    const detail = ownDesc && !norm(what).includes(norm(ownDesc).slice(0, 60)) ? `${ownTitle && norm(ownTitle) !== norm(v.title) ? `${ownTitle}. ` : ''}${ownDesc}` : '';
    const showNext = next.view !== view && !NO_NEXT.includes(view);
    const inlineCtx = view === 'inicio' && CTX_VIEWS.includes(view);
    const chipCtx = inlineCtx ? { ...state.ux.ctx, periodType: state.ux.home.periodType, periodKey: state.ux.home.periodKey || state.ux.ctx.periodKey } : state.ux.ctx;   // Inicio: el contexto va junto al título (chip corto); el párrafo solo queda si hay nota
    const ctxHtml = CTX_VIEWS.includes(view) ? (inlineCtx ? (state.ux.ctxNote ? `<p class="ux-head__ctx"><span class="ux-context__note">${esc(state.ux.ctxNote)}</span></p>` : '') : `<p class="ux-head__ctx">Contexto: <span class="chip">${esc(contextLabel(state.ux.ctx))}</span>
            ${state.ux.ctxNote ? `<span class="ux-context__note">${esc(state.ux.ctxNote)}</span>` : ''}</p>`) : '';
    renderHelpMenu(state); renderAccountMenu(state);
    $('ux-context').innerHTML = `<div class="ux-wrap">
      <div class="ux-head" data-tone="${tone}">
        ${view === 'inicio' ? '' : `<nav aria-label="Ruta" class="breadcrumbs ux-head__eyebrow"><ol>${['Inicio', ...(grp ? [grp.label] : []), ...extra].map((c, i, arr) => {
          const g = i === 1 ? grp : null;
          const target = i === 0 ? 'inicio' : g ? (state.ux.lastByGroup[g.id] || g.views[0]) : null;
          const qn = g && g.question ? `<span class="crumb-q"> · ${esc(g.question)}</span>` : '';
          return `<li>${target && i < arr.length - 1 ? `<a href="#${target}">${esc(c)}</a>` : `<span ${i === arr.length - 1 ? 'aria-current="location"' : ''}>${esc(c)}</span>`}${qn}</li>`;
        }).join('')}</ol></nav>`}
        <h2 class="ux-head__title" id="ux-title">${esc(v.title || view)}${inlineCtx ? `<span class="ux-head__ctxchip" title="${esc(contextLabel(chipCtx))}" aria-label="${esc('Contexto: ' + contextLabel(chipCtx))}">${esc(contextLabelShort(chipCtx))}</span><span class="ux-head__break" aria-hidden="true"></span>` : ''}${headline ? `<span class="ux-head__state ux-head__state--${tone}">${esc(headline)}</span>` : ''}</h2>
        <button type="button" class="ux-head__morebtn" data-action="ux-more" aria-expanded="${uxMoreOpen}" aria-controls="ux-more">Qué hay aquí y qué hago</button>
        <div class="ux-head__more" id="ux-more" data-open="${uxMoreOpen}">
        ${what ? `<p class="ux-head__line ux-context__purpose"><b>Qué hay aquí</b> ${esc(what)}</p>` : ''}
        ${d.whatToDo ? `<p class="ux-head__line ux-context__action"><b>Qué hago aquí</b> ${esc(term(d.whatToDo))}</p>` : ''}
        ${detail ? `<p class="ux-head__line ux-head__line--detail"><b>Detalle</b> ${esc(detail)}</p>` : ''}
        </div>
        ${ctxHtml}
      </div>
      ${state.ux.mode === 'learner' ? FP.help.learningBar(view, next, status, { todo: d.whatToDo, showNext, open: learnOpenView === view }) : ''}
      ${state.ux.mode === 'learner' && state.ux.lesson ? FP.help.lessonCard(state.ux.lesson) : ''}</div>`;
    $('ux-next').innerHTML = showNext ? `<div class="next-step"><span class="next-step__label">Siguiente paso</span>
          <strong>${esc(next.label)}</strong><span class="cell-sub">${esc(next.reason)}</span>
          <button type="button" class="btn btn--primary btn--small" data-action="go" data-view="${next.view}">Ir</button></div>` : '';
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

  FP.navigation = { groupOf, extractContext, applyContext, contextLabel, contextLabelShort, renderNav, markRoute, toggleGroup, setDrawer, toggleMore, renderContextBar, toggleHelpMenu, toggleAcctMenu, markAnalystBlocks, applyMode };
})(typeof window !== 'undefined' ? window : globalThis);
