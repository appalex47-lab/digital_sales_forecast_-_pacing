/**
 * business-view.js — Business Setup (Fase 8.2). "¿Qué tipo de negocio estoy analizando y cómo funciona?"
 * Solo pinta el borrador (state.bc.draft) y el contexto activo (FP.config.business). No calcula nada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const BC = () => FP.businessContext;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => H().esc(v);

  const GEO_PRESETS = ['País → Región → Estado → Ciudad → Sucursal', 'Estado → Sucursal', 'Región → Ciudad → Tienda', 'Región → Cuenta'];
  const CAT_PRESETS = ['Categoría → Subcategoría → Producto → SKU', 'Categoría → Producto', 'Línea de negocio → Servicio → Plan'];
  const levelsText = (l) => (l || []).join(' → ');

  function input(path, value, { label, hint = '', placeholder = '', type = 'text', wide = false, level = '' } = {}) {
    const id = `bc-${path.replace(/\./g, '-')}`;
    const tag = level === 'required' ? ' <span class="chip">Obligatorio</span>' : level === 'recommended' ? ' <span class="chip chip--soft">Recomendado</span>' : '';
    return `<div class="field${wide ? ' field--wide' : ''}"><label for="${id}">${esc(label)}${tag}</label>
      ${type === 'textarea' ? `<textarea id="${id}" rows="3" data-action="bc-field" data-path="${path}" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>`
        : `<input id="${id}" type="${type}" value="${esc(value ?? '')}" data-action="bc-field" data-path="${path}" placeholder="${esc(placeholder)}">`}
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`;
  }

  function checks(path, selected, options, legend, level = '') {
    const tag = level === 'recommended' ? ' <span class="chip chip--soft">Recomendado</span>' : '';
    return `<fieldset class="field field--wide bc-checks"><legend>${esc(legend)}${tag}</legend><div class="bc-checks__list">
      ${options.map(([k, l]) => `<label class="bc-check"><input type="checkbox" data-action="bc-toggle" data-path="${path}" value="${k}" ${selected.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
    </div></fieldset>`;
  }

  function structure(key, obj, presets, what) {
    return `<fieldset class="field field--wide"><legend>¿${esc(what)} es relevante para el negocio? <span class="chip chip--soft">Recomendado</span></legend>
      <div class="btn-row" role="radiogroup">
        ${[['true', 'Sí'], ['false', 'No'], ['', 'Sin definir']].map(([v, l]) => `<label class="bc-check"><input type="radio" name="bc-${key}-rel" data-action="bc-field" data-path="${key}.relevant" value="${v}"
          ${String(obj.relevant ?? '') === v ? 'checked' : ''}> ${l}</label>`).join('')}
      </div></fieldset>
      ${obj.relevant === false ? '' : `
      <div class="field field--wide"><label for="bc-${key}-levels">Niveles (de mayor a menor, separados por →)</label>
        <input id="bc-${key}-levels" type="text" value="${esc(levelsText(obj.levels))}" data-action="bc-levels" data-path="${key}.levels" placeholder="${esc(presets[0])}">
        <span class="field__hint">Ejemplos: ${presets.map((p) => `<button type="button" class="btn btn--ghost btn--small" data-action="bc-preset" data-path="${key}.levels" data-value="${esc(p)}">${esc(p)}</button>`).join(' ')}</span></div>`}
      ${input(`${key}.description`, obj.description, { label: 'Descripción (opcional)', type: 'textarea', wide: true })}`;
  }

  function render(state) {
    const bc = state.bc;
    const d = bc.draft;
    const active = C().business;
    const v = BC().validate(d);
    const errors = v.issues.filter((i) => i.level === 'error'), warns = v.issues.filter((i) => i.level === 'warning');
    const storedAt = bc.storedAt;
    const pending = storedAt && storedAt !== active.savedAt;
    const terms = BC().effectiveTerms(d);

    $('bc-status').innerHTML = `
      <div class="grid-2 grid-2--tight">
        <section><h4>Contexto activo</h4>
          <ul class="plain-list">
            <li>${active.configured ? `<strong>${esc(active.name)}</strong> · guardado ${esc((active.savedAt || '').slice(0, 16).replace('T', ' '))}` : 'Sin configurar: la app usa sus valores por defecto.'}</li>
            <li>${active.configured ? `Esquema v${esc(active.schemaVersion)} · ` : ''}origen: ${esc(active.source === 'businessContext' ? 'Business Context' : 'valores por defecto')}</li>
            <li>Moneda en uso: <strong>${esc(C().currency)}</strong></li>
          </ul>
          ${pending ? `<p class="note note--warning">Hay cambios guardados que se aplican al recargar la app (la configuración se construye al arrancar).
            <button type="button" class="btn btn--small btn--primary" data-action="bc-reload">Recargar y aplicar</button></p>` : ''}
          ${bc.dirty ? '<p class="note">Tienes cambios sin guardar.</p>' : ''}
          ${bc.unreadable ? '<p class="note note--warning">Hay un contexto guardado que no se puede leer (archivo dañado o de una versión de esquema desconocida). La app usa sus valores por defecto; puedes quitarlo o guardar uno nuevo encima.</p>' : ''}
        </section>
        <section><h4>Qué alimenta y qué no</h4>
          <ul class="plain-list">${BC().FEEDS.map((f) => `<li><strong>${esc(f.from)}</strong> → <code>${esc(f.config)}</code>: ${esc(f.effect)}</li>`).join('')}</ul>
          <details class="disclosure"><summary>Qué NO cambia al configurar el negocio</summary>
            <ul class="plain-list">${BC().DOES_NOT_CHANGE.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
        </section>
      </div>`;

    const O = BC().OPTIONS;
    $('bc-form').innerHTML = `
      <ol class="steps">
        <li><h4>Identidad del negocio</h4><div class="settings-grid">
          ${input('business.name', d.business.name, { label: 'Nombre del negocio', level: 'required', placeholder: 'Ej. Farmacias del Centro' })}
          ${input('business.industry', d.business.industry, { label: 'Industria o sector', level: 'recommended', placeholder: 'Ej. Farmacia / salud' })}
          ${input('business.currency', d.business.currency, { label: 'Moneda (ISO 4217)', placeholder: C().currency, hint: 'Vacío = MXN. Solo cambia cómo se muestran las cifras, no los montos.' })}
          ${input('business.description', d.business.description, { label: 'Descripción breve', type: 'textarea', wide: true })}
        </div></li>
        <li><h4>Modelo de negocio</h4><div class="settings-grid">
          ${input('business.businessModel', d.business.businessModel, { label: 'Tipo de negocio', level: 'recommended', placeholder: 'Ej. Cadena de farmacias omnicanal' })}
          ${input('business.revenueModel', d.business.revenueModel, { label: '¿Cómo genera ingresos?', type: 'textarea' })}
          ${input('business.saleProcess', d.business.saleProcess, { label: '¿Cómo se realiza una venta?', type: 'textarea' })}
          ${checks('business.offering', d.business.offering, O.offering, '¿Qué vende?', 'recommended')}
          ${d.business.offering.includes('other') ? input('business.offeringOther', d.business.offeringOther, { label: 'Describe "Otro"', wide: true }) : ''}
        </div></li>
        <li><h4>Cómo vende</h4><div class="settings-grid">
          ${checks('selling.models', d.selling.models, O.sellingModels, 'Modelos de venta', 'recommended')}
          ${d.selling.models.includes('other') ? input('selling.other', d.selling.other, { label: 'Describe "Otro"', wide: true }) : ''}
          ${input('selling.description', d.selling.description, { label: 'Notas sobre el proceso de venta', type: 'textarea', wide: true })}
          <p class="field__hint field--wide">Es contexto: no crea embudos ni motores nuevos.</p>
        </div></li>
        <li><h4>Comportamiento de compra</h4><div class="settings-grid">
          ${checks('purchaseBehavior.types', d.purchaseBehavior.types, O.purchaseBehavior, 'Tipos de compra', 'recommended')}
          ${input('purchaseBehavior.cycleDays', d.purchaseBehavior.cycleDays, { label: 'Ciclo típico de recompra (días, opcional)', type: 'number' })}
          ${input('purchaseBehavior.description', d.purchaseBehavior.description, { label: 'Descripción', type: 'textarea', wide: true })}
        </div></li>
        <li><h4>Geografía (conceptual)</h4><div class="settings-grid">
          ${structure('geography', d.geography, GEO_PRESETS, 'La geografía')}
          <p class="field__hint field--wide">Solo describe cómo se conceptualiza. La estructura geográfica real se construye en la Fase 8.4; hoy productos ya usa estado y sucursal.</p>
        </div></li>
        <li><h4>Catálogo (conceptual)</h4><div class="settings-grid">
          ${structure('catalog', d.catalog, CAT_PRESETS, 'Un catálogo estructurado')}
          <p class="field__hint field--wide">Solo describe la estructura. El análisis de productos (categoría → subcategoría → producto → SKU) no cambia.</p>
        </div></li>
        <li><h4>Factores relevantes del negocio</h4><div class="settings-grid">
          ${checks('businessFactors', d.businessFactors, O.businessFactors, 'Factores a considerar al interpretar resultados')}
          <div class="field field--wide"><label for="bc-custom-factors">Otros factores (separados por coma)</label>
            <input id="bc-custom-factors" type="text" value="${esc(d.customFactors.join(', '))}" data-action="bc-list" data-path="customFactors"></div>
          <p class="note field--wide">Son contexto, no causas: un factor marcado aquí indica qué vale la pena investigar cuando aparezcan señales compatibles, nunca explica por sí mismo un resultado.</p>
        </div></li>
        <li><h4>Terminología</h4><div class="settings-grid">
          ${Object.keys(BC().DEFAULT_TERMS).map((k) => input(`terminology.${k}`, d.terminology[k], { label: BC().TERM_LABELS[k], placeholder: BC().DEFAULT_TERMS[k], hint: `En uso: "${terms[k]}"` })).join('')}
          <p class="field__hint field--wide">Queda disponible como contexto para fases futuras; los textos de la app todavía no se reemplazan.</p>
        </div></li>
        <li><h4>Notas</h4>${input('notes', d.notes, { label: 'Notas libres', type: 'textarea', wide: true })}</li>
      </ol>`;

    $('bc-actions').innerHTML = `
      ${errors.length ? `<ul class="issues issues--block">${errors.map((i) => `<li>${H().pill('error', 'Obligatorio')} <span>${esc(i.message)}</span></li>`).join('')}</ul>` : ''}
      ${warns.length ? `<details class="disclosure" ${errors.length ? '' : 'open'}><summary>${warns.length} recomendación(es) — no bloquean guardar</summary>
        <ul class="issues issues--block">${warns.map((i) => `<li>${H().pill('warning', 'Recomendado')} <span>${esc(i.message)}</span></li>`).join('')}</ul></details>` : ''}
      <div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="bc-save" ${v.ok ? '' : 'disabled'}>Guardar contexto del negocio</button>
        <button type="button" class="btn" data-action="bc-seed">Proponer desde la configuración actual</button>
        <button type="button" class="btn" data-action="bc-export" ${storedAt ? '' : 'disabled'}>Exportar business_context.json</button>
        <label class="btn file-btn">Importar business_context.json<input type="file" accept=".json,application/json" data-action="bc-import"></label>
        ${storedAt || state.bc.unreadable ? '<button type="button" class="btn btn--quiet" data-action="bc-clear">Quitar contexto (volver a valores por defecto)</button>' : ''}
      </div>
      <p class="field__hint">Se guarda en este navegador (junto con las preferencias) con versión de esquema ${BC().SCHEMA_VERSION}. Exportarlo te permite llevarlo a otro equipo o navegador.</p>`;
  }

  FP.businessView = { render, GEO_PRESETS, CAT_PRESETS };
})(typeof window !== 'undefined' ? window : globalThis);
