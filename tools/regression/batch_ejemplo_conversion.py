"""Fase 3.2b · «Probar con datos de ejemplo» en el Asistente de Conversión. Regla: ejemplo y datos reales nunca conviven; sin botón de borrar en el Asistente.
Uso: python3 batch_ejemplo_conversion.py <raiz>"""
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
BODY = "(document.getElementById('ag-body')||{innerText:''}).innerText"
async def tab(q, name):
    el = await q.query_selector(f'#ag-panel :text-is("{name}")'); await el.click(); await q.wait_for_timeout(2500)
async def open_panel(q):
    await q.evaluate("FP.agentLauncher.refreshBadge()"); await q.wait_for_timeout(2500)
    if not await q.evaluate("!!document.getElementById('ag-panel') && !document.getElementById('ag-panel').hidden"):
        await q.click('.ag-fab, #ag-fab'); await q.wait_for_timeout(2500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(2500)
        chk('E0 con los datos de prueba (no reales) se puede ofrecer el ejemplo', await q.evaluate("FP.app.demoInfo().canOffer === true"), await q.evaluate("FP.app.demoInfo()"))
        await open_panel(q); await tab(q, 'Conversión')
        t = await q.evaluate(BODY)
        chk('E1 el aviso «Todavía no hay productos cargados» trae el botón «Probar con datos de ejemplo» junto a «Ir a Carga de datos»', 'Todavía no hay productos cargados' in t and 'Probar con datos de ejemplo' in t and 'Ir a Carga de datos' in t, t[:300])
        h = await q.evaluate("(document.querySelector('[data-ag=demo]')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height")
        chk('E1b el botón mide al menos 44 px', h >= 44, h)
        await q.click('[data-ag=demo]'); await q.wait_for_function("FP.app.demoInfo().loaded === true", timeout=60000); await q.wait_for_timeout(4500)
        t = await q.evaluate(BODY)
        chk('E2 el Auditor se llena con hallazgos del ejemplo', 'GA4' in t and ('Fuga por paso' in t or 'fuga' in t.lower()), t[:400])
        chk('E3 sale la franja «Estás viendo datos de ejemplo»', 'Estás viendo datos de ejemplo' in t, t[:200])
        chk('E4 en el Asistente no hay botón de borrar los datos de ejemplo', not await q.evaluate("[...document.querySelectorAll('#ag-panel button, #ag-panel a')].some(e=>/quitar|borrar|eliminar/i.test(e.innerText))"))
        await tab(q, 'Números')
        t = await q.evaluate(BODY)
        chk('E5 la franja también sale en el Analista (las categorías salen de esos productos)', 'Estás viendo datos de ejemplo' in t, t[:200])
        chk('E6 con el ejemplo cargado ya no se ofrece de nuevo', await q.evaluate("FP.app.demoInfo().canOffer === false && FP.app.demoInfo().loaded === true"))
        names = await q.evaluate("FP.productStore.listBatches().then(l=>l.map(b=>b.fileName))")
        chk('E7 los dos archivos (venta y funnel) quedan marcados «EJEMPLO · »', len(names) == 2 and all(n.startswith('EJEMPLO · ') for n in names), names)
        # Cargar un archivo real quita el ejemplo
        await q.evaluate("FP.app.actions['p-mock']()"); await q.wait_for_function("FP.app.state.staging.items.length>0 && FP.app.state.staging.items.every(i=>i.status==='ready')", timeout=60000)
        await q.evaluate("FP.app.actions['commit-staged']()"); await q.wait_for_timeout(7000)
        names = await q.evaluate("FP.productStore.listBatches().then(l=>l.map(b=>b.fileName))")
        chk('E8 al guardar un archivo real de productos se retira el ejemplo (nunca conviven)', names and not any(n.startswith('EJEMPLO ·') for n in names) and await q.evaluate("FP.app.demoInfo().loaded === false"), names)
        chk('E9 con datos reales de productos el ejemplo ya no se ofrece', await q.evaluate("FP.app.demoInfo().canOffer === false && FP.app.demoInfo().real === true"))
        # Un lote de venta real (sin origen de prueba) bloquea el botón
        await q.evaluate("(()=>{ const ST=FP.dataStore; const all=ST.allBatches(FP.app.state.store); window.__o=all[0].origin; all[0].origin='real'; })()")
        chk('E10 un lote de venta real (no de prueba) también bloquea el ejemplo', await q.evaluate("FP.app.demoInfo().real === true && FP.app.demoInfo().canOffer === false"))
        await q.evaluate("(()=>{ FP.dataStore.allBatches(FP.app.state.store)[0].origin=window.__o; })()")
        # Un archivo real de venta (no de productos) también retira el ejemplo — contexto limpio
        c3 = await b.new_context(viewport={'width': 1360, 'height': 900}); r = await c3.new_page()
        await r.goto(f'http://127.0.0.1:{port}/index.html#carga'); await r.wait_for_function(READY, timeout=60000)
        chk('E11a app vacía: el ejemplo se puede ofrecer', await r.evaluate("FP.app.demoInfo().canOffer === true"))
        await r.evaluate("FP.app.actions['ag-demo-conversion']()"); await r.wait_for_function("FP.app.demoInfo().loaded === true", timeout=60000)
        CLEAN = 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'2026-09-{d:02d},{ch},{1000+d},{10+d},{1000+d}' for d in range(1, 31) for ch in ('ecommerce', 'app', 'whatsapp', 'llamadas')) + '\n'
        await r.wait_for_selector('input[data-action="pick-files"][data-type="actual"]', state='attached')
        await r.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': 'real.csv', 'mimeType': 'text/csv', 'buffer': CLEAN.encode()}])
        await r.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await r.click('[data-action="commit-staged"]'); await r.wait_for_timeout(5000)
        chk('E11 al importar venta real se retira el ejemplo de productos', await r.evaluate("FP.app.demoInfo().loaded === false && FP.app.demoInfo().real === true"), await r.evaluate("FP.app.demoInfo()"))
        await c3.close()
        # Móvil
        m = await b.new_context(viewport={'width': 390, 'height': 800}); mp = await m.new_page()
        await mp.goto(f'http://127.0.0.1:{port}/index.html#inicio'); await mp.wait_for_function(READY, timeout=60000)
        await mp.evaluate("FP.app.actions['generate-mock']()"); await mp.wait_for_timeout(2500)
        await open_panel(mp); await tab(mp, 'Conversión')
        w = await mp.evaluate("[document.documentElement.scrollWidth, innerWidth, !!document.querySelector('[data-ag=demo]')]")
        chk('M1 en celular el botón se ve y no hay desplazamiento horizontal', w[2] and w[0] <= w[1] + 1, w)
        chk('Z sin errores de consola ni de página', not errs, errs[:3])
        await b.close()
    print('\n' + ('✔ todo bien' if not fails else f'✘ {len(fails)} fallas'))
    sys.exit(1 if fails else 0)
asyncio.run(main())
