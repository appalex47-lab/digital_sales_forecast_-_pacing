/**
 * px-resumen.js — Resumen general de la ficha de «Producto y evolución».
 * Reglas invisibles: cada fila y cada causa se dibuja solo si sus datos la justifican; lo que no aplica no se menciona.
 * Los umbrales viven en FP.config.products.summary (provisionales, ajustables). Todo es descriptivo: nada afirma una causa.
 * Entrada: el modelo de la página (m), la fila (c), su clave y los datos del detalle (d). Salida: [{ k, s (corta), l (larga) }].
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const X = () => FP.pxView;
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.products.summary;
  const GEO_LV = ['region', 'state', 'city', 'branch', 'delivery'];
  const MESF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const EPV = { stable: 'estable', growth: 'crecer', decline: 'caer', no_sales: 'sin ventas', short: 'un tramo corto' };
  const U = { mes: ['mes', 'meses'], semana: ['semana', 'semanas'], 'día': ['día', 'días'], 'año': ['año', 'años'] };
  const bd = (v, k) => `<b${k ? ` class="${k}"` : ''}>${v}</b>`;
  const pc = (v, d) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d == null ? 1 : d)} %`;
  const p1 = (v) => `${(v * 100).toFixed(1)} %`;
  const ab = (v, d) => `${Math.abs(v * 100).toFixed(d == null ? 1 : d)} %`;
  const monthName = (k) => MESF[+String(k).slice(5) - 1];

  /** Prueba z de dos proporciones (compras ÷ vistas, periodo contra referencia). */
  function zTest(cur, base) {
    if (!cur || !base || !(cur.views > 0) || !(base.views > 0) || !fin(cur.purchase) || !fin(base.purchase)) return null;
    const a = cur.purchase / cur.views, b = base.purchase / base.views, pp = (cur.purchase + base.purchase) / (cur.views + base.views), se = Math.sqrt(pp * (1 - pp) * (1 / cur.views + 1 / base.views));
    return se > 0 ? (a - b) / se : 0;
  }


  /** De dónde viene el cambio de tráfico (fuente, dispositivo, campaña o landing, con el archivo de Segmentos): solo para el total y por canal. */
  function trafficSource(m, state) {
    const cfg = CFG(), pa = state.pa, DS = FP.dataStore;
    if (!DS || !FP.segmentsView || !FP.trafficConversionEngine || pa.comparison !== 'previous' || !state.store) return null;
    let recs; try { recs = DS.segmentIndex(state.store); } catch (e) { return null; }
    if (!recs || !recs.list || !recs.list.length || !recs.byDim) return null;
    const from = m.r.period.from, to = m.r.period.to, ch = pa.channel || 'total', memo = (k, fn) => DS.cached(state.store, k, ['segments'], fn);
    let best = null;
    [['source', 'fuente'], ['device', 'dispositivo'], ['campaign', 'campaña'], ['landing', 'landing']].forEach(([dim, lab]) => {
      if (!recs.byDim.has(dim)) return;
      const key = `${from}|${to}|${pa.periodType}|${ch}|${dim}`;
      const res = memo(`segsum|${key}`, () => FP.segmentsView.summarize(recs, { from, to, channel: ch, dimension: dim, periodType: pa.periodType }));
      if (!res || !res.rows.length) return;
      const dec = memo(`segdec|${key}|auto`, () => FP.trafficConversionEngine.analyze(res, {}));
      if (!dec || dec.status !== 'ok' || !dec.total.traffic || Math.abs(dec.total.traffic) < 0.01 * Math.abs(dec.total.base || 0)) return;
      dec.allItems.filter((q) => q.grouped === 0 && fin(q.trafficDeltaPct)).forEach((q) => {
        const sh = q.traffic / dec.total.traffic;
        if (q.traffic * dec.total.traffic > 0 && sh >= cfg.sourceShare && Math.abs(q.trafficDeltaPct) >= cfg.sourceMinPct && (!best || sh > best.sh)) best = { sh, q, lab };
      });
    });
    if (!best) return null;
    const { q, sh, lab } = best;
    return { s: `Tráfico de ${esc(q.label)} ${pc(q.trafficDeltaPct, 0)} (por ${lab})`, l: `Por ${lab}, el tráfico de ${bd(esc(q.label))} (${pc(q.trafficDeltaPct, 0)}) explica ${Math.round(sh * 100)} % del efecto del tráfico en la venta` };
  }

  function rows(m, c, key, d, state) {
    const x = X(), out = [], cfg = CFG(), ref = esc(x.refName(m.ci)), tot = Boolean(c.total), ev = c.ev, rx = c.x;
    const st = ev && ev.story && ev.story.status === 'available' ? ev.story : null;
    const M1 = x.M, one = x.lw(m.level), days = m.r.total.current.days || 0, net = m.net;
    const add = (k, s, l) => { if (s || l) out.push({ k, s: s || '', l: l || s || '' }); };

    /* 1 · Qué pasó (siempre) */
    const pct = Math.abs(c.p).toFixed(1), flat = !fin(c.p) || Math.abs(c.p) < 0.05, up = c.d >= 0, vb = flat ? 'se mantiene' : up ? 'sube' : 'baja', cls = flat ? '' : up ? 'up' : 'dn';
    const cn = !tot && fin(c.contrib) && Math.abs(c.contrib) >= 0.05 ? `${c.contrib >= 0 ? 'explica' : 'compensa'} ${Math.round(Math.abs(c.contrib) * 100)} % del cambio neto` : '';
    const sh = !tot && Math.abs(c.dpp) >= 0.3 ? `${c.dpp > 0 ? 'gana' : 'pierde'} ${Math.abs(c.dpp).toFixed(1)} pp de participación` : '';
    const shareOf = !tot && m.level !== 'category' && m.state.pa.drill && m.state.pa.drill.length ? 'su selección' : 'la venta total';
    add('Qué pasó',
      `${tot ? 'La venta' : 'Venta'} ${vb}${flat ? '' : ' ' + bd(pct + ' %', cls)} (${M1(c.d, true)}) contra ${ref}${[cn, sh].filter(Boolean).length ? '; ' + [cn, sh].filter(Boolean).join(' y ') : ''}.`,
      `${tot ? 'La venta total' : `La venta ${one[2].replace(/^(el|la) /, 'de $1 ')}`} ${vb}${flat ? '' : ' ' + bd(pct + ' %', cls)} contra ${ref} (${bd(M1(c.d, true))})${m.ci.partial && days ? `, comparando los mismos ${days} días` : ''}.${!tot && fin(c.share) ? ` Pesa ${(c.share * 100).toFixed(1)} % de ${shareOf}` : ''}${cn ? (!tot ? '; ' : ' ') + cn : ''}${sh ? ' y ' + sh : ''}${!tot && (cn || sh || fin(c.share)) ? '.' : ''}`);

    /* 2 · Contra la meta (solo el total: la meta existe por canal) */
    const b = tot ? m.a.bridge : null;
    if (b && (b.status === 'available' || b.status === 'partial') && fin(b.plan) && fin(b.actual) && b.plan > 0) {
      const g = b.actual - b.plan, r = g / b.plan, huge = Math.abs(r) > cfg.goalHuge, w = g >= 0 ? 'Supera la meta por' : 'Queda bajo la meta por';
      add('Contra la meta', `${w} ${bd(M1(Math.abs(g)))}${huge ? '; revisa que la meta sea del mismo alcance.' : '.'}`,
        `${w} ${bd(M1(Math.abs(g)))} (${pc(r)}).${huge ? ' Una diferencia tan grande suele indicar que la meta es de otro alcance (venta real diaria contra venta de productos) o que son datos de prueba: confirma antes de celebrar.' : ''}`);
    }

    /* 3 · Quién (solo el total, si una fila concentra ≥ 50 %) */
    if (tot) {
      const drag = m.cats.find((q) => q.d * net > 0), comp = m.cats.filter((q) => q.d * net < 0).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0], cov = m.r.compensation && fin(m.r.compensation.coveredPct) ? Math.round(m.r.compensation.coveredPct * 100) : null;
      if (drag && fin(drag.contrib) && Math.abs(drag.contrib) >= 0.5) add('Quién',
        `${bd(esc(x.nameOf(m, drag.key)))} explica ${Math.round(Math.abs(drag.contrib) * 100)} %${comp ? `; ${bd(esc(x.nameOf(m, comp.key)))} compensa${cov !== null ? ' ' + cov + ' %' : ''}` : ''}.`,
        `${bd(esc(x.nameOf(m, drag.key)))} explica ${Math.round(Math.abs(drag.contrib) * 100)} % del cambio (${M1(drag.d, true)})${Math.abs(drag.dpp) >= 0.3 ? ` y ${drag.dpp > 0 ? 'gana' : 'pierde'} ${Math.abs(drag.dpp).toFixed(1)} pp de participación` : ''}.${comp ? ` ${bd(esc(x.nameOf(m, comp.key)))} ${comp.d > 0 ? 'sube' : 'baja'} ${M1(comp.d, true)}${cov !== null ? ' y compensa ' + cov + ' %' : ''}.` : ''}`);
    }

    /* 4 · Dónde se concentra (señales geográficas de la fila) */
    if (!tot) {
      const gs = (m.r.geoSignals || []).filter((g) => String(g.entity) === String(key));
      if (gs.length) {
        const short = (g) => { const t = String(g.label).replace(/-/g, '−'), q = t.match(/el ([\d.]+) % de esa variación se concentra en (.+?) \(/), r2 = t.match(/donde más se movió fue (.+?)\.?$/); return q ? `${bd(Math.round(+q[1]) + ' %')} de la variación está en ${esc(q[2])}` : r2 ? `Donde más se movió: ${bd(esc(r2[1]))}` : esc(t); };
        add('Dónde', short(gs[0]) + '.', gs.slice(0, 2).map((g, i) => { const t = esc(String(g.label).replace(/-/g, '−')).replace(/\.$/, ''); return (i ? x.cap1(t.replace(/^[^;]+;\s*/, '')) : t) + '.'; }).join(' '));
      }
    }

    /* 5 · Desde cuándo y época */
    const parts = [], partsL = [];
    if (st && (st.episodes || []).length) {
      const eps = st.episodes, last = eps[eps.length - 1], prev = eps.length > 1 ? eps[eps.length - 2] : null, un = U[x.unitOf(ev)] || U.mes, cu = st.current || {};
      const vn = { stable: 'Estable', growth: 'Crece', decline: 'Cae', no_sales: 'Sin ventas' }[last.type] || 'Sin ventas', rel = (st.relative || [])[0];
      const relS = rel && fin(rel.diffPp) ? (Math.abs(rel.diffPp) < cfg.contextDiffPp ? `en línea con ${esc(rel.label)}` : `${bd(Math.abs(rel.diffPp).toFixed(0) + ' pp ' + (rel.diffPp > 0 ? 'mejor' : 'peor'))} que ${esc(rel.label)}`) : '';
      const nowS = ['falling', 'rising'].includes(cu.state) && fin(cu.change) && !((cu.state === 'falling' && last.type === 'decline') || (cu.state === 'rising' && last.type === 'growth')) ? `ahora ${bd((cu.state === 'falling' ? 'cae ' : 'sube ') + ab(cu.change), cu.state === 'falling' ? 'dn' : 'up')}` : '';
      const head = `${vn} hace ${bd(last.periods + ' ' + (last.periods === 1 ? un[0] : un[1]))}${prev && fin(prev.changePct) && prev.type !== 'stable' ? `, tras ${EPV[prev.type]} ${ab(prev.changePct, 0)}` : ''}`;
      parts.push(head + (nowS ? '; ' + nowS : '') + (relS && !nowS ? '; ' + relS : ''));
      partsL.push(`${esc(st.headline || '')}${rel ? ` Contra ${esc(rel.label)}: ${pc(rel.entityChange)} contra ${pc(rel.contextChange)} (${esc(x.ym(rel.window.from))} → ${esc(x.ym(rel.window.to))}).` : ''}`);
    }
    const se = state.pa.seasonal, sel = state.an.selected;
    if (se && !se.loading && fin(se.change) && fin(se.lastChange) && (tot ? !sel : sel && String(sel.entity) === String(key))) {
      const df = (se.change - se.lastChange) * 100;
      if (Math.abs(df) >= cfg.seasonDiffPp) { const t = `${df < 0 ? 'peor' : 'mejor'} que la misma época del año pasado (${x.sgn(df, 1)} pp)`; parts.push(t); partsL.push(`Es ${t}: este periodo ${pc(se.change)} y hace un año ${pc(se.lastChange)}.`); }
      else if (Math.abs(se.change) >= cfg.seasonMinChange) { parts.push('normal para la época'); partsL.push(`Es normal para la época: hace un año el mismo periodo ${se.lastChange >= 0 ? 'subió' : 'cayó'} ${ab(se.lastChange)}.`); }
    }
    if (parts.length) add(st ? 'Desde cuándo' : 'Época', parts.join('; ') + '.', partsL.join(' '));

    /* 6 · Qué lo explica: causas en orden fijo; solo entran las que aplican */
    const ex = [];
    const an = ev && ev.anomaly;
    if (an && fin(an.z) && an.z >= (fin(an.thresholdZ) ? an.thresholdZ : 2.5)) {
      const dr = an.direction === 'decrease' ? 'caída' : an.direction === 'increase' ? 'subida' : 'movimiento';
      ex.push({ s: `${x.cap1(dr)} inusual`, l: `Es una ${dr} inusual: se aleja del comportamiento histórico (z ${an.z.toFixed(1)}; umbral ${(fin(an.thresholdZ) ? an.thresholdZ : 2.5).toFixed(1)})` });
    }
    const hasF = rx && rx.current && rx.current.views, fo = hasF ? x.funnelOf(m, tot ? null : rx) : null, cmp = fo && fo.cmp;
    if (cmp) {
      const vC = cmp.steps[0].deltaPct, viewsOn = fin(vC) && Math.abs(vC) >= FP.config.products.signals.minChangePct;
      const z = zTest(fo.cur, fo.base), steps = cmp.steps.slice(1).filter((q) => fin(q.deltaPp)), weak = steps.slice().sort((p, q) => p.deltaPp - q.deltaPp)[0];
      const crOn = (z !== null && Math.abs(z) >= cfg.convZ && fin(cmp.cr.deltaPp) && Math.abs(cmp.cr.deltaPp) >= 0.05) || (weak && weak.deltaPp <= -cfg.stepMinPp);
      const step = weak ? weak : null, stx = step ? x.STEP[step.transition] || ['', 'del paso débil'] : null;
      if (crOn && step) {
        const wUp = step.deltaPp >= 0, vUp = viewsOn && vC > 0;
        ex.push({ s: `${vUp && !wUp ? `Vistas ${x.pcs(vC)}, pero ` : viewsOn ? `Vistas ${x.pcs(vC)}; ` : ''}${stx[1]} ${wUp ? 'sube' : 'baja'} de ${p1(step.rateBase)} a ${p1(step.rateCur)}`,
          l: `${vUp && !wUp ? `Las vistas suben ${x.pcs(vC)}, pero ` : viewsOn ? `Las vistas ${vC > 0 ? 'suben' : 'bajan'} ${x.pcs(vC)}; ` : ''}${stx[1]} ${wUp ? 'sube' : 'pasa'} de ${p1(step.rateBase)} a ${bd(p1(step.rateCur), wUp ? 'up' : 'dn')} (${x.sgn(step.deltaPp, 1)} pp)${vUp && !wUp ? ': llega más gente y compra menos' : ''}` });
      } else if (viewsOn) {
        ex.push({ s: `Vistas ${x.pcs(vC)}`, l: `Las vistas de ficha ${vC > 0 ? 'suben' : 'bajan'} ${x.pcs(vC)}${z !== null && Math.abs(z) < cfg.convZ ? ' con la conversión estable: el cambio viene del tráfico, no de convertir peor' : ''}` });
      }
    }
    const pvT = tot && m.a.pvm && m.a.pvm.total && fin(m.a.pvm.total.volume) ? m.a.pvm.total : null, pv = c.pv || pvT, dv = st && st.drivers;
    let fac = null;
    if (pv && fin(pv.volume) && fin(pv.price) && fin(pv.mix)) fac = [['mezcla', pv.mix], ['precio', pv.price], ['volumen', pv.volume]];
    else if (dv && fin(dv.volume) && fin(dv.price)) fac = [['precio', dv.price], ['volumen', dv.volume]];
    if (fac) {
      fac.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
      const sum = fac.reduce((t, q) => t + Math.abs(q[1]), 0), base = rx && rx.revenue && fin(rx.revenue.baseline) ? rx.revenue.baseline : null;
      if (sum > 0 && Math.abs(fac[0][1]) / sum >= cfg.factorShare && (base === null || Math.abs(c.d) / Math.abs(base) >= cfg.factorMinPct)) {
        ex.push({ s: `${bd(x.cap1(fac[0][0]) + ' ' + M1(fac[0][1], true))}${fac[1] ? ' y ' + fac[1][0] + ' ' + M1(fac[1][1], true) : ''}`, l: fac.map((q, i) => (i === 0 ? bd(x.cap1(q[0]) + ' ' + M1(q[1], true)) : `${q[0]} ${M1(q[1], true)}`)).join(', ') });
      }
    }
    /* se compensan: neto casi cero y mucho movimiento por debajo */
    const kids = tot ? m.cats.map((q) => ({ n: x.nameOf(m, q.key), d: q.d })) : (d && d.children ? d.children.rows.filter((q) => fin(q.delta)).map((q) => ({ n: q.key, d: q.delta })) : []);
    if (kids.length > 1 && Math.abs(c.p / 100) < cfg.offsetNetPct) {
      const gross = kids.reduce((t, q) => t + Math.abs(q.d), 0), downs = kids.filter((q) => q.d < 0).sort((p, q) => p.d - q.d), ups = kids.filter((q) => q.d > 0).sort((p, q) => q.d - p.d);
      if (downs.length && ups.length && gross >= cfg.offsetGrossMult * Math.max(Math.abs(c.d), 1)) {
        const dn = downs[0], upN = ups.slice(0, 2), upSum = ups.reduce((t, q) => t + q.d, 0), upNames = upN.map((q) => esc(q.n)).join(' y ');
        ex.push({ s: `Se mantiene porque ${esc(dn.n)} baja ${M1(dn.d, true)} y ${upNames} ${upN.length > 1 ? 'suben' : 'sube'} ${M1(upSum, true)}`, l: `El cambio neto es casi cero, pero hay movimiento por debajo: ${esc(dn.n)} baja ${bd(M1(dn.d, true))} y ${upNames} ${upN.length > 1 ? 'suben' : 'sube'} ${bd(M1(upSum, true))}. Se compensan` });
      }
    }
    /* productos que entran o salen */
    if (pv && fin(pv.delta) && pv.delta !== 0) {
      const nw = fin(pv.newItems) ? pv.newItems : 0, ls = fin(pv.lost) ? pv.lost : 0;
      if (Math.abs(nw) / Math.abs(pv.delta) >= cfg.newLostShare) ex.push({ s: `Productos nuevos aportan ${bd(Math.round(Math.abs(nw) / Math.abs(pv.delta) * 100) + ' %')} del cambio`, l: `Los productos que entraron al catálogo en el periodo aportan ${bd(Math.round(Math.abs(nw) / Math.abs(pv.delta) * 100) + ' %')} del cambio` });
      else if (Math.abs(ls) / Math.abs(pv.delta) >= cfg.newLostShare) ex.push({ s: `Productos que dejaron de venderse explican ${bd(Math.round(Math.abs(ls) / Math.abs(pv.delta) * 100) + ' %')}`, l: `Los productos que dejaron de venderse en el periodo explican ${bd(Math.round(Math.abs(ls) / Math.abs(pv.delta) * 100) + ' %')} del cambio` });
    }
    /* un canal concentra el cambio */
    const bc = d && d.byChannel ? d.byChannel.filter((q) => fin(q.delta)) : [];
    if (bc.length > 1) {
      const nt = bc.reduce((t, q) => t + q.delta, 0), tp = bc.slice().sort((p, q) => q.delta * Math.sign(nt) - p.delta * Math.sign(nt))[0];
      if (nt !== 0 && tp.delta * nt > 0 && tp.delta / nt >= cfg.channelShare) ex.push({ s: `${esc(tp.label)} explica ${bd(Math.round(tp.delta / nt * 100) + ' %')} del cambio`, l: `${bd(esc(tp.label))} explica ${Math.round(tp.delta / nt * 100)} % del cambio entre canales` });
    }
    /* de dónde viene el tráfico (solo el total) */
    if (tot) { const ts = trafficSource(m, state); if (ts) ex.push(ts); }
    /* nivel sin embudo */
    if (!fo && (GEO_LV.includes(m.level) || (m.state.pa.geo && Object.values(m.state.pa.geo).some(Boolean)))) ex.push({ s: 'Sin embudo en este nivel', l: 'No hay embudo en este nivel: el estado, la ciudad y la sucursal se definen en el checkout, después de la ficha' });
    if (ex.length) add('Qué lo explica', ex.slice(0, cfg.explainMaxShort).map((q) => q.s).join('. ') + '.', ex.map((q) => q.l).join('. ') + '. Es una descomposición, no una causa.');

    /* 7 · Clientes: último mes cerrado contra el anterior, solo si algún tipo se movió de verdad */
    const cs = d && d.customers && d.customers.status === 'ok' ? d.customers : null;
    if (cs && d.byPeriod) {
      const ks = d.byPeriod.filter((q) => !q.partial && /^\d{4}-\d{2}$/.test(String(q.key)) && cs.byMonth[q.key]).map((q) => q.key).sort();
      if (ks.length >= 2) {
        const k1 = ks[ks.length - 1], k0 = ks[ks.length - 2], u1 = cs.byMonth[k1], u0 = cs.byMonth[k0];
        const T = [['new', 'Nuevos', (u) => u.customers.new, !u1.reliableNew], ['recurrent', 'Recurrentes', (u) => u.customers.recurrent], ['reactivated', 'Recuperados', (u) => u.customers.reactivated], ['lapsed', 'No regresaron', (u) => u.lapsed]];
        const ch = T.filter((t) => !t[3]).map((t) => { const cV = t[2](u1), pV = t[2](u0); return { id: t[0], n: t[1], c: cV, p: pV, r: pV ? cV / pV - 1 : null }; })
          .filter((q) => fin(q.c) && fin(q.p) && fin(q.r));
        const big = ch.filter((q) => Math.abs(q.c - q.p) >= cfg.customersMinN && Math.abs(q.r) >= cfg.customersMinPct).sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
        if (big.length) {
          const g = (id) => big.find((q) => q.id === id), nw = g('new'), lp = g('lapsed'), rc = g('recurrent'), rv = g('reactivated');
          const read = nw && nw.r < 0 && lp && lp.r > 0 ? 'Caen los nuevos y suben los que no regresaron: la base se está erosionando.'
            : nw && nw.r > 0 && !rc ? 'El alza viene de clientes nuevos, no de los recurrentes.'
              : rc && rc.r < 0 ? 'Los recurrentes bajan: se pierde frecuencia en la base actual.'
                : rv && rv.r > 0 ? 'Se recuperan clientes que no compraban.' : '';
          const fm = (q) => `${q.n.toLowerCase()} ${x.num0(q.p)} → ${x.num0(q.c)} (${pc(q.r, 0)})`, lbl = `${x.cap1(monthName(k1))} vs ${monthName(k0)}`;
          add('Clientes', `${bd(lbl)}: ${big.slice(0, 2).map(fm).join('; ')}.`, `${bd(lbl)} (meses cerrados): ${big.map(fm).join('; ')}. ${read}`.trim());
        }
      }
    }

    /* 8 · Hacia dónde */
    const fc = x.fcOf(c);
    if (fc && fc.periods.length && fin(fc.periods[0].value)) {
      const p0 = fc.periods[0], cw = x.confOf(fc.level)[0], dir = Math.abs(fc.change || 0) < 0.03 ? 'sin dirección clara' : `la recta apunta a ${pc(fc.change, 1)}`;
      add('Hacia dónde',
        `Cierra ${esc(x.monthOf(p0.period))} cerca de ${bd(x.e1(p0.value))}, ${dir}, ${fc.level === 'low' ? bd('confianza baja') : 'confianza ' + cw}.`,
        `Cierra ${esc(x.monthOf(p0.period))} cerca de ${bd(x.e1(p0.value))} (rango ${x.e1(p0.low)} – ${x.e1(p0.high)}), ${dir}. ${fc.level === 'low' ? bd('Confianza baja') : 'Confianza ' + cw}${fin(fc.mape) ? `: en ${fc.tested} pruebas hacia atrás la regla se desvió ${(fc.mape * 100).toFixed(1)} %` : ''}.`);
    }

    /* 9 · Ojo: solo lo que afecta la lectura */
    const warn = [], warnL = [];
    if (st && st.reliability && st.reliability.level === 'low') { const t = `Lectura poco confiable: ${(st.reliability.reasons || []).join(', ')}`; warn.push(t); warnL.push(t); }
    if (ev && fin(ev.periodsAnalyzed) && ev.periodsAnalyzed < cfg.histShort) { warn.push(`Historia corta (${ev.periodsAnalyzed} periodos)`); warnL.push(`Solo hay ${ev.periodsAnalyzed} periodos de historia: las fases y la proyección son orientativas`); }
    const ord = rx && rx.current && rx.current.orders && fin(rx.current.orders.value) ? rx.current.orders.value : null;
    if (ord !== null && ord < cfg.fewOrders) { warn.push(`Pocos pedidos (${x.num0(ord)})`); warnL.push(`Con ${x.num0(ord)} pedidos, un par de pedidos grandes mueve la tendencia`); }
    if (!tot && m.level === 'branch') { warn.push('Sin inventario ni horarios: confirma con la tienda'); warnL.push('La app no trae inventario, horarios ni cierres: si hubo un cambio operativo, confirma con la tienda'); }
    const cv0 = m.tc.trackingCoverage, cov = cv0 && fin(cv0.value) ? cv0.value : null;
    if (fo && fin(cov) && cov < 1 - FP.config.products.signals.trackingGapPct) { const t = `Tracking de ${Math.round(cov * 100)} %: lee el embudo con cuidado`; warn.push(t); warnL.push(`Tracking de ${Math.round(cov * 100)} %: las compras de GA4 cubren menos de lo esperado y el embudo puede estar subestimado`); }
    if (m.ci.partial && days) warnL.push(`Periodo en curso (${days} días): se compara contra los mismos días de la referencia`);
    add(warn.length || warnL.length ? 'Ojo' : '', warn.length ? warn.join('. ') + '.' : '', warnL.length ? warnL.join('. ') + '.' : '');
    return out.filter((q) => q.k);
  }

  FP.pxResumen = { rows };
})(typeof window !== 'undefined' ? window : globalThis);
