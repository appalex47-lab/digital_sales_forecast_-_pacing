"""Loader con barra y tiempo en Detalle (carga y «Calculando el detalle temporal») y en Clientes y LTV.
Uso: python3 batch_loader_general.py <raiz>"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1000); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
    await q.evaluate("(()=>{const o=FP.productStore.aggregateScan;FP.productStore.aggregateScan=async function(...a){await new Promise(r=>setTimeout(r,1500));return o.apply(this,a);};})()")
    ent = await q.evaluate("FP.app.state.an.rows[0].entity")
    await q.evaluate("(e)=>FP.app.actions['an-select']({dataset:{entity:e,source:'tabla'}})", ent)
    await q.wait_for_selector('#an-drill .fp-loader', timeout=5000)
    t1 = await q.evaluate("document.querySelector('#an-drill .fp-loader__t').innerText")
    await q.wait_for_timeout(1300)
    t2 = await q.evaluate("(document.querySelector('#an-drill .fp-loader__t')||{}).innerText")
    chk(f'{tag}1 el detalle muestra barra con segundos ({t1} → {t2})', bool(re.match(r'^\d+ s', t1)) and bool(re.match(r'^\d+ s', t2 or '')), [t1, t2])
    chk(f'{tag}1b hay barra', await q.evaluate("!!document.querySelector('#an-drill .fp-loader__bar')"), None)
    await q.wait_for_function("FP.app.state.an.drill && !FP.app.state.an.drill.loading", timeout=60000)
    pend = await q.evaluate("(()=>{const d=FP.app.state.an.drill;return d.pending})()")
    await q.wait_for_function("FP.app.state.an.drill && !FP.app.state.an.drill.loading && !FP.app.state.an.drill.pending", timeout=90000)
    chk(f'{tag}2 al terminar el detalle ya no queda loader', await q.evaluate("!document.querySelector('#an-drill .fp-loader')"), pend)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}3 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    # mensaje de error entendible
    await q.evaluate("Date.now=()=>9e12; window.dispatchEvent(new ErrorEvent('error',{error:new TypeError(\"Cannot read properties of undefined (reading 'name')\"),filename:'http://x/js/app.js',lineno:5}))")
    await q.wait_for_timeout(600)
    tt = await q.evaluate("document.getElementById('toast').innerText")
    chk(f'{tag}4 el aviso de error es entendible', 'Algo no se pudo mostrar' in tt and 'Detalle técnico' in tt, tt[-200:])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_loader_general:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
