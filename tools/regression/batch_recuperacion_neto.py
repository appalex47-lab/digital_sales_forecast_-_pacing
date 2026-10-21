"""Presentación (PDF) · Recuperación con respaldo por canal: brecha neta (plan − real) y suma de canales rezagados, también con un mes. Corre: python3 batch_recuperacion_neto.py <raíz>"""
import sys, asyncio, os
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
SHOT = os.environ.get('RN_SHOT')
# el motor se envuelve para que un canal quede por debajo de su plan y otro lo supere (el dataset determinista no trae excedente)
PATCH = """(()=>{const o=FP.reforecastEngine.runReforecast;FP.reforecastEngine.runReforecast=function(){const r=o.apply(this,arguments);try{const ids=Object.keys(r.channels||{});if(ids.length>1){const a=r.channels[ids[0]].horizon,b=r.channels[ids[1]].horizon;b.surplus=1000000;b.remaining=0;a.remaining=(a.remaining||0)+3000000;
const t=r.total.horizon;const S=(k)=>ids.reduce((x,c)=>x+(r.channels[c].horizon[k]||0),0);t.remaining=S('remaining');t.surplus=S('surplus');}}catch(e){}return r;};})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.evaluate("FP.app.state.fc.settings.referenceDate='2026-09-22';FP.app.state.fc.run=null;FP.app.state.rf.run=null")
        await q.evaluate(PATCH)
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.click('[data-action="rp-generate"]'); await q.wait_for_timeout(300)
        if await q.query_selector('[data-action="rp-gap-go"]'): await q.click('[data-action="rp-gap-go"]')
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        r = await q.evaluate("(()=>{const pg=FP.app.state.rp.report.pages.find(p=>p.id==='recovery');return pg&&pg.status==='included'?{net:pg.net,by:pg.byChannel,kp:pg.kpis.map(k=>k.id),head:pg.headline,days:pg.daysLeft}:null})()")
        chk('RN-1 con un mes seleccionado la lámina trae el respaldo por canal', bool(r and r['by'] and len(r['by']['rows']) >= 2), r)
        if r and r['by']:
            t = r['by']['total']
            chk('RN-2 neto = plan − real y la suma de rezagados no se compensa con el excedente', abs(t['net'] - (t['plan'] - t['real'])) < 0.01 and t['shortfall'] > t['net'] and t['surplus'] > 0, t)
            chk('RN-3 las filas por canal suman lo que falta del total', abs(sum(x['shortfall'] for x in r['by']['rows']) - t['shortfall']) < 0.01, r['by'])
            chk('RN-4 cuatro cifras: plan, falta en neto, canales rezagados necesitan, venta diaria', r['kp'] == ['target', 'net', 'remaining', 'daily'], r['kp'])
            chk('RN-5 el titular dice las dos cifras y no es causal', 'necesitan' in r['head'] and 'En neto' in r['head'], r['head'])
        # vista con acciones y escenarios inyectados
        html = await q.evaluate("""(()=>{const rp=FP.app.state.rp,pg=rp.report.pages.find(p=>p.id==='recovery');
          pg.actions=[{title:'Reforzar campaña',channel:'Ecommerce',owner:'Responsable A',start:'2026-09-23',end:'2026-09-30'}];
          return FP.reportView.docHtml(rp.report,{exclude:[],tags:false}).html})()""")
        chk('RN-6 con acciones muestra su tabla y no el vacío', 'Acciones registradas' in html and 'Reforzar campaña' in html and 'Siguiente paso: definir' not in html)
        chk('RN-7 muestra «Cómo leerlo», «Siguiente paso» y la tabla por canal', all(k in html for k in ['Cómo leerlo', 'Siguiente paso', 'de dónde salen las dos cifras', 'Superó']))
        txt = await q.evaluate("document.body.innerText")
        chk('RN-8 no imprime null, undefined ni NaN en la lámina', not any(w in html for w in ['>null<', 'undefined', 'NaN']))
        await q.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:false})"); await q.emulate_media(media='print')
        ov = await q.evaluate("(()=>{const pg=document.querySelector('#rp-print-host [data-page=recovery]');const b=pg&&pg.querySelector('.rp-body');return b?{o:b.scrollHeight>b.clientHeight+1,h:[b.scrollHeight,b.clientHeight]}:null})()")
        chk('RN-9 la lámina de recuperación no desborda', bool(ov) and not ov['o'], ov)
        if SHOT:
            el = await q.query_selector('#rp-print-host [data-page=recovery]'); await el.screenshot(path=SHOT)
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} ok / {len(fails)} fallos'); sys.exit(1 if fails else 0)
