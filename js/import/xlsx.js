/**
 * xlsx.js — lector XLSX mínimo, sin librerías externas.
 *
 * Convierte la primera hoja de un .xlsx a la misma estructura que FP.csv.parse:
 * { headers, rows, delimiter: null, warnings }.
 *
 * Usa APIs estándar del navegador (DecompressionStream) para entradas DEFLATE.
 * No ejecuta macros ni fórmulas; lee el valor almacenado de las celdas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  function decodeUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  function localEntries(bytes) {
    // Preferimos el directorio central: en XLSX reales los tamaños del encabezado
    // local pueden ser 0 cuando el ZIP usa data descriptors (bit 3).
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd >= 0) {
      const count = u16(bytes, eocd + 10);
      const centralOffset = u32(bytes, eocd + 16);
      const out = [];
      let p = centralOffset;
      for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
        if (u32(bytes, p) !== 0x02014b50) break;
        const method = u16(bytes, p + 10);
        const compressedSize = u32(bytes, p + 20);
        const nameLen = u16(bytes, p + 28);
        const extraLen = u16(bytes, p + 30);
        const commentLen = u16(bytes, p + 32);
        const localOffset = u32(bytes, p + 42);
        const name = decodeUtf8(bytes.slice(p + 46, p + 46 + nameLen));
        if (localOffset + 30 <= bytes.length && u32(bytes, localOffset) === 0x04034b50) {
          const localNameLen = u16(bytes, localOffset + 26);
          const localExtraLen = u16(bytes, localOffset + 28);
          const dataStart = localOffset + 30 + localNameLen + localExtraLen;
          out.push({ name, method, compressedSize, dataStart });
        }
        p += 46 + nameLen + extraLen + commentLen;
      }
      if (out.length) return out;
    }
    const out = [];
    let p = 0;
    while (p + 30 <= bytes.length) {
      if (u32(bytes, p) !== 0x04034b50) break;
      const flags = u16(bytes, p + 6);
      const method = u16(bytes, p + 8);
      const compressedSize = u32(bytes, p + 18);
      const nameLen = u16(bytes, p + 26);
      const extraLen = u16(bytes, p + 28);
      const name = decodeUtf8(bytes.slice(p + 30, p + 30 + nameLen));
      const dataStart = p + 30 + nameLen + extraLen;
      if (flags & 0x08) throw new Error('El XLSX usa un descriptor ZIP sin directorio central legible.');
      out.push({ name, method, compressedSize, dataStart });
      p = dataStart + compressedSize;
    }
    return out;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Este navegador no soporta descompresión XLSX nativa (DecompressionStream).');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readEntry(bytes, entry) {
    const raw = bytes.slice(entry.dataStart, entry.dataStart + entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRaw(raw);
    throw new Error(`Compresión XLSX no soportada en "${entry.name}" (método ${entry.method}).`);
  }

  const xml = (bytes) => new DOMParser().parseFromString(decodeUtf8(bytes), 'application/xml');

  function colToIndex(ref) {
    const m = String(ref || '').match(/^([A-Z]+)/i);
    if (!m) return 0;
    let n = 0;
    for (const c of m[1].toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
    return n - 1;
  }

  function textOf(el) {
    return el ? Array.from(el.getElementsByTagName('*')).filter((n) => n.localName === 't').map((n) => n.textContent || '').join('') : '';
  }

  function cellValue(cell, sharedStrings) {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') return textOf(cell);
    const v = Array.from(cell.children).find((n) => n.localName === 'v');
    if (!v) return '';
    const raw = v.textContent || '';
    if (type === 's') return sharedStrings[Number(raw)] ?? '';
    if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
    if (type === 'str' || type === 'e') return raw;
    return raw;
  }

  function readDateStyleIds(stylesDoc) {
    if (!stylesDoc) return new Set();
    const custom = new Map();
    Array.from(stylesDoc.getElementsByTagName('*')).filter((n) => n.localName === 'numFmt')
      .forEach((n) => custom.set(Number(n.getAttribute('numFmtId')), String(n.getAttribute('formatCode') || '')));
    // Solo los <xf> dentro de <cellXfs>: el atributo «s» de una celda indexa esa lista. Antes se juntaban también los de
    // <cellStyleXfs>, el índice se corría y las fechas llegaban como número de serie (p. ej. 46266) → «Fecha inválida».
    const cellXfs = Array.from(stylesDoc.getElementsByTagName('*')).find((n) => n.localName === 'cellXfs');
    const xfs = cellXfs ? Array.from(cellXfs.children).filter((n) => n.localName === 'xf') : Array.from(stylesDoc.getElementsByTagName('*')).filter((n) => n.localName === 'xf');
    const ids = new Set();
    const isDateCode = (code) => /(^|[^a-z])yy|dd|mm|hh|ss/i.test(String(code || '').replace(/\[[^\]]+\]/g, ''));
    xfs.forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if ((id >= 14 && id <= 22) || isDateCode(custom.get(id))) ids.add(i);
    });
    return ids;
  }

  function excelSerialToISO(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return String(n);
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return Number.isNaN(d.getTime()) ? String(n) : d.toISOString().slice(0, 10);
  }

  function workbookSheetTarget(workbookDoc) {
    const sheets = Array.from(workbookDoc.getElementsByTagName('*')).filter((n) => n.localName === 'sheet');
    if (!sheets.length) throw new Error('El XLSX no contiene hojas.');
    const relId = sheets[0].getAttribute('r:id') || sheets[0].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = Array.from(workbookDoc.getElementsByTagName('*')).filter((n) => n.localName === 'Relationship');
    const rel = rels.find((r) => r.getAttribute('Id') === relId);
    const target = rel ? rel.getAttribute('Target') : null;
    if (!target) return 'xl/worksheets/sheet1.xml';
    return target.replace(/^\/+/, '').replace(/^\.\//, '').startsWith('xl/')
      ? target.replace(/^\/+/, '').replace(/^\.\//, '')
      : `xl/${target.replace(/^\/+/, '').replace(/^\.\//, '')}`;
  }

  async function parse(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 4 || u32(bytes, 0) !== 0x04034b50) throw new Error('El archivo no parece ser un XLSX válido.');
    const entries = localEntries(bytes);
    const byName = new Map(entries.map((e) => [e.name, e]));
    const workbookEntry = byName.get('xl/workbook.xml');
    if (!workbookEntry) throw new Error('XLSX inválido: falta xl/workbook.xml.');

    const workbookDoc = xml(await readEntry(bytes, workbookEntry));
    const sheetTarget = workbookSheetTarget(workbookDoc);
    const sheetEntry = byName.get(sheetTarget) || byName.get('xl/worksheets/sheet1.xml');
    if (!sheetEntry) throw new Error('XLSX inválido: no se encontró la primera hoja.');

    const sharedStrings = [];
    const stylesEntry = byName.get('xl/styles.xml');
    const stylesDoc = stylesEntry ? xml(await readEntry(bytes, stylesEntry)) : null;
    const dateStyleIds = readDateStyleIds(stylesDoc);
    const ssEntry = byName.get('xl/sharedStrings.xml');
    if (ssEntry) {
      const ssDoc = xml(await readEntry(bytes, ssEntry));
      const si = Array.from(ssDoc.getElementsByTagName('*')).filter((n) => n.localName === 'si');
      si.forEach((node) => sharedStrings.push(textOf(node)));
    }

    const sheetDoc = xml(await readEntry(bytes, sheetEntry));
    const cellNodes = Array.from(sheetDoc.getElementsByTagName('*')).filter((n) => n.localName === 'c');
    const matrix = [];
    let maxCol = 0;

    cellNodes.forEach((cell) => {
      const ref = cell.getAttribute('r') || '';
      const rowMatch = ref.match(/\d+/);
      if (!rowMatch) return;
      const rowIndex = Math.max(0, Number(rowMatch[0]) - 1);
      const colIndex = colToIndex(ref);
      let value = cellValue(cell, sharedStrings);
      const styleId = Number(cell.getAttribute('s') || 0);
      // número con estilo de fecha → AAAA-MM-DD. Muchos programas (openpyxl, exportes de Google Sheets) escriben t="n" explícito.
      const t = cell.getAttribute('t');
      if ((!t || t === 'n') && dateStyleIds.has(styleId) && value !== '') value = excelSerialToISO(value);
      if (!matrix[rowIndex]) matrix[rowIndex] = [];
      matrix[rowIndex][colIndex] = value;
      maxCol = Math.max(maxCol, colIndex);
    });

    const rows = matrix.filter(Boolean).map((r) => {
      const out = new Array(maxCol + 1).fill('');
      r.forEach((v, i) => { out[i] = v === undefined || v === null ? '' : String(v); });
      return out;
    });

    if (!rows.length) return { headers: [], rows: [], delimiter: null, warnings: ['El archivo XLSX está vacío.'] };

    const headerRow = rows.findIndex((r) => r.some((v) => String(v).trim() !== ''));
    if (headerRow < 0) return { headers: [], rows: [], delimiter: null, warnings: ['El archivo XLSX está vacío.'] };

    const seen = {};
    const headers = rows[headerRow].map((h) => {
      let name = String(h || '').trim() || 'columna_sin_nombre';
      if (seen[name]) { seen[name]++; name = `${name} (${seen[name]})`; } else seen[name] = 1;
      return name;
    });

    const outRows = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (r.every((v) => String(v || '').trim() === '')) continue;
      const values = {};
      headers.forEach((h, j) => { values[h] = r[j] === undefined ? '' : String(r[j]); });
      outRows.push({ line: i + 1, values, cellCount: r.length });
    }

    return {
      headers,
      rows: outRows,
      delimiter: null,
      warnings: outRows.length ? [] : ['El archivo solo tiene encabezados.']
    };
  }

  FP.xlsx = { parse };
})(typeof window !== 'undefined' ? window : globalThis);
