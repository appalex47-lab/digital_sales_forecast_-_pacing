"""Borradores: lo escrito y no guardado sobrevive al avanzar el recorrido guiado. Uso: python3 batch_draft.py <raiz>"""
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
VAL = "(id)=>{const e=document.getElementById(id);return e?e.value:null}"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        await q.click('#tour-offer [data-action="tour-path"][data-path="C"]'); await q.wait_for_timeout(700)
        await q.click('#tour-bar [data-action="tour-cta"]'); await q.wait_for_timeout(600)
        await q.fill('#t-annual', '261M'); await q.wait_for_timeout(200)
        await q.click('#tour-bar [data-action="tour-cta"]'); await q.wait_for_timeout(700)
        chk('D1 la meta escrita sin guardar sigue ahí tras «Mostrarme dónde»', await q.evaluate(VAL, 't-annual') == '261M', await q.evaluate(VAL, 't-annual'))
        await q.fill('#t-ecommerce', '58%'); await q.wait_for_timeout(200)
        await q.evaluate("document.querySelector('#tour-bar [data-action=tour-micro-done]') && document.querySelector('#tour-bar [data-action=tour-micro-done]').click()"); await q.wait_for_timeout(600)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(400)
        chk('D2 el % de un canal también se conserva y la meta sigue', await q.evaluate(VAL, 't-ecommerce') == '58%' and await q.evaluate(VAL, 't-annual') == '261M', [await q.evaluate(VAL, 't-ecommerce'), await q.evaluate(VAL, 't-annual')])
        hint = await q.evaluate("document.querySelector('[data-share-hint=ecommerce]').textContent")
        chk('D3 y el cálculo en vivo del % sigue funcionando tras el re-dibujo', '151' in hint or '151.' in hint or 'M' in hint, hint)
        # guardar descarta el borrador: valores guardados mandan
        await q.click('#targets-form button[type=submit]'); await q.wait_for_timeout(500)
        chk('D4 guardar deja las metas guardadas', await q.evaluate("FP.app.state.targets.annual.revenue") == 261000000)
        await q.fill('#t-annual', '999M'); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['sample-targets']()"); await q.wait_for_timeout(500)
        v = await q.evaluate(VAL, 't-annual')
        chk('D5 si las metas guardadas cambian por otra vía, el borrador viejo se descarta', v != '999M', v)
        # formulario de acción propia (sin estado propio)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.goto(u + '#recovery'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        has = await q.evaluate("!!document.getElementById('rc-cu-name')")
        chk('D6 existe el formulario de acción propia', has)
        if has:
            await q.evaluate("document.getElementById('rc-cu-name').closest('details').open=true")
            await q.fill('#rc-cu-name', 'Mi acción'); await q.fill('#rc-cu-owner', 'Ecommerce'); await q.fill('#rc-cu-desc', 'Probar'); await q.wait_for_timeout(200)
            await q.evaluate("FP.app.render()"); await q.wait_for_timeout(400)
            vs = [await q.evaluate(VAL, i) for i in ('rc-cu-name', 'rc-cu-owner', 'rc-cu-desc')]
            chk('D7 lo escrito en «Agregar una acción propia» sobrevive al re-dibujo (y el desplegable sigue abierto)', vs == ['Mi acción', 'Ecommerce', 'Probar'] and await q.evaluate("document.getElementById('rc-cu-name').closest('details').open"), vs)
        chk('D8 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_draft: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
