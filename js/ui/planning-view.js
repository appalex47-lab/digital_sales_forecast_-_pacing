/**
 * planning-view.js — Vista "Plan" (Fase 2).
 * Pinta el plan activo (vista previa o versión guardada). No calcula distribución.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const conf = (l) => FP.seasonalityView.confPill(l);

  const SOURCE_LABEL = {
    explicit_plan: 'Plan cargado', user_target: 'Meta del usuario', historical_average: 'Promedio histórico',
    historical_seasonality: 'Estacionalidad histórica', calculated: 'Calculado', user_assumption: 'Supuesto del usuario',
    fallback: 'Distribución estándar', insufficient_data: 'Datos insuficientes'
  };
  const srcLabel = (s) => SOURCE_LABEL[s] || s || '—';
  const money = (v) => (v === null || v === undefined ? '—' : F().currency(v, 2));
  const moneyC = (v) => (v === null || v === undefined ? '—' : F().currencyCompact(v));
  const int = (v) => (v === null || v === undefined ? '—' : F().integer(v));
  const diffCell = (target, plan) => {
    if (target === null || target === undefined || plan === null || plan === undefined) return '<td class="num">—</td>';
    const d = Math.round((plan - target) * 100) / 100;
    return `<td class="num ${d === 0 ? '' : 'neg'}">${d === 0 ? '$0.00' : money(d)}</td>`;
  };

  function metricCells(v) {
    return `<td class="num">${int(v.orders)}</td><td class="num">${int(v.trafficVolume)}</td>
      <td class="num">${F().metric('conversionRate', v.conversionRate)}</td><td class="num">${F().metric('aov', v.aov)}</td>`;
  }

  function targetsPanel(state) {
    const esc = H().esc;
    const t = state.targets;
    const rows = C().channels.map((c) => {
      const v = t.byChannel[c.id].revenue;
      return `<tr><td><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span></td>
        <td class="num">${v === null ? 'Sin meta' : money(v)}</td><td>${v === null ? '—' : 'Meta del usuario (Original Target)'}</td></tr>`;
    }).join('');
    const hasAny = C().channelIds.some((id) => t.byChannel[id].revenue !== null);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Canal</th><th class="num">Meta anual ${state.year}</th><th>Origen</th></tr></thead>
      <tbody>${rows}<tr class="row-total"><td><strong>Total digital</strong></td><td class="num">${t.annual.revenue === null ? 'Sin meta' : money(t.annual.revenue)}</td><td>${t.annual.revenue === null ? '—' : 'Meta del usuario'}</td></tr></tbody></table></div>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="plan-preview" ${hasAny ? '' : 'disabled'}>Generar vista previa</button>
        ${hasAny ? '' : '<button type="button" class="btn" data-action="sample-targets">Usar metas de ejemplo</button>'}
        <a class="btn" href="#resumen">Editar metas en Resumen</a>
      </div>
      <p class="field__hint">La meta nunca se modifica: el plan la reparte exacta al centavo. Método y parámetros en Configuración de planeación.</p>`;
  }

  function versionPicker(state) {
    const esc = H().esc;
    const ps = state.planning;
    const opts = [];
    if (ps.preview) opts.push(['preview', 'Vista previa (sin guardar)']);
    (ps.registry ? ps.registry.versions : []).forEach((v) => opts.push([v.id, `${v.label}${v.locked ? ' (congelado)' : ''} · ${v.savedAt.slice(0, 16).replace('T', ' ')}`]));
    if (!opts.length) return '';
    return `<div class="field"><label for="plan-version" class="field__hint">Plan mostrado</label>
      <select id="plan-version" data-action="plan-version">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === ps.selected ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  }

  function header(state, plan) {
    const esc = H().esc;
    const a = plan.audit;
    const hp = a.historicalPeriod;
    const isPreview = plan.status === 'preview';
    const hasOriginal = state.planning.registry && state.planning.registry.originalPlanId;
    return `<div class="banner banner--${isPreview ? 'warning' : 'ok'}">
      <p class="banner__title">${isPreview ? 'Vista previa sin guardar' : esc(plan.versionLabel)}</p>
      <dl class="audit-grid">
        <div><dt>Meta anual total</dt><dd class="num">${plan.targets.total ? money(plan.targets.total.value) : 'Sin meta total (Σ metas de canal)'}</dd></div>
        <div><dt>Método</dt><dd>${esc(a.distributionMethod.id)} · ${esc(a.distributionMethod.label)}</dd></div>
        <div><dt>Histórico utilizado</dt><dd>${hp.firstDate ? `${esc(hp.firstDate)} a ${esc(hp.lastDate)}` : 'Sin histórico'}${hp.completeYears.length ? ` · años completos ${esc(hp.completeYears.join(', '))}` : ''}</dd></div>
        <div><dt>Confianza</dt><dd>${conf(a.confidence)}</dd></div>
        <div><dt>Generado</dt><dd class="num">${esc(a.generatedAt.slice(0, 16).replace('T', ' '))} · ${esc(a.algorithmVersion)}</dd></div>
      </dl>
      ${isPreview ? `<div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="plan-save">${hasOriginal ? 'Guardar como revisión' : 'Guardar como plan distribuido original'}</button>
        <button type="button" class="btn" data-action="plan-discard">Descartar vista previa</button></div>
        <p class="field__hint">${hasOriginal ? 'Ya existe un plan distribuido original: esta vista previa se guardará como revisión y el original no cambia.' : 'El primer plan guardado se congela como plan distribuido original y no se podrá sobrescribir.'}</p>`
        : `<p class="field__hint">${plan.versionId === (state.planning.registry || {}).originalPlanId ? 'Congelado: es la línea base para el futuro reforecast.' : 'Revisión guardada. El plan original no cambia.'}</p>`}
    </div>`;
  }

  function closureTable(plan) {
    const esc = H().esc;
    const STATUS = { closed: ['ok', '✓ Cerrado'], not_closed: ['error', 'No cerrado'], no_target: ['na', 'Sin meta'] };
    const rows = C().channels.map((c) => {
      const ch = plan.channels[c.id];
      const [cls, txt] = STATUS[plan.validation.byChannel[c.id]];
      return `<tr><td><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span></td>
        <td class="num">${money(ch.annualTarget.value)}</td><td class="num">${ch.annualTarget.value === null ? '—' : money(ch.annual.revenue)}</td>
        ${diffCell(ch.annualTarget.value, ch.annualTarget.value === null ? null : ch.annual.revenue)}<td>${H().pill(cls, txt)}</td></tr>`;
    }).join('');
    const tot = plan.validation.checks.find((k) => k.id === 'digital_total');
    const totOk = tot && tot.pass;
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Canal</th><th class="num">Meta anual</th><th class="num">Plan generado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead>
      <tbody>${rows}
        <tr class="row-total"><td><strong>Total digital</strong></td><td class="num">${money(tot ? tot.expected : null)}</td><td class="num">${money(tot ? tot.actual : null)}</td>
        ${diffCell(tot ? tot.expected : null, tot ? tot.actual : null)}<td>${H().pill(totOk ? 'ok' : tot && tot.severity === 'warning' ? 'warning' : 'error', totOk ? '✓ Cerrado' : 'No cerrado')}</td></tr>
      </tbody></table></div>
      ${tot && tot.note ? `<p class="note note--warning">${esc(tot.note)}</p>` : ''}`;
  }

  /** Canal elegido o total digital: meses con meta y plan sumados. */
  function monthsFor(plan, ch) {
    if (ch !== 'total') return plan.channels[ch].months;
    return Array.from({ length: 12 }, (_, i) => {
      const ms = C().channelIds.map((c) => plan.channels[c].months[i]);
      const withT = ms.filter((m) => m.target !== null);
      return { month: i + 1, key: ms[0].key, target: withT.length ? FP.distribution.exactSum(withT.map((m) => m.target)) : null,
        plan: FP.planning.aggregate(ms.map((m) => m.plan)), source: null, confidence: null };
    });
  }

  function daysFor(plan, ch, month) {
    if (ch !== 'total') return plan.channels[ch].days.filter((r) => r.month === month);
    const list = plan.channels[C().channelIds[0]].days.filter((r) => r.month === month);
    return list.map((r0) => {
      const rs = C().channelIds.map((c) => plan.channels[c].days.find((r) => r.date === r0.date));
      return { date: r0.date, month, values: FP.planning.aggregate(rs.map((r) => r.values)), cells: null, tag: null };
    });
  }

  function mainTable(state, plan) {
    const esc = H().esc;
    const f = state.planning.filters;
    const ch = f.channel;
    const annualT = ch === 'total' ? (plan.targets.total ? plan.targets.total.value : null) : plan.channels[ch].annualTarget.value;
    const months = monthsFor(plan, ch);

    if (f.month === 'all') {
      const rows = months.map((m) => `<tr>
        <td>${esc(C().calendar.monthNamesEs[m.month - 1])}</td>
        <td class="num">${money(m.target)}</td><td class="num">${money(m.plan.revenue)}</td>${diffCell(m.target, m.plan.revenue)}
        <td class="num">${F().percent(FP.metrics.safeDivide(m.target, annualT), 2)}</td>
        ${metricCells(m.plan)}
        <td>${m.source ? esc(srcLabel(m.source)) : '<span class="cell-sub">Σ canales</span>'}</td><td>${m.source ? conf(m.confidence) : ''}</td></tr>`).join('');
      return `<div class="table-wrap"><table class="table">
        <thead><tr><th>Mes</th><th class="num">Meta</th><th class="num">Plan</th><th class="num">Diferencia</th><th class="num">% distribución</th>
          <th class="num">Pedidos</th><th class="num">Volumen</th><th class="num">CR</th><th class="num">AOV</th><th>Origen de la meta</th><th>Confianza</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    const month = Number(f.month);
    const m = months[month - 1];
    let days = daysFor(plan, ch, month);
    const weeks = weeksOfMonth(days);
    if (f.week !== 'all') days = days.filter((r) => FP.calendar.getWeekInfo(r.date).weekKey === f.week);
    const weekRows = weeks.map((w) => `<tr><td>${esc(w.weekKey.slice(5))}</td><td class="num">${esc(w.start.slice(5))} a ${esc(w.end.slice(5))}${w.partial ? '<span class="cell-sub">semana parcial en este mes</span>' : ''}</td>
      <td class="num">${money(w.plan.revenue)}</td><td class="num">${F().percent(FP.metrics.safeDivide(w.plan.revenue, m.target), 2)}</td>${metricCells(w.plan)}</tr>`).join('');
    const dayRows = days.map((r) => {
      const cd = FP.calendar.getCalendarDay(r.date);
      const c = r.cells;
      const tag = r.tag ? [r.tag.event, r.tag.holiday, r.tag.season].filter(Boolean).join(', ') : '';
      return `<tr><td class="num">${esc(r.date)}</td><td>${esc(cd.dayOfWeekLabel)}${tag ? `<span class="cell-sub">${esc(tag)}</span>` : ''}</td>
        <td class="num">${money(r.values.revenue)}</td><td class="num">${F().percent(FP.metrics.safeDivide(r.values.revenue, m.plan.revenue), 2)}</td>
        ${metricCells(r.values)}
        <td>${c ? esc(srcLabel(c.revenue.source)) + (c.orders.status === 'insufficient_data' ? '<span class="cell-sub">pedidos y volumen: datos insuficientes</span>' : c.orders.status === 'calculated_with_assumption' ? '<span class="cell-sub">pedidos con supuesto</span>' : '') : '<span class="cell-sub">Σ canales</span>'}</td>
        <td>${c ? conf(c.revenue.confidence) : ''}</td></tr>`;
    }).join('');
    return `<dl class="kpis kpis--4">
        <div><dt>Meta del mes</dt><dd class="num">${money(m.target)}</dd></div>
        <div><dt>Plan (Σ días)</dt><dd class="num">${money(m.plan.revenue)}</dd></div>
        <div><dt>Diferencia</dt><dd class="num">${m.target === null ? '—' : money(Math.round((m.plan.revenue - m.target) * 100) / 100)}</dd></div>
        <div><dt>% del año</dt><dd class="num">${F().percent(FP.metrics.safeDivide(m.target, annualT), 2)}</dd></div>
      </dl>
      <h3 class="h4">Semanas (ISO, lunes a domingo)</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Semana</th><th class="num">Días en el mes</th><th class="num">Plan</th><th class="num">% del mes</th>
        <th class="num">Pedidos</th><th class="num">Volumen</th><th class="num">CR</th><th class="num">AOV</th></tr></thead><tbody>${weekRows}</tbody></table></div>
      <h3 class="h4">Días${f.week !== 'all' ? ` de la semana ${esc(f.week.slice(5))}` : ''}</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Día</th><th class="num">Plan</th><th class="num">% del mes</th>
        <th class="num">Pedidos</th><th class="num">Volumen</th><th class="num">CR</th><th class="num">AOV</th><th>Origen</th><th>Confianza</th></tr></thead><tbody>${dayRows}</tbody></table></div>`;
  }

  /** Semanas ISO dentro de un mes (porción del mes). */
  function weeksOfMonth(days) {
    const map = new Map();
    days.forEach((r) => {
      const cd = FP.calendar.getCalendarDay(r.date);
      if (!map.has(cd.weekKey)) map.set(cd.weekKey, { weekKey: cd.weekKey, start: r.date, end: r.date, weekStart: cd.weekStart, weekEnd: cd.weekEnd, vals: [] });
      const w = map.get(cd.weekKey);
      w.end = r.date; w.vals.push(r.values);
    });
    return [...map.values()].map((w) => ({ ...w, partial: w.start !== w.weekStart || w.end !== w.weekEnd, plan: FP.planning.aggregate(w.vals) }));
  }

  function filters(state, plan) {
    const esc = H().esc;
    const f = state.planning.filters;
    const weeks = f.month === 'all' ? [] : weeksOfMonth(daysFor(plan, f.channel, Number(f.month)));
    return `<div class="filters">
      <div class="field"><label for="pf-channel" class="field__hint">Canal</label>
        <select id="pf-channel" data-action="plan-filter" data-key="channel">
          ${C().channels.map((c) => `<option value="${c.id}" ${c.id === f.channel ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          <option value="total" ${f.channel === 'total' ? 'selected' : ''}>Total digital</option></select></div>
      <div class="field"><label for="pf-month" class="field__hint">Mes</label>
        <select id="pf-month" data-action="plan-filter" data-key="month"><option value="all">Todos (vista mensual)</option>
          ${C().calendar.monthNamesEs.map((n, i) => `<option value="${i + 1}" ${String(i + 1) === String(f.month) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-week" class="field__hint">Semana</label>
        <select id="pf-week" data-action="plan-filter" data-key="week" ${f.month === 'all' ? 'disabled' : ''}><option value="all">Todas</option>
          ${weeks.map((w) => `<option value="${w.weekKey}" ${w.weekKey === f.week ? 'selected' : ''}>${esc(w.weekKey.slice(5))} (${esc(w.start.slice(5))} a ${esc(w.end.slice(5))})</option>`).join('')}</select></div>
      <div class="field"><span class="field__hint">Exportar</span>
        <button type="button" class="btn" data-action="plan-export">planning_export.json</button></div>
    </div>`;
  }

  function validationPanel(plan) {
    const esc = H().esc;
    const failed = plan.validation.checks.filter((k) => !k.pass);
    const passed = plan.validation.checks.length - failed.length;
    const issues = C().channelIds.flatMap((ch) => plan.channels[ch].issues.map((i) => ({ ...i, ch })));
    return `<p>${H().pill(plan.validation.closed ? 'ok' : 'error', plan.validation.closed ? 'Plan cerrado' : 'Plan no cerrado')}
      ${passed} de ${plan.validation.checks.length} validaciones correctas${failed.length ? `; ${failed.length} con observaciones` : ''}.</p>
      ${issues.length ? `<ul class="issues issues--block">${issues.map((i) => `<li>${H().pill(i.severity, FP.dataModel.getChannel(i.ch).label)} <span>${esc(i.message)}</span></li>`).join('')}</ul>` : ''}
      ${failed.length ? `<div class="table-wrap table-wrap--tall"><table class="table"><thead><tr><th>Validación</th><th class="num">Esperado</th><th class="num">Obtenido</th><th class="num">Diferencia</th><th>Severidad</th></tr></thead>
        <tbody>${failed.map((k) => `<tr><td class="wrap">${esc(k.label)}${k.note ? `<span class="cell-sub">${esc(k.note)}</span>` : ''}</td><td class="num">${k.expected === null ? '—' : esc(F().decimal(k.expected, 2))}</td>
        <td class="num">${k.actual === null ? '—' : esc(F().decimal(k.actual, 2))}</td><td class="num">${k.diff === null ? '—' : esc(F().decimal(k.diff, 2))}</td>
        <td>${H().pill(k.severity, k.severity === 'error' ? 'Error' : 'Advertencia')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="field__hint">Revisa: Σ meses = meta anual, Σ días = meta mensual, Σ canal = meta del canal, Σ canales = meta digital (exacto al centavo), pedidos ≈ venta ÷ AOV y volumen ≈ pedidos ÷ CR (tolerancia de negocio), e identidades diarias (tolerancia técnica).</p>`;
  }

  function assumptionsPanel(state, plan) {
    const esc = H().esc;
    const ch = state.planning.filters.channel === 'total' ? 'ecommerce' : state.planning.filters.channel;
    const rows = plan.channels[ch].months.map((m) => {
      const a = m.assumptions || {};
      const c = (x, k) => (x && x.value !== null ? `${F().metric(k, x.value)}<span class="cell-sub">${esc(srcLabel(x.source))}</span>` : `<span class="val val--missing">Datos insuficientes</span>`);
      return `<tr><td>${esc(C().calendar.monthNamesEs[m.month - 1])}</td><td class="num">${c(a.aov, 'aov')}</td><td class="num">${c(a.conversionRate, 'conversionRate')}</td></tr>`;
    }).join('');
    return `<h3 class="h4">Supuestos de ${esc(FP.dataModel.getChannel(ch).label)}</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Mes</th><th class="num">AOV supuesto</th><th class="num">CR supuesto</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="field__hint">Pedidos = venta ÷ AOV; volumen = pedidos ÷ CR. Prioridad: histórico del mes → promedio histórico del canal → supuesto del usuario. Sin ninguno, pedidos y volumen quedan como datos insuficientes (nunca 0).</p>`;
  }

  function render(state) {
    $('plan-targets').innerHTML = targetsPanel(state) + versionPicker(state);
    const plan = state.planning.current;
    const box = $('plan-body');
    if (!plan) {
      box.innerHTML = `<div class="empty"><strong>Todavía no hay plan para ${state.year}</strong>Captura metas por canal y presiona "Generar vista previa". Nada se guarda sin tu confirmación.</div>`;
      return;
    }
    box.innerHTML = `${header(state, plan)}
      <h3 class="h4">Cierre de metas</h3>${closureTable(plan)}
      <h3 class="h4">Plan distribuido</h3>${filters(state, plan)}${mainTable(state, plan)}
      <details class="disclosure"><summary>Validaciones automáticas</summary>${validationPanel(plan)}</details>
      <details class="disclosure"><summary>Supuestos de CR y AOV</summary>${assumptionsPanel(state, plan)}</details>`;
  }

  FP.planningView = { render, SOURCE_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
