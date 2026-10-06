/**
 * contributionEngine.js — Análisis 4: Contribución y origen.
 * Determina qué entidades explican un movimiento observado y qué tan concentrado está.
 * No determina causalidad.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = { topN: 8, concentrationTarget: 0.8 };
  const cfg = (o = {}) => ({ ...DEFAULTS, ...(o || {}) });

  function analyze(rows, options = {}) {
    const c = cfg(options);
    const input = Array.isArray(rows) ? rows : [];
    const totalDelta = input.reduce((s, r) => s + (finite(r.delta) ? r.delta : 0), 0);
    const usable = input.filter(r => finite(r.delta)).map(r => ({ ...r, delta: r.delta }));
    const positive = usable.filter(r => r.delta > 0).sort((a,b) => b.delta - a.delta);
    const negative = usable.filter(r => r.delta < 0).sort((a,b) => a.delta - b.delta);
    const absTotal = usable.reduce((s,r) => s + Math.abs(r.delta), 0);
    const enrich = (list) => list.map((r, i) => ({
      ...r,
      rank: i + 1,
      deltaPct: finite(r.baseline) && r.baseline !== 0 ? r.delta / Math.abs(r.baseline) : null,
      contributionPct: totalDelta !== 0 ? r.delta / totalDelta : null,
      movementShare: absTotal !== 0 ? Math.abs(r.delta) / absTotal : null,
      role: r.delta > 0 ? 'compensator' : r.delta < 0 ? 'drag' : 'stable'
    }));
    const pos = enrich(positive), neg = enrich(negative);
    const coverage = (list) => {
      const total = list.reduce((s,r) => s + Math.abs(r.delta), 0);
      if (!total) return { topN: 0, covered: 0, coveredPct: null, targetReached: false, entities: [] };
      let acc = 0, n = 0;
      for (const r of list) { if (acc / total >= c.concentrationTarget) break; acc += Math.abs(r.delta); n++; }
      return { topN: n, covered: acc, coveredPct: acc / total, targetReached: acc / total >= c.concentrationTarget, entities: list.slice(0,n).map(r => r.entity || r.key) };
    };
    const totalCurrent = input.reduce((s,r) => s + (finite(r.current) ? r.current : 0), 0);
    const totalBaseline = input.reduce((s,r) => s + (finite(r.baseline) ? r.baseline : 0), 0);
    return {
      status: usable.length ? 'available' : 'insufficient_data',
      totalDelta, totalCurrent, totalBaseline,
      baselinePeriod: options.baselinePeriod || null, currentPeriod: options.currentPeriod || null,
      direction: totalDelta > 0 ? 'growth' : totalDelta < 0 ? 'decline' : 'stable',
      contributors: totalDelta < 0 ? neg.slice(0,c.topN) : pos.slice(0,c.topN),
      positive: pos.slice(0,c.topN), negative: neg.slice(0,c.topN),
      concentration: { positive: coverage(pos), negative: coverage(neg) },
      compensation: { positiveDelta: pos.reduce((s,r) => s+r.delta,0), negativeDelta: neg.reduce((s,r)=>s+r.delta,0) },
      evidence: { entities: usable.map(r => r.entity || r.key), deltas: usable.map(r => r.delta) }
    };
  }

  function fromShareRows(rows, options = {}) {
    return analyze((rows || []).map(r => ({
      entity: r.entity,
      current: r.currentValue,
      baseline: r.baselineValue,
      delta: finite(r.currentValue) && finite(r.baselineValue) ? r.currentValue - r.baselineValue : null,
      shareChangePp: r.shareChangePp,
      currentShare: r.currentShare,
      baselineShare: r.baselineShare
    })), options);
  }

  FP.contributionEngine = { DEFAULTS, analyze, fromShareRows };
})(typeof window !== 'undefined' ? window : globalThis);
