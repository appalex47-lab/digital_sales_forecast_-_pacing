"""Total digital: aviso de días excluidos por canal faltante y cuadre contra la suma del archivo. Uso: python3 batch_dias_excluidos.py <raiz>"""
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
        async def load(kind, name, text):
            await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{kind}"]', state='attached')
            await q.set_input_files(f'input[data-action="pick-files"][data-type="{kind}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length===0", timeout=120000); await q.wait_for_timeout(500)
        plan = await q.evaluate("FP.mockCsv.get('gen-plan-2026').text()")
        act = await q.evaluate("FP.mockCsv.get('gen-actual-sep').text()")
        lines = [l for l in act.split('\n') if l.strip()]
        head = lines[0].split(','); ic = head.index('canal') if 'canal' in head else 1; iv = head.index('venta') if 'venta' in head else 2
        target = next(l for l in lines[1:] if l.split(',')[ic].lower().startswith('llam'))
        date = target.split(',')[0]
        others = sum(float(l.split(',')[iv]) for l in lines[1:] if l.split(',')[0] == date and l is not target and not l.split(',')[ic].lower().startswith('llam'))
        await load('plan', 'plan.csv', plan); await load('actual', 'real.csv', '\n'.join(l for l in lines if l is not target) + '\n')
        await q.goto(u + '#inicio'); await q.reload(); await q.wait_for_timeout(2000)
        e = await q.evaluate("(()=>{const e=document.querySelector('[data-excluded]');return e?{d:+e.dataset.excluded,r:+e.dataset.excludedRevenue,t:e.innerText}:null})()")
        chk('X1 aparece el aviso con 1 día excluido', bool(e) and e['d'] == 1, e)
        chk('X2 el monto excluido es la venta de los demás canales de ese día', bool(e) and abs(e['r'] - others) < 1, (e, others))
        total_file = sum(float(l.split(',')[iv]) for l in lines[1:] if l is not target)
        shown = await q.evaluate("(()=>{const e=document.querySelector('[data-key-real]');return +e.innerText.replace(/[^0-9.]/g,'')})()")
        chk('X3 venta mostrada + excluido = suma del archivo', abs(shown + (e or {}).get('r', 0) - total_file) < 2, (shown, e, total_file))
        await load('actual', 'real2.csv', act)
        await q.goto(u + '#inicio'); await q.reload(); await q.wait_for_timeout(2000)
        chk('X4 con los cuatro canales completos no hay aviso', await q.evaluate("!document.querySelector('[data-excluded]')"))
        chk('X5 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
