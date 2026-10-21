"""Recuperación con filtro «Total digital»: lista escenarios, acciones y seguimiento de TODOS los canales (con su canal).
Uso: python3 -I batch_recuperacion_todos_canales.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
async def setch(q, ch):
    await q.select_option('#rc-ch', ch); await q.wait_for_timeout(1200)
async def gen_rp(pg):
    """Pulsa «Generar vista previa»; si aparece el aviso de datos faltantes, elige «Generar de todos modos»."""
    await pg.click('[data-action="rp-generate"]'); await pg.wait_for_timeout(150)
    if await pg.query_selector('[data-action="rp-gap-go"]'): await pg.click('[data-action="rp-gap-go"]')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        r = await prepare(q, u); chk('T0 partida', r == 'ok', r)
        await q.select_option('#rc-pkey', '2026-10'); await q.wait_for_timeout(1200)
        chans = await q.evaluate("[...document.querySelectorAll('#rc-ch option')].map(o=>o.value)")
        ch = 'whatsapp' if 'whatsapp' in chans else next((c for c in chans if c != 'total'), None); chk('T0b hay un canal individual', ch is not None, chans)
        # El fixture trae un escenario válido de septiembre/Total: se clona al periodo abierto (octubre) bajo otro canal, equivalente a uno creado ahí.
        await q.wait_for_selector('#rc-simulator', timeout=15000)
        ok = await q.evaluate("(()=>{const rc=FP.app.state.rc, a=rc.scenarioStore.scenarios, b=a[0]; if(!b) return false; a.push({...b,scenarioId:'SC_T_v1',family:'SC_T',name:'Escenario prueba canal',context:{...b.context,channel:'%s',period:rc.ctx.period,source:rc.ctx.source}}); return true})()" % ch)
        chk('T0c hay un escenario base para clonar en otro canal', ok)
        await setch(q, ch)
        sid = await q.evaluate("(()=>{const l=FP.app.state.rc.scenarioStore.scenarios;return l[l.length-1].scenarioId})()")
        nm = await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.find(s=>s.scenarioId==='%s').name" % sid)
        await q.evaluate("(()=>{const rc=FP.app.state.rc;FP.actionPlan.createAction(rc.plan,{title:'Acción canal prueba',scenarioId:'%s',channel:rc.ctx.channel,period:{start:rc.ctx.period.start,end:rc.ctx.period.end,label:rc.ctx.period.label},startDate:rc.ctx.period.start,endDate:rc.ctx.period.end});FP.app.render&&FP.app.render()})()" % sid)
        await q.evaluate("(()=>{const rc=FP.app.state.rc, a=rc.plan.actions.find(x=>x.title==='Acción canal prueba'); rc.plan.measurements.push({actionId:a.actionId,measurementDate:'2026-10-02',observedDays:1,windowDays:7,metric:'revenue',delta:{baseline:1,scenario:2,observed:1.5,deltaVsBaseline:.5,deltaVsScenario:-.5},consistency:'partial',statement:'Medición de prueba',factors:[],byMetric:{}})})()")
        lbl = await q.evaluate("FP.scenarioEngine.chLabel('%s')" % ch)
        await setch(q, 'total')
        a = await q.evaluate("(()=>{const r=FP.app.state.rc.analysis;return {sc:(r.allScenarios||[]).map(s=>s.scenarioId),ac:(r.allActions||[]).map(x=>x.title),own:r.scenarios.length}})()")
        chk('T1 en Total el análisis incluye el escenario y la acción del otro canal', sid in a['sc'] and 'Acción canal prueba' in a['ac'], a)
        saved = await q.inner_text('#rc-saved')
        chk('T2 «Escenarios guardados» en Total muestra nombre y canal', nm in saved and lbl in saved, saved[:300])
        plan = await q.inner_text('#rc-plan'); chk('T3 plan de acción en Total muestra la acción con su canal', 'Acción canal prueba' in plan and lbl in plan, plan[:300])
        trk = await q.inner_text('#rc-tracking'); chk('T4 seguimiento en Total muestra la medición de la acción del otro canal', 'ACT_' in trk and 'Medición de prueba' in trk, trk[:300])
        dis = await q.evaluate("[...document.querySelectorAll('#rc-saved input[type=checkbox]')].filter(i=>i.disabled).length")
        chk('T5 escenarios de otro canal no son comparables (checkbox deshabilitado)', dis >= 1, dis)
        await q.evaluate("location.hash='#presentacion'"); await q.wait_for_selector('[data-action="rp-generate"]')
        await q.evaluate("FP.app.state.dx.settings.channel='total';FP.app.state.rc.settings.channel='total';const c=FP.app.state.ux.ctx;c.periodType='month';c.periodKey=FP.app.state.rc.ctx.period.start.slice(0,7);c.channel='total';const d=FP.app.state.dx.settings;d.periodType='month';d.periodKey=c.periodKey")
        await gen_rp(q)
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        pg = await q.evaluate("(()=>{const r=FP.app.state.rp.report;const p=r.pages.find(x=>x.id==='recovery');return p?JSON.stringify(p):'omitido:'+JSON.stringify(r.omitted.filter(o=>o.id==='recovery'))})()")
        chk('T6 la lámina de Recuperación (PDF) trae el nombre del escenario y su canal', not pg.startswith('omitido') and nm in pg and lbl in pg and 'Acción canal prueba' in pg, (pg or '')[:300])
        await q.evaluate("location.hash='#recovery'"); await q.wait_for_selector('#rc-ch', state='visible'); await setch(q, ch)
        own = await q.inner_text('#rc-saved'); chk('T7 vista de un solo canal sigue mostrando su escenario', nm in own)
        chk('T8 sin errores de consola', not errs, errs[:3])
        await b.close()
asyncio.run(main())
sys.exit(1 if fails else 0)
