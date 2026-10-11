"""Fase 10 — recorrido guiado interactivo. Uso: python3 batch_tour10.py <raiz>"""
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

TXT = "(document.getElementById('tour-bar')||{textContent:''}).textContent.replace(/\\s+/g,' ')"
async def click(q, a, **kw):
    await q.click(f'#tour-bar [data-action="{a}"]', **kw); await q.wait_for_timeout(450)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        # T1 primera visita sin datos: se ofrece una sola vez y no bloquea
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        chk('T1 primera visita sin datos: se ofrece el recorrido', await q.evaluate("!!document.querySelector('dialog#tour-offer[open]')"))
        await q.reload(); await q.wait_for_timeout(800)
        chk('T1 no se vuelve a ofrecer solo en la siguiente visita', not await q.evaluate("!!document.getElementById('tour-offer')"))
        await q.evaluate("FP.app.actions['tour-restart']()"); await q.wait_for_timeout(600)
        t = await q.evaluate(TXT)
        chk('T2 el recorrido abre en el paso 1 «Histórico» con «No tengo histórico»', 'Paso 1 de 15' in t and 'histórico primero' in t.lower() and 'No tengo histórico' in t and 'Ir a cargar histórico' in t, t[:300])
        await click(q, 'tour-cta')
        t = await q.evaluate(TXT)
        chk('T2 al pulsar «Ir a cargar histórico» la tarjeta se oculta (queda un botón) y estás en Carga de datos', 'Recorrido en espera · paso 1 de 15' in t and not await q.evaluate("!!document.querySelector('#tour-bar .tour-bar__inner')") and await q.evaluate("location.hash")=='#carga', t[:300])
        chk('T2 la zona a llenar (tarjeta «Histórico») queda marcada con el rectángulo «Es aquí»', await q.evaluate("(()=>{const e=document.querySelector('.tour-target--here');return !!e&&!!e.querySelector('#up-historical')&&getComputedStyle(e,'::after').content.includes('Es aquí')})()"))
        await click(q, 'tour-expand')
        t = await q.evaluate(TXT)
        chk('T2 al abrirla muestra «Esperando tu archivo de histórico»', 'Esperando tu archivo de histórico' in t, t[:300])
        await click(q, 'tour-skip')
        t = await q.evaluate(TXT)
        chk('T3 «No tengo histórico» pasa a Venta real con su aviso condicional', 'Paso 2 de 15' in t and 'Sin histórico no habrá comparación' in t and 'No tengo venta real' in t, t[:400])
        await click(q, 'tour-skip')
        t = await q.evaluate(TXT)
        chk('T3 sin histórico ni venta real, Meta explica «no tienes ni histórico ni venta real»', 'Paso 3 de 15' in t and 'No tienes ni histórico ni venta real' in t and 'Aún no tengo meta' in t, t[:400])
        await click(q, 'tour-skip')
        t = await q.evaluate(TXT)
        chk('T4 «Aún no tengo meta» deja el recorrido en pausa con resumen y botones Retomar', 'Recorrido en pausa: falta tu meta' in t and t.count('Omitido') == 3 and t.count('Retomar') >= 3, t[:500])
        await click(q, 'tour-resume', timeout=3000) if False else None
        await q.click('#tour-bar [data-action="tour-resume"][data-step="datos"]'); await q.wait_for_timeout(500)
        t = await q.evaluate(TXT)
        chk('T4 «Retomar» regresa al paso del dato pendiente (Histórico)', 'Paso 1 de 15' in t and 'No tengo histórico' in t, t[:200])
        chk('T2b los archivos llevan número de versión para que el navegador no use una copia vieja', await q.evaluate("[...document.querySelectorAll('script[src^=\"js/\"]')].every(e=>/\\?v=/.test(e.getAttribute('src')))"))
        # pausar / retomar / atrás / salir
        await click(q, 'tour-pause')
        chk('T5 «Pausar» deja solo el botón «Retomar recorrido · paso 1 de 15»', 'Retomar recorrido · paso 1 de 15' in await q.evaluate(TXT) and not await q.evaluate("!!document.querySelector('#tour-bar .tour-bar__inner')"))
        await click(q, 'tour-expand')
        chk('T5 el botón vuelve a abrir la tarjeta', 'Paso 1 de 15' in await q.evaluate(TXT))
        # detección automática: se carga la venta real mientras el recorrido espera
        await q.evaluate("FP.app.actions['tour-restart']()"); await q.wait_for_timeout(500)
        await click(q, 'tour-skip')   # sin histórico → paso Venta real
        await click(q, 'tour-cta')   # la tarjeta se oculta
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(2500)
        t = await q.evaluate(TXT)
        chk('T6 al cargarse la venta real la tarjeta reaparece sola, en Meta, y lo avisa', 'Venta real cargada.' in t and 'Paso 3 de 15' in t, t[:350])
        await q.evaluate("FP.app.actions['sample-targets']()"); await q.wait_for_timeout(1500)
        t = await q.evaluate(TXT)
        chk('T6 al guardarse la meta avanza solo a Plan', 'Meta guardada.' in t and 'Paso 4 de 15' in t, t[:350])
        # con todo cargado, reiniciar: salta los pasos ya hechos
        await q.evaluate("FP.app.actions['tour-restart']()"); await q.wait_for_timeout(1500)
        t = await q.evaluate(TXT)
        await click(q, 'tour-skip')
        t2 = await q.evaluate(TXT)
        chk('T7 con real y meta ya cargados, «No tengo histórico» salta directo a Plan (paso 4)', 'Paso 1 de 15' in t and 'Paso 4 de 15' in t2 and 'Siguiente: Plan' in t2, (t[:80], t2[:300]))
        # sin venta real se saltan Pacing…hipótesis
        r = await q.evaluate("(()=>{const T=FP.app.state.ux.tour;T.skipped={real:true};const s=FP.app.state;const st=FP.contextEngine.collectStatus(s);return FP.tour.nextIdx(s,st,FP.tour.idxOf('plan'))})()")
        pac = await q.evaluate("FP.tour.idxOf('pacing')")
        chk('T8 con real cargado, después de Plan sigue Pacing', r == pac, (r, pac))
        await q.evaluate("FP.app.state.store.actual.records=[];FP.app.state.ux.tour.skipped={real:true}")
        r = await q.evaluate("(()=>{const s=FP.app.state;return FP.tour.nextIdx(s,FP.contextEngine.collectStatus(s),FP.tour.idxOf('plan'))})()")
        rec = await q.evaluate("FP.tour.idxOf('recovery')")
        chk('T8 sin venta real (omitida) después de Plan se salta a Recuperar', r == rec, (r, rec))
        chk('T8 los 15 pasos y sus textos «Qué buscar / Qué sigue» se conservan', await q.evaluate("FP.guidanceConfig.TOUR.length===15 && FP.guidanceConfig.TOUR.every(t=>t.what&&t.why&&t.lookFor&&t.next)"))
        # celular
        await q.evaluate("FP.app.state.ux.tour={active:true,step:0,collapsed:false,went:false,flash:'',skipped:{},ended:null};FP.app.actions['tour-restart']()")
        await q.set_viewport_size({'width': 390, 'height': 800}); await q.wait_for_timeout(600)
        m = await q.evaluate("(()=>{const r=document.getElementById('tour-bar').getBoundingClientRect();return {l:Math.round(r.left),w:Math.round(r.width),sw:document.documentElement.scrollWidth-innerWidth,h:Math.round(r.height)}})()")
        chk('T9 en celular (390 px) la tarjeta ocupa el ancho como hoja inferior sin desborde', m['l'] == 0 and m['w'] == 390 and m['sw'] <= 0 and m['h'] <= 580, m)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_tour10:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
