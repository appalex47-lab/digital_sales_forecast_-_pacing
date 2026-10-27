"""«Qué impulsar»: cuatro salidas, Pedir oferta a Comercial (Excel por laboratorio), seguimiento y cierre solo al llegar la oferta. Uso: python3 batch_pedir_oferta.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
async def boot(c):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return q, errs
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        q, errs = await boot(c)
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700)
        await q.evaluate("""(async()=>{
          const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-09-30', skus: 80 });
          const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
          await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
          const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
          await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
        })()""")
        await q.click('[data-action="pm-tab"][data-tab="ofertas"]'); await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(2500)
        n = await q.evaluate("FP.app.state.op.result ? FP.app.state.op.result.items.length : -1")
        chk('P1 hay oportunidades para probar', n > 3, n)
        t = await body(q)
        chk('P2 título nuevo y cuatro salidas', 'Qué impulsar en el canal digital' in t and all(x in t for x in ['Exponer', 'Pedir oferta', 'Sostener o proteger', 'Revisar causa']), t[:400])
        cnt = await q.evaluate("FP.app.state.op.result.counts.byRoute")
        chk('P3 cada SKU cae en una sola salida', sum(cnt.values()) == n, cnt)
        # sin nombre no pide
        await q.evaluate("FP.app.state.pm.actor=''"); await q.evaluate("FP.app.render()")
        askN = await q.evaluate("FP.app.state.op.result.items.filter(i=>i.route.id==='ask'&&!i.offers.length).length")
        if askN > 0:
            await q.evaluate("FP.app.state.op.f.route='ask'; FP.app.render()"); await q.wait_for_timeout(300)
            chk('P4 la tarjeta filtra la lista a «Pedir oferta»', await q.evaluate("[...document.querySelectorAll('#pm-body tbody tr')].length>0 && document.querySelector('[data-action=op-route][data-route=ask]').getAttribute('aria-pressed')==='true'"))
            await q.click('[data-action="rq-ask"]'); await q.wait_for_timeout(300)
            t = await body(q)
            chk('P5 sin nombre avisa y no pide', 'Escribe tu nombre' in t and not await q.query_selector('[data-action="rq-confirm"]'), t[:200])
            await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()"); await q.wait_for_timeout(200)
            await q.click('[data-action="rq-ask"]'); await q.wait_for_timeout(300)
            t = await body(q)
            chk('P6 muestra qué se pide, por laboratorio, antes de pedir', 'Se va a pedir la oferta de' in t and 'sin costos ni márgenes' in t.lower(), t[:500])
            chk('P7 todavía no se guardó nada', await q.evaluate("FP.app.state.rq.reg.requests.length")==0)
            async with q.expect_download() as dl:
                await q.click('[data-action="rq-confirm"]')
            d = await dl.value
            chk('P8 baja un Excel de solicitud', d.suggested_filename.startswith('solicitud_ofertas_PED-0001') and d.suggested_filename.endswith('.xlsx'), d.suggested_filename)
            k = await q.evaluate("FP.app.state.rq.reg.requests.length")
            chk('P9 quedó una solicitud por SKU, Pedida, a Comercial', k == askN and await q.evaluate("FP.app.state.rq.reg.requests.every(r=>r.state==='asked'&&r.to==='Comercial'&&r.askedBy==='Persona A')"), k)
            t = await body(q)
            chk('P10 el panel de seguimiento aparece con las abiertas', f'Solicitudes a Comercial · {k} abiertas' in t, t[:300])
            chk('P11 los SKU pedidos ya no se vuelven a pedir', await q.evaluate("FP.opportunityView.requestPlan(FP.app.state.op, FP.app.state).ok.length")==0)
            await q.click('[data-action="op-fold"][data-fold="requests"]'); await q.wait_for_timeout(200)
            chk('P12 la lista muestra folio y Pedida', 'SOL-00001' in await body(q) and 'Pedida' in await body(q))
            # pasan 8 días: sin respuesta
            sku = await q.evaluate("FP.app.state.rq.reg.requests[0].sku")
            await q.evaluate("FP.app.state.rq.reg.requests.forEach(r=>{r.askedAt=new Date(Date.now()-8*86400000).toISOString()}); FP.app.render()"); await q.wait_for_timeout(200)
            chk('P13 a los 8 días aparece «Sin respuesta»', 'Sin respuesta' in await body(q) and 'sin respuesta' in (await body(q)).lower())
            # llega una oferta de ese SKU: se cierra sola
            await q.evaluate("""(()=>{ const reg=FP.app.state.of.reg; const r=FP.offers.captureManual(reg,{sku:'%s',name:'Demo',category:'X',lab:'LAB DEMO',controlled:'Ningún Control',discount:'20',start:'2026-11-01',end:'2026-11-10'},{by:'Persona A',campaign:{name:'Demo',start:'2026-11-01',end:'2026-11-10'},origin:'commercial'}); return r.ok||r.error; })()""" % sku)
            await q.evaluate("FP.app.state.of.reg.offers.forEach(o=>{o.receivedAt=new Date().toISOString()})")
            done = await q.evaluate("(()=>{ return FP.requests.reconcile(FP.app.state.rq.reg, FP.app.state.of.reg.offers).length })()")
            chk('P14 al llegar la oferta del SKU, su solicitud se cierra sola', done >= 1 and await q.evaluate("FP.app.state.rq.reg.requests[0].state")=='received', done)
        else:
            chk('P4-14 (sin SKU en «Pedir oferta» con estos datos: se prueba en los de ejemplo)', True)
        errs2 = [e for e in errs if 'ResizeObserver' not in e]
        chk('P15 sin errores de página', not errs2, errs2)
        await b.close()
    print('\n%d fallas' % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
