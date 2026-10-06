const fs=require('fs'),vm=require('vm'),csv=fs.readFileSync('/mnt/data/analisis/Venta Productos 2026.csv','utf8');
const ctx=vm.createContext({FP:{},console});
vm.runInContext(fs.readFileSync('/tmp/phase21/js/analytics/trendEngine.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('/tmp/phase21/js/analytics/trendForecastEngine.js','utf8'),ctx);
const lines=csv.split(/\r?\n/); const h=lines[0].replace(/^\ufeff/,'').split(','); const di=h.indexOf('fecha')>=0?h.indexOf('fecha'):0, pi=h.indexOf('producto'), vi=h.indexOf('venta');
function parse(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
const sums=new Map();
for(let i=1;i<lines.length;i++){if(!lines[i])continue;const a=parse(lines[i]);const d=a[di], p=a[pi];if(!p||!d)continue;const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)continue;const key=`${m[3]}-${m[2]}`;const k=p+'|'+key;const v=Number(String(a[vi]).replace(/[$,]/g,''));if(Number.isFinite(v))sums.set(k,(sums.get(k)||0)+v);}
const products=new Map();for(const [k,v] of sums){const [p,period]=k.split('|');if(!products.has(p))products.set(p,[]);products.get(p).push({period,value:v});}
const candidates=[...products.entries()].filter(([,s])=>s.length>=6).sort((a,b)=>b[1].reduce((x,y)=>x+y.value,0)-a[1].reduce((x,y)=>x+y.value,0)).slice(0,20);
let pass=0,fail=0;function t(n,fn){try{if(!fn())throw Error('false');console.log('PASS',n);pass++}catch(e){console.log('FAIL',n,e.message);fail++;}}
t('CSV tiene 85k+ filas',()=>lines.length-1>85000);
t('hay productos con >=6 periodos',()=>candidates.length>0);
const [entity,series]=candidates[0];const trend=ctx.FP.trendEngine.analyzeTrend(series,{entity});const fc=ctx.FP.trendForecastEngine.forecast({...trend,series},{horizon:3,method:'ensemble',periodType:'month'});
t('entidad real tiene historia suficiente',()=>trend.periodsAnalyzed>=6);
t('forecast real disponible',()=>fc.status==='available'&&fc.periods.length===3);
t('forecast real conserva patrón',()=>fc.patternStartPeriod===trend.patternStartPeriod&&fc.patternDurationPeriods===trend.patternDurationPeriods);
t('backtest real calculado',()=>fc.backtest.periodsTested>0&&Number.isFinite(fc.backtest.mape));
t('periodos futuros son posteriores',()=>fc.periods.every((x,i)=>i===0||x.period>fc.periods[i-1].period));
console.log('REAL_ENTITY',entity,'HISTORY',trend.periodsAnalyzed,'PATTERN',trend.pattern,'START',trend.patternStartPeriod,'DURATION',trend.patternDurationPeriods,'FORECAST',fc.periods.map(x=>x.period).join(','));
console.log(`RESULT ${pass}/${pass+fail} PASS`);process.exitCode=fail?1:0;
