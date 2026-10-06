"""Fase A · motor de calidad, cuarentena, auditoría y Data Health. Uso: python3 batch_w.py <raiz>   Sale 1 si alguna falla.
Cubre los casos de la sección 34 que corresponden a la Fase A: CSV válido, delimitador «;», comillas y separador de miles, XLSX,
encabezados desconocidos, mapeo con Cohere (respuesta simulada, con protección de datos personales), negativos, no numéricos,
vacíos, duplicados, fechas inválidas, periodo incompleto, fuente sin datos, cuarentena y dataset totalmente inválido."""
import asyncio, sys, os, re, json, datetime as dt, threading, functools, http.server, socketserver
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
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def base_rows():
    rows = []
    for d in range(1, 11):
        for i, ch in enumerate(CH):
            if d == 8 and ch == 'llamadas': continue                       # periodo incompleto: un canal sin fila
            rev = 10000 + 1000 * i + 37 * d; ped = 10 + i + d; vol = 1000 + 50 * i + 10 * d
            if d == 3 and ch == 'ecommerce': rev = '-500'                   # negativo → cuarentena
            if d == 4 and ch == 'app': rev = 'abc'                          # no numérico → cuarentena
            if d == 5 and ch == 'whatsapp': rev = ''                        # vacío → dato faltante (no es cero)
            rows.append([f'2026-09-{d:02d}', ch, rev, ped, vol])
    rows.append(['2026-13-45', 'ecommerce', 999, 1, 10])                    # fecha inválida → fila rechazada
    rows.append(['2026-09-06', 'llamadas', 10000 + 3000 + 37 * 6, 10 + 3 + 6, 1000 + 150 + 60])   # duplicado
    return rows
ROWS = base_rows()
HDR = ['fecha', 'canal', 'venta', 'pedidos', 'traffic_volume']
def csv(rows, sep=',', quote=False):
    q = (lambda v: f'"{v}"') if quote else (lambda v: str(v))
    return sep.join(HDR) + '\n' + '\n'.join(sep.join(q(v) for v in r) for r in rows) + '\n'
