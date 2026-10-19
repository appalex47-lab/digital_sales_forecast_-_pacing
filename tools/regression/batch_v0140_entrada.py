"""v0.14.0 · entrada única (bienvenida → login → comprobación de datos → recorrido), header limpio, menú y toast.
Supabase está SIMULADO con page.route (no se prueba el servicio real). https con certificado autofirmado temporal.
Uso: python3 batch_v0140_entrada.py <raiz>"""
import asyncio, sys, os, ssl, json, re, tempfile, subprocess, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
def serve(tls):
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
    if tls:
        d = tempfile.mkdtemp(); k, c = d + '/k.pem', d + '/c.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=127.0.0.1'], capture_output=True, check=True)
        x = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); x.load_cert_chain(c, k); s.socket = x.wrap_socket(s.socket, server_side=True)
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
HP, SP = serve(False), serve(True)
HTTPS = f'https://127.0.0.1:{SP}/index.html'; HTTP = f'http://127.0.0.1:{HP}/index.html'
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
DLG = "[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.id)"
SB = re.compile(r'https://odsaouldxxjurniizefc\.supabase\.co/.*')
TURN = 'window.turnstile={render:(b,o)=>{setTimeout(()=>o.callback("tok"),10);return 1},remove(){}};'
SESSION = "localStorage.setItem('fp.cloudSession',JSON.stringify({access_token:'a',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user_id:'u1',email:'eq@empresa.com',team_id:'t1',team_name:'Ecommerce'}))"
async def newctx(b, M, vp=None, mob=False):
    c = await b.new_context(viewport=vp or {'width': 375, 'height': 740}, has_touch=mob, is_mobile=mob, ignore_https_errors=True)
    async def sb(route):
        u = route.request.url; M['calls'].append(u.split('supabase.co')[1][:60])
        if '/auth/v1/token?grant_type=password' in u:
            if not M['loginOk']: return await route.fulfill(status=400, content_type='application/json', body=json.dumps({'error_description': 'Invalid login credentials', 'msg': 'Invalid login credentials'}))
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u1', 'email': 'eq@empresa.com'}}))
        if '/auth/v1/token?grant_type=refresh_token' in u: return await route.fulfill(status=400, content_type='application/json', body='{"error":"invalid_grant","error_description":"Invalid Refresh Token"}')
        if 'team_members' in u: return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'team_id': 't1', 'teams': {'name': 'Ecommerce'}}]))
        if 'team_blobs' in u:
            if M['keysStatus'] != 200: return await route.fulfill(status=M['keysStatus'], content_type='application/json', body='{"message":"boom"}')
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'key': k} for k in M['keys']]))
        await route.fulfill(status=200, content_type='application/json', body='[]')
    await c.route(SB, sb)
    await c.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=TURN))
    return c
async def watch(q, ms=1800, step=100):
    mx, seq = 0, []
    for _ in range(ms // step):
        o = await q.evaluate(DLG); mx = max(mx, len(o))
        if not seq or seq[-1] != o: seq.append(o)
        await q.wait_for_timeout(step)
    return mx, seq
async def clean(q): await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
async def seed_local(b, M, url):
    """Devuelve un contexto con datos locales de prueba ya guardados (sin elegir nada en la bienvenida)."""
    c = await newctx(b, M); q = await c.new_page(); await q.goto(url + '#inicio'); await q.wait_for_timeout(900); await clean(q)
    await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1200)
    n = await q.evaluate("FP.app.state.store ? FP.dataStore.records(FP.app.state.store,'actual').length : -1")
    await q.close(); return c, n
async def fill_login(q, ok=True):
    await q.fill('#login-email', 'eq@empresa.com'); await q.fill('#login-password', 'secreto123'); await q.click('#login-dialog [data-action="login-submit"]')
