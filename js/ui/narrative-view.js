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

  // Jerarquía de la narrativa: Hecho → Cálculo → Driver → Señal → Hipótesis → Siguiente paso.
  // Cadena de evidencia (chip rectangular, no la píldora de estado): Hecho/Driver/Señal/Hipótesis con su color; Cálculo y Siguiente paso, neutros.
  const LEVEL = {
    hecho: ['ds-badge--fact', 'Hecho'], calculo: ['ds-badge--neutral', 'Cálculo'], driver: ['ds-badge--driver', 'Driver'],
    senal: ['ds-badge--signal', 'Señal'], hipotesis: ['ds-badge--hyp', 'Hipótesis'], accion: ['ds-badge--neutral', 'Siguiente paso']
  };
  const SECTION_TITLES = {
    performance: null, // se divide en "¿Qué pasó?" (hecho) y "¿Por qué importa?" (cálculo)
    drivers: '¿Qué está explicando el resultado?', signals: 'Señales: dónde investigar', hypotheses: 'Hipótesis (requieren validación)',
    product: 'Producto y geografía', recovery: 'Recuperación', nextSteps: '¿Qué hacer ahora?'
  };

  function sourceDetail(src) {
    if (!src) return 'Sin fuente registrada.';
    const { module, field, scope, ...rest } = src;
    const extra = Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(' · ');
    const scopeTxt = scope ? ` · Alcance: ${Object.entries(scope).map(([k, v]) => `${k}: ${typeof v === 'object' && v ? JSON.stringify(v) : v}`).join(', ')}` : '';
    return `Módulo: ${module}${field ? ` · Campo: ${field}` : ''}${extra ? ` · ${extra}` : ''}${scopeTxt}`;
  }

  function renderClaim(c, esc) {
    const [kind, label] = LEVEL[c.level] || ['ds-badge--neutral', c.level];
    return `<li class="claim">
      <div class="claim__row"><span class="ds-badge ds-badge--chain ${kind}">${esc(label)}</span> <span>${esc(c.text)}</span></div>
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
      <div class="nx-head">
        <div class="subhead"><h3 class="panel__title">Narrativa ejecutiva</h3>
          <span class="field__hint">Lo que ya calculó la app, convertido en una explicación. No es un motor nuevo: cada frase cita un cálculo ya hecho.</span></div>
        <p class="field__hint nx-head__ctx">Se narra el mismo canal, periodo y comparación de <a href="#diagnostico">Diagnóstico</a>: <strong>${esc(FP.navigation.contextLabel({ channel: s.channel }))}</strong> ·
          ${esc(n && n.period ? n.period.label : '')} · ${esc(n && n.comparison ? n.comparison.label : '')}. Para cambiarlos, ve a Diagnóstico, o cambia periodo y canal aquí mismo (es la misma selección).</p>
        <div class="nx-head__bar">
          ${contextControls(state, 'nx', 'dx-setting', 'dx-period-type')}
          <div class="btn-row nx-head__btns">
            <button type="button" class="btn btn--small" data-action="nx-ai" ${state.nx.ai.status === 'busy' ? 'disabled' : ''}>${state.nx.ai.status === 'busy' ? 'Redactando…' : 'Redactar con Cohere (opcional)'}</button>
            <button type="button" class="btn btn--small" data-action="nx-export" ${n ? '' : 'disabled'}>Exportar narrative_export.json</button>
          </div>
        </div>
        <p class="field__hint">Cohere usa la API key configurada en Configuración de RevNavigator. Solo redacta: no calcula, no agrega cifras nuevas y se valida antes de mostrarse.</p>
      </div>`;
  }

  /** Indicadores clave de la primera zona de lectura. No calculan nada: leen los mismos campos del forecast
   * que ya cita la narrativa (performanceSection: forecastEngine · annual) y los formatean con FP.format. */
  function kpiStrip(state, esc) {
    const n = state.nx.narrative, run = state.fc && state.fc.run;
    if (!n || !n.readyToNarrate || !n.readyToNarrate.performance || !run) return '';
    const id = n.channel && n.channel.id, S = id === 'total' || !id ? run.total : (run.channels || {})[id], a = S && S.annual;
    if (!a) return '';
    const F = FP.format, fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const money = (v) => (fin(v) ? F.currency(v, 0) : null), pct = (v) => (fin(v) ? F.percent(v, 1) : null), spc = (v) => (fin(v) ? F.signedPercent(v, 1) : null);
    const td = a.toDate && a.toDate.revenue, fg = a.forecastGap && a.forecastGap.revenue;
    const tile = (label, level, value, sub, tone) => `<div class="nx-kpi${tone ? ` nx-kpi--${tone}` : ''}"><div class="nx-kpi__l">${esc(label)} <span class="ds-badge ds-badge--chain ${LEVEL[level][0]}">${esc(LEVEL[level][1])}</span></div>
      <div class="nx-kpi__v">${value === null ? '<span class="nx-kpi__na">No disponible</span>' : esc(value)}</div>${sub ? `<div class="nx-kpi__s">${esc(sub)}</div>` : ''}</div>`;
    const gap = td ? td.gap : null;
    return `<div class="nx-kpis" aria-label="Indicadores del resultado">
      ${tile('Venta observada', 'hecho', money(a.actualToDate ? a.actualToDate.revenue : null), fin(a.plan && a.plan.revenue) ? `plan anual ${money(a.plan.revenue)}` : null)}
      ${tile('Cumplimiento a la fecha', 'calculo', pct(td ? td.compliance : null), 'contra el plan de los mismos días', fin(td && td.compliance) ? (td.compliance >= 1 ? 'pos' : 'neg') : null)}
      ${tile('Brecha contra el plan', 'calculo', money(gap), fin(td && td.gapPct) ? `${spc(td.gapPct)} frente al plan de los mismos días` : null, fin(gap) ? (gap >= 0 ? 'pos' : 'neg') : null)}
      ${tile('Forecast de cierre', 'calculo', money(a.forecast ? a.forecast.revenue : null), fg && fin(fg.gap) ? `${fg.gap >= 0 ? 'por encima' : 'por debajo'} de la meta por ${money(Math.abs(fg.gap))}` : null)}
    </div>`;
  }

  function renderSummary(state) {
    const esc = H().esc;
    const n = state.nx.narrative;
    if (!n) { $('nx-summary').innerHTML = '<div class="empty"><strong>Todavía no hay narrativa</strong>Hace falta un forecast calculado: guarda o importa un plan y carga venta real.</div>'; return; }
    const r = n.readyToNarrate;
    const badge = (ok, label) => `<span class="chip ${ok ? '' : 'chip--soft'}">${ok ? '✓' : '—'} ${esc(label)}</span>`;
    $('nx-summary').innerHTML = `
      <div class="nx-sumhead"><h3 class="panel__title" id="nx-summary-title">Resumen ejecutivo</h3>
        <p class="nx-cover" aria-label="Cobertura de información">${[badge(r.performance, 'Desempeño'), badge(r.diagnosis, 'Diagnóstico'), badge(r.signals, 'Señales'), badge(r.hypotheses, 'Hipótesis'),
        badge(r.productAnalysis, 'Producto'), badge(r.recovery, 'Recuperación')].join(' ')}</p></div>
      ${kpiStrip(state, esc)}
      <p class="narrative-summary">${esc(n.executiveSummary.text)}</p>
      <p class="field__hint">${esc(n.note)}</p>`;
  }

  function periodText(period) {
    if (!period) return '';
    if (period.type === 'range') return `${period.start} a ${period.end}`;
    if (period.type === 'year') return `Año ${period.key}`;
    return FP.calendar.periodLabel(period.key, period.type);
  }

  function channelText(id) {
    if (id === 'total' || !id) return 'Total digital';
    const ch = FP.dataModel.getChannel(id);
    return ch ? ch.label : id;
  }

  /** Banner compacto de alcance (§17 de la fase de hardening): evita mezclar en silencio el contexto
   * principal (Diagnóstico) con el de una fuente secundaria (Producto/Recovery), que conserva el suyo. */
  function scopeBanner(kind, scope, esc) {
    if (!scope) return '';
    if (kind === 'product') {
      const cmp = scope.comparison === 'yoy' ? 'vs mismo periodo año anterior' : 'vs periodo anterior';
      return `<p class="scope-banner">${esc(channelText(scope.channel))} · ${esc(scope.period.from)} a ${esc(scope.period.to)} · ${esc(cmp)} · Nivel: ${esc(scope.levelLabel)}</p>`;
    }
    const parts = [];
    if (scope.recoveryCenter) parts.push(`${esc(channelText(scope.recoveryCenter.channel))} · ${esc(periodText(scope.recoveryCenter.period))}`);
    if (scope.reforecast) parts.push(`Horizonte: ${scope.reforecast.horizon === 'year' ? 'Anual' : 'Mensual'}`);
    return parts.length ? `<p class="scope-banner">${parts.join(' · ')}</p>` : '';
  }

  function block(title, claims, esc, { analystOnly = false, scopeHtml = '', cls = '' } = {}) {
    if (!claims.length) return '';
    return `<section class="narrative-block"${analystOnly ? ' data-analyst' : ''}>${title ? `<h4>${esc(title)}</h4>` : ''}${scopeHtml}
      <ul class="claims${cls ? ` ${cls}` : ''}">${claims.map((c) => renderClaim(c, esc)).join('')}</ul></section>`;
  }

  function renderSections(state) {
    const esc = H().esc;
    const n = state.nx.narrative;
    if (!n) { $('nx-sections').innerHTML = ''; return; }
    const hecho = claimsByLevel(n, 'performance', 'hecho');
    const calculo = claimsByLevel(n, 'performance', 'calculo');
    // Agrupación visual (Fase 15.1): mismos bloques y mismo contenido, en una cuadrícula de columnas con jerarquía
    // Resultado → Explicación → Señales/hipótesis → Producto/recuperación → Siguiente paso. Nada se quita ni se renombra.
    const col = (inner, full) => (inner.join('') ? `<div class="nx-col${full ? ' nx-col--full' : ''}">${inner.join('')}</div>` : '');
    const rows = [];
    rows.push(col([block('¿Qué pasó?', hecho, esc)]));
    rows.push(col([block('¿Por qué importa?', calculo, esc)]));
    // Drivers: el enunciado principal siempre visible; el desglose por driver es detalle de modo Analista (en 3 columnas, compacto).
    const dr = [];
    const driverClaims = n.claims.filter((c) => n.sections.drivers.claims.includes(c.id));
    if (driverClaims.length) {
      dr.push(block(SECTION_TITLES.drivers, driverClaims.slice(0, 1), esc));
      if (driverClaims.length > 1) dr.push(block(null, driverClaims.slice(1), esc, { analystOnly: true, cls: 'claims--cols' }));
    } else if (n.sections.drivers.empty) dr.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES.drivers)}</h4><p class="note">${esc(n.sections.drivers.empty)}</p></section>`);
    rows.push(col(dr, true));
    // Señales e hipótesis: solo la de mayor prioridad siempre visible; el resto es detalle de modo Analista.
    ['signals', 'hypotheses'].forEach((key) => {
      const sec = n.sections[key], inner = [];
      if (sec.empty) { inner.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES[key])}</h4><p class="note">${esc(sec.empty)}</p></section>`); rows.push(col(inner)); return; }
      const claims = n.claims.filter((c) => sec.claims.includes(c.id));
      inner.push(block(SECTION_TITLES[key], claims.slice(0, 1), esc));
      if (claims.length > 1) inner.push(block(null, claims.slice(1), esc, { analystOnly: true }));
      if (claims.length > 1) inner.push(`<p class="field__hint" data-analyst>${claims.length - 1} más.</p>`);
      rows.push(col(inner));
    });
    // Producto y recuperación: detalle completo de modo Analista (el resumen ejecutivo ya los resume arriba).
    // Cada una conserva su propio alcance (canal/periodo/comparación/nivel u horizonte) — nunca se asume
    // que coincide con el de Diagnóstico; el banner lo deja explícito.
    ['product', 'recovery'].forEach((key) => {
      const sec = n.sections[key], inner = [];
      if (sec.empty) { inner.push(`<section class="narrative-block" data-analyst><h4>${esc(SECTION_TITLES[key])}</h4><p class="note">${esc(sec.empty)}</p></section>`); rows.push(col(inner)); return; }
      const claims = n.claims.filter((c) => sec.claims.includes(c.id));
      const scopeHtml = scopeBanner(key, sec.scope, esc);
      inner.push(block(SECTION_TITLES[key], claims, esc, { analystOnly: true, scopeHtml }));
      if (key === 'product' && sec.geoNote) inner.push(`<p class="field__hint" data-analyst>${esc(sec.geoNote)}</p>`);
      rows.push(col(inner));
    });
    rows.push(col([block(SECTION_TITLES.nextSteps, n.claims.filter((c) => n.sections.nextSteps.claims.includes(c.id)), esc)], true));
    $('nx-sections').innerHTML = `<div class="nx-grid">${rows.join('')}</div>`;
  }

  function renderAi(state) {
    const esc = H().esc;
    const ai = state.nx.ai;
    const box = $('nx-ai'), sec = box.closest('section');
    if (sec) sec.hidden = ai.status === null;   // sin redacción de Cohere no se muestra un panel vacío
    if (ai.status === null) { box.innerHTML = ''; return; }
    if (ai.status === 'busy') { $('nx-ai').innerHTML = '<p class="ds-loading" role="status">Redactando con Cohere…</p>'; return; }
    if (ai.status !== 'ok') {
      $('nx-ai').innerHTML = `<div class="ds-alert ds-alert--danger" role="alert">Análisis con IA no disponible. ${esc((ai.errors || []).join(' '))} La narrativa determinística sigue disponible y no depende de Cohere.</div>`;
      return;
    }
    const r = ai.result;
    $('nx-ai').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Redacción de Cohere <span class="chip">validada</span></h3>
        <span class="field__hint">Redactó el resumen y las secciones en prosa; se verificó que no agregara ninguna cifra nueva.</span></div>
      <p class="narrative-summary">${esc(r.summary)}</p>
      <div class="narrative-ai-body">${esc(r.narrative).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${r.missingInfo && r.missingInfo.length ? `<p class="field__hint">Información que Cohere marcó como faltante: ${esc(r.missingInfo.join('; '))}.</p>` : ''}`;
  }

  /**
   * Periodo (mes, semana o año), cuál y canal: los mismos controles que Diagnóstico, sobre la misma selección. Los usan la Narrativa
   * (acciones dx-setting / dx-period-type) y la página del paquete (acción pkg-context, que también mueve Recovery y Producto).
   */
  function contextControls(state, idp, keyAction, typeAction, extra = '') {
    const esc = H().esc, s = state.dx.settings, C = FP.config;
    const typeBtns = [['month', 'Mes'], ['week', 'Semana'], ['year', 'Año']].map(([v, l]) =>
      `<button type="button" data-action="${typeAction}" ${typeAction === 'pkg-context' ? 'data-key="periodType" ' : ''}data-value="${v}" aria-pressed="${s.periodType === v}">${esc(l)}</button>`).join('');
    const sel = (id, key, opts, cur, label) => `<div class="field"><label for="${id}" class="field__hint">${esc(label)}</label>
      <select id="${id}" data-action="${keyAction}" data-key="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    return `<div class="filters">
        <div class="field"><span class="field__hint">Periodo</span><div class="segmented" role="group" aria-label="Tipo de periodo">${typeBtns}</div></div>
        ${sel(`${idp}-key`, 'periodKey', FP.diagnosticView.periodOptions(state), s.periodKey, 'Cuál')}
        ${sel(`${idp}-ch`, 'channel', [['total', 'Total digital'], ...C.channels.map((c) => [c.id, c.label])], s.channel, 'Canal')}
        ${extra}
      </div>`;
  }

  function render(state) {
    renderControls(state);
    renderSummary(state);
    renderSections(state);
    renderAi(state);
  }

  FP.narrativeView = { render, contextControls };
})(typeof window !== 'undefined' ? window : globalThis);
