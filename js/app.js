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
  const VIEWS = ['resumen', 'carga', 'calidad', 'datos', 'estacionalidad', 'plan', 'configuracion', 'pacing', 'reforecast', 'diagnostico', 'producto', 'analisis', 'recovery', 'inicio', 'medir', 'narrativa', 'ayuda', 'ajustes', 'paquete', 'segmentos', 'proyeccion'];
  const MOCK_ORIGIN = 'mock-fase0';

  const state = {
    productQuality: [],
    stOpen: {},   // qué desplegables de Configuración están abiertos (por id); todos cerrados al empezar
    qFilters: { section: 'all', rule: 'all', file: 'all', page: 1 },   // filtros y página del consolidado de cuarentena
    proj: { growth: 0.16, shares: null, channel: 'total', savedAt: null, savedTotal: null },   // Proyección del próximo año (en esta sesión)   // instantánea de los lotes de Productos para Calidad de datos (ver refreshProductQuality)
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
      // Fase 9.1: microlearning (una idea por evento real, una sola vez, solo en modo Aprendiz)
      learned: [], lesson: null,
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
    pkg: { busy: false, last: null },
    pa: { from: null, to: null, comparison: 'previous', channel: 'total', viewBy: 'category', drill: [], next: null, geo: {}, topN: 20, page: 1, result: null, loading: false, key: null,
      trace: null, counts: null, estimate: null, tests: null, testing: false, note: null },
    // Análisis 1: evolución histórica y patrones. La serie se calcula desde IndexedDB.
    an: { level: 'product', periodType: 'month', periodCount: 12, focusKey: null, comparison: 'previous', pattern: 'all', signal: 'all', anomalyDirection: 'all', entityQuery: '', minImpact: 0, page: 1, pageSize: 6, rows: [], advanced: [], groups: [], selected: null, loading: false, key: null, error: null, share: null, priorities: null, risks: null, forecast: null, cohort: null, forecastHorizon: 3, forecastMethod: 'linear', narrative: null, ai: { status: null, result: null, errors: [] } },
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
    },
    // Fase 9.2: narrativa ejecutiva. No tiene settings propios: narra el mismo canal/periodo/comparación
    // que Diagnóstico (state.dx.settings) — sin un segundo sistema de filtros.
    nx: {
      narrative: null, key: null,
      ai: { status: null, result: null, errors: [] }
    }
  };

  /*
   * Conexión Cohere única de la aplicación.
   * Todas las funcionalidades que usan Cohere (Diagnóstico, Narrativa, Recovery e Importación)
   * consultan este proveedor; no existe una segunda API key para importaciones.
   */
  FP.cohereConnection = {
    get() {
      return {
        apiKey: state.dx.apiKey || '',
        model: state.dx.model || C.diagnostics.cohere.model
      };
    },
    isConfigured() { return Boolean(state.dx.apiKey); }
  };

  /* ================= Persistencia ================= */

  function defaultSettings() {
    return {
      ...IMP.defaultSettings(),
      includeErrorRows: false,
      enableAI: C.import.enableAI !== false,
      customAIPrompt: C.import.customAIPrompt || ''
    };
  }

  function loadSettings() {
    const s = storage.load(K.settings);
    state.settings = { ...defaultSettings(), ...(s && s.data ? s.data : {}) };
    if (FP.importer && typeof FP.importer.setLearnedMappings === 'function') {
      FP.importer.setLearnedMappings(state.settings.aiHeaderAliases || {});
      if (FP.normalize && FP.normalize.setPersonalColumns) FP.normalize.setPersonalColumns(state.settings.piiColumns || []);   // Fase H3
    }
  }

  function loadStore() {
    C.dataTypeIds.forEach((t) => {
      const key = K[C.dataTypes[t].storageKey];
      const env = storage.load(key);
      if (env && ST.isChunkedManifest(env.data)) {
        // guardado por bloques: se leen los bloques y se sueltan de la caché (ya están en IndexedDB) para no duplicar la memoria
        const m = env.data;
        const r = ST.hydrateChunked(m, t, (i) => storage.load(ST.chunkKeyOf(key, m, i)));
        for (let i = 0; i < m.chunks; i++) storage.evict(ST.chunkKeyOf(key, m, i));
        state.store[t] = r.collection;
        // si se cargó todo, el siguiente guardado reutiliza los bloques llenos (solo escribe lo nuevo)
        if (!r.missingChunks && r.collection.records.length === m.total) ST.markSaved(r.collection, { count: m.total, stamps: Array.from({ length: m.chunks }, (_, i) => (m.stamps && m.stamps[i]) || m.stamp) });
        if (r.missingChunks) setTimeout(() => FP.ui.toast(`Faltan ${r.missingChunks} bloques de ${C.dataTypes[t].label} en el navegador: se cargó lo que había. Vuelve a importar el archivo si hace falta.`), 1500);
      } else state.store[t] = env ? ST.hydrateCollection(env.data, t) : ST.emptyCollection();
    });
  }

  /** Quita del almacenamiento los bloques de un índice guardado antes. */
  function dropChunks(key, manifest, keep = null) {
    if (!manifest || !ST.isChunkedManifest(manifest)) return;
    for (let i = 0; i < manifest.chunks; i++) { const k = ST.chunkKeyOf(key, manifest, i); if (!keep || !keep.has(k)) storage.remove(k); }
  }

  const savingChain = {};   // tipo → promesa: los guardados por bloques de un mismo tipo van uno tras otro
  /**
   * Guarda una colección grande por bloques de CHUNK_SIZE registros: nunca hay en memoria más de un bloque empaquetado, el índice se
   * escribe al final y los bloques del guardado anterior se borran después. Devuelve una promesa<boolean>.
   */
  function saveLargeCollection(t) {
    const key = K[C.dataTypes[t].storageKey], col = state.store[t];
    // foto de lo que hay ahora: si el usuario importa otra cosa mientras se guarda, esa tendrá su propio guardado a continuación
    const snap = { batches: col.batches.slice(), records: col.records.slice() };
    const reuse = ST.reusableChunks(col);   // bloques llenos del guardado anterior que siguen valiendo (importar solo agrega al final)
    const stamp = Date.now().toString(36); const n = Math.ceil(snap.records.length / ST.CHUNK_SIZE);
    const index = new Map(snap.batches.map((b, i) => [b.id, i]));
    const label = C.dataTypes[t].label;
    FP.ui.toast(`Guardando ${snap.records.length.toLocaleString('es-MX')} registros de ${label} en el navegador… no cierres la pestaña.`);
    const run = async () => {
      const prev = storage.load(key); const prevManifest = prev && prev.data;   // se lee al ejecutar (no al encolar): otro guardado pudo cambiarlo
      const stamps = reuse.stamps.slice(0, Math.min(reuse.n, n));
      if (prevManifest && !ST.isChunkedManifest(prevManifest)) stamps.length = 0;   // lo guardado no es por bloques: se escribe todo
      for (let i = stamps.length; i < n; i++) {
        const recs = ST.packRecords(snap, i * ST.CHUNK_SIZE, Math.min(snap.records.length, (i + 1) * ST.CHUNK_SIZE), index);
        const ok = await storage.saveAsync(ST.chunkKey(key, stamp, i), { format: 'packed-v1', batches: [], records: recs });
        if (!ok) throw new Error(storage.lastError || 'sin espacio');
        stamps[i] = stamp;
        await new Promise((r) => setTimeout(r, 0));   // cede el hilo: la página sigue respondiendo
      }
      const ok = storage.save(key, { format: 'packed-chunked-v1', stamp, stamps, chunks: n, total: snap.records.length, batches: snap.batches });
      if (!ok) throw new Error(storage.lastError || 'no se pudo escribir el índice');
      // verificación: se vuelve a leer el índice y el último bloque; si algo no quedó, se avisa (antes un fallo silencioso dejaba el archivo
      // «registrado» y, al recargar la página, sin registros)
      // lectura directa de IndexedDB (no de la caché en memoria): lo que se lee aquí es lo que hay en disco
      await repo.flush();   // el índice se escribe en cola: se espera a que termine antes de leerlo
      const back = await repo.kvRead(key); const lastBlock = n ? await repo.kvRead(ST.chunkKey(key, stamps[n - 1], n - 1)) : true;
      if (!back || !back.data || back.data.total !== snap.records.length || !lastBlock) throw new Error('no se pudo verificar lo guardado (el navegador no devolvió los datos al leerlos)');
      ST.markSaved(col, { count: snap.records.length, stamps });
      dropChunks(key, prevManifest, new Set(stamps.map((s, i) => ST.chunkKey(key, s, i))));   // solo los bloques del guardado anterior que ya no se usan
      state.saveFailure = null;
      FP.ui.toast(`${label}: ${snap.records.length.toLocaleString('es-MX')} registros guardados y verificados en el navegador.`);
      render();
      return true;
    };
    savingChain[t] = (savingChain[t] || Promise.resolve()).then(run).catch((e) => {
      const msg = `No se pudo guardar ${label} en el navegador (${e && e.message ? e.message : e}). Los datos siguen en esta sesión pero se perderán al cerrar o recargar la página.`;
      state.saveFailure = { dataType: t, message: msg };   // se queda visible (banner) hasta que un guardado funcione
      FP.ui.toast(msg);
      render();
      return false;
    });
    return savingChain[t];
  }

  function saveStore(types = C.dataTypeIds) {
    const ok = types.every((t) => {
      const key = K[C.dataTypes[t].storageKey];
      if (ST.CHUNK_THRESHOLD <= state.store[t].records.length && storage.chunkedAvailable) { saveLargeCollection(t); return true; }
      const prev = storage.load(key);
      const done = storage.save(key, ST.packCollection(state.store[t]));
      if (done && prev && ST.isChunkedManifest(prev.data)) dropChunks(key, prev.data);   // la colección volvió a ser pequeña
      return done;
    });
    if (!ok) FP.ui.toast(`No se pudo guardar en el navegador (${storage.lastError || 'sin espacio'}). Los datos siguen en esta sesión; exporta el JSON para no perderlos.`);
    return ok;
  }

  function saveSettings() { storage.save(K.settings, state.settings); }

  /** Equivalencias de nombres (homologación): se guardan aparte y las consultan los normalizadores al importar. */
  function loadAliases() { const s = storage.load(K.aliases); FP.aliases.set(s && s.data && Array.isArray(s.data.rules) ? s.data.rules : []); }
  function saveAliases() { storage.save(K.aliases, { rules: FP.aliases.rules() }); }

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
      s.periodKey = s.periodType === 'year' ? String(state.year) : s.periodType === 'month' ? defaultMonth(cutoff) : Cal.getWeekInfo(cutoff).weekKey;
      dx.run = null;
    }
    if (dx.run && dx.base === run && dx.baseRf === rf) return dx.run;
    dx.run = FP.diagnosticEngine.runDiagnostic({ comparison: s.comparison, period: { type: s.periodType, key: s.periodKey },
      channel: s.channel, metric: s.metric, method: s.method, run, rf, store: state.store, quality: state.quality });
    dx.base = run; dx.baseRf = rf;
    dx.ai = { status: null, result: null };
    return dx.run;
  }

  /**
   * Fase 9.2.x — Product Analysis para Narrativa, sin depender de haber visitado Categoría → Producto.
   * Reutiliza EXACTAMENTE el motor y la caché existentes (`ensureProductAnalysis`, `state.pa`) — no crea
   * un segundo selector ni una segunda implementación. Si ya hay un resultado (visitado antes, con SU
   * PROPIO alcance — canal/periodo/comparación/nivel), se respeta tal cual: nunca se reescribe para
   * forzarlo a coincidir con Diagnóstico. Solo cuando no existe ninguno se usa `fromDiagnosis(diag)` como
   * valor por defecto razonable, la primera vez — no es un forzado de alineación, es la única fuente de
   * verdad quedaría "sin calcular" de otro modo (§4, §9 del prompt de esta fase).
   * @returns Promise<boolean> — true si se acaba de calcular un resultado nuevo (antes no existía ninguno).
   */
  /**
   * Fase 11 · pieza 1 (opción A). Desglose de la VENTA por categoría, producto y región para el periodo y canal del diagnóstico, con el
   * mismo motor de Categoría → Producto (FP.productAnalysis.run). No parte la brecha en volumen × CR × AOV: los datos de producto no traen
   * sesiones por categoría. Corre aparte de la selección de la vista Producto (no la cambia) y guarda su resultado en state.dx.products.
   */
  async function ensureDiagnosticProducts(d) {
    const out = state.dx.products || (state.dx.products = { key: null, loading: false, result: null, error: null });
    const m = FP.productStore.available() ? FP.productStore.meta : null;
    if (!d || d.status !== 'ok' || !m || !m.batches) { out.key = null; out.result = null; out.available = Boolean(m && m.batches); return; }
    out.available = true;
    const x = FP.productAnalysis.fromDiagnosis(d);
    if (!x || !x.from || !x.to) return;
    const key = JSON.stringify([x.from, x.to, x.channel, x.comparison, m.batches]);
    if (out.key === key && (out.result || out.loading)) return;
    out.key = key; out.loading = true; out.error = null;
    try {
      const run = (level) => FP.productAnalysis.run({ from: x.from, to: x.to, comparison: x.comparison, channel: x.channel, level, withGeoSignals: false });
      const [category, product, region] = [await run('category'), await run('product'), await run('region')];
      if (out.key !== key) return;
      out.result = { from: x.from, to: x.to, channel: x.channel, comparison: x.comparison, note: x.note, category, product, region };
    } catch (e) { if (out.key === key) out.error = String(e && e.message ? e.message : e); }
    finally { if (out.key === key) out.loading = false; }
    if (state.view === 'diagnostico') FP.diagnosticView.renderProducts(state);
  }

  async function ensureProductAnalysisForNarrative(diag) {
    if (!FP.productStore.available()) return false;
    const m = FP.productStore.meta;
    if (!m || !m.batches) return false; // Caso D: no hay datos de producto cargados.
    if (state.pa.result) { await ensureProductAnalysis(); return false; } // Caso B/C: se respeta tal cual.
    const x = diag && FP.productAnalysis.fromDiagnosis(diag);
    if (x) Object.assign(state.pa, { from: x.from, to: x.to, channel: x.channel, comparison: x.comparison, note: x.note });
    await ensureProductAnalysis(); // Caso A: mismo motor, mismo caché; si no hay diag, usa sus propios valores por defecto.
    return Boolean(state.pa.result);
  }

  /**
   * Fase 9.2.x — Recovery para Narrativa. `ensureRecovery()` ya es síncrono (no toca IndexedDB); aquí
   * solo se decide, la primera vez que no hay ningún análisis calculado todavía, un canal/periodo por
   * defecto tomado de Diagnóstico — igual que con producto, nunca se reescribe un análisis ya existente.
   */
  function ensureRecoveryAnalysisForNarrative(diag) {
    if (!state.rc.analysis && !state.rc.imported && diag && diag.channel && diag.period && ['month', 'week', 'year'].includes(diag.period.type)) {
      const s = state.rc.settings;
      s.channel = diag.channel.id; s.periodType = diag.period.type;
      if (diag.period.type !== 'year') s.periodKey = diag.period.key;
    }
    return ensureRecovery();
  }

  /**
   * Fase 9.2 — Narrativa ejecutiva. No calcula nada por sí misma: reutiliza forecast/reforecast/diagnóstico
   * (síncronos) y dispara, sin bloquear el primer render, el cálculo determinístico de producto y recovery
   * si todavía no existían — así no hace falta haber visitado antes Categoría → Producto ni Recovery Center
   * (Fase 9.2.x). Cada fuente conserva su propio alcance; nunca se fuerza a coincidir con Diagnóstico.
   */
  function ensureNarrative() {
    const diag = ensureDiagnostic();
    const run = state.fc.run;
    if (!run) { state.nx.narrative = null; return null; }
    const rf = state.rf.run;
    ensureRecoveryAnalysisForNarrative(diag);
    const status = FP.contextEngine.collectStatus(state);
    const rebuild = () => {
      const pa = state.pa.result;
      const rcAnalysis = state.rc.analysis;
      const key = JSON.stringify([run.cutoff, diag && diag.status, diag && diag.generatedAt, state.pa.key, rcAnalysis && rcAnalysis.context, state.dx.settings]);
      if (state.nx.narrative && state.nx.key === key) return state.nx.narrative;
      state.nx.key = key;
      const gm = FP.productStore.available() && FP.productStore.meta;
      const hasGeoData = Boolean(gm && ((gm.states || []).length > 1 || (gm.branches || []).length > 1));
      state.nx.narrative = FP.narrativeEngine.build({ run, rf, diag, pa, rcAnalysis, status, channel: diag ? diag.channel.id : state.dx.settings.channel, hasGeoData });
      state.nx.ai = { status: null, result: null, errors: [] };
      return state.nx.narrative;
    };
    const result = rebuild();
    ensureProductAnalysisForNarrative(diag).then((changed) => {
      if (changed) { rebuild(); if (state.view === 'narrativa') FP.narrativeView.render(state); }
    });
    return result;
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
      if (s.periodType === 'month' && !(s.periodKey || '').match(new RegExp(`^${state.year}-\\d{2}$`))) s.periodKey = defaultMonth(cutoff);
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
  /**
   * Mes que abren por defecto Diagnóstico, Recovery Center y Narrativa: el mes de la fecha de corte, salvo que ese mes aún no tenga
   * ningún día con venta real (p. ej. el día 1): entonces el último mes con venta real. Solo aplica cuando no hay un mes elegido.
   */
  /** Rango de fechas de un periodo del diagnóstico (mes AAAA-MM, semana ISO o año). */
  function periodRange(type, key) {
    if (!key) return null;
    if (type === 'year') return { from: `${key}-01-01`, to: `${key}-12-31` };
    if (type === 'month') { const [y, m] = key.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` }; }
    const w = state.fc.run && state.fc.run.total.weeks.find((x) => x.key === key);
    return w ? { from: w.weekStart, to: w.weekEnd } : null;
  }

  function defaultMonth(cutoff) {
    const cm = cutoff.slice(0, 7);
    const last = lastActualDate();
    return last && last.startsWith(`${state.year}-`) && last.slice(0, 7) < cm ? last.slice(0, 7) : cm;
  }

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
  /**
   * Fase 10 · constructores de export. Cada uno hace exactamente lo que hacía su botón «Exportar …» y devuelve { file, obj };
   * si no hay datos devuelve { reason, missing } (lo usa el paquete para el archivo vacío con aviso). Los botones individuales
   * y el paquete usan estos mismos constructores, así que un archivo del paquete es idéntico al que se descarga desde su vista.
   */
  const EXPORT_BUILDERS = {
    forecast({ strict = true } = {}) {
      const run = ensureForecast();
      if (!run || (strict && run.plan.source === 'none')) return { reason: 'No hay plan para comparar ni forecast que proyectar.', missing: ['Meta y plan distribuido (o plan importado)'] };
      const change = FP.forecastVersioning.forecastChange(state.fc.registry, run);
      return { file: `forecast_export_${run.referenceDate}.json`, obj: FP.forecastExport.buildForecastExport(run, { targets: state.targets, registry: state.fc.registry, change }) };
    },
    reforecast() {
      const base = ensureForecast();
      if (!base || base.plan.source === 'none') return { reason: 'Sin plan no hay requerimiento que calcular.', missing: ['Meta y plan distribuido (o plan importado)'] };
      const rf = ensureReforecast();
      if (!rf) return { reason: 'No se pudo calcular el reforecast.', missing: ['Venta real del año'] };
      return { file: `reforecast_export_${rf.referenceDate}.json`, obj: FP.reforecastExport.buildReforecastExport(rf, { registry: state.rf.registry,
        change: FP.reforecastVersioning.reforecastChange(state.rf.registry, rf) }) };
    },
    analysis() {
      const d = ensureDiagnostic();
      if (!d) return { reason: 'No hay brecha que diagnosticar.', missing: ['Plan', 'Venta real del año'] };
      const cp = state.pa.result && (state.pa.channel === (d.channel && d.channel.id)) ? state.pa.result : null;
      return { file: `analysis_export_${d.period.key}_${d.channel.id}.json`, obj: FP.analysisExport.buildAnalysisExport(d, { run: state.fc.run, rf: state.rf.run, ai: state.dx.ai.result, categoryProduct: cp }) };
    },
    async categoryProduct() {
      if (!state.pa.result && FP.productStore.available() && (FP.productStore.meta || {}).batches) await ensureProductAnalysis();
      const r = state.pa.result;
      if (!r) return { reason: 'No hay datos de productos cargados.', missing: ['Archivo de venta por producto (y, si quieres CR y embudo, el de funnel de GA4)'] };
      const obj = FP.categoryProductExport.buildCategoryProductExport(r, { batches: await FP.productStore.listBatches(), diagnosis: state.dx.run, cutoff: state.fc.run ? state.fc.run.cutoff : null });
      return { file: `category_product_analysis_export_${r.period.from}_${r.period.to}.json`, obj };
    },
    actionPlan() {
      const base = ensureForecast();
      if (!base || base.plan.source === 'none') return { reason: 'Sin plan no hay brecha que recuperar.', missing: ['Meta y plan distribuido (o plan importado)', 'Venta real del año'] };
      const a = ensureRecovery();
      if (!a) return { reason: 'No se pudo preparar el Recovery Center.', missing: ['Venta real del año'] };
      return { file: `action_plan_export_${(state.rc.ctx.period.key || state.rc.ctx.period.start || 'periodo')}.json`,
        obj: FP.actionPlanExport.buildActionPlanExport(a, { scenarioStore: state.rc.scenarioStore, actionPlan: state.rc.plan, constraints: state.rc.constraints, diagnosis: state.rc.diagnosis }) };
    },
    narrative() {
      const base = ensureForecast();
      if (!base || base.plan.source === 'none') return { reason: 'No hay nada calculado que narrar.', missing: ['Meta y plan distribuido (o plan importado)', 'Venta real del año'] };
      const n = ensureNarrative();
      if (!n) return { reason: 'No hay narrativa calculada.', missing: ['Venta real del año'] };
      return { file: `narrative_export_${(n.period && n.period.key) || 'periodo'}_${n.channel.id}.json`, obj: FP.narrativeExport.buildNarrativeExport(n, { ai: state.nx.ai }) };
    },
    planning() {
      const ps = state.planning;
      if (!ps.current) resolveCurrentPlan();   // si no se ha abierto la vista Plan en esta sesión
      const plan = ps.current;
      if (!plan) return { reason: 'No hay plan distribuido.', missing: ['Meta anual por canal', 'Plan distribuido (vista Plan)'] };
      const version = plan.versionId ? ps.registry.versions.find((v) => v.id === plan.versionId) : null;
      return { file: `planning_export_${state.year}${version ? '_' + version.id : '_preview'}.json`, obj: FP.planningExport.buildPlanningExport(plan, { version }) };
    }
  };

  /** Vista previa del paquete (sin descargar): qué export trae datos y cuál viajaría vacío. Productos no se calcula aquí (es asíncrono). */
  function previewPackage() {
    const out = {};
    for (const def of FP.analysisPackage.EXPORTS) {
      if (def.key === 'categoryProduct') {
        const has = FP.productStore.available() && (FP.productStore.meta || {}).batches;
        out[def.key] = state.pa.result ? { ok: true, file: 'category_product_analysis_export_….json' } : has ? { ok: true, note: 'Se calcula al generar el paquete (último mes con datos)' } : { ok: false, reason: 'No hay datos de productos cargados.', missing: ['Archivo de venta por producto'] };
        continue;
      }
      try { const e = EXPORT_BUILDERS[def.key](); out[def.key] = e.obj ? { ok: true, file: e.file } : { ok: false, reason: e.reason, missing: e.missing }; }
      catch (err) { out[def.key] = { ok: false, reason: 'No se pudo preparar.', missing: [] }; }
    }
    return out;
  }

  /** Fase 10 · arma el paquete: los 7 exports (con datos o vacíos con aviso) + índice + LEEME. */
  async function buildAnalysisPackage() {
    // Todo se calcula ANTES de armar los archivos: el export de Producto incluye el diagnóstico y el de Diagnóstico incluye los productos,
    // así que el paquete sale de un solo estado completo, sin depender de qué vistas se abrieron antes en la sesión.
    try { const run = ensureForecast(); if (run && run.plan.source !== 'none') { ensureReforecast(); ensureDiagnostic(); } } catch (e) { /* cada constructor reporta su propio motivo */ }
    if (!state.pa.result && FP.productStore.available() && (FP.productStore.meta || {}).batches) await ensureProductAnalysis();
    const entries = {};
    for (const def of FP.analysisPackage.EXPORTS) {
      try { entries[def.key] = await EXPORT_BUILDERS[def.key](); }
      catch (err) { entries[def.key] = { reason: `No se pudo generar: ${err && err.message ? err.message : err}`, missing: [] }; }
    }
    const run = state.fc.run;
    const q = FP.coverage.summarize(state.store);
    const orig = FP.planning.getOriginalPlan(state.planning.registry);
    return FP.analysisPackage.build(entries, {
      app: { name: C.app.name, version: C.app.version }, generatedAt: new Date().toISOString(),
      cutoff: run ? run.cutoff : null, year: state.year,
      plan: run && run.plan ? { id: (orig && orig.id) || null, label: run.plan.label || null, source: run.plan.source || null } : null,
      forecastMethod: run && run.method ? { id: run.method.id, label: run.method.label } : null,
      dataQuality: { status: q.status, statusText: q.statusText }
    });
  }

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
    ['mode', 'visited', 'lastByGroup', 'tour', 'home', 'ctx', 'learned'].forEach((k) => { if (d[k] !== undefined) u[k] = typeof d[k] === 'object' && !Array.isArray(d[k]) ? { ...u[k], ...d[k] } : d[k]; });
    u.tour.active = Boolean(d.tour && d.tour.active);
    // el modo Ejecutivo ya no existe: quien lo tenía guardado pasa a Analista
    if (!FP.guidanceConfig.MODES.some(([id]) => id === u.mode)) u.mode = 'analyst';
  }
  function saveUx() {
    const u = state.ux;
    storage.save(K.uxSettings, { mode: u.mode, visited: u.visited, lastByGroup: u.lastByGroup, tour: u.tour, home: u.home, ctx: u.ctx, learned: u.learned });
  }

  /** Render completo: navegación → vista existente → barra de contexto → ayuda, modo y recorrido. */
  /**
   * Fase 9.1 — Microlearning: registra que ocurrió un evento real y, en modo Aprendiz, muestra la lección
   * correspondiente una sola vez. No interrumpe: se muestra junto a la barra de contexto y se puede cerrar.
   */
  function learn(event) {
    const u = state.ux;
    if (u.mode !== 'learner' || u.lesson) return;
    const l = FP.guidanceConfig.LESSONS.find((x) => x.event === event && !(u.learned || []).includes(x.id));
    if (!l) return;
    u.learned = [...(u.learned || []), l.id];
    u.lesson = l.id;
  }
  /** Eventos que se detectan al ver una vista con resultados reales (no al abrirla vacía). */
  function learnFromView() {
    const v = state.view;
    const fcReal = state.fc.run && state.fc.run.plan && state.fc.run.plan.source !== 'none' && state.fc.run.cutoff;
    if (v === 'pacing' && fcReal) { learn('pacing-seen'); learn('forecast-seen'); }
    else if (v === 'reforecast' && state.rf.run) learn('reforecast-seen');
    else if (v === 'diagnostico' && state.dx.run && state.dx.run.signals && state.dx.run.signals.length) learn('signal-seen');
    else if (v === 'producto' && state.pa.result && ['region', 'state', 'city', 'branch', 'delivery'].includes(state.pa.result.level)) learn('product-geo-seen');
  }

  /**
   * Accesibilidad (etapa J): al cambiar de vista se actualiza el título de la pestaña y se anuncia la vista nueva a lectores de pantalla
   * (región aria-live). No mueve el foco: quien navega con el teclado por el menú conserva su lugar. Solo cuando cambia la vista, no en cada render.
   */
  let announcedView = null;
  function announceView() {
    if (state.view === announcedView) return;
    announcedView = state.view;
    const t = (FP.guidanceConfig.VIEWS[state.view] || {}).title || 'RevNavigator';
    document.title = state.view === 'inicio' ? 'Inicio · RevNavigator' : `${t} · RevNavigator`;
    const a = document.getElementById('route-announcer');
    if (a) { a.textContent = ''; setTimeout(() => { a.textContent = `Vista: ${t}`; }, 50); }   // el vaciado previo asegura que se anuncie aunque el texto se repita
  }

  function render() {
    const u = state.ux;
    u.visited[state.view] = true;
    const g = FP.navigation.groupOf(state.view);
    if (g) u.lastByGroup[g] = state.view;
    FP.navigation.renderNav(state);
    renderView();
    announceView();
    learnFromView();
    // El contexto persistente (canal/periodo) se sincroniza con lo que la vista tiene elegido en este momento,
    // no solo al cambiar de página; así el resumen y la barra de contexto siguen al selector de canal.
    state.ux.ctx = FP.navigation.extractContext(state.view, state);
    // Accesibilidad de tablas: encabezados con alcance (solo atributos; no cambia el contenido)
    document.querySelectorAll('table thead th:not([scope])').forEach((th) => th.setAttribute('scope', 'col'));
    document.querySelectorAll('table tbody th:not([scope])').forEach((th) => th.setAttribute('scope', 'row'));
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
    else if (state.view === 'diagnostico') { const d = ensureDiagnostic(); FP.diagnosticView.render(state); ensureDiagnosticProducts(d); }
    else if (state.view === 'recovery') {
      ensureRecovery();
      if (!state.rc.ctx) {
        ['rc-gap', 'rc-chain', 'rc-simulator', 'rc-inverse', 'rc-saved', 'rc-library', 'rc-plan', 'rc-tracking', 'rc-tree'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
        document.getElementById('rc-context').innerHTML = '<div class="empty"><strong>Todavía no hay contexto de recuperación</strong>Se necesita un plan del año y venta real, o importar un analysis_export.json o reforecast_export.json.</div>';
      } else FP.recoveryCenter.render(state);
    }
    else if (state.view === 'inicio') { ensureForecast(); ensureReforecast(); FP.homeView.render(state, FP.contextEngine.collectStatus(state)); }
    else if (state.view === 'medir') FP.measureView.render(state);
    else if (state.view === 'narrativa') { ensureNarrative(); FP.narrativeView.render(state); }
    else if (state.view === 'paquete') FP.packageView.render(state, previewPackage());
    else if (state.view === 'segmentos') { ensureDiagnostic(); FP.segmentsView.render(state); }
    else if (state.view === 'analisis') { FP.trendView.render(state); ensureTrendAnalysis(); }
    else if (state.view === 'proyeccion') FP.projectionView.render(state);
    else if (state.view === 'ayuda') FP.helpView.render(state);
    else if (state.view === 'ajustes') {
      FP.settingsView.render(state); FP.ui.renderStatus(state); FP.businessView.render(state); ensureStorageEstimate();   // la ficha de estado se repinta porque settings-view reescribe su contenedor
      if (state.ajustesSection) {   // llegada desde un enlace a una sección (p. ej. #negocio)
        const el = document.getElementById('st-' + state.ajustesSection); state.ajustesSection = null;
        if (el && el.tagName === 'DETAILS') { el.open = true; }   // el desplegable se abre al llegar desde un enlace (dispara «toggle» y queda registrado)
        if (el) setTimeout(() => { el.scrollIntoView({ block: 'start' }); try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }, 0);
      }
    }
    else if (state.view === 'producto') { FP.productView.render(state); ensureProductAnalysis(); }
  }

  /* ================= Pipeline de importación ================= */

  /** Firma de lo que influye en la revisión de un archivo: opciones, equivalencias, mapeo y lotes ya guardados de su tipo. */
  function stagedSig(staged) {
    return JSON.stringify([state.settings, FP.aliases.rules(), staged.mapping, staged.dateFormat || null, ST.batches(state.store, staged.dataType).map((b) => b.id)]);
  }
  function processStaged(staged) {
    const res = IMP.process(staged, { settings: state.settings, existing: ST.records(state.store, staged.dataType) });
    res.sig = stagedSig(staged);
    return res;
  }

  /** Archivos grandes: la validación va por bloques que ceden el hilo (la página no se congela) y avisa el avance. */
  const BIG_ROWS = 40000;
  async function addToStagingAsync(staged) {
    const total = staged.parsed.rows.length;
    if (total <= BIG_ROWS) { addToStaging(staged); return; }
    let lastStep = 0;
    FP.ui.toast(`Validando ${total.toLocaleString('es-MX')} filas de ${staged.fileName}… la página sigue respondiendo.`);
    const res = await IMP.processAsync(staged, { settings: state.settings, existing: ST.records(state.store, staged.dataType),
      onProgress: (done, t) => { const step = Math.floor((100 * done) / t / 25); if (step > lastStep && step < 4) { lastStep = step; FP.ui.toast(`Validando ${staged.fileName}: ${step * 25} %`); } } });
    res.sig = stagedSig(staged);
    state.staging.items.push({ staged, result: res });
    state.staging.activeId = staged.id;
  }

  function addToStaging(staged) {
    state.staging.items.push({ staged, result: processStaged(staged) });
    state.staging.activeId = staged.id;
  }

  /**
   * Fase B · corregir la clasificación: mueve el archivo en revisión a otra sección sin volver a subirlo. Entre Histórico, Plan,
   * Venta real y Segmentos se rehace el mapeo y la revisión; hacia Productos se reconstruye el CSV desde las filas leídas y entra al
   * proceso de Productos. Nada se importa hasta confirmar.
   */
  function csvFromParsed(parsed) {
    const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [parsed.headers.map(q).join(','), ...parsed.rows.map((r) => parsed.headers.map((h) => q(r.values[h])).join(','))].join('\n') + '\n';
  }
  function retypeStaged(item, target) {
    const st = item.staged; const from = st.dataType;
    if (!target || target === from) return;
    const TARGET = { actual: 'Venta real', historical: 'Histórico', plan: 'Plan / Meta', segments: 'Segmentos', products: 'Categoría → Producto' };
    if (item.remote) {   // archivo grande en el Worker: sus filas no están en la página
      if (target === 'products') { FP.ui.toast('Este archivo se procesó en segundo plano y no se puede mover a Categoría → Producto desde aquí: súbelo directamente en esa sección.'); return; }
      reprocessRemote(item, target).then(() => {
        st.detection = FP.canonical ? FP.canonical.detectDataset(st.parsed.headers, { expectedTarget: target }) : st.detection;
        if (st.detection) st.detection.correctedFrom = from;
        render();
      });
      FP.ui.toast(`${st.fileName} se revisará como ${TARGET[target]}. Nada se ha importado todavía.`);
      return;
    }
    if (target === 'products') {
      state.staging.items = state.staging.items.filter((i) => i !== item);
      addProductStaged(FP.productImport.stage(csvFromParsed(st.parsed), { fileName: st.fileName }));
    } else {
      st.dataType = target;
      st.mapping = IMP.suggestMapping(st.parsed.headers);
      st.detection = FP.canonical ? FP.canonical.detectDataset(st.parsed.headers, { expectedTarget: target }) : st.detection;
      if (st.detection) st.detection.correctedFrom = from;   // queda registrado en el lote: la clasificación la corrigió el usuario
      item.result = processStaged(st);
    }
    render();
    FP.ui.toast(`${st.fileName} se revisará como ${TARGET[target]}. Nada se ha importado todavía.`);
  }

  function reprocessAll() {
    state.staging.items.forEach((i) => { if (i.staged.dataType === 'products') processProduct(i); else if (i.remote) reprocessRemote(i); else i.result = processStaged(i.staged); });
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
  /**
   * Instantánea ligera de lo que Calidad de datos necesita de los lotes de Productos (conteos por regla, ejemplos con valor original,
   * resumen). Se refresca al iniciar, al guardar y al quitar un archivo de Productos; los lotes viven en IndexedDB y la pantalla es síncrona.
   */
  async function refreshProductQuality() {
    const PS = FP.productStore;
    try { state.productQuality = PS && PS.available() ? (await PS.listBatches()).map(FP.qualityRules.slimProductBatch) : []; } catch (e) { state.productQuality = []; }
    if (state.view === 'calidad') render();
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
      await refreshProductQuality();
      render();
      const m = batch.storedMerge;
      FP.ui.toast(`Productos guardados: ${batch.summary.accepted.toLocaleString('es-MX')} SKU-días de ${batch.fileName}${m.conflicts ? `; ${m.conflicts} conflictos con lo guardado (${batch.policy === 'replace' ? 'reemplazados' : 'se conservó lo guardado y se marcaron'})` : ''}.`);
    } catch (e) {
      item.status = 'ready'; render();
      FP.ui.toast(`No se pudieron guardar los productos (${e.message}). Los datos anteriores no se modificaron; revisa el espacio disponible del navegador y vuelve a intentar, o exporta tus datos como respaldo.`);
    }
  }

  /**
   * Fase 8.4: navegación del análisis de productos como ruta genérica de niveles (producto y geografía).
   * pa.drill = [{ level, key }] (lo que se fue abriendo), pa.geo = filtros de geografía, pa.next = siguiente nivel elegido.
   */
  const PA_NATURAL = FP.productAnalysis.NEXT;
  const PA_ALL = ['category', 'subcategory', 'product', 'sku', 'region', 'state', 'city', 'branch', 'delivery'];
  function paUsed(pa) { return new Set([...pa.drill.map((d) => d.level), ...Object.keys(pa.geo).filter((k) => pa.geo[k])]); }
  function paAvailable() {
    const a = FP.productStore.available() ? FP.productStore.geoOptions({}).available : {};
    return (lv) => !['region', 'state', 'city', 'branch', 'delivery'].includes(lv) || a[lv];
  }
  function paLevel(pa) {
    const used = paUsed(pa), ok = paAvailable();
    if (pa.next && !used.has(pa.next) && ok(pa.next)) return pa.next;
    if (!pa.drill.length) return used.has(pa.viewBy) || !ok(pa.viewBy) ? 'category' : pa.viewBy;
    let n = PA_NATURAL[pa.drill[pa.drill.length - 1].level];
    const seen = new Set();
    while (n && (used.has(n) || !ok(n)) && !seen.has(n)) { seen.add(n); n = PA_NATURAL[n]; }
    return n && !used.has(n) ? n : null;
  }
  /** Niveles que se pueden elegir como siguiente desglose (los que no están ya en la ruta ni en los filtros). */
  function paNextChoices(pa) { const used = paUsed(pa), ok = paAvailable(); return PA_ALL.filter((l) => !used.has(l) && ok(l)); }
  function paFilter(pa) {
    const f = {};
    pa.drill.forEach((d) => { f[d.level] = d.key; });
    Object.entries(pa.geo).forEach(([k, v]) => { if (v) f[k] = v; });
    return f;
  }

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
    const level = paLevel(pa) || 'sku';
    const filter = paFilter(pa);
    const key = JSON.stringify([pa.from, pa.to, pa.comparison, pa.channel, filter, level]);
    if (pa.result && pa.key === key) return;
    pa.key = key; pa.loading = true;
    const probe = { ...pa, drill: [...pa.drill, { level, key: '_' }], next: null };
    const res = await FP.productAnalysis.run({ from: pa.from, to: pa.to, comparison: pa.comparison, channel: pa.channel, level, filter, next: level === 'sku' ? null : paLevel(probe) });
    if (pa.key !== key) return;
    pa.result = res; pa.loading = false; pa.page = 1;
    if (state.view === 'producto') FP.productView.render(state);
  }

  /** Análisis 1: construye series mensuales por dimensión desde el almacenamiento de productos. */
  async function enrichPriorityEvidence(an, periods) {
    if (!an.priorities || an.priorities.status !== 'available' || !FP.productStore) return;
    const filterKey = { category:'category', subcategory:'subcategory', product:'product', sku:'sku', region:'region', state:'state', city:'city', branch:'branch', delivery:'delivery', channel:'channel' }[an.level];
    if (!filterKey || periods.length < 2) return;
    const current=periods.at(-1), baseline=periods.at(-2);
    const targets=[...an.priorities.drag,...an.priorities.compensate].slice(0,12);
    const dims=['branch','channel','state'];
    for(const item of targets){
      const filter={[filterKey]:item.entity}; const pieces=[];
      for(const dim of dims){
        if(dim===an.level) continue;
        try{
          const [cm,bm]=await Promise.all([
            FP.productStore.aggregate({from:current.from,to:current.to,channel:'total',groupBy:dim,filter}),
            FP.productStore.aggregate({from:baseline.from,to:baseline.to,channel:'total',groupBy:dim,filter})
          ]);
          const rows=[]; const keys=new Set([...cm.keys(),...bm.keys()]);
          keys.forEach(k=>{
            const cf=FP.productStore.finalize(cm.get(k),null), bf=FP.productStore.finalize(bm.get(k),null);
            const cv=cf?.revenue?.value,bv=bf?.revenue?.value;
            if(Number.isFinite(cv)||Number.isFinite(bv)) rows.push({name:k,delta:(Number.isFinite(cv)?cv:0)-(Number.isFinite(bv)?bv:0),current:Number.isFinite(cv)?cv:0,baseline:Number.isFinite(bv)?bv:0});
          });
          rows.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
          if(rows.length) pieces.push({dimension:dim,rows:rows.slice(0,3)});
        }catch(e){}
      }
      item.evidenceBreakdown=pieces;
      const lead=pieces.flatMap(x=>x.rows.map(r=>({...r,dimension:x.dimension}))).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,2);
      item.evidenceSummary=lead.length?lead.map(x=>`${x.dimension==='branch'?'Sucursal':x.dimension==='state'?'Estado':'Canal'}: ${x.name} (${x.delta>=0?'+':''}${Math.round(x.delta).toLocaleString('es-MX')})`).join(' · '):null;
    }
  }

  async function ensureTrendAnalysis() {
    const an = state.an;
    if (!FP.productStore || !FP.productStore.available()) return;
    const m = FP.productStore.meta || {};
    if (!m.dateMin || !m.dateMax) return;
    // Todos los módulos comparables deben terminar en el último período completo.
    // El período es parte del cálculo, no sólo un filtro visual. Siempre se evita
    // usar un período incompleto como referencia principal.
    const maxDate = new Date(`${m.dateMax}T00:00:00Z`);
    const minDate = new Date(`${m.dateMin}T00:00:00Z`);
    const periodType = an.periodType || 'month';
    const count = Math.max(3, Math.min(periodType === 'day' ? 90 : 24, Number(an.periodCount || an.months) || 12));
    const TE = FP.temporalEngine;
    if (TE) {
      const focusOptions = TE.options(m.dateMin, m.dateMax, periodType, periodType === 'day' ? 90 : 24);
      if (an.focusKey && !focusOptions.some(x => x.key === an.focusKey)) an.focusKey = null;
    }
    const pad = n => String(n).padStart(2,'0');
    const startOfWeek = d => { const x=new Date(d); const day=x.getUTCDay()||7; x.setUTCDate(x.getUTCDate()-day+1); x.setUTCHours(0,0,0,0); return x; };
    const endOfPeriod = (d,type) => {
      const x=new Date(d); x.setUTCHours(0,0,0,0);
      if(type==='year'){x.setUTCMonth(11,31);return x;}
      if(type==='month'){x.setUTCMonth(x.getUTCMonth()+1,0);return x;}
      if(type==='week'){const w=startOfWeek(x);w.setUTCDate(w.getUTCDate()+6);return w;}
      return x;
    };
    let cursor;
    const latestCompleteKey = (() => {
      if (TE) {
        const opts = TE.options(m.dateMin, m.dateMax, periodType, 24);
        const latest = [...opts].reverse().find(x => !x.partial); return latest ? latest.key : null;
      }
      return null;
    })();
    const requestedKey = an.focusKey || latestCompleteKey;
    if (requestedKey && TE) {
      const fr = TE.rangeForKey(requestedKey, periodType);
      cursor = new Date(`${fr.from}T00:00:00Z`);
    } else if(periodType==='year'){ cursor=new Date(Date.UTC(maxDate.getUTCFullYear(),0,1)); if(endOfPeriod(cursor,periodType)>maxDate) cursor.setUTCFullYear(cursor.getUTCFullYear()-1); }
    else if(periodType==='month'){ cursor=new Date(Date.UTC(maxDate.getUTCFullYear(),maxDate.getUTCMonth(),1)); if(endOfPeriod(cursor,periodType)>maxDate) cursor.setUTCMonth(cursor.getUTCMonth()-1); }
    else if(periodType==='week'){ cursor=startOfWeek(maxDate); if(endOfPeriod(cursor,periodType)>maxDate) cursor.setUTCDate(cursor.getUTCDate()-7); }
    else { cursor=new Date(Date.UTC(maxDate.getUTCFullYear(),maxDate.getUTCMonth(),maxDate.getUTCDate())); }
    const shift=(d,type,n)=>{const x=new Date(d); if(type==='year')x.setUTCFullYear(x.getUTCFullYear()+n); else if(type==='month')x.setUTCMonth(x.getUTCMonth()+n); else if(type==='week')x.setUTCDate(x.getUTCDate()+7*n); else x.setUTCDate(x.getUTCDate()+n); return x;};
    const isoWeekKey=(d)=>{const x=new Date(d);x.setUTCHours(0,0,0,0);const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const y=x.getUTCFullYear();const first=new Date(Date.UTC(y,0,1));const w=Math.ceil((((x-first)/86400000)+1)/7);return `${y}-W${pad(w)}`;}; const periodKey=(d,type)=>{ if(type==='year')return String(d.getUTCFullYear()); if(type==='month')return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`; if(type==='week')return isoWeekKey(d); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; };
    const rangeFor=(d,type)=>{const from=new Date(d); from.setUTCHours(0,0,0,0); const to=endOfPeriod(from,type); return {from:`${to>=from?from.getUTCFullYear():0}-${pad(from.getUTCMonth()+1)}-${pad(from.getUTCDate())}`,to:`${to.getUTCFullYear()}-${pad(to.getUTCMonth()+1)}-${pad(to.getUTCDate())}`};};
    const periods=[]; for(let i=count-1;i>=0;i--){const d=shift(cursor,periodType,-i); let range=rangeFor(d,periodType); if(i===0 && TE) range=TE.clampRange ? TE.clampRange(range, m.dateMax) : range; if(new Date(`${range.to}T00:00:00Z`)<minDate) continue; periods.push({key:periodKey(d,periodType),...range,partial: range.to < (TE ? TE.rangeForKey(periodKey(d,periodType),periodType).to : range.to)});}
    const starts=periods.map(x=>x.key), end=periods.at(-1)?.key||'', firstPeriod=periods[0]?.key||'';
    const focus = periods.at(-1) || null;
    const key = JSON.stringify([an.level, periodType, count, firstPeriod, end, an.comparison, requestedKey, focus?.partial]);
    if (an.rows.length && an.key === key && !an.loading) return;
    an.loading = true; an.error = null; an.key = key;
    const series = new Map();
    const totalSeries = [];
    const cohortSeries = new Map();
    const monthlyMaps = [];
    const entities = new Set();
    try {
      for (const period of periods) {
        const map = await FP.productStore.aggregate({ ...period, channel: 'total', groupBy: an.level });
        const monthValues = new Map();
        let monthTotal = 0;
        map.forEach((acc, entity) => {
          const fin = FP.productStore.finalize(acc, null);
          const value = fin && fin.revenue && typeof fin.revenue.value === 'number' && Number.isFinite(fin.revenue.value) ? fin.revenue.value : null;
          monthValues.set(entity, value);
          entities.add(entity);
          if (finiteTrend(value)) monthTotal += value;
        });
        monthlyMaps.push({ period: period.key, values: monthValues });
        totalSeries.push({ period: period.key, value: monthTotal });
        await new Promise((r) => setTimeout(r, 0));
      }
      // Completa la serie con null cuando una entidad no aparece en un mes.
      // Así una ausencia real rompe la continuidad de una tendencia en vez de
      // hacer que dos observaciones separadas parezcan meses consecutivos.
      entities.forEach((entity) => {
        const full = monthlyMaps.map(({ period, values }) => ({ period, value: values.has(entity) ? values.get(entity) : null }));
        series.set(entity, full);
        cohortSeries.set(entity, full);
      });
      // Solo entidades con al menos minPeriods observaciones útiles. No rellenamos meses previos al primer dato con cero.
      const results = FP.trendEngine.analyzeMany(series, { metric: 'revenue' });
      results.forEach((r) => {
        r.series = series.get(r.entity) || [];
        r.impact = finiteTrend(r.currentValue) && finiteTrend(r.previousValue) ? r.currentValue - r.previousValue : null;
      });
      an.rows = results.filter((r) => r.periodsAnalyzed >= FP.trendEngine.DEFAULTS.minPeriods);
      const cohortPeriods = starts.slice();
      // Capa temporal global: siempre calcula las comparaciones válidas para el periodo focal.
      if (TE && focus) {
        const aggregateRevenue = async (range) => {
          if (!range || range.to < range.from) return null;
          const map = await FP.productStore.aggregate({ from: range.from, to: range.to, channel: 'total', groupBy: 'total' });
          let total = 0;
          map.forEach(acc => { const fin = FP.productStore.finalize(acc, null); if (Number.isFinite(fin?.revenue?.value)) total += fin.revenue.value; });
          return total;
        };
        const maxD = m.dateMax;
        const focusRange = TE.focusRange(periodType, focus.key, maxD);
        const currentTotal = await aggregateRevenue(focusRange);
        const cmpRanges = TE.comparisonRanges(focusRange, periodType, maxD);
        const comparisons = [];
        for (const cmp of cmpRanges) {
          const value = await aggregateRevenue(cmp.range);
          comparisons.push({ id: cmp.id, label: cmp.label, value, change: TE.comparePct(currentTotal, value), available: Number.isFinite(value) && value !== 0 });
        }
        const yoy = comparisons.find(x => x.id === 'yoy') || null;
        const mom = comparisons.find(x => x.id === 'mom') || null;
        const wow = comparisons.find(x => x.id === 'wow') || null;
        const dod = comparisons.find(x => x.id === 'dod') || null;
        // Estacionalidad: para un periodo mensual/anual, compara el periodo focal contra el promedio histórico del mismo bucket.
        let seasonality = null;
        if (periodType === 'month' && !focus.partial) {
          const monthNo = Number(String(focus.key).slice(5, 7));
          const sameMonth = periods.filter(x => !x.partial && Number(String(x.key).slice(5, 7)) === monthNo && x.key !== focus.key);
          if (sameMonth.length) {
            const vals = [];
            for (const p0 of sameMonth) { const v = await aggregateRevenue(p0); if (Number.isFinite(v)) vals.push(v); }
            const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
            seasonality = { bucket: `Mes ${monthNo}`, comparablePeriods: vals.length, historicalAverage: avg, index: Number.isFinite(avg) && avg !== 0 ? currentTotal / avg : null, status: vals.length >= 1 ? 'available' : 'insufficient_history' };
          } else seasonality = { bucket: `Mes ${monthNo}`, comparablePeriods: 0, historicalAverage: null, index: null, status: 'insufficient_history' };
        }
        an.temporal = { focus: { type: periodType, key: focus.key, from: focus.from, to: focus.to, partial: Boolean(focus.partial), label: TE.label(periodType, focus.key, focus) }, currentTotal, comparisons, yoy, mom, wow, dod, seasonality };
      } else an.temporal = null;
      an.cohort = FP.cohortEngine ? FP.cohortEngine.analyze(cohortSeries, cohortPeriods, {
        level: an.level,
        minActivity: 0
      }) : null;
      an.rows.sort((a, b) => Math.abs(b.impact || 0) - Math.abs(a.impact || 0));
      if (FP.patternEngine) {
        const advanced = FP.patternEngine.cluster(an.rows);
        an.rows = advanced.rows;
        an.advanced = advanced.rows.map((r) => r.advanced);
        an.groups = advanced.groups;
      } else { an.advanced = []; an.groups = []; }
      if (FP.shareMixEngine) {
        // Share must compare comparable completed periods. If the latest month is
        // partial (as October 2026 is in the supplied dataset), use the two latest
        // completed months instead of comparing January with a partial October.
        const completePeriods = totalSeries.slice();
        const pair = completePeriods.slice(-2);
        let baselinePeriod = pair[0]?.period || totalSeries[0]?.period;
        let currentPeriod = pair[1]?.period || totalSeries[totalSeries.length - 1]?.period;
        let baselineTotal = totalSeries.find(x => x.period === baselinePeriod)?.value ?? null;
        let currentTotal = totalSeries.find(x => x.period === currentPeriod)?.value ?? null;
        let mixRows;
        if (an.comparison === 'year_ago' && periods.at(-1)) {
          const curP = periods.at(-1);
          const baseDate = shift(new Date(`${curP.from}T00:00:00Z`), periodType, -1);
          const baseRange = rangeFor(baseDate, periodType);
          const baseKey = periodKey(baseDate, periodType);
          const baseMap = await FP.productStore.aggregate({ ...baseRange, channel:'total', groupBy:an.level });
          const curMap = await FP.productStore.aggregate({ ...curP, channel:'total', groupBy:an.level });
          const totalValue = (map) => { let v=0; map.forEach(acc=>{const f=FP.productStore.finalize(acc,null); if(Number.isFinite(f?.revenue?.value)) v+=f.revenue.value;}); return v; };
          const baseHasData = baseMap.size > 0;
          const curHasData = curMap.size > 0;
          baselinePeriod=baseKey; currentPeriod=curP.key; baselineTotal=baseHasData ? totalValue(baseMap) : null; currentTotal=curHasData ? totalValue(curMap) : totalSeries.at(-1)?.value ?? null;
          const entities = new Set([...baseMap.keys(),...curMap.keys()]);
          mixRows=[...entities].map(entity=>{
            const bf=FP.productStore.finalize(baseMap.get(entity),null), cf=FP.productStore.finalize(curMap.get(entity),null);
            return {entity,baselineValue:Number.isFinite(bf?.revenue?.value)?bf.revenue.value:0,currentValue:Number.isFinite(cf?.revenue?.value)?cf.revenue.value:0};
          }).filter(r=>r.baselineValue>0||r.currentValue>0);
        } else {
          const entities = new Set(series.keys());
          mixRows = [...entities].map((entity) => {
            const s = series.get(entity) || [];
            const base = s.find(x => x.period === baselinePeriod);
            const cur = s.find(x => x.period === currentPeriod);
            return { entity, baselineValue: finiteTrend(base?.value) ? base.value : 0, currentValue: finiteTrend(cur?.value) ? cur.value : 0 };
          }).filter(r => r.baselineValue > 0 || r.currentValue > 0);
        }
        const comparisonAvailable = Number.isFinite(baselineTotal) && baselineTotal > 0 && Number.isFinite(currentTotal);
        an.share = comparisonAvailable ? {
          ...FP.shareMixEngine.rankAndMix(mixRows, currentTotal, baselineTotal),
          totalSeries, baselinePeriod, currentPeriod,
          baselineTotal, currentTotal,
          comparisonLabel: `${baselinePeriod || '—'} vs ${currentPeriod || '—'}`,
          comparisonAvailable: true,
          comparisonMessage: null
        } : {
          status: 'comparison_unavailable', rows: [], totalSeries, baselinePeriod, currentPeriod,
          baselineTotal: null, currentTotal: Number.isFinite(currentTotal) ? currentTotal : null,
          comparisonLabel: `${baselinePeriod || '—'} vs ${currentPeriod || '—'}`,
          comparisonAvailable: false,
          comparisonMessage: `No hay datos de ${baselinePeriod || 'el período de comparación'} en la fuente cargada. Evolución y Patrones continúan usando el histórico disponible; las métricas comparativas no se calculan.`
        };
        an.rows.forEach((r) => { const mm = an.share.rows.find(x => x.entity === r.entity); if (mm) r.share = mm; });
      } else an.share = null;
      if (FP.actionPriorityEngine) {
        an.priorities = FP.actionPriorityEngine.analyze(an.rows, { baselinePeriod: an.share?.baselinePeriod || periods.at(-2)?.key || null, currentPeriod: an.share?.currentPeriod || periods.at(-1)?.key || null, baselinePartial: Boolean(periods.at(-2)?.partial), currentPartial: Boolean(focus?.partial) });
        await enrichPriorityEvidence(an, periods);
        an.risks = { status: an.priorities.status, risks: an.priorities.drag, opportunities: an.priorities.compensate, watch: an.priorities.watch, all: an.priorities.all, methodology: an.priorities.methodology };
      } else { an.priorities = null; an.risks = null; }
      if (FP.trendForecastEngine) an.forecast = FP.trendForecastEngine.analyzeMany(an.rows, { horizon: an.forecastHorizon, method: an.forecastMethod, periodType: an.periodType });
      else an.forecast = null;
      if (FP.contributionEngine) {
        // Contribución debe reconciliar el movimiento de los mismos períodos
        // comparables usados por Share & Mix. No usa enero→octubre parcial ni
        // limita el universo a entidades con historia suficiente para tendencias.
        const cb = an.share && an.share.baselinePeriod;
        const cc = an.share && an.share.currentPeriod;
        const contributionRows = an.share && Array.isArray(an.share.rows)
          ? an.share.rows.map((r) => ({
              entity: r.entity,
              current: r.currentValue,
              baseline: r.baselineValue,
              delta: finiteTrend(r.currentValue) && finiteTrend(r.baselineValue) ? r.currentValue - r.baselineValue : null,
              baselineShare: r.baselineShare,
              currentShare: r.currentShare,
              shareChangePp: r.shareChangePp
            }))
          : [];
        an.contribution = an.share?.comparisonAvailable ? FP.contributionEngine.analyze(contributionRows, { baselinePeriod: cb, currentPeriod: cc }) : { status: 'comparison_unavailable', totalDelta: null, positive: [], negative: [], message: an.share?.comparisonMessage || 'No hay datos comparables.' };
      } else an.contribution = null;
      an.narrative = FP.analysisNarrativeEngine ? FP.analysisNarrativeEngine.build({ rows: an.rows, risks: an.risks, forecast: an.forecast, contribution: an.contribution, share: an.share, cohort: an.cohort, level: an.level }) : null;
      an.ai = { status: null, result: null, errors: [] };
      an.selected = an.selected && an.rows.find((r) => r.entity === an.selected.entity) || an.rows[0] || null;
    } catch (e) {
      an.rows = []; an.selected = null; an.error = e && e.message ? e.message : String(e);
    } finally {
      an.loading = false;
      if (state.view === 'analisis') FP.trendView.render(state);
    }
  }
  const finiteTrend = (v) => typeof v === 'number' && Number.isFinite(v);

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

  /**
   * Estados de la tarjeta de carga (revisión de uso): «arrastrando» y «cargando» reutilizan la línea de estado de la propia tarjeta
   * (`.upload-card__state`, ya con estilo para ambos). Se restaura lo que decía antes; no se guarda nada ni cambia el flujo:
   * los archivos siguen entrando a «en revisión» y nada se importa hasta confirmar.
   */
  function setUploadState(el, kind, text) {
    if (!el) return;
    if (!el.dataset.prevState) { el.dataset.prevState = el.dataset.state || ''; el.dataset.prevText = el.textContent; }
    el.dataset.state = kind; el.textContent = text;
  }
  function restoreUploadState(el) {
    if (!el || el.dataset.prevState === undefined) return;
    el.dataset.state = el.dataset.prevState; el.textContent = el.dataset.prevText;
    delete el.dataset.prevState; delete el.dataset.prevText;
  }

  async function pickFiles(input) {
    const files = [...(input.files || [])];
    const card = input.closest('.upload-card');
    input.value = '';
    return stageFiles(files, input.dataset.type, card ? card.querySelector('.upload-card__state') : null);
  }

  async function stageFiles(files, dataType, stateEl) {
    if (!files.length) return;
    setUploadState(stateEl, 'loading', `Leyendo ${files.length} archivo${files.length === 1 ? '' : 's'}…`);
    try { await stageFilesInner(files, dataType); } finally { restoreUploadState(stateEl); }
  }

  /** Mensajes al convertir un export de GA4 a Segmentos: { skip: true } si ninguna fila se pudo convertir (ya avisó) o { note } con el resumen. */
  function ga4SegmentsReport(file, st) {
      if (!st.rowsOut) {
        const R = st.reasons || {}; const ej = (k) => (R[k] ? ` (ej.: ${R[k].ejemplos.map((x) => `«${x}»`).join(', ')})` : '');
        if (st.sinDimensiones && st.rowsIn) {
          FP.ui.toast(`${file.name} trae fecha, plataforma y sesiones (${st.rowsIn} filas), pero ninguna columna para desglosar. Agrega al export al menos una: Categoría de dispositivo, Fuente/medio de la sesión, Campaña de la sesión, Página de destino o Nuevo/recurrente.`);
          return { skip: true };
        }
        const parts = [];
        if (R.fecha) parts.push(`${R.fecha.n} filas con fecha no reconocida${ej('fecha')}`);
        if (R.plataforma) parts.push(`${R.plataforma.n} filas con plataforma distinta de web, Android o iOS${ej('plataforma')}`);
        if (R['número']) parts.push(`${R['número'].n} filas con sesiones, compras o ingresos no numéricos${ej('número')}`);
        FP.ui.toast(`${file.name} parece un export de GA4, pero ninguna fila se pudo convertir: ${parts.join('; ') || 'no hay filas de datos'}.`);
        return { skip: true };
      }
      const nf = (n) => Math.round(n).toLocaleString('es-MX');
      const warn = [];
      if (!st.hasPurchases) warn.push('no se encontró columna de compras/transacciones, así que los pedidos quedan en 0');
      if (!st.hasRevenue) warn.push('no se encontró columna de ingresos, así que la venta queda en 0');
      if (st.ignoredHeaders && st.ignoredHeaders.length) warn.push(`columnas sin usar: ${st.ignoredHeaders.join(', ')}`);
      return { note: `${file.name}: export de GA4 convertido (${nf(st.rowsIn)} filas de GA4 → ${nf(st.rowsOut)} filas de segmentos; desgloses: ${st.dimensions.join(', ') || 'ninguno'}; totales: ${nf(st.totals.sessions)} sesiones, ${nf(st.totals.orders)} compras, ${nf(st.totals.revenue)} de ingresos${st.skipped ? `; ${st.skipped} filas sin fecha o con otra plataforma se omitieron` : ''}).` + (warn.length ? ` Ojo: ${warn.join('; ')}.` : '') };
  }

  /* ---------- Archivos grandes: Worker de importación ---------- */
  const PHASE = { leer: 'Leyendo el archivo', traducir: 'Traduciendo el export de GA4', validar: 'Validando filas', enviar: 'Guardando registros' };
  let workingTimer = null;
  function setWorking(w) {
    state.staging.working = w;
    if (workingTimer) return;
    workingTimer = setTimeout(() => { workingTimer = null; if (state.view === 'carga') render(); }, 150);   // el avance se repinta ~6 veces por segundo, no en cada mensaje
  }
  const onWorkProgress = (fileName) => (phase, done, total) => setWorking({ fileName, phase: PHASE[phase] || phase, pct: total ? Math.round((100 * done) / total) : 0 });
  const todayISO = () => FP.calendar.toISODate(new Date());
  const existingFor = (dataType) => FP.importWorker.existingOf(ST.records(state.store, dataType));

  function detectionFor(staged, ga4Converted, dataType) {
    if (!FP.canonical) return null;
    return ga4Converted ? { datasetType: 'ga4_segments', label: FP.canonical.profile('ga4_segments').label, confidence: 1, matchedFields: [], missingRecommendedFields: [], alternatives: [], detectionMethod: 'deterministic (traductor de GA4)', ambiguous: false, targetMismatch: false }
      : FP.canonical.detectDataset(staged.parsed.headers, { expectedTarget: dataType });
  }

  /**
   * Mapeo de columnas con IA (Cohere) para un archivo del Worker: la MISMA lógica que stageWithAI en la página (encabezados desconocidos o
   * campos obligatorios sin columna → Cohere, con la regla de privacidad de datos personales y la validación del mapeo). Solo viajan los
   * encabezados y hasta 3 valores de ejemplo de las 3 primeras filas (que el Worker ya envió como vista previa). Si cambia el mapeo, el
   * Worker vuelve a validar el archivo; si no hay nada que resolver, no se consulta ni se vuelve a validar.
   * @returns {Promise<boolean>} true si el mapeo cambió y el archivo se recalculó
   */
  async function aiMapRemote(item) {
    if (state.settings.enableAI === false || !FP.normalize || !FP.normalize.suggestHeaderMappingWithAI) return false;
    const st = item.staged; const rows = st.parsed.rows.slice(0, 3); const samples = {};
    st.parsed.headers.forEach((h) => { samples[h] = rows.map((r) => r.values[h]).filter((v) => v !== ''); });
    setWorking({ fileName: st.fileName, phase: 'Consultando a la IA las columnas que no se reconocen', pct: 0 });
    let ai = null;
    try { ai = await FP.normalize.suggestHeaderMappingWithAI(st.parsed.headers, { dataType: st.dataType, samples, customPrompt: state.settings.customAIPrompt || '' }); }
    catch (e) { ai = null; }
    if (!ai) { state.staging.working = null; render(); return false; }
    if (Array.isArray(ai.mapped) && ai.mapped.length) {
      IMP.learnHeaderMappings(ai.mapped);
      state.settings.aiHeaderAliases = IMP.learnedMappings(); saveSettings();
    }
    st.aiMapping = ai;
    const changed = ai.mapping && JSON.stringify(ai.mapping) !== JSON.stringify(st.mapping);
    // el indicador de «procesando» sigue encendido hasta que termine el recálculo (sin un hueco en el que la pantalla parezca lista)
    if (changed) { st.mapping = ai.mapping; item.busy = true; await reprocessRemote(item); return true; }
    state.staging.working = null;
    render();
    return false;
  }

  /** Prepara un CSV grande en el Worker. Devuelve { added, note }. La página solo guarda el resumen y una vista previa. */
  async function stageViaWorker(file, dataType, t0) {
    const jobId = FP.importWorker.newJob();
    setWorking({ fileName: file.name, phase: PHASE.leer, pct: 0 });
    let res;
    try {
      res = await FP.importWorker.stage({ jobId, file, fileName: file.name, dataType, settings: state.settings, today: todayISO(), aliases: FP.aliases.rules(), learned: IMP.learnedMappings(), existing: existingFor(dataType) },
        { onProgress: onWorkProgress(file.name) });
    } catch (e) {
      state.staging.working = null; render();
      FP.ui.toast(`No se pudo procesar ${file.name}: ${e.message}`);
      return { added: false };
    }
    state.staging.working = null;
    let note = null;
    if (res.ga4) { const rep = ga4SegmentsReport(file, res.ga4.stats); if (rep.skip) { FP.importWorker.drop(jobId); return { added: false }; } note = rep.note; }
    const staged = res.staged;
    staged.sourceType = res.ga4 ? 'ga4-csv' : 'csv'; staged.durationMs = Date.now() - t0;
    staged.detection = detectionFor(staged, Boolean(res.ga4), dataType);
    if (staged.detection && staged.detection.ambiguous && state.settings.enableAI !== false && FP.cohereDataset) staged.detection = await FP.cohereDataset.resolve(staged.detection, staged.parsed.headers);   // Fase H4
    const result = res.result; result.sig = stagedSig(staged);
    const item = { staged, result, remote: { jobId } };
    state.staging.items.push(item);
    state.staging.activeId = staged.id;
    if (!res.ga4) await aiMapRemote(item);   // un export de GA4 ya trae sus columnas resueltas: la IA solo entra con archivos propios
    return { added: true, note };
  }

  /** Recalcula un archivo del Worker (cambió el mapeo, el formato de fecha, las opciones, las equivalencias o lo ya guardado). En fila por archivo. */
  function reprocessRemote(item, dataType = null) {
    item.queue = (item.queue || Promise.resolve()).then(async () => {
      item.busy = true; render();
      const args = { jobId: item.remote.jobId, mapping: item.staged.mapping, dateFormat: item.staged.dateFormat || null, settings: state.settings, today: todayISO(),
        aliases: FP.aliases.rules(), learned: IMP.learnedMappings(), existing: existingFor(dataType || item.staged.dataType) };
      try {
        const res = dataType ? await FP.importWorker.retype({ ...args, dataType }, { onProgress: onWorkProgress(item.staged.fileName) }) : await FP.importWorker.reprocess(args, { onProgress: onWorkProgress(item.staged.fileName) });
        state.staging.working = null;
        Object.assign(item.staged, { mapping: res.staged.mapping, dataType: res.staged.dataType, dateDetection: res.staged.dateDetection, dateFormat: res.staged.dateFormat, parsed: res.staged.parsed });
        item.result = res.result; item.result.sig = stagedSig(item.staged);
      } catch (e) { state.staging.working = null; FP.ui.toast(`No se pudo recalcular ${item.staged.fileName}: ${e.message}`); }
      item.busy = false; render();
    });
    return item.queue;
  }

  /** Lo que sigue a confirmar un archivo (de la página o del Worker): quitarlo de la revisión, guardar, recalcular y avisar. */
  function finishCommit(item, batch) {
    learn('data-committed');
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      reprocessAll(); // los pendientes pueden duplicar lo recién importado
      saveStore([batch.dataType]);
      invalidatePlanning();
      const years = ST.years(state.store, batch.dataType);
      if ((batch.dataType === 'plan' || batch.dataType === 'actual') && years.length && !years.includes(state.year)) loadYearScoped(years[years.length - 1]);
      refresh();
      render();
      FP.ui.toast(`Importadas ${batch.accepted} filas de ${batch.fileName}${batch.quarantined ? ` (${batch.quarantined} con un valor en cuarentena: se conserva el original y no suma)` : ''}${batch.rejected ? `; ${batch.rejected} quedaron fuera` : ''}.`);
  }

  /** Confirma un archivo del Worker: los registros llegan por bloques (la página nunca tuvo todas las filas) y se agregan al almacén de una vez. */
  async function commitRemote(item) {
    if (item.committing) return;
    item.committing = true;
    try {
      if (!item.result || item.result.sig !== stagedSig(item.staged)) await reprocessRemote(item);
      if (!item.result.canImport) { render(); FP.ui.toast('Corrige el mapeo antes de importar.'); return; }
      item.busy = true; setWorking({ fileName: item.staged.fileName, phase: PHASE.enviar, pct: 0 }); render();
      const id = ST.newBatchId();
      let done;
      try { done = await FP.importWorker.commit({ jobId: item.remote.jobId, batchId: id, includeErrorRows: Boolean(state.settings.includeErrorRows) }, { onProgress: onWorkProgress(item.staged.fileName) }); }
      catch (e) { item.busy = false; state.staging.working = null; render(); FP.ui.toast(`No se pudo importar ${item.staged.fileName}: ${e.message}`); return; }
      state.staging.working = null;
      const batch = ST.commitRemote(state.store, item.staged, done, done.records, { id, includeErrorRows: state.settings.includeErrorRows, settings: state.settings, source: item.staged.sourceType, durationMs: item.staged.durationMs });
      finishCommit(item, batch);
    } finally { item.committing = false; }
  }

  async function stageFilesInner(files, dataType) {
    const maxMB = dataType === 'products' ? C.import.maxProductsFileSizeMB : C.import.maxFileSizeMB;
    const maxBytes = maxMB * 1024 * 1024;
    let added = 0; const notes = [];
    for (const file of files) {
      if (file.size > maxBytes) { FP.ui.toast(`${file.name} pesa más de ${maxMB} MB. Divídelo en archivos más pequeños.`); continue; }
      try {
        const t0 = Date.now(); let ga4Converted = false;   // Fase A · auditoría: tipo de fuente y duración
        const isXlsx = /\.xlsx$/i.test(file.name);
        // CSV grandes (histórico, plan, venta real o segmentos): se leen, traducen y validan en un Worker; la página no se congela
        if (!isXlsx && dataType !== 'products' && file.size >= FP.importWorker.minBytes() && await FP.importWorker.start()) {
          const w = await stageViaWorker(file, dataType, t0);
          if (w.note) notes.push(w.note);
          if (w.added) added++;
          continue;
        }
        let text = null;
        let parsedSource = null;
        if (isXlsx) {
          if (!FP.xlsx || typeof FP.xlsx.parse !== 'function') throw new Error('El lector XLSX no está disponible.');
          parsedSource = await file.arrayBuffer();
        } else {
          text = await readFileText(file);
        }
        // Fase 11 · pieza 2: el CSV exportado de GA4 se convierte solo al formato de Segmentos (sin usuarios; «(not set)» como «Sin dato»)
        if (!isXlsx && dataType === 'segments' && FP.ga4Segments.detect(text)) {
          const t = FP.ga4Segments.translate(text);
          const rep = ga4SegmentsReport(file, t.stats);
          if (rep.skip) continue;
          text = t.csv; ga4Converted = true;
          notes.push(rep.note);
        }
        if (dataType === 'products' && FP.ga4Funnel.detect(text)) {
          const t = FP.ga4Funnel.translate(text), st = t.stats, nf = (n) => Math.round(n).toLocaleString('es-MX');
          if (!st.rowsOut) {
            const R = st.reasons || {};
            const parts = Object.entries(R).map(([k, v]) => `${v.n} filas con ${k} no válido (ej.: ${v.ejemplos.map((x) => `«${x}»`).join(', ')})`);
            FP.ui.toast(`${file.name} parece un funnel de GA4, pero ninguna fila se pudo convertir: ${parts.join('; ') || 'no hay filas de datos'}.`);
            continue;
          }
          text = t.csv; ga4Converted = true;
          notes.push(`${file.name}: funnel de GA4 convertido por plataforma (${nf(st.rowsIn)} filas → ${nf(st.rowsOut)} día·canal·SKU; web → ecommerce, Android + iOS → app${st.skipped ? `; ${st.skipped} filas omitidas` : ''}).`);
        }
        if (dataType === 'products') addProductStaged(FP.productImport.stage(text, { fileName: file.name }));
        else {
          const staged = await IMP.stageWithAI(isXlsx ? parsedSource : text, {
            fileName: file.name,
            dataType,
            enableAI: state.settings.enableAI !== false,
            customPrompt: state.settings.customAIPrompt || ''
          });
          if (FP.importer && typeof FP.importer.learnedMappings === 'function') {
            state.settings.aiHeaderAliases = FP.importer.learnedMappings();
            saveSettings();
          }
          staged.sourceType = isXlsx ? 'xlsx' : ga4Converted ? 'ga4-csv' : 'csv'; staged.durationMs = Date.now() - t0;
          // Fase B · tipo de dataset detectado (determinístico); con GA4 convertido, el original era un export de GA4
          if (FP.canonical) staged.detection = ga4Converted ? { datasetType: 'ga4_segments', label: FP.canonical.profile('ga4_segments').label, confidence: 1, matchedFields: [], missingRecommendedFields: [], alternatives: [], detectionMethod: 'deterministic (traductor de GA4)', ambiguous: false, targetMismatch: false } : FP.canonical.detectDataset(staged.parsed.headers, { expectedTarget: dataType });
          if (staged.detection && staged.detection.ambiguous && state.settings.enableAI !== false && FP.cohereDataset) staged.detection = await FP.cohereDataset.resolve(staged.detection, staged.parsed.headers);   // Fase H4
          await addToStagingAsync(staged);
        }
        added++;
      } catch (e) {
        FP.ui.toast(`No se pudo leer ${file.name} (${e.message}). Verifica que sea un CSV de texto (UTF-8) y no un archivo de Excel; si viene de Excel, guárdalo como "CSV UTF-8" y vuelve a cargarlo.`);
      }
    }
    if (added) { render(); FP.ui.toast(`${added} archivo${added === 1 ? '' : 's'} en revisión. ${notes.length ? notes.join(' ') + ' ' : ''}Nada se ha importado todavía.`); scrollToStaging(); }
  }

  /** Espacio usado por el almacenamiento (se muestra en Configuración): se pide una vez y se vuelve a pintar cuando llega. */
  let storageEstimateAsked = false;
  function ensureStorageEstimate() {
    if (state.pa.estimate || storageEstimateAsked || !repo || !repo.ready) return;
    storageEstimateAsked = true;
    repo.estimate().then((est) => { state.pa.estimate = est; if (state.view === 'ajustes') render(); }).catch(() => { /* sin estimación: se muestra «—» */ });
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
      state.pa = { ...state.pa, result: null, counts: null, from: null, to: null, drill: [], geo: {}, next: null, trace: null };
      state.an = { ...state.an, rows: [], selected: null, key: null, error: null, priorities: null, risks: null, narrative: null, ai: { status: null, result: null, errors: [] } };
      state.store = ST.createStore();
      state.staging = { items: [], activeId: null, issueFilter: 'all' };
      loadSettings();
      loadAliases();
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

    'an-period-type'(el) { state.an.periodType = el.value || 'month'; state.an.periodCount = state.an.periodType === 'day' ? 30 : state.an.periodType === 'year' ? 3 : 12; state.an.months = state.an.periodCount; state.an.focusKey = null; state.an.page = 1; state.an.rows = []; state.an.advanced = []; state.an.groups = []; state.an.selected = null; state.an.key = null; state.an.priorities = null; state.an.risks = null; state.an.forecast = null; state.an.temporal = null; render(); },
    'an-focus'(el) { state.an.focusKey = el.value || null; state.an.page = 1; state.an.rows = []; state.an.advanced = []; state.an.groups = []; state.an.selected = null; state.an.key = null; state.an.priorities = null; state.an.risks = null; state.an.forecast = null; state.an.temporal = null; render(); },
    'an-comparison'(el) { state.an.comparison = el.value || 'previous'; state.an.page = 1; state.an.rows = []; state.an.key = null; render(); },
    'an-level'(el) { state.an.level = el.value || el.dataset.value; state.an.page = 1; state.an.rows = []; state.an.advanced = []; state.an.groups = []; state.an.selected = null; state.an.key = null; state.an.priorities = null; state.an.risks = null; state.an.forecast = null; render(); },
    'an-period-count'(el) { state.an.periodCount = Math.max(3, Math.min(state.an.periodType === 'day' ? 90 : 24, Number(el.value) || 12)); state.an.months = state.an.periodCount; state.an.page = 1; state.an.rows = []; state.an.advanced = []; state.an.groups = []; state.an.selected = null; state.an.key = null; state.an.priorities = null; state.an.risks = null; state.an.forecast = null; render(); },
    'an-pattern'(el) { state.an.pattern = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-signal'(el) { state.an.signal = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-anomaly-direction'(el) { state.an.anomalyDirection = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-entity-query'(el) { state.an.entityQuery = el.value || ''; state.an.page = 1; render(); },
    'an-min-impact'(el) { state.an.minImpact = Math.max(0, Number(el.value) || 0); state.an.page = 1; render(); },
    'an-page'(el) {
      const a = state.an;
      const filtered = (a.rows || []).filter((r) => {
        if (a.pattern !== 'all' && r.pattern !== a.pattern) return false;
        if (a.signal !== 'all' && !(r.advanced && r.advanced.signal === a.signal)) return false;
        if (a.anomalyDirection !== 'all' && !(r.anomaly && r.anomaly.direction === a.anomalyDirection)) return false;
        if (a.entityQuery && !String(r.entity || '').toLowerCase().includes(String(a.entityQuery).toLowerCase())) return false;
        if (a.minImpact > 0 && Math.abs(r.recentAbsoluteChange || 0) < a.minImpact) return false;
        return true;
      });
      const size = Math.max(1, Number(state.an.pageSize) || 6);
      const pages = Math.max(1, Math.ceil(filtered.length / size));
      state.an.page = Math.max(1, Math.min(pages, Number(el.dataset.value) || 1));
      render();
      const table = document.getElementById('an-trend-table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    'an-forecast-horizon'(el) { state.an.forecastHorizon = Math.max(1, Math.min(12, Number(el.dataset.value) || 3)); state.an.forecast = FP.trendForecastEngine ? FP.trendForecastEngine.analyzeMany(state.an.rows, { horizon: state.an.forecastHorizon, method: state.an.forecastMethod, periodType: state.an.periodType }) : null; render(); },
    'an-forecast-method'(el) { state.an.forecastMethod = el.value || 'linear'; state.an.forecast = FP.trendForecastEngine ? FP.trendForecastEngine.analyzeMany(state.an.rows, { horizon: state.an.forecastHorizon, method: state.an.forecastMethod, periodType: state.an.periodType }) : null; render(); },
    'an-ai'() {
      const n = state.an.narrative;
      if (!n || !n.ready || !FP.cohereNarrative) return;
      state.an.ai = { status: 'busy', result: null, errors: [] };
      if (state.view === 'analisis') FP.trendView.render(state);
      const sections = Object.fromEntries((n.layers || []).map((layer) => {
        const claims = (n.sections?.[layer.id] || []).map((c) => c.id);
        return [layer.id, { claims, empty: claims.length === 0 }];
      }));
      const payload = {
        ...n,
        readyToNarrate: { performance: true },
        businessContext: FP.config?.businessContext || null,
        period: state.an.temporal?.focus || null,
        channel: { id: 'total', label: 'Total' },
        comparison: state.an.share?.comparisonLabel || null,
        sections
      };
      FP.cohereNarrative.narrate(payload, { apiKey: state.dx.apiKey, model: state.dx.model })
        .then(r => {
          state.an.ai = { status: r.ok ? 'ok' : 'error', result: r.result, errors: r.errors || [] };
          if (state.view === 'analisis') FP.trendView.render(state);
        })
        .catch(e => {
          state.an.ai = { status: 'error', result: null, errors: [e?.message || String(e)] };
          if (state.view === 'analisis') FP.trendView.render(state);
        });
    },
    'an-select'(el) { state.an.selected = state.an.rows.find((r) => r.entity === el.dataset.entity) || null; render(); setTimeout(() => { const detail = document.getElementById('an-entity-reading'); if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); },
    'an-clear-selection'() { state.an.selected = null; render(); },

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
      if (item.remote) { reprocessRemote(item, el.value); return; }
      item.staged.dataType = el.value;
      item.result = processStaged(item.staged);
      render();
    },

    'set-mapping'(el) {
      const item = activeItem();
      if (item && item.staged.dataType === 'products') { item.staged.mapping[el.dataset.header] = el.value || null; item.result = null; processProduct(item); render(); return; }
      item.staged.mapping[el.dataset.header] = el.value || null;
      if (item.remote) { reprocessRemote(item); return; }
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
      } else if (key === 'includeErrorRows' || key === 'enableAI') state.settings[key] = el.checked;
      else state.settings[key] = el.value;
      saveSettings();
      reprocessAll();
      render();
    },

    /* ----- Configuración: expandir o contraer todos los desplegables ----- */
    'st-expand-all'() { state.stOpen = Object.fromEntries(FP.settingsView.SECTIONS.map((id) => [id, true])); render(); },
    'st-collapse-all'() { state.stOpen = Object.fromEntries(FP.settingsView.SECTIONS.map((id) => [id, false])); render(); },

    /* ----- Fase I: consolidado de cuarentena ----- */
    'q-filter'(el) { state.qFilters[el.dataset.key] = el.value; state.qFilters.page = 1; render(); },
    'q-page'(el) { state.qFilters.page = Number(el.dataset.value) || 1; render(); },
    'q-download'() {
      const f = state.qFilters, list = FP.qualityViewLines(state).filter((x) => (f.section === 'all' || x.section === f.section) && (f.rule === 'all' || x.rule === f.rule) && (f.file === 'all' || x.fileName === f.file));
      const q = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const head = ['seccion', 'archivo', 'fila', 'fecha', 'canal', 'campo', 'valor_original', 'valor_interpretado', 'regla', 'motivo'];
      const rows = list.map((x) => [x.section, x.fileName, x.row, x.date, x.channel, x.field, x.rawValue, x.parsedValue, x.rule, x.why].map(q).join(','));
      FP.exporter.download(`cuarentena_${FP.calendar.toISODate(new Date())}.csv`, [head.join(','), ...rows].join('\n') + '\n', 'text/csv');
    },

    /* ----- Fase H: transparencia y control de la IA ----- */
    'ia-log-clear'() { FP.aiAudit.clear(); render(); FP.ui.toast('Registro de consultas a Cohere borrado.'); },
    /** Lo aprendido por la IA (columna → campo): cambiar el campo, borrar una o borrar todo. Se guarda con las preferencias. */
    'learn-set'(el) {
      const map = IMP.learnedMappings(); map[el.dataset.header] = el.value; IMP.setLearnedMappings(map);
      state.settings.aiHeaderAliases = IMP.learnedMappings(); saveSettings(); render();
      FP.ui.toast(`«${el.dataset.header}» ahora se asigna a ${IMP.fieldLabel(el.value)}. Se aplica a los archivos que cargues desde ahora.`);
    },
    'learn-del'(el) {
      const map = IMP.learnedMappings(); delete map[el.dataset.header]; IMP.setLearnedMappings(map);
      state.settings.aiHeaderAliases = IMP.learnedMappings(); saveSettings(); render();
      FP.ui.toast(`«${el.dataset.header}» olvidada: la próxima vez la IA volverá a preguntar.`);
    },
    'learn-clear'() { IMP.setLearnedMappings({}); state.settings.aiHeaderAliases = {}; saveSettings(); render(); FP.ui.toast('Se borró todo lo aprendido por la IA.'); },
    /** Columnas marcadas como datos personales: viajan a Cohere sin ejemplos aunque su nombre y contenido no lo parezcan. */
    'pii-save'() {
      const el = document.getElementById('pii-text');
      const list = [...new Set(String(el ? el.value : '').split(/\r?\n/).map((x) => x.trim().slice(0, 120)).filter(Boolean))].slice(0, 200);
      state.settings.piiColumns = list; saveSettings(); FP.normalize.setPersonalColumns(list); render();
      FP.ui.toast(list.length ? `${list.length} columna${list.length === 1 ? '' : 's'} marcada${list.length === 1 ? '' : 's'} como datos personales: se enviarán sin ejemplos.` : 'No hay columnas marcadas como datos personales.');
    },

    'aliases-save'() {
      const el = document.getElementById('alias-text');
      const r = FP.aliases.parse(el ? el.value : '');
      FP.aliases.set(r.rules); saveAliases(); FP.aliases.clearUnknowns();
      reprocessAll(); render();
      FP.ui.toast(r.errors.length
        ? `${r.rules.length} equivalencias guardadas; ${r.errors.length} línea(s) no se entendieron (línea ${r.errors[0].line}: ${r.errors[0].why})`
        : `${r.rules.length} equivalencia${r.rules.length === 1 ? '' : 's'} guardada${r.rules.length === 1 ? '' : 's'}. Se aplican a lo que cargues o tengas en revisión; lo ya importado no cambia.`);
    },
    'alias-add'(el) {
      FP.aliases.add({ field: el.dataset.field, from: el.dataset.from, to: el.dataset.to });
      saveAliases(); FP.aliases.clearUnknowns();
      reprocessAll(); render();
      FP.ui.toast(`Equivalencia guardada: ${el.dataset.from} = ${el.dataset.to}. Lo ya importado no cambia: quita el archivo y vuelve a cargarlo para aplicarla.`);
    },

    'issue-filter'(el) { state.staging.issueFilter = el.dataset.value; render(); },

    'discard-staged'() {
      const item = activeItem();
      if (item && item.remote) FP.importWorker.drop(item.remote.jobId);   // el Worker libera las filas de ese archivo
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      render();
    },

    'commit-staged'() {
      const item = activeItem();
      if (item && item.staged.dataType === 'products') { commitProduct(item); return; }
      if (item && item.remote) { commitRemote(item); return; }
      // Revalida contra lo guardado en este momento SOLO si algo cambió desde la revisión. Con archivos grandes (cientos de miles de
      // filas) rehacer toda la validación duplicaba la memoria y tardaba decenas de segundos.
      if (!item.result || item.result.sig !== stagedSig(item.staged)) item.result = processStaged(item.staged);
      if (!item.result.canImport) { render(); FP.ui.toast('Corrige el mapeo antes de importar.'); return; }
      const batch = ST.commitBatch(state.store, item.staged, item.result,
        { includeErrorRows: state.settings.includeErrorRows, settings: state.settings, source: item.staged.sourceType, durationMs: item.staged.durationMs });
      finishCommit(item, batch);
    },

    /* ----- Fase 1: calidad y datos ----- */
    'quality-type'(el) { state.qualityType = el.dataset.value; state.qualityPicked = true; render(); },
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

    async 'remove-product-batch'(el) {
      const PS = FP.productStore;
      if (!PS || !PS.available()) return;
      const b = (await PS.listBatches()).find((x) => x.id === el.dataset.id);
      if (!b || !root.confirm(`¿Quitar "${b.fileName}" (${(b.summary && b.summary.accepted) || 0} filas de productos)? No se tocan los demás archivos.`)) return;
      try {
        const r = await PS.removeBatch(b.id);
        await refreshProductQuality();
        state.pa = { ...state.pa, result: null, key: null, counts: null, from: null, to: null, drill: [], geo: {}, next: null, trace: null };
        invalidatePlanning();
        refresh();
        render();
        FP.ui.toast(`${r.fileName || b.fileName} quitado (${(r.removedRows || 0).toLocaleString('es-MX')} filas de ${r.partitions || 0} día·canal).`);
      } catch (e) {
        FP.ui.toast(`No se pudo quitar ${b.fileName}: ${e.message}`);
      }
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
    'ux-mode'(el) {
      // Un solo estado de modo (Fase 7 + Aprendiz de Fase 9.1). Cambiar de modo solo cambia la presentación:
      // filtros, contexto, vista y resultados se conservan.
      const v = el.dataset.value;
      state.ux.mode = FP.guidanceConfig.MODES.some(([id]) => id === v) ? v : 'analyst';
      if (state.ux.mode !== 'learner') state.ux.lesson = null;
      render();
    },
    'nav-toggle'() { document.body.classList.toggle('nav-open'); },
    'lesson-dismiss'() { state.ux.lesson = null; render(); },
    /** "¿Por qué este número?": explica la cifra con la corrida real del motor, en el panel de ayuda de Fase 7. */
    'why'(el) {
      FP.explain.open(el.dataset.kind, state, { channel: el.dataset.channel || 'total', periodKey: el.dataset.period || null, metric: el.dataset.metric || 'revenue' });
    },
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
    'pa-viewby'(el) { const pa = state.pa; pa.viewBy = el.dataset.value || el.value; pa.drill = []; pa.next = null; pa.result = null; pa.trace = null; render(); },
    'pa-drill'(el) {
      const pa = state.pa, lvl = paLevel(pa);
      if (!lvl || lvl === 'sku') return;
      pa.drill = [...pa.drill, { level: lvl, key: el.dataset.key }]; pa.next = null; pa.result = null; pa.trace = null; render();
    },
    'pa-up'(el) {
      const pa = state.pa, i = Number(el.dataset.index);
      pa.drill = i < 0 ? [] : pa.drill.slice(0, i + 1); pa.next = null; pa.result = null; pa.trace = null; render();
    },
    'pa-next'(el) { const pa = state.pa; pa.next = el.value || null; pa.result = null; render(); },
    'pa-geo'(el) {
      const pa = state.pa, k = el.dataset.key;
      const order = ['region', 'state', 'city', 'branch'];
      const g = { ...pa.geo, [k]: el.value || '' };
      // Respeta la jerarquía: al cambiar un nivel, los inferiores se limpian
      if (order.includes(k)) order.slice(order.indexOf(k) + 1).forEach((x) => { g[x] = ''; });
      pa.geo = g;
      pa.drill = pa.drill.filter((d) => !g[d.level]);
      pa.next = null; pa.result = null; pa.trace = null; render();
    },
    'pa-geo-clear'() { const pa = state.pa; pa.geo = {}; pa.next = null; pa.result = null; render(); },
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
      const e = await EXPORT_BUILDERS.categoryProduct();
      if (!e.obj) { FP.ui.toast('Todavía no hay análisis de productos para exportar.'); return; }
      FP.exporter.download(e.file, e.obj);
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
      learn('scenario-saved');
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
      if (!state.dx.apiKey) { FP.ui.toast('Pega tu API key de Cohere en Configuración de RevNavigator.'); return; }
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
    'nav-group'(el) { FP.navigation.toggleGroup(el.dataset.value); },
    'rc-action-field'(el) {
      const r = FP.actionPlan.updateAction(state.rc.plan, el.dataset.id, { [el.dataset.key]: el.value || null });
      if (!r.ok) { FP.ui.toast(r.error); return; }
      saveActionPlan(); render();
    },
    'rc-measure'(el) {
      learn('measured');
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
      const e = EXPORT_BUILDERS.actionPlan();
      if (!e.obj) return;
      FP.exporter.download(e.file, e.obj);
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
      const keyInput = document.getElementById('dx-key-input');   // vive en Configuración: solo se lee si está a la vista (si no, manda el estado)
      const key = keyInput && keyInput.offsetParent !== null ? keyInput.value : undefined;
      if (key !== undefined) state.dx.apiKey = key.trim();
      if (!state.dx.apiKey) { FP.ui.toast('Pega tu API key de Cohere en Configuración de RevNavigator para generar hipótesis con IA.'); return; }
      state.dx.ai = { status: 'busy', result: null };
      render();
      const result = await FP.cohereDiagnostic.generateWithCohere(d, { apiKey: state.dx.apiKey, model: state.dx.model });
      if (state.dx.run !== d) return; // el diagnóstico cambió mientras esperábamos
      state.dx.ai = { status: result.status, result };
      render();
      FP.ui.toast(result.ok ? `Cohere redactó ${result.hypotheses.length} hipótesis validadas.` : 'Análisis con IA no disponible; el diagnóstico sigue completo.');
    },
    'dx-export'() {
      const e = EXPORT_BUILDERS.analysis();
      if (!e.obj) { FP.ui.toast('No hay diagnóstico para exportar.'); return; }
      FP.exporter.download(e.file, e.obj);
    },
    /* ----- Fase 9.2: narrativa ejecutiva ----- */
    async 'nx-ai'() {
      const n = ensureNarrative();
      if (!n) { FP.ui.toast('Todavía no hay narrativa calculada.'); return; }
      if (!state.dx.apiKey) { FP.ui.toast('Pega tu API key de Cohere en Configuración de RevNavigator para redactar con IA.'); return; }
      state.nx.ai = { status: 'busy', result: null, errors: [] };
      render();
      const result = await FP.cohereNarrative.narrate(n, { apiKey: state.dx.apiKey, model: state.dx.model });
      if (state.nx.narrative !== n) return; // la narrativa cambió mientras esperábamos
      state.nx.ai = result;
      render();
      FP.ui.toast(result.ok ? 'Cohere redactó la narrativa; se validó contra las cifras calculadas.' : 'Análisis con IA no disponible; la narrativa determinística sigue completa.');
    },
    'nx-export'() {
      const e = EXPORT_BUILDERS.narrative();
      if (!e.obj) { FP.ui.toast('No hay narrativa para exportar.'); return; }
      FP.exporter.download(e.file, e.obj);
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
      const e = EXPORT_BUILDERS.reforecast();
      if (!e.obj) return;
      FP.exporter.download(e.file, e.obj);
    },

    /* ----- Fase 3: pacing y forecast ----- */
    'fc-setting'(el) {
      const fc = state.fc;
      const key = el.dataset.key;
      if (key === 'method') learn('method-changed');
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
      const e = EXPORT_BUILDERS.forecast({ strict: false });
      if (!e.obj) return;
      FP.exporter.download(e.file, e.obj);
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
      learn('plan-saved');
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
      const e = EXPORT_BUILDERS.planning();
      if (!e.obj) return;
      FP.exporter.download(e.file, e.obj);
    },
    /**
     * Fase 10 · periodo y canal desde la página del paquete. Cambian las MISMAS opciones de Diagnóstico, Recovery Center (y con ellas
     * Narrativa) y Categoría → Producto; Pacing, Reforecast y Plan son del año completo. Comparación y demás ajustes siguen en cada vista.
     */
    'staging-retype'(el) {
      const item = state.staging.items.find((i) => i.staged.id === state.staging.activeId) || state.staging.items[0];
      if (item) retypeStaged(item, el.value || el.dataset.value);
    },
    /* ----- Proyección del próximo año ----- */
    'proj-growth'(el) {
      const v = Number(String(el.value).replace(',', '.'));
      if (!isFinite(v) || v < 0 || v > 200) { FP.ui.toast('El crecimiento debe estar entre 0 y 200 %.'); render(); return; }
      state.proj.growth = v / 100; state.proj.savedAt = null; render();
    },
    'proj-share'(el) {
      const v = Number(String(el.value).replace(',', '.'));
      if (!isFinite(v) || v < 0 || v > 100) { FP.ui.toast('La participación debe estar entre 0 y 100 %.'); render(); return; }
      if (!state.proj.shares) { const r = FP.projectionView.compute(state); state.proj.shares = Object.fromEntries(r.rows.map((x) => [x.id, Math.round(x.metaShare * 1000) / 10])); }
      state.proj.shares[el.dataset.channel] = v; state.proj.savedAt = null; render();
    },
    'proj-channel'(el) { state.proj.channel = el.value; render(); },
    'proj-reset'() { state.proj.growth = 0.16; state.proj.shares = null; state.proj.savedAt = null; render(); },
    'proj-download-json'() {
      const r = FP.projectionView.compute(state);
      FP.exporter.download(`proyeccion_${r.targetYear}.json`, JSON.stringify(FP.projection.toExport(r, { app: C.app.name, version: C.app.version }), null, 2));
    },
    'proj-download-csv'() {
      const r = FP.projectionView.compute(state); if (!r.hasData) return;
      FP.exporter.download(`proyeccion_${r.targetYear}_mensual.csv`, FP.projection.toCsv(r), 'text/csv');
    },
    /** Guarda la meta propuesta como metas del año siguiente (venta total y por canal); no toca las del año actual. */
    'proj-save-targets'() {
      const r = FP.projectionView.compute(state); if (!r.hasData) return;
      const ty = r.targetYear, prev = storage.load(yk(K.targets, ty));
      const had = prev && prev.data && prev.data.annual && prev.data.annual.revenue;
      if (had && !window.confirm(`Ya hay metas de ${ty} guardadas (${FP.format.currency(prev.data.annual.revenue, 0)}). ¿Reemplazarlas por la meta propuesta (${FP.format.currency(r.meta.total, 0)})?`)) return;
      const t = DM.createTargets(ty);
      t.annual.revenue = r.meta.total; r.rows.forEach((x) => { t.byChannel[x.id].revenue = x.meta; });
      t.updatedAt = new Date().toISOString();
      if (!storage.save(yk(K.targets, ty), t)) { FP.ui.toast(`No se pudieron guardar las metas de ${ty}: ${storage.lastError || 'sin espacio'}.`); return; }
      if (state.year === ty) { state.targets = t; refresh(); }
      state.proj.savedAt = Date.now(); state.proj.savedTotal = r.meta.total;
      FP.ui.toast(`Metas de ${ty} guardadas: ${FP.format.currency(r.meta.total, 0)} en total.`);
      render();
    },
    'proj-open-plan'() {
      const ty = state.year + 1;
      loadYearScoped(ty); refresh(); resetPeriod(); location.hash = '#resumen'; render();
    },

    'seg-dim'(el) { (state.seg || (state.seg = {})).dimension = el.value; render(); },
    /**
     * Tráfico y conversión · parte 3: lleva una oportunidad de segmento a Recovery Center. Los escenarios trabajan con el canal completo,
     * así que el segmento se traduce a su equivalente en el canal: los pedidos extra de llevarlo al CR del total, como % del CR de los
     * pedidos de todos los segmentos (data-rel). Mismo canal y periodo; en un periodo ya cerrado se aplica a todo el periodo (retrospectivo).
     */
    'seg-simulate'(el) {
      const rel = Number(el.dataset.rel), seg = el.dataset.label || 'segmento';
      if (!isFinite(rel) || rel <= 0) return;
      const s = state.dx.settings, rs = state.rc.settings;
      rs.channel = s.channel; rs.periodType = s.periodType; rs.periodKey = s.periodKey;
      const r = periodRange(s.periodType, s.periodKey); const cutoff = state.fc.run && state.fc.run.cutoff;
      rs.applyTo = r && cutoff && r.to <= cutoff ? 'all' : 'future';
      saveRecoverySettings();
      state.rc.draft = { ...emptyDraft(), crMode: 'pct', crValue: +rel.toFixed(4), target: 'channel',
        name: `Llevar «${seg}» al CR del total (+${rel.toFixed(2)} % de CR del canal)` };
      location.hash = '#recovery';
      setTimeout(() => { const t = document.getElementById('rc-simulator'); if (t) t.scrollIntoView({ block: 'start' }); FP.ui.toast(`Escenario precargado: llevar «${seg}» al CR del total equivale a +${rel.toFixed(2)} % de CR en el canal. Revisa y guarda si te sirve.`); }, 300);
    },
    'pkg-context'(el) {
      const k = el.dataset.key, v = el.dataset.value || el.value;
      const dx = state.dx.settings, rc = state.rc.settings, pa = state.pa;
      if (k === 'periodType') { dx.periodType = v; dx.periodKey = null; rc.periodType = v; rc.periodKey = null; }
      else if (k === 'periodKey') { dx.periodKey = v; rc.periodKey = v; }
      else if (k === 'channel') { dx.channel = v; rc.channel = v; pa.channel = v; state.ux.ctx.channel = v; }
      state.dx.run = null;
      saveDiagnosticSettings(); saveRecoverySettings();
      ensureDiagnostic();
      // Productos: el mismo rango de fechas que el periodo elegido
      const r = periodRange(dx.periodType, dx.periodKey);
      if (r) { pa.from = r.from; pa.to = r.to; pa.drill = []; pa.next = null; pa.trace = null; }
      pa.result = null; pa.note = null;
      render();
    },
    async 'pkg-download'() {
      const pkg = FP.packageView.setBusy(true);
      try {
        const out = await buildAnalysisPackage();
        FP.zip.download(out.zipName, FP.zip.create(out.files));
        state.pkg.last = { at: out.index.source.generatedAt, files: out.index.files };
        FP.ui.toast(`Paquete generado: ${out.index.files.filter((f) => f.status === 'complete').length} de 7 exports con datos.`);
      } finally { FP.packageView.setBusy(false); render(); }
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
    let v = (root.location.hash || '').replace('#', '');
    // «Negocio» (Business Setup) vive ahora dentro de Configuración de RevNavigator: el enlace #negocio abre esa sección
    if (v === 'negocio') { v = 'ajustes'; state.ajustesSection = 'negocio'; try { root.history.replaceState(null, '', '#ajustes'); } catch (e) { /* file:// */ } }
    state.view = VIEWS.includes(v) ? v : 'inicio';
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button[data-action]');
      if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    // Arrastrar y soltar CSV sobre una tarjeta de carga (alternativa al botón «Seleccionar CSV»; el botón sigue siendo la vía con teclado)
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const dropTarget = (e) => { const card = e.target.closest && e.target.closest('.upload-card'); const inp = card && card.querySelector('input[data-action="pick-files"]'); return inp && !inp.disabled ? { card, inp } : null; };
    ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();                       // sin esto el navegador abriría el archivo y saldría de la app
      const t = dropTarget(e);
      if (!t) { e.dataTransfer.dropEffect = 'none'; return; }
      e.dataTransfer.dropEffect = 'copy';
      setUploadState(t.card.querySelector('.upload-card__state'), 'dragging', 'Suelta el archivo aquí para revisarlo');
    }));
    document.addEventListener('dragleave', (e) => {
      const card = e.target.closest && e.target.closest('.upload-card');
      if (card && !(e.relatedTarget && card.contains(e.relatedTarget))) restoreUploadState(card.querySelector('.upload-card__state'));
    });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      document.querySelectorAll('.upload-card__state[data-state="dragging"]').forEach(restoreUploadState);
      const t = dropTarget(e);
      if (!t) { FP.ui.toast('Suelta el archivo sobre una de las tarjetas de carga.'); return; }
      stageFiles([...e.dataTransfer.files], t.inp.dataset.type, t.card.querySelector('.upload-card__state'));
    });
    document.addEventListener('dragend', () => document.querySelectorAll('.upload-card__state[data-state="dragging"]').forEach(restoreUploadState));

    // Píldoras del encabezado (y cualquier enlace con data-section): llevan a esa sección de Configuración de RevNavigator.
    // Si ya se está en Configuración el hash no cambia, así que se vuelve a pintar para que baje a la sección.
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-section]');
      if (!a) return;
      state.ajustesSection = a.dataset.section;
      if ((root.location.hash || '') === a.getAttribute('href')) { e.preventDefault(); render(); }
    });
    // «Saltar al contenido»: lleva el foco a la vista visible (no cambia la dirección: #contenido no es una ruta de la app)
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-skip]');
      if (!a) return;
      e.preventDefault();
      const main = document.querySelector('main.app-main:not([hidden])');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); main.scrollIntoView({ block: 'start' }); }
    });
    document.addEventListener('click', (e) => {
      const j = e.target.closest('a[data-sgjump]');
      if (!j) return;
      e.preventDefault();
      const t = document.getElementById(j.dataset.sgjump);
      if (t) { t.scrollIntoView({ block: 'start', behavior: 'smooth' }); if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
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
    if (FP.productStore) { await FP.productStore.init(repo); await refreshProductQuality(); }
  }

  async function init() {
    try { await initStorage(); } catch (e) { state.storage = { mode: 'unavailable', migration: migrationState, error: String(e && e.message || e) }; }
    FP.ui.renderAppMeta();
    loadSettings();
    loadAliases();
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
  FP.app = { state, actions, saveStore, savingChain, paLevel, paNextChoices, paFilter, periodRange, storage, repo, lsStorage, lsAdapter, retryMigration: async () => { migrationState = await FP.storageMigration.migrate({ ls: lsStorage, lsAdapter, repo, force: true }); state.storage.migration = migrationState; return migrationState; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
