/**
 * chart.js — Gráfico de líneas SVG compartido (Fase 4; lo usan Pacing & Forecast y Reforecast).
 * Solo presentación: recibe series ya calculadas. Sin dependencias externas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const RATIO = ['conversionRate', 'aov'];

  /**
   * Acumulado diario de una métrica sobre bloques { revenue, orders, trafficVolume }.
   * CR y AOV acumulados = razón de sumas. Devuelve null fuera de [from, to].
   */
  function cumulative(blocks, k, { from = 0, to = blocks.length - 1, base = null } = {}) {
    const acc = base ? { ...base } : { revenue: 0, orders: 0, trafficVolume: 0 };
    const pick = () => (k === 'conversionRate' ? FP.metrics.safeDivide(acc.orders, acc.trafficVolume)
      : k === 'aov' ? FP.metrics.safeDivide(acc.revenue, acc.orders) : acc[k]);
    return blocks.map((b, i) => {
      if (i > to) return null;
      if (b) ['revenue', 'orders', 'trafficVolume'].forEach((m) => { if (Number.isFinite(b[m])) acc[m] += b[m]; });
      return i >= from ? pick() : null;
    });
  }

  /** Estado del acumulado hasta el índice i (para arrancar otra serie desde ahí). */
  function sumsUntil(blocks, i) {
    const acc = { revenue: 0, orders: 0, trafficVolume: 0 };
    blocks.slice(0, i + 1).forEach((b) => { if (b) Object.keys(acc).forEach((m) => { if (Number.isFinite(b[m])) acc[m] += b[m]; }); });
    return acc;
  }

  const fmtTick = (k, v) => (k === 'revenue' ? F().currencyCompact(v) : k === 'conversionRate' ? F().percent(v, 2) : k === 'aov' ? F().currency(v, 0) : F().integer(v));

  /**
   * @param {object} p { dates, series: [{ values, cls }], metric, cutIndex, cutLabel, ariaLabel }
   * @returns html (o null si no hay datos)
   */
  function lineChart({ dates, series, metric, cutIndex = -1, cutLabel = '', ariaLabel = '' }) {
    const esc = H().esc;
    const W = 900, Hh = 260, L = 70, R = 16, T = 14, B = 30;
    const all = series.flatMap((s) => s.values).filter((v) => v !== null && Number.isFinite(v));
    if (!all.length) return null;
    const ratio = RATIO.includes(metric);
    let lo = ratio ? Math.min(...all) : 0, hi = Math.max(...all);
    if (ratio) { const pad = (hi - lo) * 0.15 || hi * 0.05; lo -= pad; hi += pad; }
    if (hi === lo) hi = lo + 1;
    const n = Math.max(2, dates.length);
    const x = (i) => L + (i / (n - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (Hh - T - B);
    const path = (arr) => {
      let d = '', open = false;
      arr.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { open = false; return; }
        d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true;
      });
      return d;
    };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
    const monthTicks = [];
    dates.forEach((d, i) => { if (d.slice(8) === '01') monthTicks.push([i, MONTHS[+d.slice(5, 7) - 1]]); });
    const cut = cutIndex >= 0 ? x(cutIndex) : null;
    return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(ariaLabel)}">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="chart-grid"/>
        <text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" class="chart-label" text-anchor="end">${esc(fmtTick(metric, t))}</text>`).join('')}
      ${monthTicks.map(([i, l]) => `<text x="${x(i).toFixed(1)}" y="${Hh - 10}" class="chart-label">${l}</text>`).join('')}
      ${cut !== null ? `<line x1="${cut.toFixed(1)}" x2="${cut.toFixed(1)}" y1="${T}" y2="${Hh - B}" class="chart-cut"/>
        <text x="${(cut + 4).toFixed(1)}" y="${T + 10}" class="chart-label">${esc(cutLabel)}</text>` : ''}
      ${series.map((s) => `<path d="${path(s.values)}" class="chart-line ${s.cls}"/>`).join('')}
    </svg></div>`;
  }

  /** Leyenda con el último valor de cada serie. */
  function legend(items, metric) {
    const esc = H().esc;
    const last = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i]; return null; };
    return `<ul class="legend">${items.map((s) => `<li><span class="legend__swatch ${s.swatch}"></span>${esc(s.label)} ${esc(F().metric(metric, last(s.values)))}</li>`).join('')}</ul>`;
  }

  FP.chart = { cumulative, sumsUntil, lineChart, legend };
})(typeof window !== 'undefined' ? window : globalThis);
