/**
 * forecast-view.js — Vista "Pacing & Forecast", parte 2 (Fase 3).
 * Índices de performance por ventana, comparación de métodos, alertas descriptivas,
 * versiones del forecast (cambio y accuracy) y parámetros. Solo pinta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const PV = () => FP.pacingView;
  const $ = (id) => document.getElementById(id);

  const CONF_PILL = { excellent: 'ok', sufficient: 'ok', limited: 'warning', insufficient: 'error' };
  const confPill = (c) => (c ? H().pill(CONF_PILL[c], C().confidenceLabels[c]) : H().pill('na', 'No aplica'));

  function idxCell(ix) {
    if (!ix) return `<td class="num">${F().DASH}</td>`;
    if (ix.status !== 'ok' || ix.value === null) return `<td class="num"><span class="val val--missing">Datos insuficientes</span><span class="cell-sub">${ix.comparableDays || 0} días</span></td>`;
    return `<td class="num">${F().percent(ix.value, 1)}<span class="cell-sub">${ix.comparableDays} días</span></td>`;
  }

  function renderIndices(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const ch = state.fc.channel;
    const s = PV().seriesOf(run, ch);
    const W = run.settings.windows;
    const rows = Object.keys(W).map((w) => {
      const ix = s.indices[w];
      const any = ix && ix.revenue;
      return `<tr><td><strong>${esc(W[w].label)}</strong><span class="cell-sub">${any && any.from ? `${esc(any.from)} a ${esc(any.to)}` : ''}</span></td>
        ${C().metricKeys.map((k) => idxCell(ix && ix[k])).join('')}</tr>`;
    }).join('');
    $('fc-indices').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Performance index · ${esc(PV().chLabel(ch))}</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Ventana</th>${C().metricKeys.map((k) => `<th class="num">${esc(C().metrics[k].label)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Índice = actual ÷ plan de los mismos días comparables. CR y AOV comparan razones de sumas, nunca promedios de días.
        Todas las ventanas terminan en el corte. La app muestra acumulado y reciente juntos y no decide cuál es "correcta".
        Con menos de ${run.settings.minComparableDays} días o ${F().percent(run.settings.minWindowCoverage, 0)} de cobertura: datos insuficientes.</p>`;
  }

  function assumptionsText(a) {
    if (!a || !a.indices || !Object.keys(a.indices).length) return 'Índice 1: plan restante tal cual.';
    return Object.entries(a.indices).map(([k, ix]) =>
      `${C().metrics[k].label} × ${ix.value === null ? 'sin datos (usa 1)' : F().percent(ix.value, 1)} (${ix.windowLabel})`).join('; ');
  }

  function renderMethods(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const ch = state.fc.channel;
    const k = state.fc.metric;
    const cmp = ch === 'total' ? run.comparison.total : run.comparison.byChannel[ch];
    const plan = PV().seriesOf(run, ch).annual.plan;
    const rows = Object.keys(run.settings.methods).map((id) => {
      const m = cmp[id];
      const fc = ch === 'total' ? m.forecast : m.annual && m.annual.forecast;
      const g = ch === 'total' ? m.forecastGap && m.forecastGap[k] : m.annual && m.annual.forecastGap[k];
      const assumptions = ch === 'total' ? 'Suma de los canales, cada uno con sus índices.' : assumptionsText(m.assumptions);
      return `<tr class="${id === run.method.id ? 'row-current' : ''}">
        <td><strong>${id} · ${esc(run.settings.methods[id].label)}</strong>${id === run.method.id ? ' <span class="chip">en uso</span>' : ''}
          <span class="cell-sub">${esc(run.settings.methods[id].description)}</span></td>
        <td class="wrap"><span class="cell-sub">${esc(assumptions)}</span>${m.fallbackDays ? `<span class="cell-sub">${m.fallbackDays} días con índice sin datos (usan plan)</span>` : ''}</td>
        <td class="num">${esc(F().metric(k, fc && fc[k]))}</td>
        <td class="num">${esc(PV().signed(k, g && g.gap))}<span class="cell-sub">${esc(F().signedPercent(g && g.gapPct, 1))}</span></td>
        <td>${confPill(m.confidence)}</td></tr>`;
    }).join('');
    $('fc-methods').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Comparación de métodos · ${esc(PV().chLabel(ch))}</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Método</th><th>Supuestos</th><th class="num">Forecast anual</th><th class="num">Diferencia vs plan (${esc(F().metric(k, plan[k]))})</th><th>Confianza</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Todos conservan el patrón diario del plan (nunca "restante ÷ días restantes"). En D los índices se aplican solo a volumen, CR y AOV; pedidos y venta se derivan, sin doble conteo.
        Ningún método se declara mejor: el método en uso se elige arriba.</p>`;
  }

  function renderAlerts(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const SEV = { info: 'na', attention: 'warning', warning: 'warning' };
    $('fc-alerts').innerHTML = run.alerts.length
      ? `<ul class="alert-list">${run.alerts.map((a) => `<li>${H().pill(SEV[a.severity] || 'na', a.severity === 'info' ? 'Informativa' : 'Atención')} <span>${esc(a.message)}</span></li>`).join('')}</ul>
        <p class="field__hint">Reglas matemáticas (umbrales en Parámetros): racha de ${run.settings.alerts.streakDays} días empeorando o mejorando el gap, performance de 28 días distinta a la acumulada por más de ${F().percent(run.settings.alerts.recentVsCumulative, 0)}, y forecast de cierre a más de ${F().percent(run.settings.alerts.forecastGapPct, 0)} del plan. Describen, no explican ni recomiendan.</p>`
      : '<p class="note note--ok">Sin alertas de pacing con los umbrales actuales.</p>';
  }

  function renderVersions(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const reg = state.fc.registry;
    const chg = FP.forecastVersioning.forecastChange(reg, run);
    const acc = FP.forecastVersioning.accuracy(reg, run, 'total');
    const next = `v${reg.versions.length + 1}`;
    const vrows = reg.versions.slice().reverse().map((v, i, arr) => {
      const prev = arr[i + 1];
      const cur = v.results.total.annual && v.results.total.annual.forecast ? v.results.total.annual.forecast.revenue : null;
      const old = prev && prev.results.total.annual && prev.results.total.annual.forecast ? prev.results.total.annual.forecast.revenue : null;
      const g = FP.metrics.calcGap(old, cur);
      return `<tr><td><strong>${esc(v.forecastVersion)}</strong></td><td class="num">${esc(v.generatedAt.slice(0, 16).replace('T', ' '))}</td>
        <td class="num">${esc(v.referenceDate)}</td><td>${esc(v.method.id)} · ${esc(v.method.label)}</td>
        <td class="num">${esc(F().currency(cur, 0))}</td>
        <td class="num">${prev ? esc(PV().signed('revenue', g.abs)) : F().DASH}</td></tr>`;
    }).join('');
    const accRows = acc.filter((a) => a.status === 'ok');
    $('fc-versions').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Versiones del forecast</h3>
        <div class="btn-row">
          <button type="button" class="btn btn--primary" data-action="fc-snapshot">Guardar forecast como ${esc(next)}</button>
          <button type="button" class="btn" data-action="fc-export">Exportar forecast_export.json</button>
        </div></div>
      <dl class="kpis kpis--3">
        <div><dt>Forecast actual (total, venta)</dt><dd class="num">${esc(F().currency(run.total.annual.forecast && run.total.annual.forecast.revenue, 0))}</dd><small>Método ${esc(run.method.id)}, sin guardar</small></div>
        <div><dt>Versión anterior</dt><dd class="num">${chg ? esc(F().currency(chg.total.previous, 0)) : F().DASH}</dd>
          <small>${chg ? `${esc(chg.previous.forecastVersion)} del ${esc(chg.previous.referenceDate)}${chg.sameMethod ? '' : ', otro método'}` : 'Aún no hay versiones guardadas'}</small></div>
        <div><dt>Forecast change</dt><dd class="num">${chg ? esc(PV().signed('revenue', chg.total.change)) : F().DASH}</dd><small>${chg ? esc(F().signedPercent(chg.total.changePct, 2)) : 'Guarda una versión para comparar'}</small></div>
      </dl>
      ${reg.versions.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Versión</th><th class="num">Generada</th><th class="num">Fecha de referencia</th><th>Método</th><th class="num">Forecast total</th><th class="num">Cambio vs anterior</th></tr></thead>
        <tbody>${vrows}</tbody></table></div>` : ''}
      <h4>Accuracy del forecast</h4>
      ${accRows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Versión</th><th class="num">Referencia</th><th class="num">Meses evaluados</th><th class="num">MAPE</th><th class="num">Bias</th><th class="num">Accuracy</th></tr></thead>
        <tbody>${accRows.map((a) => `<tr><td>${esc(a.forecastVersion)}</td><td class="num">${esc(a.referenceDate)}</td><td class="num">${a.evaluatedMonths}</td>
          <td class="num">${F().percent(a.mape, 1)}</td><td class="num">${F().signedPercent(a.bias, 1)}</td><td class="num">${F().percent(a.accuracy, 1)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="note">Todavía no hay meses evaluables: se necesita una versión guardada con fecha de referencia anterior y meses que estaban abiertos en ese momento y hoy ya cerraron.</p>'}
      <p class="field__hint">Cada versión es inmutable y registra fecha de referencia, corte, método y supuestos. La accuracy solo compara meses que estaban abiertos al guardar la versión, así nunca usa información que no existía en ese momento.</p>`;
  }

  function renderParams(state) {
    const esc = H().esc;
    const cfg = FP.forecastEngine.effectiveConfig(state.fc.settings);
    const W = cfg.windows;
    const winSelect = (key, current, label) => `<div class="field"><label for="fp-${key}">${esc(label)}</label>
      <select id="fp-${key}" data-action="fc-setting" data-key="${key}">${Object.entries(W).map(([id, w]) => `<option value="${id}" ${id === current ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}</select></div>`;
    const num = (key, value, label, hint, { pctScale = false, step = 1 } = {}) => `<div class="field"><label for="fp-${key.replace('.', '-')}">${esc(label)}</label>
      <input id="fp-${key.replace('.', '-')}" type="number" step="${step}" value="${esc(pctScale ? +(value * 100).toFixed(4) : value)}" data-action="fc-setting" data-key="${key}" ${pctScale ? 'data-pct="1"' : ''}>
      <span class="field__hint">${esc(hint)}</span></div>`;
    $('fc-params').innerHTML = `
      <div class="settings-grid">
        ${winSelect('recentWindow', cfg.recentWindow, 'Ventana del método C')}
        ${winSelect('driverWindows.trafficVolume', cfg.driverWindows.trafficVolume, 'Método D: ventana de volumen')}
        ${winSelect('driverWindows.conversionRate', cfg.driverWindows.conversionRate, 'Método D: ventana de CR')}
        ${winSelect('driverWindows.aov', cfg.driverWindows.aov, 'Método D: ventana de AOV')}
        ${num('pacingThresholds.aboveFrom', cfg.pacingThresholds.aboveFrom, 'Arriba del plan desde (%)', 'Cumplimiento igual o mayor.', { pctScale: true, step: 0.1 })}
        ${num('pacingThresholds.onPlanFrom', cfg.pacingThresholds.onPlanFrom, 'En plan desde (%)', 'Menor a esto: debajo del plan.', { pctScale: true, step: 0.1 })}
        ${num('minComparableDays', cfg.minComparableDays, 'Mínimo de días comparables', 'Para calcular un índice.')}
        ${num('minWindowCoverage', cfg.minWindowCoverage, 'Cobertura mínima de ventana (%)', 'Días con real dentro de la ventana.', { pctScale: true })}
        ${num('alerts.streakDays', cfg.alerts.streakDays, 'Alerta: días seguidos', 'Racha de gap empeorando o mejorando.')}
        ${num('alerts.recentVsCumulative', cfg.alerts.recentVsCumulative, 'Alerta: reciente vs acumulado (pp)', 'Diferencia entre índice 28 días y acumulado.', { pctScale: true, step: 0.5 })}
        ${num('alerts.forecastGapPct', cfg.alerts.forecastGapPct, 'Alerta: gap forecast (%)', 'Forecast de cierre vs plan anual.', { pctScale: true, step: 0.5 })}
        <div class="field field--check"><label><input type="checkbox" data-action="fc-setting" data-key="useHistoricalAsActual" ${cfg.useHistoricalAsActual ? 'checked' : ''}>
          Completar el real con el histórico del mismo año</label>
          <span class="field__hint">Ambos son venta real. Útil si los meses cerrados del año están en Histórico y el mes en curso en Actual.</span></div>
      </div>
      <button type="button" class="btn btn--quiet" data-action="fc-reset">Restablecer parámetros del forecast</button>`;
  }

  function render(state) {
    const run = state.fc.run;
    const ok = run && run.plan.source !== 'none';
    ['fc-indices', 'fc-methods', 'fc-alerts', 'fc-versions'].forEach((id) => { if (!ok) $(id).innerHTML = ''; });
    renderParams(state);
    if (!ok) return;
    renderIndices(state);
    renderMethods(state);
    renderAlerts(state);
    renderVersions(state);
  }

  FP.forecastView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
