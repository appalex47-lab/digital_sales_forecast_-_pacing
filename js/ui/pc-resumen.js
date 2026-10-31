/**
 * pc-resumen.js — Reglas invisibles de «Pacing & Forecast» (Monitorear): la frase del veredicto, las etiquetas de confiabilidad, las filas del resumen
 * general, la línea de lectura de cada sección y las acciones de «¿Qué hago con esto?». Descriptivo: solo repite lo que ya calculó el motor de
 * forecast (plan, actual, gap, forecast de cierre, métodos, confianza, alertas); no calcula cifras nuevas ni dice causas.
 * Umbrales en FP.config.forecast.summary (PROVISIONALES: criterios propuestos, no benchmarks).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const B = (t) => `<b>${t}</b>`;
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const MESF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const PCT = (v, d = 1) => `${(v * 100).toFixed(d)} %`;
  const spc = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)} %`;
  const CFG = () => FP.config.forecast.summary;
  const chName = (ch) => (ch === 'total' ? 'Total digital' : FP.dataModel.getChannel(ch).label);

  /** Valor en la unidad de la métrica; las ventas en forma compacta para que la frase se lea de corrido. */
  function fmt(k, v, sign) {
    if (!fin(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : sign ? '+' : '';
    if (k === 'revenue') return `${s}$${a >= 1e6 ? `${(a / 1e6).toFixed(1)} M` : a >= 1e3 ? `${Math.round(a / 1e3)} K` : Math.round(a)}`;
    if (k === 'conversionRate') return `${s}${(a * 100).toFixed(2)} %`;
    if (k === 'aov') return `${s}$${Math.round(a).toLocaleString('es-MX')}`;
    return `${s}${Math.round(a).toLocaleString('es-MX')}`;
  }
  const ADD = (k) => !['conversionRate', 'aov'].includes(k);

  function statusOf(run, k) {
    const a = run.total.annual, td = a.toDate[k];
    if (!td || !fin(td.compliance)) return 'insufficient_data';
    return a.pacingStatus && k === 'revenue' ? a.pacingStatus : FP.gap.pacingStatus(td.compliance, run.settings.pacingThresholds);
  }

  function confidence(state, run, k) {
    try {
      const r = k === 'revenue' && FP.forecastConfidence ? FP.forecastConfidence.assess({ run, channel: 'total', period: { type: 'year', key: String(state.year) }, advisor: FP.methodAdvisor }) : null;
      return r && r.status === 'ok' ? r : null;
    } catch (e) { return null; }
  }

  /** Forecast anual de cada método (total digital) para la métrica elegida. */
  function methods(run, k) {
    const cmp = run.comparison && run.comparison.total ? run.comparison.total : {};
    return Object.keys(run.settings.methods).map((id) => {
      const m = cmp[id], v = m && m.forecast ? m.forecast[k] : null;
      return fin(v) ? { id, label: run.settings.methods[id].label, value: v } : null;
    }).filter(Boolean);
  }

  function build(state) {
    const run = state.fc.run, k = state.fc.metric, C = CFG(), a = run.total.annual, td = a.toDate[k], fg = a.forecastGap[k];
    const th = run.settings.pacingThresholds, st = statusOf(run, k), ok = st !== 'insufficient_data';
    const plan = a.plan[k], fc = a.forecast ? a.forecast[k] : null, add = ADD(k);
    const goalW = add ? 'la meta del año' : 'el plan del año';
    const conf = confidence(state, run, k);
    const miss = a.missingActualDays || 0;

    /* ---- veredicto ---- */
    let verdict;
    if (!ok) verdict = `Todavía no hay datos suficientes para evaluar el pacing${miss ? `: faltan ${miss.toLocaleString('es-MX')} días con venta real` : ''}.`;
    else if (!fin(fc) || !fin(fg.gap)) verdict = `Vas al ${PCT(td.compliance)} del plan a la fecha; todavía no hay un forecast de cierre para esta métrica.`;
    else if (st === 'on_plan') verdict = `Vas en plan: al ritmo actual cierras el año en ${fmt(k, fc)}, en línea con ${goalW} (${fmt(k, plan)}).`;
    else if (st === 'above') verdict = `Vas arriba del plan: al ritmo actual cierras en ${fmt(k, fc)}, ${fmt(k, Math.abs(fg.gap))} (${PCT(Math.abs(fg.gapPct))}) por encima de ${goalW}.`;
    else verdict = `Al ritmo actual no llegas a ${goalW}: cierras en ${fmt(k, fc)}, ${fmt(k, Math.abs(fg.gap))} (${PCT(Math.abs(fg.gapPct))}) por debajo.`;

    /* ---- etiquetas ---- */
    const chips = [];
    if (conf) chips.push([conf.level === 'alta' ? 'ok' : 'warn', `● Confianza del cierre: ${conf.label.toLowerCase()}`, 'Qué tan sólida es la base de la estimación, no la probabilidad de acertar. Combina historia, estabilidad de los últimos 7 días y separación entre métodos.']);
    chips.push([miss ? 'warn' : 'ok', miss ? `◐ ${miss.toLocaleString('es-MX')} días cerrados sin real` : `● ${a.countedDays} días con real`, 'Los días pasados sin venta real no entran al pacing y se proyectan con el método.']);
    chips.push(['mu', `● Método ${run.method.id} · ${run.method.label}`, 'El forecast suma al actual la proyección de los días restantes con el método elegido.']);
    chips.push(['mu', run.plan.source === 'original_distributed_plan' ? '● Plan original congelado' : `● ${run.plan.label}`, 'Plan, actual y forecast son estados separados: el forecast nunca modifica el plan.']);

    /* ---- piezas para las filas ---- */
    const chans = FP.config.channelIds.map((ch) => { const s = run.channels[ch].annual, t = s.toDate[k]; return { ch, label: chName(ch), gap: t.gap, comp: t.compliance, planTd: s.planToDate && s.planToDate[k] }; }).filter((x) => fin(x.gap));
    const neg = chans.filter((x) => x.gap < 0).sort((x, y) => x.gap - y.gap), negSum = neg.reduce((s, x) => s + x.gap, 0);
    const above = chans.filter((x) => fin(x.comp) && x.comp >= th.aboveFrom);
    const ms = methods(run, k), hi = ms.length ? ms.reduce((x, y) => (y.value > x.value ? y : x)) : null, lo = ms.length ? ms.reduce((x, y) => (y.value < x.value ? y : x)) : null;
    const spread = hi && lo && fin(plan) && plan !== 0 ? (hi.value - lo.value) / Math.abs(plan) : null;
    const cur = (run.total.months || []).find((m) => m.status === 'current');
    let goalTxt = '';
    try {
      if (add && FP.forecastEngine && FP.forecastEngine.periodGoal) {
        const g = FP.forecastEngine.periodGoal(run.total, { type: 'year' }, { cutoff: run.cutoff, metric: k });
        goalTxt = g.status === 'projected' && g.date ? `La meta anual se alcanzaría el ${FP.forecastEngine.longDay(g.date)} (estimado).` : g.status === 'reached' ? 'La meta anual ya se alcanzó.' : g.status === 'not_reached' && fin(g.attainment) ? `La meta anual no se alcanza: llega a ${Math.round(g.attainment * 100)} %.` : '';
      }
    } catch (e) { goalTxt = ''; }
    const alerts = run.alerts || [], byCat = {};
    alerts.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + 1; });
    const CATN = { risk: 'riesgo', data: 'faltan datos', above: 'por encima del plan', improving: 'mejora', trend: 'tendencia' };
    const idx28 = run.total.indices && run.total.indices.last28 && run.total.indices.last28[k];
    const cal = (() => { try { const CAL = FP.forecastCalibration, cs = state.cal, an = conf && CAL && cs ? CAL.analysisOf(cs.saved, cs.cache && cs.cache.samples) : null, ph = an && an.months >= CAL.MIN_MONTHS ? CAL.phrase(an, conf.level) : null; return ph ? `${ph.text} Se midió con cierres de mes, no con el cierre anual.` : ''; } catch (e) { return ''; } })();

    /* ---- resumen general ---- */
    const S = [];
    const stTxt = { above: 'arriba del plan', on_plan: 'en plan', below: 'debajo del plan' }[st];
    if (ok) {
      S.push(['Ritmo', `${B(PCT(td.compliance))} de cumplimiento a la fecha (${fmt(k, td.gap, true)} contra el plan de los mismos días): ${stTxt}.`,
        `${B(PCT(td.compliance))} de cumplimiento a la fecha: actual ${fmt(k, a.actualToDate && a.actualToDate[k])} contra plan de los mismos días ${fmt(k, a.planToDate && a.planToDate[k])} (${fmt(k, td.gap, true)}). ${idx28 && idx28.status === 'ok' && fin(idx28.value) ? `Los últimos 28 días rinden ${PCT(idx28.value)} del plan${Math.abs(idx28.value - td.compliance) >= C.recentDiff ? `, ${idx28.value < td.compliance ? 'peor' : 'mejor'} que el acumulado.` : ', como el acumulado.'}` : ''}`.trim()]);
      if (fin(fc) && fin(fg.gap)) S.push(['Cierre', `El forecast (método ${run.method.id}) cierra en ${B(fmt(k, fc))}: ${fmt(k, fg.gap, true)} (${spc(fg.gapPct)}) contra ${add ? 'la meta' : 'el plan'}${conf ? `; confianza ${conf.label.toLowerCase()}` : ''}.`,
        `El forecast de cierre (método ${run.method.id} · ${run.method.label}) es ${fmt(k, fc)} contra ${goalW} de ${fmt(k, plan)}: ${fmt(k, fg.gap, true)} (${spc(fg.gapPct)}).${conf ? ` Confianza del cierre: ${conf.label.toLowerCase()}.` : ''}${cal ? ` ${cal}` : ''}`]);
    }
    if (ok && add && neg.length && st !== 'on_plan' && st !== 'above' && negSum < 0) {
      const top = neg.filter((x) => Math.abs(x.gap) / Math.abs(negSum) >= C.channelShare).slice(0, 2);
      if (top.length) S.push(['Canal', `${top.map((x) => B(x.label)).join(' y ')} ${top.length > 1 ? 'explican' : 'explica'} ${Math.round(top.reduce((s, x) => s + Math.abs(x.gap), 0) / Math.abs(negSum) * 100)} % del gap a la fecha${above.length ? `; ${above.map((x) => x.label).join(' y ')} va arriba del plan.` : '.'}`,
        `${top.map((x) => `${B(x.label)} ${fmt(k, x.gap, true)}`).join(', ')} de los ${fmt(k, negSum, true)} que restan los canales por debajo del plan.${above.length ? ` ${above.map((x) => x.label).join(' y ')} va arriba del plan (cumplimiento ≥ ${Math.round(th.aboveFrom * 100)} %).` : ''}`]);
    }
    if (ok && ms.length > 1 && spread !== null) {
      const near = spread <= C.methodsSpread;
      S.push(['Métodos', near ? `Los ${ms.length} métodos cierran entre ${fmt(k, lo.value)} y ${fmt(k, hi.value)}: la lectura no depende del método.` : `Los ${ms.length} métodos difieren ${fmt(k, hi.value - lo.value)} (${PCT(spread)} del plan): el método importa. ${hi.id} es el más alto y ${lo.id} el más bajo.`,
        `Los ${ms.length} métodos cierran entre ${fmt(k, lo.value)} (${lo.id} · ${lo.label}) y ${fmt(k, hi.value)} (${hi.id} · ${hi.label}), una separación de ${PCT(spread)} del plan. ${near ? 'Ningún método se declara «mejor».' : 'Cada método supone algo distinto sobre los días que faltan; esa diferencia es información, no un error.'}`]);
    }
    if (ok && cur) {
      const mi = +cur.key.slice(5, 7) - 1;
      S.push(['Mes en curso', `${cap1(MESF[mi])}: ${cur.countedDays} de ${cur.days} días; cierra en ${fmt(k, cur.forecast[k])} contra plan de ${fmt(k, cur.plan[k])} (${spc(cur.forecastGap[k].gapPct)}).`,
        `${cap1(MESF[mi])} lleva ${cur.countedDays} de ${cur.days} días con real. Cierra en ${fmt(k, cur.forecast[k])} (actual acumulado + forecast de los días restantes) contra un plan de ${fmt(k, cur.plan[k])}. ${goalTxt}`.trim()]);
    }
    if (alerts.length) {
      const names = Object.keys(byCat).map((c) => CATN[c] || 'atención');
      S.push(['Alertas', `${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}: ${names.join(', ')}.`, `${alerts.slice(0, 4).map((x) => x.message).join(' ')}${alerts.length > 4 ? ` Y ${alerts.length - 4} más.` : ''}`]);
    }
    const w = [], wl = [];
    if (miss) { w.push(`${miss.toLocaleString('es-MX')} días cerrados sin real`); wl.push(`${miss.toLocaleString('es-MX')} días cerrados no tienen venta real y no entran al pacing; el forecast los proyecta con el método`); }
    if (conf && conf.level === 'baja') { w.push('Confianza del cierre baja'); wl.push('Con confianza baja el cierre estimado es orientativo; conviene cargar el real que falta'); }
    if (w.length) S.push(['Ojo', `${w.join('. ')}.`, `${wl.join('. ')}.`]);
    const ORD = ['Ritmo', 'Cierre', 'Canal', 'Métodos', 'Mes en curso', 'Alertas', 'Ojo'];
    S.sort((x, y) => ORD.indexOf(x[0]) - ORD.indexOf(y[0]));

    /* ---- una línea de lectura por sección ---- */
    const L = { g: '', c: '', f: '', a: '' };
    if (ok) L.g = td.compliance < th.onPlanFrom ? `El real va ${B(PCT(1 - td.compliance))} por debajo del plan de los mismos días${fin(fg.gap) && fg.gap < 0 ? ' y el forecast no lo recupera.' : '.'}` : td.compliance >= th.aboveFrom ? 'El real va por encima del plan de los mismos días.' : 'El real sigue al plan de los mismos días.';
    if (ok && add && neg.length && st === 'below') L.c = `${B(neg[0].label)} resta ${B(fmt(k, neg[0].gap, true))} al gap a la fecha, el mayor entre los canales.`;
    if (ok && hi && lo && spread !== null && spread > C.methodsSpread) L.f = `${B(`Método ${hi.id}`)} es el más alto y ${B(`${lo.id}`)} el más bajo; los demás proyectan el desempeño que se observa.`;
    if (alerts.length) L.a = `${B(`${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}`)} con los umbrales actuales; ninguna explica la causa.`;

    return { verdict, chips, rows: S, lec: L, status: st, ok, actions: actions(state, run, k, st, fg) };
  }

  /** «¿Qué hago con esto?»: qué destinos están disponibles ahora y por qué no, si no lo están. */
  function actions(state, run, k, st, fg) {
    const gapOk = st !== 'insufficient_data' && fg && fin(fg.gap);
    const ch = state.fc.channel || 'total';
    const rec = !gapOk ? { why: 'Faltan datos para estimar el gap de cierre.' } : k !== 'revenue' ? { why: 'Recuperar trabaja con la venta: cambia la métrica a Venta.' } : !(fg.gap < 0) ? { why: 'No hay un gap forecast por recuperar.' } : { channel: ch };
    return { diag: gapOk ? { channel: ch } : { why: 'Faltan datos para estimar el gap de cierre.' }, recovery: rec, version: { next: state.fc.registry ? state.fc.registry.versions.length + 1 : 1 } };
  }

  FP.pcResumen = { build, fmt, statusOf, actions };
})(typeof window !== 'undefined' ? window : globalThis);
