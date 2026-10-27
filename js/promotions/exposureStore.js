/**
 * exposureStore.js — «Exposición»: productos que se decide exponer (banner, cuadrícula, CRM…) sin una oferta de descuento.
 *
 * No es una oferta: no lleva descuento ni precio, no pasa por validar ni por armar promoción y NO cuenta en el descuento promedio ni en la
 * cobertura de ofertas (esos resúmenes leen solo las ofertas). Las fechas son opcionales y sirven para medir después el periodo expuesto.
 *
 *   registry = { version: 1, seq, batchSeq, items: [exposure] }
 *   exposure = { expId, batchId, sku, productCode, name, category, lab, reasons: [texto], start, end, note, state: 'active'|'removed',
 *                createdAt, createdBy, history: [{ at, field, from, to, note, by }] }
 * Cualquier persona con nombre puede ponerla o quitarla; cada movimiento guarda quién y cuándo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const STATUS = { upcoming: 'Por empezar', active: 'Vigente', ended: 'Terminada', removed: 'Quitada' };
  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const pad = (n, w) => String(n).padStart(w, '0');
  const nowISO = () => new Date().toISOString();
  const isISO = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (error) => ({ ok: false, error });

  function createRegistry() { return { version: 1, seq: 0, batchSeq: 0, items: [] }; }
  function hydrate(raw) {
    const reg = createRegistry();
    if (!raw || typeof raw !== 'object') return reg;
    reg.seq = Number(raw.seq) || 0; reg.batchSeq = Number(raw.batchSeq) || 0;
    if (Array.isArray(raw.items)) reg.items = raw.items.filter((e) => e && e.expId && e.sku && (e.state === 'active' || e.state === 'removed')).map((e) => Object.assign({ history: [], reasons: [], start: '', end: '' }, e));
    return reg;
  }

  /** 'upcoming' | 'active' | 'ended' | 'removed' según las fechas (opcionales) y hoy. */
  function status(e, today) {
    if (e.state === 'removed') return 'removed';
    if (today && e.end && e.end < today) return 'ended';
    if (today && e.start && e.start > today) return 'upcoming';
    return 'active';
  }
  /** Exposición vigente o por empezar de un SKU (la que sigue contando), o null. */
  function currentFor(reg, sku, today) {
    for (let i = reg.items.length - 1; i >= 0; i--) { const e = reg.items[i]; if (e.sku === sku) { const s = status(e, today); if (s === 'active' || s === 'upcoming') return e; } }
    return null;
  }
  function lastFor(reg, sku) { for (let i = reg.items.length - 1; i >= 0; i--) if (reg.items[i].sku === sku) return reg.items[i]; return null; }

  /** Pone en exposición un SKU por fila. items = [{ sku, productCode, name, category, lab, reasons }]. Omite los que ya tienen una vigente. */
  function add(reg, items, opts) {
    const o = opts || {}, by = clean(o.by), start = clean(o.start), end = clean(o.end);
    if (!by) return fail('Escribe tu nombre: la exposición guarda quién la puso.');
    if (start && !isISO(start)) return fail('La fecha de inicio no es válida.');
    if (end && !isISO(end)) return fail('La fecha de fin no es válida.');
    if (start && end && end < start) return fail('La fecha de fin es anterior a la de inicio.');
    const list = (items || []).filter((i) => i && clean(i.sku)); if (!list.length) return fail('No hay productos que exponer.');
    const today = o.today || (o.now || nowISO()).slice(0, 10), created = [], skipped = [], seen = new Set(), at = o.now || nowISO();
    reg.batchSeq += 1; const batchId = `EXP-${pad(reg.batchSeq, 4)}`;
    list.forEach((i) => {
      const sku = clean(i.sku);
      if (seen.has(sku) || currentFor(reg, sku, today)) { skipped.push(sku); return; }
      seen.add(sku); reg.seq += 1;
      const e = { expId: `E-${pad(reg.seq, 5)}`, batchId, sku, productCode: clean(i.productCode), name: clean(i.name), category: clean(i.category), lab: clean(i.lab), reasons: (i.reasons || []).map(clean).filter(Boolean),
        start, end, note: clean(o.note), state: 'active', createdAt: at, createdBy: by, history: [{ at, field: 'created', from: null, to: 'active', note: `Puesta en exposición en ${batchId}`, by }] };
      reg.items.push(e); created.push(e);
    });
    if (!created.length) { reg.batchSeq -= 1; return fail('Todos esos productos ya están en exposición.'); }
    return ok({ batchId, created, skipped });
  }

  function remove(reg, expId, opts) {
    const e = reg.items.find((x) => x.expId === expId); if (!e) return fail('No encontré esa exposición.');
    if (e.state !== 'active') return fail('Esa exposición ya estaba quitada.');
    const by = clean(opts && opts.by); if (!by) return fail('Escribe tu nombre: quitarla guarda quién lo hizo.');
    e.state = 'removed'; e.history.push({ at: (opts && opts.now) || nowISO(), field: 'state', from: 'active', to: 'removed', note: clean(opts && opts.note) || 'Quitada', by });
    return ok({ exposure: e });
  }

  function summary(reg, today) {
    const s = { active: 0, upcoming: 0, ended: 0, removed: 0 };
    reg.items.forEach((e) => { s[status(e, today)] += 1; });
    return s;
  }

  FP.exposures = { STATUS, createRegistry, hydrate, add, remove, status, currentFor, lastFor, summary, isISO };
})(typeof window !== 'undefined' ? window : globalThis);
