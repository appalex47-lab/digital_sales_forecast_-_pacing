"""Instantánea de Categoría → Producto CON datos de producto (archivos generados, venta + funnel).
Uso: python3 products_snapshot.py <raiz> <salida.json> [<carpeta_capturas>]
Guarda tablas (filas × columnas × celdas), controles (id/name/data-action), texto, hash del export, scroll horizontal a 1280/768/390,
nombres accesibles y errores, en 3 estados: nivel raíz, tras «Ver ›» (drill) y trazabilidad de un SKU."""
import asyncio, json, sys, os, re, hashlib, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]; SHOTS = sys.argv[3] if len(sys.argv) > 3 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
TS = re.compile(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?|\b1[6-9]\d{11}\b|pbat-[a-z0-9]+|\b\d+ ms\b')  # marcas de tiempo, IDs de lote aleatorios y milisegundos: ruido, no contenido
TIME_KEYS = re.compile(r'"[A-Za-z_]*(generated|Generated|At|Date|Time|time|stamp|exportedAt|createdAt)[A-Za-z_]*":"[^"]*"')
TABLES = """(id)=>{const m=document.getElementById(id);return [...m.querySelectorAll('table')].map(t=>({rows:t.rows.length,cols:Math.max(0,...[...t.rows].map(r=>r.cells.length)),cells:[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))}))}"""
CTRL = """(id)=>{const m=document.getElementById(id);return [...m.querySelectorAll('button,input,select,textarea,a[data-nav],[data-action]')].map(e=>[e.tagName,e.id||'',e.getAttribute('name')||'',e.getAttribute('data-action')||'',e.getAttribute('type')||'']).sort((a,b)=>a.join().localeCompare(b.join()))}"""
TEXT = """(id)=>{const m=document.getElementById(id);const ds=[...m.querySelectorAll('details')];const pv=ds.map(d=>d.open);ds.forEach(d=>d.open=true);const t=m.innerText.replace(/\\s+/g,' ').trim();ds.forEach((d,i)=>d.open=pv[i]);return t}"""
UNNAMED = """(id)=>{const m=document.getElementById(id);const vis=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);return [...m.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(vis).filter(e=>{const n=(e.getAttribute('aria-label')||'').trim()||(e.innerText||'').trim()||(e.title||'').trim()||(e.id&&document.querySelector('label[for="'+e.id+'"]')?'x':'')||(e.closest('label')?'x':'');return !n}).map(e=>e.tagName+'#'+e.id+'.'+(e.getAttribute('data-action')||''))}"""
async def snap(q, tag, R):
    R[tag] = {'tables': json.loads(TS.sub('<ts>', json.dumps(await q.evaluate(TABLES, 'view-producto')))), 'controls': await q.evaluate(CTRL, 'view-producto'),
              'text': TS.sub('<ts>', await q.evaluate(TEXT, 'view-producto')), 'unnamed': await q.evaluate(UNNAMED, 'view-producto')}
async def main():
    port = serve(); url = f'http://127.0.0.1:{port}/index.html'; R = {}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in (1280, 768, 390):
            c = await b.new_context(viewport={'width': w, 'height': 900}); q = await c.new_page()
            q.on('pageerror', lambda e: errs.append(str(e))); q.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await q.goto(url + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
            await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
            await q.goto(url + '#producto'); await q.wait_for_timeout(500)
            await q.click('[data-action="p-mock"]'); await q.wait_for_timeout(700)
            for k in (1, 2):
                await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
                await q.wait_for_function(f"document.querySelectorAll('#view-carga .staging__head').length === {2 - k}", timeout=120000)  # el archivo sale de la revisión cuando terminó de guardarse (sin tiempos fijos)
            await q.goto(url + '#producto'); await q.wait_for_selector('#pa-table table', timeout=60000); await q.wait_for_timeout(500)
            if w == 1280:
                await snap(q, 'root', R)
                R['probe'] = await q.evaluate("""()=>{
                  const v=document.getElementById('view-producto');const fs=v.querySelector('fieldset.geo-filters');const panel=fs&&fs.closest('.panel');
                  const cs=fs&&getComputedStyle(fs), ps=panel&&getComputedStyle(panel);
                  const cards=[...v.querySelectorAll('#pa-kpis .metric-card')];
                  const rows=[...v.querySelectorAll('#pa-table tbody tr')];
                  const GR=['Crece','Cae','Estable','Nuevo','Sin venta'];
                  return {
                    cards: cards.length, cardsWithStatus: cards.filter(c=>c.querySelector('.pill')).length,
                    tablesNoDs: [...v.querySelectorAll('table')].filter(t=>!t.classList.contains('ds-table')).length,
                    tok: (()=>{const r=getComputedStyle(document.documentElement);const c=n=>{const i=document.createElement('i');i.style.color=r.getPropertyValue(n);document.body.appendChild(i);return getComputedStyle(i).color};return {surface2:c('--ds-surface-2'),border:c('--ds-border')}})(),
                    geo: fs ? {bg: cs.backgroundColor, panelBg: ps.backgroundColor, border: cs.borderTopStyle+' '+cs.borderTopWidth, borderColor: cs.borderTopColor, radius: cs.borderTopLeftRadius, minw: cs.minWidth, legend: (fs.querySelector('legend')||{}).innerText||'', selects: fs.querySelectorAll('select[data-action="pa-geo"]').length} : null,
                    geoOutside: [...document.querySelectorAll('[data-action="pa-geo"]')].filter(e=>!e.closest('#view-producto')).length,
                    geoInProductOutsideFieldset: [...v.querySelectorAll('[data-action="pa-geo"]')].filter(e=>!e.closest('fieldset.geo-filters')).length,
                    navHasGeo: /regi[oó]n|ciudad|sucursal|estado de/i.test(document.querySelector('.app-nav').innerText),
                    growth: rows.map(r=>(r.querySelector('.pill')||{innerText:''}).innerText.trim()).filter(t=>!GR.includes(t)).length,
                    viewByHasCategoria: [...v.querySelectorAll('#pa-viewby option')].some(o=>o.innerText.trim()==='Categoría'),
                    crumbs: !!v.querySelector('nav.breadcrumbs[aria-label="Ruta del análisis"]'),
                    tblOver: [...v.querySelectorAll('.table-wrap')].filter(w=>w.offsetWidth&&w.scrollWidth-w.clientWidth>1).map(w=>(w.closest('[id]')||{}).id+' +'+(w.scrollWidth-w.clientWidth))
                  }}""")
                await q.evaluate("window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})()")
                await q.click('[data-action="pa-export"]'); await q.wait_for_timeout(600)
                R['export'] = [hashlib.md5(TS.sub('<ts>', TIME_KEYS.sub('', x).replace('Sales Navigator', 'RevNavigator')).encode()).hexdigest() for x in await q.evaluate("window.__dl.map(x=>x[1])")]
                await q.wait_for_function("FP.app.state.pa.result && !FP.app.state.pa.loading", timeout=60000)
                await q.evaluate("FP.app.state.pa.__mark = FP.app.state.pa.result")
                await q.click('[data-action="pa-drill"]')
                await q.wait_for_function("FP.app.state.pa.result && FP.app.state.pa.result !== FP.app.state.pa.__mark && !FP.app.state.pa.loading", timeout=60000)
                await q.wait_for_timeout(300); await snap(q, 'drill', R)
                READY = "FP.app.state.pa.result && !FP.app.state.pa.loading"
                for _ in range(5):   # category → subcategory → product → sku: espera el cálculo real en cada paso (sin tiempos fijos)
                    await q.wait_for_function(READY, timeout=60000)
                    if await q.query_selector('[data-action="pa-trace"]'): break
                    await q.evaluate("FP.app.state.pa.__mark = FP.app.state.pa.result")
                    await q.click('[data-action="pa-drill"]')
                    await q.wait_for_function("FP.app.state.pa.result && FP.app.state.pa.result !== FP.app.state.pa.__mark && !FP.app.state.pa.loading", timeout=60000)
                    await q.wait_for_timeout(200)
                await q.click('[data-action="pa-trace"]')
                await q.wait_for_function("FP.app.state.pa.trace", timeout=60000); await q.wait_for_timeout(300); await snap(q, 'trace', R)
                await q.goto(url + '#producto'); await q.wait_for_timeout(600)
            R.setdefault('overflow', {})[str(w)] = await q.evaluate("document.documentElement.scrollWidth-window.innerWidth")
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True); await q.goto(url + '#producto'); await q.wait_for_timeout(700)
                await q.screenshot(path=f'{SHOTS}/producto_data_{w}.png', full_page=True)
            await c.close()
        await b.close()
    R['errors'] = errs[:8]; json.dump(R, open(OUT, 'w'), ensure_ascii=False); print('ok', OUT)
asyncio.run(main())
