/**
 * homeSummaryEngine.js — Resumen general de Inicio (4 bloques). Solo LEE: no crea un cálculo nuevo, compone los que ya existen.
 *  1. why      Por qué cambió la venta: Δ venta del periodo contra el periodo anterior, partido en tráfico → conversión → ticket
 *              (el motor de «Tráfico y conversión») sobre los MISMOS días en ambos periodos (los pares de días del Diagnóstico).
 *  2. where    Dónde mirar hoy: el segmento que más pesó en cada dimensión de GA4 (de Segmentos) y los avisos de calidad del tráfico.
 *  3. channels Cómo va cada canal: cumplimiento y forecast contra meta de Pacing/Forecast, con el estado de pacing configurado.
 *  4. trust    Confianza de los datos: hasta dónde llega la venta real, cuántos días se compararon y qué avisos hay (Calidad de datos).
 * Cada bloque devuelve { status, ... }: nunca inventa una cifra; si falta un dato, dice cuál.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const C = () => FP.config;
  const COMBO_DIMS = ['device_source'];        // combinación de dos dimensiones: repite lo que ya dicen dispositivo y fuente

  const periodOf = (state, h) => (h.periodType === 'month' && h.periodKey ? { type: 'month', key: h.periodKey } : { type: 'year', key: String(state.year) });

  /** 1 · Por qué cambió la venta (mismos días, orden de efectos tráfico → conversión → ticket). */
  function why(state, ch, period) {
    const run = state.fc && state.fc.run;
    if (!run || run.plan.source === 'none') return { status: 'no_run' };
    const DE = FP.driverEngine;
    const built = DE.buildPairs({ comparison: 'actual_vs_previous', period, channel: ch, run, rf: null, store: state.store });
    const coverage = { expected: built.expected, paired: built.pairs.length, currentRange: built.currentRange, baselineRange: built.baselineRange };
    if (!built.pairs.length) return { status: 'no_base', coverage, note: built.notes[0] || null };
    const cur = DE.aggregate(built.pairs.map((p) => p.current)), base = DE.aggregate(built.pairs.map((p) => p.baseline));
    const delta = cur.revenue - base.revenue;
    const mt = (a) => ({ sessions: a.trafficVolume, orders: a.orders, revenue: a.revenue, cr: a.conversionRate, aov: a.aov });
    const out = { status: 'ok', delta, current: cur.revenue, baseline: base.revenue, coverage, effects: null, why: null, metrics: { base: mt(base), cur: mt(cur) } };
    const ok = [cur, base].every((a) => fin(a.trafficVolume) && a.trafficVolume > 0 && fin(a.orders) && fin(a.revenue));
    if (!ok) { out.why = 'no_traffic'; return out; }
    const e = FP.trafficConversionEngine.effects({ t: base.trafficVolume, o: base.orders, r: base.revenue }, { t: cur.trafficVolume, o: cur.orders, r: cur.revenue });
    out.effects = { traffic: e.traffic, cr: e.cr, aov: e.aov, delta: e.delta };
    out.reconciles = Math.abs(e.traffic + e.cr + e.aov - delta) < 0.5;
    const rank = Object.entries({ traffic: e.traffic, cr: e.cr, aov: e.aov }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    out.dominant = rank[0][0];
    out.kind = e.kind;
    return out;
  }


  /**
   * 1b · Por qué va así contra el PLAN (la misma pregunta que «¿Cómo voy?»): Nivel 1 del Diagnóstico (Plan vs Actual, mismo método),
   * así que las cifras son idénticas a las de Diagnóstico → Nivel 1. Solo LEE el motor de drivers.
   */
  function whyPlan(state, ch, period) {
    const run = state.fc && state.fc.run;
    if (!run || run.plan.source === 'none') return { status: 'no_run' };
    const DE = FP.driverEngine;
    const built = DE.buildPairs({ comparison: 'actual_vs_plan', period, channel: ch, run, rf: null, store: state.store });
    const coverage = { expected: built.expected, paired: built.pairs.length, currentRange: built.currentRange, baselineRange: built.baselineRange };
    if (!built.pairs.length) return { status: 'no_base', coverage, note: built.notes[0] || null };
    const l1 = DE.level1(built.pairs, {});
    const drivers = (l1.drivers || []).filter((d) => fin(d.contribution));
    const mt = (a) => ({ sessions: a.trafficVolume, orders: a.orders, revenue: a.revenue, cr: a.conversionRate, aov: a.aov });
    const byId = {}; drivers.forEach((d) => { byId[d.driver] = d.contribution; });
    const effects = ['trafficVolume', 'conversionRate', 'aov'].every((k) => fin(byId[k])) ? { traffic: byId.trafficVolume, cr: byId.conversionRate, aov: byId.aov, delta: l1.gap.abs } : null;
    return { status: 'ok', gap: l1.gap.abs, gapPct: l1.gap.pct, current: l1.gap.current, baseline: l1.gap.baseline, coverage, effects,
      metrics: { base: mt(l1.baseline), cur: mt(l1.current) },
      drivers: drivers.map((d) => ({ id: d.driver, label: d.label, contribution: d.contribution, baseline: d.baseline, current: d.current, deltaPct: d.deltaPct })), method: l1.attribution && l1.attribution.method };
  }

  /** 3 · Cómo va cada canal: las mismas cifras de Pacing/Forecast que las tarjetas de Inicio, canal por canal. */
  function channels(state, period) {
    const run = state.fc && state.fc.run;
    if (!run || run.plan.source === 'none') return { status: 'no_run', rows: [] };
    const rows = C().channels.map((c) => {
      const s = run.channels[c.id];
      const p = period.type === 'month' ? s.months[+period.key.slice(5, 7) - 1] : s.annual;
      const counted = (p && p.countedDays) || 0;
      const hasPlan = Boolean(p && p.plan && fin(p.plan.revenue));
      const compliance = p && p.toDate && p.toDate.revenue ? p.toDate.revenue.compliance : null;
      const fg = p && p.forecastGap ? p.forecastGap.revenue : null;
      const row = { id: c.id, label: c.label, actual: p && p.actualToDate ? p.actualToDate.revenue : null, compliance: fin(compliance) ? compliance : null,
        forecastGapPct: fg && fin(fg.gapPct) ? fg.gapPct : null, countedDays: counted, hasPlan, future: Boolean(p && p.status === 'future') };
      row.state = !hasPlan ? 'no_plan' : (!counted || row.future) ? 'no_actual' : 'ok';
      row.pacing = row.state === 'ok' ? FP.gap.pacingStatus(row.compliance, run.settings.pacingThresholds) : null;
      return row;
    });
    return { status: 'ok', rows };
  }

  /** 4 · ¿Cuándo llego a la meta?: día en que el forecast acumulado alcanza el plan total del periodo (mes o año) del canal elegido. */
  function goal(state, ch, period) {
    const run = state.fc && state.fc.run;
    if (!run || run.plan.source === 'none') return null;
    const series = ch === 'total' ? run.total : run.channels[ch];
    if (!series) return null;
    const g = FP.forecastEngine.periodGoal(series, period, { cutoff: run.cutoff });
    return { ...g, scope: period.type === 'month' ? 'mes' : 'año', label: FP.forecastEngine.goalLabel(g, period.type === 'month' ? 'mes' : 'año') };
  }

  /** 2 · Dónde mirar hoy: por dimensión de GA4, el segmento con mayor |Δ venta| fuera de «Otros»; y los avisos de calidad del tráfico. */
  function where(state, ch, period) {
    if (!state.store || !state.store.segments || !(state.store.segments.records || []).length) return { status: 'no_segments' };
    const recs = FP.dataStore.segmentIndex(state.store);
    const dimsCfg = C().diagnostics.dimensions;
    const present = [...recs.byDim.keys()].filter(Boolean).filter((d) => !COMBO_DIMS.includes(d));
    const range = FP.app.periodRange(period.type, period.key) || { from: `${state.year}-01-01`, to: `${state.year}-12-31` };
    const picks = [], quality = [], seenQ = new Set();
    let analyzed = 0;
    present.forEach((d) => {
      const res = FP.dataStore.cached(state.store, `homewhere|${range.from}|${range.to}|${period.type}|${ch}|${d}`, ['segments'],
        () => FP.segmentsView.summarize(recs, { from: range.from, to: range.to, channel: ch, dimension: d, periodType: period.type }));
      if (!res.rows.length) return;
      const dec = FP.dataStore.cached(state.store, `homewhere-dec|${range.from}|${range.to}|${period.type}|${ch}|${d}`, ['segments'], () => FP.trafficConversionEngine.analyze(res));
      if (!dec || dec.status !== 'ok') return;
      analyzed++;
      const label = (dimsCfg[d] && dimsCfg[d].label) || d;
      const items = dec.allItems.filter((x) => x.grouped === 0 && fin(x.delta) && Math.abs(x.delta) > 0.5);
      if (items.length) {
        const top = items.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
        picks.push({ dimension: d, dimensionLabel: label, segment: top.label, delta: top.delta, dominant: top.dominant, effect: top[top.dominant], traffic: top.traffic, cr: top.cr, aov: top.aov, minSessions: dec.minSessions });
      }
      (dec.quality || []).forEach((f) => {
        const k = `${f.type}|${f.label}`;
        if (seenQ.has(k)) return;
        seenQ.add(k); quality.push({ ...f, dimension: d, dimensionLabel: label });
      });
    });
    if (!analyzed) return { status: 'no_rows', note: `Los segmentos cargados no cubren ${period.type === 'month' ? 'este mes' : 'este año'} y su periodo anterior.` };
    picks.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { status: 'ok', picks: picks.slice(0, 3), quality: quality.slice(0, 3), qualityTotal: quality.length, analyzed };
  }

  /** 4 · Confianza de los datos. */
  function trust(state, whyRes) {
    const q = state.quality || (FP.coverage && state.store ? FP.coverage.summarize(state.store) : null);
    const byType = (q && q.byType) || {};
    const flagged = (q && q.totals ? q.totals.warning + q.totals.error + q.totals.rejected : 0) || 0;
    const seg = byType.segments && !(byType.segments.status === 'empty') ? byType.segments : null;
    let segMax = null;
    if (seg && state.store.segments && state.store.segments.records && state.store.segments.records.length) {
      const idx = FP.dataStore.segmentIndex(state.store);
      idx.byDim.forEach((m) => m.forEach((_, d) => { if (!segMax || d > segMax) segMax = d; }));
    }
    const pm = FP.productStore && FP.productStore.available && FP.productStore.available() ? FP.productStore.meta : null;
    return {
      status: 'ok',
      lastActual: state.fc ? state.fc.lastActualDate : null,
      quality: q ? { status: q.status, text: q.statusText, flagged } : null,
      coverage: whyRes && whyRes.coverage ? whyRes.coverage : null,
      segments: seg ? { files: seg.files, to: segMax } : null,
      products: pm && pm.batches ? { to: pm.dateMax || null, from: pm.dateMin || null } : null
    };
  }

  /** Todo el resumen para el canal y periodo de Inicio. */
  function compute(state, h) {
    const period = periodOf(state, h), ch = h.channel || 'total';
    const w = why(state, ch, period);
    return { channel: ch, period, why: w, whyPlan: whyPlan(state, ch, period), where: where(state, ch, period), channels: channels(state, period), goal: goal(state, ch, period), trust: trust(state, w) };
  }

  FP.homeSummaryEngine = { compute, why, where, channels, trust, periodOf, goal };
})(typeof window !== 'undefined' ? window : globalThis);
