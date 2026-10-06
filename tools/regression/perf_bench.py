"""Banco de rendimiento. Uso: python3 perf_bench.py <raiz> <registros_de_segmentos> [salida.json]
Genera en el navegador N registros de Segmentos (más venta real e histórico de tamaño realista), con la MISMA forma que produce la
importación, y mide: memoria, refresh (consolidate + coverage + years), resolveLatest, cambio de sección (segmentos, datos, calidad,
diagnóstico), duplicados al importar un archivo pequeño con todos los registros existentes, y el guardado. Datos sintéticos."""
import asyncio, sys, os, json, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1]); N = int(sys.argv[2]); OUT = sys.argv[3] if len(sys.argv) > 3 else None
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n2026-09-01,ecommerce,dispositivo,Móvil,1000,10,500\n'
GEN = """async(N)=>{
  const st=FP.app.state.store, tpl=st.segments.records[0];
  const dims=['device','source','medium','campaign','landing','customer_type'], ch=['ecommerce','app'];
  const recs=[]; const t0=performance.now(); let i=0;
  const start=Date.UTC(2025,0,1);
  for(let d=0; recs.length<N; d++){
    const date=new Date(start+d*86400000).toISOString().slice(0,10);
    for(const c of ch) for(const dim of dims){
      const per = dim==='landing'||dim==='campaign' ? 90 : 12;
      for(let k=0;k<per && recs.length<N;k++){
        const seg=dim+'_'+k, tv=100+((d*7+k*13)%900), o=1+((d+k)%9);
        recs.push({key:`${date}|${c}|segments|${dim}|${seg}`,dataType:'segments',date,channel:c,dayType:'regular',holiday:null,event:null,season:null,notes:null,
          metrics:{revenue:{value:o*500,source:'observed'},orders:{value:o,source:'observed'},trafficVolume:{value:tv,source:'observed'},conversionRate:{value:o/tv,source:'calculated'},aov:{value:500,source:'calculated'}},
          status:'valid',issueCounts:{error:0,warning:0},provenance:{batchId:tpl.provenance.batchId,fileName:'gen.csv',row:(i++)+2},dimension:dim,segment:seg,segmentKey:seg});
      }
    }
  }
  st.segments.records=recs; if(window.gc) gc();
  return {made:recs.length, genMs:Math.round(performance.now()-t0), days:recs[recs.length-1].date};
}"""
TIME = "(()=>{window.__t=(f)=>{const a=performance.now();const r=f();return [Math.round(performance.now()-a), r]};return 1})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=3200 --expose-gc'])
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        u = f'http://127.0.0.1:{port}/index.html'
        await prepare(q, u)   # venta real y plan de prueba: el Diagnóstico y la matriz de Calidad corren con datos, como en uso real
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 's.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])'); await q.click('[data-action="commit-staged"]'); await q.wait_for_timeout(600)
        # venta real + histórico realistas (4 canales × ~2 años): los generamos clonando la importación real de la app
        await q.evaluate(TIME)
        mem0 = await q.evaluate("(gc(),performance.memory.usedJSHeapSize)")
        g = await q.evaluate(GEN, N); mem1 = await q.evaluate("(gc(),performance.memory.usedJSHeapSize)")
        R = {'N': g['made'], 'genMs': g['genMs'], 'heapMB_before': round(mem0 / 1e6), 'heapMB_after': round(mem1 / 1e6), 'heapMB_perRecord_KB': round((mem1 - mem0) / g['made'] / 1024, 2)}
        T = lambda js: q.evaluate(f"window.__t(()=>{{{js}}})")
        R['consolidate_ms'] = (await T("FP.dataStore.consolidate(FP.app.state.store, 2026, {}); return 1"))[0]
        R['coverage_summarize_ms'] = (await T("FP.coverage.summarize(FP.app.state.store); return 1"))[0]
        R['years_ms'] = (await T("FP.dataStore.years(FP.app.state.store); return 1"))[0]
        R['resolveLatest_segments_ms'] = (await T("return FP.dataStore.resolveLatest(FP.app.state.store,'segments').size"))[0]
        R['refresh_total_ms'] = R['consolidate_ms'] + R['coverage_summarize_ms'] + R['years_ms']
        # cambio de sección: tiempo hasta que termina el manejador de hashchange
        async def go(h):
            return await q.evaluate("""async(h)=>{const a=performance.now();location.hash=h;await new Promise(r=>setTimeout(r,0));await new Promise(r=>requestAnimationFrame(()=>r()));return Math.round(performance.now()-a)}""", h)
        await go('#inicio')
        for k, v in (('periodType', 'month'), ('periodKey', '2026-09'), ('channel', 'total'), ('comparison', 'actual_vs_previous')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})")
        for name, hsh in (('segmentos', '#segmentos'), ('datos', '#datos'), ('calidad', '#calidad'), ('diagnostico', '#diagnostico'), ('pacing', '#pacing')):
            R[f'ir_a_{name}_ms'] = await go(hsh); await go('#inicio')
            R[f'ir_a_{name}_repetido_ms'] = await go(hsh); await go('#inicio')   # segunda visita: aquí se nota la caché
        # dentro de Segmentos: cambiar de dimensión (lo que hace el usuario al explorar)
        await go('#segmentos')
        R['segmentos_cambiar_dimension_ms'] = await q.evaluate("""async()=>{const s=document.getElementById('sg-dim');if(!s)return null;const a=performance.now();s.value='campaign';s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));return Math.round(performance.now()-a)}""")
        # Datos normalizados con Segmentos seleccionado (filtra y ordena toda la colección en cada render)
        await q.evaluate("FP.app.state.dataFilters.dataType='segments'")
        R['ir_a_datos_segmentos_ms'] = await go('#datos'); await go('#inicio')
        await q.evaluate("FP.app.state.dataFilters.dataType='actual'")
        # importar un archivo pequeño con todos los registros existentes (duplicados)
        R['import_pequeno_con_existentes_ms'] = (await T("const st=FP.importer.stage('fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\\n2026-09-01,ecommerce,dispositivo,Móvil,1000,10,500\\n',{fileName:'x.csv',dataType:'segments'});FP.importer.process(st,{settings:FP.app.state.settings,existing:FP.dataStore.records(FP.app.state.store,'segments')});return 1"))[0]
        # guardado de la colección (parte síncrona y total)
        R['guardar_sincrono_ms'] = (await T("FP.app.saveStore(['segments']); return 1"))[0]
        R['guardar_total_ms'] = await q.evaluate("""async()=>{const a=performance.now();try{await (FP.app.savingChain.segments||Promise.resolve())}catch(e){}return Math.round(performance.now()-a)}""")
        # quitar un archivo (lote) de la colección grande — al final: vacía la colección
        R['quitar_lote_ms'] = (await T("const st=FP.app.state.store;const id=st.segments.batches[0].id;FP.dataStore.removeBatch(st,id);return 1"))[0]
        R['heapMB_final'] = round(await q.evaluate("(gc(),performance.memory.usedJSHeapSize)") / 1e6)
        R['errores'] = errs[:2]
        print(json.dumps(R, ensure_ascii=False, indent=1))
        if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
        await b.close()
asyncio.run(main())
