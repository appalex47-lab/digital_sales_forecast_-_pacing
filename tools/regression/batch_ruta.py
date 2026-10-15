"""Etapa 2 del rediseño de Inicio: ruta activa con pasos y avance, otras rutas, barra de origen y regreso. Uso: python3 batch_ruta.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
NOTOUR = "(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()"
async def seed_gap(q):
    """Datos de prueba con la venta real 12 % abajo del plan y CR 10 % abajo: hay brecha y un driver (conversión)."""
    await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
    await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
    try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
    except Exception: pass
    await q.goto(U + '#plan'); await q.wait_for_timeout(600)
    for a in ['plan-preview', 'plan-save']:
        try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
        except Exception: pass
    await scale(q)
async def scale(q):
    await q.evaluate("""(()=>{FP.app.state.store.actual.records.forEach(r=>{const m=r.metrics;if(m.revenue)m.revenue.value*=0.88;if(m.orders)m.orders.value*=0.9;if(m.conversionRate)m.conversionRate.value*=0.9});FP.app.state.fc.run=null;FP.app.state.rf.run=null})()""")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
        await seed_gap(q)
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1500); await q.evaluate(NOTOUR)
        R = await q.evaluate("""()=>{const n=document.getElementById('nbs'),pb=n.querySelector('[role=progressbar]');return {step:n.dataset.step,done:n.dataset.done,total:n.dataset.total,
          steps:[...n.querySelectorAll('.nbs__st')].map(e=>e.dataset.step+':'+e.dataset.state),cur:[...n.querySelectorAll('.nbs__st.is-cur')].map(e=>e.dataset.step),
          pb:pb&&[pb.getAttribute('aria-valuenow'),pb.getAttribute('aria-valuemax'),pb.getAttribute('aria-valuetext')],routes:[...n.querySelectorAll('.nbs__route')].map(e=>e.dataset.route),
          badge:n.querySelector('.ds-badge').innerText}}""")
        chk('R1 con brecha, la ruta activa muestra 5 pasos con su estado real: datos listos = hecho, brecha disponible, el resto bloqueado', R['step'] == 'review_gap' and R['steps'] == ['complete_data:done', 'review_gap:available', 'simulate:blocked', 'plan_action:blocked', 'follow_up:blocked'], R)
        chk('R2 el avance es una barra accesible con «1 de 5» y el paso actual está marcado (aria-current)', R['pb'] == ['1', '5', '1 de 5 pasos completados'] and R['cur'] == ['review_gap'] and 'paso 2 de 5' in R['badge'], R)
        chk('R3 «Otras rutas» no repite pasos de la ruta activa y hay como máximo 2', len(R['routes']) <= 2 and not set(R['routes']) & {'complete_data', 'review_gap', 'simulate', 'plan_action', 'follow_up'}, R['routes'])
        card = await q.evaluate("[...document.querySelectorAll('#nbs .nbs__route')].map(e=>({r:e.dataset.route,t:e.innerText.slice(0,260),btn:!!e.querySelector('button')}))")
        chk('R4 cada otra ruta dice qué decisión habilita y qué necesita; una ruta bloqueada no ofrece botón y dice qué la habilita', all('Decisión que habilita' in x['t'] and 'Necesita' in x['t'] for x in card) and all(x['btn'] or 'Se habilita al completar' in x['t'] for x in card), card)
        # abrir la ruta principal
        await q.click('#nbs button.btn--primary'); await q.wait_for_timeout(1800)
        O = await q.evaluate("""()=>{const o=document.querySelector('.route-origin');const st=JSON.parse(localStorage.getItem('fp.route.v1')||'{}');return {hash:location.hash,has:!!o,txt:o?o.innerText:'',step:o&&o.dataset.step,done:o&&o.dataset.done,
          segs:o?o.querySelectorAll('.route-origin__segs i').length:0,next:o?(o.querySelector('.route-origin__done .btn--primary')||{innerText:''}).innerText:'',saved:Object.values(st).some(v=>v.review_gap)}}""")
        chk('R5 el botón abre el diagnóstico y arriba aparece «Vienes de Inicio · Hallazgo», con canal, periodo y fecha', O['hash'] == '#diagnostico' and O['has'] and 'Vienes de Inicio' in O['txt'] and 'Total digital' in O['txt'] and 'Año 2026' in O['txt'] and 'Datos al 23 sep 2026' in O['txt'], O)
        chk('R6 la barra muestra el avance (5 tramos, paso 2 de 5) y el progreso quedó guardado', O['segs'] == 5 and 'paso 2 de 5' in O['txt'] and O['saved'], O)
        chk('R7 el paso se marca completado por los datos (el diagnóstico ya se calculó) y ofrece ir al paso 3', O['done'] == '1' and 'Paso completado' in O['txt'] and 'Ir al paso 3' in O['next'], O)
        # no aparece en otras vistas
        await q.goto(U + '#pacing'); await q.wait_for_timeout(800)
        none = await q.evaluate("!document.querySelector('.route-origin')")
        chk('R8 la barra solo aparece en la vista del paso (no ensucia Pacing)', none is True, none)
        await q.goto(U + '#diagnostico'); await q.wait_for_timeout(800)
        back = await q.evaluate("!!document.querySelector('.route-origin')")
        chk('R9 al volver a la vista del paso la barra sigue ahí (el origen no se pierde al navegar)', back is True, back)
        # persiste al recargar
        await q.reload(); await q.wait_for_timeout(1800)
        await scale(q); await q.evaluate('FP.app.render()'); await q.wait_for_timeout(600)
        rl = await q.evaluate("[location.hash, !!document.querySelector('.route-origin')]")
        chk('R10 la barra de origen sobrevive a recargar la página (misma pestaña)', rl == ['#diagnostico', True], rl)
        # cambio de fecha: avisa que el hallazgo puede estar desactualizado
        await q.click('#topbar-ref'); await q.fill('#topbar-date', '2026-08-15'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(1500)
        w = await q.evaluate("(document.querySelector('.route-origin__warn')||{innerText:''}).innerText")
        chk('R11 si cambia la fecha, el año o el canal, la barra avisa que hay que reevaluar desde Inicio', 'Cambiaron la fecha' in w, w)
        await q.keyboard.press('Escape'); await q.click('#topbar-ref'); await q.click('.hdate__b[data-action="fc-ref-today"]'); await q.wait_for_timeout(1200)
        # volver al hallazgo
        await q.click('[data-action="route-back"]'); await q.wait_for_timeout(1800)
        B = await q.evaluate("""()=>{const n=document.getElementById('nbs');return {hash:location.hash,origin:!!document.querySelector('.route-origin'),step:n.dataset.step,done:Number(n.dataset.done),
          steps:[...n.querySelectorAll('.nbs__st')].map(e=>e.dataset.step+':'+e.dataset.state),y:Math.round(n.getBoundingClientRect().top)}}""")
        chk('R12 «Volver al hallazgo» regresa a Inicio, quita la barra y deja a la vista «Tu siguiente mejor paso»', B['hash'] == '#inicio' and not B['origin'] and -50 < B['y'] < 500, B)
        chk('R13 al volver, la ruta avanzó por los datos: la brecha quedó hecha y el paso principal ya no es la brecha', B['done'] >= 2 and 'review_gap:done' in B['steps'] and B['step'] != 'review_gap', B)
        # otra ruta: canal rezagado
        await q.select_option('#home-ch', 'total'); await q.wait_for_timeout(600)
        ch = await q.query_selector('#nbs .nbs__route[data-route="review_channel"] button')
        if ch:
            await ch.click(); await q.wait_for_timeout(1500)
            C = await q.evaluate("""()=>{const o=document.querySelector('.route-origin');return {hash:location.hash,route:o&&o.dataset.step,txt:o?o.innerText:'',ch:FP.app.state.ux.ctx.channel}}""")
            chk('R14 abrir «Otra ruta» (canal rezagado) lleva a Pacing con ese canal y su propia ruta de 2 pasos', C['hash'] == '#pacing' and C['route'] == 'review_channel' and 'paso 2 de 2' in C['txt'] and C['ch'] == 'ecommerce', C)
            await q.click('.route-origin__x'); await q.wait_for_timeout(400)
            x = await q.evaluate("[!!document.querySelector('.route-origin'), sessionStorage.getItem('fp.route.origin.v1')]")
            chk('R15 la × cierra la ruta de trabajo y borra el origen guardado', x == [False, None], x)
        else:
            chk('R14 hay una ruta de canal para abrir', False, 'sin botón de canal')
        # accesibilidad y teclado
        a11 = await q.evaluate("""()=>{const bad=[];document.querySelectorAll('#route-origin button,#nbs button').forEach(x=>{if(!(x.innerText||'').trim()&&!x.getAttribute('aria-label'))bad.push('sin nombre')});return bad}""")
        chk('R16 los botones de la ruta y de la barra tienen nombre accesible', not a11, a11)
        # móvil
        for wd in (390, 320):
            m = await b.new_page(viewport={'width': wd, 'height': 800}); await m.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); m.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await seed_gap(m); await m.goto(U + '#inicio'); await m.wait_for_timeout(1500); await m.evaluate(NOTOUR)
            r = await m.evaluate("""()=>{const st=document.querySelector('#nbs .nbs__steps');const r=e=>e.getBoundingClientRect();return {sw:document.documentElement.scrollWidth-innerWidth,vertical:getComputedStyle(st).flexDirection,inside:r(st).right<=innerWidth&&r(st).left>=0}}""")
            await m.click('#nbs button.btn--primary'); await m.wait_for_timeout(1800)
            r2 = await m.evaluate("""()=>{const o=document.querySelector('.route-origin');const r=o.getBoundingClientRect();return {sw:document.documentElement.scrollWidth-innerWidth,inside:r.right<=innerWidth&&r.left>=0}}""")
            chk(f'R17 {wd}px: la ruta se apila en vertical y ni ella ni la barra de origen desbordan', r['sw'] <= 0 and r['vertical'] == 'column' and r['inside'] and r2['sw'] <= 0 and r2['inside'], (r, r2))
            await m.close()
        chk('R18 sin errores de página', not errs, errs[:2])
        await b.close()
    print('RESULTADO batch_ruta: ' + ('OK' if not fails else 'FALLAS: ' + '; '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())
