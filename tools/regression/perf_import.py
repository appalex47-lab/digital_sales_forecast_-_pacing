"""Importación de un archivo grande. Uso: python3 perf_import.py <raiz> <filas>
Genera el CSV en el navegador y mide: leer (parseo), validar y normalizar (process), confirmar (commit) y, sobre todo, el BLOQUEO más largo
del hilo principal durante cada paso (un latido cada 20 ms: si la página no responde, el hueco se nota). Datos sintéticos."""
import asyncio, sys, os, json, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); N = int(sys.argv[2])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
JS = """async(N)=>{
  const gap={max:0}; let last=performance.now(); const hb=setInterval(()=>{const t=performance.now();gap.max=Math.max(gap.max,t-last);last=t},20);
  const lines=['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume']; const dims=['dispositivo','fuente','medio','campaña','landing','tipo_cliente'];
  for(let i=0;lines.length<=N;i++){const d=new Date(Date.UTC(2025,0,1)+Math.floor(i/300)*86400000).toISOString().slice(0,10);lines.push(`${d},${i%2?'app':'ecommerce'},${dims[i%6]},seg_${i%150},${1000+(i%97)},${1+(i%9)},${100+(i%500)}`)}
  const text=lines.join('\\n'); const R={filas:N,csvMB:Math.round(text.length/1e6)};
  const T=async(name,f)=>{gap.max=0;last=performance.now();await new Promise(r=>setTimeout(r,60));gap.max=0;last=performance.now();const a=performance.now();const v=await f();R[name+'_ms']=Math.round(performance.now()-a);await new Promise(r=>setTimeout(r,80));R[name+'_bloqueoMax_ms']=Math.round(gap.max);return v};   // se espera al siguiente latido: ahí se ve cuánto estuvo bloqueada la página
  let staged=await T('leer',()=>FP.importer.stage(text,{fileName:'g.csv',dataType:'segments'}));
  await T('validar_sincrono',()=>FP.importer.process(staged,{settings:FP.app.state.settings,existing:FP.dataStore.records(FP.app.state.store,'segments')}));
  if(window.gc) gc();
  let result=await T('validar_por_bloques',()=>FP.importer.processAsync(staged,{settings:FP.app.state.settings,existing:FP.dataStore.records(FP.app.state.store,'segments')}));
  await T('confirmar',()=>FP.dataStore.commitBatch(FP.app.state.store,staged,result,{settings:FP.app.state.settings}));
  R.heapMB_con_archivo_en_revision=Math.round((gc(),performance.memory.usedJSHeapSize)/1e6); staged=null; result=null;
  R.registros=FP.dataStore.records(FP.app.state.store,'segments').length; await new Promise(r=>setTimeout(r,100)); R.heapMB_solo_registros=Math.round((gc(),performance.memory.usedJSHeapSize)/1e6);
  clearInterval(hb); return R}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=3200 --expose-gc'])
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.goto(f'http://127.0.0.1:{port}/index.html'); await q.wait_for_timeout(500)
        R = await q.evaluate(JS, N); R['errores'] = errs[:2]; print(json.dumps(R, ensure_ascii=False, indent=1)); await b.close()
asyncio.run(main())
