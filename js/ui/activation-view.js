/**
 * activation-view.js — columnas, parámetros y detalle de «Activación sugerida» dentro de Ofertas recibidas y Oportunidades.
 * Solo pinta lo que calcula FP.activation; los cambios pasan por las acciones ac-* de app.js. La sugerencia es una regla con su
 * razón escrita, no un efecto medido; el estado (Sugerida, Aprobada, Ejecutada, Descartada) es una etiqueta y no bloquea nada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const A = () => FP.activation;
  const $ = (id) => document.getElementById(id);
  const PRIO_PILL = { Alta: 'ok', Media: 'warning', Baja: 'na' };
  const CONF_PILL = { Alta: 'ok', Media: 'warning', Baja: 'error' };
  const STATE_PILL = { suggested: 'na', approved: 'ok', executed: 'ok', discarded: 'error' };
  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const when = (at) => { try { return new Date(at).toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; } };
  function field(id, label, html, hint) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`; }
  const input = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${H().esc(v === null || v === undefined ? '' : v)}" ${extra}>`;

  /** Recomendaciones de todas las ofertas y todas las oportunidades (el tope de banner se reparte entre ambas pestañas). */
  function recs(state) {
    const op = state.op;
    return A().recommendAll({ offers: state.of.reg.offers, items: op.result ? op.result.items : [], profiles: op.result ? op.result.profiles : null, params: state.ac.reg.params });
  }
  const extFor = (state, sku) => { const e = state.ac.reg.external; return e && e.rows ? e.rows[sku] || null : null; };

  function headCells(state) {
    return `<th>Activación sugerida</th><th>Prioridad · confianza</th>${state.ac.reg.external ? '<th>Sugerencia cargada</th>' : ''}<th>Estado</th>`;
  }
  function cells(state, rec) {
    const esc = H().esc, pill = H().pill, reg = state.ac.reg;
    if (!rec) return `<td colspan="${state.ac.reg.external ? 4 : 3}"><span class="cell-sub">Sin sugerencia</span></td>`;
    const st = A().stateOf(reg, rec.key), e = extFor(state, rec.sku), cmp = e ? A().compare(rec, e.space) : '';
    const extCell = reg.external ? `<td>${e ? `${esc(e.space)}${cmp ? `<span class="cell-sub">${esc(A().COMPARE[cmp])}</span>` : ''}` : '<span class="cell-sub">Sin sugerencia</span>'}</td>` : '';
    return `<td><strong>${esc(rec.main)}</strong>${rec.second && rec.second !== '—' ? `<span class="cell-sub">Luego: ${esc(rec.second)}</span>` : ''}</td>
      <td>${rec.priority === '—' ? '—' : pill(PRIO_PILL[rec.priority] || 'na', `Prioridad ${rec.priority.toLowerCase()}`)} ${pill(CONF_PILL[rec.confidence] || 'na', `Confianza ${rec.confidence.toLowerCase()}`)}</td>${extCell}
      <td>${pill(STATE_PILL[st], A().STATES[st])}</td>`;
  }

  function params(state) {
    const esc = H().esc, P = state.ac.reg.params, ext = state.ac.reg.external;
    const modeSel = `<select id="ac-p-mode" data-action="ac-param"><option value="shared"${P.bannerMode === 'shared' ? ' selected' : ''}>Compartido</option><option value="perTab"${P.bannerMode === 'perTab' ? ' selected' : ''}>Por pestaña</option></select>`;
    return `<details class="panel__body"${state.ac.paramsOpen ? ' open' : ''}><summary><strong>Cómo se decide la activación</strong> · parámetros y reglas</summary>
      <div class="field-grid">
        ${field('ac-p-disc', 'Descuento que cuenta como alto (%)', input('ac-p-disc', P.discountHigh, 'number', 'data-action="ac-param" min="0" max="100" step="1"'), 'Aplica a ofertas recibidas.')}
        ${field('ac-p-slots', 'Espacios de banner principal', input('ac-p-slots', P.bannerSlots, 'number', 'data-action="ac-param" min="0" max="20" step="1"'), 'Compiten por venta; el descuento no da ventaja.')}
        ${field('ac-p-mode', 'Cómo se reparte el tope', modeSel, 'Compartido: los espacios de banner se reparten entre Ofertas y plan y Qué impulsar. Uno por pestaña: cada una tiene los suyos.')}
        ${field('ac-p-chronic', 'Categorías de uso crónico', input('ac-p-chronic', P.chronicCategories, 'text', 'data-action="ac-param" placeholder="Ej. ENDOCRINOLOGÍA"'), 'Para oportunidades. Si el archivo de ofertas trae la columna «Crónico / agudo», esa tiene prioridad sobre esta lista.')}
      </div>
      <p class="field__hint">Reglas, en orden. Cada sugerencia explica cuál aplicó y qué dato falta.</p>
      <ol class="plain-list">
        <li><strong>No activar</strong> si el tipo de control no es «Ningún Control» o el producto está agotado.</li>
        <li><strong>Mecánica escalonada o muy larga</strong>: nunca a banner. Ficha y CRM.</li>
        <li><strong>Demanda no convertida</strong>: ya tiene tráfico, no va a pauta. Buscador o cuadrícula de categoría.</li>
        <li><strong>En caída</strong> (oportunidades): revisar la causa antes de darle espacio.</li>
        <li><strong>Visibilidad baja con conversión alta</strong>: pauta si el descuento es alto (o pesa mucho en su categoría); si no, cuadrícula Home.</li>
        <li><strong>Banner principal</strong>: oferta con peso alto en su categoría y descuento alto; oportunidad con peso alto y conversión que no está bajo la mediana.</li>
        <li><strong>Oferta con programa</strong>: CRM. <strong>Oportunidad crónica en crecimiento</strong>: recordatorio de recompra.</li>
        <li><strong>Descuento alto sin otra regla</strong>: redes sociales, prioridad baja. Lo demás: cuadrícula de categoría.</li>
      </ol>
      <div class="btn-row">
        <label class="btn btn--small" for="ac-ext-file">Cargar sugerencias que me comparten</label><input id="ac-ext-file" type="file" accept=".xlsx,.csv" data-action="ac-ext-file" style="position:absolute;left:-9999px">
        ${ext ? `<button type="button" class="btn btn--small btn--ghost" data-action="ac-ext-clear">Quitar sugerencias cargadas</button><span class="field__hint">${esc(ext.fileName)} · ${Object.keys(ext.rows).length} SKU · ${esc(when(ext.at))}</span>` : '<span class="field__hint">Archivo con SKU y el canal o espacio sugerido (y un comentario, si lo hay).</span>'}
      </div></details>`;
  }

  function toolbar(state, tab) {
    const msg = state.ac.msg ? `<div class="note note--${state.ac.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${H().esc(state.ac.msg.text)}${(state.ac.msg.warnings || []).map((w) => `<br>${H().esc(w)}`).join('')}</div>` : '';
    return `${msg}<div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="ac-export-xlsx" data-tab="${tab}">Exportar plan de activación (Excel)</button>
      <button type="button" class="btn btn--small" data-action="ac-export-csv" data-tab="${tab}">CSV</button><span class="field__hint">Exporta las filas visibles de esta pestaña.</span></div>`;
  }

  function detail(state, map, key) {
    const esc = H().esc, pill = H().pill, rec = key ? map.get(key) : null; if (!rec) return '';
    const reg = state.ac.reg, st = A().stateOf(reg, key), it = reg.items[key], e = extFor(state, rec.sku), cmp = e ? A().compare(rec, e.space) : '';
    const hist = it && it.history ? it.history.slice().reverse().map((h) => `<li><span class="num">${esc(when(h.at))}</span> · ${esc(A().STATES[h.from] || '—')} → ${esc(A().STATES[h.to])} · ${esc(h.by)}${h.note ? ` · ${esc(h.note)}` : ''}</li>`).join('') : '';
    const btn = (to, label, cls) => `<button type="button" class="btn btn--small${cls}" data-action="ac-state" data-key="${esc(key)}" data-to="${to}"${st === to ? ' disabled' : ''}>${label}</button>`;
    return `<section class="panel" aria-labelledby="ac-t-det"><div class="panel__head"><div><h2 class="panel__title" id="ac-t-det">Activación sugerida · ${esc(rec.sku)} ${pill(STATE_PILL[st], A().STATES[st])}</h2>
      <p class="panel__desc">${esc(rec.main)}${rec.second && rec.second !== '—' ? ` · luego: ${esc(rec.second)}` : ''}</p></div><button type="button" class="btn btn--small" data-action="ac-close">Cerrar</button></div>
      <div class="panel__body"><h3>Por qué</h3><p>${esc(rec.why)}</p>
        <div class="btn-row">${rec.priority === '—' ? '' : pill(PRIO_PILL[rec.priority] || 'na', `Prioridad ${rec.priority.toLowerCase()}`)} ${pill(CONF_PILL[rec.confidence] || 'na', `Confianza ${rec.confidence.toLowerCase()}`)}</div>
        <h3>Qué falta para decidir mejor</h3>${rec.missing.length ? `<ul class="plain-list">${rec.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p>Nada: la regla es de bloqueo.</p>'}
        ${e ? `<h3>Sugerencia cargada</h3><p>${esc(e.space)}${e.comment ? ` · ${esc(e.comment)}` : ''}${cmp ? ` · <strong>${esc(A().COMPARE[cmp])}</strong>` : ''}</p>` : ''}
        <p class="field__hint">Es una sugerencia por reglas, no un efecto medido. El inventario, el costo de pauta y el efecto de la colocación no se verifican.</p>
        <h3>Estado</h3><p class="field__hint">Etiqueta de seguimiento: no bloquea nada. La aprobación corresponde a la gerencia de ecommerce.</p>
        ${field('ac-s-note', 'Nota o motivo', input('ac-s-note', ''), 'Obligatorio para descartar.')}
        <div class="btn-row">${btn('suggested', 'Volver a sugerida', ' btn--ghost')}${btn('approved', 'Aprobada', ' btn--primary')}${btn('executed', 'Ejecutada', ' btn--primary')}${btn('discarded', 'Descartar', ' btn--ghost')}</div>
        ${hist ? `<h3>Historial</h3><ul class="plain-list">${hist}</ul>` : ''}</div></section>`;
  }

  FP.activationView = { recs, headCells, cells, params, toolbar, detail, val, extFor };
})(typeof window !== 'undefined' ? window : globalThis);
