"""Equivalencia de resultados tras las optimizaciones de rendimiento. Uso: python3 batch_z.py <raiz> [salida.json]
Carga los MISMOS archivos (con duplicados, huecos por canal, cuarentena, segmentos) y guarda en JSON: resumen de calidad (cobertura
por colección y global), Segmentos (resumen por dimensión y periodo) y disponibilidad. Se corre sobre la versión anterior y la nueva y
se comparan los JSON: deben ser idénticos."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); OUT = sys.argv[2] if len(sys.argv) > 2 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def real():
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for d in range(1, 31):
        for i, ch in enumerate(CH):
            if d in (8, 9) and ch == 'llamadas': continue                     # huecos por canal
            v = '-500' if (d == 3 and ch == 'ecommerce') else ('abc' if (d == 4 and ch == 'app') else 1000 + 37 * d + 100 * i)
            rows.append(f'2026-09-{d:02d},{ch},{v},{10 + i + d},{1000 + 10 * d}')
    rows.append('2026-09-06,ecommerce,5555,12,1010')                           # duplicado de llave
    rows.append('2026-09-06,ecommerce,5556,12,1010')                           # y otro más
    return '\n'.join(rows) + '\n'
def segs():
    rows = ['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume']
    for m, (a, b) in ((8, (1, 31)), (9, (1, 30))):
        for d in range(a, b + 1):
            for ch in ('ecommerce', 'app'):
                for dev, k in (('Móvil', 3), ('Escritorio', 5), ('Tableta', 1)):
                    rows.append(f'2026-{m:02d}-{d:02d},{ch},dispositivo,{dev},{1000 * k + d},{k * 10},{500 * k}')
                for cp in ('(not set)', 'buen_fin', 'x'):
                    rows.append(f'2026-{m:02d}-{d:02d},{ch},campaña,{cp},{500 + d},{5},{300}')
    rows.append('2026-09-05,ecommerce,dispositivo,Móvil,1,1,1')                 # duplicado en segmentos
    return '\n'.join(rows) + '\n'
async def upload(q, u, dtype, name, text):
    await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
    await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u); await q.wait_for_timeout(400)
        await upload(q, u, 'actual', 'real.csv', real()); await upload(q, u, 'historical', 'hist.csv', real().replace('2026-09', '2025-09'))
        await upload(q, u, 'segments', 'seg.csv', segs())
        R = await q.evaluate("""()=>{const st=FP.app.state.store;const strip=(x)=>JSON.parse(JSON.stringify(x,(k,v)=>k==='generatedAt'?undefined:v));
          const cov=strip(FP.coverage.summarize(st));
          const seg=[];for(const dim of ['device','campaign']){for(const ch of ['total','ecommerce','app']){for(const [f,t] of [['2026-09-01','2026-09-30'],['2026-08-01','2026-08-31'],['2026-09-10','2026-09-20']]){
            const idx=FP.dataStore.segmentIndex?FP.dataStore.segmentIndex(st):[...FP.dataStore.resolveLatest(st,'segments').values()];const r=FP.segmentsView.summarize(idx,{from:f,to:t,channel:ch,dimension:dim});
            const r2=FP.segmentsView.summarize([...FP.dataStore.resolveLatest(st,'segments').values()],{from:f,to:t,channel:ch,dimension:dim});
            seg.push({dim,ch,f,t,same:JSON.stringify(r)===JSON.stringify(r2),rows:r.rows.map(x=>[x.key,x.current&&x.current.traffic,x.current&&x.current.orders,x.current&&x.current.revenue,x.baseline&&x.baseline.traffic,x.revenueDelta])})}}}
          const av=[];for(const dim of ['device','source','medium','campaign','landing_page','customer_type']){for(const cmp of [null,'previous','yoy']){
            const cur={start:'2026-09-01',end:'2026-09-30'};const c=cmp?FP.availability.comparisonPeriod(cur,cmp):null;
            for(const ch of ['total','app']){const r=FP.availability.dimension(st,dim,{current:cur,comparison:c,channel:ch});av.push([dim,cmp,ch,r.status,r.reasons.map(x=>x.code),r.availableRows,r.totalRows,r.coverage,r.comparisonStatus])}}}
          const h=FP.dataHealth.overview(st);
          return {cov,seg,av,health:strip(h)}}""")
        R['errores'] = errs[:2]
        txt = json.dumps(R, ensure_ascii=False, sort_keys=True)
        if OUT: open(OUT, 'w').write(txt)
        print('segmentos: índice = arreglo en todos los casos:', all(x['same'] for x in R['seg']), '| errores:', errs[:2], '| bytes', len(txt))
        await b.close()
asyncio.run(main())
