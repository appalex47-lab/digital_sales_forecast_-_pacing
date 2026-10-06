"""Mide el flujo REAL de pantalla con un export de GA4 grande: leer → detectar → traducir → validar → confirmar → guardar → abrir Segmentos.
Uso: python3 perf_ga4_file.py <raiz> <archivo.csv> <salida.json>. Latido cada 20 ms para medir cuánto se congela la página."""
import asyncio, sys, os, json, time, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT=os.path.abspath(sys.argv[1]); FILE=sys.argv[2]; OUT=sys.argv[3]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
h=functools.partial(Q,directory=ROOT);socketserver.TCPServer.allow_reuse_address=True
s=socketserver.ThreadingTCPServer(('127.0.0.1',0),h);threading.Thread(target=s.serve_forever,daemon=True).start();port=s.server_address[1]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox','--enable-precise-memory-info','--js-flags=--max-old-space-size=6000 --expose-gc'])
        q=await b.new_page(viewport={'width':1280,'height':900});errs=[];q.on('pageerror',lambda e:errs.append(str(e)[:200]))
        u=f'http://127.0.0.1:{port}/index.html';await q.goto(u+'#carga');await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]',state='attached')
        await q.evaluate("(()=>{window.__gap=0;let last=performance.now();window.__hb=setInterval(()=>{const t=performance.now();window.__gap=Math.max(window.__gap,t-last);last=t},20)})()")
        R={'archivoMB':round(os.path.getsize(FILE)/1e6,1)}
        t0=time.time();await q.set_input_files('input[data-action="pick-files"][data-type="segments"]',FILE)
        try:
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])',timeout=900000)
        except Exception as e: R['error_revision']=str(e)[:120]
        R['hasta_revision_s']=round(time.time()-t0,1);R['bloqueoMax_hasta_revision_ms']=await q.evaluate("Math.round(window.__gap)")
        R['heapMB_en_revision']=await q.evaluate("Math.round((window.gc&&gc(),performance.memory.usedJSHeapSize)/1e6)")
        R['filas_revision']=await q.evaluate("(()=>{const it=FP.app.state.staging.items[0];return it?(it.staged.parsed.totalRows||it.staged.parsed.rows.length):null})()")
        R['revision_en_worker']=await q.evaluate("!!(FP.app.state.staging.items[0]&&FP.app.state.staging.items[0].remote)")
        R['filas_guardadas_en_la_pagina']=await q.evaluate("FP.app.state.staging.items[0]?FP.app.state.staging.items[0].staged.parsed.rows.length:null")
        await q.evaluate("window.__gap=0")
        t1=time.time();await q.click('[data-action="commit-staged"]')
        try: await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0",timeout=900000)
        except Exception as e: R['error_confirmar']=str(e)[:120]
        R['confirmar_s']=round(time.time()-t1,1);R['bloqueoMax_confirmar_ms']=await q.evaluate("Math.round(window.__gap)")
        R['registros']=await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
        await q.wait_for_timeout(2000)
        R['heapMB_tras_confirmar']=await q.evaluate("Math.round((window.gc&&gc(),performance.memory.usedJSHeapSize)/1e6)")
        await q.evaluate("window.__gap=0");t2=time.time()
        await q.evaluate("(async()=>{await Promise.all(Object.values(FP.app.savingChain||{}))})()")
        R['espera_guardado_s']=round(time.time()-t2,1)
        await q.evaluate("window.__gap=0");t3=time.time();await q.goto(u+'#segmentos');await q.wait_for_function("document.querySelector('#view-segmentos table')",timeout=300000)
        R['abrir_segmentos_s']=round(time.time()-t3,1);R['bloqueoMax_segmentos_ms']=await q.evaluate("Math.round(window.__gap)")
        t4=time.time();await q.reload();await q.wait_for_function("window.FP&&FP.app&&FP.app.state&&FP.dataStore.records(FP.app.state.store,'segments').length>0",timeout=600000)
        R['recargar_pagina_s']=round(time.time()-t4,1);R['registros_tras_recargar']=await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
        R['errores']=errs[:2];json.dump(R,open(OUT,'w'),indent=1);print(json.dumps(R,indent=1));await b.close()
asyncio.run(main())
