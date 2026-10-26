"""Promociones: filtros plegados, columna Mecánica oculta, conteo de acciones sugeridas y eliminar ofertas/promociones (con motivo, registro y deshacer).
Uso: python3 batch_promos_eliminar.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:600] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
U = f'http://127.0.0.1:{port}/index.html'
READY = "window.FP && FP.app && FP.app.state && !document.getElementById('boot')"
async def ev(q, js, *a): return await q.evaluate(js, *a) if a else await q.evaluate(js)
async def txt(q, sel): return await q.evaluate("(s)=>(document.querySelector(s)||{innerText:''}).innerText", sel)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1400, 'height': 900})
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#promociones'); await q.wait_for_function(READY, timeout=60000)
        await ev(q, "document.querySelectorAll('dialog').forEach(d=>d.remove())"); await q.wait_for_timeout(800)
        await ev(q, "FP.app.state.pm.actor='Persona A'; FP.app.render()")
        await q.click('[data-action="dm-load"]')
        for _ in range(240):
            if 'Cargando' not in (await ev(q, "(FP.app.state.sm.msg||{}).text||''")): break
            await q.wait_for_timeout(500)
        await ev(q, "FP.app.state.pm.reg.promotions=[]; FP.app.state.pm.tab='ofertas'; FP.app.render()"); await q.wait_for_timeout(1500)
        # 1. Filtros y columnas plegados
        chk('C1 los filtros vienen plegados: solo búsqueda, «Filtros» y «Columnas»', await ev(q, "!document.getElementById('of-f-state') && !!document.getElementById('of-f-q') && !!document.querySelector('[data-fold=\"filters\"]') && !!document.querySelector('[data-fold=\"cols\"]')"))
        heads = await ev(q, "[...document.querySelectorAll('.pm-wide thead th')].map(t=>t.innerText.trim())")
        chk('C2 la columna Mecánica va oculta por defecto', 'Mecánica' not in heads and '% desc.' in heads, heads)
        await q.click('[data-fold="cols"]'); await q.wait_for_timeout(200)
        await q.click('[data-col="mech"]'); await q.wait_for_timeout(300)
        heads = await ev(q, "[...document.querySelectorAll('.pm-wide thead th')].map(t=>t.innerText.trim())")
        chk('C3 «Columnas» la vuelve a mostrar', 'Mecánica' in heads, heads)
        chk('C4 la preferencia se recuerda en este navegador', await ev(q, "JSON.parse(localStorage.getItem('rn.ofCols')).mech") is True)
        await q.click('[data-col="mech"]'); await q.wait_for_timeout(200)
        await q.click('[data-fold="filters"]'); await q.wait_for_timeout(200)
        chk('C5 «Filtros» abre estado, laboratorio, categoría y alertas', await ev(q, "['of-f-state','of-f-lab','of-f-cat','of-f-issue'].every(i=>!!document.getElementById(i))"))
        await q.select_option('#of-f-state', 'received'); await q.wait_for_timeout(300)
        chips = await txt(q, '.gd-chiprow')
        chk('C6 el filtro puesto sale como chip con «Quitar todos»', 'Estado' in chips and 'Quitar todos' in chips, chips)
        await q.click('[data-action="of-clear"][data-key="all"]'); await q.wait_for_timeout(300)
        chk('C7 «Quitar todos» limpia los filtros', await ev(q, "Object.keys(FP.app.state.of.f).filter(k=>FP.app.state.of.f[k]).length") == 0)
        # 2. Conteo de acciones sugeridas
        rows = await ev(q, "[...document.querySelectorAll('.gd-act tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())")
        print('acciones:', rows[:4])
        chk('A1 hay una fila por acción sugerida con su número de SKU', len(rows) >= 1 and all(any(ch.isdigit() for ch in r) for r in rows))
        tot = await ev(q, "Number(document.querySelector('.gd-act tfoot .num').innerText)"); acts = await ev(q, "FP.guide.actionCounts(FP.activationView.recs(FP.app.state),'offer').total")
        chk('A2 el total coincide con el motor', tot == acts, (tot, acts))
        first = await ev(q, "document.querySelector('.gd-act [data-action=\"gd-act\"]').dataset.label"); nfirst = await ev(q, "Number(document.querySelector('.gd-act tbody tr .num').innerText)")
        await q.click('.gd-act [data-action="gd-act"]'); await q.wait_for_timeout(300)
        shown = await ev(q, "document.querySelectorAll('.pm-wide tbody tr').length")
        chk('A3 «Ver» filtra la tabla por esa acción', shown >= 1 and 'Acción' in await txt(q, '.gd-chiprow'), (first, shown, nfirst))
        await q.click('[data-action="of-check-all"]'); await q.wait_for_timeout(200)
        marked = await ev(q, "Object.keys(FP.app.state.of.checked).length")
        chk('A4 «Marcar las visibles» solo marca las del filtro', marked == shown, (marked, shown))
        await q.click('[data-action="of-check-none"]'); await q.click('.gd-act [data-action="gd-act"]'); await q.wait_for_timeout(200)
        chk('A5 «Quitar filtro» devuelve todas', 'Acción' not in await txt(q, '.gd-chiprow'))
        # 3. Eliminar ofertas marcadas
        ids = await ev(q, "FP.app.state.of.reg.offers.filter(o=>o.state==='received').slice(0,2).map(o=>o.offerId)")
        n0 = await ev(q, "FP.app.state.of.reg.offers.length")
        for i in ids: await ev(q, "(i)=>{FP.app.state.of.checked[i]=true}", i)
        await ev(q, "FP.app.render()")
        await q.click('[data-action="rm-offers-ask"][data-kind="marked"]'); await q.wait_for_timeout(300)
        cf = await txt(q, '#rm-confirm')
        chk('R1 pide confirmar con la cuenta y aclara que eliminar no es descartar', 'Se eliminarán 2 ofertas' in cf and 'descartar' in cf.lower(), cf[:200])
        await q.click('[data-action="rm-confirm"]'); await q.wait_for_timeout(300)
        chk('R2 sin motivo no elimina', await ev(q, "FP.app.state.of.reg.offers.length") == n0 and 'motivo' in (await txt(q, '#pm-body')).lower())
        await q.fill('#rm-reason', 'Archivo cargado por error'); await q.click('[data-action="rm-confirm"]'); await q.wait_for_timeout(300)
        chk('R3 con motivo elimina las 2 y deja «Deshacer»', await ev(q, "FP.app.state.of.reg.offers.length") == n0 - 2 and await ev(q, "!!document.querySelector('.gd-toast [data-action=\"gd-undo\"]')"))
        chk('R4 queda una línea en el registro', await ev(q, "FP.app.state.rm.log.entries.length") == 1 and await ev(q, "FP.app.state.rm.log.entries[0].reason") == 'Archivo cargado por error')
        await q.click('[data-action="gd-undo"]'); await q.wait_for_timeout(300)
        chk('R5 deshacer devuelve las ofertas y quita la línea del registro', await ev(q, "FP.app.state.of.reg.offers.length") == n0 and await ev(q, "FP.app.state.rm.log.entries.length") == 0)
        # 4. Una Seleccionada no se elimina, y se dice por qué
        sel = await ev(q, "(FP.app.state.of.reg.offers.find(o=>o.state==='selected')||{}).offerId || ''")
        if sel:
            await ev(q, "(i)=>{FP.app.state.of.checked={}; FP.app.state.of.checked[i]=true; FP.app.render()}", sel)
            await q.click('[data-action="rm-offers-ask"][data-kind="marked"]'); await q.wait_for_timeout(300)
            cf = await txt(q, '#rm-confirm')
            chk('R6 una Seleccionada no se elimina y lo explica', 'No hay ninguna que se pueda eliminar' in cf and 'en promoci' in cf, cf[:200])
            await q.click('[data-action="rm-cancel"]')
        # 5. Eliminar un archivo completo
        await q.click('[data-fold="batches"]'); await q.wait_for_timeout(200)
        nb = await ev(q, "FP.app.state.of.reg.batches.length")
        chk('B1 «Archivos recibidos» viene plegado y se abre', nb >= 1 and await ev(q, "!!document.querySelector('[data-action=\"rm-offers-ask\"][data-kind=\"batch\"]')"))
        await q.click('[data-action="rm-offers-ask"][data-kind="batch"]'); await q.wait_for_timeout(300)
        cf = await txt(q, '#rm-confirm'); print('archivo:', cf[:220].replace('\n', ' | '))
        chk('B2 muestra cuántas se eliminan y cuáles no', 'Eliminar' in cf and ('no se' in cf or 'Se eliminar' in cf))
        await q.click('[data-action="rm-cancel"]')
        # 6. Eliminar una promoción en borrador y deshacer
        pid = await ev(q, "FP.promotions.createPromotion(FP.app.state.pm.reg,{name:'Prueba eliminar',createdBy:'Persona A'}).promotion.promoId")
        await ev(q, "(i)=>{FP.app.state.pm.tab='promos'; FP.app.state.pm.sel=i; FP.app.render()}", pid); await q.wait_for_timeout(400)
        chk('D1 el detalle de un borrador ofrece «Eliminar…»', await ev(q, "!!document.querySelector('[data-action=\"rm-promo-ask\"]')"))
        await q.click('[data-action="rm-promo-ask"]'); await q.wait_for_timeout(300)
        cf = await txt(q, '#rm-confirm')
        chk('D2 la confirmación avisa que el identificador no se reutiliza', 'no se vuelve a usar' in cf and 'Prueba eliminar' in cf, cf[:200])
        await q.fill('#rm-reason', 'Creada por error'); await q.click('[data-action="rm-confirm"]'); await q.wait_for_timeout(300)
        chk('D3 elimina la promoción y retira su identificador', await ev(q, "!FP.promotions.find(FP.app.state.pm.reg, arguments[0] || '')") if False else not await ev(q, "(i)=>!!FP.promotions.find(FP.app.state.pm.reg,i)", pid) if False else await ev(q, "(i)=>!FP.promotions.find(FP.app.state.pm.reg,i) && FP.app.state.pm.reg.retired.includes(i)", pid))
        await q.click('[data-action="gd-undo"]'); await q.wait_for_timeout(300)
        chk('D4 deshacer la restaura', await ev(q, "(i)=>!!FP.promotions.find(FP.app.state.pm.reg,i)", pid))
        # una aprobada no
        await ev(q, "(i)=>{const p=FP.promotions.find(FP.app.state.pm.reg,i);p.plannedStart='2026-11-01';p.plannedEnd='2026-11-10';FP.promotions.addSku(FP.app.state.pm.reg,i,{sku:'ZZ1',name:'z',origin:'digital',reason:'r'},'Persona A');FP.promotions.setStatus(FP.app.state.pm.reg,i,'proposed',{by:'Persona A'});FP.promotions.setStatus(FP.app.state.pm.reg,i,'approved',{by:'Persona B',approvedBy:'Persona B'});FP.app.render()}", pid)
        await q.wait_for_timeout(300)
        chk('D5 una aprobada también ofrece eliminar', await ev(q, "!!document.querySelector('[data-action=\"rm-promo-ask\"]')"))
        await q.click('[data-action="rm-promo-ask"]'); await q.wait_for_timeout(300)
        chk('D5b aviso reforzado y casilla de confirmación', await ev(q, "!!document.getElementById('rm-ack')") and 'ya avanzó' in await txt(q, '#rm-confirm'))
        await q.fill('#rm-reason', 'Ya no va'); await q.click('[data-action="rm-confirm"]'); await q.wait_for_timeout(300)
        chk('D5c sin marcar la casilla no se elimina', await ev(q, "(i)=>!!FP.promotions.find(FP.app.state.pm.reg,i)", pid))
        await q.check('#rm-ack'); await q.click('[data-action="rm-confirm"]'); await q.wait_for_timeout(300)
        chk('D5d con la casilla se elimina', await ev(q, "(i)=>!FP.promotions.find(FP.app.state.pm.reg,i)", pid))
        # 7. Registro visible
        await ev(q, "FP.app.state.pm.tab='resultados'; FP.app.render()"); await q.wait_for_timeout(600)
        chk('G1 el registro de eliminaciones se ve en Resultados e historial', 'Registro de eliminaciones' in await txt(q, '#pm-body'))
        # 8. Oportunidades: conteo
        await q.click('#pmtab-oportunidades')
        for _ in range(40):
            if await ev(q, "!!FP.app.state.op.result || !!FP.app.state.op.msg"): break
            await q.wait_for_timeout(500)
        await q.wait_for_timeout(500)
        chk('O1 Oportunidades también cuenta SKU por acción', await ev(q, "document.querySelectorAll('.gd-act tbody tr').length") >= 1)
        if await ev(q, "!!document.querySelector('.gd-act [data-action=\"gd-act\"]')"):
            await q.click('.gd-act [data-action="gd-act"]'); await q.wait_for_timeout(300)
            chk('O2 «Ver» filtra las oportunidades', await ev(q, "!!FP.app.state.op.f.action"))
        # 9. Móvil
        await q.set_viewport_size({'width': 390, 'height': 800}); await ev(q, "FP.app.state.pm.tab='ofertas'; FP.app.render()"); await q.wait_for_timeout(600)
        chk('M1 en 390 px no hay desborde horizontal de la página', await ev(q, "document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 1)
        chk('E0 sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print('\nFallas:', fails if fails else 'ninguna'); sys.exit(1 if fails else 0)
asyncio.run(main())
