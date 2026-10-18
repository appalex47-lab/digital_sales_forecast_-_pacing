"""Tablas en tarjetas (móvil). Uso: python3 -I batch_tarjetas.py <raiz>"""
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
ST = """(()=>{const T=[...document.querySelectorAll('[id^=view-]:not([hidden]) table')].filter(t=>t.offsetParent!==null||t.classList.contains('table--cards'));
 return T.map(t=>{const cs=getComputedStyle(t);const td=t.querySelector('tbody td:nth-child(2)');const b=td?getComputedStyle(td,'::before').content:null;
  return {cards:t.classList.contains('table--cards'),disp:cs.display,sw:t.scrollWidth,cw:t.clientWidth,rows:t.tBodies[0]?t.tBodies[0].rows.length:0,matrix:t.classList.contains('table--matrix'),lab:td?td.getAttribute('data-label'):null,before:b}})})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []; u = f'http://127.0.0.1:{port}/index.html'
        q = await (await b.new_context(viewport={'width': 390, 'height': 800})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0))
        await prepare(q, u)
        allc = []; bad = []
        for v in ['pacing', 'reforecast', 'plan', 'resumen', 'calidad', 'diagnostico', 'recovery', 'inicio', 'datos', 'cambios', 'medir']:
            await q.goto(u + '#' + v); await q.wait_for_timeout(600)
            for t in await q.evaluate(ST):
                t['v'] = v; allc.append(t)
        cards = [t for t in allc if t['cards']]
        chk('T-1 hay tablas convertidas en tarjetas en móvil', len(cards) >= 15, len(cards))
        wide = [t for t in cards if t['sw'] > t['cw'] + 1]
        chk('T-2 las tarjetas no necesitan desplazarse de lado', not wide, wide[:3])
        nol = [t for t in cards if not t['lab']]
        chk('T-3 cada tarjeta trae la etiqueta de su columna en las celdas', not nol, nol[:3])
        chk('T-4 las celdas muestran la etiqueta (::before) y la tabla se pinta como bloque', all(t['disp'] == 'block' and 'attr' not in str(t['before']) and t['before'] not in (None, 'none', 'normal') for t in cards), [t for t in cards if t['disp'] != 'block'][:2])
        mx = [t for t in allc if t['matrix']]
        chk('T-5 las matrices (mapas de calor) siguen como tabla con desplazamiento', all(not t['cards'] for t in mx), mx[:2])
        big = [t for t in allc if t['rows'] > 24]
        chk('T-6 las tablas con muchas filas (Datos normalizados) siguen como tabla', big and all(not t['cards'] for t in big), big[:2])
        # lectura: encabezados accesibles y contenido completo
        await q.goto(u + '#pacing'); await q.wait_for_timeout(500)
        ax = await q.evaluate("(()=>{const t=document.querySelector('[id^=view-]:not([hidden]) table.table--cards');const th=t.tHead.rows[0].cells[1];const r=t.getAttribute('role');const ro=t.tBodies[0].rows[0].getAttribute('role');const h=t.tHead.getBoundingClientRect();return {role:r,row:ro,hh:Math.round(h.height),text:t.tBodies[0].rows[0].innerText.length}})()")
        chk('T-7 la tabla conserva roles de tabla para lectores de pantalla y su encabezado queda oculto visualmente', ax['role'] == 'table' and ax['row'] == 'row' and ax['hh'] <= 2 and ax['text'] > 10, ax)
        # los controles dentro de tarjetas siguen funcionando: Recovery → Agregar al plan
        await q.goto(u + '#recovery'); await q.wait_for_timeout(500)
        ctl = await q.evaluate("(()=>{const bs=[...document.querySelectorAll('[id^=view-]:not([hidden]) table.table--cards button, [id^=view-]:not([hidden]) table.table--cards select, [id^=view-]:not([hidden]) table.table--cards input')].filter(e=>e.offsetParent!==null&&!e.closest('thead'));return bs.length?[bs.length,bs.every(e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth+1&&r.left>=-1})]:[0,true]})()")
        chk('T-8 botones y campos dentro de las tarjetas quedan dentro de la pantalla', ctl[1], ctl)
        ov = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
        chk('T-9 sin desborde horizontal de la página en Recovery', ov <= 0, ov)
        # escritorio no cambia
        d = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); d.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await d.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await prepare(d, u); await d.goto(u + '#pacing'); await d.wait_for_timeout(600)
        ds = await d.evaluate(ST)
        chk('T-10 en escritorio las tablas siguen siendo tablas (sin bloques ni etiquetas visibles)', ds and all(t['disp'] == 'table' and t['before'] in (None, 'none', 'normal') for t in ds), ds[:3])
        chk('T-11 sin errores de página', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_tarjetas:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
