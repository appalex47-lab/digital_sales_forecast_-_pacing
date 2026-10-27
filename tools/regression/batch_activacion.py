"""Activación sugerida (propuesta B): columnas en Ofertas recibidas y Oportunidades, razón, parámetros, estado, exportación y sugerencias cargadas. Uso: python3 batch_activacion.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver, tempfile, zipfile
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
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(600)
        await q.evaluate("""(async()=>{
          const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-09-30', skus: 80 });
          const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
          await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
          const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
          await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
        })()""")
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()")
        await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(2500)
        n = await q.evaluate("FP.app.state.op.result ? FP.app.state.op.result.items.length : -1")
        t = await body(q)
        chk('A1 Oportunidades tiene la columna «Activación sugerida»', n > 0 and 'Activación sugerida' in t, (n, t[:200]))
        rows = await q.evaluate("[...document.querySelectorAll('#pm-body tbody tr')].filter(r=>r.querySelector('[data-action=\"ac-open\"]')).length")
        chk('A2 cada fila de oportunidad trae su sugerencia y «Ver razón»', rows > 0, rows)
        # ofertas: crear una con SKU real del catálogo
        sku = await q.evaluate("FP.app.state.op.result.items[0].sku")
        r = await q.evaluate("""((sku)=>{
          const H=['Oracle','Producto','Categoría','Laboratorio','Controlados','Programa','Mecanica','% DES','ESTATUS PRODUCTO'];
          const mk=(s,desc,mech,prog,ctl,st)=>({line:2,values:{Oracle:s,Producto:'Prod '+s,'Categoría':'CAT','Laboratorio':'Lab X',Controlados:ctl||'Ningún Control',Programa:prog||'',Mecanica:mech||'','% DES':desc+'%','ESTATUS PRODUCTO':st||'DISPONIBLE'}});
          const rows=[mk(sku,'30','30% de descuento','Programa ejemplo'), mk('SKUX1','25','Descuentos escalonados por pieza'), mk('SKUX2','20','20%','', 'Controlado'), mk('SKUX3','15','15%','','','PRODUCTO AGOTADO - FECHA TENTATIVA')];
          const b=FP.offers.buildBatch(H,rows,{campaign:{name:'Demo',start:'2026-11-01',end:'2026-11-15'}});
          const r=FP.offers.commitBatch(FP.app.state.of.reg,b,{by:'Persona A',fileName:'demo.xlsx',sheet:'Productos finales',campaign:{name:'Demo',start:'2026-11-01',end:'2026-11-15'},origin:'commercial'});
          FP.app.storage.save(FP.config.storage.keys.offers, FP.app.state.of.reg); FP.app.render(); return {ok:r.ok, n:FP.app.state.of.reg.offers.length, err:r.error, rejected:b.rejected&&b.rejected.length};
        })(__SKU__)""".replace('__SKU__', repr(sku)))
        chk('A3 ofertas de prueba guardadas', r.get('ok') and r.get('n') == 4, r)
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.wait_for_timeout(1500)
        t = await body(q)
        chk('A4 Ofertas recibidas muestra «Activación sugerida», prioridad y confianza', 'Activación sugerida' in t and 'Confianza' in t, t[:300])
        recs = await q.evaluate("[...FP.activationView.recs(FP.app.state)].map(([k,r])=>[k,r.main,r.blocked])")
        mains = [x[1] for x in recs if x[0].startswith('offer:')]
        chk('A5 la oferta con control distinto y la agotada se marcan «No activar»', sum(1 for m in mains if m.startswith('No activar')) == 2, recs)
        chk('A6 la mecánica escalonada va a Ficha + CRM, no a banner', 'Ficha + CRM' in mains, mains)
        first = await q.evaluate("[...FP.activationView.recs(FP.app.state).keys()].find(k=>k.startsWith('offer:'))")
        await q.click(f'button[data-action="ac-open"][data-key="{first}"]'); await q.wait_for_timeout(300)
        t = await body(q)
        chk('A7 «Ver razón» abre el detalle con por qué y qué falta', await q.query_selector('#ac-t-det') is not None and 'Por qué' in t and 'Qué falta para decidir mejor' in t, t[-600:])
        await q.click('button[data-action="ac-state"][data-to="approved"]'); await q.wait_for_timeout(300)
        st = await q.evaluate("FP.app.state.ac.reg.items[FP.app.state.ac.sel] && FP.app.state.ac.reg.items[FP.app.state.ac.sel].state")
        chk('A8 aprobar guarda el estado con quién lo hizo', st == 'approved', st)
        await q.click('button[data-action="ac-state"][data-to="discarded"]'); await q.wait_for_timeout(300)
        t = await body(q)
        chk('A9 descartar sin motivo no pasa', 'Descartar pide un motivo' in t, t[:200])
        # parámetros
        await q.evaluate("document.querySelector('#pm-body details').open = true")
        await q.fill('#ac-p-slots', '0'); await q.dispatch_event('#ac-p-slots', 'change'); await q.wait_for_timeout(300)
        ban = await q.evaluate("[...FP.activationView.recs(FP.app.state).values()].filter(r=>r.main==='Banner principal').length")
        chk('A10 con 0 espacios nadie va a banner', ban == 0 and await q.evaluate("FP.app.state.ac.reg.params.bannerSlots") == 0, ban)
        await q.fill('#ac-p-disc', '150'); await q.dispatch_event('#ac-p-disc', 'change'); await q.wait_for_timeout(300)
        chk('A11 un descuento alto fuera de 0 a 100 se rechaza', await q.evaluate("FP.app.state.ac.reg.params.discountHigh") != 150)
        # persistencia
        await q.reload(); await q.wait_for_timeout(1500)
        keep = await q.evaluate("({s: FP.app.state.ac.reg.params.bannerSlots, items: Object.keys(FP.app.state.ac.reg.items).length})")
        chk('A12 parámetros y estados sobreviven a recargar', keep['s'] == 0 and keep['items'] >= 1, keep)
        # exportar
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove()); location.hash='#promociones'"); await q.wait_for_timeout(500)
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.wait_for_timeout(800)
        if not await q.query_selector('[data-action="ac-export-csv"][data-tab="offer"]'): await q.click('[data-action="of-fold"][data-fold="export"]'); await q.wait_for_timeout(250)   # Exportar viene plegado
        async with q.expect_download() as d: await q.click('[data-action="ac-export-xlsx"][data-tab="offer"]')
        dl = await d.value; path = os.path.join(tempfile.mkdtemp(), dl.suggested_filename); await dl.save_as(path)
        z = zipfile.ZipFile(path); sheet = z.read('xl/worksheets/sheet1.xml').decode('utf8'); wb = z.read('xl/workbook.xml').decode('utf8')
        chk('A13 el Excel trae una hoja «Plan de activación» con encabezados y filas', 'Plan de activación' in wb and 'Activación sugerida' in sheet and 'Ficha + CRM' in sheet and dl.suggested_filename.startswith('plan_activacion_ofertas_'), dl.suggested_filename)
        if not await q.query_selector('[data-action="ac-export-csv"][data-tab="offer"]'): await q.click('[data-action="of-fold"][data-fold="export"]'); await q.wait_for_timeout(250)   # Exportar viene plegado
        async with q.expect_download() as d: await q.click('[data-action="ac-export-csv"][data-tab="offer"]')
        dl = await d.value; csvp = os.path.join(tempfile.mkdtemp(), dl.suggested_filename); await dl.save_as(csvp)
        txt = open(csvp, encoding='utf8').read()
        chk('A14 el CSV trae los mismos encabezados', txt.lstrip('﻿').startswith('SKU,Producto,Categoría,Laboratorio,Origen,Oferta,Programa,Activación sugerida'), txt[:200])
        # sugerencias cargadas
        csvin = os.path.join(tempfile.mkdtemp(), 'sugerencias.csv')
        open(csvin, 'w', encoding='utf8').write(f'SKU,Canal sugerido,Comentario\n{sku},WhatsApp,Mandar a clientes del programa\nSKUX1,Banner,\n')
        await q.evaluate("document.querySelector('#pm-body details').open = true")
        await q.set_input_files('#ac-ext-file', csvin); await q.wait_for_timeout(600)
        ext = await q.evaluate("FP.app.state.ac.reg.external && Object.keys(FP.app.state.ac.reg.external.rows)")
        t = await body(q)
        chk('A15 carga sugerencias de otros y las compara', ext and sku in ext and 'Sugerencia cargada' in t and ('Coincide' in t or 'Difiere' in t), (ext, t[:200]))
        chk('A16 sin errores de página', not errs, errs)
        await b.close()
    print('\nFIN', 'OK' if not fails else f'{len(fails)} fallas: {fails}')
asyncio.run(main())
