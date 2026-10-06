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

  function healthBlock(state) {
    const esc = H().esc, hv0 = FP.dataHealth.overview(state.store);
    const prod = FP.dataHealth.products(state.productQuality);   // Productos: mismos componentes, calculados desde lo que guarda cada lote
    const hv = { collections: [...hv0.collections, ...prod], score: null };
    { const sc = hv.collections.filter((c) => c.score !== null); hv.score = sc.length ? Math.round(sc.reduce((a, c) => a + c.score, 0) / sc.length) : null; if (hv.score === 100 && sc.some((c) => c.score < 100)) hv.score = 99; }
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
        </details></section>`;
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
  function analysesBlock(state) {
    const esc = H().esc, sx = state.dx.settings;
    // sin mes elegido en Diagnóstico: el último mes con venta real (o el mes actual)
    const lastReal = FP.dataStore.records(state.store, 'actual').map((r) => r.date).sort().pop();
    const pType = sx.periodKey ? (sx.periodType || 'month') : 'month';
    const rg = FP.app.periodRange(pType, sx.periodKey || (lastReal || new Date().toISOString()).slice(0, 7));
    const cur = rg ? { start: rg.from, end: rg.to } : null;
    if (!cur) return '<div class="panel__body"><p class="field__hint">Elige un periodo en Diagnóstico.</p></div>';
    const kind = sx.comparison === 'actual_vs_previous' ? 'previous' : 'yoy';
    const list = FP.availability.analyses(state.store, { current: cur, channel: sx.channel || 'total', comparisonKind: kind });
    const ST = { available: ['ok', 'Disponible'], partial: ['warning', 'Parcial'], missing: ['na', 'Falta información'], unavailable: ['na', 'No se puede'], unavailable_source: ['na', 'Fuente no cargada'],
      invalid: ['error', 'Datos inválidos'], quarantined: ['warning', 'En cuarentena'], incomplete_period: ['warning', 'Periodo incompleto'], non_comparable: ['warning', 'No comparable'], not_applicable: ['na', 'No aplica'] };
    const okN = list.filter((a) => a.status === 'available').length, noN = list.filter((a) => ['missing', 'unavailable', 'unavailable_source'].includes(a.status)).length;
    const sum = `<p class="analyses__sum"><strong>${okN} de ${list.length}</strong> análisis disponibles · <strong>${list.length - okN - noN}</strong> con límites (parciales, periodo incompleto o no comparables) · <strong>${noN}</strong> sin la información necesaria.</p>`;
    return `${sum}<div class="table-wrap"><table class="table ds-table" aria-label="Qué puedes analizar">
      <thead><tr><th scope="col">Análisis</th><th scope="col">Estado</th><th scope="col">Por qué</th><th scope="col">Qué hacer</th></tr></thead>
      <tbody>${list.map((a) => { const [t, l] = ST[a.status] || ['na', a.status]; const r = a.recommendations;
        return `<tr><th scope="row">${esc(a.label)}</th><td>${H().pill(t, l)}</td><td class="wrap">${r.length ? r.slice(0, 2).map((x) => esc(x.text)).join(' ') : `Disponible para ${esc(cur.start)} a ${esc(cur.end)}.`}</td><td class="wrap">${r.length ? esc(r[0].todo) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
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
  }

  FP.qualityView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
