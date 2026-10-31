/**
 * trafficConversionEngine.js — Descomposición de la venta por segmento: Venta = Sesiones × CR × Ticket.
 * Mueve los factores de uno en uno (tráfico → conversión → ticket) entre el periodo base y el actual, así los tres efectos
 * de cada segmento suman EXACTAMENTE su Δ venta, y los de todos los segmentos suman el Δ venta total.
 * También separa el cambio del CR total en «dentro de los segmentos» y «mezcla de tráfico», y marca si el cambio de CR de un
 * segmento es distinguible del azar (prueba z de dos proporciones al 95 %). Solo aritmética: no dice causas.
 *
 * Entrada: filas de segmentsView.summarize → { key, label, current:{traffic,orders,revenue,has}, baseline:{…} }.
 * Casos límite: segmento nuevo → todo su Δ es tráfico; desaparecido → tráfico negativo; base sin pedidos → el Δ es conversión
 * (no existe un ticket base); sin pedidos hoy → conversión (el ticket no existe). Poco volumen → se agrupa en «Otros».
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const Z95 = 1.96;

  const val = (m) => (m && m.has && m.has.traffic && m.has.orders && m.has.revenue ? { t: m.traffic || 0, o: m.orders || 0, r: m.revenue || 0 } : null);

  /** Prueba z de dos proporciones (CR base contra CR actual). */
  function crTest(a, b) {
    if (!a || !b || !(a.t > 0) || !(b.t > 0)) return { z: null, significant: null };
    const p0 = a.o / a.t, p1 = b.o / b.t, pp = (a.o + b.o) / (a.t + b.t), se = Math.sqrt(pp * (1 - pp) * (1 / a.t + 1 / b.t));
    if (!(se > 0)) return { z: 0, significant: false };
    const z = (p1 - p0) / se;
    return { z, significant: Math.abs(z) >= Z95 };
  }

  /** Efectos de un segmento. base/cur: {t,o,r} o null. La suma de los tres efectos = r1 − r0. */
  function effects(base, cur) {
    const r0 = base ? base.r : 0, r1 = cur ? cur.r : 0, delta = r1 - r0;
    if (!base || !cur || !(base.t > 0)) return { traffic: delta, cr: 0, aov: 0, delta, kind: !base ? 'new' : !cur ? 'gone' : 'newTraffic', crTest: crTest(base, cur) };
    const cr0 = base.o / base.t, cr1 = cur.t > 0 ? cur.o / cur.t : 0;
    // Sin pedidos en la base no hay ticket base: el cambio de venta se atribuye a la conversión.
    if (!(base.o > 0)) return { traffic: 0, cr: delta, aov: 0, delta, kind: 'noBaseOrders', crTest: crTest(base, cur) };
    const aov0 = base.r / base.o;
    const traffic = (cur.t - base.t) * cr0 * aov0;
    const cr = cur.t * (cr1 - cr0) * aov0;
    // Sin pedidos hoy no hay ticket actual: lo que queda del Δ es conversión (el ticket no existe).
    const aov = cur.o > 0 ? cur.t * cr1 * (cur.r / cur.o - aov0) : 0;
    const residual = delta - traffic - cr - aov;                    // solo ≠ 0 si hay pedidos 0 con venta ≠ 0 (dato inconsistente)
    return { traffic, cr: cr + residual, aov, delta, kind: 'both', crTest: crTest(base, cur) };
  }

  /**
   * Chequeos de calidad del tráfico (solo aritmética, sin causas): segmentos con volumen suficiente cuyo tráfico creció mucho o es nuevo y
   * casi no convierte, o que tienen sesiones sin un solo pedido. Pueden ser tráfico no humano (bots), campañas de baja intención o un
   * problema de etiquetado: la app lo marca para revisar, no lo afirma.
   */
  function qualityChecks(dec, totalCr) {
    const flags = [], minS = dec.minSessions || 500;
    dec.allItems.filter((x) => x.grouped === 0 && x.cur && x.cur.t >= minS).forEach((x) => {
      const cr1 = x.cur.o / x.cur.t, cr0 = x.base && x.base.t > 0 ? x.base.o / x.base.t : null;
      const added = x.cur.t - (x.base ? x.base.t : 0);
      let type = null;
      if (x.cur.o === 0) type = 'zero_orders';
      else if (x.base && x.base.t > 0 && x.cur.t >= 2 * x.base.t && added >= minS && cr0 > 0 && cr1 < 0.5 * cr0) type = 'spike_low_cr';
      else if (!x.base && fin(totalCr) && totalCr > 0 && cr1 < 0.5 * totalCr) type = 'new_low_cr';
      if (type) flags.push({ key: x.key, label: x.label, type, sessions: x.cur.t, added, cr: cr1, crBase: cr0, totalCr });
    });
    return flags.sort((a, b) => b.added - a.added).slice(0, 3);
  }

  const sum = (rows, f) => rows.reduce((s, x) => s + (f(x) || 0), 0);

  /**
   * @param {object} res  { rows } de summarize
   * @param {{minSessions:number}} opts  umbral de volumen (sesiones) para mostrar un segmento por separado
   */
  function analyze(res, { minSessions = null, maxRows = 12 } = {}) {
    const all = [], excluded = [];
    for (const r of res.rows || []) {
      const c = val(r.current), b = val(r.baseline);
      if (!c && !b) { if (r.current || r.baseline) excluded.push(r.label || r.key); continue; }
      if ((r.current && !c) || (r.baseline && !b)) { excluded.push(r.label || r.key); continue; }   // falta una de las tres métricas en un periodo
      all.push({ key: r.key, label: r.label, base: b, cur: c });
    }
    if (!all.length) return { status: 'no_data', excluded };
    const T1all = sum(all, (x) => x.cur && x.cur.t);
    if (minSessions === null) minSessions = Math.max(500, Math.ceil(0.01 * T1all));   // misma regla que segmentInsights: el mayor entre 500 y el 1 % del tráfico
    const hasBase = all.some((x) => x.base);
    if (!hasBase) return { status: 'no_baseline', excluded };

    // Poco volumen en AMBOS periodos → «Otros» (un solo seudo-segmento)
    const big = [], small = [];
    all.forEach((x) => ((x.cur && x.cur.t >= minSessions) || (x.base && x.base.t >= minSessions) ? big : small).push(x));
    const merge = (list, side) => {
      const m = list.map((x) => x[side]).filter(Boolean);
      return m.length ? { t: sum(m, (x) => x.t), o: sum(m, (x) => x.o), r: sum(m, (x) => x.r) } : null;
    };
    const items = big.map((x) => ({ ...x, grouped: 0 }));
    if (small.length) items.push({ key: '__otros__', label: `Otros (${small.length} de poco volumen)`, base: merge(small, 'base'), cur: merge(small, 'cur'), grouped: small.length });
    items.forEach((x) => { Object.assign(x, effects(x.base, x.cur)); });

    // Total (suma exacta de los segmentos, incluidos los agrupados)
    const total = { traffic: sum(items, (x) => x.traffic), cr: sum(items, (x) => x.cr), aov: sum(items, (x) => x.aov), delta: sum(items, (x) => x.delta) };
    const T0 = sum(all, (x) => x.base && x.base.t), O0 = sum(all, (x) => x.base && x.base.o), R0 = sum(all, (x) => x.base && x.base.r);
    const T1 = sum(all, (x) => x.cur && x.cur.t), O1 = sum(all, (x) => x.cur && x.cur.o), R1 = sum(all, (x) => x.cur && x.cur.r);
    total.base = R0; total.current = R1; total.deltaPct = R0 > 0 ? (R1 - R0) / R0 : null;
    total.reconciles = Math.abs(total.traffic + total.cr + total.aov - (R1 - R0)) < 0.5;

    // Mezcla del CR total: cambio dentro de los segmentos contra cambio de mezcla de tráfico (los nuevos/desaparecidos van a mezcla)
    let mix = null;
    if (T0 > 0 && T1 > 0) {
      const cr0 = O0 / T0, cr1 = O1 / T1;
      let within = 0;
      all.forEach((x) => { if (x.base && x.cur && x.base.t > 0 && x.cur.t > 0) within += (x.cur.t / T1) * (x.cur.o / x.cur.t - x.base.o / x.base.t); });
      mix = { cr0, cr1, delta: cr1 - cr0, within, mix: (cr1 - cr0) - within };
    }

    // Peso de cada segmento en cada efecto (sobre la suma de los efectos del mismo signo del total)
    const neg = (k) => sum(items.filter((x) => x[k] < 0), (x) => x[k]), pos = (k) => sum(items.filter((x) => x[k] > 0), (x) => x[k]);
    items.forEach((x) => {
      x.dominant = Math.abs(x.traffic) >= Math.abs(x.cr) && Math.abs(x.traffic) >= Math.abs(x.aov) ? 'traffic' : Math.abs(x.cr) >= Math.abs(x.aov) ? 'cr' : 'aov';
      if (!x.delta && !x.traffic && !x.cr && !x.aov) x.dominant = null;
      x.share = {};
      ['traffic', 'cr', 'aov'].forEach((k) => { const d = x[k] < 0 ? neg(k) : pos(k); x.share[k] = d ? x[k] / d : null; });
      x.crPpDelta = x.base && x.cur && x.base.t > 0 && x.cur.t > 0 ? (x.cur.o / x.cur.t - x.base.o / x.base.t) * 100 : null;
      x.trafficDeltaPct = x.base && x.cur && x.base.t > 0 ? x.cur.t / x.base.t - 1 : null;
    });
    items.sort((a, b) => a.delta - b.delta);                       // mayor pérdida primero
    const shown = items.length > maxRows ? [...items.slice(0, Math.ceil(maxRows / 2)), ...items.slice(-Math.floor(maxRows / 2))] : items;
    const dominantEffect = ['traffic', 'cr', 'aov'].sort((a, b) => Math.abs(total[b]) - Math.abs(total[a]))[0];
    const out = { status: 'ok', total, dominantEffect, mix, items: shown, allItems: items, hidden: items.length - shown.length, excluded, minSessions,
      totals: { base: { t: T0, o: O0, r: R0 }, cur: { t: T1, o: O1, r: R1 } } };
    out.quality = qualityChecks(out, T1 > 0 ? O1 / T1 : null);
    const oth = items.find((x) => x.grouped > 0);
    out.others = oth ? { segments: oth.grouped, sessions: oth.cur ? oth.cur.t : 0, share: T1 > 0 && oth.cur ? oth.cur.t / T1 : 0 } : null;   // cuánto del tráfico actual quedó en «Otros»
    return out;
  }

  /** Frases deterministas, ordenadas por monto. money: (n) => texto con signo. */
  function findings(dec, { money, pct, label = (x) => x.label }) {
    if (!dec || dec.status !== 'ok') return [];
    // Un hallazgo cuyo monto es trivial frente al movimiento total (menos de 2 % de la suma de los tres efectos en valor absoluto) es ruido: no se muestra.
    const scale = Math.abs(dec.total.traffic) + Math.abs(dec.total.cr) + Math.abs(dec.total.aov), floor = 0.02 * scale;
    const out = [], it = dec.allItems.filter((x) => x.grouped === 0);
    const negCr = it.filter((x) => x.cr < 0).sort((a, b) => a.cr - b.cr)[0];
    const negCrTotal = sum(dec.allItems.filter((x) => x.cr < 0 && negCr && x.dim === negCr.dim), (x) => x.cr);   // en la lista de todas las dimensiones, el peso es dentro de su dimensión (no se suman dimensiones)
    if (negCr && negCr.crPpDelta !== null && Math.abs(negCr.cr) >= floor) {
      const sig = negCr.crTest.significant;
      out.push({ kind: 'cr', amount: negCr.cr, tag: 'Conversión', tone: 'danger', title: `«${label(negCr)}» convirtió menos: ${pct(negCr.base.o / negCr.base.t, 2)} → ${pct(negCr.cur.o / negCr.cur.t, 2)}.`,
        body: `Explica ${money(negCr.cr)}, el ${Math.round((negCr.cr / negCrTotal) * 100)} % de lo que restó la conversión.${sig === false ? ' La diferencia no es concluyente con este volumen.' : ''}${negCr.trafficDeltaPct > 0 ? ' Su tráfico subió, así que no es falta de visitas.' : ''}` });
    }
    const tr = it.filter((x) => x.trafficDeltaPct !== null && Math.abs(x.trafficDeltaPct) >= 0.1 && Math.abs(x.traffic) >= floor).sort((a, b) => Math.abs(b.traffic) - Math.abs(a.traffic))[0];
    if (tr && tr !== negCr) out.push({ kind: 'traffic', amount: tr.traffic, tag: 'Tráfico', tone: tr.traffic < 0 ? 'danger' : 'info', title: `«${label(tr)}» ${tr.trafficDeltaPct < 0 ? 'perdió' : 'ganó'} ${Math.abs(Math.round(tr.trafficDeltaPct * 100))} % de sus sesiones.`, body: `Efecto tráfico ${money(tr.traffic)}${Math.abs(tr.crPpDelta || 0) < 0.15 ? ' sin que su conversión cambiara casi nada' : ''}.` });
    const mixed = it.filter((x) => x !== negCr && x.traffic > 0 && x.cr < 0 && x.cur && x.base && Math.abs(x.cr) >= floor).sort((a, b) => a.cr - b.cr)[0];
    if (mixed) out.push({ kind: 'mixed', amount: mixed.cr, tag: 'Mezcla', tone: 'info', title: `«${label(mixed)}» trajo ${money(mixed.traffic)} por más tráfico (+${Math.round((mixed.cur.t - mixed.base.t)).toLocaleString('en-US')} sesiones)`, body: `pero esas visitas convirtieron peor (${pct(mixed.base.o / mixed.base.t, 2)} → ${pct(mixed.cur.o / mixed.cur.t, 2)}) y restaron ${money(mixed.cr)}. El tráfico extra no se está aprovechando.` });
    const tk = it.filter((x) => x.aov !== 0 && Math.abs(x.aov) >= floor).sort((a, b) => Math.abs(b.aov) - Math.abs(a.aov))[0];
    if (tk && Math.abs(dec.total.aov) > 0) out.push({ kind: 'aov', amount: dec.total.aov, tag: 'Ticket', tone: dec.total.aov >= 0 ? 'info' : 'danger', title: `El ticket ${dec.total.aov >= 0 ? 'compensó' : 'restó'} ${money(dec.total.aov)} en total.`, body: `El mayor aporte es «${label(tk)}» (${money(tk.aov)}).` });
    return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 4);
  }

  /* ====================================================================================================================
   * Todas las dimensiones a la vez.
   * Cada dimensión parte la MISMA venta en segmentos distintos (un visitante es a la vez de un dispositivo, una fuente y un tipo de
   * cliente): sus efectos no se suman entre dimensiones. Por eso el resultado general sale del TOTAL (que es el mismo en todas) y
   * la lista junta los segmentos de todas, cada uno con su dimensión y su peso dentro de ella.
   * El cruce de dos dimensiones (p. ej. «Móvil · google / cpc») sí es una partición: sus celdas se pueden sumar.
   * ==================================================================================================================== */
  const COMBO = ['device_source'];
  const EFFK = ['traffic', 'cr', 'aov'];
  const COVER_TOL = 0.05;                              // una dimensión cuyo total difiere más de 5 % del de referencia se avisa

  /** Cruce a partir de la dimensión combinada: filas = dispositivo, columnas = fuente/medio (se separan en « · »). */
  function crossTab(res, { maxCols = 8 } = {}) {
    const cells = new Map(), colTraffic = new Map();
    for (const r of res.rows || []) {
      const c = val(r.current), b = val(r.baseline); if (!c && !b) continue;
      if ((r.current && !c) || (r.baseline && !b)) continue;
      const label = String(r.label || r.key), i = label.indexOf(' · ');
      if (i < 0) continue;
      const a = label.slice(0, i).trim(), col = label.slice(i + 3).trim();
      cells.set(`${a}\u0000${col}`, { a, b: col, base: b, cur: c });
      colTraffic.set(col, (colTraffic.get(col) || 0) + ((c && c.t) || 0));
    }
    if (!cells.size) return null;
    const keep = [...colTraffic.entries()].sort((x, y) => y[1] - x[1]).slice(0, maxCols).map((x) => x[0]), keepSet = new Set(keep);
    const merged = new Map();
    cells.forEach((v) => {
      const colName = keepSet.has(v.b) ? v.b : 'Otros';
      const k = `${v.a}\u0000${colName}`, m = merged.get(k) || { a: v.a, b: colName, base: null, cur: null };
      const add = (x, y) => (y ? (x ? { t: x.t + y.t, o: x.o + y.o, r: x.r + y.r } : { ...y }) : x);
      m.base = add(m.base, v.base); m.cur = add(m.cur, v.cur); merged.set(k, m);
    });
    const list = [...merged.values()].map((x) => {
      const e = effects(x.base, x.cur);
      return { ...x, delta: e.delta, traffic: e.traffic, cr: e.cr, aov: e.aov, kind: e.kind, crTest: e.crTest,
        cr0: x.base && x.base.t > 0 ? x.base.o / x.base.t : null, cr1: x.cur && x.cur.t > 0 ? x.cur.o / x.cur.t : null };
    });
    const rowsA = [...new Set(list.map((x) => x.a))], colsB = [...keep, ...(list.some((x) => x.b === 'Otros') ? ['Otros'] : [])];
    return { cells: list, rowsA, colsB, total: sum(list, (x) => x.delta), reconciles: Math.abs(sum(list, (x) => x.traffic + x.cr + x.aov) - sum(list, (x) => x.delta)) < 0.5 };
  }

  /**
   * @param {Array<{dim:string,label:string,res:object,ins?:object}>} dims  cada dimensión con su resumen (segmentsView.summarize) y, opcional,
   *   sus insights (segmentInsights.analyze) para las oportunidades y los tickets bajos
   * @param {{minByDim?:object, maxRows?:number}} opts
   */
  function analyzeAll(dims, { minByDim = {}, maxRows = 12 } = {}) {
    const regular = (dims || []).filter((d) => !COMBO.includes(d.dim)), combo = (dims || []).find((d) => COMBO.includes(d.dim));
    const parts = regular.map((d) => ({ dim: d.dim, label: d.label, ins: d.ins || null, dec: analyze(d.res, { minSessions: minByDim[d.dim] || null, maxRows }) }));
    const ok = parts.filter((p) => p.dec.status === 'ok');
    if (!ok.length) return { status: parts.some((p) => p.dec.status === 'no_baseline') ? 'no_baseline' : 'no_data', dims: parts.map((p) => ({ dim: p.dim, label: p.label, status: p.dec.status })) };
    // Dimensión de referencia: la que cubre más tráfico y venta del periodo actual (sus totales son «el total»)
    const ref = ok.slice().sort((a, b) => (b.dec.totals.cur.t - a.dec.totals.cur.t) || (b.dec.totals.cur.r - a.dec.totals.cur.r))[0];
    const tb = ref.dec.totals.base, tc = ref.dec.totals.cur, e = effects(tb, tc);
    const total = { traffic: e.traffic, cr: e.cr, aov: e.aov, delta: e.delta, base: tb.r, current: tc.r, deltaPct: tb.r > 0 ? (tc.r - tb.r) / tb.r : null,
      reconciles: Math.abs(e.traffic + e.cr + e.aov - e.delta) < 0.5 };
    total.lead = EFFK.slice().sort((a, b) => Math.abs(total[b]) - Math.abs(total[a]))[0];
    const totals = { base: tb, cur: tc, cr0: tb.t > 0 ? tb.o / tb.t : null, cr1: tc.t > 0 ? tc.o / tc.t : null, aov0: tb.o > 0 ? tb.r / tb.o : null, aov1: tc.o > 0 ? tc.r / tc.o : null };
    // Cobertura: cuánto del total de referencia ve cada dimensión (si una cubre menos, su lectura es parcial)
    const dimsOut = parts.map((p) => {
      if (p.dec.status !== 'ok') return { dim: p.dim, label: p.label, status: p.dec.status, dec: p.dec, ins: p.ins };
      const cov = { traffic: tc.t > 0 ? p.dec.totals.cur.t / tc.t : null, revenue: tc.r > 0 ? p.dec.totals.cur.r / tc.r : null };
      const partial = [cov.traffic, cov.revenue].some((v) => fin(v) && Math.abs(v - 1) > COVER_TOL);
      return { dim: p.dim, label: p.label, status: 'ok', dec: p.dec, ins: p.ins, coverage: cov, partial, isRef: p === ref };
    });
    const items = [];
    ok.forEach((p) => p.dec.allItems.forEach((x) => items.push({ ...x, dim: p.dim, dimLabel: p.label })));
    const pseudo = { status: 'ok', total, allItems: items.filter((x) => x.grouped === 0) };
    const out = { status: 'ok', reference: ref.dim, total, totals, dims: dimsOut, items, pseudo, partialDims: dimsOut.filter((d) => d.partial).map((d) => d.label) };
    out.mix = ref.dec.mix;
    // Calidad del tráfico: se juntan los avisos de todas las dimensiones (sin repetir el mismo segmento)
    const seen = new Set(); out.quality = [];
    ok.forEach((p) => (p.dec.quality || []).forEach((f) => { const k = `${p.dim}\u0000${f.key}`; if (!seen.has(k)) { seen.add(k); out.quality.push({ ...f, dim: p.dim, dimLabel: p.label }); } }));
    out.quality.sort((a, b) => b.added - a.added);
    const oth = ok.map((p) => ({ dimLabel: p.label, o: p.dec.others })).filter((x) => x.o);
    out.others = oth;
    // Oportunidades y tickets bajos: de cada dimensión, con su etiqueta; no se suman entre dimensiones
    out.opportunities = []; out.lowAov = [];
    ok.forEach((p) => {
      if (!p.ins) return;
      (p.ins.opportunities || []).forEach((o) => out.opportunities.push({ ...o, dim: p.dim, dimLabel: p.label }));
      (p.ins.lowAov || []).forEach((o) => out.lowAov.push({ ...o, dim: p.dim, dimLabel: p.label }));
    });
    out.opportunities.sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0));
    out.cross = combo ? crossTab(combo.res) : null;
    return out;
  }

  /**
   * Lista unificada «qué mirar primero»: filtra y ordena los segmentos de todas las dimensiones.
   * @param {object} all  resultado de analyzeAll
   * @param {{dim?:string, effect?:'traffic'|'cr'|'aov', sign?:'neg'|'pos', limit?:number, withOthers?:boolean}} f
   * effect omitido → se usa el efecto dominante de cada segmento. Devuelve {rows, total}; cada fila trae `effect` y `value`.
   */
  function pick(all, { dim = null, effect = null, sign = null, limit = null, withOthers = false } = {}) {
    if (!all || all.status !== 'ok') return { rows: [], total: 0 };
    let rows = all.items.filter((x) => (withOthers || x.grouped === 0) && (!dim || x.dim === dim)).map((x) => {
      const k = effect || EFFK.slice().sort((a, b) => Math.abs(x[b]) - Math.abs(x[a]))[0];
      return { ...x, effect: k, value: x[k] };
    });
    if (sign === 'neg') rows = rows.filter((x) => x.value < -0.5);
    else if (sign === 'pos') rows = rows.filter((x) => x.value > 0.5);
    rows.sort((a, b) => (sign === 'pos' ? b.value - a.value : sign === 'neg' ? a.value - b.value : Math.abs(b.value) - Math.abs(a.value)));
    return { rows: limit ? rows.slice(0, limit) : rows, total: rows.length };
  }

  /** Hallazgos («qué mirar primero») sobre todas las dimensiones; la etiqueta incluye la dimensión. */
  function findingsAll(all, { money, pct }) {
    if (!all || all.status !== 'ok') return [];
    return findings(all.pseudo, { money, pct, label: (x) => `${x.dimLabel}: ${x.label}` });
  }

  FP.trafficConversionEngine = { analyze, effects, crTest, findings, qualityChecks, analyzeAll, pick, findingsAll, crossTab };
})(typeof window !== 'undefined' ? window : globalThis);
