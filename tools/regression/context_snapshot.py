"""I-final · Barra de contexto (.ux-context): instantánea por vista y ancho (texto, controles, alturas, solapes, desborde).
Uso: python3 context_snapshot.py <raiz> <salida.json> [<carpeta_capturas>]   Recorre las 17 vistas (con datos de prueba, plan y estado de Recovery)
a 1280 / 1024 / 768 / 390 px, en modo Analista y en modo Aprendiz (la barra de aprendizaje va dentro de .ux-context)."""
import asyncio, json, sys, os, re, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]; SHOTS = sys.argv[3] if len(sys.argv) > 3 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','producto','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
JS = """()=>{const c=document.getElementById('ux-context');if(!c)return null;const r=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.left),y:Math.round(b.top+scrollY),w:Math.round(b.width),h:Math.round(b.height)}};
  const vis=e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const box=r(c); const hdr=document.querySelector('.app-header').getBoundingClientRect();
  const main=document.querySelector('.app-main:not([hidden])');const first=main?main.querySelector('.panel, section, .empty, .ds-empty'):null;
  const ctl=[...c.querySelectorAll('a,button,select,input')].filter(vis).map(e=>[e.tagName,e.getAttribute('data-action')||'',e.getAttribute('data-view')||'',(e.getAttribute('href')||''),(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,40)]);
  const words=c.innerText.replace(/\\s+/g,' ').trim();
  const kids=['.breadcrumbs','.ux-context__purpose','.ux-context__action','.ux-context__chips','.ux-context__warn','.next-step','.learning-bar'].map(sel=>[sel,!!(c.querySelector(sel)&&vis(c.querySelector(sel)))]);
  const btns=[...c.querySelectorAll('button,a')].filter(vis).map(e=>{const b=e.getBoundingClientRect();return [Math.round(b.width),Math.round(b.height)]});
  const over=[...c.querySelectorAll('*')].filter(e=>vis(e)&&e.getBoundingClientRect().right>innerWidth+0.5).length;
  const overlap=(()=>{const els=[...c.querySelectorAll('.breadcrumbs,.ux-context__purpose,.ux-context__action,.ux-context__chips,.ux-context__warn,.next-step,.ux-context__actions')].filter(vis).map(e=>e.getBoundingClientRect());let n=0;for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i],b=els[j];if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)n++}return n})();
  const acts=[...c.querySelectorAll('.ux-context__actions .btn, .ux-context__side .btn')].filter(vis).map(e=>Math.round(e.getBoundingClientRect().height));
  const nextBtn=c.querySelector('.next-step .btn');const nb=nextBtn&&vis(nextBtn)?nextBtn.getBoundingClientRect():null;
  const order=[...c.querySelectorAll('a[href],button,select,input')].filter(vis).map(e=>{const b=e.getBoundingClientRect();return [Math.round(b.top+scrollY),Math.round(b.left),Math.round(b.bottom+scrollY)]});
  const crumbCur=c.querySelectorAll('.breadcrumbs [aria-current]').length;
  const h2=main&&main.querySelector('h2,h1');const crumbLast=c.querySelector('.breadcrumbs [aria-current]');
  return {box,hdrBottom:Math.round(hdr.bottom),toFirst:first?Math.round(first.getBoundingClientRect().top+scrollY-hdr.bottom):null,ctl,words,kids,btnMin:btns.length?Math.min(...btns.map(b=>b[1])):null,over,overlap,
    sw:document.documentElement.scrollWidth-innerWidth,actionsMin:acts.length?Math.min(...acts):null,nextBtn:nb?[Math.round(nb.width),Math.round(nb.height)]:null,order,crumbCur,title:h2?h2.innerText.trim():'',crumb:crumbLast?crumbLast.innerText.trim():''}}"""
async def main():
    R = {}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in (1280, 1024, 768, 390):
            q = await b.new_page(viewport={'width': w, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
            q.on('pageerror', lambda e: errs.append(str(e)))
            await prepare(q, u)
            for mode in ('analyst', 'learner'):
                await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
                await q.evaluate(f"FP.app.state.ux.mode='{mode}';FP.app.actions['lesson-dismiss']&&FP.app.actions['lesson-dismiss']();document.body.classList.toggle('mode-learner',{str(mode=='learner').lower()})")
                for v in VIEWS:
                    await q.goto(u + '#' + v); await q.wait_for_timeout(350)
                    await q.evaluate(f"FP.app.state.ux.mode='{mode}';FP.app.state.ux.lesson=null;FP.app.actions['go']&&0;")
                    await q.wait_for_timeout(50)
                    R.setdefault(f'{w}|{mode}', {})[v] = await q.evaluate(JS)
                    if SHOTS and mode == 'analyst' and v in ('pacing', 'inicio', 'diagnostico', 'carga') and w in (1280, 768, 390):
                        os.makedirs(SHOTS, exist_ok=True); await q.screenshot(path=f'{SHOTS}/contexto_{v}_{w}.png', clip={'x': 0, 'y': 0, 'width': w, 'height': 620})
            await q.close()
        await b.close()
    R['errors'] = errs[:6]; json.dump(R, open(OUT, 'w'), ensure_ascii=False); print('ok', OUT)
asyncio.run(main())
