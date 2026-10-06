/** trendForecastEngine.js — Análisis 6: forecast de tendencias históricas.
 * Proyección descriptiva desde las series de Análisis. No sustituye al Forecast operativo PLAN→ACTUAL.
 */
(function(root){
  'use strict';
  const FP=root.FP=root.FP||{};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const DEFAULTS={horizon:3,method:'linear',minPoints:4,topN:10};
  const cfg=o=>({...DEFAULTS,...(o||{})});
  function clean(series){return (Array.isArray(series)?series:[]).filter(x=>finite(x.value));}
  function nextPeriod(period,n,type='month'){ if(type==='year'){const d=new Date(Date.UTC(Number(period),0,1));d.setUTCFullYear(d.getUTCFullYear()+n);return String(d.getUTCFullYear());} if(type==='day'){const d=new Date(`${period}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;} if(type==='week'){const m=period.match(/^(\d{4})-W(\d{2})$/); if(!m)return period; const d=new Date(Date.UTC(Number(m[1]),0,1+(Number(m[2])-1)*7));d.setUTCDate(d.getUTCDate()+7*n); const y=d.getUTCFullYear(); const first=new Date(Date.UTC(y,0,1)); const w=Math.ceil((((d-first)/86400000)+1)/7);return `${y}-W${String(w).padStart(2,'0')}`;} const d=new Date(`${period}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }
  function linear(vals,h){
    const n=vals.length, xm=(n-1)/2, ym=vals.reduce((a,b)=>a+b,0)/n;
    let num=0,den=0; vals.forEach((v,i)=>{num+=(i-xm)*(v-ym);den+=(i-xm)*(i-xm);});
    const slope=den?num/den:0, intercept=ym-slope*xm;
    return Array.from({length:h},(_,j)=>Math.max(0,intercept+slope*(n+j)));
  }
  function recentAverage(vals,h){const w=Math.min(3,vals.length), avg=vals.slice(-w).reduce((a,b)=>a+b,0)/w;return Array(h).fill(Math.max(0,avg));}
  function residualStd(vals){if(vals.length<3)return null;const n=vals.length,xm=(n-1)/2,ym=vals.reduce((a,b)=>a+b,0)/n;let num=0,den=0;vals.forEach((v,i)=>{num+=(i-xm)*(v-ym);den+=(i-xm)*(i-xm);});const s=den?num/den:0,b=ym-s*xm;const e=vals.map((v,i)=>v-(b+s*i));const m=e.reduce((a,b)=>a+b,0)/n;return Math.sqrt(e.reduce((a,b)=>a+(b-m)**2,0)/n);}
  function confidenceScore(r){
    const n=r.historyPoints||0;
    let score=0;
    score += Math.min(25, n/12*25);
    const mape=r.backtest&&finite(r.backtest.mape)?r.backtest.mape:null;
    if(mape===null) score+=8;
    else if(mape<=0.05) score+=25;
    else if(mape<=0.10) score+=20;
    else if(mape<=0.20) score+=14;
    else if(mape<=0.35) score+=7;
    const vol=finite(r.volatilityPct)?r.volatilityPct:null;
    if(vol===null) score+=8;
    else if(vol<=0.05) score+=20;
    else if(vol<=0.10) score+=16;
    else if(vol<=0.20) score+=10;
    else if(vol<=0.35) score+=5;
    const consistency=finite(r.directionConsistency)?r.directionConsistency:null;
    if(consistency!==null) score += Math.min(22, consistency*22);
    else score += Math.min(22, (r.consecutivePeriods||0)>=4 ? 22 : (r.consecutivePeriods||0)>=2 ? 15 : 7);
    return Math.round(clamp(score,0,100));
  }
  function confidenceLabel(score){ return score>=65?'high':score>=50?'medium':'low'; }
  function directionReading(r){
    const d=r.direction, n=r.consecutivePeriods||0, p=r.pattern||'';
    if(d==='growth'){
      if(p==='growth_accelerating') return `↑ Creciendo y acelerando desde hace ${n} ${n===1?'período':'períodos'}`;
      if(p==='growth_decelerating') return `↗ Creciendo, pero desacelerando desde hace ${n} ${n===1?'período':'períodos'}`;
      if(p==='recovery'||p==='strong_recovery') return `↗ Recuperándose desde hace ${n} ${n===1?'período':'períodos'}`;
      return `↑ Creciendo desde hace ${n} ${n===1?'período':'períodos'}`;
    }
    if(d==='decline'){
      if(p==='decline_accelerating') return `↓ Cayendo y acelerando desde hace ${n} ${n===1?'período':'períodos'}`;
      if(p==='decline_decelerating') return `↘ Cayendo, pero desacelerando desde hace ${n} ${n===1?'período':'períodos'}`;
      return `↓ Cayendo desde hace ${n} ${n===1?'período':'períodos'}`;
    }
    if(p==='volatile'||p==='anomaly') return '⚠ Volátil / sin dirección estable';
    return `→ Estable o sin dirección dominante${n?` durante ${n} ${n===1?'período':'períodos'}`:''}`;
  }
  function forecast(row,options={}){
    const c=cfg(options), s=clean(row.series), vals=s.map(x=>x.value), n=vals.length, type=c.periodType||'month';
    if(n<c.minPoints)return {status:'insufficient_data',entity:row.entity,historyPoints:n,confidence:'insufficient',confidenceScore:0,periods:[],direction:row.direction||'insufficient',pattern:row.pattern||null,patternStartPeriod:row.patternStartPeriod||row.startPeriod||null,patternDurationPeriods:row.patternDurationPeriods||row.consecutivePeriods||0};
    const h=Math.max(1,Math.min(12,Number(c.horizon)||3));
    const base=vals[vals.length-1];
    const linearVals=linear(vals,h), avgVals=recentAverage(vals,h);
    let pred=c.method==='average'?avgVals:linearVals;
    if(c.method==='ensemble') pred=pred.map((v,i)=>(v+avgVals[i])/2);
    const sd=residualStd(vals), periods=Array.from({length:h},(_,i)=>{const value=pred[i], margin=finite(sd)?sd*Math.sqrt(1+(i+1)/n):null;return {period:nextPeriod(s[n-1].period,i+1,type),value,low:margin===null?null:Math.max(0,value-margin),high:margin===null?null:value+margin};});
    const total=periods.reduce((a,x)=>a+x.value,0), last=base, change=last?periods[periods.length-1].value/last-1:null;
    const slope=n>1?(vals[n-1]-vals[0])/(n-1):0;
    const changes=vals.slice(1).map((v,i)=>vals[i]!==0?v/vals[i]-1:null).filter(finite);
    const positive=changes.filter(x=>x>=0.03).length, negative=changes.filter(x=>x<=-0.03).length;
    const directionConsistency=changes.length?Math.max(positive,negative)/changes.length:0;
    const volatility=changes.length?Math.sqrt(changes.reduce((a,x)=>a+x*x,0)/changes.length - (changes.reduce((a,x)=>a+x,0)/changes.length)**2):null;
    let backtest={periodsTested:0,mae:null,mape:null};
    const testCount=Math.min(3,Math.max(1,n-c.minPoints));
    if(testCount>0){ let ae=0,ape=0,valid=0; for(let k=testCount;k>=1;k--){const train=vals.slice(0,n-k), actual=vals[n-k]; if(train.length<c.minPoints)continue; const lv=linear(train,1)[0], av=recentAverage(train,1)[0]; const pred1=c.method==='average'?av:c.method==='ensemble'?(lv+av)/2:lv; ae+=Math.abs(actual-pred1); if(actual!==0)ape+=Math.abs((actual-pred1)/actual); valid++; } if(valid){backtest={periodsTested:valid,mae:ae/valid,mape:ape/valid};} }
    const volatilityPct=volatility;
    const preliminary={historyPoints:n,backtest,volatilityPct,directionConsistency,consecutivePeriods:row.consecutivePeriods||row.patternDurationPeriods||0};
    const cScore=confidenceScore(preliminary), cLabel=confidenceLabel(cScore);
    const unitSeries=clean(row.unitSeries), unitVals=unitSeries.map(x=>x.value), unitLast=unitVals.at(-1);
    const unitPred=unitVals.length>=c.minPoints ? (c.method==='average'?recentAverage(unitVals,h):c.method==='ensemble'?linear(unitVals,h).map((v,i)=>(v+recentAverage(unitVals,h)[i])/2):linear(unitVals,h)) : [];
    const lastUnit=finite(unitLast)?unitLast:null;
    const forecastUnitLast=unitPred.length?unitPred.at(-1):null;
    const avgPrice=finite(lastUnit)&&lastUnit>0?last/lastUnit:null;
    return {status:'available',entity:row.entity,historyPoints:n,lastPeriod:s[n-1].period,lastValue:last,patternStartPeriod:row.patternStartPeriod||row.startPeriod||null,patternEndPeriod:row.patternEndPeriod||row.endPeriod||s[n-1].period,patternDurationPeriods:row.patternDurationPeriods||row.consecutivePeriods||0,horizon:h,method:c.method,periodType:type,periods,totalForecast:total,changeToHorizon:change,slope,confidence:cLabel,confidenceScore:cScore,residualStd:sd,volatilityPct,directionConsistency,latestPattern:row.pattern||null,direction:row.direction||'stable',pattern:row.pattern||null,directionReading:directionReading(row),backtest,latestUnits:lastUnit,forecastUnits:forecastUnitLast,unitChangeToHorizon:finite(lastUnit)&&lastUnit!==0&&finite(forecastUnitLast)?forecastUnitLast/lastUnit-1:null,latestAvgUnitPrice:avgPrice};
  }
  function analyzeMany(rows,options={}){
    const c=cfg(options), results=(Array.isArray(rows)?rows:[]).map(r=>forecast(r,c));
    const available=results.filter(r=>r.status==='available');
    const scored=available.slice().sort((a,b)=>{
      const cd=(b.confidenceScore||0)-(a.confidenceScore||0); if(cd) return cd;
      const impact=Math.abs((b.totalForecast||0)-(b.lastValue||0))-Math.abs((a.totalForecast||0)-(a.lastValue||0)); if(impact) return impact;
      return (b.patternDurationPeriods||0)-(a.patternDurationPeriods||0);
    });
    return {status:available.length?'available':'insufficient_data',method:c.method,horizon:c.horizon,rows:scored,growth:available.filter(r=>(r.changeToHorizon||0)>0).length,decline:available.filter(r=>(r.changeToHorizon||0)<0).length,stable:available.filter(r=>(r.changeToHorizon||0)===0).length,highConfidence:available.filter(r=>r.confidence==='high').length,mediumConfidence:available.filter(r=>r.confidence==='medium').length,lowConfidence:available.filter(r=>r.confidence==='low').length,methodology:'Proyección descriptiva basada en la serie histórica. El ranking prioriza confiabilidad, después impacto proyectado, duración y consistencia. No establece causalidad ni garantiza el resultado futuro. Se compara contra un backtest cronológico cuando existe historia suficiente; el error histórico no garantiza el error futuro. Los límites representan variabilidad histórica y no son intervalos de confianza estadísticos.'};
  }
  FP.trendForecastEngine={DEFAULTS,forecast,analyzeMany};
})(typeof window!=='undefined'?window:globalThis);
