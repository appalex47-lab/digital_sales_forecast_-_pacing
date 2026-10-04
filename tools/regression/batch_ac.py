"""Worker de importación: equivalencia con el flujo normal. Uso: python3 batch_ac.py <raiz>
El MISMO archivo se importa dos veces en contextos separados: una con el flujo normal (sin Worker) y otra con el Worker. Se comparan, campo a campo,
la pantalla de revisión (resumen, filas que entrarán, problemas, mapeo), los registros guardados, el lote (cuenta, resumen, problemas) y lo que pasa
al cambiar mapeo, tipo u opciones, con duplicados contra lo ya guardado, al descartar y cuando el Worker no está disponible."""
import asyncio, sys, os, json, datetime as dt, zlib, threading, functools, http.server, socketserver
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
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def sales(venta='venta'):
    rows = [f'fecha,canal,{venta},pedidos,traffic_volume']
    for i in range(240):
        d = f'2026-09-{1 + i % 28:02d}'; ch = CH[i % 4]; v = str(1000 + i)
        if i % 41 == 5: v = '-500'
        elif i % 37 == 7: v = 'abc'
        elif i % 31 == 9: v = ''
        elif i % 29 == 11: d = '2026-13-45'
        elif i % 23 == 13: ch = 'canal_x'
        extra = ',sobra' if i % 53 == 17 else ''
        rows.append(f'{d},{ch},{v},{3 + i % 7},{200 + i % 50}{extra}')
    for _ in range(3): rows.append('2026-09-02,ecommerce,777,5,100')
    return '\n'.join(rows) + '\n'
def segs():
    rows = ['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume']
    for i in range(300):
        d = f'2026-09-{1 + i % 28:02d}'; v = str(100 + i)
        if i % 43 == 3: v = '-7'
        elif i % 47 == 4: v = 'x'
        rows.append(f'{d},{["ecommerce", "app"][i % 2]},dispositivo,{["Móvil", "Escritorio", "Tableta"][i % 3]},{v},{1 + i % 5},{50 + i % 40}')
    return '\n'.join(rows) + '\n'
def ga4(n=400):
    h_ = 'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras'
    rows = [h_]
    for i in range(n):
        d = (dt.date(2026, 9, 1) + dt.timedelta(i % 20)).strftime('%Y%m%d'); h = zlib.crc32(str(i).encode())
        rows.append(f'{d},{["web", "Android", "iOS"][i % 3]},{["mobile", "desktop"][i % 2]},{["google / cpc", "(direct) / (none)", "facebook / paid_social"][i % 3]},{["(organic)", "buen_fin", "(not set)"][i % 3]},/p{i % 17},{["new", "returning"][i % 2]},{500 + h % 700},{h % 9},{(h % 9) * 900}')
    rows.append('Total,,,,,,,"999,999",999,"$999,999.00"')
    return '\n'.join(rows) + '\n'
DUMP = """()=>{const R=(t)=>FP.dataStore.records(FP.app.state.store,t).map(r=>{const c=JSON.parse(JSON.stringify(r));if(c.provenance)delete c.provenance.batchId;return c});
 const B=(t)=>FP.dataStore.batches(FP.app.state.store,t).map(b=>({fileName:b.fileName,dataType:b.dataType,rowCount:b.rowCount,accepted:b.accepted,rejected:b.rejected,quarantined:b.quarantined,source:b.source,includeErrorRows:b.includeErrorRows,mapping:b.mapping,delimiter:b.delimiter,summary:b.summary,
   issues:b.issues.map(i=>{const c={...i};delete c.batchId;return c})}));
 const out={};for(const t of ['actual','segments','historical']){out[t]={records:R(t),batches:B(t)}}return out}"""
REVIEW = """()=>{const it=FP.app.state.staging.items[0];if(!it)return null;const r=it.result;
 const will=(r.remote?(FP.app.state.settings.includeErrorRows?r.willImport.withErrors:r.willImport.strict):FP.importer.selectRows(r,{includeErrorRows:FP.app.state.settings.includeErrorRows}).length);
 const issuesTotal=r.remote?r.issuesTotal:r.issues.length;
 const types={};(r.issues).forEach(i=>{types[i.type]=(types[i.type]||0)+1});
 return {remote:!!it.remote,dataType:it.staged.dataType,mapping:it.staged.mapping,summary:r.summary,canImport:r.canImport,mappingIssues:r.mappingIssues.map(x=>x.type||x.message||x),will,issuesTotal,
  sampleIssueTypes:r.remote?null:types,preview:r.rows.slice(0,5).map(x=>[x.line,x.status,x.keyValid,JSON.stringify(x.record.metrics)]),dateDetection:it.staged.dateDetection,headers:it.staged.parsed.headers}}"""
async def ctx(b, worker):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page()
    errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0))
    if worker == 'sin_worker_api': await q.add_init_script("delete window.Worker")
    u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#carga'); await q.wait_for_timeout(300)
    await q.evaluate(f"FP.importWorker.setMinBytes({0 if worker == 'worker' else 10**12})")
    return c, q, u, errs
