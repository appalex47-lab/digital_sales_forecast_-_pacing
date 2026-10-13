/**
 * forecastEngine.js — Motor central: PLAN → ACTUAL → PACING → GAP → FORECAST (Fase 3).
 *
 *   plan      = Plan distribuido ORIGINAL de Fase 2 (congelado). Si no existe, el plan
 *               importado (planData) del Dataset consolidado. Solo se LEE: el motor copia
 *               valores y nunca escribe sobre el objeto del plan.
 *   actual    = actualData (última carga por llave) + historicalData del mismo año en días
 *               sin actual (ambos son venta real; configurable).
 *   pacing    = plan vs actual de los días contados (≤ cutoff y con real), diario y acumulado.
 *   forecast  = día contado → su actual (resultado final); día no contado → proyección del
 *               método elegido sobre el plan diario (conserva la estacionalidad de Fase 2).
 *   forecastGap = forecast − plan del periodo completo (gap esperado al cierre).
 *
 * Canales independientes: cada canal se proyecta con SUS índices. El total digital es la suma
 * de los canales día por día (su índice se muestra, pero no se usa para proyectar).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const Cal = () => FP.calendar;
  const P = () => FP.pacing;
  const G = () => FP.gap;
  const PI = () => FP.performanceIndex;
  const FM = () => FP.forecastMethods;

  const ADD = ['revenue', 'orders', 'trafficVolume'];
  const clone = (b) => (b ? P().completeBlock(b) : null);

  /** Configuración efectiva: defaults de config.forecast + lo que el usuario cambió. */
  function effectiveConfig(settings = {}) {
    const base = C().forecast;
    return {
      ...base, ...settings,
      methods: base.methods, windows: base.windows,
      driverWindows: { ...base.driverWindows, ...(settings.driverWindows || {}) },
      pacingThresholds: { ...base.pacingThresholds, ...(settings.pacingThresholds || {}) },
      alerts: { ...base.alerts, ...(settings.alerts || {}) }
    };
  }

  const today = () => Cal().toISODate(new Date());

  /* ---------- Entradas ---------- */

  /**
   * Plan por 'fecha|canal'. Prioridad: plan distribuido original (Fase 2) → plan importado.
   * @returns { map, source, versionId, label }
   */
  function planInputs({ year, planVersion = null, dataset = null }) {
    const map = new Map();
    if (planVersion) {
      FP.planning.planValuesMap(planVersion).forEach((v, k) => map.set(k, { ...v }));
      return { map, source: 'original_distributed_plan', versionId: planVersion.id, label: planVersion.label };
    }
    if (dataset) {
      FP.dataModel.allRecords(dataset).forEach((r) => {
        if (r.date.startsWith(`${year}-`) && r.plan && M().isFiniteNumber(r.plan.revenue)) {
          map.set(`${r.date}|${r.channel}`, { revenue: r.plan.revenue, orders: r.plan.orders, trafficVolume: r.plan.trafficVolume });
        }
      });
      return { map, source: map.size ? 'imported_plan' : 'none', versionId: null, label: map.size ? 'Plan importado (planData)' : 'Sin plan' };
    }
    return { map, source: 'none', versionId: null, label: 'Sin plan' };
  }

  /** Real por 'fecha|canal' desde el modelo canónico (observado o calculado; nunca inválido). */
  function actualInputs({ year, store, useHistoricalAsActual = true }) {
    const map = new Map();
    const read = (rec) => {
      const v = {};
      ADD.forEach((k) => { const c = rec.metrics[k]; v[k] = c && (c.source === 'observed' || c.source === 'calculated') ? c.value : null; });
      return v;
    };
    const put = (type, onlyMissing) => {
      if (!store) return;
      FP.dataStore.resolveLatest(store, type).forEach((rec) => {
        if (!rec.date || !rec.date.startsWith(`${year}-`)) return;
        const k = `${rec.date}|${rec.channel}`;
        if (onlyMissing && map.has(k)) return;
        map.set(k, { values: read(rec), source: type });
      });
    };
    put('actual', false);
    if (useHistoricalAsActual) put('historical', true);
    return map;
  }

  /* ---------- Filas diarias ---------- */

  function buildChannelRows({ year, ch, plans, actuals, tags, referenceDate, cutoff }) {
    return Cal().daysOfYear(year).map((date) => {
      const k = `${date}|${ch}`;
      const a = actuals.get(k);
      const closed = Boolean(cutoff) && date <= cutoff;
      const actual = a ? clone(a.values) : null;
      const wk = Cal().getWeekInfo(date);
      return {
        date, channel: ch, month: date.slice(0, 7), weekKey: wk.weekKey,
        temporal: P().temporalStatus(date, referenceDate),
        closed,
        counted: closed && Boolean(actual) && M().isFiniteNumber(actual.revenue),
        plan: clone(plans.get(k) || null),
        actual: closed ? actual : null,
        partialActual: !closed && actual ? actual : null, // p. ej. hoy en curso: se muestra, no cuenta
        actualSource: a ? a.source : null,
        tag: tags ? tags.get(date) || null : null
      };
    });
  }

  /** Total digital día por día: suma estricta de canales. Cuenta solo si todos los canales cuentan. */
  function buildTotalRows(byChannel) {
    const ids = C().channelIds;
    return byChannel[ids[0]].map((r0, i) => {
      const rows = ids.map((ch) => byChannel[ch][i]);
      const counted = rows.every((r) => r.counted);
      return {
        date: r0.date, channel: 'total', month: r0.month, weekKey: r0.weekKey, temporal: r0.temporal,
        closed: r0.closed, counted,
        plan: P().strictAggregate(rows.map((r) => r.plan)),
        actual: counted ? P().strictAggregate(rows.map((r) => r.actual)) : null,
        tag: null
      };
    });
  }

  /* ---------- Proyección ---------- */

  function projectRows(rows, methodId, mi) {
    return rows.map((r) => {
      if (r.counted) return { forecast: clone(r.actual), source: 'actual', fallback: false, reason: null };
      const p = FM().projectDay(methodId, r.plan, mi);
      if (!p.values) return { forecast: null, source: 'insufficient_data', fallback: false, reason: p.reason };
      return { forecast: p.values, source: r.closed ? 'projected_missing_actual' : 'projected', fallback: p.fallback, reason: p.reason };
    });
  }

  /** Confianza del forecast: peor estado de los índices usados + días comparables. */
  function forecastConfidence(methodId, mi, rows) {
    if (!rows.some((r) => r.plan)) return 'insufficient';
    if (methodId === 'A') return null; // baseline: no depende de índices
    const used = Object.values(mi.byMetric);
    if (used.some((i) => !M().isFiniteNumber(i.value))) return 'insufficient';
    const minDays = Math.min(...used.map((i) => i.comparableDays));
    if (minDays >= 90) return 'excellent';
    if (minDays >= 28) return 'sufficient';
    return 'limited';
  }

  /**
   * Suficiencia del histórico: lo que `forecastConfidence` mide realmente (días comparables), sin sugerir precisión.
   * excellent/sufficient → 'sufficient'; limited → 'limited'; insufficient → 'insufficient'; método A (no usa índices) → null.
   * `confidence` se conserva por compatibilidad (versiones guardadas y exports); la interfaz usa `historyAdequacy`.
   */
  function historyAdequacy(confidence) {
    if (!confidence) return null;
    return confidence === 'excellent' ? 'sufficient' : confidence;
  }

  /** Resumen de un conjunto de filas agrupado por una llave (mes o semana). */
  function groupSummaries(rows, keyOf, cutoff) {
    const groups = new Map();
    rows.forEach((r) => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    return [...groups.entries()].map(([key, list]) => ({ key, ...P().summarizePeriod(list, cutoff) }));
  }

  function dayView(r, cfg) {
    const pacing = r.counted ? P().blockGap(r.plan, r.actual) : null;
    let status;
    if (r.counted) status = G().pacingStatus(pacing.revenue.compliance, cfg.pacingThresholds);
    else if (r.closed) status = 'insufficient_data';
    else status = r.temporal === 'today' ? 'in_progress' : 'future';
    return { ...r, pacing, status };
  }

  /**
   * Resultado completo de una serie (canal o total) para el método elegido.
   */
  function seriesResult(rows, { methodId, cfg, cutoff, year, indices, mi }) {
    const proj = projectRows(rows, methodId, mi);
    const days = rows.map((r, i) => dayView({ ...r, forecast: proj[i].forecast, forecastSource: proj[i].source,
      fallback: proj[i].fallback, fallbackReason: proj[i].reason }, cfg));
    P().accumulate(days);
    const annual = P().summarizePeriod(days, cutoff);
    const months = groupSummaries(days, (r) => r.month, cutoff);
    const weeks = groupSummaries(days, (r) => r.weekKey, cutoff).map((w) => {
      const wi = Cal().getCalendarDay(w.firstDate);
      return { ...w, weekStart: wi.weekStart, weekEnd: wi.weekEnd, crossesMonths: w.firstDate.slice(0, 7) !== w.lastDate.slice(0, 7) };
    });
    const confidence = forecastConfidence(methodId, mi, rows);
    return {
      days, months, weeks, annual, indices, confidence, historyAdequacy: historyAdequacy(confidence),
      assumptions: FM().describeAssumptions(methodId, mi, cfg),
      projectedDays: proj.filter((p) => p.source !== 'actual').length,
      fallbackDays: proj.filter((p) => p.fallback).length,
      missingActualDays: days.filter((d) => d.closed && !d.counted).length,
      gap: G().buildGapLayer({ days, months, annual })
    };
  }

  /** Resumen anual rápido de un método (para la comparación). */
  function methodSummary(rows, methodId, indices, cfg, cutoff) {
    const mi = FM().methodIndices(methodId, indices, cfg);
    const proj = projectRows(rows, methodId, mi);
    const days = rows.map((r, i) => ({ ...r, forecast: proj[i].forecast }));
    const annual = P().summarizePeriod(days, cutoff);
    return { methodId, annual, forecastByDay: proj.map((p) => p.forecast), assumptions: FM().describeAssumptions(methodId, mi, cfg),
      confidence: forecastConfidence(methodId, mi, rows), historyAdequacy: historyAdequacy(forecastConfidence(methodId, mi, rows)), fallbackDays: proj.filter((p) => p.fallback).length };
  }

  /* ---------- Alertas descriptivas ---------- */

  function buildAlerts(series, label, channel, cfg) {
    const out = [];
    const a = cfg.alerts;
    const counted = series.days.filter((d) => d.counted && d.pacing && M().isFiniteNumber(d.pacing.revenue.gap));
    const fmtPct = (x) => `${(x * 100).toFixed(1)} %`;
    // Rachas de gap diario del mismo signo, al final del periodo contado
    const streak = (sign) => {
      let n = 0;
      for (let i = counted.length - 1; i >= 0; i--) {
        const g = counted[i].pacing.revenue.gap;
        if (sign < 0 ? g < 0 : g > 0) n++; else break;
      }
      return n;
    };
    const neg = streak(-1), pos = streak(1);
    if (neg >= a.streakDays) {
      const from = counted[counted.length - 1 - neg];
      const last = counted[counted.length - 1];
      out.push({ type: 'gap_growing', severity: 'attention', category: 'risk', channel, metric: 'revenue', days: neg,
        from: from ? from.cumulative.revenue.gap : 0, to: last.cumulative.revenue.gap,
        message: `${label}: el real quedó debajo del plan diario ${neg} días seguidos; el gap acumulado empeoró.` });
    }
    if (pos >= a.streakDays) {
      out.push({ type: 'gap_improving', severity: 'info', category: 'improving', channel, metric: 'revenue', days: pos,
        to: counted[counted.length - 1].cumulative.revenue.gap,
        message: `${label}: el real superó el plan diario ${pos} días seguidos; el gap acumulado mejoró.` });
    }
    const ytd = series.indices.ytd.revenue, rec = series.indices[cfg.recentWindow].revenue;
    if (M().isFiniteNumber(ytd.value) && M().isFiniteNumber(rec.value) && Math.abs(rec.value - ytd.value) >= a.recentVsCumulative) {
      out.push({ type: 'recent_vs_cumulative', severity: 'info', category: 'trend', channel, metric: 'revenue', recent: rec.value, cumulative: ytd.value,
        message: `${label}: performance ${cfg.windows[cfg.recentWindow].label.toLowerCase()} ${fmtPct(rec.value)} vs acumulado ${fmtPct(ytd.value)}.` });
    }
    const fg = series.annual && series.annual.forecastGap.revenue;
    if (fg && M().isFiniteNumber(fg.gapPct) && Math.abs(fg.gapPct) >= a.forecastGapPct) {
      out.push({ type: 'forecast_gap', severity: 'attention', category: fg.gapPct < 0 ? 'risk' : 'above', channel, metric: 'revenue', gapPct: fg.gapPct, gap: fg.gap,
        message: `${label}: el forecast de cierre está ${fmtPct(Math.abs(fg.gapPct))} ${fg.gapPct < 0 ? 'debajo' : 'arriba'} del plan anual.` });
    }
    if (series.missingActualDays > 0) {
      out.push({ type: 'missing_actual', severity: 'attention', category: 'data', channel, metric: 'revenue', days: series.missingActualDays,
        message: `${label}: ${series.missingActualDays} días pasados sin venta real; no cuentan en el pacing y se proyectan con el método.` });
    }
    return out;
  }

  /* ---------- Eventos ---------- */

  /** Pacing y forecast por evento, festivo o temporada del año. No asume causalidad. */
  function eventSummaries(byChannelSeries, tagsByChannel, cutoff) {
    const groups = new Map(); // label → { type, dates: Set }
    Object.entries(tagsByChannel).forEach(([, map]) => map.forEach((t, date) => {
      [['event', t.event], ['holiday', t.holiday], ['season', t.season]].forEach(([type, name]) => {
        if (!name) return;
        const key = `${type}:${FP.normalize.simplify(name)}`;
        if (!groups.has(key)) groups.set(key, { type, name, dates: new Set() });
        groups.get(key).dates.add(date);
      });
    }));
    return [...groups.values()].map((g) => {
      const dates = [...g.dates].sort();
      const byChannel = {};
      Object.entries(byChannelSeries).forEach(([ch, s]) => {
        const rows = s.days.filter((d) => g.dates.has(d.date));
        byChannel[ch] = rows.length ? P().summarizePeriod(rows, cutoff) : null;
      });
      const totalRows = dates.map((date) => {
        const rs = Object.values(byChannelSeries).map((s) => s.days.find((d) => d.date === date));
        const counted = rs.every((r) => r.counted);
        return { date, counted, closed: rs[0].closed,
          plan: P().strictAggregate(rs.map((r) => r.plan)),
          actual: counted ? P().strictAggregate(rs.map((r) => r.actual)) : null,
          forecast: P().strictAggregate(rs.map((r) => r.forecast)) };
      });
      const total = P().summarizePeriod(totalRows, cutoff);
      const gp = total && total.toDate.revenue.gapPct;
      return {
        type: g.type, name: g.name, start: dates[0], end: dates[dates.length - 1], days: dates.length, byChannel, total,
        observation: total && total.countedDays
          ? `Durante el periodo se observó un gap de ${M().isFiniteNumber(gp) ? (gp * 100).toFixed(1) + ' %' : 'no calculable'} en ${total.countedDays} días con venta real.`
          : 'El periodo aún no tiene días con venta real.'
      };
    }).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  /* ---------- Motor central ---------- */

  /**
   * Ejecuta pacing y forecast del año.
   * @param {object} p { year, store, planVersion, dataset, events, settings, referenceDate?, method? }
   */
  function runForecast(p) {
    const cfg = effectiveConfig(p.settings || {});
    const year = p.year;
    const referenceDate = p.referenceDate || cfg.referenceDate || today();
    const todayStatus = cfg.todayStatus;
    const cutoff = P().cutoffDate(referenceDate, todayStatus);
    const methodId = p.method || cfg.method;

    const plans = planInputs({ year, planVersion: p.planVersion, dataset: p.dataset });
    const actuals = actualInputs({ year, store: p.store, useHistoricalAsActual: cfg.useHistoricalAsActual });
    // Etiquetas del año: plan, actual y (si el histórico cuenta como real) histórico del mismo año + eventos configurados.
    const tagTypes = cfg.useHistoricalAsActual ? ['plan', 'actual', 'historical'] : ['plan', 'actual'];
    const tagRecords = p.store ? tagTypes.flatMap((t) => FP.dataStore.records(p.store, t)) : [];
    const tags = FP.planning.buildTags(year, { records: tagRecords, events: p.events || [] });

    const rowsByChannel = {};
    C().channelIds.forEach((ch) => {
      rowsByChannel[ch] = buildChannelRows({ year, ch, plans: plans.map, actuals, tags: tags[ch], referenceDate, cutoff });
    });

    const channels = {};
    const comparison = { byChannel: {}, total: {} };
    C().channelIds.forEach((ch) => {
      const rows = rowsByChannel[ch];
      const indices = PI().calculateAllIndices(rows, { cutoff, year, settings: cfg });
      const mi = FM().methodIndices(methodId, indices, cfg);
      channels[ch] = { channel: ch, ...seriesResult(rows, { methodId, cfg, cutoff, year, indices, mi }) };
      comparison.byChannel[ch] = Object.fromEntries(FM().METHOD_IDS.map((m) => [m, methodSummary(rows, m, indices, cfg, cutoff)]));
    });

    // Total digital: suma de canales (el forecast del total NO usa índices propios)
    const totalRows = buildTotalRows(rowsByChannel);
    const totalIndices = PI().calculateAllIndices(totalRows, { cutoff, year, settings: cfg });
    const sumForecast = (i, getter) => P().strictAggregate(C().channelIds.map((ch) => getter(ch, i)));
    const totalDays = totalRows.map((r, i) => {
      const fc = sumForecast(i, (ch) => channels[ch].days[i].forecast);
      const src = r.counted ? 'actual' : C().channelIds.some((ch) => channels[ch].days[i].forecastSource === 'insufficient_data') ? 'insufficient_data' : 'projected';
      return dayView({ ...r, forecast: fc, forecastSource: src, fallback: C().channelIds.some((ch) => channels[ch].days[i].fallback) }, cfg);
    });
    P().accumulate(totalDays);
    const totalAnnual = P().summarizePeriod(totalDays, cutoff);
    const total = {
      channel: 'total',
      days: totalDays,
      annual: totalAnnual,
      months: groupSummaries(totalDays, (r) => r.month, cutoff),
      weeks: groupSummaries(totalDays, (r) => r.weekKey, cutoff).map((w) => {
        const wi = Cal().getCalendarDay(w.firstDate);
        return { ...w, weekStart: wi.weekStart, weekEnd: wi.weekEnd, crossesMonths: w.firstDate.slice(0, 7) !== w.lastDate.slice(0, 7) };
      }),
      indices: totalIndices,
      confidence: worstConfidence(C().channelIds.map((ch) => channels[ch].confidence)),
      historyAdequacy: historyAdequacy(worstConfidence(C().channelIds.map((ch) => channels[ch].confidence))),
      projectedDays: totalDays.filter((d) => d.forecastSource !== 'actual').length,
      fallbackDays: totalDays.filter((d) => d.fallback).length,
      missingActualDays: totalDays.filter((d) => d.closed && !d.counted).length
    };
    total.gap = G().buildGapLayer({ days: totalDays, months: total.months, annual: totalAnnual });
    FM().METHOD_IDS.forEach((m) => {
      const annual = P().strictAggregate(C().channelIds.map((ch) => comparison.byChannel[ch][m].annual && comparison.byChannel[ch][m].annual.forecast));
      const plan = totalAnnual ? totalAnnual.plan : null;
      comparison.total[m] = { methodId: m, forecast: annual, forecastGap: P().blockForecastGap(plan, annual),
        confidence: worstConfidence(C().channelIds.map((ch) => comparison.byChannel[ch][m].confidence)),
        historyAdequacy: historyAdequacy(worstConfidence(C().channelIds.map((ch) => comparison.byChannel[ch][m].confidence))) };
    });

    const alerts = [
      ...buildAlerts(total, 'Total digital', 'total', cfg),
      ...C().channelIds.flatMap((ch) => buildAlerts(channels[ch], FP.dataModel.getChannel(ch).label, ch, cfg))
    ];

    return {
      schema: 'forecast_run',
      algorithmVersion: cfg.algorithmVersion,
      generatedAt: new Date().toISOString(),
      year, referenceDate, todayStatus, cutoff,
      method: { id: methodId, ...cfg.methods[methodId] },
      plan: { source: plans.source, versionId: plans.versionId, label: plans.label, days: plans.map.size },
      actual: { days: actuals.size, useHistoricalAsActual: cfg.useHistoricalAsActual },
      settings: cfg,
      channels, total, comparison,
      events: eventSummaries(channels, tags, cutoff),
      alerts
    };
  }

  /* ---------- Backtesting reproducible (precisión real, no suficiencia del histórico) ---------- */

  /**
   * Backtesting sobre filas diarias `{ date, counted, plan, actual }` de UNA serie.
   * Para cada fecha ancla T (la última, y hacia atrás cada `stepDays`) recalcula los índices solo con datos ≤ T,
   * proyecta los `horizon` días siguientes con el método y compara contra la venta real de esos días.
   * Es determinista: mismos datos y parámetros → mismo resultado. No toca el forecast vigente.
   * Métricas sobre `metric` (venta por omisión): MAE, WAPE = Σ|F−A| / ΣA, sesgo = Σ(F−A) / ΣA (+ sobreestima, − subestima)
   * y el mismo WAPE del plan sin ajustar (referencia). Días con real = 0 cuentan en MAE/WAPE pero se reportan aparte.
   * Devuelve `status: 'not_evaluated'` con motivo si hay menos de `minAnchors` anclas o `minDays` días evaluables.
   */
  function backtestRows(rows, { methodId, cfg, year, horizon = 7, metric = 'revenue', cache = null }) {
    const b = cfg.backtest;
    const empty = (reason) => ({ status: 'not_evaluated', reason, methodId, horizon, metric, anchors: 0, days: 0, mae: null, wape: null, biasPct: null, planWape: null, beatsPlan: null, zeroDays: 0 });
    if (methodId === 'A') return empty('El método A usa el plan sin ajustar: su error es el del propio plan (ver «Plan sin ajustar»).');
    const counted = rows.filter((r) => r.counted && r.actual && M().isFiniteNumber(r.actual[metric])).map((r) => r.date).sort();
    if (!counted.length) return empty('No hay días con venta real.');
    const addDays = (d, n) => Cal().toISODate(Cal().addDays(Cal().parseDate(d), n));
    const last = counted[counted.length - 1];
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const errs = []; let anchorsUsed = 0;
    for (let k = 0; k < b.anchors; k++) {
      const T = addDays(last, -(horizon + k * b.stepDays));
      if (T < `${year}-01-01`) break;
      let indices = cache ? cache.get(T) : null;
      if (!indices) { indices = PI().calculateAllIndices(rows, { cutoff: T, year, settings: cfg }); if (cache) cache.set(T, indices); }
      const mi = FM().methodIndices(methodId, indices, cfg);
      let n = 0;
      for (let i = 1; i <= horizon; i++) {
        const r = byDate.get(addDays(T, i));
        if (!r || !r.counted || !r.actual || !M().isFiniteNumber(r.actual[metric]) || !r.plan) continue;
        const p = FM().projectDay(methodId, r.plan, mi);
        if (!p.values || !M().isFiniteNumber(p.values[metric]) || !M().isFiniteNumber(r.plan[metric])) continue;
        errs.push({ f: p.values[metric], a: r.actual[metric], plan: r.plan[metric] }); n++;
      }
      if (n) anchorsUsed++;
    }
    if (anchorsUsed < b.minAnchors) return empty(`Solo ${anchorsUsed} de ${b.minAnchors} cortes evaluables con horizonte de ${horizon} días: falta histórico con venta real.`);
    if (errs.length < b.minDays) return empty(`Solo ${errs.length} días evaluables (mínimo ${b.minDays}).`);
    const sumA = errs.reduce((s, e) => s + e.a, 0);
    const abs = errs.reduce((s, e) => s + Math.abs(e.f - e.a), 0);
    const signed = errs.reduce((s, e) => s + (e.f - e.a), 0);
    const absPlan = errs.reduce((s, e) => s + Math.abs(e.plan - e.a), 0);
    if (!(sumA > 0)) return empty('La venta real del periodo evaluado suma 0: el error relativo no es calculable.');
    const wape = abs / sumA, planWape = absPlan / sumA;
    return { status: 'evaluated', reason: null, methodId, horizon, metric, anchors: anchorsUsed, days: errs.length,
      mae: abs / errs.length, wape, biasPct: signed / sumA, planWape, beatsPlan: wape < planWape,
      zeroDays: errs.filter((e) => e.a === 0).length };
  }

  /**
   * Backtesting por canal y horizonte con las mismas entradas que `runForecast`.
   * Evalúa los métodos que ajustan por desempeño (B, C, D); el A es el plan sin ajustar y se usa como referencia (`planWape`).
   * @returns { methodId (en uso), methods, byChannel: { [canal]: { [método]: { [horizonte]: resultado } } } }
   */
  function backtest(p) {
    const cfg = effectiveConfig(p.settings || {});
    const year = p.year;
    const referenceDate = p.referenceDate || cfg.referenceDate || today();
    const cutoff = P().cutoffDate(referenceDate, cfg.todayStatus);
    const methodId = p.method || cfg.method;
    const plans = planInputs({ year, planVersion: p.planVersion, dataset: p.dataset });
    const actuals = actualInputs({ year, store: p.store, useHistoricalAsActual: cfg.useHistoricalAsActual });
    const tagTypes = cfg.useHistoricalAsActual ? ['plan', 'actual', 'historical'] : ['plan', 'actual'];
    const tagRecords = p.store ? tagTypes.flatMap((t) => FP.dataStore.records(p.store, t)) : [];
    const tags = FP.planning.buildTags(year, { records: tagRecords, events: p.events || [] });
    const methods = FM().METHOD_IDS.filter((m) => m !== 'A');
    const out = { methodId, methods, referenceDate, cutoff, byChannel: {} };
    C().channelIds.forEach((ch) => {
      const rows = buildChannelRows({ year, ch, plans: plans.map, actuals, tags: tags[ch], referenceDate, cutoff });
      const cache = new Map();
      out.byChannel[ch] = {};
      methods.forEach((m) => {
        out.byChannel[ch][m] = {};
        cfg.backtest.horizons.forEach((h) => { out.byChannel[ch][m][h] = backtestRows(rows, { methodId: m, cfg, year, horizon: h, metric: cfg.backtest.metric, cache }); });
      });
    });
    return out;
  }

  /* ---------- Fecha en que se alcanza la meta (según el forecast) ---------- */

  const GOAL_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const longDay = (iso) => `${+iso.slice(8, 10)} de ${GOAL_MONTHS[+iso.slice(5, 7) - 1]}`;
  const daysBetween = (a, b) => Math.round((Cal().parseDate(b) - Cal().parseDate(a)) / 86400000);

  /**
   * Primer día del periodo en que el acumulado del forecast (real en los días cerrados, proyección en los demás) alcanza la meta.
   * @param days  días del motor con { date, counted, forecast }
   * @param opts  { from, to, goal, cutoff, metric }  (meta = plan total del periodo)
   * @returns { status, date, cumulative, goal, attainment, daysBeforeEnd }
   *   reached     → ya se cumplió con venta real (fecha ≤ corte y día contado)
   *   projected   → el forecast la alcanza en `date` (posterior al corte)
   *   missed      → el periodo ya cerró sin alcanzarla
   *   not_reached → el periodo sigue abierto y, al ritmo del forecast, no llega (attainment = cierre proyectado ÷ meta)
   *   no_goal | not_evaluable → sin meta o con días sin forecast antes de alcanzarla: no se afirma nada
   */
  function goalDate(days, { from, to, goal, cutoff, metric = 'revenue' }) {
    if (!M().isFiniteNumber(goal) || goal <= 0) return { status: 'no_goal', goal: null };
    let cum = 0, inRange = 0;
    for (const d of days) {
      if (d.date < from || d.date > to) continue;
      inRange++;
      const v = d.forecast ? d.forecast[metric] : null;
      if (!M().isFiniteNumber(v)) return { status: 'not_evaluable', goal, cumulative: cum, reason: `Hay días sin forecast (${d.date}).` };
      cum += v;
      if (cum + 0.005 >= goal) {
        const real = Boolean(cutoff) && d.date <= cutoff && d.counted;
        return { status: real ? 'reached' : 'projected', date: d.date, cumulative: cum, goal, attainment: cum / goal, daysBeforeEnd: daysBetween(d.date, to) };
      }
    }
    if (!inRange) return { status: 'not_evaluable', goal, cumulative: 0, reason: 'El periodo no tiene días.' };
    const closed = Boolean(cutoff) && to <= cutoff;
    return { status: closed ? 'missed' : 'not_reached', goal, cumulative: cum, attainment: cum / goal };
  }

  /** goalDate de una serie del motor para un mes ({type:'month', key:'YYYY-MM'}) o el año ({type:'year'}). */
  function periodGoal(series, period, { cutoff, metric = 'revenue' } = {}) {
    const p = period && period.type === 'month' ? series.months.find((m) => m.key === period.key) : series.annual;
    if (!p || !p.plan) return { status: 'no_goal', goal: null };
    return goalDate(series.days, { from: p.firstDate, to: p.lastDate, goal: p.plan[metric], cutoff, metric });
  }

  /** Texto corto para la persona; null si no hay nada honesto que decir. `scope`: 'mes' | 'año'. */
  function goalLabel(g, scope) {
    if (!g) return null;
    const pct = (v) => `${(v * 100).toFixed(1)} %`;
    if (g.status === 'reached') return `Meta del ${scope} cumplida el ${longDay(g.date)}`;
    if (g.status === 'projected') return `Alcanzas la meta del ${scope} el ${longDay(g.date)} (estimado)${g.daysBeforeEnd > 0 ? `, ${g.daysBeforeEnd} día${g.daysBeforeEnd === 1 ? '' : 's'} antes de cerrar` : ''}`;
    if (g.status === 'missed') return `Meta del ${scope} no cumplida: cerró en ${pct(g.attainment)}`;
    if (g.status === 'not_reached') return `Al ritmo actual no llegas a la meta del ${scope}: cierras en ${pct(g.attainment)} (estimado)`;
    return null;
  }

  function worstConfidence(list) {
    const order = ['insufficient', 'limited', 'sufficient', 'excellent'];
    const valid = list.filter(Boolean);
    if (!valid.length) return null;
    return order.find((o) => valid.includes(o));
  }

  /**
   * API compacta pedida por el brief.
   * @param {object} p { referenceDate, channel ('total' | id), period: { type: 'year'|'month'|'week', key }, method, …contexto de runForecast }
   * @returns { plan, actual, gap, performance, forecast, forecastGap, assumptions, method, confidence }
   */
  function generateForecast(p) {
    const run = p.run || runForecast(p);
    const series = !p.channel || p.channel === 'total' ? run.total : run.channels[p.channel];
    const period = p.period || { type: 'year' };
    let s = series.annual;
    if (period.type === 'month') s = series.months.find((m) => m.key === period.key) || null;
    if (period.type === 'week') s = series.weeks.find((w) => w.key === period.key) || null;
    return {
      referenceDate: run.referenceDate, cutoff: run.cutoff, channel: p.channel || 'total', period,
      plan: s ? s.plan : null,
      actual: s ? s.actualToDate : null,
      gap: s ? s.toDate : null,
      performance: series.indices,
      forecast: s ? s.forecast : null,
      forecastGap: s ? s.forecastGap : null,
      assumptions: series.assumptions || { method: run.method.id, note: 'Total digital = suma de canales.' },
      method: run.method,
      confidence: series.confidence
    };
  }

  FP.forecastEngine = { effectiveConfig, planInputs, actualInputs, buildChannelRows, buildTotalRows, projectRows,
    runForecast, generateForecast, worstConfidence, buildAlerts, historyAdequacy, backtest, backtestRows, goalDate, periodGoal, goalLabel, longDay };
})(typeof window !== 'undefined' ? window : globalThis);
