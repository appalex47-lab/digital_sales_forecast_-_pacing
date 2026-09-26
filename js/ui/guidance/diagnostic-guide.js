/**
 * diagnostic-guide.js — "¿Por qué está pasando?" (Fase 7).
 * Resumen orientado a preguntas sobre el diagnóstico ya calculado (Fase 5) y árbol visual
 * brecha → volumen / CR / AOV → dimensiones existentes → señales → hipótesis. Solo lee.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${F().currency(Math.abs(v), 0)}` : F().DASH);

  function render(state) {
    const el = $('dx-why');
    if (!el) return;
    const d = state.dx.run;
    if (!d || d.status !== 'ok') { el.innerHTML = ''; return; }
    const esc = H().esc;
    const gap = d.gap ? d.gap.abs : null;
    const below = fin(gap) && gap < 0;
    const cmp = d.comparison.label;
    const drivers = d.level1Drivers || [];
    const signals = (d.signals || []).filter((s) => s.relevance.priority === 'high').slice(0, 3);
    // El plan y el forecast no tienen desglose por segmento; esas señales caen a comparar contra el año
    // anterior (driverEngine.segmentDimensions ya lo decide y lo deja escrito en cada evidencia). Si el
    // periodo YA es una comparación contra el año anterior, no hace falta aclarar nada.
    const yoyFallback = !['actual_vs_previous', 'actual_vs_yoy'].includes(d.comparison.id) && signals.some((s) => s.reference === 'yoy');
    const hyps = d.hypotheses || [];
    const missing = d.availability ? d.availability.unavailable.map((x) => x.label) : [];
    const nextInv = hyps[0] && hyps[0].validationNeeded ? hyps[0].validationNeeded.slice(0, 2) : [];
    const dimsByDriver = {};
    (d.level2 || []).forEach((dim) => {
      const drv = (FP.config.diagnostics.dimensions[dim.dimension] || {}).drivers || ['trafficVolume', 'conversionRate', 'aov'];
      drv.forEach((k) => { (dimsByDriver[k] = dimsByDriver[k] || []).push(dim.label); });
    });
    el.innerHTML = `
      <div class="subhead"><h3 class="panel__title">¿Por qué estamos ${below ? 'debajo' : fin(gap) && gap > 0 ? 'arriba' : 'así'} de la referencia? <span class="cell-sub">${esc(cmp)}</span></h3></div>
      <ol class="why-steps">
        <li><span class="why-steps__n">1</span><div><strong>Brecha</strong> ${FP.help.helpButton('gap')}<span>${esc(d.result.fact)}</span></div></li>
        <li><span class="why-steps__n">2</span><div><strong>Drivers matemáticos</strong> ${FP.help.helpButton('driver')}
          <span>${esc(d.level1 ? d.level1.statement : '')}</span></div></li>
        <li><span class="why-steps__n">3</span><div><strong>Señales relacionadas</strong> ${FP.help.helpButton('senal')}
          ${yoyFallback ? '<span class="cell-sub">El plan y el forecast no tienen desglose por segmento: estas señales comparan contra el año anterior.</span>' : ''}
          <span>${signals.length ? signals.map((s) => esc(s.evidence)).join('<br>') : 'Sin señales de prioridad alta.'}</span></div></li>
        <li><span class="why-steps__n">4</span><div><strong>Hipótesis disponibles</strong> ${FP.help.helpButton('hipotesis')}
          <span>${hyps.length ? `${hyps.length} hipótesis; todas requieren investigación. La primera: ${esc(hyps[0].hypothesis)}` : 'Sin hipótesis: falta evidencia localizada.'}</span></div></li>
        <li><span class="why-steps__n">5</span><div><strong>Información faltante</strong>
          <span>${missing.length ? `No disponible en los datos actuales: ${esc(missing.slice(0, 8).join(', '))}${missing.length > 8 ? '…' : ''}.` : 'Todas las dimensiones configuradas tienen datos.'}</span></div></li>
        <li><span class="why-steps__n">6</span><div><strong>Siguiente investigación sugerida</strong>
          <span>${nextInv.length ? esc(nextInv.join('; ')) : 'Revisar las señales de mayor prioridad.'}</span></div></li>
      </ol>
      <div class="driver-tree" role="tree" aria-label="Árbol de drivers">
        <div class="driver-tree__root" role="treeitem">Brecha de ${esc(d.result.metricLabel.toLowerCase())} <strong class="num">${esc(money(gap))}</strong></div>
        <ul role="group">${drivers.map((x) => `<li role="treeitem" class="${d.level1 && d.level1.mainDriver === x.driver ? 'is-main' : ''}">
          <span class="driver-tree__node">${esc(x.label)} <span class="num">${esc(money(x.contribution))}</span>
            <span class="cell-sub">${esc(F().signedPercent(x.deltaPct, 1))}${d.level1 && d.level1.mainDriver === x.driver ? ' · mayor contribución matemática' : ''}</span></span>
          ${(dimsByDriver[x.driver] || []).length ? `<ul role="group"><li role="treeitem"><span class="cell-sub">Dimensiones con datos: ${esc([...new Set(dimsByDriver[x.driver])].join(', '))}</span></li></ul>` : ''}
        </li>`).join('')}</ul>
      </div>
      <p class="field__hint">Solo se muestran dimensiones que existen en los datos. Una contribución matemática no es una causa; las hipótesis requieren validación.</p>`;
  }

  FP.diagnosticGuide = { render };
})(typeof window !== 'undefined' ? window : globalThis);
