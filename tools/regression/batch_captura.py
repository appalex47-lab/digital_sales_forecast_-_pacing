"""Resumen de promociones (propuesta B): registro de propuestas exportadas, embudo, agrupación, pendientes y Excel. Uso: python3 batch_resumen.py <raiz>"""
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
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.wait_for_timeout(800)
        t = await body(q)
        chk('C1 Ofertas recibidas ofrece capturar una oferta y descargar la plantilla', 'Capturar una oferta' in t and 'Descargar plantilla' in t, t[:200])
        async with q.expect_download() as d: await q.click('[data-action="of-template"]')
        dl = await d.value; path = os.path.join(tempfile.mkdtemp(), 'plantilla.xlsx'); await dl.save_as(path)
        z = zipfile.ZipFile(path); wb = z.read('xl/workbook.xml').decode(); ss = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in z.namelist() else z.read('xl/worksheets/sheet1.xml').decode()
        chk('C2 la plantilla trae la hoja de captura, las instrucciones y las columnas Programa, Mecánica y Crónico / agudo', 'Productos finales' in wb and 'Instrucciones' in wb and all(x in ss for x in ['Oracle', '% DES', 'Programa', 'Mecánica', 'Crónico / agudo']), ss[:300])
        await q.click('[data-action="of-manual-open"]'); await q.wait_for_timeout(300)
        chk('C3 el formulario abre', await q.query_selector('#of-t-m') is not None)
        await q.evaluate("FP.app.state.pm.actor=''")
        await q.fill('#of-m-sku', 'SKUC1'); await q.fill('#of-m-controlled', 'Ningún Control'); await q.fill('#of-m-discount', '25'); await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(300)
        t = await body(q)
        chk('C4 sin tu nombre no guarda y lo dice', 'Escribe tu nombre' in t and await q.evaluate("FP.app.state.of.reg.offers.length") == 0, t[:300])
        await q.evaluate("FP.app.state.pm.actor='Persona A'")
        await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(300)
        n = await q.evaluate("FP.app.state.of.reg.offers.length"); v = await q.input_value('#of-m-sku')
        chk('C5 con tu nombre ya guarda (n=1) y el formulario se limpia', n == 1 and v == '', (n, v))
        await q.evaluate("FP.app.state.of.reg.offers.pop(); FP.app.state.of.reg.batches.pop(); FP.app.render()"); n = 0
        await q.fill('#of-m-sku', 'SKUC1'); await q.fill('#of-m-controlled', 'Ningún Control'); await q.fill('#of-m-discount', '140'); await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(300); t = await body(q)
        chk('C6 descuento fuera de 0 a 100 se rechaza', 'mayor que 0 y menor que 100' in t and await q.evaluate("FP.app.state.of.reg.offers.length") == n, t[:300])
        await q.fill('#of-m-sku', 'SKUC1'); await q.fill('#of-m-name', 'Producto demo'); await q.fill('#of-m-category', 'CAT A'); await q.fill('#of-m-lab', 'Lab demo'); await q.fill('#of-m-controlled', 'Ningún Control'); await q.fill('#of-m-program', 'Programa demo')
        await q.fill('#of-m-mechanic', '3+1'); await q.fill('#of-m-discount', '25'); await q.select_option('#of-m-use', 'Crónico'); await q.fill('#of-m-start', '2026-11-01'); await q.fill('#of-m-end', '2026-11-15'); await q.fill('#of-m-campaignName', 'Nov')
        await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(500)
        o = await q.evaluate("(()=>{const x=FP.app.state.of.reg.offers.slice(-1)[0]; return x&&{sku:x.sku,d:x.discount,p:x.program,m:x.mechanic,u:x.use,l:x.lab,s:x.state,by:x.receivedBy,st:x.start,fn:FP.app.state.of.reg.batches.slice(-1)[0].fileName}})()")
        chk('C7 guarda la oferta con todos sus campos como Recibida', o == {'sku': 'SKUC1', 'd': 0.25, 'p': 'Programa demo', 'm': '3+1', 'u': 'chronic', 'l': 'Lab demo', 's': 'received', 'by': 'Persona A', 'st': '2026-11-01', 'fn': 'Captura manual'}, o)
        t = await body(q)
        chk('C8 queda visible en la tabla y el formulario sigue para capturar otra', 'SKUC1' in t and 'guardada como «Recibida»' in t and await q.input_value('#of-m-campaignName') == 'Nov' and await q.input_value('#of-m-sku') == '', t[:300])
        await q.fill('#of-m-sku', 'SKUC2'); await q.fill('#of-m-controlled', 'Ningún Control'); await q.fill('#of-m-discount', '10'); await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(400)
        lots = await q.evaluate("FP.app.state.of.reg.batches.filter(b=>b.fileName==='Captura manual').map(b=>b.imported)")
        chk('C8b dos capturas de la misma campaña van al mismo lote', lots == [2], lots)
        await q.fill('#of-m-sku', 'SKUC3'); await q.fill('#of-m-controlled', ''); await q.fill('#of-m-discount', '10'); await q.click('[data-action="of-manual-save"]'); await q.wait_for_timeout(300); t = await body(q)
        chk('C8c sin Controlados no guarda', 'Controlados' in t and await q.evaluate("FP.app.state.of.reg.offers.length") == 2, t[:200])
        await q.reload(); await q.wait_for_timeout(2000)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove()); location.hash='#promociones'"); await q.wait_for_timeout(800)
        keep = await q.evaluate("FP.app.state.of.reg.offers.map(o=>o.sku)")
        chk('C9 sobrevive a recargar', keep == ['SKUC1', 'SKUC2'], keep)
        chk('C10 sin errores de página', not errs, errs)
        await b.close()
    print('\nFIN OK' if not fails else '\nFALLARON: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
