/**
 * shareMixEngine.js — Share & Mix Intelligence (Análisis 3).
 * Calcula participación, cambio de mix, ranking y concentración de forma determinística.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  /* significantPp está en PUNTOS PORCENTUALES: un cambio de participación menor a 0.25 pp se considera «estable» (antes 0.01 pp ≈ cualquier variación). */
  const DEFAULTS = { minShare: 0, significantPp: 0.25 };
  const nz = (v) => finite(v) ? v : 0;
  const cfg = (o = {}) => ({ ...DEFAULTS, ...(o || {}) });
  function share(v, total) { return finite(v) && finite(total) && total > 0 ? v / total : null; }
  function analyze(series, totalSeries, options = {}) {
    const c = cfg(options);
    const s = Array.isArray(series) ? series : [];
    const totals = Array.isArray(totalSeries) ? totalSeries : [];
    const byPeriod = new Map(totals.map(x => [String(x.period), x.value]));
    const points = s.map(x => ({ period: x.period, value: x.value, total: byPeriod.get(String(x.period)) ?? null, share: share(x.value, byPeriod.get(String(x.period))) }));
    const valid = points.filter(x => finite(x.share));
    if (valid.length < 2) return { status: 'insufficient_history', currentShare: null, baselineShare: null, shareChange: null, shareChangePp: null, rankCurrent: null, rankBaseline: null, points, evidence: { periods: points.map(x => x.period) } };
    const first = valid[0], last = valid[valid.length - 1];
    return {
      status: 'available', baselinePeriod: first.period, currentPeriod: last.period,
      baselineShare: first.share, currentShare: last.share,
      shareChange: last.share - first.share, shareChangePp: (last.share - first.share) * 100,
      mixDirection: (last.share - first.share) * 100 > c.significantPp ? 'gaining' : (last.share - first.share) * 100 < -c.significantPp ? 'losing' : 'stable',
      points,
      evidence: { periods: valid.map(x => x.period), shares: valid.map(x => x.share), values: valid.map(x => x.value), totals: valid.map(x => x.total) }
    };
  }
  function rankAndMix(rows, totalCurrent, totalBaseline, options = {}) {
    const c = cfg(options);
    const usable = (rows || []).map(r => ({
      ...r,
      // Missing activity in either comparison period is treated as zero only when
      // the entity exists in the other period. This allows true new/lost entities
      // to appear instead of silently dropping them.
      currentValue: nz(r.currentValue),
      baselineValue: nz(r.baselineValue),
      currentShare: share(nz(r.currentValue), totalCurrent),
      baselineShare: share(nz(r.baselineValue), totalBaseline)
    })).filter(r => finite(r.currentShare) || finite(r.baselineShare));
    const currentSorted = [...usable].sort((a,b)=>(b.currentShare||0)-(a.currentShare||0));
    const baseSorted = [...usable].sort((a,b)=>(b.baselineShare||0)-(a.baselineShare||0));
    const currentRank = new Map(currentSorted.map((r,i)=>[r.entity,i+1]));
    const baselineRank = new Map(baseSorted.map((r,i)=>[r.entity,i+1]));
    const out = usable.map(r => {
      const currentShare = r.currentShare || 0, baselineShare = r.baselineShare || 0;
      const pp = (currentShare - baselineShare) * 100;
      const existedBefore = r.baselineValue > 0;
      const existsNow = r.currentValue > 0;
      const status = !existedBefore && existsNow ? 'new' : existedBefore && !existsNow ? 'lost' :
        pp > c.significantPp ? 'gaining' : pp < -c.significantPp ? 'losing' : 'stable';
      return { ...r, currentShare, baselineShare, shareChangePp: pp,
        status,
        mixDirection: pp > c.significantPp ? 'gaining' : pp < -c.significantPp ? 'losing' : 'stable',
        rankCurrent: currentRank.get(r.entity) || null, rankBaseline: baselineRank.get(r.entity) || null,
        rankChange: (baselineRank.get(r.entity) || 0) - (currentRank.get(r.entity) || 0) };
    });
    const sumSq = out.reduce((a,r)=>a + Math.pow(r.currentShare || 0,2),0);
    return {
      rows: out,
      winners: [...out].filter(r=>r.status === 'gaining').sort((a,b)=>b.shareChangePp-a.shareChangePp),
      losers: [...out].filter(r=>r.status === 'losing').sort((a,b)=>a.shareChangePp-b.shareChangePp),
      stable: [...out].filter(r=>r.status === 'stable'),
      newEntities: [...out].filter(r=>r.status === 'new'),
      lostEntities: [...out].filter(r=>r.status === 'lost'),
      hhi: sumSq, concentration: sumSq >= 0.25 ? 'high' : sumSq >= 0.15 ? 'medium' : 'low'
    };
  }
  FP.shareMixEngine = { DEFAULTS, analyze, rankAndMix, share };
})(typeof window !== 'undefined' ? window : globalThis);
