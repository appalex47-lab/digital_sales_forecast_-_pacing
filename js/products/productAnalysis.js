/**
 * productAnalysis.js — Análisis Categoría → Producto (Fase 8.1).
 *
 * Negocio → Canal → Categoría → Subcategoría → Producto → SKU, sobre los agregados de FP.productStore.
 *
 *   participación = venta del grupo ÷ venta total del periodo actual          ("cuánto pesa")
 *   contribución  = Δ venta del grupo ÷ Δ venta total                        ("cuánto explica del cambio")
 * No son sinónimos: un grupo pequeño puede explicar gran parte de una variación y viceversa.
 *
 * Referencia: periodo anterior de igual duración o mismo periodo del año anterior (no existe plan por
 * producto). Crecimiento, deterioro, concentración y compensación se detectan con Δ venta.
 * Patrones A–D (volumen/CR/AOV) son SEÑALES descriptivas, nunca conclusiones causales.
 * CR solo con vistas; AOV solo con pedidos > 0 (vienen de productStore.finalize).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const PS = () => FP.productStore;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const pctChange = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b - 1 : null);

  const addDays = (d, n) => FP.calendar.addDays(d, n);
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

  /** Periodo de referencia: 'previous' (misma duración, inmediatamente antes) o 'yoy' (mismas fechas, año anterior). */
  function baselinePeriod({ from, to }, comparison = 'previous') {
    if (comparison === 'yoy') {
      const shift = (d) => { const y = +d.slice(0, 4) - 1; const md = d.slice(5); return md === '02-29' ? `${y}-02-28` : `${y}-${md}`; };
      return { from: shift(from), to: shift(to), label: 'mismo periodo del año anterior' };
    }
    const n = daysBetween(from, to);
    return { from: addDays(from, -n), to: addDays(from, -1), label: `${n} días anteriores` };
  }

  /**
   * Compara grupos de dos periodos (Maps grupo → acumulado).
   * @returns { total, rows[], compensation, concentration, signals[] }
   */
  function compare(curMap, baseMap, { level = 'category', avail = null } = {}) {
    const av = avail && !Array.isArray(avail) ? avail : null;
    const fz = (acc) => (acc ? PS().finalize(acc, av) : null);
    const keys = new Set([...curMap.keys(), ...baseMap.keys()]);
    const tot = (m) => { const a = PS().newAcc(); m.forEach((x) => PS().mergeAcc(a, x)); return a; };
    const tc = fz(tot(curMap)), tb = fz(tot(baseMap));
    const totalCur = tc.revenue.value || 0, totalBase = tb.revenue.value || 0, totalDelta = totalCur - totalBase;
    const rows = [...keys].map((k) => {
      const cur = fz(curMap.get(k)), base = fz(baseMap.get(k));
      const rc = cur && fin(cur.revenue.value) ? cur.revenue.value : null;
      const rb = base && fin(base.revenue.value) ? base.revenue.value : null;
      const delta = (rc || 0) - (rb || 0);
      const deltaPct = pctChange(rc, rb);
      const status = rb === null && rc !== null ? 'new' : rc === null && rb !== null ? 'lost'
        : Math.abs(deltaPct || 0) < C().products.signals.stablePct ? 'stable' : delta > 0 ? 'growth' : 'decline';
      return {
        key: k, level, current: cur, baseline: base,
        revenue: { current: rc, baseline: rb, delta, deltaPct },
        share: totalCur ? (rc || 0) / totalCur : null,
        baselineShare: totalBase ? (rb || 0) / totalBase : null,
        contribution: totalDelta !== 0 ? delta / totalDelta : null,
        contributionAbs: delta,
        status,
        drivers: driverDeltas(cur, base)
      };
    }).sort((a, b) => Math.abs(b.contributionAbs) - Math.abs(a.contributionAbs));
    rows.forEach((r) => { r.signals = patterns(r); });
    return {
      level,
      total: { current: tc, baseline: tb, revenue: { current: totalCur, baseline: totalBase, delta: totalDelta, deltaPct: pctChange(totalCur, totalBase) } },
      rows,
      compensation: compensation(rows, totalDelta),
      concentration: concentration(rows, totalDelta),
      signals: rows.flatMap((r) => r.signals.map((s) => ({ ...s, level, key: r.key })))
    };
  }

  const CALC = ['conversionRate', 'aov', 'cartRate', 'checkoutRate', 'purchaseRate', 'trackingCoverage'];
  function driverDeltas(cur, base) {
    const g = (x, m) => (x && x[m] && fin(x[m].value) ? x[m].value : null);
    const d = {};
    ['revenue', 'orders', 'units', 'views', 'addToCart', 'beginCheckout', 'purchasesGa4', ...CALC].forEach((m) => {
      const a = g(cur, m), b = g(base, m);
      d[m] = { current: a, baseline: b, delta: fin(a) && fin(b) ? a - b : null, deltaPct: pctChange(a, b),
        status: cur && cur[m] ? cur[m].status : 'unavailable', source: CALC.includes(m) ? 'calculated' : 'observed' };
    });
    return d;
  }

  /** Patrones de señales A–D (solo si las métricas existen en ambos periodos). */
  function patterns(row) {
    const cfg = C().products.signals;
    const d = row.drivers;
    const up = (m) => fin(d[m].deltaPct) && d[m].deltaPct >= cfg.minChangePct;
    const down = (m) => fin(d[m].deltaPct) && d[m].deltaPct <= -cfg.minChangePct;
    const stable = (m) => fin(d[m].deltaPct) && Math.abs(d[m].deltaPct) < cfg.stablePct;
    const out = [];
    const NAMES = { revenue: 'venta', orders: 'pedidos', views: 'vistas', conversionRate: 'CR', aov: 'AOV', cartRate: 'vista → carrito', checkoutRate: 'carrito → checkout', purchaseRate: 'checkout → compra' };
    const ev = (ms) => ms.map((m) => `${NAMES[m]} ${(d[m].deltaPct * 100).toFixed(1)} %`).join(', ');
    if (up('views') && down('orders') && down('conversionRate') && down('revenue')) out.push({ pattern: 'A', label: 'Más tráfico, menos pedidos: CR y venta a la baja', evidence: ev(['views', 'orders', 'conversionRate', 'revenue']) });
    if (stable('views') && down('conversionRate') && down('revenue')) out.push({ pattern: 'B', label: 'Tráfico estable con CR y venta a la baja', evidence: ev(['views', 'conversionRate', 'revenue']) });
    if (stable('orders') && down('aov') && down('revenue')) out.push({ pattern: 'C', label: 'Pedidos estables con AOV y venta a la baja', evidence: ev(['orders', 'aov', 'revenue']) });
    if (up('views') && down('conversionRate') && !out.some((x) => x.pattern === 'A')) out.push({ pattern: 'D', label: 'Tráfico al alza con CR a la baja', evidence: ev(['views', 'conversionRate']) });
    // Funnel (8.1.1): en qué paso cae la conversión del producto
    if ((stable('views') || up('views')) && down('cartRate')) out.push({ pattern: 'E', label: 'Vistas estables o al alza, pero menos agregados al carrito por vista', evidence: ev(['views', 'cartRate']), step: 'vista → carrito' });
    if (stable('cartRate') && down('checkoutRate')) out.push({ pattern: 'F', label: 'El carrito se mantiene, pero menos carritos pasan a checkout', evidence: ev(['cartRate', 'checkoutRate']), step: 'carrito → checkout' });
    if (stable('checkoutRate') && down('purchaseRate')) out.push({ pattern: 'G', label: 'El checkout se mantiene, pero menos checkouts terminan en compra', evidence: ev(['checkoutRate', 'purchaseRate']), step: 'checkout → compra' });
    return out.map((x) => ({ ...x, kind: 'signal', note: 'Señal descriptiva: requiere investigación, no indica la causa.' }));
  }

  /** Compensación: caídas de unos grupos cubiertas por crecimientos de otros. */
  function compensation(rows, totalDelta) {
    const neg = rows.filter((r) => r.contributionAbs < 0), pos = rows.filter((r) => r.contributionAbs > 0);
    const sNeg = neg.reduce((a, r) => a + r.contributionAbs, 0), sPos = pos.reduce((a, r) => a + r.contributionAbs, 0);
    const compensated = neg.length > 0 && pos.length > 0;
    return { negative: sNeg, positive: sPos, negativeCount: neg.length, positiveCount: pos.length, compensated,
      coveredPct: compensated && sNeg !== 0 ? Math.min(1, sPos / -sNeg) : null,
      text: !compensated ? null : totalDelta >= 0
        ? `${neg.length} grupo(s) cayeron ${fmt(-sNeg)}, compensados por el crecimiento de ${pos.length} grupo(s) (+${fmt(sPos)}).`
        : `${pos.length} grupo(s) crecieron +${fmt(sPos)}, pero no alcanzaron a compensar las caídas de ${neg.length} grupo(s) (${fmt(sNeg)}).` };
  }

  /** Concentración: cuántos grupos explican el 80 % del crecimiento o del deterioro. */
  function concentration(rows, totalDelta) {
    const conc = (list) => {
      const t = list.reduce((a, r) => a + Math.abs(r.contributionAbs), 0);
      let acc = 0, n = 0;
      for (const r of list) { if (acc >= 0.8 * t) break; acc += Math.abs(r.contributionAbs); n++; }
      return { groups: list.length, top: n, topKeys: list.slice(0, n).map((r) => r.key), total: t };
    };
    return {
      decline: conc(rows.filter((r) => r.contributionAbs < 0).sort((a, b) => a.contributionAbs - b.contributionAbs)),
      growth: conc(rows.filter((r) => r.contributionAbs > 0).sort((a, b) => b.contributionAbs - a.contributionAbs))
    };
  }

  const fmt = (v) => (FP.format ? FP.format.currency(v, 0) : String(Math.round(v)));

  const NEXT = { total: 'channel', channel: 'category', category: 'subcategory', subcategory: 'product', product: 'sku', sku: null,
    state: 'branch', branch: null, delivery: null };

  /**
   * Corre el análisis de un nivel con filtros (drilldown) sobre IndexedDB.
   * @param {object} p { from, to, comparison, channel, level, filter }
   */
  async function run({ from, to, comparison = 'previous', channel = 'total', level = 'category', filter = {} }) {
    const base = baselinePeriod({ from, to }, comparison);
    const m = PS().meta || {};
    const mapped = { sales: m.mappedMetrics && m.mappedMetrics.length ? m.mappedMetrics : C().products.metrics, funnel: m.funnelMetrics || [] };
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const [cur, prev] = [await PS().aggregate({ from, to, channel, groupBy: level, filter }), await PS().aggregate({ from: base.from, to: base.to, channel, groupBy: level, filter })];
    const res = compare(cur, prev, { level, avail: mapped });
    return { ...res, period: { from, to }, baseline: base, comparison, channel, filter, next: NEXT[level], mappedMetrics: mapped,
      elapsedMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
  }

  /** Lleva el contexto del diagnóstico (Fase 5) a la comparación de productos. */
  function fromDiagnosis(diag) {
    if (!diag || !diag.period) return null;
    const per = FP.scenarioEngine ? FP.scenarioEngine.resolvePeriod(diag.period, +String(diag.period.key || diag.period.start).slice(0, 4)) : diag.period;
    const cmp = diag.comparison && diag.comparison.id === 'actual_vs_yoy' ? 'yoy' : 'previous';
    return { from: per.start, to: per.end, channel: diag.channel ? diag.channel.id || diag.channel : 'total', comparison: cmp,
      note: diag.comparison && ['actual_vs_plan', 'forecast_vs_plan', 'reforecast_vs_forecast'].includes(diag.comparison.id)
        ? 'No existe plan por producto: el desglose de productos compara contra el periodo anterior.' : null };
  }

  FP.productAnalysis = { baselinePeriod, compare, patterns, compensation, concentration, run, fromDiagnosis, NEXT };
})(typeof window !== 'undefined' ? window : globalThis);
