const fs=require('fs');
const path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','js','app.js'),'utf8');
const te=fs.readFileSync(path.join(__dirname,'..','js','analytics','temporalEngine.js'),'utf8');
let pass=0,fail=0;
function t(name,ok){if(ok){pass++;console.log('PASS',name)}else{fail++;console.error('FAIL',name)}}
const ctxjs=fs.readFileSync(path.join(__dirname,'..','js','analytics','analysisContext.js'),'utf8');
// Auditoría Análisis (canal/comparaciones): la lógica de período parcial dejó de ser un parche sobre la comparación «previous»
// y pasó a un contexto único (analysisContext) que usan TODOS los módulos y las dos comparaciones (previous y year_ago).
t('baseline 31 structure retained', app.includes('FP.productStore.aggregate') && app.includes('FP.trendEngine.analyzeMany'));
t('comparación equivalente se calcula después de los resultados de tendencia', app.indexOf('an.rows = results.filter') < app.indexOf('2. Comparación equivalente'));
t('el contexto usa temporalEngine.comparisonRanges', ctxjs.includes('T.comparisonRanges(focusRange, periodType, p.maxDate)'));
t('una sola agregación equivalente para la base', app.includes('FP.productStore.aggregate({ from: cc.baseline.from, to: cc.baseline.to, channel: ch, groupBy: an.level })'));
t('reutiliza el mapa del foco ya calculado (monthlyMaps)', app.includes('const focusMap = monthlyMaps.at(-1)'));
t('la serie histórica de patrones excluye el período parcial (solo cerrados)', app.includes('const closedMaps = monthlyMaps.filter(x => !x.partial)') && !app.includes('focusDurationDays') && !app.includes('comparableRangeFor'));
t('aplica a previous Y year_ago (antes solo previous)', ctxjs.includes("p.comparison === 'year_ago'") && !app.includes("if (TE && focus?.partial && an.comparison === 'previous')"));
t('Diagnóstico code untouched by comparison patch', app.includes("'an-level'") && app.includes("'an-comparison'"));
t('temporal engine preserves partial duration', te.includes('const sameDuration = Boolean(current && current.partial)'));
t('contribución visible (con conciliación) en Análisis', fs.readFileSync(path.join(__dirname,'..','js','ui','trend-view.js'),'utf8').includes('reconLine(a)'));
console.log(`\n${pass}/${pass+fail} PASS`); process.exit(fail?1:0);
