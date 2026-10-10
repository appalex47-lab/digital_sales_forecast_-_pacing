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
    // Con plan pero sin ni un día de venta real, el forecast y el reforecast no significan nada (mostrarían «0.0 %» y presiones absurdas):
    // Inicio enseña lo que ya se sabe, el plan, y dice qué falta para ver cumplimiento, forecast y recuperación.
    const planOnly = Boolean(f) && !(status.actual.countedDays > 0);
    if (f && planOnly) {
      const pl = f.p.plan || {};
      const nofin = 'Sin histórico: el plan no lo proyecta';
      const noHist = ![pl.orders, pl.trafficVolume, pl.conversionRate, pl.aov].some(fin);
      cards = `
        ${card('plan', 'Meta del periodo', fin(pl.revenue) ? F().currency(pl.revenue, 0) : '—', 'Venta que plantea el plan', f.label, 'plan')}
        ${card('plan', 'Pedidos del plan', fin(pl.orders) ? F().integer(pl.orders) : '—', fin(pl.orders) ? 'Venta ÷ AOV del plan' : nofin, f.label, 'orders')}
        ${card('plan', 'Volumen del plan', fin(pl.trafficVolume) ? F().integer(pl.trafficVolume) : '—', fin(pl.trafficVolume) ? 'Pedidos ÷ CR del plan' : nofin, f.label, 'trafficVolume')}
        ${card('plan', 'CR del plan', fin(pl.conversionRate) ? F().percent(pl.conversionRate, 2) : '—', fin(pl.conversionRate) ? 'Pedidos ÷ volumen' : nofin, f.label, 'conversionRate')}
        ${card('plan', 'AOV del plan', fin(pl.aov) ? F().currency(pl.aov, 0) : '—', fin(pl.aov) ? 'Venta ÷ pedidos' : nofin, f.label, 'aov')}`;
      messages = [`Todavía no hay venta real: esto es lo que plantea tu plan para ${f.label}.`,
        'Carga la venta real para ver cumplimiento, forecast y presión de recuperación.',
        noHist ? 'Sin histórico el plan no proyecta pedidos, volumen, CR ni AOV; es opcional, y con él esos indicadores se calculan al guardar el plan.' : null].filter(Boolean);
    } else if (f) {
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
    const next = FP.contextEngine.describe('inicio', status).nextStep;
    const doneN = flow.filter((x) => x[2]).length;
    const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
    const nextCard = `        <section class="ds-card ds-card--accent home__next" aria-labelledby="h-next">
          <h3 class="ds-card__title" id="h-next">Siguiente paso</h3>
          ${next && next.view !== 'inicio' ? `<p class="home__next-t">${esc(next.label)}</p><p class="ds-card__sub">${esc(next.reason)}</p>
            <button type="button" class="btn btn--primary btn--lg" data-action="go" data-view="${next.view}">Ir a ${esc(next.label)}</button>`
            : `<p class="home__next-t">Estás al día</p><p class="ds-card__sub">No hay un paso pendiente para esta vista.</p>`}
        </section>`;
    const readyCard = `        <section class="ds-card" aria-labelledby="h-ready">
          <div class="home__row"><h3 class="ds-card__title" id="h-ready">Preparación de datos</h3>
            <span class="ds-badge ds-badge--${ready.tier === 'ok' ? 'observed' : ready.tier === 'error' ? 'hyp' : 'forecast'}">${ready.percent} % · ${esc(ready.label)}</span></div>
          <div class="readiness__bar" role="progressbar" aria-valuenow="${ready.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Preparación de datos">
            <span class="readiness__fill readiness__fill--${ready.tier}" style="width:${ready.percent}%"></span></div>
          <p class="ds-card__sub">${esc(ready.note)}</p>
          <ul class="readiness__list">${ready.items.map((it) => `<li class="${it.done ? 'is-done' : ''}">
            <span class="readiness__mark">${it.done ? '✓' : '—'}</span> ${esc(it.label)}${it.blocking ? '' : ' <span class="ds-badge">recomendado</span>'}${it.hint && !it.done ? `<span class="readiness__hint">${esc(it.hint)}</span>` : ''}
            ${!it.done ? `<a href="#${it.view}">Ir</a>` : ''}</li>`).join('')}</ul>
        </section>`;
    const setupBlock = (cards, mod = '') => `<div class="home__top${mod}">
${cards}
      </div>`;
    const nowBlock = `      <section class="ds-card" aria-labelledby="h-now">
        <h3 class="ds-section-title" id="h-now">¿Qué está pasando?</h3>
        <p class="ds-card__sub">${f ? `${esc(FP.navigation.contextLabel({ channel: f.ch }))} · ${esc(f.label)}` : 'Sin plan o real todavía.'}</p>
        <div class="home__body">
          ${f ? `<ul class="headline">${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><div class="metric-grid">${cards}</div>`
            : `<div class="empty ds-empty"><strong class="ds-empty__t">Todavía no hay datos para esta vista</strong><p class="ds-empty__d">Inicio resume plan, actual, forecast y reforecast.</p></div>`}
        </div>
      </section>`;
    const flowBlock = `      <section class="ds-card" aria-labelledby="h-flow">
        <div class="home__row"><h3 class="ds-section-title" id="h-flow">Recorrido del sistema</h3>
          <span class="ds-badge ds-badge--lg">${doneN} de ${flow.length} etapas</span></div>
        <ol class="stepper">${flow.map(([l, v, done, d], i) => `<li class="${done ? 'is-done' : ''}"><a href="#${v}">
          <span class="stepper__n" aria-hidden="true">${done ? CHECK : i + 1}</span><strong>${esc(l)}</strong><span class="stepper__d">${esc(d)}</span>
          <span class="ds-badge ${done ? 'ds-badge--observed' : ''}">${done ? 'Hecho' : 'Pendiente'}</span></a></li>`).join('')}</ol>
      </section>`;
    // Vacío (sin plan/forecast): primeros pasos y preparación → recorrido → qué está pasando.
    // Con datos: recorrido → qué está pasando → preparación y siguiente paso (al final).
    // Con datos: «Lo esencial» siempre a la vista; todo lo demás sigue en la página, plegado en «Ver más» y «Metodología y ayuda» (nada se omite).
    // Vacío o solo plan: primeros pasos y preparación → recorrido → qué está pasando (sin cambios).
    let body;
    if (f && !planOnly && FP.homeSummaryView) {
      const sum = FP.homeSummaryView.build(state, h, f, next), more = FP.homeSummaryView.more;
      body = `${sum.key}
      <p class="home-layer"><strong>Ver más</strong> · los mismos datos, un clic abajo</p>
      ${more('now', 'Todas las cifras del periodo', '7 tarjetas: venta acumulada, meta acumulada, gap, cumplimiento, forecast, gap forecast y presión de recuperación', nowBlock)}
      ${sum.blocks.map((b) => more(b.id, b.title, b.hint, b.html)).join('\n')}
      <p class="home-layer"><strong>Metodología y ayuda</strong> · cómo se calcula y qué falta</p>
      ${more('flow', 'Recorrido del sistema y preparación de datos', '6 etapas, % de preparación y siguiente paso completo', `${flowBlock}\n\n${setupBlock(readyCard + '\n' + nextCard, ' home__top--ready-first')}`)}`;
    } else body = f && !planOnly
      ? `${flowBlock}\n\n${nowBlock}\n\n${setupBlock(readyCard + '\n' + nextCard, ' home__top--ready-first')}`
      : `${setupBlock(nextCard + '\n' + readyCard)}\n\n${flowBlock}\n\n${nowBlock}`;
    $('home').innerHTML = `<div class="home">
      <header class="home__head">
        <div><h2 class="ds-page-title">Inicio</h2>
          <p class="ds-lede">Centro de control: qué está pasando, contra qué se compara y qué sigue.</p></div>
        ${controls}
      </header>

${body}

      <details class="ds-accordion">
        <summary><span class="ds-accordion__n" aria-hidden="true">?</span>
          <span><h3 class="ds-accordion__t">Convenciones</h3><p class="ds-accordion__d">Estos conceptos no son equivalentes. Para más detalle, ve a <a href="#ayuda">¿Cómo funciona?</a></p></span>${'<svg class="ds-accordion__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'}</summary>
        <div class="ds-accordion__body"><dl class="conventions">${Object.keys(FP.guidanceConfig.STATES).map((k) => `<div><dt>${FP.help.stateTag(k)}</dt><dd>${esc(FP.guidanceConfig.STATES[k].short)}</dd></div>`).join('')}</dl></div>
      </details></div>`;
    if (!f) FP.help.enhanceEmpty($('home'), FP.contextEngine.requirements('inicio', status));
  }

  FP.homeView = { render, periodFigures, journey };
})(typeof window !== 'undefined' ? window : globalThis);
