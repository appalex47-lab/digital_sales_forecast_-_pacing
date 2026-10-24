"""Fase 1 · Panel de Asistentes (Analista de Números): botón, carga diferida, estados, accesibilidad, móvil e IA simulada.
Uso: python3 batch_agentes.py <raiz>"""
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
# Una brecha clara en Llamadas sobre los datos de demo: el motor (Pacing) ya calculó plan y real; aquí solo se acentúa para que el detector tenga qué reportar.
SKEW = """(()=>{const r=FP.app.state.fc.run, k=FP.app.state.fc.lastActualDate.slice(0,7);
 const bad=(m,f)=>{const t=m.toDate.revenue; t.actual=t.plan*f; t.gap=t.actual-t.plan; t.gapPct=t.gap/t.plan; t.compliance=f;};
 const mm=(s)=>s.months.find(x=>x.key===k); bad(mm(r.channels.llamadas),0.6); bad(mm(r.total),0.93); return true})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#pacing'); await q.wait_for_function(READY, timeout=60000)
        # Z1 · botón y carga diferida
        fab = await q.evaluate("(()=>{const f=document.getElementById('ag-fab'); return f?{t:f.innerText.replace(/\\s+/g,' ').trim(),pop:f.getAttribute('aria-haspopup'),exp:f.getAttribute('aria-expanded'),h:f.getBoundingClientRect().height}:null})()")
        chk('Z1 hay botón «Asistentes» (≥44 px, aria-expanded=false)', bool(fab) and fab['t'].startswith('Asistentes') and fab['h'] >= 44 and fab['exp'] == 'false', fab)
        chk('Z2 el panel y los detectores NO se descargan al arrancar (módulo diferido)', await q.evaluate("!FP.agents.runner && !FP.agentPanel && !document.getElementById('ag-panel')"))
        # Z3 · sin datos: dice qué falta y a dónde ir
        await q.click('#ag-fab'); await q.wait_for_selector('#ag-panel:not([hidden])')
        chk('Z3 tras abrir se cargaron los módulos', await q.evaluate("!!(FP.agents.runner && FP.agentPanel)"))
        body = await q.evaluate("document.getElementById('ag-body').innerText")
        link = await q.evaluate("(document.querySelector('#ag-body a[data-ag=go]')||{}).getAttribute&&document.querySelector('#ag-body a[data-ag=go]').getAttribute('href')")
        chk('Z4 sin datos: «Todavía no hay con qué comparar» y enlace a Carga de datos', 'Todavía no hay con qué comparar' in body and link == '#carga', [body[:120], link])
        chk('Z5 abierto: dialog con nombre, aria-expanded=true y foco dentro', await q.evaluate("(()=>{const p=document.getElementById('ag-panel'); return p.getAttribute('role')==='dialog'&&!!document.getElementById('ag-title')&&document.getElementById('ag-fab').getAttribute('aria-expanded')==='true'&&p.contains(document.activeElement)})()"))
        await q.keyboard.press('Escape'); await q.wait_for_timeout(100)
        chk('Z6 Esc cierra y devuelve el foco al botón', await q.evaluate("document.getElementById('ag-panel').hidden && document.activeElement===document.getElementById('ag-fab') && document.getElementById('ag-fab').getAttribute('aria-expanded')==='false'"))
        # Con datos de demo
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        before = await q.evaluate("JSON.stringify({v:FP.app.state.view,ls:Object.keys(localStorage).length,fc:FP.app.state.fc.lastActualDate})")
        await q.evaluate(SKEW)
        await q.click('#ag-fab'); await q.wait_for_selector('.ag-card'); await q.wait_for_timeout(300)
        cards = await q.evaluate("[...document.querySelectorAll('.ag-card h3')].map(h=>h.innerText)")
        chk('Z7 con una brecha en Llamadas el panel la reporta primero', len(cards) >= 1 and 'Llamadas' in cards[0], cards)
        chk('Z8 con IA apagada/no configurada dice «Sin IA · textos del motor»', await q.evaluate("document.querySelector('.ag-chip-ai').innerText.includes('Sin IA')"))
        chk('Z9 el detalle viene plegado y «Ver más» lo abre y lo cierra',
            await q.evaluate("(()=>{const c=document.querySelector('.ag-card'); return !c.querySelector('.ag-det')&&c.querySelector('[data-ag=more]').getAttribute('aria-expanded')==='false'})()")
            and await q.evaluate("(()=>{document.querySelector('[data-ag=more]').click(); const c=document.querySelector('.ag-card'); return !!c.querySelector('.ag-det')&&/qué vi/i.test(c.innerText)&&/qué no puedo afirmar/i.test(c.innerText)&&/siguiente pregunta/i.test(c.innerText)&&/Fuente:/.test(c.innerText)})()")
            and await q.evaluate("(()=>{document.querySelector('[data-ag=more]').click(); return !document.querySelector('.ag-card .ag-det')})()"))
        chk('Z10 la descripción del agente está plegada y se abre', await q.evaluate("(()=>{const b=document.querySelector('[data-ag=about]'); const was=b.getAttribute('aria-expanded'); b.click(); return was==='false'&&document.querySelector('.ag-aboutbody')!==null})()"))
        # tabs
        tabs = await q.evaluate("[...document.querySelectorAll('.ag-tab')].map(t=>[t.innerText.replace(/\\s+/g,' '),t.getAttribute('aria-pressed'),t.getBoundingClientRect().height>=44])")
        chk('Z11 tres pestañas (Números activa, Conversión «Fase 2», Ofertas «Fase 4») de ≥44 px', len(tabs) == 3 and tabs[0][1] == 'true' and 'Fase 2' in tabs[1][0] and 'Fase 4' in tabs[2][0] and all(t[2] for t in tabs), tabs)
        await q.click('.ag-tab[data-id=auditor]'); await q.wait_for_timeout(100)
        soon = await q.evaluate("document.getElementById('ag-body').innerText")
        chk('Z12 Auditor: dice que aún no está disponible, no inventa hallazgos', 'Todavía no está disponible' in soon and not await q.evaluate("!!document.querySelector('.ag-card .ag-pp')"), soon[:160])
        await q.click('#ag-body [data-ag=agent][data-id=analista]'); await q.wait_for_timeout(150)
        chk('Z13 volver al Analista restaura los hallazgos', await q.evaluate("!!document.querySelector('.ag-card .ag-pp')"))
        # enlace «Ver en…»
        href = await q.evaluate("document.querySelector('.ag-card a.ag-a').getAttribute('href')")
        await q.click('.ag-card a.ag-a'); await q.wait_for_timeout(500)
        chk('Z14 «Ver en …» navega a la vista indicada', await q.evaluate("location.hash") == href, [href, await q.evaluate("location.hash")])
        await q.keyboard.press('Escape')
        after = await q.evaluate("JSON.stringify({v:FP.app.state.view,ls:Object.keys(localStorage).length,fc:FP.app.state.fc.lastActualDate})")
        chk('Z15 abrir/cerrar el panel no altera datos ni claves guardadas', json_eq(before, after, ['ls', 'fc']), [before, after])
        # IA simulada
        await q.goto(f'http://127.0.0.1:{port}/index.html#pacing'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500); await q.evaluate(SKEW)
        await q.evaluate("""(()=>{window.__calls=0; FP.cohereConnection.isConfigured=()=>true; })()""")
        await q.evaluate("document.getElementById('ag-fab').click()"); await q.wait_for_function("!!FP.agents.runner", timeout=15000)
        await q.evaluate("""(()=>{FP.cohereClient.chatJson=async(o)=>{window.__calls++; const ctx=JSON.parse(o.user); const c=ctx.candidatos[0];
            return {ok:true,model:'sim',text:JSON.stringify({lectura:'Revisa primero la brecha por canal.',hallazgos:[{id:c.id,prioridad:'Alta',titulo:'Revisa primero esta brecha',resumen:c.resumen,siguientePregunta:c.siguientePreguntaBase,responsable:'Contact center'}]})}}})()""")
        await q.evaluate("FP.agentPanel.refresh(true)"); await q.wait_for_function("document.querySelector('.ag-chip-ai.ok')", timeout=15000)
        chk('Z16 con IA simulada: «Ordenado y redactado con IA», título de la IA y lectura', await q.evaluate("document.querySelector('.ag-card h3').innerText==='Revisa primero esta brecha'&&/Revisa primero la brecha por canal/.test(document.getElementById('ag-body').innerText)"))
        await q.evaluate("(()=>{FP.agents.runner.clearCache(); FP.cohereClient.chatJson=async()=>({ok:false,status:'network',errors:['sin red']})})()")
        await q.evaluate("FP.agentPanel.refresh(true)"); await q.wait_for_function("document.querySelector('.ag-chip-ai.warn')", timeout=15000)
        chk('Z17 si la IA falla: aviso claro y los hallazgos del motor siguen ahí', await q.evaluate("/La IA no está disponible|No se pudo consultar/.test(document.getElementById('ag-body').innerText)&&document.querySelectorAll('.ag-card').length>=1"))
        # pregunta libre: oculta sin Análisis calculado
        chk('Z18 «Preguntar» no aparece sin Análisis calculado y explica por qué', await q.evaluate("!document.getElementById('ag-q')&&/abre primero/.test(document.querySelector('.ag-foot').innerText)"))
        await q.evaluate("FP.app.state.an.rows=[{entity:'x'}]; FP.agentPanel.refresh(false)"); await q.wait_for_timeout(300)
        chk('Z19 con Análisis y IA: caja de pregunta y sugerencias ocultas tras «¿No sabes qué preguntar?»', await q.evaluate("!!document.getElementById('ag-q')&&!document.querySelector('.ag-chip')&&!!document.querySelector('[data-ag=sug]')"))
        await q.click('[data-ag=sug]'); await q.wait_for_timeout(100)
        chk('Z20 el enlace despliega sugerencias y tocar una llena la pregunta', await q.evaluate("document.querySelectorAll('.ag-chip').length>=1") and await q.evaluate("(()=>{const c=document.querySelector('.ag-chip'); const t=c.dataset.q; c.click(); return document.getElementById('ag-q').value===t})()"))
        await q.keyboard.press('Escape')
        # Análisis: el botón no tapa el asistente de Análisis que ya existe
        await q.evaluate("location.hash='analisis'"); await q.wait_for_timeout(1200)
        ov = await q.evaluate("""(()=>{const a=document.getElementById('ag-fab').getBoundingClientRect(), o=document.querySelector('.analysis-assistant__fab'); if(!o) return 'sin-fab-analisis'; const r=o.getBoundingClientRect(); return !(a.right<=r.left||a.left>=r.right||a.bottom<=r.top||a.top>=r.bottom)})()""")
        chk('Z21 en Análisis los dos botones no se encimen', ov is False or ov == 'sin-fab-analisis', ov)
        await ctx.close()
        # móvil
        mctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); m = await mctx.new_page(); merrs = []
        m.on('pageerror', lambda e: merrs.append(str(e)[:200]))
        await m.goto(f'http://127.0.0.1:{port}/index.html#pacing'); await m.wait_for_function(READY, timeout=60000)
        await m.evaluate("FP.app.actions['generate-mock']()"); await m.wait_for_timeout(1500); await m.evaluate(SKEW)
        await m.evaluate("document.getElementById('ag-fab').click()"); await m.wait_for_selector('.ag-card'); await m.wait_for_timeout(300)
        g = await m.evaluate("(()=>{const r=document.getElementById('ag-panel').getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),t:Math.round(r.top),ov:document.documentElement.scrollWidth>innerWidth,x:document.querySelector('.ag-x').getBoundingClientRect().width}})()")
        chk('Z22 en celular el panel ocupa toda la pantalla, sin scroll horizontal, cerrar de 44 px', g['w'] == 390 and g['h'] >= 840 and g['t'] == 0 and not g['ov'] and g['x'] >= 44, g)
        await m.click('.ag-card a.ag-a'); await m.wait_for_timeout(500)
        chk('Z23 en celular, «Ver en …» cierra el panel para ver la vista', await m.evaluate("document.getElementById('ag-panel').hidden"))
        chk('Z24 sin errores de página (PC ni celular)', not errs and not merrs, (errs + merrs)[:3])
        await b.close()
def json_eq(a, b, keys):
    import json; x, y = json.loads(a), json.loads(b); return all(x[k] == y[k] for k in keys) and x['v'] == y['v'] or x['v'] != y['v'] and all(x[k] == y[k] for k in keys)
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
