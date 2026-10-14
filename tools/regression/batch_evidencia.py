"""Diagnóstico: cada hipótesis (reglas o Cohere) lleva su evidencia a un clic: señales y driver. Uso: python3 batch_evidencia.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1800)
        await q.goto(u + '#diagnostico'); await q.reload(); await q.wait_for_timeout(2500)
        await q.evaluate("""()=>{const r=FP.app.state.dx.run; const t=r.signals[0]; r.signals=[]; for(let i=1;i<=15;i++) r.signals.push({...t,id:'s'+i,label:'Segmento '+i,evidence:'Evidencia de la señal '+i+' · Venta -'+i+'%'});
          const mk=(id,src,sig,drv)=>({id,priority:'high',hypothesis:'Hipótesis '+id,source:src,statusLabel:'Requiere investigación',evidenceLevel:'localized',mechanism:'m',validationNeeded:['v'],relatedSignals:sig,driver:drv});
          r.hypotheses=[mk('h1','rules',['s1','s2'],'conversionRate'),mk('h2','rules',['s14'],'aov'),mk('h3','rules',['s1'],undefined)];
          FP.app.state.dx.ai={status:'ok',result:{ok:true,model:'command-a',errors:[],hypotheses:[mk('c1','cohere',['s3'],'trafficVolume')]}};
          FP.app.render()}""")
        await q.wait_for_timeout(500)
        chk('E1 cada hipótesis (reglas y Cohere) muestra su evidencia a la vista, sin abrirla', await q.evaluate("[...document.querySelectorAll('#dx-hyps .hyp-wrap')].every(w=>w.querySelector('.hyp__ev [data-action=dx-evidence]') && !w.querySelector('details.hyp').open)") and await q.evaluate("document.querySelectorAll('#dx-hyps .hyp-wrap').length")==4)
        chk('E2 solo se ofrece «Ver driver» cuando la hipótesis tiene driver y existe en el árbol', await q.evaluate("[...document.querySelectorAll('#dx-hyps .hyp-wrap')].map(w=>!!w.querySelector('[data-action=dx-evidence-driver]'))")==[True,True,False,True])
        # clic en una señal visible
        await q.click('#hyp-h1 [data-action="dx-evidence"][data-sig="s2"]'); await q.wait_for_timeout(700)
        r = await q.evaluate("(()=>{const e=document.getElementById('sig-s2');return {ev:e.classList.contains('is-evidence'),vis:e.checkVisibility(),foc:document.activeElement===e}})()")
        chk('E3 el clic lleva a la fila de la señal, la resalta y le da el foco', r['ev'] and r['vis'] and r['foc'], r)
        chk('E4 aparece «Volver a la hipótesis»', await q.evaluate("!!document.querySelector('[data-action=dx-evidence-back]')"))
        # señal fuera de las 12 primeras
        chk('E5 antes de ir a una señal lejana, la tabla muestra solo las 12 primeras', await q.evaluate("!document.getElementById('sig-s14')"))
        await q.click('#hyp-h2 [data-action="dx-evidence"][data-sig="s14"]'); await q.wait_for_timeout(700)
        r = await q.evaluate("(()=>{const e=document.getElementById('sig-s14');return e?{ev:e.classList.contains('is-evidence'),vis:e.checkVisibility()}:null})()")
        chk('E6 una señal fuera de las 12 primeras abre «Ver todas» y se resalta', bool(r) and r['ev'] and r['vis'], r)
        await q.click('[data-action="dx-evidence-back"]'); await q.wait_for_timeout(700)
        chk('E7 «Volver» regresa a la hipótesis de origen y quita el botón', await q.evaluate("document.activeElement.id")=='hyp-h2' and await q.evaluate("!document.querySelector('[data-action=dx-evidence-back]')"))
        # driver en el árbol (cerrado dentro de «Ver más»)
        await q.evaluate("document.querySelectorAll('#view-diagnostico details.dx-more').forEach(d=>d.open=false)")
        await q.click('#hyp-h1 [data-action="dx-evidence-driver"]'); await q.wait_for_timeout(800)
        r = await q.evaluate("(()=>{const e=document.getElementById('drv-conversionRate');return {open:e.open,vis:e.checkVisibility(),ev:e.classList.contains('is-evidence'),more:document.querySelector('details.dx-more[data-dx-more=tree]').open}})()")
        chk('E8 «Ver driver en el árbol» abre «Ver más», despliega la rama y la resalta', r['open'] and r['vis'] and r['ev'] and r['more'], r)
        # Cohere
        await q.click('#hyp-c1 [data-action="dx-evidence"][data-sig="s3"]'); await q.wait_for_timeout(700)
        chk('E9 las hipótesis redactadas con Cohere también llevan a su señal', await q.evaluate("document.getElementById('sig-s3').classList.contains('is-evidence')"))
        chk('E10 el resaltado se quita solo', (await q.wait_for_timeout(4000)) is None and await q.evaluate("!document.querySelector('.is-evidence')"))
        chk('E11 los botones se pueden usar con teclado (son <button>) y miden 28 px o más', await q.evaluate("[...document.querySelectorAll('.chip--link')].every(b=>b.tagName==='BUTTON'&&b.getBoundingClientRect().height>=28)"))
        chk('E12 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
