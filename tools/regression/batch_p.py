"""Mes por defecto y selección de periodo/canal (revisión posterior a la Fase 10). Uso: python3 batch_p.py <raiz>   Sale 1 si alguna falla.
P-1 con el reloj fijado: el día 1 (mes en curso sin venta real) Diagnóstico, Recovery Center y Narrativa abren en el último mes con venta real;
    a mitad de un mes con venta real abren ese mes; un mes elegido a mano se respeta.
P-2 Narrativa: periodo (mes, semana, año), cuál y canal se cambian ahí mismo y es la misma selección que Diagnóstico.
P-3 Paquete: periodo y canal se cambian en la página y mueven Diagnóstico, Recovery, Narrativa y Producto; el zip sale con esa selección."""
import asyncio, sys, os, io, json, zipfile, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
async def fresh(b, when):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True); q = await c.new_page()
    await q.clock.set_fixed_time(when)
    u = f'http://127.0.0.1:{port}/index.html'
    await q.goto(u + '#resumen'); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
    try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(300)
    except Exception: pass
    return c, q, u
SEL = "({dx:FP.app.state.dx.settings.periodKey, rc:FP.app.state.rc.settings.periodKey, last:(FP.app.state.store.actual.records.map(r=>r.date).sort().pop()||'')})"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        # ---------- P-1 día 1 ----------
        c, q, u = await fresh(b, dt.datetime(2026, 10, 1, 9, 0)); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(900)
        d1 = await q.evaluate(SEL); key1 = await q.evaluate("document.getElementById('dx-key').value")
        await q.goto(u + '#recovery'); await q.wait_for_timeout(900)
        r1 = await q.evaluate("[FP.app.state.rc.settings.periodKey, (document.getElementById('rc-pkey')||{}).value]")
        await q.goto(u + '#narrativa'); await q.wait_for_timeout(900)
        n1 = await q.evaluate("document.getElementById('nx-controls').innerText.replace(/\\s+/g,' ')")
        chk('P-1 día 1 de octubre (mes en curso sin venta real): Diagnóstico abre en el último mes con venta real (septiembre)', d1['last'].startswith('2026-09') and d1['dx'] == '2026-09' and key1 == '2026-09', (d1, key1))
        chk('P-1 Recovery Center también abre en septiembre', r1 == ['2026-09', '2026-09'], r1)
        chk('P-1 la Narrativa narra septiembre', 'Septiembre 2026' in n1, n1[:200])
        # elegido a mano: se respeta
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(500)
        await q.select_option('#dx-key', '2026-10'); await q.wait_for_timeout(600)
        await q.goto(u + '#inicio'); await q.wait_for_timeout(300); await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        chk('P-1 si eliges octubre a mano, se respeta (no se cambia solo)', await q.evaluate("document.getElementById('dx-key').value") == '2026-10')
        await c.close()
        # mitad de mes con venta real
        c, q, u = await fresh(b, dt.datetime(2026, 9, 25, 9, 0)); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(800)
        chk('P-1 a mitad de un mes con venta real (25 de septiembre) abre ese mes, como antes', await q.evaluate("FP.app.state.dx.settings.periodKey") == '2026-09')
        await c.close()
        # ---------- P-2 Narrativa ----------
        c, q, u = await fresh(b, dt.datetime(2026, 10, 1, 9, 0)); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#narrativa'); await q.wait_for_timeout(900)
        ctl = await q.evaluate("[!!document.getElementById('nx-key'), !!document.getElementById('nx-ch'), document.querySelectorAll('#nx-controls [data-action=\"dx-period-type\"]').length, document.querySelector('label[for=\"nx-key\"]').innerText, document.querySelector('label[for=\"nx-ch\"]').innerText]")
        chk('P-2 la Narrativa tiene sus propios controles: periodo (mes, semana, año), «Cuál» y «Canal», con etiqueta', ctl == [True, True, 3, 'Cuál', 'Canal'], ctl)
        await q.select_option('#nx-ch', 'app'); await q.wait_for_timeout(700)
        await q.click('#nx-controls [data-action="dx-period-type"][data-value="year"]'); await q.wait_for_timeout(900)
        n2 = await q.evaluate("[document.getElementById('nx-controls').innerText.replace(/\\s+/g,' '), FP.app.state.dx.settings.channel, FP.app.state.dx.settings.periodType, FP.app.state.nx.narrative && FP.app.state.nx.narrative.channel.id]")
        chk('P-2 cambiar canal (App) y periodo (Año) en la Narrativa la recalcula con esa selección', n2[1] == 'app' and n2[2] == 'year' and n2[3] == 'app' and 'Año 2026' in n2[0], n2)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(700)
        dg = await q.evaluate("[document.getElementById('dx-ch').value, FP.app.state.dx.settings.periodType]")
        chk('P-2 es la misma selección que Diagnóstico (Diagnóstico muestra App y Año)', dg == ['app', 'year'], dg)
        await c.close()
        # ---------- P-3 Paquete ----------
        c, q, u = await fresh(b, dt.datetime(2026, 10, 1, 9, 0)); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#plan'); await q.wait_for_timeout(400)
        for a in ('plan-preview', 'plan-save'):
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass
        await q.goto(u + '#paquete'); await q.wait_for_timeout(900)
        has = await q.evaluate("[!!document.getElementById('pkg-key'), !!document.getElementById('pkg-ch'), document.querySelectorAll('#view-paquete [data-action=\"pkg-context\"][data-key=\"periodType\"]').length, document.getElementById('pkg-key').value]")
        chk('P-3 la página del paquete trae periodo, «Cuál» y «Canal», y arranca en el último mes con venta real', has == [True, True, 3, '2026-09'], has)
        await q.select_option('#pkg-ch', 'app'); await q.wait_for_timeout(600)
        await q.select_option('#pkg-key', '2026-08'); await q.wait_for_timeout(800)
        st = await q.evaluate("({dx:[FP.app.state.dx.settings.channel,FP.app.state.dx.settings.periodKey], rc:[FP.app.state.rc.settings.channel,FP.app.state.rc.settings.periodKey], pa:[FP.app.state.pa.channel,FP.app.state.pa.from,FP.app.state.pa.to]})")
        chk('P-3 cambiar canal (App) y mes (agosto) en el paquete mueve Diagnóstico, Recovery y Producto (agosto completo)', st['dx'] == ['app', '2026-08'] and st['rc'] == ['app', '2026-08'] and st['pa'] == ['app', '2026-08-01', '2026-08-31'], st)
        async with q.expect_download(timeout=60000) as d:
            await q.click('[data-action="pkg-download"]')
        z = zipfile.ZipFile(io.BytesIO(open(await (await d.value).path(), 'rb').read())); names = z.namelist()
        idx = json.loads(z.read('indice.json')); files = {f['key']: f['file'] for f in idx['files']}
        chk('P-3 el zip sale con esa selección: Diagnóstico, Recovery y Narrativa de agosto en App', files['analysis'] == 'analysis_export_2026-08_app.json' and files['actionPlan'] == 'action_plan_export_2026-08.json' and files['narrative'] == 'narrative_export_2026-08_app.json', files)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        chk('P-3 al volver a Diagnóstico la selección es la misma (App, agosto)', await q.evaluate("[document.getElementById('dx-ch').value, document.getElementById('dx-key').value]") == ['app', '2026-08'])
        await c.close()
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_p:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
