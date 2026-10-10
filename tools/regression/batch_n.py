"""Renombre a RevNavigator y árbol de drivers. Uso: python3 batch_n.py <raiz>   Sale 1 si alguna falla.
N-1 el nombre visible es RevNavigator en encabezado, título, buscador, menú, ayuda, configuración, exports y pie; sin restos de «Sales Navigator».
N-2 el renombre no toca el almacenamiento (namespace e IndexedDB iguales: los datos guardados siguen ahí) ni la importación de exports antiguos.
N-3 los títulos de las tarjetas del árbol de drivers (Volumen, CR, AOV) se leen en una sola línea a 8 anchos; el árbol no comparte clase con la cadena trazable."""
import asyncio, sys, os, re, json, threading, functools, http.server, socketserver
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
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','producto','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
TREE = """()=>[...document.querySelectorAll('#dx-tree details.driver-node')].map(d=>{const t=d.querySelector('summary strong');const r=document.createRange();r.selectNodeContents(t);
  return {cls:d.className,title:t.innerText.trim(),lines:new Set([...r.getClientRects()].map(x=>Math.round(x.top))).size,over:t.scrollWidth-t.clientWidth,tw:Math.round(t.getBoundingClientRect().width),textW:Math.round(r.getBoundingClientRect().width)}})"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        # ---------- N-1 ----------
        await q.goto(u + '#pacing'); await q.wait_for_timeout(500)
        hd = await q.evaluate("""()=>({title:document.title,h1:document.querySelector('.app-title').innerText,ph:document.querySelector('.topbar__search input').placeholder,al:document.querySelector('.topbar__search input').getAttribute('aria-label'),
          avatar:document.querySelector('.avatar').innerText,nav:document.querySelector('.app-nav a[data-nav="ajustes"]').innerText.trim(),name:FP.config.app.name})""")
        chk('N-1 encabezado, título de pestaña, buscador y menú dicen RevNavigator (avatar «RN»)', hd['h1'] == 'RevNavigator' and hd['title'] == 'Pacing & Forecast · RevNavigator' and hd['ph'] == 'Buscar en RevNavigator...' and 'RevNavigator' in hd['al'] and hd['avatar'] == 'RN' and hd['nav'] == 'Configuración de RevNavigator' and hd['name'] == 'RevNavigator', hd)
        left = []
        for v in VIEWS:
            await q.goto(u + '#' + v); await q.wait_for_timeout(250)
            n = await q.evaluate("(document.body.innerText + ' ' + document.title + ' ' + [...document.querySelectorAll('[aria-label],[title],[placeholder]')].map(e=>(e.getAttribute('aria-label')||'')+' '+(e.title||'')+' '+(e.placeholder||'')).join(' ')).match(/sales\\s*navigator/gi)")
            if n: left.append((v, len(n)))
        chk('N-1 ningún texto visible, etiqueta accesible, título ni marcador de las 18 vistas dice «Sales Navigator»', not left, left)
        ay = await q.evaluate("document.getElementById('view-ayuda').innerText")
        ft = await q.evaluate("(document.querySelector('.app-footer')||{innerText:''}).innerText")
        chk('N-1 la ayuda («¿Cómo funciona RevNavigator?») y el pie de página usan el nombre nuevo y conservan la versión', '¿Cómo funciona RevNavigator?' in ay and ('RevNavigator' in ft and '0.14.0' in ft), (ay[:80], ft[:120]))
        exp = await q.evaluate("""()=>{const hits=[];const src=JSON.stringify({a:FP.config.app});return src}""")
        chk('N-1 la configuración de la app (de donde salen source.app y metadata.app de los 7 exports) dice RevNavigator con la misma versión', '"name":"RevNavigator"' in exp and '"version":"0.14.0"' in exp, exp)
        # exports reales capturados con el botón de cada vista
        got = {}
        for v, sel in (('pacing', '[data-action="fc-export"]'), ('reforecast', '[data-action="rf-export"]'), ('diagnostico', '[data-action="dx-export"]'), ('narrativa', '[data-action="nx-export"]'), ('recovery', '[data-action="rc-export"]')):
            await q.goto(u + '#' + v); await q.wait_for_timeout(500)
            await q.evaluate("document.querySelectorAll('#view-pacing details.pacing-more, #view-reforecast details.pacing-more, #view-recovery details.pacing-more').forEach(d=>d.open=true)")   # los exports de Pacing, Reforecast y Recovery viven en «Ver más»
            await q.evaluate("window.__dl=[];if(!window.__hook){window.__hook=1;const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)])};}")
            try:
                await q.click(sel, timeout=2500); await q.wait_for_timeout(400)
                dl = await q.evaluate("window.__dl.slice(-1)[0]||null")
                if dl: got[v] = dl[1]
            except Exception: pass
        bad = {v: len(re.findall(r'Sales Navigator', t)) for v, t in got.items() if 'Sales Navigator' in t}
        okn = {v: ('"app":"RevNavigator"' in t) for v, t in got.items()}
        chk('N-1 los exports reales capturados (' + ', '.join(sorted(got)) + ') traen app «RevNavigator» y ninguno «Sales Navigator»', len(got) >= 4 and not bad and all(okn.values()), (sorted(got), bad, okn))
        # ---------- N-2 ----------
        st = await q.evaluate("[FP.config.storage.namespace, FP.config.storageDb.name, Object.keys(localStorage).filter(k=>/sales|navigator|revnav/i.test(k)).length]")
        chk('N-2 el renombre no toca el almacenamiento: namespace «fp.v1» y base «fp-data» iguales, sin claves que lleven el nombre (los datos guardados siguen ahí)', st == ['fp.v1', 'fp-data', 0], st)
        valida = await q.evaluate("""async()=>{const r=await fetch('js/app.js');const t=await r.text();return /source\\.app|metadata\\.app/.test(t)}""")
        chk('N-2 ninguna importación valida el nombre de la app dentro del archivo (un export hecho antes, con «Sales Navigator», se sigue aceptando)', valida is False, valida)
        # ---------- N-3 ----------
        bad = []
        for w in (1920, 1600, 1280, 1100, 768, 560, 390, 320):
            c2 = await b.new_context(viewport={'width': w, 'height': 900}); p2 = await c2.new_page(); await prepare(p2, u); await p2.goto(u + '#diagnostico'); await p2.wait_for_timeout(800)
            await p2.evaluate("document.querySelectorAll('#view-diagnostico details.dx-more').forEach(d=>d.open=true)"); await p2.wait_for_timeout(200)   # el árbol vive en «Ver más»
            t = await p2.evaluate(TREE)
            if len(t) != 3 or [x['title'] for x in t] != ['Volumen', 'CR', 'AOV'] or any(x['lines'] != 1 or x['over'] > 0 or x['tw'] < x['textW'] or x['cls'] != 'driver-node' for x in t): bad.append((w, t))
            await c2.close()
        chk('N-3 los títulos Volumen, CR y AOV del árbol de drivers se leen en una sola línea, completos y en su propia columna, de 320 a 1920 px', not bad, bad[:2])
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        cls = await q.evaluate("[document.querySelectorAll('#dx-tree .tree-node').length, document.querySelectorAll('#dx-tree .driver-node').length, document.querySelectorAll('#dx-tree .driver-node > .tree-branch, #dx-tree .driver-node .tree-branch').length > 0]")
        chk('N-3 el árbol ya no usa la clase `.tree-node` (la de la cadena trazable) y conserva sus ramas (canal, día de la semana, semana ISO)', cls[0] == 0 and cls[1] == 3 and cls[2] is True, cls)
        await q.goto(u + '#medir'); await q.wait_for_timeout(600)
        tr = await q.evaluate("[document.querySelectorAll('#view-medir li.tree-node').length]")
        chk('N-3 la cadena trazable de Medir sigue usando su propia clase sin cambios', tr[0] >= 1, tr)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_n:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
