#!/usr/bin/env node
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console, globalThis: null }; ctx.globalThis = ctx;
ctx.FP = {
  narrativeEngine: { numbersIn: (text) => (String(text).match(/-?\d+(?:[.,]\d+)?/g) || []) },
  cohereClient: {
    chatJson: async () => ({ ok:true, status:'ok', text: JSON.stringify({
      answer:'VIDAZA cae en el período comparable y aparece entre las principales señales de arrastre.',
      evidence:[{entity:'VIDAZA', reason:'Presenta un movimiento negativo y está priorizada por impacto.', source:'SEÑAL · Prioridades de acción'}],
      nextQuestion:'¿Desde cuándo se mantiene la caída?', limitations:[]
    }), model:'test-model' }),
    parseJson: (text) => ({ok:true,value:JSON.parse(text)})
  },
  config:{diagnostics:{cohere:{model:'test-model'}}}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/ai/cohereAnalysisAssistant.js','utf8'), ctx);
const A = ctx.FP.cohereAnalysisAssistant;
assert(A && typeof A.buildContext === 'function' && typeof A.ask === 'function');
const state = { an:{
  level:'product', periodType:'month', periodCount:12,
  temporal:{focus:{key:'2026-09',label:'Septiembre 2026'},currentTotal:27980973.65},
  rows:[
    {entity:'VIDAZA',currentValue:100,previousValue:160,recentAbsoluteChange:-60,percentageChange:-0.375,cumulativeChange:-0.2,direction:'decline',pattern:'decline_sustained',patternStartPeriod:'2026-07',patternEndPeriod:'2026-09',patternDurationPeriods:3,confidence:'high'},
    {entity:'GARDASIL 9',currentValue:2000,previousValue:500,recentAbsoluteChange:1500,percentageChange:3,cumulativeChange:4,direction:'growth',pattern:'growth_accelerating',patternStartPeriod:'2026-07',patternEndPeriod:'2026-09',patternDurationPeriods:3,confidence:'high'}
  ],
  priorities:{drag:[{entity:'VIDAZA',recentAbsoluteChange:-60,direction:'decline',pattern:'decline_sustained',patternStartPeriod:'2026-07',patternEndPeriod:'2026-09',patternDurationPeriods:3}],compensate:[{entity:'GARDASIL 9',recentAbsoluteChange:1500,direction:'growth',pattern:'growth_accelerating',patternStartPeriod:'2026-07',patternEndPeriod:'2026-09',patternDurationPeriods:3}],totals:{balance:1440}},
  contribution:{direction:'growth',totalDelta:1440,positive:[{entity:'GARDASIL 9',delta:1500,baseline:500,current:2000,contributionPct:1.0417,movementShare:.96,shareChangePp:3.1}],negative:[{entity:'VIDAZA',delta:-60,baseline:160,current:100,contributionPct:-.0417,movementShare:.04,shareChangePp:-.2}],compensation:{positiveDelta:1500,negativeDelta:-60}},
  share:{winners:[{entity:'GARDASIL 9',baselineShare:.01,currentShare:.03,shareChangePp:2,rankBaseline:4,rankCurrent:1}],losers:[{entity:'VIDAZA',baselineShare:.02,currentShare:.01,shareChangePp:-1,rankBaseline:3,rankCurrent:8}],newEntities:[],lostEntities:[]},
  cohort:{summary:{newCount:2,retainedCount:10,reactivatedCount:3,lostCount:4},lifecycle:{latestPeriod:'2026-09',previousPeriod:'2026-08',lost:['VIDAZA']}}
}};
const built = A.buildContext(state);
assert.equal(built.scope.focus.key,'2026-09');
assert.equal(built.signal.drag[0].entity,'VIDAZA');
assert.equal(built.signal.compensate[0].entity,'GARDASIL 9');
assert.equal(built.hecho.lost[0].entity,'VIDAZA');
assert(A.validateResponse({answer:'VIDAZA cae 3 períodos.',evidence:[]},built).ok);
assert(!A.validateResponse({answer:'La causa es el precio 999.',evidence:[]},built).ok);
(async()=>{
  const r = await A.ask('¿Qué está cayendo?', state, {apiKey:'test'});
  assert(r.ok);
  assert.equal(r.result.evidence[0].entity,'VIDAZA');
  console.log('PASS FASE 27 — asistente conversacional: 7/7');
})();
