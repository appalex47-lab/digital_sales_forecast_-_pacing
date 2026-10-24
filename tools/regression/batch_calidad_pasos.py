"""Fase 3.2 · Calidad de datos paso a paso: cinco pasos plegables, «Qué hacer ahora», ids originales intactos. Datos de demo.
Uso: python3 batch_calidad_pasos.py <raiz>"""
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
READY = "window.FP && FP.app && FP.app.state && !document.getElementById('boot')"
IDS = ['quality-banner','quality-guide','quality-summary','quality-coverage','quality-issues','quality-quarantine','quality-health','quality-log','quality-analyses','quality-forecast']
OPEN = "[1,2,3,4,5].map(n=>document.getElementById('qstep-'+n).open)"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#calidad'); await q.wait_for_function(READY, timeout=60000)
        # Sin datos
        await q.wait_for_timeout(800)
        t = await q.evaluate("document.getElementById('view-calidad').textContent")
        chk('A0 sin datos hay cinco pasos y «Qué hacer ahora» manda a Carga', await q.evaluate("document.querySelectorAll('#view-calidad details.qstep').length")==5 and 'Qué hacer ahora' in t and await q.evaluate("!!document.querySelector('.qnow [data-nav=carga], .qnow a[href=\"#carga\"]')"), t[:300])
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(2500)
        await q.evaluate("location.hash='#calidad'"); await q.wait_for_timeout(800)
        chk('A1 existen todos los ids originales de la pantalla', await q.evaluate("(ids)=>ids.every(i=>!!document.getElementById(i))", IDS))
        sums = await q.evaluate("[1,2,3,4,5].map(n=>document.getElementById('qstep-'+n+'-sum').innerText)")
        chk('A2 cada paso trae su pregunta, estado, «Qué mirar» y «Qué hacer»', all(('Qué mirar' in s and 'Qué hacer' in s) for s in sums) and '¿Llegó todo?' in sums[0] and '¿Qué tan confiable es mi forecast?' in sums[4], sums)
        op = await q.evaluate(OPEN)
        now = await q.evaluate("(document.querySelector('.qnow')||{}).innerText||''")
        n_now = int(next((c for c in now.split('Paso ')[1:2] for c in [c.strip()[0]]), 0)) if 'Paso ' in now else 0
        chk('A3 por omisión solo está abierto el paso de «ahora» (o ninguno si todo está en orden)', (op.count(True) == 1 and op[n_now-1]) if n_now else op.count(True) == 0, [op, now[:120]])
        chk('A4 el paso 5 cuenta meses cerrados con la barra y nunca es «lo que hay que hacer ahora»', await q.evaluate("!!document.getElementById('qfc-bar')") and n_now != 5, n_now)
        # Alternar a mano y que persista al redibujar
        await q.evaluate("FP.qualityView.openAll(false)"); op = await q.evaluate(OPEN)
        chk('A5 closeAll cierra los cinco', op == [False]*5, op)
        await q.click('#qstep-3-sum'); await q.wait_for_timeout(150)
        op = await q.evaluate(OPEN); chk('A6 un clic en el resumen abre ese paso', op == [False, False, True, False, False], op)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(800)
        op = await q.evaluate(OPEN); chk('A7 al redibujar se respeta lo que la persona abrió', op == [False, False, True, False, False], op)
        await q.click('#qstep-3-sum'); await q.wait_for_timeout(150)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(800)
        op = await q.evaluate(OPEN); chk('A8 y también lo que cerró', op[2] is False, op)
        # Recorrido
        await q.click('.qsteps__b[data-qgo="4"]'); await q.wait_for_timeout(500)
        chk('A9 el recorrido abre el paso elegido', (await q.evaluate(OPEN))[3] is True)
        # openAll muestra todo el contenido original
        await q.evaluate("FP.qualityView.openAll()")
        txt = await q.evaluate("document.getElementById('view-calidad').textContent")
        chk('A10 con todo abierto se leen los contenidos originales', all(x in txt for x in ['Cobertura','Salud']) and await q.evaluate("document.getElementById('quality-analyses').innerText.length>20 && document.getElementById('quality-health').innerText.length>20"), txt[:200])
        chk('A11 el paso 5 muestra la regla vigente (umbrales y pesos) y dice que hoy no se calibra solo', all(x in txt for x in ['Cobertura','Estabilidad','Alta','Media','Baja']) and 'no cambian solos' in txt, '')
        sz = await q.evaluate("[...document.querySelectorAll('.qstep__sum,.qsteps__b,.qnow .btn')].map(e=>Math.round(e.getBoundingClientRect().height))")
        chk('A12 todo lo que se toca mide al menos 44 px', sz and min(sz) >= 44, sz)
        # Configuración: solo un enlace al paso 5 (sin interruptor que todavía no hace nada)
        await q.evaluate("FP.qualityView.openAll(false)")
        await q.evaluate("location.hash='#configuracion'"); await q.wait_for_timeout(800)
        chk('C1 Configuración trae el enlace a Calidad de datos · paso 5 y nada de interruptor de recalibración', await q.evaluate("!!document.querySelector('#confidence-pointer a[data-qstep=\"5\"]') && !document.querySelector('#view-configuracion [data-action*=recalib]')"))
        await q.click('#confidence-pointer a[data-qstep="5"]'); await q.wait_for_timeout(800)
        chk('C2 el enlace lleva a Calidad de datos con el paso 5 abierto', await q.evaluate("location.hash")=='#calidad' and (await q.evaluate(OPEN))[4] is True, [await q.evaluate("location.hash"), await q.evaluate(OPEN)])
        # Móvil
        m = await b.new_context(viewport={'width': 390, 'height': 800}); mp = await m.new_page()
        await mp.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await mp.wait_for_function(READY, timeout=60000)
        await mp.evaluate("FP.app.actions['generate-mock']()"); await mp.wait_for_timeout(2500)
        await mp.evaluate("location.hash='#calidad'"); await mp.wait_for_timeout(800)
        for lbl, js in (('cerrado', "FP.qualityView.openAll(false)"), ('abierto', "FP.qualityView.openAll()")):
            await mp.evaluate(js); await mp.wait_for_timeout(300)
            w = await mp.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            chk(f'M1 en celular ({lbl}) no hay desplazamiento horizontal', w[0] <= w[1] + 1, w)
        chk('Z sin errores de consola ni de página', not errs, errs[:3])
        await b.close()
    print('\n' + ('✔ todo bien' if not fails else f'✘ {len(fails)} fallas'))
    sys.exit(1 if fails else 0)
asyncio.run(main())
