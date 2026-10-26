"""Promociones: barra «Ahora haz esto», resumen con matriz y acciones de un clic (validar, seleccionar, crear promoción, deshacer), Oportunidades y móvil.
Uso: python3 batch_promos_guia.py <raiz>"""
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
async def txt(q, sel): return await q.evaluate("(s)=>(document.querySelector(s)||{innerText:''}).innerText", sel)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1400, 'height': 900})
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#promociones'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())"); await q.wait_for_timeout(800)
        # 1. Sin nada: la barra manda a cargar
        t = await txt(q, '.gd-bar')
        chk('G1 la barra está arriba de las pestañas', await q.evaluate("(()=>{const b=document.querySelector('.gd-bar'),t=document.querySelector('.sttabs');return !!b&&!!t&&(b.compareDocumentPosition(t)&4)!==0})()"))
        chk('G2 sin ofertas dice «Carga las ofertas» y paso 1 de 6', 'carga las ofertas' in t.lower() and 'paso 1 de 6' in t.lower(), t[:200])
        chk('G3 aclara que solo guía', 'solo te guía' in t)
        # 2. Datos de ejemplo
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()")
        await q.click('[data-action="dm-load"]')
        for _ in range(240):
            if 'Cargando' not in (await q.evaluate("(FP.app.state.sm.msg||{}).text||''")): break
            await q.wait_for_timeout(500)
        # la guía manda a lo más adelantado: se quitan las promociones de ejemplo para recorrer el flujo desde las ofertas
        await q.evaluate("FP.app.state.pm.reg.promotions=[]; FP.app.state.pm.tab='ofertas'; FP.app.render()"); await q.wait_for_timeout(1500)
        t = await txt(q, '.gd-bar'); n_rec = await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state==='received').length")
        n_tot = await q.evaluate("FP.app.state.of.reg.offers.length")
        print('ofertas de ejemplo:', n_tot, 'recibidas:', n_rec, '| barra:', t[:160].replace('\n', ' | '))
        chk('G4 hay ofertas de ejemplo', n_tot > 0)
        sm = await txt(q, '.gd-sum')
        n_act = await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state!=='discarded').length")
        chk('S1 el resumen cuenta las ofertas activas', f'{n_act} ofertas activas' in sm and '¿Qué hago primero?' in sm, sm[:120])
        chk('S2 tres tarjetas de prioridad, la de Alta resaltada', await q.evaluate("document.querySelectorAll('.gd-card').length") == 3 and await q.evaluate("document.querySelectorAll('.gd-card--alta').length") == 1 and 'con datos suficientes' in sm, sm[:300])
        chk('S3 avisa el periodo y muestra «Por revisar»', 'Periodo:' in sm and 'últimos 30 días' in sm, sm[:400])
        chk('S4 no promete margen ni inventa «descuento alto» como alerta', 'margen' not in sm.lower() and 'descuento alto' not in sm.lower())
        cs = await q.evaluate("[...document.querySelectorAll('.gd-card__n')].reduce((t,e)=>t+parseInt(e.innerText),0)")
        chk('S5 las tarjetas no cuentan más que las ofertas activas', cs <= n_act, cs)
        chk('L1 la lista de ofertas es deslizable, con encabezado fijo y sin «Mostrar más»', await q.evaluate("!!document.querySelector('.gd-scroll table thead') && !document.querySelector('[data-action=of-more]') && document.querySelectorAll('.gd-tab').length === 5"))
        # 3. Validación automática: las recibidas sin ninguna alerta ya no quedan pendientes
        await q.evaluate("FP.app.state.of.reg.offers.forEach(o=>{if(o.state==='validated'&&!o.history.some(h=>h.note==='Sin alertas: validada automáticamente')){}})")
        pend = await q.evaluate("(()=>{const an=FP.offers.analyze(FP.app.state.of.reg);return FP.app.state.of.reg.offers.filter(o=>o.state==='received'&&!FP.guide.alerts(an.get(o.offerId)).length&&!o.history.some(h=>h.field==='state')).length})()")
        done = await q.evaluate("FP.guide.autoValidate(FP.app.state.of.reg,'Automático').length")
        chk('V1 la validación automática recoge las que no tienen alertas y no hay botón manual', await q.evaluate("!document.querySelector('[data-action=\"gd-validate-clean\"]')") and done == pend, (done, pend))
        chk('V3 las que tienen alertas no se tocaron', await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state==='received').every(o=>FP.guide.alerts(FP.offers.analyze(FP.app.state.of.reg).get(o.offerId)).length>0||o.history.some(h=>h.field==='state'))"))
        await q.evaluate("FP.app.render()"); await q.wait_for_timeout(300)
        # 4. Seleccionar Alta/Alta: primero muestra la lista
        # los datos de ejemplo no traen validadas Alta/Alta: se fija la sugerencia de las validadas para probar el flujo de un clic
        await q.evaluate("(()=>{const f=FP.activationView.recs;FP.activationView.recs=(st)=>{const m=f(st);st.of.reg.offers.filter(o=>o.state==='validated').forEach(o=>{const r=m.get('offer:'+o.offerId);if(r&&!r.blocked){r.priority='Alta';r.confidence='Alta'}});return m}})()")
        await q.evaluate("FP.app.render()")
        aa = await q.evaluate("FP.guide.offerSummary(FP.app.state.of.reg, FP.offers.analyze(FP.app.state.of.reg), FP.activationView.recs(FP.app.state), FP.app.state.ac.reg.params).aa.length")
        print('validadas Alta/Alta:', aa)
        s0 = await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state==='selected').length")
        if aa:
            await q.click('[data-action="gd-select-aa"]'); await q.wait_for_timeout(300)
            cf = await txt(q, '.gd-confirm')
            chk('X1 pide confirmar con la lista antes de aplicar', 'Se van a seleccionar' in cf and await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state==='selected').length") == s0, cf[:200])
            await q.click('[data-action="gd-select-confirm"]'); await q.wait_for_timeout(300)
            sel = await q.evaluate("FP.app.state.of.reg.offers.filter(o=>o.state==='selected').length")
            chk('X2 seleccionó solo las Alta/Alta que se pueden', 0 < sel - s0 <= aa, (sel, s0, aa))
            bar = await txt(q, '.gd-bar')
            chk('X3 la barra pasa a «Crear promoción con las N seleccionadas»', 'crear promoción con las' in bar.lower() and 'paso 4 de 6' in bar.lower(), bar[:200])
            # 5. Crear promoción en un clic
            await q.click('.gd-bar [data-action="gd-create-promo"]'); await q.wait_for_timeout(500)
            npm = await q.evaluate("FP.app.state.pm.reg.promotions.length")
            chk('P1 creó una promoción en borrador con las seleccionadas', npm >= 1 and await q.evaluate("FP.app.state.pm.reg.promotions.slice(-1)[0].status") == 'draft' and await q.evaluate("FP.app.state.pm.reg.promotions.slice(-1)[0].skus.length") == sel)
            chk('P2 abre la promoción y la barra ya no pide crearla de nuevo', await q.evaluate("FP.app.state.pm.tab") == 'promos' and 'crear promoción con las' not in (await txt(q, '.gd-bar')).lower(), await txt(q, '.gd-bar'))
        # 6. Oportunidades: mismo resumen
        await q.click('#pmtab-oportunidades')
        for _ in range(40):
            if await q.evaluate("!!FP.app.state.op.result || !!FP.app.state.op.msg"): break
            await q.wait_for_timeout(500)
        await q.wait_for_timeout(500)
        print('op.result:', await q.evaluate("!!FP.app.state.op.result"), (await q.evaluate("(FP.app.state.op.msg||{}).text||''")))
        o = await txt(q, '.gd-sum')
        chk('O1 Oportunidades trae el resumen con las tarjetas', o and await q.evaluate("document.querySelectorAll('.gd-card').length") == 3, o[:150])
        # 6b. Un clic en Oportunidades: llevar las Alta/Alta al plan de la promoción en borrador, y deshacer
        await q.evaluate("(()=>{const f=FP.activationView.recs;FP.activationView.recs=(st)=>{const m=f(st);let n=0;[...m.values()].filter(r=>r.tab==='potential'&&!r.blocked).slice(0,2).forEach(r=>{r.priority='Alta';r.confidence='Alta'});return m}})(); FP.app.render()")
        await q.wait_for_timeout(300)
        if await q.evaluate("!!document.querySelector('[data-action=\"gd-op-add\"]')"):
            pid = await q.evaluate("document.getElementById('gd-op-promo').value"); k0 = await q.evaluate("FP.promotions.find(FP.app.state.pm.reg, '%s').skus.length" % 'X')  if False else await q.evaluate("FP.promotions.find(FP.app.state.pm.reg, document.getElementById('gd-op-promo').value).skus.length")
            await q.click('[data-action="gd-op-add"]'); await q.wait_for_timeout(300)
            k1 = await q.evaluate("FP.promotions.find(FP.app.state.pm.reg, '%s').skus.length" % pid)
            chk('O2 agregó las Alta/Alta al plan con origen «oportunidad digital»', k1 - k0 > 0 and await q.evaluate("FP.promotions.find(FP.app.state.pm.reg,'%s').skus.slice(-1)[0].origin" % pid) == 'digital', (k0, k1))
            await q.click('[data-action="gd-undo"]'); await q.wait_for_timeout(300)
            chk('O3 deshacer quita esos SKU del plan', await q.evaluate("FP.promotions.find(FP.app.state.pm.reg, '%s').skus.length" % pid) == k0)
        else:
            chk('O2 hay botón para agregar al plan', False, 'sin botón gd-op-add')
        # 7. Ver todos los pasos
        await q.click('[data-action="gd-steps"]'); await q.wait_for_timeout(200)
        chk('T1 «Ver todos los pasos» muestra los seis', await q.evaluate("document.querySelectorAll('.gd-steps li').length") == 6 and await q.evaluate("!document.querySelector('.gd-steps').hidden"))
        # 7b. Inicio: una sola línea de Promociones
        await q.evaluate("location.hash='inicio'"); await q.wait_for_timeout(1500)
        n_line = await q.evaluate("document.querySelectorAll('[data-block=\"promo-line\"]').length")
        chk('I1 Inicio muestra a lo más una línea de Promociones', n_line <= 1, n_line)
        if n_line: chk('I2 la línea lleva a Promociones', await q.evaluate("!!document.querySelector('[data-block=\"promo-line\"] [data-view=\"promociones\"]')"))
        # 8. Móvil sin desbordes
        await q.set_viewport_size({'width': 390, 'height': 800}); await q.evaluate("FP.app.state.pm.tab='ofertas'; FP.app.render()"); await q.wait_for_timeout(600)
        ov = await q.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        chk('M1 en 390 px no hay desborde horizontal de la página', ov <= 1, ov)
        small = await q.evaluate("[...document.querySelectorAll('.gd-bar .btn, .gd-acts .btn, .gd-grp .btn')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<36).length")
        chk('M2 los botones de la guía no quedan diminutos', small == 0, small)
        chk('E0 sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print('\nFallas:', fails if fails else 'ninguna'); sys.exit(1 if fails else 0)
asyncio.run(main())
