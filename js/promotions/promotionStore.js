/**
 * promotionStore.js — Registro de promociones (propuesta B, fase 1).
 *
 * Guarda lo que una persona decide y lo que ocurre en la ejecución. NUNCA copia venta ni funnel: la medición posterior
 * los lee por SKU y fecha. Nada de este módulo calcula venta, incremental ni efecto causal.
 *
 *   registry   = { version: 1, promotions: [promotion] }
 *   promotion  = { promoId, name, channel, objective, plannedStart, plannedEnd, status, createdBy, approvedBy,
 *                  proposalName, skus: [promoSku], activations: [activation], incidents: [incident],
 *                  evaluations: [corte de evaluación, solo se agregan], conclusion, recommendation, createdAt, history: [{ at, field, from, to, note, by }] }
 *   promoSku   = { sku, name, mechanic, condition, origin, offerId, reason, realStart, realEnd, note }
 *   activation = { id, space, location, start, end, status, owner, evidence }
 *
 * Reglas: el identificador (promoId) se crea una vez y no cambia; los cambios se agregan a `history` (append-only);
 * recibir o registrar no activa nada en web ni app.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const STATUS = { draft: 'Borrador', proposed: 'Borrador · en aprobación', approved: 'Aprobada', published: 'En marcha · publicada', measuring: 'En marcha · en medición', closed: 'Cerrada', cancelled: 'Cancelada' };
  const NEXT = { draft: ['proposed'], proposed: ['approved', 'draft'], approved: ['published', 'proposed'], published: ['measuring'], measuring: ['closed'], closed: [], cancelled: [] };
  const OBJECTIVES = { sales: 'Venta', conversion: 'Conversión', traffic: 'Tráfico', recover: 'Recuperar venta', clearance: 'Liquidación', launch: 'Lanzamiento', other: 'Otro' };
  const ORIGINS = { digital: 'Oportunidad digital', offer: 'Oferta recibida', manual: 'Manual' };
  const SPACES = { banner: 'Banner', grid: 'Cuadrícula', search: 'Buscador', paid: 'Pauta', email: 'Correo', other: 'Otro' };
  const ACT_STATUS = { planned: 'Planeada', requested: 'Solicitada', live: 'Publicada', removed: 'Retirada' };
  const RECOMMENDATIONS = { repeat: 'Repetir', adjust: 'Ajustar', stop: 'No repetir' };

  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  const nowISO = () => new Date().toISOString();
  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (error) => ({ ok: false, error });

  function createRegistry() { return { version: 1, promotions: [], retired: [] }; }

  function hydrate(raw) {
    if (!raw || !Array.isArray(raw.promotions)) return createRegistry();
    return { version: 1, retired: Array.isArray(raw.retired) ? raw.retired.filter((x) => typeof x === 'string') : [], promotions: raw.promotions.filter((p) => p && p.promoId).map((p) => Object.assign({ skus: [], activations: [], incidents: [], evaluations: [], history: [] }, p)) };
  }

  /** Parte legible del identificador: MAYÚSCULAS sin acentos, guiones, hasta 16 caracteres. */
  function slugOf(name) {
    const s = clean(name).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16).replace(/-+$/g, '');
    return s || 'PROMO';
  }

  /** Siguiente consecutivo del año: máximo + 1 (tras cancelar no se repiten). */
  function nextId(reg, name, year) {
    const y = String(year || new Date().getFullYear());
    const max = reg.promotions.map((p) => p.promoId).concat(reg.retired || []).reduce((m, id) => {   // los identificadores eliminados no se reutilizan
      const mm = /^PRM-(\d{4})-(\d{4})/.exec(id); return mm && mm[1] === y ? Math.max(m, Number(mm[2])) : m;
    }, 0);
    return `PRM-${y}-${String(max + 1).padStart(4, '0')}-${slugOf(name)}`;
  }

  function log(p, field, from, to, note, by) { p.history.push({ at: nowISO(), field, from: from === undefined ? null : from, to: to === undefined ? null : to, note: note || null, by: clean(by) || null }); }

  const find = (reg, promoId) => reg.promotions.find((p) => p.promoId === promoId) || null;

  /** Aviso (no bloqueo) si ya hay una promoción con el mismo nombre en el mismo mes y canal. */
  function duplicateNameWarning(reg, { name, channel, plannedStart }, exceptId = null) {
    const month = clean(plannedStart).slice(0, 7), nm = clean(name).toLowerCase();
    const hit = reg.promotions.find((p) => p.promoId !== exceptId && p.status !== 'cancelled' && clean(p.name).toLowerCase() === nm && (p.channel || 'ecommerce') === (clean(channel) || 'ecommerce') && clean(p.plannedStart).slice(0, 7) === month);
    return hit ? `Ya existe «${hit.name}» (${hit.promoId}) con el mismo nombre en ese mes y canal.` : null;
  }

  function createPromotion(reg, a = {}, opts = {}) {
    const name = clean(a.name);
    if (!name) return fail('Escribe el nombre de la promoción.');
    if (!clean(a.createdBy)) return fail('Escribe quién crea la promoción.');
    if (a.plannedStart && !isISO(a.plannedStart)) return fail('La fecha de inicio planeada no es válida (AAAA-MM-DD).');
    if (a.plannedEnd && !isISO(a.plannedEnd)) return fail('La fecha de fin planeada no es válida (AAAA-MM-DD).');
    if (a.plannedStart && a.plannedEnd && a.plannedEnd < a.plannedStart) return fail('El fin planeado es anterior al inicio.');
    const warnings = [];
    const dup = duplicateNameWarning(reg, a); if (dup) warnings.push(dup);
    const year = a.plannedStart ? a.plannedStart.slice(0, 4) : (opts.year || new Date().getFullYear());
    const p = {
      promoId: nextId(reg, name, year), name, channel: clean(a.channel) || 'ecommerce', objective: OBJECTIVES[a.objective] ? a.objective : 'sales',
      plannedStart: clean(a.plannedStart) || null, plannedEnd: clean(a.plannedEnd) || null, status: 'draft',
      createdBy: clean(a.createdBy), approvedBy: null, proposalName: clean(a.proposalName) || null, campaign: clean(a.campaign) || null,
      skus: [], activations: [], incidents: [], conclusion: null, recommendation: null, createdAt: nowISO(), history: []
    };
    log(p, 'status', null, 'draft', `Creada. Identificador asignado: ${p.promoId}`, p.createdBy);
    reg.promotions.push(p);
    return ok({ promotion: p, warnings });
  }

  const EDITABLE = ['name', 'channel', 'objective', 'plannedStart', 'plannedEnd', 'proposalName', 'campaign'];
  function updatePromotion(reg, promoId, fields = {}, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (p.status === 'closed' || p.status === 'cancelled') return fail('Una promoción cerrada o cancelada ya no se edita.');
    const next = {};
    for (const k of Object.keys(fields)) {
      if (!EDITABLE.includes(k)) return fail(`El campo «${k}» no se puede editar (el identificador nunca cambia).`);
      next[k] = clean(fields[k]) || null;
    }
    if ('name' in next) {
      if (!next.name) return fail('El nombre no puede quedar vacío.');
      if (!['draft', 'proposed'].includes(p.status)) return fail('El nombre solo se edita en borrador o propuesta.');
    }
    const ps = 'plannedStart' in next ? next.plannedStart : p.plannedStart, pe = 'plannedEnd' in next ? next.plannedEnd : p.plannedEnd;
    if (ps && !isISO(ps)) return fail('La fecha de inicio planeada no es válida (AAAA-MM-DD).');
    if (pe && !isISO(pe)) return fail('La fecha de fin planeada no es válida (AAAA-MM-DD).');
    if (ps && pe && pe < ps) return fail('El fin planeado es anterior al inicio.');
    if ('objective' in next && !OBJECTIVES[next.objective]) return fail('Objetivo no reconocido.');
    const warnings = [];
    if ('name' in next || 'plannedStart' in next || 'channel' in next) {
      const dup = duplicateNameWarning(reg, { name: 'name' in next ? next.name : p.name, channel: 'channel' in next ? next.channel : p.channel, plannedStart: ps }, p.promoId); if (dup) warnings.push(dup);
    }
    Object.keys(next).forEach((k) => { if (p[k] !== next[k]) { log(p, k, p[k], next[k], null, by); p[k] = next[k]; } });
    return ok({ promotion: p, warnings });
  }

  function addSku(reg, promoId, s = {}, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (!['draft', 'proposed'].includes(p.status)) return fail('Solo se agregan SKU en borrador o propuesta.');
    const sku = clean(s.sku); if (!sku) return fail('Falta el SKU.');
    if (p.skus.some((x) => x.sku === sku)) return fail(`El SKU ${sku} ya está en esta promoción.`);
    const origin = ORIGINS[s.origin] ? s.origin : 'manual';
    if (origin === 'manual' && !clean(s.reason)) return fail('Un SKU agregado a mano necesita su razón.');
    const rec = { sku, name: clean(s.name) || null, mechanic: clean(s.mechanic) || null, condition: clean(s.condition) || null, origin, offerId: clean(s.offerId) || null,
      reason: clean(s.reason) || null, realStart: null, realEnd: null, note: clean(s.note) || null };
    p.skus.push(rec); log(p, 'sku+', null, sku, `Origen: ${ORIGINS[origin]}`, by);
    return ok({ sku: rec });
  }

  function removeSku(reg, promoId, sku, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (!['draft', 'proposed'].includes(p.status)) return fail('Solo se quitan SKU en borrador o propuesta.');
    const i = p.skus.findIndex((x) => x.sku === sku); if (i < 0) return fail('El SKU no está en la promoción.');
    p.skus.splice(i, 1); log(p, 'sku-', sku, null, null, by); return ok();
  }

  const SKU_EDIT = ['name', 'mechanic', 'condition', 'reason', 'note', 'realStart', 'realEnd'];
  function updateSku(reg, promoId, sku, fields = {}, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (p.status === 'closed' || p.status === 'cancelled') return fail('Una promoción cerrada o cancelada ya no se edita.');
    const s = p.skus.find((x) => x.sku === sku); if (!s) return fail('El SKU no está en la promoción.');
    const next = {};
    for (const k of Object.keys(fields)) {
      if (!SKU_EDIT.includes(k)) return fail(`El campo «${k}» del SKU no se puede editar.`);
      next[k] = clean(fields[k]) || null;
      if ((k === 'realStart' || k === 'realEnd') && next[k] && !isISO(next[k])) return fail('La fecha real no es válida (AAAA-MM-DD).');
      if ((k === 'realStart' || k === 'realEnd') && !['published', 'measuring'].includes(p.status)) return fail('Las fechas reales se registran cuando la promoción está publicada o en medición.');
    }
    const rs = 'realStart' in next ? next.realStart : s.realStart, re = 'realEnd' in next ? next.realEnd : s.realEnd;
    if (rs && re && re < rs) return fail('El fin real es anterior al inicio real.');
    Object.keys(next).forEach((k) => { if (s[k] !== next[k]) { log(p, `sku:${sku}:${k}`, s[k], next[k], null, by); s[k] = next[k]; } });
    return ok({ sku: s });
  }

  function addActivation(reg, promoId, a = {}, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (p.status === 'closed' || p.status === 'cancelled') return fail('Una promoción cerrada o cancelada ya no se edita.');
    if (!SPACES[a.space]) return fail('Elige el espacio o medio.');
    if (a.start && !isISO(a.start)) return fail('La fecha de inicio de la activación no es válida.');
    if (a.end && !isISO(a.end)) return fail('La fecha de fin de la activación no es válida.');
    if (a.start && a.end && a.end < a.start) return fail('El fin de la activación es anterior al inicio.');
    const n = p.activations.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;
    const act = { id: `ACV_${String(n).padStart(3, '0')}`, space: a.space, location: clean(a.location) || null, start: clean(a.start) || null, end: clean(a.end) || null,
      status: ACT_STATUS[a.status] ? a.status : 'planned', owner: clean(a.owner) || null, evidence: clean(a.evidence) || null };
    p.activations.push(act); log(p, 'activation+', null, `${act.id} ${SPACES[act.space]}`, null, by);
    return ok({ activation: act });
  }

  function setActivationStatus(reg, promoId, actId, status, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    const a = p.activations.find((x) => x.id === actId); if (!a) return fail('La activación no existe.');
    if (!ACT_STATUS[status]) return fail('Estado de activación no reconocido.');
    if (p.status === 'closed' || p.status === 'cancelled') return fail('Una promoción cerrada o cancelada ya no se edita.');
    if (a.status !== status) { log(p, `activation:${actId}:status`, a.status, status, null, by); a.status = status; }
    return ok({ activation: a });
  }

  function addIncident(reg, promoId, text, date, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (!clean(text)) return fail('Describe la incidencia.');
    if (date && !isISO(date)) return fail('La fecha de la incidencia no es válida.');
    const inc = { at: clean(date) || nowISO().slice(0, 10), text: clean(text), by: clean(by) || null };
    p.incidents.push(inc); log(p, 'incident+', null, inc.text, null, by); return ok({ incident: inc });
  }

  /**
   * Guarda un corte de evaluación (instantánea). Solo se agrega: nunca se edita ni se reemplaza.
   * Guarda lo que hace falta para releerlo sin recalcular: método, ventanas, totales y conceptos. No copia la venta diaria.
   */
  function addEvaluation(reg, promoId, ev, by = '') {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (!['published', 'measuring', 'closed'].includes(p.status)) return fail('Solo se guarda un corte cuando la promoción está publicada, en medición o cerrada.');
    if (!ev || !ev.counts || !ev.counts.evaluable) return fail('No hay nada evaluable que guardar.');
    if (!clean(by)) return fail('Escribe tu nombre para guardar el corte.');
    const snap = { id: `EV-${String((p.evaluations || []).length + 1).padStart(3, '0')}`, at: nowISO(), by: clean(by), cutoff: ev.dataMax, method: ev.method, settings: ev.settings,
      counts: ev.counts, totals: ev.totals, concepts: ev.concepts, warnings: (ev.warnings || []).map((w) => ({ code: w.code, level: w.level, text: w.text })),
      items: (ev.items || []).map((i) => ({ sku: i.sku, status: i.status, reason: i.reason || null, window: i.window || null, actual: i.actual || null, expected: i.expected || null, growth: i.growth || null, incremental: i.incremental || null, baseline: i.baseline || null })) };
    p.evaluations = p.evaluations || []; p.evaluations.push(snap);
    log(p, 'evaluation+', null, snap.id, `Corte al ${snap.cutoff}`, by);
    return ok({ evaluation: snap });
  }

  /**
   * Cambio de estado con reglas. `a` = { by, approvedBy, note, conclusion, recommendation, today }.
   * Devuelve { ok, error?, warnings? }. Un cambio rechazado no modifica nada.
   */
  function setStatus(reg, promoId, to, a = {}) {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (to === 'cancelled') {
      if (['closed', 'cancelled'].includes(p.status)) return fail('Esta promoción ya está cerrada o cancelada.');
      if (!clean(a.note)) return fail('Para cancelar escribe el motivo.');
      log(p, 'status', p.status, 'cancelled', clean(a.note), a.by); p.status = 'cancelled'; return ok();
    }
    if (!STATUS[to]) return fail('Estado no reconocido.');
    if (!NEXT[p.status].includes(to)) return fail(`No se puede pasar de «${STATUS[p.status]}» a «${STATUS[to]}».`);
    const warnings = [];
    if (to === 'proposed') {
      if (!p.skus.length) return fail('Agrega al menos un SKU antes de enviar como propuesta.');
    }
    if (to === 'approved') {
      if (!p.skus.length) return fail('Agrega al menos un SKU antes de aprobar.');
      if (!p.plannedStart || !p.plannedEnd) return fail('Para aprobar define la vigencia planeada (inicio y fin).');
      const by = clean(a.approvedBy); if (!by) return fail('Escribe quién aprueba.');
      if (by.toLowerCase() === clean(p.createdBy).toLowerCase()) return fail('Quien aprueba debe ser distinto de quien crea.');
      p.approvedBy = by;
    }
    if (to === 'published') {
      const missing = p.skus.filter((s) => !s.realStart).length;
      if (missing) warnings.push(`${missing} SKU sin fecha real de inicio: la medición necesitará esa fecha.`);
      if (!p.activations.length) warnings.push('No hay activaciones registradas (banner, cuadrícula, pauta…).');
    }
    if (to === 'measuring') {
      const end = p.skus.map((s) => s.realEnd).filter(Boolean).sort().pop() || p.plannedEnd;
      const today = a.today || nowISO().slice(0, 10);
      if (!end || today <= end) return fail('Todavía no termina la vigencia: aún no hay venta posterior para medir.');
    }
    if (to === 'closed') {
      if (!clean(a.conclusion)) return fail('Para cerrar escribe la conclusión.');
      if (!RECOMMENDATIONS[a.recommendation]) return fail('Elige la recomendación: repetir, ajustar o no repetir.');
      p.conclusion = clean(a.conclusion); p.recommendation = a.recommendation;
    }
    log(p, 'status', p.status, to, clean(a.note) || null, to === 'approved' ? clean(a.approvedBy) : a.by);
    if (to === 'proposed' && p.baseline) { delete p.baseline; log(p, 'baseline', 'congelada', null, 'Se quitó la línea base al regresar a propuesta; se congela de nuevo al aprobar.', a.by); }
    p.status = to;
    return ok({ warnings });
  }

  /**
   * Guarda la línea base congelada (la calcula FP.promotionEvaluation.freeze). Solo con la promoción aprobada o publicada y sin medición cerrada.
   * Reemplazarla queda en el historial.
   */
  function setBaseline(reg, promoId, baseline, a = {}) {
    const p = find(reg, promoId); if (!p) return fail('La promoción no existe.');
    if (!['approved', 'published'].includes(p.status)) return fail('La línea base solo se congela con la promoción aprobada o publicada.');
    if (!baseline || !baseline.skus) return fail('No hay línea base que guardar.');
    const had = Boolean(p.baseline);
    p.baseline = baseline;
    log(p, 'baseline', had ? 'congelada' : null, 'congelada', `${baseline.rows} días-SKU de venta de referencia${baseline.dataMax ? `, venta cargada hasta ${baseline.dataMax}` : ''}${clean(a.note) ? `. ${clean(a.note)}` : ''}`, a.by);
    return ok();
  }

  /** SKU-día compartidos entre promociones vivas (mismo SKU, vigencias que se cruzan). Solo informativo. */
  function overlaps(reg, promoId) {
    const p = find(reg, promoId); if (!p) return [];
    const span = (q, s) => [s.realStart || q.plannedStart, s.realEnd || q.plannedEnd];
    const out = [];
    p.skus.forEach((s) => {
      const [a0, a1] = span(p, s); if (!a0 || !a1) return;
      reg.promotions.forEach((q) => {
        if (q.promoId === p.promoId || q.status === 'cancelled' || q.status === 'draft') return;
        const t = q.skus.find((x) => x.sku === s.sku); if (!t) return;
        const [b0, b1] = span(q, t); if (!b0 || !b1) return;
        const from = a0 > b0 ? a0 : b0, to = a1 < b1 ? a1 : b1;
        if (from <= to) out.push({ sku: s.sku, other: q.promoId, otherName: q.name, from, to });
      });
    });
    return out;
  }

  /**
   * Promociones registradas cuya vigencia toca [start, end] (para textos de hipótesis e impacto). No incluye borradores,
   * propuestas ni canceladas. Con `sku`, solo las que lo incluyen. Usa fechas reales del SKU si existen, si no las planeadas.
   */
  function activeIn(reg, { start, end, sku = null, channel = null } = {}) {
    if (!reg || !Array.isArray(reg.promotions) || !start) return [];
    const e = end || start;
    return reg.promotions.filter((p) => ['approved', 'published', 'measuring', 'closed'].includes(p.status) && (!channel || channel === 'total' || p.channel === channel)).filter((p) => {
      const list = sku ? p.skus.filter((s) => s.sku === sku) : p.skus;
      if (!list.length) return false;
      return list.some((s) => { const a = s.realStart || p.plannedStart, b = s.realEnd || p.plannedEnd; return a && b && a <= e && b >= start; });
    });
  }

  /**
   * Notas aditivas para otras pantallas (hipótesis, impacto, prioridades). Solo devuelven texto cuando hay promociones
   * registradas que tocan las fechas; sin registro devuelven null y esas pantallas quedan exactamente como antes.
   */
  FP.promotionNotes = {
    provider: null,   // la app lo fija a () => registro vigente
    registry() { try { return this.provider ? this.provider() : null; } catch (e) { return null; } },
    hasAny() { const r = this.registry(); return !!(r && r.promotions && r.promotions.some((p) => !['draft', 'cancelled'].includes(p.status))); },
    forRange(range, channel = null, sku = null) {
      const r = this.registry(); if (!r || !range || !range[0]) return null;
      const list = activeIn(r, { start: range[0], end: range[1] || range[0], channel, sku });
      if (!list.length) return null;
      return `Promociones registradas en esas fechas: ${list.map((p) => `${p.name} (${p.promoId})`).join('; ')}. Compara el cambio con sus fechas antes de concluir.`;
    }
  };

  FP.promotions = { STATUS, NEXT, OBJECTIVES, ORIGINS, SPACES, ACT_STATUS, RECOMMENDATIONS, createRegistry, hydrate, slugOf, nextId, find, createPromotion, updatePromotion,
    addSku, removeSku, updateSku, addActivation, setActivationStatus, addIncident, addEvaluation, setStatus, setBaseline, overlaps, activeIn, duplicateNameWarning };
})(typeof window !== 'undefined' ? window : globalThis);
