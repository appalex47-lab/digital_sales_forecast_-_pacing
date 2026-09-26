/**
 * reforecastEngine.js — Reforecast dinámico (Fase 4).
 *
 *   PLAN ORIGINAL (solo lectura) ─┐
 *   ACTUAL (días contados)  ──────┼─▶ pendiente = max(0, meta − actual)  ─▶ reparto por pesos futuros
 *   FUTURE WEIGHTS (Fase 2) ──────┘                                          ─▶ REFORECAST REQUERIDO
 *
 * Tres realidades separadas, en campos distintos:
 *   plan        lo que originalmente debíamos vender (nunca cambia)
 *   forecast    lo que estimamos que ocurrirá (Fase 3, método en uso)
 *   reforecast  lo que TENDRÍA que ocurrir para conservar la meta: días contados = actual (congelados),
 *               días futuros del horizonte = requerido, fuera del horizonte = plan.
 *
 * Algoritmo por canal (independiente):
 *   1. Leer plan original.  2. Leer actual acumulado (días ≤ corte con real).
 *   3. Identificar el periodo abierto según el horizonte (año o mes en curso).
 *   4. pendiente = max(0, meta − actual); exceso (surplus) = max(0, actual − meta).
 *   5. Pesos futuros = venta del plan original de cada día futuro (FP.futureWeights).
 *   6. Excluir días cerrados.  7. Normalizar sobre los días restantes.
 *   8. Repartir el pendiente exacto al centavo (mayor residuo, FP.distribution).
 *   9. Validar: actual + Σ requerido = meta.  10. Pedidos y volumen por supuesto de AOV y CR.
 * El total digital es la suma de canales. Guardar versión: FP.reforecastVersioning.
 *
 * Días pasados sin real: no se pueden vender ni se congelan con un valor; quedan en null
 * (no reciben requerimiento) y se reportan. Día de referencia "en curso": no está cerrado,
 * recibe requerimiento y su real parcial se muestra como avance, sin descontarse.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const D = () => FP.distribution;
  const P = () => FP.pacing;

  const ADD = ['revenue', 'orders', 'trafficVolume'];
  const fin = (v) => M().isFiniteNumber(v);
  const cents = (v) => Math.round(v * 100) / 100;
  const LEVELS = ['insufficient', 'limited', 'sufficient', 'excellent'];
  const worst = (list) => { const v = list.filter(Boolean); return v.length ? LEVELS.find((l) => v.includes(l)) : null; };
  const levelOf = (n, t) => (n >= t.excellent ? 'excellent' : n >= t.sufficient ? 'sufficient' : n >= t.limited ? 'limited' : 'insufficient');

  function effectiveConfig(settings = {}) {
    const base = C().reforecast;
    return { ...base, ...settings, horizons: base.horizons, assumptionSources: base.assumptionSources };
  }

  /* ---------- Piezas puras ---------- */

  /**
   * Pendiente y exceso de un periodo. Nunca negativo: el exceso se registra aparte.
   * @returns { target, actual, remaining, surplus, met }
   */
  function calculateRemaining(target, actual) {
    if (!fin(target) || !fin(actual)) return { target: fin(target) ? target : null, actual: fin(actual) ? actual : null, remaining: null, surplus: null, met: null };
    const diff = cents(target - actual);
    return { target, actual, remaining: Math.max(0, diff), surplus: Math.max(0, cents(-diff)), met: diff <= 0 };
  }

  /**
   * Reparte `remaining` entre días futuros según sus pesos.
   * - Pesos > 0: normalizados sobre los días restantes (future_weighted_distribution).
   * - Peso 0: el día recibe 0, salvo `zeroWeightFloor` > 0 (mínimo explícito del usuario).
   * - Sin pesos utilizables: fallback configurable (uniform_future_distribution), marcado.
   * @returns { amounts, normalized, method, usedFallback }
   */
  function redistribute(remaining, weights, { fallback = C().reforecast.fallback, zeroWeightFloor = 0, decimals = 2 } = {}) {
    const n = weights.length;
    if (!n) return { amounts: [], normalized: [], method: 'no_future_days', usedFallback: false };
    let w = weights.map((x) => (fin(x) && x > 0 ? x : 0));
    let method = 'future_weighted_distribution';
    let usedFallback = false;
    const positive = w.filter((x) => x > 0);
    if (positive.length && zeroWeightFloor > 0) {
      const mean = positive.reduce((a, b) => a + b, 0) / positive.length;
      w = w.map((x) => (x > 0 ? x : zeroWeightFloor * mean));
    }
    if (!positive.length) {
      if (fallback !== 'uniform_future_distribution') {
        return { amounts: weights.map(() => null), normalized: weights.map(() => null), method: 'no_weights', usedFallback: false };
      }
      w = weights.map(() => 1);
      method = 'uniform_future_distribution';
      usedFallback = true;
    }
    const normalized = FP.weights.normalizeWeights(w);
    const amounts = fin(remaining) ? D().distributeTarget(remaining, w, { decimals }) : weights.map(() => null);
    return { amounts, normalized, method, usedFallback };
  }

  /**
   * API compacta equivalente al pseudocódigo del brief.
   * @param {object} p { target, accumulated, futureDays: [{ date, futureWeight }], fallback, zeroWeightFloor }
   */
  function generateReforecast({ target, accumulated, futureDays = [], fallback, zeroWeightFloor }) {
    const rem = calculateRemaining(target, accumulated);
    const red = redistribute(rem.remaining, futureDays.map((d) => d.futureWeight), { fallback, zeroWeightFloor });
    return {
      remainingTarget: rem.remaining, surplus: rem.surplus, met: rem.met, method: red.method,
      confidence: red.usedFallback ? 'limited' : null,
      reforecastDays: futureDays.map((d, i) => ({ date: d.date, normalizedWeight: red.normalized[i], reforecast: red.amounts[i] }))
    };
  }

  /** Bloque requerido: venta → pedidos (÷ AOV) → volumen (÷ CR). Sin supuesto: null, nunca 0. */
  function requiredBlock(revenue, a) {
    if (!fin(revenue)) return null;
    let orders = null, traffic = null;
    if (revenue === 0) { orders = 0; traffic = 0; }
    else if (fin(a.aov) && a.aov > 0) {
      orders = revenue / a.aov;
      if (fin(a.conversionRate) && a.conversionRate > 0) traffic = orders / a.conversionRate;
    }
    return {
      revenue, orders, trafficVolume: traffic,
      conversionRate: fin(orders) && fin(traffic) && traffic > 0 ? orders / traffic : (fin(a.conversionRate) ? a.conversionRate : null),
      aov: fin(orders) && orders > 0 ? revenue / orders : (fin(a.aov) ? a.aov : null)
    };
  }

  /** Suma que omite nulos (reporta cuántos faltaron). CR y AOV desde las sumas. */
  function lenientSum(blocks) {
    const out = {};
    let missing = 0;
    ADD.forEach((k) => {
      const vals = blocks.filter((b) => b && fin(b[k])).map((b) => b[k]);
      const sum = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      out[k] = sum === null ? null : k === 'revenue' ? cents(sum) : Math.round(sum * 1e6) / 1e6;
    });
    blocks.forEach((b) => { if (!b || !fin(b.revenue)) missing++; });
    return { block: P().completeBlock(out), missing };
  }
  const strict = (blocks) => (blocks.length ? P().strictAggregate(blocks) : null);

  function pressureOf(required, planOpen) {
    const out = {};
    C().metricKeys.forEach((k) => {
      const r = required ? required[k] : null, p = planOpen ? planOpen[k] : null;
      const q = M().safeDivide(r, p);
      out[k] = { required: r, plan: p, delta: fin(r) && fin(p) ? r - p : null, pressure: fin(q) ? q - 1 : null };
    });
    return out;
  }

  /* ---------- Horizonte ---------- */

  /** Índices de días del periodo abierto según el horizonte. */
  function openGroup(days, horizon, year) {
    if (horizon === 'month') {
      const firstOpen = days.find((d) => !d.closed);
      const month = firstOpen ? firstOpen.month : days[days.length - 1].month;
      return { type: 'month', key: month, idx: days.map((d, i) => (d.month === month ? i : -1)).filter((i) => i >= 0) };
    }
    return { type: 'year', key: String(year), idx: days.map((_, i) => i) };
  }

  /* ---------- Serie por canal ---------- */

  function assumptionFor(r, source, ytd) {
    if (source === 'forecast') return { aov: r.forecast && r.forecast.aov, conversionRate: r.forecast && r.forecast.conversionRate };
    if (source === 'actual_ytd') return { aov: ytd && ytd.aov, conversionRate: ytd && ytd.conversionRate };
    return { aov: r.plan && r.plan.aov, conversionRate: r.plan && r.plan.conversionRate };
  }

  function channelReforecast({ ch, src, planVersion, cfg, year }) {
    const weights = FP.futureWeights.futureWeights({ planVersion, channel: ch, days: src.days });
    const rows = src.days.map((d) => ({
      date: d.date, channel: ch, month: d.month, weekKey: d.weekKey, temporal: d.temporal,
      closed: d.closed, counted: d.counted, missingActual: d.closed && !d.counted,
      plan: d.plan, actual: d.actual, partialActual: d.partialActual || null, forecast: d.forecast, tag: d.tag,
      weight: weights.get(d.date), normalizedWeight: null, open: false, required: null, reforecast: null, kind: null
    }));

    // 3–9: pendiente del periodo abierto y reparto
    const g = openGroup(rows, cfg.horizon, year);
    const gRows = g.idx.map((i) => rows[i]);
    const planBlocks = gRows.map((r) => r.plan);
    const target = planBlocks.every((b) => b && fin(b.revenue)) ? D().exactSum(planBlocks.map((b) => b.revenue)) : null;
    const countedRows = gRows.filter((r) => r.counted);
    const actualToDate = D().exactSum(countedRows.map((r) => r.actual.revenue));
    const future = gRows.filter((r) => !r.closed);
    const rem = calculateRemaining(target, actualToDate);
    const red = redistribute(rem.remaining, future.map((r) => r.weight.weight), cfg);
    future.forEach((r, j) => { r.open = true; r.normalizedWeight = red.normalized[j]; r.requiredRevenue = red.amounts[j]; });
    const requiredTotal = future.length && fin(rem.remaining) ? D().exactSum(red.amounts) : 0;
    const horizon = {
      type: g.type, key: g.key, target, actualToDate, remaining: rem.remaining, surplus: rem.surplus, met: rem.met,
      countedDays: countedRows.length, futureDays: future.length, missingActualDays: gRows.filter((r) => r.missingActual).length,
      weightMethod: red.method, usedFallback: red.usedFallback, requiredTotal,
      closes: target === null ? null : future.length
        ? D().exactSum([actualToDate, requiredTotal]) === D().exactSum([Math.max(target, actualToDate)])
        : null
    };

    // 10: pedidos y volumen requeridos; bloque de reforecast por día
    const ytd = src.annual ? src.annual.actualToDate : null;
    let missingAssumptions = 0;
    rows.forEach((r) => {
      if (r.counted) { r.reforecast = P().completeBlock(r.actual); r.kind = 'actual'; }
      else if (r.missingActual) { r.reforecast = null; r.kind = 'missing_actual'; }
      else if (r.open) {
        const a = assumptionFor(r, cfg.assumptionSource, ytd);
        r.assumption = a;
        r.required = requiredBlock(r.requiredRevenue, a);
        if (r.required && r.required.revenue > 0 && !fin(r.required.trafficVolume)) missingAssumptions++;
        r.reforecast = r.required;
        r.kind = 'required';
      } else { r.reforecast = P().completeBlock(r.plan); r.kind = 'plan'; }
      r.delta = r.required ? pressureOf(r.required, r.plan) : null;
    });

    return { rows, horizon, missingAssumptions };
  }

  /* ---------- Resúmenes ---------- */

  function summarize(rows, runPeriod) {
    const openRows = rows.filter((r) => r.required);
    const planOpen = strict(openRows.map((r) => r.plan));
    const required = strict(openRows.map((r) => r.required)) || (openRows.length ? null : null);
    const refc = lenientSum(rows.map((r) => r.reforecast));
    const plan = runPeriod ? runPeriod.plan : strict(rows.map((r) => r.plan));
    const actualToDate = runPeriod ? runPeriod.actualToDate : null;
    const planToDate = runPeriod ? runPeriod.planToDate : null;
    const ahead = actualToDate && planToDate && fin(actualToDate.revenue) && fin(planToDate.revenue) ? cents(actualToDate.revenue - planToDate.revenue) : null;
    return {
      key: runPeriod ? runPeriod.key || null : null,
      firstDate: rows[0].date, lastDate: rows[rows.length - 1].date,
      status: runPeriod ? runPeriod.status : null,
      days: rows.length, countedDays: rows.filter((r) => r.counted).length, openDays: openRows.length,
      missingActualDays: rows.filter((r) => r.missingActual).length,
      plan, planToDate, actualToDate,
      forecast: runPeriod ? runPeriod.forecast : null,
      reforecast: refc.block, reforecastMissingDays: refc.missing,
      required, planOpen,
      recoveryGap: required && planOpen && fin(required.revenue) && fin(planOpen.revenue) ? cents(required.revenue - planOpen.revenue) : null,
      pressure: openRows.length ? pressureOf(required, planOpen) : null,
      targetRemaining: calculateRemaining(plan ? plan.revenue : null, actualToDate ? actualToDate.revenue : 0),
      surplusVsPlanToDate: ahead === null ? null : Math.max(0, ahead),
      forecastGap: runPeriod ? runPeriod.forecastGap : null,
      reforecastVsPlan: P().blockGap(plan, refc.block)
    };
  }

  function groupBy(rows, keyOf, runPeriods) {
    const map = new Map();
    rows.forEach((r) => { const k = keyOf(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); });
    const byKey = new Map((runPeriods || []).map((p) => [p.key, p]));
    return [...map.entries()].map(([k, rs]) => {
      const s = summarize(rs, byKey.get(k) || null);
      s.key = k;
      return s;
    });
  }

  /* ---------- Drivers, escenarios y realismo ---------- */

  function historicalSamePeriod(store, ch, dates, year) {
    if (!store) return null;
    const md = new Set(dates.map((d) => d.slice(5)));
    const sums = { revenue: 0, orders: 0, trafficVolume: 0 };
    const years = new Set();
    let n = 0;
    FP.dataStore.resolveLatest(store, 'historical').forEach((r) => {
      if (r.channel !== ch || !r.date || +r.date.slice(0, 4) >= year || !md.has(r.date.slice(5))) return;
      const v = (k) => (r.metrics[k] && (r.metrics[k].source === 'observed' || r.metrics[k].source === 'calculated') ? r.metrics[k].value : null);
      if (![v('revenue'), v('orders'), v('trafficVolume')].every(fin)) return;
      ADD.forEach((k) => { sums[k] += v(k); });
      years.add(r.date.slice(0, 4));
      n++;
    });
    if (!n) return null;
    const yc = years.size;
    return { years: [...years].sort(), days: n, coverage: M().safeDivide(n, dates.length * yc),
      trafficPerYear: sums.trafficVolume / yc, ordersPerYear: sums.orders / yc, revenuePerYear: sums.revenue / yc,
      conversionRate: M().safeDivide(sums.orders, sums.trafficVolume), aov: M().safeDivide(sums.revenue, sums.orders) };
  }

  /**
   * Requerimiento por driver para los días abiertos del horizonte.
   * Escenarios puramente matemáticos sobre la base del forecast (lo esperado):
   *   A · volumen requerido con CR y AOV del forecast
   *   B · CR requerido con volumen y AOV del forecast
   *   C · AOV requerido con volumen y CR del forecast
   * No se elige ni se recomienda ninguno.
   */
  function driverRequirements(openRows, { store = null, ch = null, year, assumptionSource }) {
    if (!openRows.length) return null;
    const required = strict(openRows.map((r) => r.required));
    const forecast = strict(openRows.map((r) => r.forecast));
    const plan = strict(openRows.map((r) => r.plan));
    const R = required ? required.revenue : null;
    const f = forecast || {};
    const div = (a, b) => M().safeDivide(a, b);
    const sc = (req, base, kind) => ({ required: req, base, delta: fin(req) && fin(base) ? req - base : null,
      deltaPct: fin(req) && fin(base) && base !== 0 ? req / base - 1 : null, kind });
    const hist = ch ? historicalSamePeriod(store, ch, openRows.map((r) => r.date), year) : null;
    const extra = fin(R) && fin(f.revenue) ? R - f.revenue : null;
    return {
      days: openRows.length, from: openRows[0].date, to: openRows[openRows.length - 1].date,
      assumptionSource,
      chain: {
        revenue: R, aov: required ? required.aov : null, orders: required ? required.orders : null,
        conversionRate: required ? required.conversionRate : null, trafficVolume: required ? required.trafficVolume : null
      },
      plan, forecast, required,
      scenarios: {
        A: { label: 'Volumen', holds: 'CR y AOV del forecast', ...sc(div(R, (f.conversionRate || 0) * (f.aov || 0)), f.trafficVolume, 'trafficVolume') },
        B: { label: 'CR', holds: 'Volumen y AOV del forecast', ...sc(div(R, (f.trafficVolume || 0) * (f.aov || 0)), f.conversionRate, 'conversionRate') },
        C: { label: 'AOV', holds: 'Volumen y CR del forecast', ...sc(div(R, (f.trafficVolume || 0) * (f.conversionRate || 0)), f.aov, 'aov') }
      },
      sensitivity: {
        additionalRevenue: extra,
        additionalOrdersAtForecastAov: fin(extra) && fin(f.aov) && f.aov > 0 ? extra / f.aov : null,
        additionalTrafficAtForecastCrAov: fin(extra) && fin(f.aov) && fin(f.conversionRate) && f.aov > 0 && f.conversionRate > 0 ? extra / f.aov / f.conversionRate : null
      },
      historical: hist
    };
  }

  /* ---------- Confianza ---------- */

  function confidenceOf(result, cfg) {
    const h = result.horizon;
    const open = result.rows.filter((r) => r.open);
    const comps = [];
    if (h.futureDays) {
      let lvl, note;
      if (h.usedFallback) { lvl = 'limited'; note = 'Sin pesos futuros: reparto uniforme.'; }
      else {
        const srcs = new Set(open.map((r) => r.weight.source));
        const confs = open.map((r) => r.weight.confidence).filter(Boolean);
        if (srcs.has('fallback')) { lvl = 'limited'; note = 'Parte del plan se distribuyó sin histórico (reparto estándar).'; }
        else if (confs.length) { lvl = worst(confs); note = 'Confianza de la estacionalidad del plan original.'; }
        else { lvl = 'sufficient'; note = 'Pesos del plan importado (sin estacionalidad calculada).'; }
      }
      comps.push({ id: 'weights', label: 'Pesos futuros', level: lvl, note });
      comps.push({ id: 'futureDays', label: 'Días futuros', level: levelOf(h.futureDays, cfg.futureDaysThresholds), note: `${h.futureDays} días reciben el pendiente.` });
    }
    comps.push({ id: 'actualDays', label: 'Días con real', level: h.countedDays ? levelOf(h.countedDays, cfg.actualDaysThresholds) : 'limited',
      note: `${h.countedDays} días con real en el horizonte${h.missingActualDays ? `; ${h.missingActualDays} días pasados sin real` : ''}.` });
    if (h.missingActualDays) comps.push({ id: 'gaps', label: 'Días pasados sin real', level: 'limited', note: 'No reciben requerimiento; el pendiente puede estar sobrestimado.' });
    comps.push({ id: 'metrics', label: 'Consistencia de métricas', level: result.missingAssumptions ? 'insufficient' : 'sufficient',
      note: result.missingAssumptions ? `${result.missingAssumptions} días sin AOV o CR para derivar pedidos y volumen.` : 'Pedidos y volumen derivados con AOV y CR disponibles.' });
    return { level: worst(comps.map((c) => c.level)), components: comps,
      note: 'Describe la solidez de los insumos del cálculo; no es una probabilidad de alcanzar la meta.' };
  }

  /* ---------- Motor central ---------- */

  /**
   * @param {object} p { run (forecast_run de Fase 3), planVersion (plan original), store, settings, simulated }
   */
  function runReforecast(p) {
    const cfg = effectiveConfig(p.settings || {});
    const run = p.run;
    const year = run.year;
    const channels = {};
    const validation = [];

    C().channelIds.forEach((ch) => {
      const src = run.channels[ch];
      const res = channelReforecast({ ch, src, planVersion: p.planVersion, cfg, year });
      const months = groupBy(res.rows, (r) => r.month, src.months);
      const weeks = groupBy(res.rows, (r) => r.weekKey, src.weeks).map((w) => {
        const rw = src.weeks.find((x) => x.key === w.key);
        return { ...w, weekStart: rw ? rw.weekStart : null, weekEnd: rw ? rw.weekEnd : null, crossesMonths: rw ? rw.crossesMonths : false };
      });
      const annual = summarize(res.rows, { ...src.annual, key: String(year) });
      const openRows = res.rows.filter((r) => r.open);
      channels[ch] = {
        channel: ch, days: res.rows, months, weeks, annual, horizon: res.horizon,
        horizonSummary: res.horizon.type === 'year' ? annual : months.find((m) => m.key === res.horizon.key),
        drivers: driverRequirements(openRows, { store: p.store, ch, year, assumptionSource: cfg.assumptionSource }),
        confidence: confidenceOf(res, cfg),
        missingAssumptions: res.missingAssumptions
      };
      const h = res.horizon;
      validation.push({ id: `closure:${ch}`, channel: ch,
        label: `${FP.dataModel.getChannel(ch).label}: actual + requerido = meta del ${h.type === 'year' ? 'año' : 'mes'}`,
        pass: h.closes !== false, applicable: h.closes !== null,
        expected: h.target, actual: fin(h.target) ? D().exactSum([h.actualToDate, h.requiredTotal]) : null,
        note: h.closes === null ? (h.futureDays ? 'Sin meta del periodo.' : 'Sin días futuros: el periodo ya cerró.') : h.met ? 'Meta alcanzada: requerido 0, el exceso se registra como surplus.' : null });
    });

    // Total digital = suma de canales, día por día
    const ids = C().channelIds;
    const totalRows = run.total.days.map((t, i) => {
      const rs = ids.map((ch) => channels[ch].days[i]);
      const openRs = rs.filter((r) => r.open);
      return {
        date: t.date, channel: 'total', month: t.month, weekKey: t.weekKey, temporal: t.temporal,
        closed: t.closed, counted: rs.every((r) => r.counted), missingActual: rs.some((r) => r.missingActual),
        plan: t.plan, actual: t.actual, partialActual: null, forecast: t.forecast, tag: null,
        open: openRs.length > 0,
        required: openRs.length ? P().strictAggregate(openRs.map((r) => r.required)) : null,
        reforecast: lenientSum(rs.map((r) => r.reforecast)).block,
        kind: rs.every((r) => r.counted) ? 'actual' : openRs.length ? 'required' : rs.some((r) => r.missingActual) ? 'missing_actual' : 'plan'
      };
    });
    totalRows.forEach((r) => {
      const planOpen = r.open ? P().strictAggregate(ids.map((ch) => channels[ch].days.find((x) => x.date === r.date)).filter((x) => x.open).map((x) => x.plan)) : null;
      r.planOpen = planOpen;
      r.delta = r.required ? pressureOf(r.required, planOpen) : null;
    });
    // Para los resúmenes del total, el plan de los días abiertos debe ser el de los canales abiertos
    const totalForSummary = totalRows.map((r) => ({ ...r, plan: r.open ? r.planOpen : r.plan }));
    const sumH = (k) => D().exactSum(ids.map((ch) => channels[ch].horizon[k] || 0));
    const total = {
      channel: 'total', days: totalRows,
      months: groupBy(totalRows, (r) => r.month, run.total.months).map((m, i) => fixTotalOpen(m, totalForSummary.filter((r) => r.month === m.key))),
      weeks: groupBy(totalRows, (r) => r.weekKey, run.total.weeks).map((w) => {
        const rw = run.total.weeks.find((x) => x.key === w.key);
        return { ...fixTotalOpen(w, totalForSummary.filter((r) => r.weekKey === w.key)), weekStart: rw ? rw.weekStart : null, weekEnd: rw ? rw.weekEnd : null, crossesMonths: rw ? rw.crossesMonths : false };
      }),
      annual: fixTotalOpen(summarize(totalRows, { ...run.total.annual, key: String(year) }), totalForSummary),
      horizon: {
        type: channels[ids[0]].horizon.type, key: channels[ids[0]].horizon.key,
        target: ids.every((ch) => fin(channels[ch].horizon.target)) ? sumH('target') : null,
        actualToDate: sumH('actualToDate'), remaining: sumH('remaining'), surplus: sumH('surplus'),
        requiredTotal: sumH('requiredTotal'), futureDays: Math.max(...ids.map((ch) => channels[ch].horizon.futureDays)),
        countedDays: Math.min(...ids.map((ch) => channels[ch].horizon.countedDays)),
        note: 'Suma de canales: el pendiente de un canal no se compensa con el exceso de otro.'
      },
      confidence: { level: worst(ids.map((ch) => channels[ch].confidence.level)), components: [],
        note: 'El total toma la confianza más baja de los canales.' }
    };
    total.horizonSummary = total.horizon.type === 'year' ? total.annual : total.months.find((m) => m.key === total.horizon.key);
    total.drivers = driverRequirements(totalRows.filter((r) => r.open).map((r) => ({ ...r, plan: r.planOpen })), { year, assumptionSource: cfg.assumptionSource });

    // Validaciones de suma de canales
    const sumCh = (get) => D().exactSum(ids.map((ch) => get(channels[ch]) || 0));
    validation.push({ id: 'total:reforecast', label: 'Σ reforecast de canales = reforecast total (año)', applicable: true,
      expected: sumCh((c) => c.annual.reforecast && c.annual.reforecast.revenue), actual: D().exactSum([total.annual.reforecast ? total.annual.reforecast.revenue : 0]) });
    validation.push({ id: 'total:required', label: 'Σ requerido de canales = requerido total', applicable: true,
      expected: sumCh((c) => c.horizon.requiredTotal), actual: D().exactSum(totalRows.map((r) => (r.required ? r.required.revenue : 0))) });
    validation.slice(-2).forEach((v) => { v.pass = v.expected === v.actual; });

    return {
      schema: 'reforecast_run',
      algorithmVersion: cfg.algorithmVersion,
      generatedAt: new Date().toISOString(),
      year, referenceDate: run.referenceDate, cutoff: run.cutoff, todayStatus: run.todayStatus,
      simulated: Boolean(p.simulated),
      horizon: cfg.horizon, method: cfg.method, assumptionSource: cfg.assumptionSource,
      plan: run.plan,
      forecast: { method: run.method, algorithmVersion: run.algorithmVersion, forecastVersion: p.forecastVersion || null },
      settings: cfg,
      channels, total,
      validation: { checks: validation, closed: validation.filter((v) => v.applicable !== false).every((v) => v.pass) }
    };
  }

  /** En el total, el requerido y la presión se comparan contra el plan de los canales abiertos. */
  function fixTotalOpen(summary, rows) {
    const openRows = rows.filter((r) => r.open && r.required);
    if (!openRows.length) return summary;
    const planOpen = strict(openRows.map((r) => r.plan));
    const required = strict(openRows.map((r) => r.required));
    return { ...summary, planOpen, required,
      recoveryGap: required && planOpen && fin(required.revenue) && fin(planOpen.revenue) ? cents(required.revenue - planOpen.revenue) : null,
      pressure: pressureOf(required, planOpen) };
  }

  FP.reforecastEngine = {
    effectiveConfig, calculateRemaining, redistribute, generateReforecast, requiredBlock,
    runReforecast, driverRequirements, historicalSamePeriod
  };
})(typeof window !== 'undefined' ? window : globalThis);
