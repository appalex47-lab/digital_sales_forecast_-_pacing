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
  const money = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
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
      <ol class="gd-steps" id="gd-steps" aria-label="Los cuatro pasos"${open ? '' : ' hidden'}>${list}</ol></section>`;
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
    if (c.out.blocked.length) out.push(`${plural(c.out.blocked.length, 'no se puede armar', 'no se pueden armar')}: ${c.out.blocked.slice(0, 4).map((b) => `${b.sku} (${b.why.replace(/\.$/, '')})`).join('; ')}${c.out.blocked.length > 4 ? '…' : ''}`);
    return `<div class="note note--warn gd-confirm" role="alert"><strong>Se va a armar una promoción en borrador con ${c.ok.length} ${c.ok.length === 1 ? 'oferta' : 'ofertas'}:</strong>
      ${c.ok.slice(0, 8).map((o) => esc(`${o.sku} ${o.name ? '· ' + o.name : ''}`)).join('<br>')}${c.ok.length > 8 ? `<br>…y ${c.ok.length - 8} más` : ''}
      ${out.length ? `<p>Quedan fuera: ${out.map(esc).join('. ')}.</p>` : ''}
      <p class="field__hint">El nombre y las fechas salen de las ofertas. Después pones el objetivo y la apruebas. Puedes deshacerlo.</p>
      <div class="btn-row"><button type="button" class="btn btn--primary" data-action="gd-select-confirm"${c.ok.length ? '' : ' disabled'}>Armar promoción con las ${c.ok.length}</button><button type="button" class="btn btn--ghost" data-action="gd-select-cancel">Cancelar</button></div></div>`;
  }

  /** Tarjetas de prioridad (reemplazan la matriz 3×3): cuántos SKU, cuántos con datos suficientes y qué falta. */
  function cardsHtml(cards, esc, altaBtn) {
    return `<div class="gd-cards" role="group" aria-label="Prioridad de activación">${cards.map((c) => {
      const alta = c.priority === 'Alta';
      const why = alta ? (c.sure ? (c.rest ? `Las otras ${c.rest} no tienen datos suficientes${c.why ? `: ${c.why}` : ''}.` : 'Todas tienen datos suficientes.') : (c.n ? `Ninguna tiene datos suficientes todavía${c.why ? `: ${c.why}` : ''}.` : 'No hay SKU de esta prioridad.')) : (c.n ? 'Se revisan una por una: no se agregan en bloque.' : 'No hay SKU de esta prioridad.');
      return `<div class="gd-card${alta ? ' gd-card--alta' : ''}"><span class="gd-card__t">Prioridad ${esc(c.priority.toLowerCase())}</span><strong class="gd-card__n num">${c.n} <span>SKU</span></strong>
        <span class="gd-card__s"><strong class="num">${c.sure}</strong> con datos suficientes · ${c.rest} por revisar</span>${alta ? altaBtn : ''}<span class="field__hint">${esc(why)}</span></div>`;
    }).join('')}</div>`;
  }

  /** Aviso del periodo con el que se calcula la prioridad. */
  function periodNote(state) {
    const f = state.op.f || {}, esc = H().esc;
    const rng = f.from && f.to ? `${esc(f.from)} al ${esc(f.to)} contra el periodo anterior de la misma duración` : 'se calcula al cargar Oportunidades';
    return `<p class="note gd-period"><strong>Periodo:</strong> ${rng}. Por defecto son los últimos 30 días contra los 30 previos (antes era el mes en curso); cámbialo en Oportunidades.</p>`;
  }

  /** Resumen de Ofertas recibidas: tarjetas de prioridad, acción de un clic y ofertas por revisar. */
  function offerSummary(state, an, recs) {
    const esc = H().esc, reg = state.of.reg; if (!reg.offers.length) return '';
    const P = state.ac.reg.params, S = G().offerSummary(reg, an, recs, P, todayISO());
    const cards = G().priorityCards(S.matrix, recs, 'offer');
    const btn = `<button type="button" class="btn btn--primary" data-action="gd-select-aa"${S.aa.length ? '' : ' disabled'}>${S.aa.length ? `Armar promoción con las ${S.aa.length} de prioridad Alta` : 'Sin ofertas listas para armar en bloque'}</button>`;
    const groups = S.groups.map((g) => `<div class="gd-grp"><div class="gd-grp__t"><strong>${esc(g.title)}</strong> <span class="gd-count">${g.n}</span><span class="cell-sub">${esc(g.text)}</span></div>
      <button type="button" class="btn btn--small" data-action="gd-go" data-tab="ofertas" data-fstate="received" data-fissue="${esc(g.issue)}">Ver ${g.n === 1 ? 'la oferta' : `las ${g.n}`}</button></div>`).join('');
    const extras = [];
    if (S.soon) extras.push(`${plural(S.soon, 'oferta vence', 'ofertas vencen')} en 5 días o menos`);
    if (S.starting) extras.push(`${plural(S.starting, 'oferta empieza', 'ofertas empiezan')} en 5 días o menos`);
    return `<section class="panel gd-sum" aria-labelledby="gd-sum-t"><div class="panel__head"><div><h2 class="panel__title" id="gd-sum-t">¿Qué hago primero? · ${S.active} ofertas activas</h2>
      <p class="panel__desc">Las ofertas sin ninguna alerta ya están «Listas» (se validan solas). La activación sugerida es una regla con su razón escrita, no un efecto medido.${S.noRec ? ` ${plural(S.noRec, 'oferta sin sugerencia', 'ofertas sin sugerencia')} (agotada, control distinto de «Ningún Control» o descartada).` : ''}</p></div></div>
      <div class="panel__body">${periodNote(state)}${cardsHtml(cards, esc, btn)}
        <p class="field__hint">Antes de aplicar te muestro la lista y qué queda fuera. Solo propone: no activa nada en la web ni en la app.${extras.length ? ` ${extras.map(esc).join(' · ')}.` : ''}</p>
        ${confirmHtml(state)}${toast(state, 'offers')}
        ${groups ? `<h3 class="gd-h">Por revisar (${S.review})</h3><p class="field__hint">Agrupadas por motivo, para resolverlas en grupo y no una por una.</p><div class="gd-grps">${groups}</div>` : ''}
      </div></section>`;
  }

  /** Resumen de Oportunidades: las mismas tarjetas y un clic para llevar las de prioridad Alta con datos suficientes al plan. */
  function opportunitySummary(state, recs) {
    const esc = H().esc, op = state.op; if (!op.result) return '';
    const S = G().opportunitySummary(recs, state.ac.reg.params), bn = S.banner;
    const cards = G().priorityCards(S.matrix, recs, 'potential');
    const promos = state.pm.reg.promotions.filter((p) => ['draft', 'proposed'].includes(p.status));
    const act = !S.aa.length ? '<button type="button" class="btn btn--primary" disabled>Sin oportunidades listas para agregar en bloque</button>'
      : promos.length ? `<select id="gd-op-promo" aria-label="Promoción destino">${promos.map((p) => `<option value="${esc(p.promoId)}">${esc(p.promoId)} · ${esc(p.name)}</option>`).join('')}</select>
          <button type="button" class="btn btn--primary" data-action="gd-op-add">Agregar las ${S.aa.length} de prioridad Alta con datos suficientes</button>`
        : `<button type="button" class="btn btn--primary" data-action="gd-op-mark">Marcar las ${S.aa.length} de prioridad Alta con datos suficientes</button>`;
    return `<section class="panel gd-sum" aria-labelledby="gd-osum-t"><div class="panel__head"><div><h2 class="panel__title" id="gd-osum-t">¿Qué hago primero? · ${S.total} SKU con activación sugerida</h2>
      <p class="panel__desc">Mismo resumen que en Ofertas recibidas. Aquí solo cuentan los productos sin oferta vigente.${S.noRec ? ` ${plural(S.noRec, 'SKU sin sugerencia', 'SKU sin sugerencia')}.` : ''}</p></div></div>
      <div class="panel__body">${periodNote(state)}${cardsHtml(cards, esc, act)}
        ${S.aa.length && !promos.length ? '<p class="field__hint">No hay una promoción en borrador o propuesta: créala en la pestaña Promociones para agregarlas.</p>' : ''}
        ${S.aa.length && bn.slots - bn.used < S.aa.length ? `<p class="field__hint">Hay ${S.aa.length} listas y quedan ${Math.max(0, bn.slots - bn.used)} espacios de banner; el resto va a otros espacios.</p>` : ''}
        <p class="field__hint">Solo propone un plan: no activa nada en la web ni en la app.</p>${toast(state, 'opp')}</div></section>`;
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
      <td class="num">${r.sale == null ? '—' : esc(money(r.sale))}</td><td>${r.blocked ? '<span class="cell-sub">No aplica</span>' : `Alta ${r.a} · Media ${r.m} · Baja ${r.b}`}</td>${isOffer ? `<td class="num">${r.approved}</td>` : ''}
      <td><button type="button" class="btn btn--small" data-action="gd-act" data-tab="${tab}" data-label="${esc(r.label)}">${cur === r.label ? 'Quitar filtro' : 'Ver'}</button></td></tr>`).join('');
    const missHtml = miss.length ? `<div><h3 class="gd-h">Qué falta para decidir mejor</h3>${miss.map((m) => `<div class="gd-al"><span>${esc(m.text)}</span><strong class="num">${m.n} SKU</strong></div>`).join('')}
      <p class="field__hint">Sale de la razón escrita de cada sugerencia: te dice qué dato cargar primero.</p></div>` : '';
    const cmpHtml = cmp.loaded ? `<div><h3 class="gd-h">Contra las sugerencias que te compartieron</h3><div class="gd-chips"><span class="gd-chip gd-chip--val"><strong class="num">${cmp.match}</strong> coinciden</span><span class="gd-chip gd-chip--rec"><strong class="num">${cmp.differ}</strong> difieren</span>
      <span class="gd-chip"><strong class="num">${cmp.none}</strong> sin sugerencia cargada</span>${cmp.unknown ? `<span class="gd-chip"><strong class="num">${cmp.unknown}</strong> canal no reconocido</span>` : ''}</div></div>` : '';
    return `<section class="panel gd-act" aria-labelledby="gd-act-t-${tab}"><div class="panel__head"><div><h2 class="panel__title" id="gd-act-t-${tab}">Acciones sugeridas · cuántos SKU hay en cada una</h2>
      <p class="panel__desc">Cuenta SKU ${isOffer ? 'de ofertas activas' : 'sin oferta vigente'}; si un SKU está en dos ofertas cuenta una vez. Es una regla con su razón escrita, no un efecto medido.</p></div>
      <div class="btn-row"><button type="button" class="btn btn--small" data-action="ac-export-xlsx" data-tab="${isOffer ? 'offer' : 'potential'}">Exportar plan de activación (Excel)</button></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Acción sugerida</th><th>SKU</th><th>Reparto</th><th>Venta del periodo</th><th>Prioridad</th>${isOffer ? '<th>Aprobadas</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th><th class="num">${C.total}</th><th></th><th></th><th></th>${isOffer ? '<th></th>' : ''}<th></th></tr></tfoot></table></div></div>
      ${missHtml || cmpHtml ? `<div class="panel__body"><div class="gd-sum__grid">${missHtml}${cmpHtml}</div></div>` : ''}</section>`;
  }

  /* ---------- Eliminar ofertas y promociones ---------- */
  function removalToast(state) {
    const u = state.gd && state.gd.undo; if (!u || (u.kind !== 'rm-offers' && u.kind !== 'rm-promo' && u.kind !== 'build')) return '';
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
    const plan = FP.removal.promoPlan(p), offers = p.skus.filter((s) => s.offerId).length, digital = p.skus.length - offers;
    const heavy = plan.heavy ? `<div class="note note--warn"><strong>Esta promoción ya avanzó.</strong> Al eliminarla se pierde: ${plan.impact.map(esc).join('; ')}. Su historial y su medición no se podrán consultar después.
        <div class="btn-row"><button type="button" class="btn btn--small" data-action="pm-export-csv" data-id="${esc(p.promoId)}">Exportar CSV antes</button><button type="button" class="btn btn--small" data-action="pm-export-json" data-id="${esc(p.promoId)}">Exportar JSON antes</button></div>
        <label class="gd-colchk"><input type="checkbox" id="rm-ack"> Entiendo que se pierde su historial y su medición</label></div>` : '';
    return `<section class="panel gd-rm" id="rm-confirm" role="alertdialog" aria-labelledby="rm-t"><div class="panel__body"><h2 class="panel__title" id="rm-t">¿Eliminar la promoción «${esc(p.name)}»?</h2>
      <p>Está en <strong>${esc(FP.promotions.STATUS[p.status].toLowerCase())}</strong> y tiene <strong>${p.skus.length} SKU</strong>.</p>${heavy}
      ${p.skus.length ? `<div class="note"><strong>Qué pasa con sus SKU:</strong> ${offers ? `las ${offers} ofertas que vinieron de aquí quedan otra vez pendientes de promoción y la guía te pedirá armar otra. ` : ''}${digital ? `${digital} SKU de oportunidades solo salen del plan.` : ''}</div>` : ''}
      <p class="field__hint">El identificador ${esc(p.promoId)} no se vuelve a usar. Si solo quieres detenerla pero conservar su historial, usa «Cancelar promoción».</p>${reason}
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
