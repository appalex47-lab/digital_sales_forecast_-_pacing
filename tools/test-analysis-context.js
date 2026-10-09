// Pruebas unitarias del contexto de Análisis y del motor temporal (sin navegador).
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const c={console};vm.createContext(c);c.window=c;
for(const f of ['js/config/config.js','js/calendar/calendar.js','js/analytics/temporalEngine.js','js/analytics/analysisContext.js','js/analytics/contributionEngine.js','js/analytics/shareMixEngine.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
const A=c.FP.analysisContext,T=c.FP.temporalEngine;
const checks=[];const t=(n,o,d)=>checks.push({n,ok:!!o,d});
const b=(o)=>A.build({minDate:'2025-09-01',maxDate:'2026-10-05',...o});
const eq=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
// Canales
t('5 opciones: total + 4 canales reales',eq(A.channelList(),['total','ecommerce','app','whatsapp','llamadas']));
t('canal inválido cae a total (no inventa un quinto canal)',A.normChannel('xyz')==='total'&&A.normChannel(undefined)==='total'&&A.normChannel('app')==='app');
// Período parcial -> mismos días
let r=b({periodType:'month',focusKey:'2026-10'});
t('Oct parcial: foco Oct 1–5',r.focus.partial&&r.focus.from==='2026-10-01'&&r.focus.to==='2026-10-05');
t('Oct parcial vs mismos días de sep (Sep 1–5), nunca sep completo',r.comparison.baseline.from==='2026-09-01'&&r.comparison.baseline.to==='2026-09-05'&&r.comparison.text==='Oct 1–5 vs Sep 1–5',r.comparison.text);
r=b({periodType:'month',focusKey:'2026-10',comparison:'year_ago'});
t('Oct parcial YoY = Oct 1–5 de 2025',r.comparison.baseline.from==='2025-10-01'&&r.comparison.baseline.to==='2025-10-05'&&r.comparison.id==='yoy'&&/2025/.test(r.comparison.text),r.comparison.text);
r=b({periodType:'month',focusKey:'2026-09'});
t('Sep completo vs Ago completo',r.comparison.baseline.from==='2026-08-01'&&r.comparison.baseline.to==='2026-08-31'&&!r.focus.partial);
r=b({periodType:'month',focusKey:'2026-09',comparison:'year_ago'});
t('Sep completo YoY = Sep 2025 completo',r.comparison.baseline.from==='2025-09-01'&&r.comparison.baseline.to==='2025-09-30'&&r.comparison.available);
r=b({periodType:'month',focusKey:'2025-09'});
t('Sin datos de comparación (ago-2025 no existe) => no disponible (N/A), no 0 %',r.comparison.available===false&&/N\/A/.test(r.comparison.note),r.comparison.note);
r=b({periodType:'week',focusKey:'2026-W41'});
t('Semana parcial: mismos días de la semana anterior (WoW)',r.focus.partial&&r.comparison.id==='wow'&&r.comparison.baseline.from==='2026-09-28'&&r.comparison.baseline.to==='2026-09-28',JSON.stringify(r.comparison.baseline));
r=b({periodType:'day',focusKey:'2026-10-05'});
t('DoD',r.comparison.id==='dod'&&r.comparison.baseline.from==='2026-10-04');
r=b({periodType:'year',focusKey:'2026'});
t('Año en curso (YTD) vs mismo YTD del año anterior',r.focus.partial&&r.comparison.baseline.from==='2025-01-01'&&r.comparison.baseline.to==='2025-10-05',JSON.stringify(r.comparison.baseline));
// Fin de mes (bug: 31-mar −1 mes desbordaba a 3-mar)
const sh=T.shiftRange({from:'2026-03-01',to:'2026-03-31'},'month',-1);
t('Mar 1–31 −1 mes = feb 1–28 (sin desbordar a marzo)',sh.from==='2026-02-01'&&sh.to==='2026-02-28',JSON.stringify(sh));
t('29-feb −1 año = 28-feb',T.add('2024-02-29','year',-1)==='2023-02-28');
t('31-mar −1 mes = 28-feb',T.add('2026-03-31','month',-1)==='2026-02-28');
const sh2=T.shiftRange({from:'2026-03-01',to:'2026-03-30',partial:true},'month',-1,true);
t('Parcial que no cabe en el mes destino se acota y avisa',sh2.to==='2026-02-28'&&sh2.truncated===true);
t('clampRange exportado',typeof T.clampRange==='function'&&T.clampRange({from:'2026-10-01',to:'2026-10-31'},'2026-10-05').partial===true);
// pctChange
t('pctChange: sin base => null (N/A), nunca 0 ni −100',A.pctChange(10,0)===null&&A.pctChange(null,5)===null&&A.pctChange(5,undefined)===null&&A.pctChange(NaN,5)===null);
t('pctChange normal',Math.abs(A.pctChange(110,100)-0.1)<1e-12);
// Etiquetas
t('Etiqueta de rango: mes completo y año completo',A.rangeLabel('2026-09-01','2026-09-30')==='Sep 2026'&&A.rangeLabel('2025-01-01','2025-12-31')==='2025');
t('Etiqueta de rango: cruce de mes',A.rangeLabel('2026-09-28','2026-10-04')==='Sep 28–Oct 4');
// Contribución: Σ contribuciones = variación total aunque haya > topN entidades
const CE=c.FP.contributionEngine;
const rows=Array.from({length:30},(_,i)=>({entity:'E'+i,current:100+(i%2?i:-i),baseline:100,delta:(i%2?i:-i)}));
const con=CE.analyze(rows,{});
const tot=rows.reduce((s,x)=>s+x.delta,0);
t('Contribución: positiveDelta+negativeDelta = variación total con 30 entidades (top 8 solo recorta la lista)',Math.abs(con.compensation.positiveDelta+con.compensation.negativeDelta-tot)<1e-9&&Math.abs(con.totalDelta-tot)<1e-9);
// Share: Σ shares = 1
const SM=c.FP.shareMixEngine;const mix=SM.rankAndMix([{entity:'a',currentValue:50,baselineValue:20},{entity:'b',currentValue:30,baselineValue:80},{entity:'c',currentValue:20,baselineValue:0}],100,100);
t('Share: Σ participación actual = 1 y base = 1',Math.abs(mix.rows.reduce((s,x)=>s+x.currentShare,0)-1)<1e-12&&Math.abs(mix.rows.reduce((s,x)=>s+x.baselineShare,0)-1)<1e-12);
t('Share: entidad nueva detectada, sin NaN',mix.rows.find(x=>x.entity==='c').status==='new'&&mix.rows.every(x=>Number.isFinite(x.shareChangePp)));
console.log(`${checks.filter(x=>x.ok).length}/${checks.length} checks contexto/temporal`);
checks.forEach(x=>console.log(`${x.ok?'PASS':'FAIL'} ${x.n}${x.ok?'':' — '+(x.d||'')}`));
if(checks.some(x=>!x.ok))process.exit(1);
