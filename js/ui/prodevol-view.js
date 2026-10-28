/**
 * prodevol-view.js — «Producto y evolución». La página la dibuja FP.pxView (versión B, css/px.css) y su ficha FP.pxFicha; aquí quedan
 * el punto de entrada (render), el aviso de «sin historia suficiente», el salto a un capítulo al llegar desde #producto o #analisis y el foco
 * del embudo que usa «¿Qué hago?».
 * Producto manda en canal, periodo, comparación y ruta (los filtros de Evolución se derivan de ahí en app.js · peSync).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const nw = (t) => `<span class="nw">${esc(t)}</span>`;
  const F = () => FP.format;
  const money = (v) => F().currency(Math.abs(v), 0);
  const sg = (v) => (v < 0 ? '−' : '+') + money(v);
  const DASH = '—';

  const FE = () => FP.funnelEngine;
  const entName = (state, e) => (FP.productFilter && state.an.level === 'branch' ? FP.productFilter.label('branch', e) : e);

  /** El foco del embudo: la entidad elegida (si está en la tabla) o toda la selección. */
  function funnelFocus(state) {
    const r = state.pa.result, ent = state.peFocusKey !== null && state.peFocusKey !== undefined ? state.peFocusKey : (state.an.selected && state.an.selected.entity);
    const row = ent ? r.rows.find((x) => String(x.key) === String(ent)) : null;
    if (row) return { label: entName(state, row.key), cur: FE().pick(row.current), base: FE().pick(row.baseline), isRow: true };
    return { label: 'Toda la selección', cur: FE().pick(r.total.current), base: FE().pick(r.total.baseline), isRow: false };
  }
  /** Sin historia suficiente para clasificar patrones (p. ej. vista anual con 2 años): se dice dónde falta, cuántos periodos hacen falta y cómo conseguirlo. */
  function noHistory(state) {
    const a = state.an, g = FP.app.paGran(state.pa), n = (a.periodsList || []).length, min = FP.trendEngine.DEFAULTS.minPeriods;
    const U = { year: ['año', 'años'], month: ['mes', 'meses'], week: ['semana', 'semanas'], day: ['día', 'días'] }[g] || ['periodo', 'periodos'];
    const NEXT = { year: 'mes', month: 'semana', week: 'día' }[g];
    return `<div class="note note--warning pe-nohist"><strong>Con ${n} ${n === 1 ? U[0] : U[1]} no se puede clasificar el patrón.</strong> Se necesitan al menos ${min} periodos con datos; mientras tanto la tabla de Tendencia, Patrón y Cierre proyectado no puede llenarse.${NEXT ? ` <button type="button" class="btn btn--small btn--primary" data-action="pe-finer">Ver por ${NEXT}</button>` : ''}</div>`;
  }

  function render(state, opts) { return FP.pxView.render(state, opts); }

  /** Llegada desde #producto o #analisis: se baja al capítulo cuando ya hay resultados (antes el contenido de arriba aún cambia de alto). */
  function settle(state) {
    const id = state.peAnchor;
    if (!id || !state.pa.result || state.pa.loading || state.an.key === null || state.an.loading) return;
    state.peAnchor = null;
    root.requestAnimationFrame(() => { const t = $(id); if (t) t.scrollIntoView({ block: 'start' }); });
  }

  FP.prodevolView = { render, noHistory, settle };
  FP.prodevolView._funnel = { funnelFocus };
})(typeof window !== 'undefined' ? window : globalThis);
