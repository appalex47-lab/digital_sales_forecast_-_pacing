/**
 * cus-resumen.js — Reglas invisibles de «Clientes y LTV»: qué frase del veredicto, qué filas del resumen general y qué línea de lectura
 * de cada sección se muestran. Todo es descriptivo (qué cambió, no por qué) y sale de lo que ya calculó FP.customerEngine.
 * Los umbrales viven en FP.config.products.customers.summary y son PROVISIONALES (criterios propuestos, no benchmarks).
 * Una fila o línea que no tiene nada que decir simplemente no se arma.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.products.customers.summary;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESF = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const lab = (k) => `${MES[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  const labF = (k) => MESF[+k.slice(5, 7) - 1];
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const n0 = (v) => Math.round(v).toLocaleString('es-MX');
  const M = (v) => '$' + Math.round(v).toLocaleString('es-MX');
  const K1 = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)} M` : `$${Math.round(v / 1e3).toLocaleString('es-MX')} K`);
  const p1 = (v) => `${(v * 100).toFixed(1)} %`;
  const pc = (v, d) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d == null ? 0 : d)} %`;
  const B = (t) => `<b>${t}</b>`;
  const CH = (id) => { try { return FP.dataModel.getChannel(id).label; } catch (e) { return id; } };
  const prevKey = (k) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const monthEnd = (k) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).toISOString().slice(0, 10);

  /** Los dos últimos meses CERRADOS y consecutivos (el mes en curso no se compara: está incompleto). */
  function lastTwoClosed(r) {
    const closed = r.monthly.filter((m) => r.maxDay >= monthEnd(m.key));
    if (closed.length < 2) return null;
    const a = closed[closed.length - 1], b = closed[closed.length - 2];
    return prevKey(a.key) === b.key ? [a, b] : null;
  }
  const isOpen = (r) => { const l = r.monthly[r.monthly.length - 1]; return Boolean(l) && r.maxDay < monthEnd(l.key); };

  /** Cambio de cada tipo de cliente entre los dos últimos meses cerrados; «grande» = cambia ≥ N clientes y ≥ X %. */
  function mixChanges(r) {
    const two = lastTwoClosed(r), c = CFG();
    if (!two) return null;
    const [m1, m0] = two, out = [];
    [['n', 'Nuevos', (m) => m.customers.new, true], ['r', 'Recurrentes', (m) => m.customers.recurrent], ['x', 'Recuperados', (m) => m.customers.reactivated], ['l', 'No regresaron', (m) => m.lapsed]].forEach(([id, name, get, isNew]) => {
      if (isNew && !m1.reliableNew) return;
      const cur = get(m1), pre = get(m0);
      if (!fin(cur) || !fin(pre)) return;
      const rr = pre > 0 ? cur / pre - 1 : null;
      out.push({ id, n: name, c: cur, p: pre, r: rr, big: rr !== null && Math.abs(cur - pre) >= c.mixMinN && Math.abs(rr) >= c.mixMinPct });
    });
    return { o: out, m1: m1.key, m0: m0.key };
  }

  /** Las dos cohortes más recientes ya medibles en una ventana (mínimo de clientes maduros). */
  function latestPair(r, wi, min) {
    const ok = r.cohorts.filter((c) => c.windows[wi] && c.windows[wi].mature >= min && fin(c.windows[wi].ltv));
    return ok.length >= 2 ? [ok[ok.length - 1], ok[ok.length - 2]] : null;
  }

  function idsShare(info) {
    const bs = (info && info.batches) || [];
    let ln = 0, nc = 0, any = false;
    bs.forEach((b) => { if (fin(b.ln)) { any = true; ln += b.ln; nc += b.nc || 0; } });
    return any && ln > 0 ? 1 - nc / ln : null;
  }

  /** Cruce de canales: el cambio de canal más fuerte (fila con ≥ N clientes y ≥ X % fuera de la diagonal). */
  function migration(x) {
    const m = x && x.matrix, c = CFG();
    if (!m) return null;
    let best = null;
    m.cells.forEach((row, i) => {
      const rt = row.reduce((s, v) => s + v, 0);
      if (rt < c.migrateMinRow) return;
      row.forEach((v, j) => { if (i === j) return; const pp = v / rt; if (pp >= c.migrateShare && (!best || pp > best.pp)) best = { i, j, pp, rt, from: CH(m.channels[i]), to: CH(m.channels[j]) }; });
    });
    return best;
  }

  function build(r, ctx) {
    const c = CFG(), s = r.summary, x = r.extras || {}, rec = x.recency, ch = x.channels, cc = x.concentration;
    const monthly = r.monthly, nm = monthly.length, warm = monthly.filter((m) => !m.reliableNew).length;
    const insuf = nm > 0 && warm === nm;
    const mx = mixChanges(r), big = mx ? mx.o.filter((q) => q.big) : [];
    const g = (id) => big.find((q) => q.id === id);
    const er = Boolean(g('n') && g('n').r < 0 && g('l') && g('l').r > 0), gw = Boolean(g('n') && g('n').r > 0);
    const verdict = insuf ? 'Todavía no hay historia suficiente para medir bien la base de clientes.'
      : !mx ? 'Todavía no hay meses cerrados suficientes para comparar la base de clientes.'
        : er ? 'La base de clientes se está erosionando: caen los nuevos y suben los que no regresaron.'
          : gw ? 'La base de clientes crece, sobre todo por clientes nuevos.' : 'La base de clientes se mantiene estable.';

    /* ---- Confiabilidad ---- */
    const chips = [];
    chips.push([insuf || warm > 3 ? 'warn' : 'ok', `${insuf ? '◐' : '●'} Histórico ${insuf ? 'insuficiente' : 'suficiente'}`, `«Nuevo» solo es confiable si hay al menos ${r.options.warmupDays} días de datos antes de ese mes. Meses con histórico insuficiente: ${warm} de ${nm}.`]);
    const ids = idsShare(ctx.info);
    chips.push(ids === null ? ['mu', '○ IDs válidos: sin dato', 'Los archivos cargados antes de esta versión no guardaron cuántos pedidos traían un ID de cliente válido. Al recargarlos se calcula.']
      : [ids >= c.idsMinShare ? 'ok' : 'warn', `● IDs válidos ${Math.round(ids * 100)} %`, 'Líneas del archivo con ID de cliente válido (no vacío, 0, null ni invitado). Las demás no entran aquí, pero sí cuentan en Productos.']);
    const mat = r.cohorts.filter((q) => q.windows[3] && q.windows[3].mature >= q.size && q.size > 0).length;
    chips.push([mat >= 4 ? 'ok' : 'warn', `◐ Cohortes maduras a 180 días: ${mat} de ${r.cohorts.length}`, 'Solo cuentan clientes a los que ya les pasaron esos días; el LTV de una cohorte reciente subestima.']);
    chips.push(['mu', r.filtered ? '● Nuevo = primera compra de esta selección' : '● Nuevo = primer pedido en la empresa', r.filtered ? 'Con filtros de categoría, producto o sucursal, cada cliente se mide solo con sus compras de esa selección.' : 'Cambia a «primera compra de esta selección» si filtras por categoría, producto o sucursal.']);

    /* ---- Resumen general ---- */
    const S = [];
    {
      const s1 = `${B(n0(s.customers))} clientes; ${B(p1(s.repeatRate))} compra más de una vez.`;
      const l1 = `${B(n0(s.customers))} clientes con ${s.ordersPerCustomer.toFixed(1)} pedidos por cliente. ${B(p1(s.repeatRate))} compra más de una vez${fin(s.repeatRevenueShare) ? ` y esos clientes aportan ${p1(s.repeatRevenueShare)} de la venta` : ''}.${fin(s.medianDaysBetweenOrders) ? ` Entre un pedido y el siguiente pasan ${Math.round(s.medianDaysBetweenOrders)} días (mediana).` : ''}`;
      S.push(['Tamaño y repetición', s1, l1]);
    }
    let dpp = null;
    if (rec) {
      const a = rec.active, T = rec.total, ash = a / T;
      dpp = fin(rec.prevActiveShare) ? (ash - rec.prevActiveShare) * 100 : null;
      const ch1 = dpp !== null && Math.abs(dpp) >= c.activeChangePp ? ` Los activos ${dpp < 0 ? 'bajan' : 'suben'} ${Math.abs(dpp).toFixed(0)} pp contra hace 90 días.` : '';
      const ch2 = dpp !== null ? ` Contra hace 90 días, los activos ${Math.abs(dpp) < c.activeChangePp ? `casi no cambian (${dpp >= 0 ? '+' : '−'}${Math.abs(dpp).toFixed(1)} pp).` : `${dpp < 0 ? 'bajan' : 'suben'} ${Math.abs(dpp).toFixed(1)} pp.`}` : '';
      S.push(['Base activa', `${B(n0(a))} clientes activos (${p1(ash)}); ${n0(rec.risk)} en riesgo${rec.lostOk ? ` y ${n0(rec.lost)} perdidos.` : '.'}${ch1}`,
        `${B(n0(a))} de ${n0(T)} clientes (${p1(ash)}) compraron en los últimos ${c.activeDays} días. ${n0(rec.risk)} están en riesgo (su último pedido fue hace ${c.activeDays} a ${c.riskDays} días)${rec.lostOk ? ` y ${n0(rec.lost)} están perdidos (más de ${c.riskDays} días sin pedido).` : `. Con menos de ${c.riskDays} días de historia todavía no se puede separar a los perdidos.`}${ch2}`]);
    }
    const two = lastTwoClosed(r);
    if (mx && big.length) {
      const fm = (q) => `${q.n.toLowerCase()} ${n0(q.p)} → ${n0(q.c)} (${pc(q.r)})`, sorted = big.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      const read = er ? 'Caen los nuevos y suben los que no regresaron: la base se está erosionando.' : gw && !g('r') ? 'El alza viene de clientes nuevos, no de los recurrentes.' : g('r') && g('r').r < 0 ? 'Los recurrentes bajan: se pierde frecuencia en la base actual.' : g('x') && g('x').r > 0 ? 'Se recuperan clientes que no compraban.' : '';
      const head = B(`${cap1(labF(mx.m1))} vs ${labF(mx.m0)}`);
      S.push(['Mezcla del mes', `${head}: ${sorted.slice(0, 2).map(fm).join('; ')}.`, `${head} (meses cerrados): ${sorted.map(fm).join('; ')}. ${read}`.trim()]);
    }
    if (two) {
      const [m1, m0] = two, t1 = m1.revenue.total, t0 = m0.revenue.total;
      if (t1 > 0 && t0 > 0) {
        const nmz = ['nuevos', 'recurrentes', 'recuperados'], k = ['new', 'recurrent', 'reactivated'];
        let best = null;
        k.forEach((q, i) => { if (q === 'new' && !m1.reliableNew) return; const d = (m1.revenue[q] / t1 - m0.revenue[q] / t0) * 100; if (Math.abs(d) >= c.revShiftPp && (!best || Math.abs(d) > Math.abs(best.d))) best = { i, d, sh: m1.revenue[q] / t1 }; });
        if (best) S.push(['Venta por tipo', `${B(cap1(nmz[best.i]))} aportan ${Math.round(best.sh * 100)} % de la venta de ${labF(m1.key)} (${best.d >= 0 ? '+' : '−'}${Math.abs(best.d).toFixed(0)} pp contra ${labF(m0.key)}).`,
          `${B(cap1(nmz[best.i]))} aportan ${Math.round(best.sh * 100)} % de la venta de ${labF(m1.key)}, ${Math.abs(best.d).toFixed(1)} pp ${best.d >= 0 ? 'más' : 'menos'} que en ${labF(m0.key)}. La venta total de clientes con ID fue ${K1(t1)} contra ${K1(t0)}.`]);
      }
    }
    const pr = latestPair(r, 2, c.retMinCohort);
    let retDiff = null;
    if (pr) {
      const a = pr[0].windows[2], b = pr[1].windows[2];
      if (fin(a.repeatRate) && fin(b.repeatRate)) {
        retDiff = (a.repeatRate - b.repeatRate) * 100;
        if (Math.abs(retDiff) >= c.retDiffPp) S.push(['Retención', `${B(lab(pr[0].key))}: vuelve ${p1(a.repeatRate)} a 90 días, contra ${p1(b.repeatRate)} de ${lab(pr[1].key)}.`,
          `${B(lab(pr[0].key))}: ${p1(a.repeatRate)} de la cohorte vuelve a comprar en sus primeros 90 días, ${Math.abs(retDiff).toFixed(1)} pp ${retDiff < 0 ? 'menos' : 'más'} que la cohorte de ${lab(pr[1].key)} (${p1(b.repeatRate)}). Solo se comparan cohortes ya medibles y de al menos ${c.retMinCohort} clientes.`]);
      }
    }
    const lp = latestPair(r, 3, c.retMinCohort);
    let ltvCh = null;
    if (lp) {
      const a = lp[0].windows[3], b = lp[1].windows[3];
      if (b.ltv > 0) {
        ltvCh = a.ltv / b.ltv - 1;
        if (Math.abs(ltvCh) >= c.ltvChangePct) S.push(['LTV', `${B(lab(lp[0].key))}: ${M(a.ltv)} a 180 días, ${pc(ltvCh)} contra ${lab(lp[1].key)}.`,
          `${B(lab(lp[0].key))}: cada cliente acumula ${M(a.ltv)} en sus primeros 180 días, ${pc(ltvCh)} contra la cohorte de ${lab(lp[1].key)} (${M(b.ltv)}). Es venta, no margen.`]);
      }
    }
    const cq = (r.byFirstChannel || []).filter((q) => q.size >= c.channelMin && q.windows[3] && q.windows[3].mature >= c.channelMin && q.windows[3].ltv > 0).sort((a, b) => b.windows[3].ltv - a.windows[3].ltv);
    let chBest = null, chWorst = null, chGap = null;
    if (cq.length > 1) {
      chBest = cq[0]; chWorst = cq[cq.length - 1]; chGap = chBest.windows[3].ltv / chWorst.windows[3].ltv - 1;
      if (chGap >= c.channelQualityPct) S.push(['Canal', `${B(CH(chBest.channel))} trae mejores clientes que ${CH(chWorst.channel)} (${pc(chGap)} de LTV).`,
        `${B(CH(chBest.channel))} trae mejores clientes: su LTV a 180 días es ${pc(chGap)} contra ${CH(chWorst.channel)}, considerando el canal del primer pedido.`]);
    }
    const mg = migration(ch);
    const multiOk = ch && fin(ch.multiShare) && ch.multiShare >= c.multiShare;
    if (multiOk || mg) {
      const a1 = `${B(p1(ch.multiShare))} compra en más de un canal${fin(ch.multiTimes) ? ` y vale ${ch.multiTimes.toFixed(1)} veces más` : ''}.`;
      const a2 = mg ? ` ${B(`${Math.round(mg.pp * 100)} %`)} de quienes entraron por ${mg.from} hoy compra por ${mg.to}.` : '';
      S.push(['Entre canales', `${multiOk ? a1 : ''}${a2}`.trim(),
        `${multiOk ? `${B(p1(ch.multiShare))} de los clientes (${n0(ch.multiCustomers)}) compra en más de un canal${fin(ch.multiTimes) ? ` y cada uno vale ${ch.multiTimes.toFixed(1)} veces más que quien compra en un solo canal.` : '.'}` : ''}${mg ? ` Entre los clientes activos, ${Math.round(mg.pp * 100)} % de quienes entraron por ${mg.from} hoy compra por ${mg.to} (${n0(mg.rt)} clientes de ese canal de entrada). Es canal de entrada, no atribución de marketing.` : ''}`.trim()]);
    }
    const cdiff = cc && fin(cc.top10Prev) ? (cc.top10 - cc.top10Prev) * 100 : null;
    if (cc && fin(cc.top10) && (cc.top10 >= c.topShare || (cdiff !== null && Math.abs(cdiff) >= c.topChangePp))) {
      S.push(['Concentración', cc.top10 >= c.topShare ? `El 10 % de clientes que más compra aporta ${B(`${Math.round(cc.top10 * 100)} %`)} de la venta: alta dependencia.`
        : `El 10 % de clientes que más compra aporta ${B(`${Math.round(cc.top10 * 100)} %`)} de la venta (${cdiff > 0 ? '+' : '−'}${Math.abs(cdiff).toFixed(0)} pp en 6 meses).`,
      `El 10 % de clientes que más compra aporta ${B(`${Math.round(cc.top10 * 100)} %`)} de la venta${fin(cc.top10Prev) ? `, contra ${Math.round(cc.top10Prev * 100)} % hace 6 meses` : ''}.${cc.top10 >= c.topShare ? ' Perder a unos pocos clientes grandes movería mucho la venta.' : ''}${insuf ? ' Con tan pocos meses de historia, esta cifra todavía puede cambiar mucho.' : ''}`]);
    }
    const w = [], wl = [];
    if (warm > 0) { w.push(`${warm} de ${nm} meses con histórico insuficiente`); wl.push(`${warm} de ${nm} meses tienen menos de ${r.options.warmupDays} días de datos antes: ahí un cliente que ya compraba aparece como «nuevo». Cargar el año anterior lo corrige`); }
    if (ids !== null && ids < c.idsMinShare) { w.push(`Solo ${Math.round(ids * 100)} % de las líneas con ID válido`); wl.push(`Solo ${Math.round(ids * 100)} % de las líneas del archivo trae un ID de cliente válido; el resto no entra en estas cifras`); }
    if (r.cohorts.length && !r.cohorts.some((q) => q.windows[2] && q.windows[2].mature > 0)) { w.push('Sin cohortes maduras para LTV'); wl.push('Todavía no hay cohortes con 90 o 180 días de vida: el LTV y la retención aún no se pueden medir'); }
    if (isOpen(r)) wl.push(`${cap1(labF(monthly[nm - 1].key))} sigue en curso: sus cifras todavía pueden cambiar y no se comparan arriba`);
    if (w.length || wl.length) S.push(['Ojo', w.length ? `${w.join('. ')}.` : '', `${wl.join('. ')}.`]);
    const ORD = ['Tamaño y repetición', 'Base activa', 'Mezcla del mes', 'Venta por tipo', 'Retención', 'LTV', 'Canal', 'Entre canales', 'Concentración', 'Ojo'];
    S.sort((a, b) => ORD.indexOf(a[0]) - ORD.indexOf(b[0]));

    /* ---- Una línea de lectura por sección (solo si hay algo que decir) ---- */
    const L = { a: '', m: '', l: '', r: '', c: '', x: '', p: '' };
    if (rec) { if (!rec.lostOk) L.a = `Con menos de ${c.riskDays} días de historia todavía no se puede separar a los perdidos.`; else if (dpp !== null && Math.abs(dpp) >= c.activeChangePp) L.a = `Los activos ${dpp < 0 ? 'bajan' : 'suben'} ${B(`${Math.abs(dpp).toFixed(0)} pp`)} contra hace ${c.activeDays} días.`; }
    if (mx && big.length) { const q = big.slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]; L.m = `${B(lab(mx.m1))}: ${q.n.toLowerCase()} ${n0(q.p)} → ${n0(q.c)} (${pc(q.r)}) contra ${lab(mx.m0)}.`; }
    if (lp) L.l = Math.abs(ltvCh) >= c.ltvChangePct ? `${B(lab(lp[0].key))} vale ${M(lp[0].windows[3].ltv)} a 180 días, ${pc(ltvCh)} contra ${lab(lp[1].key)}.` : '';
    else if (r.cohorts.length) L.l = 'Todavía no hay cohortes con 180 días de vida para comparar.';
    if (pr) L.r = retDiff !== null && Math.abs(retDiff) >= c.retDiffPp ? `A 90 días vuelve ${B(p1(pr[0].windows[2].repeatRate))} de la cohorte de ${lab(pr[0].key)}, contra ${p1(pr[1].windows[2].repeatRate)} de ${lab(pr[1].key)}.` : '';
    else if (r.cohorts.length) L.r = 'Todavía no hay cohortes con 90 días de vida.';
    if (chBest && chGap >= c.channelQualityPct) {
      const rb = chBest.windows[2], rw = chWorst.windows[2];
      L.c = fin(rb.repeatRate) && fin(rw.repeatRate) && rb.mature >= c.channelMin && rw.mature >= c.channelMin && rb.repeatRate > rw.repeatRate
        ? `${B(CH(chBest.channel))} retiene ${((rb.repeatRate - rw.repeatRate) * 100).toFixed(0)} pp más que ${CH(chWorst.channel)}.` : `${B(CH(chBest.channel))} trae el LTV más alto a 180 días (${M(chBest.windows[3].ltv)}).`;
    }
    if (mg) L.x = `${B(`${Math.round(mg.pp * 100)} %`)} de quienes entraron por ${mg.from} hoy compra por ${mg.to}.`;
    if (cc && fin(cc.top10)) { if (cc.top10 >= c.topShare) L.p = 'Hay alta dependencia: perder a unos pocos clientes grandes movería mucho la venta.'; else if (cdiff !== null && Math.abs(cdiff) >= c.topChangePp) L.p = `La concentración ${cdiff > 0 ? 'sube' : 'baja'} ${B(`${Math.abs(cdiff).toFixed(0)} pp`)} en 6 meses.`; }

    return { verdict, chips, rows: S, lec: L, insuf, warm, nm, ids, mig: mg, open: isOpen(r) };
  }

  FP.cusResumen = { build, mixChanges, lastTwoClosed, migration, idsShare, lab, labF, n0, M, K1, p1, pc, CH };
})(typeof window !== 'undefined' ? window : globalThis);
