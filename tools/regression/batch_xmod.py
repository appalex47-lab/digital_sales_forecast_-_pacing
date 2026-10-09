"""Cuadre entre módulos: Diagnóstico (titular + Categoría→Producto), vista Producto y Análisis (Evolución/patrones)
para el MISMO canal/periodo/comparación, contra verdad independiente en Python."""
import sys, json
from an_common import *
import datetime as _dt
def actual_csv():
    agg = {}
    for d, c, sku, nm, cat, sub, v, p, u in ROWS:
        a = agg.setdefault((d, c), [0, 0]); a[0] += v; a[1] += p
    return 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'{d},{c},{round(v,2)},{p},{p*40}' for (d, c), (v, p) in sorted(agg.items())) + '\n'
def plan_csv():
    pl = ['fecha,canal,meta_venta']; d = _dt.date(2026, 1, 1)
    while d <= _dt.date(2026, 12, 31):
        for c in CH: pl.append(f'{d},{c},{50000 if c=="ecommerce" else 20000}')
        d += _dt.timedelta(days=1)
    return '\n'.join(pl) + '\n'
async def upload(q, u, typ, name, text):
    await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{typ}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{typ}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(1500)
def close(a, b, tol=0.5): return a is not None and b is not None and abs(a - b) <= tol
CASES = [  # (nombre, tipo, clave, canal, desde, hasta, base_desde, base_hasta)
    ('Sep total', 'month', '2026-09', 'total', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'),
    ('Sep ecommerce', 'month', '2026-09', 'ecommerce', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'),
    ('Sep llamadas', 'month', '2026-09', 'llamadas', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'),
    ('Oct parcial total', 'month', '2026-10', 'total', '2026-10-01', '2026-10-05', '2026-09-01', '2026-09-05'),
    ('Oct parcial app', 'month', '2026-10', 'app', '2026-10-01', '2026-10-05', '2026-09-01', '2026-09-05'),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await upload(q, u, 'actual', 'real.csv', actual_csv()); await upload(q, u, 'plan', 'plan.csv', plan_csv())
        for name, typ, key, ch, f, t, bf, bt in CASES:
            chan = None if ch == 'total' else ch
            tc, tb = truth(f, t, chan, 'category'), truth(bf, bt, chan, 'category')
            tp, tpb = truth(f, t, chan, 'product'), truth(bf, bt, chan, 'product')
            T, TB = sum(tc.values()), sum(tb.values())
            # ---- Diagnóstico
            await q.goto(u + '#diagnostico'); await q.wait_for_timeout(800)
            await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'comparison'},value:'actual_vs_previous'});null")
            await q.evaluate("FP.app.actions['dx-period-type']({dataset:{value:'month'}});null"); await q.wait_for_timeout(300)
            await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'channel'},value:%s});null" % json.dumps(ch)); await q.wait_for_timeout(300)
            await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodKey'},value:%s});null" % json.dumps(key)); await q.wait_for_timeout(800)
            await q.wait_for_function("(()=>{const p=FP.app.state.dx.products;return p&&p.result&&!p.loading&&FP.app.state.dx.run&&FP.app.state.dx.run.period.key==%s&&FP.app.state.dx.run.channel.id==%s})()" % (json.dumps(key), json.dumps(ch)), timeout=60000)
            dx = await q.evaluate("(()=>{const r=FP.app.state.dx.products.result,d=FP.app.state.dx.run;const m=(x)=>Object.fromEntries(x.rows.map(y=>[y.key,[y.revenue.current,y.revenue.baseline]]));return {from:r.from,to:r.to,bf:r.category.baseline.from,bt:r.category.baseline.to,cat:m(r.category),prod:m(r.product),tc:r.category.total.revenue.current,tb:r.category.total.revenue.baseline,hc:d.result&&d.result.current,hb:d.result&&d.result.baseline,cov:d.coverage||null}})()")
            chk(f'[{name}] Diagnóstico·productos: periodo {f}→{t} y base {bf}→{bt}', (dx['from'], dx['to'], dx['bf'], dx['bt']) == (f, t, bf, bt), dx)
            chk(f'[{name}] Diagnóstico·categorías = verdad (actual y base)', all(close(dx['cat'].get(k, [0, 0])[0], v) for k, v in tc.items()) and all(close(dx['cat'].get(k, [0, 0])[1], v) for k, v in tb.items()), {k: (dx['cat'].get(k), tc.get(k), tb.get(k)) for k in set(tc) | set(tb)})
            chk(f'[{name}] Diagnóstico·productos = verdad', all(close(dx['prod'].get(k, [0, 0])[0] or 0, v) for k, v in tp.items()) and all(close(dx['prod'].get(k, [0, 0])[1], v) for k, v in tpb.items()))
            chk(f'[{name}] Diagnóstico·Σ categorías = Σ productos = total', close(sum(v[0] or 0 for v in dx['cat'].values()), dx['tc']) and close(sum(v[0] or 0 for v in dx['prod'].values()), dx['tc']) and close(dx['tc'], T) and close(dx['tb'], TB), (dx['tc'], T, dx['tb'], TB))
            rc = await q.evaluate("(()=>{const e=document.querySelector('#dx-products [data-recon]');return e?[e.dataset.recon,e.textContent]:null})()")
            hc, hb = dx['hc']['revenue'], dx['hb']['revenue']
            want = 'ok' if close(hc, T, 1) and close(hb, TB, 1) else 'diff'
            chk(f'[{name}] Diagnóstico muestra nota de cuadre correcta ({want})', bool(rc) and rc[0] == want and (want == 'ok' or ('Diferencia' in rc[1])), rc)
            # ---- Producto
            await q.evaluate("FP.app.actions['pa-from-dx']();null"); await q.goto(u + '#producto') if False else None
            await q.evaluate("location.hash='#producto';null")
            await q.wait_for_function("(()=>{const p=FP.app.state.pa;return p.result&&!p.loading&&p.from==%s})()" % json.dumps(f), timeout=60000)
            pa = await q.evaluate("(()=>{const p=FP.app.state.pa,r=p.result;return {ch:p.channel,from:r.period.from,to:r.period.to,bf:r.baseline.from,bt:r.baseline.to,cat:Object.fromEntries(r.rows.map(y=>[y.key,[y.revenue.current,y.revenue.baseline]])),tc:r.total.revenue.current,tb:r.total.revenue.baseline}})()")
            chk(f'[{name}] Producto: mismo periodo/canal/base que Diagnóstico', (pa['from'], pa['to'], pa['bf'], pa['bt'], pa['ch']) == (f, t, bf, bt, ch), pa)
            chk(f'[{name}] Producto = Diagnóstico por categoría', all(close(pa['cat'][k][0], dx['cat'][k][0]) and close(pa['cat'][k][1], dx['cat'][k][1]) for k in dx['cat']), (pa['cat'], dx['cat']))
            # ---- Análisis
            await open_an(q, u, level='category', periodType=typ, focusKey=key, channel=ch, comparison='previous')
            an = await q.evaluate("(()=>{const a=FP.app.state.an,s=a.share;return {bp:s.baselinePeriod,cp:s.currentPeriod,ct:s.currentTotal,bt:s.baselineTotal,cat:Object.fromEntries(s.rows.map(y=>[y.entity,[y.currentValue,y.baselineValue]])),ev:Object.fromEntries(a.rows.map(r=>[r.entity,[r.currentValue,r.previousValue]])),last:Object.fromEntries(a.rows.map(r=>[r.entity,(r.series||[]).slice(-1)[0]]))}})()")
            chk(f'[{name}] Análisis·mix = Diagnóstico por categoría (actual y base)', all(close(an['cat'].get(k, [0, 0])[0], dx['cat'][k][0]) and close(an['cat'].get(k, [0, 0])[1], dx['cat'][k][1]) for k in dx['cat']), (an['cat'], dx['cat'], an['bp'], an['cp']))
            chk(f'[{name}] Análisis·totales = verdad', close(an['ct'], T) and close(an['bt'], TB), (an['ct'], T, an['bt'], TB))
            chk(f'[{name}] Análisis·patrones (Evolución) usan el mismo actual/base', all(close(an['ev'][k][0], tc.get(k, 0)) and close(an['ev'][k][1], tb.get(k, 0)) for k in an['ev']), an['ev'])
            # ---- Titular de Diagnóstico vs productos (explicación de diferencia)
            if dx.get('hc') is not None: print(f'   · titular dx: actual {dx["hc"]} base {dx["hb"]} | productos: {dx["tc"]:.2f} / {dx["tb"]:.2f} | cobertura {dx["cov"]}')
            txt = await q.evaluate("(()=>{FP.app.actions && 0;return null})()")
        # aviso cuando producto y venta real no llegan al mismo día
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(600)
        no_note = await q.evaluate("!document.querySelector('#dx-products [data-recon=days]')")
        await q.evaluate("(()=>{const d=FP.app.state.dx.run;d.coverage={...d.coverage,currentRange:[d.coverage.currentRange[0],'2026-10-03']};FP.diagnosticView.renderProducts(FP.app.state);return null})()")
        note = await q.evaluate("(document.querySelector('#dx-products [data-recon=days]')||{textContent:''}).textContent")
        chk('Diagnóstico avisa si producto y venta real no cubren los mismos días (y no avisa si coinciden)', no_note and 'hasta 2026-10-05' in note and 'hasta 2026-10-03' in note, (no_note, note))
        chk('sin errores de consola', not q._errs, q._errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} OK, {len(fails)} FALLAN'); sys.exit(1 if fails else 0)
