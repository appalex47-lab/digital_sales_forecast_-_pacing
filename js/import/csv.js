/**
 * csv.js — Lectura de CSV → RAW DATA (Fase 1).
 *
 * Paso 1 del flujo: CSV → RAW → VALIDATION → NORMALIZATION → CANONICAL → APP.
 * Aquí NO se interpreta ningún valor: todo sale como texto tal cual venía.
 *
 * Soporta: BOM UTF-8, CRLF/LF, campos entre comillas con comas, saltos de línea
 * y comillas escapadas (""), delimitadores , ; tab |.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  /** Cuenta delimitadores fuera de comillas en una línea. */
  function countOutsideQuotes(line, ch) {
    let n = 0, inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === ch) n++;
    }
    return n;
  }

  /** Elige el delimitador más frecuente en la primera línea no vacía. */
  function detectDelimiter(text, candidates = FP.config.import.delimiters) {
    const first = (text.split(/\r?\n/).find((l) => l.trim() !== '') || '');
    let best = ',', bestN = 0;
    candidates.forEach((d) => {
      const n = countOutsideQuotes(first, d);
      if (n > bestN) { best = d; bestN = n; }
    });
    return best;
  }

  /**
   * Parser de estado finito. Devuelve filas como arreglos de texto y el número
   * de línea física donde empieza cada fila (para reportar errores como en Excel).
   */
  function parseRows(text, delimiter) {
    const rows = [];
    const lines = [];
    let field = '', row = [], inQ = false, line = 1, rowStart = 1;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { pushField(); rows.push(row); lines.push(rowStart); row = []; };

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else {
          if (c === '\n') line++;
          field += c;
        }
      } else if (c === '"' && field === '') {
        inQ = true;
      } else if (c === delimiter) {
        pushField();
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        pushRow();
        line++;
        rowStart = line;
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) pushRow();
    return { rows, lines };
  }

  /**
   * Texto CSV → { headers, rows: [{ line, values: {header: texto}, cellCount }], delimiter, warnings }
   * Omite líneas vacías. Encabezados repetidos se renombran "x (2)".
   */
  function parse(text, { delimiter = null } = {}) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const delim = delimiter || detectDelimiter(clean);
    const { rows, lines } = parseRows(clean, delim);
    const warnings = [];

    let hIdx = rows.findIndex((r) => r.some((v) => v.trim() !== ''));
    if (hIdx < 0) return { headers: [], rows: [], delimiter: delim, warnings: ['El archivo está vacío.'] };

    const seen = {};
    const headers = rows[hIdx].map((h) => {
      let name = h.trim() || 'columna_sin_nombre';
      if (seen[name]) { seen[name]++; name = `${name} (${seen[name]})`; } else seen[name] = 1;
      return name;
    });

    const out = [];
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.every((v) => v.trim() === '')) continue;
      const values = {};
      headers.forEach((h, j) => { values[h] = r[j] !== undefined ? r[j] : ''; });
      out.push({ line: lines[i], values, cellCount: r.length });
    }
    if (!out.length) warnings.push('El archivo solo tiene encabezados.');
    return { headers, rows: out, delimiter: delim, warnings };
  }

  /** Arreglo de objetos → CSV (RFC 4180). Usado por plantillas y exportación CSV. */
  function stringify(headers, records, { delimiter = ',', bom = true } = {}) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(delimiter)];
    records.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(delimiter)));
    return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
  }

  FP.csv = { detectDelimiter, parse, stringify };
})(typeof window !== 'undefined' ? window : globalThis);
