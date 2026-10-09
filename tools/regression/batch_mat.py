"""Materialidad en Análisis: la tabla de patrones oculta entidades que pesan menos de X % del total (en actual o base) y lo dice; Contribución no se afecta."""
import sys
from an_common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await open_an(q, u, level='product', periodType='month', focusKey='2026-09', channel='total', comparison='previous')
        cur, base = truth('2026-09-01', '2026-09-30', None, 'product'), truth('2026-08-01', '2026-08-31', None, 'product')
        tot = max(sum(cur.values()), sum(base.values()))
        share = {k: max(cur.get(k, 0), base.get(k, 0)) / tot for k in set(cur) | set(base)}
        d = await q.evaluate("FP.app.state.an.minSharePct")
        chk('MAT-0 el valor por defecto es 0.5 %', d == 0.5, d)
        for pct in (0, 0.5, 10, 14):
            await q.evaluate(f"FP.app.actions['an-min-share']({{value:'{pct}'}});null"); await q.wait_for_timeout(500)
            vis = sorted(await q.evaluate("(FP.app.state.an._filteredRows||[]).map(r=>r.entity)"))
            want = sorted(k for k, v in share.items() if v >= pct / 100 and k in {r for r in vis} | set(share))
            all_ents = sorted(await q.evaluate("FP.app.state.an.rows.map(r=>r.entity)"))
            want = sorted(k for k in all_ents if share.get(k, 0) >= pct / 100)
            txt = await q.evaluate("(document.querySelector('.trend-count')||{innerText:''}).innerText")
            hidden = len(all_ents) - len(want)
            chk(f'MAT-{pct} con {pct} %: se ven {len(want)} de {len(all_ents)} entidades (calculado aparte)', vis == want, (vis, want))
            chk(f'MAT-{pct} el conteo {"dice cuántas se ocultan" if hidden else "no menciona ocultas"}', (f'{hidden} ocultas por materialidad' in txt) if hidden else ('ocultas' not in txt), txt)
        ctr = await q.evaluate("(FP.app.state.an.contribution&&FP.app.state.an.contribution.evidence?FP.app.state.an.contribution.evidence.entities.length:null)")
        chk('MAT-C Contribución sigue con todas las entidades (no se filtra por materialidad)', ctr == len(all_ents), (ctr, len(all_ents)))
        # Contribución: con materialidad alta la tabla lista solo las entidades materiales y avisa cuántas oculta; el cambio neto no cambia
        await q.evaluate("FP.app.actions['an-min-share']({value:'10'});null"); await q.wait_for_timeout(600)
        info = await q.evaluate("(()=>{const c=FP.app.state.an.contribution; const rows=[...document.querySelectorAll('.contribution-table tbody th .link-btn')].map(x=>x.innerText.trim()); const n=document.querySelector('.contribution-mat'); return {rows, net:c.totalDelta, note:n?n.innerText:'', hid:n?Number(n.dataset.hidden):0}})()")
        mat10 = {k for k, v in share.items() if v >= 0.10}
        chk('MAT-C2 con 10 %: la tabla de Contribución solo lista entidades materiales', info['rows'] and set(info['rows']) <= mat10, (info['rows'], mat10))
        chk('MAT-C3 el aviso dice cuántas entidades se ocultan y que el neto incluye todas', info['hid'] > 0 and 'incluyen todas' in info['note'], info['note'])
        chk('MAT-C4 el cambio neto sigue siendo el total del periodo', abs(info['net'] - (sum(cur.values()) - sum(base.values()))) < 1, (info['net'], sum(cur.values()) - sum(base.values())))
        await q.evaluate("FP.app.actions['an-min-share']({value:'0'});null"); await q.wait_for_timeout(500)
        none = await q.evaluate("document.querySelectorAll('.contribution-mat').length")
        chk('MAT-C5 con «Mostrar todas» no hay aviso', none == 0, none)
        chk('Sin errores de página', not q._errs, q._errs[:2])
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} OK, {len(fails)} FALLAN'); sys.exit(1 if fails else 0)
