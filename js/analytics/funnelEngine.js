/**
 * funnelEngine.js — Embudo de ficha por producto (GA4): vistas → carrito → checkout → compra.
 * Puro: recibe cifras ya agregadas (del periodo y de su referencia) y devuelve la tasa de cada paso, su cambio en puntos porcentuales,
 * el paso más débil y el reparto del cambio de venta entre vistas, conversión y venta por compra (la misma aritmética de
 * trafficConversionEngine, con las vistas de ficha como «tráfico»). Solo aritmética: no dice causas.
 *
 * Valores: { views, cart, checkout, purchase, revenue } (revenue solo hace falta para el reparto).
 * «purchase» son compras GA4 (artículos comprados), no pedidos: su tasa no es la misma que la conversión de pedidos de Diagnóstico.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const STEPS = [{ id: 'views', label: 'Vistas de ficha' }, { id: 'cart', label: 'Agregó al carrito' }, { id: 'checkout', label: 'Inició checkout' }, { id: 'purchase', label: 'Compró (GA4)' }];
  const TRANSITIONS = ['Vista → carrito', 'Carrito → checkout', 'Checkout → compra'];
  const WEAK_PP = 0.3;   // un paso se marca como débil si su tasa cae más de 0.3 pp contra la referencia

  const ratio = (a, b) => (fin(a) && fin(b) && b > 0 ? a / b : null);
  /** Arma los valores del embudo desde las métricas de productStore ({ views:{value}, addToCart:{value}, beginCheckout:{value}, purchasesGa4:{value}, revenue:{value} }). Null si falta algún paso. */
  function pick(m) {
    if (!m) return null;
    const v = (k) => (m[k] && fin(m[k].value) ? m[k].value : null);
    const out = { views: v('views'), cart: v('addToCart'), checkout: v('beginCheckout'), purchase: v('purchasesGa4'), revenue: v('revenue') };
    return out.views > 0 && out.cart !== null && out.checkout !== null && out.purchase !== null ? out : null;
  }
  /** Tasas: vista→carrito, carrito→checkout, checkout→compra y conversión de ficha (compra ÷ vistas). */
  function rates(v) {
    if (!v) return null;
    return { cart: ratio(v.cart, v.views), checkout: ratio(v.checkout, v.cart), purchase: ratio(v.purchase, v.checkout), cr: ratio(v.purchase, v.views) };
  }
  const key = ['cart', 'checkout', 'purchase'];
  /** Compara el periodo con su referencia: pasos, tasas, cambio en pp y paso más débil. */
  function compare(cur, base) {
    const rc = rates(cur), rb = rates(base);
    if (!rc) return null;
    const ids = ['views', 'cart', 'checkout', 'purchase'];
    const steps = STEPS.map((s, i) => {
      const c = cur[ids[i]], b = base ? base[ids[i]] : null;
      const r1 = i ? rc[key[i - 1]] : null, r0 = i && rb ? rb[key[i - 1]] : null;
      return { id: s.id, label: s.label, transition: i ? TRANSITIONS[i - 1] : null, cur: c, base: fin(b) ? b : null, deltaPct: fin(b) && b > 0 ? c / b - 1 : null,
        rateCur: r1, rateBase: r0, deltaPp: fin(r1) && fin(r0) ? (r1 - r0) * 100 : null };
    });
    const dcr = fin(rc.cr) && rb && fin(rb.cr) ? (rc.cr - rb.cr) * 100 : null;
    return { steps, cr: { cur: rc.cr, base: rb ? rb.cr : null, deltaPp: dcr }, weakest: weakest(steps) };
  }
  /** Paso más débil: la transición con la mayor caída de tasa, si pasa del umbral. */
  function weakest(steps, minPp = WEAK_PP) {
    let w = null;
    steps.forEach((s, i) => { if (i && fin(s.deltaPp) && s.deltaPp < -minPp && (!w || s.deltaPp < w.deltaPp)) w = { index: i, label: s.transition, deltaPp: s.deltaPp }; });
    return w;
  }
  /** Reparto del cambio de venta: vistas (tráfico) → conversión de ficha → venta por compra. La suma es exactamente el cambio de venta. */
  function decompose(cur, base) {
    const E = FP.trafficConversionEngine;
    if (!E || !cur || !base || !fin(cur.revenue) || !fin(base.revenue)) return null;
    const e = E.effects({ t: base.views, o: base.purchase, r: base.revenue }, { t: cur.views, o: cur.purchase, r: cur.revenue });
    return { traffic: e.traffic, cr: e.cr, aov: e.aov, delta: e.delta, kind: e.kind, ok: Math.abs(e.traffic + e.cr + e.aov - e.delta) < 0.5 };
  }
  /** Frase de lectura (sin causas): qué pasó con las vistas y con la conversión. */
  function reading(cmp) {
    if (!cmp) return null;
    const v = cmp.steps[0].deltaPct, d = cmp.cr.deltaPp, w = cmp.weakest;
    if (v !== null && v > 0.03 && d !== null && d < -0.1) return { kind: 'views_up_cr_down', views: v, crPp: d, weak: w };
    if (v !== null && v < -0.03) return { kind: 'views_down', views: v, crPp: d, weak: w };
    if (v !== null && v > 0.03 && d !== null && d > 0.1) return { kind: 'views_up_cr_up', views: v, crPp: d, weak: w };
    return { kind: 'flat', views: v, crPp: d, weak: w };
  }
  FP.funnelEngine = { STEPS, TRANSITIONS, WEAK_PP, pick, rates, compare, weakest, decompose, reading };
})(typeof window !== 'undefined' ? window : globalThis);
