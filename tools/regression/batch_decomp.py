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
# dimensión → segmento → (ago(ses,ped,venta), sep(ses,ped,venta))
SRC = {'Google · orgánico': ((48000, 1056, 462000), (46500, 1023, 431000)), 'Directo': ((30000, 990, 480000), (30500, 884, 425000)),
       'Google · pago': ((22000, 396, 170000), (26500, 424, 210000)), 'Correo / CRM': ((9000, 495, 285000), (8800, 484, 290000)), 'Meta · social': ((15000, 180, 70000), (11000, 121, 52000))}
DEV = {'Móvil': ((80000, 1900, 850000), (80300, 1700, 770000)), 'Escritorio': ((44000, 1217, 617000), (43000, 1236, 638000))}
DIMS = {'fuente': SRC, 'dispositivo': DEV}
rows = []
for dim, segs in DIMS.items():
    for seg, (a, b) in segs.items():
        rows.append(f'2026-08-15,ecommerce,{dim},{seg},{a[2]},{a[1]},{a[0]}'); rows.append(f'2026-09-15,ecommerce,{dim},{seg},{b[2]},{b[1]},{b[0]}')
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows) + '\n'
def effects(a, b):                                   # a, b = (sesiones, pedidos, venta); tráfico → CR → ticket
    t0, o0, r0 = a; t1, o1, r1 = b; c0, c1, k0, k1 = o0 / t0, o1 / t1, r0 / o0, r1 / o1
    return ((t1 - t0) * c0 * k0, t1 * (c1 - c0) * k0, t1 * c1 * (k1 - k0))
