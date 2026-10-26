/**
 * offer-view.js — pestaña «Ofertas recibidas» dentro de Promociones (propuesta B, fase 1B).
 * Solo pinta lo que guarda FP.offers; los cambios pasan por las acciones of-* de app.js. No calcula venta ni efecto.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const O = () => FP.offers;
  const $ = (id) => document.getElementById(id);
  const STATE_PILL = { received: 'warning', validated: 'ok', selected: 'ok', discarded: 'na' };
  const LEVEL_PILL = { error: 'error', warn: 'warning', ok: 'ok' };
  const PAGE = 60;
  const CAP = 1000;   // la lista se desliza (10 filas visibles); este tope solo protege la página

  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const pct = (d) => (d === null || d === undefined ? '—' : `${(d * 100).toFixed(1).replace(/\.0$/, '')} %`);
  const money = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
  const when = (at) => { try { const d = new Date(at); return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return ''; } };
  function field(id, label, html, hint) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`; }
  const input = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${H().esc(v === null || v === undefined ? '' : v)}" ${extra}>`;
  function selectHtml(id, items, cur, extra = '') { const esc = H().esc; return `<select id="${id}" ${extra}>${items.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
  const issueText = (codes) => codes.filter((c) => O().ISSUE[c].level !== 'info').map((c) => O().ISSUE[c].text).join(' · ');

  function counters(reg, an) {
    const c = { received: 0, validated: 0, selected: 0, discarded: 0 }; reg.offers.forEach((o) => { c[o.state] += 1; });
    const errors = reg.offers.filter((o) => o.state !== 'discarded' && O().levelOf(an.get(o.offerId) || []) === 'error').length;
    return `<div class="metric-grid">${Object.keys(c).map((k) => `<div class="metric-card"><span class="metric-card__label">${H().esc(O().STATE[k])}</span><strong class="metric-card__value num">${c[k]}</strong></div>`).join('')}
      <div class="metric-card"><span class="metric-card__label">Con error (sin descartar)</span><strong class="metric-card__value num">${errors}</strong></div></div>`;
  }

  function pendingHtml(of) {
    const esc = H().esc, pd = of.pending; if (!pd) return '';
    const b = pd.built, c = pd.campaign;
    const colList = b.columns ? Object.keys(b.columns).map((f) => `<li><strong>${esc(O().LABEL[f] || f)}</strong> ← «${esc(b.columns[f])}»</li>`).join('') : '';
    let preview = '';
    if (b.missing && b.missing.length) preview = `<div class="note note--warn" role="alert"><strong>No puedo usar esta hoja.</strong> Falta: ${b.missing.map(esc).join('; ')}. Elige otra hoja o revisa los encabezados.</div>`;
    else {
      const tmp = Object.assign(O().createRegistry(), { offers: b.offers.map((r, i) => Object.assign({}, r, { offerId: `V-${i}`, batchId: 'V', state: 'received' })) });
      const an = O().analyze(tmp); const lv = { error: 0, warn: 0, ok: 0 }; tmp.offers.forEach((o) => { lv[O().levelOf(an.get(o.offerId))] += 1; });
      const rows = tmp.offers.slice(0, 8).map((o) => `<tr><td class="num">${esc(o.sku)}</td><td>${esc(o.name)}</td><td>${esc(o.mechanic || o.program || '—')}</td><td class="num">${pct(o.discount)}${o.discountSource === 'calculated' ? ' <span class="cell-sub">calculado</span>' : ''}</td><td class="num">${money(o.finalPrice)}</td><td>${esc(issueText(an.get(o.offerId)) || '—')}</td></tr>`).join('');
      preview = `<p><strong>${b.offers.length}</strong> ofertas listas para guardar${b.rejected.length ? ` · <strong>${b.rejected.length}</strong> filas sin SKU (se omiten: ${b.rejected.slice(0, 8).map((r) => r.line).join(', ')}${b.rejected.length > 8 ? '…' : ''})` : ''} · ${lv.error} con error · ${lv.warn} con aviso · ${lv.ok} sin alertas.</p>
        <details><summary>Columnas que reconocí</summary><ul class="plain-list">${colList}</ul>${b.unknown.length ? `<p class="field__hint">No usadas: ${b.unknown.map(esc).join(', ')}</p>` : ''}</details>
        <div class="table-wrap"><table class="table ds-table"><thead><tr><th>SKU</th><th>Producto</th><th>Mecánica</th><th>% desc.</th><th>Precio final</th><th>Alertas</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="field__hint">Vista previa de las primeras 8. Nada se guarda hasta que pulses «Guardar».</p>`;
    }
    const sheetSel = pd.sheets && pd.sheets.length > 1 ? field('of-p-sheet', 'Hoja del archivo', selectHtml('of-p-sheet', pd.sheets.map((s) => [s, s]), pd.sheet, 'data-action="of-sheet"'), 'La hoja con las ofertas finales.') : '';
    return `<section class="panel" aria-labelledby="of-t-pend"><div class="panel__head"><div><h2 class="panel__title" id="of-t-pend">Revisar antes de guardar · ${esc(pd.fileName)}</h2>
      <p class="panel__desc">Revisa la vigencia y el origen; después guarda. El SKU es la columna Oracle sin el sufijo «AA».</p></div></div>
      <div class="panel__body"><div class="field-grid">${sheetSel}
        ${field('of-p-name', 'Nombre de la campaña', input('of-p-name', c.name, 'text', 'data-action="of-camp"'), 'Ej. Hot Sale 2026.')}
        ${field('of-p-start', 'Inicio de vigencia', input('of-p-start', c.start, 'date', 'data-action="of-camp"'), 'Aplica a todas las filas sin fecha propia.')}
        ${field('of-p-end', 'Fin de vigencia', input('of-p-end', c.end, 'date', 'data-action="of-camp"'))}
        ${field('of-p-origin', 'Origen de las ofertas', selectHtml('of-p-origin', Object.entries(O().ORIGINS), pd.origin, 'data-action="of-camp"'))}
      </div>${preview}
      <div class="btn-row"><button type="button" class="btn btn--primary" data-action="of-commit"${b.offers && b.offers.length ? '' : ' disabled'}>Guardar ${b.offers ? b.offers.length : 0} ofertas</button><button type="button" class="btn btn--ghost" data-action="of-cancel">Cancelar</button></div></div></section>`;
  }

  function foldBtn(of, key, label, extra) {
    const open = !!(of.fold && of.fold[key]); const esc = H().esc;
    return `<button type="button" class="gd-fold" data-action="of-fold" data-fold="${key}" aria-expanded="${open}"><span>${label}${extra ? ` <span class="cell-sub">${esc(extra)}</span>` : ''}</span><span aria-hidden="true">${open ? '▾' : '▸'}</span></button>`;
  }
  function batchesHtml(reg, of) {
    const esc = H().esc; if (!reg.batches.length) return '';
    const open = !!(of.fold && of.fold.batches);
    const head = foldBtn(of, 'batches', `Archivos recibidos (${reg.batches.length})`, `${reg.offers.length} ofertas`);
    if (!open) return `<div class="gd-foldrow">${head}</div>`;
    const rows = reg.batches.slice().reverse().map((b) => `<tr${of.f.batchId === b.batchId ? ' aria-selected="true"' : ''}><td><span class="num">${esc(b.batchId)}</span></td><td>${esc(b.campaign || '—')}<span class="cell-sub">${esc(b.fileName)}${b.sheet ? ` · ${esc(b.sheet)}` : ''}</span></td>
      <td>${esc(O().ORIGINS[b.origin] || b.origin)}</td><td>${esc(b.start || '—')} a ${esc(b.end || '—')}</td><td class="num">${b.imported}${b.rejected.length ? ` <span class="cell-sub">${b.rejected.length} omitidas</span>` : ''}</td><td>${esc(b.receivedBy)}<span class="cell-sub">${esc(when(b.receivedAt))}</span></td>
      <td><button type="button" class="btn btn--small" data-action="of-batch" data-id="${esc(b.batchId)}">${of.f.batchId === b.batchId ? 'Quitar filtro' : 'Ver sus ofertas'}</button> <button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="rm-offers-ask" data-kind="batch" data-id="${esc(b.batchId)}">Eliminar archivo</button></td></tr>`).join('');
    return `<div class="gd-foldrow">${head}</div><section class="panel" aria-labelledby="of-t-b"><div class="panel__head"><div><h2 class="panel__title" id="of-t-b">Archivos recibidos (${reg.batches.length})</h2></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Lote</th><th>Campaña / archivo</th><th>Origen</th><th>Vigencia</th><th>Ofertas</th><th>Recibió</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
  }

  const ISS = [['', 'Con o sin alertas'], ['error', 'Con error'], ['warn', 'Con error o aviso'], ['clean', 'Sin alertas'], ['dup_other', 'Duplicadas con otra oferta'], ['dup_batch', 'Repetidas en su archivo'], ['supply', 'Problema de abastecimiento'], ['no_dates', 'Sin vigencia']];
  const COLS = [['mech', 'Mecánica'], ['price', 'Precio PMP → final'], ['vig', 'Vigencia'], ['act', 'Activación sugerida']];
  /** Chips de los filtros puestos (sin la búsqueda de texto, que ya se ve en su caja). */
  function activeFilters(of) {
    const f = of.f, L = [];
    if (f.batchId) L.push(['batchId', `Archivo: ${f.batchId}`]);
    if (f.state) L.push(['state', `Estado: ${O().STATE[f.state] || f.state}`]);
    if (f.lab) L.push(['lab', `Laboratorio: ${f.lab}`]);
    if (f.category) L.push(['category', `Categoría: ${f.category}`]);
    if (f.issue) L.push(['issue', `Alertas: ${(ISS.find((x) => x[0] === f.issue) || [0, f.issue])[1]}`]);
    if (f.action) L.push(['action', `Acción: ${f.action}`]);
    return L;
  }
  function filtersHtml(reg, of) {
    const f = of.f, esc = H().esc, fold = of.fold || {}, act = activeFilters(of), cols = of.cols || {};
    const lab = [['', 'Todos los laboratorios'], ...O().distinct(reg, 'lab', f.batchId).map((x) => [x, x])];
    const cat = [['', 'Todas las categorías'], ...O().distinct(reg, 'category', f.batchId).map((x) => [x, x])];
    const st = [['', 'Todos los estados'], ...Object.entries(O().STATE)];
    const top = `<div class="btn-row gd-ftop"><label class="gd-search"><span class="visually-hidden">Buscar</span>${input('of-f-q', f.q || '', 'search', 'data-action="of-filter" placeholder="Buscar SKU, producto, laboratorio…"')}</label>
      <button type="button" class="btn${act.length ? ' btn--primary-soft' : ''}" data-action="of-fold" data-fold="filters" aria-expanded="${!!fold.filters}">Filtros${act.length ? ` · ${act.length} ${act.length === 1 ? 'activo' : 'activos'}` : ''} ${fold.filters ? '▴' : '▾'}</button>
      <button type="button" class="btn" data-action="of-fold" data-fold="cols" aria-expanded="${!!fold.cols}">Columnas ${fold.cols ? '▴' : '▾'}</button></div>`;
    const chips = act.length ? `<div class="btn-row gd-chiprow"><span class="field__hint">Filtros puestos:</span>${act.map(([k, t]) => `<button type="button" class="gd-fchip" data-action="of-clear" data-key="${k}" aria-label="Quitar filtro ${esc(t)}">${esc(t)} ×</button>`).join('')}<button type="button" class="btn btn--small btn--ghost" data-action="of-clear" data-key="all">Quitar todos</button></div>` : '';
    const grid = fold.filters ? `<div class="field-grid">
      ${field('of-f-state', 'Estado', selectHtml('of-f-state', st, f.state || '', 'data-action="of-filter"'))}
      ${field('of-f-lab', 'Laboratorio', selectHtml('of-f-lab', lab, f.lab || '', 'data-action="of-filter"'))}
      ${field('of-f-cat', 'Categoría', selectHtml('of-f-cat', cat, f.category || '', 'data-action="of-filter"'))}
      ${field('of-f-issue', 'Alertas', selectHtml('of-f-issue', ISS, f.issue || '', 'data-action="of-filter"'))}</div>` : '';
    const colBox = fold.cols ? `<div class="btn-row gd-cols"><span class="field__hint">Mostrar columnas:</span>${COLS.map(([k, l]) => `<label class="gd-colchk"><input type="checkbox" data-action="of-col" data-col="${k}"${cols[k] ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>` : '';
    const cnt = { received: 0, validated: 0, selected: 0, discarded: 0 }; reg.offers.forEach((o) => { cnt[o.state] += 1; });
    const TABS = [['', 'Todas', reg.offers.length], ['received', 'Por revisar', cnt.received], ['validated', 'Validadas', cnt.validated], ['selected', 'Elegidas', cnt.selected], ['discarded', 'Descartadas', cnt.discarded]];
    const tabs = `<div class="gd-tabs" role="group" aria-label="Estado de la oferta">${TABS.map(([k, l, n]) => `<button type="button" class="gd-tab" data-action="of-tab" data-s="${k}" aria-pressed="${(f.state || '') === k}">${esc(l)} <span class="num">${n}</span></button>`).join('')}</div>
      <p class="field__hint">Las ofertas sin ninguna alerta se validan solas al cargarlas. «Por revisar» son las que traen alertas o las que devolviste a mano.</p>`;
    return `${tabs}${top}${chips}${grid}${colBox}`;
  }

  /** Ofertas que pasan los filtros (incluida la acción sugerida elegida en el conteo). La usan la tabla y «Marcar las visibles». */
  function visible(state) {
    const of = state.of, reg = of.reg, an = O().analyze(reg); let list = O().filter(reg, an, of.f);
    if (of.f.action && FP.activationView) { const map = FP.activationView.recs(state); list = list.filter((o) => { const r = map.get(`offer:${o.offerId}`); return !!r && r.main === of.f.action; }); }
    return list;
  }
  function tableHtml(reg, of, an, state, map) {
    const esc = H().esc, pill = H().pill, AV = FP.activationView, C = of.cols || {};
    const list = visible(state); const shown = list.slice(0, CAP);
    if (!reg.offers.length) return '<div class="empty"><strong>Todavía no hay ofertas recibidas</strong>Carga el archivo que te manda el proveedor o comercial con «Cargar archivo de ofertas». Cada oferta queda como «Recibida», con su origen y fecha.</div>';
    if (!list.length) return '<div class="empty"><strong>Ninguna oferta coincide con los filtros</strong>Quita algún filtro para verlas.</div>';
    const rows = shown.map((o) => {
      const codes = an.get(o.offerId) || [], lv = O().levelOf(codes), n = codes.filter((c) => O().ISSUE[c].level !== 'info').length;
      return `<tr${o.offerId === of.sel ? ' aria-selected="true"' : ''}><td><input type="checkbox" data-action="of-chk" data-id="${esc(o.offerId)}" aria-label="Marcar ${esc(o.offerId)}"${of.checked[o.offerId] ? ' checked' : ''}></td>
        <td><span class="num">${esc(o.offerId)}</span></td><td class="num">${esc(o.sku)}</td><td>${esc(o.name || '—')}<span class="cell-sub">${esc([o.lab, o.category].filter(Boolean).join(' · '))}</span>${!C.mech && FP.activation && FP.activation.mechanicKind(o.mechanic) === 'tiered' ? '<span class="cell-sub">Mecánica escalonada o larga: ver al abrir</span>' : ''}</td>
        ${C.mech ? `<td>${esc(o.mechanic || o.program || (o.offerCode ? `Oferta ${o.offerCode}` : '—'))}</td>` : ''}<td class="num">${pct(o.discount)}${o.discountSource && o.discountSource !== 'file' ? ` <span class="cell-sub">${o.discountSource === 'calculated' ? 'calculado' : 'ajustado'}</span>` : ''}</td>
        ${C.price ? `<td class="num">${money(o.pmp)} → ${money(o.finalPrice)}</td>` : ''}${C.vig ? `<td>${esc(o.start || '—')} a ${esc(o.end || '—')}</td>` : ''}
        <td title="${esc(issueText(codes))}">${n ? pill(LEVEL_PILL[lv], `${n} ${n === 1 ? 'alerta' : 'alertas'}`) : pill('ok', 'Sin alertas')}</td>
        <td>${pill(STATE_PILL[o.state], O().STATE[o.state])}</td>${AV && C.act ? AV.cells(state, map.get(`offer:${o.offerId}`)) : ''}<td><button type="button" class="btn btn--small" data-action="of-open" data-id="${esc(o.offerId)}">Abrir</button>${AV ? ` <button type="button" class="btn btn--small btn--ghost" data-action="ac-open" data-key="offer:${esc(o.offerId)}">Ver razón</button>` : ''}</td></tr>`;
    }).join('');
    const more = list.length > shown.length ? `<p class="field__hint">Se muestran las primeras ${CAP}; afina con la búsqueda o los filtros para ver el resto.</p>` : '';
    return `<div class="table-wrap gd-scroll" tabindex="0" aria-label="Lista de ofertas, se desliza"><table class="table ds-table pm-wide"><thead><tr><th></th><th>ID</th><th>SKU</th><th>Producto</th>${C.mech ? '<th>Mecánica</th>' : ''}<th>% desc.</th>${C.price ? '<th>PMP → final</th>' : ''}${C.vig ? '<th>Vigencia</th>' : ''}<th>Alertas</th><th>Estado de la oferta</th>${AV && C.act ? AV.headCells(state) : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${more}
      <p class="field__hint">${list.length} ofertas con estos filtros.</p>`;
  }

  function bulkHtml(reg, of) {
    const esc = H().esc; const ids = Object.keys(of.checked).filter((k) => of.checked[k]);
    const promos = (FP.promotionNotes && FP.promotionNotes.registry ? FP.promotionNotes.registry() : { promotions: [] }).promotions.filter((p) => ['draft', 'proposed'].includes(p.status));
    const selectedCount = reg.offers.filter((o) => o.state === 'selected').length;
    return `<div class="btn-row"><span class="field__hint">Marcadas: <strong>${ids.length}</strong></span>
      <button type="button" class="btn btn--small" data-action="of-check-all">Marcar las visibles</button><button type="button" class="btn btn--small btn--ghost" data-action="of-check-none">Quitar marcas</button>
      <button type="button" class="btn btn--small btn--primary" data-action="of-bulk" data-to="validated"${ids.length ? '' : ' disabled'}>Validar marcadas</button>
      <button type="button" class="btn btn--small btn--primary" data-action="of-bulk" data-to="selected"${ids.length ? '' : ' disabled'}>Seleccionar marcadas</button>
      <button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="rm-offers-ask" data-kind="marked"${ids.length ? '' : ' disabled'}>Eliminar marcadas</button></div>
      <div class="btn-row">${promos.length ? `${selectedCount ? '' : ''}<select id="of-b-promo" aria-label="Promoción destino">${promos.map((p) => `<option value="${esc(p.promoId)}">${esc(p.promoId)} · ${esc(p.name)}</option>`).join('')}</select>
      <button type="button" class="btn btn--small" data-action="of-to-promo"${selectedCount ? '' : ' disabled'}>Agregar las ${selectedCount} seleccionadas a la promoción</button>` : '<span class="field__hint">Para pasar las seleccionadas a una promoción, crea una en la pestaña Promociones (en borrador o propuesta).</span>'}</div>`;
  }

  function detailHtml(reg, o, an, actor) {
    const esc = H().esc, pill = H().pill; if (!o) return '';
    const codes = an.get(o.offerId) || [], b = O().batchOf(reg, o.batchId);
    const editable = o.state !== 'selected';
    const issues = codes.length ? `<ul class="plain-list">${codes.map((c) => `<li>${pill(c && O().ISSUE[c].level === 'error' ? 'error' : O().ISSUE[c].level === 'warn' ? 'warning' : 'na', O().ISSUE[c].level === 'error' ? 'Error' : O().ISSUE[c].level === 'warn' ? 'Aviso' : 'Nota')} ${esc(O().ISSUE[c].text)}</li>`).join('')}</ul>` : '<p>Sin alertas.</p>';
    const facts = [['SKU (Oracle)', o.sku], ['sivec', o.internalId], ['Producto', o.name], ['Laboratorio', o.lab], ['Categoría', o.category], ['División', o.division], ['Comprador', o.buyer], ['Proveedor', o.supplier],
      ['Código de oferta', o.offerCode], ['Programa', o.program], ['Comentarios', o.comments], ['Precio actual (archivo)', o.ourPrice === null ? '' : money(o.ourPrice)], ['Abastecimiento', o.supplyComment],
      ['Disponibilidad en PDV', typeof o.pdv === 'number' ? pct(o.pdv) : ''], ['Cambio de precio (archivo)', o.priceChange ? money(o.priceChange) : ''], ['Recibida', `${when(o.receivedAt)} · ${o.receivedBy} · ${O().ORIGINS[o.origin] || o.origin}`], ['Archivo', b ? `${b.batchId} · ${b.fileName}` : o.batchId]]
      .filter((r) => r[1]).map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
    const ed = (k, label, v, type, hint) => `<div class="field">${`<label for="of-e-${k}" class="field__label">${esc(label)}</label>`}<div class="btn-row"><input id="of-e-${k}" type="${type}" value="${esc(v === null || v === undefined ? '' : v)}"${editable ? '' : ' disabled'}><button type="button" class="btn btn--small" data-action="of-edit" data-field="${k}" data-id="${esc(o.offerId)}"${editable ? '' : ' disabled'}>Guardar</button></div>${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`;
    const nexts = O().NEXT[o.state].map((to) => `<button type="button" class="btn${to === 'discarded' ? ' btn--ghost' : ' btn--primary'}" data-action="of-state" data-to="${to}" data-id="${esc(o.offerId)}">${to === 'discarded' ? 'Descartar' : to === 'received' ? (o.state === 'discarded' ? 'Reabrir' : 'Volver a recibida') : to === 'validated' ? (o.state === 'selected' ? 'Volver a validada' : 'Validar') : 'Seleccionar'}</button>`).join('');
    const hist = o.history.slice().reverse().map((h) => `<li><span class="num">${esc(when(h.at))}</span> · ${esc(histText(h))}${h.by ? ` <span class="cell-sub">${esc(h.by)}</span>` : ''}</li>`).join('');
    const delBtn = `<button type="button" class="btn btn--ghost btn--danger-text" data-action="rm-offers-ask" data-kind="one" data-id="${esc(o.offerId)}">Eliminar…</button>`;
    return `<section class="panel" aria-labelledby="of-t-det"><div class="panel__head"><div><h2 class="panel__title" id="of-t-det">${esc(o.offerId)} · ${esc(o.name || o.sku)} ${pill(STATE_PILL[o.state], O().STATE[o.state])}</h2>
      <p class="panel__desc">${pct(o.discount)} de descuento · ${esc(o.start || '—')} a ${esc(o.end || '—')} · ${esc(o.mechanic || 'sin mecánica')}</p></div><button type="button" class="btn btn--small" data-action="of-close">Cerrar</button></div>
      <div class="panel__body"><h3>Alertas</h3>${issues}<h3>Datos de la oferta</h3><dl class="facts">${facts}</dl>
        <h3>Ajustes ${editable ? '' : '<span class="field__hint">(seleccionada: devuélvela a «Validada» para editar)</span>'}</h3>
        <p class="field__hint">Cada cambio guarda el valor anterior, quién y cuándo; nada se sobrescribe en silencio.</p>
        <div class="field-grid">${ed('start', 'Inicio', o.start, 'date')}${ed('end', 'Fin', o.end, 'date')}${ed('discount', '% de descuento', o.discount === null ? '' : +(o.discount * 100).toFixed(2), 'text', 'Escribe el porcentaje, ej. 25,5.')}${ed('mechanic', 'Mecánica', o.mechanic, 'text')}</div>
        <h3>Estado</h3>${field('of-s-note', 'Nota o motivo', input('of-s-note', ''), 'Obligatorio para descartar.')}<div class="btn-row">${nexts}${delBtn}</div>
        ${field('of-n-text', 'Agregar nota al historial', input('of-n-text', ''))}<div class="btn-row"><button type="button" class="btn btn--small" data-action="of-note" data-id="${esc(o.offerId)}">Guardar nota</button></div>
        <h3>Historial</h3><ul class="plain-list">${hist}</ul></div></section>`;
  }
  function histText(h) {
    const S = O().STATE, L = O().EDITABLE;
    if (h.field === 'created') return h.note || 'Recibida';
    if (h.field === 'state') return `Estado: ${S[h.from] || '—'} → ${S[h.to] || h.to}${h.note ? `. ${h.note}` : ''}`;
    if (h.field === 'note') return `Nota: ${h.to}`;
    const fmt = (v) => (v === null || v === '' ? '—' : (h.field === 'discount' ? pct(v) : v));
    return `${L[h.field] || h.field}: ${fmt(h.from)} → ${fmt(h.to)}`;
  }

  /** HTML de la pestaña. Lo inserta promotion-view en #pm-body. */
  const MF = [['sku', 'SKU (Oracle) *', 'text'], ['name', 'Producto', 'text'], ['category', 'Categoría', 'text'], ['lab', 'Laboratorio', 'text'], ['controlled', 'Controlados *', 'text'], ['program', 'Programa', 'text'],
    ['mechanic', 'Mecánica', 'text'], ['discount', '% de descuento *', 'text'], ['use', 'Crónico / agudo', 'select'], ['start', 'Inicio de vigencia', 'date'], ['end', 'Fin de vigencia', 'date'], ['campaignName', 'Campaña', 'text'],
    ['origin', 'Origen', 'select'], ['supplyComment', 'Comentario de abastecimiento', 'text'], ['comments', 'Comentarios', 'text']];
  const MHINT = { sku: 'Sin el sufijo «AA».', controlled: 'Escribe «Ningún Control» si se puede promocionar.', program: 'Texto libre, opcional.', mechanic: 'Texto libre, opcional.', discount: 'De 0 a 100, ej. 25.',
    use: 'Sirve para sugerir recompra.', supplyComment: 'Ej. «Agotado».' };
  function manualHtml(of) {
    if (!of.manual) return '';
    const v = of.manual.v || {}, esc = H().esc;
    const ctl = (k, label, type) => {
      const id = `of-m-${k}`;
      if (k === 'use') return field(id, label, selectHtml(id, [['', 'Sin dato'], ['Crónico', 'Crónico'], ['Agudo', 'Agudo']], v.use || ''), MHINT[k]);
      if (k === 'origin') return field(id, label, selectHtml(id, Object.entries(O().ORIGINS), v.origin || 'commercial'));
      return field(id, label.replace(' *', ''), input(id, v[k] || '', type), `${label.indexOf('*') !== -1 ? 'Obligatorio. ' : ''}${MHINT[k] || ''}`.trim());
    };
    return `<section class="panel" aria-labelledby="of-t-m"><div class="panel__head"><div><h2 class="panel__title" id="of-t-m">Capturar una oferta</h2>
      <p class="panel__desc">Para una oferta que llega por correo o por mensaje. Pasa por las mismas reglas que un archivo y queda «Recibida» en un lote «Captura manual» (uno por campaña). No inventes descuentos: escribe solo lo que te mandaron.</p></div><button type="button" class="btn btn--small" data-action="of-manual-close">Cerrar</button></div>
      <div class="panel__body">${of.manual.msg ? `<div class="note note--warn" role="alert">${esc(of.manual.msg)}</div>` : ''}<div class="field-grid">${MF.map(([k, l, t]) => ctl(k, l, t)).join('')}</div>
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="of-manual-save">Guardar oferta</button></div></div></section>`;
  }
  function html(state) {
    const of = state.of, reg = of.reg, an = O().analyze(reg), esc = H().esc, AV = FP.activationView, map = AV ? AV.recs(state) : new Map();
    const sel = of.sel ? O().find(reg, of.sel) : null;
    return `<section class="panel" aria-labelledby="of-t"><div class="panel__head"><div><h2 class="panel__title" id="of-t">Ofertas recibidas</h2>
      <p class="panel__desc">Recibe, valida y selecciona las ofertas que mandan proveedores o comercial. Los descuentos y precios son los del archivo (o la cuenta 1 − precio final ÷ PMP, marcada como calculada). Recibir una oferta no activa nada en la web ni en la app.</p></div>
      <div class="btn-row"><label class="btn btn--primary" for="of-file">Cargar archivo de ofertas</label><button type="button" class="btn" data-action="of-manual-open">Capturar una oferta</button><button type="button" class="btn btn--ghost" data-action="of-template">Descargar plantilla</button><input id="of-file" type="file" accept=".xlsx,.csv" data-action="of-file" style="position:absolute;left:-9999px"></div></div>
      <div class="panel__body">${counters(reg, an)}</div></section>
      ${FP.guideView ? FP.guideView.offerSummary(state, an, map) : ''}
      ${FP.guideView && reg.offers.length ? FP.guideView.actionsHtml(state, map, 'offer') : ''}
      ${manualHtml(of)}
      ${pendingHtml(of)}
      ${batchesHtml(reg, of)}
      <section class="panel" aria-labelledby="of-t-l"><div class="panel__head"><div><h2 class="panel__title" id="of-t-l">Ofertas (${reg.offers.length})</h2></div></div>
        <div class="panel__body">${filtersHtml(reg, of)}${reg.offers.length ? bulkHtml(reg, of) : ''}${AV && reg.offers.length ? AV.toolbar(state, 'offer') : ''}</div>
        ${AV && reg.offers.length ? AV.params(state) : ''}
        <div class="panel__body panel__body--flush">${tableHtml(reg, of, an, state, map)}</div></section>
      ${AV && state.ac.sel && state.ac.sel.indexOf('offer:') === 0 ? AV.detail(state, map, state.ac.sel) : ''}
      ${sel ? detailHtml(reg, sel, an, state.pm.actor) : ''}`;
  }

  FP.offerView = { html, val, visible };
})(typeof window !== 'undefined' ? window : globalThis);
