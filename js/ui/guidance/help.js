/**
 * help.js — Sistema de ayuda reutilizable (Fase 7).
 * Un solo componente para: ícono de ayuda, panel lateral (drawer), glosario con búsqueda,
 * etiquetas de estado (Plan/Actual/Forecast/Reforecast/Escenario/Observado), explicadores por
 * vista y estados vacíos con requisitos y destino. Contenidos en FP.guidanceConfig.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const G = () => FP.guidanceConfig;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  let lastFocus = null;

  const entry = (id) => G().HELP.find((e) => e.id === id) || null;

  /** Etiqueta de estado con su definición como tooltip (texto, no solo color). */
  function stateTag(kind) {
    const s = G().STATES[kind];
    if (!s) return '';
    return `<span class="state-tag state-tag--${kind}" title="${H().esc(s.short)}">${H().esc(s.label)}</span>`;
  }

  /** Botón de ayuda para una entrada. */
  function helpButton(id, label = null) {
    const e = entry(id);
    if (!e) return '';
    return `<button type="button" class="help-dot" data-action="help" data-id="${id}" aria-label="${H().esc(`Qué es ${label || e.title}`)}" title="${H().esc(e.shortDescription)}">?</button>`;
  }

  /** Terminología del negocio (Fase 8.2) aplicada a los textos de ayuda. */
  const t = (v) => (FP.explain ? FP.explain.term(v) : v);

  /**
   * Entrada de ayuda con las preguntas pedagógicas de Fase 9.1 (solo se muestran las que tienen contenido).
   * Mismo objeto HELP de Fase 7: no hay un segundo sistema de ayuda.
   */
  function renderEntry(e) {
    const esc = H().esc;
    const row = (label, v) => (v ? `<div class="help-entry__row"><dt>${esc(label)}</dt><dd>${esc(t(v))}</dd></div>` : '');
    const related = (e.related || []).map(entry).filter(Boolean);
    return `<article class="help-entry" id="help-${e.id}">
      <h3>${esc(t(e.title))} ${e.state ? stateTag(e.state) : ''}</h3>
      <p>${esc(t(e.shortDescription))}</p>
      <dl>
        ${row('¿Para qué sirve?', e.purpose)}
        ${row('¿Cómo funciona?', e.detailedDescription)}
        ${row('¿Cómo se calcula?', e.formula)}
        ${row('¿Cómo leerlo?', e.howToRead)}
        ${row('¿Qué significa?', e.interpretation)}
        ${row('¿Cuándo usarlo?', e.whenToUse)}
        ${row('¿Qué NO significa?', e.caveats)}
        ${row('¿Qué decisión ayuda a tomar?', e.decision)}
        ${row('Siguiente paso', e.nextStep)}
      </dl>
      ${related.length ? `<p class="help-entry__related">Relacionado: ${related.map((r) => `<button type="button" class="btn btn--small btn--ghost" data-action="help" data-id="${r.id}">${esc(t(r.title))}</button>`).join(' ')}</p>` : ''}
    </article>`;
  }

  /** Abre el panel lateral con cualquier contenido (lo usan ayuda, glosario y "¿Por qué?"). */
  function openDrawer(title, bodyHtml) {
    const d = $('help-drawer');
    lastFocus = document.activeElement;
    $('help-drawer-title').textContent = title;
    $('help-drawer-body').innerHTML = bodyHtml;
    d.hidden = false;
    const btn = d.querySelector('[data-action="help-close"]');
    if (btn) btn.focus();
  }

  function close() {
    const d = $('help-drawer');
    if (!d || d.hidden) return;
    d.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /** Ayuda de una entrada o de una lista de entradas (ayuda de la sección). */
  function open(ids, title = null) {
    const list = (Array.isArray(ids) ? ids : [ids]).map(entry).filter(Boolean);
    if (!list.length) return;
    openDrawer(title || list[0].title, list.map(renderEntry).join(''));
  }

  function glossaryHtml(filter = '') {
    const f = filter.trim().toLowerCase();
    const list = G().HELP.filter((e) => e.glossary).filter((e) => !f || `${e.title} ${e.shortDescription}`.toLowerCase().includes(f));
    return `<div class="glossary">${list.map((e) => `<div class="glossary__item"><dt>${H().esc(e.title)} ${e.state ? stateTag(e.state) : ''}</dt>
      <dd>${H().esc(e.shortDescription)}${e.formula ? ` <span class="cell-sub">${H().esc(e.formula)}</span>` : ''}
        <button type="button" class="btn btn--small btn--ghost" data-action="help" data-id="${e.id}">Más</button></dd></div>`).join('') || '<p class="note">Sin coincidencias.</p>'}</div>`;
  }

  function openGlossary() {
    openDrawer('Glosario', `<div class="field"><label for="glossary-q" class="field__hint">Buscar</label>
      <input id="glossary-q" type="search" data-action="glossary-search" autocomplete="off"></div><div id="glossary-list">${glossaryHtml()}</div>`);
  }

  function filterGlossary(q) { const el = $('glossary-list'); if (el) el.innerHTML = glossaryHtml(q); }

  /** Agrega íconos de ayuda a etiquetas que nombran métricas o conceptos (sin tocar la lógica de la vista). */
  function decorate(container) {
    if (!container) return;
    container.querySelectorAll('dt, th, h3.panel__title, h4').forEach((el) => {
      if (el.dataset.helped || el.closest('#help-drawer') || el.querySelector('.help-dot')) return;
      const text = (el.textContent || '').trim().slice(0, 60);
      const hit = G().TRIGGERS.find(([re]) => re.test(text));
      el.dataset.helped = '1';
      if (hit) el.insertAdjacentHTML('beforeend', ` ${helpButton(hit[1])}`);
    });
  }

  /**
   * Explicador de la vista con divulgación progresiva (Fase 9.1):
   *   nivel 1 (título, siempre visible) → nivel 2 (flujo y puntos, "¿cómo funciona?") → nivel 3 ("Aprender": método,
   *   supuestos, ejemplo ilustrativo, límites y conceptos relacionados; siempre a pedido para no sobrecargar).
   *   Ejecutivo: explicador cerrado; Analista y Aprendiz: nivel 2 abierto.
   */
  function explainer(view, mode) {
    const x = G().EXPLAINERS[view];
    if (!x) return '';
    const esc = H().esc;
    const L = x.learn;
    const learn = L ? `<details class="explainer__learn"><summary>Aprender más: metodología, supuestos, ejemplo y límites</summary>
      <dl class="help-entry">
        <div class="help-entry__row"><dt>¿Cómo funciona?</dt><dd>${esc(t(L.method))}</dd></div>
        ${L.assumptions && L.assumptions.length ? `<div class="help-entry__row"><dt>Supuestos</dt><dd><ul class="plain-list">${L.assumptions.map((a) => `<li>${esc(t(a))}</li>`).join('')}</ul></dd></div>` : ''}
        ${L.example ? `<div class="help-entry__row"><dt>Ejemplo</dt><dd>${esc(t(L.example))}</dd></div>` : ''}
        ${L.limits ? `<div class="help-entry__row"><dt>¿Qué NO significa?</dt><dd>${esc(t(L.limits))}</dd></div>` : ''}
      </dl>
      ${(L.related || []).length ? `<p class="help-entry__related">Conceptos: ${L.related.map(entry).filter(Boolean).map((r) => `<button type="button" class="btn btn--small btn--ghost" data-action="help" data-id="${r.id}">${esc(t(r.title))}</button>`).join(' ')}</p>` : ''}
    </details>` : '';
    return `<details class="explainer" ${mode === 'exec' ? '' : 'open'}><summary>${esc(x.title)}</summary>
      <ol class="flow-chips">${x.flow.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>
      <ul class="plain-list">${x.points.map((p) => `<li>${esc(t(p))}</li>`).join('')}</ul>${learn}</details>`;
  }

  /**
   * Modo Aprendiz (Fase 9.1): dónde está la vista dentro de la metodología, qué pregunta responde y qué hacer
   * ahora. "Qué hacer ahora" es el mismo siguiente paso determinista de Fase 7 (contextEngine), no otro.
   */
  function learningBar(view, next) {
    const G_ = G();
    const esc = H().esc;
    const stepId = G_.VIEW_STEP[view];
    const idx = G_.METHODOLOGY.findIndex((m) => m.id === stepId);
    if (idx < 0) return '';
    const cur = G_.METHODOLOGY[idx];
    const h = cur.help ? entry(cur.help) : null;
    return `<section class="learning-bar" aria-label="Aprender en esta vista">
      <ol class="learning-bar__path">${G_.METHODOLOGY.map((m, i) => `<li class="${i === idx ? 'is-here' : i < idx ? 'is-before' : ''}${m.upcoming ? ' is-upcoming' : ''}"
        title="${esc(m.question)}${m.upcoming ? ' (fase futura)' : ''}">${esc(m.label)}</li>`).join('')}</ol>
      <div class="learning-bar__body">
        <p><strong>Estás en: ${esc(cur.label)}.</strong> ${esc(cur.question)} ${h ? esc(t(h.shortDescription)) : ''}</p>
        ${h && h.purpose ? `<p><span class="learning-bar__q">¿Para qué sirve?</span> ${esc(t(h.purpose))}</p>` : ''}
        ${h && h.decision ? `<p><span class="learning-bar__q">¿Qué decisión ayuda a tomar?</span> ${esc(t(h.decision))}</p>` : ''}
        ${next ? `<p><span class="learning-bar__q">¿Qué hago ahora?</span> ${esc(next.label)}: ${esc(next.reason)}</p>` : ''}
        ${h ? `<button type="button" class="btn btn--small" data-action="help" data-id="${h.id}">¿Cómo funciona?</button>` : ''}
      </div></section>`;
  }

  /** Microlearning (Fase 9.1): una idea breve, descartable, que no se repite. */
  function lessonCard(id) {
    const l = G().LESSONS.find((x) => x.id === id);
    if (!l) return '';
    const esc = H().esc;
    return `<aside class="lesson" role="status"><span aria-hidden="true">🧠</span>
      <p><strong>Lo que acabas de aprender:</strong> ${esc(t(l.text))}</p>
      <div class="btn-row">${l.help ? `<button type="button" class="btn btn--small btn--ghost" data-action="help" data-id="${l.help}">Ver más</button>` : ''}
        <button type="button" class="btn btn--small btn--ghost" data-action="lesson-dismiss" aria-label="Cerrar">Entendido</button></div></aside>`;
  }

  /** Completa estados vacíos con requisitos y botón al módulo correspondiente. */
  function enhanceEmpty(container, reqs) {
    if (!container || !reqs || !reqs.length) return;
    container.querySelectorAll('.empty').forEach((el) => {
      if (el.querySelector('.empty__next')) return;
      const esc = H().esc;
      const pending = reqs.filter((r) => !r.done);
      if (!pending.length) return;
      el.insertAdjacentHTML('beforeend', `<div class="empty__next"><p>Para usar esta vista necesitas:</p>
        <ol>${reqs.map((r) => `<li class="${r.done ? 'is-done' : ''}">${r.done ? '✓ ' : ''}${esc(r.label)}</li>`).join('')}</ol>
        ${G().VIEWS[pending[0].view] && G().VIEWS[pending[0].view].purpose ? `<p class="field__hint">Por qué: ${esc(G().VIEWS[pending[0].view].title)} sirve para ${esc(lowerFirst(G().VIEWS[pending[0].view].purpose))}</p>` : ''}
        <button type="button" class="btn btn--primary btn--small" data-action="go" data-view="${pending[0].view}">Ir a ${esc(G().VIEWS[pending[0].view].title)}</button></div>`);
    });
  }

  const lowerFirst = (x) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);

  FP.help = { entry, stateTag, helpButton, renderEntry, open, openPanel: openDrawer, openGlossary, filterGlossary, glossaryHtml, close, decorate, explainer,
    enhanceEmpty, learningBar, lessonCard };
})(typeof window !== 'undefined' ? window : globalThis);
