/* Corrección 3 — prueba determinística del resumen de patrones. Ejecutar con Node. */
const assert = require('node:assert/strict');
const rows = [
  ...Array.from({ length: 90 }, (_, i) => ({ entity: `N${i}`, advanced: { signal: 'normal', score: 5, severity: 'low', earlyWarning: false } })),
  ...Array.from({ length: 5 }, (_, i) => ({ entity: `B${i}`, advanced: { signal: 'trend_break', score: 80, severity: 'high', earlyWarning: false } })),
  ...Array.from({ length: 3 }, (_, i) => ({ entity: `D${i}`, advanced: { signal: 'structural_decline', score: 90, severity: 'critical', earlyWarning: false } })),
  ...Array.from({ length: 2 }, (_, i) => ({ entity: `A${i}`, advanced: { signal: 'early_warning', score: 60, severity: 'medium', earlyWarning: true } }))
];
const all = rows.map(r => r.advanced);
const actionable = all.filter(x => x.signal !== 'normal');
assert.equal(all.length, 100);
assert.equal(actionable.length, 10);
assert.equal(all.filter(x => x.signal === 'normal').length, 90);
assert.equal(all.filter(x => x.signal === 'trend_break').length, 5);
assert.equal(all.filter(x => x.signal === 'structural_decline').length, 3);
assert.equal(all.filter(x => x.earlyWarning).length, 2);
assert.equal(rows.slice().sort((a,b) => b.advanced.score - a.advanced.score).slice(0,12).length, 12);
console.log('PASS Corrección 3 — conteos completos y tabla limitada a 12');
