import asyncio, json, sys, hashlib, re
from playwright.async_api import async_playwright
ROOT=sys.argv[1]
VIEWS=['inicio','negocio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','reforecast','diagnostico','producto','recovery','medir','narrativa','paquete','segmentos','ayuda']
CAP="window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})();"
R={}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); errs=[]
        pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page()
        pg.on('pageerror',lambda e:errs.append(str(e)))
        url=f'file://{ROOT}/index.html'
        await pg.goto(url+'#resumen'); await pg.wait_for_timeout(900)
        await pg.click('[data-action="generate-mock"]',timeout=5000); await pg.wait_for_timeout(1500)
        # hashes de exports (se quitan campos de fecha/hora)
        ex={}
        for view,act in [('pacing','fc-export'),('reforecast','rf-export'),('diagnostico','dx-export'),('narrativa','nx-export')]:
            await pg.goto(url+'#'+view); await pg.wait_for_timeout(700); await pg.evaluate(CAP)
            await pg.click(f'[data-action="{act}"]',timeout=2000); await pg.wait_for_timeout(500)
            h=await pg.evaluate("window.__dl.map(x=>x[1])")
            ex[view]=[hashlib.md5(re.sub(r'"[A-Za-z_]*(At|Date|Time|time|stamp|Id|id)":"[^"]*"','',x).encode()).hexdigest() for x in h]
        R['export_hash']=ex
        # pruebas de almacenamiento por su botón (vista producto)
        await pg.goto(url+'#producto'); await pg.wait_for_timeout(800)
        try:
            await pg.click('[data-action="storage-tests"]',timeout=2000); await pg.wait_for_timeout(6000)
            R['storage_ui']=await pg.evaluate("(document.body.innerText.match(/Pruebas de almacenamiento[^\\n]*|\\d+ de \\d+ correctas/)||['sin texto'])[0]")
        except Exception as e: R['storage_ui']='sin botón: '+str(e)[:50]
        # teclado: el primer Tab llega a la navegación y el foco es visible
        await pg.goto(url+'#inicio'); await pg.wait_for_timeout(600)
        for _ in range(4): await pg.keyboard.press('Tab')
        R['focus']=await pg.evaluate("(()=>{const e=document.activeElement;const o=getComputedStyle(e).outlineStyle;return [e.tagName,(e.getAttribute('aria-label')||e.innerText||'').slice(0,30),o]})()")
        # nombres accesibles en botones e inputs
        R['unnamed']=await pg.evaluate("[...document.querySelectorAll('button,input,select')].filter(e=>!e.hidden&&!(e.getAttribute('aria-label')||e.innerText.trim()||e.title||(e.id&&document.querySelector('label[for=\"'+e.id+'\"]'))||e.closest('label'))).map(e=>e.outerHTML.slice(0,70))")
        # un solo aria-current=page en el menú
        R['current']=await pg.evaluate("document.querySelectorAll('.app-nav [aria-current=page]').length")
        R['errors']=errs[:5]
        # móvil: todas las vistas sin scroll horizontal del documento
        m=await (await b.new_context(viewport={'width':390,'height':800})).new_page(); m.on('pageerror',lambda e:errs.append(str(e)))
        mo={}
        for v in VIEWS:
            await m.goto(url+'#'+v); await m.wait_for_timeout(500)
            mo[v]=await m.evaluate("document.documentElement.scrollWidth-window.innerWidth")
        R['mobile_overflow']={k:v for k,v in mo.items() if v>0}
        await m.goto(url+'#ayuda'); await m.wait_for_timeout(500)
        if await m.query_selector('.menu-toggle'):
            await m.click('.menu-toggle'); await m.click('.app-nav a[data-nav="pacing"]'); await m.wait_for_timeout(500)
            R['mobile_nav_closes']=await m.evaluate("!document.body.classList.contains('nav-open') && location.hash==='#pacing'")
        else: R['mobile_nav_closes']='n/a (original sin menú móvil)'
        R['errors_total']=errs[:5]
        await b.close()
asyncio.run(main()); print(json.dumps(R,ensure_ascii=False,indent=1))
