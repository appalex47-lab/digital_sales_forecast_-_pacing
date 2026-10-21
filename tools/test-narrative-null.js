// Narrativa ejecutiva: un dato faltante nunca aparece como «null» en el texto de una afirmación.  node tools/test-narrative-null.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON, Intl, String, Map, Set, RegExp }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
ctx.FP = {}; vm.runInContext(fs.readFileSync('js/narrative/narrativeEngine.js', 'utf8'), ctx);
const NE = ctx.FP.narrativeEngine; let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const c1 = NE.claim('hecho', 'La venta acumulada es $100, contra un plan de null para el año.', null);
t('claim: «null» se escribe como «no disponible»', c1.text === 'La venta acumulada es $100, contra un plan de no disponible para el año.', c1.text);
const c2 = NE.claim('calculo', 'El forecast proyecta null, por encima de la meta por $5.', null);
t('claim: sin «null» en ningún caso y las cifras citadas se conservan', !/\bnull\b/.test(c2.text) && c2.numbers.includes('5'), c2);
const c3 = NE.claim('hecho', 'Texto normal con $1,000 y 5.0%.', null);
t('claim: un texto sin datos faltantes no cambia', c3.text === 'Texto normal con $1,000 y 5.0%.');
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
