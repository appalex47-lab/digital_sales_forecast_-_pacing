/**
 * quality-view.js — Vista "Calidad de datos" (Fase 1).
 * Pinta el resumen de FP.coverage.summarize(); no calcula nada propio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const QPILL = { ready: 'ok', warnings: 'warning', invalid: 'error', empty: 'na' };
  const QTEXT = () => FP.coverage.STATUS_TEXT;

  function banner(q) {
    const esc = H().esc;
    const why = [];
    const t = q.totals;
    if (q.status === 'empty') why.push('Todavía no hay datos importados.');
    if (t.rejected) why.push(`${F().integer(t.rejected)} filas no se importaron por errores.`);
    if (t.error) why.push(`${F().integer(t.error)} registros importados tienen errores.`);
    if (t.warning) why.push(`${F().integer(t.warning)} registros con advertencias.`);
    if (t.duplicateKeys) why.push(`${F().integer(t.duplicateKeys)} llaves duplicadas.`);
    if (t.missingDates) why.push(`${F().integer(t.missingDates)} fechas sin ningún registro.`);
    gapSentences(q).forEach((x) => why.push(x));
    if (q.status === 'ready') why.push('Sin rechazos, errores, duplicados ni huecos de fechas o canales.');
    return `<div class="banner banner--${QPILL[q.status]}" role="status">
      <p class="banner__title">${esc(q.statusText)}</p>
      <p class="banner__text">${esc(why.join(' '))}</p>
    </div>`;
  }

  /**
   * Huecos de cobertura por canal (los que hacen pasar una colección a «advertencias» sin que ninguna fila tenga problema):
   * una frase por colección con datos. Los segmentos no cuentan (son un desglose opcional de periodos elegidos).
   */
  function gapSentences(q) {
    const out = [];
    C().dataTypeIds.filter((t) => t !== 'segments' && q.byType[t].status !== 'empty').forEach((t) => {
      const s = q.byType[t], c = s.coverage;
      const label = (id) => FP.dataModel.getChannel(id).label;
      const days = (n) => `${F().integer(n)} ${n === 1 ? 'día' : 'días'}`;
      if (s.datesWithMissingChannels > 0) {
        const partial = c.byChannel.filter((x) => x.days > 0 && x.missingDays > 0).map((x) => `${label(x.channel)} ${days(x.missingDays)}`);
        out.push(`${s.label}: ${F().integer(s.datesWithMissingChannels)} ${s.datesWithMissingChannels === 1 ? 'fecha' : 'fechas'} con algún canal faltante${partial.length ? ` (${partial.join(', ')})` : ''}.`);
      }
      if (c.missingChannels.length) out.push(`${s.label}: sin datos de ${c.missingChannels.map(label).join(', ')}.`);
    });
    return out;
  }

  function summaryTable(q) {
    const esc = H().esc, pill = H().pill;
    const types = C().dataTypeIds.map((t) => q.byType[t]);
    const row = (label, get, fmt = (v) => F().integer(v), totalVal = undefined) => `<tr><th scope="row">${esc(label)}</th>
      ${types.map((s) => `<td class="num">${s.status === 'empty' ? '—' : fmt(get(s))}</td>`).join('')}
      <td class="num">${totalVal === undefined ? '' : totalVal === null ? '—' : fmt(totalVal)}</td></tr>`;
    const tt = q.totals;
    return `<div class="table-wrap"><table class="table table--matrix ds-table">
      <thead><tr><th scope="col">Indicador</th>${types.map((s) => `<th scope="col" class="num">${esc(s.label)}</th>`).join('')}<th scope="col" class="num">Total</th></tr></thead>
      <tbody>
        ${row('Archivos', (s) => s.files, undefined, tt.files)}
        ${row('Filas leídas', (s) => s.rowsRead, undefined, tt.rowsRead)}
        ${row('Registros cargados', (s) => s.imported, undefined, tt.imported)}
        ${row('Registros válidos', (s) => s.valid, undefined, tt.valid)}
        ${row('Registros con advertencias', (s) => s.warning, undefined, tt.warning)}
        ${row('Registros con errores (importados)', (s) => s.error, undefined, tt.error)}
        ${row('Filas rechazadas', (s) => s.rejected, undefined, tt.rejected)}
        ${row('Duplicados (llaves repetidas)', (s) => s.duplicateKeys, undefined, tt.duplicateKeys)}
        ${row('Fechas faltantes', (s) => s.missingDates, undefined, tt.missingDates)}
        ${row('Canales sin datos', (s) => s.missingChannels, undefined, loadedMissingChannels(q))}
        ${row('Fechas con algún canal faltante', (s) => s.datesWithMissingChannels)}
        ${row('Cobertura temporal', (s) => s.coverage.pct, (v) => F().percent(v, 1))}
        <tr><th scope="row">Estado</th>${types.map((s) => `<td class="num">${pill(QPILL[s.status], QTEXT()[s.status])}</td>`).join('')}
          <td class="num">${pill(QPILL[q.status], q.statusText)}</td></tr>
      </tbody></table></div>`;
  }

  /** Total de «Canales sin datos» solo de las colecciones que sí tienen datos (las sin cargar no son un hueco: no se cargaron). */
  function loadedMissingChannels(q) {
    return C().dataTypeIds.filter((t) => q.byType[t].status !== 'empty').reduce((a, t) => a + q.byType[t].missingChannels, 0);
  }

  /** Rangos de fechas consecutivas: ['2024-01-01', '2024-01-02', '2024-01-05'] → [['2024-01-01', '2024-01-02'], ['2024-01-05', '2024-01-05']]. */
  function dateRanges(dates) {
    const ms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    const out = [];
    dates.forEach((d) => { const last = out[out.length - 1]; if (last && ms(d) - ms(last[1]) === 86400000) last[1] = d; else out.push([d, d]); });
    return out;
  }

  /** D · Fechas faltantes por canal (un canal «falta» un día si no tiene ninguna fila ese día). Sale de los registros, no cambia el resumen exportado. */
  function missingByChannel(state, t, c) {
    const esc = H().esc;
    const recs = FP.dataStore.records(state.store, t).filter((r) => r.date && r.channel);
    const range = FP.calendar.eachDay(c.start, c.end);
    const has = {};
    C().channelIds.forEach((id) => { has[id] = new Set(); });
    recs.forEach((r) => { if (has[r.channel]) has[r.channel].add(r.date); });
    const rows = c.byChannel.filter((x) => x.missingDays > 0).map((x) => {
      const ch = FP.dataModel.getChannel(x.channel);
      let detail;
      if (x.days === 0) detail = 'Sin ninguna fila en todo el periodo.';
      else {
        const ranges = dateRanges(range.filter((d) => !has[x.channel].has(d)));
        const txt = ranges.slice(0, 20).map(([a, b]) => (a === b ? a : `${a} a ${b} (${F().integer(Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000) + 1)} días)`)).join('; ');
        detail = txt + (ranges.length > 20 ? `; y ${ranges.length - 20} rangos más` : '');
      }
      return `<tr><td><span class="channel-cell" style="--dot:${ch.color}">${esc(ch.label)}</span></td><td class="num">${F().integer(x.missingDays)}</td><td class="wrap num">${esc(detail)}</td></tr>`;
    }).join('');
    if (!rows) return '';
    return `<details class="disclosure" id="q-missing-by-channel"><summary>Fechas faltantes por canal</summary>
      <p class="field__hint">Un canal «falta» un día cuando no tiene ninguna fila ese día. Si un canal empezó después del inicio del rango, o no opera algunos días, esos días aparecen aquí: revisa si los esperabas.</p>
      <div class="table-wrap"><table class="table ds-table"><thead><tr><th>Canal</th><th class="num">Faltan</th><th>Fechas</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  function coverageDetail(state, q) {
    const esc = H().esc;
    let t = state.qualityType;
    // si el usuario aún no eligió pestaña y la actual está vacía, se muestra la primera colección con datos (antes salía «Histórico sin datos»)
    if (!state.qualityPicked && q.byType[t].status === 'empty') t = C().dataTypeIds.find((id) => q.byType[id].status !== 'empty') || t;
    const s = q.byType[t];
    const c = s.coverage;
    const seg = H().segmented('quality-type', C().dataTypeIds.map((id) => [id, C().dataTypes[id].label]), t);
    if (s.status === 'empty') return `<div class="subhead"><h3 class="panel__title">Cobertura</h3>${seg}</div>
      <div class="empty"><strong>${esc(s.label)} sin datos</strong>Carga un archivo de este tipo en Carga de datos.</div>`;

    const chRows = c.byChannel.map((x) => {
      const ch = FP.dataModel.getChannel(x.channel);
      return `<tr><td><span class="channel-cell" style="--dot:${ch.color}">${esc(ch.label)}</span></td>
        <td class="num">${F().integer(x.days)}</td><td class="num">${F().integer(x.missingDays)}</td>
        <td class="num">${F().percent(x.pct, 1)}</td>
        <td><span class="bar" aria-hidden="true"><span style="width:${Math.round((x.pct || 0) * 100)}%;--dot:${ch.color}"></span></span></td></tr>`;
    }).join('');
    const mRows = c.byMetric.map((m) => `<tr><td>${esc(C().metrics[m.metric].label)}</td>
      <td class="num">${F().percent(m.pct, 1)}</td><td class="num">${F().percent(m.observedPct, 1)}</td>
      <td class="num">${F().percent(FP.metrics.safeDivide(m.present - m.observed, m.total), 1)}</td>
      <td class="num">${F().integer(m.total - m.present)}</td></tr>`).join('');
    const missing = c.missingDates;

    return `<div class="subhead"><h3 class="panel__title">Cobertura</h3>${seg}</div>
      <dl class="kpis">
        <div><dt>Inicio</dt><dd class="num">${esc(c.start)}</dd></div>
        <div><dt>Fin</dt><dd class="num">${esc(c.end)}</dd></div>
        <div><dt>Días disponibles</dt><dd class="num">${F().integer(c.availableDays)}</dd></div>
        <div><dt>Días esperados</dt><dd class="num">${F().integer(c.expectedDays)}</dd></div>
        <div><dt>Cobertura</dt><dd class="num">${F().percent(c.pct, 1)}</dd></div>
        <div><dt>Registros con venta 0</dt><dd class="num">${F().integer(c.zeroRevenueRecords)}</dd></div>
      </dl>
      <div class="grid-2 grid-2--tight">
        <div><h4>Por canal</h4><div class="table-wrap"><table class="table ds-table">
          <thead><tr><th>Canal</th><th class="num">Días</th><th class="num">Faltan</th><th class="num">Cobertura</th><th><span class="visually-hidden">Barra</span></th></tr></thead>
          <tbody>${chRows}</tbody></table></div>
          ${missingByChannel(state, t, c)}</div>
        <div><h4>Por métrica</h4><div class="table-wrap"><table class="table ds-table">
          <thead><tr><th>Métrica</th><th class="num">Con valor</th><th class="num">Observado</th><th class="num">Calculado</th><th class="num">Sin valor</th></tr></thead>
          <tbody>${mRows}</tbody></table></div>
          <p class="field__hint">La estacionalidad se apoyará en lo observado; lo calculado se deriva de otras métricas.</p></div>
      </div>
      ${missing.length ? `<h4>Fechas sin ningún registro (${F().integer(missing.length)})</h4>
        <p class="date-list num">${missing.slice(0, 60).map(esc).join(', ')}${missing.length > 60 ? ` y ${missing.length - 60} más` : ''}</p>` : ''}`;
  }

  function issuesByType(q) {
    const esc = H().esc, pill = H().pill;
    const all = {};
    C().dataTypeIds.forEach((t) => Object.entries(q.byType[t].issuesByType).forEach(([k, n]) => {
      all[k] = all[k] || { total: 0 };
      all[k].total += n;
      all[k][t] = n;
    }));
    const rows = Object.entries(all).sort((a, b) => b[1].total - a[1].total);
    if (!rows.length) {
      // sin problemas de filas: si el estado marca advertencias es por huecos de cobertura, y se dice
      if (q.status === 'warnings' && gapSentences(q).length) return '<p class="note note--warning">Las filas no tienen errores ni advertencias. El estado marca advertencias por huecos de cobertura (fechas con algún canal faltante): mira «Fechas faltantes por canal» en Cobertura.</p>';
      return '<p class="note note--ok">No hay errores ni advertencias registrados.</p>';
    }
    return `<div class="table-wrap"><table class="table ds-table">
      <thead><tr><th>Tipo</th><th>Qué pasa</th>${C().dataTypeIds.map((t) => `<th class="num">${esc(C().dataTypes[t].label)}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${rows.map(([type, n]) => {
        const sev = C().errorTypes[type].severity;
        return `<tr><td>${esc(C().errorTypes[type].label)}<span class="cell-sub">${esc(type)}</span></td>
          <td>${FP.qualityRules && FP.qualityRules.actionOf(type) === 'quarantine_cell' ? pill('warning', 'En cuarentena') : pill(sev, sev === 'error' ? 'Error' : 'Advertencia')}</td>
          ${C().dataTypeIds.map((t) => `<td class="num">${n[t] ? F().integer(n[t]) : '—'}</td>`).join('')}
          <td class="num">${F().integer(n.total)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="field__hint">Algunas reglas cambian la severidad por defecto (p. ej. pedidos con volumen 0 es error; pedidos no enteros es advertencia). El detalle fila por fila se exporta en errores JSON.</p>`;
  }

  /* ---------- Fase A ---------- */
  const SOURCE_LABEL = { csv: 'CSV', xlsx: 'Excel (.xlsx)', 'ga4-csv': 'CSV de GA4 (convertido)' };

  /** Salud por colección y total (la misma que pinta «Salud de los datos»; la reutiliza el paso 3 del recorrido). */
  function healthModel(state) {
    const hv0 = FP.dataHealth.overview(state.store);
    const prod = FP.dataHealth.products(state.productQuality);   // Productos: mismos componentes, calculados desde lo que guarda cada lote
    const hv = { collections: [...hv0.collections, ...prod], score: null };
    { const sc = hv.collections.filter((c) => c.score !== null); hv.score = sc.length ? Math.round(sc.reduce((a, c) => a + c.score, 0) / sc.length) : null; if (hv.score === 100 && sc.some((c) => c.score < 100)) hv.score = 99; }
    return hv;
  }

  function healthBlock(state) {
    const esc = H().esc, hv = healthModel(state);
    if (!hv.collections.length) return '<p class="field__hint">Sin datos cargados todavía.</p>';
    const tone = (v) => (v === null ? 'na' : v >= 90 ? 'ok' : v >= 70 ? 'warning' : 'danger');
    const card = (c) => {
      const lost = c.components.filter((x) => x.score !== null && x.score < 100);
      return `<section class="dhealth__card" aria-label="Salud de ${esc(c.label)}">
        <h4 class="dhealth__title">${esc(c.label)} ${H().pill(tone(c.score), c.score === null ? 'Sin puntaje' : `${c.score}/100`)}</h4>
        ${lost.length
          ? `<p class="dhealth__lost">Lo que bajó puntos:</p><ul class="dhealth__list">${lost.map((x) => `<li><strong>${esc(x.label)} ${x.score}</strong> · ${esc(x.detail)}</li>`).join('')}</ul>`
          : `<p class="dhealth__ok">Sin incidencias: los ${c.components.length} componentes están en 100.</p>`}
        <details class="dhealth__all"><summary>Ver los ${c.components.length} componentes</summary>
          <div class="table-wrap"><table class="table ds-table" aria-label="Componentes de salud de ${esc(c.label)}">
            <thead><tr><th scope="col">Componente</th><th scope="col" class="num">Puntaje</th><th scope="col">Detalle</th></tr></thead>
            <tbody>${c.components.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td class="num">${x.score === null ? '—' : x.score}</td><td class="wrap">${esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>
        </details>${c.columns && FP.productView && FP.productView.columnsTable ? FP.productView.columnsTable(c.columns, c.label) : ''}</section>`;
    };
    // Resumen arriba (una línea por tipo de dato con lo que más bajó su puntaje) y el detalle por componente abajo
    const worst = (c) => { const l = c.components.filter((x) => x.score !== null && x.score < 100).sort((a, b) => a.score - b.score)[0]; return l ? `${l.label} ${l.score}: ${l.detail}` : null; };
    const sumRows = hv.collections.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td>${H().pill(tone(c.score), c.score === null ? 'Sin puntaje' : `${c.score}/100`)}</td><td class="wrap">${worst(c) ? esc(worst(c)) : '<span class="cell-sub">Sin incidencias</span>'}</td></tr>`).join('');
    return `<p class="dhealth__total">Salud general: ${H().pill(tone(hv.score), hv.score === null ? 'Sin puntaje' : `${hv.score}/100`)}
        <span class="field__hint">100 solo cuando nada bajó puntos.</span></p>
      <h3 class="qsub">Resumen por tipo de dato</h3>
      <div class="table-wrap"><table class="table ds-table" aria-label="Resumen de salud por tipo de dato"><thead><tr><th scope="col">Tipo de dato</th><th scope="col">Puntaje</th><th scope="col">Lo que más bajó el puntaje</th></tr></thead><tbody>${sumRows}</tbody></table></div>
      <h3 class="qsub">Detalle por componente</h3>
      <div class="dhealth">${hv.collections.map(card).join('')}</div>`;
  }

  const Q_PAGE = 25;
  /** Lista unificada de valores en cuarentena de todas las secciones (la de Productos trae hasta 25 ejemplos por regla y archivo; sus conteos son exactos). */
  function quarantineLines(state) {
    const QR = FP.qualityRules, C = FP.config;
    const list = QR.quarantineList(state.store).concat(QR.productQuarantineList(state.productQuality));
    list.forEach((x) => { x.section = x.dataType === 'products' ? (QR.PRODUCT_KIND[x.kind] || 'Productos') : C.dataTypes[x.dataType].label; });
    return list;
  }

  function quarantineBlock(state) {
    const esc = H().esc, QR = FP.qualityRules, F = FP.format;
    const list = quarantineLines(state);
    const lbl = (t) => (FP.config.errorTypes[t] ? FP.config.errorTypes[t].label : QR.isProductCell(t) ? QR.productRuleLabel(t) : t);
    const pt = QR.productQuarantineTotals(state.productQuality);   // conteo EXACTO de Productos
    if (!list.length && !pt.total) return '<p class="note note--ok">No hay valores en cuarentena.</p>';
    const byRule = list.filter((x) => !x.examplesOnly).reduce((a, x) => { a[x.rule] = (a[x.rule] || 0) + 1; return a; }, {});
    Object.entries(pt.byRule).forEach(([r, n]) => { byRule[r] = (byRule[r] || 0) + n; });
    const totalAll = Object.values(byRule).reduce((a, n) => a + n, 0);
    const metricLabel = (k) => (FP.config.metrics[k] || { label: QR.productFieldLabel(k) }).label;
    // ---- resumen por sección y por regla (conteos exactos) ----
    const sec = new Map();
    list.filter((x) => !x.examplesOnly).forEach((x) => { const r = sec.get(x.section) || { n: 0, files: new Set(), rules: new Map() }; r.n++; if (x.fileName) r.files.add(x.fileName); r.rules.set(x.rule, (r.rules.get(x.rule) || 0) + 1); sec.set(x.section, r); });
    (state.productQuality || []).filter((b) => b.quarantined > 0).forEach((b) => { const k = QR.PRODUCT_KIND[b.kind] || 'Productos'; const r = sec.get(k) || { n: 0, files: new Set(), rules: new Map() }; r.n += b.quarantined; r.files.add(b.fileName); Object.entries(b.quarantineByRule).forEach(([rule, n]) => r.rules.set(rule, (r.rules.get(rule) || 0) + n)); sec.set(k, r); });
    const secRows = [...sec.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, r]) => `<tr><th scope="row">${esc(k)}</th><td class="num">${F.integer(r.n)}</td><td class="num">${r.files.size}</td><td class="wrap">${[...r.rules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([rule, n]) => `${esc(lbl(rule))} (${F.integer(n)})`).join(', ')}</td></tr>`).join('');
    const ruleRows = Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<tr><th scope="row">${esc(lbl(r))}</th><td class="num">${F.integer(n)}</td></tr>`).join('');
    // ---- consolidado línea por línea con filtros y paginación ----
    const f = state.qFilters || (state.qFilters = { section: 'all', rule: 'all', file: 'all', page: 1 });
    const opt = (vals, cur, all) => `<option value="all">${all}</option>${vals.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;
    const secs = [...new Set(list.map((x) => x.section))].sort(), rules = [...new Set(list.map((x) => x.rule))].sort(), files = [...new Set(list.map((x) => x.fileName).filter(Boolean))].sort();
    const shown = list.filter((x) => (f.section === 'all' || x.section === f.section) && (f.rule === 'all' || x.rule === f.rule) && (f.file === 'all' || x.fileName === f.file));
    const pages = Math.max(1, Math.ceil(shown.length / Q_PAGE)); const page = Math.min(Math.max(1, f.page || 1), pages); f.page = page;
    const slice = shown.slice((page - 1) * Q_PAGE, page * Q_PAGE);
    const prodSample = list.some((x) => x.examplesOnly);
    return `<p>${totalAll.toLocaleString('es-MX')} valor${totalAll === 1 ? '' : 'es'} en cuarentena: ${Object.entries(byRule).map(([r, n]) => `${esc(lbl(r))} (${n.toLocaleString('es-MX')})`).join(', ')}. No suman en ningún KPI; el resto de cada fila sí se usa.</p>
      <h3 class="qsub">Resumen</h3>
      <div class="qsum">
        <div class="table-wrap"><table class="table ds-table" aria-label="Cuarentena por sección"><thead><tr><th scope="col">Sección</th><th scope="col" class="num">Valores</th><th scope="col" class="num">Archivos</th><th scope="col">Reglas principales</th></tr></thead><tbody>${secRows}</tbody></table></div>
        <div class="table-wrap"><table class="table ds-table" aria-label="Cuarentena por regla"><thead><tr><th scope="col">Regla</th><th scope="col" class="num">Valores</th></tr></thead><tbody>${ruleRows}</tbody></table></div>
      </div>
      <h3 class="qsub">Consolidado línea por línea</h3>
      <div class="filters">
        <div class="field"><label for="q-sec" class="field__hint">Sección</label><select id="q-sec" data-action="q-filter" data-key="section">${opt(secs.map((x) => [x, x]), f.section, 'Todas')}</select></div>
        <div class="field"><label for="q-rule" class="field__hint">Regla</label><select id="q-rule" data-action="q-filter" data-key="rule">${opt(rules.map((x) => [x, lbl(x)]), f.rule, 'Todas')}</select></div>
        <div class="field"><label for="q-file" class="field__hint">Archivo</label><select id="q-file" data-action="q-filter" data-key="file">${opt(files.map((x) => [x, x]), f.file, 'Todos')}</select></div>
        <button type="button" class="btn" data-action="q-download">Descargar este consolidado (CSV)</button>
      </div>
      ${shown.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="Valores en cuarentena">
        <thead><tr><th scope="col">Archivo</th><th scope="col" class="num">Fila</th><th scope="col">Fecha</th><th scope="col">Canal</th><th scope="col">Campo</th><th scope="col" class="num">Valor original</th><th scope="col">Regla</th><th scope="col">Sección</th></tr></thead>
        <tbody>${slice.map((x) => `<tr><td class="wrap">${esc(x.fileName || '—')}</td><td class="num">${x.row || '—'}</td><td>${esc(x.date || (x.dataType === 'products' ? 'Productos' : '—'))}</td><td>${esc(x.channel || '—')}</td><td>${esc(metricLabel(x.field))}</td><td class="num">${esc(String(x.rawValue === null || x.rawValue === undefined ? '—' : x.rawValue))}</td><td class="wrap">${esc(lbl(x.rule))}<span class="cell-sub">${esc(x.why)}</span></td><td>${esc(x.section)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pager"><span>${F.integer((page - 1) * Q_PAGE + 1)}–${F.integer(Math.min(page * Q_PAGE, shown.length))} de ${F.integer(shown.length)} líneas${shown.length !== list.length ? ` (filtradas de ${F.integer(list.length)})` : ''}</span>
          <div class="btn-row"><button type="button" class="btn btn--small" data-action="q-page" data-value="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button><span class="num">Página ${page} de ${pages}</span><button type="button" class="btn btn--small" data-action="q-page" data-value="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente</button></div></div>`
        : '<p class="field__hint">Ninguna línea coincide con los filtros.</p>'}
      ${prodSample ? '<p class="field__hint">De Productos se listan hasta 25 ejemplos por regla y archivo (con su fila y valor original); los conteos del resumen son el total exacto.</p>' : ''}`;
  }

  FP.qualityViewLines = quarantineLines;

  function logBlock(state) {
    const esc = H().esc;
    const prodRows = (state.productQuality || []).map((b) => ({ importedAt: b.importedAt, fileName: b.fileName, product: FP.qualityRules.PRODUCT_KIND[b.kind] || 'Productos', rowCount: b.summary.rows, accepted: b.summary.accepted, quarantined: b.quarantined,
      rejected: b.summary.rejected, cols: b.mappedCount, durationMs: null, source: 'csv' }));
    const bats = [...FP.config.dataTypeIds.flatMap((t) => FP.dataStore.batches(state.store, t)), ...prodRows].sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt))).slice(0, 15);
    if (!bats.length) return '<div class="panel__body"><p class="field__hint">Todavía no hay importaciones.</p></div>';
    const cols = (b) => (b.product ? b.cols : Object.entries(b.mapping || {}).filter(([, f]) => f).length);
    return `<div class="table-wrap"><table class="table ds-table" aria-label="Registro de importaciones">
      <thead><tr><th scope="col">Fecha</th><th scope="col">Archivo</th><th scope="col">Tipo</th><th scope="col">Fuente</th><th scope="col" class="num">Recibidas</th><th scope="col" class="num">Aceptadas</th><th scope="col" class="num">En cuarentena</th><th scope="col" class="num">Rechazadas</th><th scope="col" class="num">Columnas usadas</th><th scope="col" class="num">Duración</th></tr></thead>
      <tbody>${bats.map((b) => `<tr><td>${esc(String(b.importedAt || '').replace('T', ' ').slice(0, 16))}</td><td class="wrap">${esc(b.fileName)}</td><td>${esc(b.product || FP.config.dataTypes[b.dataType].label)}</td><td>${esc(SOURCE_LABEL[b.source] || 'CSV')}</td>
        <td class="num">${b.rowCount}</td><td class="num">${b.accepted}</td><td class="num">${b.quarantined || 0}</td><td class="num">${b.rejected}</td><td class="num">${cols(b)}</td><td class="num">${typeof b.durationMs === 'number' ? `${(b.durationMs / 1000).toFixed(1)} s` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /** Fase B · matriz de compatibilidad de análisis para el periodo y canal del Diagnóstico. */
  /** Análisis disponibles para el periodo y canal del Diagnóstico (el mismo cálculo que pinta «Qué puedes analizar»; lo reutiliza el paso 4). */
  function analysesModel(state) {
    const sx = state.dx.settings;
    // sin mes elegido en Diagnóstico: el último mes con venta real (o el mes actual)
    const lastReal = FP.dataStore.records(state.store, 'actual').map((r) => r.date).sort().pop();
    const pType = sx.periodKey ? (sx.periodType || 'month') : 'month';
    const rg = FP.app.periodRange(pType, sx.periodKey || (lastReal || new Date().toISOString()).slice(0, 7));
    const cur = rg ? { start: rg.from, end: rg.to } : null;
    if (!cur) return { cur: null, list: [] };
    const kind = sx.comparison === 'actual_vs_previous' ? 'previous' : 'yoy';
    return { cur, list: FP.availability.analyses(state.store, { current: cur, channel: sx.channel || 'total', comparisonKind: kind }) };
  }

  function analysesBlock(state) {
    const esc = H().esc;
    const { cur, list } = analysesModel(state);
    if (!cur) return '<div class="panel__body"><p class="field__hint">Elige un periodo en Diagnóstico.</p></div>';
    const ST = { available: ['ok', 'Disponible'], partial: ['warning', 'Parcial'], missing: ['na', 'Falta información'], unavailable: ['na', 'No se puede'], unavailable_source: ['na', 'Fuente no cargada'],
      invalid: ['error', 'Datos inválidos'], quarantined: ['warning', 'En cuarentena'], incomplete_period: ['warning', 'Periodo incompleto'], non_comparable: ['warning', 'No comparable'], not_applicable: ['na', 'No aplica'] };
    const okN = list.filter((a) => a.status === 'available').length, noN = list.filter((a) => ['missing', 'unavailable', 'unavailable_source'].includes(a.status)).length;
    const sum = `<p class="analyses__sum"><strong>${okN} de ${list.length}</strong> análisis disponibles · <strong>${list.length - okN - noN}</strong> con límites (parciales, periodo incompleto o no comparables) · <strong>${noN}</strong> sin la información necesaria.</p>`;
    return `${sum}<div class="table-wrap"><table class="table ds-table" aria-label="Qué puedes analizar">
      <thead><tr><th scope="col">Análisis</th><th scope="col">Estado</th><th scope="col">Por qué</th><th scope="col">Qué hacer</th></tr></thead>
      <tbody>${list.map((a) => { const [t, l] = ST[a.status] || ['na', a.status]; const r = a.recommendations;
        return `<tr><th scope="row">${esc(a.label)}</th><td>${H().pill(t, l)}</td><td class="wrap">${r.length ? r.slice(0, 2).map((x) => esc(x.text)).join(' ') : `Disponible para ${esc(cur.start)} a ${esc(cur.end)}.`}</td><td class="wrap">${r.length ? esc(r[0].todo) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  /* ---------- Fase 3.2 · recorrido de cinco pasos ---------- */

  /** Valores en cuarentena (conteo exacto, el mismo que dice «Cuarentena»). */
  function quarantineTotal(state) {
    const QR = FP.qualityRules;
    return quarantineLines(state).filter((x) => !x.examplesOnly).length + QR.productQuarantineTotals(state.productQuality).total;
  }

  /** Meses cerrados con venta real: todos los días del mes tienen venta (en cualquier canal), con venta real o histórica cargada. */
  function closedMonths(state) {
    // Igual que el motor: un día cuenta solo si TODOS los canales tienen venta real; un mes cerrado, si todos sus días cuentan.
    const chs = C().channelIds, seen = new Map();
    ['actual', 'historical'].forEach((t) => FP.dataStore.records(state.store, t).forEach((r) => {
      if (!r.date || !r.channel || !r.metrics || !r.metrics.revenue || r.metrics.revenue.value === null || r.metrics.revenue.value === undefined) return;
      const d = String(r.date).slice(0, 10);
      if (!seen.has(d)) seen.set(d, new Set());
      seen.get(d).add(r.channel);
    }));
    const byMonth = new Map();
    seen.forEach((set, d) => { if (chs.every((c) => set.has(c))) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + 1); });
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    byMonth.forEach((count, key) => { if (key < today.slice(0, 7) && count >= new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate()) n++; });
    return n;
  }

  /** Lo que ya calcula la pantalla, en la forma que entiende FP.qualitySteps. */
  function stepsModel(state, q) {
    const t = q.totals, hv = healthModel(state), an = analysesModel(state);
    let worst = null;
    hv.collections.forEach((c) => c.components.forEach((x) => { if (x.score !== null && x.score < 100 && (!worst || x.score < worst.score)) worst = { score: x.score, text: `${c.label} · ${x.label} ${x.score}: ${x.detail}` }; }));
    const missing = an.list.filter((a) => ['missing', 'unavailable', 'unavailable_source', 'partial', 'incomplete_period', 'non_comparable', 'quarantined', 'invalid'].includes(a.status));
    const fm = missing[0] ? { label: missing[0].label, todo: missing[0].recommendations && missing[0].recommendations[0] ? missing[0].recommendations[0].todo : '' } : null;
    return {
      empty: q.status === 'empty', loaded: C().dataTypeIds.filter((x) => q.byType[x].status !== 'empty').map((x) => q.byType[x].label), gaps: gapSentences(q),
      missingDates: t.missingDates, rejected: t.rejected, errors: t.error, warnings: t.warning, duplicates: t.duplicateKeys, quarantined: quarantineTotal(state),
      health: { score: hv.score, worst: worst ? worst.text : null },
      analyses: { total: an.list.length, available: an.list.filter((a) => a.status === 'available').length, firstMissing: fm },
      forecast: { closedMonths: closedMonths(state), min: 12 }
    };
  }

  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesDe = (key) => (key ? `${MES[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}` : '');
  const diaDe = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const pc1 = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : '—');

  /** Estado de la calibración en una sola mirada (para el encabezado del paso 5 y para las pruebas). */
  function calStatus(state, m) {
    const cal = state.cal, CAL = FP.forecastCalibration, min = CAL.MIN_MONTHS;
    const closed = Number.isFinite(cal.closedCount) ? cal.closedCount : m.forecast.closedMonths;
    if (cal.run.status === 'running') return { key: 'running', closed, min };
    if (cal.saved.active) return { key: 'calibrated', closed, min };
    if (closed < min) return { key: 'learning', closed, min };
    return { key: 'ready', closed, min };
  }

  /** Años (y casos) que no se pudieron estimar: casi siempre porque ese año no tiene plan cargado. */
  function sinEstimar(last) {
    const ys = Object.keys(last.skippedByYear || {}).filter((y) => last.skippedByYear[y] > 0).sort();
    if (!ys.length) return '';
    return ` No se pudo estimar ${ys.map((y) => `${y} (${last.skippedByYear[y]} comparaciones)`).join(' ni ')}: casi siempre es porque ese año no tiene plan cargado. Con su plan diario en «Carga» esos meses también cuentan.`;
  }

  /** Paso 5 · Confianza del forecast: estado, qué significa cada etiqueta en tu historial, umbrales, historial de cambios y reglas. */
  function calibrationBlock(state, m) {
    const FC = FP.forecastConfidence, CAL = FP.forecastCalibration, esc = H().esc, pill = H().pill;
    if (!FC || !CAL || !state.cal) return '<p class="field__hint">La calibración de la confianza no está disponible en esta carga.</p>';
    const cal = state.cal, saved = cal.saved, st = calStatus(state, m), min = st.min, closed = st.closed, run = cal.run;
    const busy = st.key === 'running', falta = Math.max(0, min - closed), last = cal.last;
    const T = FC.getActive() || FC.THRESHOLDS, W = FC.WEIGHTS, N = FC.NAMES, pc = (v) => `${Math.round(v * 100)} %`;

    /* --- Estado --- */
    const same = Boolean(saved.active) && !FC.getActive();
    const head = {
      running: ['Calculando…', pill('na', 'En proceso')],
      calibrated: same ? ['Revisada con tu historial: los umbrales iniciales ya estaban bien', pill('ok', 'Usando umbrales iniciales (revisados)')] : ['Calibrada con tu historial', pill('ok', 'Usando umbrales calibrados')],
      learning: ['Aprendiendo: todavía no hay suficiente historial', pill('warning', 'Usando umbrales iniciales')],
      ready: ['Lista para calibrar', pill('na', 'Usando umbrales iniciales')]
    }[st.key];
    const when = saved.active && saved.active.at ? ` · última recalibración: ${esc(diaDe(saved.active.at))}${saved.active.monthsUsed ? ` con ${saved.active.monthsUsed} meses` : ''}` : '';
    const bar = `<p class="qfc__months"><label for="qfc-bar">Meses cerrados con venta real: <b>${closed}</b> de <b>${min}</b> necesarios para calibrar</label><progress id="qfc-bar" class="qfc__bar" max="${min}" value="${Math.min(closed, min)}">${closed} de ${min}</progress></p>`;
    const prog = busy
      ? `<div class="qcal__run" role="status" aria-live="polite"><label for="qcal-progress">Comparando cada cierre estimado contra lo que el mes cerró de verdad</label>
          <progress id="qcal-progress" class="qfc__bar" max="${Math.max(1, run.total)}" value="${run.done}">${run.done} de ${run.total}</progress>
          <span id="qcal-progress-txt" class="field__hint">${esc(run.total ? `${run.done} de ${run.total} comparaciones` : (run.msg || 'Contando los meses cerrados…'))}</span>
          <div class="btn-row"><button type="button" class="btn" data-action="cal-cancel">Cancelar</button></div></div>` : '';
    const dis = (cond) => (cond ? ' disabled' : '');
    const canRun = !busy && closed >= min;
    const whyRun = busy ? 'Ya hay un cálculo en proceso.' : `Todavía no hay suficiente historial: faltan ${falta} ${falta === 1 ? 'mes cerrado' : 'meses cerrados'}.`;
    const whyReset = busy ? 'Ya hay un cálculo en proceso.' : 'Ya se usan los umbrales iniciales: no hay nada que restablecer.';
    const ttl = (cond, why) => (cond ? ` title="${esc(why)}"` : '');
    const btns = `<div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="cal-run"${dis(!canRun)}${ttl(!canRun, whyRun)}>${closed >= min || busy ? 'Recalibrar ahora' : `Recalibrar ahora (faltan ${falta} ${falta === 1 ? 'mes' : 'meses'})`}</button>
        <button type="button" class="btn" data-action="cal-analyze"${dis(!canRun)}${ttl(!canRun, whyRun)}>Actualizar el análisis sin cambiar nada</button>
        <button type="button" class="btn" data-action="cal-reset"${dis(busy || !saved.active)}${ttl(busy || !saved.active, whyReset)}>Volver a los umbrales iniciales</button></div>`;
    const sw = `<div class="field field--check"><label class="qcal__sw"><input type="checkbox" data-action="cal-auto"${saved.auto ? ' checked' : ''}${dis(busy)}${ttl(busy, 'Ya hay un cálculo en proceso.')}> Recalibrar sola cuando cierra cada mes</label>
        <p class="field__hint">Apagada por defecto. Si la enciendes, al abrir la app y haber un mes cerrado nuevo (con ${min} meses o más) se vuelve a comparar y, si hace falta, se mueven los umbrales. Cada cambio queda en el historial y se puede deshacer.</p></div>`;
    let msg = '';
    if (run.status === 'error') msg = `<p class="qcal__msg qcal__msg--bad" role="alert">No se pudo calcular: ${esc(run.error)}. No se cambió nada.</p>`;
    else if (run.msg && !busy) msg = `<p class="qcal__msg" role="status">${esc(run.msg)}</p>`;
    else if (last && last.status === 'insufficient') {
      const unusable = last.closed > last.monthsUsed;
      msg = `<p class="qcal__msg" role="status">${unusable
        ? `Hay ${last.closed} meses cerrados, pero solo ${last.monthsUsed} se pudieron comparar contra un cierre estimado.${sinEstimar(last)} Se necesitan ${last.needed}; los umbrales siguen siendo los iniciales.`
        : `Todavía no hay suficiente historial: ${last.monthsUsed} de ${last.needed} meses cerrados. Los umbrales siguen siendo los iniciales.`}</p>`;
    } else if (last && last.status === 'ok') {
      msg = `<p class="qcal__msg" role="status">${last.changes.length ? `Se compararon ${last.monthsUsed} meses (${last.cases} casos). ${last.changes.length === 1 ? 'Cambió 1 umbral' : `Cambiaron ${last.changes.length} umbrales`}: ${esc(last.changes.map((c) => c.text).join('; '))}.` : `Se compararon ${last.monthsUsed} meses (${last.cases} casos): los umbrales actuales ya estaban bien, no se movió nada.`}${sinEstimar(last)}</p>`;
    }
    const estado = `<section class="qcal__sec" aria-labelledby="qcal-h-estado"><div class="subhead"><h3 class="panel__title" id="qcal-h-estado">Estado: ${esc(head[0])}</h3>${head[1]}</div>
        <p class="field__hint">${closed} meses cerrados con venta real${when}.</p>${bar}${prog}${msg}${btns}${sw}</section>`;

    /* --- Qué significa cada etiqueta en tu historial --- */
    const samples = cal.cache ? cal.cache.samples : null, an = CAL.analysisOf(saved, samples);
    const TG = CAL.TARGETS;
    let tabla;
    if (!an) {
      tabla = `<p class="field__hint">${closed >= min ? 'Aún no hay un análisis guardado en este navegador. «Actualizar el análisis sin cambiar nada» lo calcula (tarda unos segundos) y no mueve ningún umbral.' : `Todavía no se puede medir: faltan ${falta} ${falta === 1 ? 'mes cerrado' : 'meses cerrados'}.`}</p>`;
    } else {
      const lab = { alta: ['Alta', 'ok'], media: ['Media', 'warning'], baja: ['Baja', 'error'] };
      const rows = ['alta', 'media', 'baja'].map((l) => {
        const g = an.labels[l], few = !g || g.n < CAL.MIN_CASES;
        let band, verdict;
        if (l === 'baja') {
          band = `> ${pc(TG.media)}`;
          const ref = an.labels.media;
          verdict = few ? `Pocos casos (${g ? g.n : 0})` : (ref && ref.n >= CAL.MIN_CASES && !(g.p80 > ref.p80)) ? `No: Baja no se equivocó más que Media (${pc1(g.p80)} contra ${pc1(ref.p80)})` : `Sí: Baja sí avisa que la estimación es más débil (${pc1(g.p80)})`;
        } else {
          band = `≤ ${pc(TG[l])}`;
          verdict = few ? `Pocos casos (${g ? g.n : 0}) para decir algo` : g.p80 <= TG[l] ? `Sí: 8 de 10 quedan en ${pc1(g.p80)}` : g.p80 <= TG[l] * 1.25 ? `Casi: 8 de 10 quedan en ${pc1(g.p80)}` : `No: 8 de 10 quedan en ${pc1(g.p80)}`;
        }
        return `<tr><th scope="row">${pill(lab[l][1], lab[l][0])}</th><td class="num">${g ? g.n : 0}</td><td class="num">${few ? '—' : pc1(g.typical)}</td><td class="num">${few ? '—' : pc1(g.p80)}</td><td class="num">${esc(band)}</td><td>${esc(verdict)}</td></tr>`;
      }).join('');
      tabla = `<div class="table-wrap"><table class="table ds-table" aria-label="Qué pasó cada vez que salió Alta, Media o Baja"><thead><tr><th scope="col">Etiqueta</th><th scope="col" class="num">Veces que salió</th><th scope="col" class="num">Error típico del cierre</th><th scope="col" class="num">En 8 de 10 casos, menos de</th><th scope="col" class="num">Banda propuesta</th><th scope="col">¿Se cumple?</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="field__hint">${an.source === 'saved' ? `Resultado guardado de la última recalibración (${an.months} meses, ${an.cases} casos). ` : `${an.months} meses, ${an.cases} casos. `}«Veces que salió» cuenta cada mes cerrado en cada corte (días 5, 10, 15, 20 y 25). Las bandas de ${pc(TG.alta)} y ${pc(TG.media)} son una propuesta inicial, no una garantía: lo que cuenta es lo que muestra tu historial.</p>`;
    }
    const significado = `<section class="qcal__sec" aria-labelledby="qcal-h-sig"><h3 class="panel__title" id="qcal-h-sig">Qué significa cada etiqueta en tu historial</h3>
        <p class="field__hint">Cada vez que el cierre estimado salió Alta, Media o Baja, se compara con lo que el mes cerró de verdad.</p>${tabla}</section>`;

    /* --- Error según el día del mes --- */
    let corte = '';
    if (an && an.byCut) {
      const cuts = CAL.CUTS.map((c) => an.byCut[c]).filter((x) => x && Number.isFinite(x.typical));
      if (cuts.length) {
        const mx = Math.max(...cuts.map((x) => x.typical), 0.0001);
        const alt = cuts.map((x) => `día ${x.cut}: ${pc1(x.typical)}`).join('; ');
        corte = `<section class="qcal__sec" aria-labelledby="qcal-h-cut"><h3 class="panel__title" id="qcal-h-cut">Error del cierre estimado según el día</h3>
          <p class="field__hint">Cuanto más avanza el mes, menos se proyecta y menos se equivoca la estimación (error típico).</p>
          <svg class="qcal__bars" viewBox="0 0 400 190" role="img" aria-label="Error típico del cierre estimado. ${esc(alt)}.">${cuts.map((x, i) => { const h = Math.max(4, Math.round((x.typical / mx) * 120)), cx = i * 80 + 40; return `<rect class="qcal__rect" x="${cx - 26}" y="${150 - h}" width="52" height="${h}"></rect><text class="qcal__val" x="${cx}" y="${150 - h - 8}" text-anchor="middle">${pc1(x.typical)}</text><text class="qcal__lab" x="${cx}" y="172" text-anchor="middle">Día ${x.cut}</text>`; }).join('')}<line class="qcal__axis" x1="8" y1="150" x2="392" y2="150"></line></svg></section>`;
      }
    }

    /* --- Umbrales --- */
    const ini = FC.INITIAL, cur = FC.getActive() || ini;
    const trow = ['cobAlta', 'cobMedia', 'estAlta', 'estMedia', 'rngAlta', 'rngMedia'].map((k) => {
      const fct = { cobAlta: 'cobertura', cobMedia: 'cobertura', estAlta: 'estabilidad', estMedia: 'estabilidad', rngAlta: 'rango', rngMedia: 'rango' }[k];
      const changed = Math.abs(cur[k] - ini[k]) > 1e-9;
      return `<tr><th scope="row">${esc(N[fct])}</th><td>${k.endsWith('Alta') ? 'Alta' : 'Media'}</td><td class="num">${esc(CAL.fmtThr(k, ini[k]))}</td><td class="num">${changed ? `<strong>${esc(CAL.fmtThr(k, cur[k]))}</strong> <span class="field__hint">cambió</span>` : 'sin cambio'}</td></tr>`;
    }).join('');
    const umbrales = `<section class="qcal__sec" aria-labelledby="qcal-h-umb"><h3 class="panel__title" id="qcal-h-umb">Umbrales que se movieron</h3>
        <div class="table-wrap"><table class="table ds-table" aria-label="Umbrales iniciales y en uso"><thead><tr><th scope="col">Factor</th><th scope="col">Nivel</th><th scope="col" class="num">Inicial</th><th scope="col" class="num">En uso</th></tr></thead><tbody>${trow}
          <tr><th scope="row">${esc(N.historia)}</th><td>—</td><td class="num">≥ ${T.hisAlta} días</td><td class="num">no se calibra</td></tr></tbody></table></div>
        <p class="field__hint">Solo se mueven los umbrales de estos tres factores. Los pesos de los cuatro factores, la regla que los combina y la historia disponible no cambian.</p></section>`;

    /* --- Historial --- */
    const hist = saved.history, undoIdx = hist.map((h) => !h.undone && h.kind !== 'undo').lastIndexOf(true);
    const titulo = (h) => (h.kind === 'reset' ? 'Vuelta a los umbrales iniciales' : h.kind === 'undo' ? 'Cambio deshecho' : `${h.trigger === 'auto' ? 'Recalibración automática' : 'Recalibración manual'} · ${h.monthsUsed} meses${h.month ? ` (al cerrar ${esc(mesDe(h.month))})` : ''}`);
    const items = hist.length ? hist.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => `<li class="qcal__h"><div class="qcal__ht"><b>${titulo(h)} · ${esc(diaDe(h.at))}</b>${h.undone ? ' <span class="field__hint">(deshecho)</span>' : ''}<span class="field__hint">${esc((h.text || []).join('. '))}</span></div>
        ${i === undoIdx ? '<button type="button" class="btn" data-action="cal-undo">Deshacer este cambio</button>' : ''}</li>`).join('')
      : '<li class="field__hint">Todavía no hay recalibraciones. Cada cambio de umbrales quedará aquí con su fecha y los meses usados.</li>';
    const historial = `<section class="qcal__sec" aria-labelledby="qcal-h-hist"><h3 class="panel__title" id="qcal-h-hist">Historial de recalibraciones</h3><ul class="qcal__hist">${items}</ul></section>`;

    /* --- Regla vigente --- */
    const rrows = [
      ['cobertura', `≥ ${pc(T.cobAlta)}`, `≥ ${pc(T.cobMedia)}`, 'menos'],
      ['estabilidad', `± ${pc(T.estAlta)} o menos`, `± ${pc(T.estMedia)} o menos`, 'más'],
      ['rango', `menos de ${pc(T.rngAlta)}`, `menos de ${pc(T.rngMedia)}`, 'más'],
      ['historia', `≥ ${T.hisAlta} días`, `${T.hisMedia} a ${T.hisAlta - 1} días`, 'menos']
    ].map(([k, a, me, b]) => `<tr><th scope="row">${esc(N[k])}</th><td class="num">${pc(W[k])}</td><td>${esc(a)}</td><td>${esc(me)}</td><td>${esc(b)}</td></tr>`).join('');
    const regla = `<section class="qcal__sec" aria-labelledby="qcal-h-regla"><h3 class="panel__title" id="qcal-h-regla">Cómo se decide la etiqueta${saved.active ? ' (con los umbrales calibrados)' : ' (umbrales iniciales)'}</h3>
        <div class="table-wrap"><table class="table ds-table" aria-label="Regla de la confianza del cierre estimado"><thead><tr><th scope="col">Factor</th><th scope="col" class="num">Peso</th><th scope="col">Alta</th><th scope="col">Media</th><th scope="col">Baja</th></tr></thead><tbody>${rrows}</tbody></table></div>
        <p class="field__hint">Alta = 1, Media = 0.5, Baja = 0; promedio ponderado. Desde ${Math.round(T.cutAlta * 100)} % es Alta y desde ${Math.round(T.cutMedia * 100)} % es Media. Con un factor en Baja no pasa de Media; con dos o más es Baja. La etiqueta mide qué tan sólida es la base de la estimación, no la probabilidad de acertar.</p></section>`;

    const salvaguardas = `<section class="qcal__sec" aria-labelledby="qcal-h-salv"><h3 class="panel__title" id="qcal-h-salv">Para que no se mueva a ciegas</h3><ul class="qcal__list">
        <li>No calibra con menos de ${min} meses cerrados; mientras tanto, umbrales iniciales.</li>
        <li>Cada cambio queda en el historial con la fecha y los meses usados, y se puede deshacer.</li>
        <li>Solo cambia la etiqueta de confianza; no toca el forecast ni ninguna cifra.</li>
        <li>Con pocos meses los umbrales pueden ajustarse a casualidades de esos meses; por eso conviene revisarlos cada mes y deshacer lo que no convenza.</li>
        <li>Solo mide el Total digital y los cierres de mes. La etiqueta por canal y la del cierre anual no se han medido.</li>
        <li>Se guarda en este navegador. En otro navegador o equipo se calcula de nuevo con «Recalibrar ahora»; el interruptor se enciende por separado.</li></ul></section>`;

    return `${estado}${significado}${corte}${umbrales}${historial}${regla}${salvaguardas}`;
  }

  const USER_OPEN = {};   // lo que la persona abrió o cerró a mano; manda sobre el paso abierto por omisión
  let eventsOn = false;

  function applyOpen(activeN) {
    document.querySelectorAll('#view-calidad details.qstep').forEach((d) => {
      const n = d.dataset.step, want = USER_OPEN[n] !== undefined ? USER_OPEN[n] : Number(n) === activeN;
      if (d.open !== want) d.open = want;
    });
  }

  function goStep(n) {
    USER_OPEN[n] = true;
    const d = document.getElementById(`qstep-${n}`); if (!d) return;
    d.open = true;
    if (d.scrollIntoView) d.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const sum = document.getElementById(`qstep-${n}-sum`); if (sum && sum.focus) sum.focus({ preventScroll: true });
  }

  function bindEvents() {
    if (eventsOn) return; eventsOn = true;
    document.addEventListener('click', (e) => {
      const ext = e.target.closest && e.target.closest('[data-qstep]');   // enlace desde otra pantalla: deja que navegue y abre ese paso
      if (ext) USER_OPEN[Number(ext.dataset.qstep)] = true;
      const go = e.target.closest && e.target.closest('[data-qgo]');
      if (go) { e.preventDefault(); goStep(Number(go.dataset.qgo)); return; }
      const sum = e.target.closest && e.target.closest('#view-calidad summary.qstep__sum');
      if (sum) { const d = sum.parentElement; USER_OPEN[d.dataset.step] = !d.open; }   // el clic aún no ha cambiado `open`
    });
  }

  function renderSteps(state, q) {
    const esc = H().esc, pill = H().pill;
    const m = stepsModel(state, q), r = FP.qualitySteps.build(m);
    const now = r.now;
    const guide = now
      ? `<section class="qnow" aria-label="Qué hacer ahora"><div class="qnow__txt"><span class="qnow__k">Qué hacer ahora</span><strong class="qnow__t">Paso ${now.n} · ${esc(now.question)}</strong><span class="qnow__d">${esc(now.text)}</span></div>
          <div class="btn-row"><button type="button" class="btn btn--primary" data-qgo="${now.n}" aria-controls="qstep-${now.n}">Ir al paso ${now.n}</button>${now.view ? `<a class="btn" href="#${esc(now.view)}" data-nav="${esc(now.view)}">Ir a Carga</a>` : ''}</div></section>`
      : `<section class="qnow qnow--ok" aria-label="Qué hacer ahora"><div class="qnow__txt"><span class="qnow__k">Qué hacer ahora</span><strong class="qnow__t">Todo en orden</strong><span class="qnow__d">Los pasos 1 a 4 están en Listo. El paso 5 solo se mira: no pide nada todavía.</span></div></section>`;
    const strip = `<ol class="qsteps" aria-label="Los cinco pasos">${r.steps.map((s) => `<li class="qsteps__i"><button type="button" class="qsteps__b" data-qgo="${s.n}" aria-controls="qstep-${s.n}" aria-label="Ir al paso ${s.n}: ${esc(s.question)}. ${esc(s.label)}"><span class="qsteps__n">Paso ${s.n}</span><b class="qsteps__q">${esc(s.question)}</b>${pill(s.tone, s.label)}</button></li>`).join('')}</ol>`;
    $('quality-guide').innerHTML = `${guide}${strip}`;
    r.steps.forEach((s) => {
      const el = $(`qstep-${s.n}-sum`); if (!el) return;
      el.innerHTML = `<span class="qstep__top"><b class="qstep__title">${s.n} · ${esc(s.question)}</b>${pill(s.tone, s.label)}</span>
        <span class="qstep__line"><b>Qué mirar:</b> ${esc(s.look)} <b>Qué hacer:</b> ${esc(s.todo)}</span>
        ${s.note ? `<span class="qstep__note">${esc(s.note)}</span>` : ''}
        <span class="qstep__chev" aria-hidden="true"></span>`;
    });
    if ($('quality-forecast')) $('quality-forecast').innerHTML = calibrationBlock(state, m);
    bindEvents();
    applyOpen(now ? now.n : 0);
  }

  /** Para pruebas y para quien quiera ver todo junto: abre (o cierra) todos los pasos y lo recuerda. */
  function openAll(open) {
    const want = open !== false;
    for (let n = 1; n <= 5; n++) USER_OPEN[n] = want;
    document.querySelectorAll('#view-calidad details.qstep').forEach((d) => { d.open = want; });
  }

  function render(state) {
    const q = state.quality;
    $('quality-banner').innerHTML = banner(q);
    $('quality-summary').innerHTML = summaryTable(q);
    $('quality-coverage').innerHTML = coverageDetail(state, q);
    $('quality-issues').innerHTML = issuesByType(q);
    // Fase A · salud, cuarentena y registro de importaciones
    if ($('quality-health')) $('quality-health').innerHTML = healthBlock(state);
    if ($('quality-quarantine')) $('quality-quarantine').innerHTML = quarantineBlock(state);
    if ($('quality-log')) $('quality-log').innerHTML = logBlock(state);
    if ($('quality-analyses')) $('quality-analyses').innerHTML = analysesBlock(state);
    // Fase 3.2 · el recorrido de cinco pasos (si falla, la pantalla de siempre sigue completa)
    try { if (FP.qualitySteps && $('quality-guide')) renderSteps(state, q); } catch (e) { if (typeof console !== 'undefined') console.error('Calidad de datos paso a paso:', e); document.querySelectorAll('#view-calidad details.qstep').forEach((d) => { d.open = true; }); }
  }

  if (typeof document !== 'undefined') bindEvents();   // también atiende los enlaces «paso 5» que salen desde Configuración

  FP.qualityView = { render, openAll };
})(typeof window !== 'undefined' ? window : globalThis);
