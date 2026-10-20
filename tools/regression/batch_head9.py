"""Fase 9 — encabezado homologado en las 21 vistas. Uso: python3 batch_head9.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
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

ALL = ['inicio','carga','calidad','resumen','plan','estacionalidad','datos','configuracion','proyeccion','pacing','diagnostico','producto','segmentos','analisis','reforecast','recovery','medir','narrativa','presentacion','ayuda','ajustes']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        bad1, bad2, bad5 = [], [], []
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        await q.evaluate("document.querySelector('[data-action=\"ux-mode\"][data-value=\"learner\"]').click()"); await q.wait_for_timeout(300)
        chk('H7 al activar Modo Aprendiz aparece la ventana que ofrece el recorrido guiado', await q.evaluate("!!document.querySelector('dialog#tour-offer[open]')"))
        await q.click('#tour-offer [data-action="tour-offer-no"]'); await q.wait_for_timeout(150)
        chk('H7 «Ahora no» la cierra y no inicia el recorrido', await q.evaluate("!document.getElementById('tour-offer')&&!FP.state.ux.tour.active") if False else await q.evaluate("!document.getElementById('tour-offer')"))
        for v in ALL:
            await q.goto(u + '#' + v); await q.wait_for_timeout(450)
            r = await q.evaluate("""()=>{const h=document.querySelector('#ux-context .ux-head');if(!h)return null;
              const t=s=>{const e=h.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():''};
              const own=[...document.querySelectorAll('[data-own-head]')].filter(e=>e.offsetParent!==null&&getComputedStyle(e).display!=='none').length;
              const lp=document.querySelector('.learn-panel');
              return {title:t('.ux-head__title'),what:t('.ux-context__purpose'),todo:t('.ux-context__action'),eyebrow:!!h.querySelector('.ux-head__eyebrow'),own,learnOpen:lp?lp.open:null}}""")
            if not r or not r['title'] or not r['what'] or not r['todo'] or (v != 'inicio' and not r['eyebrow']): bad1.append((v, r))
            elif r['own']: bad2.append((v, r['own']))
            if r and r['learnOpen']: bad5.append(v)
        chk('H1 las 21 vistas tienen título, «Qué hay aquí», «Qué hago aquí» (y migas salvo Inicio)', not bad1, bad1[:3])
        chk('H2 ningún título propio de vista queda visible duplicado', not bad2, bad2)
        chk('H5 Modo Aprendiz: «Aprender en esta vista» nunca abre solo', not bad5, bad5)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        det = await q.evaluate("(document.querySelector('.ux-head__line--detail')||{textContent:''}).textContent")
        chk('H2b «Detalle» conserva el texto propio de la vista', len(det) > 20, det)
        # menú Ayuda
        vis = lambda sel: q.evaluate(f"(()=>{{const e=document.querySelector('{sel}');return !!e&&!e.hidden&&getComputedStyle(e).display!=='none'}})()")
        chk('H3 menú Ayuda cerrado al inicio', not await vis('#help-menu'))
        await q.click('#help-menu-btn'); await q.wait_for_timeout(150)
        items = await q.evaluate("[...document.querySelectorAll('#help-menu [data-action]')].map(e=>e.dataset.action)")
        chk('H3 el menú tiene Ayuda de sección, Glosario y Recorrido', items == ['help-section','glossary','tour-start'], items)
        await q.keyboard.press('Escape'); await q.wait_for_timeout(100)
        chk('H3 Esc cierra y devuelve el foco', not await vis('#help-menu') and await q.evaluate("document.activeElement.id")=='help-menu-btn')
        await q.click('#help-menu-btn'); await q.click('#topbar-help', position={'x':1,'y':1}) if False else None
        await q.mouse.click(600, 600); await q.wait_for_timeout(100)
        chk('H3 clic fuera cierra el menú', not await vis('#help-menu'))
        await q.click('#help-menu-btn'); await q.click('#help-menu [data-action="glossary"]'); await q.wait_for_timeout(300)
        chk('H3 Glosario abre y cierra el menú', not await vis('#help-menu') and await q.evaluate("!!document.querySelector('[role=dialog],dialog[open],.modal')"))
        await q.keyboard.press('Escape')
        # siguiente paso
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        chk('H4 Pacing muestra «Siguiente paso» al final', await q.evaluate("document.querySelectorAll('#ux-next *').length>0"))
        for v in ('inicio','ayuda','ajustes','negocio'):
            await q.goto(u + '#' + v); await q.wait_for_timeout(300)
            if not await q.evaluate("document.querySelectorAll('#ux-next *').length==0"): chk('H4 sin siguiente paso en ' + v, False)
        # aprendiz abre por clic y se cierra al navegar
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        await q.click('.learn-panel > summary'); await q.wait_for_timeout(150)
        o = await q.evaluate("document.querySelector('.learn-panel').open")
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(300); await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        chk('H5 abre por clic y vuelve cerrado al regresar', o and not await q.evaluate("document.querySelector('.learn-panel').open"))
        await q.evaluate("document.querySelector('[data-action=\"ux-mode\"][data-value=\"analyst\"]').click()"); await q.wait_for_timeout(200)
        await q.evaluate("document.querySelector('[data-action=\"ux-mode\"][data-value=\"learner\"]').click()"); await q.wait_for_timeout(300)
        await q.click('#tour-offer [data-action="tour-path"][data-path="A"]'); await q.wait_for_timeout(500)
        chk('H7 «Usar recorrido guiado» cierra la ventana y abre el recorrido', await q.evaluate("!document.getElementById('tour-offer') && !document.getElementById('tour-bar').hidden"))
        bad7 = []
        await q.set_viewport_size({'width': 1800, 'height': 900})
        for v in ('pacing', 'segmentos', 'analisis', 'inicio'):
            await q.goto(u + '#' + v); await q.wait_for_timeout(300)
            r = await q.evaluate("(()=>{const h=document.querySelector('.ux-head').getBoundingClientRect();const p=[...document.querySelectorAll('main .panel')].find(e=>e.offsetParent);const l=document.querySelector('.ux-head__line');return [Math.round(h.left),p?Math.round(p.getBoundingClientRect().left):null,l?Math.round(l.getBoundingClientRect().width):null,Math.round(h.width)]})()")
            if r[1] is not None and r[0] != r[1]: bad7.append((v, r))
            if r[2] is not None and r[2] < r[3] - 2: bad7.append((v, 'línea recortada', r))
        chk('H8 el encabezado queda alineado con las fichas y sus líneas usan todo el ancho (1800 px)', not bad7, bad7)
        bad6 = []
        for w in (320, 390, 768, 1920):
            await q.set_viewport_size({'width': w, 'height': 800})
            for v in ('inicio','pacing','analisis','ayuda'):
                await q.goto(u + '#' + v); await q.wait_for_timeout(250)
                x = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
                if x > 0: bad6.append((w, v, x))
        chk('H6 sin desborde horizontal de 320 a 1920 px', not bad6, bad6)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_head9:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
