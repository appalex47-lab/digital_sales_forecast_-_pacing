/**
 * action-plan-view.js — Recovery Center, parte de acciones (Fase 6).
 * Catálogo de acciones posibles, plan de acción, líneas de acción con Cohere y seguimiento
 * (baseline / escenario / observado). Solo pinta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => F().currency(v, 0);
  const signedMoney = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${F().currency(Math.abs(v), 0)}` : F().DASH);
  const DRIVER = { trafficVolume: 'Volumen', conversionRate: 'CR', aov: 'AOV' };
  const STATUS_PILL = { proposed: 'na', approved: 'ok', in_progress: 'warning', completed: 'ok', measuring: 'warning', validated: 'ok', rejected: 'error', cancelled: 'na' };
  const CONS = { consistent: ['ok', 'Consistente con el escenario'], partial: ['warning', 'Parcialmente consistente'], not_consistent: ['error', 'No consistente'], insufficient_data: ['na', 'Sin datos todavía'] };

  const scenariosWithHyp = (rc) => (rc.analysis ? rc.analysis.scenarios : []).filter((s) => s.links.hypothesisId);


  /** Texto plano del plan ampliado (para copiar a un correo o ticket). */
  function detailText(title, d) {
    if (!d) return '';
    const L = [title, '', `Objetivo: ${d.objective}`];
    if ((d.known || []).length) { L.push('', 'Ya sabemos (de los datos de RevNavigator):'); d.known.forEach((x) => L.push(`- ${x}`)); }
    L.push('', 'Pasos:');
    (d.steps || []).forEach((x, i) => L.push(`${i + 1}. ${x.text}${x.owner ? ` — ${x.owner}` : ''}${x.when ? ` (${x.when})` : ''}`));
    if (d.measure) L.push('', `Cómo se mide: ${d.measure}`);
    if ((d.dataToReview || []).length) { L.push('', 'Datos a revisar antes de ejecutar:'); d.dataToReview.forEach((x) => L.push(`- ${x}`)); }
    if ((d.risks || []).length) { L.push('', 'Riesgos y supuestos:'); d.risks.forEach((x) => L.push(`- ${x}`)); }
    if ((d.dontDo || []).length) { L.push('', 'Qué NO hacer:'); d.dontDo.forEach((x) => L.push(`- ${x}`)); }
    L.push('', 'Borrador redactado con IA a partir de tus datos ya calculados; sus hipótesis requieren validación.');
    return L.join('\n');
  }
  const lines = (a) => (a || []).join('\n');
  /** Objetivo operativo de la acción (volumen/conversión/ticket a conseguir), con el valor a conseguir editable. */
  function goalHtml(a, editable) {
    const g = a.operativeGoal; if (!g) return '<span class="cell-sub">Sin objetivo operativo (acción anterior a esta función).</span>';
    const esc = H().esc, k = g.metric, fmt = (v) => F().metric(k, v), pct = k === 'conversionRate';
    const sign = FP.pacingView && FP.pacingView.signed ? FP.pacingView.signed(k, g.delta) : fmt(g.delta);
    const raw = pct ? Math.round(g.target * 10000) / 100 : k === 'trafficVolume' ? Math.round(g.target) : Math.round(g.target * 100) / 100;
    return `<span class="rc-goal"><span class="cell-sub"><strong>Objetivo operativo</strong> · ${esc(g.label)}${k === 'trafficVolume' ? ` (${esc(g.unit)})` : ''}</span>
      <span class="cell-sub">${esc(fmt(g.base))} → ${esc(fmt(g.target))} (${esc(sign)})${g.edited ? ' · editado' : ''}</span>
      ${editable ? `<label class="cell-sub rc-goal__edit">Objetivo${pct ? ' (%)' : ''} <input type="number" step="any" min="0" value="${esc(String(raw))}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="goalTarget" ${pct ? 'data-pct="1"' : ''} aria-label="Objetivo operativo de ${esc(a.actionId)}" class="input--compact"></label>` : ''}</span>`;
  }
  /** Detalle de solo lectura dentro del plan de acción. */
  function detailHtml(a) {
    const esc = H().esc, d = a.detail; if (!d) return '';
    const ul = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
    return `<details class="disclosure rcx-detail"><summary><span class="ds-badge">✦ ${d.edited ? 'Ampliado con IA y editado' : 'Ampliado con IA'}</span> Ver el plan de trabajo</summary>
      <div class="rcx-detail__body"><p><strong>Objetivo.</strong> ${esc(d.objective)}</p>
      ${(d.known || []).length ? `<p><strong>Ya sabemos (de los datos).</strong></p>${ul(d.known)}` : ''}
      <ol>${(d.steps || []).map((x) => `<li>${esc(x.text)}${x.owner || x.when ? `<span class="cell-sub">${esc([x.owner, x.when].filter(Boolean).join(' · '))}</span>` : ''}</li>`).join('')}</ol>
      ${d.measure ? `<p><strong>Cómo se mide.</strong> ${esc(d.measure)}</p>` : ''}
      ${(d.dataToReview || []).length ? `<p><strong>Datos a revisar.</strong></p>${ul(d.dataToReview)}` : ''}
      ${(d.risks || []).length ? `<p><strong>Riesgos y supuestos.</strong></p>${ul(d.risks)}` : ''}${(d.dontDo || []).length ? `<p><strong>Qué NO hacer.</strong></p>${ul(d.dontDo)}` : ''}
      <p class="field__hint">Redactado con IA a partir de tus datos ya calculados; no calcula impacto y sus hipótesis requieren validación.</p>
      <button type="button" class="btn btn--small" data-action="rc-detail-copy" data-id="${esc(a.actionId)}">Copiar texto</button></div></details>`;
  }
  /** Panel del borrador «Ampliar con IA» (debajo de la tabla del catálogo; sirve igual en móvil y escritorio). */
  function expandPanel(state) {
    const esc = H().esc, x = state.rc.expand; if (!x) return '';
    const item = (state.rc._catalogItems || []).find((a) => a.actionId === x.actionId) || { name: x.actionId };
    const style = x.style === 'detailed' ? 'detailed' : 'summary';
    const seg = `<div class="rcx-seg" role="group" aria-label="Estilo del plan"><button type="button" class="rcx-seg__b" data-action="rc-expand-style" data-style="summary" aria-pressed="${style === 'summary'}">Resumido</button><button type="button" class="rcx-seg__b" data-action="rc-expand-style" data-style="detailed" aria-pressed="${style === 'detailed'}">Detallado</button></div>`;
    const head = `<p class="rcx__eye">✦ ${x.status === 'busy' ? 'Ampliando con IA' : 'Borrador generado con IA · hipótesis por validar'}</p><h4 id="rcx-title">${esc(item.name)}</h4>`;
    if (x.status === 'busy') return `<section class="rcx" id="rcx" aria-labelledby="rcx-title" aria-busy="true">${head}<p role="status" aria-live="polite">Cohere está armando el borrador… puede tardar unos segundos.</p><div class="rcx__bar" aria-hidden="true"><i></i></div><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-expand-discard">Cancelar</button></div></section>`;
    if (x.status !== 'ready') return `<section class="rcx" id="rcx" aria-labelledby="rcx-title" role="alert">${head}<p class="ds-alert ds-alert--danger">${esc((x.errors || []).join(' ') || 'No se pudo generar el borrador.')} El resto del módulo sigue funcionando.</p>${seg}<div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-expand-regen">Reintentar</button><button type="button" class="btn btn--small" data-action="rc-expand-discard">Cerrar</button></div></section>`;
    const d = x.draft, det = style === 'detailed';
    return `<section class="rcx" id="rcx" aria-labelledby="rcx-title">${head}${seg}
      <p class="field__hint">Cambiar el estilo vuelve a generar el borrador. Edita lo que quieras: solo se guarda al agregarlo al plan.</p>
      <div class="field"><label for="rcx-objective" class="field__hint">Objetivo</label><textarea id="rcx-objective" rows="2">${esc(d.objective)}</textarea></div>
      ${(d.known || []).length ? `<div class="rcx__known" id="rcx-known"><strong>Ya sabemos</strong> <span class="field__hint">(de tus datos, solo lectura)</span><div class="rcx__chips">${d.known.map((k) => `<span class="rcx__chip">${esc(k)}</span>`).join('')}</div></div>` : ''}
      <h5 class="rcx__h">Pasos</h5>
      <div class="rcx__steps" role="list">${d.steps.map((st, i) => `<div class="rcx__step" role="listitem" data-rcx-step="${i}">
        <span class="rcx__n" aria-hidden="true">${i + 1}</span>
        <div class="field rcx__f-text"><label for="rcx-t-${i}" class="field__hint">Paso ${i + 1}</label><textarea id="rcx-t-${i}" rows="2" data-k="text">${esc(st.text)}</textarea></div>
        <div class="field"><label for="rcx-o-${i}" class="field__hint">Responsable</label><input id="rcx-o-${i}" type="text" data-k="owner" value="${esc(st.owner)}"></div>
        <div class="field"><label for="rcx-w-${i}" class="field__hint">Cuándo</label><input id="rcx-w-${i}" type="text" data-k="when" value="${esc(st.when)}"></div>
        <button type="button" class="btn btn--small btn--ghost rcx__del" data-action="rc-expand-step-del" data-index="${i}" aria-label="Quitar el paso ${i + 1}">Quitar</button></div>`).join('')}</div>
      <div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-expand-step-add">+ Agregar paso</button></div>
      <div class="rcx-tabs" role="group" aria-label="Secciones del plan"><button type="button" class="rcx-tab" data-action="rc-expand-tab" data-tab="measure" aria-pressed="true">Cómo se mide</button><button type="button" class="rcx-tab" data-action="rc-expand-tab" data-tab="data" aria-pressed="false">Datos a revisar</button>${det ? '<button type="button" class="rcx-tab" data-action="rc-expand-tab" data-tab="risks" aria-pressed="false">Riesgos y supuestos</button><button type="button" class="rcx-tab" data-action="rc-expand-tab" data-tab="dont" aria-pressed="false">Qué NO hacer</button>' : ''}</div>
      <div class="field rcx-pane" data-pane="measure"><label for="rcx-measure" class="field__hint">Cómo se mide (el impacto lo calcula el motor de escenarios, no la IA)</label><textarea id="rcx-measure" rows="2">${esc(d.measure)}</textarea></div>
      <div class="field rcx-pane" data-pane="data" hidden><label for="rcx-data" class="field__hint">Datos a revisar antes de ejecutar (uno por línea)</label><textarea id="rcx-data" rows="3">${esc(lines(d.dataToReview))}</textarea></div>
      ${det ? `<div class="field rcx-pane" data-pane="risks" hidden><label for="rcx-risks" class="field__hint">Riesgos y supuestos (uno por línea)</label><textarea id="rcx-risks" rows="3">${esc(lines(d.risks))}</textarea></div>
      <div class="field rcx-pane" data-pane="dont" hidden><label for="rcx-dont" class="field__hint">Qué NO hacer (uno por línea)</label><textarea id="rcx-dont" rows="3">${esc(lines(d.dontDo))}</textarea></div>` : ''}
      <p class="note note--warning">Borrador de IA: revísalo. Las cifras que cite se validan contra tus datos; si alguna no coincide, no se genera.</p>
      <div class="btn-row rcx__btns"><button type="button" class="btn btn--primary" data-action="rc-expand-add">Agregar al plan</button><button type="button" class="btn" data-action="rc-expand-regen">↻ Regenerar</button><button type="button" class="btn" data-action="rc-expand-copy">Copiar texto</button><button type="button" class="btn" data-action="rc-expand-discard">Descartar</button></div></section>`;
  }

  function renderLibrary(state) {
    const esc = H().esc;
    const rc = state.rc;
    const eligible = scenariosWithHyp(rc);
    const selSc = eligible.find((s) => s.scenarioId === rc.actionScenario) || eligible[0] || null;
    if (selSc) rc.actionScenario = selSc.scenarioId;
    const driver = rc.libraryDriver || (selSc ? selSc.links.driver : '') || '';
    const avail = rc.analysis ? rc.analysis.dataQuality.availableTargets : [];
    const signals = rc.analysis ? rc.analysis.signals : [];
    const catalog = FP.actionLibrary.applicable(rc.custom, { driver: driver || null, channel: rc.ctx.channel === '__import' ? 'total' : rc.ctx.channel,
      signalMetrics: signals.map((s) => s.metric), availableData: avail });
    const ai = rc.ai;
    rc._catalogItems = catalog;   // el panel «Ampliar con IA» y la acción leen el mismo catálogo filtrado que se ve
    const cohereOk = Boolean(FP.cohereConnection && FP.cohereConnection.isConfigured());
    const expandOff = !selSc ? 'Primero guarda y elige un escenario' : !cohereOk ? 'Para usar la IA inicia sesión con tu equipo o pega tu API key de Cohere en Configuración' : (rc.expand && rc.expand.status === 'busy') ? 'Consultando…' : '';
    $('rc-library').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Catálogo de acciones posibles</h3>
        <span class="field__hint">Catálogo configurable; no son recomendaciones y nada se ejecuta automáticamente.</span></div>
      <div class="filters">
        <div class="field"><label for="rc-act-sc" class="field__hint">Escenario (con hipótesis) al que se liga la acción</label>
          <select id="rc-act-sc" data-action="rc-action-scenario">${eligible.length ? eligible.map((s) => `<option value="${esc(s.scenarioId)}" ${selSc && s.scenarioId === selSc.scenarioId ? 'selected' : ''}>${esc(s.scenarioId)} · ${esc(s.name)}</option>`).join('')
            : '<option value="">Guarda un escenario ligado a una hipótesis</option>'}</select></div>
        <div class="field"><label for="rc-lib-driver" class="field__hint">Driver</label>
          <select id="rc-lib-driver" data-action="rc-library-driver"><option value="">Todos</option>
            ${Object.entries(DRIVER).map(([k, l]) => `<option value="${k}" ${driver === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      ${!selSc ? '<p class="note note--warning">Para agregar una acción al plan primero debe existir la cadena: hipótesis → escenario guardado ligado a esa hipótesis.</p>' : `
        <p class="field__hint">Hipótesis: <strong>${esc(selSc.links.hypothesisId)}</strong> ${esc(selSc.links.hypothesis || '')} · Escenario: ${esc(FP.scenarioView.changesText(selSc.inputs))}, impacto simulado ${esc(signedMoney(selSc.expectedImpact.incrementalValue))}.</p>`}
      <div class="table-wrap"><table class="table ds-table">
        <thead><tr><th>Acción</th><th>Driver</th><th>Área</th><th>Mide</th><th>Datos</th><th></th></tr></thead>
        <tbody>${catalog.map((a) => `<tr><td><strong>${esc(a.name)}</strong>${a.custom ? ' <span class="chip">propia</span>' : ''}<span class="cell-sub">${esc(a.description)}</span></td>
          <td>${esc(DRIVER[a.driver])}${a.signalMatch ? '<span class="cell-sub">hay señales de este driver</span>' : ''}</td><td>${esc(a.ownerArea)}</td>
          <td>${esc(C().metrics[a.measurementMetric] ? C().metrics[a.measurementMetric].label : a.measurementMetric)}${a.defaultWindowDays ? `<span class="cell-sub">${a.defaultWindowDays} días</span>` : ''}</td>
          <td>${a.dataAvailable ? H().pill('ok', 'Disponibles') : H().pill('warning', 'Faltan') + `<span class="cell-sub">${esc(a.missingData.join(', '))}</span>`}</td>
          <td><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-add-action" data-id="${esc(a.actionId)}" ${selSc && a.dataAvailable ? '' : `disabled title="${selSc ? 'Falta el dato que esta acción necesita' : 'Primero guarda y elige un escenario'}"`}>Agregar al plan</button><button type="button" class="btn btn--small btn--ai" data-action="rc-expand" data-id="${esc(a.actionId)}" ${expandOff ? `disabled title="${expandOff}" aria-describedby="rcx-why"` : ''}>✦ Ampliar con IA</button>${a.custom ? `<button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="rc-delete-custom" data-id="${esc(a.actionId)}" aria-label="Quitar la acción propia ${esc(a.name)} del catálogo">Quitar</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>
      ${expandOff && selSc ? `<p class="field__hint" id="rcx-why" role="note">«Ampliar con IA» no está disponible: ${expandOff}.</p>` : ''}
      ${expandPanel(state)}
      <details class="disclosure"><summary>Agregar una acción propia al catálogo</summary><div class="panel__body">
        <div class="settings-grid">
          <div class="field"><label for="rc-cu-name" class="field__hint">Nombre</label><input id="rc-cu-name" data-draft type="text"></div>
          <div class="field"><label for="rc-cu-driver" class="field__hint">Driver que intenta modificar</label>
            <select id="rc-cu-driver" data-draft>${Object.entries(DRIVER).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field"><label for="rc-cu-owner" class="field__hint">Área responsable</label><input id="rc-cu-owner" data-draft type="text"></div>
          <div class="field"><label for="rc-cu-days" class="field__hint">Ventana de medición (días)</label><input id="rc-cu-days" data-draft type="number" min="1" step="1"></div>
          <div class="field field--full"><label for="rc-cu-desc" class="field__hint">Descripción</label><input id="rc-cu-desc" data-draft type="text"></div>
        </div>
        <button type="button" class="btn" data-action="rc-add-custom">Agregar al catálogo</button></div></details>
      <div class="ai-box">
        <div class="subhead"><h4>Líneas de acción con Cohere (opcional)</h4>
          <button type="button" class="btn btn--small" data-action="rc-ai" ${selSc && ai.status !== 'busy' ? '' : `disabled title="${selSc ? 'Consultando…' : 'Primero guarda y elige un escenario'}"`}>${ai.status === 'busy' ? 'Consultando…' : 'Proponer con Cohere'}</button></div>
        <p class="field__hint">Cohere recibe la hipótesis, el driver, las señales y el escenario ya calculados. No calcula impacto ni cifras y sus propuestas requieren validación. Usa la API key de Configuración de RevNavigator.</p>
        ${ai.status === 'busy' ? FP.loader.html('Consultando a Cohere…', { key: 'rc-ai' }) : ''}
        ${ai.status === 'unavailable' || ai.status === 'invalid' ? `<p class="ds-alert ds-alert--danger" role="alert">Análisis con IA no disponible. ${esc(ai.errors.join(' '))}</p>` : ''}
        ${ai.actions.length ? `<ul class="alert-list">${ai.actions.map((a, i) => `<li>${H().pill('na', 'IA · propuesta')} <span><strong>${esc(a.action)}</strong> (${esc(DRIVER[a.relatedDriver])})
          <span class="cell-sub">${esc(a.rationale)}${a.informationNeeded.length ? ` · Información necesaria: ${esc(a.informationNeeded.join('; '))}` : ''}</span></span>
          <button type="button" class="btn btn--small" data-action="rc-add-ai-action" data-index="${i}">Agregar al plan</button></li>`).join('')}</ul>` : ''}
      </div>`;
  }

  function renderPlan(state) {
    const esc = H().esc;
    const rc = state.rc;
    const actions = rc.analysis ? (rc.analysis.allActions || rc.analysis.actions) : [];   // con «Total digital»: acciones de cualquier canal (mismo periodo)
    const statuses = C().recovery.actionStatuses;
    if (!actions.length) { $('rc-plan').innerHTML = '<div class="subhead"><h3 class="panel__title">Plan de acción</h3></div><p class="note">Sin acciones para este canal y periodo.</p>'; return; }
    const counts = Object.keys(statuses).map((k) => [k, actions.filter((a) => a.status === k).length]).filter(([, n]) => n);
    $('rc-plan').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Plan de acción</h3>
        <span>${counts.map(([k, n]) => H().pill(STATUS_PILL[k], `${statuses[k]}: ${n}`)).join(' ')}</span></div>
      <div class="table-wrap"><table class="table ds-table">
        <thead><tr><th>Acción</th><th>Cadena</th><th>Responsable</th><th>Estado</th><th>Fechas</th><th class="num" data-state="scenario">Impacto simulado</th><th>Prioridad (descriptiva)</th><th></th></tr></thead>
        <tbody>${actions.map((a) => {
          const p = a.priority || {};
          const last = FP.actionTracking.latest(rc.plan, a.actionId);
          return `<tr>
            <td><strong>${esc(a.actionId)}</strong> ${esc(a.title)}${rc.ctx && rc.ctx.channel === 'total' && a.channel ? ` <span class="chip chip--soft">Canal: ${esc(FP.scenarioEngine.chLabel(a.channel))}</span>` : ''}<span class="cell-sub">${esc(a.description || '')}${a.source === 'cohere' ? ' · propuesta por IA' : ''}</span>${detailHtml(a)}</td>
            <td class="wrap"><span class="cell-sub">Driver ${esc(DRIVER[a.driver] || a.driver || '—')} · ${esc(a.hypothesisId || '—')} · ${esc(a.scenarioId || '—')}</span></td>
            <td><input type="text" value="${esc(a.owner)}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="owner" aria-label="Responsable" class="input--compact"></td>
            <td><select data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="status" aria-label="Estado">${FP.actionPlan.nextStates(state.rc.plan, a).map((o) =>
              `<option value="${o.status}" ${o.current ? 'selected' : ''} ${o.allowed ? '' : 'disabled'} ${o.reason ? `title="${esc(o.reason)}"` : ''}>${esc(statuses[o.status])}${o.allowed ? '' : ' (aún no)'}</option>`).join('')}</select>
              ${FP.actionPlan.integrityIssue(state.rc.plan, a) ? `<span class="cell-sub" data-action-integrity="1">${esc(FP.actionPlan.integrityIssue(state.rc.plan, a))}</span>` : ''}</td>
            <td><input type="date" value="${esc(a.startDate || '')}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="startDate" aria-label="Inicio" class="input--compact">
              <input type="date" value="${esc(a.endDate || '')}" data-action="rc-action-field" data-id="${esc(a.actionId)}" data-key="endDate" aria-label="Fin" class="input--compact"></td>
            <td class="num">${esc(signedMoney(a.expectedImpact ? a.expectedImpact.incrementalValue : null))}<span class="cell-sub"><span class="ds-badge ds-badge--scenario">simulado</span></span>${goalHtml(a, true)}</td>
            <td><span class="cell-sub">Impacto simulado: ${esc(p.simulatedImpact || 'n/d')} · Exposición: ${esc(p.exposure || 'n/d')} · Urgencia: ${esc(p.urgency || 'n/d')} · Evidencia: ${esc(p.evidence || 'n/d')} · ${esc(p.constraints || '')}</span></td>
            <td><div class="btn-row"><button type="button" class="btn btn--small" data-action="rc-measure" data-id="${esc(a.actionId)}">Medir</button>
              <button type="button" class="btn btn--small btn--ghost" data-action="rc-tree-action" data-id="${esc(a.actionId)}">Ver cadena</button>
              <button type="button" class="btn btn--small btn--ghost btn--danger-text" data-action="rc-delete-action" data-id="${esc(a.actionId)}" aria-label="Borrar la acción ${esc(a.actionId)}">Borrar</button></div>
              ${last ? `<span class="cell-sub">${esc(CONS[last.consistency][1])}</span>` : ''}
              <details><summary class="cell-sub">Historial (${a.history.length})</summary><ul class="plain-list">${a.history.map((h) => `<li class="cell-sub">${esc(h.at.slice(0, 16).replace('T', ' '))} · ${esc(h.field)}: ${esc(String(h.from ?? '—'))} → ${esc(String(h.to ?? '—'))}</li>`).join('')}</ul></details></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">La prioridad es descriptiva (factores cuantitativos), no indica cuál acción es mejor. Los cambios quedan en el historial. Puedes borrar las acciones que tú agregaste (se pide confirmación); las del catálogo base y las propuestas no se borran.</p>`;
  }

  /** Avance del objetivo operativo en una medición (mismo cálculo que la medición: observado − base ÷ escenario − base; descriptivo). */
  function goalProgress(plan, m) {
    const esc = H().esc, a = plan.actions.find((x) => x.actionId === m.actionId), g = a && a.operativeGoal;
    const k = g ? g.metric : (a && a.driver); const c = m.byMetric && m.byMetric[k]; if (!c || !(k in C().metrics)) return '<span class="cell-sub">—</span>';
    const sg = (v) => (FP.pacingView && FP.pacingView.signed ? FP.pacingView.signed(k, v) : String(v));
    const sd = g && g.scenarioDelta;   // si la persona cambió el objetivo, se escala el esperado de los días con real en la misma proporción
    const goalDelta = typeof c.expectedDelta === 'number' && g && g.edited && sd ? c.expectedDelta * (g.delta / sd) : c.expectedDelta;
    const done = typeof c.deltaVsBaseline === 'number' && typeof goalDelta === 'number' && goalDelta !== 0 ? c.deltaVsBaseline / goalDelta : null;
    return `<strong>${esc((g && g.label) || C().metrics[k].label)}</strong><span class="cell-sub">Logrado ${esc(sg(c.deltaVsBaseline))} de ${esc(sg(goalDelta))}${done === null ? '' : ` · ${(done * 100).toFixed(0)} %`}</span>`;
  }
  function renderTracking(state) {
    const esc = H().esc;
    const rc = state.rc;
    const ids = new Set((rc.analysis ? (rc.analysis.allActions || rc.analysis.actions) : []).map((a) => a.actionId));
    const ms = rc.plan.measurements.filter((m) => ids.has(m.actionId));
    if (!ms.length) { $('rc-tracking').innerHTML = '<div class="subhead"><h3 class="panel__title">Seguimiento</h3></div><p class="note">Sin mediciones. Usa "Medir" en una acción cuando haya real en su ventana.</p>'; return; }
    const fmt = (k, v) => F().metric(k, v);
    $('rc-tracking').innerHTML = `<div class="subhead"><h3 class="panel__title">Seguimiento: baseline, escenario y observado</h3></div>
      <div class="table-wrap"><table class="table ds-table">
        <thead><tr><th>Acción</th><th>Medición</th><th>Métrica</th><th class="num" data-state="baseline">Baseline</th><th class="num" data-state="scenario">Escenario <span class="ds-badge ds-badge--scenario">Simulado</span></th>
          <th class="num" data-state="observed">Observado <span class="ds-badge ds-badge--observed">Observado</span></th><th class="num">Δ vs baseline</th><th class="num">Δ vs escenario</th><th>Objetivo operativo</th><th>Lectura</th></tr></thead>
        <tbody>${ms.slice().reverse().map((m) => {
          const k = m.metric, d = m.delta;
          const [cls, lbl] = CONS[m.consistency];
          return `<tr><td>${esc(m.actionId)}</td><td class="num">${esc(m.measurementDate)}<span class="cell-sub">${m.observedDays} de ${m.windowDays} días con real</span></td>
            <td>${esc(C().metrics[k] ? C().metrics[k].label : k)}</td>
            <td class="num">${esc(fmt(k, d.baseline))}</td><td class="num">${esc(fmt(k, d.scenario))}</td><td class="num">${esc(fmt(k, d.observed))}</td>
            <td class="num">${esc(k === 'conversionRate' ? FP.pacingView.signed(k, d.deltaVsBaseline) : FP.pacingView.signed(k, d.deltaVsBaseline))}</td>
            <td class="num">${esc(FP.pacingView.signed(k, d.deltaVsScenario))}</td>
            <td class="wrap">${goalProgress(rc.plan, m)}</td>
            <td class="wrap">${H().pill(cls, lbl)}<span class="cell-sub">${esc(m.statement)}</span>
              <details><summary class="cell-sub">Factores que pueden afectar la comparación</summary><ul class="plain-list">${m.factors.map((f) => `<li class="cell-sub">${esc(f)}</li>`).join('')}</ul></details></td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="field__hint">Lectura: "consistente / no consistente con el escenario". Nunca "la acción causó". Impacto simulado y observado no se mezclan.</p>`;
  }

  function render(state) {
    renderLibrary(state);
    renderPlan(state);
    renderTracking(state);
  }

  FP.actionPlanView = { render, detailText, goalHtml, goalProgressText: (plan, m) => goalProgress(plan, m).replace(/<strong>.*?<\/strong>/, '').replace(/<\/?span[^>]*>/g, '') };
})(typeof window !== 'undefined' ? window : globalThis);
