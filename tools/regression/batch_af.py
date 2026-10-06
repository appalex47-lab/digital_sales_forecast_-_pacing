"""Cuarentena de Productos unificada con el catálogo de la Fase A. Uso: python3 batch_af.py <raiz>
AF-1 los valores negativos o no numéricos de un archivo de Productos aparecen en Calidad de datos → Cuarentena (archivo, fila, campo, valor original, regla), con el conteo EXACTO por regla.
AF-2 el Registro de importaciones lista el archivo de Productos (tipo, recibidas, aceptadas, en cuarentena, rechazadas, columnas usadas).
AF-3 la Salud de los datos trae la tarjeta «Productos · venta» con los mismos componentes, y el detalle dice cuántas celdas están en cuarentena.
AF-4 todo sigue ahí tras recargar la página; al quitar el archivo desaparece.
AF-5 las demás secciones no cambian (la Cuarentena de Venta real sigue funcionando junto a la de Productos)."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:300] if d and not ok else ''))
    if not ok: fails.append(n)
def products():
    rows = ['fecha,canal,sku,producto,categoria,venta,pedidos,unidades']
    exp = []   # (fila del archivo, campo, valor original, regla)
    for i in range(60):
        line = i + 2; d = f'2026-09-{1 + i % 20:02d}'; ch = ['ecommerce', 'app'][i % 2]; sku = f'SKU{i:03d}'
        venta, ped, uni = str(500 + i), str(2 + i % 3), str(3 + i % 4)
        if i == 7: venta = '-250'; exp.append((line, 'revenue', '-250', 'NEGATIVE_REVENUE'))
        if i == 19: venta = '-10'; exp.append((line, 'revenue', '-10', 'NEGATIVE_REVENUE'))
        if i == 23: uni = 'abc'; exp.append((line, 'units', 'abc', 'INVALID_UNITS'))
        if i == 41: ped = '-3'; exp.append((line, 'orders', '-3', 'NEGATIVE_ORDERS'))
        rows.append(f'{d},{ch},{sku},Producto {i},Cat {i % 4},{venta},{ped},{uni}')
    rows.append('2026-13-45,ecommerce,SKUBAD,Malo,Cat 1,100,1,1')   # fecha inválida → fila rechazada
    return '\n'.join(rows) + '\n', exp
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="products"]', state='attached')
        text, exp = products()
        await q.set_input_files('input[data-action="pick-files"][data-type="products"]', files=[{'name': 'productos.csv', 'mimeType': 'text/csv', 'buffer': text.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=90000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=90000); await q.wait_for_timeout(600)
        # una venta real con un negativo, para comprobar que conviven las dos cuarentenas
        await q.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': 'real.csv', 'mimeType': 'text/csv', 'buffer': ('fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'2026-09-{d:02d},ecommerce,{"-500" if d == 3 else 1000 + d},10,100' for d in range(1, 11)) + '\n').encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(400)
        await q.goto(u + '#calidad'); await q.wait_for_selector('table[aria-label="Valores en cuarentena"]', timeout=20000)
        TABLE = "[...document.querySelectorAll('table[aria-label=\"Valores en cuarentena\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()))"
        rows = await q.evaluate(TABLE); head = await q.evaluate("document.getElementById('quality-quarantine').innerText")
        prod = sorted((r[1], r[4], r[5], r[6].split('\n')[0]) for r in rows if r[0] == 'productos.csv')
        # la MISMA regla se llama igual en todas las secciones (catálogo de la Fase A); las de Productos que no existían allí usan «Métrica: valor …»
        label = {'NEGATIVE_REVENUE': 'Venta negativa', 'INVALID_UNITS': 'Unidades: valor no numérico', 'NEGATIVE_ORDERS': 'Pedidos negativos'}
        expected = sorted((str(l), {'revenue': 'Venta', 'units': 'Unidades', 'orders': 'Pedidos'}[f], v, label[rule]) for l, f, v, rule in exp)
        chk('AF-1 Cuarentena lista los 4 valores de Productos con archivo, fila, campo, valor original y regla (calculados aparte del archivo)', prod == expected, (prod, expected))
        chk('AF-1 el encabezado da el conteo EXACTO por regla y suma lo de las dos secciones («Venta negativa (3)» = 2 de Productos + 1 de Venta real; «Unidades: valor no numérico (1)»; «Pedidos negativos (1)»)', 'Venta negativa (3)' in head and 'Unidades: valor no numérico (1)' in head and 'Pedidos negativos (1)' in head and head.startswith('5 valores en cuarentena'), head[:300])
        chk('AF-5 el valor negativo de Venta real sigue en la lista, junto a los de Productos', any(r[0] == 'real.csv' and r[5] == '-500' for r in rows), rows[:6])
        log = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Registro de importaciones\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim()))")
        pl = [r for r in log if r[1] == 'productos.csv']
        chk('AF-2 el Registro de importaciones lista el archivo de Productos: tipo «Productos · venta», 61 recibidas, 60 aceptadas, 4 en cuarentena, 1 rechazada', len(pl) == 1 and pl[0][2] == 'Productos · venta' and pl[0][4:8] == ['61', '60', '4', '1'], pl)
        hv = await q.evaluate("(()=>{const cards=[...document.querySelectorAll('#quality-health .dhealth__card')].map(c=>c.innerText.replace(/\\s+/g,' '));return cards})()")
        pc = [x for x in hv if x.startswith('Productos · venta')]
        chk('AF-3 la Salud trae la tarjeta «Productos · venta» con «Tipos» bajando puntos por las 4 celdas en cuarentena y «Estructura» por la fila rechazada', len(pc) == 1 and '4 celdas en cuarentena' in pc[0] and 'Tipos' in pc[0] and '1 fila rechazada' in pc[0] and '/100' in pc[0], pc)
        score = await q.evaluate("FP.dataHealth.products(FP.app.state.productQuality)[0].score")
        chk('AF-3 el puntaje de Productos es menor que 100 con incidencias (nunca 100 si algo bajó puntos)', 0 < score < 100, score)
        # persistencia
        await q.reload(); await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.app.state.productQuality && FP.app.state.productQuality.length > 0", timeout=30000)
        await q.goto(u + '#calidad'); await q.wait_for_selector('table[aria-label="Valores en cuarentena"]', timeout=20000)
        head2 = await q.evaluate("document.getElementById('quality-quarantine').innerText")
        chk('AF-4 al recargar la página la cuarentena de Productos sigue (lo lee de IndexedDB)', 'Venta negativa (3)' in head2 and 'Unidades: valor no numérico (1)' in head2, head2[:200])
        # quitar el archivo de Productos
        await q.evaluate("window.confirm=()=>true")
        bid = await q.evaluate("FP.app.state.productQuality[0].id")
        await q.evaluate(f"FP.app.actions['remove-product-batch']({{dataset:{{id:'{bid}'}}}})"); await q.wait_for_function("FP.app.state.productQuality.length === 0", timeout=30000)
        await q.goto(u + '#calidad'); await q.wait_for_timeout(500)
        head3 = await q.evaluate("document.getElementById('quality-quarantine').innerText")
        chk('AF-4 al quitar el archivo de Productos desaparece de la cuarentena (queda solo el de Venta real)', 'Unidades' not in head3 and head3.startswith('1 valor en cuarentena'), head3[:200])
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_af:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
