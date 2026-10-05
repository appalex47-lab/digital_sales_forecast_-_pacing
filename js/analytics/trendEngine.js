/**
 * trendEngine.js — Evolución temporal y detección determinística de patrones (Análisis 1).
 * No interpreta causalidad: recibe una serie y devuelve evidencia, patrón y métricas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = {
    minPeriods: 3,
    stablePct: 0.02,
    changePct: 0.03,
    accelerationDelta: 0.01,
    anomalyZ: 2.5,
    recoveryMinPositive: 0.02
  };

  function cfg(options = {}) { return { ...DEFAULTS, ...(options || {}) }; }
  function cleanSeries(series) {
    return (Array.isArray(series) ? series : [])
      .map((x) => ({ period: x.period, value: finite(x.value) ? x.value : null, ...x }))
      .filter((x) => x.period != null)
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  }
  function pct(a, b) { return finite(a) && finite(b) && b !== 0 ? a / b - 1 : null; }
  function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
  function std(xs) {
    if (xs.length < 2) return null;
    const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  }
  function slope(values) {
    const xs = [], ys = [];
    values.forEach((v, i) => { if (finite(v)) { xs.push(i); ys.push(v); } });
    if (xs.length < 2) return null;
    const mx = mean(xs), my = mean(ys);
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    return den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : null;
  }
  function direction(changes, c) {
    const usable = changes.filter(finite);
    if (!usable.length) return 'insufficient';
    const pos = usable.filter((x) => x >= c.changePct).length;
    const neg = usable.filter((x) => x <= -c.changePct).length;
    if (pos > neg) return 'growth';
    if (neg > pos) return 'decline';
    return 'stable';
  }
  function acceleration(changes) {
    const u = changes.filter(finite);
    if (u.length < 2) return null;
    const recent = u.slice(-Math.min(3, u.length));
    const first = recent[0], last = recent[recent.length - 1];
    return last - first;
  }
  function classify(s, c) {
    const vals = s.map((x) => x.value), changes = vals.slice(1).map((v, i) => pct(v, vals[i]));
    const usable = changes.filter(finite), dir = direction(changes, c);
    if (vals.filter(finite).length < c.minPeriods) return { pattern: 'insufficient_history', direction: dir };
    if (!usable.length) return { pattern: 'insufficient_history', direction: 'insufficient' };
    const recent = usable.slice(-Math.min(3, usable.length));
    const positive = recent.filter((x) => x >= c.changePct).length;
    const negative = recent.filter((x) => x <= -c.changePct).length;
    const near = recent.filter((x) => Math.abs(x) < c.stablePct).length;
    const acc = acceleration(changes);
    const previous = usable.slice(0, -1);
    const last = usable[usable.length - 1];
    const hadDecline = previous.some((x) => x <= -c.changePct);
    const hadGrowth = previous.some((x) => x >= c.changePct);
    const positiveRun = (() => { let n = 0; for (let i = changes.length - 1; i >= 0; i--) { if (finite(changes[i]) && changes[i] >= c.recoveryMinPositive) n++; else break; } return n; })();
    if (hadDecline && positiveRun >= 3) return { pattern: 'strong_recovery', direction: 'growth', acceleration: acc };
    if (hadDecline && positiveRun >= 2) return { pattern: 'recovery', direction: 'growth', acceleration: acc };
    if (near >= Math.max(2, Math.min(3, recent.length))) return { pattern: 'stable', direction: 'stable', acceleration: acc };
    const signs = recent.filter(finite).map((x) => Math.sign(x)).filter(Boolean);
    const signChanges = signs.reduce((n, x, i) => n + (i && x !== signs[i - 1] ? 1 : 0), 0);
    if (signs.length >= 3 && signChanges >= 2) return { pattern: 'volatile', direction: 'stable', acceleration: acc };
    if (positive >= 2 && acc !== null && acc >= c.accelerationDelta) return { pattern: 'growth_accelerating', direction: 'growth', acceleration: acc };
    if (negative >= 2 && acc !== null && acc <= -c.accelerationDelta) return { pattern: 'decline_accelerating', direction: 'decline', acceleration: acc };
    if (positive >= 2 && acc !== null && acc <= -c.accelerationDelta) return { pattern: 'growth_decelerating', direction: 'growth', acceleration: acc };
    if (negative >= 2 && acc !== null && acc >= c.accelerationDelta) return { pattern: 'decline_decelerating', direction: 'decline', acceleration: acc };
    if (positive >= 2) return { pattern: 'growth_sustained', direction: 'growth', acceleration: acc };
    if (negative >= 2) return { pattern: 'decline_sustained', direction: 'decline', acceleration: acc };
    if (hadGrowth && last <= -c.changePct || hadDecline && last >= c.changePct) return { pattern: 'trend_break', direction: last >= 0 ? 'growth' : 'decline', acceleration: acc };
    return { pattern: dir === 'growth' ? 'growth_sustained' : dir === 'decline' ? 'decline_sustained' : 'stable', direction: dir, acceleration: acc };
  }
  function anomaly(s, c) {
    const changes = s.slice(1).map((x, i) => pct(x.value, s[i].value)).filter(finite);
    if (changes.length < 4) return null;
    const m = mean(changes.slice(0, -1)), sd = std(changes.slice(0, -1)), last = changes[changes.length - 1];
    if (!finite(sd) || sd === 0 || !finite(last)) return null;
    return Math.abs(last - m) / sd >= c.anomalyZ ? { z: (last - m) / sd, change: last } : null;
  }
  function analyzeTrend(series, options = {}) {
    const c = cfg(options), s = cleanSeries(series);
    const values = s.map((x) => x.value), changes = values.slice(1).map((v, i) => pct(v, values[i]));
    const valid = s.filter((x) => finite(x.value));
    const cls = classify(s, c), anom = anomaly(s, c);
    const first = valid[0] || null, last = valid[valid.length - 1] || null;
    const prev = valid.length > 1 ? valid[valid.length - 2] : null;
    const firstPositive = changes.findIndex((x) => finite(x) && x >= c.changePct);
    const firstNegative = changes.findIndex((x) => finite(x) && x <= -c.changePct);
    let startIndex = -1;
    if (cls.direction === 'growth') startIndex = firstPositive;
    if (cls.direction === 'decline') startIndex = firstNegative;
    if (startIndex >= 0) startIndex += 1;
    const acc = acceleration(changes);
    const turningPoint = changes.findIndex((x, i) => i > 0 && finite(x) && finite(changes[i - 1]) && Math.sign(x) !== Math.sign(changes[i - 1]) && Math.abs(x) >= c.changePct);
    const consecutive = (() => {
      const target = cls.direction === 'growth' ? 1 : cls.direction === 'decline' ? -1 : 0;
      let n = 0; for (let i = changes.length - 1; i >= 0; i--) { if ((target === 1 && changes[i] >= c.changePct) || (target === -1 && changes[i] <= -c.changePct)) n++; else break; } return n;
    })();
    const confidence = valid.length < c.minPeriods ? 'low' : consecutive >= 4 ? 'high' : consecutive >= 2 ? 'medium' : 'low';
    const evidence = { periods: s.map((x) => x.period), values, changes, rulesApplied: { minPeriods: c.minPeriods, stablePct: c.stablePct, changePct: c.changePct, accelerationDelta: c.accelerationDelta, anomalyZ: c.anomalyZ } };
    return {
      entity: options.entity || null, metric: options.metric || 'value', direction: cls.direction, pattern: (anom && ['stable', 'volatile', 'trend_break'].includes(cls.pattern)) ? 'anomaly' : cls.pattern,
      confidence, startPeriod: startIndex >= 0 && s[startIndex] ? s[startIndex].period : null,
      endPeriod: last ? last.period : null, periodsAnalyzed: valid.length, consecutivePeriods: consecutive,
      currentValue: last ? last.value : null, previousValue: prev ? prev.value : null,
      absoluteChange: last && first ? last.value - first.value : null,
      percentageChange: last && prev ? pct(last.value, prev.value) : null,
      cumulativeChange: last && first ? pct(last.value, first.value) : null,
      slope: slope(values), acceleration: acc, volatility: std(changes.filter(finite)),
      turningPoint: turningPoint >= 0 && s[turningPoint + 1] ? s[turningPoint + 1].period : null,
      recovery: ['recovery', 'strong_recovery'].includes(cls.pattern),
      anomaly: anom,
      evidence,
      limitations: valid.length < c.minPeriods ? ['Historia insuficiente para clasificar una tendencia.'] : []
    };
  }
  function analyzeMany(seriesByEntity, options = {}) {
    const out = [];
    if (seriesByEntity instanceof Map) seriesByEntity.forEach((series, entity) => out.push(analyzeTrend(series, { ...options, entity })));
    else Object.entries(seriesByEntity || {}).forEach(([entity, series]) => out.push(analyzeTrend(series, { ...options, entity })));
    return out;
  }
  FP.trendEngine = { DEFAULTS, analyzeTrend, analyzeMany, pct, slope };
})(typeof window !== 'undefined' ? window : globalThis);
