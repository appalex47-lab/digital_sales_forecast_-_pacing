/**
 * opportunity-view.js — pestaña «Oportunidades» dentro de Promociones (propuesta B, etapa PRE).
 * Pinta el resultado de FP.opportunities (calculado en app.js sobre la comparación por SKU). No calcula venta ni efecto.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const OP = () => FP.opportunities;
  const $ = (id) => document.getElementById(id);
  const EV_PILL = { high: 'ok', medium: 'warning', low: 'error' };
  const EV_TXT = { high: 'Evidencia alta', medium: 'Evidencia media', low: 'Evidencia baja' };
  const TYPE_PILL = { unconverted: 'warning', lowVisibility: 'warning', growing: 'ok', declining: 'error', highWeight: 'na' };
  const PAGE = 50;
  const CAP = 1000;   // la lista se desliza (10 filas visibles); este tope solo protege la página
  const NONE = '∅';   // valor del filtro y de la marca para «sin subcategoría» / «sin laboratorio»
  const VIEWS = [['sku', 'SKU'], ['subcat', 'Subcategoría'], ['lab', 'Laboratorio']];
  const DIM = { subcat: 'Subcategoría', lab: 'Laboratorio' };

  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : '—');
  const money = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
  const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('es-MX') : '—');
  function field(id, label, html, hint) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`; }
  const input = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${H().esc(v === null || v === undefined ? '' : v)}" ${extra}>`;
  function selectHtml(id, items, cur, extra = '') { const esc = H().esc; return `<select id="${id}" ${extra}>${items.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
  const channels = () => { try { return FP.config.channelIds.map((id) => [id, FP.dataModel.getChannel(id).label]); } catch (e) { return [['ecommerce', 'Ecommerce'], ['app', 'App']]; } };

  /** Aplica los filtros locales (tipo, categoría, evidencia, texto, solo con oferta). */
  function visible(op, state) {
    if (!op.result) return [];
    const f = op.f, recs = f.action && state && FP.activationView ? FP.activationView.recs(state) : null, q = FP.offers ? FP.offers.norm(f.q) : String(f.q || '').toLowerCase(), labFn = (i) => (state ? labOf(i, state) : i.brand);
    return op.result.items.filter((i) => {
      if (f.type && !i.types.some((t) => t.id === f.type)) return false;
      if (f.category && i.category !== f.category) return false;
      if (f.evidence && i.evidence.level !== f.evidence) return false;
      if (f.withOffer === 'yes' && !i.offers.length) return false;
      if (f.withOffer === 'no' && i.offers.length) return false;
      if (f.origin && !i.offers.some((o) => o.origin === f.origin)) return false;
      if (f.subcategory && (i.subcategory || NONE) !== f.subcategory) return false;
      if (f.lab && (labFn(i) || NONE) !== f.lab) return false;
      if (f.action && recs) { const r = recs.get(`sku:${i.sku}`); if (!r || r.main !== f.action) return false; }
      if (q && !(FP.offers ? FP.offers.norm(`${i.sku} ${i.name} ${i.brand} ${i.category}`) : `${i.sku} ${i.name}`.toLowerCase()).includes(q)) return false;
      return true;
    });
  }

  function controls(op) {
    const f = op.f;
    return `<div class="field-grid">
      ${field('op-from', 'Desde', input('op-from', f.from, 'date', 'data-action="op-field"'))}
      ${field('op-to', 'Hasta', input('op-to', f.to, 'date', 'data-action="op-field"'))}
      ${field('op-cmp', 'Comparar contra', selectHtml('op-cmp', [['previous', 'Periodo anterior'], ['yoy', 'Mismo periodo del año anterior']], f.comparison, 'data-action="op-field"'))}
      ${field('op-ch', 'Canal', selectHtml('op-ch', [['total', 'Total'], ...channels()], f.channel, 'data-action="op-field"'))}
    </div><div class="btn-row"><button type="button" class="btn btn--primary" data-action="op-run"${op.loading ? ' disabled' : ''}>${op.loading ? 'Calculando…' : 'Calcular oportunidades'}</button></div>`;
  }

  function summary(op) {
    const esc = H().esc, r = op.result; if (!r) return '';
    const T = OP().TYPES;
    const kpis = Object.keys(T).map((k) => `<button type="button" class="metric-card" data-action="op-type" data-type="${k}" aria-pressed="${op.f.type === k}"><span class="metric-card__label">${esc(T[k].label)}</span><strong class="metric-card__value num">${r.counts.byType[k]}</strong></button>`).join('');
    const notes = r.notes.map((n) => `<p class="field__hint">${esc(n)}</p>`).join('');
    return `<div class="metric-grid">${kpis}</div>
      <p class="field__hint">Periodo ${esc(r.period.from)} a ${esc(r.period.to)} contra ${esc(r.baseline.label)} (${esc(r.baseline.from)} a ${esc(r.baseline.to)}). ${r.counts.total} SKU con al menos un tipo de oportunidad. Un SKU puede tener más de un tipo.</p>${notes}`;
  }

  function filters(op, state) {
    const f = op.f, r = op.result; if (!r) return '';
    const subs = [...new Set(r.items.map((i) => i.subcategory || NONE))].sort((a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b, 'es'));
    const labs = [...new Set(r.items.map((i) => labOf(i, state) || NONE))].sort((a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b, 'es'));
    const T = OP().TYPES;
    return `<div class="field-grid">
      ${field('op-f-q', 'Buscar', input('op-f-q', f.q || '', 'search', 'data-action="op-filter" placeholder="SKU, producto, marca…"'))}
      ${field('op-f-type', 'Tipo de oportunidad', selectHtml('op-f-type', [['', 'Todos los tipos'], ...Object.keys(T).map((k) => [k, T[k].label])], f.type || '', 'data-action="op-filter"'))}
      ${field('op-f-cat', 'Categoría', selectHtml('op-f-cat', [['', 'Todas las categorías'], ...r.categories.map((c) => [c, c])], f.category || '', 'data-action="op-filter"'))}
      ${field('op-f-sub', 'Subcategoría', selectHtml('op-f-sub', [['', 'Todas las subcategorías'], ...subs.map((c) => [c, c === NONE ? 'Sin subcategoría' : c])], f.subcategory || '', 'data-action="op-filter"'))}
      ${field('op-f-lab', 'Laboratorio', selectHtml('op-f-lab', [['', 'Todos los laboratorios'], ...labs.map((c) => [c, c === NONE ? 'Sin laboratorio' : c])], f.lab || '', 'data-action="op-filter"'))}
      ${field('op-f-ev', 'Evidencia', selectHtml('op-f-ev', [['', 'Cualquiera'], ['high', 'Alta'], ['medium', 'Media'], ['low', 'Baja']], f.evidence || '', 'data-action="op-filter"'))}
      ${field('op-f-off', 'Oferta recibida', selectHtml('op-f-off', [['', 'Con o sin oferta'], ['yes', 'Ya tiene oferta recibida'], ['no', 'Sin oferta recibida']], f.withOffer || '', 'data-action="op-filter"'))}
      ${field('op-f-org', 'Origen de la oferta', selectHtml('op-f-org', [['', 'Cualquiera'], ...Object.keys((FP.offers && FP.offers.ORIGINS) || {}).map((k) => [k, FP.offers.ORIGINS[k]])], f.origin || '', 'data-action="op-filter"'))}
    </div>`;
  }

  const gk = (x) => x.key || NONE;
  /** Grupos (subcategoría o laboratorio) de la lista visible, o [] en la vista por SKU. */
  function groupsOf(op, state, list) {
    if (!op.view || op.view === 'sku') return [];
    return OP().groupItems(list || visible(op, state), op.view, (i) => labOf(i, state));
  }
  /**
   * Lo que se exporta o agrega al plan según la vista: por SKU, los marcados (o todos los visibles); por subcategoría o laboratorio,
   * los grupos marcados (o todos los visibles) y los SKU de esos grupos.
   */
  function selection(op, state) {
    const vis = visible(op, state), view = op.view || 'sku';
    if (view === 'sku') { const marked = vis.filter((i) => op.checked[i.sku]); return { view, marked: marked.length, list: marked.length ? marked : vis, groups: [], label: '' }; }
    const groups = groupsOf(op, state, vis), cg = op.checkedG || {}, picked = groups.filter((g) => cg[gk(g)]), chosen = picked.length ? picked : groups;
    const skus = new Set(chosen.flatMap((g) => g.skus));
    return { view, marked: picked.length, list: vis.filter((i) => skus.has(i.sku)), groups: chosen, label: DIM[view] };
  }
  /** SKU marcados de forma explícita (para agregar al plan): los marcados, o los SKU de los grupos marcados. */
  function markedSkus(op, state) {
    if (!op.view || op.view === 'sku') return Object.keys(op.checked).filter((k) => op.checked[k]);
    const cg = op.checkedG || {}; return groupsOf(op, state).filter((g) => cg[gk(g)]).flatMap((g) => g.skus);
  }

  function groupsTable(op, state) {
    const esc = H().esc, pill = H().pill, list = visible(op, state), groups = groupsOf(op, state, list), dim = DIM[op.view];
    if (!groups.length) return '<div class="empty"><strong>Ningún SKU coincide con los filtros</strong>Quita algún filtro para verlos.</div>';
    const shown = groups.slice(0, CAP), cg = op.checkedG || {};
    const T = OP().TYPES;
    const rows = shown.map((x) => `<tr><td><input type="checkbox" data-action="op-gchk" data-id="${esc(gk(x))}" aria-label="Marcar ${esc(x.label)}"${cg[gk(x)] ? ' checked' : ''}></td>
      <td><strong>${esc(x.label)}</strong>${x.categories.length ? `<span class="cell-sub">${esc(x.categories.slice(0, 3).join(' · '))}${x.categories.length > 3 ? '…' : ''}</span>` : ''}</td>
      <td class="num">${int(x.count)}</td><td class="num">${int(x.withOffer)}<span class="cell-sub">de ${int(x.count)}</span></td><td class="num">${int(x.evHigh)}</td>
      <td class="num">${x.sizeSkus ? money(x.size) : '—'}${x.sizeSkus ? `<span class="cell-sub">${int(x.sizeSkus)} SKU con tamaño</span>` : ''}</td>
      <td class="num">${money(x.revenue)}<span class="cell-sub">${pct(x.deltaPct)} vs referencia</span></td>
      <td>${Object.keys(x.types).map((k) => `${pill(TYPE_PILL[k] || 'na', ((T[k] || {}).label || k))} <span class="num">${int(x.types[k])}</span>`).join('<br>')}</td>
      <td><button type="button" class="btn btn--small" data-action="op-gopen" data-id="${esc(gk(x))}">Ver SKU</button></td></tr>`).join('');
    const more = groups.length > shown.length ? `<p class="field__hint">Se muestran los primeros ${CAP}; afina con la búsqueda o los filtros.</p>` : '';
    return `<div class="table-wrap gd-scroll" tabindex="0" aria-label="Lista, se desliza"><table class="table ds-table pm-wide"><thead><tr><th></th><th>${esc(dim)}</th><th>SKU</th><th>Con oferta recibida</th><th>Evidencia alta</th><th>Tamaño</th><th>Venta del periodo</th><th>Tipos de oportunidad (SKU)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${more}
      <p class="field__hint">${groups.length} ${esc(dim.toLowerCase())}${groups.length === 1 ? '' : 's'} con ${list.length} SKU con estos filtros, de mayor a menor. Cada fila suma lo que ya trae cada SKU. «Tamaño» solo suma los SKU de demanda no convertida (y dice cuántos son): sirve para ordenar, no es un pronóstico.</p>`;
  }

  function viewSwitch(op) {
    const esc = H().esc, v = op.view || 'sku';
    return `<div class="btn-row" role="group" aria-label="Ver la lista por"><span class="field__hint">Ver por</span>${VIEWS.map(([k, l]) => `<button type="button" class="btn btn--small${k === v ? ' btn--primary' : ''}" data-action="op-view" data-v="${k}" aria-pressed="${k === v}">${esc(l)}</button>`).join(' ')}</div>`;
  }

  function bulk(op, state) {
    const esc = H().esc, ids = markedSkus(op, state), grp = op.view && op.view !== 'sku', ng = grp ? Object.keys(op.checkedG || {}).filter((k) => op.checkedG[k]).length : 0, sel = selection(op, state);
    const promos = state.pm.reg.promotions.filter((p) => ['draft', 'proposed'].includes(p.status));
    return `<div class="btn-row"><span class="field__hint">Marcados: <strong>${grp ? `${ng} ${DIM[op.view].toLowerCase()}${ng === 1 ? '' : 's'} (${ids.length} SKU)` : ids.length}</strong>${ng || ids.length ? '' : ` · se exporta todo lo visible (${grp ? `${sel.groups.length} ${DIM[op.view].toLowerCase()}s, ${sel.list.length} SKU` : sel.list.length})`}</span>
      <button type="button" class="btn btn--small" data-action="op-check-all">${grp ? 'Marcar los grupos visibles' : 'Marcar los visibles'}</button><button type="button" class="btn btn--small btn--ghost" data-action="op-check-none">Quitar marcas</button>
      <button type="button" class="btn btn--small" data-action="op-export-csv">${grp ? `Exportar por ${DIM[op.view].toLowerCase()} (CSV)` : 'Exportar lista (CSV)'}</button></div>
      <div class="btn-row"><label class="field__hint" for="op-x-name">Nombre de la propuesta (obligatorio para el Excel)</label>
      <input id="op-x-name" type="text" data-action="op-xname" value="${esc(op.xname || '')}" placeholder="Ej. Propuesta otoño 2026" maxlength="80" aria-label="Nombre de la propuesta">
      <button type="button" class="btn btn--small btn--primary" data-action="op-export-xlsx">Exportar a Excel (${grp ? `${sel.list.length} SKU${ng ? ' de los marcados' : ''} + hoja por ${DIM[op.view].toLowerCase()}` : ids.length ? `${ids.length} marcados` : 'los visibles'})</button></div>
      <div class="btn-row">${promos.length ? `<select id="op-b-promo" aria-label="Promoción destino">${promos.map((p) => `<option value="${esc(p.promoId)}">${esc(p.promoId)} · ${esc(p.name)}</option>`).join('')}</select>
      <button type="button" class="btn btn--small btn--primary" data-action="op-to-promo"${ids.length ? '' : ' disabled'}>Agregar los ${ids.length} SKU marcados al plan de la promoción</button>` : '<span class="field__hint">Para agregar SKU al plan, crea una promoción en la pestaña Promociones (en borrador o propuesta).</span>'}</div>`;
  }

  /** Laboratorio de un producto: el de su oferta recibida y, si no tiene, el del catálogo de producto (columna Marca / Laboratorio). */
  function labOf(i, state) { try { return FP.promotionExport.offerInfo(i, state.of.reg.offers).lab; } catch (e) { return i.brand || ''; } }
  function table(op, list, state, map) {
    const esc = H().esc, pill = H().pill, AV = FP.activationView;
    const keyOf = (i) => { const o = i.offers.slice().sort((a, b) => (b.discount || 0) - (a.discount || 0))[0]; return o ? `offer:${o.offerId}` : `sku:${i.sku}`; };
    if (!list.length) return '<div class="empty"><strong>Ningún SKU coincide con los filtros</strong>Quita algún filtro para verlos.</div>';
    const shown = list.slice(0, CAP);
    const rows = shown.map((i) => `<tr${i.sku === op.sel ? ' aria-selected="true"' : ''}><td><input type="checkbox" data-action="op-chk" data-id="${esc(i.sku)}" aria-label="Marcar ${esc(i.sku)}"${op.checked[i.sku] ? ' checked' : ''}></td>
      <td class="num">${esc(i.sku)}</td><td>${esc(i.name)}<span class="cell-sub">${esc([i.category, i.brand].filter(Boolean).join(' · '))}</span></td><td>${esc(labOf(i, state) || '—')}</td>
      <td>${i.types.map((t) => pill(TYPE_PILL[t.id] || 'na', t.label)).join(' ')}</td><td>${pill(EV_PILL[i.evidence.level], EV_TXT[i.evidence.level])}</td>
      <td class="num">${typeof i.size === 'number' ? money(i.size) : '—'}</td><td class="num">${money(i.revenue)}<span class="cell-sub">${pct(i.revenueDeltaPct)} vs referencia</span></td>
      <td>${i.offers.length ? i.offers.map((o) => `<span class="num">${esc(o.offerId)}</span> ${pct(o.discount)}`).join('<br>') : '—'}</td>${AV ? AV.cells(state, map.get(keyOf(i))) : ''}
      <td><button type="button" class="btn btn--small" data-action="op-open" data-id="${esc(i.sku)}">Abrir</button>${AV ? ` <button type="button" class="btn btn--small btn--ghost" data-action="ac-open" data-key="${esc(keyOf(i))}">Ver razón</button>` : ''}</td></tr>`).join('');
    const more = list.length > shown.length ? `<p class="field__hint">Se muestran los primeros ${CAP}; afina con la búsqueda o los filtros.</p>` : '';
    return `<div class="table-wrap gd-scroll" tabindex="0" aria-label="Lista de SKU, se desliza"><table class="table ds-table pm-wide"><thead><tr><th></th><th>SKU</th><th>Producto</th><th>Laboratorio</th><th>Tipo de oportunidad</th><th>Evidencia</th><th>Tamaño</th><th>Venta del periodo</th><th>Oferta recibida</th>${AV ? AV.headCells(state) : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${more}
      <p class="field__hint">${list.length} SKU con estos filtros. «Tamaño» solo existe para demanda no convertida (vistas × diferencia de conversión contra la mediana de su categoría × venta por pedido): sirve para ordenar, no es un pronóstico.</p>`;
  }

  function detail(op) {
    const esc = H().esc, pill = H().pill; if (!op.sel || !op.result) return '';
    const i = op.result.items.find((x) => x.sku === op.sel); if (!i) return '';
    const types = i.types.map((t) => `<li>${pill(TYPE_PILL[t.id] || 'na', t.label)} <strong>${esc(t.objective)}.</strong> ${esc(t.reason)}<br><span class="field__hint">${esc(t.warning)}</span></li>`).join('');
    const ev = i.evidence.notes.length ? `<ul class="plain-list">${i.evidence.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p>Cumple los tres criterios de evidencia.</p>';
    const off = i.offers.length ? `<ul class="plain-list">${i.offers.map((o) => `<li><span class="num">${esc(o.offerId)}</span> · ${pct(o.discount)} de descuento · ${esc(FP.offers.STATE[o.state] || o.state)}</li>`).join('')}</ul>` : '<p>Todavía no hay una oferta recibida para este SKU.</p>';
    return `<section class="panel" aria-labelledby="op-t-det"><div class="panel__head"><div><h2 class="panel__title" id="op-t-det">${esc(i.sku)} · ${esc(i.name)} ${pill(EV_PILL[i.evidence.level], EV_TXT[i.evidence.level])}</h2>
      <p class="panel__desc">${esc([i.category, i.brand].filter(Boolean).join(' · '))}</p></div><button type="button" class="btn btn--small" data-action="op-close">Cerrar</button></div>
      <div class="panel__body"><h3>Por qué aparece</h3><ul class="plain-list">${types}</ul>
        <h3>Evidencia</h3>${ev}
        <h3>Datos del periodo</h3><dl class="facts"><div><dt>Venta</dt><dd>${money(i.revenue)} (referencia ${money(i.revenueBase)}, ${pct(i.revenueDeltaPct)})</dd></div><div><dt>Unidades</dt><dd>${int(i.units)}</dd></div><div><dt>Vistas de ficha</dt><dd>${int(i.views)}</dd></div>
          <div><dt>Conversión</dt><dd>${pct(i.conversion)} (mediana de su categoría: ${pct(i.categoryMedianConversion)})</dd></div><div><dt>Peso en su categoría</dt><dd>${pct(i.categoryShare)}</dd></div></dl>
        <h3>Ofertas recibidas</h3>${off}
        <h3>Falta para decidir</h3><ul class="plain-list">${i.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="field__hint">Estos datos los aportan Comercial o Precios; la herramienta no los estima.</p></div></section>`;
  }

  /** HTML de la pestaña. Lo inserta promotion-view en #pm-body. */
  function html(state) {
    const op = state.op, esc = H().esc;
    const noData = !(FP.productStore && FP.productStore.available() && (FP.productStore.meta || {}).batches);
    const list = visible(op, state), AV = FP.activationView, map = AV ? AV.recs(state) : new Map();
    return `<section class="panel" aria-labelledby="op-t"><div class="panel__head"><div><h2 class="panel__title" id="op-t">Oportunidades del canal digital</h2>
      <p class="panel__desc">Productos que, con los datos de tu propio canal, merecen una conversación con Comercial o Precios. No es un puntaje ni un pronóstico: cada fila dice por qué aparece, con qué evidencia y qué falta decidir. Un producto de mucha venta aparece como «sostener o proteger», no como candidato a descuento.</p></div></div>
      <div class="panel__body">${noData ? '<div class="empty"><strong>Todavía no hay datos de producto</strong>Carga la venta (y el funnel) por producto en «Carga de datos» para ver oportunidades.</div>' : controls(op)}
        ${op.msg ? `<div class="note note--${op.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(op.msg.text)}${(op.msg.warnings || []).map((w) => `<br>${esc(w)}`).join('')}</div>` : ''}</div></section>
      ${op.result && FP.guideView ? FP.guideView.opportunitySummary(state, map) + FP.guideView.actionsHtml(state, map, 'potential') : ''}
      ${op.result ? `<section class="panel" aria-labelledby="op-t-l"><div class="panel__head"><div><h2 class="panel__title" id="op-t-l">Resultado</h2></div></div><div class="panel__body">${summary(op)}${filters(op, state)}${viewSwitch(op)}${bulk(op, state)}${AV ? AV.toolbar(state, 'potential') : ''}</div>
        ${AV ? AV.params(state) : ''}
        <div class="panel__body panel__body--flush">${op.view && op.view !== 'sku' ? groupsTable(op, state) : table(op, list, state, map)}</div></section>` : ''}
      ${AV && state.ac.sel ? AV.detail(state, map, state.ac.sel) : ''}
      ${detail(op)}`;
  }

  FP.opportunityView = { html, val, visible, selection, markedSkus, groupsOf, NONE, DIM };
})(typeof window !== 'undefined' ? window : globalThis);
