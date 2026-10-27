"""Contenedor único de filtros (A): fila principal, chips, panel; hoja inferior en móvil. Evolución y Productos.
Uso: python3 batch_filtros_shell.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    mobile = w < 500
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1000); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
    vis = lambda sel: q.evaluate("(s)=>{const e=document.querySelector(s);return !!e&&e.getBoundingClientRect().width>0&&e.offsetParent!==null||(!!e&&getComputedStyle(e).position==='fixed')}", sel)
    chk(f'{tag}1 lo básico está a la vista (canal, granularidad, periodo, comparación)', await vis('#pa-ch') and await vis('#pa-gran') and await vis('#pa-focus') and await vis('#pa-cmp'), None)
    chk(f'{tag}2 la geografía está en el panel cerrado', not await vis('#pa-g-region') , None)
    await q.click('.fshell[data-fshell=pa] .fshell__toggle'); await q.wait_for_timeout(300)
    pan = await q.evaluate("(()=>{const p=document.querySelector('.fshell__panel');return !!p&&getComputedStyle(p).display!=='none'&&p.getBoundingClientRect().height>0})()")
    chk(f'{tag}3 «Filtros» abre el panel', pan, None)
    if mobile:
        pos = await q.evaluate("getComputedStyle(document.querySelector('.fshell__panel')).position")
        chk(f'{tag}3b en móvil el panel es una hoja inferior fija ({pos})', pos == 'fixed', pos)
        chk(f'{tag}3c hay botón «Ver resultados»', await vis('.fshell__foot .btn--primary'), None)
        await q.click('.fshell__foot .btn--primary')
    else: await q.click('.fshell[data-fshell=pa] .fshell__toggle')
    await q.wait_for_timeout(300)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}7 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    # Productos
    await q.evaluate("location.hash='#prodevol'"); await q.wait_for_timeout(1200)
    ok = await q.evaluate("!!document.querySelector('#pe-body .fshell')")
    chk(f'{tag}8 Productos usa el mismo contenedor', ok, None)
    chk(f'{tag}8b Canal, granularidad, periodo y comparación a la vista (Desde/Hasta solo en modo Rango) y geografía en el panel', await vis('#pa-ch') and await vis('#pa-gran') and await vis('#pa-focus') and await vis('#pa-cmp') and not await vis('#pa-from'), None)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}9 Productos sin desborde ({ov}px)', ov <= 1, ov)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_filtros_shell:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
