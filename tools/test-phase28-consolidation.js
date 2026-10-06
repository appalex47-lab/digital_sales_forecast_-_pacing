const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const trend=fs.readFileSync(path.join(root,'js/ui/trend-view.js'),'utf8');
const arch=fs.readFileSync(path.join(root,'js/analytics/analysisArchitecture.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/styles.css'),'utf8');
const contribution=fs.readFileSync(path.join(root,'js/analytics/contributionEngine.js'),'utf8');
let pass=0,fail=0;
function t(name,ok){(ok?pass++:fail++);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
t('Contribución ya no se presenta como panel independiente', !trend.includes('function contributionPanel(a)') && !trend.includes('${contributionPanel(a)}'));
t('Mix Intelligence permanece como DRIVER visible', trend.includes('function shareMixPanel(a)') && trend.includes('Mix Intelligence'));
t('Arquitectura DRIVER solo expone Mix Intelligence', arch.includes("modules: ['Mix Intelligence']") && !arch.includes("modules: ['Contribución', 'Mix Intelligence']"));
t('Contribution engine se conserva como capacidad interna', contribution.includes('FP.contributionEngine'));
t('Narrativa puede seguir usando contribución interna', fs.readFileSync(path.join(root,'js/analytics/analysisNarrativeEngine.js'),'utf8').includes('contribution'));
t('Gráfica tiene eje X explícito', trend.includes('class="trend-chart__axis-line"') && trend.includes('Fecha / período'));
t('Gráfica tiene eje Y explícito', trend.includes('Crecimiento %') && trend.includes('trend-chart__axis-line'));
t('Gráfica muestra ticks y etiquetas', trend.includes('trend-chart__tick') && trend.includes('trend-chart__label'));
t('CSS de ejes existe', css.includes('.trend-chart__axis-line') && css.includes('.trend-chart__tick'));
console.log(`RESULT ${pass}/${pass+fail}`); if(fail) process.exit(1);
