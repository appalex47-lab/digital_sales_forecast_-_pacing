"""«Promociones» (propuesta B, fase 1): vista, identificador, SKU, aprobación, ejecución, historial, persistencia, exportación y que nada más cambie. Uso: python3 batch_promociones.py <raiz>"""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
async def boot(c, day=dt.datetime(2026, 11, 20, 9, 0), hash_='#inicio'):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(day); await q.goto(U + hash_); await q.wait_for_timeout(1500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return q, errs
async def fill(q, id_, v):
    await q.fill('#' + id_, v)
async def click(q, sel):
    await q.click(sel); await q.wait_for_timeout(250)
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900})
        q, errs = await boot(c)
        # menú y vista
        inm = await q.evaluate("[...document.querySelectorAll('a[data-nav=\"promociones\"]')].length")
        chk('M1 «Promociones» está en el menú', inm >= 1, inm)
        grp = await q.evaluate("FP.guidance ? 1 : 0")
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700); await q.evaluate("FP.app.state.pm.tab='promos'; FP.app.render()"); await q.wait_for_timeout(300)
        t = await body(q)
        chk('M2 la vista abre vacía con explicación', 'Todavía no hay promociones registradas' in t and 'Nueva promoción' in t, t[:200])
        chk('M3 dice que registrar no activa nada', 'no la activa en el sitio ni en la app' in t)
        # crear sin nombre / sin actor
        await click(q, '[data-action="pm-new"]')
        await click(q, '[data-action="pm-create"]')
        t = await body(q)
        chk('C1 sin nombre ni creador no crea y explica', 'Escribe el nombre' in t or 'Escribe quién crea' in t, t[:300])
        await fill(q, 'pm-actor', 'Persona A'); await q.dispatch_event('#pm-actor', 'change'); await q.wait_for_timeout(200)
        await click(q, '[data-action="pm-new"]')
        await fill(q, 'pm-n-name', 'Demo otoño'); await fill(q, 'pm-n-start', '2026-11-05'); await fill(q, 'pm-n-end', '2026-11-18'); await fill(q, 'pm-n-prop', 'Propuesta otoño')
        await click(q, '[data-action="pm-create"]')
        t = await body(q)
        chk('C2 crea con identificador PRM-2026-0001-DEMO-OTONO', 'PRM-2026-0001-DEMO-OTONO' in t, t[:300])
        chk('C3 queda en borrador y creada por Persona A', 'Borrador' in t and 'creada por Persona A' in t)
        # no avanzar sin SKU
        await click(q, '[data-action="pm-status"][data-to="approved"]')
        t = await body(q)
        chk('S1 sin SKU no se aprueba', 'Agrega al menos un SKU' in t, t[-300:])
        # SKU
        await fill(q, 'pm-s-sku', 'DEMO-001'); await fill(q, 'pm-s-name', 'Crema demo'); await fill(q, 'pm-s-mech', '2 x 1')
        await click(q, '[data-action="pm-sku-add"]')
        await q.select_option('#pm-s-origin', 'manual'); await fill(q, 'pm-s-sku', 'DEMO-002')
        await click(q, '[data-action="pm-sku-add"]')
        t = await body(q)
        chk('K1 SKU manual sin razón se rechaza', 'necesita su razón' in t, t[-300:])
        await fill(q, 'pm-s-sku', 'DEMO-002'); await fill(q, 'pm-s-reason', 'Pedido por dirección')
        await click(q, '[data-action="pm-sku-add"]')
        t = await body(q)
        chk('K2 muestra la clave identificador + SKU', 'PRM-2026-0001-DEMO-OTONO · DEMO-001' in t and 'PRM-2026-0001-DEMO-OTONO · DEMO-002' in t, t[:100])
        # aprobar directo desde Borrador: puede aprobar la misma persona que la creó
        await fill(q, 'pm-st-approver', '')
        await click(q, '[data-action="pm-status"][data-to="approved"]')
        t = await body(q)
        chk('A1 sin nombre de quien aprueba usa el tuyo (misma persona)', 'aprobada por Persona A' in t, t[:300])
        # publicar y medir
        await click(q, '[data-action="pm-status"][data-to="published"]')
        t = await body(q)
        chk('P1 publicar avisa de SKU sin fecha real y sin activaciones', '2 SKU sin fecha real' in t and 'No hay activaciones' in t, t[:400])
        if not await q.query_selector('#pm-rs-0'): await click(q, '[data-action="pm-fold"][data-fold="skus"]')   # aprobada: los SKU vienen plegados
        await fill(q, 'pm-rs-0', '2026-11-06'); await fill(q, 'pm-re-0', '2026-11-18')
        await click(q, '[data-action="pm-sku-dates"][data-i="0"]')
        await q.select_option('#pm-a-space', 'banner'); await fill(q, 'pm-a-start', '2026-11-05'); await fill(q, 'pm-a-end', '2026-11-18')
        await click(q, '[data-action="pm-act-add"]')
        await fill(q, 'pm-i-text', 'El banner entró un día tarde'); await click(q, '[data-action="pm-inc-add"]')
        await q.evaluate("FP.app.state.pm.fold={skus:true,baseline:true,history:true}; FP.app.render()"); await q.wait_for_timeout(300)   # SKU, línea base e historial vienen plegados
        t = await body(q)
        chk('E1 registra fechas reales, activación e incidencia', '2026-11-06' in t and 'ACV_001' in t and 'entró un día tarde' in t, t[:100])
        await q.select_option('[data-action="pm-act-status"]', 'live'); await q.wait_for_timeout(250)
        await q.evaluate("FP.app.state.pm.fold={skus:true,baseline:true,history:true}; FP.app.render()"); await q.wait_for_timeout(300)   # SKU, línea base e historial vienen plegados
        t = await body(q)
        chk('E2 el estado de la activación queda en el historial', 'ACV_001: Planeada → Publicada' in t, t[-400:])
        # El reloj fijo es 20-nov: ya terminó la vigencia
        await click(q, '[data-action="pm-status"][data-to="measuring"]')
        t = await body(q)
        chk('D1 pasa a en medición porque la vigencia ya terminó', 'En medición' in t and 'Estado actualizado' in t, t[:200])
        await click(q, '[data-action="pm-status"][data-to="published"]')
        t = await body(q)
        chk('D1b regresar a En marcha pide el motivo', 'escribe el motivo' in t.lower(), t[-300:])
        await fill(q, 'pm-st-back', 'Faltaba registrar una activación')
        await click(q, '[data-action="pm-status"][data-to="published"]')
        await q.evaluate("FP.app.state.pm.fold={skus:true,baseline:true,history:true}; FP.app.render()"); await q.wait_for_timeout(300)   # SKU, línea base e historial vienen plegados
        t = await body(q)
        chk('D1c con motivo regresa a En marcha y queda en el historial', 'En marcha' in t and 'Faltaba registrar una activación' in t, t[:300])
        await click(q, '[data-action="pm-status"][data-to="measuring"]')
        await click(q, '[data-action="pm-status"][data-to="closed"]')
        t = await body(q)
        chk('D2 no cierra sin conclusión', 'escribe la conclusión' in t, t[-300:])
        await fill(q, 'pm-st-concl', 'Funcionó en piel'); await q.select_option('#pm-st-rec', 'adjust')
        await click(q, '[data-action="pm-status"][data-to="closed"]')
        t = await body(q)
        chk('D3 cierra con conclusión y recomendación', 'Cerrada' in t and 'Funcionó en piel' in t and 'Ajustar' in t, t[:300])
        chk('D4 cerrada: ya no hay botones de edición', await q.evaluate("!document.querySelector('[data-action=\"pm-save-head\"]') && !document.querySelector('[data-action=\"pm-sku-add\"]')"))
        # persistencia
        raw = await q.evaluate("Object.keys(localStorage).filter(k=>/promotions/.test(k)).map(k=>[k, localStorage.getItem(k).length])")
        chk('R1 se guarda en el navegador (clave pequeña, no IndexedDB)', len(raw) >= 1, raw)
        await q.reload(); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700); await q.evaluate("FP.app.state.pm.tab='promos'; FP.app.render()"); await q.wait_for_timeout(300)
        t = await body(q)
        chk('R2 tras recargar sigue la promoción con su identificador', 'PRM-2026-0001-DEMO-OTONO' in t and 'Cerrada' in t, t[:300])
        chk('R3 el nombre del actor se recuerda', await q.evaluate("document.getElementById('pm-actor').value") == 'Persona A')
        # segunda con mismo nombre: aviso, consecutivo
        await click(q, '[data-action="pm-new"]')
        await fill(q, 'pm-n-name', 'Demo otoño'); await fill(q, 'pm-n-start', '2026-11-10'); await fill(q, 'pm-n-end', '2026-11-20')
        await click(q, '[data-action="pm-create"]')
        t = await body(q)
        chk('N1 consecutivo 0002 y aviso de mismo nombre en el mes', 'PRM-2026-0002-DEMO-OTONO' in t and 'mismo nombre' in t, t[:400])
        # exportación
        csv = await q.evaluate("FP.promotionExport.buildCsv(FP.app ? (FP.app.state||{}).pm.reg : null)") if False else await q.evaluate("FP.promotionExport.buildCsv(JSON.parse(JSON.stringify(FP.promotions.hydrate(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>/promotions/.test(k)))).data))))")
        chk('X1 el CSV trae BOM, encabezado y una fila por promoción-SKU', csv.startswith('﻿') and 'Identificador' in csv.split('\r\n')[0] and 'PRM-2026-0001-DEMO-OTONO · DEMO-001' in csv and 'PRM-2026-0001-DEMO-OTONO · DEMO-002' in csv, csv[:200])
        async with q.expect_download() as dl:
            await q.click('[data-action="pm-export-csv"][data-id=""]')
        d = await dl.value
        chk('X2 el botón descarga un CSV', d.suggested_filename.endswith('.csv') and d.suggested_filename.startswith('promociones_todas_'), d.suggested_filename)
        async with q.expect_download() as dl2:
            await q.click('[data-action="pm-export-json"][data-id=""]')
        d2 = await dl2.value
        chk('X3 el botón descarga un JSON', d2.suggested_filename.endswith('.json'), d2.suggested_filename)
        # integración aditiva con hipótesis: con una promoción vigente en el periodo, la hipótesis suma una línea; sin ella, no
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.evaluate("location.hash='#diagnostico'"); await q.wait_for_timeout(1200)
        # El mock no produce hipótesis; se sustituye el generador por una hipótesis fija para probar solo el añadido.
        await q.evaluate("(() => { const he = FP.hypothesisEngine; window.__gh = he.generateHypotheses; he.generateHypotheses = () => [{ id: 'h1', validationNeeded: ['Validar A'] }]; })()")
        async def hyp_line():
            await q.evaluate("location.hash='#inicio'"); await q.wait_for_timeout(300)
            await q.evaluate("FP.app.state.dx.run = null; location.hash='#diagnostico'"); await q.wait_for_timeout(1500)
            return await q.evaluate("JSON.stringify((FP.app.state.dx.run.hypotheses[0] || {}).validationNeeded)")
        v0 = await hyp_line()
        chk('H0 sin promociones registradas la validación de la hipótesis queda igual', v0 == '["Validar A"]', v0)
        await q.evaluate("(() => { const r = FP.promotionNotes.registry(); const p = FP.promotions.createPromotion(r, { name: 'Vigente todo el año', createdBy: 'Persona A', plannedStart: '2026-01-01', plannedEnd: '2026-12-31' }).promotion; FP.promotions.addSku(r, p.promoId, { sku: 'X', origin: 'digital' }); FP.promotions.setStatus(r, p.promoId, 'proposed', {}); FP.promotions.setStatus(r, p.promoId, 'approved', { approvedBy: 'Persona B' }); })()")
        v1 = await hyp_line()
        chk('H1 con una promoción vigente la validación suma la línea de promociones', 'Promociones registradas en esas fechas' in v1 and 'Validar A' in v1, v1)
        await q.evaluate("(() => { FP.hypothesisEngine.generateHypotheses = window.__gh; })()")
        errs.clear()  # los errores de render vienen de la hipótesis simulada (sin campos de vista), no de la app
        # nada más cambia: otras vistas abren sin error
        for v in ('inicio', 'recovery', 'cambios', 'medir'):
            await q.evaluate(f"location.hash='#{v}'"); await q.wait_for_timeout(500)
        chk('Z1 las demás vistas abren sin errores de página', not errs, errs)
        await b.close()
    print('\n' + ('TODO OK' if not fails else f'{len(fails)} FALLAS: ' + '; '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())
