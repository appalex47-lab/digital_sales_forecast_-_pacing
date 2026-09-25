/**
 * categoryProductExport.js — category_product_analysis_export.json (Fase 8.1).
 * Resultado de FP.productAnalysis.run con filtros, disponibilidad de métricas, participación, contribución,
 * señales y referencias de origen (archivos importados). Pensado para complementar analysis_export.json
 * (BRECHA → DRIVER → SEÑAL → CATEGORÍA → PRODUCTO → SKU) y para fases posteriores.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const METRIC_KEYS = ['revenue', 'orders', 'units', 'views', 'addToCart', 'beginCheckout', 'purchasesGa4', 'conversionRate', 'aov', 'cartRate', 'checkoutRate', 'purchaseRate', 'trackingCoverage'];
  const metrics = (m) => (m ? Object.fromEntries(METRIC_KEYS.map((k) => [k, m[k] ? { value: m[k].value, status: m[k].status, source: m[k].source, coverage: m[k].coverage ?? null } : null])) : null);

  function buildCategoryProductExport(result, { batches = [], diagnosis = null, filters = {}, cutoff = null } = {}) {
    return {
      schema: 'category_product_analysis_export', schemaVersion: C().schemaVersion, version: 1,
      generatedAt: new Date().toISOString(),
      source: { app: C().app.name, version: C().app.version },
      period: result.period, baseline: result.baseline, comparison: result.comparison, cutoff,
      filters: { channel: result.channel, ...result.filter, ...filters },
      level: result.level, nextLevel: result.next,
      metricsAvailable: result.mappedMetrics,
      rules: {
        share: 'venta del grupo ÷ venta total del periodo',
        contribution: 'Δ venta del grupo ÷ Δ venta total',
        conversionRate: 'pedidos reales ÷ vistas de ficha (GA4), solo con ambos observados; sin vistas = no disponible',
        aov: 'venta ÷ pedidos, solo con pedidos > 0; si no, no calculable',
        funnelRates: 'vista → carrito, carrito → checkout, checkout → compra (GA4 por artículo); solo disponibles sin filtrar por estado, sucursal o entrega',
        trackingCoverage: 'compras GA4 ÷ unidades reales; señal de calidad de medición, no una métrica de venta',
        missingInvalid: 'faltante, inválido y no disponible nunca se convierten en 0',
        signals: 'patrones descriptivos, no causales'
      },
      total: { current: metrics(result.total.current), baseline: metrics(result.total.baseline), revenue: result.total.revenue },
      rows: result.rows.map((r) => ({ key: r.key, level: r.level, status: r.status, revenue: r.revenue, share: r.share, baselineShare: r.baselineShare,
        contribution: r.contribution, contributionAbs: r.contributionAbs, current: metrics(r.current), baseline: metrics(r.baseline),
        drivers: r.drivers, signals: r.signals, skus: r.current ? r.current.skus : 0, conflicts: r.current ? r.current.conflicts : 0 })),
      compensation: result.compensation, concentration: result.concentration, signals: result.signals,
      diagnosisLink: diagnosis ? { comparison: diagnosis.comparison, period: diagnosis.period, channel: diagnosis.channel,
        gap: diagnosis.gap || null, mainDriver: diagnosis.level1 ? diagnosis.level1.mainDriver : null } : null,
      sourceFiles: batches.map((b) => ({ id: b.id, fileName: b.fileName, importedAt: b.importedAt, rows: b.summary.rows, accepted: b.summary.accepted,
        dateMin: b.summary.dateMin, dateMax: b.summary.dateMax, mapping: b.mapping, policy: b.policy }))
    };
  }

  FP.categoryProductExport = { buildCategoryProductExport };
})(typeof window !== 'undefined' ? window : globalThis);
