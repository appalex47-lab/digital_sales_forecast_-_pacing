"""IA por el servidor del equipo (Edge Function simulada): estado en Configuración, prueba de conexión, sin key en el navegador. Uso: python3 batch_cohere_proxy.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
mode = {'fn': 200}; seen = []
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        async def fn(route):
            r = route.request
            if r.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
            seen.append({'auth': r.headers.get('authorization'), 'body': r.post_data})
            if mode['fn'] == 404: return await route.fulfill(status=404, content_type='application/json', headers=CORS, body='{"code":"NOT_FOUND"}')
            if mode['fn'] == 503: return await route.fulfill(status=503, content_type='application/json', headers=CORS, body='{"error":{"code":"not_configured","message":"x"}}')
            return await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'message': {'content': [{'text': '{"ok":true}'}]}}))
        await q.route('https://odsaouldxxjurniizefc.supabase.co/functions/v1/cohere-proxy', fn)
        async def direct(route): seen.append({'direct': True}); await route.fulfill(status=200, content_type='application/json', headers=CORS, body='{}')
        await q.route('https://api.cohere.com/**', direct)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        async def prep():
            await q.goto(u + '#ajustes'); await q.reload(); await q.wait_for_timeout(1500)
            await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            await q.evaluate("document.getElementById('st-adv').open=true; const e=document.getElementById('st-ia'); if(e) e.open=true"); await q.wait_for_timeout(250)
        await prep()
        chk('C1 sin sesión: se explica que se usa la key pegada y no hay botón de probar el servidor', await q.locator('[data-ai-local]').count() == 1 and await q.locator('[data-action="dx-proxy-test"]').count() == 0)
        chk('C2 sin sesión ni key la IA no está disponible', await q.evaluate("FP.cohereConnection.isConfigured()") is False)
        await q.evaluate("localStorage.setItem('fp.cloudSession', JSON.stringify({access_token:'TOK-USER',refresh_token:'r-1',expires_at:Math.floor(Date.now()/1000)+3600,user_id:'u1',email:'ana@empresa.com',anonymous:false,team_id:'T-A',team_name:'Ecommerce'}))")
        await prep()
        chk('C3 con sesión: avisa que la IA usa el servidor del equipo', await q.locator('[data-ai-server]').count() == 1 and 'servidor de tu equipo' in await q.inner_text('[data-ai-server]'))
        chk('C4 con sesión la IA está disponible sin pegar ninguna key', await q.evaluate("FP.cohereConnection.isConfigured()") is True and await q.evaluate("FP.app.state.dx.apiKey") == '')
        await q.click('[data-action="dx-proxy-test"]'); await q.wait_for_timeout(1500)
        m = await q.inner_text('#dx-proxy-msg')
        chk('C5 la prueba funciona y dice que fue por el servidor', 'Funciona' in m and 'servidor del equipo' in m, m)
        chk('C6 la llamada llevó el token del usuario y nada fue directo a Cohere', len(seen) == 1 and seen[0]['auth'] == 'Bearer TOK-USER' and not any(x.get('direct') for x in seen), seen)
        chk('C7 ningún Authorization de Cohere ni key en el cuerpo enviado', 'api.cohere.com' not in json.dumps(seen) and 'apiKey' not in (seen[0]['body'] or ''))
        mode['fn'] = 404; await q.click('[data-action="dx-proxy-test"]'); await q.wait_for_timeout(1500)
        m = await q.inner_text('#dx-proxy-msg'); chk('C8 función no instalada: mensaje claro con el nombre de la función', 'cohere-proxy' in m and 'Supabase' in m, m)
        mode['fn'] = 503; await q.click('[data-action="dx-proxy-test"]'); await q.wait_for_timeout(1500)
        m = await q.inner_text('#dx-proxy-msg'); chk('C9 sin secreto: dice que falta COHERE_API_KEY', 'COHERE_API_KEY' in m, m)
        chk('C10 el resumen de la sección dice «Servidor del equipo»', 'Servidor del equipo' in await q.inner_text('#st-ia'))
        n = len(seen); await q.evaluate("localStorage.removeItem('fp.cloudSession')"); await prep()
        chk('C11 al cerrar sesión vuelve el modo de key local', await q.locator('[data-ai-local]').count() == 1)
        chk('C12 sin errores de JavaScript', not errs, errs)
        await b.close()
    print('FALLAS' if fails else 'TODO OK', fails)
asyncio.run(main())
sys.exit(1 if fails else 0)
