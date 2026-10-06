/**
 * planningExport.js — Contrato de planning_export.json (Fase 2).
 *
 * Pensado para que el futuro módulo de reforecast y la app de diagnóstico lo lean
 * sin conocer los internos: snake_case, métricas con valor + origen + status + confianza.
 * No se conecta todavía con ninguna otra aplicación.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const METRIC_OUT = { revenue: 'revenue', orders: 'orders', trafficVolume: 'traffic_volume', conversionRate: 'conversion_rate', aov: 'aov' };

  const block = (v) => ({ revenue: v.revenue, orders: v.orders, traffic_volume: v.trafficVolume, conversion_rate: v.conversionRate, aov: v.aov });

  function cellsOut(cells) {
    const o = {};
    C().metricKeys.forEach((k) => {
      const c = cells[k] || {};
      o[METRIC_OUT[k]] = { value: c.value ?? null, source: c.source || null, status: c.status || null, confidence: c.confidence || null };
    });
    return o;
  }

  function seasonalityOut(profiles) {
    if (!profiles) return null;
    const out = {};
    C().channelIds.forEach((ch) => {
      const p = profiles[ch];
      out[ch] = {
        period: p.period, days: p.days, complete_years: p.monthly.yearsUsed, sufficiency: p.sufficiency,
        monthly: { confidence: p.monthly.confidence, index: p.monthly.index, historical_share: p.monthly.histShare },
        day_of_week: { confidence: p.dayOfWeek.confidence, factors: p.dayOfWeek.factors, samples: p.dayOfWeek.samples, outliers: p.dayOfWeek.outliers },
        day_of_month: { confidence: p.calendar.confidence, factors: p.calendar.factors, samples: p.calendar.samples, significant: p.calendar.significant, segments: p.calendar.segments },
        events: Object.values(p.events).map((e) => ({ key: e.key, name: e.name, type: e.type, factor: e.factor, raw_factor: e.raw, samples: e.samples, occurrences: e.occurrences, confidence: e.confidence, applied: e.applied, note: e.note })),
        seasons: Object.values(p.seasons).map((e) => ({ key: e.key, name: e.name, factor: e.factor, raw_factor: e.raw, samples: e.samples, confidence: e.confidence, applied: e.applied, note: e.note }))
      };
    });
    return out;
  }

  /**
   * @param {object} plan     plan generado o hidratado de una versión
   * @param {object} opts     { version: {id,label,type,savedAt} | null }
   */
  function buildPlanningExport(plan, { version = null } = {}) {
    const PL = FP.planning;
    const monthly = {}, weekly = {}, daily = {}, assumptions = {};
    C().channelIds.forEach((ch) => {
      const c = plan.channels[ch];
      monthly[ch] = c.months.map((m) => ({
        month: m.key, target: m.target, target_source: m.source, share_of_year: m.share, historical_share: m.histShare,
        confidence: m.confidence, explicit_days: m.explicitDays, plan: m.plan ? block(m.plan) : null
      }));
      weekly[ch] = PL.generateWeeklyPlan(plan, ch).map((w) => ({
        week: w.weekKey, week_start: w.weekStart, week_end: w.weekEnd, crosses_months: w.crossesMonths,
        plan: block(w.plan), by_month: w.byMonth.map((b) => ({ month: b.month, days: b.days, plan: block(b.plan) }))
      }));
      daily[ch] = c.days.map((r) => ({ date: r.date, share_of_month: r.share ?? null, metrics: cellsOut(r.cells) }));
      assumptions[ch] = c.months.map((m) => ({
        month: m.key,
        aov: m.assumptions ? m.assumptions.aov : null,
        conversion_rate: m.assumptions ? m.assumptions.conversionRate : null
      }));
    });
    return {
      schema: 'planning_export',
      schemaVersion: C().schemaVersion,
      generatedAt: new Date().toISOString(),
      source: { app: C().app.name, version: C().app.version },
      metadata: {
        ...plan.audit,
        plan_status: plan.status,
        version: version ? { id: version.id, label: version.label, type: version.type, saved_at: version.savedAt, locked: version.locked } : null,
        week_definition: 'ISO 8601 (lunes a domingo). Semanas que cruzan meses se reportan completas con desglose por mes.',
        value_sources: C().planValueSources
      },
      targets: {
        total: plan.targets.total,
        by_channel: plan.targets.byChannel
      },
      annual_plan: Object.fromEntries(C().channelIds.map((ch) => [ch, block(plan.channels[ch].annual)])),
      total_digital: block(plan.total),
      monthly_plan: monthly,
      weekly_plan: weekly,
      daily_plan: daily,
      seasonality: plan.profiles ? seasonalityOut(plan.profiles) : plan.seasonalitySnapshot || null,
      assumptions,
      validation: { closed: plan.validation.closed, by_channel: plan.validation.byChannel, errors: plan.validation.errors,
        warnings: plan.validation.warnings, checks: plan.validation.checks }
    };
  }

  FP.planningExport = { buildPlanningExport, seasonalityOut };
})(typeof window !== 'undefined' ? window : globalThis);
