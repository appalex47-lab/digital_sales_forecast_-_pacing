"""Carga de productos · aviso de llave duplicada: muestra la llave COMPLETA y qué métrica difiere, y explica qué hacer.
La llave real = fecha · canal · SKU (+ estado, sucursal, entrega, ciudad, «otra dimensión» si se mapea). Uso: python3 -I batch_dupkey.py <raiz>."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
JS = """()=>{const PS=FP.productStore;const H=['fecha','canal','sku','producto','categoria','subcategoria','venta','pedidos','unidades','tienda'];
  const run=(mapExtra,rows)=>{const map=PS.suggestMapping(H).map||PS.suggestMapping(H);const m={...map};if(mapExtra)m['tienda']='extraDimension';else m['tienda']=null;
    const d=PS.createDraft(H,m,{kind:'sales'});rows.forEach((r,i)=>d.addRow(i+2,r));return d};
  const A=['2026-09-01','app','S1','Prod','Cat','Sub','100','1','2','T1'];
  const exact=run(false,[A,A.slice()]);
  const conf=run(false,[A,['2026-09-01','app','S1','Prod','Cat','Sub','250','3','5','T2']]);
  const extra=run(true,[A,['2026-09-01','app','S1','Prod','Cat','Sub','250','3','5','T2']]);
  const part=[...extra.parts.values()][0];
  const comb=PS.combine([...part.values()]);
  return {exact:{sum:exact.summary,ex:exact.issues.examples},conf:{sum:conf.summary,ex:conf.issues.examples,acc:[...[...conf.parts.values()][0].values()].length},extra:{sum:extra.summary,cells:part.size,rev:comb.values[0]}}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await q.goto(u + '#carga'); await q.wait_for_function("window.FP && FP.productStore", timeout=30000)
        r = await q.evaluate(JS)
        e = r['exact']; c = r['conf']; x = r['extra']
        ex = [i for i in e['ex'] if i['type'] == 'EXACT_DUPLICATE']; cf = [i for i in c['ex'] if i['type'] == 'CONFLICT']
        chk('DK1 duplicado exacto: se conserva una vez y el aviso muestra la llave completa (fecha · canal · SKU)', e['sum']['exactDuplicates'] == 1 and e['sum']['accepted'] == 1 and ex and '2026-09-01 · app · S1' in ex[0]['value'], e)
        chk('DK2 conflicto: se cuenta, la 2.ª fila NO se suma y el aviso dice qué métrica difiere con los valores de cada fila', c['sum']['conflicts'] == 1 and c['acc'] == 1 and cf and 'venta: 100 (fila 2) vs 250 (fila 3)' in cf[0]['message'] and 'pedidos: 1 (fila 2) vs 3 (fila 3)' in cf[0]['message'], c)
        chk('DK3 el aviso de conflicto explica la salida: mapear la columna que las distingue como «otra dimensión»', cf and 'otra dimensión' in cf[0]['message'] and 'NO se suma' in cf[0]['message'], cf[:1])
        chk('DK4 con «otra dimensión» mapeada las dos filas son válidas y se SUMAN (350), sin conflicto', x['sum']['conflicts'] == 0 and x['cells'] == 2 and abs(x['rev'] - 350) < 1e-9, x)
        chk('DK5 sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_dupkey:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
