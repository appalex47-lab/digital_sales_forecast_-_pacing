/**
 * reforecastVersioning.js — Versiones del reforecast (Fase 4).
 *
 * Cada "Guardar reforecast" crea una versión NUEVA e inmutable (congelada):
 *   { reforecastVersion: 'rf_v3', generatedAt, referenceDate, cutoff, simulated, horizon,
 *     method: 'future_weighted_distribution', planVersion, forecastVersion, assumptionSource,
 *     results, confidence }
 * Se guardan por año en `reforecasts:<año>`. Nunca se sobrescriben.
 *
 * Reforecast change = requerido actual − requerido de la versión anterior (y el mismo cálculo
 * para el reforecast de cierre). La app muestra cómo cambió; no interpreta la causa.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;

  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  function createReforecastRegistry(year) { return { year, versions: [] }; }

  const pick = (b) => (b ? { revenue: b.revenue, orders: b.orders, trafficVolume: b.trafficVolume, conversionRate: b.conversionRate, aov: b.aov } : null);

  function seriesResults(s) {
    const h = s.horizon, hs = s.horizonSummary;
    return {
      horizon: { type: h.type, key: h.key, target: h.target, actualToDate: h.actualToDate, remaining: h.remaining, surplus: h.surplus, requiredTotal: h.requiredTotal },
      horizonPeriod: hs ? { plan: pick(hs.plan), forecast: pick(hs.forecast), reforecast: pick(hs.reforecast), required: pick(hs.required),
        pressure: hs.pressure ? hs.pressure.revenue.pressure : null, recoveryGap: hs.recoveryGap } : null,
      annual: { plan: pick(s.annual.plan), actualToDate: pick(s.annual.actualToDate), forecast: pick(s.annual.forecast), reforecast: pick(s.annual.reforecast) },
      months: s.months.map((m) => ({ key: m.key, status: m.status, plan: pick(m.plan), reforecast: pick(m.reforecast), required: pick(m.required) })),
      confidence: s.confidence ? s.confidence.level : null
    };
  }

  /** Crea una versión inmutable a partir de una corrida del motor de reforecast. */
  function createSnapshot(registry, rf) {
    const n = registry.versions.length + 1;
    const v = {
      id: `reforecast-${rf.year}-rf_v${n}`,
      reforecastVersion: `rf_v${n}`,
      generatedAt: new Date().toISOString(),
      referenceDate: rf.referenceDate, cutoff: rf.cutoff, todayStatus: rf.todayStatus,
      simulated: rf.simulated,
      algorithmVersion: rf.algorithmVersion,
      method: rf.method, horizon: rf.horizon, assumptionSource: rf.assumptionSource,
      planVersion: rf.plan ? { id: rf.plan.versionId || null, label: rf.plan.label, source: rf.plan.source } : null,
      forecastVersion: { id: rf.forecast.forecastVersion ? rf.forecast.forecastVersion.id : null,
        version: rf.forecast.forecastVersion ? rf.forecast.forecastVersion.forecastVersion : null,
        method: rf.forecast.method ? rf.forecast.method.id : null,
        note: rf.forecast.forecastVersion ? null : 'Forecast calculado al momento (sin versión guardada).' },
      results: {
        total: seriesResults(rf.total),
        byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, seriesResults(rf.channels[ch])]))
      },
      validation: { closed: rf.validation.closed }
    };
    registry.versions.push(deepFreeze(v));
    return v;
  }

  function hydrateReforecastRegistry(raw, year) {
    if (!raw || !Array.isArray(raw.versions)) return createReforecastRegistry(year);
    return { year: raw.year, versions: raw.versions.map((v) => deepFreeze(v)) };
  }

  /** Fila de evolución de una versión (o de la corrida actual sin guardar). */
  function evolutionRow(res, meta) {
    const t = res.total;
    const target = t.horizon.target;
    const fc = t.horizonPeriod && t.horizonPeriod.forecast ? t.horizonPeriod.forecast.revenue : null;
    const refc = t.horizonPeriod && t.horizonPeriod.reforecast ? t.horizonPeriod.reforecast.revenue : null;
    return { ...meta, target, forecast: fc, reforecast: refc,
      forecastGap: M().isFiniteNumber(fc) && M().isFiniteNumber(target) ? fc - target : null,
      required: t.horizon.requiredTotal, pressure: t.horizonPeriod ? t.horizonPeriod.pressure : null };
  }

  /** Evolución: versiones guardadas (más antigua primero) con cambio vs la anterior. */
  function evolution(registry) {
    const rows = (registry ? registry.versions : []).map((v) => evolutionRow(v.results, {
      id: v.id, version: v.reforecastVersion, generatedAt: v.generatedAt, referenceDate: v.referenceDate,
      horizon: v.horizon, simulated: v.simulated }));
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      const g = prev ? M().calcGap(prev.required, r.required) : null;
      const gr = prev ? M().calcGap(prev.reforecast, r.reforecast) : null;
      r.change = g ? { required: g.abs, requiredPct: g.pct, reforecast: gr.abs, reforecastPct: gr.pct, sameHorizon: prev.horizon === r.horizon } : null;
    });
    return rows;
  }

  /** Reforecast change de la corrida actual contra la última versión guardada. */
  function reforecastChange(registry, rf) {
    if (!registry || !registry.versions.length) return null;
    const prev = registry.versions[registry.versions.length - 1];
    const cur = evolutionRow({ total: seriesResults(rf.total) }, {});
    const old = evolutionRow(prev.results, {});
    const g = M().calcGap(old.required, cur.required);
    const gr = M().calcGap(old.reforecast, cur.reforecast);
    return { previous: { id: prev.id, version: prev.reforecastVersion, referenceDate: prev.referenceDate, horizon: prev.horizon },
      sameHorizon: prev.horizon === rf.horizon,
      required: { current: cur.required, previous: old.required, change: g.abs, changePct: g.pct },
      reforecast: { current: cur.reforecast, previous: old.reforecast, change: gr.abs, changePct: gr.pct } };
  }

  FP.reforecastVersioning = { createReforecastRegistry, createSnapshot, hydrateReforecastRegistry, evolution, reforecastChange, seriesResults };
})(typeof window !== 'undefined' ? window : globalThis);
