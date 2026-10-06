/**
 * segmentInsights.js — «Tráfico y conversión», parte 1 de descubrimiento (en orden de valor):
 *   1) hallazgos en frases, 2) mapa tráfico × CR (cuadrantes), 3) oportunidad estimada en pesos, 4) rankings con umbral.
 * Solo usa lo que ya calcula la vista (sesiones, pedidos y venta por segmento, periodo actual y anterior). Nada de IA: frases deterministas.
 * Reglas para no engañar: CR y AOV por razón de sumas; volumen mínimo para rankings y cuadrantes; una diferencia de CR que puede ser ruido
 * (el CR del total cae dentro del intervalo de Wilson al 95 % del segmento) se marca «no concluyente» y no genera oportunidad.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && isFinite(v);

  /** Umbral de volumen: el mayor entre 500 sesiones y el 1 % del tráfico del periodo. */
  const MIN_SESSIONS = 500, MIN_SHARE = 0.01;

  /** Intervalo de Wilson al 95 % para una proporción. */
  function wilson(k, n, z = 1.96) {
    if (!(n > 0)) return null;
    const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return { lo: (c - m) / d, hi: (c + m) / d };
  }

  /**
   * @param {object} res  resultado de segmentsView.summarize
   * @returns {{ totals, threshold, rows: [{...row, relevant, quadrant, conclusive, opportunity}], highlights: string[], opportunities, rankings }}
   */
  function analyze(res) {
    const cur = res.rows.filter((r) => r.current && r.current.has.traffic && r.current.traffic > 0);
    const T = cur.reduce((s, r) => s + r.current.traffic, 0);
    const O = cur.reduce((s, r) => s + (r.current.has.orders ? r.current.orders : 0), 0);
    const V = cur.reduce((s, r) => s + (r.current.has.revenue ? r.current.revenue : 0), 0);
    const crT = T > 0 ? O / T : null, aovT = O > 0 ? V / O : null;
    // totales del periodo anterior (mismos segmentos con dato en ese periodo): para comparar las tarjetas de cifras
    const bs = res.rows.filter((r) => r.baseline && r.baseline.has && r.baseline.has.traffic);
    const pT = bs.reduce((s2, r) => s2 + r.baseline.traffic, 0), pO = bs.reduce((s2, r) => s2 + (r.baseline.has.orders ? r.baseline.orders : 0), 0), pV = bs.reduce((s2, r) => s2 + (r.baseline.has.revenue ? r.baseline.revenue : 0), 0);
    const prev = bs.length ? { traffic: pT, orders: pO, revenue: pV, cr: pT > 0 ? pO / pT : null, aov: pO > 0 ? pV / pO : null } : null;
    const threshold = Math.max(MIN_SESSIONS, Math.ceil(MIN_SHARE * T));
    const relevantN = cur.filter((r) => r.current.traffic >= threshold).length;
    const avgShare = relevantN ? 1 / relevantN : 1;
    const rows = res.rows.map((r) => {
      const c = r.current;
      const out = { ...r, relevant: false, quadrant: null, conclusive: null, opportunity: null, revenuePerSession: c && c.traffic > 0 && c.has.revenue ? c.revenue / c.traffic : null };
      if (!c || !(c.traffic > 0)) return out;
      out.relevant = c.traffic >= threshold;
      if (!out.relevant) { out.quadrant = 'low'; return out; }
      if (!fin(c.cr) || !fin(crT)) return out;
      const w = wilson(c.orders, c.traffic);
      out.conclusive = !!w && (crT < w.lo || crT > w.hi);
      const highTraffic = r.trafficShare >= avgShare, highCr = c.cr >= crT;
      out.quadrant = highTraffic ? (highCr ? 'star' : 'conversion') : (highCr ? 'scale' : 'review');
      if (out.conclusive && c.cr < crT) out.opportunity = c.traffic * (crT - c.cr) * (fin(c.aov) ? c.aov : (aovT || 0));
      return out;
    });
    const rel = rows.filter((r) => r.relevant && fin(r.current.cr));
    const top = (arr, f, n = 5, asc = false) => [...arr].filter((r) => fin(f(r))).sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n);
    const rankings = {
      revenue: top(rows.filter((r) => r.current && r.current.has.revenue), (r) => r.current.revenue),
      bestCr: top(rel, (r) => r.current.cr),
      // «Menor CR» y «Menor AOV»: solo los que están por debajo del total (con pocos segmentos, el fondo no repite a los mejores)
      worstCr: top(rel.filter((r) => r.current.cr < crT), (r) => r.current.cr, 5, true),
      worstAov: top(rel.filter((r) => fin(r.current.aov) && fin(aovT) && r.current.aov < aovT), (r) => r.current.aov, 5, true)
    };
    const opportunities = top(rows.filter((r) => fin(r.opportunity) && r.opportunity > 0), (r) => r.opportunity);

    // ---------- hallazgos (frases) ----------
    const F = FP.format, money = (v) => F.currency(v, 0), pct = (v, d = 1) => `${(v * 100).toFixed(d)} %`;
    const H = [];
    if (opportunities.length) {
      const o = opportunities[0];
      H.push({ kind: 'conversion', text: `Mayor oportunidad de conversión: «${o.label}» trae ${pct(o.trafficShare)} del tráfico y convierte ${pct(o.current.cr, 2)} contra ${pct(crT, 2)} del total. Al CR del total serían ${money(o.opportunity)} más (escenario matemático, no promesa).` });
    }
    const scale = rows.filter((r) => r.quadrant === 'scale' && r.conclusive).sort((a, b) => (b.revenuePerSession || 0) - (a.revenuePerSession || 0))[0];
    if (scale) H.push({ kind: 'scale', text: `Oportunidad de escalar: «${scale.label}» convierte ${pct(scale.current.cr, 2)} (el total, ${pct(crT, 2)}) con solo ${pct(scale.trafficShare)} del tráfico.` });
    const withBase = rows.filter((r) => r.baseline && r.baseline.has.revenue && (r.relevant || (r.baseline.traffic >= threshold)));
    const drop = [...withBase].sort((a, b) => a.revenueDelta - b.revenueDelta)[0];
    const rise = [...withBase].sort((a, b) => b.revenueDelta - a.revenueDelta)[0];
    if (drop && drop.revenueDelta < 0) H.push({ kind: 'drop', text: `Mayor caída contra el periodo anterior: «${drop.label}», −${money(Math.abs(drop.revenueDelta))} en venta.` });
    if (rise && rise.revenueDelta > 0) H.push({ kind: 'rise', text: `Mayor alza contra el periodo anterior: «${rise.label}», +${money(rise.revenueDelta)} en venta.` });
    const byRev = rankings.revenue;
    if (byRev.length >= 3 && V > 0) {
      const share2 = (byRev[0].current.revenue + byRev[1].current.revenue) / V;
      H.push({ kind: 'concentration', text: `Concentración: «${byRev[0].label}» y «${byRev[1].label}» traen ${pct(share2)} de la venta${share2 >= 0.6 ? ' (muy concentrada)' : ''}.` });
    }
    const lowN = rows.filter((r) => r.quadrant === 'low').length;
    if (lowN) H.push({ kind: 'low', text: `${lowN} segmento${lowN === 1 ? '' : 's'} con menos de ${F.integer(threshold)} sesiones: se muestran como «poco volumen» y no entran a rankings ni oportunidades.` });
    // ---------- parte 2 ----------
    // 5) Qué explica el cambio: Δ venta por segmento (suma exacta del cambio total) y su descomposición secuencial tráfico → CR → AOV
    const decomp = (c, p) => {
      if (!c || !p || !(p.traffic > 0) || !(p.orders > 0) || !fin(c.cr) || !fin(c.aov)) return null;
      const cr0 = p.orders / p.traffic, aov0 = p.revenue / p.orders;
      const traffic = (c.traffic - p.traffic) * cr0 * aov0, cr = c.traffic * (c.cr - cr0) * aov0, aov = c.traffic * c.cr * (c.aov - aov0);
      return { traffic, cr, aov };
    };
    const moves = rows.filter((r) => (r.current && r.current.has.revenue) || (r.baseline && r.baseline.has.revenue)).map((r) => {
      const d = decomp(r.current, r.baseline);
      const status = !r.baseline ? 'new' : !r.current ? 'gone' : 'both';
      const main = d ? Object.entries(d).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0][0] : null;
      return { key: r.key, label: r.label, delta: r.revenueDelta, effects: d, main, status };
    }).filter((m) => m.delta !== 0);
    const absSum = moves.reduce((s2, m) => s2 + Math.abs(m.delta), 0);
    moves.forEach((m) => { m.weight = absSum ? Math.abs(m.delta) / absSum : null; });
    const baseRows = res.rows.filter((r) => r.baseline && r.baseline.has.revenue);
    const totalDelta = rows.reduce((s2, r) => s2 + (r.revenueDelta || 0), 0);
    const changes = { total: totalDelta, hasBaseline: baseRows.length > 0,
      winners: moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
      losers: moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3) };
    // 6) AOV bajo con buen volumen: segmentos relevantes con AOV más de 15 % bajo el total y al menos 30 pedidos
    const lowAov = rows.filter((r) => r.relevant && r.current && fin(r.current.aov) && fin(aovT) && r.current.orders >= 30 && r.current.aov < 0.85 * aovT)
      .map((r) => ({ ...r, aovGap: r.current.aov / aovT - 1, aovUplift: r.current.orders * (aovT - r.current.aov) }))
      .sort((a, b) => b.aovUplift - a.aovUplift).slice(0, 5);
    // 7) Calidad de la medición: tráfico sin clasificar («Sin dato (not set)», «(not set)», «(other)»)
    const unclassified = (lbl) => /^\s*(sin dato|\(not set\)|\(other\)|not set)/i.test(String(lbl || ''));
    const unk = cur.filter((r) => unclassified(r.label)).reduce((s2, r) => s2 + r.current.traffic, 0);
    const quality = { unclassifiedShare: T > 0 ? unk / T : 0, unclassifiedTraffic: unk, alert: T > 0 && unk / T >= 0.05 };
    if (quality.alert) H.unshift({ kind: 'quality', text: `Calidad de la medición: ${pct(quality.unclassifiedShare)} del tráfico de esta dimensión no tiene dato («Sin dato (not set)»). Puede ser un problema de etiquetado en GA4, no de negocio; revísalo antes de sacar conclusiones.` });
    return { totals: { traffic: T, orders: O, revenue: V, cr: crT, aov: aovT, prev }, threshold, rows, highlights: H, opportunities, rankings, changes, lowAov, quality };
  }

  /** 8) Nuevos contra recurrentes, desde la dimensión «tipo de cliente» (si el archivo la trae). */
  function customerSplit(summary) {
    const pick = (re) => summary.rows.find((r) => re.test(String(r.label || '')));
    const nw = pick(/^nuev|^new/i), rt = pick(/^recurr|^return|^establ/i);
    if (!nw || !rt || !nw.current || !rt.current) return null;
    const T = nw.current.traffic + rt.current.traffic, T0 = (nw.baseline ? nw.baseline.traffic : 0) + (rt.baseline ? rt.baseline.traffic : 0);
    const side = (r) => ({ label: r.label, traffic: r.current.traffic, share: T ? r.current.traffic / T : null,
      shareBefore: T0 && r.baseline ? r.baseline.traffic / T0 : null, cr: r.current.cr, aov: r.current.aov,
      crBefore: r.baseline ? r.baseline.cr : null, aovBefore: r.baseline ? r.baseline.aov : null });
    return { nuevo: side(nw), recurrente: side(rt) };
  }

  const QUADRANT = {
    conversion: { label: 'Oportunidad de conversión', short: 'Convertir mejor' },
    scale: { label: 'Oportunidad de escalar', short: 'Escalar tráfico' },
    star: { label: 'Estrella', short: 'Estrella' },
    review: { label: 'Revisar o despriorizar', short: 'Revisar' },
    low: { label: 'Poco volumen', short: 'Poco volumen' }
  };

  FP.segmentInsights = { analyze, customerSplit, wilson, QUADRANT, MIN_SESSIONS, MIN_SHARE };
})(typeof window !== 'undefined' ? window : globalThis);
