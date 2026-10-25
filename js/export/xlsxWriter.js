/**
 * xlsxWriter.js — Escritor mínimo de .xlsx, sin dependencias (un .xlsx es un ZIP de XML; usa FP.zip.create).
 * Solo lo necesario para una hoja de datos legible: texto, números, fechas, porcentajes y moneda con formato real, encabezado con relleno,
 * anchos de columna, filas y columnas congeladas, autofiltro y ajuste de texto. Las cadenas van en línea (inlineStr), sin tabla compartida.
 *
 *   build({ sheets: [{ name, cols: [ancho], rows: [[celda]], freeze: { row, col }, autofilter: 'A6:P40' }] }) → Uint8Array
 *   celda = null | string | number | { v, f: 'text'|'int'|'dec'|'pct'|'money'|'date'|'head'|'title'|'note' }
 *   download(fileName, bytes) descarga el archivo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  // Estilos (índice = cellXfs). 0 texto, 1 encabezado, 2 entero, 3 decimal, 4 porcentaje, 5 moneda, 6 fecha, 7 título, 8 nota, 9 texto con ajuste
  const FORMATS = { text: 0, head: 1, int: 2, dec: 3, pct: 4, money: 5, date: 6, title: 7, note: 8, wrap: 9 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="yyyy\\-mm\\-dd"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF59677B"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F5FE0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');   // caracteres que XML 1.0 no admite
  function colName(i) { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  const serial = (iso) => { const t = Date.parse(`${iso}T00:00:00Z`); return Number.isFinite(t) ? Math.round(t / 86400000) + 25569 : null; };   // días desde 1899-12-30

  function cellXml(c, r, i) {
    if (c === null || c === undefined || c === '') return '';
    const ref = colName(i) + (r + 1);
    const o = typeof c === 'object' && c !== null && 'v' in c ? c : { v: c };
    const f = o.f && FORMATS[o.f] !== undefined ? o.f : (typeof o.v === 'number' ? 'dec' : 'text');
    const s = FORMATS[f] ? ` s="${FORMATS[f]}"` : '';
    if (o.v === null || o.v === undefined || o.v === '') return s ? `<c r="${ref}"${s}/>` : '';
    if (f === 'date') { const n = serial(o.v); return n === null ? `<c r="${ref}" t="inlineStr"><is><t>${esc(o.v)}</t></is></c>` : `<c r="${ref}"${s}><v>${n}</v></c>`; }
    if (typeof o.v === 'number') return Number.isFinite(o.v) ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
  }

  function sheetXml(sh) {
    const rows = sh.rows || [], cols = sh.cols || [];
    const fr = sh.freeze || null;
    const pane = fr && (fr.row || fr.col) ? `<sheetViews><sheetView workbookViewId="0"><pane${fr.col ? ` xSplit="${fr.col}"` : ''}${fr.row ? ` ySplit="${fr.row}"` : ''} topLeftCell="${colName(fr.col || 0)}${(fr.row || 0) + 1}" activePane="${fr.row && fr.col ? 'bottomRight' : fr.row ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const colXml = cols.length ? `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const data = rows.map((row, r) => `<row r="${r + 1}">${(row || []).map((c, i) => cellXml(c, r, i)).join('')}</row>`).join('');
    const af = sh.autofilter ? `<autoFilter ref="${sh.autofilter}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="15"/>${colXml}<sheetData>${data}</sheetData>${af}</worksheet>`;
  }

  function safeName(n, i) { return String(n || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || `Hoja${i + 1}`; }

  function build(book) {
    const sheets = (book && book.sheets) || [];
    if (!sheets.length) throw new Error('El libro no tiene hojas.');
    const files = [];
    files.push({ name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` });
    files.push({ name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    const names = sheets.map((s, i) => safeName(s.name, i));
    const filters = sheets.map((s, i) => (s.autofilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!${s.autofilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '')).join('');
    files.push({ name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>` });
    files.push({ name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', text: STYLES });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }));
    return FP.zip.create(files);
  }

  function download(fileName, bytes) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  FP.xlsxWriter = { build, download, colName, serial, FORMATS };
})(typeof window !== 'undefined' ? window : globalThis);