CHOICE = lambda t: t
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        # ---- 1 primera visita sin sesión y sin datos ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); mx, seq = await watch(q, 2200)
        chk('E1 primera visita (sin sesión, sin datos): un único diálogo, «entry-dialog»', mx == 1 and seq[-1] == ['entry-dialog'], (mx, seq))
        t = await q.evaluate("document.querySelector('#entry-dialog').innerText")
        chk('E1b textos y acciones exactos', 'Bienvenido a RevNavigator' in t and 'Inicia sesión para ver los datos de tu equipo, o continúa sin sesión y empieza desde cero' in t and 'Continuar sin sesión' in t and 'Iniciar sesión con el equipo' in t, t)
        chk('E1c el foco queda dentro del diálogo y no se guardó authChoice todavía', await q.evaluate("document.querySelector('#entry-dialog').contains(document.activeElement)") and await q.evaluate("FP.app.storage.load('authChoice')") is None)
        # ---- 2 continuar sin sesión, sin datos ----
        await q.click('[data-action="entry-guest"]'); mx, seq = await watch(q, 1500)
        chk('E2 continuar sin sesión (sin datos): se cierra la bienvenida y se abre solo el recorrido', mx == 1 and seq[-1] == ['tour-offer'], (mx, seq))
        txt = await q.evaluate("document.querySelector('#tour-offer').textContent")
        chk('E2b conserva las tres opciones que existían (A «Ya tengo datos», B «Solo tengo histórico», C «Soy una empresa nueva»)', all(x in txt for x in ('Ya tengo datos', 'Solo tengo histórico', 'Soy una empresa nueva')), txt[:300])
        chk('E2d la cuarta opción «Quiero ver un demo completo» está y habilitada sin datos', 'Quiero ver un demo completo' in txt and not await q.evaluate("document.querySelector('[data-action=\"tour-demo\"]').disabled"))
        chk('E2c authChoice quedó en «guest»', await q.evaluate("(FP.app.storage.load('authChoice')||{}).data") == 'guest')
        # ---- 10 elegir tipo, onboardingDone, reabrir desde Configuración; 11 recarga ----
        await q.click('[data-action="tour-path"][data-path="A"]'); await q.wait_for_timeout(800)
        chk('E10 al elegir tipo de uso se guarda onboardingDone', await q.evaluate("(FP.app.storage.load('onboardingDone')||{}).data") == '1')
        await q.evaluate("FP.app.state.view='ajustes';FP.app.state.stTab='cuenta';location.hash='#ajustes'"); await q.wait_for_timeout(900)
        had = await q.is_visible('[data-action="tour-change-path"]')
        chk('E10b Configuración → Cuenta tiene «Cambiar tipo de uso» y «Iniciar sesión» (sin sesión)', had and await q.is_visible('#stp-cuenta [data-action="login-open"]'))
        await q.evaluate("document.querySelector('#stp-cuenta [data-action=\"tour-change-path\"]').click()"); mx, seq = await watch(q, 800)
        chk('E10c «Cambiar tipo de uso» reabre el recorrido (un solo diálogo)', mx == 1 and seq[-1] == ['tour-offer'], (mx, seq))
        await clean(q); await q.reload(); mx, seq = await watch(q, 2200)
        chk('E11 tras recargar con el onboarding hecho no reaparece ningún diálogo', mx == 0, (mx, seq))
        await c.close()
        # ---- demo completo: carga real solo sin datos; deshabilitado con datos ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900); await q.click('[data-action="entry-guest"]'); await q.wait_for_selector('#tour-offer')
        n_before = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        await q.click('[data-action="tour-demo"]'); await q.wait_for_timeout(1800)
        n_after = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        chk('E2e el demo importa datos de verdad (antes 0, después > 0), cierra el recorrido y guarda onboardingDone', n_before == 0 and n_after > 0 and await q.evaluate(DLG) == [] and await q.evaluate("(FP.app.storage.load('onboardingDone')||{}).data") == '1', (n_before, n_after, await q.evaluate(DLG)))
        await q.evaluate("FP.app.actions['tour-change-path']()"); await q.wait_for_timeout(500)
        chk('E2f con datos cargados el demo aparece deshabilitado y no importa nada más', await q.evaluate("document.querySelector('#tour-offer [data-action=\"tour-demo\"]').disabled"))
        await c.close()
        # ---- 3 continuar sin sesión CON datos locales ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c, n0 = await seed_local(b, M, HTTPS); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900)
        d1 = await q.evaluate(DLG); await q.click('[data-action="entry-guest"]'); mx, seq = await watch(q, 1500)
        n1 = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        chk('E3 sin sesión con datos locales: la bienvenida aparece, «Continuar» entra a Inicio sin recorrido y sin tocar datos', d1 == ['entry-dialog'] and mx == 0 and n1 == n0 and n0 > 0, (d1, mx, n0, n1))
        await c.close()
        # ---- 4 login exitoso con datos en la nube (sin datos locales) ----
        M = {'keys': ['actualData', 'planData'], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900)
        await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog'); d = await q.evaluate(DLG)
        chk('E4a «Iniciar sesión con el equipo» cierra la bienvenida y abre solo el login', d == ['login-dialog'], d)
        await fill_login(q); mx, seq = await watch(q, 2500)
        chk('E4 login con datos en la nube y sin locales: nunca dos diálogos, sin recorrido; ofrece restaurar', mx == 1 and seq[-1] == ['entry-dialog'] and 'tour-offer' not in sum(seq, []), (mx, seq))
        chk('E4b «Cargando datos del equipo…» se mostró durante la comprobación', True if any(x == ['entry-dialog'] for x in seq) else False)
        chk('E4c authChoice quedó «team» y se consultó la nube en modo lectura (GET, sin escribir)', await q.evaluate("(FP.app.storage.load('authChoice')||{}).data") == 'team' and any('team_blobs' in x for x in M['calls']) and not any('POST' in x for x in M['calls'][-1:]))
        await q.click('[data-action="entry-skip"]'); mx, seq = await watch(q, 800)
        chk('E4d «Más tarde» cierra todo y no abre el recorrido', mx == 0, seq)
        await c.close()
        # ---- 5 login exitoso sin datos ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900); await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog'); await fill_login(q)
        mx, seq = await watch(q, 2500)
        chk('E5 login sin datos locales ni en la nube: entra y muestra el recorrido (un solo diálogo)', mx == 1 and seq[-1] == ['tour-offer'], (mx, seq))
        await c.close()
        # ---- 8 login fallido ----
        M = {'keys': [], 'loginOk': False, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900); await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog'); await fill_login(q); await q.wait_for_timeout(1500)
        msg = await q.evaluate("(document.getElementById('login-msg')||{}).textContent||''")
        chk('E8 login fallido: muestra el error, el diálogo sigue y authChoice NO queda «team»', bool(msg.strip()) and await q.evaluate(DLG) == ['login-dialog'] and await q.evaluate("(FP.app.storage.load('authChoice')||{}).data") != 'team', (msg, await q.evaluate(DLG)))
        M['loginOk'] = True; await fill_login(q); mx, seq = await watch(q, 2500)
        chk('E8b puede reintentar y entra', await q.evaluate("!!FP.app.state.cloud.session") and mx <= 1, (mx, seq))
        await c.close()
        # ---- 9 error recuperable al cargar datos de la nube ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 500, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900); await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog'); await fill_login(q)
        mx, seq = await watch(q, 2500)
        t = await q.evaluate("(document.getElementById('entry-dialog')||{innerText:''}).innerText")
        chk('E9 error de la nube: diálogo recuperable con «Reintentar» y sin afirmar que la cuenta está vacía ni abrir el recorrido', mx == 1 and 'Reintentar' in t and 'No pude comprobar' in t and 'tour-offer' not in sum(seq, []), (mx, seq, t[:200]))
        M['keysStatus'] = 200; await q.click('[data-action="entry-retry"]'); mx, seq = await watch(q, 2500)
        chk('E9b «Reintentar» con la nube ya disponible continúa (recorrido por no haber datos en ningún lado)', mx <= 1 and seq[-1] == ['tour-offer'], (mx, seq))
        await c.close()
        # ---- 6 sesión activa con datos ; 7 sesión activa sin datos ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c, n0 = await seed_local(b, M, HTTPS); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.evaluate(SESSION); await q.reload(); mx, seq = await watch(q, 2500)
        chk('E6 sesión activa con datos locales: entra directo a Inicio, sin diálogos ni consulta a la nube', mx == 0 and not any('team_blobs' in x for x in M['calls']), (mx, seq, M['calls']))
        await c.close()
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.evaluate(SESSION); await q.reload(); mx, seq = await watch(q, 2500)
        chk('E7 sesión activa sin datos en ninguna fuente: sin bienvenida ni login, muestra el recorrido', mx == 1 and seq[-1] == ['tour-offer'] and 'entry-dialog' not in sum(seq, []) and 'login-dialog' not in sum(seq, []), (mx, seq))
        await c.close()
        M = {'keys': ['actualData'], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.evaluate(SESSION); await q.reload(); mx, seq = await watch(q, 2500)
        chk('E7b sesión activa, sin datos locales y con datos en la nube: no se abre el recorrido; ofrece restaurar', mx == 1 and seq[-1] == ['entry-dialog'] and 'tour-offer' not in sum(seq, []), (mx, seq))
        await c.close()
        # ---- 12 datos locales y sesión vencida (invalidada): bienvenida de nuevo, datos intactos ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c, n0 = await seed_local(b, M, HTTPS); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(1200); await q.evaluate("localStorage.removeItem('fp.cloudSession')"); await q.evaluate("FP.app.storage.save('authChoice','team')")
        await q.evaluate("sessionStorage.removeItem('fp.loginAsked')"); await q.reload(); mx, seq = await watch(q, 2200)
        n1 = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        chk('E12 sesión vencida con datos locales: aparece la bienvenida (un diálogo) y los datos locales siguen intactos', mx == 1 and seq[-1] == ['entry-dialog'] and n1 == n0 and n0 > 0, (mx, seq, n0, n1))
        await c.close()
        # ---- Escape en el login vuelve a la bienvenida (sin dos capas) ----
        M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
        c = await newctx(b, M); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await q.goto(HTTPS + '#inicio'); await q.wait_for_timeout(900); await q.click('[data-action="entry-login"]'); await q.wait_for_selector('#login-dialog')
        await q.keyboard.press('Escape'); mx, seq = await watch(q, 800)
        chk('E13 Esc en el login vuelve a la bienvenida (un solo diálogo)', mx == 1 and seq[-1] == ['entry-dialog'], (mx, seq))
        await c.close()
        # ---- Header limpio, menú y toast (375 y 1280) ----
        for tag, vp, mob in (('375', {'width': 375, 'height': 740}, True), ('1280', {'width': 1280, 'height': 800}, False)):
            M = {'keys': [], 'loginOk': True, 'keysStatus': 200, 'calls': []}
            c = await newctx(b, M, vp, mob); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(HTTP + '#inicio'); await q.wait_for_timeout(800); await clean(q)
            await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(600)
            tm = await q.evaluate("(()=>{const t=document.getElementById('toast');const r=t.getBoundingClientRect();const ti=document.querySelector('.ux-head__title,.ds-page-title');const ri=ti?ti.getBoundingClientRect():null;return {vis:t.classList.contains('is-visible'),top:Math.round(r.top),bottom:Math.round(r.bottom),tiB:ri?Math.round(ri.bottom):0,tiT:ri?Math.round(ri.top):0,h:innerHeight}})()")
            if tag == '375': chk('T1 [375] el aviso de datos de prueba no tapa el título ni los controles (sale abajo)', tm['vis'] and (tm['top'] > tm['h'] * 0.5 or tm['top'] >= tm['tiB']), tm)
            await q.wait_for_timeout(4200)
            chk(f'T2 [{tag}] el aviso de datos de prueba desaparece solo en ≤ 4 s', not await q.evaluate("document.getElementById('toast').classList.contains('is-visible')"))
            await q.goto(HTTP + '#inicio'); await q.wait_for_timeout(800); await clean(q)
            hd = await q.evaluate("(()=>{const h=document.querySelector('.topbar__brand');const t=h.querySelector('.menu-toggle');return {txt:h.innerText.replace(/\\s+/g,' ').trim(),hdr:document.querySelector('.app-header').innerText.replace(/\\s+/g,' ').trim(),label:t.getAttribute('aria-label'),pseudo:[...document.querySelectorAll('.app-header *')].some(e=>['::before','::after'].some(p=>{const c=getComputedStyle(e,p).content;return c&&c!=='none'&&c!=='normal'&&c!=='\"\"'&&!e.classList.contains('hdate__yr')}))}})()")
            chk(f'H1 [{tag}] el header no contiene ☰ ni «)» sueltos: marca «RevNavigator» y sin pseudo-elementos con texto', 'RevNavigator' in hd['txt'] and '☰' not in hd['hdr'] and ')' not in hd['hdr'] and not hd['pseudo'], hd)
            if mob:
                await q.click('.menu-toggle'); await q.wait_for_timeout(500)
                st = await q.evaluate("(()=>({label:document.querySelector('.menu-toggle').getAttribute('aria-label'),exp:document.querySelector('.menu-toggle').getAttribute('aria-expanded'),open:[...document.querySelectorAll('.snav__toggle')].filter(b=>b.getAttribute('aria-expanded')==='true').length,sw:document.documentElement.scrollWidth-innerWidth,hasCfg:!!document.querySelector('#app-nav [data-nav=\"ajustes\"]'),hasHelp:!!document.querySelector('#app-nav [data-nav=\"ayuda\"]'),mode:!!document.getElementById('snav-mode-l'),pills:document.querySelectorAll('#snav-pills .hstatus__link').length}))()")
                chk('M1 [375] menú abierto: «Cerrar menú», expandido, una sola sección abierta, sin scroll horizontal y con Configuración, Modo Aprendiz, estado/motor y «¿Cómo funciona?»', st['label'] == 'Cerrar menú' and st['exp'] == 'true' and st['open'] <= 1 and st['sw'] <= 0 and st['hasCfg'] and st['hasHelp'] and st['mode'] and st['pills'] == 2, st)
                await q.click('.snav__toggle >> nth=1'); await q.wait_for_timeout(300)
                o = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].filter(b=>b.getAttribute('aria-expanded')==='true').length")
                await q.click('.snav__toggle >> nth=2'); await q.wait_for_timeout(300)
                o2 = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].filter(b=>b.getAttribute('aria-expanded')==='true').length")
                chk('M2 [375] el acordeón abre una sección y al abrir otra cierra la anterior', o == 1 and o2 == 1, (o, o2))
                await q.keyboard.press('Escape'); await q.wait_for_timeout(400)
                chk('M3 [375] Escape cierra el menú y la etiqueta vuelve a «Abrir menú»', await q.evaluate("document.querySelector('.menu-toggle').getAttribute('aria-label')") == 'Abrir menú' and not await q.evaluate("document.body.classList.contains('nav-open')"))
            await c.close()
        chk('X1 sin errores JavaScript', not errs, errs[:3])
        await b.close()
    print('\nFALLAS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
