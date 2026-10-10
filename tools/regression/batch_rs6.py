"""Fase 6 · Metas y motor: meta y validación arriba; Herramientas, casos límite y pruebas del motor plegados sin perder datos.
Uso: python3 batch_rs6.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, datetime as dt, random
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
DAYS = [dt.date(2026, 8, 1) + dt.timedelta(days=i) for i in range(53)]            # 1-ago … 22-sep
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def vals(ch, d):
    r = random.Random(f'{ch}|{d}'); k = {'ecommerce': 1.0, 'app': .6, 'whatsapp': .3, 'llamadas': .2}[ch]
    sep = d.month == 9
    t = round(4000 * k * (0.82 if sep else 1.0) * (0.9 + .2 * r.random())); cr = (0.021 if ch == 'ecommerce' else 0.03) * (1.12 if sep else 1.0) * (0.95 + .1 * r.random())
    o = max(1, round(t * cr)); aov = 410 * (1.06 if sep else 1.0) * (0.95 + .1 * r.random()); return t, o, round(o * aov, 2)
ACT = 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'{d},{c},{vals(c, d)[2]},{vals(c, d)[1]},{vals(c, d)[0] if c in ("ecommerce", "app") else ""}' for d in DAYS for c in CH) + '\n'
def truth(ch):
    a = [vals(ch, d) for d in DAYS if d.month == 8 and d.day <= 22]; b = [vals(ch, d) for d in DAYS if d.month == 9]
    T0, O0, R0 = (sum(x[i] for x in a) for i in range(3)); T1, O1, R1 = (sum(x[i] for x in b) for i in range(3))
    c0, c1, k0, k1 = O0 / T0, O1 / T1, R0 / O0, R1 / O1
    return dict(traffic=(T1 - T0) * c0 * k0, cr=T1 * (c1 - c0) * k0, aov=T1 * c1 * (k1 - k0), delta=R1 - R0, R0=R0, R1=R1)
SEG = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(
    f'{d},ecommerce,landing,{s},{o * (400 if d.month == 8 else 340)},{o},{t}' for d in DAYS for s, t, o in
    [('/home', 900 if d.month == 8 else 700, 30), ('/ofertas', 500, 15), ('/raro', 100 if d.month == 8 else 600, 0)]) + '\n'
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:300])); q.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' and 'Failed to load' not in m.text else None)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
        u = f'http://127.0.0.1:{port}/index.html'
        st = lambda: q.evaluate("(()=>{const d=[...document.querySelectorAll('#view-resumen details.rs-more')]; return {ids:d.map(x=>x.dataset.rsMore), open:d.map(x=>x.open), layer:!document.querySelector('#view-resumen .rs-layer').hidden}})()")
        top = lambda sel: q.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); return e? e.getBoundingClientRect().top + window.scrollY : null}})()")
        # Y0 · sin datos: «Herramientas» se abre sola, para encontrar «Generar datos de prueba»; lo demás, cerrado
        await q.goto(u + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])'); await q.wait_for_timeout(900)
        r = await st(); gm = await q.evaluate("document.querySelector('[data-action=generate-mock]').checkVisibility()"); msg = await q.evaluate("document.querySelector('#validation-table').textContent")
        chk('Y0 sin datos: «Herramientas» abierta (el botón «Generar datos de prueba» se ve), casos límite y pruebas cerrados, y el aviso dice dónde está', r['ids'] == ['tools', 'edge', 'engine'] and r['open'] == [True, False, False] and gm and 'Herramientas' in msg, (r, gm, msg[:120]))
        await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        # Y1 · con datos: orden y desplegables
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=false)"); await q.wait_for_timeout(200)
        o = {k: await top(s) for k, s in [('targets', '#targets-form'), ('valid', '#validation-table'), ('layer', '#view-resumen .rs-layer'), ('more', '#view-resumen .rs-more')]}
        chk('Y1 orden: meta anual → validación por canal → «Ver más»', all(v is not None for v in o.values()) and o['targets'] < o['valid'] < o['layer'] < o['more'], o)
        r = await st(); chk('Y2 con datos: 3 «Ver más» (herramientas, casos límite, pruebas del motor) cerrados', r['ids'] == ['tools', 'edge', 'engine'] and not any(r['open']) and r['layer'], r)
        v = await q.evaluate("(()=>({tf:document.querySelector('#targets-form').checkVisibility(), val:document.querySelector('#validation-table').checkVisibility(), gm:document.querySelector('[data-action=generate-mock]').checkVisibility(), clr:document.querySelector('[data-action=clear-all]').checkVisibility(), rt:document.querySelector('[data-action=run-tests]').checkVisibility()}))()")
        chk('Y3 la meta y la validación se ven; generar datos, correr pruebas y borrar datos quedan plegados', v['tf'] and v['val'] and not v['gm'] and not v['clr'] and not v['rt'], v)
        # Y4 · abierto: todo el contenido sigue ahí
        n = await q.evaluate("(()=>{document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true); return {btn:['generate-mock','run-tests','clear-all'].map(a=>!!document.querySelector('[data-action='+a+']')), facts:document.querySelector('#dataset-facts').textContent.trim().length, edge:document.querySelectorAll('#edge-table tbody tr').length, eng:document.querySelector('#engine-tests').textContent.trim().length, sum:document.querySelector('#engine-summary').textContent.trim().length, contract:!!document.querySelector('#export-preview')}})()")
        chk('Y4 abierto: 3 botones, datos cargados, casos límite con filas, pruebas del motor y su resumen, y el contrato de forecast_export', all(n['btn']) and n['facts'] > 10 and n['edge'] > 0 and n['eng'] > 100 and n['sum'] > 0 and n['contract'], n)
        # Y5 · cuenta aparte: la suma de las metas por canal = meta total
        await q.click('#targets-form >> text=Usar metas de ejemplo'); await q.wait_for_timeout(500)
        t = await q.evaluate("(()=>{const i=[...document.querySelectorAll('#targets-form input')].slice(0,5).map(x=>+String(x.value).replace(/[^0-9.]/g,'')); return i})()")
        chk('Y5 la meta total = suma de las metas por canal (98 + 74 + 54 + 35 millones)', len(t) == 5 and t[0] == sum(t[1:]) == 261000000, t)
        # Y6 · «Ejecutar pruebas del motor» sigue funcionando desde «Ver más»
        await q.click('[data-action="run-tests"]'); await q.wait_for_timeout(900)
        s2 = await q.evaluate("document.querySelector('#engine-summary').textContent.trim()")
        chk('Y6 «Ejecutar pruebas del motor» sigue dando el resumen sin fallas', len(s2) > 0 and 'fall' not in s2.lower().replace('0 fall', ''), s2)
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
