"""Fase B · modelo canónico, detección de datasets, derivaciones, procedencia, disponibilidad y comparabilidad. Uso: python3 batch_x.py <raiz>
Cubre los 26 casos del punto 19 del documento de la Fase B (los 26 se marcan por número). Datos de prueba sintéticos (no de producción)."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
HDR = ['Fecha', 'Plataforma', 'Categoría de dispositivo', 'Fuente/medio de la sesión', 'Campaña de la sesión', 'Página de destino y cadena de consulta', 'Nuevo/Recurrente', 'Sesiones', 'Compras en comercio electrónico', 'Ingresos derivados de las compras']
def ga4(start, n_days, *, device=('mobile', 'desktop'), campaign=('buen_fin', '(organic)'), landing=True):
    hdr = [h_ for h_ in HDR if landing or not h_.startswith('Página')]
    out = [','.join(hdr)]; d0 = dt.date.fromisoformat(start)
    for i in range(n_days):
        d = (d0 + dt.timedelta(i)).strftime('%Y%m%d')
        for k, dev in enumerate(device):
            row = [d, 'web', dev, 'google / organic', campaign[k % len(campaign)]] + (['/'] if landing else []) + ['new', str(1000 + k * 10), str(10 + k), str(1000 * (10 + k))]
            out.append(','.join(row))
    return '\n'.join(out) + '\n'
async def upload(q, u, dtype, name, text):
    await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
    det = await q.evaluate("(document.querySelector('.dsdetect')||{innerText:''}).innerText")
    await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
    return det
CUR = {'start': '2026-09-01', 'end': '2026-09-30'}
DIM = "(a)=>{const r=FP.availability.dimension(FP.app.state.store,a.dim,{current:a.cur,comparison:a.cmp?FP.availability.comparisonPeriod(a.cur,a.cmp):null,channel:a.ch||'total'});return {status:r.status,codes:(r.reasons||[]).map(x=>x.code),text:(r.reasons||[]).map(x=>x.text).join(' '),todo:(r.reasons||[]).map(x=>x.todo).join(' '),comp:r.comparisonStatus||null,cov:r.coverage,rows:r.availableRows,total:r.totalRows}}"
async def fresh(b, errs):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(f'http://127.0.0.1:{port}/index.html'); await q.wait_for_timeout(400); return c, q
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        c, q = await fresh(b, errs)
        # ---------- detección (1–8) ----------
        D = "(a)=>FP.canonical.detectDataset(a.h,{expectedTarget:a.t||null})"
        r1 = await q.evaluate(D, {'h': ['Fecha', 'Sesiones', 'Total de usuarios', 'Usuarios nuevos', 'País']})
        chk('1 GA4 de tráfico se detecta como ga4_traffic', r1['datasetType'] == 'ga4_traffic' and r1['detectionMethod'] == 'deterministic', r1)
        r2 = await q.evaluate(D, {'h': ['fecha', 'canal', 'venta', 'pedidos', 'traffic_volume']})
        chk('2 ventas diarias por canal → ecommerce_sales con confianza 1.0', r2['datasetType'] == 'ecommerce_sales' and r2['confidence'] == 1, r2)
        r3 = await q.evaluate(D, {'h': ['fecha', 'canal', 'sku', 'producto', 'categoria', 'venta', 'unidades']})
        chk('3 venta por producto → product_sales', r3['datasetType'] == 'product_sales', r3)
        r4 = await q.evaluate(D, {'h': ['col_a', 'col_b', 'misc']})
        chk('4 tabla desconocida → generic_tabular (no bloquea)', r4['datasetType'] == 'generic_tabular', r4)
        r5 = await q.evaluate(D, {'h': ['fecha', 'canal', 'venta']})
        chk('5 opcionales ausentes: sigue siendo ecommerce_sales y lista lo recomendado que falta (pedidos, sesiones)', r5['datasetType'] == 'ecommerce_sales' and set(r5['missingRecommendedFields']) == {'orders', 'sessions'}, r5)
        r6 = await q.evaluate(D, {'h': ['fecha', 'canal', 'venta', 'foo_bar']})
        chk('6 encabezado desconocido: se reporta sin romper la detección', r6['datasetType'] == 'ecommerce_sales' and r6['unknownHeaders'] == ['foo_bar'], r6)
        r7 = await q.evaluate(D, {'h': ['fecha', 'sku', 'vistas_ficha', 'venta', 'unidades']})
        chk('7 clasificación ambigua: se marca ambigua, baja la confianza y ofrece alternativas con confianza comparable (ninguna aparece más segura que la elegida)', r7['ambiguous'] and r7['alternatives'] and r7['confidence'] < 0.6 and all(x['confidence'] <= r7['confidence'] for x in r7['alternatives']), r7)
        r8 = await q.evaluate(D, {'h': ['fecha', 'canal', 'sku', 'producto', 'venta', 'unidades'], 't': 'actual'})
        chk('8 perfil alternativo: un archivo de productos cargado en Venta real se señala (sugiere Productos)', r8['targetMismatch'] and r8['suggestedTarget'] == 'products', r8)
        # ---------- derivaciones (9–15) ----------
        DV = "(a)=>FP.derivations.derive(a.id,a.inp,a.opt||{})"
        d9 = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': 1000}, 'orders': {'value': 4}}})
        chk('9 AOV = revenue / orders = 250, derivado, con fórmula, dependencias y versión', d9['value'] == 250 and d9['status'] == 'derived' and d9['formula'] == 'revenue / orders' and d9['dependencies'] == ['revenue', 'orders'] and d9['derivationVersion'] == 1, d9)
        d10 = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': 1000}, 'orders': {'value': 0}}})
        chk('10 AOV con cero pedidos: no se divide, «unavailable» con ZERO_DENOMINATOR', d10['value'] is None and d10['status'] == 'unavailable' and d10['reasons'][0]['code'] == 'ZERO_DENOMINATOR', d10)
        d11 = await q.evaluate(DV, {'id': 'conversion_rate', 'inp': {'orders': {'value': 5}, 'sessions': {'value': 200}}})
        chk('11 CR = orders / sessions = 0.025 (proporción 0–1)', abs(d11['value'] - 0.025) < 1e-12 and d11['status'] == 'derived', d11)
        d12 = await q.evaluate(DV, {'id': 'conversion_rate', 'inp': {'orders': {'value': 5}, 'sessions': {'value': 'x', 'status': 'invalid'}}})
        chk('12 denominador inválido: INVALID_DEPENDENCY, sin valor', d12['value'] is None and d12['reasons'][0]['code'] == 'INVALID_DEPENDENCY', d12)
        pv = await q.evaluate("[FP.canonical.provenanceOf({value:1000,source:'observed',raw:'$1,000'}).type, FP.canonical.provenanceOf({value:1000,source:'observed',raw:'1000'}).type, FP.canonical.provenanceOf({value:0.02,source:'calculated'}).type, FP.canonical.provenanceOf({value:null,source:'quarantined',raw:'-5',rule:'NEGATIVE_REVENUE'}).type, FP.canonical.provenanceOf({value:null,source:'missing'}).type]")
        d13 = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': 1000}, 'orders': {'value': 4}}, 'opt': {'original': {'value': 251}}})
        d13b = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': 1000}, 'orders': {'value': 4}}, 'opt': {'original': {'value': 300}}})
        chk('13 original frente a derivado: procedencia original / normalized / derived / quarantined / unavailable, y el original se conserva y concilia (251 ≈ 250; 300 se reporta)', pv == ['normalized', 'original', 'derived', 'quarantined', 'unavailable'] and d13['original'] == 251 and d13['reconciliation']['consistent'] and not d13b['reconciliation']['consistent'], (pv, d13.get('reconciliation'), d13b.get('reconciliation')))
        d14 = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': 1000, 'currency': 'MXN'}, 'orders': {'value': 4, 'currency': 'USD'}}})
        chk('14 monedas incompatibles: no se calcula (CURRENCY_MISMATCH)', d14['value'] is None and any(r['code'] == 'CURRENCY_MISMATCH' for r in d14['reasons']), d14)
        d15 = await q.evaluate(DV, {'id': 'aov', 'inp': {'revenue': {'value': None, 'status': 'quarantined'}, 'orders': {'value': 4}}})
        chk('15 dependencia en cuarentena: no se usa (QUARANTINED_DEPENDENCY)', d15['value'] is None and d15['reasons'][0]['code'] == 'QUARANTINED_DEPENDENCY', d15)
        # ---------- 22 · fuente desconectada  y 23/24 · análisis incompletos con recomendaciones ----------
        r22 = await q.evaluate(DIM, {'dim': 'campaign', 'cur': CUR, 'cmp': 'yoy'})
        chk('22 sin GA4 ni Segmentos: «unavailable_source» con acción de cargar el export', r22['status'] == 'unavailable_source' and r22['codes'] == ['SOURCE_NOT_CONNECTED'] and 'Segmentos' in r22['todo'], r22)
        an = await q.evaluate("FP.availability.analyses(FP.app.state.store,{current:{start:'2026-09-01',end:'2026-09-30'},channel:'total',comparisonKind:'yoy'})")
        cp = next(a for a in an if a['analysis'] == 'campaign_performance')
        chk('23 análisis con requisitos incompletos: «Desempeño por campaña» no se puede, falta campaign', cp['status'] in ('unavailable_source', 'missing', 'unavailable') and cp['missingFields'] == ['campaign'], cp)
        chk('24 recomendaciones accionables y específicas (no genéricas)', any('GA4' in r['todo'] for r in cp['recommendations']) and all(r['text'] for r in cp['recommendations']), cp['recommendations'])
        await c.close()
        # ---------- 16 · actual sin comparación  · 20 vacíos · 21 dimensión no incluida · not_applicable ----------
        c, q = await fresh(b, errs)
        await prepare(q, u)   # venta real y plan de prueba: el Diagnóstico necesita una brecha para mostrar el árbol
        await upload(q, u, 'segments', 'ga4_sep26.csv', ga4('2026-09-01', 30, campaign=('(not set)',), landing=False))
        r16 = await q.evaluate(DIM, {'dim': 'device', 'cur': CUR, 'cmp': 'yoy'})
        chk('16 dimensión solo en el periodo actual: «non_comparable», explica que contra plan se usa el año anterior y pide 2025-09-01 a 2025-09-30', r16['status'] == 'non_comparable' and r16['codes'][0] == 'COMPARISON_PERIOD_MISSING' and r16['comp'] == 'current_only' and '2025-09-01 a 2025-09-30' in r16['todo'] and 'año anterior' in r16['text'], r16)
        r20 = await q.evaluate(DIM, {'dim': 'campaign', 'cur': CUR, 'cmp': None})
        chk('20 dimensión presente con todos los valores «(not set)»: «invalid» EMPTY_VALUES', r20['status'] == 'invalid' and r20['codes'] == ['EMPTY_VALUES'], r20)
        r21 = await q.evaluate(DIM, {'dim': 'landing_page', 'cur': CUR, 'cmp': None})
        chk('21 dimensión no incluida en el export de GA4: «missing» DIMENSION_NOT_IN_QUERY con la acción de exportarla', r21['status'] == 'missing' and r21['codes'] == ['DIMENSION_NOT_IN_QUERY'] and 'Landing' in r21['todo'], r21)
        rna = await q.evaluate(DIM, {'dim': 'device', 'cur': CUR, 'cmp': None, 'ch': 'whatsapp'})
        chk('No aplica: Dispositivo en WhatsApp → «not_applicable»', rna['status'] == 'not_applicable' and rna['codes'] == ['CHANNEL_NOT_IN_GA4'], rna)
        # UI del Diagnóstico
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(400)
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'total')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(200)
        ui = await q.evaluate("(()=>{const t=document.querySelector('table[aria-label=\"Disponibilidad de dimensiones\"]');return t?Object.fromEntries([...t.tBodies[0].rows].map(r=>[r.cells[0].textContent.trim(),r.cells[1].textContent.trim()])):null})()")
        chk('13 (problema de GA4) el Diagnóstico explica por dimensión: Dispositivo «No comparable», Campaña «Sin valores útiles», Landing «No está en los datos»', bool(ui) and ui.get('Dispositivo') == 'No comparable' and ui.get('Campaña') == 'Sin valores útiles' and ui.get('Landing') == 'No está en los datos', ui)
        await c.close()
        # ---------- 17 · solo comparación  · 18 ambos · 19 parcial · diferencias de esquema ----------
        c, q = await fresh(b, errs)
        await upload(q, u, 'segments', 'ga4_sep25.csv', ga4('2025-09-01', 30))
        r17 = await q.evaluate(DIM, {'dim': 'device', 'cur': CUR, 'cmp': 'yoy'})
        chk('17 solo el periodo de comparación: «incomplete_period» CURRENT_PERIOD_MISSING', r17['status'] == 'incomplete_period' and r17['codes'] == ['CURRENT_PERIOD_MISSING'], r17)
        await upload(q, u, 'segments', 'ga4_sep26.csv', ga4('2026-09-01', 30))
        r18 = await q.evaluate(DIM, {'dim': 'device', 'cur': CUR, 'cmp': 'yoy'})
        chk('18 ambos periodos con cobertura: «available» y comparación «both_available»', r18['status'] == 'available' and r18['comp'] == 'both_available' and r18['cov'] == 1, r18)
        r19 = await q.evaluate(DIM, {'dim': 'device', 'cur': {'start': '2026-09-01', 'end': '2026-10-31'}, 'cmp': None})
        chk('19 datos parciales: con el periodo sep–oct (61 días, 30 con datos) queda «partial» LOW_COVERAGE', r19['status'] == 'partial' and 'LOW_COVERAGE' in r19['codes'], r19)
        await upload(q, u, 'segments', 'ga4_ago26_otros.csv', ga4('2026-08-01', 31, device=('tipo_1', 'tipo_2')))
        rsd = await q.evaluate(DIM, {'dim': 'device', 'cur': {'start': '2026-08-01', 'end': '2026-08-31'}, 'cmp': 'yoy'})
        chk('Diferencias de esquema: sin datos de 2025-08 queda «non_comparable»; y con otros nombres de valores también se detecta (SCHEMA_DIFFERENCE)', rsd['status'] == 'non_comparable', rsd)
        rsd2 = await q.evaluate("(()=>{const r=FP.availability.dimension(FP.app.state.store,'device',{current:{start:'2026-08-01',end:'2026-08-31'},comparison:{start:'2026-09-01',end:'2026-09-30'},channel:'total'});return [r.status,(r.reasons||[]).map(x=>x.code)]})()")
        chk('10 de GA4: valores de dispositivo con otros nombres entre periodos (códigos «tipo_1/tipo_2» contra Móvil/Escritorio) → SCHEMA_DIFFERENCE con acción de homologar', rsd2[0] == 'non_comparable' and rsd2[1][0] == 'SCHEMA_DIFFERENCE', rsd2)
        await c.close()
        # ---------- 25 · integración con la Fase A (cuarentena) ----------
        c, q = await fresh(b, errs)
        rows = ['fecha,canal,venta,pedidos,traffic_volume'] + [f'2026-09-{d:02d},{ch},{"-500" if (d == 3 and ch == "ecommerce") else 1000 + d},10,100' for d in range(1, 31) for ch in ('ecommerce', 'app', 'whatsapp', 'llamadas')]
        det = await upload(q, u, 'actual', 'real.csv', '\n'.join(rows) + '\n')
        chk('Integración con la carga: la revisión muestra el tipo detectado («Venta diaria por canal», 100 %)', 'Venta diaria por canal' in det and '100 %' in det, det)
        mr = await q.evaluate("(()=>{const r=FP.availability.metric(FP.app.state.store,'revenue',{current:{start:'2026-09-01',end:'2026-09-30'}});return {s:r.status,codes:r.reasons.map(x=>x.code),text:r.reasons.map(x=>x.text).join(' '),rows:r.availableRows,total:r.totalRows}})()")
        chk('25 Fase A: la venta queda «partial» por 1 celda en cuarentena (119 de 120 filas) y lo explica', mr['s'] == 'partial' and mr['codes'] == ['QUARANTINED_VALUES'] and mr['rows'] == 119 and mr['total'] == 120 and '1 celda de' in mr['text'], mr)
        ma = await q.evaluate("(()=>{const r=FP.availability.metric(FP.app.state.store,'aov',{current:{start:'2026-09-01',end:'2026-09-30'}});return {s:r.status,v:r.value,f:r.provenance&&r.provenance.formula}})()")
        exp = (sum(1000 + d for d in range(1, 31)) * 4 - 1003) / (10 * 120 - 0)   # pedidos incluyen la fila con venta en cuarentena
        exp_ok = (sum(1000 + d for d in range(1, 31)) * 4 - 1003) / (10 * 120)
        chk('15 integración: el AOV se deriva sin la venta en cuarentena (sus pedidos sí cuentan), con la fórmula registrada', ma['s'] == 'derived' and ma['f'] == 'revenue / orders' and abs(ma['v'] - exp_ok) < 1e-9, (ma, exp_ok))
        mu = await q.evaluate("FP.availability.metric(FP.app.state.store,'users',{current:{start:'2026-09-01',end:'2026-09-30'}}).status")
        chk('users: «not_applicable» porque no se puede sumar (decisión de arquitectura)', mu == 'not_applicable', mu)
        await q.goto(u + '#calidad'); await q.wait_for_timeout(600)
        qa = await q.evaluate("(()=>{const t=document.querySelector('table[aria-label=\"Qué puedes analizar\"]');return t?[...t.tBodies[0].rows].map(r=>[r.cells[0].innerText,r.cells[1].innerText]):null})()")
        chk('Calidad muestra «Qué puedes analizar» con los 13 análisis y su estado', bool(qa) and len(qa) == 13, qa)
        await c.close()
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nRESULTADO batch_x:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
