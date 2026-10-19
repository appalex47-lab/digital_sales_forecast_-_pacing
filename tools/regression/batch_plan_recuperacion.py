"""v0.16.0 · «Plan de recuperación»: el cálculo inverso y el simulador en un solo bloque (escritorio y móvil).
Uso: python3 -I batch_plan_recuperacion.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
async def flow(b, w, h, tag, errs):
    q = await (await b.new_context(viewport={'width': w, 'height': h})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
    r = await prepare(q, u); chk(f'{tag}0 partida', r == 'ok', r)
    await q.wait_for_selector('#rc-inverse .rcr', timeout=15000)
    chk(f'{tag}1 el bloque «Plan de recuperación» trae las rutas con su resultado simulado', await q.locator('#rc-inverse .rcr').count() >= 4 and 'Plan de recuperación' in await q.inner_text('#rc-inverse'))
    order = await q.evaluate("(()=>{const a=document.getElementById('rc-inverse').getBoundingClientRect().top,b=document.getElementById('rc-simulator').getBoundingClientRect().top;const m=document.getElementById('rc-manual');return {inv:a,sim:b,same:document.getElementById('rc-inverse').closest('section')===document.getElementById('rc-simulator').closest('section'),open:m.open,sum:m.querySelector('summary').innerText}})()")
    chk(f'{tag}2 las rutas y el simulador están en el mismo bloque; el simulador queda debajo como «Ajustar a mano»', order['same'] and order['inv'] < order['sim'] and 'Ajustar a mano' in order['sum'] and order['open'], order)
    chk(f'{tag}3 ya no existe el desplegable aparte «¿Qué tendría que cambiar?»', await q.locator('details[data-rc-more="inverse"]').count() == 0)
    best = await q.locator('#rc-inverse .rcr--best').count()
    txt = await q.inner_text('#rc-inverse')
    chk(f'{tag}4 una ruta (máx. 1) se marca «Menor cambio relativo» y se aclara que no es recomendación', best <= 1 and ('no recomendación' in txt or 'no es recomendación' in txt.replace('\n', ' ')) and ('pedidos' in txt), [best, txt[:200]])
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}5 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    # llevar al simulador
    n0 = await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.length")
    await q.click('#rc-inverse [data-action="rc-use-alt"]:not([disabled]) >> nth=0'); await q.wait_for_timeout(600)
    d = await q.evaluate("FP.app.state.rc.draft")
    chk(f'{tag}6 «Llevar al simulador» carga la ruta en el simulador y no guarda nada', (d['trafficPct'] != 0 or d['crValue'] != 0 or d['aovValue'] != 0) and await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.length") == n0, d)
    # guardar como escenario con hipótesis
    await q.evaluate("FP.app.state.rc.altHyp='H1'")
    hyps = await q.evaluate("FP.app.state.rc.analysis.hypotheses.map(h=>h.id)")
    await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(500)
    await q.click('#rc-inverse [data-action="rc-alt-save"]:not([disabled]) >> nth=0'); await q.wait_for_timeout(900)
    sc = await q.evaluate("(()=>{const l=FP.app.state.rc.scenarioStore.scenarios;const s=l[l.length-1];return {n:l.length,name:s&&s.name,sel:FP.app.state.rc.selected.includes(s&&s.scenarioId),hyp:s&&s.links.hypothesisId,toast:document.getElementById('toast').textContent}})()")
    chk(f'{tag}7 «Guardar como escenario» guarda la ruta (Recuperar … %) con una sola acción y avisa que es simulación', sc['n'] == n0 + 1 and sc['name'].startswith('Recuperar') and 'simulación' in sc['toast'], sc)
    chk(f'{tag}8 el escenario guardado aparece en «Escenarios guardados»', await q.evaluate("document.getElementById('rc-saved').innerText.includes('Recuperar')"))
    # objetivo de recuperación
    await q.click('[data-action="rc-target-pct"][data-value="0.5"]') if await q.locator('[data-action="rc-target-pct"][data-value="0.5"]').count() else None
    await q.wait_for_timeout(500)
    chk(f'{tag}9 el simulador manual sigue funcionando (campo de volumen editable)', await q.locator('#rc-trafficPct').count() == 1)
    await q.context.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        await flow(b, 1280, 900, 'D', errs); await flow(b, 375, 800, 'M', errs)
        chk('Z sin errores de página', not errs, errs); await b.close()
    print('RESULTADO batch_plan_recuperacion:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
