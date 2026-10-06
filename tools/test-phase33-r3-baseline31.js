const fs=require('fs');
const path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','js','app.js'),'utf8');
const te=fs.readFileSync(path.join(__dirname,'..','js','analytics','temporalEngine.js'),'utf8');
let pass=0,fail=0;
function t(name,ok){if(ok){pass++;console.log('PASS',name)}else{fail++;console.error('FAIL',name)}}
t('baseline 31 structure retained', app.includes('FP.productStore.aggregate') && app.includes('FP.trendEngine.analyzeMany'));
t('partial patch occurs after trend results', app.indexOf('an.rows = results.filter') < app.indexOf('Comparación parcial:'));
t('partial patch uses temporalEngine comparisonRanges', app.includes('TE.comparisonRanges(focus, periodType, m.dateMax)'));
t('partial patch uses one equivalent aggregate', app.includes('const baseMap = await FP.productStore.aggregate({ ...cmp.range'));
t('partial patch reuses current monthlyMaps', app.includes('monthlyMaps.find(x => x.period === focus.key)'));
t('partial patch does not replace historical series', !app.includes('focusDurationDays') && !app.includes('comparableRangeFor'));
t('partial patch only affects previous comparison', app.includes("an.comparison === 'previous'"));
t('Diagnóstico code untouched by comparison patch', app.includes("'an-level'") && app.includes("'an-comparison'"));
t('temporal engine preserves partial duration', te.includes('const sameDuration = current?.partial'));
t('no visible contribution panel introduced', !app.includes('contributionPanel(a)'));
console.log(`\n${pass}/${pass+fail} PASS`); process.exit(fail?1:0);
