"""Selector global «Datos al» en el encabezado y píldoras de datos/motor en el menú. Uso: python3 batch_fechaglobal.py <raiz>"""
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
U = f'http://127.0.0.1:{port}/index.html'
async def openref(q):
    """Abre el panel único de fecha/año del encabezado si está cerrado."""
    if not await q.is_visible('#topbar-date'):
        await q.click('#topbar-ref')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#pacing'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
        except Exception: pass
        await q.goto(U + '#pacing'); await q.wait_for_timeout(1200)
        h = await q.evaluate("""()=>({v:document.getElementById('topbar-date').value,type:document.getElementById('topbar-date').type,lab:document.querySelector('label[for=topbar-date]').innerText,btn:document.getElementById('topbar-ref').innerText,pillsInHeader:document.querySelectorAll('.app-header .pill').length,pillsInNav:document.querySelectorAll('#snav-pills .pill').length})""")
        chk('F1 el encabezado trae «Datos al» con la fecha de hoy y ya no trae píldoras', h['type'] == 'date' and h['v'] == '2026-09-23' and h['lab'] == 'Fecha de corte' and 'Datos al' in h['btn'] and h['pillsInHeader'] == 0 and h['pillsInNav'] == 2, h)
        # cambiar la fecha mueve el reporte: la fecha de referencia del forecast cambia y se guarda
        await openref(q); await q.fill('#topbar-date', '2026-06-15'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(1200)
        r1 = await q.evaluate("""()=>{const run=FP.app.state.fc.run;return {ref:FP.app.state.fc.settings.referenceDate,run:run&&run.referenceDate,cutoff:run&&run.cutoff,inp:document.getElementById('topbar-date').value,pacingRef:(document.getElementById('fc-ref')||{}).value}}""")
        chk('F2 elegir una fecha fija la referencia del reporte (forecast, pacing) y la muestra', r1['ref'] == '2026-06-15' and r1['run'] == '2026-06-15' and r1['inp'] == '2026-06-15' and r1['pacingRef'] == '2026-06-15', r1)
        # el cambio es de verdad: la venta acumulada del pacing cambia
        t1 = await q.evaluate("document.getElementById('view-pacing').innerText")
        await openref(q); await q.click('.hdate__b[data-action=\"fc-ref-today\"]'); await q.wait_for_timeout(1200)
        t2 = await q.evaluate("document.getElementById('view-pacing').innerText")
        r2 = await q.evaluate("[FP.app.state.fc.settings.referenceDate||null, document.getElementById('topbar-date').value, !!document.querySelector('.hdate__b[data-action=\"fc-ref-today\"]')]")
        chk('F3 «Hoy» quita la fecha fija y el reporte vuelve a calcularse (el contenido del pacing cambia entre las dos fechas)', r2 == [None, '2026-09-23', False] and t1 != t2, (r2, t1[:80], t2[:80]))
        # persiste al recargar
        await openref(q); await q.fill('#topbar-date', '2026-05-10'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(800)
        await q.reload(); await q.wait_for_timeout(1500)
        r3 = await q.evaluate("[FP.app.state.fc.settings.referenceDate||null, document.getElementById('topbar-date').value]")
        chk('F4 la fecha elegida persiste al recargar la página', r3 == ['2026-05-10', '2026-05-10'], r3)
        # se conserva al navegar por otras vistas y las vistas dependientes la usan
        vals = {}
        for v in ('inicio', 'diagnostico', 'reforecast', 'recovery', 'forecast', 'cambios'):
            await q.goto(U + '#' + v); await q.wait_for_timeout(900)
            vals[v] = await q.evaluate("document.getElementById('topbar-date').value")
        chk('F5 «Datos al» se mantiene igual al navegar por Inicio, Diagnóstico, Reforecast, Recovery, Forecast y Cambios', all(x == '2026-05-10' for x in vals.values()), vals)
        rc = await q.evaluate("(FP.app.state.fc.run||{}).referenceDate")
        chk('F6 el forecast que alimenta esas vistas usa la fecha elegida', rc == '2026-05-10', rc)
        # fecha de otro año: cambia el año
        await openref(q); await q.fill('#topbar-date', '2025-11-20'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(1200)
        r4 = await q.evaluate("[FP.app.state.year, document.getElementById('topbar-year').value, FP.app.state.fc.settings.referenceDate, document.getElementById('topbar-date').value]")
        chk('F7 una fecha de otro año cambia también el año del reporte', r4 == [2025, '2025', '2025-11-20', '2025-11-20'], r4)
        # fecha inválida / vacía
        await q.evaluate("(()=>{const i=document.getElementById('topbar-date');i.value='';i.dispatchEvent(new Event('change',{bubbles:true}))})()"); await q.wait_for_timeout(900)
        r5 = await q.evaluate("[FP.app.state.fc.settings.referenceDate||null]")
        chk('F8 dejar la fecha vacía vuelve a «hoy»', r5 == [None], r5)
        # al teclear el año dígito por dígito (0002, 0020, 0202…) no se cambia de año ni se redibuja
        y_before = await q.evaluate("FP.app.state.year")
        await q.evaluate("(()=>{const i=document.getElementById('topbar-date');for(const v of ['0002-09-23','0020-09-23','0202-09-23']){i.value=v;i.dispatchEvent(new Event('change',{bubbles:true}))}})()"); await q.wait_for_timeout(500)
        r6 = await q.evaluate("[FP.app.state.year, FP.app.state.fc.settings.referenceDate||null]")
        chk('F8b años parciales al teclear (0002, 0020, 0202) se ignoran: no cambian el año ni la fecha', r6 == [y_before, None], r6)
        # píldoras en el menú
        pl = await q.evaluate("""()=>{const pp=document.getElementById('snav-pills'),m=document.querySelector('.snav__mode');return {t:[...pp.querySelectorAll('a')].map(a=>a.innerText.trim()),before:!!(pp.compareDocumentPosition(m)&4)}}""")
        ph = await q.evaluate("[...document.querySelectorAll('#snav-pills a')].map(a=>Math.round(a.getBoundingClientRect().height))")
        chk('F9b las píldoras del menú son compactas (cada enlace ≤ 32 px de alto, no 49)', len(ph) == 2 and max(ph) <= 32, ph)
        chk('F9 en el menú, justo arriba del modo Aprendiz, están «Datos…» y «Motor: …»', len(pl['t']) == 2 and pl['before'] and pl['t'][0].startswith('Datos') and pl['t'][1].startswith('Motor:'), pl)
        # móvil: cajón del menú y encabezado sin desborde
        for w in (390, 320):
            m = await b.new_page(viewport={'width': w, 'height': 800}); await m.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await m.goto(U + '#pacing'); await m.wait_for_timeout(1000)
            await m.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            r = await m.evaluate("""()=>{const r=e=>e.getBoundingClientRect();const i=r(document.getElementById('topbar-ref'));return {sw:document.documentElement.scrollWidth-innerWidth,inside:i.right<=innerWidth&&i.left>=0,h:Math.round(i.height)}}""")
            await m.click('.menu-toggle'); await m.wait_for_timeout(400)
            vis = await m.evaluate("(()=>{const e=document.querySelector('#snav-pills a');const b=e.getBoundingClientRect();return b.right<=innerWidth&&b.left>=0&&b.top<innerHeight&&b.bottom>0})()")
            chk(f'F10 {w}px: «Datos al» cabe sin desborde y las píldoras se ven al abrir el menú', r['sw'] <= 0 and r['inside'] and vis, (r, vis))
            await m.close()
        # panel único: abrir/cerrar, Escape, clic fuera, atajo, dentro de pantalla
        await q.goto(U + '#pacing'); await q.wait_for_timeout(800)
        st0 = await q.evaluate("[document.getElementById('topbar-ref').getAttribute('aria-expanded'), document.getElementById('topbar-ref-panel').hidden]")
        await q.click('#topbar-ref'); await q.wait_for_timeout(300)
        st1 = await q.evaluate("[document.getElementById('topbar-ref').getAttribute('aria-expanded'), document.getElementById('topbar-ref-panel').hidden, document.activeElement.id]")
        chk('F12 el panel único empieza cerrado y el botón lo abre (aria-expanded, foco en la fecha)', st0 == ['false', True] and st1 == ['true', False, 'topbar-date'], (st0, st1))
        await q.keyboard.press('Escape'); await q.wait_for_timeout(300)
        st2 = await q.evaluate("[document.getElementById('topbar-ref-panel').hidden, document.activeElement.id]")
        await q.click('#topbar-ref'); await q.wait_for_timeout(200); await q.mouse.click(500, 600); await q.wait_for_timeout(300)
        st3 = await q.evaluate("document.getElementById('topbar-ref-panel').hidden")
        chk('F13 Escape y el clic fuera cierran el panel (Escape devuelve el foco al botón)', st2 == [True, 'topbar-ref'] and st3 is True, (st2, st3))
        await q.click('#topbar-ref'); await q.fill('#topbar-date', '2026-06-15'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(1000)
        st4 = await q.evaluate("[document.getElementById('topbar-ref-panel').hidden, document.getElementById('topbar-ref').innerText]")
        await q.click('.hdate__b[data-action="fc-ref-last"]'); await q.wait_for_timeout(1000)
        st5 = await q.evaluate("[document.getElementById('topbar-ref-panel').hidden, FP.app.state.fc.settings.referenceDate]")
        chk('F14 al cambiar la fecha el panel sigue abierto; «Último real» fija el último día con venta y lo cierra', st4[0] is False and 'Datos al 15 jun 2026' in st4[1] and st5[0] is True and bool(st5[1]) and st5[1] != '2026-06-15', (st4, st5))
        await q.click('#topbar-ref'); await q.wait_for_timeout(300)
        pr = await q.evaluate("(()=>{const r=document.getElementById('topbar-ref-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()")
        chk('F15 en escritorio el panel abierto cabe en la pantalla', pr is True, pr)
        await q.screenshot(path='/tmp/ref_panel_desktop.png', clip={'x': 700, 'y': 0, 'width': 580, 'height': 420})
        await q.keyboard.press('Escape')
        for w in (390, 320):
            m = await b.new_page(viewport={'width': w, 'height': 800}); await m.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await m.goto(U + '#pacing'); await m.wait_for_timeout(1000)
            await m.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            await m.click('#topbar-ref'); await m.wait_for_timeout(300)
            r = await m.evaluate("(()=>{const r=document.getElementById('topbar-ref-panel').getBoundingClientRect();return {in:r.left>=0&&r.right<=innerWidth,bot:r.bottom<=innerHeight,sw:document.documentElement.scrollWidth-innerWidth}})()")
            chk(f'F16 {w}px: el panel abierto cabe en pantalla sin desborde', r['in'] and r['bot'] and r['sw'] <= 0, r)
            await m.screenshot(path=f'/tmp/ref_panel_{w}.png')
            await m.close()
        chk('F11 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_fechaglobal: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())
