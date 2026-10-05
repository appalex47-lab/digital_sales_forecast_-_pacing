"""Mapeo de columnas con IA (Cohere) también en archivos grandes (Worker). Uso: python3 batch_ag.py <raiz>
El MISMO archivo, con el flujo normal y con el Worker, y una respuesta simulada de Cohere. Se comparan: la consulta que sale (solo encabezados desconocidos y
ejemplos de las 3 primeras filas, sin datos personales), el mapeo resultante, la pantalla de revisión, los registros guardados, las columnas aprendidas
(la segunda carga ya no consulta) y los casos sin consulta (sin columnas desconocidas, IA desactivada, sin API key, respuesta inválida)."""
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
def sales(venta='Monto vendido', pii=True):
    cols = f'fecha,canal,{venta},pedidos,traffic_volume' + (',Correo cliente' if pii else '')
    rows = [cols]
    for i in range(120):
        d = f'2026-09-{1 + i % 28:02d}'; v = '-500' if i == 5 else str(1000 + i)
        rows.append(f'{d},{["ecommerce", "app", "whatsapp", "llamadas"][i % 4]},{v},{3 + i % 7},{200 + i % 50}' + (f',persona{i}@correo.com' if pii else ''))
    return '\n'.join(rows) + '\n'
STUB = """(mode)=>{window.__fetch=[];const answers={
  ok:{mappings:[{header:'Monto vendido',field:'revenue',confidence:0.95,reason:'monto = venta'}]},
  invalid:{mappings:[{header:'Monto vendido',field:'campo_inventado',confidence:0.95,reason:'x'},{header:'Correo cliente',field:'revenue',confidence:0.2,reason:'x'}]}};
  window.fetch=async(url,opt)=>{window.__fetch.push(JSON.parse(opt.body).messages.map(m=>m.content).join('\\n'));
    return {ok:true,status:200,json:async()=>({message:{content:[{type:'text',text:JSON.stringify(answers[mode]||answers.ok)}]}})}}}"""
REVIEW = """()=>{const it=FP.app.state.staging.items[0];if(!it)return null;const r=it.result;
 const will=(r.remote?r.willImport.strict:FP.importer.selectRows(r,{includeErrorRows:false}).length);
 return {remote:!!it.remote,mapping:it.staged.mapping,canImport:r.canImport,mappingIssues:r.mappingIssues.length,summary:r.summary,will,ai:it.staged.aiMapping?{ok:it.staged.aiMapping.ok,status:it.staged.aiMapping.status||null,mapped:(it.staged.aiMapping.mapped||[]).map(x=>[x.header,x.field]),usedAI:it.staged.aiMapping.usedAI}:null}}"""
DUMP = """()=>FP.dataStore.records(FP.app.state.store,'actual').map(r=>{const c=JSON.parse(JSON.stringify(r));if(c.provenance)delete c.provenance.batchId;return c})"""
async def ctx(b, worker, key=True, ai=True):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#carga'); await q.wait_for_timeout(300)
    await q.evaluate(f"FP.importWorker.setMinBytes({0 if worker else 10 ** 12})")
    await q.evaluate(f"FP.app.state.dx.apiKey = {json.dumps('clave-de-prueba' if key else '')}; FP.app.state.settings.enableAI = {json.dumps(ai)}")
    return c, q, u, errs
async def pick(q, text, name='raro.csv'):
    await q.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('.staging__foot', timeout=60000); await q.wait_for_function("(()=>!FP.app.state.staging.working&&FP.app.state.staging.items.every(i=>!i.busy))()", timeout=60000); await q.wait_for_timeout(200)
