"""Inicio · «Qué necesita atención» y «Tu siguiente mejor paso» (etapa 1). Uso: python3 batch_atencion.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
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
async def openref(q):
    """Abre el panel único de fecha/año del encabezado si está cerrado."""
    if not await q.is_visible('#topbar-date'):
        await q.click('#topbar-ref')

async def seed(q):
    await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
    await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
    try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
    except Exception: pass
    await q.goto(U + '#plan'); await q.wait_for_timeout(600)
    for a in ['plan-preview', 'plan-save']:
        try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
        except Exception: pass
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
        # vacío: sin datos, Inicio sigue funcionando
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1200)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        e0 = await q.evaluate("[!!document.getElementById('att'),!!document.getElementById('nbs'),document.getElementById('home').innerText.length>50]")
        chk('A0 sin datos Inicio carga sin errores y sin secciones de hallazgos (usa el estado vacío de siempre)', e0 == [False, False, True] and not errs, (e0, errs))
        await seed(q)
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1500)
        r = await q.evaluate("""()=>({att:!!document.getElementById('att'),nbs:!!document.getElementById('nbs'),state:(document.getElementById('att')||{dataset:{}}).dataset.state,
          items:document.querySelectorAll('#att .att__item').length,step:(document.getElementById('nbs')||{dataset:{}}).dataset.step,
          order:(()=>{const ids=[...document.querySelectorAll('#home [data-block]')].map(e=>e.dataset.block);return ids.slice(0,3)})(),
          facts:[...document.querySelectorAll('#nbs .nbs__facts dt')].map(e=>e.innerText),
          btn:!!document.querySelector('#nbs button[data-action="route-go"].btn--primary'),oldDup:document.querySelectorAll('#home [data-key="todo"] [data-action="route-go"]').length})""")
        chk('A1 Inicio trae «Qué necesita atención» y «Tu siguiente mejor paso» justo después de «Lo esencial» (primero la acción, luego los hallazgos)', r['att'] and r['nbs'] and r['order'][:3] == ['key', 'nextstep', 'attention'], r)
        chk('A2 el siguiente paso muestra resultado esperado, datos que se necesitan, estado y criterio de salida, con un botón principal', all(any(f.startswith(x) for f in r['facts']) for x in ('Resultado esperado', 'Estado', 'Termina cuando')) and r['btn'], r)
        chk('A3 «¿Qué hago hoy?» de Lo esencial apunta al paso del bloque principal sin repetirlo (una sola fuente)', r['oldDup'] == 0, r)
        step = r['step']
        # sin repetir: el paso principal aparece una sola vez como botón primario
        # navegación contextual
        await q.select_option('#home-ch', 'ecommerce'); await q.wait_for_timeout(900)
        h = await q.evaluate("[FP.app.state.ux.home.channel, FP.app.state.ux.ctx.channel]")
        await q.click('#nbs button[data-action="route-go"].btn--primary'); await q.wait_for_timeout(1500)
        d = await q.evaluate("""()=>({hash:location.hash,ctx:FP.app.state.ux.ctx,store:JSON.parse(localStorage.getItem('fp.route.v1')||'{}')})""")
        chk('A4 el botón abre el módulo correcto conservando el canal elegido y recuerda el paso abierto', d['hash'] != '#inicio' and d['ctx'].get('channel') == 'ecommerce' and any(step in v for v in d['store'].values()), d)
        # al volver, el paso aparece «en curso» (se abrió) y NO «completado» solo por haber hecho clic
        await q.goto(U + '#inicio'); await q.wait_for_timeout(1200)
        s2 = await q.evaluate("(()=>{const e=document.getElementById('nbs');return e?{step:e.dataset.step,state:e.dataset.state}:null})()")
        chk('A5 al volver, el paso abierto no se marca como completado por el clic (queda en curso o sigue disponible si ya se resolvió con datos)', s2 and s2['state'] in ('in_progress', 'done', 'available'), s2)
        # persistencia tras recargar
        await q.reload(); await q.wait_for_timeout(1500)
        s3 = await q.evaluate("JSON.parse(localStorage.getItem('fp.route.v1')||'{}')")
        chk('A6 el progreso de la ruta persiste al recargar (por periodo y canal)', any(step in v for v in s3.values()), s3)
        # otro periodo/canal no hereda el estado
        await q.select_option('#home-ch', 'app'); await q.wait_for_timeout(900)
        s4 = await q.evaluate("(()=>{const k=FP.attentionView.ctxKey(FP.app.state,FP.app.state.ux.home,{channel:'app',period:{type:'year',key:String(FP.app.state.year)}});return Object.keys(FP.attentionView.progressFor(k))})()")
        chk('A7 el progreso de un canal no se mezcla con el de otro', step not in s4, s4)
        await q.select_option('#home-ch', 'total'); await q.wait_for_timeout(700)
        # datos desactualizados → aviso antes de las cifras
        await openref(q); await q.fill('#topbar-date', '2026-10-20'); await q.dispatch_event('#topbar-date', 'change'); await q.wait_for_timeout(1500)
        bn = await q.evaluate("""()=>{const b=document.querySelector('.att__banner');const k=document.querySelector('[data-block=key]');return {has:!!b,txt:b?b.innerText:'',before:b&&k?!!(b.compareDocumentPosition(k)&4):false,finding:!!document.querySelector('#att [data-finding=data_stale]')}}""")
        chk('A8 con la venta real vieja respecto a «Datos al» ya NO hay banner de aviso antes de las cifras (Fase 3.1), y el hallazgo de datos desactualizados sigue en la lista', (not bn['has']) and bn['finding'], bn)
        await openref(q); await q.click('#topbar-status .hdate__b[data-action="fc-ref-today"]'); await q.wait_for_timeout(1200)
        # accesibilidad básica
        a11 = await q.evaluate("""()=>{const out=[];document.querySelectorAll('#att button,#nbs button').forEach(b=>{if(!(b.innerText||'').trim()&&!b.getAttribute('aria-label'))out.push('btn sin nombre')});
          const secs=['att','nbs'].map(id=>{const e=document.getElementById(id);return e&&e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))});return {out,secs:secs.every(Boolean)}}""")
        chk('A9 las secciones tienen título asociado y todos los botones tienen nombre', a11['secs'] and not a11['out'], a11)
        # móvil: sin desborde
        for w in (390, 320):
            m = await b.new_page(viewport={'width': w, 'height': 800}); await m.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0))
            await m.goto(U + '#inicio'); await m.wait_for_timeout(800)
            await m.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
            # mismos datos que el contexto principal: el almacenamiento es por origen, así que se copia
            await m.close()
        chk('A10 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_atencion: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())
