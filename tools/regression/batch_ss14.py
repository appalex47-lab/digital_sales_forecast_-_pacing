"""Fase 14 — Supuestos de arranque (forma estándar, AOV general, CR con fuente). Uso: python3 batch_ss14.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
async def setv(q, sel, v):
    await q.fill(sel, str(v)); await q.dispatch_event(sel, 'change'); await q.wait_for_timeout(250)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        await q.evaluate("FP.app.actions['sample-targets']()"); await q.wait_for_timeout(400)
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        op = await q.evaluate("(document.getElementById('startup-assumptions')||{}).open")
        chk('T1 sin histórico ni venta real la guía sale abierta en Metas y motor', op is True, op)
        pos = await q.evaluate("(()=>{const f=document.getElementById('targets-form'),g=document.getElementById('startup-assumptions');return !!(f&&g&&(f.compareDocumentPosition(g)&Node.DOCUMENT_POSITION_FOLLOWING))})()")
        chk('T1b va justo después de las metas', pos)
        ptr = await q.evaluate("(()=>{location.hash='#configuracion';return 1})()"); await q.wait_for_timeout(700)
        cfgSec = await q.evaluate("!!document.querySelector('#plan-config #startup-assumptions')")
        cfgPtr = await q.evaluate("!!document.getElementById('startup-assumptions-pointer')")
        chk('T1c en Configuración no se duplica: solo un enlace a Metas y motor', (not cfgSec) and cfgPtr, (cfgSec, cfgPtr))
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        # forma estándar
        await q.check('[data-action="ss-toggle"]'); await q.dispatch_event('[data-action="ss-toggle"]', 'change'); await q.wait_for_timeout(300)
        await setv(q, '[data-action="ss-dow"][data-i="5"]', 1.3)
        await q.click('[data-action="ss-event-add"]'); await q.wait_for_timeout(300)
        await setv(q, '[data-f="name"][data-i="0"]', 'Buen Fin'); await setv(q, '[data-f="from"][data-i="0"]', '11-13'); await setv(q, '[data-f="to"][data-i="0"]', '11-16'); await setv(q, '[data-f="factor"][data-i="0"]', 1.4)
        ss = await q.evaluate("JSON.stringify(FP.app.state.planning.settings.standardShape)")
        chk('T2 la forma estándar y el evento se guardan', '"enabled":true' in ss and '"11-13"' in ss and '1.4' in ss, ss)
        pre = await q.evaluate("document.querySelector('#startup-assumptions .num strong') ? document.querySelector('#startup-assumptions').textContent.includes('Nov') : false")
        chk('T2b muestra cómo pesaría cada mes', pre)
        await setv(q, '[data-f="from"][data-i="0"]', '13/11')
        ss = await q.evaluate("FP.app.state.planning.settings.standardShape.events[0].from")
        chk('T3 una fecha mal escrita no se guarda', ss == '11-13', ss)
        # AOV general
        await setv(q, '#gaov-value', 1100)
        await q.select_option('#gaov-source', 'benchmark'); await q.wait_for_timeout(300)
        txt = await q.evaluate("document.getElementById('startup-assumptions').textContent")
        chk('T4 benchmark sin fuente y año avisa', 'Falta la fuente y el año' in txt)
        await setv(q, '#gaov-ref', 'Estudio X, 2025')
        txt = await q.evaluate("document.getElementById('startup-assumptions').textContent")
        chk('T4b con fuente deja de avisar', 'Falta la fuente y el año' not in txt)
        await setv(q, '[data-action="plan-assumption"][data-channel="ecommerce"][data-key="aov"]', 1150)
        eff = await q.evaluate("JSON.stringify(FP.planning.resolveGeneralAov({cfg:FP.seasonality.effectiveConfig(FP.app.state.planning.settings),year:FP.app.state.year,targets:FP.app.state.targets,explicit:FP.planning.explicitPlan(FP.app.state.store,FP.app.state.year),profiles:null}).byChannel)")
        chk('T5 con un canal propio, los demás quedan «ajustados»', eff.count('adjusted') == 3 and 'ecommerce' not in eff, eff)
        tag = await q.evaluate("document.getElementById('startup-assumptions').textContent")
        chk('T5b la tabla marca Propio y Ajustado', 'Propio' in tag and 'Ajustado' in tag)
        # CR
        await setv(q, '[data-action="cr-pct"][data-channel="ecommerce"]', 1.5)
        cr = await q.evaluate("FP.app.state.planning.settings.assumptions.ecommerce.conversionRate")
        chk('T6 el CR se captura en % y se guarda como fracción', abs(cr - 0.015) < 1e-9, cr)
        await setv(q, '[data-action="cr-pct"][data-channel="app"]', 150)
        cr2 = await q.evaluate("(FP.app.state.planning.settings.assumptions.app||{}).conversionRate||null")
        chk('T6b un CR mayor a 100 % no se guarda', cr2 is None, cr2)
        # líneas
        await q.select_option('#gaov-mode', 'lines'); await q.wait_for_timeout(300)
        for i, (n, a, sh) in enumerate([('Crónicos', 900, 50), ('GLP-1', 3100, 50)]):
            await q.click('[data-action="gaov-line-add"]'); await q.wait_for_timeout(250)
            await setv(q, f'[data-action="gaov-line-set"][data-i="{i}"][data-f="name"]', n)
            await setv(q, f'[data-action="gaov-line-set"][data-i="{i}"][data-f="aov"]', a)
            await setv(q, f'[data-action="gaov-line-set"][data-i="{i}"][data-f="share"]', sh)
        gv = await q.evaluate("FP.planning.generalAovValue(FP.seasonality.effectiveConfig(FP.app.state.planning.settings).generalAov)")
        chk('T7 el AOV general se genera de las líneas (ponderado por % de pedidos)', gv == 2000, gv)
        # Plan
        await q.goto(u + '#plan'); await q.wait_for_timeout(700)
        await q.click('[data-action="plan-preview"]'); await q.wait_for_timeout(1200)
        pl = await q.evaluate("document.getElementById('view-plan').textContent")
        chk('T8 el Plan avisa que usa supuestos de arranque', 'usa supuestos de arranque' in pl, pl[:200])
        chk('T8b el aviso menciona forma estándar y AOV', 'forma estándar' in pl and 'AOV supuesto' in pl)
        sums = await q.evaluate("(()=>{const p=FP.app.state.planning.preview||FP.app.state.planning.current;return p?FP.config.channelIds.map(ch=>Math.round(p.channels[ch].days.reduce((a,d)=>a+(d.values.revenue||0),0))-Math.round(p.channels[ch].annualTarget.value)):null})()")
        chk('T9 la suma de los días sigue cuadrando con la meta de cada canal', sums is not None and all(x == 0 for x in sums), sums)
        # cuadre con la Meta anual total
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        ck = await q.evaluate("document.getElementById('ss-check').textContent")
        chk('U1 el bloque 3 compara contra la Meta anual total (Σ canales, meses y días)', 'Σ canales' in ck.replace('Σ metas de canal', 'Σ canales') and 'Σ meses del plan' in ck and 'Σ días del plan' in ck, ck[:300])
        okdays = await q.evaluate("[...document.querySelectorAll('#ss-check tbody tr')].filter(r=>r.textContent.includes('Σ días del plan')).map(r=>r.textContent.includes('Cuadra'))")
        chk('U1b con forma estándar, AOV y CR puestos, Σ días «Cuadra» con la meta anual', okdays == [True], okdays)
        # los canales NO suman la meta total: lo dice y no inventa
        await q.fill('#t-annual', '300M'); await q.dispatch_event('#t-annual', 'change')
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(700)
        ck = await q.evaluate("document.getElementById('ss-check').textContent")
        chk('U2 si los canales no suman la meta total avisa cuánto falta por asignar', 'no suman tu Meta anual total' in ck and 'por asignar' in ck, ck[:400])
        # % escrito: el total manda
        await q.fill('#t-annual', '100M'); await q.fill('#t-ecommerce', '58%'); await q.fill('#t-app', '24%'); await q.fill('#t-whatsapp', '12%'); await q.fill('#t-llamadas', '6%')
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(700)
        v1 = await q.evaluate("[FP.app.state.targets.byChannel.ecommerce.revenue, document.getElementById('t-ecommerce').value]")
        chk('U3 «58%» de 100M se guarda como 58M y el campo sigue mostrando 58%', v1 == [58000000, '58%'], v1)
        await q.fill('#t-annual', '200M')
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(700)
        v2 = await q.evaluate("[FP.app.state.targets.byChannel.ecommerce.revenue, FP.app.state.targets.byChannel.llamadas.revenue, document.getElementById('t-ecommerce').value]")
        chk('U4 al cambiar la meta anual total, los canales escritos en % se reajustan solos (58% de 200M = 116M)', v2 == [116000000, 12000000, '58%'], v2)
        ck = await q.evaluate("document.getElementById('ss-check').textContent")
        chk('U4b y todo vuelve a cuadrar con la nueva meta', 'no suman tu Meta anual total' not in ck, ck[:300])
        await q.fill('#t-ecommerce', '90M')
        await q.click('#targets-form button[type="submit"]'); await q.wait_for_timeout(700)
        v3 = await q.evaluate("[FP.app.state.targets.byChannel.ecommerce.revenue, (FP.app.state.targets.channelShare||{}).ecommerce||null]")
        chk('U5 un monto escrito a mano deja de ser un % recordado', v3 == [90000000, None], v3)
        # con datos: plegada
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(2500)
        await q.goto(u + '#resumen'); await q.wait_for_timeout(900)
        inGoals = await q.evaluate("!!document.getElementById('startup-assumptions')")
        chk('T10 con histórico y venta cargados la guía desaparece de Metas y motor', not inGoals, inGoals)
        await q.goto(u + '#configuracion'); await q.wait_for_timeout(800)
        op2 = await q.evaluate("(document.getElementById('startup-assumptions')||{}).open")
        chk('T10b y pasa a Configuración de planeación, plegada', op2 is False, op2)
        chk('Sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print('\nRESULTADO batch_ss14:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
