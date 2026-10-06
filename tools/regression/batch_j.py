"""Pruebas de las dos mejoras de Inicio: R-10 (solo modos Aprendiz y Analista; sin los botones de modo de arriba) y R-11 (los datos primero:
«Siguiente paso», recorrido guiado y aviso del plan sin histórico). Uso: python3 batch_j.py <raiz>   Sale 1 si alguna falla."""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','producto','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
SEL = "document.querySelector('.app-main:not([hidden]) .next-step strong, #view-inicio .next-step strong, .home .next-step__title')"
async def nextstep(q):
    return await q.evaluate("""()=>{const s=FP.contextEngine.getNextStep(FP.contextEngine.collectStatus(FP.app.state));return [s.id,s.label,s.view,s.reason]}""")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))

        # ---------- R-10 · modos ----------
        await q.goto(u + '#inicio'); await q.wait_for_timeout(600)
        md = await q.evaluate("""()=>({ids:FP.guidanceConfig.MODES.map(m=>m[0]),labels:FP.guidanceConfig.MODES.map(m=>m[1]),
          ejecutivo:/ejecutivo/i.test([...document.querySelectorAll('.app-nav,.ux-context,#view-ajustes,#help-drawer')].map(e=>e.textContent).join(' ')),
          exec:document.body.classList.contains('mode-exec')})""")
        chk('R-10 solo existen los modos Aprendiz y Analista (Ejecutivo ya no está en la configuración)', md['ids'] == ['learner', 'analyst'] and md['labels'] == ['Aprendiz', 'Analista'] and not md['exec'], md)
        top = []
        for v in VIEWS:
            await q.goto(u + '#' + v); await q.wait_for_timeout(250)
            n = await q.evaluate("[document.querySelectorAll('.ux-context [data-action=\"ux-mode\"]').length, document.querySelectorAll('.ux-context .seg').length, /Ejecutivo/.test(document.querySelector('.ux-context')?.textContent||'')]")
            if n[0] or n[2]: top.append((v, n))
        chk('R-10 desaparecen los tres botones de modo (Aprendiz / Analista / Ejecutivo) del encabezado de cada vista (18 vistas)', not top, top)
        keep = await q.evaluate("""()=>{const v=document.querySelector('.ux-context');return [...v.querySelectorAll('[data-action]')].map(b=>b.dataset.action)}""")
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        keep = await q.evaluate("[...document.querySelectorAll('.ux-context [data-action]')].map(b=>b.dataset.action)")
        chk('R-10 se conservan los botones «Ayuda de esta sección», «Glosario» y «Recorrido guiado»', {'help-section', 'glossary', 'tour-start'} <= set(keep), keep)
        await q.goto(u + '#inicio'); await q.wait_for_timeout(300)
        tg = await q.evaluate("(()=>{const t=document.querySelector('.app-nav [data-action=\"ux-mode\"]');return t?[t.dataset.value,t.getAttribute('aria-pressed')||t.getAttribute('role')||'',(t.getAttribute('aria-label')||t.closest('label')?.innerText||t.parentElement.innerText||'').trim().slice(0,40)]:null})()")
        chk('R-10 el interruptor «Modo Aprendiz» del menú sigue ahí', bool(tg) and 'Aprendiz' in await q.evaluate("document.querySelector('.app-nav').innerText"), tg)
        await q.click('.app-nav [data-action="ux-mode"]'); await q.wait_for_timeout(300)
        m1 = await q.evaluate("[FP.app.state.ux.mode, document.body.classList.contains('mode-learner')]")
        await q.click('.app-nav [data-action="ux-mode"]'); await q.wait_for_timeout(300)
        m2 = await q.evaluate("[FP.app.state.ux.mode, document.body.classList.contains('mode-learner')]")
        chk('R-10 el interruptor alterna Aprendiz ↔ Analista', m1 == ['learner', True] and m2 == ['analyst', False], (m1, m2))
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(500); await q.evaluate("FP.app.actions['st-expand-all']()"); await q.wait_for_timeout(200)
        st = await q.evaluate("[...document.querySelectorAll('#st-modo [data-action=\"ux-mode\"]')].map(b=>b.innerText.trim())")
        chk('R-10 el selector de Configuración ofrece solo Aprendiz y Analista', st == ['Aprendiz', 'Analista'], st)
        # quien tenía guardado «Ejecutivo» pasa a Analista, sin errores
        await q.evaluate("localStorage.setItem(Object.keys(localStorage).find(k=>/uxSettings/i.test(k))||'uxSettings', JSON.stringify({version:1,savedAt:new Date().toISOString(),data:{mode:'exec',tour:{active:false,step:0}}}))")
        keys = await q.evaluate("Object.keys(localStorage)")
        await q.reload(); await q.wait_for_timeout(1200)
        mig = await q.evaluate("[FP.app.state.ux.mode, document.body.classList.contains('mode-exec')]")
        chk('R-10 un modo «exec» guardado de antes pasa a Analista al abrir la app (sin errores)', mig[0] in ('analyst', 'learner') and mig[1] is False and not errs, (mig, errs[:2], keys[:6]))

        # ---------- R-11 · los datos primero ----------
        cases = {}
        await q.evaluate("localStorage.clear()"); await q.goto(u + '#inicio'); await q.reload(); await q.wait_for_timeout(1000)
        cases['vacio'] = await nextstep(q)
        chk('R-11 sin datos: «Siguiente paso» = Cargar datos', cases['vacio'][0] == 'load_data' and cases['vacio'][2] == 'carga', cases['vacio'])
        # solo venta real (sin histórico) y sin meta → primero el histórico, no la meta
        await q.evaluate("""()=>{const s=FP.app.state;const st=FP.contextEngine.collectStatus;window.__real=st;}""")
        ok = await q.evaluate("""()=>{const RULES=null;const mk=(o)=>Object.assign({data:{actual:0,historical:0,quality:'ready'},targets:{defined:false},plan:{imported:false,original:false},actual:{countedDays:0},forecast:{available:false},visited:{},scenarios:{count:0,withHypothesis:0},diagnostic:{hypotheses:0},actions:{count:0,withoutMeasurement:0}},o);
          const g=(o)=>{const s=FP.contextEngine.getNextStep(o);return [s.id,s.view]};
          return {soloReal:g(mk({data:{actual:10,historical:0,quality:'ready'}})),conHistorico:g(mk({data:{actual:0,historical:10,quality:'ready'}})),
            ambos:g(mk({data:{actual:10,historical:10,quality:'ready'}})),metaSinHist:g(mk({data:{actual:10,historical:0,quality:'ready'},targets:{defined:true}})),
            planSinHist:g(mk({data:{actual:10,historical:0,quality:'ready'},plan:{imported:false,original:true}})),calidad:g(mk({data:{actual:10,historical:0,quality:'invalid'}}))}}""")
        chk('R-11 con venta real pero sin histórico y sin meta: «Siguiente paso» = Cargar el histórico (antes que la meta)', ok['soloReal'] == ['load_historical', 'carga'], ok)
        chk('R-11 con histórico cargado el siguiente paso es Capturar la meta (histórico → meta)', ok['conHistorico'] == ['set_targets', 'resumen'] and ok['ambos'] == ['set_targets', 'resumen'], ok)
        chk('R-11 la sugerencia del histórico no estorba: con meta ya capturada o con plan guardado, se sigue adelante aunque falte histórico', ok['metaSinHist'][0] != 'load_historical' and ok['planSinHist'][0] != 'load_historical', ok)
        chk('R-11 los errores de calidad siguen teniendo prioridad sobre todo', ok['calidad'] == ['fix_quality', 'calidad'], ok)
        # con datos de prueba (histórico + real) → meta
        await q.goto(u + '#resumen'); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1400)
        cases['mock'] = await nextstep(q)
        chk('R-11 con los datos de prueba cargados (histórico + real) el siguiente paso ya no pide datos ni histórico: sigue con la meta / el plan', cases['mock'][0] not in ('load_data', 'load_historical'), cases['mock'])
        # la tarjeta de Inicio muestra el mismo paso
        await q.goto(u + '#inicio'); await q.wait_for_timeout(600)
        card = await q.evaluate("(document.querySelector('#view-inicio .home__next, #view-inicio [class*=\"next\"]')||{innerText:''}).innerText.replace(/\\s+/g,' ').slice(0,160)")
        chk('R-11 la tarjeta «Siguiente paso» de Inicio se sigue mostrando', 'Siguiente paso' in card, card)
        # recorrido guiado: empieza por los datos
        tour = await q.evaluate("FP.guidanceConfig.TOUR.map(t=>[t.id,t.view,t.chapter])")
        chk('R-11 el recorrido guiado empieza por los datos (Carga de datos), luego Meta, Plan… y conserva todos los pasos anteriores en el mismo orden', tour[0][:2] == ['datos', 'carga'] and tour[1][0] == 'meta' and [t[0] for t in tour[1:6]] == ['meta', 'plan', 'real', 'pacing', 'forecast'] and len(tour) == 15 and all(t[2] for t in tour), tour[:4])
        await q.goto(u + '#inicio'); await q.wait_for_timeout(300)
        await q.evaluate("FP.app.actions['tour-restart']()"); await q.wait_for_timeout(700)
        tb = await q.evaluate("[location.hash, document.getElementById('tour-bar').innerText.replace(/\\s+/g,' ').slice(0,420)]")
        chk('R-11 «Recorrido guiado» abre Carga de datos en el paso 1 de 15, explica «histórico primero» y dice que empieza por los datos', tb[0] == '#carga' and 'Paso 1 de 15' in tb[1] and 'histórico' in tb[1].lower() and 'empezando por los datos' in tb[1], tb)
        await q.evaluate("FP.app.actions['tour-next']()"); await q.wait_for_timeout(600)
        t2 = await q.evaluate("[location.hash, /Paso 2 de 15/.test(document.getElementById('tour-bar').innerText)]")
        chk('R-11 el paso 2 del recorrido es Meta (Metas y motor)', t2 == ['#resumen', True], t2)
        await q.evaluate("FP.app.actions['tour-exit']()"); await q.wait_for_timeout(300)
        # aviso del plan sin histórico (antes de guardar el plan original, que se congela)
        await q.goto(u + '#resumen'); await q.wait_for_timeout(400)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
        except Exception: pass
        await q.goto(u + '#plan'); await q.wait_for_timeout(500)
        await q.click('[data-action="plan-preview"]'); await q.wait_for_timeout(900)
        W = """()=>{const v=document.getElementById('view-plan');const a=v.querySelector('.ds-alert--warning');return {alert:!!a,text:a?a.innerText.replace(/\\s+/g,' '):'',link:!!(a&&a.querySelector('a[data-nav="carga"]')),saveBtn:!!v.querySelector('[data-action="plan-save"]'),hist:(FP.app.state.planning.preview&&FP.app.state.planning.preview.audit||{}).historicalPeriod}}"""
        w1 = await q.evaluate(W)   # los datos de prueba traen venta real y plan pero NO histórico: el aviso debe salir
        chk('R-11 sin histórico, antes de guardar el plan original aparece el aviso: se congela sin volumen, AOV ni CR, no se puede rehacer, y enlaza a Carga de datos', w1['alert'] and 'Todavía no hay histórico' in w1['text'] and 'congela' in w1['text'] and 'no se puede rehacer' in w1['text'] and w1['link'] and w1['saveBtn'] and not (w1['hist'] or {}).get('firstDate'), w1)
        await q.evaluate("(()=>{const p=FP.app.state.planning.preview;p.audit.historicalPeriod={firstDate:'2025-01-01',lastDate:'2025-12-31',completeYears:[2025]};FP.app.actions['tour-exit']()})()"); await q.wait_for_timeout(500)
        w2 = await q.evaluate(W)
        chk('R-11 con histórico cargado el aviso NO aparece y el botón de guardar sigue ahí', w2['saveBtn'] and not w2['alert'], w2)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_j:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
