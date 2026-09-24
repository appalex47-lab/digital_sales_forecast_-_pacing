/**
 * seasonality-view.js — Vista "Estacionalidad" (Fase 2).
 * Pinta los perfiles de FP.seasonality (ya calculados por app.js). No calcula pesos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const CONF_PILL = { excellent: 'ok', sufficient: 'ok', limited: 'warning', insufficient: 'error' };
  function confPill(level) {
    if (!level) return H().pill('na', 'No aplica');
    return H().pill(CONF_PILL[level], C().confidenceLabels[level]);
  }
  const factor = (f) => (f === null || f === undefined ? '—' : f.toFixed(3));
  const pct = (x, d = 1) => F().percent(x, d);

  function render(state) {
    const esc = H().esc;
    const box = $('seasonality');
    const ps = state.planning;
    const profiles = ps.profiles;
    const ch = ps.seasonalityChannel;
    const seg = H().segmented('season-channel', C().channels.map((c) => [c.id, c.label]), ch);
    if (!profiles) { box.innerHTML = '<div class="empty"><strong>Calculando…</strong></div>'; return; }
    const p = profiles[ch];
    const cfg = FP.seasonality.effectiveConfig(ps.settings);
    const components = cfg.methods[cfg.method].components;

    const head = `<div class="subhead">${seg}
      <p class="field__hint">Año planeado ${state.year}. Método aplicado: <strong>${esc(cfg.method)} · ${esc(cfg.methods[cfg.method].label)}</strong>.</p></div>`;

    if (!p.days) {
      box.innerHTML = `${head}<div class="empty"><strong>Sin histórico para ${esc(FP.dataModel.getChannel(ch).label)} en el periodo</strong>
        Carga archivos de tipo Histórico en Carga de datos. Periodo usado: ${esc(periodText(p.period))}.</div>`;
      return;
    }

    // Mensual
    const mw = FP.planning.monthWeights(state.year, p, components, cfg);
    const mwNorm = FP.weights.normalizeWeights(mw.map((m) => m.weight));
    const monthlyRows = C().calendar.monthNamesEs.map((name, i) => `<tr>
      <td>${esc(name)}</td>
      <td class="num">${p.monthly.available ? pct(p.monthly.histShare[i], 2) : '—'}</td>
      <td class="num">${p.monthly.available ? factor(p.monthly.index[i]) : '—'}</td>
      <td class="num">${pct(mwNorm[i], 2)}</td>
      <td class="num">${F().integer(FP.calendar.daysInMonth(state.year, i + 1))}</td>
      <td>${confPill(mw[i].confidence)}</td></tr>`).join('');

    // Día de semana
    const dowConf = (n) => FP.weights.confidenceFrom(n, cfg.sampleThresholds.dayOfWeek);
    const dowRows = C().calendar.dayNamesEs.map((name, i) => `<tr><td>${esc(name)}</td>
      <td class="num">${p.dayOfWeek.available ? factor(p.dayOfWeek.factors[i]) : '—'}</td>
      <td class="num">${F().integer(p.dayOfWeek.samples[i])}</td>
      <td>${confPill(p.dayOfWeek.samples[i] >= cfg.minSamples ? dowConf(p.dayOfWeek.samples[i]) : 'insufficient')}</td></tr>`).join('');

    // Día del mes
    const cal = p.calendar;
    const domRows = Array.from({ length: 31 }, (_, i) => `<tr><td class="num">${i + 1}</td>
      <td class="num">${factor(cal.factors[i])}</td>
      <td class="num">${factor(cal.raw[i])}</td>
      <td class="num">${F().integer(cal.samples[i])}</td>
      <td>${cal.raw[i] === null ? H().pill('na', 'Sin muestras') : cal.significant[i] ? H().pill('ok', 'Con evidencia') : H().pill('na', 'Sin evidencia (1.000)')}</td></tr>`).join('');

    // Eventos y temporadas
    const evList = Object.values(p.events).sort((a, b) => b.samples - a.samples);
    const evRows = evList.map((e) => `<tr><td>${esc(e.name)}</td><td>${e.type === 'holiday' ? 'Festivo' : 'Evento'}</td>
      <td class="num">${factor(e.factor)}</td><td class="num">${factor(e.raw)}</td>
      <td class="num">${F().integer(e.samples)}</td><td class="num">${esc(e.years.join(', '))}</td>
      <td>${confPill(e.confidence)}</td><td class="wrap"><span class="cell-sub">${esc(e.note || (e.capped ? 'Factor acotado a los límites configurados.' : ''))}</span></td></tr>`).join('');
    const seList = Object.values(p.seasons);
    const seRows = seList.map((e) => `<tr><td>${esc(e.name)}</td><td class="num">${factor(e.factor)}</td><td class="num">${factor(e.raw)}</td>
      <td class="num">${F().integer(e.samples)}</td><td>${confPill(e.type === 'season' && e.applied === false && e.raw === null ? null : e.confidence)}</td><td class="wrap"><span class="cell-sub">${esc(e.note || '')}</span></td></tr>`).join('');

    box.innerHTML = `${head}
      <dl class="kpis">
        <div><dt>Periodo histórico</dt><dd class="num kpi-sm">${esc(p.period.firstDate)} a ${esc(p.period.lastDate)}</dd></div>
        <div><dt>Días con venta</dt><dd class="num">${F().integer(p.days)}</dd></div>
        <div><dt>Años completos</dt><dd class="num">${p.monthly.yearsUsed.length ? esc(p.monthly.yearsUsed.join(', ')) : 'Ninguno'}</dd></div>
        <div><dt>Suficiencia</dt><dd>${confPill(p.sufficiency)}</dd></div>
        <div><dt>Extremos detectados</dt><dd class="num">${F().integer(p.outliersDetected)}</dd></div>
        <div><dt>Suavizado</dt><dd class="kpi-sm">${esc(SMOOTH[cfg.smoothing])}</dd></div>
      </dl>
      ${p.monthly.note ? `<p class="note note--warning">${esc(p.monthly.note)}</p>` : ''}
      ${p.monthly.partialYears.length ? `<p class="field__hint">Años parciales (no cuentan para el peso mensual, sí para día de semana, calendario y eventos): ${esc(p.monthly.partialYears.join(', '))}.</p>` : ''}

      <div class="grid-2 grid-2--tight grid-2--wide-left">
        <section><h3 class="h4">Mensual</h3><div class="table-wrap"><table class="table">
          <thead><tr><th>Mes</th><th class="num">Peso histórico</th><th class="num">Índice diario</th><th class="num">Peso aplicado ${state.year}</th><th class="num">Días</th><th>Confianza</th></tr></thead>
          <tbody>${monthlyRows}</tbody></table></div>
          <p class="field__hint">Peso histórico = participación promedio del mes en años completos. Peso aplicado = índice de venta diaria × días del mes en ${state.year}, con la intensidad configurada.</p></section>
        <section><h3 class="h4">Día de la semana</h3><div class="table-wrap"><table class="table">
          <thead><tr><th>Día</th><th class="num">Factor</th><th class="num">Muestras</th><th>Confianza</th></tr></thead>
          <tbody>${dowRows}</tbody></table></div>
          <p class="field__hint">Venta del día ÷ promedio de días regulares de su mes. Excluye días con evento o festivo. Promedio de los 7 factores = 1.</p>
          <h3 class="h4">Posición en el mes</h3>
          <dl class="kpis kpis--3">
            <div><dt>Inicio (1–3)</dt><dd class="num">${factor(cal.segments.inicio)}</dd></div>
            <div><dt>Quincena (14–16)</dt><dd class="num">${factor(cal.segments.quincena)}</dd></div>
            <div><dt>Fin de mes (28–31)</dt><dd class="num">${factor(cal.segments.fin)}</dd></div>
          </dl>
          <p class="field__hint">${cal.significantDays ? `${cal.significantDays} días del mes muestran un efecto con evidencia (${cfg.calendarEvidenceZ} errores estándar y al menos ${pct(cfg.calendarMinEffect, 0)}).` : 'Ningún día del mes muestra un efecto con evidencia suficiente: no se aplica efecto de quincena.'} Confianza: ${confPill(cal.confidence)}</p>
        </section>
      </div>

      <details class="disclosure"><summary>Día del mes (1 a 31)</summary>
        <div class="table-wrap table-wrap--tall"><table class="table">
          <thead><tr><th class="num">Día</th><th class="num">Factor aplicado</th><th class="num">Factor observado</th><th class="num">Muestras</th><th>Evidencia</th></tr></thead>
          <tbody>${domRows}</tbody></table></div></details>

      <h3 class="h4">Eventos y festivos</h3>
      ${evRows ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Evento</th><th>Tipo</th><th class="num">Factor aplicado</th><th class="num">Factor observado</th><th class="num">Muestras (días)</th><th class="num">Años</th><th>Confianza</th><th>Nota</th></tr></thead>
        <tbody>${evRows}</tbody></table></div>
        <p class="field__hint">Factor observado = venta ÷ (base del mes × factor del día de semana). El aplicado se encoge hacia 1 según las muestras y se acota a ${esc(cfg.eventFactorBounds.join('–'))}. Los eventos del año planeado vienen de los datos cargados y de los eventos configurados; no se inventan.</p>`
        : '<p class="note">El histórico no tiene días marcados con evento o festivo.</p>'}

      <h3 class="h4">Temporadas</h3>
      ${seRows ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Temporada</th><th class="num">Factor aplicado</th><th class="num">Factor observado</th><th class="num">Muestras</th><th>Confianza</th><th>Nota</th></tr></thead>
        <tbody>${seRows}</tbody></table></div>` : '<p class="note">El histórico no tiene días marcados con temporada.</p>'}`;
  }

  const SMOOTH = { winsorized_mean: 'Media winsorizada', trimmed_mean: 'Media recortada', median: 'Mediana', none: 'Sin suavizado' };
  function periodText(p) {
    if (p.mode === 'before_target') return `todo el histórico hasta ${p.to}`;
    if (p.mode === 'all') return 'todo el histórico';
    return `${p.from || 'inicio'} a ${p.to || 'fin'}`;
  }

  FP.seasonalityView = { render, confPill, SMOOTH, periodText };
})(typeof window !== 'undefined' ? window : globalThis);
