"""#23: «Diagnosticar esto» lleva periodo/canal/comparación al Diagnóstico; CSV de contribución y lectura cuadran con el módulo."""
import sys, csv, io
from an_common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await open_an(q, u, level='product', periodType='month', focusKey='2026-09', channel='total', comparison='previous')
        await q.evaluate("""window.__dl=[];const o=FP.exporter.download;FP.exporter.download=(n,c,m)=>{window.__dl.push({n,c:typeof c==='string'?c:JSON.stringify(c),m});};null""")
        # CSV de contribución
        await q.evaluate("FP.app.actions['an-export-contrib']();null")
        dl = await q.evaluate("window.__dl")
        chk('DX-1 se descargó un CSV de contribución', len(dl) == 1 and dl[0]['n'].startswith('contribucion_2026-09') and dl[0]['n'].endswith('.csv'), dl and dl[0]['n'])
        txt = dl[0]['c'].lstrip('﻿')
        lines = [l for l in txt.split('\n') if not l.startswith('# ')]
        rows = list(csv.DictReader(io.StringIO('\n'.join(lines))))
        cur, base = truth('2026-09-01', '2026-09-30', None, 'product'), truth('2026-08-01', '2026-08-31', None, 'product')
        bad = [r['entidad'] for r in rows if abs(float(r['actual']) - cur.get(r['entidad'], 0)) > 0.5 or abs(float(r['base']) - base.get(r['entidad'], 0)) > 0.5]
        chk('DX-2 base y actual del CSV coinciden con el cálculo independiente', rows and not bad, bad[:3])
        tot = sum(float(r['cambio']) for r in rows)
        want = sum(cur.values()) - sum(base.values())
        chk('DX-3 la suma de cambios del CSV = cambio total del periodo', abs(tot - want) < 1, (tot, want))
        # Diagnosticar
        await q.evaluate("FP.app.actions['an-diagnose']();null"); await q.wait_for_timeout(800)
        s = await q.evaluate("({...FP.app.state.dx.settings,hash:location.hash})")
        chk('DX-4 Diagnóstico queda en mes 2026-09, canal total, vs periodo anterior', s['periodKey'] == '2026-09' and s['periodType'] == 'month' and s['channel'] == 'total' and s['comparison'] == 'actual_vs_previous' and s['hash'] == '#diagnostico', s)
        # año anterior + canal
        await open_an(q, u, level='product', periodType='month', focusKey='2026-09', channel='ecommerce', comparison='year_ago')
        await q.evaluate("FP.app.actions['an-diagnose']();null"); await q.wait_for_timeout(800)
        s = await q.evaluate("FP.app.state.dx.settings")
        chk('DX-5 canal y comparación yoy se trasladan', s['channel'] == 'ecommerce' and s['comparison'] == 'actual_vs_yoy', s)
        # lectura
        await open_an(q, u, level='product', periodType='month', focusKey='2026-09', channel='total', comparison='previous')
        await q.evaluate("window.__dl=[];FP.exporter.download=(n,c,m)=>{window.__dl.push({n,c,m});};null")
        ent = await q.evaluate("FP.app.state.an.rows[0].entity")
        await q.evaluate(f"FP.app.actions['an-drill']({{dataset:{{entity:{ent!r},source:'tabla'}}}});null"); await q.wait_for_timeout(600)
        await q.evaluate("FP.app.actions['an-export-reading']();null")
        dl = await q.evaluate("window.__dl")
        chk('DX-6 se descarga la lectura con el nombre de la entidad', len(dl) == 1 and ent in dl[0]['c'] and dl[0]['n'].startswith('lectura_'), dl and dl[0]['n'])
        chk('Sin errores de página', not q._errs, q._errs[:2])
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} OK, {len(fails)} FALLAN'); sys.exit(1 if fails else 0)
