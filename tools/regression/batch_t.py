"""«Tráfico y conversión» · parte 1 de descubrimiento. Uso: python3 batch_t.py <raiz>   Sale 1 si alguna falla.
Datos con resultado conocido (calculado aquí, aparte de la app): Móvil = mucho tráfico y CR bajo; Escritorio = estrella; Tableta = poco tráfico y CR alto;
Smart TV = poco volumen (CR 10 % que NO debe liderar rankings). Campañas con CR casi igual al total y poco volumen → «no concluyente»."""
import asyncio, sys, os, re, datetime as dt, threading, functools, http.server, socketserver
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
# (dimensión, segmento) → {mes: (sesiones, pedidos, AOV)}
SPEC = {('dispositivo', 'Móvil'): {9: (60000, 600, 1000), 8: (60000, 800, 1000)}, ('dispositivo', 'Escritorio'): {9: (35000, 1050, 1200), 8: (35000, 850, 1200)},
        ('dispositivo', 'Tableta'): {9: (4000, 200, 900), 8: (4000, 200, 900)}, ('dispositivo', 'Smart TV'): {9: (200, 20, 900), 8: (200, 20, 900)},
        ('campaña', 'cmp_a'): {9: (50000, 940, 1100), 8: (50000, 940, 1100)}, ('campaña', 'cmp_b'): {9: (1500, 29, 1100), 8: (1500, 29, 1100)},
        ('campaña', 'cmp_c'): {9: (47700, 901, 1100), 8: (47700, 901, 1100)}}
