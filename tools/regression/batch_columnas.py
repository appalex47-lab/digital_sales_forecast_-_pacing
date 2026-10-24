"""Calidad por columna de Productos (venta): niveles obligatoria / importante / opcional, llenado por columna, tabla en Calidad de datos y en la carga.
Uso: python3 batch_columnas.py <raiz>. Datos con resultado conocido: 20 filas; marca vacía en 5, estado vacío en 10, sin columna de ciudad."""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
def csv(with_order=True):
    h = 'fecha,canal,sku,producto,marca,categoria,estado,venta,pedidos,unidades,id_cliente' + (',id_pedido' if with_order else '')
    rows = [h]
    for i in range(20):
        brand = '' if i < 5 else f'Marca{i % 3}'; st = '' if i % 2 == 0 else 'Jalisco'
        rows.append(f'2026-09-{1 + i:02d},{["ecommerce", "app"][i % 2]},SKU{i:03d},Producto {i},{brand},Cat {i % 3},{st},{500 + i},{1 + i % 3},{2 + i % 4},C{i % 7}' + (f',P{i}' if with_order else ''))
    return '\n'.join(rows) + '\n'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        sel = 'input[data-action="pick-files"][data-type="products"]'
        # 1) sin ID de pedido: no se puede cargar y se dice cuál falta
        await q.goto(u + '#carga'); await q.wait_for_selector(sel, state='attached')
        await q.set_input_files(sel, files=[{'name': 'sin_pedido.csv', 'mimeType': 'text/csv', 'buffer': csv(False).encode()}])
        await q.wait_for_selector('.staging__head', timeout=30000); await q.wait_for_timeout(1500)
        r = await q.evaluate("({dis:document.querySelector('[data-action=\"commit-staged\"]').disabled,txt:document.querySelector('#view-carga').innerText})")
        chk('C1 sin ID de pedido la carga queda bloqueada y dice que falta la columna obligatoria', r['dis'] is True and 'ID de pedido' in r['txt'] and 'obligatoria' in r['txt'], r['txt'][:300])
        await q.click('[data-action="discard-staged"]'); await q.wait_for_timeout(500)
        # 2) con todo lo obligatorio: se muestra la calidad de columnas antes de guardar
        await q.set_input_files(sel, files=[{'name': 'completo.csv', 'mimeType': 'text/csv', 'buffer': csv().encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
        st = await q.evaluate("""(()=>{const t=document.querySelector('#view-carga [data-block=columns-quality]');if(!t)return null;const o={};t.querySelectorAll('tbody tr').forEach(r=>{o[r.dataset.col]=[r.dataset.tier,r.cells[2].innerText.trim()]});return {o,score:(document.querySelector('[data-columns-score]')||{}).dataset}})()""")
        chk('C2 antes de guardar se ve la calidad por columna con su nivel y su porcentaje de llenado', bool(st) and st['o']['brand'] == ['important', '75 %'] and st['o']['state'] == ['important', '50 %'] and st['o']['orderId'] == ['required', '100 %'] and st['o']['city'][1] == 'Sin cargar', st)
        await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(800)
        # 3) Calidad de datos: componente «Columnas», puntaje y tabla
        await q.goto(u + '#calidad'); await q.evaluate("FP.qualityView && FP.qualityView.openAll && FP.qualityView.openAll()"); await q.wait_for_selector('#quality-health .dhealth__card', timeout=30000); await q.wait_for_timeout(800)
        cerrada = await q.evaluate("(()=>{const d=document.querySelector('#quality-health [data-block=columns-quality]');return d?!d.open:null})()")
        chk('C3a en Calidad de datos «Calidad por columna» inicia cerrada (el detalle se abre a voluntad)', cerrada is True, cerrada)
        await q.evaluate("document.querySelectorAll('#quality-health [data-block=columns-quality]').forEach(d=>d.open=true)"); await q.wait_for_timeout(200)
        h = await q.evaluate("""(()=>{const c=[...document.querySelectorAll('#quality-health .dhealth__card')].find(x=>/Productos · venta/.test(x.innerText));if(!c)return null;
          const rows={};c.querySelectorAll('[data-block=columns-quality] tbody tr').forEach(r=>{rows[r.dataset.col]=[r.cells[1].innerText.trim(),r.cells[2].innerText.trim(),r.cells[3].innerText.trim()]});
          return {txt:c.innerText,rows,comp:/Columnas/.test(c.innerText)}})()""")
        chk('C3 Calidad de datos trae el componente «Columnas» en Productos · venta', bool(h) and h['comp'], h and h['txt'][:300])
        chk('C4 la tabla por columna dice el nivel, el llenado y qué se pierde (marca 75 %, estado 50 %, ciudad sin cargar)', bool(h) and h['rows']['brand'][:2] == ['Importante', '75 %'] and h['rows']['state'][1] == '50 %' and h['rows']['city'][0] == 'Opcional' and 'ciudad' in h['rows']['city'][2].lower() and 'geográfico' in h['rows']['state'][2], h and h['rows'])
        ov = await q.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        chk('C5 sin desborde horizontal en Calidad de datos', ov is False)
        chk('C6 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_columnas:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
