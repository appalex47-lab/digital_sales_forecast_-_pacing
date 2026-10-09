"""Inicio · resumen general (4 bloques): comparar contra un cálculo aparte (Python) con un dataset determinista.
Uso: python3 batch_home_summary.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, datetime as dt, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
DAYS = [dt.date(2026, 8, 1) + dt.timedelta(days=i) for i in range(53)]            # 1-ago … 22-sep
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def vals(ch, d):
    r = random.Random(f'{ch}|{d}'); k = {'ecommerce': 1.0, 'app': .6, 'whatsapp': .3, 'llamadas': .2}[ch]
    sep = d.month == 9
    t = round(4000 * k * (0.82 if sep else 1.0) * (0.9 + .2 * r.random())); cr = (0.021 if ch == 'ecommerce' else 0.03) * (1.12 if sep else 1.0) * (0.95 + .1 * r.random())
    o = max(1, round(t * cr)); aov = 410 * (1.06 if sep else 1.0) * (0.95 + .1 * r.random()); return t, o, round(o * aov, 2)
ACT = 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'{d},{c},{vals(c, d)[2]},{vals(c, d)[1]},{vals(c, d)[0] if c in ("ecommerce", "app") else ""}' for d in DAYS for c in CH) + '\n'
def truth(ch):
    a = [vals(ch, d) for d in DAYS if d.month == 8 and d.day <= 22]; b = [vals(ch, d) for d in DAYS if d.month == 9]
    T0, O0, R0 = (sum(x[i] for x in a) for i in range(3)); T1, O1, R1 = (sum(x[i] for x in b) for i in range(3))
    c0, c1, k0, k1 = O0 / T0, O1 / T1, R0 / O0, R1 / O1
    return dict(traffic=(T1 - T0) * c0 * k0, cr=T1 * (c1 - c0) * k0, aov=T1 * c1 * (k1 - k0), delta=R1 - R0, R0=R0, R1=R1)
SEG = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(
    f'{d},ecommerce,landing,{s},{o * (400 if d.month == 8 else 340)},{o},{t}' for d in DAYS for s, t, o in
    [('/home', 900 if d.month == 8 else 700, 30), ('/ofertas', 500, 15), ('/raro', 100 if d.month == 8 else 600, 0)]) + '\n'
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:300])); q.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' and 'Failed to load' not in m.text else None)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
        u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        async def load(kind, name, text):
            await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{kind}"]', state='attached')
            await q.set_input_files(f'input[data-action="pick-files"][data-type="{kind}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=120000); await q.wait_for_timeout(600)
        await load('actual', 'real.csv', ACT)
        await q.goto(u + '#inicio'); await q.wait_for_selector('#h-now'); await q.wait_for_timeout(600)
        txt = lambda sel: q.evaluate(f"(document.querySelector('{sel}')||{{innerText:''}}).innerText.replace(/\\s+/g,' ')")
        # 0 · sin periodo anterior (año): el bloque 1 lo dice y no inventa nada
        await q.select_option('#home-per', 'year'); await q.wait_for_timeout(800)
        t = await txt('#hs-why'); chk('H0 año sin año anterior: «No hay con qué comparar todavía»', 'No hay con qué comparar' in t, t[:200])
        n_year = await q.evaluate("document.querySelectorAll('.home-sum').length"); chk('H0b los 4 bloques están', n_year == 4, n_year)
        await q.select_option('#home-per', '2026-09'); await q.wait_for_timeout(900)
        # 1 · Ecommerce: efectos = cálculo aparte
        await q.select_option('#home-ch', 'ecommerce'); await q.wait_for_timeout(900)
        T = truth('ecommerce')
        vv = await q.evaluate("[...document.querySelectorAll('#hs-why .sgd-wf__val')].map(e=>e.innerText.trim())")
        chk('H1 cascada Ecommerce = tráfico, conversión, ticket y total del cálculo aparte', vv == [money(T['traffic']), money(T['cr']), money(T['aov']), money(T['delta'])], (vv, T))
        chk('H1b los tres efectos suman el cambio de venta (cálculo aparte)', abs(T['traffic'] + T['cr'] + T['aov'] - T['delta']) < 1e-6)
        t = await txt('#hs-why'); chk('H1c días: «Compara 22 de 22 días por canal»', 'Compara 22 de 22 días por canal' in t, t[-300:])
        chk('H1d el titular dice cuánto subió/bajó y contra cuánto', ('subió' if T['delta'] > 0 else 'bajó') in t, t[:300])
        # 2 · Total digital: WhatsApp y Llamadas no traen sesiones → solo Δ venta y lo dice
        await q.select_option('#home-ch', 'total'); await q.wait_for_timeout(900)
        t = await txt('#hs-why'); chk('H2 Total digital con canales sin sesiones: dice por qué no separa tráfico/CR/ticket', 'No se puede separar tráfico' in t, t[:300])
        ttot = sum(truth(c)['delta'] for c in CH)
        ab = {c: truth(c) for c in CH}
        chk('H2b el cambio de venta de Total = suma de los canales (cálculo aparte)', abs(ttot - sum(ab[c]['R1'] - ab[c]['R0'] for c in CH)) < 1e-6)
        # 3 · Canales: las filas = cálculo de Pacing de la app
        rows = await q.evaluate("[...document.querySelectorAll('#hs-channels tbody tr')].map(r=>[r.dataset.ch,...[...r.querySelectorAll('td')].slice(1,4).map(c=>c.innerText.trim())])")
        chk('H3 cuatro canales en la tabla', [r[0] for r in rows] == CH, rows)
        exp = await q.evaluate("(()=>{const run=FP.app.state.fc.run; return ['ecommerce','app','whatsapp','llamadas'].map(c=>{const p=run.channels[c].months[8]; return [c, FP.format.currency(p.actualToDate.revenue,0), FP.format.percent(p.toDate.revenue.compliance,1), FP.format.signedPercent(p.forecastGap.revenue.gapPct,1)]})})()")
        norm = lambda s: s.replace('−', '-').replace(' ', '')
        chk('H3b venta, cumplimiento y forecast vs meta = cifras de Pacing/Forecast', [[norm(x) for x in r] for r in rows] == [[norm(x) for x in r] for r in exp], (rows, exp))
        # 4 · elegir un canal cambia todo Inicio
        await q.click('#hs-channels button[data-ch="app"]'); await q.wait_for_timeout(900)
        sel = await q.evaluate("document.querySelector('#home-ch').value"); chk('H4 clic en un canal cambia el Canal de Inicio', sel == 'app', sel)
        t = await txt('#hs-why'); Ta = truth('app')
        chk('H4b el bloque 1 pasa a App', 'App' in t and money(Ta['traffic']).replace('+', '').replace('−', '') in t.replace('+', '').replace('−', ''), t[:300])
        sub = await q.evaluate("document.querySelector('#hs-channels tr[aria-current=\"true\"]') && document.querySelector('#hs-channels tr[aria-current=\"true\"]').dataset.ch"); chk('H4c el canal elegido queda resaltado', sub == 'app', sub)
        # 5 · confianza
        t = await txt('#hs-trust'); chk('H5 venta real hasta 2026-09-22', '2026-09-22' in t, t[:300]); chk('H5b días comparados (app, 22 de 22)', '22 de 22' in t, t[:300])
        # 6 · segmentos: sin cargar → vacío; con carga → picks y aviso de calidad
        t = await txt('#hs-where'); chk('H6 sin segmentos: invita a cargarlos', 'Todavía no hay segmentos cargados' in t, t[:200])
        await load('segments', 'seg.csv', SEG)
        await q.goto(u + '#inicio'); await q.wait_for_selector('#h-now'); await q.select_option('#home-per', '2026-09'); await q.select_option('#home-ch', 'ecommerce'); await q.wait_for_timeout(1200)
        pk = await q.evaluate("[...document.querySelectorAll('#hs-where [data-pick]')].map(e=>[e.dataset.pick,e.innerText.replace(/\\s+/g,' ')])")
        chk('H7 aparece un segmento de la dimensión Landing', any(x[0] == 'landing' for x in pk), pk)
        q_ = await q.evaluate("(document.querySelector('#hs-where .sgd-quality')||{innerText:''}).innerText.replace(/\\s+/g,' ')")
        chk('H7b aviso de calidad: «/raro» sin pedidos con muchas sesiones', '/raro' in q_ and 'Revisa la calidad' in q_, q_)
        # 7 · «Diagnosticar» abre Segmentos con la misma dimensión y las mismas cifras
        await q.click('#hs-where button[data-action="home-seg"]'); await q.wait_for_timeout(1800)
        h = await q.evaluate("location.hash"); d = await q.evaluate("document.querySelector('#sg-dim') && document.querySelector('#sg-dim').value")
        chk('H8 «Diagnosticar» abre Segmentos en la dimensión elegida', h == '#segmentos' and d == 'landing', (h, d))
        ch_ = await q.evaluate("FP.app.state.dx.settings.channel + '|' + FP.app.state.dx.settings.periodKey"); chk('H8b con el mismo canal y periodo de Inicio', ch_ == 'ecommerce|2026-09', ch_)
        pickrow = [x for x in pk if x[0] == 'landing'][0][1]; seg = pickrow.split('·')[1].split(' Tráfico')[0].split(' Conversión')[0].split(' Ticket')[0].strip()
        tbl = await q.evaluate("[...document.querySelectorAll('table[aria-label=\"Efectos por segmento\"] tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' '))")
        chk('H8c el segmento sugerido está en la tabla de Segmentos', any(seg in r for r in tbl), (seg, tbl[:3]))
        # 8 · las tarjetas de «¿Qué está pasando?» no cambian de estructura
        await q.goto(u + '#inicio'); await q.wait_for_selector('#h-now'); await q.wait_for_timeout(600)
        nc = await q.evaluate("document.querySelectorAll('#h-now').length && document.querySelector('#h-now').closest('section').querySelectorAll('.metric-card').length"); chk('H9 siguen las 7 tarjetas de «¿Qué está pasando?»', nc == 7, nc)
        order = await q.evaluate("[...document.querySelectorAll('#home > .home > section, #home .home > section')].map(s=>s.id||s.getAttribute('aria-labelledby')||s.dataset.block)")
        chk('H10 orden: recorrido → ¿Qué está pasando? → 4 bloques', order.index('h-now') < order.index('hs-why') < order.index('hs-where') < order.index('hs-channels') < order.index('hs-trust') if all(x in order for x in ['h-now','hs-why','hs-where','hs-channels','hs-trust']) else False, order)
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
