"""Fase 7 — Ajustes Básico/Avanzado. Uso: python3 batch_adv7.py <raiz>
Z0 Básico a la vista (Estado, Modo, Negocio, Conexión con Cohere) y Avanzado cerrado; Z1 al abrir Avanzado están todas las secciones de antes (sin omitir datos);
Z2 los enlaces del índice abren Avanzado; Z3 expandir/contraer todo incluye Avanzado; Z4 el estado de Avanzado se conserva al repintar."""
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
VIS = "(()=>[...document.querySelectorAll('#view-ajustes details.stacc')].filter(d=>d.checkVisibility()).map(d=>d.id))()"
OPEN = "(id)=>document.getElementById(id).open"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-adv', timeout=20000); await q.wait_for_timeout(300)
        chk('Z0 a la vista solo el Básico: Estado, Modo de uso, Negocio, Conexión con Cohere y Opciones avanzadas (cerrada)', sorted(await q.evaluate(VIS)) == sorted(['st-estado', 'st-modo', 'st-negocio', 'st-ia', 'st-adv']), await q.evaluate(VIS))
        chk('Z0 Opciones avanzadas entra cerrada', not await q.evaluate(OPEN, 'st-adv'))
        await q.click('#st-adv > summary'); await q.wait_for_timeout(250)
        vis = await q.evaluate(VIS)
        need = ['st-otras', 'st-fuentes', 'st-equivalencias', 'st-almacenamiento', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad']
        chk('Z1 al abrir Avanzado aparecen las 7 secciones que antes estaban sueltas (nada se omite)', all(x in vis for x in need), vis)
        chk('Z1 las secciones de Avanzado entran cerradas', not any([await q.evaluate(OPEN, x) for x in need]))
        await q.click('#st-adv > summary'); await q.wait_for_timeout(200)
        await q.click('a[data-jump="st-ia-privacidad"]'); await q.wait_for_timeout(300)
        chk('Z2 el enlace del índice a una sección avanzada abre Avanzado y la sección', await q.evaluate(OPEN, 'st-adv') and await q.evaluate(OPEN, 'st-ia-privacidad'))
        await q.click('[data-action="st-collapse-all"]'); await q.wait_for_timeout(250)
        chk('Z3 «Contraer todo» cierra también Avanzado', not await q.evaluate(OPEN, 'st-adv'))
        await q.click('[data-action="st-expand-all"]'); await q.wait_for_timeout(250)
        chk('Z3 «Expandir todo» abre Avanzado y sus secciones', all([await q.evaluate(OPEN, x) for x in ['st-adv'] + need]))
        await q.evaluate("FP.app.actions['ux-mode']({dataset:{value:'learner'}})"); await q.wait_for_timeout(300)
        chk('Z4 el estado de Avanzado se conserva al repintar', await q.evaluate(OPEN, 'st-adv') and await q.evaluate(OPEN, 'st-fuentes'))
        await q.goto(u + '#carga'); await q.wait_for_timeout(300); await q.goto(u + '#ajustes'); await q.wait_for_timeout(400)
        chk('Z4 y al salir y volver', await q.evaluate(OPEN, 'st-adv'))
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_adv7:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
