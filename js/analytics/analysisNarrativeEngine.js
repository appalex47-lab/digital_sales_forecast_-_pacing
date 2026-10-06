/** analysisNarrativeEngine.js — Análisis 7: narrativa del módulo Análisis.
 * Convierte resultados ya calculados (evolución, patrones, share, contribución, riesgos y forecast)
 * en claims trazables. No calcula métricas nuevas ni establece causalidad.
 */
(function(root){
  'use strict';
  const FP=root.FP=root.FP||{};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const pct=v=>finite(v)?`${(v*100).toFixed(1)} %`:'—';
  const money=v=>finite(v)?(FP.format&&FP.format.currency?FP.format.currency(v,0):String(Math.round(v))):'—';
  const claim=(level,text,source,numbers=[])=>({id:`an-${level}-${Math.random().toString(36).slice(2,9)}`,level,text,source,numbers});
  function build({rows=[],risks=null,forecast=null,contribution=null,share=null,level='product'}={}){
    const valid=Array.isArray(rows)?rows:[];
    const sections={whatHappened:[],priority:[],forecast:[],mix:[],nextSteps:[]};
    if(!valid.length)return {schema:'analysis-narrative',schemaVersion:1,ready:false,executiveSummary:'No hay suficiente histórico para construir una narrativa.',sections,claims:[],note:'La narrativa usa únicamente resultados calculados por Análisis.'};
    const growth=valid.filter(r=>r.direction==='growth').length, decline=valid.filter(r=>r.direction==='decline').length;
    sections.whatHappened.push(claim('hecho',`Se analizaron ${valid.length} entidades en el nivel ${level}.`,{module:'analysisNarrativeEngine',field:'rows.length'},[valid.length]));
    if(growth||decline){
      const dir=growth>=decline?'crecimiento':'deterioro';
      const n=dir==='crecimiento'?growth:decline;
      sections.whatHappened.push(claim('calculo',`La dirección predominante es ${dir}, con ${n} entidades en esa dirección.`,{module:'analysisNarrativeEngine',field:'directionCounts'},[n]));
    }
    const topRisk=risks&&risks.risks&&risks.risks[0], topOpp=risks&&risks.opportunities&&risks.opportunities[0];
    if(topRisk) sections.priority.push(claim('senal',`La prioridad de riesgo más alta corresponde a ${topRisk.entity}, con score ${topRisk.score}; es una señal para investigar, no una causa confirmada.`,{module:'riskOpportunityEngine',field:'risks[0]'},[topRisk.score]));
    if(topOpp) sections.priority.push(claim('senal',`La oportunidad prioritaria corresponde a ${topOpp.entity}, con score ${topOpp.score}; requiere validación antes de actuar.`,{module:'riskOpportunityEngine',field:'opportunities[0]'},[topOpp.score]));
    const fc=forecast&&forecast.rows&&forecast.rows[0];
    if(fc&&fc.status==='available'){
      sections.forecast.push(claim('calculo',`Para ${fc.entity}, el forecast a ${fc.horizon} meses implica un cambio esperado de ${pct(fc.changeToHorizon)} frente al último valor observado.`,{module:'trendForecastEngine',field:'changeToHorizon',entity:fc.entity},[fc.horizon,fc.changeToHorizon]));
    }
    if(share&&share.winners&&share.losers){
      if(share.winners[0]) sections.mix.push(claim('hecho',`${share.winners[0].entity} es el principal ganador de participación dentro del mix analizado.`,{module:'shareMixEngine',field:'winners[0]',entity:share.winners[0].entity}));
      if(share.losers[0]) sections.mix.push(claim('hecho',`${share.losers[0].entity} es el principal perdedor de participación dentro del mix analizado.`,{module:'shareMixEngine',field:'losers[0]',entity:share.losers[0].entity}));
    }
    if(contribution&&contribution.status==='available'){
      const list=contribution.direction==='decline'?contribution.negative:contribution.positive;
      if(list&&list[0]) sections.nextSteps.push(claim('driver',`${list[0].entity} concentra la mayor contribución matemática al movimiento observado (${money(list[0].delta)}); esto describe atribución del movimiento, no causalidad.`,{module:'contributionEngine',field:'topContributor',entity:list[0].entity},[list[0].delta]));
    }
    if(!sections.nextSteps.length) sections.nextSteps.push(claim('accion','Revisar primero las señales prioritarias y después contrastarlas con datos operativos antes de tomar una decisión.',{module:'analysisNarrativeEngine',field:'nextStep'}));
    const claims=Object.values(sections).flat();
    const first=claims.slice(0,3).map(x=>x.text).join(' ');
    return {schema:'analysis-narrative',schemaVersion:1,ready:true,executiveSummary:first,sections,claims,note:'La narrativa es descriptiva: reutiliza cálculos existentes, no inventa cifras ni establece causalidad.'};
  }
  FP.analysisNarrativeEngine={build};
})(typeof window!=='undefined'?window:globalThis);
