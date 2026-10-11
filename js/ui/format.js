/**
 * format.js — Formato de presentación. Único lugar donde un número se vuelve texto.
 * Cualquier valor inválido se muestra como "—" (nunca NaN / Infinity).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const DASH = '—';

  const cache = {};
  function nf(key, opts) {
    if (!cache[key]) cache[key] = new Intl.NumberFormat(C().locale, opts);
    return cache[key];
  }

  const valid = (v) => M().isFiniteNumber(v);

  function currency(v, decimals = 0) {
    return valid(v) ? nf(`cur${decimals}`, { style: 'currency', currency: C().currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v) : DASH;
  }

  /** $261.0 M, $8.2 M, $950 K */
  function currencyCompact(v) {
    if (!valid(v)) return DASH;
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${currency(v / 1e6, 1)} M`;
    if (abs >= 1e4) return `${currency(v / 1e3, 0)} K`;
    return currency(v, 0);
  }

  function integer(v) { return valid(v) ? nf('int', { maximumFractionDigits: 0 }).format(v) : DASH; }
  function decimal(v, d = 2) { return valid(v) ? nf(`dec${d}`, { maximumFractionDigits: d }).format(v) : DASH; }
  function percent(v, d = 2) {
    return valid(v) ? nf(`pct${d}`, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : DASH;
  }
  function signedPercent(v, d = 1) { return valid(v) ? `${v > 0 ? '+' : ''}${percent(v, d)}` : DASH; }

  /** Formato por métrica según FP.config.metrics[k].kind */
  function metric(key, v) {
    switch (key) {
      case 'revenue': return currency(v, 0);
      case 'aov': return currency(v, 2);
      case 'conversionRate': return percent(v, 2);
      case 'orders':
      case 'trafficVolume': return integer(v);
      default: return decimal(v);
    }
  }

  /** Entrada de montos del usuario: '261M', '98 m', '950k', '261,000,000'. */
  function parseAmountInput(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const m = /^([$\d.,]+)(m|mm|k)?$/.exec(s);
    if (!m) return null;
    const base = M().toNumberOrNull(m[1]);
    if (base === null) return null;
    const mult = m[2] === 'k' ? 1e3 : m[2] ? 1e6 : 1;
    return base * mult;
  }

  /**
   * Monto de un canal (Fase 13): el usuario puede escribir el monto («151M») o su parte del total («58%»).
   * El porcentaje se convierte a monto sobre la meta anual total; lo que se guarda siempre es el monto.
   * @returns {{value:number|null, kind:'amount'|'pct'|null, error?:'invalid'|'no_total'}}
   */
  function parseShareInput(raw, total) {
    const s = String(raw ?? '').trim();
    if (!s) return { value: null, kind: null };
    if (/%$/.test(s)) {
      const n = M().toNumberOrNull(s.replace(/%$/, '').replace(/\s+/g, ''));
      if (n === null || n < 0 || n > 100) return { value: null, kind: 'pct', error: 'invalid' };
      if (!(total > 0)) return { value: null, kind: 'pct', error: 'no_total' };
      return { value: Math.round(total * n) / 100, kind: 'pct' };
    }
    const v = parseAmountInput(s);
    return v === null ? { value: null, kind: 'amount', error: 'invalid' } : { value: v, kind: 'amount' };
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const SOURCE_LABELS = { observed: 'cargado', input: 'capturado', model: 'modelo', calculated: 'calculado' };
  const STATUS_LABELS = { ok: 'Correcto', pass: 'Correcto', warning: 'Advertencia', error: 'Error', empty: 'Sin datos', na: 'N/D' };

  FP.format = { DASH, currency, currencyCompact, integer, decimal, percent, signedPercent, metric,
    parseAmountInput, parseShareInput, escapeHtml, SOURCE_LABELS, STATUS_LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
