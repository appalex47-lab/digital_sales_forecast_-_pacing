/**
 * action-plan-view.js — Recovery Center, parte de acciones (Fase 6).
 * Catálogo de acciones posibles, plan de acción, líneas de acción con Cohere y seguimiento
 * (baseline / escenario / observado). Solo pinta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => F().currency(v, 0);
  const signedMoney = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${F().currency(Math.abs(v), 0)}` : F().DASH);
  const DRIVER = { trafficVolume: 'Volumen', conversionRate: 'CR', aov: 'AOV' };
  const STATUS_PILL = { proposed: 'na', approved: 'ok', in_progress: 'warning', completed: 'ok', measuring: 'warning', validated: 'ok', rejected: 'error', cancelled: 'na' };
  const CONS = { consistent: ['ok', 'Consistente con el escenario'], partial: ['warning', 'Parcialmente consistente'], not_consistent: ['error', 'No consistente'], insufficient_data: ['na', 'Sin datos todavía'] };

  const scenariosWithHyp = (rc) => (rc.analysis ? rc.analysis.scenarios : []).filter((s) => s.links.hypothesisId);

  function renderLibrary(state) {
    const esc = H().esc;
    const rc = state.rc;
    const eligible = scenariosWithHyp(rc);
    const selSc = eligible.find((s) => s.scenarioId === rc.actionScenario) || eligible[0] || null;
    if (selSc) rc.actionScenario = selSc.scenarioId;
    const driver = rc.libraryDriver || (selSc ? selSc.links.driver : '') || '';
    const avail = rc.analysis ? rc.analysis.dataQuality.availableTargets : [];
    const signals = rc.analysis ? rc.analysis.signals : [];
    const catalog = FP.actionLibrary.applicable(rc.custom, { driver: driver || null, channel: rc.ctx.channel === '__import' ? 'total' : rc.ctx.channel,
      signalMetrics: signals.map((s) => s.metric), availableData: avail });
    const ai = rc.ai;
    $('rc-library').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Catálogo de acciones posibles</h3>
        <span class="field__hint">Catálogo configurable; no son recomendaciones y nada se ejecuta automáticamente.</span></div>
      <div class="filters">
        <div class="field"><label for="rc-act-sc" class="field__hint">Escenario (con hipótesis) al que se liga la acción</label>
          <select id="rc-act-sc" data-action="rc-action-scenario">${eligible.length ? eligible.map((s) => `<option value="${esc(s.scenarioId)}" ${selSc && s.scenarioId === selSc.scenarioId ? 'selected' : ''}>${esc(s.scenarioId)} · ${esc(s.name)}</option>`).join('')
            : '<option value="">Guarda un escenario ligado a una hipótesis</option>'}</select></div>
        <div class="field"><label for="rc-lib-driver" class="field__hint">Driver</label>
          <select id="rc-lib-driver" data-action="rc-library-driver"><option value="">Todos</option>
            ${Object.entries(DRIVER).map(([k, l]) => `<option value="${k}" ${driver === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      ${!selSc ? '<p class="note note--warning">Para agregar una acción al plan primero debe existir la cadena: hipótesis → escenario guardado ligado a esa hipótesis.</p>' : `
        <p class="field__hint">Hipótesis: <strong>${esc(selSc.links.hypothesisId)}</strong> ${esc(selSc.links.hypothesis || '')} · Escenario: ${esc(FP.scenarioView.changesText(selSc.inputs))}, impacto simulado ${esc(signedMoney(selSc.expectedImpact.incrementalValue))}.</p>`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Acción</th><th>Driver</th><th>Área</th><th>Mide</th><th>Datos</th><th></th></tr></thead>
        <tbody>${catalog.map((a) => `<tr><td><strong>${esc(a.name)}</strong>${a.custom ? ' <span class="chip">propia</span>' : ''}<span class="cell-sub">${esc(a.description)}</span></td>
          <td>${esc(DRIVER[a.driver])}${a.signalMatch ? '<span class="cell-sub">hay señales de este driver</span>' : ''}</td><td>${esc(a.ownerArea)}</td>
          <td>${esc(C().metrics[a.measurementMetric] ? C().metrics[a.measurementMetric].label : a.measurementMetric)}${a.defaultWindowDays ? `<span class="cell-sub">${a.defaultWindowDays} días</span>` : ''}</td>
          <td>${a.dataAvailable ? H().pill('ok', 'Disponibles') : H().pill('warning', 'Faltan') + `<span class="cell-sub">${esc(a.missingData.join(', '))}</span>`}</td>
          <td><button type="button" class="btn btn--small" data-action="rc-add-action" data-id="${esc(a.actionId)}" ${selSc && a.dataAvailable ? '' : 'disabled'}>Agregar al plan</button></td></tr>`).join('')}</tbody></table></div>
      <details class="disclosure"><summary>Agregar una acción propia al catálogo</summary><div class="panel__body">
        <div class="settings-grid">
          <div class="field"><label for="rc-cu-name" class="field__hint">Nombre</label><input id="rc-cu-name" type="text"></div>
          <div class="field"><label for="rc-cu-driver" class="field__hint">Driver que intenta modificar</label>
            <select id="rc-cu-driver">${Object.entries(DRIVER).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field"><label for="rc-cu-owner" class="field__hint">Área responsable</label><input id="rc-cu-owner" type="text"></div>
          <div class="field"><label for="rc-cu-days" class="field__hint">Ventana de medición (días)</label><input id="rc-cu-days" type="number" min="1" step="1"></div>
          <div class="field" style="grid-column:1/-1"><label for="rc-cu-desc" class="field__hint">Descripción</label><input id="rc-cu-desc" type="text"></div>
        </div>
        <button type="button" class="btn" data-action="rc-add-custom">Agregar al catálogo</button></div></details>
      <div class="ai-box">
        <div class="subhead"><h4>Líneas de acción con Cohere (opcional)</h4>
          <button type="button" class="btn btn--small" data-action="rc-ai" ${selSc && ai.status !== 'busy' ? '' : 'disabled'}>${ai.status === 'busy' ? 'Consultando…' : 'Proponer con Cohere'}</button></div>
        <p class="field__hint">Cohere recibe la hipótesis, el driver, las señales y el escenario ya calculados. No calcula impacto ni cifras y sus propuestas requieren validación. Usa la API key de la pestaña de diagnóstico.</p>
        ${ai.status === 'unavailable' || ai.status === 'invalid' ? `<p class="note note--warning">Análisis con IA no disponible. ${esc(ai.errors.join(' '))}</p>` : ''}
        ${ai.actions.length ? `<ul class="alert-list">${ai.actions.map((a, i) => `<li>${H().pill('na', 'IA · propuesta')} <span><strong>${esc(a.action)}</strong> (${esc(DRIVER[a.relatedDriver])})
          <span class="cell-sub">${esc(a.rationale)}${a.informationNeeded.length ? ` · Información necesaria: ${esc(a.informationNeeded.join('; '))}` : ''}</span></span>
          <button type="button" class="btn btn--small" data-action="rc-add-ai-action" data-index="${i}">Agregar al plan</button></li>`).join('')}</ul>` : ''}
      </div>`;
  }

  function renderPlan(state) {
    const esc = H().esc;
    const rc = state.rc;
    const actions = rc.analysis ? rc.analysis.actions : [];
    const statuses = C().recovery.actionStatuses;
    if (!actions.length) { $('rc-plan').innerHTML = '<div class="subhead"><h3 class="panel__title">Plan de acción</h3></div><p class="note">Sin acciones para este canal y periodo.</p>'; return; }
    const counts = Object.keys(statuses).map((k) => [k, actions.filter((a) => a.status === k).length]).filter(([, n]) => n);
    $('rc-plan').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Plan de acción</h3>
        <span>${counts.map(([k, n]) => H().pill(STATUS_PILL[k], `${statuses[k]}: ${n}`)).join(' ')}</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Acción</th><th>Cadena</th><th>Responsable</th><th>Estado</th><th>Fechas</th><th class="num">Impacto simulado</th><th>Prioridad (descriptiva)</th><th></th></tr></thead>
        <tbody>${actions.map((a) => {
          const p = a.priority || {};
          const last = FP.actionTracking.latest(rc.plan, a.actionId);
          return `<tr>
            <td><strong>${esc(a.actionId)}</strong> ${esc(a.title)}<span class="cell-sub">${esc(a.description || '')}${a.source === 'cohere' ? ' · propuesta por IA' : ''}</span></td>
            <td class="wrap"><span class="cell-sub">Driver ${esc(DRIVER[a.driver] || a.driver || '—')} · ${esc(a.hypothesisId || '—')} · ${esc(a.scenarioId || '—')}</span></td>
            <td><input type="text" value="${esc(a.owner)}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="owner" aria-label="Responsable" class="input--compact"></td>
            <td><select data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="status" aria-label="Estado">${Object.entries(statuses).map(([k, l]) =>
              `<option value="${k}" ${a.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
            <td><input type="date" value="${esc(a.startDate || '')}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="startDate" aria-label="Inicio" class="input--compact">
              <input type="date" value="${esc(a.endDate || '')}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="endDate" aria-label="Fin" class="input--compact"></td>
            <td class="num">${esc(signedMoney(a.expectedImpact ? a.expectedImpact.incrementalValue : null))}<span class="cell-sub">simulado</span></td>
            <td><span class="cell-sub">Impacto simulado: ${esc(p.simulatedImpact || 'n/d')} · Exposición: ${esc(p.exposure || 'n/d')} · Urgencia: ${esc(p.urgency || 'n/d')} · Evidencia: ${esc(p.evidence || 'n/d')} · ${esc(p.constraints || '')}</span></td>
            <td><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-measure" data-id="${esc(a.actionId)}">Medir</button>
              <button type="button" class="btn btn--small btn--ghost" data-action="rc-tree-action" data-id="${esc(a.actionId)}">Ver cadena</button></div>
              ${last ? `<span class="cell-sub">${esc(CONS[last.consistency][1])}</span>` : ''}
              <details><summary class="cell-sub">Historial (${a.history.length})</summary><ul class="plain-list">${a.history.map((h) => `<li class="cell-sub">${esc(h.at.slice(0, 16).replace('T', ' '))} · ${esc(h.field)}: ${esc(String(h.from ?? '—'))} → ${esc(String(h.to ?? '—'))}</li>`).join('')}</ul></details></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">La prioridad es descriptiva (factores cuantitativos), no indica cuál acción es mejor. Los cambios quedan en el historial; nada se borra.</p>`;
  }

  function renderTracking(state) {
    const esc = H().esc;
    const rc = state.rc;
    const ids = new Set((rc.analysis ? rc.analysis.actions : []).map((a) => a.actionId));
    const ms = rc.plan.measurements.filter((m) => ids.has(m.actionId));
    if (!ms.length) { $('rc-tracking').innerHTML = '<div class="subhead"><h3 class="panel__title">Seguimiento</h3></div><p class="note">Sin mediciones. Usa "Medir" en una acción cuando haya real en su ventana.</p>'; return; }
    const fmt = (k, v) => F().metric(k, v);
    $('rc-tracking').innerHTML = `<div class="subhead"><h3 class="panel__title">Seguimiento: baseline, escenario y observado</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Acción</th><th>Medición</th><th>Métrica</th><th class="num">Baseline</th><th class="num">Escenario <span class="tag tag--sim">Simulado</span></th>
          <th class="num">Observado <span class="tag tag--obs">Observado</span></th><th class="num">Δ vs baseline</th><th class="num">Δ vs escenario</th><th>Lectura</th></tr></thead>
        <tbody>${ms.slice().reverse().map((m) => {
          const k = m.metric, d = m.delta;
          const [cls, lbl] = CONS[m.consistency];
          return `<tr><td>${esc(m.actionId)}</td><td class="num">${esc(m.measurementDate)}<span class="cell-sub">${m.observedDays} de ${m.windowDays} días con real</span></td>
            <td>${esc(C().metrics[k] ? C().metrics[k].label : k)}</td>
            <td class="num">${esc(fmt(k, d.baseline))}</td><td class="num">${esc(fmt(k, d.scenario))}</td><td class="num">${esc(fmt(k, d.observed))}</td>
            <td class="num">${esc(k === 'conversionRate' ? FP.pacingView.signed(k, d.deltaVsBaseline) : FP.pacingView.signed(k, d.deltaVsBaseline))}</td>
            <td class="num">${esc(FP.pacingView.signed(k, d.deltaVsScenario))}</td>
            <td class="wrap">${H().pill(cls, lbl)}<span class="cell-sub">${esc(m.statement)}</span>
              <details><summary class="cell-sub">Factores que pueden afectar la comparación</summary><ul class="plain-list">${m.factors.map((f) => `<li class="cell-sub">${esc(f)}</li>`).join('')}</ul></details></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">Lectura: "consistente / no consistente con el escenario". Nunca "la acción causó". Impacto simulado y observado no se mezclan.</p>`;
  }

  function render(state) {
    renderLibrary(state);
    renderPlan(state);
    renderTracking(state);
  }

  FP.actionPlanView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
