// Búsqueda global: puntuación, sinónimos y agrupación.  node tools/test-search.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, JSON, String }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/ui/search.js', 'utf8'), ctx);
const S = ctx.FP.search; let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const items = [
  { type: 'go', id: 'v-diag', title: 'Diagnóstico', desc: 'Brecha de venta y su explicación', view: 'diagnostico' },
  { type: 'go', id: 'v-an', title: 'Evolución y patrones', desc: 'Detecta desde cuándo crece o cae', view: 'analisis' },
  { type: 'go', id: 'v-carga', title: 'Carga de datos', desc: 'Importar histórico', view: 'carga' },
  { type: 'action', id: 'a-pk', title: 'Exportar el paquete de análisis', desc: 'Descarga todo en un .zip', keywords: 'descargar zip', view: 'paquete', needsData: true },
  { type: 'concept', id: 'c-gap', title: 'Gap (brecha)', desc: 'Real − plan de los días contados', help: 'gap' },
  { type: 'concept', id: 'c-cut', title: 'Cutoff (fecha de corte)', desc: 'Último día con real', help: 'cutoff' },
  { type: 'concept', id: 'c-aov', title: 'AOV', desc: 'Ticket promedio: venta ÷ pedidos', help: 'aov' }];
const first = (q, g) => { const r = S.rank(items, q); return r[g][0] && r[g][0].id; };
t('sin acentos ni mayúsculas: «diagnostico» → Diagnóstico', first('DIAGNOSTICO', 'go') === 'v-diag');
t('sinónimo: «brecha» encuentra el concepto Gap', first('brecha', 'concept') === 'c-gap');
t('sinónimo: «gap» encuentra también la sección Diagnóstico (descripción con «brecha»)', first('gap', 'go') === 'v-diag');
t('sinónimo: «corte» → Cutoff', first('corte', 'concept') === 'c-cut');
t('sinónimo: «ticket promedio» → AOV', first('ticket promedio', 'concept') === 'c-aov');
t('«exportar» → acción del paquete', first('exportar', 'action') === 'a-pk');
t('«descargar» → acción del paquete (sinónimo)', first('descargar', 'action') === 'a-pk');
t('«subir datos» → Carga de datos', first('subir datos', 'go') === 'v-carga');
t('varias palabras: todas deben coincidir', S.rank(items, 'brecha zzz').concept.length === 0);
t('consulta vacía no devuelve nada', S.rank(items, '   ').go.length === 0);
t('el título pesa más que la descripción', S.score(items[1], 'evolucion') > S.score(items[0], 'evolucion'));
t('límite por grupo', S.rank(Array.from({ length: 12 }, (_, i) => ({ type: 'go', id: 'x' + i, title: 'Carga ' + i, desc: '' })), 'carga').go.length === 5);
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
