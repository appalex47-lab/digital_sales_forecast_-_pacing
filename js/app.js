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

  const storage = FP.storage.createStorage();
  const K = C.storage.keys;
  const yk = (key, year) => `${key}:${year}`;
  const VIEWS = ['resumen', 'carga', 'calidad', 'datos'];
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
    storageKind: storage.kind,
    // Fase 1
    store: ST.createStore(),
    settings: null,
    staging: { items: [], activeId: null, issueFilter: 'all' },
    quality: null,
    availableYears: [],
    qualityType: 'historical',
    dataFilters: { dataType: 'actual', channel: '', status: 'all', from: '', to: '', page: 1 }
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
    state.dataset = ST.consolidate(state.store, state.year);
    state.quality = FP.coverage.summarize(state.store);
    state.availableYears = ST.years(state.store);
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

  function render() {
    FP.ui.renderStatus(state);
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === state.view;
      a.setAttribute('aria-selected', String(on));
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
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
    state.staging.items.forEach((i) => { i.result = processStaged(i.staged); });
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
      if (file.size > maxBytes) { FP.ui.toast(`${file.name} pesa más de ${C.import.maxFileSizeMB} MB. Divídelo en archivos más pequeños.`); continue; }
      try {
        const text = await readFileText(file);
        addToStaging(IMP.stage(text, { fileName: file.name, dataType }));
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
      state.store = ST.createStore();
      state.staging = { items: [], activeId: null, issueFilter: 'all' };
      loadSettings();
      loadYearScoped(state.year);
      refresh();
      render();
      FP.ui.toast('Datos borrados');
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
      FP.ui.toast('Cuatro archivos en revisión. Confírmalos uno por uno.');
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
      item.result = processStaged(item.staged); // revalida contra lo guardado en este momento
      if (!item.result.canImport) { render(); FP.ui.toast('Corrige el mapeo antes de importar.'); return; }
      const batch = ST.commitBatch(state.store, item.staged, item.result,
        { includeErrorRows: state.settings.includeErrorRows, settings: state.settings });
      state.staging.items = state.staging.items.filter((i) => i !== item);
      state.staging.activeId = state.staging.items[0] ? state.staging.items[0].staged.id : null;
      reprocessAll(); // los pendientes pueden duplicar lo recién importado
      saveStore([batch.dataType]);
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
      reprocessAll();
      refresh();
      render();
      FP.ui.toast(`${b.fileName} quitado`);
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

  /* ================= Arranque ================= */

  function readHash() {
    const v = (root.location.hash || '').replace('#', '');
    state.view = VIEWS.includes(v) ? v : 'resumen';
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button[data-action]');
      if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('select[data-action], input[data-action]');
      if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'targets-form') { e.preventDefault(); saveTargetsFromForm(e.target); }
    });
    root.addEventListener('hashchange', () => { readHash(); render(); root.scrollTo(0, 0); });
  }

  function init() {
    FP.ui.renderAppMeta();
    loadSettings();
    loadStore();
    loadYearScoped(C.defaultYear);
    const migrated = migrateLegacyDataset();
    if (migrated) saveStore();
    refresh();
    resetPeriod();
    state.selfTest = FP.selfTest.run();
    readHash();
    bind();
    FP.ui.renderEdgeCases();
    render();
    if (migrated) FP.ui.toast('Los datos de la Fase 0 se migraron al nuevo modelo de carga.');
  }

  // Expuesto solo para depuración en consola (FP.app.state).
  FP.app = { state, actions, storage };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
