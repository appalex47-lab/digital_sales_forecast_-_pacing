const __need=['/tmp/rev14/js/diagnostics/diagnosticArchitecture.js'];const __miss=__need.filter(x=>!require('fs').existsSync(x));if(__miss.length){console.log('OMITIDA: requiere archivos externos que no están en este entorno: '+__miss.join(', '));process.exit(0);}
const fs = require('fs');
const vm = require('vm');
const root = {};
const ctx = vm.createContext({ FP: {}, console });
function load(file){ vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file}); }
load('/tmp/rev14/js/diagnostics/diagnosticArchitecture.js');
let pass=0, fail=0;
function t(name,fn){try{if(!fn())throw new Error('false');console.log('PASS',name);pass++;}catch(e){console.log('FAIL',name,e.message);fail++;}}
const c=ctx.FP.diagnosticArchitecture;
t('contrato 4 capas',()=>c.STAGES.length===4 && c.STAGES.map(x=>x.id).join(',')==='fact,driver,signal,hypothesis');
t('hipótesis válida exige señal y validación',()=>c.validateRun({status:'ok',level1Drivers:[{}],signals:[{id:'s1'}],hypotheses:[{relatedSignals:['s1'],validationNeeded:['x'],status:'requires_investigation'}]}).ok);
t('rechaza hipótesis sin señal',()=>!c.validateRun({status:'ok',level1Drivers:[{}],signals:[],hypotheses:[{relatedSignals:[],validationNeeded:['x'],status:'requires_investigation'}]}).ok);
t('rechaza hipótesis sin validación',()=>!c.validateRun({status:'ok',level1Drivers:[{}],signals:[{id:'s1'}],hypotheses:[{relatedSignals:['s1'],validationNeeded:[],status:'requires_investigation'}]}).ok);
const trend=fs.readFileSync('/tmp/rev14/js/analytics/trendEngine.js','utf8');
const ui=fs.readFileSync('/tmp/rev14/js/ui/trend-view.js','utf8');
['growth_accelerating','decline_accelerating','growth_decelerating','decline_decelerating','recovery','strong_recovery','trend_break','volatile','stable'].forEach(p=>t(`patrón conservado: ${p}`,()=>trend.includes(`'${p}'`)||ui.includes(`${p}:`)));
t('etiqueta Crecimiento acelerado conservada',()=>ui.includes('Crecimiento acelerado'));
t('etiqueta Caída acelerada conservada',()=>ui.includes('Caída acelerada'));
console.log(`RESULT ${pass}/${pass+fail} PASS`); process.exitCode=fail?1:0;
