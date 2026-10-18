/* Tablas en tarjetas (móvil). Marca las tablas angostas en filas y con pocas filas como «tarjetas» y copia el título de cada
 * columna a cada celda (data-label); el CSS (≤ 860 px) hace el resto. No cambia datos ni cálculos y en escritorio no tiene efecto.
 * Quedan como tabla con desplazamiento: las matrices (mapas de calor), las que tienen muchas filas (p. ej. Datos normalizados)
 * y las marcadas con data-no-cards. */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const MAX_ROWS = 24, MIN_COLS = 3;

  function labelOf(th) {
    const c = th.cloneNode(true);
    c.querySelectorAll('.help-dot, .why-link, button, svg, .visually-hidden').forEach((e) => e.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  function apply(table) {
    if (table.dataset.cards === 'done') return;
    const head = table.tHead && table.tHead.rows[0];
    const body = table.tBodies[0];
    const ok = head && body && head.cells.length >= MIN_COLS && body.rows.length > 0 && body.rows.length <= MAX_ROWS &&
      !table.classList.contains('table--matrix') && !table.hasAttribute('data-no-cards') &&
      !table.querySelector('[colspan],[rowspan]');
    if (!ok) return;
    const labels = [...head.cells].map(labelOf);
    [...(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])].forEach((sec) => {
      [...sec.rows].forEach((tr) => {
        if (tr.cells.length !== labels.length) return;
        [...tr.cells].forEach((td, i) => { if (i > 0 && labels[i]) td.setAttribute('data-label', labels[i]); });
      });
    });
    // el CSS convierte la tabla en bloques: se conserva su significado para lectores de pantalla
    table.setAttribute('role', 'table');
    [...table.querySelectorAll('thead, tbody, tfoot')].forEach((e) => e.setAttribute('role', 'rowgroup'));
    [...table.querySelectorAll('tr')].forEach((e) => e.setAttribute('role', 'row'));
    [...table.querySelectorAll('th')].forEach((e) => e.setAttribute('role', e.closest('thead') ? 'columnheader' : 'rowheader'));
    [...table.querySelectorAll('td')].forEach((e) => e.setAttribute('role', 'cell'));
    table.classList.add('table--cards');
    table.dataset.cards = 'done';
  }

  function scan(scope) { (scope || document).querySelectorAll('table.ds-table, table.table').forEach(apply); }

  let pending = false;
  function schedule() { if (pending) return; pending = true; (root.requestAnimationFrame || setTimeout)(() => { pending = false; scan(); }); }

  function init() {
    scan();
    if (root.MutationObserver) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  FP.responsiveTables = { scan, apply };
})(typeof window !== 'undefined' ? window : globalThis);
