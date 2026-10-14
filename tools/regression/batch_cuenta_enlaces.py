"""Menú de cuenta, botón Cohere junto a Hipótesis, narrativa Cohere bajo el resumen y enlace a la hoja de Sheets. Uso: python3 batch_cuenta_enlaces.py <raiz>"""
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
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        # --- enlace de edición (unidad)
        r = await q.evaluate("""()=>({a:FP.sheetsLink.editUrl('https://docs.google.com/spreadsheets/d/AbC_123-x/edit?usp=sharing#gid=77'),
          b:FP.sheetsLink.editUrl('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv'), c:FP.sheetsLink.editUrl('https://evil.com/spreadsheets/d/abc/edit'),
          d:FP.sheetsLink.editUrl('javascript:alert(1)'), e:FP.sheetsLink.editUrl('http://docs.google.com/spreadsheets/d/abc/edit')})""")
        chk('S1 editUrl limpia el enlace y conserva la pestaña', r['a'] == 'https://docs.google.com/spreadsheets/d/AbC_123-x/edit#gid=77', r)
        chk('S2 editUrl rechaza publicado, otro dominio, javascript: y http', not r['b'] and not r['c'] and not r['d'] and not r['e'], r)
        # --- Sheets en Carga de datos
        await q.evaluate("""()=>{FP.app.state.sheets.links=[{id:'t1',type:'actual',url:'https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?gid=1&single=true&output=csv',label:'Venta real 2026',lastAt:new Date().toISOString(),rows:10,kind:'published'}];FP.app.render()}""")
        await q.goto(u + '#carga'); await q.wait_for_timeout(600)
        chk('S3 sin enlace de edición se ofrece agregarlo', await q.evaluate("!!document.querySelector('#sheets-saved-actual .sheets-edit') && !document.querySelector('#sheets-saved-actual [data-sheets-open]')"))
        await q.evaluate("document.querySelector('#sheets-saved-actual .sheets-edit').open=true")
        await q.fill('#sheets-edit-t1', 'https://docs.google.com/spreadsheets/d/FILE123/edit#gid=1'); await q.click('[data-action="sheets-set-edit"][data-id="t1"]'); await q.wait_for_timeout(400)
        h = await q.evaluate("(()=>{const a=document.querySelector('#sheets-saved-actual [data-sheets-open]');return a?{h:a.href,t:a.target,r:a.rel}:null})()")
        chk('S4 aparece «Abrir hoja» con el enlace correcto y seguro', bool(h) and h['h'] == 'https://docs.google.com/spreadsheets/d/FILE123/edit#gid=1' and h['t'] == '_blank' and 'noopener' in h['r'], h)
        await q.reload(); await q.wait_for_timeout(800)
        chk('S5 el enlace sobrevive a recargar', await q.evaluate("!!document.querySelector('#sheets-saved-actual [data-sheets-open]')"))
        await q.fill('#sheets-edit-t1', 'x') if await q.query_selector('#sheets-edit-t1') else None
        chk('S6 el formulario nuevo trae el campo opcional', await q.evaluate("!!document.getElementById('sheets-edit-actual')"))
        # --- menú de cuenta
        await q.goto(u + '#inicio'); await q.reload(); await q.wait_for_timeout(800)
        chk('A1 el avatar es un botón', await q.evaluate("document.getElementById('acct-menu-btn')?.tagName==='BUTTON'"))
        await q.click('#acct-menu-btn')
        chk('A2 sin sesión el menú ofrece iniciar sesión', await q.evaluate("!document.getElementById('acct-menu').hidden && !!document.querySelector('#acct-menu [data-action=\"login-open\"]') && !document.querySelector('#acct-menu [data-action=\"cloud-signout\"]')"))
        await q.keyboard.press('Escape')
        chk('A3 Escape cierra el menú', await q.evaluate("document.getElementById('acct-menu').hidden"))
        await q.evaluate("FP.app.state.cloud.session={userId:'u1',email:'appalex@hotmail.es',teamId:'t',teamName:'Ecommerce'};FP.app.render()")
        await q.click('#acct-menu-btn'); await q.wait_for_timeout(200)
        t = await q.evaluate("document.getElementById('acct-menu').innerText")
        chk('A4 con sesión muestra correo, equipo y Cerrar sesión', 'appalex@hotmail.es' in t and 'Ecommerce' in t and 'Cerrar sesión' in t, t)
        chk('A5 las iniciales salen del correo', await q.evaluate("document.getElementById('acct-menu-btn').textContent.trim()==='A'"))
        await q.click('#acct-menu [data-action="cloud-signout"]'); await q.wait_for_timeout(400)
        chk('A6 cerrar sesión limpia la sesión y cierra el menú', await q.evaluate("!FP.app.state.cloud.session && document.getElementById('acct-menu').hidden"))
        # --- Narrativa: Cohere bajo el resumen
        await q.goto(u + '#narrativa'); await q.reload(); await q.wait_for_timeout(800)
        order = await q.evaluate("[...document.querySelectorAll('#view-narrativa > section .panel__body')].map(e=>e.id)")
        chk('N1 el panel de Cohere va justo después del resumen', order[:4] == ['nx-controls', 'nx-summary', 'nx-ai', 'nx-sections'], order)
        chk('N2 sin redacción de Cohere el panel no se ve', await q.evaluate("document.getElementById('nx-ai').closest('section').hidden"))
        await q.evaluate("""()=>{FP.app.state.nx.ai={status:'ok',result:{summary:'Resumen IA',narrative:'Uno\\n\\nDos',missingInfo:[]}};FP.narrativeView.render(FP.app.state)}""")
        chk('N3 con redacción el panel aparece', await q.evaluate("!document.getElementById('nx-ai').closest('section').hidden && document.getElementById('nx-ai').innerText.includes('Resumen IA')"))
        # --- Diagnóstico: botón junto a Hipótesis
        async def load(kind, name, text):
            await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{kind}"]', state='attached')
            await q.set_input_files(f'input[data-action="pick-files"][data-type="{kind}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length===0", timeout=120000); await q.wait_for_timeout(500)
        await load('plan', 'plan.csv', await q.evaluate("FP.mockCsv.get('gen-plan-2026').text()"))
        await load('actual', 'real.csv', await q.evaluate("FP.mockCsv.get('gen-actual-sep').text()"))
        await q.goto(u + '#diagnostico'); await q.reload(); await q.wait_for_timeout(2500)
        d = await q.evaluate("""()=>{const s=document.querySelector('#dx-hyps .subhead');const b=s&&s.querySelector('[data-action="dx-ai"]');
          return {inHead:!!b, tip:!!(s&&s.querySelector('.help-dot[title]')), pill:!!(s&&s.querySelector('.pill,.ds-badge,[class*=pill]')), old:document.getElementById('dx-confidence').innerText.includes('Hipótesis con Cohere'),
          btnCount:document.querySelectorAll('[data-action="dx-ai"]').length, hint:document.getElementById('dx-hyps').innerText.includes('Cohere solo recibe')}}""")
        chk('D1 el botón está en el encabezado de Hipótesis, con estado y tooltip', d['inHead'] and d['tip'] and d['pill'], d)
        chk('D2 el bloque viejo desapareció y el texto largo ya no está a la vista', not d['old'] and d['btnCount'] == 1 and not d['hint'], d)
        chk('D3 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
