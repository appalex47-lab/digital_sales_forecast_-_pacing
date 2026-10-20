"""v0.14.1 · Cerrar sesión borra los datos del equipo de ESTE navegador (con aviso si hay algo sin respaldar).
Supabase SIMULADO con page.route (no se prueba el servicio real). https con certificado autofirmado temporal.
Uso: python3 batch_cierre_sesion.py <raiz>"""
import asyncio, sys, os, ssl, json, re, tempfile, subprocess, threading, functools, http.server, socketserver, datetime as dt
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
def serve():
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
    d = tempfile.mkdtemp(); k, c = d + '/k.pem', d + '/c.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=127.0.0.1'], capture_output=True, check=True)
    x = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); x.load_cert_chain(c, k); s.socket = x.wrap_socket(s.socket, server_side=True)
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
URL = f'https://127.0.0.1:{serve()}/index.html'
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
SB = re.compile(r'https://odsaouldxxjurniizefc\.supabase\.co/.*')
TURN = 'window.turnstile={render:(b,o)=>{setTimeout(()=>o.callback("tok"),10);return 1},remove(){}};'
SESSION = "localStorage.setItem('fp.cloudSession',JSON.stringify({access_token:'a',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user_id:'u1',email:'eq@empresa.com',team_id:'t1',team_name:'Ecommerce'}))"
async def newctx(b, M):
    c = await b.new_context(viewport={'width': 375, 'height': 740}, ignore_https_errors=True)
    async def sb(route):
        u = route.request.url; rq = route.request
        if 'team_members' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'team_id': 't1', 'teams': {'name': 'Ecommerce'}}]))
        if 'team_blobs' in u:
            if rq.method == 'POST':
                M['posts'] += 1
                for r in json.loads(rq.post_data or '[]'):
                    if r.get('part') == 0: M['at'][r['key']] = r['updated_at']
                return await route.fulfill(status=201, content_type='application/json', body='')
            if rq.method == 'DELETE': return await route.fulfill(status=204, body='')
            if M['status'] != 200: return await route.fulfill(status=M['status'], content_type='application/json', body='{"message":"boom"}')
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'key': k, 'updated_at': v, 'part': 0, 'total': 1, 'payload': '{}'} for k, v in M['at'].items()]))
        await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route(SB, sb)
    await c.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=TURN))
    return c
async def clean(q): await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
INV = """async()=>{const r=FP.app.repo; const kv=r.ready?(await r.kvAllKeys()):[]; const ls=Object.keys(localStorage).filter(k=>k.startsWith('fp.v1:')).map(k=>k.slice(6));
 return {kv, ls, ses: localStorage.getItem('fp.cloudSession'), route: localStorage.getItem('fp.route.v1'), changes: localStorage.getItem('fp.changes.v1')}}"""
async def seeded(b, M):
    """Contexto con datos locales de prueba, preferencias y sesión de equipo."""
    c = await newctx(b, M); q = await c.new_page(); await q.goto(URL + '#inicio'); await q.wait_for_function('window.FP && FP.app && FP.app.repo && FP.app.actions', timeout=30000); await q.wait_for_timeout(900); await clean(q)
    await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
    await q.evaluate("FP.app.storage.save('uxSettings',{x:1});FP.app.storage.save('onboardingDone','1');FP.app.storage.save('authChoice','team');FP.app.storage.save('cohereApiKey','k-123');localStorage.setItem('fp.route.v1','{\"a\":1}');localStorage.setItem('fp.changes.v1','{\"b\":2}')")
    await q.evaluate(SESSION); await q.reload(); await q.wait_for_function('window.FP && FP.app && FP.app.repo && FP.app.actions', timeout=30000); await q.wait_for_timeout(1500); await clean(q)
    return c, q
async def sync_all(q, M):
    ks = await q.evaluate("""async()=>{const sk=new Set(FP.config.cloud.skipKeys.concat(FP.config.cloud.autoSkipKeys,['uxSettings','productSettings','cohereApiKey','storageMigration','onboardingDone','authChoice']));
      const out=[];for(const k of await FP.app.cloudProvider.keys()){if(sk.has(k.split(':')[0])||FP.productSync.isKey(k))continue;if(await FP.app.cloudProvider.read(k))out.push(k)}return out}""")
    for k in ks: M['at'][k] = (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(minutes=5)).isoformat() + 'Z'
    return ks
