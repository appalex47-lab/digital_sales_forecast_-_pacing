/**
 * auditorDetectors.js — Fase 2 · Detectores del Auditor de Conversión.
 *
 * Sigue el embudo de GA4 por producto (vista → carrito → checkout → compra) y lo compara contra la mediana de su propia categoría.
 * Código determinista y SIN IA: `collect` lee el almacén de productos y los segmentos; `analyze` (puro, sin I/O) devuelve candidatos
 * con la misma forma que el Analista de Números (ver analistaDetectors.js) para usar la misma tarjeta y el mismo ejecutor.
 *
 * Reglas que no cambian:
 *  - Primero la confianza del dato (cuadre de compras GA4 contra unidades vendidas); si no cuadra, TODO lo demás baja de confianza y se dice primero.
 *  - Lenguaje no causal: «hipótesis a validar». Muestra chica = «muestra limitada», nunca un ranking firme.
 *  - «Dinero en la mesa» es un escenario ilustrativo (si el producto vendiera por vista lo que la mediana de su categoría): no es pronóstico ni meta.
 *  - Sin costo, margen ni rentabilidad por producto; sin inventario ni precios de la competencia (si importa se dice «revisar fuera de la herramienta»).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.agents.analista.fmt;

  /** Umbrales propuestos y aprobados en la maqueta. Un solo lugar para ajustarlos. */
  const LIMITS = {
    manyViews: 5000,       // «muchas vistas» en el mes
    fewViews: 400,         // «pocas vistas»: debajo de esto la tasa es débil (muestra limitada); desde aquí un producto cuenta como par de su categoría
    minViews: 50,          // debajo de esto ni siquiera se lista (ruido)
    minPeers: 5,           // pares mínimos para usar la mediana de la categoría; si no, se usa la mediana de todo el catálogo con funnel
    cartFactor: 0.5,       // demanda sin conversión: vista→carrito menor a la mitad de la mediana de su categoría
    convFactor: 2,         // conversión sin tráfico: vista→compra de al menos el doble de la mediana de su categoría
    minPurchasesLow: 3,    // compras mínimas para decir que un producto de pocas vistas «convierte bien»
    minChannelDen: 200,    // base mínima por paso para comparar web contra app
    channelRelGap: 0.15,   // diferencia relativa mínima entre web y app para señalarla (además de ser significativa al 95 %)
    topK: 20,              // productos con más venta por recuperar que se miran para decir cuál es el paso más flojo
    stepShare: 0.6,        // parte de esos productos que debe compartir el paso más flojo
    concShare: 0.6,        // concentración: se acumulan productos hasta cubrir este porcentaje de la fuga
    concMaxFrac: 0.2,      // …y se reporta si bastan menos de esta fracción de los productos con fuga
    concMinProducts: 10,   // productos con fuga mínimos para hablar de concentración
    gateOk: 0.10, gateWarn: 0.25,   // cuadre de GA4: dentro de ±10 % cuadra; hasta ±25 % hay avisos; más no cuadra
    mixMin: 0.0005,        // cambio mínimo del CR total (0.05 puntos) para hablar de mezcla
    mixShare: 0.7          // parte del cambio que debe venir de mezcla (o de conversión dentro) para llamarlo así
  };
  const STEPS = [
    { id: 'cart', label: 'Vista → carrito', num: 'cartNum', den: 'cartDen', owner: 'Catálogo / Contenido' },
    { id: 'chk', label: 'Carrito → checkout', num: 'chkNum', den: 'chkDen', owner: 'Producto / UX' },
    { id: 'buy', label: 'Checkout → compra', num: 'buyNum', den: 'buyDen', owner: 'Pagos / Operaciones' }
  ];
  // Los umbrales de volumen están pensados para un mes; con una semana o un año se escalan por los días del periodo (con pisos para que la muestra
  // siga siendo razonable). `LIM` y `PW` valen solo durante un `analyze` (síncrono) y vuelven al mes al terminar.
  const limitsFor = (days) => {
    if (!(days > 0)) return LIMITS;
    const k = days / 30;
    return Object.assign({}, LIMITS, { manyViews: Math.max(1000, Math.round(LIMITS.manyViews * k)), fewViews: Math.max(100, Math.round(LIMITS.fewViews * k)) });
  };
  const PERIOD_WORDS = {
    month: { en: 'en el mes', next: 'el siguiente mes', prevLabel: 'mes anterior (mismos días)' },
    week: { en: 'en la semana', next: 'la siguiente semana', prevLabel: 'semana anterior' },
    year: { en: 'en el año', next: 'el siguiente año', prevLabel: 'año anterior' }
  };
  let LIM = LIMITS, PW = PERIOD_WORDS.month;
  const rateOf = (num, den) => (fin(num) && fin(den) && den > 0 ? num / den : null);
  const stepRate = (row, s) => rateOf(row[s.num], row[s.den]);
  const bpv = (row) => (fin(row.purchases) && fin(row.views) && row.views > 0 ? row.purchases / row.views : null);   // compras GA4 por vista de ficha
  const fmtN = (n) => Math.round(n).toLocaleString('en-US');
  const median = (arr) => { const a = arr.filter(fin).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

  // ---------- Recolección (única parte con I/O) ----------
  function depsOf(o = {}) {
    return { store: o.store || FP.productStore, home: o.home || FP.homeSummaryEngine, range: o.range || ((t, k) => (FP.app && FP.app.periodRange ? FP.app.periodRange(t, k) : null)) };
  }
  const chLabel = (id) => { const c = ((FP.config && FP.config.channels) || []).find((x) => x.id === id); return c ? c.label : id; };
  const rowOf = (key, acc, cat) => ({
    sku: key, name: (cat && (cat.product || cat.sku)) || key, category: (cat && cat.category) || '(sin categoría)',
    views: acc.views, cart: acc.addToCart, chk: acc.beginCheckout, purchases: acc.purchasesGa4, units: acc.units, revenue: acc.revenue, orders: acc.orders,
    cartNum: acc.cartNum, cartDen: acc.cartDen, chkNum: acc.chkNum, chkDen: acc.chkDen, buyNum: acc.buyNum, buyDen: acc.buyDen, trkGa4: acc.trkGa4, trkUnits: acc.trkUnits, fcells: acc.fcells
  });

  /**
   * Lee el almacén de productos (IndexedDB) y los segmentos. Nunca lanza.
   * @returns {Promise<{status:'ok'|'no_data'|'sin_embudo'|'sin_mes', scope, skuRows, channels, total, mix, errors}>}
   */
  async function collect(state, opts = {}) {
    const deps = depsOf(opts.deps || {}), S = deps.store, errors = [];
    const none = (status, extra = {}) => ({ status, scope: null, skuRows: [], channels: [], total: null, mix: { status: 'no_segments', dims: [] }, errors, ...extra });
    const meta = S && S.meta;
    if (!S || !meta || !meta.dateMax || !meta.batches) return none('no_data');
    if (!(meta.funnelMetrics || []).length || !meta.funnelBatches) return none('sin_embudo');
    // Lo que la persona tiene elegido (año, mes o semana, y canal); sin selección usable, el mes de la última venta real.
    const A = FP.agents.analista, sel = A && A.selection ? A.selection(state) : null;
    const last = (state && state.fc && state.fc.lastActualDate) || meta.dateMax;
    const type = sel && sel.key ? sel.type : 'month', key = sel && sel.key ? sel.key : String(last).slice(0, 7), chosen = sel && sel.channel ? sel.channel : 'total';
    const r = deps.range(type, key);
    if (!r || !r.from) return none('no_data');
    if (meta.dateMax < r.from || (meta.dateMin && meta.dateMin > r.to)) return none('sin_mes', { dateMax: meta.dateMax, scope: { type, key } });
    const from = r.from, to = r.to < meta.dateMax ? r.to : meta.dateMax;
    const days = Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 864e5) + 1;
    const pw = PERIOD_WORDS[type] || PERIOD_WORDS.month;
    const scope = { type, key, from, to, days, channel: chosen, channelLabel: chosen === 'total' ? 'Total digital' : chLabel(chosen), label: A && A.periodLabel ? A.periodLabel(type, key, type === 'week' ? { weekStart: r.from, weekEnd: r.to } : null) : key, dateMax: meta.dateMax, compareLabel: pw.prevLabel };
    const out = { status: 'ok', scope, skuRows: [], channels: [], total: null, mix: { status: 'no_segments', dims: [] }, errors };
    try {
      const skus = await S.aggregate({ from, to, channel: chosen, groupBy: 'sku' });
      skus.forEach((acc, k) => { if (acc.fcells > 0 && acc.views > 0) out.skuRows.push(rowOf(k, acc, S.catalog.bySku.get(k) || null)); });
    } catch (e) { errors.push(`productos: ${e && e.message || e}`); }
    try {
      const tot = await S.aggregate({ from, to, channel: chosen, groupBy: 'total' });
      const acc = tot.get('Total');
      if (acc) out.total = { ...rowOf('Total', acc, null), skus: acc.skus.size };
    } catch (e) { errors.push(`total: ${e && e.message || e}`); }
    // Web contra app solo tiene sentido con el total digital: con un canal elegido no hay otro canal con quien comparar.
    for (const id of (chosen === 'total' ? (meta.channels || []) : [])) {
      try {
        const m = await S.aggregate({ from, to, channel: id, groupBy: 'total' }), acc = m.get('Total');
        if (acc && acc.fcells > 0) out.channels.push({ id, label: chLabel(id), ...rowOf('Total', acc, null) });
      } catch (e) { errors.push(`canal ${id}: ${e && e.message || e}`); }
    }
    try { out.mix = deps.home && deps.home.mixOf ? deps.home.mixOf(state, chosen, { type, key }) : out.mix; } catch (e) { errors.push(`mezcla: ${e && e.message || e}`); }
    if (!out.skuRows.length) out.status = 'sin_embudo';
    return out;
  }

  // ---------- Medianas de pares ----------
  /** Mediana por categoría de una métrica por producto (solo pares con muestra); si la categoría tiene pocos pares usa la de todo el catálogo. */
  function peerMedians(rows, fn) {
    const by = new Map(), all = [];
    rows.forEach((r) => { if (!(r.views >= LIM.fewViews)) return; const v = fn(r); if (!fin(v)) return; all.push(v); (by.get(r.category) || by.set(r.category, []).get(r.category)).push(v); });
    const global = median(all), cat = new Map();
    const mad = global === null ? null : median(all.map((v) => Math.abs(v - global)));
    by.forEach((a, k) => { cat.set(k, a.length >= LIM.minPeers ? { v: median(a), n: a.length, scope: 'category' } : { v: global, n: a.length, scope: 'global' }); });
    return { global, spread: mad === null ? null : 1.4826 * mad, of: (c) => cat.get(c) || (global === null ? null : { v: global, n: 0, scope: 'global' }) };
  }
  /** Venta teórica por recuperar de un producto si comprara por vista lo que la mediana de su categoría (compras GA4 × precio medio del producto). */
  function potentialOf(r, med) {
    const m = med && med.of(r.category); const own = bpv(r);
    if (!m || !fin(m.v) || own === null || !(r.units > 0) || !fin(r.revenue)) return 0;
    const price = r.revenue / r.units;
    return Math.max(0, r.views * (m.v - own)) * price;
  }

  const base = (id, detector, score, extra) => ({ id, agent: 'auditor', detector, score, prio: F().prioOf(score), fuente: 'Productos · embudo GA4', ...extra });

  // ---------- Detectores (puros) ----------
  /** C1 · Se ven mucho pero casi nadie los agrega al carrito. */
  function demandaSinConversion(d) {
    const f = F(), rows = d.skuRows, medCart = peerMedians(rows, (r) => rateOf(r.cartNum, r.cartDen)), medBpv = peerMedians(rows, bpv);
    const flagged = rows.filter((r) => {
      const c = rateOf(r.cartNum, r.cartDen), m = medCart.of(r.category);
      return r.views >= LIM.manyViews && c !== null && m && fin(m.v) && c < LIM.cartFactor * m.v;
    }).sort((a, b) => b.views - a.views);
    if (!flagged.length) return null;
    const pot = flagged.reduce((s, r) => s + potentialOf(r, medBpv), 0), totalRev = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const maxRate = Math.max(...flagged.map((r) => rateOf(r.cartNum, r.cartDen))), medOfMed = median(flagged.map((r) => (medCart.of(r.category) || {}).v));
    const score = f.clamp(40 + Math.min(25, flagged.length * 2) + (totalRev > 0 ? Math.min(25, pot / totalRev * 100 * 2) : 0));
    const top = flagged.slice(0, 3), n = flagged.length;
    return base('demanda_sin_conversion', 'Fuga en la ficha · mucha demanda, poco carrito', score, {
      owner: 'Catálogo / Contenido', tag: 'Demanda sin conversión',
      title: 'Se ven mucho, pero casi nadie los agrega al carrito',
      resumen: `${n} producto(s) con más de ${fmtN(LIM.manyViews)} vistas ${PW.en} agregan al carrito menos de la mitad que la mediana de su categoría.`,
      que: `Hasta ${f.pct(maxRate)} de vista→carrito, contra una mediana de categoría de alrededor de ${f.pct(medOfMed)}.${pot > 0 ? ` Potencial teórico ilustrativo: ≈ ${f.money(pot)} ${PW.en}.` : ''}`,
      big: { value: `${n} ${n === 1 ? 'producto' : 'productos'}`, tone: 'dn', sub: `con más de ${fmtN(LIM.manyViews)} vistas y vista→carrito de hasta ${f.pct(maxRate)} (mediana de su categoría: ${f.pct(medOfMed)})` },
      visual: { type: 'table', head: ['Producto', 'Vistas', '→ Carrito', 'Mediana cat.'], num: [1, 2, 3], rows: top.map((r) => [r.name, fmtN(r.views), f.pct(rateOf(r.cartNum, r.cartDen)), f.pct((medCart.of(r.category) || {}).v)]) },
      nota: pot > 0 ? `Potencial teórico ilustrativo: si estos ${n} vendieran por vista lo que la mediana de su categoría serían ≈ ${f.money(pot)} más ${PW.en}. No es un pronóstico ni una meta.` : null,
      hipotesis: 'El interés existe, pero algo de la ficha frena el paso a carrito: precio visible, disponibilidad, receta o información de presentación. Es una hipótesis a validar, no una causa.',
      validar: `Revisa estas fichas contra las mejores de su categoría; en GA4 compara Android, iOS y web (si solo cae en una plataforma, es un tema técnico).`,
      accion: `Auditar las ${Math.min(3, n)} fichas de arriba y corregir lo evidente. Responsable natural: Catálogo / Contenido.`,
      evid: [{ k: 'Productos señalados', v: String(n) }, { k: 'Umbral de «muchas vistas»', v: `${fmtN(LIM.manyViews)} ${PW.en}` }, { k: 'Vista→carrito máxima de los señalados', v: f.pct(maxRate) }, { k: 'Mediana de categoría (típica)', v: f.pct(medOfMed) }, ...(pot > 0 ? [{ k: 'Potencial teórico ilustrativo', v: f.money(pot) }] : [])],
      pregunta: '¿Qué tienen en común las fichas de los productos con más vistas y menos carrito?',
      limites: 'No hay inventario ni precios de la competencia en los datos: si la fuga viene de falta de abasto o precio, hay que verlo fuera de la herramienta. El potencial es un escenario, no un pronóstico.',
      view: 'producto', viewLabel: 'Productos', facts: { n, maxRate, medOfMed, potential: pot }
    });
  }

  /** C2 · Convierten bien, pero casi no se ven. */
  function conversionSinTrafico(d) {
    const f = F(), rows = d.skuRows, med = peerMedians(rows, bpv);
    const flagged = rows.filter((r) => {
      const v = bpv(r), m = med.of(r.category);
      return r.views >= LIM.minViews && r.views < LIM.fewViews && r.purchases >= LIM.minPurchasesLow && v !== null && m && fin(m.v) && m.v > 0 && v >= LIM.convFactor * m.v;
    }).sort((a, b) => bpv(b) - bpv(a));
    if (!flagged.length) return null;
    const n = flagged.length, top = flagged.slice(0, 3), best = bpv(flagged[0]);
    const score = f.clamp(25 + Math.min(20, n * 3));
    return base('conversion_sin_trafico', 'Visibilidad · convierte bien con pocas vistas', score, {
      owner: 'Comercial', tag: 'Conversión sin tráfico', muestraLimitada: true,
      title: 'Convierten bien, pero casi no se ven',
      resumen: `${n} producto(s) con menos de ${fmtN(LIM.fewViews)} vistas ${PW.en} compran al menos el doble por vista que la mediana de su categoría.`,
      que: `El mejor llega a ${f.pct(best)} de vista→compra. Con tan pocas vistas la tasa es débil: es muestra limitada y se confirma con ${PW.next}.`,
      big: { value: `${n} ${n === 1 ? 'producto' : 'productos'}`, tone: '', sub: `con menos de ${fmtN(LIM.fewViews)} vistas y vista→compra de hasta ${f.pct(best)} (al menos el doble de su categoría)` },
      visual: { type: 'table', head: ['Producto', 'Vistas', '→ Compra'], num: [1, 2], rows: top.map((r) => [r.name, fmtN(r.views), f.pct(bpv(r))]) },
      hipotesis: 'Poca visibilidad: quizá no aparecen en la búsqueda interna, en el home o en banners. Es una hipótesis a validar, no una causa.',
      validar: 'Revisa dónde aparecen estos productos en el sitio y la app (búsqueda interna, categoría, banners).',
      accion: 'Probar posicionarlos en la búsqueda interna y en un banner de categoría. Responsable natural: Comercial con Marketing.',
      evid: [{ k: 'Productos señalados', v: String(n) }, { k: 'Umbral de «pocas vistas»', v: `menos de ${fmtN(LIM.fewViews)} ${PW.en}` }, { k: 'Mejor vista→compra', v: f.pct(best) }],
      pregunta: '¿Estos productos aparecen en la búsqueda interna y en la navegación de su categoría?',
      limites: `Muestra limitada: con menos de ${fmtN(LIM.fewViews)} vistas la tasa es débil y puede ser azar. No es un ranking firme.`,
      view: 'producto', viewLabel: 'Productos', facts: { n, best }
    });
  }

  /** C3 · Brecha entre web y app: en qué paso del embudo se abre. */
  function brechaWebApp(d) {
    const f = F(), web = d.channels.find((c) => c.id === 'ecommerce'), app = d.channels.find((c) => c.id === 'app');
    if (!web || !app) return null;
    const crTest = FP.trafficConversionEngine && FP.trafficConversionEngine.crTest;
    const rows = STEPS.map((s) => {
      const a = stepRate(web, s), b = stepRate(app, s);
      if (a === null || b === null || web[s.den] < LIM.minChannelDen || app[s.den] < LIM.minChannelDen) return { s, a, b, ok: false };
      const z = crTest ? crTest({ t: web[s.den], o: web[s.num] }, { t: app[s.den], o: app[s.num] }) : { significant: null };
      const rel = Math.abs(a - b) / Math.max(a, b);
      return { s, a, b, ok: true, gap: a - b, rel, significant: z.significant === true };
    });
    const cand = rows.filter((r) => r.ok && r.significant && r.rel >= LIM.channelRelGap).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
    if (!cand.length) return null;
    const m = cand[0], worse = m.gap > 0 ? app : web, better = m.gap > 0 ? web : app, pp = Math.abs(m.gap) * 100;
    const score = f.clamp(45 + Math.min(30, m.rel * 100 * 0.8));
    const vis = rows.filter((r) => r.a !== null && r.b !== null).map((r) => ({ label: r.s.label, aText: `${web.label} ${f.pct(r.a)}`, bText: `${app.label} ${f.pct(r.b)}`, pct: Math.round(Math.min(r.a, r.b) / Math.max(r.a, r.b) * 100), low: r === m }));
    const owner = m.s.id === 'cart' ? 'Catálogo / Contenido' : 'Producto / UX';
    return base('brecha_web_app', 'Embudo por canal · web contra app', score, {
      owner, tag: 'Fuga por paso',
      title: `${worse.label} pierde más que ${better.label} entre ${m.s.label.toLowerCase()}`,
      resumen: `La brecha entre ${web.label} y ${app.label} se abre en ${m.s.label.toLowerCase()} (${pp.toFixed(0)} puntos): ${web.label} ${f.pct(m.a)} y ${app.label} ${f.pct(m.b)}; en los otros pasos se parecen más.`,
      que: `Diferencia significativa al 95% en ${m.s.label.toLowerCase()}; solo se comparan pasos con al menos ${fmtN(LIM.minChannelDen)} casos por canal.`,
      big: { value: `${pp.toFixed(0)} puntos`, tone: 'dn', sub: `de diferencia en ${m.s.label.toLowerCase()} entre ${web.label} y ${app.label}` },
      visual: { type: 'steps', rows: vis },
      hipotesis: m.s.id === 'chk' ? 'El costo total (envío, ticket mínimo) se ve distinto o más tarde en uno de los dos, o hay fricción para iniciar sesión al pasar a checkout. Es una hipótesis a validar, no una causa.'
        : m.s.id === 'cart' ? 'La ficha se ve o se comporta distinto entre web y app (fotos, precio, botón de agregar). Es una hipótesis a validar, no una causa.'
          : 'El pago se completa distinto en uno de los dos (métodos disponibles, validaciones, errores). Es una hipótesis a validar, no una causa.',
      validar: m.s.id === 'chk' ? `Recorre el flujo en ${worse.label} con un carrito de ticket bajo y uno alto; compara el momento en que aparece el envío.` : `Recorre el paso de ${m.s.label.toLowerCase()} en ${worse.label} y en ${better.label} con el mismo producto.`,
      accion: `Revisar ${m.s.label.toLowerCase()} en ${worse.label}. Responsable natural: ${owner}.`,
      evid: rows.filter((r) => r.a !== null && r.b !== null).flatMap((r) => [{ k: `${r.s.label}: ${web.label}`, v: f.pct(r.a) }, { k: `${r.s.label}: ${app.label}`, v: f.pct(r.b) }]),
      pregunta: `¿Qué es distinto entre ${web.label} y ${app.label} en ${m.s.label.toLowerCase()}?`,
      limites: 'El embudo es de GA4 y no mide cómo se ve el flujo ni por qué se abandona. Web y app pueden tener públicos distintos.',
      view: 'segmentos', viewLabel: 'Tráfico y conversión', facts: { gapPp: pp, web: m.a, app: m.b }
    });
  }

  /** C4 · Cuántos productos explican la fuga. */
  function concentracionFuga(d) {
    const f = F(), rows = d.skuRows, med = peerMedians(rows, bpv);
    const list = rows.filter((r) => r.views >= LIM.fewViews).map((r) => ({ r, p: potentialOf(r, med) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
    if (list.length < LIM.concMinProducts) return null;
    const total = list.reduce((s, x) => s + x.p, 0); let acc = 0, n = 0;
    for (const x of list) { acc += x.p; n++; if (acc >= LIM.concShare * total) break; }
    if (n > Math.max(3, Math.floor(LIM.concMaxFrac * list.length))) return null;
    const share = acc / total, score = f.clamp(35 + (1 - n / list.length) * 20);
    return base('concentracion_fuga', 'Concentración de la fuga', score, {
      owner: 'Catálogo / Contenido', tag: 'Dónde se concentra',
      title: `${n} productos explican ${Math.round(share * 100)}% de la fuga`,
      resumen: `De ${fmtN(rows.length)} productos con embudo, la fuga hasta la mediana de su categoría se concentra en muy pocos (${n} de ${list.length} con fuga): empezar por ellos rinde más que revisar todo el catálogo.`,
      que: `Los ${n} primeros suman ≈ ${f.money(acc)} de ${f.money(total)} de venta teórica por recuperar. Es un escenario ilustrativo, no un pronóstico.`,
      visual: { type: 'table', head: ['Producto', 'Por recuperar'], num: [1], rows: list.slice(0, 5).map((x) => [x.r.name, f.money(x.p)]) },
      hipotesis: 'Pocas fichas concentran casi toda la oportunidad; el resto del catálogo se comporta cerca de su categoría. Es una hipótesis a validar.',
      validar: 'Abre la lista completa en Productos y revisa primero esos productos.',
      accion: `Empezar la auditoría de fichas por los ${Math.min(n, 5)} primeros de la lista. Responsable natural: Catálogo / Contenido.`,
      evid: [{ k: 'Productos que explican la fuga', v: String(n) }, { k: 'Parte de la fuga que explican', v: f.pct(share, 0) }, { k: 'Productos con fuga', v: String(list.length) }, { k: 'Venta teórica por recuperar (total)', v: f.money(total) }],
      pregunta: '¿Cuáles de estos productos tienen en común categoría, precio o presentación?',
      limites: 'Escenario ilustrativo: si cada producto comprara por vista lo que la mediana de su categoría. No considera abasto, precio ni estacionalidad.',
      view: 'producto', viewLabel: 'Productos', facts: { n, share, total, products: list.length }
    });
  }

  /** C5 · Fuga por paso entre los productos con más venta por recuperar. */
  function fugaPorPaso(d) {
    const f = F(), rows = d.skuRows, med = peerMedians(rows, bpv);
    const meds = STEPS.map((s) => ({ s, m: peerMedians(rows, (r) => stepRate(r, s)) }));
    const list = rows.filter((r) => r.views >= LIM.fewViews).map((r) => ({ r, p: potentialOf(r, med) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, LIM.topK);
    if (list.length < 5) return null;
    const count = { cart: 0, chk: 0, buy: 0 }; let used = 0;
    list.forEach((x) => {
      let worst = null;
      // «Más flojo» = el paso que más se aleja hacia abajo de la mediana de su categoría, medido en desviaciones típicas robustas de ESE paso
      // (sin esto ganaría siempre el paso con más dispersión natural, no el que de verdad está peor).
      meds.forEach(({ s, m }) => { const a = stepRate(x.r, s), mm = m.of(x.r.category); if (a === null || !mm || !(mm.v > 0) || !(m.spread > 0)) return; const z = (a - mm.v) / m.spread; if (!worst || z < worst.z) worst = { id: s.id, z }; });
      if (worst) { count[worst.id]++; used++; }
    });
    if (used < 5) return null;
    const top = STEPS.map((s) => ({ s, n: count[s.id] })).sort((a, b) => b.n - a.n)[0];
    if (top.n / used < LIM.stepShare) return null;
    const score = f.clamp(40 + (top.n / used - LIM.stepShare) * 50 + 10);
    return base('fuga_por_paso', 'Fuga por paso · productos con más por recuperar', score, {
      owner: top.s.owner, tag: 'Fuga por paso',
      title: `${top.n === used ? `En los ${used}` : `En ${top.n} de los ${used}`} productos con más venta por recuperar, el paso más flojo es ${top.s.label.toLowerCase()}`,
      resumen: `Entre los ${used} productos con más venta teórica por recuperar, ${top.n} tienen su peor resultado frente a su categoría en ${top.s.label.toLowerCase()}.`,
      que: 'Para cada producto se compara cada paso del embudo contra la mediana de su categoría y se toma el que más se aleja hacia abajo.',
      visual: { type: 'bars', rows: STEPS.map((s) => ({ label: s.label, value: count[s.id], text: `${count[s.id]} de ${used}` })) },
      hipotesis: top.s.id === 'cart' ? 'El problema suele estar en la ficha: información, precio visible o disponibilidad. Es una hipótesis a validar, no una causa.' : top.s.id === 'chk' ? 'El problema suele estar al pasar del carrito al pago (costos visibles, inicio de sesión). Es una hipótesis a validar, no una causa.' : 'El problema suele estar al completar el pago (métodos, validaciones). Es una hipótesis a validar, no una causa.',
      validar: `Revisa ${top.s.label.toLowerCase()} en los 3 primeros productos de la lista de Productos.`,
      accion: `Priorizar la revisión de ${top.s.label.toLowerCase()}. Responsable natural: ${top.s.owner}.`,
      evid: STEPS.map((s) => ({ k: `Productos con ${s.label.toLowerCase()} como paso más flojo`, v: String(count[s.id]) })),
      pregunta: `¿Qué tiene de distinto ${top.s.label.toLowerCase()} en estos productos?`,
      limites: 'Compara cada producto contra la mediana de su categoría; no mide por qué el paso es más flojo.',
      view: 'producto', viewLabel: 'Productos', facts: { top: top.n, used }
    });
  }

  /** C6 · El CR total cambió: mezcla de tráfico o conversión dentro de las fuentes. */
  function mezclaTrafico(d) {
    const f = F(), dims = (d.mix && d.mix.dims) || [];
    const ok = dims.filter((x) => x.mix && fin(x.mix.delta) && Math.abs(x.mix.delta) >= LIM.mixMin).sort((a, b) => Math.abs(b.mix.delta) - Math.abs(a.mix.delta));
    if (!ok.length) return null;
    const x = ok[0], m = x.mix, dir = m.delta < 0 ? 'bajó' : 'subió', pp = Math.abs(m.delta) * 100;
    const mixShare = Math.abs(m.mix) / Math.abs(m.delta), inShare = Math.abs(m.within) / Math.abs(m.delta);
    const byMix = mixShare >= LIM.mixShare && Math.sign(m.mix) === Math.sign(m.delta), byConv = inShare >= LIM.mixShare && Math.sign(m.within) === Math.sign(m.delta);
    const evid = [{ k: 'CR total del periodo anterior', v: f.pct(m.cr0, 2) }, { k: 'CR total del periodo', v: f.pct(m.cr1, 2) }, { k: 'Cambio del CR total', v: `${m.delta < 0 ? '−' : '+'}${pp.toFixed(2)} pp` },
      { k: 'De ese cambio, por mezcla de tráfico', v: `${m.mix < 0 ? '−' : '+'}${(Math.abs(m.mix) * 100).toFixed(2)} pp` }, { k: 'De ese cambio, dentro de cada fuente', v: `${m.within < 0 ? '−' : '+'}${(Math.abs(m.within) * 100).toFixed(2)} pp` }];
    const common = { owner: byConv ? 'Producto / UX' : 'Marketing', view: 'segmentos', viewLabel: 'Tráfico y conversión', fuente: `Tráfico y conversión · por ${x.dimensionLabel.toLowerCase()}`, evid, facts: { delta: m.delta, mix: m.mix, within: m.within } };
    if (byMix) {
      const score = 20;
      return base('mezcla_trafico', 'Mezcla de tráfico · CR total', score, {
        ...common, tag: 'Mezcla de tráfico', sinAlerta: true,
        title: `El CR total ${dir} ${pp.toFixed(1)} pp por mezcla, no por conversión`,
        resumen: `Cambió el peso de cada ${x.dimensionLabel.toLowerCase()} en el tráfico. Dentro de cada una, la conversión casi no se movió: no hay un problema de ficha o checkout detrás de este cambio del CR total.`,
        que: 'Se separa el efecto mezcla (cambió el peso de cada fuente) del efecto dentro de las fuentes (cambió el CR de cada una). Solo se usan segmentos con volumen suficiente.',
        hipotesis: 'El tráfico nuevo llega de fuentes que convierten distinto; el CR total se mueve aunque cada fuente se comporte igual. A validar.',
        validar: `Mira en Tráfico y conversión el peso de cada ${x.dimensionLabel.toLowerCase()} contra el periodo anterior.`,
        accion: 'Sin acción urgente en el sitio. Si la mezcla no era la esperada, Marketing revisa de dónde viene el tráfico adicional.',
        pregunta: 'La mezcla de tráfico, ¿es la que buscaba la estrategia de adquisición?', limites: 'Describe el reparto aritmético del cambio; no dice por qué cambió la mezcla.'
      });
    }
    if (byConv) {
      const sig = (x.significant || []).map((s) => s.label);
      const score = f.clamp(45 + Math.min(30, pp * 20));
      return base('mezcla_trafico', 'Mezcla de tráfico · CR total', score, {
        ...common, tag: 'Conversión dentro de las fuentes',
        title: `El CR total ${dir} ${pp.toFixed(1)} pp porque cambió la conversión dentro de las fuentes`,
        resumen: `La mezcla de tráfico explica poco; casi todo el cambio viene de que cada ${x.dimensionLabel.toLowerCase()} convierte distinto que antes${sig.length ? ` (diferencia significativa en ${sig.join(', ')})` : ''}.`,
        que: 'Se separa el efecto mezcla del efecto dentro de las fuentes; aquí pesa el segundo.',
        hipotesis: 'Algo cambió en la experiencia de compra de esas fuentes (ficha, checkout, oferta de entrada). Es una hipótesis a validar, no una causa.',
        validar: 'Abre Tráfico y conversión y mira en qué fuentes cambió el CR y desde qué fecha.',
        accion: 'Revisar la experiencia de compra de las fuentes señaladas. Responsable natural: Producto / UX.',
        pregunta: '¿Desde qué fecha cambió la conversión de esas fuentes?', limites: 'Describe dónde cambió la conversión; no por qué.'
      });
    }
    const score = 30;
    return base('mezcla_trafico', 'Mezcla de tráfico · CR total', score, {
      ...common, tag: 'Mezcla de tráfico',
      title: `El CR total ${dir} ${pp.toFixed(1)} pp: pesan parecido la mezcla y la conversión`,
      resumen: `El cambio del CR total se reparte entre el peso de cada ${x.dimensionLabel.toLowerCase()} y su conversión interna; ninguno explica por sí solo la mayor parte.`,
      que: 'Cuando los dos efectos pesan parecido, conviene mirar fuente por fuente antes de actuar.',
      hipotesis: 'Cambió tanto el tráfico que llega como la forma en que convierte. A validar.', validar: 'Abre Tráfico y conversión y compara fuente por fuente.',
      accion: 'Revisar fuente por fuente en Tráfico y conversión. Responsable natural: Marketing.', pregunta: '¿Qué fuentes cambiaron más en peso y en conversión?', limites: 'Es un reparto aritmético, no una causa.'
    });
  }

  // ---------- Confianza: cuadre de GA4 contra la venta ----------
  /** Compras GA4 ÷ unidades vendidas en los mismos productos y días. null si no hay base. */
  function cuadreGa4(d) {
    const f = F(), t = d.total;
    if (!t || !(t.trkUnits > 0) || !fin(t.trkGa4)) return { level: 'unknown', title: 'No puedo verificar el cuadre de GA4', text: 'Falta venta en unidades o compras de GA4 en los mismos productos y días, así que no sé si el embudo cuadra con tu venta. Lee el resto como dirección, no como cifra.', ratio: null };
    const ratio = t.trkGa4 / t.trkUnits, off = Math.abs(1 - ratio);
    const per = `GA4 registra ${Math.round(ratio * 100)} compras por cada 100 unidades que vendiste (${f.pct(ratio, 0)}).`;
    if (off <= LIM.gateOk) return { level: 'ok', title: 'GA4 cuadra con tu venta', text: `${per} Está dentro de ±${Math.round(LIM.gateOk * 100)}%, así que el embudo es una base confiable.`, ratio };
    if (off <= LIM.gateWarn) return { level: 'warn', title: 'GA4 cuadra con avisos', text: `${per} La diferencia está entre ${Math.round(LIM.gateOk * 100)}% y ${Math.round(LIM.gateWarn * 100)}%: lee el embudo con cuidado y revisa el etiquetado de GA4.`, ratio };
    return { level: 'low', title: 'GA4 no cuadra con tu venta', text: `${per} La diferencia pasa de ${Math.round(LIM.gateWarn * 100)}%: el embudo puede estar ${ratio < 1 ? 'perdiendo compras' : 'contando de más'}. Todo lo de abajo baja de confianza: úsalo como dirección, no como cifra.`, ratio };
  }

  const DETECTORS = [demandaSinConversion, fugaPorPaso, brechaWebApp, conversionSinTrafico, concentracionFuga, mezclaTrafico];

  /** Puro: de los datos recolectados a hallazgos. Un detector que falla se omite y se reporta en `errors`. */
  function analyze(data) {
    const gate = data && data.status === 'ok' ? cuadreGa4(data) : null;
    if (!data || data.status !== 'ok') return { status: (data && data.status) || 'no_data', scope: data ? data.scope : null, gate, findings: [], errors: data ? data.errors || [] : [], detectors: DETECTORS.length, dateMax: data && data.dateMax };
    const findings = [], errors = [...(data.errors || [])];
    LIM = limitsFor(data.scope && data.scope.days); PW = PERIOD_WORDS[(data.scope && data.scope.type) || 'month'] || PERIOD_WORDS.month;
    try { DETECTORS.forEach((fn) => { try { const x = fn(data); if (x) findings.push(x); } catch (e) { errors.push(`${fn.name}: ${e && e.message || e}`); } }); } finally { LIM = LIMITS; PW = PERIOD_WORDS.month; }
    findings.sort((a, b) => b.score - a.score);
    if (gate.level === 'low' || gate.level === 'unknown') findings.forEach((x) => { x.confianza = 'baja'; x.limites = `${x.limites} GA4 no cuadra con tu venta (o no se pudo verificar): léelo como dirección, no como cifra.`; });
    const sc = data.scope;
    return { status: 'ok', scope: { channel: sc.channel || 'total', channelLabel: sc.channelLabel || 'Total digital', period: { type: sc.type || 'month', key: sc.key }, label: sc.label || null, lastActual: sc.dateMax, from: sc.from, to: sc.to, compareLabel: sc.compareLabel, funnelSkus: data.skuRows.length }, gate, findings, errors, detectors: DETECTORS.length };
  }

  async function detect(state, opts = {}) { return analyze(await collect(state, opts)); }

  FP.agents.auditor = { detect, collect, analyze, cuadreGa4, limitsFor, LIMITS, STEPS, _peerMedians: peerMedians, _potentialOf: potentialOf };
})(typeof window !== 'undefined' ? window : globalThis);
