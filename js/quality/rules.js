/**
 * rules.js — Fase A · motor de calidad: catálogo de reglas con acción, y cuarentena por celda.
 *
 * Cada tipo de incidencia que ya detecta validation.js (catálogo en config.errorTypes) recibe aquí su ACCIÓN:
 *   - reject_row      la fila no se puede ubicar (sin fecha o canal válidos): no entra, como antes.
 *   - quarantine_cell la fila entra, pero ESA celda queda en cuarentena: se conserva el valor original (raw) y el interpretado,
 *                     la regla y el motivo; no participa en sumas ni ratios. Antes, la fila completa se rechazaba (o, con
 *                     «importar filas con errores», el negativo se sumaba).
 *   - flag            se registra como advertencia y no se excluye nada.
 * Política de negativos (decisión del usuario, con la recomendación): nunca se transforman (ni −500 → 500 ni → 0); van a
 * cuarentena con su valor original. En datos diarios por canal un total negativo casi siempre es un error, no una devolución;
 * si una fuente trae devoluciones netas, la excepción se agregará como política explícita por fuente (Fase B), no en silencio.
 * Reglas determinísticas: Cohere no participa en ninguna decisión de calidad.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const RULES = {
    INVALID_DATE: { action: 'reject_row', overridable: false, why: 'Sin fecha válida la fila no se puede ubicar en el calendario.' },
    AMBIGUOUS_DATE: { action: 'reject_row', overridable: true, why: 'La fecha admite dos lecturas (DD/MM o MM/DD); elige el formato en la carga.' },
    MISSING_DATE: { action: 'reject_row', overridable: false, why: 'Sin fecha la fila no se puede ubicar.' },
    INVALID_CHANNEL: { action: 'reject_row', overridable: true, why: 'Canal no reconocido; se puede homologar en Configuración → Equivalencias.' },
    MISSING_CHANNEL: { action: 'reject_row', overridable: false, why: 'Sin canal la fila no se puede ubicar.' },
    INVALID_REVENUE: { action: 'quarantine_cell', field: 'revenue', overridable: false, why: 'Valor no numérico: se conserva el original y no entra a los KPIs.' },
    INVALID_ORDERS: { action: 'quarantine_cell', field: 'orders', overridable: false, why: 'Valor no numérico: se conserva el original y no entra a los KPIs.' },
    INVALID_TRAFFIC: { action: 'quarantine_cell', field: 'trafficVolume', overridable: false, why: 'Valor no numérico: se conserva el original y no entra a los KPIs.' },
    INVALID_CONVERSION_RATE: { action: 'quarantine_cell', field: 'conversionRate', overridable: false, why: 'CR fuera de rango o no numérico.' },
    INVALID_AOV: { action: 'quarantine_cell', field: 'aov', overridable: false, why: 'AOV no numérico o incompatible.' },
    NEGATIVE_REVENUE: { action: 'quarantine_cell', field: 'revenue', overridable: true, why: 'Venta negativa: puede ser devolución, ajuste o error; no se cambia ni se suma.' },
    NEGATIVE_ORDERS: { action: 'quarantine_cell', field: 'orders', overridable: true, why: 'Pedidos negativos: no se cambian ni se suman.' },
    NEGATIVE_TRAFFIC: { action: 'quarantine_cell', field: 'trafficVolume', overridable: true, why: 'Volumen negativo: no se cambia ni se suma.' },
    FUTURE_DATE: { action: 'flag', overridable: false, why: 'Un dato real con fecha futura suele ser una fila adelantada o en 0.' },
    NON_ISO_DATE: { action: 'flag', overridable: false, why: 'La fecha se interpretó con el formato elegido.' },
    MISSING_VALUE: { action: 'flag', overridable: false, why: 'Celda vacía: no se trata como cero.' },
    MATHEMATICAL_INCONSISTENCY: { action: 'flag', overridable: false, why: 'Métricas incompatibles entre sí (por ejemplo, más pedidos que tráfico).' },
    DUPLICATE_RECORD: { action: 'flag', overridable: false, why: 'Misma fecha y canal que otro registro.' },
    INVALID_DAY_TYPE: { action: 'flag', overridable: false, why: 'Tipo de día no reconocido.' },
    INVALID_NUMBER: { action: 'flag', overridable: false, why: 'Número inválido en un campo secundario.' },
    MALFORMED_ROW: { action: 'flag', overridable: false, why: 'La fila trae más o menos columnas que el encabezado.' },
    MISSING_REQUIRED_COLUMN: { action: 'reject_file', overridable: false, why: 'Falta una columna obligatoria en el mapeo.' },
    DUPLICATE_MAPPING: { action: 'reject_file', overridable: false, why: 'Dos columnas van al mismo campo.' }
  };

  /** Catálogo completo para la UI y las pruebas: código, severidad, etiqueta, acción y motivo. */
  function catalog() {
    return Object.entries(C().errorTypes || {}).map(([code, t]) => ({ code, severity: t.severity, label: t.label, ...(RULES[code] || { action: 'flag', overridable: false, why: '' }) }));
  }
  const actionOf = (type) => (RULES[type] || { action: 'flag' }).action;

  /** De qué métricas depende cada calculada: si una entrada queda en cuarentena, la calculada no se puede usar. */
  const DEPENDS = { conversionRate: ['orders', 'trafficVolume'], aov: ['revenue', 'orders'] };

  /**
   * Aplica la cuarentena a las filas procesadas por import.process. Muta rows: status 'quarantined' cuando TODOS sus errores son
   * de celda (la llave es válida); marca cada celda { value: null, source: 'quarantined', raw, parsedValue, rule } y deja sin
   * valor las calculadas que dependían de ella. Devuelve cuántas filas y celdas quedaron en cuarentena.
   */
  function applyQuarantine(rows) {
    let qRows = 0, qCells = 0;
    rows.forEach((r) => {
      if (!r.keyValid) return;
      const errs = r.issues.filter((i) => i.severity === 'error');
      if (!errs.length || !errs.every((i) => actionOf(i.type) === 'quarantine_cell')) return;
      const m = r.record.metrics;
      errs.forEach((i) => {
        const k = RULES[i.type].field; const cell = m[k] || {};
        if (cell.source === 'quarantined') return;
        m[k] = { value: null, source: 'quarantined', raw: i.value === undefined ? cell.raw : i.value, parsedValue: typeof cell.value === 'number' ? cell.value : null, rule: i.type, note: RULES[i.type].why };
        qCells++;
        i.action = 'quarantine_cell';
      });
      Object.entries(DEPENDS).forEach(([k, deps]) => {
        if (m[k] && m[k].source === 'calculated' && deps.some((d) => m[d] && m[d].source === 'quarantined')) m[k] = { value: null, source: 'missing', note: 'No se calcula: una de sus entradas está en cuarentena.' };
      });
      r.status = 'quarantined'; r.record.status = 'quarantined'; qRows++;
    });
    return { rows: qRows, cells: qCells };
  }

  /** Lista de cuarentena (auditoría) a partir de lo guardado: registro, celda, valor original, regla, archivo y fila. */
  function quarantineList(store, dataTypes = C().dataTypeIds) {
    if (dataTypes === C().dataTypeIds) return FP.dataStore.cached(store, 'quarantineList', dataTypes, () => quarantineListRaw(store, dataTypes));
    return quarantineListRaw(store, dataTypes);
  }
  function quarantineListRaw(store, dataTypes) {
    const out = [];
    dataTypes.forEach((t) => {
      const bats = new Map((FP.dataStore.batches(store, t) || []).map((b) => [b.id, b]));
      FP.dataStore.records(store, t).forEach((rec) => Object.entries(rec.metrics || {}).forEach(([k, c]) => {
        if (!c || c.source !== 'quarantined') return;
        const b = bats.get(rec.provenance && rec.provenance.batchId) || {};
        out.push({ dataType: t, date: rec.date, channel: rec.channel, field: k, rawValue: c.raw, parsedValue: c.parsedValue, rule: c.rule,
          action: 'quarantine_cell', fileName: (rec.provenance && rec.provenance.fileName) || b.fileName || null, row: rec.provenance ? rec.provenance.row : null,
          importedAt: b.importedAt || null, why: c.note || '' });
      }));
    });
    return out;
  }

  /**
   * Cuarentena de Productos (unificada con la de la Fase A). Productos ya apartaba los valores negativos o no numéricos de cada celda
   * (no suman, se guardan como inválidos, no como 0) y los registraba como incidencias de su lote: NEGATIVE_<MÉTRICA> e INVALID_<MÉTRICA>.
   * Aquí se leen esas incidencias (conteo exacto por regla y hasta 25 ejemplos por regla con archivo, fila, campo y valor original) y se
   * presentan igual que las demás. Las cifras de Productos no cambian: la política ya era excluir.
   */
  const PRODUCT_CELL = /^(NEGATIVE|INVALID)_[A-Z0-9_]+$/;
  const PRODUCT_METRIC = { REVENUE: 'Venta', ORDERS: 'Pedidos', UNITS: 'Unidades', VIEWS: 'Vistas de ficha', ADDTOCART: 'Agregados al carrito', BEGINCHECKOUT: 'Inicio de checkout', PURCHASESGA4: 'Compras GA4' };
  const isProductCell = (code) => PRODUCT_CELL.test(String(code)) && !['INVALID_DATE', 'INVALID_CHANNEL', 'INVALID_STATE', 'INVALID_DELIVERY'].includes(code);
  function productRuleLabel(code) {
    const m = String(code).match(/^(NEGATIVE|INVALID)_(.+)$/); if (!m) return code;
    const metric = PRODUCT_METRIC[m[2]] || m[2].toLowerCase();
    return m[1] === 'NEGATIVE' ? `${metric}: valor negativo` : `${metric}: valor no numérico`;
  }
  const PRODUCT_FIELD = { revenue: 'Venta', orders: 'Pedidos', units: 'Unidades', views: 'Vistas de ficha', addToCart: 'Agregados al carrito', beginCheckout: 'Inicio de checkout', purchasesGa4: 'Compras GA4' };
  const productFieldLabel = (k) => PRODUCT_FIELD[k] || k;
  const PRODUCT_KIND = { sales: 'Productos · venta', funnel: 'Productos · embudo' };
  /** Lo mínimo de cada lote de Productos que usan Calidad de datos (cuarentena, registro y salud). */
  function slimProductBatch(b) {
    const byType = b.issuesByType || {};
    const q = Object.values(byType).filter((t) => isProductCell(t.type));
    return { id: b.id, kind: b.kind || 'sales', fileName: b.fileName, importedAt: b.importedAt, mappedCount: Object.values(b.mapping || {}).filter(Boolean).length,
      summary: { rows: (b.summary || {}).rows || 0, accepted: (b.summary || {}).accepted || 0, rejected: (b.summary || {}).rejected || 0, exactDuplicates: (b.summary || {}).exactDuplicates || 0,
        conflicts: (b.summary || {}).conflicts || 0, warningRows: (b.summary || {}).warningRows || 0 },
      quarantineByRule: Object.fromEntries(q.map((t) => [t.type, t.count])), quarantined: q.reduce((a, t) => a + t.count, 0),
      malformed: (byType.MALFORMED_ROW || {}).count || 0,
      examples: (b.issueExamples || []).filter((e) => isProductCell(e.type)).map((e) => ({ type: e.type, row: e.row, field: e.field, value: e.value, message: e.message })) };
  }
  /** Lista de cuarentena de Productos en el mismo formato que quarantineList (más `examplesOnly`: muestra, no el total). */
  function productQuarantineList(slim) {
    const out = [];
    (slim || []).forEach((b) => b.examples.forEach((e) => out.push({ dataType: 'products', kind: b.kind, date: null, channel: null, field: e.field, rawValue: e.value, parsedValue: null, rule: e.type,
      action: 'quarantine_cell', fileName: b.fileName, row: e.row, importedAt: b.importedAt, why: e.message || '', examplesOnly: true })));
    return out;
  }
  function productQuarantineTotals(slim) {
    const byRule = {}; let total = 0;
    (slim || []).forEach((b) => Object.entries(b.quarantineByRule).forEach(([r, n]) => { byRule[r] = (byRule[r] || 0) + n; total += n; }));
    return { total, byRule };
  }

  FP.qualityRules = { RULES, catalog, actionOf, applyQuarantine, quarantineList, isProductCell, productRuleLabel, productFieldLabel, slimProductBatch, productQuarantineList, productQuarantineTotals, PRODUCT_KIND };
})(typeof window !== 'undefined' ? window : globalThis);
