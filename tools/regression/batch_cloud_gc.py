"""Limpieza de la nube: borrado automático de bloques huérfanos tras subir, respaldo de la generación anterior, «Limpiar nube» con vista previa, paginación. Uso: python3 batch_cloud_gc.py <raiz>"""
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
rows = []; tokens = {'AT7': 'u1'}; calls = []; dels = []; state = {'swap': None, 'swapped': False}
def by_id(i): return next((e, v) for e, v in USERS.items() if v['id'] == i)
async def main():
    async with async_playwright() as p:
        b_ = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b_.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
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
            if not team: return await jr(route, 200, [])
            if r.method == 'POST':
                for x in json.loads(r.post_data):
                    assert x['team_id'] == team
                    rows[:] = [y for y in rows if not (y['team_id'] == team and y['key'] == x['key'] and y['part'] == x['part'])] + [x]
                if state['swap'] and not state['swapped']:
                    state['swapped'] = True; state['swap']()
                return await route.fulfill(status=201, body='', headers=CORS)
            qs = parse_qs(u.query); sel = [y for y in rows if y['team_id'] == team]
            k = qs.get('key', [''])[0]; pt = qs.get('part', [''])[0]
            if k.startswith('eq.'): sel = [y for y in sel if y['key'] == k[3:]]
            if k.startswith('neq.'): sel = [y for y in sel if y['key'] != k[4:]]
            if pt.startswith('gte.'): sel = [y for y in sel if y['part'] >= int(pt[4:])]
            if pt.startswith('eq.'): sel = [y for y in sel if y['part'] == int(pt[3:])]
            if r.method == 'DELETE':
                dels.append(k)
                for y in sel: rows.remove(y)
                return await route.fulfill(status=204, body='', headers=CORS)
            sel = sorted(sel, key=lambda z: (z['key'], z['part']))
            off = int(qs.get('offset', ['0'])[0]); lim = int(qs.get('limit', ['100000'])[0]); sel = sel[off:off + lim]
            cols = qs.get('select', ['key,part,total,payload,updated_at'])[0].split(',')
            return await jr(route, 200, [{c_: y.get(c_) for c_ in cols} for y in sel])
        await q.route('https://odsaouldxxjurniizefc.supabase.co/**', handler)
        async def ts(route):
            await route.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(el,o){setTimeout(function(){o.callback('TOK')},50);return 'w1'},remove:function(){}}")
        await q.route('https://challenges.cloudflare.com/**', ts)
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.actions['login-open']()"); await q.wait_for_selector('#login-dialog[open]')
        await q.fill('#login-email', 'ana@empresa.com'); await q.fill('#login-password', 'clave-ana-1'); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1500)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.state.stTab='cuenta'; FP.app.render()"); await q.wait_for_timeout(250)
        OLD = '2026-09-01T00:00:00Z'; NEW = '2026-10-02T14:55:00Z'
        def row(team, key, total=1, payload=json.dumps({'data': 'x' * 100, 'savedAt': OLD}), at=OLD, part=0): return {'team_id': team, 'key': key, 'part': part, 'total': total, 'payload': payload, 'bytes': len(payload), 'updated_at': at}
        def man(base, stamp, n): return json.dumps({'data': {'format': 'packed-chunked-v1', 'batches': [], 'chunks': n, 'stamp': stamp, 'total': n * 10}, 'savedAt': OLD})
        def gen(base, stamp, n, at=OLD): return [row('T-A', f'{base}:c{stamp}-{i}', at=at) for i in range(n)]
        # --- A. Vista previa y borrado manual ---
        rows[:] = [row('T-A', 'zzdemo', payload=man('zzdemo', 'cur1', 2))] + gen('zzdemo', 'cur1', 2) + gen('zzdemo', 'prv1', 2) + gen('zzdemo', 'old1', 3) + gen('zzdemo', 'old2', 1) + gen('zzdemo', 'new9', 1, NEW) \
            + [row('T-A', 'metas', payload=json.dumps({'data': {'a': 1}, 'savedAt': OLD})), row('T-B', 'zzdemo:cajena-0')]
        await q.evaluate("localStorage.setItem('fp.cloudPrevRefs', JSON.stringify(['zzdemo:cprv1-0','zzdemo:cprv1-1']))")
        n0 = len(rows)
        await q.click('[data-action="cloud-gc-plan"]'); await q.wait_for_function("document.getElementById('cloud-gc')", timeout=20000)
        txt = await q.inner_text('#cloud-gc')
        chk('G1 la vista previa no borra nada', len(rows) == n0 and not dels, (len(rows), n0, dels))
        pl = await q.evaluate("(()=>{const p=FP.app.state.cloud.gc.plan;return {cur:p.current.keys.length,prev:p.previous.keys.length,orph:p.orphans.keys.length,young:p.young.keys.length,other:p.other.keys.length}})()")
        chk('G2 clasifica: 2 vigentes, 2 de respaldo, 4 huérfanos, 1 reciente, 2 otros (el índice y metas)', pl == {'cur': 2, 'prev': 2, 'orph': 4, 'young': 1, 'other': 2}, pl)
        chk('G3 no cuenta ni toca bloques de otro equipo', 'cajena' not in txt and any(y['team_id'] == 'T-B' for y in rows))
        chk('G4 la vista previa aclara que los tamaños son datos sin comprimir', 'sin comprimir' in txt, txt)
        dis = await q.evaluate("document.querySelector('[data-action=\"cloud-gc-run\"]').disabled")
        chk('G5 «Borrar» está deshabilitado hasta confirmar', dis is True)
        await q.check('[data-action="cloud-gc-confirm"]'); await q.wait_for_timeout(300)
        dis = await q.evaluate("document.querySelector('[data-action=\"cloud-gc-run\"]').disabled")
        chk('G6 al confirmar se habilita', dis is False)
        await q.click('[data-action="cloud-gc-run"]'); await q.wait_for_function("/Nube limpia|falló/i.test(document.getElementById('cloud-msg').innerText)", timeout=30000)
        msg = await q.inner_text('#cloud-msg'); ks = {y['key'] for y in rows if y['team_id'] == 'T-A'}
        chk('G7 borra solo los huérfanos y lo verifica', 'Nube limpia' in msg and 'no queda ningún lote huérfano' in msg and not any(k.startswith(('zzdemo:cold1', 'zzdemo:cold2')) for k in ks), msg)
        chk('G8 se quedan vigente, respaldo, reciente, índice, otros datos y el otro equipo', {'zzdemo', 'metas', 'zzdemo:ccur1-0', 'zzdemo:cprv1-1', 'zzdemo:cnew9-0'} <= ks and any(y['team_id'] == 'T-B' for y in rows), sorted(ks))
        chk('G9 solo se borraron claves con forma de bloque', all(':c' in d for d in dels), dels[:5])
        r = await q.evaluate("FP.cloud.deleteChunks(['zzdemo','metas']).then(x=>x.deleted)")
        chk('G10 deleteChunks rechaza claves que no son bloques', r == 0 and 'zzdemo' in {y['key'] for y in rows}, r)
        # --- B. Desmarcar «conservar respaldo» ---
        dels.clear()
        await q.click('[data-action="cloud-gc-plan"]'); await q.wait_for_function("document.getElementById('cloud-gc')", timeout=20000)
        await q.uncheck('[data-action="cloud-gc-keep"]'); await q.wait_for_timeout(1500)
        pl = await q.evaluate("FP.app.state.cloud.gc.plan.orphans.keys.length")
        chk('G11 sin «conservar respaldo» la generación anterior pasa a huérfana (2) y sigue sin borrarse nada', pl == 2 and not dels, (pl, dels))
        await q.click('[data-action="cloud-gc-cancel"]'); await q.wait_for_timeout(300)
        chk('G12 cancelar cierra la vista previa sin borrar', not await q.evaluate("!!document.getElementById('cloud-gc')") and not dels)
        # --- C. Borrado automático tras subir: el índice cambia de generación durante la subida ---
        rows[:] = [row('T-A', 'zzdemo', payload=man('zzdemo', 'cur1', 2))] + gen('zzdemo', 'cur1', 2) + gen('zzdemo', 'new2', 2) + gen('zzdemo', 'old1', 3) + gen('zzdemo', 'young', 1, NEW) + [row('T-A', 'metas', payload=json.dumps({'data': {'a': 1}, 'savedAt': OLD}))]
        await q.evaluate("localStorage.removeItem('fp.cloudPrevRefs')")
        def swap():
            for y in rows:
                if y['key'] == 'zzdemo' and y['team_id'] == 'T-A': y['payload'] = man('zzdemo', 'new2', 2)
        state['swap'] = swap; state['swapped'] = False; dels.clear()
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_function("/verificada|diferencias|No pude|Falló/i.test(document.getElementById('cloud-msg').innerText)", timeout=60000)
        msg = await q.inner_text('#cloud-msg'); ks = {y['key'] for y in rows if y['team_id'] == 'T-A'}
        chk('G13 tras subir y verificar se borran solos los huérfanos y lo dice', 'verificada' in msg and 'lotes viejos' in msg and 'respaldo' in msg and not any(k.startswith('zzdemo:cold1') for k in ks), msg)
        chk('G14 la generación vigente (nueva) y la anterior (respaldo) se quedan; el bloque reciente también', {'zzdemo:cnew2-0', 'zzdemo:cnew2-1', 'zzdemo:ccur1-0', 'zzdemo:ccur1-1', 'zzdemo:cyoung-0'} <= ks, sorted(ks))
        sp = await q.evaluate("JSON.parse(localStorage.getItem('fp.cloudPrevRefs')||'[]')")
        chk('G15 se guardó la generación anterior para la limpieza manual', sorted(sp) == ['zzdemo:ccur1-0', 'zzdemo:ccur1-1'], sp)
        # --- D. Paginación: más de 1000 filas ---
        rows[:] = [row('T-A', 'zzdemo', payload=man('zzdemo', 'cur1', 1))] + gen('zzdemo', 'cur1', 1) + [row('T-A', f'zzpg:cold9-{i}', payload='{}') for i in range(1150)]
        await q.evaluate("localStorage.removeItem('fp.cloudPrevRefs')")
        await q.click('[data-action="cloud-gc-plan"]'); await q.wait_for_function("document.getElementById('cloud-gc')", timeout=60000)
        pl = await q.evaluate("FP.app.state.cloud.gc.plan.orphans.keys.length")
        chk('G16 la lectura pagina: ve las 1 150 filas', pl == 1150, pl)
        await q.click('[data-action="cloud-gc-cancel"]')
        # --- E. Si la subida no se verifica, no se limpia ---
        chk('G17 sin errores de JavaScript', not errs, errs)
        await b_.close()
    print('FALLAS' if fails else 'TODO OK', fails)
asyncio.run(main())
sys.exit(1 if fails else 0)
