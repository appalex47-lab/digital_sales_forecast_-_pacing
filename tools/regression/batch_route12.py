"""Fase 12 — pregunta inicial «¿Con qué datos cuentas hoy?», rutas A/B/C y tarjeta compacta. Uso: python3 batch_route12.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
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
TXT = "(document.getElementById('tour-bar')||{textContent:''}).textContent.replace(/\\s+/g,' ')"
async def click(q, a, sel='#tour-bar'):
    await q.click(f'{sel} [data-action="{a}"]'); await q.wait_for_timeout(450)
async def pick(q, p):
    await q.click(f'#tour-offer [data-action="tour-path"][data-path="{p}"]'); await q.wait_for_timeout(600)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        d = await q.evaluate("(document.getElementById('tour-offer')||{textContent:''}).textContent.replace(/\\s+/g,' ')")
        chk('R1 la primera visita pregunta «¿Con qué datos cuentas hoy?» con 3 opciones', '¿Con qué datos cuentas hoy?' in d and 'Ya tengo datos' in d and 'Solo tengo histórico' in d and 'Soy una empresa nueva' in d, d)
        chk('R1 la opción A dice «15 pasos»', 'Recorrido completo · 15 pasos' in d)
        # ----- ruta C
        await pick(q, 'C')
        t = await q.evaluate(TXT)
        chk('R2 ruta C: 4 pasos, empieza en Meta, muestra «Ruta: Empresa nueva · Cambiar»', 'Paso 1 de 4' in t and 'Meta' in t and 'Ruta: Empresa nueva' in t, t[:300])
        chk('R2 ruta C: sin histórico ni venta real, Meta pide escribir el total', 'Escribe tu meta anual total' in t, t[:400])
        await q.evaluate("FP.app.actions['tour-next']()"); await q.wait_for_timeout(500)
        t = await q.evaluate(TXT)
        chk('R2b ruta C, paso Supuestos de arranque: explica cómo se mueve el año antes de AOV y CR', 'Paso 2 de 4' in t and 'Supuestos de arranque' in t and 'Dile al plan cómo se mueve tu año' in t, t[:400])
        await q.evaluate("FP.app.actions['tour-next']()"); await q.wait_for_timeout(500)
        t = await q.evaluate(TXT)
        chk('R3 ruta C, paso Plan: advierte que sin histórico el plan se congela sin volumen, AOV ni CR', 'Paso 3 de 4' in t and 'se congela sin volumen, AOV ni CR' in t, t[:500])
        await q.evaluate("FP.app.actions['tour-next']()"); await q.wait_for_timeout(500)
        t = await q.evaluate(TXT)
        chk('R4 ruta C, último paso «Cuando tengas tus primeras ventas»', 'Paso 4 de 4' in t and 'Cuando tengas tus primeras ventas' in t, t[:300])
        await click(q, 'tour-cta')
        t = await q.evaluate(TXT)
        chk('R4 «Mostrarme dónde» NO cierra la tarjeta: queda compacta con «Ya lo vi» y «Siguiente»', 'Ya lo vi' in t and 'Siguiente' in t and 'no se cierra sola' in t and not await q.evaluate("document.getElementById('tour-bar').classList.contains('tour-bar--pill')"), t[:300])
        chk('R4 la zona de venta real queda marcada con «Es aquí»', await q.evaluate("(()=>{const e=document.querySelector('.tour-target--here');return !!e&&!!e.querySelector('#up-actual')})()"))
        await q.evaluate("window.dispatchEvent(new HashChangeEvent('hashchange'))"); await q.wait_for_timeout(400)
        chk('R5 al redibujar la pantalla la tarjeta compacta sigue abierta', 'no se cierra sola' in await q.evaluate(TXT))
        await click(q, 'tour-compact-off')
        t = await q.evaluate(TXT)
        chk('R5 «Ver paso completo» vuelve a la tarjeta completa', 'Qué estamos viendo' in t and 'no se cierra sola' not in t, t[:200])
        await click(q, 'tour-cta')
        await q.click('#tour-bar [data-action="tour-micro-done"]'); await q.wait_for_timeout(450)
        t = await q.evaluate(TXT)
        chk('R5 «Ya lo vi» completa el micro-paso', '(hecho)' in t or 'Micro-paso' in t, t[:300])
        await click(q, 'tour-next')
        t = await q.evaluate(TXT)
        chk('R6 al terminar la ruta C el resumen dice qué se activa con venta real', 'Pacing, forecast y diagnóstico se activan al cargar venta real' in t, t[:400])
        # ----- cambio de ruta desde la tarjeta
        await click(q, 'tour-close')
        await q.evaluate("FP.app.actions['tour-start']()"); await q.wait_for_timeout(500)
        chk('R7 «Recorrido guiado» con ruta ya elegida continúa sin volver a preguntar', not await q.evaluate("!!document.querySelector('dialog#tour-offer')"))
        await click(q, 'tour-change-path')
        chk('R7 «Ruta: … · Cambiar» reabre la pregunta con la ruta actual marcada', await q.evaluate("!!document.querySelector('#tour-offer .tour-opt.is-cur[data-path=\"C\"]')"))
        await pick(q, 'B')
        t = await q.evaluate(TXT)
        chk('R8 ruta B: 4 pasos, empieza en Histórico y ofrece «Todavía no tengo histórico»', 'Paso 1 de 4' in t and 'Ruta: Solo histórico' in t and 'Todavía no tengo histórico' in t, t[:300])
        await click(q, 'tour-skip')
        t = await q.evaluate(TXT)
        chk('R8 «Todavía no tengo histórico» pasa a la ruta C con aviso', 'Ruta: Empresa nueva' in t and 'Paso 1 de 4' in t and 'Pasamos a la ruta de empresa nueva' in t, t[:300])
        # ----- propuesta de pasar a una ruta más completa
        await q.evaluate("(()=>{const o=FP.contextEngine.collectStatus;FP.contextEngine.collectStatus=function(s){const r=o.apply(this,arguments);r.data=Object.assign({},r.data,{historical:100});return r;};window.__restore=()=>{FP.contextEngine.collectStatus=o};window.dispatchEvent(new HashChangeEvent('hashchange'));})()"); await q.wait_for_timeout(500)
        t = await q.evaluate(TXT)
        chk('R9 al detectar histórico en la ruta C propone pasar a «Solo histórico»', 'Ya cargaste histórico. ¿Pasamos al recorrido de «Solo histórico»?' in t, t[:400])
        await click(q, 'tour-up-dismiss')
        chk('R9 «No por ahora» oculta la propuesta y no vuelve a salir', 'Ya cargaste histórico' not in await q.evaluate(TXT))
        await q.evaluate("FP.app.state.ux.tour.upDismissed='';window.dispatchEvent(new HashChangeEvent('hashchange'))"); await q.wait_for_timeout(300)
        await click(q, 'tour-path-up')
        t = await q.evaluate(TXT)
        chk('R9 «Sí, pasar» cambia a la ruta B (no cambia sola)', 'Ruta: Solo histórico' in t, t[:300])
        await q.evaluate("window.__restore()")
        # ----- ruta A y migración
        await q.evaluate("FP.app.actions['tour-change-path']()"); await q.wait_for_timeout(300)
        await pick(q, 'A')
        t = await q.evaluate(TXT)
        chk('R10 ruta A: recorrido completo de 15 pasos con «No tengo histórico»', 'Paso 1 de 15' in t and 'Ruta: Completa' in t and 'No tengo histórico' in t, t[:300])
        await q.reload(); await q.wait_for_timeout(800)
        chk('R11 la ruta elegida se conserva al recargar', await q.evaluate("FP.app.state.ux.tour.path==='A'"))
        await q.evaluate("FP.app.state.ux.tour.path=null;FP.tour.setPath(null)")
        chk('R11 sin ruta guardada (usuarios anteriores) se usa la completa', await q.evaluate("FP.tour.steps().length===15"))
        # celular
        m = await b.new_context(viewport={'width': 390, 'height': 844}); w = await m.new_page(); w.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await w.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await w.goto(u + '#inicio'); await w.wait_for_timeout(800)
        ok = await w.evaluate("(()=>{const d=document.getElementById('tour-offer');if(!d)return false;const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()")
        chk('R12 en celular la pregunta inicial cabe en pantalla sin desborde', ok)
        chk('Sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('\nRESULTADO batch_route12:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
