/** riskOpportunityEngine.js — Análisis 5: Riesgos y oportunidades.
 * Prioriza señales existentes sin afirmar causalidad. Solo usa evidencia calculada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, a=0, b=100) => Math.max(a, Math.min(b, v));
  const DEFAULTS = { topN: 10, weights: { magnitude: 30, persistence: 20, acceleration: 15, share: 15, concentration: 10, confidence: 10 } };
  const cfg = (o={}) => ({ ...DEFAULTS, ...(o || {}), weights: { ...DEFAULTS.weights, ...((o || {}).weights || {}) } });

  function classify(r) {
    const p = r.pattern || '';
    const decline = /^decline_/.test(p) || p === 'trend_break' && r.direction === 'decline' || p === 'anomaly' && r.direction === 'decline';
    const growth = /^growth_/.test(p) || p === 'recovery' || p === 'strong_recovery' || p === 'trend_break' && r.direction === 'growth';
    if (decline) return 'risk';
    if (growth) return 'opportunity';
    return 'watch';
  }
  function score(r, share, c) {
    const magnitude = clamp((Math.abs(r.cumulativeChange ?? r.percentageChange ?? 0) * 100) * 2.5);
    const persistence = clamp((r.consecutivePeriods || r.periodsAnalyzed || 0) * 12);
    const acceleration = clamp(Math.abs(r.acceleration || 0) * 1000);
    const shareScore = finite(share?.shareChangePp) ? clamp(Math.abs(share.shareChangePp) * 8) : 0;
    const concentration = finite(share?.currentShare) ? clamp(share.currentShare * 100 * 2) : 0;
    const confidence = r.confidence === 'high' ? 100 : r.confidence === 'medium' ? 70 : 40;
    const w=c.weights;
    const raw = magnitude*w.magnitude/100 + persistence*w.persistence/100 + acceleration*w.acceleration/100 + shareScore*w.share/100 + concentration*w.concentration/100 + confidence*w.confidence/100;
    return Math.round(clamp(raw));
  }
  function analyze(rows, options={}) {
    const c=cfg(options), input=Array.isArray(rows)?rows:[];
    const items=input.map(r=>{ const type=classify(r); const s=score(r,r.share,c); const severity=s>=80?'critical':s>=60?'high':s>=35?'medium':'low'; return { entity:r.entity, type, score:s, severity, pattern:r.pattern, direction:r.direction, percentageChange:r.percentageChange, cumulativeChange:r.cumulativeChange, consecutivePeriods:r.consecutivePeriods||r.periodsAnalyzed||0, shareChangePp:finite(r.share?.shareChangePp)?r.share.shareChangePp:null, currentShare:finite(r.share?.currentShare)?r.share.currentShare:null,
      currentValue: finite(r.share?.currentValue)?r.share.currentValue:null, baselineValue: finite(r.share?.baselineValue)?r.share.baselineValue:null,
      delta: finite(r.share?.currentValue) && finite(r.share?.baselineValue) ? r.share.currentValue-r.share.baselineValue : null,
      confidence:r.confidence, reasons:[r.pattern, (r.consecutivePeriods||r.periodsAnalyzed||0)>=3?'persistent':null, r.advanced?.signal || null].filter(Boolean) }; });
    return { status:items.length?'available':'insufficient_data', risks:items.filter(x=>x.type==='risk').sort((a,b)=>b.score-a.score).slice(0,c.topN), opportunities:items.filter(x=>x.type==='opportunity').sort((a,b)=>b.score-a.score).slice(0,c.topN), watch:items.filter(x=>x.type==='watch').sort((a,b)=>b.score-a.score).slice(0,c.topN), all:items.sort((a,b)=>b.score-a.score), thresholds:{critical:80,high:60,medium:35}, methodology:'Índice descriptivo de priorización. No es probabilidad ni causalidad.' };
  }
  FP.riskOpportunityEngine={DEFAULTS,analyze,classify};
})(typeof window!=='undefined'?window:globalThis);
