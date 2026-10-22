"""Presentación (PDF ejecutivo) y Datos → Exportar datos (paquete .zip). Corre: python3 batch_presentacion.py <raíz>"""
import sys, asyncio, re
from an_common import *
from recovery_state import prepare
U = f'http://127.0.0.1:{port}/index.html'
async def gen_rp(pg):
    """Pulsa «Generar vista previa»; si aparece el aviso de datos faltantes, elige «Generar de todos modos»."""
    await pg.click('[data-action="rp-generate"]'); await pg.wait_for_timeout(150)
    if await pg.query_selector('[data-action="rp-gap-go"]'): await pg.click('[data-action="rp-gap-go"]')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        # sin datos: la vista no inventa nada
        await q.goto(U + '#presentacion'); await q.wait_for_selector('#view-presentacion:not([hidden])')
        gen = await q.evaluate("(()=>{const b=document.querySelector('[data-action=\"rp-generate\"]');return b?{dis:b.disabled}:null})()")
        chk('PR-1 sin datos la vista carga y no rompe (generar existe o hay aviso)', gen is not None or (await q.inner_text('#view-presentacion')).strip() != '', gen)
        nsel = await q.evaluate("document.querySelectorAll('select[data-action]').length")
        txt1 = await q.inner_text('#view-presentacion')
        chk('PR-1 sin venta por producto no se muestran selectores de filtro de relleno (solo el aviso)', 'primero carga la venta por producto' in txt1 and not await q.evaluate("[...document.querySelectorAll('select')].some(e=>e.dataset.action==='rp-filter')"), nsel)
        await load_products(q, U)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await gen_rp(q)
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        st = await q.evaluate("({s:FP.app.state.rp.status,ids:FP.app.state.rp.report.pages.map(p=>p.id),om:FP.app.state.rp.report.omitted.map(o=>[o.id,!!o.reason]),n:document.querySelectorAll('#view-presentacion .rp-page').length})")
        chk('PR-2 genera el reporte: portada, resumen, pacing, confiabilidad y anexo', st['s'] == 'ready' and st['ids'][:2] == ['cover', 'summary'] and 'reliability' in st['ids'] and 'closing' in st['ids'] and 'annex' in st['ids'], st)
        chk('PR-3 toda página omitida trae su motivo', all(r for _, r in st['om']), st['om'])
        chk('PR-4 la vista previa dibuja las páginas del reporte', st['n'] >= 5, st)
        # desborde y tamaño mínimo de letra en cada página
        await q.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:true})"); await q.emulate_media(media='print')
        ov = await q.evaluate("[...document.querySelectorAll('#rp-print-host .rp-page')].map((p,i)=>{const b=p.querySelector('.rp-body');return b&&b.scrollHeight>b.clientHeight+1?i+1:0}).filter(Boolean)")
        chk('PR-5 ninguna página desborda su cuerpo', ov == [], ov)
        fs = await q.evaluate("Math.min(...[...document.querySelectorAll('#rp-print-host .rp-page *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)))")
        chk('PR-6 letra mínima ≥ 13 px (≈10 pt) en el PDF', fs >= 13, fs)
        n_print = await q.evaluate("document.querySelectorAll('#rp-print-host .rp-page').length")   # la vista previa omite por defecto el anexo técnico; el montaje de la prueba incluye todo
        await q.pdf(path='/tmp/rp_test.pdf', prefer_css_page_size=True, print_background=True)
        import subprocess; info = subprocess.run(['pdfinfo', '/tmp/rp_test.pdf'], capture_output=True, text=True).stdout
        pg = re.search(r'Pages:\s+(\d+)', info); sz = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
        chk('PR-7 el PDF real sale en 16:9 con una hoja por página del reporte', bool(pg and sz) and int(pg.group(1)) == n_print and abs(float(sz.group(1)) / float(sz.group(2)) - 16 / 9) < 0.01, [pg and pg.group(1), sz and sz.groups(), n_print])
        txt = subprocess.run(['pdftotext', '/tmp/rp_test.pdf', '-'], capture_output=True, text=True).stdout
        chk('PR-8 el PDF no imprime «null», «undefined» ni «NaN»', not re.search(r'\b(null|undefined|NaN)\b', txt), re.findall(r'.{20}\b(?:null|undefined|NaN)\b.{20}', txt)[:3])
        await q.emulate_media(media='screen')
        # excluir una página
        await q.evaluate("document.getElementById('rp-print-host')&&document.getElementById('rp-print-host').remove()")
        await q.click('[data-action="rp-toggle-page"][data-id="categories"]') if await q.query_selector('[data-action="rp-toggle-page"][data-id="categories"]') else None
        await q.wait_for_timeout(300)
        n2 = await q.evaluate("document.querySelectorAll('#view-presentacion .rp-page').length")
        chk('PR-9 desmarcar una página la quita de la vista previa', n2 == st['n'] - 1, [n2, st['n']])
        # privacidad
        html = await q.evaluate("document.getElementById('view-presentacion').innerText")
        chk('PR-10 sin credenciales ni claves en la presentación', not re.search(r'sk-|api[_ ]?key|cohere', html, re.I), html[:100])
        # Datos → Exportar datos
        await q.goto(U + '#paquete'); await q.wait_for_timeout(900)
        inside = await q.evaluate("!!document.querySelector('#view-datos #package-view') && !document.getElementById('view-paquete')")
        chk('PR-11 el paquete .zip vive dentro de Datos y #paquete abre esa sección', inside, inside)

        # ---- escenario completo (plan anual, recuperación con escenario y acción) + textos largos y muchas filas ----
        f = await new_page(b, 1280, 900); await f.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#tour-offer{display:none!important}';document.head.appendChild(s)})")
        await load_products(f, U); pr = await prepare(f, U); chk('PR-14 escenario completo preparado (plan, escenario y acción de recuperación)', pr == 'ok', pr)
        await f.goto(U + '#presentacion'); await f.wait_for_selector('[data-action="rp-generate"]')
        await f.evaluate("Object.assign(FP.app.state.dx.settings,{periodType:'year',periodKey:String(FP.app.state.year)}); FP.app.state.dx.run=null")  # lectura anual: la recuperación anual aplica
        await gen_rp(f)
        await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        OVL = """(()=>{const out=[];document.querySelectorAll('#rp-print-host .rp-page').forEach(pg=>{const b=pg.querySelector('.rp-body');if(!b)return;const kids=[...b.children].filter(k=>k.getBoundingClientRect().height>0);const bb=b.getBoundingClientRect();
          kids.forEach((k,i)=>{const r=k.getBoundingClientRect();if(i<kids.length-1&&r.bottom>kids[i+1].getBoundingClientRect().top+1)out.push(pg.dataset.page+':solape');if(r.bottom>bb.bottom+1)out.push(pg.dataset.page+':fuera');});
          const foot=pg.querySelector('.rp-foot').getBoundingClientRect();if(bb.bottom>foot.top+1)out.push(pg.dataset.page+':pie');});return out})()"""
        async def mount(page_):
            await page_.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:true})"); await page_.emulate_media(media='print')
            return await page_.evaluate("(()=>{const h=document.getElementById('rp-print-host');Object.assign(h.style,{display:'block',position:'absolute',left:'-99999px',top:'0'});return 1})()")
        await mount(f)
        full = await f.evaluate("({ids:FP.app.state.rp.report.included, n:document.querySelectorAll('#rp-print-host .rp-page').length, bad:FP.reportView.fitPages(document.getElementById('rp-print-host'))})")
        chk('PR-14 con recuperación la presentación incluye la lámina de Recuperación y todas caben', 'recovery' in full['ids'] and full['bad'] == [], full)
        chk('PR-14 las cuatro brechas con su período viven en el anexo técnico y no en la lámina de recuperación', await f.evaluate("(()=>{const q=(id)=>document.querySelector('#rp-print-host [data-page=\"'+id+'\"]').innerText;return q('annex-1').includes('Brecha pendiente (recuperación)') && q('annex-1').includes('no se suman ni tienen por qué coincidir') && !q('recovery').includes('Brecha proyectada al cierre')})()"))
        chk('PR-14 sin solapes entre bloques, ni invasión del pie (escenario completo)', (await f.evaluate(OVL)) == [], await f.evaluate(OVL))
        hov = await f.evaluate("(()=>{const out=[];document.querySelectorAll('#rp-print-host .rp-page').forEach(pg=>{const pr=pg.getBoundingClientRect();pg.querySelectorAll('.rp-body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&(r.right>pr.right-20||r.left<pr.left+20)&&!e.closest('svg'))out.push(pg.dataset.page+':'+e.tagName+':'+(e.textContent||'').trim().slice(0,20));});});return out.slice(0,6)})()")
        chk('PR-14 ningún elemento de ninguna lámina se sale del ancho imprimible (columnas de tablas incluidas)', hov == [], hov)
        # textos largos + muchas filas inyectados en el reporte ya armado (el armador ya limita filas: se verifica el diseño, no el cálculo)
        await f.evaluate("""(()=>{const L='Complejo vitamínico multimineral con ginseng, ácido fólico y hierro quelado 120 tabletas edición familiar';const r=FP.app.state.rp.report;
          const tr=r.pages.find(p=>p.id==='trends'); if(tr&&tr.status==='included'){tr.tables.forEach(t=>{t.rows=Array.from({length:5},(_,i)=>({...(t.rows[0]||{entity:'',impact:-1,relative:-0.1,pattern:'Caída sostenida · 6 períodos',_spark:null}),entity:L+' '+i}));}); tr.notes.push('Nota metodológica extensa. '.repeat(12));}
          const ca=r.pages.find(p=>p.id==='categories'); if(ca&&ca.status==='included'){ca.tables[0].rows=Array.from({length:6},(_,i)=>({...ca.tables[0].rows[0],key:L+' '+i}));ca.charts[0].items=ca.charts[0].items.slice(0,1);}
          const rc=r.pages.find(p=>p.id==='recovery'); if(rc&&rc.status==='included'){rc.actions=Array.from({length:3},(_,i)=>({title:L+' '+i,owner:'Responsable con nombre muy largo '+i,start:'2026-09-01',end:'2026-09-22'}));rc.notes.push('Texto largo. '.repeat(15));}
          const dr=r.pages.find(p=>p.id==='drivers'); if(dr&&dr.status==='included'){dr.notes.push('Limitación extensa del diagnóstico. '.repeat(10));}})()""")
        await f.evaluate("document.getElementById('rp-print-host')&&document.getElementById('rp-print-host').remove()"); await mount(f)
        lg = await f.evaluate("({bad:FP.reportView.fitPages(document.getElementById('rp-print-host'))})"); ov = await f.evaluate(OVL)
        trimmed = await f.evaluate("[...document.querySelectorAll('#rp-print-host .rp-page[data-trimmed]')].map(p=>[p.dataset.page,!!p.querySelector('.rp-trim')&&p.querySelector('.rp-trim').textContent])")
        chk('PR-15 textos largos y filas con nombres largos: todo cabe sin solapes; si se recortan filas, la lámina lo dice', ov == [] and lg['bad'] == [] and all(t[1] for t in trimmed) and len(trimmed) >= 1, [ov, lg, trimmed])
        chk('PR-15 los nombres largos no se recortan con puntos suspensivos', await f.evaluate("![...document.querySelectorAll('#rp-print-host td')].some(td=>td.textContent.includes('Complejo vitam')&&(getComputedStyle(td).textOverflow==='ellipsis'||td.scrollWidth>td.clientWidth+1))"))
        await f.pdf(path='/tmp/rp_full.pdf', prefer_css_page_size=True, print_background=True)
        import subprocess; t2 = subprocess.run(['pdftotext', '/tmp/rp_full.pdf', '-'], capture_output=True, text=True).stdout
        chk('PR-16 el PDF completo no imprime null/undefined/NaN/Infinity', not re.search(r'\b(null|undefined|NaN|Infinity)\b', t2))
        chk('PR-16 el PDF completo conserva la etiqueta de cada tipo de cifra', all(w in t2 for w in ('Observado', 'Calculado', 'Estimado')))
        # 17 · la presentación por defecto no expone metadatos de la herramienta
        await f.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[]})")
        main_txt = await f.evaluate("[...document.querySelectorAll('#rp-print-host .rp-page')].filter(p=>!/^annex/.test(p.dataset.page)).map(p=>p.innerText).join('\\n')")
        banned = ['Hecho observado', 'Cálculo aritmético', 'Requerimiento aritmético', 'Fuente:', 'Etiquetas:', 'Sin filtros', 'Selección y filtros', 'Cobertura del reporte', 'Método de forecast', 'Calidad de datos', 'Configuración de la herramienta', 'Pág. ', 'ver el anexo', 'sin datos suficientes']
        chk('PR-17 la presentación por defecto no expone filtros, etiquetas, fuentes internas ni cobertura de módulos', not [b for b in banned if b in main_txt], [b for b in banned if b in main_txt])
        chk('PR-17 hay resumen con narrativa y cierre ejecutivo con sus cuatro bloques', all(w in main_txt for w in ('Cierre ejecutivo', 'DÓNDE ESTAMOS', 'QUÉ SOBRESALIÓ', 'QUÉ DEBEMOS MOVER', 'QUÉ DEBEMOS VIGILAR', 'Al corte del')) or all(w in main_txt.lower() for w in ('dónde estamos','qué debemos vigilar','al corte del')), main_txt[:200])
        cov_txt = await f.evaluate("document.querySelector('#rp-print-host [data-page=\"cover\"]').innerText")
        chk('PR-17 la portada no trae configuración de la herramienta', not any(w in cov_txt for w in ('Plan / meta', 'Generado', 'Selección')), cov_txt)
        # 18 · orden (categorías antes de evolución) y filtro único de la presentación
        await f.evaluate("FP.reportView.unmountPrint()"); await f.emulate_media(media='screen')
        ids18 = await f.evaluate("FP.app.state.rp.report.pages.filter(p=>p.status==='included').map(p=>p.id)")
        chk('PR-18 orden: Categorías y productos va antes de Evolución', ids18.index('categories') < ids18.index('trends'), ids18)
        ids_f = await f.evaluate("[...document.querySelectorAll('select[data-action=\"rp-filter\"]')].map(e=>e.dataset.key)")
        chk('PR-18 filtros separados: categoría, subcategoría y producto (y los de ubicación que tengan opciones)', ids_f[:3] == ['category', 'subcategory', 'product'], ids_f)
        chk('PR-18 no hay filtro de tipo de entrega y la sucursal se llama «Nombre de sucursal»', 'delivery' not in ids_f and (('branch' not in ids_f) or 'Nombre de sucursal' in await f.evaluate("document.querySelector('label[for=rp-f-branch]').innerText")), ids_f)
        an_before = await f.evaluate("JSON.stringify(FP.app.state.an.filter||{})")
        cat = await f.evaluate("document.querySelector('#rp-f-category option:nth-child(2)').value")
        await f.select_option('#rp-f-category', value=cat)
        sub = await f.evaluate("(()=>{const o=document.querySelector('#rp-f-subcategory option:nth-child(2)');return o?o.value:null})()")
        if sub: await f.select_option('#rp-f-subcategory', value=sub)
        chk('PR-18 los filtros se combinan (categoría + subcategoría)', (await f.evaluate("Object.keys(FP.app.state.rp.filter||{})")) == (['category', 'subcategory'] if sub else ['category']))
        await gen_rp(f); await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        cov18 = await f.evaluate("FP.app.state.rp.report.pages[0]")
        chk('PR-18 con filtro, la portada lo declara y aclara a qué láminas aplica', bool(cov18.get('filterLabel')) and 'categorías, evolución y clientes' in (cov18.get('filterNote') or ''), cov18.get('filterLabel'))
        chk('PR-18 el filtro de la presentación no cambia el filtro de la vista Evolución', an_before == await f.evaluate("JSON.stringify(FP.app.state.an.filter||{})"), an_before)
        await mount(f)
        t18 = await f.evaluate("(()=>{const q=id=>{const e=document.querySelector('#rp-print-host [data-page=\"'+id+'\"]');return e?e.innerText:''};return {cat:q('categories'),pac:q('pacing'),sum:q('summary')}})()")
        chk('PR-18 cada lámina dice si va filtrada; el pacing con filtro es la selección contra su referencia', 'Filtro:' in t18['cat'] and 'Filtro:' in t18['pac'] and 'periodo de referencia' in t18['pac'] and 'Filtro activo' in t18['sum'], {k: v[:120] for k, v in t18.items()})
        await f.evaluate("FP.reportView.fitPages(document.getElementById('rp-print-host'))")
        chk('PR-18 con filtros activos ninguna lámina se solapa ni invade el pie', (await f.evaluate(OVL)) == [], await f.evaluate(OVL))
        await f.evaluate("FP.reportView.unmountPrint()"); await f.emulate_media(media='screen')
        await f.click('[data-action="rp-filter-clear"]')
        await gen_rp(f); await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        chk('PR-18 sin filtro la portada no menciona filtros', not (await f.evaluate("FP.app.state.rp.report.pages[0].filterLabel")))
        # 19 · el reporte gira en torno al mes seleccionado (mes cerrado distinto del abierto)
        await f.evaluate("(()=>{const s=FP.app.state.dx.settings;const c=FP.app.state.fc.run.cutoff;const d=new Date(c.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);s.periodType='month';s.periodKey=d.toISOString().slice(0,7);FP.app.state.dx.run=null})")
        await gen_rp(f); await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        r19 = await f.evaluate("(()=>{const r=FP.app.state.rp.report,pc=r.pages.find(p=>p.id==='pacing'),sm=r.pages.find(p=>p.id==='summary');return {mk:pc&&pc.monthKey,label:pc&&pc.monthLabel,n:pc&&pc.charts[0].labels.length,narr:sm&&sm.narrative,yr:sm&&sm.yearStrip,rec:(r.omitted.find(o=>o.id==='recovery')||{}).reason||null,sel:FP.app.state.dx.settings.periodKey}})()")
        chk('PR-19 con un mes seleccionado, pacing es de ese mes y su gráfica es diaria', r19['mk'] == r19['sel'] and (r19['n'] or 0) >= 28, r19)
        chk('PR-19 el resumen habla del mes y trae una línea del año', (r19['label'] or '??').lower() in (r19['narr'] or '').lower() and 'En el año' in (r19['yr'] or ''), r19)
        chk('PR-19 la recuperación de un mes que no es el abierto se omite con su motivo', 'mes en curso' in (r19['rec'] or ''), r19)
        # 20 · semana seleccionada: el reporte gira en torno a la semana
        await f.evaluate("(()=>{const s=FP.app.state.dx.settings;s.periodType='week';s.periodKey='2026-W39';FP.app.state.dx.run=null})()")
        await gen_rp(f); await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        r20 = await f.evaluate("(()=>{const r=FP.app.state.rp.report,pc=r.pages.find(p=>p.id==='pacing'),sm=r.pages.find(p=>p.id==='summary');return {mk:pc&&pc.monthKey,n:pc&&pc.charts[0].labels.length,narr:sm&&sm.narrative}})()")
        chk('PR-20 con una semana seleccionada, el pacing y el resumen son de esa semana', r20['mk'] == '2026-W39' and (r20['n'] or 0) == 7 and 'semana 39' in (r20['narr'] or '').lower(), r20)
        # 21 · el corte del reporte lo da su propio selector de periodo; la fecha de referencia de la app no cambia
        await f.evaluate("(()=>{const s=FP.app.state.dx.settings;s.periodType='month';s.periodKey='2026-09';FP.app.state.dx.run=null;window.__ref0=FP.app.state.fc.run.cutoff})()")
        await gen_rp(f); await f.wait_for_function("FP.app.state.rp.status==='ready'", timeout=120000)
        r21 = await f.evaluate("(()=>{const m=JSON.stringify(FP.app.state.rp.report.pages).match(/Fecha de corte.{0,40}/);return {cut:m&&m[0],app:FP.app.state.fc.run.cutoff,ref0:window.__ref0,set:FP.app.state.fc.settings.referenceDate||null}})()")
        chk('PR-21 con un mes cerrado el corte del reporte es el fin de ese mes y la fecha de la app no cambia', '30 sep 2026' in (r21['cut'] or '') and r21['app'] == r21['ref0'] and r21['set'] is None, r21)
        # móvil
        m = await new_page(b, 375, 800); await m.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#tour-offer{display:none!important}';document.head.appendChild(s)})"); await load_products(m, U)
        await m.goto(U + '#presentacion'); await m.wait_for_selector('#view-presentacion:not([hidden])'); await m.wait_for_timeout(500)
        sw = await m.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        chk('PR-12 en móvil (375 px) la vista no genera scroll horizontal de página', sw <= 1, sw)
        chk('PR-13 sin errores de consola', not q._errs and not m._errs and not f._errs, (q._errs + m._errs + f._errs)[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} ok / {len(fails)} fallos'); sys.exit(1 if fails else 0)
