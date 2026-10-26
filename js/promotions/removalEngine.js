/**
 * removalEngine.js — eliminar ofertas recibidas y promociones (propuesta B, simplificación del flujo).
 *
 * Eliminar NO es descartar ni cancelar: quita el registro. Por eso tiene reglas y deja una línea en el «Registro de eliminaciones»
 * (qué, cuántas, quién, cuándo, por qué; sin precios ni descuentos). Funciones puras sobre los registros; app.js guarda y repinta.
 *
 *   offerPlan(offerReg, promoReg, ids)      → { ok:[ofertas], blocked:[{ offer, why }] }
 *   removeOffers(offerReg, promoReg, ids)   → { ok, removed, snapshot, blocked }     (snapshot sirve para restoreOffers)
 *   restoreOffers(offerReg, snapshot)
 *   promoPlan(promo)                        → { ok, heavy, impact[] }   (toda promoción se puede eliminar; las que ya avanzaron piden confirmación reforzada)
 *   removePromotion(promoReg, offerReg, promoId, meta) → { ok, snapshot, released } | { ok:false, error }
 *   restorePromotion(promoReg, snapshot)
 *   emptyLog / hydrateLog / addLog          → registro de eliminaciones
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const REMOVABLE = ['received', 'validated', 'discarded'];
  const LIVE = ['approved', 'published', 'measuring', 'closed'];
  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const fail = (error) => ({ ok: false, error });

  /** Promoción (no cancelada) que ya incluye esta oferta, o null. */
  function promotionOf(promoReg, offerId) {
    return ((promoReg && promoReg.promotions) || []).find((p) => p.status !== 'cancelled' && (p.skus || []).some((s) => s.offerId === offerId)) || null;
  }

  function offerPlan(offerReg, promoReg, ids) {
    const set = new Set(ids), ok = [], blocked = [];
    offerReg.offers.forEach((o) => {
      if (!set.has(o.offerId)) return;
      if (!REMOVABLE.includes(o.state)) { blocked.push({ offer: o, why: 'Está en promoción: devuélvela a Validada primero.' }); return; }
      const p = promotionOf(promoReg, o.offerId);
      if (p) { blocked.push({ offer: o, why: `Ya está en la promoción «${p.name}»: quítala de ahí primero.` }); return; }
      ok.push(o);
    });
    return { ok, blocked };
  }

  function removeOffers(offerReg, promoReg, ids) {
    const plan = offerPlan(offerReg, promoReg, ids);
    if (!plan.ok.length) return Object.assign(fail('No hay ofertas que se puedan eliminar.'), { blocked: plan.blocked });
    const gone = new Set(plan.ok.map((o) => o.offerId)), snapshot = { offers: [], batches: [] };
    offerReg.offers.forEach((o, i) => { if (gone.has(o.offerId)) snapshot.offers.push({ o, i }); });
    offerReg.offers = offerReg.offers.filter((o) => !gone.has(o.offerId));
    const touched = new Set(plan.ok.map((o) => o.batchId));
    offerReg.batches.forEach((b, i) => { if (touched.has(b.batchId) && !offerReg.offers.some((o) => o.batchId === b.batchId)) snapshot.batches.push({ b, i }); });
    const dropB = new Set(snapshot.batches.map((x) => x.b.batchId));
    offerReg.batches = offerReg.batches.filter((b) => !dropB.has(b.batchId));
    return { ok: true, removed: plan.ok, snapshot, blocked: plan.blocked };
  }

  function restoreOffers(offerReg, snapshot) {
    const have = new Set(offerReg.offers.map((o) => o.offerId));
    snapshot.batches.slice().sort((a, b) => a.i - b.i).forEach((x) => { if (!offerReg.batches.some((b) => b.batchId === x.b.batchId)) offerReg.batches.splice(Math.min(x.i, offerReg.batches.length), 0, x.b); });
    snapshot.offers.slice().sort((a, b) => a.i - b.i).forEach((x) => { if (!have.has(x.o.offerId)) offerReg.offers.splice(Math.min(x.i, offerReg.offers.length), 0, x.o); });
    return snapshot.offers.length;
  }

  /**
   * Cualquier promoción se puede eliminar. Las que ya avanzaron (aprobada, publicada, medida) o tienen cortes de evaluación llevan
   * un aviso reforzado: se pierde su historial y su medición, así que hay que confirmarlo (ack) y conviene exportarla antes.
   */
  function promoPlan(p) {
    if (!p) return { ok: false, why: 'No encuentro esa promoción.', heavy: false, impact: [] };
    const everLive = (p.history || []).some((h) => h.field === 'status' && LIVE.includes(h.to));
    const evals = (p.evaluations || []).length, acts = (p.activations || []).length;
    const heavy = everLive || LIVE.includes(p.status) || evals > 0;
    const impact = [];
    if (everLive || LIVE.includes(p.status)) impact.push('estuvo aprobada o publicada');
    if (p.baseline) impact.push('su línea base congelada');
    if (acts) impact.push(`${acts} ${acts === 1 ? 'activación registrada' : 'activaciones registradas'}`);
    if (evals) impact.push(`${evals} ${evals === 1 ? 'corte de evaluación' : 'cortes de evaluación'}`);
    return { ok: true, why: '', heavy, impact };
  }

  function removePromotion(promoReg, offerReg, promoId, meta) {
    const m = meta || {}, i = promoReg.promotions.findIndex((p) => p.promoId === promoId);
    if (i < 0) return fail('No encuentro esa promoción.');
    const p = promoReg.promotions[i], plan = promoPlan(p);
    if (!plan.ok) return fail(plan.why);
    if (!clean(m.by)) return fail('Escribe tu nombre: la eliminación guarda quién la hizo.');
    if (!clean(m.reason)) return fail('Escribe el motivo para eliminar.');
    if (plan.heavy && !m.ack) return fail('Esta promoción ya avanzó: confirma que entiendes que se pierde su historial y su medición.');
    const released = [];
    (p.skus || []).forEach((s) => {
      if (!s.offerId || !FP.offers) return;
      const o = FP.offers.find(offerReg, s.offerId); if (!o) return;
      FP.offers.addNote(offerReg, o.offerId, `Quitada de la promoción ${promoId} (eliminada)`, m.by); released.push(o.offerId);
    });
    promoReg.promotions.splice(i, 1);
    promoReg.retired = Array.from(new Set((promoReg.retired || []).concat(promoId)));
    return { ok: true, snapshot: { promo: p, index: i, released }, released, skus: (p.skus || []).length };
  }

  function restorePromotion(promoReg, snapshot) {
    if (promoReg.promotions.some((p) => p.promoId === snapshot.promo.promoId)) return false;
    promoReg.promotions.splice(Math.min(snapshot.index, promoReg.promotions.length), 0, snapshot.promo);
    promoReg.retired = (promoReg.retired || []).filter((x) => x !== snapshot.promo.promoId);
    return true;
  }

  /* ---------- Registro de eliminaciones ---------- */
  const MAX_LOG = 200;
  const emptyLog = () => ({ version: 1, entries: [] });
  function hydrateLog(raw) { return raw && Array.isArray(raw.entries) ? { version: 1, entries: raw.entries.filter((e) => e && e.at && e.what).slice(0, MAX_LOG) } : emptyLog(); }
  function addLog(log, e) {
    log.entries.unshift({ at: e.at || new Date().toISOString(), kind: e.kind, what: clean(e.what), n: e.n || 1, by: clean(e.by), reason: clean(e.reason) });
    if (log.entries.length > MAX_LOG) log.entries.length = MAX_LOG;
    return log;
  }

  FP.removal = { REMOVABLE, promotionOf, offerPlan, removeOffers, restoreOffers, promoPlan, removePromotion, restorePromotion, emptyLog, hydrateLog, addLog };
})(typeof window !== 'undefined' ? window : globalThis);
