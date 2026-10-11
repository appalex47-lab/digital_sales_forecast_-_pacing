"""Prueba de esfuerzo de Tráfico (Segmentos) y Análisis con archivos MUY grandes (datos sintéticos).
Uso: python3 perf_stress.py <raiz> <seg|prod> <filas_aprox> <salida.json>
Genera el CSV en disco, lo carga por la pantalla de Carga y mide: revisión, confirmación, apertura de la vista y cada interacción
(tiempo hasta que la pantalla responde + bloqueo máximo del hilo principal con latido de 20 ms + tareas largas > 50 ms)."""
import asyncio, sys, os, json, time, random, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); KIND = sys.argv[2]; N = int(sys.argv[3]); OUT = sys.argv[4]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
FILE = f'/tmp/stress/{KIND}_{N}.csv'
def gen_seg():
    dims = [('dispositivo', 5), ('fuente', 60), ('medio', 15), ('campaña', 400), ('landing', 1200), ('tipo de cliente', 3)]
    per_day = sum(k for _, k in dims) * 2; days = max(7, N // per_day); d0 = dt.date(2026, 10, 9) - dt.timedelta(days=days - 1); r = random.Random(1)
    with open(FILE, 'w') as f:
        f.write('fecha,canal,dimension,segmento,venta,pedidos,traffic_volume,usuarios,rebote,duracion,paginas,nuevos\n')
        for d in range(days):
            dd = (d0 + dt.timedelta(days=d)).isoformat()
            for ch in ('ecommerce', 'app'):
                for dim, k in dims:
                    for s in range(k):
                        tv = r.randint(50, 5000); o = r.randint(0, max(1, tv // 25))
                        f.write(f'{dd},{ch},{dim},{dim[:3]}_{s},{o*r.randint(300,900)},{o},{tv},{int(tv*.8)},{r.random():.3f},{r.randint(20,300)},{r.randint(1,9)},{int(tv*.3)}\n')
    return days
def gen_prod():
    skus = max(50, N // (4 * 200)); days = max(30, N // (skus * 4)); d0 = dt.date(2026, 10, 9) - dt.timedelta(days=days - 1); r = random.Random(2)
    cats = [f'Cat{i}' for i in range(25)]; 
    with open(FILE, 'w') as f:
        f.write('fecha,canal,sku,producto,categoria,subcategoria,venta,pedidos,unidades,marca,laboratorio,principio_activo\n')
        for d in range(days):
            dd = (d0 + dt.timedelta(days=d)).isoformat()
            for s in range(skus):
                c = cats[s % 25]
                for ch in ('ecommerce', 'app', 'whatsapp', 'llamadas'):
                    p = r.randint(1, 20)
                    f.write(f'{dd},{ch},S{s:05d},Producto {s} 10 mg,{c},{c}-sub{s%7},{p*r.randint(120,900)},{p},{p*2},Marca{s%90},Lab{s%40},PA{s%300}\n')
    return days
async def main():
    t0 = time.time(); days = gen_seg() if KIND == 'seg' else gen_prod()
    R = {'tipo': KIND, 'archivoMB': round(os.path.getsize(FILE) / 1e6, 1), 'dias': days, 'gen_s': round(time.time() - t0, 1)}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=6000 --expose-gc'])
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('crash', lambda: errs.append('CRASH'))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 10, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; typ = 'segments' if KIND == 'seg' else 'products'
        await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{typ}"]', state='attached')
        await q.evaluate("(()=>{window.__gap=0;window.__lt=[];let last=performance.now();setInterval(()=>{const t=performance.now();window.__gap=Math.max(window.__gap,t-last);last=t},20);try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({entryTypes:['longtask']})}catch(e){}})()")
        async def reset(): await q.evaluate("window.__gap=0;window.__lt=[]")
        async def rep(name, t, extra=None):
            R[name] = {'s': round(t, 2), 'bloqueo_max_ms': await q.evaluate("Math.round(window.__gap)"), 'tareas_largas': await q.evaluate("window.__lt.length"), 'larga_max_ms': await q.evaluate("Math.max(0,...window.__lt)")}
            if extra: R[name].update(extra)
        await reset(); t = time.time(); await q.set_input_files(f'input[data-action="pick-files"][data-type="{typ}"]', FILE)
        try: await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=900000)
        except Exception as e: R['error_revision'] = str(e)[:100]
        await rep('1_revision', time.time() - t, {'heapMB': await q.evaluate("Math.round((gc(),performance.memory.usedJSHeapSize)/1e6)")})
        await reset(); t = time.time(); await q.click('[data-action="commit-staged"]')
        try: await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=900000)
        except Exception as e: R['error_confirmar'] = str(e)[:100]
        await rep('2_confirmar', time.time() - t)
        coll = 'segments' if KIND == 'seg' else 'products'
        await q.wait_for_timeout(1500); R['registros'] = await q.evaluate(f"(FP.app.state.store['{coll}']&&FP.dataStore.records?FP.dataStore.records(FP.app.state.store,'{coll}').length:null)") if KIND == 'seg' else await q.evaluate("FP.productStore&&FP.productStore.available()?1:0")
        async def timed(name, js, wait="true", to=300000):
            await reset(); t = time.time()
            try:
                await q.evaluate(js); await q.wait_for_timeout(50); await q.wait_for_function(wait, timeout=to)
            except Exception as e: R.setdefault('errores_paso', []).append((name, str(e)[:80]))
            await rep(name, time.time() - t)
        if KIND == 'seg':
            await timed('3_abrir_trafico', "location.hash='#segmentos'", "document.querySelector('#view-segmentos table')")
            def setsel(i, v): return f"(()=>{{const s=document.getElementById('{i}');if(!s)return;s.value='{v}';s.dispatchEvent(new Event('change',{{bubbles:true}}))}})()"
            await timed('4_periodo_2026-09', setsel('sg-key', '2026-09'), "document.querySelectorAll('#view-segmentos table tbody tr').length>1")
            for dim in ('source', 'medium', 'campaign', 'landing', 'customer_type', 'device'): await timed(f'5_dimension_{dim}', setsel('sg-dim', dim))
            await timed('6_dimension_landing_otra_vez', setsel('sg-dim', 'landing'))
            for ch in ('ecommerce', 'app', 'total'): await timed(f'7_canal_{ch}', setsel('sg-ch', ch))
            for mn in ('25', '1000', ''): await timed(f'8_minimo_sesiones_{mn or "auto"}', setsel('sg-min', mn))
            await timed('9_periodo_2026-10', setsel('sg-key', '2026-10'))
            R['filas_tabla_segmentos'] = await q.evaluate("[...document.querySelectorAll('#view-segmentos table')].map(t=>t.querySelectorAll('tbody tr').length)")
            await timed('5_abrir_decomposicion_o_datos', "location.hash='#datos'", "document.querySelector('#view-datos')")
        else:
            await timed('3_abrir_analisis', "location.hash='#analisis'", "window.FP&&FP.app.state.an&&!FP.app.state.an.loading&&FP.app.state.an.key!==null", 600000)
            R['filas_tabla_analisis'] = await q.evaluate("document.querySelectorAll('#view-analisis table tbody tr').length")
            R['entidades'] = await q.evaluate("(FP.app.state.an.rows||[]).length")
            steps = [('metric_pedidos', "FP.app.actions['an-metric']({value:'orders',dataset:{value:'orders'}})"), ('periodo_dia', "FP.app.actions['an-period-type']({value:'day'})"), ('periodo_mes', "FP.app.actions['an-period-type']({value:'month'})"),
                     ('canal_app', "FP.app.actions['an-channel']({value:'app',dataset:{value:'app'}})"), ('canal_total', "FP.app.actions['an-channel']({value:'total',dataset:{value:'total'}})"), ('nivel_sku', "FP.app.actions['an-level']({value:'sku',dataset:{value:'sku'}})"), ('nivel_categoria', "FP.app.actions['an-level']({value:'category',dataset:{value:'category'}})")]
            for nm, js in steps: await timed('4_' + nm, js, "!FP.app.state.an.loading", 600000)
            await timed('5_buscar_entidad', "FP.app.actions['an-entity-query']({value:'Cat1'})", "true")
            await timed('6_pagina_2', "FP.app.actions['an-page']({dataset:{page:'2',dir:'next'},value:'2'})", "true")
            await timed('7_drill_primera_entidad', "(()=>{const b=document.querySelector('#view-analisis [data-action=\"an-drill\"]');if(b)b.click()})()", "!FP.app.state.an.drill||!FP.app.state.an.drill.loading", 300000)
        R['heapMB_final'] = await q.evaluate("Math.round((gc(),performance.memory.usedJSHeapSize)/1e6)"); R['errores'] = errs[:3]
        print(json.dumps(R, ensure_ascii=False, indent=1)); json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
        await b.close()
asyncio.run(main())
