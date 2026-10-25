/**
 * offerStore.js — Ofertas recibidas (propuesta B, fase 1B).
 *
 * Recibe y ordena las ofertas que mandan terceros (proveedores / comercial). NO calcula venta, margen ni efecto, y NO inventa
 * descuentos ni precios: lo que aparece sale del archivo o de una cuenta explícita (1 − precio final ÷ PMP), marcada como calculada.
 *
 *   registry = { version: 1, seq, batchSeq, settings: { discountCap, lowAvailability }, batches: [batch], offers: [offer] }
 *   batch    = { batchId, fileName, sheet, campaign, start, end, origin, receivedAt, receivedBy, rowCount, imported, rejected: [{ line, reason }], columns }
 *   offer    = { offerId, batchId, line, sku, skuRaw, internalId, name, category, lab, buyer, supplier, division, family, controlled,
 *                catStatus, operable, ourPrice, offerCode, program, mechanic, comments, pmp, finalPrice, discount (0–1), discountSource,
 *                supplyComment, pdv, priceChange, start, end, origin, receivedAt, receivedBy, state, note, history: [{ at, field, from, to, note, by }] }
 *
 * Reglas: el SKU es el código Oracle SIN el sufijo «AA» (si llega con él, se quita y se anota); los cambios se agregan a `history`
 * (nada se sobrescribe en silencio); las alertas (duplicados, descuento alto, datos inconsistentes) se calculan al leer, no se guardan.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const STATE = { received: 'Recibida', validated: 'Validada', selected: 'Seleccionada', discarded: 'Descartada' };
  const NEXT = { received: ['validated', 'discarded'], validated: ['selected', 'received', 'discarded'], selected: ['validated', 'discarded'], discarded: ['received'] };
  const ORIGINS = { commercial: 'Comercial', pricing: 'Precios', other: 'Otro' };
  const ISSUE = {
    no_discount: { level: 'error', text: 'No hay % de descuento válido (ni en el archivo ni calculable con PMP y precio final).' },
    bad_discount: { level: 'error', text: 'El % de descuento debe ser mayor que 0 y menor que 100.' },
    bad_dates: { level: 'error', text: 'La fecha de fin es anterior a la de inicio.' },
    no_dates: { level: 'warn', text: 'Sin vigencia (inicio y fin).' },
    no_name: { level: 'warn', text: 'Sin descripción del producto.' },
    dup_batch: { level: 'warn', text: 'El SKU aparece más de una vez en el mismo archivo.' },
    dup_other: { level: 'warn', text: 'El SKU ya está en otra oferta vigente en las mismas fechas.' },
    inconsistent: { level: 'warn', text: 'El % del archivo no coincide con PMP y precio final.' },
    price_above: { level: 'warn', text: 'El precio final es mayor que el PMP.' },
    error_cells: { level: 'warn', text: 'El archivo trae celdas con error (#ERROR!) en columnas de referencia.' },
    supply: { level: 'warn', text: 'Abastecimiento: agotado, descontinuado o baja disponibilidad en PDV.' },
    pieces: { level: 'info', text: 'Mecánica por piezas (ej. 3+1): el % es el equivalente que trae el archivo.' },
    price_change: { level: 'info', text: 'El archivo reporta un cambio de precio.' },
    sku_aa: { level: 'info', text: 'El SKU llegó con el sufijo «AA»; se quitó.' }
  };
  // Qué impide pasar a cada estado (el resto son avisos)
  const BLOCKERS = { validated: ['no_discount', 'bad_discount', 'bad_dates'], selected: ['no_discount', 'bad_discount', 'bad_dates', 'no_dates'] };

  const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  const nowISO = () => new Date().toISOString();
  const ok = (extra) => Object.assign({ ok: true }, extra || {});
  const fail = (error) => ({ ok: false, error });
  const pad = (n, w) => String(n).padStart(w, '0');
  const norm = (h) => clean(h).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Encabezado normalizado → campo. «Oracle» es el SKU de trabajo; «sivec» se conserva como referencia interna.
  const ALIASES = {
    sku: ['sku', 'oracle', 'codigooracle'], internalId: ['sivec'], name: ['producto', 'descripcion', 'descripciondelproducto', 'nombre'],
    category: ['categoria'], lab: ['laboratorio', 'lab'], buyer: ['comprador'], supplier: ['provedoor', 'proveedor'], division: ['division'],
    family: ['familia'], controlled: ['controlados'], catStatus: ['status', 'estatus'], operable: ['operable'], ourPrice: ['precio'],
    offerCode: ['oferta', 'codigodeoferta'], program: ['programa'], mechanic: ['mecanica'], comments: ['comentarios', 'comentario'],
    pmp: ['pmpiva', 'pmp'], discount: ['des', 'descuento', 'pctdes', 'pctdescuento', 'porcentajededescuento'],
    finalPrice: ['preciofinalconiva', 'preciofinal'], supplyComment: ['comentarioabastecimiento', 'estatusproducto'], pdv: ['disponibilidadenpdv'], use: ['cronicoagudo','cronicoragudo','tipodeuso','cronico','uso'],
    priceChange: ['cambiodeprecio'], start: ['inicio', 'fechainicio', 'iniciovigencia'], end: ['fin', 'fechafin', 'finvigencia'], vigencia: ['vigencia']
  };
  const LABEL = {
    sku: 'SKU (Oracle)', internalId: 'sivec', name: 'Producto', category: 'Categoría', lab: 'Laboratorio', buyer: 'Comprador', supplier: 'Proveedor', division: 'División',
    family: 'Familia', controlled: 'Controlados', catStatus: 'Status', operable: 'Operable', ourPrice: 'Precio actual', offerCode: 'Oferta', program: 'Programa',
    mechanic: 'Mecánica', comments: 'Comentarios', pmp: 'PMP + IVA', discount: '% descuento', finalPrice: 'Precio final con IVA', supplyComment: 'Abastecimiento',
    pdv: 'Disponibilidad en PDV', use: 'Crónico / agudo', priceChange: 'Cambio de precio', start: 'Inicio', end: 'Fin', vigencia: 'Vigencia (texto)'
  };

  function createRegistry() { return { version: 1, seq: 0, batchSeq: 0, settings: { lowAvailability: 0.5 }, batches: [], offers: [] }; }
  function hydrate(raw) {
    if (!raw || !Array.isArray(raw.offers) || !Array.isArray(raw.batches)) return createRegistry();
    const base = createRegistry();
    return { version: 1, seq: raw.seq || raw.offers.length, batchSeq: raw.batchSeq || raw.batches.length, settings: Object.assign(base.settings, raw.settings || {}),
      batches: raw.batches.filter((b) => b && b.batchId), offers: raw.offers.filter((o) => o && o.offerId).map((o) => Object.assign({ history: [], state: 'received' }, o)) };
  }

  function parseNum(v) {
    if (v === null || v === undefined) return null;
    let s = String(v).trim(); if (!s || s.startsWith('#')) return null;
    const pct = /%/.test(s); s = s.replace(/[%$\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? (pct ? { pct: n } : n) : null;
  }
  const num = (v) => { const n = parseNum(v); return typeof n === 'number' ? n : null; };
  /** % de descuento como fracción 0–1. Acepta 0.29, 29, «29 %». */
  function parseDiscount(v) {
    const n = parseNum(v); if (n === null) return null;
    if (typeof n === 'object') return n.pct / 100;
    return n > 1 ? n / 100 : n;
  }
  /** SKU: texto, sin decimales de Excel y sin el sufijo «AA» del Oracle. */
  function normalizeSku(v) {
    let s = clean(v); if (!s || s.startsWith('#')) return { sku: '', raw: s, hadAA: false };
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    const raw = s; const hadAA = /^\d{6,}AA$/i.test(s);
    if (hadAA) s = s.slice(0, -2);
    return { sku: s, raw, hadAA };
  }
  const isoOf = (v) => { const s = clean(v); return isISO(s) ? s : ''; };
  const hasErr = (v) => /^#/.test(clean(v));

  /** Detecta qué columna del archivo es cada campo. Devuelve { map: {campo: encabezado}, unknown: [encabezados] }. */
  function mapColumns(headers) {
    const map = {}, used = new Set();
    Object.keys(ALIASES).forEach((f) => {
      for (const alias of ALIASES[f]) {
        const h = headers.find((x) => norm(x) === alias && !used.has(x));
        if (h) { map[f] = h; used.add(h); break; }
      }
    });
    return { map, unknown: headers.filter((h) => !used.has(h)) };
  }

  /**
   * Arma el lote SIN guardarlo (vista previa). rows = [{ line, values: { encabezado: texto } }].
   * campaign = { name, start, end } (la vigencia del archivo; cada fila puede traer la suya).
   */
  function buildBatch(headers, rows, opts) {
    const o = opts || {};
    const { map, unknown } = mapColumns(headers);
    const campaign = o.campaign || {};
    const out = { columns: map, unknown, missing: [], offers: [], rejected: [], notes: [] };
    if (!map.sku) out.missing.push('SKU (columna «Oracle» o «SKU»)');
    if (!map.discount && !(map.pmp && map.finalPrice)) out.missing.push('% descuento (o PMP y precio final para calcularlo)');
    if (out.missing.length) return out;
    const useOf = (v) => { const t = clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return /cronic/.test(t) ? 'chronic' : /agud/.test(t) ? 'acute' : ''; };
    const seen = new Set();
    rows.forEach((row) => {
      const g = (f) => (map[f] ? row.values[map[f]] : undefined);
      const k = normalizeSku(g('sku'));
      if (!k.sku) { out.rejected.push({ line: row.line, reason: 'Sin SKU' }); return; }
      const pmp = num(g('pmp')), fin = num(g('finalPrice'));
      let discount = parseDiscount(g('discount')), source = 'file';
      if (discount === null && pmp > 0 && fin > 0) { discount = 1 - fin / pmp; source = 'calculated'; }
      const rawPdv = num(g('pdv'));
      const rec = {
        line: row.line, sku: k.sku, skuRaw: k.raw, skuHadAA: k.hadAA, internalId: clean(g('internalId')).replace(/\.0+$/, ''), name: clean(g('name')), category: hasErr(g('category')) ? '' : clean(g('category')),
        lab: hasErr(g('lab')) ? '' : clean(g('lab')), buyer: hasErr(g('buyer')) ? '' : clean(g('buyer')), supplier: hasErr(g('supplier')) ? '' : clean(g('supplier')),
        division: hasErr(g('division')) ? '' : clean(g('division')), family: hasErr(g('family')) ? '' : clean(g('family')), controlled: hasErr(g('controlled')) ? '' : clean(g('controlled')),
        catStatus: hasErr(g('catStatus')) ? '' : clean(g('catStatus')), operable: hasErr(g('operable')) ? '' : clean(g('operable')), ourPrice: num(g('ourPrice')),
        offerCode: hasErr(g('offerCode')) ? '' : clean(g('offerCode')).replace(/\.0+$/, ''), program: clean(g('program')), mechanic: clean(g('mechanic')), comments: clean(g('comments')),
        pmp, finalPrice: fin, discount: discount === null ? null : Math.round(discount * 1e6) / 1e6, discountSource: discount === null ? null : source,
        supplyComment: clean(g('supplyComment')), use: useOf(g('use')), pdv: rawPdv, priceChange: num(g('priceChange')),
        start: isoOf(g('start')) || campaign.start || '', end: isoOf(g('end')) || campaign.end || '', vigenciaText: clean(g('vigencia')),
        errorCells: ['category', 'ourPrice', 'catStatus', 'operable', 'supplier', 'lab'].some((f) => map[f] && hasErr(row.values[map[f]]))
      };
      rec.dupInBatch = seen.has(rec.sku); seen.add(rec.sku);
      out.offers.push(rec);
    });
    return out;
  }

  /** Guarda un lote ya armado. Cada oferta queda «Recibida» con su origen y fecha de recepción. */
  function commitBatch(reg, built, meta) {
    const m = meta || {};
    if (!built || !built.offers || !built.offers.length) return fail('No hay ofertas para guardar.');
    const by = clean(m.by); if (!by) return fail('Escribe tu nombre antes de guardar: se registra quién recibió la oferta.');
    const now = m.now || nowISO();
    const c = m.campaign || {};
    if (c.start && !isISO(c.start)) return fail('La fecha de inicio de la campaña no es válida.');
    if (c.end && !isISO(c.end)) return fail('La fecha de fin de la campaña no es válida.');
    if (c.start && c.end && c.end < c.start) return fail('La campaña termina antes de empezar.');
    let batch = m.reuseBatchId ? reg.batches.find((b) => b.batchId === m.reuseBatchId) : null;
    if (batch) { batch.rowCount += built.offers.length + built.rejected.length; batch.imported += built.offers.length; }
    else {
    reg.batchSeq += 1;
    batch = { batchId: `LOT-${pad(reg.batchSeq, 3)}`, fileName: clean(m.fileName), sheet: clean(m.sheet), campaign: clean(c.name), start: c.start || '', end: c.end || '',
      origin: ORIGINS[m.origin] ? m.origin : 'commercial', receivedAt: now, receivedBy: by, rowCount: (built.offers.length + built.rejected.length), imported: built.offers.length,
      rejected: built.rejected.slice(), columns: built.columns };
    reg.batches.push(batch);
    }
    built.offers.forEach((r) => {
      reg.seq += 1;
      const offer = Object.assign({}, r, { offerId: `OF-${pad(reg.seq, 4)}`, batchId: batch.batchId, origin: batch.origin, receivedAt: now, receivedBy: by, state: 'received', note: '', history: [] });
      offer.history.push({ at: now, field: 'created', from: null, to: 'received', note: `Recibida en ${batch.batchId}${batch.fileName ? ` (${batch.fileName})` : ''}`, by });
      reg.offers.push(offer);
    });
    return ok({ batch });
  }

  /* ---------- Captura manual y plantilla ---------- */
  /** Columnas de la plantilla descargable: [encabezado, campo, obligatorio, ayuda]. Los encabezados son los que la carga de archivos ya reconoce. */
  const TEMPLATE = [
    ['Oracle', 'sku', true, 'Código Oracle del producto, sin el sufijo «AA».'],
    ['Producto', 'name', false, 'Descripción del producto.'],
    ['Categoría', 'category', false, 'Categoría del producto.'],
    ['Laboratorio', 'lab', false, 'Laboratorio que ofrece la promoción.'],
    ['Controlados', 'controlled', true, 'Escribe «Ningún Control» si el producto se puede promocionar. Cualquier otro valor se bloquea en la activación.'],
    ['Programa', 'program', false, 'Texto libre: nombre del programa de lealtad, si lo hay.'],
    ['Mecánica', 'mechanic', false, 'Texto libre: cómo funciona la oferta (ej. 30 % de descuento, 3+1).'],
    ['% DES', 'discount', true, 'Porcentaje de descuento, de 0 a 100 (ej. 25 o 25 %).'],
    ['Crónico / agudo', 'use', false, 'Escribe «Crónico» o «Agudo». Sirve para sugerir recordatorios de recompra.'],
    ['Inicio', 'start', false, 'Inicio de vigencia, AAAA-MM-DD. Si lo dejas vacío se usa el de la campaña.'],
    ['Fin', 'end', false, 'Fin de vigencia, AAAA-MM-DD.'],
    ['Comentarios', 'comments', false, 'Notas de quien manda la oferta.'],
    ['Comentario abastecimiento', 'supplyComment', false, 'Si el producto está agotado o descontinuado, escríbelo aquí («Agotado»).']
  ];
  /**
   * Captura una sola oferta a mano. Pasa por las mismas reglas que un archivo (SKU sin «AA», descuento entre 0 y 100, fechas) y queda
   * «Recibida» en su propio lote «Captura manual» (una por campaña y origen). f = { sku, name, category, lab, controlled, program, mechanic, discount, use, comments,
   * supplyComment, start, end, campaignName, origin }.  meta = { by }
   */
  function captureManual(reg, f, meta) {
    const v = f || {}, by = clean(meta && meta.by);
    if (!by) return fail('Escribe tu nombre antes de guardar: se registra quién recibió la oferta.');
    if (!clean(v.sku)) return fail('Escribe el SKU (código Oracle).');
    if (!clean(v.controlled)) return fail('Escribe el tipo de control (Controlados). «Ningún Control» si se puede promocionar.');
    const d = parseDiscount(v.discount);
    if (d === null) return fail('Escribe el % de descuento.');
    if (!(d > 0 && d < 1)) return fail('El % de descuento debe ser mayor que 0 y menor que 100.');
    const campaign = { name: clean(v.campaignName), start: clean(v.start), end: clean(v.end) };
    if (campaign.start && !isISO(campaign.start)) return fail('La fecha de inicio no es válida.');
    if (campaign.end && !isISO(campaign.end)) return fail('La fecha de fin no es válida.');
    if (campaign.start && campaign.end && campaign.end < campaign.start) return fail('La vigencia termina antes de empezar.');
    const headers = TEMPLATE.map((c) => c[0]), values = {};
    TEMPLATE.forEach((c) => { values[c[0]] = c[1] === 'start' || c[1] === 'end' ? '' : clean(v[c[1]]); });
    const built = buildBatch(headers, [{ line: 2, values }], { campaign });
    if (built.missing.length || !built.offers.length) return fail(built.missing.length ? `Falta: ${built.missing.join(', ')}.` : 'No se pudo armar la oferta.');
    // Las capturas de una misma campaña y origen se agrupan en un solo lote «Captura manual».
    const org = ORIGINS[v.origin] ? v.origin : 'commercial';
    const same = reg.batches.slice().reverse().find((b) => b.fileName === 'Captura manual' && b.campaign === campaign.name && b.origin === org);
    const r = commitBatch(reg, built, { by, fileName: 'Captura manual', sheet: '', campaign, origin: org, reuseBatchId: same ? same.batchId : null });
    if (!r.ok) return r;
    return ok({ batch: r.batch, offer: reg.offers[reg.offers.length - 1] });
  }

  const find = (reg, id) => reg.offers.find((o) => o.offerId === id) || null;
  const batchOf = (reg, id) => reg.batches.find((b) => b.batchId === id) || null;
  const overlap = (a, b) => (!a.start || !a.end || !b.start || !b.end) ? true : (a.start <= b.end && b.start <= a.end);

  /** Alertas de cada oferta. Se calculan al leer: si editas una fecha o descartas un duplicado, se actualizan solas. */
  function analyze(reg) {
    const low = reg.settings.lowAvailability;
    const bySku = new Map();
    reg.offers.forEach((o) => { if (o.state !== 'discarded') { if (!bySku.has(o.sku)) bySku.set(o.sku, []); bySku.get(o.sku).push(o); } });
    const out = new Map();
    reg.offers.forEach((o) => {
      const codes = [];
      if (o.discount === null || o.discount === undefined) codes.push('no_discount');
      else if (!(o.discount > 0 && o.discount < 1)) codes.push('bad_discount');
      if (o.start && o.end && o.end < o.start) codes.push('bad_dates');
      if (!o.start || !o.end) codes.push('no_dates');
      if (!o.name) codes.push('no_name');
      if (o.dupInBatch) codes.push('dup_batch');
      if (o.state !== 'discarded' && (bySku.get(o.sku) || []).some((x) => x.offerId !== o.offerId && x.batchId !== o.batchId && overlap(o, x))) codes.push('dup_other');
      if (o.discountSource === 'file' && o.pmp > 0 && o.finalPrice > 0 && Math.abs((1 - o.finalPrice / o.pmp) - o.discount) > 0.005) codes.push('inconsistent');
      if (o.pmp > 0 && o.finalPrice > o.pmp) codes.push('price_above');
      if (o.errorCells) codes.push('error_cells');
      if (/agotad|descontinu/i.test(o.supplyComment || '') || (typeof o.pdv === 'number' && o.pdv < low)) codes.push('supply');
      if (/\d\s*\+\s*\d/.test(o.mechanic || '')) codes.push('pieces');
      if (o.priceChange) codes.push('price_change');
      if (o.skuHadAA) codes.push('sku_aa');
      out.set(o.offerId, codes);
    });
    return out;
  }
  const levelOf = (codes) => (codes.some((c) => ISSUE[c].level === 'error') ? 'error' : codes.some((c) => ISSUE[c].level === 'warn') ? 'warn' : 'ok');
  const blockers = (codes, to) => (BLOCKERS[to] || []).filter((c) => codes.includes(c));

  const log = (o, field, from, to, note, by) => o.history.push({ at: nowISO(), field, from: from === undefined ? null : from, to: to === undefined ? null : to, note: note || null, by: clean(by) || null });

  function setState(reg, offerId, to, meta) {
    const m = meta || {}, o = find(reg, offerId);
    if (!o) return fail('No encuentro esa oferta.');
    if (!STATE[to]) return fail('Estado desconocido.');
    if (!(NEXT[o.state] || []).includes(to)) return fail(`De «${STATE[o.state]}» no se pasa a «${STATE[to]}».`);
    if (!clean(m.by)) return fail('Escribe tu nombre: el cambio de estado guarda quién lo hizo.');
    if (to === 'discarded' && !clean(m.note)) return fail('Para descartar escribe el motivo.');
    const bl = blockers(analyze(reg).get(o.offerId) || [], to);
    if (bl.length) return fail(`No puede pasar a «${STATE[to]}»: ${bl.map((c) => ISSUE[c].text).join(' ')}`);
    const from = o.state; o.state = to; log(o, 'state', from, to, clean(m.note), m.by);
    return ok({ offer: o });
  }

  const EDITABLE = { start: 'Inicio', end: 'Fin', discount: '% descuento', mechanic: 'Mecánica', note: 'Nota', name: 'Producto', finalPrice: 'Precio final', pmp: 'PMP' };
  /** Cambia un campo conservando el valor anterior en el historial. El descuento se escribe en % (29,5). */
  function editOffer(reg, offerId, field, value, by) {
    const o = find(reg, offerId);
    if (!o) return fail('No encuentro esa oferta.');
    if (!EDITABLE[field]) return fail('Ese campo no se edita.');
    if (!clean(by)) return fail('Escribe tu nombre: el cambio guarda quién lo hizo.');
    if (o.state === 'selected') return fail('La oferta está seleccionada: devuélvela a «Validada» antes de editarla.');
    let nv = value;
    if (field === 'start' || field === 'end') { nv = clean(value); if (nv && !isISO(nv)) return fail('La fecha no es válida.'); }
    else if (field === 'discount') {
      if (clean(value) === '') nv = null;
      else { const p = parseNum(value); const pct = p === null ? null : (typeof p === 'object' ? p.pct : p); if (pct === null || !(pct > 0 && pct < 100)) return fail('El descuento debe estar entre 0 y 100 %.'); nv = Math.round(pct / 100 * 1e6) / 1e6; }
    }
    else if (field === 'finalPrice' || field === 'pmp') { const n = clean(value) === '' ? null : num(value); if (clean(value) !== '' && (n === null || n <= 0)) return fail('Escribe un número mayor que 0.'); nv = n; }
    else nv = clean(value);
    const cur = o[field] === undefined ? null : o[field];
    if ((cur === null ? '' : cur) === (nv === null ? '' : nv)) return ok({ unchanged: true });
    log(o, field, cur, nv, null, by); o[field] = nv;
    if (field === 'discount') o.discountSource = 'manual';
    if ((field === 'start' || field === 'end') && o.start && o.end && o.end < o.start) return ok({ offer: o, warning: ISSUE.bad_dates.text });
    return ok({ offer: o });
  }

  function addNote(reg, offerId, text, by) {
    const o = find(reg, offerId); if (!o) return fail('No encuentro esa oferta.');
    if (!clean(text)) return fail('Escribe la nota.'); if (!clean(by)) return fail('Escribe tu nombre.');
    log(o, 'note', null, clean(text), null, by); return ok({ offer: o });
  }

  function filter(reg, an, f) {
    const q = norm(f && f.q);
    return reg.offers.filter((o) => {
      if (f.batchId && o.batchId !== f.batchId) return false;
      if (f.state && o.state !== f.state) return false;
      if (f.lab && o.lab !== f.lab) return false;
      if (f.category && o.category !== f.category) return false;
      const codes = an.get(o.offerId) || [];
      if (f.issue === 'error' && levelOf(codes) !== 'error') return false;
      if (f.issue === 'warn' && !['error', 'warn'].includes(levelOf(codes))) return false;
      if (f.issue === 'clean' && levelOf(codes) !== 'ok') return false;
      if (f.issue && ISSUE[f.issue] && !codes.includes(f.issue)) return false;
      if (q && !norm(`${o.sku} ${o.name} ${o.lab} ${o.category} ${o.offerId} ${o.offerCode} ${o.mechanic}`).includes(q)) return false;
      return true;
    });
  }
  const distinct = (reg, key, batchId) => [...new Set(reg.offers.filter((o) => !batchId || o.batchId === batchId).map((o) => o[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  /** Datos para pasar una oferta seleccionada como SKU de una promoción (el descuento va como condición, nunca como precio inventado). */
  function toPromotionSku(o) {
    const d = o.discount ? `${(o.discount * 100).toFixed(1).replace(/\.0$/, '')} % de descuento` : '';
    return { sku: o.sku, name: o.name, origin: 'offer', offerId: o.offerId, mechanic: o.mechanic || d, condition: [o.mechanic ? d : '', o.program].filter(Boolean).join(' · '), reason: `Oferta ${o.offerId}${o.lab ? ` de ${o.lab}` : ''}` };
  }

  FP.offers = { STATE, NEXT, ORIGINS, ISSUE, EDITABLE, LABEL, ALIASES, createRegistry, hydrate, norm, mapColumns, parseDiscount, normalizeSku, buildBatch, commitBatch, captureManual, TEMPLATE,
    find, batchOf, analyze, levelOf, blockers, setState, editOffer, addNote, filter, distinct, toPromotionSku };
})(typeof window !== 'undefined' ? window : globalThis);
