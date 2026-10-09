/**
 * temporalEngine.js — Capa temporal global.
 * Define periodo focal, completitud y comparaciones equivalentes (YoY/MoM/WoW/DoD).
 * No interpreta causalidad; solo devuelve rangos y reglas determinísticas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const Cal = () => FP.calendar;
  const pad = n => String(n).padStart(2, '0');
  const d = x => Cal().parseDate(x);
  const iso = x => Cal().toISODate(x);
  const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const add = (date, type, n) => {
    const x = d(date); if (!x) return null;
    if (type === 'year' || type === 'month') {
      // Mueve el mes/año conservando el día, acotado al último día del mes destino
      // (31-mar − 1 mes = 28/29-feb; 29-feb − 1 año = 28-feb). Sin el acotado JS desborda a marzo.
      const day = x.getUTCDate(); x.setUTCDate(1);
      if (type === 'year') x.setUTCFullYear(x.getUTCFullYear() + n); else x.setUTCMonth(x.getUTCMonth() + n);
      x.setUTCDate(Math.min(day, daysIn(x.getUTCFullYear(), x.getUTCMonth())));
    }
    else if (type === 'week') x.setUTCDate(x.getUTCDate() + n * 7);
    else x.setUTCDate(x.getUTCDate() + n);
    return iso(x);
  };
  function startOf(date, type) {
    const x = d(date); if (!x) return null;
    if (type === 'year') x.setUTCMonth(0, 1);
    else if (type === 'month') x.setUTCDate(1);
    else if (type === 'week') return add(date, 'day', 1 - (Cal().getDateAttributes(date).dayOfWeekIndex || 1));
    return iso(x);
  }
  function endOf(date, type) {
    const x = d(date); if (!x) return null;
    if (type === 'year') x.setUTCMonth(11, 31);
    else if (type === 'month') { x.setUTCMonth(x.getUTCMonth() + 1, 0); }
    else if (type === 'week') return add(startOf(date, 'week'), 'day', 6);
    return iso(x);
  }
  function periodKey(date, type) { return Cal().periodKey(date, type); }
  function rangeForKey(key, type) {
    if (!key) return null;
    if (type === 'year') return { from: `${key}-01-01`, to: `${key}-12-31`, key };
    if (type === 'month') return { from: `${key}-01`, to: endOf(`${key}-01`, 'month'), key };
    if (type === 'week') {
      const ymd = key.includes('-W') ? (() => {
        const [y, w] = key.split('-W').map(Number);
        const jan4 = d(`${y}-01-04`);
        const monday = add(iso(jan4), 'day', 1 - (Cal().getDateAttributes(iso(jan4)).dayOfWeekIndex || 1) + (w - 1) * 7);
        return monday;
      })() : key;
      return { from: ymd, to: add(ymd, 'day', 6), key };
    }
    return { from: key, to: key, key };
  }
  function clampRange(range, maxDate) {
    if (!range) return null;
    const to = maxDate && range.to > maxDate ? maxDate : range.to;
    return { ...range, to, partial: to < range.to };
  }
  function focusRange(type, key, maxDate) { return clampRange(rangeForKey(key, type), maxDate); }
  const spanDays = (r) => Math.round((d(r.to) - d(r.from)) / 86400000);
  const isFullPeriod = (range, type) => ['year', 'month', 'week'].includes(type) && range.from === startOf(range.from, type) && range.to === endOf(range.from, type);
  /**
   * Desplaza un rango n períodos de `type`.
   *  - Rango = período completo  → devuelve el período completo destino (Mar 1–31 −1 mes = Feb 1–28).
   *  - preserveDuration (parcial) → mismos días transcurridos desde el inicio del período destino
   *    (Oct 1–5 −1 mes = Sep 1–5). Si el destino tiene menos días, se acota al fin del destino y
   *    `truncated: true` avisa que la comparación no tiene exactamente los mismos días.
   */
  function shiftRange(range, type, n, preserveDuration = false) {
    if (!range) return null;
    const from = add(range.from, type, n);
    let to, truncated = false;
    if (preserveDuration) {
      to = add(from, 'day', Math.max(0, spanDays(range)));
      if (['year', 'month', 'week'].includes(type)) { const cap = endOf(from, type); if (to > cap) { to = cap; truncated = true; } }
    } else if (isFullPeriod(range, type)) to = endOf(from, type);
    else to = add(range.to, type, n);
    return { from, to, key: periodKey(from, type), partial: false, truncated };
  }
  function comparisonRanges(current, type, maxDate) {
    const out = [];
    const sameDuration = Boolean(current && current.partial);
    const prev = shiftRange(current, type, -1, sameDuration);
    const yoy = shiftRange(current, 'year', -1, sameDuration);
    if (type === 'year') out.push({ id: 'yoy', label: 'Año anterior (YoY)', range: prev });
    else if (type === 'month') out.push({ id: 'mom', label: 'Mes anterior (MoM)', range: prev }, { id: 'yoy', label: 'Mismo mes año anterior (YoY)', range: yoy });
    else if (type === 'week') out.push({ id: 'wow', label: 'Semana anterior (WoW)', range: prev }, { id: 'yoy', label: 'Misma semana año anterior (YoY)', range: yoy });
    else if (type === 'day') out.push({ id: 'dod', label: 'Día anterior (DoD)', range: shiftRange(current, 'day', -1) }, { id: 'wow', label: 'Mismo día semana anterior (WoW)', range: shiftRange(current, 'day', -7) }, { id: 'yoy', label: 'Mismo día año anterior (YoY)', range: shiftRange(current, 'year', -1) });
    return out.map(x => ({ ...x, range: x.range && { ...x.range, partial: sameDuration } }));
  }
  function options(minDate, maxDate, type, limit = 24) {
    const min = d(minDate), max = d(maxDate); if (!min || !max) return [];
    const raw = [];
    let cursor = d(startOf(maxDate, type));
    const first = d(startOf(minDate, type));
    while (cursor >= first && raw.length < limit) {
      const key = periodKey(cursor, type), full = rangeForKey(key, type), actual = clampRange(full, maxDate);
      raw.push({ key, range: actual, partial: actual.partial, label: Cal().periodLabel(key, type) });
      cursor = d(add(iso(cursor), type, -1));
    }
    return raw.reverse();
  }
  function label(type, key, range) {
    const base = Cal().periodLabel(key, type);
    if (range?.partial) return `${base} · parcial · hasta ${range.to}`;
    return `${base} · completo`;
  }
  function comparePct(current, baseline) { return Number.isFinite(current) && Number.isFinite(baseline) && baseline !== 0 ? current / baseline - 1 : null; }
  FP.temporalEngine = { add, startOf, endOf, periodKey, rangeForKey, focusRange, clampRange, shiftRange, spanDays, comparisonRanges, options, label, comparePct };
})(typeof window !== 'undefined' ? window : globalThis);
