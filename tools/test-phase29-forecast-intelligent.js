const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'); let pass=0,fail=0;
const t=(name,fn)=>{try{assert.ok(fn());console.log('PASS',name);pass++;}catch(e){console.log('FAIL',name,e.message);fail++;}};
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const view=fs.readFileSync(path.join(root,'js/ui/trend-view.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'js/analytics/trendForecastEngine.js'),'utf8');
t('Forecast está aislado con try/catch',app.includes("an.forecast = FP.trendForecastEngine.analyzeMany")&&app.includes("an.forecast = { status: 'error'") );
t('Un error posterior no borra an.rows',app.includes('if (coreRows.length) an.rows = coreRows;')&&!app.includes('an.rows = []; an.selected = null; an.error ='));
t('Forecast UI maneja error sin bloquear Análisis',view.includes("f.status === 'error'")&&view.includes('Evolución, Mix, Prioridades'));
t('Forecast por entidad no rompe todo el lote',engine.includes("status:'row_error'")&&engine.includes('for(const row of'));
t('Compatibilidad sin Array.at en piezas nuevas',!engine.includes('unitVals.at(-1)')&&!engine.includes('unitPred.at(-1)'));
// Simulate that a forecast failure is handled as an isolated layer rather than a core failure.
const ctx=vm.createContext({FP:{},console});vm.runInContext(engine,ctx);
const FE=ctx.FP.trendForecastEngine;
const good={entity:'GOOD',series:[1,2,3,4].map((value,i)=>({period:`2026-0${i+1}`,value})),unitSeries:[1,2,3,4].map((value,i)=>({period:`2026-0${i+1}`,value}))};
const bad={entity:'BAD',series:null,unitSeries:null};
const out=FE.analyzeMany([bad,good],{horizon:3});
t('Un registro defectuoso no elimina los demás forecasts',out.rows.length===1&&out.rows[0].entity==='GOOD');
console.log(`RESULT ${pass}/${pass+fail}`);process.exitCode=fail?1:0;
