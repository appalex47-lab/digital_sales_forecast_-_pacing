"""Fase I · Fuentes de datos, resumen y consolidado de cuarentena, resumen de salud. Uso: python3 batch_ak.py <raiz>
Datos con resultado conocido (calculado aquí, aparte de la app). «Hoy» = 2026-10-02 09:00.
AK-1 Fuentes: catálogo (6), estado de cada una, última sincronización, periodo y calidad; las no disponibles dicen la fase y lo que necesitan; sin datos todo dice «Sin archivos».
AK-2 Por tipo de dato: archivos, registros, periodo, frescura (al día / atraso) y cuarentena.
AK-3 Cuarentena: resumen por sección y por regla con conteos exactos (incluye Productos) y consolidado línea por línea con filtros, paginación y CSV.
AK-4 Salud: resumen por tipo de dato arriba y detalle por componente abajo. AK-5 sin desborde de 320 a 1920 px y campos con etiqueta."""
import asyncio, sys, os, re, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def real(last_day=29, bad_every=3):
    rows = ['fecha,canal,venta,pedidos,traffic_volume']; nneg = 0
    for d in range(1, last_day + 1):
        for i, ch in enumerate(CH):
            neg = (d * 4 + i) % bad_every == 0 and d <= 28
            nneg += neg
            rows.append(f'2026-09-{d:02d},{ch},{"-100" if neg else 1000 + d + i},{10 + i},{500 + d}')
    return '\n'.join(rows) + '\n', nneg
GA4H = 'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras\n'
GA4 = GA4H + '\n'.join(f'202609{d:02d},web,mobile,google / cpc,c1,/p,new,{100 + d},{3},{3000}' for d in range(1, 21)) + '\n'
def prods():
    rows = ['fecha,canal,sku,producto,categoria,venta,pedidos,unidades']
    for i in range(60):
        v = '-250' if i in (7, 19, 33) else str(500 + i); u = 'abc' if i in (23, 41) else str(3 + i % 4)
        rows.append(f'2026-09-{1 + i % 20:02d},{["ecommerce", "app"][i % 2]},SKU{i:03d},Producto {i},Cat {i % 4},{v},{2 + i % 3},{u}')
    return '\n'.join(rows) + '\n'
async def up(q, dtype, name, text):
    await q.goto(q.url.split('#')[0] + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=90000); await q.click('[data-action="commit-staged"]')
    await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=90000); await q.wait_for_timeout(500)
