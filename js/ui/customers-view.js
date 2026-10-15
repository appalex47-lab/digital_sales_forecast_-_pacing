/**
 * customers-view.js — «Clientes y LTV» (Diagnosticar). Solo pinta lo que calcula FP.customerEngine con el libro de clientes
 * que arma la carga de productos (ID de pedido + ID de cliente). El ID de cliente nunca sale de este navegador.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const F = () => FP.format;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mlabel = (k) => `${MES[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  const pc = (v, d = 1) => (fin(v) ? F().percent(v, d) : '—');
  const mon = (v) => (fin(v) ? F().currency(v, 0) : '—');
  const CH = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const SEG = [['new', 'Nuevos', 'cus-seg--new'], ['recurrent', 'Recurrentes', 'cus-seg--rec'], ['reactivated', 'Reactivados', 'cus-seg--rea']];
  const REACT = [90, 180, 365];

  const optsOf = (state) => { const o = state.cu.opts; return { reactivationDays: o.reactivationDays, warmupDays: o.warmupDays, channel: o.channel === 'total' ? null : o.channel }; };

  function kpi(label, value, sub, help) {
    const esc = H().esc;
    return `<div class="metric-card"><div class="metric-card__head"><span class="metric-card__label">${esc(label)}</span></div><div class="metric-card__value num">${esc(value)}</div>${sub ? `<div class="metric-card__period">${esc(sub)}</div>` : ''}${help ? `<div class="cell-sub">${esc(help)}</div>` : ''}</div>`;
  }

  /** Barras apiladas de venta por segmento; el detalle exacto está en la tabla de abajo. */
  function stackedBars(months) {
    const W = 760, Hh = 220, pl = 52, pb = 26, pt = 10, pr = 8, n = months.length;
    if (!n) return '';
    const max = Math.max(...months.map((m) => m.revenue.total), 1), bw = Math.max(6, Math.min(36, (W - pl - pr) / n - 6)), step = (W - pl - pr) / n;
    const y = (v) => pt + (Hh - pt - pb) * (1 - v / max);
    const bars = months.map((m, i) => {
      let base = 0; const x = pl + i * step + (step - bw) / 2;
      const parts = SEG.map(([k, , cls]) => { const v = m.revenue[k]; const y1 = y(base + v), y0 = y(base); base += v; return v > 0 ? `<rect class="${cls}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}"${m.reliableNew ? '' : ' opacity=".45"'}></rect>` : ''; }).join('');
      const lab = n <= 14 || i % Math.ceil(n / 14) === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${Hh - 8}" text-anchor="middle" class="cus-ax">${mlabel(m.key)}</text>` : '';
      return parts + lab;
    }).join('');
    const ticks = [0, 0.5, 1].map((f) => `<g><line x1="${pl}" x2="${W - pr}" y1="${y(max * f).toFixed(1)}" y2="${y(max * f).toFixed(1)}" class="cus-grid"></line><text x="${pl - 6}" y="${(y(max * f) + 4).toFixed(1)}" text-anchor="end" class="cus-ax">${F().currencyCompact(max * f)}</text></g>`).join('');
    return `<svg class="cus-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Venta mensual dividida en clientes nuevos, recurrentes y reactivados. El detalle está en la tabla.">${ticks}${bars}</svg>
      <p class="cus-legend">${SEG.map(([, l, cls]) => `<span><i class="cus-dot ${cls}"></i>${H().esc(l)}</span>`).join('')}<span class="cell-sub">Las barras claras son meses con histórico insuficiente para distinguir «nuevo».</span></p>`;
  }

  function monthlyTable(months) {
    const esc = H().esc;
    const rows = months.slice().reverse().map((m) => `<tr${m.reliableNew ? '' : ' class="cus-weak"'}><td><strong>${esc(mlabel(m.key))}</strong>${m.reliableNew ? '' : ` <span class="cell-sub" title="El archivo cubre solo ${m.historyDays} días antes de este mes: un cliente que compró antes de lo cargado aparece como nuevo.">histórico insuficiente</span>`}</td>
      <td class="num">${esc(F().integer(m.customers.new))}</td><td class="num">${esc(F().integer(m.customers.recurrent))}</td><td class="num">${esc(F().integer(m.customers.reactivated))}</td>
      <td class="num">${esc(mon(m.revenue.new))}</td><td class="num">${esc(mon(m.revenue.recurrent))}</td><td class="num">${esc(mon(m.revenue.reactivated))}</td>
      <td class="num">${esc(pc(m.newShareRevenue))}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Mes</th><th class="num">Clientes nuevos</th><th class="num">Recurrentes</th><th class="num">Reactivados</th><th class="num">Venta nuevos</th><th class="num">Venta recurrentes</th><th class="num">Venta reactivados</th><th class="num">% venta de nuevos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const heat = (v) => (fin(v) ? `style="background:rgba(31,95,224,${(0.08 + Math.min(1, v) * 0.55).toFixed(2)})"` : '');

  function cohortTables(r) {
    const esc = H().esc, W = r.options.windows;
    const wl = (d) => `${d} d`;
    const head = `<tr><th>Cohorte</th><th class="num">Clientes</th>${W.map((d) => `<th class="num" title="Venta acumulada por cliente en los primeros ${d} días (incluye el primer pedido)">LTV ${wl(d)}</th>`).join('')}${W.slice(0, 4).map((d) => `<th class="num" title="% de clientes con otro pedido dentro de ${d} días del primero">Repite ${wl(d)}</th>`).join('')}</tr>`;
    const rowOf = (label, size, wins, extra = '') => `<tr${extra}><td><strong>${label}</strong></td><td class="num">${esc(F().integer(size))}</td>${wins.map((w) => `<td class="num">${w.mature > 0 ? esc(mon(w.ltv)) : '<span class="cell-sub">—</span>'}</td>`).join('')}${wins.slice(0, 4).map((w) => `<td class="num">${w.mature > 0 ? esc(pc(w.repeatRate)) : '<span class="cell-sub">—</span>'}</td>`).join('')}</tr>`;
    const rows = r.cohorts.slice().reverse().map((c) => rowOf(`${esc(mlabel(c.key))}${c.small ? ' <span class="cell-sub" title="Menos clientes que el mínimo: léelo con cuidado">pocos</span>' : ''}${c.reliable ? '' : ' <span class="cell-sub">hist. insuficiente</span>'}`, c.size, c.windows, c.reliable ? '' : ' class="cus-weak"')).join('');
    const pooled = rowOf('Todas las cohortes', r.cohorts.reduce((s, c) => s + c.size, 0), r.pooled, ' class="cus-total"');
    const ret = r.cohorts.slice().reverse().map((c) => `<tr${c.reliable ? '' : ' class="cus-weak"'}><td><strong>${esc(mlabel(c.key))}</strong></td><td class="num">${esc(F().integer(c.size))}</td>${c.retention.slice(1).map((v) => `<td class="num" ${heat(v)}>${fin(v) ? esc(pc(v, 0)) : ''}</td>`).join('')}</tr>`).join('');
    const rh = `<tr><th>Cohorte</th><th class="num">Clientes</th>${Array.from({ length: r.options.maxOffsets }, (_, k) => `<th class="num">Mes ${k + 1}</th>`).join('')}</tr>`;
    return { ltv: `<div class="table-wrap"><table class="table ds-table"><thead>${head}</thead><tbody>${pooled}${rows}</tbody></table></div>`,
      ret: `<div class="table-wrap"><table class="table ds-table cus-heat"><thead>${rh}</thead><tbody>${ret}</tbody></table></div>` };
  }

  function channelTable(r) {
    const esc = H().esc, W = r.options.windows, i90 = W.indexOf(90), i180 = W.indexOf(180);
    const rows = r.byFirstChannel.map((c) => `<tr><td><strong>${esc(CH(c.channel))}</strong></td><td class="num">${esc(F().integer(c.size))}</td>
      <td class="num">${c.windows[i90].mature ? esc(pc(c.windows[i90].repeatRate)) : '—'}</td><td class="num">${c.windows[i90].mature ? esc(mon(c.windows[i90].ltv)) : '—'}</td><td class="num">${c.windows[i180].mature ? esc(mon(c.windows[i180].ltv)) : '—'}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Canal del primer pedido</th><th class="num">Clientes</th><th class="num">Repite en 90 d</th><th class="num">LTV 90 d</th><th class="num">LTV 180 d</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function render(state) {
    const el = $('cus-body'); if (!el) return;
    const esc = H().esc, cu = state.cu;
    const key = JSON.stringify(optsOf(state));
    if (cu.status === 'idle' || cu.key !== key) {
      cu.key = key; cu.status = 'loading';
      const mine = key;
      Promise.all([FP.customerStore.info(), FP.customerStore.analyze(optsOf(state))]).then(([info, res]) => {
        if (cu.key !== mine) return;
        cu.info = info; cu.result = res; cu.status = 'ready';
        if (state.view === 'clientes') render(state);
      }).catch((e) => { cu.status = 'error'; cu.error = e.message; if (state.view === 'clientes') render(state); });
    }
    if (cu.status === 'loading') { el.innerHTML = '<p class="note" role="status">Calculando clientes…</p>'; return; }
    if (cu.status === 'error') { el.innerHTML = `<p class="note note--warn">No pude leer el libro de clientes (${esc(cu.error || '')}).</p>`; return; }
    const r = cu.result;
    if (!r || r.status !== 'ok') {
      el.innerHTML = `<div class="empty"><strong>Todavía no hay clientes cargados</strong>
        Carga el archivo de <em>Productos · venta</em> con dos columnas más: <code>id_pedido</code> e <code>id_cliente</code> (el ID debe venir anonimizado desde tu sistema; nunca nombre, correo ni teléfono).
        Una fila por producto del pedido. Con eso aquí verás clientes nuevos, recurrentes y reactivados, retención y valor del cliente (LTV).
        <p class="btn-row"><a class="btn btn--primary" href="#carga" data-nav="carga">Ir a Carga de datos</a>
        <button type="button" class="btn" data-action="p-mock-clientes">Probar con datos de ejemplo</button></p></div>`;
      return;
    }
    const s = r.summary, o = cu.opts;
    const chOpts = ['total', ...r.channelsAvailable].map((c) => `<option value="${esc(c)}"${o.channel === c ? ' selected' : ''}>${c === 'total' ? 'Todos los canales' : esc(CH(c))}</option>`).join('');
    const rea = REACT.map((d) => `<option value="${d}"${o.reactivationDays === d ? ' selected' : ''}>${d} días</option>`).join('');
    const warm = r.monthly.filter((m) => !m.reliableNew).length;
    const t = cohortTables(r);
    el.innerHTML = `
      <p class="field__hint">Datos de ${esc(mlabel(r.minDay))} a ${esc(r.maxDay)} · ${esc(F().integer(s.orders))} pedidos de ${esc(F().integer(s.customers))} clientes. Vive solo en este navegador: el ID de cliente no se sube a la nube.</p>
      <div class="cus-controls">
        <label class="field"><span class="field__label">Canal</span><select data-cu="channel">${chOpts}</select></label>
        <label class="field"><span class="field__label">Reactivado = vuelve tras más de</span><select data-cu="reactivationDays">${rea}</select></label>
      </div>
      ${warm ? `<p class="note note--warn" role="status">${warm} ${warm === 1 ? 'mes tiene' : 'meses tienen'} histórico insuficiente (menos de ${o.warmupDays} días de datos antes): ahí un cliente que ya compraba aparece como «nuevo». Cargar el año anterior lo corrige.</p>` : ''}
      <div class="chg-kpis">
        ${kpi('Clientes', F().integer(s.customers), `${F().decimal(s.ordersPerCustomer, 2)} pedidos por cliente`)}
        ${kpi('Compran más de una vez', pc(s.repeatRate), `${F().integer(s.repeatCustomers)} clientes`)}
        ${kpi('Venta de clientes que repiten', pc(s.repeatRevenueShare), 'venta de pedidos que no son el primero')}
        ${kpi('Entre un pedido y el siguiente', fin(s.medianDaysBetweenOrders) ? `${F().integer(s.medianDaysBetweenOrders)} días` : '—', 'mediana de quienes repiten')}
        ${kpi('Venta por cliente', mon(s.revenuePerCustomer), 'en todo el histórico cargado')}
        ${kpi('Compran en más de un canal', pc(s.multiChannelRate), `${F().integer(s.multiChannelCustomers)} clientes`)}
      </div>
      <section class="panel" aria-labelledby="cus-t-m"><div class="panel__head"><div><h2 class="panel__title" id="cus-t-m">Nuevos, recurrentes y reactivados por mes</h2>
        <p class="panel__desc">Cada cliente cuenta en el segmento de su primer pedido del mes.</p></div></div>
        <div class="panel__body">${stackedBars(r.monthly)}${monthlyTable(r.monthly)}</div></section>
      <section class="panel" aria-labelledby="cus-t-l"><div class="panel__head"><div><h2 class="panel__title" id="cus-t-l">Valor del cliente (LTV) por cohorte</h2>
        <p class="panel__desc">Cohorte = mes del primer pedido. Solo cuentan clientes a los que ya les pasaron esos días: un «—» significa que aún no se puede medir.</p></div></div>
        <div class="panel__body panel__body--flush">${t.ltv}</div></section>
      <section class="panel" aria-labelledby="cus-t-r"><div class="panel__head"><div><h2 class="panel__title" id="cus-t-r">Retención por mes</h2>
        <p class="panel__desc">% de la cohorte que vuelve a comprar en cada mes siguiente a su primer pedido.</p></div></div>
        <div class="panel__body panel__body--flush">${t.ret}</div></section>
      <section class="panel" aria-labelledby="cus-t-c"><div class="panel__head"><div><h2 class="panel__title" id="cus-t-c">Por canal del primer pedido</h2></div></div>
        <div class="panel__body panel__body--flush">${channelTable(r)}</div></section>
      <details class="disclosure"><summary>Cómo se calcula</summary><div class="panel__body">
        <p><strong>Nuevo</strong>: su primer pedido en el histórico cargado. <strong>Recurrente</strong>: ya había comprado y vuelve en menos de ${o.reactivationDays} días. <strong>Reactivado</strong>: vuelve tras más de ${o.reactivationDays} días sin pedidos (en farmacia, un tratamiento crónico se resurte cada 30 a 90 días; ${o.reactivationDays} días equivale a perder al menos dos resurtidos).</p>
        <p><strong>LTV a N días</strong>: venta acumulada por cliente en los N días desde su primer pedido, incluido el primero. <strong>Repite</strong>: otro pedido en un día distinto dentro de esos N días. Solo entran clientes maduros (su primer pedido es anterior al último dato por más de N días).</p>
        <p>Las compras sin ID de cliente válido (vacío, 0, null, invitado) y las líneas sin ID de pedido no entran aquí, pero sí cuentan en Productos. El ID de cliente se toma tal cual del archivo: si un mismo cliente tiene IDs distintos por canal, se contará como dos.</p></div></details>`;
  }

  FP.customersView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
