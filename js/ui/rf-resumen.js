/**
 * rf-resumen.js — Reglas invisibles de «Recovery & Reforecast»: qué frase del veredicto, qué chips de confiabilidad, qué filas del resumen general,
 * qué línea de lectura de cada sección y qué acciones de «¿Qué hago con esto?» se muestran. Descriptivo: solo repite lo que ya calculó
 * FP.reforecastEngine (plan, forecast, reforecast, requerido, presión, drivers, confianza y validaciones); no calcula cifras nuevas ni dice causas.
 * El reforecast es un requerimiento, no un pronóstico. Umbrales en FP.config.reforecast.summary (PROVISIONALES).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const CFG = () => FP.config.reforecast.summary;
  const B = (t) => `<b>${t}</b>`;
  const esc = (v) => FP.ui.helpers.esc(v);
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const S = (rf, ch) => (ch === 'total' ? rf.total : rf.channels[ch]);

  function fmt() {
    const F = FP.format, M = (v) => F.currency(Math.abs(v), 0), SM = (v) => (Math.abs(v) < 0.5 ? F.currency(0, 0) : (v > 0 ? '+' : '−') + M(v));
    const pc = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} %`;
    return { M, SM, pc, n0: (v) => F.integer(v), p2: (v) => `${(v * 100).toFixed(2)} %` };
  }
  const horizonLabel = (h) => (h.type === 'year' ? `año ${h.key}` : `${MONTHS[+h.key.slice(5, 7) - 1]} ${h.key.slice(0, 4)}`);
  const goalOf = (h) => (h.type === 'year' ? `la meta del año ${h.key}` : `la meta de ${MONTHS[+h.key.slice(5, 7) - 1]} ${h.key.slice(0, 4)}`);

  /** Realismo: cuánto pide cada palanca (un solo driver) sobre su histórico del mismo periodo. null si falta histórico o un escenario. */
  function realism(rf, ch) {
    const d = S(rf, ch).drivers, c = d && d.scenarios, hi = d && d.historical;
    if (!c || !hi) return null;
    const rows = [['conversionRate', 'Conversión', c.B && c.B.required, hi.conversionRate, 'B'], ['aov', 'AOV', c.C && c.C.required, hi.aov, 'C'], ['trafficVolume', 'Volumen', c.A && c.A.required, hi.trafficPerYear, 'A']]
      .filter((r) => fin(r[2]) && fin(r[3]) && r[3] > 0).map((r) => ({ k: r[0], label: r[1], req: r[2], hist: r[3], sc: r[4], delta: r[2] / r[3] - 1 }));
    if (!rows.length) return null;
    const cfg = CFG(), mn = Math.min(...rows.map((r) => r.delta));
    const verdict = mn <= cfg.realOk ? 'Alcanzable con una sola palanca' : mn <= cfg.realHard ? 'Exigente pero posible: conviene combinar palancas' : 'Poco realista con una sola palanca: hace falta combinar varias';
    return { rows, mn, max: Math.max(...rows.map((r) => r.delta)), verdict, short: verdict.split(':')[0] };
  }

  /** @param {object} state  @returns {{ok, verdict, chips, rows, lec, actions, flags}} */
  function build(state) {
    const rf = state.rf.run, f = fmt(), cfg = CFG();
    if (!rf || rf.plan.source === 'none') return { ok: false };
    const t = rf.total, h = t.horizon, hs = t.horizonSummary || {}, conf = t.confidence.level;
    const target = h.target, actual = h.actualToDate, fc = hs.forecast ? hs.forecast.revenue : null, refc = hs.reforecast ? hs.reforecast.revenue : null;
    const req = h.requiredTotal, press = hs.pressure ? hs.pressure.revenue.pressure : null, days = h.countedDays, futureDays = h.futureDays, sur = h.surplus || 0;
    const gap = fin(fc) && fin(target) ? fc - target : null, gapPct = gap !== null && target > 0 ? gap / target : null;
    const chRows = FP.config.channelIds.map((id) => { const s = rf.channels[id], x = s.horizonSummary; return { id, label: FP.pacingView.chLabel(id), req: x && x.required ? x.required.revenue : null, press: x && x.pressure ? x.pressure.revenue.pressure : null, fc: x && x.forecast ? x.forecast.revenue : null, target: s.horizon.target, surplus: s.horizon.surplus }; });
    const pending = chRows.filter((c) => fin(c.req) && c.req > 0).sort((a, b) => b.req - a.req);
    const R = realism(rf, state.rf.channel);

    /* ---- Veredicto ---- */
    const verdict = (() => {
      if (!futureDays) return `El horizonte ya cerró: se vendió ${f.M(actual)} contra ${goalOf(h)} de ${f.M(target)}${fin(actual) && target > 0 ? ` (${f.pc(actual / target - 1)})` : ''}.`;
      if (gap === null) return `Para llegar a ${goalOf(h)} hay que vender ${f.M(req)} más en los ${futureDays} días que quedan.`;
      if (gapPct >= cfg.flatPct) return `El forecast llega a ${goalOf(h)}: la supera por ${f.M(gap)} (${f.pc(gapPct)}).${req > 0 ? ` Aun así, ${pending.length} canal${pending.length === 1 ? '' : 'es'} todavía necesita${pending.length === 1 ? '' : 'n'} vender ${f.M(req)} más.` : ''}`;
      if (Math.abs(gapPct) < cfg.flatPct) return `El forecast queda en línea con ${goalOf(h)} (${f.SM(gap)}), pero para sostenerla hay que vender ${f.M(req)} más en los ${futureDays} días que quedan${conf === 'insufficient' || days < cfg.minDays ? ', y todavía hay muy poca historia para fiarse de ese número.' : '.'}`;
      return `Para llegar a ${goalOf(h)} hay que vender ${f.M(req)} más en los ${futureDays} días que quedan${fin(press) ? `: ${f.pc(press)} sobre el plan de esos días` : ''}. El forecast se queda ${f.M(gap)} por debajo.`;
    })();

    /* ---- Confiabilidad ---- */
    const chips = [], checks = rf.validation.checks.filter((c) => c.applicable !== false), okN = checks.filter((c) => c.pass).length;
    const low = conf === 'insufficient' || conf === 'limited';
    chips.push([low ? 'warn' : 'ok', `${low ? '◐' : '●'} Confianza ${FP.config.confidenceLabels[conf] ? FP.config.confidenceLabels[conf].toLowerCase() : conf}`, low ? `Hay ${days} días con real: el requerimiento se reparte sobre poca historia. Úsalo como orden de magnitud, no como compromiso.` : 'Historia suficiente de venta real y de plan: el cálculo es estable para decidir.']);
    chips.push([okN === checks.length ? 'ok' : 'warn', `● ${okN} de ${checks.length} validaciones cierran`, 'El pendiente repartido suma lo requerido, los días congelados no cambian y el plan original no se toca.']);
    chips.push(['mu', '● Plan original: nunca cambia', 'Plan, forecast y reforecast son realidades distintas. Esta pantalla no modifica el plan.']);
    chips.push(['mu', `● Reparto ${h.weightMethod === 'uniform_future_distribution' ? 'uniforme (sin pesos)' : 'por pesos futuros del plan'}`, h.weightMethod === 'uniform_future_distribution' ? 'No hubo pesos futuros utilizables: el pendiente se reparte parejo y la confianza queda limitada.' : 'Cada día futuro recibe el pendiente según su peso en el plan original.']);
    chips.push(['mu', `● Referencia ${esc(rf.referenceDate)}${state.rf.simDate ? ' (simulada)' : ''}`, `Fecha de referencia de Pacing y Forecast; el corte de real es ${esc(rf.cutoff || '—')}.`]);
    if (days < cfg.minDays) chips.push(['warn', `◐ Solo ${days} días con real`, 'Con pocos días de real, la presión de recuperación se infla: compárala contra el plan de esos días con cuidado.']);
    if (sur > 0) chips.push(['mu', `● Surplus ${f.M(sur)}`, 'Canales que ya superaron su meta. Su requerimiento es 0 y ese exceso no cubre a los demás.']);

    /* ---- Resumen general ---- */
    const rows = [];
    rows.push(['Meta y avance', `Llevas ${B(f.M(actual))} de ${f.M(target)}${target > 0 ? ` (${Math.round(actual / target * 100)} %)` : ''} con ${days} días de real.`,
      `Llevas ${f.M(actual)} de ${goalOf(h)} (${f.M(target)})${target > 0 ? `, ${(actual / target * 100).toFixed(1)} %` : ''}, con ${days} días con real congelados. El plan original no cambia.`]);
    if (futureDays && req > 0) rows.push(['Qué falta', `Faltan ${B(f.M(req))} en ${futureDays} días${fin(press) ? `: ${B(f.pc(press))} sobre el plan de esos días` : ''}.`,
      `Pendiente ${f.M(req)} repartido en ${futureDays} días futuros${hs.planOpen && fin(hs.planOpen.revenue) ? ` (plan de esos días ${f.M(hs.planOpen.revenue)})` : ''}${fin(press) ? `: presión ${f.pc(press)}` : ''}. Brecha neta ${f.M(Math.max(0, target - actual))}${sur > 0 ? ` + surplus ${f.M(sur)} de canales que ya llegaron` : ''}.`]);
    else if (futureDays) rows.push(['Qué falta', `${B('Nada más por recuperar')}: todos los canales ya llegaron a su meta.`, 'Todos los canales ya superaron su meta; el requerimiento es 0.']);
    if (gap !== null) rows.push(['Forecast', `Cierra en ${B(f.M(fc))} (${gap >= 0 ? '+' : '−'}${f.M(gap)} contra la meta). Método ${esc(rf.forecast.method.id)}.`,
      `El forecast actual cierra en ${f.M(fc)}, ${gap >= 0 ? f.M(gap) + ' por encima' : f.M(gap) + ' por debajo'} de la meta. El reforecast no es un pronóstico: es lo que tendría que ocurrir.`]);
    if (pending.length && req > 0) { const p = pending[0];
      rows.push(['Dónde', `${B(esc(p.label))} concentra el ${Math.round(p.req / req * 100)} % del pendiente (${f.M(p.req)}${fin(p.press) ? `, ${f.pc(p.press)}` : ''}).`,
        `Pendiente por canal: ${pending.map((c) => `${esc(c.label)} ${f.M(c.req)}${fin(c.press) ? ` (${f.pc(c.press)})` : ''}`).join('; ')}.${chRows.some((c) => fin(c.req) && c.req === 0) ? ` Ya llegaron: ${chRows.filter((c) => c.req === 0).map((c) => esc(c.label)).join(', ')}.` : ''}`]); }
    const d = S(rf, 'total').drivers, sens = d && d.sensitivity;
    if (futureDays && req > 0 && sens && fin(sens.additionalOrdersAtForecastAov) && fin(sens.additionalTrafficAtForecastCrAov)) rows.push(['Qué cambiar',
      `Equivale a ${B((sens.additionalOrdersAtForecastAov < 0 ? '−' : '+') + f.n0(Math.abs(sens.additionalOrdersAtForecastAov)) + ' pedidos')} con AOV constante, o ${B((sens.additionalTrafficAtForecastCrAov < 0 ? '−' : '+') + f.n0(Math.abs(sens.additionalTrafficAtForecastCrAov)) + ' visitas')} con CR y AOV constantes.`,
      `Contra el forecast de los días que quedan: ${f.SM(sens.additionalRevenue)} de venta, ${f.n0(sens.additionalOrdersAtForecastAov)} pedidos con el AOV del forecast, o ${f.n0(sens.additionalTrafficAtForecastCrAov)} visitas con CR y AOV constantes. Son escenarios matemáticos, no recomendaciones.`]);
    if (futureDays && req > 0 && R) rows.push(['Realismo', `${B(esc(R.short))}: la palanca más barata es ${B(f.pc(R.mn))} sobre el histórico.`,
      `Contra el mismo periodo de años anteriores, mover una sola palanca hasta el valor requerido cuesta entre ${f.pc(R.mn)} y ${f.pc(R.max)} (${esc(R.verdict)}).`]);
    const mx = S(rf, 'total').months.filter((m) => m.status !== 'closed' && m.pressure && m.pressure.revenue && fin(m.pressure.revenue.pressure)).sort((a, b) => b.pressure.revenue.pressure - a.pressure.revenue.pressure)[0];
    if (mx && req > 0) { const mi = +mx.key.slice(5, 7) - 1;
      rows.push(['Mes más exigente', `${B(MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1))}: presión ${B(f.pc(mx.pressure.revenue.pressure))} sobre su plan.`, `El mes que recibe más requerimiento frente a su plan es ${MONTHS[mi]} (${f.pc(mx.pressure.revenue.pressure)}). El pendiente se carga más en los meses fuertes.`]); }
    const chg = FP.reforecastVersioning.reforecastChange(state.rf.registry, rf);
    if (chg && fin(chg.required.change) && fin(chg.required.previous)) rows.push(['Cambio vs versión', `El requerido ${chg.required.change >= 0 ? 'subió' : 'bajó'} ${B(f.M(chg.required.change))} contra ${esc(chg.previous.version)}.`,
      `Contra ${esc(chg.previous.version)} (${esc(chg.previous.referenceDate)}${chg.sameHorizon ? '' : ', otro horizonte'}) el requerido pasó de ${f.M(chg.required.previous)} a ${f.M(req)} (${fin(chg.required.changePct) ? f.pc(chg.required.changePct) : '—'}). Muestra el cambio, no interpreta la causa.`]);
    const w = [], wl = [];
    if (low) { w.push(`Confianza ${FP.config.confidenceLabels[conf] ? FP.config.confidenceLabels[conf].toLowerCase() : conf}`); wl.push(`Hay ${days} días con real: el requerimiento y la presión no son confiables todavía`); }
    if (sur > 0) { w.push(`Surplus de ${f.M(sur)}`); wl.push('El requerimiento es mayor que la brecha neta porque lo que un canal vendió de más no compensa a los demás'); }
    if (state.rf.simDate) { w.push('Simulación activa'); wl.push(`Estás viendo un escenario temporal al ${esc(state.rf.simDate)}: no modifica datos, plan ni forecast guardados`); }
    if (h.weightMethod === 'uniform_future_distribution') { w.push('Reparto uniforme'); wl.push('No hubo pesos futuros utilizables: el pendiente se reparte parejo'); }
    if (w.length) rows.push(['Ojo', `${w.join('. ')}.`, `${wl.join('. ')}.`]);

    /* ---- Línea de lectura ---- */
    const L = { s1: '', s2: '', sg: '', sr: '' };
    if (futureDays && req > 0) L.s1 = low ? `Con ${days} días de real la presión${fin(press) ? ` de ${f.pc(press)}` : ''} no es creíble: espera más historia antes de usarla.` : (fin(press) ? `La presión de ${B(f.pc(press))} compara lo requerido contra el plan de los ${futureDays} días que quedan.` : '');
    if (pending.length > 1 && req > 0) L.s2 = `${B(esc(pending[0].label))} concentra ${Math.round(pending[0].req / req * 100)} % del pendiente.`;
    if (gapPct !== null && gapPct <= -cfg.flatPct && futureDays > 0) L.sg = `Sin cambios el cierre sería ${B(f.M(fc))}, ${(fc / target * 100).toFixed(1)} % de la meta.`;
    if (R && req > 0) L.sr = `Lo que cuesta mover una sola palanca: la más barata es ${B(f.pc(R.mn))} sobre su histórico. ${B(esc(R.verdict))}.${low ? ` Con ${days} días de real, el histórico y el requerimiento todavía son frágiles.` : ''}`;

    /* ---- ¿Qué hago con esto? ---- */
    const A = [];
    A.push({ id: 'dx', title: 'Diagnosticar la recuperación', desc: 'Abre Diagnóstico con el reforecast contra el forecast del mismo horizonte y canal, para ver qué driver explica lo que falta.' });
    const why = !futureDays ? 'El horizonte ya cerró: no hay días que recuperar.' : !(req > 0) ? 'No hay nada que recuperar.' : conf === 'insufficient' ? `Con ${days} días de real la presión no es confiable: espera más historia.` : state.rf.metric !== 'revenue' ? 'Recuperar trabaja con la venta: cambia la métrica a Venta.' : '';
    A.push({ id: 'rec', title: 'Simular la recuperación', why, desc: `Abre Recuperar con el mismo horizonte y canal${pending.length ? `, empezando por ${esc(pending[0].label)} (${f.M(pending[0].req)})` : ''}. Tú revisas el escenario y lo guardas; no se guarda solo.` });
    A.push({ id: 'pac', title: 'Ver el canal en Pacing', desc: 'Abre Pacing y Forecast con el mismo canal para ver cómo viene contra el plan a la fecha.' });
    A.push({ id: 'ver', title: 'Guardar esta versión', desc: 'Lleva a «Versiones y exportar» con el botón de guardar a la vista. No guarda nada por sí solo.' });
    return { ok: true, verdict, chips, rows, lec: L, actions: A, flags: { noGo: gapPct !== null && gapPct <= -cfg.flatPct && futureDays > 0, real: R }, real: R };
  }

  FP.rfResumen = { build, realism, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
