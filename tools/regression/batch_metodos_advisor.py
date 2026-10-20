"""Forecast · comparación de métodos con semáforo, sugerencia explicable y botón «Usar el método X» (desktop y móvil).
Uso: python3 batch_metodos_advisor.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
async def run(b, w, h, tag):
    q = await b.new_page(viewport={'width': w, 'height': h}); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:300]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
    u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
    await q.goto(u + '#pacing'); await q.wait_for_selector('#fc-methods .advisor', state='attached', timeout=60000); await q.evaluate("document.querySelectorAll('#view-pacing details').forEach(d=>d.open=true)"); await q.wait_for_timeout(500)
    await q.evaluate("FP.app.actions['fc-setting']({dataset:{key:'method'},value:'D'})"); await q.wait_for_timeout(1200); await q.evaluate("document.querySelectorAll('#view-pacing details').forEach(d=>d.open=true)")
    r = await q.evaluate("""(()=>{const e=document.getElementById('fc-methods');return {t:e.querySelector('.advisor').innerText,rows:e.querySelectorAll('tbody tr').length,pills:e.querySelectorAll('tbody tr td:last-child .pill').length,rules:!!e.querySelector('.advisor details'),btn:!!e.querySelector('.advisor [data-action=fc-setting]')}})()""")
    chk(f'{tag}1 muestra método en uso y sugerencia con motivo', 'Método en uso' in r['t'] and ('Sugerencia' in r['t'] or 'Coincide' in r['t']), r['t'][:200])
    chk(f'{tag}2 hay semáforo en los 4 métodos', r['rows'] == 4 and r['pills'] == 4, r)
    chk(f'{tag}3 las reglas de la sugerencia están a la vista', r['rules'], None)
    cur = await q.evaluate("FP.app.state.fc.run.method.id")
    if r['btn']:
        sug = await q.evaluate("document.querySelector('#fc-methods .advisor [data-action=fc-setting]').value")
        await q.evaluate("document.querySelector('#fc-methods .advisor [data-action=fc-setting]').click()"); await q.wait_for_timeout(1200)
        now = await q.evaluate("FP.app.state.fc.run && FP.app.state.fc.run.method.id")
        chk(f'{tag}4 «Usar el método {sug}» cambia el método en uso ({cur} → {now})', now == sug, [cur, now])
    else:
        chk(f'{tag}4 sin botón porque coincide', 'Coincide' in r['t'], r['t'][:200])
    await q.evaluate("FP.app.state.fc.channel='ecommerce'; FP.app.actions && 0")
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}5 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    chk(f'{tag}6 sin errores de JavaScript', not errs, errs[:2])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_metodos_advisor:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
