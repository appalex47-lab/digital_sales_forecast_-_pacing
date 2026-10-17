"""Vigencia del progreso de la ruta (huella de datos) y errores de guardado. Uso: python3 -I batch_vigencia.py <raiz>.
Se usan datos sintéticos de prueba; no se tocan datos reales."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
U = f'http://127.0.0.1:{port}/index.html'
K = '2026|month:2026-09|total'
K_OCT = '2026|month:2026-10|total'
K_EC = '2026|month:2026-09|ecommerce'
STEP = 'investigate_cr'
PG = lambda key=K: f"(()=>{{const p=FP.attentionView.progressFor('{key}',FP.app.state)['{STEP}'];return p?{{rev:!!p.reviewed,stale:p.staleReview?p.staleReview.why:null,note:(p.reviewed||p.staleReview||{{}}).note,past:(p.past||[]).length}}:null}})()"
REV = lambda note, key=K: f"FP.attentionView.markReviewed('{key}','{STEP}','{note}',FP.app.state)"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1200)
        await q.evaluate("localStorage.removeItem('fp.route.v1')")
        sig0 = await q.evaluate(f"FP.attentionView.dataSig(FP.app.state,'{K}')")
        chk('VG-0 hay huella determinista de los datos del contexto (año|periodo|canal)', bool(sig0) and ':' in sig0, sig0)
        r = await q.evaluate(REV('bajó por campaña'))
        chk('VG-1 revisar un paso guarda la revisión con la huella y queda vigente', (await q.evaluate(PG())) == {'rev': True, 'stale': None, 'note': 'bajó por campaña', 'past': 0} and json.loads(await q.evaluate("JSON.stringify(localStorage.getItem('fp.route.v1'))"))[0:1] == '{', r)
        saved = await q.evaluate("JSON.parse(localStorage.getItem('fp.route.v1'))")
        chk('VG-2 en el almacenamiento la revisión lleva su huella (sig)', saved[K][STEP]['reviewed']['sig'] == sig0, saved)
        await q.reload(); await q.wait_for_timeout(1500)
        chk('VG-3 al recargar la página la revisión sigue vigente (mismos datos)', (await q.evaluate(PG())) and (await q.evaluate(PG()))['rev'] is True, await q.evaluate(PG()))
        # periodos y canales separados
        chk('VG-4 otro periodo no hereda la revisión (no se mezclan periodos)', await q.evaluate(PG(K_OCT)) is None)
        chk('VG-5 otro canal no hereda la revisión (no se mezclan canales)', await q.evaluate(PG(K_EC)) is None)
        # cambio irrelevante: registro de otro periodo/canal
        await q.evaluate("(()=>{const r=FP.app.state.store.actual.records.find(x=>!String(x.date).startsWith('2026-09'));if(r&&r.metrics.revenue)r.metrics.revenue.value*=1.5})()")
        irr1 = await q.evaluate(PG())
        chk('VG-6 un cambio en un periodo distinto NO invalida la revisión (irrelevante para este diagnóstico)', irr1 and irr1['rev'] is True, irr1)
        # reemplazar archivo con los mismos valores (cambia solo el id del lote)
        await q.evaluate("FP.app.state.store.actual.records.forEach(r=>{r.provenance=Object.assign({},r.provenance,{batchId:'otro_lote',fileName:'otro.csv'})})")
        same = await q.evaluate(PG())
        chk('VG-7 reemplazar el archivo con los MISMOS valores no invalida la revisión (política: la vigencia depende de los valores, no del archivo)', same and same['rev'] is True, same)
        # cambio relevante
        await q.evaluate("(()=>{const r=FP.app.state.store.actual.records.find(x=>String(x.date).startsWith('2026-09')&&x.metrics.revenue);r.metrics.revenue.value*=1.25})()")
        ch = await q.evaluate(PG())
        chk('VG-8 un cambio de venta real dentro del periodo deja la revisión como desactualizada (no vigente), conservando la nota', ch and ch['rev'] is False and ch['stale'] == 'changed' and ch['note'] == 'bajó por campaña', ch)
        # historial al revisar de nuevo
        await q.evaluate(REV('segunda revisión'))
        again = await q.evaluate(PG())
        chk('VG-9 al revisar de nuevo queda vigente y la revisión anterior se conserva como historial', again and again['rev'] is True and again['past'] == 1 and again['note'] == 'segunda revisión', again)
        # registro anterior sin huella
        await q.evaluate("(()=>{const a=JSON.parse(localStorage.getItem('fp.route.v1'));a['2026|year:2026|total']={[ '%s' ]:{at:'2026-09-01T10:00:00Z',reviewed:{at:'2026-09-01T10:00:00Z',note:'vieja'}}};localStorage.setItem('fp.route.v1',JSON.stringify(a))})()" % STEP)
        old = await q.evaluate(PG('2026|year:2026|total'))
        chk('VG-10 un registro anterior (sin huella) no se presenta como confirmado: queda «no se puede comprobar» y conserva la nota', old and old['rev'] is False and old['stale'] == 'unknown' and old['note'] == 'vieja', old)
        # mensaje en la interfaz
        ui = await q.evaluate(f"""(()=>{{const st=FP.app.state;st.ux.origin={{key:'{K}',route:'x',step:'{STEP}',view:'inicio',findingTitle:'t',chain:[{{id:'{STEP}',title:'Paso',state:'available',view:'inicio'}}],ctxLabel:'Total',periodLabel:'2026-09',year:2026,channel:'total',ref:null}};
          const html=FP.attentionView.originHtml(Object.assign({{}},st,{{view:'inicio'}}),{{}});return html.length}})()""")
        # (originHtml solo pinta en la vista del paso; se prueba con view = destino)
        msg = await q.evaluate(f"""(()=>{{const st=FP.app.state;localStorage.setItem('x','1');const a=JSON.parse(localStorage.getItem('fp.route.v1'));
          a['{K}']['{STEP}'].reviewed.sig='viejo';localStorage.setItem('fp.route.v1',JSON.stringify(a));
          st.ux.origin={{key:'{K}',route:'x',step:'{STEP}',view:'diagnostico',findingTitle:'t',chain:[{{id:'{STEP}',title:'Paso',state:'available',view:'diagnostico'}}],ctxLabel:'Total',periodLabel:'2026-09',year:2026,channel:'total',ref:null}};
          const h=FP.attentionView.originHtml(Object.assign({{}},st,{{view:'diagnostico'}}),{{}});return {{stale:/data-stale-review="changed"/.test(h),form:/route-reviewed/.test(h),done:/data-done="1"/.test(h)}}}})()""")
        chk('VG-11 la barra de origen avisa que la revisión se hizo con otros datos, pide confirmarla y no la muestra como completada', msg['stale'] and msg['form'] and not msg['done'], msg)
        # ---- errores de guardado ----
        await q.evaluate("localStorage.removeItem('fp.route.v1')")
        await q.evaluate("(()=>{const o=Storage.prototype.setItem;window.__o=o;Storage.prototype.setItem=function(k,v){if(k==='fp.route.v1')throw new Error('QuotaExceededError simulado');return o.call(this,k,v)}})()")
        r = await q.evaluate(REV('sin espacio'))
        stt = await q.evaluate("FP.attentionView.saveStatus()")
        toast = await q.evaluate("document.getElementById('toast').textContent")
        chk('VG-12 con el almacenamiento lleno el guardado se reporta como fallido (ok=false), se avisa y no se dice «guardado»', r['ok'] is False and stt['unsaved'] is True and 'No se pudo guardar' in toast and 'se guardó' not in toast, [r, stt, toast])
        mem = await q.evaluate(PG())
        chk('VG-13 lo hecho se conserva en memoria para no perderlo (la revisión sigue visible)', mem and mem['rev'] is True, mem)
        r2 = await q.evaluate("FP.attentionView.retrySave()")
        chk('VG-14 reintentar mientras sigue fallando no afirma éxito', r2['ok'] is False and (await q.evaluate("FP.attentionView.saveStatus()"))['unsaved'] is True, r2)
        await q.evaluate("(()=>{Storage.prototype.setItem=window.__o})()")
        r3 = await q.evaluate("FP.attentionView.retrySave()")
        persisted = await q.evaluate("JSON.parse(localStorage.getItem('fp.route.v1')||'{}')")
        chk('VG-15 al volver el almacenamiento, el reintento guarda de verdad y se limpia el aviso', r3['ok'] is True and (await q.evaluate("FP.attentionView.saveStatus()"))['unsaved'] is False and persisted.get(K, {}).get(STEP, {}).get('reviewed', {}).get('note') == 'sin espacio', [r3, persisted])
        # LRU: no se descarta lo reciente
        await q.evaluate("localStorage.removeItem('fp.route.v1')")
        await q.evaluate("""(()=>{for(let i=0;i<160;i++){FP.attentionView.markStarted('2026|month:2026-09|c'+i,'review_gap','x',FP.app.state)}FP.attentionView.markStarted('2026|month:2026-09|ULTIMO','review_gap','x',FP.app.state)})()""")
        keys = await q.evaluate("Object.keys(JSON.parse(localStorage.getItem('fp.route.v1')))")
        chk('VG-16 el límite de contextos (150) descarta los menos recientes; el último guardado sigue ahí', len(keys) <= 150 and '2026|month:2026-09|ULTIMO' in keys and '2026|month:2026-09|c159' in keys and '2026|month:2026-09|c0' not in keys, [len(keys), keys[:2]])
        chk('VG-17 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_vigencia:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
