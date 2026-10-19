"""v0.15.0 · Detalle temporal con clientes (nuevos / recurrentes / reactivados / no regresaron) y columna «Cierre proyectado»
en la tabla principal de Evolución y patrones (escritorio y móvil). Uso: python3 batch_clientes_forecast.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
STUB = """()=>{ const keys=(FP.app.state.an.periodsList||[]).map(p=>p.key); const by={}; keys.forEach((k,i)=>{ by[k]={key:k,customers:{new:100+i,recurrent:200+i,reactivated:10+i,total:310+3*i},lapsed:i===0?null:50+i,lapsedBase:300,reliableNew:i>1}; });
  FP.customerStore={analyze:async()=>({status:'ok',options:{warmupDays:180,reactivationDays:180},monthly:Object.values(by)})}; return keys.length; }"""
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1000); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
    th = await q.evaluate("[...document.querySelectorAll('#an-trend-table th')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())")
    chk(f'{tag}1 la tabla principal tiene la columna «Cierre proyectado»', any('Cierre proyectado' in t for t in th), th)
    cells = await q.evaluate("[...document.querySelectorAll('#an-trend-table td[data-label=\"Cierre proyectado\"], #an-trend-table tbody tr td:last-child')].map(c=>c.innerText.replace(/\\s+/g,' ').trim()).slice(0,6)")
    chk(f'{tag}2 cada fila muestra el cierre proyectado marcado como proyección (o «Sin proyección»)', cells and all(('proyección' in c.lower() or 'sin proyección' in c.lower()) for c in cells), cells)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}3 sin desborde horizontal de la página ({ov}px)', ov <= 1, ov)
    # el valor es el primer período proyectado del motor de tendencia
    ok = await q.evaluate("""(()=>{const a=FP.app.state.an;const r=(a.forecast&&a.forecast.rows||[])[0];if(!r)return {none:true};
      const row=[...document.querySelectorAll('#an-trend-table tbody tr')].find(tr=>tr.querySelector('th').innerText.trim().startsWith(r.entity));
      return {entity:r.entity,has:!!row,txt:row?row.lastElementChild.innerText:'' , v:r.periods[0].value}})()""")
    chk(f'{tag}4 la cifra mostrada corresponde al primer período proyectado de la entidad', ok.get('none') or (not ok['has']) or str(round(ok['v'])) in ok['txt'].replace(',', '').replace('$', ''), ok)
    # Detalle temporal del total con clientes (libro simulado)
    n = await q.evaluate(STUB)
    await q.evaluate("FP.app.actions['an-drill-total']({dataset:{source:'kpi'}})"); await q.wait_for_selector('#an-drill', timeout=20000)
    await q.wait_for_selector('#an-drill table[aria-label="Detalle por período"]', state='attached', timeout=60000); await q.wait_for_function("!FP.app.state.an.drill.pending", timeout=60000)
    await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
    hd = await q.evaluate("[...document.querySelectorAll('#an-drill table[aria-label=\"Detalle por período\"] th')].map(t=>t.innerText.trim())")
    chk(f'{tag}5 el Detalle temporal del total agrega Clientes nuevos, Recurrentes, Reactivados y No regresaron', all(x in hd for x in ['Clientes nuevos', 'Recurrentes', 'Reactivados', 'No regresaron']), hd)
    row = await q.evaluate("(()=>{const r=document.querySelector('#an-drill table[aria-label=\"Detalle por período\"] tbody tr:last-child');return r?r.innerText.replace(/\\s+/g,' '):''})()")
    chk(f'{tag}6 la última fila (parcial) trae las cifras y marca «parcial» en no regresaron', 'parcial' in row.lower() and '(parcial)' in row, row)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}7 detalle sin desborde horizontal ({ov}px)', ov <= 1, ov)
    legend = await q.evaluate("document.querySelector('#an-drill details.drill-fold .field__hint')?.innerText||''")
    chk(f'{tag}8 se explica qué es nuevo, recurrente, reactivado y no regresaron', all(x in legend for x in ['nuevo', 'recurrente', 'reactivado', 'no regresaron']), legend[:200])
    # una entidad: no se inventa el dato por producto
    await q.evaluate("FP.app.actions['an-drill']({dataset:{entity:'Alfa 10 mg',source:'patron'}})"); await q.wait_for_selector('#an-drill', timeout=20000)
    await q.wait_for_selector('#an-drill table[aria-label="Detalle por período"]', state='attached', timeout=60000); await q.wait_for_function("!FP.app.state.an.drill.pending", timeout=60000)
    await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
    note = await q.evaluate("(document.querySelector('[data-customers-context]')||{}).innerText||''"); hd2 = await q.evaluate("[...document.querySelectorAll('#an-drill table[aria-label=\"Detalle por período\"] th')].map(t=>t.innerText.trim())")
    chk(f'{tag}9 en un producto se muestran los clientes del CANAL rotulados como contexto (libro por pedido, no por producto)', 'Clientes nuevos del canal' in hd2 and 'no de esta entidad' in note and 'por pedido' in note, [hd2, note])
    # sin libro de clientes
    await q.evaluate("FP.customerStore={analyze:async()=>({status:'no_ledger'})}")
    await q.evaluate("FP.app.actions['an-drill-total']({dataset:{source:'kpi'}})"); await q.wait_for_selector('#an-drill table[aria-label="Detalle por período"]', state='attached', timeout=60000); await q.wait_for_function("!FP.app.state.an.drill.pending", timeout=60000)
    await q.evaluate("document.querySelectorAll('#an-drill details.drill-fold').forEach(d=>d.open=true)")
    note2 = await q.evaluate("(document.querySelector('[data-customers-note]')||{}).innerText||''")
    chk(f'{tag}10 sin libro de clientes avisa qué archivo cargar', 'id de cliente' in note2, note2)
    chk(f'{tag}11 sin errores de página', not q._errs, q._errs[:3])
    await q.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_clientes_forecast:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
