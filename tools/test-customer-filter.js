#!/usr/bin/env node
/* Libro de clientes con detalle por línea: filtro por categoría / producto / sucursal combinado con canal; reemplazo, borrado y libros anteriores. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/analytics/customerEngine.js', 'utf8'), ctx);
const E = ctx.FP.customerEngine, D = (s) => E.dayNum(s);
// Catálogo simulado (misma semántica de matchesProduct/matchesGeo, reducida): SKU → categoría; sucursal por etiqueta
const CAT = { s1: { category: 'Diabetes', product: 'P1' }, s2: { category: 'Diabetes', product: 'P2' }, s3: { category: 'Derma', product: 'P3' } };
ctx.FP.productStore = { lineMatcher: (f) => (sku, st, br) => (!f.category || (CAT[sku] || {}).category === f.category) && (!f.product || (CAT[sku] || {}).product === f.product) && (!f.branch || br === f.branch) };
const line = (sku, br = '108') => ({ sku, stateIdx: 1, branch: br, deliveryIdx: 1, city: '', geoFlags: 0 });
function ledger() {
  const dr = E.draftLedger([]);
  const add = (o, c, d, r, sku, ch = 'ecommerce', br) => dr.add({ order: o, customer: c, day: D(d), channel: ch, revenue: r, line: line(sku, br) });
  add('1', 'A', '2025-01-05', 100, 's1'); add('1', 'A', '2025-01-05', 50, 's3');            // un pedido con dos categorías
  add('2', 'B', '2025-01-06', 40, 's3'); add('3', 'C', '2025-01-07', 30, 's1', 'app');
  add('4', 'A', '2025-02-05', 70, 's3'); add('5', 'D', '2025-02-09', 20, 's2', 'ecommerce', '122');
  const L = E.emptyLedger(); E.mergeInto(L, dr, { id: 'b', fileName: 'f.csv' }); return L;
}
let L = ledger();
const mo = (r) => Object.fromEntries(r.monthly.map((x) => [x.key, x]));
// sin filtro: igual que antes
assert.strictEqual(mo(E.analyze(L, {}))['2025-01'].customers.total, 3);
// categoría
let r = E.analyze(L, { filter: { category: 'Diabetes' } }); assert.strictEqual(r.status, 'ok'); let m = mo(r);
assert.strictEqual(m['2025-01'].customers.total, 2, 'ene: A (s1) y C (s1, app)');
assert.strictEqual(m['2025-01'].revenue.total, 130, 'venta solo de líneas de Diabetes: 100 + 30');
assert.strictEqual(m['2025-02'].customers.total, 1, 'feb: solo D (s2)');
// categoría + canal
r = E.analyze(L, { channel: 'ecommerce', filter: { category: 'Diabetes' } }); m = mo(r);
assert.strictEqual(m['2025-01'].customers.total, 1, 'con canal ecommerce: C (app) sale');
assert.strictEqual(m['2025-01'].revenue.total, 100);
// el tipo es el del cliente con la empresa: A en feb (Derma) ya era cliente → recurrente
r = E.analyze(L, { filter: { category: 'Derma' } }); m = mo(r);
assert.strictEqual(m['2025-02'].customers.recurrent, 1, 'A compró en ene (otra categoría): en feb es recurrente, no nuevo');
assert.strictEqual(m['2025-01'].customers.new, 2, 'ene: A y B nuevos');
// producto + sucursal combinados
r = E.analyze(L, { filter: { category: 'Diabetes', product: 'P2', branch: '122' } }); m = mo(r);
assert.strictEqual(m['2025-02'].customers.total, 1); assert.strictEqual(m['2025-01'], undefined);
// no regresaron con filtro: compraron la selección el mes anterior y no este mes
r = E.analyze(L, { filter: { category: 'Derma' } }); m = mo(r);
assert.strictEqual(m['2025-02'].lapsedBase, 2, 'ene (Derma): A y B'); assert.strictEqual(m['2025-02'].lapsed, 1, 'B no regresó');
// reemplazar el mismo archivo no duplica líneas
const dr2 = E.draftLedger([]); dr2.add({ order: '4', customer: 'A', day: D('2025-02-05'), channel: 'ecommerce', revenue: 90, line: line('s3') });
E.mergeInto(L, dr2, { id: 'b2', fileName: 'g.csv' });
assert.strictEqual(L.lines.o.filter((x) => x === L.key.indexOf('ecommerce|4')).length, 1, 'el pedido 4 tiene una sola línea tras reemplazarse');
m = mo(E.analyze(L, { filter: { category: 'Derma' } })); assert.strictEqual(m['2025-02'].revenue.total, 90);
// quitar un archivo reubica las líneas
E.removeBatch(L, 'b2'); r = E.analyze(L, { filter: { category: 'Derma' } });
assert.ok(r.status === 'ok' || r.status === 'filter_unavailable');
// libro anterior (sin líneas): se avisa, no se inventa
const old = E.emptyLedger(); const d3 = E.draftLedger([]); d3.add({ order: '1', customer: 'A', day: D('2025-01-05'), channel: 'ecommerce', revenue: 5 }); E.mergeInto(old, d3, { id: 'x', fileName: 'viejo.csv' });
r = E.analyze(old, { filter: { category: 'Diabetes' } }); assert.strictEqual(r.status, 'filter_unavailable'); assert.strictEqual(JSON.stringify(r.missingFiles), '["viejo.csv"]');
assert.strictEqual(E.analyze(old, {}).status, 'ok', 'sin filtro el libro anterior sigue funcionando');
// libro mixto: un archivo viejo + uno nuevo → parcial
const mix = E.emptyLedger(); E.mergeInto(mix, d3, { id: 'x', fileName: 'viejo.csv' });
const d4 = E.draftLedger([]); d4.add({ order: '9', customer: 'Z', day: D('2025-02-01'), channel: 'ecommerce', revenue: 5, line: line('s1') }); E.mergeInto(mix, d4, { id: 'y', fileName: 'nuevo.csv' });
r = E.analyze(mix, { filter: { category: 'Diabetes' } }); assert.strictEqual(r.status, 'filter_unavailable'); assert.strictEqual(r.reason, 'partial'); assert.ok(r.missingFiles.includes('viejo.csv'));
// recargar el archivo viejo con líneas lo habilita
const d5 = E.draftLedger([]); d5.add({ order: '1', customer: 'A', day: D('2025-01-05'), channel: 'ecommerce', revenue: 5, line: line('s1') }); E.mergeInto(mix, d5, { id: 'x2', fileName: 'viejo.csv' });
r = E.analyze(mix, { filter: { category: 'Diabetes' } }); assert.strictEqual(r.status, 'ok', 'tras recargar el archivo el filtro queda disponible');
console.log('test-customer-filter: OK');
