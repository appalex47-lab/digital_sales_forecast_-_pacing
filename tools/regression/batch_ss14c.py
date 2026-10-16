"""Fase 14d — aviso de plan desactualizado, guía de 3 pasos, definiciones de tráfico, entrada de Ayuda. Uso: python3 batch_ss14c.py <raiz>"""
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
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['sample-targets']()"); await q.wait_for_timeout(500)
        d = await q.evaluate("(()=>{const x=document.querySelector('#view-resumen .panel__desc');return x?x.textContent.length:-1})()")
        chk('V1 el subtítulo de Meta anual es corto (≤120 caracteres) y el resto va en un desplegable', 0 < d <= 120 and await q.evaluate("!!document.getElementById('targets-more')"), d)
        chk('V2 sin datos: guía de 3+ pasos «Cómo llenarlo si no tienes datos» dentro de Supuestos', await q.evaluate("(()=>{const e=document.querySelector('#startup-assumptions #ss-howto');return !!e&&e.querySelectorAll('li').length>=4})()"))
        t = await q.evaluate("document.getElementById('ss-cr').innerText + document.querySelector('#startup-assumptions').innerText")
        chk('V3 define el tráfico: WhatsApp = conversaciones iniciadas, Llamadas = llamadas entrantes', 'conversaciones iniciadas' in t and 'llamadas entrantes' in t, t[-300:])
        chk('V4 hay entrada de Ayuda «Supuestos de arranque» con botón ?', await q.evaluate("!!FP.help.entry('supuestosArranque') && !!document.querySelector('#ss-howto .help-dot')"))
        # plan desactualizado
        await q.evaluate("FP.app.actions['plan-preview']()"); await q.wait_for_timeout(600)
        chk('V5 recién generada la vista previa NO está desactualizada', await q.evaluate("!FP.planningView.isStale(FP.app.state)") and await q.evaluate("!document.getElementById('plan-stale')"))
        await q.evaluate("FP.app.state.targets.annual.revenue = FP.app.state.targets.annual.revenue + 1000000"); await q.wait_for_timeout(100)
        chk('V6 al cambiar la meta, la vista previa queda marcada como desactualizada', await q.evaluate("FP.planningView.isStale(FP.app.state)"))
        await q.goto(u + '#plan'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        chk('V7 en Plan aparece el aviso con botón «Regenerar vista previa»', await q.evaluate("!!document.querySelector('#plan-stale [data-action=plan-preview]')"))
        await q.evaluate("document.querySelector('#plan-stale [data-action=plan-preview]').click()"); await q.wait_for_timeout(700)
        chk('V8 al regenerar desaparece el aviso', await q.evaluate("!document.getElementById('plan-stale') && !FP.planningView.isStale(FP.app.state)"))
        await q.evaluate("FP.app.state.targets.annual.revenue += 500000; FP.app.actions['ss-event-add']()"); await q.wait_for_timeout(200)
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        chk('V9 en Metas y motor también avisa que el plan quedó desactualizado', await q.evaluate("document.getElementById('targets-form').innerText.includes('desactualizada')"))
        await q.evaluate("FP.app.actions['plan-discard'] && FP.app.actions['plan-discard']()"); await q.wait_for_timeout(300)
        chk('V10 sin vista previa no hay aviso', await q.evaluate("!FP.planningView.isStale(FP.app.state)"))
        chk('V11 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_ss14c: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
