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
    const ent = state.peFocusKey !== null && state.peFocusKey !== undefined ? state.peFocusKey : (state.an.selected && state.an.selected.entity);
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
    const r = state.pa.result, ent = state.peFocusKey !== null && state.peFocusKey !== undefined ? state.peFocusKey : (state.an.selected && state.an.selected.entity);
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
      <details class="disclosure pe-note"><summary>Cómo se mide</summary><p class="field__hint">Las vistas vienen de GA4 y son vistas de ficha, no sesiones. «Compró (GA4)» cuenta artículos comprados, no pedidos. Región, estado, sucursal y tipo de entrega ocurren después de la ficha: ahí el funnel no está disponible.${covNote}</p></details></div>`;
  }
  function funnelWhere(state) {
    const r = state.pa.result, FEn = FE();
    const body = r.rows.slice(0, 25).map((x) => {
      const c = FEn.pick(x.current), b = FEn.pick(x.baseline), cmp = c && b ? FEn.compare(c, b) : (c ? FEn.compare(c, null) : null);
      const name = `<button type="button" class="link-btn" data-action="pe-pick" data-entity="${esc(x.key)}" title="Usar esta fila como foco de los bloques 1, 3 y 4">${esc(entName(state, x.key))}</button>`;
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
      <div class="table-wrap"><table class="table ds-table table--dense" data-pe-fold="where"><thead><tr><th>${esc(FP.productView.LEVEL[r.level] || r.level)}</th><th class="num">Vistas</th><th class="num">${FEn.TRANSITIONS[0]}</th><th class="num">${FEn.TRANSITIONS[1]}</th><th class="num">${FEn.TRANSITIONS[2]}</th><th class="num" title="Compras GA4 ÷ vistas de ficha">Compras ÷ vistas</th><th>Paso más débil</th></tr></thead><tbody>${body}</tbody>${foot}</table></div>
      <details class="disclosure pe-note"><summary>Cómo se marca un paso débil</summary><p class="field__hint">Un paso se marca como débil si su tasa cae más de ${FEn.WEAK_PP} pp contra la referencia. «Compras ÷ vistas» usa las compras de GA4; el CR del capítulo 3 usa pedidos ÷ vistas, por eso pueden diferir. ${r.rows.length > 25 ? `Se muestran las 25 primeras de ${r.rows.length}.` : ''}</p></details></div>`;
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
  /** Lo que la tabla de «¿Quién lo mueve?» suma a la de Producto: el rol bajo el nombre, el cambio de participación y si la entidad gana o pierde lugar. */
  function extraCols(state) {
    const ex = FP.trendView.extras(state);
    const shareRows = new Map(((state.an.share && state.an.share.rows) || []).map((r) => [String(r.entity), r]));
    const MIX = { gaining: ['ok', 'Gana lugar'], losing: ['error', 'Pierde lugar'], stable: ['na', 'Estable'], new: ['ok', 'Nueva'], lost: ['error', 'Perdida'] };
    return {
      noFunnel: true, goto: true,
      sub: (x) => { const e = ex(x.key); return (e.role ? `<span class="cell-sub">${esc(e.role)}${e.rank ? ` · #${e.rank}` : ''}</span>` : '') + (FP.prodevolContext ? FP.prodevolContext.visitMark(state, x.key) : ''); },
      partSub: (x) => { const v = ex(x.key).shareChangePp; return fin(v) ? `<span class="cell-sub">${Math.abs(v) < 0.05 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`} pp</span>` : ''; },
      mix: (x) => { const r = shareRows.get(String(x.key)), m = r && MIX[r.status]; return m ? H().pill(m[0], m[1]) : DASH; }
    };
  }

  /* ---------- Ficha de la entidad (panel lateral): lo que ya no cabe en las tablas ---------- */
  function fichaHtml(state, key) {
    const r = state.pa.result; if (!r || key === null || key === undefined) return '';
    const a = state.an, PV = FP.productView, name = entName(state, key);
    const x = r.rows.find((q) => String(q.key) === String(key));
    if (!x) return `<section class="pe-ficha"><h3 class="pe-ficha__t">${esc(name)}</h3><p class="field__hint">Esta entidad no es una fila de la tabla de ${esc(PV.LEVEL[r.level] || r.level)}: abajo está su lectura de evolución.</p></section>`;
    const ex = FP.trendView.extras(state)(x.key), id = (q) => String(q.entity) === String(x.key);
    const sh = ((a.share && a.share.rows) || []).find(id), pv = ((a.pvm && a.pvm.rows) || []).find(id), ar = (a.rows || []).find(id);
    const dm = (k) => { const d = x.drivers && x.drivers[k]; return d && fin(d.deltaPct) ? F().signedPercent(d.deltaPct, 1) : DASH; };
    const pct = (v) => (v === null || v === undefined || !fin(v) ? DASH : `${(v * 100).toFixed(1)} %`);
    const pp = (v) => (fin(v) ? `${Math.abs(v) < 0.05 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`} pp` : DASH);
    const item = (l, v, hint) => `<div><dt${hint ? ` title="${esc(hint)}"` : ''}>${esc(l)}</dt><dd>${v}</dd></div>`;
    const dl = [
      item('Participación', `${esc(F().percent(x.share, 1))}${fin(ex.shareChangePp) ? ` (${esc(pp(ex.shareChangePp))})` : ''}`),
      item('Peso del movimiento', esc(pct(ex.movementShare)), 'Cuánto del movimiento bruto (subidas y bajadas) es de esta entidad. No es la contribución: esa mide el cambio neto y puede pasar de 100 %.'),
      item('Ranking', sh && sh.rankBaseline ? `${sh.rankBaseline} → ${sh.rankCurrent || DASH}` : DASH),
      item('Pedidos Δ', esc(dm('orders'))), item('Vistas Δ', esc(dm('views'))),
      item('Conversión (CR)', PV.metricVal('conversionRate', x.current && x.current.conversionRate)),
      item('AOV', PV.metricVal('aov', x.current && x.current.aov)),
      item('Precio promedio', pv && pv.p0 !== null && pv.p1 !== null ? `${esc(F().currency(pv.p0, 0))} → ${esc(F().currency(pv.p1, 0))}` : DASH),
      item('Persistencia', ex.persist === null ? DASH : `${ex.persist} per.`),
      item('Acumulado', ar && fin(ar.cumulativeChange) ? esc(F().signedPercent(ar.cumulativeChange, 1)) : DASH)
    ].join('');
    const sig = (x.signals || []).map((q) => `<span class="chip" title="${esc(q.evidence)}">Patrón ${esc(q.pattern)}</span>`).join(' ');
    const act = r.level === 'sku' ? `<button type="button" class="btn btn--small" data-action="pa-trace" data-key="${esc(x.key)}">Trazabilidad</button>`
      : `<button type="button" class="btn btn--small btn--primary" data-action="pa-drill" data-key="${esc(x.key)}">Desglosar ›</button>`;
    return `<section class="pe-ficha" aria-label="Ficha de ${esc(name)}">
      <div><span class="chap__q">Ficha · ${esc(PV.LEVEL[r.level] || r.level)}</span><h3 class="pe-ficha__t">${esc(name)}</h3></div>
      <div class="pe-mini"><div><b>${esc(F().currency(x.revenue.current, 0))}</b><span>Venta</span></div><div><b>${esc(F().signedPercent(x.revenue.deltaPct, 1))}</b><span>vs referencia</span></div><div><b>${esc(F().percent(x.contribution, 1))}</b><span>Contribución</span></div></div>
      <dl class="pe-dl">${dl}</dl>
      ${ex.clue && ex.clue !== DASH ? `<p class="pe-ficha__p"><b>Primera pista:</b> ${ex.clue}</p>` : ''}
      ${sig ? `<p class="pe-ficha__p"><b>Señales:</b> ${sig}</p>` : ''}
      <div class="chap__tools">${act}</div></section>`;
  }
  /** Sin historia suficiente para clasificar patrones (p. ej. vista anual con 2 años): se dice dónde falta, cuántos periodos hacen falta y cómo conseguirlo. */
  function noHistory(state) {
    const a = state.an, g = FP.app.paGran(state.pa), n = (a.periodsList || []).length, min = FP.trendEngine.DEFAULTS.minPeriods;
    const U = { year: ['año', 'años'], month: ['mes', 'meses'], week: ['semana', 'semanas'], day: ['día', 'días'] }[g] || ['periodo', 'periodos'];
    const NEXT = { year: 'mes', month: 'semana', week: 'día' }[g];
    return `<div class="note note--warning pe-nohist"><strong>Con ${n} ${n === 1 ? U[0] : U[1]} no se puede clasificar el patrón.</strong> Se necesitan al menos ${min} periodos con datos; mientras tanto la tabla de Tendencia, Patrón y Cierre proyectado no puede llenarse.${NEXT ? ` <button type="button" class="btn btn--small btn--primary" data-action="pe-finer">Ver por ${NEXT}</button>` : ''}</div>`;
  }

  /* ---------- Tablas que caben: pocas columnas y pocas filas por defecto ---------- */
  const FOLD_ROWS = 5;
  const FOLDS = [
    { key: 'main', sel: '#pe-quien .chap__block table' },
    { key: 'meta', sel: 'table[data-pe-fold="meta"]' },
    { key: 'evo', sel: '#an-trend-table table' },
    { key: 'where', sel: 'table[data-pe-fold="where"]' },
    { key: 'pvm', sel: 'table[data-pe-fold="pvm"]' }
  ];
  function foldState(state) { state.ux.peRows = state.ux.peRows || {}; return state.ux.peRows; }
  /** Cada tabla muestra las primeras filas y se abre con «Ver las N»; la fila entera abre la ficha de su entidad (clic o Enter). */
  function enhance(el, state) {
    const rowsOpen = foldState(state);
    FOLDS.forEach((f) => {
      const table = el.querySelector(f.sel); if (!table || !table.tBodies[0]) return;
      const wrap = table.closest('.table-wrap'); if (!wrap) return;
      const trs = [...table.tBodies[0].rows], open = Boolean(rowsOpen[f.key]);
      trs.forEach((tr, i) => {
        if (!open && i >= FOLD_ROWS) tr.classList.add('pe-hide');
        const c0 = tr.cells[0]; if (c0 && c0.textContent.trim().length > 26) c0.title = c0.textContent.trim().replace(/\s+/g, ' ');
        const key = tr.dataset.peKey;
        if (key !== undefined) {
          tr.dataset.action = tr.dataset.peAct || 'pe-focus'; tr.dataset.key = key; tr.dataset.entity = key; tr.tabIndex = 0; tr.classList.add('pe-row');
          tr.setAttribute('aria-label', `Abrir la ficha de ${(c0 ? c0.textContent : key).trim().replace(/\s+/g, ' ')}`);
          if (state.peFocusKey !== null && state.peFocusKey !== undefined && String(state.peFocusKey) === String(key)) tr.classList.add('is-selected');
        }
      });
      wrap.classList.add('pe-fold');
      const bar = document.createElement('div'); bar.className = 'pe-tt';
      bar.innerHTML = `<span class="pe-tt__n">${open || trs.length <= FOLD_ROWS ? trs.length : FOLD_ROWS} de ${trs.length} filas</span><span class="pe-tt__sp"></span>`
        + (trs.length > FOLD_ROWS ? `<button type="button" class="btn btn--small btn--ghost" data-action="pe-fold-rows" data-key="${f.key}" aria-expanded="${open}">${open ? `Ver solo ${FOLD_ROWS}` : `Ver las ${trs.length}`}</button>` : '');
      wrap.parentNode.insertBefore(bar, wrap);
    });
    if (!el._peKeys) {   // clic o teclado (Enter, espacio) sobre una fila abre su lectura
      el._peKeys = true;
      el.addEventListener('click', (e) => {
        const tr = e.target.closest && e.target.closest('tr.pe-row');
        if (!tr || e.target.closest('button, a, input, select, label, summary')) return;
        const a = FP.app && FP.app.actions[tr.dataset.action]; if (a) a(tr);
      });
      el.addEventListener('keydown', (e) => {
        if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('tr.pe-row')) return;
        e.preventDefault(); const a = FP.app && FP.app.actions[e.target.dataset.action]; if (a) a(e.target);
      });
    }
  }

  /* ---------- Barra fija: alto bajo la cabecera, modo compacto y capítulo activo ---------- */
  function bindBar() {
    const upd = () => {
      const bar = $('pe-bar'), hd = document.querySelector('.app-header');
      if (!bar) return;
      if (hd) root.document.documentElement.style.setProperty('--pe-top', `${Math.round(hd.getBoundingClientRect().height)}px`);
      const bb = bar.getBoundingClientRect(), top = bb.bottom + 8;
      bar.classList.toggle('is-compact', (root.scrollY || 0) > 160);
      let on = null;
      ['que', 'meta', 'quien', 'evolucion', 'porque', 'hacer', 'evidencia'].forEach((id) => { const c = $('pe-' + id); if (c && c.getBoundingClientRect().top <= top + 4) on = id; });
      bar.querySelectorAll('.pe-jump__b').forEach((b) => { const is = on && b.dataset.target === 'pe-' + on; b.classList.toggle('is-on', Boolean(is)); if (is) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    };
    if (!root.__peBar) {
      root.__peBar = true; let t = 0;
      const tick = () => { if (t) return; t = root.requestAnimationFrame(() => { t = 0; root.__peBarUpd && root.__peBarUpd(); }); };
      root.addEventListener('scroll', tick, { passive: true }); root.addEventListener('resize', tick);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('pe-drawer') && FP.app) FP.app.actions['pe-drawer-close'](); });
    }
    root.__peBarUpd = upd; upd();
    if (!root.__peToggle) { root.__peToggle = true; document.addEventListener('toggle', (e) => { const t = e.target; if (t && t.matches && t.matches('details.drill-fold') && FP.app) FP.app.state.an.drillOpen = t.open; }, true); }   // plegar «Detalle y trazabilidad» no lo borra: se recuerda abierto o cerrado
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
      .map(([id, l]) => `<button type="button" class="pe-jump__b" data-action="pe-jump" data-target="${id}">${esc(l)}</button>`).join('');
    if (FP.app) { FP.app.ensureFunnelSeries(); FP.app.ensureSeasonalContext(); FP.app.ensureVisitDiff(); FP.app.opEnsure(); }   // se calculan una vez por selección
    const focusEnt = state.peFocusKey !== null && state.peFocusKey !== undefined ? state.peFocusKey : (state.an.selected && state.an.selected.entity);
    const gUnit = { year: 'año', month: 'mes', week: 'semana' }[state.peBack && state.peBack.gran];
    const backStrip = state.peBack && gUnit ? `<p class="pe-focus">Viendo el periodo por ${{ year: 'mes', month: 'semana', week: 'día' }[state.peBack.gran]}. <button type="button" class="btn btn--small btn--ghost" data-action="pe-back">Volver a ${gUnit}</button></p>` : '';
    const focusStrip = backStrip + (focusEnt !== null && focusEnt !== undefined ? `<p class="pe-focus">Foco: <b>${esc(entName(state, focusEnt))}</b> <button type="button" class="btn btn--small btn--ghost" data-action="an-clear-selection">Quitar foco</button></p>` : '');
    const help = ef.hint ? `<details class="disclosure pe-note"><summary>Cómo leer patrón, señal y materialidad</summary><p class="field__hint">${ef.hint.replace(/^<p[^>]*>|<\/p>$/g, '')}</p></details>` : '';
    const totalBtn = early ? '' : '<button type="button" class="btn btn--small btn--ghost" data-action="an-drill-total" data-source="kpi">Detalle del total</button>';
    const hist = !early && !(state.an.rows || []).length && !state.an.loading && state.an.key !== null && !(opts && opts.range);
    const evoTools = early ? '' : `<div class="chap__tools">${totalBtn}</div>`;
    const wasOpen = Boolean($('pe-drawer'));
    const hasFocus = focusEnt !== null && focusEnt !== undefined;
    const drawerOn = Boolean(state.peDrawer && !early && (state.an.selected || state.an.drill || hasFocus));
    const noRow = drawerOn && !state.an.selected;
    const drawerBody = drawerOn ? `${hasFocus ? fichaHtml(state, focusEnt) : ''}${noRow && !(state.an.rows || []).length && !state.an.loading ? noHistory(state) : ''}${A.reading || ''}` : '';
    if (hasFocus) state.peLastKey = focusEnt;
    el.innerHTML = `
      <section class="panel pe-title">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-pe">Producto y evolución</h2>
        </div></div>
      </section>
      <div class="pe-sticky" id="pe-bar">${controls}${focusStrip}<div class="pe-jump" role="navigation" aria-label="Capítulos de la página">${chips}</div></div>
      ${chapter(1, 'que', '¿Qué pasó?', take1(state), `${early ? '' : ef.comparisonNote + A.context}${FP.prodevolContext ? FP.prodevolContext.visitHtml(state) : ''}${res.kpis}${early ? '' : `<details class="disclosure pe-note"><summary>Resumen en texto y cómo se calcula</summary>${A.narrative}</details>`}`)}
      ${chapter(2, 'meta', '¿Contra la meta?', take2(state), early ? '' : A.bridge)}
      ${chapter(3, 'quien', '¿Quién lo mueve?', take3(state), `${early ? '' : TV.contributionKpis(state)}${tools}<div class="chap__block">${res.table}</div>${early ? '' : `<details class="disclosure pe-note"><summary>Mix Intelligence · quién gana y quién pierde participación</summary>${A.mix}</details>`}`)}
      ${chapter(4, 'evolucion', '¿Desde cuándo y hacia dónde?', take4(state), early ? A.early : `${rangeNote}${FP.prodevolContext ? FP.prodevolContext.seasonalHtml(state) : ''}${help}${evoSel}${evoTools}${hist ? noHistory(state) : A.table}${A.forecast}`)}
      ${chapter(5, 'porque', '¿Por qué se mueve?', take5(state), `${funnelBlocks(state)}${early ? '' : A.pvm}${res.signals ? `<div class="chap__block">${res.signals}</div>` : ''}`)}
      ${chapter(6, 'hacer', '¿Qué hago?', takeHacer(state), FP.prodevolContext ? FP.prodevolContext.actionHtml(state) : '')}
      ${chapter(7, 'evidencia', 'Evidencia y detalle', 'Todo lo anterior se puede rastrear hasta el SKU, el archivo y la fila de origen.', `<div class="chap__block" id="pe-trace">${res.trace}</div>${early ? '' : A.assistant}<div class="chap__tools"><button type="button" class="btn btn--small" data-action="pa-export">Exportar análisis (JSON)</button>${early ? '' : '<button type="button" class="btn btn--small" data-action="an-export-contrib">Descargar CSV de la contribución</button>'}</div><details class="disclosure"><summary>Datos que alimentan esta página</summary><div class="panel__body">${PV.statusHtml(state)}</div></details>`)}
      `;
    enhance(el, state);
    // El panel vive fuera de #pe-body: los repintados de la página no lo tocan (sin parpadeo, sin perder el desplazamiento ni la animación de entrada).
    let dock = $('pe-drawer-root');
    if (!dock) { dock = document.createElement('div'); dock.id = 'pe-drawer-root'; el.parentNode.insertBefore(dock, el.nextSibling); }
    if (drawerOn) {
      let dr = $('pe-drawer');
      if (!dr) {
        dock.innerHTML = '<button type="button" class="pe-scrim" data-action="pe-drawer-close" aria-label="Cerrar la lectura" tabindex="-1"></button><aside class="pe-drawer pe-drawer--in" id="pe-drawer" role="dialog" aria-modal="true" aria-label="Lectura de la entidad"><div class="pe-drawer__top"><button type="button" class="btn btn--small" id="pe-drawer-x" data-action="pe-drawer-close">Cerrar ✕</button></div><div class="pe-drawer__body"></div></aside>';
        dr = $('pe-drawer'); dr.addEventListener('animationend', () => dr.classList.remove('pe-drawer--in'), { once: true });
      }
      const body = dr.querySelector('.pe-drawer__body');
      if (body._peHtml !== drawerBody) { const top = body.scrollTop; body.innerHTML = drawerBody; body._peHtml = drawerBody; body.scrollTop = top; }   // solo se reescribe si cambió
      if (!wasOpen) { const x = $('pe-drawer-x'); if (x) x.focus({ preventScroll: true }); }
    } else if (dock.firstChild) {
      dock.textContent = '';
      if (wasOpen && state.peLastKey !== undefined) {
        const row = [...el.querySelectorAll('tr[data-pe-key]')].find((t) => String(t.dataset.peKey) === String(state.peLastKey));
        if (row) row.focus({ preventScroll: true });
      }
    }
    bindBar();
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
