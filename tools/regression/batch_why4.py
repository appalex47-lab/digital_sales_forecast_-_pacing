"""Fase 4 · Diagnóstico + entrada única «¿Por qué?»: respuesta arriba, detalle en «Ver más», cuatro formas de investigar.
Uso: python3 batch_why4.py <raiz>"""
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
        # W0 · sin datos: sin «Ver más» vacíos
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(900)
        e = await q.evaluate("(()=>({more:[...document.querySelectorAll('#view-diagnostico details.dx-more')].filter(d=>!d.hidden).length, layer:!document.querySelector('#view-diagnostico .dx-layer').hidden, hub:document.querySelectorAll('#why-hub-diagnostico .why-hub__item').length}))()")
        chk('W0 sin diagnóstico: no hay «Ver más» vacíos y la entrada «¿Por qué?» sí está', e['more'] == 0 and not e['layer'] and e['hub'] == 4, e)
        await prepare(q, u)
        # W1 · la franja en las cuatro vistas, con la actual marcada y las otras tres como enlaces
        exp = {'diagnostico': 'Brecha y drivers', 'analisis': 'Evolución y patrones', 'segmentos': 'Tráfico y conversión', 'producto': 'Categoría → Producto'}
        for v, name in exp.items():
            await q.goto(u + '#' + v); await q.wait_for_timeout(1100)
            r = await q.evaluate(f"(()=>{{const h=document.querySelector('#why-hub-{v}'); return {{n:h.querySelectorAll('.why-hub__item').length, cur:[...h.querySelectorAll('[aria-current=page]')].map(x=>x.querySelector('strong').textContent), links:[...h.querySelectorAll('button[data-view]')].map(b=>b.dataset.view), vis:h.checkVisibility()}}}})()")
            chk(f'W1 «{v}»: franja con 4 formas, la actual marcada ({name}) y 3 enlaces a las otras', r['n'] == 4 and r['cur'] == [name] and sorted(r['links']) == sorted(k for k in exp if k != v) and r['vis'], r)
        # W2 · navegar desde la franja
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(900)
        for v in ['analisis', 'segmentos', 'producto']:
            await q.click(f'#why-hub-diagnostico button[data-view="{v}"]'); await q.wait_for_timeout(900)
            h = await q.evaluate("location.hash"); vis = await q.evaluate(f"document.querySelector('#view-{v}').checkVisibility()")
            chk(f'W2 desde la franja se llega a «{v}»', h == '#' + v and vis, (h, vis))
            await q.click(f'#why-hub-{v} button[data-view="diagnostico"]'); await q.wait_for_timeout(900)
        # W3 · orden y desplegables de Diagnóstico
        await q.goto(u + '#diagnostico'); await q.wait_for_selector('#dx-result .metric-card, #dx-result table', timeout=60000); await q.wait_for_timeout(800)
        top = lambda sel: q.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); return e? e.getBoundingClientRect().top + window.scrollY : null}})()")
        o = {k: await top(s) for k, s in [('hub', '#why-hub-diagnostico'), ('result', '#dx-result'), ('level1', '#dx-level1'), ('signals', '#dx-signals'), ('hyps', '#dx-hyps'), ('more', '.dx-more')]}
        chk('W3 orden: franja → resultado → driver → señales → hipótesis → «Ver más»', all(v is not None for v in o.values()) and o['hub'] < o['result'] < o['level1'] < o['signals'] < o['hyps'] < o['more'], o)
        st = await q.evaluate("(()=>{const d=[...document.querySelectorAll('#view-diagnostico details.dx-more')].filter(x=>!x.hidden); return {ids:d.map(x=>x.dataset.dxMore), open:d.filter(x=>x.open).length, res:document.querySelector('#dx-result').checkVisibility(), tree:document.querySelector('#dx-tree').checkVisibility()}})()")
        chk('W4 «Ver más» (guía, árbol, productos, confianza) cerrado; el resultado se ve sin abrir nada', st['ids'] == ['why', 'tree', 'products', 'confidence'] and st['open'] == 0 and st['res'] and not st['tree'], st)
        n = await q.evaluate("(()=>{document.querySelectorAll('#view-diagnostico details.dx-more').forEach(d=>d.open=true); return {why:document.querySelector('#dx-why').textContent.trim().length, tree:document.querySelectorAll('#dx-tree tbody tr').length, prod:document.querySelector('#dx-products').textContent.trim().length, conf:document.querySelector('#dx-confidence').textContent.trim().length}})()")
        chk('W5 abierto, cada bloque tiene su contenido (guía, árbol con filas, productos, confianza)', n['why'] > 20 and n['tree'] > 0 and n['prod'] > 20 and n['conf'] > 20, n)
        # W6 · la brecha de la respuesta = suma de los efectos de los drivers (cálculo aparte con los números visibles)
        g = await q.evaluate("(()=>{const rows=[...document.querySelectorAll('#dx-level1 tbody tr')]; return rows.map(r=>r.cells[4]?r.cells[4].innerText.trim():'')})()")
        num = lambda t: float(t.replace('$', '').replace(',', '').replace('−', '-').replace('+', '').split()[0]) if t else 0
        brecha = await q.evaluate("document.querySelector('#dx-result .metric-card--gap, #dx-result dl:last-of-type .metric-card__value') ? document.querySelector('#dx-result dl:last-of-type .metric-card__value').innerText : ''")
        chk('W6 la brecha del resultado = suma de las contribuciones de volumen, CR y AOV (±1)', len(g) == 3 and abs(sum(num(x) for x in g) - num(brecha)) <= 1.5, (g, brecha))
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
