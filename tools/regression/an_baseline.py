import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        print('meta', await q.evaluate("JSON.stringify({a:FP.productStore.meta.dateMin,b:FP.productStore.meta.dateMax,c:FP.productStore.meta.channels})"))
        for st in ({'periodType':'month','focusKey':'2026-10','comparison':'previous'}, {'periodType':'month','focusKey':'2026-10','comparison':'year_ago'}, {'periodType':'month','focusKey':'2026-09','comparison':'previous'}):
            await open_an(q, u, level='category', **st)
            r = await q.evaluate("(()=>{const a=FP.app.state.an;return JSON.stringify({err:a.error,key:a.key,tf:a.temporal&&a.temporal.focus,cur:a.temporal&&a.temporal.currentTotal,cmp:a.temporal&&a.temporal.comparisons.map(c=>[c.id,c.value,c.change]),share:{b:a.share.baselinePeriod,c:a.share.currentPeriod,bt:a.share.baselineTotal,ct:a.share.currentTotal},contrib:a.contribution&&a.contribution.totalDelta,pm:a.partialComparison,rows:a.rows.length,ch:a.channel})})()")
            print(st['focusKey'], st['comparison'], r)
        print('truth oct1-5', tot('2026-10-01','2026-10-05'), 'sep1-5', tot('2026-09-01','2026-09-05'), 'sep', tot('2026-09-01','2026-09-30'))
        print(q._errs[:3]); await b.close()
asyncio.run(main())
