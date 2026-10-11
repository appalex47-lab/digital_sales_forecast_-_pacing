"""Fase 13 — Metas y motor: reparto por canal con monto o %. Uso: python3 batch_share13.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
HINT = "(id)=>(document.querySelector(`[data-share-hint=\"${id}\"]`)||{textContent:''}).textContent"
SPLIT = "(document.getElementById('t-split')||{textContent:''}).textContent"
async def typ(q, sel, v):
    await q.fill(sel, ''); await q.type(sel, v, delay=5); await q.wait_for_timeout(120)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        t0 = await q.evaluate(SPLIT)
        chk('S1 sin meta total, el formulario pide primero la meta y explica monto o %', 'meta anual total' in t0 and '%' in t0, t0)
        await typ(q, '#t-ecommerce', '58%')
        h = await q.evaluate(f"({HINT})('ecommerce')")
        chk('S2 un % sin meta total avisa que hay que capturar primero la meta anual', 'captura primero la meta anual total' in h, h)
        await typ(q, '#t-annual', '100M')
        h = await q.evaluate(f"({HINT})('ecommerce')")
        chk('S3 con meta total de 100M, «58%» muestra $58M y 58 % del total', '58' in h and 'del total' in h and ('58 M' in h or '58M' in h or '58,0' in h or '58 M' in h or '$58' in h), h)
        sp = await q.evaluate(SPLIT)
        chk('S3 la línea de reparto dice cuánto se asignó y cuánto falta', 'Asignado' in sp and 'Falta' in sp, sp)
        await typ(q, '#t-app', '30M')
        h = await q.evaluate(f"({HINT})('app')")
        chk('S4 un monto («30M») muestra su % del total (30 %)', '30' in h and 'del total' in h, h)
        await typ(q, '#t-whatsapp', '8%')
        sp = await q.evaluate(SPLIT)
        chk('S5 con un canal pendiente la línea dice para quién es lo que falta', 'Falta' in sp and ('Llamadas' in sp), sp)
        await typ(q, '#t-llamadas', '4%')
        sp = await q.evaluate(SPLIT)
        chk('S6 cuando suma el 100 % dice que el reparto cuadra', 'cuadra' in sp, sp)
        await typ(q, '#t-llamadas', '9%')
        sp = await q.evaluate(SPLIT)
        chk('S7 si se pasa del total avisa cuánto se excede', 'excede' in sp.lower() or 'Se excede' in sp, sp)
        await typ(q, '#t-llamadas', '150%')
        h = await q.evaluate(f"({HINT})('llamadas')")
        chk('S8 un porcentaje mayor a 100 se rechaza con mensaje', 'entre 0 y 100' in h, h)
        await typ(q, '#t-llamadas', '4%')
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(600)
        t = await q.evaluate("(()=>{const t=FP.app.state.targets;return [t.annual.revenue,t.byChannel.ecommerce.revenue,t.byChannel.app.revenue,t.byChannel.whatsapp.revenue,t.byChannel.llamadas.revenue]})()")
        chk('S9 al guardar, los % se convierten a montos sobre la meta total', t == [100000000, 58000000, 30000000, 8000000, 4000000], t)
        hv = await q.evaluate("FP.app.state.targets.byChannel.ecommerce.revenue===58000000 && document.querySelector('#view-resumen .note--ok')?.textContent.includes('cuadra')")
        chk('S9 la validación de jerarquía confirma que la suma cuadra con la meta', hv)
        await q.reload(); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        h = await q.evaluate(f"({HINT})('ecommerce')")
        sp = await q.evaluate(SPLIT)
        chk('S10 al volver a abrir, los montos guardados se muestran con su % y el reparto cuadra', '58' in h and 'cuadra' in sp, (h, sp))
        # % sin meta total no guarda
        await q.evaluate("FP.app.actions['sample-targets']()"); await q.wait_for_timeout(500)
        await typ(q, '#t-annual', '')
        await typ(q, '#t-app', '20%')
        before = await q.evaluate("FP.app.state.targets.annual.revenue")
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(500)
        after = await q.evaluate("FP.app.state.targets.annual.revenue")
        toast = await q.evaluate("(document.querySelector('.toast, #toast, [role=\"status\"].toast')||{textContent:''}).textContent")
        chk('S11 un % sin meta total no guarda las metas y lo explica', before == after and ('captura primero la meta anual' in toast), (before, after, toast))
        chk('Sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('\nRESULTADO batch_share13:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
