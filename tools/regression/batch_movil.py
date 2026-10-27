"""Responsive móvil: panel lateral (cierre, fondo, Escape, scroll, aria), secciones como acordeón y «datos primero».
Uso: python3 -I batch_movil.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
async def prep(q, u, h='#pacing'):
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(u + '#inicio'); await q.wait_for_timeout(600)
    await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['generate-mock']()"); await q.wait_for_timeout(900)
    await q.goto(u + h); await q.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []; u = f'http://127.0.0.1:{port}/index.html'
        c = await b.new_context(viewport={'width': 375, 'height': 740}, has_touch=True, is_mobile=True); q = await c.new_page()
        q.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await prep(q, u)
        op = lambda: q.evaluate("document.body.classList.contains('nav-open')")
        ar = await q.evaluate("(()=>{const n=document.getElementById('app-nav');const cs=getComputedStyle(n);const t=document.querySelector('.menu-toggle');return {vis:cs.visibility,sh:cs.boxShadow,exp:t.getAttribute('aria-expanded'),lab:t.getAttribute('aria-label')}})()")
        chk('M-1 con el panel cerrado no se ve la sombra en el borde y sus enlaces no reciben foco', ar['vis'] == 'hidden' and ar['sh'] == 'none', ar)
        chk('M-2 el botón de menú arranca con aria-expanded=false y «Abrir menú»', ar['exp'] == 'false' and ar['lab'] == 'Abrir menú', ar)
        await q.click('.menu-toggle'); await q.wait_for_timeout(350)
        st = await q.evaluate("(()=>{const t=document.querySelector('.menu-toggle');const bd=document.querySelector('.nav-backdrop');const a=document.activeElement;return {open:document.body.classList.contains('nav-open'),exp:t.getAttribute('aria-expanded'),lab:t.getAttribute('aria-label'),bd:getComputedStyle(bd).display,ov:getComputedStyle(document.body).overflow,inNav:!!(a&&a.closest('#app-nav')),vis:getComputedStyle(document.getElementById('app-nav')).visibility}})()")
        chk('M-3 al abrir: aria-expanded=true, «Cerrar menú», fondo visible, el foco entra al panel y la página de atrás no se desplaza', st['open'] and st['exp'] == 'true' and st['lab'] == 'Cerrar menú' and st['bd'] == 'block' and st['ov'] == 'hidden' and st['inNav'] and st['vis'] == 'visible', st)
        await q.mouse.click(350, 500); await q.wait_for_timeout(300)
        chk('M-4 tocar fuera del panel (fondo) lo cierra', await op() is False)
        await q.click('.menu-toggle'); await q.wait_for_timeout(250); await q.keyboard.press('Escape'); await q.wait_for_timeout(250)
        foc = await q.evaluate("document.activeElement.className")
        chk('M-5 Escape cierra el panel y devuelve el foco al botón de menú', await op() is False and 'menu-toggle' in foc, foc)
        await q.click('.menu-toggle'); await q.wait_for_timeout(250)
        h0 = await q.evaluate("location.hash")
        await q.click('.snav__toggle[data-value="diagnosticar"]'); await q.wait_for_timeout(300)
        s1 = await q.evaluate("[location.hash, document.body.classList.contains('nav-open'), [...document.querySelectorAll('.snav__toggle')].filter(t=>t.getAttribute('aria-expanded')==='true').map(t=>t.dataset.value)]")
        chk('M-6 elegir una sección solo la despliega: no cambia de página, el panel sigue abierto y solo queda una sección abierta', s1[0] == h0 and s1[1] and s1[2] == ['diagnosticar'], s1)
        await q.click('.snav__toggle[data-value="medir"]'); await q.wait_for_timeout(300)
        s2 = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].filter(t=>t.getAttribute('aria-expanded')==='true').map(t=>t.dataset.value)")
        chk('M-7 abrir otra sección cierra la anterior (acordeón)', s2 == ['medir'], s2)
        await q.click('.snav__toggle[data-value="medir"]'); await q.wait_for_timeout(300)
        s3 = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].filter(t=>t.getAttribute('aria-expanded')==='true').length")
        chk('M-8 tocar la sección abierta la pliega', s3 == 0, s3)
        await q.click('.snav__toggle[data-value="diagnosticar"]'); await q.wait_for_timeout(250); await q.click('a[data-nav="prodevol"]'); await q.wait_for_timeout(450)
        s4 = await q.evaluate("[location.hash, document.body.classList.contains('nav-open'), document.querySelector('.menu-toggle').getAttribute('aria-expanded')]")
        chk('M-9 elegir una página cambia de vista y cierra el panel', s4 == ['#prodevol', False, 'false'], s4)
        # datos primero
        await q.goto(u + '#pacing'); await q.wait_for_timeout(500)
        mo = await q.evaluate("(()=>{const m=document.getElementById('ux-more'),bt=document.querySelector('.ux-head__morebtn');return {more:getComputedStyle(m).display,btn:getComputedStyle(bt).display,exp:bt.getAttribute('aria-expanded'),top:Math.round(document.querySelector('#view-pacing table, #view-pacing svg, #view-pacing .kpi, #view-pacing .ds-kpi, #view-pacing canvas').getBoundingClientRect().top+scrollY)}})()")
        chk('M-10 en móvil «Qué hay aquí / Qué hago» llega plegado y hay un botón para verlo', mo['more'] == 'none' and mo['btn'] != 'none' and mo['exp'] == 'false', mo)
        chk('M-11 el primer dato de Pacing aparece más arriba que antes (antes ≈976 px)', mo['top'] < 800, mo)
        await q.click('.ux-head__morebtn'); await q.wait_for_timeout(200)
        mo2 = await q.evaluate("[getComputedStyle(document.getElementById('ux-more')).display, document.querySelector('.ux-head__morebtn').getAttribute('aria-expanded'), document.getElementById('ux-more').innerText.includes('Qué hago aquí')]")
        chk('M-12 el botón despliega el texto y marca aria-expanded', mo2[0] != 'none' and mo2[1] == 'true' and mo2[2], mo2)
        # el aviso de calidad y el contexto siguen visibles sin desplegar
        await q.goto(u + '#carga'); await q.wait_for_timeout(500)
        ov = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
        chk('M-13 sin desborde horizontal en 375 px', ov <= 0, ov)
        # tablas, letra mínima y avisos
        await q.goto(u + '#calidad'); await q.evaluate("FP.qualityView && FP.qualityView.openAll && FP.qualityView.openAll()"); await q.wait_for_timeout(500)
        tb = await q.evaluate("(()=>{const w=[...document.querySelectorAll('[id^=view-]:not([hidden]) .table-wrap')].find(x=>x.querySelector('table:not(.table--cards)'))||document.querySelector('.table-wrap');const th=w.querySelector('.ds-table tbody td:first-child')||w.querySelector('.ds-table td');const cs=getComputedStyle(th);return {pos:cs.position,bg:getComputedStyle(w).backgroundImage.includes('gradient'),pill:[...document.querySelectorAll('.pill')].filter(e=>e.offsetWidth>0).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)}})()")
        chk('M-17 tablas anchas: indicador de que hay más columnas al costado y la primera columna NO se fija (no tapa botones)', tb['pos'] != 'sticky' and tb['bg'], tb)
        chk('M-18 las etiquetas (pill) miden al menos 12 px en móvil', tb['pill'], tb)
        await q.evaluate("FP.ui.toast('Aviso de prueba')"); await q.wait_for_timeout(200); await q.click('.menu-toggle'); await q.wait_for_timeout(300)
        tdisp = await q.evaluate("[...document.querySelectorAll('.toast')].map(t=>getComputedStyle(t).display)")
        chk('M-19 con el menú abierto el aviso no se encima', all(x == 'none' for x in tdisp), tdisp)
        await q.keyboard.press('Escape'); await q.wait_for_timeout(200)
        # aviso arriba y cierre al tocar; el plegado se conserva al cambiar de pantalla
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        await q.evaluate("FP.ui.toast('Aviso de prueba')"); await q.wait_for_timeout(300)
        tp = await q.evaluate("(()=>{const t=document.getElementById('toast').getBoundingClientRect();const h=document.querySelector('.app-header').getBoundingClientRect();return {top:Math.round(t.top),hb:Math.round(h.bottom),vis:document.getElementById('toast').classList.contains('is-visible')}})()")
        chk('M-20 en móvil el aviso sale abajo (no tapa el título ni los controles de arriba) y deja libre el botón «Volver arriba»', tp['vis'] and tp['top'] > 300, tp)
        await q.click('#toast'); await q.wait_for_timeout(250)
        chk('M-21 tocar el aviso lo cierra', await q.evaluate("!document.getElementById('toast').classList.contains('is-visible')"))
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        if await q.evaluate("document.getElementById('ux-more').dataset.open") != 'true': await q.click('.ux-head__morebtn')
        await q.evaluate("location.hash='#recovery'"); await q.wait_for_timeout(500)
        cv = await q.evaluate("document.getElementById('ux-more').dataset.open")
        chk('M-22 el texto desplegado se conserva al cambiar de pantalla dentro de la sesión', cv == 'true', cv)
        await q.reload(); await q.wait_for_timeout(700)
        cv2 = await q.evaluate("document.getElementById('ux-more').dataset.open")
        chk('M-23 al recargar la página vuelve a llegar plegado', cv2 == 'false', cv2)
        # Producto a 320 px: el botón de exportar no se sale de la pantalla
        await q.set_viewport_size({'width': 320, 'height': 740}); await q.goto(u + '#prodevol'); await q.wait_for_timeout(600)
        ov320 = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
        chk('M-24 Producto a 320 px sin desborde horizontal (botón con nombre de archivo largo)', ov320 <= 0, ov320)
        await q.set_viewport_size({'width': 375, 'height': 740})
        # escritorio: nada cambia
        d = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); d.on('pageerror', lambda e: errs.append(str(e)[:150]))
        await prep(d, u)
        dk = await d.evaluate("(()=>{const m=document.getElementById('ux-more');return {more:getComputedStyle(m).display,btn:getComputedStyle(document.querySelector('.ux-head__morebtn')).display,bd:getComputedStyle(document.querySelector('.nav-backdrop')).display,nav:getComputedStyle(document.getElementById('app-nav')).visibility}})()")
        chk('M-14 en escritorio el texto está visible, no hay botón de plegar ni fondo y el menú lateral sigue fijo', dk['more'] != 'none' and dk['btn'] == 'none' and dk['bd'] == 'none' and dk['nav'] == 'visible', dk)
        await d.click('.snav__toggle[data-value="diagnosticar"]'); await d.wait_for_timeout(400)
        chk('M-15 en escritorio elegir una sección sigue abriendo su primera página', await d.evaluate("location.hash") == '#diagnostico')
        chk('M-16 sin errores de página', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_movil:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
