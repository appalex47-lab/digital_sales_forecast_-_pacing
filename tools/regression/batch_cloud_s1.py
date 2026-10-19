"""Nube por equipo (Supabase simulado): inicio de sesión con contraseña, equipo compartido, subir/restaurar, sync automática, cambio de contraseña.
Uso: python3 batch_cloud_s1.py <raiz>"""
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
USERS = {'ana@empresa.com': {'id': 'u1', 'pw': 'clave-ana-1', 'team': 'T-A'}, 'otro@otra.com': {'id': 'u2', 'pw': 'clave-otro-1', 'team': 'T-B'}, 'sin@empresa.com': {'id': 'u3', 'pw': 'clave-sin-1', 'team': None}}
TEAMS = {'T-A': 'Ecommerce', 'T-B': 'Otra empresa'}
rows = []; tokens = {'AT7': 'u1'}; calls = []
def by_id(i): return next((e, v) for e, v in USERS.items() if v['id'] == i)
async def signout_flow(q, sel):
    """v0.14.1: cerrar sesión ahora abre un diálogo (comprobación + casilla si hay algo sin respaldar) y recarga la página."""
    await q.click(sel)
    await q.wait_for_selector('#signout-dialog [data-action="signout-confirm"]', timeout=8000)
    await q.wait_for_function("!document.querySelector('#signout-dialog').innerText.includes('Comprobando')", timeout=8000)
    ack = q.locator('#signout-dialog input[data-action="signout-ack"]')
    if await ack.count(): await ack.check()
    await q.click('#signout-dialog [data-action="signout-confirm"]'); await q.wait_for_timeout(2500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")   # tras recargar vuelve la bienvenida (es lo esperado)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        def jr(route, status, obj): return route.fulfill(status=status, content_type='application/json', headers=CORS, body=json.dumps(obj))
        async def handler(route):
            r = route.request; u = urlparse(r.url); calls.append(f'{r.method} {u.path}')
            if r.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            if u.path == '/auth/v1/token':
                body = json.loads(r.post_data); gt = parse_qs(u.query).get('grant_type', [''])[0]
                if gt == 'refresh_token':
                    uid = body['refresh_token'].replace('r-', ''); e, v = by_id(uid); tokens['T-' + uid] = uid
                    return await jr(route, 200, {'access_token': 'T-' + uid, 'refresh_token': 'r-' + uid, 'expires_in': 3600, 'user': {'id': uid, 'email': e}})
                v = USERS.get(body.get('email'))
                if not v or v['pw'] != body.get('password'): return await jr(route, 400, {'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
                tokens['T-' + v['id']] = v['id']
                return await jr(route, 200, {'access_token': 'T-' + v['id'], 'refresh_token': 'r-' + v['id'], 'expires_in': 3600, 'user': {'id': v['id'], 'email': body['email'], 'is_anonymous': False}})
            tk = (r.headers.get('authorization') or '').replace('Bearer ', ''); uid = tokens.get(tk)
            if not uid: return await jr(route, 401, {'message': 'JWT'})
            e, me = by_id(uid)
            if u.path == '/auth/v1/user':
                if r.method == 'GET': return await jr(route, 200, {'id': uid, 'email': e, 'is_anonymous': False})
                npw = json.loads(r.post_data)['password']
                if npw == me['pw']: return await jr(route, 422, {'error_code': 'same_password', 'msg': 'New password should be different from the old password.'})
                me['pw'] = npw; return await jr(route, 200, {'id': uid})
            team = me['team']
            if u.path == '/rest/v1/team_members': return await jr(route, 200, [{'team_id': team, 'teams': {'name': TEAMS[team]}}] if team else [])
            if not team: return await jr(route, 200, [])
            if r.method == 'POST':
                for x in json.loads(r.post_data):
                    assert x['team_id'] == team
                    rows[:] = [y for y in rows if not (y['team_id'] == team and y['key'] == x['key'] and y['part'] == x['part'])] + [x]
                return await route.fulfill(status=201, body='', headers=CORS)
            qs = parse_qs(u.query); sel = [y for y in rows if y['team_id'] == team]
            k = qs.get('key', [''])[0]; pt = qs.get('part', [''])[0]
            if k.startswith('eq.'): sel = [y for y in sel if y['key'] == k[3:]]
            if k.startswith('neq.'): sel = [y for y in sel if y['key'] != k[4:]]
            if pt.startswith('gte.'): sel = [y for y in sel if y['part'] >= int(pt[4:])]
            if pt.startswith('eq.'): sel = [y for y in sel if y['part'] == int(pt[3:])]
            if r.method == 'DELETE':
                for y in sel: rows.remove(y)
                return await route.fulfill(status=204, body='', headers=CORS)
            return await jr(route, 200, sorted([{'key': y['key'], 'part': y['part'], 'total': y['total'], 'payload': y['payload'], 'updated_at': y['updated_at']} for y in sel], key=lambda z: (z['key'], z['part'])))
        await q.route('https://odsaouldxxjurniizefc.supabase.co/**', handler)
        async def ts(route):
            await route.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(el,o){setTimeout(function(){o.callback('TOK-PW')},50);return 'w1'},remove:function(){}}")
        await q.route('https://challenges.cloudflare.com/**', ts)
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        async def prep(h='#ajustes'):
            await q.goto(u + h); await q.wait_for_timeout(1200)
            await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        async def openNube():
            await q.evaluate("document.querySelectorAll('dialog:not(#login-dialog):not(#signout-dialog)').forEach(d=>d.remove())")   # la entrada puede ofrecer restaurar/recorrido tras vaciar el navegador
            await q.evaluate("FP.app.state.stTab='cuenta'; FP.app.render()"); await q.wait_for_timeout(250)
        async def login(email, pw):
            await q.evaluate("FP.app.actions['login-open']()"); await q.wait_for_selector('#login-dialog[open]')
            await q.fill('#login-email', email); await q.fill('#login-password', pw); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1200)
        await prep()
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.evaluate("FP.app.lsStorage.save('cohereApiKey','SECRETO-COHERE')")
        await prep(); await openNube()
        chk('L1 la sección «Nube» existe y al abrir la pantalla NO hay llamadas a Supabase', await q.evaluate("!!document.getElementById('st-nube')") and not calls and not rows, calls)
        chk('L2 en http no aparece sola la ventana de inicio de sesión', await q.locator('#login-dialog').count() == 0)
        t = await q.inner_text('#st-nube')
        chk('L3 sin sesión: botón «Iniciar sesión» y subir/restaurar/borrar deshabilitados', 'Iniciar sesión' in t and await q.is_disabled('[data-action="cloud-upload"]') and await q.is_disabled('[data-action="cloud-download"]') and await q.is_disabled('[data-action="cloud-delete"]'))
        chk('L4 no existen botones de «vincular correo», registro ni código', not any(x in t for x in ['Vincular', 'Entrar con mi correo', 'Confirmar código']) and 'anónima' not in t.lower())
        await q.click('#view-ajustes [data-action="login-open"]'); await q.wait_for_selector('#login-dialog[open]')
        chk('L5 la ventana pide correo y contraseña (campo de contraseña oculto)', await q.get_attribute('#login-password', 'type') == 'password' and await q.locator('#login-email').count() == 1)
        await q.fill('#login-email', 'ana@empresa.com'); await q.fill('#login-password', 'incorrecta'); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1000)
        chk('L6 contraseña incorrecta: mensaje claro y la ventana sigue abierta', 'incorrectos' in await q.inner_text('#login-msg') and await q.locator('#login-dialog[open]').count() == 1, await q.inner_text('#login-msg'))
        await q.fill('#login-password', 'clave-sin-1'); await q.fill('#login-email', 'sin@empresa.com'); await q.press('#login-password', 'Enter'); await q.wait_for_timeout(1000)
        chk('L7 Enter envía el formulario; usuario sin equipo: se explica y no hay sesión', 'ningún equipo' in await q.inner_text('#login-msg') and await q.evaluate("localStorage.getItem('fp.cloudSession')") is None, await q.inner_text('#login-msg'))
        await q.fill('#login-email', 'ana@empresa.com'); await q.fill('#login-password', 'clave-ana-1'); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1500)
        await openNube(); t = await q.inner_text('#st-nube')
        chk('L8 login correcto: cierra la ventana y muestra correo y equipo', await q.locator('#login-dialog').count() == 0 and 'ana@empresa.com' in t and 'Ecommerce' in t, t[:300])
        chk('L9 la contraseña no quedó en ninguna parte guardada', 'clave-ana-1' not in json.dumps(await q.evaluate("Object.assign({}, localStorage)")))
        chk('L10 la sesión guardada trae el equipo y no es anónima', await q.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('fp.cloudSession'));return s.team_id==='T-A'&&!s.anonymous})()"))
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_timeout(3500)
        msg = await q.inner_text('#cloud-msg')
        chk('L11 sube y verifica', 'verificada' in msg and len(rows) > 0, msg)
        chk('L12 todas las filas llevan el equipo; Cohere y la sesión no viajaron', all(y['team_id'] == 'T-A' for y in rows) and not any('SECRETO-COHERE' in y['payload'] or y['key'] == 'cohereApiKey' or 'refresh_token' in y['payload'] for y in rows))
        keys = sorted({y['key'] for y in rows})
        await q.evaluate("(async()=>{await FP.app.repo.clearAll(); const s=localStorage.getItem('fp.cloudSession'); FP.app.lsStorage.clear(); localStorage.setItem('fp.cloudSession', s); FP.app.lsStorage.save('x',1)})()"); await q.wait_for_timeout(500)
        await prep(); await openNube()
        await q.click('[data-action="cloud-download"]'); await q.wait_for_timeout(3000)
        msg = await q.inner_text('#cloud-msg')
        n_after = await q.evaluate("FP.app.cloudProvider.keys().then(k=>k.filter(x=>x!=='x').length)")
        chk('L13 restaura los datos del equipo y ofrece recargar', 'restaurada' in msg and n_after >= len(keys) - 1 and await q.locator('#st-nube [data-action="bc-reload"]').count() == 1, (msg, n_after, len(keys)))
        # ---- cambio de contraseña ----
        await q.fill('#cloud-pw-new', 'nueva-clave-1'); await q.fill('#cloud-pw-new2', 'otra-distinta'); await q.click('[data-action="cloud-password-change"]'); await q.wait_for_timeout(500)
        chk('L14 contraseñas que no coinciden: se avisa y no se llama a Supabase', 'no coinciden' in await q.inner_text('#cloud-msg') and not any(x.startswith('PUT') for x in calls), calls[-3:])
        await q.fill('#cloud-pw-new', 'corta'); await q.fill('#cloud-pw-new2', 'corta'); await q.click('[data-action="cloud-password-change"]'); await q.wait_for_timeout(500)
        chk('L15 contraseña corta: se rechaza', '8 caracteres' in await q.inner_text('#cloud-msg'), await q.inner_text('#cloud-msg'))
        await q.fill('#cloud-pw-new', 'clave-ana-1'); await q.fill('#cloud-pw-new2', 'clave-ana-1'); await q.click('[data-action="cloud-password-change"]'); await q.wait_for_timeout(800)
        chk('L16 igual a la actual: se explica', 'distinta' in await q.inner_text('#cloud-msg'), await q.inner_text('#cloud-msg'))
        await q.fill('#cloud-pw-new', 'nueva-clave-1'); await q.fill('#cloud-pw-new2', 'nueva-clave-1'); await q.click('[data-action="cloud-password-change"]'); await q.wait_for_timeout(800)
        chk('L17 cambio correcto', 'Contraseña cambiada' in await q.inner_text('#cloud-msg'), await q.inner_text('#cloud-msg'))
        await signout_flow(q, '#view-ajustes [data-action="cloud-signout"]')
        chk('L18 cerrar sesión: vuelve «Iniciar sesión» y borra la sesión local', await q.locator('#view-ajustes [data-action="login-open"]').count() == 1 and await q.evaluate("localStorage.getItem('fp.cloudSession')") is None)
        await login('ana@empresa.com', 'clave-ana-1')
        chk('L19 la contraseña vieja ya no entra', 'incorrectos' in await q.inner_text('#login-msg'))
        await q.fill('#login-password', 'nueva-clave-1'); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")   # sin datos locales y con datos en la nube, la entrada propone restaurar: aquí no se usa
        await openNube(); chk('L20 la nueva sí entra', 'ana@empresa.com' in await q.inner_text('#st-nube'))
        # ---- sincronización automática ----
        await q.evaluate("FP.app.lsStorage.save('uxSettings',{mode:'x'}); FP.app.storage.save('aliases',{rules:['a']})")
        await q.evaluate("FP.app.actions['cloud-upload']()"); await q.wait_for_timeout(3000); await openNube(); rows.clear()
        chk('L21 la sincronización automática empieza apagada', await q.locator('[data-action="cloud-auto-toggle"]').count() == 1 and not await q.is_checked('[data-action="cloud-auto-toggle"]'))
        await q.check('[data-action="cloud-auto-toggle"]'); await q.wait_for_timeout(2500)
        ks = sorted({y['key'] for y in rows})
        chk('L22 al encender sube solo lo liviano', len(ks) > 0 and not any(k.split(':')[0] in ('dataset', 'actualData', 'planData', 'historicalData', 'segmentsData', 'cohereApiKey', 'uxSettings') for k in ks), ks)
        await q.evaluate("FP.app.storage.save('aliases',{rules:['a','b']})"); await q.wait_for_timeout(6500)
        al = [y for y in rows if y['key'] == 'aliases']
        chk('L23 un cambio local se sube solo', al and 'b' in al[0]['payload'], al)
        newer = json.dumps({'schemaVersion': 1, 'savedAt': '2099-01-01T00:00:00.000Z', 'data': {'rules': ['desde-otra-persona']}})
        for y in rows:
            if y['key'] == 'aliases': y['payload'] = newer; y['updated_at'] = '2099-01-01T00:00:00.000Z'
        await q.reload(); await q.wait_for_timeout(4500)
        got = await q.evaluate("localStorage.getItem('fp.v1:aliases')")
        chk('L24 lo que cambió otra persona del equipo se trae al abrir la app y no rebota', got and 'desde-otra-persona' in got and '2099-01-01' in got, got)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()"); await openNube()
        await q.uncheck('[data-action="cloud-auto-toggle"]'); await q.wait_for_timeout(600)
        await q.evaluate("FP.app.storage.save('aliases',{rules:['z']})"); await q.wait_for_timeout(6000)
        chk('L25 apagada, ya no sube cambios', all('"z"' not in y['payload'] for y in rows if y['key'] == 'aliases'))
        # ---- otro equipo ----
        await signout_flow(q, '#view-ajustes [data-action="cloud-signout"]')
        await login('otro@otra.com', 'clave-otro-1'); await openNube()
        chk('L26 otro equipo: muestra su equipo', 'Otra empresa' in await q.inner_text('#st-nube'), (await q.inner_text('#st-nube'))[:200])
        await q.click('[data-action="cloud-download"]'); await q.wait_for_timeout(1500)
        chk('L27 otro equipo NO ve la copia del primero', 'No hay copia' in await q.inner_text('#cloud-msg'), await q.inner_text('#cloud-msg'))
        await signout_flow(q, '#view-ajustes [data-action="cloud-signout"]')
        # ---- enlace del panel de Supabase (recuperación) ----
        await q.goto(u + '#access_token=AT7&refresh_token=RT7&expires_in=3600&token_type=bearer&type=recovery'); await q.reload(); await q.wait_for_timeout(2500)
        chk('L28 enlace de recuperación: abre Configuración, hash limpio, sesión con equipo y aviso de cambiar contraseña', 'access_token' not in await q.evaluate('location.hash') and 'Cambia tu contraseña' in await q.inner_text('#st-nube') and await q.evaluate("JSON.parse(localStorage.getItem('fp.cloudSession')).team_id") == 'T-A', (await q.inner_text('#st-nube'))[:300])
        await q.goto(u + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'); await q.reload(); await q.wait_for_timeout(2500)
        chk('L29 enlace vencido: se explica sin romper la app', 'venció' in await q.inner_text('#st-nube') or 'ya se usó' in await q.inner_text('#st-nube'))
        await prep(); await openNube()
        await q.click('[data-action="cloud-delete"]'); await q.wait_for_timeout(1500)
        chk('L30 borrar copia vacía la nube del equipo', not any(y['team_id'] == 'T-A' for y in rows), len(rows))
        chk('L31 nunca se llamó a registro, OTP ni rutas admin', not any(('signup' in x or 'otp' in x or 'admin' in x) for x in calls), [x for x in calls if 'auth' in x][:6])
        chk('L32 sin errores de JavaScript', not errs, errs)
        await b.close()
    print('FALLAS' if fails else 'TODO OK', fails)
asyncio.run(main())
sys.exit(1 if fails else 0)
