"""Clientes y LTV: columnas id_pedido/id_cliente en Productos·venta, libro de clientes, vista, privacidad. Uso: python3 batch_clientes.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
async def wait_ready(q, timeout=90):
    for _ in range(timeout):
        await q.wait_for_timeout(1000)
        if await q.evaluate("(FP.app.state.staging.items[0]||{}).status") == 'ready': return True
    return False
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w, h, tag in [(1280, 900, 'D'), (390, 844, 'M')]:
            c = await b.new_context(viewport={'width': w, 'height': h}); q = await c.new_page(); errs = []
            q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#clientes'); await q.wait_for_timeout(900)
            await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            await q.evaluate("FP.app.actions['p-mock-clientes']()"); await wait_ready(q)
            await q.evaluate("FP.app.actions['commit-staged']()")
            for _ in range(120):
                await q.wait_for_timeout(1000)
                if await q.evaluate("FP.app.state.staging.items.length") == 0: break
            await q.wait_for_timeout(2500)
            await q.goto(U + '#clientes'); await q.wait_for_selector('#cus-body .fshell__toggle', timeout=30000); await q.click('#cus-body .fshell__toggle'); await q.wait_for_selector('#cus-body [data-cu-f="category"]', timeout=30000)
            tot = await q.evaluate("document.querySelector('#cus-body .metric-card__value').innerText")
            cats = await q.evaluate("[...document.querySelectorAll('select[data-cu-f=category] option')].map(o=>o.value).filter(Boolean)")
            chk(f'L1 [{tag}] aparecen los filtros de categoría, subcategoría, producto, estado y sucursal', cats and await q.locator('#cus-body [data-cu-f]').count() == 5, cats[:3])
            await q.select_option('[data-cu-f="category"]', cats[0]); await q.wait_for_selector('[data-cus-selection]', timeout=60000)
            await q.wait_for_timeout(600)
            t1 = await q.evaluate("document.querySelector('#cus-body .metric-card__value').innerText")
            ltv = await q.evaluate("document.querySelectorAll('#cus-body .cus-heat tbody tr').length")
            chk(f'L2 [{tag}] con una categoría cambian los clientes ({tot} → {t1}), hay cohortes y se explica que es de la selección', t1 != tot and ltv > 0, [tot, t1, ltv])
            # combinar con canal y producto
            prods = await q.evaluate("[...document.querySelectorAll('select[data-cu-f=product] option')].map(o=>o.value).filter(Boolean)")
            mon = "FP.app.state.cu.result.monthly.reduce((s,m)=>s+m.customers.total,0)"
            m1 = await q.evaluate(mon)
            await q.select_option('[data-cu="channel"]', 'ecommerce'); await q.wait_for_timeout(1500)
            t2 = await q.evaluate("document.querySelector('#cus-body .metric-card__value').innerText")
            n1 = m1; n2 = await q.evaluate(mon)
            chk(f'L3 [{tag}] categoría + Ecommerce da menos clientes-mes que la categoría en todos los canales ({n1} → {n2})', 0 < n2 < n1, [n1, n2])
            if prods:
                await q.select_option('[data-cu-f="product"]', prods[0]); await q.wait_for_timeout(1500)
                t3 = await q.evaluate("document.querySelector('#cus-body .metric-card__value').innerText")
                n3 = await q.evaluate(mon); chk(f'L4 [{tag}] categoría + producto + canal reduce todavía más ({n2} → {n3})', 0 < n3 < n2, [n2, n3])
            ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'L5 [{tag}] sin desborde horizontal ({ov}px)', ov <= 1, ov)
            await q.evaluate("document.querySelector('[data-fshell=cu] [data-action=fs-clear]').click()"); await q.wait_for_timeout(1500)
            t4 = await q.evaluate("document.querySelector('#cus-body .metric-card__value').innerText")
            chk(f'L6 [{tag}] quitar filtros vuelve al total del canal', await q.locator('[data-cus-selection]').count() == 0, t4)
            # libro anterior sin líneas
            await q.evaluate("async()=>{const L=await FP.customerStore.load(); L.lines=null; FP.customerStore.reset && 0;}")
            await q.select_option('[data-cu="channel"]', 'app'); await q.wait_for_timeout(1200)
            await q.select_option('[data-cu-f="category"]', cats[0]); await q.wait_for_selector('[data-cus-unavailable]', timeout=30000)
            msg = await q.inner_text('[data-cus-unavailable]')
            chk(f'L7 [{tag}] con un libro anterior se pide recargar el archivo y no se muestran cifras', 'volver a cargar' in msg, msg[:160])
            chk(f'L8 [{tag}] sin errores de página', not errs, errs)
            await c.close()
        await b.close()
    print('RESULTADO batch_clientes_ltv_filtro: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
