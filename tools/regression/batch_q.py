"""Fase 11 · pieza 1 (opción A): venta por categoría, producto y región en el Diagnóstico. Uso: python3 batch_q.py <raiz>
Q-1 sin datos de Producto: la sección invita a cargarlos y «no disponible» sigue listando Categoría, Producto y Geografía.
Q-2 con datos: tres tablas (Categoría, Producto, Región) con venta, referencia, Δ venta, contribución, CR del embudo y AOV; la nota aclara
    la comparación (sin plan por producto → periodo anterior) y que el CR del embudo no es el CR por sesiones.
Q-3 las cifras son las del motor de Categoría → Producto para ese periodo y canal (misma llamada que la vista Producto).
Q-4 no cambia la selección de la vista Producto ni el árbol volumen × CR × AOV; al cambiar canal en Diagnóstico la sección se recalcula."""
import asyncio, sys, os, json, threading, functools, http.server, socketserver
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
SEC = """()=>{const p=document.getElementById('dx-products-panel');const el=document.getElementById('dx-products');
 const tbl=[...el.querySelectorAll('table')].map(t=>({title:(t.closest('.table-wrap').previousElementSibling||{innerText:''}).innerText,head:[...t.tHead.rows[0].cells].map(c=>c.innerText.trim()),rows:[...t.tBodies[0].rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))}));
 const notd=(document.getElementById('dx-tree').innerText.match(/No disponible en los datos actuales:([^.]*)/)||['',''])[1];
 return {hidden:p.hidden,text:el.innerText.replace(/\\s+/g,' '),tbl,notd}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(1200)
        a = await q.evaluate(SEC)
        chk('Q-1 sin datos de Producto: la sección invita a cargarlos (con enlace) y «no disponible» sigue listando Categoría, Producto y Geografía', not a['hidden'] and 'Con datos de Categoría → Producto cargados' in a['text'] and all(x in a['notd'] for x in ('Categoría', 'Producto', 'Geografía')), (a['text'][:160], a['notd']))
        # cargar productos (archivo generado de la vista Producto)
        await q.goto(u + '#producto'); await q.wait_for_timeout(500); await q.click('[data-action="p-mock"]'); await q.wait_for_timeout(700)
        for k in (1, 2):
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=90000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function(f"document.querySelectorAll('#view-carga .staging__head').length === {2 - k}", timeout=180000)
        await q.goto(u + '#producto'); await q.wait_for_selector('#pa-table table', timeout=90000); await q.wait_for_timeout(500)
        pa0 = await q.evaluate("[FP.app.state.pa.from, FP.app.state.pa.to, FP.app.state.pa.channel, FP.app.state.pa.comparison]")
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        await q.wait_for_function("FP.app.state.dx.products && FP.app.state.dx.products.result && !FP.app.state.dx.products.loading", timeout=90000); await q.wait_for_timeout(400)
        a = await q.evaluate(SEC)
        heads = [t['head'] for t in a['tbl']]
        chk('Q-2 con datos: tres tablas (Categoría, Producto, Región) con venta, referencia, Δ venta, contribución, CR del embudo y AOV', len(a['tbl']) == 3 and [h[0] for h in heads] == ['Categoría', 'Producto', 'Región'] and all(h[1:] == ['Venta', 'Referencia', 'Δ venta', 'Contribución', 'CR del embudo', 'AOV'] for h in heads) and all(len(t['rows']) >= 1 for t in a['tbl']), heads)
        chk('Q-2 la nota explica la comparación (sin plan por producto se compara contra el periodo anterior) y que el CR del embudo no es el CR por sesiones', 'No existe plan por producto' in a['text'] and 'no es el CR por sesiones' in a['text'], a['text'][:400])
        chk('Q-2 «no disponible» ya no lista Categoría, Producto ni Geografía', not any(x in a['notd'] for x in ('Categoría', 'Producto', 'Geografía')), a['notd'])
        ref = await q.evaluate("""async()=>{const d=FP.app.state.dx.run;const x=FP.productAnalysis.fromDiagnosis(d);const r=await FP.productAnalysis.run({from:x.from,to:x.to,comparison:x.comparison,channel:x.channel,level:'category',withGeoSignals:false});
          const top=r.rows.filter(z=>!/^\\(/.test(z.key))[0];return {key:top.key,cur:Math.round(top.revenue.current),delta:Math.round(top.revenue.delta),contrib:top.contribution,from:x.from,to:x.to}}""")
        row = a['tbl'][0]['rows'][0]
        cur = int(row[1].replace('$', '').replace(',', '')); dl = row[3].split(' ')[0]
        sign = -1 if dl.startswith('−') else 1; delta = sign * int(dl.lstrip('+−').replace('$', '').replace(',', ''))
        chk('Q-3 la fila principal de Categoría coincide con el motor de Categoría → Producto para ese periodo y canal (venta y Δ venta)', row[0] == ref['key'] and abs(cur - ref['cur']) <= 1 and abs(delta - ref['delta']) <= 1, (row, ref))
        pa1 = await q.evaluate("[FP.app.state.pa.from, FP.app.state.pa.to, FP.app.state.pa.channel, FP.app.state.pa.comparison]")
        chk('Q-4 no cambia la selección de la vista Producto', pa0 == pa1, (pa0, pa1))
        tree = await q.evaluate("[...document.querySelectorAll('#dx-tree details.driver-node summary strong')].map(s=>s.innerText)")
        chk('Q-4 el árbol volumen × CR × AOV sigue igual (Volumen, CR, AOV)', tree == ['Volumen', 'CR', 'AOV'], tree)
        await q.select_option('#dx-ch', 'app'); await q.wait_for_timeout(500)
        await q.wait_for_function("FP.app.state.dx.products && FP.app.state.dx.products.result && FP.app.state.dx.products.result.channel==='app' && !FP.app.state.dx.products.loading", timeout=90000)
        chk('Q-4 al cambiar el canal en Diagnóstico (App), la sección se recalcula para ese canal', await q.evaluate("FP.app.state.dx.products.result.channel") == 'app')
        for w in (390, 768):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(300)
            ov = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
            if ov > 0: chk(f'Q-2 sin desborde de la página a {w}px', False, ov)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_q:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
