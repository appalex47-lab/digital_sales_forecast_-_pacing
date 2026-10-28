#!/usr/bin/env node
/* Productos que se compran juntos: soporte, confianza, lift, dirección, canal, niveles y cobertura. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
['js/analytics/customerEngine.js', 'js/analytics/basketEngine.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const E = ctx.FP.customerEngine, BE = ctx.FP.basketEngine, D = (s) => E.dayNum(s);
const dr = E.draftLedger([]); let n = 0;
const order = (cust, day, ch, skus) => { n++; skus.forEach((s) => dr.add({ order: 'o' + n, customer: cust, day: D(day), channel: ch, revenue: 10, line: { sku: s, stateIdx: 0, branch: '', deliveryIdx: 0, city: '', geoFlags: 0 } })); };
/* 255 pedidos: 40 con A+B (30 ecommerce, 10 app), 10 solo A, 5 solo B, 200 solo C. */
for (let i = 0; i < 30; i++) order('c' + i, '2025-03-01', 'ecommerce', ['A', 'B']);
for (let i = 0; i < 10; i++) order('d' + i, '2025-03-02', 'app', ['A', 'B', 'A']);   // A repetido: cuenta una vez
for (let i = 0; i < 10; i++) order('e' + i, '2025-03-03', 'ecommerce', ['A']);
for (let i = 0; i < 5; i++) order('f' + i, '2025-03-04', 'app', ['B']);
for (let i = 0; i < 200; i++) order('g' + i, '2025-03-05', 'app', ['C']);
const L = E.emptyLedger(); E.mergeInto(L, dr, { id: 'b', fileName: 'f' });
const cat = new Map([['A', { sku: 'A', product: 'Prod A', category: 'Cat1' }], ['B', { sku: 'B', product: 'Prod B', category: 'Cat1' }], ['C', { sku: 'C', product: 'Prod C', category: 'Cat2' }]]);
const r = BE.analyze(L, cat, {});
assert.strictEqual(r.status, 'ok'); assert.strictEqual(r.orders, 255);
assert.strictEqual(r.candidates.length, 1);
const c = r.candidates[0];
assert.strictEqual(c.a, 'Prod A', 'la base es el producto con más pedidos'); assert.strictEqual(c.b, 'Prod B');
assert.strictEqual(c.n, 40); assert.ok(Math.abs(c.conf - 40 / 50) < 1e-9); assert.ok(Math.abs(c.lift - (40 * 255) / (50 * 45)) < 1e-9); assert.strictEqual(c.aOnly, 10);
assert.ok(Math.abs(r.multiShare - 40 / 255) < 1e-9); assert.ok(Math.abs(r.avgItems - 295 / 255) < 1e-9);
assert.strictEqual(JSON.stringify(r.dist.map((v) => Math.round(v * 100))), '[84,16,0,0]');
/* por canal */
const bc = Object.fromEntries(c.byChannel.map((x) => [x.channel, x]));
assert.ok(Math.abs(bc.ecommerce.conf - 30 / 40) < 1e-9, 'ecommerce: 30 de 40 pedidos con A'); assert.strictEqual(bc.app.conf, null, 'app: solo 10 pedidos con A, bajo el mínimo');
/* espacio en pesos y tickets de los productos ancla */
assert.ok(Math.abs(c.bRevPerOrder - 10) < 1e-9 && Math.abs(c.space - 100) < 1e-9, 'espacio = 10 pedidos con A sin B × $10 de B por pedido');
const ra = BE.analyze(L, cat, { minAnchorOrders: 5 }), anA = ra.anchors.find((x) => x.item === 'Prod A');
assert.ok(Math.abs(anA.ticket - 20) < 1e-9 && Math.abs(anA.restTicket - 8) < 1e-9 && Math.abs(anA.ticketWithout - 10) < 1e-9, 'A: ticket 20, resto de la canasta 8, pedido sin A 10');
assert.strictEqual(ra.anchors[0].item, 'Prod B', 'el ancla de más valor es la que más suma alrededor (B: 500/45 ≈ 11.1; A: 8; C: 0)');
assert.ok(Math.abs(ra.anchors[0].restTicket - 500 / 45) < 1e-9);
assert.ok(Math.abs(ra.avgTicket - 3050 / 255) < 1e-9);
/* canal elegido: no hay desglose por canal y el soporte baja */
const re = BE.analyze(L, cat, { channel: 'ecommerce' });
assert.strictEqual(re.candidates.length, 0, 'con ecommerce el par tiene 30 pedidos juntos pero lift 1');
/* nivel categoría: A y B son la misma categoría, un solo producto por pedido */
const rc = BE.analyze(L, cat, { level: 'category' });
assert.strictEqual(rc.candidates.length, 0); assert.strictEqual(JSON.stringify(rc.dist.map((v) => Math.round(v * 100))), '[100,0,0,0]');
/* sin líneas */
const L2 = E.emptyLedger(); const d2 = E.draftLedger([]); d2.add({ order: '1', customer: 'A', day: D('2025-01-01'), channel: 'ecommerce', revenue: 1 }); E.mergeInto(L2, d2, { id: 'x', fileName: 'viejo.csv' });
const r2 = BE.analyze(L2, cat, {}); assert.strictEqual(r2.status, 'no_lines'); assert.strictEqual(r2.missingFiles[0], 'viejo.csv');
console.log('test-basket-engine: OK');
