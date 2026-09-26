/**
 * diagnostic-view.js — Vista "¿Por qué existe la brecha?" (Fase 5).
 * Pinta `state.dx.run` (FP.diagnosticEngine) respetando la cadena
 * HECHO → DRIVER → SEÑAL → HIPÓTESIS. Solo presentación.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const PRIO = { high: ['error', 'Prioridad alta'], medium: ['warning', 'Prioridad media'], low: ['na', 'Prioridad baja'] };
  const KIND = { driver_change: 'Driver', segment_change: 'Segmento', mix_shift: 'Mezcla', anomaly: 'Posible atípico' };
  const CONF_PILL = { excellent: 'ok', sufficient: 'ok', limited: 'warning', insufficient: 'error' };
  const confPill = (c) => (c ? H().pill(CONF_PILL[c], C().confidenceLabels[c]) : H().pill('na', 'No aplica'));
  const stage = (txt) => `<span class="stage-tag">${txt}</span>`;
  const signed = (k, v) => FP.pacingView.signed(k, v);
  const spct = (v) => F().signedPercent(v, 1);
  const fmtM = (m, v) => (['customers', 'newCustomers', 'returningCustomers', 'items'].includes(m) ? F().integer(v) : m === 'itemsPerOrder' ? F().decimal(v, 2) : F().metric(m, v));
  const chLabel = (ch) => FP.pacingView.chLabel(ch);

  function periodOptions(state) {
    const d = state.dx.settings;
    const y = state.year;
    if (d.periodType === 'year') return [[String(y), `Año ${y}`]];
    if (d.periodType === 'month') return MONTHS.map((m, i) => [`${y}-${String(i + 1).padStart(2, '0')}`, `${m} ${y}`]);
    const run = state.fc.run;
    const weeks = run ? run.total.weeks.map((w) => [w.key, `${w.key} (${w.weekStart} a ${w.weekEnd})`]) : [];
    return weeks;
  }

  function renderControls(state) {
    const esc = H().esc;
    const d = state.dx.settings;
    const cfg = C().diagnostics;
    const sel = (id, key, opts, cur, label) => `<div class="field"><label for="${id}" class="field__hint">${esc(label)}</label>
      <select id="${id}" data-action="dx-setting" data-key="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    $('dx-controls').innerHTML = `
      <div class="filters">
        ${sel('dx-cmp', 'comparison', Object.entries(cfg.comparisons).map(([k, c]) => [k, c.label]), d.comparison, 'Comparación')}
        <div class="field"><span class="field__hint">Periodo</span>${H().segmented('dx-period-type', [['month', 'Mes'], ['week', 'Semana'], ['year', 'Año']], d.periodType)}</div>
        ${sel('dx-key', 'periodKey', periodOptions(state), d.periodKey, 'Cuál')}
        ${sel('dx-ch', 'channel', [['total', 'Total digital'], ...C().channels.map((c) => [c.id, c.label])], d.channel, 'Canal')}
        ${sel('dx-metric', 'metric', [['revenue', 'Venta (volumen × CR × AOV)'], ['orders', 'Pedidos (volumen × CR)']], d.metric, 'Métrica')}
        ${sel('dx-method', 'method', Object.entries(cfg.attributionMethods), d.method, 'Método de atribución')}
      </div>
      <p class="field__hint">La app no mezcla comparaciones: cada una usa su propia referencia. ${esc(state.dx.run && state.dx.run.assumptions ? state.dx.run.assumptions.pairing : '')}</p>
      <ol class="chain">${['Hecho', 'Driver', 'Señal', 'Hipótesis'].map((s, i) => `<li><strong>${s}</strong><span>${['Qué pasó y cuánto', 'Qué variable lo explica matemáticamente', 'Dónde ocurre y merece investigarse', 'Explicación posible que requiere validación'][i]}</span></li>`).join('')}</ol>`;
  }

  /* ---------- Hecho ---------- */

  function renderResult(d) {
    const esc = H().esc;
    if (d.status !== 'ok') {
      $('dx-result').innerHTML = `<div class="empty"><strong>No hay datos comparables</strong>${esc((d.notes || []).join(' ') || 'Elige otro periodo o comparación.')}</div>`;
      return;
    }
    const r = d.result, k = d.metric;
    const row = (m) => `<tr><th scope="row">${esc(C().metrics[m].label)}</th><td class="num">${esc(F().metric(m, r.current[m]))}</td>
      <td class="num">${esc(F().metric(m, r.baseline[m]))}</td><td class="num">${esc(signed(m, r.current[m] !== null && r.baseline[m] !== null ? r.current[m] - r.baseline[m] : null))}</td>
      <td class="num">${esc(spct(FP.metrics.safeDivide(r.current[m], r.baseline[m]) === null ? null : r.current[m] / r.baseline[m] - 1))}</td></tr>`;
    $('dx-result').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${stage('Hecho')} Resultado · ${esc(d.channel.label)} · ${esc(d.period.label)}</h3>
        <span>Confianza de datos: ${confPill(d.confidence.level)}</span></div>
      <p class="fact">${esc(r.fact)}</p>
      <dl class="kpis kpis--3">
        <div><dt>${esc(r.currentLabel)}</dt><dd class="num">${esc(F().metric(k, r.current[k]))}</dd></div>
        <div><dt>${esc(r.baselineLabel)}</dt><dd class="num">${esc(F().metric(k, r.baseline[k]))}</dd></div>
        <div><dt>Brecha</dt><dd class="num">${esc(signed(k, d.gap.abs))}</dd><small>${esc(spct(d.gap.pct))}</small></div>
      </dl>
      <div class="table-wrap"><table class="table table--matrix">
        <thead><tr><th>Métrica</th><th class="num">${esc(r.currentLabel)}</th><th class="num">${esc(r.baselineLabel)}</th><th class="num">Δ</th><th class="num">Δ %</th></tr></thead>
        <tbody>${['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov'].map(row).join('')}</tbody></table></div>
      <p class="field__hint">${d.coverage.paired} días-canal comparados${d.coverage.unpaired ? `; ${d.coverage.unpaired} sin dato en algún lado (excluidos, no se tratan como cero)` : ''}.
        ${d.coverage.currentRange ? `${esc(r.currentLabel)}: ${esc(d.coverage.currentRange.join(' a '))}.` : ''} ${d.coverage.baselineRange && ['actual_vs_previous', 'actual_vs_yoy'].includes(d.comparison.id) ? `Referencia: ${esc(d.coverage.baselineRange.join(' a '))}.` : ''}</p>`;
  }

  /* ---------- Nivel 1 ---------- */

  function renderLevel1(d) {
    const esc = H().esc;
    if (d.status !== 'ok') { $('dx-level1').innerHTML = ''; return; }
    const k = d.metric;
    const drivers = d.level1Drivers;
    const maxAbs = Math.max(...drivers.map((x) => Math.abs(x.contribution || 0)), Math.abs(d.gap.abs || 0), 1);
    const bar = (v, label, cls) => `<div class="wf-row"><span class="wf-label">${esc(label)}</span>
      <span class="wf-track"><span class="wf-zero"></span><span class="wf-bar ${cls}" style="${v >= 0 ? 'left:50%' : `right:50%`};width:${(Math.abs(v || 0) / maxAbs * 50).toFixed(2)}%"></span></span>
      <span class="wf-value num">${esc(signed(k === 'orders' ? 'orders' : 'revenue', v))}</span></div>`;
    const moneyKey = k === 'orders' ? 'orders' : 'revenue';
    const at = d.level1.attribution;
    $('dx-level1').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${stage('Driver')} Nivel 1 · ${esc(k === 'orders' ? 'Pedidos = volumen × CR' : 'Venta = volumen × CR × AOV')}</h3>
        <span class="field__hint">Método: ${esc(d.attributionMethodLabel)}</span></div>
      <p class="fact">${esc(d.level1.statement)}</p>
      <div class="waterfall">
        ${drivers.map((x) => bar(x.contribution, x.label, x.contribution < 0 ? 'wf-bar--neg' : 'wf-bar--pos')).join('')}
        ${bar(d.gap.abs, 'Brecha total', 'wf-bar--total')}
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Driver</th><th class="num">${esc(d.result.baselineLabel)}</th><th class="num">${esc(d.result.currentLabel)}</th><th class="num">Δ %</th>
          <th class="num">Contribución</th><th class="num">% de la brecha</th><th>Tipo</th></tr></thead>
        <tbody>${drivers.map((x) => `<tr class="${x.driver === d.level1.mainDriver ? 'row-current' : ''}"><td><strong>${esc(x.label)}</strong>${x.driver === d.level1.mainDriver ? ' <span class="chip">mayor contribución</span>' : ''}</td>
          <td class="num">${esc(F().metric(x.driver, x.baseline))}</td><td class="num">${esc(F().metric(x.driver, x.current))}</td>
          <td class="num">${esc(spct(x.deltaPct))}</td><td class="num">${esc(signed(moneyKey, x.contribution))}</td>
          <td class="num">${esc(F().percent(x.shareOfGap, 0))}</td>
          <td>${x.sign === 'negative' ? H().pill('warning', 'Contribución negativa') : x.sign === 'positive' ? H().pill('ok', 'Offset positivo') : H().pill('na', 'Sin efecto')}</td></tr>`).join('')}</tbody></table></div>
      <p class="field__hint">${at.status === 'ok' ? `Validación: Σ contribuciones = ${esc(signed(moneyKey, at.total))} (residuo ${esc(F().decimal(at.residual, 6))}). ` : esc(at.note || '')}
        Una contribución grande es una atribución matemática, no la causa operativa. ${d.attributionMethod === 'sequential' ? 'En el método secuencial el orden importa; Shapley reparte de forma simétrica.' : ''}</p>`;
  }

  /* ---------- Árbol de drivers (Nivel 2) ---------- */

  function renderTree(state, d) {
    const esc = H().esc;
    if (d.status !== 'ok') { $('dx-tree').innerHTML = ''; return; }
    const moneyKey = d.metric === 'orders' ? 'orders' : 'revenue';
    const unavailable = d.availability.unavailable.map((x) => x.label);
    const branches = d.driverTree.map((t) => `<details class="tree-node" ${t.driver === d.level1.mainDriver ? 'open' : ''}>
      <summary><strong>${esc(t.label)}</strong> <span class="num">${esc(signed(moneyKey, t.contribution))}</span> <span class="cell-sub-inline">${esc(spct(t.deltaPct))}</span></summary>
      ${t.branches.length ? t.branches.map((b) => `<div class="tree-branch"><h5>${esc(b.label)}${b.reference === 'yoy' ? ' <span class="chip">vs año anterior</span>' : ''}</h5>
        <ul>${b.groups.map((g) => `<li><span>${esc(g.label)}</span><span class="num">${esc(signed(moneyKey, g.contribution))}</span>
          <span class="cell-sub-inline">${esc(C().metrics[t.driver].label)} ${esc(spct(g.metric ? g.metric.deltaPct : null))} · peso ${esc(F().percent(g.exposure, 0))}</span></li>`).join('')}
          ${b.mix !== null && b.mix !== undefined && b.reference === 'same' ? `<li class="tree-mix"><span>Efecto mezcla</span><span class="num">${esc(signed(moneyKey, b.mix))}</span><span class="cell-sub-inline">cambio de pesos entre grupos</span></li>` : ''}</ul></div>`).join('')
        : '<p class="field__hint">Sin dimensiones con datos para profundizar este driver.</p>'}
    </details>`).join('');
    $('dx-tree').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${stage('Driver')} Nivel 2 · Árbol de drivers</h3></div>
      <div class="tree">${branches}</div>
      <p class="field__hint">Solo se abren ramas con datos. Contribución de cada grupo = misma atribución aplicada al grupo; el efecto mezcla es lo que falta para llegar al total.
        ${d.availability.segmentsReference ? `Segmentos: referencia ${esc(d.availability.segmentsReference.toLowerCase())}. ` : ''}${d.availability.segmentsNote ? esc(d.availability.segmentsNote) + ' ' : ''}
        No disponible en los datos actuales: ${esc(unavailable.join(', ') || 'ninguna')}. Para habilitarlas, carga el archivo de Segmentos en Carga de datos.</p>`;
  }

  /* ---------- Señales ---------- */

  function renderSignals(state, d) {
    const esc = H().esc;
    if (d.status !== 'ok') { $('dx-signals').innerHTML = ''; return; }
    const all = d.signals;
    const list = state.dx.showAllSignals ? all : all.slice(0, 12);
    $('dx-signals').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${stage('Señal')} Señales (${all.length})</h3>
        ${all.length > 12 ? `<button type="button" class="btn btn--small" data-action="dx-toggle-signals">${state.dx.showAllSignals ? 'Ver menos' : 'Ver todas'}</button>` : ''}</div>
      ${all.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Investigación</th><th>Tipo</th><th>Dónde</th><th>Métrica</th><th class="num">Actual</th><th class="num">Referencia</th><th class="num">Δ %</th><th>Evidencia</th></tr></thead>
        <tbody>${list.map((s) => `<tr id="sig-${esc(s.id)}"><td class="num">${esc(s.id)}</td><td>${H().pill(PRIO[s.relevance.priority][0], PRIO[s.relevance.priority][1])}</td>
          <td>${esc(KIND[s.kind] || s.kind)}</td><td>${s.dimensionLabel ? `${esc(s.dimensionLabel)}: <strong>${esc(s.label)}</strong>` : 'Total'}</td>
          <td>${esc(s.metricLabel)}</td>
          <td class="num">${s.kind === 'mix_shift' ? esc(F().percent(s.current, 1)) : esc(fmtM(s.metric, s.current))}</td>
          <td class="num">${s.kind === 'mix_shift' ? esc(F().percent(s.baseline, 1)) : esc(fmtM(s.metric, s.baseline))}</td>
          <td class="num">${esc(s.kind === 'mix_shift' ? `${s.delta > 0 ? '+' : '−'}${F().decimal(Math.abs(s.delta) * 100, 1)} pp` : spct(s.deltaPct))}</td>
          <td class="wrap"><span class="cell-sub">${esc(s.evidence)}</span></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="note">No hay cambios que superen los umbrales de señal.</p>'}
      <p class="field__hint">Prioridad de investigación = impacto × exposición × confianza: una caída grande en un segmento chico pesa menos que una moderada en uno grande. Prioridad alta significa "mirar primero", no culpable. Los posibles atípicos no se eliminan.</p>`;
  }

  /* ---------- Hipótesis ---------- */

  function hypothesisCard(h, d) {
    const esc = H().esc;
    const sigs = h.relatedSignals.map((id) => d.signals.find((s) => s.id === id)).filter(Boolean);
    return `<details class="hyp">
      <summary>${H().pill(PRIO[h.priority][0], PRIO[h.priority][1])} <span class="hyp__text">${esc(h.hypothesis)}</span>
        <span class="chip">${h.source === 'cohere' ? 'Redactada con Cohere' : 'Reglas'}</span> <span class="chip chip--quiet">${esc(h.statusLabel)}</span></summary>
      <ol class="hyp__chain">
        <li><strong>Señales relacionadas</strong>${sigs.map((s) => `<a href="#sig-${esc(s.id)}" class="cell-sub">${esc(s.id)} · ${esc(s.evidence)}</a>`).join('') || '<span class="cell-sub">—</span>'}</li>
        <li><strong>Comparación</strong><span class="cell-sub">${esc(d.comparison.label)} · ${esc(d.channel.label)} · ${esc(d.period.label)}</span></li>
        ${h.justification ? `<li><strong>Justificación</strong><span class="cell-sub">${esc(h.justification)}</span></li>` : ''}
        <li><strong>Mecanismo</strong><span class="cell-sub">${esc(h.mechanism || '—')}</span></li>
        <li><strong>Qué validar</strong>${(h.validationNeeded || []).map((v) => `<span class="cell-sub">• ${esc(v)}</span>`).join('') || '<span class="cell-sub">—</span>'}</li>
      </ol></details>`;
  }

  function renderHypotheses(state, d) {
    const esc = H().esc;
    const ai = state.dx.ai;
    if (d.status !== 'ok') { $('dx-hyps').innerHTML = ''; return; }
    const aiBlock = ai.status === 'busy' ? '<p class="note">Consultando a Cohere…</p>'
      : ai.result && ai.result.ok ? `<h4>Redactadas con Cohere (${esc(ai.result.model)})</h4>${ai.result.hypotheses.map((h) => hypothesisCard(h, d)).join('')}
        ${ai.result.errors.length ? `<p class="field__hint">Validación: ${esc(ai.result.errors.join(' '))}</p>` : ''}`
      : ai.result ? `<p class="note note--warning">Análisis con IA no disponible. ${esc(ai.result.errors.join(' '))} El diagnóstico matemático y las hipótesis por reglas siguen completos.</p>` : '';
    $('dx-hyps').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${stage('Hipótesis')} Hipótesis (${d.hypotheses.length})</h3></div>
      ${d.hypotheses.length ? d.hypotheses.map((h) => hypothesisCard(h, d)).join('') : '<p class="note">No hay evidencia suficiente para formular hipótesis.</p>'}
      ${aiBlock}
      <p class="field__hint">Cada hipótesis cita sus señales y queda como "Requiere investigación". Sin señales localizadas, la hipótesis es genérica y no nombra causas. No son recomendaciones.</p>`;
  }

  /* ---------- Recuperación, confianza, IA ---------- */

  function renderRecovery(d) {
    const esc = H().esc;
    const box = $('dx-recovery');
    if (!d.recovery) { box.innerHTML = ''; box.closest('section').hidden = true; return; }
    box.closest('section').hidden = false;
    const r = d.recovery.drivers;
    const c = r.chain;
    box.innerHTML = `<div class="subhead"><h3 class="panel__title">Recuperación en drivers</h3></div>
      <ol class="driver-chain">
        <li><span>Venta requerida</span><strong class="num">${esc(F().metric('revenue', c.revenue))}</strong></li>
        <li><span>÷ AOV supuesto</span><strong class="num">${esc(F().metric('aov', c.aov))}</strong></li>
        <li><span>= Pedidos</span><strong class="num">${esc(F().metric('orders', c.orders))}</strong></li>
        <li><span>÷ CR supuesto</span><strong class="num">${esc(F().metric('conversionRate', c.conversionRate))}</strong></li>
        <li><span>= Volumen</span><strong class="num">${esc(F().metric('trafficVolume', c.trafficVolume))}</strong></li></ol>
      <div class="table-wrap"><table class="table"><thead><tr><th>Escenario (un solo driver cambia)</th><th class="num">Requerido</th><th class="num">Forecast</th><th class="num">Delta</th></tr></thead>
        <tbody>${Object.entries(r.scenarios).map(([id, x]) => `<tr><td>${id} · ${esc(x.label)}<span class="cell-sub">Se mantiene: ${esc(x.holds)}</span></td>
          <td class="num">${esc(F().metric(x.kind, x.required))}</td><td class="num">${esc(F().metric(x.kind, x.base))}</td>
          <td class="num">${esc(signed(x.kind, x.delta))}<span class="cell-sub">${esc(spct(x.deltaPct))}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="field__hint">${esc(d.recovery.note)}</p>`;
  }

  function renderConfidence(state, d) {
    const esc = H().esc;
    const ai = state.dx;
    $('dx-confidence').innerHTML = `
      <div class="grid-2 grid-2--tight">
        <section><h4>Confianza de datos</h4>
          ${d.confidence.components.length ? `<ul class="alert-list">${d.confidence.components.map((c) => `<li>${confPill(c.level)} <span><strong>${esc(c.label)}.</strong> ${esc(c.note)}</span></li>`).join('')}</ul>` : ''}
          <p class="field__hint">${esc(d.confidence.note)}</p>
          ${(d.validation || []).length ? `<h4>Validaciones</h4><ul class="alert-list">${d.validation.map((v) => `<li>${H().pill(v.pass ? 'ok' : 'error', v.pass ? 'Cierra' : 'No cierra')} <span>${esc(v.label)}</span></li>`).join('')}</ul>` : ''}</section>
        <section><h4>Hipótesis con Cohere (opcional)</h4>
          <div class="field"><label for="dx-key-input" class="field__hint">API key de Cohere</label>
            <input id="dx-key-input" type="password" autocomplete="off" value="${esc(ai.apiKey || '')}" data-action="dx-key" placeholder="Pega tu API key"></div>
          <div class="field field--check"><label><input type="checkbox" data-action="dx-remember" ${ai.rememberKey ? 'checked' : ''}> Recordar la key en este navegador</label>
            <span class="field__hint">Se guarda en localStorage de este navegador y nunca se exporta. Cualquiera con acceso a este navegador podría verla.</span></div>
          <div class="field"><label for="dx-model" class="field__hint">Modelo</label>
            <input id="dx-model" type="text" value="${esc(ai.model)}" data-action="dx-model"></div>
          <button type="button" class="btn btn--primary" data-action="dx-ai" ${d.status === 'ok' && ai.ai.status !== 'busy' ? '' : 'disabled'}>Generar hipótesis con Cohere</button>
          <p class="field__hint">Cohere solo recibe los datos ya calculados (brecha, drivers, señales, calidad) y reglas estrictas: no calcula ni cambia cifras, no inventa dimensiones y debe citar señales existentes. Su respuesta se valida; si falla, todo lo demás sigue funcionando.</p></section>
      </div>`;
  }

  function render(state) {
    renderControls(state);
    const d = state.dx.run;
    if (!d) {
      ['dx-result', 'dx-level1', 'dx-tree', 'dx-signals', 'dx-hyps', 'dx-recovery', 'dx-confidence'].forEach((id) => { $(id).innerHTML = ''; });
      $('dx-result').innerHTML = `<div class="empty"><strong>No hay diagnóstico todavía</strong>Se necesita un plan del año y venta real: guarda el plan distribuido en Plan e importa el real.</div>`;
      $('dx-recovery').closest('section').hidden = true;
      return;
    }
    renderResult(d);
    renderLevel1(d);
    renderTree(state, d);
    renderSignals(state, d);
    renderHypotheses(state, d);
    renderRecovery(d);
    renderConfidence(state, d);
  }

  FP.diagnosticView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
