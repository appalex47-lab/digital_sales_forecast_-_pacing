/**
 * planBridgeEngine.js — Puente al plan: ¿cuánto de la brecha contra la meta explica cada canal / entidad?
 * Puro. Identidad exacta:  Brecha = Real − Meta = (Real − Base) − (Meta − Base) = Δ observado − Δ esperado por la meta.
 *  · Por CANAL no hay supuestos: la meta existe por día y canal → brecha_canal = Real_canal − Meta_canal.
 *  · Por ENTIDAD la meta no existe por producto: se asume que la meta pedía crecer parejo sobre la base
 *    (Δ esperado_i = (Meta − Base) · participación_base_i) →  contribución_i = Δ_i − Δ esperado_i.   Σ contribución_i = Brecha.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /** rows: [{entity, current, baseline}] · plan: {total, byChannel:{id:{plan,actual}}, coverage, days, expectedDays} */
  function analyze({ rows = [], plan = null, actual = null, baselineTotal = null } = {}) {
    if (!plan || !fin(plan.total) || plan.total <= 0) return { status: 'unavailable', message: (plan && plan.message) || 'No hay meta cargada para este período y canal.', rows: [] };
    if (!fin(actual) || !fin(baselineTotal) || baselineTotal <= 0) return { status: 'unavailable', message: 'No hay venta real y base comparables para construir el puente.', rows: [] };
    const gap = actual - plan.total, observed = actual - baselineTotal, expected = plan.total - baselineTotal;
    const input = rows.filter((r) => fin(r.current) || fin(r.baseline)).map((r) => ({ entity: r.entity, current: fin(r.current) ? r.current : 0, baseline: fin(r.baseline) ? r.baseline : 0 }));
    const sumBase = input.reduce((s, r) => s + r.baseline, 0);
    const out = input.map((r) => {
      const delta = r.current - r.baseline, baseShare = sumBase > 0 ? r.baseline / sumBase : 0, exp = expected * baseShare;
      return { entity: r.entity, current: r.current, baseline: r.baseline, delta, baselineShare: baseShare, expected: exp, contribution: delta - exp };
    }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const sumContribution = out.reduce((s, r) => s + r.contribution, 0);
    const channels = plan.byChannel ? Object.entries(plan.byChannel).map(([id, v]) => ({ channel: id, plan: v.plan, actual: v.actual, gap: fin(v.plan) && fin(v.actual) ? v.actual - v.plan : null })) : null;
    const sumChannelGap = channels && channels.every((c) => c.gap !== null) ? channels.reduce((s, c) => s + c.gap, 0) : null;
    return { status: plan.coverage < 1 ? 'partial' : 'available', plan: plan.total, actual, baseline: baselineTotal, gap, gapPct: actual / plan.total - 1, observed, expected, rows: out, channels,
      reconciliation: { sumContribution, gap, ok: Math.abs(sumContribution - gap) <= 0.01, channelSum: sumChannelGap, channelOk: sumChannelGap === null ? null : Math.abs(sumChannelGap - gap) <= 0.5 },
      coverage: plan.coverage, message: plan.coverage < 1 ? `La meta cubre ${(plan.coverage * 100).toFixed(0)} % de los días-canal del período; la brecha es parcial.` : null,
      assumption: 'La meta no existe por producto: se asume que pedía crecer parejo sobre la venta base. Por canal no hay supuesto (la meta se carga por día y canal).' };
  }
  FP.planBridgeEngine = { analyze };
})(typeof window !== 'undefined' ? window : globalThis);
