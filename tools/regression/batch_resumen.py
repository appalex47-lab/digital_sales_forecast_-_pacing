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
        chk('R0 pestaña Resumen existe y es la primera', await q.evaluate("document.querySelector('.sttab strong').textContent") == 'Resumen')
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(2500)
        t = await body(q)
        chk('R1 Resumen vacío explica qué falta', 'Resumen de promociones' in t and 'Todavía no hay datos que resumir' in t and 'Todavía no se ha exportado ninguna propuesta' in t, t[:300])
        await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(2500)
        total = await q.evaluate("FP.app.state.op.result.counts.total")
        skus = await q.evaluate("FP.app.state.op.result.items.slice(0,6).map(i=>i.sku)")
        await q.evaluate("document.getElementById('op-x-name').value='Propuesta prueba'; document.getElementById('op-x-name').dispatchEvent(new Event('change',{bubbles:true}))")
        await q.evaluate("FP.app.state.op.checked = Object.fromEntries(%s.map(s=>[s,true])); FP.app.state.op.xname='Propuesta prueba'; FP.app.render()" % repr(skus))
        async with q.expect_download() as d: await q.click('[data-action="op-export-xlsx"]')
        await d.value; await q.wait_for_timeout(400)
        reg = await q.evaluate("FP.app.state.sm.reg.proposals.map(p=>[p.id,p.name,p.by,p.skus.length])")
        chk('R2 exportar el Excel de propuesta la registra (nombre, quién, SKU)', reg == [['PRP-0001', 'Propuesta prueba', 'Persona A', 6]], reg)
        r = await q.evaluate("""((skus)=>{
          const H=['Oracle','Producto','Categoría','Laboratorio','Programa','Mecanica','% DES'];
          const mk=(s,desc,lab,prog,cat)=>({line:2,values:{Oracle:s,Producto:'Prod '+s,'Categoría':cat,'Laboratorio':lab,Programa:prog||'',Mecanica:'x','% DES':desc+'%'}});
          const rows=[mk(skus[0],'30','Lab 1','Prog 1','CAT A'), mk(skus[1],'20','Lab 1','','CAT A'), mk(skus[2],'25','Lab 2','Prog 1','CAT B'), mk('SKUFUERA1','10','Lab 3','','CAT C')];
          const c={name:'Nov',start:'2026-11-01',end:'2026-11-15'};
          const b=FP.offers.buildBatch(H,rows,{campaign:c}); const r=FP.offers.commitBatch(FP.app.state.of.reg,b,{by:'Persona A',fileName:'demo.xlsx',sheet:'P',campaign:c,origin:'commercial'});
          FP.app.state.of.reg.offers[0].state='validated'; FP.app.state.of.reg.offers[1].state='validated'; FP.app.state.of.reg.offers[1].state='selected';
          FP.app.storage.save(FP.config.storage.keys.offers, FP.app.state.of.reg); return {ok:r.ok,n:FP.app.state.of.reg.offers.length};
        })(__S__)""".replace('__S__', repr(skus)))
        chk('R3 ofertas de prueba guardadas', r.get('ok') and r.get('n') == 4, r)
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(800)
        t = await body(q)
        f = await q.evaluate("FP.summaryView.compute(FP.app.state).funnel")
        chk('R4 embudo: detectadas, propuestas, con oferta, validadas', f == {'detected': total, 'proposed': 6, 'withOffer': 3, 'validated': 2, 'selected': 1, 'inPromo': 0}, f)
        chk('R5 la pantalla muestra embudo y totales', 'SKU propuestos' in t and 'Cobertura de ofertas' in t and 'Total' in t, t[:400])
        head0 = await q.evaluate("document.querySelector('#pm-body thead th').textContent")
        await q.click('[data-action="sm-group"][data-g="lab"]'); await q.wait_for_timeout(300)
        head1 = await q.evaluate("document.querySelector('#pm-body thead th').textContent"); t = await body(q)
        chk('R6 agrupar por laboratorio cambia la tabla (sin oferta usa el laboratorio del catálogo)', head0 == 'Categoría' and head1 == 'Laboratorio' and 'Lab 1' in t and 'Sin laboratorio' not in t, (head0, head1))
        await q.click('[data-action="sm-group"][data-g="prog"]'); await q.wait_for_timeout(300); t = await body(q)
        chk('R7 agrupar por programa', 'Prog 1' in t and 'Sin programa' in t, t[:200])
        p = await q.evaluate("FP.summaryView.compute(FP.app.state).pending")
        chk('R8 pendientes: 2 sin validar, 1 validada, 3 propuestos sin oferta, 1 fuera de propuesta', p == {'received': 2, 'validated': 1, 'noOffer': 3, 'outside': 1}, p)
        await q.click('button[data-action="sm-go"][data-to="validated"]'); await q.wait_for_timeout(1200)
        tab = await q.evaluate("FP.app.state.pm.tab"); stf = await q.evaluate("FP.app.state.of.f.state")
        chk('R9 «Ver» abre Ofertas recibidas con el estado puesto', tab == 'ofertas' and stf == 'validated', (tab, stf))
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(500)
        await q.select_option('#sm-camp', 'Nov'); await q.wait_for_timeout(300)
        c = await q.evaluate("FP.app.state.sm.campaign"); n = await q.evaluate("FP.summaryView.compute(FP.app.state).total.of")
        chk('R10 filtrar por campaña', c == 'Nov' and n == 3, (c, n))
        await q.select_option('#sm-camp', ''); await q.wait_for_timeout(200)
        async with q.expect_download() as d: await q.click('[data-action="sm-export-xlsx"]')
        dl = await d.value; path = os.path.join(tempfile.mkdtemp(), 'r.xlsx'); await dl.save_as(path)
        z = zipfile.ZipFile(path); names = z.namelist(); sheet = z.read('xl/worksheets/sheet1.xml').decode(); ss = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in names else sheet
        chk('R11 el Excel del resumen trae la hoja con encabezados y total', 'Resumen' in z.read('xl/workbook.xml').decode() and 'Cobertura de ofertas' in ss and 'Total' in ss and 'Recibidas fuera de propuesta' in ss, names)
        await q.reload(); await q.wait_for_timeout(2000)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove()); location.hash='#promociones'"); await q.wait_for_timeout(800)
        keep = await q.evaluate("FP.app.state.sm.reg.proposals.map(p=>p.id)")
        chk('R12 las propuestas registradas sobreviven a recargar', keep == ['PRP-0001'], keep)
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(800); t = await body(q)
        chk('R13 la lista muestra la propuesta registrada', 'Propuesta prueba' in t and 'PRP-0001' in t, t[-300:])
        skus2 = await q.evaluate("FP.app.state.op.result.items.slice(0,6).map(i=>i.sku)")
        await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(1500)
        await q.evaluate("FP.app.state.op.checked = Object.fromEntries(%s.map(s=>[s,true])); FP.app.state.op.xname='Propuesta 2'; FP.app.render()" % repr(skus2))
        t = await body(q)
        chk('R15 Oportunidades muestra la columna Laboratorio', 'Laboratorio' in t, t[:300])
        async with q.expect_download() as d: await q.click('[data-action="op-export-xlsx"]')
        dl = await d.value; path = os.path.join(tempfile.mkdtemp(), 'p.xlsx'); await dl.save_as(path)
        z = zipfile.ZipFile(path); ss = z.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in z.namelist() else z.read('xl/worksheets/sheet1.xml').decode()
        chk('R16 el Excel de propuesta trae Laboratorio, Origen, Descuento y Programa con los datos de las ofertas', all(x in ss for x in ['Laboratorio', 'Origen de la oferta', 'Descuento', 'Programa', 'Comercial', 'Lab 1', 'Prog 1']), ss[-500:])
        async with q.expect_download() as d: await q.click('[data-action="op-export-csv"]')
        dl = await d.value; path = os.path.join(tempfile.mkdtemp(), 'p.csv'); await dl.save_as(path); csv = open(path, encoding='utf-8-sig').read()
        chk('R17 el CSV de propuesta trae las mismas columnas y valores', 'Laboratorio,Origen de la oferta,Descuento,Programa' in csv.split('\n')[0] and 'Comercial' in csv and '30 %' in csv, csv[:300])
        chk('R14 sin errores de página', not errs, errs)
        await b.close()
    print('\nFIN OK' if not fails else '\nFALLARON: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
