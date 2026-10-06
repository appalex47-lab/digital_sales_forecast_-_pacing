/**
 * signalEngine.js — Señales (Fase 5).
 *
 * Una señal es un HECHO cuantificado que merece investigación: un cambio relevante contra la
 * referencia, un cambio de mezcla o un valor extremo. No es una causa.
 *
 *   señal = { id, kind, level, metric, dimension, value, label, current, baseline, delta, deltaPct,
 *             direction, relevance: { impact, exposure, confidence, score, priority }, evidence, reference }
 *
 * Relevancia (no solo el % de cambio):
 *   impact     = |contribución en venta| ÷ escala      (escala = max(|brecha|, 1 % de la venta base))
 *                sin contribución directa (clientes, artículos…): |Δ%| × 0.5, acotado a 1
 *   exposure   = peso del segmento en la base (venta; volumen para señales de tráfico)
 *   confidence = 1 con ≥ minObservations días, 0.6 con menos, 0.3 con 1–2 días
 *   score      = impact × exposure × confidence   → prioridad alta / media / baja (umbrales en config)
 * "Prioridad de investigación alta" no significa culpable: significa "mira aquí primero".
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const F = () => FP.format;
  const fin = (v) => M().isFiniteNumber(v);

  const METRIC_LABEL = () => ({ ...Object.fromEntries(C().metricKeys.map((k) => [k, C().metrics[k].label])),
    customers: 'Clientes', newCustomers: 'Clientes nuevos', returningCustomers: 'Clientes recurrentes', items: 'Artículos', itemsPerOrder: 'Artículos por pedido' });
  const fmt = (m, v) => (['customers', 'newCustomers', 'returningCustomers', 'items'].includes(m) ? F().integer(v)
    : m === 'itemsPerOrder' ? F().decimal(v, 2) : F().metric(m, v));
  const pct = (v) => F().signedPercent(v, 1);

  function priorityOf(score, cfg) { return score >= cfg.priority.high ? 'high' : score >= cfg.priority.medium ? 'medium' : 'low'; }
  function confFactor(n, minObs) { return n >= minObs ? 1 : n >= 3 ? 0.6 : 0.3; }

  /**
   * @param {object} p { level1, dims (core + segmentos), pairs, settings }
   */
  function detectSignals({ level1, dims, pairs, settings = {} }) {
    const cfg = { ...C().diagnostics.signals, ...(settings.signals || {}) };
    const minObs = settings.minObservations || C().diagnostics.minObservations;
    const L = METRIC_LABEL();
    const out = [];
    let seq = 0;
    const baseRev = level1.baseline.revenue;
    const scale = Math.max(Math.abs(level1.gap.abs || 0), Math.abs(baseRev || 0) * 0.01, 1);
    const make = (o) => {
      const impact = fin(o.contribution) ? Math.min(1, Math.abs(o.contribution) / scale) : Math.min(1, Math.abs(o.deltaPct || 0) * 0.5);
      const exposure = fin(o.exposure) ? Math.max(0, Math.min(1, o.exposure)) : 1;
      const confidence = confFactor(o.observations || 0, minObs);
      const score = impact * exposure * confidence;
      out.push({
        id: `s${++seq}`, kind: o.kind, level: o.level, metric: o.metric, metricLabel: L[o.metric] || o.metric,
        dimension: o.dimension || null, dimensionLabel: o.dimensionLabel || null, value: o.value ?? null, label: o.label || null,
        current: o.current ?? null, baseline: o.baseline ?? null, delta: o.delta ?? null, deltaPct: o.deltaPct ?? null,
        contribution: fin(o.contribution) ? o.contribution : null,
        direction: o.direction || (fin(o.delta) ? (o.delta < 0 ? 'deterioration' : o.delta > 0 ? 'improvement' : 'flat') : null),
        relevance: { impact, exposure, confidence, score, priority: priorityOf(score, cfg) },
        evidence: o.evidence, reference: o.reference || null, dates: o.dates || null, observations: o.observations || 0
      });
    };

    // Nivel 1: drivers
    level1.drivers.forEach((d) => {
      if (!fin(d.deltaPct) || Math.abs(d.deltaPct) < cfg.minDeltaPct) return;
      make({ kind: 'driver_change', level: 1, metric: d.driver, current: d.current, baseline: d.baseline, delta: d.delta, deltaPct: d.deltaPct,
        contribution: d.contribution, exposure: 1, observations: pairs.length,
        evidence: `${d.label}: ${fmt(d.driver, d.current)} vs ${fmt(d.driver, d.baseline)} (${pct(d.deltaPct)}); contribución matemática ${F().currency(d.contribution, 0)}.` });
    });

    // Nivel 2: cambios por segmento y mezcla
    dims.forEach((dim) => {
      const refNote = dim.reference === 'yoy' ? ' vs año anterior' : '';
      dim.groups.forEach((g) => {
        ['revenue', 'trafficVolume', 'conversionRate', 'aov', 'customers', 'newCustomers', 'returningCustomers', 'itemsPerOrder'].forEach((m) => {
          const d = g.metrics[m];
          if (!d || !fin(d.deltaPct) || Math.abs(d.deltaPct) < cfg.minDeltaPct) return;
          const exposure = m === 'trafficVolume' ? g.trafficExposure : g.exposure;
          if (fin(exposure) && exposure < cfg.minExposure) return;
          // Un grupo que es casi todo el total (≥ 90 %) repite la señal de Nivel 1: no aporta localización.
          if (fin(exposure) && exposure >= 0.9 && dim.groups.length > 1) return;
          const contribution = m === 'revenue' ? d.delta : g.contributions && ['trafficVolume', 'conversionRate', 'aov'].includes(m) ? g.contributions[m] : null;
          make({ kind: 'segment_change', level: 2, metric: m, dimension: dim.dimension, dimensionLabel: dim.label, value: g.value, label: g.label,
            current: d.current, baseline: d.baseline, delta: d.delta, deltaPct: d.deltaPct, contribution, exposure, observations: g.observations,
            reference: dim.reference,
            evidence: `${dim.label} ${g.label} · ${L[m]}: ${fmt(m, d.current)} vs ${fmt(m, d.baseline)}${refNote} (${pct(d.deltaPct)}). Peso en la base: ${F().percent(exposure, 1)}.` });
        });
        const dShare = fin(g.currentShare) && fin(g.exposure) ? g.currentShare - g.exposure : null;
        if (fin(dShare) && Math.abs(dShare) >= cfg.minMixPp) {
          make({ kind: 'mix_shift', level: 2, metric: 'revenue', dimension: dim.dimension, dimensionLabel: dim.label, value: g.value, label: g.label,
            current: g.currentShare, baseline: g.exposure, delta: dShare, deltaPct: null, contribution: null, exposure: Math.max(g.exposure, g.currentShare),
            observations: g.observations, direction: 'mix', reference: dim.reference,
            evidence: `${dim.label} ${g.label}: pasa de ${F().percent(g.exposure, 1)} a ${F().percent(g.currentShare, 1)} de la venta${refNote} (${dShare > 0 ? '+' : '−'}${F().decimal(Math.abs(dShare) * 100, 1)} pp).` });
        }
      });
    });

    // Valores extremos diarios (no se eliminan: se marcan para revisar)
    const ratios = pairs.map((p) => M().safeDivide(p.current.revenue, p.baseline.revenue)).filter(fin);
    if (ratios.length >= 5) {
      const b = FP.weights.outlierBounds ? FP.weights.outlierBounds(ratios, cfg.anomalyMadK) : null;
      pairs.forEach((p) => {
        const r = M().safeDivide(p.current.revenue, p.baseline.revenue);
        if (!fin(r)) return;
        const extreme = r >= cfg.anomalyRatio || r <= 1 / cfg.anomalyRatio || (b && b[1] > b[0] && (r < b[0] || r > b[1]) && Math.abs(r - 1) >= 0.25);
        if (!extreme) return;
        make({ kind: 'anomaly', level: 3, metric: 'revenue', dimension: 'date', dimensionLabel: 'Fecha', value: `${p.date}|${p.channel}`,
          label: `${p.date} · ${FP.dataModel.getChannel(p.channel).label}`, current: p.current.revenue, baseline: p.baseline.revenue,
          delta: p.current.revenue - p.baseline.revenue, deltaPct: r - 1, contribution: p.current.revenue - p.baseline.revenue,
          exposure: M().safeDivide(p.baseline.revenue, baseRev), observations: minObs, direction: 'anomaly', dates: [p.date],
          evidence: `Posible dato atípico: ${FP.dataModel.getChannel(p.channel).label} el ${p.date} vendió ${F().currency(p.current.revenue, 0)} vs ${F().currency(p.baseline.revenue, 0)} de referencia (${pct(r - 1)}). Revisa el dato antes de interpretarlo; no se eliminó.` });
      });
    }

    out.sort((a, b) => b.relevance.score - a.relevance.score);
    return out.slice(0, cfg.maxSignals).map((s, i) => ({ ...s, rank: i + 1 }));
  }

  FP.signalEngine = { detectSignals, METRIC_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
