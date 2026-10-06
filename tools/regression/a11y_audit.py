"""Etapa J · Auditoría de accesibilidad y coherencia visual sobre las 17 vistas con datos de prueba.
Uso: python3 a11y_audit.py <raiz> <salida.json>   Mide (sin modificar la app):
  contraste real (color de texto vs fondo efectivo, AA 4.5:1 o 3:1 si es texto grande), foco visible con teclado (contorno ≥ 2 px),
  objetivos táctiles en 390 px, estructura (skip-link, regiones, encabezados, título, idioma), regiones aria-live,
  elementos que dependen solo del color y coherencia de tipografía y radios."""
import asyncio, json, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT, OUT = os.path.abspath(sys.argv[1]), sys.argv[2]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','producto','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda','ajustes']
CONTRAST = """()=>{
 const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p.length>3?p[3]:1]};
 const over=(f,b)=>[f[0]*f[3]+b[0]*(1-f[3]),f[1]*f[3]+b[1]*(1-f[3]),f[2]*f[3]+b[2]*(1-f[3]),1];
 const lum=c=>{const a=[c[0],c[1],c[2]].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*a[0]+.7152*a[1]+.0722*a[2]};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const bgOf=e=>{let stack=[];let n=e;let hasImg=false;while(n&&n.nodeType===1){const cs=getComputedStyle(n);if(cs.backgroundImage&&cs.backgroundImage!=='none')hasImg=true;const c=parse(cs.backgroundColor);if(c&&c[3]>0){stack.push(c);if(c[3]>=1)break}n=n.parentElement}
   let base=[255,255,255,1];for(let i=stack.length-1;i>=0;i--)base=over(stack[i],base);return {bg:base,img:hasImg}};
 const out=[];const seen=new Set();
 const label=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.toString().trim()?'.'+e.className.toString().trim().split(/\\s+/).slice(0,2).join('.'):'');
 const root=document.querySelector('.app-main:not([hidden])');
 const scope=[document.querySelector('.app-header'),document.getElementById('app-nav'),document.getElementById('ux-context'),root,document.getElementById('tour-bar'),document.querySelector('.app-footer')].filter(Boolean);
 scope.forEach(sc=>sc.querySelectorAll('*').forEach(e=>{
  const own=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
  if(!own)return;const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return;const cs=getComputedStyle(e);
  if(cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0')return;
  if(e.closest('[disabled],:disabled,[aria-disabled="true"],[hidden]'))return;
  const fg=parse(cs.color);if(!fg)return;const b=bgOf(e);if(b.img)return;const f=fg[3]<1?over(fg,b.bg):fg;
  const size=parseFloat(cs.fontSize),wt=parseInt(cs.fontWeight)||400;const large=size>=24||(size>=18.66&&wt>=700);const need=large?3:4.5;
  const cr=ratio(f,b.bg);if(cr+0.005<need){const k=label(e)+'|'+cs.color+'|'+b.bg.map(Math.round).join(',');if(seen.has(k))return;seen.add(k);
   out.push({el:label(e),text:own.slice(0,40),fg:cs.color,bg:'rgb('+b.bg.slice(0,3).map(Math.round).join(',')+')',ratio:+cr.toFixed(2),need,size,wt})}}));
 return out}"""
STRUCT = """()=>{const H=[...document.querySelectorAll('.app-main:not([hidden]) h1,.app-main:not([hidden]) h2,.app-main:not([hidden]) h3,.app-main:not([hidden]) h4')].filter(e=>e.getBoundingClientRect().height>0).map(e=>+e.tagName[1]);
 let skips=0;for(let i=1;i<H.length;i++)if(H[i]>H[i-1]+1)skips++;
 const first=[...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].find(e=>!e.disabled&&e.tabIndex>=0&&e.getBoundingClientRect().width>0||e.matches('.skip-link'));
 return {lang:document.documentElement.lang,title:document.title,h1Doc:document.querySelectorAll('h1').length,headings:H,levelSkips:skips,
  skip:(()=>{const a=document.querySelector('a.skip-link,a[href="#main-content"]');return a?{text:a.innerText.trim(),href:a.getAttribute('href'),firstTab:a===first,target:!!document.querySelector(a.getAttribute('href'))||a.hasAttribute('data-skip')}:null})(),
  landmarks:{header:document.querySelectorAll('header').length,nav:document.querySelectorAll('nav').length,main:[...document.querySelectorAll('main')].filter(m=>!m.hidden).length,mainAll:document.querySelectorAll('main').length,footer:document.querySelectorAll('footer').length},
  navsSinNombre:[...document.querySelectorAll('nav')].filter(n=>n.getBoundingClientRect().height>0&&!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')).length,navNames:[...document.querySelectorAll('nav')].filter(n=>n.getBoundingClientRect().height>0).map(n=>n.getAttribute('aria-label')||'?'),
  live:[...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e=>(e.id||e.className||e.tagName)+':'+(e.getAttribute('aria-live')||e.getAttribute('role')))}}"""
