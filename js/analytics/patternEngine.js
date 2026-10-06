/**
 * patternEngine.js — Detección avanzada de patrones sobre resultados de trendEngine.
 * Fase 2. No calcula causalidad ni llama APIs.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = {
    structuralPeriods: 3,
    structuralCumulative: 0.10,
    severeCumulative: 0.25,
    accelerationThreshold: 0.01,
    earlyWarningPeriods: 2,
    similarityTolerance: 0.08
  };
  const cfg = (o = {}) => ({ ...DEFAULTS, ...(o || {}) });

  function family(pattern) {
    if (!pattern) return 'unknown';
    if (pattern.startsWith('growth')) return 'growth';
    if (pattern.startsWith('decline')) return 'decline';
    if (pattern.includes('recovery')) return 'recovery';
    if (pattern === 'volatile') return 'volatile';
    if (pattern === 'trend_break') return 'break';
    if (pattern === 'anomaly') return 'anomaly';
    if (pattern === 'stable') return 'stable';
    return 'unknown';
  }

  function severity(r, c) {
    const abs = Math.abs(r.cumulativeChange || 0);
    const persistence = Math.min(1, (r.consecutivePeriods || 0) / 6);
    const acceleration = Math.min(1, Math.abs(r.acceleration || 0) / Math.max(c.accelerationThreshold, 0.0001));
    const magnitude = Math.min(1, abs / Math.max(c.severeCumulative, 0.01));
    const score = Math.round((magnitude * 0.55 + persistence * 0.30 + acceleration * 0.15) * 100);
    if (score >= 75) return { score, level: 'critical' };
    if (score >= 50) return { score, level: 'high' };
    if (score >= 25) return { score, level: 'medium' };
    return { score, level: 'low' };
  }

  function segmentSignals(r, c) {
    const changes = r && r.evidence && Array.isArray(r.evidence.changes) ? r.evidence.changes.filter(finite) : [];
    if (changes.length < 2) return { earlyWarning: false, structural: false, regimeChanges: 0, lastRun: 0 };
    let regimeChanges = 0;
    for (let i = 1; i < changes.length; i++) {
      if (Math.sign(changes[i]) !== Math.sign(changes[i - 1]) && Math.abs(changes[i]) >= 0.03 && Math.abs(changes[i - 1]) >= 0.03) regimeChanges++;
    }
    const last = changes.slice(-c.earlyWarningPeriods);
    const lastNeg = last.length >= c.earlyWarningPeriods && last.every((x) => x <= -0.03);
    const lastPos = last.length >= c.earlyWarningPeriods && last.every((x) => x >= 0.03);
    const structural = Math.abs(r.cumulativeChange || 0) >= c.structuralCumulative && (r.consecutivePeriods || 0) >= c.structuralPeriods;
    const earlyWarning = (lastNeg && family(r.pattern) !== 'decline') || (lastPos && family(r.pattern) !== 'growth');
    return { earlyWarning, structural, regimeChanges, lastRun: r.consecutivePeriods || 0 };
  }

  function analyze(r, options = {}) {
    const c = cfg(options);
    const s = segmentSignals(r, c);
    const sev = severity(r, c);
    const fam = family(r.pattern);
    let signal = 'normal';
    if (s.earlyWarning) signal = 'early_warning';
    if (s.structural && (fam === 'decline' || fam === 'break')) signal = 'structural_decline';
    else if (s.structural && fam === 'growth') signal = 'structural_growth';
    if (r.pattern === 'trend_break') signal = 'trend_break';
    if (r.pattern === 'recovery' || r.pattern === 'strong_recovery') signal = 'recovery';
    if (r.pattern === 'anomaly') signal = 'anomaly';
    return {
      entity: r.entity,
      pattern: r.pattern,
      family: fam,
      signal,
      severity: sev.level,
      score: sev.score,
      structural: s.structural,
      earlyWarning: s.earlyWarning,
      regimeChanges: s.regimeChanges,
      persistence: r.consecutivePeriods || 0,
      turningPoint: r.turningPoint || null,
      confidence: r.confidence || 'low',
      evidence: { pattern: r.pattern, cumulativeChange: r.cumulativeChange, acceleration: r.acceleration, regimeChanges: s.regimeChanges }
    };
  }

  function analyzeMany(results, options = {}) {
    return (Array.isArray(results) ? results : []).map((r) => ({ ...r, advanced: analyze(r, options) }));
  }

  function cluster(results, options = {}) {
    const rows = analyzeMany(results, options);
    const groups = new Map();
    rows.forEach((r) => {
      const key = `${r.advanced.family}|${r.advanced.signal}`;
      if (!groups.has(key)) groups.set(key, { key, family: r.advanced.family, signal: r.advanced.signal, count: 0, entities: [], maxSeverity: 'low' });
      const g = groups.get(key); g.count++; g.entities.push(r.entity);
      const rank = { low: 1, medium: 2, high: 3, critical: 4 };
      if (rank[r.advanced.severity] > rank[g.maxSeverity]) g.maxSeverity = r.advanced.severity;
    });
    return { rows, groups: [...groups.values()].sort((a,b) => b.count - a.count) };
  }

  FP.patternEngine = { DEFAULTS, analyze, analyzeMany, cluster, family };
})(typeof window !== 'undefined' ? window : globalThis);
