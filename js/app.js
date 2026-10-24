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
  const VIEWS = ['resumen', 'carga', 'calidad', 'datos', 'estacionalidad', 'plan', 'configuracion', 'pacing', 'reforecast', 'diagnostico', 'producto', 'analisis', 'recovery', 'inicio', 'medir', 'narrativa', 'ayuda', 'ajustes', 'presentacion', 'segmentos', 'proyeccion', 'cambios', 'clientes'];
  const MOCK_ORIGIN = 'mock-fase0';

  const state = {
    productQuality: [],
    replace: { undo: null },   // reemplazo de archivos: instantánea para deshacer el último reemplazo
    cx: { mode: 'ayer', sync: null, key: null },
    cu: { status: 'idle', key: null, result: null, info: null, opts: { reactivationDays: 180, warmupDays: 180, channel: 'total' } },   // «Clientes y LTV»   // «Qué cambió desde ayer»
    stTab: 'herramienta',   // pestaña activa de Configuración (cuenta, ia, datos, herramienta, negocio)
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
    sheets: { links: [], busy: false },
    cloud: { busy: false, msg: null, tone: null, last: null, session: null, auto: { on: false, last: null, error: null, pulled: [] } },   // Fase S1: copia en la nube (Supabase)   // Fase 15: enlaces de Google Sheets publicados (solo URL)
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
      tour: { active: false, step: 0, collapsed: false, went: false, flash: '', skipped: {}, ended: null, micro: {}, lastMicro: '', lastMicroTitle: '', path: null, compact: false, upDismissed: '' },
      tourOffered: false,
      home: { channel: 'total', periodType: 'year', periodKey: null, follow: true },
      measureAction: null,
      crumbExtra: {}
    },
    // Fase 8.1: Categoría → Producto (resultados en memoria; datos en IndexedDB)
    pkg: { busy: false, last: null },
    rp: { status: 'idle', report: null, error: null, exclude: ['reliability', 'seasonality', 'annex'], options: { showTags: false, showBusinessName: false }, filter: null, sig: null, at: null },   // «Presentación (PDF)»
    pa: { from: null, to: null, comparison: 'previous', channel: 'total', viewBy: 'category', drill: [], next: null, geo: {}, topN: 20, page: 1, result: null, loading: false, key: null,
      trace: null, counts: null, estimate: null, tests: null, testing: false, note: null },
    // Análisis 1: evolución histórica y patrones. La serie se calcula desde IndexedDB.
    fs: {},
    an: { filter: {}, channel: 'total', metric: 'revenue', stateFilter: 'all', level: 'product', periodType: 'month', periodCount: 12, focusKey: null, comparison: 'previous', pattern: 'all', signal: 'all', anomalyDirection: 'all', entityQuery: '', minImpact: 0, minSharePct: 0.5, page: 1, pageSize: 6, rows: [], advanced: [], groups: [], selected: null, loading: false, key: null, error: null, share: null, priorities: null, risks: null, forecast: null, cohort: null, forecastHorizon: 3, forecastMethod: 'linear', forecastPage: 1, narrative: null, ai: { status: null, result: null, errors: [] }, assistant: { open: false, question: '', status: 'idle', result: null, errors: [], history: [] } },
    // Fase 8.2: Business Setup (borrador en memoria; lo guardado vive en localStorage `businessContext`)
    bc: { draft: null, storedAt: null, dirty: false },
    brand: { draft: { logo: null, palette: [], main: null, accent: null, cover: 'chart' }, sel: null, saved: false, dirty: false, error: null },
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
      narrative: null, key: null, sigShown: { pos: 5, neg: 5, neu: 5 },
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
    /** Hay IA disponible si hay sesión de equipo (servidor) o una key local. */
    isConfigured() { return Boolean(state.dx.apiKey) || Boolean(FP.cohereProxy && FP.cohereProxy.available()); }
  };

  /* ================= Persistencia ================= */

  function defaultSettings() {
    return {
      ...IMP.defaultSettings(),
      includeErrorRows: false,
      replaceRowsDropPct: 20, replaceRevenuePct: 5,   // reemplazo de archivos: umbrales (%) de la confirmación extra
      sumSameKey: true,   // archivo de productos transaccional: filas con la misma llave completa se suman
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

  /** Fase 4: un guardado que falla se avisa (sin repetir cada pocos segundos). Los datos siguen en la sesión; no se afirma que se guardaron. */
  let lastSaveWarn = 0;
  function saveOk(ok, what) {
    if (ok) return true;
    const now = Date.now();
    if (now - lastSaveWarn > 20000) { lastSaveWarn = now; FP.ui.toast(`No se pudo guardar ${what} en este navegador (${storage.lastError || 'sin espacio o sin permiso'}). Tus cambios siguen en esta sesión, pero se perderán si cierras la pestaña: exporta un respaldo o libera espacio y vuelve a intentar.`); }
    return false;
  }
  function saveSettings() { storage.save(K.settings, state.settings); }

  /** Equivalencias de nombres (homologación): se guardan aparte y las consultan los normalizadores al importar. */
  /** Google Sheets por enlace publicado (Fase 15): se recuerda solo la URL, la etiqueta y cuándo se trajo; nunca claves ni datos. */
  function loadSheetLinks() {
    const s = storage.load(K.sheetsLinks);
    const ok = (l) => l && typeof l.id === 'string' && typeof l.url === 'string' && (l.type === 'products' || C.dataTypeIds.includes(l.type));
    state.sheets.links = s && s.data && Array.isArray(s.data.links) ? s.data.links.filter(ok).slice(0, 30) : [];
  }
  function saveSheetLinks() { storage.save(K.sheetsLinks, { links: state.sheets.links }); }
  /** Trae una pestaña y la deja «en revisión» (nada se importa sin confirmar). Devuelve { ok, rows } o { ok:false, error }. Sin avisos propios si `quiet`. */
  async function fetchSheetCore(type, link, quiet) {
    const SL = FP.sheetsLink;
    const n = SL.normalize(link.url);
    if (!n.ok) { if (!quiet) FP.ui.toast(n.error); return { ok: false, error: n.error }; }
    if (!quiet) FP.ui.toast('Trayendo la pestaña de Google Sheets…');
    const r = await SL.fetchCsv(n.csvUrl);
    if (!r.ok) { if (!quiet) FP.ui.toast(r.error); return { ok: false, error: r.error }; }
    const file = new File([r.text], SL.fileName(link.label, type), { type: 'text/csv' });
    // Una nueva «Actualizar» SUSTITUYE la revisión pendiente de esa misma hoja (si no, se apilan y el reemplazo queda en la vieja)
    const pend = state.staging.items.filter((i) => i.staged.fileName === file.name && i.staged.dataType === type && i.status !== 'saving' && !i.busy);
    if (pend.length) {
      pend.forEach((i) => { if (i.remote) FP.importWorker.drop(i.remote.jobId); });
      state.staging.items = state.staging.items.filter((i) => !pend.includes(i));
      if (!quiet) FP.ui.toast('Había una revisión pendiente de esta hoja: se sustituyó por la versión recién traída.');
    }
    const card = document.getElementById(`up-${type}`);
    await stageFiles([file], type, card ? card.closest('.upload-card').querySelector('.upload-card__state') : null);
    // Actualizar desde Sheets: por omisión solo entran las filas nuevas o cambiadas (la hoja publicada siempre baja completa)
    const stagedItem = state.staging.items.find((i) => i.staged.fileName === file.name);
    if (stagedItem && ST.canSkipUnchanged(type)) stagedItem.skipUnchanged = true;
    // «Actualizar» una hoja ligada reemplaza lo que vino de esa misma hoja (y sólo eso); si es la primera vez, se agrega como siempre
    if (stagedItem) stagedItem.replace = { batchId: FP.replaceView.defaultFor(state, stagedItem), confirmed: false };
    const rows = Math.max(0, r.rows - 1);
    const id = link.id || `sh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // Enlace para abrir la hoja: el que pegó la persona; si usó un enlace compartido (/d/<id>/), se deriva solo; si no, conserva el anterior
    const prev = state.sheets.links.find((l) => l.id === id || (l.type === type && l.url === String(link.url).trim()));
    const open = SL.editUrl(link.editUrl) || (n.kind === 'shared' ? SL.editUrl(link.url) : '') || (prev && prev.editUrl) || '';
    const rec = { id, type, url: String(link.url).trim(), label: String(link.label || '').trim(), lastAt: new Date().toISOString(), rows, kind: n.kind, ...(open ? { editUrl: open } : {}) };
    const i = state.sheets.links.findIndex((l) => l.id === id || (l.type === type && l.url === rec.url));
    if (i >= 0) state.sheets.links[i] = rec; else state.sheets.links.push(rec);
    saveSheetLinks();
    return { ok: true, rows, kind: n.kind, label: rec.label || type };
  }
  const sheetButtons = () => [...document.querySelectorAll('[data-action="sheets-fetch"], [data-action="sheets-refresh"], [data-action="sheets-refresh-all"]')];
  async function fetchSheet(type, link) {
    if (state.sheets.busy) return;
    state.sheets.busy = true;
    sheetButtons().forEach((b) => { b.disabled = true; });
    try {
      const r = await fetchSheetCore(type, link, false);
      if (!r.ok) return;
      clearDrafts('sheets-');
      render();
      FP.ui.toast(`Traje ${r.rows.toLocaleString('es-MX')} filas de Google Sheets. Revísalas abajo antes de importar.${r.kind === 'shared' ? ' Ojo: ese enlace comparte todo el libro; es más seguro publicar solo la pestaña.' : ''}`);
      scrollToStaging();
    } finally {
      state.sheets.busy = false;
      sheetButtons().forEach((b) => { b.disabled = false; });
    }
  }
  /** «Actualizar todo»: vuelve a leer todas las pestañas guardadas, una tras otra, y las deja juntas en revisión. Una que falle no detiene a las demás. */
  async function fetchAllSheets() {
    const links = state.sheets.links.slice();
    if (!links.length) { FP.ui.toast('Todavía no hay pestañas de Google Sheets guardadas.'); return; }
    if (state.sheets.busy) return;
    state.sheets.busy = true;
    sheetButtons().forEach((b) => { b.disabled = true; });
    const ok = [], bad = [];
    try {
      FP.ui.toast(`Trayendo ${links.length} pestaña${links.length === 1 ? '' : 's'} de Google Sheets…`);
      for (const l of links) {
        let r;
        try { r = await fetchSheetCore(l.type, l, true); } catch (e) { r = { ok: false, error: 'Error inesperado al leerla.' }; }
        (r.ok ? ok : bad).push({ l, r });
      }
      state.sheets.lastAll = { at: new Date().toISOString(), ok: ok.map((x) => ({ label: x.l.label || x.l.type, rows: x.r.rows })), bad: bad.map((x) => ({ label: x.l.label || x.l.type, error: x.r.error })) };
      render();
      FP.ui.toast(`${ok.length} de ${links.length} pestañas listas para revisar${bad.length ? `; ${bad.length} no se pudo${bad.length === 1 ? '' : 'ieron'} traer (ver abajo)` : ''}. Nada se importa hasta que lo confirmes.`);
      if (ok.length) scrollToStaging();
    } finally {
      state.sheets.busy = false;
      sheetButtons().forEach((b) => { b.disabled = false; });
    }
  }

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
    if (state.rf.registry) saveOk(storage.save(yk(K.reforecasts, state.year), state.rf.registry), 'el repronóstico');
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
    const key = JSON.stringify([x.from, x.to, x.periodType, x.channel, x.comparison, m.batches]);
    if (out.key === key && (out.result || out.loading)) return;
    out.key = key; out.loading = true; out.error = null;
    try {
      const run = (level) => FP.productAnalysis.run({ from: x.from, to: x.to, periodType: x.periodType, comparison: x.comparison, channel: x.channel, level, withGeoSignals: false });
      const [category, product, region] = [await run('category'), await run('product'), await run('region')];
      if (out.key !== key) return;
      out.result = { from: x.from, to: category.period.to, channel: x.channel, comparison: x.comparison, note: x.note, category, product, region };
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
    if (x) Object.assign(state.pa, { from: x.from, to: x.to, periodType: x.periodType, channel: x.channel, comparison: x.comparison, note: x.note });
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
      state.nx.ai = { status: null, result: null, errors: [] }; state.nx.sigShown = { pos: 5, neg: 5, neu: 5 };
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
  /** Marca de la presentación: lo guardado se aplica a la presentación; el borrador sirve a la pantalla de Configuración. */
  function loadBrand() {
    const env = storage.load(K.reportBrand), b = env ? FP.brand.normalize(env.data) : null;
    FP.brand.set(b);
    state.brand = { draft: b ? { logo: b.logo, palette: b.palette, main: b.main, accent: b.accent, cover: b.cover } : { logo: null, palette: [], main: null, accent: null, cover: 'chart' }, sel: null, saved: Boolean(b), dirty: false, error: null };
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
  function saveScenarios() { return saveOk(storage.save(yk(K.scenarios, state.year), state.rc.scenarioStore), 'los escenarios'); }
  function saveActionPlan() { return saveOk(storage.save(yk(K.actionPlan, state.year), state.rc.plan), 'el plan de acción'); }

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

  /** Estado por canal del mismo periodo: plan, forecast y gap de cada canal (mismo cálculo del gap total, sin simular cambios). Solo lee. */
  function channelStatus({ run, rf, period, applyTo, ctx }) {
    try {
      const one = (id, label) => {
        const c = id === ctx.channel ? ctx : FP.scenarioEngine.buildContext({ run, rf, channel: id, period, applyTo, store: state.store });
        const b = FP.scenarioEngine.simulate(c, { changes: {} });
        if (!b.valid) return { id, label, valid: false };
        const g = b.gap, plan = g.plan, forecast = g.base, gap = g.gapBefore;
        const same = (x) => x.context && x.context.period && x.context.period.start === ctx.period.start && x.context.period.end === ctx.period.end && x.context.channel === id;
        const nSc = state.rc.scenarioStore ? state.rc.scenarioStore.scenarios.filter(same).length : 0;
        const nAc = state.rc.plan ? state.rc.plan.actions.filter((a) => a.channel === id && a.period && a.period.start === ctx.period.start && a.period.end === ctx.period.end).length : 0;
        return { id, label, valid: true, plan, forecast, gap, pct: plan > 0 ? gap / plan : null, scenarios: nSc, actions: nAc };
      };
      const total = one('total', 'Total digital');
      const channels = C.channels.map((c) => one(c.id, c.label)).filter((x) => x.valid);
      const withGap = channels.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);   // por tamaño del gap en pesos
      const healthy = channels.filter((x) => !(x.gap > 0)).sort((a, b) => a.gap - b.gap);
      return { total: total.valid ? total : null, withGap, healthy, gapSum: withGap.reduce((t, x) => t + x.gap, 0), periodType: ctx.period.type, periodLabel: ctx.period.label };
    } catch (e) { return null; }
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
      rc.chStatus = channelStatus({ run, rf, period, applyTo: s.applyTo, ctx });
    } else rc.chStatus = null;
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
    if (state.fc.registry) saveOk(storage.save(yk(K.forecasts, state.year), state.fc.registry), 'el pronóstico');
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
  /** Supuestos de arranque: copia editable de standardShape / generalAov / crSource dentro de los ajustes guardados. */
  function ssGet(key) {
    const st = state.planning.settings;
    if (!st[key] || key === 'crSource') st[key] = FP.seasonality.effectiveConfig(st)[key];
    return st[key];
  }
  function ssSave() { savePlanningSettings(); invalidatePlanning(); render(); }

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


  /** Presentación (PDF) · reúne lo ya calculado (sin recalcular nada propio) y arma las páginas con FP.reportBuilder. */
  async function buildExecutiveReport() {
    const ch = state.dx.settings.channel || 'total';
    let run = null, rf = null, diag = null;
    try { run = ensureForecast(); if (run && run.plan.source !== 'none') { rf = ensureReforecast(); diag = ensureDiagnostic(); try { ensureRecovery(); } catch (e) { /* sin Recovery la página se omite */ } } } catch (e) { /* cada página reporta su motivo */ }
    // La presentación se rige solo por su propio selector de periodo: con un mes o una semana ya cerrados, el corte es el último día de ese periodo
    // (se recalcula en local con el mismo motor; la fecha de referencia del forecast de toda la app no se toca).
    let localCut = null;
    try {
      const px = state.dx.settings || {}, coll = px.periodType === 'month' ? 'months' : px.periodType === 'week' ? 'weeks' : null;
      const per = run && run.total && coll ? (run.total[coll] || []).find((m) => m.key === px.periodKey) : null;
      if (per && per.lastDate && run.cutoff && per.lastDate < run.cutoff) {
        const planVersion = FP.planning.getOriginalPlan(state.planning.registry);
        const lrun = FP.forecastEngine.runForecast({ year: state.year, store: state.store, planVersion, dataset: planVersion ? null : state.dataset, events: state.events, settings: { ...state.fc.settings, referenceDate: per.lastDate } });
        if (lrun && lrun.plan.source !== 'none') {
          const lrf = FP.reforecastEngine.runReforecast({ run: lrun, planVersion, store: state.store, settings: state.rf.settings, simulated: true, forecastVersion: null });
          const ldx = FP.diagnosticEngine.runDiagnostic({ comparison: px.comparison, period: { type: px.periodType, key: px.periodKey }, channel: px.channel, metric: px.metric, method: px.method, run: lrun, rf: lrf, store: state.store, quality: state.quality });
          run = lrun; rf = lrf; diag = ldx; localCut = per.lastDate;
        }
      }
    } catch (e) { /* si no se puede recalcular, el reporte usa el corte de la app */ }
    // Tráfico: contra el plan los segmentos solo se comparan con el mismo periodo del año anterior; si el export de GA4 no llega tan atrás
    // (o el diagnóstico no trae segmentos), la lámina se lee contra el periodo anterior y lo dice en su encabezado.
    let trafficDiag = null;
    try {
      const noSeg = (d) => !d || !(d.level2 || []).some((x) => x.source !== 'core' && x.groups && x.groups.length);
      const sx = state.dx.settings;
      if (diag && noSeg(diag) && diag.comparison && diag.comparison.id !== 'actual_vs_previous' && FP.dataStore.latestList(state.store, 'segments').length) {
        const alt = FP.diagnosticEngine.runDiagnostic({ comparison: 'actual_vs_previous', period: { type: sx.periodType, key: sx.periodKey }, channel: sx.channel, metric: sx.metric, method: sx.method, run, rf, store: state.store, quality: state.quality });
        if (alt && !noSeg(alt)) trafficDiag = alt;
      }
    } catch (e) { /* la lámina se omite con su motivo */ }
    // Tráfico por semana del período (solo presentación): suma de las sesiones y compras de una dimensión completa del archivo de segmentos.
    // No calcula nada nuevo: agrupa por bloques de 7 días lo que ya está cargado, con el mismo rango y canales que usa el diagnóstico.
    let trafficWeekly = null;
    try {
      const dg = trafficDiag || diag, rg = dg && dg.coverage && dg.coverage.currentRange;
      if (rg && rg[0] && rg[1] && FP.dataStore.latestList(state.store, 'segments').length) {
        const recs = FP.dataStore.latestList(state.store, 'segments'), chOk = (c) => ch === 'total' || c === ch;
        const dimId = ['device', 'medium', 'customer_type', 'campaign'].find((d) => recs.some((r) => r.dimension === d && r.date >= rg[0] && r.date <= rg[1] && chOk(r.channel)));
        if (dimId) {
          const byDate = new Map();
          recs.filter((r) => r.dimension === dimId && r.date >= rg[0] && r.date <= rg[1] && chOk(r.channel)).forEach((r) => {
            const t = r.metrics && r.metrics.trafficVolume, o = r.metrics && r.metrics.orders; if (!t || !isFinite(t.value)) return;
            const a = byDate.get(r.date) || { traffic: 0, orders: 0 }; a.traffic += t.value; a.orders += o && isFinite(o.value) ? o.value : 0; byDate.set(r.date, a);
          });
          const dates = [...byDate.keys()].sort(), start = Date.parse(rg[0] + 'T00:00:00Z'), W = new Map();
          dates.forEach((d) => { const k = Math.floor((Date.parse(d + 'T00:00:00Z') - start) / 864e5 / 7), a = W.get(k) || { traffic: 0, orders: 0, dates: [] }; a.traffic += byDate.get(d).traffic; a.orders += byDate.get(d).orders; a.dates.push(d); W.set(k, a); });
          trafficWeekly = [...W.entries()].sort((a, b) => a[0] - b[0]).map(([, a]) => ({ from: a.dates[0], to: a.dates[a.dates.length - 1], days: a.dates.length, traffic: a.traffic, orders: a.orders }));
        }
      }
    } catch (e) { trafficWeekly = null; }
    const hasProducts = FP.productStore.available() && (FP.productStore.meta || {}).batches;
    let productByLevel = null, trendSnap = null;
    // Período y canal seleccionados (Diagnóstico): si es un mes, Productos y Evolución se leen sobre ESE mes y canal.
    const dxs = state.dx.settings || {};
    const monthSel = (dxs.periodType === 'month' && /^\d{4}-\d{2}$/.test(dxs.periodKey || '')) || (dxs.periodType === 'week' && /^\d{4}-W\d{2}$/.test(dxs.periodKey || '')) ? dxs.periodKey : null;
    const monthArgs = monthSel && diag && FP.productAnalysis.fromDiagnosis ? FP.productAnalysis.fromDiagnosis(diag) : null;
    const monthOn = Boolean(monthArgs && monthArgs.periodType === dxs.periodType && monthArgs.from && (dxs.periodType === 'week' || monthArgs.from.slice(0, 7) === monthSel));
    // Lectura anual: Evolución se centra en el mes del corte (en curso contra los mismos días del anterior), no en el último mes completo que usa la vista por defecto.
    const cutMonthKey = run && run.cutoff && /^\d{4}-\d{2}-\d{2}$/.test(run.cutoff) ? run.cutoff.slice(0, 7) : null;
    const trendBase = monthOn ? { periodType: dxs.periodType, focusKey: monthSel, channel: ch, comparison: monthArgs.comparison === 'yoy' ? 'yoy' : 'previous' } : (cutMonthKey ? { periodType: 'month', focusKey: cutMonthKey, channel: ch, comparison: 'previous' } : {});
    let rfMonth = null;
    if (rf && !localCut) { const r = state.rf; rfMonth = [r.run, r.altRun].find((x) => x && x.total && x.total.horizon && x.total.horizon.type === 'month') || null; }
    const rpF = FP.productFilter && state.rp.filter && FP.productFilter.isActive(state.rp.filter) ? FP.productFilter.active(state.rp.filter) : null;
    if (hasProducts) {
      try { if (!state.pa.result) await ensureProductAnalysis(); } catch (e) { /* página omitida con motivo */ }
      if (rpF || monthOn || cutMonthKey) {
        // Filtro único de la presentación: se aplica a Evolución solo durante el armado y luego se restaura la vista tal como estaba.
        const snap = { ...state.an }; Object.assign(state.an, trendBase, { filter: rpF || {} });
        try { await ensureTrendAnalysis(); trendSnap = { priorities: state.an.priorities, rows: state.an.rows, context: state.an.context, share: state.an.share }; } catch (e) { /* página omitida con motivo */ }
        finally { Object.assign(state.an, snap); }
      } else { try { await ensureTrendAnalysis(); } catch (e) { /* página omitida con motivo */ } }
      // Categorías y productos: el cambio se muestra por categoría y la participación por subcategoría (mismo período, referencia, canal y filtro).
      try {
        const pr = state.pa.result;
        if (monthOn) {
          const args = { from: monthArgs.from, to: monthArgs.to, periodType: dxs.periodType, comparison: monthArgs.comparison, channel: ch, filter: rpF || undefined, next: null };
          const lv = {}; for (const l of ['category', 'subcategory']) lv[l] = await FP.productAnalysis.run({ ...args, level: l, withGeoSignals: false });
          productByLevel = lv;
        } else if (pr && pr.period) {
          const args = { from: pr.period.from, to: pr.period.to, periodType: state.pa.periodType, comparison: state.pa.comparison, channel: ch, filter: rpF || pr.filter || undefined, next: null }; // el canal de la presentación manda (no el de la vista Productos)
          const lv = {}; ['category', 'subcategory'].forEach((l) => { if (pr.level === l && !rpF && (state.pa.channel || 'total') === ch) lv[l] = pr; });
          for (const l of ['category', 'subcategory']) if (!lv[l]) lv[l] = await FP.productAnalysis.run({ ...args, level: l, withGeoSignals: false });
          productByLevel = lv;
        }
      } catch (e) { productByLevel = null; /* se usa el nivel que tenga el análisis */ }
    }
    // Foco de la caída: la categoría que más arrastra, su subcategoría y dónde (farmacias, entrega). Se analiza a nivel de categoría/subcategoría
    // con 14 períodos (para comparar con el mismo mes del año anterior) y la vista de Evolución queda tal como estaba.
    let focusData = null;
    if (hasProducts && !rpF) {
      const trendAt = async (level, filter) => {
        const snap = { ...state.an }; Object.assign(state.an, trendBase, { level, filter: filter || {}, periodCount: 14 });
        try { await ensureTrendAnalysis(); const an = state.an; return an.priorities && an.priorities.status === 'available' ? { priorities: an.priorities, rows: an.rows, context: an.context } : null; }
        catch (e) { return null; } finally { Object.assign(state.an, snap); }
      };
      try {
        const cat = await trendAt('category');
        const top = cat && (cat.priorities.drag || []).find((x) => Number.isFinite(x.impact) && x.impact < 0);
        if (top) {
          const sub = await trendAt('subcategory', { category: top.entity });
          let delivery = null;
          try {
            const cmp = cat.context && cat.context.comparison, chan = cat.context && cat.context.channel;
            if (cmp && cmp.available && cmp.current && cmp.baseline) {
              const q = (r) => FP.productStore.aggregate({ from: r.from, to: r.to, channel: chan, groupBy: 'delivery', filter: { category: top.entity } });
              const [cm, bm] = await Promise.all([q(cmp.current), q(cmp.baseline)]);
              const rows = []; new Set([...cm.keys(), ...bm.keys()]).forEach((k) => { const cv = (FP.productStore.finalize(cm.get(k), null) || {}).revenue, bv = (FP.productStore.finalize(bm.get(k), null) || {}).revenue; const c = cv && Number.isFinite(cv.value) ? cv.value : 0, b = bv && Number.isFinite(bv.value) ? bv.value : 0; rows.push({ name: k, delta: c - b }); });
              delivery = rows.sort((a, b) => a.delta - b.delta);
            }
          } catch (e) { delivery = null; }
          focusData = { category: cat, subcategory: sub, delivery };
        }
      } catch (e) { focusData = null; /* sin foco: el resumen usa la lectura de siempre */ }
    }
    // Con filtro: no hay plan por producto ni sucursal, así que el pacing se lee como la venta de la selección contra su periodo de referencia.
    let selPacing = null;
    if (rpF && hasProducts && diag) {
      try {
        const x = FP.productAnalysis.fromDiagnosis(diag), m = FP.productStore.meta || {};
        if (x && x.from) {
          let from = x.from, to = x.to; if (m.dateMax && to > m.dateMax && from <= m.dateMax) to = m.dateMax;
          const base = FP.productAnalysis.baselinePeriod({ from, to, periodType: x.periodType }, x.comparison);
          const rev = (acc) => { const f = acc ? FP.productStore.finalize(acc, null) : null; return f && f.revenue && Number.isFinite(f.revenue.value) ? f.revenue.value : null; };
          const agg = (r, g) => FP.productStore.aggregate({ from: r.from, to: r.to, channel: ch, groupBy: g, filter: rpF });
          const [cc, bc, cd, bd] = await Promise.all([agg({ from, to }, 'channel'), agg(base, 'channel'), agg({ from, to }, 'date'), agg(base, 'date')]);
          const keys = [...new Set([...cc.keys(), ...bc.keys()])].filter((k) => k && k !== '(sin dato)');
          const daily = (mp) => [...mp.entries()].map(([d, acc]) => [d, rev(acc)]).filter(([, v]) => v !== null).sort((u, v) => (u[0] < v[0] ? -1 : 1));
          // segunda lectura: contra el mismo periodo del año anterior (separa temporada de deterioro), solo si hay historia y no es ya la referencia
          let yoy = null;
          if (x.comparison !== 'yoy') {
            try { const yb = FP.productAnalysis.baselinePeriod({ from, to, periodType: x.periodType }, 'yoy'); if (m.dateMin && yb.from >= m.dateMin) { const t = await agg(yb, 'total'); let tot = 0, any = false; t.forEach((acc) => { const v = rev(acc); if (v !== null) { tot += v; any = true; } }); if (any && tot > 0) yoy = { prev: tot, from: yb.from, to: yb.to }; } } catch (e) { yoy = null; }
          }
          selPacing = { yoy, from, to, base: { from: base.from, to: base.to, label: base.label }, comparison: x.comparison, channels: keys.map((k) => ({ key: k, cur: rev(cc.get(k)), prev: rev(bc.get(k)) })), curDaily: daily(cd), prevDaily: daily(bd) };
        }
      } catch (e) { selPacing = null; /* sin esta lectura el pacing queda del total */ }
    }
    let customers = null;
    try {
      const o = { ...FP.customersView.optsOf(state), channel: ch === 'total' ? null : ch };
      if (rpF) o.filter = rpF;
      const res = await FP.customerStore.analyze(o);
      customers = { result: res, scopeLabel: o.filter ? `Selección: ${FP.productFilter.describe(o.filter)}${ch === 'total' ? '' : ` · Canal ${FP.analysisContext.channelLabel(ch)}`}` : (ch === 'total' ? 'Toda la empresa' : `Canal ${FP.analysisContext.channelLabel(ch)}`) };
    } catch (e) { /* sin libro de clientes la página se omite */ }
    let profiles = null; try { profiles = ensureProfiles(); } catch (e) { /* sin historia */ }
    let projection = null; try { projection = FP.projection.build(state.store, { baseYear: state.year, growth: state.proj.growth, shares: state.proj.shares, forecastRun: run }); } catch (e) { /* sin proyección */ }
    const an = state.an, pa = state.pa;
    const desc = (f) => (FP.productFilter && f ? FP.productFilter.describe(FP.productFilter.active(f)) : '');
    const rpLabel = (() => { if (!rpF) return ''; let f = rpF; try { if (f.branch) { const b = (FP.productStore.geoOptions({}).branches || []).find((x) => x.code === f.branch); if (b && b.name) f = { ...f, branch: b.name }; } } catch (e) { /* se deja el código */ } return FP.productFilter.describe(f); })();
    const filters = [{ page: 'Evolución', label: rpF ? rpLabel : desc(an.filter) }, { page: 'Productos', label: rpF ? rpLabel : (pa.result && pa.result.filter ? desc(pa.result.filter) : '') }, { page: 'Clientes', label: rpF ? rpLabel : (customers && customers.result && customers.result.filtered ? desc(state.cu.opts.filter) : '') }].filter((f) => f.label);
    const rcA = state.rc.analysis, store = state.rc.scenarioStore;
    const linked = rcA && store ? store.scenarios.filter((s) => (rcA.allScenarios || rcA.scenarios || []).some((x) => x.scenarioId === s.scenarioId)) : [];   // «Total digital»: escenarios de todos los canales (mismo periodo), cada uno con su canal
    const recovery = { actions: state.rc.plan && state.rc.plan.actions ? state.rc.plan.actions : [], scenarios: linked.map((s) => ({ name: s.name, type: s.type, channel: s.context ? s.context.channel : null, impact: s.expectedImpact ? s.expectedImpact.incrementalValue : null })) };
    return FP.reportBuilder.build({
      app: { name: C.app.name, version: C.app.version }, generatedAt: new Date().toISOString(), channel: ch, run, rf, rfMonth, diag, trafficDiag, trafficWeekly, selPacing, selection: monthOn ? { periodType: dxs.periodType, periodKey: monthSel } : null,
      focusData, trend: trendSnap || { priorities: an.priorities, rows: an.rows, context: an.context, share: an.share }, trendFilterLabel: rpF ? rpLabel : desc(an.filter), reportFilter: rpLabel, branchNames: (() => { const o = {}; try { (FP.productStore.geoOptions({}).branches || []).forEach((b) => { if (b.name && b.name !== b.code) o[b.code] = b.name; }); } catch (e) { /* sin nombres */ } return o; })(),
      product: monthOn && productByLevel ? productByLevel.category : pa.result, productByLevel, productFilterLabel: rpF ? rpLabel : (pa.result && pa.result.filter ? desc(pa.result.filter) : ''), customers, projection, profiles,
      backtest: run && state.fc.backtest && state.fc.backtest.stamp === run.generatedAt ? state.fc.backtest.data : null,
      quality: FP.coverage.summarize(state.store), lastActual: lastActualDate(), filters, recovery,
      options: { showTags: state.rp.options.showTags, showBusinessName: state.rp.options.showBusinessName },
      businessName: state.rp.options.showBusinessName && C.business ? C.business.name : null
    });
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
    ['mode', 'visited', 'lastByGroup', 'tour', 'home', 'ctx', 'learned', 'tourOffered'].forEach((k) => { if (d[k] !== undefined) u[k] = typeof d[k] === 'object' && !Array.isArray(d[k]) ? { ...u[k], ...d[k] } : d[k]; });
    u.tour.active = Boolean(d.tour && d.tour.active);
    if (!FP.tour.PATHS[u.tour.path]) u.tour.path = null;
    u.tour.compact = false;
    FP.tour.setPath(u.tour.path);
    // el modo Ejecutivo ya no existe: quien lo tenía guardado pasa a Analista
    if (!FP.guidanceConfig.MODES.some(([id]) => id === u.mode)) u.mode = 'analyst';
  }
  function saveUx() {
    const u = state.ux;
    storage.save(K.uxSettings, { mode: u.mode, visited: u.visited, lastByGroup: u.lastByGroup, tour: u.tour, home: u.home, ctx: u.ctx, learned: u.learned, tourOffered: u.tourOffered });
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

  /** No dibuja dos veces a la vez: al quitar del DOM un campo con cambios sin confirmar, el navegador dispara un «change» en pleno dibujo; ese dibujo se pospone hasta que termine el actual. */
  // Borradores: lo escrito en campos marcados con data-draft (formularios sin estado propio) sobrevive a cualquier re-dibujo.
  const drafts = {};
  function restoreDrafts() {
    document.querySelectorAll('[data-draft]').forEach((el) => {
      if (!el.id || !(el.id in drafts)) return;
      if (el.value !== drafts[el.id]) el.value = drafts[el.id];
      const d = el.closest('details'); if (d && drafts[el.id] !== '') d.open = true;
    });
  }
  function clearDrafts(prefix) { Object.keys(drafts).forEach((k) => { if (k.startsWith(prefix)) delete drafts[k]; }); }
  let rendering = false, renderAgain = false;
  function render() {
    if (rendering) { renderAgain = true; return; }   // se vuelve a dibujar al terminar, no en medio del dibujo
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
    if (FP.bgTask) FP.bgTask.sync();
    if (renderAgain) { renderAgain = false; render(); }
  }

  /** Inicio sigue a la fecha del encabezado (mes de esa fecha; si el último día con real es de un mes anterior, ese mes, igual que Diagnóstico) mientras no se fije el periodo a mano. */
  function syncHomeToDate() {
    const h = state.ux.home;
    if (!h || h.follow === false) return;
    const ref = (state.fc.settings && state.fc.settings.referenceDate) || Cal.toISODate(new Date());
    const run = state.fc.run;
    const m = ref.startsWith(`${state.year}-`) ? defaultMonth(ref) : (run && run.cutoff && run.cutoff.startsWith(`${state.year}-`) ? run.cutoff.slice(0, 7) : null);
    if (m) { h.periodType = 'month'; h.periodKey = m; } else { h.periodType = 'year'; h.periodKey = String(state.year); }
  }

  function renderNow() {
    syncHomeToDate();
    const u = state.ux;
    u.visited[state.view] = true;
    const g = FP.navigation.groupOf(state.view);
    if (g) u.lastByGroup[g] = state.view;
    FP.navigation.renderNav(state);
    renderView();
    restoreDrafts();
    announceView();
    learnFromView();
    // El contexto persistente (canal/periodo) se sincroniza con lo que la vista tiene elegido en este momento,
    // no solo al cambiar de página; así el resumen y la barra de contexto siguen al selector de canal.
    state.ux.ctx = FP.navigation.extractContext(state.view, state);
    // Accesibilidad de tablas: encabezados con alcance (solo atributos; no cambia el contenido)
    document.querySelectorAll('table thead th:not([scope])').forEach((th) => th.setAttribute('scope', 'col'));
    document.querySelectorAll('table tbody th:not([scope])').forEach((th) => th.setAttribute('scope', 'row'));
    let status = FP.contextEngine.collectStatus(state);
    if (state.view === 'inicio' && FP.homeView && FP.homeView.periodStatus) { try { status = FP.homeView.periodStatus(state, status); } catch (e) { /* si falla, se queda el estado anual */ } }
    FP.navigation.renderContextBar(state, status);
    if (FP.attentionView) FP.attentionView.renderOrigin(state, status);
    if (FP.navigation && FP.navigation.markRoute) FP.navigation.markRoute(state);
    const exp = document.getElementById(`ux-exp-${state.view}`);
    if (exp) exp.innerHTML = FP.help.explainer(state.view, u.mode);
    if (FP.whyHub) FP.whyHub.render(state.view);
    if (state.view === 'diagnostico') { FP.diagnosticGuide.render(state); FP.diagnosticView.syncMore(); }
    const main = document.getElementById(`view-${state.view}`);
    FP.help.decorate(main);
    FP.help.enhanceEmpty(main, FP.contextEngine.requirements(state.view, status));
    FP.navigation.applyMode(state);
    if (tourSyncDepth < 20) {
      const adv = FP.tour.syncTarget(state, status);
      if (adv && adv.idx !== undefined) { tourSyncDepth++; try { tourGo(adv.idx, adv.flash); } finally { tourSyncDepth--; } return; }
      if (adv && adv.stay) {   // cambió el micro-paso dentro del mismo paso: la tarjeta reaparece con el aviso
        const t = state.ux.tour; t.lastMicro = adv.record.key; t.lastMicroTitle = adv.record.title;
        if (adv.flash) t.flash = adv.flash;
        const nm = FP.tour.currentMicro(state);
        if (t.compact && t.went && nm && nm.manual) { /* tarjeta compacta: sigue abierta en el siguiente micro-paso de revisión */ }
        else { t.compact = false; if (t.went && adv.flash) { t.went = false; t.collapsed = false; } }
      }
    }
    FP.tour.render(state);
    saveUx();
    maybeOfferTourFirstTime(status);
  }

  function renderView() {
    FP.ui.renderStatus(state);
    VIEWS.forEach((v) => { document.getElementById(`view-${v}`).hidden = v !== state.view; });
    FP.startupAssumptionsView.sync(state);
    if (state.view === 'resumen') {
      FP.ui.renderFacts(state);
      FP.ui.renderTargets(state);
      FP.startupAssumptionsView.mountInGoals(state);
      FP.ui.renderFilters(state);
      FP.ui.renderValidation(state);
      FP.ui.renderEngine(state);
      FP.ui.renderExport(state);
      // sin datos, «Herramientas» (donde está «Generar datos de prueba») se abre una vez, para que la persona lo encuentre
      const tools = document.querySelector('#view-resumen details[data-rs-more="tools"]');
      if (tools && !tools.dataset.auto && (!state.dataset || !Object.keys(state.dataset.records).length)) { tools.open = true; tools.dataset.auto = '1'; }
    } else if (state.view === 'carga') FP.importView.render(state);
    else if (state.view === 'calidad') FP.qualityView.render(state);
    else if (state.view === 'datos') {
      FP.dataView.render(state);
      // la vista previa del paquete arma los 7 exports: se recalcula solo si cambió lo que la afecta (no en cada cambio de página de la tabla)
      const pk = JSON.stringify([state.year, state.fc.run && state.fc.run.generatedAt, state.dx.settings, state.pa.result ? 1 : 0, state.store.actual.records.length, state.planning.current ? 1 : 0, state.rc.plan && state.rc.plan.actions ? state.rc.plan.actions.length : 0]);
      if (state.pkg.previewKey !== pk || !state.pkg.preview) { state.pkg.preview = previewPackage(); state.pkg.previewKey = pk; }
      FP.packageView.render(state, state.pkg.preview);
      if (state.datosSection) { const el = document.getElementById('t-pkg'); state.datosSection = null; if (el) { try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* sin scroll */ } } }   // llegada desde #paquete
    }
    else if (state.view === 'estacionalidad') { ensureProfiles(); FP.seasonalityView.render(state); }
    else if (state.view === 'plan') { resolveCurrentPlan(); FP.planningView.render(state); }
    else if (state.view === 'configuracion') FP.planningConfigView.render(state);
    else if (state.view === 'pacing') { ensureForecast(); FP.pacingView.render(state); FP.forecastView.render(state); }
    else if (state.view === 'reforecast') { ensureReforecast(); FP.reforecastView.render(state); }
    else if (state.view === 'diagnostico') { const d = ensureDiagnostic(); FP.diagnosticView.render(state); ensureDiagnosticProducts(d); }
    else if (state.view === 'recovery') {
      ensureRecovery();
      if (!state.rc.ctx) {
        ['rc-gap', 'rc-chain', 'rc-simulator', 'rc-inverse', 'rc-saved', 'rc-library', 'rc-plan', 'rc-tracking', 'rc-tree', 'rc-extra'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
        document.getElementById('rc-context').innerHTML = '<div class="empty"><strong>Todavía no hay contexto de recuperación</strong>Se necesita un plan del año y venta real, o importar un analysis_export.json o reforecast_export.json.</div>';
        FP.recoveryCenter.syncMore();
      } else FP.recoveryCenter.render(state);
    }
    else if (state.view === 'inicio') { ensureForecast(); ensureReforecast(); FP.homeView.render(state, FP.contextEngine.collectStatus(state)); }
    else if (state.view === 'clientes') FP.customersView.render(state);
    else if (state.view === 'cambios') { ensureForecast(); FP.changesView.render(state); }
    else if (state.view === 'medir') FP.measureView.render(state);
    else if (state.view === 'narrativa') { ensureNarrative(); FP.narrativeView.render(state); }
    else if (state.view === 'presentacion') { ensureForecast(); FP.reportView.render(state); }
    else if (state.view === 'segmentos') { ensureDiagnostic(); FP.segmentsView.render(state); }
    else if (state.view === 'analisis') { FP.trendView.render(state); ensureTrendAnalysis(); }
    else if (state.view === 'proyeccion') FP.projectionView.render(state);
    else if (state.view === 'ayuda') FP.helpView.render(state);
    else if (state.view === 'ajustes') {
      if (state.ajustesSection) { const tb = FP.settingsView.TABS.find((t) => t.sections.includes('st-' + state.ajustesSection)); if (tb) state.stTab = tb.id; }   // un enlace a una sección abre su pestaña
      FP.settingsView.render(state); FP.ui.renderStatus(state); FP.businessView.render(state); FP.brandView.render(state); ensureStorageEstimate();   // la ficha de estado se repinta porque settings-view reescribe su contenedor
      if (state.ajustesSection) {   // llegada desde un enlace a una sección (p. ej. #negocio)
        const el = document.getElementById('st-' + state.ajustesSection); state.ajustesSection = null;
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
    item.token = token; item.status = 'processing'; item.progress = 0; item.t0 = Date.now();
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
    item.status = 'saving'; item.progress = 0; item.t0 = Date.now(); render();
    let replaced = null;
    try {
      const oldId = item.replace && item.replace.batchId;
      if (oldId) {   // reemplazo: primero se quita lo del archivo anterior (en productos no hay «deshacer»)
        const ob = (state.productQuality || []).find((b) => b.id === oldId);
        replaced = await FP.productStore.removeBatch(oldId);
        if (ob) replaced.fileName = ob.fileName;
      }
      const batch = await FP.productStore.commit(item.result.draft, { fileName: item.staged.fileName, policy: item.policy,
        onProgress: (d, t) => { item.progress = d / t; progressRender(); } });
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      state.pa.result = null; state.pa.counts = null; state.pa.from = null; state.pa.to = null; state.cu.status = 'idle';
      await refreshProductQuality();
      render();
      const m = batch.storedMerge;
      FP.ui.toast(`${replaced ? `Reemplacé ${replaced.fileName || 'el archivo anterior'} por ${batch.fileName}. ` : ''}Productos guardados: ${batch.summary.accepted.toLocaleString('es-MX')} SKU-días de ${batch.fileName}${m.conflicts ? `; ${m.conflicts} conflictos con lo guardado (${batch.policy === 'replace' ? 'reemplazados' : 'se conservó lo guardado y se marcaron'})` : ''}.`);
    } catch (e) {
      item.status = 'ready'; render();
      FP.ui.toast(`No se pudieron guardar los productos (${e.message}). ${replaced ? `OJO: el archivo anterior (${replaced.fileName || 'reemplazado'}) ya se había quitado; vuelve a cargarlo desde tu copia. ` : ''}Los demás datos no se modificaron; revisa el espacio disponible del navegador y vuelve a intentar, o exporta tus datos como respaldo.`);
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
    const key = JSON.stringify([pa.from, pa.to, pa.periodType, pa.comparison, pa.channel, filter, level]);
    if (pa.result && pa.key === key) return;
    pa.key = key; pa.loading = true;
    const probe = { ...pa, drill: [...pa.drill, { level, key: '_' }], next: null };
    const res = await FP.productAnalysis.run({ from: pa.from, to: pa.to, periodType: pa.periodType, comparison: pa.comparison, channel: pa.channel, level, filter, next: level === 'sku' ? null : paLevel(probe) });
    if (pa.key !== key) return;
    pa.result = res; pa.loading = false; pa.page = 1;
    if (state.view === 'producto') FP.productView.render(state);
  }

  /** Filtro de página de Evolución y patrones (categoría, producto, sucursal…): se suma a TODA lectura de productos. */
  const pageFilter = () => (FP.productFilter ? FP.productFilter.active(state.an && state.an.filter) : {});
  const aggF = (args) => FP.productStore.aggregate({ ...args, filter: { ...pageFilter(), ...(args.filter || {}) } });
  /** Cambia una parte del contexto de Análisis y descarta TODO resultado derivado (sin contexto viejo en pantalla). */
  function resetAnalysis(patch) {
    Object.assign(state.an, patch || {}, { page: 1, forecastPage: 1, rows: [], advanced: [], groups: [], selected: null, key: null, error: null, priorities: null, risks: null, forecast: null,
      temporal: null, share: null, contribution: null, pvm: null, bridge: null, cohort: null, narrative: null, drill: null, context: null, comparisonInfo: null, reconciliation: null, partialComparison: null,
      ai: { status: null, result: null, errors: [] }, assistant: { open: false, question: '', status: 'idle', result: null, errors: [], history: [] } });
  }

  /** Análisis: primera pista de evidencia para las prioridades (sucursal / estado / canal), en el MISMO canal y períodos comparables del contexto. */
  async function enrichPriorityEvidence(an, ctx) {
    if (!an.priorities || an.priorities.status !== 'available' || !FP.productStore) return;
    const metric = ctx && ctx.metric || 'revenue';
    const cmp = ctx && ctx.comparison;
    if (!cmp || !cmp.available || !cmp.current || !cmp.baseline) return;
    const filterKey = { category:'category', subcategory:'subcategory', product:'product', sku:'sku', region:'region', state:'state', city:'city', branch:'branch', delivery:'delivery' }[an.level];
    if (!filterKey && an.level !== 'channel') return;
    const targets = [...an.priorities.drag, ...an.priorities.compensate].slice(0, 12);
    const dims = ['branch', 'state'].concat(ctx.channel === 'total' && an.level !== 'channel' ? ['channel'] : []);
    for (const item of targets) {
      const filter = filterKey ? { [filterKey]: item.entity } : {};
      const chan = an.level === 'channel' ? item.entity : ctx.channel;
      const pieces = [];
      for (const dim of dims) {
        if (dim === an.level) continue;
        try {
          const [cm, bm] = await Promise.all([
            aggF({ from: cmp.current.from, to: cmp.current.to, channel: chan, groupBy: dim, filter }),
            aggF({ from: cmp.baseline.from, to: cmp.baseline.to, channel: chan, groupBy: dim, filter })
          ]);
          const rows = []; const keys = new Set([...cm.keys(), ...bm.keys()]);
          keys.forEach(k => {
            const cf = FP.productStore.finalize(cm.get(k), null), bf = FP.productStore.finalize(bm.get(k), null);
            const cv = cf?.[metric]?.value, bv = bf?.[metric]?.value;
            if (Number.isFinite(cv) || Number.isFinite(bv)) rows.push({ name: k, delta: (Number.isFinite(cv) ? cv : 0) - (Number.isFinite(bv) ? bv : 0), current: Number.isFinite(cv) ? cv : 0, baseline: Number.isFinite(bv) ? bv : 0 });
          });
          rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
          if (rows.length) pieces.push({ dimension: dim, rows: rows.slice(0, 3) });
        } catch (e) { /* una dimensión sin datos no bloquea la evidencia de las demás */ }
      }
      item.evidenceBreakdown = pieces;
      const lead = pieces.flatMap(x => x.rows.map(r => ({ ...r, dimension: x.dimension }))).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);
      item.evidenceSummary = lead.length ? lead.map(x => `${x.dimension === 'branch' ? 'Sucursal' : x.dimension === 'state' ? 'Estado' : 'Canal'}: ${x.name} (${x.delta >= 0 ? '+' : ''}${Math.round(x.delta).toLocaleString('es-MX')})`).join(' · ') : null;
    }
  }

  /** Suma finita de un Map(entidad → agregado del store) en la métrica pedida → { values, parts, total, size }.
   *  `parts` guarda venta/unidades/pedidos por entidad (insumo de la descomposición PVM). */
  function sumMap(map, metric = 'revenue') {
    const values = new Map(), parts = new Map(); let total = 0;
    map.forEach((acc, entity) => {
      const fin = FP.productStore.finalize(acc, null);
      const num = (k) => (fin && fin[k] && typeof fin[k].value === 'number' && Number.isFinite(fin[k].value) ? fin[k].value : null);
      const v = num(metric);
      values.set(entity, v); if (v !== null) total += v;
      parts.set(entity, { r: num('revenue'), u: num('units'), o: num('orders') });
    });
    return { values, parts, total, size: map.size };
  }

  /** Meta (plan) de Venta del rango y canal seleccionados, desde el modelo canónico cargado (`plan` por fecha × canal), con Real por canal del archivo de productos. */
  async function planForRange(range, ch) {
    const DM = FP.dataModel, ds = state.dataset;
    const none = (message) => ({ total: null, message });
    if (!ds || !DM || !range) return none('No hay metas cargadas. Carga el archivo de Plan/Meta (fecha, canal, meta de venta) en Datos.');
    const chans = ch === 'total' ? FP.analysisContext.channelIds() : [ch];
    const by = {}; chans.forEach((c) => { by[c] = { plan: 0, actual: null, days: 0 }; });
    let any = false, covered = 0, recActual = 0, recActualN = 0;
    DM.allRecords(ds).forEach((r) => {
      if (r.date < range.from || r.date > range.to || !by[r.channel]) return;
      const pv = r.plan && r.plan.revenue;
      if (typeof pv === 'number' && Number.isFinite(pv)) { by[r.channel].plan += pv; by[r.channel].days++; covered++; any = true; }
      const av = r.actual && r.actual.revenue;
      if (typeof av === 'number' && Number.isFinite(av)) { recActual += av; recActualN++; }
    });
    const expectedDays = (FP.temporalEngine.spanDays(range) + 1) * chans.length;
    if (!any) return none(`No hay meta de venta cargada para ${range.label || FP.analysisContext.rangeLabel(range.from, range.to)} en ${FP.analysisContext.channelLabel(ch)}${String(range.from).slice(0, 4) !== String(state.year) ? ` (el plan cargado corresponde a ${state.year})` : ''}.`);
    const chMap = await FP.productStore.aggregate({ from: range.from, to: range.to, channel: ch, groupBy: 'channel' });
    chMap.forEach((acc, c) => { if (by[c]) { const f = FP.productStore.finalize(acc, null); if (Number.isFinite(f?.revenue?.value)) by[c].actual = f.revenue.value; } });
    chans.forEach((c) => { if (by[c].actual === null) by[c].actual = 0; });
    const total = chans.reduce((s, c) => s + by[c].plan, 0), prodActual = chans.reduce((s, c) => s + by[c].actual, 0);
    let note = null;
    if (recActualN && recActual > 0 && Math.abs(prodActual / recActual - 1) > 0.01) note = `El archivo de productos suma ${Math.round(prodActual).toLocaleString('es-MX')} y «Venta real» (archivo diario) suma ${Math.round(recActual).toLocaleString('es-MX')} en el mismo período: difieren ${((prodActual / recActual - 1) * 100).toFixed(1)} %. El puente usa la venta del archivo de productos para que concilie con las entidades.`;
    return { total, byChannel: Object.fromEntries(chans.map((c) => [c, { plan: by[c].plan, actual: by[c].actual }])), coverage: expectedDays > 0 ? covered / expectedDays : 0, note };
  }

  /**
   * Análisis · cálculo único. Todo lo que muestra el módulo (Evolución, Patrones, Share & Mix, Contribución,
   * Prioridades, Forecast, Cohortes, Narrativa) nace del MISMO contexto `FP.analysisContext.build(...)`:
   * canal seleccionado + período focal + período de comparación equivalente.
   */
  /* Barra de avance y tiempo de la carga de Evolución: así una espera larga no parece un error. */
  let anTick = null;
  function anLoaderEl() { return document.getElementById('an-loader'); }
  function paintAnLoader(an) {
    const el = anLoaderEl(); if (!el || !an.progress) return;
    const p = an.progress;
    FP.ui.loader.update(el, { label: p.label || 'Preparando', pct: Math.min(99, Math.round(p.frac * 100)), t0: p.startedAt });
  }
  function startAnLoader(an, n) {
    an.progress = { frac: 0, label: 'Leyendo datos de este navegador', startedAt: Date.now(), n };
    if (anTick) clearInterval(anTick);
    anTick = setInterval(() => { if (!an.loading) { stopAnLoader(an); return; } paintAnLoader(an); }, 250);
  }
  function anProgress(an, frac, label) { if (an.progress) { an.progress.frac = Math.max(an.progress.frac, frac); an.progress.label = label; } }
  function stopAnLoader(an) { if (anTick) { clearInterval(anTick); anTick = null; } an.progress = null; }
  async function ensureTrendAnalysis() {
    const an = state.an;
    if (!FP.productStore || !FP.productStore.available()) return;
    const m = FP.productStore.meta || {};
    if (!m.dateMin || !m.dateMax) return;
    const AC = FP.analysisContext, TE = FP.temporalEngine;
    an.channel = AC.normChannel(an.channel);
    an.metric = AC.normMetric(an.metric);
    const ch = an.channel, metric = an.metric;
    const periodType = ['year', 'month', 'week', 'day'].includes(an.periodType) ? an.periodType : 'month';
    const count = Math.max(3, Math.min(periodType === 'day' ? 90 : 24, Number(an.periodCount || an.months) || 12));
    const ctx = AC.build({ periodType, focusKey: an.focusKey, comparison: an.comparison, channel: ch, level: an.level, metric: an.metric, minDate: m.dateMin, maxDate: m.dateMax });
    if (!ctx.focus) return;
    if (an.focusKey && an.focusKey !== ctx.focus.key) an.focusKey = null;
    const focusFrom = TE.rangeForKey(ctx.focus.key, periodType).from;
    const periods = [];
    for (let i = count - 1; i >= 0; i--) {
      const from = TE.add(focusFrom, periodType, -i), key = TE.periodKey(from, periodType);
      let range = TE.rangeForKey(key, periodType);
      const isFocus = i === 0;
      if (isFocus) range = { ...range, to: ctx.focus.to };            // el foco se acota al último día con datos
      if (range.to < m.dateMin) continue;
      periods.push({ key, from: range.from, to: range.to, partial: isFocus && ctx.focus.partial });
    }
    const focus = periods.at(-1);
    const closed = periods.filter(p => !p.partial);                      // los patrones se leen sobre períodos CERRADOS
    const firstPeriod = periods[0]?.key || '';
    const key = JSON.stringify([ch, metric, an.level, JSON.stringify(pageFilter()), periodType, count, firstPeriod, ctx.focus.key, an.comparison, ctx.focus.to, m.dateMin, m.dateMax]);
    if (an.rows.length && an.key === key && !an.loading) return;
    an.loading = true; an.error = null; an.key = key;
    const runId = an._run = (an._run || 0) + 1, STALE = { stale: true }, chk = () => { if (an._run !== runId) throw STALE; };
    startAnLoader(an, periods.length);
    if (state.view === 'analisis') FP.trendView.render(state);   // muestra la barra de carga de inmediato (antes quedaba la tabla vacía hasta terminar)
    ctx.filter = pageFilter(); an.context = ctx;
    const aggTotal = async (range) => {
      if (!range || range.to < range.from) return null;
      const map = await aggF({ from: range.from, to: range.to, channel: ch, groupBy: 'total' });
      let total = 0, any = false;
      map.forEach(acc => { const fin = FP.productStore.finalize(acc, null); if (Number.isFinite(fin?.[metric]?.value)) { total += fin[metric].value; any = true; } });
      return any ? total : null;
    };
    try {
      /* ---- 1. Serie por período y entidad (canal seleccionado) ---- */
      const monthlyMaps = [];
      const entities = new Set();
      for (const period of periods) {
        const map = await aggF({ from: period.from, to: period.to, channel: ch, groupBy: an.level }); chk();
        const s = sumMap(map, metric);
        s.values.forEach((_, e) => entities.add(e));
        monthlyMaps.push({ period: period.key, partial: period.partial, values: s.values, parts: s.parts, total: s.total, size: s.size });
        anProgress(an, 0.7 * monthlyMaps.length / periods.length, `Leyendo ${period.key}`);
        await new Promise((r) => setTimeout(r, 0)); chk();
      }
      anProgress(an, 0.72, 'Calculando patrones');
      const closedMaps = monthlyMaps.filter(x => !x.partial);
      // Referencia de temporada (solo mensual): el mismo mes del año anterior al último cerrado, si queda fuera de la ventana cargada. No entra a patrones ni tendencias.
      let seasonRef = { total: {}, byEntity: new Map() };
      if (periodType === 'month' && closedMaps.length) {
        const lastK = closedMaps[closedMaps.length - 1].period, lyK = `${+lastK.slice(0, 4) - 1}${lastK.slice(4)}`;
        if (!monthlyMaps.some((x) => x.period === lyK)) {
          try {
            const rg = FP.temporalEngine.rangeForKey(lyK, 'month');
            if (rg && rg.from >= (m.dateMin || '0000') ) {
              const map = await aggF({ from: rg.from, to: rg.to, channel: ch, groupBy: an.level }); chk();
              const s2 = sumMap(map, metric);
              seasonRef = { total: { [lyK]: s2.total }, byEntity: new Map([...s2.values].map(([e, v]) => [e, { [lyK]: v }])) };
            }
          } catch (e) { /* sin mes de referencia: la temporada queda no disponible */ }
        }
      }
      const totalSeries = closedMaps.map(x => ({ period: x.period, value: x.total }));
      const series = new Map();
      entities.forEach((entity) => {
        const full = closedMaps.map(({ period, values }) => ({ period, value: values.has(entity) ? values.get(entity) : null }));
        if (full.some(x => x.value !== null)) series.set(entity, full);   // entidades solo del período en curso no tienen historia cerrada
      });
      const cohortSeries = series;
      const results = FP.trendEngine.analyzeMany(series, { metric });
      results.forEach((r) => { r.series = series.get(r.entity) || []; });
      an.rows = results.filter((r) => r.periodsAnalyzed >= FP.trendEngine.DEFAULTS.minPeriods);

      /* ---- 2. Comparación equivalente (misma lógica para TODOS los módulos) ---- */
      const cc = ctx.comparison;
      const focusMap = monthlyMaps.at(-1);
      let baseSum = null;
      if (cc.available && cc.baseline) baseSum = sumMap(await aggF({ from: cc.baseline.from, to: cc.baseline.to, channel: ch, groupBy: an.level }), metric); chk();
      const comparable = Boolean(baseSum && baseSum.size > 0 && baseSum.total > 0 && focusMap && focusMap.size > 0);
      const cmpMessage = !cc.available ? cc.note
        : comparable ? null
        : `No hay ventas en ${ch === 'total' ? 'la fuente' : AC.channelLabel(ch)} para ${!baseSum || baseSum.size === 0 || baseSum.total <= 0 ? cc.baseline.label : cc.current.label}. La comparación no se calcula (N/A); Evolución y Patrones siguen usando el histórico disponible.`;
      an.comparisonInfo = { ...cc, comparable, message: cmpMessage };
      an.rows.forEach((r) => {
        if (comparable) {
          const cv = focusMap.values.get(r.entity), bv = baseSum.values.get(r.entity);
          r.currentValue = Number.isFinite(cv) ? cv : 0;
          r.previousValue = Number.isFinite(bv) ? bv : 0;
          r.absentCurrent = !Number.isFinite(cv) && Number.isFinite(bv);
          r.impact = r.currentValue - r.previousValue;
          r.deltaPct = AC.pctChange(r.currentValue, r.previousValue);          // null → «N/A», nunca 0 % ni −100 % por falta de dato
          r.recentAbsoluteChange = r.impact; r.percentageChange = r.deltaPct;
          r.previousPeriod = cc.baseline.label; r.comparisonLabel = cc.text;
        } else {
          r.currentValue = Number.isFinite(focusMap?.values.get(r.entity)) ? focusMap.values.get(r.entity) : null;
          r.previousValue = null; r.impact = null; r.deltaPct = null; r.recentAbsoluteChange = null; r.percentageChange = null; r.comparisonLabel = null;
        }
      });
      an.partialComparison = focus.partial && comparable ? { current: { key: focus.key, from: focus.from, to: focus.to }, previous: { key: cc.baseline.key, from: cc.baseline.from, to: cc.baseline.to }, id: cc.id, label: cc.idLabel, text: cc.text } : null;

      /* ---- 3. Capa temporal: todas las comparaciones válidas del foco, en el mismo canal ---- */
      const focusRange = { from: focus.from, to: focus.to, partial: focus.partial, key: focus.key };
      const currentTotal = await aggTotal(focusRange); chk();
      const comparisons = [];
      for (const c of TE.comparisonRanges(focusRange, periodType, m.dateMax)) {
        const value = await aggTotal(c.range); chk();
        comparisons.push({ id: c.id, label: c.label, range: c.range, text: c.range ? (() => { const wy = c.range.from.slice(0, 4) !== focusRange.from.slice(0, 4); return `${AC.rangeLabel(focusRange.from, focusRange.to, wy)} vs ${AC.rangeLabel(c.range.from, c.range.to, wy)}`; })() : null,
          value, change: AC.pctChange(currentTotal, value), available: Number.isFinite(value) && value > 0 && Number.isFinite(currentTotal) });
      }
      const pick = (id) => comparisons.find(x => x.id === id) || null;
      let seasonality = null;
      if (periodType === 'month' && !focus.partial) {
        const monthNo = Number(String(focus.key).slice(5, 7));
        const sameMonth = closed.filter(x => Number(String(x.key).slice(5, 7)) === monthNo && x.key !== focus.key);
        const vals = [];
        for (const p0 of sameMonth) { const v = await aggTotal(p0); chk(); if (Number.isFinite(v)) vals.push(v); }
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        seasonality = { bucket: `Mes ${monthNo}`, comparablePeriods: vals.length, historicalAverage: avg, index: Number.isFinite(avg) && avg !== 0 && Number.isFinite(currentTotal) ? currentTotal / avg : null, status: vals.length >= 1 ? 'available' : 'insufficient_history' };
      }
      an.temporal = { focus: { type: periodType, key: focus.key, from: focus.from, to: focus.to, partial: Boolean(focus.partial), label: ctx.focus.label }, currentTotal, comparisons, yoy: pick('yoy'), mom: pick('mom'), wow: pick('wow'), dod: pick('dod'), seasonality };

      /* ---- 4. Cohortes y patrones (sobre períodos cerrados) ---- */
      an.cohort = FP.cohortEngine ? FP.cohortEngine.analyze(cohortSeries, closed.map(x => x.key), { level: an.level, minActivity: 0 }) : null;
      an.rows.sort((a, b) => Math.abs(b.impact || 0) - Math.abs(a.impact || 0));
      if (FP.patternEngine) {
        const advanced = FP.patternEngine.cluster(an.rows);
        an.rows = advanced.rows; an.advanced = advanced.rows.map((r) => r.advanced); an.groups = advanced.groups;
      } else { an.advanced = []; an.groups = []; }

      /* ---- 5. Share & Mix: períodos EQUIVALENTES (nunca parcial vs completo) ---- */
      if (FP.shareMixEngine) {
        const baselinePeriod = cc.baseline ? cc.baseline.label : '—', currentPeriod = cc.current ? cc.current.label : '—';
        if (comparable) {
          const keys = new Set([...baseSum.values.keys(), ...focusMap.values.keys()]);
          const mixRows = [...keys].map(entity => ({ entity,
            baselineValue: finiteTrend(baseSum.values.get(entity)) ? baseSum.values.get(entity) : 0,
            currentValue: finiteTrend(focusMap.values.get(entity)) ? focusMap.values.get(entity) : 0 })).filter(r => r.baselineValue > 0 || r.currentValue > 0);
          an.share = { ...FP.shareMixEngine.rankAndMix(mixRows, focusMap.total, baseSum.total), totalSeries, baselinePeriod, currentPeriod, baselineTotal: baseSum.total, currentTotal: focusMap.total,
            comparisonLabel: cc.text, comparisonAvailable: true, comparisonMessage: null, comparisonPartial: Boolean(cc.partial) };
        } else {
          an.share = { status: 'comparison_unavailable', rows: [], totalSeries, baselinePeriod, currentPeriod, baselineTotal: null, currentTotal: focusMap && focusMap.size ? focusMap.total : null,
            comparisonLabel: cc.text || `${baselinePeriod} vs ${currentPeriod}`, comparisonAvailable: false, comparisonMessage: cmpMessage };
        }
        an.rows.forEach((r) => { const mm = an.share.rows.find(x => x.entity === r.entity); if (mm) r.share = mm; });
      } else an.share = null;

      /* ---- 5a. La historia de cada entidad: fases, estado actual, estabilidad y contexto ---- */
      if (FP.trendStoryEngine) {
        const SE = FP.trendStoryEngine;
        const means = an.rows.map((r) => { const v = (r.series || []).map((x) => x.value).filter((x) => Number.isFinite(x) && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }).filter((x) => x !== null).sort((a, b) => a - b);
        const typicalLevel = means.length ? means[means.length >> 1] : null;
        // categoría de cada entidad (para compararla con su propia categoría): sólo Σ de las series ya calculadas
        const catOf = new Map(); const catSeries = new Map();
        if (['product', 'sku', 'subcategory'].includes(an.level) && closed.length) {
          try {
            const rg = { from: closed[0].from, to: closed.at(-1).to };
            const cats = [...(await aggF({ ...rg, channel: ch, groupBy: 'category' })).keys()]; chk();
            for (const cat of cats) { const mm = await aggF({ ...rg, channel: ch, groupBy: an.level, filter: { category: cat } }); mm.forEach((_, e) => { if (!catOf.has(e)) catOf.set(e, cat); }); chk(); }
            catOf.forEach((cat, e) => { const ser = series.get(e); if (!ser) return; if (!catSeries.has(cat)) catSeries.set(cat, ser.map((x) => ({ period: x.period, value: 0 })));
              const acc = catSeries.get(cat); ser.forEach((x, i) => { if (Number.isFinite(x.value)) acc[i].value += x.value; }); });
          } catch (e) { catOf.clear(); catSeries.clear(); }
        }
        const scopeLabel = ch === 'total' ? 'el total digital' : `el canal ${AC.channelLabel(ch)}`;
        an.rows.forEach((r) => {
          const cur = comparable ? { label: cc.current.label, value: focusMap.values.get(r.entity), baseline: baseSum.values.get(r.entity), baselineLabel: cc.baseline.label, partial: Boolean(focus.partial) } : null;
          const context = [{ id: 'scope', label: scopeLabel, series: totalSeries }];
          const cat = catOf.get(r.entity); if (cat && catSeries.has(cat) && an.level !== 'category') context.push({ id: 'category', label: `su categoría (${cat})`, series: catSeries.get(cat) });
          r.category = cat || null;
          r.story = SE.analyze(r.series, { current: cur, context, typicalLevel });
          r.story.outlook = SE.outlook(r.series, { seasonRef: seasonRef.byEntity.get(r.entity) || null, current: cur, story: r.story, horizon: 3, nextPeriod: (pk, k) => { try { const rg = TE.rangeForKey(pk, periodType); return TE.periodKey(TE.add(rg.from, periodType, k), periodType); } catch (e) { return null; } } });
          if (r.story.outlook) r.story.outlook.unit = { week: 'semana', day: 'día', year: 'año' }[periodType] || 'mes';
          if (comparable && metric === 'revenue') {
            const a0 = baseSum.parts.get(r.entity) || {}, a1 = focusMap.parts.get(r.entity) || {};
            r.story.drivers = SE.priceVolume({ r0: a0.r, u0: a0.u, r1: a1.r, u1: a1.u });
          }
        });
      }

      /* ---- 5b. Volumen · Precio · Mezcla y Puente al plan (sólo Venta; mismo contexto) ---- */
      an.pvm = null; an.bridge = null;
      if (metric !== 'revenue') {
        const why = `Volumen · Precio · Mezcla y Puente al plan se calculan sobre la Venta; con la métrica «${ctx.metricLabel}» no aplican.`;
        an.pvm = { status: 'not_applicable', message: why }; an.bridge = { status: 'not_applicable', message: why };
      } else if (!comparable) {
        an.pvm = { status: 'unavailable', message: cmpMessage || 'No hay período comparable.' };
        an.bridge = { status: 'unavailable', message: cmpMessage || 'No hay período comparable.' };
      } else {
        const ent = new Set([...baseSum.parts.keys(), ...focusMap.parts.keys()]);
        const pvmRows = [...ent].map((e) => { const a0 = baseSum.parts.get(e) || {}, a1 = focusMap.parts.get(e) || {};
          return { entity: e, r0: a0.r, u0: a0.u, r1: a1.r, u1: a1.u }; });
        an.pvm = FP.pvmEngine ? { ...FP.pvmEngine.analyze(pvmRows), level: an.level, comparisonLabel: cc.text } : null;
        if (an.pvm && an.pvm.status === 'unavailable' && !pvmRows.some((x) => x.u0 > 0 || x.u1 > 0)) an.pvm.message = 'El archivo de productos no trae unidades válidas: no se puede separar volumen, precio y mezcla.';
        if (FP.productFilter && FP.productFilter.isActive(an.filter)) {
          an.bridge = { status: 'not_applicable', message: `La meta (plan) existe por canal, no por ${FP.productFilter.describe(an.filter)}. El Puente al plan no aplica con una selección de producto o sucursal; quita la selección para verlo.` };
        } else if (FP.planBridgeEngine) {
          const planInfo = await planForRange(cc.current, ch); chk();
          const mixR = [...ent].map((e) => ({ entity: e, current: focusMap.values.get(e), baseline: baseSum.values.get(e) }));
          an.bridge = { ...FP.planBridgeEngine.analyze({ rows: mixR, plan: planInfo, actual: focusMap.total, baselineTotal: baseSum.total }), level: an.level, comparisonLabel: cc.text, currentLabel: cc.current.label, planNote: planInfo.note || null, planMessage: planInfo.message || null };
          // Proyección de la tendencia del total contra la meta de los meses proyectados (solo mensual; la meta existe por canal, no por entidad)
          try {
            const ts = an.share && an.share.totalSeries;
            if (an.periodType === 'month' && Array.isArray(ts) && ts.length && FP.trendStoryEngine) {
              const o = FP.trendStoryEngine.outlook(ts, { horizon: 3, seasonRef: seasonRef.total });
              if (o.status === 'available') {
                const items = [];
                for (const p of o.projection) {
                  if (!p.period) continue;
                  const pl = await planForRange({ ...FP.temporalEngine.rangeForKey(p.period, 'month') }, ch); chk();
                  if (pl && Number.isFinite(pl.total) && pl.total > 0 && !(pl.coverage < 1)) items.push({ period: p.period, projected: p.value, low: p.low, high: p.high, plan: pl.total, pct: p.value / pl.total - 1 });
                }
                an.bridge.outlookVsPlan = { items, direction: o.direction, confidence: o.confidence.level };
              }
            }
          } catch (e) { /* sin proyección contra meta: no bloquea el puente */ }
        }
      }

      /* ---- 6. Prioridades, forecast, contribución, narrativa ---- */
      if (FP.actionPriorityEngine) {
        an.priorities = comparable
          ? FP.actionPriorityEngine.analyze(an.rows, { baselinePeriod: cc.baseline.label, currentPeriod: cc.current.label, baselinePartial: false, currentPartial: Boolean(focus.partial) })
          : { status: 'comparison_unavailable', drag: [], compensate: [], watch: [], all: [], totals: { drag: 0, compensate: 0, balance: 0 }, comparison: { baselinePeriod: cc.baseline ? cc.baseline.label : null, currentPeriod: cc.current.label }, methodology: cmpMessage };
        await enrichPriorityEvidence(an, ctx); chk();
        an.risks = { status: an.priorities.status, risks: an.priorities.drag, opportunities: an.priorities.compensate, watch: an.priorities.watch, all: an.priorities.all, methodology: an.priorities.methodology };
      } else { an.priorities = null; an.risks = null; }
      if (FP.trendForecastEngine) an.forecast = FP.trendForecastEngine.analyzeMany(an.rows, { horizon: an.forecastHorizon, method: an.forecastMethod, periodType: an.periodType });
      else an.forecast = null;
      if (FP.contributionEngine) {
        const contributionRows = an.share && Array.isArray(an.share.rows)
          ? an.share.rows.map((r) => ({ entity: r.entity, current: r.currentValue, baseline: r.baselineValue,
              delta: finiteTrend(r.currentValue) && finiteTrend(r.baselineValue) ? r.currentValue - r.baselineValue : null,
              baselineShare: r.baselineShare, currentShare: r.currentShare, shareChangePp: r.shareChangePp })) : [];
        an.contribution = an.share?.comparisonAvailable ? FP.contributionEngine.analyze(contributionRows, { baselinePeriod: cc.baseline.label, currentPeriod: cc.current.label })
          : { status: 'comparison_unavailable', totalDelta: null, positive: [], negative: [], message: cmpMessage || 'No hay datos comparables.' };
      } else an.contribution = null;
      // Reconciliación visible: Σ entidades = total del canal, y Σ contribuciones = variación total.
      an.reconciliation = comparable ? {
        channel: ch, comparison: cc.text,
        current: { total: focusMap.total, sumEntities: [...focusMap.values.values()].reduce((s, v) => s + (finiteTrend(v) ? v : 0), 0) },
        baseline: { total: baseSum.total, sumEntities: [...baseSum.values.values()].reduce((s, v) => s + (finiteTrend(v) ? v : 0), 0) },
        delta: focusMap.total - baseSum.total, sumContributions: an.contribution && finiteTrend(an.contribution.totalDelta) ? an.contribution.totalDelta : null
      } : null;
      an.narrative = FP.analysisNarrativeEngine ? FP.analysisNarrativeEngine.build({ rows: an.rows, risks: an.risks, forecast: an.forecast, contribution: an.contribution, share: an.share, cohort: an.cohort, level: an.level, context: ctx }) : null;
      an.ai = { status: null, result: null, errors: [] };
      an.selected = an.selected && an.rows.find((r) => r.entity === an.selected.entity) || an.rows[0] || null;
      an.drill = null; an.periodsList = periods;
      if (an.reopen) { const ro = an.reopen; an.reopen = null; if (ro.scope === 'total' || an.rows.some((r) => r.entity === ro.entity)) { an.drill = { scope: ro.scope, entity: ro.scope === 'total' ? '__total__' : ro.entity, source: 'canal', path: [], loading: true, data: null, error: null }; if (ro.scope === 'entity') an.selected = an.rows.find((r) => r.entity === ro.entity); setTimeout(loadDrill, 0); } }
    } catch (e) {
      if (e === STALE) return;   // una corrida más nueva (por ejemplo, otro «Analizar por») ya tomó el control
      an.rows = []; an.selected = null; an.error = e && e.message ? e.message : String(e);
    } finally {
      if (an._run === runId) { an.loading = false; stopAnLoader(an); if (state.view === 'analisis') FP.trendView.render(state); }
    }
  }
  /* ========== Análisis · drill-down (KPI → variación → señal → entidad → canal → producto → período → registro fuente) ========== */
  const DRILL_CHILD = { category: 'subcategory', subcategory: 'product', product: 'sku', region: 'state', state: 'city', city: 'branch', channel: 'category' };
  const DRILL_LABEL = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', region: 'Región', state: 'Estado', city: 'Ciudad', branch: 'Sucursal', delivery: 'Tipo de entrega', channel: 'Canal' };

  /** Abre el detalle conservando Canal + Período + Comparación + Métrica del contexto vigente. */
  function openDrill({ scope = 'entity', entity = null, source = 'tabla' } = {}) {
    const an = state.an;
    if (scope === 'entity') an.selected = an.rows.find((r) => r.entity === entity) || an.selected;
    an.drill = { scope, entity: scope === 'total' ? '__total__' : entity, source, path: [], loading: true, data: null, error: null };
    loadDrill(); render();
  }
  async function loadDrill() {
    const an = state.an, d = an.drill, ctx = an.context, ci = an.comparisonInfo;
    if (!d) return;
    // Nunca dejar «Cargando…» sin salida: si falta el contexto del análisis, se dice (antes se salía en silencio y quedaba cargando para siempre)
    if (!ctx || !ci) { d.loading = false; d.pending = false; d.error = 'El análisis aún no tiene contexto (se está recalculando). Pulsa «Reintentar» en unos segundos.'; if (state.view === 'analisis') FP.trendView.render(state); return; }
    const token = d.token = Math.random(); d.loading = true; d.pending = false; d.error = null; d.step = 'Leyendo el período actual…'; d.data = null;
    const TE = FP.temporalEngine, PS = FP.productStore, mine = () => d.token === token;
    const repaint = () => { if (mine() && state.view === 'analisis') { try { FP.trendView.render(state); } catch (e) { try { console.error('[Detalle] render', e); } catch (_) { /* sin consola */ } } } };
    // Salida de emergencia: si algo tarda demasiado (datos muy grandes), se avisa y se ofrece reintentar en vez de quedarse cargando.
    const watchdog = setTimeout(() => { if (mine() && d.loading) { d.loading = false; d.pending = false; d.error = 'El detalle tarda más de lo normal (90 s). Puede seguir calculándose; si no aparece, pulsa «Reintentar» o acota el período.'; repaint(); } }, an.drillTimeoutMs || 90000);
    try {
      const nodes = d.scope === 'total' ? [...d.path] : [{ level: an.level, key: d.entity }, ...d.path];
      const filter = { ...pageFilter() }; let chan = ctx.channel;
      nodes.forEach((n) => { if (n.level === 'channel') chan = n.key; else filter[n.level] = n.key; });
      const nodeLevel = nodes.length ? nodes[nodes.length - 1].level : null;
      const childLevel = nodeLevel ? DRILL_CHILD[nodeLevel] || null : an.level;
      const cur = ci.current, base = ci.comparable ? ci.baseline : null;
      const groupBys = ['total', ...(childLevel ? [childLevel] : [])];
      const showByChannel = ctx.channel === 'total' && nodeLevel !== 'channel' && an.level !== 'channel';
      // FASE A (rápida): dos pasadas (período actual y comparación), cada bloque día × canal se lee UNA vez
      // y de ahí salen el total, el desglose por canal y el siguiente nivel.
      const scanOf = (range) => (range ? PS.aggregateScan({ from: range.from, to: range.to, channel: chan, filter, groupBys }) : Promise.resolve(new Map()));
      const curScan = await scanOf(cur); if (!mine()) return;
      d.step = base ? 'Leyendo el período de comparación…' : d.step; repaint();
      const baseScan = base ? await scanOf(base) : null; if (!mine()) return;
      const pick = (scan, g, ch = null) => (ch ? (scan.get(ch) && scan.get(ch).get(g)) || new Map() : PS.mergeMaps([...scan.values()].map((m) => m.get(g))));
      const tot = (scan, ch = null) => sumMap(pick(scan, 'total', ch), ctx.metric).total;
      const summary = { current: tot(curScan), baseline: baseScan ? tot(baseScan) : null };
      summary.delta = summary.baseline !== null ? summary.current - summary.baseline : null;
      summary.deltaPct = FP.analysisContext.pctChange(summary.current, summary.baseline);
      const rootRow = d.scope === 'entity' && !d.path.length ? an.rows.find((r) => r.entity === d.entity) : null;
      if (rootRow && rootRow.share) { summary.shareCurrent = rootRow.share.currentShare; summary.shareBaseline = rootRow.share.baselineShare; summary.sharePp = rootRow.share.shareChangePp; }
      let byChannel = null;
      if (showByChannel) {
        byChannel = FP.analysisContext.channelIds().map((c) => { const cv = tot(curScan, c), bv = baseScan ? tot(baseScan, c) : null;
          return { channel: c, label: FP.analysisContext.channelLabel(c), current: cv, baseline: bv, delta: bv !== null ? cv - bv : null }; });
      }
      let children = null;
      if (childLevel) {
        const cm = sumMap(pick(curScan, childLevel), ctx.metric), bm = baseScan ? sumMap(pick(baseScan, childLevel), ctx.metric) : null;
        const keys = new Set([...cm.values.keys(), ...(bm ? bm.values.keys() : [])]);
        const rows = [...keys].map((k) => { const c = cm.values.get(k), b = bm ? bm.values.get(k) : null;
          const cv = Number.isFinite(c) ? c : 0, bv = bm ? (Number.isFinite(b) ? b : 0) : null;
          return { key: k, current: cv, baseline: bv, delta: bv !== null ? cv - bv : null, deltaPct: FP.analysisContext.pctChange(cv, bv) }; })
          .sort((a, b) => Math.abs(b.delta ?? b.current) - Math.abs(a.delta ?? a.current));
        children = { level: childLevel, total: rows.length, sumCurrent: cm.total, sumBaseline: bm ? bm.total : null, rows: rows.slice(0, 12) };
      }
      let sku = nodeLevel === 'sku' ? nodes[nodes.length - 1].key : null;
      if (!sku && childLevel === 'sku' && children && children.total === 1) sku = children.rows[0].key;
      d.data = { nodes, nodeLevel, childLevel, summary, byChannel, children, byPeriod: [], records: null, context: { channel: ctx.channelLabel, period: ctx.focus.label, comparison: ci.text, level: DRILL_LABEL[an.level] || an.level, metric: ctx.metricLabel } };
      d.loading = false; d.pending = true; d.step = 'Calculando el detalle temporal y los registros fuente…'; repaint();

      // FASE B (en segundo plano): detalle temporal y registros fuente. La pantalla ya muestra lo principal.
      const plist = an.periodsList || [];
      let byPeriod = [];
      if (plist.length) {
        const shown = plist.slice(-12);
        const fromSeries = (ser) => { const m = new Map((ser || []).map((x) => [x.period, x.value]));
          return shown.map((p) => { const own = m.get(p.key); const v = Number.isFinite(own) ? own : (p.key === ctx.focus.key && summary.current > 0 ? summary.current : null);
            return { key: p.key, from: p.from, to: p.to, partial: Boolean(p.partial), value: v }; }); };
        if (rootRow && Array.isArray(rootRow.series)) byPeriod = fromSeries(rootRow.series);           // ya calculado por el análisis: no se vuelve a leer nada
        else if (d.scope === 'total' && !d.path.length && an.share && Array.isArray(an.share.totalSeries)) byPeriod = fromSeries(an.share.totalSeries);
        else {
          const dayScan = await PS.aggregateScan({ from: plist[0].from, to: plist[plist.length - 1].to, channel: chan, filter, groupBys: ['date'] }); if (!mine()) return;
          const dayMap = PS.mergeMaps([...dayScan.values()].map((m) => m.get('date'))); const sums = new Map();
          dayMap.forEach((acc, date) => { const f = PS.finalize(acc, null); const v = f && f[ctx.metric] && Number.isFinite(f[ctx.metric].value) ? f[ctx.metric].value : null;
            if (v !== null) { const k = TE.periodKey(date, ctx.periodType); sums.set(k, (sums.get(k) || 0) + v); } });
          byPeriod = shown.map((p) => ({ key: p.key, from: p.from, to: p.to, partial: Boolean(p.partial), value: sums.has(p.key) ? sums.get(p.key) : null }));
        }
      }
      /* Clientes por período (nuevos / recurrentes / reactivados / no regresaron): del libro de clientes (una fila por PEDIDO, sin producto).
         Por eso solo aplica al total y al canal, y a períodos mensuales; en un producto o categoría se avisa en vez de inventar la cifra. */
      let customers = null;
      const wholeScope = Object.keys(filter).length === 0;   // total o un canal (sin producto/categoría/geografía)
      if (ctx.periodType !== 'month') customers = { status: 'period', note: 'Los clientes nuevos, recurrentes y reactivados se calculan por mes. Cambia el período a «Mes» para verlos.' };
      else if (!FP.customerStore) customers = { status: 'none', note: 'No hay libro de clientes cargado.' };
      else {
        try {
          // Canal + categoría / subcategoría / producto / SKU / geografía: se cuentan los clientes que compraron ESA selección en cada mes.
          const ca = await FP.customerStore.analyze({ channel: chan === 'total' ? null : chan, ...(wholeScope ? {} : { filter, scope: state.an.cuScope === 'selection' ? 'selection' : 'company' }) }); if (!mine()) return;
          if (ca && ca.status === 'ok') customers = { status: 'ok', filtered: !wholeScope, scope: ca.scope || 'company', byMonth: Object.fromEntries(ca.monthly.map((m) => [m.key, m])), warmupDays: ca.options.warmupDays, reactivationDays: ca.options.reactivationDays };
          else if (ca && ca.status === 'filter_unavailable') customers = { status: 'filter_unavailable', note: ca.reason === 'no_matcher' ? 'No se pudo aplicar el filtro de productos a los clientes.' : `Para ver los clientes de esta selección (categoría, producto o sucursal) hay que volver a cargar y guardar ${ca.missingFiles && ca.missingFiles.length ? `el archivo de ventas (${ca.missingFiles.slice(0, 3).join(', ')}${ca.missingFiles.length > 3 ? '…' : ''})` : 'tus archivos de ventas'}: los guardados antes no traen el detalle por producto de cada pedido. No se borra nada; al recargarlo se reemplazan sus pedidos.` };
          else customers = { status: 'none', note: 'Para ver clientes nuevos, recurrentes y reactivados carga un archivo de ventas con id de cliente y de pedido.' };
        } catch (e) { customers = { status: 'none', note: 'No se pudo leer el libro de clientes.' }; }
      }
      let records = null;
      if (sku) {
        const from = base ? (base.from < cur.from ? base.from : cur.from) : cur.from;
        const raw = await PS.skuTrace({ sku, from, to: cur.to, channel: chan }); if (!mine()) return;
        const within = (r, rg) => rg && r.date >= rg.from && r.date <= rg.to;
        const rows = raw.filter((r) => r.kind === 'sales' && (within(r, cur) || within(r, base))).map((r) => ({ date: r.date, channel: r.channel, revenue: r.revenue, orders: r.orders, units: r.units, file: r.fileName || null, row: r.row,
          period: within(r, cur) ? 'actual' : 'comparación' }));
        records = { sku, total: rows.length, rows: rows.slice(-40).reverse(), sumCurrent: rows.filter((r) => r.period === 'actual').reduce((s, r) => s + (Number.isFinite(r[ctx.metric]) ? r[ctx.metric] : 0), 0) };
      }
      d.data.byPeriod = byPeriod; d.data.customers = customers; d.data.records = records; d.pending = false; d.step = null;
    } catch (e) { if (mine()) { d.error = e && e.message ? e.message : String(e); d.pending = false; } }
    finally { clearTimeout(watchdog); if (mine()) { d.loading = false; repaint(); } }
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
    // Loader homologado desde el primer instante (sin %: se desconoce hasta que el lector reporte avance)
    setWorking({ fileName: files.length === 1 ? files[0].name : `${files.length} archivos`, phase: PHASE.leer, pct: null, generic: true });
    if (state.view === 'carga') render();
    try { await stageFilesInner(files, dataType); }
    finally { restoreUploadState(stateEl); if (state.staging.working && state.staging.working.generic) { state.staging.working = null; if (state.view === 'carga') render(); } }
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
    const prev = state.staging.working;
    if (w && !w.t0) w.t0 = (prev && prev.fileName === w.fileName && prev.t0) || Date.now();   // el reloj arranca con el archivo, no con cada etapa
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
  /** Reemplazo (almacén de venta real / plan / histórico / segmentos): copia el estado actual de la colección y quita el archivo anterior. */
  function takeReplaceSnapshot(item) {
    const id = item.replace && item.replace.batchId; if (!id) return null;
    const t = item.staged.dataType, col = state.store[t];
    const old = col.batches.find((b) => b.id === id); if (!old) return null;
    const snap = { dataType: t, batches: col.batches.slice(), records: col.records.slice(), oldName: old.fileName, oldId: id };
    ST.removeBatch(state.store, id);
    return snap;
  }
  function finishReplace(snap, batch) {
    if (!snap || !batch || batch.empty) return;
    state.replace.undo = { ...snap, newBatchId: batch.id, newName: batch.fileName, afterLen: state.store[snap.dataType].records.length };
  }

  function finishCommit(item, batch) {
    if (batch && batch.empty) {   // todo lo del archivo ya estaba cargado sin cambios: no se guarda un lote vacío
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      render();
      FP.ui.toast(`Sin filas nuevas ni cambios: las ${batch.skippedUnchanged.toLocaleString('es-MX')} filas de ${batch.fileName} ya estaban cargadas con los mismos valores. No se guardó nada.`);
      return;
    }
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
      FP.ui.toast(`Importadas ${batch.accepted} filas de ${batch.fileName}${batch.skippedUnchanged ? ` (omití ${batch.skippedUnchanged.toLocaleString('es-MX')} que ya estaban iguales)` : ''}${batch.quarantined ? ` (${batch.quarantined} con un valor en cuarentena: se conserva el original y no suma)` : ''}${batch.rejected ? `; ${batch.rejected} quedaron fuera` : ''}.`);
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
      const snap = takeReplaceSnapshot(item);
      const batch = ST.commitRemote(state.store, item.staged, done, done.records, { id, skipUnchanged: snap ? false : Boolean(item.skipUnchanged), includeErrorRows: state.settings.includeErrorRows, settings: state.settings, source: item.staged.sourceType, durationMs: item.staged.durationMs });
      finishReplace(snap, batch);
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
      FP.ui.toast('Datos de prueba importados por el pipeline y plan original bloqueado', { ms: 3500 });
    },

    async 'run-tests'() {
      FP.ui.toast('Ejecutando pruebas del motor en segundo plano…', { ms: 2500 });
      await runEngineTests(true);
    },

    'clear-all'() {
      if (!root.confirm('¿Borrar todos los datos guardados de esta app en este navegador? Incluye archivos importados, metas y ajustes.')) return;
      storage.clear();
      if (FP.productStore) FP.productStore.reset();
      if (FP.customerStore) FP.customerStore.reset();
      state.pa = { ...state.pa, result: null, counts: null, from: null, to: null, periodType: null, drill: [], geo: {}, next: null, trace: null };
      state.an = { ...state.an, rows: [], selected: null, key: null, error: null, priorities: null, risks: null, narrative: null, ai: { status: null, result: null, errors: [] }, assistant: { open: false, question: '', status: 'idle', result: null, errors: [], history: [] } };
      state.store = ST.createStore();
      state.staging = { items: [], activeId: null, issueFilter: 'all' };
      loadSettings();
      loadAliases();
    loadSheetLinks();
      loadPlanningSettings();
      loadForecastSettings();
      loadReforecastSettings();
      loadRecovery();
      loadBusinessContext(); loadBrand();
      state.rc.draft = emptyDraft(); state.rc.selected = []; state.rc.imported = null;
      loadDiagnosticSettings();
      state.rf.simDate = null;
      state.dx.run = null;
      loadYearScoped(state.year);
      refresh();
      state.ux.visited = {}; state.ux.tour = { active: false, step: 0, collapsed: false, went: false, flash: '', skipped: {}, ended: null, micro: {}, lastMicro: '', lastMicroTitle: '', path: null, compact: false, upDismissed: '' }; FP.tour.setPath(null); state.ux.lastByGroup = {};
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
      FP.ui.markTargetsDraft(state); FP.ui.updateTargetHints();
      document.getElementById('targets-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      { const t = state.ux.tour; FP.tour.mark(state, 'meta.calc', false);   // sin render() completo: borraría lo que acaba de llenarse en el formulario
        if (t.active && t.step === FP.tour.idxOf('meta')) { t.went = false; t.collapsed = false; t.flash = 'Hecho: Calcula tu meta desde el histórico.'; t.lastMicro = 'meta.channels'; t.lastMicroTitle = 'Revisa el reparto por canal'; FP.tour.render(state); } }
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
    'set-year'(el) { loadYearScoped(Number(el.value)); refresh(); resetPeriod(); state.ux.home.follow = true; render(); },

    'an-period-type'(el) { const pt = el.value || 'month'; const pc = pt === 'day' ? 30 : pt === 'year' ? 3 : 12; resetAnalysis({ periodType: pt, periodCount: pc, months: pc, focusKey: null }); render(); },
    'an-metric'(el) { const keep = state.an.drill ? { scope: state.an.drill.scope, entity: state.an.drill.entity } : null; resetAnalysis({ metric: FP.analysisContext.normMetric(el.value || el.dataset.value) }); state.an.reopen = keep && keep.scope === 'entity' ? keep : (keep ? { scope: 'total' } : null); render(); },
    'an-focus'(el) { resetAnalysis({ focusKey: el.value || null }); render(); },
    'an-comparison'(el) { resetAnalysis({ comparison: el.value || 'previous' }); render(); },
    'an-level'(el) { resetAnalysis({ level: el.value || el.dataset.value }); render(); },
    'an-period-count'(el) { const pc = Math.max(3, Math.min(state.an.periodType === 'day' ? 90 : 24, Number(el.value) || 12)); resetAnalysis({ periodCount: pc, months: pc }); render(); },
    'an-pattern'(el) { state.an.pattern = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-state'(el) { state.an.stateFilter = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-signal'(el) { state.an.signal = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-anomaly-direction'(el) { state.an.anomalyDirection = el.value || el.dataset.value || 'all'; state.an.page = 1; render(); },
    'an-entity-query'(el) { state.an.entityQuery = el.value || ''; state.an.page = 1; render(); },
    'an-min-share'(el) { state.an.minSharePct = Math.max(0, Number(el.value) || 0); state.an.page = 1; render(); },
    'an-min-impact'(el) { state.an.minImpact = Math.max(0, Number(el.value) || 0); state.an.page = 1; render(); },
    'an-page'(el) {
      const a = state.an;
      const filtered = (a.rows || []).filter((r) => {
        if (a.pattern !== 'all' && r.pattern !== a.pattern) return false;
        if (a.signal !== 'all' && !(r.advanced && r.advanced.signal === a.signal)) return false;
        if (a.anomalyDirection !== 'all' && !(r.anomaly && r.anomaly.direction === a.anomalyDirection)) return false;
        if (a.entityQuery && !String(r.entity || '').toLowerCase().includes(String(a.entityQuery).toLowerCase())) return false;
        if (a.minImpact > 0 && Math.abs(r.recentAbsoluteChange || 0) < a.minImpact) return false;
        if (!FP.trendView.isMaterial(a, r)) return false;
        return true;
      });
      const size = Math.max(1, Number(state.an.pageSize) || 6);
      const pages = Math.max(1, Math.ceil(filtered.length / size));
      state.an.page = Math.max(1, Math.min(pages, Number(el.dataset.value) || 1));
      render();
      const table = document.getElementById('an-trend-table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    'an-forecast-horizon'(el) { state.an.forecastHorizon = Math.max(1, Math.min(12, Number(el.dataset.value) || 3)); state.an.forecastPage = 1; state.an.forecast = FP.trendForecastEngine ? FP.trendForecastEngine.analyzeMany(state.an.rows, { horizon: state.an.forecastHorizon, method: state.an.forecastMethod, periodType: state.an.periodType }) : null; render(); },
    'an-forecast-method'(el) { state.an.forecastMethod = el.value || 'linear'; state.an.forecastPage = 1; state.an.forecast = FP.trendForecastEngine ? FP.trendForecastEngine.analyzeMany(state.an.rows, { horizon: state.an.forecastHorizon, method: state.an.forecastMethod, periodType: state.an.periodType }) : null; render(); },
    'an-forecast-page'(el) { const rows = state.an.forecast && Array.isArray(state.an.forecast.rows) ? state.an.forecast.rows : []; const pages = Math.max(1, Math.ceil(rows.length/6)); state.an.forecastPage = Math.max(1, Math.min(pages, Number(el.dataset.value)||1)); render(); },
    'an-assistant-toggle'() {
      state.an.assistant = { ...state.an.assistant, open: !state.an.assistant.open };
      if (state.view === 'analisis') FP.trendView.render(state);
    },
    'an-assistant-question'(el) {
      state.an.assistant = { ...state.an.assistant, question: el.value || '' };
    },
    'an-assistant-ask'() {
      const a = state.an.assistant || {};
      const q = String(a.question || '').trim();
      if (!q || !FP.cohereAnalysisAssistant) return;
      state.an.assistant = { ...a, open: true, status: 'busy', result: null, errors: [] };
      if (state.view === 'analisis') FP.trendView.render(state);
      const wantsPanorama = a.panorama || PANORAMA_RE.test(q);
      (wantsPanorama ? buildPanorama() : Promise.resolve({ ok: true, panorama: null }))
        .then((pr) => (pr.ok ? FP.cohereAnalysisAssistant.ask(q, state, { apiKey: state.dx.apiKey, model: state.dx.model, panorama: pr.panorama })
          : { ok: false, status: 'unavailable', result: null, errors: [pr.error] }))
        .then(r => {
          const history = [...(state.an.assistant.history || []), { question: q, result: r.result, errors: r.errors || [], ok: r.ok }].slice(-5);
          state.an.assistant = { ...state.an.assistant, status: r.ok ? 'ok' : 'error', result: r.result, errors: r.errors || [], history, question: '', panorama: false };
          if (state.view === 'analisis') FP.trendView.render(state);
        })
        .catch(e => {
          state.an.assistant = { ...state.an.assistant, status: 'error', result: null, errors: [e?.message || String(e)] };
          if (state.view === 'analisis') FP.trendView.render(state);
        });
    },
    'an-assistant-group'(el) {
      const g = Number(el.dataset.group); state.an.assistant = { ...state.an.assistant, group: String(state.an.assistant.group) === String(g) ? null : g };
      if (state.view === 'analisis') FP.trendView.render(state);
    },
    'an-assistant-suggest'(el) {
      const q = el.dataset.question || '';
      const isPan = el.dataset.panorama === '1';
      state.an.assistant = { ...state.an.assistant, open: true, question: q, panorama: isPan, panBusy: isPan && !(state.an._panorama), pan: isPan && state.an._panorama ? state.an._panorama.value : state.an.assistant.pan };
      if (state.view === 'analisis') FP.trendView.render(state);
      if (isPan) buildPanorama().then((pr) => { state.an.assistant = { ...state.an.assistant, panBusy: false, pan: pr.ok ? pr.panorama : null }; if (state.view === 'analisis') FP.trendView.render(state); })
        .catch(() => { state.an.assistant = { ...state.an.assistant, panBusy: false }; if (state.view === 'analisis') FP.trendView.render(state); });
      const input = document.getElementById('an-assistant-input');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    },
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
        channel: { id: (state.an.context && state.an.context.channel) || 'total', label: (state.an.context && state.an.context.channelLabel) || 'Total digital' },
        comparison: state.an.comparisonInfo ? state.an.comparisonInfo.text : (state.an.share?.comparisonLabel || null),
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
    'an-channel'(el) { const keep = state.an.drill ? { scope: state.an.drill.scope, entity: state.an.drill.entity } : null; resetAnalysis({ channel: FP.analysisContext.normChannel(el.value || el.dataset.value) }); state.an.reopen = keep && keep.scope === 'entity' ? keep : (keep ? { scope: 'total' } : null); render(); },
    'an-drill'(el) { openDrill({ scope: 'entity', entity: el.dataset.entity, source: el.dataset.source || 'tabla' }); setTimeout(() => { const t = document.getElementById('an-entity-reading'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); },
    'an-drill-total'(el) { openDrill({ scope: 'total', source: el.dataset.source || 'kpi' }); setTimeout(() => { const t = document.getElementById('an-entity-reading'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); },
    'cu-clear-filter'() { state.cu.opts.filter = {}; state.cu.status = 'idle'; render(); },
    'an-filter'(el) { const k = el.dataset.fkey; if (!k || !FP.productFilter) return; resetAnalysis({ filter: FP.productFilter.cascade(state.an.filter, k, el.value) }); state.an.reopen = null; render(); },
    'gs-open'() { if (FP.search) FP.search.open(''); },
    'fs-toggle'(el) { const pg = el.dataset.fsPage; if (!pg) return; state.fs = { ...(state.fs || {}), [pg]: !(state.fs && state.fs[pg]) }; render(); },
    'fs-chip'(el) {
      const pg = el.dataset.fsPage, k = el.dataset.fsKey || '';
      if (pg === 'an') {
        if (k.startsWith('f:')) return actions['an-filter']({ dataset: { fkey: k.slice(2) }, value: '' });
        const reset = { stateFilter: 'all', entityQuery: '', pattern: 'all', signal: 'all', anomalyDirection: 'all', minSharePct: 0.5, minImpact: 0 };
        if (k in reset) { state.an[k] = reset[k]; state.an.page = 1; render(); }
      } else if (pg === 'pa' && k.startsWith('geo:')) actions['pa-geo']({ dataset: { key: k.slice(4) }, value: '' });
      else if (pg === 'cu' && k.startsWith('cu:')) { const f = state.cu.opts.filter = state.cu.opts.filter || {}; const kk = k.slice(3); f[kk] = undefined; if (kk === 'category') { f.subcategory = undefined; f.product = undefined; } else if (kk === 'subcategory') f.product = undefined; else if (kk === 'state') f.branch = undefined; state.cu.status = 'idle'; render(); }
    },
    'fs-clear'(el) {
      const pg = el.dataset.fsPage;
      if (pg === 'an') { Object.assign(state.an, { stateFilter: 'all', entityQuery: '', pattern: 'all', signal: 'all', anomalyDirection: 'all', minSharePct: 0.5, minImpact: 0, page: 1 }); actions['an-filter-clear'](); }
      else if (pg === 'pa') actions['pa-geo-clear']();
      else if (pg === 'cu') actions['cu-clear-filter']();
    },
    'an-filter-clear'() { resetAnalysis({ filter: {} }); state.an.reopen = null; render(); },
    'an-cu-scope'(el) { state.an.cuScope = el.value === 'selection' ? 'selection' : 'company'; const d = state.an.drill; if (d) { d.loading = true; loadDrill(); } render(); },
    'an-drill-down'(el) { const d = state.an.drill; if (!d) return; d.path = [...d.path, { level: el.dataset.level, key: el.dataset.key }]; d.loading = true; loadDrill(); render(); },
    'an-drill-up'(el) { const d = state.an.drill; if (!d) return; const i = Number(el.dataset.index); d.path = d.path.slice(0, i + 1); d.loading = true; loadDrill(); render(); },
    'an-drill-retry'() { const d = state.an.drill; if (!d) return; d.loading = true; loadDrill(); render(); },
    'an-drill-close'() { state.an.drill = null; render(); },
    'an-drill-channel'(el) { const d = state.an.drill; const keep = d ? { scope: d.scope, entity: d.entity } : null; resetAnalysis({ channel: FP.analysisContext.normChannel(el.dataset.channel) }); state.an.reopen = keep && keep.scope === 'entity' ? keep : { scope: 'total' }; render(); },
    'an-select'(el) { openDrill({ scope: 'entity', entity: el.dataset.entity, source: el.dataset.source || 'tabla' }); setTimeout(() => { const detail = document.getElementById('an-entity-reading'); if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); },
    /* Lleva el periodo, canal y comparación del Análisis al Diagnóstico (mismo alcance; no cambia el Análisis). */
    'an-diagnose'() {
      const f = state.an.context && state.an.context.focus;
      if (!f) { FP.ui.toast('No hay un periodo definido para diagnosticar.'); return; }
      const pt = state.an.periodType;
      // Se usa el contexto persistente de la app: al cambiar de vista, navigation.applyContext lo traslada al Diagnóstico.
      const c = state.ux.ctx;
      c.channel = FP.analysisContext.normChannel(state.an.channel);
      c.comparison = state.an.comparison === 'year_ago' ? 'actual_vs_yoy' : 'actual_vs_previous';
      if (pt === 'year') { c.periodType = 'year'; c.periodKey = String(f.key).slice(0, 4); }
      else { c.periodType = 'month'; c.periodKey = String(f.to).slice(0, 7); }   // semana/día → el mes que los contiene
      root.location.hash = '#diagnostico';
      if (pt === 'week' || pt === 'day') FP.ui.toast('El Diagnóstico trabaja por mes o año: se abrió el mes que contiene ese periodo.');
    },
    'an-export-contrib'() {
      const a = state.an, c = a.contribution;
      if (!c || c.status !== 'available') { FP.ui.toast('No hay contribución para descargar.'); return; }
      const visible = new Set((a._filteredRows || a.rows || []).map((r) => r.entity));
      const q = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const head = ['entidad', 'rol', 'ranking', 'base', 'actual', 'cambio', 'cambio_pct', 'aporte_cambio_neto_pct', 'peso_movimiento_pct', 'delta_share_pp'];
      const rows = [...c.positive, ...c.negative].filter((r) => visible.has(r.entity)).map((r) => [r.entity, r.delta < 0 ? 'Arrastra' : r.delta > 0 ? 'Compensa' : 'Estable', r.rank,
        r.baseline, r.current, r.delta, r.deltaPct, r.contributionPct, r.movementShare, r.shareChangePp]);
      const ctx = a.context || {};
      const meta = [['# periodo', ctx.focus ? ctx.focus.label : ''], ['# comparacion', c.baselinePeriod + ' -> ' + c.currentPeriod], ['# canal', ctx.channelLabel || ''], ['# metrica', ctx.metricLabel || ''], ['# materialidad_pct', a.minSharePct || 0]];
      const csv = '\uFEFF' + [...meta.map((m) => m.map(q).join(',')), head.join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
      FP.exporter.download(`contribucion_${(ctx.focus && ctx.focus.key) || 'periodo'}_${a.channel || 'total'}.csv`, csv, 'text/csv');
    },
    'an-export-reading'() {
      const el = document.getElementById('an-entity-reading');
      const r = state.an.selected;
      if (!el || !r) { FP.ui.toast('Elige una entidad para descargar su lectura.'); return; }
      const txt = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
      const name = String(r.entity).replace(/[^\w\-]+/g, '_').slice(0, 50);
      FP.exporter.download(`lectura_${name}.txt`, txt, 'text/plain');
    },
    'an-clear-selection'() { state.an.selected = null; state.an.drill = null; render(); },

    /* ----- Fase 1: carga ----- */
    'pick-files'(el) { pickFiles(el); },

    /* ----- Fase 15: Google Sheets por enlace publicado ----- */
    'sheets-fetch'(el) {
      const t = el.dataset.type;
      const url = (document.getElementById(`sheets-url-${t}`) || {}).value;
      const label = (document.getElementById(`sheets-label-${t}`) || {}).value;
      const edit = (document.getElementById(`sheets-edit-${t}`) || {}).value;
      if (String(edit || '').trim() && !FP.sheetsLink.editUrl(edit)) { FP.ui.toast('El enlace para abrir la hoja debe ser de Google Sheets (https://docs.google.com/spreadsheets/d/…).'); return; }
      return fetchSheet(t, { url, label, editUrl: edit });
    },
    'sheets-refresh'(el) {
      const l = state.sheets.links.find((x) => x.id === el.dataset.id);
      if (l) return fetchSheet(l.type, l);
    },
    'sheets-set-edit'(el) {
      const l = state.sheets.links.find((x) => x.id === el.dataset.id); if (!l) return;
      const v = (document.getElementById(`sheets-edit-${l.id}`) || {}).value;
      const u = FP.sheetsLink.editUrl(v);
      if (!u) { FP.ui.toast('Pega el enlace de la hoja tal como lo ves al editarla (https://docs.google.com/spreadsheets/d/…/edit).'); return; }
      l.editUrl = u; saveSheetLinks(); clearDrafts('sheets-'); render(); FP.ui.toast('Listo: ahora puedes abrir la hoja desde aquí.');
    },
    'sheets-refresh-all'() { return fetchAllSheets(); },
    'sheets-remove'(el) {
      state.sheets.links = state.sheets.links.filter((x) => x.id !== el.dataset.id);
      saveSheetLinks(); render();
      FP.ui.toast('Enlace quitado de la app. Recuerda dejar de publicar la pestaña en Google Sheets si ya no la usas.');
    },

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
      } else if (key === 'replaceRowsDropPct' || key === 'replaceRevenuePct') {
        const v = FP.normalize.normalizeNumber(el.value).value;
        if (v === null || v < 0 || v > 100) { FP.ui.toast('El umbral debe estar entre 0 % y 100 %.'); render(); return; }
        state.settings[key] = v;
      } else if (key === 'includeErrorRows' || key === 'enableAI' || key === 'sumSameKey') state.settings[key] = el.checked;
      else state.settings[key] = el.value;
      saveSettings();
      reprocessAll();
      render();
    },

    /* ----- Configuración: expandir o contraer todos los desplegables ----- */
    'st-tab'(el) { state.stTab = el.dataset.tab; FP.settingsView.showTab(state.stTab); },
    /** Lleva directo a una pestaña de Configuración (p. ej. desde el menú de la cuenta). */
    'settings-go'(el) {
      state.stTab = el.dataset.tab || 'herramienta';
      if (root.location.hash === '#ajustes') render(); else root.location.hash = 'ajustes';
    },

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

    'staging-skip-unchanged'(el) {
      const item = activeItem(); if (!item) return;
      item.skipUnchanged = el.checked; render();
    },

    'replace-pick'(el) {
      const item = activeItem(); if (!item) return;
      item.replace = { batchId: el.value || null, confirmed: false }; item._rp = null; render();
    },
    'replace-confirm'(el) {
      const item = activeItem(); if (!item || !item.replace) return;
      item.replace.confirmed = el.checked; render();
    },
    'replace-undo'() {
      const u = state.replace.undo; if (!u) return;
      const col = state.store[u.dataType];
      if (col.records.length !== u.afterLen || !col.batches.some((b) => b.id === u.newBatchId)) { state.replace.undo = null; render(); FP.ui.toast('Ya no se puede deshacer: después del reemplazo se cargó o quitó otro archivo de ese tipo.'); return; }
      state.store[u.dataType] = { ...col, batches: u.batches, records: u.records };
      state.replace.undo = null;
      reprocessAll(); saveStore([u.dataType]); invalidatePlanning(); refresh(); render();
      FP.ui.toast(`Listo: volvió ${u.oldName} y se quitó ${u.newName}.`);
    },

    'discard-staged'() {
      const item = activeItem();
      if (item && item.remote) FP.importWorker.drop(item.remote.jobId);   // el Worker libera las filas de ese archivo
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      render();
    },

    'commit-staged'() {
      const item = activeItem();
      if (item && FP.replaceView.blocked(state, item)) { render(); FP.ui.toast('Confirma el cambio antes de reemplazar el archivo anterior.'); return; }
      if (item && item.staged.dataType === 'products') { commitProduct(item); return; }
      if (item && item.remote) { commitRemote(item); return; }
      // Revalida contra lo guardado en este momento SOLO si algo cambió desde la revisión. Con archivos grandes (cientos de miles de
      // filas) rehacer toda la validación duplicaba la memoria y tardaba decenas de segundos.
      if (!item.result || item.result.sig !== stagedSig(item.staged)) item.result = processStaged(item.staged);
      if (!item.result.canImport) { render(); FP.ui.toast('Corrige el mapeo antes de importar.'); return; }
      const snap = takeReplaceSnapshot(item);   // reemplazo: quita lo del archivo anterior (guarda copia para deshacer)
      let batch;
      try {
        batch = ST.commitBatch(state.store, item.staged, item.result,
          { skipUnchanged: snap ? false : Boolean(item.skipUnchanged), includeErrorRows: state.settings.includeErrorRows, settings: state.settings, source: item.staged.sourceType, durationMs: item.staged.durationMs });
      } catch (e) { if (snap) state.store[snap.dataType] = { ...state.store[snap.dataType], batches: snap.batches, records: snap.records }; throw e; }
      finishReplace(snap, batch);
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
        state.pa = { ...state.pa, result: null, key: null, counts: null, from: null, to: null, periodType: null, drill: [], geo: {}, next: null, trace: null };
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
    'help-menu'() { FP.navigation.toggleHelpMenu(); },
    'acct-menu'() { FP.navigation.toggleAcctMenu(); },
    'help-section'() {
      const v = FP.guidanceConfig.VIEWS[state.view];
      if (v) FP.help.open(v.help, `Ayuda: ${v.title}`);
    },
    glossary() { FP.help.openGlossary(); },
    'glossary-search'(el) { FP.help.filterGlossary(el.value); },
    'help-close'() { FP.help.close(); },
    /* Inicio → destino: abre el módulo, conserva canal y periodo (ux.ctx) y recuerda en este navegador que el paso se abrió. El paso NO se da por hecho: lo completa el motor con datos. */
    'scroll-to'(el) { const t = document.getElementById(el.dataset.target); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    'route-go'(el) {
      const d = el.dataset;
      if (FP.attentionView) { FP.attentionView.markStarted(d.key, d.step, d.finding, state); if (d.view !== 'inicio') FP.attentionView.setOrigin(state, d); }
      if (d.channel) state.ux.routeCtx = { channel: d.channel };
      actions.go({ dataset: { view: d.view } });
    },
    'route-back'() {
      if (FP.attentionView) FP.attentionView.clearOrigin(state);
      actions.go({ dataset: { view: 'inicio' } });
      setTimeout(() => actions['scroll-to']({ dataset: { target: 'nbs' } }), 200);
    },
    'route-reviewed'(el) {
      const note = (document.getElementById('route-note') || {}).value || '';
      if (FP.attentionView) FP.attentionView.markReviewed(el.dataset.key, el.dataset.step, note, state);
      render();
    },
    'route-retry-save'() {
      const r = FP.attentionView && FP.attentionView.retrySave();
      render();
      if (r && r.ok) FP.ui.toast('Listo: tu avance se guardó en este navegador.');
    },
    'route-dismiss'() { if (FP.attentionView) FP.attentionView.clearOrigin(state); render(); },
    go(el) {
      FP.help.close();
      const v = el.dataset.view;
      if (root.location.hash === `#${v}`) render(); else root.location.hash = v;
    },
    'ux-mode'(el) {
      // Un solo estado de modo (Fase 7 + Aprendiz de Fase 9.1). Cambiar de modo solo cambia la presentación:
      // filtros, contexto, vista y resultados se conservan.
      const v = el.dataset.value;
      const was = state.ux.mode;
      state.ux.mode = FP.guidanceConfig.MODES.some(([id]) => id === v) ? v : 'analyst';
      if (state.ux.mode !== 'learner') state.ux.lesson = null;
      render();
      if (state.ux.mode === 'learner' && was !== 'learner' && !state.ux.tour.active) offerTour();
    },
    /** Pregunta inicial (Fase 12): la ruta decide qué pasos se muestran. Misma ruta = solo cierra. */
    'tour-path'(el) {
      closeTourOffer();
      const p = el.dataset.path; if (!FP.tour.PATHS[p]) return;
      const t = state.ux.tour;
      if (t.active && t.path === p) { render(); return; }
      state.ux.tour = { ...t, path: p, skipped: {}, ended: null, upDismissed: '' }; FP.tour.setPath(p); prefSet('onboardingDone', '1'); tourGo(0);
    },
    'tour-change-path'() { offerTour(true); },
    'tour-demo'() {
      const st = entryStatus();
      if (!st || localHasData(st)) { FP.ui.toast('Ya hay datos cargados: el demo no se carga para no mezclarlos con los tuyos.'); return; }
      closeTourOffer(); state.ux.tourOffered = true; prefSet('onboardingDone', '1'); saveUx();
      actions['generate-mock']();
    },
    'tour-path-up'(el) { const p = el.dataset.path; if (!FP.tour.PATHS[p]) return; state.ux.tour = { ...state.ux.tour, path: p, ended: null, upDismissed: '' }; FP.tour.setPath(p); tourGo(0); },
    'tour-up-dismiss'(el) { state.ux.tour.upDismissed = el.dataset.key || ''; render(); },
    'tour-compact-off'() { const t = state.ux.tour; t.compact = false; t.went = false; render(); },
    'tour-offer-no'() { closeTourOffer(); },
    'nav-toggle'() { FP.navigation.setDrawer(!document.body.classList.contains('nav-open')); },
    'nav-close'() { FP.navigation.setDrawer(false); },
    'ux-more'() { FP.navigation.toggleMore(); },
    'lesson-dismiss'() { state.ux.lesson = null; render(); },
    /** "¿Por qué este número?": explica la cifra con la corrida real del motor, en el panel de ayuda de Fase 7. */
    'why'(el) {
      FP.explain.open(el.dataset.kind, state, { channel: el.dataset.channel || 'total', periodKey: el.dataset.period || null, metric: el.dataset.metric || 'revenue' });
    },
    /** Resumen general de Inicio: elegir un canal de la tabla cambia el Canal de todo Inicio (igual que el selector de arriba). */
    'home-pick-channel'(el) { const h = state.ux.home; h.channel = el.dataset.ch; state.ux.ctx.channel = el.dataset.ch; state.ux.ctxNote = null; render(); },
    /** Resumen general de Inicio: abre Segmentos en la dimensión elegida, con el canal y el periodo de Inicio (el contexto ya lo traslada). */
    'home-seg'(el) {
      const h = state.ux.home, c = state.ux.ctx;
      (state.seg || (state.seg = { dimension: null })).dimension = el.dataset.dim;
      c.channel = h.channel || 'total'; c.comparison = 'actual_vs_previous';
      if (h.periodType === 'month' && h.periodKey) { c.periodType = 'month'; c.periodKey = h.periodKey; } else { c.periodType = 'year'; c.periodKey = String(state.year); }
      root.location.hash = '#segmentos';
    },
    'home-follow'() { state.ux.home.follow = true; state.ux.ctxNote = null; render(); },
    'banner-toggle'(el) { const b = el.closest('.att__banner'); if (!b) return; const o = b.dataset.open !== '1'; b.dataset.open = o ? '1' : '0'; el.setAttribute('aria-expanded', String(o)); },
    'home-setting'(el) {
      const h = state.ux.home;
      if (el.dataset.key === 'period') h.follow = false;
      if (el.dataset.key === 'channel') { h.channel = el.value; state.ux.ctx.channel = el.value; }
      else if (el.value === 'year') { h.periodType = 'year'; h.periodKey = String(state.year); state.ux.ctx.periodType = 'year'; state.ux.ctx.periodKey = String(state.year); }
      else { h.periodType = 'month'; h.periodKey = el.value; state.ux.ctx.periodType = 'month'; state.ux.ctx.periodKey = el.value; }
      state.ux.ctxNote = null;
      render();
    },
    'ac-decision-save'(el) {
      const g = (id) => ((document.getElementById(id) || {}).value || '').trim();
      const r = FP.actionPlan.recordDecision(state.rc.plan, el.dataset.id, { decision: g('dc-decision'), objective: g('dc-objective'), decidedBy: g('dc-by'), successIndicator: g('dc-success'), hypothesisToTest: g('dc-hyp') }, 'Desde Medir y aprender');
      if (!r.ok) { FP.ui.toast(r.error); return; }
      if (!saveActionPlan()) { render(); return; }
      render(); FP.ui.toast(r.unchanged ? 'La decisión ya estaba registrada igual.' : 'Decisión registrada. Quedó en el historial de la acción.');
    },
    'ac-conclusion-save'(el) {
      const g = (id) => ((document.getElementById(id) || {}).value || '').trim();
      const r = FP.actionPlan.recordConclusion(state.rc.plan, el.dataset.id, { outcome: g('cc-outcome'), justification: g('cc-just'), decidedBy: g('cc-by'), nextAction: g('cc-next') }, 'Desde Medir y aprender');
      if (!r.ok) { FP.ui.toast(r.error); return; }
      if (!saveActionPlan()) { render(); return; }
      render(); FP.ui.toast(r.unchanged ? 'La conclusión ya estaba registrada igual.' : 'Conclusión registrada. Es tu juicio con la evidencia medida; no prueba causalidad.');
    },
    'mx-select'(el) { state.ux.measureAction = el.dataset.id; render(); const c = document.getElementById('mx-chain'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'tour-start'() { if (!state.ux.tour.path) { offerTour(true); return; } tourGo(state.ux.tour.ended ? 0 : (state.ux.tour.step || 0)); },
    'tour-restart'() { state.ux.tour = { ...state.ux.tour, skipped: {}, ended: null, micro: {} }; tourGo(0); },
    'tour-next'() {
      const t = state.ux.tour; const status = FP.contextEngine.collectStatus(state);
      const n = FP.tour.nextIdx(state, status, t.step);
      if (n < 0) { state.ux.tour = { ...t, ended: 'fin', collapsed: false, went: false, flash: '' }; render(); return; }
      tourGo(n);
    },
    'tour-prev'() { tourGo(Math.max(0, state.ux.tour.step - 1)); },
    'tour-exit'() { state.ux.tour.active = false; render(); FP.ui.toast(`Recorrido pausado en el paso ${state.ux.tour.step + 1}. Puedes retomarlo cuando quieras.`); },
    /** Paso de acción: lleva a la pantalla y deja el recorrido esperando el dato (se detecta solo). */
    'tour-cta'() {
      const t = state.ux.tour; const v = FP.tour.steps()[t.step].view;
      // Si el micro-paso actual es de revisión (manual), la tarjeta queda abierta y compacta hasta «Ya lo vi»/«Siguiente».
      // Si hay que actuar en la pantalla (elegir archivo, llenar, guardar), se oculta y reaparece sola al detectar el resultado.
      const cm = FP.tour.currentMicro(state); const manual = Boolean(cm && cm.manual && root.location.hash === `#${v}`);
      t.went = true; t.flash = ''; t.compact = manual; t.collapsed = !manual;
      if (root.location.hash === `#${v}`) render(); else root.location.hash = v;
    },
    /** «No tengo X»: se marca omitido y se sigue; sin meta el recorrido queda en pausa con su resumen. */
    'tour-skip'() {
      const t = state.ux.tour; const s = FP.tour.steps()[t.step];
      if (t.path === 'B' && s.id === 'datos') { state.ux.tour = { ...t, path: 'C', upDismissed: '' }; FP.tour.setPath('C'); tourGo(0, 'Pasamos a la ruta de empresa nueva: sin histórico, empezamos por la meta.'); return; }
      t.skipped = { ...(t.skipped || {}), [s.id]: true };
      if (s.id === 'meta') { state.ux.tour = { ...t, ended: 'nometa', went: false, flash: '', collapsed: false }; render(); return; }
      const status = FP.contextEngine.collectStatus(state);
      tourGo(FP.tour.nextIdx(state, status, t.step));
    },
    'tour-micro-done'(el) {
      const t = state.ux.tour; const was = t.compact; FP.tour.mark(state, el.dataset.key, false);
      const nm = FP.tour.currentMicro(state);
      // desde la tarjeta compacta, si el siguiente micro-paso también es de revisión, la tarjeta se queda y la marca «Es aquí» se mueve
      if (was && nm && nm.manual) { t.went = true; t.compact = true; t.collapsed = false; t.flash = ''; } else { t.went = false; t.compact = false; t.collapsed = false; }
      render();
    },
    'tour-pause'() { state.ux.tour.collapsed = true; render(); },
    'tour-expand'() { state.ux.tour.collapsed = false; render(); },
    'tour-close'() { state.ux.tour = { ...state.ux.tour, active: false, collapsed: false, ended: null, step: 0 }; render(); },
    /** Resumen: retomar un punto pendiente (la meta retoma el paso Meta, etc.). */
    'tour-resume'(el) {
      const i = FP.tour.idxOf(el.dataset.step);
      const sk = { ...(state.ux.tour.skipped || {}) }; delete sk[el.dataset.step];
      state.ux.tour = { ...state.ux.tour, skipped: sk, ended: null };
      tourGo(i);
    },

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
    async 'brand-file'(el) {
      const f = el.files && el.files[0]; el.value = ''; if (!f) return;
      const r = await FP.brand.readLogo(f), b = state.brand;
      if (!r.ok) { b.error = r.error; render(); return; }
      b.error = null; b.draft = { logo: r.logo, palette: r.palette, main: r.main, accent: r.accent, cover: b.draft.cover || 'chart' }; b.sel = null; b.dirty = true; render();
      FP.ui.toast(r.palette.length ? 'Logo cargado. Revisa la paleta propuesta y pulsa «Guardar marca».' : 'Logo cargado, pero no encontré colores de marca claros. Escribe tus colores y guarda.');
    },
    'brand-cover'(el) { const b = state.brand; b.draft.cover = FP.brand.coverId(el.dataset.id); b.dirty = true; render(); },
    'brand-remove-logo'() { const b = state.brand; b.draft.logo = null; b.draft.palette = []; b.sel = null; b.dirty = true; render(); },
    'brand-sel'(el) { const b = state.brand, i = Number(el.dataset.i); b.sel = b.sel === i ? null : i; render(); },
    'brand-role'(el) { const b = state.brand, c = b.draft.palette[b.sel]; if (!c) return; b.draft[el.dataset.role] = c; b.dirty = true; render(); },
    'brand-hex'(el) {
      let v = String(el.value || '').trim(); if (v && v[0] !== '#') v = '#' + v;
      const b = state.brand; if (v && !FP.brand.HEX.test(v)) { b.error = 'El color debe ser un hexadecimal de 6 dígitos, por ejemplo #0E8F7E.'; render(); return; }
      b.error = null; b.draft[el.dataset.role] = v ? v.toUpperCase() : null; b.dirty = true; render();
    },
    'brand-reset'() {
      const b = state.brand, pal = b.draft.palette || [], r = FP.brand.pickRoles(pal);
      if (!pal.length) return; b.draft.main = r.main; b.draft.accent = r.accent; b.sel = null; b.dirty = true; render();
    },
    'brand-save'() {
      const b = state.brand, n = FP.brand.normalize(b.draft);
      if (!n) { b.error = 'Sube un logo o escribe un color principal.'; render(); return; }
      if (!storage.save(K.reportBrand, n)) { b.error = 'No se pudo guardar la marca en este navegador (¿logo demasiado pesado?).'; render(); return; }
      loadBrand(); render(); FP.ui.toast('Marca guardada. Se aplica a la presentación; vuelve a generar la vista previa.');
    },
    'brand-clear'() {
      if (!confirm('¿Quitar la marca? La presentación volverá a su aspecto original. Tus datos no se tocan.')) return;
      storage.remove(K.reportBrand); loadBrand(); render(); FP.ui.toast('Marca quitada.');
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
      pa[k] = el.value; pa.note = null; if (k === 'from' || k === 'to') pa.periodType = null;
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
      Object.assign(state.pa, { from: x.from, to: x.to, periodType: x.periodType, channel: x.channel, comparison: x.comparison, note: x.note, result: null });
      render();
    },
    async 'pa-export'() {
      const e = await EXPORT_BUILDERS.categoryProduct();
      if (!e.obj) { FP.ui.toast('Todavía no hay análisis de productos para exportar.'); return; }
      FP.exporter.download(e.file, e.obj);
    },
    async 'storage-tests'() {
      state.pa.testing = true; render();
      try { await FP.lazy.load('storagetests'); } catch (e) { state.pa.testing = false; render(); FP.ui.toast(`No se pudieron cargar las pruebas de almacenamiento: ${e.message}`, { ms: 5000 }); return; }
      state.pa.tests = await FP.storageTests.run();
      state.pa.testing = false; render();
      FP.ui.toast(`Pruebas de almacenamiento: ${state.pa.tests.passed} de ${state.pa.tests.total} correctas.`);
    },

    /* ----- Fase S1: nube ----- */
    'cloud-upload'() {
      return cloudRun(async () => {
        await repo.flush();
        cloudNote('Preparando productos…'); cloudProg('Preparando productos', 2);
        const bundle = await FP.productSync.build(repo, { onProgress: (d, n) => cloudProg(`Preparando productos (${d} de ${n})`, 2 + Math.round(33 * d / n)) });
        if (bundle.tooBig) return cloudNote(`Los productos pesan ${fmtKb(bundle.bytes)} ya comprimidos y rebasan el tope de ${fmtKb(FP.productSync.MAX_BYTES)} (el plan gratuito de Supabase tiene 500 MB en total). No se subió nada; reduce el rango de fechas de productos o pide ampliar el plan.`, 'bad');
        cloudProg('Revisando la copia anterior de la nube', 35);
        const pre = await FP.cloud.currentRefs({});   // los bloques que usa hoy la nube serán la «generación anterior» (respaldo) tras esta subida
        const up = await FP.cloud.upload(FP.productSync.withProducts(cloudProvider, bundle), { onProgress: (o) => cloudProg(`Subiendo bloque ${o.index} de ${o.of}`, 36 + Math.round(52 * o.index / o.of)) });
        if (!up.ok) return cloudNote(up.error, 'bad');
        cloudProg('Verificando la copia', 88);
        const v = await FP.cloud.verify(up, { onProgress: (o) => cloudProg(`Verificando la copia (${fmtKb(o.doneBytes)} de ${fmtKb(o.totalBytes || o.doneBytes)})`, 88 + Math.round(6 * (o.totalBytes ? o.doneBytes / o.totalBytes : 1))) });
        if (!v.ok && !Array.isArray(v.diffs)) { state.cloud.last = { at: up.at, keys: up.keys.length, bytes: up.bytes, verified: false }; return cloudNote(`Se subió la copia (${up.keys.length} bloques), pero no pude verificarla al leerla de vuelta: ${v.error || 'sin detalle'}. Revisa la copia con «Restaurar» o vuelve a subir.`, 'bad'); }
        cloudProg('Limpiando trozos viejos', 94);
        const pr = await FP.cloud.pruneKeys(FP.productSync.PREFIX, new Set(bundle.keys || []), {});
        let gc = null;
        if (v.ok && pre.ok) gc = await autoCleanCloud(pre.refs);   // borrado automático de copias huérfanas tras una subida verificada
        state.cloud.last = { at: up.at, keys: up.keys.length, bytes: up.bytes, verified: v.ok };
        const prod = bundle.items ? ` Productos: ${(bundle.rows || 0).toLocaleString('es-MX')} renglones de venta (${fmtKb(bundle.bytes)} comprimidos).` : ' Sin productos cargados.';
        cloudNote(v.ok ? `Copia subida y verificada: ${up.keys.length} bloques de datos, ${fmtKb(up.bytes)}.${prod}${pr.ok ? '' : ' (No pude limpiar trozos viejos de productos.)'}${gcNote(gc, v.ok && pre.ok)}` : `Se subió, pero la verificación encontró diferencias: ${v.diffs.slice(0, 3).join('; ')}`, v.ok ? 'ok' : 'bad');
      }, 'upload', 'Preparando la copia');
    },
    'cloud-download'() {
      if (!window.confirm('Esto reemplaza en este navegador los bloques de datos que existan en la nube por la copia guardada. ¿Continuar?')) return;
      return cloudRun(async () => {
        cloudProg('Descargando la copia de la nube', 2);
        const d = await FP.cloud.download({ onProgress: (o) => cloudProg(`Descargando la copia (${fmtKb(o.doneBytes)} de ${fmtKb(o.totalBytes || o.doneBytes)})`, 2 + Math.round(58 * (o.totalBytes ? o.doneBytes / o.totalBytes : 1))) });
        if (!d.ok) return cloudNote(d.error, 'bad');
        if (!d.items.length) return cloudNote('No hay copia en la nube todavía. Primero usa «Subir copia a la nube».', 'warn');
        cloudProg('Guardando los bloques de datos', 60);
        let sv = 0;
        for (const it of d.items) { cloudProg(`Guardando los bloques de datos (${sv++} de ${d.items.length})`, 60 + Math.round(15 * sv / d.items.length)); if (FP.productSync.isKey(it.key)) continue; const env = it.envelope; storage.save(it.key, env && typeof env === 'object' && 'data' in env ? env.data : env); }
        cloudProg('Aplicando los datos en este navegador', 78);
        await repo.flush();
        const pr = await FP.productSync.restore(repo, d.items, { onProgress: (n, tot) => { if (tot > 0) cloudProg(`Restaurando productos (${Math.min(n + 1, tot)} de ${tot})`, 80 + Math.round(18 * n / tot)); } });
        state.cu.status = 'idle';
        if (!pr.ok) { cloudNote(`Se restauraron los datos generales, pero ${pr.error}`, 'bad'); state.cloud.restored = true; return; }
        cloudNote(`Copia restaurada: ${d.items.filter((i) => !FP.productSync.isKey(i.key)).length} bloques de datos.${pr.none ? '' : ` Productos: ${pr.rows.toLocaleString('es-MX')} renglones de venta y ${pr.funnel.toLocaleString('es-MX')} de funnel.`} Recarga para verlos aplicados.`, 'ok');
        state.cloud.restored = true;
      }, 'restore', 'Descargando la copia de la nube');
    },
    /* Limpiar nube: primero una vista previa (no borra nada); solo borra tras marcar la confirmación y pulsar «Borrar». */
    'cloud-gc-plan'() {
      const g = state.cloud.gc || {}; state.cloud.gc = { keepPrev: g.keepPrev !== false, confirm: false, plan: null };
      return cloudRun(async () => {
        cloudProg('Revisando qué hay en la nube', 10);
        const plan = await FP.cloud.planCleanup({ prevRefs: readPrevRefs(), keepPrevious: state.cloud.gc.keepPrev });
        if (!plan.ok) return cloudNote(plan.error, 'bad');
        state.cloud.gc.plan = plan; cloudNote('Revisión lista: abajo ves qué se borraría. Todavía no se borró nada.', 'ok');
      }, 'gc-plan', 'Revisando qué hay en la nube');
    },
    'cloud-gc-keep'(el) { const g = state.cloud.gc; if (!g) return; g.keepPrev = !!el.checked; g.confirm = false; return actions['cloud-gc-plan'](); },
    'cloud-gc-confirm'(el) { const g = state.cloud.gc; if (!g) return; g.confirm = !!el.checked; render(); },
    'cloud-gc-cancel'() { state.cloud.gc = null; cloudNote('Limpieza cancelada: no se borró nada.', null); render(); },
    'cloud-gc-run'() {
      const g = state.cloud.gc; if (!g || !g.plan || !g.confirm) return;
      const keys = g.plan.orphans.keys.slice(), bytes = g.plan.orphans.bytes;
      return cloudRun(async () => {
        const r = await FP.cloud.deleteChunks(keys, { onProgress: (o) => cloudProg(`Borrando copias viejas (${o.index} de ${o.of})`, 3 + Math.round(87 * o.index / o.of)) });
        if (!r.ok) return cloudNote(`Se borraron ${r.deleted || 0} lotes y luego falló: ${r.error}`, 'bad');
        cloudProg('Verificando la nube', 93);
        const chk = await FP.cloud.planCleanup({ prevRefs: readPrevRefs(), keepPrevious: g.keepPrev });
        const left = chk.ok ? chk.orphans.keys.length : null;
        state.cloud.gc = null;
        cloudNote(`Nube limpia: se borraron ${r.deleted} lotes viejos (${fmtKb(bytes)} de datos).${left === null ? '' : left ? ` Quedan ${left} lotes que no pude borrar.` : ' Verificado: no queda ningún lote huérfano.'}`, left ? 'bad' : 'ok');
      }, 'gc-run', 'Borrando copias viejas');
    },
    'cloud-delete'() {
      if (!window.confirm('Se borrará la copia de la nube de TODO tu equipo (todas las personas del equipo la comparten). Tus datos locales no se tocan. ¿Continuar?')) return;
      return cloudRun(async () => { const r = await FP.cloud.remove({ onProgress: (o) => cloudProg(`Borrando la copia (${o.index} de ${o.of} bloques de datos)`, 5 + Math.round(90 * o.index / o.of)) }); cloudNote(r.ok ? 'Copia de la nube eliminada.' : r.error, r.ok ? 'ok' : 'bad'); state.cloud.last = null; }, 'delete', 'Borrando la copia de la nube');
    },

    /* ----- Acceso por equipo: correo y contraseña (cuentas creadas por la persona administradora) ----- */
    'login-open'() { openLoginFromMenu(); },
    'login-cancel'() { closeLogin(); },
    'entry-guest'() { entryContinueGuest(true); },
    'entry-login'() { openLogin(); },
    'entry-retry'() { entryCheckData({ announce: true }); },
    'entry-skip'() { entry.busy = false; entry.resolved = true; entryOfferTourIfEmpty(); },
    'entry-restore'() { return runRestore(); },
    'restore-cancel'() { if (restoreRun.ctl) restoreRun.ctl.abort(); },
    async 'login-submit'() {
      const email = ((document.getElementById('login-email') || {}).value || '').trim(), pw = (document.getElementById('login-password') || {}).value || '';
      const msg = document.getElementById('login-msg'), btn = document.querySelector('#login-dialog [data-action="login-submit"]');
      const say = (t, bad) => { if (msg) { msg.textContent = t || ''; msg.hidden = !t; msg.className = 'note' + (bad ? ' note--warning' : ''); } };
      if (btn) btn.disabled = true; say('Entrando…');
      let r; try { r = await FP.cloud.loginPassword(email, pw, {}); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
      if (btn) btn.disabled = false;
      if (!r.ok) { say(r.error, true); return; }
      const pwEl = document.getElementById('login-password'); if (pwEl) pwEl.value = '';
      entry.busy = true; entry.loginOk = true; closeLoginQuiet(); cloudRefreshSession(); prefSet('authChoice', 'team');
      cloudNote(`Entraste como ${r.session.email} · equipo ${r.session.team_name || 'sin nombre'}. Usa «Restaurar desde la nube» para traer los datos del equipo.`, 'ok');
      render();
      entry.loginOk = false;
      await entryCheckData({ announce: true });
    },
    'cloud-password-change'() {
      const a = (document.getElementById('cloud-pw-new') || {}).value || '', b = (document.getElementById('cloud-pw-new2') || {}).value || '';
      if (a !== b) { cloudNote('Las dos contraseñas nuevas no coinciden.', 'bad'); render(); return; }
      return cloudRun(async () => {
        const r = await FP.cloud.changePassword(a, {});
        cloudNote(r.ok ? 'Contraseña cambiada. Úsala la próxima vez que inicies sesión.' : r.error, r.ok ? 'ok' : 'bad');
      });
    },

    'cloud-auto-toggle'(el) {
      const on = !!el.checked; FP.cloud.setAuto(on); state.cloud.auto.on = on; state.cloud.auto.error = null;
      if (!on) { cloudNote('Sincronización automática apagada. Lo ya subido sigue en la nube.', 'ok'); render(); return; }
      return cloudRun(async () => {
        const pull = await FP.cloud.pullNewer(cloudWriter, FP.repository.isDataKey, {});
        if (pull.ok && pull.applied.length) { state.cloud.restored = true; state.cloud.auto.pulled = pull.applied; }
        const keys = (await cloudProvider.keys()).filter((k) => FP.cloud.isAutoKey(k, FP.repository.isDataKey) && !(pull.applied || []).includes(k));
        const r = await FP.cloud.pushKeys(cloudProvider, keys, {});
        if (!r.ok) { state.cloud.auto.error = r.error; return cloudNote(r.error, 'bad'); }
        state.cloud.auto.last = r.at;
        cloudNote(`Sincronización automática encendida. Subí ${r.pushed} ajuste(s)${pull.applied && pull.applied.length ? ` y traje ${pull.applied.length} más nuevos de la nube (recarga para aplicarlos)` : ''}.`, 'ok');
      });
    },
    /* Cerrar sesión (cuenta de equipo): borra de ESTE navegador los datos del equipo, tras comprobar que están respaldados en la nube. */
    'cloud-signout'() { return openSignout(); },
    'signout-cancel'() { closeSignout(); },
    'signout-upload'() { return signoutUpload(); },
    'signout-download'() { return signoutDownload(); },
    'signout-confirm'() { return signoutConfirm(); },
    'signout-ack'(el) { signout.ack = Boolean(el.checked); paintSignout(); },
    async 'storage-retry-writes'() {
      const st = await repo.retryFailed();
      state.persist = st; render();
      FP.ui.toast(st.state === 'failed' ? `Siguen ${st.failed} escritura(s) sin guardar: ${st.lastError || 'sin detalle'}. Exporta tus datos como respaldo.` : 'Guardado confirmado en IndexedDB.');
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
    'rc-open-channel'(el) {
      state.rc.settings.channel = el.dataset.channel; saveRecoverySettings(); render();
      const g = document.getElementById('rc-gap'); if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    'rc-alt-hyp'(el) { state.rc.altHyp = el.value; },
    'rc-alt-save'(el) {   // una ruta del plan de recuperación → escenario guardado (misma validación y motor que el simulador)
      const ro = state.rc.analysis && state.rc.analysis.recoveryOptions;
      const alt = ro && ro.alternatives.find((a) => a.id === el.dataset.id); if (!alt || !alt.feasible) return;
      const c = alt.changes, hypId = state.rc.altHyp !== undefined ? state.rc.altHyp : (state.rc.draft.hypothesisId || '');
      state.rc.draft = { ...state.rc.draft, trafficPct: +((c.trafficPct || 0) * 100).toFixed(4), crMode: c.crMode || 'pp', crValue: +((c.crValue || 0) * 100).toFixed(6),
        aovMode: 'pct', aovValue: +((c.aovValue || 0) * 100).toFixed(4), target: 'channel', hypothesisId: hypId, type: state.rc.draft.type || 'custom',
        name: `Recuperar ${Math.round(state.rc.settings.targetPct * 100)} % · ${alt.label}`, supersedes: null };
      ensureRecovery();   // recalcula la vista previa con esta ruta
      actions['rc-save-scenario']();
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
    /* Borrado de lo que el usuario eligió (escenarios guardados, acciones del plan, acciones propias del catálogo). Nunca las sugeridas. */
    'rc-delete-scenario'(el) {
      const rc = state.rc, sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === el.dataset.id);
      if (!sc) return;
      const linked = FP.actionPlan.actionsOfScenario(rc.plan, sc.scenarioId);
      const newer = rc.scenarioStore.scenarios.filter((s) => s.supersedes === sc.scenarioId);
      const msg = `¿Borrar el escenario "${sc.name}" (${sc.scenarioId})? Es una simulación: plan, forecast y reforecast no cambian.`
        + (linked.length ? `\n\n${linked.length} acción(es) del plan están ligadas a este escenario (${linked.map((a) => a.actionId).join(', ')}): se conservan, pero quedarán sin escenario y ya no se podrán medir contra él.` : '')
        + (newer.length ? `\n\nLa versión ${newer.map((s) => s.scenarioId).join(', ')} pasará a reemplazar a la versión anterior.` : '');
      if (!root.confirm(msg)) return;
      FP.scenarioEngine.deleteScenario(rc.scenarioStore, sc.scenarioId);
      const n = FP.actionPlan.unlinkScenario(rc.plan, sc.scenarioId);
      rc.selected = rc.selected.filter((x) => x !== sc.scenarioId);
      if (rc.actionScenario === sc.scenarioId) { rc.actionScenario = ''; rc.ai = { status: 'idle', actions: [], errors: [] }; }
      if (rc.draft && rc.draft.supersedes === sc.scenarioId) rc.draft = emptyDraft();
      saveScenarios(); if (n) saveActionPlan();
      render();
      FP.ui.toast(`Escenario ${sc.scenarioId} borrado${n ? `; ${n} acción(es) quedaron sin escenario` : ''}.`);
    },
    'rc-delete-action'(el) {
      const rc = state.rc, a = rc.plan.actions.find((x) => x.actionId === el.dataset.id);
      if (!a) return;
      const nm = FP.actionTracking.measurementsOf(rc.plan, a.actionId).length;
      if (!root.confirm(`¿Borrar la acción ${a.actionId} "${a.title}" del plan?${nm ? ` También se borran sus ${nm} medición(es) y su historial.` : ' También se borra su historial.'} No afecta al escenario ligado.`)) return;
      FP.actionPlan.deleteAction(rc.plan, a.actionId);
      if (rc.treeActionId === a.actionId) rc.treeActionId = null;
      saveActionPlan(); render();
      FP.ui.toast(`Acción ${a.actionId} borrada.`);
    },
    'rc-delete-custom'(el) {
      const rc = state.rc, a = rc.custom.find((x) => x.actionId === el.dataset.id);
      if (!a) return;
      const used = rc.plan.actions.filter((x) => x.catalogId === a.actionId).length;
      if (!root.confirm(`¿Quitar "${a.name}" de tu catálogo de acciones propias?${used ? ` ${used} acción(es) del plan se hicieron con ella y se conservan.` : ''}`)) return;
      rc.custom = FP.actionLibrary.removeCustom(rc.custom, a.actionId).custom;
      storage.save(K.actionLibraryCustom, rc.custom);
      render(); FP.ui.toast('Acción propia quitada del catálogo.');
    },
    'rc-action-scenario'(el) { state.rc.actionScenario = el.value; state.rc.ai = { status: 'idle', actions: [], errors: [] }; render(); },
    'rc-library-driver'(el) { state.rc.libraryDriver = el.value; render(); },
    'rc-add-action'(el) { addActionFrom(FP.actionLibrary.all(state.rc.custom).find((a) => a.actionId === el.dataset.id), 'catalog'); },
    'rc-add-ai-action'(el) {
      const a = state.rc.ai.actions[Number(el.dataset.index)];
      if (a) addActionFrom({ actionId: a.actionId, name: a.action, description: a.rationale, driver: a.relatedDriver, measurementMetric: a.relatedDriver,
        defaultWindowDays: null, signalIds: a.relatedSignals }, 'cohere');
    },
    /* ----- «Ampliar con IA»: plan de trabajo de una acción del catálogo (borrador editable; solo se guarda al agregarlo al plan) ----- */
    'rc-expand'(el) { return runExpand(el.dataset.id, state.rc.expandStyle || savedExpandStyle()); },
    'rc-expand-regen'() { const x = state.rc.expand; if (x) return runExpand(x.actionId, x.style); },
    'rc-expand-style'(el) {
      const x = state.rc.expand; if (!x || x.style === el.dataset.style) return;
      if (x.status === 'ready' && expandDirty() && !root.confirm('Cambiar el estilo vuelve a generar el borrador y se pierden tus ediciones. ¿Continuar?')) return;
      state.rc.expandStyle = el.dataset.style; try { localStorage.setItem('fp.v1:expandStyle', el.dataset.style); } catch (e) { /* solo conveniencia */ } return runExpand(x.actionId, el.dataset.style);
    },
    'rc-expand-tab'(el) {   // solo alterna lo visible: no se vuelve a pintar, así no se pierde lo que se esté editando
      const t = el.dataset.tab; document.querySelectorAll('#rcx .rcx-tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
      document.querySelectorAll('#rcx .rcx-pane').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    },
    'rc-expand-discard'() { state.rc.expand = null; render(); },
    'rc-expand-step-add'() { const x = state.rc.expand; if (!x || !x.draft) return; x.draft = collectExpand(); x.draft.steps.push({ text: '', owner: '', when: '' }); render(); },
    'rc-expand-step-del'(el) { const x = state.rc.expand; if (!x || !x.draft) return; x.draft = collectExpand(); if (x.draft.steps.length > 1) x.draft.steps.splice(Number(el.dataset.index), 1); render(); },
    'rc-expand-copy'() { const x = state.rc.expand; if (!x || !x.draft) return; copyText(FP.actionPlanView.detailText(expandTitle(x), collectExpand()), 'Plan copiado.'); },
    'rc-detail-copy'(el) { const a = state.rc.plan.actions.find((z) => z.actionId === el.dataset.id); if (a && a.detail) copyText(FP.actionPlanView.detailText(`${a.actionId} ${a.title}`, a.detail), 'Plan copiado.'); },
    'rc-expand-add'() {
      const x = state.rc.expand; if (!x || x.status !== 'ready') return;
      const item = (state.rc._catalogItems || []).find((a) => a.actionId === x.actionId); if (!item) { FP.ui.toast('La acción ya no está en el catálogo filtrado.'); return; }
      const d = collectExpand(); d.steps = d.steps.filter((st) => st.text);
      if (!d.objective || !d.steps.length) { FP.ui.toast('El plan necesita un objetivo y al menos un paso.'); return; }
      d.edited = JSON.stringify({ ...d, edited: false, generatedAt: null }) !== JSON.stringify({ ...x.original, edited: false, generatedAt: null });
      state.rc.expand = null;
      addActionFrom({ ...item, detail: d }, 'catalog');
    },
    'rc-add-custom'() {
      const v = (id) => document.getElementById(id).value;
      const r = FP.actionLibrary.validateCustom({ name: v('rc-cu-name'), driver: v('rc-cu-driver'), ownerArea: v('rc-cu-owner'), defaultWindowDays: v('rc-cu-days'), description: v('rc-cu-desc') });
      if (!r.ok) { FP.ui.toast(r.errors.join(' ')); return; }
      state.rc.custom.push(r.action);
      storage.save(K.actionLibraryCustom, state.rc.custom);
      clearDrafts('rc-cu-');
      render(); FP.ui.toast('Acción agregada al catálogo.');
    },
    async 'rc-ai'() {
      const rc = state.rc;
      const sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === rc.actionScenario);
      const hyp = sc ? rc.analysis.hypotheses.find((h) => h.id === sc.links.hypothesisId) : null;
      if (!FP.cohereConnection.isConfigured()) { FP.ui.toast('Inicia sesión (o pega tu API key de Cohere en Configuración de RevNavigator).'); return; }
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
      const isGoal = el.dataset.key === 'goalTarget';
      const r = isGoal ? FP.actionPlan.setGoalTarget(state.rc.plan, el.dataset.id, (el.dataset.pct ? Number(String(el.value).replace(/[\s,]/g, '')) / 100 : String(el.value).replace(/[\s,]/g, '')))
        : FP.actionPlan.updateAction(state.rc.plan, el.dataset.id, { [el.dataset.key]: el.value || null });
      if (r.ok && (el.dataset.key === 'startDate' || el.dataset.key === 'endDate')) FP.actionPlan.refreshGoal(state.rc.plan, el.dataset.id, state.rc.scenarioStore.scenarios);
      if (!r.ok) { render(); FP.ui.toast(r.error); return; }   // render: el selector vuelve al estado real (no se queda mostrando el rechazado)
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
    /** Evidencia a un clic: salta a la señal que respalda una hipótesis (abre «Ver todas» si hace falta), la resalta y deja volver. */
    'dx-evidence'(el) {
      const id = el.dataset.sig, run = state.dx.run;
      const idx = run ? run.signals.findIndex((x) => x.id === id) : -1;
      state.dx.evidenceFrom = el.dataset.hyp || null;
      if (idx >= 12) state.dx.showAllSignals = true;
      render();
      FP.diagnosticView.focusEvidence('sig-' + id);
    },
    'dx-evidence-driver'(el) {
      state.dx.evidenceFrom = el.dataset.hyp || null;
      render();
      FP.diagnosticView.focusEvidence('drv-' + el.dataset.driver, { openMore: 'tree' });
    },
    'p-mock-clientes'() {
      addProductStaged(FP.productImport.stage(FP.mockProducts.customersCase(), { fileName: 'productos_venta_con_clientes_demo.csv', kind: 'sales' }));
      root.location.hash = '#carga';
    },
    'chg-mode'(el) { state.cx.mode = el.dataset.mode; render(); },
    async 'chg-owner'(el) {
      const mail = state.cx.sync && state.cx.sync.userEmail; if (el.dataset.own === '1' && !mail) return;
      const r = await FP.changeStore.update(el.dataset.key, { owner_email: el.dataset.own === '1' ? mail : null });
      if (!r.ok) root.alert(r.error);
      state.cx.key = null; render();
    },
    'dx-evidence-back'() {
      const id = state.dx.evidenceFrom; state.dx.evidenceFrom = null; render();
      FP.diagnosticView.focusEvidence('hyp-' + id);
    },
    'dx-toggle-signals'() { state.dx.showAllSignals = !state.dx.showAllSignals; render(); },
    async 'dx-proxy-test'() {
      state.dx.proxyTest = { busy: true, msg: null, ok: false }; render();
      const r = await FP.cohereClient.chatJson({ system: 'Responde únicamente con JSON.', user: 'Devuelve {"ok": true}.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, model: state.dx.model || undefined, audit: { purpose: 'Prueba de conexión' } });
      state.dx.proxyTest = { busy: false, ok: r.ok, msg: r.ok ? `Funciona: Cohere respondió por ${r.via === 'server' ? 'el servidor del equipo' : 'este navegador (respaldo)'}.` : (r.errors && r.errors[0]) || 'No respondió.' };
      render();
    },
    'dx-key-clear'() {
      state.dx.apiKey = ''; state.dx.rememberKey = false; saveDiagnosticSettings();
      FP.ui.toast('La API key se quitó de este navegador. Para volver a usar Cohere, pega una nueva.'); render();
    },
    'dx-key'(el) { state.dx.apiKey = el.value.trim(); saveDiagnosticSettings(); },
    'dx-remember'(el) { state.dx.rememberKey = el.checked; saveDiagnosticSettings(); render(); },
    'dx-model'(el) { state.dx.model = el.value.trim() || C.diagnostics.cohere.model; saveDiagnosticSettings(); },
    async 'dx-ai'() {
      const d = ensureDiagnostic();
      const keyInput = document.getElementById('dx-key-input');   // vive en Configuración: solo se lee si está a la vista (si no, manda el estado)
      const key = keyInput && keyInput.offsetParent !== null ? keyInput.value : undefined;
      if (key !== undefined) state.dx.apiKey = key.trim();
      if (!FP.cohereConnection.isConfigured()) { FP.ui.toast('Inicia sesión (o pega tu API key de Cohere en Configuración de RevNavigator) para generar hipótesis con IA.'); return; }
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
      if (!FP.cohereConnection.isConfigured()) { FP.ui.toast('Inicia sesión (o pega tu API key de Cohere en Configuración de RevNavigator) para redactar con IA.'); return; }
      state.nx.ai = { status: 'busy', result: null, errors: [] };
      render();
      const result = await FP.cohereNarrative.narrate(n, { apiKey: state.dx.apiKey, model: state.dx.model });
      if (state.nx.narrative !== n) return; // la narrativa cambió mientras esperábamos
      state.nx.ai = result;
      render();
      FP.ui.toast(result.ok ? 'Cohere redactó la narrativa; se validó contra las cifras calculadas.' : 'Análisis con IA no disponible; la narrativa determinística sigue completa.');
    },
    'nx-sig-more'(el) {
      const s = state.nx.sigShown || (state.nx.sigShown = { pos: 5, neg: 5, neu: 5 }), k = el.dataset.col;
      if (!(k in s)) return;
      s[k] = el.dataset.dir === 'less' ? 5 : s[k] + 5;
      FP.narrativeView.render(state);
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
    /* Selector global «Datos al» (encabezado): fija la fecha de referencia que ya usan Pacing, Forecast, Reforecast, Diagnóstico y Recovery. */
    'set-ref-date'(el) {
      const v = el.value;
      if (!v) { delete state.fc.settings.referenceDate; saveForecastSettings(); state.fc.run = null; render(); return; }
      if (!Cal.isValidISODate(v)) { FP.ui.toast('Fecha inválida.'); render(); return; }
      const y = Number(v.slice(0, 4));
      if (y < 2000 || y > 2100) return;   // al teclear el año dígito por dígito el navegador pasa por 0002, 0020, 0202…: se ignora sin redibujar
      if (y !== state.year) { loadYearScoped(y); refresh(); resetPeriod(); state.ux.home.follow = true; }
      state.fc.settings.referenceDate = v;
      saveForecastSettings(); state.fc.run = null; state.rf.run = null;
      render();
      if (state.ux.refOpen) setTimeout(() => { const i = document.getElementById('topbar-date'); if (i) i.focus(); }, 0);
      FP.ui.toast(`Reporte calculado al ${v}.`);
    },
    'fc-ref-last'() {
      if (!state.fc.lastActualDate) return;
      state.fc.settings.referenceDate = state.fc.lastActualDate;
      state.ux.refOpen = false; saveForecastSettings(); state.fc.run = null; render();
      FP.ui.toast(`Fecha de referencia fijada en ${state.fc.lastActualDate}, último día con real.`);
    },
    'ref-toggle'() { state.ux.refOpen = !state.ux.refOpen; render(); if (state.ux.refOpen) setTimeout(() => { const i = document.getElementById('topbar-date'); if (i) i.focus(); }, 0); },
    'fc-ref-today'() { state.ux.refOpen = false; delete state.fc.settings.referenceDate; saveForecastSettings(); state.fc.run = null; render(); },
    'fc-backtest'() {
      const run = ensureForecast();
      const planVersion = FP.planning.getOriginalPlan(state.planning.registry);
      state.fc.backtest = { stamp: run.generatedAt, data: FP.forecastEngine.backtest({ year: state.year, store: state.store, planVersion,
        dataset: planVersion ? null : state.dataset, events: state.events, settings: state.fc.settings }) };
      render();
    },
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
      ps.previewSig = FP.planningView.inputSig(state);
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

    'seg-min'(el) { const sg = state.seg || (state.seg = {}); const d = sg.dimension; sg.minByDim = { ...(sg.minByDim || {}), [d]: el.value === '' || el.value === undefined ? null : Math.max(1, Number(el.value) || 0) || null }; render(); },
    'seg-dim'(el) { (state.seg || (state.seg = {})).dimension = el.value || el.dataset.value; render(); },
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
      if (k === 'periodType') { dx.periodType = v; dx.periodKey = null; rc.periodType = v; rc.periodKey = null; state.ux.ctx.periodType = v; state.ux.ctx.periodKey = null; }
      else if (k === 'periodKey') { dx.periodKey = v; rc.periodKey = v; state.ux.ctx.periodKey = v; }
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
    /** Antes de generar: si el corte es posterior al último día con venta real cargada, se avisa y se deja decidir (no se oculta ni se inventa dato). */
    async 'rp-generate'() {
      const rp = state.rp; if (rp.status === 'busy') return;
      if (!rp.gapOk) {
        let cut = null; try { const r = ensureForecast(); cut = r && r.cutoff; } catch (e) { /* sin forecast no hay corte que comparar */ }
        const last = lastActualDate(), pm = FP.productStore && FP.productStore.available && FP.productStore.available() ? (FP.productStore.meta || {}) : {};
        if (cut && last && last < cut) { rp.gap = { cutoff: cut, last, products: pm.dateMax || null, days: Math.round((Date.parse(cut + 'T00:00:00Z') - Date.parse(last + 'T00:00:00Z')) / 864e5) }; render(); return; }
      }
      rp.gap = null; rp.gapOk = false;
      rp.status = 'busy'; rp.error = null; FP.reportView.render(state);
      try { rp.report = await buildExecutiveReport(); rp.report.context.lastActual = lastActualDate(); rp.sig = FP.reportView.signature(state); rp.at = new Date().toISOString(); rp.status = 'ready'; FP.ui.toast(`Presentación lista: ${rp.report.total} página${rp.report.total === 1 ? '' : 's'}${rp.report.omitted.length ? `, ${rp.report.omitted.length} sin datos suficientes (ver anexo)` : ''}.`); }
      catch (e) { rp.status = 'error'; rp.error = e && e.message ? e.message : String(e); }
      render();
    },
    async 'rp-gap-go'() { state.rp.gapOk = true; state.rp.gap = null; await actions['rp-generate'](); },
    'rp-gap-last'() { state.rp.gap = null; state.rp.gapOk = false; actions['fc-ref-last'](); },
    'rp-gap-load'() { state.rp.gap = null; root.location.hash = 'carga'; },
    'rp-gap-cancel'() { state.rp.gap = null; render(); },
    'rp-print'() { const rp = state.rp; if (rp.report) FP.reportView.print(rp.report, { exclude: rp.exclude, tags: rp.options.showTags }); },
    'rp-toggle-page'(el) { const rp = state.rp, id = el.dataset.id; rp.exclude = rp.exclude.includes(id) ? rp.exclude.filter((x) => x !== id) : [...rp.exclude, id]; render(); },
    'rp-filter'(el) { const f = FP.productFilter.cascade(state.rp.filter || {}, el.dataset.key, el.value); state.rp.filter = Object.keys(f).length ? f : null; render(); },
    'rp-filter-clear'() { state.rp.filter = null; render(); },
    'rp-option'(el) { state.rp.options[el.dataset.key] = Boolean(el.checked); render(); },
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
      invalidatePlanning();
      render();
    },

    /* ---- Supuestos de arranque (Fase 14): forma estándar, AOV general, CR con fuente ---- */
    'ss-toggle'(el) { const ss = ssGet('standardShape'); ss.enabled = el.checked; ssSave(); },
    'ss-dow'(el) {
      const v = FP.normalize.normalizeNumber(el.value).value;
      if (v === null || v <= 0) { FP.ui.toast('El factor debe ser mayor a 0 (1 = día normal).'); render(); return; }
      const ss = ssGet('standardShape'); ss.dayOfWeek[+el.dataset.i] = v; ssSave();
    },
    'ss-event-add'() { const ss = ssGet('standardShape'); ss.events.push({ name: '', from: '', to: '', factor: 1 }); ssSave(); },
    'ss-event-del'(el) { const ss = ssGet('standardShape'); ss.events.splice(+el.dataset.i, 1); ssSave(); },
    'ss-event-set'(el) {
      const ss = ssGet('standardShape'), e = ss.events[+el.dataset.i], f = el.dataset.f;
      if (!e) return;
      if (f === 'name') e.name = el.value.trim();
      else if (f === 'factor') {
        const v = FP.normalize.normalizeNumber(el.value).value;
        if (v === null || v <= 0) { FP.ui.toast('El factor debe ser mayor a 0 (1 = día normal).'); render(); return; }
        e.factor = v;
      } else {
        const t = el.value.trim();
        if (t !== '' && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t)) { FP.ui.toast('Escribe la fecha como MM-DD, por ejemplo 11-13.'); render(); return; }
        e[f] = t;
      }
      ssSave();
    },
    'gaov-mode'(el) { ssGet('generalAov').mode = el.value === 'lines' ? 'lines' : 'manual'; ssSave(); },
    'gaov-value'(el) {
      const raw = el.value.trim();
      const v = raw === '' ? null : FP.normalize.normalizeNumber(raw).value;
      if (raw !== '' && (v === null || v <= 0)) { FP.ui.toast('El AOV debe ser mayor a 0.'); render(); return; }
      ssGet('generalAov').value = v; ssSave();
    },
    'gaov-source'(el) { ssGet('generalAov').source = el.value; ssSave(); },
    'gaov-ref'(el) { ssGet('generalAov').ref = el.value.trim(); ssSave(); },
    'gaov-line-add'() { ssGet('generalAov').lines.push({ name: '', aov: null, share: null }); ssSave(); },
    'gaov-line-del'(el) { ssGet('generalAov').lines.splice(+el.dataset.i, 1); ssSave(); },
    'gaov-line-set'(el) {
      const g = ssGet('generalAov'), l = g.lines[+el.dataset.i], f = el.dataset.f;
      if (!l) return;
      if (f === 'name') l.name = el.value.trim();
      else {
        const raw = el.value.trim();
        const v = raw === '' ? null : FP.normalize.normalizeNumber(raw).value;
        if (raw !== '' && (v === null || v < 0 || (f === 'share' && v > 100))) { FP.ui.toast(f === 'share' ? 'El % de pedidos va de 0 a 100.' : 'El AOV debe ser mayor a 0.'); render(); return; }
        l[f] = v;
      }
      ssSave();
    },
    'cr-pct'(el) {
      const raw = el.value.trim();
      const v = raw === '' ? null : FP.normalize.normalizeNumber(raw).value;
      if (raw !== '' && (v === null || v <= 0 || v > 100)) { FP.ui.toast('El CR va de 0 a 100 %. Ejemplo: 1.5'); render(); return; }
      const s = state.planning.settings;
      s.assumptions = s.assumptions || {};
      s.assumptions[el.dataset.channel] = { ...(s.assumptions[el.dataset.channel] || {}), conversionRate: v === null ? null : Math.round(v * 1e4) / 1e6 };
      ssSave();
    },
    'cr-source'(el) { const cs = ssGet('crSource'); cs[el.dataset.channel] = { ...cs[el.dataset.channel], type: el.value }; ssSave(); },
    'cr-ref'(el) { const cs = ssGet('crSource'); cs[el.dataset.channel] = { ...cs[el.dataset.channel], ref: el.value.trim() }; ssSave(); },

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
    // por canal: monto («151M») o parte del total («58%»); lo que se guarda siempre es el monto
    C.channels.forEach((c) => {
      const raw = String(fd.get(c.id) || '').trim();
      const r = FP.format.parseShareInput(raw, next.annual.revenue);
      if (r.error === 'no_total') bad.push(`${c.label} (para usar % captura primero la meta anual)`);
      else if (r.error) bad.push(c.label);
      next.byChannel[c.id].revenue = r.error ? null : r.value;
      // si lo escribió como %, se recuerda: al cambiar la meta anual total, ese canal sigue siendo el mismo % del nuevo total
      if (!r.error && r.kind === 'pct' && r.value !== null) {
        next.channelShare = next.channelShare || {};
        next.channelShare[c.id] = Number(raw.replace('%', '').replace(/\s+/g, '').replace(/,/g, ''));
      }
    });
    if (bad.length) { FP.ui.toast(`Revisa estos montos: ${bad.join(', ')}. Usa números como 261000000 o 261M.`); return; }
    ['byMonth', 'byWeek', 'byDay'].forEach((k) => { next[k] = state.targets[k] || {}; });
    next.updatedAt = new Date().toISOString();
    state.targets = next;
    saveYearScoped();
    render();
    FP.ui.toast('Metas guardadas');
  }

  /** Recorrido guiado: activa el paso y navega a su vista. */
  /* ---------- Entrada: un único flujo (bienvenida → acceso → comprobación de datos → recorrido) ----------
     Nunca hay dos diálogos abiertos a la vez: cada paso cierra el anterior antes de abrir el siguiente.
     Preferencias (envoltorio estándar de storage, claves fp.v1:authChoice y fp.v1:onboardingDone):
       authChoice: 'guest' (continuó sin sesión) o 'team' (completó el acceso con éxito); onboardingDone: '1' al elegir tipo de uso. */
  const entry = { step: '', busy: false, resolved: false, fromEntry: false, cloudHas: null, cloudError: null, noTour: false };
  const prefGet = (k) => { const e = storage.load(k); return e ? e.data : null; };
  const prefSet = (k, v) => storage.save(k, v);
  const localHasData = (st) => Boolean(st.data.historical || st.data.actual || st.targets.defined);
  /** ¿Se puede afirmar que no hay datos locales? Si el almacenamiento falló no se puede: no se trata como vacío. */
  const localConfirmable = () => !(state.storage && state.storage.mode === 'unavailable');
  const entryStatus = () => { try { return FP.contextEngine.collectStatus(state); } catch (e) { return null; } };
  function closeEntry() { const d = document.getElementById('entry-dialog'); if (d) { try { d.close(); } catch (e) { /* ya cerrado */ } d.remove(); } }
  function entryDialog(html) {
    closeEntry(); closeLoginQuiet();
    const d = document.createElement('dialog'); d.id = 'entry-dialog'; d.className = 'tour-offer login-dialog entry-dialog'; d.setAttribute('aria-labelledby', 'entry-t');
    d.innerHTML = html;
    d.addEventListener('cancel', (e) => {   // Esc: equivale a la salida «neutra» de cada paso, sin dejar el flujo a medias
      e.preventDefault();
      if (entry.step === 'restoring') { if (restoreRun.ctl) restoreRun.ctl.abort(); return; }   // solo se cancela mientras se descarga; al guardar no
      if (entry.busy) return;
      if (entry.step === 'welcome') entryContinueGuest(false); else { entry.resolved = true; entryOfferTourIfEmpty(); }
    });
    document.body.appendChild(d);
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    const f = d.querySelector('[autofocus],button'); if (f) f.focus();
    return d;
  }
  function openWelcome() {
    entry.fromEntry = true; entry.step = 'welcome';
    entryDialog(`<p class="tour-offer__eyebrow">RevNavigator</p><h2 id="entry-t">Bienvenido a RevNavigator</h2>
      <p>Inicia sesión para ver los datos de tu equipo, o continúa sin sesión y empieza desde cero.</p>
      <div class="tour-offer__btns"><button type="button" class="btn btn--primary" data-action="entry-guest" autofocus>Continuar sin sesión</button><button type="button" class="btn" data-action="entry-login">Iniciar sesión con el equipo</button></div>`);
  }
  function openLoading() { entry.busy = true; entry.step = 'loading'; entryDialog(`<p class="tour-offer__eyebrow">Acceso por equipo</p><h2 id="entry-t">Cargando datos del equipo…</h2>${FP.ui.loader.html({ id: 'entry-progress', label: 'Comprobando si tu equipo ya tiene datos', pct: null, t0: Date.now(), hint: 'No cambio nada de lo que tienes aquí.' })}`); }
  function openEntryError(msg) {
    entry.busy = false; entry.step = 'error';
    entryDialog(`<p class="tour-offer__eyebrow">Acceso por equipo</p><h2 id="entry-t">No pude comprobar los datos del equipo</h2><p role="alert">${FP.ui.helpers.esc(msg || 'Sin detalle.')} No digo que tu cuenta esté vacía porque no lo pude comprobar.</p>
      <div class="tour-offer__btns"><button type="button" class="btn btn--primary" data-action="entry-retry" autofocus>Reintentar</button><button type="button" class="btn" data-action="entry-skip">Continuar sin comprobar</button></div>`);
  }
  function openCloudHasData() {
    entry.busy = false; entry.step = 'cloud';
    entryDialog(`<p class="tour-offer__eyebrow">Acceso por equipo</p><h2 id="entry-t">Tu equipo tiene datos en la nube</h2><p>Aquí en este navegador todavía no hay datos. Puedes traer la copia del equipo ahora o hacerlo después desde Configuración → Cuenta y nube. No se restaura nada sin tu confirmación.</p>
      <div class="tour-offer__btns"><button type="button" class="btn btn--primary" data-action="entry-restore" autofocus>Restaurar desde la nube</button><button type="button" class="btn" data-action="entry-skip">Más tarde</button></div>`);
  }
  /** Sin datos locales y sin restaurar (Más tarde, cancelar, continuar sin comprobar): se ofrece el recorrido; con datos, no. */
  function entryOfferTourIfEmpty() {
    closeEntry(); const st = entryStatus();
    if (localConfirmable() && st && !localHasData(st)) { state.ux.tourOffered = true; saveUx(); offerTour(true); } else render();
  }
  /* ----- Restaurar desde la nube con avance (barra real por bytes, tiempo estimado y cancelar solo mientras se descarga) ----- */
  const restoreRun = { ctl: null };
  const RESTORE_STAGES = ['Descargando de la nube', 'Guardando en este navegador', 'Preparando tus pantallas'];
  function openRestoring() {
    entry.busy = true; entry.step = 'restoring';
    entryDialog(`<p class="tour-offer__eyebrow">Restaurando copia del equipo</p><h2 id="entry-t">Cargando tus datos…</h2>
      <p class="mut">Espera un momento, esto puede tardar unos minutos según el tamaño de tu copia. No cierres esta ventana.</p>
      ${FP.ui.loader.html({ id: 'rs-bar', title: 'Avance de la restauración', label: RESTORE_STAGES[0], pct: 0, t0: Date.now() })}
      <ol class="rs__stages" id="rs-stages">${RESTORE_STAGES.map((t) => `<li><span class="rs__ic">○</span>${t}</li>`).join('')}</ol>
      <p class="visually-hidden" id="rs-live" role="status" aria-live="polite"></p>
      <div class="tour-offer__btns"><button type="button" class="btn" id="rs-cancel" data-action="restore-cancel">Cancelar</button></div>`);
  }
  let rsLastSay = -1;
  function paintRestore(pct, stage, eta) {
    const $ = (id) => document.getElementById(id); if (!$('rs-bar')) return;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    FP.ui.loader.update('rs-bar', { label: RESTORE_STAGES[stage], pct: v });   // % real por bytes; reloj y «faltan» los calcula el loader
    if (stage > 0) { const t = document.querySelector('#rs-bar .ldr__time'); if (t) t.textContent += ' · esto ya no se puede cancelar'; }
    [...$('rs-stages').children].forEach((li, i) => { li.className = i < stage ? 'done' : i === stage ? 'on' : ''; li.firstChild.textContent = i < stage ? '✓' : i === stage ? '●' : '○'; });
    const c = $('rs-cancel'); if (c) { c.disabled = stage > 0; c.hidden = stage > 0; }
    if (v >= rsLastSay + 25 || v === 100) { rsLastSay = v; $('rs-live').textContent = `${v} por ciento. ${RESTORE_STAGES[stage]}.`; }
  }
  function openRestoreError(msg) {
    entry.busy = false; entry.step = 'restore-error';
    entryDialog(`<p class="tour-offer__eyebrow">Restaurando copia del equipo</p><h2 id="entry-t">No pude terminar la carga</h2><p role="alert">${FP.ui.helpers.esc(msg || 'Sin detalle.')} No se aplicó nada: tus datos locales siguen como estaban.</p>
      <div class="tour-offer__btns"><button type="button" class="btn btn--primary" data-action="entry-restore" autofocus>Reintentar</button><button type="button" class="btn" data-action="entry-skip">Continuar sin restaurar</button></div>`);
  }
  async function runRestore() {
    if (restoreRun.ctl) return;
    openRestoring(); rsLastSay = -1; paintRestore(0, 0);
    const ctl = new AbortController(); restoreRun.ctl = ctl; const t0 = Date.now();
    let d;
    try {
      d = await FP.cloud.downloadProgress({ signal: ctl.signal, onProgress: (p) => {
        const f = p.totalBytes ? p.doneBytes / p.totalBytes : 0, el = Date.now() - t0;
        paintRestore(70 * f, 0);
      } });
    } catch (e) { d = { ok: false, error: String(e && e.message || e) }; }
    restoreRun.ctl = null;
    if (d.aborted) { entry.busy = false; entry.resolved = true; entryOfferTourIfEmpty(); return; }
    if (!d.ok) return openRestoreError(d.error);
    if (!d.items.length) return openRestoreError('La nube no tiene copia todavía.');
    try {
      paintRestore(72, 1);
      await repo.flush();
      const pr = await FP.productSync.restore(repo, d.items, { onProgress: (i, n) => paintRestore(72 + 22 * (i / Math.max(1, n)), 1) });   // productos primero: valida antes de tocar nada
      if (!pr.ok) return openRestoreError(pr.error);
      for (const it of d.items) { if (FP.productSync.isKey(it.key)) continue; const env = it.envelope; storage.save(it.key, env && typeof env === 'object' && 'data' in env ? env.data : env); }
      await repo.flush();
      paintRestore(96, 2);
    } catch (e) { return openRestoreError(`Falló el guardado: ${e && e.message || e}`); }
    state.ux.tourOffered = true; saveUx(); prefSet('authChoice', 'team'); state.cu.status = 'idle';
    paintRestore(100, 2);
    const h = document.getElementById('entry-t'); if (h) h.textContent = '✓ Datos cargados';
    setTimeout(() => root.location.reload(), 700);   // se recarga: config.js lee parte de los datos al arrancar. Con datos locales no sale la pregunta de los cuatro escenarios
  }

  /** Comprueba (solo lectura) si el equipo tiene datos en la nube y decide el siguiente paso. */
  async function entryCheckData({ announce }) {
    const st0 = entryStatus();
    if (st0 && localHasData(st0)) { entry.resolved = true; entry.busy = false; closeEntry(); render(); return; }   // con datos locales no hace falta consultar
    if (announce) openLoading(); else entry.busy = true;
    let r; try { r = await FP.cloud.listKeys({}); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
    if (!r.ok) { entry.cloudError = r.error; openEntryError(r.error); return; }
    entry.cloudError = null;
    const has = r.keys.some((k) => (FP.repository.isDataKey && FP.repository.isDataKey(k)) || (FP.productSync.isKey && FP.productSync.isKey(k)));
    entry.cloudHas = has; entry.resolved = true; entry.busy = false;
    if (has) { openCloudHasData(); return; }
    closeEntry();
    const st = entryStatus();
    if (localConfirmable() && st && !localHasData(st)) { state.ux.tourOffered = true; saveUx(); offerTour(true); } else render();
  }
  function entryContinueGuest(persist = true) {
    if (persist) prefSet('authChoice', 'guest'); entry.busy = false; entry.resolved = true; closeEntry();
    const st = entryStatus();
    if (localConfirmable() && st && !localHasData(st)) { state.ux.tourOffered = true; saveUx(); offerTour(true); }
  }
  /** Arranque: decide qué entrada corresponde. Se llama antes del primer render. */
  function entryBoot() {
    const https = root.location && root.location.protocol === 'https:';
    if (!https) { entry.resolved = true; return; }   // sin https (archivo local o pruebas) no hay acceso por equipo: queda la bienvenida clásica por datos
    if (state.cloud.session) {
      // sesión activa: con datos locales entra directo; sin ellos se consulta la nube antes de decidir el recorrido
      const st = entryStatus();
      if (!st || localHasData(st)) { entry.resolved = true; return; }
      entry.busy = true; setTimeout(() => entryCheckData({ announce: false }), 0); return;
    }
    entry.resolved = true;
    try {
      if (prefGet('authChoice') === 'guest') return;                     // ya eligió continuar sin sesión: no se le insiste
      if (root.sessionStorage.getItem('fp.loginAsked') === '1') return;  // una vez por visita
      root.sessionStorage.setItem('fp.loginAsked', '1');
    } catch (e) { return; }
    openWelcome();
  }

  /** Ventana de inicio de sesión (correo y contraseña). Sin registro: las cuentas las crea la persona administradora. */
  function closeLoginQuiet() { const d = document.getElementById('login-dialog'); if (d) { d.removeEventListener('close', onLoginClose); try { d.close(); } catch (e) { /* ya cerrada */ } d.remove(); } }
  function closeLogin() { const d = document.getElementById('login-dialog'); if (d) { closeLoginQuiet(); afterLoginClosed(); } }
  function onLoginClose() { const d = document.getElementById('login-dialog'); if (d) d.remove(); afterLoginClosed(); }
  /** Al cerrarse el acceso sin entrar (Esc o «Ahora no»): si venía de la bienvenida se vuelve a ella; si no, se retoma lo que estaba en espera. */
  function afterLoginClosed() {
    if (entry.loginOk) return;
    if (entry.fromEntry && !state.cloud.session) { openWelcome(); return; }
    try { maybeOfferTourFirstTime(FP.contextEngine.collectStatus(state)); } catch (e) { /* sin estado todavía */ }
  }
  function openLogin() {
    closeEntry(); closeLoginQuiet(); entry.loginOk = false;
    const d = document.createElement('dialog'); d.id = 'login-dialog'; d.className = 'tour-offer login-dialog'; d.setAttribute('aria-labelledby', 'login-t');
    d.innerHTML = `<form id="login-form" novalidate><p class="tour-offer__eyebrow">Acceso por equipo</p><h2 id="login-t">Inicia sesión</h2>
      <p class="field__hint">Entra con la cuenta que te dio la persona administradora. No hay registro abierto. Con tu sesión ves y guardas los mismos datos que tu equipo.</p>
      <div class="field"><label for="login-email">Correo</label><input id="login-email" type="email" autocomplete="username" placeholder="tu@empresa.com"></div>
      <div class="field"><label for="login-password">Contraseña</label><input id="login-password" type="password" autocomplete="current-password"></div>
      <p class="note" id="login-msg" role="status" hidden></p>
      <div class="tour-offer__btns"><button type="submit" class="btn btn--primary" data-action="login-submit">Entrar</button><button type="button" class="btn" data-action="login-cancel">Ahora no</button></div></form>`;
    d.addEventListener('close', onLoginClose);
    d.querySelector('#login-form').addEventListener('submit', (e) => { e.preventDefault(); actions['login-submit'](); });
    document.body.appendChild(d);
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    const em = d.querySelector('#login-email'); if (em) em.focus();
  }
  /** Acceso desde menú/Configuración: no pasa por la bienvenida. */
  function openLoginFromMenu() { entry.fromEntry = false; openLogin(); }
  /** Al arrancar en el sitio publicado (https) sin sesión se ofrece la bienvenida una vez por visita (ver entryBoot). */
  function maybePromptLogin() { entryBoot(); }

  /** Al activar el Modo Aprendiz se ofrece el recorrido guiado (ventana con foco atrapado; Esc o «Ahora no» la cierran). */
  function closeTourOffer() { const d = document.getElementById('tour-offer'); if (d) { try { d.close(); } catch (e) { /* ya cerrada */ } d.remove(); } }
  function offerTour(modal = true) {
    closeTourOffer();
    const d = document.createElement('dialog');
    d.id = 'tour-offer'; d.className = modal ? 'tour-offer' : 'tour-offer tour-offer--soft'; d.setAttribute('aria-labelledby', 'tour-offer-t');
    const cur = state.ux.tour.active ? state.ux.tour.path : null;
    // «Quiero ver un demo completo»: carga de verdad los datos de prueba (acción «generate-mock»); solo si no hay datos, para no mezclarlos con los reales
    const stNow = entryStatus(); const hasNow = !stNow || localHasData(stNow);
    const demoOpt = `<button type="button" class="tour-opt" data-action="tour-demo" ${hasNow ? 'disabled aria-disabled="true"' : ''}><b>Quiero ver un demo completo</b><span>${hasNow ? 'Ya tienes datos: el demo no se carga para no mezclarlos con los tuyos.' : 'Carga datos de prueba (plan y venta real de ejemplo) para recorrer toda la herramienta.'}</span><em>${hasNow ? 'No disponible con datos cargados' : 'Datos de prueba · se pueden borrar después'}</em></button>`;
    const opt = (p, t1, t2, t3) => `<button type="button" class="tour-opt${cur === p ? ' is-cur' : ''}" data-action="tour-path" data-path="${p}"${cur === p ? ' aria-current="true"' : ''}><b>${t1}</b><span>${t2}</span><em>${t3}</em></button>`;
    d.innerHTML = `<p class="tour-offer__eyebrow">${modal ? 'Recorrido guiado' : 'Bienvenido a RevNavigator'}</p><h2 id="tour-offer-t">¿Con qué datos cuentas hoy?</h2><p>Con tu respuesta te muestro solo los pasos que te sirven. Puedes cambiarla cuando quieras.</p>`
      + `<div class="tour-offer__opts">${opt('A', 'Ya tengo datos', 'Cuento con histórico y venta real del año.', `Recorrido completo · ${FP.guidanceConfig.TOUR.filter((x) => x.paths.includes('A')).length} pasos`)}${opt('B', 'Solo tengo histórico', 'Empiezo el año o aún no tengo venta real.', 'Histórico → Meta → Plan → Pacing en espera')}${opt('C', 'Soy una empresa nueva', 'Todavía no tengo datos de venta.', 'Meta → Plan → Cómo empezar a cargar datos')}${demoOpt}</div>`
      + '<div class="tour-offer__btns"><button type="button" class="btn" data-action="tour-offer-no">Ahora no</button></div>';
    d.addEventListener('close', () => d.remove());
    document.body.appendChild(d);
    if (modal && typeof d.showModal === 'function') d.showModal(); else if (typeof d.show === 'function') d.show(); else d.setAttribute('open', '');
  }
  let tourSyncDepth = 0;
  function tourGo(i, flash) {
    state.ux.tour = { ...state.ux.tour, active: true, step: i, collapsed: false, went: false, compact: false, flash: flash || '', ended: null, lastMicro: '', lastMicroTitle: '' };
    const v = FP.tour.steps()[i].view;
    if (root.location.hash === `#${v}` || state.view === v && !root.location.hash) render(); else root.location.hash = v;
  }
  /** Primera visita sin datos: se ofrece el recorrido una sola vez (ventana que no bloquea la pantalla). */
  function maybeOfferTourFirstTime(status) {
    if (state.ux.tourOffered || state.ux.tour.active) return;
    if (document.getElementById('login-dialog') || document.getElementById('entry-dialog') || entry.busy || !entry.resolved || entry.noTour) return;   // secuencia de arranque: primero el acceso; el recorrido espera
    if (!localConfirmable()) return;   // si no se pudo leer el almacenamiento no se asume que está vacío
    if (status.data.historical || status.data.actual || status.targets.defined) { state.ux.tourOffered = true; saveUx(); return; }
    state.ux.tourOffered = true; saveUx();
    offerTour(Boolean(root.location && root.location.protocol === 'https:'));   // en el sitio publicado (https) es modal con foco atrapado; en archivo local/pruebas sigue sin bloquear
  }


  /** Crea una acción del plan ligada al escenario (y su hipótesis) seleccionado. */
  /* ---------- Ampliar con IA: ayudas ---------- */
  const expandTitle = (x) => { const it = (state.rc._catalogItems || []).find((a) => a.actionId === x.actionId); return it ? it.name : x.actionId; };
  const byId = (id) => document.getElementById(id);
  const splitLines = (id) => ((byId(id) || {}).value || '').split('\n').map((t) => t.trim()).filter(Boolean);
  /** Lee el borrador tal como está en pantalla (lo que la persona editó). */
  function collectExpand() {
    const x = state.rc.expand, base = x && x.draft ? x.draft : { steps: [] };
    const steps = [...document.querySelectorAll('#rcx [data-rcx-step]')].map((row) => {
      const g = (k) => ((row.querySelector(`[data-k="${k}"]`) || {}).value || '').trim(); return { text: g('text'), owner: g('owner'), when: g('when') };
    });
    return { ...base, objective: ((byId('rcx-objective') || {}).value || '').trim(), steps, measure: ((byId('rcx-measure') || {}).value || '').trim(),
      dataToReview: splitLines('rcx-data'), risks: byId('rcx-risks') ? splitLines('rcx-risks') : (base.risks || []), dontDo: byId('rcx-dont') ? splitLines('rcx-dont') : (base.dontDo || []) };
  }
  function expandDirty() {
    const x = state.rc.expand; if (!x || !x.original) return false;
    const strip = (d) => JSON.stringify({ o: d.objective, s: d.steps, m: d.measure, d: d.dataToReview, r: d.risks, n: d.dontDo });
    return strip(collectExpand()) !== strip(x.original);
  }
  function copyText(text, msg) {
    const ok = () => FP.ui.toast(msg);
    try { if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, () => fallback()); return; } } catch (e) { /* sigue */ }
    fallback();
    function fallback() { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; } t.remove(); if (done) ok(); else FP.ui.toast('No pude copiar. Selecciona el texto y cópialo a mano.'); }
  }
  /** Estilo por defecto: Detallado; se recuerda el último elegido (solo conveniencia del navegador). */
  function savedExpandStyle() { try { const v = localStorage.getItem('fp.v1:expandStyle'); return v === 'summary' ? 'summary' : 'detailed'; } catch (e) { return 'detailed'; } }
  let expandToken = 0;
  async function runExpand(actionId, style) {
    const rc = state.rc;
    const item = (rc._catalogItems || []).find((a) => a.actionId === actionId);
    const sc = rc.scenarioStore.scenarios.find((s) => s.scenarioId === rc.actionScenario);
    if (!item || !sc || !sc.links.hypothesisId) { FP.ui.toast('Elige una acción y un escenario ligado a una hipótesis.'); return; }
    if (!FP.cohereConnection.isConfigured()) { FP.ui.toast('Inicia sesión (o pega tu API key de Cohere en Configuración de RevNavigator).'); return; }
    const token = ++expandToken;
    rc.expand = { actionId, style, status: 'busy', draft: null, original: null, errors: [] }; render();
    const hyp = rc.analysis.hypotheses.find((h) => h.id === sc.links.hypothesisId) || { id: sc.links.hypothesisId, hypothesis: sc.links.hypothesis, driver: sc.links.driver };
    const res = await FP.cohereActions.expandAction({ item, hypothesis: hyp, signals: rc.analysis.signals.filter((z) => (sc.links.signalIds || []).includes(z.id)), scenario: sc,
      availableDimensions: rc.analysis.dataQuality.availableTargets, constraints: rc.constraints, style,
      goal: FP.actionPlan.operativeGoalFrom(sc, (() => { const w = actionWindow(item); return { start: w.start, end: w.end }; })()) || FP.actionPlan.operativeGoalFrom(sc),
      channelLabel: FP.navigation && FP.navigation.contextLabel ? FP.navigation.contextLabel({ channel: rc.ctx.channel }) : '' }, { apiKey: state.dx.apiKey, model: state.dx.model });
    if (token !== expandToken || !rc.expand) return;   // se canceló o se pidió otro: se descarta esta respuesta
    rc.expand = res.ok ? { actionId, style, status: 'ready', draft: res.detail, original: JSON.parse(JSON.stringify(res.detail)), errors: [] }
      : { actionId, style, status: 'error', draft: null, original: null, errors: res.errors };
    render();
    if (res.ok) { const t = byId('rcx'); if (t && t.scrollIntoView) { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  }


  /* ---------- Panorama del asistente de Análisis: resumen por nivel (categoría, subcategoría, producto, estado, ciudad, sucursal, entrega) ----------
   * Mismo período y comparación del Análisis. Solo agregados ya calculados por el almacén (nada se recalcula en la IA); cada nivel trae
   * los principales que caen y crecen, y cuánto de la caída concentran los 3 primeros. Si un nivel no tiene datos cargados, se dice. */
  const PANORAMA_LEVELS = [['category', 'Categoría'], ['subcategory', 'Subcategoría'], ['product', 'Producto'], ['state', 'Estado'], ['city', 'Ciudad'], ['branch', 'Sucursal'], ['delivery', 'Tipo de entrega']];
  async function buildPanorama() {
    const an = state.an, ctx = an.context, cc = ctx && ctx.comparison;
    if (!FP.productStore || !FP.productStore.available() || !ctx || !cc || !cc.available || !cc.baseline || !cc.current) return { ok: false, error: 'El Análisis todavía no tiene un período comparable.' };
    const key = JSON.stringify([an.channel, an.metric, JSON.stringify(pageFilter()), cc.current.from, cc.current.to, cc.baseline.from, cc.baseline.to, FP.productStore.meta && FP.productStore.meta.dateMax]);
    if (an._panorama && an._panorama.key === key) return { ok: true, panorama: an._panorama.value };
    const metric = an.metric, ch = an.channel, round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null), missing = (e) => /^\(?\s*(sin|n\/?a|null|undefined|vac)/i.test(String(e)) || e === '';
    const levels = {};
    for (const [lv, label] of PANORAMA_LEVELS) {
      try {
        const [cur, base] = await Promise.all([aggF({ from: cc.current.from, to: cc.current.to, channel: ch, groupBy: lv }), aggF({ from: cc.baseline.from, to: cc.baseline.to, channel: ch, groupBy: lv })]);
        const c = sumMap(cur, metric), b = sumMap(base, metric), names = new Set([...c.values.keys(), ...b.values.keys()].filter((e) => !missing(e)));
        if (names.size < 2) { levels[lv] = { label, available: false, note: names.size ? 'Solo hay un valor en este nivel; no hay con qué comparar.' : 'No hay datos cargados para este nivel.' }; continue; }
        const rows = [...names].map((e) => { const cv = c.values.get(e), bv = b.values.get(e); const current = Number.isFinite(cv) ? cv : 0, previous = Number.isFinite(bv) ? bv : 0; return { entity: String(e), current: round(current), previous: round(previous), delta: round(current - previous), deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null, sharePct: c.total > 0 ? Math.round((current / c.total) * 1000) / 10 : null }; });
        const down = rows.filter((r) => r.delta < 0).sort((x, y) => x.delta - y.delta), up = rows.filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta);
        const downSum = down.reduce((t, r) => t + r.delta, 0), top3 = down.slice(0, 3).reduce((t, r) => t + r.delta, 0);
        levels[lv] = { label, available: true, entities: names.size, totalCurrent: round(c.total), totalPrevious: round(b.total), totalDelta: round(c.total - b.total), totalDeltaPct: b.total > 0 ? Math.round(((c.total - b.total) / b.total) * 1000) / 10 : null,
          topDecliners: down.slice(0, 5), topGrowers: up.slice(0, 3), decliningCount: down.length, growingCount: up.length,
          top3ShareOfDecline: downSum < 0 ? Math.round((top3 / downSum) * 1000) / 10 : null };
      } catch (e) { levels[lv] = { label, available: false, note: 'No se pudo calcular este nivel.' }; }
    }
    const value = { metric, channel: ch, current: cc.current.label, baseline: cc.baseline.label, currentPartial: Boolean(ctx.focus && ctx.focus.partial), levels,
      note: 'Resumen por nivel con el mismo período y comparación del Análisis. deltaPct y totalDeltaPct son % de cambio ya calculados; sharePct es el % del total del nivel. top3ShareOfDecline es el % de la caída (suma de entidades que cayeron) que concentran las 3 mayores.' };
    an._panorama = { key, value };
    return { ok: true, panorama: value };
  }
  const PANORAMA_RE = /panorama|categor|subcategor|estado|ciudad|sucursal|entrega|concentr|dependen|nivel/i;

  /** Ventana por defecto de una acción del catálogo (la misma que usa addActionFrom). */
  function actionWindow(item) {
    const rc = state.rc, today = Cal.toISODate(new Date()), win = item.defaultWindowDays || null;
    const start = rc.ctx.cutoff ? Cal.addDays(rc.ctx.cutoff, 1) : today;
    return { start, end: win ? Cal.addDays(start, win - 1) : rc.ctx.period.end, win, today };
  }
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
      startDate: start, endDate: win ? Cal.addDays(start, win - 1) : rc.ctx.period.end, detail: item.detail || null,
      operativeGoal: FP.actionPlan.operativeGoalFrom(sc, { start, end: win ? Cal.addDays(start, win - 1) : rc.ctx.period.end }) || FP.actionPlan.operativeGoalFrom(sc) || (item.detail && item.detail.operativeGoal) || null,
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
    // El paquete de análisis (.zip) vive ahora en Datos → Exportar datos: el enlace #paquete abre esa sección
    if (v === 'paquete') { v = 'datos'; state.datosSection = 'paquete'; try { root.history.replaceState(null, '', '#datos'); } catch (e) { /* file:// */ } }
    state.view = VIEWS.includes(v) ? v : 'inicio';
  }

  function bind() {
    document.addEventListener('change', async (e) => {
      const tt = e.target;
      if (tt && tt.getAttribute && tt.getAttribute('data-cu-f')) {
        const k = tt.getAttribute('data-cu-f'), f = state.cu.opts.filter = state.cu.opts.filter || {};
        f[k] = tt.value || undefined;
        if (k === 'category') { f.subcategory = undefined; f.product = undefined; } else if (k === 'subcategory') f.product = undefined; else if (k === 'state') f.branch = undefined;
        state.cu.status = 'idle'; render(); return;
      }
      if (tt && tt.getAttribute && tt.getAttribute('data-cu')) {
        const k = tt.getAttribute('data-cu');
        state.cu.opts[k] = k === 'channel' ? tt.value : Number(tt.value); state.cu.status = 'idle'; render(); return;
      }
      const t = e.target; if (!t || !t.closest || !t.closest('#chg-body')) return;
      const st = t.getAttribute('data-chg-status'), nt = t.getAttribute('data-chg-note');
      if (st === null && nt === null) return;
      const r = await FP.changeStore.update(st !== null ? st : nt, st !== null ? { status: t.value } : { note: t.value.trim() || null });
      if (!r.ok) root.alert(r.error);
      if (st !== null) { state.cx.key = null; render(); }
    });
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
    ['input', 'change'].forEach((ev) => document.addEventListener(ev, (e) => {   // borradores de formularios sin estado propio
      const t = e.target; if (t && t.dataset && t.dataset.draft !== undefined && t.id) drafts[t.id] = t.value;
    }));
    document.addEventListener('input', (e) => {   // reparto por canal en vivo (monto o %)
      if (e.target && e.target.closest && e.target.closest('#targets-form') && FP.ui.updateTargetHints) { FP.ui.markTargetsDraft(state); FP.ui.updateTargetHints(); }
    });
    document.addEventListener('input', (e) => {   // meta escrita a mano (sin histórico): avanza el micro-paso sin volver a dibujar el formulario
      if (e.target && e.target.id === 't-annual' && String(e.target.value).trim() !== '' && state.ux.tour.active && !(state.ux.tour.micro || {})['meta.total']) {
        FP.tour.mark(state, 'meta.total', false); const t = state.ux.tour; t.went = false; t.collapsed = false; t.flash = 'Hecho: Escribe tu meta anual total.'; t.lastMicro = 'meta.channels'; t.lastMicroTitle = 'Revisa el reparto por canal';
        FP.tour.render(state);
      }
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'targets-form') { e.preventDefault(); saveTargetsFromForm(e.target); }
    });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('input[data-action="glossary-search"]');
      if (el) FP.help.filterGlossary(el.value);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.body.classList.contains('nav-open')) FP.navigation.setDrawer(false);
      FP.help.close();
      if (state.ux.refOpen) { state.ux.refOpen = false; render(); const b = document.getElementById('topbar-ref'); if (b) b.focus(); }
    });
    document.addEventListener('click', (e) => {   // clic fuera del panel de fecha: se cierra
      if (state.ux.refOpen && !e.target.closest('.hdate')) { state.ux.refOpen = false; render(); }
    });
    root.addEventListener('hashchange', () => {
      state.ux.refOpen = false;   // el panel de fecha se cierra al cambiar de vista
      const prev = state.view;
      readHash();
      if (prev !== state.view) {
        // Contexto persistente: se lee de la vista que se deja y se aplica a la nueva (con nota si se ajusta)
        state.ux.ctx = FP.navigation.extractContext(prev, state);
        if (state.ux.routeCtx) { Object.assign(state.ux.ctx, state.ux.routeCtx); state.ux.routeCtx = null; }
        state.ux.ctxNote = FP.navigation.applyContext(state.view, state) || null;
      }
      render();
      if (!state.ux.tour.active) root.scrollTo(0, 0);
    });
  }

  /** Arranque del almacenamiento: abre IndexedDB y migra (sin borrar localStorage) antes de leer datos. */
  /** Red de seguridad: errores no capturados se avisan (una vez cada 5 s, máximo 5) en vez de fallar en silencio. Nunca muestra la API key. */
  function installGlobalErrorHandlers() {
    let shown = 0, lastAt = 0;
    const report = (kind, err, where) => {
      let msg = String(err && err.message || err || 'error desconocido');
      const key = state.dx && state.dx.apiKey;
      if (key) msg = msg.split(key).join('[key]');
      try { console.error(`[RevNavigator] ${kind}:`, msg, where || '', err && err.stack || ''); } catch (e) { /* sin consola */ }
      const now = Date.now();
      if (shown >= 5 || now - lastAt < 5000) return;
      shown++; lastAt = now;
      if (FP.ui && FP.ui.toast) FP.ui.toast(`Algo no se pudo mostrar${state.view ? ` en «${state.view}»` : ''}. Tus datos guardados no se modificaron. Puedes seguir usando la app; si esta parte no responde, recarga la página. Detalle técnico: ${msg.slice(0, 100)}${where ? ` (${where})` : ''}.`);
    };
    root.addEventListener('error', (ev) => report('error', ev && (ev.error || ev.message), ev && ev.filename ? `${String(ev.filename).split('/').pop()}:${ev.lineno}` : ''));
    root.addEventListener('unhandledrejection', (ev) => report('promesa rechazada', ev && ev.reason));
  }

  async function initStorage() {
    installGlobalErrorHandlers();
    await repo.init();
    repo.onError = (msg) => FP.ui.toast(`No se pudo guardar en IndexedDB (${msg}). Exporta los datos como respaldo.`);
    // Estado real de persistencia: un fallo de escritura deja un aviso que NO desaparece (los datos solo están en memoria)
    // hasta que un reintento o una escritura posterior se confirme.
    repo.onSettled = (st) => {
      state.persist = st;
      const had = state.saveFailure && state.saveFailure.dataType === 'kv';
      if (st.state === 'failed') {
        state.saveFailure = { dataType: 'kv', message: `IndexedDB rechazó ${st.failed} escritura(s) (${st.lastError || 'sin detalle'}): esos datos están solo en memoria y se perderán al cerrar o recargar la página.` };
        if (FP.ui && FP.ui.renderSaveFailure) FP.ui.renderSaveFailure(state);
      } else if (had) {
        state.saveFailure = null;
        if (FP.ui && FP.ui.renderSaveFailure) FP.ui.renderSaveFailure(state);
      }
    };
    root.addEventListener('beforeunload', (ev) => {
      const st = repo.status();
      if (st.state === 'pending' || st.state === 'failed') { ev.preventDefault(); ev.returnValue = ''; }
    });
    migrationState = await FP.storageMigration.migrate({ ls: lsStorage, lsAdapter, repo });
    state.storageKind = storage.kind;
    state.storage = { mode: repo.mode, migration: migrationState, error: repo.lastError };
    if (FP.productStore) { await FP.productStore.init(repo); if (FP.customerStore) FP.customerStore.reset(); await refreshProductQuality(); }
  }

  /* ----- Fase A: pruebas del motor en segundo plano (Worker aislado; no congela la pantalla ni toca tus datos) ----- */
  const SELFTEST_WORKER = 'js/workers/selftest-worker.js';
  let engineTestsBusy = false;
  /** Un intento: `blobSrc` null = el archivo del Worker directo; con texto = Worker armado desde un Blob (cuando el sitio no deja arrancar el archivo, p. ej. otro origen o una política de seguridad). */
  function engineTestsAttempt(files, blobSrc) {
    return new Promise((resolve, reject) => {
      let w, url = null;
      try { if (blobSrc) { url = URL.createObjectURL(new Blob([blobSrc], { type: 'text/javascript' })); w = new Worker(url); } else w = new Worker(SELFTEST_WORKER); } catch (e) { if (url) URL.revokeObjectURL(url); reject(Object.assign(new Error(e && e.message || 'no se pudo iniciar el proceso en segundo plano'), { start: true })); return; }
      const finish = (fn, v) => { clearTimeout(timer); try { w.terminate(); } catch (e) { /* ya cerrado */ } if (url) URL.revokeObjectURL(url); fn(v); };
      const timer = setTimeout(() => finish(reject, new Error('tiempo agotado (3 min)')), 180000);   // un celular lento tarda más que una laptop
      w.onmessage = (e) => (e.data && e.data.error ? finish(reject, new Error(e.data.error)) : finish(resolve, e.data));
      w.onerror = (e) => finish(reject, Object.assign(new Error((e && e.message) || 'el proceso en segundo plano no arrancó'), { start: true }));
      w.postMessage({ files });
    });
  }
  async function engineTestsInWorker() {
    if (typeof Worker === 'undefined') throw new Error('Este navegador no permite procesos en segundo plano.');
    // La lista de archivos sale de index.html (única fuente de verdad), con los diferidos incluidos y sin app.js ni lazy.js.
    const files = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))
      .filter((f) => !/^js\/(app|lazy)\.js(\?|$)/.test(f)).map((f) => new URL(f, document.baseURI).href);
    try { return await engineTestsAttempt(files, null); } catch (e1) {
      if (!e1.start) throw e1;   // falló corriendo las pruebas: no tiene caso repetir
      // No arrancó el archivo del Worker: se baja su texto y se arranca desde un Blob (mismas pruebas, mismo aislamiento).
      let src; try { const r = await fetch(SELFTEST_WORKER, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); src = await r.text(); } catch (e2) { throw new Error(`${e1.message} · y no pude bajar el archivo de pruebas (${e2.message})`); }
      return engineTestsAttempt(files, src);
    }
  }
  /** Corre las pruebas del motor en segundo plano y repinta solo la píldora y la lista (sin tocar el resto de la pantalla). */
  async function runEngineTests(announce, retried) {
    if (engineTestsBusy) return;
    engineTestsBusy = true;
    try {
      state.selfTest = await engineTestsInWorker(); state.selfTestError = null;
      FP.ui.renderStatus(state); FP.ui.renderEngine(state);
      if (announce) FP.ui.toast(`Pruebas del motor: ${state.selfTest.passed} de ${state.selfTest.total} correctas`);
    } catch (e) {
      // Nunca se corren en el hilo principal: las pruebas reinician catálogos internos y podrían alterar la sesión abierta.
      // La causa queda a la vista (píldora y Configuración) en lugar de un «Sin ejecutar» mudo; la corrida automática se reintenta una vez.
      state.selfTestError = String(e && e.message || e).slice(0, 200);
      FP.ui.renderStatus(state); FP.ui.renderEngine(state);
      if (announce) FP.ui.toast(`No se pudieron ejecutar las pruebas del motor: ${state.selfTestError}`, { ms: 5000 });
      else if (!retried) setTimeout(() => runEngineTests(false, true), 20000);
    } finally { engineTestsBusy = false; }
  }
  /** Programa la primera ejecución: unos segundos después de abrir y cuando el navegador esté libre. */
  function scheduleEngineTests() {
    const go = () => runEngineTests(false);
    setTimeout(() => { if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 15000 }); else go(); }, 4000);
  }

  async function init() {
    try { await initStorage(); } catch (e) { state.storage = { mode: 'unavailable', migration: migrationState, error: String(e && e.message || e) }; }
    // S3: ¿volvemos del enlace de un correo de Supabase? (antes de que el router lea el hash)
    try {
      const ah = await FP.cloud.consumeAuthHash({});
      if (ah) {
        state.stTab = 'cuenta'; state.view = 'ajustes';
        cloudNote(ah.ok ? `Entraste como ${ah.session.email} · equipo ${ah.session.team_name || ''}.${ah.type === 'recovery' ? ' Cambia tu contraseña abajo.' : ''}` : ah.error, ah.ok ? 'ok' : 'bad');
      }
    } catch (e) { /* sin enlace de correo */ }
    // S2: antes de cargar nada, trae lo liviano que en la nube sea más nuevo (si no, la app podría volver a guardar su copia vieja y pisarlo)
    cloudRefreshSession();
    state.cloud.auto.on = FP.cloud.autoOn() && !!state.cloud.session;
    if (state.cloud.auto.on) { try { await Promise.race([autoPull(false), new Promise((res) => setTimeout(res, 3000))]); } catch (e) { state.cloud.auto.error = String(e && e.message || e); } }
    FP.ui.renderAppMeta();
    loadSettings();
    loadAliases();
    loadSheetLinks();
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
    // Fase A: las pruebas del motor ya no corren al abrir (tardaban segundos en el hilo principal); corren en segundo plano unos segundos después (scheduleEngineTests).
    readHash();
    state.ux.ctxNote = FP.navigation.applyContext(state.view, state) || null;
    FP.navigation.markAnalystBlocks();
    bind();
    FP.ui.renderEdgeCases();
    if (FP.ui.initBackToTop) FP.ui.initBackToTop();
    maybePromptLogin();   // el acceso se decide antes que la bienvenida (la bienvenida de render() espera si hay acceso abierto)
    render();
    if (migrated) FP.ui.toast('Los datos de la Fase 0 se migraron al nuevo modelo de carga.');
    scheduleEngineTests();
    if (FP.agentLauncher) FP.agentLauncher.init();   // Fase 1: botón «Asistentes» (el panel se carga al usarlo)
  }

  // Expuesto solo para depuración en consola (FP.app.state).

  /* ----- Fase S1: nube (Supabase). Proveedor de claves: lo que hay guardado localmente, sin secretos ----- */
  const cloudProvider = {
    async keys() {
      const pre = `${C.storage.namespace}:`, set = new Set();
      lsAdapter.keys().filter((k) => k.startsWith(pre)).forEach((k) => set.add(k.slice(pre.length)));
      (await repo.kvAllKeys()).forEach((k) => set.add(k));
      return [...set].sort();
    },
    async read(key) {
      if (FP.repository.isDataKey(key) && repo.ready) { const e = await repo.kvRead(key).catch(() => null); if (e) return e; }
      return lsStorage.load(key);
    }
  };

  /* ----- Fase S2: sincronización automática de lo liviano (opt-in) ----- */
  const cloudWriter = {
    keys: cloudProvider.keys, read: cloudProvider.read,
    /** Escribe conservando la fecha de guardado original (para no provocar un rebote de subida). Solo claves chicas (localStorage). */
    async write(key, env) { lsAdapter.set(`${C.storage.namespace}:${key}`, JSON.stringify(env)); }
  };
  const autoPending = new Set(); let autoTimer = null, autoBusy = false;
  function autoStatusEl() { return document.getElementById('cloud-auto-status'); }
  function autoStatusText() {
    const a = state.cloud.auto;
    if (!a.on) return 'Apagada: tus metas y ajustes solo se guardan en este navegador.';
    if (a.error) return `No se pudo sincronizar: ${a.error}`;
    return a.last ? `Última sincronización: ${new Date(a.last).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Encendida: se sincroniza cuando cambies algo.';
  }
  function autoPaint() { const el = autoStatusEl(); if (el) el.textContent = autoStatusText(); }
  async function autoFlush() {
    if (autoBusy || !autoPending.size) return;
    autoBusy = true; const keys = [...autoPending]; autoPending.clear();
    const box = document.getElementById('cloud-auto-progress'), t0 = Date.now();
    if (box) box.innerHTML = FP.ui.loader.html({ id: 'cloud-auto-bar', compact: true, label: 'Sincronizando ajustes con la nube', pct: 0, t0 });
    const r = await FP.cloud.pushKeys(cloudProvider, keys, { onProgress: (o) => FP.ui.loader.update('cloud-auto-bar', { label: `Sincronizando ajustes (${o.index} de ${o.of})`, pct: Math.round(100 * o.index / o.of) }) });
    autoBusy = false; const box2 = document.getElementById('cloud-auto-progress'); if (box2) box2.innerHTML = '';
    if (r.ok) { state.cloud.auto.last = r.at; state.cloud.auto.error = null; } else { state.cloud.auto.error = r.error; keys.forEach((k) => autoPending.add(k)); }
    autoPaint(); cloudRefreshSession();
    if (r.ok) autoCleanLater();
    if (autoPending.size && r.ok) autoSchedule();
  }
  function autoSchedule() { clearTimeout(autoTimer); autoTimer = setTimeout(autoFlush, C.cloud.autoDebounceMs); }
  function autoMark(key) {
    if (!state.cloud.auto.on || !FP.cloud.isAutoKey(key, FP.repository.isDataKey)) return;
    autoPending.add(key); autoSchedule();
  }
  let wiping = false;   // true mientras se borran los datos al cerrar sesión: nada vuelve a escribirse
  const _save = storage.save.bind(storage);
  storage.save = (key, data) => { if (wiping) return false; const ok = _save(key, data); if (ok) autoMark(key); return ok; };
  async function autoPull(announce) {
    const r = await FP.cloud.pullNewer(cloudWriter, FP.repository.isDataKey, {});
    if (!r.ok) { state.cloud.auto.error = r.error; autoPaint(); return r; }
    state.cloud.auto.error = null;
    if (r.applied.length) {
      state.cloud.auto.pulled = r.applied;
      if (r.applied.includes('reportBrand')) { loadBrand(); render(); }   // la marca se aplica en caliente
      const needReload = r.applied.includes('businessContext');   // config.js lo lee antes de arrancar
      if (needReload) state.cloud.restored = true;
      FP.ui.toast(`Se trajeron ${r.applied.length} ajuste(s) más nuevos de la nube${needReload ? '. Recarga la página para aplicar los del negocio.' : '.'}`);
      cloudNote(`Se trajeron de la nube ${r.applied.length} ajuste(s) más nuevos (${r.applied.slice(0, 4).join(', ')}${r.applied.length > 4 ? '…' : ''})${needReload ? '. Recarga para aplicar los del negocio.' : '.'}`, 'ok');
    }
    if (announce) render();
    return r;
  }


  /* ---------- Cerrar sesión: el navegador no conserva los datos del equipo ----------
     Se conservan (preferencias de este navegador, sin datos de negocio): uxSettings, productSettings, cohereApiKey, storageMigration, onboardingDone.
     Se borran: todo lo demás de la app (datos en IndexedDB, claves fp.v1: de negocio, avance de ruta, cola de cambios) y la sesión.
     La copia de la nube del equipo no se toca. Antes de borrar se compara cada bloque local con la nube; lo que no esté respaldado se avisa. */
  const SIGNOUT_KEEP = ['uxSettings', 'productSettings', 'cohereApiKey', 'storageMigration', 'onboardingDone'];
  const signout = { phase: 'idle', audit: null, busy: false, ack: false, msg: '' };
  const baseOf = (k) => String(k).split(':')[0];
  const KEY_LABEL = { actualData: 'Venta real', historicalData: 'Histórico', planData: 'Plan diario', segmentsData: 'Segmentos', targets: 'Metas', events: 'Eventos', milestones: 'Hitos', versions: 'Versiones de metas', settings: 'Ajustes', aliases: 'Equivalencias', dataset: 'Datos del año', plans: 'Planes', forecasts: 'Pronósticos', reforecasts: 'Repronósticos', scenarios: 'Escenarios', actionPlan: 'Plan de acción', businessContext: 'Contexto del negocio', sheetsLinks: 'Enlaces de Google Sheets' };
  const keyName = (k) => { const b = baseOf(k), y = String(k).split(':')[1]; return `${KEY_LABEL[b] || b}${y && /^\d{4}$/.test(y) ? ' ' + y : ''}`; };
  /** Compara lo local con la nube (solo lectura). Devuelve { ok, unsynced:[texto], checked } o { ok:false, error }. */
  async function signoutAudit() {
    await repo.flush();
    const cl = await FP.cloud.listKeys({});
    if (!cl.ok) return { ok: false, error: cl.error };
    const skip = new Set(C.cloud.skipKeys.concat(C.cloud.autoSkipKeys, SIGNOUT_KEEP, ['authChoice']));
    const unsynced = []; let checked = 0;
    for (const key of await cloudProvider.keys()) {
      if (skip.has(baseOf(key)) || FP.productSync.isKey(key)) continue;
      const env = await cloudProvider.read(key); if (!env) continue;
      checked++;
      const at = cl.at && cl.at[key];
      if (!at) { unsynced.push(`${keyName(key)}: no está en la nube`); continue; }
      const local = env.savedAt ? Date.parse(env.savedAt) : 0;
      if (local > Date.parse(at) + 2000) unsynced.push(`${keyName(key)}: tiene cambios más nuevos que la nube`);
    }
    // Productos: viven en IndexedDB por lotes; se compara el último lote importado contra la última subida (manifiesto)
    if (FP.productStore && repo.ready) {
      let batches = []; try { batches = await FP.productStore.listBatches(); } catch (e) { batches = []; }
      if (batches.length) {
        checked++;
        const last = Math.max(...batches.map((b) => Date.parse(b.importedAt) || 0));
        const man = cl.at && cl.at[`${FP.productSync.PREFIX}:manifest`];
        if (!man) unsynced.push('Productos: no hay copia en la nube');
        else if (last > Date.parse(man) + 2000) unsynced.push('Productos: hay cargas más nuevas que la última copia en la nube');
      }
    }
    return { ok: true, unsynced, checked };
  }
  function closeSignout() { const d = document.getElementById('signout-dialog'); if (d) { try { d.close(); } catch (e) { /* ya cerrado */ } d.remove(); } signout.phase = 'idle'; signout.audit = null; signout.ack = false; signout.busy = false; }
  function paintSignout() {
    let d = document.getElementById('signout-dialog');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'signout-dialog'; d.className = 'tour-offer login-dialog signout-dialog'; d.setAttribute('aria-labelledby', 'signout-t');
      d.addEventListener('cancel', (e) => { e.preventDefault(); if (!signout.busy) closeSignout(); });
      document.body.appendChild(d);
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    }
    const esc = FP.ui.helpers.esc, a = signout.audit;
    let status = '', btns = '';
    const pr = signout.prog;
    if (signout.phase === 'checking') status = FP.ui.loader.html({ id: 'signout-progress', title: 'Comprobando el respaldo', label: (pr && pr.label) || 'Comprobando que tus datos estén respaldados en la nube', pct: pr ? pr.pct : null, t0: signout.t0 || Date.now() });
    else if (signout.phase === 'wiping') status = FP.ui.loader.html({ id: 'signout-progress', title: 'Borrando los datos de este navegador', label: (pr && pr.label) || 'Borrando los datos de este navegador', pct: pr ? pr.pct : null, t0: signout.t0 || Date.now(), hint: 'No cierres la página hasta que termine.' });
    else if (a && a.ok && !a.unsynced.length) {
      status = `<p class="signout__ok" role="status">Todo está respaldado en la nube del equipo (${a.checked} bloque${a.checked === 1 ? '' : 's'} comprobado${a.checked === 1 ? '' : 's'}).</p>`;
      btns = '<button type="button" class="btn btn--primary" data-action="signout-confirm" autofocus>Cerrar sesión y borrar datos de este navegador</button><button type="button" class="btn" data-action="signout-cancel">Cancelar</button>';
    } else {
      const why = a && a.ok ? `<p role="alert"><strong>Hay datos sin respaldar en la nube.</strong> Si cierras sesión ahora se pierden:</p><ul>${a.unsynced.slice(0, 6).map((u) => `<li>${esc(u)}</li>`).join('')}${a.unsynced.length > 6 ? `<li>y ${a.unsynced.length - 6} más</li>` : ''}</ul>`
        : `<p role="alert"><strong>No pude comprobar el respaldo</strong> (${esc((a && a.error) || 'sin detalle')}). No sé si tus datos están en la nube.</p>`;
      status = `${why}${signout.busy && pr ? FP.ui.loader.html({ id: 'signout-progress', title: 'Subiendo la copia a la nube', label: pr.label, pct: pr.pct, t0: signout.t0 || Date.now(), hint: 'No cierres la página hasta que termine.' }) : signout.msg ? `<p role="status">${esc(signout.msg)}</p>` : ''}<label class="signout__ack"><input type="checkbox" data-action="signout-ack" ${signout.ack ? 'checked' : ''}> Entiendo que lo que no esté en la nube se pierde</label>`;
      btns = `<button type="button" class="btn btn--primary" data-action="signout-upload" ${signout.busy ? 'disabled' : ''} autofocus>Subir copia a la nube ahora</button><button type="button" class="btn" data-action="signout-download" ${signout.busy ? 'disabled' : ''}>Descargar copia (.json)</button><button type="button" class="btn" data-action="signout-confirm" ${signout.ack && !signout.busy ? '' : 'disabled'}>Cerrar sesión y borrar de todos modos</button><button type="button" class="btn" data-action="signout-cancel">Cancelar</button>`;
    }
    d.innerHTML = `<p class="tour-offer__eyebrow">Cuenta de equipo</p><h2 id="signout-t">Cerrar sesión</h2>
      <p>Al cerrar sesión se borran de este navegador los datos del equipo (ventas, metas, productos y análisis). La copia de la nube no se toca; al volver a entrar se pueden traer de nuevo. Se conservan tus preferencias, el tipo de uso y la clave de Cohere si la guardaste.</p>${status}
      <div class="tour-offer__btns">${btns}</div>`;
    const f = d.querySelector('[autofocus]'); if (f && !d.contains(document.activeElement)) f.focus();
  }
  async function openSignout() {
    if (signout.phase === 'checking' || signout.phase === 'wiping') return;
    signout.phase = 'checking'; signout.audit = null; signout.ack = false; signout.msg = ''; signout.prog = null; signout.t0 = Date.now(); paintSignout();
    let a; try { a = await signoutAudit(); } catch (e) { a = { ok: false, error: e && e.message || String(e) }; }
    if (signout.phase === 'idle') return;
    signout.audit = a; signout.phase = 'ready'; paintSignout();
  }
  /** Avance del cierre de sesión con el loader homologado: se actualiza en sitio; si aún no está en pantalla, se pinta el diálogo. */
  function signoutProg(label, pct) {
    signout.prog = { label, pct: pct === undefined ? null : pct };
    if (!FP.ui.loader.update('signout-progress', { label, pct: pct === undefined ? null : pct })) paintSignout();
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function signoutUpload() {
    if (signout.busy) return; signout.busy = true; signout.msg = ''; signout.t0 = Date.now(); signoutProg('Preparando la copia', 2);
    try {
      await repo.flush();
      const bundle = await FP.productSync.build(repo, { onProgress: (d, n) => signoutProg(`Preparando productos (${d} de ${n})`, 2 + Math.round(33 * d / n)) });
      if (bundle.tooBig) { signout.msg = 'Los productos rebasan el tope de la nube; no se subieron.'; }
      else {
        const up = await FP.cloud.upload(FP.productSync.withProducts(cloudProvider, bundle), { onProgress: (o) => signoutProg(`Subiendo bloque ${o.index} de ${o.of}`, 35 + Math.round(60 * o.index / o.of)) });
        if (!up.ok) signout.msg = `No se pudo subir: ${up.error}`;
        else { signoutProg('Limpiando trozos viejos', 96); await FP.cloud.pruneKeys(FP.productSync.PREFIX, new Set(bundle.keys || []), {}); signout.msg = ''; }
      }
    } catch (e) { signout.msg = `Falló la subida: ${e && e.message || e}`; }
    if (!document.getElementById('signout-dialog')) { signout.busy = false; return; }
    signout.busy = false; signout.phase = 'checking'; signout.prog = null; signout.t0 = Date.now(); paintSignout();
    let a; try { a = await signoutAudit(); } catch (e) { a = { ok: false, error: e && e.message || String(e) }; }
    signout.audit = a; signout.phase = 'ready'; paintSignout();
  }
  /** Copia local de los bloques generales (sin productos: pesan demasiado; esos solo se respaldan con «Subir copia a la nube»). */
  async function signoutDownload() {
    await repo.flush(); const out = {};
    const skip = new Set(C.cloud.skipKeys);
    for (const key of await cloudProvider.keys()) { if (skip.has(baseOf(key)) || FP.productSync.isKey(key)) continue; const env = await cloudProvider.read(key); if (env) out[key] = env; }
    FP.exporter.download(`revnavigator-copia-local-${new Date().toISOString().slice(0, 10)}.json`, { app: 'RevNavigator', kind: 'copia-local', at: new Date().toISOString(), keys: out });
    signout.msg = 'Copia descargada (sin productos).'; paintSignout();
  }
  /** Borra los datos de este navegador y recarga. No toca la nube. */
  async function wipeLocalData(step) {
    const st = async (label, pct) => { if (step) { step(label, pct); await tick(); } };
    wiping = true; await st('Guardando lo pendiente', 5);
    clearTimeout(autoTimer); autoPending.clear();
    FP.cloud.setAuto(false); state.cloud.auto.on = false;
    await repo.flush();
    const keep = {}; SIGNOUT_KEEP.forEach((k) => { const raw = lsAdapter.get(`${C.storage.namespace}:${k}`); if (raw != null) keep[k] = raw; });
    await st('Borrando los datos guardados', 25);
    storage.clear();                                   // localStorage de la app + IndexedDB (todos los almacenes)
    await st('Borrando productos', 60);
    if (FP.productStore) FP.productStore.reset();
    if (FP.customerStore) FP.customerStore.reset();
    await st('Restaurando tus preferencias', 80);
    Object.keys(keep).forEach((k) => lsAdapter.set(`${C.storage.namespace}:${k}`, keep[k]));
    await st('Cerrando la sesión', 92);
    FP.cloud.signOut();
    ['fp.route.v1', 'fp.route.origin.v1', 'fp.changes.v1', 'fp.cloudAuto', 'fp.cloudPrevRefs', 'fp.cloudGcLast'].forEach((k) => { try { root.localStorage.removeItem(k); } catch (e) { /* nada */ } });
    ['fp.route.origin.v1', 'fp.loginAsked'].forEach((k) => { try { root.sessionStorage.removeItem(k); } catch (e) { /* nada */ } });
  }
  async function signoutConfirm() {
    if (signout.busy || signout.phase === 'wiping') return;
    const a = signout.audit; if (!(a && a.ok && !a.unsynced.length) && !signout.ack) return;
    signout.phase = 'wiping'; signout.busy = true; signout.prog = null; signout.t0 = Date.now(); paintSignout();
    try { await wipeLocalData(signoutProg); signoutProg('Listo, recargando', 100); await tick(); } catch (e) { wiping = false; signout.busy = false; signout.phase = 'ready'; signout.msg = `No pude borrar todo: ${e && e.message || e}`; paintSignout(); return; }
    root.location.reload();
  }

  /* ----- Limpieza de copias huérfanas en la nube ----- */
  const PREV_REFS = 'fp.cloudPrevRefs';   // preferencia de este navegador (fuera del namespace de datos): bloques de la generación anterior
  const readPrevRefs = () => { try { return JSON.parse(localStorage.getItem(PREV_REFS) || '[]'); } catch (e) { return []; } };
  const savePrevRefs = (a) => { try { localStorage.setItem(PREV_REFS, JSON.stringify(a)); } catch (e) { /* sin storage */ } };
  /** Tras una subida verificada: guarda la generación anterior como respaldo y borra lo demás que ya nadie usa. */
  async function autoCleanCloud(preRefs) {
    cloudProg('Buscando copias viejas en la nube', 95);
    const plan = await FP.cloud.planCleanup({ prevRefs: preRefs, keepPrevious: true });
    if (!plan.ok) return { ok: false, error: plan.error };
    const now = new Set(plan.refsNow), changed = preRefs.some((k) => !now.has(k));
    if (changed) savePrevRefs(preRefs);   // si no cambió nada, se conserva el respaldo que ya había
    const keepBackup = changed ? preRefs : readPrevRefs();
    const plan2 = changed ? plan : await FP.cloud.planCleanup({ prevRefs: keepBackup, keepPrevious: true });
    if (!plan2.ok) return { ok: false, error: plan2.error };
    const del = plan2.orphans.keys;
    if (!del.length) return { ok: true, deleted: 0, bytes: 0 };
    const r = await FP.cloud.deleteChunks(del, { onProgress: (o) => cloudProg(`Limpiando copias viejas (${o.index} de ${o.of})`, 96 + Math.round(3 * o.index / o.of)) });
    return r.ok ? { ok: true, deleted: r.deleted, bytes: plan2.orphans.bytes } : { ok: false, error: r.error, deleted: r.deleted };
  }
  /** Tras la sincronización automática: limpieza discreta (máx. una vez cada 6 h, solo huérfanos de más de 24 h, siempre respetando el respaldo). */
  const GC_LAST = 'fp.cloudGcLast', GC_EVERY = 6 * 3600 * 1000;
  async function autoCleanLater() {
    try {
      const last = Number(localStorage.getItem(GC_LAST) || 0); if (Date.now() - last < GC_EVERY || state.cloud.busy) return;
      localStorage.setItem(GC_LAST, String(Date.now()));
      const plan = await FP.cloud.planCleanup({ prevRefs: readPrevRefs(), keepPrevious: true, minAge: 24 * 3600 * 1000 });
      if (!plan.ok || !plan.orphans.keys.length) return;
      const r = await FP.cloud.deleteChunks(plan.orphans.keys, {});
      if (r.ok) FP.ui.toast(`Limpieza automática de la nube: ${r.deleted} lotes viejos (${fmtKb(plan.orphans.bytes)} de datos).`);
    } catch (e) { /* la limpieza es oportunista: nunca interrumpe la sincronización */ }
  }
  const gcNote = (gc, tried) => !tried ? ' (No limpié copias viejas: no pude leer la copia anterior.)' : !gc ? '' : !gc.ok ? ` (No pude limpiar copias viejas: ${gc.error}.)` : gc.deleted ? ` Se limpiaron ${gc.deleted} lotes viejos (${fmtKb(gc.bytes)} de datos); la generación anterior se conserva como respaldo.` : ' No había copias viejas por limpiar.';

  function cloudNote(msg, tone) { state.cloud.msg = msg; state.cloud.tone = tone || null; }
  function cloudRefreshSession() { const s = FP.cloud.loadSession(); state.cloud.session = s && !s.anonymous && s.team_id ? { userId: s.user_id, email: s.email || null, teamId: s.team_id, teamName: s.team_name || null } : null; }
  const fmtKb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  /** Avance de la operación de nube: actualiza la barra en sitio (sin redibujar toda la pantalla); si aún no existe, dibuja. */
  const mmss = (ms) => FP.ui.loader.mmss(ms);
  /** Avance de la nube: el loader homologado se actualiza en sitio; si aún no está en pantalla, se dibuja la vista. */
  function cloudProg(label, pct) {
    state.cloud.progress = { label, pct };
    const ind = pct === null || pct === undefined;   // sin porcentaje conocido: barra indeterminada (solo texto de la etapa)
    if (FP.bgTask) FP.bgTask.update(label, ind ? null : pct);
    // Si el avance grande no está en pantalla: solo se dibuja la vista cuando la persona está en Cuenta; en otra pantalla basta la píldora (redibujar aquí borraría lo que esté escribiendo).
    if (!FP.ui.loader.update('cloud-progress', { label, pct: ind ? null : pct }) && cloudInView()) render();
  }
  /** ¿Está a la vista el avance grande de la nube (Configuración → Cuenta)? */
  const cloudInView = () => state.view === 'ajustes' && state.stTab === 'cuenta';
  const cloudGo = () => { state.stTab = 'cuenta'; if (root.location.hash === '#ajustes') render(); else root.location.hash = 'ajustes'; };
  /** `op` ('upload' | 'restore' | 'delete') y `label` encienden el loader desde el primer instante, con reloj. */
  async function cloudRun(fn, op, label) {
    if (state.cloud.busy) return;
    state.cloud.busy = true; state.cloud.op = op || null; state.cloud.t0 = op ? Date.now() : null; state.cloud.progress = op ? { label: label || 'Trabajando', pct: null } : null; cloudNote('Trabajando…'); render();
    if (op && FP.bgTask) FP.bgTask.start(label || 'Trabajando', { here: cloudInView, goTo: cloudGo });
    if (op) {
      // Un fallo temporal de Supabase (502/520/521 o de red) se reintenta solo: se avisa en el propio loader.
      FP.cloud.setRetryHook(({ attempt, of, status }) => { const t = document.querySelector('#cloud-progress .ldr__label'); if (t) t.textContent = `${(state.cloud.progress || {}).label || 'Trabajando'} — reintentando (${attempt} de ${of})${status ? ` · error ${status}` : ''}…`; });
    }
    try { await fn(); } catch (e) { cloudNote(`Falló: ${e && e.message || e}`, 'bad'); }
    FP.cloud.setRetryHook(null);
    const took = state.cloud.t0 ? Date.now() - state.cloud.t0 : 0;
    if (op && state.cloud.msg && took > 1500) state.cloud.msg += ` (${mmss(took)})`;
    state.cloud.busy = false; state.cloud.op = null; state.cloud.t0 = null; state.cloud.progress = null; cloudRefreshSession(); render();
    if (op && FP.bgTask) FP.bgTask.finish(state.cloud.msg);   // desde otra pantalla: aviso con el resultado (el texto completo queda en Cuenta)
  }

  FP.app = { cloudProvider, state, actions, render, saveStore, savingChain, paLevel, paNextChoices, paFilter, periodRange, storage, repo, lsStorage, lsAdapter, retryMigration: async () => { migrationState = await FP.storageMigration.migrate({ ls: lsStorage, lsAdapter, repo, force: true }); state.storage.migration = migrationState; return migrationState; } };

  // Pantalla de arranque (index.html): se retira al terminar init(); si init() falla se muestra el aviso en lugar de dejar la pantalla en blanco.
  const start = () => init().then(
    () => { if (root.__boot) root.__boot.done(); },
    (e) => { if (root.__boot) root.__boot.fail('Falló el arranque de la app.'); throw e; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
