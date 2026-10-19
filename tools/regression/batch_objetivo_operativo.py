"""v0.15.0 · Objetivo operativo de la acción: tarjeta del plan, edición, Seguimiento y Medir (escritorio y móvil).
Uso: python3 -I batch_objetivo_operativo.py <raiz>"""
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
    g = await q.evaluate("FP.app.state.rc.plan.actions[0].operativeGoal")
    chk(f'{tag}1 la acción nace con objetivo operativo del escenario (volumen, base → objetivo)', g and g['metric'] == 'trafficVolume' and g['target'] > g['base'] and g['source'] == 'scenario' and g['edited'] is False, g)
    ins = await q.evaluate("(()=>{const c=document.querySelector('#rc-plan .rc-goal');return c?c.innerText:null})()")
    chk(f'{tag}2 la tarjeta del plan muestra impacto simulado y objetivo operativo', ins and 'Objetivo operativo' in ins and '→' in ins, ins)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}3 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    # editar el objetivo
    tgt = g['target']; new = round(g['base'] + (tgt - g['base']) / 2)
    await q.fill('#rc-plan [data-key="goalTarget"]', str(new)); await q.press('#rc-plan [data-key="goalTarget"]', 'Tab'); await q.wait_for_timeout(500)
    g2 = await q.evaluate("FP.app.state.rc.plan.actions[0].operativeGoal")
    chk(f'{tag}4 editar el objetivo lo guarda, lo marca como editado y deja historial', g2['target'] == new and g2['edited'] is True and g2['source'] == 'manual' and await q.evaluate("FP.app.state.rc.plan.actions[0].history.some(h=>h.field==='operativeGoal')"), g2)
    bad = await q.evaluate("FP.app.actions['rc-action-field']({dataset:{id:'ACT_001',key:'goalTarget'},value:'abc'}); document.getElementById('toast').textContent")
    chk(f'{tag}5 un valor no numérico se rechaza con mensaje', 'número' in (bad or '') and (await q.evaluate("FP.app.state.rc.plan.actions[0].operativeGoal.target")) == new, bad)
    # Seguimiento
    tr = await q.evaluate("(()=>{const t=document.getElementById('rc-tracking');return t?t.innerText:''})()")
    chk(f'{tag}6 Seguimiento tiene la columna «Objetivo operativo» con lo logrado', 'Objetivo operativo' in tr and 'Logrado' in tr, tr[:300])
    # persistencia y pestaña Medir
    await q.reload(); await q.wait_for_selector('#rc-plan [data-key="goalTarget"]', timeout=20000)
    chk(f'{tag}7 el objetivo editado persiste al recargar', (await q.evaluate("FP.app.state.rc.plan.actions[0].operativeGoal.target")) == new)
    await q.goto(u + '#medir'); await q.wait_for_selector('#mx-actions tbody tr', timeout=20000)
    mx = await q.evaluate("document.getElementById('mx-actions').innerText")
    chk(f'{tag}8 Medir muestra el objetivo operativo y su avance', 'Objetivo operativo' in mx and 'Logrado' in mx, mx[:300])
    await q.evaluate("window.scrollTo(0,0)"); await q.click('#mx-actions [data-action="mx-select"]'); await q.wait_for_timeout(1200)
    top = await q.evaluate("document.getElementById('mx-chain').getBoundingClientRect().top")
    chk(f'{tag}8b «Ver cadena» desplaza la pantalla hasta la cadena (top={top:.0f}px)', -5 <= top <= 200, top)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}9 Medir sin desborde ({ov}px)', ov <= 1 or w >= 860, ov)
    # cambio de fechas con objetivo editado: no se pisa
    await q.goto(u + '#recovery'); await q.wait_for_selector('#rc-plan [data-key="goalTarget"]', timeout=20000)
    await q.fill('#rc-plan [data-key="endDate"]', '2026-09-20'); await q.press('#rc-plan [data-key="endDate"]', 'Tab'); await q.wait_for_timeout(500)
    chk(f'{tag}10 cambiar fechas no pisa un objetivo editado a mano', (await q.evaluate("FP.app.state.rc.plan.actions[0].operativeGoal.target")) == new)
    await q.context.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        await flow(b, 1280, 900, 'D', errs); await flow(b, 375, 800, 'M', errs)
        chk('Z sin errores de página', not errs, errs); await b.close()
    print('RESULTADO batch_objetivo_operativo:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
