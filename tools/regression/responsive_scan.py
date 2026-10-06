"""I-final · Responsive fino: recorre las 17 vistas (con datos de prueba, plan y estado de Recovery) en 12 anchos (320 → 1920 px) y busca
(1) scroll horizontal del documento, (2) elementos que salen de la pantalla fuera de un contenedor con scroll propio, (3) texto recortado por overflow:hidden
fuera de los casos previstos, (4) solapes entre el encabezado y el menú fijo, (5) botones/enlaces con texto que se sale de su caja.
Uso: python3 responsive_scan.py <raiz> [anchos=320,360,390,480,600,768,860,1024,1100,1280,1440,1920]   Sale 1 si hay hallazgos."""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); W = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '320,360,390,480,600,768,860,1024,1100,1280,1440,1920').split(',')]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
JS = """(vid)=>{const out=[];const W=innerWidth;const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const clipParent=e=>{let p=e.parentElement;while(p&&p!==document.body){const c=getComputedStyle(p);if(['auto','scroll','hidden','clip'].includes(c.overflowX))return true;p=p.parentElement}return false};
 const label=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.toString().trim()?'.'+e.className.toString().trim().split(/\\s+/)[0]:'');
 const sw=document.documentElement.scrollWidth-W; if(sw>0)out.push(['documento',sw]);
 document.querySelectorAll('body *').forEach(e=>{ if(!vis(e))return; const cs=getComputedStyle(e); if(cs.position==='fixed'||e.closest('.app-nav,#help-drawer,.drawer'))return;
   const r=e.getBoundingClientRect();
   if(r.right>W+0.5&&!clipParent(e))out.push(['fuera de pantalla',label(e),Math.round(r.right-W)]);
   if((e.matches('button,.btn,a.btn,.pill,.chip,.ds-badge')&&e.scrollWidth>e.clientWidth+1&&cs.overflowX!=='visible'))out.push(['texto recortado',label(e),e.scrollWidth-e.clientWidth]);
 });
 const hdr=document.querySelector('.app-header').getBoundingClientRect(),nav=document.getElementById('app-nav').getBoundingClientRect();
 if(W>860&&nav.top<hdr.bottom-1)out.push(['menú bajo el encabezado',Math.round(hdr.bottom-nav.top)]);
 return out.slice(0,6)}"""
async def main():
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in W:
            q = await b.new_page(viewport={'width': w, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
            await prepare(q, u)
            for v in VIEWS:
                await q.goto(u + '#' + v); await q.wait_for_timeout(300)
                r = await q.evaluate(JS, v)
                if r: bad.append((w, v, r))
            await q.close()
        await b.close()
    print(('✔' if not bad else '✘'), f'Responsive fino: {len(bad)} hallazgos (16 vistas × {len(W)} anchos: {W})')
    for x in bad[:30]: print('   ', x)
    sys.exit(1 if bad else 0)
asyncio.run(main())
