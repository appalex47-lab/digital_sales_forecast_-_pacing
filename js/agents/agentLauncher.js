/**
 * agentLauncher.js — Fase 1 · Botón «Asistentes» (pequeño, vive en el arranque) y registro de agentes.
 *
 * El panel, los detectores y la IA (FP.agents.*, FP.agentPanel) son un módulo DIFERIDO (data-lazy="agentes" en index.html):
 * no se descargan hasta que la persona abre el panel o hasta unos segundos después del arranque, cuando el navegador está libre
 * y solo para contar los hallazgos del botón. No tiene efectos al cargarse: app.js llama a FP.agentLauncher.init() al terminar init().
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};

  /** `available`: el agente ya existe. Los demás se muestran en el panel como «próximamente» (Fase 4). */
  const AGENTS = {
    analista: { label: 'Números', sub: 'Qué se mueve', name: 'Analista de Números', available: true,
      role: 'Te cuenta la historia del periodo: qué se cae, qué crece y dónde revisar primero, y te acompaña con una ruta de preguntas hasta que lo entiendas. Habla de venta, pedidos, ticket y unidades; no de ganancia.' },
    auditor: { label: 'Conversión', sub: 'Embudo y tráfico', name: 'Auditor de Conversión', available: true,
      role: 'Sigue el embudo (vista → carrito → checkout → compra) por producto, categoría y canal, y busca dónde se queda la venta. Separa «cambió la mezcla de tráfico» de «cambió la conversión dentro de cada segmento». No habla de promociones ni de rentabilidad.' },
    arquitecto: { label: 'Ofertas', sub: 'Promociones', name: 'Arquitecto de Ofertas', available: false, phase: 'Fase 4',
      role: 'Propondrá qué promocionar, dónde y cómo medirlo, con las reglas del módulo de promociones.' }
  };
  /** Agente sugerido por vista (id de vista de la app). Si el sugerido aún no existe (Arquitecto), cae en el Analista. */
  const DEFAULT_BY_VIEW = { segmentos: 'auditor', producto: 'auditor', clientes: 'auditor', recovery: 'arquitecto', medir: 'arquitecto' };
  function defaultAgent(view) { const a = DEFAULT_BY_VIEW[view] || 'analista'; return AGENTS[a] && AGENTS[a].available ? a : 'analista'; }
  function suggestedAgent(view) { return DEFAULT_BY_VIEW[view] || 'analista'; }   // el que la vista pediría aunque aún no exista

  let fab = null, badgeTimer = null, count = null;

  function curView() { return (document.body && document.body.dataset && document.body.dataset.view) || 'inicio'; }
  const SPARK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#1F5FE0" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

  function paint() {
    if (!fab) return;
    fab.innerHTML = `${SPARK}Asistentes${count ? `<span class="ag-badge" aria-label="${count} hallazgos">${count}</span>` : ''}`;
  }
  function load() { return FP.lazy.load('agentes'); }
  /** Cuenta hallazgos en segundo plano (carga el módulo diferido). Nunca lanza ni molesta si falla. */
  function refreshBadge() {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      const go = () => load().then(() => FP.agentPanel.countFindings()).then((n) => { count = n; paint(); }).catch(() => { /* sin contador */ });
      if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 8000 }); else go();
    }, 900);
  }

  function init() {
    if (fab || typeof document === 'undefined' || !document.body || !FP.lazy) return;
    fab = document.createElement('button');
    fab.type = 'button'; fab.id = 'ag-fab'; fab.className = 'ag-fab';
    fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false');
    fab.addEventListener('click', () => { load().then(() => FP.agentPanel.toggle(fab)).catch((e) => { if (FP.ui && FP.ui.toast) FP.ui.toast(`No se pudieron cargar los asistentes: ${e.message}`, { ms: 5000 }); }); });
    document.body.appendChild(fab);
    paint();
    // El contador se calcula unos segundos después de abrir (cuando ya corrieron las pruebas del motor) y al cambiar de vista.
    setTimeout(refreshBadge, 7000);
    try { new MutationObserver(() => { if (FP.agentPanel) FP.agentPanel.onViewChange(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] }); } catch (e) { /* sin observador */ }
  }

  FP.agents.registry = { AGENTS, DEFAULT_BY_VIEW, defaultAgent, suggestedAgent };
  FP.agentLauncher = { init, refreshBadge, setCount(n) { count = n; paint(); }, getButton() { return fab; }, curView };
})(typeof window !== 'undefined' ? window : globalThis);
