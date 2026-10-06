const fs=require('fs'), vm=require('vm');
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/analytics/actionPriorityEngine.js','utf8'),ctx);
const E=ctx.FP.actionPriorityEngine, rows=JSON.parse(fs.readFileSync('tools/real-data-product-aug-sep.json','utf8'));
const r=E.analyze(rows);
const sum=r.all.reduce((s,x)=>s+x.impact,0), expected=rows.reduce((s,x)=>s+x.recentAbsoluteChange,0);
const checks=[
 ['dataset real cargado',rows.length>100],
 ['hay arrastre real',r.drag.length>0&&r.drag.every(x=>x.impact<0)],
 ['hay compensación real',r.compensate.length>0&&r.compensate.every(x=>x.impact>0)],
 ['balance de entidades reconcilia',Math.abs(sum-expected)<0.01],
 ['ranking negativo decreciente por impacto',r.drag.every((x,i,a)=>i===0||Math.abs(a[i-1].impact)>=Math.abs(x.impact))],
 ['ranking positivo decreciente por impacto',r.compensate.every((x,i,a)=>i===0||Math.abs(a[i-1].impact)>=Math.abs(x.impact))]
];
console.log(`Real CSV: ${rows.length} productos comparables agosto→septiembre 2026`);
console.log(`${checks.filter(x=>x[1]).length}/${checks.length} checks datos reales`);checks.forEach(x=>console.log(`${x[1]?'PASS':'FAIL'} ${x[0]}`));
console.log('TOP ARRRASTRE',r.drag.slice(0,5).map(x=>[x.entity,x.impact]));
console.log('TOP COMPENSA',r.compensate.slice(0,5).map(x=>[x.entity,x.impact]));
if(checks.some(x=>!x[1]))process.exit(1);
