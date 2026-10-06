"""Proyección del año siguiente. Uso: python3 batch_ai.py <raiz>
Datos sintéticos con resultado conocido (calculado aquí, aparte de la app): histórico 2025 completo y real de 2026 de enero a septiembre más dos días de octubre.
Venta diaria 2025 = k_canal × (100 + mes); real 2026 = 2025 × f_canal (ecommerce 1.20, app 1.30, whatsapp 0.85, llamadas 1.05). Pedidos 10 y tráfico 500 por día (CR 2 %).
Llamadas pierde 5 días de marzo de 2026 (cobertura 84 % → ese mes se toma de 2025). «Hoy» = 2026-10-02 (octubre no ha terminado).
AI-1 base = meses reales + meses faltantes del año anterior; AI-2 mes parcial no se usa; AI-3 ritmo de los últimos 2 meses; AI-4 meta sobre el total; AI-5 proyección y brecha;
AI-6 qué tendría que pasar; AI-7 reparto mensual exacto; AI-8 sensibilidad; AI-9 participaciones editadas; AI-10 guardar metas de 2027 sin tocar 2026 (y confirmar al reemplazar);
AI-11 mes sin dato en ningún año; AI-12 estado vacío; AI-13 menú, descargas y sin desborde de 320 a 1920 px."""
import asyncio, sys, os, re, json, datetime as dt, calendar, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:360] if d and not ok else ''))
    if not ok: fails.append(n)
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']; K = {'ecommerce': 1000, 'app': 600, 'whatsapp': 300, 'llamadas': 200}; F = {'ecommerce': 1.20, 'app': 1.30, 'whatsapp': 0.85, 'llamadas': 1.05}
dim = lambda y, m: calendar.monthrange(y, m)[1]
rev25 = lambda ch, m: K[ch] * (100 + m)                      # por día
def csv25(skip=None):
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for m in range(1, 13):
        for d in range(1, dim(2025, m) + 1):
            for ch in CH:
                if skip and skip(ch, m, d): continue
                rows.append(f'2025-{m:02d}-{d:02d},{ch},{rev25(ch, m)},10,500')
    return '\n'.join(rows) + '\n'
def csv26():
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for m in range(1, 10):
        for d in range(1, dim(2026, m) + 1):
            for ch in CH:
                if ch == 'llamadas' and m == 3 and d > 26: continue                          # 5 días sin dato
                rows.append(f'2026-{m:02d}-{d:02d},{ch},{round(rev25(ch, m) * F[ch], 2)},10,500')
    for d in (1, 2):
        for ch in CH: rows.append(f'2026-10-{d:02d},{ch},{round(rev25(ch, 10) * F[ch], 2)},10,500')   # octubre parcial
    return '\n'.join(rows) + '\n'
# ---- esperado, calculado aparte ----
def month25(ch, m): return rev25(ch, m) * dim(2025, m)
def month26(ch, m): return round(rev25(ch, m) * F[ch], 2) * dim(2026, m)
BASE = {}
for ch in CH:
    t = 0
    for m in range(1, 13):
        if m <= 9 and not (ch == 'llamadas' and m == 3): t += month26(ch, m)
        else: t += month25(ch, m)
    BASE[ch] = t
BT = sum(BASE.values()); G = 0.16
META_T = round(BT * (1 + G)); PROJ = {ch: BASE[ch] * (1 + (F[ch] - 1)) for ch in CH}; PT = sum(round(v) for v in PROJ.values())
num = lambda s_: float(re.sub(r'[^0-9.\-]', '', s_.replace('−', '-').replace(',', '')) or 'nan')
async def ctx(b, hist=None, real=True):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#carga'); await q.wait_for_timeout(300)
    for dtype, text in (('historical', hist), ('actual', csv26() if real else None)):
        if not text: continue
        await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': f'{dtype}.csv', 'mimeType': 'text/csv', 'buffer': text.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(300)
    return c, q, u, errs
async def open_proj(q, u):
    await q.goto(u + '#proyeccion'); await q.wait_for_selector('#projection-view .panel', timeout=20000); await q.wait_for_timeout(400)
