"""Evolución y patrones: cambiar «Analizar por» muestra la barra de carga con tiempo y termina con datos (sin quedarse vacío).
Uso: python3 batch_evolucion_carga.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1000); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='category', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
    # frena la lectura para poder ver la carga
    await q.evaluate("(()=>{const o=FP.productStore.aggregate;FP.productStore.aggregate=async function(...a){await new Promise(r=>setTimeout(r,120));return o.apply(this,a);};})()")
    await q.evaluate("FP.app.actions['pe-evolevel']({value:'subcategory'})")
    await q.wait_for_selector('#an-loader', timeout=5000)
    await q.wait_for_timeout(1200)
    r = await q.evaluate("(()=>{const e=document.getElementById('an-loader');return e?{w:e.querySelector('.ldr__bar i').style.width,t:e.querySelector('.ldr__pct').innerText+' '+e.querySelector('.ldr__time').innerText,now:e.getAttribute('aria-valuenow')}:null})()")
    chk(f'{tag}1 se ve una barra de carga con porcentaje y segundos', r and r['w'] not in ('', '0%') and '%' in r['t'] and 'transcurridos' in r['t'], r)
    chk(f'{tag}1b durante la carga los filtros (Canal, periodo…) siguen visibles', await q.evaluate("!!document.getElementById('pa-ch')"), None)
    # cambio rápido de nivel mientras carga: gana el último y se terminan mostrando datos
    await q.evaluate("FP.app.actions['pe-evolevel']({value:'product'})")
    await q.wait_for_function("!FP.app.state.an.loading && FP.app.state.an.rows.length>0", timeout=90000)
    await q.wait_for_timeout(400)
    lv = await q.evaluate("[FP.app.state.an.level, FP.app.state.an.rows.length, !!document.querySelector('#b-cuando .px-sm'), !document.getElementById('an-loader')]")
    chk(f'{tag}2 al terminar aparece la tabla del último nivel elegido, sin quedarse vacía', lv[0] == 'product' and lv[1] > 0 and lv[2] and lv[3], lv)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}3 sin desborde horizontal ({ov}px)', ov <= 1, ov)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_evolucion_carga:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
