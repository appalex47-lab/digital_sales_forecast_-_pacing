/**
 * pacing-view.js — Vista "Pacing & Forecast", parte 1 (Fase 3).
 * Controles, tablero ejecutivo (total y canales), tendencia acumulada, tablas mensual /
 * semanal / diaria y eventos. Solo pinta a partir de `state.fc.run` (FP.forecastEngine).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const METRICS = () => C().metricKeys.map((k) => [k, C().metrics[k].label]);
  const PACE_PILL = { above: 'ok', on_plan: 'ok', below: 'warning', insufficient_data: 'na', in_progress: 'na', future: 'na' };
  const PERIOD_LABEL = { closed: 'Cerrado', current: 'En curso', future: 'Futuro' };
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  /* ---------- Formato ---------- */

  const val = (k, v) => F().metric(k, v);
  function signed(k, v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return F().DASH;
    const txt = k === 'conversionRate' ? `${(Math.abs(v) * 100).toFixed(2)} pp` : F().metric(k, Math.abs(v));
    const zero = !/[1-9]/.test(txt); // se muestra como cero: sin signo
    return `${zero ? '' : v > 0 ? '+' : '−'}${txt}`;
  }
  const pct = (v) => F().percent(v, 1);
  const spct = (v) => F().signedPercent(v, 1);

  /* ---------- Celdas sin valor: «—» con su motivo (solo presentación; no cambia ningún cálculo) ----------
     Un cero válido se muestra como cero (val/pct/signed ya lo formatean); solo lo ausente o no calculable lleva «—». */
  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const NA_LABEL = { 'sin-datos': 'Sin datos', 'no-calculable': 'No calculable', 'no-aplica': 'No aplica' };
  /** «—» accesible: foco con teclado, título al pasar el cursor, texto para lector de pantalla y toque en móvil (ver bindNaTap). */
  function na(kind, why) {
    const text = `${NA_LABEL[kind]}: ${why}`, e = H().esc(text);
    return `<span class="na" data-na="${kind}" data-why="${e}" tabindex="0" role="note" title="${e}" aria-label="${e}">${F().DASH}</span>`;
  }
  const cellVal = (k, v, r) => (isNum(v) ? H().esc(val(k, v)) : na(r[0], r[1]));
  const cellSigned = (k, v, r) => (isNum(v) ? H().esc(signed(k, v)) : na(r[0], r[1]));
  const cellPct = (v, r) => (isNum(v) ? H().esc(pct(v)) : na(r[0], r[1]));
  const FUT = ['no-aplica', 'periodo futuro, aún sin venta real'];
  /** Motivo de cada cálculo de un periodo/serie `s` para la métrica `k`, según qué insumo falta realmente. */
  function reasons(s, k) {
    const future = s.status === 'future';
    const planV = s.plan && s.plan[k], planTd = s.planToDate && s.planToDate[k], act = s.actualToDate && s.actualToDate[k];
    const sinPlan = ['sin-datos', 'no hay plan ni meta cargados para este periodo'];
    const actual = future ? FUT : ['sin-datos', 'no hay venta real cargada en este periodo'];
    const ratio = future ? FUT : !isNum(act) ? ['no-calculable', 'no hay días con real cargados para compararlo con el plan'] : !isNum(planTd) ? ['no-calculable', 'falta el plan a la fecha']
      : planTd === 0 ? ['no-calculable', 'el plan a la fecha es cero y no se puede dividir'] : ['no-calculable', 'falta un dato de origen'];
    const forecast = !isNum(planV) ? ['no-calculable', 'falta el plan para proyectar'] : ['no-calculable', 'el método no tiene datos suficientes para proyectar'];
    const fgap = !isNum(s.forecast && s.forecast[k]) ? ['no-calculable', 'falta el forecast'] : !isNum(planV) ? ['no-calculable', 'falta la meta del periodo'] : ['no-calculable', 'falta un dato de origen'];
    return { plan: sinPlan, planTd: sinPlan, actual, ratio, forecast, fgap };
  }
  /** En móvil no existe «pasar el cursor»: un toque (o Enter/Espacio) muestra el motivo en el aviso emergente. */
  let naBound = false;
  function bindNaTap() {
    if (naBound || typeof document === 'undefined') return; naBound = true;
    const show = (el) => { const w = el && el.closest && el.closest('.na'); if (w && w.dataset.why && FP.ui && FP.ui.toast) FP.ui.toast(w.dataset.why); };
    document.addEventListener('click', (e) => show(e.target));
    document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('na')) { e.preventDefault(); show(e.target); } });
  }
  bindNaTap();

  function paceLabel(status) {
    const L = C().pacingStatusLabels;
    if (L[status]) return L[status];
    return status === 'in_progress' ? 'En curso' : status === 'future' ? 'Futuro' : 'Sin dato';
  }
  const pacePill = (status) => H().pill(PACE_PILL[status] || 'na', paceLabel(status));

  const seriesOf = (run, ch) => (ch === 'total' ? run.total : run.channels[ch]);
  const chLabel = (ch) => (ch === 'total' ? 'Total digital' : FP.dataModel.getChannel(ch).label);
  const chCell = (ch) => (ch === 'total' ? '<strong>Total digital</strong>'
    : `<span class="channel-cell" style="--dot:${FP.dataModel.getChannel(ch).color}">${H().esc(chLabel(ch))}</span>`);

  /* ---------- Controles ---------- */

  function renderControls(state) {
    const esc = H().esc;
    const fc = state.fc;
    const cfg = FP.forecastEngine.effectiveConfig(fc.settings);
    const run = fc.run;
    const ref = run ? run.referenceDate : cfg.referenceDate;
    $('fc-controls').innerHTML = `
      <div class="filters">
        <div class="field"><label for="fc-ref" class="field__hint">Fecha de referencia</label>
          <input id="fc-ref" type="date" value="${esc(fc.settings.referenceDate || '')}" data-action="fc-setting" data-key="referenceDate">
          <span class="field__hint">${fc.settings.referenceDate ? 'Fija: reproduce el análisis de ese día.' : `Vacía = hoy del dispositivo (${esc(ref || '')}).`}</span></div>
        <div class="field"><span class="field__hint">Atajos</span>
          <div class="btn-row">
            <button type="button" class="btn btn--small" data-action="fc-ref-last" ${fc.lastActualDate ? '' : 'disabled'}>Último día con real${fc.lastActualDate ? ` (${esc(fc.lastActualDate)})` : ''}</button>
            <button type="button" class="btn btn--small btn--ghost" data-action="fc-ref-today">Hoy</button>
          </div></div>
        <div class="field"><label for="fc-today" class="field__hint">Día de referencia</label>
          <select id="fc-today" data-action="fc-setting" data-key="todayStatus">
            <option value="completed" ${cfg.todayStatus === 'completed' ? 'selected' : ''}>Completo (su real es final)</option>
            <option value="in_progress" ${cfg.todayStatus === 'in_progress' ? 'selected' : ''}>En curso (carga parcial)</option>
          </select></div>
        <div class="field"><label for="fc-method" class="field__hint">Método de forecast</label>
          <select id="fc-method" data-action="fc-setting" data-key="method">
            ${Object.entries(cfg.methods).map(([id, m]) => `<option value="${id}" ${id === cfg.method ? 'selected' : ''}>${id} · ${esc(m.label)}</option>`).join('')}
          </select></div>
        <div class="field"><span class="field__hint">Métrica</span>
          ${H().segmented('fc-metric', METRICS(), fc.metric)}</div>
      </div>
      ${run ? `<p class="field__hint fc-context">Plan: <strong>${esc(run.plan.label)}</strong>${run.plan.source === 'original_distributed_plan' ? ' (congelado, solo lectura)' : ''}.
        Corte de real: <strong>${esc(run.cutoff || '—')}</strong>. Año ${run.year}. Método en uso: <strong>${esc(run.method.id)} · ${esc(run.method.label)}</strong>.</p>` : ''}`;
  }

  /* ---------- Tablero ejecutivo ---------- */

  /** Fase 9.1: acceso a "¿Por qué este número?" (explica con la corrida real; no calcula nada). */
  const why = (kind, metric, channel = 'total', periodKey = '') => (FP.explain ? FP.explain.whyButton(kind, { channel, periodKey, metric }) : '');

  /**
   * Métrica con el patrón común: etiqueta de estado (texto + patrón) · etiqueta · valor · referencia. Solo presentación.
   * La etiqueta sigue siendo un <dt> para conservar el botón «?» que agrega FP.help.decorate.
   */
  function card(label, value, ref, state, extra = '', title = '') {
    const tag = state && FP.help ? FP.help.stateTag(state) : '';
    return `<dl class="metric-card${state ? ` metric-card--${state}` : ''}"${title ? ` title="${H().esc(title)}"` : ''}><div class="metric-card__group">
      <dt class="metric-card__label">${H().esc(label)}</dt>${tag || extra ? `<dd class="metric-card__state">${tag}${extra}</dd>` : ''}
      <dd class="metric-card__value num">${value}</dd>
      ${ref ? `<dd class="metric-card__period">${ref}</dd>` : ''}</div></dl>`;
  }

  function renderExecutive(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const k = state.fc.metric;
    const a = run.total.annual;
    const td = a.toDate[k];
    const R = reasons(a, k);
    const fg = a.forecastGap[k];
    const additive = !['conversionRate', 'aov'].includes(k);
    // Fase 3: qué tan sólida es la base del cierre estimado (solo ingresos; no cambia ninguna cifra)
    let conf = null;
    try { const C = FP.forecastConfidence, r0 = k === 'revenue' && C ? C.assess({ run, channel: 'total', period: { type: 'year', key: String(state.year) }, advisor: FP.methodAdvisor }) : null; conf = r0 && r0.status === 'ok' ? r0 : null; } catch (e) { conf = null; }
    const confNote = conf ? ` <strong>Confianza del cierre: ${esc(conf.label)}.</strong> ${conf.factors.map((x) => `${esc(x.label)}: ${esc(x.levelLabel.toLowerCase())} (${esc(x.detail)})`).join('; ')}. Mide qué tan sólida es la base de la estimación, no la probabilidad de acertar.` : '';
    $('fc-kpis').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Total digital · ${esc(C().metrics[k].label)}</h3>
        <span class="btn-row">${pacePill(a.pacingStatus && k === 'revenue' ? a.pacingStatus : FP.gap.pacingStatus(td.compliance, run.settings.pacingThresholds))}
          <button type="button" class="btn btn--small" data-action="dx-from-forecast">Diagnosticar gap</button></span></div>
      <div class="metric-grid metric-grid--3">
        ${card(additive ? 'Meta del año' : 'Plan del año', cellVal(k, a.plan[k], R.plan), '', 'plan')}
        ${card('Actual a la fecha', cellVal(k, a.actualToDate && a.actualToDate[k], R.actual), `vs plan a la fecha ${cellVal(k, a.planToDate && a.planToDate[k], R.planTd)} ${k === 'revenue' ? why('identity', k) : ''}`, 'actual')}
        ${card('Cumplimiento', cellPct(td.compliance, R.ratio), `${a.countedDays} días con real ${why('compliance', k)}`)}
        ${card('Gap a la fecha', cellSigned(k, td.gap, R.ratio), `${esc(spct(td.gapPct))} ${why('gap', k)}`)}
        ${card('Forecast de cierre', cellVal(k, a.forecast && a.forecast[k], R.forecast), `Método ${esc(run.method.id)} ${why('forecast', k)}${conf ? ` <span class="ds-badge" data-conf-chip="${esc(conf.level)}">Confianza ${esc(conf.label)}</span>` : ''}`, 'forecast')}
        ${card('Gap forecast', cellSigned(k, fg.gap, R.fgap), `${esc(spct(fg.gapPct))} vs meta ${why('forecastGap', k)}`, 'forecast')}
      </div>
      <p class="field__hint">Gap a la fecha = actual − plan de los mismos días (plan diario ponderado). Gap forecast = forecast de cierre − meta del año. Son dos cosas distintas.
        ${a.missingActualDays ? ` <strong>${a.missingActualDays} días cerrados no tienen real</strong> y no entran al pacing.` : ''}${confNote}</p>`;

    const rows = [...C().channelIds, 'total'].map((ch) => {
      const s = seriesOf(run, ch).annual;
      const t = s.toDate[k], g = s.forecastGap[k], R = reasons(s, k);
      return `<tr class="${ch === 'total' ? 'row-total' : ''}">
        <td>${chCell(ch)}</td>
        <td class="num">${cellVal(k, s.plan[k], R.plan)}</td>
        <td class="num">${cellVal(k, s.planToDate && s.planToDate[k], R.planTd)}</td>
        <td class="num">${cellVal(k, s.actualToDate && s.actualToDate[k], R.actual)}</td>
        <td class="num">${cellPct(t.compliance, R.ratio)}</td>
        <td class="num">${cellSigned(k, t.gap, R.ratio)}</td>
        <td class="num">${cellVal(k, s.forecast && s.forecast[k], R.forecast)}</td>
        <td class="num">${cellSigned(k, g.gap, R.fgap)}<span class="cell-sub">${esc(spct(g.gapPct))}</span></td>
        <td>${pacePill(FP.gap.pacingStatus(t.compliance, run.settings.pacingThresholds))}</td>
      </tr>`;
    }).join('');
    $('fc-channels').innerHTML = `<div class="table-wrap"><table class="table ds-table">
      <thead><tr><th>Canal</th><th class="num" data-state="plan">Plan anual</th><th class="num" data-state="plan">Plan a la fecha</th><th class="num" data-state="actual">Actual YTD</th>
        <th class="num">Cumplimiento</th><th class="num">Gap YTD</th><th class="num" data-state="forecast">Forecast anual</th><th class="num" data-state="forecast">Gap forecast</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Cada canal se proyecta con sus propios índices; el total digital es la suma de los canales. El estado es solo matemático (umbrales en Parámetros), no un juicio sobre la causa.</p>`;
  }

  /* ---------- Tendencia acumulada (SVG) ---------- */

  function cumulativeSeries(days, k) {
    const sum = { plan: {}, actual: {}, forecast: {} };
    const add = (acc, b) => { ['revenue', 'orders', 'trafficVolume'].forEach((m) => { acc[m] = (acc[m] || 0) + (b && Number.isFinite(b[m]) ? b[m] : 0); }); };
    const pick = (acc) => {
      if (k === 'conversionRate') return FP.metrics.safeDivide(acc.orders, acc.trafficVolume);
      if (k === 'aov') return FP.metrics.safeDivide(acc.revenue, acc.orders);
      return acc[k] === undefined ? null : acc[k];
    };
    const out = { plan: [], actual: [], forecast: [] };
    let lastCounted = -1;
    days.forEach((d, i) => { if (d.counted) lastCounted = i; });
    days.forEach((d, i) => {
      if (d.plan) add(sum.plan, d.plan);
      out.plan.push(d.plan ? pick(sum.plan) : null);
      if (d.counted) add(sum.actual, d.actual);
      out.actual.push(i <= lastCounted ? pick(sum.actual) : null);
      if (d.forecast) add(sum.forecast, d.forecast);
      out.forecast.push(d.forecast && i >= lastCounted ? pick(sum.forecast) : null);
    });
    return { ...out, cutoffIndex: lastCounted };
  }

  function renderChart(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const ch = state.fc.channel;
    const k = state.fc.metric;
    const days = seriesOf(run, ch).days;
    const s = cumulativeSeries(days, k);
    const ratio = ['conversionRate', 'aov'].includes(k);
    const items = [
      { values: s.plan, cls: 'chart-line--plan', swatch: 'legend__swatch--plan', label: 'Plan acumulado' },
      { values: s.forecast, cls: 'chart-line--forecast', swatch: 'legend__swatch--forecast', label: 'Forecast' },
      { values: s.actual, cls: 'chart-line--actual', swatch: 'legend__swatch--actual', label: 'Actual acumulado' }
    ];
    // Marcador: día en que el forecast acumulado alcanza la meta anual (solo métricas aditivas)
    let markers = [], goalNote = '';
    if (!ratio) {
      const g = FP.forecastEngine.periodGoal(seriesOf(run, ch), { type: 'year' }, { cutoff: run.cutoff, metric: k });
      const label = FP.forecastEngine.goalLabel(g, 'año');
      if (label) goalNote = label;
      if (g.date) markers = [{ index: days.findIndex((d) => d.date === g.date), value: g.goal, label: `Meta anual · ${FP.forecastEngine.longDay(g.date)}${g.status === 'projected' ? ' (est.)' : ''}` }];
    }
    const svg = FP.chart.lineChart({ dates: days.map((d) => d.date), series: items, metric: k, cutIndex: s.cutoffIndex,
      cutLabel: `corte ${run.cutoff}`, ariaLabel: `Plan, actual y forecast acumulados de ${chLabel(ch)}`, markers });
    if (!svg) { $('fc-chart').innerHTML = '<div class="empty"><strong>Sin datos para graficar</strong></div>'; return; }
    $('fc-chart').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Tendencia acumulada · ${esc(chLabel(ch))} · ${esc(C().metrics[k].label)}</h3>
        <div class="field"><label for="fc-chart-ch" class="visually-hidden">Canal del gráfico</label>
          <select id="fc-chart-ch" data-action="fc-channel">${['total', ...C().channelIds].map((c) =>
            `<option value="${c}" ${c === ch ? 'selected' : ''}>${esc(chLabel(c))}</option>`).join('')}</select></div></div>
      ${FP.chart.legend([items[0], items[2], items[1]], k)}
      ${goalNote ? `<p class="chart-goalnote" data-goal-note><strong>${esc(goalNote)}.</strong></p>` : ''}
      ${svg}
      <p class="field__hint">${ratio ? 'Para CR y AOV el acumulado es la razón de sumas a cada fecha, no un promedio de días.' : 'El forecast parte del actual acumulado al corte y suma la proyección diaria del método (conserva la estacionalidad del plan).'}</p>`;
  }

  /* ---------- Tablas por periodo ---------- */

  function periodRow(k, p, label, extra = '', thresholds = null) {
    const esc = H().esc;
    const t = p.toDate[k];
    const future = p.status === 'future';
    const R = reasons(p, k);
    return `<tr>
      <td>${label}${extra}</td>
      <td>${esc(PERIOD_LABEL[p.status] || p.status)}${p.status === 'current' ? `<span class="cell-sub">${p.countedDays} de ${p.days} días con real</span>` : ''}</td>
      <td class="num">${cellVal(k, p.plan[k], R.plan)}${p.status === 'current' ? `<span class="cell-sub">a la fecha ${cellVal(k, p.planToDate && p.planToDate[k], R.planTd)}</span>` : ''}</td>
      <td class="num">${future ? na(FUT[0], FUT[1]) : cellVal(k, p.actualToDate && p.actualToDate[k], R.actual)}</td>
      <td class="num">${future ? na(FUT[0], FUT[1]) : cellSigned(k, t.gap, R.ratio)}</td>
      <td class="num">${future ? na(FUT[0], FUT[1]) : cellPct(t.compliance, R.ratio)}</td>
      <td class="num">${cellVal(k, p.forecast && p.forecast[k], R.forecast)}${p.status === 'closed' ? '<span class="cell-sub">= actual</span>' : ''}</td>
      <td class="num">${cellSigned(k, p.forecastGap[k].gap, R.fgap)}<span class="cell-sub">${esc(spct(p.forecastGap[k].gapPct))}</span></td>
      <td>${future ? pacePill('future') : pacePill(FP.gap.pacingStatus(t.compliance, thresholds || undefined))}</td>
    </tr>`;
  }

  const longDayShort = (iso) => `${+iso.slice(8, 10)} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+iso.slice(5, 7) - 1]}`;

  function renderPeriods(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const k = state.fc.metric;
    const f = state.fc;
    const th = run.settings.pacingThresholds;
    const monthKeys = run.total.months.map((m) => m.key);
    if (!monthKeys.includes(f.month)) f.month = (run.cutoff && monthKeys.includes(run.cutoff.slice(0, 7))) ? run.cutoff.slice(0, 7) : monthKeys[0];
    const chOptions = (withAll) => [...(withAll ? [['all', 'Todos los canales']] : []), ['total', 'Total digital'], ...C().channels.map((c) => [c.id, c.label])];
    if (f.tableChannel === 'all' && f.period !== 'days') f.tableChannel = 'total';

    const controls = `<div class="filters">
      <div class="field"><span class="field__hint">Nivel</span>
        ${H().segmented('fc-period', [['months', 'Meses'], ['weeks', 'Semanas'], ['days', 'Días']], f.period)}</div>
      <div class="field"><label for="fc-tch" class="field__hint">Canal</label>
        <select id="fc-tch" data-action="fc-table-channel">${chOptions(f.period === 'days').map(([v, l]) => `<option value="${v}" ${v === f.tableChannel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${f.period !== 'months' ? `<div class="field"><label for="fc-month" class="field__hint">Mes</label>
        <select id="fc-month" data-action="fc-month">${monthKeys.map((m, i) => `<option value="${m}" ${m === f.month ? 'selected' : ''}>${MONTHS[i]} ${run.year}</option>`).join('')}</select></div>` : ''}
    </div>`;

    const head = (first) => `<thead><tr><th>${first}</th><th>Periodo</th><th class="num" data-state="plan">Plan</th><th class="num" data-state="actual">Actual</th><th class="num">Gap</th>
      <th class="num">Cumplimiento</th><th class="num" data-state="forecast">Forecast</th><th class="num" data-state="forecast">Gap forecast</th><th>Estado</th></tr></thead>`;
    let table = '';
    if (f.period === 'months') {
      const s = seriesOf(run, f.tableChannel);
      const FE = FP.forecastEngine, additive = !['conversionRate', 'aov'].includes(k);
      const goalCell = (period, scope) => {
        if (!additive) return '';
        const g = FE.periodGoal(s, period, { cutoff: run.cutoff, metric: k });
        const t = g.status === 'reached' || g.status === 'projected' ? longDayShort(g.date) + (g.status === 'projected' ? ' <span class="cell-sub">estimado</span>' : ' <span class="cell-sub">cumplida</span>')
          : g.status === 'missed' ? '<span class="cell-sub">No se cumplió</span>' : g.status === 'not_reached' ? `<span class="cell-sub">No llega (${esc((g.attainment * 100).toFixed(0))} %)</span>` : (g.status === 'no_goal' ? na('sin-datos', 'no hay meta definida para este periodo') : na('no-calculable', 'faltan datos para estimar cuándo se alcanza'));
        return `<td data-goal="${esc(g.status)}" data-goal-date="${esc(g.date || '')}">${t}</td>`;
      };
      const inner = (html) => html.replace(/^<tr>|<\/tr>\s*$/g, '');   // contenido de las celdas, sin <tr>
      const rowWithGoal = (html, cell, cls = '') => `<tr${cls}>${inner(html)}${cell}</tr>`;
      const headG = additive ? head('Mes').replace('<th>Estado</th></tr>', '<th>Estado</th><th>Meta alcanzada</th></tr>') : head('Mes');
      table = `<table class="table ds-table">${headG}<tbody>${s.months.map((m, i) => rowWithGoal(periodRow(k, m, MONTHS[i], '', th), goalCell({ type: 'month', key: m.key }))).join('')}
        ${rowWithGoal(periodRow(k, s.annual, `<strong>Año ${run.year}</strong>`, '', th), goalCell({ type: 'year' }), ' class="row-total"')}</tbody></table>`;
    } else if (f.period === 'weeks') {
      const s = seriesOf(run, f.tableChannel);
      const weeks = s.weeks.filter((w) => w.firstDate.slice(0, 7) === f.month || w.lastDate.slice(0, 7) === f.month);
      table = `<table class="table ds-table">${head('Semana ISO')}<tbody>${weeks.map((w) => periodRow(k, w, esc(w.key),
        `<span class="cell-sub">${esc(w.weekStart)} a ${esc(w.weekEnd)}${w.crossesMonths ? ', cruza meses' : ''}</span>`, th)).join('')}</tbody></table>`;
    } else {
      table = dailyTable(run, k, f);
    }
    $('fc-periods').innerHTML = `${controls}<div class="table-wrap${f.period === 'months' ? '' : ' table-wrap--tall'}">${table}</div>
      <p class="field__hint">${f.period === 'weeks' ? 'Semanas ISO completas (lunes a domingo): una semana que cruza meses aparece en ambos meses con sus totales completos.'
        : f.period === 'days' ? 'Días futuros: sin actual; el forecast es la proyección del método sobre el plan diario. Un día aislado no indica una caída estructural.'
        : 'Mes cerrado: forecast = actual. Mes en curso: actual acumulado + forecast de los días restantes; gap y cumplimiento contra el plan de los días con real.'}</p>`;
  }

  function dailyTable(run, k, f) {
    const esc = H().esc;
    const channels = f.tableChannel === 'all' ? C().channelIds : [f.tableChannel];
    const rows = [];
    seriesOf(run, channels[0]).days.forEach((d0, i) => {
      if (d0.month !== f.month) return;
      channels.forEach((ch) => {
        const d = seriesOf(run, ch).days[i];
        const p = d.pacing ? d.pacing[k] : null;
        const cum = d.cumulative ? d.cumulative[k] : null;
        const tag = d.tag ? [d.tag.event, d.tag.holiday, d.tag.season].filter(Boolean).join(', ') : '';
        rows.push(`<tr class="${d.temporal === 'today' ? 'row-today' : ''}">
          <td class="num">${esc(d.date)}${d.temporal === 'today' ? '<span class="cell-sub">referencia</span>' : ''}${tag ? `<span class="cell-sub">${esc(tag)}</span>` : ''}</td>
          ${channels.length > 1 ? `<td>${chCell(ch)}</td>` : ''}
          <td class="num">${cellVal(k, d.plan && d.plan[k], ['sin-datos', 'no hay plan diario para este día'])}</td>
          <td class="num">${d.actual ? esc(val(k, d.actual[k])) : d.partialActual ? `${esc(val(k, d.partialActual[k]))}<span class="cell-sub">parcial, no cuenta</span>` : (d.temporal === 'future' ? na('no-aplica', 'día futuro, aún sin venta real') : na('sin-datos', 'no hay venta real cargada este día'))}</td>
          <td class="num">${p ? cellSigned(k, p.gap, ['no-calculable', 'falta el plan o el real de este día']) : (d.temporal === 'future' ? na('no-aplica', 'día futuro, aún sin venta real') : na('no-calculable', 'falta el real de este día para compararlo con el plan'))}</td>
          <td class="num">${p ? cellPct(p.compliance, ['no-calculable', 'el plan del día es cero o falta']) : (d.temporal === 'future' ? na('no-aplica', 'día futuro, aún sin venta real') : na('no-calculable', 'falta el real de este día para compararlo con el plan'))}</td>
          <td class="num">${cellVal(k, d.forecast && d.forecast[k], ['no-calculable', 'el método no tiene datos suficientes para este día'])}${d.forecastSource === 'actual' ? '<span class="cell-sub">= actual</span>' : d.fallback ? '<span class="cell-sub">índice sin datos: plan</span>' : ''}</td>
          <td>${pacePill(d.status)}</td>
          <td class="num">${cum ? cellSigned(k, cum.gap, ['no-calculable', 'falta el acumulado: no hay real o plan']) : na('no-calculable', 'falta el acumulado: no hay real o plan')}${cum ? `<span class="cell-sub">${esc(pct(cum.compliance))} acum.</span>` : ''}</td>
        </tr>`);
      });
    });
    return `<table class="table ds-table"><thead><tr><th>Fecha</th>${channels.length > 1 ? '<th>Canal</th>' : ''}<th class="num" data-state="plan">Plan</th><th class="num" data-state="actual">Actual</th>
      <th class="num">Gap</th><th class="num">Cumplimiento</th><th class="num" data-state="forecast">Forecast</th><th>Estado</th><th class="num">Gap acumulado</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  }

  /* ---------- Eventos ---------- */

  function renderEvents(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const k = state.fc.metric;
    const ch = state.fc.channel;
    if (!run.events.length) {
      $('fc-events').innerHTML = '<p class="note">No hay eventos ni festivos marcados en el año planeado (datos cargados o eventos configurados).</p>';
      return;
    }
    $('fc-events').innerHTML = `<div class="table-wrap"><table class="table ds-table">
      <thead><tr><th>Evento</th><th>Periodo</th><th class="num" data-state="plan">Plan</th><th class="num" data-state="actual">Actual</th><th class="num">Gap</th><th class="num" data-state="forecast">Forecast</th><th>Observación</th></tr></thead>
      <tbody>${run.events.map((e) => {
        const s = ch === 'total' ? e.total : e.byChannel[ch];
        if (!s) return '';
        const t = s.toDate[k], R = reasons(s, k);
        return `<tr><td><strong>${esc(e.name)}</strong><span class="cell-sub">${e.type === 'holiday' ? 'Festivo' : e.type === 'season' ? 'Temporada' : 'Evento'}</span></td>
          <td class="num">${esc(e.start)}${e.end !== e.start ? ` a ${esc(e.end)}` : ''}<span class="cell-sub">${esc(PERIOD_LABEL[s.status] || s.status)}</span></td>
          <td class="num">${cellVal(k, s.plan[k], R.plan)}</td>
          <td class="num">${s.status === 'future' ? na(FUT[0], FUT[1]) : cellVal(k, s.actualToDate && s.actualToDate[k], R.actual)}</td>
          <td class="num">${s.status === 'future' ? na(FUT[0], FUT[1]) : `${cellSigned(k, t.gap, R.ratio)}<span class="cell-sub">${esc(spct(t.gapPct))}</span>`}</td>
          <td class="num">${cellVal(k, s.forecast && s.forecast[k], R.forecast)}</td>
          <td class="wrap"><span class="cell-sub">${esc(ch === 'total' && k === 'revenue' ? e.observation : s.countedDays ? `Durante el periodo se observó un gap de ${spct(t.gapPct)} en ${s.countedDays} días con real.` : 'Sin días con real todavía.')}</span></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="field__hint">Descriptivo: muestra lo que pasó durante el periodo del evento, no su causa. Canal según el selector del gráfico.</p>`;
  }

  function renderEmpty(state, reason) {
    ['fc-kpis', 'fc-channels', 'fc-chart', 'fc-periods', 'fc-events'].forEach((id) => { $(id).innerHTML = ''; });
    $('fc-kpis').innerHTML = `<div class="empty"><strong>No hay forecast todavía</strong>${H().esc(reason)}</div>`;
  }

  function render(state) {
    renderControls(state);
    const run = state.fc.run;
    const hasRun = Boolean(run && run.plan.source !== 'none');
    // «Ver más» (detalle) solo existe cuando hay una corrida que detallar: sin plan, la vista muestra únicamente el aviso
    document.querySelectorAll('#view-pacing .pacing-more, #view-pacing .home-layer').forEach((e) => { e.hidden = !hasRun; });
    if (!run || run.plan.source === 'none') {
      renderEmpty(state, 'Se necesita un plan del año: guarda el plan distribuido en Plan o importa un Plan / Meta en Carga de datos.');
      return false;
    }
    renderExecutive(state);
    renderChart(state);
    renderPeriods(state);
    renderEvents(state);
    return true;
  }

  FP.pacingView = { render, signed, paceLabel, pacePill, seriesOf, chLabel, chCell, card, na, cellVal, cellSigned };
})(typeof window !== 'undefined' ? window : globalThis);
