/**
 * analistaStory.js — Fase 2 · «La historia del periodo» del Analista de Números.
 *
 * En vez de una lista suelta de hallazgos, arma una historia en tres partes (qué se cae, qué crece, dónde revisar primero) y una ruta de
 * 5 preguntas para entenderla. Todo es código determinista: LEE los detectores del Analista (canales contra el plan, drivers, calidad) y el
 * análisis de productos (categorías contra el periodo anterior, subcategorías y geografía). La IA, si hay, solo ordena y redacta tarjetas;
 * nunca calcula ni escribe la historia ni la ruta.
 *
 * Sigue lo que la persona tiene elegido en la app (año, mes o semana, y canal); sin selección usable, el mes de la última venta real.
 *
 * Habla de venta, pedidos, ticket, unidades y clientes. Nunca de ganancia, margen ni costo por producto: la herramienta no los tiene.
 * `build` nunca lanza: lo que no se puede calcular se dice («sin archivo de productos»), no se inventa.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.agents.analista.fmt;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthLabel = (key) => { const m = /^(\d{4})-(\d{2})/.exec(String(key || '')); return m ? `${MESES[+m[2] - 1]} ${m[1]}` : String(key || ''); };
  const dayLabel = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${+m[3]} ${MESES[+m[2] - 1].slice(0, 3)}` : String(d || ''); };
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const up = (n) => `+${F().money(n).replace(/^−/, '')}`;

  function depsOf(o = {}) {
    return {
      home: o.home || FP.homeSummaryEngine, advisor: o.advisor || FP.methodAdvisor,
      products: o.products || FP.productAnalysis, store: o.store || FP.productStore,
      range: o.range || ((type, key) => (FP.app && FP.app.periodRange ? FP.app.periodRange(type, key) : null)),
      traffic: o.traffic || FP.trafficConversionEngine,
      confidence: o.confidence !== undefined ? o.confidence : FP.forecastConfidence
    };
  }

  // ---------- Categorías (necesita el archivo de productos) ----------
  /** Rango del mes de trabajo acotado a lo que cubre el archivo de productos. null si el archivo no llega a ese mes. */
  function productRange(state, sc, deps) {
    const meta = deps.store && deps.store.meta;
    if (!meta || !meta.dateMax || !meta.batches) return { status: 'sin_producto' };
    const r = deps.range(sc.period.type, sc.period.key);   // mes, semana o año según lo elegido
    if (!r || !r.from) return { status: 'sin_producto' };
    if (meta.dateMax < r.from || (meta.dateMin && meta.dateMin > r.to)) return { status: 'sin_mes', dateMax: meta.dateMax };
    return { status: 'ok', from: r.from, to: r.to < meta.dateMax ? r.to : meta.dateMax, dateMax: meta.dateMax };
  }

  function driversOf(row, trafficEng) {
    const d = row && row.drivers; if (!d) return null;
    const v = (m) => (d[m] && fin(d[m].current) && fin(d[m].baseline) ? d[m] : null);
    const views = v('views'), orders = v('orders'), rev = v('revenue');
    let eff = null;
    if (views && orders && rev && views.baseline > 0 && trafficEng) {
      try { const e = trafficEng.effects({ t: views.baseline, o: orders.baseline, r: rev.baseline }, { t: views.current, o: orders.current, r: rev.current }); eff = { traffic: e.traffic, cr: e.cr, aov: e.aov, delta: e.delta }; } catch (e) { eff = null; }
    }
    return { eff, viewsPct: views ? views.deltaPct : null, crDelta: d.conversionRate && fin(d.conversionRate.delta) ? d.conversionRate.delta : null, aovPct: d.aov ? d.aov.deltaPct : null,
      ordersPct: orders ? orders.deltaPct : null };
  }

  async function categoryFindings(state, sc, deps) {
    const info = productRange(state, sc, deps), out = { status: info.status, findings: [], ctx: null, errors: [] };
    if (info.status !== 'ok') return out;
    const P = deps.products, f = F();
    const args = { from: info.from, to: info.to, periodType: sc.period.type, comparison: 'previous', channel: sc.channel || 'total', level: 'category' };
    let res; try { res = await P.run({ ...args, withGeoSignals: true }); } catch (e) { out.status = 'error'; out.errors.push(`categorías: ${e && e.message || e}`); return out; }
    if (!res || !res.rows || !res.rows.length) { out.status = 'sin_mes'; return out; }
    const baseTotal = res.total.revenue.baseline || 0, base = res.baseline || {};
    const dec = res.rows.filter((r) => r.contributionAbs < 0).sort((a, b) => a.contributionAbs - b.contributionAbs);
    const gro = res.rows.filter((r) => r.contributionAbs > 0).sort((a, b) => b.contributionAbs - a.contributionAbs);
    const sumDec = dec.reduce((s, r) => s + r.contributionAbs, 0), sumGro = gro.reduce((s, r) => s + r.contributionAbs, 0);
    // «mes anterior (mismos días)» → «el mes anterior (mismos días)»: se lee bien después de «contra»
    const label = (base.label || 'el periodo anterior').replace(/^(mes|año) /, 'el $1 ').replace(/^semana /, 'la semana ');
    out.ctx = { info, res, label, dec, gro, sumDec, sumGro, baseTotal };
    const same = sc.period.type === 'week' ? 'la misma semana del año anterior' : sc.period.type === 'year' ? 'el año anterior' : 'el mismo mes del año anterior';
    const material = (v) => baseTotal > 0 && Math.abs(v) >= 0.01 * baseTotal;   // menos de 1 % de la venta base es ruido

    // Qué se cae
    if (dec.length && material(sumDec)) {
      const top = dec[0], share = top.contributionAbs / sumDec, rest = dec.slice(3);
      const dr = driversOf(top, deps.traffic);
      const concentrated = share >= 0.5;
      const score = f.clamp(30 + Math.abs(sumDec) / baseTotal * 100 * 5 + (share - 0.4) * 40);
      const evid = [{ k: `${top.key}: venta actual / ${label}`, v: `${f.money(top.revenue.current || 0)} / ${f.money(top.revenue.baseline || 0)}` }, { k: `${top.key} contra ${label}`, v: f.spct(top.revenue.deltaPct) },
        { k: 'Lo que restan las categorías que caen', v: f.money(sumDec) }, { k: `Parte de esa caída que es ${top.key}`, v: f.pct(share, 0) }];
      if (dr && dr.viewsPct !== null) evid.push({ k: `${top.key}: vistas de ficha contra ${label}`, v: f.spct(dr.viewsPct) });
      if (dr && dr.crDelta !== null) evid.push({ k: `${top.key}: cambio de conversión`, v: `${dr.crDelta >= 0 ? '+' : '−'}${(Math.abs(dr.crDelta) * 100).toFixed(1)} pp` });
      if (dr && dr.aovPct !== null) evid.push({ k: `${top.key}: ticket promedio contra ${label}`, v: f.spct(dr.aovPct) });
      const sig = (top.signals || [])[0];
      out.findings.push({
        id: 'categoria_cae', agent: 'analista', detector: 'Categorías · caída contra el periodo anterior', score, prio: f.prioOf(score), owner: 'Comercial',
        section: 'cae', tag: concentrated ? `Concentrada · ${Math.round(share * 100)}% de la caída` : `Repartida · la mayor es ${Math.round(share * 100)}%`,
        title: concentrated ? `${top.key} concentra ${Math.round(share * 100)}% de la caída por categoría` : `La caída por categoría está repartida; la mayor es ${top.key}`,
        story: concentrated ? `${top.key} concentra ${Math.round(share * 100)}% de lo que cae por categoría` : `${top.key} es la categoría que más cae`,
        resumen: `${top.key} va ${f.spct(top.revenue.deltaPct)} contra ${label} y resta ${f.money(Math.abs(top.contributionAbs)).replace(/^−/, '')} de los ${f.money(Math.abs(sumDec)).replace(/^−/, '')} que restan en total las ${dec.length} categorías que caen.`,
        que: `${top.key} pasó de ${f.money(top.revenue.baseline || 0)} a ${f.money(top.revenue.current || 0)}${sig ? `; señal: ${sig.label}.` : '.'}`,
        big: { value: f.money(top.contributionAbs), tone: 'dn', sub: `de ${f.money(sumDec)} que caen las categorías · ${f.spct(top.revenue.deltaPct)} contra ${label}` },
        visual: f.barsOf(dec.slice(0, 3).map((r) => ({ label: r.key, value: r.contributionAbs })), { n: rest.length, value: rest.reduce((s, r) => s + r.contributionAbs, 0) }),
        hipotesis: `Algo propio de ${top.key} (oferta, abasto, precio o visibilidad) y no del negocio completo. La herramienta no tiene inventario ni precios de la competencia: es una hipótesis a validar, no una causa.`,
        validar: `Revisa abajo en qué subcategorías, sucursales o entregas se concentra la caída, y compara ${top.key} contra ${same}.`,
        accion: `Revisar las subcategorías de ${top.key} que más restaron, junto con Catálogo / Contenido.`,
        evid, pregunta: `¿La caída de ${top.key} se concentra en pocas subcategorías, sucursales o entregas?`,
        limites: 'Describo dónde cae la venta contra el periodo anterior; no sé por qué. Sin inventario, costo ni margen.',
        fuente: 'Productos · comparación contra el periodo anterior', view: 'producto', viewLabel: 'Productos',
        facts: { top: top.contributionAbs, sumDec, share, deltaPct: top.revenue.deltaPct }
      });
    }

    // Qué crece
    if (gro.length && material(sumGro)) {
      const top = gro[0], share = top.contributionAbs / sumGro, rest = gro.slice(3), dr = driversOf(top, deps.traffic);
      const covers = sumDec < 0 ? Math.min(1, sumGro / -sumDec) : null;
      const score = f.clamp(15 + Math.abs(sumGro) / baseTotal * 100 * 5, 0, 69);
      const evid = [{ k: `${top.key}: venta actual / ${label}`, v: `${f.money(top.revenue.current || 0)} / ${f.money(top.revenue.baseline || 0)}` }, { k: `${top.key} contra ${label}`, v: f.spct(top.revenue.deltaPct) },
        { k: 'Lo que suman las categorías que crecen', v: up(sumGro) }];
      if (covers !== null) evid.push({ k: 'Parte de lo que cae que compensan', v: f.pct(covers, 0) });
      if (dr && dr.ordersPct !== null) evid.push({ k: `${top.key}: pedidos contra ${label}`, v: f.spct(dr.ordersPct) });
      if (dr && dr.aovPct !== null) evid.push({ k: `${top.key}: ticket promedio contra ${label}`, v: f.spct(dr.aovPct) });
      out.findings.push({
        id: 'categoria_crece', agent: 'analista', detector: 'Categorías · crecimiento contra el periodo anterior', score, prio: f.prioOf(score), owner: 'Comercial',
        section: 'crece', tag: covers !== null && covers >= 0.5 ? 'Compensa' : 'Crece',
        title: covers !== null && covers >= 0.5 ? `${top.key} lidera lo que crece y compensa ${f.pct(covers, 0)} de lo que cae` : `${top.key} es la categoría que más crece`,
        story: `${top.key} suma ${f.money(top.contributionAbs)} contra ${label}`,
        resumen: `${top.key} va ${f.spct(top.revenue.deltaPct)} contra ${label} y suma ${f.money(top.contributionAbs)}; ${gro.length} categoría(s) crecen y suman ${f.money(sumGro)}.`,
        que: `${top.key} pasó de ${f.money(top.revenue.baseline || 0)} a ${f.money(top.revenue.current || 0)}${covers !== null ? `; en conjunto lo que crece cubre ${f.pct(covers, 0)} de lo que cae.` : '.'}`,
        big: { value: up(top.contributionAbs), tone: 'up', sub: `${top.key} · ${f.spct(top.revenue.deltaPct)} contra ${label}` },
        visual: f.barsOf(gro.slice(0, 3).map((r) => ({ label: r.key, value: r.contributionAbs })), { n: rest.length, value: rest.reduce((s, r) => s + r.contributionAbs, 0) }),
        hipotesis: 'Si el crecimiento depende de pocos productos o de un empujón puntual, puede no sostenerse. A validar, no es una causa.',
        validar: `Mira si ${top.key} crece por más pedidos o por mayor ticket, y si es parejo entre sucursales.`,
        accion: `Identificar qué funciona en ${top.key} y si se puede sostener o replicar.`,
        evid, pregunta: `¿El crecimiento de ${top.key} es parejo o lo carga un solo producto?`,
        limites: 'Describo cuánto crece y cuánto compensa; no sé de qué viene ni si se sostiene.',
        fuente: 'Productos · comparación contra el periodo anterior', view: 'producto', viewLabel: 'Productos',
        facts: { top: top.contributionAbs, sumGro, share, covers, deltaPct: top.revenue.deltaPct }
      });
    }
    return out;
  }

  /** Dónde revisar primero: dentro de la categoría que más cae, subcategorías y geografía donde se concentra. */
  async function drillFinding(state, sc, cat, deps) {
    if (!cat || !cat.ctx || !cat.ctx.dec.length) return { finding: null, sub: null };
    const { info, res, label, dec } = cat.ctx, top = dec[0], f = F();
    const same = sc.period.type === 'week' ? 'la misma semana del año anterior' : sc.period.type === 'year' ? 'el año anterior' : 'el mismo mes del año anterior';
    let sub = null;
    try { sub = await deps.products.run({ from: info.from, to: info.to, periodType: sc.period.type, comparison: 'previous', channel: sc.channel || 'total', level: 'subcategory', filter: { category: top.key }, withGeoSignals: false }); } catch (e) { sub = null; }
    const subs = sub && sub.rows ? sub.rows.filter((r) => r.contributionAbs < 0).sort((a, b) => a.contributionAbs - b.contributionAbs).slice(0, 2) : [];
    const sigs = (res.geoSignals || []).filter((s) => s.entity === top.key && s.variation && s.variation.delta < 0)
      .sort((a, b) => (b.type === 'geo_concentration') - (a.type === 'geo_concentration') || b.explainedShare - a.explainedShare);
    const geo = sigs[0] || null;
    const DIM = { state: 'Estados', branch: 'Sucursales', delivery: 'Entregas' };
    const names = geo ? (geo.geography || []).map((g) => g.name).filter(Boolean) : [];
    const rows = [];
    subs.forEach((r) => rows.push([`Subcategoría ${r.key}`, f.money(r.contributionAbs)]));
    if (geo && names.length) rows.push([`${DIM[geo.dimension] || geo.dimension}: ${names.join(' y ')}`, `${f.pct(geo.explainedShare, 0)} de la caída`]);
    if (!rows.length) return { finding: null, sub };
    const DIM_LOW = { state: 'los estados', branch: 'las sucursales', delivery: 'las entregas' };
    const join = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}` : a[0]);
    const parts = [];
    if (subs.length) parts.push(`${subs.length > 1 ? 'las subcategorías' : 'la subcategoría'} ${join(subs.map((r) => r.key))}`);
    if (geo && names.length) parts.push(`${DIM_LOW[geo.dimension] || geo.dimension} ${join(names)}`);
    const where = parts.join(', y ');
    const finding = {
      id: 'donde_revisar', agent: 'analista', detector: 'Dónde revisar primero · subcategorías y geografía', score: Math.max(0, (cat.findings.find((x) => x.id === 'categoria_cae') || { score: 40 }).score - 1), owner: 'Comercial',
      section: 'revisar', tag: 'Pista',
      title: `Dentro de ${top.key}, mira primero ${rows.length === 1 ? 'esto' : `estas ${rows.length === 2 ? 'dos' : 'tres'} cosas`}`,
      story: `dentro de ${top.key}: ${where}`,
      resumen: `La caída de ${top.key} se ve sobre todo en ${where}.`,
      que: `Es el desglose descriptivo de ${top.key} contra ${label}: dónde se mueve más la venta, no por qué.`,
      visual: { type: 'table', head: ['Dónde', 'Aporta a la caída'], rows },
      hipotesis: 'Si la caída se concentra en pocos lugares, el origen probable está en esos lugares y no en toda la categoría. A validar.',
      validar: `Abre Productos con esa categoría y revisa esos lugares contra ${same}.`,
      accion: 'Revisar abasto y oferta en lo que muestra la tabla, y las fichas de esa subcategoría junto con Catálogo / Contenido.',
      evid: rows.map((r) => ({ k: r[0], v: r[1] })), pregunta: `¿Qué tienen en común ${parts[0]} dentro de ${top.key}?`,
      limites: 'Señal descriptiva sobre venta; no hay inventario ni precios de competencia en los datos. Entregas y sucursales no cruzan con el embudo.',
      fuente: 'Productos · desglose por subcategoría y geografía', view: 'producto', viewLabel: 'Productos',
      facts: { rows: rows.length }
    };
    finding.prio = f.prioOf(finding.score);
    return { finding, sub, geo };
  }

  /** ¿Sostenido o rebote? Misma categoría contra el mismo periodo del año anterior. */
  async function yoyOf(state, sc, cat, deps) {
    if (!cat || !cat.ctx || !cat.ctx.dec.length) return null;
    const { info, dec } = cat.ctx;
    try {
      const r = await deps.products.run({ from: info.from, to: info.to, periodType: sc.period.type, comparison: 'yoy', channel: sc.channel || 'total', level: 'category', withGeoSignals: false });
      const row = r && r.rows ? r.rows.find((x) => x.key === dec[0].key) : null;
      return row && row.revenue && fin(row.revenue.deltaPct) && fin(row.revenue.baseline) && row.revenue.baseline > 0 ? { key: dec[0].key, deltaPct: row.revenue.deltaPct } : null;
    } catch (e) { return null; }
  }

  // ---------- Confianza ----------
  function gateOf(state, det, cat, sc) {
    const f = F(), items = [];
    const dist = det.findings.find((x) => x.id === 'datos_distorsionan');
    let level = 'ok';
    // Los avisos de calidad ya salen como hallazgo en «Dónde revisar primero»: no se repiten en un banner arriba.
    if (cat.status === 'sin_producto') items.push('No hay archivo de productos cargado: la historia se queda en canales y no baja a categorías.');
    else if (cat.status === 'sin_mes') items.push(`El archivo de productos no cubre ${sc.W.este}: la historia se queda en canales.`);
    else if (cat.status === 'error') { level = 'warn'; items.push('No pude leer el archivo de productos; la historia se queda en canales.'); }
    const q = state.quality && state.quality.totals ? state.quality.totals : null;
    const flagged = q ? (q.warning || 0) + (q.error || 0) + (q.rejected || 0) : 0;
    const cut = dayLabel(sc.lastActual);
    // Con avisos de calidad no se afirma «Dato confiable»; tampoco se pone banner de aviso (el hallazgo lo dice abajo).
    if (dist && !items.length) return null;
    const title = level === 'ok' ? 'Dato confiable' : 'Dato con avisos';
    const text = level === 'ok'
      ? `Venta real cargada hasta el ${cut} y plan ${sc.W.del} completo${dist ? '' : flagged ? `; ${flagged} aviso(s) de calidad en otras cargas` : '; sin avisos de calidad'}.${items.length ? ` ${items.join(' ')}` : ''}`
      : items.join(' ');
    return { level, title, text, items, flagged, view: dist ? 'calidad' : null };
  }

  // ---------- Historia, KPIs, ruta ----------
  function kpisOf(det, deps, state, sc) {
    const k = det.scope.kpi, f = F(); if (!k) return [];
    let g = null; try { g = sc.period.type === 'week' ? null : deps.home.goal(state, sc.channel || 'total', sc.period); } catch (e) { g = null; }
    const out = [
      { k: 'Venta real al corte', v: f.money(k.actual), tone: '' },
      { k: 'Plan a la fecha', v: f.money(k.plan), tone: '' },
      { k: 'Brecha', v: `${f.money(k.gap)} · ${f.spct(k.gapPct)}`, tone: k.gap < 0 ? 'dn' : k.gap > 0 ? 'up' : '' }
    ];
    const tile = g && fin(g.cumulative) ? { k: g.status === 'missed' ? `Cierre ${sc.W.del}` : `Cierre estimado ${sc.W.del}`, v: f.money(g.cumulative), tone: '' } : { k: `Cierre estimado ${sc.W.del}`, v: 's/d', tone: '' };
    // Fase 3: qué tan sólida es la base de ese cierre (solo si es una estimación: periodo en curso)
    try {
      const C = deps.confidence, a = C && state.fc && state.fc.run ? C.assess({ run: state.fc.run, channel: sc.channel, period: sc.period, advisor: deps.advisor }) : null;
      if (a && a.status === 'ok') { tile.chip = `Confianza ${a.label}`; tile.chipLevel = a.level; }
    } catch (e) { /* sin confianza: el cierre se muestra igual */ }
    out.push(tile);
    return out;
  }

  function headlineOf(det, sections) {
    const k = det.scope.kpi, f = F();
    const lead = !k ? '' : Math.abs(k.gapPct) < 0.005 ? `Vamos en plan (${f.money(k.actual)} de ${f.money(k.plan)} a la fecha de corte).`
      : k.gap < 0 ? `Vamos ${f.pct(Math.abs(k.gapPct))} abajo del plan (${f.money(k.gap)} de ${f.money(k.plan)}).` : `Vamos ${f.pct(k.gapPct)} arriba del plan (+${f.money(k.gap).replace(/^−/, '')} de ${f.money(k.plan)}).`;
    const pick = (list, none) => (list.length ? cap(list[0].story || list[0].title).replace(/\.$/, '') + '.' : none);
    const items = [
      { k: 'Se cae', text: pick(sections.cae, 'Nada relevante: ningún canal ni categoría se sale de lo normal.') },
      { k: 'Crece', text: pick(sections.crece, 'Ningún canal ni categoría crece lo suficiente para compensar.') },
      { k: 'Para revisar primero', text: sections.revisar.length ? cap(sections.revisar[0].story || sections.revisar[0].title).replace(/\.$/, '') + '.' : 'Nada urgente: no hay una pista clara adicional.' }
    ];
    return { lead, items };
  }

  function routeOf(ctx) {
    const { det, find, cat, drill, yoy, goal, sections, state, deps, W } = ctx, f = F(), k = det.scope.kpi || {}, gap = k.gap || 0;
    const steps = [];
    // 1 · cuánto y contra qué
    const q1 = gap < 0 ? '¿Cuánto se pierde y contra qué?' : '¿Cuánto vamos arriba y contra qué?';
    let a1 = `${gap < 0 ? f.money(gap) : `+${f.money(gap).replace(/^−/, '')}`} contra el plan a la fecha de corte (${f.spct(k.gapPct || 0)}), comparando solo días con plan y venta real.`;
    if (goal && fin(goal.cumulative) && fin(goal.goal) && goal.goal > 0) {
      const rel = (goal.cumulative - goal.goal) / goal.goal, vs = Math.abs(rel) < 0.005 ? 'prácticamente igual a' : rel > 0 ? 'por encima de' : 'por debajo de';
      a1 += ` Con el forecast del método en uso ${W.art.toLowerCase()} ${goal.status === 'missed' ? 'cerró' : 'cerraría'} en ${f.money(goal.cumulative)}, ${vs} la meta ${W.del} (${f.money(goal.goal)}).`;
    }
    steps.push({ q: q1, a: a1 });
    // 2 · dónde se concentra
    const parts = [];
    const ch = find('brecha_concentrada') || find('canales_bajo_plan'); if (ch) parts.push(`Por canal: ${ch.title}.`);
    const ct = find('categoria_cae'); if (ct) parts.push(`Por categoría: ${ct.story}.`);
    if (drill && drill.finding) parts.push(`Dentro de ${cat.ctx.dec[0].key}: ${drill.finding.evid.map((e) => `${e.k.charAt(0).toLowerCase() + e.k.slice(1)} (${e.v})`).join('; ')}.`);
    steps.push({ q: '¿Dónde se concentra?', a: parts.length ? parts.join(' ') : `No se concentra en un lugar: ningún canal ni categoría pasa el umbral.${cat.status === 'ok' ? '' : ' Sin archivo de productos no puedo bajar a categorías.'}` });
    // 3 · volumen, conversión o ticket
    const dp = find('driver_dominante'), dcat = cat.ctx && cat.ctx.dec.length ? driversOf(cat.ctx.dec[0], deps.traffic) : null;
    const p3 = [];
    if (dp) p3.push(`Contra el plan: ${dp.evid.slice(0, 3).map((e) => `${e.k.charAt(0).toLowerCase() + e.k.slice(1)} ${e.v}`).join(', ')}.`);
    if (dcat && (dcat.viewsPct !== null || dcat.crDelta !== null || dcat.aovPct !== null)) {
      p3.push(`En ${cat.ctx.dec[0].key}: ${[dcat.viewsPct !== null ? `vistas ${f.spct(dcat.viewsPct)}` : null, dcat.crDelta !== null ? `conversión ${dcat.crDelta >= 0 ? '+' : '−'}${(Math.abs(dcat.crDelta) * 100).toFixed(1)} pp` : null, dcat.aovPct !== null ? `ticket ${f.spct(dcat.aovPct)}` : null].filter(Boolean).join(', ')}.`);
    }
    steps.push({ q: '¿Fue por volumen, conversión o ticket?', a: p3.length ? `${p3.join(' ')} Es un reparto aritmético, no una causa.` : 'No tengo con qué repartirlo: faltan sesiones o pedidos en el plan o en el archivo de productos.' });
    // 4 · sostenido o rebote
    let a4;
    if (yoy && cat.ctx && cat.ctx.dec.length) {
      const prev = cat.ctx.dec[0].revenue.deltaPct;
      a4 = prev < 0 && yoy.deltaPct < 0 ? `${yoy.key} va ${f.spct(prev)} contra ${cat.ctx.label} y ${f.spct(yoy.deltaPct)} contra el mismo periodo del año anterior: la baja se ve en las dos comparaciones. No tengo la serie completa de meses.`
        : prev < 0 ? `${yoy.key} va ${f.spct(prev)} contra ${cat.ctx.label}, pero ${f.spct(yoy.deltaPct)} contra el mismo periodo del año anterior: puede ser un rebote o estacionalidad más que una tendencia.` : `Contra el año anterior ${yoy.key} va ${f.spct(yoy.deltaPct)}.`;
    } else {
      const w = ctx.whyPrev;
      a4 = w && w.status === 'ok' ? `El total va ${f.money(w.delta)} contra el periodo anterior. Sin archivo de productos no puedo ver si una categoría concreta es sostenida o un rebote.` : 'No tengo un periodo anterior comparable cargado para decir si es sostenido o un rebote.';
    }
    steps.push({ q: '¿Es algo sostenido o un rebote?', a: a4 });
    // 5 · qué hago y quién
    const acts = sections.cae.concat(sections.revisar, sections.crece).filter((x) => x.accion).slice(0, 3);
    steps.push({ q: '¿Qué hago esta semana y quién?', a: acts.length ? `${acts.map((x, i) => `${i + 1}. ${x.owner}: ${x.accion}`).join(' ')} Después cargas el siguiente corte y volvemos a medir.` : 'Nada que accionar esta semana. Cuando cargues el siguiente corte lo reviso de nuevo.', last: true });
    return steps;
  }

  /**
   * Historia completa. Nunca lanza.
   * @returns {Promise<{status, scope, gate, headline, kpis, findings, sections, route, detectors, errors, productStatus}>}
   */
  async function build(state, opts = {}) {
    const deps = depsOf(opts.deps || {});
    const A = FP.agents.analista;
    const det = A.detect(state, { home: deps.home, advisor: deps.advisor });
    if (det.status !== 'ok') return { status: det.status, scope: null, selection: det.selection || null, gate: null, headline: null, kpis: [], findings: [], sections: { cae: [], crece: [], revisar: [] }, route: [], detectors: det.detectors, errors: det.errors || [], productStatus: 'sin_producto' };
    const sc = { period: det.scope.period, lastActual: det.scope.lastActual, channel: det.scope.channel || 'total', W: A.wordsOf(det.scope.period.type) };
    const errors = [...(det.errors || [])];
    let cat = { status: 'sin_producto', findings: [], ctx: null, errors: [] }, drill = { finding: null }, yoy = null;
    try { cat = await categoryFindings(state, sc, deps); errors.push(...cat.errors); } catch (e) { errors.push(`categorías: ${e && e.message || e}`); }
    try { drill = await drillFinding(state, sc, cat, deps); } catch (e) { errors.push(`dónde revisar: ${e && e.message || e}`); drill = { finding: null }; }
    try { yoy = await yoyOf(state, sc, cat, deps); } catch (e) { yoy = null; }
    const all = [...det.findings, ...cat.findings, ...(drill.finding ? [drill.finding] : [])].map((x) => ({ ai: false, ...x })).sort((a, b) => b.score - a.score);
    const sections = { cae: [], crece: [], revisar: [] };
    all.forEach((x) => { (sections[x.section] || sections.revisar).push(x); });
    // El detector de calidad de datos va primero en «revisar» solo si hay avisos; las pistas por categoría pesan más para empezar a mirar.
    const find = (id) => all.find((x) => x.id === id) || null;
    let goal = null, whyPrev = null;
    try { goal = sc.period.type === 'week' ? null : deps.home.goal(state, sc.channel, sc.period); } catch (e) { goal = null; }
    try { whyPrev = deps.home.why(state, sc.channel, sc.period); } catch (e) { whyPrev = null; }
    const out = {
      status: 'ok', scope: { ...det.scope, label: det.scope.label || monthLabel(sc.period.key), channelLabel: det.scope.channelLabel || 'Total digital', cut: dayLabel(sc.lastActual), compare: cat.ctx ? cat.ctx.label : null }, detectors: det.detectors + 3, errors, productStatus: cat.status,
      gate: gateOf(state, det, cat, sc), kpis: kpisOf(det, deps, state, sc), findings: all, sections
    };
    out.headline = headlineOf(det, sections);
    out.route = routeOf({ det, find, cat, drill, yoy, goal, sections, state, deps, whyPrev, W: sc.W });
    return out;
  }

  FP.agents.story = { build, monthLabel, dayLabel, _driversOf: driversOf, _productRange: productRange };
})(typeof window !== 'undefined' ? window : globalThis);
