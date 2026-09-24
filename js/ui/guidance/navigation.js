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
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const groupOf = (view) => (G().VIEWS[view] ? G().VIEWS[view].group : null);

  /* ---------- Contexto persistente ---------- */

  function extractContext(view, state) {
    const c = { ...state.ux.ctx };
    if (view === 'diagnostico') Object.assign(c, pick(state.dx.settings, ['channel', 'periodType', 'periodKey', 'comparison']));
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
    if (view === 'diagnostico') {
      const s = state.dx.settings;
      s.channel = c.channel || s.channel;
      if (['month', 'week', 'year'].includes(c.periodType)) { s.periodType = c.periodType; s.periodKey = c.periodKey; }
      else if (monthKey) { s.periodType = 'month'; s.periodKey = monthKey; notes.push('El diagnóstico trabaja por mes, semana o año: se muestra el mes del periodo elegido.'); }
      if (c.comparison) s.comparison = c.comparison;
      state.dx.run = null;
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

  function renderNav(state) {
    const esc = H().esc;
    const cur = state.view;
    const gid = groupOf(cur);
    const groups = G().GROUPS;
    const active = groups.find((g) => g.id === gid) || groups[0];
    $('app-nav').innerHTML = `
      <div class="app-nav__inner app-nav__groups">
        ${groups.map((g) => `<a href="#${state.ux.lastByGroup[g.id] || g.views[0]}" data-nav-group="${g.id}" class="nav-group ${g.id === gid ? 'is-active' : ''}"
          ${g.id === gid ? 'aria-current="true"' : ''}>${esc(g.label)}</a>`).join('')}
        <span class="nav-spacer"></span>
        <a href="#ayuda" data-nav="ayuda" class="nav-group ${cur === 'ayuda' ? 'is-active' : ''}">¿Cómo funciona?</a>
      </div>
      <div class="app-nav__inner app-nav__sub" ${active.views.length > 1 ? '' : 'hidden'}>
        ${groups.map((g) => g.views.map((v) => `<a href="#${v}" data-nav="${v}" ${g.id === active.id ? '' : 'hidden'}
          ${v === cur ? 'aria-current="page"' : ''} aria-selected="${v === cur}">${esc(G().VIEWS[v].title)}</a>`).join('')).join('')}
      </div>`;
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
    $('ux-context').innerHTML = `
      <div class="ux-context__inner">
        <div class="ux-context__main">
          <nav aria-label="Ruta" class="breadcrumbs"><ol>${[...crumbs, ...extra].map((c, i, arr) => {
            const target = i === 0 ? 'inicio' : i === 1 && G().GROUPS.find((g) => g.label === c) ? (state.ux.lastByGroup[G().GROUPS.find((g) => g.label === c).id] || G().GROUPS.find((g) => g.label === c).views[0]) : null;
            return `<li>${target && i < arr.length - 1 ? `<a href="#${target}">${esc(c)}</a>` : `<span ${i === arr.length - 1 ? 'aria-current="location"' : ''}>${esc(c)}</span>`}</li>`;
          }).join('')}</ol></nav>
          <p class="ux-context__purpose">${esc(d.whatAmISeeing)}${d.whatDoesItMean ? ` <strong>${esc(d.whatDoesItMean)}</strong>` : ''}</p>
          ${['inicio', 'pacing', 'reforecast', 'diagnostico', 'recovery'].includes(view) ? `<p class="ux-context__chips">Contexto: <span class="chip">${esc(contextLabel(state.ux.ctx))}</span>
            ${state.ux.ctxNote ? `<span class="ux-context__note">${esc(state.ux.ctxNote)}</span>` : ''}</p>` : ''}
          ${q === 'invalid' || q === 'warnings' ? `<p class="ux-context__warn">${H().pill(q === 'invalid' ? 'error' : 'warning', status.data.qualityText || 'Calidad')}
            Algunos cálculos pueden estar incompletos. <a href="#calidad">Revisar calidad de datos</a></p>` : ''}
        </div>
        <div class="ux-context__side">
          ${next.view !== view ? `<div class="next-step"><span class="next-step__label">Siguiente paso</span>
            <strong>${esc(next.label)}</strong><span class="cell-sub">${esc(next.reason)}</span>
            <button type="button" class="btn btn--primary btn--small" data-action="go" data-view="${next.view}">Ir</button></div>` : ''}
          <div class="btn-row">
            ${H().segmented('ux-mode', [['exec', 'Ejecutivo'], ['analyst', 'Analista']], state.ux.mode)}
          </div>
          <div class="btn-row">
            ${(v.help || []).length ? `<button type="button" class="btn btn--small" data-action="help-section">Ayuda de esta sección</button>` : ''}
            <button type="button" class="btn btn--small" data-action="glossary">Glosario</button>
            <button type="button" class="btn btn--small" data-action="tour-start">${state.ux.tour.step ? `Retomar recorrido (${state.ux.tour.step + 1}/10)` : 'Recorrido guiado'}</button>
          </div>
        </div>
      </div>`;
  }

  /** Marca los bloques técnicos (una vez) para que el modo Ejecutivo los colapse con CSS. */
  function markAnalystBlocks() {
    G().ANALYST_ONLY.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const target = el.closest('section.panel') || el;
      target.setAttribute('data-analyst', '');
    });
  }

  function applyMode(state) {
    document.body.classList.toggle('mode-exec', state.ux.mode === 'exec');
    document.querySelectorAll('.mode-note').forEach((n) => n.remove());
    if (state.ux.mode !== 'exec') return;
    const main = document.getElementById(`view-${state.view}`);
    if (!main) return;
    const n = main.querySelectorAll('[data-analyst]').length;
    if (n) main.insertAdjacentHTML('afterbegin', `<p class="note mode-note">Modo ejecutivo: ${n} bloque${n === 1 ? '' : 's'} técnico${n === 1 ? '' : 's'} oculto${n === 1 ? '' : 's'} (métodos, supuestos, detalle). No se eliminó información.
      <button type="button" class="btn btn--small" data-action="ux-mode" data-value="analyst">Ver en modo analista</button></p>`);
  }

  FP.navigation = { groupOf, extractContext, applyContext, contextLabel, renderNav, renderContextBar, markAnalystBlocks, applyMode };
})(typeof window !== 'undefined' ? window : globalThis);
