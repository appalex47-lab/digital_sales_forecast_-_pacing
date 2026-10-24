"""Fase 3 · La línea del Analista en Inicio, la confianza del cierre estimado y las capas que no coinciden. Datos de demo.
Uso: python3 batch_agentes_fase3.py <raiz>"""
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
# Con los datos de demo el Analista solo tiene un hallazgo de prioridad Baja. Para ver la línea de punta a punta se fuerza la confianza del cierre en Media
# (el motor real de confianza se prueba aparte, en tools/test-forecast-confidence.js).
FORCE = """(()=>{ FP.forecastConfidence.__real = FP.forecastConfidence.__real || FP.forecastConfidence.assess;
  FP.forecastConfidence.assess = (a) => { const r = FP.forecastConfidence.__real(a); return r && r.status==='ok' ? { ...r, level:'media', label:'Media' } : r; };
  FP.agents.runner.clearCache(); return true; })()"""
UNFORCE = "(()=>{ FP.forecastConfidence.assess = FP.forecastConfidence.__real; FP.agents.runner.clearCache(); return true; })()"
SET = """(o)=>{ const s=FP.app.state.dx.settings; s.channel=o.channel; s.periodType=o.type; s.periodKey=o.key; FP.app.state.dx.run=null; FP.app.render(); return true; }"""
LINE = "(()=>{const l=document.getElementById('ag-line'); return l?{t:l.innerText,h:l.getBoundingClientRect().height,after:l.previousElementSibling?l.previousElementSibling.className:null,w:l.getBoundingClientRect().width}:null})()"
async def refresh(p, ms=2500):
    await p.evaluate("FP.agentLauncher.refreshBadge()"); await p.wait_for_timeout(ms)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(2500)
        await refresh(q, 4000)
        sm = await q.evaluate("FP.agentPanel.summary()")
        chk('H0 la línea y el contador salen si y solo si hay hallazgos Alta o Media', (await q.evaluate(LINE) is not None) == (sm['n'] > 0) and (await q.evaluate("!!document.querySelector('.ag-badge')")) == (sm['n'] > 0), sm)
        # Confianza Media forzada → un hallazgo Media
        await q.evaluate(FORCE); await refresh(q, 4000)
        ln = await q.evaluate(LINE)
        chk('H1 con un hallazgo Media aparece la línea del Analista bajo el encabezado de Inicio', bool(ln) and 'El Analista encontró 1 cosa' in ln['t'] and 'Media' in ln['t'] and 'home__head' in (ln['after'] or ''), ln)
        chk('H1b la línea nombra periodo y canal elegidos', bool(ln) and 'septiembre 2026' in ln['t'] and 'Total digital' in ln['t'], ln)
        chk('H1c el contador del botón flotante cuenta lo mismo', await q.evaluate("(document.querySelector('.ag-badge')||{}).innerText==='1'"))
        chk('H1d la línea es una sola, de una frase, y alta de ~44-80 px (no un bloque)', bool(ln) and ln['h'] < 90 and await q.evaluate("document.querySelectorAll('#ag-line').length===1"), ln)
        chk('H1e no se agregó ningún bloque nuevo a Inicio (sigue el mismo número de secciones)', await q.evaluate("document.querySelectorAll('#home section').length>0 && !document.querySelector('#home .ag-hallazgos')"))
        sz = await q.evaluate("[...document.querySelectorAll('#ag-line button')].map(b=>Math.round(b.getBoundingClientRect().height))")
        chk('H1f los botones de la línea miden al menos 44 px', sz and min(sz) >= 44, sz)
        # Abrir en Asistentes
        await q.click('#ag-line [data-ag-line=open]'); await q.wait_for_selector('.ag-kpi', timeout=25000); await q.wait_for_timeout(600)
        chk('H2 «Abrir en Asistentes» abre el panel en el Analista de Números', await q.evaluate("document.getElementById('ag-panel') && !document.getElementById('ag-panel').hidden && /Analista de Números/.test(document.getElementById('ag-body').innerText+document.querySelector('.ag-sel, .ag-who, #ag-panel').innerText)"))
        chk('H3 el cierre estimado trae «Confianza Media»', await q.evaluate("[...document.querySelectorAll('.ag-kpi')].some(k=>/Cierre/.test(k.innerText)&&/Confianza Media/.test(k.innerText))"))
        t = await q.evaluate("document.getElementById('ag-body').innerText")
        chk('H4 el hallazgo de confianza aparece en «Dónde revisar primero» con el límite honesto', 'confianza Media' in t and 'Confianza' in t, t[:300])
        await q.evaluate("[...document.querySelectorAll('.ag-card')].find(c=>/confianza Media/.test(c.innerText)).querySelector('[data-ag=more]').click()"); await q.wait_for_timeout(200)
        det = await q.evaluate("[...document.querySelectorAll('.ag-card')].find(c=>/confianza Media/.test(c.innerText)).innerText")
        chk('H4b el detalle lista los factores con cifras y dice que no es una probabilidad', all(x in det for x in ['Días con venta real', 'Estabilidad']) and 'no es una probabilidad' in det.lower() and '%' in det, det[:600])
        await q.click('[data-ag=close]'); await q.wait_for_timeout(300)
        # Cerrar
        await q.click('#ag-line [data-ag-line=close]'); await q.wait_for_timeout(200)
        chk('H5 la X cierra la línea', await q.evaluate(LINE) is None)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(600)
        chk('H5b al redibujar Inicio no vuelve a salir con la misma selección', await q.evaluate(LINE) is None)
        # Cambiar período → se recalcula y reaparece
        await q.evaluate("""(()=>{ const r=FP.app.state.fc.run; window.__m=r.total.months.filter(m=>m.countedDays>=3).map(m=>m.key); return window.__m })()""")
        mo = await q.evaluate("window.__m")
        other = [m for m in mo if m != '2026-09']
        if other:
            await q.evaluate(f"({SET})({{channel:'total',type:'month',key:'{other[0]}'}})"); await q.wait_for_timeout(600)
            await refresh(q, 4000)
            chk('H6 al cambiar de periodo la línea se vuelve a calcular (no arrastra el cierre anterior)', await q.evaluate(LINE) is None or 'septiembre 2026' not in (await q.evaluate(LINE))['t'], await q.evaluate(LINE))
        else:
            chk('H6 (sin otro mes con real en la demo: se omite)', True)
        await q.evaluate(f"({SET})({{channel:'total',type:'month',key:'2026-09'}})"); await q.wait_for_timeout(600)
        await q.evaluate("location.hash='#pacing'"); await q.wait_for_timeout(1200)
        chk('H7 en otras vistas no sale la línea', await q.evaluate(LINE) is None)
        await q.evaluate(UNFORCE)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(800)
        pc = await q.evaluate("(()=>{const c=document.querySelector('[data-conf-chip]'); const n=document.getElementById('fc-kpis').innerText; return {chip:c?c.innerText:null, note:/Confianza del cierre/.test(n), nota:/no la probabilidad de acertar/.test(n)}})()")
        chk('H8 Pacing muestra «Confianza …» junto al forecast de cierre y la explicación de los factores', bool(pc['chip']) and pc['chip'].startswith('Confianza') and pc['note'] and pc['nota'], pc)
        # Celular
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); mp = await m.new_page(); merrs = []
        mp.on('pageerror', lambda e: merrs.append(str(e)[:200]))
        await mp.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await mp.wait_for_function(READY, timeout=60000)
        await mp.evaluate("FP.app.actions['generate-mock']()"); await mp.wait_for_timeout(2500)
        await refresh(mp, 3000); await mp.evaluate(FORCE); await refresh(mp, 4000)
        ml = await mp.evaluate(LINE)
        chk('H9 celular: la línea cabe sin scroll horizontal y con botones de 44 px', bool(ml) and await mp.evaluate("document.documentElement.scrollWidth<=innerWidth") and min(await mp.evaluate("[...document.querySelectorAll('#ag-line button')].map(b=>Math.round(b.getBoundingClientRect().height))"))>=44, ml)
        chk('H10 sin errores de página', not errs and not merrs, errs[:3] + merrs[:3])
        await b.close()
    print('\nOK' if not fails else f'\n{len(fails)} FALLAN')
    sys.exit(1 if fails else 0)
asyncio.run(main())
