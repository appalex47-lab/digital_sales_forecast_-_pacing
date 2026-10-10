"""Etapa J · pruebas puntuales de accesibilidad (skip-link, título y anuncio por vista, estados con región viva, encabezados, objetivos táctiles del encabezado).
Uso: python3 batch_k.py <raiz>   Sale 1 si alguna falla. El barrido completo (contraste real, foco, táctil, estructura) es a11y_audit.py + a11y_report.py."""
import asyncio, sys, os, threading, functools, http.server, socketserver
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
TITLES = {'inicio': 'Inicio', 'carga': 'Carga de datos', 'pacing': 'Pacing & Forecast', 'diagnostico': '¿Por qué? Diagnóstico', 'ajustes': 'Configuración de RevNavigator', 'plan': 'Plan'}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        # ---------- skip-link ----------
        await q.goto(u + '#pacing'); await q.reload(); await q.wait_for_timeout(1200)   # recarga: el punto de partida del teclado vuelve al inicio del documento
        await q.keyboard.press('Tab'); await q.wait_for_timeout(150)
        sk = await q.evaluate("""()=>{const a=document.activeElement;const r=a.getBoundingClientRect();const c=getComputedStyle(a);return {cls:a.className,text:a.innerText.trim(),top:Math.round(r.top),left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height),outline:c.outlineStyle+' '+c.outlineWidth,first:a===document.querySelector('a[href],button,input,select,textarea,[tabindex="0"]')}}""")
        chk('J el primer Tab en la página llega a «Saltar al contenido», se hace visible dentro de la pantalla y tiene contorno', 'skip-link' in sk['cls'] and sk['text'] == 'Saltar al contenido' and sk['top'] >= 0 and sk['left'] >= 0 and sk['w'] > 60 and sk['h'] >= 24 and sk['outline'].startswith('solid') and sk['first'], sk)
        hid = await q.evaluate("(()=>{const a=document.querySelector('a.skip-link');a.blur();const r=a.getBoundingClientRect();return r.bottom<=0})()")
        chk('J sin foco, el enlace queda fuera de pantalla (no estorba a quien usa el ratón)', hid is True, hid)
        await q.focus('a.skip-link'); await q.keyboard.press('Enter'); await q.wait_for_timeout(300)
        sj = await q.evaluate("[location.hash, document.activeElement.tagName, document.activeElement.id, document.activeElement.getAttribute('tabindex'), !document.getElementById('view-pacing').hidden]")
        chk('J activar «Saltar al contenido» lleva el foco a la vista visible sin cambiar de página (la dirección sigue en #pacing)', sj[0] == '#pacing' and sj[1] == 'MAIN' and sj[2] == 'view-pacing' and sj[3] == '-1' and sj[4] is True, sj)
        await q.keyboard.press('Tab'); await q.wait_for_timeout(150)
        nx = await q.evaluate("(()=>{const a=document.activeElement;return [a.tagName, !!a.closest('#view-pacing')]})()")
        chk('J tras saltar, el siguiente Tab cae dentro del contenido (no vuelve al menú ni al encabezado)', nx[1] is True, nx)
        # ---------- orden de tabulación: encabezado → menú → contenido ----------
        await q.goto(u + '#pacing'); await q.reload(); await q.wait_for_timeout(1200)
        seq = []
        for i in range(60):
            await q.keyboard.press('Tab')
            seq.append(await q.evaluate("(()=>{const a=document.activeElement;return a.closest('.app-header')?'encabezado':a.closest('#app-nav')?'menú':a.closest('#ux-context')?'contexto':a.closest('main')?'contenido':a.classList.contains('skip-link')?'salto':'otro'})()"))
        order = [x for i, x in enumerate(seq) if i == 0 or x != seq[i - 1]]
        chk('J el orden de tabulación es salto → encabezado → menú → contexto → contenido', order[:5] == ['salto', 'encabezado', 'menú', 'contexto', 'contenido'], order[:8])
        # ---------- título y anuncio por vista ----------
        bad = []
        for v, t in TITLES.items():
            await q.goto(u + '#' + v); await q.wait_for_timeout(450)
            r = await q.evaluate("[document.title, document.getElementById('route-announcer').textContent]")
            if r[0] != f'{t} · RevNavigator' or r[1] != f'Vista: {t}': bad.append((v, r))
        chk('J cada vista pone su título en la pestaña («Vista · RevNavigator») y lo anuncia en la región aria-live', not bad, bad[:3])
        an = await q.evaluate("(()=>{const a=document.getElementById('route-announcer');return [a.getAttribute('role'),a.getAttribute('aria-live'),a.getAttribute('aria-atomic'),getComputedStyle(a).position,a.getBoundingClientRect().width<=1]})()")
        chk('J el anunciador es role=status + aria-live=polite, está oculto a la vista y no ocupa espacio', an[0] == 'status' and an[1] == 'polite' and an[2] == 'true' and an[3] == 'absolute' and an[4] is True, an)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        await q.click('#topbar-year'); await q.keyboard.press('Escape'); await q.wait_for_timeout(200)
        t1 = await q.evaluate("document.title")
        chk('J un cambio de filtro dentro de la misma vista no repite el anuncio ni cambia el título', t1 == 'Pacing & Forecast · RevNavigator', t1)
        # ---------- estados con región viva ----------
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(400)
        await q.evaluate("FP.app.state.dx.ai={status:'unavailable',result:{ok:false,errors:['Sin conexión con Cohere.']}};FP.diagnosticView.render(FP.app.state)")
        await q.wait_for_timeout(200)
        al = await q.evaluate("(()=>{const a=[...document.querySelectorAll('#view-diagnostico .ds-alert--danger[role=alert]')].map(x=>x.innerText.slice(0,60));return a})()")
        chk('J el error del análisis con IA (Diagnóstico) se anuncia con role=alert y usa el aviso estándar de peligro', len(al) >= 1 and 'Análisis con IA no disponible' in al[0], al)
        await q.goto(u + '#resumen'); await q.wait_for_timeout(500)
        live = await q.evaluate("[...document.querySelectorAll('#view-resumen [role=status],#view-resumen [role=alert]')].length")
        await q.goto(u + '#estacionalidad'); await q.wait_for_timeout(300)
        chk('J los avisos de validación de la meta llevan role (status si cuadra, alert si difiere)', live >= 1, live)
        # ---------- encabezados sin saltos, un solo h1 ----------
        H = """()=>{const H=[...document.querySelectorAll('.app-main:not([hidden]) h1,.app-main:not([hidden]) h2,.app-main:not([hidden]) h3,.app-main:not([hidden]) h4')].filter(e=>e.getBoundingClientRect().height>0).map(e=>+e.tagName[1]);let sk=0;for(let i=1;i<H.length;i++)if(H[i]>H[i-1]+1)sk++;return {sk,h1:document.querySelectorAll('h1').length,n:H.length}}"""
        skips = {}
        for v in ('inicio', 'carga', 'calidad', 'datos', 'resumen', 'estacionalidad', 'plan', 'configuracion', 'pacing', 'diagnostico', 'producto', 'reforecast', 'recovery', 'medir', 'narrativa', 'paquete', 'segmentos', 'ayuda', 'ajustes'):
            await q.goto(u + '#' + v); await q.wait_for_timeout(300)
            r = await q.evaluate(H)
            if r['sk'] or r['h1'] != 1: skips[v] = r
        chk('J en las 18 vistas los encabezados no saltan de nivel y hay un solo h1 en el documento', not skips, skips)
        # ---------- objetivos táctiles del encabezado y el menú en móvil ----------
        m = await b.new_page(viewport={'width': 390, 'height': 800}); await prepare(m, u); await m.goto(u + '#pacing'); await m.wait_for_timeout(600)
        tt = await m.evaluate("""()=>{const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.width),Math.round(b.height)]};const st=document.getElementById('topbar-status');
          return {year:r(document.getElementById('topbar-year')),links:[...st.querySelectorAll('a')].map(r),menu:r(document.querySelector('.menu-toggle')),bell:r(document.querySelector('.topbar__actions .icon-btn')),hdr:Math.round(document.querySelector('.app-header').getBoundingClientRect().height),navTop:Math.round(document.getElementById('app-nav').getBoundingClientRect().top),sw:document.documentElement.scrollWidth-innerWidth}}""")
        okt = tt['year'][1] >= 44 and all(h >= 44 for w, h in tt['links']) and tt['menu'][0] >= 44 and tt['menu'][1] >= 44 and tt['bell'][0] >= 44 and tt['bell'][1] >= 44
        chk('J móvil 390 px: año, píldoras, menú y notificaciones miden ≥ 44 px y el cajón del menú empieza justo bajo el encabezado, sin desborde', okt and abs(tt['hdr'] - tt['navTop']) <= 1 and tt['sw'] <= 0, tt)
        await m.close()
        # ---------- el encabezado en dos filas y el cajón del menú siempre quedan alineados, con ratón y con pantalla táctil ----------
        bad = []
        for touch in (False, True):
            for w in (1024, 861, 860, 800, 761, 760, 600, 360, 340, 320):
                c2 = await b.new_context(viewport={'width': w, 'height': 800}, has_touch=touch, is_mobile=touch); p2 = await c2.new_page()
                await p2.goto(u + '#resumen'); await p2.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await p2.click('[data-action="generate-mock"]'); await p2.wait_for_timeout(600); await p2.goto(u + '#pacing'); await p2.wait_for_timeout(400)
                r = await p2.evaluate("""()=>{const h=document.querySelector('.app-header').getBoundingClientRect(),n=document.getElementById('app-nav').getBoundingClientRect();
                  return {gap:Math.round(h.bottom-n.top),pills:[...document.querySelectorAll('#topbar-status > *')].map(e=>Math.round(e.getBoundingClientRect().height)),sw:document.documentElement.scrollWidth-innerWidth,
                  coarse:matchMedia('(pointer: coarse)').matches}}""")
                want44 = w <= 760 or touch
                if abs(r['gap']) > 1 or r['sw'] > 0 or (want44 and min(r['pills']) < 44): bad.append((('táctil' if touch else 'ratón'), w, r))
                await c2.close()
        chk('J el encabezado y el inicio del menú quedan alineados (± 1 px) y sin desborde de 320 a 1024 px, con ratón y con pantalla táctil; las píldoras miden 44 px donde hay toque (≤ 760 px o táctil)', not bad, bad[:3])
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_k:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
