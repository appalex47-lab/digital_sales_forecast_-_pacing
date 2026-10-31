"""Cross-sell (sección Crecer): productos que se compran juntos, resumen por reglas, niveles, canal, menú Crecer y móvil. Uso: python3 batch_crosssell.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 9, 23, 9, 0)); await q.goto(U + '#crosssell'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        t0 = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C1 sin pedidos explica qué cargar y ofrece datos de ejemplo', 'Todavía no hay pedidos cargados' in t0 and 'id_pedido' in t0 and 'Probar con datos de ejemplo' in t0, t0[:200])
        gr = await q.evaluate("FP.guidanceConfig.GROUPS.map(g=>[g.id,g.label,g.question,g.views])")
        d = {g[0]: g for g in gr}
        chk('C2 el menú tiene la sección madre «Crecer» (¿Qué puedo mover?) con Cross-sell y Promociones', d.get('crecer') and d['crecer'][1] == 'Crecer' and d['crecer'][2] == '¿Qué puedo mover?' and d['crecer'][3] == ['crosssell', 'promociones'], d.get('crecer'))
        chk('C3 Recuperar ya no incluye Promociones', d['recuperar'][3] == ['reforecast', 'recovery'], d['recuperar'])
        nav = await q.evaluate("[...document.querySelectorAll('.snav__toggle')].map(t=>t.querySelector('.snav__tl > span').textContent.trim())")
        chk('C4 el menú lateral muestra Crecer entre Recuperar y Medir y aprender', 'Crecer' in nav and nav.index('Crecer') == nav.index('Recuperar') + 1 and nav.index('Crecer') + 1 == nav.index('Medir y aprender'), nav)
        await q.evaluate("FP.app.actions['p-mock-clientes']()")
        for _ in range(90):
            await q.wait_for_timeout(1000)
            if await q.evaluate("(FP.app.state.staging.items[0]||{}).status") == 'ready': break
        await q.evaluate("FP.app.actions['commit-staged']()")
        for _ in range(60):
            await q.wait_for_timeout(1000)
            if await q.evaluate("FP.app.state.staging.items.length") == 0: break
        for _ in range(90):
            if await q.evaluate("FP.customerStore.info().then(i=>Boolean(i&&i.orders>0))"): break
            await q.wait_for_timeout(1000)
        await q.evaluate("location.hash='#carga'"); await q.wait_for_timeout(300); await q.evaluate("location.hash='#crosssell'")
        try: await q.wait_for_function("(document.getElementById('cs-body')||{innerText:''}).innerText.includes('Resumen general')", timeout=60000)
        except Exception: pass
        t1 = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C5 la página: veredicto, 5 chips (con principio activo), 6 KPIs y resumen con filas por reglas', await q.locator('#cs-body .px-verdict h2').count() == 1 and await q.locator('#cs-body .px-tchip').count() == 5 and await q.locator('#cs-body .px-kpi').count() == 6 and await q.locator('[data-cs-summary] .px-sum__r').count() >= 2, t1[:300])
        chk('C6 secciones: canastas, candidatos, productos ancla, categorías, canal y qué hago; método cerrado', all(x in t1 for x in ('¿Qué tan grandes son las canastas?', 'Candidatos a cross-sell', 'Productos ancla', 'Entre categorías', 'Por canal', '¿Qué hago con esto?', 'Método y definiciones')) and await q.evaluate("!document.getElementById('cs-meth').open"), t1[:200])
        a = await q.evaluate("FP.customerStore.basket({}).then(x=>x)")
        C = await q.evaluate("FP.config.products.crossSell")
        chk('C7 todo candidato cumple los umbrales y «con A sin B» = pedidos con A − juntos', a['status'] == 'ok' and a['candidates'] and all(x['n'] >= C['minPairs'] and x['lift'] >= C['minLift'] and x['conf'] >= C['minConf'] and x['aOnly'] == x['na'] - x['n'] for x in a['candidates']), a['candidates'][:2])
        chk('C8 la distribución de canastas suma 100 % y el promedio de productos es ≥ 1', abs(sum(a['dist']) - 1) < 1e-9 and a['avgItems'] >= 1, a['dist'])
        mp = await q.evaluate("FP.productStore.suggestMapping(['Principio activo','PRINCIPIO_ACTIVO','Sustancia activa','Ingrediente activo','principio_activo'], 'sales')")
        alias = await q.evaluate("['PRINCIPIO_ACTIVO','Sustancia activa','Ingrediente activo','principio_activo'].map(h=>FP.productStore.suggestMapping([h],'sales')[h])")
        chk('C4b la carga reconoce la columna del principio activo con sus variantes de nombre', mp['Principio activo'] == 'activeIngredient' and all(x == 'activeIngredient' for x in alias), [mp, alias])
        chk('C4c el catálogo guarda el principio activo y la plantilla lo incluye', await q.evaluate("(()=>{const c=FP.productStore.catalog.list.find(x=>x.activeIngredient);return Boolean(c)&&FP.config.products.dataType.template.includes('principio_activo')})()"))
        ing = await q.evaluate("FP.customerStore.basket({level:'ingredient'}).then(x=>[x.status,x.ingredientCoverage,x.candidates.length])")
        chk('C4d el nivel «Principio activo» calcula pares entre sustancias y reporta la cobertura', ing[0] == 'ok' and ing[1] > 0.99 and ing[2] > 0, ing)
        ex = await q.evaluate("Promise.all([FP.customerStore.basket({}), FP.customerStore.basket({excludeSameIngredient:false})]).then(([a,b])=>[a.excludedSame,a.candidates.length,b.candidates.length,b.excludedSame])")
        chk('C4e descartar pares del mismo principio activo quita pares y los cuenta; sin descartar vuelven', ex[0] > 0 and ex[3] == 0 and ex[2] > ex[1], ex)
        await q.select_option('[data-cs="level"]', 'ingredient'); await q.wait_for_timeout(2000)
        t_i = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C4f el selector de nivel ofrece «Principio activo» y la página lo muestra', await q.evaluate("FP.app.state.cs.result.level") == 'ingredient' and 'Principio demo' in t_i, t_i[:200])
        await q.select_option('[data-cs="level"]', 'product'); await q.wait_for_timeout(1500)
        short = await q.evaluate("document.querySelector('[data-cs-summary]').innerText")
        await q.click('#cs-md [data-v=l]'); await q.wait_for_timeout(300)
        long_ = await q.evaluate("document.querySelector('[data-cs-summary]').innerText")
        chk('C9 la versión larga da más texto que la corta', len(long_) > len(short) and 'sum--l' in await q.evaluate("document.querySelector('[data-cs-summary]').className"))
        await q.click('#cs-md [data-v=c]'); await q.wait_for_timeout(200)
        sp = [float(x.replace('$', '').replace(',', '')) for x in await q.evaluate("[...document.querySelectorAll('#s-c tbody tr')].map(r=>r.lastElementChild.innerText)")]
        await q.click('[data-cs-sort=c] [data-v=space]'); await q.wait_for_timeout(300)
        sp2 = [float(x.replace('$', '').replace(',', '')) for x in await q.evaluate("[...document.querySelectorAll('#s-c tbody tr')].map(r=>r.lastElementChild.innerText)")]
        chk('C9b ordenar candidatos por «Espacio en pesos» deja primero el mayor espacio', sp2 == sorted(sp2, reverse=True) and len(sp2) >= 1 and await q.evaluate("document.querySelector('[data-cs-sort=c] [aria-pressed=true]').dataset.v") == 'space', sp2)
        rest = [float(x.replace('$', '').replace(',', '')) for x in await q.evaluate("[...document.querySelectorAll('#s-a tbody tr')].map(r=>r.children[3].innerText)")]
        hd = await q.evaluate("document.querySelector('#s-a thead').innerText")
        chk('C9c los productos ancla se ordenan por el ticket del resto de la canasta (mayor primero) y muestran ticket, resto y pedido sin él', rest == sorted(rest, reverse=True) and len(rest) >= 1 and all(h in hd for h in ('Ticket del pedido', 'Resto de la canasta', 'Pedido sin él')), rest)
        await q.click('[data-cs-sort=a] [data-v=orders]'); await q.wait_for_timeout(300)
        od = [int(x.replace(',', '')) for x in await q.evaluate("[...document.querySelectorAll('#s-a tbody tr')].map(r=>r.children[1].innerText)")]
        chk('C9d ordenar anclas por pedidos deja primero el que más pedidos tiene', od == sorted(od, reverse=True), od)
        if await q.locator('#s-c [data-cs-fold=c]').count():
            await q.click('#s-c [data-cs-fold=c]'); await q.wait_for_timeout(200)
            chk('C10 «Ver todos» muestra todos los pares', await q.locator('#s-c tr.px-x').first.is_visible())
        else:
            chk('C10 con 5 pares o menos no hay «Ver todos»', await q.locator('#s-c tr.px-x').count() == 0)
        n_strict = await q.evaluate("FP.app.state.cs.result.counts.strong")
        await q.select_option('[data-cs="preset"]', 'wide'); await q.wait_for_timeout(2000)
        cnt = await q.evaluate("FP.app.state.cs.result.counts")
        t_w = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C16 sensibilidad «Amplio»: aparecen más pares, los nuevos se marcan «señal más débil» y el veredicto lo dice', cnt['strong'] == n_strict and cnt['weak'] > 0 and 'señal más débil' in t_w, cnt)
        st = await q.evaluate("JSON.parse(localStorage.getItem('fp.crossSell.thresholds'))")
        chk('C17 la elección se guarda en el navegador', st and st['th']['minPairs'] == 10 and st['th']['minLift'] == 1.2, st)
        await q.reload(); await q.wait_for_timeout(1500)
        try: await q.wait_for_function("(document.getElementById('cs-body')||{innerText:''}).innerText.includes('Resumen general')", timeout=60000)
        except Exception: pass
        chk('C18 al recargar se conserva la sensibilidad', await q.evaluate("FP.app.state.cs.preset") == 'wide' and await q.evaluate("document.querySelector('[data-cs=preset]').value") == 'wide')
        await q.click('#cs-th-toggle'); await q.fill('#cs-th-n', '15'); await q.fill('#cs-th-l', '1.5'); await q.fill('#cs-th-c', '2'); await q.click('#cs-th-apply'); await q.wait_for_timeout(2000)
        chk('C19 umbrales propios: se aplican, el preset pasa a «Personalizado» y el título lo marca', await q.evaluate("FP.app.state.cs.preset") == 'custom' and await q.evaluate("FP.app.state.cs.result.options.minPairs") == 15 and 'ajustado' in await q.evaluate("document.getElementById('cs-body').innerText"))
        await q.fill('#cs-th-n', '1'); await q.click('#cs-th-apply'); await q.wait_for_timeout(1500)
        chk('C20 un valor fuera de rango se corrige al límite (mín. 5 pedidos)', await q.evaluate("FP.app.state.cs.th.minPairs") == 5)
        await q.click('#cs-th-reset'); await q.wait_for_timeout(2000)
        chk('C21 «Restablecer» vuelve a Estricto', await q.evaluate("FP.app.state.cs.preset") == 'strict' and await q.evaluate("FP.app.state.cs.result.counts.weak") == 0)
        await q.select_option('[data-cs="level"]', 'category'); await q.wait_for_timeout(1500)
        t2 = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C11 con nivel Categoría la página se recalcula', 'Entre categorías' in t1 and 'Entre categorías' in t2 and await q.evaluate("FP.app.state.cs.result.level") == 'category', t2[:200])
        await q.select_option('[data-cs="level"]', 'product'); await q.wait_for_timeout(800)
        await q.select_option('[data-cs="channel"]', 'app'); await q.wait_for_timeout(1500)
        t3 = await q.evaluate("document.getElementById('cs-body').innerText")
        chk('C12 con un canal elegido se recalcula y no hay sección «Por canal»', await q.evaluate("FP.app.state.cs.result.options.channel") == 'app' and 'Por canal' not in t3, t3[:200])
        await q.select_option('[data-cs="channel"]', 'total'); await q.wait_for_timeout(1200)
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(600)
        chk('C13 Promociones sigue abriendo en su dirección y el menú marca Crecer', await q.evaluate("!document.getElementById('view-promociones').hidden && document.querySelector('.snav__toggle[data-value=\"crecer\"]').getAttribute('aria-expanded')") == 'true')
        await q.evaluate("location.hash='#crosssell'"); await q.wait_for_timeout(800)
        for w in (390, 320):
            await q.set_viewport_size({'width': w, 'height': 800}); await q.wait_for_timeout(300)
            ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth")
            chk(f'C14 sin desborde horizontal en {w}px ({ov}px)', ov <= 1, ov)
        chk('C15 sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print('RESULTADO batch_crosssell:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails))
    sys.exit(1 if fails else 0)
asyncio.run(main())
