/**
 * recoveryEngine.js — ¿Qué tendría que cambiar para cerrar el gap? (Fase 6)
 *
 * Cálculo inverso sobre los días editables del alcance (canal o total), con I = gap × objetivo %:
 *   solo volumen : Δvol% = I ÷ R                 (venta es lineal en volumen)
 *   solo CR      : Δpp   = I ÷ Σ(volumen_d × AOV_d)
 *   solo AOV     : ΔAOV% = I ÷ R
 *   dos drivers  : mismo cambio relativo x en ambos, (1 + x)² = 1 + I ÷ R
 *   tres drivers : (1 + x)³ = 1 + I ÷ R
 * R = venta base de los días editables. Cada alternativa se re-simula con el motor de escenarios para
 * verificar que cierra y para marcar restricciones o valores imposibles (CR > 100 %).
 * Son alternativas matemáticas: no se ordenan como mejor o peor.
 *
 * runRecoveryAnalysis reúne gap, drivers, señales, hipótesis, escenarios, opciones y acciones del contexto.
 * contextFromAnalysisExport / contextFromReforecastExport permiten trabajar sobre archivos importados.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const P = () => FP.pacing;
  const S = () => FP.scenarioEngine;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /** Venta base editable y Σ volumen × AOV del alcance (para el inverso de CR en pp). */
  function editableAggregates(ctx) {
    let R = 0, STA = 0, T = 0, O = 0, days = 0;
    S().scopeOf(ctx).forEach((ch) => (ctx.byChannel[ch].days || []).forEach((d) => {
      if (!d.editable || !d.base) return;
      const b = d.base;
      if (![b.revenue, b.trafficVolume, b.aov, b.orders].every(fin)) return;
      R += b.revenue; STA += b.trafficVolume * b.aov; T += b.trafficVolume; O += b.orders; days++;
    }));
    return { R, STA, T, O, CR: M().safeDivide(O, T), days };
  }

  const ALTS = [
    { id: 'A', label: 'Solo volumen', drivers: ['trafficVolume'] },
    { id: 'B', label: 'Solo CR', drivers: ['conversionRate'] },
    { id: 'C', label: 'Solo AOV', drivers: ['aov'] },
    { id: 'D', label: 'Volumen + CR', drivers: ['trafficVolume', 'conversionRate'] },
    { id: 'E', label: 'CR + AOV', drivers: ['conversionRate', 'aov'] },
    { id: 'F', label: 'Volumen + AOV', drivers: ['trafficVolume', 'aov'] },
    { id: 'G', label: 'Volumen + CR + AOV', drivers: ['trafficVolume', 'conversionRate', 'aov'] }
  ];

  function changesFor(alt, I, agg) {
    if (alt.drivers.length === 1) {
      const d = alt.drivers[0];
      if (d === 'trafficVolume') return { trafficPct: I / agg.R };
      if (d === 'aov') return { aovMode: 'pct', aovValue: I / agg.R };
      return { crMode: 'pp', crValue: I / agg.STA };
    }
    const x = Math.pow(1 + I / agg.R, 1 / alt.drivers.length) - 1;
    return {
      trafficPct: alt.drivers.includes('trafficVolume') ? x : 0,
      crMode: 'pct', crValue: alt.drivers.includes('conversionRate') ? x : 0,
      aovMode: 'pct', aovValue: alt.drivers.includes('aov') ? x : 0
    };
  }

  /**
   * Alternativas para recuperar `targetPct` del gap del contexto.
   * @returns { gap, target, required, alternatives[], maxWithinConstraints, note }
   */
  function recoveryOptions(ctx, { targetPct = 1, constraints = null } = {}) {
    const base = S().simulate(ctx, { changes: {} });
    if (!base.valid) return { ok: false, reason: base.errors[0] || 'Sin datos para calcular.', alternatives: [] };
    const gap = base.gap;
    const agg = editableAggregates(ctx);
    if (!fin(gap.gapBefore) || gap.gapBefore <= 0) return { ok: false, reason: 'No hay gap que recuperar: la base ya alcanza o supera el plan del periodo.', gap, alternatives: [] };
    if (!agg.days || agg.R <= 0) return { ok: false, reason: 'No hay días editables con volumen, CR y AOV en el periodo.', gap, alternatives: [] };
    const I = gap.gapBefore * targetPct;
    const alternatives = ALTS.map((alt) => {
      const changes = changesFor(alt, I, agg);
      const sim = S().simulate(ctx, { changes, constraints });
      const crPP = changes.crMode === 'pp' ? changes.crValue : fin(agg.CR) ? agg.CR * (changes.crValue || 0) : null;
      return {
        id: alt.id, label: alt.label, drivers: alt.drivers, changes,
        display: { trafficPct: changes.trafficPct || 0, crPP: crPP || 0, crRelPct: changes.crMode === 'pct' ? changes.crValue : fin(agg.CR) && agg.CR > 0 ? changes.crValue / agg.CR : null,
          aovPct: changes.aovValue || 0,
          crFrom: agg.CR, crTo: fin(agg.CR) ? agg.CR + (crPP || 0) : null },
        feasible: sim.valid,
        errors: sim.valid ? [] : sim.errors,
        exceedsConstraints: sim.valid ? sim.warnings.filter((w) => /restricción/.test(w)) : [],
        simulated: sim.valid ? { incremental: sim.incremental.revenue, recoveryPercent: sim.gap.recoveryPercent, gapAfter: sim.gap.gapAfter,
          orders: sim.incremental.orders, trafficVolume: sim.incremental.trafficVolume } : null
      };
    });
    return {
      ok: true, gap, targetPct, required: I, editableDays: agg.days, editableRevenue: agg.R,
      alternatives,
      maxWithinConstraints: maxWithin(ctx, constraints),
      note: 'Alternativas matemáticas equivalentes en venta simulada; no se ordenan como mejor o peor ni son recomendaciones.'
    };
  }

  /** Recuperación simulada si cada driver sube hasta su restricción (solo las definidas). */
  function maxWithin(ctx, constraints) {
    const k = constraints || {};
    if (![k.maxTrafficIncrease, k.maxCRIncrease, k.maxAOVIncrease].some(fin)) return null;
    const changes = { trafficPct: fin(k.maxTrafficIncrease) ? k.maxTrafficIncrease : 0, crMode: 'pp', crValue: fin(k.maxCRIncrease) ? k.maxCRIncrease : 0,
      aovMode: 'pct', aovValue: fin(k.maxAOVIncrease) ? k.maxAOVIncrease : 0 };
    const sim = S().simulate(ctx, { changes, constraints });
    return sim.valid ? { changes, incremental: sim.incremental.revenue, recoveryPercent: sim.gap.recoveryPercent, gapAfter: sim.gap.gapAfter } : { changes, error: sim.errors[0] };
  }

  /* ---------- API principal ---------- */

  /**
   * @param {object} p { ctx, diagnosis, constraints, scenarioStore, actionPlan, customActions, targetPct }
   * @returns { gap, drivers, signals, hypotheses, scenarios, recoveryOptions, actions, catalog, reforecast, assumptions, dataQuality }
   */
  function runRecoveryAnalysis({ ctx, diagnosis = null, constraints = null, scenarioStore = null, actionPlan = null, customActions = [], targetPct = 1 }) {
    const base = S().simulate(ctx, { changes: {} });
    const d = diagnosis && diagnosis.status === 'ok' ? diagnosis : null;
    const sameCtx = (s) => s.context.channel === ctx.channel && s.context.period.start === ctx.period.start && s.context.period.end === ctx.period.end &&
      s.context.source === ctx.source;
    const scenarios = scenarioStore ? scenarioStore.scenarios.filter(sameCtx) : [];
    const actions = actionPlan ? actionPlan.actions.filter((a) => a.channel === ctx.channel && a.period && a.period.start === ctx.period.start && a.period.end === ctx.period.end) : [];
    const avail = d && d.availability ? d.availability.available.map((x) => x.dimension) : (S().availableTargets(ctx) || []).map((x) => x.dimension);
    const mainDriver = d && d.level1 ? d.level1.mainDriver : null;
    return {
      schema: 'recovery_analysis', algorithmVersion: C().recovery.algorithmVersion,
      context: { source: ctx.source, sourceFile: ctx.sourceFile || null, channel: ctx.channel, period: ctx.period, applyTo: ctx.applyTo, referenceDate: ctx.referenceDate },
      gap: base.valid ? { ...base.gap, actualToDate: actualToDate(ctx), forecastGap: base.gap.gapBefore, reforecast: ctx.reforecast } : null,
      drivers: d ? d.level1Drivers : ctx.importedDrivers || [],
      signals: d ? d.signals : ctx.importedSignals || [],
      hypotheses: d ? d.hypotheses : ctx.importedHypotheses || [],
      scenarios,
      recoveryOptions: recoveryOptions(ctx, { targetPct, constraints }),
      actions,
      catalog: FP.actionLibrary.applicable(customActions, { driver: null, channel: ctx.channel,
        signalMetrics: (d ? d.signals : []).map((s) => s.metric), availableData: avail }),
      reforecast: ctx.reforecast,
      mainDriver,
      assumptions: base.valid ? base.assumptions : [],
      dataQuality: { diagnosisConfidence: d ? d.confidence : null, editableDays: base.valid ? base.editable.days : 0,
        availableTargets: S().availableTargets(ctx).map((x) => x.dimension), source: ctx.source }
    };
  }

  function actualToDate(ctx) {
    const list = S().scopeOf(ctx).flatMap((ch) => (ctx.byChannel[ch].days || []).filter((x) => x.counted).map((x) => x.base));
    return list.length ? P().strictAggregate(list).revenue : null;
  }

  /* ---------- Contextos desde archivos exportados ---------- */

  const fromContract = (b) => (b ? P().completeBlock({ revenue: b.revenue, orders: b.orders, trafficVolume: b.traffic_volume }) : null);
  const minus = (a, b) => (a && b ? P().completeBlock({ revenue: a.revenue - b.revenue, orders: a.orders - b.orders, trafficVolume: a.trafficVolume - b.trafficVolume }) : null);

  /**
   * analysis_export.json → contexto agregado (sin días). La parte futura = forecast − actual del periodo.
   */
  function contextFromAnalysisExport(json, fileName = 'analysis_export.json') {
    if (!json || json.schema !== 'analysis_export') return { ok: false, error: 'El archivo no es un analysis_export.json.' };
    const plan = fromContract(json.plan), actual = fromContract(json.actual), forecast = fromContract(json.forecast);
    if (!plan || !fin(plan.revenue)) return { ok: false, error: 'El archivo no trae plan del periodo.' };
    const base = forecast && fin(forecast.revenue) ? forecast : actual;
    if (!base) return { ok: false, error: 'El archivo no trae forecast ni actual del periodo.' };
    const future = forecast && actual && fin(actual.revenue) ? minus(forecast, actual) : base;
    const fixed = forecast && actual && fin(actual.revenue) ? actual : null;
    const days = [
      ...(fixed ? [{ date: json.period && json.period.key ? `${json.period.key} (a la fecha)` : 'a la fecha', base: fixed, plan: null, editable: false, counted: true }] : []),
      { date: 'restante', base: future, plan: null, editable: true, counted: false }
    ];
    const ch = '__import';
    const summary = S().summarizeChannel(days);
    summary.plan = plan;
    const period = json.period ? { type: json.period.type, key: json.period.key, label: json.period.label,
      start: json.period.key, end: json.period.key } : { type: 'range', start: '', end: '', label: '' };
    return { ok: true, ctx: {
      source: 'analysis_import', sourceFile: fileName, year: null, channel: ch, scopeChannels: [ch], allChannels: [ch],
      importedChannel: json.channel, comparison: json.comparison, period, applyTo: 'future',
      referenceDate: json.metadata ? json.metadata.referenceDate : null, cutoff: json.metadata ? json.metadata.cutoff : null,
      forecastMethod: null, planVersion: null, byChannel: { [ch]: summary },
      reforecast: json.reforecast ? { requiredTotal: json.reforecast.required ? json.reforecast.required.revenue : null,
        reforecast: json.reforecast.reforecast ? json.reforecast.reforecast.revenue : null, pressure: json.reforecast.recovery_pressure } : null,
      segments: null,
      importedDrivers: json.level1Drivers || [], importedSignals: json.level2Signals || [], importedHypotheses: json.hypotheses || [],
      aggregated: true
    } };
  }

  /**
   * reforecast_export.json → contexto diario del periodo del horizonte, por canal.
   * Base: real en días congelados, forecast en días futuros; plan original del día.
   */
  function contextFromReforecastExport(json, fileName = 'reforecast_export.json') {
    if (!json || json.schema !== 'reforecast_export' || !json.reforecast) return { ok: false, error: 'El archivo no es un reforecast_export.json.' };
    const byChannel = {};
    let start = null, end = null;
    const chs = C().channelIds.filter((ch) => json.reforecast[ch] && Array.isArray(json.reforecast[ch].daily));
    if (!chs.length) return { ok: false, error: 'El archivo no trae el detalle diario por canal.' };
    chs.forEach((ch) => {
      const hp = json.reforecast[ch].horizon_period;
      if (hp) { start = start && start < hp.first_date ? start : hp.first_date; end = end && end > hp.last_date ? end : hp.last_date; }
    });
    chs.forEach((ch) => {
      const days = json.reforecast[ch].daily.filter((d) => (!start || d.date >= start) && (!end || d.date <= end)).map((d) => ({
        date: d.date, plan: fromContract(d.plan),
        base: d.kind === 'actual' ? fromContract(d.actual) : fromContract(d.forecast),
        editable: d.kind !== 'actual' && d.kind !== 'missing_actual', counted: d.kind === 'actual', closed: d.kind === 'actual' || d.kind === 'missing_actual'
      }));
      byChannel[ch] = S().summarizeChannel(days);
    });
    const tot = json.remainingTarget && json.remainingTarget.total;
    return { ok: true, ctx: {
      source: 'reforecast_import', sourceFile: fileName, year: json.metadata ? json.metadata.year : null,
      channel: 'total', scopeChannels: chs, allChannels: chs,
      period: { type: 'range', start, end, label: `${start} a ${end}` }, applyTo: 'future',
      referenceDate: json.referenceDate, cutoff: json.metadata ? json.metadata.cutoff : null,
      forecastMethod: json.metadata && json.metadata.forecast && json.metadata.forecast.method ? { id: json.metadata.forecast.method.id, label: json.metadata.forecast.method.label } : null,
      planVersion: json.metadata ? json.metadata.planVersion : null,
      byChannel,
      reforecast: tot ? { horizon: tot.type, key: tot.key, target: tot.target, actualToDate: tot.actualToDate, remaining: tot.remaining,
        surplus: tot.surplus, requiredTotal: tot.requiredTotal, futureDays: tot.futureDays,
        pressure: json.recoveryPressure && json.recoveryPressure.total && json.recoveryPressure.total.horizon ? json.recoveryPressure.total.horizon.revenue.pressure : null } : null,
      segments: null
    } };
  }

  FP.recoveryEngine = { editableAggregates, recoveryOptions, maxWithin, runRecoveryAnalysis, contextFromAnalysisExport, contextFromReforecastExport, ALTS };
})(typeof window !== 'undefined' ? window : globalThis);