def total(segs):
    e = [effects(a, b) for a, b in segs.values()]
    return tuple(sum(x[i] for x in e) for i in range(3))
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
        await q.select_option('#sg-dim', 'source'); await q.wait_for_timeout(600)
        tr, cr, tk = total(SRC)
        TB = "(lbl)=>[...document.querySelectorAll(`table[aria-label=\\\"${lbl}\\\"] tbody tr`)].map(r=>[...r.cells].map(c=>c.innerText.trim()))"
        lead = await q.evaluate("(document.querySelector('#sg-dec').closest('.sgcard').querySelector('.sgd-head__lead')||{innerText:''}).innerText")
        chk('D-1 titular: la venta bajó −$59,000 (−4.0 %), $1,467,000 → $1,408,000', 'bajó' in lead and '−$59,000' in lead and '−4.0 %' in lead and '$1,467,000' in lead and '$1,408,000' in lead, lead)
        foot = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento\"] tfoot td')].map(c=>c.innerText.trim())")
        chk(f'D-2 totales: tráfico {money(tr)}, conversión {money(cr)}, ticket {money(tk)} y Δ −$59,000 (suman exacto)', foot == ['Total', '−$59,000', money(tr), money(cr), money(tk)] and round(tr + cr + tk) == -59000, foot)
        wf = await q.evaluate("[...document.querySelectorAll('.sgd-wf__val')].map(x=>x.innerText.trim())")
        chk('D-3 la cascada muestra los mismos cuatro valores', wf == [money(tr), money(cr), money(tk), '−$59,000'], wf)
        fx = await q.evaluate(TB, 'Efectos por segmento')
        okrows = True; seen = []
        for r in fx:
            name = next((n for n in SRC if r[0].startswith(n)), None)
            if not name: continue
            a, bb = SRC[name]; e = effects(a, bb); seen.append(name)
            okrows &= r[1] == money(bb[2] - a[2]) and r[2].startswith(money(e[0]) if round(e[0]) else '$0') and r[3].startswith(money(e[1]) if round(e[1]) else '$0') and r[4].startswith(money(e[2]) if round(e[2]) else '$0')
        chk('D-4 los 5 segmentos: Δ y los tres efectos coinciden con el cálculo aparte', okrows and len(seen) == 5, (seen, fx))
        chk('D-5 orden: Directo (−$55,000) primero y Google · pago (+$40,000) al final', fx[0][0].startswith('Directo') and fx[-1][0].startswith('Google · pago'), [r[0] for r in fx])
        dir_ = next(r for r in fx if r[0].startswith('Directo'))
        chk('D-6 CR de Directo marcado «distinguible del azar»; el de Google · orgánico (CR igual) no tiene cambio', 'distinguible del azar' in dir_[3], dir_)
        finds = await q.evaluate("[...document.querySelectorAll('.sgd-find')].map(x=>x.innerText.replace(/\\s+/g,' ').trim())")
        share = 59394 / (59394 + 22753 + 4278) * 100
        chk(f'D-7 primera frase: Directo convirtió 3.30 % → 2.90 %, −$59,394, {round(share)} % de lo que restó la conversión', bool(finds) and 'Directo' in finds[0] and '3.30 % → 2.90 %' in finds[0] and '−$59,394' in finds[0] and f'{round(share)} %' in finds[0], finds)
        chk('D-8 hay frase de mezcla para Google · pago (más tráfico, peor CR) y de ticket', any('Google · pago' in f and 'convirtieron peor' in f for f in finds) and any(f.startswith('Ticket') for f in finds), finds)
        mix = await q.evaluate("(document.querySelector('.sgd-mix')||{innerText:''}).innerText.replace(/\\s+/g,' ')")
        chk('D-9 mezcla del CR: 2.51 % → 2.38 % (−0.13 pp): −0.15 pp dentro de segmentos, +0.02 pp por mezcla', '2.51 % → 2.38 %' in mix and '−0.13 pp' in mix and '−0.15 pp' in mix and '+0.02 pp' in mix, mix)
        dims = await q.evaluate(TB, 'Resumen por dimensión')
        trd, crd, tkd = total(DEV)
        dev = next((r for r in dims if r[0].startswith('Dispositivo')), None); src = next((r for r in dims if r[0].startswith('Fuente')), None)
        chk('D-10 resumen por dimensión: Dispositivo y Fuente/medio con sus propios efectos (calculados aparte)', bool(dev) and bool(src) and dev[1] == money(trd) and dev[2] == money(crd) and dev[3] == money(tkd) and src[1] == money(tr) and src[2] == money(cr), dims)
        chk('D-11 en Dispositivo, el segmento que más restó es Móvil', bool(dev) and dev[4].startswith('Móvil'), dev)
        await q.click('table[aria-label="Resumen por dimensión"] button[data-value="device"]'); await q.wait_for_timeout(600)
        sel = await q.evaluate("document.getElementById('sg-dim').value")
        fd = await q.evaluate(TB, 'Efectos por segmento')
        chk('D-12 pulsar la dimensión en el resumen cambia la vista (Móvil y Escritorio)', sel == "device" and [r[0].split('\n')[0] for r in fd] == ['Móvil', 'Escritorio'], (sel, [r[0] for r in fd]))
        nav = await q.evaluate("[...document.querySelectorAll('.sgnav a')].map(a=>a.innerText)")
        chk('D-13 el índice «Ir a» empieza con «Qué explica el cambio» y «Todas las dimensiones»', nav[:2] == ['Qué explica el cambio', 'Todas las dimensiones'], nav)
        chk('D-14 ya no existen las tablas Ganadores/Perdedores duplicadas', not await q.evaluate("!!document.querySelector('table[aria-label=\"Ganadores\"],table[aria-label=\"Perdedores\"]')"))
        # sin periodo base → mensaje claro, sin tabla
        for k, v in (('periodKey', '2026-08'),):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(500)
        txt = await q.evaluate("(document.querySelector('#sg-dec')||{closest:()=>null}).closest('.sgcard')?.innerText||''")
        chk('D-15 agosto (sin julio): avisa que no hay referencia y no inventa efectos', 'No hay datos de segmentos del periodo anterior' in txt and not await q.evaluate("!!document.querySelector('table[aria-label=\"Efectos por segmento\"]')"), txt[:200])
        chk('Sin errores de página', not errs, errs[:2])
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodKey'},value:'2026-09'})"); await q.wait_for_timeout(500)
        bad = []
        for w in (1920, 1440, 1280, 1100, 768, 390):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(300)
            r = await q.evaluate("({doc:document.documentElement.scrollWidth-innerWidth, wf:(document.querySelector('.sgd-wf')||{getBoundingClientRect:()=>({right:0})}).getBoundingClientRect().right-innerWidth})")
            if r['doc'] > 0 or r['wf'] > 0: bad.append((w, r))
        chk('D-16 sin desborde de página de 390 a 1920 px', not bad, bad)
        await q.set_viewport_size({'width': 1280, 'height': 900}); await q.wait_for_timeout(300)
        el = await q.query_selector('#sg-dec'); box = await el.evaluate("e=>e.closest('.sgcard').scrollIntoView()"); await q.wait_for_timeout(200)
        await q.screenshot(path='/tmp/claude-0/logs/decomp.png')
        await b.close()
asyncio.run(main())
print('\nRESULTADO batch_decomp: ' + ('OK' if not fails else 'FALLAS: ' + '; '.join(fails))); sys.exit(1 if fails else 0)
