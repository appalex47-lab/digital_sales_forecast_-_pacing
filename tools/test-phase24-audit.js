const fs=require('fs'),vm=require('vm');
const ctx={console,globalThis:{},FP:{format:{currency:v=>`$${Math.round(v).toLocaleString('en-US')}`}}};ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/analytics/analysisNarrativeEngine.js','utf8'),ctx);
const n=ctx.FP.analysisNarrativeEngine.build({
 rows:[{entity:'A',direction:'growth'},{entity:'B',direction:'decline'}],level:'product',
 contribution:{status:'available',direction:'growth',totalDelta:100,positive:[{entity:'A',delta:150}],negative:[{entity:'B',delta:-50}]},
 risks:{risks:[{entity:'B',score:9}],opportunities:[{entity:'A',score:8}]},
 forecast:{rows:[{status:'available',entity:'A',horizon:3,changeToHorizon:.12}]},
 cohort:{status:'available',latestPeriod:'2026-09',summary:{newCount:10,retainedCount:20,reactivatedCount:5,lostCount:4,retentionRate:.8}}
});
const assert=(x,m)=>{if(!x)throw new Error(m)};
assert(n.layers.length===6,'six layers');
assert(Object.values(n.layerStatus).every(x=>x==='available'),'all layers');
assert(n.claims.some(c=>c.text.includes('12.0 %') && c.numbers.includes(12)),'percentage display captured');
assert(n.claims.some(c=>c.text.includes('80.0 %') && c.numbers.includes(80)),'retention percentage captured');
// Simulate the existing Cohere validator's number gate.
const allowed=[...new Set(n.claims.flatMap(c=>c.numbers))];
const tokens=ctx.FP.analysisNarrativeEngine;
for(const v of [12,80]) assert(allowed.some(a=>Math.abs(a-v)<0.05 || Math.abs(Math.round(a)-v)<0.5 || Math.abs(a-v)/Math.max(Math.abs(a),1)<0.005),`allowed ${v}`);
console.log('FASE 24 narrative/Cohere contract: PASS');