FOCUS = """()=>{const els=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex="0"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.disabled&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden]')});
 const bad=[];let n=0;for(const e of els.slice(0,400)){e.focus({preventScroll:true});if(document.activeElement!==e)continue;n++;const c=getComputedStyle(e);const ow=parseFloat(c.outlineWidth)||0;const vis=c.outlineStyle!=='none'&&ow>=2;const sh=c.boxShadow&&c.boxShadow!=='none';
  if(!vis&&!sh){bad.push([e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.toString().trim()?'.'+e.className.toString().trim().split(/\\s+/)[0]:''),c.outlineStyle,c.outlineWidth,(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,24)])}}
 return {tested:n,bad:bad.slice(0,12),badN:bad.length}}"""
TOUCH = r"""()=>{const out=[];const sel='button,summary,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),[role=button],[role=switch],a.btn,a.snav__item,a.hstatus__link,a.icon-btn,.help-dot,label.btn,label.switch';
 const closedDet=e=>{const d=e.closest('details:not([open])');return d&&!(e.matches('summary')&&e.parentElement===d)};
 const seen={};
 document.querySelectorAll(sel).forEach(e=>{if(e.disabled||e.closest('[hidden]')||closedDet(e))return;let r=e.getBoundingClientRect();if(r.width<1||r.height<1)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden')return;
  if(r.width>=43.5&&r.height>=43.5)return;
  const key=e.tagName+'.'+(e.className&&e.className.toString().split(/\s+/)[0]);seen[key]=(seen[key]||0)+1;if(seen[key]>4)return;   // hasta 4 por tipo y vista
  e.scrollIntoView({block:'center',inline:'center'});r=e.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;
  let clip=null;{let p=e.parentElement;while(p&&p!==document.body){const c=getComputedStyle(p);if(['auto','scroll','hidden','clip'].includes(c.overflowX)||['auto','scroll','hidden','clip'].includes(c.overflowY)){clip=p.getBoundingClientRect();break}p=p.parentElement}}
  const pts=[];if(r.width<43.5){pts.push([cx-21,cy],[cx+21,cy])}if(r.height<43.5){pts.push([cx,cy-21],[cx,cy+21])}
  // un punto fuera del contenedor con desplazamiento no cuenta: ahí el control queda a una distancia del borde que se resuelve desplazando (el barrido pide holgura en la primera y la última columna)
  const ok=pts.every(([x,y])=>{if(x<0||y<0||x>innerWidth||y>innerHeight)return true;if(clip&&(x<clip.left||x>clip.right||y<clip.top||y>clip.bottom))return true;const t=document.elementFromPoint(x,y);return t&&(t===e||e.contains(t))});
  if(!ok)out.push([e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.toString().trim()?'.'+e.className.toString().trim().split(/\\s+/)[0]:''),Math.round(r.width),Math.round(r.height),(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,22)])});return out}"""
COLORONLY = """()=>{const out=[];document.querySelectorAll('.pill,.chip,.state-tag,.ds-badge,[class*="badge"]').forEach(e=>{const r=e.getBoundingClientRect();if(r.width<1||e.closest('details:not([open])'))return;if(!(e.innerText||'').trim()&&!e.getAttribute('aria-label'))out.push(['sin texto',e.className.toString().slice(0,40)])});
 document.querySelectorAll('.channel-dot,.legend__swatch,.dot,[class*="swatch"]').forEach(e=>{const r=e.getBoundingClientRect();if(r.width<1)return;const p=e.parentElement;const txt=(p.innerText||'').trim();if(!txt&&!e.getAttribute('title')&&!e.getAttribute('aria-label'))out.push(['solo color',e.className.toString().slice(0,40)])});
 return out}"""
STYLES = """()=>{const fs={},rad={};document.querySelectorAll('.app-main:not([hidden]) *, #ux-context *, .app-header *, #app-nav *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return;const cs=getComputedStyle(e);
  if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){fs[cs.fontSize]=(fs[cs.fontSize]||0)+1}
  const br=cs.borderTopLeftRadius;if(br&&br!=='0px')rad[br]=(rad[br]||0)+1});return {fs,rad}}"""
async def main():
    R = {'views': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        CONF = [(1280, 'analyst'), (1280, 'learner'), (390, 'analyst')]
        if os.environ.get('A11Y_ONLY'): CONF = [c for c in CONF if str(c[0]) == os.environ['A11Y_ONLY']]   # p. ej. A11Y_ONLY=390 para repetir solo lo táctil
        for (w, mode) in CONF:
            q = await b.new_page(viewport={'width': w, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
            await prepare(q, u)
            if mode == 'learner': await q.evaluate("FP.app.actions['ux-mode']({dataset:{value:'learner'}})"); await q.wait_for_timeout(300)
            for v in VIEWS:
                await q.goto(u + '#' + v); await q.wait_for_timeout(500)
                await q.evaluate("(id)=>{const m=document.getElementById('view-'+id);if(m)m.querySelectorAll('details').forEach(d=>d.open=true)}", v)   # los desplegables se miden abiertos
                await q.keyboard.press('Tab')   # modalidad de teclado: aplica :focus-visible
                d = {'contrast': await q.evaluate(CONTRAST), 'focus': await q.evaluate(FOCUS)}
                if mode == 'analyst' and w == 1280: d['struct'] = await q.evaluate(STRUCT); d['coloronly'] = await q.evaluate(COLORONLY); d['styles'] = await q.evaluate(STYLES)
                if w == 390: d['touch'] = await q.evaluate(TOUCH)
                R['views'][f'{v}|{w}|{mode}'] = d
            await q.close()
        await b.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False); print('ok', OUT)
asyncio.run(main())
