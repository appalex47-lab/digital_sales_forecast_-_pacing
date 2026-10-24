"""Menú lateral con píldoras juntas y botón «Volver arriba» (aparece tras desplazar el 35 % de la pantalla).
Uso: python3 batch_subir_pills.py <raiz>"""
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
    await q.goto(U + '#pacing'); await q.wait_for_timeout(900); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return c, q, errs
VIS = "(()=>{const e=document.getElementById('back-top');if(!e)return null;const s=getComputedStyle(e);const r=e.getBoundingClientRect();return {shown:!e.hidden&&s.display!=='none'&&r.width>0,w:Math.round(r.width),h:Math.round(r.height),right:Math.round(innerWidth-r.right),bottom:Math.round(innerHeight-r.bottom),y:Math.round(scrollY)}})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); allerr = []
        for w, h in ((375, 740), (320, 640)):
            c, q, errs = await setup(b, {'width': w, 'height': h}, True)
            v = await q.evaluate(VIS); chk(f'S-1 [{w}] arriba de la página el botón no se ve', v and not v['shown'], v)
            await q.evaluate(f"window.scrollTo(0,{int(h * 0.30)})"); await q.wait_for_timeout(300)
            v = await q.evaluate(VIS); chk(f'S-2 [{w}] con menos del 35 % de pantalla desplazado sigue oculto', not v['shown'], v)
            await q.evaluate(f"window.scrollTo(0,{int(h * 0.40)})"); await q.wait_for_timeout(300)
            v = await q.evaluate(VIS); chk(f'S-3 [{w}] pasando el 35 % aparece, de 44 px, a la derecha y dentro de pantalla', v['shown'] and v['w'] == 44 and v['h'] == 44 and 8 <= v['right'] <= 24 and v['bottom'] >= 8, v)
            lab = await q.get_attribute('#back-top', 'aria-label'); chk(f'S-4 [{w}] tiene nombre accesible «Volver arriba»', lab == 'Volver arriba', lab)
            await q.evaluate("window.scrollTo(0,99999)"); await q.wait_for_timeout(300)
            await q.click('#back-top')
            try: await q.wait_for_function('window.scrollY <= 2', timeout=8000)   # el desplazamiento es suave: con la máquina ocupada tarda más de 1.2 s (antes fallaba a ratos)
            except Exception: pass
            await q.wait_for_timeout(400)
            v = await q.evaluate(VIS); chk(f'S-5 [{w}] al tocarlo regresa arriba y se oculta', v['y'] <= 2 and not v['shown'], v)
            await q.evaluate(f"window.scrollTo(0,{int(h * 0.6)})"); await q.wait_for_timeout(300)
            await q.click('.menu-toggle'); await q.wait_for_timeout(500)
            v = await q.evaluate(VIS); chk(f'S-6 [{w}] con el menú abierto el botón no se ve', not v['shown'], v)
            g = await q.evaluate("""(()=>{const l=[...document.querySelectorAll('#snav-pills .hstatus__link')];const r=l.map(e=>{const k=e.firstElementChild||e;const b=k.getBoundingClientRect(),a=e.getBoundingClientRect();return {t:b.top,b:b.bottom,h:Math.round(a.height)}});
              const m=document.querySelector('.snav__mode').getBoundingClientRect();const pb=document.getElementById('snav-pills').getBoundingClientRect();return {n:l.length,gap:r.length>1?Math.round(r[1].t-r[0].b):null,hs:r.map(x=>x.h),toMode:Math.round(m.top-pb.bottom),sw:document.documentElement.scrollWidth-innerWidth}})()""")
            chk(f'S-7 [{w}] las dos píldoras de estado quedan juntas (≤ 12 px entre ellas) y con área táctil de 44 px', g['n'] == 2 and g['gap'] is not None and g['gap'] <= 12 and all(x >= 44 for x in g['hs']), g)
            chk(f'S-8 [{w}] sin scroll horizontal', g['sw'] <= 0, g)
            allerr += errs; await c.close()
        c, q, errs = await setup(b, {'width': 1280, 'height': 800}, False)
        await q.evaluate("window.scrollTo(0,600)"); await q.wait_for_timeout(300)
        v = await q.evaluate(VIS); chk('S-9 [1280] en escritorio el botón no aparece', v is None or not v['shown'], v)
        allerr += errs; await c.close()
        chk('E-1 sin errores JavaScript', not allerr, allerr[:3])
        await b.close()
    print('\nFALLAS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
