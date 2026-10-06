"""R-6 · Ritmo vertical: ningún bloque (tarjetas de métricas, tablas, barras, filtros, botones, cabeceras) queda a menos de 8 px de su vecino inmediato.
Excluye «cabecera de panel → cuerpo» (es intencional: la cabecera lleva su propia línea). Uso: python3 spacing.py <raiz>   Sale 1 si hay pares pegados."""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','reforecast','diagnostico','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
JS = """(vid)=>{const v=document.getElementById('view-'+vid);const out=[];
 const vis=e=>e&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none';
 const label=e=>e?(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.toString().trim()?'.'+e.className.toString().trim().split(/\\s+/).slice(0,2).join('.'):'')):'—';
 [...v.querySelectorAll('.metric-grid, .table-wrap, .closure-bars, .geo-filters, .btn-row, .subhead, .app-main > .panel, #settings-view > .panel, #package-view > .panel')].filter(vis).forEach(b=>{const r=b.getBoundingClientRect();
   [['antes',b.previousElementSibling],['después',b.nextElementSibling]].forEach(([k,n])=>{ if(!vis(n))return; if(n.matches('.panel__head,.panel__body'))return; const nr=n.getBoundingClientRect();
     const gap=Math.round(k==='antes'?r.top-nr.bottom:nr.top-r.bottom); if(gap<8&&gap>=-2) out.push(vid+': '+label(b)+' ↔ '+label(n)+' ('+k+') = '+gap+' px');});});
 v.querySelectorAll('button,.btn').forEach(bt=>{ if(!vis(bt))return; const br=bt.getBoundingClientRect();
   v.querySelectorAll('.metric-card,.table-wrap,.closure-bars').forEach(c=>{ if(!vis(c)||c.contains(bt))return; const cr=c.getBoundingClientRect();
     const ox=Math.min(br.right,cr.right)-Math.max(br.left,cr.left); const dy=Math.round(cr.top-br.bottom);
     if(ox>10&&dy>=-2&&dy<8) out.push(vid+': botón «'+(bt.innerText||'').trim().slice(0,30)+'» a '+dy+' px de '+label(c)); }); });
 return [...new Set(out)]}"""
async def main():
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in (1280, 768, 390):
            q = await b.new_page(viewport={'width': w, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
            await prepare(q, u)
            for vid in VIEWS:
                await q.goto(u + '#' + vid); await q.wait_for_timeout(500)
                bad += [f'[{w}px] {x}' for x in await q.evaluate(JS, vid)]
            await q.close()
        await b.close()
    print(('✔' if not bad else '✘'), f'R-6 espaciado: {len(bad)} pares a menos de 8 px (todas las vistas × 3 anchos, con datos)')
    for x in bad[:25]: print('   ', x)
    sys.exit(1 if bad else 0)
asyncio.run(main())
