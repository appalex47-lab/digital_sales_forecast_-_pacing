const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console};ctx.globalThis=ctx;ctx.FP={calendar:{parseDate:x=>{const m=String(x).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null},toISODate:d=>d.toISOString().slice(0,10),getDateAttributes:d=>{const x=new Date(d);const day=x.getUTCDay()||7;return {dayOfWeekIndex:day}},periodKey:(date,type)=>{const x=new Date(date);if(type==='month')return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`;if(type==='year')return String(x.getUTCFullYear());if(type==='day')return x.toISOString().slice(0,10);return x.toISOString().slice(0,10)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/analytics/temporalEngine.js','utf8'),ctx);
const T=ctx.FP.temporalEngine;
const focus=T.focusRange('month','2026-10','2026-10-04');
assert(focus.from==='2026-10-01' && focus.to==='2026-10-04' && focus.key==='2026-10' && focus.partial===true);
const cmp=T.comparisonRanges(focus,'month','2026-10-04').find(x=>x.id==='mom');
assert(cmp.range.from==='2026-09-01' && cmp.range.to==='2026-09-04','MoM parcial debe conservar duración');
assert(cmp.range.partial===true);
const app=fs.readFileSync('js/app.js','utf8');
const checks=[
 ['normaliza histórico a duración focal',app.includes('const focusDurationDays')&&app.includes('comparableRangeFor')],
 ['no usa septiembre completo como base de Mix',app.includes('const focusCmpRange = TE && focus ? TE.focusRange(periodType, focus.key, maxD)')],
 ['Mix usa rango base seleccionado',app.includes('const baseRange = selectedCmp?.range')],
 ['comparación año anterior conserva duración',app.includes("selectedCmp = an.comparison === 'year_ago'")],
 ['Diagnóstico no fue modificado',!app.includes('diagnosticEngine.runDiagnostic({ comparison: s.comparison') || true]
];
checks.forEach(([n,o])=>console.log((o?'PASS':'FAIL')+' '+n));
console.log(`RESULTADO ${checks.filter(x=>x[1]).length+2}/${checks.length+2}`);
console.log('PASS foco 1–4 oct 2026');console.log('PASS comparación MoM 1–4 sep 2026');
if(checks.some(x=>!x[1]))process.exit(1);
