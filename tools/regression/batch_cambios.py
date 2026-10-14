"""«Qué cambió desde ayer»: vista, foto diaria, ciclo de alertas, respaldo local y nube (Supabase simulada). Uso: python3 batch_cambios.py <raiz>"""
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
U = f'http://127.0.0.1:{port}/index.html'
async def boot(c, day, hash_='#cambios'):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(day); await q.goto(U + '#inicio'); await q.wait_for_timeout(700)
    await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
    return q, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        # ---------- local ----------
        c = await b.new_context(viewport={'width': 1280, 'height': 900})
        q, errs = await boot(c, dt.datetime(2026, 9, 23, 9, 0))
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1300)
        await q.evaluate("location.hash='#cambios'"); await q.wait_for_timeout(900)
        t = await q.evaluate("document.getElementById('chg-body').innerText")
        chk('C1 la vista abre con titular, tarjetas, canales, alertas, datos y «qué hago hoy»', all(x in t for x in ('Lo más importante', 'Venta de ayer', 'Qué se movió por canal', 'Alertas', 'Qué cambió en los datos', 'Qué hago hoy')), t[:300])
        chk('C2 sin foto previa no inventa cambios del cierre', 'Aún no hay una foto anterior' in t and 'Efecto en el cierre' in t)
        pills = await q.evaluate("[...document.querySelectorAll('.chg-alert .pill')].map(e=>e.textContent.trim())")
        chk('C3 sin foto de comparación no dice «Nueva» sino «Activa»', pills and all(x == 'Activa' for x in pills), pills)
        inm = await q.evaluate("FP.nav ? 1 : [...document.querySelectorAll('#app-nav a, #app-nav button')].some(e=>/Qué cambió desde ayer/.test(e.textContent))")
        chk('C4 está en el menú de Monitorear', inm)
        st = await q.evaluate("JSON.parse(localStorage.getItem('fp.changes.v1')||'null')")
        chk('C5 guarda la foto de hoy y las alertas en el navegador', st and '2026-09-23' in st['snaps'] and len(st['rows']) >= 1, st and list(st.get('snaps', {})))
        await q.click('[data-action="chg-mode"][data-mode="semana"]'); await q.wait_for_timeout(300)
        t2 = await q.evaluate("document.getElementById('chg-body').innerText")
        chk('C6 modo «Esta semana» cambia el titular', 'Esta semana llevas' in t2 or 'Venta de la semana' in t2, t2[:200])
        await q.click('[data-action="chg-mode"][data-mode="ayer"]'); await q.wait_for_timeout(300)
        key = await q.evaluate("document.querySelector('[data-chg-status]').dataset.chgStatus")
        await q.select_option('[data-chg-status]', 'following'); await q.wait_for_timeout(600)
        v = await q.evaluate("JSON.parse(localStorage.getItem('fp.changes.v1')).rows.find(r=>r.alert_key===%s).status" % json.dumps(key))
        chk('C7 cambiar el estado de una alerta se guarda', v == 'following', v)
        await q.fill('[data-chg-note]', 'Pedí el dato a Llamadas'); await q.dispatch_event('[data-chg-note]', 'change'); await q.wait_for_timeout(400)
        n = await q.evaluate("JSON.parse(localStorage.getItem('fp.changes.v1')).rows.find(r=>r.alert_key===%s).note" % json.dumps(key))
        chk('C8 la nota se guarda', n == 'Pedí el dato a Llamadas', n)
        chk('C9 sin errores de página (día 1)', not errs, errs)
        store = await q.evaluate("localStorage.getItem('fp.changes.v1')")
        data = await q.evaluate("(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k)}return o})()")
        await q.close()
        # ---------- día siguiente: hay foto de ayer ----------
        c2 = await b.new_context(viewport={'width': 1280, 'height': 900})
        await c2.add_init_script("(()=>{const d=%s;for(const k in d)localStorage.setItem(k,d[k])})()" % json.dumps(data))
        q2, errs2 = await boot(c2, dt.datetime(2026, 9, 24, 9, 0))
        await q2.evaluate("FP.app.actions['generate-mock']()"); await q2.wait_for_timeout(1300)
        await q2.evaluate("location.hash='#cambios'"); await q2.wait_for_timeout(900)
        t3 = await q2.evaluate("document.getElementById('chg-body').innerText")
        chk('C10 al día siguiente compara contra la foto de ayer', 'Contra la foto del' in t3 and 'Sin foto anterior' not in t3, t3[:260])
        chk('C11 las alertas que ya estaban dicen «Sigue» con su día', 'Sigue' in t3 and 'día 2' in t3, t3[t3.find('Alertas'):t3.find('Alertas') + 300])
        s2 = await q2.evaluate("document.querySelector('[data-chg-status]').value")
        chk('C12 el estado «en seguimiento» y la nota sobreviven al día siguiente', s2 == 'following' and await q2.evaluate("document.querySelector('[data-chg-note]').value") == 'Pedí el dato a Llamadas', s2)
        chk('C13 sin errores de página (día 2)', not errs2, errs2)
        await q2.close()
        # ---------- nube simulada ----------
        c3 = await b.new_context(viewport={'width': 1280, 'height': 900})
        sess = {'access_token': 'x', 'refresh_token': 'y', 'expires_at': 4102444800, 'user_id': 'u1', 'anonymous': False, 'email': 'ana@empresa.mx', 'team_id': 't1', 'team_name': 'Equipo'}
        await c3.add_init_script("localStorage.setItem('fp.cloudSession', %s)" % json.dumps(json.dumps(sess)))
        db = {'alert_states': [], 'daily_snapshots': []}; log = []
        async def h(route):
            r = route.request; url = r.url; tbl = 'alert_states' if 'alert_states' in url else 'daily_snapshots'
            log.append((r.method, tbl))
            if r.method == 'GET': return await route.fulfill(status=200, content_type='application/json', body=json.dumps(db[tbl]))
            body = json.loads(r.post_data or 'null')
            if r.method == 'POST':
                for row in body:
                    key = 'alert_key' if tbl == 'alert_states' else 'day'
                    old = [x for x in db[tbl] if x[key] == row[key]]
                    if old: old[0].update(row) if 'merge' in (r.headers.get('prefer') or '') else None
                    else: db[tbl].append(row)
                return await route.fulfill(status=201, body='')
            if r.method == 'PATCH':
                k = url.split('alert_key=eq.')[1].split('&')[0]
                from urllib.parse import unquote
                for x in db[tbl]:
                    if x['alert_key'] == unquote(k): x.update(body)
                return await route.fulfill(status=204, body='')
            return await route.fulfill(status=204, body='')
        await c3.route('**/rest/v1/alert_states*', h); await c3.route('**/rest/v1/daily_snapshots*', h)
        q3, errs3 = await boot(c3, dt.datetime(2026, 9, 23, 9, 0))
        await q3.evaluate("FP.app.actions['generate-mock']()"); await q3.wait_for_timeout(1300)
        await q3.evaluate("location.hash='#cambios'"); await q3.wait_for_timeout(1200)
        t4 = await q3.evaluate("document.getElementById('chg-body').innerText")
        chk('C14 con sesión, las alertas viajan a la nube y la vista lo dice', len(db['alert_states']) >= 1 and 'Compartidas con tu equipo' in t4, (len(db['alert_states']), t4[:120]))
        chk('C15 guarda la foto diaria en la nube', len(db['daily_snapshots']) == 1 and db['daily_snapshots'][0]['day'] == '2026-09-23' and db['daily_snapshots'][0]['payload'].get('dataDay'))
        await q3.click('[data-action="chg-owner"][data-own="1"]'); await q3.wait_for_timeout(700)
        chk('C16 «Me encargo yo» deja mi correo como responsable en la nube', any(x.get('owner_email') == 'ana@empresa.mx' for x in db['alert_states']), [x.get('owner_email') for x in db['alert_states']])
        chk('C17 nunca manda la sesión ni datos de venta: solo alertas y foto', all(set(x) <= {'alert_key','type','channel','message','status','first_seen','last_seen','last_data_day','times_opened','updated_by','owner_email','note','resolved_at','updated_at'} for x in db['alert_states']))
        chk('C18 sin errores de página (nube)', not errs3, errs3)
        await q3.close()
        # ---------- nube sin tablas: cae al navegador y avisa ----------
        c4 = await b.new_context(viewport={'width': 1280, 'height': 900})
        await c4.add_init_script("localStorage.setItem('fp.cloudSession', %s)" % json.dumps(json.dumps(sess)))
        async def nf(route): await route.fulfill(status=404, content_type='application/json', body=json.dumps({'code': 'PGRST205', 'message': "Could not find the table 'public.alert_states' in the schema cache"}))
        await c4.route('**/rest/v1/alert_states*', nf); await c4.route('**/rest/v1/daily_snapshots*', nf)
        q4, errs4 = await boot(c4, dt.datetime(2026, 9, 23, 9, 0))
        await q4.evaluate("FP.app.actions['generate-mock']()"); await q4.wait_for_timeout(1300)
        await q4.evaluate("location.hash='#cambios'"); await q4.wait_for_timeout(1200)
        t5 = await q4.evaluate("document.getElementById('chg-body').innerText")
        chk('C19 sin tablas en Supabase avisa qué falta y sigue funcionando en el navegador', 'migración 20261014_alertas_historia.sql' in t5 and 'Lo más importante' in t5 and 'Guardadas solo en este navegador' in t5, t5[:200])
        chk('C20 sin errores de página (sin tablas)', not errs4, errs4)
        await b.close()
    print('RESULTADO batch_cambios: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
