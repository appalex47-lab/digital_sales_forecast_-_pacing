"""Análisis · métrica, Volumen·Precio·Mezcla y Puente al plan. Uso: python3 -I batch_pvm.py <raiz>. Verdad calculada aparte en Python."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
def close(a, b, tol=0.02): return a is not None and b is not None and abs(a - b) <= max(tol, abs(b) * 1e-9)
PLAN_DAY = dict(ecommerce=5000, app=3000, whatsapp=1500, llamadas=1000)
def plan_csv():
    out = ['fecha,canal,meta_venta']; d = dt.date(2026, 9, 1)
    while d <= dt.date(2026, 10, 31):
        for ch in CH: out.append(f'{d.isoformat()},{ch},{PLAN_DAY[ch]}')
        d += dt.timedelta(days=1)
    return '\n'.join(out) + '\n'
def agg(frm, to, ch, key):
    """entidad -> (venta, unidades)"""
    out = {}
    for d, c, sku, nm, cat, sub, v, p, u in ROWS:
        if d < frm or d > to or (ch and c != ch): continue
        k = {'product': nm, 'category': cat, 'sku': sku, 'channel': c}[key]
        a = out.get(k, (0, 0)); out[k] = (a[0] + v, a[1] + u)
    return out
def pvm(a0, a1):
    """Implementación independiente de la descomposición (Python)."""
    ks = set(a0) | set(a1); cont = [k for k in ks if a0.get(k, (0, 0))[0] > 0 and a1.get(k, (0, 0))[0] > 0 and a0[k][1] > 0 and a1[k][1] > 0]
    U0 = sum(a0[k][1] for k in cont); U1 = sum(a1[k][1] for k in cont); T = dict(volume=0, price=0, mix=0, new=0, lost=0)
    for k in ks:
        r0, u0 = a0.get(k, (0, 0)); r1, u1 = a1.get(k, (0, 0))
        if r0 <= 0 and r1 > 0: T['new'] += r1
        elif r1 <= 0 and r0 > 0: T['lost'] -= r0
        elif k in cont:
            p0, p1, s0 = r0 / u0, r1 / u1, u0 / U0
            T['price'] += (p1 - p0) * u1; T['volume'] += (U1 - U0) * s0 * p0; T['mix'] += (u1 - U1 * s0) * p0
    return T
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        cur_r, base_r = ('2026-10-01', '2026-10-05'), ('2026-09-01', '2026-09-05')
        # ---- sin plan cargado: el puente dice por qué no está disponible, sin inventar ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        nb = await q.evaluate("FP.app.state.an.bridge")
        chk('P0 sin Plan cargado: puente no disponible con mensaje claro (sin meta inventada)', nb and nb['status'] == 'unavailable' and 'meta' in (nb.get('message') or '').lower(), nb)
        # ---- cargar plan ----
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="plan"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="plan"]', files=[{'name': 'plan2026.csv', 'mimeType': 'text/csv', 'buffer': plan_csv().encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
        await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=90000); await q.wait_for_timeout(800)
        # ---- PVM: total y por canal, producto y categoría ----
        for ch in ['total'] + CH:
            for lvl in ('product', 'category', 'sku'):
                await open_an(q, u, level=lvl, channel=ch, periodType='month', focusKey='2026-10', comparison='previous')
                pv = await q.evaluate("FP.app.state.an.pvm"); tc = None if ch == 'total' else ch
                key = {'product': 'product', 'category': 'category', 'sku': 'sku'}[lvl]
                a0, a1 = agg(*base_r, tc, key), agg(*cur_r, tc, key); T = pvm(a0, a1)
                dl = sum(v[0] for v in a1.values()) - sum(v[0] for v in a0.values())
                if pv['status'] == 'unavailable':
                    chk(f'P1 [{ch}/{lvl}] PVM no disponible sólo si ninguna entidad es continua', not [k for k in a0 if k in a1 and a0[k][0] > 0 and a1[k][0] > 0], pv.get('message')); continue
                t = pv['total']
                chk(f'P1 [{ch}/{lvl}] Volumen/Precio/Mezcla/Nuevos/Perdidos = cálculo aparte', all(close(t[k], T[kk], 0.05) for k, kk in [('volume', 'volume'), ('price', 'price'), ('mix', 'mix'), ('newItems', 'new'), ('lost', 'lost')]), (t, T))
                chk(f'P2 [{ch}/{lvl}] Σ componentes = Δ venta real ({dl:,.2f}) y la app lo marca conciliado', close(t['delta'], dl, 0.05) and pv['reconciliation']['ok'], (t['delta'], dl, pv['reconciliation']))
        # Producto sin ventas en la app en octubre → «perdido»
        await open_an(q, u, level='product', channel='app', periodType='month', focusKey='2026-10', comparison='previous')
        pv = await q.evaluate("FP.app.state.an.pvm"); g = next((r for r in pv['rows'] if r['entity'] == 'Gamma 5 mg'), None)
        a0 = agg(*base_r, 'app', 'product')['Gamma 5 mg'][0]
        chk('P3 Gamma 5 mg (App): sin ventas en octubre → clasificado «perdido» con efecto = −venta base; no entra a precio/volumen', g and g['kind'] == 'lost' and close(g['lost'], -a0) and g['price'] == 0 and g['volume'] == 0, g)
        ne = next((r for r in pv['rows'] if r['entity'] == 'Eta Nuevo'), None)
        chk('P3b Eta Nuevo (sólo desde oct-1) → «nuevo» con efecto = venta actual', ne and ne['kind'] == 'new' and close(ne['newItems'], agg(*cur_r, 'app', 'product')['Eta Nuevo'][0]), ne)
        # ---- Puente: total y por canal ----
        for ch in ['total'] + CH:
            await open_an(q, u, level='product', channel=ch, periodType='month', focusKey='2026-10', comparison='previous')
            br = await q.evaluate("FP.app.state.an.bridge"); tc = None if ch == 'total' else ch
            n_ch = 4 if ch == 'total' else 1
            plan = 5 * (sum(PLAN_DAY.values()) if ch == 'total' else PLAN_DAY[ch]); act = tot(*cur_r, tc); base = tot(*base_r, tc)
            chk(f'P4 [{ch}] Meta = {plan:,} (5 días × plan diario), Real = cálculo aparte, brecha = Real − Meta', br['status'] == 'available' and close(br['plan'], plan) and close(br['actual'], act) and close(br['gap'], act - plan), {k: br.get(k) for k in ('status', 'plan', 'actual', 'gap', 'message')})
            chk(f'P5 [{ch}] Σ aportes por producto = brecha; observado − esperado = brecha; base = Sep 1–5', br['reconciliation']['ok'] and close(br['observed'] - br['expected'], br['gap']) and close(br['baseline'], base), br['reconciliation'])
            exp_ch = {c: (PLAN_DAY[c] * 5, tot(*cur_r, c)) for c in ([ch] if ch != 'total' else CH)}
            got = {c['channel']: (c['plan'], c['actual']) for c in br['channels']}
            chk(f'P6 [{ch}] brecha por canal = Real − Meta de cada canal y Σ canales = brecha', all(close(got[c][0], exp_ch[c][0]) and close(got[c][1], exp_ch[c][1]) for c in exp_ch) and br['reconciliation']['channelOk'], got)
        # ---- Sin meta para el período (2025: el plan cargado es 2026) / comparación sin datos ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2025-10', comparison='previous')
        br = await q.evaluate("FP.app.state.an.bridge")
        chk('P7 período fuera del año del plan: puente «no disponible» y dice que el plan cargado es 2026', br['status'] == 'unavailable' and '2026' in (br.get('message') or ''), br)
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2025-09', comparison='previous')
        br, pv = await q.evaluate("[FP.app.state.an.bridge, FP.app.state.an.pvm]")
        chk('P8 comparación sin datos (sep-2025 vs ago-2025 que no existe): PVM y puente N/A con el mismo motivo, sin números', br['status'] == 'unavailable' and pv['status'] == 'unavailable' and 'total' not in pv, (br, pv))
        # ---- Selector de métrica ----
        for met, idx in (('orders', 7), ('units', 8)):
            await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
            await q.evaluate(f"FP.app.actions['an-metric']({{value:'{met}'}})"); await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.key!==null && a.share})()", timeout=60000); await q.wait_for_timeout(300)
            r = await q.evaluate("(()=>{const a=FP.app.state.an;const s=a.share;return {cur:s.currentTotal,base:s.baselineTotal,ctx:a.context.metric,lab:a.context.metricLabel,pvm:a.pvm.status,br:a.bridge.status,sumc:s.rows.reduce((t,r)=>t+r.currentValue,0),sumb:s.rows.reduce((t,r)=>t+r.baselineValue,0),recon:a.reconciliation,txt:document.querySelector('.analysis-context').innerText,kpi:document.querySelector('.trend-kpis').innerText,cont:a.contribution.status}})()")
            ec = sum(x[idx] for x in ROWS if cur_r[0] <= x[0] <= cur_r[1]); eb = sum(x[idx] for x in ROWS if base_r[0] <= x[0] <= base_r[1])
            chk(f'M1 métrica {met}: total actual y comparación = cálculo aparte; Σ entidades = total', close(r['cur'], ec) and close(r['base'], eb) and close(r['sumc'], ec) and close(r['sumb'], eb), (r['cur'], ec, r['base'], eb))
            chk(f'M2 métrica {met}: contexto lo declara, PVM/puente «no aplica», contribución concilia y no hay «$» en KPIs', r['ctx'] == met and r['pvm'] == 'not_applicable' and r['br'] == 'not_applicable' and r['cont'] == 'available' and r['lab'] in r['txt'] and '$' not in r['kpi'], (r['txt'], r['kpi'], r['pvm'], r['br']))
        # ---- Pantalla ----
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        ui = await q.evaluate("""(()=>{const T=document.getElementById('an-content').innerText;const s=document.getElementById('an-metric');
          return {opts:[...s.options].map(o=>o.value+':'+o.text),val:s.value,pvm:(document.getElementById('an-pvm')||{}).innerText||'',br:(document.getElementById('an-bridge')||{}).innerText||''}})()""")
        chk('U1 selector de métrica: Venta · Pedidos · Unidades', ui['opts'] == ['revenue:Venta', 'orders:Pedidos', 'units:Unidades'] and ui['val'] == 'revenue', ui['opts'])
        chk('U2 panel PVM: lectura, «✓ Conciliado», método y límites', 'Volumen · Precio · Mezcla' in ui['pvm'] and 'Lectura:' in ui['pvm'] and '✓ Conciliado' in ui['pvm'] and 'Método y límites' in ui['pvm'], ui['pvm'][:500])
        chk('U3 panel Puente: Meta/Real/Brecha, tabla por canal, «✓ Conciliado» y supuesto explícito', all(x in ui['br'] for x in ('Meta', 'Real', 'Brecha $', 'Por canal', '✓ Conciliado', 'crecer parejo')), ui['br'][:500])
        await open_an(q, u, level='category', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        ui2 = await q.evaluate("(document.getElementById('an-pvm')||{}).innerText||''")
        chk('U4 a nivel categoría el panel advierte que el precio incluye mezcla interna', 'incluye cambios internos de mezcla' in ui2, ui2[:300])
        chk('U5 sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print(f'\n{len(passed)} OK · {len(fails)} fallas')
    print('RESULTADO batch_pvm:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
