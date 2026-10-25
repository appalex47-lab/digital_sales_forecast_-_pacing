/**
 * demoData.js — datos de EJEMPLO para ver cómo se ve Promociones sin cargar nada real (propuesta B).
 *
 * Todo lo que crea lleva «EJEMPLO» en el nombre de la campaña, de la propuesta, de la promoción o del archivo, para quitarlo sin tocar datos reales.
 * Los números son inventados: no representan ninguna oferta, descuento ni venta real. La venta ficticia por producto la carga app.js con FP.mockProducts.
 *
 *   load(ctx)  → { ok, offers, batches, proposal, promotion } | { ok:false, error }   ctx = { offers, promos, proposals(summary reg), skus: [{sku,name,category,brand}], by }
 *   clear(ctx) → { offers, batches, proposals, promotions }                           (cuántos quitó de cada uno)
 *   has(ctx)   → true si ya hay algo de ejemplo
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const TAG = 'EJEMPLO';
  const APPROVER = `Aprobador ${TAG}`;
  const CAMPS = [`${TAG} – Campaña Buen Fin`, `${TAG} – Campaña Navidad`];
  const CAMP_SEP = `${TAG} – Campaña Septiembre`;
  const isDemo = (s) => String(s || '').indexOf(TAG) === 0;

  function has(ctx) {
    return ctx.offers.batches.some((b) => isDemo(b.campaign)) || ctx.proposals.proposals.some((p) => isDemo(p.name)) || ctx.promos.promotions.some((p) => isDemo(p.name));
  }

  function load(ctx) {
    if (!ctx.by) return { ok: false, error: 'Escribe tu nombre arriba: las capturas guardan quién las hizo.' };
    if (has(ctx)) return { ok: false, error: 'Ya hay datos de ejemplo cargados. Quítalos primero si quieres volver a cargarlos.' };
    const list = (ctx.skus || []).slice(0, 12);
    if (list.length < 8) return { ok: false, error: 'Hacen falta al menos 8 productos en el catálogo para armar el ejemplo.' };
    const O = FP.offers, by = { by: ctx.by };
    // [índice de producto, campaña, origen, descuento %, programa, mecánica, uso]
    const plan = [
      [0, 0, 'pricing', 30, 'Programa A', '3+1', 'Crónico'], [0, 0, 'commercial', 20, 'Programa B', '2x1', 'Crónico'], [0, 1, 'other', 10, '', 'Precio directo', 'Crónico'],
      [1, 0, 'commercial', 25, 'Programa A', 'Precio directo', 'Crónico'], [2, 0, 'commercial', 15, '', '2x1', 'Agudo'], [3, 0, 'pricing', 35, 'Programa B', 'Precio directo', 'Agudo'],
      [4, 1, 'pricing', 40, 'Programa C', '3x2', 'Agudo'], [5, 1, 'commercial', 18, '', 'Precio directo', 'Crónico'], [6, 1, 'other', 22, 'Programa C', '2x1', 'Agudo'], [7, 1, 'commercial', 28, 'Programa A', '3+1', 'Crónico']
    ];
    const made = [];
    for (const [k, c, origin, d, prog, mech, use] of plan) {
      const s = list[k];
      const r = O.captureManual(ctx.offers, { sku: s.sku, name: s.name, category: s.category, lab: s.brand, controlled: 'Ningún Control', program: prog, mechanic: mech, discount: String(d), use,
        start: '2026-11-13', end: '2026-11-30', campaignName: CAMPS[c], origin, comments: `${TAG}: dato inventado` }, by);
      if (!r.ok) return { ok: false, error: `No se pudo armar el ejemplo: ${r.error}` };
      made.push(r.offer || (ctx.offers.offers[ctx.offers.offers.length - 1]));
    }
    // Estados: una validada y una seleccionada, para que el Resumen muestre el avance
    const st = (o, to) => O.setState(ctx.offers, o.offerId, to, by);
    st(made[3], 'validated'); st(made[5], 'validated'); st(made[5], 'selected'); st(made[6], 'validated');
    // Propuesta registrada: 8 SKU de los 12 (los últimos 4 quedan sin oferta)
    const prop = FP.summary.register(ctx.proposals, { name: `${TAG} – Propuesta Buen Fin`, by: ctx.by, skus: list.slice(0, 10).map((s) => s.sku) });
    // Promoción en propuesta con 3 SKU
    const cp = FP.promotions.createPromotion(ctx.promos, { name: `${TAG} – Promoción Buen Fin`, createdBy: ctx.by, plannedStart: '2026-11-13', plannedEnd: '2026-11-30', campaign: CAMPS[0] }, { year: 2026 });
    if (!cp.ok) return { ok: false, error: `No se pudo crear la promoción de ejemplo: ${cp.error}` };
    const pid = cp.promotion ? cp.promotion.promoId : ctx.promos.promotions[ctx.promos.promotions.length - 1].promoId;
    [3, 5].forEach((k) => FP.promotions.addSku(ctx.promos, pid, O.toPromotionSku(made.find((o) => o.sku === list[k].sku)), ctx.by));
    FP.promotions.addSku(ctx.promos, pid, { sku: list[1].sku, name: list[1].name, origin: 'manual', reason: `${TAG}: dato inventado` }, ctx.by);
    FP.promotions.setStatus(ctx.promos, pid, 'proposed', { by: ctx.by });
    // Segunda promoción: ya aprobada (aprueba otra persona ficticia), dentro de la venta ficticia; la app congela su línea base y luego la avanza
    const cp2 = FP.promotions.createPromotion(ctx.promos, { name: `${TAG} – Promoción Septiembre`, createdBy: ctx.by, plannedStart: '2026-09-20', plannedEnd: '2026-09-30', campaign: CAMP_SEP }, { year: 2026 });
    let pid2 = null;
    if (cp2.ok) {
      pid2 = cp2.promotion ? cp2.promotion.promoId : ctx.promos.promotions[ctx.promos.promotions.length - 1].promoId;
      [0, 2, 4].forEach((k) => FP.promotions.addSku(ctx.promos, pid2, { sku: list[k].sku, name: list[k].name, origin: 'manual', reason: `${TAG}: dato inventado` }, ctx.by));
      FP.promotions.setStatus(ctx.promos, pid2, 'proposed', { by: ctx.by });
      FP.promotions.setStatus(ctx.promos, pid2, 'approved', { by: ctx.by, approvedBy: APPROVER });
    }
    // Metas de ejemplo (cifras inventadas) para ver el avance por campaña
    if (ctx.goals) { FP.goals.setGoal(ctx.goals, CAMPS[0], { revenue: 800000, units: 4000, note: `${TAG}: dato inventado` }, ctx.by); FP.goals.setGoal(ctx.goals, CAMP_SEP, { revenue: 150000, units: 1500, note: `${TAG}: dato inventado` }, ctx.by); }
    return { ok: true, approved: pid2, offers: made.length, batches: ctx.offers.batches.filter((b) => isDemo(b.campaign)).length, proposal: prop.ok ? prop.proposal.id : null, promotion: pid };
  }

  /** Promociones de ejemplo aprobadas y ya congeladas: las pasa a publicada y en medición (fechas reales = planeadas). */
  function advance(ctx) {
    let n = 0;
    ctx.promos.promotions.filter((p) => isDemo(p.name) && p.status === 'approved' && p.baseline).forEach((p) => {
      const a = FP.promotions.setStatus(ctx.promos, p.promoId, 'published', { by: ctx.by });
      if (a.ok) p.skus.forEach((s) => FP.promotions.updateSku(ctx.promos, p.promoId, s.sku, { realStart: p.plannedStart, realEnd: p.plannedEnd }, ctx.by));
      const b = a.ok && FP.promotions.setStatus(ctx.promos, p.promoId, 'measuring', { by: ctx.by, today: '2026-10-01' });
      if (b && b.ok) n += 1;
    });
    return n;
  }

  function clear(ctx) {
    const lots = new Set(ctx.offers.batches.filter((b) => isDemo(b.campaign)).map((b) => b.batchId));
    const n = { offers: 0, batches: lots.size, proposals: 0, promotions: 0 };
    const o0 = ctx.offers.offers.length; ctx.offers.offers = ctx.offers.offers.filter((o) => !lots.has(o.batchId)); n.offers = o0 - ctx.offers.offers.length;
    ctx.offers.batches = ctx.offers.batches.filter((b) => !lots.has(b.batchId));
    const p0 = ctx.proposals.proposals.length; ctx.proposals.proposals = ctx.proposals.proposals.filter((p) => !isDemo(p.name)); n.proposals = p0 - ctx.proposals.proposals.length;
    if (ctx.goals) ctx.goals.goals = ctx.goals.goals.filter((g) => !isDemo(g.campaign));
    const m0 = ctx.promos.promotions.length; ctx.promos.promotions = ctx.promos.promotions.filter((p) => !isDemo(p.name)); n.promotions = m0 - ctx.promos.promotions.length;
    return n;
  }

  FP.demo = { TAG, CAMPS, CAMP_SEP, APPROVER, isDemo, has, load, advance, clear };
})(typeof window !== 'undefined' ? window : globalThis);
