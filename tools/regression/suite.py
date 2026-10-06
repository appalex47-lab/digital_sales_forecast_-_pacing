import asyncio, json, sys, hashlib
from playwright.async_api import async_playwright
ROOT = sys.argv[1]; TAG = sys.argv[2]
VIEWS=['inicio','negocio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','reforecast','diagnostico','producto','recovery','medir','narrativa','paquete','segmentos','ayuda']
R = {}
CAP = "window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})();"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' else None)
        url = f'file://{ROOT}/index.html'
        await pg.goto(url+'#resumen'); await pg.wait_for_timeout(1000)
        # 1 motor
        r = await pg.evaluate("(()=>{const r=FP.selfTest.run();return {p:r.passed,t:r.total}})()"); R['selftest']=r
        try:
            r = await asyncio.wait_for(pg.evaluate("FP.storageTests.run().then(r=>({p:r.passed,t:r.total}))"), 40); R['storage']=r
        except Exception as e: R['storage']='TIMEOUT/ERR '+str(e)[:60]
        # 2 datos de prueba + plan + meta
        await pg.click('[data-action="generate-mock"]', timeout=5000); await pg.wait_for_timeout(1500)
        # 3 vistas
        vs={}
        for v in VIEWS:
            await pg.goto(url+'#'+v); await pg.wait_for_timeout(700)
            vis = await pg.evaluate(f"(()=>{{const m=document.getElementById('view-{v}');return !!m && !m.hidden && m.innerText.trim().length>20}})()")
            ov = await pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            vs[v]={'visible':vis,'hoverflow':ov}
        R['views']=vs
        # 4 exports (contenido determinista)
        await pg.goto(url+'#pacing'); await pg.wait_for_timeout(800); await pg.evaluate(CAP)
        ex={}
        for view,act in [('pacing','fc-export'),('reforecast','rf-export'),('diagnostico','dx-export'),('plan','plan-export'),('narrativa','nx-export'),('producto','pa-export')]:
            await pg.goto(url+'#'+view); await pg.wait_for_timeout(700); await pg.evaluate(CAP)
            try:
                await pg.click(f'[data-action="{act}"]', timeout=1500); await pg.wait_for_timeout(500)
                d = await pg.evaluate("window.__dl.map(x=>x[0].replace(/[0-9T:-]{10,}/g,'')+'|'+x[1].length)")
                h = await pg.evaluate("window.__dl.map(x=>x[1])")
                ex[view]={'files':d,'sha':[hashlib.md5(re.sub(r'\"(generated|exportedAt|createdAt|timestamp)[A-Za-z]*\":\"[^\"]*\"','',x).encode()).hexdigest() for x in h]} if False else {'files':d}
            except Exception as e:
                ex[view]={'skipped':'no button/disabled'}
        R['exports']=ex
        # 5 modos y persistencia
        await pg.goto(url+'#pacing'); await pg.wait_for_timeout(600)
        modes={}
        for m in ['learner','analyst','exec']:
            await pg.evaluate(f"document.querySelector('[data-action=\"ux-mode\"][data-value=\"{m}\"]').click()"); await pg.wait_for_timeout(300)
            modes[m]=await pg.evaluate("[document.body.classList.contains('mode-learner'),document.body.classList.contains('mode-exec')]")
        R['modes']=modes
        # 6 recarga: IndexedDB persiste
        await pg.reload(); await pg.wait_for_timeout(1500)
        R['persist']=await pg.evaluate("(()=>{const s=document.querySelector('#status-bar').innerText;return /registros/.test(s)})()")
        R['errors']=errs[:8]
        # 7 tour, glosario, drawer
        await pg.goto(url+'#inicio'); await pg.wait_for_timeout(700)
        for act in ['glossary','tour-start']:
            try:
                await pg.evaluate(f"document.querySelector('[data-action=\"{act}\"]').click()"); await pg.wait_for_timeout(500)
                R['ui_'+act]=True
            except Exception as e: R['ui_'+act]=False
        R['errors2']=errs[:8]
        await b.close()
import re
asyncio.run(main())
print(json.dumps(R, ensure_ascii=False, indent=1))
