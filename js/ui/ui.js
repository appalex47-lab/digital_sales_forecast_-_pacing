/**
 * ui.js — Render de la interfaz. Solo lee estado y pinta HTML.
 * No calcula métricas (usa FP.metrics / FP.dataModel) ni guarda datos (usa app.js).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const DM = () => FP.dataModel;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => F().escapeHtml(s);

  const pill = (status, text) =>
    `<span class="pill pill--${esc(status)}">${esc(text || F().STATUS_LABELS[status] || status)}</span>`;

  /* ---------- Header / estado ---------- */

  function renderAppMeta() {
    const a = C().app;
    document.querySelector('[data-bind="app-name"]').textContent = a.name;
    document.querySelector('[data-bind="app-subtitle"]').textContent = a.subtitle;
    document.querySelector('[data-bind="app-phase"]').textContent = a.phaseLabel;
    $('app-footer').textContent = `${a.name}, versión ${a.version}. Contrato de datos ${C().schemaVersion}. Cálculos determinísticos en el navegador; sin backend.`;
  }

  function renderStatus(state) {
    const t = state.targets;
    const annual = t && t.annual.revenue;
    const q = state.quality;
    const st = state.selfTest;
    const years = [...new Set([C().defaultYear - 1, C().defaultYear, C().defaultYear + 1, ...(state.availableYears || [])])].sort();

    // Fase 1: el estado de datos sale del resumen de calidad (FP.coverage)
    const QPILL = { ready: 'ok', warnings: 'warning', invalid: 'error', empty: 'na' };
    const dataStatus = q ? pill(QPILL[q.status], q.statusText) : pill('empty', 'Sin datos');
    const dataSub = q && q.status !== 'empty'
      ? `${q.totals.imported} registros de ${q.totals.files} archivo${q.totals.files === 1 ? '' : 's'}${q.totals.rejected ? `, ${q.totals.rejected} filas rechazadas` : ''}`
      : 'Carga archivos o genera datos de prueba';

    $('status-bar').innerHTML = `
      <div class="status-item"><dt><label for="year-select">Año seleccionado</label></dt>
        <dd><select id="year-select" data-action="set-year">${years.map((y) =>
          `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`).join('')}</select></dd></div>
      <div class="status-item"><dt>Meta anual</dt>
        <dd class="num">${annual ? esc(F().currencyCompact(annual)) : 'Sin definir'}
        <small>${annual ? esc(F().currency(annual)) : 'Captúrala en el panel Meta anual'}</small></dd></div>
      <div class="status-item"><dt>Canales configurados</dt>
        <dd>${C().channels.length}
          <span class="channel-dots">${C().channels.map((c) => `<span class="channel-dot" style="--dot:${c.color}" title="${esc(c.label)}"></span>`).join('')}</span>
          <small>${C().channels.map((c) => esc(c.label)).join(', ')}</small></dd></div>
      <div class="status-item"><dt>Estado de datos</dt>
        <dd>${dataStatus}<small>${esc(dataSub)}</small></dd></div>
      <div class="status-item"><dt>Estado del motor</dt>
        <dd>${st ? pill(st.ok ? 'ok' : 'error', st.ok ? 'Operativo' : 'Con fallas') : pill('na', 'Sin ejecutar')}
          <small>${st ? `${st.passed} de ${st.total} pruebas correctas` : ''}${state.storageKind ? `, guardado en ${state.storageKind === 'localStorage' ? 'este navegador' : 'memoria temporal'}` : ''}</small></dd></div>`;
  }

  function renderFacts(state) {
    const ds = state.dataset;
    const el = $('dataset-facts');
    if (!ds || !Object.keys(ds.records).length) {
      el.innerHTML = `<div><dt>Datos cargados</dt><dd>Ninguno</dd></div>`;
      return;
    }
    const recs = DM().allRecords(ds);
    const withActual = recs.filter((r) => r.actual.revenue !== null);
    const reg = state.registry;
    const versions = reg ? FP.forecast.listVersions(reg) : [];
    el.innerHTML = `
      <div><dt>Periodo</dt><dd>${esc(recs[0].date)} a ${esc(recs[recs.length - 1].date)}</dd></div>
      <div><dt>Registros día-canal</dt><dd class="num">${recs.length}</dd></div>
      <div><dt>Con venta real</dt><dd class="num">${withActual.length} (hasta ${esc(withActual.length ? withActual[withActual.length - 1].date : '—')})</dd></div>
      <div><dt>Versiones de plan</dt><dd>${versions.length ? versions.map((v) => `${esc(v.label)}${v.locked ? ' (bloqueado)' : ''}`).join(', ') : 'Ninguna'}</dd></div>
      <div><dt>Eventos e hitos</dt><dd>${(state.events || []).length} eventos, ${(state.milestones || []).length} hitos</dd></div>`;
  }

  /* ---------- Metas ---------- */

  function renderTargets(state) {
    const t = state.targets;
    const val = (v) => (v === null || v === undefined ? '' : String(v));
    const h = DM().validateTargets(t);
    let note = '';
    if (h.status === 'pass') note = `<p class="note note--ok">La suma de canales cuadra con la meta anual.</p>`;
    else if (h.status === 'warning') {
      note = `<p class="note note--warning">La suma de canales (${esc(F().currency(h.sum))}) difiere de la meta anual por ${esc(F().currency(h.diff))} (${esc(F().signedPercent(h.diffPct, 2))}).</p>`;
    } else note = `<p class="note">Captura la meta total y la de cada canal para validar la jerarquía.</p>`;

    $('targets-form').innerHTML = `
      <div class="field targets-form__total">
        <label for="t-annual">Meta anual total (${esc(C().currency)})</label>
        <input id="t-annual" name="annual" inputmode="decimal" autocomplete="off" value="${esc(val(t.annual.revenue))}" placeholder="Ej. 261M">
      </div>
      <div class="targets-form__channels">
        ${C().channels.map((c) => `
          <div class="field" style="--dot:${c.color}">
            <label for="t-${c.id}">${esc(c.label)}</label>
            <input id="t-${c.id}" name="${c.id}" inputmode="decimal" autocomplete="off" value="${esc(val(t.byChannel[c.id].revenue))}" placeholder="Sin definir">
            <span class="field__hint num">${t.byChannel[c.id].revenue ? esc(F().currencyCompact(t.byChannel[c.id].revenue)) + ', ' + esc(F().percent(FP.metrics.safeDivide(t.byChannel[c.id].revenue, t.annual.revenue), 1)) + ' del total' : ''}</span>
          </div>`).join('')}
      </div>
      ${note}
      <div class="btn-row">
        <button type="submit" class="btn btn--primary">Guardar metas</button>
        <button type="button" class="btn" data-action="sample-targets">Usar metas de ejemplo</button>
      </div>
      ${assistant(state)}`;
  }

  /** Asistente: propone metas desde la venta real de un año base. Solo llena el formulario. */
  function assistant(state) {
    const ta = state.ta || {};
    const years = state.store ? FP.targetAssistant.baseYears(state.store) : [];
    if (!years.length) return `<details class="disclosure targets-assist"><summary>Calcular metas desde el histórico</summary>
      <div class="panel__body"><p class="note">Carga venta real o histórico para proponer metas a partir de un año base.</p></div></details>`;
    const prev = years.find((y) => y.year === state.year - 1);
    const baseYear = years.some((y) => y.year === ta.baseYear) ? ta.baseYear : prev ? prev.year : (years.find((y) => y.coverage >= 0.95) || years[0]).year;
    ta.baseYear = baseYear;
    const base = FP.targetAssistant.yearActuals(state.store, baseYear);
    const num = (v) => { const x = FP.normalize.normalizeNumber(String(v ?? '').trim() === '' ? '' : String(v)).value; return x; };
    const mixIn = ta.mix || {};
    const mixProvided = C().channelIds.some((ch) => String(mixIn[ch] ?? '').trim() !== '');
    const mix = mixProvided ? Object.fromEntries(C().channelIds.map((ch) => [ch, (num(mixIn[ch]) ?? NaN) / 100])) : null;
    const growth = (num(ta.growth) ?? 0) / 100;
    const total = FP.format.parseAmountInput(String(ta.total || '')) || null;
    const sug = FP.targetAssistant.suggest({ store: state.store, baseYear, growth, total, mix });
    ta.last = sug.ok ? sug : null;
    return `<details class="disclosure targets-assist" ${ta.open ? 'open' : ''}><summary>Calcular metas desde el histórico</summary>
      <div class="panel__body">
        <p class="field__hint">Propone las metas de <strong>${state.year}</strong> a partir de la venta real de un año base. Solo llena el formulario: revisa y pulsa "Guardar metas". La meta sigue siendo decisión del negocio.</p>
        <div class="settings-grid">
          <div class="field"><label for="ta-year">Año base</label>
            <select id="ta-year" data-action="ta-setting" data-key="baseYear">${years.map((y) => `<option value="${y.year}" ${y.year === baseYear ? 'selected' : ''}>${y.year} · ${esc(F().percent(y.coverage, 0))} de días con datos</option>`).join('')}</select>
            <span class="field__hint">Venta real ${esc(F().currency(base.total, 0))}</span></div>
          <div class="field"><label for="ta-growth">Crecimiento vs año base (%)</label>
            <input id="ta-growth" inputmode="decimal" value="${esc(ta.growth ?? '')}" placeholder="Ej. 12" data-action="ta-setting" data-key="growth">
            <span class="field__hint">Se aplica al total.</span></div>
          <div class="field"><label for="ta-total">O meta total fija (opcional)</label>
            <input id="ta-total" inputmode="decimal" value="${esc(ta.total ?? '')}" placeholder="Ej. 290M" data-action="ta-setting" data-key="total">
            <span class="field__hint">Si la capturas, ignora el crecimiento.</span></div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Canal</th><th class="num">Venta ${baseYear}</th><th class="num">Mezcla (%)</th><th class="num">Meta propuesta</th><th class="num">vs ${baseYear}</th></tr></thead>
          <tbody>${C().channels.map((c) => { const b = base.byChannel[c.id]; const v = sug.ok ? sug.byChannel[c.id] : null;
            return `<tr><td><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span>${b.coverage < 0.95 ? `<span class="cell-sub">${esc(F().percent(b.coverage, 0))} de días</span>` : ''}</td>
              <td class="num">${esc(F().currency(b.revenue, 0))}</td>
              <td class="num"><input class="input--compact num" inputmode="decimal" value="${esc(mixIn[c.id] ?? '')}" placeholder="${esc(b.share === null ? '' : (b.share * 100).toFixed(1))}" data-action="ta-mix" data-channel="${c.id}" aria-label="Mezcla de ${esc(c.label)} en %"></td>
              <td class="num">${esc(F().currency(v, 0))}</td><td class="num">${esc(v !== null && b.revenue > 0 ? F().signedPercent(v / b.revenue - 1, 1) : F().DASH)}</td></tr>`; }).join('')}
            <tr class="row-total"><td><strong>Total</strong></td><td class="num">${esc(F().currency(base.total, 0))}</td>
              <td class="num">${mixProvided ? esc(F().percent(C().channelIds.reduce((a, ch) => a + ((num(mixIn[ch]) ?? 0) / 100), 0), 1)) : 'histórica'}</td>
              <td class="num">${esc(F().currency(sug.ok ? sug.total : null, 0))}</td><td class="num">${esc(sug.ok ? F().signedPercent(sug.total / base.total - 1, 1) : F().DASH)}</td></tr>
          </tbody></table></div>
        <p class="field__hint">La mezcla gris es la participación real de cada canal en ${baseYear}; se usa si dejas los cuatro vacíos. Si la cambias, captura los cuatro y que sumen 100 %.</p>
        ${sug.errors.map((e) => `<p class="note note--warning">${esc(e)}</p>`).join('')}${(sug.warnings || []).map((e) => `<p class="note note--warning">${esc(e)}</p>`).join('')}
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="ta-fill" ${sug.ok ? '' : 'disabled'}>Llenar el formulario con esta propuesta</button>
          <button type="button" class="btn btn--ghost" data-action="ta-reset">Limpiar</button></div>
      </div></details>`;
  }

  /* ---------- Filtros + tabla de validación ---------- */

  function segmented(action, options, current) {
    return `<div class="segmented" role="group">${options.map(([v, l]) =>
      `<button type="button" data-action="${action}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(l)}</button>`).join('')}</div>`;
  }

  function renderFilters(state) {
    const f = state.filters;
    const periods = state.dataset ? DM().availablePeriods(state.dataset, f.granularity) : [];
    $('filters').innerHTML = `
      <div class="field"><span class="field__hint">Dato</span>
        ${segmented('set-state', C().dataStates.map((s) => [s, C().dataStateLabels[s]]), f.state)}</div>
      <div class="field"><span class="field__hint">Granularidad</span>
        ${segmented('set-granularity', C().granularities.map((g) => [g, C().granularityLabels[g]]), f.granularity)}</div>
      <div class="field"><label for="period-select" class="field__hint">Periodo</label>
        <select id="period-select" data-action="set-period" ${periods.length ? '' : 'disabled'}>
          ${periods.length ? periods.map((p) => `<option value="${esc(p)}" ${p === f.periodKey ? 'selected' : ''}>${esc(FP.calendar.periodLabel(p, f.granularity))}</option>`).join('') : '<option>Sin periodos</option>'}
        </select></div>`;
  }

  const IDENTITY_CHECKS = [
    ['cr_identity', 'CR'],
    ['aov_identity', 'AOV'],
    ['revenue_identity', 'Venta']
  ];

  function identityChips(validation) {
    return `<span class="checks">${IDENTITY_CHECKS.map(([id, label]) => {
      const c = validation.checks.find((x) => x.id === id);
      const st = c ? c.status : 'na';
      return `<span class="check check--${st}" title="${esc(c ? c.label : '')}">${label} ${st === 'pass' ? '✓' : st === 'na' ? '–' : '!'}</span>`;
    }).join('')}</span>`;
  }

  function daysPill(counts) {
    if (counts.error) return pill('error', `${counts.error + counts.warning} con alertas`);
    if (counts.warning) return pill('warning', `${counts.warning} con alertas`);
    return pill('ok', 'Sin alertas');
  }

  function renderValidation(state) {
    const box = $('validation-table');
    const issuesBox = $('validation-issues');
    const f = state.filters;

    if (!state.dataset || !Object.keys(state.dataset.records).length) {
      box.innerHTML = `<div class="empty"><strong>No hay datos para validar</strong>Usa “Generar datos de prueba” para cargar septiembre 2026.</div>`;
      issuesBox.innerHTML = '';
      return;
    }

    const s = DM().summarize(state.dataset, { state: f.state, granularity: f.granularity, periodKey: f.periodKey });
    if (!s.total.days) {
      const msg = f.state === 'forecast'
        ? 'El forecast todavía no se calcula: el motor llega en una fase posterior. La estructura ya existe en cada registro.'
        : `No hay datos de ${C().dataStateLabels[f.state].toLowerCase()} en este periodo.`;
      box.innerHTML = `<div class="empty"><strong>${esc(C().dataStateLabels[f.state])} sin datos</strong>${esc(msg)}</div>`;
      issuesBox.innerHTML = '';
      return;
    }

    const cells = (v) => C().metricKeys.map((k) => `<td class="num">${esc(F().metric(k, v[k]))}</td>`).join('');
    const rows = C().channels.map((c) => {
      const b = s.byChannel[c.id];
      return `<tr>
        <td><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span><span class="cell-sub">Volumen = ${esc(c.trafficLabel.toLowerCase())}</span></td>
        ${cells(b.values)}
        <td class="num">${b.days}</td>
        <td>${identityChips(b.validation)}</td>
        <td>${daysPill(b.counts)}</td>
      </tr>`;
    }).join('');

    box.innerHTML = `<div class="table-wrap"><table class="table">
      <caption class="visually-hidden">Validación por canal, ${esc(C().dataStateLabels[f.state])}, ${esc(FP.calendar.periodLabel(f.periodKey, f.granularity))}</caption>
      <thead><tr>
        <th scope="col">Canal</th><th scope="col" class="num">Venta</th><th scope="col" class="num">Pedidos</th>
        <th scope="col" class="num">Volumen</th><th scope="col" class="num">CR</th><th scope="col" class="num">AOV</th>
        <th scope="col" class="num">Días</th><th scope="col">Identidades</th><th scope="col">Días con alertas</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td>Total</td>${cells(s.total.values)}<td class="num">${s.total.days}</td>
        <td>${identityChips(s.total.validation)}</td><td>${daysPill(s.total.counts)}</td>
      </tr></tfoot>
    </table></div>`;

    const list = s.total.recordIssues;
    issuesBox.innerHTML = list.length ? `
      <div class="panel__foot">
        <p style="margin-bottom: var(--sp-2)"><strong>Días con alertas en este periodo.</strong> Los valores cargados por el usuario se conservan; la alerta indica que no cuadran con los calculados.</p>
        <ul class="issues">${list.map((i) => `<li>
          <span class="num">${esc(i.date)}</span>
          <span>${esc(DM().getChannel(i.channel).label)}</span>
          ${pill(i.status)}
          <span>${i.issues.map((x) => esc(`${x.label}: ${String(x.message).replace(/\.$/, '')}`)).join('; ')}</span>
        </li>`).join('')}</ul>
      </div>` : '';
  }

  /* ---------- Casos límite ---------- */

  function renderEdgeCases() {
    const M = FP.metrics;
    const fmtInput = (input) => Object.entries(input).map(([k, v]) =>
      `${C().metrics[k].label}: ${v === undefined ? 'undefined' : JSON.stringify(v)}`).join(', ');

    const rows = FP.mock.EDGE_CASES.map((c) => {
      const d = M.deriveBlock(c.input);
      const v = M.validateBlock(d.values, d.sources, d.rejected);
      const match = v.status === c.expected;
      const out = ['conversionRate', 'aov', 'revenue'].map((k) =>
        `<td class="num">${esc(F().metric(k, d.values[k]))}${d.sources[k] ? `<span class="src">${esc(F().SOURCE_LABELS[d.sources[k]])}</span>` : ''}</td>`).join('');
      const msg = v.issues.map((i) => i.message || i.label).join(' ');
      return `<tr>
        <td class="wrap"><strong>${esc(c.label)}</strong><span class="cell-sub">${esc(fmtInput(c.input))}</span></td>
        ${out}
        <td>${pill(v.status)}</td>
        <td>${pill(c.expected)}</td>
        <td>${match ? pill('ok', 'Coincide') : pill('error', 'No coincide')}</td>
        <td class="wrap">${esc(msg)}</td>
      </tr>`;
    }).join('');

    $('edge-table').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Caso y entrada</th><th scope="col" class="num">CR</th><th scope="col" class="num">AOV</th>
      <th scope="col" class="num">Venta</th><th scope="col">Obtenido</th><th scope="col">Esperado</th><th scope="col">Resultado</th><th scope="col">Detalle</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Pruebas del motor ---------- */

  function renderEngine(state) {
    const st = state.selfTest;
    if (!st) { $('engine-tests').innerHTML = ''; $('engine-summary').innerHTML = ''; return; }
    $('engine-summary').innerHTML = pill(st.ok ? 'ok' : 'error', `${st.passed} de ${st.total} correctas`);
    const groups = {};
    st.results.forEach((r) => { (groups[r.group] = groups[r.group] || []).push(r); });
    $('engine-tests').innerHTML = `<div class="tests">${Object.entries(groups).map(([g, list]) => `
      <div><h3>${esc(g)}</h3><ul>${list.map((r) => `
        <li><span class="mark mark--${r.pass ? 'pass' : 'fail'}" aria-label="${r.pass ? 'correcta' : 'fallida'}">${r.pass ? '✓' : '✕'}</span>
        <span>${esc(r.name)}${r.error ? ` <span class="cell-sub">${esc(r.error)}</span>` : ''}</span></li>`).join('')}
      </ul></div>`).join('')}</div>`;
  }

  /* ---------- Contrato de exportación ---------- */

  function renderExport(state) {
    const obj = FP.exporter.buildForecastExport(state, { sampleSize: 2 });
    $('export-json').textContent = JSON.stringify(obj, null, 2);
  }

  /* ---------- Feedback ---------- */

  let toastTimer = null;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  function renderAll(state) {
    renderStatus(state);
    renderFacts(state);
    renderTargets(state);
    renderFilters(state);
    renderValidation(state);
    renderEngine(state);
    renderExport(state);
  }

  /** Utilidades compartidas con las vistas de Fase 1. */
  const helpers = { esc, pill, segmented };

  FP.ui = { helpers, renderAppMeta, renderStatus, renderFacts, renderTargets, renderFilters, renderValidation,
    renderEdgeCases, renderEngine, renderExport, renderAll, toast };
})(typeof window !== 'undefined' ? window : globalThis);
