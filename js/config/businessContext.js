/**
 * businessContext.js — Business Setup / Business Context (Fase 8.2).
 *
 * "¿Qué tipo de negocio estoy analizando y cómo funciona?"
 *
 * Una sola fuente de verdad:
 *
 *   Business Context (guardado por el usuario, localStorage `businessContext`)
 *          ↓  bootstrap: config.js lo lee ANTES de congelarse
 *   Runtime config (FP.config, congelada) → config.business y config.currency
 *          ↓
 *   Motores y vistas existentes (no cambian)
 *
 * - Este archivo se carga ANTES que config.js y no depende de FP.config.
 * - Solo alimenta los campos que describen el negocio: moneda, nombre, terminología y el contexto declarativo
 *   (modelo, oferta, venta, compra, geografía y catálogo conceptuales, factores relevantes, notas).
 * - NO alimenta canales, métricas, fórmulas, dimensiones, geografía real ni catálogo real: eso pertenece a las
 *   fases 8.3, 8.5 y 8.4 (pausadas o futuras). config.channelIds y config.metricKeys no se tocan.
 * - Sin Business Context guardado, la configuración es exactamente la de siempre (compatibilidad hacia atrás).
 * - Por qué localStorage y no IndexedDB: es configuración pequeña y config.js necesita leerla de forma síncrona
 *   al cargar; IndexedDB es asíncrono y llegaría tarde para congelar la configuración.
 * - Se escribe con FP.storage (mismo sobre { schemaVersion, savedAt, data }); aquí solo se lee al arrancar.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'businessContext';

  /** Opciones cerradas (se muestran como casillas). "other" siempre permite describir en texto. */
  const OPTIONS = {
    offering: [['products', 'Productos'], ['services', 'Servicios'], ['subscriptions', 'Suscripciones'], ['solutions', 'Soluciones / proyectos'], ['other', 'Otro']],
    sellingModels: [['direct', 'Venta directa'], ['ecommerce', 'Ecommerce'], ['assisted', 'Venta asistida (teléfono, chat)'], ['lead_to_sale', 'Lead → venta'],
      ['quote_to_sale', 'Cotización → venta'], ['opportunity_to_sale', 'Oportunidad → venta'], ['subscription', 'Suscripción'], ['repurchase', 'Recompra'],
      ['replenishment', 'Reposición'], ['other', 'Otro']],
    purchaseBehavior: [['single', 'Compra única'], ['repurchase', 'Recompra'], ['recurring', 'Recurrencia'], ['subscription', 'Suscripción'],
      ['replenishment', 'Reposición'], ['cyclical', 'Ciclos (temporadas, tratamientos)']],
    businessFactors: [['price', 'Precio'], ['promotions', 'Promociones'], ['inventory', 'Inventario'], ['availability', 'Disponibilidad'],
      ['capacity', 'Capacidad operativa'], ['marketing', 'Marketing'], ['seasonality', 'Estacionalidad'], ['events', 'Eventos'],
      ['calendar', 'Calendario (quincenas, festivos)'], ['weather', 'Clima'], ['competition', 'Competencia'], ['operational', 'Restricciones operativas'],
      ['regulation', 'Regulación']]
  };

  /** Terminología por defecto (la que usa hoy la app). Una clave vacía usa este valor. */
  const DEFAULT_TERMS = { sale: 'venta', order: 'pedido', customer: 'cliente', product: 'producto', location: 'sucursal' };
  const TERM_LABELS = { sale: 'Venta', order: 'Pedido', customer: 'Cliente', product: 'Producto', location: 'Ubicación' };

  function empty() {
    return {
      schemaVersion: SCHEMA_VERSION,
      business: { name: '', industry: '', description: '', businessModel: '', revenueModel: '', saleProcess: '', offering: [], offeringOther: '', currency: '' },
      selling: { models: [], other: '', description: '' },
      purchaseBehavior: { types: [], cycleDays: null, description: '' },
      geography: { relevant: null, levels: [], description: '' },
      catalog: { relevant: null, levels: [], description: '' },
      businessFactors: [],
      customFactors: [],
      terminology: { sale: '', order: '', customer: '', product: '', location: '' },
      notes: ''
    };
  }

  const str = (v, max = 400) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
  const txt = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const codes = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((x) => allowed.some((a) => a[0] === x)))] : []);
  const levels = (list) => (Array.isArray(list) ? list.map((x) => str(x, 60)).filter(Boolean).slice(0, 8) : []);
  const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);

  /**
   * Migración de esquema. Hoy solo existe v1; un contexto sin versión se trata como v1.
   * Una versión mayor desconocida no se interpreta (no se adivina): se devuelve null.
   */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw.schemaVersion === undefined ? 1 : Number(raw.schemaVersion);
    if (!Number.isInteger(v) || v > SCHEMA_VERSION) return null;
    return raw; // v1 → v1: sin cambios
  }

  /** Normaliza cualquier objeto a la forma v1 (tipos, listas cerradas, recortes). Nunca lanza. */
  function normalize(raw) {
    const m = migrate(raw);
    if (!m) return null;
    const e = empty();
    const b = m.business || {}, s = m.selling || {}, p = m.purchaseBehavior || {}, g = m.geography || {}, c = m.catalog || {}, t = m.terminology || {};
    const cycle = Number(p.cycleDays);
    return {
      schemaVersion: SCHEMA_VERSION,
      business: { name: str(b.name, 120), industry: str(b.industry, 120), description: txt(b.description, 600), businessModel: str(b.businessModel, 200),
        revenueModel: txt(b.revenueModel, 400), saleProcess: txt(b.saleProcess, 400), offering: codes(b.offering, OPTIONS.offering), offeringOther: str(b.offeringOther, 200),
        currency: str(b.currency, 3).toUpperCase() },
      selling: { models: codes(s.models, OPTIONS.sellingModels), other: str(s.other, 200), description: txt(s.description, 600) },
      purchaseBehavior: { types: codes(p.types, OPTIONS.purchaseBehavior), cycleDays: Number.isFinite(cycle) && cycle > 0 ? Math.round(cycle) : null, description: txt(p.description, 600) },
      geography: { relevant: bool(g.relevant), levels: levels(g.levels), description: txt(g.description, 400) },
      catalog: { relevant: bool(c.relevant), levels: levels(c.levels), description: txt(c.description, 400) },
      businessFactors: codes(m.businessFactors, OPTIONS.businessFactors),
      customFactors: Array.isArray(m.customFactors) ? [...new Set(m.customFactors.map((x) => str(x, 80)).filter(Boolean))].slice(0, 20) : [],
      terminology: Object.fromEntries(Object.keys(e.terminology).map((k) => [k, str(t[k], 40)])),
      notes: txt(m.notes, 3000)
    };
  }

  /** Código ISO 4217 real (Intl acepta cualquier código bien formado, por eso se consulta la lista oficial). */
  let CURRENCIES = null;
  function validCurrency(code) {
    if (!/^[A-Z]{3}$/.test(code)) return false;
    if (CURRENCIES === null) {
      try { CURRENCIES = typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('currency')) : false; } catch (e) { CURRENCIES = false; }
    }
    if (CURRENCIES) return CURRENCIES.has(code);
    try { new Intl.NumberFormat('es-MX', { style: 'currency', currency: code }).format(1); return true; } catch (e) { return false; }
  }

  /**
   * Validación con tres niveles: error (bloquea guardar), warning (recomendado) e info.
   * Solo el nombre es obligatorio; lo demás se recomienda o es opcional para no bloquear al usuario.
   */
  function validate(ctx) {
    const issues = [];
    const add = (level, field, message) => issues.push({ level, field, message });
    if (!ctx) { add('error', 'schemaVersion', 'El contexto no tiene un formato reconocido.'); return { ok: false, issues }; }
    const b = ctx.business;
    if (!b.name) add('error', 'business.name', 'El nombre del negocio es obligatorio.');
    if (b.currency && !validCurrency(b.currency)) add('error', 'business.currency', `"${b.currency}" no es un código de moneda ISO 4217 válido (ej. MXN, USD, EUR).`);
    if (!b.industry) add('warning', 'business.industry', 'Recomendado: la industria o sector ayuda a interpretar los resultados.');
    if (!b.businessModel) add('warning', 'business.businessModel', 'Recomendado: describe el modelo de negocio.');
    if (!b.offering.length) add('warning', 'business.offering', 'Recomendado: indica qué vende el negocio.');
    if (b.offering.includes('other') && !b.offeringOther) add('warning', 'business.offeringOther', 'Marcaste "Otro" en qué vende: descríbelo.');
    if (!ctx.selling.models.length) add('warning', 'selling.models', 'Recomendado: indica cómo vende.');
    if (ctx.selling.models.includes('other') && !ctx.selling.other) add('warning', 'selling.other', 'Marcaste "Otro" en cómo vende: descríbelo.');
    if (!ctx.purchaseBehavior.types.length) add('warning', 'purchaseBehavior.types', 'Recomendado: describe el comportamiento de compra.');
    [['geography', 'geografía'], ['catalog', 'catálogo']].forEach(([k, lbl]) => {
      const g = ctx[k];
      if (g.relevant === null) add('warning', `${k}.relevant`, `Recomendado: indica si la ${lbl === 'geografía' ? 'geografía' : 'estructura de catálogo'} es relevante.`);
      if (g.relevant === true && !g.levels.length) add('warning', `${k}.levels`, `Indicaste que la ${lbl} es relevante pero no describiste sus niveles.`);
      if (g.relevant === false && g.levels.length) add('warning', `${k}.levels`, `Indicaste que la ${lbl} no es relevante: sus niveles se conservan como nota pero no se usarán.`);
      const seen = new Set();
      g.levels.forEach((l) => { const n = l.toLowerCase(); if (seen.has(n)) add('error', `${k}.levels`, `El nivel "${l}" está repetido en la ${lbl}.`); seen.add(n); });
    });
    const terms = effectiveTerms(ctx);
    const byTerm = {};
    Object.entries(terms).forEach(([k, v]) => { const n = v.toLowerCase(); (byTerm[n] = byTerm[n] || []).push(k); });
    Object.entries(byTerm).filter(([, ks]) => ks.length > 1).forEach(([v, ks]) =>
      add('warning', 'terminology', `El término "${v}" se usa para ${ks.map((k) => TERM_LABELS[k].toLowerCase()).join(' y ')}: pueden confundirse.`));
    return { ok: !issues.some((i) => i.level === 'error'), issues };
  }

  function effectiveTerms(ctx) {
    const t = (ctx && ctx.terminology) || {};
    return Object.fromEntries(Object.keys(DEFAULT_TERMS).map((k) => [k, (t[k] || DEFAULT_TERMS[k]).toLowerCase()]));
  }

  /** Lectura síncrona del sobre guardado (la usa config.js al arrancar). Nunca lanza. */
  function readStored(namespace, storage) {
    try {
      const ls = storage || (typeof root.localStorage !== 'undefined' ? root.localStorage : null);
      if (!ls) return null;
      const raw = ls.getItem(`${namespace}:${STORAGE_KEY}`);
      if (!raw) return null;
      const env = JSON.parse(raw);
      const ctx = normalize(env && env.data);
      if (!ctx || !validate(ctx).ok) return null;
      return { ctx, savedAt: env.savedAt || null };
    } catch (e) { return null; }
  }

  /**
   * Deriva los campos de configuración que alimenta el Business Context.
   * `stored` = resultado de readStored (o null). Con null devuelve los valores actuales por defecto.
   * @returns { currency, business } — business es lo que queda en FP.config.business
   */
  function deriveConfig(stored, { defaultCurrency }) {
    if (!stored) {
      return { currency: defaultCurrency, business: { configured: false, source: 'default', schemaVersion: SCHEMA_VERSION, savedAt: null, name: null,
        terms: effectiveTerms(null), context: null } };
    }
    const c = stored.ctx;
    return {
      currency: c.business.currency && validCurrency(c.business.currency) ? c.business.currency : defaultCurrency,
      business: { configured: true, source: 'businessContext', schemaVersion: c.schemaVersion, savedAt: stored.savedAt, name: c.business.name,
        terms: effectiveTerms(c), context: c }
    };
  }

  /** Campos de la configuración que alimenta este contexto (documentación viva para la vista). */
  const FEEDS = [
    { config: 'config.business', from: 'Todo el contexto', effect: 'Disponible para vistas y fases futuras (narrativa, paquete, presentaciones).' },
    { config: 'config.business.name', from: 'Nombre del negocio', effect: 'Se muestra en el encabezado de la app.' },
    { config: 'config.currency', from: 'Moneda', effect: 'Formato de todas las cifras monetarias. Solo cambia cómo se muestran, no los montos.' },
    { config: 'config.business.terms', from: 'Terminología', effect: 'Disponible como contexto; los textos de la app todavía no se reemplazan.' }
  ];
  const DOES_NOT_CHANGE = ['Canales (config.channelIds): siguen siendo los cuatro actuales.', 'Métricas y fórmula (venta = volumen × CR × AOV).',
    'Métodos de forecast, diagnóstico, escenarios y recovery.', 'Datos cargados, plan congelado, versiones guardadas y exports.',
    'Geografía y catálogo reales de productos (estado, sucursal, categoría).'];

  /** Paquete portable (export/import): los datos del navegador no viajan entre equipos. */
  function toExport(ctx, meta = {}) {
    return { schema: 'business_context', schemaVersion: SCHEMA_VERSION, metadata: { exportedAt: new Date().toISOString(), ...meta }, context: ctx };
  }
  function fromImport(json) {
    if (!json || json.schema !== 'business_context') return { ok: false, error: 'El archivo no es un business_context.json.' };
    const ctx = normalize(json.context);
    if (!ctx) return { ok: false, error: `Versión de esquema no compatible (${json.schemaVersion}).` };
    const v = validate(ctx);
    return v.ok ? { ok: true, ctx, issues: v.issues } : { ok: false, error: v.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ') };
  }

  FP.businessContext = { SCHEMA_VERSION, STORAGE_KEY, OPTIONS, DEFAULT_TERMS, TERM_LABELS, FEEDS, DOES_NOT_CHANGE,
    empty, migrate, normalize, validate, validCurrency, effectiveTerms, readStored, deriveConfig, toExport, fromImport };
})(typeof window !== 'undefined' ? window : globalThis);
