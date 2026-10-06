const fs=require('fs'),vm=require('vm');
const ctx={console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/analytics/contributionEngine.js','utf8'),ctx);
const E=ctx.FP.contributionEngine;
const rows=[
 {entity:'A',baseline:1000,current:800,delta:-200,shareChangePp:-.4},
 {entity:'B',baseline:500,current:900,delta:400,shareChangePp:1.2},
 {entity:'C',baseline:200,current:100,delta:-100,shareChangePp:-.2}
];
const r=E.analyze(rows,{baselinePeriod:'2026-08',currentPeriod:'2026-09'});
const checks=[];
const t=(n,o)=>checks.push({n,ok:!!o});
t('engine disponible',typeof E.analyze==='function');
t('base y actual preservados',r.negative[0].baseline===1000 && r.negative[0].current===800);
t('cambio porcentual por entidad',Math.abs(r.negative[0].deltaPct+.2)<1e-9);
t('aporte al cambio neto calculado',Math.abs(r.negative[0].contributionPct-(-2))<1e-9);
t('peso absoluto calculado',Math.abs(r.negative[0].movementShare-(200/700))<1e-9);
t('rol matemático',r.negative[0].role==='drag' && r.positive[0].role==='compensator');
t('periodos comparables preservados',r.baselinePeriod==='2026-08' && r.currentPeriod==='2026-09');
t('share delta preservado',r.positive[0].shareChangePp===1.2);
t('reconciliación positiva + negativa',Math.abs(r.compensation.positiveDelta+r.compensation.negativeDelta-r.totalDelta)<1e-9);
console.log(`${checks.filter(x=>x.ok).length}/${checks.length} checks DRIVER Fase 26`);checks.forEach(x=>console.log(`${x.ok?'PASS':'FAIL'} ${x.n}`));if(checks.some(x=>!x.ok))process.exit(1);
