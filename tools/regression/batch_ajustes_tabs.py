"""Configuración en pestañas con secciones fijas (sin desplegables). Uso: python3 batch_ajustes_tabs.py <raiz>
T-1 cinco pestañas y ningún desplegable; T-2 cada pestaña muestra solo sus secciones, completas y con título y resumen; T-3 teclado (flechas) y ARIA;
T-4 los resúmenes reflejan el estado real; T-5 el menú de la cuenta lleva directo a «Cuenta y nube»; T-6 sin desborde de 320 a 1920 px y encabezados sin saltos."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
TABS = {'cuenta': ['st-nube'], 'ia': ['st-ia', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad'], 'datos': ['st-fuentes', 'st-equivalencias', 'st-almacenamiento'],
        'herramienta': ['st-estado', 'st-modo', 'st-otras'], 'negocio': ['st-negocio']}
VIS = "(()=>[...document.querySelectorAll('#view-ajustes section.stsec')].filter(d=>d.checkVisibility()).map(d=>d.id))()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-fuentes', state='attached', timeout=20000); await q.wait_for_timeout(300)
        chk('T-1 hay cinco pestañas y ningún desplegable', await q.evaluate("document.querySelectorAll('#view-ajustes .sttab').length")==5 and await q.evaluate("document.querySelectorAll('#view-ajustes details.stacc').length")==0)
        chk('T-1 entra en «Herramienta»', await q.evaluate("document.querySelector('.sttab[aria-selected=true]').dataset.tab")=='herramienta')
        for t, ids in TABS.items():
            await q.click(f'#sttab-{t}'); await q.wait_for_timeout(200)
            vis = await q.evaluate(VIS)
            chk(f'T-2 «{t}» muestra solo sus secciones', sorted(vis)==sorted(ids), vis)
            sec = await q.evaluate("(()=>[...document.querySelectorAll('#view-ajustes section.stsec')].filter(d=>d.checkVisibility()).map(d=>({t:(d.querySelector('.stsec__title')||{}).textContent,h:d.querySelector('.stsec__body').getBoundingClientRect().height})))()")
            chk(f'T-2 «{t}»: cada sección trae título y su contenido a la vista (sin colapsar)', all(x['t'] and x['h']>20 for x in sec), sec)
        # teclado y ARIA
        await q.focus('#sttab-cuenta'); await q.keyboard.press('ArrowRight'); await q.wait_for_timeout(200)
        chk('T-3 ArrowRight pasa a la siguiente pestaña y la selecciona', await q.evaluate("document.querySelector('.sttab[aria-selected=true]').dataset.tab")=='ia')
        await q.keyboard.press('End'); await q.wait_for_timeout(150)
        chk('T-3 End va a la última', await q.evaluate("document.querySelector('.sttab[aria-selected=true]').dataset.tab")=='negocio')
        aria = await q.evaluate("[...document.querySelectorAll('.sttab')].every(t=>document.getElementById(t.getAttribute('aria-controls'))&&document.getElementById(t.getAttribute('aria-controls')).getAttribute('role')==='tabpanel')")
        chk('T-3 cada pestaña controla un panel con role=tabpanel', aria)
        chk('T-3 objetivo táctil de al menos 44 px', all(x>=44 for x in await q.evaluate("[...document.querySelectorAll('.sttab')].map(t=>t.getBoundingClientRect().height)")))
        # la pestaña se conserva al repintar
        await q.click('#sttab-ia'); await q.evaluate("FP.app.actions['ux-mode']({dataset:{value:'learner'}})"); await q.wait_for_timeout(300)
        chk('T-2 la pestaña activa se conserva al repintar', await q.evaluate("document.querySelector('.sttab[aria-selected=true]').dataset.tab")=='ia')
        # resúmenes
        await q.evaluate("FP.app.state.stTab='herramienta';FP.app.render()")
        meta = await q.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('#view-ajustes section.stsec')].map(d=>[d.id,((d.querySelector('.stsec__meta')||{}).textContent||'').trim()])))()")
        chk('T-4 resúmenes: modo, sin API key, 0 consultas, 0 aprendidas, 0 equivalencias, fuentes, negocio y motor', meta['st-modo']=='Aprendiz' and 'Sin API key' in meta['st-ia'] and meta['st-ia-log'].startswith('0 consultas') and meta['st-ia-aprendido'].startswith('0 columnas') and meta['st-equivalencias'].startswith('0 equivalencias') and 'fuentes con datos' in meta['st-fuentes'] and 'Sin configurar' in meta['st-negocio'] and 'motor operativo' in meta['st-estado'], meta)
        await q.evaluate("FP.app.state.dx.apiKey='k'; FP.importer.setLearnedMappings({monto_vendido:'revenue',importe:'revenue'}); FP.app.state.settings.piiColumns=['a']; FP.app.render()"); await q.wait_for_timeout(300)
        m2 = await q.evaluate("(()=>Object.fromEntries([...document.querySelectorAll('#view-ajustes section.stsec')].map(d=>[d.id,((d.querySelector('.stsec__meta')||{}).textContent||'').trim()])))()")
        chk('T-4 los resúmenes se actualizan: API key en uso, 2 columnas aprendidas, 1 marcada', 'API key en uso' in m2['st-ia'] and m2['st-ia-aprendido'].startswith('2 columnas') and m2['st-ia-privacidad'].startswith('1 columna marcada'), m2)
        # menú de cuenta -> Cuenta y nube
        await q.goto(u + '#inicio'); await q.wait_for_timeout(500)
        await q.evaluate("FP.app.state.cloud.session={userId:'u',email:'a@b.com',teamId:'t',teamName:'Eq'};FP.app.render()")
        await q.evaluate("(document.getElementById('tour-offer')||{remove(){}}).remove()")
        await q.click('#acct-menu-btn'); await q.click('#acct-menu [data-action="settings-go"]'); await q.wait_for_timeout(800)
        chk('T-5 el menú de la cuenta abre Configuración directo en «Cuenta y nube»', await q.evaluate("location.hash")=='#ajustes' and await q.evaluate("document.querySelector('.sttab[aria-selected=true]').dataset.tab")=='cuenta' and await q.evaluate(VIS)==['st-nube'], await q.evaluate(VIS))
        await q.evaluate("FP.app.state.cloud.session=null;FP.app.render()")
        # desborde y encabezados
        for w in (320, 768, 1280, 1920):
            await q.set_viewport_size({'width': w, 'height': 900})
            for t in TABS:
                await q.evaluate(f"FP.app.state.stTab='{t}';FP.app.render()"); await q.wait_for_timeout(120)
                ov = await q.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth+1")
                if ov: chk(f'T-6 sin desborde horizontal a {w}px en «{t}»', False, w)
        chk('T-6 sin desborde horizontal de 320 a 1920 px en las cinco pestañas', not [f for f in fails if f.startswith('T-6')])
        h = await q.evaluate("(()=>{const v=document.getElementById('view-ajustes');const hs=[...v.querySelectorAll('h1,h2,h3,h4,h5')].filter(x=>x.checkVisibility());let prev=0,jump=0;hs.forEach(x=>{const n=+x.tagName[1];if(prev&&n>prev+1)jump++;prev=n});return {jump,h2:v.querySelectorAll('h2').length}})()")
        chk('T-6 los encabezados no saltan de nivel', h['jump']==0 and h['h2']==1, h)
        chk('T-7 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
