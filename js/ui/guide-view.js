/**
 * guide-view.js — barra «Ahora haz esto» (arriba de las pestañas de Promociones) y resumen con acciones de un clic
 * en Ofertas recibidas y en Oportunidades. Solo pinta lo que calcula FP.guide; los cambios pasan por las acciones gd-* de app.js
 * y usan las mismas reglas de siempre (estados de la oferta, alta de promoción). Es una guía: no activa nada en el sitio ni en la app.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const G = () => FP.guide;
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function ctxOf(state) { return { offers: state.of.reg.offers, promotions: state.pm.reg.promotions, today: todayISO() }; }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function goAttrs(go, esc) {
    if (!go) return '';
    return `data-tab="${esc(go.tab || '')}"${go.filter && go.filter.state ? ` data-fstate="${esc(go.filter.state)}"` : ''}${go.filter && go.filter.issue ? ` data-fissue="${esc(go.filter.issue)}"` : ''}${go.open ? ` data-open="${esc(go.open)}"` : ''}${go.manual ? ' data-manual="1"' : ''}`;
  }

  /** Barra de guía. Se muestra siempre arriba de las pestañas. */
  function bar(state) {
    const esc = H().esc, g = state.gd || {}, ctx = ctxOf(state), s = G().nextStep(ctx);
    const actionAttr = (go, fallback) => (go && go.action ? `data-action="${esc(go.action)}"` : `data-action="${fallback}" ${goAttrs(go, esc)}`);
    const main = s.done ? '' : `<button type="button" class="btn btn--primary gd-bar__btn" ${actionAttr(s.go, 'gd-go')}>${esc(s.button)}</button>`;
    const second = s.second ? `<button type="button" class="btn btn--ghost" data-action="gd-go" ${goAttrs(s.secondGo, esc)}>${esc(s.second)}</button>` : '';
    const list = G().allSteps(ctx).map((x) => `<li class="gd-step gd-step--${x.state}"${x.state === 'now' ? ' aria-current="step"' : ''}><span class="gd-step__n" aria-hidden="true">${x.state === 'done' ? '✓' : x.n}</span><span class="gd-step__t">${esc(x.label)}${x.count && x.state !== 'now' ? ` <span class="cell-sub">${x.count} pendiente${x.count === 1 ? '' : 's'}</span>` : ''}</span></li>`).join('');
    const open = !!g.stepsOpen;
    return `<section class="gd-bar${s.done ? ' gd-bar--done' : ''}" aria-labelledby="gd-t">
      <div class="gd-bar__row"><div class="gd-bar__txt">
        <span class="gd-bar__kicker">${s.done ? 'Al día' : `Ahora haz esto · paso ${s.step} de ${s.total}`}</span>
        <h2 class="gd-bar__title" id="gd-t">${esc(s.title)}</h2><p class="gd-bar__text">${esc(s.text)}</p>
        ${s.note ? `<p class="gd-bar__note">${esc(s.note)}</p>` : ''}</div>
        <div class="btn-row gd-bar__acts">${main}${second}</div></div>
      <div class="gd-bar__foot"><span class="field__hint">Esta barra solo te guía: no activa nada en la web ni en la app.</span>
        <button type="button" class="btn btn--small btn--ghost" data-action="gd-steps" aria-expanded="${open}" aria-controls="gd-steps">${open ? 'Ocultar los pasos' : 'Ver todos los pasos'}</button></div>
      <ol class="gd-steps" id="gd-steps" aria-label="Los seis pasos"${open ? '' : ' hidden'}>${list}</ol></section>`;
  }

  function matrixHtml(m, esc) {
    const L = G().LEVELS;
    const head = `<div></div>${L.map((c) => `<div class="gd-mx__h">Confianza ${c.toLowerCase()}</div>`).join('')}`;
    const rows = L.map((p) => `<div class="gd-mx__r">Prioridad ${p.toLowerCase()}</div>${L.map((c) => {
      const n = m[p][c], aa = p === 'Alta' && c === 'Alta', rev = p === 'Alta' && c !== 'Alta' && n;
      return `<div class="gd-mx__c${aa ? ' gd-mx__c--aa' : ''}" aria-label="Prioridad ${esc(p.toLowerCase())}, confianza ${esc(c.toLowerCase())}: ${n}"><strong class="num">${n}</strong><span>${aa ? 'un clic' : rev ? 'a revisar' : ''}</span></div>`;
    }).join('')}`).join('');
    return `<div class="gd-mx" role="group" aria-label="Prioridad por confianza">${head}${rows}</div>`;
  }

  function toast(state, kind) {
    const u = state.gd && state.gd.undo; if (!u || u.kind !== kind) return '';
    const esc = H().esc;
    return `<div class="gd-toast" role="status"><span>${esc(u.text)}</span><button type="button" class="btn btn--small btn--ghost" data-action="gd-undo">Deshacer</button></div>`;
  }

  function confirmHtml(state) {
    const c = state.gd && state.gd.confirm; if (!c) return '';
    const esc = H().esc;
    const out = [];
    if (c.out.notAA) out.push(`${plural(c.out.notAA, 'validada', 'validadas')} no son de prioridad Alta con confianza Alta (se revisan aparte)`);
    if (c.out.blocked.length) out.push(`${plural(c.out.blocked.length, 'no se puede seleccionar', 'no se pueden seleccionar')}: ${c.out.blocked.slice(0, 4).map((b) => `${b.sku} (${b.why.replace(/\.$/, '')})`).join('; ')}${c.out.blocked.length > 4 ? '…' : ''}`);
    return `<div class="note note--warn gd-confirm" role="alert"><strong>Se van a seleccionar ${c.ok.length} ${c.ok.length === 1 ? 'oferta' : 'ofertas'}:</strong>
      ${c.ok.slice(0, 8).map((o) => esc(`${o.sku} ${o.name ? '· ' + o.name : ''}`)).join('<br>')}${c.ok.length > 8 ? `<br>…y ${c.ok.length - 8} más` : ''}
      ${out.length ? `<p>Quedan fuera: ${out.map(esc).join('. ')}.</p>` : ''}
      <div class="btn-row"><button type="button" class="btn btn--primary" data-action="gd-select-confirm"${c.ok.length ? '' : ' disabled'}>Seleccionar las ${c.ok.length}</button><button type="button" class="btn btn--ghost" data-action="gd-select-cancel">Cancelar</button></div></div>`;
  }

  /** Resumen de Ofertas recibidas: matriz, estados, alertas, banner y acciones de un clic. */
  function offerSummary(state, an, recs) {
    const esc = H().esc, reg = state.of.reg; if (!reg.offers.length) return '';
    const P = state.ac.reg.params, S = G().offerSummary(reg, an, recs, P, todayISO());
    const st = FP.offers.STATE, c = S.byState;
    const chip = (k, cls) => `<span class="gd-chip ${cls}"><strong class="num">${c[k]}</strong> ${esc(st[k])}${c[k] === 1 ? '' : 's'}</span>`;
    const bn = S.banner;
    const extras = [];
    if (S.soon) extras.push(`${plural(S.soon, 'oferta vence', 'ofertas vencen')} en 5 días o menos`);
    if (S.starting) extras.push(`${plural(S.starting, 'oferta empieza', 'ofertas empiezan')} en 5 días o menos`);
    const groups = S.groups.map((g) => `<div class="gd-grp"><div class="gd-grp__t"><strong>${esc(g.title)}</strong> <span class="gd-count">${g.n}</span><span class="cell-sub">${esc(g.text)}</span></div>
      <button type="button" class="btn btn--small" data-action="gd-go" data-tab="ofertas" data-fstate="received" data-fissue="${esc(g.issue)}">Ver ${g.n === 1 ? 'la oferta' : `las ${g.n}`}</button></div>`).join('');
    return `<section class="panel gd-sum" aria-labelledby="gd-sum-t"><div class="panel__head"><div><h2 class="panel__title" id="gd-sum-t">Resumen de las ${S.total} ofertas cargadas</h2>
      <p class="panel__desc">Cuenta todas las ofertas cargadas, de cualquier archivo o campaña. La activación sugerida es una regla con su razón escrita, no un efecto medido.</p></div></div>
      <div class="panel__body"><div class="gd-sum__grid">
        <div><h3 class="gd-h">Activación sugerida · prioridad por confianza</h3>${matrixHtml(S.matrix, esc)}
          <p class="field__hint">${S.noRec ? `${plural(S.noRec, 'oferta sin sugerencia', 'ofertas sin sugerencia')} (producto agotado, control distinto de «Ningún Control» o descartada).` : 'Todas las ofertas activas tienen sugerencia.'}</p></div>
        <div><h3 class="gd-h">Estado de la oferta</h3><div class="gd-chips">${chip('received', 'gd-chip--rec')}${chip('validated', 'gd-chip--val')}${chip('selected', 'gd-chip--sel')}${chip('discarded', 'gd-chip--dis')}</div>
          <h3 class="gd-h">Alertas de las ${c.received} recibidas</h3>
          <div class="gd-al gd-al--ok"><span>Sin alertas</span><strong class="num">${S.clean}</strong></div><div class="gd-al gd-al--warn"><span>Por revisar</span><strong class="num">${S.review}</strong></div>
          <div class="gd-al"><span>Espacios de banner${bn.shared ? ' (compartidos con Oportunidades)' : ''}</span><strong class="num">${bn.used} de ${bn.slots}</strong></div>
          ${extras.length ? `<p class="field__hint">${extras.map(esc).join(' · ')}.</p>` : ''}
          ${S.altaSinOferta ? `<p class="field__hint">${plural(S.altaSinOferta, 'SKU de prioridad Alta no tiene', 'SKU de prioridad Alta no tienen')} oferta cargada. <button type="button" class="linklike" data-action="gd-go" data-tab="oportunidades">Verlos en Oportunidades</button></p>` : ''}</div>
      </div>
      <div class="gd-acts"><div><h3 class="gd-h">Un clic · validar</h3>
          <button type="button" class="btn btn--primary" data-action="gd-validate-clean"${S.clean ? '' : ' disabled'}>Validar las ${S.clean} sin alertas</button>
          <p class="field__hint">Solo las recibidas sin ninguna alerta. Las ${S.review} con alertas no se tocan: quedan en «Por revisar».</p></div>
        <div><h3 class="gd-h">Un clic · seleccionar</h3>
          <button type="button" class="btn btn--primary" data-action="gd-select-aa"${S.aa.length ? '' : ' disabled'}>Seleccionar las ${S.aa.length} validadas de prioridad Alta y confianza Alta</button>
          <p class="field__hint">Antes de aplicar te muestro la lista y qué queda fuera. Las de confianza media o baja se revisan aparte.</p></div></div>
      ${confirmHtml(state)}${toast(state, 'offers')}
      ${groups ? `<h3 class="gd-h">Por revisar (${S.review})</h3><p class="field__hint">Agrupadas por motivo, para resolverlas en grupo y no una por una.</p><div class="gd-grps">${groups}</div>` : ''}
      </div></section>`;
  }

  /** Resumen de Oportunidades: misma matriz y un clic para llevar las de prioridad Alta con confianza Alta al plan. */
  function opportunitySummary(state, recs) {
    const esc = H().esc, op = state.op; if (!op.result) return '';
    const S = G().opportunitySummary(recs, state.ac.reg.params), bn = S.banner;
    const promos = state.pm.reg.promotions.filter((p) => ['draft', 'proposed'].includes(p.status));
    const act = !S.aa.length ? '<button type="button" class="btn btn--primary" disabled>No hay oportunidades de prioridad Alta con confianza Alta</button>'
      : promos.length ? `<div class="btn-row"><select id="gd-op-promo" aria-label="Promoción destino">${promos.map((p) => `<option value="${esc(p.promoId)}">${esc(p.promoId)} · ${esc(p.name)}</option>`).join('')}</select>
          <button type="button" class="btn btn--primary" data-action="gd-op-add">Agregar al plan las ${S.aa.length} de prioridad Alta y confianza Alta</button></div>`
        : `<button type="button" class="btn btn--primary" data-action="gd-op-mark">Marcar las ${S.aa.length} de prioridad Alta y confianza Alta</button><p class="field__hint">No hay una promoción en borrador o propuesta: créala en la pestaña Promociones para agregarlas.</p>`;
    return `<section class="panel gd-sum" aria-labelledby="gd-osum-t"><div class="panel__head"><div><h2 class="panel__title" id="gd-osum-t">Resumen de ${S.total} SKU con activación sugerida</h2>
      <p class="panel__desc">El mismo resumen que en Ofertas recibidas. Aquí solo cuentan los productos sin oferta vigente.</p></div></div>
      <div class="panel__body"><div class="gd-sum__grid"><div><h3 class="gd-h">Prioridad por confianza</h3>${matrixHtml(S.matrix, esc)}
        ${S.noRec ? `<p class="field__hint">${plural(S.noRec, 'SKU sin sugerencia', 'SKU sin sugerencia')}.</p>` : ''}</div>
        <div><div class="gd-al"><span>Espacios de banner${bn.shared ? ' (compartidos con Ofertas)' : ''}</span><strong class="num">${bn.used} de ${bn.slots}</strong></div>
          ${S.aa.length && bn.slots - bn.used < S.aa.length ? `<p class="field__hint">Hay ${S.aa.length} de prioridad Alta con confianza Alta y quedan ${Math.max(0, bn.slots - bn.used)} espacios de banner; el resto va a otros espacios (el banner se limita por venta).</p>` : ''}</div></div>
      <div class="gd-acts gd-acts--one"><div>${act}<p class="field__hint">Solo propone un plan: no activa nada en la web ni en la app.</p></div></div>
      ${toast(state, 'opp')}</div></section>`;
  }


  /* ---------- Conteo de acciones sugeridas ---------- */
  const SUB = { 'Banner principal': 'Tope compartido de espacios', 'Pauta': 'Convierte bien, pocos la ven', 'CRM (WhatsApp / correo)': 'Oferta con programa', 'CRM: recordatorio de recompra': 'Crónicos en crecimiento',
    'Cuadrícula Home': 'Incluye las que no alcanzaron banner', 'Buscador / cuadrícula de categoría': 'Mucha vista, poca compra', 'Ficha + CRM': 'Mecánica escalonada o larga', 'Cuadrícula de categoría': 'Ubicación por defecto',
    'Redes sociales': 'Descuento alto sin otra regla', 'Revisar antes de colocar': 'Su venta cae: entender la causa', 'No activar': 'Control distinto de «Ningún Control»', 'No activar ahora': 'Producto agotado' };

  /** Cuántos SKU hay en cada acción sugerida, con prioridad, aprobadas y «Ver» (filtra la tabla). tab = 'offer' | 'potential'. */
  function actionsHtml(state, recs, tab) {
    const esc = H().esc, A = FP.activation, ac = state.ac.reg;
    const C = G().actionCounts(recs, tab, (k) => A.stateOf(ac, k)); if (!C.rows.length) return '';
    const cur = tab === 'offer' ? state.of.f.action : state.op.f.action, isOffer = tab === 'offer';
    const miss = G().missingCounts(recs, tab, 5), cmp = isOffer ? G().compareExternal(recs, tab, ac.external) : { loaded: false };
    const rows = C.rows.map((r) => `<tr${cur === r.label ? ' aria-selected="true"' : ''}><td><strong>${esc(r.label)}</strong><span class="cell-sub">${esc(SUB[r.label] || '')}</span></td><td class="num"><strong>${r.n}</strong></td>
      <td><span class="gd-bar-m" aria-hidden="true"><span style="width:${C.max ? Math.round(r.n / C.max * 100) : 0}%"></span></span></td>
      <td>${r.blocked ? '<span class="cell-sub">No aplica</span>' : `Alta ${r.a} · Media ${r.m} · Baja ${r.b}`}</td>${isOffer ? `<td class="num">${r.approved}</td>` : ''}
      <td><button type="button" class="btn btn--small" data-action="gd-act" data-tab="${tab}" data-label="${esc(r.label)}">${cur === r.label ? 'Quitar filtro' : 'Ver'}</button></td></tr>`).join('');
    const missHtml = miss.length ? `<div><h3 class="gd-h">Qué falta para decidir mejor</h3>${miss.map((m) => `<div class="gd-al"><span>${esc(m.text)}</span><strong class="num">${m.n} SKU</strong></div>`).join('')}
      <p class="field__hint">Sale de la razón escrita de cada sugerencia: te dice qué dato cargar primero.</p></div>` : '';
    const cmpHtml = cmp.loaded ? `<div><h3 class="gd-h">Contra las sugerencias que te compartieron</h3><div class="gd-chips"><span class="gd-chip gd-chip--val"><strong class="num">${cmp.match}</strong> coinciden</span><span class="gd-chip gd-chip--rec"><strong class="num">${cmp.differ}</strong> difieren</span>
      <span class="gd-chip"><strong class="num">${cmp.none}</strong> sin sugerencia cargada</span>${cmp.unknown ? `<span class="gd-chip"><strong class="num">${cmp.unknown}</strong> canal no reconocido</span>` : ''}</div></div>` : '';
    return `<section class="panel gd-act" aria-labelledby="gd-act-t-${tab}"><div class="panel__head"><div><h2 class="panel__title" id="gd-act-t-${tab}">Acciones sugeridas · cuántos SKU hay en cada una</h2>
      <p class="panel__desc">Cuenta SKU ${isOffer ? 'de ofertas activas' : 'sin oferta vigente'}; si un SKU está en dos ofertas cuenta una vez. Es una regla con su razón escrita, no un efecto medido.</p></div>
      <div class="btn-row"><button type="button" class="btn btn--small" data-action="ac-export-xlsx" data-tab="${isOffer ? 'offer' : 'potential'}">Exportar plan de activación (Excel)</button></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Acción sugerida</th><th>SKU</th><th>Reparto</th><th>Prioridad</th>${isOffer ? '<th>Aprobadas</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th><th class="num">${C.total}</th><th></th><th></th>${isOffer ? '<th></th>' : ''}<th></th></tr></tfoot></table></div></div>
      ${missHtml || cmpHtml ? `<div class="panel__body"><div class="gd-sum__grid">${missHtml}${cmpHtml}</div></div>` : ''}</section>`;
  }

  /* ---------- Eliminar ofertas y promociones ---------- */
  function removalToast(state) {
    const u = state.gd && state.gd.undo; if (!u || (u.kind !== 'rm-offers' && u.kind !== 'rm-promo')) return '';
    return `<div class="gd-toast gd-toast--page" role="status"><span>${H().esc(u.text)}</span><button type="button" class="btn btn--small btn--ghost" data-action="gd-undo">Deshacer</button></div>`;
  }

  /** Confirmación de eliminar: cuántas se van, cuáles no y por qué, y el motivo (obligatorio). */
  function removalConfirm(state) {
    const c = state.rm && state.rm.confirm; if (!c) return '';
    const esc = H().esc;
    const reason = `<label class="field"><span class="field__label">Motivo (obligatorio)</span><input id="rm-reason" type="text" value="${esc(c.reason || '')}" autocomplete="off"></label>`;
    if (c.kind === 'offers') {
      const nb = c.plan.blocked.length, no = c.plan.ok.length;
      return `<section class="panel gd-rm" id="rm-confirm" role="alertdialog" aria-labelledby="rm-t"><div class="panel__body"><h2 class="panel__title" id="rm-t">¿Eliminar ${esc(c.label)}?</h2>
        <p>${no ? `Se ${no === 1 ? 'eliminará' : 'eliminarán'} <strong>${no} ${no === 1 ? 'oferta' : 'ofertas'}</strong> (Recibidas, Validadas o Descartadas).` : '<strong>No hay ninguna que se pueda eliminar.</strong>'}</p>
        ${nb ? `<div class="note note--warn"><strong>${nb} no se ${nb === 1 ? 'elimina' : 'eliminan'}:</strong><ul class="plain-list">${c.plan.blocked.slice(0, 6).map((b) => `<li>${esc(b.offer.sku)} · ${esc(b.why)}</li>`).join('')}${nb > 6 ? `<li>…y ${nb - 6} más</li>` : ''}</ul></div>` : ''}
        ${no ? `${reason}<p class="field__hint">Eliminar quita el registro; descartar lo conserva. Queda una línea en el registro de eliminaciones y puedes deshacerlo mientras no recargues la página.</p>` : ''}
        <div class="btn-row">${no ? `<button type="button" class="btn btn--danger" data-action="rm-confirm">Eliminar ${no === 1 ? 'la oferta' : `las ${no}`}</button>` : ''}<button type="button" class="btn btn--ghost" data-action="rm-cancel">Cancelar</button></div></div></section>`;
    }
    const p = FP.promotions.find(state.pm.reg, c.promoId); if (!p) return '';
    const offers = p.skus.filter((s) => s.offerId).length, digital = p.skus.length - offers;
    return `<section class="panel gd-rm" id="rm-confirm" role="alertdialog" aria-labelledby="rm-t"><div class="panel__body"><h2 class="panel__title" id="rm-t">¿Eliminar la promoción «${esc(p.name)}»?</h2>
      <p>Está en <strong>${esc(FP.promotions.STATUS[p.status].toLowerCase())}</strong>, con <strong>${p.skus.length} SKU</strong>, y nunca se aprobó.</p>
      <div class="note"><strong>Qué pasa con sus SKU:</strong> ${offers ? `las ${offers} ofertas que vinieron de aquí quedan otra vez pendientes de promoción y la guía te pedirá armar otra. ` : ''}${digital ? `${digital} SKU de oportunidades solo salen del plan.` : ''}</div>
      <p class="field__hint">El identificador ${esc(p.promoId)} no se vuelve a usar.</p>${reason}
      <div class="btn-row"><button type="button" class="btn btn--danger" data-action="rm-confirm">Eliminar promoción</button><button type="button" class="btn btn--ghost" data-action="rm-cancel">Cancelar</button></div></div></section>`;
  }

  /** Registro de eliminaciones (qué, cuántas, quién, cuándo, por qué). */
  function removalLog(state) {
    const log = state.rm && state.rm.log; if (!log) return '';
    const esc = H().esc, KIND = { offers: 'Ofertas', batch: 'Archivo', promotion: 'Promoción' };
    const rows = log.entries.length ? log.entries.slice(0, 50).map((e) => `<tr><td class="num">${esc(String(e.at).slice(0, 16).replace('T', ' '))}</td><td>${esc(e.what)}</td><td class="num">${e.n}</td><td>${esc(e.by)}</td><td>${esc(KIND[e.kind] || e.kind)}</td><td>${esc(e.reason)}</td></tr>`).join('')
      : '<tr><td colspan="6"><span class="cell-sub">Todavía no se ha eliminado nada.</span></td></tr>';
    return `<section class="panel" aria-labelledby="rm-log-t"><div class="panel__head"><div><h2 class="panel__title" id="rm-log-t">Registro de eliminaciones (${log.entries.length})</h2>
      <p class="panel__desc">Una línea por eliminación. No guarda precios ni descuentos. Descartar y cancelar no aparecen aquí: se quedan en el historial de cada oferta o promoción.</p></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Cuándo</th><th>Qué</th><th>Cuántas</th><th>Quién</th><th>Tipo</th><th>Motivo</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
  }

  FP.guideView = { bar, offerSummary, opportunitySummary, ctxOf, actionsHtml, removalToast, removalConfirm, removalLog };
})(typeof window !== 'undefined' ? window : globalThis);
