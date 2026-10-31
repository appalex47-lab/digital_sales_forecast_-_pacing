#!/usr/bin/env node
/* Tráfico y conversión · todas las dimensiones: total sin depender de la dimensión, lista unificada con filtros, hallazgos y cruce.
   Cifras esperadas calculadas AQUÍ con una implementación independiente. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/analytics/trafficConversionEngine.js', 'utf8'), ctx);
const TE = ctx.FP.trafficConversionEngine;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.5, `${m}: ${a} ≠ ${b}`);
const row = (label, b, c) => ({ key: label, label, baseline: b && { traffic: b[0], orders: b[1], revenue: b[2], has: { traffic: true, orders: true, revenue: true } }, current: c && { traffic: c[0], orders: c[1], revenue: c[2], has: { traffic: true, orders: true, revenue: true } } });
/* [sesiones, pedidos, venta]: base y actual. Las tres dimensiones suman lo mismo. */
const SRC = { 'Google · orgánico': [[39438, 872, 380560], [39638, 880, 383986]], Directo: [[23801, 780, 378250], [24362, 826, 401513]], 'Google · pago': [[16923, 300, 129640], [17038, 286, 123332]], 'Correo / CRM': [[7330, 414, 237042], [7364, 402, 231072]], 'Meta · social': [[11961, 141, 55594], [16400, 200, 78234]] };
const DEV = { Móvil: [[60453, 1400, 603000], [64802, 1380, 590640]], Escritorio: [[39000, 1107, 578086], [40000, 1214, 627497]] };
const CUS = { Nuevo: [[60000, 1120, 470000], [62000, 1170, 500000]], Recurrente: [[39453, 1387, 711086], [42802, 1424, 718137]] };
const res = (m) => ({ rows: Object.entries(m).map(([k, [b, c]]) => row(k, b, c)) });
const eff = (b, c) => { const c0 = b[1] / b[0], c1 = c[1] / c[0], k0 = b[2] / b[1], k1 = c[2] / c[1]; return { traffic: (c[0] - b[0]) * c0 * k0, cr: c[0] * (c1 - c0) * k0, aov: c[0] * c1 * (k1 - k0) }; };
const sum3 = (m, i) => [0, 1, 2].map((j) => Object.values(m).reduce((s, v) => s + v[i][j], 0));
const dims = [{ dim: 'source', label: 'Fuente', res: res(SRC) }, { dim: 'device', label: 'Dispositivo', res: res(DEV) }, { dim: 'customer_type', label: 'Tipo de cliente', res: res(CUS) }];

/* 1) el total es el mismo en cualquier dimensión y cuadra */
const A = TE.analyzeAll(dims, { minByDim: { source: 100, device: 100, customer_type: 100 } });
assert.strictEqual(A.status, 'ok');
const b = sum3(SRC, 0), c = sum3(SRC, 1), e = eff(b, c);
near(A.total.traffic, e.traffic, 'tráfico del total'); near(A.total.cr, e.cr, 'conversión del total'); near(A.total.aov, e.aov, 'ticket del total');
near(A.total.delta, c[2] - b[2], 'Δ venta'); assert.ok(A.total.reconciles);
assert.strictEqual(A.total.lead, 'traffic');
/* el orden de las dimensiones no cambia el total */
const A2 = TE.analyzeAll(dims.slice().reverse(), { minByDim: { source: 100, device: 100, customer_type: 100 } });
near(A2.total.traffic, A.total.traffic, 'el total no depende del orden'); near(A2.total.cr, A.total.cr, 'el total no depende del orden');
/* sumar los segmentos de UNA dimensión da su Δ venta; dimensiones distintas atribuyen distinto el tráfico */
A.dims.forEach((d) => near(d.dec.total.delta, A.total.delta, `Δ de ${d.label}`));
assert.ok(Math.abs(A.dims[0].dec.total.traffic - A.dims[1].dec.total.traffic) > 1000, 'cada dimensión atribuye distinto');
/* 2) lista unificada: todas las dimensiones, filtros y orden */
const all = TE.pick(A);
assert.strictEqual(all.total, 9, '5 + 2 + 2 segmentos');
assert.ok(all.rows.every((x) => x.dim && x.dimLabel));
const neg = TE.pick(A, { effect: 'cr', sign: 'neg' });
assert.ok(neg.rows.every((x) => x.value < 0) && neg.rows.every((x, i, a) => i === 0 || a[i - 1].value <= x.value), 'lo que resta, de mayor a menor pérdida');
const m = DEV['Móvil'], movil = eff(m[0], m[1]);
const fm = neg.rows.find((x) => x.dim === 'device' && x.label === 'Móvil'); assert.ok(fm); near(fm.value, movil.cr, 'conversión de Móvil');
const onlyDev = TE.pick(A, { dim: 'device' }); assert.strictEqual(onlyDev.total, 2);
assert.strictEqual(TE.pick(A, { limit: 3 }).rows.length, 3);
const pos = TE.pick(A, { effect: 'traffic', sign: 'pos' });
assert.ok(pos.rows.every((x, i, a) => i === 0 || a[i - 1].value >= x.value));
/* 3) hallazgos con la dimensión en la etiqueta; el peso es dentro de su dimensión (≤ 100 %) */
const F = TE.findingsAll(A, { money: (v) => (v < 0 ? '−' : '+') + '$' + Math.round(Math.abs(v)), pct: (v, d = 1) => (v * 100).toFixed(d) + ' %' });
assert.ok(F.length >= 2 && F.filter((f) => f.kind !== 'aov').every((f) => /(Fuente|Dispositivo|Tipo de cliente): /.test(f.title)), F.map((f) => f.title).join(' | '));
F.forEach((f) => { const mm = /el (\d+) % de lo que restó/.exec(f.body || ''); if (mm) assert.ok(+mm[1] <= 100, 'el peso no pasa de 100 %'); });
/* 4) cobertura: una dimensión que no cubre todo el total se avisa */
const part = { dim: 'device', label: 'Dispositivo', res: res({ Móvil: [[30000, 700, 300000], [32000, 690, 295000]] }) };
const AP = TE.analyzeAll([dims[0], part]);
assert.strictEqual(JSON.stringify(AP.partialDims), '["Dispositivo"]'); assert.strictEqual(AP.reference, 'source');
/* 5) cruce: sus celdas sí suman el Δ venta total */
const X = (a, bb, t) => ({ [`${a} · ${bb}`]: t });
const CROSS = Object.assign({}, X('Móvil', 'google / organic', [[20000, 400, 180000], [21000, 380, 171000]]), X('Móvil', 'google / cpc', [[18000, 300, 150000], [19000, 260, 129000]]), X('Móvil', 'direct / none', [[22453, 700, 273000], [24802, 740, 290640]]),
  X('Escritorio', 'google / organic', [[19438, 472, 200560], [18638, 500, 212986]]), X('Escritorio', 'google / cpc', [[15000, 480, 195000], [15500, 520, 231000]]), X('Escritorio', 'direct / none', [[4562, 155, 182526], [5862, 194, 183511]]));
