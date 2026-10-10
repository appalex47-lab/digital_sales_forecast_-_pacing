"""Fase 2 · marco global limpio: sin distintivo de fase en el encabezado (pasa al pie), «Siguiente paso» con el nombre de adonde lleva,
advertencia de datos mostrada una sola vez. Uso: python3 batch_marco.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
        u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        for v in ['inicio', 'pacing', 'diagnostico', 'recovery', 'carga']:
            await q.goto(u + '#' + v); await q.wait_for_timeout(700)
            n = await q.evaluate("document.querySelectorAll('.phase-tag, [data-bind=\"app-phase\"]').length"); chk(f'M1 {v}: ya no hay distintivo de fase en el encabezado', n == 0, n)
        foot = await q.evaluate("document.getElementById('app-footer').textContent"); chk('M2 la fase sigue visible en el pie (el dato no se pierde)', 'Fase 9.1.x' in foot and 'versión' in foot, foot)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(900)
        ns = await q.evaluate("(()=>{const e=document.querySelector('.ux-context .next-step'); if(!e) return null; return {label:e.querySelector('strong').textContent.trim(), view:e.querySelector('button').dataset.view}})()")
        ok = ns is None or (ns['view'] != 'pacing' and (ns['label'] != 'Monitorear' or ns['view'] == 'pacing'))
        chk('M3 «Siguiente paso» nunca se llama «Monitorear» si lleva a otra pantalla, ni apunta a la pantalla actual', ok, ns)
        if ns:
            nav = await q.evaluate("document.getElementById('app-nav').textContent.replace(/\\s+/g,' ')")
            chk('M3b el nombre del paso es uno del menú (grupo o pantalla), no un nombre inventado', ns['label'] in nav, (ns, nav[:200]))
        # advertencia de datos: la ficha de estado está en el encabezado y la barra de contexto solo explica y enlaza
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(900)
        w = await q.evaluate("""(()=>{const top=[...document.querySelectorAll('#topbar-status .pill')].map(e=>e.textContent.trim()); const warn=document.querySelector('.ux-context__warn');
          const ctxPills = warn? warn.querySelectorAll('.pill').length : -1; return {top, hasWarn:!!warn, ctxPills, text: warn? warn.textContent.replace(/\\s+/g,' ').trim(): '', link: warn? !!warn.querySelector('a[href=\"#calidad\"]') : false,
          dup: [...document.querySelectorAll('.pill')].filter(e=>/advertencias|no válidos/i.test(e.textContent) && e.offsetParent!==null).length}})()""")
        if w['hasWarn']:
            chk('M4 la advertencia de datos sale una sola vez como ficha (encabezado); la barra de contexto solo explica y enlaza a Calidad', w['ctxPills'] == 0 and w['dup'] == 1 and w['link'] and 'incompletos' in w['text'], w)
        else:
            print('   (sin advertencia de calidad en este dataset; M4 omitida)')
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
