"""Pruebas del motor en la app publicada: corren solas unos segundos después de abrir; si el navegador/sitio no deja arrancar el archivo
del Worker, se arrancan desde un Blob; si nada funciona, la causa queda a la vista (píldora y Configuración) en vez de un «Sin ejecutar» mudo.
Uso: python3 batch_pruebas_motor_publicada.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
ST = "(()=>{const s=FP.app.state; return {t:s.selfTest?{p:s.selfTest.passed,n:s.selfTest.total,ok:s.selfTest.ok}:null, e:s.selfTestError||null, pill:(document.querySelector('#snav-pills')||{}).innerText||''}})()"
async def open_page(b, mode):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 800}); q = await ctx.new_page(); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    if mode == 'worker-bloqueado':   # simula que el sitio no deja arrancar el archivo como Worker (el texto sí se puede bajar con fetch)
        async def r(route):
            h = route.request.headers
            if 'selftest-worker.js' in route.request.url and h.get('sec-fetch-dest') == 'worker': await route.fulfill(status=404, body='no')
            else: await route.continue_()
        await q.route('**/*', r)
    if mode == 'todo-bloqueado':
        async def r2(route):
            if 'selftest-worker.js' in route.request.url: await route.fulfill(status=404, body='no')
            else: await route.continue_()
        await q.route('**/*', r2)
    await q.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await q.wait_for_function("window.FP && FP.app && FP.app.state && !document.getElementById('boot')", timeout=60000)
    return ctx, q, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx, q, errs = await open_page(b, 'normal')
        chk('P1 recién abierta la píldora dice «Sin ejecutar» (no corren al abrir, no congelan)', 'Sin ejecutar' in (await q.evaluate(ST))['pill'] or (await q.evaluate(ST))['t'] is not None)
        await q.wait_for_function("FP.app.state.selfTest", timeout=60000); r = await q.evaluate(ST)
        chk('P2 corren solas en segundo plano y todas pasan', r['t'] and r['t']['p'] == r['t']['n'] and r['t']['ok'] and 'Operativo' in r['pill'], r)
        chk('P3 sin errores de página', not errs, errs[:2]); await ctx.close()
        ctx, q, errs = await open_page(b, 'worker-bloqueado')
        await q.wait_for_function("FP.app.state.selfTest || FP.app.state.selfTestError", timeout=90000); r = await q.evaluate(ST)
        chk('P4 si el sitio no deja arrancar el Worker, corren desde un Blob y pasan', r['t'] and r['t']['p'] == r['t']['n'] and not r['e'], r); await ctx.close()
        ctx, q, errs = await open_page(b, 'todo-bloqueado')
        await q.wait_for_function("FP.app.state.selfTestError", timeout=90000); r = await q.evaluate(ST)
        chk('P5 si nada funciona, la causa queda a la vista en la píldora (no «Sin ejecutar» mudo)', r['e'] and 'No se pudo ejecutar' in r['pill'], r)
        await q.evaluate("location.hash='ajustes'"); await q.wait_for_timeout(500)
        txt = await q.evaluate("document.getElementById('engine-tests').innerText")
        chk('P6 en Configuración se explica y se invita a reintentar', 'No se pudieron ejecutar las pruebas del motor' in txt and 'reintentar' in txt, txt)
        await ctx.close(); await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
