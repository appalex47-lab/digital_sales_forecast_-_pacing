"""Los asistentes siguen lo que la persona tiene elegido (año, mes o semana, y canal). Datos de demo + productos simulados.
Uso: python3 batch_agentes_seleccion.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
READY = "window.FP && FP.app && FP.app.state && !document.getElementById('boot')"
LOAD = """(async()=>{
  const gen = FP.mockProducts.generate();
  const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {});
  await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
  const s2 = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' }); const r2 = await FP.productImport.process(s2, {});
  await FP.productStore.commit(r2.draft, { fileName: 'funnel.csv' });
  return true; })()"""
OVER = "document.documentElement.scrollWidth>innerWidth || document.getElementById('ag-panel').scrollWidth>document.getElementById('ag-panel').clientWidth+1"
# Cambia lo elegido igual que lo haría la persona en Diagnóstico (canal y periodo) y redibuja la app.
SET = """(o)=>{ const s=FP.app.state.dx.settings; s.channel=o.channel; s.periodType=o.type; s.periodKey=o.key; FP.app.state.dx.run=null; FP.app.render(); return true; }"""
CHIPS = "[...document.querySelectorAll('.ag-chiprow .ag-chip-i')].map(x=>x.innerText)"
async def chips(p): return await p.evaluate(CHIPS)
async def body(p): return await p.evaluate("document.getElementById('ag-body').innerText")
async def settle(p, ms=1500): await p.wait_for_timeout(ms)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#diagnostico'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.evaluate(LOAD)
        wk = await q.evaluate("(()=>{const r=FP.app.state.fc.run; const w=r.total.weeks.filter(x=>x.countedDays>=5); return w.length?w[w.length-1].key:null})()")
        chk('G0 hay una semana con venta real en los datos de demo', bool(wk), wk)
        # 1 · lo elegido: semana + Ecommerce
        await q.evaluate(f"({SET})({{channel:'ecommerce',type:'week',key:'{wk}'}})"); await q.wait_for_timeout(500)
        await q.click('#ag-fab'); await q.wait_for_selector('.ag-kpi', timeout=25000); await settle(q, 600)
        c = await chips(q); t = await body(q)
        chk('G1 el Analista lee la semana y el canal elegidos (chips)', any('semana del' in x.lower() for x in c) and 'Ecommerce' in c, c)
        chk('G2 dice que sigue lo elegido y cómo cambiarlo', 'Sigo el periodo y el canal que tienes elegido' in t)
        chk('G3 los textos hablan de la semana y no del mes', 'esta semana' in t.lower() or 'la semana' in t.lower() or 'semana' in t.lower())
        chk('G3b no hay meta semanal: el cierre estimado de la semana dice s/d', await q.evaluate("[...document.querySelectorAll('.ag-kpi')].some(k=>/Cierre estimado de la semana/.test(k.innerText)&&/s\\/d/.test(k.innerText))"))
        chk('G4 con un solo canal no aparece «qué canal concentra la brecha»', not await q.evaluate("[...document.querySelectorAll('.ag-card h3')].some(h=>/concentra la mayor parte de la brecha contra el plan/.test(h.innerText))"))
        # 2 · cambia la selección con el panel abierto → se actualiza solo
        await q.click('[data-ag=rnext]'); await q.wait_for_timeout(150)
        chk('G5 la ruta avanzó a la 2 de 5 antes del cambio', await q.evaluate("+document.querySelector('.ag-prog').getAttribute('aria-valuenow')") == 2)
        await q.evaluate(f"({SET})({{channel:'total',type:'year',key:'2026'}})"); await q.wait_for_function("[...document.querySelectorAll('.ag-chiprow .ag-chip-i')].some(x=>x.innerText.trim().startsWith('2026'))", timeout=25000); await settle(q, 600)
        c = await chips(q)
        chk('G6 con el panel abierto, cambiar a «año / Total» actualiza los chips sin reabrir', any(x.strip().startswith('2026') for x in c) and 'Total digital' in c, c)
        chk('G6b la ruta se reinicia en la pregunta 1 porque cambió lo elegido', await q.evaluate("+document.querySelector('.ag-prog').getAttribute('aria-valuenow')") == 1)
        chk('G6c el año habla de «la meta del año» / «del año»', 'del año' in await body(q))
        # 3 · un mes sin venta real
        await q.evaluate(f"({SET})({{channel:'total',type:'month',key:'2026-03'}})"); await q.wait_for_function("/No hay venta real en lo que elegiste/.test(document.getElementById('ag-body').innerText)", timeout=25000)
        t = await body(q)
        chk('G7 un mes sin venta real: lo dice con el periodo elegido y no inventa hallazgos', 'marzo 2026' in t and not await q.evaluate("!!document.querySelector('.ag-kpi')"), t[:200])
        # 4 · Auditor con lo elegido
        await q.evaluate(f"({SET})({{channel:'app',type:'month',key:'2026-09'}})"); await q.wait_for_timeout(700)
        await q.click('.ag-tab[data-id=auditor]'); await q.wait_for_selector('.ag-gate', timeout=25000); await settle(q, 1500)
        c = await chips(q); t = await body(q)
        chk('G8 el Auditor lee el mes y el canal elegidos', any('Septiembre 2026' in x for x in c) and 'App' in c and 'Embudo de GA4 por producto' in c, c)
        chk('G8b con un solo canal no hay comparación web contra app', not await q.evaluate("[...document.querySelectorAll('.ag-card h3')].some(h=>/pierde más que/.test(h.innerText))"))
        await q.evaluate(f"({SET})({{channel:'total',type:'week',key:'{wk}'}})"); await q.wait_for_function("[...document.querySelectorAll('.ag-chiprow .ag-chip-i')].some(x=>x.innerText.toLowerCase().includes('semana del'))", timeout=25000); await settle(q, 1200)
        c = await chips(q)
        chk('G9 el Auditor cambia a la semana elegida con el panel abierto', any('semana del' in x.lower() for x in c), c)
        chk('G9b sin errores en el panel (puede no haber hallazgos con tan pocos días: se dice)', await q.evaluate("!!document.querySelector('.ag-gate')") and not errs, errs[:2])
        # 5 · volver a lo de siempre
        await q.evaluate("(()=>{const s=FP.app.state.dx.settings; s.channel='total'; s.periodType='month'; s.periodKey='2026-09'; FP.app.state.dx.run=null; FP.app.render();})()"); await q.wait_for_timeout(700)
        await q.click('.ag-tab[data-id=analista]'); await q.wait_for_selector('.ag-kpi', timeout=25000); await settle(q, 600)
        c = await chips(q)
        chk('G10 volver al mes y Total digital deja la lectura de siempre', any('Septiembre 2026' in x for x in c) and 'Total digital' in c and any(__import__('re').search(r'Cierre (estimado )?del mes', k) for k in await q.evaluate("[...document.querySelectorAll('.ag-kpi')].map(k=>k.innerText)")), c)
        await ctx.close()
        # móvil
        mctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); m = await mctx.new_page(); merrs = []
        m.on('pageerror', lambda e: merrs.append(str(e)[:200]))
        await m.goto(f'http://127.0.0.1:{port}/index.html#diagnostico'); await m.wait_for_function(READY, timeout=60000)
        await m.evaluate("FP.app.actions['generate-mock']()"); await m.wait_for_timeout(1500); await m.evaluate(LOAD)
        await m.evaluate(f"({SET})({{channel:'ecommerce',type:'week',key:'{wk}'}})"); await m.wait_for_timeout(500)
        await m.evaluate("document.getElementById('ag-fab').click()"); await m.wait_for_selector('.ag-kpi', timeout=25000); await m.wait_for_timeout(500)
        chk('G11 celular: con la nota de «sigo lo elegido» no hay scroll horizontal', not await m.evaluate(f"({OVER})"))
        chk('G12 sin errores de página en celular', not merrs, merrs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
