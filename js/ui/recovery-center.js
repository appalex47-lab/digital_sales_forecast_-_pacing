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
  const PV = () => FP.pacingView;
  // Etiquetas de la cadena de trazabilidad: evidencia (Hecho · Driver · Señal · Hipótesis), escenario (simulado) y observado
  const NODE_BADGE = { Brecha: 'ds-badge ds-badge--chain ds-badge--fact', Driver: 'ds-badge ds-badge--chain ds-badge--driver', 'Señal': 'ds-badge ds-badge--chain ds-badge--signal',
    'Hipótesis': 'ds-badge ds-badge--chain ds-badge--hyp', Escenario: 'ds-badge ds-badge--scenario', 'Acción': 'ds-badge ds-badge--neutral',
    'Impacto simulado': 'ds-badge ds-badge--scenario', 'Resultado observado': 'ds-badge ds-badge--observed' };

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
    const fx = rc.fromDx, ALT = { A: 'Solo volumen', B: 'Solo CR', C: 'Solo AOV' };
    const dxBanner = fx ? `<div class="banner" role="status" data-dx-banner="1"><p class="banner__title">Vienes del Diagnóstico</p><p class="banner__text">${fx.hypId ? `Hipótesis <strong>${esc(fx.hypId)}${fx.hyp ? ` · ${esc(String(fx.hyp).replace(/\.$/, ''))}` : ''}</strong> ya ligada. ` : ''}${fx.alt && ALT[fx.alt] ? `Ruta del driver cargada: <strong>${esc(ALT[fx.alt])}</strong>. ` : ''}Nada está guardado todavía: revisa y pulsa «Guardar como escenario»${fx.alt ? '' : ' o elige la acción'}. <button type="button" class="btn btn--small" data-action="go" data-view="diagnostico">↩ Volver al diagnóstico</button> <button type="button" class="btn btn--small btn--ghost" data-action="rc-dx-dismiss">Quitar aviso</button></p></div>` : '';
    $('rc-context').innerHTML = `
      ${dxBanner}${imp ? `<div class="banner banner--warning" role="status"><p class="banner__title">Trabajando sobre ${esc(imp.sourceFile)}</p>
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
            <option value="all" ${s.applyTo === 'all' ? 'selected' : ''}>Todo el periodo (retrospectivo)</option></select></div>`}
      </div>`;
    $('rc-extra').innerHTML = `
      <div class="filters">
        ${imp ? '' : `
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
      <div class="metric-grid metric-grid--3">
        ${PV().card('Plan', esc(money(g.plan)), '', 'plan', '', `Plan original del periodo (${rc.ctx.planVersion ? rc.ctx.planVersion.label : 'archivo'})`)}
        ${PV().card('Actual', esc(money(g.actualToDate)), '', 'actual', '', 'Real de los días cerrados del periodo')}
        ${PV().card('Forecast', esc(money(g.base)), '', 'forecast', '', 'Real de días cerrados + forecast del método en uso para días abiertos')}
        ${PV().card('Forecast gap', esc(fin(g.gapBefore) ? (g.gapBefore > 0 ? `−${money(g.gapBefore)}` : `+${money(Math.abs(g.gapBefore))}`) : F().DASH), esc(g.noGap ? 'La base alcanza el plan' : 'Falta para el plan'), 'forecast', '', 'Plan − forecast del periodo')}
        ${PV().card('Reforecast requerido', esc(money(r ? r.requiredTotal : null)), esc(r && r.key ? `horizonte ${r.key}` : ''), 'reforecast', '', `Fase 4: pendiente del horizonte ${r ? r.horizon || '' : ''}`)}
        ${PV().card('Presión de recuperación', esc(r ? F().signedPercent(r.pressure, 1) : F().DASH), 'Requerido vs plan de esos días')}
      </div>
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
          ${drivers.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Driver</th><th class="num">Δ %</th><th class="num">Contribución</th></tr></thead>
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
    const node = (tag, title, body, source) => `<li class="tree-node"><span class="tree-node__tag"><span class="${NODE_BADGE[tag] || 'ds-badge'}">${esc(tag)}</span></span>
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

  /** «Ver más» solo existe si hay algo que detallar: sin datos no se muestran desplegables vacíos. */
  function syncMore() {
    const root = document.getElementById('view-recovery'); if (!root) return;
    let any = false;
    root.querySelectorAll('details.rc-more').forEach((d) => {
      const has = [...d.querySelectorAll('.panel__body')].some((b) => b.textContent.trim());
      d.hidden = !has; if (has) any = true;
    });
    const layer = root.querySelector('.rc-layer'); if (layer) layer.hidden = !any;
  }

  /** Estado por canal: aviso «meta sana, pero hay gap en estos canales» + tarjetas por canal (gap en pesos, de mayor a menor). */
  function renderStatus(state) {
    const esc = H().esc, rc = state.rc, box = $('rc-status'), panel = $('rc-status-panel');
    if (!box || !panel) return;
    const st = rc.imported ? null : rc.chStatus;
    const sel = rc.settings.channel;
    const hide = () => { panel.hidden = true; box.innerHTML = ''; };
    if (!st || !st.total) return hide();
    const n = st.withGap.length;
    if (!n && sel !== 'total') return hide();
    const unit = { month: 'del mes', week: 'de la semana', year: 'del año', day: 'del día' }[st.periodType] || 'del periodo';
    const pctTxt = (v) => (fin(v) ? `${(Math.abs(v) * 100).toFixed(1).replace('.0', '')} %` : F().DASH);
    const totalHealthy = !(st.total.gap > 0);
    let head;
    if (!n) head = `<div class="rcs__head rcs__head--ok" role="status"><strong>Todos los canales alcanzan su plan</strong><span>No hace falta recuperar en ${esc(st.periodLabel)}.</span></div>`;
    else if (totalHealthy) head = `<div class="rcs__head rcs__head--ok" role="status"><div><span class="rcs__eyebrow">Meta ${unit} · sana</span><strong>El total digital alcanza el plan, pero hay gap por recuperar en ${n} ${n === 1 ? 'canal' : 'canales'}</strong>
      <span>Forecast ${esc(money(st.total.forecast))} vs plan ${esc(money(st.total.plan))} (${esc(signedMoney(st.total.forecast - st.total.plan))}). Lo que sobra en otros canales tapa la brecha de ${st.withGap.map((x) => esc(x.label)).join(' y ')}.</span></div>
      <div class="rcs__sum"><span>Gap por recuperar</span><b>−${esc(money(st.gapSum))}</b></div></div>`;
    else head = `<div class="rcs__head rcs__head--bad" role="status"><div><span class="rcs__eyebrow">Meta ${unit} · con gap</span><strong>El total digital tiene gap de ${esc(money(st.total.gap))} y ${n} ${n === 1 ? 'canal lo aporta' : 'canales lo aportan'}</strong>
      <span>Forecast ${esc(money(st.total.forecast))} vs plan ${esc(money(st.total.plan))}.</span></div><div class="rcs__sum"><span>Gap en canales</span><b>−${esc(money(st.gapSum))}</b></div></div>`;
    const card = (x) => {
      const open = sel === x.id, has = x.scenarios + x.actions > 0;
      const btn = open ? '<span class="ds-badge ds-badge--neutral">Abierto abajo</span>'
        : `<button type="button" class="btn btn--small ${has ? '' : 'btn--primary'}" data-action="rc-open-channel" data-channel="${esc(x.id)}">${has ? `Ver plan de ${esc(x.label)}` : `Crear plan de ${esc(x.label)}`}</button>`;
      return `<div class="rcs__card rcs__card--gap${open ? ' is-open' : ''}" data-channel="${esc(x.id)}"><div class="rcs__row"><b>${esc(x.label)}</b><span class="rcs__pill rcs__pill--bad">Falta ${pctTxt(x.pct)}</span></div>
        <div class="rcs__amt">−${esc(money(x.gap))}</div><div class="rcs__meta">Plan ${esc(money(x.plan))} · forecast ${esc(money(x.forecast))}</div>
        <div class="rcs__meta">${x.scenarios ? `${x.scenarios} escenario${x.scenarios === 1 ? '' : 's'}` : 'Sin escenarios'} · ${x.actions ? `${x.actions} acci${x.actions === 1 ? 'ón' : 'ones'}` : 'sin acciones'}</div><div>${btn}</div></div>`;
    };
    const healthy = st.healthy.length ? `<p class="rcs__ok"><span>Canales sanos:</span> ${st.healthy.map((x) => `<span class="rcs__pill rcs__pill--ok">${esc(x.label)} ${esc(signedPct(x))}</span>`).join(' ')}</p>` : '';
    panel.hidden = false;
    box.innerHTML = `${head}${n ? `<h3 class="rcs__title">Canales con gap · de mayor a menor</h3><div class="rcs__grid">${st.withGap.map(card).join('')}</div>` : ''}${healthy}
      <p class="field__hint">Gap = plan del canal − forecast del canal, mismo cálculo que la brecha de abajo. «Ver plan» cambia el filtro Canal y abre ese canal abajo.</p>`;
  }
  function signedPct(x) { const v = x.plan > 0 ? (x.forecast - x.plan) / x.plan : null; return fin(v) ? `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)} %` : ''; }

  function render(state) {
    renderContext(state);
    renderStatus(state);
    renderGap(state);
    renderChain(state);
    FP.scenarioView.render(state);
    FP.actionPlanView.render(state);
    renderTree(state);
    syncMore();
  }

  FP.recoveryCenter = { render, syncMore, NODE_BADGE };
})(typeof window !== 'undefined' ? window : globalThis);
