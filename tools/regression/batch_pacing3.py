"""Fase 3 · Pacing & Forecast: la respuesta arriba, ajustes compactos, detalle en «Ver más» sin perder datos.
Uso: python3 batch_pacing3.py <raiz>"""
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
        u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        await q.goto(u + '#pacing'); await q.wait_for_selector('#fc-kpis .metric-card', timeout=60000); await q.wait_for_timeout(600)
        top = lambda sel: q.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); return e? e.getBoundingClientRect().top + window.scrollY : null}})()")
        order = {k: await top(s) for k, s in [('kpis', '#fc-kpis'), ('channels', '#fc-channels'), ('alerts', '#fc-alerts'), ('controls', '#fc-controls'), ('chart', '#fc-chart'), ('more', '#view-pacing .pacing-more')]}
        chk('P1 orden: respuesta (cifras y canales) → alertas → ajustes → gráfico → «Ver más»', all(order[a] is not None for a in order) and order['kpis'] < order['channels'] < order['alerts'] < order['controls'] < order['chart'] < order['more'], order)
        st = await q.evaluate("(()=>{const d=[...document.querySelectorAll('#view-pacing details.pacing-more')]; return {n:d.length, open:d.filter(x=>x.open).length, ids:d.map(x=>x.dataset.pacingMore), layer:!document.querySelector('#view-pacing .home-layer').hidden}})()")
        chk('P2 seis «Ver más» cerrados (periodos, índices, métodos, eventos, versiones, parámetros)', st['n'] == 6 and st['open'] == 0 and st['ids'] == ['periods', 'indices', 'methods', 'events', 'versions', 'params'] and st['layer'], st)
        vis = await q.evaluate("(()=>({kpi:document.querySelector('#fc-kpis').checkVisibility(), ch:document.querySelector('#fc-channels').checkVisibility(), ctl:document.querySelector('#fc-ref').checkVisibility(), met:document.querySelectorAll('#view-pacing [data-action=fc-metric]').length, per:document.querySelector('#fc-periods').checkVisibility()}))()")
        chk('P3 la respuesta y los ajustes se ven sin abrir nada; el detalle no', vis['kpi'] and vis['ch'] and vis['ctl'] and vis['met'] == 5 and not vis['per'], vis)
        # el dato sigue viviendo en el detalle: al abrir, hay tablas con filas
        n = await q.evaluate("(()=>{document.querySelectorAll('#view-pacing details.pacing-more').forEach(d=>d.open=true); return {per:document.querySelectorAll('#fc-periods tbody tr').length, idx:document.querySelectorAll('#fc-indices tbody tr').length, met:document.querySelectorAll('#fc-methods tbody tr').length, ver:document.querySelector('#fc-versions').textContent.trim().length, par:document.querySelectorAll('#fc-params input,#fc-params select').length}})()")
        chk('P4 abierto, el detalle tiene sus tablas y controles (periodos 13 filas, 4 métodos, parámetros)', n['per'] == 13 and n['met'] == 4 and n['idx'] > 0 and n['ver'] > 0 and n['par'] > 3, n)
        # la cifra de la respuesta = cálculo aparte (venta real acumulada del año, canal Ecommerce)
        yt = await q.evaluate("(()=>{const r=[...document.querySelectorAll('#fc-channels tbody tr')].map(t=>[t.cells[0].innerText.trim(), t.cells[3].innerText.trim()]); return r})()")
        num = lambda t: int(t.replace('$', '').replace(',', '').split('.')[0])
        chk('P6 «Total digital» de la respuesta = suma de los cuatro canales (cálculo aparte)', len(yt) == 5 and abs(sum(num(x[1]) for x in yt[:4]) - num(yt[4][1])) <= 4, yt)
        # cambiar la métrica sigue funcionando y la tabla de periodos (dentro de «Ver más») cambia
        h0 = await q.evaluate("document.querySelector('#fc-periods thead').innerText.replace(/\\s+/g,' ')"); k0 = await q.evaluate("document.querySelector('#fc-kpis h3').innerText")
        await q.click('#view-pacing [data-action="fc-metric"]:not([aria-pressed="true"])'); await q.wait_for_timeout(500)
        k1 = await q.evaluate("document.querySelector('#fc-kpis h3').innerText"); op = await q.evaluate("document.querySelectorAll('#view-pacing details.pacing-more[open]').length")
        chk('P5 cambiar la métrica actualiza la respuesta y lo abierto en «Ver más» sigue abierto', k0 != k1 and op == 6, (k0, k1, op))
        await q.evaluate("document.querySelectorAll('#view-pacing details.pacing-more').forEach(d=>d.open=false)")
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
