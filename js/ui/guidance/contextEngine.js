/**
 * contextEngine.js — Motor de contexto y siguiente paso (Fase 7).
 *
 * Determinista y sin IA. NO calcula métricas de negocio: interpreta cifras que ya calcularon los
 * motores existentes (forecast, reforecast, diagnóstico, escenarios) y el estado de la app.
 *
 *   collectStatus(state)        → estado plano (solo lectura del estado de la app)
 *   getNextStep(status)         → { id, text, reason, view, priority }
 *   describe(view, status)      → { whereAmI, whatAmISeeing, whatDoesItMean, whatShouldIInvestigate, nextStep, availableActions }
 *   headline(status)            → frases descriptivas para Inicio (sin "scores")
 *   requirements(view, status)  → requisitos faltantes para estados vacíos, con destino
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const pctText = (v, d = 1) => `${(Math.abs(v) * 100).toFixed(d)} %`;

  /* ---------- Estado (lectura) ---------- */

  /** Arma el estado plano a partir del estado de la app. Solo lee; no ejecuta motores. */
  function collectStatus(state) {
    const st = state.store || {};
    const count = (t) => (st[t] && st[t].records ? st[t].records.length : 0);
    const q = state.quality || null;
    const t = state.targets || null;
    const reg = state.planning && state.planning.registry;
    const original = reg && FP.planning ? FP.planning.getOriginalPlan(reg) : null;
    const run = state.fc && state.fc.run;
    const rf = state.rf && state.rf.run;
    const ux = state.ux || {};
    const ch = (ux.ctx && ux.ctx.channel) || 'total';
    const series = run ? (ch === 'total' ? run.total : run.channels[ch]) : null;
    const a = series ? series.annual : null;
    const rfs = rf ? (ch === 'total' ? rf.total : rf.channels[ch]) : null;
    const dx = state.dx && state.dx.run && state.dx.run.status === 'ok' ? state.dx.run : null;
    const rcAnalysis = state.rc && state.rc.analysis;
    const scenarios = state.rc && state.rc.scenarioStore ? state.rc.scenarioStore.scenarios : [];
    const plan = state.rc && state.rc.plan ? state.rc.plan : { actions: [], measurements: [] };
    const measured = new Set(plan.measurements.map((m) => m.actionId));
    const openStatuses = ['proposed', 'approved', 'in_progress', 'completed', 'measuring'];
    const hyps = dx ? dx.hypotheses.length : rcAnalysis ? (rcAnalysis.hypotheses || []).length : null;
    return {
      currentModule: state.view,
      year: state.year,
      channel: ch,
      period: ux.ctx ? { type: ux.ctx.periodType, key: ux.ctx.periodKey } : null,
      data: { historical: count('historical'), plan: count('plan'), actual: count('actual'), segments: count('segments'),
        quality: q ? q.status : 'empty', qualityText: q ? q.statusText : null },
      targets: { defined: Boolean(t && ((t.annual && fin(t.annual.revenue)) || (t.byChannel && Object.values(t.byChannel).some((c) => c && fin(c.revenue))))) },
      plan: { original: Boolean(original), imported: count('plan') > 0, source: run ? run.plan.source : null, label: run ? run.plan.label : null },
      actual: { lastDate: state.fc ? state.fc.lastActualDate : null, countedDays: a ? a.countedDays : 0, cutoff: run ? run.cutoff : null },
      forecast: run && run.plan.source !== 'none' && a ? {
        available: true, method: run.method.label, methodId: run.method.id,
        target: a.plan ? a.plan.revenue : null, planToDate: a.planToDate ? a.planToDate.revenue : null,
        actualToDate: a.actualToDate ? a.actualToDate.revenue : null, compliance: a.toDate.revenue.compliance,
        gapToDate: a.toDate.revenue.gap, gapToDatePct: a.toDate.revenue.gapPct,
        forecast: a.forecast ? a.forecast.revenue : null, forecastGap: a.forecastGap.revenue.gap, forecastGapPct: a.forecastGap.revenue.gapPct
      } : { available: false },
      reforecast: rfs ? { available: true, horizon: rfs.horizon.type, required: rfs.horizon.requiredTotal, remaining: rfs.horizon.remaining,
        surplus: rfs.horizon.surplus, futureDays: rfs.horizon.futureDays,
        pressure: rfs.horizonSummary && rfs.horizonSummary.pressure ? rfs.horizonSummary.pressure.revenue.pressure : null } : { available: false },
      diagnostic: { visited: Boolean(ux.visited && ux.visited.diagnostico), hypotheses: hyps,
        mainDriver: dx && dx.level1 ? dx.level1.mainDriver : null },
      scenarios: { count: scenarios.length, withHypothesis: scenarios.filter((s) => s.links && s.links.hypothesisId).length },
      actions: { count: plan.actions.length, open: plan.actions.filter((x) => openStatuses.includes(x.status)).length,
        withoutMeasurement: plan.actions.filter((x) => openStatuses.includes(x.status) && !measured.has(x.actionId)).length },
      measurements: { count: plan.measurements.length },
      visited: { ...(ux.visited || {}) }
    };
  }

  /**
   * Preparación de datos (ajuste posterior a Fase 9.1). NO es un puntaje de desempeño del negocio ni
   * un segundo "siguiente paso": es una lectura de qué tan completa está la información que plan, pacing
   * y forecast necesitan, usando los mismos campos que ya calcula collectStatus (una sola fuente de verdad).
   *
   * Seis requisitos con peso (suman 100): tres BLOQUEANTES —meta definida (15), plan distribuido (20,
   * propio o importado) y al menos un día de venta real (30, el de mayor peso: sin real no hay pacing
   * ni forecast que mostrar)— y tres RECOMENDADOS —cobertura reciente de venta real ≥ 70 % de los días
   * transcurridos del año (15), histórico cargado que mejora la estacionalidad (10) y ausencia de
   * errores de calidad (10)—. El porcentaje es la suma de los pesos cumplidos.
   *
   * Compuerta dura: sin NINGÚN día de venta real, el resultado se limita a un máximo de 45 % aunque el
   * resto esté completo, porque sin real no existe pacing ni forecast (no es "menos confiable": no hay
   * nada que mostrar). Esa es la única excepción a la suma de pesos.
   *
   * Semáforo, siempre con los mismos tres cortes: ≥ 85 verde ("listo"), 50–84 ámbar ("funciona, con
   * menos confiabilidad"), < 50 rojo ("probablemente incompleto").
   */
  function dataReadiness(s) {
    const today = FP.calendar.toISODate(new Date());
    const elapsed = Math.max(1, FP.calendar.daysOfYear(s.year).filter((d) => d <= today).length);
    const coverage = s.actual.countedDays / elapsed;
    const checks = {
      targets: s.targets.defined,
      plan: Boolean(s.plan.original || s.plan.imported),
      actual: s.actual.countedDays > 0,
      coverage: coverage >= 0.7,
      historical: s.data.historical > 0,
      quality: s.data.quality !== 'invalid' && s.data.quality !== 'empty'
    };
    const WEIGHTS = { targets: 15, plan: 20, actual: 30, coverage: 15, historical: 10, quality: 10 };
    let percent = Object.keys(WEIGHTS).reduce((sum, k) => sum + (checks[k] ? WEIGHTS[k] : 0), 0);
    if (!checks.actual) percent = Math.min(percent, 45);
    const tier = percent >= 85 ? 'ok' : percent >= 50 ? 'warning' : 'error';
    const meta = G().READINESS.items;
    return {
      percent, tier, label: G().READINESS.tierLabels[tier], note: G().READINESS.note,
      allBlockingDone: meta.filter((m) => m.blocking).every((m) => checks[m.id]), coverage,
      items: meta.map((m) => ({ id: m.id, label: m.label, view: m.view, blocking: m.blocking, done: checks[m.id] }))
    };
  }

  /* ---------- Siguiente paso ---------- */

  const hasGap = (s) => s.forecast.available && ((fin(s.forecast.gapToDate) && s.forecast.gapToDate < 0) || (fin(s.forecast.forecastGap) && s.forecast.forecastGap < 0));

  /** Reglas en orden de prioridad (la primera que aplica gana). */
  const RULES = [
    { id: 'load_data', priority: 1, view: 'carga', when: (s) => !s.data.actual && !s.data.historical,
      text: 'Cargar datos', reason: 'No hay venta real ni histórico cargados.' },
    { id: 'fix_quality', priority: 2, view: 'calidad', when: (s) => s.data.quality === 'invalid',
      text: 'Revisar la calidad de datos', reason: 'Hay filas rechazadas o registros con errores.' },
    { id: 'set_targets', priority: 3, view: 'resumen', when: (s) => !s.targets.defined && !s.plan.imported,
      text: 'Capturar la meta', reason: 'No hay meta anual ni plan importado.' },
    { id: 'build_plan', priority: 4, view: 'plan', when: (s) => !s.plan.original && !s.plan.imported,
      text: 'Configurar la planeación', reason: 'Hay meta, pero todavía no hay plan distribuido guardado.' },
    { id: 'load_actual', priority: 5, view: 'carga', when: (s) => !s.actual.countedDays,
      text: 'Cargar venta real del año', reason: 'Sin días con real no hay pacing ni forecast.' },
    { id: 'review_pacing', priority: 6, view: 'pacing', when: (s) => s.forecast.available && !s.visited.pacing,
      text: 'Revisar pacing y forecast', reason: 'Hay plan y real: ver cómo vamos y dónde terminaríamos.' },
    { id: 'review_drivers', priority: 7, view: 'diagnostico', when: (s) => hasGap(s) && !s.visited.diagnostico,
      text: 'Revisar drivers', reason: 'Existe una brecha contra el plan.' },
    { id: 'more_evidence', priority: 8, view: 'diagnostico', when: (s) => hasGap(s) && s.visited.diagnostico && s.scenarios.count === 0 && s.diagnostic.hypotheses === 0,
      text: 'Buscar evidencia', reason: 'El diagnóstico no tiene hipótesis: sin evidencia no se simula. Prueba otra comparación, periodo o carga datos de segmentos.' },
    { id: 'simulate', priority: 8, view: 'recovery', when: (s) => hasGap(s) && s.visited.diagnostico && s.scenarios.count === 0,
      text: 'Simular recuperación', reason: 'Hay hipótesis pero ningún escenario guardado.' },
    { id: 'plan_action', priority: 9, view: 'recovery', when: (s) => s.scenarios.withHypothesis > 0 && s.actions.count === 0,
      text: 'Plantear una acción', reason: 'Hay escenarios ligados a hipótesis sin acción.' },
    { id: 'measure', priority: 10, view: 'medir', when: (s) => s.actions.withoutMeasurement > 0,
      text: 'Configurar seguimiento', reason: 'Hay acciones sin medición.' }
  ];

  function getNextStep(status) {
    const r = RULES.find((x) => x.when(status));
    if (r) return { id: r.id, text: `Siguiente paso: ${r.text.toLowerCase()}.`, label: r.text, reason: r.reason, view: r.view, priority: r.priority };
    return hasGap(status)
      ? { id: 'monitor_recovery', text: 'Siguiente paso: dar seguimiento a las acciones y al pacing.', label: 'Monitorear', reason: 'La cadena está completa.', view: 'medir', priority: 11 }
      : { id: 'monitor', text: 'Siguiente paso: monitorear el pacing.', label: 'Monitorear', reason: 'Sin brecha contra el plan.', view: 'pacing', priority: 11 };
  }

  /* ---------- Frases descriptivas (sin scores) ---------- */

  function headline(s) {
    const out = [];
    const f = s.forecast;
    if (!f.available) return ['Todavía no hay plan y real suficientes para comparar.'];
    if (fin(f.gapToDatePct)) out.push(Math.abs(f.gapToDatePct) < 0.0005 ? 'Venta acumulada en línea con el plan.'
      : `Venta acumulada ${pctText(f.gapToDatePct)} ${f.gapToDatePct < 0 ? 'por debajo' : 'por encima'} del plan.`);
    if (fin(f.forecastGapPct)) out.push(f.forecastGapPct < 0 ? `El forecast actual proyecta una brecha de ${pctText(f.forecastGapPct)} al cierre.`
      : `El forecast actual proyecta cerrar ${pctText(f.forecastGapPct)} por encima de la meta.`);
    const r = s.reforecast;
    if (r.available && fin(r.pressure)) out.push(r.pressure > 0 ? `El reforecast requiere ${pctText(r.pressure)} más que el plan de los días restantes para recuperar el objetivo.`
      : `El reforecast requiere ${pctText(r.pressure)} menos que el plan de los días restantes: hay margen.`);
    if (s.data.quality === 'warnings' || s.data.quality === 'invalid') out.push(`Calidad de datos: ${s.data.qualityText || s.data.quality}.`);
    return out;
  }

  /* ---------- Describir la vista ---------- */

  function breadcrumbs(view) {
    const v = G().VIEWS[view];
    if (!v) return ['Inicio'];
    if (view === 'inicio') return ['Inicio'];
    const g = G().GROUPS.find((x) => x.id === v.group);
    return ['Inicio', ...(g ? [g.label] : []), v.title];
  }

  const WHAT_IT_MEANS = {
    pacing: (s) => (s.forecast.available ? headline(s).slice(0, 2).join(' ') : 'Sin plan o real no hay pacing.'),
    reforecast: (s) => (s.reforecast.available ? (fin(s.reforecast.pressure) ? headline(s).find((x) => /reforecast/.test(x)) : 'El reforecast está calculado.') : 'Sin reforecast todavía.'),
    diagnostico: (s) => (s.diagnostic.hypotheses === null ? 'Elige canal, periodo y comparación para descomponer la brecha.'
      : `${s.diagnostic.hypotheses} hipótesis disponibles; todas requieren investigación.`),
    recovery: (s) => `${s.scenarios.count} escenarios guardados y ${s.actions.count} acciones en el plan.`,
    medir: (s) => `${s.actions.count} acciones, ${s.measurements.count} mediciones.`,
    calidad: (s) => (s.data.qualityText ? `Estado: ${s.data.qualityText}.` : 'Sin datos todavía.'),
    inicio: (s) => headline(s)[0] || ''
  };

  const INVESTIGATE = {
    pacing: 'Canales con cumplimiento debajo de 100 % y cómo cambia el performance reciente vs el acumulado.',
    reforecast: 'Dónde se concentra el requerimiento (meses o semanas con más presión).',
    diagnostico: 'El driver con mayor contribución y las señales de prioridad alta con peso grande.',
    recovery: 'Qué escenario cierra más gap dentro de las restricciones y qué hipótesis lo respalda.',
    medir: 'Acciones cuyo resultado observado no es consistente con el escenario y los factores listados.',
    inicio: 'La brecha, el forecast y la presión de recuperación del canal seleccionado.'
  };

  function describe(view, status) {
    const v = G().VIEWS[view] || { title: view, purpose: '' };
    const next = getNextStep(status);
    const crumbs = breadcrumbs(view);
    const actions = [];
    const g = G().GROUPS.find((x) => x.id === v.group);
    if (g) g.views.filter((x) => x !== view).forEach((x) => actions.push({ label: G().VIEWS[x].title, view: x }));
    if (next.view !== view) actions.unshift({ label: next.label, view: next.view, primary: true });
    return {
      whereAmI: crumbs.join(' › '),
      whatAmISeeing: v.purpose,
      whatDoesItMean: (WHAT_IT_MEANS[view] || (() => ''))(status),
      whatShouldIInvestigate: INVESTIGATE[view] || '',
      nextStep: next,
      availableActions: actions.slice(0, 4)
    };
  }

  /* ---------- Requisitos para estados vacíos ---------- */

  const NEEDS = {
    datos: [['data', 'Cargar datos reales o históricos', 'carga']],
    calidad: [['data', 'Cargar al menos un archivo', 'carga']],
    estacionalidad: [['historical', 'Cargar histórico (idealmente 2+ años)', 'carga']],
    plan: [['targets', 'Capturar la meta anual por canal', 'resumen'], ['historical', 'Cargar histórico para la estacionalidad', 'carga']],
    pacing: [['plan', 'Guardar el plan distribuido o importar un plan', 'plan'], ['actual', 'Cargar venta real del año', 'carga']],
    reforecast: [['plan', 'Guardar el plan distribuido o importar un plan', 'plan'], ['actual', 'Cargar venta real del año', 'carga']],
    diagnostico: [['plan', 'Tener un plan del año', 'plan'], ['actual', 'Cargar venta real', 'carga'], ['segments', 'Opcional: cargar segmentos para el Nivel 2', 'carga']],
    recovery: [['plan', 'Tener un plan del año', 'plan'], ['actual', 'Cargar venta real', 'carga'], ['diagnostic', 'Revisar el diagnóstico para tener hipótesis', 'diagnostico']],
    medir: [['actions', 'Agregar una acción desde el Recovery Center', 'recovery']]
  };

  function requirements(view, s) {
    const ok = {
      data: s.data.actual + s.data.historical > 0, historical: s.data.historical > 0, targets: s.targets.defined,
      plan: s.plan.original || s.plan.imported, actual: s.actual.countedDays > 0, segments: s.data.segments > 0,
      diagnostic: s.visited.diagnostico, actions: s.actions.count > 0
    };
    return (NEEDS[view] || []).map(([k, label, target]) => ({ key: k, label, view: target, done: Boolean(ok[k]) }));
  }

  FP.contextEngine = { collectStatus, getNextStep, dataReadiness, headline, describe, breadcrumbs, requirements, RULES };
})(typeof window !== 'undefined' ? window : globalThis);
