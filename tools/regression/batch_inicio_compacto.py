"""Inicio compacto en móvil + periodo que sigue a la fecha («fijado» / «seguir la fecha»).
Uso: python3 batch_inicio_compacto.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
S = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=S.serve_forever, daemon=True).start()
U = f'http://127.0.0.1:{S.server_address[1]}/index.html'
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
async def setup(b, vp, mob):
    c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); q = await c.new_page(); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:150]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(700)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove());FP.app.actions['generate-mock']()"); await q.wait_for_timeout(900)
    await q.goto(U + '#inicio'); await q.wait_for_timeout(900); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return c, q, errs
GEO = """(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right),txt:e.textContent.trim()}};
 return {title:r('.ux-head__title'),chip:r('.ux-head__ctxchip'),state:r('.ux-head__state'),more:r('.ux-head__morebtn'),banner:r('.att__banner--compact'),key:r('#home-b .px-verdict'),keyA:r('#home-b .px-kpis'),h:innerHeight,sw:document.documentElement.scrollWidth-innerWidth}})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); allerr = []
        for w, h in ((375, 740), (320, 640)):
            c, q, errs = await setup(b, {'width': w, 'height': h}, True); g = await q.evaluate(GEO)
            chk(f'I-1 [{w}] el chip de contexto va en la misma línea que el título', g['chip'] and abs(g['chip']['t'] - g['title']['t']) <= 12 and g['chip']['b'] <= g['title']['t'] + 40, g)
            chk(f'I-2 [{w}] el chip de contexto está abreviado y su título completo conserva el texto', g['chip'] and 'Sep 2026' in g['chip']['txt'] and 'vs Plan' in g['chip']['txt'] and 'Actual vs Plan' in (await q.get_attribute('.ux-head__ctxchip', 'title')), g['chip'])
            chk(f'I-3 [{w}] el chip de venta acumulada va debajo del título y «Qué hay aquí y qué hago» debajo del chip', g['state']['t'] >= g['title']['t'] + 20 and g['more']['t'] >= g['state']['b'], g)
            chk(f'I-4 [{w}] «Qué hay aquí y qué hago» sigue funcionando', await q.evaluate("(()=>{const b=document.querySelector('.ux-head__morebtn');b.click();return getComputedStyle(document.getElementById('ux-more')).display!=='none'})()"))
            await q.evaluate("document.querySelector('.ux-head__morebtn').click()")
            chk(f'I-5 [{w}] ya no hay franja de aviso de calidad sobre las cifras (Fase 3.1)', not g['banner'], g['banner'])
            if w == 375:
                chk('I-7 [375] el veredicto empieza dentro de la primera pantalla y las cifras asoman', g['key']['t'] <= 420 and g['keyA']['t'] < g['h'] - 100, (g['key'], g['keyA']))
            chk(f'I-8 [{w}] sin scroll horizontal de página', g['sw'] <= 0, g['sw'])
            allerr += errs; await c.close()
        c, q, errs = await setup(b, {'width': 1280, 'height': 800}, False); g = await q.evaluate(GEO)
        chk('I-9 [1280] escritorio: título, contexto y chip caben sin desborde', g['sw'] <= 0 and g['chip'] and g['chip']['r'] <= 1280, g)
        await c.close()
        # ---- periodo que sigue a la fecha (escritorio basta; la lógica no depende del ancho) ----
        c, q, errs = await setup(b, {'width': 1280, 'height': 800}, False)
        st = "(()=>{const h=FP.app.state.ux.home;return {t:h.periodType,k:h.periodKey,f:h.follow,sel:document.getElementById('home-per').value,pin:!!document.querySelector('.home__pin'),follow:!!document.querySelector('.home__follow')}})()"
        s0 = await q.evaluate(st); chk('F-1 por defecto Inicio muestra el mes de la fecha (o el último mes con real si la fecha cae en un mes aún sin venta) y no muestra etiqueta de «fijado»', s0['t'] == 'month' and s0['k'] == '2026-09' and s0['f'] is True and s0['sel'] == '2026-09' and not s0['follow'] and not s0['pin'], s0)
        await q.evaluate("FP.app.actions['set-ref-date']({value:'2026-08-15'})"); await q.wait_for_timeout(700)
        s1 = await q.evaluate(st); chk('F-2 al mover la fecha a agosto Inicio pasa a agosto', s1['k'] == '2026-08' and s1['sel'] == '2026-08' and s1['f'] is True, s1)
        await q.select_option('#home-per', '2026-07'); await q.wait_for_timeout(500)
        s2 = await q.evaluate(st); chk('F-3 elegir un mes a mano lo fija y aparece «fijado · seguir la fecha»', s2['k'] == '2026-07' and s2['f'] is False and s2['pin'], s2)
        await q.evaluate("FP.app.actions['set-ref-date']({value:'2026-09-20'})"); await q.wait_for_timeout(700)
        s3 = await q.evaluate(st); chk('F-4 con el periodo fijado, mover la fecha NO lo cambia', s3['k'] == '2026-07' and s3['f'] is False, s3)
        await q.click('.home__pin'); await q.wait_for_timeout(500)
        s4 = await q.evaluate(st); chk('F-5 «seguir la fecha» vuelve al mes de la fecha', s4['k'] == '2026-09' and s4['f'] is True and not s4['pin'], s4)
        await q.select_option('#home-per', 'year'); await q.wait_for_timeout(500)
        s5 = await q.evaluate(st); chk('F-6 elegir «Año» también lo fija', s5['t'] == 'year' and s5['f'] is False, s5)
        # navegar a otra vista y volver no cambia lo fijado ni fija sin querer
        await q.click('.home__pin'); await q.wait_for_timeout(300); await q.goto(U + '#pacing'); await q.wait_for_timeout(700); await q.goto(U + '#inicio'); await q.wait_for_timeout(800)
        s6 = await q.evaluate(st); chk('F-7 ir a Pacing y volver conserva el seguimiento de la fecha', s6['f'] is True and s6['k'] == '2026-09', s6)
        allerr += errs; await c.close()
        chk('E-1 sin errores JavaScript', not allerr, allerr[:3])
        await b.close()
    print('\nFALLAS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