TBL = lambda label: "[...document.querySelectorAll('table[aria-label=\"" + label + "\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').replace(/\\s*\\?$/,'').trim()))"   # la ayuda «?» que la app agrega a algunos nombres no es parte del texto
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        # ---------- sin datos ----------
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-fuentes', state='attached', timeout=20000); await q.evaluate("FP.app.actions['st-expand-all']()")
        src = await q.evaluate(TBL('Fuentes de datos'))
        chk('AK-1 el catálogo lista 6 fuentes en este orden: CSV y Excel, GA4 export, GA4 directa, Google Sheets, Excel/SharePoint y BigQuery', [r[0].split(' Carga')[0].split(' El CSV')[0] for r in src][:1] == ['Archivos CSV y Excel'] and len(src) == 6 and [r[1] for r in src] == ['Sin archivos', 'Sin archivos', 'No conectado', 'No conectado', 'No conectado', 'No conectado'], src)
        chk('AK-1 las fuentes aún no disponibles dicen en qué fase llegan y qué hace falta de tu lado (sin inventar una conexión)', all(f'Fase {ph}' in r[2] for r, ph in zip(src[2:], 'CDEF')) and 'Google Cloud' in src[2][2] and 'Azure' in src[4][2] and 'costos' in src[5][2], [r[2] for r in src[2:]])
        ds0 = await q.evaluate(TBL('Datos cargados por tipo'))
        chk('AK-2 sin datos, los 6 tipos (histórico, plan, venta real, segmentos y los dos de Productos) dicen «Sin archivos cargados»', len(ds0) == 6 and all('Sin archivos cargados' in r[1] for r in ds0), ds0)
        await c.close()
        # ---------- con datos ----------
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(u + '#carga'); await q.wait_for_timeout(300)
        rtxt, nneg = real(); await up(q, 'actual', 'real.csv', rtxt); await up(q, 'segments', 'ga4.csv', GA4); await up(q, 'products', 'productos.csv', prods())
        await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-fuentes', state='attached', timeout=20000); await q.evaluate("FP.app.actions['st-expand-all']()")
        src = await q.evaluate(TBL('Fuentes de datos'))
        chk('AK-1 con datos: CSV y Excel y GA4 export quedan «Con datos» (2 archivos propios y 1 de GA4), con su última sincronización y calidad; las 4 demás siguen «No conectado»', [r[1] for r in src] == ['Con datos', 'Con datos', 'No conectado', 'No conectado', 'No conectado', 'No conectado'] and '2 archivos' in src[0][2] and '1 archivo' in src[1][2] and 'hace' in src[0][2] and '/100' in src[0][4] and '/100' in src[1][4], src[:2])
        chk('AK-1 el periodo de CSV y Excel cubre 2026-09-01 a 2026-09-29 (venta real) y el de GA4 export 2026-09-01 a 2026-09-20 (segmentos)', '2026-09-01 a 2026-09-29' in src[0][3] and '2026-09-01 a 2026-09-20' in src[1][3], (src[0][3], src[1][3]))
        ds_rows = await q.evaluate(TBL('Datos cargados por tipo'))
        ds = {r[0]: r for r in ds_rows}
        a = ds['Venta real / Actual']
        chk('AK-2 Venta real: 1 archivo, 116 registros (29 días × 4 canales), periodo 2026-09-01 a 2026-09-29, frescura «3 días de atraso» (hoy es 2 de octubre) con «datos hasta 2026-09-29» y la cuarentena exacta', a[1] == '1' and a[2] == '116' and '2026-09-01 a 2026-09-29' in a[3] and '3 días de atraso' in a[4] and 'datos hasta 2026-09-29' in a[4] and a[6] == str(sum(1 for d in range(1, 30) for i in range(4) if (d * 4 + i) % 3 == 0 and d <= 28)), a)
        sg = ds['Segmentos (opcional)']
        chk('AK-2 Segmentos (GA4): periodo hasta 2026-09-20 y frescura «12 días de atraso» (atrasado: más de 7)', '2026-09-20' in sg[3] and '12 días de atraso' in sg[4], sg)
        tone = await q.evaluate("(()=>{const rows=[...document.querySelectorAll('table[aria-label=\"Datos cargados por tipo\"] tbody tr')];const f=(l)=>{const r=rows.find(x=>x.cells[0].innerText.trim().startsWith(l));const p=r&&r.cells[4].querySelector('.pill');return p?p.className:''};return [f('Venta real'),f('Segmentos')]})()")
        chk('AK-2 el tono de la frescura distingue atención (3 días) de atrasado (12 días)', 'warning' in tone[0] and 'error' in tone[1], tone)
        pr = ds['Productos · venta']
        chk('AK-2 Productos · venta: 1 archivo, 60 registros aceptados y 5 valores en cuarentena (3 negativos y 2 no numéricos)', pr[1] == '1' and pr[2] == '60' and pr[6] == '5', pr)
        # ---------- cuarentena ----------
        await q.goto(u + '#calidad'); await q.wait_for_selector('table[aria-label="Cuarentena por sección"]', timeout=20000)
        head = await q.evaluate("document.getElementById('quality-quarantine').innerText.replace(/\\s+/g,' ')")
        total = nneg + 5
        chk(f'AK-3 el encabezado da el total exacto ({total} valores: {nneg} de Venta real y 5 de Productos) y sigue yendo antes que las tablas', head.startswith(f'{total} valores en cuarentena'), head[:120])
        sec = {r[0]: r for r in await q.evaluate(TBL('Cuarentena por sección'))}
        chk('AK-3 el resumen por sección cuenta exactamente: Venta real (' + str(nneg) + ' en 1 archivo) y Productos · venta (5 en 1 archivo)', sec.get('Venta real / Actual', [0, 0])[1] == str(nneg) and sec.get('Venta real / Actual', [0, 0, 0])[2] == '1' and sec.get('Productos · venta', [0, 0])[1] == '5' and sec['Productos · venta'][2] == '1', sec)
        rule = {r[0]: r[1] for r in await q.evaluate(TBL('Cuarentena por regla'))}
        chk('AK-3 el resumen por regla suma las secciones: «Venta negativa» = negativos de Venta real + 3 de Productos; «Unidades: valor no numérico» = 2', rule.get('Venta negativa') == str(nneg + 3) and rule.get('Unidades: valor no numérico') == '2', rule)
        lines = await q.evaluate(TBL('Valores en cuarentena'))
        shown_total = nneg + 5   # Productos trae ejemplos (hasta 25 por regla): aquí caben todos
        pg = await q.evaluate("document.querySelector('#quality-quarantine .pager span').innerText")
        chk(f'AK-3 el consolidado lista las {shown_total} líneas, 25 por página, y dice «1–25 de {shown_total} líneas» (2 páginas)', len(lines) == 25 and f'1–25 de {shown_total} líneas' in pg, (len(lines), pg))
        await q.click('[data-action="q-page"][data-value="2"]'); await q.wait_for_timeout(250)
        lines2 = await q.evaluate(TBL('Valores en cuarentena')); pg2 = await q.evaluate("document.querySelector('#quality-quarantine .pager span').innerText")
        chk('AK-3 la página 2 trae el resto y «Anterior» regresa; «Siguiente» se desactiva en la última', len(lines2) == shown_total - 25 and pg2.startswith('26–') and await q.evaluate("document.querySelector('[data-action=\"q-page\"][data-value=\"3\"]').disabled"), (len(lines2), pg2))
        await q.select_option('#q-sec', 'Productos · venta'); await q.wait_for_timeout(250)
        lp = await q.evaluate(TBL('Valores en cuarentena')); pgp = await q.evaluate("document.querySelector('#quality-quarantine .pager span').innerText")
        chk('AK-3 filtrar por sección «Productos · venta» deja 5 líneas, todas de productos.csv, y avisa que están filtradas', len(lp) == 5 and all(r[0] == 'productos.csv' and r[7] == 'Productos · venta' for r in lp) and f'filtradas de {shown_total}' in pgp, (len(lp), pgp))
        await q.select_option('#q-rule', 'INVALID_UNITS'); await q.wait_for_timeout(250)
        lr = await q.evaluate(TBL('Valores en cuarentena'))
        chk('AK-3 sumando el filtro de regla «Unidades: valor no numérico» quedan 2 líneas con valor original «abc»', len(lr) == 2 and all(r[5] == 'abc' for r in lr), lr)
        dl = await q.evaluate("""(()=>{const d=[];const o=FP.exporter.download;FP.exporter.download=(n,c,m)=>{d.push([n,c,m])};FP.app.actions['q-download']();FP.exporter.download=o;return d[0]})()""")
        rows_csv = dl[1].strip().split('\n')
        chk('AK-3 la descarga respeta los filtros: cuarentena_2026-10-02.csv con encabezado y solo esas 2 líneas', dl[0] == 'cuarentena_2026-10-02.csv' and rows_csv[0].startswith('seccion,archivo,fila') and len(rows_csv) == 3 and all('INVALID_UNITS' in r and ',abc,' in r for r in rows_csv[1:]), dl[1][:300])
        await q.select_option('#q-sec', 'all'); await q.select_option('#q-rule', 'all'); await q.select_option('#q-file', 'real.csv'); await q.wait_for_timeout(250)
        lf = await q.evaluate(TBL('Valores en cuarentena'))
        chk('AK-3 filtrar por archivo «real.csv» deja solo las líneas de Venta real (25 en la primera página, todas de real.csv)', len(lf) == min(25, nneg) and all(r[0] == 'real.csv' for r in lf), len(lf))
        # ---------- salud ----------
        sh = {r[0]: r for r in await q.evaluate(TBL('Resumen de salud por tipo de dato'))}
        chk('AK-4 la Salud trae arriba un resumen por tipo de dato (Venta real, Segmentos, Productos · venta) con su puntaje y lo que más bajó', all(k in sh for k in ('Venta real / Actual', 'Segmentos (opcional)', 'Productos · venta')) and '/100' in sh['Venta real / Actual'][1] and 'cuarentena' in sh['Productos · venta'][2].lower(), sh)
        order = await q.evaluate("(()=>{const h=document.getElementById('quality-health');const t=[...h.querySelectorAll('h3.qsub')].map(x=>x.innerText);return t})()")
        chk('AK-4 el orden es «Resumen por tipo de dato» y después «Detalle por componente» (con sus tarjetas)', order == ['Resumen por tipo de dato', 'Detalle por componente'] and await q.evaluate("document.querySelectorAll('#quality-health .dhealth__card').length") >= 3, order)
        q_order = await q.evaluate("[...document.querySelectorAll('#quality-quarantine h3.qsub')].map(x=>x.innerText)")
        chk('AK-3 en Cuarentena el orden es «Resumen» y después «Consolidado línea por línea»', q_order == ['Resumen', 'Consolidado línea por línea'], q_order)
        # ---------- desborde y etiquetas ----------
        bad = []
        for view in ('#calidad', '#ajustes'):
            await q.goto(u + view); await q.wait_for_timeout(500)
            for w in (1920, 1280, 1100, 768, 390, 360, 320):
                await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(200)
                x = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
                if x > 0: bad.append((view, w, x))
        chk('AK-5 sin desborde de página de 320 a 1920 px en Calidad de datos y Configuración', not bad, bad)
        await q.goto(u + '#calidad'); await q.wait_for_timeout(400)
        unl = await q.evaluate("[...document.querySelectorAll('#quality-quarantine select')].filter(i=>!(i.id&&document.querySelector('label[for=\"'+i.id+'\"]'))).map(i=>i.id)")
        chk('AK-5 los filtros del consolidado tienen etiqueta asociada', not unl, unl)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_ak:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
