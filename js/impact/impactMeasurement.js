/**
 * impactMeasurement.js — Impacto OBSERVADO después de ejecutar una acción (Fase 6).
 *
 * Compara, sobre los MISMOS días de la ventana de medición y solo donde ya hay real:
 *   baseline  = base guardada en el escenario al crearlo (forecast de esos días)
 *   escenario = valor simulado guardado en el escenario
 *   observado = real cargado después (actualData; histórico del mismo año si se usa como real)
 *
 * realización = (observado − baseline) ÷ (escenario − baseline)
 *   ≥ consistent → "El resultado observado es consistente con el escenario."
 *   ≥ partial    → "parcialmente consistente";  menor → "no es consistente".
 * Nunca afirma causalidad: lista factores que pueden afectar la comparación (eventos, festivos,
 * volumen o AOV movidos cuando el driver era otro, días sin real).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const P = () => FP.pacing;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const toBlock = (a) => P().completeBlock({ revenue: a[0], orders: a[1], trafficVolume: a[2] });

  /**
   * @param {object} p { scenario, action, store, run, measurementDate }
   * @returns measurement
   */
  function measure({ scenario, action = null, store, run = null, measurementDate = null }) {
    const win = action && action.startDate ? { start: action.startDate, end: action.endDate || action.startDate } : null;
    const year = scenario.context.period.start ? +scenario.context.period.start.slice(0, 4) : null;
    const actuals = FP.forecastEngine.actualInputs({ year, store, useHistoricalAsActual: true });
    const rows = { baseline: [], scenario: [], observed: [] };
    const tags = [];
    let windowDays = 0;
    Object.entries(scenario.days || {}).forEach(([ch, days]) => {
      days.forEach((d) => {
        const date = d[0];
        if (win && (date < win.start || date > win.end)) return;
        windowDays++;
        const a = actuals.get(`${date}|${ch}`);
        if (!a || !fin(a.values.revenue)) return;
        rows.baseline.push(toBlock([d[1], d[2], d[3]]));
        rows.scenario.push(toBlock([d[4], d[5], d[6]]));
        rows.observed.push(P().completeBlock(a.values));
        if (run) {
          const rd = run.channels[ch].days.find((x) => x.date === date);
          if (rd && rd.tag) tags.push([rd.tag.event, rd.tag.holiday, rd.tag.season].filter(Boolean).join(', '));
        }
      });
    });
    const n = rows.observed.length;
    const agg = (list) => (list.length ? P().strictAggregate(list) : null);
    const baseline = agg(rows.baseline), scen = agg(rows.scenario), observed = agg(rows.observed);
    const metric = action && action.measurement && action.measurement.metric ? action.measurement.metric : 'revenue';
    const compare = (k) => {
      const b = baseline ? baseline[k] : null, s = scen ? scen[k] : null, o = observed ? observed[k] : null;
      const expected = fin(s) && fin(b) ? s - b : null;
      const got = fin(o) && fin(b) ? o - b : null;
      return { baseline: b, scenario: s, observed: o, deltaVsBaseline: got, deltaVsScenario: fin(o) && fin(s) ? o - s : null,
        expectedDelta: expected, realization: fin(expected) && expected !== 0 && fin(got) ? got / expected : null };
    };
    const byMetric = Object.fromEntries(C().metricKeys.map((k) => [k, compare(k)]));
    const main = byMetric[metric];
    const cfg = C().recovery.consistency;
    let consistency = 'insufficient_data', statement = 'Todavía no hay real en la ventana de medición.';
    if (n && fin(main.realization)) {
      if (main.realization >= cfg.consistent) { consistency = 'consistent'; statement = 'El resultado observado es consistente con el escenario.'; }
      else if (main.realization >= cfg.partial) { consistency = 'partial'; statement = 'El resultado observado es parcialmente consistente con el escenario.'; }
      else { consistency = 'not_consistent'; statement = 'El resultado observado no es consistente con el escenario.'; }
    } else if (n) { statement = 'No hay cambio esperado medible en la métrica seleccionada.'; }

    // Factores que pueden afectar la comparación (descriptivos, sin causalidad)
    const factors = [];
    const uniqTags = [...new Set(tags.filter(Boolean))];
    if (uniqTags.length) factors.push(`La ventana incluye eventos o festivos: ${uniqTags.join('; ')}.`);
    const driver = scenario.links && scenario.links.driver;
    ['trafficVolume', 'conversionRate', 'aov'].filter((k) => k !== driver).forEach((k) => {
      const c = byMetric[k];
      const pct = fin(c.observed) && fin(c.baseline) && c.baseline !== 0 ? c.observed / c.baseline - 1 : null;
      if (fin(pct) && Math.abs(pct) >= 0.05) factors.push(`${C().metrics[k].label} también se movió ${(pct * 100).toFixed(1)} % vs la base aunque el escenario no lo cambiaba.`);
    });
    if (windowDays > n) factors.push(`${windowDays - n} días de la ventana aún no tienen real.`);
    factors.push('Otros factores posibles no medidos aquí: mix, promociones, cambios de precio o de canal.');

    return {
      measurementId: `ms_${Date.now().toString(36)}`,
      actionId: action ? action.actionId : null, scenarioId: scenario.scenarioId,
      measurementDate: measurementDate || new Date().toISOString().slice(0, 10),
      window: win || { start: null, end: null }, observedDays: n, windowDays,
      metric, baseline, scenario: scen, actual: observed, byMetric,
      delta: main, observedImpact: { kind: 'observed', metric, value: main.deltaVsBaseline },
      realization: main.realization, consistency, statement, factors,
      note: 'Compara baseline, escenario y observado; no establece causalidad.'
    };
  }

  FP.impactMeasurement = { measure };
})(typeof window !== 'undefined' ? window : globalThis);
