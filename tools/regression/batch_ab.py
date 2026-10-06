"""Importación de archivos grandes: validación por bloques y copia directa de registros. Uso: python3 batch_ab.py <raiz>
AB-1 process y processAsync dan EXACTAMENTE el mismo resultado (filas, incidencias, resumen) con filas válidas, negativas, no numéricas, vacías,
     fechas inválidas, duplicados y filas mal formadas. AB-2 la copia directa de registros equivale a la copia por JSON (todas las variantes).
AB-3 un archivo de 45 mil filas (más del umbral) se valida por bloques desde la pantalla, avisa el avance, la página no se congela y al confirmar
     entra todo, con la cuarentena que le corresponde (calculada aparte)."""
import asyncio, sys, os, json, threading, functools, http.server, socketserver
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
def sample(n):
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for i in range(n):
        d = f'2026-09-{1 + i % 28:02d}'; ch = ['ecommerce', 'app', 'whatsapp', 'llamadas'][i % 4]
        v = '1000'
        if i % 97 == 5: v = '-500'          # negativo
        elif i % 89 == 7: v = 'abc'         # no numérico
        elif i % 83 == 9: v = ''            # vacío
        elif i % 79 == 11: d = '2026-13-45' # fecha inválida
        elif i % 71 == 13: ch = 'canal_x'   # canal inválido
        extra = ',extra' if i % 61 == 17 else ''   # fila mal formada
        rows.append(f'{d},{ch},{v},{3 + i % 7},{200 + i % 50}{extra}')
    for i in range(30): rows.append('2026-09-02,ecommerce,777,5,100')   # duplicados
    return '\n'.join(rows) + '\n'
def big(n):
    rows = ['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume']
    for i in range(n):
        d = f'2026-{1 + (i // 6000) % 9:02d}-{1 + (i // 200) % 28:02d}'
        rows.append(f'{d},{"app" if i % 2 else "ecommerce"},dispositivo,seg_{i % 40},{"-5" if i % 5000 == 1 else 1000 + i % 90},{1 + i % 9},{100 + i % 300}')
    return '\n'.join(rows) + '\n'
CMP = """async(csv)=>{const strip=(r)=>JSON.stringify({rows:r.rows.map(x=>[x.line,x.status,x.keyValid,x.record,x.issues.map(i=>[i.type,i.severity,i.row,i.field])]),summary:r.summary,canImport:r.canImport,mi:r.mappingIssues.length});
  const st=FP.importer.stage(csv,{fileName:'m.csv',dataType:'actual'});const opts={settings:FP.app.state.settings,existing:[],today:'2026-10-02'};
  const a=strip(FP.importer.process(st,opts));const prog=[];const b=strip(await FP.importer.processAsync(st,{...opts,slice:700,onProgress:(d,t)=>prog.push([d,t])}));
  const sel=FP.importer.process(st,opts).rows.filter(r=>r.keyValid);let diff=0,n=0;
  for(const r of sel){n++;const j=JSON.parse(JSON.stringify(r.record)), c=FP.dataStore.cloneRecord(r.record);if(JSON.stringify(j)!==JSON.stringify(c))diff++}
  const sum=JSON.parse(b).summary;
  return {same:a===b,len:a.length,steps:prog.length,last:prog[prog.length-1],sum,clones:n,cloneDiff:diff}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u); await q.wait_for_timeout(500)
        r = await q.evaluate(CMP, sample(3500))
        chk(f"AB-1 process y processAsync dan el mismo resultado ({r['len']:,} caracteres comparados; {r['steps']} bloques de 700 filas)", r['same'] and r['steps'] >= 5 and r['last'] == [3530, 3530], r)
        s = r['sum']
        chk('AB-1 la muestra trae de todo: filas válidas, con advertencias, con errores, llaves inválidas y duplicados', s['valid'] > 0 and s['warning'] > 0 and s['error'] > 0 and s['invalidKey'] > 0 and s['duplicates'] > 0, s)
        chk(f"AB-2 la copia directa equivale a la copia por JSON en los {r['clones']:,} registros (cuarentena, vacíos, calculados, cadenas compartidas)", r['cloneDiff'] == 0 and r['clones'] > 3000, r)
        # AB-3 · desde la pantalla, 45 mil filas
        N = 45000; csv = big(N)
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.evaluate("(()=>{window.__gap=0;let last=performance.now();window.__hb=setInterval(()=>{const t=performance.now();window.__gap=Math.max(window.__gap,t-last);last=t},20);window.__toasts=[];const o=FP.ui.toast;FP.ui.toast=(m)=>{window.__toasts.push(m);return o(m)}})()")
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'grande.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000)
        info = await q.evaluate("({gap:Math.round(window.__gap),toasts:window.__toasts.slice(0,6)})")
        chk('AB-3 el archivo de 45 mil filas se valida por bloques: avisa «Validando …» y la página no se queda congelada más de ~1.5 s seguidos', any('Validando 45,000 filas' in t for t in info['toasts']) and info['gap'] < 1500, info)
        await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=120000)
        got = await q.evaluate("(()=>{const recs=FP.dataStore.records(FP.app.state.store,'segments');return {n:recs.length,q:recs.filter(r=>r.status==='quarantined').length,qcells:recs.filter(r=>r.metrics.revenue.source==='quarantined').length}})()")
        expq = len([i for i in range(N) if i % 5000 == 1])
        chk(f'AB-3 al confirmar entran las {N:,} filas y quedan {expq} registros con la venta en cuarentena (calculado aparte)', got['n'] == N and got['q'] == expq and got['qcells'] == expq, (got, expq))
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_ab:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
