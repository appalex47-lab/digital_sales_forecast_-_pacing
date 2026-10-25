/**
 * arquitectoDetectors.js — Fase 4 · Detectores del Arquitecto de Ofertas.
 *
 * Lee lo que el módulo de Promociones ya tiene (ofertas recibidas, promociones, metas por campaña, oportunidades y reglas de activación) y busca
 * lo que hay que mirar primero. Código determinista y SIN IA: `collect` lee el estado y el almacén de productos; `analyze` (puro, sin I/O) devuelve
 * candidatos con la misma forma que los del Analista y el Auditor, para usar la misma tarjeta y el mismo ejecutor.
 *
 * Tres hallazgos (maqueta aprobada):
 *  1. Oportunidades altas sin oferta. El reloj entra en la puntuación: si una campaña arranca en 5 días o menos, sube.
 *  2. Más SKU piden banner de los que caben en los espacios (tope compartido, el mismo de Activación).
 *  3. Ritmo requerido contra ritmo actual de cada campaña con meta. Es aritmética (lo que falta ÷ días que quedan), no un pronóstico.
 *
 * Reglas que no cambian: sin margen, costo ni inventario; no inventa descuentos ni precios; lenguaje no causal («hipótesis a validar»);
 * muestra chica = «muestra limitada»; una meta es una cifra que decidió una persona, el agente solo la compara con el ritmo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.agents.analista.fmt;

  /** Umbrales aprobados en la maqueta. Un solo lugar para ajustarlos. */
  const LIMITS = {
    soonDays: 5,        // «a punto de arrancar»: la campaña empieza en 5 días o menos
    recentDays: 7,      // ventana del ritmo actual
    minRhythmDays: 4,   // días con venta mínimos en la ventana para no marcar «muestra limitada»
    weekDays: 7,        // «vencen esta semana»
    topK: 3,            // SKU que se muestran en la tarjeta
    listMax: 30         // SKU que lista el detalle («Ver más»); si hay más, lo dice
  };
  const IN_PROMO = ['proposed', 'approved', 'published', 'measuring', 'closed'];
  const MEASURED = ['published', 'measuring', 'closed'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // ---------- Fechas y textos ----------
  const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
  const diffDays = (a, b) => Math.round(dayNum(a) - dayNum(b));   // a − b, en días
  const addDays = (iso, n) => new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10);
  const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const dayLabel = (iso) => (isISO(iso) ? `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}` : String(iso || ''));
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  const plural = (n, one, many) => (n === 1 ? one : many);
  const todayISO = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const intTxt = (v) => Math.round(v).toLocaleString('en-US');

  // ---------- Campañas conocidas (lotes de ofertas + promociones) ----------
  /** [{ key, name, start, end, skus:Set, offers:n }]: la vigencia es la más amplia entre sus lotes, ofertas y promociones. */
  function campaignsOf(d) {
    const map = new Map();
    const get = (name) => {
      const n = String(name || '').trim(); if (!n) return null;
      const k = norm(n); if (!map.has(k)) map.set(k, { key: k, name: n, start: '', end: '', skus: new Set(), offers: 0 });
      return map.get(k);
    };
    const widen = (c, s, e) => { if (isISO(s) && (!c.start || s < c.start)) c.start = s; if (isISO(e) && (!c.end || e > c.end)) c.end = e; };
    const lotName = new Map();
    (d.batches || []).forEach((b) => { const c = get(b.campaign); if (c) { lotName.set(b.batchId, c); widen(c, b.start, b.end); } });
    (d.offers || []).forEach((o) => { const c = lotName.get(o.batchId); if (c) { if (o.sku) c.skus.add(o.sku); c.offers += 1; widen(c, o.start, o.end); } });
    (d.promotions || []).forEach((p) => {
      if (p.status === 'cancelled') return;
      const c = get(p.campaign); if (!c) return;
      widen(c, p.plannedStart, p.plannedEnd);
      (p.skus || []).forEach((s) => { if (s.sku) { c.skus.add(s.sku); widen(c, s.realStart, s.realEnd); } });
    });
    return [...map.values()].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name, 'es'));
  }
  /** La campaña que arranca antes dentro de los próximos `soonDays` días (hoy cuenta). null si ninguna. */
  function soonest(camps, today) {
    const c = camps.filter((x) => isISO(x.start) && diffDays(x.start, today) >= 0 && diffDays(x.start, today) <= LIMITS.soonDays).sort((a, b) => a.start.localeCompare(b.start))[0];
    return c ? { campaign: c, days: diffDays(c.start, today) } : null;
  }
  const whenTxt = (days, start) => (days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días (${dayLabel(start)})`);

  // ---------- Recolección (única parte con I/O) ----------
  function depsOf(o = {}) {
    return { today: o.today || todayISO, store: o.store || FP.productStore, opp: o.opp || null, daily: o.daily || ((p, ctx) => FP.promotionEvaluation.dailyFor(p, ctx)), compute: o.compute || ((p, dy, ctx) => FP.promotionEvaluation.compute(p, dy, ctx)) };
  }
  const monthStart = (iso) => `${iso.slice(0, 7)}-01`;

  /** Oportunidades del periodo: las que ya calculó la vista (state.op.result) o, si todavía no se abrió, las mismas reglas con los filtros por defecto. */
  async function oppFor(state, deps, errors) {
    if (deps.opp) return deps.opp;
    const op = state.op || {};
    if (op.result && op.result.items) return { items: op.result.items, profiles: op.result.profiles || new Map(), period: op.result.period || null, from: op.f && op.f.from, to: op.f && op.f.to };
    const PS = deps.store, m = PS && PS.meta;
    if (!PS || !PS.available() || !m || !m.batches || !m.dateMax) return null;
    try {
      const f = op.f || {}, to = f.to || m.dateMax, from = f.from || monthStart(m.dateMax);
      const res = await FP.productAnalysis.run({ from, to, periodType: 'month', comparison: f.comparison || 'previous', channel: f.channel || 'total', level: 'sku', withGeoSignals: false });
      const out = FP.opportunities.analyze(res.rows, { catalog: (sku) => PS.catalog.bySku.get(sku) || null, offers: state.of.reg.offers });
      return { items: out.items, profiles: out.profiles, period: res.period || null, from, to };
    } catch (e) { errors.push(`oportunidades: ${e && e.message || e}`); return null; }
  }

  /** Ritmo de cada campaña con meta: avance al día (evaluación de sus promociones medibles) y venta de los últimos días dentro de su vigencia. */
  async function rhythmFor(state, deps, today, errors) {
    const pm = state.pm.reg, goals = (state.cg && state.cg.reg && state.cg.reg.goals) || [], out = [];
    const PE = FP.promotionEvaluation, ctx = { promotions: pm.promotions, events: state.events || [] };
    for (const g of goals) {
      const metric = g.revenue > 0 ? 'revenue' : g.units > 0 ? 'units' : null; if (!metric) continue;
      const mine = pm.promotions.filter((p) => norm(p.campaign) === norm(g.campaign) && MEASURED.includes(p.status));
      if (!mine.length) continue;
      try {
        const live = {}, dailies = [];
        for (const p of mine) { const dy = await deps.daily(p, ctx); dailies.push({ p, dy }); live[p.promoId] = deps.compute(p, dy, ctx); }
        const prog = FP.goals.progress(g, pm.promotions, live);
        if (!prog.promos.length) continue;
        let start = '', end = '';
        mine.forEach((p) => (p.skus || []).forEach((s) => { const w = PE.skuWindow(p, s); if (w) { if (!start || w.start < start) start = w.start; if (!end || w.end > end) end = w.end; } }));
        if (!start || !end) continue;
        const cutoff = prog.cutoffMax || today, from = addDays(cutoff, -(LIMITS.recentDays - 1)), seen = new Set(), days = new Set();
        let recent = 0;
        for (let day = from < start ? start : from; day <= cutoff && day <= end; day = addDays(day, 1)) {
          dailies.forEach(({ p, dy }) => {
            if (!dy.dates || !dy.dates.has(day)) return;
            const m = dy.data.get(day); if (!m) return;
            (p.skus || []).forEach((s) => {
              const w = PE.skuWindow(p, s); if (!w || day < w.start || day > w.end) return;
              const key = `${day}|${s.sku}`; if (seen.has(key)) return; seen.add(key);
              const v = m.get(s.sku); if (v && fin(v[metric])) { recent += v[metric]; days.add(day); }
            });
          });
        }
        out.push({ campaign: g.campaign, metric, target: metric === 'revenue' ? g.revenue : g.units, done: metric === 'revenue' ? prog.revenue : prog.units,
          start, end, cutoff, elapsed: Math.max(0, diffDays(cutoff, start) + 1), daysLeft: diffDays(end, cutoff), recent: { value: recent, days: days.size },
          partial: prog.status === 'partial', missing: prog.missing.length, allLive: prog.allLive });
      } catch (e) { errors.push(`ritmo ${g.campaign}: ${e && e.message || e}`); }
    }
    return out;
  }

  /**
   * Lee el estado de la app y el almacén de productos. Nunca lanza.
   * @returns {Promise<{status:'ok'|'sin_promos', today, dataMax, offers, batches, promotions, params, opp, rhythm, errors}>}
   */
  async function collect(state, opts = {}) {
    const errors = [], deps = depsOf(opts.deps), s = state || {};
    try {
      const of = s.of && s.of.reg, pm = s.pm && s.pm.reg;
      if (!of || !pm || !FP.activation || !FP.opportunities) return { status: 'sin_promos', errors: ['El módulo de Promociones no está cargado.'] };
      const offers = (of.offers || []).filter((o) => o.state !== 'discarded');
      const today = deps.today(), PS = deps.store, dataMax = PS && PS.meta && PS.meta.dateMax || null;
      const opp = await oppFor(s, deps, errors);
      // Sin ofertas ni promociones el agente igual sirve si hay venta por producto: las oportunidades altas salen de la venta, no de las ofertas.
      if (!offers.length && !(pm.promotions || []).length && !(opp && opp.items && opp.items.length)) return { status: 'sin_promos', today, dataMax, errors };
      const rhythm = await rhythmFor(s, deps, today, errors);
      return { status: 'ok', today, dataMax, offers, batches: of.batches || [], promotions: pm.promotions || [], params: (s.ac && s.ac.reg && s.ac.reg.params) || FP.activation.SETTINGS, opp, rhythm, errors };
    } catch (e) { return { status: 'sin_promos', errors: [String(e && e.message || e)] }; }
  }

  // ---------- Detectores (puros) ----------
  const base = (id, detector, score, extra) => ({ id, agent: 'arquitecto', detector, score, prio: F().prioOf(score), fuente: 'Promociones · ofertas, metas y oportunidades', section: 'revisar', view: 'promociones', ...extra });
  const nameOf = (d, key) => {
    if (key.startsWith('offer:')) { const o = d.offers.find((x) => `offer:${x.offerId}` === key); return o ? (o.name || o.sku) : key; }
    const it = (d.opp ? d.opp.items : []).find((x) => `sku:${x.sku}` === key); return it ? (it.name || it.sku) : key;
  };

  /** Cuando ningún SKU es de prioridad Alta pero sí hay oportunidades sin oferta: se listan, con prioridad Baja, para que el panel no diga «nada» teniendo oportunidades. */
  function sinOfertaSinAltas(d, inPromo) {
    const f = F(), list = d.opp.items.filter((i) => { const r = d.recsFree.get(`sku:${i.sku}`); return r && !r.blocked && !inPromo.has(i.sku); });
    if (!list.length) return null;
    const n = list.length, rev = list.reduce((t, i) => t + (fin(i.revenue) ? i.revenue : 0), 0), evHigh = list.filter((i) => i.evidence && i.evidence.level === 'high').length;
    const per = d.opp.period && d.opp.period.label ? d.opp.period.label : d.opp.from && d.opp.to ? `${dayLabel(d.opp.from)} al ${dayLabel(d.opp.to)}` : 'el periodo de Oportunidades';
    return base('oportunidades_sin_oferta', 'Oportunidades sin oferta (ninguna Alta)', 25, {
      owner: 'Comercial', tag: 'Sin oferta',
      title: `${n} ${plural(n, 'SKU con oportunidad no tiene', 'SKU con oportunidad no tienen')} oferta; ninguno es de prioridad Alta`,
      resumen: 'Las reglas de Activación no ponen ninguno en prioridad Alta (venta, conversión y peso en su categoría), pero siguen sin oferta ni plan de promoción.',
      que: `${n} SKU suman ${f.money(rev)} de venta en ${per}.`,
      big: { value: `${n} SKU`, tone: '', sub: `con oportunidad y sin oferta · ${f.money(rev)} de venta en ${per}` },
      lista: { title: `Los ${Math.min(n, LIMITS.listMax)} SKU${n > LIMITS.listMax ? ` de mayor venta (de ${n}; el resto está en Promociones › Oportunidades)` : ''}`,
        visual: { type: 'table', head: ['SKU', 'Producto', 'Categoría', 'Venta', 'Evidencia', 'Dónde colocarlo'], num: [3], rows: list.slice(0, LIMITS.listMax).map((i) => [i.sku, i.name || i.sku, i.category || '', f.money(fin(i.revenue) ? i.revenue : 0), ({ high: 'Alta', medium: 'Media', low: 'Baja' })[i.evidence && i.evidence.level] || '', (d.recs.get(`sku:${i.sku}`) || d.recsFree.get(`sku:${i.sku}`)).main]) } },
      hipotesis: 'Que no sean prioridad Alta no significa que no valga la pena una oferta: depende de lo que Comercial pueda negociar. Es una hipótesis a validar.',
      validar: 'Revisa en Promociones › Oportunidades los de mayor venta y pregunta a Comercial si hay oferta posible.',
      accion: 'Revisar con Comercial los de mayor venta cuando arme la siguiente campaña. Responsable natural: Comercial.',
      evid: [{ k: 'SKU con oportunidad sin oferta', v: String(n) }, { k: `Venta de esos SKU en ${per}`, v: f.money(rev) }, { k: 'SKU con evidencia alta', v: `${evHigh} de ${n}` }],
      pregunta: '¿Cuáles de estos SKU tienen oferta posible con el laboratorio y disponibilidad?',
      limites: 'La herramienta no tiene inventario, margen ni acuerdos con laboratorios. Las oportunidades salen de reglas sobre venta y embudo, no son un pronóstico.',
      muestraLimitada: evHigh === 0, viewLabel: 'Promociones › Oportunidades', facts: { n, revenue: rev, urgent: false }
    });
  }

  /** 1 · Oportunidades altas sin oferta (con el reloj de la campaña que está por arrancar). */
  function oportunidadesAltas(d) {
    if (!d.opp || !d.opp.items.length) return null;
    const f = F(), inPromo = new Set();
    d.promotions.forEach((p) => { if (IN_PROMO.includes(p.status)) (p.skus || []).forEach((s) => inPromo.add(s.sku)); });
    const altas = d.opp.items.filter((i) => { const r = d.recsFree.get(`sku:${i.sku}`); return r && r.priority === 'Alta' && !r.blocked && !inPromo.has(i.sku); });   // «Alta» por reglas, sin el tope de banner
    if (!altas.length) return sinOfertaSinAltas(d, inPromo);
    const n = altas.length, rev = altas.reduce((t, i) => t + (fin(i.revenue) ? i.revenue : 0), 0), evHigh = altas.filter((i) => i.evidence && i.evidence.level === 'high').length;
    const soon = soonest(d.camps, d.today), top = altas.slice(0, LIMITS.topK);
    const outside = soon ? altas.filter((i) => !soon.campaign.skus.has(i.sku)).length : 0;
    const score = f.clamp(30 + Math.min(30, n * 3) + (evHigh * 2 >= n ? 10 : 0) + (soon ? 25 : 0));
    const per = d.opp.period && d.opp.period.label ? d.opp.period.label : d.opp.from && d.opp.to ? `${dayLabel(d.opp.from)} al ${dayLabel(d.opp.to)}` : 'el periodo de Oportunidades';
    const title = soon
      ? `${n} SKU con oportunidad alta no tienen oferta y «${soon.campaign.name}» arranca ${whenTxt(soon.days, soon.campaign.start)}`
      : `${n} SKU con oportunidad alta no tienen oferta ni están en ninguna promoción`;
    return base('oportunidades_altas', 'Oportunidades altas sin oferta', score, {
      owner: 'Comercial', tag: soon ? `Arranca ${soon.days === 0 ? 'hoy' : soon.days === 1 ? 'mañana' : `en ${soon.days} días`}` : 'Sin oferta',
      title,
      resumen: `Son los SKU que las reglas de Activación ponen en prioridad Alta (venta, conversión y peso en su categoría) y que hoy no están en una oferta recibida ni en el plan de una promoción.`,
      que: `${n} SKU suman ${f.money(rev)} de venta en ${per}.${soon ? ` La campaña «${soon.campaign.name}» tiene ${soon.campaign.skus.size} SKU y ${outside} de estos quedan fuera de ella.` : ''}`,
      big: { value: `${n} SKU`, tone: soon ? 'dn' : '', sub: `con oportunidad alta y sin oferta · ${f.money(rev)} de venta en ${per}` },
      visual: { type: 'table', head: ['Producto', 'Venta del periodo', 'Dónde colocarlo'], num: [1], rows: top.map((i) => [i.name || i.sku, f.money(fin(i.revenue) ? i.revenue : 0), (d.recs.get(`sku:${i.sku}`) || d.recsFree.get(`sku:${i.sku}`)).main]) },
      lista: { title: `Los ${Math.min(n, LIMITS.listMax)} SKU${n > LIMITS.listMax ? ` de mayor venta (de ${n}; el resto está en Promociones › Oportunidades)` : ''}`,
        visual: { type: 'table', head: ['SKU', 'Producto', 'Categoría', 'Venta', 'Evidencia', 'Dónde colocarlo'], num: [3], rows: altas.slice(0, LIMITS.listMax).map((i) => [i.sku, i.name || i.sku, i.category || '', f.money(fin(i.revenue) ? i.revenue : 0), ({ high: 'Alta', medium: 'Media', low: 'Baja' })[i.evidence && i.evidence.level] || '', (d.recs.get(`sku:${i.sku}`) || d.recsFree.get(`sku:${i.sku}`)).main]) } },
      hipotesis: 'Pueden faltar por disponibilidad o por no haber acuerdo con el laboratorio, no por descuido. Es una hipótesis a validar.',
      validar: 'Pregunta a Comercial si hay una oferta posible para cada uno y confirma disponibilidad antes de armarla.',
      accion: `Revisar con Comercial ${n > 10 ? 'los 10 primeros' : n === 1 ? 'este SKU' : `los ${n} SKU`} y decidir cuáles entran${soon ? ` antes de que arranque «${soon.campaign.name}»` : ' en la siguiente campaña'}. Responsable natural: Comercial.`,
      evid: [{ k: 'SKU con oportunidad alta sin oferta', v: String(n) }, { k: `Venta de esos SKU en ${per}`, v: f.money(rev) }, { k: 'SKU con evidencia alta', v: `${evHigh} de ${n}` },
        ...(soon ? [{ k: 'Días para el inicio de la campaña', v: String(soon.days) }, { k: `SKU de «${soon.campaign.name}»`, v: String(soon.campaign.skus.size) }, { k: 'Con oportunidad alta fuera de la campaña', v: String(outside) }] : [])],
      pregunta: '¿Cuáles de estos SKU tienen oferta posible con el laboratorio y disponibilidad?',
      limites: 'La herramienta no tiene inventario, margen ni acuerdos con laboratorios. «Alta» viene de las reglas de Activación sobre venta y embudo, no es un pronóstico.',
      muestraLimitada: evHigh === 0, viewLabel: 'Promociones › Oportunidades', facts: { n, revenue: rev, urgent: !!soon, days: soon ? soon.days : null, outside }
    });
  }

  /** 2 · Más SKU piden banner que espacios hay. */
  function bannerSaturado(d) {
    const slots = Math.max(0, Math.floor(+d.params.bannerSlots || 0)); if (!slots) return null;
    const f = F(), want = [...d.recsFree.values()].filter((r) => r.banner);
    const buckets = new Map();
    want.forEach((r) => { const k = d.params.bannerMode === 'perTab' ? r.tab : 'all'; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r); });
    let over = 0; const keep = [], lose = [];
    buckets.forEach((list) => { const s = list.slice().sort((a, b) => b.revenue - a.revenue); s.forEach((r, i) => (i < slots ? keep : lose).push(r)); over += Math.max(0, list.length - slots); });
    if (!over) return null;
    const total = want.length, byName = new Map(d.batches.map((b) => [b.batchId, b.campaign]));
    const camps = [...new Set(want.filter((r) => r.key.startsWith('offer:')).map((r) => { const o = d.offers.find((x) => `offer:${x.offerId}` === r.key); return o ? byName.get(o.batchId) : null; }).filter(Boolean))];
    const soonCamp = soonest(d.camps.filter((c) => camps.includes(c.name)), d.today);
    const score = f.clamp(40 + Math.min(35, over * 7) + (camps.length >= 2 ? 10 : 0) + (soonCamp ? 10 : 0));
    const rows = keep.concat(lose).slice(0, LIMITS.topK + slots);
    const modeTxt = d.params.bannerMode === 'perTab' ? `por pestaña (Ofertas recibidas y Oportunidades)` : 'compartidos entre Ofertas recibidas y Oportunidades';
    return base('banner_saturado', 'Banner · más SKU que espacios', score, {
      owner: 'Ecommerce', tag: 'Banner saturado', viewLabel: 'Promociones › Activación',
      title: `${total} SKU piden banner y solo ${plural(slots, 'hay 1 espacio', `hay ${slots} espacios`)}`,
      resumen: `Las reglas de Activación mandan ${total} SKU al banner principal${camps.length ? ` desde ${camps.length} ${plural(camps.length, 'campaña', 'campañas')}` : ''}. El tope deja ${slots} y ${over} ${plural(over, 'pasa', 'pasan')} a la cuadrícula por tener menos venta.`,
      que: `Espacios de banner: ${slots}, ${modeTxt}. Compiten por venta; el descuento no da ventaja.`,
      big: { value: `${total} para ${slots}`, tone: 'dn', sub: `${over} ${plural(over, 'SKU pasa', 'SKU pasan')} a la cuadrícula Home por el tope` },
      visual: { type: 'table', head: ['Producto', 'Venta del periodo', 'Queda en'], num: [1], rows: rows.map((r) => [nameOf(d, r.key), f.money(r.revenue || 0), keep.includes(r) ? 'Banner' : 'Cuadrícula Home']) },
      lista: { title: `Los ${total} SKU que piden banner`, visual: { type: 'table', head: ['SKU', 'Producto', 'Venta', 'Queda en'], num: [2], rows: keep.concat(lose).slice(0, LIMITS.listMax).map((r) => [r.sku, nameOf(d, r.key), f.money(r.revenue || 0), keep.includes(r) ? 'Banner' : 'Cuadrícula Home']) } },
      hipotesis: 'Con ese tope no caben todos; la lista de arriba sale solo de la venta del periodo, no de qué conviene más al negocio. Es una hipótesis a validar.',
      validar: 'Revisa con Comercial si algún SKU de los que pasan a cuadrícula debe tener banner por compromiso con el laboratorio o por fecha.',
      accion: `Decidir cuáles ${slots} ${plural(slots, 'SKU se queda', 'SKU se quedan')} en banner y confirmar el resto en cuadrícula. Responsable natural: Ecommerce.`,
      evid: [{ k: 'SKU que piden banner', v: String(total) }, { k: 'Espacios de banner', v: String(slots) }, { k: 'Pasan a cuadrícula por el tope', v: String(over) }, ...(camps.length ? [{ k: 'Campañas que compiten', v: String(camps.length) }] : []),
        { k: 'Los que conservan banner', v: keep.slice(0, slots).map((r) => nameOf(d, r.key)).join(', ') }],
      pregunta: '¿Alguno de los SKU que pasan a cuadrícula debe tener banner por compromiso o por fecha?',
      limites: 'Los espacios son los que declaró Activación; la herramienta no sabe si el calendario del sitio tiene más. No mide el efecto de un banner.',
      facts: { total, slots, over, campaigns: camps.length }
    });
  }

  /** 3 · Ritmo requerido contra ritmo actual de una campaña con meta. Aritmética, no pronóstico. */
  function ritmo(d) {
    const f = F(), out = [];
    (d.rhythm || []).forEach((r) => {
      const remaining = r.target - r.done;
      if (!(remaining > 0) || !(r.daysLeft > 0) || !(r.recent.days > 0)) return;
      const required = remaining / r.daysLeft, actual = r.recent.value / r.recent.days;
      if (!(actual < required)) return;
      const fm = (v) => (r.metric === 'revenue' ? f.money(v) : `${intTxt(v)} uds`);
      const gap = 1 - actual / required, limited = r.recent.days < LIMITS.minRhythmDays || r.elapsed < LIMITS.minRhythmDays;
      const score = f.clamp(35 + Math.min(40, Math.round(gap * 60)) + (r.daysLeft <= 7 ? 15 : 0) - (limited ? 10 : 0));
      const pct = r.target > 0 ? r.done / r.target : 0, what = r.metric === 'revenue' ? 'de venta' : 'de unidades';
      out.push(base(`ritmo_${norm(r.campaign).replace(/[^a-z0-9]+/g, '_')}`, 'Ritmo requerido contra actual', score, {
        owner: 'Ecommerce', tag: limited ? 'Muestra limitada' : 'Ritmo bajo la meta', viewLabel: 'Promociones › Resultados',
        title: `«${r.campaign}» necesita ${fm(required)} por día y va en ${fm(actual)}`,
        resumen: `Para llegar a la meta ${what} faltan ${fm(remaining)} en ${r.daysLeft} ${plural(r.daysLeft, 'día', 'días')}. El ritmo de los últimos ${r.recent.days} ${plural(r.recent.days, 'día con venta', 'días con venta')} es menor que el requerido. Es aritmética, no un pronóstico.`,
        que: `Avance ${f.pct(pct, 0)} (${fm(r.done)} de ${fm(r.target)}) con datos al ${dayLabel(r.cutoff)}. La campaña termina el ${dayLabel(r.end)}.`,
        big: { value: fm(required), tone: 'dn', sub: `por día para llegar a la meta; ritmo actual ${fm(actual)}` },
        hipotesis: 'El ritmo reciente puede cambiar por el calendario de la campaña (arranque, fin de semana, últimos días). Es una hipótesis a validar, no una causa.',
        validar: 'Compara con los mismos días de otra campaña parecida y revisa en Resultados qué SKU explican la diferencia entre lo esperado y lo real.',
        accion: 'Decidir si se refuerza la campaña, se ajusta la meta o se deja como está. Responsable natural: Ecommerce.',
        evid: [{ k: 'Avance de la meta', v: `${f.pct(pct, 0)} (${fm(r.done)} de ${fm(r.target)})` }, { k: 'Ritmo requerido por día', v: fm(required) }, { k: `Ritmo actual (últimos ${r.recent.days} ${plural(r.recent.days, 'día', 'días')} con venta)`, v: fm(actual) },
          { k: 'Días restantes', v: String(r.daysLeft) }, { k: 'Corte de datos', v: dayLabel(r.cutoff) }],
        pregunta: `¿Qué SKU de «${r.campaign}» van por debajo de lo que necesita la meta?`,
        limites: `${limited ? `Solo hay ${r.recent.days} ${plural(r.recent.days, 'día', 'días')} de venta en la ventana: el ritmo actual puede cambiar mucho con un día más. ` : ''}${r.partial ? `Hay ${r.missing} ${plural(r.missing, 'promoción sin evaluación', 'promociones sin evaluación')} que no suman al avance. ` : ''}La meta la fijó una persona; la herramienta no dice si es razonable. La venta es real, no incremental.`,
        muestraLimitada: limited, facts: { campaign: r.campaign, required, actual, remaining, daysLeft: r.daysLeft, pct }
      }));
    });
    return out;
  }

  const DETECTORS = [oportunidadesAltas, bannerSaturado, ritmo];
  const contextoDe = (d) => {
    const f = F(), c = { hoy: d.today, campanas: [], traslapes: [], ofertasQueVencen: [], altasSinOferta: [], avanceDeMetas: [] };
    d.camps.forEach((x) => c.campanas.push(`${x.name}: ${x.start ? `${dayLabel(x.start)} al ${dayLabel(x.end || x.start)}` : 'sin fechas'}, ${x.skus.size} SKU, ${x.offers} ofertas`));
    for (let i = 0; i < d.camps.length; i++) for (let j = i + 1; j < d.camps.length; j++) {
      const a = d.camps[i], b = d.camps[j]; if (!a.start || !b.start || !a.end || !b.end || a.start > b.end || b.start > a.end) continue;
      const s = a.start > b.start ? a.start : b.start, e = a.end < b.end ? a.end : b.end, shared = [...a.skus].filter((k) => b.skus.has(k)).length;
      c.traslapes.push(`${a.name} y ${b.name} se traslapan ${diffDays(e, s) + 1} días (${dayLabel(s)} al ${dayLabel(e)}) con ${shared} SKU en común`);
    }
    const lim = addDays(d.today, LIMITS.weekDays), by = new Map();
    d.offers.forEach((o) => { if (isISO(o.end) && o.end >= d.today && o.end <= lim) { const k = (d.batches.find((b) => b.batchId === o.batchId) || {}).campaign || 'Sin campaña'; const x = by.get(k) || { n: 0, end: o.end }; x.n += 1; if (o.end < x.end) x.end = o.end; by.set(k, x); } });
    by.forEach((x, k) => c.ofertasQueVencen.push(`${k}: ${x.n} ofertas vencen desde el ${dayLabel(x.end)}`));
    if (d.opp) d.opp.items.filter((i) => { const r = d.recsFree.get(`sku:${i.sku}`); return r && r.priority === 'Alta' && !r.blocked; }).slice(0, LIMITS.listMax).forEach((i) => c.altasSinOferta.push(`${i.sku} ${i.name || ''}: ${f.money(fin(i.revenue) ? i.revenue : 0)}`));
    (d.rhythm || []).forEach((r) => c.avanceDeMetas.push(`${r.campaign}: ${f.pct(r.target > 0 ? r.done / r.target : 0, 0)} de la meta, termina el ${dayLabel(r.end)}`));
    if (d.opp && d.opp.profiles && d.opp.profiles.size) {
      const inOffer = new Set(d.offers.map((o) => o.sku)), acc = { on: { v: 0, c: 0, n: 0 }, off: { v: 0, c: 0, n: 0 } };
      d.opp.profiles.forEach((p, sku) => { if (!p.hasFunnel || !fin(p.views) || !fin(p.conv) || !(p.views > 0)) return; const k = inOffer.has(sku) ? acc.on : acc.off; k.v += p.views; k.c += p.views * p.conv; k.n += 1; });
      if (acc.on.n && acc.off.n) c.conversion = { fuente: 'Oportunidades · embudo de GA4', conOferta: `${f.pct(acc.on.c / acc.on.v)} en ${acc.on.n} SKU`, sinOferta: `${f.pct(acc.off.c / acc.off.v)} en ${acc.off.n} SKU`, nota: 'Compara SKU con oferta contra SKU sin ella en el mismo periodo; no mide el efecto de la oferta.' };
    }
    return c;
  };

  /** Puro: de los datos recolectados a hallazgos. Un detector que falla se omite y se reporta en `errors`. */
  function analyze(data) {
    const d = data || {};
    if (d.status !== 'ok') return { status: d.status || 'sin_promos', scope: null, findings: [], errors: d.errors || [], detectors: DETECTORS.length };
    const errors = [...(d.errors || [])], findings = [];
    const x = { ...d, camps: campaignsOf(d) };
    try {
      const inp = { offers: d.offers, items: d.opp ? d.opp.items : [], profiles: d.opp ? d.opp.profiles : null };
      x.recs = FP.activation.recommendAll({ ...inp, params: d.params });
      x.recsFree = FP.activation.recommendAll({ ...inp, params: { ...d.params, bannerSlots: 9999 } });   // lo que pediría cada SKU sin el tope
    } catch (e) { errors.push(`activación: ${e && e.message || e}`); x.recs = new Map(); x.recsFree = new Map(); }
    DETECTORS.forEach((fn) => { try { const r = fn(x); (Array.isArray(r) ? r : r ? [r] : []).forEach((h) => findings.push(h)); } catch (e) { errors.push(`${fn.name}: ${e && e.message || e}`); } });
    findings.sort((a, b) => b.score - a.score);
    if (!d.opp) errors.push('oportunidades: no hay venta por producto cargada, así que no pude revisar oportunidades.');
    return { status: 'ok', scope: { channel: 'total', channelLabel: 'Promociones y ofertas', period: { type: 'promo', key: d.today }, label: null, lastActual: d.dataMax, today: d.today, campaigns: x.camps.length, offers: d.offers.length, promotions: d.promotions.length, opps: d.opp ? d.opp.items.length : 0 },
      findings, errors, detectors: DETECTORS.length, contexto: contextoDe(x), dateMax: d.dataMax };
  }

  async function detect(state, opts = {}) { return analyze(await collect(state, opts)); }

  FP.agents.arquitecto = { detect, collect, analyze, campaignsOf, soonest, LIMITS, DETECTORS_COUNT: DETECTORS.length, _dayLabel: dayLabel, _addDays: addDays, _diffDays: diffDays };
})(typeof window !== 'undefined' ? window : globalThis);
