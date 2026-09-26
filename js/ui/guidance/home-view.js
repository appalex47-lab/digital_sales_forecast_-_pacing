/**
 * home-view.js — Inicio / Overview (Fase 7).
 * Centro de control: lee lo que ya calcularon forecast (Fase 3) y reforecast (Fase 4) para el canal
 * y periodo elegidos. No crea "scores": solo cifras existentes y frases descriptivas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  /** Cifras del periodo desde las corridas existentes (solo lectura). */
  function periodFigures(state) {
    const run = state.fc.run, rf = state.rf.run, h = state.ux.home;
    if (!run || run.plan.source === 'none') return null;
    const ch = h.channel || 'total';
    const s = ch === 'total' ? run.total : run.channels[ch];
    const rs = rf ? (ch === 'total' ? rf.total : rf.channels[ch]) : null;
    let p, rp, label;
    if (h.periodType === 'month' && h.periodKey) {
      const i = +h.periodKey.slice(5, 7) - 1;
      p = s.months[i]; rp = rs ? rs.months[i] : null; label = `${MONTHS[i]} ${run.year}`;
    } else { p = s.annual; rp = rs ? rs.horizonSummary : null; label = `Año ${run.year}`; }
    return { ch, label, p, rp, run, rs };
  }

  function card(stateKind, label, value, compare, period, helpId, whyHtml = '') {
    const esc = H().esc;
    return `<div class="metric-card ${stateKind ? `metric-card--${stateKind}` : ''}">
      <div class="metric-card__head">${stateKind ? FP.help.stateTag(stateKind) : ''}<span class="metric-card__label">${esc(label)}</span>${helpId ? FP.help.helpButton(helpId) : ''}</div>
      <div class="metric-card__value num">${esc(value)}</div>
      ${compare ? `<div class="metric-card__compare">${esc(compare)}</div>` : ''}
      <div class="metric-card__period">${esc(period)}${whyHtml ? ` ${whyHtml}` : ''}</div></div>`;
  }

  /**
   * Etapas del recorrido. Una etapa solo cuenta como hecha si su resultado existe con los datos
   * actuales y la etapa anterior también está hecha (visitar una vista vacía no la completa).
   */
  function journey(status) {
    const raw = [
      ['Planear', 'plan', Boolean(status.plan.original || status.plan.imported), 'Meta y plan distribuido'],
      ['Monitorear', 'pacing', Boolean(status.forecast.available), 'Pacing y forecast'],
      ['Diagnosticar', 'diagnostico', Boolean(status.forecast.available && status.visited.diagnostico && status.diagnostic.hypotheses !== null), 'Drivers, señales, hipótesis'],
      ['Recuperar', 'recovery', status.scenarios.count > 0, 'Escenarios y acciones'],
      ['Medir', 'medir', status.measurements.count > 0, 'Baseline vs escenario vs observado'],
      ['Aprender', 'medir', status.measurements.count > 0, 'Qué fue consistente con lo simulado']
    ];
    let prev = true;
    return raw.map(([l, v, done, d]) => { const ok = prev && done; prev = ok; return [l, v, ok, d]; });
  }

  function render(state, status) {
    const esc = H().esc;
    const h = state.ux.home;
    const year = state.year;
    const controls = `<div class="filters">
      <div class="field"><label for="home-ch" class="field__hint">Canal</label>
        <select id="home-ch" data-action="home-setting" data-key="channel">${[['total', 'Total digital'], ...C().channels.map((c) => [c.id, c.label])].map(([v, l]) =>
          `<option value="${v}" ${h.channel === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="home-per" class="field__hint">Periodo</label>
        <select id="home-per" data-action="home-setting" data-key="period">
          <option value="year" ${h.periodType !== 'month' ? 'selected' : ''}>Año ${year}</option>
          ${MONTHS.map((m, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; return `<option value="${k}" ${h.periodType === 'month' && h.periodKey === k ? 'selected' : ''}>${m} ${year}</option>`; }).join('')}
        </select></div></div>`;
    const f = periodFigures(state);
    const ready = FP.contextEngine.dataReadiness(status);
    const flow = journey(status);
    let cards = '';
    let messages = FP.contextEngine.headline(status);
    if (f) {
      const p = f.p, t = p.toDate.revenue, fg = p.forecastGap.revenue, rp = f.rp;
      const why = (kind) => (FP.explain ? FP.explain.whyButton(kind, { channel: f.ch, periodKey: h.periodType === 'month' ? h.periodKey : '', metric: 'revenue' }) : '');
      const pressure = rp && rp.pressure ? rp.pressure.revenue.pressure : null;
      const future = p.status === 'future';
      cards = `
        ${card('actual', 'Venta acumulada', future ? '—' : F().currency(p.actualToDate && p.actualToDate.revenue, 0), future ? 'Periodo futuro' : `vs plan ${F().signedPercent(t.gapPct, 1)}`, 'Acumulado a la fecha', 'actual')}
        ${card('plan', 'Meta acumulada', F().currency(p.planToDate && p.planToDate.revenue, 0), `Meta del periodo ${F().currency(p.plan.revenue, 0)}`, 'Plan de los días con real', 'plan')}
        ${card(null, 'Gap', future ? '—' : FP.pacingView.signed('revenue', t.gap), 'Actual − plan', 'Acumulado a la fecha', 'gap', future ? '' : why('gap'))}
        ${card(null, 'Cumplimiento', future ? '—' : F().percent(t.compliance, 1), FP.pacingView.paceLabel(FP.gap.pacingStatus(t.compliance, f.run.settings.pacingThresholds)), 'Acumulado a la fecha', 'cumplimiento', future ? '' : why('compliance'))}
        ${card('forecast', 'Forecast', F().currency(p.forecast && p.forecast.revenue, 0), `Método ${f.run.method.id}`, 'Cierre del periodo', 'forecast', why('forecast'))}
        ${card(null, 'Gap forecast', FP.pacingView.signed('revenue', fg.gap), F().signedPercent(fg.gapPct, 1), 'Forecast − meta', 'forecastGap', why('forecastGap'))}
        ${card('reforecast', 'Presión de recuperación', fin(pressure) ? F().signedPercent(pressure, 1) : '—', rp && rp.required ? `Requerido ${F().currency(rp.required.revenue, 0)}` : 'Sin días por recuperar', 'Requerido vs plan de los días restantes', 'recoveryPressure', state.rf && state.rf.run && h.periodType !== 'month' ? FP.explain.whyButton('reforecast', { channel: f.ch }) : '')}`;
      if (!(p.plan && Number.isFinite(p.plan.revenue))) messages = [...messages,
        'El plan cargado no cubre todo el periodo: la meta y el forecast del periodo no se pueden cerrar. Elige un mes cubierto por el plan o completa el plan.'];
      if (h.periodType === 'month' && h.periodKey) messages = [
        fin(t.gapPct) && p.status !== 'future' ? `Venta acumulada del mes ${(Math.abs(t.gapPct) * 100).toFixed(1)} % ${t.gapPct < 0 ? 'por debajo' : 'por encima'} del plan.` : 'Mes sin real todavía.',
        fin(fg.gapPct) ? (fg.gapPct < 0 ? `El forecast del mes proyecta una brecha de ${(Math.abs(fg.gapPct) * 100).toFixed(1)} %.` : `El forecast del mes proyecta cerrar ${(fg.gapPct * 100).toFixed(1)} % arriba.`) : null
      ].filter(Boolean);
    }
    $('home').innerHTML = `
      <section class="panel"><div class="panel__head"><div>
        <h2 class="panel__title">¿Qué está pasando?</h2>
        <p class="panel__desc">${f ? `${esc(FP.navigation.contextLabel({ channel: f.ch }))} · ${esc(f.label)}` : 'Sin plan o real todavía.'}</p></div></div>
        <div class="panel__body">${controls}
          ${f ? `<ul class="headline">${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><div class="metric-grid">${cards}</div>`
            : `<div class="empty"><strong>Todavía no hay datos para esta vista</strong>Inicio resume plan, actual, forecast y reforecast.</div>`}
        </div></section>
      <section class="panel"><div class="panel__body">
        <div class="subhead"><h3 class="panel__title">Recorrido del sistema</h3>
          <span class="field__hint">El siguiente paso está arriba, junto al contexto de esta vista.</span></div>
        <ol class="flow-map">${flow.map(([l, v, done, d]) => `<li class="${done ? 'is-done' : ''}"><a href="#${v}"><strong>${esc(l)}</strong><span class="cell-sub">${esc(d)}</span>
          <span class="flow-map__state">${done ? '✓ Hecho' : 'Pendiente'}</span></a></li>`).join('')}</ol>
      </div></section>
      <section class="panel"><div class="panel__body">
        <div class="subhead"><h3 class="panel__title">Preparación de datos</h3><span class="field__hint">${esc(ready.note)}</span></div>
        <div class="readiness">
          <div class="readiness__bar" role="progressbar" aria-valuenow="${ready.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Preparación de datos">
            <span class="readiness__fill readiness__fill--${ready.tier}" style="width:${ready.percent}%"></span></div>
          <p class="readiness__pct"><strong>${ready.percent} %</strong> · ${esc(ready.label)}</p>
        </div>
        <ul class="readiness__list">${ready.items.map((it) => `<li class="${it.done ? 'is-done' : ''}">
          <span class="readiness__mark">${it.done ? '✓' : '—'}</span> ${esc(it.label)}${it.blocking ? '' : ' <span class="chip">recomendado</span>'}
          ${!it.done ? `<a href="#${it.view}">Ir</a>` : ''}</li>`).join('')}</ul>
      </div></section>
      <section class="panel"><div class="panel__body">
        <div class="subhead"><h3 class="panel__title">Convenciones</h3><span class="field__hint">Estos conceptos no son equivalentes.</span></div>
        <dl class="conventions">${Object.keys(FP.guidanceConfig.STATES).map((k) => `<div><dt>${FP.help.stateTag(k)}</dt><dd>${esc(FP.guidanceConfig.STATES[k].short)}</dd></div>`).join('')}</dl>
      </div></section>`;
    if (!f) FP.help.enhanceEmpty($('home'), FP.contextEngine.requirements('pacing', status));
  }

  FP.homeView = { render, periodFigures, journey };
})(typeof window !== 'undefined' ? window : globalThis);
