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
        await q.evaluate("FP.app.actions['p-mock-clientes']()"); ok = await wait_ready(q); chk('F1 el archivo con clientes se procesa', ok)
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(120):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        await q.wait_for_timeout(2500)
        r = await q.evaluate("""async()=>{ const L=await FP.customerStore.load(); const PS=FP.productStore;
          const cats=[...(await PS.aggregate({from:'2025-01-01',to:'2026-09-30',channel:'total',groupBy:'category'})).keys()];
          const brs=[...(await PS.aggregate({from:'2025-01-01',to:'2026-09-30',channel:'total',groupBy:'branch'})).keys()].filter(x=>x&&x!=='(sin dato)');
          return {lines:L.lines&&L.lines.o.length, orders:L.key.length, batchLines:L.batches.map(b=>b.lines), cats, brs} }""")
        chk('F2 el libro guarda el detalle por línea de cada pedido', r['lines'] and r['lines'] >= r['orders'] and all(r['batchLines']), r)
        cat, br = r['cats'][0], r['brs'][0]
        async def compare(label, ch, flt):
            res = await q.evaluate("""async([ch,flt])=>{ const PS=FP.productStore, TE=FP.temporalEngine;
              const ca=await FP.customerStore.analyze({channel:ch==='total'?null:ch, filter:flt});
              if(ca.status!=='ok') return {status:ca.status};
              const map=await PS.aggregate({from:'2025-01-01',to:'2026-09-30',channel:ch,groupBy:'total',filter:flt});
              let rev=0; map.forEach(acc=>{const f=PS.finalize(acc,null); if(f&&f.revenue&&Number.isFinite(f.revenue.value)) rev+=f.revenue.value;});
              const led=ca.monthly.reduce((s,m)=>s+m.revenue.total,0), cust=ca.monthly.reduce((s,m)=>s+m.customers.total,0);
              return {status:'ok', rev, led, cust, months:ca.monthly.length} }""", [ch, flt])
            good = res.get('status') == 'ok' and res['cust'] > 0 and abs(res['rev'] - res['led']) <= max(1, 0.001 * res['rev'])
            chk(f'F3 [{label}] la venta del libro filtrado coincide con la de Productos con el mismo filtro ({res})', good, res)
            return res
        a = await compare('categoría + Total digital', 'total', {'category': cat})
        e = await compare('categoría + Ecommerce', 'ecommerce', {'category': cat})
        s = await compare('sucursal + categoría + Ecommerce', 'ecommerce', {'category': cat, 'branch': br})
        t = await compare('sucursal sola + Total digital', 'total', {'branch': br})
        chk('F4 combinar filtros reduce el resultado (Ecommerce ≤ Total; categoría+sucursal ≤ categoría)', e['led'] <= a['led'] + 1 and s['led'] <= e['led'] + 1, [a['led'], e['led'], s['led']])
        # Detalle temporal de una categoría en Ecommerce: columnas de clientes con esa selección
        await q.goto(U + '#prodevol'); await q.wait_for_function("FP.productStore.available()", timeout=30000); await q.wait_for_timeout(800)
        await q.evaluate("(s)=>{const a=FP.app.state.an;Object.assign(a,s,{rows:[],key:null,error:null})}", dict(metric='revenue', periodCount=12, months=12, level='category', channel='ecommerce', periodType='month', focusKey='2026-08', comparison='previous'))
        await q.evaluate("FP.app.render()")
        await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.rows.length>0})()", timeout=90000)
        await q.evaluate("(c)=>FP.app.actions['an-drill']({dataset:{entity:c,source:'patron'}})", cat)
        await q.wait_for_selector('#an-drill table[aria-label="Detalle por período"]', state='attached', timeout=60000); await q.wait_for_function("!FP.app.state.an.drill.pending", timeout=60000)
        await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
        hd = await q.evaluate("""[...document.querySelectorAll('#an-drill table[aria-label="Detalle por período"] th')].map(t=>t.innerText.trim())""")
        note = await q.evaluate("(document.querySelector('[data-customers-context]')||{}).innerText||''")
        chk('F5 el Detalle temporal de la categoría muestra los clientes de ESA selección y lo explica', 'Nuevos' in hd and 'Clientes de esta selección' in note, [hd[:8], note[:120]])
        newsum = """[...document.querySelectorAll('#an-drill table[aria-label="Detalle por período"] tbody tr')].reduce((s,tr)=>s+(parseInt(((tr.children[3]||{}).textContent||'').replace(/[^0-9]/g,''))||0),0)"""
        n_co = await q.evaluate(newsum)
        await q.select_option('#an-drill select[data-action="an-cu-scope"]', 'selection'); await q.wait_for_function("FP.app.state.an.drill && FP.app.state.an.drill.data && FP.app.state.an.drill.data.customers && FP.app.state.an.drill.data.customers.scope==='selection' && !FP.app.state.an.drill.pending", timeout=60000)
        await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
        n_se = await q.evaluate(newsum)
        chk(f'F5b «nuevo en esta selección» cuenta distinto que «nuevo en la empresa» ({n_co} → {n_se})', n_co > 0 and n_se > n_co, [n_co, n_se])
        # libro anterior (sin líneas): se avisa qué recargar y no se inventa
        await q.evaluate("async()=>{const L=await FP.customerStore.load(); L.lines=null; }")   # como un libro guardado antes de esta versión
        await q.evaluate("(s)=>{const a=FP.app.state.an;Object.assign(a,s,{rows:[],key:null,error:null,drill:null});FP.app.state.pa.channel=s.channel;FP.app.state.pa.result=null}", dict(channel='app'))
        await q.evaluate("FP.app.render()")
        await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.rows.length>0})()", timeout=90000)
        await q.evaluate("(c)=>FP.app.actions['an-drill']({dataset:{entity:c,source:'patron'}})", cat)
        await q.wait_for_selector('#an-drill table[aria-label="Detalle por período"]', state='attached', timeout=60000); await q.wait_for_function("!FP.app.state.an.drill.pending", timeout=60000)
        await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
        nt = await q.evaluate("(document.querySelector('[data-customers-note]')||{}).innerText||''")
        chk('F6 con un libro anterior se pide recargar el archivo y no se muestran cifras inventadas', 'volver a cargar' in nt and 'productos_venta_con_clientes_demo.csv' in nt, nt[:200])
        chk('F7 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_clientes_filtro: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
