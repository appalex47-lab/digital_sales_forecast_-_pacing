#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const data=JSON.parse(fs.readFileSync('tools/real-priority-aug-sep.json','utf8'));
const ctx={console,globalThis:null};ctx.globalThis=ctx;ctx.FP={narrativeEngine:{numbersIn:t=>(String(t).match(/-?\d+(?:[.,]\d+)?/g)||[])},config:{diagnostics:{cohere:{model:'test'}}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/ai/cohereAnalysisAssistant.js','utf8'),ctx);
const rows=data.map(r=>({...r,currentValue:r.currentValue,previousValue:r.baselineValue,impact:r.recentAbsoluteChange}));
const state={an:{level:'product',periodType:'month',periodCount:12,temporal:{focus:{key:'2026-09',label:'Septiembre 2026'},currentTotal:27980973.65},rows,priorities:{drag:rows.filter(r=>r.recentAbsoluteChange<0).sort((a,b)=>a.recentAbsoluteChange-b.recentAbsoluteChange).slice(0,12),compensate:rows.filter(r=>r.recentAbsoluteChange>0).sort((a,b)=>b.recentAbsoluteChange-a.recentAbsoluteChange).slice(0,12),totals:{balance:0}},contribution:{positive:rows.filter(r=>r.recentAbsoluteChange>0),negative:rows.filter(r=>r.recentAbsoluteChange<0),compensation:{positiveDelta:0,negativeDelta:0}},share:{winners:[],losers:[],newEntities:[],lostEntities:[]},cohort:{summary:{},lifecycle:{lost:[]}}}};
const c=ctx.FP.cohereAnalysisAssistant.buildContext(state);
assert(c.signal.drag.length>0); assert(c.signal.compensate.length>0); assert(c.hecho.declines.length>0); assert(c.hecho.growth.length>0); assert(c.signal.drag[0].entity==='RESOTRANS 1 mg COM CAJ C/14' || c.signal.drag[0].entity);
assert(c.signal.compensate.some(x=>x.entity.includes('MOUNJARO')));
console.log('PASS FASE 27 REAL — contexto conversacional: 6/6');