async def commit(q):
    await q.click('[data-action="commit-staged"]:not([disabled])'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(200)
async def run(b, worker, mode='ok', **kw):
    c, q, u, errs = await ctx(b, worker, **{k: v for k, v in kw.items() if k in ('key', 'ai')}); await q.evaluate(STUB, mode)
    out = {}
    await pick(q, kw.get('text') or sales(pii=kw.get('pii', True))); out['review'] = await q.evaluate(REVIEW); out['fetch'] = await q.evaluate("window.__fetch")
    if out['review']['canImport']:
        await commit(q); out['store'] = await q.evaluate(DUMP); out['learned'] = await q.evaluate("[FP.importer.learnedMappings(), FP.app.state.settings.aiHeaderAliases||null]")
        # segunda carga con el mismo encabezado «Monto vendido», sin la columna de correos (esa seguiría siendo desconocida y volvería a consultar): ya aprendido → no consulta
        await q.evaluate("window.__fetch=[]"); await pick(q, sales(pii=False), 'segundo.csv'); out['segunda'] = await q.evaluate(REVIEW); out['fetch2'] = await q.evaluate("window.__fetch.length")
    out['errs'] = errs; await c.close(); return out
def strip(r): return {k: v for k, v in r.items() if k != 'remote'}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        A = await run(b, False); W = await run(b, True)
        chk('AG-1 sin Worker y con Worker la revisión es remota solo con Worker', A['review']['remote'] is False and W['review']['remote'] is True)
        chk('AG-1 «Monto vendido» se asigna a Venta con la IA y el archivo ya se puede importar (los dos flujos igual)', A['review']['mapping'].get('Monto vendido') == 'revenue' and A['review']['canImport'] and json.dumps(strip(A['review']), sort_keys=True) == json.dumps(strip(W['review']), sort_keys=True), (strip(A['review']), strip(W['review'])))
        chk('AG-1 se consulta a Cohere una sola vez por archivo en cada flujo', len(A['fetch']) == 1 and len(W['fetch']) == 1, (len(A['fetch']), len(W['fetch'])))
        chk('AG-1 la consulta es la misma en los dos flujos y solo trae los encabezados desconocidos con ejemplos de las 3 primeras filas', A['fetch'] == W['fetch'] and 'Monto vendido' in W['fetch'][0] and '1000' in W['fetch'][0] and '1002' in W['fetch'][0] and '1003' not in W['fetch'][0], W['fetch'][0][:400] if W['fetch'] else None)
        chk('AG-1 privacidad: los correos de la columna «Correo cliente» NO salen hacia Cohere en ninguno de los dos flujos', all('@correo.com' not in f for f in A['fetch'] + W['fetch']) and 'posible dato personal' in W['fetch'][0], W['fetch'][0][:300] if W['fetch'] else None)
        chk('AG-1 los registros guardados son los mismos (incluida la venta negativa en cuarentena)', json.dumps(A['store'], sort_keys=True) == json.dumps(W['store'], sort_keys=True) and len(W['store']) == 120, (len(A['store']), len(W['store'])))
        chk('AG-2 lo aprendido queda guardado (monto vendido → venta) y la segunda carga ya NO consulta a Cohere, en los dos flujos', A['fetch2'] == 0 and W['fetch2'] == 0 and A['segunda']['mapping'].get('Monto vendido') == 'revenue' and W['segunda']['mapping'].get('Monto vendido') == 'revenue' and A['learned'] == W['learned'] and W['learned'][0].get('monto_vendido') == 'revenue', (A['fetch2'], W['fetch2'], W['learned']))
        # sin columnas desconocidas
        N = [await run(b, w, text=sales('venta', pii=False)) for w in (False, True)]
        chk('AG-3 si todas las columnas se reconocen no se consulta a Cohere (ninguno de los dos flujos)', all(len(x['fetch']) == 0 for x in N) and all(x['review']['canImport'] for x in N), [len(x['fetch']) for x in N])
        # IA desactivada
        D = [await run(b, w, ai=False) for w in (False, True)]
        chk('AG-4 con la IA desactivada en Configuración no se consulta y la columna queda para asignar a mano (los dos flujos igual)', all(len(x['fetch']) == 0 and not x['review']['canImport'] for x in D) and json.dumps(strip(D[0]['review']), sort_keys=True) == json.dumps(strip(D[1]['review']), sort_keys=True), [strip(x['review']) for x in D])
        # sin API key
        K = [await run(b, w, key=False) for w in (False, True)]
        chk('AG-5 sin API key no se consulta, se avisa «IA no disponible» y el mapeo estático se conserva (los dos flujos igual)', all(len(x['fetch']) == 0 and not x['review']['canImport'] and x['review']['ai'] and x['review']['ai']['status'] == 'unavailable' for x in K) and json.dumps(strip(K[0]['review']), sort_keys=True) == json.dumps(strip(K[1]['review']), sort_keys=True), [strip(x['review']) for x in K])
        # respuesta inválida
        I = [await run(b, w, mode='invalid') for w in (False, True)]
        chk('AG-6 si Cohere propone un campo inventado o con poca confianza se rechaza y el mapeo no cambia (los dos flujos igual)', all(not x['review']['canImport'] and x['review']['mapping'].get('Monto vendido') in (None, '') for x in I) and json.dumps(strip(I[0]['review']), sort_keys=True) == json.dumps(strip(I[1]['review']), sort_keys=True), [strip(x['review']) for x in I])
        chk('Sin errores de página', not any(x['errs'] for x in [A, W] + N + D + K + I), [x['errs'] for x in [A, W]])
        await b.close()
    print('\nRESULTADO batch_ag:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
