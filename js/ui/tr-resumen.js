/**
 * tr-resumen.js — Reglas invisibles de «Tráfico y conversión»: qué frase del veredicto, qué chips de confiabilidad, qué filas del resumen
 * general, qué línea de lectura de cada sección y qué acciones de «¿Qué hago con esto?» se muestran. Descriptivo: lee lo que ya calcularon
 * FP.trafficConversionEngine.analyzeAll (todas las dimensiones a la vez) y FP.segmentInsights; no calcula cifras nuevas ni dice causas.
 * Un visitante cuenta en cada dimensión: los efectos de dimensiones distintas no se suman. Umbrales en FP.config.diagnostics.trafficSummary (PROVISIONALES).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.diagnostics.trafficSummary;
  const B = (t) => `<b>${t}</b>`;
  const EN = { traffic: 'tráfico', cr: 'conversión', aov: 'ticket' };
  const esc = (v) => FP.ui.helpers.esc(v);

  function fmt() {
    const F = FP.format, M = (v) => F.currency(Math.abs(v), 0), SM = (v) => (Math.abs(v) < 0.5 ? F.currency(0, 0) : (v > 0 ? '+' : '−') + M(v));
    const p2 = (v) => `${(v * 100).toFixed(2)} %`, p1 = (v) => `${(v * 100).toFixed(1)} %`;
    const pp = (v) => `${Math.abs(v) < 0.005 ? '' : v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} pp`;
    return { M, SM, p2, p1, pp, n0: (v) => F.integer(v) };
  }

  /** Etiqueta de un segmento con su dimensión (así se lee de qué corte viene). */
  const tag = (x) => `<span class="tg">${esc(x.dimLabel)}</span> `;

  /**
   * @param {object} c { all, dimsInfo:[{dim,label,res,ins}], ref:{dim,label,ins}, trends:[{dimLabel,series}], split, scopeDim, channel, hasPartial, period, baseline }
   * @returns {{ ok, hasBase, verdict, chips, rows, lec, actions, opp }}
   */
  function build(c) {
    const f = fmt(), cfg = CFG(), all = c.all, ok = all && all.status === 'ok', ins = c.ref.ins, T = ins.totals;
    const hasBase = Boolean(ok);
    const verdict = (() => {
      if (!hasBase) return 'Hay segmentos del periodo, pero sin periodo anterior no se puede partir el cambio de la venta.';
      const t = all.total, pt = t.deltaPct === null ? '' : ` (${t.delta < 0 ? '−' : '+'}${Math.abs(t.deltaPct * 100).toFixed(1)} %)`;
      if (Math.abs(t.delta) < 0.5) return 'La venta no cambió contra el periodo anterior.';
      const word = t.delta < 0 ? 'bajó' : 'subió', lead = t.lead, same = Math.sign(t[lead]) === Math.sign(t.delta);
      const why = lead === 'traffic' ? (t.traffic >= 0 ? 'más tráfico' : 'menos tráfico') : lead === 'cr' ? (t.cr >= 0 ? 'mejor conversión' : 'peor conversión') : (t.aov >= 0 ? 'un ticket más alto' : 'un ticket más bajo');
      return same ? `La venta ${word} ${f.M(t.delta)}${pt}, sobre todo por ${why} (${f.SM(t[lead])}).`
        : `La venta ${word} ${f.M(t.delta)}${pt}: el efecto mayor es ${EN[lead]} (${f.SM(t[lead])}), en sentido contrario al cambio total.`;
    })();

    /* ---- Confiabilidad ---- */
    const chips = [], nd = c.dimsInfo.length, ns = c.dimsInfo.reduce((a, d) => a + d.ins.rows.length, 0);
    if (hasBase) chips.push(['ok', '● Cuadra: tráfico + conversión + ticket = cambio', 'Los tres efectos del total suman exactamente el cambio de la venta; cada uno mueve un factor a la vez. El total es el mismo en todas las dimensiones.']);
    else chips.push(['warn', '◐ Sin periodo anterior', 'Sin referencia no se puede separar el cambio en tráfico, conversión y ticket. Cambia el periodo o carga datos anteriores.']);
    chips.push(['mu', '● Contra el periodo anterior', `${c.baseline ? `${c.baseline.from} a ${c.baseline.to}` : 'Sin datos'}. Los segmentos no tienen plan.`]);
    chips.push(['ok', `● ${nd === 1 ? '1 dimensión' : nd + ' dimensiones'} · ${ns} segmentos`, `Se leen todas las dimensiones del archivo: ${c.dimsInfo.map((d) => d.label).join(', ')}. Cada una reparte la misma venta a su manera.`]);
    if (all && all.partialDims && all.partialDims.length) chips.push(['warn', `◐ Cobertura parcial: ${all.partialDims.join(', ')}`, 'Esas dimensiones no cubren todo el tráfico y la venta del total: su lectura es parcial.']);
    if (nd > 1) chips.push(['mu', '◐ Las dimensiones se traslapan', 'Un mismo visitante es a la vez de un dispositivo, una fuente y un tipo de cliente: los efectos de distintas dimensiones no se suman entre sí.']);
    if (ok && all.quality.length) chips.push(['warn', `◐ Calidad del tráfico: ${all.quality.length} aviso${all.quality.length === 1 ? '' : 's'}`, 'Posible tráfico no humano, campaña de baja intención o etiquetado en GA4; la app solo lo marca, no lo confirma.']);
    if (c.channel === 'total') chips.push(['mu', '○ WhatsApp y Llamadas sin segmentos', 'GA4 solo mide el sitio y la app: esos canales siguen en venta real y en las demás vistas, no aquí.']);

    /* ---- Resumen general ---- */
    const S = [];
    const pick = (o) => FP.trafficConversionEngine.pick(all, o).rows;
    if (hasBase) {
      const t = all.total;
      S.push(['Cambio de venta', `La venta ${t.delta < 0 ? 'bajó' : 'subió'} ${B(f.M(t.delta))}: ${f.M(t.base)} → ${f.M(t.current)}.`,
        `De ${f.M(t.base)} a ${f.M(t.current)}. Tráfico ${f.SM(t.traffic)}, conversión ${f.SM(t.cr)}, ticket ${f.SM(t.aov)}: los tres suman exactamente el cambio. El total no depende de la dimensión.`]);
      const lk = t.lead, neg = t[lk] < 0, w = pick({ effect: lk, sign: neg ? 'neg' : 'pos', limit: 1 })[0];
      if (w) S.push([`Lo que más ${neg ? 'resta' : 'suma'}`, `${tag(w)}${B(esc(w.label))} ${neg ? 'restó' : 'sumó'} ${f.SM(w.value)} de ${EN[lk]}.`,
        `${tag(w)}${B(esc(w.label))}: ${EN[lk]} ${f.SM(w.value)}${w.base && w.cur ? ` (${f.n0(w.base.t)} → ${f.n0(w.cur.t)} sesiones, CR ${f.p2(w.base.o / w.base.t)} → ${f.p2(w.cur.o / w.cur.t)})` : ''}. Es el mayor efecto de ${EN[lk]} entre los segmentos de todas las dimensiones.`]);
      const other = ['traffic', 'cr', 'aov'].filter((k) => k !== lk && Math.abs(t[k]) >= cfg.counterShare * Math.abs(t[lk])).sort((a, b) => Math.abs(t[b]) - Math.abs(t[a]))[0];
      if (other) { const n2 = t[other] < 0, x = pick({ effect: other, sign: n2 ? 'neg' : 'pos', limit: 1 })[0];
        if (x) S.push(['Contrapeso', `${tag(x)}${B(esc(x.label))} ${n2 ? 'restó' : 'sumó'} ${f.SM(x.value)} de ${EN[other]}.`, `${tag(x)}${B(esc(x.label))}: ${EN[other]} ${f.SM(x.value)}, el mayor efecto de ${EN[other]} ${n2 ? 'a la baja' : 'al alza'}. En total, ${EN[other]} ${f.SM(t[other])}.`]); }
      const m = all.mix;
      if (m && Math.abs(m.within) + Math.abs(m.mix) >= cfg.mixMinPp / 100) S.push(['Mezcla del CR', `El CR del total ${m.delta < 0 ? 'bajó' : 'subió'} ${B(f.pp(m.delta * 100))}: ${f.pp(m.within * 100)} por los segmentos y ${f.pp(m.mix * 100)} por cambio de mezcla.`,
        `CR del total ${f.p2(m.cr0)} → ${f.p2(m.cr1)}: ${f.pp(m.within * 100)} porque los segmentos convierten ${m.within < 0 ? 'peor' : 'mejor'} y ${f.pp(m.mix * 100)} por cambio de mezcla de tráfico. Si la mezcla pesara más, el CR del total cambiaría sin que ningún segmento cambiara.`]);
    } else {
      S.push(['Periodo actual', `${B(f.n0(T.traffic))} sesiones, ${B(f.n0(T.orders))} pedidos, CR ${B(T.cr === null ? '—' : f.p2(T.cr))}, AOV ${B(T.aov === null ? '—' : f.M(T.aov))}.`,
        `Sin periodo anterior solo se puede describir el periodo: ${f.n0(T.traffic)} sesiones, ${f.n0(T.orders)} pedidos, CR ${T.cr === null ? '—' : f.p2(T.cr)} y AOV ${T.aov === null ? '—' : f.M(T.aov)}.`]);
    }
    const opps = c.dimsInfo.flatMap((d) => (d.ins.opportunities || []).map((o) => ({ ...o, dim: d.dim, dimLabel: d.label, _ins: d.ins }))).sort((a, b) => b.opportunity - a.opportunity);
    const oppOk = opps.filter((o) => T.revenue > 0 && o.opportunity >= cfg.oppMinShare * T.revenue);
    if (oppOk.length) { const o = oppOk[0];
      S.push(['Oportunidad', `${tag(o)}${B(esc(o.label))} convierte ${f.p2(o.current.cr)} contra ${f.p2(T.cr)} del total: serían ${B('+' + f.M(o.opportunity))} (escenario, no promesa).`,
        `Si ${esc(o.label)} (${esc(o.dimLabel.toLowerCase())}) convirtiera al CR del total (${f.p2(T.cr)}), con su mismo tráfico (${f.n0(o.current.traffic)}) y su AOV (${f.M(o.current.aov)}), la venta sería ${f.M(o.opportunity)} mayor. Las oportunidades de distintas dimensiones pueden ser el mismo tráfico: no se suman.`]); }
    const down = (c.trends || []).flatMap((t) => t.series.filter((x) => x.dir === 'down').map((x) => ({ ...x, dimLabel: t.dimLabel })));
    const up = (c.trends || []).flatMap((t) => t.series.filter((x) => x.dir === 'up').map((x) => ({ ...x, dimLabel: t.dimLabel })));
    if (down.length) S.push(['Tendencia del CR', `${tag(down[0])}${B(esc(down[0].label))}: el CR viene ${B('a la baja')} en las 2 últimas semanas.`,
      `Segmentos con CR a la baja (2 últimas semanas contra las 6 anteriores, Wilson al 95 %): ${down.map((x) => `${esc(x.dimLabel)}: ${esc(x.label)}`).join(', ')}.${up.length ? ` Al alza: ${up.map((x) => `${esc(x.dimLabel)}: ${esc(x.label)}`).join(', ')}.` : ''}`]);
    else if (up.length) S.push(['Tendencia del CR', `${tag(up[0])}${B(esc(up[0].label))}: el CR viene ${B('al alza')} en las 2 últimas semanas.`, `Segmentos con CR al alza: ${up.map((x) => `${esc(x.dimLabel)}: ${esc(x.label)}`).join(', ')}.`]);
    const low = c.dimsInfo.flatMap((d) => (d.ins.lowAov || []).map((x) => ({ ...x, dim: d.dim, dimLabel: d.label })));
    if (low.length) { const l = low[0];
      S.push(['Ticket', `${tag(l)}${B(esc(l.label))} tiene un ticket ${f.p1(Math.abs(l.aovGap))} por debajo del total (${f.M(l.current.aov)} contra ${f.M(T.aov)}).`,
        `Segmentos con volumen y ticket más de 15 % bajo el total: ${low.map((x) => `${esc(x.dimLabel)}: ${esc(x.label)}`).join(', ')}. Podrían ser candidatos a venta cruzada o a un umbral de envío: es una hipótesis por validar.`]); }
    const sp = c.split;
    if (sp && sp.nuevo.cr && sp.recurrente.cr) { const r = sp.recurrente.cr / sp.nuevo.cr;
      S.push(['Nuevos y recurrentes', `Los recurrentes convierten ${B(r.toFixed(1) + ' veces')} lo que los nuevos.`, `Desde «Tipo de cliente», con el mismo periodo y canal: los recurrentes convierten ${r.toFixed(1)} veces lo que los nuevos y su parte del tráfico es ${sp.recurrente.share === null ? '—' : f.p1(sp.recurrente.share)}.`]); }
    if (ok && all.quality.length) { const q = all.quality[0];
      S.push(['Calidad del tráfico', `${B(all.quality.length + ' aviso' + (all.quality.length === 1 ? '' : 's'))}: ${esc(q.dimLabel)} · «${esc(q.label)}».`,
        `${all.quality.map((q2) => `${esc(q2.dimLabel)} · «${esc(q2.label)}»: ${q2.type === 'zero_orders' ? `${f.n0(q2.sessions)} sesiones y ningún pedido` : q2.type === 'spike_low_cr' ? `duplicó o más su tráfico y su conversión cayó a menos de la mitad` : 'tráfico nuevo que convierte menos de la mitad que el total'}`).join('. ')}. Puede ser tráfico no humano, campaña de baja intención o etiquetado en GA4; se marca, no se confirma.`]); }
    if (ok && all.cross && all.cross.cells.length) { const cw = all.cross.cells.slice().sort((a, b) => a.delta - b.delta)[0];
      if (cw && cw.delta < 0) S.push(['Cruce', `${B(esc(cw.a) + ' × ' + esc(cw.b))} restó ${f.SM(cw.delta)}${cw.cr0 !== null && cw.cr1 !== null ? ` (CR ${f.p2(cw.cr0)} → ${f.p2(cw.cr1)})` : ''}.`,
        `En el cruce Dispositivo × Fuente/medio, ${esc(cw.a)} × ${esc(cw.b)} es la combinación que más resta: ${f.SM(cw.delta)}.`]); }
    const w = [], wl = [];
    if (!hasBase) { w.push('Sin periodo anterior'); wl.push('No hay datos de segmentos del periodo anterior: sin referencia no se puede partir el cambio en tráfico, conversión y ticket'); }
    if (nd > 1) { w.push('Las dimensiones se traslapan'); wl.push('Un mismo visitante cuenta en cada dimensión: los efectos de dos dimensiones distintas no se suman'); }
    if (all && all.partialDims && all.partialDims.length) { w.push(`Cobertura parcial en ${all.partialDims.join(', ')}`); wl.push(`${all.partialDims.join(', ')} no cubre${all.partialDims.length === 1 ? '' : 'n'} todo el total: su lectura es parcial`); }
    if (ok) all.others.forEach((o) => { if (o.o.share >= 0.25) { w.push(`«Otros» pesa ${Math.round(o.o.share * 100)} % en ${o.dimLabel}`); wl.push(`En ${o.dimLabel}, «Otros» reúne el ${Math.round(o.o.share * 100)} % del tráfico (${o.o.segments} segmentos de poco volumen): sus efectos mezclan segmentos distintos`); } });
    if (c.channel === 'total') { w.push('WhatsApp y Llamadas sin segmentos'); wl.push('WhatsApp y Llamadas no tienen datos por segmento (GA4 solo mide el sitio y la app): sus totales siguen en venta real y en las demás vistas'); }
    if (w.length) S.push(['Ojo', `${w.join('. ')}.`, `${wl.join('. ')}.`]);

    /* ---- Línea de lectura ---- */
    const L = { s1: '', s3: '', s4: '', s5: '' };
    if (hasBase) { const t = all.total;
      L.s1 = all.quality.length ? `Antes de leer la conversión de «${esc(all.quality[0].label)}», revisa la calidad de su tráfico.`
        : Math.sign(t[t.lead]) !== Math.sign(t.delta) ? `El efecto mayor va en sentido contrario al cambio total: ${EN[t.lead]} ${f.SM(t[t.lead])}.` : `El efecto de ${EN[t.lead]} (${f.SM(t[t.lead])}) explica la mayor parte del cambio.`; }
    if (oppOk.length) { L.s3 = `Mayor diferencia: ${B(esc(oppOk[0].dimLabel + ': ' + oppOk[0].label))} convierte ${f.p2(oppOk[0].current.cr)} contra ${f.p2(T.cr)} del total.`; L.s4 = `Escenario matemático: la mayor oportunidad es ${B(esc(oppOk[0].dimLabel + ': ' + oppOk[0].label))} con +${f.M(oppOk[0].opportunity)}.`; }
    if (down.length) L.s5 = `${B(esc(down[0].label))} baja de forma sostenida${down.length > 1 ? ` (y ${down.length - 1} más)` : ''}.`;

    /* ---- ¿Qué hago con esto? ---- */
    const A = [];
    if (oppOk.length) { const o = oppOk[0], rel = T.orders > 0 ? (o.current.traffic * (T.cr - o.current.cr)) / T.orders * 100 : 0;
      A.push({ id: 'sim', title: `Simular la recuperación de «${o.label}»`, label: `${o.dimLabel}: ${o.label}`, rel, desc: `Abre Recuperar con el mismo periodo y canal y el CR de ese segmento llevado al del total como escenario (+${f.M(o.opportunity)}). Tú lo revisas y lo guardas; no se guarda solo.` }); }
    else A.push({ id: 'sim', title: 'Simular la recuperación', why: hasBase ? 'Ningún segmento con volumen suficiente convierte claramente por debajo del total.' : 'Sin periodo anterior no hay brecha que simular.', desc: 'Abre Recuperar con la misma selección.' });
    A.push({ id: 'dx', title: 'Diagnosticar la brecha', desc: 'Abre Diagnóstico (Nivel 2) con el mismo periodo, canal y comparación, para ver el cambio contra el plan y los drivers.' });
    if (low.length) A.push({ id: 'cross', title: 'Vender más por pedido', desc: `«${low[0].label}» tiene el ticket más bajo con volumen. Abre Cross-sell para ver qué productos suelen comprarse juntos.` });
    if (sp) A.push({ id: 'cli', title: 'Ver a los clientes nuevos y recurrentes', desc: 'Abre Clientes y LTV con el mismo canal para ver retención y valor por cohorte.' });
    if (ok && all.quality.length) A.push({ id: 'q', title: 'Revisar la calidad del tráfico', desc: `Hay ${all.quality.length} aviso${all.quality.length === 1 ? '' : 's'} de tráfico. La revisión del etiquetado de GA4 se hace fuera de la herramienta.`, why: 'No hay un destino dentro de la app.' });
    return { ok: Boolean(ok), hasBase, verdict, chips, rows: S, lec: L, actions: A, opps: oppOk };
  }

  FP.trResumen = { build, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
