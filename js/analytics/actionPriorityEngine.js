/** actionPriorityEngine.js — Prioridades de acción.
 * Fusiona Patrones Avanzados + Riesgos/Oportunidades en una sola capa de decisión.
 * Clasifica por impacto sobre venta: arrastre, compensación/crecimiento y seguimiento.
 * No determina causalidad.
 */
(function(root){
  'use strict';
  const FP=root.FP=root.FP||{};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const DEFAULTS={topN:12,weights:{impact:40,persistence:18,pattern:14,share:10,relative:10,confidence:8}};
  const cfg=(o={})=>({...DEFAULTS,...o,weights:{...DEFAULTS.weights,...(o.weights||{})}});
  function impactOf(r){
    if(finite(r.share?.currentValue)&&finite(r.share?.baselineValue)) return r.share.currentValue-r.share.baselineValue;
    if(finite(r.recentAbsoluteChange)) return r.recentAbsoluteChange;
    if(finite(r.absoluteChange)) return r.absoluteChange;
    if(finite(r.percentageChange)&&finite(r.currentValue)) return r.currentValue*r.percentageChange;
    return null;
  }
  function classify(r,impact){
    if(finite(impact) && impact<0) return 'drag';
    if(finite(impact) && impact>0) return 'compensate';
    if(r.direction==='decline') return 'drag';
    if(r.direction==='growth' || /^growth_/.test(r.pattern||'') || ['recovery','strong_recovery'].includes(r.pattern)) return 'compensate';
    return 'watch';
  }
  function patternWeight(r){
    const p=r.pattern||'', s=r.advanced?.signal||'';
    if(['decline_accelerating','decline_sustained','structural_decline'].includes(p)||s==='structural_decline') return 100;
    if(['anomaly','trend_break','early_warning'].includes(p)||['anomaly','trend_break','early_warning'].includes(s)) return 80;
    if(['growth_accelerating','growth_sustained','structural_growth','recovery','strong_recovery'].includes(p)||s==='structural_growth') return 70;
    return 45;
  }
  function score(r,impact,type,c,impactPool){
    const absImpact=Math.abs(impact||0);
    const pool=Math.max(Math.abs(impactPool||0),absImpact,1);
    const magnitude=clamp(absImpact/pool*100);
    const persistence=clamp((r.consecutivePeriods||r.periodsAnalyzed||0)*12);
    const pattern=patternWeight(r);
    const share=finite(r.share?.shareChangePp)?clamp(Math.abs(r.share.shareChangePp)*8):0;
    const relative=finite(r.percentageChange)?clamp(Math.abs(r.percentageChange)*100):0;
    const confidence=r.confidence==='high'?100:r.confidence==='medium'?70:40;
    const w=c.weights;
    const raw=magnitude*w.impact/100+persistence*w.persistence/100+pattern*w.pattern/100+share*w.share/100+relative*(w.relative||0)/100+confidence*w.confidence/100;
    return Math.round(clamp(raw));
  }
  function label(type){return type==='drag'?'Arrastra la venta':type==='compensate'?'Compensa / hace crecer':'Seguimiento';}
  function analyze(rows,options={}){
    const c=cfg(options), input=Array.isArray(rows)?rows:[];
    const baselinePeriod=options.baselinePeriod||null, currentPeriod=options.currentPeriod||null, baselinePartial=Boolean(options.baselinePartial), currentPartial=Boolean(options.currentPartial);
    const items0=input.map(r=>{
      const impact=impactOf(r), type=classify(r,impact);
      const relativeChange=finite(r.percentageChange)?r.percentageChange:(finite(r.baselineValue)&&r.baselineValue!==0?impact/r.baselineValue:null);
      return {entity:r.entity,type,impact,relativeChange,score:0,severity:'low',priorityLabel:label(type),pattern:r.pattern,direction:r.direction,
        percentageChange:relativeChange,cumulativeChange:r.cumulativeChange,consecutivePeriods:r.consecutivePeriods||r.periodsAnalyzed||0,
        currentValue:finite(r.share?.currentValue)?r.share.currentValue:(finite(r.currentValue)?r.currentValue:null),
        baselineValue:finite(r.share?.baselineValue)?r.share.baselineValue:(finite(r.baselineValue)?r.baselineValue:null),
        shareChangePp:finite(r.share?.shareChangePp)?r.share.shareChangePp:null,
        currentShare:finite(r.share?.currentShare)?r.share.currentShare:null,confidence:r.confidence,
        patternStartPeriod:r.patternStartPeriod||r.startPeriod||null,patternEndPeriod:r.patternEndPeriod||r.endPeriod||currentPeriod,
        baselinePeriod,currentPeriod,baselinePartial,currentPartial,
        reasons:[r.pattern,r.advanced?.signal,(r.consecutivePeriods||r.periodsAnalyzed||0)>=3?'persistente':null].filter(Boolean),
        evidenceBreakdown:[],evidenceSummary:null,
        dataAvailability:{available:['venta','pedidos','unidades','periodo'],missing:['stock','precio de mercado','promociones','costos/margen']},
        nextAction:type==='drag'?'Localizar dónde se concentra la caída y comprobar datos operativos antes de intervenir.':type==='compensate'?'Validar qué está impulsando el crecimiento y dónde puede sostenerse o replicarse.':'Observar persistencia y evidencia antes de actuar.'};
    }).filter(x=>x.type!=='watch' || finite(x.impact));
    const dragPool=items0.filter(x=>x.type==='drag').reduce((s,x)=>s+Math.abs(x.impact||0),0);
    const compPool=items0.filter(x=>x.type==='compensate').reduce((s,x)=>s+Math.abs(x.impact||0),0);
    const items=items0.map(x=>{
      const pool=x.type==='drag'?dragPool:x.type==='compensate'?compPool:0;
      const s=score(x,x.impact,x.type,c,pool);
      const severity=s>=80?'critical':s>=60?'high':s>=35?'medium':'low';
      const impactSharePct=pool>0?Math.abs(x.impact||0)/pool*100:null;
      return {...x,score:s,severity,impactSharePct};
    });
    const order=(a,b)=>Math.abs(b.impact||0)-Math.abs(a.impact||0)||(b.impactSharePct||0)-(a.impactSharePct||0)||(b.score-a.score);
    const drag=items.filter(x=>x.type==='drag').sort(order), compensate=items.filter(x=>x.type==='compensate').sort(order), watch=items.filter(x=>x.type==='watch').sort((a,b)=>b.score-a.score);
    const balance=items.reduce((s,x)=>s+(finite(x.impact)?x.impact:0),0);
    return {status:items.length?'available':'insufficient_data',drag:drag.slice(0,c.topN),compensate:compensate.slice(0,c.topN),watch:watch.slice(0,c.topN),all:[...items].sort(order),
      totals:{drag:drag.reduce((s,x)=>s+(x.impact||0),0),compensate:compensate.reduce((s,x)=>s+(x.impact||0),0),balance,dragAbs:dragPool,compensateAbs:compPool},
      comparison:{baselinePeriod,currentPeriod,baselinePartial,currentPartial}, thresholds:{critical:80,high:60,medium:35},
      methodology:'Priorización descriptiva: primero ordena por caída/crecimiento monetario absoluto del período comparable; después usa participación dentro del movimiento, persistencia, patrón, cambio relativo, share y confianza para orientar la investigación. No demuestra causalidad.'};
  }
  FP.actionPriorityEngine={DEFAULTS,analyze,impactOf,classify};
})(typeof window!=='undefined'?window:globalThis);
