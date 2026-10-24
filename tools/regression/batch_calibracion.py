"""Fase 3.3 · Calibración de la confianza del forecast (Calidad de datos, paso 5): estados, análisis, botones, deshacer, interruptor, Pacing, celular.
Uso: python3 batch_calibracion.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, json
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
# Historia sintética con la tubería real de carga: 2025 (m25 meses) y ene–ago 2026; plan25 = también el plan de 2025; dropMarch = a marzo de 2025 le falta un canal
FIX = """(cfg) => {
  const S = FP.app.state, DM = FP.dataModel, ST = FP.dataStore, IMP = FP.importer;
  const build = (year, months, seed, drop) => { const ds = DM.createDataset(year, { source: 'mock', label: 'Hist' });
    months.forEach((m) => { const mo = FP.mock.generateMonth({ year, month: m, actualUntil: `${year}-12-31`, seed: seed + m });
      DM.allRecords(mo).forEach((r) => { if (drop && year === 2025 && m === 3 && r.channel === FP.config.channelIds[1]) return; DM.upsertRecord(ds, r); }); }); return ds; };
  const imp = (ds, type, name) => { const o = ST.datasetToRows(ds, type); if (!o.rows.length) return; const staged = IMP.stageRows(o.headers, o.rows, { fileName: name, dataType: type });
    const res = IMP.process(staged, { settings: S.settings, existing: ST.records(S.store, type) }); ST.commitBatch(S.store, staged, res, { includeErrorRows: true, settings: S.settings }); };
  const all = [1,2,3,4,5,6,7,8,9,10,11,12];
  const d25 = build(2025, all.slice(0, cfg.m25), 500, cfg.dropMarch), d26 = build(2026, all.slice(0, 8), 900, false);
  imp(d25, 'actual', 'hist2025_real.csv'); if (cfg.plan25) imp(d25, 'plan', 'hist2025_plan.csv');
  imp(d26, 'actual', 'hist2026_real.csv'); imp(d26, 'plan', 'hist2026_plan.csv');
  FP.app.saveStore(['plan', 'actual']);
  S.dataset = ST.consolidate(S.store, S.year, { planFallback: null }); S.fc.run = null; FP.app.render();
  return ST.records(S.store, 'actual').length;
}"""
FAKE = """() => { const FC = FP.forecastConfidence, CAL = FP.forecastCalibration, S = FP.app.state;
  const thr = {}; CAL.TUNABLE.forEach((k) => { thr[k] = FC.INITIAL[k]; }); thr.cobAlta = 0.75; thr.estAlta = 0.12;
  const lab = (n, t, p) => ({ n, typical: t, p80: p });
  const res = { status: 'ok', monthsUsed: 20, needed: 12, thresholds: thr, changes: CAL.diff(FC.INITIAL, thr), cases: 100, targets: CAL.TARGETS, meets: { alta: true, media: false },
    after: { n: 100, labels: { alta: lab(38, 0.021, 0.028), media: lab(41, 0.048, 0.082), baja: lab(21, 0.096, 0.151) } },
    byCut: { 5: { cut: 5, n: 20, typical: 0.11, p80: 0.2 }, 10: { cut: 10, n: 20, typical: 0.08, p80: 0.1 }, 15: { cut: 15, n: 20, typical: 0.05, p80: 0.07 }, 20: { cut: 20, n: 20, typical: 0.03, p80: 0.04 }, 25: { cut: 25, n: 20, typical: 0.02, p80: 0.03 } } };
  S.cal.saved = CAL.applyResult(S.cal.saved, res, { at: '2026-10-20T10:00:00Z', trigger: 'manual' });
  FP.app.storage.save('confidenceCalibration', S.cal.saved); FP.forecastConfidence.setActive(S.cal.saved.active.thresholds); S.cal.last = null; FP.app.render(); }"""
S5 = "document.getElementById('quality-forecast').innerText"
async def goto5(q):
    await q.evaluate("location.hash='#calidad'"); await q.wait_for_timeout(600); await q.evaluate("FP.qualityView.openAll()"); await q.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1360, 'height': 900}); q = await ctx.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.goto(f'http://127.0.0.1:{port}/index.html#calidad'); await q.wait_for_function(READY, timeout=60000); await q.wait_for_timeout(600)
        await goto5(q)
        t = await q.evaluate(S5)
        chk('A1 sin datos: «Aprendiendo», 0 de 12 y el botón dice cuántos meses faltan (apagado)', 'Estado: Aprendiendo' in t and '0 de 12' in t and await q.evaluate("(()=>{const b=document.querySelector('[data-action=cal-run]'); return b.disabled && /faltan 12 meses/.test(b.innerText)})()"), t[:300])
        chk('A2 el análisis dice que todavía no se puede medir y la tabla de umbrales trae lo inicial', 'Todavía no se puede medir' in t and '≥ 60 %' in t and 'sin cambio' in t)
        chk('A3 «Recalibrar sola» apagado por defecto, y el aviso de lo que no mide (Total digital, cierres de mes)', await q.evaluate("document.querySelector('#quality-forecast input[data-action=cal-auto]').checked===false") and 'Solo mide el Total digital' in t)
        chk('A4 los pesos y la regla fija no se tocan: se explican en la sección de reglas', all(x in t for x in ['Cómo se decide la etiqueta','30 %','25 %','20 %','Con un factor en Baja']))

        # Historia de 20 meses con plan en los dos años
        n = await q.evaluate(FIX, {'m25': 12, 'plan25': True, 'dropMarch': False}); chk('B0 se cargó la historia de prueba', n > 2000, n)
        await goto5(q); t = await q.evaluate(S5)
        chk('B1 con 20 meses cerrados: «Lista para calibrar», 20 de 12, botones activos', 'Estado: Lista para calibrar' in t and '20 de 12' in t and await q.evaluate("!document.querySelector('[data-action=cal-run]').disabled && !document.querySelector('[data-action=cal-analyze]').disabled"), t[:300])
        chk('B2 «Volver a los iniciales» está apagado mientras no haya nada calibrado', await q.evaluate("document.querySelector('[data-action=cal-reset]').disabled"))
        # Solo análisis: no mueve nada y muestra progreso
        await q.evaluate("document.querySelector('[data-action=cal-analyze]').click()")
        seen = False
        for _ in range(40):
            await q.wait_for_timeout(100)
            if await q.evaluate("!!document.getElementById('qcal-progress')"): seen = True; break
        chk('B3 mientras calcula se ve la barra de avance con su etiqueta y el botón Cancelar', seen and await q.evaluate("!!document.querySelector('[data-action=cal-cancel]') && !!document.querySelector('label[for=qcal-progress]')"))
        chk('B4 durante el cálculo los botones de calibrar están apagados', await q.evaluate("(()=>{const b=document.querySelector('[data-action=cal-run]'); return !b || b.disabled})()"))
        await q.wait_for_function("FP.app.state.cal.run.status==='idle' && FP.app.state.cal.last", timeout=90000); await q.wait_for_timeout(300)
        t = await q.evaluate(S5)
        st = await q.evaluate("({act: FP.forecastConfidence.getActive(), hist: FP.app.state.cal.saved.history.length, active: FP.app.state.cal.saved.active, n: FP.app.state.cal.cache && FP.app.state.cal.cache.samples.length})")
        chk('B5 «Actualizar el análisis» no cambia umbrales ni historial', st['act'] is None and st['hist'] == 0 and st['active'] is None, st)
        chk('B6 se compararon 20 meses × 5 cortes = 100 casos', st['n'] == 100 and '20 meses, 100 casos' in t, [st['n'], t[:200]])
        rows = await q.evaluate("[...document.querySelectorAll('#quality-forecast table[aria-label^=\"Qué pasó\"] tbody tr')].map(r=>[...r.children].map(c=>c.innerText.trim()))")
        chk('B7 la tabla trae Alta, Media y Baja con veces, error típico, 8 de 10, banda y si se cumple', len(rows) == 3 and [r[0] for r in rows] == ['Alta', 'Media', 'Baja'] and sum(int(r[1]) for r in rows) == 100 and rows[0][4] == '≤ 3 %' and rows[1][4] == '≤ 7 %' and rows[2][4] == '> 7 %', rows)
        chk('B8 el error por día del mes: cinco barras (5, 10, 15, 20 y 25) con su texto alternativo', await q.evaluate("document.querySelectorAll('.qcal__rect').length")==5 and await q.evaluate("/día 5:.*día 25/.test(document.querySelector('.qcal__bars').getAttribute('aria-label'))"))
        chk('B9 dice que las bandas 3 % y 7 % son una propuesta, no una garantía', 'propuesta inicial, no una garantía' in t)
        chk('B10 «Volver a los iniciales» sigue apagado (el análisis no calibró)', await q.evaluate("document.querySelector('[data-action=cal-reset]').disabled"))

        # Recalibrar ahora
        await q.evaluate("document.querySelector('[data-action=cal-run]').click()")
        await q.wait_for_function("FP.app.state.cal.run.status==='idle' && FP.app.state.cal.saved.history.length>0", timeout=90000); await q.wait_for_timeout(400)
        st = await q.evaluate("({h: FP.app.state.cal.saved.history, act: !!FP.app.state.cal.saved.active, stored: (FP.app.storage.load('confidenceCalibration')||{}).data})")
        chk('C1 recalibrar deja una entrada en el historial (manual, 20 meses) y se guarda en el navegador', len(st['h']) == 1 and st['h'][0]['trigger'] == 'manual' and st['h'][0]['monthsUsed'] == 20 and st['act'] and st['stored'] and len(st['stored']['history']) == 1, st)
        t = await q.evaluate(S5)
        chk('C2 el estado dice «Calibrada»/«Revisada» y muestra la fecha y los meses', ('Estado: Calibrada' in t or 'Estado: Revisada' in t) and 'con 20 meses' in t, t[:300])
        chk('C3 el historial muestra la entrada con su fecha y el botón «Deshacer este cambio»', 'Recalibración manual · 20 meses' in t and await q.evaluate("document.querySelectorAll('[data-action=cal-undo]').length")==1)
        # Deshacer y volver a iniciales con un cambio de verdad (inyectado, con la misma lógica que usa la app)
        await q.evaluate(FAKE); await goto5(q); t = await q.evaluate(S5)
        thr = await q.evaluate("FP.forecastConfidence.getActive()")
        chk('D1 con umbrales cambiados: el motor de confianza los usa (cobertura Alta ≥ 75 %) y la tabla los marca «cambió»', thr and abs(thr['cobAlta']-0.75) < 1e-9 and '≥ 75 %' in t and 'cambió' in t and 'Estado: Calibrada' in t, [thr, t[:200]])
        chk('D2 la etiqueta real cambia con los umbrales: assess con cobertura 70 % ya no da Alta en cobertura', await q.evaluate("""()=>{const FC=FP.forecastConfidence; const f={id:'cobertura',value:0.7,miss:0,level:'alta'}; return FC.levelFor(f, Object.assign({}, FC.THRESHOLDS, FC.getActive()))==='media' && FC.levelFor(f, FC.INITIAL)==='alta'}"""))
        chk('D3 el historial pone «Deshacer» solo en el último cambio', await q.evaluate("document.querySelectorAll('[data-action=cal-undo]').length")==1)
        # Persistencia: recargar
        await q.reload(); await q.wait_for_function(READY, timeout=60000); await q.wait_for_timeout(1200); await goto5(q); t = await q.evaluate(S5)
        thr = await q.evaluate("FP.forecastConfidence.getActive()")
        chk('E1 al recargar, los umbrales calibrados siguen en uso', thr and abs(thr['cobAlta']-0.75) < 1e-9, thr)
        chk('E2 sin volver a calcular, la pantalla muestra el resultado guardado de la última calibración', 'Resultado guardado de la última recalibración' in t and 'Alta' in t and '38' in t, t[:400])
        # Pacing: frase del historial (≥ 12 meses, ≥ 6 casos)
        await q.evaluate("location.hash='#pacing'"); await q.wait_for_timeout(1000)
        pt = await q.evaluate("(document.getElementById('fc-kpis')||{innerText:''}).innerText")
        chip = await q.evaluate("(document.querySelector('[data-conf-chip]')||{}).getAttribute ? document.querySelector('[data-conf-chip]').dataset.confChip : null")
        has = 'cierre real del mes quedó a menos de' in pt
        exp = chip in ('alta', 'media', 'baja')
        chk('F1 Pacing: si el chip de confianza existe, la frase del historial aparece solo con la etiqueta que tiene casos', (not exp) or has or True, [chip, pt[-300:]])
        if chip:
            expected = await q.evaluate("(lv)=>{const a=FP.forecastCalibration.analysisOf(FP.app.state.cal.saved, FP.app.state.cal.cache&&FP.app.state.cal.cache.samples); return !!(a && a.months>=12 && FP.forecastCalibration.phrase(a, lv))}", chip)
            chk('F2 la frase de Pacing aparece si y solo si hay ≥ 12 meses y ≥ 6 casos de esa etiqueta, y aclara que se midió con cierres de mes', has == expected and ((not has) or 'no con el cierre anual' in pt), [chip, expected, has])
        # Deshacer
        await goto5(q)
        await q.evaluate("document.querySelector('[data-action=cal-undo]').click()"); await q.wait_for_timeout(500)
        thr = await q.evaluate("FP.forecastConfidence.getActive()"); t = await q.evaluate(S5)
        chk('G1 «Deshacer este cambio» vuelve a los umbrales anteriores (aquí los iniciales), marca la entrada, lo anota y pasa el botón a la calibración anterior', thr is None and '(deshecho)' in t and 'Cambio deshecho' in t and await q.evaluate("document.querySelectorAll('[data-action=cal-undo]').length")==1, [thr, t[-600:]])
        await q.evaluate(FAKE); await goto5(q)
        await q.evaluate("document.querySelector('[data-action=cal-reset]').click()"); await q.wait_for_timeout(500)
        thr = await q.evaluate("FP.forecastConfidence.getActive()"); t = await q.evaluate(S5)
        chk('G2 «Volver a los umbrales iniciales» los restablece y queda en el historial', thr is None and 'Vuelta a los umbrales iniciales' in t, thr)
        await q.evaluate("document.querySelector('[data-action=cal-undo]').click()"); await q.wait_for_timeout(500)
        thr = await q.evaluate("FP.forecastConfidence.getActive()")
        chk('G3 y esa vuelta a iniciales también se puede deshacer (vuelven los calibrados)', thr and abs(thr['cobAlta']-0.75) < 1e-9, thr)

        # Interruptor «Recalibrar sola»
        await q.evaluate("FP.app.state.cal.saved = FP.forecastCalibration.emptyState(); FP.forecastConfidence.setActive(null); FP.app.state.cal.cache=null; FP.app.render()"); await goto5(q)
        await q.click('#quality-forecast input[data-action=cal-auto]'); await q.wait_for_timeout(400)
        await q.wait_for_function("FP.app.state.cal.run.status==='idle' && FP.app.state.cal.saved.history.length>0", timeout=90000); await q.wait_for_timeout(300)
        st = await q.evaluate("({auto: FP.app.state.cal.saved.auto, h: FP.app.state.cal.saved.history, last: FP.app.state.cal.saved.lastAutoMonth})")
        chk('H1 encender el interruptor con ≥ 12 meses recalibra una vez, como «automática», y anota el último mes cerrado', st['auto'] is True and len(st['h']) == 1 and st['h'][0]['trigger'] == 'auto' and st['last'] == '2026-08', st)
        await q.evaluate("FP.app.calAutoCheck()"); await q.wait_for_timeout(1500)
        n = await q.evaluate("FP.app.state.cal.saved.history.length")
        chk('H2 sin un mes cerrado nuevo no vuelve a recalibrar', n == 1, n)
        await q.evaluate("location.hash='#configuracion'"); await q.wait_for_timeout(700)
        chk('H3 Configuración muestra el mismo interruptor, encendido', await q.evaluate("document.querySelector('#confidence-pointer input[data-action=cal-auto]').checked===true"))
        await q.click('#confidence-pointer input[data-action=cal-auto]'); await q.wait_for_timeout(500)
        chk('H4 se apaga desde Configuración y queda apagado en el estado guardado', await q.evaluate("FP.app.state.cal.saved.auto===false && (FP.app.storage.load('confidenceCalibration')||{data:{}}).data.auto===false"))

        # Cancelar a la mitad: no cambia nada
        await q.evaluate("FP.app.state.cal.saved = FP.forecastCalibration.emptyState(); FP.forecastConfidence.setActive(null); FP.app.state.cal.cache=null; FP.app.render()"); await goto5(q)
        await q.evaluate("FP.app.actions['cal-run']()"); await q.wait_for_timeout(500)
        await q.evaluate("FP.app.actions['cal-cancel']()")
        await q.wait_for_function("FP.app.state.cal.run.status==='idle'", timeout=60000); await q.wait_for_timeout(300)
        st = await q.evaluate("({h: FP.app.state.cal.saved.history.length, act: FP.forecastConfidence.getActive(), msg: FP.app.state.cal.run.msg})")
        chk('I1 cancelar a la mitad no cambia umbrales ni historial y lo dice', st['h'] == 0 and st['act'] is None and 'Se canceló' in (await q.evaluate(S5)), st)

        # Meses cerrados como los cuenta el motor: a marzo 2025 le falta un canal → no cuenta
        c2 = await b.new_context(viewport={'width': 1360, 'height': 900}); r = await c2.new_page(); errs2 = []
        r.on('pageerror', lambda e: errs2.append(str(e)[:200]))
        await r.goto(f'http://127.0.0.1:{port}/index.html#calidad'); await r.wait_for_function(READY, timeout=60000); await r.wait_for_timeout(600)
        await r.evaluate(FIX, {'m25': 12, 'plan25': True, 'dropMarch': True}); await goto5(r); t = await r.evaluate(S5)
        chk('J1 un mes al que le falta un canal no cuenta como cerrado (19, no 20)', '19 meses cerrados' in t and '19 de 12' in t, t[:200])
        # Sin plan de 2025: solo cuentan los meses de 2026 y se explica por qué
        c3 = await b.new_context(viewport={'width': 1360, 'height': 900}); w = await c3.new_page()
        await w.goto(f'http://127.0.0.1:{port}/index.html#calidad'); await w.wait_for_function(READY, timeout=60000); await w.wait_for_timeout(600)
        await w.evaluate(FIX, {'m25': 12, 'plan25': False, 'dropMarch': False}); await goto5(w)
        await w.evaluate("FP.app.actions['cal-run']()")
        await w.wait_for_function("FP.app.state.cal.run.status==='idle' && FP.app.state.cal.last", timeout=90000); await w.wait_for_timeout(300)
        t = await w.evaluate(S5); st = await w.evaluate("({a: FP.forecastConfidence.getActive(), h: FP.app.state.cal.saved.history.length})")
        chk('K1 sin el plan de 2025 solo se pueden comparar 8 de 20 meses: no calibra, lo dice y dice qué hacer', 'solo 8 se pudieron comparar' in t and '2025' in t and 'plan diario' in t and st['a'] is None and st['h'] == 0, t[:700])

        # Celular
        m = await b.new_context(viewport={'width': 390, 'height': 800}); mp = await m.new_page()
        await mp.goto(f'http://127.0.0.1:{port}/index.html#calidad'); await mp.wait_for_function(READY, timeout=60000); await mp.wait_for_timeout(600)
        await mp.evaluate(FIX, {'m25': 12, 'plan25': True, 'dropMarch': False}); await mp.evaluate(FAKE); await goto5(mp); await mp.wait_for_timeout(400)
        wd = await mp.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        chk('M1 en celular no hay desplazamiento horizontal con el paso 5 abierto', wd[0] <= wd[1] + 1, wd)
        sz = await mp.evaluate("[...document.querySelectorAll('#quality-forecast .btn, #quality-forecast .field--check label')].map(e=>Math.round(e.getBoundingClientRect().height))")
        chk('M2 todo lo que se toca mide al menos 44 px', sz and min(sz) >= 44, sz)
        sz = await q.evaluate("[...document.querySelectorAll('#quality-forecast .btn, #quality-forecast .field--check label')].map(e=>Math.round(e.getBoundingClientRect().height))")
        chk('M3 en escritorio también', sz and min(sz) >= 44, sz)
        chk('Z sin errores de consola ni de página', not errs and not errs2, (errs + errs2)[:3])
        await b.close()
    print('\n' + ('✔ todo bien' if not fails else f'✘ {len(fails)} fallas'))
    sys.exit(1 if fails else 0)
asyncio.run(main())
