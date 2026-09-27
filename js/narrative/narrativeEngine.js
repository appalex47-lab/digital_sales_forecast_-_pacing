/**
 * narrativeEngine.js — Narrativa ejecutiva (Fase 9.2).
 *
 *   DATOS → CÁLCULOS DETERMINÍSTICOS → DIAGNÓSTICOS → SEÑALES → HIPÓTESIS → NARRATIVA
 *
 * Esta capa NO calcula nada nuevo. Ensambla en un objeto trazable, con nivel de certeza y fuente,
 * las frases que YA arman los motores existentes:
 *   - performance: `run.total.annual` / `run.channels[ch].annual` (Fase 3, mismo objeto que Pacing).
 *   - drivers/señales/hipótesis: `diag.level1`, `diag.level1Drivers`, `diag.signals`, `diag.hypotheses`
 *     (Fase 5 — `diag.signals[].evidence` y `diag.hypotheses[].hypothesis` ya vienen redactados y
 *     validados por signalEngine/hypothesisEngine; aquí solo se citan).
 *   - producto/geografía: `pa.rows`, `pa.compensation`, `pa.geoSignals[].label` (Fase 8.1.1/8.4 —
 *     la geografía se cita solo si `pa` existe; nunca se mezcla con el diagnóstico general).
 *   - recuperación: `rf.total`/`rf.channels[ch]` (Fase 4) y `rcAnalysis` (Fase 6, opcional).
 *   - siguiente paso: `FP.contextEngine.getNextStep` (Fase 7) — no hay un segundo motor de "qué hacer".
 *   - terminología: `FP.explain.term` (Fase 8.2/9.1) — mismo mecanismo `{{sale}}` de toda la app.
 *
 * Niveles de certeza (nunca se mezclan):
 *   hecho      Nivel 1 — dato observado.
 *   calculo    Nivel 2 — resultado del motor determinístico (gap, forecast, requerido).
 *   driver     Nivel 3 — atribución matemática (volumen/CR/AOV).
 *   senal      Nivel 4 — patrón que amerita investigación (incluye geografía de producto).
 *   hipotesis  Nivel 5 — explicación posible, siempre "podría"/"es consistente con".
 *   accion     Nivel 6 — siguiente paso o acción, nunca una promesa de resultado.
 *
 * Cada afirmación (`claim`) trae su `source` (qué motor y qué campo la produjo) y la lista de números
 * que cita, para dos cosas: el panel "¿Por qué dices eso?" en la UI, y la validación anti-alucinación
 * de la respuesta de Cohere (cohereNarrative.js): ningún número en el texto de la IA puede faltar en
 * esta lista.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const term = (s) => (FP.explain ? FP.explain.term(s) : s);

  const SCHEMA_VERSION = 1;
  const LEVELS = ['hecho', 'calculo', 'driver', 'senal', 'hipotesis', 'accion'];

  /* ======================= Utilidades de formato y números citados ======================= */

  const money = (v) => (fin(v) ? F().currency(v, 0) : null);
  const pct = (v, d = 1) => (fin(v) ? F().percent(v, d) : null);
  const spct = (v, d = 1) => (fin(v) ? F().signedPercent(v, d) : null);
  const int = (v) => (fin(v) ? F().integer(v) : null);

  /** Extrae los números que aparecen literalmente en un texto ya formateado (para el registro de citas). */
  function numbersIn(text) {
    if (!text) return [];
    const out = [];
    const re = /-?\$?\d[\d,]*(?:\.\d+)?\s?%?/g;
    let m;
    while ((m = re.exec(text))) { const n = m[0].replace(/[^0-9.-]/g, ''); if (n && n !== '-' && n !== '.') out.push(n); }
    return out;
  }

  let seq = 0;
  /** Construye una afirmación citable. `numbers` explícitos + los detectados en el texto. */
  function claim(level, text, source, numbers = []) {
    if (!LEVELS.includes(level)) throw new Error(`Nivel de certeza desconocido: ${level}`);
    return { id: `c${++seq}`, level, text, source: source || null, numbers: [...new Set([...numbers, ...numbersIn(text)])] };
  }

  /* ======================= Ready to narrate ======================= */

  /**
   * Qué secciones tienen suficiente información. Ninguna es obligatoria salvo `performance`
   * (sin un forecast corrido no hay nada que narrar). No inventa lo que falta.
   */
  function readyToNarrate({ run, rf, diag, pa, rcAnalysis } = {}) {
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const hasPerformance = Boolean(run && run.plan && run.plan.source !== 'none' && run.total && run.total.annual
      && run.total.annual.actualToDate && fin(run.total.annual.actualToDate.revenue));
    return {
      performance: hasPerformance,
      forecast: Boolean(hasPerformance && run.total.annual.forecast),
      diagnosis: Boolean(diag && diag.status === 'ok'),
      signals: Boolean(diag && diag.status === 'ok' && diag.signals && diag.signals.length),
      hypotheses: Boolean(diag && diag.status === 'ok' && diag.hypotheses && diag.hypotheses.length),
      productAnalysis: Boolean(pa && pa.rows && pa.rows.length),
      recovery: Boolean((rf && rf.total && rf.total.horizonSummary) || (diag && diag.recovery)),
      scenarios: Boolean(rcAnalysis && rcAnalysis.scenarios && rcAnalysis.scenarios.length)
    };
  }

  /** Mensajes informativos para secciones sin datos suficientes (nunca "sin datos" a secas). */
  const EMPTY = {
    performance: 'Todavía no hay un forecast calculado para este periodo: hace falta un plan guardado o importado y venta real cargada.',
    forecast: 'Aún no existe un forecast disponible para este periodo.',
    diagnosis: 'El desempeño está disponible, pero todavía no existe un diagnóstico suficiente para explicar matemáticamente la brecha (revisa el periodo, el canal o la comparación elegidos).',
    signals: 'No se identificaron señales suficientes con los datos y umbrales disponibles.',
    hypotheses: 'Hay señales, pero ninguna con evidencia localizada suficiente para formular una hipótesis todavía.',
    productAnalysis: 'No hay datos de producto cargados para este periodo: la narrativa no incluye categoría, producto ni geografía.',
    recovery: 'No hay un reforecast o requerimiento de recuperación calculado para este periodo.',
    scenarios: 'No hay escenarios guardados: la narrativa no puede citar una simulación de recuperación.'
  };

  /* ======================= Sección: qué pasó / por qué importa (performance) ======================= */

  function performanceSection(run, channel, diag) {
    const s = channel === 'total' || !channel ? run.total : run.channels[channel];
    const a = s.annual;
    const src = (field) => ({ module: 'forecastEngine', field, run: `run.${channel === 'total' ? 'total' : `channels.${channel}`}.annual` });
    const claims = [];
    claims.push(claim('hecho', term(`La {{sale}} acumulada a la fecha es ${money(a.actualToDate ? a.actualToDate.revenue : null)}, contra un plan de ${money(a.plan.revenue)} para el año.`),
      src('actualToDate/plan')));
    if (a.toDate) claims.push(claim('calculo', `El cumplimiento a la fecha es ${pct(a.toDate.revenue.compliance)} (gap de ${money(a.toDate.revenue.gap)} contra el plan de los mismos días).`,
      src('toDate')));
    if (a.forecast) claims.push(claim('calculo', `El forecast de cierre proyecta ${money(a.forecast.revenue)}${a.forecastGap ? `, ${a.forecastGap.revenue.gap >= 0 ? 'por encima' : 'por debajo'} de la meta por ${money(Math.abs(a.forecastGap.revenue.gap))} (${spct(a.forecastGap.revenue.gap / a.plan.revenue)}).` : '.'}`,
      src('forecast/forecastGap')));
    if (diag && diag.status === 'ok' && ['actual_vs_previous', 'actual_vs_yoy'].includes(diag.comparison.id)) {
      claims.push(claim('hecho', `${diag.result.fact}`, { module: 'diagnosticEngine', field: 'result.fact' }));
    }
    return claims;
  }

  /* ======================= Sección: qué explica el resultado (drivers) ======================= */

  function driverSection(diag) {
    const claims = [];
    if (!diag || diag.status !== 'ok' || !diag.level1) return claims;
    claims.push(claim('driver', diag.level1.statement, { module: 'diagnosticEngine', field: 'level1.statement', method: diag.attributionMethod }));
    (diag.level1Drivers || []).forEach((d) => {
      claims.push(claim('driver', `${d.label}: contribución ${money(d.contribution)} (${spct(d.deltaPct)}).`,
        { module: 'diagnosticEngine', field: 'level1Drivers', driver: d.driver }));
    });
    return claims;
  }

  /* ======================= Sección: dónde está el comportamiento + señales ======================= */

  function signalSection(diag) {
    if (!diag || diag.status !== 'ok') return [];
    const order = { high: 0, medium: 1, low: 2 };
    return [...(diag.signals || [])].sort((a, b) => (order[a.relevance.priority] ?? 3) - (order[b.relevance.priority] ?? 3))
      .map((s) => claim('senal', s.evidence, { module: 'signalEngine', field: 'evidence', signalId: s.id, priority: s.relevance.priority }));
  }

  function hypothesisSection(diag) {
    if (!diag || diag.status !== 'ok') return [];
    return (diag.hypotheses || []).map((h) => claim('hipotesis', h.hypothesis, { module: 'hypothesisEngine', field: 'hypothesis', hypothesisId: h.id }));
  }

  /* ======================= Sección: producto y geografía (solo si hay datos de producto) ======================= */

  function productSection(pa) {
    if (!pa || !pa.rows || !pa.rows.length) return [];
    const claims = [];
    const t = pa.total;
    claims.push(claim('hecho', `En ${pa.level === 'category' ? 'categorías' : pa.level}, la venta del periodo (${pa.period.from} a ${pa.period.to}) es ${money(t.revenue.current)} contra ${money(t.revenue.baseline)} de la referencia (${pa.baseline.label}).`,
      { module: 'productAnalysis', field: 'total', level: pa.level }));
    const top = [...pa.rows].sort((a, b) => Math.abs(b.contributionAbs) - Math.abs(a.contributionAbs)).slice(0, 3);
    top.forEach((r) => claims.push(claim('senal', `${r.key}: ${r.status === 'growth' ? 'crece' : r.status === 'decline' ? 'cae' : 'estable'} ${spct(r.revenue.deltaPct)}, participación ${pct(r.share)}, contribución ${pct(r.contribution)} del cambio total.`,
      { module: 'productAnalysis', field: 'rows', key: r.key })));
    if (pa.compensation && pa.compensation.text) claims.push(claim('senal', pa.compensation.text, { module: 'productAnalysis', field: 'compensation' }));
    (pa.geoSignals || []).slice(0, 5).forEach((g) => claims.push(claim('senal', g.label, { module: 'productAnalysis', field: 'geoSignals', type: g.type })));
    return claims;
  }

  /* ======================= Sección: recuperación (reforecast + escenarios) ======================= */

  function recoverySection(rf, channel, rcAnalysis) {
    const claims = [];
    const s = rf && (channel === 'total' || !channel ? rf.total : rf.channels[channel]);
    if (s && s.horizon) {
      const h = s.horizon;
      claims.push(claim('calculo', `Para conservar la meta original, el horizonte ${h.type === 'year' ? 'anual' : 'del mes'} requiere ${money(h.requiredTotal)} en los ${h.futureDays} días futuros (pendiente de ${money(h.remaining)}).`,
        { module: 'reforecastEngine', field: 'horizon' }));
      const p = s.horizonSummary && s.horizonSummary.pressure ? s.horizonSummary.pressure.revenue.pressure : null;
      if (fin(p)) claims.push(claim('calculo', `Eso representa una presión de recuperación de ${spct(p)} contra el plan original de esos mismos días.`,
        { module: 'reforecastEngine', field: 'horizonSummary.pressure' }));
    }
    if (rcAnalysis && rcAnalysis.scenarios && rcAnalysis.scenarios.length) {
      const sc = rcAnalysis.scenarios[0];
      claims.push(claim('hipotesis', `Existe un escenario guardado (${sc.name}) con una venta incremental simulada de ${money(sc.expectedImpact ? sc.expectedImpact.incrementalValue : null)}; es una simulación, no una predicción ni un resultado garantizado.`,
        { module: 'scenarioEngine', field: 'scenarios', scenarioId: sc.scenarioId }));
    }
    return claims;
  }

  /* ======================= Siguiente paso (reutiliza Fase 7, no crea un segundo motor) ======================= */

  function nextStepSection(status) {
    if (!status || !FP.contextEngine) return [];
    const next = FP.contextEngine.getNextStep(status);
    if (!next) return [];
    return [claim('accion', `Siguiente paso: ${next.label}. ${next.reason || ''}`.trim(), { module: 'contextEngine', field: 'getNextStep', id: next.id })];
  }

  /* ======================= Resumen ejecutivo (compone, no inventa) ======================= */

  function summarize(sections, ready) {
    const parts = [];
    if (sections.performance.length) parts.push(sections.performance[0].text);
    const gapClaim = sections.performance.find((c) => c.level === 'calculo');
    if (gapClaim) parts.push(gapClaim.text);
    if (ready.diagnosis && sections.drivers.length) parts.push(sections.drivers[0].text);
    if (ready.signals && sections.signals.length) parts.push(`La señal de mayor prioridad: ${sections.signals[0].text}`);
    else if (ready.productAnalysis && sections.product.length > 1) parts.push(sections.product[1].text);
    if (sections.nextSteps.length) parts.push(sections.nextSteps[0].text);
    return parts.join(' ');
  }

  /* ======================= Construcción principal ======================= */

  /**
   * @param {object} sources { run, rf, diag, pa, rcAnalysis, status } — todo ya calculado por los motores
   *   existentes. `status` es el `collectStatus` de Fase 7 (para el siguiente paso). `channel`/`period`
   *   describen el alcance elegido (se leen de `diag` si existe; si no, del `run`).
   * @returns narrativa estructurada, con niveles de certeza y fuente en cada afirmación.
   */
  function build({ run, rf = null, diag = null, pa = null, rcAnalysis = null, status = null, channel = 'total' } = {}) {
    const ready = readyToNarrate({ run, rf, diag, pa, rcAnalysis });
    const sections = {
      performance: ready.performance ? performanceSection(run, channel, diag) : [],
      drivers: ready.diagnosis ? driverSection(diag) : [],
      signals: ready.signals ? signalSection(diag) : [],
      hypotheses: ready.hypotheses ? hypothesisSection(diag) : [],
      product: ready.productAnalysis ? productSection(pa) : [],
      recovery: (ready.recovery || ready.scenarios) ? recoverySection(rf, channel, rcAnalysis) : [],
      nextSteps: nextStepSection(status)
    };
    const executiveSummary = ready.performance ? summarize(sections, ready) : EMPTY.performance;
    const claims = [...sections.performance, ...sections.drivers, ...sections.signals, ...sections.hypotheses, ...sections.product, ...sections.recovery, ...sections.nextSteps];
    const business = C() && C().business;
    return {
      schema: 'narrative', schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(),
      period: diag ? diag.period : (run ? { type: 'year', key: String(run.year), label: `Año ${run.year}` } : null),
      channel: diag ? diag.channel : { id: channel, label: channel === 'total' ? 'Total digital' : FP.dataModel.getChannel(channel).label },
      comparison: diag ? diag.comparison : null,
      businessContext: business ? { name: business.name, configured: business.configured, terms: business.terms } : null,
      readyToNarrate: ready,
      executiveSummary: { text: executiveSummary, claims: ready.performance ? [sections.performance[0], ...(sections.performance[1] ? [sections.performance[1]] : [])].map((c) => c.id) : [] },
      sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, { claims: v.map((c) => c.id), empty: v.length ? null : (EMPTY[k === 'drivers' ? 'diagnosis' : k === 'product' ? 'productAnalysis' : k] || null) }])),
      claims,
      assumptions: diag ? diag.assumptions : null,
      note: 'Los drivers son atribución matemática, no causas. Las señales indican dónde investigar, no por qué. Las hipótesis requieren validación. El escenario es una simulación, no una predicción.'
    };
  }

  FP.narrativeEngine = { SCHEMA_VERSION, LEVELS, readyToNarrate, build, claim, numbersIn, EMPTY };
})(typeof window !== 'undefined' ? window : globalThis);
