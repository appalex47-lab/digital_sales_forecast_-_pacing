"""Loaders homologados (FP.ui.loader) en Carga de datos. Uso: python3 batch_loaders.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
def csv():
    rows = ['fecha,canal,sku,producto,marca,categoria,estado,venta,pedidos,unidades,id_cliente,id_pedido']
    for i in range(20): rows.append(f'2026-09-{1 + i:02d},ecommerce,SKU{i:03d},Producto {i},M{i % 3},Cat {i % 3},Jalisco,{500 + i},{1 + i % 3},{2 + i % 4},C{i % 7},P{i}')
    return '\n'.join(rows) + '\n'
LDR = "(()=>{const e=document.querySelector('#view-carga .ldr');if(!e)return null;return {title:(e.querySelector('.ldr__title')||{}).textContent,label:e.querySelector('.ldr__label').textContent,pct:e.querySelector('.ldr__pct').textContent,time:e.querySelector('.ldr__time').textContent,role:e.getAttribute('role'),now:e.getAttribute('aria-valuenow'),ind:e.classList.contains('ldr--ind'),w:e.getBoundingClientRect().width,vw:innerWidth,sw:document.documentElement.scrollWidth}})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        for tag, vw, vh in [('D', 1280, 900), ('M', 390, 800)]:
            q = await (await b.new_context(viewport={'width': vw, 'height': vh})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            u = f'http://127.0.0.1:{port}/index.html'
            await q.goto(u + '#carga'); await q.wait_for_timeout(800)
            # unidad
            r = await q.evaluate("""(()=>{const L=FP.ui.loader; document.body.insertAdjacentHTML('beforeend', L.html({id:'t1',title:'T',label:'Etapa',pct:null,t0:Date.now()-10000}));
              const a=document.getElementById('t1'); const ind=a.classList.contains('ldr--ind')&&a.getAttribute('aria-valuenow')===null;
              L.update('t1',{label:'Otra',pct:50}); const mid=[a.getAttribute('aria-valuenow'),a.querySelector('.ldr__pct').textContent,a.querySelector('.ldr__time').textContent,a.classList.contains('ldr--ind')];
              L.update('t1',{pct:null}); const noEta=!/faltan/.test(a.querySelector('.ldr__time').textContent);
              a.remove(); return {ind,mid,noEta,none:L.update('nope',{}),t:[L.timeText(Date.now()-2000,50),L.timeText(Date.now()-10000,50),L.timeText(0,50)]}})()""")
            chk(f'{tag}U1 sin % es indeterminado y no inventa estimación', r['ind'] and r['noEta'], r)
            chk(f'{tag}U2 con % muestra valor, tiempo y faltante', r['mid'][0] == '50' and r['mid'][1] == '50 %' and 'faltan' in r['mid'][2] and not r['mid'][3], r)
            chk(f'{tag}U3 estimación solo tras 3 s; sin reloj no hay texto; update de id inexistente es false', 'faltan' not in r['t'][0] and 'faltan' in r['t'][1] and r['t'][2] == '' and r['none'] is False, r['t'])
            # FP.loader (cálculos sin avance real): 1.ª vez indeterminado; 2.ª vez estimado y rotulado
            r = await q.evaluate("""(async()=>{const w=(ms)=>new Promise(r=>setTimeout(r,ms)); const host=document.createElement('div'); document.body.appendChild(host); const out={};
              const paint=()=>{host.innerHTML=FP.loader.html('Calculando X…',{key:'t-est'});}; const el=()=>host.querySelector('.ldr');
              paint(); out.first=el().classList.contains('ldr--ind'); for(let i=0;i<9;i++){await w(250);paint();} host.innerHTML=''; await w(3300);
              paint(); await w(1500); paint(); out.second=[el().classList.contains('ldr--ind'),el().getAttribute('data-est'),el().querySelector('.ldr__pct').textContent,el().querySelector('.ldr__time').textContent];
              const real=FP.loader.html('Y',{key:'t-real',pct:30}); out.real=/aria-valuenow="30"/.test(real)&&!/data-est/.test(real); host.remove(); return out;})()""")
            chk(f'{tag}L1 la primera vez no inventa % (indeterminado, con reloj)', r['first'] is True, r)
            chk(f'{tag}L2 la segunda vez el % y el faltante salen estimados y rotulados', r['second'][0] is False and r['second'][1] == '1' and '%' in r['second'][2] and 'transcurridos' in r['second'][3], r)
            chk(f'{tag}L3 con avance real (pct) no se rotula estimado', r['real'] is True, r)
            # carga de productos: frena el procesamiento para ver el loader
            await q.evaluate("(()=>{const o=FP.productImport.process;FP.productImport.process=async function(st,opt){for(let i=1;i<=4;i++){await new Promise(r=>setTimeout(r,500));opt&&opt.onProgress&&opt.onProgress(i/5);}return o.call(this,st,opt);};})()")
            sel = 'input[data-action="pick-files"][data-type="products"]'
            await q.wait_for_selector(sel, state='attached')
            await q.set_input_files(sel, files=[{'name': 'ventas_septiembre.csv', 'mimeType': 'text/csv', 'buffer': csv().encode()}])
            await q.wait_for_selector('#view-carga .ldr', timeout=8000); await q.wait_for_timeout(1300)
            r = await q.evaluate(LDR)
            chk(f'{tag}1 durante la validación se ve el loader homologado con archivo, etapa, % y tiempo', r and 'ventas_septiembre' in (r['title'] or r['label']) and '%' in r['pct'] and 'transcurridos' in r['time'] and r['role'] == 'progressbar' and r['now'] is not None, r)
            chk(f'{tag}2 el loader no desborda ({tag})', r and r['w'] <= r['vw'] and r['sw'] - r['vw'] <= 1, r)
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
            chk(f'{tag}3 al terminar la validación el loader desaparece', await q.evaluate("!document.querySelector('#view-carga .ldr')"))
            # guardado con avance
            await q.evaluate("(()=>{const o=FP.productStore.saveBatch||null;})()")
            await q.evaluate("document.querySelector('[data-action=commit-staged]').click()"); await q.wait_for_timeout(50)
            await q.wait_for_function("!document.querySelector('#view-carga .ldr') && !FP.app.state.staging.items.some(i=>i.status==='saving')", timeout=60000)
            chk(f'{tag}4 tras guardar no queda ningún loader colgado', True)
            # CSV pequeño por ruta general: loader genérico "Leyendo" y se limpia al final
            await q.evaluate("(()=>{const o=FileReader.prototype.readAsText;FileReader.prototype.readAsText=function(...a){setTimeout(()=>o.apply(this,a),500);};})()")
            await q.evaluate("(()=>{window.__seen=[];const o=FP.app.state;const iv=setInterval(()=>{const w=o.staging.working;if(w)window.__seen.push(!!w.generic)},20);window.__iv=iv;})()")
            await q.set_input_files('input[data-action="pick-files"]:not([data-type="products"]):not([data-type="productFunnel"]) >> nth=0', files=[{'name': 'venta.csv', 'mimeType': 'text/csv', 'buffer': b'fecha,canal,venta\n2026-09-01,ecommerce,100\n'}])
            await q.wait_for_timeout(1500)
            r = await q.evaluate("({n:FP.app.state.staging.items.length,view:FP.app.state.view,seen:window.__seen,left:FP.app.state.staging.working,dom:!!document.querySelector('#view-carga .ldr')})")
            chk(f'{tag}5 la lectura general enciende el loader y lo apaga al terminar', True in r['seen'] and r['left'] is None and r['dom'] is False, r)
            chk(f'{tag}6 sin errores de consola', not errs, errs[:3])
            await q.context.close()
        await b.close()
asyncio.run(main())
print('\nFALLAS:', fails or 'ninguna'); sys.exit(1 if fails else 0)
