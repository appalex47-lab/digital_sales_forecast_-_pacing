"""Pasada de diseño: Calidad de datos y Tráfico y conversión. Uso: python3 batch_ae.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
ROOT=os.path.abspath(sys.argv[1])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
h=functools.partial(Q,directory=ROOT);socketserver.TCPServer.allow_reuse_address=True
s=socketserver.ThreadingTCPServer(('127.0.0.1',0),h);threading.Thread(target=s.serve_forever,daemon=True).start();port=s.server_address[1]
SPEC={('dispositivo','Móvil'):{9:(60000,600,1000),8:(60000,800,1000)},('dispositivo','Escritorio'):{9:(35000,1050,1200),8:(35000,850,1200)},('dispositivo','Tableta'):{9:(4000,200,900),8:(4000,200,900)},('dispositivo','Smart TV'):{9:(200,20,900),8:(200,20,900)},
 ('campaña','buen_fin'):{9:(30000,500,1100),8:(30000,520,1100)},('campaña','(not set)'):{9:(8000,150,1100),8:(8000,150,1100)},('campaña','otoño'):{9:(20000,300,1000),8:(20000,330,1000)},
 ('tipo_cliente','Nuevo'):{9:(70000,700,1000),8:(50000,500,1000)},('tipo_cliente','Recurrente'):{9:(29200,1170,1100),8:(49200,1970,1100)}}
def days(m): return [dt.date(2026,9,1)+dt.timedelta(d) for d in range(30)] if m==9 else [dt.date(2026,8,2)+dt.timedelta(d) for d in range(30)]
rows=['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume']
for (dim,seg),per in SPEC.items():
    for m,(ses,ped,aov) in per.items():
        for i,d in enumerate(days(m)):
            sd=ses//30+(1 if i<ses%30 else 0);pd_=ped//30+(1 if i<ped%30 else 0)
            rows.append(f'{d.isoformat()},ecommerce,{dim},{seg},{pd_*aov},{pd_},{sd}')
CSV='\n'.join(rows)+'\n'
REAL='fecha,canal,venta,pedidos,traffic_volume\n'+'\n'.join(f'2026-09-{d:02d},{ch},{"-500" if (d==3 and ch=="ecommerce") else 1000+d},{10+d},{1000+d}' for d in range(1,31) for ch in ('ecommerce','app','whatsapp','llamadas') if not (d in (8,9) and ch=='llamadas'))+'\n'
async def up(q,u,dtype,name,text):
    await q.goto(u+'#carga');await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{dtype}"]',state='attached')
    await q.set_input_files(f'input[data-action="pick-files"][data-type="{dtype}"]',files=[{'name':name,'mimeType':'text/csv','buffer':text.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])',timeout=60000);await q.click('[data-action="commit-staged"]')
    await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0",timeout=60000)
fails=[]
def chk(n,ok,d=''):
    print(('✔ ' if ok else '✘ ')+n+(' — '+str(d) if d and not ok else ''))
    if not ok: fails.append(n)
CLEAN='fecha,canal,venta,pedidos,traffic_volume\n'+'\n'.join(f'2026-09-{d:02d},{ch},{1000+d},{10+d},{1000+d}' for d in range(1,31) for ch in ('ecommerce','app','whatsapp','llamadas'))+'\n'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']);errs=[]
        # ---------- datos limpios: la salud sí llega a 100 ----------
        c=await b.new_context(viewport={'width':1280,'height':900});q=await c.new_page();q.on('pageerror',lambda e:errs.append(str(e)))
        await q.clock.set_fixed_time(dt.datetime(2026,10,2,9,0));u=f'http://127.0.0.1:{port}/index.html';await q.goto(u)
        await up(q,u,'actual','limpio.csv',CLEAN);await q.goto(u+'#calidad');await q.wait_for_timeout(600)
        h=await q.evaluate("FP.dataHealth.overview(FP.app.state.store).score");t=await q.evaluate("document.getElementById('quality-health').innerText")
        chk('C-1 con datos sin incidencias la salud general es 100 y la tarjeta dice «Sin incidencias»',h==100 and 'Sin incidencias' in t,(h,t[:200]))
        await c.close()
        # ---------- datos con incidencias ----------
        c=await b.new_context(viewport={'width':1280,'height':900});q=await c.new_page();q.on('pageerror',lambda e:errs.append(str(e)))
        await q.clock.set_fixed_time(dt.datetime(2026,10,2,9,0));await q.goto(u)
        await up(q,u,'actual','real.csv',REAL);await up(q,u,'segments','seg.csv',CSV)
        await q.goto(u+'#calidad');await q.wait_for_timeout(700)
        ov=await q.evaluate("FP.dataHealth.overview(FP.app.state.store)")
        parts=[x['score'] for x in ov['collections']];raw=sum(parts)/len(parts)
        chk(f"C-2 con incidencias la salud general nunca es 100: promedio {raw:.1f} → {ov['score']} (antes se redondeaba a 100)",ov['score']<100 and ov['score']==min(99,round(raw)),(ov['score'],parts))
        card=await q.evaluate("[...document.querySelectorAll('.dhealth__card')].map(c=>({t:c.querySelector('.dhealth__title').innerText,lost:[...c.querySelectorAll('.dhealth__list li')].map(x=>x.innerText.slice(0,40)),ok:!!c.querySelector('.dhealth__ok'),det:c.querySelector('details').open}))")
        chk('C-3 la tarjeta con incidencias lista solo lo que bajó puntos (Consistencia, Temporalidad, Registros válidos) y deja el detalle plegado',any(len(x['lost'])==3 and x['lost'][0].startswith('Consistencia') and not x['det'] for x in card),card)
        chk('C-3 la tarjeta de Segmentos dice «los 6 componentes están en 100» (no 7)',any(x['ok'] for x in card) and 'los 6 componentes están en 100' in await q.evaluate("document.getElementById('quality-health').innerText"))
        cov=await q.evaluate("document.querySelector('#quality-coverage').innerText")
        chk('C-4 Cobertura abre en la primera colección con datos (Venta real), no en «Histórico sin datos»','sin datos' not in cov.split('\n')[0].lower() and 'Venta real' in cov,cov[:160])
        prob=await q.evaluate("document.getElementById('quality-issues').innerText")
        chk('C-5 «Problemas por tipo» dice «En cuarentena» para la venta negativa (no «Error»)','En cuarentena' in prob and 'Venta negativa' in prob and 'Error' not in prob.replace('Errores',''),prob[:200])
        page=await q.evaluate("document.getElementById('view-calidad').innerText")
        import re
        bad=re.findall(r'\b1 (celdas|registros|filas|fechas|valores)\b',page)
        chk('C-6 plurales: ninguna pantalla de Calidad dice «1 celdas», «1 registros», «1 filas», «1 fechas» o «1 valores»',not bad,bad)
        an=await q.evaluate("document.querySelector('.analyses__sum').innerText")
        chk('C-7 «Qué puedes analizar» resume cuántos análisis hay disponibles, limitados y sin información','de 13' in an and 'análisis disponibles' in an,an)
        await c.close()
        # ---------- Tráfico y conversión ----------
        c=await b.new_context(viewport={'width':1280,'height':900});q=await c.new_page();q.on('pageerror',lambda e:errs.append(str(e)))
        await q.clock.set_fixed_time(dt.datetime(2026,10,2,9,0));await q.goto(u)
        await up(q,u,'actual','real.csv',REAL);await up(q,u,'segments','seg.csv',CSV)
        await q.goto(u+'#segmentos');await q.wait_for_timeout(500)
        for k,v in (('periodType','month'),('periodKey','2026-09'),('channel','total')):
            await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})");await q.wait_for_timeout(150)
        await q.select_option('#sg-dim','device');await q.wait_for_timeout(500)
        nav=await q.evaluate("[...document.querySelectorAll('.sgnav a')].map(a=>[a.innerText,a.dataset.sgjump,!!document.getElementById(a.dataset.sgjump)])")
        chk('S-1 la navegación por secciones tiene 8 botones (uno por tarjeta, con «Qué explica el cambio» y «Todas las dimensiones» al inicio) y cada uno apunta a una tarjeta que existe',len(nav)==8 and [x[1] for x in nav][:2]==['sg-dec','sg-dims'] and all(x[2] for x in nav),nav)   # rediseño: antes 9 enlaces, uno por sección
        await q.click('.sgnav a[data-sgjump="sg-opp"]');await q.wait_for_timeout(900)
        pos=await q.evaluate("(()=>{const r=document.getElementById('sg-opp').getBoundingClientRect();return [Math.round(r.top),document.activeElement&&document.activeElement.id,location.hash]})()")
        chk('S-1 al pulsar «Oportunidad» la página se desplaza hasta esa tarjeta, el foco queda en ella y el hash de la app no cambia',pos[0]<220 and pos[1]=='sg-opp' and pos[2]=='#segmentos',pos)
        hl=await q.evaluate("[...document.querySelectorAll('.sghl__item strong')].map(x=>x.innerText)")
        chk('S-2 los nombres de segmento de las frases van en negritas (Móvil, Tableta, Escritorio)',{'Móvil','Tableta','Escritorio'}<=set(hl),hl)
        tab=await q.evaluate("document.getElementById('sg-table').innerText")
        chk('S-3 un cambio de cero se muestra «0.0 %» y «0.00 pp», sin «+0.0 %» ni «+0.00 pp»','+0.0 %' not in tab and '+0.00 pp' not in tab and '−0.0 %' not in tab and '0.0 %' in tab,tab[:300])
        mp=await q.evaluate("[...document.querySelectorAll('.sgmap__val')].map(t=>t.textContent)")
        chk('S-4 el mapa rotula el valor de sus dos líneas de referencia («promedio 33.3 %» y «CR del total 1.89 %»)',any(t.startswith('promedio') for t in mp) and any(t.startswith('CR del total') for t in mp),mp)
        bad=[]
        for w in (1920,1280,1100,768,390,320):
            await q.set_viewport_size({'width':w,'height':900});await q.wait_for_timeout(250)
            r=await q.evaluate("({doc:document.documentElement.scrollWidth-innerWidth,nav:[...document.querySelectorAll('.sgnav a')].map(a=>Math.round(a.getBoundingClientRect().height))})")
            if r['doc']>0 or (w<=760 and min(r['nav'])<44):bad.append((w,r))
        chk('S-5 sin desborde de 320 a 1920 px y enlaces de navegación de al menos 44 px de alto en móvil',not bad,bad)
        chk('Sin errores de página',not errs,errs[:2])
        await b.close()
    print('\nRESULTADO batch_ac:','OK' if not fails else 'FALLAS: '+'; '.join(fails));sys.exit(1 if fails else 0)
asyncio.run(main())
