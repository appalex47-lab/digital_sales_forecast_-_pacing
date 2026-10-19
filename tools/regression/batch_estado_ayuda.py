"""v0.14.3 · «Estado» no debe abrir la ayuda de «Estado de la República» cuando significa la situación de algo (plan, acción, dato, fuente...).
Recorre todas las vistas con datos de prueba y revisa cada encabezado/definición que diga solo «Estado». Uso: python3 batch_estado_ayuda.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b, 1280, 900)
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
        await load_products(q, u)
        await q.evaluate("FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        views = await q.evaluate("[...new Set(FP.guidanceConfig.GROUPS.flatMap(g=>g.views))]")
        chk('E0 hay vistas que recorrer', len(views) >= 10, views)
        seen, bad = 0, []
        for v in views:
            await q.goto(u + '#' + v); await q.wait_for_timeout(900)
            await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
            r = await q.evaluate("""(()=>{const out=[];document.querySelectorAll('main dt, main th, main h3.panel__title, main h4').forEach(el=>{
              const t=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
              if(!/^estado$/i.test(t))return;const dot=el.querySelector('.help-dot,[data-help-id],button');out.push({tag:el.tagName,geo:el.dataset.help||null,help:dot?(dot.dataset.help||dot.dataset.helpId||dot.getAttribute('data-id')||dot.outerHTML.slice(0,90)):null})});return out})()""")
            seen += len(r)
            for x in r:
                if x['help'] and not x['geo']: bad.append((v, x))
        chk('E1 ningún «Estado» (situación) en las vistas lleva la ayuda de «Estado de la República»', not bad, bad[:5])
        print('   encabezados «Estado» revisados en vistas:', seen)
        g = await q.evaluate("""(()=>{const d=document.createElement('div');d.innerHTML='<table><thead><tr><th data-help="estadoProducto">Estado</th><th>Estado</th><th>Sucursal</th></tr></thead></table>';document.body.appendChild(d);FP.help.decorate(d);
          const ths=[...d.querySelectorAll('th')];const r=ths.map(t=>!!t.querySelector('button,.help-dot'));d.remove();return r})()""")
        chk('E2 el encabezado geográfico marcado sí lleva ayuda; el «Estado» sin marca no; «Sucursal» conserva la suya', g == [True, False, True], g)
        t = await q.evaluate("(FP.guidanceConfig.HELP||{}).estadoProducto || FP.help.entry('estadoProducto')")
        txt = await q.evaluate("JSON.stringify(FP.help.entry('estadoProducto'))")
        chk('E3 la entrada de glosario dice «de la República» y aclara que no es la situación de un dato', 'de la República' in txt and 'situación' in txt, txt[:200])
        chk('Sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_estado_ayuda:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
