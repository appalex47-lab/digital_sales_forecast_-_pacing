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
    if (q.status === 'ready') why.push('Sin rechazos, errores, duplicados ni huecos de fechas o canales.');
    return `<div class="banner banner--${QPILL[q.status]}" role="status">
      <p class="banner__title">${esc(q.statusText)}</p>
      <p class="banner__text">${esc(why.join(' '))}</p>
    </div>`;
  }

  function summaryTable(q) {
    const esc = H().esc, pill = H().pill;
    const types = C().dataTypeIds.map((t) => q.byType[t]);
    const row = (label, get, fmt = (v) => F().integer(v), totalVal = undefined) => `<tr><th scope="row">${esc(label)}</th>
      ${types.map((s) => `<td class="num">${s.status === 'empty' ? '—' : fmt(get(s))}</td>`).join('')}
      <td class="num">${totalVal === undefined ? '' : totalVal === null ? '—' : fmt(totalVal)}</td></tr>`;
    const tt = q.totals;
    return `<div class="table-wrap"><table class="table table--matrix">
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
        ${row('Canales sin datos', (s) => s.missingChannels, undefined, tt.missingChannels)}
        ${row('Fechas con algún canal faltante', (s) => s.datesWithMissingChannels)}
        ${row('Cobertura temporal', (s) => s.coverage.pct, (v) => F().percent(v, 1))}
        <tr><th scope="row">Estado</th>${types.map((s) => `<td class="num">${pill(QPILL[s.status], QTEXT()[s.status])}</td>`).join('')}
          <td class="num">${pill(QPILL[q.status], q.statusText)}</td></tr>
      </tbody></table></div>`;
  }

  function coverageDetail(state, q) {
    const esc = H().esc;
    const t = state.qualityType;
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
        <div><h4>Por canal</h4><div class="table-wrap"><table class="table">
          <thead><tr><th>Canal</th><th class="num">Días</th><th class="num">Faltan</th><th class="num">Cobertura</th><th><span class="visually-hidden">Barra</span></th></tr></thead>
          <tbody>${chRows}</tbody></table></div></div>
        <div><h4>Por métrica</h4><div class="table-wrap"><table class="table">
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
    if (!rows.length) return '<p class="note note--ok">No hay errores ni advertencias registrados.</p>';
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Tipo</th><th>Severidad</th>${C().dataTypeIds.map((t) => `<th class="num">${esc(C().dataTypes[t].label)}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${rows.map(([type, n]) => {
        const sev = C().errorTypes[type].severity;
        return `<tr><td>${esc(C().errorTypes[type].label)}<span class="cell-sub">${esc(type)}</span></td>
          <td>${pill(sev, sev === 'error' ? 'Error' : 'Advertencia')}</td>
          ${C().dataTypeIds.map((t) => `<td class="num">${n[t] ? F().integer(n[t]) : '—'}</td>`).join('')}
          <td class="num">${F().integer(n.total)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="field__hint">Algunas reglas cambian la severidad por defecto (p. ej. pedidos con volumen 0 es error; pedidos no enteros es advertencia). El detalle fila por fila se exporta en errores JSON.</p>`;
  }

  function render(state) {
    const q = state.quality;
    $('quality-banner').innerHTML = banner(q);
    $('quality-summary').innerHTML = summaryTable(q);
    $('quality-coverage').innerHTML = coverageDetail(state, q);
    $('quality-issues').innerHTML = issuesByType(q);
  }

  FP.qualityView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
