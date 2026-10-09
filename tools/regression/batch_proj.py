"""Análisis: proyección del total contra la meta (Puente al plan) y referencia de temporada. Verdad calculada aparte en Python."""
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
def month_total(y, m):
    last = (_dt.date(y + (m == 12), m % 12 + 1, 1) - _dt.timedelta(days=1)).day
    return sum(truth(f'{y}-{m:02d}-01', f'{y}-{m:02d}-{last:02d}').values())
def ols(ys):
    n = len(ys); xm = (n - 1) / 2; ym = sum(ys) / n; sxx = sum((i - xm) ** 2 for i in range(n)); b = sum((i - xm) * (y - ym) for i, y in enumerate(ys)) / sxx
    return ym - b * xm, b
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await upload(q, u, 'actual', 'real.csv', actual_csv()); await upload(q, u, 'plan', 'plan.csv', plan_csv())
        await open_an(q, u, level='category', periodType='month', focusKey='2026-09', channel='total', comparison='previous')
        v = await q.evaluate("(()=>{const o=FP.app.state.an.bridge&&FP.app.state.an.bridge.outlookVsPlan;return o?{n:o.items.length,items:o.items}:null})()")
        chk('PROJ-1 el puente trae proyección contra meta (3 meses)', bool(v) and v['n'] == 3, v)
        if v:
            months = [(2026, 4), (2026, 5), (2026, 6), (2026, 7), (2026, 8), (2026, 9)]
            ys = [month_total(*m) for m in months]; a0, b0 = ols(ys)
            plans = {'2026-10': 31 * 110000, '2026-11': 30 * 110000, '2026-12': 31 * 110000}
            okp = all(abs(it['projected'] - max(0, a0 + b0 * (5 + i + 1))) < 1 and it['plan'] == plans[it['period']] and abs(it['pct'] - (it['projected'] / plans[it['period']] - 1)) < 1e-9 for i, it in enumerate(v['items']))
            chk('PROJ-2 proyección = recta de mínimos cuadrados de los últimos 6 meses (aparte) y meta = 110,000 × días del mes', okp, (v['items'], a0, b0))
            txt = await q.evaluate("(()=>{const t=document.querySelector('table[aria-label=\"Proyección contra meta\"]');return t?[...t.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.trim())):null})()")
            chk('PROJ-3 la tabla se ve con 3 filas (Oct, Nov, Dic 2026)', bool(txt) and len(txt) == 3 and txt[0][0].startswith('Oct') , txt)
        # temporada: la proyección de entidad muestra la referencia cuando hay año anterior
        sea = await q.evaluate("(()=>{const r=FP.app.state.an.rows.find(x=>x.story&&x.story.outlook&&x.story.outlook.status==='available');return r?{e:r.entity,s:r.story.outlook.seasonal}:null})()")
        chk('PROJ-4 las entidades con proyección traen referencia de temporada (disponible con 13+ meses)', bool(sea) and sea['s']['status'] == 'available', sea)
        chk('Sin errores de página', not q._errs, q._errs[:2])
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} OK, {len(fails)} FALLAN'); sys.exit(1 if fails else 0)
