"""Las pruebas del motor siguen corriendo aunque una extensión del navegador inyecte un <script src="chrome-extension://…"> en la página.
Uso: python3 batch_motor_extension.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT=os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT)); threading.Thread(target=srv.serve_forever,daemon=True).start(); port=srv.server_address[1]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']); q=await b.new_page()
        await q.goto(f'http://127.0.0.1:{port}/index.html'); await q.wait_for_function("window.FP&&FP.app&&FP.app.state&&!document.getElementById('boot')",timeout=60000)
        await q.wait_for_function("FP.app.state.selfTest||FP.app.state.selfTestError",timeout=240000)
        # simula la extensión: <script src="chrome-extension://…"> en la página, y se vuelve a correr
        await q.evaluate("(()=>{const s=document.createElement('script');s.setAttribute('src','chrome-extension://abcdefghijklmnop/js/datalayer-checker.js');document.head.appendChild(s); FP.app.state.selfTest=null; FP.app.state.selfTestError=null;})()")
        await q.evaluate("FP.app.actions['run-tests']()")
        await q.wait_for_function("FP.app.state.selfTest||FP.app.state.selfTestError",timeout=240000)
        r = await q.evaluate("({ok:FP.app.state.selfTest&&[FP.app.state.selfTest.passed,FP.app.state.selfTest.total],err:FP.app.state.selfTestError})")
        good = bool(r['ok']) and r['ok'][0] == r['ok'][1] and not r['err']
        print(('✔ ' if good else '✘ ') + 'ME1 con un script de extensión en la página, las pruebas del motor corren completas', '' if good else r); await b.close(); sys.exit(0 if good else 1)
asyncio.run(main())
