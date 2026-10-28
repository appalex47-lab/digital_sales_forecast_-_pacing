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
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mlabel = (k) => `${MES[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  const CH = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const REACT = [90, 180, 365];

  const FKEYS = ['category', 'subcategory', 'product', 'state', 'branch'];
  const activeFilter = (o) => { const f = {}; FKEYS.forEach((k) => { if (o.filter && o.filter[k]) f[k] = o.filter[k]; }); return f; };
  /* Con selección (categoría, producto, sucursal…), nuevo / cohorte / LTV se miden con las compras de esa selección. */
  const optsOf = (state) => { const o = state.cu.opts, f = activeFilter(o); const base = { reactivationDays: o.reactivationDays, warmupDays: o.warmupDays, channel: o.channel === 'total' ? null : o.channel };
    return Object.keys(f).length ? { ...base, filter: f, scope: 'selection' } : base; };

  /** Opciones en cascada (categoría → subcategoría → producto; estado → sucursal) con el catálogo y la geografía ya cargados. */
  function filterOptions(o) {
    const PS = FP.productStore, f = o.filter || {}, cat = PS && PS.catalog ? PS.catalog.list : [];
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
    const inCat = cat.filter((c) => (!f.category || c.category === f.category) && (!f.subcategory || c.subcategory === f.subcategory));
    let geo = { states: [], branches: [] };
    try { geo = PS.geoOptions({ state: f.state || undefined }); } catch (e) { /* sin geografía */ }
    return { category: uniq(cat.map((c) => c.category)), subcategory: uniq(cat.filter((c) => !f.category || c.category === f.category).map((c) => c.subcategory)),
      product: uniq(inCat.map((c) => c.product || c.sku)), state: geo.states || [], branch: (geo.branches || []).map((b) => b.code) };
  }

  /* ---------- Piezas de la página (versión B: clases px-, estilos en css/px.css y design-system.css) ---------- */
  const R = () => FP.cusResumen;
  const PX = () => FP.pxView;
  const lab = mlabel;
  const n0 = (v) => Math.round(v).toLocaleString('es-MX');
  const p1 = (v) => (fin(v) ? `${(v * 100).toFixed(1)} %` : '—');
  const M0 = (v) => (fin(v) ? '$' + Math.round(v).toLocaleString('es-MX') : '—');
  const K1 = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)} M` : `$${Math.round(v / 1e3).toLocaleString('es-MX')} K`);
  const NA = '<span class="na">—</span>';
  const MAXM = 12;

  function sec(id, t, cap, body, lec) {
    return `<section class="blk" id="${id}"><div class="blk__h"><h3>${t}</h3><span class="cap">${cap}</span></div>${body}${lec ? `<p class="lec">${lec}</p>` : ''}</section>`;
  }
  /** Tabla plegable: se ven 6 filas y «Ver todas» muestra el resto (las filas sobrantes llevan la clase x). */
  function fold(key, ux, table, total, noun, plural) {
    const open = Boolean(ux.fold && ux.fold[key]);
    return `<div class="tw${open ? ' open' : ''}">${table}${total > 6 ? `<div class="tf"><span class="mu">${open ? plural : `6 ${noun}`}</span><button type="button" class="lk" data-cu-fold="${key}">${open ? 'Ver solo 6' : 'Ver todas'}</button></div>` : ''}</div>`;
  }
  const kpi = (l, v, s, tp) => `<div class="kpi"><div class="kpi__l">${l}${tp ? PX().tip(tp) : ''}</div><div class="kpi__v num">${v}</div><div class="kpi__d mu" style="font-weight:500">${s}</div></div>`;

  function activeBlock(rec, cfg) {
    if (!rec) return '';
    const T = rec.total, w = (v) => `${(v / T * 100).toFixed(1)}%`;
    return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;gap:2px" role="img" aria-label="Clientes activos, en riesgo y perdidos"><i style="width:${w(rec.active)};background:var(--ok)"></i><i style="width:${w(rec.risk)};background:var(--warn)"></i>${rec.lostOk && rec.lost ? `<i style="width:${w(rec.lost)};background:var(--bad)"></i>` : ''}</div>
      <div class="act3"><div><b>${n0(rec.active)}</b><span>Activos · compraron en los últimos ${cfg.activeDays} días (${p1(rec.active / T)})</span></div>
      <div><b>${n0(rec.risk)}</b><span>En riesgo · último pedido hace ${cfg.activeDays} a ${cfg.riskDays} días (${p1(rec.risk / T)})</span></div>
      <div><b>${rec.lostOk ? n0(rec.lost) : NA}</b><span>${rec.lostOk ? `Perdidos · más de ${cfg.riskDays} días sin pedido (${p1(rec.lost / T)})` : 'Perdidos · aún no se pueden medir'}</span></div></div>`;
  }

  function bars(r, ux, open) {
    const ms = r.monthly.slice(-MAXM), v = ux.view === 'v';
    const vals = (m) => (v ? [m.revenue.new, m.revenue.recurrent, m.revenue.reactivated] : [m.customers.new, m.customers.recurrent, m.customers.reactivated]);
    const mx = Math.max(1, ...ms.map((m) => vals(m).reduce((a, b) => a + b, 0)));
    const last = ms.length - 1, h = (x) => `${(x / mx * 100).toFixed(1)}%`;
    const cols = ms.map((m, i) => { const q = vals(m), t = q[0] + q[1] + q[2], cur = open && i === last;
      return `<div class="bars__c" title="${esc(lab(m.key))}${cur ? ' (en curso)' : ''}: ${v ? K1(t) + ' de venta' : n0(t) + ' clientes'}"><i style="height:${h(q[2])};background:var(--ok)"></i><i style="height:${h(q[1])};background:var(--ink2)"></i><i style="height:${h(q[0])};background:var(--accent)${m.reliableNew ? '' : ';opacity:.45'}"></i></div>`; }).join('');
    return `<div class="bars" style="--n:${ms.length}" role="img" aria-label="${v ? 'Venta' : 'Clientes'} por mes y tipo de cliente">${cols}</div>
      <div class="bars__l" style="--n:${ms.length}">${ms.map((m, i) => `<span>${esc(lab(m.key).split(' ')[0])}${open && i === last ? '*' : ''}</span>`).join('')}</div>
      <div class="key"><span><i style="background:var(--accent)"></i>Nuevos</span><span><i style="background:var(--ink2)"></i>Recurrentes</span><span><i style="background:var(--ok)"></i>Recuperados</span><span class="mu">${open ? '* mes en curso · ' : ''}barras tenues: histórico insuficiente</span></div>`;
  }
  function monthTable(r, ux, open) {
    const v = ux.view === 'v', f = v ? K1 : n0, ms = r.monthly.slice().reverse();
    const body = ms.map((m, i) => { const q = v ? [m.revenue.new, m.revenue.recurrent, m.revenue.reactivated] : [m.customers.new, m.customers.recurrent, m.customers.reactivated];
      return `<tr class="${i >= 6 ? 'x' : ''}${m.reliableNew ? '' : ' weak'}"><td>${esc(lab(m.key))}${open && i === 0 ? ' <span class="mu">(en curso)</span>' : ''}</td><td class="num">${f(q[0])}${m.reliableNew ? '' : `<span title="El archivo cubre solo ${m.historyDays} días antes de este mes: un cliente que compró antes de lo cargado aparece como nuevo.">*</span>`}</td><td class="num">${f(q[1])}</td><td class="num">${f(q[2])}</td><td class="num">${v || !fin(m.lapsed) ? NA : n0(m.lapsed)}</td></tr>`; }).join('');
    return fold('m', ux, `<table class="dtab"><thead><tr><th>Mes</th><th>Nuevos</th><th>Recurrentes</th><th>Recuperados</th><th>No regresaron</th></tr></thead><tbody>${body}</tbody></table>`, ms.length, 'meses', 'todos');
  }
  function ltvTable(r, ux) {
    const W = r.options.windows, rows = r.cohorts.slice().reverse();
    const body = rows.map((c, i) => `<tr class="${i >= 6 ? 'x' : ''}"><td>${esc(lab(c.key))}${c.size < r.options.minCohort ? ' <span class="mu">(chica)</span>' : ''}${c.reliable ? '' : ' <span class="mu">(hist. insuf.)</span>'}</td><td class="num">${n0(c.size)}</td>${c.windows.map((w) => `<td class="num">${w.mature > 0 ? M0(w.ltv) : NA}</td>`).join('')}</tr>`).join('');
    return fold('l', ux, `<table class="dtab"><thead><tr><th>Cohorte</th><th>Clientes</th>${W.map((d) => `<th>${d} días</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`, rows.length, 'cohortes', 'todas');
  }
  function retTable(r, ux) {
    const rows = r.cohorts.slice().reverse(), K = [1, 2, 3, 4, 5, 6];
    const vals = rows.flatMap((c) => K.map((k) => c.retention[k])).filter(fin), mx = Math.max(0.01, ...vals);
    const body = rows.map((c, i) => `<tr class="${i >= 6 ? 'x' : ''}"><td>${esc(lab(c.key))}</td>${K.map((k) => { const v = c.retention[k]; return fin(v) ? `<td class="num hc" style="background:rgba(31,95,224,${(0.06 + v / mx * 0.34).toFixed(2)})"><b>${(v * 100).toFixed(0)} %</b></td>` : `<td class="num na">—</td>`; }).join('')}</tr>`).join('');
    return fold('r', ux, `<table class="heat"><thead><tr><th>Cohorte</th>${K.map((k) => `<th>Mes +${k}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`, rows.length, 'cohortes', 'todas');
  }
  function chTable(r) {
    const min = r.options.minCohort, body = (r.byFirstChannel || []).map((c) => { const w3 = c.windows[3], w2 = c.windows[2];
      return `<tr><td class="nm">${esc(CH(c.channel))}</td><td class="num">${n0(c.size)}${c.size < min ? ' <span class="mu">(chico)</span>' : ''}</td><td class="num">${w3.mature > 0 ? M0(w3.ltv) : NA}</td><td class="num">${w2.mature > 0 ? p1(w2.repeatRate) : NA}</td></tr>`; }).join('');
    return `<div class="tw"><table class="dtab"><thead><tr><th>Canal del primer pedido</th><th>Clientes</th><th>LTV a 180 días</th><th>Retención a 90 días</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function chanBlock(x, cfg) {
    if (!x) return '<p class="cap">Con un canal elegido no hay cruce entre canales. Elige «Todos los canales» para ver cómo compran los clientes en varios.</p>';
    const tot = x.totalCustomers, name = (id) => CH(id);
    const t1 = `<div class="tw"><table class="dtab"><thead><tr><th>Canales que usa</th><th>Clientes</th><th>%</th><th>Pedidos</th><th>Venta</th></tr></thead><tbody>${x.byCount.map((q) => `<tr><td>${q.n === 1 ? '1 canal' : q.n + ' canales'}</td><td class="num">${n0(q.customers)}</td><td class="num">${p1(q.customers / tot)}</td><td class="num">${q.ordersPerCustomer.toFixed(1)}</td><td class="num">${M0(q.revenuePerCustomer)}</td></tr>`).join('')}</tbody></table></div>`;
    const t1b = x.combos.length ? `<div class="tw"><table class="dtab"><thead><tr><th>Combinación más común</th><th>Clientes</th><th>%</th></tr></thead><tbody>${x.combos.map((q) => `<tr><td>${esc(q.channels.map(name).join(' + '))}</td><td class="num">${n0(q.customers)}${q.customers < 30 ? ' <span class="mu">(chico)</span>' : ''}</td><td class="num">${p1(q.customers / tot)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="cap">Todavía no hay clientes que compren en más de un canal.</p>';
    let t2;
    if (!x.matrix) t2 = `<p class="cap">Con menos de ${cfg.riskDays} días de historia el canal del primer pedido todavía no es confiable: la tabla de migración se muestra cuando haya historia suficiente.</p>`;
    else {
      const m = x.matrix;
      t2 = `<div class="tw"><table class="dtab"><thead><tr><th>Entró por ↓ · hoy compra por →</th>${m.channels.map((c) => `<th>${esc(name(c))}</th>`).join('')}<th>Clientes</th></tr></thead><tbody>${m.cells.map((row, i) => { const rt = row.reduce((a, b) => a + b, 0);
        return `<tr><td class="nm">${esc(name(m.channels[i]))}</td>${row.map((v, j) => { const pp = rt ? v / rt : 0, off = i !== j && pp >= cfg.migrateShare && rt >= cfg.migrateMinRow; return `<td class="num"${off ? ' style="background:var(--accent-soft);font-weight:700"' : i === j ? ' style="font-weight:600"' : ''}>${p1(pp)} <span class="mu" style="font-weight:400">(${n0(v)})</span></td>`; }).join('')}<td class="num">${n0(rt)}${rt < cfg.migrateMinRow ? ' <span class="mu">(chico)</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="cap">Solo clientes activos: compraron en los últimos ${cfg.riskDays} días (${n0(m.active)}). «Hoy» es el canal de su último pedido. En azul, quienes migraron a otro canal (${Math.round(cfg.migrateShare * 100)} % o más de su fila, con ${cfg.migrateMinRow} clientes o más). <b>Canal de entrada = canal del primer pedido; no es atribución de marketing.</b> Si un cliente tiene IDs distintos por canal, aquí parecerá que no cruza.</p>`;
    }
    return `<h4>¿Cuántos compran en más de un canal? <span class="mu" style="font-weight:400">Pedidos y venta son por cliente.</span></h4><div class="pareto" style="align-items:start;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)">${t1}${t1b}</div><h4 style="margin-top:6px">¿Por qué canal entraron y por cuál compran hoy?</h4>${t2}`;
  }
  function concBlock(cc) {
    const pts = cc.curve.map((v, i) => `${(30 + i / 50 * 270).toFixed(1)},${(130 - v * 115).toFixed(1)}`).join(' ');
    const svg = `<svg viewBox="0 0 320 160" role="img" aria-label="Curva de concentración de la venta por cliente"><line x1="30" y1="130" x2="300" y2="130" stroke="var(--line)"/><line x1="30" y1="15" x2="30" y2="130" stroke="var(--line)"/><line x1="30" y1="130" x2="300" y2="15" stroke="var(--line)" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/><circle cx="${30 + 0.1 * 270}" cy="${(130 - cc.top10 * 115).toFixed(1)}" r="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><text x="${30 + 0.1 * 270 + 8}" y="${(130 - cc.top10 * 115 + 4).toFixed(1)}">10 % → ${Math.round(cc.top10 * 100)} %</text><text x="30" y="146">0 %</text><text x="300" y="146" text-anchor="end">100 % de los clientes</text><text x="34" y="24">100 %</text></svg>`;
    const tb = `<div class="tw"><table class="dtab"><thead><tr><th>Los clientes que más compran</th><th>% de la venta</th></tr></thead><tbody>${cc.tops.map((q) => `<tr><td>El ${Math.round(q.p * 100)} %</td><td class="num">${Math.round(q.share * 100)} %</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="pareto"><div>${svg}<p class="cap">La línea punteada sería un reparto parejo: todos los clientes aportan lo mismo.</p></div>${tb}</div>`;
  }

  const FLABEL = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', state: 'Estado', branch: 'Sucursal' };
  function filterGroups(state) {
    const esc = H().esc, o = state.cu.opts, opts = filterOptions(o);
    if (!opts.category.length && !opts.state.length) return [];
    const sel = (k) => `<label class="field"><span class="field__label">${FLABEL[k]}</span><select data-cu-f="${k}"><option value="">Todas</option>${opts[k].map((v) => `<option value="${esc(v)}"${o.filter && o.filter[k] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    return [{ title: 'Producto', html: ['category', 'subcategory', 'product'].map(sel).join('') }, { title: 'Ubicación', html: ['state', 'branch'].map(sel).join('') }];
  }
  function filtersHtml(state) {
    const esc = H().esc, o = state.cu.opts, opts = filterOptions(o);
    if (!opts.category.length && !opts.state.length) return '';
    const sel = (k) => `<label class="field"><span class="field__label">${FLABEL[k]}</span><select data-cu-f="${k}"><option value="">Todas</option>${opts[k].map((v) => `<option value="${esc(v)}"${o.filter && o.filter[k] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const act = activeFilter(o), chips = Object.keys(act).map((k) => ({ key: 'cu:' + k, text: `${FLABEL[k]}: ${act[k]}` }));
    return `<div class="cus-filters" data-cus-filters="1">${FP.filterShell.html({ page: 'cu', open: Boolean(state.fs && state.fs.cu), chips, primary: '', groups: [
      { title: 'Producto', html: ['category', 'subcategory', 'product'].filter((k) => FKEYS.includes(k)).map(sel).join('') },
      { title: 'Ubicación', html: FKEYS.filter((k) => !['category', 'subcategory', 'product'].includes(k)).map(sel).join('') }] })}</div>`;
  }

  function render(state) {
    const el = $('cus-body'); if (!el) return;
    const esc2 = H().esc, cu = state.cu;
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
    if (cu.status === 'loading') { el.innerHTML = FP.loader.html('Calculando clientes y LTV desde los datos guardados…', { key: 'clientes' }); return; }
    if (cu.status === 'error') { el.innerHTML = `<p class="note note--warn">No pude leer el libro de clientes (${esc2(cu.error || '')}).</p>`; return; }
    const r = cu.result;
    const hasF = Object.keys(activeFilter(cu.opts)).length > 0;
    if (hasF && r && (r.status === 'filter_unavailable' || r.reason === 'empty_selection')) {
      el.innerHTML = `${filtersHtml(state)}<div class="note note--warn" role="status" data-cus-unavailable="1">${r.status === 'filter_unavailable'
        ? `Para ver los clientes de esta selección hay que volver a cargar y guardar ${r.missingFiles && r.missingFiles.length ? `el archivo de ventas (${esc2(r.missingFiles.slice(0, 3).join(', '))})` : 'tus archivos de ventas'}: los guardados antes no traen el detalle por producto de cada pedido. No se borra nada; al recargarlo se reemplazan sus pedidos.`
        : 'Ningún cliente compró esta combinación (canal y selección). Cambia o quita algún filtro.'}</div>`;
      return;
    }
    if (!r || r.status !== 'ok') {
      el.innerHTML = `<div class="empty"><strong>Todavía no hay clientes cargados</strong>
        Carga el archivo de <em>Productos · venta</em> con dos columnas más: <code>id_pedido</code> e <code>id_cliente</code> (el ID debe venir anonimizado desde tu sistema; nunca nombre, correo ni teléfono).
        Una fila por producto del pedido. Con eso aquí verás clientes nuevos, recurrentes y reactivados, retención y valor del cliente (LTV).
        <p class="btn-row"><a class="btn btn--primary" href="#carga" data-nav="carga">Ir a Carga de datos</a>
        <button type="button" class="btn" data-action="p-mock-clientes">Probar con datos de ejemplo</button></p></div>`;
      return;
    }
    const o = cu.opts, s = r.summary, cfg = FP.config.products.customers.summary;
    const ux = (state.ux.cu = state.ux.cu || { mode: 'full', sum: 'c', view: 'c', fold: {}, meth: false });
    const long = ux.sum === 'l', res = R().build(r, { info: cu.info });
    const chOpts = ['total', ...r.channelsAvailable].map((c) => `<option value="${esc2(c)}"${o.channel === c ? ' selected' : ''}>${c === 'total' ? 'Todos los canales' : esc2(CH(c))}</option>`).join('');
    const rea = REACT.map((d) => `<option value="${d}"${o.reactivationDays === d ? ' selected' : ''}>Reactivado = vuelve tras más de ${d} días</option>`).join('');
    const nF = Object.keys(activeFilter(o)).length;
    const shell = FP.filterShell.html({ page: 'cu', open: Boolean(state.fs && state.fs.cu), noToggle: true, chips: Object.keys(activeFilter(o)).map((k) => ({ key: 'cu:' + k, text: `${FLABEL[k]}: ${activeFilter(o)[k]}` })), primary: '', groups: filterGroups(state) });
    const x = r.extras || {}, rec = x.recency, cc = x.concentration, open = res.open;
    const sel = hasF ? `<p class="cap" data-cus-selection="1"><b>Clientes de esta selección${o.channel !== 'total' ? ` en ${esc2(CH(o.channel))}` : ''}.</b> Aquí cada cliente se mide solo con sus compras de esta selección: «nuevo» es su primera compra de ella, la cohorte es el mes de esa primera compra y el LTV es la venta de la selección por cliente. Para saber si ya era cliente de la empresa, quita los filtros.</p>` : '';
    const rowsS = res.rows.filter((q) => (long ? q[2] : q[1]));
    const fmtD = (iso) => { const [yy, mm, dd] = iso.split('-'); return `${MES[+mm - 1]} ${+dd} de ${yy}`; };
    const defs = [['Nuevo', hasF ? 'Su primera compra de esta selección. Solo es confiable con 180 días de datos antes de ese mes.' : `Su primer pedido en el histórico cargado. Solo es confiable con ${o.warmupDays} días de datos antes de ese mes.`],
      ['Recurrente', `Ya había comprado y vuelve en menos de ${o.reactivationDays} días.`], ['Reactivado', `Vuelve tras más de ${o.reactivationDays} días sin pedidos (en farmacia, un tratamiento crónico se resurte cada 30 a 90 días; ${o.reactivationDays} días equivale a perder al menos dos resurtidos).`],
      ['No regresaron', 'Compraron el mes anterior y no este. Descriptivo; en un mes en curso puede subir al cerrar.'], ['LTV a N días', 'Venta acumulada por cliente en los N días desde su primer pedido, incluido el primero. Solo entran cohortes maduras. Es venta, no margen.'],
      ['Retención a N días', '% de la cohorte con otro pedido, en otro día, dentro de esos N días.'], ['Activo, en riesgo, perdido', `Según hace cuánto fue su último pedido: hasta ${cfg.activeDays} días, de ${cfg.activeDays} a ${cfg.riskDays}, o más de ${cfg.riskDays}.`]];
    const files = ((cu.info && cu.info.batches) || []).map((b) => b.fileName || b.id).filter(Boolean);
    const html = `<div class="px cu"><div class="app" id="frame" data-mode="${ux.mode}">
      <div class="topbar"><div class="topbar__row"><select aria-label="Canal" data-cu="channel">${chOpts}</select><select aria-label="Reactivado" data-cu="reactivationDays">${rea}</select>
        <button type="button" class="btn" data-action="fs-toggle" data-fs-page="cu" aria-expanded="${Boolean(state.fs && state.fs.cu)}" aria-controls="fs-cu">⚙ Filtros${nF ? ` · ${nF}` : ''}</button>
        <div class="seg" role="group" aria-label="Nivel de detalle" style="margin-left:auto"><button type="button" id="cu-m-res" aria-pressed="${ux.mode === 'res'}">Resumen</button><button type="button" id="cu-m-full" aria-pressed="${ux.mode !== 'res'}">Completo</button></div></div></div>@@SHELL@@
      <section class="verdict"><p class="eyebrow">Clientes y LTV · ${esc2(lab(r.minDay.slice(0, 7)))} – ${esc2(fmtD(r.maxDay))}</p><h2>${esc2(res.verdict)}</h2>
        <div class="trust" aria-label="Confiabilidad y contexto">${res.chips.map((c) => `<span class="tchip ${c[0]}" tabindex="0" data-tip="${esc2(c[2])}">${esc2(c[1])}</span>`).join('')}</div>${sel}
        <div class="kpis">${kpi('Clientes', n0(s.customers), `${s.ordersPerCustomer.toFixed(1)} pedidos por cliente`)}${kpi('Compran más de una vez', p1(s.repeatRate), `${n0(s.repeatCustomers)} clientes`)}${kpi('Venta de quienes repiten', p1(s.repeatRevenueShare), 'de la venta total', 'Venta de pedidos que no son el primero.')}${kpi('Entre pedidos', fin(s.medianDaysBetweenOrders) ? `${Math.round(s.medianDaysBetweenOrders)} días` : '—', 'mediana de quienes repiten')}${kpi('Venta por cliente', M0(s.revenuePerCustomer), 'en todo el histórico')}${kpi('Más de un canal', p1(s.multiChannelRate), `${n0(s.multiChannelCustomers)} clientes`)}</div></section>
      <section class="intro"><div class="intro__h"><h3>Resumen general</h3><div class="mini" id="cu-md" role="group" aria-label="Versión del resumen"><button type="button" data-v="c" aria-pressed="${!long}">Versión corta</button><button type="button" data-v="l" aria-pressed="${long}">Versión larga</button></div></div>
        <div class="sum${long ? ' sum--l' : ''}" data-cus-summary="1">${rowsS.map((q) => `<div class="sum__r"><span>${esc2(q[0])}</span><span>${long ? q[2] : q[1]}</span></div>`).join('')}<div class="sum__f">Descriptivo: muestra qué cambió en la base de clientes, no por qué. Los umbrales son provisionales y se ajustan en la configuración.</div></div></section>
      <div class="more">
      ${rec ? sec('s-a', '¿Cuántos siguen comprando?', 'Clientes según hace cuánto hicieron su último pedido.', activeBlock(rec, cfg), res.lec.a) : ''}
      <section class="blk" id="s-m"><div class="blk__h"><h3>${ux.view === 'v' ? 'Venta por tipo de cliente y mes' : 'Nuevos, recurrentes y recuperados por mes'}</h3><span class="cap">${ux.view === 'v' ? 'Venta de cada segmento; el tipo es el del cliente en ese mes.' : 'Cada cliente cuenta en el segmento de su primer pedido del mes.'}</span><div class="mini" id="cu-vw" role="group" aria-label="Ver por" style="margin-left:auto"><button type="button" data-v="c" aria-pressed="${ux.view !== 'v'}">Clientes</button><button type="button" data-v="v" aria-pressed="${ux.view === 'v'}">Venta</button></div></div>${bars(r, ux, open)}${monthTable(r, ux, open)}${res.lec.m ? `<p class="lec">${res.lec.m}</p>` : ''}</section>
      ${sec('s-l', 'Valor del cliente (LTV) por cohorte', `Venta acumulada por cliente desde su primer pedido, según los días que han pasado. «—» = aún no se puede medir. ${PX().tip('Cohorte = mes del primer pedido. LTV a N días = venta acumulada por cliente en los N días desde su primer pedido, incluido el primero. Es venta, no margen.')}`, ltvTable(r, ux), res.lec.l)}
      ${sec('s-r', 'Retención por mes', 'Qué % de cada cohorte vuelve a comprar en cada mes siguiente a su primer pedido.', retTable(r, ux), res.lec.r)}
      ${sec('s-c', 'Por canal del primer pedido', 'Los clientes se cuentan en el canal donde hicieron su primer pedido.', chTable(r), res.lec.c)}
      ${sec('s-x', 'Entre canales', 'Clientes que compran en varios canales y cómo migran de su canal de entrada al actual.', chanBlock(x.channels, cfg), res.lec.x)}
      ${cc ? sec('s-p', 'Concentración del valor', `Qué parte de la venta viene de los clientes que más compran. ${PX().tip('Se ordenan los clientes de mayor a menor venta acumulada y se suma lo que aporta cada grupo.')}`, concBlock(cc), res.lec.p) : ''}
      <section class="blk foot"><span class="mu">Venta por producto con id_cliente · ${esc2(fmtD(r.minDay))} a ${esc2(fmtD(r.maxDay))} · ${res.insuf ? 'histórico corto' : 'histórico suficiente'}</span></section>
      <details class="meth" id="cu-meth"${ux.meth ? ' open' : ''}><summary>Método y definiciones</summary><div class="meth__b"><section class="dsec"><h4>Definiciones</h4><dl class="defs">${defs.map((d) => `<div><dt>${esc2(d[0])}</dt><dd>${esc2(d[1])}</dd></div>`).join('')}</dl><p class="cap">Las compras sin ID de cliente válido (vacío, 0, null, invitado) y las líneas sin ID de pedido no entran aquí, pero sí cuentan en Productos. El ID de cliente se toma tal cual del archivo: si un mismo cliente tiene IDs distintos por canal, se contará como dos.</p></section>
        <section class="dsec"><h4>Datos</h4><dl class="fi"><div><dt>Archivo</dt><dd>${esc2(files.length ? files.slice(0, 3).join(', ') + (files.length > 3 ? ` y ${files.length - 3} más` : '') : 'Venta por producto con id_pedido e id_cliente')}</dd></div><div><dt>Periodo cargado</dt><dd>${esc2(fmtD(r.minDay))} – ${esc2(fmtD(r.maxDay))}</dd></div><div><dt>Pedidos y clientes</dt><dd>${n0(s.orders)} pedidos · ${n0(s.customers)} clientes</dd></div><div><dt>IDs válidos</dt><dd>${res.ids === null ? 'sin dato' : Math.round(res.ids * 100) + ' % de las líneas'}</dd></div><div><dt>Reactivado desde</dt><dd>${o.reactivationDays} días sin pedidos</dd></div></dl><p class="cap">El ID de cliente (anonimizado) viaja con los productos a la nube de tu equipo, comprimido.</p></section></div></details>
      </div></div></div>`;
    el.innerHTML = PX().P(html).replace('@@SHELL@@', () => shell);
    bind(el, state);
  }

  /** Eventos propios de la página (los selectores de canal y reactivación los atiende app.js con data-cu). */
  function bind(el, state) {
    const ux = state.ux.cu, app = el.querySelector('.px-app');
    const hd = document.querySelector('.app-header');
    if (hd) root.document.documentElement.style.setProperty('--pe-top', `${Math.round(hd.getBoundingClientRect().height)}px`);
    const set = (mode) => { ux.mode = mode; app.dataset.mode = mode; $('cu-m-res').setAttribute('aria-pressed', String(mode === 'res')); $('cu-m-full').setAttribute('aria-pressed', String(mode !== 'res')); };
    $('cu-m-res').onclick = () => set('res'); $('cu-m-full').onclick = () => set('full');
    const meth = $('cu-meth'); if (meth) meth.addEventListener('toggle', () => { ux.meth = meth.open; });
    if (el._cuBound) return;
    el._cuBound = true;
    el.addEventListener('click', (e) => {
      const st = FP.app && FP.app.state, u = st && st.ux.cu; if (!u) return;
      const keep = () => { const y = root.scrollY; render(st); root.scrollTo(0, y); };
      const sm = e.target.closest('#cu-md button'); if (sm) { u.sum = sm.dataset.v; keep(); return; }
      const vw = e.target.closest('#cu-vw button'); if (vw) { u.view = vw.dataset.v; keep(); return; }
      const f = e.target.closest('[data-cu-fold]'); if (f) { u.fold = u.fold || {}; u.fold[f.dataset.cuFold] = !u.fold[f.dataset.cuFold]; keep(); }
    });
  }

  FP.customersView = { render, optsOf };
})(typeof window !== 'undefined' ? window : globalThis);
