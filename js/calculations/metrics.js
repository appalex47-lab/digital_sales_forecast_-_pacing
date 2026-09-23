/**
 * metrics.js — Núcleo matemático determinístico.
 *
 *   Pedidos = traffic_volume × CR
 *   Venta   = Pedidos × AOV = traffic_volume × CR × AOV
 *   CR      = Pedidos / traffic_volume
 *   AOV     = Venta / Pedidos
 *
 * Reglas:
 *  - Ninguna función devuelve NaN ni Infinity: lo inválido es `null`.
 *  - Un valor cargado por el usuario nunca se sobrescribe; solo se
 *    completan huecos y se reportan inconsistencias.
 *  - CR y AOV nunca se promedian: se recalculan desde sumas.
 *  - CR se guarda como fracción (0.0125 = 1.25 %).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  /* ---------- Primitivas seguras ---------- */

  function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

  /**
   * Normaliza cualquier entrada a número finito o null.
   * Acepta '1,250.50', '$1,250', ' 12 ', '1.25%' (→ 0.0125).
   */
  function toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    let s = v.trim();
    if (s === '') return null;
    const isPct = s.endsWith('%');
    s = s.replace(/[%$\s,]/g, '');
    if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return isPct ? n / 100 : n;
  }

  function safeDivide(numerator, denominator) {
    const a = toNumberOrNull(numerator), b = toNumberOrNull(denominator);
    if (a === null || b === null || b === 0) return null;
    const r = a / b;
    return Number.isFinite(r) ? r : null;
  }

  function safeMultiply(...values) {
    let r = 1;
    for (const v of values) {
      const n = toNumberOrNull(v);
      if (n === null) return null;
      r *= n;
    }
    return Number.isFinite(r) ? r : null;
  }

  /** Suma ignorando nulos; null si no hay ningún valor válido. */
  function sumNullable(values) {
    let total = 0, any = false;
    for (const v of values) {
      const n = toNumberOrNull(v);
      if (n !== null) { total += n; any = true; }
    }
    return any ? total : null;
  }

  /** ¿a ≈ b? según tolerancia {relative, absolute}. */
  function isClose(a, b, tol) {
    const x = toNumberOrNull(a), y = toNumberOrNull(b);
    if (x === null || y === null) return null;
    const diff = Math.abs(x - y);
    const scale = Math.max(Math.abs(x), Math.abs(y));
    return diff <= (tol.absolute || 0) || (scale > 0 && diff / scale <= (tol.relative || 0));
  }

  /* ---------- Relaciones del modelo ---------- */

  const calcConversionRate = (orders, trafficVolume) => safeDivide(orders, trafficVolume);
  const calcAov = (revenue, orders) => safeDivide(revenue, orders);
  const calcOrders = (trafficVolume, conversionRate) => safeMultiply(trafficVolume, conversionRate);
  const calcRevenue = (trafficVolume, conversionRate, aov) => safeMultiply(trafficVolume, conversionRate, aov);
  const calcRevenueFromOrders = (orders, aov) => safeMultiply(orders, aov);
  const calcTrafficVolume = (orders, conversionRate) => safeDivide(orders, conversionRate);

  /* ---------- Bloques de métricas ---------- */

  function emptyBlock() {
    return { revenue: null, orders: null, trafficVolume: null, conversionRate: null, aov: null };
  }

  /** Métricas con valor presente pero no numérico (se descartan como null). */
  function findRejectedInputs(input) {
    if (!input) return [];
    return C().metricKeys.filter((k) => {
      const raw = input[k];
      const present = raw !== null && raw !== undefined && !(typeof raw === 'string' && raw.trim() === '');
      return present && toNumberOrNull(raw) === null;
    });
  }

  function normalizeBlock(input) {
    const out = emptyBlock();
    if (!input) return out;
    C().metricKeys.forEach((k) => { out[k] = toNumberOrNull(input[k]); });
    return out;
  }

  /**
   * Completa un bloque a partir de lo cargado, sin tocar lo cargado.
   * @param {object} input  valores cargados (pueden faltar)
   * @param {string} source origen de lo cargado: 'observed' | 'input'
   * @returns {{values: object, sources: object, rejected: string[]}}
   *          sources[k] ∈ 'observed' | 'input' | 'model' | 'calculated' | null
   *          rejected: métricas con texto no numérico descartado
   */
  function deriveBlock(input, source = 'observed') {
    const rejected = findRejectedInputs(input);
    const v = normalizeBlock(input);
    const src = {};
    C().metricKeys.forEach((k) => { src[k] = v[k] !== null ? source : null; });

    const fill = (key, value) => {
      if (v[key] === null && value !== null) { v[key] = value; src[key] = 'calculated'; return true; }
      return false;
    };

    // Dos pasadas bastan para resolver cadenas (p.ej. tráfico+CR → pedidos → venta).
    for (let pass = 0; pass < 2; pass++) {
      fill('conversionRate', calcConversionRate(v.orders, v.trafficVolume));
      fill('aov', calcAov(v.revenue, v.orders));
      fill('orders', calcOrders(v.trafficVolume, v.conversionRate));
      fill('revenue', calcRevenueFromOrders(v.orders, v.aov));
      fill('trafficVolume', calcTrafficVolume(v.orders, v.conversionRate));
    }
    return { values: v, sources: src, rejected };
  }

  /**
   * Valida consistencia interna de un bloque.
   * @returns {{status, checks: Array, issues: Array}}
   *   status: 'ok' | 'warning' | 'error' | 'empty'
   *   check.status: 'pass' | 'warning' | 'error' | 'na'
   */
  function validateBlock(values, sources = {}, rejected = []) {
    const v = normalizeBlock(values);
    const tol = C().tolerances;
    const checks = [];
    const add = (id, label, status, message = '', detail = null) =>
      checks.push({ id, label, status, message, detail });

    if (rejected.length)
      add('numeric_input', 'Entradas numéricas', 'error',
        `Valores no numéricos descartados en: ${rejected.map((k) => C().metrics[k].label).join(', ')}`);

    const hasAny = C().metricKeys.some((k) => v[k] !== null);
    if (!hasAny) {
      const issues = checks.slice();
      return { status: issues.length ? 'error' : 'empty', checks, issues };
    }

    // 1. Rango
    const negatives = C().metricKeys.filter((k) => v[k] !== null && v[k] < 0);
    add('non_negative', 'Sin negativos', negatives.length ? 'error' : 'pass',
      negatives.length ? `Valores negativos en: ${negatives.map((k) => C().metrics[k].label).join(', ')}` : '');

    // 2. División entre cero implícita
    if (v.trafficVolume === 0 && (v.orders || 0) > 0)
      add('zero_traffic', 'Volumen > 0 con pedidos', 'error', 'Hay pedidos con volumen 0: CR indefinido.');
    if (v.orders === 0 && (v.revenue || 0) > 0)
      add('zero_orders', 'Pedidos > 0 con venta', 'error', 'Hay venta con 0 pedidos: AOV indefinido.');

    // 3. CR físicamente posible
    if (v.conversionRate !== null) {
      const s = v.conversionRate > 1 ? 'error' : 'pass';
      add('cr_range', 'CR entre 0 % y 100 %', s, s === 'error' ? 'CR mayor a 100 %: pedidos superan al volumen.' : '');
    }

    // 4. Identidades (solo si hay datos suficientes)
    const identity = (id, label, observed, expected, tolKey, ownerKey) => {
      if (observed === null || expected === null) return add(id, label, 'na', 'Datos insuficientes');
      const ok = isClose(observed, expected, tol[tolKey]);
      const loaded = sources[ownerKey] === 'observed' || sources[ownerKey] === 'input';
      add(id, label, ok ? 'pass' : 'warning',
        ok ? '' : (loaded ? 'el valor cargado no coincide con el calculado.' : 'no cuadra con las demás métricas.'),
        { observed, expected, diff: observed - expected });
    };

    identity('cr_identity', 'CR = Pedidos ÷ Volumen', v.conversionRate, calcConversionRate(v.orders, v.trafficVolume), 'conversionRate', 'conversionRate');
    identity('aov_identity', 'AOV = Venta ÷ Pedidos', v.aov, calcAov(v.revenue, v.orders), 'aov', 'aov');
    identity('orders_identity', 'Pedidos = Volumen × CR', v.orders, calcOrders(v.trafficVolume, v.conversionRate), 'orders', 'orders');
    identity('revenue_identity', 'Venta = Volumen × CR × AOV', v.revenue, calcRevenue(v.trafficVolume, v.conversionRate, v.aov), 'revenue', 'revenue');

    const issues = checks.filter((c) => c.status === 'error' || c.status === 'warning');
    const status = checks.some((c) => c.status === 'error') ? 'error'
      : checks.some((c) => c.status === 'warning') ? 'warning' : 'ok';
    return { status, checks, issues };
  }

  /**
   * Agrega bloques: suma métricas aditivas y recalcula CR/AOV desde las sumas.
   * Nunca promedia ratios.
   */
  function aggregateBlocks(blocks) {
    const out = emptyBlock();
    C().additiveMetricKeys.forEach((k) => { out[k] = sumNullable(blocks.map((b) => b && b[k])); });
    out.conversionRate = calcConversionRate(out.orders, out.trafficVolume);
    out.aov = calcAov(out.revenue, out.orders);
    return out;
  }

  /* ---------- Gap y jerarquía ---------- */

  /** Gap de `value` contra `reference`. */
  function calcGap(reference, value) {
    const r = toNumberOrNull(reference), a = toNumberOrNull(value);
    const abs = r === null || a === null ? null : a - r;
    return { reference: r, value: a, abs, pct: safeDivide(abs, r), attainment: safeDivide(a, r) };
  }

  /**
   * Valida que la suma de hijos cuadre con el padre
   * (días → mes, meses → año, canales → total).
   */
  function validateHierarchy(parentValue, childValues, tolerance = C().tolerances.hierarchy) {
    const parent = toNumberOrNull(parentValue);
    const sum = sumNullable(childValues);
    if (parent === null || sum === null) return { status: 'na', parent, sum, diff: null, diffPct: null };
    const diff = sum - parent;
    return { status: isClose(sum, parent, tolerance) ? 'pass' : 'warning', parent, sum, diff, diffPct: safeDivide(diff, parent) };
  }

  FP.metrics = {
    isFiniteNumber, toNumberOrNull, safeDivide, safeMultiply, sumNullable, isClose,
    calcConversionRate, calcAov, calcOrders, calcRevenue, calcRevenueFromOrders, calcTrafficVolume,
    emptyBlock, normalizeBlock, findRejectedInputs, deriveBlock, validateBlock, aggregateBlocks,
    calcGap, validateHierarchy
  };
})(typeof window !== 'undefined' ? window : globalThis);
