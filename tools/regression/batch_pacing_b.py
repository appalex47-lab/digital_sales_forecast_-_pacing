"""Pacing & Forecast en versión B: veredicto, resumen por reglas, preguntas, controles y los enlaces «¿Qué hago con esto?». Uso: python3 batch_pacing_b.py <raiz>"""
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
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append((str(e) + ' | ' + str(getattr(e, 'stack', '')).replace(chr(10), ' ← ')[:300])))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#pacing'); await q.wait_for_timeout(900)
        await q.evaluate("document.querySelectorAll('dialog,#tour-offer').forEach(d=>d.remove())")
        t0 = await q.evaluate("document.getElementById('fc-kpis').innerText")
        chk('P1 sin plan avisa qué falta y no pinta secciones vacías', 'No hay forecast todavía' in t0 and not await q.locator('#pc-g').is_visible() and not await q.locator('#pc-vtop h2').count())
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
        except Exception: pass
        await q.goto(U + '#plan'); await q.wait_for_timeout(600)
        for a in ['plan-preview', 'plan-save']:
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass
        await q.goto(U + '#pacing'); await q.wait_for_selector('#pc-vtop h2', timeout=60000); await q.wait_for_timeout(1500)
        chk('P2 la página abre con veredicto, ≥3 etiquetas, las 6 tarjetas de siempre y el resumen con ≥2 filas', await q.locator('#pc-vtop h2').count() == 1 and await q.locator('#pc-vtop .px-tchip').count() >= 3 and await q.locator('#fc-kpis .metric-card').count() == 6 and await q.locator('[data-pc-summary] .px-sum__r').count() >= 2)
        chk('P3 las preguntas existen en orden y el método y las versiones vienen cerrados', await q.evaluate("(()=>{const ids=['pc-g','pc-c','pc-f','pc-a','pc-p','pc-q','pc-vp','pc-meth'];const t=ids.map(i=>{const e=document.getElementById(i);return e?e.getBoundingClientRect().top+scrollY:null});return t.every(x=>x!==null)&&t.every((x,i)=>i===0||x>t[i-1])&&!document.getElementById('pc-vp').open&&!document.getElementById('pc-meth').open})()"))
        short = await q.evaluate("document.querySelector('[data-pc-summary]').innerText")
        await q.click('#pc-md [data-v=l]'); await q.wait_for_timeout(200)
        long_ = await q.evaluate("document.querySelector('[data-pc-summary]').innerText")
        chk('P4 la versión larga del resumen da más texto que la corta y se puede volver', len(long_) > len(short)); await q.click('#pc-md [data-v=c]')
        await q.click('#pc-m-res'); await q.wait_for_timeout(150)
        chk('P5 «Resumen» oculta las secciones y «Completo» las vuelve a mostrar', not await q.locator('#pc-g').is_visible()); await q.click('#pc-m-full'); await q.wait_for_timeout(150)
        chk('P5b «Completo» vuelve a mostrarlas', await q.locator('#pc-g').is_visible())
        v = await q.evaluate("(()=>{const r=FP.app.state.fc.run,a=r.total.annual;return [FP.pcResumen.fmt('revenue',a.forecast.revenue), document.querySelector('#pc-vtop h2').innerText]})()")
        chk('P6 el veredicto usa el forecast de cierre del motor', v[0] in v[1] or 'datos suficientes' in v[1], v)
        chk('P7 el panel de fecha de referencia viene plegado y el botón lo abre (con los atajos y el día de referencia)', not await q.locator('#fc-refbox').is_visible() and await q.locator('#pc-ref-toggle').count() == 1)
        await q.click('#pc-ref-toggle'); await q.wait_for_timeout(150)
        chk('P8 al abrirlo se ven la fecha, los atajos y el día de referencia', await q.locator('#fc-ref').is_visible() and await q.locator('[data-action="fc-ref-today"]').is_visible() and await q.locator('#fc-today').is_visible())
        await q.click('#pc-ref-toggle')
        # método y métrica siguen funcionando desde la barra
        await q.select_option('#fc-method', 'B'); await q.wait_for_timeout(1500)
        h1 = await q.evaluate("document.querySelector('#pc-vtop h2').innerText + '|' + FP.app.state.fc.run.method.id")
        chk('P9 cambiar el método desde la barra recalcula (método B en uso)', h1.endswith('|B') and 'Método B' in await q.evaluate("document.querySelector('#pc-vtop .px-trust').innerText"), h1)
        await q.select_option('#fc-method', 'A'); await q.wait_for_timeout(800)
        await q.click('#fc-controls [data-value="orders"]'); await q.wait_for_timeout(1200)
        chk('P10 cambiar la métrica a Pedidos recalcula la página', 'pedidos' in (await q.evaluate("document.querySelector('#pc-vtop .px-eyebrow').innerText")).lower() and not await q.locator('[data-action="pc-to-recovery"]').count())
        t = await q.evaluate("document.getElementById('pc-actions').innerText")
        chk('P11 con Pedidos «Simular la recuperación» se deshabilita y dice por qué', ('Recuperar trabaja con la venta' in t or 'Faltan datos para estimar' in t), t[:200])
        await q.click('#fc-controls [data-value="revenue"]'); await q.wait_for_timeout(1200)
        # ---- ¿Qué hago con esto? ----  (con los datos de prueba el gap forecast es ≈ 0: se fuerza un gap para ver el destino)
        await q.evaluate("(()=>{const A=FP.app.state,r=A.fc.run;const g=r.total.annual.forecastGap.revenue;g.gap=-5e6;g.gapPct=-.05;r.total.annual.forecast.revenue=r.total.annual.plan.revenue-5e6;FP.pacingView.renderTop(A)})()"); await q.wait_for_timeout(300)
        chk('P12 con gap forecast negativo y venta, «Simular la recuperación» está disponible junto con diagnosticar y guardar versión', await q.locator('[data-action="pc-to-recovery"]').count() == 1 and await q.locator('[data-action="dx-from-forecast"]').count() >= 1 and await q.locator('[data-action="pc-to-versions"]').count() == 1)
        await q.click('[data-action="pc-to-versions"]'); await q.wait_for_timeout(600)
        chk('P13 «Ir a versiones» abre el panel y deja a la vista «Guardar forecast como vN» sin guardar nada', await q.evaluate("document.getElementById('pc-vp').open") and await q.locator('#fc-versions [data-action="fc-snapshot"]').is_visible() and await q.evaluate("FP.app.state.fc.registry.versions.length") == 0)
        await q.click('[data-action="pc-to-recovery"]'); await q.wait_for_selector('#view-recovery:not([hidden]) [data-dx-banner]', timeout=30000); await q.wait_for_timeout(800)
        st = await q.evaluate("(()=>{const A=FP.app.state;return [A.rc.settings.comparison,A.rc.settings.periodType,A.rc.settings.periodKey,A.rc.settings.channel,A.rc.fromDx&&A.rc.fromDx.source,A.rc.scenarioStore.scenarios.length]})()")
        chk('P14 Recuperar abre con forecast contra plan, el año y el canal, con el aviso «Vienes de Pacing y Forecast» y nada guardado', st[:5] == ['forecast_vs_plan', 'year', str(2026), 'total', 'pacing'] and st[5] == 0 and 'Vienes de Pacing y Forecast' in await q.evaluate("document.querySelector('[data-dx-banner]').innerText"), st)
        await q.click('[data-dx-banner] [data-action="go"][data-view="pacing"]'); await q.wait_for_selector('#view-pacing:not([hidden]) #pc-vtop h2', timeout=30000)
        chk('P15 «Volver a Pacing» regresa a la página', True)
        await q.set_viewport_size({'width': 390, 'height': 800}); await q.wait_for_timeout(700)
        ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth")
        chk(f'P16 sin desborde horizontal en 390 px ({ov} px)', ov <= 1, ov)
        chk('P17 sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_pacing_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
    sys.exit(1 if fails else 0)
asyncio.run(main())
