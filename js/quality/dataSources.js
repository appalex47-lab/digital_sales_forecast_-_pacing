/**
 * dataSources.js — Fase I · «Fuentes de datos»: qué fuentes existen, cuáles están activas, cuándo se cargó cada una por última vez,
 * qué periodo cubre, qué tan frescos están los datos y qué calidad tienen. Solo lee lo ya guardado (lotes, cobertura y salud); no calcula datos nuevos
 * y no inventa conexiones: las fuentes que todavía no existen se muestran como «No conectado» con lo que necesitan.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const S = () => FP.dataStore;
  const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

  /** Catálogo de fuentes. `phase` es la fase del mapa maestro en la que se conectará; `requires` lo que hace falta de tu lado. */
  const CATALOG = [
    { id: 'manual', label: 'Archivos CSV y Excel', note: 'Carga manual. Histórico, plan, venta real, segmentos y productos.', live: true },
    { id: 'ga4_export', label: 'GA4 · export convertido (CSV)', note: 'El CSV exportado de GA4 que se convierte solo al cargarlo en Segmentos.', live: true },
    { id: 'ga4_direct', label: 'GA4 · conexión directa', phase: 'C', requires: 'Un proyecto de Google Cloud con OAuth de solo lectura autorizado para el dominio de la app.' },
    { id: 'sheets', label: 'Google Sheets', phase: 'D', requires: 'Permisos de Google (OAuth, solo lectura) para leer la hoja.' },
    { id: 'excel365', label: 'Excel / OneDrive / SharePoint', phase: 'E', requires: 'Registrar la app en Azure (Microsoft Graph); normalmente lo aprueba TI.' },
    { id: 'bigquery', label: 'BigQuery', phase: 'F', requires: 'Proyecto, permisos y una estrategia de costos; probablemente un pequeño servidor.' }
  ];

  /** Frescura de una colección: días entre su última fecha con datos y hoy. */
  function freshness(end, today) {
    if (!end) return null;
    const d = Math.max(0, dayDiff(end, today));
    return { until: end, daysBehind: d, tone: d <= 2 ? 'ok' : d <= 7 ? 'warning' : 'error' };
  }

  /** Una fila por tipo de dato cargable (histórico, plan, venta real, segmentos) y por tipo de Productos. */
  function datasets(state, today) {
    const out = [], store = state.store;
    C().dataTypeIds.forEach((t) => {
      const bs = S().batches(store, t), label = C().dataTypes[t].label;
      if (!bs.length) { out.push({ id: t, label, files: 0, empty: true }); return; }
      const cov = FP.coverage.summarizeCollection(store, t), h = FP.dataHealth.collection(store, t), rs = S().records(store, t);
      const last = bs.map((b) => b.importedAt).filter(Boolean).sort().pop() || null;
      out.push({ id: t, label, files: bs.length, records: rs.length, quarantined: cov.quarantined || 0, start: cov.coverage.start, end: cov.coverage.end,
        lastImport: last, score: h.score, sources: [...new Set(bs.map((b) => b.source || 'csv'))], fresh: t === 'actual' || t === 'segments' ? freshness(cov.coverage.end, today) : null });
    });
    ['sales', 'funnel'].forEach((kind) => {
      const bs = (state.productQuality || []).filter((b) => b.kind === kind);
      const label = FP.qualityRules.PRODUCT_KIND[kind];
      if (!bs.length) { out.push({ id: `products-${kind}`, label, files: 0, empty: true, product: true }); return; }
      const ph = FP.dataHealth.products(state.productQuality).find((x) => x.dataType === `products-${kind}`);
      out.push({ id: `products-${kind}`, label, product: true, files: bs.length, records: bs.reduce((a, b) => a + b.summary.accepted, 0), quarantined: bs.reduce((a, b) => a + b.quarantined, 0), start: null, end: null,
        lastImport: bs.map((b) => b.importedAt).filter(Boolean).sort().pop() || null, score: ph ? ph.score : null, sources: ['csv'], fresh: null });
    });
    return out;
  }

  function build(state, today = FP.calendar.toISODate(new Date())) {
    const ds = datasets(state, today);
    const withData = ds.filter((d) => !d.empty);
    const dateRange = (list) => { const s = list.map((d) => d.start).filter(Boolean).sort(), e = list.map((d) => d.end).filter(Boolean).sort(); return s.length ? { start: s[0], end: e[e.length - 1] } : null; };
    const avg = (list) => { const v = list.map((d) => d.score).filter((x) => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const batchesBySource = (src) => C().dataTypeIds.flatMap((t) => S().batches(state.store, t)).filter((b) => (b.source || 'csv') === src);
    const ga4b = batchesBySource('ga4-csv');
    const manualFiles = C().dataTypeIds.flatMap((t) => S().batches(state.store, t)).filter((b) => (b.source || 'csv') !== 'ga4-csv').length + (state.productQuality || []).length;
    const lastOf = (list) => list.map((b) => b.importedAt).filter(Boolean).sort().pop() || null;
    const seg = ds.find((d) => d.id === 'segments');
    const sources = CATALOG.map((c) => {
      if (c.id === 'manual') return { ...c, status: manualFiles ? 'active' : 'empty', files: manualFiles, lastSync: lastOf([...C().dataTypeIds.flatMap((t) => S().batches(state.store, t)).filter((b) => (b.source || 'csv') !== 'ga4-csv'), ...(state.productQuality || [])]), period: dateRange(withData.filter((d) => !d.product)), score: avg(withData) };
      if (c.id === 'ga4_export') return { ...c, status: ga4b.length ? 'active' : 'empty', files: ga4b.length, lastSync: lastOf(ga4b), period: ga4b.length && seg && !seg.empty ? { start: seg.start, end: seg.end } : null, score: ga4b.length && seg ? seg.score : null };
      return { ...c, status: 'unavailable', files: 0, lastSync: null, period: null, score: null };
    });
    return { today, sources, datasets: ds, summary: { activeSources: sources.filter((s) => s.status === 'active').length, liveSources: sources.filter((s) => s.live).length, pendingSources: sources.filter((s) => s.status === 'unavailable').length,
      files: manualFiles + ga4b.length, lastSync: lastOf([...C().dataTypeIds.flatMap((t) => S().batches(state.store, t)), ...(state.productQuality || [])]) } };
  }

  /** «hace 3 h», «hace 2 días»: para la última sincronización. */
  function ago(iso, now = Date.now()) {
    if (!iso) return '—';
    const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    if (m < 1) return 'hace un momento'; if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24); return `hace ${d} día${d === 1 ? '' : 's'}`;
  }

  FP.dataSources = { build, datasets, freshness, ago, CATALOG };
})(typeof window !== 'undefined' ? window : globalThis);
