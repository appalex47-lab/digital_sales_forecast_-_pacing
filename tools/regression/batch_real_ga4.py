"""Export REAL de GA4 (Segmentos_2026.csv, ~94 MB): importa con la app y compara contra el CSV leído aparte.
Se omite si el archivo no está (variable GA4_REAL o /mnt/user-data/uploads/Segmentos_2026.csv). Uso: python3 batch_real_ga4.py <raiz>"""
import asyncio, sys, os, csv, math, json, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
FILE = os.environ.get('GA4_REAL', '/mnt/user-data/uploads/Segmentos_2026.csv')
if not os.path.exists(FILE): print(f'OMITIDA: no está el export real de GA4 ({FILE})'); sys.exit(0)
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d != '' and not ok else ''))
    if not ok: fails.append(n)
MES = {'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dic': 12}
# totales por mes y canal leídos del CSV (sin usar la app)
tot = {}
with open(FILE, encoding='utf-8-sig', newline='') as f:
    r = csv.reader(f); next(r)
    for row in r:
        d, m, y = row[0].split(' '); mo = f'{y}-{MES[m]:02d}'
        if mo not in ('2026-08', '2026-09'): continue
        ch = 'ecommerce' if row[1] == 'web' else 'app'
        a = tot.setdefault((mo, ch), [0, 0, 0.0]); a[0] += int(row[7]); a[1] += int(row[8]); a[2] += float(row[9])
def eff(a, b):
    r0 = a[2] if a else 0; r1 = b[2] if b else 0; d = r1 - r0
    if not a or not b or not a[0] > 0: return d, 0, 0
    if not a[1] > 0: return 0, d, 0
    c0 = a[1] / a[0]; c1 = b[1] / b[0] if b[0] > 0 else 0; k0 = a[2] / a[1]
    tr = (b[0] - a[0]) * c0 * k0; cr = b[0] * (c1 - c0) * k0; av = b[0] * c1 * (b[2] / b[1] - k0) if b[1] else 0
    return tr, cr + (d - tr - cr - av), av
def total_eff(segs):
    T1 = sum(b[0] for a, b in segs.values() if b); mn = max(500, math.ceil(.01 * T1))
    big = [x for x in segs.values() if (x[1] and x[1][0] >= mn) or (x[0] and x[0][0] >= mn)]; small = [x for x in segs.values() if x not in big]
    mg = lambda i: (lambda m: tuple(sum(z[j] for z in m) for j in range(3)) if m else None)([x[i] for x in small if x[i]])
    items = big + ([(mg(0), mg(1))] if small else []); t = [0, 0, 0]
    for a, b in items:
        e = eff(a, b); t = [t[i] + e[i] for i in range(3)]
    return t, len(small), mn
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--js-flags=--max-old-space-size=4096'])
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u); await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[FILE])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=900000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=900000)
        bt = await q.evaluate("(()=>{const x=FP.app.state.store.segments.batches[0]; return {rows:x.rowCount, acc:x.accepted, rej:x.rejected, dup:x.summary.duplicates, inv:x.summary.invalidKey}})()")
        chk('R-1 ninguna fila rechazada ni con llave duplicada (la página «/» y las variantes de texto no se pierden)', bt['rej'] == 0 and bt['dup'] == 0 and bt['inv'] == 0, bt)
        seg = await asyncio.wait_for(q.evaluate("""(()=>{const r=FP.app.state.store.segments.records,o={};for(const x of r){const mo=x.date.slice(0,7); if(mo!=='2026-08'&&mo!=='2026-09')continue; const k=[mo,x.channel,x.dimension,x.segment].join('|'); const a=o[k]||(o[k]=[0,0,0]); const m=x.metrics; a[0]+=m.trafficVolume.value||0;a[1]+=m.orders.value||0;a[2]+=m.revenue.value||0;} return o})()"""), 180)
        dims = sorted({k.split('|')[2] for k in seg})
        chk('R-2 las 7 dimensiones llegan', len(dims) == 7, dims)
        bad = []
        for dim in dims:
            for (mo, ch), t in tot.items():
                a = [sum(v[i] for k, v in seg.items() if k.startswith(f'{mo}|{ch}|{dim}|')) for i in range(3)]
                if abs(a[0] - t[0]) > .5 or abs(a[1] - t[1]) > .5 or abs(a[2] - t[2]) > 1: bad.append((dim, mo, ch, a, t))
        chk('R-3 sesiones, pedidos y venta por dimensión × mes × canal = CSV (28 combinaciones)', not bad, bad[:2])
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(1500)
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'ecommerce')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(400)
        for ch in ('ecommerce', 'app'):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'channel'}},value:'{ch}'}})"); await q.wait_for_timeout(1200)
            for dim in dims:
                await q.select_option('#sg-dim', dim); await q.wait_for_timeout(1500)
                foot = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento\"] tfoot td')].map(c=>c.innerText.trim())")
                S = {}
                for k, v in seg.items():
                    mo, c, d, sg = k.split('|', 3)
                    if c == ch and d == dim: S.setdefault(sg, [None, None])[0 if mo == '2026-08' else 1] = tuple(v)
                te, ns, mn = total_eff({k: tuple(v) for k, v in S.items()})
                dl = sum((x[1][2] if x[1] else 0) - (x[0][2] if x[0] else 0) for x in S.values())
                want = ['Total', money(dl), money(te[0]), money(te[1]), money(te[2])]
                chk(f'R-4 {ch} · {dim}: totales de efectos de la pantalla = cálculo aparte {want[2:]}', foot == want, (foot, want))
                if ch == 'ecommerce' and dim == 'landing':
                    note = await q.evaluate("(document.querySelector('.sgd-others')||{innerText:''}).innerText")
                    chk('R-5 Landing en Ecommerce: avisa que «Otros» reúne la mayor parte del tráfico', 'Otros» reúne el' in note, note)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
