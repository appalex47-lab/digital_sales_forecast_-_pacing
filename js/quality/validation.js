/**
 * validation.js — Reglas de calidad sobre registros canónicos (Fase 1).
 *
 * Estructura de un issue (ver ARCHITECTURE.md §10):
 *   { type, severity: 'error'|'warning', row, field, message, value,
 *     key?, dataType?, batchId?, fileName? }
 *
 * No modifica valores: solo describe problemas. La decisión de importar o no
 * una fila con errores la toma el pipeline (import.js) según la opción del usuario.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;

  function issue(type, { severity = null, row = null, field = null, message = '', value = null, key = null } = {}) {
    const def = C().errorTypes[type];
    if (!def) throw new Error(`Tipo de error no catalogado: ${type}`);
    return { type, severity: severity || def.severity, row, field, message, value: value === undefined ? null : value, key };
  }

  const INVALID_TYPE = {
    revenue: 'INVALID_REVENUE', orders: 'INVALID_ORDERS', trafficVolume: 'INVALID_TRAFFIC',
    conversionRate: 'INVALID_CONVERSION_RATE', aov: 'INVALID_AOV'
  };
  const NEGATIVE_TYPE = {
    revenue: 'NEGATIVE_REVENUE', orders: 'NEGATIVE_ORDERS', trafficVolume: 'NEGATIVE_TRAFFIC',
    conversionRate: 'INVALID_CONVERSION_RATE', aov: 'INVALID_AOV'
  };

  /** Etiqueta del campo para mensajes: encabezado original si existe. */
  const fieldName = (rec, key) => (rec.provenance && rec.provenance.columns && rec.provenance.columns[key]) || key;

  /**
   * Valida un registro canónico ya normalizado.
   * @param {object} rec   registro canónico (ver import.js buildRecord)
   * @param {object} ctx   { dataType, tolerance, today, parseResults }
   *   parseResults: resultados crudos de normalize.* por campo (para mensajes de parseo)
   */
  function validateRecord(rec, ctx) {
    const out = [];
    const row = rec.provenance ? rec.provenance.row : null;
    const key = rec.key;
    const p = ctx.parseResults || {};
    const add = (type, opts) => out.push(issue(type, { row, key, ...opts }));
    const contract = C().dataTypes[ctx.dataType];

    // 1. Llave lógica: fecha y canal
    const d = p.date;
    if (!d || d.status === 'missing') add('MISSING_DATE', { field: fieldName(rec, 'date'), message: 'La fila no tiene fecha.' });
    else if (d.status === 'ambiguous') add('AMBIGUOUS_DATE', { field: fieldName(rec, 'date'), value: d.raw, message: d.note });
    else if (d.status === 'invalid') add('INVALID_DATE', { field: fieldName(rec, 'date'), value: d.raw, message: d.note });
    else if (d.inferred) add('NON_ISO_DATE', { field: fieldName(rec, 'date'), value: d.raw, message: `${d.note} Resultado: ${d.value}.` });

    const ch = p.channel;
    if (!ch || ch.status === 'missing') add('MISSING_CHANNEL', { field: fieldName(rec, 'channel'), message: 'La fila no tiene canal.' });
    else if (ch.status === 'invalid') add('INVALID_CHANNEL', { field: fieldName(rec, 'channel'), value: ch.raw, message: ch.note });

    if (rec.date && ctx.today && rec.date > ctx.today && (ctx.dataType === 'actual' || ctx.dataType === 'historical')) {
      add('FUTURE_DATE', { field: fieldName(rec, 'date'), value: rec.date, message: `La fecha ${rec.date} es posterior a hoy (${ctx.today}); un dato real no puede ser futuro.` });
    }

    // 2. Métricas: parseo, negativos, faltantes, enteros
    C().metricKeys.forEach((k) => {
      const r = p[k];
      const cell = rec.metrics[k];
      const f = fieldName(rec, k);
      if (r && r.status === 'invalid') {
        add(INVALID_TYPE[k], { field: f, value: r.raw, message: r.note || 'Valor no numérico.' });
        return;
      }
      if (cell.source === 'observed' && cell.value < 0) {
        add(NEGATIVE_TYPE[k], { field: f, value: r ? r.raw : cell.value, message: `${C().metrics[k].label} no puede ser negativo.` });
      }
      if (contract.required.includes(k) && (!r || r.status === 'missing')) {
        add('MISSING_VALUE', { field: f, message: `Falta ${C().metrics[k].label.toLowerCase()} (celda vacía). No se trata como cero.` });
      }
      if ((k === 'orders' || k === 'trafficVolume') && cell.source === 'observed' && !Number.isInteger(cell.value)) {
        add(INVALID_TYPE[k], { severity: 'warning', field: f, value: cell.value, message: `${C().metrics[k].label} debería ser un número entero.` });
      }
    });

    // 3. CR cargado fuera de rango (típico: viene en porcentaje sin '%')
    const crCell = rec.metrics.conversionRate;
    if (crCell.source === 'observed' && crCell.value > 1) {
      const hint = crCell.value <= 100 ? ` Si es porcentaje, usa ${crCell.value / 100} o ${crCell.value}%.` : '';
      add('INVALID_CONVERSION_RATE', { field: fieldName(rec, 'conversionRate'), value: p.conversionRate ? p.conversionRate.raw : crCell.value,
        message: `CR debe ser una fracción entre 0 y 1.${hint}` });
    }

    // 4. Consistencia matemática (con valores observados)
    const v = (k) => (rec.metrics[k].source === 'observed' ? rec.metrics[k].value : null);
    const rev = v('revenue'), ord = v('orders'), trf = v('trafficVolume');
    if (ord !== null && trf !== null) {
      if (trf === 0 && ord > 0) add('MATHEMATICAL_INCONSISTENCY', { severity: 'error', field: fieldName(rec, 'trafficVolume'), value: trf,
        message: `Hay ${ord} pedidos con volumen 0: el CR no se puede calcular.` });
      else if (ord > trf) add('MATHEMATICAL_INCONSISTENCY', { severity: 'error', field: fieldName(rec, 'orders'), value: ord,
        message: `Pedidos (${ord}) mayores que el volumen (${trf}): CR superior a 100 %.` });
    }
    if (rev !== null && ord !== null) {
      if (ord === 0 && rev > 0) add('MATHEMATICAL_INCONSISTENCY', { severity: 'error', field: fieldName(rec, 'orders'), value: ord,
        message: `Hay venta (${rev}) con 0 pedidos: el AOV no se puede calcular.` });
      else if (rev === 0 && ord > 0) add('MATHEMATICAL_INCONSISTENCY', { field: fieldName(rec, 'revenue'), value: rev,
        message: `Hay ${ord} pedidos con venta 0: AOV igual a cero.` });
    }

    const tol = { relative: ctx.tolerance, absolute: 0 };
    const compare = (k, expected, formula) => {
      const loaded = v(k);
      if (loaded === null || expected === null) return;
      if (!M().isClose(loaded, expected, tol)) {
        add('MATHEMATICAL_INCONSISTENCY', { field: fieldName(rec, k), value: loaded,
          message: `${C().metrics[k].label} cargado (${round(loaded)}) no coincide con ${formula} (${round(expected)}) dentro de la tolerancia de ${round(ctx.tolerance * 100)} %. Se conserva el valor cargado.` });
      }
    };
    compare('conversionRate', M().calcConversionRate(ord, trf), 'pedidos ÷ volumen');
    compare('aov', M().calcAov(rev, ord), 'venta ÷ pedidos');
    // Plan sin pedidos cargados: validar pedidos derivados contra volumen × CR no aplica (son la misma fórmula).

    // Fase 5: segmentos y métricas extra
    if (ctx.dataType === 'segments') {
      ['dimension', 'segment'].forEach((k) => {
        const r = p[k];
        if (!r || r.status !== 'ok') add('MISSING_VALUE', { severity: 'error', field: fieldName(rec, k), value: r ? r.raw : null,
          message: `Falta ${k === 'dimension' ? 'la dimensión' : 'el segmento'}: la fila no se puede ubicar.` });
      });
    }
    C().importFields.filter((f) => f.extra).forEach((f) => {
      const r = p[f.key];
      if (r && r.status === 'invalid') add('INVALID_NUMBER', { field: fieldName(rec, f.key), value: r.raw, message: `${f.label}: ${r.note || 'no es un número válido'}.` });
      else if (r && r.status === 'ok' && r.value < 0) add('INVALID_NUMBER', { field: fieldName(rec, f.key), value: r.raw, message: `${f.label} no puede ser negativo.` });
    });

    // 5. Tipo de día
    if (p.dayType && p.dayType.status === 'invalid') {
      add('INVALID_DAY_TYPE', { field: fieldName(rec, 'dayType'), value: p.dayType.raw, message: p.dayType.note });
    }

    return out;
  }

  const round = (n) => (Math.abs(n) >= 100 ? Math.round(n * 100) / 100 : Math.round(n * 1e6) / 1e6);

  /** 'valid' | 'warning' | 'error' */
  function statusFromIssues(issues) {
    if (issues.some((i) => i.severity === 'error')) return 'error';
    if (issues.some((i) => i.severity === 'warning')) return 'warning';
    return 'valid';
  }

  /** ¿La fila tiene una llave utilizable (fecha y canal válidos)? */
  const hasValidKey = (rec) => Boolean(rec.date && rec.channel);

  /**
   * Marca duplicados por llave fecha|canal|tipo.
   * - Dentro del mismo archivo: la segunda aparición y siguientes.
   * - Contra lo ya almacenado: toda fila cuya llave ya exista.
   * Nunca elimina: solo devuelve issues.
   * @param {Array} records   registros nuevos (con key)
   * @param {Array} existing  registros ya almacenados del mismo tipo
   */
  function findDuplicateIssues(records, existing = []) {
    const out = [];
    const stored = new Map();
    existing.forEach((r) => { if (!stored.has(r.key)) stored.set(r.key, r); });
    const firstSeen = new Map();
    records.forEach((r) => {
      if (!r.key) return;
      const row = r.provenance.row;
      if (firstSeen.has(r.key)) {
        out.push(issue('DUPLICATE_RECORD', { row, key: r.key, field: 'fecha + canal',
          value: `${r.date} + ${r.channel}`, message: `Duplica la fila ${firstSeen.get(r.key)} de este archivo.` }));
      } else firstSeen.set(r.key, row);
      if (stored.has(r.key)) {
        const prev = stored.get(r.key);
        out.push(issue('DUPLICATE_RECORD', { row, key: r.key, field: 'fecha + canal',
          value: `${r.date} + ${r.channel}`, message: `Ya existe en "${prev.provenance.fileName}" (fila ${prev.provenance.row}). Ambos se conservan; en la vista consolidada prevalece la carga más reciente.` }));
      }
    });
    return out;
  }

  FP.validation = { issue, validateRecord, statusFromIssues, hasValidKey, findDuplicateIssues };
})(typeof window !== 'undefined' ? window : globalThis);
