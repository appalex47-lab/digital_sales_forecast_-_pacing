"""Compara la geometría (posición/ancho relativos) de elementos entre dos raíces. Uso: python3 geom.py <base> <nuevo> <vista> <selector>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
A,B,VIEW,SEL=os.path.abspath(sys.argv[1]),os.path.abspath(sys.argv[2]),sys.argv[3],sys.argv[4]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
def serve(root):
    h=functools.partial(Q,directory=root);socketserver.TCPServer.allow_reuse_address=True
    s=socketserver.ThreadingTCPServer(('127.0.0.1',0),h);threading.Thread(target=s.serve_forever,daemon=True).start();return s.server_address[1]
JS="""(sel)=>[...document.querySelectorAll(sel)].map(e=>{const p=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return [+((r.left-p.left)/p.width).toFixed(3),+(r.width/p.width).toFixed(3)]})"""
async def grab(p,root):
    port=serve(root);b=await p.chromium.launch(args=['--no-sandbox']);q=await b.new_page(viewport={'width':1280,'height':900})
    await q.goto(f'http://127.0.0.1:{port}/index.html#resumen');await q.click('[data-action="generate-mock"]');await q.wait_for_timeout(1300)
    try:await q.click('[data-action="sample-targets"]',timeout=1500);await q.wait_for_timeout(400)
    except Exception:pass
    await q.goto(f'http://127.0.0.1:{port}/index.html#plan');await q.wait_for_timeout(600)
    for a in['plan-preview','plan-save']:
        try:await q.click(f'[data-action="{a}"]',timeout=2000);await q.wait_for_timeout(800)
        except Exception:pass
    await q.goto(f'http://127.0.0.1:{port}/index.html#{VIEW}');await q.wait_for_timeout(900)
    r=await q.evaluate(JS,SEL);await b.close();return r
async def main():
    async with async_playwright() as p:
        a=await grab(p,A);b=await grab(p,B)
    ok=a==b and len(a)>0;print(('✔' if ok else '✘'),f'geometría {SEL}: {len(a)} elementos',a if not ok else '',b if not ok else '');sys.exit(0 if ok else 1)
asyncio.run(main())
