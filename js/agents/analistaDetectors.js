/**
 * analistaDetectors.js — Fase 1 · Detectores del Analista de Números.
 *
 * Código determinista: LEE los motores que ya existen (Pacing/Forecast, Diagnóstico, Calidad de datos) y devuelve «candidatos a hallazgo»
 * con cifras, evidencia y texto base. NO calcula métricas nuevas y NO usa IA: si Cohere no está disponible, el panel muestra estos
 * mismos textos. Cuando hay IA, solo recibe estos candidatos para ordenarlos y redactarlos (agentRunner.js).
 *
 * Alcance: lo que la persona tiene elegido en la app (contexto persistente: año, mes o semana, y canal); si no hay selección usable, Total digital y el mes
 * de la última fecha con venta real. Cada detector devuelve un candidato o null.
 * Cada candidato: { id, detector, agent, score 0-100, prio 'Alta'|'Media'|'Baja', owner, title, resumen, que, evid[{k,v}], pregunta,
 *                   limites, fuente, view, viewLabel, handoff?{to,reason}, facts{ números sin formato, para validar a Cohere } }
 * Fase 2 (tarjeta compartida con el Auditor de Conversión), todos opcionales:
 *   section 'cae'|'crece'|'revisar' (en qué parte de la historia va), tag (etiqueta corta), big {value, tone 'dn'|'up'|'', sub} (cifra grande),
 *   visual {type:'bars', rows[{label,value,text}]} | {type:'table', head[], rows[[]]} | {type:'steps', rows[{label,a,b,aText,bText}]},
 *   hipotesis (a validar, nunca causa), validar (cómo comprobarla), accion (qué hacer esta semana; el responsable es `owner`), muestraLimitada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  FP.agents = FP.agents || {};
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  // Responsables posibles (los mismos «ownerArea» que ya usa el plan de acción)
  const OWNERS = ['Ecommerce', 'Comercial', 'Catálogo / Contenido', 'Contenido / SEO', 'Producto / UX', 'Pagos / Operaciones', 'Marketing', 'CRM', 'Contact center'];
  const CHANNEL_OWNER = { ecommerce: 'Ecommerce', app: 'Ecommerce', whatsapp: 'Contact center', llamadas: 'Contact center' };
  const DRIVER_LABEL = { traffic: 'tráfico', cr: 'conversión', aov: 'ticket promedio' };
  const DRIVER_ACTION = { traffic: 'Revisar de dónde viene y a dónde va el tráfico del canal.', cr: 'Revisar en qué paso del embudo se queda la compra (el Auditor de Conversión lo desglosa).', aov: 'Revisar la mezcla de productos y el tamaño de carrito.' };

  // ---- formato (mismo estilo que la app: «96.9%», «$4.6 M») ----
  const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
  const spct = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${(Math.abs(v) * 100).toFixed(d)}%`;
  function money(v) {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)} M`;
    if (a >= 1e4) return `${s}$${Math.round(a / 1e3)} mil`;
    return `${s}$${Math.round(a).toLocaleString('en-US')}`;
  }
  const prioOf = (score) => (score >= 70 ? 'Alta' : score >= 40 ? 'Media' : 'Baja');
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  /** Mini-visual de barras: rows [{label, value}] con `text` ya formateado; el ancho lo calcula el panel contra el mayor valor absoluto. */
  const barsOf = (rows, rest) => {
    const out = rows.map((r) => ({ label: r.label, value: r.value, text: money(r.value) }));
    if (rest && rest.n > 0) out.push({ label: `Otros (${rest.n})`, value: rest.value, text: money(rest.value) });
    return { type: 'bars', rows: out };
  };

  // Cómo se llama el periodo en los textos (mes, semana o año). El mes es el caso base: sus textos no cambian.
  const WORDS = {
    month: { noun: 'mes', del: 'del mes', este: 'este mes', prev: 'el mes anterior', art: 'El mes', done: 'Mes cerrado' },
    week: { noun: 'semana', del: 'de la semana', este: 'esta semana', prev: 'la semana anterior', art: 'La semana', done: 'Semana cerrada' },
    year: { noun: 'año', del: 'del año', este: 'este año', prev: 'el año anterior', art: 'El año', done: 'Año cerrado' }
  };
  const wordsOf = (type) => WORDS[type] || WORDS.month;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIA = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${+m[3]} ${MESES[+m[2] - 1].slice(0, 3)}` : String(d || ''); };
  function periodLabel(type, key, week) {
    if (type === 'year') return String(key);
    if (type === 'week') return week && week.weekStart ? `semana del ${DIA(week.weekStart)} al ${DIA(week.weekEnd)}` : `semana ${key}`;
    const m = /^(\d{4})-(\d{2})/.exec(String(key || '')); return m ? `${MESES[+m[2] - 1]} ${m[1]}` : String(key || '');
  }
  const channelLabel = (id) => { if (!id || id === 'total') return 'Total digital'; const c = ((FP.config && FP.config.channels) || []).find((x) => x.id === id); return c ? c.label : id; };

  /**
   * Lo que la persona tiene elegido: canal y año/mes/semana del contexto persistente de la app (`state.ux.ctx`).
   * Si no hay una selección usable (sin periodo, día suelto, semana que no existe…) se usa el mes de la última fecha con venta real.
   * Un día o un rango se leen como el mes de esa fecha (igual que Diagnóstico) y se avisa en `note`.
   */
  function selectionOf(state) {
    const run = state && state.fc && state.fc.run, ctx = (state && state.ux && state.ux.ctx) || {};
    const chIds = run && run.channels ? Object.keys(run.channels) : [];
    const channel = ctx.channel && chIds.includes(ctx.channel) ? ctx.channel : 'total';
    let type = ctx.periodType, key = ctx.periodKey, note = null;
    if ((type === 'day' || type === 'range') && /^\d{4}-\d{2}/.test(String(key || ''))) { type = 'month'; key = String(key).slice(0, 7); note = 'El agente trabaja por año, mes o semana: usa el mes de la fecha elegida.'; }
    const weeks = (run && run.total && run.total.weeks) || [], months = (run && run.total && run.total.months) || [];
    let ok = false;
    if (type === 'year') { key = String((state && state.year) || String(key || '').slice(0, 4)); ok = Boolean(key); }
    else if (type === 'month') ok = /^\d{4}-\d{2}$/.test(String(key || '')) && months.some((m) => m.key === key);
    else if (type === 'week') ok = weeks.some((w) => w.key === key);
    if (!ok) { const last = (state && state.fc && state.fc.lastActualDate) || null; type = 'month'; key = last ? String(last).slice(0, 7) : null; note = null; }
    return { channel, type, key, chosen: ok, note };
  }

  /** Periodo de trabajo, serie total (o del canal elegido) y series por canal. null si falta plan o venta real en ese periodo. */
  function scopeOf(state, sel) {
    const run = state && state.fc && state.fc.run;
    if (!run || !run.plan || run.plan.source === 'none' || !run.total || !run.channels) return null;
    const last = (state.fc && state.fc.lastActualDate) || null;
    if (!last) return null;
    sel = sel || selectionOf(state);
    if (!sel.key) return null;
    const { type, key } = sel;
    const pick = (s) => { if (!s) return null; if (type === 'year') return s.annual || null; return (Array.isArray(type === 'week' ? s.weeks : s.months) ? (type === 'week' ? s.weeks : s.months).find((m) => m.key === key) : null) || null; };
    const single = sel.channel !== 'total' && run.channels[sel.channel];
    const tot = pick(single ? run.channels[sel.channel] : run.total);
    if (!tot || !tot.countedDays) return null;
    const labels = {};
    ((FP.config && FP.config.channels) || []).forEach((c) => { labels[c.id] = c.label; });
    // Con un canal elegido no hay «qué canal»: se mira ese canal solo.
    const channels = single ? [] : Object.keys(run.channels).map((id) => ({ id, label: labels[id] || id, m: pick(run.channels[id]) })).filter((c) => c.m);
    const label = periodLabel(type, key, type === 'week' ? tot : null);
    return { run, key, period: { type, key }, tot, channels, last, channel: single ? sel.channel : 'total', channelLabel: channelLabel(single ? sel.channel : 'total'), label, W: wordsOf(type), note: sel.note || null, chosen: sel.chosen };
  }
  const rev = (m) => (m && m.toDate && m.toDate.revenue) || null;

  /** D1 · La brecha contra el plan se concentra en un canal. */
  function brechaConcentrada(sc, deps) {
    const t = rev(sc.tot);
    if (!t || !fin(t.gap) || !fin(t.plan) || !(t.plan > 0) || !fin(t.gapPct) || t.gapPct > -0.01) return null;
    const rows = sc.channels.map((c) => ({ ...c, r: rev(c.m) })).filter((c) => c.r && fin(c.r.gap) && fin(c.r.plan) && c.r.plan > 0);
    const negs = rows.filter((c) => c.r.gap < 0).sort((a, b) => a.r.gap - b.r.gap);
    if (!negs.length) return null;
    const sumNeg = negs.reduce((s, c) => s + c.r.gap, 0), top = negs[0], share = top.r.gap / sumNeg;
    if (share < 0.6) return null;
    const planMonth = (m) => (m && m.plan && fin(m.plan.revenue) ? m.plan.revenue : null);
    const weight = planMonth(top.m) && planMonth(sc.tot) ? planMonth(top.m) / planMonth(sc.tot) : null;
    const ptsTop = Math.abs(top.r.gap) / t.plan, ptsTot = Math.abs(t.gapPct);
    const best = rows.filter((c) => c.id !== top.id).sort((a, b) => b.r.compliance - a.r.compliance)[0];
    const evid = [
      { k: 'Cumplimiento total a la fecha de corte', v: pct(t.compliance) },
      { k: `${top.label}: plan / real`, v: `${money(top.r.plan)} / ${money(top.r.actual)}` },
      { k: `${top.label} vs su plan`, v: spct(top.r.gapPct) },
      { k: 'Brecha total / brecha de ese canal', v: `${money(t.gap)} / ${money(top.r.gap)}` }
    ];
    if (weight !== null) evid.push({ k: `Peso de ${top.label} en el plan ${sc.W.del}`, v: pct(weight) });
    if (best && best.r.gap > 0) evid.push({ k: `${best.label} vs su plan`, v: spct(best.r.gapPct) });
    // Qué driver pesa más dentro de ese canal (descriptivo: es aritmética del motor de drivers, no causa)
    let drv = null;
    try { const w = deps.home.whyPlan(deps.state, top.id, sc.period); if (w && w.status === 'ok' && w.effects) { const e = w.effects, rk = Object.entries({ traffic: e.traffic, cr: e.cr, aov: e.aov }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]; drv = { id: rk[0], value: rk[1] }; } } catch (e) { drv = null; }
    if (drv) evid.push({ k: `${top.label}: driver que más pesa en la brecha`, v: `${DRIVER_LABEL[drv.id]} (${money(drv.value)})` });
    const score = clamp(35 + Math.abs(t.gapPct) * 100 * 8 + (share - 0.6) * 50);
    return {
      id: 'brecha_concentrada', detector: 'Brecha por canal · concentración', score, prio: prioOf(score), owner: CHANNEL_OWNER[top.id] || 'Ecommerce',
      title: `${top.label} concentra la mayor parte de la brecha contra el plan`,
      resumen: `La venta va en ${pct(t.compliance)} del plan a la fecha de corte. ${top.label} va ${pct(Math.abs(top.r.gapPct))} abajo de su plan y suma ${money(top.r.gap)} de la brecha de ${money(t.gap)}.`,
      que: `${top.label} explica ${(ptsTop * 100).toFixed(1)} puntos de los ${(ptsTot * 100).toFixed(1)} que faltan para el plan${weight !== null ? `, aunque pesa ${pct(weight)} del plan ${sc.W.del}` : ''}.`,
      section: 'cae', tag: `Concentrada · ${Math.round(share * 100)}% de la caída`,
      big: { value: money(top.r.gap), tone: 'dn', sub: `de ${money(sumNeg)} que caen los canales bajo su plan · ${top.label} va ${pct(Math.abs(top.r.gapPct))} abajo de su plan` },
      visual: barsOf(negs.slice(0, 3).map((c) => ({ label: c.label, value: c.r.gap })), { n: Math.max(0, negs.length - 3), value: negs.slice(3).reduce((s, c) => s + c.r.gap, 0) }),
      hipotesis: `Algo propio de ${top.label} y no del negocio completo, porque ${rows.some((c) => c.r.gap >= 0) ? 'otros canales sí están en su plan' : 'la brecha se concentra ahí'}. Es una hipótesis a validar, no una causa.`,
      validar: `Compara ${top.label} contra ${sc.W.prev} en tráfico, conversión y ticket (vista «¿Por qué?»).`,
      accion: drv ? `${DRIVER_ACTION[drv.id]}` : `Revisar qué cambió en ${top.label} ${sc.W.este} (tráfico, conversión y ticket).`,
      evid,
      pregunta: drv ? `¿Por qué ${DRIVER_LABEL[drv.id]} pesa más en ${top.label}? Revisa esa vista por periodo y segmento.` : `¿La caída de ${top.label} viene de menos tráfico, menos conversión o menor ticket?`,
      limites: 'Describo dónde está la brecha y cuánto pesa; no sé el motivo. No veo margen ni promociones.',
      fuente: 'Pacing & Forecast', view: 'pacing', viewLabel: 'Pacing & Forecast',
      facts: { compliance: t.compliance, gap: t.gap, topGap: top.r.gap, topGapPct: top.r.gapPct, topPlan: top.r.plan, topActual: top.r.actual, weight, ptsTop: ptsTop * 100, ptsTot: ptsTot * 100 }
    };
  }

  /**
   * D1b · Canales por debajo de su propio plan, aunque el total vaya bien.
   * D1 solo mira cuando el total está bajo el plan; si otro canal compensa (p. ej. Llamadas), Ecommerce o WhatsApp podían caer sin que «Se cae» dijera nada.
   * Mismo umbral que «Canal por encima de su plan» (≥1 % bajo su plan y ≥0.5 % del plan total a la fecha). Si D1 ya reporta la concentración, no se repite.
   */
  function canalesBajoPlan(sc, deps) {
    const t = rev(sc.tot);
    if (!t || !fin(t.plan) || !(t.plan > 0)) return null;
    if (brechaConcentrada(sc, deps)) return null;
    const rows = sc.channels.map((c) => ({ ...c, r: rev(c.m) })).filter((c) => c.r && fin(c.r.gap) && fin(c.r.plan) && c.r.plan > 0 && fin(c.r.gapPct));
    const neg = rows.filter((c) => c.r.gap < 0 && c.r.gapPct <= -0.01 && -c.r.gap >= 0.005 * t.plan).sort((a, b) => a.r.gap - b.r.gap);
    if (!neg.length) return null;
    const sumNeg = neg.reduce((s, c) => s + c.r.gap, 0), top = neg[0];
    const names = neg.length > 1 ? `${neg.slice(0, -1).map((c) => c.label).join(', ')} y ${neg[neg.length - 1].label}` : top.label;
    const totalUp = fin(t.gap) && t.gap >= 0;
    const pos = rows.filter((c) => c.r.gap > 0).sort((a, b) => b.r.gap - a.r.gap)[0] || null;
    const evid = [];
    neg.forEach((c) => {
      evid.push({ k: `${c.label}: plan / real`, v: `${money(c.r.plan)} / ${money(c.r.actual)}` });
      evid.push({ k: `${c.label} vs su plan`, v: `${spct(c.r.gapPct)} (${money(c.r.gap)})` });
      let w = null; try { w = deps.home.why(deps.state, c.id, sc.period); } catch (e) { w = null; }
      if (w && w.status === 'ok' && fin(w.delta) && fin(w.baseline) && w.baseline > 0) evid.push({ k: `${c.label} vs ${sc.W.prev}`, v: `${spct(w.delta / w.baseline)} (${money(w.delta)})` });
    });
    evid.push({ k: 'Total contra el plan a la fecha de corte', v: `${spct(t.gapPct)} (${money(t.gap)})` });
    if (pos && totalUp) evid.push({ k: `${pos.label} vs su plan`, v: spct(pos.r.gapPct) });
    const raw = 25 + (-sumNeg / t.plan) * 100 * 6;
    const score = clamp(totalUp ? Math.min(raw, 69) : raw);
    const verb = neg.length > 1 ? 'van' : 'va';
    return {
      id: 'canales_bajo_plan', detector: 'Canales bajo su plan', score, prio: prioOf(score), owner: CHANNEL_OWNER[top.id] || 'Ecommerce',
      title: `${names} ${verb} bajo su plan`,
      story: `${names} ${verb} bajo su plan (${money(sumNeg)})${totalUp && pos ? `, aunque el total va arriba porque ${pos.label} compensa` : ''}`,
      resumen: `${neg.map((c) => `${c.label} va ${pct(Math.abs(c.r.gapPct))} abajo de su plan (${money(c.r.gap)})`).join('; ')}.${totalUp ? ` El total va ${spct(t.gapPct)} contra el plan, así que esa caída queda tapada por otros canales.` : ''}`,
      que: `${neg.length > 1 ? 'Esos canales restan' : `${top.label} resta`} ${money(sumNeg)} contra su plan a la fecha de corte${totalUp ? '; el total no lo muestra porque otro canal suma más' : ''}.`,
      section: 'cae', tag: totalUp ? 'Tapado por el total' : 'Repartida entre canales',
      big: { value: money(sumNeg), tone: 'dn', sub: `lo que ${neg.length > 1 ? 'restan' : 'resta'} ${names} contra su plan${totalUp ? ` · el total va ${spct(t.gapPct)}` : ''}` },
      visual: barsOf(neg.slice(0, 3).map((c) => ({ label: c.label, value: c.r.gap })), { n: Math.max(0, neg.length - 3), value: neg.slice(3).reduce((s, c) => s + c.r.gap, 0) }),
      hipotesis: `Algo propio de ${neg.length > 1 ? 'esos canales' : top.label} y no del negocio completo. Es una hipótesis a validar, no una causa.`,
      validar: `Compara ${neg.length > 1 ? 'cada canal' : top.label} contra ${sc.W.prev} en tráfico, conversión y ticket (vista «¿Por qué?»).`,
      accion: `Revisar qué cambió en ${names} ${sc.W.este} (tráfico, conversión y ticket) aunque el total vaya en plan.`,
      evid,
      pregunta: `¿La caída de ${top.label} viene de menos tráfico, menos conversión o menor ticket?`,
      limites: 'Describo qué canales van bajo su plan y cuánto restan; no sé el motivo. No veo margen ni promociones.',
      fuente: 'Pacing & Forecast', view: 'pacing', viewLabel: 'Pacing & Forecast',
      facts: { sumNeg, totalGapPct: t.gapPct, channels: neg.length, topGap: top.r.gap, topGapPct: top.r.gapPct }
    };
  }

  /** D2 · Con el forecast actual el periodo no llega a la meta (solo mes y año: no hay meta semanal). */
  function metaEnRiesgo(sc, deps) {
    if (sc.period.type === 'week') return null;
    let g = null; try { g = deps.home.goal(deps.state, sc.channel, sc.period); } catch (e) { g = null; }
    if (!g || !(g.status === 'missed' || g.status === 'not_reached') || !fin(g.attainment) || g.attainment >= 0.99) return null;
    const rows = sc.channels.map((c) => ({ label: c.label, fg: c.m.forecastGap && c.m.forecastGap.revenue })).filter((c) => c.fg && fin(c.fg.gapPct));
    const worst = rows.sort((a, b) => a.fg.gapPct - b.fg.gapPct)[0];
    const gapAbs = fin(g.goal) && fin(g.cumulative) ? g.cumulative - g.goal : null;
    const evid = [{ k: `Meta ${sc.W.del}`, v: money(g.goal) }, { k: g.status === 'missed' ? 'Cierre real' : 'Cierre proyectado', v: money(g.cumulative) }, { k: 'Avance contra la meta', v: pct(g.attainment) }];
    if (gapAbs !== null) evid.push({ k: 'Diferencia contra la meta', v: money(gapAbs) });
    if (worst && worst.fg.gapPct < 0) evid.push({ k: `Canal más lejos de su meta: ${worst.label}`, v: spct(worst.fg.gapPct) });
    const score = clamp(30 + (1 - g.attainment) * 100 * 9);
    return {
      id: 'meta_en_riesgo', detector: 'Meta del periodo · forecast', score, prio: prioOf(score), owner: 'Ecommerce',
      title: g.status === 'missed' ? `${sc.W.art} cerró en ${pct(g.attainment)} de la meta` : `Al ritmo actual ${sc.W.art.toLowerCase()} cierra en ${pct(g.attainment)} de la meta`,
      resumen: `${g.status === 'missed' ? `La meta ${sc.W.del} no se cumplió` : `Con el forecast del método en uso no llegas a la meta ${sc.W.del}`}: ${pct(g.attainment)} de ${money(g.goal)}.`,
      que: gapAbs !== null ? `Faltan ${money(Math.abs(gapAbs))} para la meta ${sc.W.del}.` : `No alcanza la meta ${sc.W.del}.`,
      section: 'cae', tag: g.status === 'missed' ? sc.W.done : `Meta ${sc.W.del}`,
      big: { value: pct(g.attainment), tone: 'dn', sub: `${g.status === 'missed' ? 'de la meta' : 'de la meta al ritmo actual'} de ${money(g.goal)}${gapAbs !== null ? ` · faltan ${money(Math.abs(gapAbs))}` : ''}` },
      hipotesis: 'El ritmo de los días recientes no alcanza para cubrir lo que falta; no sé si los días que quedan traen algo distinto (evento, campaña).',
      validar: 'Revisa en Pacing qué canal va más lejos de su meta y cuántos días quedan.',
      accion: 'Definir con cada canal qué se puede recuperar en los días que quedan y qué se acepta como brecha.',
      evid, pregunta: '¿Qué canal tiene más espacio para recuperar lo que falta en los días que quedan?',
      limites: 'El forecast supone que lo que viene se parece a los días recientes; no incluye eventos que no estén en el calendario.',
      fuente: 'Pacing & Forecast', view: 'pacing', viewLabel: 'Pacing & Forecast',
      facts: { attainment: g.attainment, goal: g.goal, cumulative: g.cumulative, gap: gapAbs }
    };
  }

  /** D3 · Qué driver pesa más en la brecha contra el plan y si otro lo compensa. */
  function driverDominante(sc, deps) {
    let w = null; try { w = deps.home.whyPlan(deps.state, sc.channel, sc.period); } catch (e) { w = null; }
    if (!w || w.status !== 'ok' || !w.effects || !fin(w.gap) || !fin(w.gapPct) || Math.abs(w.gapPct) < 0.005) return null;
    const e = w.effects, list = [['traffic', e.traffic], ['cr', e.cr], ['aov', e.aov]].filter((x) => fin(x[1])).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (list.length < 3) return null;
    const [dom, other, third] = list, offset = list.filter((x) => Math.sign(x[1]) !== Math.sign(w.gap) && x[1] !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] || null;
    const score = clamp(25 + Math.abs(w.gapPct) * 100 * 10);
    const evid = [
      { k: `Efecto de ${DRIVER_LABEL[dom[0]]}`, v: money(dom[1]) }, { k: `Efecto de ${DRIVER_LABEL[other[0]]}`, v: money(other[1]) }, { k: `Efecto de ${DRIVER_LABEL[third[0]]}`, v: money(third[1]) },
      { k: 'Brecha total contra el plan', v: `${money(w.gap)} (${spct(w.gapPct)})` }
    ];
    return {
      id: 'driver_dominante', detector: 'Brecha contra el plan · drivers', score, prio: prioOf(score), owner: dom[0] === 'traffic' ? 'Marketing' : dom[0] === 'cr' ? 'Producto / UX' : 'Comercial',
      title: `Contra el plan, ${DRIVER_LABEL[dom[0]]} es el driver que más pesa`,
      resumen: `La brecha contra el plan es ${money(w.gap)} (${spct(w.gapPct)}). El efecto de ${DRIVER_LABEL[dom[0]]} es ${money(dom[1])}${offset ? `, y ${DRIVER_LABEL[offset[0]]} lo compensa en ${money(offset[1])}` : ''}.`,
      que: `El reparto es aritmético (tráfico, conversión, ticket) y suma la brecha total; no prueba por qué pasó.`,
      section: 'revisar', tag: 'Qué pesa más',
      big: { value: money(dom[1]), tone: dom[1] < 0 ? 'dn' : 'up', sub: `efecto de ${DRIVER_LABEL[dom[0]]} de ${money(w.gap)} de brecha contra el plan (${spct(w.gapPct)})` },
      visual: { type: 'bars', rows: list.map((x) => ({ label: DRIVER_LABEL[x[0]][0].toUpperCase() + DRIVER_LABEL[x[0]].slice(1), value: x[1], text: money(x[1]) })) },
      hipotesis: `El movimiento matemático de la brecha viene sobre todo de ${DRIVER_LABEL[dom[0]]}. No prueba por qué pasó: dice por dónde empezar a mirar.`,
      validar: 'Abre «¿Por qué?» y mira si ese efecto lo carga un canal o está repartido.',
      accion: DRIVER_ACTION[dom[0]],
      evid, pregunta: `¿El efecto de ${DRIVER_LABEL[dom[0]]} es parejo entre canales o lo carga uno solo?`,
      limites: 'Los efectos de driver describen el movimiento matemático de la brecha; no son causas.',
      fuente: 'Diagnóstico · Nivel 1', view: 'diagnostico', viewLabel: '¿Por qué? Diagnóstico',
      facts: { gap: w.gap, gapPct: w.gapPct, traffic: e.traffic, cr: e.cr, aov: e.aov }
    };
  }

  /** D4 · Contra el plan y contra el periodo anterior el driver principal no es el mismo. */
  function contradiccionCapas(sc, deps) {
    let p = null, a = null;
    try { p = deps.home.whyPlan(deps.state, sc.channel, sc.period); a = deps.home.why(deps.state, sc.channel, sc.period); } catch (e) { return null; }
    if (!p || p.status !== 'ok' || !p.effects || !a || a.status !== 'ok' || !a.effects || a.why === 'no_traffic') return null;
    const dom = (e) => Object.entries({ traffic: e.traffic, cr: e.cr, aov: e.aov }).filter((x) => fin(x[1])).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
    const dp = dom(p.effects), da = dom(a.effects);
    if (!dp || !da || dp[0] === da[0]) return null;
    const score = clamp(30 + Math.min(Math.abs(p.gapPct || 0), 0.05) * 100 * 6);
    return {
      id: 'contradiccion_capas', detector: 'Contradicciones entre capas (plan vs periodo anterior)', score, prio: prioOf(score), owner: 'Ecommerce',
      title: 'Contra el plan y contra el periodo anterior pesa un driver distinto',
      resumen: `Contra el plan el driver que más pesa es ${DRIVER_LABEL[dp[0]]} (${money(dp[1])}); contra el mismo periodo anterior es ${DRIVER_LABEL[da[0]]} (${money(da[1])}).`,
      que: 'Cada comparación responde una pregunta distinta: el plan mide lo que esperabas; el periodo anterior, cuánto cambió el negocio. Conviene leer las dos juntas antes de actuar.',
      evid: [{ k: `Contra el plan: ${DRIVER_LABEL[dp[0]]}`, v: money(dp[1]) }, { k: `Contra el periodo anterior: ${DRIVER_LABEL[da[0]]}`, v: money(da[1]) }, { k: 'Brecha contra el plan', v: money(p.gap) }, { k: 'Cambio contra el periodo anterior', v: money(a.delta) }],
      pregunta: `¿El plan ya suponía un cambio en ${DRIVER_LABEL[da[0]]} que no se dio?`,
      limites: 'Son dos comparaciones válidas; no hay un error, pero tampoco una sola historia.',
      section: 'revisar', tag: 'Dos lecturas',
      big: { value: `${DRIVER_LABEL[dp[0]]} vs ${DRIVER_LABEL[da[0]]}`, tone: '', sub: 'driver que más pesa contra el plan vs contra el periodo anterior' },
      hipotesis: 'El plan suponía un cambio que no se dio, o el negocio cambió en otra dirección que el plan no anticipaba. Se valida viendo qué suponía el plan.',
      validar: 'Compara en «¿Por qué?» el plan contra el periodo anterior, y revisa si el plan ya traía ese cambio.',
      accion: 'Leer las dos comparaciones juntas antes de repartir tareas por driver.',
      handoff: { to: 'auditor', reason: 'Si el driver es conversión, el Auditor de Conversión puede ver en qué paso del embudo se pierde.' },
      fuente: 'Diagnóstico · Nivel 1 y comparación con el periodo anterior', view: 'diagnostico', viewLabel: '¿Por qué? Diagnóstico',
      facts: { planDriver: dp[1], prevDriver: da[1], gap: p.gap, delta: a.delta }
    };
  }

  /** D5 · Los métodos de forecast se separan al cierre del año. */
  function forecastDivergente(sc, deps) {
    let adv = null; try { adv = deps.advisor.advise({ run: sc.run, channel: sc.channel, metric: 'revenue' }); } catch (e) { adv = null; }
    if (!adv || !adv.range || !fin(adv.range.spreadPct) || adv.range.spreadPct < 0.02) return null;
    const r = adv.range, score = clamp(25 + r.spreadPct * 100 * 6);
    const evid = [{ k: `Cierre del año con el método ${r.minMethod}`, v: money(r.min) }, { k: `Cierre del año con el método ${r.maxMethod}`, v: money(r.max) }, { k: 'Diferencia entre métodos', v: `${money(r.max - r.min)} (${pct(r.spreadPct)} de la meta)` }];
    if (adv.suggestion) evid.push({ k: 'Método en uso / sugerido por las reglas', v: `${adv.suggestion.current || '—'} / ${adv.suggestion.method}` });
    return {
      id: 'forecast_divergente', detector: 'Confianza del forecast · comparación de métodos', score, prio: prioOf(score), owner: 'Ecommerce',
      title: `Entre métodos de forecast hay ${(r.spreadPct * 100).toFixed(1)} puntos de diferencia al cierre del año`,
      resumen: `El método ${r.minMethod} cierra el año en ${money(r.min)} y el ${r.maxMethod} en ${money(r.max)}: ${money(r.max - r.min)} de diferencia.`,
      que: 'Cuando los métodos se separan, el cierre depende de cuánto pesen los días recientes frente al acumulado del año.',
      section: 'revisar', tag: 'Antes de fiarte del cierre',
      big: { value: money(r.max - r.min), tone: '', sub: `de diferencia entre métodos al cierre del año (${pct(r.spreadPct)} de la meta)` },
      hipotesis: 'Los métodos pesan distinto los días recientes frente al acumulado del año, por eso se separan.',
      validar: 'En Forecast mira cuál método ha acertado más en la prueba histórica.',
      accion: 'Confirmar el método en uso antes de comunicar un cierre del año.',
      evid, pregunta: '¿Cuál método ha acertado más en la prueba histórica? La vista de Forecast la muestra.',
      limites: 'Los métodos suponen que lo que viene se parece a lo observado; la sugerencia sigue reglas visibles y no cambia el método en uso.',
      fuente: 'Forecast · métodos A/B/C/D', view: 'pacing', viewLabel: 'Pacing & Forecast',
      facts: { min: r.min, max: r.max, spreadPct: r.spreadPct, diff: r.max - r.min }
    };
  }

  /** D6 · Datos que pueden distorsionar el cumplimiento (días fuera del total, canales sin plan o sin real, advertencias). */
  function datosDistorsionan(sc, deps) {
    const issues = [], evid = []; let score = 20;
    const miss = sc.channels.filter((c) => !c.m.plan || !fin(c.m.plan.revenue));
    if (miss.length) { issues.push(`${miss.map((c) => c.label).join(', ')} sin plan ${sc.W.del}`); evid.push({ k: `Canales sin plan ${sc.W.del}`, v: miss.map((c) => c.label).join(', ') }); score += 25; }
    const noAct = sc.channels.filter((c) => c.m.plan && !c.m.countedDays);
    if (noAct.length) { issues.push(`${noAct.map((c) => c.label).join(', ')} sin venta real`); evid.push({ k: 'Canales con plan y sin venta real', v: noAct.map((c) => c.label).join(', ') }); score += 20; }
    let ex = null; try { ex = deps.home.excluded(deps.state, sc.channel, sc.period); } catch (e) { ex = null; }
    if (ex && ex.days > 0) { issues.push(`${ex.days} día(s) cerrados no entran al total porque falta algún canal`); evid.push({ k: 'Días cerrados que no entran al total', v: String(ex.days) }); evid.push({ k: 'Venta de los otros canales que queda fuera', v: money(ex.revenue) }); score += Math.min(25, ex.days * 4); }
    const q = deps.state.quality, flagged = q && q.totals ? (q.totals.warning || 0) + (q.totals.error || 0) + (q.totals.rejected || 0) : 0;
    if (flagged > 0) { issues.push(`${flagged} aviso(s) de calidad de datos`); evid.push({ k: 'Avisos de calidad de datos', v: String(flagged) }); score += Math.min(15, flagged * 3); }
    if (!issues.length) return null;
    score = clamp(score, 0, 60);
    return {
      id: 'datos_distorsionan', detector: 'Calidad de datos · cobertura de plan y real', score, prio: prioOf(score), owner: 'Ecommerce',
      title: 'Hay datos que pueden distorsionar el cumplimiento',
      resumen: `${issues.join('; ')}. Esas cifras pueden inflar o recortar el cumplimiento que ves.`,
      que: 'El pacing solo cuenta los días con plan y con venta real. Si faltan, el cumplimiento se calcula sobre menos días.',
      section: 'revisar', tag: 'Calidad del dato',
      big: { value: `${issues.length} ${issues.length === 1 ? 'aviso' : 'avisos'}`, tone: '', sub: 'que pueden mover el cumplimiento que ves' },
      hipotesis: 'El cumplimiento se calcula sobre menos días o menos canales de los que parece.',
      validar: 'Abre Calidad de datos y completa la carga que falta; luego vuelve a leer el cumplimiento.',
      accion: 'Completar la carga de plan o venta que falta.',
      evid, pregunta: '¿Se puede completar la carga que falta antes de leer el cumplimiento?',
      limites: 'No sé cuánto cambiaría el cumplimiento con la carga completa.',
      fuente: 'Calidad de datos', view: 'calidad', viewLabel: 'Calidad de datos',
      facts: { flagged, excludedDays: ex ? ex.days : 0, excludedRevenue: ex ? ex.revenue : 0 }
    };
  }

  /** D7 · Un canal va por encima de su plan: qué compensa de lo que cae en otros (la parte «qué crece» de la historia). */
  function canalCompensa(sc, deps) {
    const t = rev(sc.tot);
    if (!t || !fin(t.plan) || !(t.plan > 0)) return null;
    const rows = sc.channels.map((c) => ({ ...c, r: rev(c.m) })).filter((c) => c.r && fin(c.r.gap) && fin(c.r.plan) && c.r.plan > 0 && fin(c.r.gapPct));
    const pos = rows.filter((c) => c.r.gap > 0 && c.r.gapPct >= 0.01 && c.r.gap >= 0.005 * t.plan).sort((a, b) => b.r.gap - a.r.gap);
    if (!pos.length) return null;
    const top = pos[0], sumNeg = rows.filter((c) => c.r.gap < 0).reduce((s, c) => s + c.r.gap, 0), covers = sumNeg < 0 ? Math.min(1, top.r.gap / -sumNeg) : null;
    let drv = null;
    try { const w = deps.home.whyPlan(deps.state, top.id, sc.period); if (w && w.status === 'ok' && w.effects) { const e = w.effects, rk = Object.entries({ traffic: e.traffic, cr: e.cr, aov: e.aov }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]; drv = { id: rk[0], value: rk[1] }; } } catch (e) { drv = null; }
    const score = clamp(15 + (top.r.gap / t.plan) * 100 * 6 + (covers ? covers * 15 : 0), 0, 69);
    const evid = [{ k: `${top.label}: plan / real`, v: `${money(top.r.plan)} / ${money(top.r.actual)}` }, { k: `${top.label} vs su plan`, v: spct(top.r.gapPct) }, { k: `Lo que suma ${top.label} contra su plan`, v: money(top.r.gap) }];
    if (sumNeg < 0) evid.push({ k: 'Lo que restan los canales bajo su plan', v: money(sumNeg) });
    if (covers !== null) evid.push({ k: `Parte de esa caída que cubre ${top.label}`, v: pct(covers, 0) });
    if (drv) evid.push({ k: `${top.label}: driver que más pesa a favor`, v: `${DRIVER_LABEL[drv.id]} (${money(drv.value)})` });
    return {
      id: 'canal_compensa', detector: 'Canal por encima de su plan', score, prio: prioOf(score), owner: CHANNEL_OWNER[top.id] || 'Ecommerce',
      title: covers !== null && covers >= 0.5 ? `${top.label} suma ${money(top.r.gap)} y cubre ${pct(covers, 0)} de lo que cae en otros canales` : `${top.label} va ${pct(top.r.gapPct)} arriba de su plan`,
      resumen: `${top.label} lleva ${money(top.r.actual)} contra un plan de ${money(top.r.plan)} a la fecha de corte (${spct(top.r.gapPct)}).${covers !== null ? ` Eso cubre ${pct(covers, 0)} de lo que restan los canales bajo su plan.` : ''}`,
      que: `${top.label} está por encima de su plan; ${covers !== null ? 'compensa parte de la brecha del total, no toda' : 'el total no tiene canales por debajo de su plan'}.`,
      section: 'crece', tag: covers !== null ? 'Compensa' : 'Crece',
      big: { value: `+${money(top.r.gap).replace(/^−/, '')}`, tone: 'up', sub: `${top.label} contra su plan · ${spct(top.r.gapPct)}` },
      visual: { type: 'bars', rows: pos.slice(0, 3).map((c) => ({ label: c.label, value: c.r.gap, text: `+${money(c.r.gap)}` })) },
      hipotesis: drv ? `La ventaja viene sobre todo de ${DRIVER_LABEL[drv.id]}; si depende de pocos clientes o de un empujón puntual, puede no sostenerse.` : 'No sé de qué viene la ventaja; conviene saber si es sostenible.',
      validar: `Mira en «¿Por qué?» cuánto de ${top.label} es volumen y cuánto es ticket, y si lo sostienen clientes nuevos o recurrentes.`,
      accion: `Identificar qué está funcionando en ${top.label} y si se puede sostener.`,
      evid,
      pregunta: `¿El crecimiento de ${top.label} es sostenible o depende de algo puntual?`,
      limites: 'Describo cuánto suma y cuánto compensa; no sé si se sostiene ni de qué viene.',
      fuente: 'Pacing & Forecast', view: 'pacing', viewLabel: 'Pacing & Forecast',
      facts: { gap: top.r.gap, gapPct: top.r.gapPct, covers, sumNeg, plan: top.r.plan, actual: top.r.actual }
    };
  }

  const DETECTORS = [brechaConcentrada, canalesBajoPlan, metaEnRiesgo, driverDominante, contradiccionCapas, forecastDivergente, datosDistorsionan, canalCompensa];

  /**
   * Corre todos los detectores. Nunca lanza: un detector que falla se omite y se reporta en `errors`.
   * `deps` (opcional) permite inyectar los motores en pruebas: { home, advisor }.
   */
  function detect(state, deps = {}) {
    const d = { state, home: deps.home || FP.homeSummaryEngine, advisor: deps.advisor || FP.methodAdvisor };
    const sel = selectionOf(state), sc = scopeOf(state, sel);
    if (!sc) return { status: 'no_data', scope: null, selection: sel, findings: [], errors: [], detectors: DETECTORS.length };
    const findings = [], errors = [];
    DETECTORS.forEach((fn) => { try { const f = fn(sc, d); if (f) findings.push({ agent: 'analista', ...f }); } catch (e) { errors.push(`${fn.name}: ${e && e.message || e}`); } });
    findings.sort((a, b) => b.score - a.score);
    const t = rev(sc.tot);
    const kpi = t ? { actual: t.actual, plan: t.plan, gap: t.gap, gapPct: t.gapPct, compliance: t.compliance } : null;
    return { status: 'ok', scope: { channel: sc.channel, channelLabel: sc.channelLabel, period: sc.period, label: sc.label, lastActual: sc.last, kpi, note: sc.note }, findings, errors, detectors: DETECTORS.length };
  }

  FP.agents.analista = { detect, selection: selectionOf, wordsOf, periodLabel, channelLabel, OWNERS, DETECTOR_COUNT: DETECTORS.length, fmt: { pct, spct, money, clamp, prioOf, fin, barsOf }, CHANNEL_OWNER, DRIVER_LABEL, DRIVER_ACTION };
})(typeof window !== 'undefined' ? window : globalThis);
