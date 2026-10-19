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

  /* ---------- Progreso personal (por periodo y canal, y por la versión de los datos que lo originaron) ----------
   * Dónde vive: localStorage de ESTE navegador (clave fp.route.v1). No se sincroniza con la nube ni con el equipo.
   * Cada revisión («Ya lo revisé») guarda la huella (`sig`) de los datos relevantes de su contexto: venta real y plan del periodo y canal
   * (valores, no nombres de archivo). Si esa huella cambia, la revisión deja de figurar como vigente (se conserva en `staleReview` y,
   * al volver a revisar, pasa a `past`). Reemplazar un archivo con los MISMOS valores no invalida nada. Registros anteriores sin huella:
   * no se puede saber si siguen vigentes, así que se piden de nuevo y se dice así. */
  const MAX_CTX = 150;                      // contextos guardados (se descarta el MENOS reciente, nunca el que se acaba de usar)
  const ctxKey = (state, h, S) => `${state.year}|${(S && S.period ? S.period.type + ':' + S.period.key : h.periodType + ':' + (h.periodKey || ''))}|${(S && S.channel) || h.channel || 'total'}`;
  let mem = null, lastError = null;         // copia en memoria cuando el guardado falla (para no perder lo hecho y poder reintentar)
  function readAll() {
    if (mem) return mem;
    try { return JSON.parse(root.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  const touchedAt = (ctx) => Object.values(ctx || {}).reduce((m, e) => Math.max(m, Date.parse((e && e.reviewed && e.reviewed.at) || (e && e.at) || 0) || 0), 0);
  /** Escribe todo el progreso. Devuelve true solo si el almacenamiento confirmó; si falla, queda en memoria y se puede reintentar. */
  function writeAll(all) {
    const keys = Object.keys(all);
    if (keys.length > MAX_CTX) keys.sort((a, b) => touchedAt(all[a]) - touchedAt(all[b])).slice(0, keys.length - MAX_CTX).forEach((k) => { delete all[k]; });
    try { root.localStorage.setItem(KEY, JSON.stringify(all)); mem = null; lastError = null; return true; }
    catch (e) { mem = all; lastError = (e && e.message) || 'sin espacio o sin permiso de almacenamiento'; return false; }
  }
  const saveStatus = () => ({ unsaved: Boolean(mem), error: lastError });
  let lastToast = 0;
  function warnSaveFailed() {
    const now = Date.now(); if (now - lastToast < 20000) return; lastToast = now;
    if (FP.ui && FP.ui.toast) FP.ui.toast(`No se pudo guardar tu avance en este navegador (${lastError}). Sigue aquí mientras no cierres la pestaña; libera espacio o permite el almacenamiento y usa «Reintentar guardado».`);
  }
  function retrySave() {
    if (!mem) return { ok: true, already: true };
    const ok = writeAll(mem);
    if (!ok) warnSaveFailed();
    return { ok };
  }

  /** Huella determinista de los datos relevantes de un contexto (año|tipo:periodo|canal): venta real y plan vigentes del periodo y canal. null = no se puede determinar. */
  function parseKey(key) { const [year, pp = '', channel = 'total'] = String(key).split('|'); const i = pp.indexOf(':'); return { year, ptype: pp.slice(0, i), pkey: pp.slice(i + 1), channel }; }
  function fnv(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  function dataSig(state, key) {
    try {
      const DS = FP.dataStore, st = state && state.store; if (!DS || !st || !st.actual || !st.plan) return null;
      const k = parseKey(key), prefix = (k.ptype === 'month' || k.ptype === 'year') && k.pkey ? k.pkey : k.year;
      const lines = [];
      ['actual', 'plan'].forEach((t) => {
        DS.resolveLatest(st, t).forEach((r) => {
          if (!r.date || !String(r.date).startsWith(prefix)) return;
          if (k.channel !== 'total' && r.channel !== k.channel) return;
          lines.push(`${t}|${r.key}|${DS.valuesSig(r)}`);
        });
      });
      lines.sort();
      const sig = `${lines.length}:${fnv(lines.join('\n'))}`;
      return sig;
    } catch (e) { return null; }
  }

  /** Progreso de un contexto. Con `state`, las revisiones cuyos datos cambiaron (o no se pueden comprobar) salen como `staleReview`, no como `reviewed`. */
  function progressFor(key, state) {
    const raw = readAll()[key] || {};
    if (!state) return raw;
    const cur = dataSig(state, key), out = {};
    Object.keys(raw).forEach((id) => {
      const e = raw[id];
      if (!e || !e.reviewed) { out[id] = e; return; }
      if (cur !== null && e.reviewed.sig === cur) { out[id] = e; return; }
      const { reviewed, ...rest } = e;
      out[id] = { ...rest, staleReview: { ...reviewed, why: cur === null ? 'undetermined' : (reviewed.sig ? 'changed' : 'unknown') } };
    });
    return out;
  }
  function markStarted(key, stepId, origin, state) {
    if (!key || !stepId) return;
    const all = readAll(); const cur = all[key] || {};
    if (!cur[stepId]) cur[stepId] = { at: new Date().toISOString(), from: origin || null };
    all[key] = cur;
    if (!writeAll(all)) warnSaveFailed();
  }

  /** Confirmación personal de un paso de juicio (elegir una hipótesis): solo tú puedes saber que ya lo revisaste. Guarda la huella de los datos vigentes. */
  function markReviewed(key, stepId, note, state) {
    if (!key || !stepId) return { ok: false };
    const all = readAll(); const cur = all[key] || {}; const e = cur[stepId] || { at: new Date().toISOString() };
    if (e.reviewed) { e.past = [...(e.past || []), e.reviewed].slice(-10); }   // la revisión anterior se conserva como historial
    e.reviewed = { at: new Date().toISOString(), note: String(note || '').slice(0, 280), sig: state ? dataSig(state, key) : null };
    cur[stepId] = e; all[key] = cur;
    const ok = writeAll(all); if (!ok) warnSaveFailed();
    return { ok };
  }

  /* ---------- Entrada del motor a partir de lo que ya calculó la app ---------- */
  let segMemo = { ref: null, n: -1, channels: [] };
  /** Canales que tienen segmentos de GA4 cargados (se recalcula solo si cambian los datos). */
  function segmentChannels(state) {
    const recs = state.store && state.store.segments && state.store.segments.records;
    if (!Array.isArray(recs)) return [];
    if (segMemo.ref === recs && segMemo.n === recs.length) return segMemo.channels;
    const set = new Set(); for (let i = 0; i < recs.length; i++) { const c = recs[i] && recs[i].channel; if (c) set.add(c); }
    segMemo = { ref: recs, n: recs.length, channels: [...set] };
    return segMemo.channels;
  }

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
    return { referenceDate: run.referenceDate, year: state.year, channel: S.channel, segmentChannels: segmentChannels(state), status: st, readiness: ready, summary: S, thresholds: run.settings && run.settings.pacingThresholds,
      actions: plan.actions || [], measuredActionIds: (plan.measurements || []).map((m) => m.actionId), hasProducts: Boolean(pm && pm.batches), progress: progressFor(ctxKey(state, h, S), state) };
  }

  /* ---------- Piezas de HTML ---------- */
  const attrs = (st, S, key) => `data-action="route-go" data-route="${H().esc(st.id)}" data-view="${H().esc(st.view)}" data-step="${H().esc(st.id)}" data-finding="${H().esc(st.findingId || '')}" data-key="${H().esc(key)}"${st.channel ? ` data-channel="${H().esc(st.channel)}"` : ''}`;
  const money = (v) => (fin(v) ? F().currency(Math.abs(v), 0) : '—');

  function findingHtml(fd, key, primaryStep) {
    const { esc } = H();
    const sup = fd.support ? `<p class="att__sup" data-support="${esc(fd.support.level)}"><strong>Respaldo de la evidencia: ${esc(fd.support.level)}.</strong> ${esc(fd.support.why)}</p>` : '';
    const detail = [
      (fd.evidence || []).length ? ['Hecho observado', fd.evidence] : null,
      fd.decomposition ? ['Descomposición cuantitativa', [fd.decomposition, fd.note].filter(Boolean)] : null,
      fd.hypothesis ? ['Hipótesis a validar', [fd.hypothesis]] : null,
      (fd.missing || []).length ? ['Información que falta', fd.missing] : null,
      fd.nextCheck ? ['Próxima comprobación', [fd.nextCheck]] : null
    ].filter(Boolean);
    return `<li class="att__item att__item--${esc(fd.severity)}" data-finding="${esc(fd.id)}" data-kind="${esc(fd.kind)}">
      <div class="att__head"><span class="ds-badge ${SEV_BADGE[fd.severity] ? `ds-badge--${SEV_BADGE[fd.severity]}` : ''}">${esc(SEV_LABEL[fd.severity] || fd.severity)}</span><strong class="att__t">${esc(fd.title)}</strong></div>
      <p class="att__what">${esc(fd.what)}</p>
      <p class="att__why"><strong>Por qué importa:</strong> ${esc(fd.why)}</p>
      <details class="att__more"><summary>Evidencia y qué sigue</summary>${sup}<dl>${detail.map(([t, xs]) => `<dt>${esc(t)}</dt>${xs.map((x) => `<dd>${esc(x)}</dd>`).join('')}`).join('')}</dl></details>
      ${primaryStep && fd.step === primaryStep ? `<p class="att__go att__go--dup" data-is-next-step="1"><span class="field__hint">Este hallazgo es tu siguiente mejor paso: «${esc(fd.next.label)}».</span> <button type="button" class="link-btn" data-action="scroll-to" data-target="nbs">Ver el paso ↑</button></p></li>` : `<p class="att__go"><button type="button" class="btn btn--ghost" data-action="route-go" data-route="${esc(fd.step)}" data-view="${esc(fd.next.view)}" data-step="${esc(fd.step)}" data-finding="${esc(fd.id)}" data-key="${esc(key)}"${fd.next.channel ? ` data-channel="${esc(fd.next.channel)}"` : ''}>${esc(fd.next.label)}</button></p></li>`}`;
  }

  function attentionHtml(att, S, key) {
    const { esc } = H();
    const n = att.findings.length;
    const pid = att.route && att.route.primary ? att.route.primary.id : null;   // paso que ya muestra «Tu siguiente mejor paso»
    const ctx = `${esc(FP.navigation.contextLabel({ channel: S.channel }))} · ${esc(S.period.type === 'month' ? S.period.key : `Año ${S.period.key}`)}`;
    const body = att.state === 'stable'
      ? `<p class="att__stable" data-stable="1"><strong>Estado estable.</strong> ${esc(att.stableNote)}</p>${n ? `<ol class="att__list">${att.visible.map((x) => findingHtml(x, key, pid)).join('')}</ol>` : ''}`
      : `<ol class="att__list">${att.visible.map((x) => findingHtml(x, key, pid)).join('')}</ol>`;
    const rest = att.rest.length ? `<details class="ds-accordion att__rest"><summary><span class="ds-accordion__n" aria-hidden="true">+</span><span><h4 class="ds-accordion__t">Ver los demás hallazgos (${att.rest.length})</h4></span></summary>
      <div class="ds-accordion__body"><ol class="att__list">${att.rest.map((x) => findingHtml(x, key, pid)).join('')}</ol></div></details>` : '';
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

  /* ---------- Ruta activa: pasos con estado, avance y otras rutas ---------- */
  const DOT = { done: '✓', blocked: '·', waiting: '◔', attention: '!' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dateLbl = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : (iso || ''); };
  const stepNote = (st) => (st.state === 'done' ? 'Hecho' : st.state === 'blocked' ? `Bloqueado: primero ${((st.blockedBy || []).map((b) => (FP.attentionEngine.STEPS[b] || {}).title || b)[0] || 'el paso previo').toLowerCase()}`
    : st.state === 'waiting' ? `En espera${st.waitingUntil ? ` · ${dateLbl(st.waitingUntil)}` : ''}` : st.state === 'in_progress' ? 'En curso' : st.state === 'attention' ? 'Requiere atención' : 'Disponible');

  function stepperHtml(chain, activeId) {
    const { esc } = H();
    const n = chain.steps.length;
    return `<ol class="nbs__steps" aria-label="Pasos de la ruta activa" data-count="${n}">${chain.steps.map((st, i) => {
      const cur = st.id === activeId;
      return `<li class="nbs__st nbs__st--${esc(st.state)}${cur ? ' is-cur' : ''}" data-step="${esc(st.id)}" data-state="${esc(st.state)}"${cur ? ' aria-current="step"' : ''}>
        <span class="nbs__dot" aria-hidden="true">${st.state === 'done' ? '✓' : (cur ? i + 1 : (DOT[st.state] || i + 1))}</span>
        <span class="nbs__stt">${esc(st.title)}</span>
        <span class="nbs__sts">${esc(stepNote(st))}</span></li>`; }).join('')}</ol>`;
  }

  function routeCard(o, S, key) {
    const { esc } = H();
    const wait = o.state === 'waiting';
    const blocked = o.state === 'blocked';
    const tags = [wait ? '<span class="nbs__tag nbs__tag--wait">En espera</span>' : blocked ? '<span class="nbs__tag nbs__tag--wait">Bloqueada</span>' : '<span class="nbs__tag nbs__tag--att">Atención</span>',
      o.support ? `<span class="nbs__tag nbs__tag--ok">Respaldo ${esc(o.support.level)}</span>` : ''].join('');
    return `<li class="nbs__route" data-route="${esc(o.id)}" data-state="${esc(o.state)}">
      <div>${tags}</div><strong>${esc(o.title)}</strong>
      ${o.decision ? `<p class="ds-card__sub"><b>Decisión que habilita:</b> ${esc(o.decision)}</p>` : ''}
      ${(o.needs || []).length ? `<p class="ds-card__sub"><b>Necesita:</b> ${esc(o.needs.join('; '))}</p>` : ''}
      ${o.reuses && o.reuses.length ? `<p class="nbs__shared">♻ ${blocked ? 'Se habilita al completar' : 'Comparte con la ruta activa'}: ${esc(o.reuses.join('; '))}. No se repite.</p>` : ''}
      ${o.waitingUntil ? `<p class="nbs__shared">Entra a tu ruta a partir del ${esc(dateLbl(o.waitingUntil))}.</p>` : ''}
      ${o.state === 'blocked' || o.state === 'done' ? '' : `<button type="button" class="btn btn--ghost" ${attrs(o, S, key)}>${esc(wait ? 'Ver seguimiento' : 'Abrir esta ruta')}</button>`}</li>`;
  }

  /** Canales en problema (Total digital): uno por fila, cada uno con su propio acceso a Pacing. */
  function chanListHtml(p, S, key) {
    if (!p.channels || p.channels.length < 2) return '';
    const { esc } = H();
    return `<ul class="nbs__chans" data-troubled="${p.channels.length}">${p.channels.map((c) => `<li data-chan="${esc(c.id)}"><span><strong>${esc(c.label)}</strong> · ${c.compliance != null ? `${Math.round(c.compliance * 100)} % del plan` : 'sin cumplimiento'}${c.forecastGapPct != null ? ` · cierre ${c.forecastGapPct >= 0 ? '+' : '−'}${Math.abs(Math.round(c.forecastGapPct * 1000) / 10)} % vs meta` : ''}</span> <button type="button" class="btn btn--ghost btn--sm" ${attrs({ ...p, channel: c.id }, S, key)}>Ver ${esc(c.label)}</button></li>`).join('')}</ul>`;
  }

  function nextStepHtml(att, S, key) {
    const { esc } = H(), p = att.route.primary, ch = att.route.chain;
    const waiting = p.state === 'waiting';
    const idx = Math.max(0, ch.steps.findIndex((x) => x.id === p.id));
    const facts = [['Resultado esperado', p.expected], (p.needs || []).length ? ['Datos que se necesitan', p.needs.join('; ')] : null, ['Estado', STATE_LABEL[p.state] || p.state], ['Termina cuando', p.exit]].filter(Boolean);
    const o = att.route.others;
    const others = o.length ? `<h4 class="ds-h4 nbs__h">Otras rutas</h4><ul class="nbs__routes">${o.map((x) => routeCard(x, S, key)).join('')}</ul>${att.route.moreOthers ? `<p class="ds-card__sub">Hay ${att.route.moreOthers} ruta${att.route.moreOthers === 1 ? '' : 's'} más; se ven en «Qué necesita atención».</p>` : ''}` : '';
    const label = waiting ? 'Ver seguimiento' : (p.state === 'in_progress' ? `Continuar: ${p.cta || 'Abrir'}` : (p.cta || 'Abrir'));
    const many = ch.total > 1;
    return `<section class="ds-card ds-card--accent home__next nbs" id="nbs" aria-labelledby="nbs-t" data-block="nextstep" data-step="${esc(p.id)}" data-state="${esc(p.state)}" data-done="${ch.doneCount}" data-total="${ch.total}">
      <div class="home__row"><h3 class="ds-section-title" id="nbs-t">Tu siguiente mejor paso</h3><span class="ds-badge ${p.state === 'in_progress' ? 'ds-badge--forecast' : ''}">${many ? `Ruta activa · paso ${idx + 1} de ${ch.total}` : esc(STATE_LABEL[p.state] || p.state)}</span></div>
      ${many ? `<div class="nbs__bar" role="progressbar" aria-label="Avance de la ruta" aria-valuemin="0" aria-valuemax="${ch.total}" aria-valuenow="${ch.doneCount}" aria-valuetext="${ch.doneCount} de ${ch.total} pasos completados"><i style="width:${Math.round(100 * ch.doneCount / ch.total)}%"></i></div>
      <p class="ds-card__sub">${esc(((att.findings.find((x) => x.id === p.findingId) || {}).title) || '')}${p.findingId ? ' · ' : ''}${esc(FP.navigation.contextLabel({ channel: S.channel }))} · ${esc(S.period.type === 'month' ? S.period.key : `Año ${S.period.key}`)} · Tu avance se guarda en este navegador</p>${stepperHtml(ch, p.id)}` : ''}
      <p class="home__next-t">${esc(p.title)}</p><p class="ds-card__sub">${esc(p.why || '')}</p>
      <dl class="nbs__facts">${facts.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${waiting ? `<p class="field__hint">En espera: todavía no hay venta real de toda la ventana. Vuelve a partir del ${esc(p.waitingUntil)}.</p>` : ''}
      ${chanListHtml(p, S, key)}
      <p><button type="button" class="btn btn--primary btn--lg" ${attrs(p, S, key)}>${esc(label)}</button></p>
      ${waiting ? '' : '<p class="field__hint nbs__how">Cómo sigue: el botón abre el módulo con tu canal y periodo. Allí verás una barra con este paso; al terminar lo confirmas (o se completa solo con los datos) y regresas aquí para ver la ruta avanzada.</p>'}${others}</section>`;
  }

  /** Aviso corto ANTES de las cifras cuando los datos no están al día o están incompletos (no bloquea el resto de la página). */
  function bannerHtml(att) {
    const d = att.findings.find((f) => f.kind === 'data' && (f.severity === 'blocking' || f.severity === 'warning'));
    if (!d) return '';
    const { esc } = H();
    return `<div class="att__banner att__banner--compact att__banner--${esc(d.severity)}" role="status" data-banner="${esc(d.id)}"><button type="button" class="att__banner-line" data-action="banner-toggle" aria-expanded="false"><span class="att__banner-ico" aria-hidden="true">⚠</span><span class="att__banner-txt"><strong class="att__banner-pre">Antes de leer las cifras: </strong>${esc(d.title)}.</span></button><span class="att__banner-what"> ${esc(d.what)}</span> <button type="button" class="link-btn att__banner-go" data-action="scroll-to" data-target="att">Ver detalle</button></div>`;
  }

  /* ---------- Origen de la navegación: de qué hallazgo y paso vengo, y cómo volver ---------- */
  const OKEY = 'fp.route.origin.v1';
  const snaps = {};
  const slim = (chain) => chain.steps.map((x) => ({ id: x.id, title: x.title, view: x.view, cta: x.cta, channel: x.channel || null, state: x.state, findingId: x.findingId || null }));
  function snapshot(state, key, att, S, f) {
    const routes = {};
    const add = (r) => { routes[r.id] = { id: r.id, findingTitle: ((att.findings.find((x) => x.id === r.findingId) || {}).title) || r.title, chain: slim(r.chain || att.route.chain) }; };
    add({ ...att.route.primary, chain: att.route.chain }); att.route.others.forEach(add);
    snaps[key] = { routes, ctxLabel: FP.navigation.contextLabel({ channel: S.channel }), channel: S.channel, periodLabel: S.period.type === 'month' ? S.period.key : `Año ${S.period.key}`,
      periodType: S.period.type, periodKey: S.period.key, ref: f && f.run ? f.run.referenceDate : null, year: state.year };
  }
  function setOrigin(state, d) {
    const sn = snaps[d.key]; if (!sn) return;
    let r = sn.routes[d.route];
    if (!r) { const own = Object.values(sn.routes).find((x) => x.chain.some((c) => c.id === d.step)); r = own || { id: d.step, findingTitle: '', chain: [{ id: d.step, title: (FP.attentionEngine.STEPS[d.step] || {}).title || d.step, view: d.view, state: 'available' }] }; }
    state.ux.origin = { key: d.key, route: r.id, step: d.step, view: d.view, findingTitle: r.findingTitle, chain: r.chain, ctxLabel: sn.ctxLabel, channel: sn.channel, periodLabel: sn.periodLabel, ref: sn.ref, year: sn.year, at: new Date().toISOString() };
    try { root.sessionStorage.setItem(OKEY, JSON.stringify(state.ux.origin)); } catch (e) { /* sin sessionStorage: el origen vive solo en memoria */ }
  }
  function clearOrigin(state) { state.ux.origin = null; try { root.sessionStorage.removeItem(OKEY); } catch (e) { /* nada */ } }
  function loadOrigin(state) {
    if (state.ux.origin !== undefined && state.ux.origin !== null) return;
    if (state.ux._originLoaded) return;
    state.ux._originLoaded = true;
    try { const v = JSON.parse(root.sessionStorage.getItem(OKEY) || 'null'); if (v && v.chain && v.step) state.ux.origin = v; } catch (e) { /* sin origen guardado */ }
  }

  /** Barra «Vienes de Inicio» sobre el módulo destino: hallazgo, contexto, avance, regreso y siguiente paso. */
  /** Recovery y Medir: lo que anotaste al revisar (solo lectura; viene del progreso personal de la ruta). */
  const dayLbl = (iso) => String(iso || '').slice(0, 10);
  function notesHtml(o, state) {
    const { esc } = H(), prog = progressFor(o.key, state), STEPS = FP.attentionEngine.STEPS;
    const rows = Object.keys(prog).filter((id) => prog[id] && ((prog[id].reviewed && prog[id].reviewed.note) || (prog[id].staleReview && prog[id].staleReview.note))).map((id) => {
      const stale = !prog[id].reviewed && prog[id].staleReview, r = prog[id].reviewed || stale;
      return `<li data-note-step="${esc(id)}"${stale ? ' data-stale="1"' : ''}><strong>${esc((STEPS[id] || {}).title || id)}:</strong> «${esc(r.note)}»${stale ? ` <em>(desactualizada: ${r.why === 'changed' ? 'los datos de este periodo cambiaron después de revisarla' : 'no puedo comprobar si sigue vigente'})</em>` : ''}</li>`;
    });
    if (!rows.length) return '';
    return `<div class="ux-wrap"><div class="route-origin route-origin--notes" data-notes="1"><p class="route-origin__t"><strong>Lo que anotaste al revisar</strong> <span class="chip">${esc(o.ctxLabel)}</span><span class="chip">${esc(o.periodLabel)}</span></p>
      <ul class="route-origin__notes">${rows.join('')}</ul><p class="field__hint">Son tus hipótesis por validar, no resultados. Se guardan solo en este navegador (no se comparten con tu equipo).</p></div></div>`;
  }
  function originHtml(state, status) {
    loadOrigin(state);
    const o = state.ux.origin;
    if (o && o.view !== state.view && (state.view === 'recovery' || state.view === 'medir')) return notesHtml(o, state);
    if (!o || o.view !== state.view) return '';
    const { esc } = H();
    const STEPS = FP.attentionEngine.STEPS;
    const idx = Math.max(0, o.chain.findIndex((c) => c.id === o.step));
    let done = false;
    const prog = progressFor(o.key, state);
    const def0 = STEPS[o.step] || {}, manual = Boolean(def0.manual), rev = prog[o.step] && prog[o.step].reviewed, stale = prog[o.step] && prog[o.step].staleReview;
    const sv = saveStatus();
    try { done = manual ? Boolean(rev) : Boolean(def0.done && o.step !== 'complete_data' && def0.done({ status, readiness: { allBlockingDone: false }, summary: {}, staleDays: false })); } catch (e) { done = false; }
    const next = o.chain.slice(idx + 1).find((c) => c.state !== 'done');
    const segs = o.chain.map((c, i) => `<i class="${i < idx || (i === idx && done) || c.state === 'done' ? 'd' : i === idx ? 'c' : ''}"></i>`).join('');
    const run = state.fc && state.fc.run, cur = state.ux.ctx || {};
    const changed = (run && o.ref && run.referenceDate !== o.ref) || state.year !== o.year || (cur.channel && o.channel && cur.channel !== o.channel);
    const nextAttrs = next ? `data-action="route-go" data-route="${esc(o.route)}" data-view="${esc(next.view)}" data-step="${esc(next.id)}" data-finding="${esc(next.findingId || '')}" data-key="${esc(o.key)}"${next.channel ? ` data-channel="${esc(next.channel)}"` : ''}` : '';
    return `<div class="ux-wrap"><div class="route-origin" data-origin="${esc(o.route)}" data-step="${esc(o.step)}" data-done="${done ? 1 : 0}">
      <div class="route-origin__l"><p class="route-origin__t"><strong>Vienes de Inicio · Hallazgo: «${esc(o.findingTitle || (STEPS[o.step] || {}).title || '')}»</strong>
        <span class="chip">${esc(o.ctxLabel)}</span><span class="chip">${esc(o.periodLabel)}</span>${o.ref ? `<span class="chip">Datos al ${esc(dateLbl(o.ref))}</span>` : ''}</p>
        <p class="route-origin__p"><span class="route-origin__segs" aria-hidden="true">${segs}</span><span>Ruta: paso ${idx + 1} de ${o.chain.length} · ${esc((o.chain[idx] && o.chain[idx].title) || (STEPS[o.step] || {}).title || '')}</span></p>
        ${changed ? '<p class="route-origin__warn" role="status">Cambiaron la fecha, el año o el canal desde que abriste este hallazgo. Vuelve a Inicio para reevaluar la ruta.</p>' : ''}</div>
      <div class="route-origin__r"><button type="button" class="btn btn--ghost" data-action="route-back">← Volver al hallazgo en Inicio</button>
        <button type="button" class="route-origin__x" data-action="route-dismiss" aria-label="Cerrar la ruta de trabajo">×</button></div>
      ${stale && !rev ? `<p class="route-origin__warn" role="status" data-stale-review="${stale.why}">${stale.why === 'changed' ? `Tu revisión del ${esc(dayLbl(stale.at))}${stale.note ? ` («${esc(stale.note)}»)` : ''} se hizo con otros datos: la venta real o el plan de este periodo cambiaron después. Ya no figura como vigente; vuelve a revisarla y confírmala.` : `Tu revisión del ${esc(dayLbl(stale.at))} no tiene registrada la versión de los datos con la que se hizo, y no puedo comprobar si sigue vigente. Confírmala de nuevo para dejarla vigente.`}</p>` : ''}
      ${sv.unsaved ? `<p class="route-origin__warn" role="alert" data-save-error="1">Tu avance NO se guardó en este navegador (${esc(sv.error || 'error de almacenamiento')}). Se conserva mientras no cierres la pestaña. <button type="button" class="btn btn--small" data-action="route-retry-save">Reintentar guardado</button></p>` : ''}
      ${manual && !done ? `<div class="route-origin__todo"><label for="route-note"><strong>Cuando termines de revisar:</strong> escribe la hipótesis que vas a validar (opcional) y confírmalo. La app no puede saber por sí sola que ya lo revisaste. Se guarda solo en este navegador.</label>
        <div class="route-origin__form"><input id="route-note" type="text" maxlength="280" placeholder="Ej.: bajó el volumen desde la semana de la campaña X"><button type="button" class="btn btn--primary" data-action="route-reviewed" data-key="${esc(o.key)}" data-step="${esc(o.step)}">Ya lo revisé</button></div></div>` : ''}
      ${done ? `<p class="route-origin__done" role="status"><span>✓ <strong>${manual ? 'Revisado por ti' : 'Paso completado'}</strong>${manual && rev && rev.note ? `: «${esc(rev.note)}»` : manual ? '' : `: ${esc((STEPS[o.step] || {}).exit || '')}`}${next ? ` Siguiente: <strong>${esc(next.title)}</strong>.` : ' Ya no quedan pasos en esta ruta.'}</span>${next && next.view !== state.view ? `<button type="button" class="btn btn--primary" ${nextAttrs}>Ir al paso ${idx + 2} →</button>` : ''}</p>` : ''}
    </div></div>`;
  }
  function renderOrigin(state, status) {
    const el = document.getElementById('route-origin'); if (!el) return;
    let html = ''; try { html = originHtml(state, status); } catch (e) { html = ''; }
    el.innerHTML = html;
  }

  /** Calcula y arma las piezas. Si algo falla devuelve vacío y Inicio sigue con lo que ya tenía. */
  function build(state, h, f, S, status, ready) {
    const input = buildInput(state, h, f, S, status, ready);
    const att = FP.attentionEngine.evaluate(input);
    const key = ctxKey(state, h, S);
    const p = att.route.primary;
    snapshot(state, key, att, S, f);
    const next = { label: p.cta || p.title, reason: p.why || '', view: p.view, step: p.id, attrs: attrs(p, S, key), title: p.title };
    return { att, key, html: attentionHtml(att, S, key), nextHtml: nextStepHtml(att, S, key), banner: bannerHtml(att), next };
  }

  FP.attentionView = { build, markStarted, progressFor, ctxKey, STATE_LABEL, setOrigin, clearOrigin, renderOrigin, originHtml, markReviewed, dataSig, saveStatus, retrySave };
})(typeof window !== 'undefined' ? window : globalThis);
