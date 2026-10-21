"""Fase 15.2 · foto numérica del reporte: genera el reporte con datos deterministas en 3 escenarios y guarda TODOS los valores numéricos
(sin textos). Corre: python3 editorial_snapshot.py <raíz> <salida.json>. Antes y después del cambio editorial el resultado debe ser idéntico."""
import sys, asyncio, json
from ed_common import *
OUT = sys.argv[2]
async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        q = await boot(b); st = await generate(q); res['base'] = await q.evaluate(NUM); res['base']['status'] = st
        await month_prev(q); st = await generate(q); res['mes_anterior'] = await q.evaluate(NUM); res['mes_anterior']['status'] = st
        q2 = await boot(b, patch=True); st = await generate(q2); res['excedente'] = await q2.evaluate(NUM); res['excedente']['status'] = st
        await b.close()
    json.dump(res, open(OUT, 'w'), ensure_ascii=False, sort_keys=True)
    print({k: (len(v['nums']), v['status'], len(v['ids'])) for k, v in res.items()})
asyncio.run(main())
