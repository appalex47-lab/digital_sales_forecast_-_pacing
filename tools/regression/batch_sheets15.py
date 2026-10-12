"""Fase 15 — Google Sheets por enlace publicado (con Google simulado). Uso: python3 batch_sheets15.py <raiz>"""
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
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []; reqs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        mode = {'v': 'ok'}
        async def handler(route):
            reqs.append(route.request.url)
            m = mode['v']
            if m == 'abort': return await route.abort()
            if m == 'html': return await route.fulfill(status=200, content_type='text/html', body='<!DOCTYPE html><html><body>Inicia sesión</body></html>', headers={'access-control-allow-origin': '*'})
            if m == '404': return await route.fulfill(status=404, body='', headers={'access-control-allow-origin': '*'})
            if m == 'empty': return await route.fulfill(status=200, content_type='text/csv', body='fecha,canal\n', headers={'access-control-allow-origin': '*'})
            await route.fulfill(status=200, content_type='text/csv', body=CSV, headers={'access-control-allow-origin': '*'})
        await q.route('https://docs.google.com/**', handler)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#carga'); await q.wait_for_timeout(1000)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        CSV = await q.evaluate("FP.mockCsv.get('gen-hist-2025').text()")
        chk('S1 al abrir Carga no se pide nada a Google (privacidad)', len(reqs) == 0, reqs)
        types = await q.evaluate("[...document.querySelectorAll('.sheets-box')].map(e=>e.id)")
        chk('S2 cada tarjeta de datos tiene «Traer desde Google Sheets» (histórico, plan, venta real, segmentos y productos)', all(t in types for t in ('sheets-historical', 'sheets-plan', 'sheets-actual', 'sheets-segments')), types)
        await q.evaluate("document.getElementById('sheets-historical').open=true")
        await q.fill('#sheets-url-historical', PUB); await q.fill('#sheets-label-historical', 'Mi hoja'); await q.wait_for_timeout(150)
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(300)
        chk('S3 el enlace escrito sobrevive a un re-dibujo (borrador) y el desplegable sigue abierto', await q.evaluate("document.getElementById('sheets-url-historical').value") == PUB and await q.evaluate("document.getElementById('sheets-historical').open"))
        await q.click('[data-action="sheets-fetch"][data-type="historical"]'); await q.wait_for_timeout(2500)
        chk('S4 pide exactamente el enlace publicado como CSV', len(reqs) == 1 and 'output=csv' in reqs[0] and 'gid=42' in reqs[0], reqs)
        items = await q.evaluate("FP.app.state.staging.items.map(i=>[i.staged.fileName,i.staged.dataType])")
        chk('S5 el archivo queda «en revisión» como Histórico, con su nombre', len(items) == 1 and items[0][0] == 'Google Sheets - Mi hoja.csv' and items[0][1] == 'historical', items)
        chk('S6 nada se importó todavía (hay que confirmar)', await q.evaluate("FP.app.state.store.historical.records.length") == 0)
        links = await q.evaluate("FP.app.state.sheets.links")
        chk('S7 se recuerda solo el enlace (URL, nombre, filas, fecha), sin datos ni claves', len(links) == 1 and links[0]['url'] == PUB and links[0]['label'] == 'Mi hoja' and links[0]['rows'] > 1000 and 'text' not in links[0], links)
        chk('S8 la lista de guardados queda siempre visible (fuera del desplegable) con «Actualizar» y «Quitar»', await q.evaluate("!!document.querySelector('#sheets-saved-historical [data-action=sheets-refresh]') && !!document.querySelector('#sheets-saved-historical [data-action=sheets-remove]')"))
        chk('S9 los borradores se limpian al traer', await q.evaluate("document.getElementById('sheets-url-historical').value") == '')
        # actualizar
        await q.click('#sheets-saved-historical [data-action="sheets-refresh"]'); await q.wait_for_timeout(2500)
        chk('S10 «Actualizar» vuelve a pedir el mismo enlace y no duplica el guardado', len(reqs) == 2 and await q.evaluate("FP.app.state.sheets.links.length") == 1, [len(reqs)])
        # persistencia
        await q.goto(u + '#carga'); await q.wait_for_timeout(1000)
        chk('S11 el enlace sigue guardado al recargar la página', await q.evaluate("FP.app.state.sheets.links.length") == 1)
        raw = await q.evaluate("Object.keys(localStorage).filter(k=>k.includes('sheetsLinks')).map(k=>localStorage.getItem(k)).join('|')")
        chk('S12 en el almacenamiento solo hay la URL (no filas de datos)', 'docs.google.com' in raw and len(raw) < 1500, len(raw))
        # errores
        await q.evaluate("document.getElementById('sheets-plan').open=true")
        async def tryit(m, texto, url=PUB):
            mode['v'] = m; n0 = len(reqs)
            await q.fill('#sheets-url-plan', url); await q.click('[data-action="sheets-fetch"][data-type="plan"]'); await q.wait_for_timeout(1500)
            t = await q.evaluate("document.getElementById('toast').textContent")
            return texto in t, t, len(reqs) - n0
        r1 = await tryit('html', 'página web'); chk('S13 HTML en vez de CSV: explica que no está publicada', r1[0], r1[1])
        r2 = await tryit('404', '404'); chk('S14 404: dice que ya no está publicada', r2[0], r2[1])
        r3 = await tryit('abort', 'no pudo leer'); chk('S15 fallo de red/CORS: avisa y da la alternativa de CSV', r3[0] and 'Descargar' in r3[1], r3[1])
        r4 = await tryit('empty', 'vacía'); chk('S16 pestaña vacía: avisa', r4[0], r4[1])
        r5 = await tryit('ok', 'Solo se aceptan', 'https://evil.example.com/x.csv'); chk('S17 un enlace que no es de Google Sheets se rechaza sin hacer ninguna petición', r5[0] and r5[2] == 0, r5)
        chk('S18 ningún error deja basura en el guardado ni en revisión', await q.evaluate("FP.app.state.sheets.links.length") == 1)
        await q.click('#sheets-saved-historical [data-action="sheets-remove"]'); await q.wait_for_timeout(300)
        chk('S19 «Quitar» borra el enlace guardado', await q.evaluate("FP.app.state.sheets.links.length") == 0)
        chk('S20 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_sheets15: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
