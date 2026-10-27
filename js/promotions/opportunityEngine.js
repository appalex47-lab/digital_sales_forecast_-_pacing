/**
 * opportunityEngine.js — Oportunidades del canal digital (propuesta B, etapa PRE).
 *
 * Lee la comparación por SKU que ya calcula FP.productAnalysis (periodo actual contra periodo de referencia) y asigna a cada SKU
 * uno o más TIPOS de oportunidad con reglas explícitas. No usa puntaje, no estima efecto de una promoción, no inventa precios ni
 * descuentos: lo que falta para decidir (precio promocional, mecánica, apoyo del laboratorio, disponibilidad) lo aportan Comercial
 * o Precios y se lista fila por fila. La venta alta sola nunca propone descuento: aparece como «sostener o proteger».
 *
 *   analyze(rows, ctx) → { items: [oportunidad], counts, categories, notes }
 *   rows = filas de FP.productAnalysis.run(level: 'sku'): { key, status, current, baseline, revenue: { current, baseline, deltaPct } }
 *   ctx  = { catalog: (sku) => { product, productCode, category, brand } | null, settings, offers: [{ offerId, sku, discount, state }] }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const SETTINGS = {
    minViews: 30,          // vistas mínimas de ficha para que la conversión de un SKU cuente
    minGroup: 5,           // SKU mínimos con conversión confiable en una categoría para calcular medianas
    trendPct: 0.15,        // cambio de venta/unidades contra el periodo de referencia que se considera «subir» o «bajar»
    weightShare: 0.2,      // participación en la venta de su categoría desde la que se considera «peso alto»
    evidenceDays: 60,      // días con venta (periodo actual + referencia) para evidencia completa
    evidenceCoverage: 0.8  // cobertura mínima del funnel (el mínimo que ya usa availability.js)
  };

  const TYPES = {
    unconverted: { label: 'Demanda no convertida', objective: 'Captar demanda que no convertimos', warning: 'No prueba que el precio sea la causa: primero revisar ficha y disponibilidad.' },
    lowVisibility: { label: 'Visibilidad baja', objective: 'Mejorar visibilidad', warning: 'Pocas vistas pueden ser falta de tráfico o de ubicación; no hay datos de ubicación.' },
    growing: { label: 'En crecimiento', objective: 'Aprovechar la tendencia', warning: 'Puede ser efecto de una promoción anterior.' },
    declining: { label: 'En caída', objective: 'Recuperar', warning: 'Sin inventario no se puede descartar un quiebre de stock.' },
    highWeight: { label: 'Peso alto en su categoría', objective: 'Sostener o proteger', warning: 'Descontar aquí solo con acuerdo del laboratorio.' }
  };
  /**
   * «Qué hacer» con cada SKU: una sola salida, por reglas escritas (sin puntaje).
   * Revisar causa: su venta cae. Pedir oferta: demanda no convertida y todavía sin oferta recibida. Sostener: pesa mucho en su categoría.
   * Exponer: el resto (poca visibilidad, crecimiento, o demanda no convertida que ya tiene oferta recibida).
   */
  const ROUTES = {
    review: { label: 'Revisar causa', hint: 'Su venta cae: entender por qué antes de actuar' },
    ask: { label: 'Pedir oferta', hint: 'Demanda que no convertimos y sin oferta recibida' },
    protect: { label: 'Sostener o proteger', hint: 'Pesa mucho en su categoría: descontar solo con acuerdo del laboratorio' },
    expose: { label: 'Exponer', hint: 'Darle más lugar en el sitio o la app, con o sin descuento' }
  };
  const ROUTE_ORDER = ['expose', 'ask', 'protect', 'review'];
  function routeOf(types, hasOffer) {
    const ids = new Set((types || []).map((t) => t.id));
    if (ids.has('declining')) return { id: 'review', why: 'Su venta cae con vistas estables: revisar ficha, precio de la competencia y disponibilidad antes de pedir o exponer.' };
    if (ids.has('unconverted')) return hasOffer ? { id: 'expose', why: 'Tiene demanda sin convertir y ya hay una oferta recibida: se puede exponer con ella.' } : { id: 'ask', why: 'Tiene demanda sin convertir y no hay oferta recibida: conviene pedir una a Comercial.' };
    if (ids.has('highWeight')) return { id: 'protect', why: 'Pesa mucho en su categoría: sostenerlo y no descontar sin acuerdo del laboratorio.' };
    return { id: 'expose', why: ids.has('lowVisibility') ? 'Convierte bien pero pocos lo ven: darle más lugar.' : 'Crece: aprovechar la tendencia dándole lugar.' };
  }
  const MISSING = ['Precio promocional', 'Mecánica negociable', 'Apoyo del laboratorio', 'Disponibilidad'];

  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const val = (x, m) => (x && x[m] && fin(x[m].value) ? x[m].value : null);
  const cov = (x, m) => (x && x[m] && fin(x[m].coverage) ? x[m].coverage : null);
  const pct = (v) => (fin(v) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : 's/d');
  const int = (v) => (fin(v) ? Math.round(v).toLocaleString('es-MX') : 's/d');
  const money = (v) => (fin(v) ? Math.round(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : 's/d');
  const change = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b - 1 : null);
  function median(list) {
    const a = list.filter(fin).sort((x, y) => x - y); if (!a.length) return null;
    const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function analyze(rows, ctx) {
    const c = ctx || {};
    const S = Object.assign({}, SETTINGS, c.settings || {});
    const cat = typeof c.catalog === 'function' ? c.catalog : () => null;
    const offersBySku = new Map();
    (c.offers || []).forEach((o) => { if (o.state === 'discarded') return; if (!offersBySku.has(o.sku)) offersBySku.set(o.sku, []); offersBySku.get(o.sku).push(o); });

    // 1. Datos por SKU
    const recs = (rows || []).map((r) => {
      const meta = cat(r.key) || {};
      const cur = r.current, base = r.baseline;
      const hasFunnel = !!(cur && cur.views && cur.views.status !== 'unavailable' && val(cur, 'views') !== null);
      return {
        sku: r.key, productCode: meta.productCode || '', name: meta.product || r.key, category: meta.category || '(sin categoría)', subcategory: meta.subcategory || '', brand: meta.brand || '',
        status: r.status, isNew: r.status === 'new' || !base,
        revenue: val(cur, 'revenue'), revenueBase: val(base, 'revenue'), revenueDeltaPct: r.revenue ? r.revenue.deltaPct : null,
        units: val(cur, 'units'), unitsBase: val(base, 'units'), orders: val(cur, 'orders'),
        views: val(cur, 'views'), viewsBase: val(base, 'views'), conv: val(cur, 'conversionRate'), aov: val(cur, 'aov'),
        hasFunnel, viewsCoverage: cov(cur, 'views'),
        days: (cur ? cur.days || 0 : 0) + (base ? base.days || 0 : 0),
        excluded: ['revenue', 'orders', 'units', 'views'].reduce((a, m) => a + ((cur && cur[m] && cur[m].excluded) || 0) + ((base && base[m] && base[m].excluded) || 0), 0)
      };
    });

    // 2. Medianas por categoría (solo SKU con vistas suficientes y conversión calculable)
    const byCat = new Map();
    recs.forEach((x) => { if (!byCat.has(x.category)) byCat.set(x.category, []); byCat.get(x.category).push(x); });
    const catInfo = new Map();
    byCat.forEach((list, k) => {
      const reliable = list.filter((x) => x.hasFunnel && fin(x.views) && x.views >= S.minViews && fin(x.conv));
      const total = list.reduce((a, x) => a + (x.revenue || 0), 0);
      catInfo.set(k, { skus: list.length, reliable: reliable.length, ok: reliable.length >= S.minGroup,
        medViews: reliable.length >= S.minGroup ? median(reliable.map((x) => x.views)) : null, medConv: reliable.length >= S.minGroup ? median(reliable.map((x) => x.conv)) : null, revenue: total });
    });

    // 3. Tipos
    const items = [], profiles = new Map();
    recs.forEach((x) => {
      const ci = catInfo.get(x.category), types = [];
      const add = (id, reason) => types.push(Object.assign({ id }, TYPES[id], { reason }));
      if (x.hasFunnel && fin(x.views) && x.views >= S.minViews && fin(x.conv) && ci.ok) {
        if (x.views >= ci.medViews && x.conv < ci.medConv) add('unconverted', `${int(x.views)} vistas de ficha (mediana de su categoría: ${int(ci.medViews)}) y conversión de ${pct(x.conv)} contra ${pct(ci.medConv)} de la mediana.`);
        else if (x.views < ci.medViews && x.conv >= ci.medConv) add('lowVisibility', `${int(x.views)} vistas de ficha contra ${int(ci.medViews)} de la mediana de su categoría, con conversión de ${pct(x.conv)} (mediana: ${pct(ci.medConv)}).`);
      }
      if (!x.isNew && fin(x.revenueDeltaPct)) {
        const uPct = change(x.units, x.unitsBase);
        if (x.revenueDeltaPct >= S.trendPct && (uPct === null || uPct >= S.trendPct)) add('growing', `Venta ${pct(x.revenueDeltaPct)} contra el periodo de referencia${uPct !== null ? ` y unidades ${pct(uPct)}` : ' (sin unidades para confirmarlo)'}.`);
        const vPct = change(x.views, x.viewsBase);
        if (x.revenueDeltaPct <= -S.trendPct && x.hasFunnel && vPct !== null && Math.abs(vPct) <= S.trendPct) add('declining', `Venta ${pct(x.revenueDeltaPct)} con vistas estables (${pct(vPct)}).`);
      }
      const share = ci.revenue > 0 && fin(x.revenue) ? x.revenue / ci.revenue : null;
      if (fin(share) && share >= S.weightShare) add('highWeight', `Pesa ${pct(share)} de la venta de su categoría en el periodo.`);
      // Evidencia
      const misses = [];
      if (x.days < S.evidenceDays) misses.push(`${x.days} días con venta en las dos ventanas (se piden ${S.evidenceDays})`);
      if (!x.hasFunnel) misses.push('sin funnel');
      else if (!(fin(x.viewsCoverage) && x.viewsCoverage >= S.evidenceCoverage)) misses.push(`cobertura de funnel ${pct(x.viewsCoverage)} (se pide ${pct(S.evidenceCoverage)})`);
      if (x.excluded > 0) misses.push(`${x.excluded} celdas en cuarentena`);
      const level = x.isNew || !x.hasFunnel ? 'low' : misses.length === 0 ? 'high' : misses.length === 1 ? 'medium' : 'low';
      if (x.isNew) misses.unshift('SKU nuevo: no tiene periodo de referencia');
      profiles.set(x.sku, { revenue: x.revenue, views: x.views, conv: x.conv, medConv: ci.medConv, share, typeIds: types.map((t) => t.id), evidence: level, hasFunnel: x.hasFunnel });
      if (!types.length) return;

      let size = null;
      if (types.some((t) => t.id === 'unconverted')) {
        const aov = fin(x.aov) ? x.aov : (x.orders > 0 && fin(x.revenue) ? x.revenue / x.orders : null);
        if (fin(aov)) size = Math.max(0, x.views * (ci.medConv - x.conv) * aov);
      }
      const offers = (offersBySku.get(x.sku) || []).concat(x.productCode && x.productCode !== x.sku ? (offersBySku.get(x.productCode) || []) : []);
      items.push({ sku: x.sku, productCode: x.productCode, name: x.name, category: x.category, subcategory: x.subcategory, brand: x.brand, types, evidence: { level, notes: misses },
        route: routeOf(types, offers.length > 0),
        size, sortKey: fin(size) ? size : (x.revenueBase || x.revenue || 0), revenue: x.revenue, revenueBase: x.revenueBase, revenueDeltaPct: x.revenueDeltaPct, units: x.units, views: x.views,
        conversion: x.conv, categoryMedianConversion: ci.medConv, categoryShare: share, offers: offers.map((o) => ({ offerId: o.offerId, discount: o.discount, state: o.state, origin: o.origin || '' })), missing: MISSING.slice() });
    });
    items.sort((a, b) => b.sortKey - a.sortKey);

    const counts = { total: items.length, byType: {}, byEvidence: { high: 0, medium: 0, low: 0 }, byRoute: {}, revenueByRoute: {} };
    Object.keys(TYPES).forEach((k) => { counts.byType[k] = 0; });
    Object.keys(ROUTES).forEach((k) => { counts.byRoute[k] = 0; counts.revenueByRoute[k] = 0; });
    items.forEach((i) => { i.types.forEach((t) => { counts.byType[t.id] += 1; }); counts.byEvidence[i.evidence.level] += 1; counts.byRoute[i.route.id] += 1; counts.revenueByRoute[i.route.id] += fin(i.revenue) ? i.revenue : 0; });
    const notes = [];
    const skipped = [...catInfo.entries()].filter(([, v]) => !v.ok && v.skus > 0).map(([k, v]) => `${k} (${v.reliable} de ${v.skus} SKU con vistas suficientes)`);
    if (skipped.length) notes.push(`Sin medianas confiables (se piden ${S.minGroup} SKU con al menos ${S.minViews} vistas): ${skipped.slice(0, 8).join('; ')}${skipped.length > 8 ? '…' : ''}. En esas categorías no se calculan demanda no convertida ni visibilidad baja.`);
    return { items, profiles, counts, settings: S, categories: [...catInfo.keys()].sort((a, b) => a.localeCompare(b, 'es')), notes };
  }

  /**
   * Agrupa los SKU de la lista por subcategoría («subcat») o laboratorio («lab»). `labOf(item)` da el laboratorio de cada SKU (oferta o catálogo).
   * Cada grupo suma lo que ya trae cada SKU: no calcula nada nuevo. «Tamaño» suma solo los SKU que lo tienen (demanda no convertida) y dice cuántos.
   * Orden: de mayor a menor, con el mismo criterio que la lista de SKU (suma de su clave de orden).
   */
  function groupItems(items, dim, labOf) {
    const none = dim === 'lab' ? 'Sin laboratorio' : 'Sin subcategoría';
    const keyOf = (i) => String((dim === 'lab' ? (labOf ? labOf(i) : i.brand) : i.subcategory) || '').trim();
    const g = new Map();
    (items || []).forEach((i) => {
      const k = keyOf(i), x = g.get(k) || { key: k, label: k || none, skus: [], withOffer: 0, evHigh: 0, size: 0, sizeSkus: 0, revenue: 0, revenueBase: 0, sortKey: 0, types: {}, categories: new Set() };
      x.skus.push(i.sku); if (i.offers && i.offers.length) x.withOffer += 1; if (i.evidence && i.evidence.level === 'high') x.evHigh += 1;
      if (typeof i.size === 'number' && Number.isFinite(i.size)) { x.size += i.size; x.sizeSkus += 1; }
      x.revenue += Number.isFinite(i.revenue) ? i.revenue : 0; x.revenueBase += Number.isFinite(i.revenueBase) ? i.revenueBase : 0; x.sortKey += Number.isFinite(i.sortKey) ? i.sortKey : 0;
      (i.types || []).forEach((t) => { x.types[t.id] = (x.types[t.id] || 0) + 1; }); if (i.category) x.categories.add(i.category);
      g.set(k, x);
    });
    return [...g.values()].map((x) => Object.assign(x, { count: x.skus.length, deltaPct: x.revenueBase > 0 ? x.revenue / x.revenueBase - 1 : null, categories: [...x.categories] }))
      .sort((a, b) => (b.sortKey - a.sortKey) || a.label.localeCompare(b.label, 'es'));
  }

  FP.opportunities = { SETTINGS, TYPES, ROUTES, ROUTE_ORDER, routeOf, MISSING, analyze, median, money, groupItems };
})(typeof window !== 'undefined' ? window : globalThis);
