/**
 * package-view.js — Fase 10 · Paquete de análisis.
 * Lista los 7 exports con su estado (con datos / viajaría vacío y qué falta) y descarga el .zip. No calcula nada propio:
 * el estado sale de los mismos constructores que usan los botones «Exportar …» de cada vista.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  let busy = false;

  function setBusy(v) {
    busy = v;
    const b = document.querySelector('[data-action="pkg-download"]');
    if (b) { b.disabled = v; b.setAttribute('aria-busy', String(v)); }
    const s = document.getElementById('pkg-status');
    if (s) s.innerHTML = v ? '<p class="ds-loading" role="status">Generando el paquete…</p>' : '';
  }

  function render(state, preview) {
    const esc = H().esc;
    const defs = FP.analysisPackage.EXPORTS;
    const ok = defs.filter((d) => preview[d.key] && preview[d.key].ok).length;
    const run = state.fc.run;
    const last = state.pkg && state.pkg.last;
    $('package-view').innerHTML = `
      <section class="panel" aria-labelledby="t-pkg">
        <div class="panel__head"><div>
          <h2 class="panel__title" id="t-pkg">Paquete de análisis</h2>
          <p class="panel__desc">Un solo archivo .zip con los 7 exports que la herramienta ya calcula y un índice. No calcula nada nuevo: cada archivo es el mismo que se descarga desde su vista.</p>
        </div></div>
        <div class="panel__body stack">
          <p>${H().pill(ok === defs.length ? 'ok' : ok ? 'warning' : 'na', `${ok} de ${defs.length} exports con datos`)}
            Fecha de corte: <strong>${esc((run && run.cutoff) || '—')}</strong> · Año: <strong>${esc(state.year)}</strong></p>
          <div>
            <h3 class="panel__title">Periodo y canal</h3>
            <p class="field__hint">Cambian la misma selección de Diagnóstico, Recovery Center, Narrativa y Categoría → Producto. Pacing, Reforecast y Plan son del año completo. La comparación y los demás ajustes se cambian en cada vista.</p>
            ${FP.narrativeView.contextControls(state, 'pkg', 'pkg-context', 'pkg-context')}
          </div>
          <div class="btn-row"><button type="button" class="btn btn--primary" data-action="pkg-download" ${busy ? 'disabled aria-busy="true"' : ''}>Descargar paquete (.zip)</button></div>
          <div id="pkg-status" aria-live="polite"></div>
          ${last ? `<p class="field__hint">Último paquete generado: ${esc(last.at)}.</p>` : ''}
          <p class="field__hint">Siempre trae los 7 archivos: el que no tiene datos viaja vacío, con el aviso de qué falta. No incluye la API key de Cohere, las preferencias de la herramienta ni los datos de Negocio (la narrativa viaja sin el contexto del negocio).</p>
        </div>
      </section>

      <section class="panel" aria-labelledby="t-pkg-files">
        <div class="panel__head"><div>
          <h3 class="panel__title" id="t-pkg-files">Qué incluye</h3>
          <p class="panel__desc">Cada export usa la configuración actual de su vista. Periodo y canal se cambian arriba; la comparación y los demás ajustes, en cada vista antes de generar el paquete.</p>
        </div></div>
        <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table">
          <thead><tr><th scope="col">Export</th><th scope="col">Estado</th><th scope="col">Detalle</th><th scope="col">Vista</th></tr></thead>
          <tbody>${defs.map((d) => { const p = preview[d.key] || { ok: false, reason: '—' };
            return `<tr><th scope="row">${esc(d.label)}</th>
              <td>${p.ok ? H().pill('ok', 'Con datos') : H().pill('warning', 'Viaja vacío')}</td>
              <td class="wrap">${p.ok ? esc(p.note || p.file || '') : `${esc(p.reason || '')}${p.missing && p.missing.length ? `<span class="cell-sub">Falta: ${esc(p.missing.join(', '))}</span>` : ''}`}</td>
              <td><a href="#${d.view}" data-nav="${d.view}">Ir</a></td></tr>`; }).join('')}</tbody>
        </table></div></div>
      </section>`;
  }

  FP.packageView = { render, setBusy };
})(typeof window !== 'undefined' ? window : globalThis);
