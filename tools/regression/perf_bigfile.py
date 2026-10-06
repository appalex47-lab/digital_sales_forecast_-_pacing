"""Importación de UN archivo grande de GA4 por la pantalla de Carga (el caso real: CSV de ~100 MB de un mes).
Uso: python3 perf_bigfile.py <raiz> <archivo.csv> <salida.json> [tope_heap_MB]
Registra cada 250 ms el heap de JavaScript (el pico es lo que tumba la pestaña), si la página se cae («crash»), cuánto tarda cada etapa
(archivo en revisión, importar) y cuántos registros quedan. Datos sintéticos."""
import asyncio, sys, os, json, time, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); FILE = sys.argv[2]; OUT = sys.argv[3]; LIM = sys.argv[4] if len(sys.argv) > 4 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
R = {'archivoMB': round(os.path.getsize(FILE) / 1048576), 'topeHeapMB': LIM, 'eventos': [], 'picoHeapMB': 0, 'cayo': False}
def save(): json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
async def main():
    flags = ['--no-sandbox', '--enable-precise-memory-info'] + ([f'--js-flags=--max-old-space-size={LIM}'] if LIM else [])
    async with async_playwright() as p:
        b = await p.chromium.launch(args=flags); q = await b.new_page(viewport={'width': 1280, 'height': 900}); t0 = time.time(); stop = False
        q.on('crash', lambda: (R.__setitem__('cayo', True), R['eventos'].append([round(time.time() - t0), 'LA PESTAÑA SE CAYÓ']), save()))
        q.on('pageerror', lambda e: R['eventos'].append([round(time.time() - t0), 'error: ' + str(e)[:160]]))
        async def poll():
            while not stop and not R['cayo']:
                try:
                    m = await asyncio.wait_for(q.evaluate("performance.memory.usedJSHeapSize"), 5); R['picoHeapMB'] = max(R['picoHeapMB'], round(m / 1e6))
                except Exception: pass
                save(); await asyncio.sleep(0.25)
        pt = asyncio.create_task(poll())
        await q.goto(f'http://127.0.0.1:{port}/index.html#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        R['eventos'].append([round(time.time() - t0), 'archivo elegido']); save()
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', FILE)
        try:
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=420000)
            R['eventos'].append([round(time.time() - t0), 'archivo en revisión (listo para importar)'])
            R['heap_en_revision_MB'] = round(await q.evaluate("(performance.memory.usedJSHeapSize)") / 1e6); save()
            await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=420000)
            R['eventos'].append([round(time.time() - t0), 'importado'])
            R['registros'] = await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
        except Exception as e:
            R['eventos'].append([round(time.time() - t0), 'no terminó: ' + str(e)[:120]])
        # después de importar: guardado en el navegador (la app lo hace sola) y recarga de la página (lo que ocurre al volver a abrirla)
        if not R['cayo'] and 'registros' in R:
            try:
                R['toast_tras_importar'] = await q.evaluate("document.getElementById('toast').innerText")
                await asyncio.wait_for(q.evaluate("(async()=>{if(FP.app.savingChain&&FP.app.savingChain.segments) await FP.app.savingChain.segments})()"), 300)
                R['eventos'].append([round(time.time() - t0), 'guardado en el navegador terminado']); save()
                R['toast_guardado'] = await q.evaluate("document.getElementById('toast').innerText")
                t1 = time.time(); await q.reload()
                await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.dataStore.records(FP.app.state.store,'segments').length > 0", timeout=300000)
                R['recarga_s'] = round(time.time() - t1, 1); R['registros_tras_recargar'] = await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
                R['heap_tras_recargar_MB'] = round(await q.evaluate("performance.memory.usedJSHeapSize") / 1e6)
            except Exception as e:
                R['eventos'].append([round(time.time() - t0), 'falló tras importar: ' + str(e)[:140]])
        stop = True; await pt; R['total_s'] = round(time.time() - t0); save(); print(json.dumps(R, ensure_ascii=False, indent=1))
        try: await b.close()
        except Exception: pass
asyncio.run(main())
