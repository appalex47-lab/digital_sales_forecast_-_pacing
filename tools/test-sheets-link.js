// Prueba de js/import/sheetsLink.js (enlace publicado de Google Sheets). Uso: node tools/test-sheets-link.js
global.window = global; global.FP = global.FP || {};
require('../js/import/sheetsLink.js');
const S = FP.sheetsLink; let fails = 0;
const ok = (n, c, d) => { if (!c) { fails++; console.log('✘ ' + n + (d ? ' — ' + JSON.stringify(d) : '')); } else console.log('✔ ' + n); };

const pub = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vABC123/pub?gid=555&single=true&output=csv';
let n = S.normalize(pub);
ok('publicado: se acepta y queda como CSV con gid', n.ok && n.kind === 'published' && n.gid === '555' && n.csvUrl.includes('output=csv') && n.csvUrl.includes('gid=555'), n);
n = S.normalize('https://docs.google.com/spreadsheets/d/e/2PACX-1vABC123/pubhtml?gid=7');
ok('pubhtml se convierte a pub?output=csv', n.ok && /\/pub\?/.test(n.csvUrl) && n.csvUrl.includes('output=csv') && n.csvUrl.includes('single=true'), n);
n = S.normalize('https://docs.google.com/spreadsheets/d/e/2PACX-1vABC123/pub?output=csv');
ok('publicado sin gid: se acepta (primera pestaña)', n.ok && !n.csvUrl.includes('gid='), n);
n = S.normalize('https://docs.google.com/spreadsheets/d/1AbCdEf/edit#gid=123');
ok('enlace de edición: se convierte a export csv y se marca «shared»', n.ok && n.kind === 'shared' && n.csvUrl === 'https://docs.google.com/spreadsheets/d/1AbCdEf/export?format=csv&gid=123', n);
ok('http (no https) se rechaza', !S.normalize('http://docs.google.com/spreadsheets/d/e/x/pub?output=csv').ok);
ok('otro dominio se rechaza', !S.normalize('https://evil.example.com/spreadsheets/d/e/x/pub?output=csv').ok);
ok('subdominio engañoso se rechaza', !S.normalize('https://docs.google.com.evil.com/spreadsheets/d/e/x/pub').ok);
ok('otra ruta de Google se rechaza', !S.normalize('https://docs.google.com/document/d/1Abc/edit').ok);
ok('vacío y texto no-URL se rechazan con mensaje', !S.normalize('').ok && !S.normalize('hola').ok && S.normalize('hola').error.length > 10);

const mk = (status, body, throwIt) => async () => { if (throwIt) throw new Error('net'); return { ok: status >= 200 && status < 300, status, text: async () => body }; };
(async () => {
  let r = await S.fetchCsv('u', { fetchImpl: mk(200, 'fecha,canal,venta\n2026-01-01,ecommerce,100\n') });
  ok('CSV válido: ok con filas', r.ok && r.rows === 2, r);
  r = await S.fetchCsv('u', { fetchImpl: mk(200, '﻿fecha,canal\n2026-01-01,a\n') });
  ok('quita el BOM', r.ok && r.text.startsWith('fecha'), r);
  r = await S.fetchCsv('u', { fetchImpl: mk(200, '<!DOCTYPE html><html><body>Inicia sesión</body></html>') });
  ok('HTML en vez de CSV: error claro', !r.ok && /página web/.test(r.error), r);
  r = await S.fetchCsv('u', { fetchImpl: mk(404, '') });
  ok('404: no publicada', !r.ok && /404/.test(r.error), r);
  r = await S.fetchCsv('u', { fetchImpl: mk(403, '') });
  ok('403: sin acceso', !r.ok && /acceso|publicada/.test(r.error), r);
  r = await S.fetchCsv('u', { fetchImpl: mk(200, '', true) });
  ok('fallo de red/CORS: error con alternativa', !r.ok && /Descargar → CSV/.test(r.error), r);
  r = await S.fetchCsv('u', { fetchImpl: mk(200, 'fecha,canal\n') });
  ok('solo encabezados: error', !r.ok && /vacía/.test(r.error), r);
  ok('nombre de archivo', S.fileName('Venta real 2026', 'actual') === 'Google Sheets - Venta real 2026.csv' && S.fileName('', 'plan') === 'Google Sheets - plan.csv' && !/[\\/:*?"<>|]/.test(S.fileName('a/b:c', 'x')));
  console.log(fails ? `FALLAS: ${fails}` : 'RESULTADO: OK'); process.exit(fails ? 1 : 0);
})();
