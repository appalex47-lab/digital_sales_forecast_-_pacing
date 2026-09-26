/**
 * explain.js — Trazabilidad pedagógica (Fase 9.1): "¿Por qué este número?" y "¿Qué significa?".
 *
 * Extiende el sistema de ayuda de Fase 7 (usa el mismo panel lateral de FP.help). No calcula nada nuevo:
 * lee la corrida real del motor (forecast de Fase 3, reforecast de Fase 4) y la recompone en pasos legibles.
 * Cada explicación incluye una verificación: si la suma de los componentes no coincide con la cifra del
 * motor, se muestra la diferencia en lugar de ocultarla.
 *
 * Separación explícita:
 *   ¿Cómo se calculó?  → pasos con cifras reales del motor (why*)
 *   ¿Qué significa?    → lectura del resultado (meaning*)
 *   ¿Qué NO significa? → límites (tomados de HELP)
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const TOL = 0.01;

  /* ---------- Terminología del negocio (Fase 8.2) ---------- */

  const DEFAULT_TERMS = { sale: 'venta', order: 'pedido', customer: 'cliente', product: 'producto', location: 'sucursal' };
  /** Términos activos: los del Business Context si existen; si no, los de siempre. */
  function terms() {
    const b = C() && C().business;
    return { ...DEFAULT_TERMS, ...((b && b.terms) || {}) };
  }
  /** Reemplaza {{sale}}, {{order}}, {{customer}}, {{product}}, {{location}} (y plurales {{orders}}…) por la terminología. */
  function term(text, override = null) {
    if (!text) return text;
    const t = override ? { ...DEFAULT_TERMS, ...override } : terms();
    return String(text).replace(/\{\{(sale|order|customer|product|location)(s?)\}\}/g, (m, k, pl) => (pl ? plural(t[k]) : t[k]));
  }
  function plural(w) { return /[aeiouáéíóú]$/i.test(w) ? `${w}s` : /z$/i.test(w) ? `${w.slice(0, -1)}ces` : `${w}es`; }

  /* ---------- Selección de serie y periodo ---------- */

  function series(run, channel) { return channel === 'total' || !channel ? run.total : run.channels[channel]; }
  /** Resumen del periodo: 'year' (o null) = anual; 'YYYY-MM' = ese mes. Mismos objetos que usan las vistas. */
  function summary(run, channel, periodKey) {
    const s = series(run, channel);
    if (periodKey && /^\d{4}-\d{2}$/.test(periodKey)) return s.months[+periodKey.slice(5, 7) - 1];
    return s.annual;
  }
  function daysOf(run, channel, p) { return series(run, channel).days.filter((d) => d.date >= p.firstDate && d.date <= p.lastDate); }
  const sum = (list, k) => list.reduce((a, d) => a + (d && fin(d[k]) ? d[k] : 0), 0);
  const money = (v) => (fin(v) ? F().currency(v, 0) : '—');
  const pct = (v, d = 1) => (fin(v) ? F().percent(v, d) : '—');
  const spct = (v, d = 1) => (fin(v) ? F().signedPercent(v, d) : '—');
  const val = (k, v) => (fin(v) ? F().metric(k, v) : '—');

  /** Índices que usó cada canal según su método (de run.channels[ch].assumptions: la fuente del motor). */
  function methodIndices(run, channel) {
    const chs = channel === 'total' || !channel ? C().channelIds : [channel];
    return chs.map((ch) => {
      const a = run.channels[ch].assumptions || {};
      const list = Object.entries(a.indices || {}).map(([m, i]) => ({ metric: m, window: i.windowLabel || i.window, value: i.value, status: i.status }));
      return { channel: ch, label: FP.dataModel.getChannel(ch).label, indices: list, fallbackDays: run.channels[ch].fallbackDays || 0 };
    });
  }

  /* ---------- ¿Por qué este forecast? ---------- */

  /**
   * Recompone el forecast del periodo: actual de los días contados + proyección de los días restantes.
   * @returns { steps[], check, method, indices, meaning, ... }
   */
  function whyForecast({ run, channel = 'total', periodKey = null, metric = 'revenue' }) {
    const p = summary(run, channel, periodKey);
    const days = daysOf(run, channel, p);
    const counted = days.filter((d) => d.counted), rest = days.filter((d) => !d.counted);
    const additive = C().additiveMetricKeys.includes(metric);
    const actual = additive ? sum(counted.map((d) => d.actual), metric) : null;
    const projected = additive ? sum(rest.map((d) => d.forecast), metric) : null;
    const planRest = additive ? sum(rest.map((d) => d.plan), metric) : null;
    const engine = p.forecast ? p.forecast[metric] : null;
    const composed = additive ? actual + projected : null;
    const m = run.method;
    const steps = additive ? [
      { label: `Actual de ${counted.length} días contados (hasta ${run.cutoff || '—'})`, value: val(metric, actual), kind: 'actual' },
      { label: `+ Proyección de ${rest.length} días restantes con el método ${m.id} · ${m.label}`, value: val(metric, projected), kind: 'forecast' },
      { label: '= Forecast del periodo', value: val(metric, engine), kind: 'forecast', total: true }
    ] : [
      { label: `${C().metrics[metric].label} se recalcula de las sumas del forecast (no se promedia)`, value: val(metric, engine), kind: 'forecast', total: true }
    ];
    const ratio = additive && planRest ? projected / planRest : null;
    return {
      kind: 'forecast', title: `¿Por qué este forecast? · ${C().metrics[metric].label}`,
      steps,
      method: { id: m.id, label: m.label, description: m.description },
      planRemaining: planRest, projectionVsPlan: ratio,
      indices: methodIndices(run, channel),
      check: additive ? { engine, composed, ok: fin(engine) && fin(composed) && Math.abs(engine - composed) <= TOL * Math.max(1, Math.abs(engine) / 1e6) } : null,
      howComputed: `${m.description} El patrón de cada día viene del plan diario; nunca se reparte "lo que falta ÷ días que faltan".`,
      meaning: meaningForecast({ engine, plan: p.plan ? p.plan[metric] : null, metric, ratio, method: m }),
      doesNotMean: 'No es la meta ni una promesa: si el comportamiento de referencia cambia, el cierre cambia.'
    };
  }

  function meaningForecast({ engine, plan, metric, ratio, method }) {
    const parts = [];
    parts.push(`Si el comportamiento que usa el método ${method.id} (${method.label.toLowerCase()}) se mantiene, el cierre sería de aproximadamente ${val(metric, engine)}.`);
    if (fin(plan) && plan) parts.push(`Eso es ${spct(engine / plan - 1)} contra la meta del periodo (${val(metric, plan)}).`);
    if (fin(ratio)) parts.push(ratio === 1 ? 'Los días restantes se proyectan exactamente como su plan.'
      : `Los días restantes se proyectan ${spct(ratio - 1)} contra su propio plan.`);
    return parts.join(' ');
  }

  /* ---------- ¿Por qué este gap / cumplimiento? ---------- */

  function whyGap({ run, channel = 'total', periodKey = null, metric = 'revenue' }) {
    const p = summary(run, channel, periodKey);
    const a = p.actualToDate ? p.actualToDate[metric] : null, pl = p.planToDate ? p.planToDate[metric] : null;
    const td = p.toDate ? p.toDate[metric] : null;
    const gap = td ? td.gap : null;
    return {
      kind: 'gap', title: `¿Por qué este gap? · ${C().metrics[metric].label}`,
      steps: [
        { label: `Actual de los ${p.countedDays || 0} días contados`, value: val(metric, a), kind: 'actual' },
        { label: '− Plan de esos mismos días (plan diario ponderado)', value: val(metric, pl), kind: 'plan' },
        { label: '= Gap a la fecha', value: FP.pacingView ? FP.pacingView.signed(metric, gap) : val(metric, gap), total: true }
      ],
      check: fin(a) && fin(pl) && fin(gap) ? { engine: gap, composed: a - pl, ok: Math.abs(gap - (a - pl)) <= TOL } : null,
      howComputed: 'Solo cuentan los días con real hasta la fecha de corte; el plan de esos días sale del plan diario, no de "días transcurridos ÷ días totales".',
      meaning: fin(gap) ? `El desempeño acumulado está ${val(metric, Math.abs(gap))} ${gap < 0 ? 'por debajo' : 'por encima'} del plan correspondiente a los días analizados${td && fin(td.gapPct) ? ` (${spct(td.gapPct)})` : ''}.` : 'Todavía no hay días con real en este periodo.',
      doesNotMean: 'No es el gap al cierre (eso es el gap forecast) ni explica por qué ocurrió: para eso está el diagnóstico.'
    };
  }

  function whyCompliance({ run, channel = 'total', periodKey = null, metric = 'revenue' }) {
    const p = summary(run, channel, periodKey);
    const a = p.actualToDate ? p.actualToDate[metric] : null, pl = p.planToDate ? p.planToDate[metric] : null;
    const c = p.toDate && p.toDate[metric] ? p.toDate[metric].compliance : null;
    const th = run.settings.pacingThresholds || {};
    return {
      kind: 'compliance', title: '¿Por qué este cumplimiento?',
      steps: [
        { label: 'Actual a la fecha', value: val(metric, a), kind: 'actual' },
        { label: '÷ Plan de los mismos días', value: val(metric, pl), kind: 'plan' },
        { label: '= Cumplimiento', value: pct(c), total: true }
      ],
      check: fin(a) && fin(pl) && pl && fin(c) ? { engine: c, composed: a / pl, ok: Math.abs(c - a / pl) < 1e-9 } : null,
      howComputed: `El estado (en línea, en riesgo, debajo) es solo matemático, con los umbrales de Parámetros${fin(th.onPlanFrom) ? ` (en línea desde ${pct(th.onPlanFrom, 0)}; arriba desde ${pct(th.aboveFrom, 0)})` : ''}.`,
      meaning: fin(c) ? `Por cada 100 de plan a la fecha se lograron ${(c * 100).toFixed(1)}.` : 'Sin días con real todavía.',
      doesNotMean: 'Un día aislado debajo del plan no indica una caída estructural.'
    };
  }

  function whyForecastGap({ run, channel = 'total', periodKey = null, metric = 'revenue' }) {
    const p = summary(run, channel, periodKey);
    const fc = p.forecast ? p.forecast[metric] : null, meta = p.plan ? p.plan[metric] : null, g = p.forecastGap ? p.forecastGap[metric] : null;
    return {
      kind: 'forecastGap', title: '¿Por qué este gap forecast?',
      steps: [
        { label: `Forecast del periodo (método ${run.method.id})`, value: val(metric, fc), kind: 'forecast' },
        { label: '− Meta del periodo', value: val(metric, meta), kind: 'plan' },
        { label: '= Gap forecast', value: FP.pacingView ? FP.pacingView.signed(metric, g && g.gap) : val(metric, g && g.gap), total: true }
      ],
      check: fin(fc) && fin(meta) && g && fin(g.gap) ? { engine: g.gap, composed: fc - meta, ok: Math.abs(g.gap - (fc - meta)) <= TOL } : null,
      howComputed: 'Depende del método de forecast elegido; cambiar de método cambia esta cifra, no los datos.',
      meaning: g && fin(g.gap) ? `Si el comportamiento proyectado se mantiene, se cerraría ${val(metric, Math.abs(g.gap))} ${g.gap < 0 ? 'por debajo' : 'por encima'} de la meta.` : '—',
      doesNotMean: 'No es una pérdida confirmada: es la diferencia proyectada con el método en uso.'
    };
  }

  /** Venta = volumen × CR × AOV con las cifras reales de un bloque (identidad del modelo). */
  function whyIdentity(block) {
    const b = block || {};
    const v = b.trafficVolume, cr = b.conversionRate, aov = b.aov, rev = b.revenue;
    const composed = fin(v) && fin(cr) && fin(aov) ? FP.metrics.calculateRevenue(FP.metrics.calculateOrders(v, cr), aov) : null;
    return {
      kind: 'identity', title: term('¿Por qué esta {{sale}}? · Volumen × CR × AOV'),
      steps: [
        { label: 'Volumen', value: val('trafficVolume', v) },
        { label: '× CR (pedidos ÷ volumen)', value: pct(cr, 2) },
        { label: '× AOV (venta ÷ pedidos)', value: money(aov) },
        { label: term('= {{sale}}'), value: money(rev), total: true }
      ],
      check: fin(rev) && fin(composed) ? { engine: rev, composed, ok: Math.abs(rev - composed) <= Math.max(TOL, Math.abs(rev) * 1e-9) } : null,
      howComputed: 'Es una identidad: los tres drivers reconstruyen la venta. Si uno cambia y los otros no, la venta cambia en la misma proporción.',
      meaning: 'Sirve para saber qué palanca movió el resultado. El diagnóstico reparte la brecha entre los tres drivers.',
      doesNotMean: 'Que un driver explique más matemáticamente no significa que sea la causa operativa.'
    };
  }

  /* ---------- ¿Por qué este reforecast? ---------- */

  function whyReforecast({ rf, channel = 'total' }) {
    const s = channel === 'total' || !channel ? rf.total : rf.channels[channel];
    const h = s.horizon || {};
    const pr = s.horizonSummary && s.horizonSummary.pressure ? s.horizonSummary.pressure.revenue.pressure : null;
    return {
      kind: 'reforecast', title: '¿Por qué este requerimiento?',
      steps: [
        { label: `Meta del horizonte (${h.key || h.type || '—'})`, value: money(h.target), kind: 'plan' },
        { label: '− Actual acumulado', value: money(h.actualToDate), kind: 'actual' },
        { label: '= Pendiente', value: money(h.remaining) },
        { label: `Repartido en ${h.futureDays || 0} días futuros con los pesos del plan`, value: money(h.requiredTotal), kind: 'reforecast', total: true }
      ],
      check: fin(h.target) && fin(h.actualToDate) && fin(h.remaining) ? { engine: h.remaining, composed: Math.max(0, h.target - h.actualToDate), ok: Math.abs(h.remaining - Math.max(0, h.target - h.actualToDate)) <= TOL } : null,
      howComputed: 'Los días con real quedan congelados; lo que falta se reparte con la estacionalidad del plan, no en partes iguales.',
      meaning: fin(pr) ? `Los días restantes tendrían que producir ${spct(pr)} contra su plan original para conservar la meta.` : 'No hay días futuros en el horizonte.',
      doesNotMean: 'No es un pronóstico de lo que ocurrirá (eso es el forecast): es lo que haría falta.'
    };
  }

  const WHY = { forecast: whyForecast, gap: whyGap, compliance: whyCompliance, forecastGap: whyForecastGap };

  /* ---------- Render en el panel de ayuda existente ---------- */

  function renderExplanation(x) {
    const esc = FP.ui.helpers.esc;
    const tag = (k) => (k && FP.help ? FP.help.stateTag(k) : '');
    return `<article class="help-entry why">
      <h3>¿Cómo se calculó?</h3>
      <ol class="why-steps">${x.steps.map((s) => `<li class="${s.total ? 'is-total' : ''}"><span>${tag(s.kind)} ${esc(s.label)}</span><strong class="num">${esc(s.value)}</strong></li>`).join('')}</ol>
      ${x.check ? `<p class="field__hint">${x.check.ok ? '✓ La suma de los pasos coincide con la cifra del motor.' : `⚠ Los pasos suman ${esc(String(x.check.composed))} y el motor reporta ${esc(String(x.check.engine))}; la diferencia se muestra, no se oculta.`}</p>` : ''}
      <p>${esc(x.howComputed)}</p>
      ${x.method ? `<p class="field__hint">Método ${esc(x.method.id)} · ${esc(x.method.label)}: ${esc(x.method.description)}</p>` : ''}
      ${x.indices && x.indices.some((c) => c.indices.length) ? `<details class="disclosure"><summary>Índices que usó el motor</summary><ul class="plain-list">${x.indices.map((c) => `<li><strong>${esc(c.label)}</strong>: ${c.indices.length ? c.indices.map((i) => `${esc(C().metrics[i.metric] ? C().metrics[i.metric].label : i.metric)} × ${fin(i.value) ? i.value.toFixed(3) : 'sin datos (usa plan)'} (${esc(i.window || '')})`).join(' · ') : 'sin índices (plan)'}${c.fallbackDays ? ` · ${c.fallbackDays} días usan el plan por falta de datos` : ''}</li>`).join('')}</ul></details>` : ''}
      <h3>¿Qué significa?</h3><p>${esc(term(x.meaning))}</p>
      <h3>¿Qué NO significa?</h3><p>${esc(term(x.doesNotMean))}</p>
    </article>`;
  }

  /** Abre la explicación en el panel lateral de Fase 7. */
  function open(kind, state, { channel = 'total', periodKey = null, metric = 'revenue' } = {}) {
    let x = null;
    if (kind === 'reforecast' && state.rf && state.rf.run) x = whyReforecast({ rf: state.rf.run, channel });
    else if (kind === 'identity' && state.fc && state.fc.run) x = whyIdentity(summary(state.fc.run, channel, periodKey).actualToDate);
    else if (WHY[kind] && state.fc && state.fc.run) x = WHY[kind]({ run: state.fc.run, channel, periodKey, metric });
    if (!x) { FP.help.openPanel('¿Por qué?', '<p class="note">Todavía no hay cálculo para explicar: carga el plan y la venta real primero.</p>'); return null; }
    FP.help.openPanel(x.title, renderExplanation(x));
    return x;
  }

  /** Botón "¿Por qué?" (sin lógica propia: solo datos para la acción). */
  function whyButton(kind, { channel = 'total', periodKey = '', metric = 'revenue' } = {}) {
    return `<button type="button" class="why-link" data-action="why" data-kind="${kind}" data-channel="${channel}" data-period="${periodKey || ''}" data-metric="${metric}">¿Por qué?</button>`;
  }

  FP.explain = { terms, term, summary, methodIndices, whyForecast, whyGap, whyCompliance, whyForecastGap, whyIdentity, whyReforecast, renderExplanation, open, whyButton, DEFAULT_TERMS };
})(typeof window !== 'undefined' ? window : globalThis);
