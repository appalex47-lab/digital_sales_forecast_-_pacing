/**
 * help-view.js — "¿Cómo funciona esta herramienta?" (Fase 7).
 * Cómo usarla, cómo leer un diagnóstico, convenciones, modos y glosario completo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  function render(state) {
    const esc = H().esc;
    $('help-view').innerHTML = `
      <section class="panel"><div class="panel__body">
        <h2 class="panel__title">¿Cómo funciona esta herramienta?</h2>
        <ol class="flow-map flow-map--steps">${G().HOW_IT_WORKS.map(([t, d, v], i) => `<li><a href="#${v}"><span class="flow-map__n">${i + 1}</span><strong>${esc(t)}</strong><span class="cell-sub">${esc(d)}</span></a></li>`).join('')}</ol>
        <p class="field__hint">La app calcula con fórmulas determinísticas: Venta = Volumen × CR × AOV. La IA (Cohere) es opcional, solo redacta y nunca calcula ni navega.</p>
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="tour-start">${state.ux.tour.step ? `Retomar recorrido (paso ${state.ux.tour.step + 1})` : 'Iniciar recorrido guiado'}</button>
          ${state.ux.tour.step ? '<button type="button" class="btn" data-action="tour-restart">Empezar desde el paso 1</button>' : ''}</div>
      </div></section>
      <section class="panel"><div class="panel__body">
        <h2 class="panel__title">¿Cómo debo leer un diagnóstico?</h2>
        <ol class="read-steps">${G().READ_DIAGNOSIS.map((q, i) => `<li><span class="read-steps__when">${i === 0 ? 'Primero' : i === G().READ_DIAGNOSIS.length - 1 ? 'Finalmente' : 'Después'}</span> ${esc(q)}</li>`).join('')}</ol>
        ${FP.help.explainer('diagnostico', 'analyst')}
      </div></section>
      <section class="panel"><div class="panel__body">
        <h2 class="panel__title">Plan, actual, forecast, reforecast, escenario y observado</h2>
        <dl class="conventions">${Object.keys(G().STATES).map((k) => `<div><dt>${FP.help.stateTag(k)}</dt><dd>${esc(G().STATES[k].short)}</dd></div>`).join('')}</dl>
        <h3 class="h4">Modo ejecutivo y modo analista</h3>
        <p>El modo ejecutivo colapsa bloques técnicos (métodos, supuestos, índices, detalle de dimensiones); el modo analista muestra todo. No se elimina información.</p>
      </div></section>
      <section class="panel"><div class="panel__body">
        <h2 class="panel__title">Glosario</h2>${FP.help.glossaryHtml()}
      </div></section>`;
  }

  FP.helpView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
