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
      ['mx-chain', 'mx-learn', 'mx-decision'].forEach((id) => { const e = $(id); if (e) e.innerHTML = ''; });
      return;
    }
    const sel = actions.find((a) => a.actionId === state.ux.measureAction) || actions[0];
    const statuses = C().recovery.actionStatuses;
    $('mx-actions').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Acciones y seguimiento</h3>
        <span>${Object.keys(statuses).map((k) => [k, actions.filter((a) => a.status === k).length]).filter(([, n]) => n).map(([k, n]) => H().pill('na', `${statuses[k]}: ${n}`)).join(' ')}</span></div>
      <div class="table-wrap"><table class="table ds-table">
        <thead><tr><th>Acción</th><th>Canal · periodo</th><th>Driver</th><th>Estado</th><th class="num" data-state="scenario">Impacto simulado</th><th>Última medición</th><th></th></tr></thead>
        <tbody>${actions.map((a) => {
          const m = FP.actionTracking.latest(plan, a.actionId);
          return `<tr class="${a === sel ? 'row-current' : ''}"><td><strong>${esc(a.actionId)}</strong> ${esc(a.title)}<span class="cell-sub">${esc(a.owner || 'Sin responsable')}</span></td>
            <td>${esc(FP.navigation.contextLabel({ channel: a.channel }))}<span class="cell-sub">${esc(a.period ? a.period.label || '' : '')}</span></td>
            <td>${esc(DRIVER[a.driver] || a.driver || '—')}</td><td>${esc(statuses[a.status])}</td>
            <td class="num">${esc(money(a.expectedImpact ? a.expectedImpact.incrementalValue : null))}<span class="cell-sub"><span class="ds-badge ds-badge--scenario">simulado</span></span></td>
            <td>${m ? `${H().pill(CONS[m.consistency][0], CONS[m.consistency][1])}<span class="cell-sub">${esc(m.measurementDate)} · ${m.observedDays}/${m.windowDays} días</span>` : H().pill('na', 'Sin medir')}</td>
            <td><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-measure" data-id="${esc(a.actionId)}">Medir</button>
              <button type="button" class="btn btn--small btn--ghost" data-action="mx-select" data-id="${esc(a.actionId)}">Ver cadena</button></div></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">Para cambiar responsable, estado o fechas usa el Recovery Center en el canal y periodo de la acción. Medir no cambia plan, forecast ni escenarios.</p>`;

    const nodes = FP.traceability.chain(sel, { scenarios, measurements: plan.measurements,
      signals: state.rc.analysis ? state.rc.analysis.signals : [] });
    $('mx-chain').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Cadena trazable · ${esc(sel.actionId)}</h3></div>
      <ol class="tree">${nodes.map((n) => `<li class="tree-node"><span class="tree-node__tag">${n.state ? `${esc(n.kind)} ${FP.help.stateTag(n.state)}` : `<span class="${(FP.recoveryCenter.NODE_BADGE || {})[n.kind] || 'ds-badge'}">${esc(n.kind)}</span>`}</span>
        <div><strong>${esc(n.title)}</strong>${fin(n.value) ? ` <span class="num">${esc(n.kind === 'Resultado observado' ? money(n.value) : n.kind === 'Impacto simulado' || n.kind === 'Brecha' ? money(n.value) : F().currency(n.value, 0))}</span>` : ''}
        ${n.detail ? `<span class="cell-sub">${esc(n.detail)}</span>` : ''}<span class="cell-sub tree-node__src">Origen: ${esc(n.source || '—')}</span></div></li>`).join('')}</ol>`;


    $('mx-decision').innerHTML = decisionPanel(state, plan, sel);
    const measured = plan.measurements.filter((m) => m.consistency !== 'insufficient_data');
    const groups = ['consistent', 'partial', 'not_consistent'].map((k) => [k, measured.filter((m) => m.consistency === k)]);
    $('mx-learn').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Aprendizajes</h3><span class="field__hint">Descriptivo: qué fue consistente con lo simulado. No establece causalidad.</span></div>
      ${measured.length ? `<div class="grid-3">${groups.map(([k, list]) => `<section><h4>${H().pill(CONS[k][0], CONS[k][1])} (${list.length})</h4>
        <ul class="plain-list">${list.map((m) => { const a = actions.find((x) => x.actionId === m.actionId);
          return `<li><strong>${esc(m.actionId)}</strong> ${esc(a ? a.title : '')} · ${esc(DRIVER[a && a.driver] || '')}<span class="cell-sub">Realización ${fin(m.realization) ? `${(m.realization * 100).toFixed(0)} %` : '—'} · ${esc(m.measurementDate)}</span></li>`; }).join('') || '<li class="cell-sub">—</li>'}</ul></section>`).join('')}</div>`
        : '<p class="note">Todavía no hay mediciones con real en la ventana de las acciones.</p>'}`;
  }


  /** Decisión y conclusión estructuradas de la acción seleccionada (campos propios; las notas libres quedan como complemento). */
  function decisionPanel(state, plan, a) {
    const esc = H().esc, AP = FP.actionPlan, d = a.decision, c = a.conclusion;
    const m = FP.actionTracking.latest(plan, a.actionId), valid = AP.validMeasurements(plan, a);
    const ev = c ? c.evidence : null;
    const hist = a.history.filter((h) => h.field === 'decision' || h.field === 'conclusion');
    const field = (id, label, val, ph, type) => `<div class="field"><label for="${id}">${label}</label><${type === 'area' ? 'textarea rows="2"' : 'input type="text"'} id="${id}" placeholder="${esc(ph || '')}" ${type === 'area' ? `>${esc(val || '')}</textarea>` : `value="${esc(val || '')}">`}</div>`;
    const why = !valid.length ? (AP.conclusionProblem(plan, a, { outcome: 'keep', justification: 'x'.repeat(12), decidedBy: a.owner || 'x' })) : null;
    const blockedConclusion = !['measuring', 'validated', 'rejected'].includes(a.status) || !valid.length;
    return `<div class="subhead"><h3 class="panel__title">Decisión y conclusión · ${esc(a.actionId)}</h3>
        <span class="field__hint">Hallazgo → hipótesis → decisión → ejecución → medición → conclusión. Cada paso se registra aparte.</span></div>
      <div class="grid-2">
        <section data-block="decision"><h4>Decisión</h4>
          ${d ? `<p data-decision-saved="1"><strong>${esc(d.decision)}</strong><span class="cell-sub">Objetivo: ${esc(d.objective)} · ${esc(d.decidedBy)}, ${esc(d.decidedAt)}${d.successIndicator ? ` · Indicador de éxito: ${esc(d.successIndicator)}` : ''}</span>
            <span class="cell-sub">Hipótesis a validar (no demostrada): ${esc(d.hypothesisToTest || '—')}${d.expectedResult ? ` · Resultado esperado: ${esc(d.expectedResult)}` : ''}</span></p>` : '<p class="note">Todavía no se registró la decisión ni su objetivo.</p>'}
          <details ${d ? '' : 'open'}><summary>${d ? 'Revisar la decisión' : 'Registrar la decisión'}</summary>
            ${field('dc-decision', 'Decisión adoptada', d && d.decision, 'Ej.: Corregir el checkout en app durante 2 semanas')}
            ${field('dc-objective', 'Objetivo de la intervención', d && d.objective, 'Ej.: Recuperar 0.2 pp de conversión')}
            ${field('dc-by', 'Responsable', (d && d.decidedBy) || a.owner, '')}
            ${field('dc-success', 'Indicador de éxito (opcional)', d && d.successIndicator, 'Ej.: conversión de app vs línea base')}
            ${field('dc-hyp', 'Hipótesis que se desea comprobar (opcional)', (d && d.hypothesisToTest) || a.hypothesis, 'Es una hipótesis a validar, no una causa demostrada')}
            <p class="field__hint">Ventana de evaluación: ${esc(a.startDate || '¿inicio?')} a ${esc(a.endDate || '¿fin?')} (se cambia en el plan de acción). Aprobar la acción no requiere este registro, pero sin él la conclusión no tiene objetivo contra el cual compararse.</p>
            <button type="button" class="btn btn--small" data-action="ac-decision-save" data-id="${esc(a.actionId)}">Guardar decisión</button>
          </details></section>
        <section data-block="conclusion"><h4>Conclusión</h4>
          ${c ? `<p data-conclusion-saved="1">${H().pill(c.outcome === 'keep' ? 'ok' : c.outcome === 'stop' ? 'error' : 'warning', AP.CONCLUSIONS[c.outcome].label)} <span class="cell-sub">${esc(AP.CONCLUSIONS[c.outcome].meaning)}</span>
            <span class="cell-sub">${esc(c.justification)} · ${esc(c.decidedBy)}, ${esc(c.decidedAt)}</span>
            <span class="cell-sub">Evidencia: ${esc(ev.metric)} observado ${F().currency ? esc(String(Math.round(ev.observed))) : ''} vs base ${esc(String(Math.round(ev.baseline)))} (${ev.observedDays} de ${ev.windowDays} días con real). ${esc(c.objectiveRelation)}</span>
            ${c.nextAction ? `<span class="cell-sub">Acción siguiente: ${esc(c.nextAction)}</span>` : ''}</p>` : '<p class="note">Todavía no hay una conclusión documentada.</p>'}
          ${blockedConclusion ? `<p class="note" data-conclusion-blocked="1">${esc(!['measuring', 'validated', 'rejected'].includes(a.status) ? 'La conclusión se registra cuando la acción está En medición. Antes no hay un resultado que concluir.' : (why || 'Todavía no hay una medición válida.'))}</p>` : ''}
          <details ${c || blockedConclusion ? '' : 'open'}><summary>${c ? 'Cambiar la conclusión (queda el historial)' : 'Registrar la conclusión'}</summary>
            <div class="field"><label for="cc-outcome">Conclusión</label><select id="cc-outcome">${Object.entries(AP.CONCLUSIONS).map(([k, v]) => `<option value="${k}" ${c && c.outcome === k ? 'selected' : ''}>${esc(v.label)} — ${esc(v.meaning)}</option>`).join('')}</select></div>
            ${field('cc-just', 'Justificación (qué evidencia te lleva a esto)', c && c.justification, '', 'area')}
            ${field('cc-by', 'Responsable', (c && c.decidedBy) || a.owner, '')}
            ${field('cc-next', 'Acción siguiente (obligatoria si ajustas)', c && c.nextAction, '')}
            <p class="field__hint">Una medición no concluye por sí sola: compara contra la línea base y no prueba causalidad. La conclusión es tu juicio con esa evidencia${m ? ` (última medición: ${esc(m.measurementDate)}, ${esc(m.consistency)})` : ''}.</p>
            <button type="button" class="btn btn--small" data-action="ac-conclusion-save" data-id="${esc(a.actionId)}">Guardar conclusión</button>
          </details></section>
      </div>
      ${hist.length ? `<details><summary>Historial de decisión y conclusión (${hist.length})</summary><ul class="plain-list">${hist.map((h) => `<li>${esc(h.at.slice(0, 16).replace('T', ' '))} · ${h.field === 'decision' ? 'Decisión' : 'Conclusión'} ${h.from ? 'modificada' : 'registrada'}${h.note ? ` · ${esc(h.note)}` : ''}${h.from ? `<span class="cell-sub">Antes: ${esc(h.field === 'decision' ? h.from.decision : (AP.CONCLUSIONS[h.from.outcome] || {}).label)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}`;
  }

  FP.measureView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
