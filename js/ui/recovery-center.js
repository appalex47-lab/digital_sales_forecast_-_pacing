/**
 * recovery-center.js — Recovery Center (Fase 6): contexto, brecha, drivers, hipótesis,
 * árbol de trazabilidad (brecha → … → resultado observado), importación de exports y exportación.
 * Los escenarios y acciones se pintan en scenario-view.js y action-plan-view.js.
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
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DRIVER = { trafficVolume: 'Volumen', conversionRate: 'CR', aov: 'AOV' };

  function renderContext(state) {
    const esc = H().esc;
    const rc = state.rc;
    const s = rc.settings;
    const imp = rc.imported;
    const run = state.fc.run;
    const year = state.year;
    let keyField = '';
    if (s.periodType === 'month') keyField = `<select id="rc-pkey" data-action="rc-setting" data-key="periodKey">${MONTHS.map((m, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`;
      return `<option value="${k}" ${s.periodKey === k ? 'selected' : ''}>${m} ${year}</option>`; }).join('')}</select>`;
    else if (s.periodType === 'week' && run) keyField = `<select id="rc-pkey" data-action="rc-setting" data-key="periodKey">${run.total.weeks.map((w) =>
      `<option value="${w.key}" ${s.periodKey === w.key ? 'selected' : ''}>${w.key} (${w.weekStart} a ${w.weekEnd})</option>`).join('')}</select>`;
    else if (s.periodType === 'day') keyField = `<input id="rc-pkey" type="date" value="${esc(s.periodKey || '')}" data-action="rc-setting" data-key="periodKey">`;
    else if (s.periodType === 'range') keyField = `<div class="btn-row"><input type="date" value="${esc(s.start || '')}" data-action="rc-setting" data-key="start" aria-label="Desde">
      <input type="date" value="${esc(s.end || '')}" data-action="rc-setting" data-key="end" aria-label="Hasta"></div>`;
    const k = rc.constraints;
    const cnum = (key, label, hint, scale) => `<div class="field"><label for="rc-c-${key}" class="field__hint">${esc(label)}</label>
      <input id="rc-c-${key}" type="number" step="0.01" value="${fin(k[key]) ? esc(+(k[key] * scale).toFixed(4)) : ''}" data-action="rc-constraint" data-key="${key}" data-scale="${scale}" placeholder="Sin restricción">
      <span class="field__hint">${esc(hint)}</span></div>`;
    $('rc-context').innerHTML = `
      ${imp ? `<div class="banner banner--warning" role="status"><p class="banner__title">Trabajando sobre ${esc(imp.sourceFile)}</p>
        <p class="banner__text">Contexto importado (${esc(imp.source === 'analysis_import' ? 'analysis_export' : 'reforecast_export')}): ${esc(imp.period.label || '')}. Los datos de la app no cambian.
        <button type="button" class="btn btn--small" data-action="rc-clear-import">Volver a los datos de la app</button></p></div>` : ''}
      <div class="filters">
        ${imp ? '' : `
        <div class="field"><label for="rc-ch" class="field__hint">Canal</label>
          <select id="rc-ch" data-action="rc-setting" data-key="channel">${[['total', 'Total digital'], ...C().channels.map((c) => [c.id, c.label])].map(([v, l]) =>
            `<option value="${v}" ${s.channel === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><span class="field__hint">Periodo</span>${H().segmented('rc-ptype', [['year', 'Año'], ['month', 'Mes'], ['week', 'Semana'], ['day', 'Día'], ['range', 'Rango']], s.periodType)}</div>
        ${s.periodType !== 'year' ? `<div class="field"><span class="field__hint">Cuál</span>${keyField}</div>` : ''}
        <div class="field"><label for="rc-apply" class="field__hint">Aplicar escenarios a</label>
          <select id="rc-apply" data-action="rc-setting" data-key="applyTo">
            <option value="future" ${s.applyTo === 'future' ? 'selected' : ''}>Días no cerrados (recuperación)</option>
            <option value="all" ${s.applyTo === 'all' ? 'selected' : ''}>Todo el periodo (retrospectivo)</option></select></div>
        <div class="field"><label for="rc-cmp" class="field__hint">Diagnóstico de origen</label>
          <select id="rc-cmp" data-action="rc-setting" data-key="comparison">${Object.entries(C().diagnostics.comparisons).map(([id, c]) =>
            `<option value="${id}" ${s.comparison === id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>`}
        <div class="field"><span class="field__hint">Archivos</span><div class="btn-row">
          <label class="btn btn--small file-btn">Importar analysis_export<input type="file" accept=".json,application/json" data-action="rc-import" data-kind="analysis"></label>
          <label class="btn btn--small file-btn">Importar reforecast_export<input type="file" accept=".json,application/json" data-action="rc-import" data-kind="reforecast"></label>
          <button type="button" class="btn btn--small btn--primary" data-action="rc-export">Exportar action_plan_export.json</button></div></div>
      </div>
      <details class="disclosure"><summary>Restricciones (opcionales)</summary><div class="panel__body"><div class="settings-grid">
        ${cnum('maxTrafficIncrease', 'Volumen máximo (+%)', 'Ej. 8 = +8 %', 100)}
        ${cnum('maxCRIncrease', 'CR máximo (+pp)', 'Ej. 0.20 = +0.20 pp', 100)}
        ${cnum('maxAOVIncrease', 'AOV máximo (+%)', 'Ej. 5 = +5 %', 100)}
        ${cnum('budget', `Presupuesto (${C().currency})`, 'Referencia; no se usa en los cálculos', 1)}
      </div><p class="field__hint">Los escenarios que excedan una restricción se marcan siempre; el cálculo inverso muestra cuánto se recupera dentro de ellas.</p></div></details>`;
  }

  function renderGap(state) {
    const esc = H().esc;
    const rc = state.rc;
    const a = rc.analysis;
    const g = a ? a.gap : null;
    if (!g) { $('rc-gap').innerHTML = `<div class="empty"><strong>Sin brecha que analizar</strong>${esc(rc.base && rc.base.errors ? rc.base.errors.join(' ') : '')}</div>`; return; }
    const r = g.reforecast;
    $('rc-gap').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Brecha · ${esc(FP.scenarioEngine.chLabel(rc.ctx.channel === '__import' && rc.ctx.importedChannel ? rc.ctx.importedChannel.id : rc.ctx.channel))} · ${esc(rc.ctx.period.label)}</h3>
        <span class="field__hint">Referencia ${esc(rc.ctx.referenceDate || '—')}, corte ${esc(rc.ctx.cutoff || '—')}</span></div>
      <dl class="kpis kpis--6">
        <div title="Plan original del periodo (${esc(rc.ctx.planVersion ? rc.ctx.planVersion.label : 'archivo')})"><dt>Plan <span class="tag">Plan</span></dt><dd class="num">${esc(money(g.plan))}</dd></div>
        <div title="Real de los días cerrados del periodo"><dt>Actual <span class="tag tag--obs">Observado</span></dt><dd class="num">${esc(money(g.actualToDate))}</dd></div>
        <div title="Real de días cerrados + forecast del método en uso para días abiertos"><dt>Forecast <span class="tag">Forecast</span></dt><dd class="num">${esc(money(g.base))}</dd></div>
        <div title="Plan − forecast del periodo"><dt>Forecast gap</dt><dd class="num">${esc(fin(g.gapBefore) ? (g.gapBefore > 0 ? `−${money(g.gapBefore)}` : `+${money(-g.gapBefore)}`) : F().DASH)}</dd>
          <small>${esc(g.noGap ? 'La base alcanza el plan' : 'Falta para el plan')}</small></div>
        <div title="Fase 4: pendiente del horizonte ${esc(r ? r.horizon || '' : '')}"><dt>Reforecast requerido <span class="tag">Reforecast</span></dt><dd class="num">${esc(money(r ? r.requiredTotal : null))}</dd>
          <small>${esc(r && r.key ? `horizonte ${r.key}` : '')}</small></div>
        <div><dt>Presión de recuperación</dt><dd class="num">${esc(r ? F().signedPercent(r.pressure, 1) : F().DASH)}</dd><small>Requerido vs plan de esos días</small></div>
      </dl>
      <p class="field__hint">Pasa el cursor sobre cada cifra para ver su origen. El gap se calcula para el canal y periodo elegidos; el reforecast requerido viene del horizonte del módulo de Reforecast.</p>`;
  }

  function renderChain(state) {
    const esc = H().esc;
    const rc = state.rc;
    const a = rc.analysis;
    if (!a) { $('rc-chain').innerHTML = ''; return; }
    const drivers = a.drivers || [];
    const hyps = a.hypotheses || [];
    const dx = rc.diagnosis;
    $('rc-chain').innerHTML = `
      <div class="grid-2 grid-2--tight">
        <section><h4>Drivers (Nivel 1) ${dx ? `<span class="cell-sub">${esc(dx.comparison.label)}</span>` : ''}</h4>
          ${drivers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Driver</th><th class="num">Δ %</th><th class="num">Contribución</th></tr></thead>
            <tbody>${drivers.map((d) => `<tr><td>${esc(d.label || DRIVER[d.driver])}</td><td class="num">${esc(F().signedPercent(d.deltaPct, 1))}</td>
              <td class="num">${esc(signedMoney(d.contribution))}</td></tr>`).join('')}</tbody></table></div>`
            : `<p class="note">${esc(dx ? (dx.notes || []).join(' ') || 'Sin drivers para esta comparación.' : 'El diagnóstico aplica a mes, semana o año; para día o rango usa un periodo mayor.')}</p>`}</section>
        <section><h4>Hipótesis (requieren investigación)</h4>
          ${hyps.length ? `<ul class="alert-list">${hyps.slice(0, 8).map((h) => `<li>${H().pill(h.priority === 'high' ? 'warning' : 'na', h.id)} <span>${esc(h.hypothesis)}</span></li>`).join('')}</ul>`
            : '<p class="note">Sin hipótesis: sin evidencia no se crean escenarios ligados ni acciones.</p>'}</section>
      </div>`;
  }

  /** Árbol trazable de una acción: brecha → driver → señal → hipótesis → escenario → acción → impacto → observado. */
  function renderTree(state) {
    const esc = H().esc;
    const rc = state.rc;
    const a = rc.analysis;
    const act = rc.plan.actions.find((x) => x.actionId === rc.treeActionId) || (a && a.actions[0]) || null;
    if (!a || !act) { $('rc-tree').innerHTML = '<div class="subhead"><h3 class="panel__title">Cadena de trazabilidad</h3></div><p class="note">Agrega una acción al plan para recorrer la cadena completa.</p>'; return; }
    const sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === act.scenarioId);
    const hyp = (a.hypotheses || []).find((h) => h.id === act.hypothesisId);
    const sigs = (a.signals || []).filter((s) => (act.signalIds || []).includes(s.id) || (hyp && (hyp.relatedSignals || []).includes(s.id)));
    const drv = (a.drivers || []).find((d) => d.driver === act.driver);
    const m = FP.actionTracking.latest(rc.plan, act.actionId);
    const node = (tag, title, body, source) => `<li class="tree-node"><span class="tree-node__tag">${esc(tag)}</span>
      <div><strong>${esc(title)}</strong><span class="cell-sub">${body}</span>${source ? `<span class="cell-sub tree-node__src">Origen: ${esc(source)}</span>` : ''}</div></li>`;
    $('rc-tree').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Cadena de trazabilidad · ${esc(act.actionId)}</h3>
        <select data-action="rc-tree-select" aria-label="Acción">${a.actions.map((x) => `<option value="${esc(x.actionId)}" ${x.actionId === act.actionId ? 'selected' : ''}>${esc(x.actionId)} · ${esc(x.title)}</option>`).join('')}</select></div>
      <ol class="tree">
        ${node('Brecha', a.gap && fin(a.gap.gapBefore) ? `${a.gap.gapBefore > 0 ? 'Falta' : 'Sobra'} ${money(Math.abs(a.gap.gapBefore))}` : '—', esc(`Plan ${money(a.gap ? a.gap.plan : null)} vs forecast ${money(a.gap ? a.gap.base : null)}`), `plan original y forecast (${rc.ctx.forecastMethod ? rc.ctx.forecastMethod.id : 'archivo'}), ${rc.ctx.period.label}`)}
        ${node('Driver', DRIVER[act.driver] || act.driver || '—', drv ? esc(`Contribución matemática ${signedMoney(drv.contribution)} (${F().signedPercent(drv.deltaPct, 1)})`) : 'Sin contribución calculada en esta comparación', 'atribución de Nivel 1 (diagnóstico)')}
        ${node('Señal', sigs.length ? `${sigs.length} señal(es)` : 'Sin señales ligadas', sigs.slice(0, 3).map((s) => esc(s.evidence)).join('<br>'), 'motor de señales')}
        ${node('Hipótesis', act.hypothesisId || '—', esc(act.hypothesis || (hyp ? hyp.hypothesis : '')), 'requiere investigación')}
        ${node('Escenario', sc ? `${sc.scenarioId} · ${sc.name}` : '—', sc ? esc(`${FP.scenarioView.changesText(sc.inputs)} · ${FP.scenarioView.targetText(sc.target)}`) : '', sc ? `simulación del ${sc.createdAt.slice(0, 10)}` : null)}
        ${node('Acción', act.title, esc(`${C().recovery.actionStatuses[act.status]} · ${act.owner || 'sin responsable'} · ${act.startDate || '¿inicio?'} a ${act.endDate || '¿fin?'}`), null)}
        ${node('Impacto simulado', signedMoney(act.expectedImpact ? act.expectedImpact.incrementalValue : null), esc(act.expectedImpact && fin(act.expectedImpact.recoveryPercent) ? `Recovery simulado ${F().percent(act.expectedImpact.recoveryPercent, 1)} del gap` : 'Simulación, no garantía'), 'escenario (cálculo determinístico)')}
        ${node('Resultado observado', m ? `${FP.pacingView.signed(m.metric, m.delta.deltaVsBaseline)} vs baseline` : 'Sin medición', m ? esc(m.statement) : 'Mide cuando haya real en la ventana de la acción.', m ? `real cargado, ${m.observedDays} días` : null)}
      </ol>`;
  }

  function render(state) {
    renderContext(state);
    renderGap(state);
    renderChain(state);
    FP.scenarioView.render(state);
    FP.actionPlanView.render(state);
    renderTree(state);
  }

  FP.recoveryCenter = { render };
})(typeof window !== 'undefined' ? window : globalThis);
