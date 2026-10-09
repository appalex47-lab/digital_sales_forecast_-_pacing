"""Archivo de productos transaccional: filas con la misma llave completa se SUMAN (interruptor «Sumar filas con la misma llave», activo por defecto).
Cifras esperadas calculadas aquí. Uso: python3 -I batch_sumkey.py <raiz>."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
JS = """(sum)=>{const PS=FP.productStore;const H=['fecha','canal','sku','producto','categoria','subcategoria','venta','pedidos','unidades'];
  const m=PS.suggestMapping(H).map||PS.suggestMapping(H);
  const run=(rows,on)=>{const d=PS.createDraft(H,{...m},{kind:'sales',sumSameKey:on});rows.forEach((r,i)=>d.addRow(i+2,r));const cells=[...d.parts.values()].flatMap(p=>[...p.values()]);
    return {sum:d.summary,cells:cells.map(c=>({sku:c.sku,v:c.values,s:c.states})),ex:d.issues.examples.map(i=>({t:i.type,msg:i.message}))}};
  const A=['2026-09-01','app','S1','Prod','Cat','Sub','100','2','3'], A2=['2026-09-01','app','S1','Prod','Cat','Sub','50','1','1'];
  const B=['2026-09-01','app','S2','Prod2','Cat','Sub','10','1','1'];
  const bad=['2026-09-01','app','S3','Prod3','Cat','Sub','abc','1','1'], bad2=['2026-09-01','app','S3','Prod3','Cat','Sub','20','1','1'];
  const empty=['2026-09-01','app','S4','Prod4','Cat','Sub','','','2'], empty2=['2026-09-01','app','S4','Prod4','Cat','Sub','30','2','1'];
  const rows=[A,A2,B,B.slice(),bad,bad2,empty,empty2];
  return {on:run(rows,true),off:run(rows,false),prev:null}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await q.goto(u + '#carga'); await q.wait_for_function("window.FP && FP.productStore && FP.app && FP.app.state && FP.app.state.settings", timeout=30000)
        r = await q.evaluate(JS, True); on, off = r['on'], r['off']
        by = lambda d, sku: next(c for c in d['cells'] if c['sku'] == sku)
        a = by(on, 'S1'); chk('SK1 misma llave con valores distintos: venta 100+50=150, pedidos 2+1=3, unidades 3+1=4', a['v'] == [150, 3, 4], a)
        bb = by(on, 'S2'); chk('SK2 filas idénticas también se suman: venta 10+10=20, pedidos 2, unidades 2 (dos pedidos iguales son dos pedidos)', bb['v'] == [20, 2, 2], bb)
        bd = by(on, 'S3'); chk('SK3 un valor inválido en una de las filas deja la venta inválida (no se suma como 0); pedidos y unidades sí se suman', bd['s'] == [2, 0, 0] and bd['v'][1:] == [2, 2], bd)
        e = by(on, 'S4'); chk('SK4 vacío + observado = el observado (venta 30, pedidos 2, unidades 3)', e['v'] == [30, 2, 3] and e['s'] == [0, 0, 0], e)
        chk('SK5 resumen: 4 filas sumadas en 4 llaves, 0 conflictos y 0 duplicados exactos', on['sum']['summedRows'] == 4 and on['sum']['summedKeys'] == 4 and on['sum']['conflicts'] == 0 and on['sum']['exactDuplicates'] == 0, on['sum'])
        chk('SK6 cada fila sumada deja un aviso «Misma llave» informativo', sum(1 for i in on['ex'] if i['t'] == 'SUMMED_SAME_KEY') == 4, on['ex'][:3])
        chk('SK7 con el interruptor apagado se conserva el comportamiento anterior (1 duplicado exacto, 3 conflictos, nada sumado)', off['sum']['summedRows'] == 0 and off['sum']['exactDuplicates'] == 1 and off['sum']['conflicts'] == 3, off['sum'])
        a2 = by(off, 'S1'); chk('SK8 apagado: se queda la primera fila (venta 100), la segunda NO se suma', 100 in a2['v'] and 150 not in a2['v'], a2)
        st = await q.evaluate("FP.app.state.settings.sumSameKey")
        chk('SK9 por defecto la app suma (sumSameKey = true)', st is True, st)
        ui = await q.evaluate("""(()=>{FP.app.actions['set-setting']({dataset:{key:'sumSameKey'},checked:false}); const off=FP.app.state.settings.sumSameKey; FP.app.actions['set-setting']({dataset:{key:'sumSameKey'},checked:true}); return [off, FP.app.state.settings.sumSameKey, !!document.querySelector('[data-key=sumSameKey]')]})()""")
        chk('SK10 el interruptor existe en Opciones de lectura y cambia el ajuste', ui == [False, True, True], ui)
        chk('Sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_sumkey:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
