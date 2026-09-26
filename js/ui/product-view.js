/**
 * product-view.js — Vista "Categoría → Producto" y revisión de archivos de productos (Fase 8.1).
 * Solo pinta. Los datos vienen de FP.productStore / FP.productAnalysis (IndexedDB) y del estado `state.pa`.
 * Nunca renderiza millones de filas: tablas agregadas, Top N visual y paginación.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const PS = () => FP.productStore;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const STATUS = { available: ['ok', 'Disponible'], partial: ['warning', 'Parcial'], missing: ['na', 'Faltante'], invalid: ['error', 'Inválido'],
    unavailable: ['na', 'No disponible'], not_calculable: ['na', 'No calculable'] };
  const GROWTH = { growth: ['ok', 'Crece'], decline: ['error', 'Cae'], stable: ['na', 'Estable'], new: ['ok', 'Nuevo'], lost: ['warning', 'Sin venta'] };
  const LEVEL = { channel: 'Canal', category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', region: 'Región', state: 'Estado', city: 'Ciudad', branch: 'Sucursal', delivery: 'Tipo de entrega' };
  const ISSUE = {
    MISSING_DATE: 'Falta fecha', INVALID_DATE: 'Fecha inválida', AMBIGUOUS_DATE: 'Fecha ambigua', MISSING_CHANNEL: 'Falta canal', INVALID_CHANNEL: 'Canal no reconocido',
    MISSING_SKU: 'Falta SKU', MISSING_PRODUCT: 'SKU sin producto', MISSING_CATEGORY: 'Producto sin categoría', MISSING_SUBCATEGORY: 'Producto sin subcategoría',
    SKU_ATTRIBUTE_MISMATCH: 'SKU con atributos distintos', EXACT_DUPLICATE: 'Duplicado exacto', CONFLICT: 'Conflicto (misma llave, métricas distintas)',
    VALID_MULTIPLICITY: 'Multiplicidad válida', PERIOD_INCOMPLETE: 'Periodo incompleto', MALFORMED_ROW: 'Fila con columnas de más o de menos',
    INVALID_REVENUE: 'Venta inválida', INVALID_ORDERS: 'Pedidos inválidos', INVALID_UNITS: 'Unidades inválidas', INVALID_VIEWS: 'Vistas inválidas',
    NEGATIVE_REVENUE: 'Venta negativa', NEGATIVE_ORDERS: 'Pedidos negativos', NEGATIVE_UNITS: 'Unidades negativas', NEGATIVE_VIEWS: 'Vistas negativas',
    MISSING_STATE: 'Falta estado', INVALID_STATE: 'Estado no reconocido', MISSING_BRANCH: 'Falta sucursal', MISSING_DELIVERY: 'Falta tipo de entrega',
    INVALID_DELIVERY: 'Tipo de entrega no reconocido', INVALID_ADDTOCART: 'Carrito inválido', INVALID_BEGINCHECKOUT: 'Checkout inválido', INVALID_PURCHASESGA4: 'Compras GA4 inválidas',
    PARTIAL_GEOGRAPHY: 'Geografía parcial', NO_GEOGRAPHY: 'Sin geografía', CITY_WITHOUT_STATE: 'Ciudad sin estado', BRANCH_NAME_WITHOUT_CODE: 'Nombre de sucursal sin código',
    REGION_CONFLICT: 'Estado en varias regiones', BRANCH_STATE_CONFLICT: 'Sucursal en varios estados', BRANCH_NAME_CONFLICT: 'Sucursal con varios nombres',
    BRANCH_WITHOUT_STATE: 'Sucursal sin estado', DUPLICATE_BRANCH_NAME: 'Nombre de sucursal repetido',
    NEGATIVE_ADDTOCART: 'Carrito negativo', NEGATIVE_BEGINCHECKOUT: 'Checkout negativo', NEGATIVE_PURCHASESGA4: 'Compras GA4 negativas'
  };
  const KIND_LABEL = { sales: 'Venta', funnel: 'Funnel GA4' };
  const statusPill = (st) => { const [c, l] = STATUS[st] || ['na', st]; return H().pill(c, l); };
  const metricVal = (k, m) => {
    if (!m || !fin(m.value)) return `<span class="val val--missing" ${m && m.note ? `title="${esc(m.note)}"` : ''}>${esc(STATUS[m ? m.status : 'unavailable'] ? STATUS[m ? m.status : 'unavailable'][1] : 'No disponible')}</span>`;
    const txt = k === 'revenue' || k === 'aov' ? F().currency(m.value, k === 'aov' ? 2 : 0) : ['conversionRate', 'cartRate', 'checkoutRate', 'purchaseRate'].includes(k) ? F().percent(m.value, 2) : k === 'trackingCoverage' ? F().percent(m.value, 0) : F().integer(m.value);
    return `${esc(txt)}${m.source === 'calculated' ? '<span class="src src--calc">calc.</span>' : ''}`;
  };
  const esc = (v) => H().esc(v);

  /* ======================= Revisión de carga (en Carga de datos) ======================= */

  function renderStaging(state, item) {
    const s = item.staged, r = item.result;
    const kind = s.kind || 'sales';
    const req = PS().typeOf(kind).required;
    const fieldOptions = (sel) => `<option value="">Ignorar columna</option>` + PS().fieldsOf(kind).map((f) =>
      `<option value="${f.key}" ${f.key === sel ? 'selected' : ''}>${esc(f.label)}${req.includes(f.key) ? ' (obligatoria)' : ''}</option>`).join('');
    const mapping = s.headers.map((h, i) => {
      const samples = s.preview.slice(0, 3).map((row) => row.cells[i]).filter((v) => v !== undefined && v !== '');
      return `<tr><td><strong>${esc(h)}</strong></td><td class="wrap cell-sub">${esc(samples.join(', ') || '(vacía)')}</td>
        <td><select data-action="set-mapping" data-header="${esc(h)}" aria-label="Campo para ${esc(h)}">${fieldOptions(s.mapping[h])}</select></td></tr>`;
    }).join('');
    const pv = FP.productImport.previewRecords(s, state.settings);
    const stateCell = (m) => (m.state === 'observed' ? esc(F().integer(m.value)) : `<span class="val val--${m.state === 'invalid' ? 'invalid' : 'missing'}">${esc(m.state === 'invalid' ? `inválido (${m.raw})` : m.state === 'unavailable' ? 'no disponible' : 'falta')}</span>`);
    const ms = PS().metricsOf(kind);
    const preview = pv.map((p) => `<tr><td class="num">${p.line}</td><td>${esc(p.date)}</td><td>${esc(p.channel)}</td><td>${esc(p.sku)}</td>
      ${kind === 'sales' ? `<td class="wrap">${esc(p.product)}<span class="cell-sub">${esc([p.category, p.subcategory].filter(Boolean).join(' › '))}</span></td>
      <td class="wrap">${esc([p.region, p.state, p.city].filter(Boolean).join(' › ') || geoMissing())}<span class="cell-sub">${esc(p.branch || geoMissing())} · ${esc(p.delivery || geoMissing())}</span></td>` : ''}
      ${ms.map((m) => `<td class="num">${stateCell(p.metrics[m])}</td>`).join('')}
      <td>${!p.accepted && !p.duplicate ? H().pill('error', 'Se rechaza') : p.duplicate === 'exact' ? H().pill('na', 'Duplicado exacto') : p.duplicate === 'conflict' ? H().pill('warning', 'Conflicto') : p.issues.length ? H().pill('warning', 'Advertencia') : H().pill('ok', '✓ Válida')}</td></tr>`).join('');
    let body;
    if (item.status === 'processing') {
      body = `<p class="note">Validando el archivo completo… ${Math.round((item.progress || 0) * 100)} %</p><div class="progress"><span style="width:${Math.round((item.progress || 0) * 100)}%"></span></div>`;
    } else if (r && r.mappingIssues.length) {
      body = `<ul class="issues issues--block">${r.mappingIssues.map((i) => `<li>${H().pill('error', 'Mapeo')} <span>${esc(i.message)}</span></li>`).join('')}</ul>`;
    } else if (r) {
      const sm = r.summary, st = r.stored;
      const issues = Object.values(sm.issuesByType).sort((a, b) => b.count - a.count);
      body = `
        <dl class="kpis kpis--6">
          <div><dt>Filas leídas</dt><dd class="num">${F().integer(sm.rows)}</dd></div>
          <div><dt>Aceptadas</dt><dd class="num">${F().integer(sm.accepted)}</dd><small>${F().integer(sm.warningRows)} con advertencias</small></div>
          <div><dt>Rechazadas</dt><dd class="num">${F().integer(sm.rejected)}</dd><small>sin fecha, canal o SKU válidos</small></div>
          <div><dt>Duplicados exactos</dt><dd class="num">${F().integer(sm.exactDuplicates)}</dd><small>se conservan una vez</small></div>
          <div><dt>Conflictos</dt><dd class="num">${F().integer(sm.conflicts)}</dd><small>no se eliminan: se marcan</small></div>
          <div><dt>Multiplicidad válida</dt><dd class="num">${F().integer(sm.multiplicity)}</dd><small>se suman por SKU-día</small></div>
        </dl>
        <p class="field__hint">${F().integer(sm.skus)} SKU · ${F().integer(sm.dates)} días (${esc(sm.dateMin || '—')} a ${esc(sm.dateMax || '—')}) · canales ${esc(sm.channels.join(', '))} ·
          ${kind === 'sales' ? `${F().integer(sm.states)} estados · ${F().integer(sm.branches)} sucursales · ${esc(sm.deliveries.join(' y '))} · ` : ''}
          métricas mapeadas: ${esc(sm.mappedMetrics.map((m) => PS().label(m)).join(', '))} · validado en ${F().integer(r.elapsedMs)} ms.</p>
        ${st && (st.identical || st.conflicts) ? `<div class="note note--warning">Ya hay datos guardados para ${F().integer(st.existingPartitions)} días × canal de este archivo:
          ${F().integer(st.identical)} SKU-días idénticos (se omiten) y <strong>${F().integer(st.conflicts)} con métricas distintas</strong>.
          <div class="btn-row" role="radiogroup" aria-label="Qué hacer con los conflictos">
            <label><input type="radio" name="p-policy" value="keep" data-action="p-policy" ${item.policy !== 'replace' ? 'checked' : ''}> Conservar lo guardado y marcar los conflictos</label>
            <label><input type="radio" name="p-policy" value="replace" data-action="p-policy" ${item.policy === 'replace' ? 'checked' : ''}> Reemplazar con este archivo (corrección; se registra lo anterior)</label>
          </div></div>` : ''}
        ${issues.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Severidad</th><th class="num">Filas</th></tr></thead><tbody>
          ${issues.map((i) => `<tr><td>${esc(ISSUE[i.type] || i.type)}<span class="cell-sub">${esc(i.type)}</span></td><td>${H().pill(i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : 'na', i.severity === 'error' ? 'Error' : i.severity === 'warning' ? 'Advertencia' : 'Info')}</td><td class="num">${F().integer(i.count)}</td></tr>`).join('')}
          </tbody></table></div>
          <details class="disclosure"><summary>Ejemplos (hasta ${C().products.issueExamples} por tipo)</summary><div class="table-wrap table-wrap--tall"><table class="table">
            <thead><tr><th class="num">Fila</th><th>Tipo</th><th>Campo</th><th>Valor</th><th>Mensaje</th></tr></thead>
            <tbody>${r.draft.issues.examples.slice(0, 200).map((e) => `<tr><td class="num">${e.row ?? '—'}</td><td>${esc(ISSUE[e.type] || e.type)}</td><td>${esc(e.field)}</td><td>${esc(e.value)}</td><td class="wrap">${esc(e.message)}</td></tr>`).join('')}</tbody></table></div></details>`
          : '<p class="note note--ok">Sin errores ni advertencias.</p>'}`;
    } else body = '';
    return `
      <div class="staging">
        <div class="staging__head"><div>
          <h3 class="panel__title">${esc(s.fileName)} <span class="chip">Productos · ${esc(KIND_LABEL[kind])}</span></h3>
          <p class="panel__desc">~${F().integer(s.approxRows)} filas, ${s.headers.length} columnas, separador "${s.delimiter === '\t' ? 'tabulador' : esc(s.delimiter)}". Se guarda en IndexedDB.
            ${kind === 'sales' ? 'Un renglón por fecha × canal × SKU × estado × sucursal × tipo de entrega.' : 'Un renglón por fecha × canal × SKU (el funnel ocurre antes de elegir sucursal y entrega).'}</p>
        </div>
        <div class="field"><label for="p-kind" class="field__hint">Tipo de archivo</label>
          <select id="p-kind" data-action="p-kind"><option value="sales" ${kind === 'sales' ? 'selected' : ''}>Productos · venta</option><option value="funnel" ${kind === 'funnel' ? 'selected' : ''}>Productos · funnel (GA4)</option></select></div></div>
        <ol class="steps">
          <li><h4>Mapeo de columnas</h4>
            <p class="field__hint">Obligatorios: ${esc(req.map((f) => PS().label(f)).join(', '))} y al menos una métrica. Encabezados oficiales: ${esc(PS().typeOf(kind).template.join(', '))}.</p>
            <div class="table-wrap"><table class="table"><thead><tr><th>Columna del archivo</th><th>Ejemplos</th><th>Campo</th></tr></thead><tbody>${mapping}</tbody></table></div></li>
          <li><h4>Vista previa (primeras ${pv.length} filas normalizadas)</h4>
            ${pv.length ? `<div class="table-wrap"><table class="table"><thead><tr><th class="num">Fila</th><th>Fecha</th><th>Canal</th><th>SKU</th>${kind === 'sales' ? '<th>Producto</th><th>Región · estado · ciudad · sucursal · entrega</th>' : ''}
              ${ms.map((m) => `<th class="num">${esc(PS().label(m))}</th>`).join('')}<th>Resultado</th></tr></thead><tbody>${preview}</tbody></table></div>` : '<p class="note">Asigna fecha, canal y SKU para ver la vista previa.</p>'}</li>
          <li><h4>Validación del archivo completo</h4>${body}</li>
        </ol>
        <div class="staging__foot">
          <p>${r && r.canImport ? `Se guardarán <strong>${F().integer(r.summary.accepted)}</strong> renglones válidos de ${F().integer(r.summary.rows)} filas.` : 'Corrige el mapeo para poder importar.'}</p>
          <div class="btn-row">
            <button type="button" class="btn" data-action="discard-staged">Descartar archivo</button>
            <button type="button" class="btn btn--primary" data-action="commit-staged" ${r && r.canImport && item.status !== 'processing' && item.status !== 'saving' ? '' : 'disabled'}>${item.status === 'saving' ? `Guardando… ${Math.round((item.progress || 0) * 100)} %` : kind === 'sales' ? 'Importar venta de productos' : 'Importar funnel de productos'}</button>
          </div></div>
      </div>`;
  }

  /* ======================= Vista Categoría → Producto ======================= */

  function renderStatus(state) {
    const pa = state.pa, st = state.storage || {};
    const m = PS().meta || {};
    const mig = st.migration || {};
    const migText = { verified: 'verificada', failed: 'con error', copying: 'en curso', pending: 'pendiente', unavailable: 'no disponible' }[mig.status] || mig.status || '—';
    $('pa-status').innerHTML = `
      <div class="grid-2 grid-2--tight">
        <section><h4>Almacenamiento</h4>
          <ul class="plain-list">
            <li>Modo: <strong>${esc(st.mode === 'indexeddb' ? 'IndexedDB (datos) + localStorage (preferencias)' : 'solo localStorage (IndexedDB no disponible)')}</strong></li>
            <li>Migración: <strong>${esc(migText)}</strong>${mig.keys ? (mig.keys.filter((k) => k.action === 'copied').length ? ` · ${mig.keys.filter((k) => k.action === 'copied').length} claves copiadas y verificadas` : ' · no había datos anteriores que copiar') : ''}${mig.status === 'verified' ? ' · localStorage se conserva como respaldo' : ''}</li>
            ${mig.error ? `<li class="val--invalid">${esc(mig.error)}</li>` : ''}
            <li>Espacio usado: ${pa.estimate ? `${esc(F().decimal(pa.estimate.usage / 1048576, 1))} MB de ${esc(F().decimal(pa.estimate.quota / 1073741824, 1))} GB disponibles` : '—'}</li>
          </ul>
          <div class="btn-row">
            ${mig.status === 'failed' ? '<button type="button" class="btn btn--small" data-action="storage-retry">Reintentar migración</button>' : ''}
            <button type="button" class="btn btn--small" data-action="storage-tests" ${pa.testing ? 'disabled' : ''}>${pa.testing ? 'Probando…' : 'Pruebas de almacenamiento'}</button>
          </div>
          ${pa.tests ? `<p class="note ${pa.tests.failed ? 'note--warning' : 'note--ok'}">Pruebas de almacenamiento: ${pa.tests.passed} de ${pa.tests.total} correctas en ${esc(location.protocol)}//${esc(location.host || 'archivo local')}.</p>
            <details class="disclosure"><summary>Detalle</summary><ul class="plain-list">${pa.tests.results.map((t) => `<li>${t.pass ? '✓' : '✗'} ${esc(t.name)}${t.detail ? ` <span class="cell-sub">${esc(t.detail)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
        </section>
        <section><h4>Datos de productos</h4>
          ${PS().available() && m.batches ? `<ul class="plain-list">
            <li>${F().integer(pa.counts ? pa.counts.skuDays : 0)} SKU-días en ${F().integer(pa.counts ? pa.counts.partitions : 0)} bloques día × canal</li>
            <li>${F().integer(m.skus || 0)} SKU · ${esc(m.dateMin || '—')} a ${esc(m.dateMax || '—')} · ${esc((m.channels || []).join(', '))}</li>
            <li>Venta: ${esc((m.mappedMetrics || []).map((x) => PS().label(x)).join(', ') || '—')}</li>
            <li>Funnel (GA4): ${esc((m.funnelMetrics || []).map((x) => PS().label(x)).join(', ') || 'sin cargar')}${(m.funnelMetrics || []).includes('views') ? '' : ' · CR por producto no disponible (falta el archivo de funnel)'}</li>
            <li>Geografía: ${esc([m.regions ? `${m.regions} regiones` : null, (m.states || []).length ? `${m.states.length} estados` : null, m.cities ? `${m.cities} ciudades` : null,
              (m.branches || []).length ? `${m.branches.length} ${plural(locTerm().toLowerCase())}` : null].filter(Boolean).join(' · ') || 'no disponible')}${(PS().geo.issues || []).length ? ` · ${PS().geo.issues.length} aviso(s) de consistencia` : ''}</li>
            <li>${F().integer(m.batches)} archivo(s) importados</li></ul>`
            : `<p class="note">${PS().available() ? 'Todavía no hay datos de productos.' : 'IndexedDB no está disponible en este navegador: la capa de productos está desactivada.'}</p>`}
          <div class="btn-row"><a class="btn btn--small btn--primary" href="#carga">Cargar productos</a>
            <button type="button" class="btn btn--small" data-action="p-mock">Probar con archivo generado</button>
            <button type="button" class="btn btn--small" data-action="p-mock-quality">Caso de calidad</button></div>
        </section>
      </div>`;
  }

  /** Término del negocio para "sucursal" (Business Context, Fase 8.2); el resto de textos no cambia en esta fase. */
  const locTerm = () => { const t = C().business && C().business.terms && C().business.terms.location; return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sucursal'; };
  const plural = (w) => (/[aeiouáéó]$/.test(w) ? `${w}s` : `${w}es`);
  const levelName = (lv) => (lv === 'branch' ? locTerm() : LEVEL[lv] || lv);
  /** "No disponible" (faltante), "No aplica" (el negocio declaró que la geografía no es relevante) o "Inválido". */
  const geoMissing = () => ((C().business && C().business.context && C().business.context.geography && C().business.context.geography.relevant === false) ? 'No aplica' : 'No disponible');
  const displayKey = (lv, key) => {
    if (key === '(sin dato)') return ['region', 'state', 'city', 'branch', 'delivery'].includes(lv) ? geoMissing() : key;
    if (key === '(inválido)') return 'Inválido';
    if (lv === 'branch') { const e = PS().entity('branch', key); return e && e.name !== e.code ? `${e.name} (${e.code})` : key; }
    return key;
  };

  function renderControls(state) {
    const pa = state.pa;
    const opts = PS().available() ? PS().geoOptions(pa.geo) : { regions: [], states: [], cities: [], branches: [], deliveries: [], available: {} };
    const av = opts.available;
    const level = FP.app.paLevel(pa);
    const choices = FP.app.paNextChoices(pa);
    const roots = [['category', 'Categoría'], ...(av.region ? [['region', 'Región']] : []), ...(av.state ? [['state', 'Estado']] : []),
      ...(av.city ? [['city', 'Ciudad']] : []), ...(av.branch ? [['branch', locTerm()]] : []), ...(av.delivery ? [['delivery', 'Tipo de entrega']] : [])];
    const sel = (key, label, list, valueOf = (x) => x, textOf = (x) => x) => (list.length ? `<div class="field"><label for="pa-g-${key}" class="field__hint">${esc(label)}</label>
      <select id="pa-g-${key}" data-action="pa-geo" data-key="${key}"><option value="">${key === 'delivery' ? 'Ambos' : 'Todos'}</option>
        ${list.map((x) => `<option value="${esc(valueOf(x))}" ${pa.geo[key] === valueOf(x) ? 'selected' : ''}>${esc(textOf(x))}</option>`).join('')}</select></div>` : '');
    const geoActive = Object.values(pa.geo).some(Boolean);
    const crumbs = [`<button type="button" class="btn btn--ghost btn--small" data-action="pa-up" data-index="-1">Negocio${pa.channel !== 'total' ? ` · ${esc(FP.dataModel.getChannel(pa.channel).label)}` : ''}</button>`,
      ...pa.drill.map((d, i) => (i < pa.drill.length - 1 || level
        ? `<button type="button" class="btn btn--ghost btn--small" data-action="pa-up" data-index="${i}" title="${esc(levelName(d.level))}">${esc(displayKey(d.level, d.key))}</button>`
        : `<strong>${esc(displayKey(d.level, d.key))}</strong>`))];
    const geoLevel = ['region', 'state', 'city', 'branch', 'delivery'].includes(level) || geoActive || pa.drill.some((d) => ['region', 'state', 'city', 'branch', 'delivery'].includes(d.level));
    $('pa-controls').innerHTML = `
      <div class="filters">
        <div class="field"><label for="pa-from" class="field__hint">Desde</label><input id="pa-from" type="date" value="${esc(pa.from || '')}" data-action="pa-setting" data-key="from"></div>
        <div class="field"><label for="pa-to" class="field__hint">Hasta</label><input id="pa-to" type="date" value="${esc(pa.to || '')}" data-action="pa-setting" data-key="to"></div>
        <div class="field"><label for="pa-cmp" class="field__hint">Comparar contra</label>
          <select id="pa-cmp" data-action="pa-setting" data-key="comparison">
            <option value="previous" ${pa.comparison === 'previous' ? 'selected' : ''}>Periodo anterior (misma duración)</option>
            <option value="yoy" ${pa.comparison === 'yoy' ? 'selected' : ''}>Mismo periodo del año anterior</option></select></div>
        <div class="field"><label for="pa-ch" class="field__hint">Canal</label>
          <select id="pa-ch" data-action="pa-setting" data-key="channel">${[['total', 'Total digital'], ...C().channels.map((c) => [c.id, c.label])].map(([v, l]) =>
            `<option value="${v}" ${pa.channel === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="pa-viewby" class="field__hint">Empezar por</label>
          <select id="pa-viewby" data-action="pa-viewby">${roots.map(([v, l]) => `<option value="${v}" ${pa.viewBy === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="pa-top" class="field__hint">Mostrar (solo visual)</label>
          <select id="pa-top" data-action="pa-setting" data-key="topN">${C().products.topN.map((n) => `<option value="${n}" ${String(pa.topN) === String(n) ? 'selected' : ''}>${n ? `Top ${n}` : 'Todos (paginado)'}</option>`).join('')}</select></div>
        <div class="field"><span class="field__hint">&nbsp;</span><button type="button" class="btn btn--small" data-action="pa-from-dx" ${state.dx && state.dx.run ? '' : 'disabled'}>Usar periodo y canal del diagnóstico</button></div>
      </div>
      ${av.region || av.state || av.city || av.branch || av.delivery ? `
      <fieldset class="filters geo-filters"><legend class="field__hint">Geografía y operación (solo análisis de productos)</legend>
        ${sel('region', 'Región', opts.regions)}${sel('state', 'Estado', opts.states)}${sel('city', 'Ciudad', opts.cities)}
        ${sel('branch', locTerm(), opts.branches, (b) => b.code, (b) => (b.name !== b.code ? `${b.name} (${b.code})` : b.code))}
        ${sel('delivery', 'Tipo de entrega', opts.deliveries)}
        ${geoActive ? '<div class="field"><span class="field__hint">&nbsp;</span><button type="button" class="btn btn--ghost btn--small" data-action="pa-geo-clear">Quitar filtros de geografía</button></div>' : ''}
      </fieldset>` : ''}
      <nav class="breadcrumbs" aria-label="Ruta del análisis">${crumbs.join(' › ')}
        ${level ? ` › <strong>${esc(levelName(level))}</strong>` : ''}
        ${choices.length && level ? `<span class="breadcrumbs__next"><label for="pa-next" class="field__hint">Desglosar por</label>
          <select id="pa-next" data-action="pa-next">${choices.map((c) => `<option value="${c}" ${c === level ? 'selected' : ''}>${esc(levelName(c))}</option>`).join('')}</select></span>` : ''}</nav>
      ${geoLevel ? `<p class="field__hint">${esc(`Región, estado, ciudad, ${locTerm().toLowerCase()} y tipo de entrega se definen en el checkout, después de la vista de ficha: CR y funnel no están disponibles aquí. Una diferencia entre zonas no demuestra por sí misma una causa.`)}</p>` : ''}
      ${pa.note ? `<p class="note">${esc(pa.note)}</p>` : ''}`;
  }

  function renderResult(state) {
    const pa = state.pa;
    const r = pa.result;
    if (!PS().available() || !(PS().meta || {}).batches) { ['pa-kpis', 'pa-table', 'pa-signals', 'pa-trace'].forEach((id) => { $(id).innerHTML = ''; });
      $('pa-kpis').innerHTML = '<div class="empty"><strong>Todavía no hay datos de productos</strong>Carga el archivo de venta (fecha, canal, SKU, estado, sucursal, tipo de entrega y al menos una métrica) y, si quieres CR y funnel, el archivo de funnel de GA4. <a class="btn btn--small btn--primary" href="#carga">Ir a Carga de datos</a></div>'; return; }
    if (pa.loading || !r) { $('pa-kpis').innerHTML = '<p class="note">Calculando desde IndexedDB…</p>'; return; }
    const t = r.total;
    const kp = (k, label) => { const c = t.current[k], b = t.baseline[k]; const d = fin(c && c.value) && fin(b && b.value) && b.value !== 0 ? c.value / b.value - 1 : null;
      return `<div><dt>${esc(label)} ${statusPill(c.status)}</dt><dd class="num">${metricVal(k, c)}</dd><small>vs ${metricVal(k, b)} · ${esc(F().signedPercent(d, 1))}</small></div>`; };
    $('pa-kpis').innerHTML = `
      <div class="subhead"><h3 class="panel__title">${esc(levelName(r.level))} · ${esc(r.period.from)} a ${esc(r.period.to)}</h3>
        <span class="field__hint">Referencia: ${esc(r.baseline.from)} a ${esc(r.baseline.to)} (${esc(r.baseline.label)}) · ${r.elapsedMs} ms</span></div>
      <dl class="kpis kpis--6">${kp('revenue', 'Venta')}${kp('orders', 'Pedidos')}${kp('units', 'Unidades')}${kp('aov', 'AOV')}${kp('conversionRate', 'CR')}${kp('views', 'Vistas')}</dl>
      <dl class="kpis kpis--3">${kp('cartRate', 'Vista → carrito')}${kp('checkoutRate', 'Carrito → checkout')}${kp('purchaseRate', 'Checkout → compra')}</dl>
      <p class="field__hint">Venta, pedidos y unidades vienen del archivo de venta; vistas y el resto del funnel, de GA4. CR y AOV son calculados ("calc."). Estado, sucursal y tipo de entrega ocurren después de la vista: ahí el funnel y el CR no están disponibles. Faltante, inválido y no disponible nunca se muestran como 0.
        ${t.current.trackingCoverage && fin(t.current.trackingCoverage.value) ? `Cobertura de tracking (compras GA4 ÷ unidades reales): ${esc(F().percent(t.current.trackingCoverage.value, 0))}${t.current.trackingCoverage.value < 1 - C().products.signals.trackingGapPct ? ' — posible pérdida de medición en GA4.' : ''}` : ''}</p>
      ${r.compensation.text ? `<p class="note">${esc(r.compensation.text)}</p>` : ''}
      ${r.concentration.decline.groups ? `<p class="field__hint">Deterioro concentrado: ${r.concentration.decline.top} de ${r.concentration.decline.groups} grupos explican el 80 % de las caídas (${esc(r.concentration.decline.topKeys.slice(0, 5).join(', '))}${r.concentration.decline.top > 5 ? '…' : ''}).</p>` : ''}`;

    const n = Number(pa.topN) || 0;
    const size = n || 50;
    const rows = r.rows;
    const page = n ? 1 : Math.max(1, Math.min(pa.page || 1, Math.ceil(rows.length / size)));
    const shown = n ? rows.slice(0, n) : rows.slice((page - 1) * size, page * size);
    const dm = (row, k) => { const x = row.drivers[k]; return fin(x.deltaPct) ? F().signedPercent(x.deltaPct, 1) : '—'; };
    $('pa-table').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>${esc(levelName(r.level))}</th><th class="num">Venta</th><th class="num">Referencia</th><th class="num">Δ venta</th><th class="num">Participación</th>
        <th class="num">Contribución</th><th>Estado</th><th class="num">Pedidos Δ</th><th class="num">Vistas Δ</th><th class="num">CR</th><th class="num">AOV</th><th>Señales</th><th></th></tr></thead>
      <tbody>${shown.map((x) => `<tr>
        <td><strong>${esc(displayKey(r.level, x.key))}</strong>${x.geography && x.geography.path.length > 1 ? `<span class="cell-sub">${esc(x.geography.path.slice(0, -1).map((g) => g.name).join(' › '))}</span>` : ''}${x.current && x.current.conflicts ? `<span class="cell-sub">${x.current.conflicts} SKU-días en conflicto</span>` : ''}</td>
        <td class="num">${esc(F().currency(x.revenue.current, 0))}</td><td class="num">${esc(F().currency(x.revenue.baseline, 0))}</td>
        <td class="num">${esc(FP.pacingView.signed('revenue', x.revenue.delta))}<span class="cell-sub">${esc(F().signedPercent(x.revenue.deltaPct, 1))}</span></td>
        <td class="num">${esc(F().percent(x.share, 1))}</td>
        <td class="num">${esc(F().percent(x.contribution, 1))}</td>
        <td>${H().pill(...(GROWTH[x.status] || ['na', x.status]))}</td>
        <td class="num">${esc(dm(x, 'orders'))}</td><td class="num">${esc(dm(x, 'views'))}</td>
        <td class="num">${metricVal('conversionRate', x.current && x.current.conversionRate)}</td>
        <td class="num">${metricVal('aov', x.current && x.current.aov)}</td>
        <td>${x.signals.map((s) => `<span class="chip" title="${esc(s.evidence)}">Patrón ${esc(s.pattern)}</span>`).join(' ')}</td>
        <td>${r.level !== 'sku' ? `<button type="button" class="btn btn--small" data-action="pa-drill" data-key="${esc(x.key)}" ${x.key === '(sin dato)' || x.key === '(inválido)' ? 'title="Abre los renglones sin este dato"' : ''}>Ver ›</button>`
          : `<button type="button" class="btn btn--small" data-action="pa-trace" data-key="${esc(x.key)}">Trazabilidad</button>`}</td></tr>`).join('')}</tbody></table></div>
      ${n ? `<p class="field__hint">Top ${n} de ${F().integer(rows.length)} por |contribución|. El Top N es solo visual: todos los SKU siguen guardados y en los totales.</p>`
        : `<div class="pager"><span>${F().integer((page - 1) * size + 1)}–${F().integer(Math.min(page * size, rows.length))} de ${F().integer(rows.length)}</span>
          <div class="btn-row"><button type="button" class="btn btn--small" data-action="pa-page" data-value="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
          <button type="button" class="btn btn--small" data-action="pa-page" data-value="${page + 1}" ${page * size >= rows.length ? 'disabled' : ''}>Siguiente</button></div></div>`}
      <p class="field__hint">Participación = venta del grupo ÷ total del periodo. Contribución = Δ del grupo ÷ Δ total (puede pasar de 100 % si otros grupos compensan).</p>`;

    const gsig = r.geoSignals || [];
    const gIssues = PS().geo.issues || [];
    const geoHtml = `${gsig.length ? `<h4>Dónde se concentra la variación</h4><ul class="alert-list">${gsig.map((g) => `<li>${H().pill(g.type === 'geo_concentration' ? 'warning' : 'na', g.dimension === 'branch' ? locTerm() : 'Estado')} <span>${esc(g.label)}
        <span class="cell-sub">${esc(`${levelName(g.level)} · ${g.period.from} a ${g.period.to} vs ${g.baseline.from} a ${g.baseline.to} · venta · ${g.note}`)}</span></span></li>`).join('')}</ul>` : ''}
      ${gIssues.length ? `<details class="disclosure"><summary>Calidad de la geografía (${gIssues.length})</summary><ul class="plain-list">${gIssues.map((i) => `<li>${H().pill('warning', ISSUE[i.type] || i.type)} ${esc(i.message)}</li>`).join('')}</ul></details>` : ''}`;
    $('pa-signals').innerHTML = geoHtml + (r.signals.length ? `<ul class="alert-list">${r.signals.slice(0, 30).map((s) => `<li>${H().pill('warning', `Patrón ${s.pattern}`)} <span><strong>${esc(s.key)}</strong>: ${esc(s.label)} <span class="cell-sub">${esc(s.evidence)} · ${esc(s.note)}</span></span></li>`).join('')}</ul>`
      : `<p class="note">Sin patrones de señales con los umbrales actuales${(r.mappedMetrics && r.mappedMetrics.funnel || []).includes('views') ? '' : ' (sin el archivo de funnel no se evalúan los patrones de tráfico, CR ni las tasas del embudo)'}.</p>`);

    const tr = pa.trace;
    const cellTxt = (x, m) => (fin(x[m]) ? esc(F().integer(x[m])) : `<span class="val val--missing">${esc(x[`${m}State`] === 'invalid' ? 'inválido' : 'falta')}</span>`);
    $('pa-trace').innerHTML = !tr ? '<p class="field__hint">En el nivel SKU usa "Trazabilidad" para ver cada día con su archivo y fila de origen (venta y funnel por separado).</p>' : `
      <div class="subhead"><h3 class="panel__title">Trazabilidad · ${esc(tr.sku)}</h3><button type="button" class="btn btn--ghost btn--small" data-action="pa-trace-close">Cerrar</button></div>
      <div class="table-wrap table-wrap--tall"><table class="table"><thead><tr><th>Fecha</th><th>Canal</th><th>Archivo</th><th>Región · estado · ciudad · sucursal · entrega</th>
        ${PS().metricsOf('sales').map((m) => `<th class="num">${esc(PS().label(m))}</th>`).join('')}${PS().metricsOf('funnel').map((m) => `<th class="num">${esc(PS().label(m))}</th>`).join('')}<th>Origen</th></tr></thead>
        <tbody>${tr.rows.slice(0, 500).map((x) => `<tr><td class="num">${esc(x.date)}</td><td>${esc(x.channel)}</td><td>${esc(KIND_LABEL[x.kind])}</td>
          <td class="wrap cell-sub">${x.kind === 'sales' ? esc([x.region, x.state, x.city, x.branchName && x.branchName !== x.branch ? `${x.branchName} (${x.branch})` : x.branch, x.delivery].map((v) => v || geoMissing()).join(' · ')) : '—'}</td>
          ${PS().metricsOf('sales').map((m) => `<td class="num">${x.kind === 'sales' ? cellTxt(x, m) : ''}</td>`).join('')}
          ${PS().metricsOf('funnel').map((m) => `<td class="num">${x.kind === 'funnel' ? cellTxt(x, m) : ''}</td>`).join('')}
          <td><span class="cell-sub">${esc(x.fileName || x.batchId)} · fila ${x.row}${x.conflict ? ' · conflicto' : ''}${x.multiplicity ? ' · suma de varias filas' : ''}</span></td></tr>`).join('')}</tbody></table></div>
      <p class="field__hint">Archivo → fila → fecha → canal → SKU → métrica. Venta y funnel se muestran en renglones separados porque son archivos distintos. Valores observados tal como venían; los faltantes e inválidos no se convierten en 0.</p>`;
  }

  function render(state) {
    renderStatus(state);
    renderControls(state);
    renderResult(state);
  }

  FP.productView = { render, renderStaging };
})(typeof window !== 'undefined' ? window : globalThis);
