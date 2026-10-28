/**
 * crosssell-view.js — «Cross-sell» (Crecer): qué productos se compran juntos. Versión B (clases px-, estilos en css/px.css y design-system.css).
 * Solo pinta lo que calcula FP.basketEngine con el libro de pedidos (ID de pedido + líneas por producto) y las reglas de FP.crossResumen.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const R = () => FP.crossResumen, PX = () => FP.pxView;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const n0 = (v) => Math.round(v).toLocaleString('es-MX');
  const p1 = (v) => (fin(v) ? `${(v * 100).toFixed(1)} %` : '—');
  const p0 = (v) => (fin(v) ? `${Math.round(v * 100)} %` : '—');
  const M0 = (v) => (fin(v) ? '$' + Math.round(v).toLocaleString('es-MX') : '—');
  const CH = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const LEVELS = [['product', 'Producto'], ['category', 'Categoría'], ['sku', 'SKU']];
  const fmtD = (iso) => { const [y, m, d] = iso.split('-'); return `${MES[+m - 1]} ${+d} de ${y}`; };

  const optsOf = (state) => { const o = state.cs.opts; return { level: o.level, channel: o.channel === 'total' ? null : o.channel }; };

  function sec(id, t, cap, body, lec, extra) {
    return `<section class="blk" id="${id}"><div class="blk__h"><h3>${t}</h3><span class="cap">${cap}</span>${extra || ''}</div>${body}${lec ? `<p class="lec">${lec}</p>` : ''}</section>`;
  }
  const kpi = (l, v, s) => `<div class="kpi"><div class="kpi__l">${l}</div><div class="kpi__v num">${v}</div><div class="kpi__d mu" style="font-weight:500">${s}</div></div>`;

  function dist(r) {
    const lab = ['1 producto', '2 productos', '3 productos', '4 o más'];
    const rows = r.dist.map((v, i) => `<tr><td>${lab[i]}</td><td class="num">${p1(v)}</td><td><div style="height:10px;border-radius:3px;background:var(--accent);width:${Math.max(2, v * 100)}%;opacity:${i ? 1 : 0.45}"></div></td></tr>`).join('');
    return `<div class="tw"><table class="dtab"><thead><tr><th>Productos por pedido</th><th>% de pedidos</th><th style="width:50%"></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const SORT_C = { lift: ['Lift', (a, b) => b.lift - a.lift || b.n - a.n], space: ['Espacio en pesos', (a, b) => (b.space || 0) - (a.space || 0)], n: ['Pedidos juntos', (a, b) => b.n - a.n] };
  const SORT_A = { rest: ['Resto de la canasta', (a, b) => b.restTicket - a.restTicket || b.orders - a.orders], share: ['% con otro producto', (a, b) => b.withOtherShare - a.withOtherShare || b.orders - a.orders], orders: ['Pedidos', (a, b) => b.orders - a.orders] };
  const sorter = (kind, ux) => { const T = kind === 'c' ? SORT_C : SORT_A, cur = (kind === 'c' ? ux.candBy : ux.anchorBy) || (kind === 'c' ? 'lift' : 'rest');
    return `<div class="mini" data-cs-sort="${kind}" role="group" aria-label="Ordenar por" style="margin-left:auto"><span class="mu" style="padding:4px 6px;font-size:.78rem">Ordenar por</span>${Object.keys(T).map((k) => `<button type="button" data-v="${k}" aria-pressed="${cur === k}">${T[k][0]}</button>`).join('')}</div>`; };
  const candOrder = (r, ux) => r.candidates.slice().sort(SORT_C[ux.candBy || 'lift'][1]);
  function cand(r, ux) {
    const C = FP.config.products.crossSell, cs = candOrder(r, ux).slice(0, C.topPairs);
    if (!cs.length) return `<p class="cap">Ningún par llega a ${C.minPairs} pedidos juntos con lift de ${C.minLift} o más.</p>`;
    const open = Boolean(ux.fold && ux.fold.c);
    const body = cs.map((c, i) => `<tr class="${i >= 5 ? 'x' : ''}"><td class="nm">${esc(c.a)}</td><td class="nm">${esc(c.b)}</td><td class="num">${n0(c.n)}</td><td class="num">${Math.round(c.conf * 100)}</td><td class="num">${c.lift.toFixed(1)}</td><td class="num">${n0(c.aOnly)}</td><td class="num">${M0(c.bRevPerOrder)}</td><td class="num">${M0(c.space)}</td></tr>`).join('');
    return `<div class="tw${open ? ' open' : ''}"><table class="dtab"><thead><tr><th>Si compra…</th><th>…se le suma</th><th>Pedidos juntos</th><th>De cada 100, también lo llevan</th><th>Lift</th><th>Pedidos con A sin B</th><th>Venta de B por pedido</th><th>Espacio por probar</th></tr></thead><tbody>${body}</tbody></table>${cs.length > 5 ? `<div class="tf"><span class="mu">${open ? 'todos' : '5 pares'}</span><button type="button" class="lk" data-cs-fold="c">${open ? 'Ver solo 5' : 'Ver todos'}</button></div>` : ''}</div>
      <p class="cap">Entre los pares con al menos ${C.minPairs} pedidos juntos. «Espacio por probar» = pedidos con A sin B × venta de B por pedido: lo que habría que probar, no un pronóstico de venta.</p>`;
  }
  function anchors(r, ux) {
    const a = r.anchors.filter((x) => x.withOtherShare > 0).sort(SORT_A[ux.anchorBy || 'rest'][1]).slice(0, 5);
    if (!a.length) return '';
    const rows = a.map((x) => `<tr><td class="nm">${esc(x.item)}</td><td class="num">${n0(x.orders)}</td><td class="num">${M0(x.ticket)}</td><td class="num">${M0(x.restTicket)}</td><td class="num">${M0(x.ticketWithout)}</td><td class="num">${p0(x.withOtherShare)}</td><td class="nm">${x.partner ? esc(x.partner) : '<span class="na">—</span>'}</td></tr>`).join('');
    return `<div class="tw"><table class="dtab"><thead><tr><th>Producto ancla</th><th>Pedidos</th><th>Ticket del pedido</th><th>Resto de la canasta</th><th>Pedido sin él</th><th>% con otro producto</th><th>Lo que más lo acompaña</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="cap">Ticket = venta promedio de los pedidos que lo llevan. «Resto de la canasta» no cuenta al propio producto, así su precio no infla el ancla. «Pedido sin él» es el ticket de un pedido que no lo lleva. Solo productos con al menos ${FP.config.products.crossSell.minAnchorOrders} pedidos. Es venta, no margen.</p>`;
  }
  function cats(r) {
    const C = FP.config.products.crossSell, ct = r.cats;
    if (!ct) return '';
    const head = `<tr><th>Categoría</th>${ct.names.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const body = ct.lift.map((row, i) => `<tr><td class="nm">${esc(ct.names[i])}</td>${row.map((v, j) => (i === j ? '<td class="num na">—</td>' : !fin(v) ? '<td class="num na">—</td>' : `<td class="num"${v >= C.catLift ? ' style="background:var(--accent-soft);font-weight:700"' : ''}>${v.toFixed(1)}</td>`)).join('')}</tr>`).join('');
    return `<div class="tw"><table class="dtab"><thead>${head}</thead><tbody>${body}</tbody></table></div><p class="cap">Lift entre categorías. En azul, ${C.catLift} o más: se compran juntas al menos el doble de lo esperado. Cerca de 1 es lo mismo que al azar. «—» = pocos pedidos juntos para medirlo.</p>`;
  }
  function byChannel(r) {
    const C = FP.config.products.crossSell, rows = r.candidates.slice(0, 5).filter((c) => c.byChannel);
    if (!rows.length) return '';
    const chs = r.channelsAvailable.filter((c) => rows.some((x) => x.byChannel.some((q) => q.channel === c && q.orders > 0)));
    const body = rows.map((c) => { const g = R().channelGap(c, C.channelRatio);
      return `<tr><td class="nm">${esc(R().pairLabel(c))}</td>${chs.map((ch) => { const q = c.byChannel.find((x) => x.channel === ch); return `<td class="num"${g && g.hi.channel === ch ? ' style="background:var(--accent-soft);font-weight:700"' : ''}>${q && fin(q.conf) ? p0(q.conf) : '<span class="na">—</span>'}</td>`; }).join('')}</tr>`; }).join('');
    return `<div class="tw"><table class="dtab"><thead><tr><th>Par</th>${chs.map((c) => `<th>${esc(CH(c))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p class="cap">De cada 100 pedidos con el primer producto, cuántos llevan también el segundo, por canal. En azul, el canal donde más funciona si la diferencia es de ${C.channelRatio} veces o más. «—» = menos de ${C.minPairs} pedidos con el primer producto en ese canal.</p>`;
  }
  function actions(r) {
    return `<div class="act">${r.candidates.slice().sort(SORT_C.space[1]).slice(0, 3).map((c) => `<div><b>${esc(R().pairLabel(c))}</b><span>${n0(c.aOnly)} pedidos con ${esc(c.a)} sin ${esc(c.b)}${fin(c.space) ? ` · espacio ≈ ${M0(c.space)}` : ''}</span><a class="lk" href="#promociones" data-nav="promociones">Preparar en Promociones →</a></div>`).join('')}</div>`;
  }

  function render(state) {
    const el = $('cs-body'); if (!el) return;
    const cs = state.cs;
    const key = JSON.stringify(optsOf(state));
    if (cs.status === 'idle' || cs.key !== key) {
      cs.key = key; cs.status = 'loading';
      const mine = key;
      FP.customerStore.basket(optsOf(state)).then((res) => {
        if (cs.key !== mine) return;
        cs.result = res; cs.status = 'ready';
        if (state.view === 'crosssell') render(state);
      }).catch((e) => { cs.status = 'error'; cs.error = e.message; if (state.view === 'crosssell') render(state); });
    }
    if (cs.status === 'loading') { el.innerHTML = FP.loader.html('Buscando qué productos se compran juntos…', { key: 'crosssell' }); return; }
    if (cs.status === 'error') { el.innerHTML = `<p class="note note--warn">No pude leer los pedidos (${esc(cs.error || '')}).</p>`; return; }
    const r = cs.result;
    if (!r || r.status === 'no_ledger') {
      el.innerHTML = `<div class="empty"><strong>Todavía no hay pedidos cargados</strong>
        Carga el archivo de <em>Productos · venta</em> con <code>id_pedido</code> (una fila por producto del pedido). Con eso aquí verás qué productos se compran juntos.
        <p class="btn-row"><a class="btn btn--primary" href="#carga" data-nav="carga">Ir a Carga de datos</a>
        <button type="button" class="btn" data-action="p-mock-clientes">Probar con datos de ejemplo</button></p></div>`;
      return;
    }
    if (r.status === 'no_lines') {
      el.innerHTML = `<div class="note note--warn" role="status" data-cs-unavailable="1">Para ver qué productos se compran juntos hay que volver a cargar y guardar ${r.missingFiles && r.missingFiles.length ? `el archivo de ventas (${esc(r.missingFiles.slice(0, 3).join(', '))})` : 'tus archivos de ventas'}: los guardados antes no traen el detalle por producto de cada pedido. No se borra nada; al recargarlo se reemplazan sus pedidos.</div>`;
      return;
    }
    const o = cs.opts, ux = (state.ux.cs = state.ux.cs || { mode: 'full', sum: 'c', fold: {}, meth: false });
    const C = FP.config.products.crossSell, long = ux.sum === 'l', res = R().build(r);
    const chOpts = ['total', ...r.channelsAvailable].map((c) => `<option value="${esc(c)}"${o.channel === c ? ' selected' : ''}>${c === 'total' ? 'Todos los canales' : esc(CH(c))}</option>`).join('');
    const lvOpts = LEVELS.map(([k, l]) => `<option value="${k}"${o.level === k ? ' selected' : ''}>Nivel: ${l}</option>`).join('');
    const rowsS = res.rows.filter((q) => (long ? q[2] : q[1]));
    const t = r.candidates;
    const topbar = `<div class="topbar"><div class="topbar__row"><select aria-label="Canal" data-cs="channel">${chOpts}</select><select aria-label="Nivel" data-cs="level">${lvOpts}</select>
      <div class="seg" role="group" aria-label="Nivel de detalle" style="margin-left:auto"><button type="button" id="cs-m-res" aria-pressed="${ux.mode === 'res'}">Resumen</button><button type="button" id="cs-m-full" aria-pressed="${ux.mode !== 'res'}">Completo</button></div></div></div>`;
    const empty = r.empty;
    const body = empty ? '' : `<section class="intro"><div class="intro__h"><h3>Resumen general</h3><div class="mini" id="cs-md" role="group" aria-label="Versión del resumen"><button type="button" data-v="c" aria-pressed="${!long}">Versión corta</button><button type="button" data-v="l" aria-pressed="${long}">Versión larga</button></div></div>
        <div class="sum${long ? ' sum--l' : ''}" data-cs-summary="1">${rowsS.map((q) => `<div class="sum__r"><span>${esc(q[0])}</span><span>${long ? q[2] : q[1]}</span></div>`).join('')}<div class="sum__f">Descriptivo: muestra qué se compra junto, no por qué. Los umbrales son provisionales y se ajustan en la configuración.</div></div></section>
      <div class="more">
      ${sec('s-b', '¿Qué tan grandes son las canastas?', 'Cuántos productos distintos lleva cada pedido.', dist(r), res.lec.b)}
      ${sec('s-c', 'Candidatos a cross-sell', `Pares de productos que se compran juntos con más frecuencia de la esperada. ${PX().tip('Lift = cuántas veces más probable es que un pedido con A lleve B, comparado con un pedido cualquiera. 1 es azar; 2 es el doble.')}`, cand(r, ux), res.lec.c, sorter('c', ux))}
      ${t.length ? `${anchors(r, ux) ? sec('s-a', 'Productos ancla', `Los productos alrededor de los cuales el pedido vale más. ${PX().tip('Ancla = producto cuyo pedido lleva más venta en el resto de la canasta (sin contarlo). Un producto caro que viaja solo no es ancla.')}`, anchors(r, ux), res.lec.a, sorter('a', ux)) : ''}
      ${r.cats ? sec('s-k', 'Entre categorías', 'Qué categorías se compran juntas. Sirve para pensar cross-sell que no sea del mismo tipo de producto.', cats(r), '') : ''}
      ${byChannel(r) ? sec('s-ch', 'Por canal', 'El mismo par puede funcionar en un canal y no en otro.', byChannel(r), res.lec.ch) : ''}
      ${sec('s-q', '¿Qué hago con esto?', 'Los tres candidatos con más espacio por probar en pesos. Se preparan en Promociones y se miden en Medir y aprender.', actions(r), '')}` : ''}
      <section class="blk foot"><span class="mu">Venta por producto con id_pedido · ${esc(fmtD(r.minDay))} a ${esc(fmtD(r.maxDay))} · ${n0(r.orders)} pedidos</span></section>
      <details class="meth" id="cs-meth"${ux.meth ? ' open' : ''}><summary>Método y definiciones</summary><div class="meth__b"><section class="dsec"><h4>Definiciones</h4><dl class="defs">
        <div><dt>Pedidos juntos</dt><dd>Pedidos que llevan los dos productos. Un producto repetido en el pedido cuenta una vez.</dd></div>
        <div><dt>De cada 100, también lo llevan</dt><dd>Pedidos con A que también llevan B, entre los pedidos con A (confianza).</dd></div>
        <div><dt>Lift</dt><dd>Esa cifra dividida entre el % de pedidos que llevan B en general. 1 = azar.</dd></div>
        <div><dt>Candidato</dt><dd>Par con al menos ${C.minPairs} pedidos juntos, lift de ${C.minLift} o más y ${Math.round(C.minConf * 100)} de cada 100 pedidos con A que llevan B. Se muestra una dirección por par: la de más pedidos con A sin B.</dd></div>
        <div><dt>Producto ancla</dt><dd>Producto con al menos ${C.minAnchorOrders} pedidos, ordenado por el % de sus pedidos que lleva otro producto.</dd></div>
        <div><dt>Nivel</dt><dd>Producto, categoría o SKU: qué se considera «un producto» al contar. Categoría muestra qué tipos se compran juntos; SKU separa presentaciones.</dd></div></dl>
        <p class="cap">Es asociación, no causa: no se sabe si el cliente vio la oferta del segundo producto ni si lo habría comprado sin ella. No se mide margen. La validación de restricciones de venta de cada producto es del equipo.</p></section>
        <section class="dsec"><h4>Datos</h4><dl class="fi"><div><dt>Archivo</dt><dd>Venta por producto con id_pedido</dd></div><div><dt>Periodo cargado</dt><dd>${esc(fmtD(r.minDay))} – ${esc(fmtD(r.maxDay))}</dd></div><div><dt>Pedidos con detalle por producto</dt><dd>${p0(r.coverage)} (${n0(r.withLines)} de ${n0(r.totalOrders)})</dd></div></dl></section></div></details>
      </div>`;
    const html = `<div class="px cs"><div class="app" id="frame" data-mode="${ux.mode}">${topbar}
      <section class="verdict"><p class="eyebrow">Crecer · Cross-sell${empty ? '' : ` · ${esc(MES[+r.minDay.slice(5, 7) - 1])} ${esc(r.minDay.slice(0, 4))} – ${esc(fmtD(r.maxDay))}`}</p><h2>${esc(res.verdict)}</h2>
        ${empty ? '' : `<div class="trust" aria-label="Confiabilidad y contexto">${res.chips.map((c) => `<span class="tchip ${c[0]}" tabindex="0" data-tip="${esc(c[2])}">${esc(c[1])}</span>`).join('')}</div>
        <div class="kpis">${kpi('Pedidos analizados', n0(r.orders), `${p0(r.coverage)} con detalle por producto`)}${kpi('Con 2 o más productos', p0(r.multiShare), `${n0(r.orders * r.multiShare)} pedidos`)}${kpi('Productos por pedido', (r.avgItems || 0).toFixed(1), 'promedio')}${kpi('Venta de esas canastas', p0(r.multiRevShare), 'de la venta total')}${kpi('Pares con señal', String(t.length), `${C.minPairs} pedidos y lift ≥ ${C.minLift}`)}${kpi('Mejor lift', t.length ? t[0].lift.toFixed(1) : '—', t.length ? esc(R().pairLabel(t[0])) : 'sin par que cumpla')}</div>`}</section>${body}</div></div>`;
    el.innerHTML = PX().P(html);
    bind(el, state);
  }

  function bind(el, state) {
    const ux = state.ux.cs, app = el.querySelector('.px-app');
    const hd = document.querySelector('.app-header');
    if (hd) root.document.documentElement.style.setProperty('--pe-top', `${Math.round(hd.getBoundingClientRect().height)}px`);
    const set = (mode) => { ux.mode = mode; app.dataset.mode = mode; const a = $('cs-m-res'), b = $('cs-m-full'); if (a) a.setAttribute('aria-pressed', String(mode === 'res')); if (b) b.setAttribute('aria-pressed', String(mode !== 'res')); };
    if ($('cs-m-res')) { $('cs-m-res').onclick = () => set('res'); $('cs-m-full').onclick = () => set('full'); }
    const meth = $('cs-meth'); if (meth) meth.addEventListener('toggle', () => { ux.meth = meth.open; });
    if (el._csBound) return;
    el._csBound = true;
    el.addEventListener('click', (e) => {
      const st = FP.app && FP.app.state, u = st && st.ux.cs; if (!u) return;
      const keep = () => { const y = root.scrollY; render(st); root.scrollTo(0, y); };
      const sm = e.target.closest('#cs-md button'); if (sm) { u.sum = sm.dataset.v; keep(); return; }
      const so = e.target.closest('[data-cs-sort] button'); if (so) { const k = so.closest('[data-cs-sort]').dataset.csSort; if (k === 'c') u.candBy = so.dataset.v; else u.anchorBy = so.dataset.v; keep(); return; }
      const f = e.target.closest('[data-cs-fold]'); if (f) { u.fold = u.fold || {}; u.fold[f.dataset.csFold] = !u.fold[f.dataset.csFold]; keep(); }
    });
  }

  FP.crosssellView = { render, optsOf };
})(typeof window !== 'undefined' ? window : globalThis);
