"""«Resultados e historial» (propuesta B, etapa POST): evaluación con venta ficticia, cuatro conceptos, cortes, historial filtrable, CSV. Uso: python3 batch_resultados.py <raiz>"""
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
U = f'http://127.0.0.1:{port}/index.html'
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700)
        tabs = await q.evaluate("[...document.querySelectorAll('[data-action=\"pm-tab\"]')].map(b=>b.textContent.trim())")
        chk('R1 cinco pestañas, Resultados e historial al final', len(tabs) == 5 and tabs[-1].startswith('Resultados e historial'), tabs)
        await q.click('[data-action="pm-tab"][data-tab="resultados"]'); await q.wait_for_timeout(400)
        t = await body(q)
        chk('R2 sin datos ni promociones lo dice', 'Todavía no hay datos de producto' in t and 'Historial de promociones' in t, t[:300])
        await q.evaluate("""(async()=>{
          const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-09-30', skus: 60 });
          const s1 = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' }); const r1 = await FP.productImport.process(s1, {}); await FP.productStore.commit(r1.draft, { fileName: 'venta.csv' });
        })()""")
        r = await q.evaluate("""(()=>{
          const S = FP.app.state, reg = S.pm.reg, P = FP.promotions; S.pm.actor = 'Persona A';
          const skus = FP.productStore.catalog.list.slice(0, 3).map(x => x.sku);
          const c = P.createPromotion(reg, { name: 'Demo resultados', createdBy: 'Persona A', plannedStart: '2026-09-15', plannedEnd: '2026-09-21', channel: 'ecommerce' }, { year: 2026 });
          const id = c.promotion.promoId; skus.forEach(k => P.addSku(reg, id, { sku: k, origin: 'digital', mechanic: '3+1' }, 'Persona A'));
          const out = [P.setStatus(reg, id, 'proposed', { by: 'Persona A' }), P.setStatus(reg, id, 'approved', { by: 'Persona B', approvedBy: 'Persona B' }), P.setStatus(reg, id, 'published', { by: 'Persona B' })].map(x => x.ok || x.error);
          skus.forEach(k => P.updateSku(reg, id, k, { realStart: '2026-09-15', realEnd: '2026-09-21' }, 'Persona A'));
          P.addActivation(reg, id, { space: 'banner', start: '2026-09-15', end: '2026-09-21', owner: 'Persona A' }, 'Persona A');
          FP.app.render(); return { id, out, skus };
        })()""")
        chk('R3 promoción de prueba publicada', all(x is True for x in r['out']), r)
        await q.wait_for_timeout(300)
        await q.select_option('#rs-promo', r['id']); await q.wait_for_timeout(200)
        await q.click('[data-action="rs-run"]'); await q.wait_for_timeout(4000)
        res = await q.evaluate("FP.app.state.rs.result")
        chk('R4 calcula y deja los SKU evaluables', res and res['counts']['evaluable'] >= 1, res and res.get('counts'))
        t = await body(q)
        chk('R5 muestra los cuatro conceptos', all(k in t for k in ['Crecimiento observado', 'Cumplimiento del objetivo', 'Venta incremental estimada', 'Efecto causal demostrado']), t[:400])
        chk('R6 dice no demostrado y, sin campaña, no inventa un objetivo', 'No demostrado' in t and 'Sin campaña' in t and 'Cumplimiento del objetivo' in t)
        chk('R7 cifras rotuladas como estimadas o reales', 'Estimado' in t and 'real' in t.lower())
        chk('R8 avisa inventario y falta de control', 'Inventario no verificado' in t and 'No hay grupo de control' in t)
        # coherencia: el total durante es la suma de los SKU evaluados
        tot = await q.evaluate("(()=>{const r=FP.app.state.rs.result;return [r.totals.actual.revenue, r.items.filter(i=>i.status==='ok').reduce((a,i)=>a+i.actual.revenue,0)]})()")
        chk('R9 el total coincide con la suma por SKU', abs(tot[0] - tot[1]) < 0.01, tot)
        # venta durante coincide con la agregación directa del almacén
        direct = await q.evaluate("""(async()=>{ const r=FP.app.state.rs.result; const it=r.items.find(i=>i.status==='ok'); const m=await FP.productStore.aggregate({from:'2026-09-15',to:'2026-09-21',channel:'ecommerce',groupBy:'sku'}); const f=FP.productStore.finalize(m.get(it.sku)); return [it.actual.revenue, f.revenue.value]; })()""")
        chk('R10 la venta durante coincide con el almacén de productos', abs(direct[0] - direct[1]) < 0.01, direct)
        # guardar corte
        await q.click('[data-action="rs-save"]'); await q.wait_for_timeout(300)
        n1 = await q.evaluate("FP.app.state.pm.reg.promotions[0].evaluations.length")
        chk('R11 guarda un corte', n1 == 1, n1)
        await q.click('[data-action="rs-run"]'); await q.wait_for_timeout(3000); await q.click('[data-action="rs-save"]'); await q.wait_for_timeout(300)
        ev = await q.evaluate("FP.app.state.pm.reg.promotions[0].evaluations.map(e=>e.id)")
        chk('R12 los cortes se agregan, no se reemplazan', ev == ['EV-001', 'EV-002'], ev)
        # sin nombre no guarda
        await q.evaluate("FP.app.state.pm.actor=''; FP.app.render()"); await q.wait_for_timeout(200)
        await q.click('[data-action="rs-run"]'); await q.wait_for_timeout(3000); await q.click('[data-action="rs-save"]'); await q.wait_for_timeout(300)
        chk('R13 sin tu nombre no guarda', await q.evaluate("FP.app.state.pm.reg.promotions[0].evaluations.length") == 2 and 'Escribe tu nombre' in await body(q))
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()"); await q.wait_for_timeout(200)
        async with q.expect_download() as d: await q.click('[data-action="rs-export-csv"]')
        dl = await d.value; txt = open(await dl.path(), encoding='utf-8-sig').read()
        chk('R14 CSV de la evaluación', txt.startswith('Promoción') and len(txt.splitlines()) >= 2 and 'estimada' in txt.splitlines()[0], txt[:200])
        # historial
        t = await body(q)
        chk('R15 el historial lista la promoción con su corte', 'Demo resultados' in t and 'corte' in t.lower())
        await q.evaluate("(()=>{const S=FP.app.state, id=S.pm.reg.promotions[0].promoId; const P=FP.promotions; const a=P.setStatus(S.pm.reg,id,'measuring',{by:'Persona A'}); const b=P.setStatus(S.pm.reg,id,'closed',{by:'Persona A',conclusion:'Funcionó en la cuadrícula; repetir con el mismo precio.',recommendation:'repeat'}); S.rs.result=null; FP.app.render(); return [a.ok||a.error,b.ok||b.error]})()")
        await q.wait_for_timeout(300)
        await q.select_option('#rs-f-rec', 'repeat'); await q.wait_for_timeout(300)
        t = await body(q)
        chk('R16 filtra por recomendación y muestra la conclusión', 'Demo resultados' in t and 'Repetir' in t and 'Funcionó en la cuadrícula' in t, t[-500:])
        await q.select_option('#rs-f-rec', 'stop'); await q.wait_for_timeout(300)
        chk('R17 otro filtro la oculta', 'Ninguna promoción coincide' in await body(q))
        await q.select_option('#rs-f-rec', ''); await q.fill('#rs-f-mech', '3+1'); await q.dispatch_event('#rs-f-mech', 'change'); await q.wait_for_timeout(300)
        chk('R18 filtra por mecánica', 'Demo resultados' in await body(q))
        async with q.expect_download() as d2: await q.click('[data-action="rs-export-history"]')
        dl2 = await d2.value; t2 = open(await dl2.path(), encoding='utf-8-sig').read()
        chk('R19 CSV del historial con conclusión y recomendación', 'Repetir' in t2 and 'Funcionó' in t2 and 'laborator' not in t2.lower(), t2[:300])
        # abrir desde el historial
        await q.fill('#rs-f-mech', ''); await q.dispatch_event('#rs-f-mech', 'change'); await q.wait_for_timeout(200)
        await q.click('[data-action="rs-open"]'); await q.wait_for_timeout(300)
        await q.click('[data-action="rs-run"]'); await q.wait_for_timeout(3000)
        t = await body(q)
        chk('R20 una promoción cerrada se puede reevaluar y muestra su conclusión', 'Funcionó en la cuadrícula' in t and 'Recomendación para la siguiente campaña' in t)
        chk('R21 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('FALLAS:', fails); sys.exit(1 if fails else 0)
