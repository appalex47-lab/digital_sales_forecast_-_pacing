"""Fase 8 — menú con la pregunta de cada grupo (mismos nombres, mismas pantallas). Uso: python3 batch_menuq8.py <raiz>
M1 cada grupo muestra su nombre y su pregunta; M2 los grupos y sus pantallas no cambian; M3 la ruta (migas) muestra la pregunta del grupo; M4 sin desborde en celular con el menú abierto."""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
Qs = {'Planear': '¿Qué quiero alcanzar?', 'Monitorear': '¿Cómo voy?', 'Diagnosticar': '¿Por qué?', 'Análisis': '¿Qué patrones hay?', 'Recuperar': '¿Qué hago?', 'Medir y aprender': '¿Funcionó?'}
VIEWS = {'planear': ['carga', 'calidad', 'resumen', 'plan', 'estacionalidad', 'datos', 'configuracion', 'proyeccion'], 'monitorear': ['pacing'], 'diagnosticar': ['diagnostico', 'producto', 'segmentos'], 'analizar': ['analisis'], 'recuperar': ['reforecast', 'recovery'], 'medir': ['medir', 'narrativa', 'paquete']}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(500)
        got = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].map(t=>[t.querySelector('.snav__tl > span').textContent.trim(), (t.querySelector('.snav__q')||{}).textContent])")
        chk('M1 cada grupo del menú muestra su nombre actual y su pregunta', dict(map(tuple, got)) == Qs, got)
        g = await q.evaluate("Object.fromEntries(FP.guidance? Object.entries({}) : [])") if False else None
        got2 = await q.evaluate("Object.fromEntries(FP.config.guidance.GROUPS.filter(g=>g.id!=='inicio').map(g=>[g.id,g.views]))") if await q.evaluate("!!(FP.config&&FP.config.guidance&&FP.config.guidance.GROUPS)") else None
        if got2 is None: got2 = await q.evaluate("Object.fromEntries(FP.guidanceConfig.GROUPS.filter(g=>g.id!=='inicio').map(g=>[g.id,g.views]))")
        chk('M2 los grupos conservan exactamente las mismas pantallas y el mismo orden', got2 == VIEWS, got2)
        crumb = await q.evaluate("document.querySelector('.breadcrumbs').textContent.replace(/\\s+/g,' ').trim()")
        chk('M3 la ruta de Pacing dice «Inicio › Monitorear · ¿Cómo voy? › Pacing & Forecast»', '¿Cómo voy?' in crumb and 'Monitorear' in crumb, crumb)
        await q.goto(u + '#carga'); await q.wait_for_timeout(400)
        chk('M3 y en Carga dice la pregunta de Planear', '¿Qué quiero alcanzar?' in await q.evaluate("document.querySelector('.breadcrumbs').textContent"))
        bad = []
        for w in (390, 360, 320):
            await q.set_viewport_size({'width': w, 'height': 800}); await q.evaluate("document.body.classList.add('nav-open')"); await q.wait_for_timeout(250)
            x = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
            clip = await q.evaluate("[...document.querySelectorAll('.snav__tl')].some(e=>e.scrollWidth>e.parentElement.clientWidth+2)")
            if x > 0 or clip: bad.append((w, x, clip))
        chk('M4 en celular (320–390 px) el menú abierto no desborda ni corta las preguntas', not bad, bad)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_menuq8:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