async def pick(q, dtype, name, text):
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]', timeout=60000)
    await q.wait_for_function("(()=>{const i=FP.app.state.staging.items[0];return i&&!i.busy&&!FP.app.state.staging.working})()", timeout=60000)
async def settle(q):
    await q.wait_for_function("(()=>FP.app.state.staging.items.every(i=>!i.busy)&&!FP.app.state.staging.working)()", timeout=60000); await q.wait_for_timeout(150)
async def commit(q):
    await q.click('[data-action="commit-staged"]:not([disabled])'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=90000); await q.wait_for_timeout(200)
async def scenario(b, mode, name, steps):
    c, q, u, errs = await ctx(b, mode)
    out = {}
    try: await steps(q, out)
    finally:
        out['errs'] = errs[:2]; await c.close()
    return out
def same(a, b): return json.dumps(a, sort_keys=True, ensure_ascii=False) == json.dumps(b, sort_keys=True, ensure_ascii=False)
def diff(a, b, path=''):
    if type(a) != type(b): return f'{path}: tipo {type(a).__name__} ≠ {type(b).__name__}'
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b: return f'{path}.{k}: falta en un lado'
            r = diff(a[k], b[k], f'{path}.{k}')
            if r: return r
    elif isinstance(a, list):
        if len(a) != len(b): return f'{path}: largo {len(a)} ≠ {len(b)}'
        for i, (x, y) in enumerate(zip(a, b)):
            r = diff(x, y, f'{path}[{i}]')
            if r: return r
    elif a != b: return f'{path}: {str(a)[:60]} ≠ {str(b)[:60]}'
    return None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        # ---------- AC-1..4 · mismos resultados con cuatro archivos distintos ----------
        for label, dtype, text in (('GA4 (400 líneas, traducción)', 'segments', ga4()), ('Segmentos propios con negativos y no numéricos', 'segments', segs()), ('Venta real con todos los problemas', 'actual', sales())):
            async def steps(q, out, dtype=dtype, text=text):
                await pick(q, dtype, 'archivo.csv', text); out['review'] = await q.evaluate(REVIEW)
                await commit(q); out['store'] = await q.evaluate(DUMP); out['toast'] = await q.evaluate("document.getElementById('toast').innerText")
            A = await scenario(b, 'normal', label, steps); W = await scenario(b, 'worker', label, steps)
            ra, rw = A['review'], W['review']; ra2 = {k: v for k, v in ra.items() if k not in ('remote', 'sampleIssueTypes', 'preview')}; rw2 = {k: v for k, v in rw.items() if k not in ('remote', 'sampleIssueTypes', 'preview')}
            chk(f'AC · {label}: la revisión es remota solo con Worker', ra['remote'] is False and rw['remote'] is True, (ra['remote'], rw['remote']))
            chk(f'AC · {label}: misma pantalla de revisión (resumen, mapeo, filas que entrarán, total de problemas, detección de fecha)', same(ra2, rw2), diff(ra2, rw2))
            chk(f'AC · {label}: misma vista previa (primeras 5 filas normalizadas)', same(ra['preview'], rw['preview']), diff(ra['preview'], rw['preview']))
            chk(f'AC · {label}: los mismos registros guardados ({len(A["store"]["segments" if dtype == "segments" else "actual"]["records"]):,}), en el mismo orden y con el mismo contenido', same(A['store'], W['store']) or diff(A['store'], W['store']) is None, diff(A['store'], W['store']))
            chk(f'AC · {label}: sin errores de página y mismo aviso al importar', not A['errs'] and not W['errs'] and A['toast'] == W['toast'], (A['errs'], W['errs'], A['toast'], W['toast']))
        # ---------- AC-5 · cambiar el mapeo de una columna desconocida ----------
        async def steps5(q, out):
            await pick(q, 'actual', 'raro.csv', sales('Monto vendido')); out['antes'] = await q.evaluate(REVIEW)
            await q.evaluate("FP.app.actions['set-mapping']({dataset:{header:'Monto vendido'},value:''})"); await settle(q); out['sin_venta'] = await q.evaluate(REVIEW)
            await q.evaluate("FP.app.actions['set-mapping']({dataset:{header:'Monto vendido'},value:'revenue'})"); await settle(q); out['con_venta'] = await q.evaluate(REVIEW)
            await commit(q); out['store'] = await q.evaluate(DUMP)
        A = await scenario(b, 'normal', '5', steps5); W = await scenario(b, 'worker', '5', steps5)
        strip = lambda r: {k: v for k, v in r.items() if k not in ('remote', 'sampleIssueTypes', 'preview')}
        chk('AC · quitar la asignación de «Venta» en la revisión: el archivo ya no se puede importar y el Worker lo dice igual', not A['sin_venta']['canImport'] and same(strip(A['sin_venta']), strip(W['sin_venta'])), diff(strip(A['sin_venta']), strip(W['sin_venta'])))
        chk('AC · volver a asignarla: se recalcula en el Worker con el mismo resultado y se importa lo mismo', same(strip(A['con_venta']), strip(W['con_venta'])) and same(A['store'], W['store']), diff(strip(A['con_venta']), strip(W['con_venta'])) or diff(A['store'], W['store']))
        # ---------- AC-6 · opción «importar filas con errores» ----------
        async def steps6(q, out):
            await pick(q, 'actual', 'v.csv', sales()); out['estricto'] = await q.evaluate(REVIEW)
            await q.evaluate("FP.app.actions['set-setting']({dataset:{key:'includeErrorRows'},checked:true})"); await settle(q); out['con_errores'] = await q.evaluate(REVIEW)
            await commit(q); out['store'] = await q.evaluate(DUMP)
        A = await scenario(b, 'normal', '6', steps6); W = await scenario(b, 'worker', '6', steps6)
        chk('AC · activar «importar filas con errores»: con la cuarentena (Fase A) ya no hay filas con llave válida y error que añadir, y los dos flujos coinciden en lo que entra y en lo importado', A['con_errores']['will'] == A['estricto']['will'] and A['estricto']['will'] == W['estricto']['will'] and A['con_errores']['will'] == W['con_errores']['will'] and same(A['store'], W['store']), (A['estricto']['will'], A['con_errores']['will'], W['estricto']['will'], W['con_errores']['will'], diff(A['store'], W['store'])))
        # ---------- AC-7 · duplicados contra lo ya guardado ----------
        async def steps7(q, out):
            await pick(q, 'actual', 'v1.csv', sales()); await commit(q)
            await pick(q, 'actual', 'v2.csv', sales()); out['segunda'] = await q.evaluate(REVIEW); await commit(q); out['store'] = await q.evaluate(DUMP)
        A = await scenario(b, 'normal', '7', steps7); W = await scenario(b, 'worker', '7', steps7)
        chk('AC · segunda carga del mismo archivo: los duplicados contra lo ya guardado se detectan igual (resumen, problemas y lote)', A['segunda']['summary']['duplicates'] > 0 and same(A['store'], W['store']) and A['segunda']['summary']['duplicates'] == W['segunda']['summary']['duplicates'], (A['segunda']['summary']['duplicates'], W['segunda']['summary']['duplicates'], diff(A['store'], W['store'])))
        # ---------- AC-8 · cambiar el tipo de dato (Cargar como) ----------
        async def steps8(q, out):
            await pick(q, 'historical', 'h.csv', sales()); out['antes'] = await q.evaluate(REVIEW)
            await q.evaluate("FP.app.actions['staging-retype']({value:'actual'})"); await settle(q); out['despues'] = await q.evaluate(REVIEW)
            await commit(q); out['store'] = await q.evaluate(DUMP)
        A = await scenario(b, 'normal', '8', steps8); W = await scenario(b, 'worker', '8', steps8)
        chk('AC · «Cargar como»: mover Histórico → Venta real en revisión da lo mismo y los datos quedan en Venta real', A['despues']['dataType'] == W['despues']['dataType'] == 'actual' and len(W['store']['actual']['records']) > 0 and len(W['store']['historical']['records']) == 0 and same(A['store'], W['store']), diff(A['store'], W['store']))
        # ---------- AC-9 · descartar libera el Worker ----------
        async def steps9(q, out):
            await pick(q, 'actual', 'd.csv', sales()); out['antes'] = (await q.evaluate("FP.importWorker.stats()"))['jobs']
            await q.evaluate("FP.app.actions['discard-staged']()"); await q.wait_for_timeout(300); out['despues'] = (await q.evaluate("FP.importWorker.stats()"))['jobs']
            await pick(q, 'actual', 'd2.csv', sales()); await commit(q); out['tras_confirmar'] = (await q.evaluate("FP.importWorker.stats()"))['jobs']
        W = await scenario(b, 'worker', '9', steps9)
        chk('AC · el Worker libera la memoria de un archivo al descartarlo y al importarlo (trabajos: 1 → 0 → 0)', (W['antes'], W['despues'], W['tras_confirmar']) == (1, 0, 0), W)
        # ---------- AC-10 · sin Worker ----------
        async def steps10(q, out):
            out['available'] = await q.evaluate("FP.importWorker.start()")
            await pick(q, 'actual', 'n.csv', sales()); out['review'] = await q.evaluate(REVIEW); await commit(q); out['n'] = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        W = await scenario(b, 'sin_worker_api', '10', steps10)
        chk('AC · si el navegador no puede crear Workers, la carga sigue funcionando con el flujo normal', W['available'] is False and W['review']['remote'] is False and W['n'] > 0 and not W['errs'], W)
        # ---------- AC-11 · archivos chicos no usan Worker ----------
        c, q, u, errs = await ctx(b, 'normal'); await q.evaluate("FP.importWorker.setMinBytes(4*1024*1024)")
        await pick(q, 'actual', 'chico.csv', sales()); rv = await q.evaluate(REVIEW); await c.close()
        chk('AC · con el umbral de 4 MB, un archivo chico se procesa en la página (sin Worker)', rv['remote'] is False, rv['remote'])
        await b.close()
    print('\nRESULTADO batch_ac:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
