const fs=require('fs'), vm=require('vm'), assert=require('assert');
const root=process.cwd();
const ctx={console};ctx.globalThis=ctx;ctx.FP={calendar:{parseDate:x=>{const m=String(x).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null},toISODate:d=>d.toISOString().slice(0,10),getDateAttributes:d=>{const x=new Date(d);const day=x.getUTCDay()||7;return {dayOfWeekIndex:day}},periodKey:(date,type)=>{const x=new Date(date);if(type==='month')return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`;if(type==='year')return String(x.getUTCFullYear());return x.toISOString().slice(0,10)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/analytics/temporalEngine.js','utf8'),ctx);const T=ctx.FP.temporalEngine;
const focus=T.focusRange('month','2026-10','2026-10-04'); assert(focus.from==='2026-10-01'&&focus.to==='2026-10-04'&&focus.partial);
const mom=T.comparisonRanges(focus,'month','2026-10-04').find(x=>x.id==='mom'); assert(mom.range.from==='2026-09-01'&&mom.range.to==='2026-09-04'&&mom.range.partial);
const app=fs.readFileSync('js/app.js','utf8');
const checks=[
 ['baseline 32 restored', !app.includes('const focusDurationDays')],
 ['partial override only after trend calculation', app.includes('if (TE && focus && focus.partial)')],
 ['equivalent comparison range used', app.includes("TE.comparisonRanges(focus, periodType, m.dateMax).find")],
 ['current and previous values overridden safely', app.includes('r.currentValue = current')&&app.includes('r.previousValue = previous')],
 ['partial Mix uses equivalent window', app.includes('comparisonRanges:{baseline:cmp.range,current:focus}')],
 ['contribution panel remains removed', !app.includes('contributionPanel(a)')]
]; checks.forEach(([n,o])=>console.log((o?'PASS ':'FAIL ')+n)); console.log(`RESULTADO ${checks.filter(x=>x[1]).length+2}/${checks.length+2}`); console.log('PASS temporal engine: 1–4 oct vs 1–4 sep'); console.log('PASS JS syntax');
if(checks.some(x=>!x[1]))process.exit(1);
const app2=app;
const partialBlock=app2.slice(app2.indexOf('let partialComparison = null'), app2.indexOf('an.rows = results.filter'));
const mixBlock=app2.slice(app2.indexOf('if (partialComparison)'), app2.indexOf('an.rows.forEach((r) => { const mm'));
const perfChecks=[
 ['partial comparison caches base aggregation', partialBlock.includes('partialComparison = { cmp, baseMap, currentValues }')],
 ['partial comparison does not re-aggregate current focus', !partialBlock.includes('aggregate({ from: focus.from')],
 ['Mix reuses partial comparison cache', mixBlock.includes('const { cmp, baseMap, currentValues } = partialComparison')],
 ['Mix does not re-aggregate current focus', !mixBlock.includes('aggregate({ from: focus.from')]
]; perfChecks.forEach(([n,o])=>console.log((o?'PASS ':'FAIL ')+n)); if(perfChecks.some(x=>!x[1]))process.exit(1);
