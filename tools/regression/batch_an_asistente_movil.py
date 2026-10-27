"""v0.14.2 · Análisis en móvil con mes parcial: tarjetas con el nombre a todo el ancho, botón de cerrar del asistente con X,
y validación de cifras del asistente en lenguaje natural (mes parcial = casi todo cae). Uso: python3 batch_an_asistente_movil.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b, 375, 740)
        await q.goto(u + '#carga'); await q.wait_for_timeout(1500); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")   # en móvil la oferta del recorrido aparece sola
        await load_products(q, u)
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        info = await q.evaluate("({partial: FP.app.state.an.comparisonInfo && FP.app.state.an.comparisonInfo.partial, rows: (FP.app.state.an.rows||[]).length})")
        chk('M0 hay un mes parcial (octubre, hasta el 5) con entidades', info['rows'] > 0, info)
        r = await q.evaluate("""(()=>{const bad=[];let n=0;document.querySelectorAll('#pe-body table.table--cards').forEach(t=>{t.querySelectorAll('tbody tr').forEach(tr=>{const c=tr.querySelector('th,td');if(!c)return;n++;const w=c.getBoundingClientRect().width,rw=tr.getBoundingClientRect().width;if(rw>0&&w<0.8*rw)bad.push([t.className.slice(0,40),Math.round(w),Math.round(rw)])})});return {n,bad:bad.slice(0,6)}})()""")
        chk('M1 en tarjetas (375 px) el nombre de la entidad ocupa todo el ancho de la tarjeta', r['n'] > 0 and not r['bad'], r)
        ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth")
        chk('M2 sin desborde horizontal', ov <= 0, ov)
        await q.evaluate("FP.app.actions['an-assistant-toggle']()"); await q.wait_for_selector('.analysis-assistant__panel', timeout=5000)
        c = await q.evaluate("""(()=>{const b=document.querySelector('.analysis-assistant__close');if(!b)return null;const r=b.getBoundingClientRect();return {txt:b.textContent.trim(),svg:!!b.querySelector('svg'),label:b.getAttribute('aria-label'),w:Math.round(r.width),h:Math.round(r.height)}})()""")
        chk('M3 el botón de cerrar es una X (sin texto), con nombre accesible y ≥ 36 px', c and c['txt'] == '' and c['svg'] and c['label'] == 'Cerrar asistente' and c['w'] >= 36 and c['h'] >= 36, c)
        await q.screenshot(path=os.environ.get('SHOT', '/tmp') + '/asistente_movil.png')
        await q.click('.analysis-assistant__close'); await q.wait_for_timeout(300)
        chk('M4 la X cierra el panel', await q.evaluate("!document.querySelector('.analysis-assistant__panel')"))
        v = await q.evaluate("""(()=>{const A=FP.cohereAnalysisAssistant,ctx=A.buildContext(FP.app.state);const d=(ctx.hecho.declines||[]).filter(x=>x.delta<0).slice(0,3);if(!d.length)return {none:true};
          const fmt=n=>Math.abs(Math.round(n)).toLocaleString('en-US');
          const natural=d.map(x=>x.entity+' cayó $'+fmt(x.delta)).join('; ')+'.';
          const miles=d.map(x=>x.entity+' cambió -$'+(Math.abs(x.delta)/1000).toFixed(0)+' mil').join('; ')+'.';
          const fake='Cayeron $'+fmt(d[0].delta*7.31+123)+' en total.';
          const up=d[0].entity+' subió $'+fmt(d[0].delta)+'.';
          return {up:A.validateResponse({answer:up,evidence:[]},ctx),n:d.length,natural:A.validateResponse({answer:natural,evidence:[]},ctx),miles:A.validateResponse({answer:miles,evidence:[]},ctx),fake:A.validateResponse({answer:fake,evidence:[]},ctx),txt:natural}})()""")
        chk('M5 con datos reales de mes parcial, una respuesta con «cayó $X» (sin signo) y «-$X mil» pasa la validación', not v.get('none') and v['natural']['ok'] and v['miles']['ok'], v)
        chk('M6 una cifra inventada sigue rechazándose', not v.get('none') and not v['fake']['ok'], v)
        chk('M7 con datos reales: «subió $X» sobre una caída se rechaza por dirección', not v.get('none') and not v['up']['ok'] and 'caída' in ' '.join(v['up']['errors']), v.get('up'))
        chk('Sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_an_asistente_movil:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
