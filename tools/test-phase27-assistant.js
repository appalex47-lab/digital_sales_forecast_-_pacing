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
// v0.14.2: cifras en lenguaje natural (mes parcial: casi todo cae y Cohere escribe «cayó $60», «-$1.5 mil», sin signo, con «mil»)
state.an.rows[0].recentAbsoluteChange = -207046; state.an.rows[0].currentValue = 806081;
const b2 = A.buildContext(state);
assert(A.validateResponse({answer:'VIDAZA cayó $207,046 frente al periodo anterior.',evidence:[]},b2).ok, 'cayó sin signo');
assert(A.validateResponse({answer:'VIDAZA cambió -$207,046.',evidence:[]},b2).ok, 'con signo');
assert(A.validateResponse({answer:'VIDAZA cayó -$207 mil.',evidence:[]},b2).ok, 'abreviado en miles con signo');
assert(A.validateResponse({answer:'VIDAZA vende $806.1 mil ahora y GARDASIL 9 $2 mil.',evidence:[]},b2).ok, 'abreviado en miles');
assert(!A.validateResponse({answer:'VIDAZA cayó $300 mil.',evidence:[]},b2).ok, 'cifra inventada abreviada');
assert(!A.validateResponse({answer:'VIDAZA subió $999,999.',evidence:[]},b2).ok, 'cifra inventada');
assert(!A.validateResponse({answer:'VIDAZA subió $207,046.',evidence:[]},b2).ok, 'sube pero en los datos cae');
assert(!A.validateResponse({answer:'VIDAZA creció $60.',evidence:[]},A.buildContext(state)).ok, 'creció pero cayó 60');
assert(A.validateResponse({answer:'VIDAZA creció en participación pero cayó $207,046.',evidence:[]},b2).ok, 'frase mixta se acepta');
assert(A.validateResponse({answer:'VIDAZA cayó a $806,081.',evidence:[]},b2).ok, 'cayó a un valor actual positivo');
assert(A.validateResponse({answer:'GARDASIL 9 subió $1,500.',evidence:[]},b2).ok, 'sube y en los datos sube');
assert(A.validateResponse({answer:'Todo cayó. VIDAZA cayó $207,046 y GARDASIL 9 subió $1,500.',evidence:[]},b2).ok, 'frases separadas');
assert(!A.validateResponse({answer:'GARDASIL 9 cambió -$1,500.',evidence:[]},b2).ok, 'signo explícito contrario al del contexto');
(async()=>{
  const r = await A.ask('¿Qué está cayendo?', state, {apiKey:'test'});
  assert(r.ok);
  assert.equal(r.result.evidence[0].entity,'VIDAZA');
  console.log('PASS FASE 27 — asistente conversacional: 7/7');
})();
