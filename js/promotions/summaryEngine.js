/**
 * summaryEngine.js — Resumen de promociones (propuesta B): qué pedimos, qué llegó y qué falta.
 *
 * Solo cuenta y agrupa lo que ya existe (propuestas exportadas, ofertas recibidas, promociones); no calcula venta, margen ni efecto.
 *
 *   registro de propuestas = { version: 1, seq, proposals: [{ id, name, at, by, skus: [sku] }] }   (se agrega una al exportar el Excel de propuesta)
 *   build({ offers, batches, proposals, promotions, oppTotal, oppItems, campaign, group }) → { funnel, rows, total, pending, campaigns, group }
 *
 * Reglas de conteo (las mismas de la maqueta aprobada):
 *  - «SKU propuestos» = SKU que están en alguna propuesta exportada. Un SKU en dos propuestas cuenta una vez.
 *  - Las ofertas descartadas no cuentan como ofertas recibidas.
 *  - Un SKU con varias ofertas cuenta una vez en «SKU» y varias en «Ofertas recibidas». Su laboratorio, programa y categoría
 *    salen de su oferta con mayor descuento (la categoría y el laboratorio, si la oferta no los trae, del catálogo de producto en Oportunidades). Sin dato: «Sin laboratorio», etc.
 *  - «Sin oferta» = SKU propuestos sin ninguna oferta recibida. «Recibidas fuera de propuesta» = ofertas de SKU que no están en ninguna propuesta.
 *  - «Seleccionadas» = SKU propuestos cuya mejor oferta está seleccionada. «En promoción» = SKU propuestos que están en el plan de una
 *    promoción en propuesta, aprobada, publicada, en medición o cerrada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const GROUPS = { cat: 'Categoría', lab: 'Laboratorio', prog: 'Programa' };
  const NONE = { cat: 'Sin categoría', lab: 'Sin laboratorio', prog: 'Sin programa' };
  const IN_PROMO = ['proposed', 'approved', 'published', 'measuring', 'closed'];
  const RANK = { selected: 3, validated: 2, received: 1 };
  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  function createRegistry() { return { version: 1, seq: 0, proposals: [] }; }
  function hydrate(raw) {
    const base = createRegistry();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.proposals)) return base;
    base.proposals = raw.proposals.filter((p) => p && p.id && Array.isArray(p.skus)).map((p) => ({ id: String(p.id), name: clean(p.name), at: clean(p.at), by: clean(p.by), skus: [...new Set(p.skus.map(clean).filter(Boolean))] }));
    base.seq = Math.max(Number(raw.seq) || 0, base.proposals.length);
    return base;
  }
  /** Registra una exportación de propuesta. El nombre es obligatorio; no se exige que sea único (se pueden exportar variantes). */
  function register(reg, input) {
    const name = clean(input && input.name), skus = [...new Set(((input && input.skus) || []).map(clean).filter(Boolean))];
    if (!name) return { ok: false, error: 'La propuesta necesita un nombre.' };
    if (!skus.length) return { ok: false, error: 'La propuesta no tiene SKU.' };
    reg.seq += 1;
    const p = { id: `PRP-${String(reg.seq).padStart(4, '0')}`, name, at: new Date().toISOString(), by: clean(input.by), skus };
    reg.proposals.push(p);
    return { ok: true, proposal: p };
  }

  function build(input) {
    const inp = input || {}, group = GROUPS[inp.group] ? inp.group : 'cat', campaign = clean(inp.campaign);
    const batchCamp = new Map((inp.batches || []).map((b) => [b.batchId, clean(b.campaign)]));
    const campaigns = [...new Set((inp.batches || []).map((b) => clean(b.campaign)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const offers = (inp.offers || []).filter((o) => o.state !== 'discarded' && (!campaign || batchCamp.get(o.batchId) === campaign));
    const proposed = new Set(); (inp.proposals || []).forEach((p) => p.skus.forEach((s) => proposed.add(s)));
    const promoSkus = new Set();
    (inp.promotions || []).filter((p) => IN_PROMO.indexOf(p.status) !== -1).forEach((p) => (p.skus || []).forEach((s) => promoSkus.add(s.sku)));
    const catOf = new Map(), brandOf = new Map(); (inp.oppItems || []).forEach((i) => { if (i.category) catOf.set(i.sku, i.category); if (i.brand) brandOf.set(i.sku, i.brand); });

    const bySku = new Map();
    offers.forEach((o) => { if (!bySku.has(o.sku)) bySku.set(o.sku, []); bySku.get(o.sku).push(o); });
    const skus = new Set([...proposed, ...bySku.keys()]);
    const items = [...skus].map((sku) => {
      const of = (bySku.get(sku) || []).slice().sort((a, b) => (fin(b.discount) ? b.discount : -1) - (fin(a.discount) ? a.discount : -1));
      const top = of[0] || null;
      const best = of.reduce((m, o) => (RANK[o.state] > (RANK[m] || 0) ? o.state : m), '');
      return { sku, prop: proposed.has(sku), offers: of, best, promo: promoSkus.has(sku),
        cat: clean(top && top.category) || catOf.get(sku) || '', lab: clean(top && top.lab) || brandOf.get(sku) || '', prog: clean(top && top.program) };
    });

    const agg = (list) => {
      const o = { sp: 0, con: 0, sin: 0, of: 0, ds: 0, dn: 0, sel: 0, pr: 0, fuera: 0 };
      list.forEach((r) => {
        if (r.prop) {
          o.sp += 1; if (r.offers.length) o.con += 1; else o.sin += 1;
          o.of += r.offers.length; r.offers.forEach((x) => { if (fin(x.discount)) { o.ds += x.discount; o.dn += 1; } });
          if (r.best === 'selected') o.sel += 1; if (r.promo) o.pr += 1;
        } else o.fuera += r.offers.length;
      });
      o.cover = o.sp ? o.con / o.sp : null; o.avg = o.dn ? o.ds / o.dn : null;
      return o;
    };
    const by = new Map();
    items.forEach((r) => { const k = r[group] || NONE[group]; if (!by.has(k)) by.set(k, []); by.get(k).push(r); });
    const rows = [...by.entries()].map(([label, list]) => Object.assign({ label }, agg(list)))
      .sort((a, b) => b.sp - a.sp || b.of - a.of || a.label.localeCompare(b.label, 'es'));
    const total = agg(items);

    const propItems = items.filter((r) => r.prop);
    const funnel = {
      detected: fin(inp.oppTotal) ? inp.oppTotal : null, proposed: total.sp, withOffer: total.con,
      validated: propItems.filter((r) => r.best === 'validated' || r.best === 'selected').length, selected: total.sel, inPromo: total.pr
    };
    const pending = {
      received: offers.filter((o) => o.state === 'received').length,
      validated: offers.filter((o) => o.state === 'validated').length,
      noOffer: total.sin,
      outside: total.fuera
    };
    return { group, campaign, campaigns, funnel, rows, total, pending, proposals: (inp.proposals || []).slice().reverse() };
  }

  FP.summary = { GROUPS, NONE, IN_PROMO, createRegistry, hydrate, register, build };
})(typeof window !== 'undefined' ? window : globalThis);
