"""Reemplazo de archivos ya cargados (venta real y productos): comparación, reglas de confirmación, deshacer, umbrales en Ajustes.
Uso: python3 batch_reemplazo.py <raiz>. Datos con resultado conocido (venta real: 10 días ecommerce 1001..1010)."""
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
def real(days, mult=1.0):
    return ('fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'2026-09-{d:02d},ecommerce,{round((1000 + d) * mult, 2)},10,100' for d in range(1, days + 1)) + '\n').encode()
def prods(n, mult=1.0):
    h = 'fecha,canal,sku,producto,categoria,venta,pedidos,unidades,id_pedido,id_cliente'
    return (h + '\n' + '\n'.join(f'2026-09-{1 + i:02d},ecommerce,SKU{i:03d},Producto {i},Cat {i % 3},{round((500 + i) * mult, 2)},1,2,P{i},C{i % 7}' for i in range(n)) + '\n').encode()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        A = 'input[data-action="pick-files"][data-type="actual"]'; P = 'input[data-action="pick-files"][data-type="products"]'
        async def stage(sel, name, buf):
            n0 = await q.evaluate("FP.app.state.staging.items.length")
            await q.set_input_files(sel, files=[{'name': name, 'mimeType': 'text/csv', 'buffer': buf}])
            await q.wait_for_function(f"FP.app.state.staging.items.length > {n0} && document.querySelector('[data-action=\"commit-staged\"]')", timeout=60000); await q.wait_for_timeout(700)
        async def commit():
            await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(600)
        st = "FP.app.state.store.actual"
        await q.goto(u + '#carga'); await q.wait_for_selector(A, state='attached')
        await stage(A, 'v1.csv', real(10)); await commit()
        # R1: v2 con 2 días más; se elige reemplazar v1
        await stage(A, 'v2.csv', real(12))
        opts = await q.evaluate("[...document.querySelectorAll('#rep-pick option')].map(o=>o.value+'|'+o.textContent)")
        chk('R1 al cargar un archivo suelto se ofrece reemplazar uno ya cargado (por omisión ninguno)', len(opts) == 2 and opts[0].startswith('|') and 'v1.csv' in opts[1] and await q.evaluate("document.querySelector('#rep-pick').value") == '', opts)
        val = await q.evaluate("document.querySelector('#rep-pick option:nth-child(2)').value")
        await q.select_option('#rep-pick', val); await q.wait_for_timeout(500)
        d = await q.evaluate("({diff:(document.querySelector('[data-replace-diff]')||{}).innerText||'',ok:!!document.querySelector('[data-replace-ok]'),flags:!!document.querySelector('[data-replace-flags]'),dis:document.querySelector('[data-action=\"commit-staged\"]').disabled})")
        chk('R2 resumen de cambios: 2 nuevas, 0 modificadas, 0 quitadas, 10 iguales; sin alertas y se puede importar', '2 filas nuevas' in d['diff'] and '0 con valores modificados' in d['diff'] and '0 filas que ya no vienen' in d['diff'] and '10 iguales' in d['diff'] and d['ok'] and not d['flags'] and d['dis'] is False, d)
        await commit()
        r = await q.evaluate(f"({{b:{st}.batches.map(x=>x.fileName),n:{st}.records.length,undo:!!document.querySelector('[data-replace-undo]')}})")
        chk('R3 reemplazar quita v1 y deja v2 (12 filas); aparece «Deshacer»', r['b'] == ['v2.csv'] and r['n'] == 12 and r['undo'], r)
        await q.click('[data-action="replace-undo"]'); await q.wait_for_timeout(700)
        r = await q.evaluate(f"({{b:{st}.batches.map(x=>x.fileName),n:{st}.records.length,undo:!!document.querySelector('[data-replace-undo]')}})")
        chk('R4 deshacer devuelve v1 (10 filas) y quita v2', r['b'] == ['v1.csv'] and r['n'] == 10 and not r['undo'], r)
        # R5: v3 con 9 días: pierde el último día → pide confirmación; no importa hasta confirmar
        await stage(A, 'v3.csv', real(9))
        val = await q.evaluate("document.querySelector('#rep-pick option:nth-child(2)').value"); await q.select_option('#rep-pick', val); await q.wait_for_timeout(500)
        d = await q.evaluate("({fl:(document.querySelector('[data-replace-flags]')||{}).innerText||'',dis:document.querySelector('[data-action=\"commit-staged\"]').disabled})")
        chk('R5 si el periodo se acorta (aunque sea 1 día) pide confirmar y bloquea el botón', 'periodo se acorta' in d['fl'] and d['dis'] is True, d)
        await q.check('[data-action="replace-confirm"]'); await q.wait_for_timeout(400)
        chk('R6 al confirmar se habilita importar', await q.evaluate("document.querySelector('[data-action=\"commit-staged\"]').disabled") is False)
        await commit()
        r = await q.evaluate(f"({{b:{st}.batches.map(x=>x.fileName),n:{st}.records.length}})")
        chk('R7 tras confirmar, v3 reemplaza a v1 (9 filas)', r['b'] == ['v3.csv'] and r['n'] == 9, r)
        # R8: venta +6 % en los mismos días → regla de venta; con umbral 10 % ya no
        await stage(A, 'v4.csv', real(9, 1.06))
        val = await q.evaluate("document.querySelector('#rep-pick option:nth-child(2)').value"); await q.select_option('#rep-pick', val); await q.wait_for_timeout(500)
        d = await q.evaluate("({fl:(document.querySelector('[data-replace-flags]')||{}).innerText||'',diff:document.querySelector('[data-replace-diff]').innerText})")
        chk('R8 venta +6 % en los días en común pide confirmación y el resumen cuenta 9 modificadas', 'cambia +6' in d['fl'] and '9 con valores modificados' in d['diff'], d)
        await q.evaluate("(()=>{const s=FP.app.state.settings;s.replaceRevenuePct=10;FP.app.state.staging.items.forEach(i=>{i._rp=null});})()")
        await q.evaluate("document.querySelector('#rep-pick').dispatchEvent(new Event('change',{bubbles:true}))"); await q.wait_for_timeout(500)
        d = await q.evaluate("({ok:!!document.querySelector('[data-replace-ok]'),th:FP.app.state.settings.replaceRevenuePct})")
        chk('R9 el umbral de venta es ajustable (10 %: +6 % ya no pide confirmación)', d['ok'] is True and d['th'] == 10, d)
        # R10: sin elegir reemplazo se agrega como siempre; Ajustes tiene los dos umbrales
        await q.select_option('#rep-pick', ''); await q.wait_for_timeout(300)
        await commit()
        r = await q.evaluate(f"{st}.batches.map(x=>x.fileName)")
        chk('R10 sin elegir reemplazo, el archivo se agrega (v3 y v4 conviven)', r == ['v3.csv', 'v4.csv'], r)
        t = await q.evaluate("({a:!!document.querySelector('#set-rep-rows'),b:!!document.querySelector('#set-rep-rev')})")
        chk('R11 los dos umbrales se pueden ajustar en la pantalla de carga (Ajustes de importación)', t['a'] and t['b'], t)
        # R12: «Actualizar» de una hoja: el archivo anterior con el mismo nombre queda elegido
        await stage(A, 'v3.csv', real(9))
        dflt = await q.evaluate(f"(()=>{{const it=FP.app.state.staging.items[FP.app.state.staging.items.length-1];return {{def:FP.replaceView.defaultFor(FP.app.state,it),id:{st}.batches.find(x=>x.fileName==='v3.csv').id}}}})()")
        chk('R12 el archivo anterior con el mismo nombre es el que se reemplaza por omisión (caso Google Sheets)', dflt['def'] == dflt['id'], dflt)
        await q.click('[data-action="discard-staged"]'); await q.wait_for_timeout(300)
        # Productos
        await stage(P, 'prod1.csv', prods(20)); await commit()
        await stage(P, 'prod2.csv', prods(12))
        val = await q.evaluate("document.querySelector('#rep-pick option:nth-child(2)').value"); await q.select_option('#rep-pick', val); await q.wait_for_timeout(500)
        d = await q.evaluate("({fl:(document.querySelector('[data-replace-flags]')||{}).innerText||'',dis:document.querySelector('[data-action=\"commit-staged\"]').disabled,diff:(document.querySelector('[data-replace-diff]')||{}).innerText||''})")
        chk('R13 productos: 12 de 20 filas (−40 %) y periodo más corto piden confirmación', 'menos filas' in d['fl'] and 'periodo se acorta' in d['fl'] and d['dis'] is True and 'Antes: 20' in d['diff'], d)
        await q.check('[data-action="replace-confirm"]'); await q.wait_for_timeout(300)
        await commit()
        r = await q.evaluate("FP.productStore.listBatches().then(l=>l.map(x=>x.fileName))")
        chk('R14 productos: prod2 reemplaza a prod1 (solo queda prod2)', r == ['prod2.csv'], r)
        # R16: archivo grande (Worker): no se puede comparar → pide confirmar; al confirmar reemplaza y se puede deshacer
        await q.evaluate("FP.importWorker.setMinBytes(50)")
        before = await q.evaluate(f"{st}.batches.map(x=>x.fileName)")
        await stage(A, 'w1.csv', real(9))
        rem = await q.evaluate("!!FP.app.state.staging.items[FP.app.state.staging.items.length-1].remote")
        val = await q.evaluate("document.querySelector('#rep-pick option:nth-child(2)').value"); await q.select_option('#rep-pick', val); await q.wait_for_timeout(500)
        d = await q.evaluate("({fl:(document.querySelector('[data-replace-flags]')||{}).innerText||'',dis:document.querySelector('[data-action=\"commit-staged\"]').disabled})")
        chk('R16 archivo grande (Worker): avisa que no se puede comparar y bloquea hasta confirmar', rem and 'muy grande' in d['fl'] and d['dis'] is True, [rem, d])
        await q.check('[data-action="replace-confirm"]'); await q.wait_for_timeout(300)
        await commit()
        after = await q.evaluate(f"({{b:{st}.batches.map(x=>x.fileName),undo:!!document.querySelector('[data-replace-undo]')}})")
        gone = [x for x in before if x not in after['b']]
        chk('R17 archivo grande: reemplazó exactamente un archivo anterior y se puede deshacer', len(gone) == 1 and 'w1.csv' in after['b'] and after['undo'], [before, after])
        chk('R15 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_reemplazo:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
