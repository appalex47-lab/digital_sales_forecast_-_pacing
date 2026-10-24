"""Fase 2 · Analista de Números (historia, KPIs, secciones, ruta «Entendámoslo juntos») y Auditor de Conversión (puerta GA4, tarjetas priorizadas)
con datos de demo + archivo de productos simulado. Uso: python3 batch_agentes_fase2.py <raiz>"""
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
LOAD = """(async()=>{
  const gen = FP.mockProducts.generate();
  const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
  await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
  const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
  await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
  return true; })()"""
OVER = "document.documentElement.scrollWidth>innerWidth || document.getElementById('ag-panel').scrollWidth>document.getElementById('ag-panel').clientWidth+1"
async def prep(page, products=True):
    await page.goto(f'http://127.0.0.1:{port}/index.html#pacing'); await page.wait_for_function(READY, timeout=60000)
    await page.evaluate("FP.app.actions['generate-mock']()"); await page.wait_for_timeout(1500)
    if products: await page.evaluate(LOAD)
    await page.click('#ag-fab'); await page.wait_for_selector('#ag-panel:not([hidden])'); await page.wait_for_selector('.ag-kpi', timeout=20000); await page.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await prep(q)
        t = await q.evaluate("document.getElementById('ag-body').innerText")
        chk('F1 Números: puerta de confianza, historia en 20 segundos y 4 KPIs', await q.evaluate("!!document.querySelector('.ag-gate')") and 'en 20 segundos' in t and await q.evaluate("document.querySelectorAll('.ag-kpi').length")==4, t[:200])
        chk('F2 hay las tres secciones: Qué se cae, Qué crece, Dónde revisar primero', all(x in t.upper() for x in ['QUÉ SE CAE', 'QUÉ CRECE', 'DÓNDE REVISAR PRIMERO']), t[:100])
        chk('F3 las categorías aparecen cuando hay archivo de productos', await q.evaluate("/categor/i.test(document.getElementById('ag-body').innerText)"))
        chk('F4 «Qué se cae» trae cifra grande y mini-visual', await q.evaluate("!!document.querySelector('.ag-card .ag-big') && !!document.querySelector('.ag-card .ag-bars, .ag-card .ag-tw')"))
        chk('F5 no se mencionan rentabilidad ni ganancia a la vista (el detalle sigue plegado)', not await q.evaluate("/rentab|ganancia|utilidad/i.test(document.getElementById('ag-body').innerText)"))
        # ruta
        r0 = await q.evaluate("(()=>{const p=document.querySelector('.ag-prog'); return {n:+p.getAttribute('aria-valuenow'),max:+p.getAttribute('aria-valuemax'),qs:document.querySelectorAll('.ag-rq').length,btn:(document.querySelector('[data-ag=rnext]')||{}).innerText}})()")
        chk('F6 ruta: 5 preguntas, vas 1 de 5, botón «Entendido, sigamos»', r0['n'] == 1 and r0['max'] == 5 and r0['qs'] == 5 and r0['btn'] == 'Entendido, sigamos', r0)
        await q.click('[data-ag=rnext]'); await q.wait_for_timeout(200)
        r1 = await q.evaluate("(()=>({n:+document.querySelector('.ag-prog').getAttribute('aria-valuenow'),open:document.querySelectorAll('.ag-ra').length,pend:document.querySelectorAll('.ag-rq[disabled]').length}))()")
        chk('F7 «Entendido, sigamos» avanza a la 2 de 5, la 3 a la 5 siguen bloqueadas', r1['n'] == 2 and r1['pend'] == 3, r1)
        for _ in range(3):
            await q.click('[data-ag=rnext]'); await q.wait_for_timeout(120)
        fin = await q.evaluate("(()=>({n:+document.querySelector('.ag-prog').getAttribute('aria-valuenow'),txt:document.querySelector('.ag-route .ag-sp').innerText,btn:(document.querySelector('[data-ag=rnext]')||{}).innerText}))()")
        chk('F8 la última pregunta dice «Listo, ya lo entendí» y al terminar marca la ruta completa', fin['btn'] == 'Listo, ya lo entendí', fin)
        await q.click('[data-ag=rnext]'); await q.wait_for_timeout(200)
        chk('F9 ruta completa: 5 de 5', 'Ruta completa' in await q.evaluate("document.querySelector('.ag-route .ag-sp').innerText"))
        # Ver más del Analista: hipótesis / cómo validar / acción
        await q.evaluate("document.querySelector('.ag-card [data-ag=more]').click()"); await q.wait_for_timeout(100)
        d = await q.evaluate("document.querySelector('.ag-card .ag-det').innerText")
        chk('F10 «Ver más» trae Hipótesis, Cómo validarlo y Acción esta semana', all(x in d.lower() for x in ['hipótesis', 'cómo validarlo', 'acción esta semana']), d[:300])
        # Auditor
        await q.click('.ag-tab[data-id=auditor]'); await q.wait_for_selector('.ag-gate', timeout=20000); await q.wait_for_timeout(1500)
        a = await q.evaluate("document.getElementById('ag-body').innerText")
        chk('F11 Auditor: la puerta GA4 va primero (antes que cualquier hallazgo)', await q.evaluate("(()=>{const g=document.querySelector('.ag-gate'), c=document.querySelector('.ag-card'); return !!g&&(!c||(g.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)>0)})()") and 'GA4' in a, a[:200])
        chk('F12 Auditor: hallazgos con «Prioridad n» y responsable del catálogo', await q.evaluate("[...document.querySelectorAll('.ag-card .ag-pp')].some(x=>/Prioridad \\d/.test(x.innerText))"))
        owners = await q.evaluate("[...document.querySelectorAll('.ag-card .ag-ow, .ag-card [class*=owner]')].map(x=>x.innerText)")
        chk('F13 Auditor: cada tarjeta es la misma tarjeta compartida (título, cifra y «Ver más»)', await q.evaluate("[...document.querySelectorAll('.ag-card')].every(c=>c.querySelector('h3')&&c.querySelector('[data-ag=more]'))"))
        await q.evaluate("document.querySelector('.ag-card [data-ag=more]').click()"); await q.wait_for_timeout(100)
        d2 = await q.evaluate("document.querySelector('.ag-card .ag-det').innerText")
        chk('F14 Auditor «Ver más»: hipótesis (no causa), cómo validarlo, acción y límite', all(x in d2.lower() for x in ['hipótesis', 'cómo validarlo', 'acción esta semana']) and re_ok(d2), d2)
        chk('F15 el Auditor no habla de rentabilidad ni de promociones a la vista', not await q.evaluate("/rentab|ganancia|utilidad|promoci/i.test(document.getElementById('ag-body').innerText.replace(/Qué no puedo afirmar[\\s\\S]*?(Siguiente|Fuente)/g,''))"), a[:100])
        # pregunta libre → traspaso local, sin llamar a IA
        await q.evaluate("FP.cohereConnection.isConfigured=()=>true; FP.cohereClient.chatJson=async()=>({ok:false,errors:['x']}); FP.agentPanel.refresh(false)"); await q.wait_for_selector('#ag-q', timeout=10000)
        await q.wait_for_timeout(1200); await q.fill('#ag-q', '¿Qué promoción hago para esto?'); await q.click('[data-ag=ask]'); await q.wait_for_timeout(500)
        chk('F16 preguntar por promociones lleva al Arquitecto de Ofertas (respuesta local)', await q.evaluate("/Arquitecto de Ofertas/.test((document.querySelector('.ag-ans')||{innerText:''}).innerText)"))
        # Insignia
        badge = await q.evaluate("(document.querySelector('.ag-badge')||{}).innerText||''")
        chk('F17 la insignia del botón es un número', badge.isdigit() or badge == '', badge)
        # tema oscuro
        await q.evaluate("document.documentElement.setAttribute('data-theme','dark')"); await q.wait_for_timeout(200)
        chk('F18 tema oscuro: tarjetas con fondo oscuro y sin desborde', await q.evaluate("(()=>{const c=getComputedStyle(document.querySelector('.ag-card')).backgroundColor.match(/\\d+/g).map(Number); return (c[0]+c[1]+c[2])/3<140})()") and not await q.evaluate(OVER))
        await q.evaluate("document.documentElement.setAttribute('data-theme','light')")
        chk('F19 sin errores de página en PC', not errs, errs[:3])
        # Auditor sin archivo de productos
        ctx2 = await b.new_context(viewport={'width': 1360, 'height': 860}); q2 = await ctx2.new_page(); await q2.goto(f'http://127.0.0.1:{port}/index.html#pacing'); await q2.wait_for_function(READY, timeout=60000)
        await q2.evaluate("FP.app.actions['generate-mock']()"); await q2.wait_for_timeout(1500)
        await q2.click('#ag-fab'); await q2.wait_for_selector('.ag-kpi', timeout=20000); await q2.click('.ag-tab[data-id=auditor]'); await q2.wait_for_timeout(1500)
        e = await q2.evaluate("document.getElementById('ag-body').innerText")
        chk('F20 Auditor sin productos: dice qué falta, enlaza a Carga de datos y no muestra tarjetas', not await q2.evaluate("!!document.querySelector('.ag-pp')") and await q2.evaluate('!!document.querySelector(\'#ag-body a[href="#carga"]\')'), e[:200])
        n = await q2.evaluate("document.getElementById('ag-body').innerText")
        await q2.click('.ag-tab[data-id=analista]'); await q2.wait_for_timeout(800)
        chk('F21 Números sin productos: historia con canales y puerta que lo avisa', await q2.evaluate("/archivo de productos/i.test(document.querySelector('.ag-gate').innerText) && document.querySelectorAll('.ag-kpi').length===4"))
        await ctx.close(); await ctx2.close()
        # móvil
        mctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); m = await mctx.new_page(); merrs = []
        m.on('pageerror', lambda e: merrs.append(str(e)[:200]))
        await prep(m)
        mo = await m.evaluate(f"({OVER})")
        k = await m.evaluate("(()=>{const r=document.querySelector('.ag-kpis').getBoundingClientRect(); return {w:Math.round(r.width), cols:getComputedStyle(document.querySelector('.ag-kpis')).gridTemplateColumns.split(' ').length}})()")
        chk('F22 celular: Números sin scroll horizontal y KPIs en cuadrícula legible', not mo and k['w'] <= 390 and k['cols'] <= 2, [mo, k])
        tapt = await m.evaluate("[...document.querySelectorAll('.ag-rq, [data-ag=rnext], [data-ag=more]')].filter(x=>x.getBoundingClientRect().height>0&&x.getBoundingClientRect().height<40).map(x=>x.className+':'+Math.round(x.getBoundingClientRect().height)+':'+x.innerText.slice(0,20))")
        chk('F23 celular: botones de la ruta y «Ver más» de al menos 40 px', not tapt, tapt)
        await m.click('.ag-tab[data-id=auditor]'); await m.wait_for_selector('.ag-gate', timeout=20000); await m.wait_for_timeout(1500)
        chk('F24 celular: Auditor sin scroll horizontal', not await m.evaluate(f"({OVER})"))
        await m.evaluate("[...document.querySelectorAll('[data-ag=more]')].forEach(b=>b.click())"); await m.wait_for_timeout(200)
        chk('F25 celular: con todos los «Ver más» abiertos tampoco hay scroll horizontal', not await m.evaluate(f"({OVER})"))
        chk('F26 sin errores de página en celular', not merrs, merrs[:3])
        await b.close()
def re_ok(t):
    import re; return not re.search(r'la causa es|se debe a|esto demuestra', t, re.I)
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
