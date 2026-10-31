/**
 * segments-view.js — Fase 11 · pieza 2: «Tráfico y conversión» por segmento.
 * Lee el archivo de Segmentos que ya acepta Carga de datos (fecha, canal, dimensión, segmento, venta, pedidos, tráfico y clientes)
 * y muestra, para el periodo y canal elegidos (la misma selección de Diagnóstico), tráfico, pedidos, venta, CR y AOV por segmento,
 * contra el periodo anterior de la misma duración (los segmentos no tienen plan). CR y AOV salen de sumas, nunca de promedios.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && isFinite(v);

  function addDays(iso, n) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1; }

  /**
   * Recorre los registros de una dimensión en un rango de fechas. `src` puede ser un arreglo (forma anterior) o el índice del almacén
   * { list, byDim: dimensión → fecha → registros }: con el índice solo se visitan los días del rango de esa dimensión, no toda la
   * colección (con 1.3 millones de registros, cada pasada completa costaba ~50 ms y una vista hacía ~50).
   */
  function eachInRange(src, dimension, from, to, fn) {
    if (Array.isArray(src)) { for (let i = 0; i < src.length; i++) { const r = src[i]; if (r.dimension === dimension && r.date >= from && r.date <= to) fn(r); } return; }
    const byDate = src.byDim.get(dimension); if (!byDate) return;
    const n = daysBetween(from, to);
    if (n <= byDate.size) {
      let d = from;
      for (let i = 0; i < n; i++) { const a = byDate.get(d); if (a) for (let k = 0; k < a.length; k++) fn(a[k]); d = addDays(d, 1); }
    } else byDate.forEach((a, d) => { if (d >= from && d <= to) for (let k = 0; k < a.length; k++) fn(a[k]); });
  }
  const ownRecords = (src, dimension) => (Array.isArray(src) ? src.filter((r) => r.dimension === dimension) : [].concat(...[...(src.byDim.get(dimension) || new Map()).values()]));

  /** Suma por segmento de una dimensión, en un rango de fechas y canal. Solo valores observados o calculados. */
  function sumBy(recs, { from, to, channel, dimension }) {
    const out = new Map();
    eachInRange(recs, dimension, from, to, (r) => {
      if (channel !== 'total' && r.channel !== channel) return;
      const k = r.segmentKey || r.segment;
      const a = out.get(k) || { key: k, label: r.segment, revenue: 0, orders: 0, traffic: 0, customers: 0, newCustomers: 0, has: { revenue: false, orders: false, traffic: false, customers: false } };
      const v = (m) => (r.metrics[m] && (r.metrics[m].source === 'observed') && fin(r.metrics[m].value) ? r.metrics[m].value : null);
      const rv = v('revenue'), od = v('orders'), tv = v('trafficVolume');
      if (rv !== null) { a.revenue += rv; a.has.revenue = true; }
      if (od !== null) { a.orders += od; a.has.orders = true; }
      if (tv !== null) { a.traffic += tv; a.has.traffic = true; }
      if (r.extra && fin(r.extra.customers)) { a.customers += r.extra.customers; a.has.customers = true; }
      if (r.extra && fin(r.extra.newCustomers)) a.newCustomers += r.extra.newCustomers;
      out.set(k, a);
    });
    out.forEach((a) => { a.cr = a.has.orders && a.has.traffic && a.traffic > 0 ? a.orders / a.traffic : null; a.aov = a.has.revenue && a.has.orders && a.orders > 0 ? a.revenue / a.orders : null; });
    return out;
  }

  /** Resumen de una dimensión: segmentos del periodo contra el periodo anterior de la misma duración. */
  function summarize(recs, { from, to, channel, dimension, periodType = null }) {
    // Misma definición de referencia que Diagnóstico › productos, Producto y Análisis (mes anterior de calendario; rango libre = N días previos).
    if (periodType && ['month', 'week', 'year'].includes(periodType)) { // periodo en curso: hasta el último día con datos de segmentos
      let mx = ''; if (Array.isArray(recs)) recs.forEach((r) => { if (r.dimension === dimension && r.date > mx) mx = r.date; }); else { const bd = recs.byDim.get(dimension); if (bd) bd.forEach((_, d) => { if (d > mx) mx = d; }); }
      if (mx && to > mx && from <= mx) to = mx;
    }
    const base = FP.productAnalysis.baselinePeriod({ from, to, periodType }, 'previous');
    const cur = sumBy(recs, { from, to, channel, dimension }), prev = sumBy(recs, { ...base, channel, dimension });
    const totTraffic = [...cur.values()].reduce((s, a) => s + a.traffic, 0);
    const keys = new Set([...cur.keys(), ...prev.keys()]);
    const rows = [...keys].map((k) => {
      const c = cur.get(k) || null, p = prev.get(k) || null;
      return { key: k, label: (c || p).label, current: c, baseline: p, trafficShare: c && totTraffic ? c.traffic / totTraffic : null,
        trafficDeltaPct: c && p && p.traffic ? c.traffic / p.traffic - 1 : null,
        crDeltaPp: c && p && fin(c.cr) && fin(p.cr) ? (c.cr - p.cr) * 100 : null,
        revenueDelta: (c ? c.revenue : 0) - (p ? p.revenue : 0) };
    }).sort((a, b) => ((b.current && b.current.traffic) || 0) - ((a.current && a.current.traffic) || 0));
    return { period: { from, to }, baseline: base, rows, totalTraffic: totTraffic };
  }

  /** Por qué no hay filas: dice qué fechas y canales sí tienen datos de esa dimensión. */
  function emptyReason(recs, dimension, period, channel, label) {
    const own = ownRecords(recs, dimension);
    const chLabel = (id) => (FP.dataModel && FP.dataModel.getChannel ? FP.dataModel.getChannel(id).label : id);
    if (!own.length) return `El archivo cargado no trae ${label}.`;
    const dates = own.map((r) => r.date).sort(), chans = [...new Set(own.map((r) => r.channel))];
    const has = `${label} tiene datos del ${dates[0]} al ${dates[dates.length - 1]} en ${chans.map(chLabel).join(' y ')}`;
    if (channel !== 'total' && !chans.includes(channel)) return `No hay ${label} en el canal ${chLabel(channel)}. ${has}.`;
    return `No hay ${label} entre ${period.from} y ${period.to}${channel !== 'total' ? ` en ${chLabel(channel)}` : ''}. ${has}. Elige un periodo dentro de ese rango.`;
  }

  const PREFERRED = ['device', 'source', 'medium', 'campaign', 'landing', 'customer_type', 'device_source'];

  /** Mapa tráfico × CR en SVG: x = % del tráfico, y = CR; líneas en la participación promedio y el CR del total; tamaño = venta. */
  function quadrantMap(ins, esc) {
    const pts = ins.rows.filter((r) => r.relevant && r.current && typeof r.current.cr === 'number');
    if (pts.length < 2) return '';
    const W = 640, Hh = 300, L = 56, R = 16, T = 16, B = 44;
    const maxOf = (arr, init = -Infinity) => arr.reduce((m, v) => (v > m ? v : m), init);   // sin spread: pts puede tener miles de segmentos
    const maxX = maxOf(pts.map((r) => r.trafficShare)) * 1.1, maxY = maxOf(pts.map((r) => r.current.cr), ins.totals.cr) * 1.15;
    const sx = (v) => L + (v / maxX) * (W - L - R), sy = (v) => T + (1 - v / maxY) * (Hh - T - B);
    const maxRev = maxOf(pts.map((r) => r.current.revenue || 0)) || 1;
    const avg = ins.avgShare || 1 / pts.length;
    const circles = pts.map((r) => {
      const rad = 6 + 18 * Math.sqrt((r.current.revenue || 0) / maxRev);
      const name = r.label.length > 26 ? r.label.slice(0, 25) + '…' : r.label;
      return `<g class="sgmap__pt sgmap__pt--${r.quadrant}"><circle cx="${sx(r.trafficShare).toFixed(1)}" cy="${sy(r.current.cr).toFixed(1)}" r="${rad.toFixed(1)}"><title>${esc(r.label)}: ${(r.trafficShare * 100).toFixed(1)} % del tráfico, CR ${(r.current.cr * 100).toFixed(2)} %</title></circle>
        <text x="${(sx(r.trafficShare) + rad + 3).toFixed(1)}" y="${(sy(r.current.cr) + 4).toFixed(1)}">${esc(name)}</text></g>`;
    }).join('');
    return `<figure class="sgmap"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="sgmap-t sgmap-d">
        <title id="sgmap-t">Mapa de tráfico contra CR</title><desc id="sgmap-d">Cada círculo es un segmento con volumen suficiente; el tamaño es la venta. La tabla de abajo tiene los mismos datos y su cuadrante.</desc>
        <line class="sgmap__axis" x1="${L}" y1="${Hh - B}" x2="${W - R}" y2="${Hh - B}"/><line class="sgmap__axis" x1="${L}" y1="${T}" x2="${L}" y2="${Hh - B}"/>
        <line class="sgmap__ref" x1="${sx(avg).toFixed(1)}" y1="${T}" x2="${sx(avg).toFixed(1)}" y2="${Hh - B}"/><line class="sgmap__ref" x1="${L}" y1="${sy(ins.totals.cr).toFixed(1)}" x2="${W - R}" y2="${sy(ins.totals.cr).toFixed(1)}"/>
        <text class="sgmap__val" x="${(sx(avg) + 4).toFixed(1)}" y="${Hh - B - 22}">promedio ${(avg * 100).toFixed(1)} %</text><text class="sgmap__val" x="${W - R - 4}" y="${(sy(ins.totals.cr) - 5).toFixed(1)}" text-anchor="end">CR del total ${(ins.totals.cr * 100).toFixed(2)} %</text>
        <text class="sgmap__q" x="${W - R - 4}" y="${T + 12}" text-anchor="end">Estrellas</text><text class="sgmap__q" x="${L + 6}" y="${T + 12}">Escalar tráfico</text>
        <text class="sgmap__q" x="${W - R - 4}" y="${Hh - B - 6}" text-anchor="end">Convertir mejor</text><text class="sgmap__q" x="${L + 6}" y="${Hh - B - 6}">Revisar</text>
        <text class="sgmap__lbl" x="${(L + W - R) / 2}" y="${Hh - 10}" text-anchor="middle">% del tráfico →</text>
        <text class="sgmap__lbl" x="14" y="${(T + Hh - B) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(T + Hh - B) / 2})">CR →</text>
        ${circles}</svg>
      <figcaption class="field__hint">Línea vertical: participación promedio (${(avg * 100).toFixed(1)} %). Línea horizontal: CR del total (${(ins.totals.cr * 100).toFixed(2)} %). Tamaño: venta.</figcaption></figure>`;
  }

  /** Parte 1 de descubrimiento: hallazgos, mapa, oportunidades en pesos y rankings con umbral. */
  /** Etiqueta (tono y texto) de cada tipo de hallazgo: se lee de un vistazo qué clase de dato es antes de leer la frase. */
  const HL_TAG = { conversion: ['warning', 'Conversión'], scale: ['info', 'Escalar'], drop: ['danger', 'Caída'], rise: ['ok', 'Alza'], concentration: ['na', 'Concentración'], low: ['na', 'Poco volumen'], quality: ['warning', 'Medición'] };

  /** Tarjeta con encabezado (título, descripción) como las demás pantallas: Diagnóstico, Pacing, Calidad de datos. */
  const card = (id, title, desc, body, extra = '') => `<section class="panel sgcard" aria-labelledby="${id}"><div class="panel__head"><div>
      <h2 class="panel__title" id="${id}">${title}</h2>${desc ? `<p class="panel__desc">${desc}</p>` : ''}</div></div>
      <div class="panel__body stack">${body}</div>${extra}</section>`;

  /** Tarjetas de cifras del periodo contra el anterior (mismo estilo que Pacing). CR en puntos porcentuales; el resto en %. */
  function kpiCards(ins, { money, pct, F }) {
    const t = ins.totals, p = t.prev;
    const d = (cur, prev) => (p && prev ? (cur - prev) / prev : null);
    const sp = (v) => (typeof v === 'number' && isFinite(v) ? `${Math.abs(v * 100) < 0.05 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %` : null);
    const ref = (txt) => (txt ? `${txt} vs periodo anterior` : 'Sin periodo anterior para comparar');
    const crPp = p && p.cr !== null && t.cr !== null ? (t.cr - p.cr) * 100 : null;
    const spp = (v) => (typeof v === 'number' ? `${Math.abs(v) < 0.005 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} pp` : null);
    const one = (label, value, refTxt) => `<dl class="metric-card"><div class="metric-card__group"><dt class="metric-card__label">${label}</dt>
      <dd class="metric-card__value num">${value}</dd><dd class="metric-card__period">${refTxt}</dd></div></dl>`;
    return `<div class="metric-grid sgkpis">
        ${one('Tráfico', F.integer(t.traffic), ref(sp(d(t.traffic, p && p.traffic))))}
        ${one('Pedidos', F.integer(t.orders), ref(sp(d(t.orders, p && p.orders))))}
        ${one('CR', pct(t.cr, 2), ref(spp(crPp)))}
        ${one('AOV', t.aov === null ? '—' : money(t.aov), ref(sp(d(t.aov, p && p.aov))))}
        ${one('Venta', money(t.revenue), ref(sp(d(t.revenue, p && p.revenue))))}
      </div>`;
  }

  /** Insights de varias dimensiones en una sola lista (cada segmento con el nombre de su dimensión). Los cuadrantes y la participación son dentro de su dimensión. */
  function combineIns(list, ref) {
    if (list.length === 1) { const i = list[0].ins, relN = i.rows.filter((r) => r.relevant && fin(r.current.cr)).length; return { ...i, avgShare: relN ? 1 / relN : 1, multi: false }; }
    const F = FP.format, money = (v) => F.currency(v, 0), pct = (v, d = 1) => `${(v * 100).toFixed(d)} %`;
    const rows = [], opps = [], low = [];
    const lab = (d, r) => ({ ...r, key: `${d.dim}|${r.key}`, label: `${d.label}: ${r.label}`, dimLabel: d.label, dim: d.dim });
    list.forEach((d) => { d.ins.rows.forEach((r) => rows.push(lab(d, r))); (d.ins.opportunities || []).forEach((r) => opps.push(lab(d, r))); (d.ins.lowAov || []).forEach((r) => low.push(lab(d, r))); });
    const T = ref.ins.totals, crT = T.cr, aovT = T.aov;
    const top = (arr, f, n = 5, asc = false) => [...arr].filter((r) => fin(f(r))).sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n);
    const rel = rows.filter((r) => r.relevant && fin(r.current.cr));
    const rankings = { revenue: top(rows.filter((r) => r.current && r.current.has.revenue), (r) => r.current.revenue), bestCr: top(rel, (r) => r.current.cr),
      worstCr: top(rel.filter((r) => r.current.cr < crT), (r) => r.current.cr, 5, true), worstAov: top(rel.filter((r) => fin(r.current.aov) && fin(aovT) && r.current.aov < aovT), (r) => r.current.aov, 5, true) };
    const opportunities = top(opps, (r) => r.opportunity, 8);
    const H = [];
    if (opportunities.length) { const o = opportunities[0]; H.push({ kind: 'conversion', text: `Mayor oportunidad de conversión: «${o.label}» trae ${pct(o.trafficShare)} del tráfico de su dimensión y convierte ${pct(o.current.cr, 2)} contra ${pct(crT, 2)} del total. Al CR del total serían ${money(o.opportunity)} más (escenario matemático, no promesa).` }); }
    const scale = rows.filter((r) => r.quadrant === 'scale' && r.conclusive).sort((a, b) => (b.revenuePerSession || 0) - (a.revenuePerSession || 0))[0];
    if (scale) H.push({ kind: 'scale', text: `Oportunidad de escalar: «${scale.label}» convierte ${pct(scale.current.cr, 2)} (el total, ${pct(crT, 2)}) con solo ${pct(scale.trafficShare)} del tráfico de su dimensión.` });
    const wb = rows.filter((r) => r.baseline && r.baseline.has.revenue && (r.relevant || r.baseline.traffic >= ref.ins.threshold));
    const drop = [...wb].sort((a, b) => a.revenueDelta - b.revenueDelta)[0], rise = [...wb].sort((a, b) => b.revenueDelta - a.revenueDelta)[0];
    if (drop && drop.revenueDelta < 0) H.push({ kind: 'drop', text: `Mayor caída contra el periodo anterior: «${drop.label}», −${money(Math.abs(drop.revenueDelta))} en venta.` });
    if (rise && rise.revenueDelta > 0) H.push({ kind: 'rise', text: `Mayor alza contra el periodo anterior: «${rise.label}», +${money(rise.revenueDelta)} en venta.` });
    list.forEach((d) => { if (d.ins.quality && d.ins.quality.alert) H.unshift({ kind: 'quality', text: `Calidad de la medición en ${d.label}: ${pct(d.ins.quality.unclassifiedShare)} del tráfico no tiene dato («Sin dato (not set)»). Puede ser un problema de etiquetado en GA4, no de negocio.` }); });
    const lowN = rows.filter((r) => r.quadrant === 'low').length;
    if (lowN) H.push({ kind: 'low', text: `${lowN} segmento${lowN === 1 ? '' : 's'} con menos de ${F.integer(ref.ins.threshold)} sesiones: se muestran como «poco volumen» y no entran a rankings ni oportunidades.` });
    const avgShare = rel.length ? rel.reduce((a, r) => a + (r.trafficShare || 0), 0) / rel.length : 1;
    return { totals: T, threshold: ref.ins.threshold, rows, highlights: H, opportunities, rankings, lowAov: top(low, (r) => r.aovUplift, 8), quality: ref.ins.quality, avgShare, multi: true };
  }

  const gather = (ins, esc, money, pct, F) => {
    const list = (rows, val) => rows.length ? `<ol class="sgrank__list">${rows.map((r) => `<li><span>${esc(r.label)}</span><strong>${val(r)}</strong></li>`).join('')}</ol>` : '<p class="field__hint">Sin segmentos con volumen suficiente.</p>';
    return { list };
  };

  /** Mapa, lo que destaca y rankings (¿Dónde convierto peor o mejor?). */
  function whereBody(ins, { esc, money, pct, F }) {
    const { list } = gather(ins, esc, money, pct, F);
    return `<div id="sg-h"><h3 class="panel__title">Lo que destaca</h3><ul class="sghl">${ins.highlights.map((h) => { const t = HL_TAG[h.kind] || ['na', 'Dato']; return `<li class="sghl__item sghl__item--${h.kind}"><span class="sghl__tag">${H().pill(t[0], t[1])}</span><span class="sghl__text">${esc(h.text).replace(/«([^»]+)»/g, '«<strong>$1</strong>»')}</span></li>`; }).join('')}</ul>
        <p class="field__hint">Diferencias matemáticas entre segmentos, no causas: cualquier explicación es una hipótesis por validar.</p></div>
      <div id="sg-map"><h3 class="panel__title">Mapa de tráfico y conversión</h3>${quadrantMap(ins, esc) || '<p class="field__hint">Hacen falta al menos 2 segmentos con volumen suficiente.</p>'}</div>
      <section aria-labelledby="sg-r"><h3 class="panel__title" id="sg-r">Rankings</h3>
        <p class="field__hint">Solo segmentos con al menos ${F.integer(ins.threshold)} sesiones (el mayor entre 500 y el 1 % del tráfico), salvo «Más venta».${ins.multi ? ' Cada segmento va con el nombre de su dimensión; un mismo visitante cuenta en cada una.' : ''}</p>
        <div class="sgrank"><div><h4>Más venta</h4>${list(ins.rankings.revenue, (r) => money(r.current.revenue))}</div><div><h4>Mejor CR</h4>${list(ins.rankings.bestCr, (r) => pct(r.current.cr, 2))}</div>
          <div><h4>Menor CR (bajo el total)</h4>${list(ins.rankings.worstCr, (r) => pct(r.current.cr, 2))}</div><div><h4>Menor AOV (bajo el total)</h4>${list(ins.rankings.worstAov, (r) => money(r.current.aov))}</div></div></section>`;
  }

  /** Oportunidad estimada (con «Simular») y tickets bajos (¿Cuánto vale mejorar?). */
  function worthBody(ins, ctx) {
    const { esc, money, pct, F } = ctx;
    const opp = ins.opportunities.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="Oportunidad estimada por segmento">
        <thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Tráfico</th><th scope="col" class="num">CR</th><th scope="col" class="num">CR del total</th><th scope="col" class="num">AOV</th><th scope="col" class="num">Oportunidad estimada</th><th scope="col">Recovery Center</th></tr></thead>
        <tbody>${ins.opportunities.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${F.integer(r.current.traffic)}</td><td class="num">${pct(r.current.cr, 2)}</td><td class="num">${pct(ins.totals.cr, 2)}</td><td class="num">${money(r.current.aov)}</td><td class="num">+${money(r.opportunity)}</td><td><button type="button" class="btn btn--small" data-action="seg-simulate" data-label="${esc(r.label)}" data-rel="${((r.current.traffic * (ins.totals.cr - r.current.cr)) / ins.totals.orders * 100).toFixed(4)}">Simular</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p>Ningún segmento con volumen suficiente convierte claramente por debajo del total.</p>';
    return `<h3 class="panel__title" id="sg-o">Oportunidad estimada</h3>
      <p class="field__hint">Si el segmento convirtiera al CR del total, con su mismo tráfico y su AOV. Solo segmentos con volumen suficiente y una diferencia de CR concluyente. Escenario matemático, no promesa.${ins.multi ? ' Las oportunidades de distintas dimensiones pueden ser el mismo tráfico: no se suman.' : ''}</p>${opp}
      ${lowAovBlock(ins, ctx)}`;
  }

  /** Tabla de detalle de los segmentos del alcance (una o todas las dimensiones). */
  function detailBody(infos, ins, ctx) {
    const { esc, money, pct, F, signedPp, signedMoney, num, Q, emptyMsg } = ctx, multi = infos.length > 1;
    const byKey = new Map();
    infos.forEach((d) => d.ins.rows.forEach((r) => byKey.set(`${d.dim}|${r.key}`, r)));
    const rows = [];
    infos.forEach((d) => d.res.rows.forEach((r) => rows.push({ d, r })));
    rows.sort((a, b) => ((b.r.current && b.r.current.traffic) || 0) - ((a.r.current && a.r.current.traffic) || 0));
    const th = multi ? '<th scope="col">Dimensión</th><th scope="col">Segmento</th>' : `<th scope="col">${esc(infos[0].label)}</th>`;
    const body = rows.length ? rows.map(({ d, r }) => { const c = r.current, x = byKey.get(`${d.dim}|${r.key}`) || {}, q = x.quadrant ? Q[x.quadrant] : null;
      return `<tr>${multi ? `<td><span class="sgd-dimtag">${esc(d.label)}</span></td>` : ''}<th scope="row">${esc(r.label)}</th><td>${q ? `<span class="sgq sgq--${x.quadrant}">${esc(q.short)}</span>${x.conclusive === false ? '<span class="cell-sub">diferencia de CR no concluyente</span>' : ''}` : '—'}</td><td class="num">${num(c, 'traffic')}</td><td class="num">${pct(r.trafficShare)}</td><td class="num">${r.trafficDeltaPct === null ? '—' : signedPct(r.trafficDeltaPct)}</td>
        <td class="num">${num(c, 'orders')}</td><td class="num">${c ? pct(c.cr, 2) : '—'}</td><td class="num">${signedPp(r.crDeltaPp)}</td><td class="num">${c && fin(c.aov) ? money(c.aov) : '—'}</td><td class="num">${c && c.has.revenue ? money(c.revenue) : '—'}</td><td class="num">${signedMoney(r.revenueDelta)}</td></tr>`; }).join('')
      : `<tr><td colspan="${multi ? 12 : 11}">${esc(emptyMsg)}</td></tr>`;
    return `<div class="table-wrap"><table class="table ds-table" aria-label="${multi ? 'Detalle de todas las dimensiones' : `${esc(infos[0].label)}: tráfico y conversión por segmento`}"><thead><tr>${th}<th scope="col">Cuadrante</th><th scope="col" class="num">Tráfico</th><th scope="col" class="num">% del tráfico</th><th scope="col" class="num">Δ tráfico</th><th scope="col" class="num">Pedidos</th><th scope="col" class="num">CR</th><th scope="col" class="num">Δ CR</th><th scope="col" class="num">AOV</th><th scope="col" class="num">Venta</th><th scope="col" class="num">Δ venta</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="field__hint">Δ CR en puntos porcentuales (pp). ${multi ? 'Un mismo visitante cuenta en cada dimensión: las filas de distintas dimensiones no se suman. ' : ''}WhatsApp y Llamadas no tienen datos por segmento (GA4 solo mide el sitio y la app): sus totales siguen en venta real y en las demás vistas. Los mismos datos alimentan el <a href="#diagnostico" data-nav="diagnostico">Nivel 2 del Diagnóstico</a>.</p>`;
  }

  /**
   * Parte 3 · tendencia semanal: 8 bloques de 7 días que terminan el último día del periodo elegido, por segmento (los 5 con más tráfico
   * y volumen suficiente). CR por razón de sumas. «A la baja» / «al alza» solo si el CR de las 2 últimas semanas sale del intervalo de
   * Wilson contra las 6 anteriores; si no, «sin cambio claro».
   */
  function weeklyTrend(recs, { to, channel, dimension, keys }) {
    if (!keys.length) return null;
    const blocks = Array.from({ length: 8 }, (_, i) => { const end = addDays(to, -7 * (7 - i)); return { from: addDays(end, -6), to: end }; });
    const series = keys.map((k) => {
      const w = blocks.map((b) => { const m = sumBy(recs, { from: b.from, to: b.to, channel, dimension }).get(k); return m ? { traffic: m.traffic, orders: m.orders } : { traffic: 0, orders: 0 }; });
      const cr = w.map((x) => (x.traffic > 0 ? x.orders / x.traffic : null));
      const sum = (arr) => arr.reduce((a, x) => ({ traffic: a.traffic + x.traffic, orders: a.orders + x.orders }), { traffic: 0, orders: 0 });
      const last = sum(w.slice(6)), prev = sum(w.slice(0, 6));
      const crLast = last.traffic ? last.orders / last.traffic : null, crPrev = prev.traffic ? prev.orders / prev.traffic : null;
      const wi = FP.segmentInsights.wilson(last.orders, last.traffic);
      const dir = crLast === null || crPrev === null || !wi ? 'na' : crPrev > wi.hi ? 'down' : crPrev < wi.lo ? 'up' : 'flat';
      const label = (sumBy(recs, { from: blocks[0].from, to, channel, dimension }).get(k) || {}).label || k;
      return { key: k, label, cr, crLast, crPrev, dir, weeks: w };
    }).filter((x) => x.weeks.some((y) => y.traffic > 0));
    return series.length ? { blocks, series } : null;
  }

  function spark(cr) {
    const vals = cr.filter((v) => typeof v === 'number'); if (vals.length < 2) return '';
    const max = Math.max(...vals), min = Math.min(...vals), W = 120, Hh = 28, span = max - min || max || 1;
    const pts = cr.map((v, i) => (typeof v === 'number' ? `${(i * W / (cr.length - 1)).toFixed(1)},${(Hh - 3 - ((v - min) / span) * (Hh - 6)).toFixed(1)}` : null)).filter(Boolean).join(' ');
    return `<svg class="sgspark" viewBox="0 0 ${W} ${Hh}" aria-hidden="true" focusable="false"><polyline points="${pts}"/></svg>`;
  }

  function trendBlock(t, { esc, pct }) {
    const DIR = { down: 'A la baja', up: 'Al alza', flat: 'Sin cambio claro', na: 'Sin datos suficientes' };
    return `<section aria-labelledby="sg-w"><h3 class="panel__title" id="sg-w">Tendencia semanal del CR</h3>
        <p class="field__hint">8 bloques de 7 días que terminan el ${esc(t.blocks[7].to)}. «A la baja» o «al alza» solo si el CR de las 2 últimas semanas se separa claramente del de las 6 anteriores (intervalo de Wilson al 95 %).</p>
        <div class="table-wrap"><table class="table ds-table" aria-label="Tendencia semanal del CR">
          <thead><tr><th scope="col">Segmento</th><th scope="col">8 semanas</th><th scope="col" class="num">CR 6 semanas antes</th><th scope="col" class="num">CR 2 últimas</th><th scope="col">Tendencia</th></tr></thead>
          <tbody>${t.series.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${spark(x.cr)}</td><td class="num">${typeof x.crPrev === 'number' ? pct(x.crPrev, 2) : '—'}</td><td class="num">${typeof x.crLast === 'number' ? pct(x.crLast, 2) : '—'}</td><td><span class="sgtrend sgtrend--${x.dir}">${DIR[x.dir]}</span></td></tr>`).join('')}</tbody></table></div></section>`;
  }


  /** 5) Qué explica el cambio contra el periodo anterior: ganadores y perdedores con su descomposición tráfico → CR → AOV. */
  /** 6) AOV bajo con buen volumen. */
  function lowAovBlock(ins, { esc, money, pct, F }) {
    return `<section aria-labelledby="sg-a"><h3 class="panel__title" id="sg-a">AOV bajo con buen volumen</h3>
        <p class="field__hint">Segmentos con volumen suficiente, al menos 30 pedidos y un ticket más de 15 % por debajo del total (${money(ins.totals.aov)}). Podrían ser candidatos a venta cruzada o a un umbral de envío: es una hipótesis por validar.</p>
        ${ins.lowAov.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="AOV bajo con buen volumen">
          <thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Pedidos</th><th scope="col" class="num">AOV</th><th scope="col" class="num">Contra el total</th><th scope="col" class="num">Con el AOV del total</th></tr></thead>
          <tbody>${ins.lowAov.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${F.integer(r.current.orders)}</td><td class="num">${money(r.current.aov)}</td><td class="num">−${pct(Math.abs(r.aovGap))}</td><td class="num">+${money(r.aovUplift)}</td></tr>`).join('')}</tbody></table></div>`
          : '<p>Ningún segmento con volumen suficiente tiene un ticket claramente bajo.</p>'}</section>`;
  }

  /** 8) Nuevos contra recurrentes. */
  function splitBlock(sp, { esc, money, pct }) {
    const pp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? `${a >= b ? '+' : '−'}${Math.abs((a - b) * 100).toFixed(1)} pp` : '—');
    const row = (x) => `<tr><th scope="row">${esc(x.label)}</th><td class="num">${pct(x.share)}</td><td class="num">${pp(x.share, x.shareBefore)}</td><td class="num">${typeof x.cr === 'number' ? pct(x.cr, 2) : '—'}</td><td class="num">${typeof x.aov === 'number' ? money(x.aov) : '—'}</td></tr>`;
    const crRatio = sp.nuevo.cr && sp.recurrente.cr ? sp.recurrente.cr / sp.nuevo.cr : null;
    return `<section aria-labelledby="sg-n"><h3 class="panel__title" id="sg-n">Nuevos y recurrentes</h3>
        <p class="field__hint">Desde la dimensión «Tipo de cliente», con el mismo periodo y canal.${crRatio ? ` Los recurrentes convierten ${crRatio.toFixed(1)} veces lo que los nuevos.` : ''}</p>
        <div class="table-wrap"><table class="table ds-table" aria-label="Nuevos y recurrentes">
          <thead><tr><th scope="col">Tipo de cliente</th><th scope="col" class="num">% del tráfico</th><th scope="col" class="num">Cambio de peso</th><th scope="col" class="num">CR</th><th scope="col" class="num">AOV</th></tr></thead>
          <tbody>${row(sp.nuevo)}${row(sp.recurrente)}</tbody></table></div></section>`;
  }

  const infosAllDims = (dims) => dims;
  const signedPct = (v) => (fin(v) ? `${Math.abs(v * 100) < 0.05 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %` : '—');

  function render(state) {
    const esc = H().esc, F = FP.format, C = FP.config, PXH = () => FP.pxView;
    const recs = FP.dataStore.segmentIndex(state.store);
    const dimsCfg = C.diagnostics.dimensions;
    const present = [...recs.byDim.keys()].filter(Boolean);
    const memo = (key, fn) => FP.dataStore.cached(state.store, key, ['segments'], fn);
    const dims = [...PREFERRED.filter((d) => present.includes(d)), ...present.filter((d) => !PREFERRED.includes(d))];
    const lbl = (d) => (dimsCfg[d] && dimsCfg[d].label) || d;
    const head = `<section class="panel" aria-labelledby="t-seg"><div class="panel__head"><div data-own-head>
        <h2 class="panel__title" id="t-seg">Tráfico y conversión por segmento</h2>
        <p class="panel__desc">Tráfico, pedidos, venta, CR y AOV por dispositivo, fuente y medio, campaña, landing o tipo de cliente, con el archivo de Segmentos. CR y AOV salen de sumas, nunca de promedios.</p>
      </div></div>`;
    if (!recs.list.length) {
      $('segments-view').innerHTML = `${head}<div class="panel__body"><div class="ds-empty" role="note">
        <p><strong>Todavía no hay segmentos cargados.</strong></p>
        <p>Carga el archivo de Segmentos en <a href="#carga" data-nav="carga">Carga de datos</a> con estas columnas: ${esc(C.dataTypes.segments.template.join(', '))}.
          En «dimension» van, por ejemplo, dispositivo, fuente, medio, campaña, landing o tipo_cliente; en «segmento», su valor (Móvil, google / cpc…).</p>
        <p class="field__hint">Los mismos datos alimentan el Nivel 2 del Diagnóstico. También acepta el CSV exportado de GA4 tal cual: se convierte solo al cargarlo.</p>
      </div></div></section>`;
      return;
    }
    const sg = state.seg || (state.seg = {});
    sg.dimension = sg.dimension || 'all'; sg.eff = sg.eff || 'all'; sg.sign = sg.sign || 'all'; sg.sum = sg.sum || 'c'; sg.mode = sg.mode || 'full'; sg.xp = sg.xp || 'a';
    if (!sg.n) sg.n = C.diagnostics.trafficSummary.topN;
    const s = state.dx.settings;
    const range = FP.app.periodRange(s.periodType, s.periodKey) || { from: `${state.year}-01-01`, to: `${state.year}-12-31` };
    const minV = fin(sg.min) && sg.min > 0 ? sg.min : null;
    const dkey = `${range.from}|${range.to}|${s.periodType}|${s.channel}`;
    const sumOf = (d) => memo(`segsum|${dkey}|${d}`, () => summarize(recs, { from: range.from, to: range.to, channel: s.channel, dimension: d, periodType: s.periodType }));
    const COMBO = ['device_source'];
    const infosAll = dims.map((d) => { const res = sumOf(d); return { dim: d, label: lbl(d), res, ins: FP.segmentInsights.analyze(res) }; });
    let infos = infosAll.filter((d) => !COMBO.includes(d.dim) && d.res.rows.length);
    let comboInfo = infosAll.find((d) => COMBO.includes(d.dim) && d.res.rows.length);
    if (!infos.length && comboInfo) { infos = [comboInfo]; comboInfo = undefined; }   // solo trae la combinación: se lee como una dimensión más
    const F2 = FP.format, pct = (v, d = 1) => (fin(v) ? `${(v * 100).toFixed(d)} %` : '—');
    const signedPp = (v) => (fin(v) ? `${Math.abs(v) < 0.005 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} pp` : '—');
    const money = (v) => F2.currency(v || 0, 0);
    const signedMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + F2.currency(Math.abs(v || 0), 0);
    const num = (a, k) => (a && a.has[k === 'traffic' ? 'traffic' : k] ? F2.integer(a[k]) : '—');
    const dctx = { esc, money, pct, F: F2, signedPp, signedMoney, num, Q: FP.segmentInsights.QUADRANT };
    const dimSelect = `<div class="field"><label for="sg-dim" class="field__hint">Dimensión</label><select id="sg-dim" data-action="seg-dim"><option value="all" ${(sg.dimension || 'all') === 'all' ? 'selected' : ''}>Todas las dimensiones</option>${infosAllDims(dims).map((d) => `<option value="${esc(d)}" ${d === sg.dimension ? 'selected' : ''}>${esc(lbl(d))}</option>`).join('')}</select></div>`;
    const ctrl = FP.narrativeView.contextControls(state, 'sg', 'dx-setting', 'dx-period-type', dimSelect);
    const baseNote = (r) => `Periodo ${esc(r.period.from)} a ${esc(r.period.to)} contra ${esc(r.baseline.from)} a ${esc(r.baseline.to)} (${esc(r.baseline.label || 'periodo anterior')}: los segmentos no tienen plan). Periodo y canal son la misma selección de Diagnóstico.`;
    if (!infos.length) {
      const first = infosAll[0] || { dim: dims[0], label: lbl(dims[0]), res: sumOf(dims[0]) };
      $('segments-view').innerHTML = `${head}<div class="panel__body stack">${ctrl}<p class="field__hint">${baseNote(first.res)}</p>
        <div class="note note--warn" role="status">${esc(emptyReason(recs, first.dim, first.res.period, s.channel, first.label))}</div></div></section>`;
      return;
    }
    const minByDim = {}; if (minV) infos.forEach((d) => { minByDim[d.dim] = minV; });
    const all = memo(`segall|${dkey}|${minV || 'auto'}|${infos.map((d) => d.dim).join('~')}${comboInfo ? '|x' : ''}`, () => FP.trafficConversionEngine.analyzeAll(
      infos.map((d) => ({ dim: d.dim, label: d.label, res: d.res, ins: d.ins })).concat(comboInfo ? [{ dim: comboInfo.dim, label: comboInfo.label, res: comboInfo.res }] : []), { minByDim }));
    const ref = infos.slice().sort((a, b) => b.ins.totals.traffic - a.ins.totals.traffic)[0];
    const scopable = infos.concat(comboInfo ? [comboInfo] : []);
    if (sg.dimension !== 'all' && !scopable.some((d) => d.dim === sg.dimension)) sg.dimension = 'all';
    const scopeInfos = sg.dimension === 'all' ? infos : scopable.filter((d) => d.dim === sg.dimension);
    const isCombo = scopeInfos.length === 1 && COMBO.includes(scopeInfos[0].dim) && Boolean(comboInfo);
    const sIns = combineIns(scopeInfos, ref);
    // tendencia semanal del CR de los 5 segmentos con más tráfico de cada dimensión (las de todas, para el resumen)
    const trends = infos.map((d) => { const tk = d.ins.rows.filter((r) => r.relevant).sort((a, b) => b.current.traffic - a.current.traffic).slice(0, 5).map((r) => r.key);
      const t = memo(`segtrend|${range.to}|${s.channel}|${d.dim}|${tk.join('~')}`, () => weeklyTrend(recs, { to: range.to, channel: s.channel, dimension: d.dim, keys: tk }));
      return { dim: d.dim, dimLabel: d.label, t, series: t ? t.series : [] }; });
    const ctTrends = sg.dimension === 'all' ? trends : trends.filter((t) => t.dim === sg.dimension);
    const trendMerged = ctTrends.some((t) => t.t) ? { blocks: ctTrends.find((t) => t.t).t.blocks, series: ctTrends.flatMap((t) => (t.t ? t.t.series : []).map((x) => ({ ...x, label: sg.dimension === 'all' ? `${t.dimLabel}: ${x.label}` : x.label }))) } : null;
    const ctInfo = infos.find((d) => d.dim === 'customer_type');
    const split = ctInfo ? FP.segmentInsights.customerSplit(ctInfo.res) : null;
    const R = FP.trResumen.build({ all, dimsInfo: infos, ref, trends, split, channel: s.channel, baseline: ref.res.baseline });
    const sumRows = R.rows.filter((r) => (sg.sum === 'l' ? r[2] : r[1]));
    const P = (h) => PXH().P(h);
    const blk = (id, t, cap, body, lec) => P(`<section class="blk" id="${id}"><div class="blk__h"><h3>${t}</h3><span class="cap">${cap}</span></div>@@B@@${lec ? `<p class="lec">${lec}</p>` : ''}</section>`).replace('@@B@@', () => `<div class="sgbody stack">${body}</div>`);
    const kpis = kpiCards(ref.ins, { money, pct, F: F2 });
    const chips = R.chips.map((c) => `<span class="px-tchip ${c[0]}" tabindex="0" data-tip="${esc(c[2])}">${esc(c[1])}</span>`).join('');
    const nF = minV ? 1 : 0;
    const topbar = `<div class="px-topbar" id="sg-topbar"><div class="px-topbar__row"><div class="sg-ctx">${ctrl}</div>
        <button type="button" class="px-btn" data-action="fs-toggle" data-fs-page="sg" aria-expanded="${Boolean(state.fs && state.fs.sg)}" aria-controls="fs-sg">⚙ Filtros${nF ? ` · ${nF}` : ''}</button>
        <div class="px-seg sg-modeseg" role="group" aria-label="Nivel de detalle"><button type="button" id="sg-m-res" aria-pressed="${sg.mode === 'res'}">Resumen</button><button type="button" id="sg-m-full" aria-pressed="${sg.mode !== 'res'}">Completo</button></div></div>
      ${state.fs && state.fs.sg ? `<div class="px-fs" id="fs-sg"><div class="field"><label for="sg-min" class="field__hint">Mínimo de sesiones por segmento</label>
        <select id="sg-min" data-action="seg-min"><option value="" ${minV ? '' : 'selected'}>Automático (${esc(F2.integer(ref.ins.threshold))})</option>${[25, 50, 100, 250, 500, 1000, 2500, 5000].map((v) => `<option value="${v}" ${minV === v ? 'selected' : ''}>${esc(F2.integer(v))}</option>`).join('')}</select></div>
        <p class="field__hint">Un segmento con menos sesiones se agrupa en «Otros» en la descomposición. Aplica a todas las dimensiones.</p></div>` : ''}</div>`;
    const verdict = `<section class="px-verdict"><p class="px-eyebrow">Tráfico y conversión · ${esc(ref.res.period.from)} a ${esc(ref.res.period.to)}${ref.res.baseline ? ` contra ${esc(ref.res.baseline.from)} a ${esc(ref.res.baseline.to)}` : ''}</p><h2>${esc(R.verdict)}</h2>
        <div class="px-trust" aria-label="Confiabilidad y contexto">${chips}</div><div class="sgkpi-slot">${kpis}</div></section>`;
    const intro = `<section class="px-intro"><div class="px-intro__h"><h3>Resumen general</h3><div class="px-mini" id="sg-md" role="group" aria-label="Versión del resumen"><button type="button" data-v="c" aria-pressed="${sg.sum !== 'l'}">Versión corta</button><button type="button" data-v="l" aria-pressed="${sg.sum === 'l'}">Versión larga</button></div></div>
        <div class="px-sum${sg.sum === 'l' ? ' px-sum--l' : ''}" data-sg-summary="1">${sumRows.map((r) => `<div class="px-sum__r"><span>${esc(r[0])}</span><span>${sg.sum === 'l' ? r[2] : r[1]}</span></div>`).join('')}</div></section>`;
    const scopeName = sg.dimension === 'all' ? 'todas las dimensiones' : scopeInfos[0].label.toLowerCase();
    const scopeBar = `<div class="px-scope sg-scope" id="sg-scope">Desde aquí, las secciones muestran <b>${esc(scopeName)}</b>. <span class="px-cap">Cámbialo en la lista de «Qué mirar primero» o en «¿Se ve igual desde otra dimensión?».</span></div>`;
    const navItems = [['sg-dec', '¿Qué explica el cambio?'], ...(infos.length > 1 ? [['sg-dims', 'Otras dimensiones'], ['sg-x', 'Cruce']] : []), ['sg-m', 'Dónde convierto'], ['sg-opp', 'Cuánto vale mejorar'], ...(trendMerged ? [['sg-chg', 'CR semanal']] : []), ...(split ? [['sg-oth', 'Nuevos y recurrentes']] : []), ['sg-table', 'Detalle por segmento']];
    const navHtml = `<nav class="sgnav" aria-label="Ir a una sección"><span class="sgnav__lbl">Ir a</span>${navItems.map(([id, l]) => `<a class="btn btn--small" href="#${id}" data-sgjump="${id}">${esc(l)}</a>`).join('')}</nav>`;
    const secs = [];
    if (R.hasBase) {
      const legacy = (info) => { const dec = memo(`segdec|${dkey}|${info.dim}|${minV || 'auto'}`, () => FP.trafficConversionEngine.analyze(info.res, minV ? { minSessions: minV } : {})); return FP.segmentsDecompView.card(dec, dctx); };
      const one = scopeInfos.length === 1 && sg.dimension !== 'all' ? scopeInfos[0] : null;
      const body1 = isCombo ? legacy(one)
        : FP.segmentsDecompView.allCard(all, sg, dctx) + (one ? `<details class="sg-legacy" id="sg-dec-dim"${sg.decOpen ? ' open' : ''}><summary>Descomposición completa de ${esc(one.label)} (cómo reparte esa dimensión el cambio)</summary>${legacy(one)}</details>` : '');
      secs.push(blk('sg-dec', '¿Qué explica el cambio de la venta?', isCombo ? 'El mismo cambio visto desde el cruce Dispositivo × Fuente/medio.' : 'La cascada del total no depende de la dimensión; la lista junta los segmentos de todas.', body1, R.lec.s1));
      if (infos.length > 1) secs.push(blk('sg-dims', '¿Se ve igual desde otra dimensión?', 'Lo que atribuye cada dimensión al cambio de venta. Pulsa una para filtrar la lista y el detalle.', FP.segmentsDecompView.dimsCard(all.dims.filter((d) => d.status === 'ok').map((d) => ({ dim: d.dim, label: d.label, active: sg.dimension === d.dim, dec: d.dec })), dctx) || '<p class="field__hint">Hacen falta al menos 2 dimensiones con periodo anterior.</p>', ''));
      if (infos.length > 1) secs.push(blk('sg-x', '¿Qué pasa en el cruce?', 'Dimensión principal y secundaria: cada combinación en una sola celda.', FP.segmentsDecompView.crossCard(all.cross, sg, dctx), ''));
    } else secs.push(blk('sg-dec', '¿Qué explica el cambio de la venta?', 'Tráfico, conversión y ticket.', '<p class="field__hint">No hay datos de segmentos del periodo anterior para comparar: sin referencia no se puede partir el cambio en tráfico, conversión y ticket. Más abajo sí se ve el periodo actual por segmento.</p>', ''));
    secs.push(scopeBar);
    secs.push(blk('sg-m', '¿Dónde convierto peor o mejor?', 'Cada círculo es un segmento con volumen suficiente; su tamaño es la venta.', whereBody(sIns, dctx), R.lec.s3));
    secs.push(blk('sg-opp', '¿Cuánto vale mejorar?', 'Oportunidad estimada y tickets bajos con volumen.', worthBody(sIns, dctx), R.lec.s4));
    if (trendMerged) secs.push(blk('sg-chg', '¿Cómo viene el CR?', 'Semana a semana en los segmentos con más tráfico.', trendBlock(trendMerged, { esc, pct }), R.lec.s5));
    if (split) secs.push(blk('sg-oth', '¿Nuevos o recurrentes?', 'Cómo convierten y cuánto pesan los clientes nuevos y los recurrentes.', splitBlock(split, { esc, money, pct }), ''));
    secs.push(blk('sg-table', 'Detalle por segmento', 'Todos los segmentos del alcance elegido, con su cuadrante y su cambio contra el periodo anterior.', detailBody(scopeInfos, sIns, { ...dctx, emptyMsg: emptyReason(recs, scopeInfos[0].dim, ref.res.period, s.channel, scopeInfos[0].label) }), ''));
    const actCard = (a) => `<div><b>${esc(a.title)}</b><span>${esc(a.desc)}</span>${a.why ? `<span class="px-cap"><b>No disponible.</b> ${esc(a.why)}</span>` : `<button type="button" class="px-lk" data-action="${{ sim: 'seg-simulate', dx: 'tr-to-dx', cross: 'tr-to-cross', cli: 'tr-to-clients' }[a.id]}"${a.id === 'sim' ? ` data-label="${esc(a.label)}" data-rel="${(a.rel || 0).toFixed(4)}"` : ''}>Abrir →</button>`}</div>`;
    secs.push(P(`<section class="blk" id="sg-q"><div class="blk__h"><h3>¿Qué hago con esto?</h3><span class="cap">De la lectura a la acción: lo que sigue en el flujo, con el mismo periodo y canal.</span></div><div class="act">${R.actions.map(actCard).join('')}</div><p class="cap">Llegas con el contexto puesto. Nada se guarda ni se ejecuta desde aquí.</p></section>`).replace(/<div class="px-act">/, '<div class="px-act">'));
    const defs = [['CR', 'Pedidos entre sesiones. Sale de sumas, nunca de promedios.'], ['AOV', 'Venta entre pedidos.'], ['Efectos', 'Cada uno mueve un factor a la vez (tráfico → conversión → ticket) y los tres suman exactamente el cambio de la venta.'], ['Mezcla del CR', 'Parte del cambio del CR del total por cómo convierte cada segmento y parte por cómo cambió el peso de cada uno.'],
      ['Distinguible del azar', 'Prueba de dos proporciones al 95 %; «no concluyente» si no pasa.'], ['Tendencia', '2 últimas semanas contra las 6 anteriores, con el intervalo de Wilson al 95 %.'], ['Otros', 'Segmentos con menos del mínimo de sesiones se agrupan; si pesan 25 % o más, se avisa.'], ['Dimensiones', 'Cada dimensión parte la misma venta de otra manera: sus efectos no se suman entre sí. El cruce (Dispositivo × Fuente/medio) sí es una partición.']];
    const cs = C.diagnostics.trafficSummary;
    const meth = `<details class="px-meth" id="sg-meth"${sg.meth ? ' open' : ''}><summary>Método y definiciones</summary><div class="px-meth__b"><section class="px-dsec"><h4>Definiciones</h4><dl class="px-defs">${defs.map((d) => `<div><dt>${esc(d[0])}</dt><dd>${esc(d[1])}</dd></div>`).join('')}</dl></section>
      <section class="px-dsec"><h4>Umbrales (provisionales)</h4><dl class="px-fi"><div><dt>Mínimo de sesiones</dt><dd>El mayor entre 500 y el 1 % del tráfico (ajustable en ⚙ Filtros)</dd></div><div><dt>Oportunidad</dt><dd>CR bajo el total, diferencia concluyente y ≥ ${(cs.oppMinShare * 100).toFixed(1)} % de la venta para proponer simularla</dd></div><div><dt>Ticket bajo</dt><dd>≥ 30 pedidos y más de 15 % bajo el total</dd></div><div><dt>Mezcla del CR en el resumen</dt><dd>Se nombra desde ${cs.mixMinPp} pp</dd></div></dl>
      <p class="px-cap">Los segmentos no tienen plan: la referencia es el periodo anterior. WhatsApp y Llamadas no tienen datos por segmento.</p></section></div></details>`;
    const foot = `<section class="px-blk px-foot"><span class="px-mu">Segmentos de GA4 · ${esc(ref.res.period.from)} a ${esc(ref.res.period.to)} · ${infos.length === 1 ? '1 dimensión' : infos.length + ' dimensiones'}</span></section>`;
    $('segments-view').innerHTML = `${head}<div class="px px-sg"><div class="px-app" id="sg-frame" data-mode="${sg.mode}">${topbar}${verdict}${intro}
      <div class="px-more"><p class="px-cap sg-base">${baseNote(ref.res)}</p>${navHtml}${secs.join('\n')}</div>${foot}${meth}</div></div></section>`;
    const app = $('segments-view').querySelector('.px-app');
    const setMode = (m) => { sg.mode = m; app.dataset.mode = m; $('sg-m-res').setAttribute('aria-pressed', String(m === 'res')); $('sg-m-full').setAttribute('aria-pressed', String(m !== 'res')); };
    $('sg-m-res').onclick = () => setMode('res'); $('sg-m-full').onclick = () => setMode('full');
    const dd = $('sg-dec-dim'); if (dd) dd.addEventListener('toggle', () => { sg.decOpen = dd.open; });
    const md = $('sg-meth'); if (md) md.addEventListener('toggle', () => { sg.meth = md.open; });
    const el = $('segments-view');
    if (!el._sgBound) { el._sgBound = true;
      el.addEventListener('click', (e) => { const b = e.target.closest('#sg-md button'); if (!b) return; const st = FP.app && FP.app.state; if (!st || !st.seg) return; st.seg.sum = b.dataset.v; const y = root.scrollY; render(st); root.scrollTo(0, y); }); }
  }

  FP.segmentsView = { render, summarize, emptyReason };
})(typeof window !== 'undefined' ? window : globalThis);
