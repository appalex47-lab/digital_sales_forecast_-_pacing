"""Celular: ninguna vista ensancha la página (no se puede deslizar de lado) a 320, 360 y 390 px, sin datos y con los datos de demo.
Caso que lo motivó: la etiqueta «0 % · Probablemente incompleto para resultados útiles» de «Preparación de datos» (Inicio) no bajaba de renglón.
Uso: python3 batch_movil_sin_desborde.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
VIEWS = ['inicio', 'carga', 'calidad', 'datos', 'plan', 'configuracion', 'estacionalidad', 'pacing', 'reforecast', 'diagnostico', 'analisis', 'recovery', 'medir', 'narrativa', 'segmentos', 'producto', 'clientes', 'cambios', 'proyeccion', 'ajustes', 'ayuda', 'resumen', 'presentacion']
WIDE = """(()=>{const W=innerWidth; return {sw:document.documentElement.scrollWidth, W, who:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); if(!r.width||r.right<=W+1) return false; for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflowX!=='visible') return false} return true}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,30))}})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for W in (320, 360, 390):
            ctx = await b.new_context(viewport={'width': W, 'height': 780}); q = await ctx.new_page(); errs = []
            q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await q.wait_for_function("window.FP && FP.app && FP.app.state && !document.getElementById('boot')", timeout=60000); await q.wait_for_timeout(600)
            for mode in ('sin datos', 'con datos de demo'):
                if mode != 'sin datos': await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1800)
                bad = []
                for v in VIEWS:
                    await q.evaluate(f"location.hash='{v}'"); await q.wait_for_timeout(600)
                    r = await q.evaluate(WIDE)
                    if r['sw'] > r['W']: bad.append((v, r['sw'], r['who']))
                chk(f'M{W} · {mode}: ninguna de las {len(VIEWS)} vistas ensancha la página', not bad, bad)
            await q.evaluate("location.hash='inicio'"); await q.wait_for_timeout(600)
            chk(f'M{W} · la etiqueta de «Preparación de datos» cabe en la pantalla', await q.evaluate("(()=>{const e=document.querySelector('#h-ready ~ .ds-badge, .home__row .ds-badge'); return !e || e.getBoundingClientRect().right<=innerWidth+1})()"))
            chk(f'M{W} · sin errores de página', not errs, errs[:2]); await ctx.close()
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
