/**
 * analysisExport.js — analysis_export.json (Fase 5).
 * Contrato pensado para la app de diagnóstico independiente ("Diagnóstico de brecha de ventas"):
 * resultado, brecha, drivers de Nivel 1, señales de Nivel 2 e hipótesis, con su evidencia.
 * Sin integración automática: solo el archivo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const block = (b) => (b ? FP.exporter.toContractBlock(b) : null);

  function summarySide(series, period) {
    if (!series) return null;
    const p = period.type === 'year' ? series.annual : period.type === 'month' ? series.months.find((m) => m.key === period.key) : series.weeks.find((w) => w.key === period.key);
    return p || null;
  }

  /**
   * @param {object} diag  resultado de FP.diagnosticEngine.runDiagnostic
   * @param {object} ctx   { run (forecast), rf (reforecast), ai: resultado de Cohere o null }
   */
  function buildAnalysisExport(diag, { run = null, rf = null, ai = null, categoryProduct = null } = {}) {
    const ch = diag.channel.id;
    const fs = run ? (ch === 'total' ? run.total : run.channels[ch]) : null;
    const rs = rf ? (ch === 'total' ? rf.total : rf.channels[ch]) : null;
    const fp = summarySide(fs, diag.period);
    const rp = summarySide(rs, diag.period);
    return {
      schema: 'analysis_export', schemaVersion: C().schemaVersion,
      metadata: { app: C().app.name, version: C().app.version, algorithmVersion: diag.algorithmVersion,
        referenceDate: diag.referenceDate, cutoff: diag.cutoff, metric: diag.metric,
        note: 'Hechos → drivers (atribución matemática) → señales → hipótesis (requieren validación). Nada aquí es una causa ni una recomendación.' },
      comparison: diag.comparison,
      period: diag.period,
      channel: diag.channel,
      plan: fp ? block(fp.plan) : null,
      actual: fp ? block(fp.actualToDate) : null,
      forecast: fp ? block(fp.forecast) : null,
      reforecast: rp ? { reforecast: block(rp.reforecast), required: block(rp.required), recovery_gap: rp.recoveryGap,
        recovery_pressure: rp.pressure ? rp.pressure.revenue.pressure : null } : null,
      gap: diag.status === 'ok' ? { metric: diag.metric, current: diag.result.current[diag.metric], baseline: diag.result.baseline[diag.metric],
        abs: diag.gap.abs, pct: diag.gap.pct, fact: diag.result.fact, currentLabel: diag.result.currentLabel, baselineLabel: diag.result.baselineLabel,
        currentBlock: block(diag.result.current), baselineBlock: block(diag.result.baseline) } : null,
      level1Drivers: (diag.level1Drivers || []).map((d) => ({ driver: d.driver, label: d.label, current: d.current, baseline: d.baseline,
        delta: d.delta, deltaPct: d.deltaPct, contribution: d.contribution, shareOfGap: d.shareOfGap, sign: d.sign })),
      mainDriver: diag.level1 ? { driver: diag.level1.mainDriver, statement: diag.level1.statement } : null,
      level2: (diag.level2 || []).map((dim) => ({ dimension: dim.dimension, label: dim.label, source: dim.source, reference: dim.reference,
        mixEffect: dim.mix, groups: dim.groups.map((g) => ({ value: g.value, label: g.label, observations: g.observations, exposure: g.exposure,
          current: block(g.current), baseline: block(g.baseline), contributions: g.contributions,
          extra: { customers: g.metrics.customers, newCustomers: g.metrics.newCustomers, returningCustomers: g.metrics.returningCustomers, itemsPerOrder: g.metrics.itemsPerOrder } })) })),
      level2Signals: diag.signals || [],
      hypotheses: [...(diag.hypotheses || []), ...(ai && ai.ok ? ai.hypotheses : [])],
      aiAnalysis: ai ? { status: ai.status, model: ai.model, errors: ai.errors } : { status: 'not_requested' },
      recovery: diag.recovery,
      dataQuality: { confidence: diag.confidence, availability: diag.availability, coverage: diag.coverage },
      assumptions: diag.assumptions,
      attributionMethod: diag.attributionMethod,
      validation: diag.validation,
      generatedAt: new Date().toISOString(),
      // Fase 8.1 (opcional, aditivo): Categoría → Producto del mismo periodo y canal, si ya se calculó
      ...(categoryProduct ? { categoryProduct: {
        comparison: categoryProduct.comparison, period: categoryProduct.period, baseline: categoryProduct.baseline, level: categoryProduct.level,
        note: 'Referencia de productos: periodo anterior o año anterior (no existe plan por producto).',
        topContributors: categoryProduct.rows.slice(0, 15).map((r) => ({ key: r.key, delta: r.revenue.delta, deltaPct: r.revenue.deltaPct, share: r.share, contribution: r.contribution, status: r.status, signals: r.signals.map((x) => x.pattern) })),
        compensation: categoryProduct.compensation, signals: categoryProduct.signals.slice(0, 30) } } : {})
    };
  }

  FP.analysisExport = { buildAnalysisExport };
})(typeof window !== 'undefined' ? window : globalThis);
