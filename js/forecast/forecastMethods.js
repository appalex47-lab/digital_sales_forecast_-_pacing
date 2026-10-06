/**
 * forecastMethods.js — Métodos de proyección de un día no cerrado (Fase 3).
 *
 *   A · Plan restante         forecast_día = plan_día                         (baseline)
 *   B · Performance acumulada forecast_día = plan_día × índice YTD             (venta, pedidos, volumen)
 *   C · Performance reciente  forecast_día = plan_día × índice ventana reciente
 *   D · Por drivers           volumen = plan_vol × iVol;  CR = plan_CR × iCR;  AOV = plan_AOV × iAOV
 *                             pedidos = volumen × CR;     venta = pedidos × AOV
 *
 * Sin doble conteo: en D los índices se aplican SOLO a los drivers primarios (volumen, CR, AOV);
 * pedidos y venta se derivan. En B y C cada métrica aditiva usa su propio índice y CR/AOV se
 * recalculan de las sumas, así que nunca se multiplican índices de venta por índices de drivers.
 *
 * El patrón temporal viene del plan diario (Fase 2): nunca "restante ÷ días restantes".
 * Si un índice no tiene datos suficientes, el día usa el plan (índice 1) y queda marcado
 * `fallback` con el motivo. La app no decide qué método es "mejor".
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const P = () => FP.pacing;

  const METHOD_IDS = ['A', 'B', 'C', 'D'];

  /**
   * Índices que usa cada método.
   * @returns { usesIndices, byMetric: { métrica: { window, value, status, note } } }
   */
  function methodIndices(methodId, indices, cfg) {
    const pick = (w, m) => {
      const r = indices && indices[w] && indices[w][m];
      return { window: w, value: r ? r.value : null, status: r ? r.status : 'insufficient_data', note: r ? r.note : null,
        comparableDays: r ? r.comparableDays : 0 };
    };
    const out = {};
    if (methodId === 'B' || methodId === 'C') {
      const w = methodId === 'B' ? 'ytd' : cfg.recentWindow;
      ['revenue', 'orders', 'trafficVolume'].forEach((m) => { out[m] = pick(w, m); });
    } else if (methodId === 'D') {
      ['trafficVolume', 'conversionRate', 'aov'].forEach((m) => { out[m] = pick(cfg.driverWindows[m], m); });
    }
    return { usesIndices: methodId !== 'A', byMetric: out };
  }

  const idxOr1 = (i) => (i && M().isFiniteNumber(i.value) ? i.value : 1);
  const mul = (a, b) => (M().isFiniteNumber(a) && M().isFiniteNumber(b) ? a * b : null);

  /**
   * Proyecta un día.
   * @param {string} methodId
   * @param {object} plan     bloque del plan del día (venta, pedidos, volumen)
   * @param {object} mi       resultado de methodIndices()
   * @returns { values (bloque completo) | null, fallback: bool, reason }
   */
  function projectDay(methodId, plan, mi) {
    if (!plan || !M().isFiniteNumber(plan.revenue)) return { values: null, fallback: false, reason: 'Sin plan para el día.' };
    const base = P().completeBlock(plan);
    if (methodId === 'A') return { values: base, fallback: false, reason: null };

    const insufficient = Object.values(mi.byMetric).filter((i) => !M().isFiniteNumber(i.value));
    const fallback = insufficient.length > 0;
    const missingNames = Object.keys(mi.byMetric).filter((k) => !M().isFiniteNumber(mi.byMetric[k].value)).map((k) => C().metrics[k].label);
    const reason = fallback ? `Índice insuficiente en ${missingNames.join(', ')}: se usa índice 1 (plan) en ese driver.` : null;

    if (methodId === 'B' || methodId === 'C') {
      return {
        values: P().completeBlock({
          revenue: mul(base.revenue, idxOr1(mi.byMetric.revenue)),
          orders: mul(base.orders, idxOr1(mi.byMetric.orders)),
          trafficVolume: mul(base.trafficVolume, idxOr1(mi.byMetric.trafficVolume))
        }),
        fallback, reason
      };
    }

    // D · drivers
    const hasDrivers = M().isFiniteNumber(base.trafficVolume) && M().isFiniteNumber(base.orders);
    if (!hasDrivers) {
      return { values: base, fallback: true, reason: 'El plan del día no tiene volumen y pedidos: no se puede proyectar por drivers; se usa el plan.' };
    }
    if (base.trafficVolume === 0 || base.orders === 0) {
      return { values: base, fallback: true, reason: 'Plan con volumen o pedidos en 0: CR/AOV no definidos; se usa el plan.' };
    }
    const traffic = base.trafficVolume * idxOr1(mi.byMetric.trafficVolume);
    const cr = base.conversionRate * idxOr1(mi.byMetric.conversionRate);
    const aov = base.aov * idxOr1(mi.byMetric.aov);
    const orders = M().calculateOrders(traffic, cr);
    const revenue = M().calculateRevenue(orders, aov);
    return { values: P().completeBlock({ revenue, orders, trafficVolume: traffic }), fallback, reason };
  }

  /** Texto de supuestos de un método para mostrar y auditar. */
  function describeAssumptions(methodId, mi, cfg) {
    const m = cfg.methods[methodId];
    return {
      method: methodId,
      label: m.label,
      description: m.description,
      indices: Object.fromEntries(Object.entries(mi.byMetric).map(([k, i]) => [k, {
        window: i.window, windowLabel: cfg.windows[i.window] ? cfg.windows[i.window].label : i.window,
        value: i.value, status: i.status, comparableDays: i.comparableDays, note: i.note }])),
      fallbackRule: methodId === 'A' ? null : 'Índice sin datos suficientes → índice 1 (plan) en ese driver, marcado.'
    };
  }

  FP.forecastMethods = { METHOD_IDS, methodIndices, projectDay, describeAssumptions };
})(typeof window !== 'undefined' ? window : globalThis);
