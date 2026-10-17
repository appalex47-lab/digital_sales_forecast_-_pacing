"""Actualizar desde Google Sheets: solo filas nuevas o cambiadas (con Google simulado). Uso: python3 batch_sheets_nuevas.py <raiz>"""
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
PUB = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEST/pub?gid=42&single=true&output=csv'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        body = {'v': ''}
        async def handler(route):
            await route.fulfill(status=200, content_type='text/csv', body=body['v'], headers={'access-control-allow-origin': '*'})
        await q.route('https://docs.google.com/**', handler)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#carga'); await q.wait_for_timeout(1000)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        FULL = await q.evaluate("FP.mockCsv.get('gen-hist-2025').text()")
        lines = [l for l in FULL.split('\n') if l.strip()]
        head, data = lines[0], lines[1:]
        PART = '\n'.join([head] + data[:400]) + '\n'
        total = len(data)
        count = lambda: q.evaluate("FP.app.state.store.historical.records.length")
        batches = lambda: q.evaluate("FP.app.state.store.historical.batches.length")
        async def fetch_and_commit(csv, first=False, uncheck=False):
            body['v'] = csv
            if first:
                await q.evaluate("document.getElementById('sheets-historical').open=true")
                await q.fill('#sheets-url-historical', PUB); await q.fill('#sheets-label-historical', 'Mi hoja')
                await q.click('[data-action="sheets-fetch"][data-type="historical"]')
            else:
                await q.click('#sheets-saved-historical [data-action="sheets-refresh"]')
            await q.wait_for_timeout(2500)
            if uncheck:
                await q.select_option('#rep-pick', ''); await q.wait_for_timeout(300)   # comportamiento anterior: agregar en vez de reemplazar
                await q.evaluate("(()=>{const i=document.querySelector('[data-action=staging-skip-unchanged]'); i.checked=false; i.dispatchEvent(new Event('change',{bubbles:true}))})()"); await q.wait_for_timeout(300)
            await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(2500)
        await fetch_and_commit(PART, first=True)
        c1 = await count()
        chk('N1 primera carga: entran todas las filas del archivo', c1 == 400, c1)
        # refresco con la hoja completa: solo entran las nuevas
        body['v'] = FULL
        await q.click('#sheets-saved-historical [data-action="sheets-refresh"]'); await q.wait_for_timeout(2500)
        st = await q.evaluate("(()=>{const i=FP.app.state.staging.items[0];const sel=document.querySelector('#rep-pick');return {rep:i&&i.replace&&i.replace.batchId,pick:sel?sel.value:null,cb:document.querySelector('[data-action=staging-skip-unchanged]'),diff:(document.querySelector('[data-replace-diff]')||{innerText:''}).innerText,btn:document.querySelector('[data-action=commit-staged]').innerText}})()")
        chk('N2 al actualizar desde Sheets queda elegido reemplazar el archivo anterior de esa hoja (y no la casilla de «solo nuevas»)', bool(st['rep']) and st['pick'] == st['rep'] and st['cb'] is None, st)
        chk('N3 la revisión informa cuántas filas son nuevas, modificadas y quitadas', f'{total - 400:,} filas nuevas' in st['diff'] and '0 filas que ya no vienen' in st['diff'] and '400 iguales' in st['diff'], st)
        await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(2500)
        c2 = await count()
        chk('N4 tras actualizar solo se agregaron las filas nuevas (no se duplicó el histórico)', c2 == total, (c1, c2, total))
        chk('N5 cada fila quedó una sola vez (sin llaves repetidas)', await q.evaluate("(()=>{const k=FP.app.state.store.historical.records.map(r=>r.key);return new Set(k).size===k.length})()"))
        b2 = await batches()
        # actualizar de nuevo sin cambios: no hay nada que importar
        body['v'] = FULL
        await q.click('#sheets-saved-historical [data-action="sheets-refresh"]'); await q.wait_for_timeout(2500)
        z = await q.evaluate("(()=>({dis:document.querySelector('[data-action=commit-staged]').disabled, btn:document.querySelector('[data-action=commit-staged]').innerText, same:!!document.querySelector('[data-replace-same]')}))()")
        chk('N6 actualizar sin cambios: «Importar 0 filas», botón apagado y se dice que es idéntica', z['dis'] is True and 'Importar 0 filas' in z['btn'] and z['same'] is True, z)
        await q.click('[data-action="discard-staged"]'); await q.wait_for_timeout(400)
        chk('N6b no se guardó nada (ni filas ni lotes)', await count() == total and await batches() == b2, [await count(), await batches(), b2])
        # una fila cambia
        mod = data[:]; f = mod[10].split(','); f[2] = '999999.99'; mod[10] = ','.join(f)
        await fetch_and_commit('\n'.join([head] + mod) + '\n')
        chk('N7 una fila con valores cambiados: la hoja reemplaza a la anterior (mismas filas, sin acumular)', await count() == total, await count())
        key = f"{data[10].split(',')[0]}|{data[10].split(',')[1]}|historical"
        latest = await q.evaluate("(k)=>FP.dataStore.resolveLatest(FP.app.state.store,'historical').get(k).metrics.revenue.value", key)
        chk('N8 el valor vigente de esa fila es el nuevo', abs(latest - 999999.99) < 0.01, latest)
        # sin la casilla: se comporta como antes (agrega todo)
        await fetch_and_commit('\n'.join([head] + mod) + '\n', uncheck=True)
        chk('N9 eligiendo «No reemplazar» y sin la casilla se importa todo el archivo (comportamiento anterior)', await count() == total + total, await count())
        # archivo manual: la casilla existe pero no viene marcada
        # archivo grande (se revisa en un Worker): el filtro se aplica al importar
        mb = await q.evaluate("FP.importWorker.minBytes()")
        import datetime as _d
        rows = []; d0 = _d.date(1900, 1, 1)
        for i in range(31000):
            d = (d0 + _d.timedelta(days=i)).isoformat()
            for chn in ('ecommerce', 'app', 'whatsapp', 'llamadas'):
                rows.append(f'{d},{chn},{1000 + i},{10 + i % 7},{500 + i % 31},,,')
        BIG = '\n'.join([head] + rows) + '\n'
        chk('N11 el archivo de prueba supera el umbral del Worker', len(BIG) > mb, (len(BIG), mb))
        await q.evaluate("FP.app.actions['clear-all'] && 0")
        h0 = await count()
        body['v'] = BIG
        await q.click('#sheets-saved-historical [data-action="sheets-refresh"]'); await q.wait_for_timeout(15000)
        rem = await q.evaluate("(()=>{const i=FP.app.state.staging.items[0];return {remote:!!(i&&i.remote), skip:i&&i.skipUnchanged}})()")
        fl = await q.evaluate("({t:(document.querySelector('[data-replace-flags]')||{innerText:''}).innerText,dis:document.querySelector('[data-action=commit-staged]').disabled})")
        chk('N14 archivo grande con reemplazo elegido: avisa que no se puede comparar y pide confirmar antes', 'muy grande' in fl['t'] and fl['dis'] is True, fl)
        await q.select_option('#rep-pick', ''); await q.wait_for_timeout(400)
        await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(20000)
        h1 = await count()
        chk('N12 archivo grande: primera importación agrega solo lo que no estaba (las 124,000 filas nuevas)', h1 == h0 + 124000, (h0, h1, rem))
        body['v'] = BIG
        await q.click('#sheets-saved-historical [data-action="sheets-refresh"]'); await q.wait_for_timeout(15000)
        await q.select_option('#rep-pick', ''); await q.wait_for_timeout(400)
        await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(8000)
        chk('N13 archivo grande repetido: no se agrega nada y se avisa «Sin filas nuevas»', await count() == h1 and 'Sin filas nuevas' in await q.evaluate("document.getElementById('toast').textContent"), [await count(), h1, rem])
        chk('N10 los errores de página son cero', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
