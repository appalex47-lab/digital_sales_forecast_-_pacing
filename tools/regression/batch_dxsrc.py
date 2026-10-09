"""«Tráfico y conversión» · descomposición tráfico × CR × ticket (maqueta aprobada). Uso: python3 batch_decomp.py <raiz>
Cifras esperadas calculadas AQUÍ con una implementación independiente (no la de la app). Septiembre 2026 contra agosto 2026 (mes anterior de calendario), canal Ecommerce."""
import asyncio, sys, os, math, threading, functools, http.server, socketserver
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else ''))
    if not ok: fails.append(n)
# Dispositivo × Fuente/medio (agosto → septiembre). Una celda tipo bot (Móvil · desconocido: x3 tráfico, CR 3 % → 0.5 %) y una celda chica (<500 sesiones).
DS = {'Móvil · google / organic': ((40000, 1200, 540000), (41000, 1148, 523000)), 'Escritorio · google / organic': ((20000, 700, 350000), (20500, 717, 362000)),
      'Móvil · (direct) / (none)': ((15000, 450, 210000), (14000, 392, 190000)), 'Móvil · bot-farm / referral': ((2000, 60, 24000), (6000, 30, 12000)),
      'Escritorio · blog / referral': ((300, 9, 4000), (350, 10, 4500))}
rows = []
for seg, (a, b) in DS.items():
    rows.append(f'2026-08-15,ecommerce,device_source,{seg},{a[2]},{a[1]},{a[0]}'); rows.append(f'2026-09-15,ecommerce,device_source,{seg},{b[2]},{b[1]},{b[0]}')
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows) + '\n'
def effects(a, b):
    t0, o0, r0 = a; t1, o1, r1 = b; c0, c1, k0, k1 = o0 / t0, o1 / t1, r0 / o0, r1 / o1
    return ((t1 - t0) * c0 * k0, t1 * (c1 - c0) * k0, t1 * c1 * (k1 - k0))
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
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
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'ecommerce')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(250)
        opts = await q.evaluate("[...document.querySelectorAll('#sg-dim option')].map(o=>o.value)")
        chk('DS-0 la dimensión device_source está disponible en el selector', 'device_source' in opts, opts)
        await q.select_option('#sg-dim', 'device_source'); await q.wait_for_timeout(700)
        big = {k: v for k, v in DS.items() if k != 'Escritorio · blog / referral'}
        e = [effects(a, bb) for a, bb in DS.values()]
        tr, cr, tk = (sum(x[i] for x in e) for i in range(3))
        dR = sum(bb[2] - a[2] for a, bb in DS.values())
        foot = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento\"] tfoot td')].map(c=>c.innerText.trim())")
        sg = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
        chk('DS-1 totales de efectos y Δ venta coinciden con el cálculo aparte (suma exacta)', foot == ['Total', sg(dR), sg(tr), sg(cr), sg(tk)] and round(tr + cr + tk) == round(dR), (foot, tr, cr, tk, dR))
        fx = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()))")
        names = [r[0] for r in fx]
        chk('DS-2 la celda chica (350 sesiones) va agrupada en «Otros», no sola', any(n.startswith('Otros') for n in names) and not any(n.startswith('Escritorio · blog') for n in names), names)
        okr = True
        for r in fx:
            nm = next((n for n in big if r[0].startswith(n)), None)
            if not nm: continue
            a, bb = DS[nm]; ee = effects(a, bb)
            okr &= r[1] == sg(bb[2] - a[2]) and r[2].startswith(sg(ee[0]) if round(ee[0]) else '$0') and r[3].startswith(sg(ee[1]) if round(ee[1]) else '$0') and r[4].startswith(sg(ee[2]) if round(ee[2]) else '$0')
        chk('DS-3 las 4 celdas grandes coinciden en Δ y en los tres efectos', okr and sum(1 for r in fx for n in big if r[0].startswith(n)) == 4, fx)
        qt = await q.evaluate("[...document.querySelectorAll('.sgd-quality li')].map(x=>x.innerText.trim())")
        chk('DS-4 aviso de calidad: marca la celda tipo bot (tráfico x3, CR de 3.00 % a 0.50 %) y solo ella', len(qt) == 1 and 'bot-farm' in qt[0] and '3.00 % → 0.50 %' in qt[0] and '+4,000' in qt[0], qt)
        txt = await q.evaluate("(document.querySelector('.sgd-quality')||{innerText:''}).innerText")
        chk('DS-5 el aviso no afirma causa (dice «puede ser» y «no lo confirma»)', 'Puede ser' in txt and 'no lo confirma' in txt, txt)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
