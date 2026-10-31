"""Diagnóstico en versión B: veredicto, resumen por reglas, cinco preguntas, filtros plegados y los enlaces «¿Qué hago con esto?» hacia Producto y evolución y Recuperar. Uso: python3 batch_diag_b.py <raiz>"""
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
HYP = """()=>{const A=FP.app.state, d=A.dx.run; d.hypotheses=[{id:'H1',hypothesis:'La caída de tráfico explica la mayor parte de la brecha.',driver:'trafficVolume',priority:'high',evidenceLevel:'localized',relatedSignals:[],source:'rules',statusLabel:'Requiere investigación',mechanism:'x',validationNeeded:['x']}];
  FP.diagnosticView.render(A); return d.hypotheses.length}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append((str(e) + ' | ' + str(getattr(e, 'stack', '')).replace(chr(10), ' ← ')[:400])))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
        except Exception: pass
        await q.goto(U + '#plan'); await q.wait_for_timeout(600)
        for a in ['plan-preview', 'plan-save']:
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass
        await q.goto(U + '#prodevol'); await q.wait_for_selector('#view-prodevol [data-action="p-mock"]', state='attached', timeout=60000)
        await q.evaluate("document.querySelectorAll('#view-prodevol details').forEach(d=>d.open=true)"); await q.click('#view-prodevol [data-action="p-mock"]'); await q.wait_for_timeout(700)
        for k in (1, 2):
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=90000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function(f"document.querySelectorAll('#view-carga .staging__head').length === {2-k}", timeout=180000)
        await q.goto(U + '#diagnostico'); await q.wait_for_selector('#dx-verdict h2', timeout=60000); await q.wait_for_timeout(2500)
        await q.evaluate("document.querySelectorAll('dialog,#tour-offer').forEach(d=>d.remove())")
        chk('D1 la página abre con veredicto, ruta de 4 pasos, ≥3 etiquetas, 6 indicadores y resumen general con ≥2 filas', await q.locator('#dx-verdict h2').count() == 1 and await q.locator('#dx-verdict .dx-stp a').count() == 4 and await q.locator('#dx-verdict .px-tchip').count() >= 3 and await q.locator('#dx-verdict .px-kpi').count() == 6 and await q.locator('[data-dx-summary] .px-sum__r').count() >= 2)
        chk('D2 las cinco preguntas y el método existen; el método viene cerrado', all([await q.locator(f'#view-diagnostico #{i}').count() == 1 for i in ('s-h', 's-d', 's-w', 's-y', 's-c', 'dx-meth')]) and await q.evaluate("!document.getElementById('dx-meth').open"))
        chk('D3 los filtros vienen plegados y los chips dicen qué está activo (Comparación, Periodo, Canal, Métrica, Método)', await q.evaluate("!document.getElementById('dx-filters').open") and await q.locator('#dx-filters .dx-filters__chips .ds-badge').count() == 5)
        short = await q.evaluate("document.querySelector('[data-dx-summary]').innerText")
        await q.click('#dx-md [data-v=l]'); await q.wait_for_timeout(200)
        long_ = await q.evaluate("document.querySelector('[data-dx-summary]').innerText")
        chk('D4 la versión larga del resumen da más texto que la corta y se puede volver', len(long_) > len(short)); await q.click('#dx-md [data-v=c]')
        await q.click('#dx-m-res'); await q.wait_for_timeout(150)
        chk('D5 «Resumen» oculta las secciones y «Completo» las vuelve a mostrar', not await q.locator('#s-h').is_visible()); await q.click('#dx-m-full'); await q.wait_for_timeout(150)
        chk('D6 «Completo» vuelve a mostrar las secciones', await q.locator('#s-h').is_visible())
        gap = await q.evaluate("(()=>{const d=FP.app.state.dx.run;return [FP.dxResumen.fmt(d.metric,d.gap.abs,true), document.querySelectorAll('#dx-verdict .px-kpi__v')[2].innerText]})()")
        chk('D7 la brecha del indicador coincide con la del motor', gap[0] == gap[1], gap)
        v0t = await q.locator('#dx-products .dx-pt[data-pt="0"] table').is_visible()
        await q.click('#dx-pt [data-pt="1"]'); await q.wait_for_timeout(200)
        chk('D7b el selector Categoría | Producto | Región muestra una tabla a la vez', v0t and not await q.locator('#dx-products .dx-pt[data-pt="0"] table').is_visible() and await q.locator('#dx-products .dx-pt[data-pt="1"] table').is_visible())
        await q.click('#dx-pt [data-pt="0"]'); await q.wait_for_timeout(100)
        # cambiar la comparación recalcula y cambia el veredicto
        v0 = await q.evaluate("document.querySelector('#dx-verdict h2').innerText")
        await q.click('#dx-filters > summary'); await q.select_option('#dx-cmp', 'forecast_vs_plan'); await q.wait_for_timeout(2500)
        v1 = await q.evaluate("document.querySelector('#dx-verdict h2').innerText")
        chk('D8 otra comparación recalcula el diagnóstico y la frase habla del forecast', v0 != v1 and 'forecast' in v1.lower(), [v0, v1])
        await q.select_option('#dx-cmp', 'actual_vs_plan'); await q.wait_for_timeout(2000)
        # ---- ¿Qué hago con esto? ----
        n = await q.evaluate(HYP); await q.wait_for_timeout(300)
        chk('D9 con una hipótesis aparece «¿Qué hago con esto?» con 3 destinos', n == 1 and await q.locator('#view-diagnostico #s-q').is_visible() and await q.locator('#dx-actions .px-act > div').count() == 3)
        chk('D10 «Simular la recuperación» está disponible contra el plan y «Llevar al plan de acción» pide un escenario guardado', await q.locator('[data-action="dx-to-recovery"]').count() == 1 and await q.locator('[data-action="dx-to-plan"]').count() == 0 and 'Primero guarda un escenario' in await q.evaluate("document.getElementById('dx-actions').innerText"))
        await q.click('[data-action="dx-to-recovery"]'); await q.wait_for_selector('#view-recovery:not([hidden]) [data-dx-banner]', timeout=30000); await q.wait_for_timeout(800)
        st = await q.evaluate("(()=>{const A=FP.app.state;return [A.rc.settings.channel===A.dx.settings.channel, A.rc.settings.periodKey===A.dx.settings.periodKey, A.rc.settings.comparison===A.dx.settings.comparison, A.rc.altHyp, A.rc.fromDx&&A.rc.fromDx.alt]})()")
        chk('D11 Recuperar abre con el mismo canal, periodo y comparación, la hipótesis ligada y la ruta del driver', st == [True, True, True, 'H1', 'A'], st)
        chk('D12 el aviso «Vienes del Diagnóstico» se ve, la ruta de la hipótesis está resaltada y nada se guardó', await q.locator('[data-dx-banner]').count() == 1 and await q.locator('#rc-inverse .rcr--dx').count() == 1 and await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.length") == 0, await q.locator('#rc-inverse .rcr--dx').count())
        await q.click('[data-dx-banner] [data-action="go"][data-view="diagnostico"]'); await q.wait_for_selector('#view-diagnostico:not([hidden]) #dx-verdict h2', timeout=30000); await q.wait_for_timeout(1200)
        chk('D13 «Volver al diagnóstico» regresa al mismo diagnóstico', await q.evaluate("FP.app.state.dx.settings.comparison") == 'actual_vs_plan')
        # un escenario guardado (con el mismo motor de la app) ligado a la hipótesis habilita «Llevar al plan de acción»
        await q.goto(U + '#recovery'); await q.wait_for_selector('#rc-simulator select', timeout=30000); await q.wait_for_timeout(800)
        await q.fill('#rc-trafficPct', '5'); await q.press('#rc-trafficPct', 'Tab'); await q.wait_for_timeout(500)
        ok = await q.evaluate("""()=>{const rc=FP.app.state.rc;if(!rc.preview||!rc.preview.valid)return 'preview inválido';
          const sc=FP.scenarioEngine.saveScenario(rc.scenarioStore,{ctx:rc.ctx,result:rc.preview,name:'Escenario de prueba',type:'custom',supersedes:null,
            links:{hypothesisId:'H1',hypothesis:'La caída de tráfico explica la mayor parte de la brecha.',signalIds:[],driver:'trafficVolume',diagnosisComparison:null}});return 'ok '+sc.scenarioId}""")
        await q.goto(U + '#diagnostico'); await q.wait_for_selector('#dx-verdict h2', timeout=30000); await q.wait_for_timeout(1500)
        await q.evaluate(HYP); await q.wait_for_timeout(300)
        sid = ok.split(' ')[1] if str(ok).startswith('ok') else ''
        chk('D14 con un escenario ligado a la hipótesis se habilita «Llevar al plan de acción»', await q.locator('[data-action="dx-to-plan"]').count() == 1)
        await q.click('[data-action="dx-to-plan"]'); await q.wait_for_selector('#view-recovery:not([hidden]) [data-dx-banner]', timeout=30000)
        chk('D15 llega a Recuperar con el escenario ya elegido para las acciones', await q.evaluate("FP.app.state.rc.actionScenario") == sid and sid != '')
        # contra el año anterior no hay recuperación (regla con un diagnóstico mínimo: con los datos de prueba no hay año anterior)
        r16 = await q.evaluate("(()=>{const st=FP.app.state;const d={comparison:{id:'actual_vs_yoy'},metric:'revenue',period:{type:'month'},gap:{abs:-1},level1Drivers:[],hypotheses:[{id:'H1',driver:'trafficVolume',hypothesis:'x'}]};return FP.dxResumen.actions(st,d,null).recovery})()")
        chk('D16 contra el año anterior «Simular la recuperación» se deshabilita y dice por qué', 'Recuperar trabaja contra el plan' in (r16.get('why') or ''), r16)
        await q.select_option('#dx-cmp', 'actual_vs_plan') if False else None
        # ---- Producto y evolución ----
        await q.goto(U + '#diagnostico'); await q.wait_for_selector('#dx-verdict h2', timeout=30000); await q.wait_for_timeout(1500); await q.evaluate(HYP); await q.wait_for_timeout(300)
        if await q.locator('[data-action="dx-to-product"]').count():
            key = await q.evaluate("document.querySelector('[data-action=\"dx-to-product\"]').dataset.key")
            await q.click('[data-action="dx-to-product"]'); await q.wait_for_selector('#view-prodevol:not([hidden]) .px-bn', timeout=60000); await q.wait_for_timeout(2500)
            r = await q.evaluate("(()=>{const A=FP.app.state,x=FP.productAnalysis.fromDiagnosis(A.dx.run);return [A.pa.from===x.from,A.pa.to<=x.to,A.pa.channel===x.channel,A.peFocusKey,A.pa.to>=A.pa.from]})()")
            chk('D17 Producto y evolución abre con el mismo inicio de periodo y canal (el fin se acota a los datos cargados) y parado en el producto o categoría del diagnóstico', r[0] and r[1] and r[2] and r[3] == key and r[4], [r, key])
            chk('D18 el aviso «Vienes del Diagnóstico» tiene el enlace para volver', 'Vienes del Diagnóstico' in await q.evaluate("document.querySelector('#view-prodevol .px-bn').innerText"))
        else:
            chk('D17 hay desglose de producto para llegar a Producto y evolución', False, 'sin tarjeta «Ver el producto afectado»')
        await q.goto(U + '#diagnostico'); await q.wait_for_selector('#dx-verdict h2', timeout=30000); await q.set_viewport_size({'width': 390, 'height': 800}); await q.wait_for_timeout(700)
        ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth")
        chk(f'D19 sin desborde horizontal en 390 px ({ov} px)', ov <= 1, ov)
        chk('D20 sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_diag_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
    sys.exit(1 if fails else 0)
asyncio.run(main())
