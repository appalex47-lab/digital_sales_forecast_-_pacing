"""Capturas de página completa (T11) de una o varias vistas a 1280 / 768 / 390 px, con datos de prueba.
Uso: python3 shots.py <raiz_del_proyecto> <carpeta_salida> <vista[,vista...]> [<sufijo>]"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright

ROOT, OUT, VIEWS = os.path.abspath(sys.argv[1]), sys.argv[2], sys.argv[3].split(',')
SUF = sys.argv[4] if len(sys.argv) > 4 else ''
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]

async def main():
    srv, port = serve(); url = f'http://127.0.0.1:{port}/index.html'; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in (1280, 768, 390):
            c = await b.new_context(viewport={'width': w, 'height': 900}); q = await c.new_page()
            await q.goto(url + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
            await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
            try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
            except Exception: pass
            await q.goto(url + '#plan'); await q.wait_for_timeout(600)
            for a in ['plan-preview', 'plan-save']:
                try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
                except Exception: pass
            for v in VIEWS:
                await q.goto(url + '#' + v); await q.wait_for_timeout(700)
                await q.screenshot(path=f'{OUT}/{v}{SUF}_{w}.png', full_page=True)
            await c.close()
        await b.close()
    print('ok', OUT)
asyncio.run(main())
