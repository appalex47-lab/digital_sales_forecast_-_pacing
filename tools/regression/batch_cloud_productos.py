"""Productos en la nube del equipo: subir comprimido, restaurar idéntico, podar trozos viejos, tope de tamaño. Uso: python3 batch_cloud_productos.py <raiz>"""
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
            await route.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(el,o){setTimeout(function(){o.callback('TOK')},50);return 'w1'},remove:function(){}}")
        await q.route('https://challenges.cloudflare.com/**', ts)
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        # cargar productos (venta + funnel) por el mismo camino que la app
        r = await q.evaluate("""(async()=>{
          const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-08-20', skus: 60 });
          const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
          await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
          const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
          await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
          const c = await FP.productStore.counts(); const a = await FP.productStore.aggregate({ from: '2026-08-01', to: '2026-08-20', groupBy: 'channel' });
          return { c, agg: JSON.stringify([...a.entries()]) , skus: FP.productStore.catalog.list.length, meta: JSON.stringify(FP.productStore.meta) };
        })()""")
        before = r
        chk('P1 hay productos cargados para la prueba', r['c']['salesRows'] > 500 and r['c']['funnelRows'] > 100, r['c'])
        await q.evaluate("FP.app.actions['login-open']()"); await q.wait_for_selector('#login-dialog[open]')
        await q.fill('#login-email', 'ana@empresa.com'); await q.fill('#login-password', 'clave-ana-1'); await q.click('#login-dialog [data-action="login-submit"]'); await q.wait_for_timeout(1500)
        b = await q.evaluate("FP.productSync.build(FP.app.repo, {maxBytes: 100}).then(x=>({tooBig:!!x.tooBig, bytes:x.bytes}))")
        chk('P2 con un tope diminuto el paquete se rechaza antes de subir', b['tooBig'] is True and len(rows) == 0, b)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.state.stTab='cuenta'; FP.app.render()"); await q.wait_for_timeout(250)
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_timeout(9000)
        msg = await q.inner_text('#cloud-msg')
        pk = sorted({y['key'] for y in rows if y['key'].startswith('productsCloud')})
        chk('P3 sube y verifica, con resumen de productos', 'verificada' in msg and 'Productos:' in msg, msg)
        chk('P4 viajan manifiesto, meta y trozos de venta/funnel/catálogo/lotes', 'productsCloud:manifest' in pk and 'productsCloud:meta' in pk and any(k.startswith('productsCloud:productDays:') for k in pk) and any(k.startswith('productsCloud:productFunnel:') for k in pk) and 'productsCloud:productCatalog:0' in pk, pk)
        chk('P5 los resúmenes (productRollups) no viajan', not any('productRollups' in k for k in pk))
        chk('P6 los trozos van comprimidos (gzip en base64), no en claro', all('H4sI' in y['payload'] or y['key'].endswith('manifest') for y in rows if y['key'].startswith('productsCloud:productDays:') and y['part'] == 0), [y['payload'][:60] for y in rows if y['key'].startswith('productsCloud:productDays:')][:1])
        chk('P7 todas las filas son del equipo', all(y['team_id'] == 'T-A' for y in rows))
        # trozo viejo huérfano de una subida anterior más larga → se poda
        rows.append({'team_id': 'T-A', 'key': 'productsCloud:productDays:99', 'part': 0, 'total': 1, 'payload': '{}', 'bytes': 2, 'updated_at': '2026-10-01T00:00:00Z'})
        await q.click('[data-action="cloud-upload"]'); await q.wait_for_timeout(9000)
        chk('P8 un trozo viejo que ya no está en el manifiesto se poda de la nube', not any(y['key'] == 'productsCloud:productDays:99' for y in rows))
        # borrar productos locales y restaurar
        await q.evaluate("""(async()=>{ const db = FP.app.repo.db; for (const s of ['productDays','productFunnel','productRollups','productCatalog','productBatches']) await FP.idb.clear(db, s);
          for (const m of await FP.idb.getAll(db, 'meta')) if (/^product/.test(m.key)) await FP.idb.del(db, 'meta', m.key); await FP.productStore.init(FP.app.repo); })()""")
        z = await q.evaluate("FP.productStore.counts()")
        chk('P9 tras borrar lo local no quedan productos', z['salesRows'] == 0, z)
        await q.click('[data-action="cloud-download"]')
        try: await q.wait_for_function("/restaurada|No pude|error/i.test((document.getElementById('cloud-msg')||{innerText:''}).innerText)", timeout=120000)
        except Exception: pass
        msg = await q.inner_text('#cloud-msg')
        chk('P10 restaura y lo dice', 'restaurada' in msg and 'Productos:' in msg, msg)
        after = await q.evaluate("""(async()=>{ const c = await FP.productStore.counts(); const a = await FP.productStore.aggregate({ from: '2026-08-01', to: '2026-08-20', groupBy: 'channel' });
          return { c, agg: JSON.stringify([...a.entries()]), skus: FP.productStore.catalog.list.length, meta: JSON.stringify(FP.productStore.meta) }; })()""")
        chk('P11 mismos renglones de venta y funnel', after['c']['salesRows'] == before['c']['salesRows'] and after['c']['funnelRows'] == before['c']['funnelRows'], (before['c'], after['c']))
        chk('P12 mismo catálogo y mismos metadatos', after['skus'] == before['skus'] and after['meta'] == before['meta'], (before['skus'], after['skus']))
        chk('P13 una consulta de productos da exactamente el mismo resultado (columnas tipadas íntegras)', after['agg'] == before['agg'], (before['agg'][:200], after['agg'][:200]))
        n = await q.evaluate("FP.productStore.listBatches().then(l=>l.length)")
        chk('P14 los lotes de carga también regresan', n == 2, n)
        # copia incompleta: se rechaza solo la parte de productos
        victim = next(y for y in rows if y['key'].startswith('productsCloud:productDays:') and y['part'] == 0)
        rows.remove(victim)
        await q.click('[data-action="cloud-download"]'); await q.wait_for_timeout(5000)
        msg = await q.inner_text('#cloud-msg')
        c2 = await q.evaluate("FP.productStore.counts()")
        chk('P15 copia de productos incompleta: avisa y NO toca los productos locales', ('incompleta' in msg or 'incompleta' in msg.lower()) and c2['salesRows'] == before['c']['salesRows'], (msg, c2))
        chk('P16 sin errores de JavaScript', not errs, errs)
        await b_.close()
    print('FALLAS' if fails else 'TODO OK', fails)
asyncio.run(main())
sys.exit(1 if fails else 0)
