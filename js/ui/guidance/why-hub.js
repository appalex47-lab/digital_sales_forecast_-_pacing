/**
 * why-hub.js — Entrada única «¿Por qué?» (Fase 4 del plan de simplificación). Solo navegación: no calcula nada.
 * Una franja con las cuatro formas de investigar una brecha; la vista actual aparece marcada. Se pinta arriba de
 * Diagnóstico, Evolución y patrones, Tráfico y conversión y Categoría → Producto (los mismos datos, sin duplicar pantallas).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const OPTIONS = [
    { view: 'diagnostico', label: 'Brecha y drivers', ask: 'Qué variable explica la brecha: tráfico, conversión o ticket' },
    { view: 'analisis', label: 'Evolución y patrones', ask: 'Desde cuándo cae o crece, y si se acelera o se recupera' },
    { view: 'segmentos', label: 'Tráfico y conversión', ask: 'En qué dispositivo, fuente, campaña o landing ocurre' },
    { view: 'producto', label: 'Categoría → Producto', ask: 'Qué categorías, productos y SKU lo mueven' }
  ];
  const VIEWS = OPTIONS.map((o) => o.view);

  function html(current) {
    const esc = FP.ui.helpers.esc;
    const items = OPTIONS.map((o) => (o.view === current
      ? `<li class="why-hub__item is-current" aria-current="page"><strong>${esc(o.label)}</strong><span>${esc(o.ask)}</span></li>`
      : `<li class="why-hub__item"><button type="button" class="link-btn" data-action="go" data-view="${esc(o.view)}">${esc(o.label)}</button><span>${esc(o.ask)}</span></li>`)).join('');
    return `<nav class="why-hub" aria-label="¿Por qué? Elige cómo investigar"><p class="why-hub__t"><strong>¿Por qué?</strong> Cuatro formas de investigar, con los mismos datos.</p><ul class="why-hub__list">${items}</ul></nav>`;
  }

  /** Pinta la franja en la vista actual si es una de las cuatro. */
  function render(view) {
    const box = typeof document !== 'undefined' && document.getElementById(`why-hub-${view}`);
    if (box) box.innerHTML = VIEWS.includes(view) ? html(view) : '';
  }

  FP.whyHub = { render, html, OPTIONS, VIEWS };
})(typeof window !== 'undefined' ? window : globalThis);
