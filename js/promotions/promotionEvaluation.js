/**
 * promotionEvaluation.js — Evaluación de promociones (propuesta B, etapa POST).
 *
 * Módulo propio (no una capa sobre impactMeasurement.js): evalúa por SKU y por día, con línea base de periodo anterior comparable.
 * Copia el vocabulario de impactMeasurement ("estimado", "no establece causalidad", lista de factores) sin tocar su código.
 *
 * Método (versión 1, declarado en cada resultado):
 *   · «Durante»: las fechas REALES del SKU en la promoción; si no existen, las planeadas (con aviso).
 *   · Línea base: los 28 días anteriores al inicio, promediados POR DÍA DE LA SEMANA, para comparar lunes con lunes. Se excluyen de la base los días
 *     sin dato cargado, los días con otra promoción registrada del mismo SKU y los días con evento del calendario. Con menos de 14 días utilizables, o si
 *     falta algún día de la semana presente en «durante», el SKU es «no evaluable». Una segunda base (los 28 días previos a esa) da un rango cuando también es evaluable.
 *   · No hay grupo de control en esta versión: el efecto causal siempre es «no demostrado».
 *   · Un SKU-día compartido con otra promoción suma su venta una sola vez; su incremental se reparte en partes iguales entre las promociones activas ese día.
 * Nada de esto modifica ventas, promociones ni cálculos de otras pantallas.
 *
 *   compute(promo, daily, ctx) → resultado   (puro, síncrono; `daily` = { data: Map fecha → Map sku → {revenue, units, orders}, dates: Set fechas con dato, max: última fecha cargada })
 *   freeze(promo, daily, ctx)  → línea base congelada (se guarda en promo.baseline al aprobar; compute la usa si existe)
 *   dailyFor(promo, ctx)       → daily        (lee FP.productStore; asíncrono)
 *   evaluate(promo, ctx)       → resultado    (dailyFor + compute)
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const SETTINGS = { baselineDays: 28, minUsableDays: 14, weakUsableDays: 21, priceChangePct: 0.05 };
  const ACTIVE = ['approved', 'published', 'measuring', 'closed'];
  const EVALUABLE = ['published', 'measuring', 'closed'];

  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const day = (iso) => new Date(`${iso}T00:00:00Z`);
  const addDays = (iso, n) => { const d = day(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const eachDay = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
  const dow = (iso) => day(iso).getUTCDay();
  const sum = (l) => l.reduce((a, x) => a + x, 0);

  /** Ventana «durante» de un SKU en una promoción: fechas reales; si no hay, las planeadas. */
  function skuWindow(promo, s) {
    if (s.realStart && s.realEnd) return { start: s.realStart, end: s.realEnd, source: 'real' };
    if (s.realStart && promo.plannedEnd) return { start: s.realStart, end: promo.plannedEnd, source: 'mixed' };
    if (promo.plannedStart && promo.plannedEnd) return { start: promo.plannedStart, end: promo.plannedEnd, source: 'planned' };
    return null;
  }

  /** Días de otras promociones sobre el mismo SKU (Map fecha → cuántas). */
  function otherPromoDays(promo, sku, promotions) {
    const m = new Map();
    (promotions || []).forEach((q) => {
      if (q.promoId === promo.promoId || !ACTIVE.includes(q.status) || (q.channel || 'ecommerce') !== (promo.channel || 'ecommerce')) return;
      const qs = (q.skus || []).find((x) => x.sku === sku); if (!qs) return;
      const w = skuWindow(q, qs); if (!w) return;
      eachDay(w.start, w.end).forEach((d) => m.set(d, (m.get(d) || 0) + 1));
    });
    return m;
  }

  function eventDays(events) {
    const set = new Set();
    (events || []).forEach((e) => { const a = e.startDate || e.start, b = e.endDate || e.end || a; if (a && b && a <= b && eachDay(a, b).length < 400) eachDay(a, b).forEach((d) => set.add(d)); });
    return set;
  }

  const cellOf = (daily, d, sku) => { const m = daily.data.get(d); const c = m && m.get(sku); return { revenue: c && fin(c.revenue) ? c.revenue : 0, units: c && fin(c.units) ? c.units : 0 }; };

  /** Una línea base: 28 días terminando `offset` días antes del inicio, promediados por día de la semana. */
  function baselineFor(daily, sku, start, duringDays, offset, excl, S) {
    const to = addDays(start, -1 - offset), from = addDays(to, -(S.baselineDays - 1));
    const days = eachDay(from, to), usable = [], out = { noData: 0, otherPromo: 0, event: 0 };
    days.forEach((d) => {
      if (!daily.dates.has(d)) { out.noData += 1; return; }
      if (excl.promo.has(d)) { out.otherPromo += 1; return; }
      if (excl.event.has(d)) { out.event += 1; return; }
      usable.push(d);
    });
    const mean = {};
    for (let w = 0; w < 7; w++) {
      const ds = usable.filter((d) => dow(d) === w);
      if (ds.length) mean[w] = { revenue: sum(ds.map((d) => cellOf(daily, d, sku).revenue)) / ds.length, units: sum(ds.map((d) => cellOf(daily, d, sku).units)) / ds.length, n: ds.length };
    }
    const needed = [...new Set(duringDays.map(dow))], missingDow = needed.filter((w) => !mean[w]);
    let reason = null;
    if (usable.length < S.minUsableDays) reason = `Solo ${usable.length} días utilizables en la base (se piden ${S.minUsableDays})`;
    else if (missingDow.length) reason = 'La base no tiene todos los días de la semana que cubre la promoción';
    return { from, to, usable: usable.length, excluded: out, mean, evaluable: !reason, reason };
  }

  /**
   * Línea base congelada: copia, por SKU, de la venta diaria de los 2×28 días anteriores al inicio, tal como estaba cargada al aprobar.
   * No guarda precios ni márgenes. Devuelve { frozenAt, dataMax, days, skus: { sku: { from, to, rows: [[fecha, ingreso, unidades]] } } }.
   */
  function freeze(promo, daily, ctx) {
    const c = ctx || {}, S = Object.assign({}, SETTINGS, c.settings || {});
    const skus = {}; let rowsN = 0;
    (promo.skus || []).forEach((s) => {
      const w = skuWindow(promo, s); if (!w) return;
      const to = addDays(w.start, -1), from = addDays(w.start, -2 * S.baselineDays), rows = [];
      eachDay(from, to).forEach((d) => { if (daily.dates.has(d)) { const cl = cellOf(daily, d, s.sku); rows.push([d, cl.revenue, cl.units]); } });
      // Días que en este momento se sacan de la base (otra promoción del mismo SKU, evento del calendario): también se congelan
      const op = otherPromoDays(promo, s.sku, c.promotions), ev = eventDays(c.events), all = eachDay(from, to);
      skus[s.sku] = { from, to, rows, excl: { promo: all.filter((d) => op.has(d)), event: all.filter((d) => ev.has(d)) } }; rowsN += rows.length;
    });
    return { frozenAt: c.now || new Date().toISOString(), dataMax: daily.max || null, rows: rowsN, skus };
  }

  /** SKU cuya línea base congelada no corresponde a su inicio actual (cambiaron las fechas reales). */
  function staleBaseline(promo) {
    const fz = promo.baseline; if (!fz || !fz.skus) return [];
    return (promo.skus || []).map((s) => { const w = skuWindow(promo, s), e = fz.skus[s.sku]; return w && e && e.to !== addDays(w.start, -1) ? { sku: s.sku, frozenStart: addDays(e.to, 1), start: w.start } : null; }).filter(Boolean);
  }

  /** Venta diaria «congelada» de un SKU con la misma forma que `daily`. */
  function frozenDaily(fz, sku) {
    const e = fz && fz.skus && fz.skus[sku]; if (!e) return null;
    const dates = new Set(), data = new Map();
    e.rows.forEach(([d, r, u]) => { dates.add(d); data.set(d, new Map([[sku, { revenue: r, units: u, orders: 0 }]])); });
    return { data, dates, max: fz.dataMax };
  }

  function evalSku(promo, s, daily, ctx, S) {
    const base = { sku: s.sku, name: s.name || null, origin: s.origin || null };
    const w = skuWindow(promo, s);
    if (!w) return Object.assign(base, { status: 'not_evaluable', reason: 'Sin fechas reales ni planeadas' });
    if (w.end < w.start) return Object.assign(base, { status: 'not_evaluable', reason: 'Fin anterior al inicio' });
    if (!daily.max || w.start > daily.max) return Object.assign(base, { status: 'not_evaluable', reason: 'Todavía no hay venta cargada para estas fechas', window: w });
    const end = w.end > daily.max ? daily.max : w.end, truncated = end !== w.end;
    const duringAll = eachDay(w.start, end), during = duringAll.filter((d) => daily.dates.has(d));
    if (!during.length) return Object.assign(base, { status: 'not_evaluable', reason: 'No hay días con dato dentro de la promoción', window: w });
    const excl = { promo: otherPromoDays(promo, s.sku, ctx.promotions), event: eventDays(ctx.events) };
    const fzd = frozenDaily(promo.baseline, s.sku), bdaily = fzd || daily;
    const fe = fzd && promo.baseline.skus[s.sku].excl;
    const exclBase = fe ? { promo: new Set(fe.promo), event: new Set(fe.event) } : excl;
    const variants = [0, S.baselineDays].map((off) => baselineFor(bdaily, s.sku, w.start, during, off, exclBase, S));
    const prim = variants[0];
    if (!prim.evaluable) return Object.assign(base, { status: 'not_evaluable', reason: prim.reason, window: w, baseline: { from: prim.from, to: prim.to, usable: prim.usable, excluded: prim.excluded } });
    const run = (v) => {
      let actual = 0, expected = 0, aUnits = 0, eUnits = 0, incR = 0, incU = 0; const series = [];
      during.forEach((d) => {
        const c = cellOf(daily, d, s.sku), m = v.mean[dow(d)], k = 1 + (excl.promo.get(d) || 0);
        actual += c.revenue; aUnits += c.units; expected += m.revenue; eUnits += m.units;
        incR += (c.revenue - m.revenue) / k; incU += (c.units - m.units) / k;
        series.push({ date: d, actual: c.revenue, expected: m.revenue, incremental: (c.revenue - m.revenue) / k });
      });
      return { actual, expected, aUnits, eUnits, incR, incU, series };
    };
    const r = run(prim), r2 = variants[1].evaluable ? run(variants[1]) : null;
    const growth = (a, b) => (b > 0 ? a / b - 1 : null);
    const shared = during.filter((d) => excl.promo.has(d)).length;
    const incs = [r.incR, r2 ? r2.incR : null].filter(fin);
    const priceNow = r.aUnits > 0 ? r.actual / r.aUnits : null, priceBase = r.eUnits > 0 ? r.expected / r.eUnits : null;
    const warnings = [];
    if (w.source !== 'real') warnings.push({ code: 'planned_dates', level: 'warn', text: 'Usa fechas planeadas, no reales: registra las fechas reales del SKU para una evaluación confiable.' });
    if (truncated) warnings.push({ code: 'partial', level: 'warn', text: `Hay venta cargada solo hasta ${daily.max}; la promoción llegaba hasta ${w.end}.` });
    if (during.length < duringAll.length) warnings.push({ code: 'missing_days', level: 'warn', text: `${duringAll.length - during.length} días de la promoción sin dato cargado.` });
    if (shared) warnings.push({ code: 'shared_days', level: 'warn', text: `${shared} días compartidos con otra promoción: la venta se cuenta una vez y el incremental se reparte.` });
    if (fzd && promo.baseline.skus[s.sku].to !== addDays(w.start, -1)) warnings.push({ code: 'baseline_moved', level: 'warn', text: `La base se congeló para un inicio el ${addDays(promo.baseline.skus[s.sku].to, 1)} y ahora el inicio es el ${w.start}: la base puede estar desfasada. Vuelve a congelar mientras la promoción siga publicada.` });
    if (fzd) warnings.push({ code: 'baseline_frozen', level: 'info', text: `Línea base congelada el ${String(promo.baseline.frozenAt).slice(0, 10)} (venta de referencia tal como estaba al aprobar).` });
    if (prim.usable < S.weakUsableDays) warnings.push({ code: 'weak_baseline', level: 'warn', text: `Base débil: ${prim.usable} días utilizables de ${S.baselineDays}.` });
    if (fin(priceNow) && fin(priceBase) && priceBase > 0 && Math.abs(priceNow / priceBase - 1) >= S.priceChangePct) warnings.push({ code: 'price_change', level: 'info', text: `El precio unitario derivado cambió ${(100 * (priceNow / priceBase - 1)).toFixed(1)} % (venta ÷ unidades).` });
    return Object.assign(base, {
      status: 'ok', window: { start: w.start, end: w.end, source: w.source }, days: duringAll.length, daysWithData: during.length, daysShared: shared, truncated,
      actual: { revenue: r.actual, units: r.aUnits }, expected: { revenue: r.expected, units: r.eUnits },
      growth: { revenue: growth(r.actual, r.expected), units: growth(r.aUnits, r.eUnits) },
      incremental: { revenue: r.incR, units: r.incU, range: incs.length > 1 ? [Math.min(...incs), Math.max(...incs)] : null },
      baseline: { method: 'previous_period_weekday', frozen: Boolean(fzd), from: prim.from, to: prim.to, usable: prim.usable, excluded: prim.excluded, second: r2 ? { from: variants[1].from, to: variants[1].to, usable: variants[1].usable } : null },
      unitPrice: { during: priceNow, base: priceBase }, series: r.series, warnings
    });
  }

  function compute(promo, daily, ctx) {
    const c = ctx || {}, S = Object.assign({}, SETTINGS, c.settings || {});
    const items = (promo.skus || []).map((s) => evalSku(promo, s, daily, c, S));
    const ok = items.filter((i) => i.status === 'ok');
    const A = sum(ok.map((i) => i.actual.revenue)), E = sum(ok.map((i) => i.expected.revenue));
    const AU = sum(ok.map((i) => i.actual.units)), EU = sum(ok.map((i) => i.expected.units));
    const inc = sum(ok.map((i) => i.incremental.revenue)), incU = sum(ok.map((i) => i.incremental.units));
    const withRange = ok.some((i) => i.incremental.range);
    const range = withRange ? [sum(ok.map((i) => (i.incremental.range ? i.incremental.range[0] : i.incremental.revenue))), sum(ok.map((i) => (i.incremental.range ? i.incremental.range[1] : i.incremental.revenue)))] : null;
    const warnings = [];
    const uniq = (code) => ok.filter((i) => i.warnings.some((w) => w.code === code));
    const add = (code, level, text) => { if (text) warnings.push({ code, level, text }); };
    if (!ok.length) add('none', 'warn', 'Ningún SKU se pudo evaluar con los datos y las fechas actuales.');
    if (items.length > ok.length) add('not_evaluable', 'warn', `${items.length - ok.length} de ${items.length} SKU no son evaluables; no suman a los totales.`);
    if (uniq('planned_dates').length) add('planned_dates', 'warn', `${uniq('planned_dates').length} SKU usan fechas planeadas, no reales.`);
    if (uniq('partial').length) add('partial', 'warn', 'La venta cargada no cubre toda la promoción: el resultado es parcial.');
    if (uniq('missing_days').length) add('missing_days', 'warn', `${uniq('missing_days').length} SKU tienen días sin dato dentro de la promoción.`);
    const shared = sum(ok.map((i) => i.daysShared));
    if (shared) add('shared_days', 'warn', `${shared} SKU-días compartidos con otras promociones: la venta cuenta una sola vez y el incremental se reparte en partes iguales.`);
    if (uniq('baseline_moved').length) add('baseline_moved', 'warn', `${uniq('baseline_moved').length} SKU con la línea base congelada para otro inicio: conviene volver a congelarla (solo posible con la promoción aprobada o publicada).`);
    if (uniq('baseline_frozen').length) add('baseline_frozen', 'info', `${uniq('baseline_frozen').length} SKU usan la línea base congelada al aprobar (no cambia aunque se recargue la venta).`);
    if (uniq('weak_baseline').length) add('weak_baseline', 'warn', `${uniq('weak_baseline').length} SKU con base débil (menos de ${S.weakUsableDays} días utilizables).`);
    if (uniq('price_change').length) add('price_change', 'info', `${uniq('price_change').length} SKU con cambio de precio unitario derivado de ${Math.round(S.priceChangePct * 100)} % o más.`);
    const excludedDays = sum(ok.map((i) => i.baseline.excluded.otherPromo + i.baseline.excluded.event));
    if (excludedDays) add('baseline_excluded', 'info', `${excludedDays} SKU-días se sacaron de la base por otra promoción o evento.`);
    add('no_control', 'info', 'No hay grupo de control en esta versión: la línea base es el propio historial del SKU.');
    add('inventory', 'info', 'Inventario no verificado: una caída o un salto pueden venir de existencias, no de la promoción.');
    add('traffic', 'info', 'No se evaluó el cambio de tráfico del canal en el periodo.');
    return {
      promoId: promo.promoId, name: promo.name, channel: promo.channel, status: promo.status, dataMax: daily.max || null, settings: S,
      method: 'Periodo anterior comparable: 28 días antes del inicio, promediados por día de la semana, sin días de otras promociones ni eventos.',
      items, counts: { total: items.length, evaluable: ok.length },
      totals: { actual: { revenue: A, units: AU }, expected: { revenue: E, units: EU }, incremental: { revenue: inc, units: incU, range } },
      concepts: {
        observedGrowth: { revenue: E > 0 ? A / E - 1 : null, units: EU > 0 ? AU / EU - 1 : null, kind: 'estimated', note: 'Venta durante ÷ línea base − 1. La línea base es estimada.' },
        objective: { status: 'no_numeric_objective', text: 'Sin objetivo numérico: el plan de la promoción no guarda una meta en cifras.' },
        incremental: { revenue: ok.length ? inc : null, units: ok.length ? incU : null, range, kind: 'estimated', note: 'Venta durante − línea base. Es una estimación, no una medición.' },
        causal: { status: 'not_demonstrated', text: 'No demostrado: sin grupo de control definido antes de la campaña, la herramienta no establece causalidad.' }
      },
      warnings
    };
  }

  /**
   * Seguimiento durante la vigencia: avance día por día de la venta real contra la línea base, sumando los SKU evaluables.
   * No proyecta el cierre ni afirma causalidad: solo dice cuánto de la vigencia ya tiene dato y cómo va contra la base.
   */
  function track(result) {
    const ok = (result.items || []).filter((i) => i.status === 'ok' && i.series);
    if (!ok.length) return { days: [], progress: null, pace: null, alerts: [] };
    const by = new Map();
    ok.forEach((i) => i.series.forEach((p) => { const x = by.get(p.date) || { date: p.date, actual: 0, expected: 0, incremental: 0 }; x.actual += p.actual; x.expected += p.expected; x.incremental += p.incremental; by.set(p.date, x); }));
    let ca = 0, ce = 0, ci = 0;
    const days = [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => { ca += x.actual; ce += x.expected; ci += x.incremental; return Object.assign(x, { cumActual: ca, cumExpected: ce, cumIncremental: ci }); });
    const start = ok.map((i) => i.window.start).sort()[0], end = ok.map((i) => i.window.end).sort().slice(-1)[0];
    const total = eachDay(start, end).length, withData = days.length;
    const progress = { start, end, total, withData, dataMax: result.dataMax || null, pct: total ? withData / total : null, missing: total - withData };
    const pace = ce > 0 ? ca / ce - 1 : null;
    const alerts = [];
    let run = 0; for (let k = days.length - 1; k >= 0 && days[k].actual < days[k].expected; k--) run += 1;
    if (run >= 3) alerts.push({ level: 'warn', text: `Los últimos ${run} días con dato quedaron por debajo de la línea base.` });
    if (days.length >= 3 && days.slice(-3).every((d) => d.actual > d.expected) && pace !== null && pace < 0) alerts.push({ level: 'info', text: 'Los últimos 3 días ya superan la base, aunque el acumulado sigue por debajo.' });
    if (result.dataMax && result.dataMax < end) alerts.push({ level: 'info', text: `La venta cargada llega al ${result.dataMax}; faltan ${eachDay(addDays(result.dataMax, 1), end).length} días de la vigencia.` });
    if (progress.missing > 0 && !(result.dataMax && result.dataMax < end)) alerts.push({ level: 'warn', text: `${progress.missing} días de la vigencia sin dato cargado.` });
    if (!result.items.every((i) => i.status === 'ok')) alerts.push({ level: 'warn', text: 'Hay SKU no evaluables: el seguimiento solo suma los evaluables.' });
    return { days, progress, pace, alerts, cum: { actual: ca, expected: ce, incremental: ci } };
  }

  /** Lee de FP.productStore la venta diaria por SKU del rango necesario (base de 56 días antes del primer inicio hasta el fin). */
  async function dailyFor(promo, ctx) {
    const PS = FP.productStore, c = ctx || {}, S = Object.assign({}, SETTINGS, c.settings || {});
    const ws = (promo.skus || []).map((s) => skuWindow(promo, s)).filter(Boolean);
    if (!PS || !PS.available() || !ws.length) return { data: new Map(), dates: new Set(), max: null };
    const meta = PS.meta || {}, channel = promo.channel && promo.channel !== 'total' ? promo.channel : null;
    const start = ws.map((w) => w.start).sort()[0], end = ws.map((w) => w.end).sort().slice(-1)[0];
    const from = addDays(start, -2 * S.baselineDays), to = meta.dateMax && meta.dateMax < end ? meta.dateMax : end;
    const data = new Map(), dates = new Set();
    if (to < from) return { data, dates, max: meta.dateMax || null };
    (await PS.keysIn({ from, to, channel })).forEach((k) => dates.add(k.split('|')[0]));
    for (const d of [...dates].sort()) {
      const map = await PS.aggregate({ from: d, to: d, channel, groupBy: 'sku' });
      const m = new Map();
      map.forEach((acc, sku) => { const f = PS.finalize(acc); m.set(sku, { revenue: f.revenue.value, units: f.units.value, orders: f.orders.value }); });
      data.set(d, m);
    }
    return { data, dates, max: meta.dateMax || null };
  }

  async function evaluate(promo, ctx) { return compute(promo, await dailyFor(promo, ctx), ctx); }

  FP.promotionEvaluation = { SETTINGS, ACTIVE, EVALUABLE, skuWindow, compute, track, freeze, frozenDaily, staleBaseline, dailyFor, evaluate, addDays, eachDay };
})(typeof window !== 'undefined' ? window : globalThis);
