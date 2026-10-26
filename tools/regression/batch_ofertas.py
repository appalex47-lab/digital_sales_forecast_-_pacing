"""«Ofertas recibidas» (propuesta B, fase 1B): carga de xlsx con varias hojas, vista previa, guardado, alertas, estados, edición con historial, paso a promoción, persistencia. Uso: python3 batch_ofertas.py <raiz> [archivo.xlsx real opcional]"""
import asyncio, sys, os, json, tempfile, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
import openpyxl
ROOT = os.path.abspath(sys.argv[1]); REAL = sys.argv[2] if len(sys.argv) > 2 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
U = f'http://127.0.0.1:{port}/index.html'
tmp = tempfile.mkdtemp()
# archivo ficticio con la forma del real: hoja de trabajo + «Productos finales», Oracle con «AA», % DES como fracción
wb = openpyxl.Workbook(); w0 = wb.active; w0.title = 'Descuentos'; w0.append(['sivec', 'Oracle', 'Producto']); w0.append([1, '7500000000099AA', 'X'])
w = wb.create_sheet('Productos finales')
H = ['Lab', 'sivec', 'Oracle', 'Categoría', 'Producto', 'Precio', 'Laboratorio', 'OFERTA', 'PROGRAMA', 'MECANICA', 'PMP+IVA', '% DES', 'PRECIO FINAL CON IVA', 'COMENTARIO ABASTECIMIENTO', 'DISPONIBILIDAD EN PDV']
w.append(H)
w.append([None, 101, '7500000000001AA', 'Dermocosméticos', 'CREMA DEMO 50G', 90, 'LAB UNO', None, None, None, 100, 0.25, 75, 'DISPONIBLE', 0.98])
w.append([None, 102, None, 'Dermocosméticos', 'SIN OJO', 90, 'LAB UNO', None, None, None, 100, 0.25, 75, 'DISPONIBLE', 0.98])
w.append([None, 103, '7500000000003AA', 'Respiratorios', 'JARABE DEMO', 50, 'LAB DOS', 7292, None, None, 200, 0.9, 20, 'DISPONIBLE', 0.9])
w.append([None, 104, '7500000000004AA', 'Respiratorios', 'GEL DEMO 3+1', 50, 'LAB DOS', None, 'MAS CALIDAD', '3+1', 300, 0.15, 255, 'DISPONIBLE', 0.95])
w.append([None, 105, '7500000000005AA', 'Vitaminas', 'VITA DEMO', 50, 'LAB TRES', None, None, None, 100, 0.2, 80, 'AGOTADO - FECHA TENTATIVA', 0.0])
w.append([None, 106, '7500000000006AA', '#ERROR!', 'TABS DEMO', '#ERROR!', 'LAB TRES', None, None, None, 100, 0.3, 70, 'DISPONIBLE', 0.99])
FIX = os.path.join(tmp, 'ofertas_demo.xlsx'); wb.save(FIX)
async def boot(c, day=dt.datetime(2026, 11, 20, 9, 0), hash_='#inicio'):
    q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
    await q.clock.set_fixed_time(day); await q.goto(U + hash_); await q.wait_for_timeout(1500)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    return q, errs
async def click(q, sel):
    await q.click(sel); await q.wait_for_timeout(300)
