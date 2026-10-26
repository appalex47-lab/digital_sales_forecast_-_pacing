/**
 * campaignGoals.js — Meta numérica por campaña (propuesta B).
 *
 * Una meta es una cifra que la persona decide para una campaña (por ejemplo «Buen Fin»): venta y/o unidades. La herramienta no la propone ni la calcula.
 * El avance se lee de las promociones que declaran esa campaña: suma la venta REAL durante la promoción de cada una, de la evaluación al día y,
 * si no se pudo calcular, del último corte guardado (siempre con su fecha de datos). No es venta incremental ni demuestra causalidad.
 *
 *   goal = { campaign, revenue, units, note, createdBy, createdAt, updatedAt, history: [{ at, field, from, to, by }] }
 *   setGoal(reg, campaign, { revenue, units, note }, by) → { ok, goal } | { ok:false, error }
 *   progress(goal, promotions, live?) → { promos, missing, revenue, units, pctRevenue, pctUnits, status }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const clean = (s) => String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' ');
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const nowISO = () => new Date().toISOString();
  const ok = (x) => Object.assign({ ok: true }, x || {});
  const fail = (error) => ({ ok: false, error });
  const MEASURED = ['published', 'measuring', 'closed'];

  const createRegistry = () => ({ version: 1, goals: [] });
  function hydrate(raw) {
    if (!raw || !Array.isArray(raw.goals)) return createRegistry();
    return { version: 1, goals: raw.goals.filter((g) => g && clean(g.campaign)).map((g) => Object.assign({ revenue: null, units: null, note: '', history: [] }, g)) };
  }
  const norm = (s) => clean(s).toLowerCase();
  const find = (reg, campaign) => reg.goals.find((g) => norm(g.campaign) === norm(campaign)) || null;
  const log = (g, field, from, to, by) => g.history.push({ at: nowISO(), field, from: from === undefined ? null : from, to: to === undefined ? null : to, by: clean(by) || null });
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  function setGoal(reg, campaign, f = {}, by = '') {
    const name = clean(campaign); if (!name) return fail('Elige o escribe la campaña.');
    if (!clean(by)) return fail('Escribe tu nombre arriba: la meta guarda quién la fijó.');
    const revenue = num(f.revenue), units = num(f.units);
    for (const [v, label] of [[revenue, 'venta'], [units, 'unidades']]) if (v !== null && (!fin(v) || v < 0)) return fail(`La meta de ${label} debe ser un número de cero o más.`);
    if (!(revenue > 0) && !(units > 0)) return fail('Escribe al menos una meta mayor que cero: venta o unidades.');
    let g = find(reg, name);
    if (!g) { g = { campaign: name, revenue: null, units: null, note: '', createdBy: clean(by), createdAt: nowISO(), updatedAt: nowISO(), history: [] }; reg.goals.push(g); log(g, 'created', null, name, by); }
    const nr = revenue > 0 ? revenue : null, nu = units > 0 ? units : null, note = clean(f.note);
    if (g.revenue !== nr) { log(g, 'revenue', g.revenue, nr, by); g.revenue = nr; }
    if (g.units !== nu) { log(g, 'units', g.units, nu, by); g.units = nu; }
    if ((g.note || '') !== note) { log(g, 'note', g.note || null, note || null, by); g.note = note; }
    g.updatedAt = nowISO();
    return ok({ goal: g });
  }

  function removeGoal(reg, campaign, by = '') {
    const g = find(reg, campaign); if (!g) return fail('Esa campaña no tiene meta.');
    if (!clean(by)) return fail('Escribe tu nombre arriba para quitar la meta.');
    reg.goals = reg.goals.filter((x) => x !== g); return ok({ removed: g });
  }

  /** Campañas conocidas: las de los lotes de ofertas, las de las promociones y las que ya tienen meta. */
  function campaignsOf(offersReg, promos, reg) {
    const set = new Map();
    const add = (n) => { const c = clean(n); if (c && !set.has(norm(c))) set.set(norm(c), c); };
    ((offersReg && offersReg.batches) || []).forEach((b) => add(b.campaign));
    (promos || []).forEach((p) => add(p.campaign));
    ((reg && reg.goals) || []).forEach((g) => add(g.campaign));
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }

  const overlap = (a, b) => a && b && a.start <= b.end && b.start <= a.end;
  const within = (a, b) => a && b && a.start >= b.start && a.end <= b.end;

  /**
   * Avance de una meta. Fuente de cada promoción, en este orden: evaluación al día (`live`) y, si no hay, el último corte guardado.
   * `live` = { [promoId]: resultado } (también se acepta { promoId, result }). Cada resultado trae `items` por SKU.
   * Un SKU que aparece en dos promociones de la campaña con fechas que se traslapan cuenta una sola vez: si la ventana del segundo cabe entera
   * en la del primero se descarta (`dupes`); si solo se traslapa en parte se conserva y se avisa (`partial_overlap`), porque no hay venta por día en los cortes.
   * Una promoción sin evaluación ni corte va en `missing`: no suma y el avance se marca «parcial».
   */
  function progress(goal, promotions, live) {
    const L = !live ? {} : live.promoId && live.result ? { [live.promoId]: live.result } : live;
    const mine = (promotions || []).filter((p) => norm(p.campaign) === norm(goal.campaign) && MEASURED.includes(p.status));
    const promos = [], missing = [], dupes = [], partial = [], seen = new Map();
    mine.forEach((p) => {
      let src = null; const lv = L[p.promoId];
      if (lv && lv.counts && lv.counts.evaluable) src = { kind: 'live', cutoff: lv.dataMax, items: lv.items || [], counts: lv.counts };
      else { const c = (p.evaluations || []).slice(-1)[0]; if (c && c.counts && c.counts.evaluable) src = { kind: 'cut', cutoff: c.cutoff, items: c.items || [], counts: c.counts, id: c.id }; }
      if (!src) { missing.push({ promoId: p.promoId, name: p.name }); return; }
      let revenue = 0, units = 0, inc = 0, n = 0;
      src.items.filter((i) => i.status === 'ok' && i.actual).forEach((i) => {
        const prev = seen.get(i.sku) || [];
        if (prev.some((w) => within(i.window, w))) { dupes.push({ sku: i.sku, promoId: p.promoId }); return; }
        if (prev.some((w) => overlap(i.window, w))) partial.push({ sku: i.sku, promoId: p.promoId });
        prev.push(i.window); seen.set(i.sku, prev);
        revenue += fin(i.actual.revenue) ? i.actual.revenue : 0; units += fin(i.actual.units) ? i.actual.units : 0; inc += i.incremental && fin(i.incremental.revenue) ? i.incremental.revenue : 0; n += 1;
      });
      promos.push({ promoId: p.promoId, name: p.name, source: src.kind, cutoff: src.cutoff, cutId: src.id || null, revenue, units, incremental: inc, evaluable: src.counts.evaluable, counted: n, total: src.counts.total });
    });
    const sum = (k) => promos.reduce((t, x) => t + (fin(x[k]) ? x[k] : 0), 0);
    const revenue = sum('revenue'), units = sum('units');
    const cutoffs = promos.map((x) => x.cutoff).filter(Boolean).sort();
    return { promos, missing, dupes, partial, revenue, units, incremental: sum('incremental'), cutoffMin: cutoffs[0] || null, cutoffMax: cutoffs.slice(-1)[0] || null,
      allLive: promos.length > 0 && promos.every((x) => x.source === 'live'),
      pctRevenue: goal.revenue > 0 && promos.length ? revenue / goal.revenue : null, pctUnits: goal.units > 0 && promos.length ? units / goal.units : null,
      status: !mine.length ? 'no_promos' : !promos.length ? 'no_data' : missing.length ? 'partial' : 'ok' };
  }

  /* ---------- Ticket por unidad (venta ÷ unidades) para orientar si la meta principal va en venta o en unidades ---------- */
  const TICKET_BAND = 0.25, BAND_MIN = 0.10, MIN_WEEKS = 6;   // tolerancia máxima (y la de respaldo) del precio por unidad implícito, mínima y semanas necesarias para ajustarla sola
  const median = (a) => { const v = a.filter(fin).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

  /** rows = [{ sku, category, revenue, units }] de una ventana. Devuelve el ticket por unidad por categoría y la mediana entre categorías (el corte alto/bajo). */
  function ticketStats(rows) {
    const cat = new Map();
    (rows || []).forEach((r) => { if (!(r.units > 0) || !fin(r.revenue)) return; const k = clean(r.category) || 'Sin categoría'; const x = cat.get(k) || { category: k, revenue: 0, units: 0, skus: 0 }; x.revenue += r.revenue; x.units += r.units; x.skus += 1; cat.set(k, x); });
    const byCategory = [...cat.values()].map((x) => Object.assign(x, { ticket: x.revenue / x.units })).sort((a, b) => b.ticket - a.ticket);
    const cut = median(byCategory.map((x) => x.ticket));
    byCategory.forEach((x) => { x.level = cut === null ? null : x.ticket >= cut ? 'alto' : 'bajo'; });
    const R = byCategory.reduce((t, x) => t + x.revenue, 0), U = byCategory.reduce((t, x) => t + x.units, 0);
    return { byCategory, cut, overall: U > 0 ? R / U : null, skus: byCategory.reduce((t, x) => t + x.skus, 0) };
  }
  /** Ticket por unidad de un conjunto de SKU (los de la campaña). */
  function campaignTicket(skus, rows) {
    const set = new Set(skus || []); let R = 0, U = 0, n = 0;
    (rows || []).forEach((r) => { if (set.has(r.sku) && r.units > 0 && fin(r.revenue)) { R += r.revenue; U += r.units; n += 1; } });
    return { ticket: U > 0 ? R / U : null, skus: n, asked: set.size };
  }
  /**
   * Punto de partida de la meta: el ritmo de venta reciente de los SKU de la campaña llevado a los días que dura la campaña.
   * revenue = venta de los SKU en la ventana ÷ días de la ventana × días de la campaña (lo mismo para unidades).
   * NO incluye el efecto de la promoción: es lo que se vendería al ritmo de hoy; cuánto más se espera lo decide la persona.
   */
  function baselineSuggestion(skus, rows, windowDays, campaignDays) {
    if (!(windowDays > 0) || !(campaignDays > 0)) return null;
    const set = new Set(skus || []); let R = 0, U = 0, n = 0;
    (rows || []).forEach((r) => { if (set.has(r.sku) && fin(r.revenue) && r.revenue > 0) { R += r.revenue; U += fin(r.units) ? r.units : 0; n += 1; } });
    if (!n) return null;
    const k = campaignDays / windowDays;
    return { revenue: R * k, units: U > 0 ? U * k : null, skus: n, windowDays, campaignDays };
  }
  /** Qué meta principal sugiere el ticket: alto → venta, bajo → unidades. */
  function suggestMain(ticket, cut) { return !fin(ticket) || !fin(cut) ? null : ticket >= cut ? 'revenue' : 'units'; }
  /**
   * Tolerancia que se ajusta sola. Se mide cuánto se mueve de una semana a otra el precio por unidad de los SKU de la campaña (por la mezcla de productos):
   * tolerancia = 2 × (desviación estándar ÷ promedio) de ese precio semanal, entre 10 % y 25 %. Con menos de 6 semanas con venta no hay base: se usa 25 %.
   * `weeks` = lista de semanas, cada una con filas [{ sku, revenue, units }].
   */
  function autoBand(weeks, skus) {
    const set = new Set(skus || []), t = [];
    (weeks || []).forEach((rows) => { let R = 0, U = 0; (rows || []).forEach((r) => { if (set.has(r.sku) && r.units > 0 && fin(r.revenue)) { R += r.revenue; U += r.units; } }); if (U > 0) t.push(R / U); });
    if (t.length < MIN_WEEKS) return { band: TICKET_BAND, auto: false, weeks: t.length, cv: null };
    const m = t.reduce((a, x) => a + x, 0) / t.length, sd = Math.sqrt(t.reduce((a, x) => a + (x - m) * (x - m), 0) / t.length), cv = m > 0 ? sd / m : null;
    if (cv === null) return { band: TICKET_BAND, auto: false, weeks: t.length, cv: null };
    return { band: Math.min(TICKET_BAND, Math.max(BAND_MIN, 2 * cv)), auto: true, weeks: t.length, cv };
  }
  /** Descuento promedio (0–1) de las ofertas de una campaña: por SKU se toma el mayor descuento y se promedian los SKU. Sin descuento válido → null. */
  function avgDiscount(offers) {
    const best = new Map();
    (offers || []).forEach((o) => { if (o && o.sku && fin(o.discount) && o.discount > 0 && o.discount < 1 && !(best.get(o.sku) >= o.discount)) best.set(o.sku, o.discount); });
    if (!best.size) return null;
    const v = [...best.values()]; return { avg: v.reduce((t, x) => t + x, 0) / v.length, skus: v.length };
  }
  /**
   * Precio por unidad implícito en las dos metas contra lo esperado. Lo esperado es el ticket histórico menos el descuento promedio de las ofertas
   * de la campaña (un descuento fuerte baja el precio por unidad y eso no es un error de captura). Sin descuento conocido se compara contra el histórico.
   */
  function impliedCheck(revenue, units, hist, discount, band) {
    if (!(revenue > 0) || !(units > 0)) return null;
    const implied = revenue / units;
    if (!fin(hist) || !(hist > 0)) return { implied, hist: null, expected: null, discount: null, ratio: null, off: false };
    const d = fin(discount) && discount > 0 && discount < 1 ? discount : 0, expected = hist * (1 - d), ratio = implied / expected - 1, b = fin(band) && band > 0 ? band : TICKET_BAND;
    return { implied, hist, expected, discount: d || null, ratio, band: b, off: Math.abs(ratio) > b };
  }

  FP.goals = { TICKET_BAND, BAND_MIN, MIN_WEEKS, createRegistry, hydrate, setGoal, removeGoal, find, campaignsOf, progress, ticketStats, campaignTicket, suggestMain, baselineSuggestion, avgDiscount, autoBand, impliedCheck };
})(typeof window !== 'undefined' ? window : globalThis);
