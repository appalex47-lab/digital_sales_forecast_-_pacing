/**
 * reforecast-view.js — Vista "Recovery & Reforecast" (Fase 4).
 * Solo pinta `state.rf.run` (FP.reforecastEngine). Separa siempre plan, forecast y reforecast.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const PV = () => FP.pacingView;
  const $ = (id) => document.getElementById(id);

  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const CONF_PILL = { excellent: 'ok', sufficient: 'ok', limited: 'warning', insufficient: 'error' };
  const confPill = (c) => (c ? H().pill(CONF_PILL[c], C().confidenceLabels[c]) : H().pill('na', 'No aplica'));
  const KIND = { actual: 'Congelado (real)', required: 'Requerido', plan: 'Plan (fuera del horizonte)', missing_actual: 'Pasado sin real' };
  const PERIOD = { closed: 'Cerrado', current: 'En curso', future: 'Futuro' };

  const val = (k, v) => F().metric(k, v);
  const signed = (k, v) => PV().signed(k, v);
  const spct = (v) => F().signedPercent(v, 1);
  const S = (rf, ch) => (ch === 'total' ? rf.total : rf.channels[ch]);
  const chLabel = (ch) => PV().chLabel(ch);
  const horizonName = (h) => (h.type === 'year' ? `año ${h.key}` : `${MONTHS[+h.key.slice(5, 7) - 1].toLowerCase()} ${h.key.slice(0, 4)}`);

  /* ---------- Controles ---------- */

  function renderControls(state) {
    const esc = H().esc;
    const r = state.rf;
    const cfg = FP.reforecastEngine.effectiveConfig(r.settings);
    const rf = r.run;
    $('rf-controls').innerHTML = `
      ${r.simDate ? `<div class="banner banner--warning" role="status"><p class="banner__title">Simulación al ${esc(r.simDate)}</p>
        <p class="banner__text">Escenario temporal: se ignora el real posterior a esa fecha. No modifica datos, plan ni forecast guardados.
        <button type="button" class="btn btn--small" data-action="rf-sim-exit">Salir de la simulación</button></p></div>` : ''}
      <div class="filters">
        <div class="field"><label for="rf-horizon" class="field__hint">Horizonte del pendiente</label>
          <select id="rf-horizon" data-action="rf-setting" data-key="horizon">${Object.entries(cfg.horizons).map(([id, l]) =>
            `<option value="${id}" ${id === cfg.horizon ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="rf-assump" class="field__hint">AOV y CR para pedidos y volumen</label>
          <select id="rf-assump" data-action="rf-setting" data-key="assumptionSource">${Object.entries(cfg.assumptionSources).map(([id, l]) =>
            `<option value="${id}" ${id === cfg.assumptionSource ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="rf-sim" class="field__hint">Simular reforecast a otra fecha</label>
          <div class="btn-row"><input id="rf-sim" type="date" value="${esc(r.simDate || '')}">
            <button type="button" class="btn btn--small" data-action="rf-sim">Simular</button></div></div>
        <div class="field"><label for="rf-floor" class="field__hint">Mínimo en días con peso 0</label>
          <input id="rf-floor" type="number" min="0" step="0.1" value="${esc(cfg.zeroWeightFloor)}" data-action="rf-setting" data-key="zeroWeightFloor">
          <span class="field__hint">0 = sin requerimiento. 0.5 = mitad del peso promedio.</span></div>
        <div class="field"><span class="field__hint">Métrica</span>
          ${H().segmented('rf-metric', C().metricKeys.map((k) => [k, C().metrics[k].label]), r.metric)}</div>
      </div>
      ${rf ? `<p class="field__hint fc-context">Referencia <strong>${esc(rf.referenceDate)}</strong>${r.simDate ? ' (simulada)' : ' (de Pacing &amp; Forecast)'}, corte de real <strong>${esc(rf.cutoff || '—')}</strong>.
        Plan: <strong>${esc(rf.plan.label)}</strong>. Forecast: método <strong>${esc(rf.forecast.method.id)} · ${esc(rf.forecast.method.label)}</strong>.
        Método del reforecast: <strong>reparto por pesos futuros</strong> del plan original.</p>` : ''}`;
  }

  /* ---------- Tres líneas y tarjetas ---------- */

  function renderSummary(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const t = rf.total;
    const h = t.horizon, hs = t.horizonSummary;
    const target = h.target, fc = hs && hs.forecast ? hs.forecast.revenue : null, refc = hs && hs.reforecast ? hs.reforecast.revenue : null;
    const max = Math.max(...[target, fc, refc].filter(Number.isFinite), 1);
    const bar = (label, v, cls, note) => `<div class="closure-bar">
      <span class="closure-bar__label">${esc(label)}</span>
      <span class="closure-bar__track"><span class="closure-bar__fill ${cls}" style="width:${Math.max(1, (v / max) * 100).toFixed(2)}%"></span></span>
      <span class="closure-bar__value num">${esc(F().currency(v, 0))}</span><span class="closure-bar__note">${esc(note)}</span></div>`;
    const fgap = Number.isFinite(fc) && Number.isFinite(target) ? fc - target : null;
    const press = hs && hs.pressure ? hs.pressure.revenue.pressure : null;
    $('rf-summary').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Total digital · cierre del ${esc(horizonName(h))}</h3>
        <span class="btn-row">Confianza del cálculo: ${confPill(t.confidence.level)}
          <button type="button" class="btn btn--small" data-action="dx-from-reforecast">Diagnosticar recuperación</button></span></div>
      <div class="closure-bars">
        ${bar('Plan original (meta)', target, 'closure-bar__fill--plan', 'Lo que debíamos vender')}
        ${bar('Forecast actual', fc, 'closure-bar__fill--forecast', 'Lo que estimamos que ocurrirá')}
        ${bar('Reforecast requerido', refc, 'closure-bar__fill--reforecast', 'Lo que tendría que ocurrir para conservar la meta')}
      </div>
      <dl class="kpis kpis--7">
        <div><dt>Meta</dt><dd class="num">${esc(F().currency(target, 0))}</dd><small>Plan original, no cambia</small></div>
        <div><dt>Actual</dt><dd class="num">${esc(F().currency(h.actualToDate, 0))}</dd><small>${h.countedDays} días con real</small></div>
        <div><dt>Forecast</dt><dd class="num">${esc(F().currency(fc, 0))}</dd><small>Método ${esc(rf.forecast.method.id)}</small></div>
        <div><dt>Gap forecast</dt><dd class="num">${esc(signed('revenue', fgap))}</dd><small>Forecast − meta</small></div>
        <div><dt>Reforecast</dt><dd class="num">${esc(F().currency(refc, 0))}</dd><small>Actual + requerido</small></div>
        <div><dt>Recuperación requerida</dt><dd class="num">${esc(F().currency(h.requiredTotal, 0))}</dd><small>Pendiente en ${h.futureDays} días futuros ${FP.explain ? FP.explain.whyButton('reforecast', { channel: 'total' }) : ''}</small></div>
        <div><dt>Presión de recuperación</dt><dd class="num">${esc(spct(press))}</dd><small>Requerido vs plan de esos días</small></div>
      </dl>
      ${h.surplus ? `<p class="note note--ok">Surplus: ${esc(F().currency(h.surplus, 0))} por encima de la meta en canales que ya la superaron. El requerimiento de esos canales es 0 y el exceso no se usa para compensar otros canales.</p>` : ''}
      <p class="field__hint">El reforecast muestra cuánto tendría que venderse en los días futuros para mantener la meta original. No significa que esa venta vaya a ocurrir: lo esperado es el forecast.</p>
      ${horizonsSideBySide(state)}`;

    // Escenario de recuperación
    const rows = ['total', ...C().channelIds].map((ch) => {
      const s = S(rf, ch), hh = s.horizon, sp = s.horizonSummary;
      const f = sp && sp.forecast ? sp.forecast.revenue : null;
      const need = Number.isFinite(f) && Number.isFinite(hh.target) ? hh.target - f : null;
      return `<tr class="${ch === 'total' ? 'row-total' : ''}"><td>${PV().chCell(ch)}</td>
        <td class="num">${esc(F().currency(f, 0))}</td><td class="num">${esc(F().currency(hh.target, 0))}</td>
        <td class="num">${need === null ? F().DASH : need > 0 ? esc(F().currency(need, 0)) : '—'}</td>
        <td class="wrap"><span class="cell-sub">${need === null ? '' : need > 0 ? 'Venta adicional sobre lo esperado para llegar a la meta.' : `El forecast ya supera la meta por ${esc(F().currency(-need, 0))}.`}</span></td></tr>`;
    }).join('');
    $('rf-recovery').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Canal</th><th class="num">Forecast actual</th><th class="num">Meta</th><th class="num">Venta adicional requerida</th><th>Lectura</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Solo cuantifica la diferencia entre lo esperado y lo necesario. Cómo conseguirla corresponde al módulo de diagnóstico.</p>`;
  }

  /** Año y mes en curso lado a lado (total digital). El selector solo decide qué horizonte alimenta las tablas. */
  function horizonsSideBySide(state) {
    const esc = H().esc;
    const a = state.rf.run, b = state.rf.altRun;
    if (!b) return '';
    const byType = { [a.horizon]: a, [b.horizon]: b };
    const cols = ['year', 'month'].map((t) => byType[t]).filter(Boolean);
    const cell = (rf, fn) => { const t = rf.total, hs = t.horizonSummary; return fn(t.horizon, hs); };
    const row = (label, fn) => `<tr><th scope="row">${esc(label)}</th>${cols.map((rf) => `<td class="num">${cell(rf, fn)}</td>`).join('')}</tr>`;
    const money = (v) => esc(F().currency(v, 0));
    return `<h4>Los dos horizontes, lado a lado</h4>
      <div class="table-wrap"><table class="table table--matrix">
        <thead><tr><th scope="col">Total digital</th>${cols.map((rf) => `<th scope="col" class="num">${esc(rf.settings.horizons[rf.horizon])}${rf === a ? ' <span class="chip">en tablas</span>' : ''}
          <span class="cell-sub">${esc(horizonName(rf.total.horizon))}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${row('Meta del periodo', (h) => money(h.target))}
          ${row('Actual acumulado', (h) => money(h.actualToDate))}
          ${row('Forecast del periodo', (h, hs) => money(hs && hs.forecast ? hs.forecast.revenue : null))}
          ${row('Recuperación requerida', (h) => money(h.requiredTotal))}
          ${row('Días que la reciben', (h) => esc(F().integer(h.futureDays)))}
          ${row('Presión vs plan de esos días', (h, hs) => esc(spct(hs && hs.pressure ? hs.pressure.revenue.pressure : null)))}
          ${row('Surplus', (h) => (h.surplus ? money(h.surplus) : F().DASH))}
        </tbody></table></div>
      <p class="field__hint">Año responde "¿llegamos a la meta anual?" y redistribuye también el gap de meses cerrados (se carga más en los meses fuertes: revisa la presión por mes).
        Mes en curso responde "¿qué necesitamos en lo que queda del mes?" y deja los meses futuros en plan. El selector de horizonte solo cambia qué cálculo alimenta las tablas.</p>`;
  }

  /* ---------- Tabla ejecutiva por canal ---------- */

  function renderChannels(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const k = state.rf.metric;
    const rows = [...C().channelIds, 'total'].map((ch) => {
      const s = S(rf, ch), hs = s.horizonSummary, h = s.horizon;
      const fcv = hs && hs.forecast ? hs.forecast[k] : null;
      const tgt = hs && hs.plan ? hs.plan[k] : null;
      const press = hs && hs.pressure ? hs.pressure[k] : null;
      return `<tr class="${ch === 'total' ? 'row-total' : ''}"><td>${PV().chCell(ch)}</td>
        <td class="num">${esc(val(k, tgt))}</td>
        <td class="num">${esc(val(k, hs && hs.actualToDate ? hs.actualToDate[k] : null))}</td>
        <td class="num">${esc(val(k, fcv))}</td>
        <td class="num">${esc(signed(k, Number.isFinite(fcv) && Number.isFinite(tgt) ? fcv - tgt : null))}</td>
        <td class="num">${esc(val(k, hs && hs.reforecast ? hs.reforecast[k] : null))}</td>
        <td class="num">${esc(val(k, hs && hs.required ? hs.required[k] : null))}<span class="cell-sub">plan de esos días ${esc(val(k, hs && hs.planOpen ? hs.planOpen[k] : null))}</span></td>
        <td class="num">${esc(spct(press ? press.pressure : null))}</td>
        <td class="num">${h.surplus ? esc(F().currency(h.surplus, 0)) : F().DASH}</td>
        <td>${confPill(s.confidence.level)}</td></tr>`;
    }).join('');
    $('rf-channels').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Canal</th><th class="num">Meta</th><th class="num">Actual</th><th class="num">Forecast</th><th class="num">Gap forecast</th>
        <th class="num">Reforecast</th><th class="num">Recuperación requerida</th><th class="num">Presión</th><th class="num">Surplus</th><th>Confianza</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="field__hint">Periodo: ${esc(horizonName(rf.total.horizon))}. Cada canal calcula su pendiente por separado: el desempeño de uno no cambia el requerimiento de otro.
        ${['conversionRate', 'aov'].includes(k) ? 'Para CR y AOV, el requerido es el supuesto elegido; la presión compara contra el plan.' : ''}</p>`;
  }

  /* ---------- Gráfico ---------- */

  function renderChart(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const ch = state.rf.channel;
    const k = state.rf.metric;
    const days = S(rf, ch).days;
    let cut = -1;
    days.forEach((d, i) => { if (d.closed) cut = i; });
    const planC = FP.chart.cumulative(days.map((d) => d.plan), k);
    const actualC = FP.chart.cumulative(days.map((d) => (d.counted ? d.actual : null)), k, { to: cut });
    const fcC = FP.chart.cumulative(days.map((d) => d.forecast), k, { from: Math.max(0, cut) });
    const refC = FP.chart.cumulative(days.map((d) => d.reforecast), k, { from: Math.max(0, cut) });
    const items = [
      { values: planC, cls: 'chart-line--plan', swatch: 'legend__swatch--plan', label: 'Plan acumulado' },
      { values: fcC, cls: 'chart-line--forecast', swatch: 'legend__swatch--forecast', label: 'Forecast' },
      { values: refC, cls: 'chart-line--reforecast', swatch: 'legend__swatch--reforecast', label: 'Reforecast requerido' },
      { values: actualC, cls: 'chart-line--actual', swatch: 'legend__swatch--actual', label: 'Actual acumulado' }
    ];
    const svg = FP.chart.lineChart({ dates: days.map((d) => d.date), series: items, metric: k, cutIndex: cut, cutLabel: `corte ${rf.cutoff}`,
      ariaLabel: `Plan, actual, forecast y reforecast acumulados de ${chLabel(ch)}` });
    $('rf-chart').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Trayectoria acumulada · ${esc(chLabel(ch))} · ${esc(C().metrics[k].label)}</h3>
        <div class="field"><label for="rf-ch" class="visually-hidden">Canal</label>
          <select id="rf-ch" data-action="rf-channel">${['total', ...C().channelIds].map((c) => `<option value="${c}" ${c === ch ? 'selected' : ''}>${esc(chLabel(c))}</option>`).join('')}</select></div></div>
      ${FP.chart.legend([items[0], items[3], items[1], items[2]], k)}
      ${svg || '<div class="empty"><strong>Sin datos para graficar</strong></div>'}
      <p class="field__hint">Desde el corte, el forecast suma lo esperado y el reforecast lo requerido. Canal según este selector (también aplica a drivers y tablas por día).</p>`;
  }

  /* ---------- Periodos ---------- */

  function periodRow(k, p, label) {
    const esc = H().esc;
    const pr = p.pressure ? p.pressure[k] : null;
    return `<tr><td>${label}</td><td>${esc(PERIOD[p.status] || '—')}${p.openDays ? `<span class="cell-sub">${p.openDays} días con requerimiento</span>` : ''}</td>
      <td class="num">${esc(val(k, p.plan && p.plan[k]))}</td>
      <td class="num">${p.status === 'future' ? F().DASH : esc(val(k, p.actualToDate && p.actualToDate[k]))}</td>
      <td class="num">${esc(val(k, p.forecast && p.forecast[k]))}</td>
      <td class="num">${esc(val(k, p.reforecast && p.reforecast[k]))}${p.status === 'closed' ? '<span class="cell-sub">= actual</span>' : !p.openDays && p.status === 'future' ? '<span class="cell-sub">= plan</span>' : ''}${p.reforecastMissingDays ? `<span class="cell-sub">${p.reforecastMissingDays} días sin real</span>` : ''}</td>
      <td class="num">${k === 'revenue' ? esc(signed('revenue', p.recoveryGap)) : esc(signed(k, pr ? pr.delta : null))}</td>
      <td class="num">${esc(spct(pr ? pr.pressure : null))}</td></tr>`;
  }

  function renderPeriods(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const r = state.rf;
    const k = r.metric;
    const s = S(rf, r.tableChannel);
    const monthKeys = s.months.map((m) => m.key);
    if (!monthKeys.includes(r.month)) r.month = rf.cutoff && monthKeys.includes(rf.cutoff.slice(0, 7)) ? rf.cutoff.slice(0, 7) : monthKeys[0];
    const controls = `<div class="filters">
      <div class="field"><span class="field__hint">Nivel</span>${H().segmented('rf-period', [['months', 'Meses'], ['weeks', 'Semanas'], ['days', 'Días']], r.period)}</div>
      <div class="field"><label for="rf-tch" class="field__hint">Canal</label>
        <select id="rf-tch" data-action="rf-table-channel">${['total', ...C().channelIds].map((c) => `<option value="${c}" ${c === r.tableChannel ? 'selected' : ''}>${esc(chLabel(c))}</option>`).join('')}</select></div>
      ${r.period !== 'months' ? `<div class="field"><label for="rf-month" class="field__hint">Mes</label>
        <select id="rf-month" data-action="rf-month">${monthKeys.map((m, i) => `<option value="${m}" ${m === r.month ? 'selected' : ''}>${MONTHS[i]} ${rf.year}</option>`).join('')}</select></div>` : ''}
    </div>`;
    const head = (first) => `<thead><tr><th>${first}</th><th>Periodo</th><th class="num">Plan</th><th class="num">Actual</th><th class="num">Forecast</th>
      <th class="num">Reforecast</th><th class="num">${k === 'revenue' ? 'Gap a recuperar' : 'Delta requerido'}</th><th class="num">Presión</th></tr></thead>`;
    let table;
    if (r.period === 'months') {
      table = `<table class="table">${head('Mes')}<tbody>${s.months.map((m, i) => periodRow(k, m, MONTHS[i])).join('')}
        <tr class="row-total">${periodRow(k, s.annual, `<strong>Año ${rf.year}</strong>`).replace(/^<tr>|<\/tr>$/g, '')}</tr></tbody></table>`;
    } else if (r.period === 'weeks') {
      const weeks = s.weeks.filter((w) => w.firstDate.slice(0, 7) === r.month || w.lastDate.slice(0, 7) === r.month);
      table = `<table class="table">${head('Semana ISO')}<tbody>${weeks.map((w) => periodRow(k, w,
        `${esc(w.key)}<span class="cell-sub">${esc(w.weekStart)} a ${esc(w.weekEnd)}</span>`)).join('')}</tbody></table>`;
    } else {
      table = `<table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Plan original</th><th class="num">Actual</th><th class="num">Forecast</th>
        <th class="num">Reforecast</th><th class="num">Delta vs plan</th><th class="num">Presión</th><th class="num">Peso normalizado</th></tr></thead><tbody>
        ${s.days.filter((d) => d.month === r.month).map((d) => {
          const dl = d.delta ? d.delta[k] : null;
          return `<tr class="${d.temporal === 'today' ? 'row-today' : ''}">
            <td class="num">${esc(d.date)}${d.tag ? `<span class="cell-sub">${esc([d.tag.event, d.tag.holiday].filter(Boolean).join(', '))}</span>` : ''}</td>
            <td>${esc(KIND[d.kind] || '—')}</td>
            <td class="num">${esc(val(k, d.plan && d.plan[k]))}</td>
            <td class="num">${d.actual ? esc(val(k, d.actual[k])) : d.partialActual ? `${esc(val(k, d.partialActual[k]))}<span class="cell-sub">parcial, no descuenta</span>` : F().DASH}</td>
            <td class="num">${esc(val(k, d.forecast && d.forecast[k]))}</td>
            <td class="num">${esc(val(k, d.reforecast && d.reforecast[k]))}</td>
            <td class="num">${dl ? esc(signed(k, dl.delta)) : F().DASH}</td>
            <td class="num">${dl ? esc(spct(dl.pressure)) : F().DASH}</td>
            <td class="num">${d.normalizedWeight !== null && d.normalizedWeight !== undefined ? esc(F().percent(d.normalizedWeight, 3)) : F().DASH}</td></tr>`;
        }).join('')}</tbody></table>`;
    }
    $('rf-periods').innerHTML = `${controls}<div class="table-wrap${r.period === 'months' ? '' : ' table-wrap--tall'}">${table}</div>
      <p class="field__hint">${r.period === 'days'
        ? 'Días congelados: su reforecast es el real y nunca cambia. Días futuros: pendiente × peso normalizado (venta del plan original del día ÷ suma de los días futuros del horizonte).'
        : 'Mes cerrado: reforecast = actual. Mes en curso: actual + requerido restante. Meses futuros: requerido (horizonte año) o plan original (horizonte mes).'}</p>`;
  }

  /* ---------- Drivers ---------- */

  function renderDrivers(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const ch = state.rf.channel;
    const d = S(rf, ch).drivers;
    if (!d) { $('rf-drivers').innerHTML = '<p class="note">No hay días futuros en el horizonte: no hay requerimiento que descomponer.</p>'; return; }
    const c = d.chain;
    const src = rf.settings.assumptionSources[d.assumptionSource];
    const sc = Object.entries(d.scenarios).map(([id, x]) => `<tr><td><strong>${id} · ${esc(x.label)}</strong><span class="cell-sub">Se mantiene: ${esc(x.holds)}</span></td>
      <td class="num">${esc(val(x.kind, x.required))}</td><td class="num">${esc(val(x.kind, x.base))}</td>
      <td class="num">${esc(signed(x.kind, x.delta))}<span class="cell-sub">${esc(spct(x.deltaPct))}</span></td></tr>`).join('');
    const hist = d.historical;
    const real = [
      ['conversionRate', d.scenarios.B.required, c.conversionRate, hist ? hist.conversionRate : null],
      ['aov', d.scenarios.C.required, c.aov, hist ? hist.aov : null],
      ['trafficVolume', d.scenarios.A.required, c.trafficVolume, hist ? hist.trafficPerYear : null]
    ].map(([k, req, chainV, h]) => `<tr><td>${esc(C().metrics[k].label)}</td>
      <td class="num">${esc(val(k, req))}<span class="cell-sub">escenario ${k === 'conversionRate' ? 'B' : k === 'aov' ? 'C' : 'A'}</span></td>
      <td class="num">${esc(val(k, h))}</td>
      <td class="num">${esc(signed(k, Number.isFinite(req) && Number.isFinite(h) ? req - h : null))}</td>
      <td class="num">${esc(val(k, d.forecast ? d.forecast[k] : null))}</td>
      <td class="num">${esc(val(k, d.plan ? d.plan[k] : null))}</td></tr>`).join('');
    const sens = d.sensitivity;
    $('rf-drivers').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Requerimiento por driver · ${esc(chLabel(ch))}</h3>
        <span class="field__hint">${d.days} días futuros, ${esc(d.from)} a ${esc(d.to)}</span></div>
      <ol class="driver-chain">
        <li><span>Venta requerida</span><strong class="num">${esc(val('revenue', c.revenue))}</strong></li>
        <li><span>÷ AOV (${esc(src)})</span><strong class="num">${esc(val('aov', c.aov))}</strong></li>
        <li><span>= Pedidos requeridos</span><strong class="num">${esc(val('orders', c.orders))}</strong></li>
        <li><span>÷ CR (${esc(src)})</span><strong class="num">${esc(val('conversionRate', c.conversionRate))}</strong></li>
        <li><span>= Volumen requerido</span><strong class="num">${esc(val('trafficVolume', c.trafficVolume))}</strong></li>
      </ol>
      <h4>Qué tendría que cambiar (vs forecast)</h4>
      <dl class="kpis kpis--3">
        <div><dt>Venta adicional sobre el forecast</dt><dd class="num">${esc(signed('revenue', sens.additionalRevenue))}</dd></div>
        <div><dt>Pedidos adicionales con AOV constante</dt><dd class="num">${esc(signed('orders', sens.additionalOrdersAtForecastAov))}</dd></div>
        <div><dt>Volumen adicional con CR y AOV constantes</dt><dd class="num">${esc(signed('trafficVolume', sens.additionalTrafficAtForecastCrAov))}</dd></div>
      </dl>
      <h4>Escenarios de driver (matemáticos)</h4>
      <div class="table-wrap"><table class="table"><thead><tr><th>Escenario</th><th class="num">Requerido</th><th class="num">Base (forecast)</th><th class="num">Delta</th></tr></thead>
        <tbody>${sc}</tbody></table></div>
      <h4>Control de realismo</h4>
      <div class="table-wrap"><table class="table"><thead><tr><th>Métrica</th><th class="num">Requerido</th><th class="num">Histórico mismo periodo</th>
        <th class="num">Delta vs histórico</th><th class="num">Forecast</th><th class="num">Plan</th></tr></thead><tbody>${real}</tbody></table></div>
      <p class="field__hint">${hist ? `Histórico: mismos días del calendario en ${esc(hist.years.join(', '))} (${F().percent(hist.coverage, 0)} de cobertura); volumen = promedio por año.` : 'Sin histórico de los mismos días para comparar.'}
        Cada escenario mueve un solo driver y deja los otros dos en lo esperado. No se elige ni se recomienda ninguno y no son probabilidades.</p>`;
  }

  /* ---------- Confianza, validación y versiones ---------- */

  function renderAudit(state) {
    const esc = H().esc;
    const rf = state.rf.run;
    const ch = state.rf.channel === 'total' ? 'ecommerce' : state.rf.channel;
    const conf = rf.channels[ch].confidence;
    const w = rf.channels[ch].horizon;
    $('rf-audit').innerHTML = `
      <div class="grid-2 grid-2--tight">
        <section><h4>Confianza · ${esc(chLabel(ch))}</h4>
          <ul class="alert-list">${conf.components.map((c) => `<li>${confPill(c.level)} <span><strong>${esc(c.label)}.</strong> ${esc(c.note)}</span></li>`).join('')}</ul>
          <p class="field__hint">${esc(conf.note)} Pesos: ${w.weightMethod === 'uniform_future_distribution' ? 'reparto uniforme (sin pesos)' : 'pesos futuros del plan original'}.</p></section>
        <section><h4>Validaciones</h4>
          <ul class="alert-list">${rf.validation.checks.map((v) => `<li>${v.applicable === false ? H().pill('na', 'No aplica') : H().pill(v.pass ? 'ok' : 'error', v.pass ? 'Cierra' : 'No cierra')}
            <span>${esc(v.label)}${Number.isFinite(v.expected) ? ` <span class="cell-sub">${esc(F().currency(v.expected, 2))}${v.actual !== v.expected ? ` vs ${esc(F().currency(v.actual, 2))}` : ''}</span>` : ''}${v.note ? `<span class="cell-sub">${esc(v.note)}</span>` : ''}</span></li>`).join('')}</ul></section>
      </div>`;

    const reg = state.rf.registry;
    const evo = FP.reforecastVersioning.evolution(reg);
    const chg = FP.reforecastVersioning.reforecastChange(reg, rf);
    $('rf-versions').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Evolución del reforecast</h3>
        <div class="btn-row">
          <button type="button" class="btn btn--primary" data-action="rf-snapshot">Guardar reforecast como rf_v${reg.versions.length + 1}${rf.simulated ? ' (simulado)' : ''}</button>
          <button type="button" class="btn" data-action="rf-export">Exportar reforecast_export.json</button>
        </div></div>
      <dl class="kpis kpis--3">
        <div><dt>Requerido actual</dt><dd class="num">${esc(F().currency(rf.total.horizon.requiredTotal, 0))}</dd><small>${esc(horizonName(rf.total.horizon))}, sin guardar</small></div>
        <div><dt>Versión anterior</dt><dd class="num">${chg ? esc(F().currency(chg.required.previous, 0)) : F().DASH}</dd>
          <small>${chg ? `${esc(chg.previous.version)} al ${esc(chg.previous.referenceDate)}${chg.sameHorizon ? '' : ', otro horizonte'}` : 'Aún no hay versiones'}</small></div>
        <div><dt>Reforecast change</dt><dd class="num">${chg ? esc(signed('revenue', chg.required.change)) : F().DASH}</dd><small>${chg ? esc(F().signedPercent(chg.required.changePct, 2)) : 'Guarda una versión para comparar'}</small></div>
      </dl>
      ${evo.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Versión</th><th class="num">Referencia</th><th>Horizonte</th><th class="num">Forecast</th>
        <th class="num">Reforecast</th><th class="num">Gap forecast</th><th class="num">Requerido</th><th class="num">Presión</th><th class="num">Cambio del requerido</th></tr></thead>
        <tbody>${evo.slice().reverse().map((e) => `<tr><td><strong>${esc(e.version)}</strong>${e.simulated ? ' <span class="chip">simulado</span>' : ''}</td>
          <td class="num">${esc(e.referenceDate)}</td><td>${esc(rf.settings.horizons[e.horizon] || e.horizon)}</td>
          <td class="num">${esc(F().currency(e.forecast, 0))}</td><td class="num">${esc(F().currency(e.reforecast, 0))}</td>
          <td class="num">${esc(signed('revenue', e.forecastGap))}</td><td class="num">${esc(F().currency(e.required, 0))}</td>
          <td class="num">${esc(spct(e.pressure))}</td>
          <td class="num">${e.change ? `${esc(signed('revenue', e.change.required))}<span class="cell-sub">${esc(F().signedPercent(e.change.requiredPct, 1))}${e.change.sameHorizon ? '' : ', otro horizonte'}</span>` : F().DASH}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="note">Sin versiones guardadas. Cada versión registra fecha de referencia, horizonte, plan, forecast, método, supuestos y resultados, y no se sobrescribe.</p>'}
      <p class="field__hint">Muestra cómo cambió el requerimiento entre versiones; no interpreta la causa.</p>`;
  }

  function renderEmpty(reason) {
    ['rf-summary', 'rf-recovery', 'rf-channels', 'rf-chart', 'rf-periods', 'rf-drivers', 'rf-audit', 'rf-versions'].forEach((id) => { $(id).innerHTML = ''; });
    $('rf-summary').innerHTML = `<div class="empty"><strong>No hay reforecast todavía</strong>${H().esc(reason)}</div>`;
  }

  function render(state) {
    renderControls(state);
    const rf = state.rf.run;
    if (!rf || rf.plan.source === 'none') { renderEmpty('Se necesita un plan del año: guarda el plan distribuido en Plan o importa un Plan / Meta en Carga de datos.'); return; }
    renderSummary(state);
    renderChannels(state);
    renderChart(state);
    renderPeriods(state);
    renderDrivers(state);
    renderAudit(state);
  }

  FP.reforecastView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
