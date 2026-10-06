/**
 * help-view.js — «¿Cómo funciona RevNavigator?» · Centro de aprendizaje básico (Fase 9.x).
 *
 * Solo presentación. Todo el contenido sale de guidanceConfig (HOW_IT_WORKS, READ_DIAGNOSIS, STATES, HELP,
 * EXPLAINERS, METHODOLOGY) y del glosario existente: no hay textos ni cálculos nuevos.
 * Estructura: A. introducción · B. recorrido guiado · C. aprendizaje básico (5 tutoriales) · D. conceptos y referencia.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const t = (s) => (FP.explain ? FP.explain.term(s) : s);
  const esc = (s) => H().esc(s);

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const CHEV = '<svg class="ds-accordion__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON = {
    book: svg('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>'),
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    glossary: svg('<path d="M6 3h11a1 1 0 011 1v16H7a1 1 0 01-1-1z"/><path d="M9 8h6M9 12h6"/>'),
    method: svg('<path d="M12 3l8 3v6c0 4-3.5 7-8 9-4.5-2-8-5-8-9V6z"/>'),
    example: svg('<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>'),
    help: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z"/>'),
    faq: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17.5v.01"/>'),
    res: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M9 13h7M9 17h5"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>')
  };

  // Etapa J: el color de cada paso sale de tokens (clases tour-step__n--0…6), no de hex; el naranja anterior daba 4.47:1 con texto blanco
  const STEP_COLORS = [0, 1, 2, 3, 4, 5, 6];
  const entry = (id) => (FP.help && FP.help.entry ? FP.help.entry(id) : null) || {};
  const badge = (kind, label, lg) => `<span class="ds-badge ds-badge--${kind} ${lg ? 'ds-badge--lg' : ''}">${esc(label)}</span>`;
  const chain = (items) => `<div class="chain">${items.map(([k, l], i) => `${i ? '<span class="chain__arrow" aria-hidden="true">→</span>' : ''}${badge(k, l, true)}`).join('')}</div>`;
  const li = (a) => `<li>${esc(t(a))}</li>`;

  /* Cadena de evidencia: mismas etiquetas y significados que el glosario */
  const EVIDENCE = [['fact', 'Hecho', 'hecho'], ['driver', 'Driver', 'driver'], ['signal', 'Señal', 'senal'], ['hyp', 'Hipótesis', 'hipotesis']];

  /** Acordeón de tutorial: número, título, resumen visible y contenido desplegable. */
  const tutorial = (n, title, sub, body, open) => `<details class="ds-accordion" ${open ? 'open' : ''}>
    <summary><span class="ds-accordion__n">${String(n).padStart(2, '0')}</span>
      <span><h4 class="ds-accordion__t">${esc(title)}</h4><p class="ds-accordion__d">${esc(sub)}</p></span>${CHEV}</summary>
    <div class="ds-accordion__body">${body}</div></details>`;

  /** «Aprender más»: metodología, supuestos, ejemplo y límites (del explicador existente). */
  function learnMore(view) {
    const L = G().EXPLAINERS[view] && G().EXPLAINERS[view].learn;
    if (!L) return '';
    const row = (k, v) => (v ? `<div><dt><strong>${k}</strong></dt><dd>${v}</dd></div>` : '');
    return `<details class="ds-accordion ds-accordion--plain"><summary><span>Aprender más: metodología, supuestos, ejemplo y límites</span>${CHEV}</summary>
      <div class="ds-accordion__body"><dl class="def-list">
        ${row('Metodología', esc(t(L.method)))}
        ${(L.assumptions || []).length ? row('Supuestos', `<ul class="plain-list">${L.assumptions.map(li).join('')}</ul>`) : ''}
        ${row('Ejemplo', esc(t(L.example || '')))}
        ${row('Límites', esc(t(L.limits || '')))}
      </dl></div></details>`;
  }

  /* ---------- Tutoriales (contenido existente, reorganizado) ---------- */

  function t1() {
    const defs = EVIDENCE.map(([k, l, id]) => `<div><dt>${badge(k, l)}</dt><dd>${esc(t(entry(id).shortDescription || ''))}</dd></div>`).join('');
    return `<div class="lesson-body">
        <div><h4>Puntos clave</h4><ol>${G().READ_DIAGNOSIS.map(li).join('')}</ol></div>
        <div>${chain([['fact', 'Brecha'], ['driver', 'Driver'], ['signal', 'Señal'], ['hyp', 'Hipótesis']])}
          <dl class="def-list">${defs}</dl></div>
      </div>${learnMore('diagnostico')}`;
  }

  function t2() {
    const map = { plan: 'plan', actual: 'actual', forecast: 'forecast', reforecast: 'reforecast', scenario: 'escenario', observed: 'impactoObservado' };
    const rows = Object.keys(G().STATES).map((k) => {
      const e = entry(map[k]);
      return `<div class="ds-card ds-card--soft ds-card--flat" style="padding:16px">
        <div>${badge(k, G().STATES[k].label, true)}</div>
        <dl class="def-list">
          <div><dt><strong>Qué es</strong></dt><dd>${esc(t(G().STATES[k].short))}</dd></div>
          ${e.detailedDescription ? `<div><dt><strong>Qué representa</strong></dt><dd>${esc(t(e.detailedDescription))}</dd></div>` : ''}
          ${e.howToRead ? `<div><dt><strong>Cuándo se usa</strong></dt><dd>${esc(t(e.howToRead))}</dd></div>` : ''}
          ${e.caveats ? `<div><dt><strong>Qué NO significa</strong></dt><dd>${esc(t(e.caveats))}</dd></div>` : ''}
        </dl></div>`;
    });
    return `<div class="ds-stack" style="gap:12px">${rows.join('')}</div>`;
  }

  function t3() {
    const L = G().EXPLAINERS.diagnostico.learn;
    return `<p class="formula">Venta = Volumen × CR × AOV</p>
      ${chain([['plan', 'Atribución'], ['actual', 'Segmentos'], ['signal', 'Señales'], ['hyp', 'Hipótesis'], ['observed', 'Investigación']])}
      <p>${esc(t(L.method))}</p>${learnMore('diagnostico')}`;
  }

  function t4() {
    const L = G().EXPLAINERS.diagnostico.learn;
    const items = EVIDENCE.map(([k, l, id]) => {
      const e = entry(id);
      return `<div class="ds-card ds-card--soft ds-card--flat" style="padding:14px 16px">${badge(k, l, true)}
        <p style="margin:8px 0 0">${esc(t(e.shortDescription || ''))}</p>
        ${e.caveats ? `<p class="ds-card__sub"><strong>No significa:</strong> ${esc(t(e.caveats))}</p>` : ''}</div>`;
    });
    return `<div class="ds-stack" style="gap:8px">${items.join('<div class="chain__arrow" style="text-align:center" aria-hidden="true">↓</div>')}</div>
      <div class="ds-alert ds-alert--info" role="note">${ICON.info.replace('<svg', '<svg width="18" height="18" style="flex:none"')}<span>${esc(t(L.limits))}</span></div>`;
  }

  function t5() {
    const steps = ['Dimensionar', 'Atribuir', 'Profundizar', 'Investigar', 'Simular', 'Actuar', 'Medir'];
    const views = ['pacing', 'diagnostico', 'producto', 'diagnostico', 'recovery', 'recovery', 'medir'];
    return `<ol class="tour-card__steps" style="padding:0;background:none">${steps.map((s, i) => `<li class="tour-step">
      <a href="#${views[i]}"><span class="tour-step__t"><span class="tour-step__n tour-step__n--${STEP_COLORS[i]}">${i + 1}</span>${s}</span>
      <span class="tour-step__d">${esc(t((G().VIEWS[views[i]] || {}).title || ''))}</span></a></li>`).join('')}</ol>`;
  }

  /* ---------- Referencia (solo contenido que ya existe) ---------- */

  const REFS = {
    metodologicos: () => `<ol class="plain-list" style="padding-left:20px">${G().METHODOLOGY.map((m) => `<li><strong>${esc(m.label)}:</strong> ${esc(t(m.question))}</li>`).join('')}</ol>`,
    ejemplos: () => `<div class="ds-stack" style="gap:8px">${['pacing', 'reforecast', 'diagnostico', 'recovery'].map((v) => {
      const L = G().EXPLAINERS[v] && G().EXPLAINERS[v].learn;
      return L && L.example ? `<div class="ds-card ds-card--soft ds-card--flat" style="padding:12px 16px"><strong>${esc(G().EXPLAINERS[v].title)}</strong><p class="ds-card__sub">${esc(t(L.example))}</p></div>` : '';
    }).join('')}</div>`,
    ayuda: () => `<ul class="plain-list"><li><strong>¿Qué significa?</strong> Botón «?» junto a un concepto.</li><li><strong>¿Por qué este número?</strong> Explica la cifra con la corrida real.</li>
      <li><strong>¿Qué hago aquí?</strong> y <strong>¿qué hago ahora?</strong> Aparecen en la barra de contexto de cada sección.</li></ul>`,
    faq: () => `<div class="ds-stack" style="gap:8px">${[
      ['¿Cuál es la diferencia entre Forecast y Reforecast?', `${entry('forecast').caveats} ${entry('reforecast').caveats}`],
      ['¿Qué diferencia hay entre Driver y Señal?', G().EXPLAINERS.diagnostico.learn.limits],
      ['¿Por qué una hipótesis no es una causa?', `${entry('hipotesis').shortDescription} ${entry('hipotesis').caveats}`]
    ].map(([q, a]) => `<details class="ds-accordion ds-accordion--plain"><summary><span>${esc(q)}</span>${CHEV}</summary><div class="ds-accordion__body">${esc(t(a))}</div></details>`).join('')}</div>`
  };

  function refCard(icon, title, desc, attrs, disabled) {
    return `<button type="button" class="ref-card" ${attrs || ''} ${disabled ? 'disabled' : ''}><span class="ref-card__icon">${icon}</span>
      <span><span class="ref-card__t">${title}</span><span class="ref-card__d">${desc}</span></span>
      ${disabled ? badge('plan', 'Próximamente') : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'}</button>`;
  }

  function render(state) {
    const tour = state.ux.tour;
    $('help-view').innerHTML = `<div class="learn">
      <div>
        <nav aria-label="Ruta" class="breadcrumbs"><ol><li><a href="#inicio">Inicio</a></li><li><span aria-current="location">¿Cómo funciona?</span></li></ol></nav>
        <h2 class="ds-page-title">¿Cómo funciona RevNavigator?</h2>
        <p class="ds-lede">RevNavigator te ayuda a planear, comparar, proyectar, diagnosticar, recuperar y medir el desempeño de ventas. Calcula con fórmulas determinísticas; la IA (Cohere) es opcional, solo redacta y nunca calcula ni navega.</p>
      </div>

      <section class="ds-card tour-card" aria-labelledby="l-tour">
        <div class="tour-card__intro"><span class="learn__icon">${ICON.compass}</span>
          <div><h3 class="ds-section-title" id="l-tour">Recorrido guiado</h3>
            <p class="ds-card__sub">Aprende a recorrer la herramienta y conoce qué hacer en cada etapa.</p></div>
          <button type="button" class="btn btn--primary btn--lg" data-action="tour-start">${tour.step ? `Retomar recorrido (paso ${tour.step + 1})` : 'Iniciar recorrido guiado'}</button>
          ${tour.step ? '<button type="button" class="btn btn--lg" data-action="tour-restart">Empezar desde el paso 1</button>' : ''}
        </div>
        <ol class="tour-card__steps">${G().HOW_IT_WORKS.map(([tt, d, v], i) => `<li class="tour-step"><a href="#${v}">
          <span class="tour-step__t"><span class="tour-step__n tour-step__n--${STEP_COLORS[i]}">${i + 1}</span>${esc(tt)}</span><span class="tour-step__d">${esc(t(d))}</span></a></li>`).join('')}</ol>
      </section>

      <section class="ds-card" aria-labelledby="l-basic">
        <div class="learn__head"><span class="learn__icon">${ICON.book}</span>
          <div><h3 class="ds-section-title" id="l-basic">Aprendizaje básico</h3>
            <p class="ds-card__sub">Aprende los conceptos fundamentales para interpretar y utilizar RevNavigator correctamente.</p></div></div>
        ${tutorial(1, 'Cómo leer un diagnóstico', 'Aprende a interpretar la brecha, los drivers, señales e hipótesis.', t1(), true)}
        ${tutorial(2, 'Plan, Actual, Forecast, Reforecast, Scenario y Observed', 'Conoce qué significa cada estado y cuándo utilizarlo.', t2())}
        ${tutorial(3, 'Cómo funciona el diagnóstico', 'Entiende la lógica de análisis y atribución.', t3())}
        ${tutorial(4, 'Hecho, Driver, Señal e Hipótesis', 'Aprende a diferenciar cada concepto y su propósito.', t4())}
        ${tutorial(5, 'Cómo interpretar una brecha', 'Sigue el camino de dimensionar a medir.', t5())}
      </section>

      <section class="ds-card" aria-labelledby="l-ref">
        <div class="learn__head"><span class="learn__icon">${ICON.help}</span>
          <div><h3 class="ds-section-title" id="l-ref">Conceptos y referencia</h3>
            <p class="ds-card__sub">Consulta definiciones, ejemplos y más información cuando lo necesites.</p></div></div>
        <div class="ref-grid">
          ${refCard(ICON.glossary, 'Glosario', '¿Qué significa este término?', 'data-action="glossary"')}
          ${refCard(ICON.help, 'Ayuda contextual', 'Explicaciones dentro de cada módulo.', 'data-ref="ayuda" aria-expanded="false"')}
          ${refCard(ICON.method, 'Conceptos metodológicos', 'Principios y lógica del análisis.', 'data-ref="metodologicos" aria-expanded="false"')}
          ${refCard(ICON.faq, 'Preguntas frecuentes', 'Resuelve dudas comunes.', 'data-ref="faq" aria-expanded="false"')}
          ${refCard(ICON.example, 'Ejemplos prácticos', 'Casos ilustrativos.', 'data-ref="ejemplos" aria-expanded="false"')}
          ${refCard(ICON.res, 'Recursos adicionales', 'Se habilitará conforme se incorporen nuevos materiales.', '', true)}
        </div>
        <div class="ref-detail" id="ref-detail" aria-live="polite"></div>
      </section>
    </div>`;

    const box = $('help-view');
    if (!box._refBound) {
      box._refBound = true;
      box.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ref]');
        if (!b) return;
        const open = b.getAttribute('aria-expanded') === 'true';
        box.querySelectorAll('[data-ref]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        $('ref-detail').innerHTML = open ? '' : `<div class="ds-card ds-card--soft ds-card--flat">${REFS[b.dataset.ref]()}</div>`;
        if (!open) b.setAttribute('aria-expanded', 'true');
      });
    }
  }

  FP.helpView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
