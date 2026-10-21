"""Nube: loader visible al subir, restaurar y borrar la copia (nube simulada con retardos). Uso: python3 batch_cloud_loader.py <raiz>"""
import sys, asyncio, re
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(U + '#ajustes'); await q.wait_for_selector('#view-ajustes:not([hidden])'); await q.wait_for_timeout(600)
        await q.evaluate("FP.app.actions['st-tab']({dataset:{tab:'cuenta'}})"); await q.wait_for_timeout(300)
        await q.evaluate("""(()=>{window.confirm=()=>true; const st=FP.app.state; st.cloud.session={userId:'u1',email:'ana@empresa.com',teamId:'T',teamName:'Eq'};
          const w=(ms)=>new Promise(r=>setTimeout(r,ms));
          FP.cloud.loadSession=()=>({user_id:'u1',email:'ana@empresa.com',team_id:'T',team_name:'Eq'}); FP.cloud.download=async(o)=>{for(let i=1;i<=4;i++){await w(450);o&&o.onProgress&&o.onProgress({doneBytes:i*1024*512,totalBytes:4*1024*512});}return {ok:true,items:[]}};
          FP.cloud.remove=async(o)=>{for(let i=1;i<=4;i++){await w(450);o&&o.onProgress&&o.onProgress({index:i,of:4,key:'k'+i});}return {ok:true}};
          FP.cloud.upload=async()=>{await w(900);return {ok:false,error:'simulado'}};
          FP.productSync.build=async()=>({bytes:1,keys:[],items:0,rows:0});
          FP.app.render();})()""")
        await q.wait_for_selector('[data-action="cloud-delete"]:not([disabled])', timeout=8000)
        for act, op, lbl in [('cloud-upload','upload','Subiendo…'),('cloud-download','restore','Restaurando…'),('cloud-delete','delete','Borrando…')]:
            await q.evaluate(f"setTimeout(()=>FP.app.actions['{act}'](),0)"); await q.wait_for_timeout(350)
            s = await q.evaluate("""(()=>{const e=document.getElementById('cloud-progress'); const bt=[...document.querySelectorAll('[data-action^=cloud-]')].filter(x=>['cloud-upload','cloud-download','cloud-delete'].includes(x.dataset.action));
              return {has:!!e, role:e&&e.getAttribute('role'), label:e&&e.querySelector('.ldr__label').textContent, busyBtn:bt.filter(x=>x.getAttribute('aria-busy')==='true').map(x=>x.dataset.action+':'+x.textContent.trim()), dis:bt.every(x=>x.disabled)}})()""")
            chk(f'CL-{op} aparece el loader con su etapa y el botón activo cambia de texto', s['has'] and s['role']=='progressbar' and len(s['busyBtn'])==1 and lbl in s['busyBtn'][0] and s['dis'], s)
            if op in ('restore','delete'):
                await q.wait_for_timeout(1200)
                pg = await q.evaluate("(()=>{const e=document.getElementById('cloud-progress');return {now:e.getAttribute('aria-valuenow'),label:e.querySelector('.ldr__label').textContent+' '+e.querySelector('.ldr__pct').textContent,time:e.querySelector('.ldr__time').textContent,ind:e.classList.contains('ldr--ind')}})()")
                chk(f'CL-{op}-prog el avance es progresivo (porcentaje y bloques/MB) y muestra el tiempo', pg['now'] is not None and not pg['ind'] and re.search(r'\d+ %', pg['label']) and re.search(r'\d:\d\d transcurridos', pg['time']) and ('KB' in pg['label'] or 'MB' in pg['label'] or 'bloques' in pg['label']), pg)
            await q.wait_for_function("!FP.app.state.cloud.busy", timeout=15000); await q.wait_for_timeout(200)
            gone = await q.evaluate("!document.getElementById('cloud-progress') && [...document.querySelectorAll('[data-action=cloud-upload],[data-action=cloud-download],[data-action=cloud-delete]')].every(x=>!x.disabled&&x.getAttribute('aria-busy')!=='true')")
            chk(f'CL-{op}-fin al terminar desaparece el loader y los botones vuelven a estar activos', gone)
        chk('CL-err sin errores de consola', not errs, errs[:3])
        await b.close()
asyncio.run(main())
