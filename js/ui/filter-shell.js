/**
 * filter-shell.js — Contenedor único de filtros para todas las pantallas (escritorio y móvil).
 *  - Fila principal: lo básico siempre a la vista.
 *  - Barra «Filtros · N» con chips de lo activo (cada chip se quita con ✕) y «Quitar todo».
 *  - Panel con el resto, agrupado. En móvil se abre como hoja inferior con «Ver resultados».
 * Solo organiza HTML: los controles conservan sus ids y data-action originales.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /**
   * @param {{page:string, primary:string, groups:{title:string,html:string}[], chips:{text:string,key:string}[], open:boolean}} o
   */
  function html(o) {
    const n = o.chips.length, id = `fs-${o.page}`, open = Boolean(o.open);
    const chips = o.chips.map((c) => `<button type="button" class="chip fshell__chip" data-action="fs-chip" data-fs-page="${esc(o.page)}" data-fs-key="${esc(c.key)}" aria-label="Quitar ${esc(c.text)}">${esc(c.text)} <span aria-hidden="true">✕</span></button>`).join('');
    const groups = o.groups.filter((g) => g.html && g.html.trim()).map((g) => `<section class="fshell__group"><h4 class="fshell__title">${esc(g.title)}</h4><div class="settings-grid">${g.html}</div></section>`).join('');
    return `<div class="fshell" data-fshell="${esc(o.page)}"${open ? ' data-open="1"' : ''}>
      ${o.primary ? `<div class="fshell__primary settings-grid">${o.primary}</div>` : ''}
      <div class="fshell__bar">
        <button type="button" class="btn btn--small fshell__toggle" data-action="fs-toggle" data-fs-page="${esc(o.page)}" aria-expanded="${open}" aria-controls="${id}">⚙ Filtros${n ? ` · ${n}` : ''}</button>
        ${chips}${n ? `<button type="button" class="btn btn--ghost btn--small" data-action="fs-clear" data-fs-page="${esc(o.page)}">Quitar todo</button>` : ''}
      </div>
      <button type="button" class="fshell__backdrop" data-action="fs-toggle" data-fs-page="${esc(o.page)}" aria-label="Cerrar filtros" tabindex="-1"></button>
      <div class="fshell__panel" id="${id}" ${open ? '' : 'hidden'}>
        <div class="fshell__head"><b>Filtros</b><button type="button" class="btn btn--ghost btn--small" data-action="fs-toggle" data-fs-page="${esc(o.page)}">Cerrar</button></div>
        ${groups}
        <div class="fshell__foot"><button type="button" class="btn btn--ghost" data-action="fs-clear" data-fs-page="${esc(o.page)}">Quitar todo</button><button type="button" class="btn btn--primary" data-action="fs-toggle" data-fs-page="${esc(o.page)}">Ver resultados</button></div>
      </div></div>`;
  }
  FP.filterShell = { html };
})(typeof window !== 'undefined' ? window : globalThis);
