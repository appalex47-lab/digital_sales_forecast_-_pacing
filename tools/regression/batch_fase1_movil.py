"""UX móvil · fase 1: arranque (login→bienvenida), opciones de lectura plegables, header compacto y filtros de Diagnóstico plegables.
Uso: python3 -I batch_fase1_movil.py <raiz>   (el arranque se prueba sobre https con certificado autofirmado temporal)"""
import asyncio, sys, os, ssl, tempfile, subprocess, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
def serve(tls):
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
    if tls:
        d = tempfile.mkdtemp(); k, c = d + '/k.pem', d + '/c.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=127.0.0.1'], capture_output=True, check=True)
        x = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); x.load_cert_chain(c, k); s.socket = x.wrap_socket(s.socket, server_side=True)
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
HP, SP = serve(False), serve(True)
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
DLG = "[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.id)"
async def watch(q, ms=2500, step=100):
    """Muestrea los diálogos abiertos: devuelve (máximo simultáneo, secuencia de estados distintos)."""
    mx, seq = 0, []
    for _ in range(ms // step):
        o = await q.evaluate(DLG); mx = max(mx, len(o))
        if not seq or seq[-1] != o: seq.append(o)
        await q.wait_for_timeout(step)
    return mx, seq
async def mock(q, u, h):
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(u + '#inicio'); await q.wait_for_timeout(700)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove());FP.app.actions['generate-mock']()"); await q.wait_for_timeout(900)
    await q.goto(u + h); await q.wait_for_timeout(700)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        https = f'https://127.0.0.1:{SP}/index.html'; http = f'http://127.0.0.1:{HP}/index.html'
        for tag, vp, mob in (('375', {'width': 375, 'height': 740}, True), ('1280', {'width': 1280, 'height': 800}, False)):
            c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob, ignore_https_errors=True); q = await c.new_page()
            q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await q.goto(https); mx, seq = await watch(q)
            chk(f'A-1 [{tag}] primera visita (https, sin sesión): nunca hay dos diálogos abiertos y el primero es la bienvenida única', mx <= 1 and seq and seq[-1] == ['entry-dialog'] , (mx, seq))
            await q.click('[data-action=entry-guest]'); mx, seq = await watch(q, 1500)
            chk(f'A-2 [{tag}] «Continuar sin sesión» deja solo el recorrido (sin dos capas)', mx <= 1 and seq[-1] == ['tour-offer'], (mx, seq))
            await q.click('[data-action=tour-offer-no]'); mx, seq = await watch(q, 1500)
            chk(f'A-3 [{tag}] «Ahora no» en la bienvenida: no queda ni reaparece ningún diálogo', mx == 0, (mx, seq))
            await q.reload(); mx, seq = await watch(q, 1500)
            chk(f'A-4 [{tag}] recarga en la misma sesión: ningún diálogo', mx == 0, (mx, seq))
            await q.evaluate("sessionStorage.clear()"); await q.reload(); mx, seq = await watch(q, 2000)
            chk(f'A-5 [{tag}] visita posterior (sesión nueva, ya eligió continuar sin sesión): no se le vuelve a insistir con ningún diálogo', mx == 0, (mx, seq))
            await q.evaluate("localStorage.removeItem('fp.v1:authChoice');sessionStorage.clear()"); await q.reload(); await q.wait_for_timeout(1500)
            await q.click('[data-action=entry-login]'); await q.wait_for_selector('#login-dialog'); await q.keyboard.press('Escape'); mx, seq = await watch(q, 1200)
            chk(f'A-6 [{tag}] Esc en el login vuelve a la bienvenida y no abre otro diálogo encima', mx <= 1 and seq[-1] == ['entry-dialog'], (mx, seq))
            await c.close()
            c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob, ignore_https_errors=True); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await q.goto(https); await q.wait_for_timeout(1200); await q.keyboard.press('Escape'); mx, seq = await watch(q, 1500)
            chk(f'A-7 [{tag}] Esc en la bienvenida de la primera visita: se abre el recorrido (solo)', mx <= 1 and seq[-1] == ['tour-offer'], (mx, seq))
            await c.close()
            c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await q.goto(http); mx, seq = await watch(q, 1800)
            chk(f'A-8 [{tag}] sin https no hay acceso: la bienvenida sale como antes', mx <= 1 and seq and seq[-1] == ['tour-offer'], (mx, seq))
            await c.close()
        # ---- Carga: opciones de lectura ----
        for tag, vp, mob in (('375', {'width': 375, 'height': 740}, True), ('1280', {'width': 1280, 'height': 800}, False)):
            c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await mock(q, http, '#carga')
            st = await q.evaluate("(()=>{const d=document.getElementById('import-settings-details');const h=[...document.querySelectorAll('#view-carga h2,#view-carga h3')].find(x=>/^Hist/.test(x.textContent.trim()));return {open:d&&d.open,hist:h?Math.round(h.getBoundingClientRect().top+scrollY):null,sum:(document.getElementById('import-settings-sum')||{}).textContent}})()")
            chk(f'C-1 [{tag}] las opciones de lectura entran plegadas', st['open'] is False, st)
            if tag == '375': chk('C-2 [375] la tarjeta Histórico queda dentro de los primeros 700 px', st['hist'] is not None and st['hist'] < 700, st)
            chk(f'C-3 [{tag}] el resumen muestra fecha, número, tolerancia e IA', all(x in (st['sum'] or '') for x in ('Fecha:', 'Número:', 'Tolerancia:', 'IA:')), st)
            await q.click('#import-settings-details > summary'); await q.wait_for_timeout(200)
            ids = ['set-date', 'set-number', 'set-tol', 'set-rep-rows', 'set-rep-rev', 'set-ai-prompt']
            vis = await q.evaluate("(ids)=>ids.map(i=>{const e=document.getElementById(i);return !!(e&&e.offsetParent)})", ids)
            chk(f'C-4 [{tag}] al expandir están los 6 campos y los 3 checks', all(vis) and await q.evaluate("document.querySelectorAll('#import-settings input[type=checkbox]').length") == 3, vis)
            await q.fill('#set-tol', '2'); await q.dispatch_event('#set-tol', 'change'); await q.wait_for_timeout(400)
            o = await q.evaluate("[document.getElementById('import-settings-details').open, document.getElementById('set-tol').value, FP.app.state.settings.tolerance]")
            chk(f'C-5 [{tag}] cambiar un valor no cierra el panel y se guarda (tolerancia 2 %)', o[0] is True and o[1] in ('2', '2.0') and abs(o[2] - 0.02) < 1e-9, o)
            await q.select_option('#set-number', 'comma'); await q.wait_for_timeout(300)
            await q.click('#import-settings-details > summary'); await q.wait_for_timeout(150); await q.click('#import-settings-details > summary'); await q.wait_for_timeout(150)
            o = await q.evaluate("[document.getElementById('set-number').value, document.getElementById('set-tol').value, FP.app.state.settings.numberFormat]")
            chk(f'C-6 [{tag}] plegar y desplegar conserva los valores', o[0] == 'comma' and o[2] == 'comma' and o[1] in ('2', '2.0'), o)
            await q.click('#import-settings-details > summary'); await q.wait_for_timeout(200)
            sm = await q.evaluate("document.getElementById('import-settings-sum').textContent")
            chk(f'C-7 [{tag}] el resumen plegado refleja los valores vigentes (1.234,56 y 2 %)', '1.234,56' in sm and '2 %' in sm, sm)
            await q.focus('#import-settings-details > summary'); await q.keyboard.press('Enter'); await q.wait_for_timeout(200)
            chk(f'C-8 [{tag}] el teclado (Enter en el resumen) lo abre', await q.evaluate("document.getElementById('import-settings-details').open"))
            await q.goto(http + '#pacing'); await q.wait_for_timeout(400); await q.goto(http + '#carga'); await q.wait_for_timeout(600)
            chk(f'C-9 [{tag}] al volver a Carga conserva el valor guardado', await q.evaluate("FP.app.state.settings.numberFormat") == 'comma')
            ov = await q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth")
            chk(f'C-10 [{tag}] sin scroll horizontal de página en Carga', ov)
            await c.close()
        # ---- Header móvil: una sola fila fija, fecha como ícono de calendario ----
        for w in (320, 375):
            c = await b.new_context(viewport={'width': w, 'height': 740}, has_touch=True, is_mobile=True); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await mock(q, http, '#pacing')
            hb = "(()=>{const r=document.querySelector('.app-header').getBoundingClientRect();return [Math.round(r.top),Math.round(r.height)]})()"
            chk(f'H-1 [{w}] encabezado de una sola fila de 56 px', await q.evaluate(hb) == [0, 56], await q.evaluate(hb))
            await q.mouse.wheel(0, 900); await q.wait_for_timeout(500)
            chk(f'H-2 [{w}] al bajar el encabezado no desaparece ni cambia', await q.evaluate(hb) == [0, 56], await q.evaluate(hb))
            pos = await q.evaluate("(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),Math.round(r.width),Math.round(r.height)]};return {d:g('#topbar-ref'),h:g('#topbar-help'),a:g('#topbar-account')}})()")
            ok = pos['d'] and pos['h'] and pos['a'] and pos['d'][1] <= pos['h'][0] + 1 and pos['h'][1] <= pos['a'][0] + 1
            chk(f'H-3 [{w}] el chip de fecha queda a la izquierda de ayuda y cuenta', ok, pos)
            chk(f'H-3b [{w}] el botón de fecha es solo ícono y táctil (≥ 40 px)', pos['d'] and pos['d'][2] >= 40 and pos['d'][3] >= 40 and pos['d'][2] <= 48, pos['d'])
            lab = await q.get_attribute('#topbar-ref', 'aria-label')
            chk(f'H-4 [{w}] el nombre accesible conserva la fecha y el año', bool(lab) and 'Datos al' in lab and '2026' in lab, lab)
            await q.click('#topbar-ref'); await q.wait_for_timeout(300)
            pr = await q.evaluate("(()=>{const r=document.getElementById('topbar-ref-panel').getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),Math.round(r.top),Math.round(r.bottom),innerWidth,innerHeight]})()")
            chk(f'H-5 [{w}] el panel de fecha se abre completo dentro de la pantalla', pr[0] >= 0 and pr[1] <= pr[4] and pr[3] <= pr[5] and pr[2] >= 50, pr)
            chk(f'H-5b [{w}] el panel trae fecha, chips y año', await q.is_visible('#topbar-date') and await q.is_visible('#topbar-year'))
            await q.click('body', position={'x': 5, 'y': 400}); await q.wait_for_timeout(300)
            chk(f'H-5c [{w}] tocar fuera cierra el panel', not await q.is_visible('#topbar-ref-panel'))
            await q.click('.menu-toggle'); await q.wait_for_timeout(500)
            nav = await q.evaluate("(()=>{const n=document.getElementById('app-nav').getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect();return Math.round(n.top-h.bottom)})()")
            chk(f'H-6 [{w}] el cajón empieza justo bajo el encabezado', abs(nav) <= 2, nav)
            await q.keyboard.press('Escape'); await q.wait_for_timeout(400)
            ov = await q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth")
            chk(f'H-6b [{w}] sin scroll horizontal de página', ov)
            await c.close()
        c = await b.new_context(viewport={'width': 1280, 'height': 800}); q = await c.new_page()
        await mock(q, http, '#pacing'); await q.mouse.wheel(0, 900); await q.wait_for_timeout(500)
        d = await q.evaluate("(()=>{const r=document.querySelector('.app-header').getBoundingClientRect();return [Math.round(r.top),Math.round(r.height)]})()")
        chk('H-7 [1280] escritorio sin cambio: encabezado de 56 px fijo arriba', d == [0, 56], d)
        await c.close()
        # ---- Diagnóstico: filtros ----
        for tag, vp, mob in (('375', {'width': 375, 'height': 740}, True), ('1280', {'width': 1280, 'height': 800}, False)):
            c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:150]))
            await mock(q, http, '#diagnostico')
            o = await q.evaluate("(()=>{const d=document.getElementById('dx-filters');const h=[...document.querySelectorAll('#view-diagnostico h3')].find(x=>/Resultado/.test(x.textContent));return {open:d.open,chips:d.querySelectorAll('.dx-filters__chips .ds-badge').length,res:h?Math.round(h.getBoundingClientRect().top+scrollY):null,sel:document.querySelectorAll('#dx-controls select').length}})()")
            chk(f'F-1 [{tag}] el panel Filtros está {"plegado" if mob else "abierto"} por defecto y conserva los 5 selectores y 5 chips', o['open'] == (not mob) and o['chips'] == 5 and o['sel'] == 5 - 0 + 0 or o['sel'] == 5, o)
            if mob: chk('F-2 [375] el resultado (Hecho) aparece antes que los ~1,964 px medidos en la auditoría (antes de este cambio)', o['res'] is not None and o['res'] < 1900, o)
            if mob: await q.click('#dx-filters > summary'); await q.wait_for_timeout(200)
            before = await q.evaluate("document.getElementById('dx-result').textContent.length")
            await q.select_option('#dx-ch', 'ecommerce'); await q.wait_for_timeout(700)
            after = await q.evaluate("[document.getElementById('dx-result').textContent.slice(0,200), FP.app.state.dx.settings.channel, document.querySelectorAll('#dx-filters').length, document.getElementById('dx-filters').open]")
            chk(f'F-3 [{tag}] cambiar el canal recalcula el resultado (usa el canal elegido), sin duplicar el panel', after[1] == 'ecommerce' and 'Ecommerce' in after[0] and after[2] == 1 and after[3] is True, after)
            await q.click('#dx-filters > summary'); await q.wait_for_timeout(200)
            ch = await q.evaluate("[...document.querySelectorAll('#dx-filters .dx-filters__chips .ds-badge')].map(e=>e.textContent.trim())")
            chk(f'F-4 [{tag}] plegado, los chips reflejan los filtros reales (Canal: Ecommerce)', any('Canal' in x and 'Ecommerce' in x for x in ch) and len(ch) == 5 and await q.is_visible('#dx-filters .dx-filters__chips'), ch)
            await q.click('#dx-filters > summary'); await q.wait_for_timeout(200)
            v = await q.evaluate("document.getElementById('dx-ch').value")
            chk(f'F-5 [{tag}] desplegar conserva la selección', v == 'ecommerce', v)
            await q.goto(http + '#plan'); await q.wait_for_timeout(300); await q.goto(http + '#diagnostico'); await q.wait_for_timeout(700)
            v = await q.evaluate("[document.getElementById('dx-ch').value, document.querySelectorAll('#dx-filters').length]")
            chk(f'F-6 [{tag}] al volver a Diagnóstico los filtros siguen y no se duplican', v == ['ecommerce', 1], v)
            ov = await q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth")
            chk(f'F-7 [{tag}] sin scroll horizontal de página en Diagnóstico', ov)
            await c.close()
        # R17: los chips de filtros no desbordan la página a 320 px
        c = await b.new_context(viewport={'width': 320, 'height': 740}, has_touch=True, is_mobile=True); q = await c.new_page()
        await mock(q, http, '#diagnostico')
        o = await q.evaluate("[document.documentElement.scrollWidth-document.documentElement.clientWidth, Math.max(...[...document.querySelectorAll('#dx-filters .dx-filters__chips .ds-badge')].map(e=>e.getBoundingClientRect().right))]")
        chk('F-8 [320] los chips de filtros no desbordan la página', o[0] <= 0 and o[1] <= 320, o)
        await c.close()
        chk('E-1 sin errores JavaScript en toda la batería', not errs, errs[:3])
        await b.close()
    print('\nFALLAS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
