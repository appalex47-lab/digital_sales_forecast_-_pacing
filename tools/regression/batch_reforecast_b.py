"""Recovery & Reforecast · versión B: veredicto, chips, resumen general, secciones como preguntas, «¿Y si no llego?», realismo, acciones y móvil. Uso: python3 batch_reforecast_b.py <raiz>"""
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
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
        await q.goto(U + '#reforecast'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        t0 = await q.evaluate("document.getElementById('view-reforecast').innerText")
        chk('R1 sin plan avisa qué falta y no pinta veredicto ni secciones', 'No hay reforecast todavía' in t0 and not await q.locator('#rf-vtop').is_visible() and not await q.locator('#rf-s2').is_visible(), t0[:200])
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
        except Exception: pass
        await q.goto(U + '#plan'); await q.wait_for_timeout(600)
        for a in ['plan-preview', 'plan-save']:
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass
        await q.goto(U + '#reforecast'); await q.wait_for_selector('#rf-kpis .metric-card', timeout=30000); await q.wait_for_timeout(1500)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        v = await q.evaluate("document.querySelector('#rf-vtop h2').innerText")
        chk('R2 veredicto con la meta del año y el requerido', 'meta del año 2026' in v and '$' in v, v)
        chips = await q.evaluate("[...document.querySelectorAll('#rf-vtop .px-tchip')].map(c=>c.innerText.trim())")
        chk('R3 chips: confianza, validaciones, plan que no cambia, reparto, referencia', any('Confianza' in c for c in chips) and any('validaciones' in c for c in chips) and any('Plan original' in c for c in chips) and any('Reparto' in c for c in chips) and any('Referencia' in c for c in chips), chips)
        chk('R4 las 7 cifras (tarjetas) viven bajo el veredicto', await q.locator('#rf-kpis .metric-card').count() == 7)
        short = await q.evaluate("document.querySelector('[data-rf-summary]').innerText")
        n = await q.locator('[data-rf-summary] .px-sum__r').count()
        chk('R5 resumen general con filas condicionales (meta y avance, qué falta, forecast…)', n >= 3 and 'META Y AVANCE' in short.upper() and 'QUÉ FALTA' in short.upper(), short[:300])
        await q.click('#rf-md [data-v=l]'); await q.wait_for_timeout(250)
        long_ = await q.evaluate("document.querySelector('[data-rf-summary]').innerText")
        chk('R6 versión larga da más texto y se puede volver a la corta', len(long_) > len(short)); await q.click('#rf-md [data-v=c]'); await q.wait_for_timeout(200)
        ids = await q.evaluate("[...document.querySelectorAll('#view-reforecast section.px-blk[id]')].filter(s=>!s.hidden&&s.id!=='rf-foot').map(s=>s.id)")
        chk('R7 secciones como preguntas, en orden', ids[:6] == ['rf-s1', 'rf-s2', 'rf-s3', 'rf-sr', 'rf-s4', 'rf-s5'] and ids[-1] == 'rf-sq', ids)
        chk('R8 con el forecast en la meta no aparece «¿Y si no llego?»', not await q.locator('#rf-sg').is_visible())
        chk('R9 versiones y método vienen cerrados', await q.evaluate("!document.getElementById('rf-vp').open && !document.getElementById('rf-meth').open"))
        await q.click('#rf-m-res'); await q.wait_for_timeout(200)
        chk('R10 «Resumen» oculta las secciones y «Completo» las vuelve a mostrar', not await q.locator('#rf-s1').is_visible()); await q.click('#rf-m-full'); await q.wait_for_timeout(200)
        chk('R10b «Completo» las muestra', await q.locator('#rf-s1').is_visible())
        await q.click('#view-reforecast [data-action="fs-toggle"]'); await q.wait_for_timeout(300)
        chk('R11 «⚙ Ajustes» muestra AOV y CR, simulación y mínimo con peso 0', all([await q.locator(x).count() == 1 for x in ('#rf-assump', '#rf-sim', '#rf-floor')]))
        await q.click('#view-reforecast [data-action="fs-toggle"]'); await q.wait_for_timeout(200)
        # horizonte mes
        await q.select_option('#rf-horizon', 'month'); await q.wait_for_timeout(900)
        v2 = await q.evaluate("document.querySelector('#rf-vtop h2').innerText")
        chk('R12 cambiar el horizonte a mes recalcula el veredicto (septiembre 2026)', 'septiembre 2026' in v2, v2)
        await q.select_option('#rf-horizon', 'year'); await q.wait_for_timeout(700)
        # forzar un forecast por debajo de la meta y confianza suficiente para probar las ramas
        await q.evaluate("""(()=>{const A=FP.app.state,r=A.rf.run,t=r.total,hs=t.horizonSummary;hs.forecast.revenue=t.horizon.target*0.95;hs.pressure.revenue.pressure=0.2;t.confidence.level='sufficient';FP.reforecastView.render(A)})()""")
        await q.wait_for_timeout(300)
        v3 = await q.evaluate("document.querySelector('#rf-vtop h2').innerText")
        chk('R13 forecast 5 % por debajo: el veredicto dice que hay que vender X más y que el forecast se queda por debajo', 'por debajo' in v3 and 'hay que vender' in v3, v3)
        chk('R14 aparece «¿Y si no llego?» con la distancia y el cierre esperado', await q.locator('#rf-sg').is_visible() and 'Distancia a la meta' in await q.evaluate("document.getElementById('rf-nogo').innerText"))
        # acciones
        chk('R15 «¿Qué hago con esto?» con 4 acciones y ningún enlace guarda nada', await q.locator('#rf-actions .px-act > div').count() == 4 and await q.evaluate("(FP.app.state.rc.scenarios||[]).length") == 0)
        await q.click('#rf-actions [data-action="rf-to-recovery"]'); await q.wait_for_timeout(800)
        st = await q.evaluate("[location.hash, FP.app.state.rc.settings.comparison, FP.app.state.rc.settings.periodType, FP.app.state.rc.settings.periodKey, (FP.app.state.rc.fromDx||{}).source]")
        chk('R16 «Simular la recuperación» abre Recuperar con forecast contra plan, año y banner de origen', st == ['#recovery', 'forecast_vs_plan', 'year', '2026', 'reforecast'], st)
        chk('R16b el banner dice «Vienes de Recovery & Reforecast»', 'Vienes de Recovery & Reforecast' in await q.evaluate("(document.querySelector('[data-dx-banner]')||{innerText:''}).innerText"))
        await q.evaluate("location.hash='#reforecast'"); await q.wait_for_timeout(700)
        await q.click('#rf-actions [data-action="dx-from-reforecast"]'); await q.wait_for_timeout(700)
        chk('R17 «Diagnosticar la recuperación» abre Diagnóstico (reforecast contra forecast)', await q.evaluate("[location.hash, FP.app.state.dx.settings.comparison]") == ['#diagnostico', 'reforecast_vs_forecast'])
        await q.evaluate("location.hash='#reforecast'"); await q.wait_for_timeout(700)
        await q.click('#rf-actions [data-action="rf-to-versions"]'); await q.wait_for_timeout(500)
        chk('R18 «Guardar esta versión» abre «Versiones y exportar» con el botón a la vista', await q.evaluate("document.getElementById('rf-vp').open") and await q.locator('#rf-versions [data-action="rf-snapshot"]').count() == 1)
        await q.evaluate("document.getElementById('rf-vp').open=false")
        await q.click('#rf-actions [data-action="rf-to-pacing"]'); await q.wait_for_timeout(600)
        chk('R19 «Ver el canal en Pacing» abre Pacing', await q.evaluate("location.hash") == '#pacing')
        # métrica distinta de venta: simular se deshabilita
        await q.evaluate("location.hash='#reforecast'"); await q.wait_for_timeout(600)
        await q.click('#view-reforecast [data-action="rf-metric"][data-value="orders"]'); await q.wait_for_timeout(700)
        await q.evaluate("""(()=>{const A=FP.app.state,t=A.rf.run.total;t.confidence.level='sufficient';FP.reforecastView.render(A)})()""")
        txt = await q.evaluate("document.getElementById('rf-actions').innerText")
        chk('R20 con Pedidos «Simular la recuperación» se deshabilita y dice por qué', 'Recuperar trabaja con la venta' in txt, txt[:200])
        await q.click('#view-reforecast [data-action="rf-metric"][data-value="revenue"]'); await q.wait_for_timeout(600)
        bad = []
        for w in (1920, 1280, 768, 390, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            if await q.evaluate("document.documentElement.scrollWidth-innerWidth") > 0: bad.append(w)
        chk('R21 sin desborde de página de 320 a 1920 px', not bad, bad)
        chk('Z sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nRESULTADO batch_reforecast_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
