"""Decisión y conclusión estructuradas en «Medir y aprender» (interfaz): registrar, recuperar tras recargar, rechazos y trazabilidad. Uso: python3 -I batch_decisiones.py <raiz>."""
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
SEL = '[data-action="rc-action-field"][data-key="status"]'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        r = await prepare(q, u); chk('DC-0 partida: acción con medición', r == 'ok', r)
        await q.goto(u + '#medir'); await q.wait_for_selector('#mx-decision [data-block=decision]', timeout=20000)
        t = await q.evaluate("document.getElementById('mx-decision').innerText")
        chk('DC-1 Medir muestra Decisión y Conclusión por separado y avisa que la conclusión aún no se puede registrar (la acción está Propuesta)', 'Decisión' in t and 'Conclusión' in t and 'Todavía no se registró la decisión' in t and 'En medición' in t, t[:300])
        # conclusión forzada por la capa de negocio sin estar en medición
        chk('DC-2 forzar una conclusión desde la capa de negocio con la acción en Propuesta se rechaza', await q.evaluate("FP.actionPlan.recordConclusion(FP.app.state.rc.plan,'ACT_001',{outcome:'keep',justification:'x'.repeat(20),decidedBy:'Ana'}).ok") is False)
        pre = await q.evaluate("({d:document.getElementById('dc-decision').value,o:document.getElementById('dc-objective').value,s:document.getElementById('dc-success').value,h:!!document.querySelector('[data-suggested]'),saved:!!FP.app.state.rc.plan.actions[0].decision})")
        chk('DC-2b la decisión, el objetivo y el indicador vienen sugeridos (con aviso) y nada se guarda hasta pulsar Guardar', bool(pre['d']) and bool(pre['o']) and pre['h'] and not pre['saved'], pre)
        # decisión con campo faltante
        await q.fill('#dc-objective', '')
        await q.fill('#dc-decision', 'Corregir el checkout'); await q.click('[data-action="ac-decision-save"]'); await q.wait_for_timeout(400)
        toast = await q.evaluate("document.getElementById('toast').textContent")
        chk('DC-3 decisión sin objetivo se rechaza y dice qué falta', 'objetivo' in toast and await q.evaluate("!FP.app.state.rc.plan.actions[0].decision"), toast)
        await q.fill('#dc-objective', 'Recuperar conversión'); await q.fill('#dc-by', 'Ana'); await q.fill('#dc-success', 'CR vs base'); await q.click('[data-action="ac-decision-save"]'); await q.wait_for_timeout(500)
        d = await q.evaluate("FP.app.state.rc.plan.actions[0].decision")
        shown = await q.evaluate("(document.querySelector('[data-decision-saved]')||{}).innerText||''")
        chk('DC-4 la decisión se registra con objetivo, responsable, fecha e indicador, y la hipótesis se rotula «a validar (no demostrada)»', d and d['objective'] == 'Recuperar conversión' and d['decidedBy'] == 'Ana' and d['decidedAt'] and 'no demostrada' in shown, [d, shown])
        # llevar la acción a «En medición» con los selectores reales
        await q.goto(u + '#recovery'); await q.wait_for_selector(SEL, timeout=20000)
        for stt in ['approved', 'in_progress', 'completed', 'measuring']:
            await q.select_option(SEL, stt); await q.wait_for_timeout(350)
        await q.goto(u + '#medir'); await q.wait_for_selector('#mx-decision [data-block=conclusion]', timeout=20000)
        cons = await q.evaluate("FP.actionPlan.validMeasurements(FP.app.state.rc.plan,FP.app.state.rc.plan.actions[0]).slice(-1)[0].consistency")
        await q.evaluate("document.querySelectorAll('#mx-decision details').forEach(x=>x.open=true)")
        # una medición no implica mantener: aún no hay conclusión
        chk('DC-5 con medición válida todavía NO hay conclusión (la medición no concluye por sí sola)', await q.evaluate("!FP.app.state.rc.plan.actions[0].conclusion"))
        await q.fill('#cc-just', 'x'); await q.click('[data-action="ac-conclusion-save"]'); await q.wait_for_timeout(300)
        chk('DC-6 conclusión sin justificación suficiente se rechaza', await q.evaluate("!FP.app.state.rc.plan.actions[0].conclusion"), await q.evaluate("document.getElementById('toast').textContent"))
        if cons == 'not_consistent':
            await q.select_option('#cc-outcome', 'keep'); await q.fill('#cc-just', 'Quiero seguir con la intervención'); await q.fill('#cc-by', 'Ana'); await q.click('[data-action="ac-conclusion-save"]'); await q.wait_for_timeout(300)
            chk('DC-7 «Mantener» con resultado no consistente se rechaza (una medición no respalda mantener por sí sola)', await q.evaluate("!FP.app.state.rc.plan.actions[0].conclusion") and 'no respalda' in await q.evaluate("document.getElementById('toast').textContent"))
            await q.select_option('#cc-outcome', 'stop'); await q.fill('#cc-just', 'No mejoró frente a la línea base en la ventana'); await q.click('[data-action="ac-conclusion-save"]'); await q.wait_for_timeout(500)
        else:
            await q.select_option('#cc-outcome', 'keep'); await q.fill('#cc-just', 'La venta observada superó la base'); await q.fill('#cc-by', 'Ana'); await q.click('[data-action="ac-conclusion-save"]'); await q.wait_for_timeout(500)
            chk('DC-7 (resultado consistente: no se probó el rechazo de «Mantener»)', True)
        c = await q.evaluate("FP.app.state.rc.plan.actions[0].conclusion")
        st = await q.evaluate("FP.app.state.rc.plan.actions[0].status")
        chk('DC-8 la conclusión queda con evidencia, relación con el objetivo, responsable y fecha; el estado de la acción NO cambia solo', c and c['evidence']['baseline'] is not None and 'Recuperar conversión' in c['objectiveRelation'] and c['decidedBy'] == 'Ana' and st == 'measuring', [c, st])
        # recarga
        await q.reload(); await q.wait_for_selector('#mx-decision [data-block=conclusion]', timeout=20000); await q.wait_for_timeout(500)
        after = await q.evaluate("(()=>{const a=FP.app.state.rc.plan.actions[0];return {d:a.decision&&a.decision.objective,c:a.conclusion&&a.conclusion.outcome,m:FP.app.state.rc.plan.measurements.length,h:a.history.filter(x=>x.field==='decision'||x.field==='conclusion').length}})()")
        chk('DC-9 decisión, conclusión, medición e historial se conservan al recargar', after['d'] == 'Recuperar conversión' and after['c'] in ('stop', 'keep') and after['m'] >= 1 and after['h'] == 2, after)
        # cambiar conclusión
        await q.evaluate("document.querySelectorAll('#mx-decision details').forEach(x=>x.open=true)")
        await q.select_option('#cc-outcome', 'adjust'); await q.fill('#cc-just', 'Mejoró algo pero menos de lo esperado'); await q.fill('#cc-next', 'Probar otro flujo de pago'); await q.click('[data-action="ac-conclusion-save"]'); await q.wait_for_timeout(500)
        tr = await q.evaluate("(()=>{const a=FP.app.state.rc.plan.actions[0];const h=a.history.filter(x=>x.field==='conclusion');return {n:h.length,from:h[h.length-1].from&&h[h.length-1].from.outcome,now:a.conclusion.outcome,vis:document.getElementById('mx-decision').innerText.includes('Historial')}})()")
        chk('DC-10 cambiar la conclusión conserva la anterior en el historial visible', tr['n'] == 2 and tr['from'] in ('stop', 'keep') and tr['now'] == 'adjust' and tr['vis'], tr)
        chain = await q.evaluate("document.getElementById('mx-chain').innerText")
        chk('DC-11 la cadena trazable incluye Decisión y Conclusión', 'Decisión' in chain and 'Conclusión' in chain, chain[:200])
        ov = await q.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        chk('DC-12 sin desborde horizontal ni errores de página', ov is False and not errs, [ov, errs])
        await b.close()
    print('RESULTADO batch_decisiones:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