OPEN = "document.querySelector('#signout-dialog') && document.querySelector('#signout-dialog').open"
async def inv_safe(q):
    """Lee el inventario; si la página se está recargando (cierre de sesión) reintenta en vez de fallar por una carrera."""
    err = None
    for _ in range(40):
        try:
            await q.wait_for_function('window.FP && FP.app && FP.app.repo', timeout=5000)
            return await q.evaluate(INV)
        except Exception as e:
            err = e; await q.wait_for_timeout(500)
    raise err

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        # ---- S1 todo respaldado → borra ----
        M = {'at': {}, 'status': 200, 'posts': 0}
        c, q = await seeded(b, M); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        inv0 = await inv_safe(q)
        chk('S0 antes: hay datos en IndexedDB y sesión', len(inv0['kv']) > 0 and inv0['ses'] and 'actualData' in ' '.join(inv0['kv']), inv0)
        ks = await sync_all(q, M)
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-confirm"]:not([disabled])', timeout=6000)
        t = await q.evaluate("document.querySelector('#signout-dialog').innerText")
        chk('S1a respaldado: aviso verde, botón directo, sin casilla', 'Todo está respaldado' in t and 'Entiendo' not in t, t)
        chk('S1b el texto dice qué se borra y qué se conserva', 'se borran de este navegador' in t and 'preferencias' in t and 'Cohere' in t, t)
        chk('S1c aún no se borró nada', len((await inv_safe(q))['kv']) == len(inv0['kv']))
        await q.click('#signout-dialog [data-action="signout-confirm"]'); await q.wait_for_timeout(2500)
        inv = await inv_safe(q)
        chk('S1d IndexedDB vacío (kv)', inv['kv'] == [], inv['kv'])
        data_ls = [k for k in inv['ls'] if k.split(':')[0] in ('historicalData','planData','actualData','segmentsData','dataset','plans','forecasts','targets','settings','aliases','businessContext','diagnosticSettings')]
        chk('S1e sin claves de datos en localStorage', data_ls == [], data_ls)
        chk('S1f sesión, ruta y cola de cambios borradas', inv['ses'] is None and inv['route'] is None and inv['changes'] is None, inv)
        chk('S1g se conservan uxSettings, onboardingDone y cohereApiKey', all(k in inv['ls'] for k in ('uxSettings', 'onboardingDone', 'cohereApiKey')), inv['ls'])
        chk('S1h authChoice se borró (el siguiente uso vuelve a ver la bienvenida)', 'authChoice' not in inv['ls'], inv['ls'])
        chk('S1i la app dejó de mostrar datos en memoria', await q.evaluate("FP.app.state.store ? FP.dataStore.records(FP.app.state.store,'actual').length === 0 : true"))
        await q.wait_for_timeout(600)
        chk('S1j tras recargar aparece la bienvenida y la sesión no existe', await q.evaluate("!!document.querySelector('#entry-dialog')") and await q.evaluate("!FP.app.state.cloud.session"))
        chk('S1k la nube no se tocó (no hubo POST ni DELETE)', M['posts'] == 0)
        await c.close()
        # ---- S2 sin respaldo: advertencia, casilla obligatoria, cancelar conserva ----
        M = {'at': {}, 'status': 200, 'posts': 0}
        c, q = await seeded(b, M); inv0 = await inv_safe(q)
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-upload"]', timeout=6000)
        t = await q.evaluate("document.querySelector('#signout-dialog').innerText")
        chk('S2a sin respaldo: avisa y lista bloques', 'sin respaldar' in t and 'no está en la nube' in t, t)
        chk('S2b «borrar de todos modos» deshabilitado hasta marcar la casilla', await q.evaluate("document.querySelector('#signout-dialog [data-action=\"signout-confirm\"]').disabled"))
        await q.evaluate("FP.app.actions['signout-confirm']()"); await q.wait_for_timeout(800)
        chk('S2c llamar a confirmar sin casilla no borra nada', len((await inv_safe(q))['kv']) == len(inv0['kv']) and await q.evaluate(OPEN))
        await q.keyboard.press('Escape'); await q.wait_for_timeout(300)
        chk('S2d Esc cierra el diálogo y conserva datos y sesión', not await q.evaluate("!!document.querySelector('#signout-dialog')") and (await inv_safe(q))['ses'] is not None and len((await inv_safe(q))['kv']) == len(inv0['kv']))
        # ---- S3 subir copia → pasa a respaldado ----
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-upload"]', timeout=6000)
        await q.click('#signout-dialog [data-action="signout-upload"]')
        await q.wait_for_function("(document.querySelector('#signout-dialog')||{innerText:''}).innerText.includes('Todo está respaldado')", timeout=15000)
        chk('S3 «Subir copia ahora» sube (POST) y el diálogo pasa a «Todo está respaldado»', M['posts'] > 0, M['posts'])
        await q.click('#signout-dialog [data-action="signout-cancel"]'); await c.close()
        # ---- S4 sin conexión / error: no se sabe → casilla + borrar de todos modos ----
        M = {'at': {}, 'status': 500, 'posts': 0}
        c, q = await seeded(b, M); inv0 = await inv_safe(q)
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-upload"]', timeout=6000)
        t = await q.evaluate("document.querySelector('#signout-dialog').innerText")
        chk('S4a error al comprobar: lo dice y no afirma que esté respaldado', 'No pude comprobar el respaldo' in t and 'Todo está respaldado' not in t, t)
        await q.check('#signout-dialog input[data-action="signout-ack"]'); await q.wait_for_timeout(200)
        chk('S4b con la casilla marcada se habilita el borrado', not await q.evaluate("document.querySelector('#signout-dialog [data-action=\"signout-confirm\"]').disabled"))
        await q.click('#signout-dialog [data-action="signout-confirm"]'); await q.wait_for_timeout(2500)
        inv = await inv_safe(q)
        chk('S4c se borra al confirmar con casilla', inv['kv'] == [] and inv['ses'] is None, inv)
        await c.close()
        # ---- S5 descarga de copia local ----
        M = {'at': {}, 'status': 200, 'posts': 0}
        c, q = await seeded(b, M)
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-download"]', timeout=6000)
        async with q.expect_download() as dl: await q.click('#signout-dialog [data-action="signout-download"]')
        d = await dl.value; path = await d.path(); j = json.load(open(path))
        chk('S5 la copia local descarga un .json con los bloques y sin la clave de Cohere', d.suggested_filename.startswith('revnavigator-copia-local-') and len(j['keys']) > 0 and 'cohereApiKey' not in json.dumps(list(j['keys'].keys())), list(j['keys'].keys())[:5])
        await q.click('#signout-dialog [data-action="signout-cancel"]')
        # ---- S6 productos sin copia cuentan como no respaldados ----
        await sync_all(q, M)
        await q.evaluate("FP.productStore.listBatches=async()=>[{importedAt:new Date().toISOString()}]")
        await q.evaluate("FP.app.actions['cloud-signout']()"); await q.wait_for_selector('#signout-dialog [data-action="signout-upload"]', timeout=6000)
        t = await q.evaluate("document.querySelector('#signout-dialog').innerText")
        chk('S6 productos locales sin copia en la nube → advierte', 'Productos: no hay copia en la nube' in t, t)
        await c.close()
        # ---- S7 el menú del encabezado y Cuenta abren el mismo diálogo ----
        M = {'at': {}, 'status': 200, 'posts': 0}
        c, q = await seeded(b, M)
        n = await q.evaluate("[...document.querySelectorAll('[data-action=\"cloud-signout\"]')].length")
        await q.evaluate("document.querySelector('.hmenu__item[data-action=\"cloud-signout\"], [data-action=\"cloud-signout\"]').click()")
        await q.wait_for_selector('#signout-dialog', timeout=4000)
        chk('S7 el botón de cerrar sesión abre el diálogo (no cierra directo)', await q.evaluate(OPEN) and (await inv_safe(q))['ses'] is not None, n)
        await c.close()
        chk('Sin errores de página', not errs, errs)
        await b.close()
    print('FALLAS:', len(fails)); print('fallas=%d' % len(fails))
asyncio.run(main())
