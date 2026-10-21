"""«Actualizar» una hoja ligada reemplaza lo anterior y no apila revisiones. Uso: python3 batch_actualizar_reemplaza.py <raiz>"""
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
        csv = {}
        async def h(route): await route.fulfill(status=200, content_type='text/csv', body=csv['1'], headers={'access-control-allow-origin': '*'})
        await q.route('https://docs.google.com/**', h)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
        await q.goto(f'http://127.0.0.1:{port}/index.html#carga'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        csv['1'] = await q.evaluate("FP.mockCsv.get('gen-hist-2025').text()")
        await q.evaluate("""()=>{FP.app.state.sheets.links=[{id:'a',type:'historical',url:'https://docs.google.com/spreadsheets/d/e/2PACX-test/pub?gid=1&single=true&output=csv',label:'Histórico',lastAt:new Date().toISOString(),rows:5,kind:'published'}]; FP.app.render();}""")
        await q.wait_for_timeout(300)
        BAT = "FP.app.state.store.historical.batches.length"; REC = "FP.app.state.store.historical.records.length"
        async def refresh(): await q.click('[data-action="sheets-refresh"]'); await q.wait_for_timeout(2500)
        async def commit():
            if await q.evaluate("!!document.querySelector('[data-action=replace-confirm]')"): await q.evaluate("document.querySelector('[data-action=replace-confirm]').click()"); await q.wait_for_timeout(300)
            await q.evaluate("document.querySelector('[data-action=commit-staged]').click()"); await q.wait_for_timeout(2500)
        await refresh(); await commit(); base = await q.evaluate(REC)
        chk('1 la primera actualización importa y deja 1 archivo', await q.evaluate(BAT) == 1 and base > 0, [await q.evaluate(BAT), base])
        # 2.ª y 3.ª actualización SIN confirmar la anterior: no se apilan
        await refresh(); await refresh(); await refresh()
        items = await q.evaluate("FP.app.state.staging.items.map(i=>[i.staged.fileName,i.replace&&i.replace.batchId?'reemplaza':'agrega'])")
        chk('2 tres «Actualizar» seguidos dejan UNA sola revisión pendiente, con el reemplazo preseleccionado', len(items) == 1 and items[0][1] == 'reemplaza', items)
        await commit()
        chk('3 al confirmar el reemplazo no se duplica: 1 archivo y mismos registros', await q.evaluate(BAT) == 1 and await q.evaluate(REC) == base, [await q.evaluate(BAT), await q.evaluate(REC), base])
        await refresh(); await commit()
        chk('4 una actualización más, confirmada, sigue sin duplicar', await q.evaluate(BAT) == 1 and await q.evaluate(REC) == base, [await q.evaluate(BAT), await q.evaluate(REC)])
        chk('5 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('\nFALLAS:', fails or 'ninguna'); sys.exit(1 if fails else 0)
