"""Guardado por bloques incremental. Uso: python3 batch_aa.py <raiz>
Colección de Segmentos de 130 mil registros (más de CHUNK_THRESHOLD): primer guardado completo; agregar 5 mil registros → solo se escribe el bloque
parcial y el nuevo (no todos); recargar la página → mismos registros; quitar un lote → se reescribe todo; en IndexedDB no quedan bloques huérfanos."""
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
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n2026-09-01,ecommerce,dispositivo,Móvil,1000,10,500\n'
MAKE = """async(a)=>{const st=FP.app.state.store, col=st.segments; const tpl=col.records[0], bid=tpl.provenance.batchId;
  const out=[];for(let i=0;i<a.n;i++){const date=new Date(Date.UTC(2024,0,1)+Math.floor((a.from+i)/200)*86400000).toISOString().slice(0,10);const seg=a.tag+(a.from+i)%200;
    out.push({...tpl,key:`${date}|ecommerce|segments|device|${seg}`,date,segment:seg,segmentKey:seg,metrics:{...tpl.metrics,revenue:{value:1000+((a.from+i)%97),source:'observed'}},provenance:{...tpl.provenance,batchId:a.batch,row:a.from+i+2}})}
  if(!col.batches.some(b=>b.id===a.batch)) col.batches.push({...col.batches[0],id:a.batch,fileName:a.batch+'.csv',rowCount:a.n,accepted:a.n});
  for(let i=0;i<out.length;i++) col.records.push(out[i]);
  return col.records.length}"""
IDB = """async()=>new Promise((res,rej)=>{const r=indexedDB.open('fp-data');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('kv','readonly');const q=tx.objectStore('kv').getAllKeys();q.onsuccess=()=>res(q.result.filter(k=>/segmentsData/.test(k)||/segments/i.test(k)));q.onerror=()=>rej(q.error)};r.onerror=()=>rej(r.error)})"""
async def settled(q):
    await q.evaluate("(async()=>{await (FP.app.savingChain.segments||Promise.resolve())})()"); await q.wait_for_timeout(300)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 's.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])'); await q.click('[data-action="commit-staged"]'); await settled(q)
        # espía de escrituras de bloques
        await q.evaluate("(()=>{window.__w=[];const st=FP.app.storage;const o=st.saveAsync.bind(st);st.saveAsync=(k,d)=>{window.__w.push(k);return o(k,d)}})()")
        n1 = await q.evaluate(MAKE, {'n': 129999, 'from': 0, 'tag': 'a', 'batch': 'lote_a'})
        await q.evaluate("FP.app.saveStore(['segments'])"); await settled(q)
        w1 = await q.evaluate("window.__w.length"); expected1 = -(-n1 // 25000)
        chk(f'A-1 primer guardado: escribe todos los bloques ({expected1} bloques de 25,000 para {n1:,} registros)', w1 == expected1, (w1, expected1))
        await q.evaluate("window.__w=[]"); n2 = await q.evaluate(MAKE, {'n': 5000, 'from': 129999, 'tag': 'a', 'batch': 'lote_b'})
        await q.evaluate("FP.app.saveStore(['segments'])"); await settled(q)
        w2 = await q.evaluate("window.__w.length"); full = n1 // 25000; total_chunks = -(-n2 // 25000)
        chk(f'A-2 al agregar 5,000 registros solo se escribe lo nuevo: {total_chunks - full} bloque(s) (el parcial y los nuevos), no los {total_chunks}', w2 == total_chunks - full and w2 < total_chunks, (w2, total_chunks, full))
        checksum = "FP.dataStore.records(FP.app.state.store,'segments').reduce((a,r)=>a+(r.metrics.revenue.value||0)+r.provenance.row,0)"
        c2 = await q.evaluate(checksum)
        keys2 = await q.evaluate(IDB)
        chunks2 = [k for k in keys2 if ':c' in k]
        chk(f'A-3 en IndexedDB quedan exactamente {total_chunks} bloques (ningún huérfano del guardado anterior)', len(chunks2) == total_chunks, (len(chunks2), chunks2[:4]))
        await q.reload(); await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.dataStore.records(FP.app.state.store,'segments').length > 100000", timeout=60000)
        c3 = await q.evaluate(checksum); nrec = await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
        chk('A-4 al recargar la página se recuperan los mismos registros (cuenta y suma de control idénticas)', nrec == n2 and abs(c3 - c2) < 1e-6, (nrec, n2, c3, c2))
        await q.evaluate("(()=>{window.__w=[];const st=FP.app.storage;const o=st.saveAsync.bind(st);st.saveAsync=(k,d)=>{window.__w.push(k);return o(k,d)}})()")
        n3 = await q.evaluate(MAKE, {'n': 3000, 'from': 134999, 'tag': 'a', 'batch': 'lote_c'}); await q.evaluate("FP.app.saveStore(['segments'])"); await settled(q)
        w3 = await q.evaluate("window.__w.length"); tc3 = -(-n3 // 25000); full3 = n2 // 25000
        chk(f'A-5 tras recargar, el siguiente guardado también es incremental ({w3} bloque(s) de {tc3})', w3 == tc3 - full3 and w3 < tc3, (w3, tc3, full3))
        await q.evaluate("window.__w=[]")
        await q.evaluate("FP.dataStore.removeBatch(FP.app.state.store,'lote_b')"); await q.evaluate("FP.app.saveStore(['segments'])"); await settled(q)
        n4 = await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length"); w4 = await q.evaluate("window.__w.length"); tc4 = -(-n4 // 25000)
        chk(f'A-6 al quitar un lote la colección cambia por completo y se reescribe todo ({w4} de {tc4} bloques); no se reutiliza nada', w4 == tc4, (w4, tc4))
        keys4 = [k for k in await q.evaluate(IDB) if ':c' in k]
        chk(f'A-7 después de quitar el lote quedan exactamente {tc4} bloques (los viejos se borran)', len(keys4) == tc4, (len(keys4), tc4))
        c4 = await q.evaluate(checksum); await q.reload(); await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.dataStore.records(FP.app.state.store,'segments').length > 100000", timeout=60000)
        c5 = await q.evaluate(checksum); n5 = await q.evaluate("FP.dataStore.records(FP.app.state.store,'segments').length")
        chk('A-8 al recargar tras quitar el lote se recupera lo que quedó (sin los registros del lote quitado)', n5 == n4 and abs(c5 - c4) < 1e-6, (n5, n4, c5, c4))
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_aa:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
