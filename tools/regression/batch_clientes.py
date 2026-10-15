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
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#clientes'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        t0 = await q.evaluate("document.getElementById('cus-body').innerText")
        chk('K1 sin libro explica qué cargar y ofrece datos de ejemplo', 'Todavía no hay clientes cargados' in t0 and 'id_pedido' in t0 and 'Probar con datos de ejemplo' in t0, t0[:200])
        tpl = await q.evaluate("FP.config.products.dataType.template")
        chk('K2 la plantilla de Productos · venta incluye id_pedido e id_cliente al final', tpl[-2:] == ['id_pedido', 'id_cliente'] and len(tpl) == 20, tpl)
        await q.evaluate("FP.app.actions['p-mock-clientes']()"); ok = await wait_ready(q)
        chk('K3 el archivo con IDs se procesa y mapea solo', ok)
        sm = await q.evaluate("FP.app.state.staging.items[0].result.summary.customers")
        chk('K4 resumen del archivo: pedidos distintos < líneas, sin avisos de falta de ID', sm and sm['orders'] < sm['lines'] and sm['withoutCustomer'] == 0 and sm['conflictOrders'] == 0, sm)
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(60):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        info = await q.evaluate("FP.customerStore.info()")
        chk('K5 al guardar, el libro de clientes queda en el navegador', info and info['orders'] == sm['orders'] and info['customers'] > 1000, info and (info['orders'], info['customers']))
        # las ventas de productos siguen guardándose como siempre
        cnt = await q.evaluate("FP.productStore.counts()")
        chk('K6 los productos se guardan como siempre (filas SKU-día > 0)', cnt['salesRows'] > 0, cnt)
        await q.evaluate("location.hash='#carga'"); await q.wait_for_timeout(300); await q.evaluate("location.hash='#clientes'"); await q.wait_for_timeout(2500)
        t1 = await q.evaluate("document.getElementById('cus-body').innerText")
        chk('K7 la vista muestra KPIs, mensual, LTV, retención y canal', all(x in t1 for x in ('Clientes', 'Compran más de una vez', 'Nuevos, recurrentes y reactivados por mes', 'Valor del cliente (LTV) por cohorte', 'Retención por mes', 'Por canal del primer pedido')), t1[:200])
        chk('K8 avisa de histórico insuficiente al inicio de la serie', 'histórico insuficiente' in t1)
        a = await q.evaluate("FP.customerStore.analyze({})")
        chk('K9 el análisis cuadra: nuevos + recurrentes + reactivados = pedidos y clientes únicos > 0', a['status'] == 'ok' and sum(m['orders']['total'] for m in a['monthly']) == a['summary']['orders'], a.get('summary'))
        chk('K10 hay mezcla de los tres segmentos', any(m['customers']['reactivated'] > 0 for m in a['monthly']) and any(m['customers']['recurrent'] > 0 for m in a['monthly']))
        chk('K11 LTV crece con la ventana (30 d ≤ 90 d ≤ 180 d) en el acumulado', (lambda w: w[0]['ltv'] <= w[1]['ltv'] <= w[2]['ltv'])([x for x in a['pooled'] if x['days'] in (30, 90, 180)]), a['pooled'])
        await q.select_option('[data-cu="reactivationDays"]', '365'); await q.wait_for_timeout(1500)
        r365 = await q.evaluate("FP.customerStore.analyze({reactivationDays:365,warmupDays:180,channel:null}).then(x=>x.monthly.reduce((s,m)=>s+m.customers.reactivated,0))")
        r180 = sum(m['customers']['reactivated'] for m in a['monthly'])
        chk('K12 un umbral de reactivación más largo da menos reactivados', r365 < r180, (r365, r180))
        await q.select_option('[data-cu="channel"]', 'app'); await q.wait_for_timeout(1500)
        ta = await q.evaluate("document.getElementById('cus-body').innerText")
        chk('K13 el filtro de canal vuelve a calcular sin errores', 'Nuevos, recurrentes' in ta)
        # privacidad: el ID de cliente no está en lo que viaja a la nube
        priv = await q.evaluate("""(async()=>{const k=(await (async()=>{const out=[];for(let i=0;i<localStorage.length;i++)out.push(localStorage.key(i));return out})());
          const inLS=k.some(x=>localStorage.getItem(x).includes('C000001'));
          return {inLS, skip:FP.config.cloud.skipKeys, hasMeta:true}})()""")
        chk('K14 ningún ID de cliente en localStorage ni en claves sincronizables', priv['inLS'] is False)
        # recargar el mismo archivo no duplica pedidos
        await q.evaluate("FP.app.actions['p-mock-clientes']()"); await wait_ready(q)
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(400):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        info2 = await q.evaluate("FP.customerStore.info()")
        chk('K15 recargar el mismo archivo no duplica pedidos ni clientes', info2['orders'] == info['orders'] and info2['customers'] == info['customers'], (info, info2))
        # quitar el archivo quita sus pedidos
        for _ in range(30):   # esperar a que el libro termine de guardar el último archivo (el guardado de pedidos va después de los productos)
            bid = await q.evaluate("FP.productStore.listBatches().then(l=>l.map(x=>x.id))")
            lb = await q.evaluate("FP.customerStore.info().then(x=>x?x.batches.map(b=>b.id):[])")
            if sorted(bid) == sorted(lb):
                await q.wait_for_timeout(2500)   # que no quede un guardado a medias
                bid2 = await q.evaluate("FP.productStore.listBatches().then(l=>l.map(x=>x.id))")
                lb2 = await q.evaluate("FP.customerStore.info().then(x=>x?x.batches.map(b=>b.id):[])")
                if sorted(bid2) == sorted(bid) and sorted(lb2) == sorted(lb): break
            await q.wait_for_timeout(500)
        await q.evaluate("""(async()=>{for(const b of await FP.productStore.listBatches()) await FP.productStore.removeBatch(b.id)})()""")
        info3 = await q.evaluate("FP.customerStore.info()")
        chk('K16 quitar los archivos vacía el libro de clientes', info3 is None, info3)
        # solo una de las dos columnas: se carga como siempre y se avisa
        r1 = await q.evaluate("""(async()=>{const csv='fecha,canal,sku,venta,pedidos,unidades,id_cliente\\n2026-09-01,ecommerce,S1,100,1,1,C1\\n';
          const st=FP.productImport.stage(csv,{fileName:'x.csv',kind:'sales'});const r=await FP.productImport.process(st,{settings:{}});
          return {ledger:!!r.draft.ledger,issues:Object.keys(r.summary.issuesByType),canImport:r.canImport}})()""")
        chk('K18 con solo id_cliente no arma clientes, avisa y el archivo se puede cargar', r1['ledger'] is False and 'CUSTOMER_COLUMNS_INCOMPLETE' in r1['issues'] and r1['canImport'], r1)
        r2 = await q.evaluate("""(async()=>{const csv=['fecha,canal,sku,venta,pedidos,unidades,id_pedido,id_cliente','2026-09-01,ecommerce,S1,100,1,1,P1,C1','2026-09-01,ecommerce,S2,50,1,1,P1,C1','2026-09-01,ecommerce,S3,70,1,1,P2,0','2026-09-01,app,S4,20,1,1,,C9','2026-09-02,app,S5,20,1,1,P3,invitado','2026-09-02,app,S6,40,1,1,P4,C2'].join('\\n');
          const st=FP.productImport.stage(csv,{fileName:'y.csv',kind:'sales'});const r=await FP.productImport.process(st,{settings:{}});
          return {c:r.summary.customers,issues:Object.keys(r.summary.issuesByType),orders:r.draft.ledger.orders.size,canImport:r.canImport}})()""")
        chk('K19 compras sin cliente o sin pedido no entran a clientes, pero sí a productos, y se avisa', r2['orders'] == 2 and r2['c']['withoutCustomer'] == 2 and r2['c']['withoutOrder'] == 1 and 'LINES_WITHOUT_CUSTOMER' in r2['issues'] and 'LINES_WITHOUT_ORDER' in r2['issues'] and r2['canImport'], r2)
        # el libro de clientes viaja con los productos a la nube y se restaura (se vuelve a cargar el ejemplo: K16 lo había vaciado)
        await q.evaluate("FP.app.actions['p-mock-clientes']()"); await wait_ready(q)
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(400):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        await q.wait_for_timeout(2500)
        sy = await q.evaluate("""(async()=>{const repo=FP.productStore.repo;const b=await FP.productSync.build(repo);
          const before=await FP.customerStore.info();
          const items=[...b.items.entries()].map(([key,envelope])=>({key,envelope}));
          await repo.setMeta('productCustomerLedger',{ledger:null});FP.customerStore.reset();
          const empty=await FP.customerStore.info();
          const r=await FP.productSync.restore(repo,items);const after=await FP.customerStore.info();
          return {inBundle:!!b.items.get('productsCloud:meta'),ok:r.ok,before:before&&before.orders,empty,after:after&&after.orders,cust:after&&after.customers,custB:before&&before.customers}})()""")
        chk('K20 el libro de clientes se sube con los productos y se restaura igual', sy['inBundle'] and sy['ok'] and sy['empty'] is None and sy['after'] == sy['before'] and sy['cust'] == sy['custB'], sy)
        chk('K17 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_clientes: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
