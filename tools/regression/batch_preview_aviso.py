"""Presentación (PDF): aviso al pulsar «Generar vista previa» cuando el corte va más adelante que la venta real. Corre: python3 batch_preview_aviso.py <raíz>"""
import sys, asyncio
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#pacing'); await q.wait_for_timeout(1200)
        last = await q.evaluate("FP.app.state.fc.lastActualDate")
        chk('PA-0 hay un último día con real', bool(last), last)
        # corte 3 días después del último real
        later = await q.evaluate("(l)=>{const d=new Date(l+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+3);return d.toISOString().slice(0,10)}", last)
        await q.evaluate("(d)=>{FP.app.state.fc.settings.referenceDate=d;FP.app.state.fc.run=null;FP.app.state.rf.run=null}", later)
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.click('[data-action="rp-generate"]'); await q.wait_for_timeout(800)
        st = await q.evaluate("({s:FP.app.state.rp.status,gap:FP.app.state.rp.gap,has:!!document.querySelector('.rp-gap'),txt:(document.querySelector('.rp-gap')||{}).innerText||''})")
        chk('PA-1 con corte posterior al real NO genera y muestra el aviso', st['s'] == 'idle' and st['has'] and st['gap'] and st['gap']['days'] == 3, st)
        chk('PA-2 el aviso dice corte, último día con real y días sin dato', 'Faltan datos para el corte' in st['txt'] and '3 días sin dato' in st['txt'], st['txt'])
        btns = await q.evaluate("[...document.querySelectorAll('.rp-gap [data-action]')].map(b=>b.dataset.action)")
        chk('PA-3 ofrece cargar datos, usar el último día, generar de todos modos y cancelar', btns == ['rp-gap-load', 'rp-gap-last', 'rp-gap-go', 'rp-gap-cancel'], btns)
        await q.click('[data-action="rp-gap-cancel"]'); await q.wait_for_timeout(300)
        chk('PA-4 cancelar cierra el aviso y no genera', await q.evaluate("!document.querySelector('.rp-gap') && FP.app.state.rp.status==='idle'"))
        await q.click('[data-action="rp-generate"]'); await q.click('[data-action="rp-gap-go"]')
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        r = await q.evaluate("({s:FP.app.state.rp.status,la:FP.app.state.rp.report.context.lastActual,cover:document.querySelector('#view-presentacion .rp-cover__meta').innerText})")
        chk('PA-5 «Generar de todos modos» genera y la portada declara hasta cuándo hay venta real', r['s'] == 'ready' and r['la'] == last and 'venta real hasta' in r['cover'].lower(), r)
        # usar el último día
        await q.evaluate("FP.app.state.rp.status='idle';FP.app.state.rp.report=null;FP.app.state.rp.gap=null;FP.app.state.fc.settings.referenceDate=arguments[0]" .replace('arguments[0]', repr(later)))
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.click('[data-action="rp-generate"]'); await q.click('[data-action="rp-gap-last"]'); await q.wait_for_timeout(500)
        chk('PA-6 «Usar el último día» fija el corte en el último real', await q.evaluate("FP.app.state.fc.settings.referenceDate===FP.app.state.fc.lastActualDate"))
        await q.click('[data-action="rp-generate"]'); await q.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        chk('PA-7 con corte = último real no hay aviso y la portada no agrega la fila', await q.evaluate("!document.querySelector('.rp-gap') && !document.querySelector('#view-presentacion .rp-cover__meta').innerText.toLowerCase().includes('venta real hasta')"))
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} ok / {len(fails)} fallos'); sys.exit(1 if fails else 0)
