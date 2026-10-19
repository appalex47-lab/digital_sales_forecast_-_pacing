"""«Ampliar con IA» en Recovery Center (escritorio 1280 y móvil 375), Cohere simulado.
Uso: python3 -I batch_ampliar_ia.py <raiz>."""
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
GOOD = {'objective': 'Recuperar volumen de visitas', 'steps': [{'text': 'Revisar campañas activas', 'owner': 'Marketing', 'when': 'Semana 1'}, {'text': 'Ajustar la inversión', 'owner': 'Performance', 'when': 'Semana 2'}],
        'measure': 'Sesiones semanales contra el periodo previo', 'dataToReview': ['Sesiones por canal'], 'risks': ['Datos de tráfico incompletos'], 'dontDo': ['No cambiar precios']}
STUB = """(mode)=>{ window.__calls=0; window.__mode=mode;
  FP.cohereConnection.isConfigured=()=>true;
  FP.cohereClient.chatJson=async()=>{ window.__calls++; await new Promise(r=>setTimeout(r,300));
    if(window.__mode==='bad') return {ok:true,status:'ok',text:'no es json'};
    return {ok:true,status:'ok',text:JSON.stringify(%s)}; }; }""" % json.dumps(GOOD)
async def flow(b, w, h, tag, errs):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, permissions=['clipboard-read', 'clipboard-write'])
    q = await ctx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
    r = await prepare(q, u); chk(f'{tag}-0 partida', r == 'ok', r)
    # sin Cohere configurado: botón apagado con motivo
    await q.evaluate("FP.cohereConnection.isConfigured=()=>false; FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(500)
    dis = await q.evaluate("(()=>{const b=document.querySelector('[data-action=\"rc-expand\"]');return b&&b.disabled})()")
    why = await q.evaluate("(document.getElementById('rcx-why')||{}).innerText||''")
    chk(f'{tag}-1 sin Cohere el botón está apagado y se explica por qué', dis is True and 'no está disponible' in why, [dis, why])
    await q.evaluate(STUB, 'ok'); await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(500)
    btn = '[data-action="rc-expand"]:not([disabled])'
    await q.wait_for_selector(btn, timeout=8000)
    n0 = await q.evaluate("FP.app.state.rc.plan.actions.length")
    await q.click(btn); await q.wait_for_selector('#rcx[aria-busy="true"]', timeout=3000)
    chk(f'{tag}-2 mientras genera se ve el estado de espera', True)
    await q.wait_for_selector('#rcx #rcx-objective', timeout=8000)
    chk(f'{tag}-3 aparece el borrador editable (objetivo, 2 pasos, medición)', await q.locator('#rcx [data-rcx-step]').count() == 2 and await q.input_value('#rcx-objective') == GOOD['objective'])
    chk(f'{tag}-3b abre en «Detallado» por defecto', await q.evaluate("document.querySelector('[data-action=\"rc-expand-style\"][data-style=\"detailed\"]').getAttribute('aria-pressed')") == 'true' and await q.locator('#rcx-risks').count() == 1)
    kn = await q.evaluate("(document.getElementById('rcx-known')||{}).innerText||''")
    chk(f'{tag}-3c «Ya sabemos» (solo lectura) con canal y objetivo operativo', 'Ya sabemos' in kn and 'Canal:' in kn and 'Objetivo operativo' in kn and await q.locator('#rcx-known textarea, #rcx-known input').count() == 0, kn[:200])
    chk(f'{tag}-3d «Ya sabemos» va en chips', await q.locator('#rcx-known .rcx__chip').count() >= 2)
    await q.click('[data-action="rc-expand-tab"][data-tab="data"]'); await q.wait_for_timeout(150)
    chk(f'{tag}-3e las secciones de apoyo van en pestañas (solo una visible)', await q.evaluate("[...document.querySelectorAll('#rcx .rcx-pane')].filter(p=>!p.hidden).length") == 1 and await q.evaluate("document.querySelector('#rcx .rcx-pane:not([hidden])').dataset.pane") == 'data')
    await q.click('[data-action="rc-expand-tab"][data-tab="measure"]')
    chk(f'{tag}-4 generar no guarda nada en el plan', await q.evaluate("FP.app.state.rc.plan.actions.length") == n0)
    ov = await q.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    chk(f'{tag}-5 sin desborde horizontal ({ov}px)', ov <= 1, ov)
    box = await q.evaluate("(()=>{const r=document.querySelector('#rcx [data-rcx-step]');const t=r.querySelector('textarea').getBoundingClientRect(), o=r.querySelector('input').getBoundingClientRect();return {tw:t.width,ow:o.width,same:Math.abs(t.top-o.top)<4}})()")
    if w < 860: chk(f'{tag}-6 móvil: campos del paso apilados a todo el ancho', not box['same'] and box['tw'] > w * 0.6, box)
    else: chk(f'{tag}-6 escritorio: texto, responsable y cuándo en una fila', box['same'], box)
    # estilo detallado (regenera) y regresar
    await q.click('[data-action="rc-expand-style"][data-style="detailed"]'); await q.wait_for_selector('#rcx #rcx-risks', state='attached', timeout=8000)
    chk(f'{tag}-7 «Detallado» agrega riesgos y qué NO hacer', await q.locator('#rcx-dont').count() == 1)
    # editar y copiar
    await q.fill('#rcx-objective', 'Objetivo editado a mano'); 
    await q.click('[data-action="rc-expand-copy"]'); await q.wait_for_timeout(400)
    clip = await q.evaluate("navigator.clipboard.readText()")
    chk(f'{tag}-8 «Copiar texto» copia el borrador editado', 'Objetivo editado a mano' in clip and 'Revisar campañas activas' in clip, clip[:200])
    # agregar un paso y quitar el primero
    await q.click('[data-action="rc-expand-step-add"]'); await q.wait_for_timeout(300)
    chk(f'{tag}-9 agregar paso conserva la edición', await q.locator('#rcx [data-rcx-step]').count() == 3 and await q.input_value('#rcx-objective') == 'Objetivo editado a mano')
    await q.click('[data-action="rc-expand-step-del"][data-index="2"]'); await q.wait_for_timeout(300)
    chk(f'{tag}-10 quitar paso', await q.locator('#rcx [data-rcx-step]').count() == 2)
    # agregar al plan
    await q.click('[data-action="rc-expand-add"]'); await q.wait_for_timeout(700)
    st = await q.evaluate("(()=>{const a=FP.app.state.rc.plan.actions;const l=a[a.length-1];return {n:a.length,d:l.detail}})()")
    chk(f'{tag}-11 al agregar al plan se guarda el detalle editado', st['n'] == n0 + 1 and st['d'] and st['d']['objective'] == 'Objetivo editado a mano' and st['d']['edited'] is True and st['d']['source'] == 'cohere', st)
    chk(f'{tag}-11b la acción guarda el objetivo operativo y el detalle trae «Ya sabemos»', await q.evaluate("(()=>{const a=FP.app.state.rc.plan.actions.slice(-1)[0];return !!a.operativeGoal&&a.operativeGoal.source==='scenario'&&a.detail.known.length>=2})()"))
    chk(f'{tag}-12 el panel se cierra', await q.locator('#rcx').count() == 0)
    chk(f'{tag}-13 el plan muestra la insignia «Ampliado con IA y editado»', 'Ampliado con IA y editado' in await q.evaluate("document.body.innerText"))
    # error: JSON inválido
    await q.evaluate(STUB, 'bad'); await q.evaluate("FP.app.actions['rc-draft-reset']()"); await q.wait_for_timeout(900)
    if not await q.locator(btn).count(): print('DBG', await q.evaluate("(()=>{const rc=FP.app.state.rc;return JSON.stringify({as:rc.actionScenario,sc:rc.scenarioStore.scenarios.length,btn:document.querySelectorAll('[data-action=rc-expand]').length,why:(document.getElementById('rcx-why')||{}).innerText})})()"))
    await q.wait_for_selector(btn, timeout=8000); await q.click(btn); await q.wait_for_selector('#rcx[role="alert"]', timeout=8000)
    chk(f'{tag}-15 respuesta inválida: mensaje claro y nada se guarda', await q.evaluate("FP.app.state.rc.plan.actions.length") == n0 + 1)
    await q.click('[data-action="rc-expand-discard"]') if await q.locator('[data-action="rc-expand-discard"]').count() else None
    await q.reload(); await q.wait_for_selector('.rcx-detail', timeout=20000)
    chk(f'{tag}-14 el detalle persiste al recargar', await q.locator('.rcx-detail').count() >= 1)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        await flow(b, 1280, 900, 'D', errs); await flow(b, 375, 800, 'M', errs)
        chk('Z sin errores de página', not errs, errs); await b.close()
    print('RESULTADO batch_ampliar_ia:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
