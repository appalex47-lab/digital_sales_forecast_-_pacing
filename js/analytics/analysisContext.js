/**
 * analysisContext.js — Contexto único del módulo Análisis (canal + período + comparación + nivel + métrica).
 *
 * Es la ÚNICA fuente de verdad para:
 *   · el canal seleccionado (Total · Ecommerce · App · WhatsApp · Llamadas);
 *   · el período focal (completo o parcial);
 *   · el período de comparación EQUIVALENTE (MoM / WoW / DoD / YoY): un período parcial se compara
 *     contra los mismos días del período anterior (Oct 1–5 vs Sep 1–5), nunca contra el período completo;
 *   · la etiqueta «Período actual vs Período de comparación».
 *
 * Es puro (sin DOM, sin IndexedDB): lo consumen app.js (cálculo), trend-view.js (presentación) y las exportaciones.
 * Total = Σ de los cuatro canales reales; «total» NO es un quinto canal.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const TE = () => FP.temporalEngine;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const Mon = (i) => MONTHS[i].charAt(0).toUpperCase() + MONTHS[i].slice(1);
  const channelIds = () => (FP.config && FP.config.channelIds) || ['ecommerce', 'app', 'whatsapp', 'llamadas'];
  const channelList = () => ['total', ...channelIds()];
  const isChannel = (c) => channelList().includes(c);
  /** Canal válido o 'total' (nunca deja pasar un valor inventado). */
  const normChannel = (c) => (isChannel(c) ? c : 'total');
  function channelLabel(c) {
    if (!c || c === 'total') return 'Total digital';
    const ch = FP.config && FP.config.channels && FP.config.channels.find((x) => x.id === c);
    return ch ? ch.label : String(c);
  }
  /** Métricas aditivas del módulo (Σ entidades = total). El ticket promedio NO es aditivo: queda fuera de este selector. */
  const METRICS = { revenue: { label: 'Venta', kind: 'currency' }, orders: { label: 'Pedidos', kind: 'integer' }, units: { label: 'Unidades', kind: 'integer' } };
  const normMetric = (m) => (METRICS[m] ? m : 'revenue');
  const KIND = { month: 'mom', week: 'wow', day: 'dod', year: 'yoy' };
  const KIND_LABEL = { mom: 'MoM · mes anterior', wow: 'WoW · semana anterior', dod: 'DoD · día anterior', yoy: 'YoY · mismo período del año anterior' };
  const parts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  /** «Oct 1–5» · «Sep 2026» (mes completo) · «2025» (año completo) · «Sep 28–Oct 4». withYear agrega el año. */
  function rangeLabel(from, to, withYear = false) {
    const a = parts(from), b = parts(to); if (!a || !b) return '—';
    const T = TE(), yr = withYear ? `, ${b.y}` : '';
    if (T && from === T.startOf(from, 'year') && to === T.endOf(from, 'year')) return String(a.y);
    if (T && from === T.startOf(from, 'month') && to === T.endOf(from, 'month')) return `${Mon(a.m)} ${a.y}`;
    if (from === to) return `${Mon(a.m)} ${a.d}${yr}`;
    if (a.y === b.y && a.m === b.m) return `${Mon(a.m)} ${a.d}–${b.d}${yr}`;
    return `${Mon(a.m)} ${a.d}–${Mon(b.m)} ${b.d}${yr}`;
  }
  function daysBetween(from, to) { const T = TE(); return T ? T.spanDays({ from, to }) + 1 : null; }

  /**
   * @param {object} p { periodType, focusKey|null, comparison:'previous'|'year_ago', channel, level, metric, minDate, maxDate }
   * @returns contexto completo (siempre devuelve objeto; si no hay datos `focus` es null y `comparison.available=false`).
   */
  function build(p = {}) {
    const T = TE();
    const periodType = ['year', 'month', 'week', 'day'].includes(p.periodType) ? p.periodType : 'month';
    const channel = normChannel(p.channel);
    const base = { channel, channelLabel: channelLabel(channel), periodType, level: p.level || 'product', metric: normMetric(p.metric), metricLabel: METRICS[normMetric(p.metric)].label,
      focus: null, comparison: { requested: p.comparison === 'year_ago' ? 'year_ago' : 'previous', id: null, available: false, current: null, baseline: null, text: null, note: 'Sin datos para definir el período.' } };
    if (!T || !p.minDate || !p.maxDate) return base;
    const opts = T.options(p.minDate, p.maxDate, periodType, periodType === 'day' ? 90 : 24);
    const latestComplete = [...opts].reverse().find((x) => !x.partial);
    const key = p.focusKey && opts.some((x) => x.key === p.focusKey) ? p.focusKey : (latestComplete ? latestComplete.key : (opts.length ? opts[opts.length - 1].key : null));
    if (!key) return base;
    const full = T.rangeForKey(key, periodType);
    const focusRange = T.clampRange(full, p.maxDate);
    base.focus = { key, type: periodType, from: focusRange.from, to: focusRange.to, fullTo: full.to, partial: Boolean(focusRange.partial),
      days: daysBetween(focusRange.from, focusRange.to), label: T.label(periodType, key, focusRange), rangeLabel: rangeLabel(focusRange.from, focusRange.to) };
    const wanted = base.comparison.requested === 'year_ago' ? 'yoy' : KIND[periodType];
    const cmp = T.comparisonRanges(focusRange, periodType, p.maxDate).find((x) => x.id === wanted);
    const r = cmp && cmp.range;
    const hasData = r && r.to >= p.minDate;            // el período de comparación debe tocar el rango de datos cargado
    const sameYear = r && parts(r.from).y === parts(focusRange.from).y;
    const curLab = rangeLabel(focusRange.from, focusRange.to, !sameYear), baseLab = r ? rangeLabel(r.from, r.to, !sameYear) : '—';
    base.comparison = {
      requested: base.comparison.requested, id: wanted, idLabel: KIND_LABEL[wanted], available: Boolean(hasData),
      current: { from: focusRange.from, to: focusRange.to, label: curLab, key },
      baseline: r ? { from: r.from, to: r.to, key: r.key, label: baseLab } : null,
      partial: Boolean(focusRange.partial), truncated: Boolean(r && r.truncated),
      text: r ? `${curLab} vs ${baseLab}` : null,
      note: !r ? 'No se pudo definir el período de comparación.' : !hasData ? `No hay datos cargados en ${baseLab}: la comparación no está disponible (N/A).`
        : focusRange.partial ? `Período en curso: se compara contra los mismos días (${baseLab}), no contra el período completo.` : (r.truncated ? 'El período anterior tiene menos días; la comparación se acota a sus días disponibles.' : null)
    };
    return base;
  }

  /** Cambio porcentual seguro: null (→ «N/A») si falta un lado o la base es 0. Nunca 0 % ni −100 % por falta de datos. */
  function pctChange(current, baseline) {
    return Number.isFinite(current) && Number.isFinite(baseline) && baseline > 0 ? current / baseline - 1 : null;
  }

  FP.analysisContext = { METRICS, normMetric, channelList, channelIds, isChannel, normChannel, channelLabel, rangeLabel, build, pctChange, KIND, KIND_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
