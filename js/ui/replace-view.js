/**
 * replace-view.js — «Reemplazar un archivo ya cargado»: candidatos, comparación y bloque de la revisión.
 * Usa FP.replacePlan (puro). item.replace = { batchId: id|null, confirmed: bool }.
 *   - Google Sheets: «Actualizar» deja elegido el archivo anterior con el mismo nombre.
 *   - Archivo suelto: la persona elige cuál reemplazar (por omisión ninguno: se agrega como antes).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format, H = () => FP.ui.helpers;
  const RP = () => FP.replacePlan;

  const isProducts = (item) => item.staged.dataType === 'products';
  const rules = (state) => ({ rowsDropPct: (state.settings.replaceRowsDropPct ?? 20) / 100, revenueChangePct: (state.settings.replaceRevenuePct ?? 5) / 100 });

  /** Archivos ya cargados del mismo tipo que se pueden reemplazar (más recientes primero). */
  function candidates(state, item) {
    if (isProducts(item)) {
      const kind = item.staged.kind || 'sales';
      return (state.productQuality || []).filter((b) => (b.kind || 'sales') === kind)
        .map((b) => ({ id: b.id, fileName: b.fileName, importedAt: b.importedAt, rows: b.summary.accepted, dateMin: b.summary.dateMin, dateMax: b.summary.dateMax }))
        .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
    }
    const t = item.staged.dataType;
    return (state.store[t] ? state.store[t].batches : []).map((b) => ({ id: b.id, fileName: b.fileName, importedAt: b.importedAt, rows: b.accepted, dateMin: null, dateMax: null }))
      .sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  }
  /** El archivo anterior que corresponde a este (mismo nombre): es lo que «Actualizar» de una hoja ligada reemplaza. */
  function defaultFor(state, item) {
    const c = candidates(state, item).find((x) => x.fileName === item.staged.fileName);
    return c ? c.id : null;
  }

  function oldSummary(state, item, id) {
    if (isProducts(item)) { const b = (state.productQuality || []).find((x) => x.id === id); return b ? RP().fromProductBatch(b) : null; }
    const col = state.store[item.staged.dataType];
    if (!col.batches.some((b) => b.id === id)) return null;
    return RP().fromRecords(col.records.filter((r) => r.provenance && r.provenance.batchId === id));
  }
  function newSummary(state, item) {
    const r = item.result;
    if (!r || r.remote) return null;   // archivo grande en el Worker: las filas no están en la página
    if (isProducts(item)) {
      const d = r.draft; if (!d) return null;
      const dates = [...d.dates].sort();
      return RP().fromProductBatch({ summary: { accepted: r.summary.accepted, dateMin: dates[0] || null, dateMax: dates[dates.length - 1] || null, dayRev: d.summary && d.summary.dayRev } });
    }
    const sel = FP.importer.selectRows(r, { includeErrorRows: state.settings.includeErrorRows });
    return RP().fromRecords(sel.map((x) => x.record));
  }

  /** → null (sin reemplazo) | { cand, noCompare, cmp, assess } ; se guarda en item._rp mientras no cambie nada. */
  function planFor(state, item) {
    const id = item.replace && item.replace.batchId;
    if (!id) return null;
    const cand = candidates(state, item).find((c) => c.id === id);
    if (!cand) return null;
    const ruleSig = `${state.settings.replaceRowsDropPct}|${state.settings.replaceRevenuePct}`;
    const sig = `${id}|${item.result ? item.result.sig || item.result : ''}|${state.settings.includeErrorRows}|${state.store[item.staged.dataType] ? state.store[item.staged.dataType].records.length : 0}`;
    if (item._rp && item._rp.sig === sig) { item._rp.assess = RP().assess(item._rp.cmp || { oldRows: 0, newRows: 0, oldRange: [], newRange: [], overlapPct: null }, rules(state)); if (item._rp.noCompare) item._rp.assess = noCompareAssess(); return item._rp; }
    const o = oldSummary(state, item, id), n = newSummary(state, item);
    let out;
    if (!o || !n) out = { sig, cand, noCompare: true, cmp: null, assess: noCompareAssess() };
    else { const cmp = RP().compare(o, n); out = { sig, cand, noCompare: false, cmp, assess: RP().assess(cmp, rules(state)) }; }
    item._rp = out;
    return out;
  }
  const noCompareAssess = () => ({ needsConfirm: true, flags: [{ id: 'nocompare', text: 'Este archivo es muy grande para compararlo antes de guardar: no puedo mostrarte qué cambia. Confirma sólo si estás seguro de que es la versión correcta.' }] });

  /** true si hay reemplazo elegido, necesita confirmación y todavía no se confirmó. */
  function blocked(state, item) {
    if (!item.replace || !item.replace.batchId) return false;
    const p = planFor(state, item);
    return Boolean(p && p.assess.needsConfirm && !item.replace.confirmed);
  }

  function savedWarning(state, cmp) {
    if (!cmp) return '';
    const changes = (cmp.changed || 0) + (cmp.removed || 0) > 0 || (cmp.overlapPct !== null && cmp.overlapPct !== 0);
    if (!changes) return '';
    const nf = state.fc && state.fc.registry ? state.fc.registry.versions.length : 0;
    const nr = state.rf && state.rf.registry && state.rf.registry.versions ? state.rf.registry.versions.length : 0;
    if (!nf && !nr) return '';
    return `<p class="note note--warning">Ojo: tienes ${nf ? `${nf} pronóstico${nf === 1 ? '' : 's'} guardado${nf === 1 ? '' : 's'}` : ''}${nf && nr ? ' y ' : ''}${nr ? `${nr} repronóstico${nr === 1 ? '' : 's'} guardado${nr === 1 ? '' : 's'}` : ''} del año ${state.year}. Se quedan como estaban, pero se hicieron con cifras que este reemplazo cambia; compáralos con la venta nueva antes de usarlos.</p>`;
  }

  function block(state, item) {
    const esc = H().esc, f = F();
    const list = candidates(state, item);
    if (!list.length) return '';
    const rep = item.replace || { batchId: null };
    const opts = `<option value="">No reemplazar (agregar como archivo nuevo)</option>` + list.map((c) =>
      `<option value="${esc(c.id)}" ${c.id === rep.batchId ? 'selected' : ''}>${esc(c.fileName)} · ${f.integer(c.rows)} filas · cargado ${esc(String(c.importedAt || '').slice(0, 10))}</option>`).join('');
    const sel = `<div class="field"><label for="rep-pick">Reemplazar un archivo ya cargado</label>
      <select id="rep-pick" data-action="replace-pick">${opts}</select>
      <span class="field__hint">Reemplazar quita lo que vino de ese archivo y carga este en su lugar. Los datos de otros archivos no se tocan.${isProducts(item) ? ' En productos el reemplazo no se puede deshacer; conserva el archivo anterior.' : ''}</span></div>`;
    const p = planFor(state, item);
    if (!p) return `<div class="replace-block">${sel}</div>`;
    const c = p.cmp;
    let detail = '';
    if (c) {
      const parts = [];
      if (c.added !== null) parts.push(`<li><strong>${f.integer(c.added)}</strong> filas nuevas</li><li><strong>${f.integer(c.changed)}</strong> con valores modificados</li><li><strong>${f.integer(c.removed)}</strong> filas que ya no vienen (se quitan)</li><li>${f.integer(c.same)} iguales</li>`);
      else parts.push(`<li>Antes: <strong>${f.integer(c.oldRows)}</strong> filas · ahora: <strong>${f.integer(c.newRows)}</strong> filas</li>`);
      parts.push(`<li>Periodo antes: ${esc(c.oldRange[0] || '—')} a ${esc(c.oldRange[1] || '—')} · ahora: ${esc(c.newRange[0] || '—')} a ${esc(c.newRange[1] || '—')}</li>`);
      if (c.overlapPct !== null) parts.push(`<li>Venta de los ${f.integer(c.overlapDays)} días en común: ${f.currency(c.overlapOld)} → ${f.currency(c.overlapNew)} (${c.overlapPct > 0 ? '+' : ''}${(c.overlapPct * 100).toFixed(1)} %)</li>`);
      detail = `<ul class="replace-diff" data-replace-diff="1">${parts.join('')}</ul>`;
    }
    const same = c && c.added === 0 && c.changed === 0 && c.removed === 0;
    const flags = same ? '<p class="note" data-replace-same="1">La versión nueva es idéntica a la que ya está cargada: no hay nada que reemplazar. Puedes descartar el archivo.</p>'
      : p.assess.flags.length ? `<div class="note note--warning" data-replace-flags="1"><strong>Antes de reemplazar, confirma:</strong><ul>${p.assess.flags.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>
      <label><input type="checkbox" data-action="replace-confirm" ${rep.confirmed ? 'checked' : ''}> Entiendo el cambio y quiero reemplazar el archivo anterior</label></div>`
      : '<p class="note" data-replace-ok="1">Sin alertas: el reemplazo no pierde filas ni días y la venta de los días en común casi no cambia.</p>';
    return `<div class="replace-block">${sel}${detail}${flags}${savedWarning(state, c)}</div>`;
  }

  function undoBar(state) {
    const u = state.replace && state.replace.undo;
    if (!u) return '';
    return `<div class="note" data-replace-undo="1">Reemplazaste <strong>${H().esc(u.oldName)}</strong> por <strong>${H().esc(u.newName)}</strong>. <button type="button" class="btn btn--small" data-action="replace-undo">Deshacer reemplazo</button></div>`;
  }

  FP.replaceView = { candidates, defaultFor, planFor, blocked, block, undoBar, rules };
})(typeof window !== 'undefined' ? window : globalThis);