RES = "(()=>FP.projectionView.compute(FP.app.state))()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c, q, u, errs = await ctx(b, hist=csv25()); await open_proj(q, u)
        r = await q.evaluate(RES)
        got = {x['id']: x['base'] for x in r['rows']}
        chk('AI-1 la base de cada canal = meses reales de 2026 + meses faltantes de 2025 (calculada aparte del CSV), y la total es su suma', all(abs(got[ch] - BASE[ch]) < 0.51 for ch in CH) and abs(r['base']['total'] - BT) < 2, (got, BASE))
        mon = {cc['id']: [m['source'] for m in cc['months']] for cc in r['channels']}
        chk('AI-1 fuente de cada mes: enero–septiembre real y octubre–diciembre del año anterior (y marzo de Llamadas, por cobertura del 84 %)', all(mon[ch] == ['real'] * 9 + ['prior_year'] * 3 for ch in CH if ch != 'llamadas') and mon['llamadas'] == ['real', 'real', 'prior_year'] + ['real'] * 6 + ['prior_year'] * 3, mon)
        notes = ' '.join(r['notes'])
        chk('AI-2 octubre no se usa a medias aunque tenga 2 días de venta: se avisa «mes en curso (2 de 31 días): se usa 2025 completo»', any('mes en curso (2 de 31 días)' in m['note'] for cc in r['channels'] for m in cc['months'] if m['key'] == '2026-10'), [m['note'] for m in r['channels'][0]['months'] if m['key'] == '2026-10'])
        chk('AI-2 la nota dice qué meses de Llamadas salen de 2025: Marzo, Octubre, Noviembre, Diciembre', 'Llamadas: Marzo, Octubre, Noviembre, Diciembre se toman de 2025' in notes, notes)
        l2 = {x['id']: x['last2'] for x in r['rows']}
        chk('AI-3 el ritmo de los últimos 2 meses (agosto y septiembre contra 2025) es exactamente el factor de cada canal: +20 %, +30 %, −15 % y +5 %', all(l2[ch] and l2[ch]['labels'] == ['Agosto', 'Septiembre'] and abs(l2[ch]['yoy'] - (F[ch] - 1)) < 1e-9 for ch in CH), l2)
        chk(f'AI-4 la meta es la base total × 1.16 = {META_T:,} y la suma de los canales cuadra exacto', r['meta']['total'] == META_T and sum(x['meta'] for x in r['rows']) == META_T, (r['meta']['total'], META_T, sum(x['meta'] for x in r['rows'])))
        chk('AI-4 por defecto cada canal conserva la participación de la base (su meta es su base × 1.16 con diferencia de a lo más $1 por redondeo)', all(abs(x['meta'] - BASE[x['id']] * 1.16) <= 1.5 for x in r['rows']), [(x['id'], x['meta'], round(BASE[x['id']] * 1.16)) for x in r['rows']])
        chk('AI-5 la proyección de cada canal = su base × (1 + ritmo de los últimos 2 meses) y la total es la suma', all(abs(x['proj'] - PROJ[x['id']]) <= 0.51 for x in r['rows']) and r['projection']['total'] == sum(x['proj'] for x in r['rows']), [(x['id'], x['proj'], round(PROJ[x['id']])) for x in r['rows']])
        chk('AI-5 la brecha = meta − proyección, por canal y total', all(x['gap'] == x['meta'] - x['proj'] for x in r['rows']) and r['gap']['total'] == r['meta']['total'] - r['projection']['total'], r['gap'])
        ok6 = True
        for x in r['rows']:
            up = x['meta'] / x['proj'] - 1
            if up > 0: ok6 = ok6 and x['needs'] and abs(x['needs']['volumePct'] - up) < 1e-9 and abs(x['needs']['aovPct'] - up) < 1e-9 and abs(x['needs']['crPp'] - 2 * up) < 1e-9
            else: ok6 = ok6 and x['needs'] is None
        chk('AI-6 «qué tendría que pasar»: volumen y AOV suben lo que pide la meta sobre lo proyectado y el CR sube ese porcentaje de su 2 % (en puntos); sin brecha no hay fila', ok6, [(x['id'], x['needs']) for x in r['rows']])
        okm = True
        for i, x in enumerate(r['rows']):
            okm = okm and sum(m['byChannel'][x['id']]['meta'] for m in r['monthly']) == x['meta'] and sum(m['byChannel'][x['id']]['proj'] for m in r['monthly']) == x['proj']
        okm = okm and sum(m['total']['meta'] for m in r['monthly']) == r['meta']['total'] and sum(m['total']['proj'] for m in r['monthly']) == r['projection']['total']
        feb = r['monthly'][1]['byChannel']['ecommerce']['meta']; mar = r['monthly'][2]['byChannel']['ecommerce']['meta']
        chk('AI-7 el reparto mensual suma exacto a la meta y a la proyección de cada canal y del total, con la forma de la base (febrero/marzo de Ecommerce en proporción a sus días y venta)', okm and abs(feb / mar - month26('ecommerce', 2) / month26('ecommerce', 3)) < 1e-4, (okm, feb, mar))
        sens = {round(x['growth'], 3): x for x in r['sensitivity']}
        chk('AI-8 la sensibilidad trae 10, 12, 16 y 20 % con su meta y brecha (calculadas aparte) y marca el que se usa', sorted(sens) == [0.1, 0.12, 0.16, 0.2] and all(sens[g]['meta'] == round(BT * (1 + g)) and sens[g]['gap'] == round(BT * (1 + g)) - r['projection']['total'] for g in sens) and sens[0.16]['current'], sens)
        # ---- lo que se ve en pantalla ----
        kp = await q.evaluate("[...document.querySelectorAll('#projection-view .projkpis .metric-card')].map(c=>[c.querySelector('dt').innerText.trim(),c.querySelector('.metric-card__value').innerText.trim(),c.querySelector('.metric-card__period').innerText.trim()])")
        chk('AI-4 las cuatro cifras de arriba (base, meta, proyección y brecha) coinciden con el motor', num(kp[0][1]) == round(BT) and num(kp[1][1]) == META_T and num(kp[2][1]) == r['projection']['total'] and abs(num(kp[3][1]) - r['gap']['total']) < 1, kp)
        # ---- crecimiento ----
        await q.fill('#proj-g', '10'); await q.dispatch_event('#proj-g', 'change'); await q.wait_for_timeout(300)
        r10 = await q.evaluate(RES)
        chk(f'AI-4 con 10 % la meta pasa a {round(BT * 1.10):,} y la proyección no cambia', r10['meta']['total'] == round(BT * 1.10) and r10['projection']['total'] == r['projection']['total'], (r10['meta']['total'], round(BT * 1.1)))
        await q.fill('#proj-g', '250'); await q.dispatch_event('#proj-g', 'change'); await q.wait_for_timeout(300)
        chk('AI-4 un crecimiento fuera de 0–200 % se rechaza con aviso y no cambia la meta', (await q.evaluate(RES))['meta']['total'] == round(BT * 1.10) and 'entre 0 y 200' in await q.evaluate("document.getElementById('toast').innerText"))
        await q.click('[data-action="proj-reset"]'); await q.wait_for_timeout(300)
        # ---- participaciones editadas ----
        for ch, v in (('ecommerce', 40), ('app', 30), ('whatsapp', 15)):
            await q.fill(f'#proj-s-{ch}', str(v)); await q.dispatch_event(f'#proj-s-{ch}', 'change'); await q.wait_for_timeout(200)
        mid = await q.evaluate(RES); err = await q.evaluate("(document.querySelector('#projection-view .note--error')||{innerText:''}).innerText"); dis = await q.evaluate("document.querySelector('[data-action=\"proj-save-targets\"]').disabled")
        chk('AI-9 si las participaciones no suman 100 % se avisa, la meta se reparte como la base y no se pueden guardar las metas', 'suman 85.0 %' in err.replace('\n', ' ') or 'suman' in err and dis and all(abs(x['meta'] - BASE[x['id']] * 1.16) <= 1.5 for x in mid['rows']), (err, dis))
        await q.fill('#proj-s-llamadas', '15'); await q.dispatch_event('#proj-s-llamadas', 'change'); await q.wait_for_timeout(300)
        rs = await q.evaluate(RES)
        chk('AI-9 con 40/30/15/15 la meta de cada canal es su participación de la meta total (suma exacta) y el crecimiento de cada canal es un resultado', rs['sharesCustom'] and sum(x['meta'] for x in rs['rows']) == META_T and all(abs(x['meta'] - META_T * s_ / 100) <= 1.5 for x, s_ in zip(rs['rows'], (40, 30, 15, 15))), [(x['id'], x['meta']) for x in rs['rows']])
        # ---- guardar metas 2027 ----
        await q.click('[data-action="proj-save-targets"]'); await q.wait_for_timeout(500)
        saved = await q.evaluate("(()=>{const a=FP.app;a.actions['proj-open-plan']();const t=a.state.targets;return {year:a.state.year,annual:t.annual.revenue,ch:Object.fromEntries(Object.entries(t.byChannel).map(([k,v])=>[k,v.revenue])),hash:location.hash}})()")
        await q.wait_for_timeout(300)
        chk(f'AI-10 «Guardar metas» escribe las metas de 2027 (total {META_T:,} y por canal, con la suma exacta) y «Ver metas» abre Planear en 2027', saved['year'] == 2027 and saved['annual'] == META_T and sum(saved['ch'].values()) == META_T and [saved['ch'][c_] for c_ in CH] == [x['meta'] for x in rs['rows']] and saved['hash'] == '#resumen', saved)
        back = await q.evaluate("(()=>{const a=FP.app;a.actions['set-year']({value:'2026'});return {y:a.state.year,annual:a.state.targets.annual.revenue}})()")
        chk('AI-10 las metas de 2026 no se tocaron (siguen vacías)', back['y'] == 2026 and back['annual'] in (None, 0), back)
        await open_proj(q, u); await q.fill('#proj-g', '12'); await q.dispatch_event('#proj-g', 'change'); await q.wait_for_timeout(200)
        await q.evaluate("window.confirm=()=>false"); await q.click('[data-action="proj-save-targets"]'); await q.wait_for_timeout(300)
        k1 = await q.evaluate("(()=>{FP.app.actions['proj-open-plan']();return FP.app.state.targets.annual.revenue})()")
        await q.evaluate("FP.app.actions['set-year']({value:'2026'})"); await open_proj(q, u); await q.fill('#proj-g', '12'); await q.dispatch_event('#proj-g', 'change'); await q.wait_for_timeout(200)
        await q.evaluate("window.confirm=()=>true"); await q.click('[data-action="proj-save-targets"]'); await q.wait_for_timeout(300)
        k2 = await q.evaluate("(()=>{FP.app.actions['proj-open-plan']();return FP.app.state.targets.annual.revenue})()")
        chk('AI-10 si ya hay metas de 2027 pide confirmar: al decir que no se conservan (42.9 % de más en la guardada) y al decir que sí se reemplazan por la nueva', k1 == META_T and k2 == round(BT * 1.12), (k1, k2, META_T, round(BT * 1.12)))
        await q.evaluate("FP.app.actions['set-year']({value:'2026'})"); await open_proj(q, u)
        # ---- descargas y menú ----
        dl = await q.evaluate("""(()=>{const d=[];const o=FP.exporter.download;FP.exporter.download=(n,c,m)=>{d.push([n,String(c).length,m||''])};FP.app.actions['proj-download-json']();FP.app.actions['proj-download-csv']();FP.exporter.download=o;return d})()""")
        exj = await q.evaluate("FP.projection.toExport(FP.projectionView.compute(FP.app.state))"); csvt = await q.evaluate("FP.projection.toCsv(FP.projectionView.compute(FP.app.state))")
        chk('AI-13 las descargas se llaman proyeccion_2027.json y proyeccion_2027_mensual.csv; el JSON trae supuestos, base, meta, proyección, brecha, canales, meses, sensibilidad y avisos; el CSV 12 meses × 4 canales × 3 tipos', [x[0] for x in dl] == ['proyeccion_2027.json', 'proyeccion_2027_mensual.csv'] and exj['kind'] == 'projection' and exj['assumptions']['growthOnTotalTarget'] == 0.12 and len(exj['byChannel']) == 4 and len(exj['monthly']) == 12 and csvt.count('\n') == 1 + 12 * 4 * 3 and 'base,ecommerce,2026-01,' in csvt and 'meta,app,2027-12,' in csvt, (dl, csvt.count('\n')))
        menu = await q.evaluate("(()=>{const a=[...document.querySelectorAll('#app-nav a, nav a')].find(x=>/proyeccion/.test(x.getAttribute('href')||''));return a?a.innerText.trim():null})()")
        chk('AI-13 «Proyección del próximo año» aparece en el menú de Planear', bool(menu) and 'Proyección' in menu, menu)
        bad = []
        for w in (1920, 1440, 1280, 1100, 768, 600, 390, 360, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            x = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
            if x > 0: bad.append((w, x))
        chk('AI-13 sin desborde de página de 320 a 1920 px', not bad, bad)
        unl = await q.evaluate("[...document.querySelectorAll('#projection-view input')].filter(i=>!(i.id&&document.querySelector('label[for=\"'+i.id+'\"]'))).map(i=>i.id)")
        chk('AI-13 todos los campos tienen etiqueta asociada', not unl, unl)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close()
        # ---- mes sin dato en ningún año ----
        c, q, u, errs2 = await ctx(b, hist=csv25(skip=lambda ch, m, d: ch == 'whatsapp' and m == 11)); await open_proj(q, u)
        r2 = await q.evaluate(RES)
        chk('AI-11 si Noviembre de WhatsApp no existe ni en 2026 ni en 2025 se marca «sin dato», la base de ese canal queda incompleta y se avisa', any('WhatsApp: Noviembre no tienen dato ni de 2026 ni de 2025' in w.replace(' no tiene ', ' no tienen ') or 'WhatsApp: Noviembre no tienen dato' in w for w in r2['warnings']) and [m['source'] for m in r2['channels'][2]['months']][10] == 'missing', r2['warnings'])
        warn = await q.evaluate("(document.querySelector('#projection-view .note--warn')||{innerText:''}).innerText")
        chk('AI-11 la pantalla muestra «Revisa antes de usar estos números» con el aviso', 'Revisa antes de usar' in warn and 'Noviembre' in warn, warn[:200])
        await c.close()
        # ---- sin histórico del año anterior: octubre–diciembre quedan sin dato ----
        c, q, u, errs3 = await ctx(b, hist=None); await open_proj(q, u)
        r3 = await q.evaluate(RES)
        chk('AI-11 sin el histórico de 2025 no hay de dónde tomar octubre a diciembre (tres meses sin dato por canal y cuatro en Llamadas, que también pierde marzo): se avisa por canal y no hay ritmo de 2 meses (proyección = base)', [sum(1 for m in cc['months'] if m['source'] == 'missing') for cc in r3['channels']] == [3, 3, 3, 4] and all(x['last2'] is None for x in r3['rows']) and r3['projection']['total'] == r3['base']['total'] and any('no hay dos meses cerrados comparables' in w for w in r3['warnings']), r3['warnings'][:3])
        await c.close()
        # ---- hay venta de 2026, pero ningún mes cerrado y sin histórico: no debe decir «no hay venta» ----
        part = 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'2026-09-{d:02d},{ch},{1000 + d},10,500' for d in range(1, 16) for ch in CH) + '\n'
        c, q, u, errs5 = await ctx(b, hist=None, real=False)
        await q.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': 'parcial.csv', 'mimeType': 'text/csv', 'buffer': part.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(300)
        await open_proj(q, u)
        pm = await q.evaluate("document.getElementById('projection-view').innerText.replace(/\\s+/g,' ')")
        chk('AI-12 con venta de 2026 pero ningún mes cerrado y sin histórico explica eso (no dice «no hay venta con fecha de 2026»)', 'Hay venta de 2026, pero ningún mes cerrado' in pm and 'No hay venta con fecha' not in pm, pm[:320])
        await c.close()
        # ---- forecast de cierre de Pacing con un plan cargado ----
        plan = 'fecha,canal,meta_venta\n' + '\n'.join(f'2026-{m:02d}-{d:02d},{ch},{round(rev25(ch, m) * 1.1)}' for m in range(1, 13) for d in range(1, dim(2026, m) + 1) for ch in CH) + '\n'
        c, q, u, errs6 = await ctx(b, hist=csv25())
        await q.set_input_files('input[data-action="pick-files"][data-type="plan"]', files=[{'name': 'plan.csv', 'mimeType': 'text/csv', 'buffer': plan.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000); await q.wait_for_timeout(300)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(1500); await open_proj(q, u)
        fc = await q.evaluate("(()=>{const r=FP.projectionView.compute(FP.app.state);const run=FP.app.state.fc.run;return {rows:r.rows.map(x=>[x.id,x.forecastClose]),pacing:Object.fromEntries(['ecommerce','app','whatsapp','llamadas'].map(c=>[c,run.channels[c].annual.forecast&&run.channels[c].annual.forecast.revenue])),ui:[...document.querySelectorAll('table[aria-label=\"Meses de la base por canal\"] tbody tr')].map(r=>r.cells[3].innerText.trim())}})()")
        chk('AI-14 con un plan cargado, la columna «Forecast de cierre en Pacing» trae lo mismo que Pacing por canal (no «sin forecast»)', all(isinstance(v, (int, float)) and abs(v - fc['pacing'][k]) < 0.01 for k, v in fc['rows']) and all('sin forecast' not in x and '$' in x for x in fc['ui']), fc)
        await c.close()
        # ---- sin datos ----
        c, q, u, errs4 = await ctx(b, hist=None, real=False); await open_proj(q, u)
        emp = await q.evaluate("document.getElementById('projection-view').innerText.replace(/\\s+/g,' ')")
        chk('AI-12 sin datos la pantalla dice qué cargar (venta real de 2026 e histórico de 2025) en lugar de mostrar ceros', 'Todavía no hay datos para proyectar' in emp and 'venta real de 2026' in emp and 'histórico de 2025' in emp, emp[:300])
        await c.close()
        chk('Sin errores de página en los demás escenarios', not (errs2 or errs3 or errs4 or errs5 or errs6), (errs2, errs3, errs4, errs5, errs6))
        await b.close()
    print('\nRESULTADO batch_ai:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
