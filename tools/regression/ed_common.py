"""Fase 15.2 · utilidades compartidas: arranca la app con datos deterministas, captura la entrada real del generador de reporte
y arma escenarios. Sirve a editorial_snapshot.py (foto numérica) y a batch_editorial.py (pruebas de redacción)."""
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
CAPTURE = "(()=>{const o=FP.reportBuilder.build;if(!o.__ed){const w=function(i){window.__edIn=i;return o.apply(this,arguments)};w.__ed=true;w.__orig=o;FP.reportBuilder.build=w}})()"
# patrón de excedente (un canal supera su plan y otro no) — igual que batch_recuperacion_neto
PATCH = """(()=>{const o=FP.reforecastEngine.runReforecast;if(o.__ed)return;const w=function(){const r=o.apply(this,arguments);try{const ids=Object.keys(r.channels||{});if(ids.length>1){const a=r.channels[ids[0]].horizon,b=r.channels[ids[1]].horizon;a.surplus=(a.surplus||0)+1e6;a.remaining=0;b.remaining=(b.remaining||0)+1e6;
const t=r.total.horizon;const S=(k)=>ids.reduce((x,c)=>x+(r.channels[c].horizon[k]||0),0);t.remaining=S('remaining');t.surplus=S('surplus');}}catch(e){}return r};w.__ed=true;FP.reforecastEngine.runReforecast=w})()"""
NUM = """(()=>{const out=[];const walk=(v,p)=>{if(v===null||v===undefined)return;if(typeof v==='number'){out.push([p,Number.isFinite(v)?v:String(v)]);return}
  if(Array.isArray(v)){v.forEach((x,i)=>walk(x,p+'['+i+']'));return}
  if(typeof v==='object'){Object.keys(v).sort().forEach(k=>{if(k==='tags'||k==='generatedAt'||(k==='total'&&v.unit!==undefined)||(k==='sum'&&v.unit!==undefined))return;walk(v[k],p+'.'+k)})}};
  const r=FP.app.state.rp.report;r.pages.forEach(pg=>walk(pg,pg.id));return {ids:r.pages.map(p=>p.id),omitted:r.omitted.map(o=>o.id),nums:out}})()"""
async def boot(b, patch=False):
    q = await new_page(b, 1280, 900)
    await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
    await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
    await load_products(q, U)
    await q.evaluate(CAPTURE)
    if patch:
        await q.evaluate("FP.app.state.fc.settings.referenceDate='2026-09-22';FP.app.state.fc.run=null;FP.app.state.rf.run=null"); await q.evaluate(PATCH)
    return q
async def generate(q):
    await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.evaluate("window.__edIn=null"); await q.click('[data-action="rp-generate"]'); await q.wait_for_timeout(300)
    if await q.query_selector('[data-action="rp-gap-go"]'): await q.click('[data-action="rp-gap-go"]')
    await q.wait_for_function("window.__edIn&&(FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error')", timeout=120000)
    return await q.evaluate("FP.app.state.rp.status")
async def month_prev(q):
    await q.evaluate("(()=>{const s=FP.app.state.dx.settings;const c=(window.__edIn&&window.__edIn.selection&&window.__edIn.selection.periodKey)||FP.app.state.fc.run.cutoff;const d=new Date(c.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);s.periodType='month';s.periodKey=d.toISOString().slice(0,7);FP.app.state.dx.run=null})")
