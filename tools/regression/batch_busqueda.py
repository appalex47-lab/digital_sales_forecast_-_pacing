"""Búsqueda global: Ctrl+K / «/», agrupada (Ir a · Acción · Concepto), teclado, móvil en pantalla completa.
Uso: python3 batch_busqueda.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'; mobile = w < 800
    q = await new_page(b, w, h); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.goto(u + '#carga'); await q.wait_for_function("window.FP && FP.search && FP.app && FP.app.state", timeout=30000); await q.wait_for_timeout(800)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    vis = lambda sel: q.evaluate("(s)=>{const e=document.querySelector(s);return !!e&&!e.hidden&&e.getBoundingClientRect().width>0}", sel)
    if mobile: await q.click('#gs-open')
    else: await q.keyboard.press('Control+k')
    await q.wait_for_selector('#gs-input', state='visible', timeout=5000)
    chk(f'{tag}1 se abre la búsqueda ({"botón 🔍" if mobile else "Ctrl+K"})', await vis('#gs .gs__box'), None)
    await q.fill('#gs-input', 'brecha'); await q.wait_for_timeout(200)
    g = await q.evaluate("[...document.querySelectorAll('#gs .gs__grp')].map(e=>e.innerText)")
    chk(f'{tag}2 «brecha» muestra grupos Ir a y Concepto ({g})', any(x.lower() == 'concepto' for x in g) and any(x.lower() == 'ir a' for x in g), g)
    chk(f'{tag}3 «brecha» encuentra el glosario «Gap»', await q.evaluate("[...document.querySelectorAll('#gs .gs__row b')].some(e=>/gap|brecha/i.test(e.innerText))"), None)
    if mobile:
        box = await q.evaluate("(()=>{const r=document.querySelector('#gs .gs__box').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()")
        chk(f'{tag}4 en móvil ocupa toda la pantalla ({box})', box[0] >= w - 2 and box[1] >= h - 2, box)
    await q.fill('#gs-input', 'datos'); await q.wait_for_timeout(200)
    await q.keyboard.press('Enter'); await q.wait_for_timeout(600)
    h2 = await q.evaluate("location.hash"); closed = not await vis('#gs .gs__box')
    chk(f'{tag}5 Enter abre el primer resultado y cierra ({h2})', closed and h2 != '', [h2, closed])
    # Esc cierra y «/» abre
    await q.keyboard.press('/'); await q.wait_for_timeout(300)
    chk(f'{tag}6 «/» abre la búsqueda', await vis('#gs .gs__box'), None)
    await q.keyboard.press('Escape'); await q.wait_for_timeout(200)
    chk(f'{tag}7 Esc la cierra', not await vis('#gs .gs__box'), None)
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}8 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    if not mobile:
        # el campo del encabezado NO se abre al recibir el foco con Tab (no atrapa el teclado); sí con Enter, Espacio, clic o una letra
        await q.evaluate("document.getElementById('gs-field').focus()"); await q.wait_for_timeout(300)
        chk(f'{tag}10 el foco por Tab en el campo del encabezado no abre la búsqueda', not await vis('#gs .gs__box') and await q.evaluate("document.activeElement.id") == 'gs-field', None)
        await q.keyboard.press('Enter'); await q.wait_for_timeout(300)
        chk(f'{tag}11 Enter en el campo la abre', await vis('#gs .gs__box'), None)
        await q.keyboard.press('Escape'); await q.wait_for_timeout(200)
        await q.evaluate("document.getElementById('gs-field').focus()"); await q.keyboard.press('p'); await q.wait_for_timeout(300)
        chk(f'{tag}12 una letra en el campo abre la búsqueda con esa letra', await vis('#gs .gs__box') and await q.evaluate("document.getElementById('gs-input').value") == 'p', None)
        await q.keyboard.press('Escape'); await q.wait_for_timeout(200)
    chk(f'{tag}9 sin errores de JavaScript', not errs, errs[:2])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_busqueda:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
