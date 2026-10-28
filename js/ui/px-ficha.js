/**
 * px-ficha.js — la ficha de una fila en el panel lateral de «Producto y evolución» (versión B).
 * Historia, venta por periodo con proyección, detalle temporal con clientes, datos de la ficha y detalle y trazabilidad,
 * con el mismo orden y los mismos textos que la maqueta. Todo sale de datos ya calculados (an.rows, an.forecast, an.drill.data).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const X = () => FP.pxView;
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const F = () => FP.format;
  const pc = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d == null ? 1 : d) + ' %';
  const NEXT = { category: 'subcategoría', subcategory: 'producto', product: 'SKU', region: 'estado', state: 'ciudad', city: 'sucursal' };
  const EP = { growth: ['Creció', 'g'], decline: ['Cayó', 'r'], stable: ['Estable', 's'], no_sales: ['Sin ventas', 's'], short: ['Corto', 's'] };
  const STAB = { estable: 'Estable', moderada: 'Variación moderada', volatil: 'Volátil', 'volátil': 'Volátil', sin_dato: 'Sin dato' };
  const LV = () => FP.productView.LEVEL;

  /* ---------- Gráfica: venta por periodo con fases y proyección ---------- */
  function chart(m, c, fc) {
    const x = X(), S = (c.ev.series || []).filter((q) => fin(q.value)), st = c.ev.story, E = st.episodes || [], Fp = fc ? fc.periods.filter((q) => fin(q.value)) : [];
    const n = S.length, tot = n + Fp.length;
    if (n < 2) return '';
    const W = 440, H = 200, L = 56, R = 12, T = 14, B = 24;
    const vals = S.map((q) => q.value).concat(Fp.map((q) => q.low), Fp.map((q) => q.high));
    const lo = Math.min.apply(0, vals) * 0.98, hi = Math.max.apply(0, vals) * 1.02;
    const Xp = (i) => L + i / (tot - 1) * (W - L - R), Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const idx = {}; S.forEach((q, i) => { idx[q.period] = i; });
    let o = '';
    const col = { growth: 'var(--ok-soft)', decline: 'var(--bad-soft)', stable: 'var(--soft)' };
    E.forEach((e) => { const a = idx[e.from], b = idx[e.to]; if (a == null || b == null) return; o += `<rect x="${Xp(a).toFixed(1)}" y="${T}" width="${Math.max(2, Xp(b) - Xp(a)).toFixed(1)}" height="${H - T - B}" fill="${col[e.type] || 'var(--soft)'}"/>`; });
    [lo, (lo + hi) / 2, hi].forEach((v) => { o += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${x.e2(v)}</text>`; });
    const pts = S.map((q, i) => `${Xp(i).toFixed(1)},${Y(q.value).toFixed(1)}`).join(' ');
    if (Fp.length) {
      const up = Fp.map((q, i) => `${Xp(n + i).toFixed(1)},${Y(q.high).toFixed(1)}`), dn = Fp.map((q, i) => `${Xp(n + i).toFixed(1)},${Y(q.low).toFixed(1)}`).reverse();
      o += `<polygon points="${Xp(n - 1).toFixed(1)},${Y(S[n - 1].value).toFixed(1)} ${up.join(' ')} ${dn.join(' ')}" fill="var(--accent-soft)" opacity=".9"/>`;
      o += `<polyline points="${Xp(n - 1).toFixed(1)},${Y(S[n - 1].value).toFixed(1)} ${Fp.map((q, i) => `${Xp(n + i).toFixed(1)},${Y(q.value).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>`;
    }
    o += `<polyline points="${pts}" fill="none" stroke="var(--ink2)" stroke-width="2" stroke-linejoin="round"/>`;
    const mark = (p, l, dy) => { if (!p || idx[p.period] == null) return; const px = Xp(idx[p.period]), py = Y(p.value), left = px < L + 44, right = px > W - R - 44; o += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><text x="${(px + (left ? 8 : right ? -8 : 0)).toFixed(1)}" y="${(py + dy).toFixed(1)}" text-anchor="${left ? 'start' : right ? 'end' : 'middle'}" style="fill:var(--ink);font-weight:600">${l}</text>`; };
    const pk = st.peak, tr = st.trough;
    mark(pk, 'máx ' + x.e2(pk && pk.value), -8);
    if (tr && (!pk || tr.period !== pk.period)) mark(tr, 'mín ' + x.e2(tr.value), 15);
    [0, Math.floor(n / 2)].forEach((i) => { o += `<text x="${Xp(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(x.ym(S[i].period))}</text>`; });
    o += `<text x="${Xp(n - 1).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(x.ym(S[n - 1].period))}</text>`;
    if (Fp.length) o += `<text x="${Xp(tot - 1).toFixed(1)}" y="${H - 6}" text-anchor="end" style="fill:var(--accent)">${esc(x.monthOf(Fp[Fp.length - 1].period))} (proy.)</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Venta mensual de ${esc(x.nameOf(m, c.key))} con fases y proyección">${o}</svg>`;
  }

  /* ---------- Fases ---------- */
  function phases(m, c) {
    const x = X(), E = c.ev.story.episodes || [];
    const bar = E.map((e) => { const [nm, cl] = EP[e.type] || ['Estable', 's']; return `<div class="${cl}" style="flex:${Math.max(e.periods, 1)}" title="${nm} ${esc(x.ym(e.from))} – ${esc(x.ym(e.to))}">${nm}${e.type === 'stable' || e.type === 'no_sales' || !fin(e.changePct) ? '' : ' ' + pc(e.changePct, 0)}</div>`; }).join('') + '<div class="n" style="flex:1.6" title="Periodo en curso">Ahora</div>';
    const lab = E.map((e) => `<div style="flex:${Math.max(e.periods, 1)}">${esc(x.ym(e.from).replace(' 20', ' ’'))}</div>`).join('') + `<div style="flex:1.6">${esc(m.ci.current && x.monthOf(m.ci.current.key) || 'hoy')}</div>`;
    return `<div class="ph" role="img" aria-label="Fases de la venta mensual">${bar}</div><div class="phl">${lab}</div>`;
  }

  /** «similar al total digital», «mejor que el total digital», «peor que su categoría». */
  const relWord = (rel) => {
    const lb = String(rel.label || '');
    if (rel.verdict === 'similar') return `similar ${/^el /.test(lb) ? 'al ' + esc(lb.slice(3)) : 'a ' + esc(lb)}`;
    return `${rel.verdict === 'better' ? 'mejor' : rel.verdict === 'worse' ? 'peor' : esc(rel.verdict)} que ${esc(lb)}`;
  };
  const dsec = (id, t, body, cap) => `<section class="dsec" id="s-${id}"><h4>${t}</h4>${cap ? `<p class="cap">${cap}</p>` : ''}${body}</section>`;

  /* ---------- Detalle temporal: venta por periodo y clientes ---------- */
  function temporal(m, c, d, ux) {
    const x = X();
    if (!d) return dsec('temp', 'Detalle temporal', m.a.drill && m.a.drill.error ? `<p class="cap">${esc(m.a.drill.error)}</p>` : x.raw(FP.loader.html('Cargando detalle…', { key: 'drill', detail: m.a.drill && m.a.drill.step })));
    const P = (d.byPeriod || []), cu = d.customers && d.customers.status === 'ok' ? d.customers : null, CU = cu ? cu.byMonth : {};
    if (!P.length) return dsec('temp', 'Detalle temporal', m.a.drill && m.a.drill.pending ? x.raw(FP.loader.html(m.a.drill.step || 'Calculando el detalle temporal y los registros fuente…', { key: 'drill-b' })) : '<p class="cap">Sin periodos para esta selección.</p>');
    const rows = P.map((p, i) => {
      const pv = i > 0 && !p.partial && fin(P[i - 1].value) ? P[i - 1].value : null, ch = pv && fin(p.value) ? p.value / pv - 1 : null, u = CU[p.key], star = u && !u.reliableNew ? '*' : '';
      const cl = cu ? `<td class="num">${u ? x.num0(u.customers.new) + star : '—'}</td><td class="num">${u ? x.num0(u.customers.recurrent) : '—'}</td><td class="num">${u ? x.num0(u.customers.reactivated) : '—'}</td><td class="num">${u && u.lapsed !== null && u.lapsed !== undefined ? x.num0(u.lapsed) : '—'}</td>` : '';
      return `<tr class="${i < P.length - 6 ? 'x' : ''}"><td>${esc(x.ymc(p.key))}${p.partial ? ' <span class="mu">(en curso)</span>' : ''}</td><td class="num">${fin(p.value) ? x.e2(p.value) : '—'}</td><td class="num ${ch == null ? '' : ch < 0 ? 'dn' : 'up'}">${ch == null ? '—' : (ch < 0 ? '▼ ' : '▲ ') + Math.abs(ch * 100).toFixed(1) + ' %'}</td>${cl}</tr>`;
    }).join('');
    const open = Boolean(ux.dt);
    return dsec('temp', 'Detalle temporal', `<div class="tw${open ? ' open' : ''}" id="dt"><table class="dtab" aria-label="Detalle por período"><thead><tr><th>Periodo</th><th>Venta</th><th>Cambio</th>${cu ? '<th>Nuevos</th><th>Recurrentes</th><th>Recuperados</th><th>No regresaron</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>${P.length > 6 ? `<div class="tf"><span class="mu">${open ? 'todos' : `6 de ${P.length}`}</span><button class="lk fold2" data-n="${P.length}">${open ? 'Ver solo 6' : `Ver los ${P.length}`}</button></div>` : ''}</div>`
      + (cu && cu.filtered ? `<p class="cap cu" data-customers-context="1"><label>Cuándo es «nuevo»: <select data-action="an-cu-scope"><option value="company"${cu.scope === 'selection' ? '' : ' selected'}>en la empresa (su primer pedido con nosotros)</option><option value="selection"${cu.scope === 'selection' ? ' selected' : ''}>en esta selección (su primera compra de ella)</option></select></label><br><b>Clientes de esta selección.</b> Se cuentan los clientes que compraron esta selección (con el canal que elegiste) en cada mes. ${cu.scope === 'selection' ? 'El tipo se mide solo con las compras de esta selección: «nuevo» es su primera compra de ella.' : 'El tipo es el del cliente con la empresa: «nuevo» es su primer pedido en el histórico, no su primera compra de esta categoría o producto.'}</p>` : '') + `<p class="cap">${cu ? `Clientes de esta selección, por mes. * histórico corto. Qué es cada tipo de cliente: <button class="lk" data-method="df">Definiciones</button>` : `<span data-customers-note="1">${esc((d.customers && d.customers.note) || 'Sin libro de clientes cargado: la tabla muestra solo la venta.')}</span>`}</p>`, 'El periodo en curso no entra en los patrones.');
  }


  /* ---------- Resumen general de la selección: una frase por pregunta (corta) o el párrafo completo (larga) ---------- */
  const GEO_LV = ['region', 'state', 'city', 'branch', 'delivery'];
  const EPV = { stable: 'estable', growth: 'crecer', decline: 'caer', no_sales: 'sin ventas', short: 'un tramo corto' };
  const U = { mes: ['mes', 'meses'], semana: ['semana', 'semanas'], 'día': ['día', 'días'], 'año': ['año', 'años'] };
  const bd = (v, k) => `<b${k ? ` class="${k}"` : ''}>${v}</b>`;
  function summaryRows(m, c, key, d) {
    const x = X(), rows = [], ref = esc(x.refName(m.ci)), tot = Boolean(c.total), ev = c.ev, st = ev && ev.story && ev.story.status === 'available' ? ev.story : null, rx = c.x;
    const net = m.net, M1 = x.M, one = x.lw(m.level), days = m.r.total.current.days || 0;
    const pct = Math.abs(c.p).toFixed(1), flat = !fin(c.p) || Math.abs(c.p) < 0.05, up = c.d >= 0, vb = flat ? 'se mantiene' : up ? 'sube' : 'baja';
    const cls = flat ? '' : up ? 'up' : 'dn';
    const row = (k, s, l) => { if (s || l) rows.push({ k, s, l: l || s }); };
    /* 1 · Qué pasó */
    const cn = !tot && fin(c.contrib) && Math.abs(c.contrib) >= 0.05 ? `${c.contrib >= 0 ? 'explica' : 'compensa'} ${Math.round(Math.abs(c.contrib) * 100)} % del cambio neto` : '';
    const sh = !tot && Math.abs(c.dpp) >= 0.3 ? `${c.dpp > 0 ? 'gana' : 'pierde'} ${Math.abs(c.dpp).toFixed(1)} pp de participación` : '';
    const b = tot ? m.a.bridge : null, goalTxt = b && fin(b.gap) && (b.status === 'available' || b.status === 'partial') ? (b.gap >= 0 ? `Supera la meta por ${M1(b.gap)}` : `Queda ${M1(-b.gap)} bajo la meta`) : '';
    row('Qué pasó',
      `${tot ? 'La venta' : 'Venta'} ${vb}${flat ? '' : ' ' + bd(pct + ' %', cls)} (${M1(c.d, true)}) contra ${ref}${[cn, sh].filter(Boolean).length ? '; ' + [cn, sh].filter(Boolean).join(' y ') : ''}${goalTxt && tot ? '. ' + goalTxt : ''}.`,
      `${tot ? 'La venta total' : `La venta ${one[2].replace(/^(el|la) /, 'de $1 ')}`} ${vb}${flat ? '' : ' ' + bd(pct + ' %', cls)} contra ${ref} (${bd(M1(c.d, true))})${m.ci.partial && days ? `, comparando los mismos ${days} días` : ''}.${!tot && fin(c.share) ? ` Pesa ${(c.share * 100).toFixed(1)} % de la venta total` : ''}${cn ? (!tot ? '; ' : ' ') + cn : ''}${sh ? ' y ' + sh : ''}${!tot && (cn || sh || fin(c.share)) ? '.' : ''}${goalTxt && tot ? ' ' + goalTxt + '.' : ''}`);
    /* 2 · Quién (solo el total) */
    if (tot) {
      const drag = m.cats.find((q) => q.d * net > 0), comp = m.cats.filter((q) => q.d * net < 0).sort((p1, p2) => Math.abs(p2.d) - Math.abs(p1.d))[0], cov = m.r.compensation && fin(m.r.compensation.coveredPct) ? Math.round(m.r.compensation.coveredPct * 100) : null;
      if (drag) row('Quién',
        `${bd(esc(x.nameOf(m, drag.key)))}${fin(drag.contrib) ? ` explica ${Math.round(Math.abs(drag.contrib) * 100)} %` : ''}${comp ? `; ${bd(esc(x.nameOf(m, comp.key)))} compensa${cov !== null ? ' ' + cov + ' %' : ''}` : ''}.`,
        `${bd(esc(x.nameOf(m, drag.key)))}${fin(drag.contrib) ? ` explica ${Math.round(Math.abs(drag.contrib) * 100)} % del cambio (${M1(drag.d, true)})` : ` ${M1(drag.d, true)}`}${Math.abs(drag.dpp) >= 0.3 ? ` y ${drag.dpp > 0 ? 'gana' : 'pierde'} ${Math.abs(drag.dpp).toFixed(1)} pp de participación` : ''}.${comp ? ` ${bd(esc(x.nameOf(m, comp.key)))} ${comp.d > 0 ? 'sube' : 'baja'} ${M1(comp.d, true)}${cov !== null ? ' y compensa ' + cov + ' %' : ''}.` : ''}`);
    }
    /* 3 · Dónde se concentra (señales geográficas de la fila) */
    if (!tot) {
      const gs = (m.r.geoSignals || []).filter((g) => String(g.entity) === String(key));
      if (gs.length) {
        const short = (g) => { const t = String(g.label).replace(/-/g, '−'), q = t.match(/el ([\d.]+) % de esa variación se concentra en (.+?) \(/), r2 = t.match(/donde más se movió fue (.+?)\.?$/); return q ? `${bd(Math.round(+q[1]) + ' %')} de la variación está en ${esc(q[2])}` : r2 ? `Donde más se movió: ${bd(esc(r2[1]))}` : esc(t); };
        row('Dónde', short(gs[0]) + '.', gs.slice(0, 2).map((g, i) => { const t = esc(String(g.label).replace(/-/g, '−')).replace(/\.$/, ''); return (i ? x.cap1(t.replace(/^[^;]+;\s*/, '')) : t) + '.'; }).join(' '));
      }
    }
    /* 4 · Desde cuándo */
    if (st && (st.episodes || []).length) {
      const eps = st.episodes, last = eps[eps.length - 1], prev = eps.length > 1 ? eps[eps.length - 2] : null, un = U[x.unitOf(ev)] || U.mes;
      const vn = { stable: 'Estable', growth: 'Crece', decline: 'Cae', no_sales: 'Sin ventas' }[last.type] || 'Sin ventas';
      const rel = (st.relative || [])[0];
      const rs = rel && fin(rel.diffPp) ? (Math.abs(rel.diffPp) < 5 ? `en línea con ${esc(rel.label)}` : `${bd(Math.abs(rel.diffPp).toFixed(0) + ' pp ' + (rel.diffPp > 0 ? 'mejor' : 'peor'))} que ${esc(rel.label)}`) : '';
      const cu = st.current || {}, nowS = ['falling', 'rising'].includes(cu.state) && fin(cu.change) && !((cu.state === 'falling' && last.type === 'decline') || (cu.state === 'rising' && last.type === 'growth')) ? `ahora ${bd((cu.state === 'falling' ? 'cae ' : 'sube ') + Math.abs(cu.change * 100).toFixed(1) + ' %', cu.state === 'falling' ? 'dn' : 'up')}` : '';
      row('Desde cuándo',
        `${vn} hace ${bd(last.periods + ' ' + (last.periods === 1 ? un[0] : un[1]))}${prev && fin(prev.changePct) && prev.type !== 'stable' ? `, tras ${EPV[prev.type]} ${pc(prev.changePct, 0)}` : ''}${nowS ? '; ' + nowS : ''}${rs && !nowS ? '; ' + rs : ''}.`,
        `${esc(st.headline || '')}${rel ? ` Contra ${esc(rel.label)}: ${pc(rel.entityChange)} contra ${pc(rel.contextChange)} (${esc(x.ym(rel.window.from))} → ${esc(x.ym(rel.window.to))}).` : ''}`);
    }
    /* 5 · Qué lo explica */
    const pv = c.pv || (tot && m.a.pvm && m.a.pvm.total && fin(m.a.pvm.total.volume) ? m.a.pvm.total : null), dv = st && st.drivers;
    let fac = null;
    if (pv && fin(pv.volume) && fin(pv.price) && fin(pv.mix)) fac = [['mezcla', pv.mix], ['precio', pv.price], ['volumen', pv.volume]];
    else if (dv && fin(dv.volume) && fin(dv.price)) fac = [['precio', dv.price], ['volumen', dv.volume]];
    if (fac) fac.sort((p1, p2) => Math.abs(p2[1]) - Math.abs(p1[1]));
    const hasF = rx && rx.current && rx.current.views, fo = hasF ? x.funnelOf(m, rx) : null, rd = fo && FP.funnelEngine ? FP.funnelEngine.reading(fo.cmp) : null;
    const pc1 = (v) => `${(v * 100).toFixed(1)} %`;
    let fl = '', fs = '';
    if (rd && rd.kind === 'views_up_cr_down' && rd.weak) { const sp = fo.cmp.steps[rd.weak.index], st2 = x.STEP[rd.weak.label] || ['', 'del paso débil']; fs = `Vistas ${x.pcs(rd.views)}, pero ${st2[1]} baja de ${pc1(sp.rateBase)} a ${pc1(sp.rateCur)}`; fl = `${fs} (${x.sgn(rd.weak.deltaPp, 1)} pp): llega más gente y compra menos`; }
    else if (rd && rd.kind === 'views_down') { fs = `Caen las vistas (${x.pcs(rd.views)})`; fl = fs; }
    const noF = !fo && (GEO_LV.includes(m.level) || (m.state.pa.geo && Object.values(m.state.pa.geo).some(Boolean))) ? 'Sin embudo en este nivel' : '';
    if (fac || fs || noF) {
      const f2 = fac ? fac.slice(0, 2) : [], sf = f2.length ? `${bd(x.cap1(f2[0][0]) + ' ' + M1(f2[0][1], true))}${f2[1] ? ' y ' + f2[1][0] + ' ' + M1(f2[1][1], true) : ''}` : '';
      const lf = fac ? fac.map((q, i) => (i === 0 ? bd(x.cap1(q[0]) + ' ' + M1(q[1], true)) : `${q[0]} ${M1(q[1], true)}`)).join(', ') : '';
      row('Qué lo explica', [sf, fs, noF].filter(Boolean).join('. ') + '.', [lf, fl, noF, 'Es una descomposición, no una causa'].filter(Boolean).join('. ') + '.');
    }
    /* 6 · Hacia dónde */
    const fc = x.fcOf(c);
    if (fc && fc.periods.length && fin(fc.periods[0].value)) {
      const p0 = fc.periods[0], [cw, cd] = x.confOf(fc.level), dir = Math.abs(fc.change || 0) < 0.03 ? 'sin dirección clara' : `la recta apunta a ${pc(fc.change, 1)}`;
      row('Hacia dónde',
        `Cierra ${esc(x.monthOf(p0.period))} cerca de ${bd(x.e1(p0.value))}, ${dir}, ${fc.level === 'low' ? bd('confianza baja') : 'confianza ' + cw}.`,
        `Cierra ${esc(x.monthOf(p0.period))} cerca de ${bd(x.e1(p0.value))} (rango ${x.e1(p0.low)} – ${x.e1(p0.high)}), ${dir}. ${fc.level === 'low' ? bd('Confianza baja') : 'Confianza ' + cw}${fin(fc.mape) ? `: en ${fc.tested} pruebas hacia atrás la regla se desvió ${(fc.mape * 100).toFixed(1)} %` : ''}.`);
    }
    /* 7 · Ojo */
    const warn = [], warnL = [];
    if (st && st.reliability && st.reliability.level === 'low') { const t = `Lectura poco confiable: ${(st.reliability.reasons || []).join(', ')}`; warn.push(t); warnL.push(t); }
    if (!tot && m.level === 'branch') { warn.push('Sin inventario ni horarios: confirma con la tienda'); warnL.push('La app no trae inventario, horarios ni cierres: si hubo un cambio operativo, confirma con la tienda'); }
    const cv0 = m.tc.trackingCoverage, cov = cv0 && fin(cv0.value) ? cv0.value : null;
    if (fin(cov) && cov < 1 - FP.config.products.signals.trackingGapPct) { const t = `Tracking de ${Math.round(cov * 100)} %: lee el embudo con cuidado`; warn.push(t); warnL.push(t); }
    if (m.ci.partial && days) warnL.push(`Periodo en curso (${days} días): se compara contra los mismos días de la referencia`);
    row(warn.length || warnL.length ? 'Ojo' : null, warn.length ? warn.join('. ') + '.' : '', warnL.length ? warnL.join('. ') + '.' : '');
    return rows.filter((q) => q.k);
  }
  function summaryHtml(m, c, key, d, ux) {
    const long = ux.sum === 'l', rows = summaryRows(m, c, key, d).filter((q) => (long ? q.l : q.s));
    if (!rows.length) return '';
    return dsec('res', 'Resumen general', `<div class="mini" role="group" aria-label="Versión del resumen" style="justify-self:start"><button data-sum="c" aria-pressed="${!long}">Versión corta</button><button data-sum="l" aria-pressed="${long}">Versión larga</button></div><div class="sum${long ? ' sum--l' : ''}">${rows.map((q) => `<div class="sum__r"><span>${q.k}</span><span>${long ? q.l : q.s}</span></div>`).join('')}<div class="sum__f">Descomposición matemática, no causa. Cada cifra baja a su archivo y fila de origen.</div></div>`);
  }

  /* ---------- Ficha ---------- */
  function html(m, c, key, state) {
    const x = X(), ux = state.ux.px, a = m.a;
    if (!c) return `<div style="padding:14px 16px;display:grid;gap:12px"><p class="ln">Esta fila no está en la tabla de ${esc(x.lw(m.level)[1])}: su lectura de evolución está en la página.</p></div>`;
    const ev = c.ev, st = ev && ev.story && ev.story.status === 'available' ? ev.story : null, rx = c.x, ex = c.ex;
    const drill = a.drill && (c.total ? a.drill.scope === 'total' : String(a.drill.entity) === String(key)) ? a.drill : null, d = drill && drill.data ? drill.data : null;
    const fc = x.fcOf(c), up = c.d >= 0, lg = c.dpp > 0.3 ? ['Gana lugar', 'ok'] : c.dpp < -0.3 ? ['Pierde lugar', 'bad'] : ['Igual', 'mu'];
    const nav = [['res', 'Resumen'], st ? ['hist', 'Historia'] : null, st ? ['proy', 'Hacia dónde va'] : null, ['temp', 'Detalle temporal'], ['dat', 'Datos'], ['det', 'Detalle']].filter(Boolean);
    let h = `<div class="dn-nav">${nav.map(([j, t]) => `<a data-j="${j}">${t}</a>`).join('')}</div><div style="padding:14px 16px;display:grid;gap:18px">`;
    h += `<div class="stat"><div><b>${x.m2(rx.revenue.current)}</b><span>Venta</span></div><div><b class="${up ? 'up' : 'dn'}">${up ? '▲ ' : '▼ '}${Math.abs(c.p).toFixed(1)} %</b><span>contra referencia</span></div><div><b>${fin(c.contrib) ? (c.contrib * 100).toFixed(1) + '%' : '—'}</b><span>Contribución</span></div></div>`;
    if (!c.total) h += `<div class="states"><span class="chip ${lg[1]}">${lg[0]}</span><span class="mu" style="font-size:.82rem">Participación ${(c.share * 100).toFixed(1)}% (${c.dpp >= 0 ? '▲' : '▼'}${Math.abs(c.dpp).toFixed(1)} pp)</span></div>`;
    h += summaryHtml(m, c, key, d, ux);
    if (st) {
      const cur = st.current || {}, unit = x.unitOf(ev), peak = st.peak, trough = st.trough, rel = (st.relative || [])[0];
      const relTxt = rel ? `<p class="ln"><b>Contra su contexto:</b> ${relWord(rel)}: ${pc(rel.entityChange)} contra ${pc(rel.contextChange)} (${esc(x.ym(rel.window.from))} → ${esc(x.ym(rel.window.to))}).</p>` : '';
      const low = st.reliability && st.reliability.level === 'low' ? `<p class="ln"><b>Ojo:</b> lectura poco confiable (${esc((st.reliability.reasons || []).join(', '))}). Úsala como orientación, no como conclusión.</p>` : '';
      h += dsec('hist', 'Historia', `<p class="ln"><b>${esc(st.headline || '')}</b></p>${phases(m, c)}`
        + `<div class="tiles"><div><span>Estabilidad</span><b>${esc(STAB[st.stability] || st.stability || '—')}</b><span>variación típica ${((st.noise || 0) * 100).toFixed(0)} % por ${unit}</span></div><div><span>Ahora</span><b>${esc(cur.tag || '—')} ${fin(cur.change) ? pc(cur.change) : ''}</b><span>contra el periodo anterior</span></div>`
        + `<div><span>Máximo</span><b>${peak ? esc(x.ymc(peak.period)) : '—'}</b><span>${peak ? x.e2(peak.value) : ''}${st.fromPeak ? ' · hoy ' + pc(-Math.abs(st.fromPeak)) + ' vs su máximo' : ' · el último mes cerrado'}</span></div><div><span>Mínimo</span><b>${trough ? esc(x.ymc(trough.period)) : '—'}</b><span>${trough ? x.e2(trough.value) : ''}</span></div></div>`
        + `${relTxt}${low}${x.getMK() === 'revenue' ? `<p class="ln"><b>Qué se movió:</b> ${x.ms2(c.d)} en el periodo en curso. Es una descomposición matemática, no una causa.</p>` : ''}`);
      if (fc && fc.periods.length) {
        const endp = fc.periods[fc.periods.length - 1], flat = Math.abs(fc.change || 0) < 0.03, [cw, cd] = x.confOf(fc.level);
        h += dsec('proy', 'Venta por periodo y hacia dónde va', chart(m, c, fc)
          + `<p class="ln"><b>Hacia dónde va:</b> ${flat ? 'no hay una tendencia clara, la recta es casi plana. ' : `la recta apunta a ${pc(fc.change, 1)}. `}Si nada cambia: de ${x.e2(fc.lastValue)} (${esc(x.ymc(fc.lastPeriod || ''))}) a ≈ ${x.e2(endp.value)} en ${esc(x.ym(endp.period || ''))} (rango ${x.e2(endp.low)} – ${x.e2(endp.high)}).</p>`
          + (fin(fc.mape) ? `<p class="ln"><span class="cf" tabindex="0" title="${esc(x.confTitle(fc))}">${'●'.repeat(cd)}${'○'.repeat(3 - cd)} Confianza ${cw}</span> <span class="mu">en ${fc.tested} pruebas hacia atrás se desvió ${(fc.mape * 100).toFixed(1)} % por mes.</span></p>` : ''),
        'Fases en color: verde creció, rojo cayó, gris estable. Línea punteada: proyección con su rango.');
      } else h += dsec('proy', 'Venta por periodo y hacia dónde va', chart(m, c, null) + `<p class="ln">No hay base suficiente para proyectar esta serie${ev.story.outlook && ev.story.outlook.message ? ': ' + esc(ev.story.outlook.message) : ''}.</p>`, 'Fases en color: verde creció, rojo cayó, gris estable.');
    }
    h += '<div id="an-drill" style="display:grid;gap:18px">' + temporal(m, c, d, ux);
    const dm = (k) => { const q = rx.drivers && rx.drivers[k]; return q && fin(q.deltaPct) ? F().signedPercent(q.deltaPct, 1) : '—'; };
    const cr = rx.current && rx.current.conversionRate, aov = rx.current && rx.current.aov;
    const fi = (l, v, tp) => `<div><dt>${l}${tp ? x.tip(tp) : ''}</dt><dd>${v}</dd></div>`;
    h += dsec('dat', 'Datos de la ficha', `<dl class="fi">${fi('Peso del movimiento', fin(ex.movementShare) ? (ex.movementShare * 100).toFixed(1) + ' %' : '—', 'Cuánto del movimiento bruto (subidas y bajadas) es de esta fila. No es la contribución: esa mide el cambio neto.')}${fi('Persistencia', ex.persist === null || ex.persist === undefined ? '—' : ex.persist + ' per.', 'Cuánto lleva en su patrón actual.')}${fi('Pedidos', esc(dm('orders')))}${fi('Vistas de ficha', esc(dm('views')), 'Vistas de la página del producto en GA4. No son sesiones.')}${fi('Conversión', cr && fin(cr.value) ? (cr.value * 100).toFixed(2) + '%' : '—', 'Compras de GA4 ÷ vistas de ficha.')}${fi('Ticket promedio', aov && fin(aov.value) ? esc(F().currency(aov.value, 2)) : '—', 'Venta ÷ pedidos. Se calcula, no viene en el archivo.')}</dl>`
      + (ex.clue && ex.clue !== F().DASH ? `<p class="ln"><b>Primera pista:</b> ${ex.clue}</p>` : ''));
    /* detalle y trazabilidad */
    let det;
    if (!d) det = `<p class="cap">${drill && drill.error ? esc(drill.error) + ' <button class="lk" data-action="an-drill-retry">Reintentar</button>' : 'Calculando el detalle…'}</p>`;
    else {
      const bc = (d.byChannel || []).map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${fin(r.current) ? x.e2(r.current) : '—'}</td><td class="num">${fin(r.baseline) ? x.e2(r.baseline) : '—'}</td><td class="num ${r.delta < 0 ? 'dn' : 'up'}">${fin(r.delta) ? x.ms2(r.delta) : '—'}</td></tr>`).join('');
      const ch = d.children, lvName = ch ? (LV()[ch.level] || ch.level) : '';
      const cr2 = ch && ch.rows.length ? ch.rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="num">${x.e2(r.current)}</td><td class="num ${r.delta < 0 ? 'dn' : 'up'}">${fin(r.delta) ? x.ms2(r.delta) : '—'}</td><td class="num">${fin(r.deltaPct) ? pc(r.deltaPct) : '—'}</td><td><button class="lk" data-action="an-drill-down" data-level="${esc(ch.level)}" data-key="${esc(r.key)}">Abrir ›</button></td></tr>`).join('') : '';
      const crumbs = drill.path && drill.path.length ? `<p class="cap">${['<button class="lk" data-action="an-drill-up" data-index="-1">' + esc(x.nameOf(m, key)) + '</button>', ...drill.path.map((n, i) => `<button class="lk" data-action="an-drill-up" data-index="${i}">${esc(LV()[n.level] || n.level)}: ${esc(n.key)}</button>`)].join(' › ')}</p>` : '';
      const own = !c.total && ev && !(drill.path && drill.path.length) ? ev : null, adv = own && own.advanced, ra = own && own.evidence && own.evidence.rulesApplied, chg = own && own.evidence && Array.isArray(own.evidence.changes) ? own.evidence.changes : [];
      const PL = (FP.trendView && FP.trendView.patternLabel) || ((q) => q);
      const rule = own ? `<p class="cap"><b>Regla que lo señala:</b> ${esc(PL(own.pattern))}${adv && adv.signal && adv.signal !== 'normal' ? ` · señal avanzada «${esc(adv.signal)}» (severidad ${esc(adv.severity)}, score ${esc(adv.score)}${adv.regimeChanges ? `, ${adv.regimeChanges} cambio(s) de régimen` : ''})` : ''}. <b>Evidencia:</b> ${own.consecutivePeriods || 0} período(s) consecutivos; ${own.periodsAnalyzed} períodos cerrados analizados (${esc(own.evidence && own.evidence.periods ? own.evidence.periods[0] + ' → ' + own.evidence.periods[own.evidence.periods.length - 1] : '—')}) en ${esc(d.context.channel)}; cambios período a período: ${esc(chg.map((q) => (fin(q) ? (q >= 0 ? '+' : '') + (q * 100).toFixed(1) + ' %' : 'N/A')).join(' · ') || 'N/A')}.${ra ? ` Umbrales usados: cambio relevante ≥ ${(ra.changePct * 100).toFixed(0)} %, estable < ${(ra.stablePct * 100).toFixed(0)} %, mínimo ${ra.minPeriods} períodos, anomalía z ≥ ${ra.anomalyZ}.` : ''}</p>` : '';
      const rc = d.records, eq = (u, v) => fin(u) && fin(v) && Math.abs(u - v) <= 0.5;
      const recs = rc ? `<p class="cap"><b>Registros fuente · SKU ${esc(rc.sku)}:</b> ${rc.total} registro(s) de venta en los dos períodos; se muestran los últimos ${rc.rows.length}. Σ del período actual: ${x.e2(rc.sumCurrent)} ${eq(rc.sumCurrent, d.summary.current) ? '✓ = detalle' : '⚠ difiere del detalle'}. <button class="lk" data-action="an-open-trace" data-sku="${esc(rc.sku)}">Ver trazabilidad completa</button></p><div class="tw"><table class="dtab" aria-label="Registros fuente"><thead><tr><th>Fecha</th><th>Canal</th><th>Venta</th><th>Pedidos</th><th>Unidades</th><th>Período</th><th>Archivo · fila</th></tr></thead><tbody>${rc.rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(FP.analysisContext.channelLabel(r.channel))}</td><td class="num">${x.e2(r.revenue)}</td><td class="num">${r.orders === null ? '—' : x.num0(r.orders)}</td><td class="num">${r.units === null ? '—' : x.num0(r.units)}</td><td>${esc(r.period)}</td><td>${esc(r.file || '—')} · ${r.row === undefined || r.row === null ? '—' : esc(r.row)}</td></tr>`).join('')}</tbody></table></div>` : '';
      det = `${crumbs}${rule}${bc ? `<div class="tw"><table class="dtab" aria-label="Detalle por canal"><thead><tr><th>Canal</th><th>Actual</th><th>Antes</th><th>Cambio</th></tr></thead><tbody>${bc}</tbody></table></div>` : ''}${cr2 ? `<div class="tw"><table class="dtab" aria-label="Detalle por ${esc(ch.level)}"><thead><tr><th>${esc(lvName)}</th><th>Actual</th><th>Cambio</th><th>%</th><th></th></tr></thead><tbody>${cr2}</tbody></table></div>` : ''}${recs}${drill.pending ? x.raw(FP.loader.html(drill.step || 'Calculando el detalle temporal y los registros fuente…', { key: 'drill-b' })) : ''}<p class="cap">Cada subcategoría, producto y SKU baja hasta el archivo y la fila de origen.</p>`;
    }
    h += dsec('det', 'Detalle y trazabilidad', det) + '</div>';
    const nx = c.total ? null : NEXT[m.level];
    h += `<div class="states">${nx ? `<button class="btn btn--p" data-action="pa-drill" data-key="${esc(key)}">Desglosar por ${nx} ›</button>` : ''}${c.total ? '' : `<button class="btn" data-pick="${esc(key)}">Ver el embudo</button>`}<button class="btn" data-action="an-diagnose">Diagnosticar</button><button class="btn" data-action="${c.total ? 'an-export-contrib' : 'an-export-reading'}">Descargar</button></div><p class="cap">Descriptivo y trazable. No demuestra causas. <button class="lk" data-method="df">Cómo se calculan las fases</button></p></div>`;
    return h;
  }

  FP.pxFicha = { html };
})(typeof window !== 'undefined' ? window : globalThis);
