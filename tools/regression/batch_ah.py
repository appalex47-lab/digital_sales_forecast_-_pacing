"""Tráfico y conversión rediseñado (tarjetas como Diagnóstico y Pacing). Uso: python3 batch_ah.py <raiz>
AH-1 las cinco cifras del periodo coinciden con lo calculado aparte (datos de batch_t) y su comparación contra el periodo anterior; AH-2 las cinco van en una fila en escritorio
y en dos columnas en móvil; AH-3 la dimensión queda en la misma fila que periodo, cuál y canal; AH-4 cada sección es una tarjeta con título y la navegación «Ir a» lleva a
las tarjetas que existen; AH-5 los hallazgos traen su etiqueta; AH-6 sin desborde de página de 320 a 1920 px y sin errores."""
import asyncio, sys, os, re, json, datetime as dt, zlib, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'batch_t.py'), encoding='utf-8').read().split("async def main():")[0]
sys.argv = ['x', sys.argv[1]]
exec(src)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await prepare(q, u)
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'seg.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(500)
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'total')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(200)
        await q.select_option('#sg-dim', 'device'); await q.wait_for_timeout(600)
        T9 = {k[1]: v[9] for k, v in SPEC.items() if k[0] == 'dispositivo'}; T8 = {k[1]: v[8] for k, v in SPEC.items() if k[0] == 'dispositivo'}
        agg = lambda d: (sum(x[0] for x in d.values()), sum(x[1] for x in d.values()), sum(x[1] * x[2] for x in d.values()))
        (t9, o9, r9), (t8, o8, r8) = agg(T9), agg(T8)
        fmt = lambda v: f'{v:,.0f}'; sp = lambda v: ('0.0 %' if abs(v * 100) < 0.05 else f"{'+' if v >= 0 else '−'}{abs(v * 100):.1f} %")
        cards = await q.evaluate("[...document.querySelectorAll('#view-segmentos .sgkpis .metric-card')].map(c=>({label:c.querySelector('dt').innerText.replace(/\\s*\\?\\s*$/,'').trim(),value:c.querySelector('.metric-card__value').innerText.trim(),ref:c.querySelector('.metric-card__period').innerText.trim(),top:Math.round(c.getBoundingClientRect().top)}))")
        exp = {'Tráfico': (fmt(t9), sp((t9 - t8) / t8) + ' vs periodo anterior'), 'Pedidos': (fmt(o9), sp((o9 - o8) / o8) + ' vs periodo anterior'), 'CR': (f'{o9 / t9 * 100:.2f} %', ('0.00 pp' if abs(o9 / t9 - o8 / t8) * 100 < 0.005 else '') + ' vs periodo anterior'),
               'AOV': ('$' + fmt(r9 / o9), sp((r9 / o9 - r8 / o8) / (r8 / o8)) + ' vs periodo anterior'), 'Venta': ('$' + fmt(r9), sp((r9 - r8) / r8) + ' vs periodo anterior')}
        got = {c['label']: (c['value'], c['ref']) for c in cards}
        chk('AH-1 las cinco cifras (tráfico, pedidos, CR, AOV y venta) y su comparación contra agosto coinciden con lo calculado aparte del CSV', got == exp and [c['label'] for c in cards] == ['Tráfico', 'Pedidos', 'CR', 'AOV', 'Venta'], (got, exp))
        chk('AH-2 en escritorio las cinco cifras van en una sola fila', len({c['top'] for c in cards}) == 1, [c['top'] for c in cards])
        rowt = await q.evaluate("(()=>{const t=id=>Math.round(document.getElementById(id).getBoundingClientRect().top);return [t('sg-key'),t('sg-ch'),t('sg-dim')]})()")
        chk('AH-3 periodo, cuál, canal y dimensión comparten fila en escritorio', len(set(rowt)) == 1, rowt)
        ids = await q.evaluate("[...document.querySelectorAll('#view-segmentos section.sgcard')].map(s=>[s.id||s.querySelector('.panel__title').id, s.querySelector('.panel__title').innerText.trim(), !!s.querySelector('.panel__desc')])")
        chk('AH-4 cada sección es una tarjeta con título y descripción, en este orden: Lo que destaca, Mapa, Dónde está la oportunidad, Qué cambió, Ticket y clientes, Detalle por segmento', [x[1] for x in ids] == ['Lo que destaca', 'Mapa de tráfico y conversión', 'Dónde está la oportunidad', 'Qué cambió', 'Ticket y clientes', 'Detalle por segmento'] and all(x[2] for x in ids), ids)
        nav = await q.evaluate("[...document.querySelectorAll('#view-segmentos .sgnav a')].map(a=>[a.innerText.trim(),a.dataset.sgjump,!!document.getElementById(a.dataset.sgjump)])")
        chk('AH-4 la navegación «Ir a» tiene un botón por tarjeta y todos apuntan a una tarjeta que existe', [n[0] for n in nav] == ['Lo que destaca', 'Mapa', 'Oportunidad', 'Qué cambió', 'Ticket y clientes', 'Detalle por segmento'] and all(n[2] for n in nav), nav)
        tags = await q.evaluate("[...document.querySelectorAll('.sghl__item')].map(i=>[i.querySelector('.sghl__tag').innerText.trim(),i.querySelector('.sghl__text').innerText.slice(0,40)])")
        chk('AH-5 cada hallazgo trae su etiqueta (Conversión, Escalar, Caída, Alza, Concentración, Poco volumen)', [t[0] for t in tags] == ['Conversión', 'Escalar', 'Caída', 'Alza', 'Concentración', 'Poco volumen'], tags)
        bad = []
        for w in (1920, 1440, 1280, 1100, 768, 600, 390, 360, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            r = await q.evaluate("({doc:document.documentElement.scrollWidth-innerWidth, tops:[...new Set([...document.querySelectorAll('#view-segmentos .sgkpis .metric-card')].map(c=>Math.round(c.getBoundingClientRect().top)))].length})")
            if r['doc'] > 0: bad.append((w, r))
            if w == 390: cols390 = r['tops']
        chk('AH-6 sin desborde de página de 320 a 1920 px', not bad, bad)
        chk('AH-2 en móvil (390 px) las cinco cifras van en dos columnas (3 filas)', cols390 == 3, cols390)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_ah:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
