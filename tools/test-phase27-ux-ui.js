#!/usr/bin/env node
const fs=require('fs'), assert=require('assert');
const html=fs.readFileSync('index.html','utf8'), view=fs.readFileSync('js/ui/trend-view.js','utf8'), app=fs.readFileSync('js/app.js','utf8'), css=fs.readFileSync('css/styles.css','utf8');
const checks=[
 ['Cohere assistant script loaded',html.includes('js/ai/cohereAnalysisAssistant.js')],
 ['floating assistant has accessible label',view.includes('aria-label="Asistente conversacional de Análisis"')],
 ['assistant has open/close control',view.includes('data-action="an-assistant-toggle"')],
 ['assistant offers free question input',view.includes('data-action="an-assistant-question"')],
 ['assistant supports suggested questions',view.includes('data-action="an-assistant-suggest"')],
 ['assistant exposes loading state',view.includes('Consultando la evidencia calculada')],
 ['assistant exposes evidence',view.includes('Evidencia utilizada')],
 ['assistant handles missing Cohere config',view.includes('Configura la conexión con Cohere en Ajustes')],
 ['app sends question through assistant engine',app.includes('FP.cohereAnalysisAssistant.ask')],
 ['assistant responsive CSS exists',css.includes('.analysis-assistant') && css.includes('@media(max-width:600px)')]
];
checks.forEach(([n,ok])=>{assert(ok,n);console.log('PASS',n)});
console.log(`${checks.length}/${checks.length} checks UX/UI Fase 27`);
