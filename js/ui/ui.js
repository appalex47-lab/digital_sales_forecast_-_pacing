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
    const biz = C().business;
    document.querySelector('[data-bind="app-subtitle"]').textContent = biz && biz.configured ? `${a.subtitle} · ${biz.name}` : a.subtitle;
    $('app-footer').textContent = `${a.name}, versión Alfa v${a.version} · ${a.phaseLabel}. Contrato de datos ${C().schemaVersion}. Cálculos determinísticos en el navegador; sin backend.`;
  }

  /** Aviso que NO desaparece mientras un guardado esté fallido: los datos están solo en la memoria de esta pestaña. */
  function renderSaveFailure(state) {
    const el = $('save-failure'); if (!el) return;
    const f = state.saveFailure;
    el.hidden = !f;
    el.textContent = f ? `⚠ ${f.message} Exporta tus datos o vuelve a importar el archivo cuando se resuelva.` : '';
  }

  function renderStatus(state) {
    renderSaveFailure(state);
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

    // Encabezado: año + «Datos al» (fecha de referencia global). Las píldoras de datos y motor viven en el menú, sobre el modo Aprendiz.
    const dataKind = q ? QPILL[q.status] : 'empty', dataText = q ? q.statusText : 'Sin datos';
    const engineP = st ? { kind: st.ok ? 'ok' : 'error', text: st.ok ? 'Operativo' : 'Con fallas' } : state.selfTestError ? { kind: 'warning', text: 'No se pudo ejecutar' } : { kind: 'na', text: 'Sin ejecutar' };
    const link = (label, kind, shown, text) => `<a class="hstatus__link" href="#ajustes" data-section="estado" aria-label="${esc(label)}: ${esc(text)}. Ver el detalle en Configuración de RevNavigator" title="Ver el detalle en Configuración de RevNavigator">${pill(kind, shown)}</a>`;
    const pills = $('snav-pills');
    if (pills) pills.innerHTML = `${link('Estado de datos', dataKind, dataText, dataText)}${link('Estado del motor', engineP.kind, `Motor: ${engineP.text}`, engineP.text)}`;
    const fc = state.fc || {}, fixed = fc.settings && fc.settings.referenceDate;
    const d0 = new Date(), todayIso = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    const refShown = fixed || (fc.run && fc.run.referenceDate) || todayIso;
    const last = fc.lastActualDate;
    const top = $('topbar-status');
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const fmtD = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[3])} ${MES[Number(m[2]) - 1]} ${m[1]}` : iso; };
    const open = !!(state.ux && state.ux.refOpen);
    // Un solo control: botón «Datos al …» que abre un panel con fecha, atajos y año.
    if (top) top.innerHTML = `
      <span class="hdate">
        <button type="button" id="topbar-ref" class="hdate__btn" data-action="ref-toggle" aria-haspopup="dialog" aria-expanded="${open}" aria-controls="topbar-ref-panel"
          title="Fecha y año del reporte de ventas" aria-label="${esc(`Datos al ${fmtD(refShown)}${fixed ? ' (fecha fija)' : ' · hoy'}, año ${state.year}. Cambiar fecha y año`)}"${fixed ? ' data-fixed="1"' : ''}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 1.5v2M12 1.5v2M2 6h12M3 3h10a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span class="hdate__txt">Datos al ${esc(fmtD(refShown))}${fixed ? '' : ' · hoy'}</span>
          <span class="hdate__yr">${esc(String(state.year))}</span>
          <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true" focusable="false"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
        <div id="topbar-ref-panel" class="hdate__panel" role="dialog" aria-label="Fecha y año del reporte" ${open ? '' : 'hidden'}>
          <label class="hdate__pl" for="topbar-date">Fecha de corte</label>
          <input type="date" id="topbar-date" class="hdate__in" value="${esc(refShown)}" data-action="set-ref-date" aria-describedby="topbar-date-h">
          <div class="hdate__chips">
            ${last && last !== refShown ? `<button type="button" class="hdate__b" data-action="fc-ref-last" aria-label="Ir al último día con venta real, ${esc(last)}">Último real (${esc(fmtD(last))})</button>` : ''}
            ${fixed ? `<button type="button" class="hdate__b" data-action="fc-ref-today" aria-label="Quitar la fecha fija y volver a hoy">Hoy</button>` : ''}
          </div>
          <label class="hdate__pl" for="topbar-year">Año (cambia solo si eliges una fecha de otro año)</label>
          <select id="topbar-year" class="hstatus__year" data-action="set-year" aria-label="Año seleccionado">${years.map((y) =>
            `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <p class="hdate__scope" id="topbar-date-h">${fixed ? 'Fecha fija: el reporte se calcula como si fuera ese día.' : 'Sin fecha fija: el reporte usa el día de hoy.'}
            Mueve Inicio, Pacing, Forecast, Reforecast, Diagnóstico y Recovery. No mueve Productos, Segmentos ni Clientes.</p>
        </div>
      </span>`;
    const bar = $('status-bar');   // la ficha completa solo existe en Configuración de RevNavigator
    if (bar) bar.innerHTML = `
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
          <small>${st ? `${st.passed} de ${st.total} pruebas correctas` : ''}${state.storageKind ? `, guardado en ${state.storageKind === 'memory' ? 'memoria temporal' : state.storageKind === 'localStorage' ? 'este navegador' : 'este navegador (IndexedDB)'}` : ''}</small></dd></div>`;
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

  /** Lo que se muestra en el campo del canal: el % que la persona escribió (si el monto guardado aún corresponde a ese % de la meta) o el monto. */
  function channelValue(t, id) {
    const amt = t.byChannel[id].revenue;
    const pct = t.channelShare && t.channelShare[id];
    const total = t.annual.revenue;
    if (pct > 0 && total > 0 && amt !== null && amt !== undefined && Math.abs(Math.round(total * pct) / 100 - amt) <= 0.01) return `${pct}%`;
    return amt === null || amt === undefined ? '' : String(amt);
  }

  /**
   * Borrador del formulario de metas: lo escrito y aún no guardado sobrevive a cualquier re-dibujo (p. ej. «Mostrarme dónde» del recorrido).
   * Vale solo mientras las metas guardadas no cambien (guardar, limpiar, importar o cambiar de año lo descartan).
   */
  let targetsDraft = null;
  const targetsSig = (state) => JSON.stringify([state.year, state.targets && state.targets.annual, state.targets && state.targets.byChannel, state.targets && state.targets.channelShare]);
  function markTargetsDraft(state) { targetsDraft = { sig: targetsSig(state) }; }

  function renderTargets(state) {
    const formEl = $('targets-form');
    let keep = null;
    if (targetsDraft && formEl && targetsDraft.sig === targetsSig(state)) {
      keep = {}; formEl.querySelectorAll('input[name]').forEach((i) => { keep[i.name] = i.value; });
    } else targetsDraft = null;
    const t = state.targets;
    const val = (v) => (v === null || v === undefined ? '' : String(v));
    const h = DM().validateTargets(t);
    let note = '';
    if (h.status === 'pass') note = `<p class="note note--ok" role="status">La suma de canales cuadra con la meta anual.</p>`;
    else if (h.status === 'warning') {
      note = `<p class="note note--warning" role="alert">La suma de canales (${esc(F().currency(h.sum))}) difiere de la meta anual por ${esc(F().currency(h.diff))} (${esc(F().signedPercent(h.diffPct, 2))}).</p>`;
    } else if (h.status === 'incomplete') {
      note = `<p class="note" role="status">Cobertura incompleta: ${esc(String(h.coverage.present))} de ${esc(String(h.coverage.expected))} canales con meta. Con lo capturado la suma es ${esc(F().currency(h.sum))}; no se puede confirmar ni descartar la conciliación con la meta anual hasta capturar los ${esc(String(h.coverage.missing))} faltantes.</p>`;
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
            <input id="t-${c.id}" name="${c.id}" inputmode="decimal" autocomplete="off" value="${esc(channelValue(t, c.id))}" placeholder="Monto o %, ej. 151M o 58%">
            <span class="field__hint num" data-share-hint="${c.id}"></span>
          </div>`).join('')}
      </div>
      <p class="targets-form__split num" id="t-split" role="status" aria-live="polite"></p>
      ${note}
      ${FP.planningView && FP.planningView.isStale(state) ? `<div class="ds-alert ds-alert--warning" role="alert"><div><strong>Tu vista previa del plan quedó desactualizada.</strong> Cambiaste metas o supuestos después de generarla. <a href="#plan" data-nav="plan">Ir a Plan y regenerarla</a></div></div>` : ''}
      <div class="btn-row">
        <button type="submit" class="btn btn--primary">Guardar metas</button>
        <button type="button" class="btn" data-action="sample-targets">Usar metas de ejemplo</button>
      </div>
      ${assistant(state)}`;
    if (keep) Object.keys(keep).forEach((n) => { const i = $('targets-form').querySelector(`[name="${n}"]`); if (i) i.value = keep[n]; });
    updateTargetHints();
  }

  /**
   * Reparto por canal en vivo (Fase 13): al escribir la meta total y el monto (o el %) de cada canal, muestra el monto y el % de cada uno
   * y cuánto falta o se excede. Solo lee y escribe textos de ayuda; no cambia lo que el usuario escribió ni guarda nada.
   */
  function updateTargetHints() {
    const form = $('targets-form'); if (!form) return;
    const total = FP.format.parseAmountInput(String((form.querySelector('[name="annual"]') || {}).value || ''));
    let sum = 0, defined = 0; const pending = [];
    C().channels.forEach((c) => {
      const input = form.querySelector(`[name="${c.id}"]`); const hint = form.querySelector(`[data-share-hint="${c.id}"]`);
      if (!input || !hint) return;
      const r = FP.format.parseShareInput(input.value, total);
      let txt = '';
      if (r.error === 'no_total') txt = 'Para usar %, captura primero la meta anual total.';
      else if (r.error) txt = r.kind === 'pct' ? 'El porcentaje debe estar entre 0 y 100.' : 'Monto no válido. Usa 151M, 151000000 o 58%.';
      else if (r.value !== null) { sum += r.value; defined += 1; txt = total > 0 ? `${F().currencyCompact(r.value)}, ${F().percent(r.value / total, 1)} del total` : F().currencyCompact(r.value); }
      if (r.value === null && !r.error) pending.push(c.label);
      hint.textContent = txt;
    });
    const split = $('t-split'); if (!split) return;
    if (!(total > 0)) { split.textContent = 'Captura la meta anual total y, en cada canal, su monto o su porcentaje (ej. 58%).'; return; }
    if (!defined) { split.textContent = 'Indica cuánto le toca a cada canal: escribe el monto (151M) o su parte del total (58%).'; return; }
    const diff = total - sum; const near = Math.abs(diff) <= Math.max(1, total * 0.0001);
    if (near) split.textContent = `Asignado ${F().currencyCompact(sum)} (100 % de la meta): el reparto cuadra.`;
    else if (diff > 0) split.textContent = `Asignado ${F().currencyCompact(sum)} (${F().percent(sum / total, 1)}). Falta ${F().currencyCompact(diff)} (${F().percent(diff / total, 1)})${pending.length === 1 ? ` para ${pending[0]}` : pending.length > 1 ? ` por repartir entre ${pending.join(', ')}` : ''}.`;
    else split.textContent = `Asignado ${F().currencyCompact(sum)} (${F().percent(sum / total, 1)}). Se excede por ${F().currencyCompact(-diff)} (${F().percent(-diff / total, 1)}): ajusta algún canal.`;
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
        <div class="table-wrap"><table class="table ds-table">
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
        ${sug.errors.map((e) => `<p class="note note--warning" role="alert">${esc(e)}</p>`).join('')}${(sug.warnings || []).map((e) => `<p class="note note--warning">${esc(e)}</p>`).join('')}
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
      box.innerHTML = `<div class="empty"><strong>No hay datos para validar</strong>Usa “Generar datos de prueba” (abajo, en «Ver más → Herramientas») para cargar septiembre 2026.</div>`;
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

    box.innerHTML = `<div class="table-wrap"><table class="table ds-table">
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

    $('edge-table').innerHTML = `<div class="table-wrap"><table class="table ds-table">
      <thead><tr><th scope="col">Caso y entrada</th><th scope="col" class="num">CR</th><th scope="col" class="num">AOV</th>
      <th scope="col" class="num">Venta</th><th scope="col">Obtenido</th><th scope="col">Esperado</th><th scope="col">Resultado</th><th scope="col">Detalle</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Pruebas del motor ---------- */

  function renderEngine(state) {
    const st = state.selfTest;
    if (!st) { $('engine-tests').innerHTML = state.selfTestError ? `<p class="cell-sub">No se pudieron ejecutar las pruebas del motor: ${esc(state.selfTestError)}. Toca «Ejecutar pruebas del motor» para reintentar; si persiste, avisa a quien administra la herramienta.</p>` : ''; $('engine-summary').innerHTML = state.selfTestError ? pill('warning', 'No se pudo ejecutar') : ''; return; }
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
  function toast(message, opts) {
    const el = $('toast');
    el.textContent = message;
    if (!el.dataset.tap) { el.dataset.tap = '1'; el.addEventListener('click', () => { clearTimeout(toastTimer); el.classList.remove('is-visible'); }); }   // tocar el aviso lo cierra (en móvil)
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    // tiempo según el largo del mensaje: los avisos largos (conversión de GA4, archivos omitidos) se alcanzan a leer
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), opts && opts.ms ? opts.ms : Math.min(10000, 2600 + String(message || '').length * 35));
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
  /** Botón «Volver arriba» (celular): aparece tras desplazar al menos el 35 % de la altura de pantalla; se oculta con el menú abierto. */
  let backTopReady = false;
  function initBackToTop() {
    if (backTopReady || typeof document === 'undefined') return;
    backTopReady = true;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'back-top'; b.className = 'back-top'; b.hidden = true;
    b.setAttribute('aria-label', 'Volver arriba'); b.title = 'Volver arriba';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(b);
    const update = () => {
      const y = window.pageYOffset || document.documentElement.scrollTop || 0;
      b.hidden = !(y >= 0.35 * window.innerHeight) || document.body.classList.contains('nav-open');
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    b.addEventListener('click', () => {
      const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
      const h = document.querySelector('main:not([hidden]) h1, main:not([hidden]) h2');
      if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }
    });
    update();
  }

  const helpers = { esc, pill, segmented };

  FP.ui = { helpers, renderAppMeta, renderStatus, renderSaveFailure, renderFacts, renderTargets, markTargetsDraft, updateTargetHints, renderFilters, renderValidation,
    renderEdgeCases, renderEngine, renderExport, renderAll, toast, initBackToTop };
})(typeof window !== 'undefined' ? window : globalThis);
