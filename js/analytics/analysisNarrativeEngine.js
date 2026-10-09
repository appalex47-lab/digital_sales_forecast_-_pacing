/** analysisNarrativeEngine.js — Fase 23: narrativa ejecutiva trazable.
 * Orquesta resultados ya calculados de las seis capas de Análisis.
 * No calcula métricas nuevas, no inventa cifras y no convierte señales/hipótesis en causalidad.
 */
(function(root){
  'use strict';
  const FP=root.FP=root.FP||{};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const pct=v=>finite(v)?`${(v*100).toFixed(1)} %`:'—';
  const money=v=>finite(v)?(FP.format&&FP.format.currency?FP.format.currency(v,0):String(Math.round(v))):'—';
  const claim=(layer,level,text,source,numbers=[])=>{
    const detected=[];
    const re=/-?\$?\d[\d,]*(?:\.\d+)?\s?%?/g;
    let m;
    while((m=re.exec(text))){ const raw=m[0].replace(/[^0-9.-]/g,''); if(raw&&raw!=='-'&&raw!=='.') detected.push(parseFloat(raw)); }
    return {id:`an-${layer}-${Math.random().toString(36).slice(2,9)}`,layer,level,text,source,numbers:[...new Set([...numbers,...detected])]};
  };
  const layerMeta=[
    {id:'fact',label:'HECHO',question:'¿Qué pasó y cuánto?'},
    {id:'driver',label:'DRIVER',question:'¿Qué variable lo explica matemáticamente?'},
    {id:'signal',label:'SEÑAL',question:'¿Dónde merece investigarse?'},
    {id:'hypothesis',label:'HIPÓTESIS',question:'¿Qué podría estar explicándolo?'},
    {id:'projection',label:'PROYECCIÓN',question:'¿Qué puede pasar después?'},
    {id:'lifecycle',label:'CICLO DE VIDA',question:'¿Cómo se comporta a través del tiempo?'}
  ];
  function build({rows=[],risks=null,forecast=null,contribution=null,share=null,cohort=null,diagnostic=null,level='product',context=null}={}){
    const cmpText=context&&context.comparison&&context.comparison.text?context.comparison.text:null;
    const scopeText=context?`${context.channelLabel||'Total digital'}${cmpText?` · ${cmpText}`:''}`:null;
    const valid=Array.isArray(rows)?rows:[];
    const sections={fact:[],driver:[],signal:[],hypothesis:[],projection:[],lifecycle:[]};
    const layerStatus={};
    layerMeta.forEach(l=>layerStatus[l.id]='insufficient');
    if(!valid.length)return {schema:'analysis-narrative',schemaVersion:2,ready:false,level,layers:layerMeta,layerStatus,executiveSummary:'No hay suficiente histórico para construir una narrativa.',sections,claims:[],nextQuestion:'Carga suficiente histórico para iniciar la lectura analítica.',note:'La narrativa usa únicamente resultados calculados por Análisis.'};

    const growth=valid.filter(r=>r.direction==='growth').length, decline=valid.filter(r=>r.direction==='decline').length;
    sections.fact.push(claim('fact','hecho',`${scopeText?`[${scopeText}] `:''}Se analizaron ${valid.length} entidades en el nivel ${level}.`,{module:'analysisNarrativeEngine',field:'rows.length'},[valid.length]));
    if(growth||decline){
      const dir=growth>=decline?'crecimiento':'deterioro';
      const n=dir==='crecimiento'?growth:decline;
      sections.fact.push(claim('fact','calculo',`La dirección predominante es ${dir}, con ${n} entidades en esa dirección.`,{module:'analysisNarrativeEngine',field:'directionCounts'},[n]));
    }
    layerStatus.fact='available';

    if(contribution&&contribution.status==='available'){
      const positives=Array.isArray(contribution.positive)?contribution.positive:[];
      const negatives=Array.isArray(contribution.negative)?contribution.negative:[];
      const list=contribution.direction==='decline'?negatives:positives;
      if(list[0]) sections.driver.push(claim('driver','driver',`${list[0].entity} concentra la mayor contribución matemática al movimiento observado (${money(list[0].delta)}); esto describe atribución del movimiento, no causalidad.`,{module:'contributionEngine',field:'topContributor',entity:list[0].entity},[list[0].delta]));
      if(finite(contribution.totalDelta)) sections.driver.push(claim('driver','reconciliacion',`El movimiento neto conciliado${cmpText?` (${cmpText})`:''} es ${money(contribution.totalDelta)}.`,{module:'contributionEngine',field:'totalDelta'},[contribution.totalDelta]));
      layerStatus.driver=sections.driver.length?'available':'insufficient';
    }

    const topRisk=risks&&Array.isArray(risks.risks)&&risks.risks[0];
    const topOpp=risks&&Array.isArray(risks.opportunities)&&risks.opportunities[0];
    if(topRisk) sections.signal.push(claim('signal','senal',`${topRisk.entity} aparece como la señal negativa prioritaria; merece investigación, pero no constituye una causa confirmada.`,{module:'actionPriorityEngine',field:'risks[0]',entity:topRisk.entity},[topRisk.score]));
    if(topOpp) sections.signal.push(claim('signal','senal',`${topOpp.entity} aparece como la principal señal de compensación/crecimiento; requiere validación antes de atribuir una causa.`,{module:'actionPriorityEngine',field:'opportunities[0]',entity:topOpp.entity},[topOpp.score]));
    layerStatus.signal=sections.signal.length?'available':'insufficient';

    const externalHyp=diagnostic&&Array.isArray(diagnostic.hypotheses)?diagnostic.hypotheses:[];
    if(externalHyp.length){
      externalHyp.slice(0,2).forEach(h=>sections.hypothesis.push(claim('hypothesis','hipotesis',`${h.hypothesis||h.text||'Existe una hipótesis pendiente de validación.'} Requiere evidencia adicional antes de considerarse explicación.`,{module:'hypothesisEngine',field:'hypotheses',id:h.id},[])));
    } else if(sections.signal.length){
      sections.hypothesis.push(claim('hypothesis','hipotesis','Las señales identificadas todavía requieren validación externa; la narrativa no las presenta como causas.',{module:'analysisNarrativeEngine',field:'hypothesisGuard'},[]));
    }
    layerStatus.hypothesis=sections.hypothesis.length?'available':'insufficient';

    const fc=forecast&&Array.isArray(forecast.rows)&&forecast.rows.find(x=>x.status==='available');
    if(fc) sections.projection.push(claim('projection','calculo',`Para ${fc.entity}, el forecast a ${fc.horizon} períodos implica un cambio esperado de ${pct(fc.changeToHorizon)} frente al último valor observado.`,{module:'trendForecastEngine',field:'changeToHorizon',entity:fc.entity},[fc.horizon,fc.changeToHorizon]));
    layerStatus.projection=sections.projection.length?'available':'insufficient';

    const s=cohort&&cohort.summary;
    if(cohort&&cohort.status==='available'&&s){
      sections.lifecycle.push(claim('lifecycle','hecho',`En el último período completo se observaron ${s.newCount||0} entidades nuevas, ${s.retainedCount||0} con continuidad, ${s.reactivatedCount||0} reactivadas y ${s.lostCount||0} perdidas (entidades de producto, no clientes).`,{module:'cohortEngine',field:'summary',period:cohort.latestPeriod},[s.newCount,s.retainedCount,s.reactivatedCount,s.lostCount]));
      if(finite(s.retentionRate)) sections.lifecycle.push(claim('lifecycle','calculo',`La continuidad observada frente al período anterior fue de ${pct(s.retentionRate)}.`,{module:'cohortEngine',field:'retentionRate'},[s.retentionRate]));
      layerStatus.lifecycle='available';
    }

    const claims=layerMeta.flatMap(l=>sections[l.id]);
    const factText=sections.fact[1]?.text||sections.fact[0]?.text||'';
    const driverText=sections.driver[0]?.text||'';
    const signalText=sections.signal[0]?.text||'';
    const lifecycleText=sections.lifecycle[0]?.text||'';
    const projectionText=sections.projection[0]?.text||'';
    const executiveSummary=(scopeText&&!factText.startsWith('['+scopeText)?`[${scopeText}] `:'')+[factText,driverText,signalText,lifecycleText,projectionText].filter(Boolean).slice(0,4).join(' ');
    const nextQuestion=sections.hypothesis.length&&sections.hypothesis[0].level==='hipotesis'
      ? '¿Qué evidencia externa permitiría validar o descartar la hipótesis antes de tomar acción?'
      : sections.signal.length?'¿Qué dato operativo permite investigar la señal prioritaria?':'¿Qué variable adicional conviene contrastar para explicar el movimiento?';
    return {schema:'analysis-narrative',schemaVersion:2,ready:true,level,context:context||null,layers:layerMeta,layerStatus,executiveSummary,sections,claims,nextQuestion,note:'La narrativa es descriptiva y trazable: reutiliza cálculos existentes, no inventa cifras ni establece causalidad.'};
  }
  FP.analysisNarrativeEngine={build,layerMeta:Object.freeze(layerMeta)};
})(typeof window!=='undefined'?window:globalThis);
