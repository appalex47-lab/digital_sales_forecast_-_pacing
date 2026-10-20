/**
 * reportBuilder.js — Presentación ejecutiva (PDF). Arma el CONTENIDO de las páginas; no calcula nada nuevo ni dibuja.
 * Recibe resultados que la app ya calculó (forecast, reforecast, diagnóstico, evolución, productos, clientes, proyección, calidad)
 * y los ordena en páginas con una idea cada una. El renderizado (HTML/SVG/impresión) vive en js/ui/report-view.js.
 *
 * Reglas que este módulo hace cumplir (tools/test-report-builder.js las prueba):
 *  - Un dato faltante es «No disponible» (valor null), nunca 0. Un cero real se muestra como 0.
 *  - CR y AOV nunca se promedian: solo se leen los que el motor ya calculó desde sumas.
 *  - El pacing compara real y plan de los mismos días contados; el Total solo cuenta días con real en todos los canales
 *    y la página lo explica con la conciliación (suma de canales vs Total estricto).
 *  - La descomposición Tráfico × CR × AOV se muestra con su método y SOLO si cierra con la brecha; no es causal.
 *  - El método de forecast vigente es el del usuario; los alternativos son sensibilidad, nunca un reemplazo.
 *  - Cada cifra lleva una etiqueta: Observado, Calculado o Estimado.
 *  - Una página sin datos suficientes se omite y queda en el anexo con su motivo.
 *  - Sin claves, preferencias ni datos del negocio (el nombre del negocio es opt-in).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const SCHEMA = 'executive_report', SCHEMA_VERSION = '1.0.0';
  const NA = 'No disponible';
  const TAG = { obs: 'Observado', calc: 'Calculado', est: 'Estimado' };
  const CHANNELS = ['ecommerce', 'app', 'whatsapp', 'llamadas'];
  const CH_LABEL = { ecommerce: 'Ecommerce', app: 'App', whatsapp: 'WhatsApp', llamadas: 'Llamadas', total: 'Total digital' };
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MATERIAL_SPREAD = 0.02;       // los métodos usables se separan ≥ 2 % de la meta → aviso (misma constante que el comparador de métodos)
  const CLOSE_TOL = 1;                // la descomposición cierra si |Σ contribuciones − brecha| ≤ max(1 peso, 1e-6 de la brecha)

  /* ---------------- formato (una sola fuente para titulares, tablas y gráficas) ---------------- */
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nfCache = new Map();
  const nf = (o) => { const k = JSON.stringify(o); if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat('es-MX', o)); return nfCache.get(k); };
  const cur = () => (FP.config && FP.config.currency) || 'MXN';
  const money = (v, d = 0) => (isNum(v) ? nf({ style: 'currency', currency: cur(), minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace('-', '−') : NA);
  function moneyC(v) {
    if (!isNum(v)) return NA;
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
    return `${s}$${a.toFixed(0)}`;
  }
  const pct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)} %` : NA);
  const spct = (v, d = 1) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)} %` : NA);
  const smoney = (v, d = 0) => (isNum(v) ? `${v > 0 ? '+' : ''}${money(v, d)}` : NA);
  const int = (v) => (isNum(v) ? nf({ maximumFractionDigits: 0 }).format(v) : NA);
  const num2 = (v, d = 2) => (isNum(v) ? nf({ maximumFractionDigits: d }).format(v) : NA);
  const pp = (v) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)} pp` : NA);
  function dateLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]} ${MONTHS[+m[2] - 1].toLowerCase()} ${m[1]}` : NA;
  }
  function dateTimeLabel(iso) {
    const d = new Date(iso); if (!iso || isNaN(d)) return NA;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const pct2 = (v) => pct(v, 2);
  const FMT = { pct2, text: (v) => (v === null || v === undefined || v === '' ? NA : String(v)), money, moneyC, smoney, pct, spct, int, num2, pp, date: dateLabel };
  const fmt = (kind, v) => (FMT[kind] || FMT.text)(v);
  const chLabel = (id) => CH_LABEL[id] || id || NA;
  const absOr = (v) => (isNum(v) ? Math.abs(v) : null);
  const closes = (parts, gap) => isNum(gap) && parts.every(isNum) && Math.abs(parts.reduce((a, b) => a + b, 0) - gap) <= Math.max(CLOSE_TOL, Math.abs(gap) * 1e-6);
  const clean = (t) => (typeof t === 'string' && !/\b(null|undefined|NaN|Infinity)\b/.test(t) ? t : null);

  const series = (run, ch) => (!run ? null : ch === 'total' ? run.total : (run.channels && run.channels[ch]) || null);
  const omit = (id, title, reason) => ({ id, title, status: 'omitted', reason });
  const page = (id, title, o) => ({ id, title, status: 'included', question: '', headline: '', kpis: [], tables: [], charts: [], notes: [], sources: [], ...o });
  const kpi = (id, label, value, kind, tag, o = {}) => ({ id, label, value: isNum(value) || typeof value === 'string' ? value : null, kind, tag: tag || null, ...o });
  const toneOfGap = (v) => (!isNum(v) || v === 0 ? 'neutral' : v > 0 ? 'pos' : 'neg');

  /* ---------------- 1 · Portada ---------------- */
  function pageCover(s) {
    const run = s.run, q = s.quality;
    const filters = (s.filters || []).filter((f) => f && f.label);
    return page('cover', 'Portada', {
      headline: 'Reporte Ejecutivo de Ventas Digitales',
      facts: [
        { id: 'period', label: 'Período analizado', value: run ? `Año ${run.year} · acumulado al corte` : NA },
        { id: 'cutoff', label: 'Fecha de corte', value: run && run.cutoff ? dateLabel(run.cutoff) : NA, note: 'La fecha de corte es diaria; la herramienta no registra hora de corte.' },
        { id: 'generated', label: 'Generado', value: dateTimeLabel(s.generatedAt) },
        { id: 'channels', label: 'Canales incluidos', value: s.channel === 'total' || !s.channel ? 'Total digital (Ecommerce, App, WhatsApp, Llamadas)' : chLabel(s.channel) },
        { id: 'selection', label: 'Selección y filtros activos', value: filters.length ? filters.map((f) => `${f.page}: ${f.label}`).join(' · ') : 'Sin filtros de producto o ubicación' },
        { id: 'plan', label: 'Plan / meta', value: run && run.plan && run.plan.source !== 'none' ? (run.plan.label || 'Plan cargado') : 'Sin plan cargado' },
        { id: 'method', label: 'Método de forecast', value: run && run.method ? `${run.method.id} · ${run.method.label}` : NA },
        { id: 'quality', label: 'Calidad de datos', value: q ? q.statusText : NA, tone: q ? (q.status === 'ok' ? 'pos' : q.status === 'error' ? 'neg' : 'warn') : 'neutral' }
      ],
      businessName: s.options && s.options.showBusinessName && s.businessName ? s.businessName : null,
      sources: ['Configuración de la herramienta']
    });
  }

  /* ---------------- 3 · Pacing y forecast ---------------- */
  function cumulativeByMonth(S) {
    const labels = MONTHS.slice(), plan = [], actual = [], fc = [];
    let p = 0, a = 0, f = 0, pOk = true, aOk = true, fOk = true, cut = -1;
    (S.months || []).forEach((m, i) => {
      const pv = m.plan && m.plan.revenue, av = m.actualToDate && m.actualToDate.revenue, fv = m.forecast && m.forecast.revenue;
      if (isNum(pv)) p += pv; else pOk = false;
      if (m.countedDays > 0 && isNum(av)) { a += av; cut = i; } else if (m.countedDays > 0) aOk = false;
      if (isNum(fv)) f += fv; else fOk = false;
      plan.push(pOk ? p : null); fc.push(fOk ? f : null); actual.push(aOk && i <= cut ? a : null);
    });
    return { labels, plan, actual, forecast: fc, cutIndex: cut };
  }

  function pagePacing(s) {
    const S = series(s.run, s.channel);
    if (!S || !S.annual) return omit('pacing', 'Pacing y forecast', 'No hay forecast calculado: falta el plan o la venta real del año.');
    const A = S.annual, tr = A.toDate && A.toDate.revenue, fg = A.forecastGap && A.forecastGap.revenue;
    if (!tr || !isNum(tr.actual) || !(A.countedDays > 0)) return omit('pacing', 'Pacing y forecast', 'Todavía no hay días contados con venta real hasta la fecha de corte.');
    const hasPlan = isNum(tr.plan);
    const headline = !hasPlan
      ? `Venta real a la fecha ${moneyC(tr.actual)}; no hay plan comparable para medir el avance.`
      : `${Math.abs(tr.gapPct) < 0.005 ? 'En línea con el plan' : tr.gap < 0 ? `${pct(Math.abs(tr.gapPct))} por debajo del plan` : `${pct(Math.abs(tr.gapPct))} por encima del plan`} a la fecha (${smoney(tr.gap)}); ${isNum(A.forecast && A.forecast.revenue) ? `cierre estimado ${moneyC(A.forecast.revenue)}${isNum(fg && fg.gapPct) ? ` (${spct(fg.gapPct)} vs. meta)` : ''}.` : 'el cierre estimado no está disponible.'}`;
    const rows = [...CHANNELS.map((c) => [c, series(s.run, c)]), ['total', s.run.total]].filter(([, x]) => x && x.annual).map(([c, x]) => {
      const t = x.annual.toDate && x.annual.toDate.revenue;
      return { channel: chLabel(c), real: t ? t.actual : null, plan: t ? t.plan : null, gap: t ? t.gap : null, gapPct: t ? t.gapPct : null, days: x.annual.countedDays, _total: c === 'total' };
    });
    const recon = s.channel === 'total' && FP.methodAdvisor ? FP.methodAdvisor.totalReconciliation(s.run) : null;
    const notes = [];
    if (recon && recon.excludedDays > 0) {
      const who = Object.entries(recon.byChannel || {}).map(([c, r]) => `${chLabel(c)} (${r.map((x) => (x[0] === x[1] ? dateLabel(x[0]) : `${dateLabel(x[0])} a ${dateLabel(x[1])}`)).join(', ')})`).join('; ');
      notes.push(`Conciliación del Total: ${recon.excludedDays} día${recon.excludedDays === 1 ? '' : 's'} excluido${recon.excludedDays === 1 ? '' : 's'} del pacing del Total porque falta el real de ${who}. Suma de los canales ${smoney(recon.sumChannelsGap)} · Total estricto ${smoney(recon.totalGap)} · Diferencia ${smoney(recon.difference)}.`);
    }
    if (!hasPlan) notes.push('Sin plan comparable no se calculan brecha ni cumplimiento; se muestra solo el real.');
    if (!isNum(A.forecast && A.forecast.revenue)) notes.push('El forecast al cierre no está disponible: el plan no cubre todo el año o no hay método con datos suficientes.');
    notes.push('Plan comparable = plan de los mismos días contados (con real cargado). El cierre estimado depende del método elegido; no es un compromiso.');
    return page('pacing', 'Pacing y forecast', {
      question: '¿Vamos arriba o abajo del plan hoy y dónde cerraríamos al ritmo actual?', headline,
      kpis: [
        kpi('real', 'Venta real a la fecha', tr.actual, 'moneyC', TAG.obs, { sub: `${A.countedDays} días contados` }),
        kpi('plan', 'Plan comparable', hasPlan ? tr.plan : null, 'moneyC', TAG.calc, { sub: 'mismos días contados' }),
        kpi('compliance', 'Cumplimiento', hasPlan ? tr.compliance : null, 'pct', TAG.calc, { tone: hasPlan ? toneOfGap(tr.gap) : 'neutral', sub: hasPlan ? `Brecha ${smoney(tr.gap)}` : null }),
        kpi('forecast', 'Cierre estimado', A.forecast ? A.forecast.revenue : null, 'moneyC', TAG.est, { sub: isNum(fg && fg.gap) ? `vs. meta ${smoney(fg.gap)}` : `Método ${s.run.method ? s.run.method.id : '—'}` })
      ],
      charts: [Object.assign({ type: 'cumulative', id: 'cum', title: 'Venta acumulada por mes: real, plan y forecast' }, cumulativeByMonth(S))],
      tables: [{ id: 'by-channel', title: 'Por canal (a la fecha)', columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'real', label: 'Real', kind: 'moneyC', num: true }, { key: 'plan', label: 'Plan comparable', kind: 'moneyC', num: true }, { key: 'gap', label: 'Brecha', kind: 'smoney', num: true, tone: true }, { key: 'gapPct', label: 'Brecha %', kind: 'spct', num: true, tone: true }, { key: 'days', label: 'Días', kind: 'int', num: true }], rows }],
      reconciliation: recon && recon.excludedDays > 0 ? recon : null,
      notes, sources: ['Pacing y forecast (motor de forecast)'], tags: [TAG.obs, TAG.calc, TAG.est]
    });
  }

  /* ---------------- 4 · Confiabilidad y sensibilidad del forecast ---------------- */
  const LIGHT_TEXT = { green: 'Datos suficientes', yellow: 'Datos limitados', red: 'Datos insuficientes' };
  function advise(s) {
    if (!FP.methodAdvisor || !s.run) return null;
    try { return FP.methodAdvisor.advise({ run: s.run, channel: s.channel || 'total', metric: 'revenue', backtest: s.backtest || null, horizon: 7 }); } catch (e) { return null; }
  }
  function pageReliability(s, adv) {
    const S = series(s.run, s.channel);
    if (!S || !S.annual || !s.run.method) return omit('reliability', 'Confiabilidad del forecast', 'No hay forecast calculado.');
    const A = S.annual, fc = A.forecast && A.forecast.revenue, goal = A.plan && A.plan.revenue, fg = A.forecastGap && A.forecastGap.revenue;
    const mid = s.run.method.id, light = adv && adv.methods && adv.methods[mid] ? adv.methods[mid].light : null;
    const range = adv && adv.range ? adv.range : null;
    const material = range && isNum(range.spreadPct) && range.spreadPct >= MATERIAL_SPREAD;
    const conf = S.confidence && S.confidence.level ? S.confidence.level : null;
    const confText = conf && FP.config && FP.config.confidenceLabels ? FP.config.confidenceLabels[conf] : conf;
    const notes = [];
    if (range) notes.push(material
      ? `Advertencia: los métodos con datos suficientes cierran entre ${money(range.min)} y ${money(range.max)}; la diferencia es ${pct(range.spreadPct)} de la meta. Es un rango entre métodos, no un intervalo de confianza.`
      : `Los métodos con datos suficientes coinciden dentro de ${pct(range.spreadPct)} de la meta. Es un rango entre métodos, no un intervalo de confianza.`);
    else notes.push('No hay métodos alternativos con datos suficientes para contrastar el cierre.');
    if (!isNum(goal)) notes.push('Sin meta que cubra el año no se calcula la brecha proyectada.');
    notes.push('El método lo eligió una persona en Pacing y forecast; la herramienta no lo cambia sola. El detalle de cada método está en el anexo.');
    return page('reliability', 'Confiabilidad del forecast', {
      question: '¿Cuánto confiar en el cierre estimado y cuánto depende del método?',
      headline: isNum(fc) ? `Cierre estimado ${moneyC(fc)} con el método ${mid}${isNum(fg && fg.gapPct) ? ` (${spct(fg.gapPct)} vs. meta)` : ''}${light ? `; ${LIGHT_TEXT[light].toLowerCase()}` : ''}.` : `El método ${mid} no tiene cierre estimado disponible.`,
      kpis: [
        kpi('method', 'Método seleccionado', `${mid} · ${s.run.method.label}`, 'text', null),
        kpi('fc', 'Cierre estimado', isNum(fc) ? fc : null, 'moneyC', TAG.est),
        kpi('goal', 'Meta al cierre', isNum(goal) ? goal : null, 'moneyC', TAG.calc),
        kpi('gap', 'Brecha proyectada', fg && isNum(fg.gap) ? fg.gap : null, 'smoney', TAG.est, { tone: fg ? toneOfGap(fg.gap) : 'neutral', sub: fg && isNum(fg.gapPct) ? spct(fg.gapPct) : null })
      ],
      suficiencia: { light, text: light ? LIGHT_TEXT[light] : NA, reasons: adv && adv.methods && adv.methods[mid] ? adv.methods[mid].reasons || [] : [], confidence: confText || null, countedDays: A.countedDays, dataQuality: s.quality ? s.quality.statusText : null },
      charts: range ? [{ type: 'range', id: 'range', title: 'Rango de cierre entre métodos con datos suficientes', min: range.min, max: range.max, selected: isNum(fc) ? fc : null, goal: isNum(goal) ? goal : null, material: Boolean(material) }] : [],
      warning: material ? 'divergence' : null, notes, sources: ['Pacing y forecast', 'Comparación de métodos'], tags: [TAG.calc, TAG.est]
    });
  }

  /* ---------------- 5 · Diagnóstico de motores y canales ---------------- */
  function pageDrivers(s) {
    const d = s.diag;
    if (!d || d.status !== 'ok' || !d.gap) return omit('drivers', 'Diagnóstico de motores y canales', 'No hay brecha que descomponer: falta plan o venta real en el período del diagnóstico.');
    const L1 = (d.level1Drivers || []).filter((x) => isNum(x.contribution));
    if (L1.length < 2) return omit('drivers', 'Diagnóstico de motores y canales', 'Faltan tráfico, pedidos o venta para descomponer la brecha en tráfico, conversión y ticket.');
    const ok = closes(L1.map((x) => x.contribution), d.gap.abs);
    if (!ok) return omit('drivers', 'Diagnóstico de motores y canales', 'La descomposición no cierra con la brecha del período; no se muestra una atribución que no concilia.');
    const main = [...L1].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    const steps = [{ label: d.result.baselineLabel || 'Referencia', value: d.gap.baseline, kind: 'total' }, ...L1.map((x) => ({ label: x.label, value: x.contribution, kind: 'delta' })), { label: d.result.currentLabel || 'Real', value: d.gap.current, kind: 'total' }];
    const rows = L1.map((x) => ({ driver: x.label, baseline: x.baseline, current: x.current, deltaPct: x.deltaPct, contribution: x.contribution, _kind: x.driver }));
    const fmtK = (k) => (k === 'conversionRate' ? 'pct2' : k === 'aov' ? 'money' : 'int');
    const channelDim = (d.level2 || []).find((x) => x.dimension === 'channel');
    let chRows = null;
    if (s.channel === 'total' && channelDim && channelDim.groups && channelDim.groups.length > 1) {
      chRows = channelDim.groups.filter((g) => isNum(g.gap)).map((g) => {
        const top = Object.entries(g.contributions || {}).filter(([, v]) => isNum(v)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
        const lab = { trafficVolume: 'Tráfico', conversionRate: 'CR', aov: 'AOV' };
        return { channel: g.label, gap: g.gap, main: top ? `${lab[top[0]] || top[0]} (${smoney(top[1])})` : NA, share: g.currentShare };
      }).sort((a, b) => a.gap - b.gap);
    }
    return page('drivers', 'Diagnóstico de motores y canales', {
      question: '¿Qué palanca explica matemáticamente la brecha contra el plan?',
      headline: `La brecha de ${smoney(d.gap.abs)} (${spct(d.gap.pct)}) se descompone en tráfico, CR y AOV; la mayor contribución aritmética es ${main.label} (${smoney(main.contribution)}).`,
      kpis: [
        kpi('gap', 'Brecha del período', d.gap.abs, 'smoney', TAG.calc, { tone: toneOfGap(d.gap.abs), sub: spct(d.gap.pct) }),
        kpi('cur', d.result.currentLabel || 'Real', d.gap.current, 'moneyC', TAG.obs),
        kpi('base', d.result.baselineLabel || 'Referencia', d.gap.baseline, 'moneyC', TAG.calc)
      ],
      charts: [{ type: 'waterfall', id: 'wf', title: 'De la referencia al real, por palanca', steps }],
      tables: [{ id: 'drivers', title: 'Contribución por palanca', columns: [{ key: 'driver', label: 'Palanca', kind: 'text' }, { key: 'baseline', label: 'Referencia', kindBy: '_kind', num: true }, { key: 'current', label: 'Real', kindBy: '_kind', num: true }, { key: 'deltaPct', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'contribution', label: 'Contribución', kind: 'smoney', num: true, tone: true }], rows, kindMap: { trafficVolume: 'int', conversionRate: 'pct2', aov: 'money' } },
        ...(chRows && chRows.length ? [{ id: 'channels', title: 'Lectura por canal', columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'gap', label: 'Brecha', kind: 'smoney', num: true, tone: true }, { key: 'main', label: 'Mayor contribución aritmética', kind: 'text' }], rows: chRows.slice(0, 4) }] : [])],
      method: { id: d.attributionMethod, label: d.attributionMethodLabel, closes: true, sum: L1.reduce((a, x) => a + x.contribution, 0), gap: d.gap.abs },
      notes: [`Método de atribución: ${d.attributionMethodLabel || d.attributionMethod}. Las contribuciones suman exactamente la brecha (${smoney(L1.reduce((a, x) => a + x.contribution, 0))}).`, 'Es aritmética de Venta = Tráfico × CR × AOV; no demuestra que una palanca sea la causa del resultado.', d.coverage && isNum(d.coverage.unpaired) && d.coverage.unpaired > 0 ? `${d.coverage.unpaired} día(s) sin par comparable quedaron fuera de la comparación.` : null].filter(Boolean),
      comparison: { label: d.comparison && d.comparison.label, period: d.period && d.period.label, channel: d.channel && d.channel.label },
      sources: ['Diagnóstico de brecha'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 6 · Evolución y patrones ---------------- */
  const PATTERN = { growth_sustained: 'Crecimiento sostenido', growth_accelerating: 'Crecimiento acelerado', growth_decelerating: 'Crecimiento desacelerando', decline_sustained: 'Caída sostenida', decline_accelerating: 'Caída acelerada', decline_decelerating: 'Caída desacelerando', recovery: 'Recuperación', strong_recovery: 'Recuperación fuerte', trend_break: 'Ruptura de tendencia', stable: 'Estable', volatile: 'Volátil', anomaly: 'Anomalía', insufficient_history: 'Historia insuficiente' };
  const patternText = (p, n) => {
    const base = PATTERN[p] || NA;
    const dec = /^decline|^growth/.test(p || '');
    return dec && isNum(n) && n >= 2 ? `${base} · ${n} períodos` : base;
  };
  function pageTrends(s) {
    const t = s.trend, P = t && t.priorities;
    if (!P || P.status !== 'available') return omit('trends', 'Evolución y patrones', 'No hay análisis de evolución: carga venta por producto con historia de al menos 6 períodos.');
    const ctx = t.context || {};
    const rowBy = new Map((t.rows || []).map((r) => [r.entity, r]));
    const mapRow = (x) => ({ entity: x.entity, impact: x.impact, relative: x.relativeChange, pattern: patternText(x.pattern, x.consecutivePeriods), _spark: (rowBy.get(x.entity) || {}).series || null });
    const drag = (P.drag || []).filter((x) => isNum(x.impact)).slice(0, 5).map(mapRow), comp = (P.compensate || []).filter((x) => isNum(x.impact)).slice(0, 5).map(mapRow);
    if (!drag.length && !comp.length) return omit('trends', 'Evolución y patrones', 'El análisis no encontró entidades con cambio medible en el período.');
    const cmp = P.comparison || {};
    const partial = cmp.currentPartial || cmp.baselinePartial;
    const lvl = { category: 'categoría', subcategory: 'subcategoría', product: 'producto', sku: 'SKU', state: 'estado', city: 'ciudad', branch: 'sucursal', delivery: 'tipo de entrega', channel: 'canal' }[ctx.level] || 'entidad';
    const cols = [{ key: 'entity', label: 'Entidad', kind: 'text' }, { key: 'impact', label: 'Impacto', kind: 'smoney', num: true, tone: true }, { key: 'relative', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'pattern', label: 'Patrón', kind: 'text' }, { key: '_spark', label: 'Evolución', kind: 'spark' }];
    return page('trends', 'Evolución y patrones', {
      question: '¿Qué entidades arrastran la caída, cuáles compensan y desde cuándo?',
      headline: `${cmp.currentPeriod || 'El período'} vs. ${cmp.baselinePeriod || 'el anterior'}: caen ${money(P.totals && P.totals.dragAbs)} en ${(P.drag || []).length} ${lvl}(s) y compensan ${money(P.totals && P.totals.compensateAbs)} en ${(P.compensate || []).length}.`,
      kpis: [
        kpi('drag', 'Lo que arrastra', P.totals ? P.totals.drag : null, 'smoney', TAG.calc, { tone: 'neg' }),
        kpi('comp', 'Lo que compensa', P.totals ? P.totals.compensate : null, 'smoney', TAG.calc, { tone: 'pos' }),
        kpi('bal', 'Balance neto', P.totals ? P.totals.balance : null, 'smoney', TAG.calc, { tone: P.totals ? toneOfGap(P.totals.balance) : 'neutral' })
      ],
      tables: [{ id: 'drag', title: 'Arrastran', columns: cols, rows: drag }, { id: 'comp', title: 'Compensan', columns: cols, rows: comp }],
      scope: { level: ctx.levelLabel || lvl, metric: ctx.metricLabel || 'Venta', channel: ctx.channelLabel || null, periodType: ctx.periodType || null, filter: s.trendFilterLabel || null, partial: Boolean(partial) },
      notes: [partial ? 'Hay un período parcial en la comparación: los cambios pueden cambiar al cerrar el período.' : 'Comparación entre períodos completos.', 'Los patrones son descriptivos (cómo se movió la venta), no explican por qué. Una duración corta no es un deterioro estructural.'],
      sources: ['Evolución y patrones'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 7 · Categorías y productos ---------------- */
  function pageCategories(s) {
    const r = s.product;
    if (!r || !r.rows || !r.rows.length) return omit('categories', 'Categorías y productos', 'No hay venta por producto cargada para el período.');
    const rows = r.rows.filter((x) => x.revenue && isNum(x.revenue.current));
    if (!rows.length) return omit('categories', 'Categorías y productos', 'Los grupos del período no tienen venta observada.');
    const tot = r.total && r.total.revenue ? r.total.revenue : {};
    const level = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', channel: 'Canal' }[r.level] || 'Grupo';
    const byShare = [...rows].sort((a, b) => b.revenue.current - a.revenue.current);
    const byDelta = [...rows].filter((x) => isNum(x.revenue.delta)).sort((a, b) => Math.abs(b.revenue.delta) - Math.abs(a.revenue.delta));
    const top3 = byShare.slice(0, 3).reduce((a, x) => a + (isNum(x.share) ? x.share : 0), 0);
    const stable = isNum(tot.delta) && isNum(tot.baseline) && tot.baseline > 0 && Math.abs(tot.delta) / tot.baseline >= 0.01;
    const tbl = byShare.slice(0, 6).map((x) => ({ key: x.key, current: x.revenue.current, delta: x.revenue.delta, deltaPct: x.revenue.deltaPct, share: x.share, contribution: stable && isNum(x.contribution) ? x.contribution : null }));
    const lead = byDelta[0];
    return page('categories', 'Categorías y productos', {
      question: '¿Dónde está concentrada la venta y dónde está el cambio?',
      headline: `${level}s: los 3 mayores concentran ${pct(top3, 0)} de la venta${lead ? `; el mayor cambio está en ${lead.key} (${smoney(lead.revenue.delta)})` : ''}.`,
      kpis: [kpi('total', 'Venta del período', tot.current, 'moneyC', TAG.obs), kpi('delta', 'Cambio vs. referencia', tot.delta, 'smoney', TAG.calc, { tone: toneOfGap(tot.delta), sub: isNum(tot.deltaPct) ? spct(tot.deltaPct) : null }), kpi('top3', 'Top 3 en venta', top3, 'pct', TAG.calc)],
      charts: [{ type: 'hbar', id: 'contrib', title: `Cambio de venta por ${level.toLowerCase()}`, unit: 'money', items: byDelta.slice(0, 6).map((x) => ({ label: x.key, value: x.revenue.delta })) }],
      tables: [{ id: 'share', title: `Participación en venta · ${level}`, columns: [{ key: 'key', label: level, kind: 'text' }, { key: 'current', label: 'Venta', kind: 'moneyC', num: true }, { key: 'share', label: 'Participación', kind: 'pct', num: true }, { key: 'delta', label: 'Cambio', kind: 'smoney', num: true, tone: true }, { key: 'contribution', label: 'Aporte al cambio', kind: 'pct', num: true }], rows: tbl }],
      scope: { period: r.period, baseline: r.baseline, channel: r.channel, level, filter: s.productFilterLabel || null },
      notes: ['Participación = venta del grupo ÷ venta total. Aporte al cambio = cambio del grupo ÷ cambio total; son medidas distintas.', stable ? null : 'El cambio total es muy pequeño, así que el «aporte al cambio» no es estable y no se muestra.', r.compensation && clean(r.compensation.text) ? r.compensation.text : null].filter(Boolean),
      sources: ['Categoría → Producto'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 8 · Clientes, recurrencia y LTV ---------------- */
  function pageCustomers(s) {
    const c = s.customers && s.customers.result;
    if (!c || c.status !== 'ok' || !c.summary || !(c.summary.customers > 0)) return omit('customers', 'Clientes, recurrencia y LTV', 'No hay libro de clientes: carga venta con ID de pedido e ID de cliente.');
    const months = (c.monthly || []).slice(-6);
    if (!months.length) return omit('customers', 'Clientes, recurrencia y LTV', 'No hay meses con clientes identificados.');
    const reliableNew = months.every((m) => m.reliableNew);
    const last = months[months.length - 1];
    const pooled = (c.pooled || []).filter((p) => p.mature > 0 && isNum(p.repeatRate));
    const retention = pooled.map((p) => ({ window: `${p.days} días`, mature: p.mature, repeat: p.repeatRate, ltv: p.ltv }));
    const filtered = Boolean(c.filtered);
    return page('customers', 'Clientes, recurrencia y LTV', {
      question: '¿Qué calidad tiene la base de clientes detrás de la venta?',
      headline: `${int(c.summary.customers)} clientes identificados; en ${last.key} ${int(last.customers.total)} compraron (${int(last.customers.new)} nuevos, ${int(last.customers.recurrent)} recurrentes, ${int(last.customers.reactivated)} reactivados).`,
      kpis: [kpi('customers', 'Clientes identificados', c.summary.customers, 'int', TAG.obs), kpi('repeat', 'Recompra (histórico)', c.summary.repeatRate, 'pct', TAG.calc), kpi('rpc', 'Venta por cliente', c.summary.revenuePerCustomer, 'moneyC', TAG.calc)],
      charts: [{ type: 'stacked', id: 'mix', title: 'Clientes por mes: nuevos, recurrentes y reactivados', labels: months.map((m) => m.key), series: [{ name: 'Nuevos', values: months.map((m) => m.customers.new) }, { name: 'Recurrentes', values: months.map((m) => m.customers.recurrent) }, { name: 'Reactivados', values: months.map((m) => m.customers.reactivated) }] }],
      tables: [{ id: 'retention', title: 'Recompra y LTV observado por ventana (clientes con la ventana completa)', columns: [{ key: 'window', label: 'Ventana', kind: 'text' }, { key: 'mature', label: 'Clientes', kind: 'int', num: true }, { key: 'repeat', label: 'Recompraron', kind: 'pct', num: true }, { key: 'ltv', label: 'LTV observado', kind: 'money', num: true }], rows: retention }],
      lapsed: isNum(last.lapsed) && isNum(last.lapsedBase) ? { month: last.key, count: last.lapsed, base: last.lapsedBase } : null,
      scope: { filtered, label: s.customers.scopeLabel || (filtered ? 'Selección' : 'Toda la empresa') },
      notes: [reliableNew ? null : 'Con poca historia previa, «nuevo» puede incluir clientes que ya compraban: la apertura nuevo/recurrente de los primeros meses no es confiable.', isNum(last.lapsed) ? `${int(last.lapsed)} de ${int(last.lapsedBase)} clientes que compraron el mes anterior no compraron en ${last.key}; es una ventana de un mes, no una pérdida definitiva.` : null, 'El LTV observado es la venta acumulada de clientes con la ventana completa; no es un valor futuro garantizado.'].filter(Boolean),
      sources: ['Clientes y LTV'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 9 · Tráfico y conversión ---------------- */
  const SEG_DIMS = ['device', 'sourceMedium', 'campaign', 'landingPage', 'source', 'medium'];
  function pageTraffic(s) {
    const d = s.diag;
    const dims = d && d.level2 ? d.level2.filter((x) => x.source !== 'core' && x.groups && x.groups.length) : [];
    if (!dims.length) return omit('traffic', 'Tráfico y conversión', 'No hay archivo de segmentos de tráfico (dispositivo, fuente/medio, campaña o página de destino) para el período.');
    const dim = dims[0];
    const rows = dim.groups.map((g) => {
      const m = g.metrics || {};
      return { segment: g.label, traffic: g.current ? g.current.trafficVolume : null, trafficChg: m.trafficVolume ? m.trafficVolume.deltaPct : null, cr: g.current ? g.current.conversionRate : null, crChg: m.conversionRate ? m.conversionRate.deltaPct : null, aov: g.current ? g.current.aov : null, revenue: g.current ? g.current.revenue : null, revChg: m.revenue ? m.revenue.deltaPct : null, obs: g.observations };
    }).filter((r) => isNum(r.traffic) || isNum(r.revenue)).sort((a, b) => (b.traffic || 0) - (a.traffic || 0)).slice(0, 6);
    if (!rows.length) return omit('traffic', 'Tráfico y conversión', 'Los segmentos del período no traen tráfico ni venta observados.');
    const best = [...rows].filter((r) => isNum(r.crChg)).sort((a, b) => b.crChg - a.crChg)[0], worst = [...rows].filter((r) => isNum(r.crChg)).sort((a, b) => a.crChg - b.crChg)[0];
    return page('traffic', 'Tráfico y conversión', {
      question: '¿En qué segmento ganó o perdió tráfico y conversión?',
      headline: best && worst && best !== worst ? `Por ${dim.label.toLowerCase()}, el CR cambió más en ${best.segment} (${spct(best.crChg)}) y menos en ${worst.segment} (${spct(worst.crChg)}).` : `Tráfico y conversión por ${dim.label.toLowerCase()} en el período del diagnóstico.`,
      tables: [{ id: 'segments', title: `Segmentos · ${dim.label}`, columns: [{ key: 'segment', label: 'Segmento', kind: 'text' }, { key: 'traffic', label: 'Tráfico', kind: 'int', num: true }, { key: 'trafficChg', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'cr', label: 'CR', kind: 'pct2', num: true }, { key: 'crChg', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'aov', label: 'AOV', kind: 'money', num: true }, { key: 'revChg', label: 'Venta', kind: 'spct', num: true, tone: true }], rows }],
      scope: { dimension: dim.label, period: d.period && d.period.label, comparison: d.comparison && d.comparison.label, denominator: 'CR = pedidos ÷ tráfico del segmento; AOV = venta ÷ pedidos' },
      notes: ['Descriptivo: las diferencias entre segmentos no demuestran causa ni rentabilidad publicitaria.', 'CR y AOV vienen de sumas del segmento, no de promedios de tasas diarias.', 'La herramienta no incluye inversión publicitaria; no hay CAC ni ROAS.'],
      sources: ['Diagnóstico · segmentos de tráfico'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 10 · Recuperación y plan de acción ---------------- */
  function pageRecovery(s) {
    const rf = s.rf, R = rf ? (s.channel === 'total' ? rf.total : (rf.channels || {})[s.channel]) : null;
    const h = R && R.horizon;
    if (!h || !isNum(h.target)) return omit('recovery', 'Recuperación y plan de acción', 'No hay meta que cubra el horizonte: sin meta no hay brecha pendiente ni requerimiento diario.');
    const hs = R.horizonSummary || {};
    const pr = hs.pressure && hs.pressure.revenue ? hs.pressure.revenue : null;
    const days = h.futureDays;
    const reqDaily = isNum(h.requiredTotal) && days > 0 ? h.requiredTotal / days : null;
    const planDaily = pr && isNum(pr.plan) && days > 0 ? pr.plan / days : null;
    const actions = (s.recovery && s.recovery.actions ? s.recovery.actions : []).filter((a) => a && a.title);
    const scen = (s.recovery && s.recovery.scenarios ? s.recovery.scenarios : []).filter((x) => x && x.name);
    const met = h.remaining === 0 && isNum(h.surplus) && h.surplus >= 0;
    return page('recovery', 'Recuperación y plan de acción', {
      question: '¿Qué tendría que pasar de aquí al cierre para cumplir la meta?',
      headline: met ? `La meta del horizonte ya está cubierta (excedente ${money(h.surplus)}).` : `Faltan ${moneyC(h.remaining)} para la meta; en ${int(days)} días restantes se requieren ${moneyC(reqDaily)} por día${pr && isNum(pr.pressure) ? ` (${spct(pr.pressure)} vs. el plan diario restante)` : ''}.`,
      kpis: [
        kpi('target', 'Meta del horizonte', h.target, 'moneyC', TAG.calc), kpi('remaining', 'Brecha pendiente', h.remaining, 'moneyC', TAG.calc, { tone: h.remaining > 0 ? 'neg' : 'pos' }),
        kpi('days', 'Días restantes', days, 'int', TAG.calc), kpi('daily', 'Requerimiento diario', reqDaily, 'moneyC', TAG.est, { sub: isNum(planDaily) ? `plan diario ${moneyC(planDaily)}` : null })
      ],
      scenarios: scen.map((x) => ({ name: x.name, type: x.type || null, impact: x.impact, tag: TAG.est })),
      actions: actions.map((a) => ({ title: a.title, owner: a.owner || null, status: a.status || null, start: a.startDate || null, end: a.endDate || null, impact: a.expectedImpact && isNum(a.expectedImpact.incrementalValue) ? a.expectedImpact.incrementalValue : null })),
      notes: ['Requerimiento = lo que tendría que ocurrir para cumplir la meta; no es el pronóstico (ese es el forecast).', scen.length ? 'Los escenarios son simulaciones con supuestos; su impacto es Estimado.' : 'No hay escenarios guardados en la herramienta.', actions.length ? null : 'No hay acciones registradas en el plan de acción; no se muestran responsables ni fechas.'].filter(Boolean),
      sources: ['Reforecast', 'Recovery Center'], tags: [TAG.calc, TAG.est]
    });
  }

  /* ---------------- 11 · Estacionalidad y proyección ---------------- */
  function pageSeasonality(s) {
    const prof = s.profiles || {}, proj = s.projection;
    const lines = CHANNELS.map((c) => ({ c, m: prof[c] && prof[c].monthly })).filter((x) => x.m && x.m.available && Array.isArray(x.m.index) && x.m.index.length === 12 && x.m.index.every(isNum));
    const hasProj = proj && proj.hasData;
    if (!lines.length && !hasProj) return omit('seasonality', 'Estacionalidad y proyección', 'No hay historia suficiente: se necesita al menos un año completo para la estacionalidad y venta real/histórica para proyectar.');
    const tbl = hasProj ? (proj.rows || []).map((r) => ({ channel: r.label, base: r.base, meta: r.meta, proj: r.proj, gap: r.gap })) : [];
    return page('seasonality', 'Estacionalidad y proyección', {
      question: '¿Qué parte de lo observado es temporada y qué meta se propone para el año siguiente?',
      headline: hasProj ? `Para ${proj.targetYear}, la meta propuesta (${moneyC(proj.meta.total)}, ${spct(proj.growth)} sobre la base) queda ${moneyC(Math.abs(proj.gap.total))} ${proj.gap.total > 0 ? 'por encima' : 'por debajo'} de la proyección por ritmo reciente (${moneyC(proj.projection.total)}).` : 'Factores de estacionalidad mensual observados en la historia.',
      kpis: hasProj ? [kpi('base', `Base ${proj.baseYear}`, proj.base.total, 'moneyC', TAG.obs), kpi('meta', `Meta propuesta ${proj.targetYear}`, proj.meta.total, 'moneyC', TAG.est, { sub: `supuesto de crecimiento ${pct(proj.growth)}` }), kpi('proj', 'Proyección por ritmo', proj.projection.total, 'moneyC', TAG.est)] : [],
      charts: lines.length ? [{ type: 'lines', id: 'season', title: 'Factor mensual de estacionalidad (1 = promedio del año)', labels: MONTHS, series: lines.map((x) => ({ name: chLabel(x.c), values: x.m.index })), baseline: 1 }] : [],
      tables: hasProj ? [{ id: 'proj', title: `Meta vs. proyección ${proj.targetYear}`, columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'base', label: `Base ${proj.baseYear}`, kind: 'moneyC', num: true }, { key: 'meta', label: 'Meta propuesta', kind: 'moneyC', num: true }, { key: 'proj', label: 'Proyección', kind: 'moneyC', num: true }, { key: 'gap', label: 'Meta − proyección', kind: 'smoney', num: true }], rows: tbl }] : [],
      notes: [hasProj ? `Supuestos: la meta crece ${pct(proj.growth)} sobre la base y se reparte por canal según su peso; la proyección extiende el ritmo de los últimos 2 meses cerrados contra ${proj.baseYear - 1}. Son supuestos editables, no una recomendación.` : null, lines.length ? 'La estacionalidad es el patrón histórico observado de años completos; no garantiza el comportamiento futuro.' : 'No hay años completos para calcular estacionalidad.', ...(hasProj ? (proj.warnings || []).slice(0, 2) : [])].filter(Boolean),
      sources: ['Estacionalidad', 'Proyección del año siguiente'], tags: [TAG.obs, TAG.est]
    });
  }

  /* ---------------- 2 · Resumen ejecutivo (determinista, desde las páginas ya armadas) ---------------- */
  function pageSummary(s, pages) {
    const by = Object.fromEntries(pages.filter((p) => p.status === 'included').map((p) => [p.id, p]));
    const items = [];
    const get = (p, id) => (p && p.kpis.find((k) => k.id === id)) || null;
    const pc = by.pacing;
    if (pc) {
      const real = get(pc, 'real'), plan = get(pc, 'plan'), comp = get(pc, 'compliance');
      items.push({ n: 1, tag: TAG.obs, certainty: 'Hecho observado', text: pc.headline, source: 'Pág. Pacing y forecast', limit: comp && comp.value === null ? 'Sin plan comparable.' : null, page: 'pacing' });
      const fc = get(pc, 'forecast');
      if (fc && isNum(fc.value)) items.push({ n: 2, tag: TAG.est, certainty: 'Estimación', text: `Al ritmo del método ${s.run.method.id}, el cierre estimado es ${moneyC(fc.value)}${fc.sub ? ` (${fc.sub})` : ''}.`, source: 'Pág. Confiabilidad del forecast', limit: by.reliability && by.reliability.warning ? 'Los métodos alternativos difieren de forma material.' : 'Depende del método elegido.', page: 'reliability' });
    }
    if (by.drivers) items.push({ n: items.length + 1, tag: TAG.calc, certainty: 'Cálculo aritmético', text: by.drivers.headline, source: 'Pág. Diagnóstico de motores', limit: 'Descomposición matemática, no causal.', page: 'drivers' });
    if (by.trends) items.push({ n: items.length + 1, tag: TAG.calc, certainty: 'Señal calculada', text: by.trends.headline, source: 'Pág. Evolución y patrones', limit: by.trends.scope && by.trends.scope.partial ? 'Incluye un período parcial.' : 'Patrones descriptivos.', page: 'trends' });
    if (by.recovery && items.length < 5) items.push({ n: items.length + 1, tag: TAG.est, certainty: 'Requerimiento aritmético', text: by.recovery.headline, source: 'Pág. Recuperación', limit: 'No es un pronóstico.', page: 'recovery' });
    if (items.length < 3 && by.categories) items.push({ n: items.length + 1, tag: TAG.calc, certainty: 'Cálculo', text: by.categories.headline, source: 'Pág. Categorías y productos', limit: null, page: 'categories' });
    const out = items.filter((i) => clean(i.text)).slice(0, 5).map((i, k) => ({ ...i, n: k + 1 }));
    if (!out.length) return omit('summary', 'Resumen ejecutivo', 'Todavía no hay cálculos válidos que resumir.');
    // «Qué revisar primero»: solo si lo respalda un cálculo (mayor arrastre, o requerimiento mayor al plan).
    let review = null;
    const drag = by.trends && by.trends.tables[0] && by.trends.tables[0].rows[0];
    const rc = by.recovery && by.recovery.kpis.find((k) => k.id === 'daily');
    if (drag && isNum(drag.impact) && drag.impact < 0) review = `Revisar primero ${drag.entity}: es la entidad que más arrastra (${smoney(drag.impact)}) en el período comparado.`;
    else if (rc && by.recovery.headline.includes('vs. el plan diario')) review = 'Revisar si el ritmo diario requerido para cumplir la meta es alcanzable.';
    return page('summary', 'Resumen ejecutivo', { question: '¿Qué debo saber si solo leo una página?', headline: 'Lo más importante, en una mirada', items: out, review: review ? { text: review, basis: 'Regla determinista sobre los cálculos de las páginas siguientes; no es una recomendación causal.' } : null, sources: ['Cálculos de las páginas siguientes'], tags: [TAG.obs, TAG.calc, TAG.est] });
  }

  /* ---------------- 12 · Anexo técnico y calidad ---------------- */
  function pageAnnex(s, pages, adv) {
    const run = s.run, q = s.quality;
    const omitted = pages.filter((p) => p.status === 'omitted').map((p) => ({ title: p.title, reason: p.reason }));
    const quality = q ? Object.values(q.byType || {}).filter((t) => t && t.files > 0).map((t) => ({ type: t.label, files: t.files, read: t.rowsRead, imported: t.imported, rejected: t.rejected, warning: t.warning, error: t.error, duplicates: t.duplicateKeys })) : [];
    const ST = run && run.settings ? run.settings : {};
    const A = (series(run, s.channel) || {}).annual || {};
    const missing = [];
    if (A && isNum(A.missingActualDays)) missing.push({ item: 'Días del año sin venta real cargada (aún por ocurrir o sin dato)', value: A.missingActualDays });
    if (q && q.totals && isNum(q.totals.missingChannels)) missing.push({ item: 'Combinaciones fecha-canal sin dato', value: q.totals.missingChannels });
    if (q && q.totals && isNum(q.totals.rejected)) missing.push({ item: 'Filas rechazadas al importar', value: q.totals.rejected });
    const methods = adv && adv.methods ? Object.entries(adv.methods).map(([id, m]) => ({ method: id, light: m.light, status: LIGHT_TEXT[m.light] || NA, forecast: m.forecast, gap: m.forecast !== null && isNum(m.forecast) && A.plan && isNum(A.plan.revenue) ? m.forecast - A.plan.revenue : null, days: m.comparableDays, fallback: m.fallbackDays, reasons: (m.reasons || []).join(' · ') })) : [];
    const bt = s.backtest && s.backtest.byChannel ? s.backtest.byChannel[s.channel === 'total' ? null : s.channel] : null;
    const btRows = bt ? Object.entries(bt).map(([m, byH]) => { const r = byH && (byH[7] || byH['7']); return r ? { method: m, status: r.status, wape: r.wape, plan: r.planWape } : null; }).filter(Boolean) : [];
    return page('annex', 'Anexo técnico y calidad', {
      question: '¿Qué tan confiable es todo lo anterior y qué no incluye?',
      headline: 'Calidad de datos, supuestos, definiciones y páginas omitidas',
      quality, missing, methods, backtest: btRows, backtestNote: bt ? 'Error histórico (WAPE) a 7 días, calculado por canal; las muestras y períodos pueden no ser comparables entre métodos.' : 'El error histórico (backtest) no se había calculado al generar el reporte; se calcula en Pacing y forecast → «Calcular error histórico». El total no tiene backtest propio.',
      assumptions: [
        { item: 'Ventana reciente (método C)', value: ST.recentWindow ? (/^last(\d+)$/.test(String(ST.recentWindow)) ? `últimos ${String(ST.recentWindow).replace('last','')} días` : `${ST.recentWindow} días`) : NA }, { item: 'Mínimo de días comparables', value: isNum(ST.minComparableDays) ? `${ST.minComparableDays} días` : NA },
        { item: 'Cobertura mínima de ventana', value: isNum(ST.minWindowCoverage) ? pct(ST.minWindowCoverage, 0) : NA }, { item: 'Método de atribución de la brecha', value: s.diag && s.diag.attributionMethodLabel ? s.diag.attributionMethodLabel : NA },
        { item: 'Versión de la herramienta', value: s.app ? `${s.app.name} ${s.app.version}` : NA }],
      definitions: [
        ['Venta', 'Tráfico × CR × AOV. Las tres palancas explican la venta de forma aritmética, no causal.'], ['CR', 'Pedidos ÷ tráfico, siempre desde sumas del período (nunca promedio de tasas diarias).'], ['AOV', 'Venta ÷ pedidos, desde sumas.'],
        ['Corte', 'Último día con venta real cargada que se usa para comparar con el plan.'], ['Día contado', 'Día con real válido en el canal; en el Total, día con real en todos los canales.'], ['Plan comparable', 'Plan de los mismos días contados que el real.'],
        ['Brecha', 'Real − plan comparable. Cumplimiento = real ÷ plan comparable.'], ['Observado', 'Dato cargado desde un archivo.'], ['Calculado', 'Derivado de datos con una regla fija.'], ['Estimado', 'Proyección, simulación o supuesto.']],
      omitted,
      limits: ['La fecha de corte es diaria; no hay hora de corte.', 'Un dato faltante se muestra como «No disponible», nunca como 0.', 'El rango entre métodos no es un intervalo de confianza estadístico.', 'La descomposición de la brecha y los patrones son descriptivos: no establecen causas.', 'No incluye marketing pagado (CAC, ROAS), ejecución de CRM ni claves, preferencias o datos del negocio.', 'El reporte se genera en este navegador; no envía datos a ningún servicio.'],
      sources: ['Calidad de datos', 'Configuración de forecast'], tags: []
    });
  }

  /* ---------------- ensamblado ---------------- */
  const ORDER = ['cover', 'summary', 'pacing', 'reliability', 'drivers', 'trends', 'categories', 'customers', 'traffic', 'recovery', 'seasonality', 'annex'];
  function build(src) {
    const s = { channel: 'total', options: {}, filters: [], ...src };
    s.options = { includeAnnex: true, showTags: true, showBusinessName: false, ...(s.options || {}) };
    const adv = advise(s);
    const core = [pageCover(s), pagePacing(s), pageReliability(s, adv), pageDrivers(s), pageTrends(s), pageCategories(s), pageCustomers(s), pageTraffic(s), pageRecovery(s), pageSeasonality(s)];
    const all = [core[0], pageSummary(s, core), ...core.slice(1)];
    const annex = pageAnnex(s, all, adv);
    const pages = [...all, annex].filter((p) => p.id !== 'annex' || s.options.includeAnnex || true);   // el anexo siempre existe: lista las omisiones
    const included = pages.filter((p) => p.status === 'included');
    included.forEach((p, i) => { p.number = i + 1; });
    return {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION, generatedAt: s.generatedAt || null, app: s.app || null,
      context: { channel: s.channel, year: s.run ? s.run.year : null, cutoff: s.run ? s.run.cutoff : null, method: s.run && s.run.method ? s.run.method.id : null },
      options: s.options, pages, included: included.map((p) => p.id), omitted: pages.filter((p) => p.status === 'omitted').map((p) => ({ id: p.id, title: p.title, reason: p.reason })),
      total: included.length
    };
  }

  FP.reportBuilder = { SCHEMA, SCHEMA_VERSION, ORDER, TAG, NA, MATERIAL_SPREAD, build, fmt, FMT, closes, clean, advise };
})(typeof window !== 'undefined' ? window : globalThis);
