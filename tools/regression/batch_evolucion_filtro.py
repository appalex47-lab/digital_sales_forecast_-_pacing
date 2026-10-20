"""Evolución y patrones: el filtro de página (categoría/producto/sucursal + canal) filtra toda la página y concilia con productStore.
Uso: python3 batch_evolucion_filtro.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1000); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
    base = await q.evaluate("(FP.app.state.an.share&&FP.app.state.an.share.totalSeries||[]).map(x=>x.value)")
    cat = await q.evaluate("FP.productFilter.options({}).category[0]")
    chk(f'{tag}0 hay categorías para filtrar', bool(cat), cat)
    await q.click('.fshell[data-fshell=an] .fshell__toggle')
    await q.select_option('#an-f-category', cat)
    await q.wait_for_function("!FP.app.state.an.loading && FP.app.state.an.rows.length>0 && FP.app.state.an.filter.category", timeout=90000)
    await q.wait_for_timeout(400)
    ser = await q.evaluate("(FP.app.state.an.share&&FP.app.state.an.share.totalSeries||[]).map(x=>({p:x.period,v:x.value}))")
    last = ser[-1] if ser else None
    truth_v = await q.evaluate(("""(async()=>{const a=FP.app.state.an,c=FP.temporalEngine.rangeForKey(%s,'month');const m=await FP.productStore.aggregate({from:c.from,to:c.to,channel:'total',groupBy:'total',filter:{category:a.filter.category}});let t=0;m.forEach(x=>{const f=FP.productStore.finalize(x,null);t+=f.revenue.value||0});return t})()""") % repr(last["p"] if last else ""))
    chk(f'{tag}1 la serie del total coincide con la venta de la categoría ({last and last["v"]} vs {truth_v})', last and abs(last['v'] - truth_v) < 1, [last, truth_v])
    chk(f'{tag}1b es menor que sin filtro', last and base and last['v'] < base[-1], [last, base[-1:]])
    ents = await q.evaluate("[...new Set(FP.app.state.an.rows.map(r=>r.entity))].length")
    allin = await q.evaluate("""(()=>{const c=FP.app.state.an.filter.category;const cat=FP.productStore.catalog.list;const names=new Set(cat.filter(x=>x.category===c).map(x=>x.product||x.sku));return FP.app.state.an.rows.every(r=>names.has(r.entity))})()""")
    chk(f'{tag}2 todas las filas de la tabla pertenecen a la categoría ({ents})', allin, ents)
    br = await q.evaluate("FP.app.state.an.bridge && FP.app.state.an.bridge.status")
    chk(f'{tag}3 el Puente al plan queda N/A con filtro', br == 'not_applicable', br)
    chk(f'{tag}4 el contexto muestra «Selección»', await q.evaluate("document.querySelector('.analysis-context').innerText.includes('Selección')"), None)
    await q.evaluate("document.querySelector('.fshell__bar [data-action=fs-clear]').click()")
    await q.wait_for_function("!FP.app.state.an.loading && FP.app.state.an.rows.length>0 && !Object.keys(FP.app.state.an.filter).length", timeout=90000)
    await q.wait_for_timeout(400)
    back = await q.evaluate("(FP.app.state.an.share&&FP.app.state.an.share.totalSeries||[]).map(x=>x.value)")
    chk(f'{tag}5 al quitar la selección vuelve la serie original', back and base and abs(back[-1] - base[-1]) < 1, [back[-1:], base[-1:]])
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}6 sin desborde horizontal ({ov}px)', ov <= 1, ov)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_evolucion_filtro:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
