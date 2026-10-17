"""Reglas de transición de acciones en la interfaz: opciones no permitidas apagadas, rechazo con mensaje, ciclo completo, persistencia y registros anteriores.
Uso: python3 -I batch_acciones.py <raiz>."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
ST = "(()=>{const a=FP.app.state.rc.plan.actions[0];return {s:a.status,h:a.history.length}})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        r = await prepare(q, u); chk('AC-0 partida: acción ACT_001 con una medición', r == 'ok', r)
        cons = await q.evaluate("(()=>{const m=FP.app.state.rc.plan.measurements;return m.length?m[m.length-1].consistency:null})()")
        opts = await q.evaluate(f"[...document.querySelector('{SEL}').options].map(o=>[o.value,o.disabled])")
        d = dict(opts)
        chk('AC-1 desde «Propuesta» solo se pueden elegir Aprobada, Rechazada y Cancelada; Validada y En medición están apagadas', d['validated'] is True and d['measuring'] is True and d['approved'] is False and d['in_progress'] is True, opts)
        h0 = (await q.evaluate(ST))['h']
        # intento de saltar con la interfaz (forzando el valor del selector)
        await q.evaluate(f"(()=>{{const s=document.querySelector('{SEL}');s.value='validated';s.dispatchEvent(new Event('change',{{bubbles:true}}))}})()")
        await q.wait_for_timeout(500)
        st = await q.evaluate(ST); shown = await q.evaluate(f"document.querySelector('{SEL}').value"); toast = await q.evaluate("document.getElementById('toast').textContent")
        chk('AC-2 forzar «Validada» desde la interfaz se rechaza: el estado no cambia, el selector vuelve a «Propuesta» y se explica por qué', st['s'] == 'proposed' and st['h'] == h0 and shown == 'proposed' and 'No se puede' in toast, [st, shown, toast])
        # llamada directa a la capa de negocio
        direct = await q.evaluate("(()=>{const r=FP.actionPlan.updateAction(FP.app.state.rc.plan,'ACT_001',{status:'validated'});return {ok:r.ok,s:FP.app.state.rc.plan.actions[0].status}})()")
        chk('AC-3 llamada directa a updateAction también se rechaza', direct['ok'] is False and direct['s'] == 'proposed', direct)
        # ciclo con la interfaz
        for stt in ['approved', 'in_progress', 'completed', 'measuring']:
            await q.select_option(SEL, stt); await q.wait_for_timeout(350)
        st = await q.evaluate(ST)
        chk('AC-4 ciclo por la interfaz: Propuesta → Aprobada → En curso → Terminada → En medición (cada paso queda en el historial)', st['s'] == 'measuring' and st['h'] == h0 + 4, [st, h0])
        valid = await q.evaluate("FP.actionPlan.validMeasurements(FP.app.state.rc.plan, FP.app.state.rc.plan.actions[0]).length")
        v = dict(await q.evaluate(f"[...document.querySelector('{SEL}').options].map(o=>[o.value,o.disabled])"))
        if valid and cons in ('consistent', 'partial'):
            chk('AC-5 con medición válida y consistente, «Validada» queda habilitada', v['validated'] is False, v)
            await q.select_option(SEL, 'validated'); await q.wait_for_timeout(400)
            chk('AC-6 y se puede validar', (await q.evaluate(ST))['s'] == 'validated')
        elif valid:
            chk('AC-5 medición válida pero no consistente: «Validada» apagada y «Rechazada» habilitada (se documenta sin afirmar éxito)', v['validated'] is True and v['rejected'] is False, v)
            await q.select_option(SEL, 'rejected'); await q.wait_for_timeout(400)
            chk('AC-6 se documenta como Rechazada (el resultado medido no respaldó lo esperado)', (await q.evaluate(ST))['s'] == 'rejected')
        else:
            chk('AC-5 sin medición válida: «Validada» apagada', v['validated'] is True, [v, cons])
            chk('AC-6 (sin medición válida en los datos de prueba: no aplica)', True)
        # persistencia
        before = await q.evaluate(ST)
        await q.reload(); await q.wait_for_selector(SEL, timeout=20000); await q.wait_for_timeout(500)
        after = await q.evaluate(ST)
        chk('AC-7 el estado y su historial persisten al recargar', after == before, [before, after])
        # registro anterior: Validada sin medición válida
        await q.evaluate("(()=>{const rc=FP.app.state.rc;rc.plan.measurements=[];rc.plan.actions[0].status='validated'})()")
        await q.evaluate("FP.app.actions['rc-action-field']({dataset:{id:'ACT_001',key:'owner'},value:'Ana'})"); await q.wait_for_timeout(500)
        msg = await q.evaluate("(document.querySelector('[data-action-integrity]')||{}).innerText||''")
        stl = await q.evaluate(ST)
        chk('AC-8 un registro anterior «Validada» sin medición se conserva y se señala (no se borra ni se vuelve a validar)', stl['s'] == 'validated' and 'Registro anterior' in msg, [stl, msg])
        await q.select_option(SEL, 'measuring'); await q.wait_for_timeout(400)
        chk('AC-9 y se puede regresar a «En medición» (compatibilidad)', (await q.evaluate(ST))['s'] == 'measuring')
        chk('AC-10 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_acciones:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
