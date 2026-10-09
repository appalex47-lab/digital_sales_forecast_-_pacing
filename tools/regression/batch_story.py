"""Análisis · tendencia de productos: estado actual, fases, estabilidad, contexto. Uso: python3 -I batch_story.py <raiz>. Verdad en Python."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
def close(a, b, tol=0.02): return a is not None and b is not None and abs(a - b) <= max(tol, abs(b) * 1e-9)
def monthly(ent_key, ent, ch=None, idx=6):
    out = {}
    for r in ROWS:
        d, c = r[0], r[1]
        if ch and c != ch: continue
        if {'product': r[3], 'category': r[4]}[ent_key] != ent: continue
        out[d[:7]] = out.get(d[:7], 0) + r[idx]
    return out
async def rows_of(q): return await q.evaluate("FP.app.state.an.rows.map(r=>({e:r.entity,cat:r.category,st:r.story}))")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        cur_r, base_r = ('2026-10-01', '2026-10-05'), ('2026-09-01', '2026-09-05')
        # ---- App: Gamma dejó de vender en octubre ----
        await open_an(q, u, level='product', channel='app', periodType='month', focusKey='2026-10', comparison='previous')
        R = {r['e']: r for r in await rows_of(q)}
        g = R['Gamma 5 mg']['st']
        chk('S1 Gamma 5 mg (App): estado actual «Sin ventas» y la frase lo dice (no «crece»)', g['current']['state'] == 'stopped' and g['current']['tag'] == 'Sin ventas' and 'sin ventas en Oct 1–5' in g['headline'], (g['current'], g['headline']))
        # ---- filtro por estado ----
        await q.evaluate("FP.app.actions['an-state']({value:'stopped'})"); await q.wait_for_timeout(200)
        fr = await q.evaluate("FP.app.state.an._filteredRows.map(r=>r.entity)")
        chk('S2 filtro «Sin ventas ahora» deja sólo los productos sin ventas en el período en curso', fr == ['Gamma 5 mg'], fr)
        tbl = await q.evaluate("document.getElementById('an-trend-table').innerText")
        chk('S2b la tabla filtrada muestra sólo Gamma con su estado', 'Gamma 5 mg' in tbl and 'Alfa 10 mg' not in tbl and 'Sin ventas' in tbl, tbl[:200])
        await q.evaluate("FP.app.actions['an-state']({value:'all'})")
        # ---- Total: Theta Cae (cae mes a mes) y Alfa (crece 2 % mensual) ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        R = {r['e']: r for r in await rows_of(q)}
        th = R['Theta Cae']['st']
        chk('S3 Theta Cae: la primera fase es una CAÍDA y la frase empieza por «Cayó»; no hay fase de crecimiento', th['episodes'][0]['type'] == 'decline' and th['headline'].startswith('Cayó') and not any(e['type'] == 'growth' for e in th['episodes']), (th['episodes'], th['headline']))
        chk('S3c Theta Cae sigue cayendo en el período en curso → «Cayendo» («continúa la caída»), no «En línea»', th['current']['state'] == 'falling' and 'continúa la caída' in th['current']['text'], th['current'])
        mt = monthly('product', 'Theta Cae'); closed = [k for k in sorted(mt) if k < '2026-10'][-11:]
        chk('S3b el máximo de Theta Cae es su primer mes de la ventana (oct-2025) y «vs su máximo» = último cerrado ÷ máximo − 1', th['peak']['period'] == closed[0] and close(th['peak']['value'], mt[closed[0]]) and close(th['fromPeak'], mt[closed[-1]] / mt[closed[0]] - 1, 1e-6), (th['peak'], th['fromPeak']))
        al = R['Alfa 10 mg']['st']
        chk('S4 Alfa 10 mg (crece ~2 % mensual): hay fase de crecimiento y ninguna fase de caída (lo que no supera el umbral es «estable»)', any(e['type'] == 'growth' for e in al['episodes']) and not any(e['type'] == 'decline' for e in al['episodes']), al['episodes'])
        # ---- contexto: contra categoría y contra el total ----
        ma = monthly('product', 'Alfa 10 mg'); mcat = {}
        for k in ('Alfa 10 mg', 'Beta 20 mg', 'Theta Cae'):
            for m_, v in monthly('product', k).items(): mcat[m_] = mcat.get(m_, 0) + v
        mtot = {}
        for r in ROWS: mtot[r[0][:7]] = mtot.get(r[0][:7], 0) + r[6]
        cl = [k for k in sorted(ma) if k < '2026-10']; s0, s1 = cl[-7], cl[-1]
        rel = {x['id']: x for x in al['relative']}
        e_ch, c_ch, t_ch = ma[s1] / ma[s0] - 1, mcat[s1] / mcat[s0] - 1, mtot[s1] / mtot[s0] - 1
        chk('S5 Alfa vs su categoría (Cardio): cambios y diferencia en pp = cálculo aparte (últimos 6 períodos)', 'category' in rel and 'Cardio' in rel['category']['label'] and close(rel['category']['entityChange'], e_ch, 1e-6) and close(rel['category']['contextChange'], c_ch, 1e-6) and close(rel['category']['diffPp'], (e_ch - c_ch) * 100, 1e-4) and rel['category']['window']['periods'] == 6, (rel.get('category'), e_ch, c_ch))
        chk('S5b Alfa vs el total digital = cálculo aparte', close(rel['scope']['contextChange'], t_ch, 1e-6) and close(rel['scope']['diffPp'], (e_ch - t_ch) * 100, 1e-4), (rel.get('scope'), t_ch))
        # ---- qué se movió: volumen y precio de UNA entidad ----
        a0, a1 = agg_p = None, None
        def pr(frm, to, nm):
            r_ = sum(x[6] for x in ROWS if x[3] == nm and frm <= x[0] <= to); u_ = sum(x[8] for x in ROWS if x[3] == nm and frm <= x[0] <= to); return r_, u_
        (r0, u0), (r1, u1) = pr(*base_r, 'Alfa 10 mg'), pr(*cur_r, 'Alfa 10 mg'); dv = al['drivers']
        chk('S6 Alfa: volumen + precio = Δ venta real y coinciden con el cálculo aparte', dv and close(dv['delta'], r1 - r0) and close(dv['volume'], (u1 - u0) * r0 / u0, 0.05) and close(dv['price'], (r1 / u1 - r0 / u0) * u1, 0.05) and close(dv['volume'] + dv['price'], dv['delta'], 0.05), dv)
        # ---- pantalla: lectura de la entidad ----
        await q.evaluate("FP.app.actions['an-select']({dataset:{entity:'Theta Cae',source:'tabla'}})"); await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data})()", timeout=60000); await q.wait_for_timeout(300)
        ui = await q.evaluate("""(()=>{const r=document.getElementById('an-entity-reading');const T=r.innerText;return {head:(r.querySelector('.story-headline')||{}).innerText||'',eps:r.querySelectorAll('.story-ep').length,bands:r.querySelectorAll('.story-band').length,svg:!!r.querySelector('.story-chart svg'),marks:r.querySelectorAll('.story-mark').length,gro:/crecimiento % por período/.test(r.textContent),how:/Cómo se calculan las fases/.test(r.textContent),ctx:/Contra su contexto/.test(T),stab:/Estabilidad/.test(T),n:FP.app.state.an.selected.story.episodes.length}})()""")
        chk('U1 lectura de la entidad: frase, línea de tiempo de fases (+ «Ahora»), gráfica con bandas y marcas, contexto, estabilidad y método', ui['head'].startswith('La historia') and ui['eps'] == ui['n'] + 1 and ui['bands'] == ui['n'] and ui['svg'] and ui['marks'] >= 2 and ui['gro'] and ui['how'] and ui['ctx'] and ui['stab'], ui)
        # ---- línea de tendencia: pantalla = cálculo aparte (recta de mínimos cuadrados sobre los últimos 6 cierres) ----
        mt6 = monthly('product', 'Theta Cae'); last6 = [mt6[k] for k in sorted(mt6) if k < '2026-10'][-6:]
        n6 = len(last6); xm = (n6 - 1) / 2; ym = sum(last6) / n6
        sxx = sum((i - xm) ** 2 for i in range(n6)); bb = sum((i - xm) * (y - ym) for i, y in enumerate(last6)) / sxx; aa = ym - bb * xm
        exp_proj = [max(0, aa + bb * (n6 - 1 + h)) for h in (1, 2, 3)]
        ol = await q.evaluate("FP.app.state.an.selected.story.outlook")
        chk('T1 línea de tendencia de Theta Cae: ventana de 6 cierres, proyección a 3 meses = recta calculada aparte (oct–dic 2026), dirección a la baja', ol['status'] == 'available' and ol['window']['periods'] == 6 and ol['direction'] == 'down' and all(close(a_['value'], e_, 1e-4) for a_, e_ in zip(ol['projection'], exp_proj)) and [x['period'] for x in ol['projection']] == ['2026-10', '2026-11', '2026-12'], (ol['projection'], exp_proj))
        dom = await q.evaluate("(()=>{const r=document.getElementById('an-entity-reading');return {proj:!!r.querySelector('.story-outlook__proj'),band:!!r.querySelector('.story-outlook__band'),fit:!!r.querySelector('.story-outlook__fit'),dots:r.querySelectorAll('.story-outlook__dot').length,txt:(r.querySelector('.story-outlook-note')||{}).textContent||''}})()")
        chk('T2 la gráfica dibuja recta ajustada, proyección punteada, banda y 3 puntos; la frase dice «a la baja», el valor proyectado y «no es un pronóstico»', dom['proj'] and dom['band'] and dom['fit'] and dom['dots'] == 3 and 'a la baja' in dom['txt'] and 'no un pronóstico' in dom['txt'].replace('es una extensión de la tendencia reciente, ', '').replace('Es una extensión de la tendencia reciente, ', '') and 'Confianza' in dom['txt'], dom)
        # producto que dejó de vender (Gamma, App): no se proyecta y la pantalla lo explica
        await open_an(q, u, level='product', channel='app', periodType='month', focusKey='2026-10', comparison='previous')
        await q.evaluate("FP.app.actions['an-select']({dataset:{entity:'Gamma 5 mg',source:'tabla'}})"); await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data})()", timeout=60000); await q.wait_for_timeout(300)
        og = await q.evaluate("(()=>{const r=document.getElementById('an-entity-reading');return {st:FP.app.state.an.selected.story.outlook.status,proj:!!r.querySelector('.story-outlook__proj'),txt:(r.querySelector('.story-outlook-note')||{}).textContent||''}})()")
        chk('T3 sin ventas en el período en curso: no hay línea proyectada y se explica por qué', og['st'] == 'unavailable' and not og['proj'] and 'Sin línea de tendencia' in og['txt'], og)
        # ---- nivel categoría: sin comparación contra categoría (sería contra sí misma) ----
        await open_an(q, u, level='category', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        RC = await rows_of(q)
        chk('S7 nivel Categoría: contexto sólo contra el total digital (no contra sí misma)', all([x['id'] for x in r['st']['relative']] == ['scope'] for r in RC), [(r['e'], [x['id'] for x in r['st']['relative']]) for r in RC][:3])
        # ---- métrica unidades: historia sobre unidades; sin volumen/precio ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        await q.evaluate("FP.app.actions['an-metric']({value:'units'})"); await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.key!==null && a.share})()", timeout=60000); await q.wait_for_timeout(300)
        RU = {r['e']: r for r in await rows_of(q)}
        mu = monthly('product', 'Theta Cae', None, 8); cu = [k for k in sorted(mu) if k < '2026-10'][-11:]
        chk('S8 métrica Unidades: la historia usa unidades (máximo = unidades del primer mes) y no calcula volumen/precio', close(RU['Theta Cae']['st']['peak']['value'], mu[cu[0]]) and 'drivers' not in RU['Theta Cae']['st'], (RU['Theta Cae']['st']['peak'], mu[cu[0]]))
        # ---- sin poca historia: períodos cortos ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous', periodCount=3)
        RS = await rows_of(q)
        chk('S9 con 3 períodos de historia no se inventan fases largas (a lo más 1–2 episodios por producto)', all(len(r['st']['episodes']) <= 2 for r in RS) and all(r['st']['reliability']['level'] == 'low' for r in RS), [(r['e'], len(r['st']['episodes']), r['st']['reliability']) for r in RS][:3])
        chk('S10 sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print(f'\n{len(passed)} OK · {len(fails)} fallas')
    print('RESULTADO batch_story:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
