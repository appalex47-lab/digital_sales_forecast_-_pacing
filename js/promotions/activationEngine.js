/**
 * activationEngine.js — Activación de ofertas y oportunidades (propuesta B, etapa ACTIVACIÓN).
 *
 * Sugiere DÓNDE colocar y QUÉ hacer con cada oferta recibida y con cada oportunidad (producto sin oferta). Son reglas explícitas,
 * editables y con su razón escrita: no miden efecto, no usan margen, no estiman inventario y no inventan descuentos ni precios.
 * Lo que falta para decidir mejor se lista fila por fila. Un registro pequeño (`activation`) guarda los parámetros y el estado
 * de cada sugerencia (Sugerida, Aprobada, Ejecutada, Descartada); es solo una etiqueta: no bloquea nada.
 *
 *   recommendAll({ offers, items, profiles, params }) → Map(clave → recomendación)
 *     clave = `offer:<offerId>` para una oferta, `sku:<sku>` para una oportunidad sin oferta vigente.
 *     recomendación = { key, tab, sku, main, second, priority, confidence, why, missing[], banner, blocked, rule, bannerNote }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const SETTINGS = {
    discountHigh: 25,        // % de descuento desde el que una oferta cuenta como «descuento alto»
    bannerSlots: 3,          // espacios de banner principal
    bannerMode: 'shared',    // 'shared' = un tope entre Ofertas recibidas y Oportunidades; 'perTab' = uno por pestaña
    longMechanic: 140,       // caracteres desde los que una mecánica se considera larga de explicar en un banner
    chronicCategories: ''    // categorías que el usuario declara de uso crónico, separadas por coma (el dato no viene en los archivos)
  };
  const STATES = { suggested: 'Sugerida', approved: 'Aprobada', executed: 'Ejecutada', discarded: 'Descartada' };
  const SPACE = { banner: 'Banner principal', home: 'Cuadrícula Home', category: 'Cuadrícula de categoría', search: 'Buscador / cuadrícula de categoría', paid: 'Pauta', crm: 'CRM (WhatsApp / correo)',
    crmRepeat: 'CRM: recordatorio de recompra', social: 'Redes sociales', ficha: 'Ficha + CRM', review: 'Revisar antes de colocar', none: 'No activar', soldout: 'No activar ahora' };

  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const pct = (v) => (fin(v) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : 's/d');
  const num = (v) => (fin(v) ? `${Math.round(v * 10) / 10} %` : 's/d');
  const CONF = { high: 'Alta', medium: 'Media', low: 'Baja' };

  function mechanicKind(text, longAt) {
    const t = norm(text);
    if (!t) return 'none';
    if (/escalon/.test(t) || t.length > (longAt || SETTINGS.longMechanic)) return 'tiered';
    if (/\b\d\s*\+\s*\d\b/.test(t)) return 'nxm';
    return 'simple';
  }
  function chronicSet(params) { return new Set(String(params.chronicCategories || '').split(',').map(norm).filter(Boolean)); }

  /** Decide la sugerencia de una entrada. No conoce el tope de banner: solo marca `banner` y lo asigna recommendAll. */
  function decide(e, P, chronic) {
    const p = e.profile || null, d = e.discountPct, hi = fin(d) && d >= P.discountHigh, types = p ? p.typeIds : [];
    const has = (id) => types.indexOf(id) !== -1;
    const missing = [];
    let confidence = p ? CONF[p.evidence] || 'Baja' : 'Baja';
    if (!p) missing.push('Sin venta ni funnel de este SKU en el periodo analizado.');
    const ctl = norm(e.controlled);
    const ctlKnown = !!ctl && ctl.charAt(0) !== '#';
    const mk = (main, second, priority, why, extra) => Object.assign({ key: e.key, tab: e.tab, sku: e.sku, main, second, priority, confidence, why, missing, banner: false, blocked: false }, extra || {});

    if (ctlKnown && ctl !== 'ningun control') return mk(SPACE.none, '—', '—', `Tipo de control: ${clean(e.controlled)}. Solo se promociona «Ningún Control».`, { blocked: true, confidence: 'Alta', rule: 'control', missing: [] });
    if (!ctlKnown) missing.push('Tipo de control no disponible: verificar que sea «Ningún Control» antes de activar.');
    if (/agotad|descontinu/.test(norm(e.supply))) return mk(SPACE.soldout, 'Reactivar al reabastecer', '—', `El producto aparece como «${clean(e.supply)}». Activarlo genera visitas sin venta.`, { blocked: true, confidence: 'Alta', rule: 'soldout', missing: ['Fecha de reabasto antes de la vigencia.'] });

    if (e.tab === 'offer' && mechanicKind(e.mechanic, P.longMechanic) === 'tiered') {
      missing.push('Sin datos de CRM no se mide la respuesta.');
      return mk(SPACE.ficha, SPACE.category, 'Media', 'La mecánica escalonada o larga no cabe en un banner. Se explica mejor en la ficha y en mensajes directos.', { rule: 'tiered' });
    }
    if (has('unconverted')) {
      missing.push('Precio de la competencia en el sitio.');
      return e.tab === 'offer'
        ? mk(SPACE.search, 'Mejorar ficha', 'Media', `Muchas vistas de ficha y conversión de ${pct(p.conv)} contra ${pct(p.medConv)} de su categoría. Ya tiene tráfico, así que la pauta no ayuda: la oferta debe atacar la decisión de compra.`, { rule: 'unconverted' })
        : mk(SPACE.search, 'Revisar ficha, precio y disponibilidad', 'Media', `Muchas vistas de ficha y conversión de ${pct(p.conv)} contra ${pct(p.medConv)} de su categoría. Antes de darle más espacio conviene revisar ficha, precio contra la competencia y disponibilidad.`, { rule: 'unconverted' });
    }
    if (e.tab === 'potential' && has('declining')) {
      missing.push('Causa de la caída: precio, abasto o posición.');
      return mk(SPACE.review, SPACE.category, 'Media', 'Su venta cae con vistas estables. Hay que entender la causa antes de darle espacio.', { rule: 'declining' });
    }
    if (has('lowVisibility')) {
      missing.push('Costo de pauta y datos de banners para medir.');
      const big = e.tab === 'offer' ? hi : has('highWeight');
      return big
        ? mk(SPACE.paid, SPACE.home, 'Alta', e.tab === 'offer' ? `Convierte bien pero pocos la ven, y el descuento (${num(d)}) es alto. Aquí el tráfico es lo que limita.` : 'Convierte bien, pocos la ven y pesa mucho en su categoría. Aquí el tráfico es lo que limita.', { rule: 'lowVisibility' })
        : mk(SPACE.home, SPACE.paid, 'Media', e.tab === 'offer' ? `Convierte bien pero pocos la ven. El descuento (${num(d)}) no justifica pauta; la cuadrícula da vistas sin costo.` : 'Convierte bien pero pocos la ven. La cuadrícula da vistas sin costo.', { rule: 'lowVisibility' });
    }
    const bannerOk = e.tab === 'offer'
      ? has('highWeight') && hi
      : has('highWeight') && p && fin(p.conv) && fin(p.medConv) && p.conv >= p.medConv;
    if (bannerOk) {
      missing.push('Inventario no verificado.');
      return mk(SPACE.banner, SPACE.home, 'Alta', e.tab === 'offer'
        ? `Pesa ${pct(p.share)} de la venta de su categoría y el descuento (${num(d)}) es alto. Es de los que más venta mueven en el espacio principal.`
        : `Mucho potencial: pesa ${pct(p.share)} de la venta de su categoría y su conversión (${pct(p.conv)}) no está bajo la mediana (${pct(p.medConv)}). Sin descuento, el banner se decide por venta y embudo.`, { banner: true, rule: 'banner' });
    }
    const isChronic = e.use === 'chronic' || (e.use !== 'acute' && chronic.has(norm(e.category)));
    if (e.tab === 'offer' && clean(e.program)) {
      missing.push('Lista de clientes y datos de CRM.');
      return mk(SPACE.crm, SPACE.category, 'Media', `La oferta trae programa («${clean(e.program)}»). Se comunica mejor directo a quienes ya compran con ese programa.`, { rule: 'program' });
    }
    if (e.tab === 'potential' && isChronic && has('growing')) {
      missing.push('Lista de clientes y datos de CRM.');
      return mk(SPACE.crmRepeat, SPACE.category, 'Media', 'Es de una categoría declarada de uso crónico y está creciendo. Un recordatorio de recompra no necesita descuento.', { rule: 'chronic' });
    }
    if (e.tab === 'offer' && hi) {
      missing.push('Sin datos de redes sociales no se mide.');
      return mk(SPACE.social, SPACE.category, 'Baja', `El descuento (${num(d)}) llama la atención y no hay una regla más específica.`, { rule: 'social' });
    }
    missing.push('Más evidencia del producto (vistas, conversión, tendencia).');
    return mk(SPACE.category, '—', 'Baja', 'Ninguna regla específica aplica. Es la ubicación por defecto.', { confidence: 'Baja', rule: 'default' });
  }

  function recommendAll(input) {
    const inp = input || {}, P = Object.assign({}, SETTINGS, inp.params || {}), chronic = chronicSet(P);
    const profiles = inp.profiles || new Map(), out = new Map(), entries = [];
    const activeOffer = new Set(), skuUse = new Map();
    (inp.offers || []).forEach((o) => { if (o.use && !skuUse.has(o.sku)) skuUse.set(o.sku, o.use); });
    (inp.offers || []).forEach((o) => {
      if (o.state === 'discarded') return;
      activeOffer.add(o.sku);
      entries.push({ key: `offer:${o.offerId}`, tab: 'offer', sku: o.sku, category: o.category, discountPct: fin(o.discount) ? o.discount * 100 : null, mechanic: o.mechanic, program: o.program,
        controlled: o.controlled, supply: [o.supplyComment, o.catStatus].filter(Boolean).join(' '), profile: profiles.get(o.sku) || null });
    });
    (inp.items || []).forEach((i) => {
      if (activeOffer.has(i.sku)) return;
      entries.push({ key: `sku:${i.sku}`, tab: 'potential', sku: i.sku, category: i.category, discountPct: null, mechanic: '', program: '', controlled: '', supply: '', use: skuUse.get(i.sku) || '',
        profile: profiles.get(i.sku) || { revenue: i.revenue, views: i.views, conv: i.conversion, medConv: i.categoryMedianConversion, share: i.categoryShare, typeIds: i.types.map((t) => t.id), evidence: i.evidence.level } });
    });
    const recs = entries.map((e) => { const r = decide(e, P, chronic); r.revenue = e.profile && fin(e.profile.revenue) ? e.profile.revenue : 0; out.set(r.key, r); return r; });

    // Tope de banner: compiten por venta; el descuento no da ventaja (una oferta gana espacio solo si vende más).
    const slots = Math.max(0, Math.floor(+P.bannerSlots || 0)), used = { offer: 0, potential: 0, all: 0 };
    recs.filter((r) => r.banner).sort((a, b) => b.revenue - a.revenue).forEach((r) => {
      const bucket = P.bannerMode === 'perTab' ? r.tab : 'all';
      if (used[bucket] < slots) { used[bucket] += 1; return; }
      r.main = SPACE.home; r.second = 'Banner si queda espacio'; r.priority = 'Media'; r.banner = false;
      r.bannerNote = `El banner se limita a ${slots} espacio(s)${P.bannerMode === 'perTab' ? ' en esta pestaña' : ' entre Ofertas y plan y Qué impulsar'}, por mayor venta; pasa a cuadrícula.`;
      r.why += ` ${r.bannerNote}`;
    });
    return out;
  }

  /* ---------- Sugerencias de otros (archivo cargado) ---------- */
  /** Lleva un texto libre de canal o espacio («Home», «WhatsApp», «Pauta Meta»…) a una clave comparable; '' si no lo reconozco. */
  function spaceKey(text) {
    const t = norm(text);
    if (!t) return '';
    if (/banner/.test(t)) return 'banner';
    if (/buscador|search/.test(t)) return 'search';
    if (/categoria/.test(t)) return 'category';
    if (/cuadricula|grid|home|landing|primera posicion/.test(t)) return 'home';
    if (/pauta|paid|ads|google|meta|sem\b/.test(t)) return 'paid';
    if (/crm|whatsapp|correo|email|mail|push|sms/.test(t)) return 'crm';
    if (/\brrss\b|redes|social|instagram|facebook|tiktok/.test(t)) return 'social';
    return '';
  }
  /** Compara la sugerencia de la herramienta con la de otros: 'match' | 'second' | 'differ' | 'unknown' | '' (sin sugerencia cargada). */
  function compare(rec, extText) {
    if (!clean(extText)) return '';
    const k = spaceKey(extText); if (!k) return 'unknown';
    if (spaceKey(rec.main) === k) return 'match';
    if (spaceKey(rec.second) === k) return 'second';
    return 'differ';
  }
  const COMPARE = { match: 'Coincide', second: 'Coincide con la segunda opción', differ: 'Difiere', unknown: 'No reconocí el canal', '': '' };

  /* ---------- Registro: parámetros y estado de cada sugerencia ---------- */
  function createRegistry() { return { version: 1, params: Object.assign({}, SETTINGS), items: {}, external: null }; }
  function hydrate(raw) {
    const base = createRegistry();
    if (!raw || typeof raw !== 'object') return base;
    base.params = Object.assign(base.params, raw.params || {});
    if (raw.external && typeof raw.external === 'object' && raw.external.rows) base.external = raw.external;
    if (raw.items && typeof raw.items === 'object') Object.keys(raw.items).forEach((k) => { const it = raw.items[k]; if (it && STATES[it.state]) base.items[k] = Object.assign({ history: [] }, it); });
    return base;
  }
  function setParams(reg, patch) {
    const p = Object.assign({}, reg.params);
    if ('discountHigh' in patch) { const n = Number(String(patch.discountHigh).replace(',', '.')); if (!(n >= 0 && n <= 100)) return { ok: false, error: 'El descuento alto debe estar entre 0 y 100.' }; p.discountHigh = n; }
    if ('bannerSlots' in patch) { const n = Number(patch.bannerSlots); if (!(Number.isInteger(n) && n >= 0 && n <= 20)) return { ok: false, error: 'Los espacios de banner deben ser un entero entre 0 y 20.' }; p.bannerSlots = n; }
    if ('bannerMode' in patch) { if (['shared', 'perTab'].indexOf(patch.bannerMode) === -1) return { ok: false, error: 'Modo de banner no reconocido.' }; p.bannerMode = patch.bannerMode; }
    if ('chronicCategories' in patch) p.chronicCategories = clean(patch.chronicCategories).slice(0, 500);
    reg.params = p; return { ok: true };
  }
  function setState(reg, key, to, by, note) {
    if (!STATES[to]) return { ok: false, error: 'Estado no reconocido.' };
    if (!clean(by)) return { ok: false, error: 'Escribe tu nombre para registrar quién cambia el estado.' };
    if (to === 'discarded' && !clean(note)) return { ok: false, error: 'Descartar pide un motivo.' };
    const prev = reg.items[key] ? reg.items[key].state : 'suggested', at = new Date().toISOString();
    if (to === 'suggested') { delete reg.items[key]; return { ok: true }; }
    const it = reg.items[key] || { history: [] };
    it.history = (it.history || []).concat([{ at, from: prev, to, by: clean(by), note: clean(note) }]);
    it.state = to; it.by = clean(by); it.at = at; it.note = clean(note);
    reg.items[key] = it; return { ok: true };
  }
  function setExternal(reg, ext) {
    const rows = ext && ext.rows ? ext.rows : null;
    if (!rows || !Object.keys(rows).length) return { ok: false, error: 'El archivo no trae filas con SKU y canal.' };
    reg.external = { fileName: clean(ext.fileName), at: new Date().toISOString(), by: clean(ext.by), rows };
    return { ok: true, count: Object.keys(rows).length };
  }
  function clearExternal(reg) { reg.external = null; return { ok: true }; }
  const stateOf = (reg, key) => (reg.items[key] ? reg.items[key].state : 'suggested');

  FP.activation = { SETTINGS, STATES, SPACE, mechanicKind, decide, recommendAll, createRegistry, hydrate, setParams, setState, stateOf, spaceKey, compare, COMPARE, setExternal, clearExternal };
})(typeof window !== 'undefined' ? window : globalThis);