const AC = TE.analyzeAll(dims.concat([{ dim: 'device_source', label: 'Dispositivo × Fuente/medio', res: res(CROSS) }]));
assert.ok(AC.cross && AC.cross.reconciles);
assert.strictEqual(AC.dims.length, 3, 'la combinación no cuenta como una dimensión más');
assert.strictEqual(JSON.stringify(AC.cross.rowsA.slice().sort()), '["Escritorio","Móvil"]');
const sumC = Object.values(CROSS).reduce((s, [bb, cc]) => s + cc[2] - bb[2], 0); near(AC.cross.total, sumC, 'Δ venta del cruce');
const cell = AC.cross.cells.find((x) => x.a === 'Móvil' && x.b === 'google / cpc'); near(cell.delta, 129000 - 150000, 'celda Móvil × google / cpc'); near(cell.cr, 19000 * (260 / 19000 - 300 / 18000) * (150000 / 300), 'conversión de la celda');
/* más columnas que el máximo → «Otros» */
const many = {}; for (let i = 0; i < 12; i++) many[`Móvil · fuente${i}`] = [[1000 + i, 20, 9000], [1100 + i, 22, 10000]];
const XM = TE.crossTab(res(many), { maxCols: 8 }); assert.strictEqual(XM.colsB.length, 9); assert.ok(XM.colsB.includes('Otros')); near(XM.total, 12 * 1000, 'Otros no pierde venta');
/* 6) sin periodo anterior o sin datos */
const noBase = TE.analyzeAll([{ dim: 'source', label: 'Fuente', res: { rows: Object.keys(SRC).map((k) => row(k, null, SRC[k][1])) } }]);
assert.strictEqual(noBase.status, 'no_baseline');
assert.strictEqual(TE.analyzeAll([]).status, 'no_data');
/* 7) calidad del tráfico de varias dimensiones, sin repetir */
const SPIKE = { 'Meta · social': [[6000, 75, 29000], [14000, 70, 27000]], Directo: [[24000, 790, 383000], [24200, 780, 378000]] };
const AQ = TE.analyzeAll([{ dim: 'source', label: 'Fuente', res: res(SPIKE) }, { dim: 'medium', label: 'Medio', res: res({ social: [[6000, 75, 29000], [14000, 70, 27000]], otros: [[24000, 790, 383000], [24200, 780, 378000]] }) }], { minByDim: { source: 100, medium: 100 } });
assert.ok(AQ.quality.length === 2 && AQ.quality.every((q) => q.type === 'spike_low_cr') && new Set(AQ.quality.map((q) => q.dim)).size === 2);
console.log('test-traffic-all: OK');
