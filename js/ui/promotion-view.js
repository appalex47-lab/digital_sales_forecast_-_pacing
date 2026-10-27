/**
 * promotion-view.js — «Promociones» (Recuperar). Registro, aprobación, ejecución e historial de promociones (propuesta B, fase 1).
 * Solo pinta lo que guarda FP.promotions; los cambios pasan por las acciones de app.js. No muestra venta ni resultados:
 * la medición llega en una fase posterior y aquí no se inventa.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const P = () => FP.promotions;
  const $ = (id) => document.getElementById(id);
  const PILL = { draft: 'na', proposed: 'warning', approved: 'ok', published: 'ok', measuring: 'warning', closed: 'ok', cancelled: 'error' };
  const NEXT_LABEL = { proposed: 'Enviar a aprobación', draft: 'Volver a borrador', approved: 'Aprobar', published: 'Poner en marcha', measuring: 'Pasar a medición', closed: 'Cerrar con conclusión' };
  const BACK = { draft: true };   // pasos hacia atrás: estilo secundario

  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const channelLabel = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const channels = () => { try { return FP.config.channelIds.map((id) => [id, channelLabel(id)]); } catch (e) { return [['ecommerce', 'Ecommerce']]; } };
  const dateTxt = (iso) => (iso ? iso : '—');
  const when = (at) => { try { const d = new Date(at); return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return at; } };

  function opt(map, cur) { const esc = H().esc; return Object.keys(map).map((k) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(map[k])}</option>`).join(''); }
  function field(id, label, html, hint) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`; }
  const input = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${H().esc(v === null || v === undefined ? '' : v)}" ${extra}>`;

  function listHtml(reg, sel) {
    const esc = H().esc, pill = H().pill;
    if (!reg.promotions.length) return '<div class="empty"><strong>Todavía no hay promociones registradas</strong>Crea la primera con «Nueva promoción». Quedará con un identificador que la acompaña hasta la medición.</div>';
    const rows = reg.promotions.slice().sort((a, b) => (a.promoId < b.promoId ? 1 : -1)).map((p) => `<tr${p.promoId === sel ? ' aria-selected="true"' : ''}>
      <td><span class="num">${esc(p.promoId)}</span></td><td>${esc(p.name)}${p.proposalName ? `<span class="cell-sub">Propuesta: ${esc(p.proposalName)}</span>` : ''}</td>
      <td>${pill(PILL[p.status] || 'na', P().STATUS[p.status])}</td><td>${esc(dateTxt(p.plannedStart))} a ${esc(dateTxt(p.plannedEnd))}</td>
      <td class="num">${p.skus.length}</td><td>${esc(p.createdBy)}</td>
      <td><button type="button" class="btn btn--small" data-action="pm-open" data-id="${esc(p.promoId)}">Abrir</button> <button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="rm-promo-ask" data-id="${esc(p.promoId)}">Eliminar…</button></td></tr>`).join('');
    return `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Identificador</th><th>Promoción</th><th>Estado</th><th>Vigencia planeada</th><th>SKU</th><th>Creada por</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function createForm(pm) {
    const esc = H().esc;
    return `<section class="panel" aria-labelledby="pm-t-new"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-new">Nueva promoción</h2>
      <p class="panel__desc">Al crearla se genera su identificador a partir del nombre. El identificador ya no cambia, aunque después edites el nombre: es el que une la promoción con sus SKU, su ejecución y su medición.</p></div></div>
      <div class="panel__body"><div class="field-grid">
        ${field('pm-n-name', 'Nombre de la promoción', input('pm-n-name', ''), 'Obligatorio.')}
        ${field('pm-n-channel', 'Canal', `<select id="pm-n-channel">${channels().map(([id, l]) => `<option value="${esc(id)}">${esc(l)}</option>`).join('')}</select>`)}
        ${field('pm-n-obj', 'Objetivo', `<select id="pm-n-obj">${opt(P().OBJECTIVES, 'sales')}</select>`)}
        ${field('pm-n-start', 'Inicio planeado', input('pm-n-start', '', 'date'))}
        ${field('pm-n-end', 'Fin planeado', input('pm-n-end', '', 'date'))}
        ${field('pm-n-prop', 'Propuesta de origen (opcional)', input('pm-n-prop', ''), 'Nombre de la propuesta de negociación de la que sale, si existe.')}
      </div><div class="btn-row"><button type="button" class="btn btn--primary" data-action="pm-create">Crear y generar identificador</button><button type="button" class="btn btn--ghost" data-action="pm-new-cancel">Cancelar</button></div>
      <p class="field__hint">Se registra como creada por: <strong>${esc(pm.actor || '(escribe tu nombre arriba)')}</strong>.</p></div></section>`;
  }

  function detail(reg, p, actor, camps, fold) {
    const esc = H().esc, pill = H().pill, Pm = P();
    const editable = !['closed', 'cancelled'].includes(p.status);
    const early = ['draft', 'proposed'].includes(p.status);
    const live = ['published', 'measuring'].includes(p.status);
    const overlaps = Pm.overlaps(reg, p.promoId);

    const head = `<section class="panel" aria-labelledby="pm-t-det"><div class="panel__head"><div>
      <h2 class="panel__title" id="pm-t-det">${esc(p.name)} ${pill(PILL[p.status] || 'na', Pm.STATUS[p.status])}</h2>
      <p class="panel__desc">Identificador: <strong class="num">${esc(p.promoId)}</strong> · creada por ${esc(p.createdBy)}${p.approvedBy ? ` · aprobada por ${esc(p.approvedBy)}` : ''}. El identificador no cambia.</p></div>
      <div class="btn-row"><button type="button" class="btn btn--small" data-action="pm-export-csv" data-id="${esc(p.promoId)}">Exportar CSV</button><button type="button" class="btn btn--small" data-action="pm-export-json" data-id="${esc(p.promoId)}">Exportar JSON</button><button type="button" class="btn btn--small btn--ghost" data-action="pm-close-detail">Cerrar detalle</button></div></div>
      <div class="panel__body">${editable ? `<div class="field-grid">
        ${field('pm-e-name', 'Nombre', input('pm-e-name', p.name, 'text', early ? '' : 'disabled'), early ? 'Se puede editar solo en borrador o propuesta.' : 'Bloqueado después de aprobar.')}
        ${field('pm-e-channel', 'Canal', `<select id="pm-e-channel">${channels().map(([id, l]) => `<option value="${esc(id)}"${id === p.channel ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
        ${field('pm-e-obj', 'Objetivo', `<select id="pm-e-obj">${opt(Pm.OBJECTIVES, p.objective)}</select>`)}
        ${field('pm-e-start', 'Inicio planeado', input('pm-e-start', p.plannedStart, 'date'))}
        ${field('pm-e-end', 'Fin planeado', input('pm-e-end', p.plannedEnd, 'date'))}
        ${field('pm-e-prop', 'Propuesta de origen', input('pm-e-prop', p.proposalName))}
        ${field('pm-e-camp', 'Campaña', `<input id="pm-e-camp" type="text" list="pm-camps" value="${esc(p.campaign || '')}" autocomplete="off"><datalist id="pm-camps">${(camps || []).map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>`, 'La meta numérica se fija por campaña (en esta pestaña, más abajo: Metas por campaña).')}
      </div><div class="btn-row"><button type="button" class="btn" data-action="pm-save-head" data-id="${esc(p.promoId)}">Guardar cambios</button></div>`
        : `<p class="panel__desc">${esc(Pm.OBJECTIVES[p.objective])} · ${esc(channelLabel(p.channel))} · ${esc(dateTxt(p.plannedStart))} a ${esc(dateTxt(p.plannedEnd))}${p.campaign ? ` · campaña ${esc(p.campaign)}` : ''}</p>`}</div></section>`;

    // SKU
    const skuRows = p.skus.map((s, i) => `<tr><td><span class="num">${esc(p.promoId)} · ${esc(s.sku)}</span></td><td>${esc(s.name || '—')}</td>
      <td>${esc(Pm.ORIGINS[s.origin] || s.origin)}${s.offerId ? `<span class="cell-sub">${esc(s.offerId)}</span>` : ''}${s.reason ? `<span class="cell-sub">${esc(s.reason)}</span>` : ''}</td>
      <td>${esc(s.mechanic || '—')}${s.condition ? `<span class="cell-sub">${esc(s.condition)}</span>` : ''}</td>
      <td>${live && editable ? `<input id="pm-rs-${i}" type="date" value="${esc(s.realStart || '')}" aria-label="Inicio real de ${esc(s.sku)}"> <input id="pm-re-${i}" type="date" value="${esc(s.realEnd || '')}" aria-label="Fin real de ${esc(s.sku)}"> <button type="button" class="btn btn--small" data-action="pm-sku-dates" data-id="${esc(p.promoId)}" data-sku="${esc(s.sku)}" data-i="${i}">Guardar</button>` : `${esc(dateTxt(s.realStart))} a ${esc(dateTxt(s.realEnd))}`}</td>
      <td>${early ? `<button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="pm-sku-del" data-id="${esc(p.promoId)}" data-sku="${esc(s.sku)}">Quitar</button>` : ''}</td></tr>`).join('');
    const skuAdd = early ? `<div class="field-grid">
      ${field('pm-s-sku', 'SKU', input('pm-s-sku', ''))}${field('pm-s-name', 'Producto (opcional)', input('pm-s-name', ''))}
      ${field('pm-s-origin', 'Origen', `<select id="pm-s-origin">${opt(Pm.ORIGINS, 'digital')}</select>`)}
      ${field('pm-s-mech', 'Mecánica (opcional)', input('pm-s-mech', ''), 'Por ejemplo 2 x 1 o descuento. No se calcula ningún precio.')}
      ${field('pm-s-cond', 'Condición propuesta (opcional)', input('pm-s-cond', ''))}
      ${field('pm-s-reason', 'Razón de inclusión', input('pm-s-reason', ''), 'Obligatoria si el SKU se agrega a mano.')}
      </div><div class="btn-row"><button type="button" class="btn" data-action="pm-sku-add" data-id="${esc(p.promoId)}">Agregar SKU</button></div>` : '';
    const skus = `<section class="panel" aria-labelledby="pm-t-sku"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-sku">SKU de la promoción (${p.skus.length})</h2>
      <p class="panel__desc">Cada SKU queda con la clave identificador + SKU. Las fechas reales se registran cuando la promoción está publicada; la medición las usará para leer la venta y el embudo del SKU.</p></div></div>
      <div class="panel__body panel__body--flush">${p.skus.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Clave</th><th>Producto</th><th>Origen</th><th>Mecánica y condición</th><th>Fechas reales</th><th></th></tr></thead><tbody>${skuRows}</tbody></table></div>` : '<div class="empty"><strong>Sin SKU</strong>Agrega al menos uno para poder enviar la propuesta.</div>'}</div>
      ${skuAdd ? `<div class="panel__body">${skuAdd}</div>` : ''}
      ${overlaps.length ? `<div class="panel__body"><div class="note note--warn"><strong>Días compartidos con otras promociones.</strong> ${overlaps.map((o) => `${esc(o.sku)} con ${esc(o.otherName)} (${esc(o.other)}) del ${esc(o.from)} al ${esc(o.to)}`).join('; ')}. Esos SKU-día llevarán ambos identificadores y se contarán una sola vez al medir.</div></div>` : ''}</section>`;

    // Activaciones e incidencias
    const actRows = p.activations.map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(Pm.SPACES[a.space] || a.space)}${a.location ? `<span class="cell-sub">${esc(a.location)}</span>` : ''}</td>
      <td>${esc(dateTxt(a.start))} a ${esc(dateTxt(a.end))}</td><td>${esc(a.owner || '—')}</td>
      <td>${editable ? `<select data-action="pm-act-status" data-id="${esc(p.promoId)}" data-act="${esc(a.id)}" aria-label="Estado de ${esc(a.id)}">${opt(Pm.ACT_STATUS, a.status)}</select>` : esc(Pm.ACT_STATUS[a.status])}</td></tr>`).join('');
    const incRows = p.incidents.map((i) => `<li>${esc(i.at)}: ${esc(i.text)}${i.by ? ` <span class="cell-sub">${esc(i.by)}</span>` : ''}</li>`).join('');
    const exec = `<section class="panel" aria-labelledby="pm-t-exec"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-exec">Activaciones e incidencias</h2>
      <p class="panel__desc">Lo que se pidió publicar y lo que realmente se publicó son cosas distintas. Registrar una activación aquí no publica nada en el sitio ni en la app.</p></div></div>
      <div class="panel__body panel__body--flush">${p.activations.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Id</th><th>Espacio o medio</th><th>Fechas</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>${actRows}</tbody></table></div>` : '<div class="empty"><strong>Sin activaciones</strong>Registra banner, cuadrícula, buscador, pauta o correo.</div>'}</div>
      ${editable ? `<div class="panel__body"><div class="field-grid">
        ${field('pm-a-space', 'Espacio o medio', `<select id="pm-a-space">${opt(Pm.SPACES, 'banner')}</select>`)}${field('pm-a-loc', 'Ubicación (opcional)', input('pm-a-loc', ''))}
        ${field('pm-a-start', 'Inicio', input('pm-a-start', '', 'date'))}${field('pm-a-end', 'Fin', input('pm-a-end', '', 'date'))}${field('pm-a-owner', 'Responsable', input('pm-a-owner', ''))}
        </div><div class="btn-row"><button type="button" class="btn" data-action="pm-act-add" data-id="${esc(p.promoId)}">Agregar activación</button></div>
        <div class="field-grid">${field('pm-i-text', 'Incidencia', input('pm-i-text', ''), 'Por ejemplo: el banner entró un día tarde.')}${field('pm-i-date', 'Fecha', input('pm-i-date', '', 'date'))}</div>
        <div class="btn-row"><button type="button" class="btn" data-action="pm-inc-add" data-id="${esc(p.promoId)}">Registrar incidencia</button></div></div>` : ''}
      ${p.incidents.length ? `<div class="panel__body"><ul class="plain-list">${incRows}</ul></div>` : ''}</section>`;

    // Estado
    const nexts = Pm.NEXT[p.status] || [];
    const isBack = (to) => to === 'draft' || (p.status === 'published' && to === 'approved') || (p.status === 'measuring' && to === 'published');
    const labelOf = (to) => (p.status === 'published' && to === 'approved' ? 'Regresar a aprobada' : p.status === 'measuring' && to === 'published' ? 'Regresar a en marcha' : NEXT_LABEL[to]);
    const stateBtns = nexts.filter((to) => to !== 'proposed').map((to) => `<button type="button" class="btn${isBack(to) ? ' btn--ghost' : ' btn--primary'}" data-action="pm-status" data-id="${esc(p.promoId)}" data-to="${to}">${esc(labelOf(to))}</button>`).join('');
    const approveField = ['draft', 'proposed'].includes(p.status) ? field('pm-st-approver', 'Quién aprueba', input('pm-st-approver', actor || ''), 'Puedes ser tú: quien la arma también puede aprobarla.') : '';
    const backField = ['published', 'measuring'].includes(p.status) ? field('pm-st-back', 'Motivo para regresar un paso (solo si regresas)', input('pm-st-back', ''), 'Queda en el historial.') : '';
    const closeFields = p.status === 'measuring' ? `${field('pm-st-concl', 'Conclusión', `<textarea id="pm-st-concl" rows="3"></textarea>`, 'Obligatoria para cerrar.')}${field('pm-st-rec', 'Recomendación', `<select id="pm-st-rec"><option value="">Elige…</option>${opt(Pm.RECOMMENDATIONS, '')}</select>`)}` : '';
    const delBtn = FP.removal ? `<button type="button" class="btn btn--ghost btn--danger-text" data-action="rm-promo-ask" data-id="${esc(p.promoId)}">Eliminar…</button>` : '';
    const cancel = editable ? `${field('pm-st-cancel', 'Motivo para cancelar', input('pm-st-cancel', ''))}<div class="btn-row"><button type="button" class="btn btn--ghost btn--danger-text" data-action="pm-status" data-id="${esc(p.promoId)}" data-to="cancelled">Cancelar promoción</button>${delBtn}</div><p class="field__hint">Cancelar conserva el historial; eliminar lo quita.</p>` : `<div class="btn-row">${delBtn}</div>`;
    const status = `<section class="panel" aria-labelledby="pm-t-st"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-st">Estado y aprobación</h2>
      <p class="panel__desc">Borrador (puede pasar por «en aprobación») → Aprobada → En marcha (publicada, luego en medición) → Cerrada. Cada cambio guarda quién y cuándo, y no se puede borrar. «En medición» solo se alcanza cuando la vigencia ya terminó.</p></div></div>
      <div class="panel__body">${approveField}${backField}${closeFields}${stateBtns ? `<div class="btn-row">${stateBtns}</div>` : ''}${cancel}</div></section>`;

    // Línea base congelada
    const showBase = ['approved', 'published', 'measuring', 'closed'].includes(p.status);
    const bz = p.baseline;
    const bzRows = bz ? p.skus.map((s) => { const e = bz.skus[s.sku]; const sumR = e ? e.rows.reduce((t, r) => t + r[1], 0) : 0, sumU = e ? e.rows.reduce((t, r) => t + r[2], 0) : 0;
      return `<tr><td><span class="num">${esc(s.sku)}</span></td><td>${esc(s.name || '—')}</td><td class="num">${e ? esc(e.from) + ' a ' + esc(e.to) : '—'}</td><td class="num">${e ? e.rows.length : 0}</td><td class="num">${e && e.rows.length ? esc(sumR.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })) : '—'}</td><td class="num">${e && e.rows.length ? esc(Math.round(sumU)) : '—'}</td></tr>`; }).join('') : '';
    const baseline = !showBase ? '' : `<section class="panel" aria-labelledby="pm-t-bz"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-bz">Línea base congelada</h2>
      <p class="panel__desc">La venta de referencia de los SKU de la promoción tal como estaba cargada al aprobarla: los 56 días anteriores al inicio planeado. La medición compara contra esta copia, así que recargar o corregir la venta después no cambia la base. También se congelan los días que se sacaron de la base por otra promoción o evento. No guarda precios ni márgenes.</p></div></div>
      <div class="panel__body">${bz && FP.promotionEvaluation && FP.promotionEvaluation.staleBaseline(p).length ? `<div class="note note--warn"><strong>La base puede estar desfasada.</strong> ${FP.promotionEvaluation.staleBaseline(p).map((x) => `${esc(x.sku)}: congelada para iniciar el ${esc(x.frozenStart)}, ahora inicia el ${esc(x.start)}`).join('; ')}. ${['approved', 'published'].includes(p.status) ? 'Vuelve a congelar con el botón de abajo.' : 'Ya no se puede congelar de nuevo en este estado.'}</div>` : ''}${bz ? `<p class="panel__desc">Congelada el <strong class="num">${esc(when(bz.frozenAt))}</strong> con venta cargada hasta <strong class="num">${esc(bz.dataMax || '—')}</strong>. ${bz.rows ? '' : '<strong>No había venta cargada antes del inicio.</strong>'}</p>
        <div class="table-wrap"><table class="table ds-table"><thead><tr><th>SKU</th><th>Producto</th><th>Periodo de referencia</th><th>Días con dato</th><th>Venta de referencia</th><th>Unidades</th></tr></thead><tbody>${bzRows}</tbody></table></div>`
        : `<div class="note note--warn"><strong>Sin línea base congelada.</strong> La medición usará la venta cargada en ese momento, que puede haber cambiado desde la aprobación.</div>`}
        ${['approved', 'published'].includes(p.status) ? `<div class="btn-row"><button type="button" class="btn btn--small" data-action="pm-freeze" data-id="${esc(p.promoId)}">${bz ? 'Volver a congelar con la venta actual' : 'Congelar la línea base ahora'}</button></div>` : ''}</div></section>`;

    const hist = p.history.slice().reverse().map((h) => `<li><span class="num">${esc(when(h.at))}</span> · ${esc(histText(h))}${h.by ? ` <span class="cell-sub">${esc(h.by)}</span>` : ''}</li>`).join('');
    const history = `<section class="panel" aria-labelledby="pm-t-h"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-h">Historial</h2><p class="panel__desc">Solo se agrega, no se edita.</p></div></div>
      <div class="panel__body"><ul class="plain-list">${hist}</ul></div></section>`;
    const concl = p.conclusion ? `<section class="panel"><div class="panel__body"><strong>Conclusión.</strong> ${esc(p.conclusion)} <strong>Recomendación:</strong> ${esc(Pm.RECOMMENDATIONS[p.recommendation] || '—')}</div></section>` : '';
    // SKU, línea base e historial vienen plegados; se abren con un clic (todo viene cerrado; se abre con un clic)
    const F = fold || {}, wrap = (key, label, extra, html, dflt) => {
      if (!html) return '';
      const open = key in F ? !!F[key] : !!dflt;
      return `<div class="gd-foldrow"><button type="button" class="gd-fold" data-action="pm-fold" data-fold="${key}" data-open="${open ? 1 : 0}" aria-expanded="${open}"><span>${esc(label)}${extra ? ` <span class="cell-sub">${esc(extra)}</span>` : ''}</span><span aria-hidden="true">${open ? '▾' : '▸'}</span></button></div>${open ? html : ''}`;
    };
    return head + wrap('skus', `SKU de la promoción (${p.skus.length})`, p.skus.length ? '' : 'todavía sin SKU', skus, false)
      + wrap('baseline', 'Línea base congelada', p.baseline ? 'congelada' : 'sin congelar', baseline, false) + exec + status + concl
      + wrap('history', `Historial (${p.history.length})`, '', history, false);
  }

  function histText(h) {
    const S = P().STATUS;
    if (h.field === 'status') return `Estado: ${h.from ? S[h.from] : '—'} → ${S[h.to] || h.to}${h.note ? `. ${h.note}` : ''}`;
    if (h.field === 'baseline') return h.to ? `Línea base congelada${h.from ? ' (reemplazada)' : ''}${h.note ? `. ${h.note}` : ''}` : `Línea base quitada${h.note ? `. ${h.note}` : ''}`;
    if (h.field === 'sku+') return `SKU agregado: ${h.to}${h.note ? `. ${h.note}` : ''}`;
    if (h.field === 'sku-') return `SKU quitado: ${h.from}`;
    if (h.field === 'activation+') return `Activación agregada: ${h.to}`;
    if (h.field === 'incident+') return `Incidencia: ${h.to}`;
    if (/^activation:/.test(h.field)) return `Activación ${h.field.split(':')[1]}: ${P().ACT_STATUS[h.from] || h.from} → ${P().ACT_STATUS[h.to] || h.to}`;
    if (/^sku:/.test(h.field)) { const [, sku, k] = h.field.split(':'); return `SKU ${sku}, ${k === 'realStart' ? 'inicio real' : k === 'realEnd' ? 'fin real' : k}: ${h.from || '—'} → ${h.to || '—'}`; }
    return `${h.field}: ${h.from === null ? '—' : h.from} → ${h.to === null ? '—' : h.to}`;
  }

  function render(state) {
    const pm = state.pm, reg = pm.reg, esc = H().esc;
    const host = $('pm-body'); if (!host) return;
    const sel = pm.sel ? P().find(reg, pm.sel) : null;
    const msg = pm.msg ? `<div class="note note--${pm.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(pm.msg.text)}${(pm.msg.warnings || []).map((w) => `<br>${esc(w)}`).join('')}</div>` : '';
    const bar = FP.guideView ? FP.guideView.bar(state) + FP.guideView.removalToast(state) + FP.guideView.removalConfirm(state) : '';
    const tab = ['resumen', 'oportunidades', 'ofertas', 'resultados'].includes(pm.tab) ? pm.tab : 'promos';
    const tabs = `<div class="sttabs" role="tablist" aria-label="Secciones de Promociones">${[['resumen', 'Resumen', `${state.sm ? state.sm.reg.proposals.length : 0} propuestas`], ['oportunidades', 'Oportunidades', state.op && state.op.result ? `${state.op.result.counts.total} SKU` : 'del canal digital'], ['ofertas', 'Ofertas recibidas', `${state.of ? state.of.reg.offers.length : 0} ofertas`], ['promos', 'Promociones', `${reg.promotions.length} registradas`], ['resultados', 'Resultados e historial', `${reg.promotions.filter((x) => ['published', 'measuring', 'closed'].includes(x.status)).length} para evaluar`]]
      .map(([id, l, sub]) => `<button type="button" role="tab" class="sttab" id="pmtab-${id}" data-action="pm-tab" data-tab="${id}" aria-selected="${id === tab}"><strong>${esc(l)}</strong><span class="cell-sub">${esc(sub)}</span></button>`).join('')}</div>`;
    if (tab === 'resumen' && FP.summaryView) {
      host.innerHTML = `${bar}${tabs}${FP.summaryView.html(state)}`;
      return;
    }
    if (tab === 'oportunidades' && FP.opportunityView) {
      host.innerHTML = `${bar}${tabs}<section class="panel"><div class="panel__body">${field('pm-actor', 'Tu nombre', input('pm-actor', pm.actor, 'text', 'data-action="pm-actor" autocomplete="name"'), 'Se guarda cuando agregas SKU al plan de una promoción.')}</div></section>${FP.opportunityView.html(state)}`;
      return;
    }
    if (tab === 'resultados' && FP.resultsView) {
      host.innerHTML = `${bar}${tabs}<section class="panel"><div class="panel__body">${field('pm-actor', 'Tu nombre', input('pm-actor', pm.actor, 'text', 'data-action="pm-actor" autocomplete="name"'), 'Se guarda cuando guardas un corte de evaluación.')}</div></section>${FP.resultsView.html(state)}${FP.guideView ? FP.guideView.removalLog(state) : ''}`;
      return;
    }
    if (tab === 'ofertas' && FP.offerView) {
      const msgO = state.of && state.of.msg ? `<div class="note note--${state.of.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(state.of.msg.text)}${(state.of.msg.warnings || []).map((w) => `<br>${esc(w)}`).join('')}</div>` : '';
      host.innerHTML = `${bar}${tabs}${msgO}<section class="panel"><div class="panel__body">${field('pm-actor', 'Tu nombre', input('pm-actor', pm.actor, 'text', 'data-action="pm-actor" autocomplete="name"'), 'Se guarda con cada recepción y cada cambio de estado.')}</div></section>${FP.offerView.html(state)}`;
      return;
    }
    host.innerHTML = bar + tabs + `
      <section class="panel" aria-labelledby="pm-t"><div class="panel__head"><div><h2 class="panel__title" id="pm-t">Promociones</h2>
        <p class="panel__desc">Planea, aprueba, registra lo ejecutado y conserva el historial de cada promoción. Aquí no se calcula venta ni resultados: la medición llega en una fase posterior y leerá la venta del SKU en las fechas reales. Recibir o registrar una promoción no la activa en el sitio ni en la app.</p></div>
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="pm-new">Nueva promoción</button><button type="button" class="btn" data-action="pm-export-csv" data-id="">Exportar todo (CSV)</button><button type="button" class="btn" data-action="pm-export-json" data-id="">Exportar todo (JSON)</button></div></div>
        <div class="panel__body">${field('pm-actor', 'Tu nombre', input('pm-actor', pm.actor, 'text', 'data-action="pm-actor" autocomplete="name"'), 'Se guarda con cada cambio (creó, aprobó, publicó). Se queda en este navegador.')}${msg}</div></section>
      ${pm.creating ? createForm(pm) : ''}
      <section class="panel" aria-labelledby="pm-t-l"><div class="panel__head"><div><h2 class="panel__title" id="pm-t-l">Registro (${reg.promotions.length})</h2></div></div>
        <div class="panel__body panel__body--flush">${listHtml(reg, pm.sel)}</div></section>
      ${FP.goalsView ? FP.goalsView.html(state) : ''}
      ${sel ? detail(reg, sel, pm.actor, FP.goals ? FP.goals.campaignsOf(state.of.reg, reg.promotions, state.cg && state.cg.reg) : [], pm.fold) : ''}`;
  }

  FP.promotionView = { render, val };
})(typeof window !== 'undefined' ? window : globalThis);
