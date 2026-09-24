/**
 * diagnosticEngine.js — ¿Por qué existe la brecha? (Fase 5)
 *
 *   runDiagnostic({ period, channel, comparison, metric, method, run, rf, store, quality })
 *     → { result, gap, level1Drivers, level2, driverTree, level2Signals, signals, hypotheses,
 *         recovery, confidence, availability, assumptions, validation }
 *
 * Orden fijo: demostrar la brecha → cuantificar el driver → localizar señales → formular hipótesis.
 * Solo lee plan, actual, forecast y reforecast (copias); no escribe nada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const DE = () => FP.driverEngine;
  const fin = (v) => M().isFiniteNumber(v);
  const LEVELS = ['insufficient', 'limited', 'sufficient', 'excellent'];
  const worst = (list) => { const v = list.filter(Boolean); return v.length ? LEVELS.find((l) => v.includes(l)) : null; };

  function periodLabel(period) {
    if (period.type === 'month') return FP.calendar.periodLabel ? FP.calendar.periodLabel(period.key, 'month') : period.key;
    if (period.type === 'week') return `Semana ${period.key}`;
    return `Año ${period.key}`;
  }

  /** Confianza de los datos del diagnóstico (no es la probabilidad de que una hipótesis sea cierta). */
  function dataConfidence({ built, dims, segs, quality, minObs }) {
    const comps = [];
    const cov = M().safeDivide(built.pairs.length, built.expected);
    comps.push({ id: 'coverage', label: 'Cobertura de días', level: !fin(cov) ? 'insufficient' : cov >= 0.95 ? 'excellent' : cov >= 0.8 ? 'sufficient' : cov >= 0.5 ? 'limited' : 'insufficient',
      note: `${built.pairs.length} de ${built.expected} días-canal con dato en ambos lados.` });
    const days = new Set(built.pairs.map((p) => p.date)).size;
    comps.push({ id: 'observations', label: 'Observaciones', level: days >= minObs * 3 ? 'excellent' : days >= minObs ? 'sufficient' : days >= 3 ? 'limited' : 'insufficient',
      note: `${days} días distintos en la comparación.` });
    if (quality) {
      const st = quality.status;
      comps.push({ id: 'quality', label: 'Calidad de datos', level: st === 'ready' ? 'excellent' : st === 'warnings' ? 'sufficient' : st === 'invalid' ? 'limited' : null,
        note: `Estado general de los datos cargados: ${quality.statusText}.` });
    }
    segs.dims.forEach((d) => {
      if (!fin(d.coverage)) return;
      const off = Math.abs(d.coverage - 1);
      comps.push({ id: `consistency:${d.dimension}`, label: `Consistencia ${d.label.toLowerCase()}`, level: off <= 0.02 ? 'excellent' : off <= 0.1 ? 'sufficient' : 'limited',
        note: `La suma de segmentos de ${d.label.toLowerCase()} equivale al ${FP.format.percent(d.coverage, 1)} de la venta del canal.` });
    });
    // Muestra: grupos operativos (segmentos y canal) con peso ≥ 5 %; los grupos de calendario son chicos por naturaleza
    const smallest = dims.filter((d) => d.source === 'segments' || d.dimension === 'channel').flatMap((d) => d.groups).filter((g) => !fin(g.exposure) || g.exposure >= 0.05)
      .reduce((a, g) => Math.min(a, g.observations), Infinity);
    if (Number.isFinite(smallest)) comps.push({ id: 'sample', label: 'Tamaño de muestra por segmento', level: smallest >= minObs ? 'sufficient' : smallest >= 3 ? 'limited' : 'insufficient',
      note: `El segmento con menos observaciones tiene ${smallest} días.` });
    return { level: worst(comps.map((c) => c.level)), components: comps.filter((c) => c.level),
      note: 'Mide la solidez de los datos usados; no es la probabilidad de que una hipótesis sea cierta.' };
  }

  function runDiagnostic(p) {
    const cfg = C().diagnostics;
    const comparison = p.comparison || 'actual_vs_plan';
    const metric = p.metric === 'orders' ? 'orders' : 'revenue';
    const method = p.method || cfg.attributionMethod;
    const period = p.period;
    const ctx = { comparison, period, channel: p.channel || 'total', run: p.run, rf: p.rf, store: p.store };
    const built = DE().buildPairs(ctx);
    const cmp = cfg.comparisons[comparison];
    const base = {
      schema: 'diagnostic_run', algorithmVersion: cfg.algorithmVersion, generatedAt: new Date().toISOString(),
      comparison: { id: comparison, ...cmp }, period: { ...period, label: periodLabel(period) },
      channel: { id: ctx.channel, label: ctx.channel === 'total' ? 'Total digital' : FP.dataModel.getChannel(ctx.channel).label },
      metric, attributionMethod: method, attributionMethodLabel: cfg.attributionMethods[method],
      referenceDate: p.run ? p.run.referenceDate : null, cutoff: p.run ? p.run.cutoff : null,
      coverage: { expected: built.expected, paired: built.pairs.length, unpaired: built.unpaired, currentRange: built.currentRange, baselineRange: built.baselineRange },
      notes: built.notes
    };
    if (!built.pairs.length) {
      return { ...base, status: 'no_data', result: null, gap: null, level1Drivers: [], level2: [], driverTree: [], level2Signals: [], signals: [], hypotheses: [],
        availability: { available: [], unavailable: DE().unavailableDimensions([]), segmentsNote: null },
        confidence: { level: 'insufficient', components: [], note: 'Sin datos comparables para este periodo y comparación.' },
        assumptions: assumptions(comparison, method, metric), validation: [] };
    }

    // 1. Brecha y Nivel 1
    const l1 = DE().level1(built.pairs, { metric, method });
    // 2. Nivel 2
    const core = DE().coreDimensions(built.pairs, l1, { metric, method, period, channels: built.channels });
    const segs = DE().segmentDimensions(ctx, built, l1, { metric, method });
    const dims = [...core, ...segs.dims];
    // 3. Señales
    const signals = FP.signalEngine.detectSignals({ level1: l1, dims, pairs: built.pairs, settings: p.settings || {} });
    // 4. Hipótesis (solo con evidencia)
    const hypotheses = FP.hypothesisEngine.generateHypotheses({ level1: l1, signals });

    // Recuperación: requerido vs forecast expresado en drivers (Fase 4)
    let recovery = null;
    if (comparison === 'reforecast_vs_forecast' && p.rf) {
      const s = ctx.channel === 'total' ? p.rf.total : p.rf.channels[ctx.channel];
      recovery = s.drivers ? { horizon: s.horizon, drivers: s.drivers,
        note: 'Análisis matemático de lo que tendría que cambiar para cerrar el pendiente; no es una recomendación.' } : null;
    }

    const validation = [
      { id: 'identity', label: 'Venta = volumen × CR × AOV (ambos lados)', pass: ['current', 'baseline'].every((side) => {
        const b = l1[side]; return !fin(b.trafficVolume) || !fin(b.conversionRate) || M().isApproximatelyEqual(b.trafficVolume * b.conversionRate * b.aov, b.revenue, { relative: 1e-9, absolute: 0.01 });
      }) },
      { id: 'attribution', label: 'Σ contribuciones = brecha', pass: l1.attribution.status !== 'ok' || l1.attribution.closes,
        detail: l1.attribution.status === 'ok' ? { total: l1.attribution.total, residual: l1.attribution.residual } : l1.attribution.note }
    ];

    return {
      ...base, status: 'ok',
      result: { metric, metricLabel: C().metrics[metric].label, current: l1.current, baseline: l1.baseline,
        currentLabel: cmp.current, baselineLabel: cmp.baseline,
        fact: `${C().metrics[metric].label} ${cmp.current.toLowerCase()}: ${FP.format.metric(metric, l1.current[metric])} vs ${FP.format.metric(metric, l1.baseline[metric])} ${cmp.baseline.toLowerCase()} (${FP.format.signedPercent(l1.gap.pct, 1)}).` },
      gap: l1.gap,
      level1: { attribution: l1.attribution, mainDriver: l1.mainDriver, statement: l1.statement,
        negatives: l1.negatives.map((d) => d.driver), positives: l1.positives.map((d) => d.driver) },
      level1Drivers: l1.drivers,
      level2: dims,
      driverTree: DE().driverTree(l1, dims),
      level2Signals: signals.filter((s) => s.level >= 2),
      signals,
      hypotheses,
      recovery,
      availability: {
        available: dims.map((d) => ({ dimension: d.dimension, label: d.label, source: d.source, reference: d.reference, referenceLabel: d.referenceLabel || null })),
        unavailable: DE().unavailableDimensions(segs.dims.map((d) => d.dimension)),
        segmentsNote: segs.note, segmentsReference: segs.reference
      },
      confidence: dataConfidence({ built, dims, segs, quality: p.quality, minObs: cfg.minObservations }),
      assumptions: assumptions(comparison, method, metric),
      validation
    };
  }

  function assumptions(comparison, method, metric) {
    return {
      identity: metric === 'orders' ? 'Pedidos = volumen × CR' : 'Venta = volumen × CR × AOV',
      attribution: method === 'shapley' ? 'Shapley: promedio de las contribuciones secuenciales en todos los órdenes.' : `Secuencial en el orden ${C().diagnostics.attributionOrder.join(' → ')}; el resultado depende del orden.`,
      pairing: {
        actual_vs_plan: 'Días con real del periodo contra el plan de esos mismos días.',
        forecast_vs_plan: 'Todos los días del periodo: forecast (real en días cerrados + proyección) contra plan.',
        actual_vs_previous: 'Días con real contra el mismo día del periodo anterior (mes anterior, semana anterior o año anterior).',
        actual_vs_yoy: 'Días con real contra el mismo día del año anterior.',
        reforecast_vs_forecast: 'Días futuros del horizonte: venta requerida (Fase 4) contra forecast.'
      }[comparison],
      causality: 'Las contribuciones son una atribución matemática, no causas. Las hipótesis requieren validación.'
    };
  }

  FP.diagnosticEngine = { runDiagnostic, dataConfidence };
})(typeof window !== 'undefined' ? window : globalThis);
