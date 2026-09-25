/**
 * measure-view.js — Medir y aprender (Fase 7).
 * Vista global (todos los canales y periodos) de acciones, mediciones, cadena trazable y aprendizajes.
 * Lee el plan de acción y los escenarios guardados; las mediciones se registran en el Recovery Center
 * (mismo motor, FP.actionTracking). No calcula nada nuevo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CONS = { consistent: ['ok', 'Consistente con el escenario'], partial: ['warning', 'Parcialmente consistente'], not_consistent: ['error', 'No consistente'], insufficient_data: ['na', 'Sin datos todavía'] };
  const DRIVER = { trafficVolume: 'Volumen', conversionRate: 'CR', aov: 'AOV' };
  const money = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${F().currency(Math.abs(v), 0)}` : F().DASH);

  function render(state) {
    const esc = H().esc;
    const plan = state.rc.plan;
    const scenarios = state.rc.scenarioStore ? state.rc.scenarioStore.scenarios : [];
    const actions = plan.actions;
    if (!actions.length) {
      $('mx-actions').innerHTML = '<div class="empty"><strong>Todavía no hay acciones para medir</strong>Las acciones se crean en el Recovery Center, ligadas a una hipótesis y un escenario.</div>';
      ['mx-chain', 'mx-learn'].forEach((id) => { $(id).innerHTML = ''; });
      return;
    }
    const sel = actions.find((a) => a.actionId === state.ux.measureAction) || actions[0];
    const statuses = C().recovery.actionStatuses;
    $('mx-actions').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Acciones y seguimiento</h3>
        <span>${Object.keys(statuses).map((k) => [k, actions.filter((a) => a.status === k).length]).filter(([, n]) => n).map(([k, n]) => H().pill('na', `${statuses[k]}: ${n}`)).join(' ')}</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Acción</th><th>Canal · periodo</th><th>Driver</th><th>Estado</th><th class="num">Impacto simulado</th><th>Última medición</th><th></th></tr></thead>
        <tbody>${actions.map((a) => {
          const m = FP.actionTracking.latest(plan, a.actionId);
          return `<tr class="${a === sel ? 'row-current' : ''}"><td><strong>${esc(a.actionId)}</strong> ${esc(a.title)}<span class="cell-sub">${esc(a.owner || 'Sin responsable')}</span></td>
            <td>${esc(FP.navigation.contextLabel({ channel: a.channel }))}<span class="cell-sub">${esc(a.period ? a.period.label || '' : '')}</span></td>
            <td>${esc(DRIVER[a.driver] || a.driver || '—')}</td><td>${esc(statuses[a.status])}</td>
            <td class="num">${esc(money(a.expectedImpact ? a.expectedImpact.incrementalValue : null))}<span class="cell-sub">simulado</span></td>
            <td>${m ? `${H().pill(CONS[m.consistency][0], CONS[m.consistency][1])}<span class="cell-sub">${esc(m.measurementDate)} · ${m.observedDays}/${m.windowDays} días</span>` : H().pill('na', 'Sin medir')}</td>
            <td><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-measure" data-id="${esc(a.actionId)}">Medir</button>
              <button type="button" class="btn btn--small btn--ghost" data-action="mx-select" data-id="${esc(a.actionId)}">Ver cadena</button></div></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">Para cambiar responsable, estado o fechas usa el Recovery Center en el canal y periodo de la acción. Medir no cambia plan, forecast ni escenarios.</p>`;

    const nodes = FP.traceability.chain(sel, { scenarios, measurements: plan.measurements,
      signals: state.rc.analysis ? state.rc.analysis.signals : [] });
    $('mx-chain').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Cadena trazable · ${esc(sel.actionId)}</h3></div>
      <ol class="tree">${nodes.map((n) => `<li class="tree-node"><span class="tree-node__tag">${esc(n.kind)} ${n.state ? FP.help.stateTag(n.state) : ''}</span>
        <div><strong>${esc(n.title)}</strong>${fin(n.value) ? ` <span class="num">${esc(n.kind === 'Resultado observado' ? money(n.value) : n.kind === 'Impacto simulado' || n.kind === 'Brecha' ? money(n.value) : F().currency(n.value, 0))}</span>` : ''}
        ${n.detail ? `<span class="cell-sub">${esc(n.detail)}</span>` : ''}<span class="cell-sub tree-node__src">Origen: ${esc(n.source || '—')}</span></div></li>`).join('')}</ol>`;

    const measured = plan.measurements.filter((m) => m.consistency !== 'insufficient_data');
    const groups = ['consistent', 'partial', 'not_consistent'].map((k) => [k, measured.filter((m) => m.consistency === k)]);
    $('mx-learn').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Aprendizajes</h3><span class="field__hint">Descriptivo: qué fue consistente con lo simulado. No establece causalidad.</span></div>
      ${measured.length ? `<div class="grid-3">${groups.map(([k, list]) => `<section><h4>${H().pill(CONS[k][0], CONS[k][1])} (${list.length})</h4>
        <ul class="plain-list">${list.map((m) => { const a = actions.find((x) => x.actionId === m.actionId);
          return `<li><strong>${esc(m.actionId)}</strong> ${esc(a ? a.title : '')} · ${esc(DRIVER[a && a.driver] || '')}<span class="cell-sub">Realización ${fin(m.realization) ? `${(m.realization * 100).toFixed(0)} %` : '—'} · ${esc(m.measurementDate)}</span></li>`; }).join('') || '<li class="cell-sub">—</li>'}</ul></section>`).join('')}</div>`
        : '<p class="note">Todavía no hay mediciones con real en la ventana de las acciones.</p>'}`;
  }

  FP.measureView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
