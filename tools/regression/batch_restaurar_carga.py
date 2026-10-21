"""v0.14.1 · Restaurar desde la nube con loader: barra real, etapas, cancelar solo al descargar, error y reintento,
sin la pregunta de los cuatro escenarios cuando sí se restaura. Supabase SIMULADO con page.route. https autofirmado temporal.
Uso: python3 batch_restaurar_carga.py <raiz>"""
import asyncio, sys, os, ssl, json, re, tempfile, subprocess, threading, functools, http.server, socketserver
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
DLG = "[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.id)"
async def newctx(b, M):
    c = await b.new_context(viewport={'width': 375, 'height': 740}, ignore_https_errors=True)
    async def sb(route):
        u = route.request.url
        if '/auth/v1/token?grant_type=password' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u1', 'email': 'eq@empresa.com'}}))
        if 'team_members' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'team_id': 't1', 'teams': {'name': 'Ecommerce'}}]))
        if 'team_blobs' in u:
            if route.request.method != 'GET': M['writes'] += 1; return await route.fulfill(status=201, body='')
            if 'select=key,part,total,bytes' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'key': k, 'part': 0, 'total': 1, 'bytes': len(v)} for k, v in M['blobs'].items()]))
            m = re.search(r'key=eq\.([^&]+)&part=eq\.(\d+)', u)
            if m:
                await asyncio.sleep(M['delay']); M['parts'] += 1
                if M['failAfter'] is not None and M['parts'] > M['failAfter']: return await route.fulfill(status=500, content_type='application/json', body='{"message":"boom"}')
                from urllib.parse import unquote
                return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'part': 0, 'payload': M['blobs'][unquote(m.group(1))]}]))
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'key': k, 'updated_at': '2026-10-01T00:00:00Z'} for k in M['blobs']]))
        await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route(SB, sb)
    await c.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=TURN))
    return c
async def clean(q): await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
async def to_cloud_step(b, M):
    c = await newctx(b, M); q = await c.new_page(); await q.goto(URL + '#inicio'); await q.wait_for_selector('[data-action="entry-login"]', timeout=8000)
    await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog')
    await q.fill('#login-email', 'eq@empresa.com'); await q.fill('#login-password', 'secreto123'); await q.click('#login-dialog [data-action="login-submit"]')
    await q.wait_for_selector('#entry-dialog [data-action="entry-restore"]', timeout=10000)
    return c, q
