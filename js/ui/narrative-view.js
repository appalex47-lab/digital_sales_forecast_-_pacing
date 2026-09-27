/**
 * narrative-view.js — Narrativa ejecutiva (Fase 9.2).
 * Solo pinta: todo el contenido viene ya calculado de FP.narrativeEngine.build() (ver ensureNarrative()
 * en app.js). El contexto (canal/periodo/comparación), la barra de aprendizaje y el explicador de la
 * vista ya los pinta el render genérico de Fase 7/9.1; aquí solo van resumen, secciones y Cohere.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const LEVEL = {
    hecho: ['ok', 'Hecho'], calculo: ['ok', 'Cálculo'], driver: ['na', 'Driver'],
    senal: ['warning', 'Señal'], hipotesis: ['na', 'Hipótesis'], accion: ['ok', 'Siguiente paso']
  };
  const SECTION_TITLES = {
    performance: null, // se divide en "¿Qué pasó?" (hecho) y "¿Por qué importa?" (cálculo)
    drivers: '¿Qué está explicando el resultado?', signals: 'Señales: dónde investigar', hypotheses: 'Hipótesis (requieren validación)',
    product: 'Producto y geografía', recovery: 'Recuperación', nextSteps: '¿Qué hacer ahora?'
  };

  function sourceDetail(src) {
    if (!src) return 'Sin fuente registrada.';
    const { module, field, ...rest } = src;
    const extra = Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return `Módulo: ${module}${field ? ` · Campo: ${field}` : ''}${extra ? ` · ${extra}` : ''}`;
  }

  function renderClaim(c, esc) {
    const [kind, label] = LEVEL[c.level] || ['na', c.level];
    return `<li class="claim">
      <div class="claim__row">${H().pill(kind, label)} <span>${esc(c.text)}</span></div>
      <details class="claim__why"><summary>¿Por qué dices eso?</summary>
        <p class="cell-sub">${esc(sourceDetail(c.source))}${c.numbers.length ? ` · Cifras citadas: ${esc(c.numbers.join(', '))}` : ''}</p>
      </details>
    </li>`;
  }

  function claimsByLevel(n, sectionKey, level) {
    const ids = new Set(n.sections[sectionKey].claims);
    return n.claims.filter((c) => ids.has(c.id) && c.level === level);
  }

  function renderControls(state) {
    const esc = H().esc;
    const n = state.nx.narrative;
    const s = state.dx.settings;
    $('nx-controls').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Narrativa ejecutiva</h3>
        <span class="field__hint">Lo que ya calculó la app, convertido en una explicación. No es un motor nuevo: cada frase cita un cálculo ya hecho.</span></div>
      <p class="field__hint">Se narra el mismo canal, periodo y comparación de <a href="#diagnostico">Diagnóstico</a>: <strong>${esc(FP.navigation.contextLabel({ channel: s.channel }))}</strong> ·
        ${esc(n && n.period ? n.period.label : '')} · ${esc(n && n.comparison ? n.comparison.label : '')}. Para cambiarlos, ve a Diagnóstico.</p>
      <div class="btn-row">
        <button type="button" class="btn btn--small" data-action="nx-ai" ${state.nx.ai.status === 'busy' ? 'disabled' : ''}>${state.nx.ai.status === 'busy' ? 'Redactando…' : 'Redactar con Cohere (opcional)'}</button>
        <button type="button" class="btn btn--small" data-action="nx-export" ${n ? '' : 'disabled'}>Exportar narrative_export.json</button>
      </div>
      <p class="field__hint">Cohere usa la misma API key configurada en Diagnóstico. Solo redacta: no calcula, no agrega cifras nuevas y se valida antes de mostrarse.</p>`;
  }

  function renderSummary(state) {
    const esc = H().esc;
    const n = state.nx.narrative;
    if (!n) { $('nx-summary').innerHTML = '<div class="empty"><strong>Todavía no hay narrativa</strong>Hace falta un forecast calculado: guarda o importa un plan y carga venta real.</div>'; return; }
    const r = n.readyToNarrate;
    const badge = (ok, label) => `<span class="chip ${ok ? '' : 'chip--soft'}">${ok ? '✓' : '—'} ${esc(label)}</span>`;
    $('nx-summary').innerHTML = `
      <h3 class="panel__title" id="nx-summary-title">Resumen ejecutivo</h3>
      <p class="narrative-summary">${esc(n.executiveSummary.text)}</p>
      <p class="field__hint">${[badge(r.performance, 'Desempeño'), badge(r.diagnosis, 'Diagnóstico'), badge(r.signals, 'Señales'), badge(r.hypotheses, 'Hipótesis'),
        badge(r.productAnalysis, 'Producto'), badge(r.recovery, 'Recuperación')].join(' ')}</p>
      <p class="field__hint">${esc(n.note)}</p>`;
  }

  function block(title, claims, esc, { analystOnly = false } = {}) {
    if (!claims.length) return '';
    return `<section class="narrative-block"${analystOnly ? ' data-analyst' : ''}>${title ? `<h4>${esc(title)}</h4>` : ''}
      <ul class="claims">${claims.map((c) => renderClaim(c, esc)).join('')}</ul></section>`;
  }

  function renderSections(state) {
    const esc = H().esc;
    const n = state.nx.narrative;
    if (!n) { $('nx-sections').innerHTML = ''; return; }
    const hecho = claimsByLevel(n, 'performance', 'hecho');
    const calculo = claimsByLevel(n, 'performance', 'calculo');
    const parts = [];
    parts.push(block('¿Qué pasó?', hecho, esc));
    parts.push(block('¿Por qué importa?', calculo, esc));
    // Drivers: el enunciado principal siempre visible; el desglose por driver es detalle de modo Analista.
    const driverClaims = n.claims.filter((c) => n.sections.drivers.claims.includes(c.id));
    if (driverClaims.length) {
      parts.push(block(SECTION_TITLES.drivers, driverClaims.slice(0, 1), esc));
      if (driverClaims.length > 1) parts.push(block(null, driverClaims.slice(1), esc, { analystOnly: true }));
    } else if (n.sections.drivers.empty) parts.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES.drivers)}</h4><p class="note">${esc(n.sections.drivers.empty)}</p></section>`);
    // Señales e hipótesis: solo la de mayor prioridad siempre visible; el resto es detalle de modo Analista.
    ['signals', 'hypotheses'].forEach((key) => {
      const sec = n.sections[key];
      if (sec.empty) { parts.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES[key])}</h4><p class="note">${esc(sec.empty)}</p></section>`); return; }
      const claims = n.claims.filter((c) => sec.claims.includes(c.id));
      parts.push(block(SECTION_TITLES[key], claims.slice(0, 1), esc));
      if (claims.length > 1) parts.push(block(null, claims.slice(1), esc, { analystOnly: true }));
      if (claims.length > 1) parts.push(`<p class="field__hint" data-analyst>${claims.length - 1} más.</p>`);
    });
    // Producto y recuperación: detalle completo de modo Analista (el resumen ejecutivo ya los resume arriba).
    ['product', 'recovery'].forEach((key) => {
      const sec = n.sections[key];
      if (sec.empty) { parts.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES[key])}</h4><p class="note">${esc(sec.empty)}</p></section>`); return; }
      const claims = n.claims.filter((c) => sec.claims.includes(c.id));
      parts.push(block(SECTION_TITLES[key], claims, esc, { analystOnly: true }));
    });
    parts.push(block(SECTION_TITLES.nextSteps, n.claims.filter((c) => n.sections.nextSteps.claims.includes(c.id)), esc));
    $('nx-sections').innerHTML = parts.join('');
  }

  function renderAi(state) {
    const esc = H().esc;
    const ai = state.nx.ai;
    if (ai.status === null) { $('nx-ai').innerHTML = ''; return; }
    if (ai.status === 'busy') { $('nx-ai').innerHTML = '<p class="note">Redactando con Cohere…</p>'; return; }
    if (ai.status !== 'ok') {
      $('nx-ai').innerHTML = `<div class="note note--warning">Análisis con IA no disponible. ${esc((ai.errors || []).join(' '))} La narrativa determinística de arriba sigue disponible y no depende de Cohere.</div>`;
      return;
    }
    const r = ai.result;
    $('nx-ai').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Redacción de Cohere <span class="chip">validada</span></h3>
        <span class="field__hint">Redactó la narrativa de arriba en prosa; se verificó que no agregara ninguna cifra nueva.</span></div>
      <p class="narrative-summary">${esc(r.summary)}</p>
      <div class="narrative-ai-body">${esc(r.narrative).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${r.missingInfo && r.missingInfo.length ? `<p class="field__hint">Información que Cohere marcó como faltante: ${esc(r.missingInfo.join('; '))}.</p>` : ''}`;
  }

  function render(state) {
    renderControls(state);
    renderSummary(state);
    renderSections(state);
    renderAi(state);
  }

  FP.narrativeView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
