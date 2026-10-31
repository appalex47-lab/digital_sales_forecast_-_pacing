/**
 * home-resumen.js — Reglas invisibles de Inicio: qué frase del veredicto, qué chips de confiabilidad, qué cifras visibles y qué filas del
 * resumen general se muestran. Descriptivo: solo repite lo que ya calcularon Pacing/Forecast (cumplimiento, brecha, forecast), el Nivel 1 del
 * Diagnóstico (motores de la brecha), FP.homeSummaryEngine y FP.attentionEngine; no calcula cifras nuevas ni dice causas.
 * Umbrales en FP.config.diagnostics.homeSummary (PROVISIONALES).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.diagnostics.homeSummary;
  const esc = (v) => FP.ui.helpers.esc(v);
  const B = (t) => `<b>${t}</b>`;
  const DN = { trafficVolume: 'tráfico', conversionRate: 'conversión', aov: 'ticket' };

  function fmt() {
    const F = FP.format;
    return { M: (v) => F.currency(Math.abs(v), 0), SM: (v) => (Math.abs(v) < 0.5 ? F.currency(0, 0) : (v > 0 ? '+' : '−') + F.currency(Math.abs(v), 0)), C: (v) => F.currencyCompact(v), pct: (v, d = 1) => F.percent(v, d), spct: (v) => F.signedPercent(v, 1) };
  }

  /**
   * @param {{S:object, f:object, att:object|null, next:object|null, state:object, ready:object|null}} c  S = FP.homeSummaryEngine.compute; f = {p, run, label, ch}; att = resultado del motor de atención (hallazgos); next = siguiente paso
   * @returns {{ok:boolean, verdict:string, chips:Array, kpis:Array, rows:Array, lec:object}}
   */
  function build(c) {
    const S = c.S, f = c.f, p = f.p, t = p.toDate.revenue, fg = p.forecastGap.revenue, cfg = CFG(), x = fmt();
    const future = p.status === 'future';
    const cur = p.actualToDate && p.actualToDate.revenue, plan = p.planToDate && p.planToDate.revenue;
    const fc = p.forecast && p.forecast.revenue, ok = !future && fin(t.gap) && fin(cur) && fin(plan) && fin(t.compliance);
    const wp = S.whyPlan, drivers = wp && wp.status === 'ok' ? wp.drivers.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)) : [];
    const top = drivers.length === 3 ? drivers[0] : null;
    const nF = c.att && c.att.findings ? c.att.findings.length : 0;
    const nextTitle = c.next && c.next.title ? c.next.title : '';

    /* ---- Veredicto ---- */
    let verdict;
    if (future) verdict = 'El periodo todavía no empieza: no hay venta real que comparar con la meta.';
    else if (!ok) verdict = 'Todavía no hay plan y venta real suficientes para medir la brecha contra la meta.';
    else {
      const comp = t.compliance, dev = comp - 1;
      const a = dev >= cfg.planBand ? `Vas ${Math.abs(dev * 100).toFixed(1)} % por encima de la meta acumulada` : dev > -cfg.planBand ? `Vas en plan: ${(comp * 100).toFixed(1)} % de la meta acumulada` : `Vas ${B(Math.abs(dev * 100).toFixed(1) + ' %')} por debajo de la meta acumulada`;
      let b = '.';
      if (fin(fg.gapPct) && fin(fc)) b = Math.abs(fg.gapPct) < cfg.flatPct ? '; al ritmo actual cierras en línea con la meta.' : `; al ritmo actual cierras en ${x.C(fc)}, ${Math.abs(fg.gapPct * 100).toFixed(1)} % ${fg.gapPct < 0 ? 'por debajo' : 'por encima'} de la meta.`;
      const d = top && plan > 0 && Math.abs(t.gap) / plan >= cfg.driverMinPct ? ` Lo que más pesa: ${DN[top.id] || esc(top.label)} (${x.SM(top.contribution)}).` : '';
      verdict = `${a}${b}${d}${nF ? ` Hay ${nF} cosa${nF === 1 ? '' : 's'} que revisar.` : ''}`;
    }

    /* ---- Confiabilidad ---- */
    const T = S.trust, cov = T.coverage, chips = [];
    chips.push([T.lastActual ? 'ok' : 'warn', `● Venta real hasta el ${esc(T.lastActual || '—')}`, 'El último día con venta real cargado.']);
    if (cov) chips.push([cov.paired === 0 || cov.paired < cov.expected * 0.5 ? 'warn' : 'ok', `● ${cov.paired} de ${cov.expected} días comparados`, 'Días por canal con venta en ambos periodos: lo que respalda la lectura de «Por qué».']);
    const q = T.quality;
    if (q && q.flagged > 0) chips.push(['warn', `◐ ${FP.format.integer(q.flagged)} registro${q.flagged === 1 ? '' : 's'} con aviso`, 'Los avisos no bloquean el análisis, pero conviene revisarlos antes de actuar.']);
    else if (q) chips.push(['ok', '● Sin avisos de calidad', 'Calidad de datos sin avisos ni errores.']);
    if (c.ready && fin(c.ready.percent)) chips.push(['mu', `● Preparación de datos ${Math.round(c.ready.percent)} %`, 'Cuánto de la información necesaria está cargada para que plan, pacing y forecast sean confiables.']);
    let ayer = null; try { ayer = FP.changesView && FP.changesView.summaryOf ? FP.changesView.summaryOf(c.state) : null; } catch (e) { ayer = null; }
    if (ayer && ayer.R.newAlerts) chips.push(['warn', `◐ ${ayer.R.newAlerts} alerta${ayer.R.newAlerts === 1 ? '' : 's'} nueva${ayer.R.newAlerts === 1 ? '' : 's'} desde ayer`, 'Ve «Qué cambió desde ayer».']);

    /* ---- Cifras visibles ---- */
    const kpis = [];
    kpis.push(['Cumplimiento', ok ? x.pct(t.compliance, 1) : '—', ok ? `${x.M(cur)} de ${x.M(plan)}` : 'Sin cifra para este periodo']);
    kpis.push(['Gap (brecha)', ok ? x.SM(t.gap) : '—', 'Venta − meta acumulada']);
    kpis.push(['Forecast de cierre', fin(fc) ? x.C(fc) : '—', fin(fg.gapPct) ? `${x.spct(fg.gapPct)} vs meta del periodo` : 'Sin meta para comparar']);
    kpis.push(['Por revisar', `${nF} ${nF === 1 ? 'hallazgo' : 'hallazgos'}`, nextTitle ? `Siguiente paso: ${esc(nextTitle.toLowerCase())}` : 'Sin siguiente paso']);

    /* ---- Resumen general ---- */
    const rows = [];
    if (ok) {
      rows.push(['Cómo voy', `Llevas ${B(x.M(cur))} de ${x.M(plan)} de meta acumulada (${B(x.pct(t.compliance, 1))}), gap ${B(x.SM(t.gap))}.`, `Venta acumulada ${x.M(cur)} contra una meta acumulada de ${x.M(plan)}: cumplimiento ${x.pct(t.compliance, 1)}, gap ${x.SM(t.gap)}${fin(t.gapPct) ? ` (${x.spct(t.gapPct)})` : ''}.`]);
      if (fin(fc) && fin(fg.gapPct)) rows.push(['Cierre', `Cierre proyectado ${B(x.C(fc))} (${x.spct(fg.gapPct)} vs meta).`, `Al ritmo actual el periodo cierra en ${x.C(fc)}, ${x.spct(fg.gapPct)} contra la meta. Es una estimación, no una promesa.`]);
      if (top && plan > 0 && Math.abs(t.gap) / plan >= cfg.driverMinPct) rows.push(['Qué pesa', `Lo que más mueve la brecha: ${B(DN[top.id] || esc(top.label))} (${x.SM(top.contribution)}).`,
        `Aporte de cada motor a la brecha: ${drivers.map((d) => `${DN[d.id] || esc(d.label)} ${x.SM(d.contribution)}`).join('; ')}. Es un cálculo, no una causa demostrada: confírmalo en <a href="#diagnostico" data-nav="diagnostico">Diagnóstico</a>.`]);
    }
    const ch = S.channels.status === 'ok' ? S.channels.rows.filter((r) => r.state === 'ok' && fin(r.compliance)).sort((a, b) => a.compliance - b.compliance) : [];
    if (ch.length) rows.push(['Canales', `${B(esc(ch[0].label))} es el más rezagado (${x.spct(ch[0].compliance - 1)} vs plan acumulado).`,
      `Cumplimiento acumulado por canal: ${ch.map((r) => `${esc(r.label)} ${x.pct(r.compliance, 1)}`).join('; ')}.`]);
    if (nF) rows.push(['Atención', `${B(nF + ' hallazgo' + (nF === 1 ? '' : 's'))}${nextTitle ? `; siguiente paso: ${esc(nextTitle.toLowerCase())}` : ''}.`, `Qué necesita atención: ${(c.att.findings || []).map((fi) => esc(fi.title)).join('; ')}.`]);
    if (ayer) rows.push(['Desde ayer', ayer.R.strip[0], ayer.R.strip.join(' ')]);
    rows.push(['Confianza', `Venta real hasta el ${B(esc(T.lastActual || '—'))}${cov ? `; ${cov.paired} de ${cov.expected} días comparados` : ''}${q ? `; ${q.flagged ? q.flagged + ' con aviso' : 'sin avisos de calidad'}` : ''}.`,
      'Hasta dónde llega la venta real, cuántos días se pudieron comparar, la calidad de los datos y los archivos cargados.']);

    const L = {};
    if (top && ok) L.why = `Los tres motores suman la brecha: ${B(DN[top.id] || esc(top.label))} pesa más (${x.SM(top.contribution)}).`;
    if (ch.length) L.ch = `${B(esc(ch[0].label))} va ${x.spct(ch[0].compliance - 1)} contra su plan acumulado.`;
    return { ok, verdict, chips, kpis, rows, lec: L };
  }

  FP.homeResumen = { build };
})(typeof window !== 'undefined' ? window : globalThis);
