"""Carga de datos: «Actualizar todo» trae todas las pestañas de Sheets guardadas en un paso. Uso: python3 batch_sheets_todo.py <raiz>"""
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
def pub(g): return f'https://docs.google.com/spreadsheets/d/e/2PACX-test/pub?gid={g}&single=true&output=csv'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        reqs = []; csv = {}
        async def handler(route):
            url = route.request.url; reqs.append(url)
            g = url.split('gid=')[1].split('&')[0]
            if g == '3': return await route.fulfill(status=404, body='no', headers={'access-control-allow-origin': '*'})
            await route.fulfill(status=200, content_type='text/csv', body=csv[g], headers={'access-control-allow-origin': '*'})
        await q.route('https://docs.google.com/**', handler)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#carga'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        chk('A1 sin pestañas guardadas no aparece «Actualizar todo»', await q.evaluate("!document.querySelector('[data-action=\"sheets-refresh-all\"]')"))
        csv['1'] = await q.evaluate("FP.mockCsv.get('gen-hist-2025').text()"); csv['2'] = await q.evaluate("FP.mockCsv.get('gen-plan-2026').text()"); csv['3'] = 'x'
        await q.evaluate("""([a,b,c])=>{FP.app.state.sheets.links=[{id:'a',type:'historical',url:a,label:'Histórico',lastAt:new Date().toISOString(),rows:5,kind:'published'},{id:'b',type:'plan',url:b,label:'Plan',lastAt:new Date().toISOString(),rows:5,kind:'published'},{id:'c',type:'actual',url:c,label:'Real',lastAt:new Date().toISOString(),rows:5,kind:'published'}];FP.app.render()}""", [pub(1), pub(2), pub(3)])
        await q.wait_for_timeout(300)
        t = await q.inner_text('.sheets-all')
        chk('A2 aparece el bloque con el conteo y los nombres de las pestañas', '3 pestañas guardadas' in t and 'Histórico' in t and 'Plan' in t and 'Real' in t, t)
        chk('A3 al abrir no se pidió nada a Google', len(reqs) == 0, reqs)
        await q.click('[data-action="sheets-refresh-all"]'); await q.wait_for_timeout(4500)
        chk('A4 pide las tres pestañas, una vez cada una', len(reqs) == 3 and sorted(r.split('gid=')[1][0] for r in reqs) == ['1', '2', '3'], reqs)
        items = await q.evaluate("FP.app.state.staging.items.map(i=>i.staged.dataType)")
        chk('A5 las dos que respondieron quedan juntas en revisión y la que falló no detiene a las demás', sorted(items) == ['historical', 'plan'], items)
        chk('A6 nada se importó todavía', await q.evaluate("FP.app.state.store.historical.records.length+FP.app.state.store.plan.records.length") == 0)
        last = await q.inner_text('[data-sheets-last]')
        chk('A7 el resumen dice 2 listas y 1 con error, con el nombre y el motivo', '2 listas' in last and '1 con error' in last and 'Real' in last and '404' in last, last)
        links = await q.evaluate("FP.app.state.sheets.links.map(l=>[l.id,l.rows>1])")
        chk('A8 se actualizan las filas y la fecha de las que sí llegaron; la fallida conserva lo anterior', [x for x in links if x[0] in ('a', 'b')] == [['a', True], ['b', True]] and await q.evaluate("FP.app.state.sheets.links.find(l=>l.id==='c').rows")==5, links)
        chk('A9 los botones quedan habilitados al terminar', await q.evaluate("![...document.querySelectorAll('[data-action=\"sheets-refresh-all\"],[data-action=\"sheets-refresh\"]')].some(b=>b.disabled)"))
        chk('A10 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
