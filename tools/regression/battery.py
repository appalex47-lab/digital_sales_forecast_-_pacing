"""Batería de regresión T1–T10 + instantáneas para comparar contra una línea base.
Uso: python3 battery.py <raiz_del_proyecto> <salida.json> [<carpeta_capturas>]
Variables: CHROME_PATH (ruta a chromium, opcional). Sirve el proyecto por http local."""
import asyncio, json, sys, os, re, hashlib, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright

ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]
SHOTS = sys.argv[3] if len(sys.argv) > 3 else None
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion',
         'pacing','reforecast','diagnostico','producto','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
VIEWS = [v for v in VIEWS if v not in os.environ.get('EXCLUDE', '').split(',')]   # EXCLUDE=ajustes para correr la batería sobre una base anterior a esa vista
WIDTHS = [1280, 768, 390]
CAP = "window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})();"
TIME_KEYS = re.compile(r'"[A-Za-z_]*(generated|Generated|At|Date|Time|time|stamp|exportedAt|createdAt)[A-Za-z_]*":"[^"]*"')
R = {}
TS = re.compile(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?|\b1[6-9]\d{11}\b')
def norm(x): return TS.sub('<ts>', x)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]

TABLES_JS = """(id)=>{const m=document.getElementById('view-'+id);if(!m)return [];
 return [...m.querySelectorAll('table')].map(t=>({rows:t.rows.length,cols:Math.max(0,...[...t.rows].map(r=>r.cells.length)),
  cells:[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))}))}"""
CONTROLS_JS = """(id)=>{const m=document.getElementById('view-'+id);if(!m)return [];
 return [...m.querySelectorAll('button,input,select,textarea,a[data-nav],[data-action]')].map(e=>[e.tagName,e.id||'',e.getAttribute('name')||'',e.getAttribute('data-action')||'',e.getAttribute('type')||'']).sort((a,b)=>a.join().localeCompare(b.join()))}"""
# el texto se lee con TODOS los <details> abiertos (y se restauran): la tarjeta «Cómo leer esta vista» arranca cerrada y no debe contar como texto eliminado
TEXT_JS = """(id)=>{const m=document.getElementById('view-'+id);if(!m)return '';const ds=[...m.querySelectorAll('details')];const pv=ds.map(d=>d.open);ds.forEach(d=>d.open=true);const t=m.innerText.replace(/\\s+/g,' ').trim();ds.forEach((d,i)=>d.open=pv[i]);return t}"""
UNNAMED_JS = """(id)=>{const m=document.getElementById('view-'+id);if(!m)return [];
 const vis=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
 return [...m.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(vis).filter(e=>{
  const n=(e.getAttribute('aria-label')||'').trim()||(e.getAttribute('aria-labelledby')||'').trim()||(e.innerText||'').trim()||(e.title||'').trim()
   ||(e.id&&document.querySelector('label[for="'+e.id+'"]')?'x':'')||(e.closest('label')?'x':'');
  return !n}).map(e=>e.tagName+'#'+e.id+'.'+(e.getAttribute('data-action')||''))}"""
FOCUS_READ = """()=>{const e=document.activeElement;if(!e||e===document.body)return null;const cs=getComputedStyle(e);
 const w=parseFloat(cs.outlineWidth)||0,bs=cs.boxShadow&&cs.boxShadow!=='none';
 return {k:e.tagName+'#'+e.id+'.'+(e.getAttribute('data-action')||'')+'.'+(e.className&&e.className.baseVal===undefined?e.className:'').slice(0,30),ok:(cs.outlineStyle!=='none'&&w>=2)||!!bs,inside:!!e.closest('#view-'+location.hash.slice(1))}}"""
async def focus_walk(pg, vid):
    """Recorre con Tab real (no focus() programático) los controles de la vista y mide su indicador de foco."""
    await pg.evaluate("(id)=>{const m=document.getElementById('view-'+id);m.setAttribute('tabindex','-1');m.focus();}", vid)
    seen, bad = set(), []
    for _ in range(45):
        await pg.keyboard.press('Tab')
        r = await pg.evaluate(FOCUS_READ)
        if not r or not r['inside'] or r['k'] in seen: continue
        seen.add(r['k'])
        if not r['ok']: bad.append(r['k'])
    return {'bad': bad, 'n': len(seen)}

