/**
 * forecastExport.js — forecast_export.json (Fase 3).
 *
 * Es un SUPERCONJUNTO del contrato de Fase 0 (`FP.exporter.buildForecastExport`):
 * conserva schema, schemaVersion, generatedAt, source, period, channels, metrics_definition,
 * targets y records[] (ahora con `forecast` lleno), y agrega las secciones pensadas para la
 * futura app de diagnóstico: metadata, referenceDate, forecastVersion, plan, actual, pacing,
 * forecast, gaps, performance, assumptions, alerts, events, method_comparison, forecast_change.
 * No hay integración automática: solo el archivo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const block = (b) => FP.exporter.toContractBlock(b);

  function periodOut(p) {
    if (!p) return null;
    return {
      first_date: p.firstDate, last_date: p.lastDate, status: p.status, days: p.days, counted_days: p.countedDays,
      missing_actual_days: p.missingActualDays,
      plan: block(p.plan), plan_to_date: block(p.planToDate), actual_to_date: block(p.actualToDate), forecast: block(p.forecast),
      gap_to_date: Object.fromEntries(C().metricKeys.map((k) => [C().metrics[k].csv, p.toDate[k]])),
      forecast_gap: Object.fromEntries(C().metricKeys.map((k) => [C().metrics[k].csv, p.forecastGap[k]])),
      pacing_status: p.pacingStatus
    };
  }

  function seriesOut(s) {
    return {
      annual: periodOut(s.annual),
      months: s.months.map((m) => ({ month: m.key, ...periodOut(m) })),
      weeks: s.weeks.map((w) => ({ week: w.key, week_start: w.weekStart, week_end: w.weekEnd, crosses_months: w.crossesMonths, ...periodOut(w) }))
    };
  }

  function indicesOut(indices) {
    return Object.fromEntries(Object.entries(indices).map(([w, byM]) => [w, Object.fromEntries(Object.entries(byM).map(([m, r]) => [C().metrics[m].csv, {
      value: r.value, status: r.status, from: r.from || null, to: r.to || null, comparable_days: r.comparableDays, window_days: r.windowDays,
      coverage: r.coverage, actual: r.actual ?? null, plan: r.plan ?? null, note: r.note || null }]))]));
  }

  /**
   * @param {object} run       resultado de forecastEngine.runForecast
   * @param {object} ctx       { targets, registry (forecasts), change }
   */
  function buildForecastExport(run, { targets = null, registry = null, change = null } = {}) {
    const chIds = C().channelIds;
    const latest = registry && registry.versions.length ? registry.versions[registry.versions.length - 1] : null;
    const records = chIds.flatMap((ch) => run.channels[ch].days.map((d) => ({
      date: d.date, channel: ch, week: d.weekKey, temporal: d.temporal, counted: d.counted,
      day_type: d.tag ? d.tag.dayType || null : null, holiday: d.tag ? d.tag.holiday : null, event: d.tag ? d.tag.event : null, season: d.tag ? d.tag.season : null,
      plan: block(d.plan), actual: block(d.actual), forecast: block(d.forecast), forecast_source: d.forecastSource,
      pacing_status: d.status, fallback: d.fallback || false
    }))).sort((a, b) => (a.date === b.date ? chIds.indexOf(a.channel) - chIds.indexOf(b.channel) : a.date < b.date ? -1 : 1));

    return {
      // --- Contrato de Fase 0 (compatibilidad) ---
      schema: 'forecast_export',
      schemaVersion: C().schemaVersion,
      generatedAt: new Date().toISOString(),
      source: { app: C().app.name, version: C().app.version },
      period: { year: run.year, start: `${run.year}-01-01`, end: `${run.year}-12-31`, granularity: 'day', currency: C().currency, locale: C().locale },
      channels: C().channels.map((c) => ({ id: c.id, label: c.label, traffic_volume_label: c.trafficLabel })),
      metrics_definition: FP.exporter.metricsDefinition(),
      targets,
      records,

      // --- Fase 3 ---
      metadata: {
        algorithm_version: run.algorithmVersion,
        generated_at: run.generatedAt,
        method: { id: run.method.id, label: run.method.label, description: run.method.description },
        today_status: run.todayStatus,
        cutoff: run.cutoff,
        plan_source: run.plan,
        actual_source: run.actual,
        confidence: { total: run.total.confidence, ...Object.fromEntries(chIds.map((ch) => [ch, run.channels[ch].confidence])) },
        note: 'Plan, actual y forecast son estados separados. El plan nunca se modifica. Sin interpretación causal.'
      },
      referenceDate: run.referenceDate,
      forecastVersion: latest ? { id: latest.id, version: latest.forecastVersion, generated_at: latest.generatedAt, reference_date: latest.referenceDate, is_current_run: false } : null,
      plan: { total: block(run.total.annual.plan), ...Object.fromEntries(chIds.map((ch) => [ch, block(run.channels[ch].annual.plan)])) },
      actual: { total: block(run.total.annual.actualToDate), ...Object.fromEntries(chIds.map((ch) => [ch, block(run.channels[ch].annual.actualToDate)])) },
      pacing: { total: seriesOut(run.total), ...Object.fromEntries(chIds.map((ch) => [ch, seriesOut(run.channels[ch])])) },
      forecast: { total: block(run.total.annual.forecast), ...Object.fromEntries(chIds.map((ch) => [ch, block(run.channels[ch].annual.forecast)])) },
      gaps: {
        total: { annual_gap_to_date: run.total.gap.annualGap, forecast_gap: run.total.gap.forecastGap, monthly: run.total.gap.monthlyGap },
        ...Object.fromEntries(chIds.map((ch) => [ch, { annual_gap_to_date: run.channels[ch].gap.annualGap, forecast_gap: run.channels[ch].gap.forecastGap,
          monthly: run.channels[ch].gap.monthlyGap, daily: run.channels[ch].gap.dailyGap, cumulative: run.channels[ch].gap.cumulativeGap }]))
      },
      performance: { total: indicesOut(run.total.indices), ...Object.fromEntries(chIds.map((ch) => [ch, indicesOut(run.channels[ch].indices)])) },
      assumptions: { settings: { recent_window: run.settings.recentWindow, driver_windows: run.settings.driverWindows,
        min_comparable_days: run.settings.minComparableDays, min_window_coverage: run.settings.minWindowCoverage,
        use_historical_as_actual: run.settings.useHistoricalAsActual, pacing_thresholds: run.settings.pacingThresholds },
        ...Object.fromEntries(chIds.map((ch) => [ch, run.channels[ch].assumptions])) },
      method_comparison: {
        total: Object.fromEntries(Object.entries(run.comparison.total).map(([m, r]) => [m, { forecast: block(r.forecast), forecast_gap_revenue: r.forecastGap.revenue, confidence: r.confidence }])),
        ...Object.fromEntries(chIds.map((ch) => [ch, Object.fromEntries(Object.entries(run.comparison.byChannel[ch]).map(([m, r]) => [m, {
          forecast: block(r.annual && r.annual.forecast), forecast_gap_revenue: r.annual ? r.annual.forecastGap.revenue : null, confidence: r.confidence, fallback_days: r.fallbackDays }]))]))
      },
      forecast_change: change,
      events: run.events.map((e) => ({ type: e.type, name: e.name, start: e.start, end: e.end, days: e.days, observation: e.observation, total: periodOut(e.total) })),
      alerts: run.alerts
    };
  }

  FP.forecastExport = { buildForecastExport };
})(typeof window !== 'undefined' ? window : globalThis);
