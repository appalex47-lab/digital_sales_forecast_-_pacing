/**
 * driverEngine.js — Brecha y drivers (Fase 5).
 *
 * Todas las comparaciones se reducen a la misma estructura: una lista de PARES diarios
 *   { date, channel, current: bloque, baseline: bloque, ... }
 * y el resto del motor (Nivel 1, Nivel 2, señales) trabaja sobre pares, sin duplicar código.
 *
 *   actual_vs_plan          días contados del periodo: actual vs plan de esos mismos días
 *   forecast_vs_plan        todos los días del periodo: forecast vs plan
 *   actual_vs_previous      días contados: actual vs actual del periodo anterior equivalente
 *                           (mes: mismo día del mes anterior; semana: 7 días antes; año: mismo día del año anterior)
 *   actual_vs_yoy           días contados: actual vs actual del mismo día del año anterior
 *   reforecast_vs_forecast  días futuros del horizonte: requerido (Fase 4) vs forecast (Fase 3)
 *
 * Solo lee plan, actual, forecast y reforecast: nunca los modifica.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const Cal = () => FP.calendar;
  const fin = (v) => M().isFiniteNumber(v);
  const DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ADD = ['revenue', 'orders', 'trafficVolume'];
  const EXTRA = ['customers', 'newCustomers', 'returningCustomers', 'items'];
  const DRIVERS = ['trafficVolume', 'conversionRate', 'aov'];

  /* ---------- Agregación ---------- */

  /** Suma bloques; CR, AOV y artículos por pedido desde las sumas (nunca promedio de ratios). */
  function aggregate(blocks) {
    const out = {};
    [...ADD, ...EXTRA].forEach((k) => {
      const ok = blocks.length && blocks.every((b) => b && fin(b[k]));
      out[k] = ok ? blocks.reduce((a, b) => a + b[k], 0) : null;
    });
    out.conversionRate = M().safeDivide(out.orders, out.trafficVolume);
    out.aov = M().safeDivide(out.revenue, out.orders);
    out.itemsPerOrder = M().safeDivide(out.items, out.orders);
    return out;
  }

  const delta = (cur, base) => ({ current: fin(cur) ? cur : null, baseline: fin(base) ? base : null,
    delta: fin(cur) && fin(base) ? cur - base : null, deltaPct: fin(cur) && fin(base) && base !== 0 ? cur / base - 1 : null });

  /* ---------- Periodos y fechas de referencia ---------- */

  function inPeriod(date, period) {
    if (period.type === 'month') return date.slice(0, 7) === period.key;
    if (period.type === 'week') return Cal().getWeekInfo(date).weekKey === period.key;
    return date.startsWith(`${period.key}-`);
  }

  function shiftYear(date, n = -1) {
    const d = `${+date.slice(0, 4) + n}${date.slice(4)}`;
    return Cal().isValidISODate(d) ? d : null;
  }
  function shiftMonth(date) {
    const y = +date.slice(0, 4), m = +date.slice(5, 7);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const d = `${py}-${String(pm).padStart(2, '0')}-${date.slice(8)}`;
    return Cal().isValidISODate(d) ? d : null;
  }
  function baselineDate(date, comparison, period) {
    if (comparison === 'actual_vs_yoy') return shiftYear(date);
    if (period.type === 'week') return Cal().addDays(date, -7);
    if (period.type === 'month') return shiftMonth(date);
    return shiftYear(date);
  }

  /* ---------- Pares ---------- */

  /**
   * @param {object} ctx { comparison, period: {type,key}, channel: 'total'|id, run (forecast_run), rf (reforecast_run), store }
   */
  function buildPairs(ctx) {
    const { comparison, period, run, rf, store } = ctx;
    const channels = !ctx.channel || ctx.channel === 'total' ? C().channelIds : [ctx.channel];
    const actualCache = new Map();
    const actualFor = (year) => {
      if (!actualCache.has(year)) actualCache.set(year, FP.forecastEngine.actualInputs({ year, store, useHistoricalAsActual: true }));
      return actualCache.get(year);
    };
    const pairs = [];
    let expected = 0, unpaired = 0;
    const notes = [];
    const push = (d, ch, current, baseline, bDate) => {
      expected++;
      if (!current || !baseline || !fin(current.revenue) || !fin(baseline.revenue)) { unpaired++; return; }
      const wk = Cal().getWeekInfo(d.date);
      pairs.push({ date: d.date, baselineDate: bDate, channel: ch, current, baseline, tag: d.tag || null,
        weekKey: wk.weekKey, dayOfWeekIndex: Cal().getDateAttributes(d.date).dayOfWeekIndex });
    };
    channels.forEach((ch) => {
      if (comparison === 'reforecast_vs_forecast') {
        if (!rf) return;
        rf.channels[ch].days.filter((d) => d.required && inPeriod(d.date, period)).forEach((d) => push(d, ch, d.required, d.forecast, d.date));
        return;
      }
      const days = run.channels[ch].days.filter((d) => inPeriod(d.date, period));
      if (comparison === 'forecast_vs_plan') { days.forEach((d) => push(d, ch, d.forecast, d.plan, d.date)); return; }
      if (comparison === 'actual_vs_plan') { days.filter((d) => d.counted).forEach((d) => push(d, ch, d.actual, d.plan, d.date)); return; }
      days.filter((d) => d.counted).forEach((d) => {
        const b = baselineDate(d.date, comparison, period);
        const hit = b ? actualFor(+b.slice(0, 4)).get(`${b}|${ch}`) : null;
        push(d, ch, d.actual, hit ? FP.pacing.completeBlock(hit.values) : null, b);
      });
    });
    if (comparison === 'reforecast_vs_forecast' && !pairs.length) notes.push('No hay días futuros con requerimiento en este periodo.');
    if ((comparison === 'actual_vs_plan' || comparison.startsWith('actual_vs_')) && !pairs.length && !unpaired) notes.push('El periodo no tiene días con venta real todavía.');
    return { pairs, expected, unpaired, channels, notes,
      currentRange: pairs.length ? [pairs[0].date, pairs.reduce((a, p) => (p.date > a ? p.date : a), pairs[0].date)] : null,
      baselineRange: pairs.length ? [pairs.reduce((a, p) => (p.baselineDate < a ? p.baselineDate : a), pairs[0].baselineDate),
        pairs.reduce((a, p) => (p.baselineDate > a ? p.baselineDate : a), pairs[0].baselineDate)] : null };
  }

  /* ---------- Nivel 1 ---------- */

  function factorsFor(metric) {
    return metric === 'orders' ? ['trafficVolume', 'conversionRate'] : C().diagnostics.attributionOrder.slice();
  }

  /**
   * Nivel 1: brecha y contribución matemática de volumen, CR y AOV.
   */
  function level1(pairs, { metric = 'revenue', method = C().diagnostics.attributionMethod } = {}) {
    const cur = aggregate(pairs.map((p) => p.current));
    const base = aggregate(pairs.map((p) => p.baseline));
    const g = delta(cur[metric], base[metric]);
    const attr = FP.attribution.attribute(base, cur, { method, factors: factorsFor(metric) });
    const drivers = attr.factors.map((f) => {
      const d = delta(cur[f], base[f]);
      const contribution = attr.contributions ? attr.contributions[f] : null;
      return { driver: f, label: C().metrics[f].label, ...d, contribution,
        shareOfGap: fin(contribution) && fin(g.delta) && g.delta !== 0 ? contribution / g.delta : null,
        sign: !fin(contribution) ? null : contribution < 0 ? 'negative' : contribution > 0 ? 'positive' : 'neutral' };
    });
    const ranked = drivers.filter((d) => fin(d.contribution)).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    const main = ranked[0] || null;
    const methodLabel = C().diagnostics.attributionMethods[attr.method] || attr.method;
    return {
      metric, current: cur, baseline: base, gap: { abs: g.delta, pct: g.deltaPct, current: g.current, baseline: g.baseline },
      attribution: attr, drivers,
      mainDriver: main ? main.driver : null,
      negatives: drivers.filter((d) => d.sign === 'negative'),
      positives: drivers.filter((d) => d.sign === 'positive'),
      statement: main
        ? `${main.label} representa la mayor contribución matemática a la brecha observada bajo el método de atribución ${methodLabel}.`
        : 'No se pudo atribuir la brecha: faltan volumen, CR o AOV en alguno de los lados.'
    };
  }

  /* ---------- Nivel 2 ---------- */

  function dimLabel(id) { const d = C().diagnostics.dimensions[id]; return d ? d.label : id.replace(/_/g, ' '); }

  /**
   * Agrupa pares por una llave y calcula, por grupo, agregados, variación de cada métrica,
   * exposición (peso en la base) y contribución de cada driver (misma atribución).
   */
  function groupLevel(items, keyFn, labelFn, { metric, method, parent }) {
    const map = new Map();
    items.forEach((p) => { const k = keyFn(p); if (k === null || k === undefined) return; if (!map.has(k)) map.set(k, []); map.get(k).push(p); });
    const totalBaseRev = parent ? parent.baseline.revenue : null;
    const totalBaseTraffic = parent ? parent.baseline.trafficVolume : null;
    const groups = [...map.entries()].map(([k, ps]) => {
      const cur = aggregate(ps.map((p) => p.current));
      const base = aggregate(ps.map((p) => p.baseline));
      const attr = FP.attribution.attribute(base, cur, { method, factors: factorsFor(metric) });
      const metrics = {};
      ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov', ...EXTRA, 'itemsPerOrder'].forEach((m) => { metrics[m] = delta(cur[m], base[m]); });
      return {
        value: k, label: labelFn(k, ps), observations: ps.length,
        current: cur, baseline: base, metrics,
        exposure: M().safeDivide(base.revenue, totalBaseRev),
        trafficExposure: M().safeDivide(base.trafficVolume, totalBaseTraffic),
        currentShare: parent ? M().safeDivide(cur.revenue, parent.current.revenue) : null,
        contributions: attr.contributions, gap: metrics[metric].delta
      };
    }).sort((a, b) => (b.baseline.revenue || 0) - (a.baseline.revenue || 0));
    return groups;
  }

  /** Efecto mezcla por driver: contribución total − Σ contribuciones de los grupos (solo si la dimensión es una partición del mismo par). */
  function mixEffects(l1, groups) {
    if (!l1.attribution.contributions || groups.some((g) => !g.contributions)) return null;
    const out = {};
    l1.attribution.factors.forEach((f) => { out[f] = l1.attribution.contributions[f] - groups.reduce((a, g) => a + g.contributions[f], 0); });
    return out;
  }

  /** Dimensiones núcleo: salen de los datos base (siempre disponibles, con la misma referencia que el Nivel 1). */
  function coreDimensions(pairs, l1, { metric, method, period, channels }) {
    const dims = [];
    const opts = { metric, method, parent: l1 };
    const add = (id, keyFn, labelFn) => {
      const groups = groupLevel(pairs, keyFn, labelFn, opts);
      if (groups.length < 2) return;
      dims.push({ dimension: id, label: dimLabel(id), source: 'core', reference: 'same', groups, mix: mixEffects(l1, groups) });
    };
    if (channels.length > 1) add('channel', (p) => p.channel, (k) => FP.dataModel.getChannel(k).label);
    add('dayType', (p) => (p.tag && (p.tag.event || p.tag.holiday)) || 'Regular', (k) => k);
    add('dayOfWeek', (p) => p.dayOfWeekIndex, (k) => DOW[k - 1]);
    if (period.type !== 'week') add('week', (p) => p.weekKey, (k) => k);
    return dims;
  }

  /**
   * Dimensiones de segmentos (datos opcionales). Actual vs actual usa la misma referencia que el Nivel 1;
   * contra plan o forecast no hay desglose, así que se compara el real del periodo contra el mismo
   * periodo del año anterior y se indica. Reforecast vs forecast: no aplica.
   */
  function segmentDimensions(ctx, built, l1, { metric, method }) {
    const recs = ctx.store ? [...FP.dataStore.resolveLatest(ctx.store, 'segments').values()] : [];
    const result = { dims: [], note: null, reference: null, coverage: null };
    if (!recs.length) { result.note = 'Sin datos de segmentos cargados.'; return result; }
    if (ctx.comparison === 'reforecast_vs_forecast') { result.note = 'El requerido no tiene desglose por segmento: el Nivel 2 de segmentos no aplica a esta comparación.'; return result; }
    const sameRef = ctx.comparison === 'actual_vs_previous' || ctx.comparison === 'actual_vs_yoy';
    const chSet = new Set(built.channels);
    const curPairs = built.pairs.filter((p) => ctx.comparison !== 'forecast_vs_plan' || (ctx.run && p.date <= ctx.run.cutoff));
    const curKeys = new Set(curPairs.map((p) => `${p.date}|${p.channel}`));
    const baseKeys = new Set(curPairs.map((p) => {
      const b = sameRef ? p.baselineDate : shiftYear(p.date);
      return b ? `${b}|${p.channel}` : null;
    }).filter(Boolean));
    result.reference = sameRef ? (C().diagnostics.comparisons[ctx.comparison].baseline) : 'Año anterior (el plan y el forecast no tienen desglose por segmento)';
    const byDim = new Map();
    recs.forEach((r) => {
      if (!chSet.has(r.channel) || !r.dimension) return;
      const k = `${r.date}|${r.channel}`;
      const side = curKeys.has(k) ? 'current' : baseKeys.has(k) ? 'baseline' : null;
      if (!side) return;
      if (!byDim.has(r.dimension)) byDim.set(r.dimension, []);
      const block = {};
      ADD.forEach((m) => { block[m] = r.metrics[m] && (r.metrics[m].source === 'observed' || r.metrics[m].source === 'calculated') ? r.metrics[m].value : null; });
      EXTRA.forEach((m) => { if (r.extra && fin(r.extra[m])) block[m] = r.extra[m]; });
      byDim.get(r.dimension).push({ side, key: `${r.segmentKey}`, label: r.segment, date: r.date, channel: r.channel, block });
    });
    byDim.forEach((rows, dim) => {
      const segDates = new Set(rows.filter((r) => r.side === 'current').map((r) => `${r.date}|${r.channel}`));
      const curCoreRev = aggregate(curPairs.filter((p) => segDates.has(`${p.date}|${p.channel}`)).map((p) => p.current)).revenue;
      // Pares sintéticos por segmento y fecha: cada lado se agrega por separado
      const segs = new Map();
      rows.forEach((r) => {
        if (!segs.has(r.key)) segs.set(r.key, { label: r.label, current: [], baseline: [] });
        segs.get(r.key)[r.side].push(r.block);
      });
      const curAll = aggregate(rows.filter((r) => r.side === 'current').map((r) => r.block));
      const baseAll = aggregate(rows.filter((r) => r.side === 'baseline').map((r) => r.block));
      const parent = { current: curAll, baseline: baseAll };
      const items = [...segs.entries()].filter(([, s]) => s.current.length && s.baseline.length)
        .map(([k, s]) => ({ key: k, label: s.label, current: aggregate(s.current), baseline: aggregate(s.baseline), n: Math.min(s.current.length, s.baseline.length) }));
      if (items.length < 2) return;
      const groups = items.map((it) => {
        const attr = FP.attribution.attribute(it.baseline, it.current, { method, factors: factorsFor(metric) });
        const metrics = {};
        ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov', ...EXTRA, 'itemsPerOrder'].forEach((m) => { metrics[m] = delta(it.current[m], it.baseline[m]); });
        return { value: it.key, label: it.label, observations: it.n, current: it.current, baseline: it.baseline, metrics,
          exposure: M().safeDivide(it.baseline.revenue, baseAll.revenue), trafficExposure: M().safeDivide(it.baseline.trafficVolume, baseAll.trafficVolume),
          currentShare: M().safeDivide(it.current.revenue, curAll.revenue), contributions: attr.contributions, gap: metrics[metric].delta };
      }).sort((a, b) => (b.baseline.revenue || 0) - (a.baseline.revenue || 0));
      const parentL1 = { attribution: FP.attribution.attribute(baseAll, curAll, { method, factors: factorsFor(metric) }) };
      result.dims.push({ dimension: dim, label: dimLabel(dim), source: 'segments', reference: sameRef ? 'same' : 'yoy', referenceLabel: result.reference,
        groups, mix: mixEffects({ ...parentL1 }, groups), parent,
        coverage: M().safeDivide(curAll.revenue, curCoreRev) });
    });
    return result;
  }

  /** Dimensiones conocidas que no están en los datos (para mostrar "no disponible"). */
  function unavailableDimensions(available) {
    const have = new Set(available);
    return Object.entries(C().diagnostics.dimensions).filter(([id, d]) => !d.builtin && !have.has(id)).map(([id, d]) => ({ dimension: id, label: d.label }));
  }

  /** Árbol de drivers: por driver, las dimensiones disponibles que lo explican y sus grupos principales. */
  function driverTree(l1, dims, { top = 4 } = {}) {
    return l1.drivers.map((d) => {
      const branches = dims.filter((dim) => (C().diagnostics.dimensions[dim.dimension] || { drivers: DRIVERS }).drivers.includes(d.driver))
        .map((dim) => ({
          dimension: dim.dimension, label: dim.label, source: dim.source, reference: dim.reference,
          mix: dim.mix ? dim.mix[d.driver] : null,
          groups: dim.groups.filter((g) => g.contributions && fin(g.contributions[d.driver]))
            .sort((a, b) => Math.abs(b.contributions[d.driver]) - Math.abs(a.contributions[d.driver])).slice(0, top)
            .map((g) => ({ value: g.value, label: g.label, contribution: g.contributions[d.driver], metric: g.metrics[d.driver], exposure: g.exposure }))
        })).filter((b) => b.groups.length)
        // Primero dimensiones operativas (segmentos y canal); el calendario al final
        .sort((a, b) => (['week', 'dayOfWeek', 'dayType'].includes(a.dimension) ? 1 : 0) - (['week', 'dayOfWeek', 'dayType'].includes(b.dimension) ? 1 : 0));
      return { driver: d.driver, label: d.label, contribution: d.contribution, delta: d.delta, deltaPct: d.deltaPct, branches };
    });
  }

  FP.driverEngine = { aggregate, delta, inPeriod, baselineDate, buildPairs, level1, groupLevel, coreDimensions, segmentDimensions,
    unavailableDimensions, driverTree, factorsFor, dimLabel, DRIVERS };
})(typeof window !== 'undefined' ? window : globalThis);
