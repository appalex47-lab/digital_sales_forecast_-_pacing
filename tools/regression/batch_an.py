"""Auditoría del módulo Análisis: canal, comparaciones, drill-down. Uso: python3 -I batch_an.py <raiz>
Datos: dataset sintético de 4 canales (8 productos, sep-2025 → 5-oct-2026, octubre PARCIAL) y verdad calculada aparte en Python."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
def close(a, b, tol=0.02): return a is not None and b is not None and abs(a - b) <= max(tol, abs(b) * 1e-9)
def allclose(got, exp, tol=0.02):
    """got/exp: dict entidad -> valor. Comparación exacta del universo y de cada cifra."""
    bad = [(k, got.get(k), exp.get(k)) for k in set(got) | set(exp) if not close(got.get(k, 0), exp.get(k, 0), tol)]
    return not bad, bad[:3]
LV = {'product': 'product', 'category': 'category', 'subcategory': 'subcategory', 'sku': 'sku', 'channel': 'channel'}
SHARE = "(()=>{const s=FP.app.state.an.share;const o={cur:{},base:{}};(s.rows||[]).forEach(r=>{o.cur[r.entity]=r.currentValue;o.base[r.entity]=r.baselineValue});return {o,ct:s.currentTotal,bt:s.baselineTotal,ok:s.comparisonAvailable,label:s.comparisonLabel,hhi:s.hhi}})()"
async def share(q): return await q.evaluate(SHARE)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        # ---------- A. Evidencia de carga: el store tiene los 4 canales y el total de verdad ----------
        meta = await q.evaluate("FP.productStore.meta")
        chk('A1 el almacén reconoce los 4 canales reales y el rango sep-2025 → 5-oct-2026', sorted(meta['channels']) == sorted(CH) and meta['dateMin'] == '2025-09-01' and meta['dateMax'] == '2026-10-05', meta)
        # ---------- B. Octubre PARCIAL (1–5) vs mismos días de septiembre, por canal y nivel ----------
        cur_r, base_r = ('2026-10-01', '2026-10-05'), ('2026-09-01', '2026-09-05')
        per_channel_total = {}
        for ch in ['total'] + CH:
            for lvl in ('product', 'category'):
                await open_an(q, u, level=lvl, channel=ch, periodType='month', focusKey='2026-10', comparison='previous')
                sh = await share(q); tc = None if ch == 'total' else ch
                key = {'product': 'product', 'category': 'category'}[lvl]
                ec, eb = truth(*cur_r, tc, key), truth(*base_r, tc, key)
                okc, dc = allclose(sh['o']['cur'], ec); okb, db = allclose(sh['o']['base'], eb)
                chk(f'B1 [{ch}/{lvl}] ventas por entidad Oct 1–5 coinciden con el cálculo aparte', okc, dc)
                chk(f'B2 [{ch}/{lvl}] ventas por entidad Sep 1–5 (mismos días, no septiembre completo) coinciden', okb, db)
                if lvl == 'product':
                    chk(f'B3 [{ch}] total actual y de comparación = Σ entidades = cálculo aparte', close(sh['ct'], tot(*cur_r, tc)) and close(sh['bt'], tot(*base_r, tc)) and close(sum(sh['o']['cur'].values()), sh['ct']) and close(sum(sh['o']['base'].values()), sh['bt']), (sh['ct'], tot(*cur_r, tc), sh['bt'], tot(*base_r, tc)))
                    per_channel_total[ch] = (sh['ct'], sh['bt'])
                    info = await q.evaluate("(()=>{const a=FP.app.state.an;const c=a.contribution;return {lab:a.comparisonInfo.text,part:a.comparisonInfo.partial,ok:a.comparisonInfo.comparable,td:c.totalDelta,rec:a.reconciliation,pos:c.compensation.positiveDelta,neg:c.compensation.negativeDelta,ch:a.context.channel,cl:a.context.channelLabel,share_label:a.share.comparisonLabel,pri:a.priorities.comparison,tf:a.temporal.focus,narr:a.narrative&&a.narrative.executiveSummary}})()")
                    chk(f'B4 [{ch}] etiqueta de comparación «Oct 1–5 vs Sep 1–5» en contexto, Share y Prioridades', info['lab'] == 'Oct 1–5 vs Sep 1–5' and info['share_label'] == info['lab'] and info['pri']['baselinePeriod'] == 'Sep 1–5' and info['pri']['currentPeriod'] == 'Oct 1–5' and info['part'], info)
                    chk(f'B5 [{ch}] Σ contribuciones = variación total = actual − comparación (conciliación)', close(info['td'], tot(*cur_r, tc) - tot(*base_r, tc)) and close(info['pos'] + info['neg'], info['td']) and info['rec'] and close(info['rec']['sumContributions'], info['rec']['delta']), info)
                    chk(f'B6 [{ch}] el foco se marca como PARCIAL y el canal queda en el contexto', info['tf']['partial'] and info['ch'] == ch, info)
                    chk(f'B7 [{ch}] la narrativa nombra canal y comparación', info['narr'] and (info['cl'] in info['narr']) and 'Oct 1–5 vs Sep 1–5' in info['narr'], info['narr'])
        s_chans = sum(per_channel_total[c][0] for c in CH); s_base = sum(per_channel_total[c][1] for c in CH)
        chk('B8 Total = Ecommerce + App + WhatsApp + Llamadas (actual y comparación), sin quinto canal', close(per_channel_total['total'][0], s_chans) and close(per_channel_total['total'][1], s_base), (per_channel_total['total'], s_chans, s_base))
        # Σ por entidad: Total = Σ canales
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous'); tot_sh = await share(q)
        acc = {}
        for ch in CH:
            await open_an(q, u, level='product', channel=ch, periodType='month', focusKey='2026-10', comparison='previous'); s_ = await share(q)
            for k, v in s_['o']['cur'].items(): acc[k] = acc.get(k, 0) + v
        okx, dx = allclose(tot_sh['o']['cur'], acc)
        chk('B9 por producto: Total = Σ de los cuatro canales', okx, dx)
        # ---------- C. YoY y períodos completos ----------
        await open_an(q, u, level='category', channel='total', periodType='month', focusKey='2026-10', comparison='year_ago'); sh = await share(q)
        ey = truth('2025-10-01', '2025-10-05', None, 'category')
        okc, dc = allclose(sh['o']['base'], ey)
        chk('C1 YoY de octubre parcial = Oct 1–5 de 2025 (antes comparaba contra el mes anterior)', okc and sh['label'] == 'Oct 1–5, 2026 vs Oct 1–5, 2025', (dc, sh['label']))
        await open_an(q, u, level='category', channel='ecommerce', periodType='month', focusKey='2026-09', comparison='year_ago'); sh = await share(q)
        okc, dc = allclose(sh['o']['base'], truth('2025-09-01', '2025-09-30', 'ecommerce', 'category')); okn, dn = allclose(sh['o']['cur'], truth('2026-09-01', '2026-09-30', 'ecommerce', 'category'))
        chk('C2 Sep-2026 completo vs Sep-2025 completo (Ecommerce)', okc and okn, (dc, dn))
        await open_an(q, u, level='category', channel='app', periodType='month', focusKey='2026-09', comparison='previous'); sh = await share(q)
        okc, dc = allclose(sh['o']['base'], truth('2026-08-01', '2026-08-31', 'app', 'category'))
        chk('C3 Sep-2026 completo vs Ago-2026 completo (App)', okc and sh['label'] == 'Sep 2026 vs Ago 2026', (dc, sh['label']))
        # semana parcial, día, año en curso
        for pt, fk, cr, br, cmpk in (('week', '2026-W41', ('2026-10-05', '2026-10-05'), ('2026-09-28', '2026-09-28'), 'previous'), ('day', '2026-10-05', ('2026-10-05', '2026-10-05'), ('2026-10-04', '2026-10-04'), 'previous'),
                                      ('year', '2026', ('2026-01-01', '2026-10-05'), ('2025-01-01', '2025-10-05'), 'previous')):
            await open_an(q, u, level='category', channel='whatsapp', periodType=pt, focusKey=fk, comparison=cmpk, periodCount=(3 if pt == 'year' else 30 if pt == 'day' else 12)); sh = await share(q)
            okc, dc = allclose(sh['o']['cur'], truth(*cr, 'whatsapp', 'category')); okb, db = allclose(sh['o']['base'], truth(*br, 'whatsapp', 'category'))
            chk(f'C4 [{pt}] actual y comparación equivalentes ({cr[0]}..{cr[1]} vs {br[0]}..{br[1]}) en WhatsApp', okc and okb, (dc, db, sh['label']))
        # ---------- D. Sin datos comparables => N/A (nunca 0 % ni −100 %) ----------
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2025-09', comparison='previous')
        na = await q.evaluate("(()=>{const a=FP.app.state.an;const el=document.getElementById('an-content');return {comp:a.comparisonInfo.comparable,msg:a.comparisonInfo.message,pri:a.priorities.status,con:a.contribution.status,imp:a.rows.map(r=>r.impact).filter(x=>x!==null).length,pct:a.rows.map(r=>r.deltaPct).filter(x=>x!==null).length,txt:el.innerText,share:a.share.comparisonAvailable}})()")
        chk('D1 período anterior sin datos → comparación N/A, sin impactos ni % inventados', (not na['comp']) and na['imp'] == 0 and na['pct'] == 0 and na['pri'] == 'comparison_unavailable' and na['con'] == 'comparison_unavailable' and not na['share'], na)
        chk('D2 la pantalla dice N/A y NO muestra −100 % ni 0 %', 'N/A' in na['txt'] and '−100' not in na['txt'] and '-100' not in na['txt'], [l for l in na['txt'].split('\n') if '100' in l][:3])
        # Canal sin ventas de un producto: Llamadas no vende S05; App no vende S06
        await open_an(q, u, level='product', channel='llamadas', periodType='month', focusKey='2026-09', comparison='previous')
        ents = await q.evaluate("FP.app.state.an.rows.map(r=>r.entity)")
        chk('D3 Llamadas: el producto que no vende por Llamadas no aparece (ni como 0 ni como −100 %)', 'Épsilon Nutri' not in ents and 'Alfa 10 mg' in ents, ents)
        await open_an(q, u, level='product', channel='app', periodType='month', focusKey='2026-10', comparison='previous')
        r03 = await q.evaluate("(()=>{const r=FP.app.state.an.rows.find(x=>x.entity==='Gamma 5 mg');return r&&{c:r.currentValue,p:r.previousValue,pct:r.deltaPct,absent:r.absentCurrent}})()")
        exp_prev = truth(*base_r, 'app', 'product')['Gamma 5 mg']
        chk('D4 App: Gamma sin ventas en octubre → actual $0 real (hay ventas en el canal) con −100 % marcado como ausencia, comparación = Sep 1–5', r03 and r03['c'] == 0 and close(r03['p'], exp_prev) and r03['absent'] and close(r03['pct'], -1), (r03, exp_prev))
        # ---------- E. Sin contexto viejo al cambiar de canal ----------
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        sync = await q.evaluate("""(()=>{FP.app.actions['an-channel']({value:'whatsapp'});const a=FP.app.state.an;return {share:a.share,rows:a.rows.length,sel:a.selected,drill:a.drill,ctx:a.context,cont:a.contribution,ch:a.channel}})()""")
        chk('E1 al cambiar de canal se descarta TODO resultado derivado (share, contribución, fila seleccionada, detalle) antes de recalcular', sync['share'] is None and sync['rows'] == 0 and sync['sel'] is None and sync['drill'] is None and sync['ctx']['channel'] == 'whatsapp' and sync['cont'] is None and sync['ch'] == 'whatsapp', {k: v for k, v in sync.items() if k != 'ctx'})
        await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.key!==null && (a.share||a.error)})()", timeout=60000); await q.wait_for_timeout(300)
        txt = await q.evaluate("document.querySelector('.analysis-context').innerText")
        sh = await share(q)
        chk('E2 tras recalcular, la barra de contexto y las cifras corresponden a WhatsApp', 'WhatsApp' in txt and 'Oct 1–5 vs Sep 1–5' in txt and close(sh['ct'], tot(*cur_r, 'whatsapp')), (txt, sh['ct']))
        # ---------- F. Interfaz ----------
        ui = await q.evaluate("""(()=>{const s=document.getElementById('an-channel');const T=document.getElementById('an-content').innerText;
          return {opts:[...s.options].map(o=>o.value+':'+o.text),val:s.value,kpi:document.querySelectorAll('#an-content .metric--drill').length,cohort:!!document.querySelector('.analysis-cohort-note'),cohortTxt:(document.querySelector('.analysis-cohort-note')||{}).innerText||'',fc:(document.querySelector('.forecast-scope')||{}).textContent||'',recon:(document.querySelector('.analysis-recon')||{}).innerText||'',lbl:[...document.querySelectorAll('label')].filter(l=>l.htmlFor==='an-channel').length,ret:/Retenci[oó]n mes/.test(T)}})()""")
        chk('F1 selector de canal: Total digital, Ecommerce, App, WhatsApp, Llamadas (con etiqueta)', ui['opts'] == ['total:Total digital', 'ecommerce:Ecommerce', 'app:App', 'whatsapp:WhatsApp', 'llamadas:Llamadas'] and ui['val'] == 'whatsapp' and ui['lbl'] == 1, ui)
        chk('F2 KPIs son botones de detalle; Contribución muestra «✓ Conciliado»', ui['kpi'] == 4 and '✓ Conciliado' in ui['recon'], ui)
        chk('F3 el panel de Cohortes se retiró de la página (no se muestra «Retención mes»)', not ui['cohort'] and not ui['ret'], ui['cohortTxt'])
        chk('F4 Forecast: observado (períodos cerrados) vs proyectado marcados; el período en curso no se usa', 'Observado' in ui['fc'] and 'Proyectado' in ui['fc'] and 'no se usa' in ui['fc'] and '2026-09' in ui['fc'], ui['fc'])
        fc = await q.evaluate("(()=>{const a=FP.app.state.an;const f=a.forecast&&a.forecast.rows&&a.forecast.rows[0];const r=a.rows.find(x=>x.entity===(f&&f.entity));return {last:f&&f.lastValue,series:r&&r.series.map(x=>x.period),lastS:r&&r.series.filter(x=>x.value!==null).slice(-1)[0],cohortLatest:a.cohort&&a.cohort.latestPeriod,plist:a.periodsList.map(p=>[p.key,p.partial])}})()")
        chk('F5 Forecast, patrones y cohortes se calculan sobre períodos CERRADOS (el último es 2026-09; Oct parcial excluido)', fc['series'][-1] == '2026-09' and '2026-10' not in fc['series'] and fc['cohortLatest'] == '2026-09' and close(fc['last'], fc['lastS']['value']), fc)
        # ---------- G. Drill-down ----------
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        await q.evaluate("FP.app.actions['an-drill']({dataset:{entity:'Alfa 10 mg',source:'patron'}})")
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data})()", timeout=60000); await q.wait_for_timeout(200)
        dd = await q.evaluate("FP.app.state.an.drill.data")
        e_cur, e_base = truth(*cur_r, None, 'product')['Alfa 10 mg'], truth(*base_r, None, 'product')['Alfa 10 mg']
        chk('G1 detalle de producto: actual/comparación/Δ/Δ% = cálculo aparte', close(dd['summary']['current'], e_cur) and close(dd['summary']['baseline'], e_base) and close(dd['summary']['delta'], e_cur - e_base) and close(dd['summary']['deltaPct'], e_cur / e_base - 1, 1e-6), dd['summary'])
        domr = await q.evaluate("document.getElementById('an-drill').innerText")
        chk('G1b el detalle explica la regla y la evidencia (patrón, períodos, cambios, umbrales, canal)', 'Regla que lo señala' in domr and 'Evidencia' in domr and 'Umbrales usados' in domr and 'Total digital' in domr and 'períodos cerrados analizados' in domr, domr[:400])
        chk('G2 por canal: 4 canales y Σ canales = total del producto (actual y comparación)', len(dd['byChannel']) == 4 and close(sum(x['current'] for x in dd['byChannel']), e_cur) and close(sum(x['baseline'] for x in dd['byChannel']), e_base)
            and all(close(x['current'], truth(*cur_r, x['channel'], 'product').get('Alfa 10 mg', 0)) for x in dd['byChannel']), dd['byChannel'])
        chk('G3 por SKU (siguiente nivel): Σ hijos = total del producto', dd['children']['level'] == 'sku' and close(dd['children']['sumCurrent'], e_cur) and close(dd['children']['sumBaseline'], e_base), dd['children'])
        tp = {}
        for d_, c_, sku, nm, cat, sub, v, pe, un in ROWS:
            if nm == 'Alfa 10 mg': k = d_[:7]; tp[k] = tp.get(k, 0) + v
        tp_oct = sum(v for d_, c_, sku, nm, cat, sub, v, pe, un in ROWS if nm == 'Alfa 10 mg' and cur_r[0] <= d_ <= cur_r[1])
        bp = {x['key']: x for x in dd['byPeriod']}
        chk('G4 detalle temporal: cada mes cerrado = cálculo aparte; octubre aparece parcial (Oct 1–5) y marcado', all(close(bp[k]['value'], tp[k]) for k in bp if k != '2026-10') and close(bp['2026-10']['value'], tp_oct) and bp['2026-10']['partial'] and not bp['2026-09']['partial'], {k: (v['value'], tp.get(k)) for k, v in bp.items()})
        chk('G5 contexto del detalle: Canal + Período + Comparación + Nivel + Métrica', dd['context'] == {'channel': 'Total digital', 'period': 'Octubre 2026 · parcial · hasta 2026-10-05', 'comparison': 'Oct 1–5 vs Sep 1–5', 'level': 'Producto', 'metric': 'Venta'}, dd['context'])
        # → SKU → registros fuente
        await q.evaluate("FP.app.actions['an-drill-down']({dataset:{level:'sku',key:'S01'}})")
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data&&d.data.records})()", timeout=60000); await q.wait_for_timeout(200)
        dd = await q.evaluate("FP.app.state.an.drill.data")
        rec = dd['records']; cur_recs = [r for r in rec['rows'] if r['period'] == 'actual']
        exp_rows = [(d_, c_, v) for d_, c_, sku, nm, cat, sub, v, pe, un in ROWS if sku == 'S01' and cur_r[0] <= d_ <= cur_r[1]]
        chk('G6 registros fuente del SKU: Σ del período actual = total del SKU y cada registro (fecha, canal, venta) existe en el archivo', close(rec['sumCurrent'], sum(v for _, _, v in exp_rows)) and len(cur_recs) == len(exp_rows) and all((r['date'], r['channel'], round(r['revenue'], 2)) in {(d_, c_, round(v, 2)) for d_, c_, v in exp_rows} for r in cur_recs) and all(r['file'] == 'productos4.csv' and isinstance(r['row'], int) for r in rec['rows']), (rec['sumCurrent'], len(cur_recs), len(exp_rows), rec['rows'][:2]))
        chk('G7 el detalle del SKU conserva el contexto y la ruta (producto › SKU)', dd['context']['comparison'] == 'Oct 1–5 vs Sep 1–5' and [n['level'] for n in dd['nodes']] == ['product', 'sku'], dd['nodes'])
        dom = await q.evaluate("document.getElementById('an-drill').textContent")
        chk('G8 la pantalla muestra rutas, tablas de canal/período/registros y «✓ = detalle»', 'Registros fuente' in dom and 'productos4.csv' in dom and '✓ = detalle' in dom, dom[:300])
        # volver y "ver solo este canal" conserva la entidad
        await q.evaluate("FP.app.actions['an-drill-up']({dataset:{index:'-1'}})")
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data&&d.data.byChannel})()", timeout=60000)
        await q.evaluate("FP.app.actions['an-drill-channel']({dataset:{channel:'app'}})")
        await q.wait_for_function("(()=>{const a=FP.app.state.an;const d=a.drill;return !a.loading&&d&&!d.loading&&!d.pending&&d.data&&a.channel==='app'})()", timeout=60000); await q.wait_for_timeout(200)
        dd = await q.evaluate("({d:FP.app.state.an.drill.data,e:FP.app.state.an.drill.entity,sel:FP.app.state.an.selected&&FP.app.state.an.selected.entity})")
        chk('G9 «Ver solo este canal» cambia el canal conservando entidad, período y comparación; las cifras = App', dd['e'] == 'Alfa 10 mg' and close(dd['d']['summary']['current'], truth(*cur_r, 'app', 'product')['Alfa 10 mg']) and dd['d']['context']['channel'] == 'App' and dd['d']['byChannel'] is None, dd['d']['summary'])
        # KPI → total
        await open_an(q, u, level='category', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        await q.click('#an-content .metric--drill >> nth=0')
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data})()", timeout=60000); await q.wait_for_timeout(200)
        kd = await q.evaluate("FP.app.state.an.drill.data")
        ec_ = truth(*cur_r, None, 'category')
        chk('G10 KPI → detalle del total: por canal y por categoría suman el total del análisis', close(kd['summary']['current'], tot(*cur_r)) and close(sum(x['current'] for x in kd['byChannel']), tot(*cur_r)) and kd['children']['level'] == 'category' and close(kd['children']['sumCurrent'], tot(*cur_r)) and {r['key']: r['current'] for r in kd['children']['rows']} and all(close(r['current'], ec_[r['key']]) for r in kd['children']['rows']), kd['summary'])
        # Share & Mix / Contribución / Prioridades abren detalle
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        counts = await q.evaluate("({mix:document.querySelectorAll('.mix-card [data-action=an-drill]').length,con:document.querySelectorAll('.contribution-panel [data-action=an-drill]').length,pat:document.querySelectorAll('#an-trend-table [data-action=an-drill]').length,fc:document.querySelectorAll('.trend-forecast-panel [data-action=an-drill]').length})")
        chk('G11 hay detalle desde Patrones, Mix, Contribución (ya con Prioridades) y Forecast', all(v > 0 for v in counts.values()), counts)
        # ---------- H. Regresiones ----------
        reg = await q.evaluate("""(async()=>{const r=await FP.productAnalysis.run({from:'2026-09-01',to:'2026-09-30',comparison:'previous',channel:'ecommerce',level:'category'});return {rows:(r.rows||[]).map(x=>[x.key||x.entity||x.name, x.revenue&&x.revenue.value!==undefined?x.revenue.value:(x.current&&x.current.revenue&&x.current.revenue.value)]),keys:Object.keys(r).slice(0,12)}})()""")
        exp_cat = truth('2026-09-01', '2026-09-30', 'ecommerce', 'category')
        got = {k: v for k, v in reg['rows'] if k in exp_cat}
        chk('H1 Productos/Categorías (otro módulo) sigue calculando por canal igual que antes', len(got) == len(exp_cat) and all(close(got[k], exp_cat[k]) for k in got), (reg['keys'], reg['rows'][:3]))
        for h in ('#inicio', '#producto', '#pacing', '#calidad', '#analisis'):
            await q.goto(u + h); await q.wait_for_timeout(500)
        chk('H2 navegación por Inicio, Productos, Pacing, Calidad y Análisis sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print(f'\n{len(passed)} OK · {len(fails)} fallas')
    print('RESULTADO batch_an:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
