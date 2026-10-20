"""Inicio · «Qué necesita atención» y «Tu siguiente mejor paso» (etapa 1). Uso: python3 batch_atencion.py <raiz>"""
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
async def openref(q):
    """Abre el panel único de fecha/año del encabezado si está cerrado."""
    if not await q.is_visible('#topbar-date'):
        await q.click('#topbar-ref')

async def seed(q):
    await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
    await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
    try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
    except Exception: pass
    await q.goto(U + '#plan'); await q.wait_for_timeout(600)
    for a in ['plan-preview', 'plan-save']:
        try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
        except Exception: pass
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
        await q.goto(U + '#inicio'); await q.wait_for_timeout(800)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await seed(q)
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
        # el acumulado del AÑO queda +33.3 % por encima mientras el MES sigue como esté (caso real: año arriba, mes abajo)
        await q.evaluate("(()=>{const run=FP.app.state.fc.run;[run.total,...Object.values(run.channels)].forEach(s=>{s.annual.toDate.revenue.gapPct=0.333;s.annual.toDate.revenue.gap=1e6;s.annual.toDate.revenue.compliance=1.333;});})()")
        for ch, pt, pk in [('total', 'month', None), ('ecommerce', 'month', None)]:
            await q.evaluate("""([ch,pt])=>{const h=FP.app.state.ux.home;h.channel=ch;h.periodType=pt;FP.app.render()}""", [ch, pt])
            await q.wait_for_timeout(900)
            r = await q.evaluate("""()=>{const f=FP.homeView.periodFigures(FP.app.state);const g=f&&f.p&&f.p.toDate&&f.p.toDate.revenue?f.p.toDate.revenue.gapPct:null;
              const head=[...document.querySelectorAll('main:not([hidden]) .ux-head, main:not([hidden]) [data-own-head], #ux-context')].map(e=>e.innerText).join(' ');
              const m=document.body.innerText.match(/Venta acumulada ([\d.]+) % (por debajo|por encima) del plan/);
              return {g,label:f&&f.label,chip:m?[m[1],m[2]]:null}}""")
            ok = r['g'] is None or (r['chip'] and abs(float(r['chip'][0]) - abs(r['g']) * 100) < 0.06 and (r['chip'][1] == ('por debajo' if r['g'] < 0 else 'por encima')))
            chk(f'C1 [{ch}/{pt}] el chip de Inicio coincide con la brecha del periodo que se ve ({r})', ok, r)
        chk('C2 sin errores de página', not errs, errs)
        await b.close()
    print('FALLAS:', len(fails))
asyncio.run(main())
