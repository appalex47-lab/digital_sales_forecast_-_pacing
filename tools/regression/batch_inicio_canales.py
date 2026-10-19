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
        for w,h in [(1280,900),(390,844)]:
            c = await b.new_context(viewport={'width': w, 'height': h}); q = await c.new_page(); errs = []
            q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
            await q.goto(U + '#inicio'); await q.wait_for_timeout(800)
            await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            await seed(q)
            await q.goto(U + '#inicio'); await q.wait_for_timeout(1200)
            await q.evaluate("""()=>{const o=FP.attentionEngine.evaluate;FP.attentionEngine.evaluate=function(i){
              if(i.channel==='total'&&i.summary){i.summary={...i.summary,channels:{status:'ok',rows:[
              {id:'whatsapp',label:'WhatsApp',state:'ok',pacing:'below',compliance:0.8,actual:5e4,forecastGapPct:-0.2},
              {id:'ecommerce',label:'Ecommerce',state:'ok',pacing:'on_plan',compliance:1.0,actual:9e5,forecastGapPct:-0.08},
              {id:'app',label:'App',state:'ok',pacing:'above',compliance:1.05,actual:3e5,forecastGapPct:0.03}]}};}
              return o.call(this,i);};}""")
            await q.goto(U + '#pacing'); await q.wait_for_timeout(800); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
            r = await q.evaluate("""()=>({step:(document.getElementById('nbs')||{dataset:{}}).dataset.step,
              chans:[...document.querySelectorAll('#nbs .nbs__chans li')].map(e=>e.dataset.chan),
              overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})""")
            print(w, r)
            chk(f'M1 [{w}] sin errores y sin scroll horizontal', not errs and not r['overflow'], (errs, r))
            chk(f'M0 [{w}] Total digital lista los 2 canales en problema (no solo uno)', r['chans']==['whatsapp','ecommerce'], r)
            if r['step']=='review_channel' and len(r['chans'])>=2:
                await q.click('#nbs .nbs__chans li:nth-child(2) button'); await q.wait_for_timeout(800)
                chk(f'M2 [{w}] el botón del 2.º canal abre Pacing con ese canal', await q.evaluate("location.hash.includes('pacing')"), await q.evaluate('location.hash'))
            await c.close()
        await b.close()
    print('FALLAS:', len(fails))
asyncio.run(main())
