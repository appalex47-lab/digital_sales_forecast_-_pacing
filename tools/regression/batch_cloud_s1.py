"""Fase S1 — Nube (Supabase simulado): subir, verificar, borrar local, restaurar. Uso: python3 batch_cloud_s1.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
from urllib.parse import urlparse, parse_qs
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
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
rows = []; state = {'anon': True, 'users': 0}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        async def handler(route):
            r = route.request; u = urlparse(r.url)
            if r.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            if u.path == '/auth/v1/signup':
                if not state['anon']: return await route.fulfill(status=422, content_type='application/json', body='{"msg":"Anonymous sign-ins are disabled"}', headers=CORS)
                state['users'] += 1; state['body'] = r.post_data
                return await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'access_token': 't1', 'refresh_token': 'r-1', 'expires_in': 3600, 'user': {'id': 'u1', 'is_anonymous': True}}))
            if u.path == '/auth/v1/user' and r.method == 'PUT':
                state['pending'] = json.loads(r.post_data)['email']
                return await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'id': 'u1', 'new_email': state['pending']}))
            if u.path == '/auth/v1/verify':
                b = json.loads(r.post_data)
                ok = (b['type'] == 'email_change' and b['token'] == '123456') or (b['type'] == 'email' and b['token'] == '654321' and state.get('email') == b['email'])
                if not ok: return await route.fulfill(status=403, content_type='application/json', headers=CORS, body='{"error_code":"otp_expired","msg":"Token has expired or is invalid"}')
                state['email'] = b['email']
                return await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'access_token': 't2', 'refresh_token': 'r-1', 'expires_in': 3600, 'user': {'id': 'u1', 'is_anonymous': False, 'email': b['email']}}))
            if u.path == '/auth/v1/otp':
                b = json.loads(r.post_data); state['otp'] = b
                if b['email'] != state.get('email'): return await route.fulfill(status=422, content_type='application/json', headers=CORS, body='{"error_code":"signup_disabled","msg":"Signups not allowed for otp"}')
                return await route.fulfill(status=200, content_type='application/json', headers=CORS, body='{}')
            qs = parse_qs(u.query)
            if r.method == 'POST':
                for x in json.loads(r.post_data):
                    rows[:] = [y for y in rows if not (y['key'] == x['key'] and y['part'] == x['part'])] + [x]
                return await route.fulfill(status=201, body='', headers=CORS)
            sel = list(rows)
            k = qs.get('key', [''])[0]; pt = qs.get('part', [''])[0]
            if k.startswith('eq.'): sel = [y for y in sel if y['key'] == k[3:]]
            if k.startswith('neq.'): sel = [y for y in sel if y['key'] != k[4:]]
            if pt.startswith('gte.'): sel = [y for y in sel if y['part'] >= int(pt[4:])]
            if pt.startswith('eq.'): sel = [y for y in sel if y['part'] == int(pt[3:])]
            if r.method == 'DELETE':
                for y in sel: rows.remove(y)
                return await route.fulfill(status=204, body='', headers=CORS)
            return await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps(sorted([{'key': y['key'], 'part': y['part'], 'total': y['total'], 'payload': y['payload'], 'updated_at': y.get('updated_at')} for y in sel], key=lambda y: (y['key'], y['part']))))
        await q.route('https://odsaouldxxjurniizefc.supabase.co/**', handler)
        async def ts(route):
            await route.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(el,o){setTimeout(function(){o.callback('TOK-PW')},50);return 'w1'},remove:function(){}};")
        await q.route('https://challenges.cloudflare.com/**', ts)
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.evaluate("FP.app.lsStorage.save('cohereApiKey','SECRETO-COHERE')")
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        chk('N1 la sección «Nube» existe en Configuración, cerrada', await q.evaluate("!!document.getElementById('st-nube') && !document.getElementById('st-nube').open"))
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        chk('N2 al abrir la pantalla NO hay llamadas a Supabase (privacidad)', len(rows) == 0 and state['users'] == 0)
        chk('N3 avisa que hay que confirmar con la empresa el destino', 'destino permitido' in (await q.inner_text('#st-nube')))
        # anónimos desactivados
        state['anon'] = False
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_timeout(1200)
        chk('N4 con anónimos desactivados explica cómo activarlos y no sube nada', 'desactivados' in (await q.inner_text('#cloud-msg')) and not rows, await q.inner_text('#cloud-msg'))
        state['anon'] = True
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_timeout(3500)
        msg = await q.inner_text('#cloud-msg')
        chk('N5 sube y verifica', 'verificada' in msg and len(rows) > 0, msg)
        chk('N5b el registro anónimo envió el token de Turnstile', 'TOK-PW' in (state.get('body') or '') and 'captcha_token' in state.get('body', ''), state.get('body'))
        chk('N5c el contenedor del CAPTCHA se retira al terminar', await q.evaluate("!document.getElementById('cloud-captcha')"))
        chk('N6 la API key de Cohere no viajó', not any('SECRETO-COHERE' in y['payload'] or y['key'] == 'cohereApiKey' for y in rows))
        chk('N7 la sesión anónima no viajó ni quedó dentro de los datos', not any('refresh_token' in y['payload'] for y in rows))
        keys = sorted({y['key'] for y in rows}); chk('N8 viajan los datos de la app (dataset/targets/settings…)', any(k.startswith('dataset') or k.startswith('actualData') or k.startswith('planData') for k in keys), keys)
        before = await q.evaluate("JSON.stringify(FP.app.state.dataset && FP.app.state.dataset.rows ? FP.app.state.dataset.rows.length : null)")
        # borrar local y restaurar
        await q.evaluate("(async()=>{await FP.app.repo.clearAll(); FP.app.lsStorage.clear(); FP.app.lsStorage.save('x',1)})()"); await q.wait_for_timeout(500)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        n_local = await q.evaluate("FP.app.cloudProvider.keys().then(k=>k.filter(x=>x!=='x').length)")
        chk('N9 tras borrar lo local no quedan datos', n_local == 0, n_local)
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        await q.click('[data-action="cloud-download"]'); await q.wait_for_timeout(3000)
        msg = await q.inner_text('#cloud-msg')
        chk('N10 restaura y ofrece recargar', 'restaurada' in msg and await q.locator('#st-nube [data-action="bc-reload"]').count() == 1, msg)
        n_after = await q.evaluate("FP.app.cloudProvider.keys().then(k=>k.filter(x=>x!=='x').length)")
        chk('N11 los bloques están de vuelta en el almacenamiento local', n_after >= len(keys) - 1, (n_after, len(keys)))
        # ---- S3: cuenta con correo ----
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1000)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['cloud-upload']()"); await q.wait_for_timeout(3000)   # restaura la sesión anónima y la copia
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        chk('N16 anónima: el panel avisa que no hay correo vinculado', 'sin correo vinculado' in (await q.inner_text('#st-nube')))
        await q.fill('#cloud-email', 'ale@empresa.com'); await q.evaluate("FP.app.render()"); await q.wait_for_timeout(300)
        chk('N17 el correo escrito sobrevive a un re-dibujo (borrador)', await q.input_value('#cloud-email') == 'ale@empresa.com')
        await q.click('[data-action="cloud-link-send"]'); await q.wait_for_timeout(1200)
        chk('N18 pide el código de 6 dígitos', await q.locator('#cloud-code').count() == 1 and 'ale@empresa.com' in (await q.inner_text('#st-nube')), await q.inner_text('#cloud-msg'))
        await q.fill('#cloud-code', '000000'); await q.click('[data-action="cloud-code-confirm"]'); await q.wait_for_timeout(1000)
        chk('N19 código incorrecto: mensaje claro y sigue pidiendo código', 'incorrecto' in (await q.inner_text('#cloud-msg')) and await q.locator('#cloud-code').count() == 1, await q.inner_text('#cloud-msg'))
        await q.fill('#cloud-code', '123456'); await q.click('[data-action="cloud-code-confirm"]'); await q.wait_for_timeout(1200)
        chk('N20 código correcto: cuenta con correo verificado', 'ale@empresa.com' in (await q.inner_text('#st-nube')) and 'verificado' in (await q.inner_text('#st-nube')), await q.inner_text('#cloud-msg'))
        chk('N21 la sesión guardada ya no es anónima', await q.evaluate("JSON.parse(localStorage.getItem('fp.cloudSession')).anonymous") is False)
        await q.click('[data-action="cloud-signout"]'); await q.wait_for_timeout(500)
        await q.fill('#cloud-email', 'ale@empresa.com'); await q.click('[data-action="cloud-login-send"]'); await q.wait_for_timeout(1200)
        chk('N22 entrar con correo: pide código y no crea usuarios nuevos', await q.locator('#cloud-code').count() == 1 and state['otp'].get('create_user') is False, state.get('otp'))
        await q.fill('#cloud-code', '654321'); await q.click('[data-action="cloud-code-confirm"]'); await q.wait_for_timeout(1200)
        chk('N23 entró con su correo y puede restaurar', 'ale@empresa.com' in (await q.inner_text('#st-nube')) and 'Restaurar' in (await q.inner_text('#st-nube')), await q.inner_text('#cloud-msg'))
        # ---- S2: sincronización automática ----
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1000)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.lsStorage.save('cohereApiKey','SECRETO2'); FP.app.lsStorage.save('uxSettings',{mode:'x'}); FP.app.storage.save('aliases',{rules:['a']})")
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['cloud-upload']()"); await q.wait_for_timeout(3000)
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        rows.clear()
        chk('N24 la casilla de sincronización automática existe y empieza apagada', await q.locator('[data-action="cloud-auto-toggle"]').count() == 1 and not await q.is_checked('[data-action="cloud-auto-toggle"]'))
        await q.check('[data-action="cloud-auto-toggle"]'); await q.wait_for_timeout(2500)
        ks = sorted({y['key'] for y in rows})
        chk('N25 al encender sube solo lo liviano (sin datos pesados, sin Cohere, sin preferencias por dispositivo)', len(ks) > 0 and not any(k.split(':')[0] in ('dataset','actualData','planData','historicalData','segmentsData','plans','forecasts','cohereApiKey','uxSettings','productSettings','cloudSession') for k in ks), ks)
        await q.evaluate("FP.app.storage.save('aliases',{rules:['a','b']})"); await q.wait_for_timeout(6500)
        al = [y for y in rows if y['key'] == 'aliases']
        chk('N26 un cambio local se sube solo (sin pulsar nada)', al and 'b' in al[0]['payload'], al)
        # otro equipo cambió «aliases» después: al abrir la app se trae
        newer = json.dumps({'schemaVersion': 1, 'savedAt': '2099-01-01T00:00:00.000Z', 'data': {'rules': ['desde-otro-equipo']}})
        for y in rows:
            if y['key'] == 'aliases': y['payload'] = newer; y['updated_at'] = '2099-01-01T00:00:00.000Z'
        await q.reload(); await q.wait_for_timeout(4500)
        got = await q.evaluate("localStorage.getItem('fp.v1:aliases')")
        chk('N27 un cambio más nuevo de la nube se trae al abrir la app', got and 'desde-otro-equipo' in got, got)
        chk('N28 el dato traído conserva su fecha original (no rebota de vuelta)', got and '2099-01-01' in got, got)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(300)
        chk('N29 avisa qué se trajo de la nube', 'Se trajeron' in (await q.inner_text('#st-nube')), await q.inner_text('#st-nube'))
        chk('N29b y la app NO volvió a guardar su copia vieja encima (sigue el dato de la nube)', 'desde-otro-equipo' in (await q.evaluate("localStorage.getItem('fp.v1:aliases')")))
        await q.uncheck('[data-action="cloud-auto-toggle"]'); await q.wait_for_timeout(600)
        n0 = len(rows); await q.evaluate("FP.app.storage.save('aliases',{rules:['z']})"); await q.wait_for_timeout(6000)
        chk('N30 apagada, ya no sube cambios', all('\"z\"' not in y['payload'] and '"z"' not in y['payload'] for y in rows if y['key'] == 'aliases'))
        await q.goto(u + '#resumen'); await q.wait_for_timeout(1800)
        chk('N12 tras recargar la app arranca con los datos restaurados', await q.evaluate("FP.dataStore.allBatches(FP.app.state.store).length > 0"))
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1000)
        await q.evaluate("document.getElementById('st-adv').open=true; document.getElementById('st-nube').open=true"); await q.wait_for_timeout(200)
        await q.click('[data-action="cloud-delete"]'); await q.wait_for_timeout(1500)
        chk('N13 borrar copia vacía la nube', len(rows) == 0, len(rows))
        chk('N14 sin errores de JavaScript', not errs, errs)
        await b.close()
    print('FALLAS' if fails else 'TODO OK', fails)
asyncio.run(main())
