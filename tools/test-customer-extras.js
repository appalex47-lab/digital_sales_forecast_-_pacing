#!/usr/bin/env node
/* Clientes: activos / en riesgo / perdidos, concentración de la venta y cruce de canales (extras del análisis). */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/analytics/customerEngine.js', 'utf8'), ctx);
const E = ctx.FP.customerEngine, D = (s) => E.dayNum(s);
const dr = E.draftLedger([]);
let n = 0; const add = (c, d, r, ch = 'ecommerce') => dr.add({ order: 'o' + (++n), customer: c, day: D(d), channel: ch, revenue: r });
/* histórico de 2025-01-01 a 2025-12-31; último dato = 31 dic */
add('A', '2025-01-02', 100); add('A', '2025-12-20', 100);                 // activo (11 días)
add('B', '2025-01-03', 100); add('B', '2025-10-10', 100, 'app');          // en riesgo (82 días… activo si ≤ 90) → activo
add('C', '2025-01-04', 100); add('C', '2025-08-01', 100);                 // 152 días: en riesgo
add('D', '2025-01-05', 100);                                              // 360 días: perdido
add('E', '2025-12-30', 3000, 'app');                                      // activo, gran comprador
add('A', '2025-12-31', 50, 'app');                                        // A cruza a app
const L = E.emptyLedger(); E.mergeInto(L, dr, { id: 'b', fileName: 'f' });
let r = E.analyze(L, {}), x = r.extras;
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
eq([x.recency.active, x.recency.risk, x.recency.lost, x.recency.total], [3, 1, 1, 5], 'A, B, E activos; C en riesgo; D perdido');
assert.strictEqual(x.recency.lostOk, true);
assert.strictEqual(x.concentration, null, 'con menos de 10 clientes no se calcula la concentración');
eq(x.channels.byCount.map((q) => [q.n, q.customers]), [[1, 3], [2, 2]], 'A y B usan dos canales');
assert.strictEqual(x.channels.multiCustomers, 2);
assert.strictEqual(x.channels.combos[0].customers, 2);
const m = x.channels.matrix;
assert.strictEqual(m.active, 4, 'A, B, C y E compraron en los últimos 180 días; D no');
const i = m.channels.indexOf('ecommerce'), j = m.channels.indexOf('app');
assert.strictEqual(m.cells[i][j], 2, 'A y B entraron por ecommerce y hoy compran por app');
/* con canal elegido no hay cruce */
assert.strictEqual(E.analyze(L, { channel: 'app' }).extras.channels, null);
/* historia corta: no se separan los perdidos */
const d2 = E.draftLedger([]); d2.add({ order: 'x1', customer: 'Z', day: D('2025-12-01'), channel: 'ecommerce', revenue: 10 }); d2.add({ order: 'x2', customer: 'Y', day: D('2025-12-20'), channel: 'ecommerce', revenue: 10 });
const L2 = E.emptyLedger(); E.mergeInto(L2, d2, { id: 'b2', fileName: 'f2' });
const e2 = E.analyze(L2, {}).extras;
assert.strictEqual(e2.recency.lostOk, false); assert.strictEqual(e2.recency.lost, null); assert.strictEqual(e2.channels.matrix, null);
/* concentración con 20 clientes: un cliente pesa 80 % */
const d3 = E.draftLedger([]); for (let c = 0; c < 20; c++) d3.add({ order: 'q' + c, customer: 'c' + c, day: D('2025-06-01'), channel: 'ecommerce', revenue: c === 0 ? 1900 : 100 });
const L3 = E.emptyLedger(); E.mergeInto(L3, d3, { id: 'b3', fileName: 'f3' });
const cc = E.analyze(L3, {}).extras.concentration;
assert.strictEqual(cc.customers, 20); assert.ok(Math.abs(cc.top10 - (1900 + 100) / 3800) < 1e-9, 'el 10 % (2 clientes) aporta 2000 de 3800');
assert.strictEqual(cc.curve.length, 51); assert.ok(Math.abs(cc.curve[50] - 1) < 1e-9);
/* el archivo guarda cuántas líneas traían ID válido */
const d4 = E.draftLedger(['0']); d4.add({ order: '1', customer: 'A', day: D('2025-01-01'), channel: 'ecommerce', revenue: 1 }); d4.add({ order: '2', customer: '0', day: D('2025-01-01'), channel: 'ecommerce', revenue: 1 });
const L4 = E.emptyLedger(); E.mergeInto(L4, d4, { id: 'b4', fileName: 'f4' });
eq([L4.batches[0].ln, L4.batches[0].nc], [2, 1]);
console.log('test-customer-extras: OK');