def days(m): return [dt.date(2026, 9, 1) + dt.timedelta(d) for d in range(30)] if m == 9 else [dt.date(2026, 8, 2) + dt.timedelta(d) for d in range(30)]
rows = []
for (dim, seg), per in SPEC.items():
    for m, (ses, ped, aov) in per.items():
        for i, d in enumerate(days(m)):
            sd = ses // 30 + (1 if i < ses % 30 else 0); pd_ = ped // 30 + (1 if i < ped % 30 else 0)
            rows.append(f'{d.isoformat()},ecommerce,{dim},{seg},{pd_ * aov},{pd_},{sd}')
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows) + '\n'
dev9 = {k[1]: v[9] for k, v in SPEC.items() if k[0] == 'dispositivo'}
T = sum(v[0] for v in dev9.values()); O = sum(v[1] for v in dev9.values()); crT = O / T
OPP = 60000 * (crT - 600 / 60000) * 1000
money = lambda v: f'${abs(v):,.0f}'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'seg.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(500)
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'total')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(250)
        await q.select_option('#sg-dim', 'device'); await q.wait_for_timeout(500)
        hl = await q.evaluate("[...document.querySelectorAll('.sghl__text')].map(x=>x.innerText)")
        J = ' | '.join(hl)
        chk('T-1 hallazgo: mayor oportunidad de conversión = Móvil, con el CR del total y el monto calculado aparte', any('Mayor oportunidad de conversión: «Móvil»' in x and money(OPP) in x and f'{crT*100:.2f} %' in x for x in hl), (J[:300], money(OPP)))
        chk('T-1 hallazgo: oportunidad de escalar = Tableta (no Smart TV, que tiene poco volumen)', any('Oportunidad de escalar: «Tableta»' in x for x in hl), J[:400])
        chk('T-1 hallazgos: mayor caída = Móvil (−$200,000) y mayor alza = Escritorio (+$240,000) contra el periodo anterior', any('Mayor caída' in x and '«Móvil»' in x and '−$200,000' in x for x in hl) and any('Mayor alza' in x and '«Escritorio»' in x and '240,000' in x for x in hl), J[:500])
        rev = {k: v[1] * v[2] for k, v in dev9.items()}; share2 = (rev['Escritorio'] + rev['Móvil']) / sum(rev.values())
        chk(f'T-1 hallazgo: concentración Escritorio + Móvil = {share2*100:.1f} % de la venta (muy concentrada)', any('Concentración' in x and f'{share2*100:.1f} %' in x and 'muy concentrada' in x for x in hl), J[-400:])
        thr = max(500, -(-T // 100))
        chk(f'T-1 hallazgo: 1 segmento con menos de {thr:,} sesiones se marca «poco volumen»', any(f'menos de {thr:,} sesiones' in x and x.startswith('1 segmento') for x in hl), J[-300:])
        quad = await q.evaluate("Object.fromEntries([...document.querySelectorAll('#view-segmentos table[aria-label*=\"tráfico y conversión\"] tbody tr')].map(r=>[r.cells[0].innerText.trim(), r.cells[1].innerText.trim()]))")
        chk('T-2 cuadrantes en la tabla: Móvil «Convertir mejor», Escritorio «Estrella», Tableta «Escalar tráfico», Smart TV «Poco volumen»', quad.get('Móvil', '').startswith('Convertir mejor') and quad.get('Escritorio', '').startswith('Estrella') and quad.get('Tableta', '').startswith('Escalar tráfico') and quad.get('Smart TV', '').startswith('Poco volumen'), quad)
        opp = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Oportunidad estimada por segmento\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()))")
        chk('T-3 oportunidad estimada: solo Móvil, con el monto calculado aparte', len(opp) == 1 and opp[0][0] == 'Móvil' and opp[0][5] == '+' + money(OPP), (opp, money(OPP)))
        rk = await q.evaluate("Object.fromEntries([...document.querySelectorAll('.sgrank > div')].map(d=>[d.querySelector('h4').innerText, [...d.querySelectorAll('li span')].map(x=>x.innerText)]))")
        chk('T-4 rankings: «Más venta» lo encabeza Escritorio; «Mejor CR» lo encabeza Tableta y no incluye Smart TV (poco volumen); «Menor CR» y «Menor AOV» solo traen los que están bajo el total', rk.get('Más venta', [None])[0] == 'Escritorio' and rk.get('Mejor CR', [None])[0] == 'Tableta' and 'Smart TV' not in rk.get('Mejor CR', []) and rk.get('Menor CR (bajo el total)', []) == ['Móvil'] and rk.get('Menor AOV (bajo el total)', []) == ['Tableta', 'Móvil'], rk)
        mp = await q.evaluate("(()=>{const s=document.querySelector('.sgmap svg');return s?{n:s.querySelectorAll('circle').length,titles:[...s.querySelectorAll('circle title')].map(t=>t.textContent.split(':')[0]),role:s.getAttribute('role'),cap:document.querySelector('.sgmap figcaption').innerText}:null})()")
        chk('T-5 mapa: 3 círculos (los segmentos con volumen), con nombre, rol de imagen y explicación de las líneas', bool(mp) and mp['n'] == 3 and sorted(mp['titles']) == ['Escritorio', 'Móvil', 'Tableta'] and mp['role'] == 'img' and 'CR del total' in mp['cap'], mp)
        await q.select_option('#sg-dim', 'campaign'); await q.wait_for_timeout(500)
        cq = await q.evaluate("Object.fromEntries([...document.querySelectorAll('#view-segmentos table[aria-label*=\"tráfico y conversión\"] tbody tr')].map(r=>[r.cells[0].innerText.trim(), r.cells[1].innerText.trim()]))")
        nop = await q.evaluate("document.querySelectorAll('table[aria-label=\"Oportunidad estimada por segmento\"] tbody tr').length")
        chk('T-6 campañas con CR casi igual al total: «diferencia de CR no concluyente» y ninguna oportunidad en pesos', 'no concluyente' in cq.get('cmp_b', '') and 'no concluyente' in cq.get('cmp_a', '') and nop == 0, (cq, nop))
        bad = []
        for w in (1920, 1440, 1280, 1100, 768, 390):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.select_option('#sg-dim', 'device'); await q.wait_for_timeout(300)
            r = await q.evaluate("({doc:document.documentElement.scrollWidth-innerWidth, tabs:[...document.querySelectorAll('#view-segmentos .table-wrap')].map(x=>x.scrollWidth-x.clientWidth)})")
            if r['doc'] > 0 or (w >= 1100 and any(x > 1 for x in r['tabs'])): bad.append((w, r))
        chk('T-7 sin desborde de página de 390 a 1920 px y tablas sin scroll horizontal en escritorio', not bad, bad)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_t:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
