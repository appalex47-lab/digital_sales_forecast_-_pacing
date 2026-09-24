/**
 * planning-config-view.js — Vista "Configuración de planeación" (Fase 2).
 * Edita `planningSettings` (valores por defecto en config.planning) y muestra la comparación de métodos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const COMPONENTS = [
    ['monthly', 'Peso mensual histórico'], ['dayOfWeek', 'Peso día de semana'], ['calendar', 'Peso calendario (día del mes)'],
    ['events', 'Peso eventos y festivos'], ['season', 'Peso temporada']
  ];

  function numberField(id, label, value, { key, sub = null, min = 0, max = null, step = 1, hint = '' }) {
    const esc = H().esc;
    return `<div class="field"><label for="${id}">${esc(label)}</label>
      <input id="${id}" type="number" min="${min}" ${max !== null ? `max="${max}"` : ''} step="${step}" value="${value === null || value === undefined ? '' : esc(value)}"
        data-action="plan-setting" data-key="${key}" ${sub ? `data-sub="${sub}"` : ''}>
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`;
  }

  function render(state) {
    const esc = H().esc;
    const cfg = FP.seasonality.effectiveConfig(state.planning.settings);
    const hp = cfg.historicalPeriod;

    $('plan-config').innerHTML = `
      <div class="settings-grid">
        <div class="field"><label for="pc-method">Método de distribución aplicado</label>
          <select id="pc-method" data-action="plan-setting" data-key="method">
            ${Object.entries(cfg.methods).map(([k, m]) => `<option value="${k}" ${k === cfg.method ? 'selected' : ''}>${k} · ${esc(m.label)}</option>`).join('')}</select>
          <span class="field__hint">${esc(cfg.methods[cfg.method].description)}</span></div>
        <div class="field"><label for="pc-period">Periodo histórico utilizado</label>
          <select id="pc-period" data-action="plan-setting" data-key="historicalPeriod" data-sub="mode">
            <option value="before_target" ${hp.mode === 'before_target' ? 'selected' : ''}>Todo lo anterior al año planeado</option>
            <option value="all" ${hp.mode === 'all' ? 'selected' : ''}>Todo el histórico cargado</option>
            <option value="custom" ${hp.mode === 'custom' ? 'selected' : ''}>Rango personalizado</option></select>
          ${hp.mode === 'custom' ? `<div class="inline-dates">
            <input type="date" aria-label="Desde" value="${esc(hp.from || '')}" data-action="plan-setting" data-key="historicalPeriod" data-sub="from">
            <input type="date" aria-label="Hasta" value="${esc(hp.to || '')}" data-action="plan-setting" data-key="historicalPeriod" data-sub="to"></div>` : ''}</div>
        <div class="field"><label for="pc-smooth">Método de suavizado</label>
          <select id="pc-smooth" data-action="plan-setting" data-key="smoothing">
            ${Object.entries(FP.seasonalityView.SMOOTH).map(([k, l]) => `<option value="${k}" ${k === cfg.smoothing ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <span class="field__hint">Winsorizada: recorta extremos a ±${esc(cfg.outlierMadK)} desviaciones robustas y promedia.</span></div>
        <div class="field field--check"><label><input type="checkbox" data-action="plan-setting" data-key="useExplicitPlan" ${cfg.useExplicitPlan ? 'checked' : ''}>
          Respetar el plan diario importado</label>
          <span class="field__hint">Los días con plan cargado (Plan / Meta) se fijan y solo se distribuye el remanente. Desactívalo para ver la distribución pura.</span></div>
        ${numberField('pc-min', 'Número mínimo de muestras', cfg.minSamples, { key: 'minSamples', min: 1, hint: 'Por grupo (evento, temporada, día del mes).' })}
        ${numberField('pc-mad', 'Umbral de extremos (k)', cfg.outlierMadK, { key: 'outlierMadK', min: 1, step: 0.5, hint: 'k × MAD × 1.4826 desde la mediana.' })}
        ${numberField('pc-shrink', 'Encogimiento (k)', cfg.shrinkageK, { key: 'shrinkageK', min: 0, hint: 'Más alto = factores con pocas muestras más cerca de 1.' })}
        ${numberField('pc-cov', 'Cobertura mínima por mes (%)', Math.round(cfg.monthMinCoverage * 100), { key: 'monthMinCoverage', min: 1, max: 100, hint: 'Para que un año cuente como completo.' })}
      </div>
      <h3 class="h4">Intensidad de cada componente (0 a 1)</h3>
      <div class="settings-grid settings-grid--5">
        ${COMPONENTS.map(([k, l]) => numberField(`pc-w-${k}`, l, cfg.componentWeights[k], { key: 'componentWeights', sub: k, min: 0, max: 1, step: 0.1 })).join('')}
      </div>
      <p class="field__hint">1 = factor histórico completo; 0 = sin efecto. Se aplica como exponente (f<sup>α</sup>); en el mensual, como mezcla con la distribución por días.</p>
      <h3 class="h4">Supuestos manuales de CR y AOV</h3>
      <p class="field__hint">Solo se usan si el canal no tiene histórico. Déjalos vacíos para no suponer nada.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Canal</th><th>CR (fracción, ej. 0.012)</th><th>AOV (MXN)</th></tr></thead><tbody>
        ${C().channels.map((c) => `<tr><td>${esc(c.label)}</td>
          <td><input type="number" min="0" max="1" step="0.0001" aria-label="CR ${esc(c.label)}" value="${cfg.assumptions[c.id].conversionRate ?? ''}" data-action="plan-assumption" data-channel="${c.id}" data-key="conversionRate"></td>
          <td><input type="number" min="0" step="0.01" aria-label="AOV ${esc(c.label)}" value="${cfg.assumptions[c.id].aov ?? ''}" data-action="plan-assumption" data-channel="${c.id}" data-key="aov"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="btn-row"><button type="button" class="btn btn--quiet" data-action="plan-settings-reset">Restablecer valores por defecto</button></div>`;

    renderComparison(state, cfg);
  }

  function renderComparison(state, cfg) {
    const esc = H().esc;
    const cmp = state.planning.comparison;
    const box = $('plan-compare');
    const intro = `<p class="panel__desc">Método en uso: <strong>${esc(cfg.method)} · ${esc(cfg.methods[cfg.method].label)}</strong>. La app no elige un ganador: tú decides en el selector de arriba.</p>
      <div class="btn-row"><button type="button" class="btn" data-action="plan-compare">${cmp ? 'Recalcular comparación' : 'Comparar métodos'}</button></div>`;
    if (!cmp) { box.innerHTML = intro; return; }
    const rows = C().channels.map((c) => {
      const r = cmp.results[c.id];
      return Object.values(r.methods).map((m, i) => `<tr>
        ${i === 0 ? `<td rowspan="4"><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span><span class="cell-sub">${r.testYear ? `prueba: ${r.testYear}` : 'sin año completo'}</span></td>` : ''}
        <td>${esc(m.id)} · ${esc(m.label)}${m.id === cfg.method ? ' <span class="chip">en uso</span>' : ''}</td>
        <td class="num">${F().percent(m.coverage, 0)}</td><td>${FP.seasonalityView.confPill(m.confidence)}</td>
        <td class="num">${F().percent(m.wapeMonthly, 1)}</td><td class="num">${F().percent(m.wapeDaily, 1)}</td></tr>`).join('');
    }).join('');
    box.innerHTML = `${intro}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Canal</th><th>Método</th><th class="num">Cobertura</th><th>Confianza</th><th class="num">Diferencia vs histórico (mensual)</th><th class="num">Diferencia vs histórico (diaria)</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Diferencia vs histórico = error absoluto ponderado (WAPE) al repartir la venta real del último año completo con cada método, comparado con lo que realmente ocurrió. Es un ajuste dentro de muestra: sirve para comparar métodos entre sí, no como precisión de pronóstico. Cobertura = componentes del método con datos suficientes.</p>`;
  }

  FP.planningConfigView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
