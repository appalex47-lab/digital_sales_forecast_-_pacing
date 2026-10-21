"""Fase 15.1 · Narrativa ejecutiva (#narrativa): compresión visual sin perder contenido ni funciones. Corre: python3 batch_narrativa_15_1.py <raíz>"""
import sys, asyncio, re, json
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
HEADS = ['¿Qué pasó?', '¿Por qué importa?', '¿Qué está explicando el resultado?', 'Señales: dónde investigar', 'Hipótesis (requieren validación)', 'Producto y geografía', 'Recuperación', '¿Qué hacer ahora?']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        errs = []; q.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); q.on('pageerror', lambda e: errs.append(str(e)))
        # sin datos: estado comprensible, sin undefined/NaN/null
        await q.goto(U + '#narrativa'); await q.wait_for_selector('#nx-sections'); await q.wait_for_timeout(800)
        t0 = await q.inner_text('#view-narrativa')
        chk('NX-1 sin datos la vista carga con un estado explicado y sin undefined/NaN/null', ('Todavía no hay narrativa' in t0 or 'forecast' in t0) and not re.search(r'undefined|NaN|\bnull\b', t0), t0[:200])
        await load_products(q, U)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#narrativa'); await q.wait_for_selector('#nx-sections .claim', timeout=30000); await q.wait_for_timeout(800)
        txt = await q.inner_text('#view-narrativa')
        chk('NX-2 la vista carga sin errores de consola', not errs, errs[:3])
        chk('NX-3 siguen todos los bloques informativos (8 encabezados)', all(h in txt for h in HEADS), [h for h in HEADS if h not in txt])
        chk('NX-4 resumen ejecutivo, cobertura (6 chips) y nota de niveles siguen presentes', 'Resumen ejecutivo' in txt and await q.evaluate("document.querySelectorAll('#nx-summary .nx-cover .chip').length") == 6 and 'Los drivers son atribución matemática' in txt)
        miss = await q.evaluate("(()=>{const n=FP.app.state.nx.narrative, dom=document.getElementById('nx-sections').textContent.replace(/\\s+/g,' '); return n.claims.filter(c=>!dom.includes(c.text.replace(/\\s+/g,' '))).map(c=>c.id+': '+c.text.slice(0,50))})()")
        chk('NX-5 toda afirmación (claim) de la narrativa sigue pintada, con su «¿Por qué dices eso?»', miss == [] and await q.evaluate("document.querySelectorAll('#nx-sections .claim').length") == await q.evaluate("document.querySelectorAll('#nx-sections .claim__why').length"), miss)
        # KPI: valores y procedencia = los mismos campos del forecast que cita la narrativa
        kp = await q.evaluate("(()=>{const n=FP.app.state.nx.narrative, run=FP.app.state.fc.run, id=n.channel.id, S=id==='total'?run.total:run.channels[id], a=S.annual, F=FP.format; return {tiles:[...document.querySelectorAll('#nx-summary .nx-kpi')].map(e=>({l:e.querySelector('.nx-kpi__l').textContent.trim(), v:e.querySelector('.nx-kpi__v').textContent.trim()})), real:F.currency(a.actualToDate.revenue,0), comp:F.percent(a.toDate.revenue.compliance,1), gap:F.currency(a.toDate.revenue.gap,0), fc:(a.forecast&&Number.isFinite(a.forecast.revenue))?F.currency(a.forecast.revenue,0):'No disponible'}})()")
        v = [t['v'] for t in kp['tiles']]
        chk('NX-6 los 4 KPI conservan valor y etiqueta de certeza del forecast', len(v) == 4 and v[0] == kp['real'] and v[1] == kp['comp'] and v[2] == kp['gap'] and v[3] == kp['fc'] and 'Hecho' in kp['tiles'][0]['l'] and 'Cálculo' in kp['tiles'][1]['l'], kp)
        # evidencia: abre y cierra
        ok = await q.evaluate("(()=>{const d=document.querySelector('#nx-sections .claim__why'); d.open=true; const a=d.open && d.textContent.includes('Módulo'); d.open=false; return a && !d.open})()")
        chk('NX-7 «¿Por qué dices eso?» abre y cierra y muestra el módulo fuente', ok)
        # exportación JSON y Cohere
        async with q.expect_download() as dl: await q.click('[data-action="nx-export"]')
        d = await dl.value; js = json.load(open(await d.path()))
        chk('NX-8 la exportación JSON se descarga como narrative_export_*.json con su estructura', d.suggested_filename.startswith('narrative_export_') and isinstance(js, dict) and len(js) > 3, list(js)[:12])
        await q.click('[data-action="nx-ai"]'); await q.wait_for_timeout(600)
        chk('NX-9a sin API key «Redactar con Cohere» avisa con un mensaje claro (comportamiento intacto)', await q.evaluate("/Inicia sesión|API key/.test(document.body.innerText)"))
        await q.evaluate("FP.cohereConnection.isConfigured=()=>true; FP.cohereNarrative.narrate=async()=>({status:'ok',ok:true,result:{summary:'Resumen de prueba',narrative:'Párrafo uno\\n\\nPárrafo dos',missingInfo:[]},errors:[]})")
        await q.click('[data-action="nx-ai"]'); await q.wait_for_timeout(800)
        ai = await q.inner_text('#nx-ai')
        chk('NX-9b con respuesta de Cohere (simulada) el panel de redacción se pinta y la narrativa determinística sigue completa', 'Redacción de Cohere' in ai and 'Resumen de prueba' in ai and await q.evaluate("document.querySelectorAll('#nx-sections .claim').length") > 3, ai[:160])
        # filtros: cambiar de canal sigue funcionando
        await q.select_option('#nx-ch', 'ecommerce'); await q.wait_for_timeout(1500)
        t2 = await q.inner_text('#view-narrativa')
        info = await q.evaluate("({ch:FP.app.state.dx.settings.channel,k:document.querySelectorAll('#nx-summary .nx-kpi').length,claims:document.querySelectorAll('#nx-sections .claim').length,ctx:document.querySelector('.nx-head__ctx').textContent.slice(0,140)})")
        chk('NX-10 el selector de canal sigue actualizando la narrativa y los KPI', info['ch'] == 'ecommerce' and 'Ecommerce' in info['ctx'] and info['k'] == 4 and info['claims'] > 3 and not re.search(r'undefined|NaN|\bnull\b', t2), [info, re.findall(r'.{25}(?:undefined|NaN|\bnull\b).{25}', t2, re.S)])
        chk('NX-11 en escritorio los bloques se agrupan en columnas', await q.evaluate("(()=>{const c=[...document.querySelectorAll('#nx-sections .nx-col')].filter(e=>e.offsetParent); return c.length>=6 && new Set(c.map(e=>Math.round(e.getBoundingClientRect().top))).size < c.length})()"))
        # móvil
        await q.set_viewport_size({'width': 390, 'height': 844}); await q.wait_for_timeout(600)
        m = await q.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,cols:getComputedStyle(document.querySelector('#nx-sections .nx-grid')).gridTemplateColumns.split(' ').length,minBtn:Math.min(...[...document.querySelectorAll('#nx-controls .btn')].map(b=>b.getBoundingClientRect().height))})")
        chk('NX-12 en móvil no hay desborde horizontal, se apila a 1 columna y los botones son tocables', m['sw'] <= m['cw'] and m['cols'] == 1 and m['minBtn'] >= 36, m)
        chk('NX-13 sin errores de consola al final', not errs, errs[:3])
        await b.close()
asyncio.run(main())
