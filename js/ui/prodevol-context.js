/**
 * prodevol-context.js — Producto y evolución · lo que conecta la página con otros módulos:
 *   · contexto de época (¿es normal para esta época?, contra el año anterior, movimientos inusuales),
 *   · «nuevo desde tu última visita» (qué cambió en la lectura de cada fila desde la última vez),
 *   · «¿Qué hago?» (hipótesis por validar, lo que ya está en marcha en Promociones y qué impulsar desde Oportunidades).
 * Solo compone HTML y compara datos ya calculados; no inventa cifras ni causas. Los cálculos asíncronos viven en app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const esc = (v) => (FP.ui && FP.ui.helpers ? FP.ui.helpers.esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.format;
  const nw = (t) => `<span class="nw">${esc(t)}</span>`;
  const pill = (kind, text) => FP.ui.helpers.pill(kind, text);
  const money = (v) => F().currency(Math.abs(v), 0);

  /* ====================== Nuevo desde tu última visita (puro) ====================== */
  const DIR = { growth: 'crece', decline: 'cae', stable: 'está estable' };
  /**
   * Compara la lectura de cada fila con la de la visita anterior.
   * base/cur: { [clave]: { d: dirección, p: patrón, an: dirección de la anomalía o null, s: señal avanzada } }
   * Devuelve { items:[{key, kind, text, weight}], counts } ordenado de lo más importante a lo menos.
   */
  function visitDiff(base, cur, patternLabel) {
    const lbl = patternLabel || ((x) => x);
    const items = [];
    Object.keys(cur || {}).forEach((k) => {
      const c = cur[k], b = base ? base[k] : null;
      if (!b) { items.push({ key: k, kind: 'new', weight: 1, text: 'aparece en el análisis (antes no estaba)' }); return; }
      if (c.d !== b.d && (c.d || b.d)) {
        const worse = c.d === 'decline', better = c.d === 'growth' && b.d === 'decline';
        items.push({ key: k, kind: 'state', weight: worse ? 5 : better ? 4 : 2, text: worse ? `ahora cae${b.d ? ` (antes ${DIR[b.d] || b.d})` : ''}` : better ? 'ahora crece (antes caía)' : `ahora ${DIR[c.d] || c.d || 'sin dirección'} (antes ${DIR[b.d] || b.d || 'sin dirección'})` });
      }
      if (c.an && !b.an) items.push({ key: k, kind: 'anomaly', weight: 4, text: `tiene un movimiento inusual nuevo (${c.an === 'decrease' ? 'caída' : c.an === 'increase' ? 'subida' : 'inusual'})` });
      if (c.p && b.p && c.p !== b.p) items.push({ key: k, kind: 'pattern', weight: 3, text: `cambió de patrón: ${lbl(b.p)} → ${lbl(c.p)}` });
    });
    Object.keys(base || {}).forEach((k) => { if (!cur[k]) items.push({ key: k, kind: 'gone', weight: 1, text: 'ya no aparece en el análisis' }); });
    items.sort((a, b) => b.weight - a.weight || String(a.key).localeCompare(String(b.key), 'es'));
    const counts = {}; items.forEach((i) => { counts[i.kind] = (counts[i.kind] || 0) + 1; });
    return { items, counts };
  }

  /* ====================== Selección → SKU ====================== */
  /** SKU que cubre la selección (ruta) y, si hay una fila elegida, esa fila. Null si no hay catálogo. */
  function selectionSkus(state) {
    const PS = FP.productStore, list = PS && PS.catalog ? PS.catalog.list : null;
    if (!list || !list.length) return null;
    const path = FP.app.paFilter(state.pa), a = state.an, ent = a.selected && a.selected.entity;
    const f = { ...path };
    if (ent && ['category', 'subcategory', 'product', 'sku'].includes(a.level)) f[a.level] = ent;
    const out = new Set();
    list.forEach((c) => {
      if (f.category && c.category !== f.category) return;
      if (f.subcategory && c.subcategory !== f.subcategory) return;
      if (f.product && (c.product || c.sku) !== f.product) return;
      if (f.sku && c.sku !== f.sku) return;
      out.add(c.sku);
    });
    return out;
  }

  /* ====================== Contexto de época ====================== */
  const pc = (v) => (fin(v) ? F().signedPercent(v, 1) : '—');
  function seasonalHtml(state) {
    const s = state.pa.seasonal, a = state.an;
    if (!s || s.loading) return '<div class="ctxrow"><div class="ctxcard"><span class="hint">¿Es normal para la época?</span><b>Calculando…</b></div></div>';
    const rows = a.rows || [], ent = a.selected && a.selected.entity;
    const an = (ent ? rows.filter((r) => String(r.entity) === String(ent)) : rows).filter((r) => r.anomaly);
    // 1 · época
    let c1;
    if (fin(s.change) && fin(s.lastChange)) {
      const d = (s.change - s.lastChange) * 100, word = d < -2 ? 'Peor que la misma época del año pasado' : d > 2 ? 'Mejor que la misma época del año pasado' : 'En línea con la misma época del año pasado';
      c1 = `<b>${esc(word)}</b><span class="hint">Este periodo: ${esc(pc(s.change))}; hace un año: ${esc(pc(s.lastChange))} (${nw(`${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pp`)}). Un solo año de referencia: no es un índice estacional.</span>`;
    } else c1 = '<b>Sin referencia del año anterior</b><span class="hint">Para saber si esto es normal en esta época hacen falta los mismos periodos del año pasado en los datos de productos.</span>';
    // 2 · año anterior
    const c2 = fin(s.yoy) ? `<b>${esc(pc(s.yoy))}</b><span class="hint">${esc(F().currency(s.cur, 0))} contra ${esc(F().currency(s.lastCur, 0))} en el mismo periodo del año anterior.</span>` : '<b>—</b><span class="hint">No hay datos del mismo periodo del año anterior.</span>';
    // 3 · inusuales
    const c3 = an.length ? `<b>${an.length} ${an.length === 1 ? 'movimiento inusual' : 'movimientos inusuales'}</b><span class="hint">${esc(an.slice(0, 3).map((r) => `${r.entity} (${r.anomaly.direction === 'decrease' ? 'caída' : r.anomaly.direction === 'increase' ? 'subida' : 'inusual'})`).join(' · '))}${an.length > 3 ? ` y ${an.length - 3} más` : ''}</span>` : '<b>Ninguno</b><span class="hint">Dentro del rango habitual de cada serie.</span>';
    return `<div class="ctxrow"><div class="ctxcard"><span class="hint">¿Es normal para la época?</span>${c1}<a class="link-btn" href="#estacionalidad" data-nav="estacionalidad">Ver Estacionalidad</a></div><div class="ctxcard"><span class="hint">Contra el mismo periodo del año anterior</span>${c2}</div><div class="ctxcard"><span class="hint">Movimientos inusuales</span>${c3}</div></div>`;
  }

  /* ====================== Nuevo desde tu última visita (HTML) ====================== */
  function visitHtml(state) {
    const v = state.pa.visit; if (!v) return '';
    const when = v.at ? new Date(v.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    if (v.first) return '<p class="note"><strong>Primera visita con esta selección.</strong> Desde la próxima verás aquí qué cambió en la lectura de cada fila.</p>';
    if (!v.items.length) return `<p class="note"><strong>Sin cambios desde tu última visita</strong> (${esc(when)}): las filas siguen con la misma lectura.</p>`;
    const top = v.items.slice(0, 6), more = v.items.length - top.length;
    return `<div class="panel panel--inner"><div class="panel__head"><div><h4 class="panel__title">Nuevo desde tu última visita</h4><p class="panel__desc">Última vez: ${esc(when)}. Compara la lectura de cada fila (dirección, patrón y movimientos inusuales), no las cifras.</p></div></div>
      <ul class="alert-list">${top.map((i) => `<li>${pill(i.kind === 'state' && /cae/.test(i.text) ? 'warning' : 'na', 'Nuevo')} <span><strong>${esc(i.key)}</strong>: ${esc(i.text)}.</span></li>`).join('')}</ul>${more > 0 ? `<p class="field__hint">Y ${more} cambio(s) más. <button type="button" class="link-btn" data-action="go" data-view="cambios">Qué cambió desde ayer</button> resume el total contra el plan.</p>` : '<p class="field__hint"><button type="button" class="link-btn" data-action="go" data-view="cambios">Qué cambió desde ayer</button> resume el total contra el plan.</p>'}</div>`;
  }
  /** Marca «Nuevo» junto al nombre de una fila que cambió. */
  function visitMark(state, key) {
    const v = state.pa.visit; if (!v || !v.items.length) return '';
    return v.items.some((i) => String(i.key) === String(key)) ? ` ${pill('na', 'Nuevo')}` : '';
  }

  /* ====================== ¿Qué hago? ====================== */
  const HYP_STEP = { 'Vista → carrito': 'revisar el precio visible, la disponibilidad y el contenido de la ficha', 'Carrito → checkout': 'revisar el costo de envío y la fricción para iniciar el checkout', 'Checkout → compra': 'revisar medios de pago, costo de envío y disponibilidad al pagar' };
  /** Hipótesis de partida, escritas con lo que muestran los datos. No son causas: hay que validarlas. */
  function hypotheses(state) {
    const out = [], r = state.pa.result; if (!r) return out;
    const V = FP.prodevolView && FP.prodevolView._funnel, FE = FP.funnelEngine;
    if (V && FE) {
      const f = V.funnelFocus(state), cmp = f.cur && f.base ? FE.compare(f.cur, f.base) : null, rd = FE.reading(cmp);
      if (rd) {
        if (rd.kind === 'views_up_cr_down') {
          if (rd.weak) out.push({ text: `La conversión de ficha baja ${Math.abs(rd.crPp).toFixed(2)} pp con más vistas: ${HYP_STEP[rd.weak.label] || 'revisar el paso más débil'}.`, ev: `${f.label} · paso más débil: ${rd.weak.label} (${rd.weak.deltaPp.toFixed(1)} pp)` });
          out.push({ text: 'Puede haber tráfico nuevo de menor intención entre las vistas que suben.', ev: `${f.label} · vistas ${F().signedPercent(rd.views, 1)}` });
        } else if (rd.kind === 'views_down') out.push({ text: 'Menos personas llegan a la ficha: revisar campañas, posicionamiento y visibilidad del producto.', ev: `${f.label} · vistas ${F().signedPercent(rd.views, 1)}` });
      }
      const cov = r.total.current.trackingCoverage && r.total.current.trackingCoverage.value;
      if (fin(cov) && cov < 1 - FP.config.products.signals.trackingGapPct) out.push({ text: 'Posible pérdida de medición en GA4: valida el etiquetado antes de decidir con las tasas del embudo.', ev: `Cobertura de tracking ${F().percent(cov, 0)}` });
    }
    const a = state.an, ent = a.selected && a.selected.entity, row = ent ? (a.rows || []).find((x) => String(x.entity) === String(ent)) : null;
    if (row && row.pattern && /decline/.test(row.pattern)) out.push({ text: 'La caída es sostenida, no un tropiezo de un periodo: confirmar si hubo un cambio de catálogo, de precio o de abasto.', ev: `${row.entity} · ${FP.trendView.patternLabel(row.pattern)}` });
    if (row && row.anomaly && row.anomaly.direction === 'decrease') out.push({ text: 'Revisar el periodo de la caída inusual: promoción terminada, quiebre de inventario o falla de medición.', ev: `${row.entity} · movimiento inusual` });
    return out.slice(0, 4);
  }
  function runningHtml(state, skus) {
    const items = [];
    const pm = state.pm && state.pm.reg ? state.pm.reg.promotions : [], ACTIVE = ['approved', 'published', 'measuring'];
    const pst = FP.promotions && FP.promotions.STATUS ? FP.promotions.STATUS : {};
    pm.filter((p) => ACTIVE.includes(p.status) && (p.skus || []).some((s) => skus.has(s.sku))).slice(0, 3).forEach((p) => {
      const n = (p.skus || []).filter((s) => skus.has(s.sku)).length;
      items.push(`<li>${pill(p.status === 'measuring' ? 'ok' : 'na', pst[p.status] || p.status)}<span><b>${esc(p.name)}</b> · ${esc(p.promoId)}${p.plannedStart ? ` · ${esc(p.plannedStart)}${p.plannedEnd ? ` a ${esc(p.plannedEnd)}` : ''}` : ''}<span class="cell-sub">${n} SKU de esta selección · se mide en Promociones</span></span></li>`);
    });
    const ex = state.ex && state.ex.reg ? state.ex.reg.items : [];
    const exs = ex.filter((e) => e.state === 'active' && skus.has(e.sku));
    exs.slice(0, 3).forEach((e) => items.push(`<li>${pill('na', 'Exposición')}<span><b>${esc(e.name || e.sku)}</b> · ${esc(e.batchId)}${e.start ? ` · desde ${esc(e.start)}` : ''}<span class="cell-sub">Exposición sin oferta de descuento: no cuenta en descuento promedio ni cobertura.</span></span></li>`));
    if (exs.length > 3) items.push(`<li><span class="cell-sub">Y ${exs.length - 3} exposición(es) más.</span></li>`);
    const rq = state.rq && state.rq.reg ? state.rq.reg.requests.filter((r) => r.state === 'asked' && skus.has(r.sku)) : [];
    if (rq.length) items.push(`<li>${pill('warning', 'Oferta pedida')}<span><b>${rq.length} SKU</b> con oferta pedida a Comercial, sin respuesta todavía<span class="cell-sub">${esc(rq.slice(0, 3).map((r) => r.name || r.sku).join(' · '))}${rq.length > 3 ? '…' : ''}</span></span></li>`);
    return items.length ? `<ul class="sig">${items.join('')}</ul>` : '<p class="field__hint">No hay promociones, exposiciones ni ofertas pedidas para esta selección.</p>';
  }
  function opportunitiesHtml(state, skus) {
    const op = state.op;
    if (!op || !op.result) return `<p class="field__hint">${op && op.loading ? 'Calculando oportunidades…' : 'Las oportunidades se calculan desde los datos de productos y funnel.'}</p>`;
    const items = op.result.items.filter((i) => skus.has(i.sku)).slice(0, 3);
    const per = op.result.period ? `${op.result.period.from} a ${op.result.period.to}` : '';
    if (!items.length) return `<p class="field__hint">Ningún SKU de esta selección califica hoy como oportunidad${per ? ` (${esc(per)})` : ''}.</p>`;
    return `<ul class="sig">${items.map((i) => `<li>${pill(i.evidence.level === 'high' ? 'ok' : i.evidence.level === 'medium' ? 'warning' : 'na', `Evidencia ${i.evidence.level === 'high' ? 'alta' : i.evidence.level === 'medium' ? 'media' : 'baja'}`)}<span><b>${esc(i.name)}</b> · ${esc(i.sku)}<span class="cell-sub">${esc(i.types.map((t) => t.label || (FP.opportunities && FP.opportunities.TYPES[t.id] && FP.opportunities.TYPES[t.id].label) || t.id).join(' · '))} · Ruta: ${esc((FP.opportunities && FP.opportunities.ROUTES[i.route.id] && FP.opportunities.ROUTES[i.route.id].label) || i.route.id)}</span></span></li>`).join('')}</ul><p class="field__hint">Periodo de las oportunidades: ${esc(per)}. Se piden en Promociones.</p>`;
  }
  function actionHtml(state) {
    const skus = selectionSkus(state) || new Set(), hy = hypotheses(state);
    const hyHtml = hy.length ? `<ul class="sig">${hy.map((h) => `<li>${pill('na', 'Hipótesis')}<span>${esc(h.text)}<span class="cell-sub">${esc(h.ev)}</span></span></li>`).join('')}</ul>` : '<p class="field__hint">Con lo que muestran los datos de esta selección no hay hipótesis que validar por ahora.</p>';
    return `<div class="cols3">
      <div class="panel panel--inner"><h4 class="panel__title">Hipótesis por validar</h4>${hyHtml}<p class="field__hint">Son un punto de partida, no causas. Recovery Center arma sus hipótesis desde el Diagnóstico y las convierte en escenarios y acciones.</p><button type="button" class="btn btn--small btn--primary" data-action="go" data-view="recovery">Abrir Recovery Center</button></div>
      <div class="panel panel--inner"><h4 class="panel__title">Ya en marcha en esta selección</h4>${runningHtml(state, skus)}<button type="button" class="btn btn--small" data-action="go" data-view="promociones">Abrir Promociones</button> <button type="button" class="btn btn--small" data-action="go" data-view="medir">Abrir Seguimiento y aprendizaje</button></div>
      <div class="panel panel--inner"><h4 class="panel__title">Qué impulsar</h4>${opportunitiesHtml(state, skus)}<button type="button" class="btn btn--small" data-action="pe-open-op">Abrir Oportunidades</button></div></div>`;
  }

  /** Cuántas hipótesis, cosas en marcha y oportunidades hay para la selección (para la conclusión del capítulo). */
  function counts(state) {
    const skus = selectionSkus(state) || new Set(), hy = hypotheses(state).length;
    const pm = (state.pm && state.pm.reg ? state.pm.reg.promotions : []).filter((p) => ['approved', 'published', 'measuring'].includes(p.status) && (p.skus || []).some((s) => skus.has(s.sku))).length;
    const ex = (state.ex && state.ex.reg ? state.ex.reg.items : []).filter((e) => e.state === 'active' && skus.has(e.sku)).length;
    const rq = (state.rq && state.rq.reg ? state.rq.reg.requests : []).filter((r) => r.state === 'asked' && skus.has(r.sku)).length;
    const op = state.op && state.op.result ? state.op.result.items.filter((i) => skus.has(i.sku)).length : null;
    return { hypotheses: hy, promotions: pm, exposures: ex, requests: rq, running: pm + ex + rq, opportunities: op };
  }
  FP.prodevolContext = { visitDiff, selectionSkus, seasonalHtml, visitHtml, visitMark, hypotheses, actionHtml, counts };
})(typeof window !== 'undefined' ? window : globalThis);