async def main():
    srv, port = serve(); url = f'http://127.0.0.1:{port}/index.html'
    async with async_playwright() as p:
        kw = {'args': ['--no-sandbox']}
        if os.environ.get('CHROME_PATH'): kw['executable_path'] = os.environ['CHROME_PATH']
        b = await p.chromium.launch(**kw); errs = []
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        await ctx.clock.set_fixed_time('2026-10-07T09:00:00')   # reloj fijo: las vistas muestran «hoy»; sin esto la batería cambia de un día a otro
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        await pg.goto(url + '#resumen'); await pg.wait_for_selector('#view-resumen:not([hidden])')
        # sin datos: estados vacíos
        R['empty_text'] = {v: await pg.evaluate(TEXT_JS, v) for v in ['pacing','reforecast','diagnostico','recovery','medir','narrativa','producto']}
        R['selftest'] = await pg.evaluate("(()=>{const r=FP.selfTest.run();return {passed:r.passed,total:r.total}})()")
        await pg.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await pg.click('[data-action="generate-mock"]'); await pg.wait_for_timeout(1500)
        await pg.click('[data-action="sample-targets"]'); await pg.wait_for_timeout(500)
        await pg.goto(url + '#plan'); await pg.wait_for_timeout(700)
        for a in ['plan-preview', 'plan-save']:
            try: await pg.click(f'[data-action="{a}"]', timeout=2500); await pg.wait_for_timeout(1000)
            except Exception: pass
        await pg.add_style_tag(content='*,*::before,*::after{transition:none!important;animation:none!important}')  # solo en la prueba: lee el estilo de foco final
        R['views'] = {}; R['tables'] = {}; R['controls'] = {}; R['text'] = {}; R['unnamed'] = {}; R['focus'] = {}
        for v in VIEWS:
            await pg.goto(url + '#' + v); await pg.wait_for_timeout(600)
            await pg.evaluate("(id)=>{const m=document.getElementById('view-'+id);if(m)m.querySelectorAll('details').forEach(d=>d.open=true)}", v)   # Configuración tiene sus secciones en desplegables: se miden abiertos, como antes eran visibles
            R['views'][v] = await pg.evaluate("(id)=>{const m=document.getElementById('view-'+id);return !!m&&!m.hidden&&m.innerText.trim().length>20}", v)
            R['tables'][v] = json.loads(norm(json.dumps(await pg.evaluate(TABLES_JS, v))))
            R['controls'][v] = await pg.evaluate(CONTROLS_JS, v)
            R['text'][v] = norm(await pg.evaluate(TEXT_JS, v))
            R['unnamed'][v] = await pg.evaluate(UNNAMED_JS, v)
            R['focus'][v] = await focus_walk(pg, v)
        # T4 exports
        R['exports'] = {}
        for view, act in [('pacing','fc-export'),('reforecast','rf-export'),('diagnostico','dx-export'),('narrativa','nx-export'),
                          ('plan','plan-export'),('recovery','rc-export'),('producto','pa-export')]:
            await pg.goto(url + '#' + view); await pg.wait_for_timeout(600); await pg.evaluate(CAP)
            try:
                await pg.click(f'[data-action="{act}"]', timeout=1200); await pg.wait_for_timeout(400)
                h = await pg.evaluate("window.__dl.map(x=>x[1])")
                R['exports'][view] = [hashlib.md5(norm(TIME_KEYS.sub('', x).replace('Sales Navigator', 'RevNavigator')).encode()).hexdigest() for x in h]
            except Exception: R['exports'][view] = 'sin botón'
        # T6 modos: solo Aprendiz y Analista; se cambian con el interruptor «Modo Aprendiz» del menú (los botones del encabezado ya no existen)
        await pg.goto(url + '#pacing'); await pg.wait_for_timeout(500); R['modes'] = {}
        R['modes']['topButtons'] = await pg.evaluate("document.querySelectorAll('.ux-context [data-action=\"ux-mode\"]').length")
        for m in ['learner', 'analyst']:
            await pg.evaluate(f"document.querySelector('.app-nav [data-action=\"ux-mode\"][data-value=\"{m}\"]').click()"); await pg.wait_for_timeout(250)
            R['modes'][m] = await pg.evaluate("[document.body.classList.contains('mode-learner'),document.body.classList.contains('mode-exec')]")
        # T8 navegación
        R['nav'] = {}
        for v in VIEWS:
            await pg.goto(url + '#' + v); await pg.wait_for_timeout(300)
            R['nav'][v] = await pg.evaluate("[document.querySelectorAll('.app-nav [aria-current=page]').length, location.hash]")
        # T5 persistencia
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.goto(url + '#ajustes'); await pg.wait_for_timeout(600)   # la ficha de estado ahora vive solo en Configuración de RevNavigator
        R['persist'] = await pg.evaluate("/registros/.test(document.querySelector('#status-bar').textContent)")   # textContent: la ficha puede estar en un desplegable cerrado
        # T7/T11 anchos y capturas
        R['overflow'] = {}
        for w in WIDTHS:
            c = await b.new_context(viewport={'width': w, 'height': 900}); await c.clock.set_fixed_time('2026-10-07T09:00:00'); q = await c.new_page()
            q.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
            await q.goto(url + '#resumen'); await q.wait_for_timeout(700)
            try: await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]', timeout=2000); await q.wait_for_timeout(1200)
            except Exception: pass
            for v in VIEWS:
                await q.goto(url + '#' + v); await q.wait_for_timeout(450)
                ov = await q.evaluate("document.documentElement.scrollWidth-window.innerWidth")
                if ov > 0: R['overflow'][f'{v}@{w}'] = ov
                if SHOTS:
                    os.makedirs(SHOTS, exist_ok=True)
                    await q.screenshot(path=f'{SHOTS}/{v}_{w}.png', full_page=False)
            await c.close()
        R['errors'] = errs[:10]
        await b.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False)
    print('ok', OUT)
asyncio.run(main())
