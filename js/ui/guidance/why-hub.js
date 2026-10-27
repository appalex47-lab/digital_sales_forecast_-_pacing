/**
 * why-hub.js — Entrada única «¿Por qué?» (Fase 4 del plan de simplificación). Solo navegación: no calcula nada.
 * Una franja con las formas de investigar una brecha; la vista actual aparece marcada. Se pinta arriba de Diagnóstico,
 * Producto y evolución y Tráfico y conversión. (Categoría → Producto y Evolución y patrones viven ahora en Producto y evolución.)
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const OPTIONS = [
    { view: 'diagnostico', label: 'Brecha y drivers', ask: 'Qué variable explica la brecha: tráfico, conversión o ticket', src: 'Plan y venta real' },
    { view: 'prodevol', label: 'Producto y evolución', ask: 'Qué categorías, productos y SKU lo mueven, y desde cuándo cae o crece', src: 'Venta por producto' },
    { view: 'segmentos', label: 'Tráfico y conversión', ask: 'En qué dispositivo, fuente, campaña o landing ocurre', src: 'Segmentos de GA4' }
  ];
  const VIEWS = OPTIONS.map((o) => o.view);

  function html(current) {
    const esc = FP.ui.helpers.esc;
    const items = OPTIONS.map((o) => (o.view === current
      ? `<li class="why-hub__item is-current" aria-current="page"><strong>${esc(o.label)}</strong><span>${esc(o.ask)}</span><small class="why-hub__src">Datos: ${esc(o.src)}</small></li>`
      : `<li class="why-hub__item"><button type="button" class="link-btn" data-action="go" data-view="${esc(o.view)}">${esc(o.label)}</button><span>${esc(o.ask)}</span><small class="why-hub__src">Datos: ${esc(o.src)}</small></li>`)).join('');
    return `<nav class="why-hub" aria-label="¿Por qué? Elige cómo investigar"><p class="why-hub__t"><strong>¿Por qué?</strong> ${['Dos', 'Tres', 'Cuatro'][OPTIONS.length - 2] || OPTIONS.length} formas de investigar. El canal, el periodo y la comparación te acompañan al cambiar de una a otra; cada una indica de qué datos sale.</p><ul class="why-hub__list">${items}</ul></nav>`;
  }

  /** Pinta la franja en la vista actual si es una de las opciones. */
  function render(view) {
    const box = typeof document !== 'undefined' && document.getElementById(`why-hub-${view}`);
    if (box) box.innerHTML = VIEWS.includes(view) ? html(view) : '';
  }

  FP.whyHub = { render, html, OPTIONS, VIEWS };
})(typeof window !== 'undefined' ? window : globalThis);
