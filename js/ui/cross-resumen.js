/**
 * cross-resumen.js — Reglas invisibles de «Cross-sell»: qué frase del veredicto, qué filas del resumen general y qué línea de lectura de cada
 * sección se muestran. Descriptivo (qué se compra junto, no por qué). Umbrales en FP.config.products.crossSell (PROVISIONALES).
 * Una fila o línea que no tiene nada que decir simplemente no se arma.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const n0 = (v) => Math.round(v).toLocaleString('es-MX');
  const M = (v) => '$' + Math.round(v).toLocaleString('es-MX');
  const p0 = (v) => `${Math.round(v * 100)} %`;
  const B = (t) => `<b>${t}</b>`;
  const CH = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const pairLabel = (c) => `${c.a} + ${c.b}`;

  /** Canal donde más funciona un par (confianza ≥ ratio veces la del canal donde menos), con pedidos suficientes en ambos. */
  function channelGap(c, ratio) {
    const v = (c.byChannel || []).filter((x) => fin(x.conf) && x.conf > 0);
    if (v.length < 2) return null;
    const hi = v.reduce((a, b) => (b.conf > a.conf ? b : a)), lo = v.reduce((a, b) => (b.conf < a.conf ? b : a));
    return hi.conf / lo.conf >= ratio ? { hi, lo, r: hi.conf / lo.conf } : null;
  }

  function build(r) {
    const C = FP.config.products.crossSell, cs = r.candidates, S = [], chips = [];
    const weak = !fin(r.multiShare) || r.multiShare < C.multiMin, many = cs.length;
    const verdict = r.empty ? 'Todavía no hay pedidos con detalle por producto para este análisis.'
      : many ? `Hay ${many} ${many === 1 ? 'par con señal clara' : 'pares con señal clara'} de cross-sell; el más fuerte: ${pairLabel(cs[0])}.`
        : weak ? 'Pocos pedidos llevan más de un producto: todavía no hay señal para cross-sell.' : 'Ningún par se compra junto con la fuerza suficiente para sugerirlo como cross-sell.';
    chips.push([weak ? 'warn' : 'ok', `● ${p0(r.multiShare || 0)} de pedidos con 2 o más productos`, `Con menos de ${p0(C.multiMin)} de canastas con varios productos, las asociaciones se apoyan en pocos pedidos.`]);
    chips.push([r.coverage >= C.coverageMin ? 'ok' : 'warn', `● ${p0(r.coverage)} de pedidos con detalle por producto`, 'Pedidos cuyo archivo trae el detalle por producto. Los demás no entran en este análisis.']);
    chips.push(['mu', `◐ Mín. ${C.minPairs} pedidos juntos · lift ≥ ${C.minLift}`, `Umbrales provisionales: un par con menos de ${C.minPairs} pedidos, lift menor a ${C.minLift} o menos de ${Math.round(C.minConf * 100)} de cada 100 pedidos con A que llevan B no se sugiere.`]);
    chips.push(['mu', '● Asociación, no causa', 'Que dos productos se compren juntos no prueba que ofrecer uno suba la venta del otro; se valida con una prueba.']);

    S.push(['Canastas', `${B(p0(r.multiShare || 0))} de pedidos lleva 2 o más productos (${(r.avgItems || 0).toFixed(1)} por pedido).`,
      `${B(p0(r.multiShare || 0))} de los ${n0(r.orders)} pedidos lleva 2 o más productos${fin(r.multiRevShare) ? ` y concentra ${p0(r.multiRevShare)} de la venta` : ''}. El promedio es ${(r.avgItems || 0).toFixed(1)} productos por pedido.`]);
    if (many) {
      const t = cs[0];
      S.push(['Mejor candidato', `${B(pairLabel(t))}: de cada 100 pedidos con ${t.a}, ${Math.round(t.conf * 100)} llevan también ${t.b}.`,
        `${B(pairLabel(t))}: ${n0(t.n)} pedidos juntos. De cada 100 pedidos con ${t.a}, ${Math.round(t.conf * 100)} llevan también ${t.b} (lift ${t.lift.toFixed(1)}: es ${t.lift.toFixed(1)} veces más probable que en un pedido cualquiera). Hay ${n0(t.aOnly)} pedidos con ${t.a} sin ${t.b}.`]);
      const a = (r.anchors || [])[0];
      if (a && a.withOtherShare >= 0.2) S.push(['Productos ancla', `${B(a.item)} arrastra más: ${p0(a.withOtherShare)} de sus pedidos lleva otro producto.`,
        `${B(a.item)} es el producto que más acompaña: ${p0(a.withOtherShare)} de sus ${n0(a.orders)} pedidos lleva otro producto${a.partner ? `, sobre todo ${a.partner}` : ''}.`]);
      const ct = r.cats; let top = null;
      if (ct) ct.lift.forEach((row, i) => row.forEach((v, j) => { if (j > i && fin(v) && v >= C.catLift && (!top || v > top.v)) top = { i, j, v }; }));
      if (top && r.level !== 'category') S.push(['Entre categorías', `${B(`${ct.names[top.i]} y ${ct.names[top.j]}`)} se compran juntas ${top.v.toFixed(1)} veces más de lo esperado.`,
        `${B(`${ct.names[top.i]} y ${ct.names[top.j]}`)}: lift ${top.v.toFixed(1)} a nivel categoría. Si el cross-sell se hace entre categorías, ahí hay más espacio que dentro de una sola.`]);
      let gap = null; cs.slice(0, C.topPairs).forEach((c) => { const g = channelGap(c, C.channelRatio); if (g && (!gap || g.r > gap.g.r)) gap = { c, g }; });
      if (gap) S.push(['Canal', `${B(gap.c.b)} acompaña a ${gap.c.a} ${p0(gap.g.hi.conf)} en ${CH(gap.g.hi.channel)} y ${p0(gap.g.lo.conf)} en ${CH(gap.g.lo.channel)}.`,
        `${B(gap.c.b)} acompaña a ${gap.c.a} ${p0(gap.g.hi.conf)} de las veces en ${CH(gap.g.hi.channel)} contra ${p0(gap.g.lo.conf)} en ${CH(gap.g.lo.channel)}. Conviene probarlo primero donde ya funciona.`]);
      r._gap = gap;
    }
    if (r.prev && (r.prev.fresh || r.prev.gone)) S.push(['Contra hace 90 días', `${r.prev.fresh} ${r.prev.fresh === 1 ? 'par nuevo' : 'pares nuevos'} y ${r.prev.gone} que ${r.prev.gone === 1 ? 'deja' : 'dejan'} de cumplir los umbrales.`,
      `${r.prev.fresh} ${r.prev.fresh === 1 ? 'par cumple' : 'pares cumplen'} los umbrales ahora y hace ${r.prev.days} días no; ${r.prev.gone} dejó de cumplirlos. De ${r.prev.n} pares de entonces se mantienen ${r.prev.n - r.prev.gone}.`]);
    const w = [], wl = [];
    if (r.coverage < C.coverageMin) { w.push(`Solo ${p0(r.coverage)} de pedidos con detalle por producto`); wl.push(`Solo ${p0(r.coverage)} de los pedidos trae detalle por producto; recargar los archivos antiguos amplía el análisis`); }
    if (weak && !r.empty) { w.push('Pocas canastas con varios productos'); wl.push(`Solo ${p0(r.multiShare || 0)} de los pedidos lleva 2 o más productos: con tan pocas canastas, pocos pares llegan a ${C.minPairs} pedidos juntos y cualquier asociación sería ruido`); }
    if (r.skippedLarge) { w.push(`${n0(r.skippedLarge)} pedidos con demasiados productos no se cruzan`); wl.push(`${n0(r.skippedLarge)} pedidos llevan más de ${C.maxItemsPerOrder} productos distintos y no entran en los pares para no inflarlos`); }
    if (w.length) S.push(['Ojo', `${w.join('. ')}.`, `${wl.join('. ')}.`]);
    const ORD = ['Canastas', 'Mejor candidato', 'Productos ancla', 'Entre categorías', 'Canal', 'Contra hace 90 días', 'Ojo'];
    S.sort((a, b) => ORD.indexOf(a[0]) - ORD.indexOf(b[0]));

    const L = { b: '', c: '', a: '', k: '', ch: '' };
    if (!weak) L.b = `Los pedidos con 2 o más productos son ${B(p0(r.multiShare))}${fin(r.multiRevShare) ? ` y aportan ${B(p0(r.multiRevShare))} de la venta` : ''}.`;
    else L.b = `Solo ${B(p0(r.multiShare || 0))} de los pedidos lleva más de un producto.`;
    if (many) L.c = `${B(pairLabel(cs[0]))}: de cada 100 pedidos con ${cs[0].a}, ${Math.round(cs[0].conf * 100)} llevan ${cs[0].b}.`;
    if (r._gap) L.ch = `${B(r._gap.c.b)} se suma a ${r._gap.c.a} ${p0(r._gap.g.hi.conf)} en ${CH(r._gap.g.hi.channel)} y ${p0(r._gap.g.lo.conf)} en ${CH(r._gap.g.lo.channel)}.`;
    return { verdict, chips, rows: S, lec: L, weak, many };
  }

  FP.crossResumen = { build, channelGap, pairLabel, n0, M, p0, CH };
})(typeof window !== 'undefined' ? window : globalThis);
