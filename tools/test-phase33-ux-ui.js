const fs=require('fs');
const app=fs.readFileSync('js/app.js','utf8'), view=fs.readFileSync('js/ui/trend-view.js','utf8');
const checks=[
 ['muestra periodo focal parcial',view.includes('Periodo focal')&&view.includes('parcial')],
 ['muestra comparación explícita',view.includes('Comparación principal')],
 ['prioridades muestran comparación analizada',view.includes('Comparación analizada')],
 ['Mix muestra comparación',view.includes('Comparación')&&view.includes('mix-comparison')],
 ['venta actual identifica periodo',view.includes('Venta actual <small>')],
 ['venta comparable identifica periodo base',view.includes('Venta comparable <small>')],
 ['no aparece Contribución y origen',!view.includes('Contribución y origen')],
 ['no se altera diagnóstico en app',app.includes('diagnosticEngine.runDiagnostic')],
 ['paginación de evolución permanece',view.includes('an-page')],
 ['lectura de entidad permanece',view.includes('entity-reading-panel')],
 ['Mix y Prioridades reciben rangos comparables',app.includes('comparisonRanges')&&app.includes('comparisonRanges: { baseline: baseRange, current: curRange }')],
 ['sin scroll horizontal como dependencia del primer vistazo',!view.includes('overflow-x:scroll')]
];
checks.forEach(([n,o])=>console.log((o?'PASS ':'FAIL ')+n));
console.log(`${checks.filter(x=>x[1]).length}/${checks.length} checks UX/UI Fase 33`);if(checks.some(x=>!x[1]))process.exit(1);
