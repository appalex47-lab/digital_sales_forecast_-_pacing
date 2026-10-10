"""Fase 10 · Paquete de análisis. Uso: python3 batch_o.py <raiz>   Sale 1 si alguna falla.
O-1 la vista existe en «Medir y aprender» y lista los 7 exports con su estado.
O-2 con datos: el .zip descargado (zipfile lo abre y valida CRC) trae indice.json, LEEME.txt y los 7 exports; cada export es idéntico
    al que se descarga desde su vista (salvo sellos de tiempo) y la narrativa viaja sin businessContext.
O-3 el índice trae lo decidido (sello, corte, año, plan, método, calidad; por archivo nombre, registros, estado y qué falta).
O-4 sin datos: el paquete se genera igual, con los 7 archivos vacíos y su aviso.
O-5 no incluye la API key, las preferencias ni los datos de Negocio."""
import asyncio, sys, os, re, io, json, zipfile, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
TIME = re.compile(r'"[A-Za-z_]*(generated|Generated|exportedAt|createdAt|At)"\s*:\s*"[^"]*"')
def norm(t): return TIME.sub('"<t>":"<t>"', t)
async def get_zip(q):
    async with q.expect_download(timeout=60000) as d:
        await q.click('[data-action="pkg-download"]')
    dl = await d.value
    path = await dl.path()
    return dl.suggested_filename, open(path, 'rb').read()
