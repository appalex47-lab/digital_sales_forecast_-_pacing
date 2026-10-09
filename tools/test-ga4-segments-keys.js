// Pruebas del traductor GA4 → Segmentos con llaves que colisionan (hallazgo con el export real).  node tools/test-ga4-segments-keys.js
const path = require('path'); global.FP = {};
try { require(path.join(__dirname, '../js/import/normalize.js')); require(path.join(__dirname, '../js/import/ga4Segments.js')); } catch (e) { console.log('OMITIDA: no se pudo cargar el módulo fuera del navegador:', e.message); process.exit(0); }
let ok = 0, bad = 0; const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); c ? ok++ : bad++; };
const H = 'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras';
const rows = [
  '1 ago 2026,web,mobile,google / organic,(organic),/catalogsearch/result/?q=Mounjaro,new,100,2,1000',
  '1 ago 2026,web,mobile,google / organic,(organic),/catalogsearch/result/?q=mounjaro,new,300,3,2000',
  '1 ago 2026,web,mobile,google / organic,(organic),/catalogsearch/result/?q=MOUNJARO+,new,50,0,0',
  '1 ago 2026,web,mobile,google / organic,(organic),/,new,500,5,5000',
  '1 ago 2026,web,mobile,google / organic,(organic),/customer/account/create/,new,10,0,0',
  '1 ago 2026,web,mobile,google / organic,(organic),/customer/account/create,new,20,1,100'];
const { agg, stats } = FP.ga4Segments.translateCore ? FP.ga4Segments.translateCore([H, ...rows].join('\n')) : (() => { const r = FP.ga4Segments.translateRows([H, ...rows].join('\n')); return { agg: r.rows.map((x) => ({ dim: x.values.dimension, seg: x.values.segmento, sesiones: +x.values.traffic_volume, pedidos: +x.values.pedidos, venta: +x.values.venta })), stats: r.stats }; })();
const land = agg.filter((a) => a.dim === 'landing');
t('landing: 3 segmentos (búsqueda Mounjaro, inicio «/», crear cuenta), no 6', land.length === 3, land.map((x) => x.seg));
const mj = land.find((x) => /mounjaro/i.test(x.seg));
t('variantes de «?q=mounjaro» se suman: 450 sesiones, 5 pedidos, $3,000', mj && mj.sesiones === 450 && mj.pedidos === 5 && mj.venta === 3000, mj);
t('el rótulo es el de la variante con más sesiones (?q=mounjaro)', mj && mj.seg === '/catalogsearch/result/?q=mounjaro', mj);
t('«/» se conserva como segmento propio con sus 500 sesiones', land.some((x) => x.seg === '/' && x.sesiones === 500));
t('crear cuenta (con y sin «/» final) se suma: 30 sesiones', land.find((x) => /create/.test(x.seg)).sesiones === 30);
t('el total de sesiones por dimensión no cambia (980)', ['landing', 'dispositivo', 'fuente'].every((d) => agg.filter((a) => a.dim === d).reduce((s, a) => s + a.sesiones, 0) === 980));
t('stats.mergedKeys cuenta las llaves que juntaron variantes (2)', stats.mergedKeys === 2, stats.mergedKeys);
console.log(`\n${ok} ok, ${bad} fallan`); process.exit(bad ? 1 : 0);
