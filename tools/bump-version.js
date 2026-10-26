// Cambia la versión (?v=…) de todos los scripts y hojas de estilo de index.html para que los navegadores no sirvan archivos viejos.
// Uso: node tools/bump-version.js [versión]   (sin argumento: AAAAMMDD + hora y minuto, p. ej. 20261026-1735)
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const d = new Date(), pad = (n) => String(n).padStart(2, '0');
const v = process.argv[2] || `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const src = fs.readFileSync(file, 'utf8');
let n = 0;
const out = src.replace(/(\.(?:js|css))\?v=[A-Za-z0-9_-]+/g, (m, ext) => { n += 1; return `${ext}?v=${v}`; });
fs.writeFileSync(file, out);
console.log(`Versión ${v} en ${n} archivos de index.html`);
