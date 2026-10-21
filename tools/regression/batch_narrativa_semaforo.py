"""Narrativa · señales A favor / En contra (top 5, agrupación, «ver más»). Corre: python3 batch_narrativa_semaforo.py <raíz>"""
import sys, asyncio, re
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await load_products(q, U)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#narrativa'); await q.wait_for_selector('#nx-sections .claim', timeout=30000); await q.wait_for_timeout(800)
        info = await q.evaluate("""(()=>{const n=FP.app.state.nx.narrative, ids=n.sections.signals.claims, cl=n.claims.filter(c=>ids.includes(c.id));
          const d=(c)=>c.meta&&c.meta.direction; return {total:cl.length,pos:cl.filter(c=>d(c)==='improvement').length,neg:cl.filter(c=>d(c)==='deterioration').length,
          colsPos:document.querySelectorAll('.nx-sigcol--pos').length,colsNeg:document.querySelectorAll('.nx-sigcol--neg').length,
          rowsPos:document.querySelectorAll('.nx-sigcol--pos > ul > li').length,rowsNeg:document.querySelectorAll('.nx-sigcol--neg > ul > li').length}})()""")
        chk('SV-1 hay señales y se separan en columnas A favor / En contra', info['total'] > 0 and (info['colsPos'] + info['colsNeg']) >= 1, info)
        chk('SV-2 cada columna muestra como máximo 5 filas al inicio', info['rowsPos'] <= 5 and info['rowsNeg'] <= 5, info)
        sig = await q.evaluate("[...document.querySelectorAll('.nx-sigcol')].map(c=>({k:c.className,h:c.querySelector('.nx-sigcol__h').textContent.trim(),more:!!c.querySelector('[data-action=nx-sig-more]:not([data-dir])')}))")
        # contenido: al expandir todo, todas las señales están pintadas (con su «¿Por qué dices eso?»)
        for _ in range(40):
            btn = q.locator('[data-action="nx-sig-more"]:not([data-dir])').first
            if await btn.count() == 0: break
            await btn.click(); await q.wait_for_timeout(60)
        miss = await q.evaluate("(()=>{const n=FP.app.state.nx.narrative, dom=document.getElementById('nx-sections').textContent.replace(/\\s+/g,' '); const ids=n.sections.signals.claims; return n.claims.filter(c=>ids.includes(c.id)&&!dom.includes(c.text.replace(/\\s+/g,' '))).map(c=>c.text.slice(0,60))})()")
        chk('SV-3 al pulsar «Ver más» hasta el final aparecen TODAS las señales (no se pierde ninguna)', miss == [], miss)
        sw = await q.evaluate("document.querySelectorAll('.nx-sig details.claim__why').length")
        chk('SV-4 cada fila conserva su «¿Por qué dices eso?»', sw >= 1, sw)
        grp = await q.evaluate("[...document.querySelectorAll('.nx-sig--grp')].map(e=>({t:e.querySelector('.nx-sig__t').textContent, n:e.querySelectorAll('.nx-sig__members > li').length}))")
        chk('SV-5 las señales repetidas se agrupan con su detalle desplegable (≥3 por grupo)', all(g['n'] >= 3 for g in grp), grp)
        await q.evaluate("document.querySelector('[data-action=nx-sig-more][data-dir=less]')&&document.querySelector('[data-action=nx-sig-more][data-dir=less]').click()")
        await q.wait_for_timeout(200)
        r2 = await q.evaluate("Math.max(...[...document.querySelectorAll('.nx-sigcol')].map(c=>c.querySelectorAll(':scope > ul > li').length))")
        chk('SV-6 «Ver menos» vuelve a 5 filas', r2 <= 5, r2)
        txt = await q.inner_text('#view-narrativa')
        chk('SV-7 sin undefined/NaN/null en la vista', not re.search(r'undefined|NaN|\bnull\b', txt))
        # agrupación con señales sintéticas (como la captura: CR por día de la semana + volumen por día + semanas sueltas)
        await q.set_viewport_size({'width': 1280, 'height': 900})
        r = await q.evaluate("""(()=>{const st=FP.app.state, n=st.nx.narrative; const mk=(i,txt,meta)=>({id:'s'+i,level:'senal',text:txt,source:{module:'signalEngine',field:'evidence'},numbers:[],meta});
          const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'], cl=[]; let i=0;
          days.forEach((d,k)=>cl.push(mk(i++,'Día de la semana '+d+' · CR: 0.8% vs 0.39% (+'+(94+k)+'.0%)',{kind:'segment_change',direction:'improvement',metric:'cr',metricLabel:'CR',dimension:'weekday',dimensionLabel:'Día de la semana',deltaPct:(94+k*5)/100})));
          days.forEach((d,k)=>cl.push(mk(i++,'Día de la semana '+d+' · Volumen (-'+(40+k)+'.0%)',{kind:'segment_change',direction:'deterioration',metric:'sessions',metricLabel:'Volumen',dimension:'weekday',dimensionLabel:'Día de la semana',deltaPct:-(40+k*2)/100})));
          for(let w=0;w<8;w++) cl.push(mk(i++,'Semana W'+w+' · Venta (+'+(100+w)+'%)',{kind:'segment_change',direction:'improvement',metric:'revenue',metricLabel:'Venta',dimension:'week',dimensionLabel:'Semana ISO',deltaPct:1+w/100}));
          cl.push(mk(i++,'AOV $3,311 vs $2,900 (+14.1%)',{kind:'driver_change',direction:'improvement',metric:'aov',metricLabel:'AOV',deltaPct:.141}));
          cl.push(mk(i++,'Volumen 5,249,369 vs 8,395,383 (-37.5%)',{kind:'driver_change',direction:'deterioration',metric:'sessions',metricLabel:'Volumen',deltaPct:-.375}));
          n.claims=n.claims.concat(cl); n.sections.signals.claims=cl.map(c=>c.id); n.sections.signals.empty=null; st.nx.sigShown={pos:5,neg:5,neu:5}; FP.narrativeView.render(st);
          const pos=[...document.querySelectorAll('.nx-sigcol--pos > ul > li')], neg=[...document.querySelectorAll('.nx-sigcol--neg > ul > li')];
          return {pos:pos.length,neg:neg.length,posGrp:pos.filter(e=>e.classList.contains('nx-sig--grp')).map(e=>[e.querySelector('.nx-sig__t').textContent,e.querySelector('.nx-pill').textContent,e.querySelectorAll('.nx-sig__members > li').length]),negGrp:neg.filter(e=>e.classList.contains('nx-sig--grp')).map(e=>e.querySelector('.nx-sig__t').textContent),h:[...document.querySelectorAll('.nx-sigcol__h .field__hint')].map(e=>e.textContent)}})()""")
        chk('SV-11 agrupa «CR sube en 6 valores de Día de la semana» con su rango y 6 señales dentro', any('CR sube en 6' in g[0] and g[2] == 6 and ' a ' in g[1] for g in r['posGrp']), r)
        chk('SV-12 también agrupa lo negativo y las 8 semanas; el tope inicial es 5 filas por columna', len(r['negGrp']) == 1 and len(r['posGrp']) == 2 and r['pos'] <= 5 and r['neg'] <= 5, r)
        # canal: cambiar de canal rehace las columnas y reinicia el tope
        await q.select_option('#nx-ch', 'ecommerce'); await q.wait_for_timeout(1500)
        chk('SV-8 al cambiar de canal se vuelven a pintar las señales sin error', await q.evaluate("document.querySelectorAll('.nx-sigcol').length")>=1 and not errs, errs[:3])
        # móvil
        await q.set_viewport_size({'width': 390, 'height': 844}); await q.wait_for_timeout(600)
        m = await q.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,cols:getComputedStyle(document.querySelector('.nx-sigcols')).gridTemplateColumns.split(' ').length,btn:Math.min(...[...document.querySelectorAll('.nx-sigcol__f .btn')].map(x=>x.getBoundingClientRect().height),99)})")
        chk('SV-9 en móvil sin desborde, 1 columna y botones tocables (≥40 px)', m['sw'] <= m['cw'] and m['cols'] == 1 and m['btn'] >= 40, m)
        chk('SV-10 sin errores de consola', not errs, errs[:3])
        await b.close()
asyncio.run(main())
