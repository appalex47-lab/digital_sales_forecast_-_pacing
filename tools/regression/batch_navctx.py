"""Fase 5: navegación contextual — barra de origen y regreso en las vistas de la ruta. Uso: python3 batch_navctx.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'batch_ruta.py')).read().split('async def main')[0])
W=1280
STEPS=[('fix_quality','calidad'),('complete_data','carga'),('review_gap','diagnostico'),('investigate_cr','diagnostico'),('investigate_aov','producto'),('investigate_traffic','segmentos'),('review_channel','pacing'),('evaluate_levers','reforecast'),('simulate','recovery'),('plan_action','recovery'),('follow_up','medir'),('monitor','pacing')]
async def run():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']); q=await (await b.new_context(viewport={'width':W,'height':900})).new_page(); errs=[]
        q.on('pageerror',lambda e:errs.append(str(e)[:150]))
        await q.clock.set_fixed_time(dt.datetime(2026,9,23,9,0)); await seed_gap(q)
        for st,v in STEPS:
            await q.goto(U+'#inicio'); await q.wait_for_timeout(900); await q.evaluate(NOTOUR); await scale(q)
            await q.evaluate("FP.app.render&&FP.app.render()")
            r=await q.evaluate("""([st,v])=>{const b=document.createElement('button');b.dataset.action='route-go';b.dataset.route=st;b.dataset.step=st;b.dataset.view=v;b.dataset.key=document.querySelector('#nbs [data-key]').dataset.key;document.body.appendChild(b);b.click();b.remove();return 1}""",[st,v])
            await q.wait_for_timeout(1200)
            o=await q.evaluate("""()=>{const o=document.querySelector('.route-origin');const d=document.documentElement;return {h:location.hash,bar:!!o,vis:o&&o.getBoundingClientRect().height>0,txt:o?o.innerText.replace(/\\s+/g,' ').slice(0,110):'',ov:d.scrollWidth>d.clientWidth,back:!!(o&&o.querySelector('[data-action="route-back"]'))}}""")
            chk(f'N-{st} la barra «Vienes de Inicio» aparece en #{v}, con botón de volver y sin desborde',o['h']=='#'+v and o['bar'] and o['vis'] and o['back'] and not o['ov'],o)
        await q.click('.route-origin [data-action="route-back"]'); await q.wait_for_timeout(1200)
        bk=(await q.evaluate("({h:location.hash,bar:!!document.querySelector('.route-origin'),y:0})"))
        chk('N-volver «Volver a Inicio» regresa a #inicio y quita la barra',bk['h']=='#inicio' and not bk['bar'],bk)
        # Fase 2: el menú marca el paso actual y el siguiente de la ruta
        await q.goto(U+'#inicio'); await q.wait_for_timeout(900); await q.evaluate(NOTOUR); await scale(q); await q.evaluate("FP.app.render&&FP.app.render()")
        await q.click('#nbs button.btn--primary'); await q.wait_for_timeout(1500)
        mh=await q.evaluate("[...document.querySelectorAll('.app-nav .snav__hint')].map(e=>e.closest('.snav__item').dataset.nav+':'+e.innerText)")
        chk('N-menu el menú marca «Paso N de M» en Diagnóstico y «Sigue: paso N+1» en el siguiente', any(x.startswith('diagnostico:Paso ') for x in mh) and any('Sigue: paso ' in x for x in mh), mh)
        await q.goto(U+'#pacing'); await q.wait_for_timeout(900)
        mh2=await q.evaluate("({n:document.querySelectorAll('.app-nav .snav__hint').length,dot:!![...document.querySelectorAll('.snav__toggle[data-route-hint]')].length,ov:document.documentElement.scrollWidth>document.documentElement.clientWidth})")
        chk('N-menu las marcas siguen mientras la ruta está activa, aunque estés en otra vista, y sin desborde', mh2['n']>=1 and not mh2['ov'], mh2)
        await q.evaluate("FP.attentionView.clearOrigin(FP.app.state); FP.app.render&&FP.app.render()"); await q.wait_for_timeout(500)
        chk('N-menu sin ruta activa no hay marcas', await q.evaluate("document.querySelectorAll('.app-nav .snav__hint').length")==0)
        # Fase 6: fecha fuera de la venta real → aviso y regreso
        await q.goto(U+'#inicio'); await q.wait_for_timeout(900)
        await q.click('#topbar-ref'); await q.fill('#topbar-date','2025-06-01'); await q.dispatch_event('#topbar-date','change'); await q.wait_for_timeout(900); await q.keyboard.press('Escape')
        await q.goto(U+'#inicio'); await q.wait_for_timeout(600)
        bn=await q.evaluate("(()=>{const b=document.querySelector('[data-banner=range]');return b?b.innerText:null})()")
        chk('N-rango una fecha sin venta real muestra aviso con la última fecha cargada', bool(bn) and 'no tiene venta real' in bn and '2026-' in bn, bn)
        await q.click('[data-banner=range] button'); await q.wait_for_timeout(900)
        r2=await q.evaluate("({b:!!document.querySelector('[data-banner=range]'),nbs:!!document.getElementById('nbs')})")
        chk('N-rango el botón del aviso regresa al último día con real y Inicio vuelve completo', not r2['b'] and r2['nbs'], r2)
        chk('N-err sin errores de página',not errs,errs)
asyncio.run(run())
print('RESULTADO batch_navctx:', 'OK' if not fails else 'FALLAS: '+', '.join(fails))
