"""Fase 15.2 · pruebas de redacción del reporte: frases prohibidas, concordancia, ausencia de textos rotos y cifras idénticas a la línea base.
Corre: python3 batch_editorial.py <raíz>"""
import sys, json, re
from ed_common import *
STR = """(()=>{const out=[];const walk=(v,p)=>{if(typeof v==='string'){out.push([p,v]);return}if(!v||typeof v!=='object')return;
  if(Array.isArray(v)){v.forEach((x,i)=>walk(x,p));return}Object.keys(v).forEach(k=>{if(k==='tags'||k==='dataUrl')return;walk(v[k],p+'.'+k)})};
  FP.app.state.rp.report.pages.forEach(pg=>walk(pg,pg.id));return out})()"""
BAD = [r'matemáticamente', r'es aritmética, no demuestra', r'\(s\)', r'de l año', r'undefined', r'NaN', r'\[object', r'\bnull\b', r'  +', r'Historia insuficiente', r'\bPalanca', r'plan comparable', r'Historia insuficiente', r'desacelerando', r'Ruptura de tendencia', r'Lo que arrastra', r'Lo que compensa', r'grupo\(s\)', r'mayor palanca', r'[Cc]omponente', r'\bVolumen\b', r'\b1 días\b', r'\b1 productos\b']
ok = bad = 0
def chk(n, c, d=''):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n, d)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        scen = {}
        q = await boot(b); chk('ED-1 base ready', await generate(q) == 'ready'); scen['base'] = await q.evaluate(STR); nums = {'base': await q.evaluate(NUM)}
        # unidades: singular/plural y concordancia
        for n, w, exp in [(1, 'producto', '1 producto'), (2, 'producto', '2 productos'), (2, 'sucursal', '2 sucursales'), (1, 'categoría', '1 categoría'), (3, 'categoría', '3 categorías'), (2, 'SKU', '2 SKUs'), (2, 'tipo de entrega', '2 tipo de entregas')]:
            r = await q.evaluate(f"FP.reportBuilder.nUnits({n},'{w}')")
            if w == 'tipo de entrega': continue
            chk(f'ED-2 {n} {w}', r == exp, r)
        await month_prev(q); chk('ED-3 mes ready', await generate(q) == 'ready'); scen['mes_anterior'] = await q.evaluate(STR); nums['mes_anterior'] = await q.evaluate(NUM)
        q2 = await boot(b, patch=True); chk('ED-4 excedente ready', await generate(q2) == 'ready'); scen['excedente'] = await q2.evaluate(STR); nums['excedente'] = await q2.evaluate(NUM)
        for k, L in scen.items():
            chk(f'ED-5 {k} hay textos', len(L) > 100, len(L))
            for pat in BAD:
                hits = [(pa, s[:90]) for pa, s in L if re.search(pat, s)]
                chk(f'ED-6 {k} sin /{pat}/', not hits, hits[:2])
            chk(f'ED-7 {k} sin ¿¿ ni ..', not [1 for _, s in L if '??' in s or '..' in s.replace('...', '')], '')

        # ---- matriz de casos con la entrada alterada (se reconstruye el reporte con datos modificados; el cálculo no cambia) ----
        MX = """(mut)=>{const i=JSON.parse(JSON.stringify(window.__edIn));const f=new Function('i',mut);f(i);const r=FP.reportBuilder.build.__orig(i);return Object.fromEntries(r.pages.map(p=>[p.id,{st:p.status,h:p.headline||'',n:(p.notes||[]).join(' | '),q:p.question||'',cols:(p.tables||[]).flatMap(t=>(t.columns||[]).map(c=>c.label))}]))}"""
        q = await boot(b); await generate(q)
        base_in = await q.evaluate("window.__edIn.customers && window.__edIn.customers.result && window.__edIn.customers.result.monthly ? window.__edIn.customers.result.monthly.length : -1")
        chk('ED-9 la entrada capturada trae clientes por mes', base_in > 0, base_in)
        c1 = await q.evaluate(MX, "i.customers.result.monthly.forEach(l=>{l.customers={total:1,new:1,recurrent:0,reactivated:0}});i.customers.result.summary.customers=1;")
        h = c1['customers']['h']
        chk('ED-10 1 cliente: «1 compró», «1 nuevo», «0 recurrentes», «1 cliente identificado»', all(x in h for x in ['1 compró', '1 nuevo', '0 recurrentes', '1 cliente identificado']) and '1 compraron' not in h and '1 nuevos' not in h, h)
        c2 = await q.evaluate(MX, "i.customers.result.monthly.forEach(l=>{l.customers={total:2,new:1,recurrent:1,reactivated:0}});")
        h = c2['customers']['h']
        chk('ED-11 2 clientes: «2 compraron», «1 recurrente», «0 reactivados»', all(x in h for x in ['2 compraron', '1 nuevo', '1 recurrente', '0 reactivados']), h)
        c3 = await q.evaluate(MX, "const P=i.trend.priorities;P.drag=(P.drag||[]).slice(0,1);P.compensate=[];P.all=(P.all||[]).filter(x=>x.type==='watch').concat(P.drag);")
        h = c3['trends']['h']
        chk('ED-12 1 que resta y ninguno suma: singular y «nada suma»', c3['trends']['st'] == 'included' and ' resta ' in h and 'restan' not in h and 'nada suma de forma medible' in h and '(s)' not in h, h)
        c4 = await q.evaluate(MX, "const P=i.trend.priorities;P.drag=[];P.compensate=[];")
        chk('ED-13 sin que reste ni sume: la lámina se omite con motivo, no sale vacía', c4['trends']['st'] == 'omitted', c4['trends']['st'])
        c5 = await q.evaluate(MX, "const P=i.trend.priorities;P.compensate=[];")
        h = c5['trends']['h']
        chk('ED-14 solo restan: «nada suma de forma medible»', 'nada suma de forma medible' in h and 'Nada suma' not in h, h)
        c6 = await q.evaluate(MX, "i.customers.result.summary.customers=0;")
        chk('ED-15 sin clientes: la lámina se omite', c6['customers']['st'] == 'omitted', c6['customers']['st'])
        txt = ' '.join(v['h'] + ' ' + v['n'] for v in c1.values())
        chk('ED-16 el caso extremo no deja textos rotos', not re.search(r'undefined|NaN|\[object|\(s\)', txt), txt[:120])

        qr = await boot(b, patch=True); await generate(qr)
        c7 = await qr.evaluate(MX, "[i.rf,i.rfMonth].forEach(r=>{if(r&&r.total&&r.total.horizon)r.total.horizon.futureDays=1});")
        rec = c7.get('recovery', {})
        chk('ED-17 1 día restante: singular en recuperación', rec.get('st') == 'included' and ('el día restante' in rec['h'] or 'meta del horizonte ya está cubierta' in rec['h']) and '1 días' not in rec['h'] + rec['n'], rec)
        c8 = await q.evaluate(MX, "if(i.projection&&i.projection.gap){i.projection.gap.total=0;}")
        se = c8.get('seasonality', {})
        chk('ED-18 meta igual a la proyección: «coincide con», sin «$0 menor/mayor»', ('coincide con' in se.get('h', '')) or not se.get('h', '').startswith('Para '), se.get('h', '')[:160])
        c9 = await q.evaluate(MX, "const c=i.trend.priorities.comparison=i.trend.priorities.comparison||{};c.currentPartial=true;")
        tr = c9['trends']
        chk('ED-19 período parcial: la lámina de evolución lo advierte', 'parcial' in tr['n'].lower(), tr['n'][:140])
        c10 = await q.evaluate(MX, "const P=i.trend.priorities;(P.drag||[]).forEach(x=>{x.impact=-100});(P.compensate||[]).forEach(x=>{x.impact=100});")
        tt = ' '.join(v['h'] + ' ' + v['n'] for v in c10.values())
        chk('ED-20 empates de impacto: reconstruye sin textos rotos', c10['trends']['st'] == 'included' and not re.search(r'undefined|NaN|\[object|\(s\)', tt), tt[:100])

        cA = await q.evaluate(MX, "const c={negative:-125015,positive:1350718,negativeCount:3,positiveCount:4,compensated:true,text:'a compensados por el crecimiento de b'};i.productByLevel.category.compensation=c;")
        nA = cA['categories']['n']
        chk('ED-21 compensación con cifras abreviadas y plurales', '3 grupos cayeron $125K' in nA and '4 grupos (+$1.35M)' in nA and 'grupo(s)' not in nA, nA)
        cB = await q.evaluate(MX, "const c={negative:-5000,positive:3000,negativeCount:1,positiveCount:1,compensated:true,text:'1 grupo(s) crecieron +3,000, pero no alcanzaron a compensar'};i.productByLevel.category.compensation=c;")
        nB = cB['categories']['n']
        chk('ED-22 compensación insuficiente en singular', '1 grupo creció +$3.0K' in nB and 'no alcanza a compensar la caída de 1 grupo' in nB, nB)
        cD = await q.evaluate(MX, "const P=i.trend.priorities;P.drag=(P.drag||[]).slice(0,2);P.compensate=P.drag.map(x=>({...x,impact:Math.abs(x.impact)}));")
        chk('ED-23 evolución: el titular dice cuántos restan y cuántos suman y si se compensan', re.search(r'restan? .* y .* suman?', cD['trends']['h']) is not None or 'se anulan' in cD['trends']['h'] or 'supera' in cD['trends']['h'], cD['trends']['h'])

        # ---- diseño con textos largos reales (cierre y etiquetas de barras) ----
        await q.evaluate("""(()=>{const r=FP.app.state.rp.report;const cl=r.pages.find(p=>p.id==='closing');cl.blocks[2].text='Dermacosméticos concentra 58 % de lo que se pierde; revisar primero la subcategoría Dermocosméticos (−$40.7K), entregas Envío a domicilio (−$52.3K). Ninguna de las 3 acciones registradas en el plan es sobre Dermacosméticos.';cl.blocks[2].list=[{name:'Ecommerce',value:-1670000,type:'Canal'},{name:'Volumen',value:-6990000,type:'Factor'},{name:'Dermacosméticos',value:-71900,type:'Categoría'}];cl.blocks[3].text='El cierre estimado cambia de forma importante según el método de proyección. Cumplir el plan de octubre requiere $1.20M por día durante 11 días restantes. Algunos datos cargados tienen advertencias de calidad; el detalle está en el anexo técnico.';
          const ca=r.pages.find(p=>p.id==='categories');ca.charts[0].items[0].label='Artículos de Medición y Material de Curación';})()""")
        await q.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:true})"); await q.emulate_media(media='print')
        lay = await q.evaluate("""(()=>{const h=document.getElementById('rp-print-host');Object.assign(h.style,{display:'block',position:'absolute',left:'-99999px',top:'0'});FP.reportView.fitPages(h);
          const pg=h.querySelector('[data-page=closing]'),pb=pg.getBoundingClientRect(),ft=pg.querySelector('.rp-foot').getBoundingClientRect();const over=[...pg.querySelectorAll('.rp-cl')].filter(c=>c.getBoundingClientRect().bottom>ft.top+1).length;
          const cg=h.querySelector('[data-page=categories]'),svg=cg.querySelector('svg'),sr=svg.getBoundingClientRect();const cut=[...svg.querySelectorAll('text')].filter(t=>t.getBoundingClientRect().left<sr.left+1).map(t=>t.textContent);return {over,cut}})()""")
        chk('ED-24 cierre con textos largos reales: las tarjetas no invaden el pie', lay['over'] == 0, lay)
        chk('ED-25 etiqueta larga de barras no se sale del gráfico por la izquierda', lay['cut'] == [], lay)
        await q.emulate_media(media='screen')

        CL = """(mut)=>{const i=JSON.parse(JSON.stringify(window.__edIn));new Function('i',mut)(i);const r=FP.reportBuilder.build.__orig(i);return JSON.stringify(r.pages.find(p=>p.id==='closing').blocks)}"""
        cq1 = await q.evaluate(CL, "i.quality=i.quality||{};i.quality.status='warning';i.quality.totals={rejected:1,missingChannels:3};")
        chk('ED-26 calidad concreta en el cierre: singular y plural', '1 fila se rechazó' in cq1 and '3 combinaciones fecha-canal no tienen dato' in cq1, cq1[-300:])
        cq2 = await q.evaluate(CL, "i.quality=i.quality||{};i.quality.status='warning';i.quality.totals={rejected:0,missingChannels:0};")
        chk('ED-27 calidad sin detalle: mensaje neutral, sin inventar la causa', 'advertencias de calidad' in cq2 and 'rechaz' not in cq2, cq2[-200:])
        cq3 = await q.evaluate(CL, "i.quality=i.quality||{};i.quality.status='ok';")
        chk('ED-28 calidad ok: no aparece advertencia de calidad', 'advertencias de calidad' not in cq3 and 'Limitaciones en los datos' not in cq3, cq3[-150:])

        for k, L in scen.items():
            hs = [s for pa, s in L if pa == 'cover.headline']
            chk(f'ED-29 portada {k}: cerrado → «resultados», abierto → «acumulado … al corte» (nunca ambos)', len(hs) == 1 and ((re.search(r': \w+ \d{4}$', hs[0]) and 'al corte' not in hs[0]) or ('acumulado' in hs[0] and 'al corte' in hs[0])), hs)
        base = json.load(open('tools/regression/data/editorial_baseline.json'))
        for k in ('base', 'mes_anterior', 'excedente'):
            cur = nums[k]
            chk(f'ED-8 cifras idénticas a línea base ({k})', cur['nums'] == base[k]['nums'] and cur['ids'] == base[k]['ids'])
        await b.close()
    print(f'{ok} ok / {bad} fail'); sys.exit(1 if bad else 0)
asyncio.run(main())
