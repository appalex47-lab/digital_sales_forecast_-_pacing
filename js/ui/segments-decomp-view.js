/**
 * segments-decomp-view.js — «Tráfico y conversión»: tarjeta «Qué explica el cambio de la venta» (titular, cascada tráfico → conversión → ticket,
 * hallazgos en frases, mezcla del CR y tabla de efectos por segmento) y resumen de todas las dimensiones.
 * Solo construye HTML a partir de FP.trafficConversionEngine; no calcula nada propio. Diferencias matemáticas, no causas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const EFF = { traffic: 'tráfico', cr: 'conversión', aov: 'ticket' };
  const cls = (v) => (v < -0.5 ? 'is-neg' : v > 0.5 ? 'is-pos' : '');
  const sign = (money, v) => (Math.abs(v) < 0.5 ? money(0) : (v > 0 ? '+' : '−') + money(Math.abs(v)));

  /** Cascada Δ venta: tráfico → conversión → ticket → total (columnas con barras flotantes). */
  function waterfall(dec, { esc, money }) {
    const t = dec.total, steps = [['Tráfico', 0, t.traffic], ['Conversión', t.traffic, t.traffic + t.cr], ['Ticket', t.traffic + t.cr, t.traffic + t.cr + t.aov], ['Total', 0, t.delta]];
    const vals = steps.flatMap((s) => [s[1], s[2]]).concat(0), hi = Math.max(...vals), lo = Math.min(...vals), span = hi - lo || 1;
    const pos = (v) => ((hi - v) / span) * 100;
    const zero = pos(0).toFixed(2);
    const cols = steps.map(([label, from, to], i) => {
      const top = pos(Math.max(from, to)), h = Math.max(1.5, Math.abs(pos(from) - pos(to))), delta = to - from;
      const kind = i === 3 ? 'total' : delta < 0 ? 'neg' : 'pos';
      return `<div class="sgd-wf__col"><div class="sgd-wf__plot"><span class="sgd-wf__zero" style="top:${zero}%"></span><span class="sgd-wf__val ${i === 3 ? '' : cls(delta)}" style="top:calc(${top.toFixed(2)}% - 1.4rem)">${esc(sign(money, delta))}</span>
        <span class="sgd-wf__bar sgd-wf__bar--${kind}" style="top:${top.toFixed(2)}%;height:${h.toFixed(2)}%"></span></div><span class="sgd-wf__lbl">${label}</span></div>`;
    }).join('');
    return `<figure class="sgd-wf" role="img" aria-label="Cascada del cambio de venta: tráfico ${esc(sign(money, t.traffic))}, conversión ${esc(sign(money, t.cr))}, ticket ${esc(sign(money, t.aov))}, total ${esc(sign(money, t.delta))}">
        <div class="sgd-wf__cols">${cols}</div></figure>`;
  }

  /** Barra divergente (a la izquierda resta, a la derecha suma), escala común de la tabla. */
  function bar(v, max) {
    const w = max > 0 ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
    return `<span class="sgd-bar" aria-hidden="true"><span class="sgd-bar__zero"></span>${Math.abs(v) < 0.5 ? '' : `<span class="sgd-bar__fill ${v < 0 ? 'sgd-bar__fill--neg' : 'sgd-bar__fill--pos'}" style="width:${w.toFixed(2)}%"></span>`}</span>`;
  }

  function mixBlock(dec, { esc, signedPp }) {
    const m = dec.mix; if (!m) return '';
    const total = Math.abs(m.within) + Math.abs(m.mix) || 1, w = (Math.abs(m.within) / total) * 100;
    const pc = (v) => `${(v * 100).toFixed(2)} %`;
    return `<section class="sgd-mix" aria-label="Mezcla del CR total"><h3 class="panel__title">CR del total: ${pc(m.cr0)} → ${pc(m.cr1)} (${esc(signedPp(m.delta * 100))})</h3>
      <div class="sgd-mix__bar" aria-hidden="true"><span class="${m.within < 0 ? 'sgd-bar__fill--neg' : 'sgd-bar__fill--pos'}" style="width:${w.toFixed(1)}%"></span><span class="${m.mix < 0 ? 'sgd-bar__fill--neg' : 'sgd-bar__fill--pos'}" style="width:${(100 - w).toFixed(1)}%"></span></div>
      <p class="field__hint">${esc(signedPp(m.within * 100))} porque los segmentos convierten ${m.within < 0 ? 'peor' : 'mejor'} · ${esc(signedPp(m.mix * 100))} por cambio de mezcla de tráfico. Si la mezcla pesara más, el CR del total cambiaría sin que ningún segmento cambiara.</p></section>`;
  }

  /** Si «Otros» concentra una parte grande del tráfico, sus efectos mezclan segmentos distintos: se avisa con el porcentaje. */
  function othersBlock(dec, { esc, F }) {
    const o = dec.others;
    if (!o || !(o.share >= 0.25)) return '';
    return `<p class="note sgd-others" data-others="${(o.share * 100).toFixed(0)}"><strong>«Otros» reúne el ${Math.round(o.share * 100)} % del tráfico</strong> (${esc(F.integer(o.segments))} segmentos de menos de ${esc(F.integer(dec.minSessions))} sesiones). Sus efectos mezclan segmentos distintos: léelos como un bloque, no como un segmento.</p>`;
  }

  /** Aviso de calidad del tráfico (posible tráfico no humano / campaña sin intención / etiquetado). Solo señala; no afirma causa. */
  function qualityBlock(dec, { esc, pct, F }) {
    const q = dec.quality || [];
    if (!q.length) return '';
    const txt = (f) => {
      const cr = f.crBase !== null && f.crBase !== undefined ? `CR ${pct(f.crBase, 2)} → ${pct(f.cr, 2)}` : `CR ${pct(f.cr, 2)}${f.totalCr ? ` frente a ${pct(f.totalCr, 2)} del total` : ''}`;
      if (f.type === 'zero_orders') return `«${f.label}» tiene ${F.integer(f.sessions)} sesiones y ningún pedido.`;
      if (f.type === 'spike_low_cr') return `«${f.label}» duplicó o más su tráfico (+${F.integer(f.added)} sesiones) y su conversión cayó a menos de la mitad (${cr}).`;
      return `«${f.label}» es tráfico nuevo (${F.integer(f.sessions)} sesiones) y convierte menos de la mitad que el total (${cr}).`;
    };
    return `<div class="note note--warning sgd-quality" data-quality="${q.length}"><strong>Revisa la calidad de este tráfico.</strong><ul>${q.map((f) => `<li data-q="${esc(f.type)}">${esc(txt(f))}</li>`).join('')}</ul>
      <span class="field__hint">Puede ser tráfico no humano (bots), una campaña de baja intención o un problema de etiquetado en GA4; la app solo lo marca, no lo confirma.</span></div>`;
  }

  /**
   * @param dec resultado de trafficConversionEngine.analyze
   * @param ctx { esc, money, pct, F, signedPp, res, label }
   */
  function card(dec, ctx) {
    const { esc, money, pct, F, signedPp } = ctx;
    if (!dec || dec.status !== 'ok') {
      const msg = !dec || dec.status === 'no_baseline' ? 'No hay datos de segmentos del periodo anterior para comparar: sin referencia no se puede partir el cambio en tráfico, conversión y ticket.' : 'Los segmentos de este periodo no traen sesiones, pedidos y venta juntos.';
      return `<p class="field__hint">${esc(msg)}</p>`;
    }
    const t = dec.total, fin2 = (v) => sign(money, v);
    const dirWord = t.delta < 0 ? 'bajó' : t.delta > 0 ? 'subió' : 'no cambió';
    const lead = dec.dominantEffect;
    const leadSame = Math.sign(t[lead]) === Math.sign(t.delta) && t.delta !== 0;
    const sentence = `${leadSame ? `El efecto mayor es ${EFF[lead]} (${fin2(t[lead])})` : `El efecto mayor es ${EFF[lead]} (${fin2(t[lead])}), en sentido contrario al cambio total`}; tráfico ${fin2(t.traffic)}, conversión ${fin2(t.cr)}, ticket ${fin2(t.aov)}.`;
    const finds = FP.trafficConversionEngine.findings(dec, { money: fin2, pct: (v, d = 1) => `${(v * 100).toFixed(d)} %` });
    const maxAbs = Math.max(1, ...dec.items.flatMap((x) => [x.traffic, x.cr, x.aov].map(Math.abs)));
    const cell = (x, k) => {
      const v = x[k], extra = k === 'cr' && v !== 0 && x.crTest.significant === false ? '<span class="cell-sub">no concluyente</span>' : (k === 'cr' && x.crTest.significant === true ? '<span class="cell-sub">distinguible del azar</span>' : '');
      return `<td class="num ${x.dominant === k ? 'sgd-dom' : ''}"><span class="${cls(v)}">${esc(fin2(v))}</span>${bar(v, maxAbs)}${extra}</td>`;
    };
    const kindNote = { new: 'nuevo en este periodo', gone: 'ya no aparece', noBaseOrders: 'sin pedidos en la base: el cambio se atribuye a conversión', newTraffic: 'sin sesiones en la base' };
    const rows = dec.items.map((x) => {
      const sub = x.base && x.cur ? `${F.integer(x.base.t)} → ${F.integer(x.cur.t)} sesiones${x.crPpDelta !== null && x.cur.o >= 0 ? ` · CR ${pct(x.base.o / x.base.t, 2)} → ${pct(x.cur.o / x.cur.t, 2)}` : ''}` : '';
      return `<tr><th scope="row">${esc(x.label)}${sub ? `<span class="cell-sub">${esc(sub)}</span>` : ''}${kindNote[x.kind] && x.kind !== 'both' ? `<span class="cell-sub">${esc(kindNote[x.kind])}</span>` : ''}</th>
        <td class="num ${cls(x.delta)}"><strong>${esc(fin2(x.delta))}</strong></td>${cell(x, 'traffic')}${cell(x, 'cr')}${cell(x, 'aov')}</tr>`;
    }).join('');
    return `<div class="sgd"><div class="sgd-head">
        <p class="sgd-head__lead">La venta ${dirWord} <strong class="${cls(t.delta)}">${esc(fin2(t.delta))}</strong>${fin(t.deltaPct) ? ` (${t.deltaPct >= 0 ? '+' : '−'}${Math.abs(t.deltaPct * 100).toFixed(1)} %)` : ''}: ${esc(money(t.base))} → ${esc(money(t.current))}.</p>
        <p class="field__hint">${esc(sentence)} Cada efecto mueve un factor a la vez (tráfico → conversión → ticket) y los tres suman exactamente el cambio${t.reconciles ? '' : ' (¡no cuadra: revisa los datos!)'}.</p>
      </div>
      <div class="sgd-grid">
        <div>${waterfall(dec, ctx)}</div>
        <div class="sgd-finds"><h3 class="panel__title">Qué mirar primero</h3>${finds.length ? `<ul class="sgd-finds__list">${finds.map((f) => `<li class="sgd-find"><span class="sgd-find__tag sgd-find__tag--${f.tone}">${esc(f.tag)}</span><span><strong>${esc(f.title)}</strong> ${esc(f.body)}</span></li>`).join('')}</ul>` : '<p class="field__hint">Sin movimientos relevantes por segmento.</p>'}
          ${mixBlock(dec, ctx)}</div>
      </div>
      ${qualityBlock(dec, ctx)}${othersBlock(dec, ctx)}
      <h3 class="panel__title" id="sgd-tt">Cuánto aportó cada segmento a cada efecto</h3>
      <div class="table-wrap"><table class="table ds-table sgd-table" aria-label="Efectos por segmento">
        <thead><tr><th scope="col">Segmento</th><th scope="col" class="num">Δ venta</th><th scope="col" class="num">Efecto tráfico</th><th scope="col" class="num">Efecto conversión</th><th scope="col" class="num">Efecto ticket</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num ${cls(t.delta)}">${esc(fin2(t.delta))}</td><td class="num ${cls(t.traffic)}">${esc(fin2(t.traffic))}</td><td class="num ${cls(t.cr)}">${esc(fin2(t.cr))}</td><td class="num ${cls(t.aov)}">${esc(fin2(t.aov))}</td></tr></tfoot></table></div>
      <p class="field__hint">Ordenado por Δ venta (mayor pérdida primero). El efecto dominante de cada fila va en negritas; las barras comparten escala. Segmentos con menos de ${esc(F.integer(dec.minSessions))} sesiones se agrupan en «Otros»${dec.hidden ? `; se omiten ${dec.hidden} segmentos de en medio` : ''}. «Distinguible del azar» = el cambio de CR del segmento pasa una prueba de dos proporciones al 95 %; «no concluyente», no. El efecto conversión mide cuánto cambió la venta por convertir distinto, no por qué.${dec.excluded.length ? ` Sin pedidos, sesiones o venta en alguno de los periodos y excluidos: ${esc(dec.excluded.slice(0, 5).join(', '))}${dec.excluded.length > 5 ? '…' : ''}.` : ''}</p></div>`;
  }

  /** Una fila por dimensión: efectos totales y segmento que más restó. list: [{ dim, label, dec, active }] */
  function dimsCard(list, ctx) {
    const { esc, money } = ctx, fin2 = (v) => sign(money, v);
    const ok = list.filter((x) => x.dec && x.dec.status === 'ok');
    if (ok.length < 2) return '';
    const rows = ok.map((x) => {
      const t = x.dec.total, worst = x.dec.allItems.find((i) => i.delta < 0), best = [...x.dec.allItems].reverse().find((i) => i.delta > 0);
      return `<tr${x.active ? ' aria-current="true"' : ''}><th scope="row"><button type="button" class="link-btn" data-action="seg-dim" data-value="${esc(x.dim)}" aria-label="Ver ${esc(x.label)}">${esc(x.label)}</button>${x.active ? '<span class="cell-sub">la que ves ahora</span>' : ''}</th>
        <td class="num ${cls(t.traffic)}">${esc(fin2(t.traffic))}</td><td class="num ${cls(t.cr)}">${esc(fin2(t.cr))}</td><td class="num ${cls(t.aov)}">${esc(fin2(t.aov))}</td>
        <td>${worst ? `${esc(worst.label)}<span class="cell-sub num ${cls(worst.delta)}">${esc(fin2(worst.delta))}</span>` : '—'}</td><td>${best ? `${esc(best.label)}<span class="cell-sub num ${cls(best.delta)}">${esc(fin2(best.delta))}</span>` : '—'}</td></tr>`;
    }).join('');
    return `<div class="sgd"><div class="table-wrap"><table class="table ds-table" aria-label="Resumen por dimensión">
        <thead><tr><th scope="col">Dimensión</th><th scope="col" class="num">Efecto tráfico</th><th scope="col" class="num">Efecto conversión</th><th scope="col" class="num">Efecto ticket</th><th scope="col">Segmento que más restó</th><th scope="col">Segmento que más sumó</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="field__hint">Cada dimensión parte la misma venta en sus propios segmentos, así que los efectos pueden diferir un poco entre filas: es normal (una dimensión agrupa el tráfico de otra manera). Si todas apuntan al mismo efecto, el problema no depende de cómo se corte.</p></div>`;
  }

  FP.segmentsDecompView = { card, dimsCard, waterfall, qualityBlock };
})(typeof window !== 'undefined' ? window : globalThis);
