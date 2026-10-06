"""Instantánea de Recovery Center CON datos (escenario + acción + medición) a 1280/768/390.
Uso: python3 recovery_snapshot.py <raiz> <salida.json> [<carpeta_capturas>]"""
import asyncio, json, sys, os, re, hashlib, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]; SHOTS = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else None
VIEW = sys.argv[4] if len(sys.argv) > 4 else 'recovery'   # recovery | medir
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
TS = re.compile(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?|\b1[6-9]\d{11}\b|\b(pbat|ms)_[a-z0-9]{6,}\b|\b\d+ ms\b')
TIME_KEYS = re.compile(r'"[A-Za-z_]*(generated|Generated|At|Date|Time|time|stamp|exportedAt|createdAt)[A-Za-z_]*":"[^"]*"')
TABLES = """(id)=>{const m=document.getElementById(id);return [...m.querySelectorAll('table')].map(t=>({rows:t.rows.length,cols:Math.max(0,...[...t.rows].map(r=>r.cells.length)),cells:[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\\s+/g,' ').trim()))}))}"""
CTRL = """(id)=>{const m=document.getElementById(id);return [...m.querySelectorAll('button,input,select,textarea,a[data-nav],[data-action]')].map(e=>[e.tagName,e.id||'',e.getAttribute('name')||'',e.getAttribute('data-action')||'',e.getAttribute('type')||'']).sort((a,b)=>a.join().localeCompare(b.join()))}"""
TEXT = """(id)=>{const m=document.getElementById(id);const ds=[...m.querySelectorAll('details')];const pv=ds.map(d=>d.open);ds.forEach(d=>d.open=true);const t=m.innerText.replace(/\\s+/g,' ').trim();ds.forEach((d,i)=>d.open=pv[i]);return t}"""
UNNAMED = """(id)=>{const m=document.getElementById(id);const vis=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);return [...m.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(vis).filter(e=>{const n=(e.getAttribute('aria-label')||'').trim()||(e.innerText||'').trim()||(e.title||'').trim()||(e.id&&document.querySelector('label[for="'+e.id+'"]')?'x':'')||(e.closest('label')?'x':'');return !n}).map(e=>e.tagName+'#'+e.id+'.'+(e.getAttribute('data-action')||''))}"""
PROBE = """()=>{
  const v=document.getElementById('view-recovery'), r=getComputedStyle(document.documentElement);
  const tok=k=>{const i=document.createElement('i');i.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(i);return getComputedStyle(i).color};
  const badge=(e)=>{const c=getComputedStyle(e);return {t:e.innerText.trim(),cls:e.className,color:c.color,bg:c.backgroundColor,bs:c.borderTopStyle,pill:c.borderTopLeftRadius}};
  const byText=(txt)=>[...v.querySelectorAll('span,em,b,strong')].filter(e=>e.children.length===0&&e.innerText.trim()===txt&&/tag|badge|chip/.test(e.className)).map(badge);
  const ps=v.querySelector('.panel--sim');
  const bar=(k)=>{const t=document.createElement('span');t.className='closure-bar__track';const e=document.createElement('span');e.className='closure-bar__fill closure-bar__fill--'+k;e.style.width='40%';t.appendChild(e);document.body.appendChild(t);const c=getComputedStyle(e);return [c.backgroundColor,c.backgroundImage]};
  return {
    tok:{scenario:tok('scenario'),observed:tok('observed'),reforecast:tok('reforecast'),plan:tok('plan'),actual:tok('actual')},
    sim:byText('Simulado'), obs:byText('Observado'),
    panelSim: ps?(()=>{const c=getComputedStyle(ps);return {bl:c.borderLeftStyle+' '+c.borderLeftWidth,blc:c.borderLeftColor}})():null,
    gapCards:[...v.querySelectorAll('#rc-gap .metric-card')].map(c=>({tag:((c.querySelector('.state-tag')||{}).innerText||'').trim(),label:c.querySelector('dt').innerText.replace('?','').trim()})),
    simCards:[...v.querySelectorAll('#rc-simulator .metric-card, #rc-saved .metric-card')].length,
    tablesNoDs:[...v.querySelectorAll('table')].filter(t=>!t.classList.contains('ds-table')).length,
    trackTh:[...v.querySelectorAll('#rc-tracking th')].map(t=>[t.innerText.replace(/\\s+/g,' ').replace('?','').trim(),t.dataset.state||'']),
    inlineStyle:[...v.querySelectorAll('[style]')].map(e=>e.getAttribute('style')).filter(s=>!/^width:[\\d.]+%$/.test(s)&&!/^--dot:/.test(s)),
    barScenario:bar('scenario'), barActual:bar('actual'), barReforecast:bar('reforecast'),
    bars:[...v.querySelectorAll('#rc-saved .closure-bar__fill')].map(e=>[e.className.replace('closure-bar__fill ',''),getComputedStyle(e).backgroundColor,getComputedStyle(e).backgroundImage.slice(0,40)]),
    warn:/simulaci[oó]n/i.test(v.innerText)&&/no (representa )?una predicci[oó]n|no predicci[oó]n|no son predicciones|no es una predicci[oó]n/i.test(v.innerText)||/simulaciones, no predicciones/i.test(v.innerText),
    consist:[...v.querySelectorAll('#rc-tracking .pill')].map(e=>e.innerText.trim()),
    tree:[...v.querySelectorAll('#rc-tree .tree-node__tag')].map(e=>{const g=e.querySelector('.ds-badge');const c=g?getComputedStyle(g):null;return [e.innerText.trim(),g?g.className:'',c?c.color:'',c?c.borderTopStyle:'']}),
    causal:/\\bcaus[oó]\\b/i.test(v.querySelector('#rc-tracking').innerText.replace('Nunca "la acción causó"',''))
  }}"""
PROBE_M = """()=>{
  const v=document.getElementById('view-medir'), r=getComputedStyle(document.documentElement);
  const tok=k=>{const i=document.createElement('i');i.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(i);return getComputedStyle(i).color};
  const nodes=[...v.querySelectorAll('#mx-chain .tree-node')].map(li=>{const tag=li.querySelector('.tree-node__tag');const b=tag.querySelector('.ds-badge');const st=tag.querySelector('.state-tag');
    const kind=(b?b.innerText:tag.innerText.replace((st?st.innerText:''),'')).trim();const el=b||st;const c=el?getComputedStyle(el):null;
    return {kind,badge:b?b.className:'',state:st?st.className:'',stateText:st?st.innerText.trim():'',color:c?c.color:'',bs:c?c.borderTopStyle:''}});
  const th=[...v.querySelectorAll('#mx-actions th')].map(t=>[t.innerText.replace(/\\s+/g,' ').replace('?','').trim(),t.dataset.state||'']);
  const simCells=[...v.querySelectorAll('#mx-actions tbody tr')].map(r=>{const b=r.cells[4].querySelector('.ds-badge');return b?{t:b.innerText.trim(),cls:b.className,color:getComputedStyle(b).color,bs:getComputedStyle(b).borderTopStyle}:null});
  return {tok:{scenario:tok('scenario'),observed:tok('observed'),reforecast:tok('reforecast')},nodes,th,simCells,
    tablesNoDs:[...v.querySelectorAll('table')].filter(t=>!t.classList.contains('ds-table')).length,
    inlineStyle:[...v.querySelectorAll('[style]')].map(e=>e.getAttribute('style')).filter(s=>!/^width:[\\d.]+%$/.test(s)),
    causal:/\\bcaus[oó]\\b/i.test(v.innerText),
    consist:[...v.querySelectorAll('#mx-actions .pill, #mx-learn .pill')].map(e=>e.innerText.trim()),
    learnHeads:[...v.querySelectorAll('#mx-learn h4')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()),
    mxNote:/no establece causalidad/i.test(v.innerText)}}"""
PROBE_N = """()=>{
  const v=document.getElementById('view-narrativa'), r=getComputedStyle(document.documentElement);
  const tok=k=>{const i=document.createElement('i');i.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(i);return getComputedStyle(i).color};
  const claims=[...v.querySelectorAll('#nx-sections .claim__row')].map(row=>{const b=row.firstElementChild;const c=getComputedStyle(b);return {t:b.innerText.trim(),cls:b.className,color:c.color,bg:c.backgroundColor,radius:c.borderTopLeftRadius,bl:c.borderLeftWidth+' '+c.borderLeftStyle}});
  const stateR=(()=>{const e=document.createElement('span');e.className='ds-badge ds-badge--actual';document.body.appendChild(e);return getComputedStyle(e).borderTopLeftRadius})();
  return {tok:{fact:tok('fact'),driver:tok('driver'),signal:tok('signal'),hyp:tok('hyp')},claims,stateR,
    summary:(v.querySelector('#nx-summary .narrative-summary')||{innerText:''}).innerText.length,
    why:v.querySelectorAll('#nx-sections details.claim__why').length,
    tablesNoDs:[...v.querySelectorAll('table')].filter(t=>!t.classList.contains('ds-table')).length,
    inlineStyle:[...v.querySelectorAll('[style]')].map(e=>e.getAttribute('style')),
    noAI:/Cohere/.test(v.innerText), causal:/\\bcaus[oó]\\b/i.test(v.querySelector('#nx-sections').innerText),
    nextStep:[...v.querySelectorAll('#nx-sections h4')].map(h=>h.innerText.trim())}}"""
async def snap(q, R):
    R['tables'] = json.loads(TS.sub('<ts>', json.dumps(await q.evaluate(TABLES, 'view-' + VIEW))))
    R['controls'] = await q.evaluate(CTRL, 'view-' + VIEW); R['text'] = TS.sub('<ts>', await q.evaluate(TEXT, 'view-' + VIEW))
    R['unnamed'] = await q.evaluate(UNNAMED, 'view-' + VIEW)
async def main():
    port = serve(); url = f'http://127.0.0.1:{port}/index.html'; R = {'overflow': {}}; errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        for w in (1280, 768, 390):
            c = await b.new_context(viewport={'width': w, 'height': 900}); q = await c.new_page()
            q.on('pageerror', lambda e: errs.append(str(e))); q.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            st = await prepare(q, url)
            if st != 'ok': errs.append('prepare: ' + str(st))
            await q.goto(url + '#' + VIEW); await q.wait_for_timeout(700)
            if w == 1280:
                await snap(q, R); R['probe'] = await q.evaluate({'recovery': PROBE, 'medir': PROBE_M, 'narrativa': PROBE_N}[VIEW])
                if VIEW in ('recovery', 'narrativa'):
                  await q.evaluate("window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})()")
                  await q.click('[data-action="rc-export"]' if VIEW == 'recovery' else '[data-action="nx-export"]'); await q.wait_for_timeout(500)
                  R['export'] = [hashlib.md5(TS.sub('<ts>', TIME_KEYS.sub('', x).replace('Sales Navigator', 'RevNavigator')).encode()).hexdigest() for x in await q.evaluate("window.__dl.map(x=>x[1])")]
            R['overflow'][str(w)] = await q.evaluate("document.documentElement.scrollWidth-window.innerWidth")
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True); await q.screenshot(path=f'{SHOTS}/{VIEW}_data_{w}.png', full_page=True)
            await c.close()
        await b.close()
    R['errors'] = errs[:8]; json.dump(R, open(OUT, 'w'), ensure_ascii=False); print('ok', OUT)
asyncio.run(main())