SECRET = 'clave-secreta-de-prueba-123'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); ctx = await b.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900}); q = await ctx.new_page(); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        # ---------- O-4 sin datos ----------
        await q.goto(u + '#paquete'); await q.wait_for_timeout(800)
        nav = await q.evaluate("[...document.querySelectorAll('#snav-g-medir .snav__item')].map(a=>a.innerText.trim())")
        rows = await q.evaluate("[...document.querySelectorAll('#view-paquete tbody tr')].map(r=>[r.cells[0].innerText.trim(),r.cells[1].innerText.trim()])")
        chk('O-1 «Paquete de análisis» está en «Medir y aprender» y lista los 7 exports con su estado', nav == ['Seguimiento y aprendizaje', 'Narrativa ejecutiva', 'Paquete de análisis'] and len(rows) == 7, (nav, rows))
        name0, z0 = await get_zip(q)
        zf = zipfile.ZipFile(io.BytesIO(z0)); bad = zf.testzip(); names0 = zf.namelist()
        idx0 = json.loads(zf.read('indice.json'))
        chk('O-4 sin datos el paquete se genera igual: zip válido con indice.json, LEEME.txt y 7 archivos, todos «empty» con motivo', bad is None and len(names0) == 9 and names0[:2] == ['indice.json', 'LEEME.txt'] and all(f['status'] == 'empty' and f['reason'] for f in idx0['files']), (bad, names0, [f['status'] for f in idx0['files']]))
        e0 = json.loads(zf.read(names0[2]))
        chk('O-4 cada archivo vacío dice que no tenía datos, el motivo, qué falta y en qué vista llenarlo', e0.get('status') == 'empty' and e0.get('reason') and isinstance(e0.get('missing'), list) and e0.get('whereToFill') == 'pacing', e0)
        # ---------- datos completos: plan + real + escenario/acción/medición + productos ----------
        await prepare(q, u)
        await q.goto(u + '#producto'); await q.wait_for_timeout(500); await q.click('[data-action="p-mock"]'); await q.wait_for_timeout(700)
        for k in (1, 2):
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=90000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function(f"document.querySelectorAll('#view-carga .staging__head').length === {2 - k}", timeout=180000)
        # API key recordada y negocio con nombre (no deben viajar)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(600); await q.evaluate("FP.app.actions['st-expand-all']()"); await q.wait_for_timeout(300)
        await q.fill('#dx-key-input', SECRET); await q.press('#dx-key-input', 'Tab'); await q.check('#st-ia [data-action="dx-remember"]'); await q.wait_for_timeout(300)
        await q.click('#st-negocio [data-action="bc-seed"]'); await q.wait_for_timeout(300)
        await q.fill('#bc-form [data-path="business.name"]', 'Farmacia Secreta XYZ'); await q.press('#bc-form [data-path="business.name"]', 'Tab'); await q.wait_for_timeout(300)
        await q.click('#st-negocio [data-action="bc-save"]'); await q.wait_for_timeout(500)
        # exports individuales desde cada vista (mismo estado)
        await q.evaluate("window.__dl=[];const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,typeof obj==='string'?obj:JSON.stringify(obj,null,2)]);}")
        indiv = {}
        # primero se calculan diagnóstico y productos (como hace el paquete), luego se exporta cada vista
        for v in ('pacing', 'diagnostico', 'producto'):
            await q.goto(u + '#' + v); await q.wait_for_timeout(900)
            if v == 'producto': await q.wait_for_selector('#pa-table table', timeout=90000); await q.wait_for_timeout(400)
        for v, sel in (('producto', 'pa-export'), ('pacing', 'fc-export'), ('reforecast', 'rf-export'), ('diagnostico', 'dx-export'), ('recovery', 'rc-export'), ('narrativa', 'nx-export'), ('plan', 'plan-export')):   # productos primero: Diagnóstico lo incluye cuando existe
            await q.goto(u + '#' + v); await q.wait_for_timeout(900)
            if v == 'producto': await q.wait_for_selector('#pa-table table', timeout=90000); await q.wait_for_timeout(400)
            await q.evaluate("document.querySelectorAll('#view-pacing details.pacing-more, #view-reforecast details.pacing-more, #view-recovery details.pacing-more').forEach(d=>d.open=true)")   # los exports de Pacing, Reforecast y Recovery viven en «Ver más»
            n0 = await q.evaluate("window.__dl.length")
            await q.click(f'[data-action="{sel}"]'); await q.wait_for_timeout(600)
            got = await q.evaluate(f"window.__dl.slice({n0})")
            if got: indiv[got[-1][0]] = got[-1][1]
        await q.goto(u + '#paquete'); await q.wait_for_timeout(900)
        okrows = await q.evaluate("[...document.querySelectorAll('#view-paquete tbody tr')].filter(r=>/Con datos/.test(r.cells[1].innerText)).length")
        name1, z1 = await get_zip(q)
        zf = zipfile.ZipFile(io.BytesIO(z1)); bad = zf.testzip(); names = zf.namelist()
        idx = json.loads(zf.read('indice.json'))
        chk('O-2 con datos: zip válido (CRC correcto), nombre revnavigator_paquete_<año>_<fecha>.zip, 9 archivos y los 7 exports «complete»', bad is None and re.match(r'revnavigator_paquete_2026_\d{4}-\d{2}-\d{2}\.zip$', name1) and len(names) == 9 and all(f['status'] == 'complete' for f in idx['files']) and okrows == 7, (name1, names, [(f['key'], f['status'], f.get('reason')) for f in idx['files']], okrows))
        same = {}; diffs = {}
        for f in idx['files']:
            pk = zf.read(f['file']).decode('utf-8')
            iv = indiv.get(f['file'])
            if iv is None: same[f['key']] = 'sin individual'; continue
            if f['key'] == 'narrative':
                a = json.loads(pk); bjs = json.loads(iv)
                def scrub(o):
                    if isinstance(o, dict):
                        if 'businessContext' in o: o['businessContext'] = None
                        [scrub(x) for x in o.values()]
                    elif isinstance(o, list): [scrub(x) for x in o]
                scrub(bjs); same[f['key']] = norm(json.dumps(a, sort_keys=True)) == norm(json.dumps(bjs, sort_keys=True))
                if not same[f['key']]:
                    def walk(x, y, path=''):
                        if type(x) != type(y): yield path, str(x)[:60], str(y)[:60]; return
                        if isinstance(x, dict):
                            for k in sorted(set(x) | set(y)): yield from walk(x.get(k), y.get(k), path + '.' + k)
                        elif isinstance(x, list):
                            if len(x) != len(y): yield path + '[len]', len(x), len(y); return
                            for i, (p_, q_) in enumerate(zip(x, y)): yield from walk(p_, q_, f'{path}[{i}]')
                        elif x != y: yield path, str(x)[:60], str(y)[:60]
                    diffs[f['key']] = list(walk(a, bjs))[:6]
            else:
                same[f['key']] = norm(pk) == norm(iv)
                if not same[f['key']]: diffs[f['key']] = (len(pk), len(iv))
        chk('O-2 cada export del paquete es idéntico al que se descarga desde su vista (mismo nombre de archivo y mismo contenido, salvo sellos de tiempo)', all(v is True for v in same.values()) and len(same) == 7, (same, diffs))
        narr = json.loads(zf.read([f['file'] for f in idx['files'] if f['key'] == 'narrative'][0]))
        chk('O-2 la narrativa del paquete viaja con businessContext en blanco y el índice lo declara', narr.get('narrative', narr).get('businessContext', 'x') is None or json.dumps(narr).count('"businessContext": null') >= 1, json.dumps(narr)[:200])
        nf = [f for f in idx['files'] if f['key'] == 'narrative'][0]
        chk('O-3 el índice declara la exclusión en la narrativa (redacted: businessContext)', nf['redacted'] == ['businessContext'], nf)
        keys = set(idx)
        chk('O-3 el índice trae sello, fecha de corte, año, plan, método y calidad', {'schema', 'schemaVersion', 'source', 'cutoff', 'year', 'plan', 'forecastMethod', 'dataQuality', 'files', 'excluded'} <= keys and idx['schema'] == 'analysis_package' and idx['source']['app'] == 'RevNavigator' and idx['cutoff'] and idx['year'] == 2026 and idx['forecastMethod']['id'] and idx['dataQuality']['statusText'], {k: idx[k] for k in ('cutoff', 'year', 'plan', 'forecastMethod', 'dataQuality')})
        chk('O-3 por archivo: nombre, registros (> 0 con datos), estado y qué falta', all({'file', 'records', 'status', 'missing'} <= set(f) and f['records'] > 0 for f in idx['files']), [(f['key'], f['records']) for f in idx['files']])
        readme = zf.read('LEEME.txt').decode('utf-8')
        chk('O-3 LEEME.txt resume corte, plan, método, calidad y cada archivo, y dice qué no incluye', 'Fecha de corte' in readme and 'Método de forecast' in readme and 'Calidad de datos' in readme and 'No incluye la API key' in readme and readme.count('✓') == 7, readme[:300])
        # ---------- O-5 ----------
        allt = '\n'.join(zf.read(n).decode('utf-8') for n in names)
        chk('O-5 ni la API key de Cohere ni el nombre del negocio aparecen en ningún archivo del paquete', SECRET not in allt and 'Farmacia Secreta XYZ' not in allt, [n for n in names if SECRET in zf.read(n).decode() or 'Farmacia Secreta XYZ' in zf.read(n).decode()])
        chk('O-5 tampoco viajan las preferencias de la herramienta (uxSettings, modo, recorrido)', 'uxSettings' not in allt and '"rememberKey"' not in allt, '')
        # consistencia interna: en una sesión nueva sin abrir Producto, el Diagnóstico del paquete ya incluye la sección de productos
        q2 = await ctx.new_page(); await q2.goto(u + '#paquete'); await q2.wait_for_timeout(1200)
        n2, z2 = await get_zip(q2); zf2 = zipfile.ZipFile(io.BytesIO(z2)); idx2 = json.loads(zf2.read('indice.json'))
        an = json.loads(zf2.read([f['file'] for f in idx2['files'] if f['key'] == 'analysis'][0]))
        cpf = [f for f in idx2['files'] if f['key'] == 'categoryProduct'][0]
        chk('O-2 sin abrir Producto en la sesión, el paquete calcula productos primero: viaja el export de Producto y el Diagnóstico lo incluye', cpf['status'] == 'complete' and 'categoryProduct' in json.dumps(an), (cpf['status'], [k for k in an][:12]))
        await q2.close()
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_o:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
