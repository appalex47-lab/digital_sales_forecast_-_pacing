"""Presentación (PDF) · Clientes muestra todas las ventanas de recompra sin recortes y el cierre no dice «No disponible días». Corre: python3 batch_pdf_fidelidad.py <raíz>"""
import sys, asyncio, os
from an_common import *
from recovery_state import prepare
U = f'http://127.0.0.1:{port}/index.html'
SHOT = os.environ.get('RN_SHOT')   # carpeta para capturas de las láminas 8, 11 y 12
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        await load_products(q, U)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.click('[data-action="rp-generate"]'); await q.wait_for_timeout(300)
        if await q.query_selector('[data-action="rp-gap-go"]'): await q.click('[data-action="rp-gap-go"]')
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        await q.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:false})"); await q.emulate_media(media='print')
        r = await q.evaluate("""(()=>{const pg=document.querySelector('#rp-print-host [data-page=customers]');if(!pg)return null;
          const rows=pg.querySelectorAll('table.rp-t--rt tbody tr').length,pooled=(FP.app.state.rp.report.pages.find(p=>p.id==='customers').tables[0].rows||[]).length;
          return {rows,pooled,trim:!!pg.querySelector('.rp-trim'),txt:pg.innerText.replace(/\\s+/g,' ')}})()""")
        chk('FD-1 Clientes: la tabla de recompra trae todas las ventanas del libro', bool(r) and r['pooled'] >= 1 and r['rows'] == r['pooled'], r and {k: r[k] for k in ('rows', 'pooled')})
        chk('FD-2 Clientes: ninguna fila se recorta «por espacio»', bool(r) and not r['trim'] and 'filas de mayor magnitud' not in r['txt'], r and r['txt'][-300:])
        cl = await q.evaluate("(()=>{const pg=document.querySelector('#rp-print-host [data-page=closing]');return pg?pg.innerText:null})()")
        chk('FD-3 Cierre: nunca dice «No disponible días»', cl is not None and 'No disponible días' not in cl, cl)
        ov = await q.evaluate("[...document.querySelectorAll('#rp-print-host .rp-page')].filter(p=>{const b=p.querySelector('.rp-body');return b&&b.scrollHeight>b.clientHeight+1}).map(p=>p.getAttribute('data-page'))")
        chk('FD-4 ninguna lámina desborda', ov == [], ov)
        fo = await q.evaluate("document.fonts.load('600 16px Inter').then(()=>[document.fonts.check('600 16px Inter'),[...document.fonts].filter(f=>f.family.replace(/\"/g,'')==='Inter'&&f.status==='loaded').length])")
        chk('FD-5 la fuente Inter va incluida y carga (no depende del equipo)', bool(fo) and fo[0] and fo[1] >= 1, fo)
        if SHOT:
            for pid in ('customers', 'recovery', 'closing'):
                el = await q.query_selector(f'#rp-print-host [data-page={pid}]')
                if el: await el.screenshot(path=os.path.join(SHOT, f'fd_{pid}.png'))
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} ok / {len(fails)} fallos'); sys.exit(1 if fails else 0)
