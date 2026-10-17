"""Menú y controles: cada vista tiene un acceso coherente y único, el menú marca la sección activa, y TODO control visible es funcional,
está deshabilitado de forma explícita o se reporta (inventario). Uso: python3 -I batch_controles.py <raiz> [--inventario]."""
import asyncio, sys, os, re, json, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:600] if d and not ok else ''))
    if not ok: fails.append(n)
VIEWS = sorted(set(re.findall(r'data-view="([a-z0-9_-]+)"', open(os.path.join(ROOT, 'index.html')).read())))
INV = """(actions)=>{
  const out=[]; const vis=(e)=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'};
  const main=document.querySelector('main:not([hidden])')||document.body;
  document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit],summary,select,input:not([type=hidden]),textarea').forEach(e=>{
    if(!vis(e))return;
    const tag=e.tagName.toLowerCase(); const act=e.dataset&&e.dataset.action; const href=e.getAttribute('href');
    const name=(e.getAttribute('aria-label')||e.innerText||e.getAttribute('title')||e.getAttribute('placeholder')||e.id||'').trim().slice(0,50);
    let kind='funcional', why='';
    if(act==='data-page'||e.dataset.page!==undefined){kind='funcional'} else if(e.disabled||e.getAttribute('aria-disabled')==='true'){
      const lab=(e.getAttribute('aria-label')||'')+(e.getAttribute('title')||'')+' '+(e.innerText||'');
      if(/pr[oó]ximamente|pr[oó]xima|no disponible|sin datos|falta|requiere|importa|carga|elige|selecciona|corrige|aún|todav|bloquead|ya |primero|sin |no hay|completa|procesando|guardando/i.test(lab)||e.closest('[data-disabled-explained]')) kind='deshabilitado explícito';
      else kind='deshabilitado sin explicación';
    } else if(tag==='a'){
      if(e.dataset.skip){kind='funcional'} else if(!href||href==='#') {kind='roto';why='enlace sin destino';}
      else if(href.startsWith('#')&&!e.dataset.skip){const v=href.slice(1); if(!document.querySelector('[data-view="'+v+'"]')&&!document.getElementById(v)&&!document.getElementById('view-'+v)){kind='roto';why='destino inexistente '+href}}
    } else if(tag==='summary'||tag==='select'||tag==='input'||tag==='textarea'){ kind='funcional'; if((tag==='input'||tag==='select'||tag==='textarea')&&!act&&!e.id&&!e.name&&!Object.keys(e.dataset).length&&!e.closest('label')) {kind='decorativo?';why='campo sin id/acción'} }
    else if(act){ if(!(act in actions)){kind='roto';why='acción inexistente '+act} }
    else if(e.getAttribute('data-nav')||e.getAttribute('aria-expanded')!==null||e.getAttribute('aria-controls')||e.getAttribute('role')==='tab'||e.closest('[data-delegate]')) kind='funcional';
    else if(tag==='button'&&e.type==='submit'&&e.form){kind='funcional'}
    else { kind='decorativo?'; why='botón sin data-action ni destino'; }
    if(kind!=='funcional') out.push({tag,name,kind,why,act:act||null,view:location.hash});
  });
  return out;}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        for wd in (1280, 375):
            q = await (await b.new_context(viewport={'width': wd, 'height': 900 if wd > 400 else 740})).new_page()
            q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None)
            await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
            await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
            await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1200)
            if wd == 1280:
                # --- menú: cada vista con acceso coherente y único
                nav = await q.evaluate("""(()=>{const links=[...document.querySelectorAll('#app-nav a[data-nav]')].map(a=>a.dataset.nav);const V=Object.keys(FP.guidanceConfig.VIEWS);const G=FP.guidanceConfig.GROUPS;
                  const inGroups=G.flatMap(g=>g.views);return {links,V,inGroups,dupLinks:links.filter((v,i)=>links.indexOf(v)!==i),dupGroups:inGroups.filter((v,i)=>inGroups.indexOf(v)!==i),
                  noGroup:V.filter(v=>!inGroups.includes(v)&&!['ajustes','ayuda','negocio'].includes(v)),orphanLinks:links.filter(v=>!V.includes(v)),groupOfMissing:V.filter(v=>!FP.guidanceConfig.VIEWS[v].group)}})()""")
                chk('MN-1 ninguna vista aparece dos veces en el menú (ni en grupos ni en enlaces)', not nav['dupLinks'] and not nav['dupGroups'], nav)
                chk('MN-2 toda vista definida pertenece a un grupo del menú o a los accesos fijos (Configuración, Ayuda)', not nav['noGroup'] and not nav['groupOfMissing'], nav)
                chk('MN-3 ningún enlace del menú apunta a una vista que no existe', not nav['orphanLinks'], nav['orphanLinks'])
                miss = await q.evaluate("(()=>{const V=Object.keys(FP.guidanceConfig.VIEWS);return V.filter(v=>v!=='negocio'&&!document.querySelector('[data-view=\"'+v+'\"]'))})()"); neg = await q.evaluate("!!document.getElementById('st-negocio')"); chk('MN-4b «negocio» vive como sección dentro de Configuración', neg)
                chk('MN-4 toda vista tiene su sección en la página', not miss, miss)
                reach = await q.evaluate("(()=>{const V=Object.keys(FP.guidanceConfig.VIEWS);return V.filter(v=>!document.querySelector('#app-nav a[data-nav=\"'+v+'\"]'))})()")
                print('  (vistas sin enlace propio en el menú:', reach, ')')
                # sección activa
                bad = []
                for v in ['inicio', 'carga', 'calidad', 'pacing', 'diagnostico', 'recovery', 'medir', 'ajustes', 'ayuda']:
                    await q.evaluate(f"location.hash='#{v}'"); await q.wait_for_timeout(450)
                    cur = await q.evaluate("(()=>{const a=document.querySelector('#app-nav [aria-current=page]');return a?a.dataset.nav:null})()")
                    if cur != v: bad.append([v, cur])
                chk('MN-5 el menú marca la vista activa en cada pantalla principal', not bad, bad)
            # inventario de controles por vista
            inv = []
            for v in VIEWS:
                await q.evaluate(f"location.hash='#{v}'"); await q.wait_for_timeout(500)
                inv += await q.evaluate(INV, await q.evaluate("(()=>{const o={};Object.keys(FP.app.actions).forEach(k=>o[k]=1);return o})()"))
            seen = {}
            for i in inv: seen[(i['view'], i['tag'], i['name'], i['kind'], i['why'])] = i
            inv = list(seen.values())
            broken = [i for i in inv if i['kind'] == 'roto']; deco = [i for i in inv if i['kind'] == 'decorativo?']; noexp = [i for i in inv if i['kind'] == 'deshabilitado sin explicación']; exp = [i for i in inv if i['kind'] == 'deshabilitado explícito']
            print(f'  [{wd}px] inventario: {len(broken)} rotos, {len(deco)} decorativos?, {len(noexp)} deshabilitados sin explicación, {len(exp)} deshabilitados explícitos')
            if '--inventario' in sys.argv:
                for i in broken + deco + noexp: print('   ', json.dumps(i, ensure_ascii=False))
            chk(f'CT-1 [{wd}px] ningún control visible está roto (enlace sin destino, acción inexistente)', not broken, broken[:8])
            chk(f'CT-2 [{wd}px] ningún botón parece activo sin hacer nada (decorativo)', not deco, deco[:8])
            chk(f'CT-3 [{wd}px] los controles deshabilitados dicen por qué o que son futuros', not noexp, noexp[:8])
            ov = await q.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
            chk(f'CT-4 [{wd}px] sin desborde horizontal al terminar el recorrido', ov is False)
            if wd == 1280:
                fut = await q.evaluate("""(()=>{const s=document.querySelector('input[type=search][disabled]');const n=[...document.querySelectorAll('button[disabled]')].find(b=>/Notificaciones/.test(b.getAttribute('aria-label')||''));
                  return {search:s&&s.getAttribute('aria-label'),notif:n&&n.getAttribute('aria-label')}})()""")
                chk('CT-5 búsqueda global y notificaciones están deshabilitadas y marcadas «próximamente»', fut['search'] and 'próximamente' in fut['search'] and fut['notif'] and 'próximamente' in fut['notif'], fut)
        chk('CT-6 sin errores de consola ni de página', not errs, errs[:5])
        await b.close()
    print('RESULTADO batch_controles:', 'OK' if not fails else 'FALLAS: ' + ', '.join(fails))
asyncio.run(main())
