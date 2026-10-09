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
    const out = { status: 'ok', total, dominantEffect, mix, items: shown, allItems: items, hidden: items.length - shown.length, excluded, minSessions };
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
    const negCrTotal = sum(dec.allItems.filter((x) => x.cr < 0), (x) => x.cr);
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

  FP.trafficConversionEngine = { analyze, effects, crTest, findings, qualityChecks };
})(typeof window !== 'undefined' ? window : globalThis);
