"""Carga que no falla: Segmentos acepta lo que trae un export real de GA4, nada se pierde, y los fallos se ven. Uso: python3 batch_ad.py <raiz>
AD-1 filas con compras > sesiones, ingresos sin compras y 0 sesiones entran todas a Segmentos (con advertencia), pero en Venta real siguen siendo error.
AD-2 las sumas de sesiones, compras e ingresos guardadas = las del archivo (calculadas aparte): no se pierde ninguna cifra.
AD-3 la revisión explica por qué quedan filas fuera y, si ninguna entra, lo dice como alerta.
AD-4 un guardado verificado avisa «guardados y verificados»; si falla la escritura o la verificación queda un banner que no desaparece al cambiar de sección."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
HG = 'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras'
def ga4(n=600):
    rows = [HG]; tot = {'ses': 0, 'ped': 0, 'rev': 0.0}; inc = 0
    for i in range(n):
        d = (dt.date(2026, 9, 1) + dt.timedelta(i % 25)).strftime('%Y%m%d')
        k = i % 5
        if k == 0: ses, ped, rev = 0, 3, 2700.0           # compras con 0 sesiones
        elif k == 1: ses, ped, rev = 2, 5, 4500.5          # compras > sesiones
        elif k == 2: ses, ped, rev = 40, 0, 120.0          # ingresos sin compras
        else: ses, ped, rev = 300 + i, 2, 1800.0
        # cada fila de GA4 con una landing distinta para que las sumas por segmento no se mezclen en la prueba
        rows.append(f'{d},web,mobile,google / cpc,campana_{i % 7},/p{i},new,{ses},{ped},{rev}')
    return '\n'.join(rows) + '\n', n
def sales_bad(n=40):
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for i in range(n): rows.append(f'2026-09-{1 + i % 28:02d},{["ecommerce", "app", "whatsapp", "llamadas"][i % 4]},{1000 + i},{8 + i % 3},2')   # pedidos > volumen
    return '\n'.join(rows) + '\n'
async def ctx(b, w=1280):
    c = await b.new_context(viewport={'width': w, 'height': 900}); q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#carga'); await q.wait_for_timeout(300); return c, q, u, errs
async def pick(q, dtype, name, text):
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('.staging__foot', timeout=60000); await q.wait_for_function("(()=>!FP.app.state.staging.working&&FP.app.state.staging.items.every(i=>!i.busy))()", timeout=60000)
async def commit(q):
    await q.click('[data-action="commit-staged"]:not([disabled])'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(300)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs_all = []
        for modo, minb in (('flujo normal', 10 ** 12), ('Worker', 0)):
            c, q, u, errs = await ctx(b); await q.evaluate(f"FP.importWorker.setMinBytes({minb})")
            text, n = ga4(); await pick(q, 'segments', 'ga4.csv', text)
            rv = await q.evaluate("(()=>{const r=FP.app.state.staging.items[0].result;const will=r.remote?r.willImport.strict:FP.importer.selectRows(r,{includeErrorRows:false}).length;return {rows:r.summary.rows,will,error:r.summary.error,warning:r.summary.warning,valid:r.summary.valid,byType:r.summary.byType}})()")
            await commit(q)
            got = await q.evaluate("(()=>{const rs=FP.dataStore.records(FP.app.state.store,'segments');const sum=(d)=>rs.filter(r=>r.dimension===d).reduce((a,r)=>({t:a.t+r.metrics.trafficVolume.value,o:a.o+r.metrics.orders.value,v:a.v+r.metrics.revenue.value}),{t:0,o:0,v:0});return {n:rs.length,dev:sum('device'),camp:sum('campaign')}})()")
            # sumas esperadas calculadas aparte del archivo
            lines = text.strip().split('\n')[1:]; ses = sum(int(l.split(',')[7]) for l in lines); ped = sum(int(l.split(',')[8]) for l in lines); rev = sum(float(l.split(',')[9]) for l in lines)
            chk(f'AD-1 ({modo}) con compras > sesiones, 0 sesiones e ingresos sin compras entran las {rv["rows"]} filas (ninguna rechazada) y las inconsistencias quedan como advertencia', rv['will'] == rv['rows'] and rv['error'] == 0 and rv['warning'] > 0 and got['n'] == rv['rows'], (rv, got['n']))
            chk(f'AD-2 ({modo}) las sumas guardadas coinciden con el archivo: {ses:,} sesiones, {ped:,} compras, ${rev:,.2f} de ingresos (no se pierde ninguna cifra)', got['dev']['t'] == ses and got['dev']['o'] == ped and abs(got['dev']['v'] - rev) < 0.01 and got['camp']['t'] == ses and got['camp']['o'] == ped, (got['dev'], ses, ped, rev))
            errs_all += errs; await c.close()
        # AD-1b · en Venta real lo mismo sigue siendo error
        c, q, u, errs = await ctx(b); await pick(q, 'actual', 'v.csv', sales_bad())
        rv2 = await q.evaluate("(()=>{const r=FP.app.state.staging.items[0].result;return {rows:r.summary.rows,error:r.summary.error,will:FP.importer.selectRows(r,{includeErrorRows:false}).length}})()")
        chk('AD-1 en Venta real, pedidos mayores que el volumen siguen siendo error (se rechazan): la excepción es solo de Segmentos', rv2['error'] == rv2['rows'] and rv2['will'] == 0, rv2)
        note = await q.evaluate("(()=>{const n=document.querySelector('.staging__foot .note');return n?{cls:n.className,role:n.getAttribute('role'),txt:n.innerText.replace(/\\s+/g,' ')}:null})()")
        chk('AD-3 si ninguna fila entra, la revisión lo dice como alerta con el motivo y un ejemplo («Ninguna fila se importaría», inconsistencia matemática)', bool(note) and 'note--error' in note['cls'] and note['role'] == 'alert' and 'Ninguna fila se importaría' in note['txt'] and 'Inconsistencia matemática' in note['txt'] and 'Ejemplo' in note['txt'], note)
        await c.close()
        c, q, u, errs = await ctx(b); mixed = sales_bad(10) + '\n'.join(f'2026-09-{1 + i % 28:02d},{["ecommerce", "app", "whatsapp", "llamadas"][i % 4]},{1000 + i},5,200' for i in range(30)) + '\n'
        await pick(q, 'actual', 'm.csv', mixed)
        note = await q.evaluate("(()=>{const n=document.querySelector('.staging__foot .note');return n?{cls:n.className,txt:n.innerText.replace(/\\s+/g,' ')}:null})()")
        chk('AD-3 si solo algunas quedan fuera, avisa cuántas y por qué («10 filas quedarían fuera»)', bool(note) and 'note--warn' in note['cls'] and '10 filas quedarían fuera' in note['txt'], note)
        await c.close()
        # AD-4 · guardado verificado y fallos visibles (colección grande → guardado por bloques)
        c, q, u, errs = await ctx(b)
        text, n = ga4(50); await pick(q, 'segments', 'g.csv', text); await commit(q)
        MAKE = """async(n)=>{const col=FP.app.state.store.segments;const tpl=col.records[0];for(let i=0;i<n;i++){const date=new Date(Date.UTC(2024,0,1)+Math.floor(i/200)*86400000).toISOString().slice(0,10);col.records.push({...tpl,key:`${date}|ecommerce|segments|device|s${i%200}`,date,segment:'s'+(i%200),segmentKey:'s'+(i%200),provenance:{...tpl.provenance,row:i+9}})}return col.records.length}"""
        await q.evaluate(MAKE, 120000)
        await q.evaluate("window.__t=[];const o=FP.ui.toast;FP.ui.toast=(m)=>{window.__t.push(String(m));return o(m)}")
        await q.evaluate("FP.app.saveStore(['segments'])"); await q.evaluate("(async()=>{await FP.app.savingChain.segments})()"); await q.wait_for_timeout(300)
        t = await q.evaluate("window.__t"); hidden = await q.evaluate("document.getElementById('save-failure').hidden")
        chk('AD-4 un guardado correcto avisa «guardados y verificados» y no deja banner', any('guardados y verificados' in x for x in t) and hidden, (t[-2:], hidden))
        await q.evaluate("(()=>{window.__o=FP.app.storage.saveAsync.bind(FP.app.storage);FP.app.storage.saveAsync=()=>Promise.resolve(false)})()")
        await q.evaluate(MAKE, 1000); await q.evaluate("FP.app.saveStore(['segments'])"); await q.evaluate("(async()=>{await FP.app.savingChain.segments})()"); await q.wait_for_timeout(400)
        ban = await q.evaluate("(()=>{const e=document.getElementById('save-failure');return {hidden:e.hidden,txt:e.innerText}})()")
        chk('AD-4 si la escritura falla queda un banner rojo con el motivo (no solo un aviso que se va)', not ban['hidden'] and 'No se pudo guardar' in ban['txt'], ban)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(500); ban2 = await q.evaluate("!document.getElementById('save-failure').hidden")
        chk('AD-4 el banner sigue visible al cambiar de sección', ban2, ban2)
        await q.evaluate("FP.app.storage.saveAsync=window.__o"); await q.evaluate("FP.app.saveStore(['segments'])"); await q.evaluate("(async()=>{await FP.app.savingChain.segments})()"); await q.wait_for_timeout(500)
        chk('AD-4 cuando el guardado vuelve a funcionar el banner desaparece', await q.evaluate("document.getElementById('save-failure').hidden"))
        await q.evaluate("(()=>{window.__r=FP.app.repo.kvRead.bind(FP.app.repo);FP.app.repo.kvRead=async()=>null})()")
        await q.evaluate(MAKE, 500); await q.evaluate("FP.app.saveStore(['segments'])"); await q.evaluate("(async()=>{await FP.app.savingChain.segments})()"); await q.wait_for_timeout(400)
        ban3 = await q.evaluate("(()=>{const e=document.getElementById('save-failure');return {hidden:e.hidden,txt:e.innerText}})()")
        chk('AD-4 si lo escrito no se puede leer de vuelta (verificación) también se avisa', not ban3['hidden'] and 'no se pudo verificar' in ban3['txt'], ban3)
        errs_all += errs; await c.close()
        chk('Sin errores de página', not errs_all, errs_all[:2])
        await b.close()
    print('\nRESULTADO batch_ad:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
