/**
 * prodevol-view.js — «Producto y evolución»: Categoría → Producto y Evolución y patrones en una sola página, escrita como una lectura
 * de arriba abajo, de lo más importante a lo menos. Solo compone HTML de las dos vistas existentes (FP.productView, FP.trendView);
 * no calcula nada propio salvo las frases de conclusión de cada capítulo.
 * Producto manda en canal, periodo, comparación y ruta (los filtros de Evolución se derivan de ahí en app.js · peSync).
 *
 *   1 ¿Qué pasó?  2 ¿Contra la meta?  3 ¿Quién lo mueve? (una sola tabla: participación + contribución + tendencia + patrón)
 *   4 ¿Desde cuándo y hacia dónde? (con el contexto de época)  5 ¿Por qué se mueve?  6 ¿Qué hago?  7 Evidencia y detalle
 * Etapas 3 y 4 de la fusión: las rutas #producto y #analisis son alias de esta página.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const nw = (t) => `<span class="nw">${esc(t)}</span>`;
  const F = () => FP.format;
  const money = (v) => F().currency(Math.abs(v), 0);
  const sg = (v) => (v < 0 ? '−' : '+') + money(v);
  const DASH = '—';

  function chapter(n, id, question, take, body) {
    return `<section class="chap" id="pe-${id}" aria-labelledby="pe-h-${id}"><header class="chap__h"><span class="chap__n" aria-hidden="true">${n}</span><div><span class="chap__q">${esc(question)}</span><h3 class="chap__t" id="pe-h-${id}">${take || esc(question)}</h3></div></header>${body}</section>`;
  }

  /* ---------- Conclusiones (escritas con las cifras de la selección) ---------- */
  function take1(state) {
    const r = state.pa.result;
    if (!r || !r.total) return '';
    const tc = r.total.current.revenue, tb = r.total.baseline.revenue;
    if (!tc || !tb || !fin(tc.value) || !fin(tb.value)) return '';
    const net = tc.value - tb.value;
    return `La venta ${net < 0 ? 'cae' : net > 0 ? 'sube' : 'no cambia'}${net ? ` ${nw(money(net))}` : ''} (${nw(F().signedPercent(tb.value ? net / tb.value : null, 1))}) contra ${esc(r.baseline.label)}.`;
  }
  function take2(state) {
    const b = state.an.bridge;
    if (!b) return '';
    if (b.status === 'not_applicable') return 'La meta existe por canal, no por categoría o producto: con esta selección este capítulo no aplica.';
    if (b.status !== 'available' && b.status !== 'partial') return '';
    if (b.gap >= 0) return `El periodo superó la meta por ${nw(money(b.gap))} (${nw(F().signedPercent(b.gapPct, 1))}).`;
    const chans = (b.channels || []).filter((c) => fin(c.gap)), worstC = chans.slice().sort((x, y) => x.gap - y.gap)[0];
    const worstE = (b.rows || []).slice().sort((x, y) => x.contribution - y.contribution)[0];
    const lbl = (c) => (FP.analysisContext ? FP.analysisContext.channelLabel(c) : c);
    return `El periodo quedó ${nw(money(b.gap))} (${nw(F().signedPercent(b.gapPct, 1))}) bajo la meta${worstC && chans.length > 1 ? `; ${esc(lbl(worstC.channel))} concentra ${nw(Math.round(worstC.gap / b.gap * 100) + ' %')} de la brecha` : ''}${worstE && worstE.contribution < 0 ? `, y por ${esc((FP.trendView && state.an.level ? '' : '') + 'entidad')}, ${esc(worstE.entity)} aporta ${nw(sg(worstE.contribution))} bajo el supuesto de crecimiento parejo` : ''}.`;
  }
  function take3(state) {
    const a = state.an, c = a.contribution;
    if (!c || c.status !== 'available') return '';
    const all = [...c.positive, ...c.negative].filter((r) => fin(r.delta) && r.delta !== 0);
    if (!all.length) return '';
    const top = all.slice().sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    const pos = all.filter((r) => r.delta > 0 && r !== top).sort((x, y) => y.delta - x.delta);
    const losers = ((a.share && a.share.rows) || []).filter((r) => r.status === 'losing').slice(0, 2).map((r) => r.entity);
    const pct = fin(top.contributionPct) ? ` y explica ${nw(F().percent(Math.abs(top.contributionPct), 0))} del cambio neto` : '';
    const comp = pos.length && top.delta < 0 ? `; ${esc(pos.slice(0, 2).map((r) => r.entity).join(' y '))} compensa${pos.length > 1 ? 'n' : ''} ${nw(sg(pos.slice(0, 2).reduce((s, r) => s + r.delta, 0)))}` : '';
    return `${esc(top.entity)} ${top.delta < 0 ? 'baja' : 'sube'} ${nw(money(top.delta))}${pct}${comp}${losers.length ? `. Pierde${losers.length > 1 ? 'n' : ''} participación ${esc(losers.join(' y '))}` : ''}.`;
  }
  function take4(state) {
    const a = state.an, rows = a.rows || [];
    if (!rows.length) return '';
    const g = rows.filter((r) => r.direction === 'growth').length, d = rows.filter((r) => r.direction === 'decline').length, an = rows.filter((r) => r.anomaly).length;
    const PL = { category: ['categoría', 'categorías'], subcategory: ['subcategoría', 'subcategorías'], product: ['producto', 'productos'], sku: ['SKU', 'SKU'], region: ['región', 'regiones'], state: ['estado', 'estados'], city: ['ciudad', 'ciudades'], branch: ['sucursal', 'sucursales'], delivery: ['tipo de entrega', 'tipos de entrega'], channel: ['canal', 'canales'] };
    const lvl = (PL[a.level] || ['entidad', 'entidades'])[rows.length === 1 ? 0 : 1];
    return `De ${nw(rows.length)} ${esc(lvl)}${rows.length === 1 ? ', ' : ' analizadas, '}${nw(g)} ${g === 1 ? 'crece' : 'crecen'} y ${nw(d)} ${d === 1 ? 'cae' : 'caen'}${an ? `, ${nw(an)} con anomalía` : ''}.`;
  }
  function takeHacer(state) {
    const C = FP.prodevolContext; if (!C || !state.pa.result) return '';
    const n = C.counts(state), parts = [];
    parts.push(`${nw(n.hypotheses)} ${n.hypotheses === 1 ? 'hipótesis por validar' : 'hipótesis por validar'}`);
    parts.push(n.running ? `${nw(n.running)} ${n.running === 1 ? 'cosa en marcha' : 'cosas en marcha'} en Promociones` : 'nada en marcha en Promociones');
    if (n.opportunities !== null) parts.push(n.opportunities ? `${nw(n.opportunities)} ${n.opportunities === 1 ? 'oportunidad' : 'oportunidades'}` : 'sin oportunidades');
    const ent = state.an.selected && state.an.selected.entity;
    return `Para ${ent ? esc(FP.productFilter && state.an.level === 'branch' ? FP.productFilter.label('branch', ent) : ent) : 'esta selección'}: ${parts.join(', ')}.`;
  }
  function take5(state) {
    const tf = takeFunnel(state); if (tf) return tf;
    const p = state.an.pvm;
    if (!p || !p.total || (p.status !== 'available' && p.status !== 'partial')) return '';
    const t = p.total;
    return `De la variación de ${nw(sg(t.delta))}: volumen ${nw(sg(t.volume))}, precio ${nw(sg(t.price))} y mezcla ${nw(sg(t.mix))}. Es una descomposición matemática, no una causa.`;
  }


  /* ---------- Embudo de ficha (capítulo 5) ---------- */
  const FE = () => FP.funnelEngine;
  const H = () => FP.ui.helpers;
  const pp1 = (v) => (v === null || !fin(v) ? DASH : `${Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`);
  const dcls = (v) => (!fin(v) || Math.abs(v) < 0.05 ? '' : v > 0 ? 'is-pos' : 'is-neg');
  const pc1 = (v, d = 1) => (v === null || !fin(v) ? DASH : `${(v * 100).toFixed(d)} %`);
  const entName = (state, e) => (FP.productFilter && state.an.level === 'branch' ? FP.productFilter.label('branch', e) : e);

  /** El foco del embudo: la entidad elegida (si está en la tabla) o toda la selección. */
  function funnelFocus(state) {
    const r = state.pa.result, ent = state.an.selected && state.an.selected.entity;
    const row = ent ? r.rows.find((x) => String(x.key) === String(ent)) : null;
    if (row) return { label: entName(state, row.key), cur: FE().pick(row.current), base: FE().pick(row.baseline), isRow: true };
    return { label: 'Toda la selección', cur: FE().pick(r.total.current), base: FE().pick(r.total.baseline), isRow: false };
  }
  /** Por qué no hay embudo: sin archivo de funnel, o el canal no tiene ficha web. */
  function funnelMissing(state) {
    const r = state.pa.result;
    if (!(r.mappedMetrics && r.mappedMetrics.funnel || []).includes('views')) return '<p class="note"><strong>Todavía no hay datos de funnel.</strong> Carga el archivo de funnel de GA4 (vistas, carrito, checkout y compras por producto) en Carga de datos para ver el embudo y dónde se pierde la compra. <a class="btn btn--small btn--primary" href="#carga">Ir a Carga de datos</a></p>';
    return '<p class="note"><strong>Con esta selección no hay embudo de ficha.</strong> El funnel existe en Ecommerce y App; WhatsApp y Llamadas no tienen vistas de ficha, y el estado, la sucursal y el tipo de entrega ocurren después de la ficha. Cambia el canal o quita ese filtro para verlo.</p>';
  }
  function takeFunnel(state) {
    const r = state.pa.result; if (!r || !FE()) return '';
    const f = funnelFocus(state), cmp = f.cur && f.base ? FE().compare(f.cur, f.base) : null, rd = FE().reading(cmp);
    if (!rd) return '';
    const v = nw(F().signedPercent(rd.views, 1)), pp = rd.crPp === null ? '' : nw(Math.abs(rd.crPp).toFixed(2) + ' pp'), name = esc(f.label);
    if (rd.kind === 'views_up_cr_down') return `${name}: las vistas suben ${v} pero la conversión de ficha baja ${pp}${rd.weak ? `; el paso más débil es ${esc(rd.weak.label)} (${nw(pp1(rd.weak.deltaPp))})` : ''}.`;
    if (rd.kind === 'views_down') return `${name}: caen las vistas (${v})${rd.crPp !== null && rd.crPp < -0.1 ? ` y además baja la conversión de ficha ${pp}` : ' y la conversión casi no cambia: el movimiento está en llegar a la ficha'}.`;
    if (rd.kind === 'views_up_cr_up') return `${name}: suben las vistas (${v}) y también la conversión de ficha (${nw(pp1(rd.crPp))}).`;
    return `${name}: las vistas y la conversión de ficha casi no cambian: mira abajo el reparto del cambio de venta y el volumen, el precio y la mezcla.`;
  }
  const fbar = (v, max) => {
    const w = max > 0 ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
    return `<span class="sgd-bar" aria-hidden="true"><span class="sgd-bar__zero"></span>${Math.abs(v) < 0.5 ? '' : `<span class="sgd-bar__fill ${v < 0 ? 'sgd-bar__fill--neg' : 'sgd-bar__fill--pos'}" style="width:${w.toFixed(2)}%"></span>`}</span>`;
  };

  function funnelSteps(state, f, cmp) {
    const r = state.pa.result, max = Math.max(f.cur.views, f.base ? f.base.views : 0) || 1;
    const rows = cmp.steps.map((s) => {
      const sub = s.transition
        ? `<span class="cell-sub ${dcls(s.deltaPp)}">${pc1(s.rateCur)}${s.rateBase !== null ? ` vs ${pc1(s.rateBase)} · ${pp1(s.deltaPp)}` : ''}</span>`
        : `<span class="cell-sub ${dcls(s.deltaPct === null ? null : s.deltaPct * 100)}">${s.deltaPct === null ? '' : `${F().signedPercent(s.deltaPct, 1)} vs referencia`}</span>`;
      return `<div class="fnl__row"><span>${esc(s.label)}</span><div class="fnl__track" aria-hidden="true"><div class="fnl__fill" style="width:${Math.max(1.5, s.cur / max * 100).toFixed(1)}%"></div>${s.base !== null ? `<div class="fnl__ref" style="left:${Math.min(100, s.base / max * 100).toFixed(1)}%"></div>` : ''}</div><span class="num">${esc(F().integer(s.cur))}${sub}</span></div>`;
    }).join('');
    const cov = r.total.current.trackingCoverage && fin(r.total.current.trackingCoverage.value) ? r.total.current.trackingCoverage.value : null;
    const covNote = cov === null ? '' : ` Cobertura de tracking (compras GA4 ÷ unidades reales): ${esc(F().percent(cov, 0))}${cov < 1 - FP.config.products.signals.trackingGapPct ? ' — posible pérdida de medición en GA4: lee las tasas con cuidado.' : '.'}`;
    return `<div class="panel panel--inner"><div class="panel__head"><div><h4 class="panel__title">1 · ${esc(f.label)}: de la vista de ficha a la compra</h4><p class="panel__desc">La marca vertical es la referencia (${esc(r.baseline.label)}).</p></div></div><div class="fnl">${rows}</div>
      <p class="field__hint">Las vistas vienen de GA4 y son vistas de ficha, no sesiones. «Compró (GA4)» cuenta artículos comprados, no pedidos. Región, estado, sucursal y tipo de entrega ocurren después de la ficha: ahí el funnel no está disponible.${covNote}</p></div>`;
  }
  function funnelWhere(state) {
    const r = state.pa.result, FEn = FE();
    const body = r.rows.slice(0, 25).map((x) => {
      const c = FEn.pick(x.current), b = FEn.pick(x.baseline), cmp = c && b ? FEn.compare(c, b) : (c ? FEn.compare(c, null) : null);
      const name = `<button type="button" class="link-btn" data-action="an-select" data-entity="${esc(x.key)}" title="Ver la lectura de esta fila">${esc(entName(state, x.key))}</button>`;
      if (!cmp) return `<tr><th scope="row">${name}</th><td colspan="6"><span class="cell-sub">Sin funnel para esta fila</span></td></tr>`;
      const cell = (i) => { const s = cmp.steps[i]; return `<td class="num">${pc1(s.rateCur)}<span class="cell-sub ${dcls(s.deltaPp)}">${pp1(s.deltaPp)}</span></td>`; };
      const dv = cmp.steps[0].deltaPct;
      return `<tr class="${state.an.selected && String(state.an.selected.entity) === String(x.key) ? 'is-selected' : ''}"><th scope="row">${name}</th><td class="num ${dcls(dv === null ? null : dv * 100)}">${dv === null ? DASH : F().signedPercent(dv, 1)}</td>${cell(1)}${cell(2)}${cell(3)}
        <td class="num">${pc1(cmp.cr.cur, 2)}<span class="cell-sub ${dcls(cmp.cr.deltaPp)}">${cmp.cr.deltaPp === null ? '' : `${cmp.cr.deltaPp > 0 ? '+' : cmp.cr.deltaPp < 0 ? '−' : ''}${Math.abs(cmp.cr.deltaPp).toFixed(2)} pp`}</span></td>
        <td>${cmp.weakest ? `${H().pill('error', cmp.weakest.label)}<span class="cell-sub">${pp1(cmp.weakest.deltaPp)} vs referencia</span>` : H().pill('na', 'Sin pérdida material')}</td></tr>`;
    }).join('');
    const tot = FEn.compare(FEn.pick(r.total.current), FEn.pick(r.total.baseline));
    const foot = tot ? `<tfoot><tr><th scope="row">Total</th><td class="num">${tot.steps[0].deltaPct === null ? DASH : F().signedPercent(tot.steps[0].deltaPct, 1)}</td>${[1, 2, 3].map((i) => `<td class="num">${pc1(tot.steps[i].rateCur)}</td>`).join('')}<td class="num">${pc1(tot.cr.cur, 2)}</td><td></td></tr></tfoot>` : '';
    return `<div class="panel panel--inner"><div class="panel__head"><div><h4 class="panel__title">2 · Dónde se pierde</h4><p class="panel__desc">Tasa de cada paso contra la referencia, en puntos porcentuales. Elige una fila para verla en los bloques 1, 3 y 4.</p></div></div>
      <div class="table-wrap"><table class="table ds-table table--dense"><thead><tr><th>${esc(FP.productView.LEVEL[r.level] || r.level)}</th><th class="num">Vistas</th><th class="num">${FEn.TRANSITIONS[0]}</th><th class="num">${FEn.TRANSITIONS[1]}</th><th class="num">${FEn.TRANSITIONS[2]}</th><th class="num" title="Compras GA4 ÷ vistas de ficha">Compras ÷ vistas</th><th>Paso más débil</th></tr></thead><tbody>${body}</tbody>${foot}</table></div>
      <p class="field__hint">Un paso se marca como débil si su tasa cae más de ${FEn.WEAK_PP} pp contra la referencia. «Compras ÷ vistas» usa las compras de GA4; el CR del capítulo 3 usa pedidos ÷ vistas, por eso pueden diferir. ${r.rows.length > 25 ? `Se muestran las 25 primeras de ${r.rows.length}.` : ''}</p></div>`;
  }
  function miniChart(title, vals, labels, cu, re) {
    const pts = vals.map((v, i) => ({ v, i })).filter((x) => x.v !== null && fin(x.v));
    if (pts.length < 2) return `<figure class="fnl-mini"><figcaption>${esc(title)}</figcaption><p class="field__hint">Historia insuficiente.</p></figure>`;
    const W = 236, Hh = 104, L = 40, R = 10, T = 10, B = 20, iw = W - L - R, ih = Hh - T - B, n = vals.length;
    const vs = pts.map((x) => x.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs), pad = (hi0 - lo0) * 0.2 || 0.005, lo = lo0 - pad, hi = hi0 + pad;
    const X = (i) => L + (n > 1 ? i / (n - 1) : 0) * iw, Y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih, P = (v) => (v * 100).toFixed(1);
    const line = pts.map((x) => `${X(x.i).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : null;
    return `<figure class="fnl-mini"><figcaption>${esc(title)}</figcaption><svg class="fnl-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(title)} por periodo, de ${P(pts[0].v)} % a ${P(last.v)} %">
      <line class="fnl-chart__grid" x1="${L}" x2="${W - R}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}"/><line class="fnl-chart__axis" x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}"/>
      <text x="${L - 6}" y="${(Y(hi) + 4).toFixed(1)}" text-anchor="end">${P(hi)}</text><text x="${L - 6}" y="${T + ih + 4}" text-anchor="end">${P(lo)}</text>
      <text x="${L}" y="${Hh - 4}">${esc(labels[0])}</text><text x="${W - R}" y="${Hh - 4}" text-anchor="end">${esc(labels[n - 1])}</text>
      <polyline class="fnl-chart__line" fill="none" points="${line}"/>${prev ? `<circle class="fnl-chart__prev" cx="${X(prev.i).toFixed(1)}" cy="${Y(prev.v).toFixed(1)}" r="3"><title>${esc(labels[prev.i])}: ${P(prev.v)} %</title></circle>` : ''}
      <circle class="fnl-chart__cur" cx="${X(last.i).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="4.5"><title>${esc(labels[last.i])}: ${P(last.v)} %</title></circle></svg>
      <span class="field__hint"><b class="${dcls(cu - re)}">${P(cu)} %</b>${re !== null && fin(re) ? ` vs ${P(re)} % · <span class="${dcls((cu - re) * 100)}">${pp1((cu - re) * 100)}</span>` : ''}</span></figure>`;
  }
  function funnelMonthly(state, f) {
    const fs = state.pa.fseries, FEn = FE();
    let body;
    if (!fs || fs.loading) body = '<p class="field__hint">Calculando las tasas por periodo desde los datos guardados…</p>';
    else if (fs.error) body = `<p class="note note--warning">No se pudieron calcular las tasas por periodo: ${esc(fs.error)}</p>`;
    else {
      const rows = fs.rows, rt = rows.map((x) => (x.v ? FEn.rates(x.v) : null)), labels = rows.map((x) => x.period);
      body = `<div class="fnl-minis">${[0, 1, 2].map((i) => { const k = ['cart', 'checkout', 'purchase'][i], vals = rt.map((x) => (x ? x[k] : null)), idx = vals.map((v, j) => (v !== null ? j : -1)).filter((j) => j >= 0), cu = idx.length ? vals[idx[idx.length - 1]] : null, re = idx.length > 1 ? vals[idx[idx.length - 2]] : null;
        return cu === null ? '' : miniChart(FEn.TRANSITIONS[i], vals, labels, cu, re); }).join('')}</div>`;
    }
    return `<div class="panel panel--inner"><div class="panel__head"><div><h4 class="panel__title">3 · ${esc(f.label)}: tasas por periodo</h4><p class="panel__desc">Punto lleno: periodo actual · punto hueco: el anterior. Mismos periodos y granularidad que la evolución.</p></div></div>${body}</div>`;
  }
  function funnelSplit(state, f) {
    if (!f.cur || !f.base) return '';
    const d = FE().decompose(f.cur, f.base); if (!d) return '';
    const mx = Math.max(Math.abs(d.traffic), Math.abs(d.cr), Math.abs(d.aov), Math.abs(d.delta)) || 1;
    const rows = [['Vistas (tráfico a la ficha)', d.traffic], ['Conversión de ficha', d.cr], ['Venta por compra', d.aov], [`Total ${esc(f.label)}`, d.delta]].map(([l, v], i) => `<tr${i === 3 ? ' class="is-total"' : ''}><th scope="row">${l}</th><td>${fbar(v, mx)}</td><td class="num ${dcls(v)}">${esc(sg(v))}</td></tr>`).join('');
    return `<div class="panel panel--inner"><div class="panel__head"><div><h4 class="panel__title">4 · ${esc(f.label)}: cuánto del cambio de venta viene de cada factor</h4><p class="panel__desc">Vistas × conversión de ficha × venta por compra.</p></div></div>
      <div class="table-wrap"><table class="table ds-table table--dense"><tbody>${rows}</tbody></table></div>
      <p class="field__hint">${d.ok ? '✓ Los tres factores suman exactamente el cambio de venta.' : '⚠ No concilia.'} Diferencias aritméticas, no causas. Usa vistas de ficha como tráfico: por eso difiere del árbol por sesiones de Diagnóstico.</p></div>`;
  }
  function funnelBlocks(state) {
    const r = state.pa.result; if (!r || !FE()) return '';
    const f = funnelFocus(state);
    if (!FE().pick(r.total.current)) return funnelMissing(state);
    if (!f.cur) return `<p class="note"><strong>${esc(f.label)} no tiene funnel en este periodo.</strong> Elige otra fila de la tabla «Dónde se pierde».</p>${funnelWhere(state)}`;
    const cmp = FE().compare(f.cur, f.base);
    return `<div class="fnl-blocks">${funnelSteps(state, f, cmp)}${funnelWhere(state)}${funnelMonthly(state, f)}${funnelSplit(state, f)}</div>`;
  }
  /** Columnas que Evolución suma a la tabla de Producto: una sola tabla para «cuánto pesa» y «cuánto explica». */
  function extraCols(state) {
    const ex = FP.trendView.extras(state);
    const pct = (v) => (v === null || v === undefined || !fin(v) ? DASH : `${(v * 100).toFixed(1)} %`);
    return {
      noFunnel: true, goto: true,
      actions: (x) => `<button type="button" class="btn btn--small btn--ghost" style="white-space:nowrap" data-action="pe-focus" data-key="${esc(x.key)}" data-target="pe-porque" title="Abre el embudo de esta fila">Embudo</button> `,
      sub: (x) => { const e = ex(x.key); return (e.role ? `<span class="cell-sub">${esc(e.role)}${e.rank ? ` · #${e.rank}` : ''}</span>` : '') + (FP.prodevolContext ? FP.prodevolContext.visitMark(state, x.key) : ''); },
      cols: [
        { head: 'Peso del movimiento', cls: 'num', cell: (x) => pct(ex(x.key).movementShare) },
        { head: 'Δ participación', cls: 'num', cell: (x) => { const v = ex(x.key).shareChangePp; return fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` : DASH; } },
        { head: 'Tendencia', cell: (x) => ex(x.key).spark || DASH },
        { head: 'Patrón / inicio', cell: (x) => { const e = ex(x.key); return e.pattern ? `${e.pattern}<span class="cell-sub">Inicio ${esc(e.since || DASH)}</span>` : DASH; } },
        { head: 'Persist.', cls: 'num', cell: (x) => { const v = ex(x.key).persist; return v === null ? DASH : `${v} per.`; } },
        { head: 'Primera pista', cell: (x) => ex(x.key).clue || DASH }
      ]
    };
  }

  function render(state, opts) {
    const el = $('pe-body'); if (!el) return;
    const PV = FP.productView, TV = FP.trendView;
    if (!FP.productStore || !FP.productStore.available()) {
      el.innerHTML = '<section class="panel"><div class="panel__body"><div class="empty"><strong>Todavía no hay datos de productos</strong>Carga el archivo de venta por producto (y, si quieres CR y embudo, el de funnel de GA4) en Carga de datos. <a class="btn btn--small btn--primary" href="#carga">Ir a Carga de datos</a></div></div></section>';
      return;
    }
    const ef = TV.filters(state);
    const controls = PV.controlsHtml(state, { groups: ef.groups, chips: ef.chips, goto: true });
    const res = PV.resultParts(state, extraCols(state));
    const A = TV.build(state), early = A.early !== undefined;
    const lvls = FP.app.paNextChoices(state.pa), curLvl = FP.app.paLevel(state.pa) || 'sku', LV = PV.LEVEL;
    const evoSel = `<div class="field chap__ctl"><label for="pe-evolevel" class="field__hint">Ver evolución por</label><select id="pe-evolevel" data-action="pe-evolevel"><option value="">Igual que la tabla (${esc(LV[curLvl] || curLvl)})</option>${lvls.filter((l) => l !== curLvl).map((l) => `<option value="${l}" ${state.pa.evoLevel === l ? 'selected' : ''}>${esc(LV[l] || l)}</option>`).join('')}</select></div>`;
    const rangeNote = opts && opts.range ? '<p class="note note--warning"><strong>La evolución necesita periodos de calendario.</strong> El rango libre solo aplica a la foto del periodo: elige Año, Mes, Semana o Día en Granularidad para actualizar la evolución.</p>' : '';
    const tools = early ? '' : '<div class="chap__tools"><button type="button" class="btn btn--small btn--ghost" data-action="an-diagnose">Diagnosticar este periodo</button><button type="button" class="btn btn--small btn--ghost" data-action="an-export-contrib">Descargar CSV</button></div>';
    const chips = [['pe-que', 'Qué pasó'], ['pe-meta', 'Contra la meta'], ['pe-quien', 'Quién lo mueve'], ['pe-evolucion', 'Desde cuándo'], ['pe-porque', 'Por qué'], ['pe-hacer', 'Qué hago'], ['pe-evidencia', 'Evidencia']]
      .map(([id, l]) => `<button type="button" class="chip" data-action="pe-jump" data-target="${id}">${esc(l)}</button>`).join('');
    if (FP.app) { FP.app.ensureFunnelSeries(); FP.app.ensureSeasonalContext(); FP.app.ensureVisitDiff(); FP.app.opEnsure(); }   // se calculan una vez por selección
    el.innerHTML = `
      <section class="panel">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-pe">Producto y evolución</h2>
          <p class="panel__desc">Aquí viven ahora Categoría → Producto y Evolución y patrones: sus rutas (#producto y #analisis) abren el capítulo equivalente.</p>
        </div></div>
        <div class="panel__body">${controls}
          ${ef.hint ? `<p class="field__hint">${ef.hint.replace(/^<p[^>]*>|<\/p>$/g, '')}</p>` : ''}
          <div class="pe-jump" role="navigation" aria-label="Secciones de la página">${chips}</div>
        </div>
      </section>
      ${chapter(1, 'que', '¿Qué pasó?', take1(state), `${early ? '' : ef.comparisonNote + A.context + A.narrative}${FP.prodevolContext ? FP.prodevolContext.visitHtml(state) : ''}${res.kpis}`)}
      ${chapter(2, 'meta', '¿Contra la meta?', take2(state), early ? '' : A.bridge)}
      ${chapter(3, 'quien', '¿Quién lo mueve?', take3(state), `${early ? '' : TV.contributionKpis(state)}${tools}<div class="chap__block">${res.table}</div>${early ? '' : A.mix}`)}
      ${chapter(4, 'evolucion', '¿Desde cuándo y hacia dónde?', take4(state), early ? A.early : `${rangeNote}${FP.prodevolContext ? FP.prodevolContext.seasonalHtml(state) : ''}${evoSel}${A.kpis}${A.table}${A.reading}${A.forecast}`)}
      ${chapter(5, 'porque', '¿Por qué se mueve?', take5(state), `${funnelBlocks(state)}${early ? '' : A.pvm}${res.signals ? `<div class="chap__block">${res.signals}</div>` : ''}`)}
      ${chapter(6, 'hacer', '¿Qué hago?', takeHacer(state), FP.prodevolContext ? FP.prodevolContext.actionHtml(state) : '')}
      ${chapter(7, 'evidencia', 'Evidencia y detalle', 'Todo lo anterior se puede rastrear hasta el SKU, el archivo y la fila de origen.', `<div class="chap__block" id="pe-trace">${res.trace}</div>${early ? '' : A.assistant}<div class="chap__tools"><button type="button" class="btn btn--small" data-action="pa-export">Exportar análisis (JSON)</button>${early ? '' : '<button type="button" class="btn btn--small" data-action="an-export-contrib">Descargar CSV de la contribución</button>'}</div><details class="disclosure"><summary>Datos que alimentan esta página</summary><div class="panel__body">${PV.statusHtml(state)}</div></details>`)}`;
    settle(state);
  }

  /** Llegada desde #producto o #analisis: se baja al capítulo cuando ya hay resultados (antes el contenido de arriba aún cambia de alto). */
  function settle(state) {
    const id = state.peAnchor;
    if (!id || !state.pa.result || state.pa.loading || state.an.key === null || state.an.loading) return;
    state.peAnchor = null;
    root.requestAnimationFrame(() => { const t = $(id); if (t) t.scrollIntoView({ block: 'start' }); });
  }

  FP.prodevolView = { render };
  FP.prodevolView._funnel = { funnelFocus, takeFunnel };
})(typeof window !== 'undefined' ? window : globalThis);
