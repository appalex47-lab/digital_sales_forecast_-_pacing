"""Inicio · versión B: veredicto, chips, cifras, resumen general, «¿Qué hago hoy?» y «Ver más» como preguntas. Uso: python3 batch_inicio_b.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d != '' and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1200)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        chk('B1 sin datos Inicio conserva el estado de primeros pasos y no pinta veredicto', await q.locator('#home-b').count() == 0 and await q.locator('#h-next').count() == 1)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1800)
        v = await q.evaluate("(document.querySelector('#home-b .px-verdict h2')||{innerText:''}).innerText")
        chk('B2 veredicto: dice cómo vas contra la meta acumulada y al ritmo actual', 'meta acumulada' in v and 'al ritmo actual' in v, v)
        chips = await q.evaluate("[...document.querySelectorAll('#home-b .px-tchip')].map(c=>c.innerText.trim())")
        chk('B3 chips: venta real hasta, días comparados, calidad y preparación', any('Venta real hasta' in c for c in chips) and any('días comparados' in c for c in chips) and any('Preparación' in c for c in chips), chips)
        k = await q.evaluate("[...document.querySelectorAll('#home-b .px-kpi__l')].map(x=>x.innerText.trim())")
        chk('B4 cuatro cifras: cumplimiento, gap, forecast de cierre y por revisar', k == ['Cumplimiento', 'Gap (brecha)', 'Forecast de cierre', 'Por revisar'], k)
        short = await q.evaluate("document.querySelector('[data-home-summary]').innerText"); n = await q.locator('[data-home-summary] .px-sum__r').count()
        chk('B5 resumen general con filas condicionales (cómo voy, cierre, confianza…)', n >= 3 and 'CÓMO VOY' in short.upper() and 'CONFIANZA' in short.upper(), short[:300])
        await q.click('#home-md [data-v=l]'); await q.wait_for_timeout(500)
        long_ = await q.evaluate("document.querySelector('[data-home-summary]').innerText")
        chk('B6 la versión larga da más texto y se puede volver a la corta', len(long_) > len(short)); await q.click('#home-md [data-v=c]'); await q.wait_for_timeout(500)
        hoy = await q.evaluate("(()=>{const h=document.getElementById('h-hoy');return h?{nbs:!!h.querySelector('#nbs'),att:!!h.querySelector('[data-block=attention]'),strip:!!h.querySelector('[data-chg-strip]')}:null})()")
        chk('B7 «¿Qué hago hoy?» junta el siguiente paso, la atención y «Desde ayer»', bool(hoy) and hoy['nbs'] and hoy['att'] and hoy['strip'], hoy)
        titles = await q.evaluate("[...document.querySelectorAll('#home details.home-more > summary .ds-accordion__t')].map(x=>x.innerText.trim())")
        chk('B8 «Ver más» con títulos en forma de pregunta', titles[:4] == ['¿Cómo voy en detalle?', '¿Por qué va así?', '¿Dónde mirar?', '¿Qué tan confiable es?'], titles)
        chk('B9 «Ver más» viene cerrado y conserva lo esencial completo (A, B y resumen ejecutivo)', await q.evaluate("[...document.querySelectorAll('#home details.home-more')].every(d=>!d.open)") and await q.locator('[data-home-more=key] [data-key=how]').count() == 1 and await q.locator('[data-home-more=key] [data-key=summary]').count() == 1)
        chk('B9b los canales van a la vista (tabla), sin tarjetas repetidas ni «Convenciones» desplegable', await q.locator('#hs-channels').is_visible() and await q.locator('#h-now').count() == 0 and await q.locator('.home-conv a[data-nav=ayuda]').count() == 1 and 'Convenciones' not in ''.join(titles), titles)
        bad = []
        for w in (1920, 1280, 768, 390, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            if await q.evaluate("document.documentElement.scrollWidth-innerWidth") > 0: bad.append(w)
        chk('B10 sin desborde de página de 320 a 1920 px', not bad, bad)
        chk('Z sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nRESULTADO batch_inicio_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
