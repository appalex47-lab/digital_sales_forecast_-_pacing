/**
 * app.js — Orquestador. Dueño del estado de la aplicación.
 *
 * Flujo: acción del usuario → modifica `state` → persiste → render de la vista activa.
 * Ningún otro módulo modifica `state` directamente.
 *
 * Fase 1: el Dataset de Fase 0 ya no se genera ni guarda directo; se CONSTRUYE
 * con FP.dataStore.consolidate() a partir de los datos importados (plan + actual).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = FP.config, DM = FP.dataModel, Cal = FP.calendar, ST = FP.dataStore, IMP = FP.importer;

  // Fase 8.1: preferencias en localStorage; datos grandes en IndexedDB (tras migración verificada).
  const lsStorage = FP.storage.createStorage();
  const lsAdapter = FP.storage.localStorageAdapter() || FP.storage.memoryAdapter();
  const repo = FP.repository.createRepository();
  let migrationState = null;
  const storage = FP.repository.createRoutedStorage({ ls: lsStorage, repo,
    dataRouted: () => repo.ready && migrationState && migrationState.status === 'verified' });
  const K = C.storage.keys;
  const yk = (key, year) => `${key}:${year}`;
  const VIEWS = ['resumen', 'carga', 'calidad', 'datos', 'estacionalidad', 'plan', 'configuracion', 'pacing', 'reforecast', 'diagnostico', 'recovery', 'inicio', 'medir', 'ayuda', 'producto', 'negocio'];
  const MOCK_ORIGIN = 'mock-fase0';

  const state = {
    view: 'resumen',
    year: C.defaultYear,
    // Fase 0
    dataset: null,
    targets: null,
    registry: null,
    events: [],
    milestones: [],
    filters: { state: 'actual', granularity: 'month', periodKey: null },
    selfTest: null,
    storageKind: lsStorage.kind,
    // Fase 1
    store: ST.createStore(),
    settings: null,
    staging: { items: [], activeId: null, issueFilter: 'all' },
    quality: null,
    availableYears: [],
    qualityType: 'historical',
    dataFilters: { dataType: 'actual', channel: '', status: 'all', from: '', to: '', page: 1 },
    // Fase 2
    planning: {
      settings: {},          // solo lo que el usuario cambió; defaults en config.planning
      profiles: null,        // caché de FP.seasonality.buildProfiles (se invalida con datos/ajustes/año)
      preview: null,         // plan generado sin guardar (solo memoria)
      registry: null,        // plans:<año> — versiones guardadas; la primera queda congelada
      selected: null,        // 'preview' | id de versión
      current: null,         // plan mostrado
      versionCache: {},
      filters: { channel: 'ecommerce', month: 'all', week: 'all' },
      seasonalityChannel: 'ecommerce',
      comparison: null
    },
    // Fase 7: navegación, contexto persistente y guía (solo presentación)
    ux: {
      mode: 'analyst',
      ctx: { channel: 'total', periodType: 'month', periodKey: null, comparison: 'actual_vs_plan' },
      ctxNote: null,
      visited: {},
      lastByGroup: {},
      tour: { active: false, step: 0 },
      home: { channel: 'total', periodType: 'year', periodKey: null },
      measureAction: null,
      crumbExtra: {}
    },
    // Fase 8.1: Categoría → Producto (resultados en memoria; datos en IndexedDB)
    pa: { from: null, to: null, comparison: 'previous', channel: 'total', viewBy: 'category', deliveryFilter: '', path: {}, topN: 20, page: 1, result: null, loading: false, key: null,
      trace: null, counts: null, estimate: null, tests: null, testing: false, note: null },
    // Fase 8.2: Business Setup (borrador en memoria; lo guardado vive en localStorage `businessContext`)
    bc: { draft: null, storedAt: null, dirty: false },
    // Asistente de metas (no se guarda: solo llena el formulario)
    ta: { baseYear: null, growth: '', total: '', mix: {}, open: false, last: null },
    // Fase 6: Recovery Center
    rc: {
      settings: { channel: 'total', periodType: 'month', periodKey: null, start: '', end: '', applyTo: 'future', comparison: 'forecast_vs_plan', targetPct: 0.5 },
      constraints: { ...FP.config.recovery.constraints },
      draft: null,
      imported: null,
      ctx: null, base: null, preview: null, diagnosis: null, analysis: null, stamp: null,
      scenarioStore: null, plan: null, custom: [],
      selected: [], actionScenario: null, libraryDriver: '', treeActionId: null,
      ai: { status: 'idle', actions: [], errors: [] }
    },
    // Fase 3
    fc: {
      settings: {},          // solo lo que el usuario cambió; defaults en config.forecast
      run: null,             // caché de FP.forecastEngine.runForecast (se invalida con datos, plan, año o ajustes)
      registry: null,        // forecasts:<año> — snapshots inmutables
      metric: 'revenue',
      channel: 'total',      // canal del gráfico, índices, métodos y eventos
      period: 'months',      // months | weeks | days
      tableChannel: 'total',
      month: null,
      lastActualDate: null
    },
    // Fase 4
    rf: {
      settings: {},          // solo lo que el usuario cambió; defaults en config.reforecast
      run: null,             // caché de FP.reforecastEngine.runReforecast
      baseRun: null,         // corrida de forecast con la que se calculó (si cambia, se recalcula)
      simDate: null,         // simulación: fecha de referencia temporal (no se guarda)
      simForecast: null,
      registry: null,        // reforecasts:<año>
      metric: 'revenue',
      channel: 'total',
      period: 'months',
      tableChannel: 'total',
      month: null
    },
    // Fase 5
    dx: {
      settings: { comparison: 'actual_vs_plan', periodType: 'month', periodKey: null, channel: 'total', metric: 'revenue', method: C.diagnostics.attributionMethod },
      run: null, base: null, baseRf: null,
      ai: { status: null, result: null },
      apiKey: '', rememberKey: false, model: C.diagnostics.cohere.model,
      showAllSignals: false
    }
  };

  /* ================= Persistencia ================= */

  function defaultSettings() {
    return { ...IMP.defaultSettings(), includeErrorRows: false };
  }

  function loadSettings() {
    const s = storage.load(K.settings);
    state.settings = { ...defaultSettings(), ...(s && s.data ? s.data : {}) };
  }

  function loadStore() {
    C.dataTypeIds.forEach((t) => {
      const env = storage.load(K[C.dataTypes[t].storageKey]);
      state.store[t] = env ? ST.hydrateCollection(env.data, t) : ST.emptyCollection();
    });
  }

  function saveStore(types = C.dataTypeIds) {
    const ok = types.every((t) => storage.save(K[C.dataTypes[t].storageKey], ST.packCollection(state.store[t])));
    if (!ok) FP.ui.toast(`No se pudo guardar en el navegador (${storage.lastError || 'sin espacio'}). Los datos siguen en esta sesión; exporta el JSON para no perderlos.`);
    return ok;
  }

  function saveSettings() { storage.save(K.settings, state.settings); }

  function loadPlanningSettings() {
    const env = storage.load(K.planningSettings);
    state.planning.settings = env && env.data ? env.data : {};
  }
  function loadForecastSettings() {
    const env = storage.load(K.forecastSettings);
    state.fc.settings = env && env.data ? env.data : {};
  }
  function loadReforecastSettings() {
    const env = storage.load(K.reforecastSettings);
    state.rf.settings = env && env.data ? env.data : {};
  }
  function saveReforecastSettings() { storage.save(K.reforecastSettings, state.rf.settings); }
  function saveReforecastRegistry() {
    if (state.rf.registry) storage.save(yk(K.reforecasts, state.year), state.rf.registry);
  }

  function loadDiagnosticSettings() {
    const env = storage.load(K.diagnosticSettings);
    const d = env && env.data ? env.data : {};
    state.dx.settings = { ...state.dx.settings, ...(d.settings || {}), periodKey: null };
    state.dx.rememberKey = Boolean(d.rememberKey);
    state.dx.model = d.model || C.diagnostics.cohere.model;
    const key = state.dx.rememberKey ? storage.load(K.cohereApiKey) : null;
    state.dx.apiKey = key && key.data ? key.data : '';
  }
  function saveDiagnosticSettings() {
    const { periodKey, ...rest } = state.dx.settings;
    storage.save(K.diagnosticSettings, { settings: rest, rememberKey: state.dx.rememberKey, model: state.dx.model });
    if (state.dx.rememberKey && state.dx.apiKey) storage.save(K.cohereApiKey, state.dx.apiKey);
    else storage.remove(K.cohereApiKey);
  }

  /** Diagnóstico sobre el forecast vigente (y el reforecast, para la comparación de recuperación). Solo lee. */
  function ensureDiagnostic() {
    const dx = state.dx;
    const run = ensureForecast();
    if (!run || run.plan.source === 'none') { dx.run = null; return null; }
    const rf = ensureReforecast();
    const s = dx.settings;
    const cutoff = run.cutoff && run.cutoff.startsWith(`${state.year}-`) ? run.cutoff : `${state.year}-01-01`;
    const valid = s.periodType === 'year' ? [String(state.year)] : s.periodType === 'month'
      ? Array.from({ length: 12 }, (_, i) => `${state.year}-${String(i + 1).padStart(2, '0')}`) : run.total.weeks.map((w) => w.key);
    if (!valid.includes(s.periodKey)) {
      s.periodKey = s.periodType === 'year' ? String(state.year) : s.periodType === 'month' ? cutoff.slice(0, 7) : Cal.getWeekInfo(cutoff).weekKey;
      dx.run = null;
    }
    if (dx.run && dx.base === run && dx.baseRf === rf) return dx.run;
    dx.run = FP.diagnosticEngine.runDiagnostic({ comparison: s.comparison, period: { type: s.periodType, key: s.periodKey },
      channel: s.channel, metric: s.metric, method: s.method, run, rf, store: state.store, quality: state.quality });
    dx.base = run; dx.baseRf = rf;
    dx.ai = { status: null, result: null };
    return dx.run;
  }

  /* ---------- Fase 8.2: Business Setup ---------- */

  const BCX = FP.businessContext;
  /** Carga el contexto guardado como borrador (o vacío). La config activa se leyó al arrancar (config.js). */
  function loadBusinessContext() {
    const env = storage.load(K.businessContext);
    const ctx = env ? BCX.normalize(env.data) : null;
    // Hay algo guardado que no se puede leer (JSON dañado o versión de esquema desconocida): se avisa, no se adivina
    const raw = lsAdapter.get(`${C.storage.namespace}:${K.businessContext}`);
    state.bc = { draft: ctx || BCX.empty(), storedAt: ctx ? env.savedAt : null, dirty: false, unreadable: Boolean(raw) && !ctx };
  }
  function setPath(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => o[k], obj);
    target[last] = value;
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
  const parseLevels = (v) => String(v || '').split(/→|->|>|,|\n/).map((x) => x.trim()).filter(Boolean);
  /** Propuesta a partir de lo que la app ya sabe (no se guarda hasta confirmar). */
  function seedBusinessContext() {
    const d = BCX.normalize(state.bc.draft) || BCX.empty();
    const pm = FP.productStore ? FP.productStore.meta : null;
    d.business.currency = d.business.currency || C.currency;
    if (!d.selling.models.length) d.selling.models = ['ecommerce', 'assisted'];
    if (!d.business.offering.length) d.business.offering = ['products'];
    if (d.geography.relevant === null && pm && (pm.states || []).length) { d.geography.relevant = true; d.geography.levels = ['Estado', 'Sucursal']; }
    if (d.catalog.relevant === null && pm && pm.batches) { d.catalog.relevant = true; d.catalog.levels = ['Categoría', 'Subcategoría', 'Producto', 'SKU']; }
    if (!d.businessFactors.length) d.businessFactors = ['seasonality', 'events', 'calendar'];
    return d;
  }

  /* ---------- Fase 6: Recovery Center ---------- */

  const emptyDraft = () => ({ trafficPct: 0, crMode: 'pp', crValue: 0, aovMode: 'pct', aovValue: 0, target: 'channel', hypothesisId: '', name: '', type: 'custom', supersedes: null });

  function loadRecovery() {
    const env = storage.load(K.recoverySettings);
    const d = env && env.data ? env.data : {};
    state.rc.settings = { ...state.rc.settings, ...(d.settings || {}) };
    state.rc.constraints = { ...C.recovery.constraints, ...(d.constraints || {}) };
    const cu = storage.load(K.actionLibraryCustom);
    state.rc.custom = cu && Array.isArray(cu.data) ? cu.data : [];
    if (!state.rc.draft) state.rc.draft = emptyDraft();
  }
  function saveRecoverySettings() { storage.save(K.recoverySettings, { settings: state.rc.settings, constraints: state.rc.constraints }); }
  function saveScenarios() { storage.save(yk(K.scenarios, state.year), state.rc.scenarioStore); }
  function saveActionPlan() { storage.save(yk(K.actionPlan, state.year), state.rc.plan); }

  /** Cambios del borrador en unidades del motor (fracciones). */
  function draftChanges(d) {
    const n = (v) => { const x = FP.normalize.normalizeNumber(String(v)).value; return x === null ? NaN : x; };
    return { trafficPct: n(d.trafficPct) / 100, crMode: d.crMode, crValue: n(d.crValue) / 100, aovMode: d.aovMode,
      aovValue: d.aovMode === 'abs' ? n(d.aovValue) : n(d.aovValue) / 100 };
  }
  function draftTarget(d) {
    if (!d.target || d.target === 'channel') return { type: 'channel' };
    const [dimension, segment] = d.target.split('::');
    const t = FP.scenarioEngine.availableTargets(state.rc.ctx).find((x) => x.dimension === dimension);
    const sg = t ? t.segments.find((x) => x.key === segment) : null;
    return { type: 'segment', dimension, segment, segmentLabel: sg ? sg.label : segment };
  }

  /** Contexto, diagnóstico de origen, análisis y vista previa. Solo lee plan/actual/forecast/reforecast. */
  function ensureRecovery() {
    const rc = state.rc;
    const run = ensureForecast();
    const rf = ensureReforecast();
    if (!rc.draft) rc.draft = emptyDraft();
    let ctx = rc.imported;
    let diagnosis = null;
    if (!ctx) {
      if (!run || run.plan.source === 'none') { rc.ctx = null; rc.analysis = null; return null; }
      const s = rc.settings;
      const cutoff = run.cutoff && run.cutoff.startsWith(`${state.year}-`) ? run.cutoff : `${state.year}-01-01`;
      if (s.periodType === 'month' && !(s.periodKey || '').match(new RegExp(`^${state.year}-\\d{2}$`))) s.periodKey = cutoff.slice(0, 7);
      if (s.periodType === 'week' && !run.total.weeks.some((w) => w.key === s.periodKey)) s.periodKey = Cal.getWeekInfo(cutoff).weekKey;
      if (s.periodType === 'day' && !(s.periodKey || '').startsWith(`${state.year}-`)) s.periodKey = Cal.addDays(cutoff, 1) || cutoff;
      if (s.periodType === 'range') { if (!s.start) s.start = cutoff; if (!s.end) s.end = `${state.year}-12-31`; }
      const period = s.periodType === 'range' ? { type: 'range', start: s.start, end: s.end } : { type: s.periodType, key: s.periodType === 'year' ? String(state.year) : s.periodKey };
      ctx = FP.scenarioEngine.buildContext({ run, rf, channel: s.channel, period, applyTo: s.applyTo, store: state.store });
      if (['month', 'week', 'year'].includes(s.periodType)) {
        diagnosis = FP.diagnosticEngine.runDiagnostic({ comparison: s.comparison, period: { type: s.periodType, key: period.key },
          channel: s.channel, metric: 'revenue', method: C.diagnostics.attributionMethod, run, rf, store: state.store, quality: state.quality });
      }
      rc.stampRun = run; rc.stampRf = rf;
    }
    rc.ctx = ctx;
    rc.diagnosis = diagnosis;
    rc.base = FP.scenarioEngine.simulate(ctx, { changes: {} });
    rc.analysis = FP.recoveryEngine.runRecoveryAnalysis({ ctx, diagnosis, constraints: rc.constraints, scenarioStore: rc.scenarioStore,
      actionPlan: rc.plan, customActions: rc.custom, targetPct: rc.settings.targetPct });
    rc.preview = FP.scenarioEngine.simulate(ctx, { changes: draftChanges(rc.draft), target: draftTarget(rc.draft), constraints: rc.constraints });
    return rc.analysis;
  }

  function saveForecastSettings() { storage.save(K.forecastSettings, state.fc.settings); }
  function saveForecastRegistry() {
    if (state.fc.registry) storage.save(yk(K.forecasts, state.year), state.fc.registry);
  }

  function savePlanningSettings() { storage.save(K.planningSettings, state.planning.settings); }
  function savePlanRegistry() {
    if (state.planning.registry) storage.save(yk(K.plans, state.year), state.planning.registry);
  }

  /** Metas, versiones, eventos e hitos siguen siendo por año (Fase 0). */
  function loadYearScoped(year) {
    state.year = year;
    const tg = storage.load(yk(K.targets, year));
    state.targets = tg && tg.data ? { ...DM.createTargets(year), ...tg.data } : DM.createTargets(year);
    const rg = storage.load(yk(K.versions, year));
    state.registry = rg ? FP.forecast.hydrateRegistry(rg.data) : null;
    const ev = storage.load(yk(K.events, year));
    state.events = ev ? ev.data : [];
    const ms = storage.load(yk(K.milestones, year));
    state.milestones = ms ? ms.data : [];
    // Fase 2: planes guardados del año
    const pl = storage.load(yk(K.plans, year));
    const ps = state.planning;
    ps.registry = (pl && FP.planning.hydratePlanRegistry(pl.data)) || FP.planning.createPlanRegistry(year);
    ps.preview = null;
    ps.versionCache = {};
    ps.selected = ps.registry.currentId || null;
    // Fase 3: versiones del forecast del año
    const fr = storage.load(yk(K.forecasts, year));
    state.fc.registry = FP.forecastVersioning.hydrateForecastRegistry(fr && fr.data, year);
    // Fase 4: versiones del reforecast del año
    const rr = storage.load(yk(K.reforecasts, year));
    state.rf.registry = FP.reforecastVersioning.hydrateReforecastRegistry(rr && rr.data, year);
    state.rf.simForecast = null;
    // Fase 6: escenarios y plan de acción del año (entidades independientes)
    const scs = storage.load(yk(K.scenarios, year));
    state.rc.scenarioStore = FP.scenarioEngine.hydrateScenarioStore(scs && scs.data, year);
    const ap = storage.load(yk(K.actionPlan, year));
    state.rc.plan = FP.actionPlan.hydratePlan(ap && ap.data, year);
    state.rc.imported = null;
    invalidatePlanning();
  }

  /** Datos, ajustes, eventos o año cambiaron: recalcular perfiles y comparación cuando se necesiten. */
  function invalidatePlanning() {
    state.planning.profiles = null;
    state.planning.comparison = null;
    state.fc.run = null;
  }

  /**
   * Reforecast derivado del forecast vigente (o de una corrida temporal en simulación).
   * Se recalcula cuando cambia el forecast, los datos, el plan, el año o los ajustes.
   */
  function ensureReforecast() {
    const r = state.rf;
    const base = ensureForecast();
    if (r.run && r.baseRun === base && (!r.simDate || r.simForecast)) return r.run;
    const planVersion = FP.planning.getOriginalPlan(state.planning.registry);
    let run = base;
    if (r.simDate) {
      if (!r.simForecast || r.simBase !== base) {
        r.simForecast = FP.forecastEngine.runForecast({ year: state.year, store: state.store, planVersion,
          dataset: planVersion ? null : state.dataset, events: state.events,
          settings: { ...state.fc.settings, referenceDate: r.simDate } });
        r.simBase = base;
      }
      run = r.simForecast;
    }
    r.baseRun = base;
    if (run.plan.source === 'none') { r.run = null; return null; }
    const last = state.fc.registry && state.fc.registry.versions.length ? state.fc.registry.versions[state.fc.registry.versions.length - 1] : null;
    const fcVersion = last && last.referenceDate === run.referenceDate && last.method.id === run.method.id ? last : null;
    r.run = FP.reforecastEngine.runReforecast({ run, planVersion, store: state.store, settings: r.settings,
      simulated: Boolean(r.simDate), forecastVersion: fcVersion });
    // Ambos horizontes lado a lado: el otro horizonte se calcula solo para la comparación.
    const other = r.run.horizon === 'year' ? 'month' : 'year';
    r.altRun = FP.reforecastEngine.runReforecast({ run, planVersion, store: state.store,
      settings: { ...r.settings, horizon: other }, simulated: Boolean(r.simDate), forecastVersion: fcVersion });
    return r.run;
  }

  /** Último día con venta real del año (actual, o histórico si se usa como real). */
  function lastActualDate() {
    const cfg = FP.forecastEngine.effectiveConfig(state.fc.settings);
    const types = cfg.useHistoricalAsActual ? ['actual', 'historical'] : ['actual'];
    let max = null;
    types.forEach((t) => ST.records(state.store, t).forEach((r) => {
      if (r.date && r.date.startsWith(`${state.year}-`) && r.metrics.revenue.value !== null && (!max || r.date > max)) max = r.date;
    }));
    return max;
  }

  /** Corre el forecast si no está en caché. El plan se pasa solo para lectura. */
  function ensureForecast() {
    const fc = state.fc;
    if (fc.run) return fc.run;
    const planVersion = FP.planning.getOriginalPlan(state.planning.registry);
    fc.run = FP.forecastEngine.runForecast({ year: state.year, store: state.store, planVersion,
      dataset: planVersion ? null : state.dataset, events: state.events, settings: fc.settings });
    fc.lastActualDate = lastActualDate();
    return fc.run;
  }

  function ensureProfiles() {
    const ps = state.planning;
    if (!ps.profiles) {
      const cfg = FP.seasonality.effectiveConfig(ps.settings);
      ps.profiles = FP.seasonality.buildProfiles(ST.records(state.store, 'historical'), cfg, state.year);
    }
    return ps.profiles;
  }

  function resolveCurrentPlan() {
    const ps = state.planning;
    if (ps.selected === 'preview' && ps.preview) { ps.current = ps.preview; return; }
    const v = ps.registry && ps.registry.versions.find((x) => x.id === ps.selected);
    if (!v) { ps.current = ps.preview || null; if (ps.preview) ps.selected = 'preview'; return; }
    if (!ps.versionCache[v.id]) ps.versionCache[v.id] = FP.planning.fromVersion(v);
    ps.current = ps.versionCache[v.id];
  }

  function saveYearScoped() {
    const y = state.year;
    storage.save(yk(K.targets, y), state.targets);
    if (state.registry) storage.save(yk(K.versions, y), state.registry);
    storage.save(yk(K.events, y), state.events);
    storage.save(yk(K.milestones, y), state.milestones);
  }

  /**
   * Migración desde Fase 0: si existe un Dataset guardado con la clave antigua y
   * todavía no hay datos importados, se pasa por el pipeline y se elimina la clave.
   */
  function migrateLegacyDataset() {
    if (!ST.isEmpty(state.store)) return false;
    const env = storage.load(yk(K.dataset, state.year));
    if (!env) return false;
    const ds = DM.hydrateDataset(env.data);
    if (ds) ['plan', 'actual'].forEach((t) => importDataset(ds, t, `Migrado de Fase 0 (${t === 'plan' ? 'plan' : 'real'})`, 'migration'));
    storage.remove(yk(K.dataset, state.year));
    return true;
  }

  /* ================= Derivados ================= */

  /** Recalcula todo lo derivado del store: dataset consolidado, calidad, años. */
  function refresh() {
    const original = FP.planning.getOriginalPlan(state.planning.registry);
    state.dataset = ST.consolidate(state.store, state.year, { planFallback: original ? FP.planning.planValuesMap(original) : null });
    state.quality = FP.coverage.summarize(state.store);
    state.availableYears = ST.years(state.store);
    state.fc.run = null;
    const periods = DM.availablePeriods(state.dataset, state.filters.granularity);
    if (!periods.includes(state.filters.periodKey)) resetPeriod();
  }

  function resetPeriod() {
    const g = state.filters.granularity;
    const periods = state.dataset ? DM.availablePeriods(state.dataset, g) : [];
    const today = Cal.periodKey(Cal.toISODate(new Date()), g);
    state.filters.periodKey = periods.includes(today) ? today : periods[periods.length - 1] || null;
  }

  /* ================= Render ================= */

  /* ---------- Fase 7: capa de guía (presentación) ---------- */

  function loadUx() {
    const env = storage.load(K.uxSettings);
    const d = env && env.data ? env.data : {};
    const u = state.ux;
    ['mode', 'visited', 'lastByGroup', 'tour', 'home', 'ctx'].forEach((k) => { if (d[k] !== undefined) u[k] = typeof d[k] === 'object' && !Array.isArray(d[k]) ? { ...u[k], ...d[k] } : d[k]; });
    u.tour.active = Boolean(d.tour && d.tour.active);
  }
  function saveUx() {
    const u = state.ux;
    storage.save(K.uxSettings, { mode: u.mode, visited: u.visited, lastByGroup: u.lastByGroup, tour: u.tour, home: u.home, ctx: u.ctx });
  }

  /** Render completo: navegación → vista existente → barra de contexto → ayuda, modo y recorrido. */
  function render() {
    const u = state.ux;
    u.visited[state.view] = true;
    const g = FP.navigation.groupOf(state.view);
    if (g) u.lastByGroup[g] = state.view;
    FP.navigation.renderNav(state);
    renderView();
    const status = FP.contextEngine.collectStatus(state);
    FP.navigation.renderContextBar(state, status);
    const exp = document.getElementById(`ux-exp-${state.view}`);
    if (exp) exp.innerHTML = FP.help.explainer(state.view, u.mode);
    if (state.view === 'diagnostico') FP.diagnosticGuide.render(state);
    const main = document.getElementById(`view-${state.view}`);
    FP.help.decorate(main);
    FP.help.enhanceEmpty(main, FP.contextEngine.requirements(state.view, status));
    FP.navigation.applyMode(state);
    FP.tour.render(state);
    saveUx();
  }

  function renderView() {
    FP.ui.renderStatus(state);
    VIEWS.forEach((v) => { document.getElementById(`view-${v}`).hidden = v !== state.view; });
    if (state.view === 'resumen') {
      FP.ui.renderFacts(state);
      FP.ui.renderTargets(state);
      FP.ui.renderFilters(state);
      FP.ui.renderValidation(state);
      FP.ui.renderEngine(state);
      FP.ui.renderExport(state);
    } else if (state.view === 'carga') FP.importView.render(state);
    else if (state.view === 'calidad') FP.qualityView.render(state);
    else if (state.view === 'datos') FP.dataView.render(state);
    else if (state.view === 'estacionalidad') { ensureProfiles(); FP.seasonalityView.render(state); }
    else if (state.view === 'plan') { resolveCurrentPlan(); FP.planningView.render(state); }
    else if (state.view === 'configuracion') FP.planningConfigView.render(state);
    else if (state.view === 'pacing') { ensureForecast(); FP.pacingView.render(state); FP.forecastView.render(state); }
    else if (state.view === 'reforecast') { ensureReforecast(); FP.reforecastView.render(state); }
    else if (state.view === 'diagnostico') { ensureDiagnostic(); FP.diagnosticView.render(state); }
    else if (state.view === 'recovery') {
      ensureRecovery();
      if (!state.rc.ctx) {
        ['rc-gap', 'rc-chain', 'rc-simulator', 'rc-inverse', 'rc-saved', 'rc-library', 'rc-plan', 'rc-tracking', 'rc-tree'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
        document.getElementById('rc-context').innerHTML = '<div class="empty"><strong>Todavía no hay contexto de recuperación</strong>Se necesita un plan del año y venta real, o importar un analysis_export.json o reforecast_export.json.</div>';
      } else FP.recoveryCenter.render(state);
    }
    else if (state.view === 'inicio') { ensureForecast(); ensureReforecast(); FP.homeView.render(state, FP.contextEngine.collectStatus(state)); }
    else if (state.view === 'medir') FP.measureView.render(state);
    else if (state.view === 'ayuda') FP.helpView.render(state);
    else if (state.view === 'producto') { FP.productView.render(state); ensureProductAnalysis(); }
    else if (state.view === 'negocio') FP.businessView.render(state);
  }

  /* ================= Pipeline de importación ================= */

  function processStaged(staged) {
    return IMP.process(staged, { settings: state.settings, existing: ST.records(state.store, staged.dataType) });
  }

  function addToStaging(staged) {
    state.staging.items.push({ staged, result: processStaged(staged) });
    state.staging.activeId = staged.id;
  }

  function reprocessAll() {
    state.staging.items.forEach((i) => { if (i.staged.dataType === 'products') processProduct(i); else i.result = processStaged(i.staged); });
  }

  /* ----- Fase 8.1: productos (proceso asíncrono por lotes; se guarda en IndexedDB) ----- */
  let lastProgressRender = 0;
  function progressRender() {
    const t = Date.now();
    if (t - lastProgressRender > 250) { lastProgressRender = t; if (state.view === 'carga') render(); }
  }
  function addProductStaged(staged) {
    const item = { staged, result: null, status: 'processing', progress: 0, policy: 'keep' };
    state.staging.items.push(item);
    state.staging.activeId = staged.id;
    processProduct(item);
    return item;
  }
  async function processProduct(item) {
    const token = (item.token || 0) + 1;
    item.token = token; item.status = 'processing'; item.progress = 0;
    const res = await FP.productImport.process(item.staged, { settings: state.settings, onProgress: (p) => { item.progress = p; progressRender(); } });
    if (item.token !== token) return; // hubo un cambio de mapeo mientras tanto
    item.result = res; item.status = 'ready';
    render();
  }
  async function commitProduct(item) {
    if (!item.result || !item.result.canImport) return;
    item.status = 'saving'; item.progress = 0; render();
    try {
      const batch = await FP.productStore.commit(item.result.draft, { fileName: item.staged.fileName, policy: item.policy,
        onProgress: (d, t) => { item.progress = d / t; progressRender(); } });
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      state.pa.result = null; state.pa.counts = null; state.pa.from = null; state.pa.to = null;
      render();
      const m = batch.storedMerge;
      FP.ui.toast(`Productos guardados: ${batch.summary.accepted.toLocaleString('es-MX')} SKU-días de ${batch.fileName}${m.conflicts ? `; ${m.conflicts} conflictos con lo guardado (${batch.policy === 'replace' ? 'reemplazados' : 'se conservó lo guardado y se marcaron'})` : ''}.`);
    } catch (e) {
      item.status = 'ready'; render();
      FP.ui.toast(`No se pudieron guardar los productos: ${e.message}`);
    }
  }

  const paLevel = (pa) => (pa.viewBy === 'geo' ? (pa.path.state ? 'branch' : 'state')
    : pa.path.product ? 'sku' : pa.path.subcategory ? 'product' : pa.path.category ? 'subcategory' : 'category');
  const paChainOrder = (pa) => (pa.viewBy === 'geo' ? ['state', 'branch'] : ['category', 'subcategory', 'product', 'sku']);

  /** Calcula el análisis de productos (asíncrono) si cambió algún parámetro. */
  async function ensureProductAnalysis() {
    const pa = state.pa;
    if (!FP.productStore.available()) return;
    const m = FP.productStore.meta;
    if (!m || !m.batches) return;
    if (!pa.to || !pa.from) {
      pa.to = m.dateMax;
      pa.from = `${m.dateMax.slice(0, 7)}-01`;
    }
    if (!pa.counts) { pa.counts = await FP.productStore.counts(); pa.estimate = await repo.estimate(); }
    const level = paLevel(pa);
    const filter = { ...pa.path, ...(pa.deliveryFilter ? { delivery: pa.deliveryFilter } : {}) };
    const key = JSON.stringify([pa.from, pa.to, pa.comparison, pa.channel, filter, level]);
    if (pa.result && pa.key === key) return;
    pa.key = key; pa.loading = true;
    const res = await FP.productAnalysis.run({ from: pa.from, to: pa.to, comparison: pa.comparison, channel: pa.channel, level, filter });
    if (pa.key !== key) return;
    pa.result = res; pa.loading = false; pa.page = 1;
    if (state.view === 'producto') FP.productView.render(state);
  }

  function activeItem() {
    return state.staging.items.find((i) => i.staged.id === state.staging.activeId) || state.staging.items[0] || null;
  }

  /** Pasa un Dataset de Fase 0 por el pipeline y lo guarda como archivo. */
  function importDataset(ds, dataType, fileName, origin) {
    const { headers, rows } = ST.datasetToRows(ds, dataType);
    if (!rows.length) return null;
    const staged = IMP.stageRows(headers, rows, { fileName, dataType });
    const result = processStaged(staged);
    const batch = ST.commitBatch(state.store, staged, result, { includeErrorRows: true, settings: state.settings });
    batch.origin = origin;
    return batch;
  }

  /** Lee un archivo como UTF-8; si trae caracteres rotos, reintenta como Windows-1252 (Excel). */
  function readFileText(file) {
    const read = (enc) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file, enc);
    });
    return read('utf-8').then((txt) => (txt.includes('\uFFFD') ? read('windows-1252') : txt));
  }

  async function pickFiles(input) {
    const dataType = input.dataset.type;
    const files = [...(input.files || [])];
    input.value = '';
    const maxBytes = C.import.maxFileSizeMB * 1024 * 1024;
    let added = 0;
    for (const file of files) {
      if (file.size > maxBytes * (dataType === 'products' ? 20 : 1)) { FP.ui.toast(`${file.name} pesa más de ${C.import.maxFileSizeMB} MB. Divídelo en archivos más pequeños.`); continue; }
      try {
        const text = await readFileText(file);
        if (dataType === 'products') addProductStaged(FP.productImport.stage(text, { fileName: file.name }));
        else addToStaging(IMP.stage(text, { fileName: file.name, dataType }));
        added++;
      } catch (e) {
        FP.ui.toast(`No se pudo leer ${file.name}: ${e.message}`);
      }
    }
    if (added) { render(); FP.ui.toast(`${added} archivo${added === 1 ? '' : 's'} en revisión. Nada se ha importado todavía.`); scrollToStaging(); }
  }

  function scrollToStaging() {
    const el = document.getElementById('t-staging');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ================= Acciones ================= */

  const actions = {
    /* ----- Fase 0 ----- */
    'generate-mock'() {
      // Reemplaza la carga de prueba anterior para no generar duplicados propios.
      ST.allBatches(state.store).filter((b) => b.origin === MOCK_ORIGIN).forEach((b) => ST.removeBatch(state.store, b.id));
      const ds = FP.mock.generateMonth({ year: 2026 });
      importDataset(ds, 'plan', 'Datos de prueba Fase 0 (plan).csv', MOCK_ORIGIN);
      importDataset(ds, 'actual', 'Datos de prueba Fase 0 (real).csv', MOCK_ORIGIN);
      if (state.year !== 2026) loadYearScoped(2026);
      state.registry = FP.forecast.createRegistry(2026);
      FP.forecast.lockOriginalPlan(state.registry, ds);
      state.events = FP.mock.sampleEvents();
      state.milestones = FP.mock.sampleMilestones();
      saveStore(['plan', 'actual']);
      saveYearScoped();
      invalidatePlanning();
      refresh();
      resetPeriod();
      render();
      FP.ui.toast('Datos de prueba importados por el pipeline y plan original bloqueado');
    },

    'run-tests'() {
      state.selfTest = FP.selfTest.run();
      render();
      FP.ui.toast(`Pruebas del motor: ${state.selfTest.passed} de ${state.selfTest.total} correctas`);
    },

    'clear-all'() {
      if (!root.confirm('¿Borrar todos los datos guardados de esta app en este navegador? Incluye archivos importados, metas y ajustes.')) return;
      storage.clear();
      if (FP.productStore) FP.productStore.reset();
      state.pa = { ...state.pa, result: null, counts: null, from: null, to: null, path: {}, trace: null };
      state.store = ST.createStore();
      state.staging = { items: [], activeId: null, issueFilter: 'all' };
      loadSettings();
      loadPlanningSettings();
      loadForecastSettings();
      loadReforecastSettings();
      loadRecovery();
      loadBusinessContext();
      state.rc.draft = emptyDraft(); state.rc.selected = []; state.rc.imported = null;
      loadDiagnosticSettings();
      state.rf.simDate = null;
      state.dx.run = null;
      loadYearScoped(state.year);
      refresh();
      state.ux.visited = {}; state.ux.tour = { active: false, step: 0 }; state.ux.lastByGroup = {};
      render();
      FP.ui.toast('Datos borrados');
    },

    /* ----- Asistente de metas ----- */
    'ta-setting'(el) { state.ta[el.dataset.key] = el.dataset.key === 'baseYear' ? Number(el.value) : el.value; state.ta.open = true; render(); },
    'ta-mix'(el) { state.ta.mix = { ...state.ta.mix, [el.dataset.channel]: el.value }; state.ta.open = true; render(); },
    'ta-reset'() { state.ta = { baseYear: state.ta.baseYear, growth: '', total: '', mix: {}, open: true, last: null }; render(); },
    'ta-fill'() {
      const s = state.ta.last;
      if (!s) return;
      const set = (name, v) => { const el = document.querySelector(`#targets-form [name="${name}"]`); if (el) el.value = String(v); };
      set('annual', s.total);
      C.channelIds.forEach((ch) => set(ch, s.byChannel[ch]));
      document.getElementById('targets-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      FP.ui.toast('Formulario lleno con la propuesta. Revisa y pulsa "Guardar metas" para confirmarla.');
    },

    'sample-targets'() {
      state.targets = FP.mock.sampleTargets(state.year);
      saveYearScoped();
      render();
      FP.ui.toast('Metas de ejemplo guardadas');
    },

    'set-state'(el) { state.filters.state = el.dataset.value; render(); },
    'set-granularity'(el) { state.filters.granularity = el.dataset.value; resetPeriod(); render(); },
    'set-period'(el) { state.filters.periodKey = el.value; render(); },
    'set-year'(el) { loadYearScoped(Number(el.value)); refresh(); resetPeriod(); render(); },

    /* ----- Fase 1: carga ----- */
    'pick-files'(el) { pickFiles(el); },

    'download-template'(el) {
      const t = el.dataset.type;
      FP.exporter.download(`plantilla_${t}.csv`, FP.exporter.buildTemplate(t), 'text/csv');
    },

    'stage-mock'() {
      const f = FP.mockCsv.get(document.getElementById('mock-select').value);
      if (!f) return;
      addToStaging(IMP.stage(f.text(), { fileName: f.fileName, dataType: f.dataType }));
      render();
      FP.ui.toast(`${f.fileName} en revisión. Esperado: ${f.expect}`);
      scrollToStaging();
    },

    'stage-all-generated'() {
      FP.mockCsv.GENERATED.forEach((f) => addToStaging(IMP.stage(f.text(), { fileName: f.fileName, dataType: f.dataType })));
      state.staging.activeId = state.staging.items[state.staging.items.length - FP.mockCsv.GENERATED.length].staged.id;
      render();
      FP.ui.toast(`${FP.mockCsv.GENERATED.length} archivos en revisión. Confírmalos uno por uno.`);
      scrollToStaging();
    },

    'select-staged'(el) { state.staging.activeId = el.dataset.id; state.staging.issueFilter = 'all'; render(); },

    'set-staged-type'(el) {
      const item = activeItem();
      item.staged.dataType = el.value;
      item.result = processStaged(item.staged);
      render();
    },

    'set-mapping'(el) {
      const item = activeItem();
      if (item && item.staged.dataType === 'products') { item.staged.mapping[el.dataset.header] = el.value || null; item.result = null; processProduct(item); render(); return; }
      item.staged.mapping[el.dataset.header] = el.value || null;
      item.result = processStaged(item.staged);
      render();
    },

    'apply-date-format'(el) {
      state.settings.dateFormat = el.dataset.value;
      saveSettings();
      reprocessAll();
      render();
      FP.ui.toast(`Formato de fecha: ${C.import.dateFormats[el.dataset.value]}`);
    },

    'set-setting'(el) {
      const key = el.dataset.key;
      if (key === 'tolerance') {
        const v = FP.normalize.normalizeNumber(el.value).value;
        if (v === null || v < 0 || v > 50) { FP.ui.toast('La tolerancia debe estar entre 0 % y 50 %.'); render(); return; }
        state.settings.tolerance = v / 100;
      } else if (key === 'includeErrorRows') state.settings.includeErrorRows = el.checked;
      else state.settings[key] = el.value;
      saveSettings();
      reprocessAll();
      render();
    },

    'issue-filter'(el) { state.staging.issueFilter = el.dataset.value; render(); },

    'discard-staged'() {
      const item = activeItem();
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      render();
    },

    'commit-staged'() {
      const item = activeItem();
      if (item && item.staged.dataType === 'products') { commitProduct(item); return; }
      item.result = processStaged(item.staged); // revalida contra lo guardado en este momento
      if (!item.result.canImport) { render(); FP.ui.toast('Corrige el mapeo antes de importar.'); return; }
      const batch = ST.commitBatch(state.store, item.staged, item.result,
        { includeErrorRows: state.settings.includeErrorRows, settings: state.settings });
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      reprocessAll(); // los pendientes pueden duplicar lo recién importado
      saveStore([batch.dataType]);
      invalidatePlanning();
      const years = ST.years(state.store, batch.dataType);
      if ((batch.dataType === 'plan' || batch.dataType === 'actual') && years.length && !years.includes(state.year)) loadYearScoped(years[years.length - 1]);
      refresh();
      render();
      FP.ui.toast(`Importadas ${batch.accepted} filas de ${batch.fileName}${batch.rejected ? `; ${batch.rejected} quedaron fuera` : ''}.`);
    },

    /* ----- Fase 1: calidad y datos ----- */
    'quality-type'(el) { state.qualityType = el.dataset.value; render(); },
    'data-type'(el) { state.dataFilters.dataType = el.dataset.value; state.dataFilters.page = 1; render(); },
    'data-filter'(el) { state.dataFilters[el.dataset.key] = el.value; state.dataFilters.page = 1; render(); },
    'data-page'(el) { state.dataFilters.page = Number(el.dataset.value); render(); },

    'remove-batch'(el) {
      const b = ST.allBatches(state.store).find((x) => x.id === el.dataset.id);
      if (!b || !root.confirm(`¿Quitar "${b.fileName}" y sus ${b.accepted} registros?`)) return;
      ST.removeBatch(state.store, b.id);
      saveStore([b.dataType]);
      invalidatePlanning();
      reprocessAll();
      refresh();
      render();
      FP.ui.toast(`${b.fileName} quitado`);
    },

    /* ----- Fase 2: estacionalidad y plan ----- */
    'season-channel'(el) { state.planning.seasonalityChannel = el.dataset.value; render(); },

    /* ----- Fase 7: guía, ayuda y navegación ----- */
    help(el) { FP.help.open(el.dataset.id); },
    'help-section'() {
      const v = FP.guidanceConfig.VIEWS[state.view];
      if (v) FP.help.open(v.help, `Ayuda: ${v.title}`);
    },
    glossary() { FP.help.openGlossary(); },
    'glossary-search'(el) { FP.help.filterGlossary(el.value); },
    'help-close'() { FP.help.close(); },
    go(el) {
      FP.help.close();
      const v = el.dataset.view;
      if (root.location.hash === `#${v}`) render(); else root.location.hash = v;
    },
    'ux-mode'(el) { state.ux.mode = el.dataset.value === 'exec' ? 'exec' : 'analyst'; render(); },
    'home-setting'(el) {
      const h = state.ux.home;
      if (el.dataset.key === 'channel') { h.channel = el.value; state.ux.ctx.channel = el.value; }
      else if (el.value === 'year') { h.periodType = 'year'; h.periodKey = String(state.year); state.ux.ctx.periodType = 'year'; state.ux.ctx.periodKey = String(state.year); }
      else { h.periodType = 'month'; h.periodKey = el.value; state.ux.ctx.periodType = 'month'; state.ux.ctx.periodKey = el.value; }
      state.ux.ctxNote = null;
      render();
    },
    'mx-select'(el) { state.ux.measureAction = el.dataset.id; render(); },
    'tour-start'() { tourGo(state.ux.tour.step || 0); },
    'tour-restart'() { tourGo(0); },
    'tour-next'() {
      const n = FP.tour.steps().length;
      if (state.ux.tour.step >= n - 1) { state.ux.tour = { active: false, step: 0 }; render(); FP.ui.toast('Recorrido terminado. Puedes volver a iniciarlo desde "¿Cómo funciona?".'); return; }
      tourGo(state.ux.tour.step + 1);
    },
    'tour-prev'() { tourGo(Math.max(0, state.ux.tour.step - 1)); },
    'tour-exit'() { state.ux.tour.active = false; render(); FP.ui.toast(`Recorrido pausado en el paso ${state.ux.tour.step + 1}. Puedes retomarlo cuando quieras.`); },

    /* ----- Fase 8.2: Business Setup ----- */
    'bc-field'(el) {
      const path = el.dataset.path;
      let v = el.value;
      if (path.endsWith('.relevant')) v = v === 'true' ? true : v === 'false' ? false : null;
      else if (path === 'purchaseBehavior.cycleDays') v = v === '' ? null : Number(v);
      setPath(state.bc.draft, path, v);
      state.bc.dirty = true; render();
    },
    'bc-toggle'(el) {
      const list = getPath(state.bc.draft, el.dataset.path) || [];
      const next = el.checked ? [...new Set([...list, el.value])] : list.filter((x) => x !== el.value);
      setPath(state.bc.draft, el.dataset.path, next);
      state.bc.dirty = true; render();
    },
    'bc-levels'(el) { setPath(state.bc.draft, el.dataset.path, parseLevels(el.value)); state.bc.dirty = true; render(); },
    'bc-preset'(el) { setPath(state.bc.draft, el.dataset.path, parseLevels(el.dataset.value)); state.bc.dirty = true; render(); },
    'bc-list'(el) { setPath(state.bc.draft, el.dataset.path, String(el.value).split(',').map((x) => x.trim()).filter(Boolean)); state.bc.dirty = true; render(); },
    'bc-seed'() { state.bc.draft = seedBusinessContext(); state.bc.dirty = true; render(); FP.ui.toast('Propuesta a partir de la configuración y los datos actuales. Revisa y guarda.'); },
    'bc-save'() {
      const ctx = BCX.normalize(state.bc.draft);
      const v = BCX.validate(ctx);
      if (!v.ok) { FP.ui.toast(v.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ')); return; }
      if (!storage.save(K.businessContext, ctx)) { FP.ui.toast('No se pudo guardar el contexto del negocio en este navegador.'); return; }
      const env = storage.load(K.businessContext);
      state.bc = { draft: ctx, storedAt: env ? env.savedAt : null, dirty: false };
      render();
      FP.ui.toast('Contexto del negocio guardado. Moneda, nombre y terminología se aplican al recargar la app.');
    },
    'bc-reload'() { location.reload(); },
    'bc-clear'() {
      if (!confirm('¿Quitar el contexto del negocio? La app volverá a sus valores por defecto al recargar. Tus datos no se tocan.')) return;
      storage.remove(K.businessContext);
      loadBusinessContext(); render();
      FP.ui.toast('Contexto quitado. Recarga la app para volver a los valores por defecto.');
    },
    'bc-export'() {
      const env = storage.load(K.businessContext);
      if (!env) return;
      FP.exporter.download('business_context.json', BCX.toExport(BCX.normalize(env.data), { savedAt: env.savedAt, app: C.app.name, version: C.app.version }));
    },
    async 'bc-import'(el) {
      const f = el.files && el.files[0]; el.value = '';
      if (!f) return;
      let json;
      try { json = JSON.parse(await f.text()); } catch (e) { FP.ui.toast('El archivo no es JSON válido.'); return; }
      const r = BCX.fromImport(json);
      if (!r.ok) { FP.ui.toast(r.error); return; }
      state.bc.draft = r.ctx; state.bc.dirty = true; render();
      FP.ui.toast(`Contexto importado de ${f.name}. Revisa y pulsa "Guardar" para usarlo.`);
    },

    /* ----- Fase 8.1: productos e IndexedDB ----- */
    'p-policy'(el) { const item = activeItem(); if (item) item.policy = el.value === 'replace' ? 'replace' : 'keep'; },
    'p-kind'(el) {
      const item = activeItem();
      if (!item || item.staged.dataType !== 'products') return;
      item.staged.kind = el.value === 'funnel' ? 'funnel' : 'sales';
      item.staged.mapping = FP.productStore.suggestMapping(item.staged.headers, item.staged.kind);
      item.result = null; processProduct(item); render();
    },
    'p-mock'() {
      const g = FP.mockProducts.generate();
      addProductStaged(FP.productImport.stage(g.sales, { fileName: 'productos_venta_ago_sep_2026.csv', kind: 'sales' }));
      addProductStaged(FP.productImport.stage(g.funnel, { fileName: 'productos_funnel_ago_sep_2026.csv', kind: 'funnel' }));
      location.hash = '#carga';
      FP.ui.toast('Archivos de prueba de productos en revisión (venta y funnel). Nada se guarda hasta confirmar.');
    },
    'p-mock-quality'() {
      addProductStaged(FP.productImport.stage(FP.mockProducts.qualityCase(), { fileName: 'productos_caso_calidad.csv' }));
      location.hash = '#carga';
    },
    'pa-setting'(el) {
      const pa = state.pa, k = el.dataset.key;
      if (k === 'topN') { pa.topN = Number(el.value); pa.page = 1; render(); return; }
      if ((k === 'from' || k === 'to') && !Cal.isValidISODate(el.value)) { FP.ui.toast('Fecha inválida.'); render(); return; }
      pa[k] = el.value; pa.note = null;
      if (k === 'channel') state.ux.ctx.channel = el.value;
      if (pa.from && pa.to && pa.from > pa.to) { FP.ui.toast('"Desde" debe ser anterior a "Hasta".'); return; }
      pa.result = null; render();
    },
    'pa-viewby'(el) { state.pa.viewBy = el.dataset.value; state.pa.path = {}; state.pa.result = null; state.pa.trace = null; render(); },
    'pa-drill'(el) {
      const pa = state.pa, lvl = paLevel(pa);
      if (!lvl || lvl === 'sku' || (pa.viewBy === 'geo' && lvl === 'branch')) return;
      pa.path = { ...pa.path, [lvl]: el.dataset.key }; pa.result = null; pa.trace = null; render();
    },
    'pa-up'(el) {
      const pa = state.pa, order = paChainOrder(pa);
      const lv = el.dataset.level;
      if (lv === 'root' || lv === null) pa.path = {};
      else { const i = order.indexOf(lv); const p = {}; order.slice(0, i + 1).forEach((k) => { if (pa.path[k]) p[k] = pa.path[k]; }); pa.path = p; }
      pa.result = null; pa.trace = null; render();
    },
    'pa-page'(el) { state.pa.page = Number(el.dataset.value); render(); },
    async 'pa-trace'(el) {
      const pa = state.pa;
      const rows = await FP.productStore.skuTrace({ sku: el.dataset.key, from: pa.result.baseline.from < pa.from ? pa.result.baseline.from : pa.from, to: pa.to, channel: pa.channel });
      pa.trace = { sku: el.dataset.key, rows }; render();
      const t = document.getElementById('pa-trace'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'pa-trace-close'() { state.pa.trace = null; render(); },
    'pa-from-dx'() {
      const x = FP.productAnalysis.fromDiagnosis(state.dx.run);
      if (!x) return;
      Object.assign(state.pa, { from: x.from, to: x.to, channel: x.channel, comparison: x.comparison, note: x.note, result: null });
      render();
    },
    async 'pa-export'() {
      const r = state.pa.result;
      if (!r) { FP.ui.toast('Todavía no hay análisis de productos para exportar.'); return; }
      const obj = FP.categoryProductExport.buildCategoryProductExport(r, { batches: await FP.productStore.listBatches(), diagnosis: state.dx.run, cutoff: state.fc.run ? state.fc.run.cutoff : null });
      FP.exporter.download(`category_product_analysis_export_${r.period.from}_${r.period.to}.json`, obj);
    },
    async 'storage-tests'() {
      state.pa.testing = true; render();
      state.pa.tests = await FP.storageTests.run();
      state.pa.testing = false; render();
      FP.ui.toast(`Pruebas de almacenamiento: ${state.pa.tests.passed} de ${state.pa.tests.total} correctas.`);
    },
    async 'storage-retry'() {
      const st = await FP.app.retryMigration();
      render();
      FP.ui.toast(st.status === 'verified' ? 'Migración verificada. localStorage se conserva como respaldo.' : `La migración no se pudo verificar: ${st.error || st.status}.`);
    },

    /* ----- Fase 6: Recovery Center ----- */
    'rc-setting'(el) {
      const s = state.rc.settings;
      s[el.dataset.key] = el.value;
      saveRecoverySettings(); render();
    },
    'rc-ptype'(el) { state.rc.settings.periodType = el.dataset.value; state.rc.settings.periodKey = null; saveRecoverySettings(); render(); },
    'rc-constraint'(el) {
      const raw = String(el.value).trim();
      const v = raw === '' ? null : FP.normalize.normalizeNumber(raw).value;
      if (raw !== '' && (v === null || v < 0)) { FP.ui.toast('La restricción debe ser un número positivo.'); render(); return; }
      state.rc.constraints[el.dataset.key] = v === null ? null : v / Number(el.dataset.scale || 1);
      saveRecoverySettings(); render();
    },
    'rc-draft'(el) {
      const d = state.rc.draft;
      d[el.dataset.key] = el.value;
      if (el.dataset.key === 'crMode' || el.dataset.key === 'aovMode') d[el.dataset.key === 'crMode' ? 'crValue' : 'aovValue'] = 0;
      render();
    },
    'rc-draft-reset'() { state.rc.draft = emptyDraft(); render(); },
    'rc-target-pct'(el) { state.rc.settings.targetPct = Number(el.dataset.value); saveRecoverySettings(); render(); },
    'rc-use-alt'(el) {
      const ro = state.rc.analysis && state.rc.analysis.recoveryOptions;
      const alt = ro && ro.alternatives.find((a) => a.id === el.dataset.id);
      if (!alt) return;
      const c = alt.changes;
      state.rc.draft = { ...state.rc.draft, trafficPct: +((c.trafficPct || 0) * 100).toFixed(4), crMode: c.crMode || 'pp',
        crValue: +((c.crValue || 0) * 100).toFixed(6), aovMode: 'pct', aovValue: +((c.aovValue || 0) * 100).toFixed(4), target: 'channel',
        name: `Recuperar ${Math.round(state.rc.settings.targetPct * 100)} % · ${alt.label}`, supersedes: null };
      render();
      document.getElementById('rc-simulator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'rc-save-scenario'() {
      const rc = state.rc;
      if (!rc.preview || !rc.preview.valid) { FP.ui.toast('El escenario no es válido; revisa los mensajes.'); return; }
      const hyp = rc.analysis.hypotheses.find((h) => h.id === rc.draft.hypothesisId) || null;
      const sc = FP.scenarioEngine.saveScenario(rc.scenarioStore, { ctx: rc.ctx, result: rc.preview, name: rc.draft.name, type: rc.draft.type,
        supersedes: rc.draft.supersedes || null,
        links: hyp ? { hypothesisId: hyp.id, hypothesis: hyp.hypothesis, signalIds: hyp.relatedSignals || [], driver: hyp.driver || null,
          diagnosisComparison: rc.diagnosis ? rc.diagnosis.comparison.id : null } : {} });
      saveScenarios();
      rc.selected = [...new Set([...rc.selected, sc.scenarioId])];
      rc.draft = { ...emptyDraft() };
      render();
      FP.ui.toast(`Escenario ${sc.scenarioId} guardado. Es una simulación: plan, forecast y reforecast no cambian.`);
    },
    'rc-edit-scenario'(el) {
      const sc = state.rc.scenarioStore.scenarios.find((s) => s.scenarioId === el.dataset.id);
      if (!sc) return;
      const c = sc.inputs;
      state.rc.draft = { trafficPct: +(c.trafficPct * 100).toFixed(4), crMode: c.crMode, crValue: +(c.crValue * 100).toFixed(6), aovMode: c.aovMode,
        aovValue: c.aovMode === 'abs' ? c.aovValue : +(c.aovValue * 100).toFixed(4),
        target: sc.target && sc.target.type === 'segment' ? `${sc.target.dimension}::${sc.target.segment}` : 'channel',
        hypothesisId: sc.links.hypothesisId || '', name: sc.name, type: sc.type, supersedes: sc.scenarioId };
      render();
      document.getElementById('rc-simulator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'rc-select'(el) {
      const id = el.dataset.id; const rc = state.rc;
      rc.selected = el.checked ? [...new Set([...rc.selected, id])] : rc.selected.filter((x) => x !== id);
      render();
    },
    'rc-action-scenario'(el) { state.rc.actionScenario = el.value; state.rc.ai = { status: 'idle', actions: [], errors: [] }; render(); },
    'rc-library-driver'(el) { state.rc.libraryDriver = el.value; render(); },
    'rc-add-action'(el) { addActionFrom(FP.actionLibrary.all(state.rc.custom).find((a) => a.actionId === el.dataset.id), 'catalog'); },
    'rc-add-ai-action'(el) {
      const a = state.rc.ai.actions[Number(el.dataset.index)];
      if (a) addActionFrom({ actionId: a.actionId, name: a.action, description: a.rationale, driver: a.relatedDriver, measurementMetric: a.relatedDriver,
        defaultWindowDays: null, signalIds: a.relatedSignals }, 'cohere');
    },
    'rc-add-custom'() {
      const v = (id) => document.getElementById(id).value;
      const r = FP.actionLibrary.validateCustom({ name: v('rc-cu-name'), driver: v('rc-cu-driver'), ownerArea: v('rc-cu-owner'), defaultWindowDays: v('rc-cu-days'), description: v('rc-cu-desc') });
      if (!r.ok) { FP.ui.toast(r.errors.join(' ')); return; }
      state.rc.custom.push(r.action);
      storage.save(K.actionLibraryCustom, state.rc.custom);
      render(); FP.ui.toast('Acción agregada al catálogo.');
    },
    async 'rc-ai'() {
      const rc = state.rc;
      const sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === rc.actionScenario);
      const hyp = sc ? rc.analysis.hypotheses.find((h) => h.id === sc.links.hypothesisId) : null;
      if (!state.dx.apiKey) { FP.ui.toast('Pega tu API key de Cohere en la pestaña de diagnóstico.'); return; }
      rc.ai = { status: 'busy', actions: [], errors: [] }; render();
      const input = { hypothesis: hyp || (sc ? { id: sc.links.hypothesisId, hypothesis: sc.links.hypothesis, driver: sc.links.driver } : null),
        signals: rc.analysis.signals.filter((s) => (sc ? sc.links.signalIds : []).includes(s.id)), scenario: sc,
        availableDimensions: rc.analysis.dataQuality.availableTargets, dataQuality: { diagnosis: rc.diagnosis ? rc.diagnosis.confidence.level : null },
        constraints: rc.constraints, catalog: FP.actionLibrary.applicable(rc.custom, { driver: sc ? sc.links.driver : null }) };
      const res = await FP.cohereActions.suggestActions(input, { apiKey: state.dx.apiKey, model: state.dx.model });
      rc.ai = { status: res.status, actions: res.actions, errors: res.errors };
      render();
      FP.ui.toast(res.ok ? `Cohere propuso ${res.actions.length} líneas de acción (requieren validación).` : 'Análisis con IA no disponible; el resto del módulo sigue funcionando.');
    },
    'rc-action-field'(el) {
      const r = FP.actionPlan.updateAction(state.rc.plan, el.dataset.id, { [el.dataset.key]: el.value || null });
      if (!r.ok) { FP.ui.toast(r.error); return; }
      saveActionPlan(); render();
    },
    'rc-measure'(el) {
      const r = FP.actionTracking.recordMeasurement(state.rc.plan, { actionId: el.dataset.id, scenarios: state.rc.scenarioStore.scenarios,
        store: state.store, run: ensureForecast() });
      if (!r.ok) { FP.ui.toast(r.error); return; }
      saveActionPlan(); render();
      FP.ui.toast(r.measurement.statement);
    },
    'rc-tree-action'(el) { state.rc.treeActionId = el.dataset.id; render(); document.getElementById('rc-tree').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'rc-tree-select'(el) { state.rc.treeActionId = el.value; render(); },
    async 'rc-import'(el) {
      const f = el.files && el.files[0]; el.value = '';
      if (!f) return;
      let json;
      try { json = JSON.parse(await f.text()); } catch (e) { FP.ui.toast('El archivo no es JSON válido.'); return; }
      const r = el.dataset.kind === 'analysis' ? FP.recoveryEngine.contextFromAnalysisExport(json, f.name) : FP.recoveryEngine.contextFromReforecastExport(json, f.name);
      if (!r.ok) { FP.ui.toast(r.error); return; }
      state.rc.imported = r.ctx; state.rc.draft = emptyDraft(); render();
      FP.ui.toast(`Contexto importado de ${f.name}. Los datos de la app no cambian.`);
    },
    'rc-clear-import'() { state.rc.imported = null; state.rc.draft = emptyDraft(); render(); },
    'rc-export'() {
      const a = ensureRecovery();
      if (!a) return;
      const obj = FP.actionPlanExport.buildActionPlanExport(a, { scenarioStore: state.rc.scenarioStore, actionPlan: state.rc.plan,
        constraints: state.rc.constraints, diagnosis: state.rc.diagnosis });
      FP.exporter.download(`action_plan_export_${(state.rc.ctx.period.key || state.rc.ctx.period.start || 'periodo')}.json`, obj);
    },

    /* ----- Fase 5: diagnóstico ----- */
    'dx-setting'(el) {
      state.dx.settings[el.dataset.key] = el.value;
      state.dx.run = null;
      saveDiagnosticSettings();
      render();
    },
    'dx-period-type'(el) {
      state.dx.settings.periodType = el.dataset.value;
      state.dx.settings.periodKey = null;
      state.dx.run = null;
      saveDiagnosticSettings();
      render();
    },
    'dx-toggle-signals'() { state.dx.showAllSignals = !state.dx.showAllSignals; render(); },
    'dx-key'(el) { state.dx.apiKey = el.value.trim(); saveDiagnosticSettings(); },
    'dx-remember'(el) { state.dx.rememberKey = el.checked; saveDiagnosticSettings(); render(); },
    'dx-model'(el) { state.dx.model = el.value.trim() || C.diagnostics.cohere.model; saveDiagnosticSettings(); },
    async 'dx-ai'() {
      const d = ensureDiagnostic();
      const key = (document.getElementById('dx-key-input') || {}).value;
      if (key !== undefined) state.dx.apiKey = key.trim();
      if (!state.dx.apiKey) { FP.ui.toast('Pega tu API key de Cohere para generar hipótesis con IA.'); return; }
      state.dx.ai = { status: 'busy', result: null };
      render();
      const result = await FP.cohereDiagnostic.generateWithCohere(d, { apiKey: state.dx.apiKey, model: state.dx.model });
      if (state.dx.run !== d) return; // el diagnóstico cambió mientras esperábamos
      state.dx.ai = { status: result.status, result };
      render();
      FP.ui.toast(result.ok ? `Cohere redactó ${result.hypotheses.length} hipótesis validadas.` : 'Análisis con IA no disponible; el diagnóstico sigue completo.');
    },
    'dx-export'() {
      const d = ensureDiagnostic();
      if (!d) { FP.ui.toast('No hay diagnóstico para exportar.'); return; }
      const cp = state.pa.result && (state.pa.channel === (d.channel && d.channel.id)) ? state.pa.result : null;
      const obj = FP.analysisExport.buildAnalysisExport(d, { run: state.fc.run, rf: state.rf.run, ai: state.dx.ai.result, categoryProduct: cp });
      FP.exporter.download(`analysis_export_${d.period.key}_${d.channel.id}.json`, obj);
    },
    'dx-from-forecast'() {
      Object.assign(state.dx.settings, { comparison: 'forecast_vs_plan', periodType: 'year', periodKey: String(state.year), channel: state.fc.channel || 'total' });
      state.dx.run = null; saveDiagnosticSettings();
      root.location.hash = '#diagnostico';
    },
    'dx-from-reforecast'() {
      const rf = state.rf.run;
      const h = rf ? rf.total.horizon : null;
      Object.assign(state.dx.settings, { comparison: 'reforecast_vs_forecast', periodType: h && h.type === 'month' ? 'month' : 'year',
        periodKey: h ? h.key : String(state.year), channel: state.rf.channel || 'total' });
      state.dx.run = null; saveDiagnosticSettings();
      root.location.hash = '#diagnostico';
    },

    /* ----- Fase 4: reforecast ----- */
    'rf-setting'(el) {
      const r = state.rf;
      let v = el.value;
      if (el.type === 'number') {
        const n = FP.normalize.normalizeNumber(el.value).value;
        if (n === null || n < 0) { FP.ui.toast('Escribe un número válido (0 o mayor).'); render(); return; }
        v = n;
      }
      r.settings[el.dataset.key] = v;
      saveReforecastSettings();
      r.run = null;
      render();
    },
    'rf-sim'() {
      const v = document.getElementById('rf-sim').value;
      if (!v || !Cal.isValidISODate(v)) { FP.ui.toast('Elige una fecha válida para simular.'); return; }
      state.rf.simDate = v; state.rf.simForecast = null; state.rf.run = null;
      render();
      FP.ui.toast(`Simulación al ${v}: escenario temporal, los datos no cambian.`);
    },
    'rf-sim-exit'() { state.rf.simDate = null; state.rf.simForecast = null; state.rf.run = null; render(); },
    'rf-metric'(el) { state.rf.metric = el.dataset.value; render(); },
    'rf-channel'(el) { state.rf.channel = el.value; render(); },
    'rf-period'(el) { state.rf.period = el.dataset.value; render(); },
    'rf-table-channel'(el) { state.rf.tableChannel = el.value; render(); },
    'rf-month'(el) { state.rf.month = el.value; render(); },
    'rf-snapshot'() {
      const rf = ensureReforecast();
      if (!rf) return;
      const v = FP.reforecastVersioning.createSnapshot(state.rf.registry, rf);
      saveReforecastRegistry();
      render();
      FP.ui.toast(`Reforecast guardado como ${v.reforecastVersion}${v.simulated ? ' (simulado)' : ''}. Las versiones anteriores no cambian.`);
    },
    'rf-export'() {
      const rf = ensureReforecast();
      if (!rf) return;
      const obj = FP.reforecastExport.buildReforecastExport(rf, { registry: state.rf.registry,
        change: FP.reforecastVersioning.reforecastChange(state.rf.registry, rf) });
      FP.exporter.download(`reforecast_export_${rf.referenceDate}.json`, obj);
    },

    /* ----- Fase 3: pacing y forecast ----- */
    'fc-setting'(el) {
      const fc = state.fc;
      const key = el.dataset.key;
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') {
        const n = FP.normalize.normalizeNumber(el.value).value;
        if (n === null || n < 0) { FP.ui.toast('Escribe un número válido.'); render(); return; }
        v = el.dataset.pct ? n / 100 : n;
      } else v = el.value;
      if (key === 'referenceDate' && v && !Cal.isValidISODate(v)) { FP.ui.toast('Fecha de referencia inválida.'); render(); return; }
      const [a, b] = key.split('.');
      if (b) fc.settings[a] = { ...(fc.settings[a] || {}), [b]: v };
      else if (key === 'referenceDate' && !v) delete fc.settings.referenceDate;
      else fc.settings[a] = v;
      saveForecastSettings();
      fc.run = null;
      render();
    },
    'fc-ref-last'() {
      if (!state.fc.lastActualDate) return;
      state.fc.settings.referenceDate = state.fc.lastActualDate;
      saveForecastSettings(); state.fc.run = null; render();
      FP.ui.toast(`Fecha de referencia fijada en ${state.fc.lastActualDate}, último día con real.`);
    },
    'fc-ref-today'() { delete state.fc.settings.referenceDate; saveForecastSettings(); state.fc.run = null; render(); },
    'fc-metric'(el) { state.fc.metric = el.dataset.value; render(); },
    'fc-channel'(el) { state.fc.channel = el.value; render(); },
    'fc-period'(el) { state.fc.period = el.dataset.value; render(); },
    'fc-table-channel'(el) { state.fc.tableChannel = el.value; render(); },
    'fc-month'(el) { state.fc.month = el.value; render(); },
    'fc-snapshot'() {
      const run = ensureForecast();
      const v = FP.forecastVersioning.createSnapshot(state.fc.registry, run);
      saveForecastRegistry();
      render();
      FP.ui.toast(`Forecast guardado como ${v.forecastVersion} (referencia ${v.referenceDate}, método ${v.method.id}). Las versiones anteriores no cambian.`);
    },
    'fc-export'() {
      const run = ensureForecast();
      const change = FP.forecastVersioning.forecastChange(state.fc.registry, run);
      const obj = FP.forecastExport.buildForecastExport(run, { targets: state.targets, registry: state.fc.registry, change });
      FP.exporter.download(`forecast_export_${run.referenceDate}.json`, obj);
    },
    'fc-reset'() {
      state.fc.settings = {};
      saveForecastSettings(); state.fc.run = null; render();
      FP.ui.toast('Parámetros del forecast restablecidos');
    },

    'plan-preview'() {
      const ps = state.planning;
      const t0 = Date.now();
      ps.preview = FP.planning.generatePlan({ year: state.year, targets: state.targets, store: state.store,
        events: state.events, settings: ps.settings, profiles: ensureProfiles() });
      ps.selected = 'preview';
      render();
      const v = ps.preview.validation;
      FP.ui.toast(`Vista previa generada en ${Date.now() - t0} ms: ${v.closed ? 'plan cerrado' : 'plan no cerrado, revisa las validaciones'}. Aún no se guarda.`);
    },

    'plan-save'() {
      const ps = state.planning;
      if (!ps.preview) return;
      const v = FP.planning.savePlan(ps.registry, ps.preview);
      ps.preview = null;
      ps.selected = v.id;
      savePlanRegistry();
      refresh();
      render();
      FP.ui.toast(v.type === 'original_distributed_plan' ? 'Plan distribuido original guardado y congelado' : `${v.label} guardada; el plan original no cambió`);
    },

    'plan-discard'() {
      const ps = state.planning;
      ps.preview = null;
      ps.selected = ps.registry.currentId || null;
      render();
    },

    'plan-version'(el) { state.planning.selected = el.value; render(); },

    'plan-filter'(el) {
      const f = state.planning.filters;
      f[el.dataset.key] = el.value;
      if (el.dataset.key !== 'week') f.week = 'all';
      render();
    },

    'plan-export'() {
      const ps = state.planning;
      const plan = ps.current;
      if (!plan) return;
      const version = plan.versionId ? ps.registry.versions.find((v) => v.id === plan.versionId) : null;
      FP.exporter.download(`planning_export_${state.year}${version ? '_' + version.id : '_preview'}.json`, FP.planningExport.buildPlanningExport(plan, { version }));
    },

    'plan-setting'(el) {
      const s = state.planning.settings;
      const key = el.dataset.key, sub = el.dataset.sub;
      const num = () => { const v = FP.normalize.normalizeNumber(el.value).value; return v === null || v < 0 ? null : v; };
      if (key === 'useExplicitPlan') s.useExplicitPlan = el.checked;
      else if (key === 'method' || key === 'smoothing') s[key] = el.value;
      else if (key === 'historicalPeriod') s.historicalPeriod = { ...(s.historicalPeriod || C.planning.historicalPeriod), [sub]: el.value || null };
      else if (key === 'componentWeights') {
        const v = num();
        if (v === null || v > 1) { FP.ui.toast('La intensidad debe estar entre 0 y 1.'); render(); return; }
        s.componentWeights = { ...(s.componentWeights || {}), [sub]: v };
      } else {
        let v = num();
        if (v === null) { FP.ui.toast('Escribe un número válido.'); render(); return; }
        if (key === 'monthMinCoverage') v = Math.min(1, v / 100);
        if (key === 'minSamples') v = Math.max(1, Math.round(v));
        s[key] = v;
      }
      savePlanningSettings();
      invalidatePlanning();
      render();
    },

    'plan-assumption'(el) {
      const s = state.planning.settings;
      const raw = el.value.trim();
      const v = raw === '' ? null : FP.normalize.normalizeNumber(raw).value;
      if (raw !== '' && (v === null || v <= 0 || (el.dataset.key === 'conversionRate' && v > 1))) {
        FP.ui.toast(el.dataset.key === 'conversionRate' ? 'El CR es una fracción entre 0 y 1 (ej. 0.012).' : 'El AOV debe ser mayor a 0.');
        render(); return;
      }
      s.assumptions = s.assumptions || {};
      s.assumptions[el.dataset.channel] = { ...(s.assumptions[el.dataset.channel] || {}), [el.dataset.key]: v };
      savePlanningSettings();
      render();
    },

    'plan-settings-reset'() {
      state.planning.settings = {};
      savePlanningSettings();
      invalidatePlanning();
      render();
      FP.ui.toast('Configuración de planeación restablecida');
    },

    'plan-compare'() {
      FP.ui.toast('Comparando métodos…');
      setTimeout(() => {
        state.planning.comparison = FP.planning.compareMethods({ store: state.store, settings: state.planning.settings, year: state.year });
        render();
      }, 30);
    },

    export(el) {
      const kind = el.dataset.kind;
      const stamp = Cal.toISODate(new Date());
      const build = {
        normalized: () => FP.exporter.buildNormalizedExport(state.store, state.settings),
        errors: () => FP.exporter.buildErrorsExport(state.store),
        quality: () => FP.exporter.buildQualityExport(state.store),
        consolidated: () => FP.exporter.buildConsolidatedExport(state.store, state)
      }[kind];
      FP.exporter.download(`${kind === 'normalized' ? 'normalized_data' : kind === 'errors' ? 'data_errors' : kind === 'quality' ? 'data_quality' : 'consolidated_data'}_${stamp}.json`, build());
    },

    'export-csv'() {
      const t = state.dataFilters.dataType;
      const { headers, rows } = FP.exporter.normalizedCsvRows(state.store, t);
      FP.exporter.download(`normalized_${t}_${Cal.toISODate(new Date())}.csv`, FP.csv.stringify(headers, rows), 'text/csv');
    }
  };

  function saveTargetsFromForm(form) {
    const parse = FP.format.parseAmountInput;
    const fd = new FormData(form);
    const bad = [];
    const read = (name, label) => {
      const raw = String(fd.get(name) || '').trim();
      const v = parse(raw);
      if (raw && v === null) bad.push(label);
      if (v !== null && v < 0) { bad.push(label); return null; }
      return v;
    };
    const next = DM.createTargets(state.year);
    next.annual.revenue = read('annual', 'Meta anual');
    C.channels.forEach((c) => { next.byChannel[c.id].revenue = read(c.id, c.label); });
    if (bad.length) { FP.ui.toast(`Revisa estos montos: ${bad.join(', ')}. Usa números como 261000000 o 261M.`); return; }
    ['byMonth', 'byWeek', 'byDay'].forEach((k) => { next[k] = state.targets[k] || {}; });
    next.updatedAt = new Date().toISOString();
    state.targets = next;
    saveYearScoped();
    render();
    FP.ui.toast('Metas guardadas');
  }

  /** Recorrido guiado: activa el paso y navega a su vista. */
  function tourGo(i) {
    state.ux.tour = { active: true, step: i };
    const v = FP.tour.steps()[i].view;
    if (root.location.hash === `#${v}` || state.view === v && !root.location.hash) render(); else root.location.hash = v;
  }

  /** Crea una acción del plan ligada al escenario (y su hipótesis) seleccionado. */
  function addActionFrom(item, source) {
    const rc = state.rc;
    const sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === rc.actionScenario);
    if (!item || !sc || !sc.links.hypothesisId) { FP.ui.toast('La acción necesita un escenario guardado ligado a una hipótesis.'); return; }
    const hyp = rc.analysis.hypotheses.find((h) => h.id === sc.links.hypothesisId) || { id: sc.links.hypothesisId, hypothesis: sc.links.hypothesis };
    const today = Cal.toISODate(new Date());
    const win = item.defaultWindowDays || null;
    const start = rc.ctx.cutoff ? Cal.addDays(rc.ctx.cutoff, 1) : today;
    const a = FP.actionPlan.createAction(rc.plan, {
      title: item.name, description: item.description, catalogId: item.actionId, source,
      hypothesisId: hyp.id, hypothesis: hyp.hypothesis, scenarioId: sc.scenarioId, signalIds: item.signalIds || sc.links.signalIds,
      driver: item.driver, channel: rc.ctx.channel, period: { start: rc.ctx.period.start, end: rc.ctx.period.end, label: rc.ctx.period.label },
      expectedImpact: sc.expectedImpact, measurementMetric: item.measurementMetric || item.driver, windowDays: win,
      startDate: start, endDate: win ? Cal.addDays(start, win - 1) : rc.ctx.period.end,
      priority: FP.actionPlan.priorityFactors({ scenario: sc, hypothesis: hyp, periodEnd: rc.ctx.period.end, today: rc.ctx.referenceDate || today,
        constraintsExceeded: (sc.warnings || []).some((w) => /restricción/.test(w)) })
    });
    saveActionPlan();
    rc.treeActionId = a.actionId;
    render();
    FP.ui.toast(`${a.actionId} agregada como propuesta. No se ejecuta nada automáticamente.`);
  }

  /* ================= Arranque ================= */

  function readHash() {
    const v = (root.location.hash || '').replace('#', '');
    state.view = VIEWS.includes(v) ? v : 'inicio';
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button[data-action]');
      if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('select[data-action], input[data-action], textarea[data-action]');
      if (el && el.type === 'checkbox' && el.dataset.action === 'rc-select') { actions['rc-select'](el); return; }
      if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'targets-form') { e.preventDefault(); saveTargetsFromForm(e.target); }
    });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('input[data-action="glossary-search"]');
      if (el) FP.help.filterGlossary(el.value);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') FP.help.close(); });
    root.addEventListener('hashchange', () => {
      const prev = state.view;
      readHash();
      if (prev !== state.view) {
        // Contexto persistente: se lee de la vista que se deja y se aplica a la nueva (con nota si se ajusta)
        state.ux.ctx = FP.navigation.extractContext(prev, state);
        state.ux.ctxNote = FP.navigation.applyContext(state.view, state) || null;
      }
      render();
      if (!state.ux.tour.active) root.scrollTo(0, 0);
    });
  }

  /** Arranque del almacenamiento: abre IndexedDB y migra (sin borrar localStorage) antes de leer datos. */
  async function initStorage() {
    await repo.init();
    repo.onError = (msg) => FP.ui.toast(`No se pudo guardar en IndexedDB (${msg}). Exporta los datos como respaldo.`);
    migrationState = await FP.storageMigration.migrate({ ls: lsStorage, lsAdapter, repo });
    state.storageKind = storage.kind;
    state.storage = { mode: repo.mode, migration: migrationState, error: repo.lastError };
    if (FP.productStore) await FP.productStore.init(repo);
  }

  async function init() {
    try { await initStorage(); } catch (e) { state.storage = { mode: 'unavailable', migration: migrationState, error: String(e && e.message || e) }; }
    FP.ui.renderAppMeta();
    loadSettings();
    loadPlanningSettings();
    loadForecastSettings();
    loadReforecastSettings();
    loadDiagnosticSettings();
    loadRecovery();
    loadBusinessContext();
    loadUx();
    loadStore();
    loadYearScoped(C.defaultYear);
    const migrated = migrateLegacyDataset();
    if (migrated) saveStore();
    refresh();
    resetPeriod();
    state.selfTest = FP.selfTest.run();
    readHash();
    state.ux.ctxNote = FP.navigation.applyContext(state.view, state) || null;
    FP.navigation.markAnalystBlocks();
    bind();
    FP.ui.renderEdgeCases();
    render();
    if (migrated) FP.ui.toast('Los datos de la Fase 0 se migraron al nuevo modelo de carga.');
  }

  // Expuesto solo para depuración en consola (FP.app.state).
  FP.app = { state, actions, storage, repo, lsStorage, lsAdapter, retryMigration: async () => { migrationState = await FP.storageMigration.migrate({ ls: lsStorage, lsAdapter, repo, force: true }); state.storage.migration = migrationState; return migrationState; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
