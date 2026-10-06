const fs=require('fs'),vm=require('vm');
const ctx={console}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/analytics/actionPriorityEngine.js','utf8'),ctx);
const E=ctx.FP.actionPriorityEngine;
const rows=[
 {entity:'A',pattern:'decline_sustained',direction:'decline',recentAbsoluteChange:-120000,percentageChange:-.12,consecutivePeriods:5,confidence:'high',patternStartPeriod:'2026-05',patternEndPeriod:'2026-09',share:{baselineValue:1000000,currentValue:880000,shareChangePp:-1}},
 {entity:'B',pattern:'growth_sustained',direction:'growth',recentAbsoluteChange:90000,percentageChange:.2,consecutivePeriods:4,confidence:'high',share:{baselineValue:500000,currentValue:590000,shareChangePp:1}},
 {entity:'C',pattern:'decline_accelerating',direction:'decline',recentAbsoluteChange:-400000,percentageChange:-.08,consecutivePeriods:3,confidence:'medium',share:{baselineValue:5000000,currentValue:4600000,shareChangePp:-2}},
 {entity:'D',pattern:'recovery',direction:'growth',recentAbsoluteChange:250000,percentageChange:.1,consecutivePeriods:2,confidence:'medium',share:{baselineValue:2500000,currentValue:2750000,shareChangePp:.8}}
];
const r=E.analyze(rows,{baselinePeriod:'2026-08',currentPeriod:'2026-09'});
const checks=[];const t=(n,o)=>checks.push({n,ok:!!o});
t('motor disponible',typeof E.analyze==='function');
t('arrastre por mayor caída monetaria',r.drag[0]?.entity==='C' && Math.abs(r.drag[0].impact)>Math.abs(r.drag[1].impact));
t('compensación por mayor crecimiento monetario',r.compensate[0]?.entity==='D');
t('periodos quedan ligados a la comparación',r.drag.every(x=>x.baselinePeriod==='2026-08'&&x.currentPeriod==='2026-09'));
t('porcentaje relativo correcto',Math.abs(r.drag[0].percentageChange-(-.08))<1e-9);
t('participación dentro del movimiento',r.drag[0].impactSharePct>r.drag[1].impactSharePct);
t('persistencia y patrón disponibles',r.drag.every(x=>Number.isFinite(x.score)&&x.consecutivePeriods>0&&x.pattern));
t('balance reconcilia',Math.abs(r.totals.balance-(r.totals.drag+r.totals.compensate))<1e-9);
t('metodología explica jerarquía',/monetario absoluto/.test(r.methodology)&&/persistencia/.test(r.methodology));
t('no confunde causalidad',/No demuestra causalidad/.test(r.methodology));
console.log(`${checks.filter(x=>x.ok).length}/${checks.length} checks motor Fase 25`);checks.forEach(x=>console.log(`${x.ok?'PASS':'FAIL'} ${x.n}`));if(checks.some(x=>!x.ok))process.exit(1);
