"""Recovery Center · borrar lo que el usuario eligió: escenarios guardados, acciones del plan y acciones propias del catálogo
(nunca el catálogo base ni las propuestas). Uso: python3 -I batch_rcdel.py <raiz>. Reglas verificadas aparte en la prueba."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
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
SAVE = """(name)=>{const rc=FP.app.state.rc;const sc=FP.scenarioEngine.saveScenario(rc.scenarioStore,{ctx:rc.ctx,result:rc.preview,name:name,type:rc.draft.type,supersedes:null,
  links:{hypothesisId:'H1',hypothesis:'Hipótesis de prueba',signalIds:[],driver:'trafficVolume',diagnosisComparison:null}});return sc.scenarioId}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        r = await prepare(q, u); chk('RD-0 estado de partida: escenario + acción + medición', r == 'ok', r)
        dialogs = []; mode = {'accept': True}
        async def on_dialog(d): dialogs.append(d.message); await (d.accept() if mode['accept'] else d.dismiss())
        q.on('dialog', on_dialog)
        st0 = await q.evaluate("({sc:FP.app.state.rc.scenarioStore.scenarios.map(s=>s.scenarioId),ac:FP.app.state.rc.plan.actions.map(a=>[a.actionId,a.scenarioId]),me:FP.app.state.rc.plan.measurements.length})")
        chk('RD-1 hay 1 escenario (SC_001_v1), 1 acción (ACT_001 ligada a él) y ≥1 medición', st0['sc'] == ['SC_001_v1'] and st0['ac'] == [['ACT_001', 'SC_001_v1']] and st0['me'] >= 1, st0)
        # segundo escenario + nueva versión del primero (para probar ids y cadena)
        await q.fill('#rc-trafficPct', '3'); await q.press('#rc-trafficPct', 'Tab'); await q.wait_for_timeout(500)
        id2 = await q.evaluate(SAVE, 'Segundo'); await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(300)
        await q.fill('#rc-trafficPct', '4'); await q.press('#rc-trafficPct', 'Tab'); await q.wait_for_timeout(500)
        v2 = await q.evaluate("""()=>{const rc=FP.app.state.rc;const sc=FP.scenarioEngine.saveScenario(rc.scenarioStore,{ctx:rc.ctx,result:rc.preview,name:'v2 del primero',type:rc.draft.type,supersedes:'SC_001_v1',
          links:{hypothesisId:'H1',hypothesis:'Hipótesis de prueba',signalIds:[],driver:'trafficVolume',diagnosisComparison:null}});return sc.scenarioId+'|'+sc.supersedes}""")
        chk('RD-2 ids: segundo escenario SC_002_v1; versión nueva del primero SC_001_v2 que reemplaza a SC_001_v1', id2 == 'SC_002_v1' and v2 == 'SC_001_v2|SC_001_v1', (id2, v2))
        await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(300)
        await q.evaluate("FP.app.render && FP.app.render()") if False else None
        # ---- cancelar no cambia nada ----
        mode['accept'] = False
        await q.evaluate("FP.app.actions['rc-delete-scenario']({dataset:{id:'SC_001_v1'}})")
        n1 = await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.length")
        chk('RD-3 si se cancela la confirmación no se borra nada y el aviso menciona la acción ligada', n1 == 3 and 'ACT_001' in dialogs[-1] and 'SC_001_v2' in dialogs[-1], dialogs[-1:])
        # ---- borrar con botón real de la pantalla ----
        mode['accept'] = True
        await q.goto(u + '#recovery'); await q.wait_for_selector('#rc-saved [data-action="rc-delete-scenario"]', timeout=20000)
        btns = await q.evaluate("[...document.querySelectorAll('#rc-saved [data-action=rc-delete-scenario]')].map(x=>x.dataset.id)")
        chk('RD-4 la tabla de escenarios guardados trae «Borrar» por escenario', set(btns) >= {'SC_001_v1', 'SC_001_v2', 'SC_002_v1'}, btns)
        await q.click('#rc-saved [data-action="rc-delete-scenario"][data-id="SC_001_v1"]'); await q.wait_for_timeout(600)
        st = await q.evaluate("({sc:FP.app.state.rc.scenarioStore.scenarios.map(s=>[s.scenarioId,s.supersedes]),a:FP.app.state.rc.plan.actions.map(a=>({id:a.actionId,sc:a.scenarioId,h:a.history.map(x=>x.field+':'+x.note)})),me:FP.app.state.rc.plan.measurements.length})")
        chk('RD-5 borrar SC_001_v1: desaparece; SC_001_v2 ya no apunta a nada; ACT_001 se conserva sin escenario (con nota en su historial) y sus mediciones siguen', [x[0] for x in st['sc']] == ['SC_002_v1', 'SC_001_v2'] and dict(st['sc'])['SC_001_v2'] is None and st['a'][0]['id'] == 'ACT_001' and st['a'][0]['sc'] is None and any('Escenario borrado' in x for x in st['a'][0]['h']) and st['me'] >= 1, st)
        persisted = await q.evaluate("(()=>{const k=Object.keys(localStorage).filter(k=>/scenarios/.test(k));return k.map(x=>localStorage.getItem(x)).join('|')})()")
        await q.reload(); await q.wait_for_selector('#rc-simulator select', timeout=20000); await q.wait_for_timeout(600)
        after = await q.evaluate("FP.app.state.rc.scenarioStore.scenarios.map(s=>s.scenarioId)")
        chk('RD-6 el borrado persiste al recargar la página', 'SC_001_v1' not in after and 'SC_002_v1' in after, (after, persisted[:120]))
        # ---- id nuevo no repite uno vigente (con el conteo anterior habría chocado) ----
        await q.fill('#rc-trafficPct', '2'); await q.press('#rc-trafficPct', 'Tab'); await q.wait_for_timeout(500)
        ok = await q.evaluate("""()=>{const rc=FP.app.state.rc;if(!rc.preview||!rc.preview.valid)return 'inválido';const sc=FP.scenarioEngine.saveScenario(rc.scenarioStore,{ctx:rc.ctx,result:rc.preview,name:'Nuevo',type:rc.draft.type,supersedes:null,links:{hypothesisId:'H1',hypothesis:'x',signalIds:[],driver:'trafficVolume'}});
          const ids=rc.scenarioStore.scenarios.map(s=>s.scenarioId);return JSON.stringify({id:sc.scenarioId,uniq:new Set(ids).size===ids.length,ids})}""")
        j = json.loads(ok) if ok.startswith('{') else {}
        chk('RD-7 un escenario nuevo después de borrar recibe un id que no repite ninguno (SC_003)', j.get('uniq') and j.get('id') == 'SC_003_v1', ok)
        # ---- acción: borrar con sus mediciones ----
        await q.goto(u + '#recovery'); await q.wait_for_selector('#rc-plan [data-action="rc-delete-action"]', timeout=20000)
        dialogs.clear(); mode['accept'] = False
        await q.click('#rc-plan [data-action="rc-delete-action"][data-id="ACT_001"]'); await q.wait_for_timeout(300)
        still = await q.evaluate("FP.app.state.rc.plan.actions.length")
        chk('RD-8 cancelar el borrado de la acción la conserva; el aviso dice que se borran mediciones e historial', still == 1 and 'medición' in dialogs[-1] and 'historial' in dialogs[-1], dialogs[-1:])
        mode['accept'] = True
        await q.click('#rc-plan [data-action="rc-delete-action"][data-id="ACT_001"]'); await q.wait_for_timeout(500)
        st = await q.evaluate("({a:FP.app.state.rc.plan.actions.length,m:FP.app.state.rc.plan.measurements.length,tree:FP.app.state.rc.treeActionId})")
        chk('RD-9 borrar ACT_001 quita la acción y todas sus mediciones', st['a'] == 0 and st['m'] == 0, st)
        # ---- acciones propias del catálogo ----
        await q.goto(u + '#recovery'); await q.wait_for_selector('#rc-cu-name', state='attached', timeout=20000); await q.evaluate("FP.app.actions['rc-action-scenario']({value:'SC_002_v1'})"); await q.wait_for_timeout(400)
        base_rows = await q.evaluate("document.querySelectorAll('[data-action=rc-add-action]').length")
        await q.evaluate("document.querySelector('#rc-cu-name').closest('details').open=true")
        await q.fill('#rc-cu-name', 'Mi acción propia'); await q.select_option('#rc-cu-driver', 'trafficVolume'); await q.fill('#rc-cu-days', '14')
        await q.click('[data-action="rc-add-custom"]'); await q.wait_for_timeout(500)
        cu = await q.evaluate("({custom:FP.app.state.rc.custom.map(a=>a.name),del:[...document.querySelectorAll('[data-action=rc-delete-custom]')].length,rows:document.querySelectorAll('[data-action=rc-add-action]').length})")
        chk('RD-10 la acción propia agregada trae «Quitar»; el catálogo base NO (sólo 1 botón de quitar)', cu['custom'] == ['Mi acción propia'] and cu['del'] == 1 and cu['rows'] == base_rows + 1, (cu, base_rows))
        await q.click('[data-action="rc-delete-custom"]'); await q.wait_for_timeout(500)
        cu = await q.evaluate("({custom:FP.app.state.rc.custom.length,del:document.querySelectorAll('[data-action=rc-delete-custom]').length,rows:document.querySelectorAll('[data-action=rc-add-action]').length})")
        chk('RD-11 al quitarla desaparece del catálogo y quedan sólo las del catálogo base', cu['custom'] == 0 and cu['del'] == 0 and cu['rows'] == base_rows, (cu, base_rows))
        # ---- id de acción nuevo no repite ----
        await q.wait_for_selector('[data-action="rc-add-action"]:not([disabled])', timeout=10000)
        await q.click('[data-action="rc-add-action"]:not([disabled])'); await q.wait_for_timeout(500)
        ids = await q.evaluate("FP.app.state.rc.plan.actions.map(a=>a.actionId)")
        chk('RD-12 una acción nueva después de borrar recibe ACT_001 sin chocar con ninguna', ids == ['ACT_001'], ids)
        # ---- protección: lo sugerido no se puede borrar por la vía de acciones ----
        base_len = await q.evaluate("FP.config.recovery.actionLibrary.length")
        r = await q.evaluate("FP.app.actions['rc-delete-custom']({dataset:{id:FP.config.recovery.actionLibrary[0].actionId}}); FP.config.recovery.actionLibrary.length")
        chk('RD-13 el catálogo base no se puede borrar aunque se llame a la acción con su id', r == base_len, r)
        chk('RD-14 sin errores de página', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_rcdel:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
