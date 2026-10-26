"""Calibración de la proyección del año siguiente (vista Proyección): sin historia, con historia, botones, deshacer, interruptor, persistencia, reparto sugerido, celular.
Uso: python3 batch_proyeccion_calibracion.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:600] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
READY = "window.FP && FP.app && FP.app.state && !document.getElementById('boot')"
# Historia con la tubería real de carga: los años de `years` completos y `last` meses del último (cada año con su semilla)
FIX = """(cfg) => {
  const S = FP.app.state, DM = FP.dataModel, ST = FP.dataStore, IMP = FP.importer;
  const build = (year, nm, seed) => { const ds = DM.createDataset(year, { source: 'mock', label: 'Hist' });
    for (let m = 1; m <= nm; m++) { const mo = FP.mock.generateMonth({ year, month: m, actualUntil: `${year}-12-31`, seed: seed + m }); DM.allRecords(mo).forEach((r) => DM.upsertRecord(ds, r)); } return ds; };
  const imp = (ds, type, name) => { const o = ST.datasetToRows(ds, type); if (!o.rows.length) return; const staged = IMP.stageRows(o.headers, o.rows, { fileName: name, dataType: type });
    const res = IMP.process(staged, { settings: S.settings, existing: ST.records(S.store, type) }); ST.commitBatch(S.store, staged, res, { includeErrorRows: true, settings: S.settings }); };
  cfg.years.forEach((y) => imp(build(y, 12, 100 * (y - 2000)), 'actual', `hist${y}.csv`));
  if (cfg.last) imp(build(cfg.lastYear, cfg.last, 100 * (cfg.lastYear - 2000)), 'actual', `hist${cfg.lastYear}.csv`);
  FP.app.saveStore(['actual']);
  S.dataset = ST.consolidate(S.store, S.year, { planFallback: null }); S.fc.run = null; FP.app.render();
  return ST.records(S.store, 'actual').length;
}"""
VIEW = "document.getElementById('projection-view').innerText"
async def goto(q):
    await q.evaluate("location.hash='#proyeccion'"); await q.wait_for_timeout(700)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#proyeccion'); await q.wait_for_function(READY, timeout=60000); await q.wait_for_timeout(600)
        await goto(q)
        t = await q.evaluate(VIEW)
        chk('A1 sin datos: la vista no se rompe y dice que no hay datos', 'Todavía no hay datos' in t or 'Proyección de' in t)

        # 18 meses (2025 y 6 de 2026): no alcanza para calibrar
        n = await q.evaluate(FIX, {'years': [2025], 'last': 6, 'lastYear': 2026}); chk('B0 se cargó historia corta', n > 1000, n)
        await q.evaluate("FP.app.state.year = 2026; FP.app.render()"); await goto(q)
        t = await q.evaluate(VIEW)
        chk('B1 con menos de 24 meses: «Calibración de la proyección» dice que todavía no calibra y cuántos hacen falta', 'Calibración de la proyección' in t and 'Todavía no calibra' in t and '24' in t, t[:300])
        chk('B2 sigue la regla inicial y la proyección sale', 'Regla inicial' in t and 'Proyección' in t)
        chk('B3 el botón «Calibrar ahora» avisa sin romper nada', await q.evaluate("(()=>{document.querySelector('[data-action=pcal-run]').click(); return true;})()"))
        await q.wait_for_timeout(300)

        # Historia larga: 2023, 2024, 2025 completos y 8 meses de 2026 → 44 meses
        await q.evaluate("FP.app.state.store = FP.dataStore.createStore(); FP.app.state.pcal.cache = null")
        n = await q.evaluate(FIX, {'years': [2023, 2024, 2025], 'last': 8, 'lastYear': 2026}); chk('C0 se cargó historia de 44 meses', n > 3000, n)
        await q.evaluate("FP.app.state.year = 2026; FP.app.state.pcal.cache = null; FP.app.render()"); await goto(q)
        t = await q.evaluate(VIEW)
        chk('C1 con 44 meses aparece la tabla por canal con el error y la banda', 'Error a 12 meses' in t and 'Total digital' in t and 'Banda' in t, t[:400])
        chk('C2 el estado muestra que calibra sola (interruptor encendido por defecto)', await q.evaluate("document.querySelector('#projection-view input[data-action=pcal-auto]').checked"))
        an = await q.evaluate("(() => { const r = FP.app.pcalAnalysis(); return { st: r.status, months: r.monthsUsed, last: r.lastClosedKey }; })()")
        chk('C3 el análisis está listo y cuenta los 44 meses', an['st'] == 'ok' and an['months'] >= 40, an)
        saved = await q.evaluate("FP.app.state.pcal.saved")
        chk('C4 la calibración automática ya corrió al abrir (queda en el historial como automática)', saved['history'] and saved['history'][0]['trigger'] == 'auto' and saved['lastAutoMonth'], saved)
        # Apagar auto, volver a la regla inicial, calibrar a mano, deshacer
        await q.evaluate("(()=>{const c=document.querySelector('#projection-view input[data-action=pcal-auto]'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true}));})()")
        await q.wait_for_timeout(300)
        a = await q.evaluate("FP.app.state.pcal.saved.auto")
        chk('D1 apagar «calibrar sola» se respeta', a is False)
        await q.evaluate("FP.app.actions['pcal-reset']()"); await q.wait_for_timeout(300)
        act = await q.evaluate("FP.app.state.pcal.saved.active")
        chk('D2 «Volver a la regla inicial» deja la regla inicial y lo anota', act is None and await q.evaluate("FP.app.state.pcal.saved.history.some((h)=>h.kind==='reset')"))
        base = await q.evaluate("FP.projectionView.compute(FP.app.state).projection.total")
        await q.evaluate("FP.app.actions['pcal-run']()"); await q.wait_for_timeout(300)
        after = await q.evaluate("(() => { const r = FP.projectionView.compute(FP.app.state); return { total: r.projection.total, meta: r.meta.total, windows: r.rows.map(x=>x.window) }; })()")
        chk('D3 «Calibrar ahora» deja una ventana por canal y nunca toca la meta', len(after['windows']) == 4 and all(w in (2, 3, 6, 12) for w in after['windows']), after)
        metaBefore = await q.evaluate("FP.projectionView.compute(FP.app.state).meta.total")
        chk('D4 la meta es la misma antes y después (base × crecimiento)', metaBefore == after['meta'])
        await q.evaluate("FP.app.actions['pcal-undo']()"); await q.wait_for_timeout(300)
        back = await q.evaluate("FP.projectionView.compute(FP.app.state).projection.total")
        chk('D5 «Deshacer» devuelve la proyección que había antes de calibrar', back == base, [back, base])
        # Persistencia: recargar
        await q.evaluate("FP.app.actions['pcal-run']()"); await q.wait_for_timeout(300)
        w1 = await q.evaluate("JSON.stringify(FP.app.projParams())")
        await q.reload(); await q.wait_for_function(READY, timeout=60000); await q.wait_for_timeout(600)
        w2 = await q.evaluate("JSON.stringify(FP.app.projParams())")
        chk('E1 la calibración se conserva al recargar en este navegador', w1 == w2, [w1, w2])
        await q.screenshot(path=os.environ.get('SHOT','/tmp/pj_cal.png'), full_page=True)
        # Reparto sugerido
        await q.evaluate("FP.app.state.pcal.saved.active = { params: { windows: FP.app.projParams().windows, shareMethod: 'trend', shapeMethod: 'base' }, at: '2026-10-20T10:00:00Z', monthsUsed: 44, summary: null }; FP.app.render()")
        await q.evaluate("location.hash='#proyeccion'"); await q.wait_for_timeout(500)
        sug = await q.evaluate("FP.projectionView.compute(FP.app.state).suggestedShares")
        chk('F1 el reparto sugerido suma 100', sug and abs(sum(sug.values()) - 100) < 1e-6, sug)
        before = await q.evaluate("FP.app.state.proj.shares")
        await q.evaluate("FP.app.actions['proj-use-suggested']()"); await q.wait_for_timeout(200)
        used = await q.evaluate("FP.app.state.proj.shares")
        chk('F2 «Usar el reparto sugerido» lo pone como participación (antes no se aplicaba solo)', before is None and used == sug, [before, used])
        # Exportación
        ex = await q.evaluate("FP.projection.toExport(FP.projectionView.compute(FP.app.state), {}).assumptions.calibration")
        chk('F3 la exportación dice qué calibración se usó', ex and 'windows' in ex, ex)
        # Nube: con la sincronización encendida, guardar la calibración la manda a Supabase (clave liviana)
        sent = await q.evaluate("""async () => { const S = FP.app.state; const keys = []; const orig = FP.cloud.pushKeys;
          FP.cloud.pushKeys = async (prov, ks) => { keys.push(...ks); return { ok: true, at: new Date().toISOString() }; };
          S.cloud.auto.on = true; FP.app.actions['pcal-run'](); await new Promise((r) => setTimeout(r, (FP.config.cloud.autoDebounceMs || 2000) + 800));
          FP.cloud.pushKeys = orig; S.cloud.auto.on = false; return keys; }""")
        chk('F4 con la sincronización encendida la calibración se manda a la nube (projectionCalibration)', 'projectionCalibration' in sent, sent)
        # Celular
        m = await b.new_context(viewport={'width': 390, 'height': 800}); mq = await m.new_page()
        await mq.goto(f'http://127.0.0.1:{port}/index.html#proyeccion'); await mq.wait_for_function(READY, timeout=60000)
        await mq.evaluate(FIX, {'years': [2023, 2024, 2025], 'last': 8, 'lastYear': 2026}); await mq.evaluate("FP.app.state.year = 2026; FP.app.render()"); await mq.evaluate("location.hash='#proyeccion'"); await mq.wait_for_timeout(700)
        ov = await mq.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        chk('G1 en celular la página no se desborda de lado', ov <= 1, ov)
        small = await mq.evaluate("[...document.querySelectorAll('#projection-view [data-action^=pcal-]')].filter(e=>e.tagName==='BUTTON').every(e=>e.getBoundingClientRect().height>=40)")
        chk('G2 los botones de calibración son tocables (≥ 40 px)', small)
        chk('H1 sin errores de consola ni de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print('\nFALLAS:', fails if fails else 'ninguna'); sys.exit(1 if fails else 0)
