/**
 * health.js — Fase A · Data Health: un puntaje 0–100 por colección que SIEMPRE se puede desglosar.
 * Cada componente dice cuánto vale, cuántos casos lo bajaron y por qué. El total es el promedio de los componentes que aplican
 * (no hay pesos escondidos). Se calcula desde lo ya guardado (registros, celdas en cuarentena y lotes); no modifica nada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const pl = (n, one, many) => (n === 1 ? one : many);
  const pct = (bad, total) => (total > 0 ? Math.max(0, Math.round(100 * (1 - bad / total))) : null);

  function collection(store, dataType) {
    return FP.dataStore.cached(store, `health:${dataType}`, [dataType], () => collectionRaw(store, dataType));
  }
  function collectionRaw(store, dataType) {
    const recs = FP.dataStore.records(store, dataType);
    const bats = FP.dataStore.batches(store, dataType);
    if (!recs.length && !bats.length) return { dataType, empty: true, score: null, components: [] };
    const s = FP.coverage.summarizeCollection(store, dataType);
    const issues = bats.flatMap((b) => b.issues || []).filter((i) => i.rowImported !== false);
    const count = (types) => new Set(issues.filter((i) => types.includes(i.type)).map((i) => `${i.batchId}:${i.row}`)).size;
    const metricKeys = C().metricKeys;
    const required = (C().dataTypes[dataType].required || []).filter((k) => metricKeys.includes(k));
    let reqCells = 0, reqMissing = 0, cells = 0, badType = 0, qCells = 0;
    recs.forEach((r) => {
      required.forEach((k) => { reqCells++; const c = r.metrics && r.metrics[k]; if (!c || c.source === 'missing') reqMissing++; });
      Object.values(r.metrics || {}).forEach((c) => {
        if (!c || (c.source !== 'observed' && c.source !== 'quarantined')) return;
        cells++;
        if (c.source === 'quarantined') { qCells++; if (/^INVALID_/.test(c.rule || '')) badType++; }
      });
    });
    const malformed = count(['MALFORMED_ROW']);
    const inconsistent = count(['MATHEMATICAL_INCONSISTENCY', 'NEGATIVE_REVENUE', 'NEGATIVE_ORDERS', 'NEGATIVE_TRAFFIC']);
    const future = count(['FUTURE_DATE']);
    const cov = s.coverage || {};
    const rangeDays = cov.expectedDays || cov.days || 0;
    const comps = [
      { key: 'structure', label: 'Estructura', score: pct(malformed + s.rejected, s.rowsRead),
        detail: `${s.rejected} ${pl(s.rejected, 'fila rechazada', 'filas rechazadas')} (sin fecha o canal válidos) y ${malformed} con columnas de más o de menos, de ${s.rowsRead} leídas.` },
      { key: 'completeness', label: 'Completitud', score: pct(reqMissing, reqCells),
        detail: reqCells ? `${reqMissing} de ${reqCells} celdas obligatorias ${pl(reqMissing, 'vacía', 'vacías')} (${required.map((k) => C().metrics[k].label).join(', ')}).` : 'Sin métricas obligatorias en este tipo de archivo.' },
      { key: 'types', label: 'Tipos', score: pct(badType, cells), detail: `${badType} ${pl(badType, 'celda no numérica', 'celdas no numéricas')} en cuarentena, de ${cells} celdas de métricas.` },
      { key: 'consistency', label: 'Consistencia', score: pct(inconsistent, recs.length), detail: `${inconsistent} ${pl(inconsistent, 'registro', 'registros')} con negativos o métricas incompatibles (por ejemplo, más pedidos que tráfico), de ${recs.length}.` },
      dataType === 'segments' || !rangeDays ? null : { key: 'temporal', label: 'Temporalidad', score: pct((s.datesWithMissingChannels || 0) + (s.missingDates || 0) + future, rangeDays),
        detail: `${s.datesWithMissingChannels || 0} ${pl(s.datesWithMissingChannels || 0, 'fecha con algún canal faltante', 'fechas con algún canal faltante')}, ${s.missingDates || 0} sin ningún registro y ${future} ${pl(future, 'fecha futura', 'fechas futuras')}, en ${rangeDays} días.` },
      { key: 'duplicates', label: 'Duplicados', score: pct(s.duplicateRecords || 0, recs.length), detail: `${s.duplicateRecords || 0} ${pl(s.duplicateRecords || 0, 'registro repetido', 'registros repetidos')} (misma fecha y canal), de ${recs.length}.` },
      { key: 'valid', label: 'Registros válidos', score: pct(s.quarantined + s.error, recs.length),
        detail: `${s.quarantined} ${pl(s.quarantined, 'registro con un valor en cuarentena', 'registros con un valor en cuarentena')} y ${s.error} con errores, de ${recs.length} importados.` }
    ].filter(Boolean);
    const used = comps.filter((c) => c.score !== null);
    // un puntaje de 100 solo existe si NADA bajó puntos: el redondeo nunca lo regala (99.5 → 99)
    const score = capScore(used.map((c) => c.score));
    return { dataType, label: C().dataTypes[dataType].label, empty: false, score, components: comps, quarantinedCells: qCells, quarantinedRecords: s.quarantined };
  }

  function capScore(scores) {
    if (!scores.length) return null;
    const avg = scores.reduce((a, x) => a + x, 0) / scores.length;
    return scores.every((x) => x === 100) ? 100 : Math.min(99, Math.round(avg));
  }

  /**
   * Salud de Productos por tipo (venta / embudo), con los mismos nombres de componente. Se calcula con lo que ya guarda cada lote
   * (filas leídas, aceptadas, rechazadas, duplicados, conflictos, filas con advertencia y celdas en cuarentena): no recorre las filas.
   */
  function products(slim) {
    const R = FP.qualityRules; const out = [];
    ['sales', 'funnel'].forEach((kind) => {
      const bs = (slim || []).filter((b) => b.kind === kind); if (!bs.length) return;
      const sum = (f) => bs.reduce((a, b) => a + f(b), 0);
      const rows = sum((b) => b.summary.rows), rejected = sum((b) => b.summary.rejected), malformed = sum((b) => b.malformed), q = sum((b) => b.quarantined);
      const dups = sum((b) => b.summary.exactDuplicates + b.summary.conflicts), warn = sum((b) => b.summary.warningRows);
      const plural = (n, a, b) => (n === 1 ? a : b);
      const comps = [
        { key: 'structure', label: 'Estructura', score: pct(rejected + malformed, rows), detail: `${rejected} ${plural(rejected, 'fila rechazada', 'filas rechazadas')} (sin fecha, canal o SKU válidos) y ${malformed} con columnas de más o de menos, de ${rows} leídas.` },
        { key: 'types', label: 'Tipos', score: pct(q, rows), detail: `${q} ${plural(q, 'celda en cuarentena', 'celdas en cuarentena')} (negativas o no numéricas), de ${rows} filas leídas.` },
        { key: 'duplicates', label: 'Duplicados', score: pct(dups, rows), detail: `${dups} ${plural(dups, 'registro repetido o en conflicto', 'registros repetidos o en conflicto')} (misma fecha, canal y SKU), de ${rows}.` },
        { key: 'valid', label: 'Registros válidos', score: pct(rejected + warn, rows), detail: `${rejected + warn} filas rechazadas o con alguna advertencia, de ${rows} leídas.` }
      ];
      const used = comps.filter((c) => c.score !== null);
      let score = used.length ? Math.round(used.reduce((a, c) => a + c.score, 0) / used.length) : null;
      if (score === 100 && used.some((c) => c.score < 100)) score = 99;   // 100 solo si no hay ninguna incidencia
      out.push({ dataType: `products-${kind}`, label: R.PRODUCT_KIND[kind], empty: false, score, components: comps, quarantinedCells: q, files: bs.length });
    });
    return out;
  }

  function overview(store) {
    const list = C().dataTypeIds.map((t) => collection(store, t)).filter((x) => !x.empty);
    const scored = list.filter((x) => x.score !== null);
    return { score: capScore(scored.map((x) => x.score)), collections: list };
  }

  FP.dataHealth = { collection, overview, products };
})(typeof window !== 'undefined' ? window : globalThis);
