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

  let fab = null, badgeTimer = null, count = null, sum = null;
  const dismissed = new Set();   // llaves de selección (canal/periodo) cuya línea de Inicio se cerró; cambiar la selección la vuelve a calcular

  function curView() { return (document.body && document.body.dataset && document.body.dataset.view) || 'inicio'; }
  const SPARK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#1F5FE0" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

  function paint() {
    if (!fab) return;
    fab.innerHTML = `${SPARK}Asistentes${count ? `<span class="ag-badge" aria-label="${count} hallazgos">${count}</span>` : ''}`;
  }
  function load() { return FP.lazy.load('agentes'); }
  /**
   * Fase 3 · La línea de Inicio: una sola frase, bajo el encabezado, con «Abrir en Asistentes». Solo con hallazgos de prioridad Alta o Media, se cierra con la X
   * y no agrega bloques a Inicio (lo que encontró el Analista se lee dentro del panel). Se vuelve a calcular al cambiar el canal o el periodo.
   */
  function paintLine() {
    if (typeof document === 'undefined') return;
    const old = document.getElementById('ag-line'); if (old) old.remove();
    if (!sum || !sum.n || dismissed.has(sum.key) || curView() !== 'inicio') return;
    const head = document.querySelector('#home .home__head'); if (!head) return;
    const el = document.createElement('div');
    el.id = 'ag-line'; el.className = 'ag-line'; el.setAttribute('role', 'status');
    const parts = [sum.alta ? `${sum.alta} Alta${sum.alta > 1 ? 's' : ''}` : '', sum.media ? `${sum.media} Media${sum.media > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    const where = [sum.scopeLabel, sum.channelLabel].filter(Boolean).join(' y ');
    const t = document.createElement('span'); t.className = 'ag-line__t';
    t.textContent = `El Analista encontró ${sum.n} ${sum.n === 1 ? 'cosa' : 'cosas'}${where ? ` con ${where}` : ''}: ${parts}.`;
    const go = document.createElement('button'); go.type = 'button'; go.className = 'ag-line__go'; go.setAttribute('data-ag-line', 'open'); go.textContent = 'Abrir en Asistentes';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ag-line__x'; x.setAttribute('data-ag-line', 'close'); x.setAttribute('aria-label', 'Cerrar este aviso'); x.textContent = '×';
    el.append(t, go, x);
    go.addEventListener('click', () => { load().then(() => FP.agentPanel.open(fab)).catch(() => { /* sin panel */ }); });
    x.addEventListener('click', () => { dismissed.add(sum.key); el.remove(); });
    head.insertAdjacentElement('afterend', el);
  }
  /** Cuenta hallazgos en segundo plano (carga el módulo diferido). Nunca lanza ni molesta si falla. */
  function refreshBadge() {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      const go = () => load().then(() => FP.agentPanel.summary()).then((s) => { sum = s; count = s.n; paint(); paintLine(); }).catch(() => { /* sin contador */ });
      if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 8000 }); else go();
    }, 900);
  }
  /** El canal o el periodo elegidos cambiaron: la línea y el contador ya no valen; se quitan y se vuelven a calcular. */
  let lastCtx = null;
  function onContext() {
    if (!fab) return;
    const S = root.FP && root.FP.app && root.FP.app.state, c = S && S.ux && S.ux.ctx, key = c ? [c.channel, c.periodType, c.periodKey].join('/') : '';
    const first = lastCtx === null; if (key === lastCtx) return; lastCtx = key; if (first) return;   // se llama en cada render: solo actúa si cambió la selección
    sum = null; count = null; paint(); paintLine();
    refreshBadge();
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
  FP.agentLauncher = { init, refreshBadge, onContext, paintLine, setCount(n) { count = n; paint(); }, getButton() { return fab; }, curView };
})(typeof window !== 'undefined' ? window : globalThis);
