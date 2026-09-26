/**
 * data-view.js — Vista "Datos normalizados" (Fase 1).
 * Explorador del modelo canónico, archivos importados y exportaciones.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const STATUS = { valid: ['ok', 'Válido'], warning: ['warning', 'Advertencia'], error: ['error', 'Error'] };
  const DAY_TYPE = { regular: 'Regular', holiday: 'Festivo', event: 'Evento', campaign: 'Campaña', special: 'Especial' };

  function filtered(state) {
    const f = state.dataFilters;
    return FP.dataStore.records(state.store, f.dataType).filter((r) =>
      (!f.channel || r.channel === f.channel) &&
      (f.status === 'all' || r.status === f.status) &&
      (!f.from || r.date >= f.from) &&
      (!f.to || r.date <= f.to)
    ).sort((a, b) => (a.date === b.date
      ? FP.dataModel.getChannel(a.channel).order - FP.dataModel.getChannel(b.channel).order
      : a.date < b.date ? -1 : 1));
  }

  function renderFilters(state) {
    const esc = H().esc;
    const f = state.dataFilters;
    $('data-filters').innerHTML = `
      <div class="field"><span class="field__hint">Tipo de dato</span>
        ${H().segmented('data-type', C().dataTypeIds.map((t) => [t, `${C().dataTypes[t].label} (${F().integer(state.store[t].records.length)})`]), f.dataType)}</div>
      <div class="field"><label for="df-channel" class="field__hint">Canal</label>
        <select id="df-channel" data-action="data-filter" data-key="channel"><option value="">Todos</option>
          ${C().channels.map((c) => `<option value="${c.id}" ${c.id === f.channel ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="df-status" class="field__hint">Estado</label>
        <select id="df-status" data-action="data-filter" data-key="status">
          ${[['all', 'Todos'], ['valid', 'Válidos'], ['warning', 'Con advertencias'], ['error', 'Con errores']].map(([v, l]) =>
            `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="df-from" class="field__hint">Desde</label>
        <input id="df-from" type="date" value="${esc(f.from || '')}" data-action="data-filter" data-key="from"></div>
      <div class="field"><label for="df-to" class="field__hint">Hasta</label>
        <input id="df-to" type="date" value="${esc(f.to || '')}" data-action="data-filter" data-key="to"></div>`;
  }

  function renderTable(state) {
    const esc = H().esc, pill = H().pill;
    const list = filtered(state);
    const size = C().import.pageSize;
    const pages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(state.dataFilters.page, pages);
    state.dataFilters.page = page;
    const slice = list.slice((page - 1) * size, page * size);
    const box = $('data-table');

    if (!list.length) {
      box.innerHTML = `<div class="empty"><strong>No hay registros con estos filtros</strong>${state.store[state.dataFilters.dataType].records.length
        ? 'Cambia los filtros para ver más registros.' : 'Importa un archivo de este tipo en Carga de datos.'}</div>`;
      return;
    }

    box.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Fecha</th><th>Canal</th><th>Tipo de día / segmento</th><th class="num">Venta</th><th class="num">Pedidos</th>
        <th class="num">Volumen</th><th class="num">CR</th><th class="num">AOV</th><th>Estado</th><th>Origen</th></tr></thead>
      <tbody>${slice.map((r) => {
        const ch = FP.dataModel.getChannel(r.channel);
        const [cls, txt] = STATUS[r.status] || ['na', r.status];
        const extra = [r.event, r.holiday].filter(Boolean).join(', ');
        return `<tr>
          <td class="num">${esc(r.date)}</td>
          <td><span class="channel-cell" style="--dot:${ch.color}">${esc(ch.label)}</span></td>
          <td>${r.dimension ? `${esc((C().diagnostics.dimensions[r.dimension] || { label: r.dimension }).label)}: <strong>${esc(r.segment)}</strong>` : esc(DAY_TYPE[r.dayType] || r.dayType)}${extra ? `<span class="cell-sub">${esc(extra)}</span>` : ''}${r.extra ? `<span class="cell-sub">${esc(Object.entries(r.extra).map(([k, v]) => `${(C().importFields.find((f) => f.key === k) || { label: k }).label} ${F().integer(v)}`).join(', '))}</span>` : ''}</td>
          ${C().metricKeys.map((k) => FP.importView.metricCell(k, r.metrics[k])).join('')}
          <td>${pill(cls, txt)}${r.issueCounts.error + r.issueCounts.warning ? `<span class="cell-sub">${r.issueCounts.error} err., ${r.issueCounts.warning} adv.</span>` : ''}</td>
          <td><span class="cell-sub">${esc(r.provenance.fileName)}, fila ${r.provenance.row}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="pager">
        <span>${F().integer((page - 1) * size + 1)}–${F().integer(Math.min(page * size, list.length))} de ${F().integer(list.length)} registros</span>
        <div class="btn-row">
          <button type="button" class="btn btn--small" data-action="data-page" data-value="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
          <span class="num">Página ${page} de ${pages}</span>
          <button type="button" class="btn btn--small" data-action="data-page" data-value="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente</button>
        </div>
      </div>`;
  }

  function renderBatches(state) {
    const esc = H().esc;
    const list = FP.dataStore.allBatches(state.store).slice().sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
    $('data-batches').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Archivo</th><th>Tipo</th><th>Importado</th><th class="num">Filas</th><th class="num">Importadas</th>
        <th class="num">Rechazadas</th><th class="num">Errores</th><th class="num">Advertencias</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>${list.map((b) => `<tr>
        <td><strong>${esc(b.fileName)}</strong></td>
        <td>${esc(C().dataTypes[b.dataType].label)}</td>
        <td class="num">${esc(b.importedAt.slice(0, 16).replace('T', ' '))}</td>
        <td class="num">${F().integer(b.rowCount)}</td><td class="num">${F().integer(b.accepted)}</td><td class="num">${F().integer(b.rejected)}</td>
        <td class="num">${F().integer(b.issues.filter((i) => i.severity === 'error').length)}</td>
        <td class="num">${F().integer(b.issues.filter((i) => i.severity === 'warning').length)}</td>
        <td><button type="button" class="btn btn--small btn--quiet" data-action="remove-batch" data-id="${b.id}">Quitar</button></td>
      </tr>`).join('')}</tbody></table></div>
      <p class="field__hint">Quitar un archivo borra sus registros y su registro de errores. Úsalo para reemplazar una carga con duplicados o errores.</p>`
      : '<div class="empty"><strong>Sin archivos importados</strong>Los archivos aparecen aquí después de confirmar la importación.</div>';
  }

  function render(state) {
    renderFilters(state);
    renderTable(state);
    renderBatches(state);
    const t = state.dataFilters.dataType;
    const csvBtn = document.querySelector('[data-action="export-csv"]');
    if (csvBtn) csvBtn.textContent = `CSV normalizado: ${C().dataTypes[t].label}`;
  }

  FP.dataView = { render, filtered };
})(typeof window !== 'undefined' ? window : globalThis);
