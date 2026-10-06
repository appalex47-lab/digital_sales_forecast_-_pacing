/**
 * import-view.js — Vista "Carga de datos" (Fase 1).
 * Solo pinta. Lee `state.settings`, `state.staging`, `state.store`.
 * Las acciones (data-action) las resuelve app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  const ROW_STATUS = {
    quarantined: ['warning', 'Con un valor en cuarentena'], valid: ['ok', 'Válida'], warning: ['warning', 'Advertencia'], error: ['error', 'Error'] };

  /** Celda de métrica con su origen: observado (sin marca), calculado, faltante, inválido. */
  function metricCell(key, cell) {
    const esc = H().esc;
    if (!cell) return '<td class="num">—</td>';
    if (cell.source === 'quarantined') return `<td class="num"><span class="val val--invalid">${esc(String(cell.raw === null || cell.raw === undefined ? '' : cell.raw))}</span><span class="src src--invalid">en cuarentena</span></td>`;
    if (cell.source === 'invalid') return `<td class="num"><span class="val val--invalid">${esc(cell.raw)}</span><span class="src src--invalid">inválido</span></td>`;
    if (cell.source === 'missing') return `<td class="num"><span class="val val--missing">—</span><span class="src">${esc(cell.note ? 'no calculable' : 'falta')}</span></td>`;
    const txt = key === 'revenue' ? F().currency(cell.value, 0) : F().metric(key, cell.value);
    return `<td class="num">${esc(txt)}${cell.source === 'calculated' ? '<span class="src src--calc">calc.</span>' : ''}</td>`;
  }

  function renderSettings(state) {
    const esc = H().esc;
    const s = state.settings;
    const imp = C().import;
    $('import-settings').innerHTML = `
      <div class="settings-grid">
        <div class="field"><label for="set-date">Formato de fecha</label>
          <select id="set-date" data-action="set-setting" data-key="dateFormat">
            ${Object.entries(imp.dateFormats).map(([k, l]) => `<option value="${k}" ${k === s.dateFormat ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
          <span class="field__hint">AAAA-MM-DD siempre se acepta. Las fechas con "/" solo se leen si no hay duda o si eliges el orden.</span></div>
        <div class="field"><label for="set-number">Formato numérico</label>
          <select id="set-number" data-action="set-setting" data-key="numberFormat">
            ${Object.entries(imp.numberFormats).map(([k, f]) => `<option value="${k}" ${k === s.numberFormat ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
          </select>
          <span class="field__hint">Separador de miles y decimales de tus archivos.</span></div>
        <div class="field"><label for="set-tol">Tolerancia CR y AOV (%)</label>
          <input id="set-tol" type="number" min="0" max="50" step="0.1" value="${esc(+(s.tolerance * 100).toFixed(4))}" data-action="set-setting" data-key="tolerance">
          <span class="field__hint">Diferencia aceptada entre el valor cargado y el calculado.</span></div>
        <div class="field field--check">
          <label><input type="checkbox" data-action="set-setting" data-key="includeErrorRows" ${s.includeErrorRows ? 'checked' : ''}>
            Importar también filas con errores en métricas</label>
          <span class="field__hint">El valor inválido se guarda marcado como inválido. Filas sin fecha o canal válidos nunca se importan.</span></div>
        <div class="field field--check">
          <label><input type="checkbox" data-action="set-setting" data-key="enableAI" ${s.enableAI !== false ? 'checked' : ''}>
            Habilitar normalización asistida por IA (Cohere)</label>
          <span class="field__hint">Solo se consulta cuando el diccionario estático deja cabeceras sin mapear o campos obligatorios faltantes.</span>
        </div>
        <div class="field">
          <label for="set-ai-prompt">Instrucción extra para la IA (opcional)</label>
          <input id="set-ai-prompt" type="text" data-action="set-setting" data-key="customAIPrompt"
            value="${esc(s.customAIPrompt || '')}"
            placeholder="Ej.: las fechas vienen en formato europeo DD/MM/YYYY">
          <span class="field__hint">Se usa únicamente para resolver el nombre de las columnas; no modifica los valores.</span>
        </div>
      </div>`;
  }

  function renderCards(state) {
    const esc = H().esc;
    $('import-cards').innerHTML = C().dataTypeIds.map((t) => {
      const dt = C().dataTypes[t];
      const col = state.store[t];
      const req = dt.required.map((f) => FP.importer.fieldLabel(f));
      return `<section class="panel upload-card" aria-labelledby="up-${t}">
        <div class="panel__head"><div>
          <h3 class="panel__title" id="up-${t}">${esc(dt.label)}</h3>
          <p class="panel__desc">${esc(dt.description)}</p>
        </div></div>
        <div class="panel__body">
          <p class="upload-card__req"><span class="field__hint">Obligatorias:</span> ${req.map((r) => `<span class="chip">${esc(r)}</span>`).join(' ')}</p>
          <p class="upload-card__cols field__hint">Plantilla: ${esc(dt.template.join(', '))}</p>
          ${dt.id === 'segments' ? '<p class="field__hint">También acepta el <strong>CSV exportado de GA4</strong> tal cual (Fecha, Plataforma, dispositivo, fuente/medio, campaña, landing, nuevo/recurrente, Sesiones, Compras e Ingresos): se convierte solo. Los usuarios no se usan; «(not set)» se muestra como «Sin dato (not set)».</p>' : ''}
          <p class="field__hint">También puedes arrastrar y soltar el archivo sobre esta tarjeta.</p>
          <div class="btn-row">
            <label class="btn btn--primary file-btn">Seleccionar CSV
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple data-action="pick-files" data-type="${t}">
            </label>
            <button type="button" class="btn" data-action="download-template" data-type="${t}">Descargar plantilla</button>
          </div>
          <p class="upload-card__state" data-state="${col.batches.length ? 'ready' : 'empty'}" role="status">${col.batches.length
            ? `${col.batches.length} archivo${col.batches.length === 1 ? '' : 's'}, ${F().integer(col.records.length)} registros guardados`
            : 'Sin archivos cargados'}</p>
        </div>
      </section>`;
    }).join('') + productCard(state);

    $('mock-files').innerHTML = `
      <div class="field"><label for="mock-select">Archivo de prueba</label>
        <select id="mock-select">
          <optgroup label="Datasets generados">${FP.mockCsv.GENERATED.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</optgroup>
          <optgroup label="Casos de calidad">${FP.mockCsv.CASES.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</optgroup>
        </select></div>
      <button type="button" class="btn" data-action="stage-mock">Revisar archivo de prueba</button>
      <button type="button" class="btn" data-action="stage-all-generated">Revisar todos los datasets generados</button>`;
  }

  /** Tarjeta de carga de productos (Fase 8.1): mismo flujo, se guarda en IndexedDB. */
  function productCard(state) {
    const esc = H().esc;
    const dt = C().products.dataType;
    const ok = FP.productStore && FP.productStore.available();
    const m = ok ? FP.productStore.meta : null;
    return `<section class="panel upload-card" aria-labelledby="up-products">
      <div class="panel__head"><div><h3 class="panel__title" id="up-products">${esc(dt.label)}</h3><p class="panel__desc">${esc(dt.description)}</p></div></div>
      <div class="panel__body">
        <p class="upload-card__req"><span class="field__hint">Venta:</span> <span class="chip">Fecha</span> <span class="chip">Canal</span> <span class="chip">SKU</span> <span class="field__hint">recomendadas:</span> <span class="chip chip--soft">Región</span> <span class="chip chip--soft">Estado</span> <span class="chip chip--soft">Ciudad</span> <span class="chip chip--soft">Sucursal</span> <span class="chip chip--soft">Tipo de entrega</span> <span class="field__hint">· Funnel:</span> <span class="chip">Fecha</span> <span class="chip">Canal</span> <span class="chip">SKU</span></p>
        <p class="upload-card__cols field__hint">Venta: ${esc(dt.template.join(', '))}.<br>Funnel: ${esc(C().products.funnelType.template.join(', '))}. Recomendado: un archivo por mes de cada uno.</p>
        ${ok ? '<p class="field__hint">También puedes arrastrar y soltar el archivo sobre esta tarjeta.</p>' : ''}
        <div class="btn-row">
          <label class="btn btn--primary file-btn ${ok ? '' : 'is-disabled'}">Seleccionar CSV (venta o funnel)
            <input type="file" accept=".csv,text/csv,.txt" multiple data-action="pick-files" data-type="products" ${ok ? '' : 'disabled'}></label>
          <button type="button" class="btn" data-action="download-template" data-type="products">Plantilla venta</button>
          <button type="button" class="btn" data-action="download-template" data-type="productFunnel">Plantilla funnel</button>
        </div>
        <p class="upload-card__state" data-state="${!ok ? 'error' : (m && (m.batches || m.funnelBatches) ? 'ready' : 'empty')}" role="status">${!ok ? 'Requiere IndexedDB (no disponible en este navegador).' : m && (m.batches || m.funnelBatches) ? `${m.batches || 0} archivo(s) de venta, ${m.funnelBatches || 0} de funnel · ${F().integer(m.skus)} SKU · ${esc(m.dateMin)} a ${esc(m.dateMax)}` : 'Sin archivos cargados'}</p>
      </div></section>`;
  }

  /**
   * Fase H3 y H5 en la revisión: qué columnas se protegieron (viajaron sin ejemplos) y cuáles quedaron dudosas con su motivo.
   * Solo informa; las columnas dudosas no se asignaron (salvo las marcadas «se asignó»): se pueden asignar a mano en la tabla.
   */
  function aiExtras(a, esc) {
    const prot = Array.isArray(a.protectedColumns) ? a.protectedColumns : [], dub = Array.isArray(a.doubtful) ? a.doubtful : [];
    const lbl = (k) => (FP.importer.fieldLabel ? FP.importer.fieldLabel(k) : k);
    return `${prot.length ? `<div class="note" role="status"><strong>Columnas protegidas:</strong> ${prot.map((p) => `${esc(p.header)} <span class="cell-sub">${esc(p.reason)}</span>`).join(' · ')}. Viajaron a Cohere solo con su encabezado, sin ejemplos.</div>` : ''}
      ${dub.length ? `<div class="note note--warning" role="status"><strong>Columnas dudosas:</strong><ul>${dub.map((d) => `<li><strong>${esc(d.header)}</strong>: ${esc(d.why)}${d.field ? `. Propuesta: ${esc(lbl(d.field))}` : ''}${d.alternatives && d.alternatives.length ? `; alternativas: ${d.alternatives.map((x) => `${esc(lbl(x.field))} (${x.confidence.toFixed(2)})`).join(', ')}` : ''}${d.assigned ? '' : '. No se asignó.'}</li>`).join('')}</ul></div>` : ''}`;
  }

  /**
   * Por qué quedan filas fuera (y, si NINGUNA entra, que se vea sin lugar a dudas). Antes solo decía «N quedan fuera»; un archivo podía
   * parecer importado con cero registros. Usa el conteo por tipo del resumen y, de la muestra de problemas, un ejemplo de cada motivo.
   */
  function rejectionNote(result, out, willImport, esc, F) {
    const byType = (result.summary && result.summary.byType) || {};
    const labels = (FP.config.errorTypes || {});
    const rows = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sample = {};
    (result.issues || []).forEach((i) => { if (i.severity === 'error' && !sample[i.type]) sample[i.type] = i.message; });
    const list = rows.map(([t, n]) => `<li><strong>${esc((labels[t] && labels[t].label) || t)}</strong>: ${F.integer(n)} incidencias${sample[t] ? `. Ejemplo: ${esc(sample[t])}` : ''}</li>`).join('');
    const none = willImport === 0;
    return `<div class="note ${none ? 'note--error' : 'note--warn'}" role="${none ? 'alert' : 'status'}">
      <strong>${none ? 'Ninguna fila se importaría.' : `${F.integer(out)} filas quedarían fuera.`}</strong>
      ${list ? `<ul>${list}</ul>` : ''}
      <p class="field__hint">${none ? 'Revisa el mapeo de columnas y los motivos de arriba; el archivo no se guardará hasta que entre al menos una fila.' : 'Puedes importar el resto ahora; las filas que quedan fuera se listan en el registro del archivo.'}</p></div>`;
  }

  function renderStaging(state) {
    const esc = H().esc, pill = H().pill;
    const box = $('staging');
    const items = state.staging.items;
    const w = state.staging.working;
    const workingHtml = w ? `<div class="stgwork" role="status" aria-live="polite"><p><strong>${esc(w.fileName)}</strong> · ${esc(w.phase)}${w.pct ? ` · ${w.pct} %` : ''}</p><progress max="100" value="${w.pct || 0}" aria-label="Avance"></progress><p class="field__hint">Se procesa en segundo plano: RevNavigator sigue respondiendo y puedes seguir usándolo.</p></div>` : '';
    if (!items.length) {
      box.innerHTML = workingHtml + `<div class="empty"><strong>No hay archivos en revisión</strong>Selecciona un CSV o XLSX en cualquiera de las tres cargas. Nada se guarda hasta que confirmes la importación.</div>`;
      return;
    }
    const active = items.find((i) => i.staged.id === state.staging.activeId) || items[0];
    if (active.staged.dataType === 'products') {
      const tabsP = items.length > 1 ? `<div class="file-tabs" role="tablist">${items.map((i) => `<button type="button" role="tab" aria-selected="${i === active}" data-action="select-staged" data-id="${i.staged.id}">${esc(i.staged.fileName)}</button>`).join('')}</div>` : '';
      box.innerHTML = workingHtml + tabsP + FP.productView.renderStaging(state, active);
      return;
    }
    const { staged, result } = active;
    const sum = result.summary;
    // Resultado del Worker: solo trae una vista previa; la cuenta de filas que entrarán la calculó él para cada opción
    const willImport = result.remote ? (state.settings.includeErrorRows ? result.willImport.withErrors : result.willImport.strict) : FP.importer.selectRows(result, { includeErrorRows: state.settings.includeErrorRows }).length;
    const issuesTotal = result.remote ? result.issuesTotal : result.issues.length;

    const tabs = items.length > 1 ? `<div class="file-tabs" role="tablist">${items.map((i) => {
      const isP = i.staged.dataType === 'products';
      const bad = isP ? Boolean(i.result && i.result.mappingIssues.length) : i.result.mappingIssues.length || i.result.summary.error;
      return `<button type="button" role="tab" aria-selected="${i === active}" data-action="select-staged" data-id="${i.staged.id}">
        ${esc(i.staged.fileName)} <span class="cell-sub">${esc(isP ? C().products.dataType.label : C().dataTypes[i.staged.dataType].label)}${bad ? ', con problemas' : ''}</span></button>`;
    }).join('')}</div>` : '';

    // Detección de fechas
    const dd = staged.dateDetection;
    let dateNote = '';
    if (dd && dd.slash) {
      const cls = dd.suggestion && dd.suggestion !== 'auto' && dd.suggestion !== state.settings.dateFormat ? 'warning' : dd.suggestion ? '' : 'warning';
      dateNote = `<p class="note ${cls ? 'note--' + cls : ''}">${esc(dd.reason)}
        ${dd.suggestion && dd.suggestion !== 'auto' && dd.suggestion !== state.settings.dateFormat
          ? ` <button type="button" class="btn btn--small" data-action="apply-date-format" data-value="${dd.suggestion}">Usar ${esc(C().import.dateFormats[dd.suggestion])}</button>` : ''}</p>`;
    }

    // Mapeo
    const fieldOptions = (sel) => `<option value="">Ignorar columna</option>` + C().importFields.map((f) => {
      const req = C().dataTypes[staged.dataType].required.includes(f.key);
      return `<option value="${f.key}" ${f.key === sel ? 'selected' : ''}>${esc(f.label)}${req ? ' (obligatoria)' : ''}</option>`;
    }).join('');
    const mappingRows = staged.parsed.headers.map((h) => {
      const samples = staged.parsed.rows.slice(0, 3).map((r) => r.values[h]).filter((v) => v !== '');
      const suggested = FP.importer.suggestField(h);
      const current = staged.mapping[h];
      return `<tr>
        <td><strong>${esc(h)}</strong></td>
        <td class="wrap"><span class="cell-sub">${esc(samples.join(', ') || '(vacía)')}</span></td>
        <td><select data-action="set-mapping" data-header="${esc(h)}" aria-label="Campo para ${esc(h)}">${fieldOptions(current)}</select>
          ${current && current !== suggested ? '<span class="cell-sub">cambiado por ti</span>' : ''}${!current && suggested ? '<span class="cell-sub">sugerido: ' + esc(FP.importer.fieldLabel(suggested)) + '</span>' : ''}</td>
      </tr>`;
    }).join('');
    // Fase B · tipo de dataset detectado (determinístico) y aviso si el archivo parece de otra sección
    const det = active.staged.detection;
    const TARGET = { actual: 'Venta real', historical: 'Histórico', plan: 'Plan / Meta', segments: 'Segmentos', products: 'Categoría → Producto' };
    const cur = active.staged.dataType;
    const retype = `<span class="dsdetect__fix"><label for="stg-retype">Cargar como</label>
        <select id="stg-retype" data-action="staging-retype">${Object.entries(TARGET).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        ${det && det.targetMismatch && det.suggestedTarget ? `<button type="button" class="btn btn--small" data-action="staging-retype" data-value="${esc(det.suggestedTarget)}">Mover a ${esc(TARGET[det.suggestedTarget] || det.suggestedTarget)}</button>` : ''}</span>`;
    const detLine = det ? `<div class="field__hint dsdetect"><p>Tipo detectado: <strong>${esc(det.label)}</strong> (${Math.round(det.confidence * 100)} % de confianza${det.ambiguous ? `; también podría ser ${det.alternatives.map((a) => esc((FP.canonical.profile(a.datasetType) || {}).label || a.datasetType)).join(' o ')}` : ''}).${det.detectionMethod === 'ai-assisted' ? ` <strong>Resuelto con ayuda de la IA</strong> (solo con los encabezados): ${esc(det.aiReason || 'sin detalle')}.` : ''}${det.aiNote ? ` <span class="field__hint">${esc(det.aiNote)}</span>` : ''}${det.correctedFrom ? ` Sección corregida por ti (antes: ${esc(TARGET[det.correctedFrom] || det.correctedFrom)}).` : ''}${det.targetMismatch ? ` <span class="dsdetect__warn">Parece un archivo de ${esc(TARGET[det.suggestedTarget] || det.suggestedTarget)}.</span>` : ''}</p>${retype}</div>` : '';
    const mapIssues = result.mappingIssues.length
      ? `<ul class="issues issues--block">${result.mappingIssues.map((i) => `<li>${pill('error', C().errorTypes[i.type].label)} <span>${esc(i.message)}</span></li>`).join('')}</ul>`
      : `<p class="note note--ok">Mapeo completo: todas las columnas obligatorias tienen campo.</p>`;

    // Preview
    const preview = result.rows.slice(0, C().import.previewRows).map((r) => {
      const [cls, txt] = ROW_STATUS[r.status];
      const rec = r.record;
      return `<tr>
        <td class="num">${r.line}</td>
        <td>${rec.date ? esc(rec.date) : `<span class="val val--invalid">${esc(r.raw[rec.provenance.columns.date] || '(vacía)')}</span>`}</td>
        <td>${rec.channel ? esc(rec.channel) : `<span class="val val--invalid">${esc(r.raw[rec.provenance.columns.channel] || '(vacío)')}</span>`}</td>
        ${C().metricKeys.map((k) => metricCell(k, rec.metrics[k])).join('')}
        <td>${pill(cls, `${r.status === 'valid' ? '✓ ' : ''}${txt}`)}${r.keyValid ? '' : '<span class="cell-sub">no se importará</span>'}</td>
      </tr>`;
    }).join('');

    // Issues
    const sev = state.staging.issueFilter;
    const shown = result.issues.filter((i) => sev === 'all' || i.severity === sev);
    const limit = 300;
    const issuesTable = issuesTotal ? `
      <div class="subhead"><h4>Errores y advertencias (${F().integer(issuesTotal)})</h4>
        ${H().segmented('issue-filter', [['all', 'Todos'], ['error', 'Errores'], ['warning', 'Advertencias']], sev)}</div>
      <div class="table-wrap table-wrap--tall"><table class="table ds-table">
        <thead><tr><th class="num">Fila</th><th>Tipo</th><th>Severidad</th><th>Campo</th><th>Valor</th><th>Mensaje</th></tr></thead>
        <tbody>${shown.slice(0, limit).map((i) => `<tr>
          <td class="num">${i.row ?? '—'}</td><td>${esc(C().errorTypes[i.type].label)}<span class="cell-sub">${esc(i.type)}</span></td>
          <td>${pill(i.severity, i.severity === 'error' ? 'Error' : 'Advertencia')}</td>
          <td>${esc(i.field ?? '—')}</td><td>${esc(i.value ?? '—')}</td><td class="wrap">${esc(i.message)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${shown.length > limit ? `<p class="field__hint">Se muestran ${limit} de ${F().integer(shown.length)}. Exporta los errores completos en Datos normalizados después de importar.</p>` : ''}`
      : '<p class="note note--ok">Sin errores ni advertencias.</p>';

    box.innerHTML = `
      ${workingHtml}${tabs}
      <div class="staging">
        <div class="staging__head">
          <div>
            <h3 class="panel__title">${esc(staged.fileName)}</h3>
            <p class="panel__desc">${F().integer(sum.rows)} filas, ${staged.parsed.headers.length} columnas${staged.parsed.delimiter ? `, separador "${staged.parsed.delimiter === '\t' ? 'tabulador' : esc(staged.parsed.delimiter)}"` : ''}.
              ${staged.parsed.warnings.map(esc).join(' ')}</p>
          </div>
          <div class="field"><label for="stg-type" class="field__hint">Tipo de dato</label>
            <select id="stg-type" data-action="set-staged-type">${C().dataTypeIds.map((t) =>
              `<option value="${t}" ${t === staged.dataType ? 'selected' : ''}>${esc(C().dataTypes[t].label)}</option>`).join('')}</select></div>
        </div>

        <ol class="steps">
          <li><h4>Mapeo de columnas</h4>
            ${dateNote}
            ${staged.aiMapping ? (() => {
              const a = staged.aiMapping;
              const mapped = Array.isArray(a.mapped) ? a.mapped : [];
              const unmapped = Array.isArray(a.unmapped) ? a.unmapped : [];
              const errors = Array.isArray(a.errors) ? a.errors : [];
              if (a.usedAI && mapped.length) {
                return `<div class="note"><strong>Mapeo semántico con IA:</strong> ${mapped.length} cabecera${mapped.length === 1 ? '' : 's'} resuelta${mapped.length === 1 ? '' : 's'} con Cohere. Revisa el selector antes de importar.${unmapped.length ? ` ${unmapped.length} quedó sin resolver.` : ''}${errors.length ? ` ${esc(errors.join(' '))}` : ''}</div>`;
              }
              if (a.status === 'unavailable' || a.status === 'invalid') {
                return `<div class="note note--warning"><strong>IA no disponible:</strong> ${esc((a.errors || []).join(' ') || 'se conserva el mapeo estático.')}</div>`;
              }
              return unmapped.length ? `<div class="note note--warning">Cabeceras sin equivalencia automática: ${esc(unmapped.join(', '))}. Puedes asignarlas manualmente.</div>` : '';
            })() : ''}
            ${staged.aiMapping ? aiExtras(staged.aiMapping, esc) : ''}
            <div class="table-wrap"><table class="table ds-table">
              <thead><tr><th>Columna del archivo</th><th>Ejemplos</th><th>Campo en la app</th></tr></thead>
              <tbody>${mappingRows}</tbody></table></div>
            ${detLine}${mapIssues}</li>

          <li><h4>Validación</h4>
            <dl class="kpis">
              <div><dt>Filas leídas</dt><dd class="num">${F().integer(sum.rows)}</dd></div>
              <div><dt>Válidas</dt><dd class="num">${F().integer(sum.valid)}</dd></div>
              <div><dt>Con advertencias</dt><dd class="num">${F().integer(sum.warning)}</dd></div>
              <div><dt>Con errores</dt><dd class="num">${F().integer(sum.error)}</dd></div>
              <div><dt>Sin fecha o canal válidos</dt><dd class="num">${F().integer(sum.invalidKey)}</dd></div>
              <div><dt>Duplicados</dt><dd class="num">${F().integer(sum.duplicates)}</dd></div>
            </dl></li>

          <li><h4>Vista previa (primeras ${Math.min(C().import.previewRows, result.rows.length)} filas normalizadas)</h4>
            <div class="table-wrap"><table class="table ds-table">
              <thead><tr><th class="num">Fila</th><th>Fecha</th><th>Canal</th><th class="num">Venta</th><th class="num">Pedidos</th>
                <th class="num">Volumen</th><th class="num">CR</th><th class="num">AOV</th><th>Estado</th></tr></thead>
              <tbody>${preview}</tbody></table></div>
            <p class="field__hint">"calc." = calculado por la app; "falta" = celda vacía (no es cero); "inválido" = texto que no se pudo leer.</p></li>

          <li>${issuesTable}</li>
        </ol>

        <div class="staging__foot">
          <p>${result.canImport
            ? `Se importarán <strong>${F().integer(willImport)}</strong> de ${F().integer(sum.rows)} filas como ${esc(C().dataTypes[staged.dataType].label)}.${sum.rows - willImport ? ` ${F().integer(sum.rows - willImport)} quedan fuera y sus errores se guardan en el registro del archivo.` : ''}`
            : 'Corrige el mapeo para poder importar.'}</p>
          ${result.canImport && sum.rows - willImport > 0 ? rejectionNote(result, sum.rows - willImport, willImport, esc, F()) : ''}
          <div class="btn-row">
            <button type="button" class="btn" data-action="discard-staged">Descartar archivo</button>
            <button type="button" class="btn btn--primary" data-action="commit-staged" ${result.canImport && willImport && !active.busy ? '' : 'disabled'}>${active.busy ? 'Procesando… ' : ''}Importar ${F().integer(willImport)} filas</button>
          </div>
        </div>
      </div>`;
  }

  function render(state) {
    renderSettings(state);
    renderCards(state);
    renderStaging(state);
  }

  FP.importView = { render, renderStaging, metricCell };
})(typeof window !== 'undefined' ? window : globalThis);
