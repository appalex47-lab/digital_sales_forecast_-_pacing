/**
 * attention-view.js — «Qué necesita atención» y «Tu siguiente mejor paso» en Inicio (etapa 1 del rediseño).
 * Presenta lo que decide FP.attentionEngine (que solo lee cálculos existentes). El progreso de la ruta (qué paso se abrió) es PERSONAL:
 * vive en este navegador (localStorage), por periodo y canal; que un paso esté «completado» lo decide el motor con datos reales, no el clic.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const F = () => FP.format;
  const KEY = 'fp.route.v1';
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const STATE_LABEL = { blocked: 'Bloqueado por un paso previo', available: 'Disponible', in_progress: 'En curso', done: 'Completado y validado', attention: 'Requiere atención', waiting: 'En espera de una fecha', na: 'No aplica' };
  const SEV_LABEL = { blocking: 'Bloquea el análisis', attention: 'Requiere atención', warning: 'Aviso', info: 'Para saber', waiting: 'En espera' };
  const SEV_BADGE = { blocking: 'hyp', attention: 'forecast', warning: 'forecast', info: '', waiting: '' };

  /* ---------- Progreso personal (por periodo y canal) ---------- */
  const ctxKey = (state, h, S) => `${state.year}|${(S && S.period ? S.period.type + ':' + S.period.key : h.periodType + ':' + (h.periodKey || ''))}|${(S && S.channel) || h.channel || 'total'}`;
  function readAll() { try { return JSON.parse(root.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function progressFor(key) { return readAll()[key] || {}; }
  function markStarted(key, stepId, origin) {
    if (!key || !stepId) return;
    try {
      const all = readAll(); const cur = all[key] || {};
      if (!cur[stepId]) cur[stepId] = { at: new Date().toISOString(), from: origin || null };
      all[key] = cur;
      const keys = Object.keys(all); if (keys.length > 60) delete all[keys[0]];   // acota el tamaño
      root.localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* sin almacenamiento: la ruta se calcula igual, solo no recuerda qué paso se abrió */ }
  }

  /* ---------- Entrada del motor a partir de lo que ya calculó la app ---------- */
  function buildInput(state, h, f, S, status, ready) {
    const run = f.run, p = f.p, plan = state.rc && state.rc.plan ? state.rc.plan : { actions: [], measurements: [] };
    // Las cifras de brecha y forecast son las del periodo que muestra Inicio (mes o año), no las del año completo de collectStatus.
    const future = p.status === 'future';
    const forecast = future ? { available: false } : {
      available: true, method: run.method.label, methodId: run.method.id,
      target: p.plan ? p.plan.revenue : null, planToDate: p.planToDate ? p.planToDate.revenue : null, actualToDate: p.actualToDate ? p.actualToDate.revenue : null,
      compliance: p.toDate.revenue.compliance, gapToDate: p.toDate.revenue.gap, gapToDatePct: p.toDate.revenue.gapPct,
      forecast: p.forecast ? p.forecast.revenue : null, forecastGap: p.forecastGap.revenue.gap, forecastGapPct: p.forecastGap.revenue.gapPct };
    const st = { ...status, forecast };
    const pm = FP.productStore && FP.productStore.available && FP.productStore.available() ? FP.productStore.meta : null;
    return { referenceDate: run.referenceDate, year: state.year, channel: S.channel, status: st, readiness: ready, summary: S, thresholds: run.settings && run.settings.pacingThresholds,
      actions: plan.actions || [], measuredActionIds: (plan.measurements || []).map((m) => m.actionId), hasProducts: Boolean(pm && pm.batches), progress: progressFor(ctxKey(state, h, S)) };
  }

  /* ---------- Piezas de HTML ---------- */
  const attrs = (st, S, key) => `data-action="route-go" data-view="${H().esc(st.view)}" data-step="${H().esc(st.id)}" data-finding="${H().esc(st.findingId || '')}" data-key="${H().esc(key)}"${st.channel ? ` data-channel="${H().esc(st.channel)}"` : ''}`;
  const money = (v) => (fin(v) ? F().currency(Math.abs(v), 0) : '—');

  function findingHtml(fd, key) {
    const { esc } = H();
    const sup = fd.support ? `<p class="att__sup" data-support="${esc(fd.support.level)}"><strong>Respaldo de la evidencia: ${esc(fd.support.level)}.</strong> ${esc(fd.support.why)}</p>` : '';
    const detail = [
      ['Hecho observado', [fd.what, ...(fd.evidence || [])]],
      fd.decomposition ? ['Descomposición cuantitativa', [fd.decomposition, fd.note].filter(Boolean)] : null,
      fd.hypothesis ? ['Hipótesis a validar', [fd.hypothesis]] : null,
      (fd.missing || []).length ? ['Información que falta', fd.missing] : null,
      fd.nextCheck ? ['Próxima comprobación', [fd.nextCheck]] : null
    ].filter(Boolean);
    return `<li class="att__item att__item--${esc(fd.severity)}" data-finding="${esc(fd.id)}" data-kind="${esc(fd.kind)}">
      <div class="att__head"><span class="ds-badge ${SEV_BADGE[fd.severity] ? `ds-badge--${SEV_BADGE[fd.severity]}` : ''}">${esc(SEV_LABEL[fd.severity] || fd.severity)}</span><strong class="att__t">${esc(fd.title)}</strong></div>
      <p class="att__what">${esc(fd.what)}</p>
      <p class="att__why"><strong>Por qué importa:</strong> ${esc(fd.why)}</p>
      ${sup}
      <details class="att__more"><summary>Evidencia y qué sigue</summary><dl>${detail.map(([t, xs]) => `<dt>${esc(t)}</dt>${xs.map((x) => `<dd>${esc(x)}</dd>`).join('')}`).join('')}</dl></details>
      <p class="att__go"><button type="button" class="btn btn--ghost" data-action="route-go" data-view="${esc(fd.next.view)}" data-step="${esc(fd.step)}" data-finding="${esc(fd.id)}" data-key="${esc(key)}"${fd.next.channel ? ` data-channel="${esc(fd.next.channel)}"` : ''}>${esc(fd.next.label)}</button></p></li>`;
  }

  function attentionHtml(att, S, key) {
    const { esc } = H();
    const n = att.findings.length;
    const ctx = `${esc(FP.navigation.contextLabel({ channel: S.channel }))} · ${esc(S.period.type === 'month' ? S.period.key : `Año ${S.period.key}`)}`;
    const body = att.state === 'stable'
      ? `<p class="att__stable" data-stable="1"><strong>Estado estable.</strong> ${esc(att.stableNote)}</p>${n ? `<ol class="att__list">${att.visible.map((x) => findingHtml(x, key)).join('')}</ol>` : ''}`
      : `<ol class="att__list">${att.visible.map((x) => findingHtml(x, key)).join('')}</ol>`;
    const rest = att.rest.length ? `<details class="ds-accordion att__rest"><summary><span class="ds-accordion__n" aria-hidden="true">+</span><span><h4 class="ds-accordion__t">Ver los demás hallazgos (${att.rest.length})</h4></span></summary>
      <div class="ds-accordion__body"><ol class="att__list">${att.rest.map((x) => findingHtml(x, key)).join('')}</ol></div></details>` : '';
    const R = att.rules;
    const how = `<details class="ds-accordion home-sum__how"><summary><span class="ds-accordion__n" aria-hidden="true">?</span><span><h4 class="ds-accordion__t">Cómo se decide</h4></span></summary>
      <div class="ds-accordion__body"><ul>
        <li>Ordena por: lo que bloquea el análisis, la brecha, el aporte de cada driver, el cierre proyectado, el canal más rezagado y el seguimiento de acciones.</li>
        <li>Un driver entra solo si resta y aporta al menos ${Math.round(R.driverMinShare * 100)} % de la brecha. Es una contribución cuantitativa (Venta = Sesiones × Conversión × Ticket); no demuestra una causa.</li>
        <li>Los datos se consideran desactualizados si la última venta real tiene más de ${R.staleDays} días respecto a «Datos al».</li>
        <li>Respaldo de la evidencia: ${esc(FP.attentionEngine.support({ status: { data: { quality: 'ready' } }, summary: {} }).rule)}</li>
        <li>Muestra ${R.maxVisible} hallazgos; el resto está en «Ver los demás». No usa IA ni calcula cifras nuevas: lee Pacing, Forecast, Diagnóstico y Calidad de datos.</li></ul></div></details>`;
    return `<section class="ds-card att" id="att" aria-labelledby="att-t" data-block="attention" data-state="${esc(att.state)}">
      <div class="home__row"><h3 class="ds-section-title" id="att-t">Qué necesita atención</h3><span class="ds-badge">${n} hallazgo${n === 1 ? '' : 's'}</span></div>
      <p class="ds-card__sub">${ctx}</p>${body}${rest}${how}</section>`;
  }

  function stepRow(st, S, key) {
    const { esc } = H();
    return `<li class="nbs__row" data-step="${esc(st.id)}" data-state="${esc(st.state)}"><div><strong>${esc(st.title)}</strong><div class="ds-card__sub">${esc(STATE_LABEL[st.state] || st.state)}${st.waitingUntil ? ` · desde el ${esc(st.waitingUntil)}` : ''}${st.blockedBy && st.blockedBy.length ? ` · primero: ${esc(st.blockedBy.map((b) => (FP.attentionEngine.STEPS[b] || {}).title || b).join(', '))}` : ''}</div></div>
      ${st.state === 'blocked' || st.state === 'done' ? '' : `<button type="button" class="btn btn--ghost" ${attrs(st, S, key)}>${esc(st.cta || 'Abrir')}</button>`}</li>`;
  }

  function nextStepHtml(att, S, key) {
    const { esc } = H(), p = att.route.primary;
    const waiting = p.state === 'waiting';
    const facts = [['Resultado esperado', p.expected], (p.needs || []).length ? ['Datos que se necesitan', p.needs.join('; ')] : null, ['Estado', STATE_LABEL[p.state] || p.state], ['Termina cuando', p.exit]].filter(Boolean);
    const sec = att.route.secondary.length ? `<h4 class="ds-h4 nbs__h">Otras rutas</h4><ul class="nbs__list">${att.route.secondary.map((s) => stepRow(s, S, key)).join('')}</ul>` : '';
    return `<section class="ds-card ds-card--accent home__next nbs" id="nbs" aria-labelledby="nbs-t" data-block="nextstep" data-step="${esc(p.id)}" data-state="${esc(p.state)}">
      <div class="home__row"><h3 class="ds-section-title" id="nbs-t">Tu siguiente mejor paso</h3><span class="ds-badge ${p.state === 'in_progress' ? 'ds-badge--forecast' : ''}">${esc(STATE_LABEL[p.state] || p.state)}</span></div>
      <p class="home__next-t">${esc(p.title)}</p><p class="ds-card__sub">${esc(p.why || '')}</p>
      <dl class="nbs__facts">${facts.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${waiting ? `<p class="field__hint">En espera: todavía no hay venta real de toda la ventana. Vuelve a partir del ${esc(p.waitingUntil)}.</p>` : ''}
      <p><button type="button" class="btn btn--primary btn--lg" ${attrs(p, S, key)}>${esc(waiting ? 'Ver seguimiento' : (p.cta || 'Abrir'))}</button></p>${sec}</section>`;
  }

  /** Aviso corto ANTES de las cifras cuando los datos no están al día o están incompletos (no bloquea el resto de la página). */
  function bannerHtml(att) {
    const d = att.findings.find((f) => f.kind === 'data' && (f.severity === 'blocking' || f.severity === 'warning'));
    if (!d) return '';
    const { esc } = H();
    return `<div class="att__banner att__banner--${esc(d.severity)}" role="status" data-banner="${esc(d.id)}"><strong>Antes de leer las cifras:</strong> ${esc(d.title)}. ${esc(d.what)} <button type="button" class="link-btn" data-action="scroll-to" data-target="att">Ver detalle</button></div>`;
  }

  /** Calcula y arma las piezas. Si algo falla devuelve vacío y Inicio sigue con lo que ya tenía. */
  function build(state, h, f, S, status, ready) {
    const input = buildInput(state, h, f, S, status, ready);
    const att = FP.attentionEngine.evaluate(input);
    const key = ctxKey(state, h, S);
    const p = att.route.primary;
    const next = { label: p.cta || p.title, reason: p.why || '', view: p.view, step: p.id, attrs: attrs(p, S, key), title: p.title };
    return { att, key, html: attentionHtml(att, S, key), nextHtml: nextStepHtml(att, S, key), banner: bannerHtml(att), next };
  }

  FP.attentionView = { build, markStarted, progressFor, ctxKey, STATE_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
