/**
 * guideEngine.js — «Ahora haz esto» y el resumen de ofertas/oportunidades (propuesta B, simplificación del flujo).
 *
 * Solo LEE lo que ya existe (ofertas, promociones, sugerencias de activación) y calcula: el siguiente paso del flujo, los conteos
 * del resumen, la matriz prioridad × confianza y los grupos «Por revisar». No cambia nada, no inventa datos y no activa nada en el
 * sitio ni en la app; las acciones de un clic las ejecuta app.js con las mismas reglas de siempre (setState, createPromotion…).
 *
 *   nextStep(ctx)                    → { step, title, text, button, go, second?, note?, done? }  (el paso más adelantado con trabajo pendiente)
 *   allSteps(ctx)                    → [{ n, label, count, state:'done'|'now'|'todo' }]
 *   offerSummary(reg, an, recs, P)   → { total, byState, clean, review, groups[], matrix, noRec, aa, banner, soon, starting, altaSinOferta }
 *   opportunitySummary(recs, P)      → { total, matrix, noRec, aa[], banner }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const LEVELS = ['Alta', 'Media', 'Baja'];
  const STEP_LABEL = ['Cargar', 'Validar', 'Seleccionar', 'Crear promoción', 'Publicar', 'Medir'];
  const DAY = 86400000;

  const O = () => FP.offers;
  const alerts = (codes) => (codes || []).filter((c) => O().ISSUE[c] && O().ISSUE[c].level !== 'info');
  const addedToPromo = (o) => {   // la última nota manda: «Agregada…» la marca, «Quitada…» la libera
    let v = false;
    (o.history || []).forEach((h) => { if (h.field !== 'note') return; const t = String(h.to || ''); if (/^Agregada a la promoción/.test(t)) v = true; else if (/^Quitada de la promoción/.test(t)) v = false; });
    return v;
  };
  const dayDiff = (iso, today) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);

  /** Grupos de «Por revisar»: cada oferta cae en el primer motivo que le aplica, del más grave al menos grave. */
  const GROUPS = [
    { id: 'discount', codes: ['no_discount', 'bad_discount'], title: 'Sin descuento válido', text: 'El archivo no trae un descuento válido ni se puede calcular. No se puede validar así.', issue: 'error', blocks: true },
    { id: 'dates', codes: ['bad_dates'], title: 'Fechas inválidas', text: 'La fecha de fin es anterior a la de inicio. No se puede validar así.', issue: 'error', blocks: true },
    { id: 'dup', codes: ['dup_other', 'dup_batch'], title: 'Duplicadas', text: 'El mismo SKU aparece en otra oferta con fechas que se cruzan, o repetido en su archivo. Conviene quedarse con una.', issue: 'dup_other', blocks: false },
    { id: 'supply', codes: ['supply'], title: 'Abastecimiento', text: 'Agotado, descontinuado o con baja disponibilidad: activarlo genera visitas sin venta.', issue: 'supply', blocks: false },
    { id: 'nodates', codes: ['no_dates'], title: 'Sin vigencia', text: 'Falta inicio o fin. Se puede validar, pero sin fechas no se puede seleccionar.', issue: 'no_dates', blocks: false },
    { id: 'other', codes: [], title: 'Otros avisos', text: 'Datos que no cuadran (precio, descripción, celdas con error). Ábrelas para decidir.', issue: 'warn', blocks: false }
  ];
  function groupOf(codes) {
    const a = alerts(codes);
    for (const g of GROUPS) if (g.codes.length && a.some((c) => g.codes.indexOf(c) !== -1)) return g;
    return GROUPS[GROUPS.length - 1];
  }

  function emptyMatrix() { const m = {}; LEVELS.forEach((p) => { m[p] = { Alta: 0, Media: 0, Baja: 0 }; }); return m; }
  function addToMatrix(m, rec) {
    if (!rec || rec.blocked || rec.priority === '—' || !m[rec.priority] || m[rec.priority][rec.confidence] === undefined) return false;
    m[rec.priority][rec.confidence] += 1; return true;
  }
  function bannerInfo(recs, P, tab) {
    const slots = Math.max(0, Math.floor(+(P && P.bannerSlots) || 0)), mode = (P && P.bannerMode) || 'shared';
    const used = [...recs.values()].filter((r) => r.banner && (mode === 'perTab' ? r.tab === tab : true)).length;
    return { slots, used, shared: mode !== 'perTab' };
  }
  const isAA = (r) => !!r && !r.blocked && r.priority === 'Alta' && r.confidence === 'Alta';

  function offerSummary(reg, an, recs, P, today) {
    const byState = { received: 0, validated: 0, selected: 0, discarded: 0 };
    const matrix = emptyMatrix(); let noRec = 0, clean = 0, review = 0, soon = 0, starting = 0, aa = [];
    const groups = new Map();
    reg.offers.forEach((o) => {
      byState[o.state] += 1;
      if (o.state === 'discarded') return;
      const rec = recs.get(`offer:${o.offerId}`);
      if (!addToMatrix(matrix, rec)) noRec += 1;
      if (o.state === 'validated' && isAA(rec)) aa.push(o);
      if (today) {
        if (o.end && /^\d{4}-\d{2}-\d{2}$/.test(o.end)) { const d = dayDiff(o.end, today); if (d >= 0 && d <= 5) soon += 1; }
        if (o.start && /^\d{4}-\d{2}-\d{2}$/.test(o.start)) { const d = dayDiff(o.start, today); if (d >= 0 && d <= 5) starting += 1; }
      }
      if (o.state === 'received') {
        const codes = an.get(o.offerId) || [];
        if (!alerts(codes).length) clean += 1;
        else { review += 1; const g = groupOf(codes); if (!groups.has(g.id)) groups.set(g.id, { id: g.id, title: g.title, text: g.text, issue: g.issue, n: 0, ids: [] }); const x = groups.get(g.id); x.n += 1; x.ids.push(o.offerId); }
      }
    });
    const opAlta = [...recs.values()].filter((r) => r.tab === 'potential' && !r.blocked && r.priority === 'Alta').length;
    return {
      total: reg.offers.length, active: reg.offers.length - byState.discarded, byState, clean, review, matrix, noRec, aa,
      groups: GROUPS.filter((g) => groups.has(g.id)).map((g) => groups.get(g.id)),
      banner: bannerInfo(recs, P, 'offer'), soon, starting, altaSinOferta: opAlta
    };
  }

  /** Tres tarjetas de prioridad: cuántos SKU, cuántos con datos suficientes (confianza Alta) y por qué no hay más. */
  function priorityCards(matrix, recs, tab) {
    const cards = LEVELS.map((p) => {
      const row = matrix[p], n = row.Alta + row.Media + row.Baja;
      return { priority: p, n, sure: row.Alta, rest: row.Media + row.Baja };
    });
    const by = new Map();
    [...recs.values()].filter((r) => r.tab === tab && !r.blocked && r.priority === 'Alta' && r.confidence !== 'Alta')
      .forEach((r) => (r.missing || []).forEach((t) => { if (!by.has(t)) by.set(t, new Set()); by.get(t).add(r.sku); }));
    const top = [...by.entries()].map(([t, set]) => ({ text: t, n: set.size })).sort((a, b) => b.n - a.n || (a.text < b.text ? -1 : 1))[0] || null;
    cards[0].why = top ? top.text : '';
    return cards;
  }

  /**
   * Validación automática: las ofertas Recibidas sin ninguna alerta pasan solas a «Validada» (por «Automático»).
   * No toca las que ya tienen movimientos de estado (una devuelta a Recibida a mano se queda como la dejó la persona).
   */
  function autoValidate(reg, by) {
    const an = O().analyze(reg), done = [];
    reg.offers.forEach((o) => {
      if (o.state !== 'received' || alerts(an.get(o.offerId)).length) return;
      if ((o.history || []).some((h) => h.field === 'state')) return;
      const r = O().setState(reg, o.offerId, 'validated', { by: by || 'Automático', note: 'Sin alertas: validada automáticamente' });
      if (r.ok) done.push(o.offerId);
    });
    return done;
  }

  /** Por qué una validada de prioridad Alta/Alta no se puede seleccionar con un clic (para decirlo antes de aplicar). */
  function selectPlan(reg, an, recs) {
    const ok = [], out = { notAA: 0, blocked: [] };
    reg.offers.filter((o) => o.state === 'validated').forEach((o) => {
      const rec = recs.get(`offer:${o.offerId}`);
      if (!isAA(rec)) { out.notAA += 1; return; }
      const bl = O().blockers(an.get(o.offerId) || [], 'selected');
      if (bl.length) out.blocked.push({ id: o.offerId, sku: o.sku, why: bl.map((c) => O().ISSUE[c].text).join(' ') });
      else ok.push(o);
    });
    return { ok, out };
  }

  function opportunitySummary(recs, P) {
    const matrix = emptyMatrix(); let noRec = 0, total = 0; const aa = [];
    [...recs.values()].filter((r) => r.tab === 'potential').forEach((r) => { total += 1; if (!addToMatrix(matrix, r)) noRec += 1; if (isAA(r)) aa.push(r.sku); });
    return { total, matrix, noRec, aa, banner: bannerInfo(recs, P, 'potential') };
  }

  /**
   * Pasos del flujo con trabajo pendiente. ctx = { offers:[], promotions:[], today:'AAAA-MM-DD' }.
   * Se muestra el más adelantado del flujo; los demás quedan en «Ver todos los pasos».
   */
  function steps(ctx) {
    const offers = ctx.offers || [], promos = ctx.promotions || [], today = ctx.today;
    const cnt = (s) => offers.filter((o) => o.state === s).length;
    const received = cnt('received'), validated = cnt('validated');
    const selPending = offers.filter((o) => o.state === 'selected' && !addedToPromo(o)).length;
    const openPromos = promos.filter((p) => ['draft', 'proposed'].includes(p.status));
    const approved = promos.filter((p) => p.status === 'approved');
    const toMeasure = promos.filter((p) => ['published', 'measuring'].includes(p.status) && p.plannedEnd && p.plannedEnd < today);
    return {
      received, validated, selPending, openPromos, approved, toMeasure,
      list: [
        { n: 1, label: STEP_LABEL[0], count: offers.length || promos.length ? 0 : 1 },
        { n: 2, label: STEP_LABEL[1], count: received },
        { n: 3, label: STEP_LABEL[2], count: validated },
        { n: 4, label: STEP_LABEL[3], count: selPending + openPromos.length },
        { n: 5, label: STEP_LABEL[4], count: approved.length },
        { n: 6, label: STEP_LABEL[5], count: toMeasure.length }
      ]
    };
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function nextStep(ctx) {
    const s = steps(ctx), offers = ctx.offers || [];
    const mk = (n, title, text, button, go, extra) => Object.assign({ step: n, total: 6, title, text, button, go, done: false }, extra || {});
    if (s.toMeasure.length) { const p = s.toMeasure[0]; return mk(6, 'Mide cómo le fue', `«${p.name}» ya terminó su vigencia. Revisa su resultado y ciérrala con una conclusión.`, 'Ver resultados', { tab: 'resultados' }, s.toMeasure.length > 1 ? { note: `Hay ${s.toMeasure.length} promociones por medir.` } : {}); }
    if (s.approved.length) { const p = s.approved[0]; return mk(5, 'Publícala y anota dónde', `«${p.name}» está aprobada. Registra en qué espacios entra y cuándo la publicas.`, 'Registrar publicación', { tab: 'promos', open: p.promoId }, { note: 'Esta barra no publica nada: tú lo haces y aquí lo registras.' }); }
    if (s.selPending) {
      return mk(4, 'Arma la promoción con ellas', `Crea un borrador con las ${s.selPending} ofertas seleccionadas. Después pones objetivo y fechas.`, `Crear promoción con las ${s.selPending} seleccionadas`, { action: 'gd-create-promo' },
        s.openPromos.length ? { second: 'Agregarlas a una existente', secondGo: { tab: 'ofertas', filter: { state: 'selected' } } } : {});
    }
    if (s.openPromos.length) { const p = s.openPromos[0]; return mk(4, p.status === 'draft' ? 'Termina tu promoción y envíala' : 'Aprueba la promoción', `«${p.name}» está en ${p.status === 'draft' ? 'borrador' : 'propuesta'}. ${p.skus.length ? `Tiene ${plural(p.skus.length, 'SKU', 'SKU')}.` : 'Todavía no tiene SKU.'}`, 'Abrir la promoción', { tab: 'promos', open: p.promoId }); }
    if (s.validated) return mk(3, 'Elige cuáles sí vas a correr', `Marca como «Seleccionadas» las ofertas que te sirven. Hay ${plural(s.validated, 'validada', 'validadas')}.`, `Ver las ${s.validated} validadas`, { tab: 'ofertas', filter: { state: 'validated' } });
    if (s.received) return mk(2, 'Valida tus ofertas', `Revisa que cada oferta tenga descuento y fechas correctas. Hay ${plural(s.received, 'recibida', 'recibidas')} esperando.`, `Ver las ${s.received} por validar`, { tab: 'ofertas', filter: { state: 'received' } });
    if (!offers.length && !(ctx.promotions || []).length) return mk(1, 'Carga las ofertas que te mandaron', 'Sube el archivo del proveedor o comercial. Cada oferta queda como «Recibida» y no activa nada.', 'Cargar archivo de ofertas', { tab: 'ofertas' }, { second: 'Capturar una oferta a mano', secondGo: { tab: 'ofertas', manual: true } });
    return { step: 0, total: 6, done: true, title: 'No hay nada pendiente por ahora', text: 'Tus ofertas están revisadas y tus promociones avanzan. Cuando llegue algo nuevo, aquí te lo aviso.', button: '', go: null };
  }

  /** Para «Ver todos los pasos»: marca dónde estás y qué ya pasó. */
  function allSteps(ctx) {
    const s = steps(ctx), cur = nextStep(ctx).step;
    return s.list.map((x) => ({ n: x.n, label: x.label, count: x.count, state: cur === x.n ? 'now' : (x.count === 0 && (x.n < cur || cur === 0) ? 'done' : 'todo') }));
  }

  /** Nombre y fechas propuestos para una promoción creada a partir de ofertas seleccionadas. Solo usa lo que traen las ofertas. */
  function draftFromOffers(offers, reg, today) {
    const camps = [...new Set(offers.map((o) => { const b = O().batchOf(reg, o.batchId); return (o.campaignName || (b && b.campaign) || '').trim(); }).filter(Boolean))];
    const starts = offers.map((o) => o.start).filter(Boolean).sort(), ends = offers.map((o) => o.end).filter(Boolean).sort();
    return { name: camps.length === 1 ? camps[0] : `Promoción del ${today}`, campaign: camps.length === 1 ? camps[0] : '', plannedStart: starts[0] || '', plannedEnd: ends[ends.length - 1] || '' };
  }


  /**
   * Conteo de acciones sugeridas: cuántos SKU hay en cada una (SKU distintos; si un SKU está en dos ofertas cuenta una vez).
   * recs = Map de FP.activation.recommendAll; tab = 'offer' | 'potential'; stateOf(key) → estado de seguimiento de la sugerencia.
   */
  const SPACE_ORDER = ['banner', 'paid', 'crm', 'crmRepeat', 'home', 'search', 'ficha', 'category', 'social', 'review', 'none', 'soldout'];
  function actionCounts(recs, tab, stateOf) {
    const A = FP.activation, labelOrder = SPACE_ORDER.map((k) => A.SPACE[k]);
    const by = new Map();
    [...recs.values()].filter((r) => r.tab === tab).forEach((r) => {
      if (!by.has(r.main)) by.set(r.main, { label: r.main, skus: new Set(), a: new Set(), m: new Set(), b: new Set(), approved: new Set(), blocked: !!r.blocked, sale: 0 });
      const x = by.get(r.main);
      if (x.skus.has(r.sku)) return;
      x.skus.add(r.sku); if (Number.isFinite(r.revenue) && r.revenue > 0) x.sale += r.revenue;
      if (r.priority === 'Alta') x.a.add(r.sku); else if (r.priority === 'Media') x.m.add(r.sku); else if (r.priority === 'Baja') x.b.add(r.sku);
      const st = stateOf ? stateOf(r.key) : 'suggested';
      if (st === 'approved' || st === 'executed') x.approved.add(r.sku);
    });
    const rows = [...by.values()].map((x) => ({ label: x.label, n: x.skus.size, a: x.a.size, m: x.m.size, b: x.b.size, approved: x.approved.size, blocked: x.blocked, sale: x.sale > 0 ? x.sale : null }))
      .sort((p, q) => { const ip = labelOrder.indexOf(p.label), iq = labelOrder.indexOf(q.label); return (ip < 0 ? 99 : ip) - (iq < 0 ? 99 : iq); });
    const skus = new Set(); [...recs.values()].filter((r) => r.tab === tab).forEach((r) => skus.add(r.sku));
    return { rows, total: skus.size, max: rows.reduce((m, r) => Math.max(m, r.n), 0) };
  }

  /** Qué dato falta para decidir mejor, contado por SKU distinto (sale de las razones escritas de cada sugerencia). */
  function missingCounts(recs, tab, limit) {
    const by = new Map();
    [...recs.values()].filter((r) => r.tab === tab && !r.blocked).forEach((r) => (r.missing || []).forEach((t) => { if (!by.has(t)) by.set(t, new Set()); by.get(t).add(r.sku); }));
    return [...by.entries()].map(([t, set]) => ({ text: t, n: set.size })).sort((p, q) => q.n - p.n || (p.text < q.text ? -1 : 1)).slice(0, limit || 5);
  }

  /** Contra el archivo de sugerencias que compartió otra área: coinciden, difieren y sin sugerencia cargada (por SKU). */
  function compareExternal(recs, tab, external) {
    const out = { match: 0, differ: 0, none: 0, unknown: 0, loaded: !!(external && external.rows) };
    if (!out.loaded) return out;
    const seen = new Set();
    [...recs.values()].filter((r) => r.tab === tab && !r.blocked).forEach((r) => {
      if (seen.has(r.sku)) return; seen.add(r.sku);
      const e = external.rows[r.sku];
      if (!e) { out.none += 1; return; }
      const c = FP.activation.compare(r, e.space);
      if (c === 'match' || c === 'second') out.match += 1; else if (c === 'differ') out.differ += 1; else out.unknown += 1;
    });
    return out;
  }

  FP.guide = { actionCounts, missingCounts, compareExternal, LEVELS, GROUPS, groupOf, alerts, addedToPromo, isAA, offerSummary, selectPlan, opportunitySummary, steps, nextStep, allSteps, draftFromOffers, priorityCards, autoValidate };
})(typeof window !== 'undefined' ? window : globalThis);
