"""Calidad de datos · huecos por canal (A banner con la causa, B mensaje de problemas coherente, C Total sin colecciones vacías, D fechas faltantes por canal).
Carga archivos CSV por la vía real de la app con la réplica del caso del usuario (2,863 + 1,079 filas; 60 y 5 fechas con algún canal faltante).
Uso: python3 batch_m.py <raiz>   Sale 1 si alguna falla."""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from quality_gaps_state import load
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
JS = """()=>{const v=document.getElementById('view-calidad');const row=l=>{const tr=[...v.querySelectorAll('#quality-summary tbody tr')].find(t=>t.cells[0].innerText.trim().startsWith(l));return tr?[...tr.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()):null};
 const d=v.querySelector('#q-missing-by-channel');
 return {banner:(v.querySelector('.banner__text')||{innerText:''}).innerText.trim(),bannerTitle:(v.querySelector('.banner__title')||{innerText:''}).innerText.trim(),
  problemas:(v.querySelector('p.note')||{innerText:''}).innerText.trim(),problemasCls:(v.querySelector('p.note')||{className:''}).className,
  leidas:row('Filas leídas'),validos:row('Registros válidos'),adv:row('Registros con advertencias'),err:row('Registros con errores'),rech:row('Filas rechazadas'),dup:row('Duplicados'),
  fechasFalt:row('Fechas faltantes'),sinDatos:row('Canales sin datos'),canalFalt:row('Fechas con algún canal faltante'),cob:row('Cobertura temporal'),estado:row('Estado'),
  det:d?{open:d.open,summary:d.querySelector('summary').innerText.trim(),hint:(d.querySelector('.field__hint')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim(),   // textContent: el bloque está plegado y innerText lo leería vacío
    rows:[...d.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.replace(/\\s+/g,' ').trim()))}:null}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await load(q, u)
        r = await q.evaluate(JS)
        chk('Réplica fiel: 2,863 filas de histórico + 1,079 de venta real = 3,942, todas válidas, sin advertencias de fila, rechazos, errores ni duplicados', r['leidas'][1] == '2,863' and r['leidas'][3] == '1,079' and r['leidas'][5] == '3,942' and r['validos'][5] == '3,942' and all(x[1] == '0' and x[3] == '0' for x in (r['adv'], r['err'], r['rech'], r['dup'])), r['leidas'])
        chk('Réplica fiel: 60 fechas con algún canal faltante en Histórico y 5 en Venta real; estado «Datos con advertencias» en ambos y en el Total', r['canalFalt'][1] == '60' and r['canalFalt'][3] == '5' and r['estado'][1] == 'Datos con advertencias' and r['estado'][3] == 'Datos con advertencias' and r['estado'][5] == 'Datos con advertencias', (r['canalFalt'], r['estado']))
        chk('Sin cambios: la cobertura temporal sigue en 100 % y las fechas sin ningún registro en 0 (los huecos son por canal)', r['cob'][1] == '100.0%' and r['cob'][3] == '100.0%' and r['fechasFalt'][1] == '0' and r['fechasFalt'][3] == '0', (r['cob'], r['fechasFalt']))
        # A
        chk('A el banner dice la causa: «Histórico: 60 fechas con algún canal faltante (App 59 días, WhatsApp 1 día, Llamadas 1 día). Venta real / Actual: 5 fechas con algún canal faltante (Llamadas 5 días).»', r['bannerTitle'] == 'Datos con advertencias' and r['banner'] == 'Histórico: 60 fechas con algún canal faltante (App 59 días, WhatsApp 1 día, Llamadas 1 día). Venta real / Actual: 5 fechas con algún canal faltante (Llamadas 5 días).', r['banner'])
        # B
        chk('B «Problemas por tipo» ya no dice «No hay errores ni advertencias»: aclara que las filas están bien y que la advertencia viene de huecos de cobertura', 'Las filas no tienen errores ni advertencias' in r['problemas'] and 'huecos de cobertura' in r['problemas'] and 'No hay errores ni advertencias registrados' not in r['problemas'] and 'note--warning' in r['problemasCls'], (r['problemas'], r['problemasCls']))
        # C
        chk('C «Canales sin datos» del Total = 0 (antes 8: sumaba los 4 canales de Plan / Meta y los 4 de Segmentos, que no se cargaron); Histórico y Venta real siguen en 0', r['sinDatos'][1] == '0' and r['sinDatos'][3] == '0' and r['sinDatos'][5] == '0' and r['sinDatos'][2] == '—' and r['sinDatos'][4] == '—', r['sinDatos'])
        # D
        d = r['det']
        chk('D «Fechas faltantes por canal»: bloque plegado con la explicación y una fila por cada canal con huecos (App, WhatsApp, Llamadas) y el Histórico seleccionado', bool(d) and d['open'] is False and d['summary'] == 'Fechas faltantes por canal' and 'Un canal «falta» un día cuando no tiene ninguna fila ese día' in d['hint'] and [x[0] for x in d['rows']] == ['App', 'WhatsApp', 'Llamadas'], d)
        chk('D App: 59 días, del 2024-01-01 al 2024-02-28 (el rango más largo: el canal empieza después del inicio); WhatsApp y Llamadas: 1 día cada uno, 2024-06-15', d['rows'][0][1] == '59' and d['rows'][0][2] == '2024-01-01 a 2024-02-28 (59 días)' and d['rows'][1][1:] == ['1', '2024-06-15'] and d['rows'][2][1:] == ['1', '2024-06-15'], d['rows'])
        # D con la otra colección (Venta real)
        await q.click('[data-action="quality-type"][data-value="actual"]'); await q.wait_for_timeout(500)
        r2 = await q.evaluate(JS)
        chk('D Venta real / Actual: solo Llamadas, 5 días, 2026-03-10 a 2026-03-14 (5 días)', r2['det'] and [x[0] for x in r2['det']['rows']] == ['Llamadas'] and r2['det']['rows'][0][1:] == ['5', '2026-03-10 a 2026-03-14 (5 días)'], r2['det'])
        await q.click('[data-action="quality-type"][data-value="plan"]'); await q.wait_for_timeout(400)
        r3 = await q.evaluate(JS)
        chk('D una colección sin datos (Plan / Meta) no muestra el bloque y conserva su mensaje «sin datos»', r3['det'] is None, r3['det'])
        # el banner no inventa motivos cuando todo está bien: se comprueba con las cifras de la app de prueba
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_m:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
