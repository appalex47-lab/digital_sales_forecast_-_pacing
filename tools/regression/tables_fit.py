"""R-7 · Tablas en escritorio sin scroll horizontal. Uso: python3 tables_fit.py <raiz> [anchos=1280,1440,1536,1920]   Sale 1 si alguna tabla se desborda.
Categoría → Producto (13 columnas, datos pesados) se comprueba en products_snapshot.py. En móvil/tableta el scroll interno sigue permitido."""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); WIDTHS = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '1100,1200,1280,1440,1536,1920').split(',')]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
JS = """()=>{const out=[];let n=0;document.querySelectorAll('.app-main:not([hidden]) .table-wrap').forEach(w=>{if(!w.offsetWidth)return;n++;const over=w.scrollWidth-w.clientWidth;
 if(over>1){const par=w.closest('[id]');out.push((par?par.id:'?')+' (+'+over+' px)')}});return {n,out}}"""
async def main():
    bad = []; total = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in WIDTHS:
            q = await b.new_page(viewport={'width': w, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
            await prepare(q, u)
            for v in VIEWS:
                await q.goto(u + '#' + v); await q.wait_for_timeout(500)
                r = await q.evaluate(JS); total += r['n']; bad += [f'[{w}px] {v}/{x}' for x in r['out']]
            await q.close()
        await b.close()
    print(('✔' if not bad else '✘'), f'R-7 tablas sin scroll horizontal en escritorio ({total} tablas medidas, anchos {WIDTHS})')
    for x in bad: print('   ', x)
    sys.exit(1 if bad else 0)
asyncio.run(main())