async def body(q): return await q.evaluate("document.getElementById('pm-body').innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1280, 'height': 900})
        q, errs = await boot(c)
        await q.evaluate("location.hash='#promociones'"); await q.wait_for_timeout(700)
        tabs = await q.evaluate("[...document.querySelectorAll('[data-action=\"pm-tab\"]')].map(b=>b.textContent.trim())")
        chk('T1 hay cinco pestañas: Resumen, Oportunidades, Ofertas recibidas, Promociones y Resultados', len(tabs) == 5 and 'Ofertas recibidas' in tabs[2], tabs)
        await click(q, '[data-action="pm-tab"][data-tab="ofertas"]')
        t = await body(q)
        chk('T2 la pestaña abre vacía con explicación', 'Todavía no hay ofertas recibidas' in t and 'Cargar archivo de ofertas' in t, t[:200])
        chk('T3 dice que recibir no activa nada', 'no activa nada en la web ni en la app' in t)
        # carga
        await q.set_input_files('#of-file', FIX); await q.wait_for_timeout(1200)
        t = await body(q)
        chk('L1 muestra la revisión previa y elige «Productos finales»', 'Revisar antes de guardar' in t and 'Productos finales' in t and '5 ofertas listas' in t, t[:600])
        chk('L2 omite la fila sin SKU y lo dice', '1 filas sin SKU' in t, t[:700])
        tc = await q.evaluate("document.getElementById('pm-body').textContent"); chk('L3 reconoce Oracle como SKU', 'SKU (Oracle)' in tc and '«Oracle»' in tc)
        sheets = await q.evaluate("[...document.querySelectorAll('#of-p-sheet option')].map(o=>o.textContent)")
        chk('L4 deja cambiar de hoja', sheets == ['Descuentos', 'Productos finales'], sheets)
        # guardar sin nombre
        await click(q, '[data-action="of-commit"]')
        t = await body(q)
        chk('L5 sin tu nombre no guarda', 'Escribe tu nombre' in t, t[:300])
        await q.fill('#pm-actor', 'Persona A'); await q.dispatch_event('#pm-actor', 'change'); await q.wait_for_timeout(200)
        await q.fill('#of-p-name', 'Hot Sale demo'); await q.dispatch_event('#of-p-name', 'change'); await q.wait_for_timeout(250)
        await q.fill('#of-p-start', '2026-05-25'); await q.dispatch_event('#of-p-start', 'change'); await q.wait_for_timeout(250)
        await q.fill('#of-p-end', '2026-06-02'); await q.dispatch_event('#of-p-end', 'change'); await q.wait_for_timeout(250)
        await click(q, '[data-action="of-commit"]')
        t = await body(q)
        chk('L6 guarda 5 ofertas en LOT-001 como Recibida', '5 ofertas guardadas en LOT-001' in t, t[:400])
        rows = await q.evaluate("[...document.querySelectorAll('#pm-body tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' '))")
        chk('L7 el SKU se guarda sin «AA»', any('7500000000001' in r and '7500000000001AA' not in r for r in rows), rows[:3])
        chk('L8 vigencia de la campaña en las filas', any('2026-05-25 a 2026-06-02' in r for r in rows))
        chk('L9 aparecen las alertas (tope, abastecimiento)', any('alerta' in r for r in rows))
        # alertas del jarabe 90 %
        jar = [r for r in rows if 'JARABE' in r]
        chk('A1 el descuento de 90 % avisa', bool(jar) and 'alerta' in jar[0], jar)
        # abrir y validar
        oid = await q.evaluate("[...document.querySelectorAll('#pm-body tbody tr')].find(r=>r.innerText.includes('CREMA DEMO')).querySelector('[data-action=\"of-open\"]').dataset.id")
        await click(q, f'[data-action="of-open"][data-id="{oid}"]')
        t = await body(q)
        chk('D1 el detalle muestra datos y alertas', 'Datos de la oferta' in t and 'Historial' in t and 'CREMA DEMO' in t, t[-400:])
        if await q.evaluate("(i)=>FP.offers.find(FP.app.state.of.reg,i).state==='validated'", oid):   # las que no traen alertas se validan solas
            chk('E0 una oferta sin alertas ya llegó validada automáticamente', True)
            await click(q, f'[data-action="of-state"][data-to="received"][data-id="{oid}"]')
        await click(q, f'[data-action="of-state"][data-to="validated"][data-id="{oid}"]')
        t = await body(q); chk('E1 pasa a Validada', 'ahora está «Validada»' in t, t[:300])
        await click(q, f'[data-action="of-state"][data-to="selected"][data-id="{oid}"]')
        t = await body(q); chk('E2 pasa a En promoción', 'ahora está «En promoción»' in t, t[:300])
        dis = await q.evaluate("document.getElementById('of-e-discount').disabled")
        chk('E3 seleccionada no se edita', dis is True)
        await click(q, f'[data-action="of-state"][data-to="validated"][data-id="{oid}"]')
        await q.fill('#of-e-discount', '30'); await click(q, f'[data-action="of-edit"][data-field="discount"][data-id="{oid}"]')
        t = await body(q); chk('E4 editar guarda y deja el valor anterior en el historial', 'Cambio guardado' in t and '25 %' in t and '30 %' in t, t[-500:])
        # descartar exige motivo
        await click(q, f'[data-action="of-state"][data-to="discarded"][data-id="{oid}"]')
        t = await body(q); chk('E5 descartar exige motivo', 'escribe el motivo' in t.lower(), t[:300])
        # bulk: marcar visibles y validar
        await click(q, '[data-action="of-check-all"]')
        await click(q, '[data-action="of-bulk"][data-to="validated"]')
        t = await body(q); chk('B1 validar marcadas informa cuántas pasaron y por qué no el resto', 'pasaron a «Validada»' in t, t[:400])
        # paso a promoción
        await q.evaluate("(() => { const r = FP.promotionNotes.registry(); FP.promotions.createPromotion(r, { name: 'Hot Sale demo', createdBy: 'Persona A', plannedStart: '2026-05-25', plannedEnd: '2026-06-02' }); FP.app.render(); })()")
        await q.wait_for_timeout(300)
        await click(q, f'[data-action="of-open"][data-id="{oid}"]')
        await click(q, f'[data-action="of-state"][data-to="selected"][data-id="{oid}"]')
        has = await q.evaluate("!!document.getElementById('of-b-promo')")
        chk('P1 aparece el selector de promoción destino', has)
        await q.evaluate("(i)=>{FP.app.state.of.checked={}; FP.app.state.of.checked[i]=true; FP.app.render()}", oid); await q.wait_for_timeout(300)   # el destino ahora recibe las marcadas
        await click(q, '[data-action="of-to-promo"]')
        t = await body(q); chk('P2 agrega la seleccionada a la promoción', '1 ofertas se agregaron' in t, t[:300])
        sk = await q.evaluate("JSON.stringify(FP.promotionNotes.registry().promotions[0].skus.map(s=>[s.sku,s.origin,s.offerId]))")
        chk('P3 el SKU entra con origen «oferta» y su identificador', sk == '[["7500000000001","offer","%s"]]' % oid, sk)
        # persistencia
        await q.reload(); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove()); location.hash='#promociones'"); await q.wait_for_timeout(700)
        await click(q, '[data-action="pm-tab"][data-tab="ofertas"]')
        await click(q, '[data-fold="batches"]')   # «Archivos recibidos» viene plegado
        t = await body(q)
        chk('R1 tras recargar siguen las ofertas', 'Ofertas (5)' in t and 'LOT-001' in t, t[:300])
        st = await q.evaluate("JSON.stringify(FP.offers && 1)")
        keyok = await q.evaluate("!!localStorage.getItem(Object.keys(localStorage).find(k=>/offers/.test(k)) || '')")
        chk('R2 se guarda en el navegador (clave pequeña)', keyok)
        # segunda carga: duplicados
        await q.set_input_files('#of-file', FIX); await q.wait_for_timeout(1200)
        await q.fill('#of-p-start', '2026-05-25'); await q.dispatch_event('#of-p-start', 'change'); await q.wait_for_timeout(250)
        await q.fill('#of-p-end', '2026-06-02'); await q.dispatch_event('#of-p-end', 'change'); await q.wait_for_timeout(250)
        await click(q, '[data-action="of-commit"]')
        t = await body(q); chk('U1 segunda carga queda en LOT-002', 'LOT-002' in t, t[:200])
        await click(q, '[data-fold="filters"]')   # los filtros vienen plegados
        await q.select_option('#of-f-issue', 'dup_other'); await q.dispatch_event('#of-f-issue', 'change'); await q.wait_for_timeout(300)
        n = await q.evaluate("document.querySelectorAll('#pm-body tbody tr [data-action=\"of-open\"]').length")
        tot = await q.evaluate("(() => { const an = FP.offers.analyze(FP.app.state.of.reg); return FP.app.state.of.reg.offers.filter(o => an.get(o.offerId).includes('dup_other')).length })()")
        chk('U2 las ofertas repetidas entre archivos se marcan como duplicadas (las 5 del lote nuevo en pantalla, 10 en total)', n == 5 and tot == 10, [n, tot])
        # real opcional
        if REAL and os.path.exists(REAL):
            await q.evaluate("localStorage.clear()"); await q.reload(); await q.wait_for_timeout(1500)
            await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove()); location.hash='#promociones'"); await q.wait_for_timeout(700)
            await click(q, '[data-action="pm-tab"][data-tab="ofertas"]')
            await q.set_input_files('#of-file', REAL); await q.wait_for_timeout(2500)
            t = await body(q); print('REAL:', t[t.find('Revisar antes'):][:700].replace('\n', ' | '))
        import base64
        b64 = base64.b64encode(open(FIX, 'rb').read()).decode()
        hd = await q.evaluate("async (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await FP.xlsx.parse(u.buffer); const r2 = await FP.xlsx.parse(u.buffer, { sheet: 'Productos finales' }); return [r.headers.join('|'), r2.headers.length] }", b64)
        chk('X1 sin pedir hoja, el lector sigue leyendo la primera (compatibilidad)', hd[0] == 'sivec|Oracle|Producto' and hd[1] == 15, hd)
        await q.evaluate("['inicio','recovery','cambios','medir'].forEach(v=>{location.hash='#'+v})"); await q.wait_for_timeout(500)
        chk('Z1 sin errores de página', not errs, errs)
        await b.close()
asyncio.run(main())
print(f"\n{len(fails)} FALLAS: {', '.join(fails)}" if fails else '\nTODO OK')
sys.exit(1 if fails else 0)
