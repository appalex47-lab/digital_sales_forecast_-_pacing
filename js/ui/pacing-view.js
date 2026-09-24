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

  function renderExecutive(state) {
    const esc = H().esc;
    const run = state.fc.run;
    const k = state.fc.metric;
    const a = run.total.annual;
    const td = a.toDate[k];
    const fg = a.forecastGap[k];
    const additive = !['conversionRate', 'aov'].includes(k);
    $('fc-kpis').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Total digital · ${esc(C().metrics[k].label)}</h3>
        <span class="btn-row">${pacePill(a.pacingStatus && k === 'revenue' ? a.pacingStatus : FP.gap.pacingStatus(td.compliance, run.settings.pacingThresholds))}
          <button type="button" class="btn btn--small" data-action="dx-from-forecast">Diagnosticar gap</button></span></div>
      <dl class="kpis kpis--6">
        <div><dt>${additive ? 'Meta del año' : 'Plan del año'}</dt><dd class="num">${esc(val(k, a.plan[k]))}</dd></div>
        <div><dt>Actual a la fecha</dt><dd class="num">${esc(val(k, a.actualToDate && a.actualToDate[k]))}</dd>
          <small>vs plan a la fecha ${esc(val(k, a.planToDate && a.planToDate[k]))}</small></div>
        <div><dt>Cumplimiento</dt><dd class="num">${esc(pct(td.compliance))}</dd><small>${a.countedDays} días con real</small></div>
        <div><dt>Gap a la fecha</dt><dd class="num">${esc(signed(k, td.gap))}</dd><small>${esc(spct(td.gapPct))}</small></div>
        <div><dt>Forecast de cierre</dt><dd class="num">${esc(val(k, a.forecast && a.forecast[k]))}</dd><small>Método ${esc(run.method.id)}</small></div>
        <div><dt>Gap forecast</dt><dd class="num">${esc(signed(k, fg.gap))}</dd><small>${esc(spct(fg.gapPct))} vs meta</small></div>
      </dl>
      <p class="field__hint">Gap a la fecha = actual − plan de los mismos días (plan diario ponderado). Gap forecast = forecast de cierre − meta del año. Son dos cosas distintas.
        ${a.missingActualDays ? ` <strong>${a.missingActualDays} días cerrados no tienen real</strong> y no entran al pacing.` : ''}</p>`;

    const rows = [...C().channelIds, 'total'].map((ch) => {
      const s = seriesOf(run, ch).annual;
      const t = s.toDate[k], g = s.forecastGap[k];
      return `<tr class="${ch === 'total' ? 'row-total' : ''}">
        <td>${chCell(ch)}</td>
        <td class="num">${esc(val(k, s.plan[k]))}</td>
        <td class="num">${esc(val(k, s.planToDate && s.planToDate[k]))}</td>
        <td class="num">${esc(val(k, s.actualToDate && s.actualToDate[k]))}</td>
        <td class="num">${esc(pct(t.compliance))}</td>
        <td class="num">${esc(signed(k, t.gap))}</td>
        <td class="num">${esc(val(k, s.forecast && s.forecast[k]))}</td>
        <td class="num">${esc(signed(k, g.gap))}<span class="cell-sub">${esc(spct(g.gapPct))}</span></td>
        <td>${pacePill(FP.gap.pacingStatus(t.compliance, run.settings.pacingThresholds))}</td>
      </tr>`;
    }).join('');
    $('fc-channels').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Canal</th><th class="num">Plan anual</th><th class="num">Plan a la fecha</th><th class="num">Actual YTD</th>
        <th class="num">Cumplimiento</th><th class="num">Gap YTD</th><th class="num">Forecast anual</th><th class="num">Gap forecast</th><th>Estado</th></tr></thead>
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
    const svg = FP.chart.lineChart({ dates: days.map((d) => d.date), series: items, metric: k, cutIndex: s.cutoffIndex,
      cutLabel: `corte ${run.cutoff}`, ariaLabel: `Plan, actual y forecast acumulados de ${chLabel(ch)}` });
    if (!svg) { $('fc-chart').innerHTML = '<div class="empty"><strong>Sin datos para graficar</strong></div>'; return; }
    $('fc-chart').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Tendencia acumulada · ${esc(chLabel(ch))} · ${esc(C().metrics[k].label)}</h3>
        <div class="field"><label for="fc-chart-ch" class="visually-hidden">Canal del gráfico</label>
          <select id="fc-chart-ch" data-action="fc-channel">${['total', ...C().channelIds].map((c) =>
            `<option value="${c}" ${c === ch ? 'selected' : ''}>${esc(chLabel(c))}</option>`).join('')}</select></div></div>
      ${FP.chart.legend([items[0], items[2], items[1]], k)}
      ${svg}
      <p class="field__hint">${ratio ? 'Para CR y AOV el acumulado es la razón de sumas a cada fecha, no un promedio de días.' : 'El forecast parte del actual acumulado al corte y suma la proyección diaria del método (conserva la estacionalidad del plan).'}</p>`;
  }

  /* ---------- Tablas por periodo ---------- */

  function periodRow(k, p, label, extra = '', thresholds = null) {
    const esc = H().esc;
    const t = p.toDate[k];
    const future = p.status === 'future';
    return `<tr>
      <td>${label}${extra}</td>
      <td>${esc(PERIOD_LABEL[p.status] || p.status)}${p.status === 'current' ? `<span class="cell-sub">${p.countedDays} de ${p.days} días con real</span>` : ''}</td>
      <td class="num">${esc(val(k, p.plan[k]))}${p.status === 'current' ? `<span class="cell-sub">a la fecha ${esc(val(k, p.planToDate && p.planToDate[k]))}</span>` : ''}</td>
      <td class="num">${future ? F().DASH : esc(val(k, p.actualToDate && p.actualToDate[k]))}</td>
      <td class="num">${future ? F().DASH : esc(signed(k, t.gap))}</td>
      <td class="num">${future ? F().DASH : esc(pct(t.compliance))}</td>
      <td class="num">${esc(val(k, p.forecast && p.forecast[k]))}${p.status === 'closed' ? '<span class="cell-sub">= actual</span>' : ''}</td>
      <td class="num">${esc(signed(k, p.forecastGap[k].gap))}<span class="cell-sub">${esc(spct(p.forecastGap[k].gapPct))}</span></td>
      <td>${future ? pacePill('future') : pacePill(FP.gap.pacingStatus(t.compliance, thresholds || undefined))}</td>
    </tr>`;
  }

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

    const head = (first) => `<thead><tr><th>${first}</th><th>Periodo</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Gap</th>
      <th class="num">Cumplimiento</th><th class="num">Forecast</th><th class="num">Gap forecast</th><th>Estado</th></tr></thead>`;
    let table = '';
    if (f.period === 'months') {
      const s = seriesOf(run, f.tableChannel);
      table = `<table class="table">${head('Mes')}<tbody>${s.months.map((m, i) => periodRow(k, m, MONTHS[i], '', th)).join('')}
        <tr class="row-total">${periodRow(k, s.annual, `<strong>Año ${run.year}</strong>`, '', th).replace(/^<tr>|<\/tr>$/g, '')}</tr></tbody></table>`;
    } else if (f.period === 'weeks') {
      const s = seriesOf(run, f.tableChannel);
      const weeks = s.weeks.filter((w) => w.firstDate.slice(0, 7) === f.month || w.lastDate.slice(0, 7) === f.month);
      table = `<table class="table">${head('Semana ISO')}<tbody>${weeks.map((w) => periodRow(k, w, esc(w.key),
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
          <td class="num">${esc(val(k, d.plan && d.plan[k]))}</td>
          <td class="num">${d.actual ? esc(val(k, d.actual[k])) : d.partialActual ? `${esc(val(k, d.partialActual[k]))}<span class="cell-sub">parcial, no cuenta</span>` : F().DASH}</td>
          <td class="num">${p ? esc(signed(k, p.gap)) : F().DASH}</td>
          <td class="num">${p ? esc(pct(p.compliance)) : F().DASH}</td>
          <td class="num">${esc(val(k, d.forecast && d.forecast[k]))}${d.forecastSource === 'actual' ? '<span class="cell-sub">= actual</span>' : d.fallback ? '<span class="cell-sub">índice sin datos: plan</span>' : ''}</td>
          <td>${pacePill(d.status)}</td>
          <td class="num">${cum ? esc(signed(k, cum.gap)) : F().DASH}${cum ? `<span class="cell-sub">${esc(pct(cum.compliance))} acum.</span>` : ''}</td>
        </tr>`);
      });
    });
    return `<table class="table"><thead><tr><th>Fecha</th>${channels.length > 1 ? '<th>Canal</th>' : ''}<th class="num">Plan</th><th class="num">Actual</th>
      <th class="num">Gap</th><th class="num">Cumplimiento</th><th class="num">Forecast</th><th>Estado</th><th class="num">Gap acumulado</th></tr></thead>
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
    $('fc-events').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Evento</th><th>Periodo</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Gap</th><th class="num">Forecast</th><th>Observación</th></tr></thead>
      <tbody>${run.events.map((e) => {
        const s = ch === 'total' ? e.total : e.byChannel[ch];
        if (!s) return '';
        const t = s.toDate[k];
        return `<tr><td><strong>${esc(e.name)}</strong><span class="cell-sub">${e.type === 'holiday' ? 'Festivo' : e.type === 'season' ? 'Temporada' : 'Evento'}</span></td>
          <td class="num">${esc(e.start)}${e.end !== e.start ? ` a ${esc(e.end)}` : ''}<span class="cell-sub">${esc(PERIOD_LABEL[s.status] || s.status)}</span></td>
          <td class="num">${esc(val(k, s.plan[k]))}</td>
          <td class="num">${s.status === 'future' ? F().DASH : esc(val(k, s.actualToDate && s.actualToDate[k]))}</td>
          <td class="num">${s.status === 'future' ? F().DASH : `${esc(signed(k, t.gap))}<span class="cell-sub">${esc(spct(t.gapPct))}</span>`}</td>
          <td class="num">${esc(val(k, s.forecast && s.forecast[k]))}</td>
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

  FP.pacingView = { render, signed, paceLabel, pacePill, seriesOf, chLabel, chCell };
})(typeof window !== 'undefined' ? window : globalThis);
