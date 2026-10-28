/**
 * px-view.js — «Producto y evolución», versión B (maqueta aprobada «maqueta_v3_confianza»).
 * Una sola página para tres lectores: veredicto y atención arriba, cinco preguntas debajo y el método cerrado al final.
 * Solo compone HTML con datos que la app ya calculó (pa.result, an.contribution, an.share, an.pvm, an.bridge, an.rows, an.forecast,
 * pa.seasonal, pa.visit, funnelEngine). El CSS (css/px.css) sale de la maqueta: las clases llevan el prefijo px- y se agregan en P().
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.format;
  const DASH = '—';

  /* ---------- Formato (idéntico al de la maqueta) ---------- */
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const isMonth = (p) => /^\d{4}-\d{2}$/.test(String(p || ''));
  const ym = (p) => (isMonth(p) ? `${MES[+p.slice(5) - 1]} ${p.slice(0, 4)}` : String(p == null ? '' : p));
  const ymc = (p) => { const s = ym(p); return s.charAt(0).toUpperCase() + s.slice(1); };
  const M = (v, sign) => { const a = Math.abs(v), t = a >= 1e6 ? `$${(a / 1e6).toFixed(1)} M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)} K` : `$${a.toFixed(0)}`; return (v < 0 ? '−' : sign ? '+' : '') + t; };
  const m2 = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1e6 ? `${(a / 1e6).toFixed(2)} M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)} K` : a.toFixed(0)); };
  const ms2 = (v) => (v >= 0 ? '+' : '') + m2(v);
  const pcs = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d == null ? 1 : d) + ' %';
  const sgn = (v, d) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);
  const num0 = (v) => Math.round(v).toLocaleString('es-MX');
  /** Métrica de la evolución (Venta, Pedidos o Unidades): en pesos solo si es Venta. */
  let MK = 'revenue';
  const e1 = (v) => (MK === 'revenue' ? M(v) : M(v).replace('$', ''));
  const e2 = (v) => (MK === 'revenue' ? m2(v) : m2(v).replace('$', ''));
  const ML = { revenue: ['Venta', 'La venta', 'va'], orders: ['Pedidos', 'Los pedidos', 'van'], units: ['Unidades', 'Las unidades', 'van'] };
  const tip = (t) => `<span class="i" tabindex="0" data-tip="${esc(t)}" aria-label="${esc(t)}">i</span>`;
  /** Agrega el prefijo px- a cada clase del HTML que se arma aquí (el CSS de la maqueta las trae así). */
  const P = (h) => h.replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(/\s+/).filter(Boolean).map((t) => (t === 'px' ? t : 'px-' + t)).join(' ')}"`);

  const LEVEL_WORD = { category: ['categoría', 'categorías', 'la categoría'], subcategory: ['subcategoría', 'subcategorías', 'la subcategoría'], product: ['producto', 'productos', 'el producto'], sku: ['SKU', 'SKU', 'el SKU'], region: ['región', 'regiones', 'la región'], state: ['estado', 'estados', 'el estado'], city: ['ciudad', 'ciudades', 'la ciudad'], branch: ['sucursal', 'sucursales', 'la sucursal'], delivery: ['tipo de entrega', 'tipos de entrega', 'el tipo de entrega'] };
  const lw = (level) => LEVEL_WORD[level] || ['entidad', 'entidades', 'la entidad'];
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Nombres de periodo y de comparación ---------- */
  /** «agosto» (o «agosto 2025») cuando la referencia es un mes; si no, la etiqueta que trae el análisis. */
  function refName(ci) {
    const b = ci && ci.baseline, c = ci && ci.current;
    if (b && isMonth(b.key)) { const nm = MESF[+b.key.slice(5) - 1]; return c && isMonth(c.key) && c.key.slice(0, 4) === b.key.slice(0, 4) ? nm : `${nm} ${b.key.slice(0, 4)}`; }
    return b && b.label ? b.label : 'la referencia';
  }
  const refShort = (ci) => { const b = ci && ci.baseline; return b && isMonth(b.key) ? MES[+b.key.slice(5) - 1] : 'antes'; };
  const monthOf = (key) => (isMonth(key) ? MES[+key.slice(5) - 1] : String(key || ''));

  /* ---------- Modelo: todo lo que la página necesita, calculado una vez por pintado ---------- */
  function model(state) {
    const r = state.pa.result, a = state.an, ci = a.comparisonInfo || {};
    const t = r.total, tc = t.current, tb = t.baseline;
    const net = tc.revenue.value - tb.revenue.value, netPct = tb.revenue.value ? net / tb.revenue.value : null;
    const rows = r.rows.filter((x) => fin(x.revenue.delta)).slice().sort((x, y) => Math.abs(y.revenue.delta) - Math.abs(x.revenue.delta));
    const ex = FP.trendView.extras(state);
    const shareRows = new Map(((a.share && a.share.rows) || []).map((x) => [String(x.entity), x]));
    const evo = new Map((a.rows || []).map((x) => [String(x.entity), x]));
    const shown = new Set(FP.trendView.filterRows(a).map((x) => String(x.entity)));
    const fcm = new Map(((a.forecast && a.forecast.rows) || []).map((x) => [String(x.entity), x]));
    const pvm = new Map(((a.pvm && a.pvm.rows) || []).map((x) => [String(x.entity), x]));
    const cats = rows.map((x) => {
      const e = ex(x.key), sh = shareRows.get(String(x.key));
      return { key: String(x.key), x, d: x.revenue.delta, p: fin(x.revenue.deltaPct) ? x.revenue.deltaPct * 100 : 0, share: x.share, dpp: fin(e.shareChangePp) ? e.shareChangePp : (sh && fin(sh.shareChangePp) ? sh.shareChangePp : 0), contrib: x.contribution, ev: evo.get(String(x.key)) || null, vis: shown.has(String(x.key)), fc: fcm.get(String(x.key)) || null, pv: pvm.get(String(x.key)) || null, ex: e };
    });
    return { r, a, ci, state, shown, exf: ex, tc, tb, net, netPct, cats, mx: Math.max(1, ...cats.map((c) => Math.abs(c.d))), level: r.level, evo, fcm, pvm };
  }
  /** Una fila que no es de la tabla (p. ej. un producto cuando la tabla va por categoría): se arma con lo que el análisis sí trae de ella. */
  function rowFor(m, key) {
    const k = String(key), a = m.a, ev = m.evo.get(k) || null;
    const ct = a.contribution && a.contribution.status === 'available' ? [...a.contribution.positive, ...a.contribution.negative].find((x) => String(x.entity) === k) : null;
    const sh = ((a.share && a.share.rows) || []).find((x) => String(x.entity) === k);
    if (!ev && !ct && !sh) return null;
    const cur = ct ? ct.current : sh ? sh.currentValue : ev.currentValue, base = ct ? ct.baseline : sh ? sh.baselineValue : ev.previousValue;
    const delta = ct ? ct.delta : cur - base, pct = ct && fin(ct.deltaPct) ? ct.deltaPct : (base ? cur / base - 1 : 0);
    return { key: k, x: { revenue: { current: cur, baseline: base, delta, deltaPct: pct }, drivers: {}, current: {}, baseline: {} }, d: delta, p: pct * 100, share: sh ? sh.currentShare : (ct ? ct.currentShare : 0), dpp: ct && fin(ct.shareChangePp) ? ct.shareChangePp : (sh && fin(sh.shareChangePp) ? sh.shareChangePp : 0), contrib: ct && fin(ct.contributionPct) ? ct.contributionPct : NaN, ev, fc: m.fcm.get(k) || null, pv: m.pvm.get(k) || null, ex: m.exf(k) };
  }
  /** El total de la selección como una fila más (para su ficha). */
  function totalRow(m) {
    const rel = (k) => { const c0 = m.tc[k], b0 = m.tb[k]; return c0 && b0 && fin(c0.value) && fin(b0.value) && b0.value ? { deltaPct: c0.value / b0.value - 1 } : null; };
    return { key: '__total__', total: true, x: { revenue: { current: m.tc.revenue.value, baseline: m.tb.revenue.value, delta: m.net, deltaPct: m.netPct }, drivers: { orders: rel('orders'), views: rel('views') }, current: m.tc, baseline: m.tb }, d: m.net, p: (m.netPct || 0) * 100, share: 1, dpp: 0, contrib: 1, ev: null, fc: null, pv: null, ex: { movementShare: null, persist: null, clue: F().DASH } };
  }
  const nameOf = (m, k) => (FP.productFilter && m.level === 'branch' ? FP.productFilter.label('branch', k) : k);

  /* ---------- Pronóstico de una entidad: lo del forecast; si no, la proyección de su historia ---------- */
  function fcOf(c) {
    if (c.ev && c.ev.story && c.ev.story.outlook && c.ev.story.outlook.status !== 'available') return null;   // sin ventas en el periodo en curso, serie corta…: no se proyecta
    const f = c.fc, o = c.ev && c.ev.story && c.ev.story.outlook && c.ev.story.outlook.status === 'available' ? c.ev.story.outlook : null;
    if (f && f.periods && f.periods.length) {
      const bt = f.backtest || {};
      return { periods: f.periods, level: f.confidence, mape: bt.mape, tested: bt.periodsTested, change: f.changeToHorizon, lastValue: f.lastValue, lastPeriod: f.lastPeriod, reading: f.directionReading || '', entity: f.entity };
    }
    if (o) return { periods: o.projection, level: o.confidence && o.confidence.level, mape: o.confidence && o.confidence.mape, tested: o.confidence && o.confidence.tests, change: o.fitChange, lastValue: o.last, lastPeriod: o.lastPeriod, reading: o.direction === 'up' ? '↑' : o.direction === 'down' ? '↓' : '', entity: c.key };
    return null;
  }
  const CONF = { high: ['alta', 3], medium: ['media', 2], low: ['baja', 1] };
  const confOf = (lv) => CONF[lv] || ['—', 0];
  const confTitle = (f) => (fin(f.mape) ? `En ${f.tested} pruebas hacia atrás esta regla se desvió ${(f.mape * 100).toFixed(1)} % en promedio por mes.` : 'Sin pruebas hacia atrás suficientes.');

  /* ---------- Línea de confiabilidad y contexto ---------- */
  function trust(m) {
    const { state, r, a, ci } = m, out = [];
    const c = a.contribution;
    if (c && c.status === 'available') {
      const sum = [...c.positive, ...c.negative].reduce((s, x) => s + (fin(x.delta) ? x.delta : 0), 0), ok = Math.abs(sum - c.totalDelta) <= Math.max(1, Math.abs(c.totalDelta) * 1e-6);
      out.push({ k: ok ? 'ok' : 'warn', t: ok ? '✓ Cuadra con el total' : '⚠ No cuadra con el total', tip: ok ? `Σ de las contribuciones de ${lw(r.level)[1] === 'SKU' ? 'los SKU' : 'las ' + lw(r.level)[1]} = variación total (${m2(c.totalDelta)}). Nada se perdió ni se contó doble.` : `La suma de las contribuciones (${m2(sum)}) no es igual a la variación total (${m2(c.totalDelta)}). Revisa la conciliación antes de decidir.` });
    }
    const cov = tc(m, 'trackingCoverage');
    if (fin(cov)) { const min = 1 - FP.config.products.signals.trackingGapPct, ok = cov >= min; out.push({ k: ok ? 'ok' : 'warn', t: `● Tracking ${Math.round(cov * 100)} %`, tip: `Compras de GA4 ÷ unidades reales. Se avisa si baja de ${Math.round(min * 100)} %: puede haber pérdida de medición.` }); }
    if (ci.partial) {
      const days = r.total.current.days || 0;
      out.push({ k: 'mu', t: `◐ Periodo parcial · ${days} días`, tip: String(ci.note || 'El periodo sigue en curso: se compara contra los mismos días de la referencia, no contra el periodo completo.').replace(/\.?\s*$/, '.') });
    }
    const s = state.pa.seasonal;
    if (s && s.loading) out.push({ k: 'mu', t: '◌ Calculando la época…', tip: 'Se compara este periodo con el mismo del año anterior.' });
    else if (s && fin(s.change) && fin(s.lastChange)) {
      const d = (s.change - s.lastChange) * 100, word = d < -2 ? 'Peor que la época' : d > 2 ? 'Mejor que la época' : 'Normal para la época';
      out.push({ k: d < -2 ? 'warn' : 'ok', t: `● ${word}`, tip: `Este periodo contra su comparación: ${pcs(s.change)}; hace un año: ${pcs(s.lastChange)} (${sgn(d, 1)} pp). Un solo año de referencia: no es un índice estacional.` });
    } else if (s) out.push({ k: 'mu', t: '○ Sin referencia del año anterior', tip: 'Para saber si esto es normal en esta época hacen falta los mismos periodos del año pasado en los datos de productos.' });
    if (a.rows && a.rows.length) {
      const an = a.rows.filter((x) => x.anomaly);
      out.push(an.length ? { k: 'warn', t: `⚠ ${an.length} ${an.length === 1 ? 'movimiento inusual' : 'movimientos inusuales'}`, tip: `${an.slice(0, 3).map((x) => `${nameOf(m, x.entity)} (${x.anomaly.direction === 'decrease' ? 'caída' : x.anomaly.direction === 'increase' ? 'subida' : 'inusual'})`).join(' · ')}${an.length > 3 ? ` y ${an.length - 3} más` : ''}.` }
        : { k: 'ok', t: '● Sin movimientos inusuales', tip: `Ninguna ${lw(r.level)[0]} sale de su rango habitual (anomalía z ≥ 2.5).` });
    }
    return out;
  }
  function tc(m, k) { const x = m.tc[k]; return x && fin(x.value) ? x.value : null; }

  /* ---------- Veredicto ---------- */
  function verdict(m) {
    const { r, ci, net, netPct, cats } = m, c = m.a.contribution, one = lw(r.level);
    let h;
    if (!fin(netPct) || Math.abs(netPct) < 0.0005) h = `La venta se mantiene igual que ${refName(ci)}.`;
    else {
      const top = cats.slice().sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
      const dom = c && c.status === 'available' && top && fin(top.contrib) && top.d * net > 0 ? Math.abs(top.contrib) : 0;
      const tail = top && cats.length > 1 && dom >= 0.5 ? `${dom >= 0.8 ? ', casi toda' : ', sobre todo'} por ${nameOf(m, top.key)}` : '';
      h = `La venta va ${(Math.abs(netPct) * 100).toFixed(1)} % ${net < 0 ? 'abajo' : 'arriba'} de ${refName(ci)}${tail}.`;
    }
    const kpi = (label, val, delta, neg, tp, tot) => `<div class="kpi"${tot ? ' data-total="1" role="button" tabindex="0" title="Ver el detalle del total" style="cursor:pointer"' : ''}><div class="kpi__l">${label}${tp ? tip(tp) : ''}</div><div class="kpi__v num">${val}</div>${delta === null ? '<div class="kpi__d mu">—</div>' : `<div class="kpi__d ${neg ? 'dn' : 'up'}"><span aria-hidden="true">${neg ? '▼' : '▲'}</span> ${delta}</div>`}</div>`;
    const rel = (k) => { const c0 = m.tc[k], b0 = m.tb[k]; return c0 && b0 && fin(c0.value) && fin(b0.value) && b0.value !== 0 ? c0.value / b0.value - 1 : null; };
    const pct = (v) => (v === null ? null : `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(1)} %`);
    const fo = funnelOf(m, null), cr = fo && fin(fo.cmp.cr.cur) ? { value: fo.cmp.cr.cur } : null, crd = fo && fin(fo.cmp.cr.deltaPp) ? fo.cmp.cr.deltaPp : null;
    const aov = m.tc.aov;
    const kpis = [
      kpi('Venta', M(m.tc.revenue.value), pct(netPct), net < 0, 'Venta total del periodo contra el mismo tramo de la referencia.', true),
      m.tc.orders && fin(m.tc.orders.value) ? kpi('Pedidos', num0(m.tc.orders.value), pct(rel('orders')), (rel('orders') || 0) < 0) : '',
      aov && fin(aov.value) ? kpi('Ticket promedio', F().currency(aov.value, 0), pct(rel('aov')), (rel('aov') || 0) < 0, 'Venta ÷ pedidos. Se calcula, no viene en el archivo.') : '',
      cr && fin(cr.value) ? kpi('Conversión de ficha', `${(cr.value * 100).toFixed(2)} %`, crd === null ? null : `${crd < 0 ? '−' : '+'}${Math.abs(crd).toFixed(2)} pp`, (crd || 0) < 0, 'Compras de GA4 ÷ vistas de ficha. Las vistas no son sesiones.') : ''
    ].join('');
    const tr = trust(m).map((t) => `<span class="tchip ${t.k}" tabindex="0" data-tip="${esc(t.tip)}">${esc(t.t)}</span>`).join('');
    return `<section class="verdict"><p class="eyebrow">Producto y evolución · ${esc(ci.text || `${r.period.from} a ${r.period.to}`)}${MK !== 'revenue' ? ` · ${esc((ML[MK] || [MK])[0])}` : ''}</p><h2>${esc(h)}</h2>${tr ? `<div class="trust" aria-label="Confiabilidad y contexto">${tr}</div>` : ''}<div class="kpis">${kpis}</div>${goal(m)}</section>`;
  }

  /* ---------- Meta ---------- */
  function goal(m) {
    const b = m.a.bridge;
    if (!b || !(b.status === 'available' || b.status === 'partial') || !fin(b.plan) || !fin(b.actual)) return '';
    const mxv = Math.max(b.plan, b.actual) || 1, over = b.gap >= 0;
    return `<div class="goal"><div class="goal__t"><b>Contra la meta</b><span class="${over ? 'up' : 'dn'}">${over ? '▲ superada' : '▼ por debajo'} por ${M(Math.abs(b.gap))} (${pcs(b.gapPct)})</span></div><div class="goal__bar" role="img" aria-label="Real ${M(b.actual)} contra meta ${M(b.plan)}"><i class="goal__real" style="width:${(b.actual / mxv * 100).toFixed(1)}%"></i><i class="goal__meta" style="left:${(b.plan / mxv * 100).toFixed(1)}%" title="Meta ${M(b.plan)}"></i></div><div class="goal__l"><span>Meta ${M(b.plan)}</span><span>Real ${M(b.actual)}</span></div></div>`;
  }
  function metaBlock(m) {
    const b = m.a.bridge;
    let body;
    if (!b || !(b.status === 'available' || b.status === 'partial')) body = `<p class="cap">${esc(b && b.message ? b.message : b && b.status === 'not_applicable' ? 'La meta existe por canal, no por categoría o producto: con esta selección esta parte no aplica.' : 'Todavía no hay meta que comparar con esta selección.')}</p>`;
    else {
      const it = b.outlookVsPlan && b.outlookVsPlan.items && b.outlookVsPlan.items[0];
      const proj = it && fin(it.projected) && fin(it.plan) && it.plan ? `<p class="cap" style="margin-top:-4px"><b>Si la tendencia sigue,</b> ${isMonth(it.period) ? MESF[+it.period.slice(5) - 1] : esc(it.period)} cierra en <b>${M(it.projected)}</b> contra una meta de <b>${M(it.plan)}</b> (<span class="${it.projected >= it.plan ? 'up' : 'dn'}">${pcs(it.projected / it.plan - 1)}</span>).</p>` : '';
      const chans = (b.channels || []).filter((c) => fin(c.plan) && fin(c.actual)), mxv = Math.max(1, ...chans.map((c) => Math.max(c.actual, c.plan)));
      const lbl = (c) => (FP.analysisContext ? FP.analysisContext.channelLabel(c) : c);
      const its = (b.outlookVsPlan && b.outlookVsPlan.items) || [];
      const projT = its.length > 1 ? `<div class="tw"><table class="dtab" aria-label="Proyección contra meta"><thead><tr><th>Mes</th><th>Proyección del total</th><th>Meta</th><th>Contra la meta</th></tr></thead><tbody>${its.map((q) => `<tr><td>${esc(ymc(q.period))}</td><td class="num" title="Rango ${M(q.low)} a ${M(q.high)}">${M(q.projected)}</td><td class="num">${M(q.plan)}</td><td class="num ${q.pct < 0 ? 'dn' : 'up'}">${pcs(q.pct)}</td></tr>`).join('')}</tbody></table></div><p class="cap">Extiende la tendencia reciente del total; no es un pronóstico ni considera temporada, promociones o inventario. Solo se muestran meses con meta completa; por producto no hay meta.</p>` : '';
      body = proj + projT + (chans.length ? `<div class="mts">${chans.map((c) => `<div class="mt"><span class="mt__n">${esc(lbl(c.channel))}</span><div class="mt__bar"><i style="left:${(c.plan / mxv * 100).toFixed(1)}%" class="mt__meta" title="Meta ${M(c.plan)}"></i><i style="width:${(c.actual / mxv * 100).toFixed(1)}%" class="mt__real" title="Real ${M(c.actual)}"></i></div><span class="num mt__v">${M(c.actual)} <small>de ${M(c.plan)}</small></span></div>`).join('')}</div>` : '');
    }
    return `<section class="blk" id="b-meta"><div class="blk__h"><h3>¿Y contra la meta?</h3><span class="cap">Real contra meta por canal en el periodo.</span></div>${body}</section>`;
  }

  /* ---------- Funnel de la selección y de cada fila ---------- */
  const FE = () => FP.funnelEngine;
  function funnelOf(m, row) {
    const r = m.r, E = FE();
    if (!E || !(r.mappedMetrics && r.mappedMetrics.funnel || []).includes('views')) return null;
    const cur = E.pick(row ? row.current : r.total.current), base = E.pick(row ? row.baseline : r.total.baseline);
    return cur && base ? { cur, base, cmp: E.compare(cur, base) } : null;
  }
  /** Una categoría con más visitas y un paso del embudo que cae: la que pide revisar. */
  function funnelWarn(m) {
    let best = null;
    m.cats.forEach((c) => {
      const f = funnelOf(m, c.x); if (!f) return;
      const rd = FE().reading(f.cmp); if (!rd || rd.kind !== 'views_up_cr_down' || !rd.weak) return;
      if (!best || rd.weak.deltaPp < best.weak.deltaPp) best = { c, rd, weak: rd.weak, f };
    });
    return best;
  }
  const STEP = { 'Vista → carrito': ['carritos', 'de la ficha al carrito'], 'Carrito → checkout': ['pagos iniciados', 'del carrito al pago'], 'Checkout → compra': ['compras', 'del pago a la compra'] };

  /* ---------- Lo que pide atención ---------- */
  function attention(m) {
    const { cats, net, a } = m, cards = [];
    const card = (k, chip, title, text, btn, key) => `<article class="at at--${k}"><span class="chip ${k}">${chip}</span><h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn" data-k="${esc(key)}">${esc(btn)}</button></article>`;
    const drag = cats.find((c) => c.d * net > 0) || cats[0];
    if (drag) {
      const pv = drag.pv, c = drag.contrib, down = drag.d < 0;
      let why = '';
      if (pv && fin(pv.volume) && fin(pv.price) && fin(pv.mix)) {
        const f = [['mezcla', pv.mix], ['precio', pv.price], ['volumen', pv.volume]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
        const lead = f[0][0] === 'mezcla' ? (pv.mix < 0 ? `Pesa menos lo caro dentro de ${lw(m.level)[2]}` : `Pesa más lo caro dentro de ${lw(m.level)[2]}`) : f[0][0] === 'precio' ? (pv.price < 0 ? 'Bajó el precio promedio' : 'Subió el precio promedio') : (pv.volume < 0 ? 'Se vendieron menos unidades' : 'Se vendieron más unidades');
        why = ` ${lead}: ${f[0][0]} ${M(f[0][1], true)}, ${f[1][0]} ${M(f[1][1], true)}.`;
      }
      const share = fin(c) ? `Explica ${(Math.abs(c) * 100).toFixed(1)}% de la ${net < 0 ? 'caída' : 'alza'} neta.` : '';
      cards.push(card(down ? 'bad' : 'ok', down ? 'Cae' : 'Sube', `${nameOf(m, drag.key)}: ${M(drag.d, true)} (${pcs(drag.p / 100)})`.replace('+$', '+$'), `${share}${why}`.trim(), 'Ver ficha', drag.key));
    }
    const w = funnelWarn(m);
    if (w) {
      const st = STEP[w.weak.label] || ['pasos', 'del paso débil'], pctv = (v) => `${(v * 100).toFixed(1)} %`, sp = w.f.cmp.steps[w.weak.index];
      cards.push(card('warn', 'Revisar', `${nameOf(m, w.c.key)}: más visitas, menos ${st[0]}`, `Vistas ${F().signedPercent(w.rd.views, 1)}, pero ${st[1]} pasa de ${pctv(sp.rateBase)} a ${pctv(sp.rateCur)} (${sgn(w.weak.deltaPp, 1)} pp).`, 'Ver el embudo', w.c.key));
    }
    const comp = cats.filter((c) => c.d * net < 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    if (comp.length) {
      const c = comp[0], vw = c.x.drivers && c.x.drivers.views, cv = a.contribution && a.contribution.status === 'available' ? a.contribution : null;
      const covered = m.r.compensation && fin(m.r.compensation.coveredPct) ? m.r.compensation.coveredPct : null;
      const only = comp.length === 1 ? `Es la única ${lw(m.level)[0]} que ${c.d > 0 ? 'sube' : 'baja'}` : `Es la que más ${c.d > 0 ? 'sube' : 'baja'} de ${comp.length}`;
      const views = vw && fin(vw.deltaPct) ? `, con las vistas ${F().signedPercent(vw.deltaPct, 1)}` : '';
      const part = covered !== null ? ` Compensa ${Math.round(covered * 100)} % de la ${net < 0 ? 'caída' : 'alza'}.` : (fin(c.contrib) && cv ? ` Compensa ${Math.round(Math.abs(c.contrib) * 100)} % de la ${net < 0 ? 'caída' : 'alza'}.` : '');
      cards.push(card(c.d > 0 ? 'ok' : 'bad', c.d > 0 ? 'Sube' : 'Cae', `${nameOf(m, c.key)} compensa: ${M(c.d, true)} (${pcs(c.p / 100)})`, `${only}${views}.${part}`, 'Ver oportunidades', c.key));
    }
    if (!cards.length) return '';
    return `<section class="attn"><h3 class="h">Lo que pide atención</h3><div class="attn__g">${cards.join('')}</div></section>`;
  }

  /* ---------- ¿Quién mueve la venta? ---------- */
  const lugar = (c) => (c.dpp > 0.3 ? ['Gana lugar', 'ok'] : c.dpp < -0.3 ? ['Pierde lugar', 'bad'] : ['Igual', 'mu']);
  function whoRow(m, c, i, ref) {
    const neg = c.d < 0, [lg, lk] = lugar(c), arrow = Math.abs(c.dpp) >= 0.05 ? (c.dpp > 0 ? '▲' : '▼') : '';
    const cv = c.contrib, ct = fin(cv) ? `${Math.round(Math.abs(cv) * 100)} %` : DASH, cw = fin(cv) ? (cv >= 0 ? 'explica' : 'compensa') : '';
    const nm = nameOf(m, c.key);
    return `<tr class="${i >= 5 ? 'x' : ''}" tabindex="0" data-k="${esc(c.key)}" title="${esc(nm)}: ${M(c.d, true)} (${c.p >= 0 ? '+' : '-'}${Math.abs(c.p).toFixed(1)} %) contra ${esc(ref)}. Clic para ver la ficha."><td class="nm">${esc(nm)}</td><td class="bar"><div class="axis"><i class="b b--${neg ? 'neg' : 'pos'}" style="width:${(Math.abs(c.d) / m.mx * 50).toFixed(1)}%;${neg ? 'right' : 'left'}:50%"></i></div></td><td class="num ${neg ? 'dn' : 'up'}">${neg ? '▼' : '▲'} ${M(c.d, true)}</td><td class="num mu">${c.p > 0 ? '+' : '−'}${Math.abs(c.p).toFixed(1)} %</td><td class="num">${ct} <span class="mu sub">${cw}</span></td><td class="num">${(c.share * 100).toFixed(1)}% <span class="mu sub">${arrow}${Math.abs(c.dpp).toFixed(1)} pp</span></td><td><span class="chip ${lk}">${lg}</span></td></tr>`;
  }
  function who(m, open) {
    const ev0 = m.evo, mat = (c) => { const r = ev0.get(c.key); return !r || FP.trendView.isMaterial(m.a, r); };
    const hidC = Number(m.a.minSharePct) > 0 ? m.cats.filter((c) => !mat(c)) : [];
    const all = m.cats; m = Object.assign({}, m, { cats: hidC.length ? all.filter(mat) : all });
    const matNote = hidC.length ? `<p class="cap contribution-mat" data-hidden="${hidC.length}">Materialidad ${esc(String(m.a.minSharePct))} %: ${hidC.length} ${hidC.length === 1 ? lw(m.level)[0] + ' más chica no se lista' : lw(m.level)[1] + ' más chicas no se listan'} (suman ${M(hidC.reduce((t, c) => t + c.d, 0), true)} del cambio neto). El cambio neto y la concentración incluyen todas.</p>` : '';
    const ref = refName(m.ci), n = m.cats.length, one = lw(m.level), nm = m.level === 'sku' ? 'SKU' : cap1(one[0]);
    const body = m.cats.length ? `<div class="tw${open ? ' open' : ''}" id="tw-quien"><table class="div"><thead><tr><th>${esc(nm)}</th><th class="mid">← baja · sube →</th><th>Cambio ${tip('Diferencia de venta contra el periodo de referencia.')}</th><th></th><th>Contribución ${tip('Cuánto del cambio neto explica esta fila. Si compensa, sube cuando el total baja.')}</th><th>Participación ${tip('Qué parte de la venta total es de esta fila, y cuánto cambió su parte.')}</th><th>Lugar ${tip('Gana lugar si su parte de la venta total sube; pierde lugar si baja.')}</th></tr></thead><tbody>${m.cats.map((c, i) => whoRow(m, c, i, ref)).join('')}</tbody></table>${n > 5 ? `<div class="tf"><span class="mu">${open ? `${n} de ${n}` : `5 de ${n}`}</span><button class="lk fold" data-fold="quien" data-n="${n}">${open ? 'Ver solo 5' : `Ver las ${n}`}</button></div>` : ''}</div>` : '<p class="cap">No hay filas con cambio para esta selección.</p>';
    return `<section class="blk" id="b-quien"><div class="blk__h"><h3>¿Quién mueve la venta?</h3><span class="cap">Cuánto cambió ${one[2]} contra ${esc(ref)} y si gana o pierde lugar.</span></div>${body}${matNote}</section>`;
  }

  /* ---------- ¿Desde cuándo y hacia dónde? ---------- */
  function spark(ser) {
    const v = (ser || []).map((x) => x.value).filter((x) => fin(x));
    if (v.length < 2) return '';
    const w = 120, h = 34, lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo;
    const pts = v.map((x, i) => [4 + i / (v.length - 1) * (w - 8), sp ? 4 + (1 - (x - lo) / sp) * (h - 8) : h / 2]);
    const [lx, ly] = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" class="sp" aria-hidden="true"><polyline points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.2" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></svg>`;
  }
  const UNIT = { mes: ['mes', 'meses'], semana: ['semana', 'semanas'], 'día': ['día', 'días'], 'año': ['año', 'años'] };
  const unitOf = (ev) => (ev && ev.story && ev.story.outlook && ev.story.outlook.unit) || 'mes';
  function persist(ev) {
    const st = ev && ev.story; if (!st || st.status !== 'available' || !(st.episodes || []).length) return '';
    const e = st.episodes[st.episodes.length - 1], verb = { stable: 'Estable', growth: 'Crece', decline: 'Cae' }[e.type] || 'Sin ventas', u = UNIT[unitOf(ev)] || UNIT.mes;
    return `${verb} hace ${e.periods} ${e.periods === 1 ? u[0] : u[1]} (desde ${ym(e.from)})`;
  }
  const PATL = { growth_sustained: ['Crecimiento sostenido', 'ok'], decline_sustained: ['Deterioro sostenido', 'bad'], volatile: ['Volátil', 'warn'], stable: ['Estable', 'mu'] };
  function smallCard(m, c) {
    const ev = c.ev; if (!ev) return '';
    const st = ev.story && ev.story.status === 'available' ? ev.story : null, cur = (st && st.current) || {}, pat = PATL[ev.pattern] || [FP.trendView.patternLabel(ev.pattern), 'mu'];
    const chg = fin(cur.change) ? cur.change : (fin(ev.percentageChange) ? ev.percentageChange : 0), up = chg >= 0, ps = persist(ev), f = fcOf(c), p0 = f && f.periods[0];
    const [cw, cd] = f ? confOf(f.level) : ['—', 0];
    const prj = p0 && fin(p0.value) ? `<span class="sm__p">Cierre ${esc(monthOf(p0.period))} ≈ <b class="num">${e1(p0.value)}</b> <span class="conf" title="Confianza ${cw}: ${esc(confTitle(f).replace(/^En /, 'en ').replace(/ esta regla se desvió/, ' se desvió').replace(/ por mes\.$/, ' en promedio.'))}">${'●'.repeat(cd)}${'○'.repeat(3 - cd)} ${cw}</span></span>` : '';
    const nm = nameOf(m, c.key);
    return `<button class="sm" data-k="${esc(c.key)}" title="${esc(nm)}. Clic para ver la ficha."><span class="sm__n">${esc(nm)}</span>${spark(ev.series)}<span class="sm__f"><span class="chip ${pat[1]}">${esc(pat[0])}</span><span class="num ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(chg * 100).toFixed(1)} %</span></span><span class="sm__s mu" title="${esc(ps)}">${esc(ps.split(' (')[0])}</span>${prj}</button>`;
  }
  const state0 = (m) => ({ evoLevel: m.state.pa.evoLevel });
  /** Una tarjeta por fila de evolución (su nivel puede no ser el de la tabla), las que más se mueven primero. */
  function evoCards(m) {
    const byKey = new Map(m.cats.map((c) => [c.key, c]));
    return (m.a.rows || []).map((ev) => { const k = String(ev.entity), c = byKey.get(k) || rowFor(m, k) || { key: k, d: ev.recentAbsoluteChange || 0, p: 0, share: 0, dpp: 0, contrib: NaN, x: null, ev, fc: m.fcm.get(k) || null, pv: null, ex: m.exf(k) };
      return Object.assign({}, c, { ev, vis: m.shown.has(k) }); }).sort((x, y) => Math.abs(y.d || 0) - Math.abs(x.d || 0));
  }
  const CARDS_MAX = 12;
  function since(m, noHist) {
    const one = lw(m.a.level === 'channel' ? 'channel' : (state0(m).evoLevel || m.level)), all = evoCards(m), cards = all.filter((c) => c.vis), shown = cards.slice(0, CARDS_MAX), hid = all.length - cards.length, hidMat = (m.a.rows || []).filter((r) => !FP.trendView.isMaterial(m.a, r)).length;
    let body;
    if (m.a.loading && !(m.a.rows || []).length) { const pr = m.a.progress || { frac: 0, label: 'Preparando', startedAt: Date.now() }; body = raw(FP.ui.loader.html({ id: 'an-loader', title: 'Construyendo evolución histórica…', label: pr.label, pct: Math.min(99, Math.round(pr.frac * 100)), t0: pr.startedAt, hint: 'Se agregan los períodos desde los datos guardados en este navegador. Puedes esperar aquí: no es un error.' })); }
    else if (m.a.error) body = `<p class="cap">No se pudo calcular la evolución: ${esc(m.a.error)}</p>`;
    else if (!all.length) body = noHist || '<p class="cap">Sin historia suficiente para esta selección.</p>';
    else if (!cards.length) body = `<p class="cap">Los filtros ocultan las ${all.length} ${one[1]} con historia. Quita un filtro en «Filtros».</p>`;
    else body = `<div class="sm__g">${shown.map((c) => smallCard(m, c)).join('')}</div>${cards.length > shown.length ? `<p class="cap">${shown.length} de ${cards.length} ${one[1]}, las que más se mueven.</p>` : ''}${hid || hidMat ? `<p class="cap trend-count">${cards.length} de ${all.length} ${one[1]}${hidMat ? ` · ${hidMat} ocultas por materialidad (menos de ${m.a.minSharePct} % del total)` : ''}${hid - hidMat > 0 ? ` · ${hid - hidMat} por los demás filtros` : ''}</p>` : ''}`;
    return `<section class="blk" id="b-cuando"><div class="blk__h"><h3>¿Desde cuándo y hacia dónde?</h3><span class="cap">Venta mensual de los últimos 12 meses, desde cuándo lleva así y cómo cerraría el mes.</span></div>${body}</section>`;
  }

  /* ---------- ¿Por qué se mueve? ---------- */
  const heat = (pp) => (pp <= -1 ? 'h-bad' : pp <= -0.3 ? 'h-warn' : pp >= 0.3 ? 'h-ok' : '');
  function funnelBlock(m, focusKey) {
    const row = focusKey !== null && focusKey !== undefined ? m.r.rows.find((x) => String(x.key) === String(focusKey)) : null;
    const f = funnelOf(m, row);
    if (!f) return `<div><h4>Embudo de la ficha a la compra</h4><p class="cap">${esc((m.r.mappedMetrics && m.r.mappedMetrics.funnel || []).includes('views') ? 'Con esta selección no hay embudo de ficha: WhatsApp, Llamadas, estado, sucursal y tipo de entrega ocurren después de la ficha.' : 'Todavía no hay datos de funnel: carga el archivo de GA4 en Carga de datos.')}</p></div>`;
    const ref = refShort(m.ci), max = Math.max(f.cur.views, f.base ? f.base.views : 0) || 1;
    const pc1 = (v) => (fin(v) ? `${(v * 100).toFixed(1)} %` : DASH), pp1 = (v) => (!fin(v) ? DASH : `${Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`.replace('+', '+'));
    const steps = f.cmp.steps.map((s) => {
      const sub = s.transition ? `${pc1(s.rateCur)}${s.rateBase !== null ? ` vs ${pc1(s.rateBase)} · ${pp1(s.deltaPp)}` : ''}` : (s.deltaPct === null ? '' : `${F().signedPercent(s.deltaPct, 1)} vs ${ref}`);
      return `<div class="fn"><span class="fn__l">${esc(s.label)}</span><div class="fn__t"><i style="width:${Math.max(2, s.cur / max * 100).toFixed(1)}%"></i></div><span class="num fn__v">${num0(s.cur)}</span><span class="mu fn__s">${esc(sub)}</span></div>`;
    }).join('');
    return `<div><h4>Embudo de la ficha a la compra${row ? ` · ${esc(nameOf(m, row.key))}` : ''} ${tip('Cada barra es cuánta gente llega a ese paso. Debajo, el cambio contra la referencia.')}</h4>${steps}</div>`;
  }
  function factorBlock(m, c) {
    let pv = c && c.pv, who = c ? ` a ${esc(nameOf(m, c.key))}` : '';
    const pt = m.a.pvm && m.a.pvm.total && fin(m.a.pvm.total.volume) ? m.a.pvm.total : null;
    if (!pv && pt) { pv = pt; who = ' el cambio de la selección'; }
    if (!pv || !fin(pv.volume) || !fin(pv.price) || !fin(pv.mix)) return `<div><h4>Qué factor explica el cambio ${tip('Volumen: cuántas unidades. Precio: a cuánto. Mezcla: qué productos se vendieron.')}</h4><p class="cap">${esc(m.a.pvm && m.a.pvm.message ? m.a.pvm.message : 'No se puede separar volumen, precio y mezcla con esta selección: faltan unidades válidas.')}</p></div>`;
    const mxp = Math.max(Math.abs(pv.volume), Math.abs(pv.price), Math.abs(pv.mix), 1);
    const bar = (l, v) => `<div class="pv"><span class="pv__l">${l}</span><div class="axis"><i class="b b--${v < 0 ? 'neg' : 'pos'}" style="width:${(Math.abs(v) / mxp * 50).toFixed(1)}%;${v < 0 ? 'right' : 'left'}:50%"></i></div><span class="num ${v < 0 ? 'dn' : 'up'} pv__v">${M(v, true)}</span></div>`;
    const f = [['la mezcla', pv.mix], ['el precio', pv.price], ['el volumen', pv.volume]].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    return `<div><h4>Qué factor explica${who} ${tip('Volumen: cuántas unidades. Precio: a cuánto. Mezcla: qué productos se vendieron.')}</h4>${bar('Volumen', pv.volume)}${bar('Precio', pv.price)}${bar('Mezcla', pv.mix)}<p class="cap" style="margin-top:6px">Suman ${M(pv.delta, true)}: ${f[0][0]} pesa más que ${f[1][0]}.${m.level === 'category' ? ' A nivel categoría el precio incluye cambios internos de mezcla.' : ''}</p></div>`;
  }
  function heatTable(m) {
    const rows = m.cats.slice(0, 5).map((c) => {
      const x = c.x, d = x.drivers || {}, vw = d.views;
      if (!vw || !fin(vw.deltaPct)) return null;
      const cell = (k) => {
        const cu = x.current && x.current[k], ba = x.baseline && x.baseline[k];
        if (!cu || !ba || !fin(cu.value) || !fin(ba.value)) return `<td class="num hc"><b>${DASH}</b><span></span></td>`;
        const pp = (cu.value - ba.value) * 100;
        return `<td class="num hc ${heat(pp)}"><b>${(cu.value * 100).toFixed(1)} %</b><span>${pp > 0 ? '▲' : pp < 0 ? '▼' : ''}${Math.abs(pp).toFixed(1)} pp</span></td>`;
      };
      return `<tr tabindex="0" data-k="${esc(c.key)}"><td class="nm">${esc(nameOf(m, c.key))}</td><td class="num ${vw.deltaPct < 0 ? 'dn' : 'up'}">${F().signedPercent(vw.deltaPct, 1)}</td>${cell('cartRate')}${cell('checkoutRate')}${cell('purchaseRate')}</tr>`;
    }).filter(Boolean);
    if (!rows.length) return '';
    const ref = refName(m.ci);
    return `<div class="tw" style="margin-top:12px"><table class="heat"><thead><tr><th>${esc(cap1(lw(m.level)[0]))}</th><th>Vistas ${tip('Cambio en vistas de ficha contra la referencia.')}</th><th>Ficha → carrito</th><th>Carrito → pago</th><th>Pago → compra</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="cap">Color: puntos porcentuales contra ${esc(ref)}. Rojo cae 1 pp o más, ámbar cae 0.3 pp o más.</p>`;
  }
  function why(m, focusKey) {
    const top = m.cats.find((c) => c.d * m.net > 0) || m.cats[0];
    const fk = focusKey !== null && focusKey !== undefined ? m.cats.find((c) => c.key === String(focusKey)) : null;
    return `<section class="blk" id="b-porque"><div class="blk__h"><h3>¿Por qué se mueve?</h3><span class="cap">Dónde se pierde la conversión y qué factor explica el cambio.</span></div><div class="two">${funnelBlock(m, focusKey)}${factorBlock(m, fk || top)}</div>${heatTable(m)}</section>`;
  }

  /* ---------- Método y definiciones (cerrado, hasta el final) ---------- */
  const DEFS = [['Fase', 'Tramo de la venta mensual que sube, baja o se mantiene. Cambia de fase cuando el movimiento contrario supera 10 %.'], ['Estabilidad', 'Estable: la venta varía 5 % o menos por mes. Volátil: más de 15 %.'], ['Ahora', 'Compara el periodo en curso con los mismos días del anterior. «En línea» si queda dentro de 10 %.'], ['Proyección y confianza', 'Extiende la tendencia reciente tres periodos. La confianza dice cuánto se desvió esa regla en pruebas hacia atrás: alta hasta 10 %, media hasta 20 %.'], ['Contribución, participación y lugar', 'Contribución: parte del cambio neto que explica. Participación: parte de la venta total. Lugar: si esa parte sube o baja.'], ['Conversión y ticket', 'Conversión: compras de GA4 ÷ vistas de ficha (las vistas no son sesiones). Ticket: venta ÷ pedidos.'], ['Clientes', 'Nuevo: primer pedido en el histórico. Recurrente: vuelve en 180 días o menos. Recuperado (reactivado): vuelve después de 180 días. No regresaron: compraron el mes anterior y no este (descriptivo; en un mes en curso puede subir al cerrar).']];
  function fcRow(m, c) {
    const f = fcOf(c); if (!f) return '';
    const p0 = f.periods[0], dr = f.reading || '', dir = dr.includes('↑') ? ['▲ Sube', 'up'] : dr.includes('↓') ? ['▼ Cae', 'dn'] : /Volátil/.test(dr) ? ['◆ Sin dirección', 'mu'] : ['■ Estable', 'mu'];
    const ch = f.change, [cw, cd] = confOf(f.level);
    return `<tr><td class="nm">${esc(nameOf(m, c.key))}</td><td class="${dir[1]}">${dir[0]}</td><td class="num">${e1(f.lastValue)}</td><td class="num" title="Rango ${e1(p0.low)} a ${e1(p0.high)}">${e1(p0.value)}</td><td class="num ${ch > 0.005 ? 'up' : ch < -0.005 ? 'dn' : 'mu'}">${ch > 0 ? '+' : '−'}${Math.abs(ch * 100).toFixed(1)} %</td><td><span class="conf" title="${esc(confTitle(f))}">${'●'.repeat(cd)}${'○'.repeat(3 - cd)} ${cw}</span></td></tr>`;
  }
  function method(m, ux) {
    const withFc = evoCards(m).filter((c) => fcOf(c)).sort((x, y) => (fcOf(y).lastValue || 0) - (fcOf(x).lastValue || 0));
    const first = withFc[0] && fcOf(withFc[0]), p0 = first && first.periods[0], pl = first && first.periods[first.periods.length - 1];
    const fcSec = withFc.length ? `<section class="dsec" id="m-fc"><h4>Forecast por ${esc(lw(m.state.pa.evoLevel || m.level)[0])}</h4><p class="cap">Extiende la tendencia reciente tres periodos. No es un pronóstico: no considera temporada, promociones, inventario ni cambios de precio.</p><div class="tw"><table class="dtab"><thead><tr><th>${esc(cap1(lw(m.level)[0]))}</th><th>Dirección</th><th>Último cerrado</th><th>Cierre ${esc(monthOf(p0 && p0.period))}</th><th>A ${esc(monthOf(pl && pl.period))}</th><th>Confianza</th></tr></thead><tbody>${withFc.map((c) => fcRow(m, c)).join('')}</tbody></table></div></section>` : '';
    const geo = (m.r.geoSignals || []), sig = (m.r.signals || []).slice(0, 30), geoOpen = Boolean(ux.geo);
    const dimL = { state: 'Estado', branch: 'Sucursal', region: 'Región', city: 'Ciudad' };
    const geoHtml = geo.length ? `<p class="tag">Dónde se concentra la variación</p><ul class="sgl${geoOpen ? ' open' : ''}" id="geo">${geo.map((g, i) => `<li class="${i >= 4 ? 'x' : ''}"><span class="chip mu">${esc(dimL[g.dimension] || 'Zona')}</span><span>${esc(String(g.label).replace(/-/g, '−'))}</span></li>`).join('')}</ul>${geo.length > 4 ? `<div class="tf"><span class="mu">${geoOpen ? 'todas' : `4 de ${geo.length}`}</span><button class="lk fold3" data-fold="geo" data-n="${geo.length}">${geoOpen ? 'Ver solo 4' : `Ver las ${geo.length}`}</button></div>` : ''}` : '';
    const sigHtml = sig.length ? `<p class="tag" style="margin-top:4px">Tráfico y conversión</p><ul class="sgl">${sig.map((g) => `<li><span class="chip warn">Patrón ${esc(g.pattern)}</span><span><b>${esc(nameOf(m, g.key))}:</b> ${esc(g.label)}. <span class="mu">${esc(String(g.evidence).replace(/-/g, '−'))}</span></span></li>`).join('')}</ul>` : '';
    const sgSec = `<section class="dsec" id="m-sg"><h4>Señales</h4><p class="cap">Describen dónde se concentra la variación y qué combinaciones de tráfico y conversión llaman la atención. No explican por qué: piden investigar.</p>${geoHtml}${sigHtml}${!geoHtml && !sigHtml ? '<p class="cap">Sin señales con los umbrales actuales.</p>' : ''}</section>`;
    const extraDefs = [];
    if (m.a.pvm && m.a.pvm.method) extraDefs.push(['Volumen, precio y mezcla', m.a.pvm.method]);
    if (m.a.bridge && m.a.bridge.assumption) extraDefs.push(['Meta por categoría', m.a.bridge.assumption]);
    const dfSec = `<section class="dsec" id="m-df"><h4>Definiciones</h4><dl class="defs">${DEFS.concat(extraDefs).map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl><p class="cap">Todo es descriptivo y trazable: la página muestra lo que dicen los números, no por qué pasó.</p></section>`;
    const meta = (FP.productStore && FP.productStore.meta) || {}, fmtD = (d) => { if (!d) return DASH; const [y, mo, da] = d.split('-'); return `${+da} ${MES[+mo - 1]} ${y}`; };
    const cov = tc(m, 'trackingCoverage'), sku = m.level === 'sku' && ux.focus !== null && ux.focus !== undefined ? String(ux.focus) : null;
    const dtSec = `<section class="dsec" id="m-dt"><h4>Datos</h4><dl class="fi"><div><dt>Archivos</dt><dd>${(m.r.mappedMetrics && m.r.mappedMetrics.funnel || []).length ? 'Venta y funnel por producto' : 'Venta por producto'}</dd></div><div><dt>Periodo cargado</dt><dd>${fmtD(meta.dateMin)} – ${fmtD(meta.dateMax)}</dd></div><div><dt>Cobertura de tracking</dt><dd>${fin(cov) ? `${Math.round(cov * 100)} % (compras GA4 ÷ unidades reales)` : DASH}</dd></div><div><dt>Referencia</dt><dd>${esc(m.r.baseline && m.r.baseline.label ? cap1(m.r.baseline.label) : DASH)}</dd></div></dl><div class="states">${sku ? `<button class="btn" data-action="pa-trace" data-key="${esc(sku)}">Trazabilidad al SKU</button>` : '<button class="btn" disabled title="La trazabilidad es del SKU: baja hasta ese nivel con Desglosar.">Trazabilidad al SKU</button>'}<button class="btn" data-action="pa-export">Exportar análisis (JSON)</button><button class="btn" data-action="an-export-contrib">Descargar CSV de la contribución</button></div></section>`;
    const ai = FP.trendView.assistant ? FP.trendView.assistant(m.a) : '';
    const aiSec = ai ? `<section class="dsec" id="m-ai"><h4>Preguntar sobre este análisis</h4>${raw(ai)}</section>` : '';
    return `<details class="meth" id="meth"${ux.meth ? ' open' : ''}><summary>Método y definiciones</summary><div class="meth__b">${fcSec}${sgSec}${dfSec}${dtSec}${aiSec}</div></details>`;
  }

  let PANEL = '';
  /** HTML de la app (cargadores, asistente) que no debe llevar el prefijo px-: se guarda aparte y se pega después de P(). */
  let RAW = [];
  const raw = (h) => { RAW.push(h); return `@@RAW${RAW.length - 1}@@`; };
  const PP = (h) => { const out = P(h).replace('@@PANEL@@', () => PANEL).replace(/@@RAW(\d+)@@/g, (m, i) => RAW[+i] || ''); RAW = []; return out; };

  /* ---------- Barra superior (los controles son los de la app; aquí solo se disponen como en la maqueta) ---------- */
  function topbar(state, mode, m) {
    const ef = FP.trendView.filters(state), parts = FP.productView.controlParts(state, { goto: true, groups: ef.groups, chips: ef.chips });
    const visit = state.pa.visit;
    let vp;
    if (!visit) vp = '<b>Sin historial todavía.</b><span>Se guarda al terminar de calcular esta selección.</span>';
    else if (visit.first) vp = '<b>Primera visita con esta selección.</b><span>Desde la próxima verás aquí qué cambió en cada categoría: patrón, estado y proyección.</span>';
    else if (!visit.items.length) vp = `<b>Sin cambios desde tu última visita.</b><span>Las filas siguen con la misma lectura (${esc(visit.at ? new Date(visit.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')}).</span>`;
    else vp = `<b>${visit.items.length} ${visit.items.length === 1 ? 'cambio' : 'cambios'} desde tu última visita.</b>${visit.items.slice(0, 4).map((i) => `<span><b>${esc(nameOf(m || { level: '' }, i.key))}</b>: ${esc(i.text)}.</span>`).join('')}${visit.items.length > 4 ? `<span>Y ${visit.items.length - 4} más.</span>` : ''}`;
    const n = parts.chipCount;
    PANEL = parts.panel;
    return `<div class="topbar"><div class="topbar__row">${parts.channel}${parts.period}${parts.compare}<button class="btn" data-action="fs-toggle" data-fs-page="pa" aria-expanded="${parts.open}" aria-controls="fs-pa">⚙ Filtros${n ? ` · ${n}` : ''}</button><div class="visit"><button class="btn" id="visitb" aria-expanded="false" aria-controls="visitp">↻ Desde tu última visita</button><div class="visit__p" id="visitp" hidden>${vp}</div></div><div class="seg" role="group" aria-label="Nivel de detalle"><button id="m-res" aria-pressed="${mode === 'res'}">Resumen</button><button id="m-full" aria-pressed="${mode !== 'res'}">Completo</button></div></div></div>@@PANEL@@`;
  }

  /* ---------- Página ---------- */
  function emptyState(html) { return `<div class="px"><div class="app" id="frame"><section class="blk">${html}</section></div></div>`; }
  function footer(m) {
    const meta = (FP.productStore && FP.productStore.meta) || {}, cov = tc(m, 'trackingCoverage');
    const f = (d) => { const [y, mo, da] = d.split('-'); return `${MES[+mo - 1]} ${+da} de ${y}`; };
    return `<section class="blk foot"><span class="mu">${(m.r.mappedMetrics && m.r.mappedMetrics.funnel || []).length ? 'Venta y funnel por producto' : 'Venta por producto'}${meta.dateMin && meta.dateMax ? ` · ${f(meta.dateMin)} a ${f(meta.dateMax)}` : ''}${fin(cov) ? ` · cobertura de tracking ${Math.round(cov * 100)} %` : ''}</span><span class="foot__a"><button class="lk" data-method="dt">Trazabilidad</button><button class="lk" data-action="pa-export">Exportar</button></span></section>`;
  }

  let LASTOPTS = {};
  function render(state, opts) {
    LASTOPTS = opts || {};
    const el = $('pe-body'); if (!el) return;
    const ux = (state.ux.px = state.ux.px || { mode: 'full', quien: false, geo: false, meth: false });
    ux.focus = state.peFocusKey;
    if (!FP.productStore || !FP.productStore.available() || !(FP.productStore.meta || {}).batches) {
      el.innerHTML = `<section class="panel"><div class="panel__body"><div class="empty"><strong>Todavía no hay datos de productos</strong>Carga el archivo de venta por producto (y, si quieres CR y embudo, el de funnel de GA4) en Carga de datos. <a class="btn btn--small btn--primary" href="#carga">Ir a Carga de datos</a></div>${FP.productView.statusHtml(state)}</div></section>`;
      mountDrawer(state, null);
      return;
    }
    if (FP.app) { FP.app.ensureFunnelSeries(); FP.app.ensureSeasonalContext(); FP.app.ensureVisitDiff(); }
    const r = state.pa.result;
    if (state.pa.loading || !r) {
      const ef0 = FP.trendView.filters(state), ctl = FP.productView.controlParts(state, { goto: true, groups: ef0.groups, chips: ef0.chips });
      PANEL = ctl.panel;
      el.innerHTML = PP(`<div class="px"><div class="app" id="frame" data-mode="${ux.mode}"><div class="topbar"><div class="topbar__row">${ctl.channel}${ctl.period}${ctl.compare}</div></div>@@PANEL@@<section class="blk">${state.pa.loading || !r ? FP.loader.html('Calculando desde los datos guardados en este navegador…', { key: 'productos' }) : ''}</section></div></div>`);
      mountDrawer(state, null);
      return;
    }
    MK = (state.an.context && state.an.context.metric) || state.an.metric || 'revenue';
    const m = model(state);
    const early = !m.a.rows.length && m.a.loading;
    const hist = !early && !(m.a.rows || []).length && !m.a.loading && m.a.key !== null && !(opts && opts.range);
    const rangeNote = opts && opts.range ? '<p class="cap"><b>La evolución necesita periodos de calendario.</b> El rango libre solo aplica a la foto del periodo: elige Año, Mes, Semana o Día en Granularidad (en Filtros) para actualizar la evolución.</p>' : '';
    const noHist = hist && FP.prodevolView && FP.prodevolView.noHistory ? FP.prodevolView.noHistory(state) : '';
    const html = `<div class="px"><div class="app" id="frame" data-mode="${ux.mode}">${topbar(state, ux.mode, m)}${verdict(m)}${attention(m)}<div class="more">${who(m, ux.quien)}${rangeNote ? `<section class="blk">${rangeNote}</section>` : ''}${since(m, noHist)}${why(m, state.peFocusKey)}${metaBlock(m)}${footer(m)}${method(m, ux)}</div></div></div>`;
    el.innerHTML = PP(html);
    bind(el, state);
    mountDrawer(state, m);
    if (FP.prodevolView && FP.prodevolView.settle) FP.prodevolView.settle(state);
  }

  /* ---------- Eventos de la página (la maqueta los resuelve en su propio script; aquí se enlazan a las acciones de la app) ---------- */
  function bind(el, state) {
    const ux = state.ux.px, app = el.querySelector('.px-app');
    const set = (mode) => { ux.mode = mode; app.dataset.mode = mode; $('m-res').setAttribute('aria-pressed', String(mode === 'res')); $('m-full').setAttribute('aria-pressed', String(mode !== 'res')); };
    $('m-res').onclick = () => set('res'); $('m-full').onclick = () => set('full');
    const vb = $('visitb'), vp = $('visitp');
    vb.onclick = (e) => { e.stopPropagation(); const o = vp.hidden; vp.hidden = !o; vb.setAttribute('aria-expanded', String(o)); };
    const hd = document.querySelector('.app-header');
    if (hd) root.document.documentElement.style.setProperty('--pe-top', `${Math.round(hd.getBoundingClientRect().height)}px`);
    if (!root.__pxTop) { root.__pxTop = true; root.addEventListener('resize', () => { const h2 = document.querySelector('.app-header'); if (h2) root.document.documentElement.style.setProperty('--pe-top', `${Math.round(h2.getBoundingClientRect().height)}px`); }); }
    const meth = $('meth'); if (meth) meth.addEventListener('toggle', () => { ux.meth = meth.open; });
    if (!el._pxBound) {
      el._pxBound = true;
      el.addEventListener('click', (e) => {
        const st = FP.app && FP.app.state;
        if (!e.target.closest('.px-visit')) { const p = $('visitp'), b = $('visitb'); if (p && !p.hidden) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } }
        const k = e.target.closest('[data-k]');
        if (k && !e.target.closest('.px-i,.px-conf')) {
          if (k.dataset.k === undefined) return;
          const isBtn = k.classList.contains('px-btn') && k.closest('.px-at');
          if (isBtn && /embudo/i.test(k.textContent)) { FP.app.actions['pe-pick']({ dataset: { entity: k.dataset.k } }); }
          FP.app.actions['pe-focus']({ dataset: { key: k.dataset.k } });
          return;
        }
        const tk = e.target.closest('[data-total]');
        if (tk && !e.target.closest('.px-i')) { FP.app.actions['an-drill-total']({ dataset: { source: 'kpi' } }); return; }
        const f = e.target.closest('[data-fold]');
        if (f) {
          const u = st.ux.px, w = f.dataset.fold;
          if (w === 'quien') { const wrap = f.closest('.px-tw'), o = wrap.classList.toggle('px-open'); u.quien = o; f.textContent = o ? 'Ver solo 5' : `Ver las ${f.dataset.n}`; wrap.querySelector('.px-tf .px-mu').textContent = o ? `${f.dataset.n} de ${f.dataset.n}` : `5 de ${f.dataset.n}`; }
          else if (w === 'geo') { const l = $('geo'), o = l.classList.toggle('px-open'); u.geo = o; f.textContent = o ? 'Ver solo 4' : `Ver las ${f.dataset.n}`; f.closest('.px-tf').querySelector('.px-mu').textContent = o ? 'todas' : `4 de ${f.dataset.n}`; }
          return;
        }
        const mt = e.target.closest('[data-method]');
        if (mt) { openMethod(st, mt.dataset.method); }
      });
      el.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-total]')) { e.preventDefault(); FP.app.actions['an-drill-total']({ dataset: { source: 'kpi' } }); return; }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-k]')) { e.preventDefault(); FP.app.actions['pe-focus']({ dataset: { key: e.target.dataset.k } }); }
      });
    }
  }
  function openMethod(state, id) {
    const m = $('meth'); if (!m) return;
    m.open = true; state.ux.px.meth = true;
    const t = $('m-' + (id || 'fc')) || m;
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Ficha (panel lateral) ---------- */
  function mountDrawer(state, m) {
    const dock = (function () { let d = $('pe-drawer-root'); const el = $('pe-body'); if (!d && el) { d = document.createElement('div'); d.id = 'pe-drawer-root'; el.parentNode.insertBefore(d, el.nextSibling); } return d; })();
    if (!dock) return;
    const dtot = Boolean(state.an.drill && state.an.drill.scope === 'total');
    const focus = dtot && !(state.peFocusKey !== null && state.peFocusKey !== undefined && state.an.drill.entity === state.peFocusKey) ? '__total__' : state.peFocusKey, on = Boolean(m && state.peDrawer && focus !== null && focus !== undefined);
    const wasOpen = Boolean($('pe-drawer'));
    if (!on) {
      if (dock.firstChild) {
        dock.textContent = '';
        if (wasOpen && state.peLastKey !== undefined) {
          const row = [...document.querySelectorAll('#pe-body [data-k]')].find((t) => t.dataset.k === String(state.peLastKey));
          if (row) row.focus({ preventScroll: true });
        }
      }
      return;
    }
    state.peLastKey = focus;
    const F2 = FP.pxFicha, c = focus === '__total__' ? totalRow(m) : (m.cats.find((x) => x.key === String(focus)) || rowFor(m, focus));
    const title = focus === '__total__' ? 'Total del análisis' : nameOf(m, focus), lvl = cap1(lw(m.level)[0]);
    if (!dock.querySelector('#pe-drawer')) {
      dock.innerHTML = P(`<div class="px"><div class="scr" id="pe-scrim" data-pe-close></div><aside class="drw" id="pe-drawer" role="dialog" aria-modal="true" aria-label="Ficha de la ${esc(lvl.toLowerCase())}"><div class="drw__t"><div><span class="eyebrow" id="deb">Ficha · ${esc(lvl)}</span><h3 id="dn"></h3></div><button class="btn" id="pe-drawer-x" data-pe-close>Cerrar ✕</button></div><div class="drw__b" id="db" style="padding:0"></div></aside></div>`);
      dock.addEventListener('click', (e) => {
        if (e.target.closest('[data-pe-close]')) { FP.app.actions['pe-drawer-close'](); return; }
        const j = e.target.closest('[data-j]'); if (j) { const t = $('s-' + j.dataset.j); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        const f2 = e.target.closest('.px-fold2'); if (f2) { const w = f2.closest('.px-tw'), o = w.classList.toggle('px-open'); f2.textContent = o ? 'Ver solo 6' : `Ver los ${f2.dataset.n}`; w.querySelector('.px-tf .px-mu').textContent = o ? 'todos' : `6 de ${f2.dataset.n}`; state.ux.px.dt = o; return; }
        const mt = e.target.closest('[data-method]'); if (mt) { FP.app.actions['pe-drawer-close'](); openMethod(state, mt.dataset.method); return; }
        const sm = e.target.closest('[data-sum]'); if (sm) { state.ux.px.sum = sm.dataset.sum; FP.pxView.render(state, LASTOPTS); return; }
        const kk = e.target.closest('[data-pick]'); if (kk) { FP.app.actions['pe-pick']({ dataset: { entity: kk.dataset.pick } }); return; }
      });
    }
    const dn = $('dn'); if (dn.textContent !== title) dn.textContent = title;
    const eb = $('deb'), ebt = `Ficha · ${focus === '__total__' ? 'Total' : lvl}`; if (eb && eb.textContent !== ebt) eb.textContent = ebt;
    const body = $('db'), html = PP(F2.html(m, c, focus, state));
    if (body._pxHtml !== html) { const top = body.scrollTop; body.innerHTML = html; body._pxHtml = html; body.scrollTop = top; }
    if (!wasOpen) { const x = $('pe-drawer-x'); if (x) x.focus({ preventScroll: true }); }
    if (!root.__pxEsc) { root.__pxEsc = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('pe-drawer') && FP.app) FP.app.actions['pe-drawer-close'](); }); }
  }

  FP.pxView = { render, model, funnelOf, STEP, relabel: () => LASTOPTS, totalRow, raw, e1, e2, getMK: () => MK, P, tip, M, m2, ms2, pcs, sgn, ym, ymc, MES, fin, nameOf, fcOf, confOf, confTitle, lw, cap1, num0, refName, refShort, monthOf, unitOf, esc };
})(typeof window !== 'undefined' ? window : globalThis);
