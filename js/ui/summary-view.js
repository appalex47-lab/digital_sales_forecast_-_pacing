/**
 * summary-view.js — pestaña «Resumen» de Promociones: embudo, tabla agrupada, pendientes y propuestas exportadas.
 * Solo pinta lo que calcula FP.summary; los cambios pasan por las acciones sm-* de app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const S = () => FP.summary;
  const $ = (id) => document.getElementById(id);
  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');
  const disc = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : '—');
  const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('es-MX') : '—');
  const when = (at) => { try { return new Date(at).toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; } };
  function field(id, label, html) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}</div>`; }
  const bar = (v) => `<div style="display:flex;align-items:center;gap:8px;min-width:120px"><span style="flex:1;height:8px;border-radius:4px;background:var(--ds-border,#dde2dd);overflow:hidden"><i style="display:block;height:100%;width:${typeof v === 'number' ? Math.round(v * 100) : 0}%;background:var(--ds-accent,#1F5FE0)"></i></span><span class="num">${pct(v)}</span></div>`;

  function compute(state) {
    const op = state.op, pm = state.pm;
    return S().build({ offers: state.of.reg.offers, batches: state.of.reg.batches, proposals: state.sm.reg.proposals, promotions: pm.reg ? pm.reg.promotions : [],
      oppTotal: op.result ? op.result.counts.total : null, oppItems: op.result ? op.result.items : [], campaign: state.sm.campaign, group: state.sm.group });
  }

  function funnel(r) {
    const esc = H().esc, f = r.funnel;
    const steps = [
      ['Oportunidades detectadas', f.detected === null ? '—' : int(f.detected), f.detected === null ? 'Calcúlalas en la pestaña Qué impulsar' : 'Viene de la pestaña Qué impulsar'],
      ['SKU propuestos', int(f.proposed), 'En propuestas exportadas'],
      ['Con oferta recibida', int(f.withOffer), f.proposed ? `${pct(f.withOffer / f.proposed)} de los propuestos` : ''],
      ['Validadas o seleccionadas', int(f.validated), 'Entre los propuestos'],
      ['En promoción', int(f.inPromo), 'En una promoción en propuesta, aprobada, publicada, en medición o cerrada']
    ];
    return `<div class="metric-grid">${steps.map(([l, v, s]) => `<div class="metric-card"><span class="metric-card__label">${esc(l)}</span><strong class="metric-card__value num">${esc(v)}</strong>${s ? `<span class="metric-card__period">${esc(s)}</span>` : ''}</div>`).join('')}</div>`;
  }

  function table(r) {
    const esc = H().esc, name = S().GROUPS[r.group], t = r.total;
    const line = (label, x, strong) => `<tr>${strong ? `<td><strong>${esc(label)}</strong></td>` : `<td>${esc(label)}</td>`}<td class="num">${int(x.sp)}</td><td>${bar(x.cover)}</td><td class="num">${int(x.sin)}</td><td class="num">${int(x.of)}</td><td class="num">${disc(x.avg)}</td><td class="num">${int(x.sel)}</td><td class="num">${int(x.pr)}</td><td class="num">${int(x.fuera)}</td></tr>`;
    if (!r.rows.length) return '<div class="empty"><strong>Todavía no hay datos que resumir</strong>Exporta una propuesta desde Qué impulsar o recibe ofertas en Ofertas y plan.</div>';
    return `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>${esc(name)}</th><th>SKU propuestos</th><th>Cobertura de ofertas</th><th>Sin oferta</th><th>Ofertas recibidas</th><th>Descuento prom.</th><th>Seleccionadas</th><th>En promoción</th><th>Recibidas fuera de propuesta</th></tr></thead>
      <tbody>${r.rows.map((x) => line(x.label, x, false)).join('')}</tbody><tfoot>${line('Total', t, true)}</tfoot></table></div>
      <p class="field__hint">Un SKU con varias ofertas cuenta una vez en «SKU» y varias veces en «Ofertas recibidas»; su laboratorio, programa y categoría salen de su oferta con mayor descuento. «Sin oferta» son SKU propuestos sin ninguna oferta recibida. «Recibidas fuera de propuesta» son ofertas de SKU que no estaban en ninguna propuesta exportada. Las ofertas descartadas no cuentan.</p>`;
  }

  /** Datos de ejemplo: ofertas, propuesta, promoción y venta por producto inventadas, todas marcadas «EJEMPLO», para ver cómo se ve la pestaña. */
  function demoPanel(state) {
    const D = FP.demo; if (!D) return '';
    const on = D.has({ offers: state.of.reg, promos: state.pm.reg, proposals: state.sm.reg });
    let ask = false; try { ask = /[?&]ejemplo\b/.test(root.location.search); } catch (e) { /* sin ubicación */ }
    if (!on && !ask && !state.sm.showDemo) return '';   // los datos de ejemplo no se ofrecen salvo que ya estén cargados (para quitarlos) o se pida con ?ejemplo
    return `<section class="panel" aria-labelledby="sm-t-d"><div class="panel__head"><div><h2 class="panel__title" id="sm-t-d">Datos de ejemplo</h2>
      <p class="panel__desc">Para ver cómo se ve todo sin cargar nada real. Los datos son inventados y todo lleva «EJEMPLO» en el nombre; quitar el ejemplo no toca tus datos reales.</p></div></div>
      <div class="panel__body"><div class="btn-row">${on ? '<button type="button" class="btn btn--small" data-action="dm-clear">Quitar los datos de ejemplo</button>' : '<button type="button" class="btn btn--small btn--primary" data-action="dm-load">Cargar datos de ejemplo</button>'}</div>
      <p class="field__hint">Incluye 10 ofertas en 2 campañas y 3 orígenes (un producto con 3 ofertas), una propuesta exportada, una promoción en propuesta, otra ya en medición con su línea base congelada (fechas del 20 al 30 de septiembre de 2026) y, si todavía no hay venta por producto, 48 productos con venta y funnel ficticios (Ecommerce y App) (archivos «EJEMPLO_venta» y «EJEMPLO_funnel»). Si ya cargaste venta real, no se agrega venta ficticia y se usan tus productos. Escribe tu nombre arriba antes de cargar.</p></div></section>`;
  }

  function html(state) {
    const esc = H().esc, r = compute(state), sm = state.sm;
    const msg = sm.msg ? `<div class="note note--${sm.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(sm.msg.text)}</div>` : '';
    const camp = `<select id="sm-camp" data-action="sm-filter"><option value="">Todas las campañas</option>${r.campaigns.map((c) => `<option value="${esc(c)}"${c === r.campaign ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    const seg = Object.entries(S().GROUPS).map(([k, l]) => `<button type="button" class="btn btn--small${k === r.group ? ' btn--primary' : ''}" data-action="sm-group" data-g="${k}" aria-pressed="${k === r.group}">${esc(l)}</button>`).join(' ');
    const p = r.pending, go = (to, n, text) => `<li><strong>${int(n)}</strong> ${esc(text)}${to && n ? ` <button type="button" class="btn btn--small btn--ghost" data-action="sm-go" data-to="${to}">Ver</button>` : ''}</li>`;
    const props = r.proposals.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Nombre</th><th>Fecha</th><th>Quién</th><th>SKU</th></tr></thead><tbody>${r.proposals.slice(0, 15).map((x) => `<tr><td>${esc(x.name)}<span class="cell-sub num">${esc(x.id)}</span></td><td class="num">${esc(when(x.at))}</td><td>${esc(x.by || '—')}</td><td class="num">${int(x.skus.length)}</td></tr>`).join('')}</tbody></table></div>${r.proposals.length > 15 ? `<p class="field__hint">Se muestran las 15 más recientes de ${r.proposals.length}.</p>` : ''}`
      : '<p class="field__hint">Todavía no se ha exportado ninguna propuesta. Al exportar el Excel de una propuesta desde Qué impulsar se registra aquí su nombre, fecha y lista de SKU.</p>';
    return `<section class="panel" aria-labelledby="sm-t"><div class="panel__head"><div><h2 class="panel__title" id="sm-t">Resumen de promociones</h2>
      <p class="panel__desc">Qué pedimos, qué llegó y qué falta, agrupado por categoría, laboratorio o programa. Solo cuenta lo registrado en la herramienta: no calcula venta ni efecto.</p></div></div>
      <div class="panel__body">${msg}<div class="field-grid">${field('sm-camp', 'Campaña de las ofertas', camp)}</div>
        <h3>De la propuesta a la promoción (SKU)</h3>${funnel(r)}</div></section>
      <section class="panel" aria-labelledby="sm-t-g"><div class="panel__head"><div><h2 class="panel__title" id="sm-t-g">Agrupado por</h2></div><div class="btn-row">${seg}</div></div>
        <div class="panel__body panel__body--flush">${table(r)}</div>
        <div class="panel__body"><div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="sm-export-xlsx">Exportar resumen a Excel</button><span class="field__hint">Una hoja con la tabla agrupada actual.</span></div></div></section>
      <section class="panel" aria-labelledby="sm-t-p"><div class="panel__head"><div><h2 class="panel__title" id="sm-t-p">Pendientes de decidir</h2></div></div><div class="panel__body"><ul class="plain-list">
        ${go('received', p.received, 'ofertas recibidas sin validar')}${go('validated', p.validated, 'ofertas validadas sin seleccionar')}${go('', p.noOffer, 'SKU propuestos sin oferta')}${go('', p.outside, 'ofertas recibidas fuera de propuesta')}</ul>
        <p class="field__hint">«Ver» abre Ofertas recibidas con el estado puesto. Los otros dos pendientes salen en el Excel del resumen.</p></div></section>
      <section class="panel" aria-labelledby="sm-t-x"><div class="panel__head"><div><h2 class="panel__title" id="sm-t-x">Propuestas exportadas (${r.proposals.length})</h2></div></div><div class="panel__body">${props}</div></section>${demoPanel(state)}`;
  }

  FP.summaryView = { html, compute, val };
})(typeof window !== 'undefined' ? window : globalThis);
