"""Resumen de promociones (propuesta B): registro de propuestas exportadas, embudo, agrupación, pendientes y Excel. Uso: python3 batch_resumen.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver, tempfile, zipfile
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
        c = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(600)
        chk('E1 el panel de datos de ejemplo existe y ofrece cargar', 'Datos de ejemplo' in await body(q) and await q.query_selector('[data-action="dm-load"]') is not None)
        await q.click('[data-action="dm-load"]'); await q.wait_for_timeout(500)
        chk('E2 sin tu nombre no carga y lo dice', 'Escribe tu nombre' in await body(q) and await q.evaluate("FP.app.state.of.reg.offers.length") == 0, (await body(q))[:200])
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()")
        await q.click('[data-action="dm-load"]'); await q.wait_for_timeout(1000)
        for _ in range(240):
            if 'Cargando' not in (await q.evaluate("(FP.app.state.sm.msg||{}).text||''")): break
            await q.wait_for_timeout(500)
        t = await body(q)
        chk('E3 carga ofertas, propuesta y promoción', 'Se cargaron 10 ofertas de ejemplo' in t and await q.evaluate("FP.app.state.of.reg.offers.length") == 10, t[:300])
        chk('E4 cargó venta ficticia marcada EJEMPLO', await q.evaluate("FP.productStore.listBatches().then(b=>b.map(x=>x.fileName).sort().join())") == 'EJEMPLO_funnel.csv,EJEMPLO_venta.csv')
        chk('E5 el Resumen se llena (10 propuestos, 6 en promoción)', await q.evaluate("FP.summaryView.compute(FP.app.state).funnel.proposed") == 10 and await q.evaluate("FP.summaryView.compute(FP.app.state).funnel.inPromo") == 6)
        chk('E6 el botón cambia a quitar', await q.query_selector('[data-action="dm-clear"]') is not None and await q.query_selector('[data-action="dm-load"]') is None)
        await q.click('[data-action="pm-tab"][data-tab="oportunidades"]'); await q.wait_for_timeout(3500)
        n = await q.evaluate("FP.app.state.op.result ? FP.app.state.op.result.items.length : -1"); w = await q.evaluate("FP.app.state.op.result ? FP.app.state.op.result.items.filter(i=>i.offers.length).length : -1")
        chk('E7 Oportunidades calcula con la venta ficticia y hay productos con oferta', n > 0 and w > 0, (n, w))
        await q.click('[data-action="pm-tab"][data-tab="promos"]'); await q.wait_for_timeout(400)
        pj = await q.evaluate("(()=>{const p=FP.app.state.pm.reg.promotions.find(x=>x.name.indexOf('Septiembre')>0); return p?{id:p.promoId,st:p.status,rows:p.baseline?p.baseline.rows:-1,by:p.approvedBy,h:p.history.map(h=>h.field).join()}:null})()")
        chk('E10 la promoción de ejemplo quedó en medición, con línea base congelada y aprobada por otra persona', pj and pj['st'] == 'measuring' and pj['rows'] > 0 and pj['by'] != 'Persona A' and 'baseline' in pj['h'], pj)
        await q.evaluate("FP.app.state.pm.sel=%r; FP.app.render()" % pj['id']); await q.wait_for_timeout(400)
        t = await body(q)
        chk('E11 el detalle muestra la sección Línea base congelada con su tabla', 'Línea base congelada' in t and 'Periodo de referencia' in t and 'Congelada el' in t, t[:300])
        ev = await q.evaluate("FP.promotionEvaluation.evaluate(FP.app.state.pm.reg.promotions.find(x=>x.name.indexOf('Septiembre')>0), {promotions:FP.app.state.pm.reg.promotions, events:[]}).then(r=>({n:r.counts.evaluable,f:r.items.filter(i=>i.baseline&&i.baseline.frozen).length}))")
        chk('E12 la evaluación usa la base congelada en los 3 SKU', ev['n'] == 3 and ev['f'] == 3, ev)
        await q.evaluate("FP.app.state.rs.promoId=%r" % pj['id']); await q.click('[data-action="pm-tab"][data-tab="resultados"]'); await q.wait_for_timeout(300)
        await q.click('[data-action="rs-run"]')
        for _ in range(60):
            if await q.evaluate("Boolean(FP.app.state.rs.result)"): break
            await q.wait_for_timeout(500)
        await q.wait_for_timeout(300); t = await body(q)
        chk('E15 Resultados muestra el seguimiento con avance, ritmo y detalle diario', 'Seguimiento durante la vigencia' in t and '11 de 11 días' in t and 'Ritmo contra la base' in t and 'Detalle por día' in t and await q.query_selector('#pm-body svg[role="img"] polyline') is not None, t[:400])
        chk('E16 el seguimiento usa la línea base congelada', 'congelada' in t, t[:200])
        await q.click('[data-action="pm-tab"][data-tab="promos"]'); await q.wait_for_timeout(300)
        nid = await q.evaluate("(()=>{const r=FP.promotions.createPromotion(FP.app.state.pm.reg,{name:'Real prueba base',createdBy:'Persona A',plannedStart:'2026-09-22',plannedEnd:'2026-09-28'},{year:2026}); const id=r.promotion.promoId; FP.promotions.addSku(FP.app.state.pm.reg,id,{sku:'SKU700001',origin:'manual',reason:'x'},'Persona A'); FP.promotions.setStatus(FP.app.state.pm.reg,id,'proposed',{by:'Persona A'}); FP.app.state.pm.sel=id; FP.app.render(); return id})()")
        await q.fill('#pm-st-approver', 'Persona B'); await q.click('[data-action="pm-status"][data-to="approved"]'); await q.wait_for_timeout(1500)
        bz = await q.evaluate("(()=>{const p=FP.promotions.find(FP.app.state.pm.reg,%r); return {st:p.status,rows:p.baseline?p.baseline.rows:-1}})()" % nid)
        chk('E13 al aprobar por la pantalla se congela la línea base solo', bz['st'] == 'approved' and bz['rows'] > 0 and 'Línea base congelada' in await body(q) and await q.query_selector('[data-action="pm-freeze"]') is not None, bz)
        await q.click('[data-action="pm-freeze"]'); await q.wait_for_timeout(1500)
        chk('E14 volver a congelar queda en el historial', await q.evaluate("FP.promotions.find(FP.app.state.pm.reg,%r).history.filter(h=>h.field==='baseline').length" % nid) == 2)
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(300)
        t = await body(q)
        gp = await q.evaluate("FP.goalsView.rows(FP.app.state).map(x=>[x.campaign, Boolean(x.goal), x.progress?x.progress.status:null, x.progress?x.progress.pctRevenue:null])")
        sep = [x for x in gp if x[0].endswith('Septiembre')]
        chk('E17 Resumen muestra «Metas por campaña» con las campañas de ejemplo', 'Metas por campaña' in t and len(gp) >= 3 and sep and sep[0][1] is True, gp)
        chk('E18 la campaña de la promoción en medición ya tiene avance contra su meta (corte guardado en el ejemplo)', sep and sep[0][2] == 'ok' and sep[0][3] and sep[0][3] > 0, sep)
        for _ in range(60):
            if not await q.evaluate("FP.app.state.cg.loading"): break
            await q.wait_for_timeout(500)
        gl = await q.evaluate("FP.goalsView.rows(FP.app.state).map(x=>[x.campaign, x.progress?x.progress.allLive:null, x.progress?x.progress.cutoffMax:null])")
        sepl = [x for x in gl if x[0].endswith('Septiembre')]
        t = await body(q)
        chk('E22 el avance usa la evaluación al día y dice hasta qué fecha llegan los datos', sepl and sepl[0][1] is True and sepl[0][2] and 'datos al día, hasta' in t, gl)
        sepname = sepl[0][0]
        await q.fill('#cg-camp', sepname); await q.dispatch_event('#cg-camp', 'change'); await q.wait_for_timeout(200)
        hp = await q.inner_text('#cg-help')
        chk('E23 al elegir la campaña, la ayuda muestra el ticket por unidad, su nivel y la mediana de categorías', 'por unidad' in hp and ('ticket alto' in hp or 'ticket bajo' in hp) and 'Sugerencia: meta principal en' in hp and 'mediana entre categorías' in hp and 'Ticket por unidad por categoría' in hp, hp[:400])
        tk = await q.evaluate("(()=>{const s=FP.app.state.cg.data;return FP.goals.campaignTicket(FP.goalsView.campaignSkus(%r), s.rows).ticket})()" % sepname)
        await q.fill('#cg-rev', str(int(tk * 100 * 10))); await q.fill('#cg-units', '1000'); await q.dispatch_event('#cg-units', 'change'); await q.wait_for_timeout(200)
        hp2 = await q.inner_text('#cg-help')
        chk('E24 metas coherentes con lo esperado: la ayuda lo dice sin alarma', 'consistente con lo esperado' in hp2 and 'Se aleja' not in hp2, hp2[:500])
        await q.fill('#cg-rev', str(int(tk * 1000 * 3))); await q.dispatch_event('#cg-rev', 'change'); await q.wait_for_timeout(200)
        hp3 = await q.inner_text('#cg-help')
        chk('E25 metas que implican un precio muy distinto avisan', __import__('re').search(r'Se aleja más de \d+ %', hp3) is not None and 'Tolerancia' in hp3, hp3[:500])
        bf = await q.evaluate("FP.demo.CAMPS[0]")
        await q.fill('#cg-camp', bf); await q.dispatch_event('#cg-camp', 'change'); await q.wait_for_timeout(150)
        info = await q.evaluate("(()=>{const s=FP.app.state.cg.data,t=FP.goals.campaignTicket(FP.goalsView.campaignSkus(%r), s.rows).ticket,d=FP.goals.avgDiscount(FP.goalsView.campaignOffers(%r));return {t,d:d&&d.avg}})()" % (bf, bf))
        if info.get('t') and info.get('d'):
            await q.fill('#cg-rev', str(int(info['t'] * (1 - info['d']) * 1000))); await q.fill('#cg-units', '1000'); await q.dispatch_event('#cg-units', 'change'); await q.wait_for_timeout(200)
            hp4 = await q.inner_text('#cg-help')
            chk('E26 con un descuento fuerte, el precio por unidad esperado ya lo descuenta y no avisa', 'descuento promedio de las ofertas' in hp4 and 'consistente con lo esperado' in hp4 and 'Se aleja' not in hp4, (info, hp4[:500]))
            await q.fill('#cg-rev', str(int(info['t'] * 1000))); await q.dispatch_event('#cg-rev', 'change'); await q.wait_for_timeout(200)
            chk('E27 sin descontar el descuento, esa misma captura sí avisa', __import__('re').search(r'Se aleja más de \d+ %', await q.inner_text('#cg-help')) is not None or info['d'] <= 0.2, info)
        else:
            chk('E26 la campaña de ejemplo tiene ticket y descuento promedio', False, info)
        await q.fill('#cg-camp', ''); await q.fill('#cg-rev', ''); await q.fill('#cg-units', ''); await q.dispatch_event('#cg-units', 'change')
        await q.fill('#cg-camp', 'Hot Sale real'); await q.fill('#cg-rev', '1.5M'); await q.fill('#cg-units', '12,000'); await q.click('[data-action="cg-save"]'); await q.wait_for_timeout(300)
        g2 = await q.evaluate("(FP.goals.find(FP.app.state.cg.reg,'Hot Sale real')||{})")
        chk('E19 guardar una meta desde la pantalla lee 1.5M y 12,000', g2.get('revenue') == 1500000 and g2.get('units') == 12000 and 'Hot Sale real' in await body(q), g2)
        await q.click('[data-action="cg-remove"][data-c="Hot Sale real"]'); await q.wait_for_timeout(300)
        chk('E20 quitar la meta funciona', await q.evaluate("FP.goals.find(FP.app.state.cg.reg,'Hot Sale real')") is None)
        await q.evaluate("FP.app.state.rs.promoId=%r" % pj['id']); await q.click('[data-action="pm-tab"][data-tab="resultados"]'); await q.wait_for_timeout(300)
        await q.click('[data-action="rs-run"]')
        for _ in range(60):
            if await q.evaluate("Boolean(FP.app.state.rs.result)"): break
            await q.wait_for_timeout(500)
        await q.wait_for_timeout(300); t = await body(q)
        chk('E21 Resultados muestra el avance de la meta de la campaña en vez de «Sin meta»', 'Meta de la campaña' in t and 'EJEMPLO' in t and __import__('re').search(r'\d+\s*%\s*\n?[^\n]*venta', t.split('Meta de la campaña')[1][:400].replace('\u00a0',' ')) is not None, [l for l in t.split('\n') if 'ampaña' in l or 'meta' in l.lower()][:6])
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(300)
        await q.click('[data-action="pm-tab"][data-tab="resumen"]'); await q.wait_for_timeout(300)
        await q.evaluate("FP.app.state.of.reg.offers.push({offerId:'REAL-1',batchId:'LOT-REAL',sku:'SKU700001',state:'received'}); FP.app.state.of.reg.batches.push({batchId:'LOT-REAL',campaign:'Mi campaña real',origin:'commercial'}); FP.app.render()")
        await q.click('[data-action="dm-clear"]'); await q.wait_for_timeout(500)
        for _ in range(120):
            if 'Quitando' not in (await q.evaluate("(FP.app.state.sm.msg||{}).text||''")): break
            await q.wait_for_timeout(500)
        t = await body(q)
        left = await q.evaluate("FP.app.state.of.reg.offers.map(o=>o.offerId)"); bt = await q.evaluate("FP.productStore.listBatches().then(b=>b.length)")
        chk('E8 quitar deja solo lo real y borra la venta ficticia', left == ['REAL-1'] and bt == 0 and 'Se quitaron 10 ofertas' in t and await q.query_selector('[data-action="dm-load"]') is not None, (left, bt, t[:200]))
        chk('E9 sin errores de página', not errs, errs)
        await b.close()
    print('\nFIN OK' if not fails else '\nFALLARON: ' + ', '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