NACT = "(async()=>{try{return FP.app.state.store?FP.dataStore.records(FP.app.state.store,'actual').length:0}catch(e){return -1}})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        # datos reales de prueba para servir como «copia de la nube»
        c0 = await b.new_context(viewport={'width': 375, 'height': 740}, ignore_https_errors=True); q0 = await c0.new_page()
        await q0.goto(URL + '#inicio'); await q0.wait_for_timeout(900); await clean(q0)
        await q0.evaluate("FP.app.actions['generate-mock']()"); await q0.wait_for_timeout(1500)
        blobs = await q0.evaluate("""async()=>{const sk=new Set(FP.config.cloud.skipKeys.concat(FP.config.cloud.autoSkipKeys));const o={};for(const k of await FP.app.cloudProvider.keys()){if(sk.has(k.split(':')[0])||FP.productSync.isKey(k)||k==='authChoice'||k==='onboardingDone')continue;const e=await FP.app.cloudProvider.read(k);if(e)o[k]=JSON.stringify(e)}return o}""")
        await c0.close()
        chk('R0 hay una copia de prueba con varios bloques', len(blobs) >= 4 and 'actualData' in blobs, list(blobs))
        # ---- R1 restaurar completo ----
        M = {'blobs': blobs, 'delay': 0.5, 'parts': 0, 'failAfter': None, 'writes': 0}
        c, q = await to_cloud_step(b, M); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        chk('R1a antes de restaurar no hay datos locales', await q.evaluate(NACT) == 0)
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_selector('#rs-bar', timeout=4000)
        seen, maxd, pcts, tour = [], 0, [], False; cancel_vis = None; eta = ''
        for _ in range(60):
            try:
                o = await q.evaluate(DLG); maxd = max(maxd, len(o)); tour = tour or 'tour-offer' in o
                v = await q.evaluate("(document.getElementById('rs-bar')||{getAttribute:()=>null}).getAttribute('aria-valuenow')")
                if v is not None: pcts.append(int(v))
                if cancel_vis is None: cancel_vis = await q.evaluate("!!document.getElementById('rs-cancel') && !document.getElementById('rs-cancel').hidden")
                e = await q.evaluate("(document.querySelector('#rs-bar .ldr__time')||{}).textContent||''"); eta = eta or (e if 'faltan' in e else '')
            except Exception: break
            await q.wait_for_timeout(120)
        chk('R1b la barra avanza de forma creciente (aria-valuenow)', len(pcts) > 3 and pcts == sorted(pcts) and max(pcts) > 50, pcts[:20])
        chk('R1c «Cancelar» visible durante la descarga', cancel_vis is True)
        chk('R1d nunca hubo dos diálogos y NUNCA salió la pregunta de los cuatro escenarios', maxd <= 1 and not tour, (maxd, tour))
        await q.wait_for_timeout(2500)
        n = await q.evaluate(NACT); d = await q.evaluate(DLG)
        chk('R1e al terminar la página entra con los datos restaurados y sin diálogos', n > 0 and d == [], (n, d))
        chk('R1f authChoice «team» y sin escrituras a la nube', await q.evaluate("(FP.app.storage.load('authChoice')||{}).data") == 'team' and M['writes'] == 0)
        await c.close()
        # ---- R2 cancelar durante la descarga ----
        M = {'blobs': blobs, 'delay': 0.8, 'parts': 0, 'failAfter': None, 'writes': 0}
        c, q = await to_cloud_step(b, M)
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_selector('#rs-cancel', timeout=4000); await q.wait_for_timeout(900)
        await q.click('#rs-cancel'); await q.wait_for_timeout(1500)
        d = await q.evaluate(DLG)
        chk('R2a cancelar: no se guardó nada y aparece la pregunta de los cuatro escenarios (sin datos)', await q.evaluate(NACT) == 0 and d == ['tour-offer'], d)
        await c.close()
        # ---- R3 Esc también cancela durante la descarga ----
        c, q = await to_cloud_step(b, M)
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_selector('#rs-cancel', timeout=4000); await q.wait_for_timeout(600)
        await q.keyboard.press('Escape'); await q.wait_for_timeout(1500)
        chk('R3 Esc durante la descarga cancela y abre los cuatro escenarios', await q.evaluate(DLG) == ['tour-offer'] and await q.evaluate(NACT) == 0)
        await c.close()
        # ---- R4 error a media descarga → reintentar ----
        M = {'blobs': blobs, 'delay': 0.05, 'parts': 0, 'failAfter': 2, 'writes': 0}
        c, q = await to_cloud_step(b, M)
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_selector('#entry-dialog [data-action="entry-skip"]', timeout=8000)
        t = await q.evaluate("document.querySelector('#entry-dialog').innerText")
        chk('R4a el error se muestra con Reintentar y «Continuar sin restaurar», y dice que no se aplicó nada', 'No pude terminar la carga' in t and 'Reintentar' in t and 'No se aplicó nada' in t and await q.evaluate(NACT) == 0, t)
        M['failAfter'] = None
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_timeout(5000)
        chk('R4b reintentar funciona y carga los datos', await q.evaluate(NACT) > 0 and await q.evaluate(DLG) == [], (await q.evaluate(NACT), await q.evaluate(DLG)))
        await c.close()
        # ---- R5 error → continuar sin restaurar → cuatro escenarios ----
        M = {'blobs': blobs, 'delay': 0.05, 'parts': 0, 'failAfter': 1, 'writes': 0}
        c, q = await to_cloud_step(b, M)
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_selector('#entry-dialog [data-action="entry-skip"]', timeout=8000)
        await q.click('#entry-dialog [data-action="entry-skip"]'); await q.wait_for_timeout(1000)
        chk('R5 «Continuar sin restaurar» sin datos abre los cuatro escenarios y no cambia nada local', await q.evaluate(DLG) == ['tour-offer'] and await q.evaluate(NACT) == 0)
        await c.close()
        # ---- R6 al guardar ya no se puede cancelar ----
        M = {'blobs': blobs, 'delay': 0.02, 'parts': 0, 'failAfter': None, 'writes': 0}
        c, q = await to_cloud_step(b, M)
        await q.evaluate("(()=>{const o=FP.productSync.restore;FP.productSync.restore=async(...a)=>{await new Promise(r=>setTimeout(r,2500));return o(...a)}})()")
        await q.click('#entry-dialog [data-action="entry-restore"]'); await q.wait_for_function("document.querySelector('#rs-stages li.on') && document.querySelector('#rs-stages li.on').textContent.includes('Guardando')", timeout=8000)
        hid = await q.evaluate("document.getElementById('rs-cancel').hidden"); await q.keyboard.press('Escape'); await q.wait_for_timeout(300)
        chk('R6 en «Guardando» el botón Cancelar se oculta y Esc no cierra el diálogo', hid and await q.evaluate(DLG) == ['entry-dialog'])
        await q.wait_for_timeout(6000)
        chk('R6b termina igual y deja los datos', await q.evaluate(NACT) > 0)
        await c.close()
        chk('Sin errores de página', not errs, errs)
        await b.close()
    print('fallas=%d' % len(fails))
asyncio.run(main())
