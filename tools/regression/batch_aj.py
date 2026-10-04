"""Fase H · transparencia y control de la IA. Uso: python3 batch_aj.py <raiz>
H1 registro de consultas (sin valores, solo en la sesión) · H2 lo aprendido editable y borrable · H3 protección ampliada de datos personales y columnas marcadas a mano ·
H4 ayuda de la IA cuando el tipo de archivo es ambiguo · H5 columnas dudosas del mapeo · H6 casos de error (respuesta inválida, sin key, IA desactivada, red caída).
Cada escenario de archivo se corre con el flujo normal y con el Worker y se comparan. Cohere se simula (ninguna llamada real)."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
STUB = """()=>{window.__req=[];window.__ans={map:{mappings:[]},ds:null,net:false};
  window.fetch=async(url,opt)=>{const body=JSON.parse(opt.body);const text=body.messages.map(m=>m.content).join('\\n');
    const kind=/mapeador de columnas/.test(text)?'map':/clasificador de tipos/.test(text)?'ds':'otro';window.__req.push({kind,text});
    if(window.__ans.net)throw new Error('sin red');
    const a=window.__ans[kind]||{};return {ok:true,status:200,json:async()=>({message:{content:[{type:'text',text:JSON.stringify(a)}]}})}}}"""
def sales(venta='Monto vendido', extra=None, n=60):
    cols = ['fecha', 'canal', venta, 'pedidos', 'traffic_volume'] + [c for c, _ in (extra or [])]
    rows = [','.join(cols)]
    for i in range(n):
        d = f'2026-09-{1 + i % 28:02d}'
        rows.append(','.join([d, ['ecommerce', 'app', 'whatsapp', 'llamadas'][i % 4], str(1000 + i), str(3 + i % 7), str(200 + i % 50)] + [f(i) for _, f in (extra or [])]))
    return '\n'.join(rows) + '\n'
AMBIG = 'fecha,sku,vistas_ficha,venta,unidades\n' + '\n'.join(f'2026-09-{1 + i % 28:02d},SKU{i:04d},{40 + i},{500 + i},{2 + i % 5}' for i in range(30)) + '\n'
async def ctx(b, worker, key=True, ai=True, norm=False):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#carga'); await q.wait_for_timeout(300)
    await q.evaluate(f"FP.importWorker.setMinBytes({0 if worker else 10 ** 12})")
    await q.evaluate(f"FP.app.state.dx.apiKey = {json.dumps('clave-de-prueba' if key else '')}; FP.app.state.settings.enableAI = {json.dumps(ai)}")
    await q.evaluate(STUB); return c, q, u, errs
async def pick(q, text, name='raro.csv', dtype='actual'):
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('.staging__foot', timeout=60000); await q.wait_for_function("(()=>!FP.app.state.staging.working&&FP.app.state.staging.items.every(i=>!i.busy))()", timeout=60000); await q.wait_for_timeout(200)
async def reload(q):
    await q.reload(); await q.wait_for_function("window.FP&&FP.app&&FP.app.state&&FP.importer&&FP.importWorker", timeout=30000); await q.wait_for_timeout(300)
    await q.evaluate(STUB)
LOG = "FP.aiAudit.list().map(e=>({purpose:e.purpose,status:e.status,ok:e.ok,columnsSent:e.columnsSent,examplesSent:e.examplesSent,prot:e.protectedColumns,model:!!e.model,chars:e.chars>0}))"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); allerrs = []
        # ================= H3 · protección de datos personales (función) =================
        c, q, u, errs = await ctx(b, False); allerrs += errs
        R = lambda h_, ex=None: q.evaluate("(a)=>FP.normalize.personalReason(a[0],a[1])", [h_, ex or []])
        cases = [('Nombre del paciente', None, 'nombre de la columna'), ('Dirección de entrega', None, 'nombre de la columna'), ('Diagnóstico', None, 'nombre de la columna'), ('Folio de receta', None, 'nombre de la columna'), ('ID de cliente', None, 'nombre de la columna'), ('Correo cliente', None, 'nombre de la columna'),
                 ('X', ['Juan Pérez López', 'María de la Cruz', 'Luis Hernández'], 'contenido: nombres de persona'), ('X', ['Calle 5 de Mayo 123, Col. Centro'], 'contenido: domicilio'), ('X', ['123456789012'], 'contenido: identificador numérico largo'),
                 ('X', ['3f2b8c1e-9d4a-4b7e-8c1d-2a5e6f7a8b9c'], 'contenido: identificador (UUID)'), ('X', ['192.168.1.10'], 'contenido: dirección IP'), ('X', ['ana@correo.com'], 'contenido: correo'), ('X', ['GOMA800101ABC'], 'contenido: RFC'),
                 ('Monto vendido', ['1000', '1001', '1002'], None), ('Canal de venta', ['Ecommerce', 'App'], None), ('Producto', ['Paracetamol 500 mg', 'Ibuprofeno 400 mg'], None), ('Importe', ['1,234.50'], None), ('Notas', ['ok', 'bien'], None), ('Tipo de cliente', ['Nuevo', 'Recurrente'], None)]
        bad = []
        for h_, ex, want in cases:
            got = await R(h_, ex)
            if got != want: bad.append((h_, ex, got, want))
        chk(f'H3 la protección reconoce por nombre y por contenido {sum(1 for x in cases if x[2])} casos de datos personales (paciente, domicilio, diagnóstico, receta, ID de cliente, correo, nombres de persona, domicilios, identificadores largos, UUID, IP, RFC) y deja pasar {sum(1 for x in cases if not x[2])} que no lo son (monto, canal, producto, importe, notas, tipo de cliente)', not bad, bad)
        await q.evaluate("FP.normalize.setPersonalColumns(['Notas internas'])")
        m1 = await R('Notas internas', ['hola']); m2 = await R('notas  INTERNAS', ['hola']); m3 = await R('Notas', ['hola'])
        chk('H3 una columna marcada a mano se protege aunque nada en ella parezca personal (sin importar mayúsculas ni espacios) y las demás no', m1 == 'marcada por ti' and m2 == 'marcada por ti' and m3 is None, (m1, m2, m3))
        await c.close()
        # ================= H1 · registro del cliente =================
        c, q, u, errs = await ctx(b, False); allerrs += errs
        await q.evaluate("FP.aiAudit.clear()")
        await q.evaluate("FP.cohereClient.chatJson({system:'s',user:'u'.repeat(50),schema:{type:'object'},audit:{purpose:'Prueba A',columns:[{header:'Col',examplesSent:2,protected:null},{header:'Correo',examplesSent:0,protected:'nombre de la columna'}]}})")
        await q.evaluate("FP.cohereClient.chatJson({system:'s',user:'u',schema:{type:'object'}})")
        await q.evaluate("window.__ans.net=true"); await q.evaluate("FP.cohereClient.chatJson({system:'s',user:'u',schema:{type:'object'},audit:{purpose:'Prueba red'}})"); await q.evaluate("window.__ans.net=false")
        lg = await q.evaluate(LOG)
        chk('H1 cada consulta que sale se registra con su propósito (y «Consulta» si no tiene), columnas, ejemplos y protegidas; una que falla por la red queda como «unavailable»', [x['purpose'] for x in lg] == ['Prueba red', 'Consulta', 'Prueba A'] and lg[2]['columnsSent'] == 2 and lg[2]['examplesSent'] == 2 and lg[2]['prot'] == [{'header': 'Correo', 'reason': 'nombre de la columna'}] and lg[0]['status'] == 'unavailable' and not lg[0]['ok'] and lg[2]['ok'] and lg[2]['model'] and lg[2]['chars'], lg)
        await q.evaluate("FP.app.state.dx.apiKey=''"); n0 = await q.evaluate("FP.aiAudit.count()"); await q.evaluate("FP.cohereClient.chatJson({system:'s',user:'u',schema:{type:'object'}})"); n1 = await q.evaluate("FP.aiAudit.count()")
        chk('H1 una consulta que NO salió (sin API key) no se registra: no hubo nada que transparentar', n1 == n0, (n0, n1))
        await q.evaluate("for(let i=0;i<105;i++)FP.aiAudit.record({purpose:'x'+i,status:'ok',ok:true})")
        chk('H1 el registro guarda como máximo 100 consultas (las más recientes)', await q.evaluate("[FP.aiAudit.count(),FP.aiAudit.list()[0].purpose,FP.aiAudit.list()[99].purpose]") == [100, 'x104', 'x5'])
        await c.close()
        # ================= H1 + H3 + H5 de punta a punta, en los dos flujos =================
        PIIX = [('Nombre del paciente', lambda i: f'Paciente Numero{i}'), ('Domicilio', lambda i: f'Calle {i} 123'), ('Responsable', lambda i: ['Juan Pérez López', 'María de la Cruz', 'Luis Hernández'][i % 3]), ('Folio', lambda i: str(100000000000 + i)), ('Notas internas', lambda i: f'nota privada {i}')]
        EXAMPLE_VALUES = ['Paciente Numero0', 'Calle 0 123', 'Juan Pérez López', '100000000000', 'nota privada 0', 'persona0@correo.com']
        res = {}
        for worker in (False, True):
            c, q, u, errs = await ctx(b, worker); allerrs += errs
            await q.evaluate("FP.normalize.setPersonalColumns(['Notas internas'])")
            await q.evaluate("window.__ans.map={mappings:[{header:'Monto vendido',field:'revenue',confidence:0.95,reason:'monto = venta'}]}")
            await q.evaluate("FP.aiAudit.clear()")
            await pick(q, sales('Monto vendido', extra=PIIX + [('Correo cliente', lambda i: f'persona{i}@correo.com')]))
            req = await q.evaluate("window.__req.map(r=>[r.kind,r.text])"); log = await q.evaluate(LOG); box = await q.evaluate("(()=>{const n=[...document.querySelectorAll('#view-carga .note')].map(x=>x.innerText.replace(/\\s+/g,' '));return n})()")
            res[worker] = {'req': req, 'log': log, 'box': box}
            await c.close()
        for worker in (False, True):
            r = res[worker]; tag = 'Worker' if worker else 'flujo normal'
            sent = ' '.join(x[1] for x in r['req'])
            chk(f'H3 ({tag}) a Cohere NO viajan los ejemplos de las 6 columnas personales (paciente, domicilio, responsable con nombres, folio largo, nota marcada a mano y correos), pero sí los de «Monto vendido»', not any(v in sent for v in EXAMPLE_VALUES) and '1000' in sent and sent.count('ejemplos omitidos') == 6, (sent.count('ejemplos omitidos'), [v for v in EXAMPLE_VALUES if v in sent]))
            e = r['log'][0] if r['log'] else {}
            chk(f'H1 ({tag}) el registro anota 1 consulta «Mapeo de columnas» con 7 columnas, 3 ejemplos enviados (solo los de «Monto vendido») y las 6 protegidas con su motivo', len(r['log']) == 1 and e.get('purpose') == 'Mapeo de columnas' and e.get('columnsSent') == 7 and e.get('examplesSent') == 3 and len(e.get('prot', [])) == 6 and e.get('status') == 'ok' and e['ok'], r['log'])
            reasons = {p['header']: p['reason'] for p in e.get('prot', [])}
            chk(f'H1 ({tag}) los motivos de protección son los correctos (nombre, contenido o marcada a mano)', reasons.get('Nombre del paciente') == 'nombre de la columna' and reasons.get('Domicilio') == 'nombre de la columna' and reasons.get('Responsable') == 'contenido: nombres de persona' and reasons.get('Folio') == 'contenido: identificador numérico largo' and reasons.get('Notas internas') == 'marcada por ti' and reasons.get('Correo cliente') == 'nombre de la columna', reasons)
            chk(f'H1 ({tag}) el registro no contiene ningún valor de ejemplo (solo nombres de columnas, conteos y estado)', not any(v in json.dumps(r['log'], ensure_ascii=False) for v in EXAMPLE_VALUES + ['1001', '1002']), '')
            txt = ' '.join(r['box'])
            chk(f'H3 ({tag}) la revisión muestra «Columnas protegidas» con las 6 columnas y dice que viajaron sin ejemplos', 'Columnas protegidas' in txt and all(h_ in txt for h_ in ('Nombre del paciente', 'Domicilio', 'Responsable', 'Folio', 'Notas internas', 'Correo cliente')) and 'sin ejemplos' in txt, txt[:300])
        chk('H1 el mismo archivo da el mismo registro y la misma consulta con el flujo normal y con el Worker', json.dumps(res[False]['log'], sort_keys=True) == json.dumps(res[True]['log'], sort_keys=True) and res[False]['req'] == res[True]['req'], '')
        # ---- H5 ----
        DUBA = {'mappings': [{'header': 'Monto vendido', 'field': 'revenue', 'confidence': 0.95, 'reason': 'monto = venta', 'alternatives': [{'field': 'orders', 'confidence': 0.9}]},
                             {'header': 'Cantidad rara', 'field': 'orders', 'confidence': 0.5, 'reason': 'quizá pedidos'}, {'header': 'Otro monto', 'field': 'revenue', 'confidence': 0.9, 'reason': 'también venta'}]}
        dub = {}
        for worker in (False, True):
            c, q, u, errs = await ctx(b, worker); allerrs += errs
            await q.evaluate("(a)=>{window.__ans.map=a}", DUBA)
            await pick(q, sales('Monto vendido', extra=[('Cantidad rara', lambda i: str(i)), ('Otro monto', lambda i: str(i * 3))]))
            dub[worker] = await q.evaluate("(()=>{const it=FP.app.state.staging.items[0];const a=it.staged.aiMapping;return {doubtful:a.doubtful,mapping:it.staged.mapping,unmapped:a.unmapped,box:[...document.querySelectorAll('#view-carga .note--warning')].map(x=>x.innerText.replace(/\\s+/g,' '))}})()")
            await c.close()
        for worker in (False, True):
            d = dub[worker]; tag = 'Worker' if worker else 'flujo normal'; by = {x['header']: x for x in d['doubtful']}
            chk(f'H5 ({tag}) la revisión registra 3 columnas dudosas: «Monto vendido» (se asignó, con dos candidatos cercanos), «Cantidad rara» (confianza baja, no se asignó) y «Otro monto» (campo ya asignado)', set(by) == {'Monto vendido', 'Cantidad rara', 'Otro monto'} and by['Monto vendido'].get('assigned') and 'dos candidatos cercanos' in by['Monto vendido']['why'] and 'confianza baja (0.50' in by['Cantidad rara']['why'] and 'ya está asignado' in by['Otro monto']['why'], d['doubtful'])
            chk(f'H5 ({tag}) lo dudoso no se asignó (salvo el candidato más probable) y la pantalla lo explica con sus alternativas', d['mapping'].get('Monto vendido') == 'revenue' and not d['mapping'].get('Cantidad rara') and not d['mapping'].get('Otro monto') and any('Columnas dudosas' in x and 'Cantidad rara' in x and 'Otro monto' in x and 'alternativas' in x for x in d['box']), d['box'])
        chk('H5 el flujo normal y el Worker registran las mismas columnas dudosas', json.dumps(dub[False]['doubtful'], sort_keys=True) == json.dumps(dub[True]['doubtful'], sort_keys=True), '')
        # ================= H2 · lo aprendido =================
        for worker in (False, True):
            tag = 'Worker' if worker else 'flujo normal'
            c, q, u, errs = await ctx(b, worker); allerrs += errs
            await q.evaluate("window.__ans.map={mappings:[{header:'Monto vendido',field:'revenue',confidence:0.95,reason:'x'}]}")
            await pick(q, sales('Monto vendido')); n1 = await q.evaluate("window.__req.length")
            await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-ia-aprendido', timeout=20000)
            rows = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Columnas aprendidas por la IA\"] tbody tr')].map(r=>[r.cells[0].innerText.trim(),r.querySelector('select').value])")
            chk(f'H2 ({tag}) lo que la IA aprendió aparece en Ajustes: «monto_vendido» → Venta', rows == [['monto_vendido', 'revenue']] and n1 == 1, (rows, n1))
            await q.evaluate("FP.app.actions['learn-set']({dataset:{header:'monto_vendido'},value:'orders'})"); await q.wait_for_timeout(300)
            await reload(q)
            chk(f'H2 ({tag}) cambiar el campo de una columna aprendida se guarda y sobrevive a recargar la página', await q.evaluate("FP.importer.learnedMappings()") == {'monto_vendido': 'orders'}, await q.evaluate("FP.importer.learnedMappings()"))
            await q.evaluate("FP.importWorker.setMinBytes(" + ("0" if worker else "10**12") + ")"); await q.evaluate("FP.app.state.dx.apiKey='clave-de-prueba'; FP.app.state.settings.enableAI=true")
            await q.evaluate("FP.app.actions['learn-set']({dataset:{header:'monto_vendido'},value:'revenue'})")
            await q.evaluate("FP.app.actions['learn-del']({dataset:{header:'monto_vendido'}})"); await q.wait_for_timeout(300)
            empty = await q.evaluate("FP.importer.learnedMappings()"); await reload(q)
            await q.evaluate("FP.importWorker.setMinBytes(" + ("0" if worker else "10**12") + ")"); await q.evaluate("FP.app.state.dx.apiKey='clave-de-prueba'; FP.app.state.settings.enableAI=true; window.__ans.map={mappings:[{header:'Monto vendido',field:'revenue',confidence:0.95,reason:'x'}]}")
            await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="actual"]', state='attached'); await pick(q, sales('Monto vendido')); n2 = await q.evaluate("window.__req.length")
            chk(f'H2 ({tag}) al olvidar una columna aprendida la IA vuelve a preguntar la próxima vez (y queda guardado tras recargar)', empty == {} and n2 == 1, (empty, n2))
            await q.evaluate("FP.app.actions['learn-clear']()"); chk(f'H2 ({tag}) «Olvidar todo» vacía lo aprendido', await q.evaluate("[FP.importer.learnedMappings(),FP.app.state.settings.aiHeaderAliases]") == [{}, {}])
            await c.close()
        # ---- pii-save y persistencia ----
        c, q, u, errs = await ctx(b, False); allerrs += errs
        await q.goto(u + '#ajustes'); await q.wait_for_selector('#pii-text', timeout=20000); await q.fill('#pii-text', '  Notas internas \n\nObservaciones del doctor\nNotas internas\n'); await q.click('[data-action="pii-save"]'); await q.wait_for_timeout(300)
        saved = await q.evaluate("FP.app.state.settings.piiColumns"); await reload(q)
        chk('H3 las columnas marcadas a mano se guardan (sin vacías ni repetidas), se aplican al instante y sobreviven a recargar', saved == ['Notas internas', 'Observaciones del doctor'] and await q.evaluate("FP.normalize.personalReason('Observaciones del doctor',['x'])") == 'marcada por ti', saved)
        await c.close()
        # ---- Ajustes muestra el registro ----
        c, q, u, errs = await ctx(b, False); allerrs += errs
        await q.evaluate("window.__ans.map={mappings:[]}"); await q.evaluate("FP.aiAudit.clear()")
        await pick(q, sales('Monto vendido', extra=[('Correo cliente', lambda i: f'p{i}@x.com')])); await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-ia-log', timeout=20000)
        tb = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Consultas a Cohere\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))")
        chk('H1 Ajustes lista la consulta con «Mapeo de columnas», 2 columnas, 3 ejemplos enviados, la columna protegida con su motivo y «Respondió»', len(tb) == 1 and tb[0][1] == 'Mapeo de columnas' and tb[0][3] == '2' and tb[0][4] == '3' and 'Correo cliente' in tb[0][5] and 'nombre de la columna' in tb[0][5] and tb[0][7] == 'Respondió', tb)
        await q.click('[data-action="ia-log-clear"]'); await q.wait_for_timeout(300)
        chk('H1 «Borrar el registro» lo vacía y Ajustes lo dice', await q.evaluate("FP.aiAudit.count()") == 0 and 'Todavía no se ha enviado nada' in await q.evaluate("document.getElementById('st-ia-log').innerText"))
        await c.close()
        # ================= H4 · tipo de archivo con ayuda de la IA =================
        async def ds_case(worker, answer, **kw):
            c, q, u, errs = await ctx(b, worker, key=kw.get('key', True), ai=kw.get('ai', True)); allerrs.extend(errs)
            await q.evaluate("(a)=>{window.__ans.ds=a;window.__ans.map={mappings:[]}}", answer); await q.evaluate("FP.aiAudit.clear()")
            await pick(q, kw.get('text', AMBIG))
            out = await q.evaluate("(()=>{const d=FP.app.state.staging.items[0].staged.detection;return {type:d.datasetType,method:d.detectionMethod,amb:d.ambiguous,conf:d.confidence,reason:d.aiReason||null,note:d.aiNote||null,line:(document.querySelector('.dsdetect')||{innerText:''}).innerText.replace(/\\s+/g,' '),ds:window.__req.filter(r=>r.kind==='ds').map(r=>r.text),log:FP.aiAudit.list().filter(e=>/Tipo de archivo/.test(e.purpose)).map(e=>({c:e.columnsSent,x:e.examplesSent}))}})()")
            await c.close(); return out
        base = await ds_case(False, None, key=False)
        cand = ['product_sales', 'product_funnel']
        chk('H4 el archivo de prueba es ambiguo por reglas (venta por producto o embudo por producto) y sin API key no se consulta ni se avisa', base['amb'] and base['type'] in cand and base['method'] == 'deterministic' and not base['ds'] and not base['note'], base)
        pair = {}
        for worker in (False, True):
            tag = 'Worker' if worker else 'flujo normal'
            ok = await ds_case(worker, {'datasetType': 'product_funnel', 'confidence': 0.9, 'reason': 'trae vistas de ficha por SKU'}); pair[worker] = ok
            chk(f'H4 ({tag}) con una respuesta válida el tipo queda «product_funnel» (método ai-assisted, sin ambigüedad) y la revisión dice que se resolvió con ayuda de la IA y por qué', ok['type'] == 'product_funnel' and ok['method'] == 'ai-assisted' and not ok['amb'] and ok['reason'] == 'trae vistas de ficha por SKU' and 'Resuelto con ayuda de la IA' in ok['line'] and 'trae vistas de ficha por SKU' in ok['line'], ok)
            chk(f'H4 ({tag}) a Cohere solo viajan los encabezados y los tipos candidatos: ningún valor del archivo (SKU0000, 500…) y el registro anota 5 columnas con 0 ejemplos', len(ok['ds']) == 1 and 'vistas_ficha' in ok['ds'][0] and 'SKU0000' not in ok['ds'][0] and 'SKU0001' not in ok['ds'][0] and ok['log'] == [{'c': 5, 'x': 0}], (ok['ds'][:1], ok['log']))
            for label, ans in (('un tipo que no era candidato', {'datasetType': 'ecommerce_sales', 'confidence': 0.99, 'reason': 'x'}), ('confianza baja (0.5)', {'datasetType': 'product_sales', 'confidence': 0.5, 'reason': 'x'}), ('una respuesta vacía', {})):
                r_ = await ds_case(worker, ans)
                chk(f'H4 ({tag}) si la IA responde {label} se conserva la detección por reglas (sigue ambigua) y se avisa', r_['amb'] and r_['method'] == 'deterministic' and r_['note'] and 'se conserva la detección por reglas' in r_['line'], r_)
            r_ = await ds_case(worker, {'datasetType': 'product_funnel', 'confidence': 0.9, 'reason': 'x'}, ai=False)
            chk(f'H4 ({tag}) con la IA desactivada en Configuración no se consulta', not r_['ds'] and r_['amb'], r_)
            r_ = await ds_case(worker, {'datasetType': 'product_funnel', 'confidence': 0.9, 'reason': 'x'}, text=sales('venta'))
            chk(f'H4 ({tag}) un archivo que las reglas reconocen sin duda (venta diaria por canal) no consulta a la IA', not r_['ds'] and not r_['amb'] and r_['type'] == 'ecommerce_sales', r_)
        chk('H4 el flujo normal y el Worker resuelven igual (tipo, método y confianza)', all(pair[False][k] == pair[True][k] for k in ('type', 'method', 'amb', 'conf', 'reason')), (pair[False], pair[True]))
        chk('Sin errores de página', not allerrs, allerrs[:2])
        await b.close()
    print('\nRESULTADO batch_aj:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
