"""«Exposición» sin oferta desde Qué impulsar. Uso: python3 batch_exposicion.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
async def boot(c):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return q, errs
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        q, errs = await boot(c)
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700)
        await q.evaluate("""(async()=>{
          const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-09-30', skus: 80 });
          const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
          await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
          const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
          await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
        })()""")
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(2500)
        n = await q.evaluate("FP.app.state.op.result.items.filter(i=>i.route.id==='expose').length")
        chk('X1 hay productos en «Exponer»', n > 0, n)
        await q.evaluate("FP.app.state.pm.actor=''; FP.app.state.op.f.route='expose'; FP.app.render()"); await q.wait_for_timeout(300)
        await q.click('[data-action="ex-ask"]'); await q.wait_for_timeout(300)
        chk('X2 sin nombre avisa y no abre la confirmación', 'Escribe tu nombre' in await body(q) and not await q.query_selector('[data-action="ex-confirm"]'))
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()"); await q.wait_for_timeout(200)
        await q.click('[data-action="ex-ask"]'); await q.wait_for_timeout(300)
        t = await body(q)
        chk('X3 pide fechas opcionales y explica que no cuenta como oferta', 'sin oferta de descuento' in t and 'no cuenta en el descuento promedio' in t and await q.query_selector('#ex-start') is not None, t[:300])
        await q.fill('#ex-start', '2026-11-10'); await q.fill('#ex-end', '2026-11-01')
        await q.click('[data-action="ex-confirm"]'); await q.wait_for_timeout(300)
        chk('X4 fechas invertidas: avisa y no guarda', 'anterior a la de inicio' in await body(q) and await q.evaluate("FP.app.state.ex.reg.items.length")==0)
        await q.fill('#ex-end', '2026-11-20'); chk('X4b las fechas escritas se conservan tras el aviso', await q.evaluate("document.getElementById('ex-start').value")=='2026-11-10')
        await q.click('[data-action="ex-confirm"]'); await q.wait_for_timeout(400)
        k = await q.evaluate("FP.app.state.ex.reg.items.length")
        chk('X5 quedan en exposición, una por SKU', k == n and await q.evaluate("FP.app.state.ex.reg.items.every(e=>e.state==='active'&&e.createdBy==='Persona A'&&e.start==='2026-11-10'&&e.end==='2026-11-20')"), (k, n))
        chk('X6 no son ofertas: el registro de ofertas sigue igual', await q.evaluate("FP.app.state.of.reg.offers.length")==0)
        chk('X7 la fila muestra «Exposición»', 'Exposición' in await body(q))
        chk('X8 los ya expuestos no se vuelven a proponer', await q.evaluate("FP.opportunityView.exposurePlan(FP.app.state.op, FP.app.state).ok.length")==0)
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.wait_for_timeout(400)
        chk('X9 Ofertas y plan muestra el panel de exposición', f'Exposición sin oferta · ' in await body(q))
        await q.click('[data-action="of-fold"][data-fold="exposures"]'); await q.wait_for_timeout(300)
        chk('X10 la lista muestra folio, fechas y quién', 'E-00001' in await body(q) and '2026-11-10' in await body(q) and 'Persona A' in await body(q))
        await q.click('[data-action="ex-remove"]'); await q.wait_for_timeout(300)
        chk('X11 se puede quitar y queda registrado', await q.evaluate("FP.app.state.ex.reg.items.filter(e=>e.state==='removed').length")==1)
        # Medición en Resultados e historial: exposición con fechas dentro de la venta cargada
        await q.evaluate("FP.app.state.pm.actor='Persona A'")
        await q.evaluate("FP.app.state.ex.reg.items.forEach(e=>{e.state='active';e.start='2026-09-10';e.end='2026-09-25'})")
        await q.click('[data-action="pm-tab"][data-tab="resultados"]'); await q.wait_for_timeout(400)
        t = await body(q)
        chk('X13 Resultados muestra «Medir una exposición»', 'Medir una exposición' in t, t[:200])
        await q.select_option('#rs-ex-batch', 'EXP-0001'); await q.wait_for_timeout(200)
        await q.click('[data-action="rs-ex-run"]'); await q.wait_for_timeout(2500)
        r = await q.evaluate("FP.app.state.rs.ex.result ? [FP.app.state.rs.ex.result.counts.total, FP.app.state.rs.ex.result.counts.evaluable] : null")
        chk('X14 calcula la medición de los SKU del folio', r is not None and r[0] > 0, r)
        t = await body(q)
        chk('X15 dice que es estimado, que no es promoción y que no demuestra causalidad', 'No demostrado' in t and 'no es una promoción' in t.lower() and 'Venta incremental estimada' in t, t[-600:])
        await q.click('[data-action="rs-ex-save"]'); await q.wait_for_timeout(300)
        chk('X17 guarda un corte con quién y cuándo', await q.evaluate("FP.app.state.ex.reg.cuts.length")==1 and 'EXC-0001' in await body(q))
        await q.click('[data-action="pm-tab"][data-tab="promos"]'); await q.wait_for_timeout(400)
        t = await body(q)
        chk('X18 Promociones muestra «Exposición sin oferta» con el folio y su corte', 'Exposición sin oferta (1)' in t and 'EXP-0001' in t and '1 corte guardado' in t, t[:300])
        await q.click('[data-action="pm-ex-measure"]'); await q.wait_for_timeout(2500)
        chk('X19 «Medir» abre Resultados con el folio ya medido y sus cortes', 'Cortes guardados de EXP-0001' in await body(q) and await q.evaluate("!!FP.app.state.rs.ex.result"))
        errs2 = [e for e in errs if 'ResizeObserver' not in e]
        chk('X16 sin errores de página', not errs2, errs2)
        await b.close()
    print('\n%d fallas' % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
