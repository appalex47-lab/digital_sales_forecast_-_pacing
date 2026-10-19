/**
 * attentionEngine.js — «Qué necesita atención» y «Tu siguiente mejor paso» (Inicio, etapa 1 del rediseño).
 *
 * NO calcula métricas de negocio. Lee lo que ya calcularon los motores existentes y lo ordena con reglas explícitas:
 *   - status    → FP.contextEngine.collectStatus(state)   (datos cargados, plan, forecast, reforecast, diagnóstico, escenarios, acciones)
 *   - readiness → FP.contextEngine.dataReadiness(status)  (qué falta para que el análisis sea confiable)
 *   - summary   → FP.homeSummaryEngine.compute(state, h)  (brecha contra el plan, aporte de cada driver, canales, confianza de datos)
 *   - actions   → plan de acciones (estado, fecha de fin, mediciones)
 *
 * Cada hallazgo separa: hecho observado · descomposición cuantitativa · hipótesis (solo como pregunta a validar) · información que falta ·
 * próxima comprobación. Una contribución cuantitativa NUNCA se presenta como causa demostrada.
 *
 * El «respaldo de la evidencia» no es una probabilidad: es una regla visible sobre cobertura de días comparados y calidad de datos.
 * Los pasos de la ruta tienen estado (bloqueado, disponible, en curso, completado, requiere atención, en espera); un paso solo se completa
 * cuando se cumple su criterio de salida con datos reales, nunca por haber hecho clic.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /* Umbrales (únicos puntos de ajuste; la interfaz los muestra en «Cómo se decide»). */
  const RULES = { maxRoutes: 3,
    staleDays: 3,                 // la venta real más reciente tiene más de 3 días respecto a «Datos al»: datos desactualizados
    driverMinShare: 0.3,          // un driver entra como hallazgo si aporta al menos 30 % de la brecha (en valor absoluto)
    coverageHigh: 0.9,            // respaldo alto: ≥ 90 % de los días comparados…
    coverageMid: 0.6,             // …medio: ≥ 60 %; menos, bajo
    maxVisible: 3                 // hallazgos visibles; el resto va en «Ver los demás»
  };

  const DRIVER = {
    trafficVolume: { id: 'traffic', name: 'Tráfico', short: 'el volumen de sesiones' },
    conversionRate: { id: 'cr', name: 'Conversión', short: 'la tasa de conversión' },
    aov: { id: 'aov', name: 'Ticket promedio', short: 'el ticket promedio' }
  };
  const money = (v) => (fin(v) ? `$${Math.round(Math.abs(v)).toLocaleString('es-MX')}` : '—');
  const pct = (v, d = 1) => (fin(v) ? `${(Math.abs(v) * 100).toFixed(d)} %` : '—');
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  /** Respaldo de la evidencia: regla visible sobre cobertura de días comparados y calidad de datos. */
  function support(input) {
    const cov = input.summary && input.summary.whyPlan && input.summary.whyPlan.coverage;
    const q = input.status && input.status.data ? input.status.data.quality : null;
    const ratio = cov && cov.expected ? cov.paired / cov.expected : null;
    const excluded = input.summary && input.summary.excluded;
    let level, why;
    if (!fin(ratio)) { level = 'bajo'; why = 'No hay días comparables entre el plan y la venta real.'; }
    else if (q === 'invalid') { level = 'bajo'; why = 'Hay filas rechazadas o con errores en los datos cargados.'; }
    else if (ratio >= RULES.coverageHigh && q === 'ready' && !excluded) { level = 'alto'; why = `Se compararon ${cov.paired} de ${cov.expected} días y los datos no traen avisos.`; }
    else if (ratio >= RULES.coverageMid) {
      level = 'medio';
      const bits = [`se compararon ${cov.paired} de ${cov.expected} días`];
      if (q === 'warnings') bits.push('los datos traen avisos de calidad');
      if (excluded) bits.push(`${excluded.days} día${excluded.days === 1 ? '' : 's'} sin contar porque falta algún canal`);
      why = bits.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.';
    } else { level = 'bajo'; why = `Solo se compararon ${cov.paired} de ${cov.expected} días.`; }
    return { level, why, rule: `Alto: ≥ ${RULES.coverageHigh * 100} % de días comparados y datos sin avisos. Medio: ≥ ${RULES.coverageMid * 100} % o con avisos. Bajo: menos, o datos con errores.` };
  }

  /* ---------- Hallazgos ---------- */

  function dataFindings(input) {
    const { status: s, readiness: r, summary: S, referenceDate } = input;
    const out = [];
    const missing = r.items.filter((i) => i.blocking && !i.done);
    if (missing.length) {
      out.push({ id: 'data_missing', kind: 'data', severity: 'blocking', priority: 0, amount: null,
        title: 'Completa la información necesaria para el diagnóstico',
        what: `Falta: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`,
        why: 'Sin esa información no se puede evaluar de forma confiable la brecha contra el plan.',
        evidence: [`Preparación de datos: ${r.percent} % (${r.label.toLowerCase()}).`],
        support: null, missing: missing.map((m) => m.label), next: { view: missing[0].view, label: 'Ir a preparación de datos' }, step: 'complete_data' });
    }
    if (s.data.quality === 'invalid') {
      out.push({ id: 'data_invalid', kind: 'data', severity: 'blocking', priority: 0, amount: null,
        title: 'Corrige los errores de los datos cargados',
        what: 'Hay filas rechazadas o registros con errores.', why: 'Los errores pueden cambiar la venta, el plan o la comparación; el diagnóstico no se debe leer como confiable.',
        evidence: [`Calidad de datos: ${s.data.qualityText || 'con errores'}.`], support: null, missing: [], next: { view: 'calidad', label: 'Revisar la calidad de datos' }, step: 'fix_quality' });
    }
    const last = s.actual && s.actual.lastDate;
    if (last && referenceDate) {
      const age = daysBetween(last, referenceDate);
      if (age > RULES.staleDays) out.push({ id: 'data_stale', kind: 'data', severity: 'attention', priority: 0.5, amount: null,
        title: 'La venta real no está al día',
        what: `La última venta real cargada es del ${last}, ${age} días antes de ${referenceDate}.`,
        why: 'Las cifras de Inicio dejan fuera esos días: el cumplimiento y el forecast pueden verse mejor o peor de lo que es.',
        evidence: [`Última venta real: ${last}.`, `Fecha del reporte: ${referenceDate}.`], support: null, missing: ['Venta real de los días recientes'],
        next: { view: 'carga', label: 'Cargar la venta real reciente' }, step: 'complete_data' });
    }
    if (S && S.excluded) out.push({ id: 'data_channels', kind: 'data', severity: 'attention', priority: 0.6, amount: S.excluded.revenue,
      title: 'Faltan canales en algunos días',
      what: `${S.excluded.days} día${S.excluded.days === 1 ? '' : 's'} no entran al total porque falta la venta de algún canal.`,
      why: 'El total digital exige los cuatro canales; si no, se compararía un total parcial contra el plan completo.',
      evidence: [`Venta de los demás canales en esos días: ${money(S.excluded.revenue)}.`], support: null, missing: Object.keys(S.excluded.missing || {}),
      next: { view: 'carga', label: 'Completar los canales faltantes' }, step: 'complete_data' });
    if (s.data.quality === 'warnings') out.push({ id: 'data_warnings', kind: 'data', severity: 'warning', priority: 7, amount: null,
      title: 'Hay avisos de calidad en los datos',
      what: `Calidad de datos: ${s.data.qualityText || 'con advertencias'}.`, why: 'Los avisos no bloquean el análisis, pero conviene revisarlos antes de actuar.',
      evidence: [], support: null, missing: [], next: { view: 'calidad', label: 'Revisar los avisos' }, step: 'fix_quality' });
    return out;
  }

  /** Canales de contacto (WhatsApp, Llamadas): su «volumen» son conversaciones iniciadas o llamadas entrantes, no sesiones; GA4 (fuente, dispositivo) no aplica. */
  const CONTACT = { whatsapp: 'conversaciones', llamadas: 'llamadas' };
  const contactNoun = (ch) => CONTACT[ch] || null;
  /** ¿Hay segmentos de GA4 para este canal? Con «total» basta que algún canal los tenga (cubren Ecommerce y App, no el resto). */
  function hasSegFor(input) {
    const sc = input.segmentChannels, ch = input.channel;
    if (!Array.isArray(sc)) return (input.status.data.segments || 0) > 0 && !contactNoun(ch);
    return ch === 'total' || !ch ? sc.length > 0 : sc.includes(ch);
  }

  function deviationFindings(input, blocked) {
    const { status: s, summary: S } = input;
    const out = [];
    if (blocked || !s.forecast.available) return out;
    const sup = support(input);
    const th = input.thresholds || (FP.config && FP.config.forecast && FP.config.forecast.pacingThresholds);
    const pace = fin(s.forecast.compliance) ? FP.gap.pacingStatus(s.forecast.compliance, th) : 'insufficient_data';
    const below = pace === 'below';
    const gapAbs = fin(s.forecast.gapToDate) ? Math.abs(s.forecast.gapToDate) : null;
    if (below && fin(s.forecast.gapToDate) && s.forecast.gapToDate < 0) {
      out.push({ id: 'gap', kind: 'gap', severity: 'attention', priority: 1, amount: -gapAbs,
        title: 'Investiga la brecha de ventas',
        what: `La venta acumulada va ${money(gapAbs)} por debajo de la trayectoria del plan (${pct(1 - s.forecast.compliance)} menos).`,
        why: 'Si el ritmo no cambia, la brecha se arrastra al cierre del periodo.',
        evidence: [`Venta real a la fecha: ${money(s.forecast.actualToDate)}.`, `Plan a la fecha: ${money(s.forecast.planToDate)}.`, `Cumplimiento: ${pct(s.forecast.compliance)}.`],
        support: sup, missing: [], next: { view: 'diagnostico', label: 'Ver diagnóstico de brecha' }, step: 'review_gap',
        nextCheck: 'Abrir el diagnóstico y ver qué driver (tráfico, conversión o ticket) aporta más a la diferencia.' });
    }
    // Drivers: solo los que restan y pesan al menos driverMinShare de la brecha. Es contribución cuantitativa, no causa.
    const wp = S && S.whyPlan;
    if (below && wp && wp.status === 'ok' && wp.drivers && fin(wp.gap) && wp.gap < 0) {
      const total = Math.abs(wp.gap);
      const neg = wp.drivers.filter((d) => fin(d.contribution) && d.contribution < 0 && Math.abs(d.contribution) / total >= RULES.driverMinShare && DRIVER[d.id])
        .sort((a, b) => a.contribution - b.contribution).slice(0, 2);
      neg.forEach((d, i) => {
        const meta = DRIVER[d.id], k = meta.id, share = Math.abs(d.contribution) / total;
        const hasSeg = hasSegFor(input), hasProd = Boolean(input.hasProducts), noun = contactNoun(input.channel);
        const dest = k === 'aov' ? { view: hasProd ? 'producto' : 'diagnostico', label: hasProd ? 'Analizar mix y composición de venta' : 'Ver drivers' }
          : k === 'traffic' ? (noun ? { view: 'pacing', label: `Ver el volumen de ${noun} en Pacing`, channel: input.channel } : { view: hasSeg ? 'segmentos' : 'diagnostico', label: hasSeg ? 'Ver segmentos de tráfico' : 'Ver drivers' })
            : { view: 'diagnostico', label: 'Ver drivers' };
        const title = k === 'cr' ? (noun ? `Investiga la caída de la conversión de ${noun} a pedido` : 'Investiga la caída de conversión') : k === 'aov' ? 'Investiga el cambio en el ticket promedio'
          : (noun ? `Investiga el menor volumen de ${noun}` : 'Investiga el menor volumen de sesiones');
        const missing = [];
        // GA4 solo aplica a Ecommerce y App: en WhatsApp y Llamadas no se pide (no existe); se investiga con el volumen diario y el calendario.
        if (k === 'cr' && !hasSeg && !noun) missing.push('Segmentos de GA4 (dispositivo, fuente) para ubicar dónde cae la conversión');
        if (k === 'aov' && !hasProd) missing.push('Productos de venta para ver el mix y las unidades por pedido');
        if (k === 'traffic' && !hasSeg && !noun) missing.push('Segmentos de GA4 para ver qué fuente o dispositivo mueve el tráfico');
        out.push({ id: `driver_${meta.id}`, kind: 'driver', severity: 'attention', priority: 2 + i * 0.1, amount: d.contribution,
          title,
          what: `${meta.name} aporta ${money(d.contribution)} a la brecha (${pct(share, 0)} de la diferencia contra el plan).`,
          why: `Es la parte de la diferencia que se explica con esa pieza de Venta = ${noun ? noun.charAt(0).toUpperCase() + noun.slice(1) : 'Sesiones'} × Conversión × Ticket.`,
          evidence: [`Plan: ${fmtDriver(d.id, d.baseline)} → Real: ${fmtDriver(d.id, d.current)}${fin(d.deltaPct) ? ` (${d.deltaPct >= 0 ? '+' : '−'}${pct(d.deltaPct)})` : ''}.`,
            `Los tres efectos suman la brecha de ${money(wp.gap)}.`],
          decomposition: 'Descomposición cuantitativa del Diagnóstico (Nivel 1, Plan contra Real).',
          hypothesis: hypothesisText(d.id, input.channel), support: sup, missing, next: dest, step: `investigate_${meta.id}`,
          nextCheck: k === 'cr' ? (noun ? `Ver si la conversión de ${noun} a pedido cae por semana y si coincide con tiempos de respuesta, asesores disponibles o falta de stock.` : 'Ubicar en qué canal, dispositivo o paso del embudo cae la conversión.')
            : k === 'aov' ? 'Ver si cambió el mix de productos o las unidades por pedido.'
              : (noun ? `Ver desde qué semana cae el volumen de ${noun} y si coincide con una campaña, un cambio de horario o un evento. Este canal no tiene fuente ni dispositivo: GA4 aplica a Ecommerce y App.` : 'Ver qué fuente o dispositivo explica el menor volumen.'),
          note: 'Contribución cuantitativa: no demuestra que ésta sea la causa.' });
      });
    } else if (below && wp && wp.status === 'ok' && !wp.effects) {
      out.push({ id: 'driver_unavailable', kind: 'driver', severity: 'info', priority: 5, amount: null,
        title: 'No se puede separar la brecha en tráfico, conversión y ticket',
        what: 'Falta alguno de los tres indicadores en el plan o en la venta real.', why: 'Sin esa separación no hay un driver que investigar con respaldo cuantitativo.',
        evidence: [], support: sup, missing: ['Sesiones (volumen) en el real, y volumen/CR/AOV en el plan'], next: { view: 'carga', label: 'Revisar qué falta cargar' }, step: 'complete_data' });
    }
    // Forecast de cierre contra la meta
    const fgp = s.forecast.forecastGapPct;
    if (fin(fgp) && fin(s.forecast.forecastGap) && s.forecast.forecastGap < 0 && 1 + fgp < (th ? th.onPlanFrom : 0.95)) {
      const good = pace === 'on_plan' || pace === 'above';
      out.push({ id: 'forecast', kind: 'forecast', severity: 'attention', priority: good ? 1.5 : 3, amount: s.forecast.forecastGap,
        title: good ? 'Vas bien hoy, pero el cierre está en riesgo' : 'Evalúa las palancas para cerrar la brecha',
        what: `El forecast de cierre queda ${money(s.forecast.forecastGap)} por debajo de la meta (${pct(fgp)}).`,
        why: good ? 'El cumplimiento actual no garantiza llegar a la meta: el forecast proyecta que el ritmo de lo que falta no alcanza.' : 'Aunque se corrija el ritmo, el cierre proyectado queda corto.',
        evidence: [`Forecast: ${money(s.forecast.forecast)} contra meta ${money(s.forecast.target)}.`, `Método: ${s.forecast.method}.`, `Cumplimiento a la fecha: ${pct(s.forecast.compliance)}.`],
        support: sup, missing: [], next: { view: 'reforecast', label: 'Ver forecast y escenarios' }, step: 'evaluate_levers',
        nextCheck: 'Abrir el reforecast para ver cuánto hay que vender por día y qué palancas lo cierran. No modifica la meta ni el forecast base.' });
    }
    // Canal más rezagado (solo cuando se mira el total digital)
    if (input.channel === 'total' && S && S.channels && S.channels.status === 'ok') {
      // Un canal está en problema si va por debajo del plan a la fecha O si su forecast de cierre queda corto de la meta.
      const onPlan = th ? th.onPlanFrom : 0.99;
      const troubled = S.channels.rows.filter((r) => r.state === 'ok').map((r) => {
        const behind = r.pacing === 'below' && fin(r.compliance);
        const short = fin(r.forecastGapPct) && 1 + r.forecastGapPct < onPlan;
        // Brecha a la fecha en pesos = venta real − plan a la fecha (el plan se deriva del cumplimiento del propio canal).
        const gapMoney = fin(r.actual) && fin(r.compliance) && r.compliance > 0 ? r.actual - r.actual / r.compliance : null;
        return (behind || short) ? { ...r, behind, short, gapMoney } : null;
      }).filter(Boolean).sort((a, b) => (a.behind === b.behind ? ((fin(a.gapMoney) ? a.gapMoney : 0) - (fin(b.gapMoney) ? b.gapMoney : 0)) : (a.behind ? -1 : 1)));
      if (troubled.length) {
        const lag = troubled[0], n = troubled.length;
        const line = (r) => `${r.label}: ${fin(r.compliance) ? `${pct(r.compliance)} del plan a la fecha${fin(r.gapMoney) && r.gapMoney < 0 ? ` (${money(r.gapMoney)} por debajo)` : ''}` : 'sin cumplimiento calculable'}${fin(r.forecastGapPct) ? `; cierre proyectado ${r.forecastGapPct >= 0 ? '+' : '−'}${pct(Math.abs(r.forecastGapPct))} contra su meta` : ''}`;
        out.push({ id: `channel_${lag.id}`, kind: 'channel', severity: 'attention', priority: 4, amount: null,
          channels: troubled.map((r) => ({ id: r.id, label: r.label, compliance: fin(r.compliance) ? r.compliance : null, gapMoney: fin(r.gapMoney) ? r.gapMoney : null, forecastGapPct: fin(r.forecastGapPct) ? r.forecastGapPct : null, behind: r.behind, short: r.short })),
          title: n === 1 ? `Revisa el canal ${lag.label}` : `Revisa los ${n} canales en problema`,
          what: n === 1 ? `${lag.label} va al ${pct(lag.compliance)} de su plan a la fecha.` : `${troubled.map((r) => r.label).join(', ')} están por debajo del plan a la fecha o con un cierre proyectado corto.`,
          why: 'Muestra dónde está la desviación; no repite el diagnóstico global.',
          evidence: troubled.map(line),
          support: sup, missing: [], next: { view: 'pacing', label: n === 1 ? 'Ver el canal' : `Ver ${lag.label}`, channel: lag.id }, step: 'review_channel',
          nextCheck: 'Abrir Pacing con cada canal y ver si el rezago es de todo el periodo o reciente.' });
      }
    }
    return out;
  }

  const fmtDriver = (id, v) => (!fin(v) ? '—' : id === 'cr' || id === 'conversionRate' ? `${(v * 100).toFixed(2)} %` : id === 'trafficVolume' ? Math.round(v).toLocaleString('es-MX') : `$${Math.round(v).toLocaleString('es-MX')}`);
  const hypothesisText = (id, ch) => {
    const noun = contactNoun(ch);
    if (noun) return id === 'cr' || id === 'conversionRate'
      ? `Hipótesis a validar (no demostrada): los tiempos de respuesta, los asesores disponibles, el abandono de la conversación o la falta de stock podrían estar bajando la conversión de ${noun} a pedido.`
      : id === 'aov' ? 'Hipótesis a validar (no demostrada): un cambio en el mix de productos o en las unidades por pedido podría estar moviendo el ticket.'
        : `Hipótesis a validar (no demostrada): una campaña, un cambio de horario o de cobertura, o un evento podrían estar trayendo menos ${noun}.`;
    return id === 'cr' || id === 'conversionRate'
      ? 'Hipótesis a validar (no demostrada): un cambio en el embudo, el checkout, la búsqueda o la mezcla de tráfico podría estar bajando la conversión.'
      : id === 'aov' ? 'Hipótesis a validar (no demostrada): un cambio en el mix de productos o en las unidades por pedido podría estar moviendo el ticket.'
        : 'Hipótesis a validar (no demostrada): una fuente, campaña o dispositivo podría estar trayendo menos sesiones.';
  };

  function followFindings(input) {
    const { status: s, actions = [], referenceDate } = input;
    if (!s.actions || !s.actions.open) return [];
    const measured = new Set((input.measuredActionIds || []));
    const open = actions.filter((a) => ['proposed', 'approved', 'in_progress', 'completed', 'measuring'].includes(a.status) && !measured.has(a.actionId));
    if (!open.length) return [];
    const due = open.filter((a) => !a.endDate || !referenceDate || a.endDate <= referenceDate);
    const waiting = open.filter((a) => a.endDate && referenceDate && a.endDate > referenceDate).sort((a, b) => a.endDate.localeCompare(b.endDate));
    if (due.length) return [{ id: 'followup', kind: 'followup', severity: 'attention', priority: 2.5, amount: null,
      title: 'Evalúa el resultado de la intervención',
      what: `${due.length} acción${due.length === 1 ? '' : 'es'} sin medir: ${due.slice(0, 2).map((a) => a.title).join('; ')}${due.length > 2 ? '…' : ''}.`,
      why: 'Una acción sin medición no deja aprendizaje y no se puede saber si funcionó.',
      evidence: due.slice(0, 3).map((a) => `${a.actionId}: ${a.title}${a.endDate ? ` (terminó el ${a.endDate})` : ''}.`), support: null, missing: [],
      next: { view: 'medir', label: 'Ver seguimiento' }, step: 'follow_up', nextCheck: 'Medir contra la línea base y registrar la conclusión.' }];
    const w = waiting[0];
    return [{ id: 'followup_wait', kind: 'followup', severity: 'waiting', priority: 8, amount: null,
      title: 'Hay una intervención en curso',
      what: `${w.title} termina el ${w.endDate}; todavía no se puede medir.`, why: 'Un resultado que aún no ocurre no se presenta como observado.',
      evidence: [`Revisión: a partir del ${w.endDate}.`], support: null, missing: ['Venta real de los días de la ventana de la acción'],
      next: { view: 'medir', label: 'Ver seguimiento' }, step: 'follow_up', waitingUntil: w.endDate, nextCheck: `Medir el ${w.endDate} o después, cuando haya venta real de toda la ventana.` }];
  }

  /* ---------- Ruta: pasos con estado ---------- */

  /**
   * Catálogo de pasos. exit(input) decide si el paso está COMPLETADO con datos reales (no por haber hecho clic).
   * deps: pasos que deben estar completados antes de que éste esté disponible.
   */
  const reviewedBy = (i, id) => Boolean(i.progress && i.progress[id] && i.progress[id].reviewed);
  const STEPS = {
    complete_data: { title: 'Completa la información necesaria', view: 'carga', deps: [], expected: 'Datos suficientes y sin errores para que el diagnóstico sea confiable.',
      needs: ['Meta, plan y venta real del periodo'], exit: 'La preparación de datos no tiene faltantes bloqueantes ni errores, y la venta real está al día.',
      done: (i) => i.readiness.allBlockingDone && i.status.data.quality !== 'invalid' && !i.staleDays && !(i.summary && i.summary.excluded) },
    fix_quality: { title: 'Corrige la calidad de datos', view: 'calidad', deps: [], expected: 'Un archivo sin filas rechazadas.', needs: ['Los archivos con aviso o error'],
      exit: 'Calidad de datos sin errores.', done: (i) => i.status.data.quality !== 'invalid' },
    review_gap: { title: 'Investiga la brecha de ventas', view: 'diagnostico', deps: ['complete_data'], expected: 'Saber qué parte de la diferencia aporta cada driver.',
      needs: ['Plan y venta real del periodo'], exit: 'El diagnóstico se calculó con los datos y filtros actuales.',
      done: (i) => Boolean(i.status.visited.diagnostico) && i.status.diagnostic.hypotheses !== null },
    investigate_cr: { title: 'Investiga la caída de conversión', view: 'diagnostico', deps: ['review_gap'], expected: 'Ubicar en qué canal, dispositivo o paso del embudo cae la conversión.',
      needs: ['Segmentos de GA4 o datos de embudo, si existen'], exit: 'Revisas el detalle y eliges una hipótesis a validar; lo confirmas tú con «Ya lo revisé» (la app no puede saberlo sola).', done: (i) => reviewedBy(i, 'investigate_cr'), manual: true },
    investigate_aov: { title: 'Investiga el cambio en el ticket promedio', view: 'producto', deps: ['review_gap'], expected: 'Ver si cambió el mix de productos o las unidades por pedido.',
      needs: ['Productos de venta'], exit: 'Revisas el detalle y eliges una hipótesis a validar; lo confirmas tú con «Ya lo revisé» (la app no puede saberlo sola).', done: (i) => reviewedBy(i, 'investigate_aov'), manual: true },
    investigate_traffic: { title: 'Investiga el menor volumen de sesiones', view: 'segmentos', deps: ['review_gap'], expected: 'Ver qué fuente o dispositivo mueve el tráfico.',
      needs: ['Segmentos de GA4'], exit: 'Revisas el detalle y eliges una hipótesis a validar; lo confirmas tú con «Ya lo revisé» (la app no puede saberlo sola).', done: (i) => reviewedBy(i, 'investigate_traffic'), manual: true },
    review_channel: { title: 'Revisa los canales en problema', view: 'pacing', deps: ['complete_data'], expected: 'Saber si el rezago es de todo el periodo o reciente.',
      needs: ['Venta real del canal'], exit: 'Revisas si el rezago es de todo el periodo o reciente y lo confirmas tú con «Ya lo revisé».', done: (i) => reviewedBy(i, 'review_channel'), manual: true },
    evaluate_levers: { title: 'Evalúa las palancas para cerrar la brecha', view: 'reforecast', deps: ['complete_data'], expected: 'Cuánto hay que vender por día y qué escenarios cierran la brecha.',
      needs: ['Forecast y plan del periodo'], exit: 'El reforecast calculado para este canal y periodo.', done: (i) => Boolean(i.status.visited.reforecast) && i.status.reforecast.available },
    simulate: { title: 'Simula una recuperación', view: 'recovery', deps: ['review_gap'], expected: 'Un escenario guardado ligado a una hipótesis.', needs: ['Un diagnóstico con hipótesis'],
      exit: 'Hay al menos un escenario guardado.', done: (i) => i.status.scenarios.count > 0 },
    plan_action: { title: 'Plantea una acción', view: 'recovery', deps: ['simulate'], expected: 'Una acción en el plan con responsable y fechas.', needs: ['Un escenario'],
      exit: 'Hay al menos una acción en el plan.', done: (i) => i.status.actions.count > 0 },
    follow_up: { title: 'Evalúa el resultado de la intervención', view: 'medir', deps: [], expected: 'Un resultado medido contra la línea base y una conclusión.',
      needs: ['Venta real de toda la ventana de la acción'], exit: 'Cada acción abierta tiene una medición registrada.', done: (i) => i.status.actions.withoutMeasurement === 0 && i.status.actions.count > 0 },
    monitor: { title: 'Monitorea el pacing', view: 'pacing', deps: [], expected: 'Detectar a tiempo si el ritmo cambia.', needs: [], exit: 'No hay un paso pendiente; se revisa de nuevo con la siguiente carga de venta.', done: () => false }
  };

  /** Decisión que habilita cada paso (se muestra en «Otras rutas»). */
  const DECISION = { complete_data: 'Poder confiar en las cifras para decidir.', fix_quality: 'Poder confiar en las cifras para decidir.', review_gap: 'Saber qué driver explica la brecha y dónde mirar.',
    investigate_cr: 'Elegir una hipótesis de conversión a validar.', investigate_aov: 'Elegir una hipótesis de ticket a validar.', investigate_traffic: 'Elegir una hipótesis de tráfico a validar.',
    review_channel: 'Reasignar esfuerzo entre canales.', evaluate_levers: 'Decidir qué palancas usar para cerrar el mes o el año.', simulate: 'Elegir qué recuperación probar.',
    plan_action: 'Comprometer una acción con responsable y fechas.', follow_up: 'Mantener o retirar la acción según su resultado.', monitor: 'Reaccionar a tiempo si el ritmo cambia.' };
  const CTA = { complete_data: 'Completar datos', fix_quality: 'Corregir calidad', review_gap: 'Abrir el diagnóstico', investigate_cr: 'Investigar conversión', investigate_aov: 'Investigar ticket',
    investigate_traffic: 'Investigar tráfico', review_channel: 'Ver el canal', evaluate_levers: 'Ver forecast y escenarios', simulate: 'Simular recuperación', plan_action: 'Plantear una acción',
    follow_up: 'Ver seguimiento', monitor: 'Ver pacing' };
  STEPS.complete_data.decision = DECISION.complete_data;
  Object.keys(STEPS).forEach((k) => { STEPS[k].decision = DECISION[k]; STEPS[k].cta = CTA[k]; });

  /** Definición del paso adaptada al canal: WhatsApp y Llamadas se miden en conversaciones iniciadas o llamadas entrantes y no tienen GA4 (fuente, dispositivo). */
  function stepDef(id, input) {
    const d = STEPS[id], noun = contactNoun(input && input.channel);
    if (!noun) return d;
    const confirm = 'Lo confirmas tú con «Ya lo revisé» (la app no puede saberlo sola).';
    if (id === 'investigate_traffic') return { ...d, title: `Investiga el menor volumen de ${noun}`, view: 'pacing', cta: `Ver el volumen de ${noun}`,
      expected: `Ver desde qué semana cae el volumen de ${noun} y si coincide con una campaña, un cambio de horario o un evento.`,
      needs: ['Volumen diario del canal (ya está en tu venta real)', 'Calendario de campañas y eventos, si lo llevas'], exit: `Revisas el volumen por semana contra el plan y eliges una hipótesis a validar. ${confirm}` };
    if (id === 'investigate_cr') return { ...d, title: `Investiga la caída de la conversión de ${noun} a pedido`, view: 'diagnostico', cta: 'Ver drivers',
      expected: `Ver si la conversión de ${noun} a pedido cae por semana y si coincide con tiempos de respuesta, asesores disponibles o falta de stock.`,
      needs: ['Pedidos y volumen diarios del canal (ya están en tu venta real)'], exit: `Revisas la conversión por semana y eliges una hipótesis a validar. ${confirm}` };
    return d;
  }

  function buildStep(id, input, origin) {
    const def = stepDef(id, input);
    const done = Boolean(def.done(input));
    const blockedBy = def.deps.filter((d) => !STEPS[d].done(input));
    const started = input.progress && input.progress[id];
    let state;
    if (done) state = 'done';
    else if (blockedBy.length) state = 'blocked';
    else if (origin && origin.waitingUntil) state = 'waiting';
    else if (started) state = 'in_progress';
    else if (origin && origin.severity === 'blocking') state = 'attention';
    else state = 'available';
    return { id, title: def.title, view: def.view, manual: Boolean(def.manual), reviewed: Boolean(input.progress && input.progress[id] && input.progress[id].reviewed), staleReview: (input.progress && input.progress[id] && input.progress[id].staleReview) || null, state, deps: def.deps, blockedBy, expected: def.expected, needs: def.needs, exit: def.exit,
      startedAt: started ? started.at : null, origin: origin ? origin.id : null, waitingUntil: origin && origin.waitingUntil || null };
  }

  /** Ruta de trabajo de un paso: lista ordenada de pasos con su estado real (datos), para mostrar avance. */
  function chainFor(primary, findings, steps, input) {
    const std = ['complete_data', 'review_gap', 'simulate', 'plan_action', 'follow_up'];
    let ids;
    const id = primary.id;
    if (id === 'monitor') ids = ['monitor'];
    else if (id === 'follow_up') ids = ['follow_up'];
    else if (id === 'review_channel') ids = ['complete_data', 'review_channel'];
    else if (id === 'evaluate_levers') ids = ['complete_data', 'evaluate_levers', 'simulate', 'plan_action', 'follow_up'];
    else if (/^investigate_/.test(id)) ids = ['complete_data', 'review_gap', id, 'simulate', 'plan_action', 'follow_up'];
    else if (id === 'fix_quality') ids = ['fix_quality', ...std];
    else ids = std.slice();
    if (!ids.includes(id) && STEPS[id]) ids.unshift(id);
    const out = ids.map((sid) => {
      const f = findings.find((x) => x.step === sid);
      const st = buildStep(sid, input, f || null);
      const hit = steps.find((x) => x.id === sid);
      const sd = stepDef(sid, input);
      const base = { ...st, title: (hit && hit.title) || sd.title, cta: (hit && hit.cta) || sd.cta, view: (hit && hit.view) || sd.view, channel: (hit && hit.channel) || null, findingId: (hit && hit.findingId) || (f && f.id) || null, why: (hit && hit.why) || null };
      if (sid === 'follow_up' && base.state !== 'done' && base.state !== 'waiting') {
        const noAct = !(input.status.actions && input.status.actions.count > 0);
        if (noAct) { base.state = 'blocked'; base.blockedBy = ['plan_action']; }
      }
      return base;
    });
    const doneCount = out.filter((x) => x.state === 'done').length;
    return { steps: out, doneCount, total: out.length, activeId: id };
  }

  /** Reglas del paso principal: primero lo que bloquea, luego la desviación, después lo que decide y mide. */
  function chooseRoute(findings, input) {
    const steps = [];
    const seen = new Set();
    const push = (f) => {
      const id = f.step; if (!id || seen.has(id)) return null;
      seen.add(id);
      const st = buildStep(id, input, f);
      // el destino puede ser más específico que el del catálogo (canal, mix, segmentos)
      st.view = f.next.view || st.view; st.cta = f.next.label; st.channel = f.next.channel || null; st.title = f.title || st.title; st.why = f.why; st.findingId = f.id;
      st.channels = f.channels || null; st.what = f.what; st.support = f.support; st.nextCheck = f.nextCheck || null;
      st.soft = f.severity === 'warning' || f.severity === 'info';     // un aviso suave nunca es el paso principal
      steps.push(st); return st;
    };
    findings.forEach(push);
    // Cadena de decisión tras el diagnóstico: simular → actuar. Solo si hay brecha y el diagnóstico ya se calculó.
    const gap = findings.find((f) => f.kind === 'gap' || f.kind === 'driver');
    if (gap) {
      const diag = steps.find((s) => s.id === 'review_gap');
      if (diag && diag.state === 'done') {
        const noHyp = input.status.diagnostic.hypotheses === 0 && input.status.scenarios.count === 0;
        if (noHyp) steps.push({ id: 'more_evidence', title: 'Busca más evidencia', view: 'diagnostico', cta: 'Probar otra comparación o cargar segmentos', state: 'available', deps: ['review_gap'], blockedBy: [],
          expected: 'Una hipótesis con respaldo para poder simular.', needs: ['Segmentos de GA4 o un periodo distinto'], exit: 'El diagnóstico trae al menos una hipótesis.',
          why: 'El diagnóstico no tiene hipótesis: sin evidencia no se simula.', findingId: gap.id, origin: gap.id });
        else { push({ ...gap, step: 'simulate', title: STEPS.simulate.title, next: { view: 'recovery', label: 'Simular recuperación' }, why: 'Hay diagnóstico; el siguiente paso es probar qué cambio cerraría la brecha.' });
          push({ ...gap, step: 'plan_action', title: STEPS.plan_action.title, next: { view: 'recovery', label: 'Plantear una acción' }, why: 'Una acción con responsable y fechas convierte el escenario en algo medible.' }); }
      }
    }
    const hasActionable = steps.some((s) => !s.soft && s.state !== 'done' && s.state !== 'blocked');
    if (!hasActionable) {
      const m = { ...STEPS.monitor }; steps.push({ id: 'monitor', title: m.title, view: m.view, cta: 'Ver pacing', state: 'available', deps: [], blockedBy: [], expected: m.expected, needs: m.needs, exit: m.exit,
        why: 'No hay una desviación relevante: lo útil es seguir el ritmo y reaccionar a tiempo.', findingId: null, origin: null, what: 'Sin desviaciones relevantes con los datos disponibles.' });
    }
    // Principal = primer paso que no esté completado ni bloqueado; si todos lo están, el primero.
    const actionable = steps.filter((s) => !s.soft && s.state !== 'done' && s.state !== 'blocked');
    const primary = actionable[0] || steps[0];
    const secondary = steps.filter((s) => s !== primary && s.state !== 'done').slice(0, 3);
    const chain = chainFor(primary, findings, steps, input);
    const inChain = new Set(chain.steps.map((c) => c.id));
    const pool = steps.filter((s) => s !== primary && !s.soft && s.state !== 'done' && !inChain.has(s.id));
    const others = pool.slice(0, RULES.maxRoutes - 1).map((s) => {
      const own = chainFor(s, findings, steps, input).steps;
      const at = own.findIndex((c) => c.id === s.id);
      const reuses = own.slice(0, at < 0 ? 0 : at).filter((c) => inChain.has(c.id) && c.state !== 'done').map((c) => c.title);   // lo previo que ya está en la ruta activa
      return { ...s, decision: DECISION[s.id] || null, reuses, chain: chainFor(s, findings, steps, input) };
    });
    return { primary, secondary, all: steps, chain, others, moreOthers: Math.max(0, pool.length - others.length) };
  }

  function evaluate(input) {
    const staleDays = (() => { const l = input.status.actual && input.status.actual.lastDate; return l && input.referenceDate ? Math.max(0, daysBetween(l, input.referenceDate)) > RULES.staleDays : false; })();
    const inp = { ...input, staleDays };
    const dataF = dataFindings(inp);
    const blocked = dataF.some((f) => f.severity === 'blocking');
    const dev = deviationFindings(inp, blocked);
    const fol = followFindings(inp);
    const findings = [...dataF, ...dev, ...fol].sort((a, b) => a.priority - b.priority || Math.abs(b.amount || 0) - Math.abs(a.amount || 0));
    // El orden de los pasos sigue la prioridad de los hallazgos, salvo que una intervención vencida pasa antes de las palancas.
    const route = chooseRoute(findings, inp);
    const stable = !findings.some((f) => f.severity === 'blocking' || f.severity === 'attention');
    return { state: blocked ? 'blocked' : stable ? 'stable' : 'attention', findings, visible: findings.slice(0, RULES.maxVisible), rest: findings.slice(RULES.maxVisible), route,
      rules: RULES, stableNote: stable ? 'No hay una desviación relevante con los datos disponibles. Lo útil es monitorear el pacing.' : null };
  }

  FP.attentionEngine = { evaluate, support, RULES, STEPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FP.attentionEngine;
})(typeof window !== 'undefined' ? window : globalThis);
