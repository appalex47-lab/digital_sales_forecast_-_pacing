"""Fase B · corregir la clasificación desde la revisión de carga. Uso: python3 batch_y.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
PROD = 'fecha,canal,sku,producto,categoria,venta,pedidos,unidades\n2026-09-01,ecommerce,A1,Paracetamol,Analgésicos,120,2,3\n2026-09-01,app,B2,Insulina,Diabetes,900,1,1\n'
SALES = 'fecha,canal,venta,pedidos,traffic_volume\n2026-09-01,ecommerce,1000,10,500\n2026-09-01,app,800,8,400\n'
async def pick(q, u, dtype, name, text):
    await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}]); await q.wait_for_timeout(900)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
        await pick(q, u, 'actual', 'productos.csv', PROD)
        line = await q.evaluate("(document.querySelector('.dsdetect')||{innerText:''}).innerText")
        btn = await q.evaluate("(()=>{const b=document.querySelector('.dsdetect button[data-action=\"staging-retype\"]');return b?[b.innerText,b.dataset.value]:null})()")
        chk('Y-1 un archivo de productos cargado en Venta real avisa y ofrece «Mover a Categoría → Producto»', 'Parece un archivo de Categoría → Producto' in line and btn == ['Mover a Categoría → Producto', 'products'], (line, btn))
        await q.click('.dsdetect button[data-action="staging-retype"]'); await q.wait_for_timeout(1500)
        st = await q.evaluate("[FP.app.state.staging.items.length, FP.app.state.staging.items[0] && FP.app.state.staging.items[0].staged.dataType, document.getElementById('toast').innerText]")
        chk('Y-1 con un clic el archivo pasa a revisión como Productos (sin volver a subirlo) y nada se importa', st[0] == 1 and st[1] == 'products' and 'Categoría → Producto' in st[2] and 'Nada se ha importado' in st[2], st)
        await c.close()
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
        await pick(q, u, 'historical', 'venta_real.csv', SALES)
        await q.select_option('#stg-retype', 'actual'); await q.wait_for_timeout(600)
        st2 = await q.evaluate("[FP.app.state.staging.items[0].staged.dataType, FP.app.state.staging.items[0].staged.detection.correctedFrom, (document.querySelector('.dsdetect')||{innerText:''}).innerText]")
        chk('Y-2 el selector «Cargar como» cambia la sección (Histórico → Venta real) y lo deja registrado', st2[0] == 'actual' and st2[1] == 'historical' and 'Sección corregida por ti (antes: Histórico)' in st2[2], st2)
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=20000); await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(800)
        st3 = await q.evaluate("[FP.dataStore.records(FP.app.state.store,'actual').length, FP.dataStore.records(FP.app.state.store,'historical').length, (FP.dataStore.batches(FP.app.state.store,'actual')[0]||{}).detection]")
        chk('Y-2 al confirmar, los datos quedan en Venta real (no en Histórico) y el lote guarda la corrección', st3[0] == 2 and st3[1] == 0 and st3[2] and st3[2]['correctedFrom'] == 'historical', st3)
        await c.close()
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_y:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
