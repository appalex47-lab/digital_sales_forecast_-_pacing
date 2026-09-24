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

  function renderEntry(e) {
    const esc = H().esc;
    const row = (label, v) => (v ? `<div class="help-entry__row"><dt>${esc(label)}</dt><dd>${esc(v)}</dd></div>` : '');
    return `<article class="help-entry" id="help-${e.id}">
      <h3>${esc(e.title)} ${e.state ? stateTag(e.state) : ''}</h3>
      <p>${esc(e.shortDescription)}</p>
      <dl>
        ${row('Qué es', e.detailedDescription)}
        ${row('Cómo se calcula', e.formula)}
        ${row('Cómo leerla', e.howToRead)}
        ${row('Interpretación', e.interpretation)}
        ${row('Qué NO significa', e.caveats)}
        ${row('Siguiente paso', e.nextStep)}
      </dl>
    </article>`;
  }

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

  /** Explicador visible de la vista (flujo + puntos). Colapsado en modo ejecutivo. */
  function explainer(view, mode) {
    const x = G().EXPLAINERS[view];
    if (!x) return '';
    const esc = H().esc;
    return `<details class="explainer" ${mode === 'exec' ? '' : 'open'}><summary>${esc(x.title)}</summary>
      <ol class="flow-chips">${x.flow.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>
      <ul class="plain-list">${x.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>`;
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
        <button type="button" class="btn btn--primary btn--small" data-action="go" data-view="${pending[0].view}">Ir a ${esc(G().VIEWS[pending[0].view].title)}</button></div>`);
    });
  }

  FP.help = { entry, stateTag, helpButton, renderEntry, open, openGlossary, filterGlossary, glossaryHtml, close, decorate, explainer, enhanceEmpty };
})(typeof window !== 'undefined' ? window : globalThis);
