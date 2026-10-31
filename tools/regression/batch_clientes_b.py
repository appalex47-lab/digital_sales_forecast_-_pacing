"""Clientes y LTV · «¿Qué hago con esto?». Uso: python3 batch_clientes_b.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
U = f'http://127.0.0.1:{port}/index.html'
async def wait_ready(q, timeout=90):
    for _ in range(timeout):
        await q.wait_for_timeout(1000)
        if await q.evaluate("(FP.app.state.staging.items[0]||{}).status") == 'ready': return True
    return False
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#clientes'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        t0 = await q.evaluate("document.getElementById('cus-body').innerText")
        chk('K1 sin libro explica qué cargar y ofrece datos de ejemplo', 'Todavía no hay clientes cargados' in t0 and 'id_pedido' in t0 and 'Probar con datos de ejemplo' in t0, t0[:200])
        tpl = await q.evaluate("FP.config.products.dataType.template")
        chk('K2 la plantilla de Productos · venta incluye id_pedido e id_cliente al final', tpl[-2:] == ['id_pedido', 'id_cliente'] and len(tpl) == 21, tpl)
        await q.evaluate("FP.app.actions['p-mock-clientes']()"); ok = await wait_ready(q)
        chk('K3 el archivo con IDs se procesa y mapea solo', ok)
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(60):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        # el guardado del libro de clientes es asíncrono: se espera a que exista, no un tiempo fijo
        try: await q.wait_for_function("(()=>{const i=FP.customerStore.info();return i&&i.orders>0})()", timeout=90000)
        except Exception: pass
        info = await q.evaluate("FP.customerStore.info()")
        chk('K5 al guardar, el libro de clientes queda en el navegador', info and info['orders'] > 0 and info['customers'] > 1000, info and (info['orders'], info['customers']))
        # las ventas de productos siguen guardándose como siempre
        cnt = await q.evaluate("FP.productStore.counts()")
        chk('K6 los productos se guardan como siempre (filas SKU-día > 0)', cnt['salesRows'] > 0, cnt)
        await q.evaluate("location.hash='#carga'"); await q.wait_for_timeout(300); await q.evaluate("location.hash='#clientes'"); await q.wait_for_timeout(500)
        try: await q.wait_for_function("(document.getElementById('cus-body')||{innerText:''}).innerText.includes('Compran más de una vez')", timeout=60000)
        except Exception: pass
        try: await q.wait_for_function("!!document.getElementById('cu-q')", timeout=15000)
        except Exception: pass
        acts = await q.evaluate("(()=>{const A=FP.app.state.cu.result?FP.cusResumen.build(FP.app.state.cu.result,{info:FP.app.state.cu.info}).actions:null;return A&&A.map(a=>a.id)})()")
        n = await q.locator('#cu-q .px-act > div').count()
        chk('Q1 la sección «¿Qué hago con esto?» existe solo si alguna regla la respalda', (n > 0) == bool(acts), (n, acts))
        chk('Q2 las tarjetas coinciden con las reglas', n == len(acts or []), (n, acts))
        txt = await q.evaluate("(document.getElementById('cu-q')||{innerText:''}).innerText")
        chk('Q3 dice que nada se guarda y que falta la reactivación', (not n) or ('Nada se guarda' in txt and 'reactivar' in txt), txt[:300])
        # se fuerzan las tres acciones para probar los destinos
        await q.evaluate("(()=>{const o=FP.cusResumen.build;FP.cusResumen.build=function(r,c){const x=o(r,c);x.actions=[{id:'dx',title:'Diagnosticar la venta del mes',month:'2026-08',desc:'d'},{id:'cross',title:'Crecer con quienes ya compran',desc:'c'},{id:'prod',title:'Ver qué compran',month:'2026-08',desc:'p'}];return x};FP.customersView.render(FP.app.state)})()")
        await q.wait_for_timeout(300)
        chk('Q4 con las tres reglas aparecen tres tarjetas con enlace', await q.locator('#cu-q [data-action^="cu-to-"]').count() == 3)
        await q.click('#cu-q [data-action="cu-to-dx"]'); await q.wait_for_timeout(800)
        st = await q.evaluate("[location.hash, FP.app.state.dx.settings.comparison, FP.app.state.dx.settings.periodType, FP.app.state.dx.settings.periodKey]")
        chk('Q5 Diagnóstico llega con mes y comparación contra el mes anterior', st == ['#diagnostico', 'actual_vs_previous', 'month', '2026-08'], st)
        await q.evaluate("location.hash='#clientes'"); await q.wait_for_timeout(600)
        await q.click('#cu-q [data-action="cu-to-cross"]'); await q.wait_for_timeout(600)
        chk('Q6 Cross-sell abre', await q.evaluate("location.hash") == '#crosssell')
        await q.evaluate("location.hash='#clientes'"); await q.wait_for_timeout(600)
        await q.click('#cu-q [data-action="cu-to-prod"]'); await q.wait_for_timeout(800)
        chk('Q7 Producto y evolución abre', await q.evaluate("location.hash") == '#prodevol')
        chk('Q8 no se guardó ningún escenario ni versión', await q.evaluate("(FP.app.state.rc.scenarios||[]).length") == 0)
        await q.set_viewport_size({'width': 375, 'height': 800}); await q.evaluate("location.hash='#clientes'"); await q.wait_for_timeout(800)
        chk('Q9 en celular no hay desplazamiento horizontal', await q.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
        chk('Z sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nOK' if not fails else 'FALLAS: ' + str(len(fails))); sys.exit(1 if fails else 0)
asyncio.run(main())
