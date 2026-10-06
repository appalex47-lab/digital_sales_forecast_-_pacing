"""«Tráfico y conversión» · parte 2 (qué explica el cambio, AOV bajo, calidad de la medición, nuevos y recurrentes). Uso: python3 batch_t.py <raiz>   Sale 1 si alguna falla.
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
        ('campaña', 'cmp_c'): {9: (47700, 901, 1100), 8: (47700, 901, 1100)}, ('campaña', 'Sin dato (not set)'): {9: (8000, 150, 1100), 8: (8000, 150, 1100)},
        ('tipo_cliente', 'Nuevo'): {9: (70000, 700, 1000), 8: (50000, 500, 1000)}, ('tipo_cliente', 'Recurrente'): {9: (29200, 1170, 1100), 8: (49200, 1970, 1100)}}
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
        TB = "(lbl)=>[...document.querySelectorAll(`table[aria-label=\\\"${lbl}\\\"] tbody tr`)].map(r=>[...r.cells].map(c=>c.innerText.trim()))"
        intro = await q.evaluate("(document.querySelector('#sg-c + p')||{innerText:''}).innerText")
        win = await q.evaluate(TB, 'Ganadores'); los = await q.evaluate(TB, 'Perdedores')
        chk('U-1 cambio total contra agosto = +$40,000 (calculado aparte)', '+$40,000' in intro, intro[:160])
        chk('U-1 ganador: Escritorio +$240,000, 54.5 % de los movimientos, todo por CR (+$240,000; tráfico y AOV en $0)', bool(win) and win[0][0] == 'Escritorio' and win[0][1] == '+$240,000' and win[0][2] == '54.5 %' and win[0][3] == '$0' and win[0][4] == '+$240,000' and win[0][5] == '$0' and win[0][6] == 'CR', win)
        chk('U-1 perdedor: Móvil −$200,000, 45.5 %, por CR', bool(los) and los[0][0] == 'Móvil' and los[0][1] == '−$200,000' and los[0][2] == '45.5 %' and los[0][4] == '−$200,000' and los[0][6] == 'CR', los)
        aovT = sum(v[1] * v[2] for v in dev9.values()) / sum(v[1] for v in dev9.values())
        low = await q.evaluate(TB, 'AOV bajo con buen volumen')
        up = 200 * (aovT - 900)
        chk(f'U-2 AOV bajo: solo Tableta ($900 contra {money(aovT)} del total, −{(1-900/aovT)*100:.1f} %, +{money(up)} con el AOV del total); Móvil (−9 %) no entra', len(low) == 1 and low[0][0] == 'Tableta' and low[0][3] == f'−{(1-900/aovT)*100:.1f} %' and low[0][4] == '+' + money(up), (low, money(up)))
        sp = await q.evaluate(TB, 'Nuevos y recurrentes'); spi = await q.evaluate("(document.querySelector('#sg-n + p')||{innerText:''}).innerText")
        n9 = 70000 / 99200; n8 = 50000 / 99200
        chk(f'U-4 nuevos y recurrentes (desde «tipo de cliente», aunque la dimensión elegida sea Dispositivo): Nuevo {n9*100:.1f} % del tráfico, +{(n9-n8)*100:.1f} pp; los recurrentes convierten 4.0 veces', bool(sp) and sp[0][0] == 'Nuevo' and sp[0][1] == f'{n9*100:.1f} %' and sp[0][2] == f'+{(n9-n8)*100:.1f} pp' and 'convierten 4.0 veces' in spi, (sp, spi))
        hl0 = await q.evaluate("[...document.querySelectorAll('.sghl__text')].map(x=>x.innerText)")
        chk('U-3 sin alerta de calidad en Dispositivo (no hay «not set»)', not any('Calidad de la medición' in x for x in hl0), hl0[:2])
        await q.select_option('#sg-dim', 'campaign'); await q.wait_for_timeout(500)
        hl = await q.evaluate("[...document.querySelectorAll('.sghl__text')].map(x=>x.innerText)")
        share = 8000 / (50000 + 1500 + 47700 + 8000)
        chk(f'U-3 en Campaña la primera frase alerta: {share*100:.1f} % del tráfico sin dato («Sin dato (not set)»), posible problema de etiquetado', bool(hl) and hl[0].startswith('Calidad de la medición') and f'{share*100:.1f} %' in hl[0], hl[:1])
        bad = []
        await q.select_option('#sg-dim', 'device')
        for w in (1920, 1440, 1280, 1100, 768, 390):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(300)
            r = await q.evaluate("({doc:document.documentElement.scrollWidth-innerWidth, tabs:[...document.querySelectorAll('#view-segmentos .table-wrap')].map(x=>x.scrollWidth-x.clientWidth)})")
            if r['doc'] > 0 or (w >= 1100 and any(x > 1 for x in r['tabs'])): bad.append((w, r))
        chk('U-5 sin desborde de página de 390 a 1920 px y tablas nuevas sin scroll horizontal en escritorio', not bad, bad)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_u:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
