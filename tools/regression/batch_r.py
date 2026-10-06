"""Fase 11 · pieza 2: vista «Tráfico y conversión por segmento». Uso: python3 batch_r.py <raiz>
R-1 sin segmentos: estado vacío con las columnas del archivo y enlace a Carga de datos.
R-2 con un archivo de segmentos (6 dimensiones): la vista lista las dimensiones y, para septiembre contra los 30 días anteriores,
    tráfico, pedidos, venta, CR y AOV por segmento coinciden con las sumas del archivo (CR y AOV de sumas, nunca promedios).
R-3 periodo y canal son la misma selección de Diagnóstico; el filtro de canal funciona; la vista está en «Diagnosticar»."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
DIMS = {'dispositivo': ['Móvil', 'Escritorio'], 'fuente': ['google', 'directo'], 'medio': ['cpc', 'organic'], 'campaña': ['Promo Sept', 'Siempre activa'], 'landing': ['/ofertas', '/inicio'], 'tipo_cliente': ['Nuevo', 'Recurrente']}
CH = ['Ecommerce', 'App']
def rows():
    out = []; d = dt.date(2026, 8, 1)
    while d <= dt.date(2026, 9, 30):
        for ch in CH:
            for dim, segs in DIMS.items():
                for i, sg in enumerate(segs):
                    h_ = zlib.crc32(f'{d}{ch}{dim}{sg}'.encode())
                    tr = 200 + h_ % 300 + (100 if d.month == 9 and i == 0 else 0); od = 5 + h_ % 9; rev = od * (900 + h_ % 400)
                    out.append((d.isoformat(), ch, dim, sg, rev, od, tr, od, od // 3, od - od // 3))
        d += dt.timedelta(days=1)
    return out
R = rows()
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume,clientes,clientes_nuevos,clientes_recurrentes\n' + '\n'.join(','.join(map(str, r)) for r in R) + '\n'
def expect(dim, seg, ch=None, frm='2026-09-01', to='2026-09-30'):
    sel = [r for r in R if r[2] == dim and r[3] == seg and frm <= r[0] <= to and (ch is None or r[1] == ch)]
    rev = sum(r[4] for r in sel); od = sum(r[5] for r in sel); tr = sum(r[6] for r in sel)
    return {'traffic': tr, 'orders': od, 'revenue': rev, 'cr': od / tr, 'aov': rev / od}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(700)
        e = await q.evaluate("document.getElementById('view-segmentos').innerText.replace(/\\s+/g,' ')")
        nav = await q.evaluate("[...document.querySelectorAll('#snav-g-diagnosticar .snav__item')].map(a=>a.innerText.trim())")
        chk('R-1 sin segmentos: estado vacío con las columnas del archivo y enlace a Carga de datos', 'Todavía no hay segmentos cargados' in e and 'fecha, canal, dimension, segmento' in e and await q.evaluate("!!document.querySelector('#view-segmentos a[data-nav=\"carga\"]')"), e[:200])
        chk('R-3 la vista «Tráfico y conversión» está en «Diagnosticar», después de Categoría → Producto', nav == ['¿Por qué? Diagnóstico', 'Categoría → Producto', 'Tráfico y conversión'], nav)
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'segmentos.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(700)
        await q.click('#view-segmentos [data-action="dx-period-type"][data-value="month"]'); await q.wait_for_timeout(400)
        await q.select_option('#sg-key', '2026-09'); await q.wait_for_timeout(400); await q.select_option('#sg-ch', 'total'); await q.wait_for_timeout(500)
        dims = await q.evaluate("[...document.querySelectorAll('#sg-dim option')].map(o=>o.innerText)")
        chk('R-2 lista las 6 dimensiones (Dispositivo, Fuente, Medio, Campaña, Landing, Tipo de cliente)', dims == ['Dispositivo', 'Fuente', 'Medio', 'Campaña', 'Landing', 'Tipo de cliente'], dims)
        # la tabla principal (no la de oportunidad); la columna «Cuadrante» se omite para leer las cifras por posición
        TBL = "[...document.querySelectorAll('#view-segmentos table[aria-label*=\"tráfico y conversión\"] tbody tr')].map(r=>[...r.cells].filter((c,i)=>!(i===1&&r.closest('table').tHead.rows[0].cells[1].innerText.trim()==='Cuadrante')).map(c=>c.innerText.trim()))"
        num = lambda t: float(t.replace('$', '').replace(',', '').replace(' %', '').replace('+', '').replace('−', '-'))
        bad = []
        for dim_id, dim in (('device', 'dispositivo'), ('source', 'fuente'), ('customer_type', 'tipo_cliente')):
            await q.select_option('#sg-dim', dim_id); await q.wait_for_timeout(400)
            rows_ = await q.evaluate(TBL)
            for r in rows_:
                ex = expect(dim, r[0])
                got = {'traffic': num(r[1]), 'orders': num(r[4]), 'cr': num(r[5]) / 100, 'aov': num(r[7]), 'revenue': num(r[8])}
                if abs(got['traffic'] - ex['traffic']) > 0.5 or abs(got['orders'] - ex['orders']) > 0.5 or abs(got['revenue'] - ex['revenue']) > 1 or abs(got['cr'] - ex['cr']) > 0.00006 or abs(got['aov'] - ex['aov']) > 1:
                    bad.append((dim, r[0], got, ex))
        chk('R-2 septiembre: tráfico, pedidos, venta, CR y AOV por segmento coinciden con las sumas del archivo (Dispositivo, Fuente, Tipo de cliente)', not bad, bad[:2])
        hint = await q.evaluate("[...document.querySelectorAll('#view-segmentos .panel__body.stack > .field__hint')].find(e=>/contra/.test(e.innerText)).innerText")
        chk('R-2 compara contra el periodo anterior de la misma duración (2026-08-02 a 2026-08-31) y lo dice', '2026-09-01 a 2026-09-30 contra 2026-08-02 a 2026-08-31' in hint, hint)
        await q.select_option('#sg-dim', 'device'); await q.select_option('#sg-ch', 'app'); await q.wait_for_timeout(500)
        r0 = (await q.evaluate(TBL))[0]; ex = expect('dispositivo', r0[0], 'App')
        chk('R-3 filtro de canal (App): las cifras son solo de App', abs(num(r0[1]) - ex['traffic']) < 0.5 and abs(num(r0[8]) - ex['revenue']) < 1, (r0, ex))
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        same = await q.evaluate("[document.getElementById('dx-ch').value, document.getElementById('dx-key').value]")
        chk('R-3 es la misma selección que Diagnóstico (App, septiembre)', same == ['app', '2026-09'], same)
        for w in (390, 768):
            await q.goto(u + '#segmentos'); await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(400)
            ov = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
            if ov > 0: chk(f'R-2 sin desborde de la página a {w}px', False, ov)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_r:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