EXP_ECOM = sum(r[2] for r in ROWS if r[1] == 'ecommerce' and r[0] != '2026-13-45' and isinstance(r[2], int))
async def upload(q, u, dtype, name, data, mime='text/csv'):
    await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]', state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]', files=[{'name': name, 'mimeType': mime, 'buffer': data}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
    await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
    await q.wait_for_timeout(300)
    return await q.evaluate("document.getElementById('toast').innerText")
async def fresh(b):
    c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page()
    await q.clock.set_fixed_time(dt.datetime(2026, 9, 11, 9, 0)); return c, q
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        # ---------- 15 · fuente sin datos ----------
        c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#calidad'); await q.wait_for_timeout(600)
        t = await q.evaluate("[document.getElementById('quality-health').innerText, document.getElementById('quality-quarantine').innerText, document.getElementById('quality-log').innerText]")
        chk('15 sin datos: Salud, Cuarentena y Registro lo dicen sin romper', 'Sin datos cargados' in t[0] and 'No hay valores en cuarentena' in t[1] and 'Todavía no hay importaciones' in t[2], t)
        chk('Decisión: la API key de Cohere es solo de sesión por defecto («recordar» desactivado)', await q.evaluate("FP.app.state.dx.rememberKey") is False)
        # ---------- 1, 7, 8, 9, 10, 11, 12, 19 · CSV con todos los casos ----------
        toast = await upload(q, u, 'actual', 'venta_real.csv', csv(ROWS).encode())
        chk('7/8/19 el aviso dice cuántas filas entraron con un valor en cuarentena', '(2 con un valor en cuarentena' in toast, toast)
        recs = await q.evaluate("""FP.dataStore.records(FP.app.state.store,'actual').filter(r=>['2026-09-03','2026-09-04','2026-09-05'].includes(r.date)&&['ecommerce','app','whatsapp'].includes(r.channel)).map(r=>({d:r.date,ch:r.channel,st:r.status,rev:r.metrics.revenue,ord:r.metrics.orders.value,aov:r.metrics.aov}))""")
        neg = [r for r in recs if r['d'] == '2026-09-03' and r['ch'] == 'ecommerce'][0]; bad = [r for r in recs if r['d'] == '2026-09-04' and r['ch'] == 'app'][0]; emp = [r for r in recs if r['d'] == '2026-09-05' and r['ch'] == 'whatsapp'][0]
        chk('7 negativo: la fila entra, la venta queda en cuarentena con su valor original (−500 no se vuelve 500 ni 0), los pedidos sí cuentan y el AOV no se calcula', neg['st'] == 'quarantined' and neg['rev']['source'] == 'quarantined' and neg['rev']['value'] is None and str(neg['rev']['raw']) == '-500' and neg['rev']['parsedValue'] == -500 and neg['rev']['rule'] == 'NEGATIVE_REVENUE' and neg['ord'] == 13 and (neg['aov'] or {}).get('value') is None, neg)
        chk('8 no numérico: «abc» queda en cuarentena con su valor original y la regla INVALID_REVENUE', bad['rev']['source'] == 'quarantined' and bad['rev']['raw'] == 'abc' and bad['rev']['rule'] == 'INVALID_REVENUE', bad)
        chk('9 vacío: no se trata como cero ni va a cuarentena: queda «faltante» y la fila entra con advertencia', emp['rev']['source'] == 'missing' and emp['st'] == 'warning', emp)
        # KPIs: la cuarentena no suma (venta de Ecommerce en el Diagnóstico por canal y día)
        tot = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').filter(r=>r.channel==='ecommerce'&&r.metrics.revenue.source==='observed').reduce((a,r)=>a+r.metrics.revenue.value,0)")
        chk(f'7 la venta de Ecommerce que entra a los KPIs = {EXP_ECOM:,} (sin el −500), calculado aparte del CSV', tot == EXP_ECOM, (tot, EXP_ECOM))
        await q.goto(u + '#calidad'); await q.wait_for_timeout(700)
        hv = await q.evaluate("FP.dataHealth.collection(FP.app.state.store,'actual')")
        comp = {x['key']: x for x in hv['components']}
        recsN = 4 * 10 - 1 + 1   # 39 del periodo + el duplicado
        chk('11 fecha inválida: 1 fila rechazada; Estructura = 98 (1 de 41 leídas)', comp['structure']['score'] == 98 and '1 fila rechazada' in comp['structure']['detail'], comp['structure'])
        chk(f'9 Completitud = 99 (1 celda obligatoria vacía de {recsN*3})', comp['completeness']['score'] == round(100 * (1 - 1 / (recsN * 3))) and f'1 de {recsN*3}' in comp['completeness']['detail'], comp['completeness'])
        chk(f'8 Tipos: 1 celda no numérica de las celdas de métricas', '1 celda no numérica' in comp['types']['detail'], comp['types'])
        chk('7 Consistencia: el negativo cuenta como registro inconsistente', comp['consistency']['score'] < 100 and comp['consistency']['detail'].startswith('1 registro con'), comp['consistency'])
        chk('12 periodo incompleto: Temporalidad = 90 (1 fecha con un canal faltante en 10 días)', comp['temporal']['score'] == 90 and '1 fecha con algún canal faltante' in comp['temporal']['detail'], comp['temporal'])
        chk('10 duplicados: el registro repetido baja «Duplicados»', comp['duplicates']['score'] < 100 and comp['duplicates']['detail'].startswith('1 registro repetido'), comp['duplicates'])
        avg = round(sum(x['score'] for x in hv['components']) / len(hv['components']))
        chk(f'Health: total = promedio simple de los componentes ({avg}) y cada uno trae su «por qué»', hv['score'] == avg and all(x['detail'] for x in hv['components']), hv['score'])
        ui = await q.evaluate("[document.getElementById('quality-health').innerText, document.getElementById('quality-quarantine').innerText, [...document.querySelectorAll('table[aria-label=\"Registro de importaciones\"] tbody tr')].map(r=>[...r.cells].map(c=>c.innerText))]")
        chk('19 la pantalla de Cuarentena lista los 2 valores con archivo, fila, fecha, canal, campo, valor original y regla', '2 valores en cuarentena' in ui[1] and '-500' in ui[1] and 'abc' in ui[1] and 'Venta negativa' in ui[1] and 'venta_real.csv' in ui[1], ui[1][:300])
        log = ui[2][0]
        chk('Auditoría: el registro de importaciones dice fuente CSV, 41 recibidas, 40 aceptadas, 2 en cuarentena, 1 rechazada, 5 columnas usadas y la duración', log[3] == 'CSV' and log[4:9] == ['41', '40', '2', '1', '5'] and log[9].endswith(' s'), log)
        await q.reload(); await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.dataStore.records(FP.app.state.store,'actual').length > 0", timeout=20000)
        ql = await q.evaluate("FP.qualityRules.quarantineList(FP.app.state.store).map(x=>[String(x.rawValue),x.parsedValue,x.rule,x.fileName])")
        chk('Persistencia: al recargar la página la cuarentena sigue con su valor original, el interpretado, la regla y el archivo', sorted(ql) == sorted([['-500', -500, 'NEGATIVE_REVENUE', 'venta_real.csv'], ['abc', None, 'INVALID_REVENUE', 'venta_real.csv']]), ql)
        state = await q.evaluate("FP.coverage.summarizeCollection(FP.app.state.store,'actual').status")
        chk('11 (estado) con una fila rechazada por fecha inválida el estado sigue siendo «no válido», como antes', state == 'invalid', state)
        await c.close()
        # ---------- 2 · delimitador «;»  y 3 · comillas con separador de miles ----------
        c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        clean = [r for r in ROWS if isinstance(r[2], int) and r[0] != '2026-13-45'][:12]
        await upload(q, u, 'actual', 'punto_y_coma.csv', csv(clean + [['2026-09-04', 'llamadas', '-200', 5, 300]], sep=';').encode())
        n1 = await q.evaluate("[FP.dataStore.records(FP.app.state.store,'actual').length, FP.coverage.summarizeCollection(FP.app.state.store,'actual').status, FP.coverage.summarizeCollection(FP.app.state.store,'actual').quarantined]")
        chk('2 CSV con «;» se importa completo (13 filas)', n1[0] == 13, n1)
        chk('12 (estado) con un valor en cuarentena y nada rechazado, el estado es «con advertencias», no «inválido»', n1[1] == 'warnings' and n1[2] == 1, n1)
        await c.close(); c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        quoted = 'fecha,canal,venta,pedidos,traffic_volume\n"2026-09-01","ecommerce","1,234.50","10","1,000"\n"2026-09-01","app","2,000","5","500"\n'
        await upload(q, u, 'actual', 'comillas.csv', quoted.encode())
        v = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').map(r=>[r.channel,r.metrics.revenue.value,r.metrics.trafficVolume.value])")
        chk('3 comillas y separador de miles: «1,234.50» → 1234.5 y «1,000» → 1000', sorted(v) == [['app', 2000, 500], ['ecommerce', 1234.5, 1000]], v)
        await c.close()
        # ---------- 4 · XLSX ----------
        import openpyxl
        wb = openpyxl.Workbook(); ws = wb.active; ws.append(HDR)
        for r in clean[:8]: ws.append([dt.date.fromisoformat(r[0]), r[1], r[2], r[3], r[4]])
        wb.save('/tmp/w/venta.xlsx')
        c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        await upload(q, u, 'actual', 'venta.xlsx', open('/tmp/w/venta.xlsx', 'rb').read(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        x = await q.evaluate("[FP.dataStore.records(FP.app.state.store,'actual').length, FP.dataStore.batches(FP.app.state.store,'actual')[0].source, FP.dataStore.records(FP.app.state.store,'actual').map(r=>r.date).sort()[0]]")
        chk('4 XLSX (Venta real) se importa con fechas reales y el registro lo marca como «xlsx»', x == [8, 'xlsx', '2026-09-01'], x)
        await c.close()
        # ---------- 5 · encabezado desconocido  y 6 · mapeo con Cohere simulado + privacidad ----------
        c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#carga'); await q.wait_for_timeout(400)
        res = await q.evaluate("""async()=>{const sent=[];const orig=window.fetch;window.fetch=async(url,opt)=>{sent.push(JSON.parse(opt.body).messages.map(m=>m.content).join('\\n'));
            return {ok:true,status:200,json:async()=>({message:{content:[{type:'text',text:JSON.stringify({mappings:[{header:'Monto vendido',field:'revenue',confidence:0.95},{header:'Correo cliente',field:'revenue',confidence:0.4}]})}]}})}};
          const r=await FP.normalize.suggestHeaderMappingWithAI(['fecha','canal','Monto vendido','pedidos','traffic_volume','Correo cliente','Tel contacto'],
            {dataType:'actual',apiKey:'k',samples:{'Monto vendido':['1200','900'],'Correo cliente':['ana@x.com','luis@y.mx'],'Tel contacto':['abc','55 1234 5678 90']}});
          window.fetch=orig;return {mapping:r.mapping,sent:sent[0]||''}}""")
        sent = res['sent']
        chk('6 Cohere solo propone campos válidos: «Monto vendido» → venta; la propuesta de baja confianza no se acepta', res['mapping'].get('Monto vendido') == 'revenue' and res['mapping'].get('Correo cliente') in (None, ''), res['mapping'])
        chk('Privacidad: a Cohere no viajan los correos ni el teléfono (sus columnas van sin ejemplos); el monto sí lleva ejemplos', 'ana@x.com' not in sent and 'luis@y.mx' not in sent and '1234 5678' not in sent and '1200' in sent and 'posible dato personal' in sent, sent[:400])
        chk('Privacidad (función): detecta por nombre de columna y por contenido', await q.evaluate("[FP.normalize.looksPersonal('Correo cliente',[]), FP.normalize.looksPersonal('x',['pepe@a.com']), FP.normalize.looksPersonal('Notas',['55 1234 5678']), FP.normalize.looksPersonal('Venta',['1,234.50'])]") == [True, True, True, False])
        unk = 'fecha,canal,Monto vendido,pedidos,traffic_volume\n2026-09-01,ecommerce,1000,10,500\n'
        await q.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': 'raro.csv', 'mimeType': 'text/csv', 'buffer': unk.encode()}]); await q.wait_for_timeout(1500)
        st = await q.evaluate("document.getElementById('view-carga').innerText")
        chk('5 encabezado desconocido sin API key: se avisa, se conserva el mapeo estático y queda para asignar a mano', 'IA no disponible' in st and 'Monto vendido' in st, st[:200])
        await c.close()
        # ---------- 20 · dataset totalmente inválido ----------
        c, q = await fresh(b); q.on('pageerror', lambda e: errs.append(str(e)))
        allbad = 'fecha,canal,venta,pedidos,traffic_volume\nnofecha,ecommerce,1,1,1\n2026-02-31,app,1,1,1\n2026-09-01,canal_x,1,1,1\n'
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="actual"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="actual"]', files=[{'name': 'todo_mal.csv', 'mimeType': 'text/csv', 'buffer': allbad.encode()}]); await q.wait_for_timeout(1500)
        btn = await q.evaluate("(()=>{const b=document.querySelector('[data-action=\"commit-staged\"]');return b?{dis:b.disabled,txt:document.getElementById('view-carga').innerText.slice(0,0)}:null})()")
        if btn and not btn['dis']:
            await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(800)
        n = await q.evaluate("FP.dataStore.records(FP.app.state.store,'actual').length")
        await q.goto(u + '#calidad'); await q.wait_for_timeout(500)
        hv2 = await q.evaluate("FP.dataHealth.collection(FP.app.state.store,'actual')")
        chk('20 dataset totalmente inválido: no entra ningún registro, no se rompe nada y, si se confirma, Estructura = 0', n == 0 and (hv2['empty'] or {x['key']: x for x in hv2['components']}['structure']['score'] == 0), (n, hv2.get('score'), btn))
        await c.close()
        chk('Catálogo de reglas: cada tipo de incidencia tiene acción (reject_row, quarantine_cell, flag o reject_file) y motivo', True)
        c, q = await fresh(b); await q.goto(u); await q.wait_for_timeout(400)
        cat = await q.evaluate("FP.qualityRules.catalog()")
        bad = [x['code'] for x in cat if x['action'] not in ('reject_row', 'quarantine_cell', 'flag', 'reject_file') or not x.get('why')]
        neg_ok = all(next(x for x in cat if x['code'] == k)['action'] == 'quarantine_cell' for k in ('NEGATIVE_REVENUE', 'NEGATIVE_ORDERS', 'NEGATIVE_TRAFFIC'))
        chk('Catálogo: todas las reglas con acción válida y motivo; los tres negativos van a cuarentena por celda', not bad and neg_ok and len(cat) >= 20, (bad, len(cat)))
        await c.close()
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
    print('\nRESULTADO batch_w:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
