/**
 * dx-resumen.js — Reglas invisibles del Diagnóstico («¿Por qué?»): qué frase del veredicto, qué filas del resumen general, qué línea de lectura de cada
 * sección y qué acciones de «¿Qué hago con esto?» se muestran. Descriptivo: solo repite lo que ya calculó FP.diagnosticEngine (brecha, drivers, señales,
 * hipótesis, confianza) y el desglose de productos; no calcula cifras nuevas ni dice causas. Umbrales en FP.config.diagnostics.summary (PROVISIONALES).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.diagnostics.summary;
  const B = (t) => `<b>${t}</b>`;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const n0 = (v) => Math.round(v).toLocaleString('es-MX');
  const p0 = (v) => `${Math.round(v * 100)} %`;
  const p1 = (v) => `${(v * 100).toFixed(1)} %`;
  const spc = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %`;
  const DRIVER = { trafficVolume: ['volumen', 'el volumen de tráfico'], conversionRate: ['conversión', 'la conversión'], aov: ['ticket', 'el ticket (AOV)'] };
  const REF = { actual_vs_plan: ['del plan', 'al plan'], forecast_vs_plan: ['del plan', 'al plan'], actual_vs_previous: ['del periodo anterior', 'al periodo anterior'],
    actual_vs_yoy: ['del mismo periodo del año anterior', 'al mismo periodo del año anterior'], reforecast_vs_forecast: ['del forecast', 'al forecast'] };
  const PLAN = ['actual_vs_plan', 'forecast_vs_plan'];
  const EVID = { localized: 'localizada', general: 'general', secondary: 'señal secundaria', counter_signal: 'señal contraria', data_quality: 'calidad de dato' };

  /** Dinero compacto (`$5.8 M`) para ventas; entero con separador para pedidos. */
  function fmt(metric, v, sign) {
    if (!fin(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : sign ? '+' : '';
    if (metric === 'orders' || metric === 'units') return `${s}${n0(a)}`;
    return `${s}$${a >= 1e6 ? `${(a / 1e6).toFixed(1)} M` : a >= 1e3 ? `${Math.round(a / 1e3)} K` : Math.round(a)}`;
  }
  const refOf = (d) => REF[d.comparison.id] || ['de la referencia', 'a la referencia'];
  const hasHigh = (s) => s.relevance && s.relevance.priority === 'high';

  /** El driver que más aporta a la brecha (por valor absoluto) y el que va en sentido contrario. */
  function drivers(d) {
    const ds = (d.level1Drivers || []).filter((x) => fin(x.contribution));
    const main = ds.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0] || null;
    const up = d.gap.abs >= 0;
    const off = ds.filter((x) => x !== main && (x.contribution > 0) !== up && fin(x.shareOfGap) && Math.abs(x.shareOfGap) >= CFG().offsetShare).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0] || null;
    return { main, off, up };
  }

  /** Primer renglón de cada nivel de producto con aporte relevante (solo si el desglose de productos ya se calculó). */
  function productTop(state) {
    const p = state.dx && state.dx.products && state.dx.products.result;
    if (!p) return null;
    const pick = (res) => (res && res.rows || []).find((x) => !/^\(/.test(x.key) && fin(x.revenue.delta) && x.contribution !== null && Number.isFinite(x.contribution)) || null;
    const cat = pick(p.category), prod = pick(p.product);
    const rows = [cat && { kind: 'categoría', row: cat }, prod && { kind: 'producto', row: prod }].filter(Boolean).filter((x) => Math.abs(x.row.contribution) >= CFG().productShare);
    return { cat, prod, top: rows.sort((a, b) => Math.abs(b.row.contribution) - Math.abs(a.row.contribution))[0] || null, result: p };
  }

  function build(state, d) {
    const C = CFG(), r = d.result, k = d.metric, g = d.gap, cmp = d.comparison, [refDe, refA] = refOf(d);
    const { main, off, up } = drivers(d);
    /* con una brecha casi cero los porcentajes de la brecha se disparan: ahí solo se cuenta qué se movió, no cuánto «explica» */
    const shareOk = (x) => x && fin(x.shareOfGap) && fin(g.pct) && Math.abs(g.pct) >= C.flatPct && Math.abs(x.shareOfGap) <= C.maxShare;
    const metricWord = k === 'orders' ? ['Los pedidos', 'pedidos'] : ['La venta', 'venta'];
    const subject = cmp.id === 'forecast_vs_plan' ? 'El forecast' : cmp.id === 'reforecast_vs_forecast' ? 'El reforecast requerido' : metricWord[0];
    const flat = fin(g.pct) && Math.abs(g.pct) < C.flatPct;
    const mainName = main && DRIVER[main.driver] ? DRIVER[main.driver][1] : main ? main.label.toLowerCase() : null;
    let verdict;
    if (flat) verdict = `${subject} de ${d.period.label} está en línea con ${cmp.id === 'actual_vs_plan' || cmp.id === 'forecast_vs_plan' ? 'el plan' : r.baselineLabel.toLowerCase()} (${spc(g.pct)}).`;
    else {
      const tail = shareOk(main) ? (Math.abs(main.shareOfGap) >= C.dominantShare ? `: ${up ? 'lo impulsa' : 'lo explica sobre todo'} ${mainName}.` : `: ninguna variable domina; la mayor aportación es de ${mainName}.`) : '.';
      verdict = `${subject} de ${d.period.label} ${up ? `supera ${refA}` : `queda por debajo ${refDe}`} en ${fmt(k, Math.abs(g.abs))} (${spc(g.pct)})${tail}`;
    }

    /* ---- etiquetas de confiabilidad ---- */
    const chips = [];
    const cl = d.confidence.level, lbl = FP.config.confidenceLabels[cl] || cl;
    chips.push([cl === 'excellent' || cl === 'sufficient' ? 'ok' : 'warn', `● Confianza de datos: ${lbl.toLowerCase()}`, d.confidence.note || 'Combina cobertura de días, fuente de tráfico y producto.']);
    const at = d.level1.attribution, cuadra = at && at.status === 'ok' && Math.abs(at.residual) <= Math.max(1e-3, Math.abs(g.abs) * 1e-6);
    chips.push([cuadra ? 'ok' : 'warn', cuadra ? '✓ Cuadra con la brecha' : '⚠ No cuadra con la brecha', 'Σ de las contribuciones de los drivers = brecha total.']);
    const un = d.coverage.unpaired;
    chips.push([un ? 'warn' : 'mu', un ? `◐ ${n0(un)} ${un === 1 ? 'día' : 'días'} sin dato en algún lado` : `◐ ${cmp.label}`, un ? 'Esos días se excluyen del cálculo; no se tratan como cero.' : 'Cada comparación usa su propia referencia; la app no las mezcla.']);
    chips.push(['mu', '● Atribución matemática, no causa', 'Una contribución grande no es la causa operativa; las hipótesis piden validación.']);

    /* ---- indicadores ---- */
    const sigs = d.signals || [], high = sigs.filter(hasHigh), hyps = d.hypotheses || [];
    const kpis = [
      [r.currentLabel, fmt(k, r.current[k]), d.period.label],
      [r.baselineLabel, fmt(k, r.baseline[k]), cmp.label],
      ['Brecha', fmt(k, g.abs, true), fin(g.pct) ? spc(g.pct) : ''],
      ['Driver principal', main ? main.label : '—', shareOk(main) ? `${p0(Math.abs(main.shareOfGap))} de la brecha` : main ? `${fmt(k, main.contribution, true)} de aporte` : 'sin dato'],
      ['Señales altas', String(high.length), `de ${sigs.length} ${sigs.length === 1 ? 'señal' : 'señales'}`],
      ['Hipótesis', String(hyps.length), hyps.length ? 'por validar' : 'sin evidencia suficiente']
    ];

    /* ---- resumen general (corto / largo) ---- */
    const S = [];
    S.push(['Hecho', `${B(d.period.label)}: ${fmt(k, r.current[k])} contra ${fmt(k, r.baseline[k])} (${spc(g.pct)}).`,
      `${B(d.period.label)}: ${fmt(k, r.current[k])} contra ${fmt(k, r.baseline[k])} ${refDe}, una brecha de ${fmt(k, g.abs, true)} (${spc(g.pct)}). Canal: ${d.channel.label}; comparación: ${cmp.label.toLowerCase()}.`]);
    if (shareOk(main) && Math.abs(main.shareOfGap) >= C.driverShare) {
      S.push(['Driver', `${B(main.label)} explica ${p0(Math.abs(main.shareOfGap))} de la brecha (${fmt(k, main.contribution, true)}).`,
        `${B(main.label)} aporta ${fmt(k, main.contribution, true)}, ${p0(Math.abs(main.shareOfGap))} de la brecha (${d.attributionMethodLabel}). Es una atribución matemática: dice qué variable se movió, no por qué.`]);
    }
    else if (main && fin(main.contribution) && !shareOk(main)) S.push(['Driver', `${B(main.label)} es la variable que más se mueve (${fmt(k, main.contribution, true)}); la brecha total es casi cero.`, `${B(main.label)} aporta ${fmt(k, main.contribution, true)} (${d.attributionMethodLabel}), pero la brecha total es casi cero: los drivers se compensan entre sí y su porcentaje de la brecha no es informativo.`]);
    if (off && shareOk(off)) S.push(['Compensa', `${B(off.label)} compensa ${fmt(k, off.contribution, true)} en sentido contrario.`,
      `${B(off.label)} va en sentido contrario (${fmt(k, off.contribution, true)}): sin ese efecto la brecha sería ${fmt(k, g.abs - off.contribution, true)}.`]);
    const loc = high.filter((s) => s.dimensionLabel);
    if (loc.length) S.push(['Dónde', `${loc.slice(0, 2).map((s) => B(s.label)).join(' y ')} ${loc.length > 1 ? 'concentran' : 'concentra'} las señales de prioridad alta.`,
      `${loc.slice(0, 4).map((s) => `${B(`${s.dimensionLabel}: ${s.label}`)} (${s.metricLabel.toLowerCase()} ${s.kind === 'mix_shift' ? `${s.delta > 0 ? '+' : '−'}${(Math.abs(s.delta) * 100).toFixed(1)} pp` : spc(s.deltaPct)})`).join('; ')}. Prioridad alta significa «mirar primero», no culpable.`]);
    else if (high.length) S.push(['Dónde', `${high.length} ${high.length === 1 ? 'señal' : 'señales'} de prioridad alta, sin un segmento localizado.`, `${high.length} ${high.length === 1 ? 'señal' : 'señales'} de prioridad alta en el total: ${high.slice(0, 3).map((s) => s.evidence).join('; ')}.`]);
    const pt = productTop(state);
    if (pt && pt.top) {
      const x = pt.top.row, nm = FP.pxView ? FP.pxView.nameOf({ level: pt.top.kind === 'categoría' ? 'category' : 'product' }, x.key) : x.key;
      S.push(['Producto', `${B(nm)} aporta ${fmt('revenue', x.revenue.delta, true)} (${p0(Math.abs(x.contribution))} del cambio de venta de productos).`,
        `${B(nm)} (${pt.top.kind}) aporta ${fmt('revenue', x.revenue.delta, true)}, ${p0(Math.abs(x.contribution))} del cambio de la venta de productos.${pt.result.note ? ` ${pt.result.note}` : ''}`]);
    }
    const h0 = hyps[0];
    if (h0) S.push(['Hipótesis', h0.hypothesis, `${h0.hypothesis} Evidencia: ${EVID[h0.evidenceLevel] || 'general'}; cita ${h0.relatedSignals.length} ${h0.relatedSignals.length === 1 ? 'señal' : 'señales'}. No demuestra causalidad: queda como «Requiere investigación».`]);
    const w = [], wl = [];
    if (cl === 'limited' || cl === 'insufficient') { w.push(`Confianza de datos ${lbl.toLowerCase()}`); wl.push(`La confianza de datos es ${lbl.toLowerCase()}: las contribuciones pueden cambiar mucho si se completan los datos que faltan`); }
    if (un) { w.push(`${n0(un)} ${un === 1 ? 'día' : 'días'} sin dato`); wl.push(`${n0(un)} ${un === 1 ? 'día' : 'días'}-canal sin dato en algún lado se excluyen del cálculo; no se tratan como cero`); }
    if (pt && fin(r.current.revenue) && pt.result.category && pt.result.category.total) {
      const t = pt.result.category.total.revenue;
      if (fin(t.current) && Math.abs(t.current - r.current.revenue) > 1 && k === 'revenue') { w.push('La venta de productos no cuadra con el titular'); wl.push('La venta de productos no coincide con la del titular porque los datos de producto cubren otros días; el desglose es orientativo'); }
    }
    if (!hyps.length) { w.push('Sin hipótesis'); wl.push('No hay evidencia suficiente para formular hipótesis sin nombrar causas que no se pueden sostener'); }
    if (w.length) S.push(['Ojo', `${w.join('. ')}.`, `${wl.join('. ')}.`]);
    const ORD = ['Hecho', 'Driver', 'Compensa', 'Dónde', 'Producto', 'Hipótesis', 'Ojo'];
    S.sort((a, b) => ORD.indexOf(a[0]) - ORD.indexOf(b[0]));

    /* ---- una línea de lectura por sección ---- */
    const L = { h: '', d: '', w: '', y: '', c: '' };
    const ms = ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov'].filter((m) => fin(r.current[m]) && fin(r.baseline[m]) && r.baseline[m] !== 0).map((m) => [m, r.current[m] / r.baseline[m] - 1]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (ms) L.h = `La métrica que más se mueve es ${B(FP.config.metrics[ms[0]].label.toLowerCase())} (${spc(ms[1])}).`;
    if (shareOk(main)) L.d = `${B(main.label)} explica ${p0(Math.abs(main.shareOfGap))} de la brecha${off && shareOk(off) ? `; ${off.label} compensa ${p0(Math.abs(off.shareOfGap))}.` : '.'}`;
    if (high.length) L.w = `${B(`${high.length} ${high.length === 1 ? 'señal' : 'señales'}`)} de prioridad alta; empieza por ${B(loc[0] ? loc[0].label : high[0].label)}.`;
    if (hyps.length) L.y = 'Cada hipótesis cita sus señales y declara su nivel de evidencia; ninguna es una recomendación.';
    if (cl === 'limited' || cl === 'insufficient') L.c = 'Con confianza limitada, trata las contribuciones como orientativas.';

    return { verdict, chips, kpis, rows: S, lec: L, main, off, high: high.length, hyps: hyps.length, actions: actions(state, d, pt) };
  }

  /** «¿Qué hago con esto?»: qué destinos están disponibles ahora y por qué no, si no lo están. */
  function actions(state, d, pt) {
    const hyps = d.hypotheses || [], main = drivers(d).main;
    const hyp = (main && hyps.find((h) => h.driver === main.driver)) || hyps.find((h) => h.driver) || hyps[0] || null;
    const out = { product: null, recovery: null, plan: null, hyp };
    /* producto afectado: el producto o la categoría que más pesa, si ya hay desglose de producto */
    const row = pt && (pt.top ? pt.top.row : pt.cat);
    if (pt && row) out.product = { key: row.key, level: pt.top ? pt.top.kind : 'categoría', name: FP.pxView ? FP.pxView.nameOf({ level: 'category' }, row.key) : row.key, delta: row.revenue.delta };
    /* simular la recuperación: Recuperar trabaja contra el plan y con venta; hace falta una hipótesis con driver */
    const pt0 = d.period && d.period.type;
    const why = !hyp ? 'No hay hipótesis para llevar a Recuperar.' : !hyp.driver ? 'La hipótesis no tiene un driver al que ligar una ruta de recuperación.'
      : !PLAN.includes(d.comparison.id) ? 'Recuperar trabaja contra el plan: cambia la comparación a «Actual vs Plan» o «Forecast vs Plan» para simular.'
        : d.metric !== 'revenue' ? 'Recuperar trabaja con la venta: cambia la métrica a Venta.' : !['month', 'week', 'year'].includes(pt0) ? 'Recuperar necesita un periodo de mes, semana o año.' : null;
    out.recovery = why ? { why } : { hypId: hyp.id, hyp: hyp.hypothesis, driver: hyp.driver, altId: { trafficVolume: 'A', conversionRate: 'B', aov: 'C' }[hyp.driver] || null };
    /* plan de acción: necesita un escenario guardado ligado a la hipótesis */
    const sc = hyp && state.rc && state.rc.scenarioStore ? state.rc.scenarioStore.scenarios.find((s) => s.links && s.links.hypothesisId === hyp.id) : null;
    out.plan = sc ? { scenarioId: sc.scenarioId, name: sc.name } : { why: out.recovery.why || 'Primero guarda un escenario ligado a esta hipótesis en Recuperar.' };
    return out;
  }

  FP.dxResumen = { build, actions, drivers, fmt, PLAN };
})(typeof window !== 'undefined' ? window : globalThis);
