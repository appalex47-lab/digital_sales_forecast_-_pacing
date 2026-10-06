const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('js/analytics/actionPriorityEngine.js','utf8');
const ctx={console}; vm.createContext(ctx); vm.runInContext(src,ctx);
const E=ctx.FP.actionPriorityEngine;
const checks=[]; const t=(n,o)=>checks.push({n,ok:!!o});
const rows=[
 {entity:'A',pattern:'decline_sustained',direction:'decline',recentAbsoluteChange:-120000,percentageChange:-.12,cumulativeChange:-.2,consecutivePeriods:5,confidence:'high',share:{baselineValue:1000000,currentValue:880000,shareChangePp:-1}},
 {entity:'B',pattern:'growth_sustained',direction:'growth',recentAbsoluteChange:90000,percentageChange:.2,cumulativeChange:.25,consecutivePeriods:4,confidence:'high',share:{baselineValue:500000,currentValue:590000,shareChangePp:1}},
 {entity:'C',pattern:'decline_accelerating',direction:'decline',recentAbsoluteChange:-400000,percentageChange:-.08,cumulativeChange:-.15,consecutivePeriods:3,confidence:'medium',share:{baselineValue:5000000,currentValue:4600000,shareChangePp:-2}},
 {entity:'D',pattern:'recovery',direction:'growth',recentAbsoluteChange:250000,percentageChange:.1,cumulativeChange:.05,consecutivePeriods:2,confidence:'medium',share:{baselineValue:2500000,currentValue:2750000,shareChangePp:.8}}
];
const r=E.analyze(rows);
t('motor disponible',!!E&&typeof E.analyze==='function');
t('clasifica arrastre',r.drag[0]?.entity==='C' && r.drag.every(x=>x.impact<0));
t('clasifica compensación',r.compensate[0]?.entity==='D' && r.compensate.every(x=>x.impact>0));
t('ordena por impacto monetario',Math.abs(r.drag[0].impact)>=Math.abs(r.drag[1].impact));
t('balance reconcilia',r.totals.balance===r.totals.drag+r.totals.compensate);
t('incluye score y persistencia',r.drag.every(x=>Number.isFinite(x.score)&&x.consecutivePeriods>0));
t('no confunde causalidad',/No demuestra causalidad/.test(r.methodology));
console.log(`${checks.filter(x=>x.ok).length}/${checks.length} checks motor Prioridades de acción`); checks.forEach(x=>console.log(`${x.ok?'PASS':'FAIL'} ${x.n}`)); if(checks.some(x=>!x.ok))process.exit(1);
