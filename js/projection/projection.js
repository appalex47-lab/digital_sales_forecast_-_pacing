/**
 * projection.js — Proyección del año siguiente: base del año actual, meta propuesta (objetivo) y proyección (lo que esperamos).
 * Todo es JavaScript determinístico: ningún número sale de la IA.
 *
 * Reglas (decisiones del usuario):
 *  - La BASE es el cierre estimado del año: los meses ya cerrados salen del real; los que faltan (o no tienen cobertura suficiente)
 *    se toman del MISMO mes del año anterior. Un mes parcial (p. ej. octubre con 2 días de venta) no se usa a medias.
 *  - La META (objetivo) crece sobre el monto TOTAL: meta = base total × (1 + g). Se reparte por canal según su participación
 *    (por defecto, la de la base; editable). El crecimiento por canal es un resultado, no un dato de entrada.
 *  - La PROYECCIÓN (lo que esperamos) aplica a cada canal el ritmo de los últimos 2 meses cerrados contra los mismos meses del año anterior.
 *  - La BRECHA es meta − proyección; «qué tendría que pasar» dice cuánto subiría, por separado, el volumen, el CR o el AOV para cerrarla.
 * Una proyección es una estimación con reglas, no un pronóstico estadístico: depende de que el ritmo reciente se mantenga.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const S = () => FP.dataStore;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const MIN_COVERAGE = 0.9;      // un mes cuenta como cerrado con al menos 90 % de sus días con venta
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const monthEnd = (y, m) => `${ymKey(y, m)}-${String(daysIn(y, m)).padStart(2, '0')}`;
  const cellValue = (c) => (c && (c.source === 'observed' || c.source === 'calculated') && fin(c.value) ? c.value : null);

  /**
   * Agrega venta, pedidos y volumen por canal y mes (histórico + venta real; la venta real manda sobre el histórico).
   * En caché por firma de los datos: no se recalcula al cambiar el crecimiento ni las participaciones.
   */
  function collect(store) {
    return S().cached(store, 'projection:monthly', ['historical', 'actual'], () => {
      const days = new Map(); let quarantined = 0;
      ['historical', 'actual'].forEach((t) => S().resolveLatest(store, t).forEach((r) => {
        if (!r.date || !r.channel) return;
        const rev = cellValue(r.metrics && r.metrics.revenue);
        if (r.metrics && r.metrics.revenue && r.metrics.revenue.source === 'quarantined') quarantined++;
        if (rev === null) { days.delete(`${r.date}|${r.channel}`); return; }
        days.set(`${r.date}|${r.channel}`, { date: r.date, channel: r.channel, revenue: rev, orders: cellValue(r.metrics.orders), traffic: cellValue(r.metrics.trafficVolume) });
      }));
      const m = new Map();
      days.forEach((d) => {
        const k = `${d.channel}|${d.date.slice(0, 7)}`;
        const a = m.get(k) || { revenue: 0, orders: 0, traffic: 0, days: 0, ordersDays: 0 };
        a.revenue += d.revenue; a.days++;
        if (d.orders !== null && d.traffic !== null && d.traffic > 0) { a.orders += d.orders; a.traffic += d.traffic; a.ordersDays++; }
        m.set(k, a);
      });
      return { months: m, quarantined, hasData: m.size > 0 };
    });
  }

  /** ¿Se puede usar este mes como real? Debe haber terminado y tener cobertura. */
  function monthInfo(data, ch, y, m, today) {
    const a = data.months.get(`${ch}|${ymKey(y, m)}`);
    const total = daysIn(y, m);
    const ended = monthEnd(y, m) <= today;
    const coverage = a ? a.days / total : 0;
    return { a, total, ended, coverage, usable: Boolean(a) && ended && coverage >= MIN_COVERAGE };
  }

  /** Base de un canal: 12 meses del año base (real o, si faltan, del año anterior) y los dos últimos meses cerrados contra el año anterior. */
  function channelBase(data, ch, baseYear, today) {
    const months = []; let rev = 0, ord = 0, trf = 0, nReal = 0, nPrior = 0, nMissing = 0;
    for (let m = 1; m <= 12; m++) {
      const cur = monthInfo(data, ch, baseYear, m, today), prev = monthInfo(data, ch, baseYear - 1, m, today);
      let src = 'missing', pick = null, note = '';
      if (cur.usable) { src = 'real'; pick = cur.a; if (cur.coverage < 1) note = `${cur.total - cur.a.days} días sin dato`; nReal++; }
      else if (prev.usable) {
        src = 'prior_year'; pick = prev.a; nPrior++;
        note = cur.a && !cur.ended ? `mes en curso (${cur.a.days} de ${cur.total} días): se usa ${baseYear - 1} completo` : cur.a ? `cobertura de ${Math.round(cur.coverage * 100)} %: se usa ${baseYear - 1}` : `sin dato de ${baseYear}: se usa ${baseYear - 1}`;
      } else { nMissing++; note = `sin dato de ${baseYear} ni de ${baseYear - 1}`; }
      const v = pick ? pick.revenue : 0;
      rev += v; if (pick) { ord += pick.orders; trf += pick.traffic; }
      months.push({ month: m, key: ymKey(baseYear, m), label: MONTHS[m - 1], revenue: v, source: src, note, coverage: cur.coverage });
    }
    // últimos 2 meses cerrados del año base contra los mismos meses del año anterior
    const closed = months.filter((x) => x.source === 'real').slice(-2);
    let last2 = null;
    if (closed.length === 2) {
      const prevs = closed.map((x) => monthInfo(data, ch, baseYear - 1, x.month, today));
      if (prevs.every((p) => p.usable)) {
        const cur = closed.reduce((s, x) => s + x.revenue, 0), prev = prevs.reduce((s, p) => s + p.a.revenue, 0);
        last2 = { months: closed.map((x) => x.key), labels: closed.map((x) => x.label), cur, prev, yoy: prev > 0 ? cur / prev - 1 : null };
      }
    }
    return { id: ch, months, revenue: rev, orders: ord, traffic: trf, cr: trf > 0 ? ord / trf : null, aov: ord > 0 ? rev / ord : null, nReal, nPrior, nMissing, last2 };
  }

  /** Reparte `total` en partes enteras que suman exacto, según `weights`. */
  function split(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const w = sum > 0 ? weights : weights.map(() => 1);
    return FP.distribution.distributeTarget(Math.round(total), w, { decimals: 0 });
  }

  /**
   * @param {object} store
   * @param {{ baseYear:number, growth:number, shares?:object|null, today?:string, forecastRun?:object|null }} o
   */
  function build(store, o) {
    const baseYear = o.baseYear, targetYear = baseYear + 1, g = o.growth;
    const today = o.today || FP.calendar.toISODate(new Date());
    const data = collect(store);
    const chIds = C().channelIds, label = (id) => (C().channels.find((c) => c.id === id) || { label: id }).label;
    const empty = { baseYear, targetYear, growth: g, today, hasData: data.hasData, channels: [], notes: [], warnings: [] };
    if (!data.hasData) return empty;
    const chans = chIds.map((id) => ({ ...channelBase(data, id, baseYear, today), label: label(id) }));
    const used = chans.filter((c) => c.revenue > 0);
    if (!used.length) {
      // hay venta, pero ningún mes cuenta: se explica cuál es la situación para no decir «no hay venta» cuando sí la hay
      const partial = []; data.months.forEach((a, k) => { const [ch, ym] = k.split('|'); const [y, m] = ym.split('-').map(Number); if (y === baseYear && a.days > 0) partial.push({ channel: ch, key: ym, days: a.days, total: daysIn(y, m) }); });
      return { ...empty, hasData: false, noBase: true, partialMonths: partial };
    }
    const baseTotal = chans.reduce((s, c) => s + c.revenue, 0);

    // ---- meta (objetivo): crece sobre el total y se reparte por participación ----
    const wDefault = chans.map((c) => c.revenue);
    let weights = wDefault, sharesCustom = false;
    if (o.shares) {
      const arr = chIds.map((id) => (fin(o.shares[id]) ? o.shares[id] : null));
      const sum = arr.reduce((a, b) => a + (b || 0), 0);
      if (arr.every((v) => v !== null) && Math.abs(sum - 100) < 0.05) { weights = arr; sharesCustom = true; }
    }
    const metaTotal = Math.round(baseTotal * (1 + g));
    const metaCh = split(metaTotal, weights);

    // ---- proyección: ritmo de los últimos 2 meses cerrados, por canal ----
    const warnings = [], notes = [];
    const projCh = chans.map((c) => {
      const gr = c.last2 && fin(c.last2.yoy) ? c.last2.yoy : 0;
      if (!(c.last2 && fin(c.last2.yoy)) && c.revenue > 0) warnings.push(`${c.label}: no hay dos meses cerrados comparables contra ${baseYear - 1}; su proyección es igual a la base (0 % de crecimiento).`);
      if (c.last2 && fin(c.last2.yoy) && Math.abs(c.last2.yoy) > 0.4) warnings.push(`${c.label}: los últimos 2 meses (${c.last2.labels.join(' y ')}) cambiaron ${(c.last2.yoy * 100).toFixed(1)} % contra ${baseYear - 1}; el ritmo puede ser atípico antes de proyectarlo todo el año.`);
      return { growth: gr, amount: Math.round(c.revenue * (1 + gr)) };
    });
    const projTotal = projCh.reduce((s, p) => s + p.amount, 0);

    chans.forEach((c, i) => {
      const prior = c.months.filter((x) => x.source === 'prior_year'), miss = c.months.filter((x) => x.source === 'missing'), gaps = c.months.filter((x) => x.source === 'real' && x.note);
      if (prior.length) notes.push(`${c.label}: ${prior.map((x) => x.label).join(', ')} se toman de ${baseYear - 1} porque ${baseYear} aún no cierra esos meses.`);
      if (miss.length) warnings.push(`${c.label}: ${miss.map((x) => x.label).join(', ')} no tienen dato ni de ${baseYear} ni de ${baseYear - 1}; la base de ese canal queda incompleta y subestimada.`);
      gaps.forEach((x) => warnings.push(`${c.label}: ${x.label} ${baseYear} tiene ${x.note}; su real está incompleto y la base queda algo subestimada.`));
    });
    if (data.quarantined) notes.push(`${data.quarantined} valor${data.quarantined === 1 ? '' : 'es'} de venta en cuarentena no suman en la base (Calidad de datos → Cuarentena).`);

    // ---- cierre estimado de Pacing, solo como comparación ----
    const fr = o.forecastRun;
    const closeOf = (series) => { const a = series && series.annual && series.annual.forecast; return a && fin(a.revenue) ? a.revenue : null; };
    const forecastClose = fr ? { total: closeOf(fr.total), byChannel: Object.fromEntries(chIds.map((id) => [id, closeOf(fr.channels && fr.channels[id])])) } : null;

    // ---- brecha y «qué tendría que pasar» ----
    const rows = chans.map((c, i) => {
      const gap = metaCh[i] - projCh[i].amount, x = projCh[i].amount > 0 ? metaCh[i] / projCh[i].amount - 1 : null;
      return { id: c.id, label: c.label, base: c.revenue, metaShare: metaTotal ? metaCh[i] / metaTotal : null, meta: metaCh[i], metaGrowth: c.revenue > 0 ? metaCh[i] / c.revenue - 1 : null,
        projGrowth: projCh[i].growth, proj: projCh[i].amount, gap, uplift: x, last2: c.last2, cr: c.cr, aov: c.aov,
        needs: x !== null && x > 0 ? { volumePct: x, crPp: c.cr !== null ? c.cr * x * 100 : null, aovPct: x } : null,
        forecastClose: forecastClose ? forecastClose.byChannel[c.id] : null };
    });
    const upTotal = projTotal > 0 ? metaTotal / projTotal - 1 : null;

    // ---- reparto mensual de referencia (la forma de la base; el plan diario lo genera Planear con su estacionalidad) ----
    const monthly = [];
    const metaM = chans.map((c, i) => split(metaCh[i], c.months.map((x) => x.revenue)));
    const projM = chans.map((c, i) => split(projCh[i].amount, c.months.map((x) => x.revenue)));
    for (let m = 0; m < 12; m++) {
      const row = { month: m + 1, label: MONTHS[m], byChannel: {} };
      chans.forEach((c, i) => { row.byChannel[c.id] = { base: c.months[m].revenue, source: c.months[m].source, meta: metaM[i][m], proj: projM[i][m] }; });
      row.total = { base: chans.reduce((s, c) => s + c.months[m].revenue, 0), meta: chans.reduce((s, c, i) => s + metaM[i][m], 0), proj: chans.reduce((s, c, i) => s + projM[i][m], 0) };
      monthly.push(row);
    }
    // ---- sensibilidad al crecimiento ----
    const gs = [...new Set([0.1, 0.12, 0.16, 0.2, Math.round(g * 1000) / 1000])].sort((a, b) => a - b);
    const sensitivity = gs.map((x) => { const meta = Math.round(baseTotal * (1 + x)); return { growth: x, meta, gap: meta - projTotal, uplift: projTotal > 0 ? meta / projTotal - 1 : null, current: Math.abs(x - g) < 1e-9 }; });

    return { baseYear, targetYear, growth: g, today, hasData: true, sharesCustom,
      base: { total: baseTotal, channels: chans },
      meta: { total: metaTotal, growth: baseTotal > 0 ? metaTotal / baseTotal - 1 : null },
      projection: { total: projTotal, growth: baseTotal > 0 ? projTotal / baseTotal - 1 : null },
      gap: { total: metaTotal - projTotal, uplift: upTotal },
      rows, monthly, sensitivity, forecastClose, notes, warnings, channels: chans };
  }

  /** Export de la proyección (JSON) con sus supuestos y notas. */
  function toExport(res, { app = 'RevNavigator', version = '' } = {}) {
    if (!res || !res.hasData) return { app, version, empty: true };
    return { app, version, kind: 'projection', baseYear: res.baseYear, targetYear: res.targetYear, assumptions: { growthOnTotalTarget: res.growth, minCoverage: MIN_COVERAGE, sharesCustom: res.sharesCustom,
        baseRule: `meses cerrados de ${res.baseYear}; los que faltan, del mismo mes de ${res.baseYear - 1}`, projectionRule: 'ritmo de los últimos 2 meses cerrados contra los mismos meses del año anterior, por canal' },
      generatedFor: res.today, base: res.base.total, meta: res.meta.total, projection: res.projection.total, gap: res.gap.total,
      byChannel: res.rows.map((r) => ({ channel: r.id, base: r.base, meta: r.meta, metaGrowth: r.metaGrowth, projection: r.proj, projectionGrowth: r.projGrowth, gap: r.gap, last2Months: r.last2, requiredUplift: r.needs })),
      monthly: res.monthly.map((m) => ({ month: m.month, total: m.total, byChannel: m.byChannel })), sensitivity: res.sensitivity, notes: res.notes, warnings: res.warnings };
  }

  function toCsv(res) {
    const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
    const out = ['tipo,canal,mes,valor'];
    res.monthly.forEach((m) => {
      Object.entries(m.byChannel).forEach(([ch, v]) => { out.push(`base,${ch},${res.baseYear}-${String(m.month).padStart(2, '0')},${v.base}`); out.push(`meta,${ch},${res.targetYear}-${String(m.month).padStart(2, '0')},${v.meta}`); out.push(`proyeccion,${ch},${res.targetYear}-${String(m.month).padStart(2, '0')},${v.proj}`); });
    });
    return out.join('\n') + '\n';
  }

  FP.projection = { build, collect, toExport, toCsv, MIN_COVERAGE, MONTHS };
})(typeof window !== 'undefined' ? window : globalThis);
