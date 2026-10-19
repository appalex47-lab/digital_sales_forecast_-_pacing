#!/usr/bin/env node
/* Clientes que no regresaron (compraron el mes anterior y no este mes), por mes y canal. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/analytics/customerEngine.js', 'utf8'), ctx);
const E = ctx.FP.customerEngine, D = (s) => E.dayNum(s);
const dr = E.draftLedger([]);
const add = (o, c, d, r, ch = 'ecommerce') => dr.add({ order: o, customer: c, day: D(d), channel: ch, revenue: r });
add('1', 'A', '2025-01-05', 10); add('2', 'B', '2025-01-06', 10); add('3', 'C', '2025-01-07', 10, 'app');
add('4', 'A', '2025-02-05', 10); add('5', 'D', '2025-02-09', 10);          // feb: A vuelve, B no, D nuevo
add('6', 'D', '2025-03-02', 10);                                          // mar: D vuelve, A no
const L = E.emptyLedger(); E.mergeInto(L, dr, { id: 'b', fileName: 'f' });
let m = Object.fromEntries(E.analyze(L, {}).monthly.map((x) => [x.key, x]));
assert.strictEqual(m['2025-01'].lapsed, null, 'sin mes previo no hay dato');
assert.strictEqual(m['2025-02'].lapsed, 2, 'ene: A,B,C; feb: A,D → B y C no regresaron');
assert.strictEqual(m['2025-02'].lapsedBase, 3);
assert.strictEqual(m['2025-03'].lapsed, 1, 'feb: A,D; mar: D → A no regresó');
m = Object.fromEntries(E.analyze(L, { channel: 'ecommerce' }).monthly.map((x) => [x.key, x]));
assert.strictEqual(m['2025-02'].lapsed, 1, 'por canal: C (app) no cuenta; solo B');
assert.strictEqual(m['2025-02'].customers.new, 1);
console.log('test-customer-lapsed: OK');
