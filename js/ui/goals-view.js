/**
 * goals-view.js — panel «Metas por campaña» dentro de la pestaña Resumen de Promociones (propuesta B).
 * Pinta lo que calcula FP.goals. La meta es una cifra que decide la persona; el avance suma la venta REAL durante las promociones de la campaña
 * (evaluación al día y, si no se pudo, el último corte guardado, siempre con su fecha de datos), no la venta incremental.
 * Al fijar la meta muestra el ticket por unidad (venta ÷ unidades) de los SKU de la campaña contra el corte alto/bajo de Categorías.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const G = () => FP.goals;
  const $ = (id) => document.getElementById(id);
  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => (fin(v) ? v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
  const int = (v) => (fin(v) ? Math.round(v).toLocaleString('es-MX') : '—');
  const pct = (v) => (fin(v) ? `${Math.round(v * 100)} %` : '—');
  const when = (at) => { try { return new Date(at).toISOString().slice(0, 10); } catch (e) { return ''; } };

  function rows(state) {
    const camps = G().campaignsOf(state.of.reg, state.pm.reg.promotions, state.cg.reg);
    return camps.map((c) => {
      const goal = G().find(state.cg.reg, c), pr = goal ? G().progress(goal, state.pm.reg.promotions, state.cg.live) : null;
      const nPromos = state.pm.reg.promotions.filter((p) => (p.campaign || '').toLowerCase() === c.toLowerCase()).length;
      return { campaign: c, goal, progress: pr, nPromos };
    });
  }

    /** Ayuda al fijar la meta: ticket por unidad de los SKU de la campaña contra el corte alto/bajo, y aviso si las dos metas implican un precio fuera de lo histórico. */
  /** Punto de partida automático de la meta de una campaña (null si faltan datos o fechas). */
  function suggestion(state, name) {
    const d = state.cg.data; if (!d || !d.rows) return null;
    const days = FP.goalsView.campaignDays ? FP.goalsView.campaignDays(name) : null;
    const skus = FP.goalsView.campaignSkus ? FP.goalsView.campaignSkus(name) : [];
    return G().baselineSuggestion(skus, d.rows, 56, days);
  }
  function helper(state) {
    const esc = H().esc, cg = state.cg, f = cg.form || {}, d = cg.data;
    if (cg.loading && !d) return '<p class="field__hint">Calculando el ticket histórico…</p>';
    if (!d || !d.stats || d.stats.cut === null) return '<p class="field__hint">Sin venta por producto cargada no hay ticket histórico para orientar la meta. Cárgala en «Carga de datos».</p>';
    const st = d.stats, parse = (v) => (FP.format && FP.format.parseAmountInput ? FP.format.parseAmountInput(v) : Number(String(v).replace(/[^\d.]/g, '')));
    const range = `${d.from} a ${d.to}`;
    const cat = `<details class="disclosure"><summary>Ticket por unidad por categoría (${st.byCategory.length})</summary><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Categoría</th><th>Ticket por unidad</th><th>SKU con venta</th><th>Nivel</th></tr></thead><tbody>${st.byCategory.map((x) => `<tr><td>${esc(x.category)}</td><td class="num">${money(x.ticket)}</td><td class="num">${int(x.skus)}</td><td>${x.level === 'alto' ? 'Alto' : 'Bajo'}</td></tr>`).join('')}</tbody></table></div></details>`;
    const base = `<p class="field__hint">Ticket por unidad = venta ÷ unidades de los últimos 56 días con dato (${esc(range)}). El corte entre «alto» y «bajo» es la mediana entre categorías: <strong>${money(st.cut)}</strong>. Es precio por unidad, no el valor promedio de un pedido.</p>`;
    const name = String(f.campaign || '').trim(); if (!name) return `${base}${cat}`;
    const skus = FP.goalsView.campaignSkus ? FP.goalsView.campaignSkus(name) : [];
    const ct = G().campaignTicket(skus, d.rows);
    if (!ct.ticket) return `${base}<p class="field__hint">Para «${esc(name)}» no hay SKU con venta en esa ventana (${int(ct.asked)} SKU conocidos), así que no hay ticket que comparar.</p>${cat}`;
    const sug = G().suggestMain(ct.ticket, st.cut), rev = f.revenue ? parse(f.revenue) : null, un = f.units ? parse(f.units) : null;
    const dsc = G().avgDiscount(FP.goalsView.campaignOffers ? FP.goalsView.campaignOffers(name) : []);
    const ab = G().autoBand(d.weeks, skus), chk = G().impliedCheck(rev, un, ct.ticket, dsc ? dsc.avg : null, ab.band);
    const txt = `Los ${int(ct.skus)} SKU de «${name}» con venta se vendieron a <strong>${money(ct.ticket)}</strong> por unidad: ticket <strong>${sug === 'revenue' ? 'alto' : 'bajo'}</strong>. ${sug === 'revenue' ? 'Sugerencia: meta principal en venta; las unidades ayudan poco a ver el avance.' : 'Sugerencia: meta principal en unidades; la venta se mueve poco por unidad.'} Es una sugerencia: la decides tú.`;
    const imp = chk ? `<div class="note note--${chk.off ? 'warn' : 'ok'}" role="status">Tus dos metas implican <strong>${money(chk.implied)}</strong> por unidad${chk.hist ? `, ${chk.ratio >= 0 ? '+' : ''}${Math.round(chk.ratio * 100)} % contra lo esperado de ${money(chk.expected)}${chk.discount ? ` (histórico de ${money(chk.hist)} menos ${Math.round(chk.discount * 100)} % de descuento promedio de las ofertas de la campaña)` : ` (histórico; la campaña no tiene ofertas con descuento para descontar)`}` : ''}.${chk.off ? ` Se aleja más de ${Math.round(chk.band * 100)} % de lo esperado: revisa que venta y unidades sean consistentes.` : ' Es consistente con lo esperado.'} <span class="cell-sub">Tolerancia ${Math.round(chk.band * 100)} %${ab.auto ? `: se ajustó sola con la variación semanal del precio por unidad de estos SKU (${ab.weeks} semanas, variación de ${(ab.cv * 100).toFixed(1).replace(/\.0$/, '')} %; tolerancia = 2 veces eso, entre 10 % y 25 %)` : `: 25 % por defecto, porque hay ${ab.weeks} semana(s) con venta de estos SKU y se necesitan 6 para ajustarla`}.</span></div>` : '';
    const bs = suggestion(state, name);
    const sg = bs ? `<div class="note note--ok" role="status"><strong>Punto de partida automático:</strong> ${money(bs.revenue)} de venta${bs.units ? ` y ${int(bs.units)} unidades` : ''}. Sale del ritmo de los últimos ${bs.windowDays} días de los ${int(bs.skus)} SKU de la campaña, llevado a sus ${bs.campaignDays} días. <strong>No incluye el efecto de la promoción</strong>: cuánto más esperas lo decides tú.
      <div class="btn-row"><button type="button" class="btn btn--small" data-action="cg-suggest" data-m="1">Usar como meta</button><button type="button" class="btn btn--small" data-action="cg-suggest" data-m="1.1">Usar +10 %</button><button type="button" class="btn btn--small" data-action="cg-suggest" data-m="1.2">Usar +20 %</button><button type="button" class="btn btn--small" data-action="cg-suggest" data-m="1.3">Usar +30 %</button></div></div>`
      : `<p class="field__hint">${FP.goalsView.campaignDays && FP.goalsView.campaignDays(name) ? '' : 'Para sugerir un punto de partida la campaña necesita fechas (en sus ofertas o en una promoción). '}</p>`;
    return `${base}<p>${txt}</p>${sg}${imp}${cat}`;
  }

  function html(state) {
    const esc = H().esc, pill = H().pill, cg = state.cg, f = cg.form || {};
    const list = rows(state);
    const camps = G().campaignsOf(state.of.reg, state.pm.reg.promotions, cg.reg);
    const body = list.map((x) => {
      const g = x.goal, pr = x.progress;
      const state_ = !g ? pill('na', 'Sin meta') : pr.status === 'no_promos' ? pill('na', 'Sin promociones medibles') : pr.status === 'no_data' ? pill('warning', 'Sin evaluación ni corte') : pr.status === 'partial' ? pill('warning', 'Avance parcial') : pill('ok', pr.allLive ? 'Al día' : 'Con avance');
      const dataTxt = pr && pr.cutoffMax ? `datos ${pr.allLive ? 'al día, ' : ''}hasta ${pr.cutoffMin === pr.cutoffMax ? pr.cutoffMax : `${pr.cutoffMin} a ${pr.cutoffMax}`}${pr.allLive ? '' : ' · incluye último corte guardado'}` : '';
      const dupTxt = pr && (pr.dupes.length || pr.partial.length) ? `${pr.dupes.length ? `${pr.dupes.length} SKU repetido(s) cuentan una vez` : ''}${pr.dupes.length && pr.partial.length ? ' · ' : ''}${pr.partial.length ? `${pr.partial.length} SKU con traslape parcial pueden contar doble` : ''}` : '';
      return `<tr><td><strong>${esc(x.campaign)}</strong><span class="cell-sub">${x.nPromos} promoción${x.nPromos === 1 ? '' : 'es'} con esta campaña</span></td>
        <td class="num">${g && g.revenue ? money(g.revenue) : '—'}</td><td class="num">${g && g.units ? int(g.units) : '—'}</td>
        <td class="num">${pr && pr.promos.length ? money(pr.revenue) : '—'}${pr && g && g.revenue && pr.promos.length ? `<span class="cell-sub">${pct(pr.pctRevenue)} de la meta</span>` : ''}</td>
        <td class="num">${pr && pr.promos.length ? int(pr.units) : '—'}${pr && g && g.units && pr.promos.length ? `<span class="cell-sub">${pct(pr.pctUnits)} de la meta</span>` : ''}</td>
        <td>${state_}${dataTxt ? `<span class="cell-sub">${esc(dataTxt)}</span>` : ''}${dupTxt ? `<span class="cell-sub">${esc(dupTxt)}</span>` : ''}${pr && pr.missing.length ? `<span class="cell-sub">${pr.missing.length} sin evaluación ni corte: ${esc(pr.missing.map((m) => m.name).join(', '))}</span>` : ''}${g ? `<span class="cell-sub">fijada por ${esc(g.createdBy || '—')} · ${esc(when(g.updatedAt))}</span>` : ''}</td>
        <td><button type="button" class="btn btn--small" data-action="cg-edit" data-c="${esc(x.campaign)}">${g ? 'Editar' : 'Fijar meta'}</button>${g ? ` <button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="cg-remove" data-c="${esc(x.campaign)}">Quitar</button>` : ''}</td></tr>`;
    }).join('');
    const msg = cg.msg ? `<div class="note note--${cg.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(cg.msg.text)}</div>` : '';
    const form = `<div class="field-grid">
        <div class="field"><label for="cg-camp" class="field__label">Campaña</label><input id="cg-camp" type="text" data-action="cg-form" list="cg-camps" value="${esc(f.campaign || '')}" autocomplete="off" placeholder="Elige o escribe la campaña"><datalist id="cg-camps">${camps.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="cg-rev" class="field__label">Meta de venta (MXN)</label><input id="cg-rev" type="text" data-action="cg-form" inputmode="decimal" value="${esc(f.revenue || '')}" placeholder="Ej. 1,500,000 o 1.5M"></div>
        <div class="field"><label for="cg-units" class="field__label">Meta de unidades</label><input id="cg-units" type="text" data-action="cg-form" inputmode="numeric" value="${esc(f.units || '')}" placeholder="Ej. 12,000"></div>
        <div class="field"><label for="cg-note" class="field__label">Nota (opcional)</label><input id="cg-note" type="text" value="${esc(f.note || '')}" maxlength="140" placeholder="De dónde sale la cifra"></div>
      </div><div id="cg-help">${helper(state)}</div><div class="btn-row"><button type="button" class="btn btn--primary" data-action="cg-save">Guardar meta</button><button type="button" class="btn" data-action="cg-refresh"${cg.loading ? ' disabled' : ''}>${cg.loading ? 'Actualizando…' : 'Actualizar avance'}</button></div>`;
    return `<section class="panel" aria-labelledby="cg-t"><div class="panel__head"><div><h2 class="panel__title" id="cg-t">Metas por campaña</h2>
      <p class="panel__desc">La cifra la fijas tú, por campaña: venta, unidades o ambas. El avance suma la <strong>venta real durante las promociones</strong> de la campaña, con la evaluación al día y, si no se pudo calcular, el último corte guardado; cada fila dice hasta qué fecha llegan los datos. Un SKU repetido en dos promociones de la campaña con las mismas fechas cuenta una vez. No es venta incremental y no demuestra causalidad. Una promoción entra a su campaña desde su detalle.</p></div></div>
      <div class="panel__body">${msg}${list.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Campaña</th><th>Meta de venta</th><th>Meta de unidades</th><th>Venta real de las promociones</th><th>Unidades reales</th><th>Estado</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="field__hint">Todavía no hay campañas: aparecen las de los lotes de ofertas, las de las promociones y las que tengan meta.</p>'}
        <h3>${f.campaign && G().find(cg.reg, f.campaign) ? 'Editar la meta' : 'Fijar una meta'}</h3>${form}</div></section>`;
  }

  FP.goalsView = { html, val, rows, helper, suggestion, campaignDays: null, campaignSkus: null, campaignOffers: null };
})(typeof window !== 'undefined' ? window : globalThis);
