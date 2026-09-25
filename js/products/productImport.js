/**
 * productImport.js — Carga de productos integrada al flujo de Fase 1 (Fase 8.1).
 *
 * Mismo recorrido que cualquier archivo: seleccionar → vista previa → mapeo → validación → resumen →
 * confirmación → persistencia → resultado. Diferencia técnica: para millones de filas no se crea un objeto
 * por fila; se lee el texto por partes, se valida con las reglas de FP.normalize (con caché) y se arman
 * directamente los bloques día × canal (FP.productStore.createDraft). Cada lote cede el hilo a la interfaz.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const PS = () => FP.productStore;

  /** Siguiente fila a partir de `pos`: { cells, next } o null al final. Soporta comillas y saltos dentro. */
  function readRow(text, pos, delim) {
    const len = text.length;
    if (pos >= len) return null;
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = len;
    let line = text.slice(pos, nl);
    if (line.indexOf('"') < 0) {
      if (line.endsWith('\r')) line = line.slice(0, -1);
      return { cells: line.split(delim), next: nl + 1, raw: line };
    }
    // Con comillas: parser por caracteres hasta cerrar la fila
    const cells = [];
    let field = '', inQ = false, i = pos;
    for (; i < len; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c;
      } else if (c === '"' && field === '') inQ = true;
      else if (c === delim) { cells.push(field); field = ''; }
      else if (c === '\n') break;
      else if (c !== '\r') field += c;
    }
    cells.push(field);
    return { cells, next: i + 1, raw: text.slice(pos, i) };
  }

  /** Paso 1: encabezados, separador, primeras filas y mapeo sugerido. No procesa todo el archivo. */
  function stage(text, { fileName = 'productos.csv', kind = null } = {}) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const delim = FP.csv.detectDelimiter(clean);
    let pos = 0, line = 0;
    let head = null;
    while (!head) {
      const r = readRow(clean, pos, delim);
      if (!r) break;
      pos = r.next; line++;
      if (r.cells.some((x) => x.trim() !== '')) head = r;
    }
    const headers = head ? head.cells.map((h, i) => h.trim() || `columna_${i + 1}`) : [];
    const preview = [];
    let p = pos, ln = line;
    while (preview.length < C().products.previewRows) {
      const r = readRow(clean, p, delim);
      if (!r) break;
      p = r.next; ln++;
      if (r.cells.every((x) => x.trim() === '')) continue;
      preview.push({ line: ln, cells: r.cells });
    }
    const approxRows = Math.max(0, Math.round((clean.length - pos) / Math.max(1, (p - pos) / Math.max(1, preview.length))));
    const k = kind || PS().detectKind(headers);
    return {
      id: `stg-p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, dataType: 'products', kind: k, fileName, text: clean, delimiter: delim,
      headerEnd: pos, headerLine: line, headers, preview, approxRows, mapping: PS().suggestMapping(headers, k),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Paso 2: valida y arma el borrador completo (asíncrono, por lotes).
   * @returns { draft, mappingIssues, canImport, summary, stored, elapsedMs }
   */
  async function process(staged, { settings = {}, onProgress = null, chunkRows = C().products.chunkRows } = {}) {
    const t0 = Date.now();
    const kind = staged.kind || 'sales';
    const mappingIssues = PS().validateMapping(staged.mapping, kind);
    if (mappingIssues.length) return { draft: null, mappingIssues, canImport: false, summary: null, elapsedMs: 0 };
    const draft = PS().createDraft(staged.headers, staged.mapping, { kind, dateFormat: settings.dateFormat || 'auto', numberFormat: settings.numberFormat || 'dot' });
    const text = staged.text, delim = staged.delimiter, total = text.length;
    let pos = staged.headerEnd, line = staged.headerLine, n = 0;
    const expected = staged.headers.length;
    for (;;) {
      const r = readRow(text, pos, delim);
      if (!r) break;
      pos = r.next; line++;
      if (r.cells.length === 1 && r.cells[0].trim() === '') continue;
      if (r.cells.length !== expected) draft.issues.add('MALFORMED_ROW', 'warning', line, '', r.cells.length, `La fila tiene ${r.cells.length} columnas y el encabezado ${expected}.`);
      draft.addRow(line, r.cells);
      if (++n % chunkRows === 0) {
        if (onProgress) onProgress(pos / total);
        await FP.idb.yieldToUI();
      }
    }
    if (onProgress) onProgress(1);
    // Multiplicidad válida: misma llave con distinta "otra dimensión" (se suma, no se elimina)
    let multiplicity = 0;
    if (draft.hasExtra) draft.parts.forEach((cells) => {
      const per = new Map();
      cells.forEach((c) => { const k = `${c.sku}|${c.stateIdx}|${c.branch}|${c.deliveryIdx}`; per.set(k, (per.get(k) || 0) + 1); });
      per.forEach((k) => { if (k > 1) multiplicity++; });
    });
    draft.summary.multiplicity = multiplicity;
    if (multiplicity) draft.issues.add('VALID_MULTIPLICITY', 'info', null, 'dimensión adicional', multiplicity, `${multiplicity} SKU-días traen varias filas por la dimensión adicional: se conservan y se suman en el SKU-día.`);
    // Periodo incompleto: días del rango sin datos por canal
    const dates = [...draft.dates].sort();
    if (dates.length) {
      const all = [];
      for (let d = dates[0]; d <= dates[dates.length - 1]; d = FP.calendar.addDays(d, 1)) all.push(d);
      draft.channels.forEach((ch) => {
        const miss = all.filter((d) => !draft.parts.has(`${d}|${ch}`));
        if (miss.length) draft.issues.add('PERIOD_INCOMPLETE', 'warning', null, 'fecha', `${ch}: ${miss.length} días`, `${ch} no tiene filas en ${miss.length} de ${all.length} días del rango (${miss.slice(0, 3).join(', ')}${miss.length > 3 ? '…' : ''}).`);
      });
    }
    const stored = PS().available() ? await PS().compareWithStored(draft) : null;
    return {
      draft, mappingIssues, canImport: draft.summary.accepted > 0, stored,
      summary: { ...draft.summary, kind, skus: draft.catalog.size, dates: draft.dates.size, channels: [...draft.channels].sort(),
        states: draft.states.size, branches: draft.branches.size, deliveries: [...draft.deliveries].map((i) => PS().deliveryLabel(PS().dims.deliveries[i])),
        dateMin: [...draft.dates].sort()[0] || null, dateMax: [...draft.dates].sort().pop() || null,
        mappedMetrics: draft.mappedMetrics, issuesByType: draft.issues.byType },
      elapsedMs: Date.now() - t0
    };
  }

  /** Vista previa normalizada de las primeras filas (sin guardar). */
  function previewRecords(staged, settings = {}) {
    const kind = staged.kind || 'sales';
    if (PS().validateMapping(staged.mapping, kind).some((i) => ['date', 'channel', 'sku'].includes(i.field) && i.type === 'MISSING_REQUIRED_COLUMN')) return [];
    const d = PS().createDraft(staged.headers, staged.mapping, { ...settings, kind });
    return staged.preview.map((r) => {
      const before = { ...d.summary };
      const ex = d.issues.examples.length;
      d.addRow(r.line, r.cells);
      const issues = d.issues.examples.slice(ex);
      const accepted = d.summary.accepted > before.accepted;
      const dup = d.summary.exactDuplicates > before.exactDuplicates ? 'exact' : d.summary.conflicts > before.conflicts ? 'conflict' : null;
      const idx = d.idx;
      const get = (k) => (idx[k] === undefined ? '' : String(r.cells[idx[k]] || '').trim());
      const metrics = {};
      PS().metricsOf(kind).forEach((m) => { metrics[m] = idx[m] === undefined ? { state: 'unavailable', value: null } : (() => { const c = PS().numberCell(r.cells[idx[m]], settings.numberFormat || 'dot'); return { state: ['observed', 'missing', 'invalid'][c.state], value: Number.isFinite(c.value) ? c.value : null, raw: c.raw }; })(); });
      return { line: r.line, date: get('date'), channel: get('channel'), sku: get('sku'), product: get('product'), category: get('category'), subcategory: get('subcategory'),
        state: get('state'), branch: get('branch'), delivery: get('delivery'),
        metrics, accepted, duplicate: dup, issues };
    });
  }

  FP.productImport = { readRow, stage, process, previewRecords };
})(typeof window !== 'undefined' ? window : globalThis);
