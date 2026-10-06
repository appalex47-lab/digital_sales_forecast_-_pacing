/**
 * pacing.js — Pacing: plan vs actual en el tiempo (Fase 3).
 *
 * Conceptos:
 *  - referenceDate: fecha "hoy" del análisis (configurable; reproduce análisis pasados).
 *  - cutoff: último día cuyo actual se considera final.
 *      todayStatus 'completed'   → cutoff = referenceDate
 *      todayStatus 'in_progress' → cutoff = referenceDate − 1 (la carga de hoy es parcial)
 *  - Estado temporal de un día: past (< ref), today (= ref), future (> ref).
 *  - Día "contado": día ≤ cutoff con venta real. Solo los días contados entran al pacing
 *    acumulado, y se comparan contra el plan de ESOS MISMOS días (plan diario ponderado,
 *    no días transcurridos ÷ días totales).
 *  - Estado de un periodo: closed (todos sus días ≤ cutoff), current, future.
 *
 * Sumas estrictas: si un día tiene la métrica en null, el total del periodo es null
 * (datos insuficientes). Nunca se trata un faltante como cero.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const Cal = () => FP.calendar;
  const G = () => FP.gap;

  const ADD = ['revenue', 'orders', 'trafficVolume'];
  /** Quita el ruido de punto flotante de las sumas (1e-6): 261000000.00000006 → 261000000. */
  const clean = (v) => (v === null ? null : Math.round(v * 1e6) / 1e6);

  function cutoffDate(referenceDate, todayStatus = 'completed') {
    if (!referenceDate) return null;
    return todayStatus === 'in_progress' ? Cal().toISODate(Cal().addDays(Cal().parseDate(referenceDate), -1)) : referenceDate;
  }

  function temporalStatus(date, referenceDate) {
    if (!referenceDate) return 'future';
    return date < referenceDate ? 'past' : date === referenceDate ? 'today' : 'future';
  }

  function periodStatus(firstDate, lastDate, cutoff) {
    if (!cutoff || firstDate > cutoff) return 'future';
    if (lastDate <= cutoff) return 'closed';
    return 'current';
  }

  /** Bloque con CR y AOV derivados de volumen, pedidos y venta. */
  function completeBlock(b) {
    if (!b) return null;
    const out = { revenue: nv(b.revenue), orders: nv(b.orders), trafficVolume: nv(b.trafficVolume) };
    out.conversionRate = M().calculateConversionRate(out.orders, out.trafficVolume);
    out.aov = M().calculateAOV(out.revenue, out.orders);
    return out;
  }
  const nv = (v) => (M().isFiniteNumber(v) ? v : null);

  /** Suma estricta: null si falta algún bloque o valor. CR y AOV desde las sumas. */
  function strictAggregate(blocks) {
    const out = {};
    ADD.forEach((k) => {
      if (!blocks.length || blocks.some((b) => !b || !M().isFiniteNumber(b[k]))) { out[k] = blocks.length ? null : 0; return; }
      out[k] = clean(blocks.reduce((a, b) => a + b[k], 0));
    });
    return completeBlock(out);
  }

  /** Gap por métrica entre dos bloques. */
  function blockGap(plan, actual) {
    const out = {};
    C().metricKeys.forEach((k) => { out[k] = G().calculateGap(plan ? plan[k] : null, actual ? actual[k] : null); });
    return out;
  }

  function blockForecastGap(plan, forecast) {
    const out = {};
    C().metricKeys.forEach((k) => { out[k] = G().calculateForecastGap(plan ? plan[k] : null, forecast ? forecast[k] : null); });
    return out;
  }

  /**
   * Acumulados sobre días contados, en orden. Muta cada fila agregando `cumulative`.
   * El plan acumulado es la suma del plan diario de los días contados.
   */
  function accumulate(rows) {
    const acc = { plan: {}, actual: {} };
    ADD.forEach((k) => { acc.plan[k] = 0; acc.actual[k] = 0; });
    let broken = { plan: {}, actual: {} };
    rows.forEach((r) => {
      if (!r.counted) { r.cumulative = null; return; }
      ADD.forEach((k) => {
        ['plan', 'actual'].forEach((s) => {
          const v = r[s] ? r[s][k] : null;
          if (!M().isFiniteNumber(v)) broken[s][k] = true;
          else acc[s][k] += v;
        });
      });
      const p = completeBlock(Object.fromEntries(ADD.map((k) => [k, broken.plan[k] ? null : clean(acc.plan[k])])));
      const a = completeBlock(Object.fromEntries(ADD.map((k) => [k, broken.actual[k] ? null : clean(acc.actual[k])])));
      r.cumulative = blockGap(p, a);
    });
    return rows;
  }

  /**
   * Resumen de un periodo (mes, semana, año, evento) a partir de filas diarias del motor.
   * @returns { firstDate, lastDate, status, days, countedDays, missingActualDays,
   *            plan, toDate: gap por métrica, forecast, forecastGap: por métrica, pacingStatus }
   */
  function summarizePeriod(rows, cutoff) {
    if (!rows.length) return null;
    const first = rows[0].date, last = rows[rows.length - 1].date;
    const counted = rows.filter((r) => r.counted);
    const plan = strictAggregate(rows.map((r) => r.plan));
    const planToDate = strictAggregate(counted.map((r) => r.plan));
    const actualToDate = counted.length ? strictAggregate(counted.map((r) => r.actual)) : null;
    const forecast = strictAggregate(rows.map((r) => r.forecast));
    const toDate = blockGap(counted.length ? planToDate : null, actualToDate);
    return {
      firstDate: first, lastDate: last,
      status: periodStatus(first, last, cutoff),
      days: rows.length,
      countedDays: counted.length,
      missingActualDays: rows.filter((r) => r.closed && !r.counted).length,
      plan, planToDate: counted.length ? planToDate : null, actualToDate,
      toDate,
      forecast,
      forecastGap: blockForecastGap(plan, forecast),
      pacingStatus: G().pacingStatus(toDate.revenue.compliance)
    };
  }

  FP.pacing = { cutoffDate, temporalStatus, periodStatus, completeBlock, strictAggregate, blockGap, blockForecastGap, accumulate, summarizePeriod };
})(typeof window !== 'undefined' ? window : globalThis);
