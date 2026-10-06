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
  function summarize(recs, { from, to, channel, dimension }) {
    const n = daysBetween(from, to);
    const base = { from: addDays(from, -n), to: addDays(from, -1) };
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
    const avg = 1 / pts.length;
    const circles = pts.map((r) => {
      const rad = 6 + 18 * Math.sqrt((r.current.revenue || 0) / maxRev);
      const name = r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label;
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

  function discovery(ins, { esc, money, pct, F, split, trend }) {
    const list = (rows, val) => rows.length ? `<ol class="sgrank__list">${rows.map((r) => `<li><span>${esc(r.label)}</span><strong>${val(r)}</strong></li>`).join('')}</ol>` : '<p class="field__hint">Sin segmentos con volumen suficiente.</p>';
    const nav = [['sg-h', 'Lo que destaca'], ['sg-m', 'Mapa'], ['sg-opp', 'Oportunidad'], ['sg-chg', 'Qué cambió'], ['sg-oth', 'Ticket y clientes']];   // una entrada por tarjeta
    const cap = (t) => t;
    const hasChanges = true;
    return {
      nav,
      html: [
        card('sg-h', 'Lo que destaca', 'Lo más relevante del periodo, calculado de los datos (sin IA).', `
          <ul class="sghl">${ins.highlights.map((h) => { const t = HL_TAG[h.kind] || ['na', 'Dato']; return `<li class="sghl__item sghl__item--${h.kind}"><span class="sghl__tag">${H().pill(t[0], t[1])}</span><span class="sghl__text">${esc(h.text).replace(/«([^»]+)»/g, '«<strong>$1</strong>»')}</span></li>`; }).join('')}</ul>
          <p class="field__hint">Diferencias matemáticas entre segmentos, no causas: cualquier explicación es una hipótesis por validar.</p>`),
        card('sg-m', 'Mapa de tráfico y conversión', 'Cada círculo es un segmento con volumen suficiente; su tamaño es la venta.', `${quadrantMap(ins, esc) || '<p class="field__hint">Hacen falta al menos 2 segmentos con volumen suficiente.</p>'}`),
        card('sg-opp', 'Dónde está la oportunidad', 'Qué segmentos convierten por debajo del total y cuáles lideran.', `<section aria-labelledby="sg-o"><h3 class="panel__title" id="sg-o">Oportunidad estimada</h3>
          <p class="field__hint">Si el segmento convirtiera al CR del total, con su mismo tráfico y su AOV. Solo segmentos con volumen suficiente y una diferencia de CR concluyente. Escenario matemático, no promesa.</p>
          ${ins.opportunities.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="Oportunidad estimada por segmento">
            <thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Tráfico</th><th scope="col" class="num">CR</th><th scope="col" class="num">CR del total</th><th scope="col" class="num">AOV</th><th scope="col" class="num">Oportunidad estimada</th><th scope="col">Recovery Center</th></tr></thead>
            <tbody>${ins.opportunities.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${F.integer(r.current.traffic)}</td><td class="num">${pct(r.current.cr, 2)}</td><td class="num">${pct(ins.totals.cr, 2)}</td><td class="num">${money(r.current.aov)}</td><td class="num">+${money(r.opportunity)}</td><td><button type="button" class="btn btn--small" data-action="seg-simulate" data-label="${esc(r.label)}" data-rel="${((r.current.traffic * (ins.totals.cr - r.current.cr)) / ins.totals.orders * 100).toFixed(4)}">Simular</button></td></tr>`).join('')}</tbody></table></div>`
            : '<p>Ningún segmento con volumen suficiente convierte claramente por debajo del total.</p>'}</section>
        <section aria-labelledby="sg-r"><h3 class="panel__title" id="sg-r">Rankings</h3>
          <p class="field__hint">Solo segmentos con al menos ${F.integer(ins.threshold)} sesiones (el mayor entre 500 y el 1 % del tráfico), salvo «Más venta».</p>
          <div class="sgrank">
            <div><h4>Más venta</h4>${list(ins.rankings.revenue, (r) => money(r.current.revenue))}</div>
            <div><h4>Mejor CR</h4>${list(ins.rankings.bestCr, (r) => pct(r.current.cr, 2))}</div>
            <div><h4>Menor CR (bajo el total)</h4>${list(ins.rankings.worstCr, (r) => pct(r.current.cr, 2))}</div>
            <div><h4>Menor AOV (bajo el total)</h4>${list(ins.rankings.worstAov, (r) => money(r.current.aov))}</div>
          </div></section>`),
        card('sg-chg', 'Qué cambió', 'Qué explica el cambio contra el periodo anterior y cómo viene el CR semana a semana.', `
          ${changesBlock(ins, { esc, money, pct })}
          ${trend ? trendBlock(trend, { esc, pct }) : ''}`),
        card('sg-oth', 'Ticket y clientes', 'Segmentos con ticket bajo y la diferencia entre clientes nuevos y recurrentes.', `
          ${lowAovBlock(ins, { esc, money, pct, F })}
          ${split ? splitBlock(split, { esc, money, pct }) : ''}`)
      ].join('\n')
    };
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

  const EFFECT = { traffic: 'Tráfico', cr: 'CR', aov: 'AOV' };
  const sMoney = (money, v) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v || 0));

  /** 5) Qué explica el cambio contra el periodo anterior: ganadores y perdedores con su descomposición tráfico → CR → AOV. */
  function changesBlock(ins, { esc, money, pct }) {
    const c = ins.changes;
    if (!c.hasBaseline) return '<section aria-labelledby="sg-c"><h3 class="panel__title" id="sg-c">Qué explica el cambio</h3><p class="field__hint">No hay datos del periodo anterior para comparar.</p></section>';
    const rowsOf = (list) => list.map((m) => `<tr><th scope="row">${esc(m.label)}${m.status === 'new' ? ' <span class="cell-sub">nuevo en este periodo</span>' : m.status === 'gone' ? ' <span class="cell-sub">ya no aparece</span>' : ''}</th>
        <td class="num">${sMoney(money, m.delta)}</td><td class="num">${m.weight != null ? pct(m.weight) : '—'}</td>
        ${m.effects ? ['traffic', 'cr', 'aov'].map((k) => `<td class="num">${sMoney(money, m.effects[k])}</td>`).join('') : '<td class="num">—</td><td class="num">—</td><td class="num">—</td>'}
        <td>${m.main ? esc(EFFECT[m.main]) : '—'}</td></tr>`).join('');
    const table = (list, label) => list.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="${esc(label)}">
        <thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Δ venta</th><th scope="col" class="num">Peso en los movimientos</th><th scope="col" class="num">Efecto tráfico</th><th scope="col" class="num">Efecto CR</th><th scope="col" class="num">Efecto AOV</th><th scope="col">Lo que más pesó</th></tr></thead>
        <tbody>${rowsOf(list)}</tbody></table></div>` : `<p class="field__hint">Sin ${label.toLowerCase()}.</p>`;
    return `<section aria-labelledby="sg-c"><h3 class="panel__title" id="sg-c">Qué explica el cambio</h3>
        <p class="field__hint">Cambio total de la venta contra el periodo anterior: <strong>${sMoney(money, c.total)}</strong>. Cada Δ se parte en tráfico, CR y AOV (en ese orden; la suma da el Δ). «Peso en los movimientos» = su parte de la suma de todos los cambios, con o sin signo.</p>
        <h4>Ganadores</h4>${table(c.winners, 'Ganadores')}
        <h4>Perdedores</h4>${table(c.losers, 'Perdedores')}</section>`;
  }

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

  function render(state) {
    const esc = H().esc, F = FP.format, C = FP.config;
    const recs = FP.dataStore.segmentIndex(state.store);          // vigentes + índice dimensión → fecha (en caché por firma de la colección)
    const dimsCfg = C.diagnostics.dimensions;
    const present = [...recs.byDim.keys()].filter(Boolean);
    // resultados recordados por (datos, parámetros): cambiar de dimensión o volver a una vista ya calculada no recorre nada
    const memo = (key, fn) => FP.dataStore.cached(state.store, key, ['segments'], fn);
    const dims = [...PREFERRED.filter((d) => present.includes(d)), ...present.filter((d) => !PREFERRED.includes(d))];
    const head = `<section class="panel" aria-labelledby="t-seg"><div class="panel__head"><div>
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
    const sg = state.seg || (state.seg = { dimension: null });
    if (!dims.includes(sg.dimension)) sg.dimension = dims[0];
    const s = state.dx.settings;
    const range = FP.app.periodRange(s.periodType, s.periodKey) || { from: `${state.year}-01-01`, to: `${state.year}-12-31` };
    const res = memo(`segsum|${range.from}|${range.to}|${s.channel}|${sg.dimension}`, () => summarize(recs, { from: range.from, to: range.to, channel: s.channel, dimension: sg.dimension }));
    const lbl = (d) => (dimsCfg[d] && dimsCfg[d].label) || d;
    const ins = FP.segmentInsights.analyze(res);
    const byKey = new Map(ins.rows.map((r) => [r.key, r]));
    const Q = FP.segmentInsights.QUADRANT;
    const pct = (v, d = 1) => (fin(v) ? `${(v * 100).toFixed(d)} %` : '—');
    // un cambio de cero se muestra sin signo («0.0 %»), no como «+0.0 %»
    const signedPct = (v) => (fin(v) ? `${Math.abs(v * 100) < 0.05 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %` : '—');
    const signedPp = (v) => (fin(v) ? `${Math.abs(v) < 0.005 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} pp` : '—');
    const money = (v) => F.currency(v || 0, 0);
    const signedMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + F.currency(Math.abs(v || 0), 0);
    const num = (a, k) => (a && a.has[k === 'traffic' ? 'traffic' : k] ? F.integer(a[k]) : '—');
    const dimSelect = `<div class="field"><label for="sg-dim" class="field__hint">Dimensión</label>
          <select id="sg-dim" data-action="seg-dim">${dims.map((d) => `<option value="${esc(d)}" ${d === sg.dimension ? 'selected' : ''}>${esc(lbl(d))}</option>`).join('')}</select></div>`;
    const disc = res.rows.length ? discovery(ins, { esc, money, pct, F, trend: (() => { const tk = ins.rows.filter((r) => r.relevant).sort((a, b) => b.current.traffic - a.current.traffic).slice(0, 5).map((r) => r.key); return memo(`segtrend|${range.to}|${s.channel}|${sg.dimension}|${tk.join('~')}`, () => weeklyTrend(recs, { to: range.to, channel: s.channel, dimension: sg.dimension, keys: tk })); })(), split: present.includes('customer_type') ? memo(`segsplit|${range.from}|${range.to}|${s.channel}`, () => FP.segmentInsights.customerSplit(summarize(recs, { from: range.from, to: range.to, channel: s.channel, dimension: 'customer_type' }))) : null }) : { nav: [], html: '' };
    const navAll = [...disc.nav, ['sg-table', 'Detalle por segmento']].filter((x, i, arr) => arr.findIndex((y) => y[0] === x[0]) === i);
    const navHtml = res.rows.length ? `<nav class="sgnav" aria-label="Ir a una sección"><span class="sgnav__lbl">Ir a</span>${navAll.map(([id, l]) => `<a class="btn btn--small" href="#${id}" data-sgjump="${id}">${esc(l)}</a>`).join('')}</nav>` : '';
    $('segments-view').innerHTML = `${head}
      <div class="panel__body stack">
        ${FP.narrativeView.contextControls(state, 'sg', 'dx-setting', 'dx-period-type', dimSelect)}
        <p class="field__hint">Periodo ${esc(res.period.from)} a ${esc(res.period.to)} contra ${esc(res.baseline.from)} a ${esc(res.baseline.to)} (periodo anterior de la misma duración: los segmentos no tienen plan). Periodo y canal son la misma selección de Diagnóstico.</p>
        ${res.rows.length ? kpiCards(ins, { money, pct, F }) : ''}
        ${navHtml}
      </div></section>
      ${disc.html}
      <section class="panel sgcard" id="sg-table" aria-labelledby="sg-tt"><div class="panel__head"><div>
        <h2 class="panel__title" id="sg-tt">Detalle por segmento</h2>
        <p class="panel__desc">Todos los segmentos de la dimensión elegida, con su cuadrante y su cambio contra el periodo anterior.</p></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table" aria-label="${esc(lbl(sg.dimension))}: tráfico y conversión por segmento">
        <thead><tr><th scope="col">${esc(lbl(sg.dimension))}</th><th scope="col">Cuadrante</th><th scope="col" class="num">Tráfico</th><th scope="col" class="num">% del tráfico</th><th scope="col" class="num">Δ tráfico</th>
          <th scope="col" class="num">Pedidos</th><th scope="col" class="num">CR</th><th scope="col" class="num">Δ CR</th><th scope="col" class="num">AOV</th><th scope="col" class="num">Venta</th><th scope="col" class="num">Δ venta</th></tr></thead>
        <tbody>${res.rows.length ? res.rows.map((r) => { const c = r.current;
          const x = byKey.get(r.key) || {}; const q = x.quadrant ? Q[x.quadrant] : null;
          return `<tr><th scope="row">${esc(r.label)}</th><td>${q ? `<span class="sgq sgq--${x.quadrant}">${esc(q.short)}</span>${x.conclusive === false ? '<span class="cell-sub">diferencia de CR no concluyente</span>' : ''}` : '—'}</td><td class="num">${num(c, 'traffic')}</td><td class="num">${pct(r.trafficShare)}</td><td class="num">${signedPct(r.trafficDeltaPct)}</td>
            <td class="num">${num(c, 'orders')}</td><td class="num">${c ? pct(c.cr, 2) : '—'}</td><td class="num">${signedPp(r.crDeltaPp)}</td>
            <td class="num">${c && fin(c.aov) ? money(c.aov) : '—'}</td><td class="num">${c && c.has.revenue ? money(c.revenue) : '—'}</td><td class="num">${signedMoney(r.revenueDelta)}</td></tr>`; }).join('')
          : `<tr><td colspan="11">${esc(emptyReason(recs, sg.dimension, res.period, s.channel, lbl(sg.dimension)))}</td></tr>`}</tbody>
      </table></div></div>
      <div class="panel__body"><p class="field__hint">Δ CR en puntos porcentuales (pp). WhatsApp y Llamadas no tienen datos por segmento (GA4 solo mide el sitio y la app): sus totales siguen en venta real y en las demás vistas. Los mismos datos alimentan el <a href="#diagnostico" data-nav="diagnostico">Nivel 2 del Diagnóstico</a>. También acepta el CSV exportado de GA4 tal cual: se convierte solo al cargarlo.</p></div>
    </section>`;
  }

  FP.segmentsView = { render, summarize, emptyReason };
})(typeof window !== 'undefined' ? window : globalThis);
