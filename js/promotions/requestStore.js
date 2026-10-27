/**
 * requestStore.js — Solicitudes de oferta a Comercial (se piden desde Oportunidades).
 *
 * Una solicitud dice: «de este SKU necesitamos una oferta». No guarda precios, descuentos, costos ni márgenes: solo qué se pidió,
 * quién, cuándo y cómo va. Se cierra sola cuando llega una oferta de ese SKU después de la fecha de la solicitud.
 *
 *   registry = { version: 1, seq, batchSeq, requests: [request] }
 *   request  = { reqId, batchId, sku, productCode, name, category, lab, reasons: [texto], to, state: 'asked'|'received'|'cancelled',
 *                askedAt, askedBy, note, receivedAt, offerId, history: [{ at, field, from, to, note, by }] }
 *
 * «Sin respuesta» no se guarda: se calcula al leer (pedida hace WAIT_DAYS días o más y todavía sin oferta).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const WAIT_DAYS = 7;
  const STATE = { asked: 'Pedida', received: 'Recibida', cancelled: 'Cancelada' };
  const VIEW = { none: 'Sin pedir', asked: 'Pedida', noReply: 'Sin respuesta', received: 'Recibida' };

  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const pad = (n, w) => String(n).padStart(w, '0');
  const nowISO = () => new Date().toISOString();
  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (error) => ({ ok: false, error });
  const day = (iso) => String(iso || '').slice(0, 10);
  function dayDiff(a, b) { return Math.round((Date.parse(`${day(b)}T00:00:00Z`) - Date.parse(`${day(a)}T00:00:00Z`)) / 86400000); }

  function createRegistry() { return { version: 1, seq: 0, batchSeq: 0, requests: [] }; }
  function hydrate(raw) {
    const reg = createRegistry();
    if (!raw || typeof raw !== 'object') return reg;
    reg.seq = Number(raw.seq) || 0; reg.batchSeq = Number(raw.batchSeq) || 0;
    if (Array.isArray(raw.requests)) reg.requests = raw.requests.filter((r) => r && r.reqId && r.sku && STATE[r.state]).map((r) => Object.assign({ history: [], reasons: [] }, r));
    return reg;
  }

  /** SKU que ya tienen una solicitud abierta (Pedida). */
  function openSkus(reg) { return new Set(reg.requests.filter((r) => r.state === 'asked').map((r) => r.sku)); }
  /** Última solicitud (la más reciente) de un SKU, o null. */
  function lastFor(reg, sku) { for (let i = reg.requests.length - 1; i >= 0; i--) if (reg.requests[i].sku === sku && reg.requests[i].state !== 'cancelled') return reg.requests[i]; return null; }

  /** Cómo va una solicitud: 'asked' | 'noReply' | 'received' | 'cancelled'. */
  function status(req, today) {
    if (req.state !== 'asked') return req.state;
    return today && dayDiff(req.askedAt, today) >= WAIT_DAYS ? 'noReply' : 'asked';
  }
  const daysOpen = (req, today) => (today ? Math.max(0, dayDiff(req.askedAt, today)) : 0);
  /** Estado para filtrar y mostrar por SKU: 'none' si nunca se pidió (o se canceló). */
  function viewOf(reg, sku, today) { const r = lastFor(reg, sku); return r ? status(r, today) : 'none'; }

  /**
   * Crea una solicitud por SKU en un mismo folio (PED-0001). items = [{ sku, productCode, name, category, lab, reasons }].
   * Los SKU que ya tienen una solicitud abierta se omiten y se devuelven en `skipped`.
   */
  function create(reg, items, opts) {
    const o = opts || {}, by = clean(o.by);
    if (!by) return fail('Escribe tu nombre: la solicitud guarda quién la pidió.');
    const list = (items || []).filter((i) => i && clean(i.sku));
    if (!list.length) return fail('No hay productos que pedir.');
    const open = openSkus(reg), created = [], skipped = [], seen = new Set();
    const at = o.now || nowISO();
    reg.batchSeq += 1; const batchId = `PED-${pad(reg.batchSeq, 4)}`;
    list.forEach((i) => {
      const sku = clean(i.sku);
      if (open.has(sku) || seen.has(sku)) { skipped.push(sku); return; }
      seen.add(sku); reg.seq += 1;
      const req = { reqId: `SOL-${pad(reg.seq, 5)}`, batchId, sku, productCode: clean(i.productCode), name: clean(i.name), category: clean(i.category), lab: clean(i.lab), reasons: (i.reasons || []).map(clean).filter(Boolean),
        to: clean(o.to) || 'Comercial', state: 'asked', askedAt: at, askedBy: by, note: clean(o.note), receivedAt: '', offerId: '', history: [{ at, field: 'created', from: null, to: 'asked', note: `Pedida a ${clean(o.to) || 'Comercial'} en ${batchId}`, by }] };
      reg.requests.push(req); created.push(req);
    });
    if (!created.length) { reg.batchSeq -= 1; return fail('Todos esos productos ya tienen una solicitud abierta.'); }
    return ok({ batchId, created, skipped });
  }

  /**
   * Cierra solas las solicitudes abiertas cuyo SKU recibió una oferta (no descartada) después de pedirla.
   * Devuelve los folios cerrados.
   */
  function reconcile(reg, offers, opts) {
    const done = [], by = (opts && opts.by) || 'Automático';
    reg.requests.forEach((r) => {
      if (r.state !== 'asked') return;
      const hit = (offers || []).find((o) => o.state !== 'discarded' && (o.sku === r.sku || (r.productCode && o.sku === r.productCode)) && day(o.receivedAt) >= day(r.askedAt));
      if (!hit) return;
      r.state = 'received'; r.receivedAt = hit.receivedAt || nowISO(); r.offerId = hit.offerId;
      r.history.push({ at: nowISO(), field: 'state', from: 'asked', to: 'received', note: `Llegó la oferta ${hit.offerId}`, by });
      done.push(r.reqId);
    });
    return done;
  }

  function cancel(reg, reqId, opts) {
    const r = reg.requests.find((x) => x.reqId === reqId); if (!r) return fail('No encontré esa solicitud.');
    if (r.state !== 'asked') return fail('Solo se puede cancelar una solicitud pedida.');
    const by = clean(opts && opts.by); if (!by) return fail('Escribe tu nombre: la cancelación guarda quién la hizo.');
    r.state = 'cancelled'; r.history.push({ at: (opts && opts.now) || nowISO(), field: 'state', from: 'asked', to: 'cancelled', note: clean(opts && opts.note) || 'Cancelada', by });
    return ok({ request: r });
  }

  /** Conteos para tarjetas y barra guía. */
  function summary(reg, today) {
    const s = { asked: 0, noReply: 0, received: 0, open: 0 };
    reg.requests.forEach((r) => { const st = status(r, today); if (st === 'asked') { s.asked += 1; s.open += 1; } else if (st === 'noReply') { s.noReply += 1; s.open += 1; } else if (st === 'received') s.received += 1; });
    return s;
  }

  /** Cuántos SKU y cuánta venta del periodo por laboratorio, para la confirmación y la hoja de resumen. */
  function byLab(items) {
    const m = new Map();
    (items || []).forEach((i) => { const k = clean(i.lab) || 'Sin laboratorio'; const x = m.get(k) || { lab: k, skus: 0, revenue: 0 }; x.skus += 1; x.revenue += Number.isFinite(i.revenue) ? i.revenue : 0; m.set(k, x); });
    return [...m.values()].sort((a, b) => (a.lab === 'Sin laboratorio') - (b.lab === 'Sin laboratorio') || a.lab.localeCompare(b.lab, 'es'));
  }

  FP.requests = { WAIT_DAYS, STATE, VIEW, createRegistry, hydrate, create, reconcile, cancel, status, daysOpen, viewOf, lastFor, openSkus, summary, byLab, dayDiff };
})(typeof window !== 'undefined' ? window : globalThis);
