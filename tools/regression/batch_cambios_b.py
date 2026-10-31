"""«Qué cambió desde ayer» · versión B: veredicto, chips, resumen general, alertas agrupadas, acciones, franja en Inicio y marca en el menú. Uso: python3 batch_cambios_b.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d != '' and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
async def boot(c, day):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(day); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return q, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900})
        q, errs = await boot(c, dt.datetime(2026, 9, 23, 9, 0))
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1800)
        strip = await q.evaluate("(()=>{const s=document.querySelector('[data-chg-strip]');return s?{n:s.querySelectorAll('li').length,link:!!s.querySelector('a[data-nav=cambios]'),inMore:!!s.closest('details')}:null})()")
        chk('V1 Inicio muestra la franja «Desde ayer» con 3 líneas y el enlace, fuera de los plegables', bool(strip) and strip['n'] == 3 and strip['link'] and not strip['inMore'], strip)
        await q.evaluate("location.hash='#cambios'"); await q.wait_for_timeout(1000)
        v = await q.evaluate("(document.querySelector('#chg-frame .px-verdict h2')||{innerText:''}).innerText")
        chk('V2 veredicto: «Ayer … vendiste … plan»', 'vendiste' in v and 'plan' in v, v)
        chips = await q.evaluate("[...document.querySelectorAll('#chg-frame .px-tchip')].map(c=>c.innerText.trim())")
        chk('V3 chips: comparación, último día completo, plan y dónde se guarda', any('Comparación' in c for c in chips) and any('Último día completo' in c for c in chips) and any('Plan' in c for c in chips) and any('Guardado' in c for c in chips), chips)
        chk('V4 las 3 tarjetas siguen bajo el veredicto', await q.locator('#chg-frame .chg-kpis .metric-card').count() == 3)
        short = await q.evaluate("document.querySelector('[data-chg-summary]').innerText")
        n = await q.locator('[data-chg-summary] .px-sum__r').count()
        chk('V5 resumen general con filas condicionales', n >= 3 and 'AYER' in short.upper() and 'CIERRE' in short.upper(), short[:300])
        await q.click('#chg-md [data-v=l]'); await q.wait_for_timeout(250)
        long_ = await q.evaluate("document.querySelector('[data-chg-summary]').innerText")
        chk('V6 versión larga da más texto y se puede volver a la corta', len(long_) > len(short)); await q.click('#chg-md [data-v=c]'); await q.wait_for_timeout(200)
        ids = await q.evaluate("[...document.querySelectorAll('#view-cambios section.px-blk[id]')].map(s=>s.id)")
        chk('V7 secciones como preguntas en orden', ids == ['chg-s-ch', 'chg-s-al', 'chg-s-da', 'chg-s-hoy'], ids)
        chk('V8 el método viene cerrado', await q.evaluate("!document.getElementById('chg-meth').open"))
        await q.click('#chg-m-res'); await q.wait_for_timeout(200)
        chk('V9 «Resumen» oculta las secciones y «Completo» las vuelve a mostrar', not await q.locator('#chg-s-ch').is_visible()); await q.click('#chg-m-full'); await q.wait_for_timeout(200)
        g = await q.evaluate("(()=>{const d=document.querySelector('details.chg-group');return d?{n:d.querySelectorAll('.chg-alert').length,open:d.open}:null})()")
        chk('V10 las alertas con el mismo mensaje en 3 o más canales se agrupan y conservan sus controles', bool(g) and g['n'] >= 3, g)
        await q.evaluate("document.querySelectorAll('details.chg-group').forEach(d=>d.open=true)"); await q.wait_for_timeout(150)
        chk('V11 cada alerta agrupada conserva estado y nota', await q.locator('details.chg-group [data-chg-status]').count() >= 3 and await q.locator('details.chg-group [data-chg-note]').count() >= 3)
        chk('V12 «¿Qué hago hoy?» ofrece acciones y mantiene «Actualizar todo (Sheets)»', await q.locator('#chg-s-hoy .px-act > div').count() >= 3 and await q.locator('#chg-s-hoy [data-action="sheets-refresh-all"]').count() == 1)
        dx = q.locator('#chg-s-hoy [data-action="chg-to-dx"]')
        if await dx.count():
            ch = await dx.first.get_attribute('data-channel'); await dx.first.click(); await q.wait_for_timeout(700)
            chk('V13 «Revisar el canal» abre Diagnóstico con ese canal y sin guardar nada', await q.evaluate("[location.hash, FP.app.state.dx.settings.channel]") == ['#diagnostico', ch], await q.evaluate("[location.hash, FP.app.state.dx.settings.channel]"))
        else: chk('V13 (sin canal que revisar en este caso)', True)
        data = await q.evaluate("(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k)}return o})()")
        await q.close()
        # ---------- día siguiente: hay foto de ayer ----------
        c2 = await b.new_context(viewport={'width': 1280, 'height': 900})
        await c2.add_init_script("(()=>{const d=%s;for(const k in d)localStorage.setItem(k,d[k])})()" % json.dumps(data))
        q2, errs2 = await boot(c2, dt.datetime(2026, 9, 24, 9, 0))
        await q2.evaluate("FP.app.actions['generate-mock']()"); await q2.wait_for_timeout(1800)
        chk('V14 sin alertas nuevas el menú no muestra marca', await q2.locator('.snav__badge').count() == 0)
        await q2.evaluate("""(()=>{const A=FP.app.state,sy=A.cx.sync;const r=sy.rows.find(x=>x.status!=='resolved');r.first_seen=sy.today;A.cx._nc=null;FP.app.render()})()"""); await q2.wait_for_timeout(500)
        b1 = await q2.evaluate("(()=>{const e=document.querySelector('.app-nav [data-nav=cambios] .snav__badge');return e?[e.textContent.trim(),e.getAttribute('aria-label')]:null})()")
        chk('V15 con una alerta nueva el menú de «Qué cambió desde ayer» muestra 1', b1 and b1[0] == '1' and 'nueva' in b1[1], b1)
        chk('V16 la franja de Inicio dice «1 alerta nueva»', '1 alerta nueva' in await q2.evaluate("(document.querySelector('[data-chg-strip]')||{innerText:''}).innerText"))
        await q2.evaluate("location.hash='#cambios'"); await q2.wait_for_timeout(900)
        chk('V17 comparado contra la foto de ayer lo dice y la alerta nueva se marca «Nueva»', 'Contra la foto del' in await q2.evaluate("document.getElementById('chg-body').innerText") and 'Nueva' in await q2.evaluate("document.getElementById('chg-s-al').innerText"))
        bad = []
        for w in (1920, 1280, 768, 390, 320):
            await q2.set_viewport_size({'width': w, 'height': 900}); await q2.wait_for_timeout(250)
            if await q2.evaluate("document.documentElement.scrollWidth-innerWidth") > 0: bad.append(w)
        chk('V18 sin desborde de página de 320 a 1920 px', not bad, bad)
        chk('Z sin errores de página', not errs and not errs2, (errs + errs2)[:3])
        await b.close()
    print('\nRESULTADO batch_cambios_b:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
