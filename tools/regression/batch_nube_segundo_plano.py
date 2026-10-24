"""Cuenta y nube en segundo plano: la operación sigue al cambiar de pantalla, se ve una píldora con el avance en cualquier vista,
no redibuja la pantalla ajena, avisa el resultado al terminar y pide confirmación si se intenta cerrar la pestaña a medias.
Usa una función de «borrar copia» simulada (sin red). Uso: python3 batch_nube_segundo_plano.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
PILL = "(()=>{const e=document.getElementById('bg-task'); if(!e||e.hidden) return null; const r=e.getBoundingClientRect(); return {t:e.querySelector('.bg-task__txt').textContent,p:e.querySelector('.bg-task__pct').textContent,w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),bottom:Math.round(innerHeight-r.bottom)}})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for W, H in ((1280, 800), (360, 740)):
            ctx = await b.new_context(viewport={'width': W, 'height': H}); q = await ctx.new_page(); errs = []
            q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.goto(f'http://127.0.0.1:{port}/index.html#ajustes'); await q.wait_for_function("window.FP && FP.app && FP.app.state && !document.getElementById('boot')", timeout=60000); await q.wait_for_timeout(500)
            await q.evaluate("""()=>{window.confirm=()=>true; window.__go=null; FP.cloud.remove=(o)=>new Promise(res=>{window.__go=()=>{}; let i=0; const n=4; const t=setInterval(()=>{i++; o.onProgress({index:i,of:n}); if(i===n){clearInterval(t); res({ok:true});}},1100);});}""")
            await q.evaluate("FP.app.state.stTab='cuenta'; location.hash='ajustes'"); await q.wait_for_timeout(500)
            tag = f'[{W}] '
            chk(tag + 'antes de empezar no hay píldora', await q.evaluate(PILL) is None)
            await q.evaluate("setTimeout(()=>FP.app.actions['cloud-delete'](),0)"); await q.wait_for_timeout(300)
            chk(tag + 'en Cuenta el avance grande está a la vista y la píldora no estorba', await q.evaluate(PILL) is None and await q.evaluate("!!document.getElementById('cloud-progress')"))
            await q.evaluate("location.hash='inicio'"); await q.wait_for_timeout(900)
            await q.evaluate("document.querySelector('#view-inicio h2, #view-inicio h1, #view-inicio .panel').__marca=1")
            v = await q.evaluate(PILL); chk(tag + 'en otra vista aparece la píldora con el avance', bool(v) and 'Borrando' in v['t'] and v['p'].endswith('%'), v)
            chk(tag + 'cabe en pantalla, abajo a la izquierda y mide ≥44 px de alto', bool(v) and v['left'] >= 8 and v['bottom'] >= 8 and v['h'] >= 44 and v['left'] + v['w'] <= W, v)
            prev = await q.evaluate(PILL); await q.wait_for_timeout(1500); cur = await q.evaluate(PILL)
            chk(tag + 'el porcentaje avanza mientras estás en otra vista', bool(prev) and bool(cur) and int(cur['p'].split()[0]) > int(prev['p'].split()[0]), (prev, cur))
            chk(tag + 'el avance no redibuja la pantalla en la que estás', await q.evaluate("!!document.querySelector('#view-inicio h2, #view-inicio h1, #view-inicio .panel').__marca"))
            ev = await q.evaluate("(()=>{const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented})()")
            chk(tag + 'cerrar la pestaña a medias pide confirmación', ev is True)
            await q.evaluate("location.hash='diagnostico'"); await q.wait_for_timeout(300)
            chk(tag + 'la píldora sigue al cambiar a otra vista más', await q.evaluate(PILL) is not None)
            await q.wait_for_function("FP.app.state.cloud.busy===false", timeout=15000); await q.wait_for_timeout(400)
            chk(tag + 'al terminar la píldora desaparece', await q.evaluate(PILL) is None)
            chk(tag + 'al terminar avisa el resultado desde la otra vista', await q.evaluate("(()=>{const t=document.getElementById('toast'); return t.classList.contains('is-visible') && /Copia de la nube eliminada/.test(t.textContent)})()"))
            ev = await q.evaluate("(()=>{const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented})()")
            chk(tag + 'ya sin operación, cerrar no pregunta', ev is False)
            chk(tag + 'sin errores de página', not errs, errs[:2]); await ctx.close()
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
