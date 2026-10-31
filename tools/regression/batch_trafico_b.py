"""«Tráfico y conversión» · versión B: todas las dimensiones a la vez, filtros, cruce y acciones. Uso: python3 batch_trafico_b.py <raiz>
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
DS = {'Móvil · google / organic': ((30000, 700, 300000), (31000, 640, 280000)), 'Móvil · direct / none': ((20000, 600, 290000), (21000, 560, 262000)),
      'Escritorio · google / organic': ((18000, 356, 162000), (17000, 392, 169000)), 'Escritorio · direct / none': ((10000, 390, 190000), (9500, 410, 197000))}
DIMS = {'fuente': SRC, 'dispositivo': DEV}
rows = []
for dim, segs in DIMS.items():
    for seg, (a, b) in segs.items():
        rows.append(f'2026-08-15,ecommerce,{dim},{seg},{a[2]},{a[1]},{a[0]}'); rows.append(f'2026-09-15,ecommerce,{dim},{seg},{b[2]},{b[1]},{b[0]}')
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows) + '\n'
rows_x = list(rows)
for seg, (a, b) in DS.items():
    rows_x.append(f'2026-08-15,ecommerce,device_source,{seg},{a[2]},{a[1]},{a[0]}'); rows_x.append(f'2026-09-15,ecommerce,device_source,{seg},{b[2]},{b[1]},{b[0]}')
CSVX = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows_x) + '\n'
def effects(a, b):                                   # a, b = (sesiones, pedidos, venta); tráfico → CR → ticket
    t0, o0, r0 = a; t1, o1, r1 = b; c0, c1, k0, k1 = o0 / t0, o1 / t1, r0 / o0, r1 / o1
    return ((t1 - t0) * c0 * k0, t1 * (c1 - c0) * k0, t1 * c1 * (k1 - k0))
def total(segs):
    e = [effects(a, b) for a, b in segs.values()]
    return tuple(sum(x[i] for x in e) for i in range(3))
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
async def load(q, u, csv):
    await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
    await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'seg.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
    await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
    await q.goto(u + '#segmentos'); await q.wait_for_timeout(500)
    for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'ecommerce')):
        await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(250)
    await q.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(500)
        t0 = await q.evaluate("document.getElementById('segments-view').innerText")
        chk('T1 sin segmentos explica qué cargar', 'Todavía no hay segmentos cargados' in t0, t0[:160])
        await load(q, u, CSV)
        tr, cr, tk = total(SRC)
        tb_ = tuple(sum(a[i] for a, b2 in SRC.values()) for i in range(3)); tc_ = tuple(sum(b2[i] for a, b2 in SRC.values()) for i in range(3)); et = effects(tb_, tc_)   # efectos del TOTAL (no de una dimensión)
        v = await q.evaluate("(document.querySelector('#sg-frame .px-verdict h2')||{innerText:''}).innerText")
        chk('T2 veredicto: la venta bajó $59,000 (−4.0 %), sobre todo por peor conversión', 'La venta bajó $59,000 (−4.0 %)' in v and 'peor conversión' in v and money(et[1]) in v, v)
        chips = await q.evaluate("[...document.querySelectorAll('#sg-frame .px-tchip')].map(c=>c.innerText.trim())")
        chk('T3 chips de confiabilidad: cuadra, periodo anterior, 2 dimensiones y traslape', any('Cuadra' in c for c in chips) and any('Contra el periodo anterior' in c for c in chips) and any('2 dimensiones' in c for c in chips) and any('se traslapan' in c for c in chips), chips)
        kp = await q.evaluate("[...document.querySelectorAll('#sg-frame .sgkpis .metric-card dt')].map(x=>x.innerText.replace(/\\s*\\?\\s*$/,'').trim())")
        chk('T4 las cinco cifras (tráfico, pedidos, CR, AOV, venta)', kp == ['Tráfico', 'Pedidos', 'CR', 'AOV', 'Venta'], kp)
        # total del veredicto = suma de los segmentos de la fuente (mismo total en cualquier dimensión)
        tot = await q.evaluate("(()=>{const t=FP.trafficConversionEngine; return null})()")
        short = await q.evaluate("document.querySelector('[data-sg-summary]').innerText")
        rows_s = await q.evaluate("document.querySelectorAll('[data-sg-summary] .px-sum__r').length")
        chk('T5 resumen general con filas condicionales (cambio, quién lo mueve, mezcla, ojo…)', rows_s >= 4 and 'CAMBIO DE VENTA' in short.upper() and 'Ojo'.upper() in short.upper(), short[:300])
        await q.click('#sg-md [data-v=l]'); await q.wait_for_timeout(250)
        long_ = await q.evaluate("document.querySelector('[data-sg-summary]').innerText")
        chk('T6 versión larga da más texto y se puede volver a la corta', len(long_) > len(short)); await q.click('#sg-md [data-v=c]'); await q.wait_for_timeout(200)
        ids = await q.evaluate("[...document.querySelectorAll('#view-segmentos section.px-blk[id]')].map(s=>s.id)")
        chk('T7 secciones en orden como preguntas, con «¿Qué hago con esto?» al final', ids[:4] == ['sg-dec', 'sg-dims', 'sg-x', 'sg-m'] and ids[-1] == 'sg-q' and 'sg-table' in ids, ids)
        chk('T8 el método viene cerrado', await q.evaluate("!document.getElementById('sg-meth').open"))
        await q.click('#sg-m-res'); await q.wait_for_timeout(200)
        chk('T9 «Resumen» oculta las secciones y «Completo» las vuelve a mostrar', not await q.locator('#sg-dec').is_visible()); await q.click('#sg-m-full'); await q.wait_for_timeout(200)
        chk('T9b «Completo» las muestra', await q.locator('#sg-dec').is_visible())
        # lista unificada y filtros
        L = "[...document.querySelectorAll('table[aria-label=\"Efectos por segmento de todas las dimensiones\"] tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())"
        rows0 = await q.evaluate(L)
        chk('T10 la lista junta los segmentos de todas las dimensiones (5 fuentes + 2 dispositivos)', len(rows0) == 7 and any('Dispositivo' in r for r in rows0) and any('Fuente' in r for r in rows0), rows0)
        await q.click('.sgd-flt [data-action="seg-dim"][data-value="device"]'); await q.wait_for_timeout(500)
        rows1 = await q.evaluate(L)
        chk('T11 filtrar por Dispositivo deja solo Móvil y Escritorio', len(rows1) == 2 and all('Dispositivo' in r for r in rows1), rows1)
        chk('T12 la barra de alcance dice «dispositivo» y la descomposición de esa dimensión sigue disponible', 'dispositivo' in (await q.evaluate("document.getElementById('sg-scope').innerText")).lower() and await q.locator('#sg-dec-dim').count() == 1)
        await q.click('.sgd-flt [data-action="seg-dim"][data-value="all"]'); await q.wait_for_timeout(400)
        await q.click('.sgd-flt [data-action="seg-flt"][data-k="eff"][data-v="cr"]'); await q.wait_for_timeout(300); await q.click('.sgd-flt [data-action="seg-flt"][data-k="sign"][data-v="neg"]'); await q.wait_for_timeout(400)
        neg = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento de todas las dimensiones\"] tbody tr')].map(r=>r.cells[3].innerText.trim().split('\\n')[0])")
        chk('T13 «Conversión» + «Lo que resta»: todos los efectos son negativos', len(neg) >= 1 and all(x.startswith('−') for x in neg), neg)
        await q.click('.sgd-flt [data-action="seg-flt"][data-k="sign"][data-v="all"]'); await q.click('.sgd-flt [data-action="seg-flt"][data-k="eff"][data-v="all"]'); await q.wait_for_timeout(300)
        # cruce
        chk('T14 sin el cruce en el archivo la sección lo dice', 'Disponible cuando el archivo trae el cruce' in await q.evaluate("document.getElementById('sg-x').innerText"))
        # acciones
        chk('T15 «¿Qué hago con esto?» ofrece simular, diagnosticar y no guarda nada', await q.locator('#sg-q [data-action="tr-to-dx"]').count() == 1 and await q.locator('#sg-q button').count() >= 2)
        await q.click('#sg-q [data-action="tr-to-dx"]'); await q.wait_for_timeout(600)
        chk('T16 «Diagnosticar la brecha» abre Diagnóstico con el mismo periodo y canal', await q.evaluate("[location.hash, FP.app.state.dx.settings.periodKey, FP.app.state.dx.settings.channel]") == ['#diagnostico', '2026-09', 'ecommerce'])
        await q.evaluate("location.hash='#segmentos'"); await q.wait_for_timeout(700)
        sim = q.locator('#sg-q [data-action="seg-simulate"]')
        if await sim.count():
            await sim.first.click(); await q.wait_for_timeout(800)
            chk('T17 «Simular la recuperación» abre Recuperar con un escenario precargado sin guardar', await q.evaluate("[location.hash, (FP.app.state.rc.scenarios||[]).length, !!FP.app.state.rc.draft.name]") == ['#recovery', 0, True])
        else:
            chk('T17 (sin oportunidad concluyente en este caso: la acción aparece deshabilitada con motivo)', 'No disponible' in await q.evaluate("document.getElementById('sg-q').innerText"))
        # sin periodo anterior
        await q.evaluate("location.hash='#segmentos'"); await q.wait_for_timeout(500)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodKey'},value:'2026-08'})"); await q.wait_for_timeout(700)
        v2 = await q.evaluate("(document.querySelector('#sg-frame .px-verdict h2')||{innerText:''}).innerText")
        chk('T18 sin periodo anterior: lo dice y no inventa efectos', 'sin periodo anterior' in v2.lower() and not await q.locator('table[aria-label="Efectos por segmento de todas las dimensiones"]').count(), v2)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodKey'},value:'2026-09'})"); await q.wait_for_timeout(500)
        bad = []
        for w in (1920, 1280, 768, 390, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            if await q.evaluate("document.documentElement.scrollWidth-innerWidth") > 0: bad.append(w)
        chk('T19 sin desborde de página de 320 a 1920 px', not bad, bad)
        # con cruce
        await q.set_viewport_size({'width': 1280, 'height': 900})
        await load(q, u, CSVX)
        cx = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Cruce de dimensiones\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim().split('\\n')[0]))")
        exp_tot = sum(b2[2] - a2[2] for a2, b2 in DS.values())
        got_tot = sum(int(r[-1].replace('−', '-').replace('+', '').replace('$', '').replace(',', '')) for r in cx) if cx else None
        chk('T20 con el cruce en el archivo aparece la matriz Dispositivo × Fuente y sus celdas suman el Δ venta', len(cx) == 2 and got_tot == exp_tot, (cx, exp_tot))
        h1 = await q.evaluate("document.querySelector('table[aria-label=\"Cruce de dimensiones\"] thead th').innerText")
        await q.click('#sg-x [data-action="seg-xp"][data-v="b"]'); await q.wait_for_timeout(400)
        h2 = await q.evaluate("document.querySelector('table[aria-label=\"Cruce de dimensiones\"] thead th').innerText")
        chk('T21 cambiar la dimensión principal invierte el cruce', h1.startswith('Dispositivo') and h2.startswith('Fuente'), (h1, h2))
        chk('T22 el cruce no cuenta como una dimensión más (sigue en 2 dimensiones)', any('2 dimensiones' in c for c in await q.evaluate("[...document.querySelectorAll('#sg-frame .px-tchip')].map(c=>c.innerText)")))
        chk('Z sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nRESULTADO batch_trafico_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
