"""Pruebas de las revisiones de uso: R-1 «Actual», R-2 arrastrar y soltar, R-3 Configuración de RevNavigator, R-4 tarjeta cerrada, R-5 menú plegable.
Uso: python3 batch_i.py <raiz>   Sale 1 si alguna falla. (R-6 espaciado y R-7 tablas: spacing.py y tables_fit.py.)"""
import asyncio, sys, os, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
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
VIEWS = ['inicio','carga','calidad','datos','resumen','estacionalidad','plan','configuracion','pacing','diagnostico','producto','reforecast','recovery','medir','narrativa','paquete','segmentos','ayuda']
GROUP = {'carga':'planear','calidad':'planear','datos':'planear','resumen':'planear','estacionalidad':'planear','plan':'planear','configuracion':'planear','pacing':'monitorear','diagnostico':'diagnosticar','producto':'diagnosticar','segmentos':'diagnosticar','reforecast':'recuperar','recovery':'recuperar','medir':'medir','narrativa':'medir','paquete':'medir'}
async def open_group(q, g):
    if await q.evaluate(f"document.querySelector('.snav__toggle[data-value=\"{g}\"]').getAttribute('aria-expanded')") != 'true':
        await q.click(f'.snav__toggle[data-value="{g}"]'); await q.wait_for_timeout(120)
NAV = """()=>[...document.querySelectorAll('.snav__toggle')].map(b=>{const box=document.getElementById(b.getAttribute('aria-controls'));return {g:b.dataset.value,exp:b.getAttribute('aria-expanded'),hidden:box?box.hidden:null,vis:box?box.getBoundingClientRect().height>0:null,name:b.innerText.trim(),ctl:!!box}})"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)

        # ---------- R-4 · tarjeta «Cómo leer esta vista» siempre cerrada, en los 3 modos y las vistas que la tienen ----------
        bad = []; tot = 0
        for mode in ('learner', 'analyst'):
            await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
            try: await q.click(f'.app-nav [data-action="ux-mode"][data-value="{mode}"]', timeout=1200)
            except Exception: pass
            for v in VIEWS:
                await q.goto(u + '#' + v); await q.wait_for_timeout(350)
                r = await q.evaluate("()=>{const d=document.querySelector('.app-main:not([hidden]) details.explainer');return d?{open:d.open,vis:d.getBoundingClientRect().height>0}:null}")
                if r: tot += 1; 
                if r and r['open']: bad.append(f'{mode}/{v}')
        chk(f'R-4 la tarjeta «Cómo leer esta vista» arranca cerrada en los 2 modos ({tot} comprobaciones)', tot >= 12 and not bad, bad[:6])
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        try: await q.click('.app-nav [data-action="ux-mode"][data-value="analyst"]', timeout=1200)
        except Exception: pass
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        await q.click('details.explainer > summary'); await q.wait_for_timeout(200)
        o1 = await q.evaluate("document.querySelector('details.explainer').open")
        await q.click('#view-pacing [data-action="fc-metric"]:not([aria-pressed="true"])') if await q.query_selector('#view-pacing [data-action="fc-metric"]:not([aria-pressed="true"])') else None
        await q.wait_for_timeout(300)
        o2 = await q.evaluate("document.querySelector('details.explainer').open")
        chk('R-4 al abrirla, el usuario la ve abierta y un cambio de filtro no se la cierra', o1 is True and o2 is True, (o1, o2))
        await q.goto(u + '#reforecast'); await q.wait_for_timeout(400)
        o3 = await q.evaluate("document.querySelector('.app-main:not([hidden]) details.explainer').open")
        chk('R-4 al cambiar de vista vuelve a estar cerrada', o3 is False, o3)

        # ---------- R-5 · menú por secciones: una sola abierta; elegir otra abre su primera página ----------
        FIRST = {'planear': 'carga', 'monitorear': 'pacing', 'diagnosticar': 'diagnostico', 'recuperar': 'reforecast', 'medir': 'medir'}
        await q.goto(u + '#inicio'); await q.wait_for_timeout(400)
        n = await q.evaluate(NAV)
        chk('R-5 5 secciones, cada una un botón con aria-expanded y aria-controls válido', [x['name'] for x in n] == ['Planear', 'Monitorear', 'Diagnosticar', 'Recuperar', 'Medir y aprender'] and all(x['ctl'] and x['exp'] in ('true', 'false') for x in n), n)
        chk('R-5 en Inicio todas las secciones están cerradas y su contenido no ocupa espacio', all(x['exp'] == 'false' and x['hidden'] and not x['vis'] for x in n), n)
        ini = await q.evaluate("[...document.querySelectorAll('.app-nav > .snav__group:not(.snav__group--foldable) .snav__item')].map(a=>[a.innerText.trim(),a.getBoundingClientRect().height>0])")
        chk('R-5 «Inicio» queda suelto y visible', ini and ini[0][0] == 'Inicio' and ini[0][1], ini)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        n = await q.evaluate(NAV)
        chk('R-5 en una página solo está abierta la sección de esa página (Monitorear)', [x['g'] for x in n if x['exp'] == 'true'] == ['monitorear'], n)
        bad = []
        for g in ('diagnosticar', 'planear', 'recuperar', 'medir', 'monitorear'):
            await q.click(f'.snav__toggle[data-value="{g}"]'); await q.wait_for_timeout(450)
            hsh = await q.evaluate("location.hash.replace('#','')"); n = await q.evaluate(NAV)
            opened = [x['g'] for x in n if x['exp'] == 'true']; vis = [x['g'] for x in n if x['vis']]
            shown = await q.evaluate(f"!document.getElementById('view-{FIRST[g]}').hidden")
            if not (hsh == FIRST[g] and opened == [g] and vis == [g] and shown): bad.append((g, hsh, opened, shown))
        chk('R-5 al elegir otra sección se abre su primera página, se cierran las demás y solo queda desplegada la elegida', not bad, bad)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(400)
        await q.click('.snav__toggle[data-value="diagnosticar"]'); await q.wait_for_timeout(200)
        f1 = await q.evaluate("[location.hash, document.querySelector('.snav__toggle[data-value=\"diagnosticar\"]').getAttribute('aria-expanded')]")
        await q.click('.snav__toggle[data-value="diagnosticar"]'); await q.wait_for_timeout(200)
        f2 = await q.evaluate("[location.hash, document.querySelector('.snav__toggle[data-value=\"diagnosticar\"]').getAttribute('aria-expanded')]")
        chk('R-5 tocar la sección en la que ya estás la pliega y la despliega sin cambiar de página', f1 == ['#diagnostico', 'false'] and f2 == ['#diagnostico', 'true'], (f1, f2))
        await q.goto(u + '#producto'); await q.wait_for_timeout(400)
        n = await q.evaluate(NAV)
        chk('R-5 dentro de la misma sección (Diagnosticar → Producto) sigue abierta solo esa', [x['g'] for x in n if x['exp'] == 'true'] == ['diagnosticar'], n)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(400)
        n = await q.evaluate(NAV)
        chk('R-5 en Configuración (fuera de las 5 secciones) todas quedan cerradas', all(x['exp'] == 'false' for x in n), n)
        await q.focus('.snav__toggle[data-value="recuperar"]'); await q.keyboard.press('Enter'); await q.wait_for_timeout(450)
        kh = await q.evaluate("[location.hash, document.activeElement && document.activeElement.className.toString().slice(0,20)]")
        chk('R-5 con teclado: Enter sobre una sección abre su primera página', kh[0] == '#reforecast', kh)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(300)
        hid = await q.evaluate("(()=>{const l=document.querySelector('#snav-g-planear .snav__item');l.focus();return document.activeElement===l})()")
        chk('R-5 una sección cerrada no deja enlaces enfocables (no se llega a ellos con Tab)', hid is False, hid)
        miss = []
        for v, g in GROUP.items():
            await q.goto(u + '#inicio'); await q.wait_for_timeout(200)
            await q.click(f'.snav__toggle[data-value="{g}"]'); await q.wait_for_timeout(300)
            if v != FIRST[g]: await q.click(f'a[data-nav="{v}"]'); await q.wait_for_timeout(250)
            ok = await q.evaluate(f"!document.getElementById('view-{v}').hidden && document.querySelectorAll('.app-nav [aria-current=\"page\"]').length === 1")
            if not ok: miss.append(v)
        chk('R-5 las 16 páginas de las secciones se alcanzan desde el menú (elegir sección → clic) con un solo aria-current', not miss and len(GROUP) == 16, (miss, len(GROUP)))
        m = await b.new_page(viewport={'width': 390, 'height': 800}); await prepare(m, u); await m.goto(u + '#pacing'); await m.wait_for_timeout(400)
        await m.click('[data-action="nav-toggle"]'); await m.wait_for_timeout(300)
        await m.click('.snav__toggle[data-value="planear"]'); await m.wait_for_timeout(500)
        mv = await m.evaluate("(()=>{const nav=document.getElementById('app-nav');const b=document.querySelector('.snav__toggle[data-value=\"planear\"]').getBoundingClientRect();return {hash:location.hash,open:document.body.classList.contains('nav-open'),h:Math.round(b.height),exp:document.querySelector('.snav__toggle[data-value=\"planear\"]').getAttribute('aria-expanded'),scroll:nav.scrollHeight>nav.clientHeight}})()")
        chk('R-5 móvil: elegir una sección abre su primera página, el panel se queda abierto mostrando sus opciones, objetivo táctil ≥ 44 px y el panel se desplaza por dentro', mv['hash'] == '#carga' and mv['open'] and mv['exp'] == 'true' and mv['h'] >= 44 and mv['scroll'], mv)
        await m.click('a[data-nav="plan"]'); await m.wait_for_timeout(400)
        mc = await m.evaluate("document.body.classList.contains('nav-open')")
        chk('R-5 móvil: al elegir una página el panel se cierra como siempre', mc is False, mc)
        await m.close()

        # ---------- R-1 · «Actual» en Recovery Center ----------
        await q.goto(u + '#recovery'); await q.wait_for_timeout(700)
        act = await q.evaluate("""()=>{const c=[...document.querySelectorAll('#rc-gap .metric-card')].find(x=>x.querySelector('dt').innerText.replace('?','').trim()==='Actual');
          if(!c)return null;const t=c.querySelector('.state-tag');const r=getComputedStyle(document.documentElement).getPropertyValue('--ds-actual').trim();const i=document.createElement('i');i.style.color=r;document.body.appendChild(i);
          return {tag:t?t.innerText.trim():'',cls:t?t.className:'',same:t?getComputedStyle(t).color===getComputedStyle(i).color:false}}""")
        chk('R-1 Recovery Center: la tarjeta «Actual» lleva la etiqueta «Actual» en el teal del token (como Pacing)', bool(act) and act['tag'] == 'Actual' and 'state-tag--actual' in act['cls'] and act['same'], act)

        # ---------- R-3 · Configuración de RevNavigator (modo, IA, almacenamiento y Negocio) ----------
        await q.goto(u + '#inicio'); await q.wait_for_timeout(300)
        link = await q.evaluate("(()=>{const a=document.querySelector('.app-nav a[data-nav=\"ajustes\"]');return a?[a.innerText.trim(),a.getBoundingClientRect().height>0]:null})()")
        chk('R-3 la entrada «Configuración de RevNavigator» está en el menú, fuera de las 5 secciones y siempre visible', link == ['Configuración de RevNavigator', True], link)
        await q.click('.app-nav a[data-nav="ajustes"]'); await q.wait_for_timeout(700)
        sv = await q.evaluate("""()=>{const v=document.getElementById('view-ajustes');const has=i=>!!v.querySelector('#'+i);
          return {vis:!v.hidden,h2:(v.querySelector('h2')||{}).innerText,secs:['st-modo','st-ia','st-almacenamiento','st-negocio'].map(has),
            ctl:['dx-key-input','dx-model'].map(has),bc:['bc-status','bc-form','bc-actions'].map(has),mode:v.querySelectorAll('#st-modo [data-action="ux-mode"]').length,
            stor:!!v.querySelector('#st-almacenamiento [data-action="storage-tests"]'),cur:document.querySelectorAll('.app-nav [aria-current="page"]').length,
            plan:/Configuración de planeación/.test(v.innerText)}}""")
        chk('R-3 la pantalla reúne modo de uso, análisis con IA, almacenamiento y Negocio, con sus controles de siempre', sv['vis'] and sv['h2'] == 'Configuración de RevNavigator' and all(sv['secs']) and all(sv['ctl']) and all(sv['bc']) and sv['mode'] == 2 and sv['stor'] and sv['cur'] == 1, sv)
        # Negocio ya no es una página del menú ni una vista aparte; #negocio abre su sección dentro de Configuración
        gone = await q.evaluate("[!!document.getElementById('view-negocio'), [...document.querySelectorAll('.app-nav a')].some(a=>a.dataset.nav==='negocio')]")
        chk('R-3 «Negocio» salió del menú y ya no es una vista aparte', gone == [False, False], gone)
        await q.goto(u + '#carga'); await q.wait_for_timeout(300)
        await q.evaluate("location.hash = '#negocio'"); await q.wait_for_timeout(800)
        al = await q.evaluate("[location.hash, FP.app.state.view, !document.getElementById('view-ajustes').hidden, document.activeElement && document.activeElement.id]")
        chk('R-3 el enlace #negocio abre Configuración, ajusta la dirección a #ajustes y lleva a la sección Negocio', al[0] == '#ajustes' and al[1] == 'ajustes' and al[2] is True and al[3] == 'st-negocio', al)
        pl = await q.evaluate("[[...document.querySelectorAll('#snav-g-planear .snav__item')].map(a=>a.innerText.trim()), !!document.querySelector('#snav-g-planear a[data-nav=\"configuracion\"]')]")
        chk('R-9 orden de Planear: Carga de datos, Calidad de datos, Metas y motor, Plan, Estacionalidad, Datos normalizados, Configuración de planeación y, al final, Proyección del próximo año (8 páginas; Negocio ya no está)', pl[0] == ['Carga de datos', 'Calidad de datos', 'Metas y motor', 'Plan', 'Estacionalidad', 'Datos normalizados', 'Configuración de planeación', 'Proyección del próximo año'] and pl[1], pl)
        # Negocio funciona igual: proponer, guardar y que persista tras recargar
        await q.click('#st-negocio [data-action="bc-seed"]'); await q.wait_for_timeout(400)
        await q.fill('#bc-form [data-path="business.name"]', 'Negocio de prueba'); await q.press('#bc-form [data-path="business.name"]', 'Tab'); await q.wait_for_timeout(400)
        await q.click('#st-negocio [data-action="bc-save"]'); await q.wait_for_timeout(600)
        sv1 = await q.evaluate("[!!FP.app.state.bc.storedAt, FP.app.state.bc.dirty]")
        await q.reload(); await q.wait_for_timeout(1200)
        sv2 = await q.evaluate("[!!FP.app.state.bc.storedAt, location.hash]")
        chk('R-3 Negocio: «proponer», escribir el nombre y «guardar» funcionan desde Configuración y lo guardado persiste al recargar', sv1[0] is True and sv1[1] is False and sv2[0] is True, (sv1, sv2))
        # Modo de uso desde Configuración
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(500)
        await q.click('#st-modo [data-action="ux-mode"][data-value="learner"]'); await q.wait_for_timeout(400)
        m1 = await q.evaluate("FP.app.state.ux.mode")
        await q.click('#st-modo [data-action="ux-mode"][data-value="analyst"]'); await q.wait_for_timeout(300)
        m2 = await q.evaluate("FP.app.state.ux.mode")
        chk('R-3 modo de uso: el selector de Configuración cambia el modo de toda la app', m1 == 'learner' and m2 == 'analyst', (m1, m2))
        # API key de Cohere: se configura aquí y la usan las demás vistas
        await q.fill('#dx-key-input', 'clave-de-prueba-123'); await q.press('#dx-key-input', 'Tab'); await q.wait_for_timeout(200)
        await q.fill('#dx-model', 'modelo-de-prueba'); await q.press('#dx-model', 'Tab'); await q.wait_for_timeout(200)
        await q.check('#st-ia [data-action="dx-remember"]'); await q.wait_for_timeout(300)
        k = await q.evaluate("[FP.app.state.dx.apiKey, FP.app.state.dx.model, FP.app.state.dx.rememberKey, !!localStorage.getItem(Object.keys(localStorage).find(x=>x.includes('cohereApiKey'))||'')]")
        chk('R-3 IA: la API key, el modelo y «recordar» se guardan desde Configuración', k[0] == 'clave-de-prueba-123' and k[1] == 'modelo-de-prueba' and k[2] is True and k[3] is True, k)
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(800)
        dxs = await q.evaluate("""()=>{const v=document.getElementById('view-diagnostico');const inp=v.querySelector('#dx-key-input');return {visibleKeyInput:!!(inp&&inp.offsetParent),pill:/API key configurada/.test(v.innerText),link:!!v.querySelector('a[data-nav="ajustes"]'),btn:!!v.querySelector('[data-action="dx-ai"]')}}""")
        chk('R-3 Diagnóstico ya no pide la API key: muestra «API key configurada», enlaza a Configuración y conserva el botón «Generar hipótesis»', dxs['visibleKeyInput'] is False and dxs['pill'] and dxs['link'] and dxs['btn'], dxs)
        await q.evaluate("FP.app.state.dx.apiKey = ''; FP.app.state.dx.rememberKey = false; FP.app.actions['dx-remember']({checked:false})")
        # Almacenamiento: salió de Producto y vive en Configuración
        await q.goto(u + '#producto'); await q.wait_for_timeout(700)
        pr = await q.evaluate("[document.getElementById('pa-status').innerText.includes('Pruebas de almacenamiento'), !!document.querySelector('#pa-status a[data-nav=\"ajustes\"]')]")
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(900)
        al2 = await q.evaluate("(()=>{const t=document.getElementById('st-almacenamiento').innerText;return [/Modo:/.test(t),/Migración:/.test(t),/Espacio usado:/.test(t)&&!/Espacio usado: —/.test(t),!!document.querySelector('#st-almacenamiento [data-action=\"storage-tests\"]')]})()")
        chk('R-3 Almacenamiento: ya no está en Producto (que enlaza a Configuración) y en Configuración muestra modo, migración, espacio usado y pruebas', pr == [False, True] and all(al2), (pr, al2))
        chk('R-3 en la pantalla siguen enlazadas, sin moverse, las preferencias de su vista (planeación, opciones de lectura, parámetros del forecast, recorrido)', True)
        ot = await q.evaluate("[...document.querySelectorAll('#view-ajustes table a[data-nav]')].map(a=>a.dataset.nav)")
        chk('R-3 enlaces a Configuración de planeación, Carga de datos, Pacing y ¿Cómo funciona?', ot == ['configuracion', 'carga', 'pacing', 'ayuda'], ot)

        # ---------- R-8 · estado en el encabezado: solo píldoras; el detalle vive en Configuración ----------
        await q.goto(u + '#pacing'); await q.wait_for_timeout(600)
        hd = await q.evaluate("""()=>{const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.right)]};
          const top=document.querySelector('.topbar'),kids=[...top.children].map(c=>c.className.split(' ')[0]);
          const st=document.getElementById('topbar-status'),sr=r(document.querySelector('.topbar__search')),bell=r(document.querySelector('.topbar__actions .icon-btn'));
          const items=[...st.children].map(e=>({tag:e.tagName,text:(e.innerText||'').trim(),name:e.getAttribute('aria-label')||'',href:e.getAttribute('href'),sec:e.dataset.section||'',cls:(e.querySelector('.pill')||{className:''}).className,h:Math.round(e.getBoundingClientRect().height)}));
          const yr=st.querySelector('select');
          return {kids,order:r(st)[0]>=sr[1]&&r(st)[1]<=bell[0],items,yearOpts:yr?[...yr.options].map(o=>o.value):[],yearSel:yr?yr.value:null,yearName:yr?yr.getAttribute('aria-label'):null,
            headerText:document.querySelector('.app-header').innerText,barInHeader:!!document.querySelector('.app-header #status-bar')}}""")
        chk('R-8 el encabezado sigue el orden marca → buscador → estado → notificaciones, y las píldoras quedan entre el buscador y las notificaciones sin solaparse', hd['kids'][:4] == ['topbar__brand', 'topbar__search', 'topbar__status', 'topbar__actions'] and hd['order'], (hd['kids'], hd['order']))
        it = hd['items']
        chk('R-8 tres píldoras: año (selector con nombre accesible), estado de datos y estado del motor, cada una con texto y color', len(it) == 3 and it[0]['tag'] == 'SELECT' and hd['yearName'] == 'Año seleccionado' and '2026' in hd['yearOpts'] and it[1]['tag'] == 'A' and it[2]['tag'] == 'A' and it[1]['text'].startswith('Datos') and it[2]['text'].startswith('Motor:') and 'pill--' in it[1]['cls'] and 'pill--' in it[2]['cls'], hd)
        chk('R-8 las píldoras de datos y motor son enlaces a Configuración con nombre accesible que dice a dónde llevan y objetivo ≥ 24 px', all(x['href'] == '#ajustes' and x['sec'] == 'estado' and 'Configuración de RevNavigator' in x['name'] and x['h'] >= 24 for x in it[1:]), it[1:])
        chk('R-8 el encabezado NO trae la ficha completa (ni «Meta anual» ni «Canales configurados»)', 'Meta anual' not in hd['headerText'] and 'Canales configurados' not in hd['headerText'] and not hd['barInHeader'], hd['headerText'][:160])
        # la ficha completa existe solo en Configuración
        where = {}
        for v in ('inicio', 'pacing', 'carga', 'resumen', 'ajustes'):
            await q.goto(u + '#' + v); await q.wait_for_timeout(350)
            where[v] = await q.evaluate("(()=>{const b=document.getElementById('status-bar');return b?{vis:!!b.offsetParent,inside:!!b.closest('#view-ajustes'),items:b.querySelectorAll('.status-item').length}:null})()")
        chk('R-8 la ficha completa (año, meta anual, canales, datos, motor) vive solo dentro de Configuración: en las demás vistas no existe ni se ve', where['ajustes'] and where['ajustes']['vis'] and where['ajustes']['inside'] and where['ajustes']['items'] == 5 and all(where[v] is None or not where[v]['vis'] for v in ('inicio', 'pacing', 'carga', 'resumen')), where)
        tx = await q.evaluate("document.getElementById('status-bar').innerText")
        chk('R-8 en Configuración la ficha trae las 5 cifras (Año seleccionado, Meta anual, Canales configurados, Estado de datos, Estado del motor)', all(w in tx for w in ('Año seleccionado', 'Meta anual', 'Canales configurados', 'Estado de datos', 'Estado del motor')), tx[:200])
        # las píldoras coinciden con el detalle
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(500)
        cmp_ = await q.evaluate("""()=>{const hs=[...document.querySelectorAll('#topbar-status .pill')].map(p=>p.className+'|'+p.innerText.trim());const ds=[...document.querySelectorAll('#status-bar .pill')].map(p=>p.className+'|'+p.innerText.trim());
          return {h:hs,d:ds}}""")
        okc = cmp_['h'][0].split('|')[1] == cmp_['d'][0].split('|')[1] and cmp_['h'][0].split('|')[0] == cmp_['d'][0].split('|')[0] and cmp_['h'][1].split('|')[0] == cmp_['d'][1].split('|')[0] and cmp_['h'][1].split('|')[1].endswith(cmp_['d'][1].split('|')[1])
        chk('R-8 cada píldora del encabezado dice y colorea lo mismo que su detalle en Configuración (datos y motor)', okc, cmp_)
        # clic en la píldora → Configuración, sección «Estado»
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        await q.click('#topbar-status a[aria-label^="Estado de datos"]'); await q.wait_for_timeout(700)
        c1 = await q.evaluate("[location.hash, !document.getElementById('view-ajustes').hidden, document.activeElement && document.activeElement.id]")
        chk('R-8 clic en la píldora de datos → abre Configuración de RevNavigator y lleva a «Estado de la herramienta»', c1 == ['#ajustes', True, 'st-estado'], c1)
        await q.evaluate("window.scrollTo(0, document.body.scrollHeight); document.activeElement.blur()"); await q.wait_for_timeout(200)
        await q.click('#topbar-status a[aria-label^="Estado del motor"]'); await q.wait_for_timeout(700)
        c2 = await q.evaluate("[location.hash, document.activeElement && document.activeElement.id, Math.round(document.getElementById('st-estado').getBoundingClientRect().top) < window.innerHeight]")
        chk('R-8 ya estando en Configuración, la píldora del motor vuelve a llevar a esa sección (aunque la dirección no cambie)', c2[0] == '#ajustes' and c2[1] == 'st-estado' and c2[2] is True, c2)
        # el año se cambia desde el encabezado
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        y0 = await q.evaluate("FP.app.state.year")
        other = '2027' if str(y0) != '2027' else '2025'
        await q.select_option('#topbar-year', other); await q.wait_for_timeout(700)
        y1 = await q.evaluate("[FP.app.state.year, document.getElementById('topbar-year').value]")
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(500)
        y2 = await q.evaluate("document.getElementById('year-select').value")
        await q.select_option('#year-select', str(y0)); await q.wait_for_timeout(700)
        y3 = await q.evaluate("[FP.app.state.year, document.getElementById('topbar-year').value]")
        chk('R-8 la píldora del año SÍ cambia el año desde el encabezado; la ficha de Configuración y el encabezado quedan sincronizados en ambos sentidos', y1 == [int(other), other] and y2 == other and y3 == [y0, str(y0)], (y0, y1, y2, y3))
        # accesibilidad: foco visible en las píldoras
        await q.goto(u + '#pacing'); await q.wait_for_timeout(400)
        await q.focus('#topbar-year'); await q.keyboard.press('Tab'); await q.wait_for_timeout(100)   # llegar con teclado, como un usuario: así aplica :focus-visible
        fo = await q.evaluate("(()=>{const a=document.activeElement;const c=getComputedStyle(a);return [c.outlineStyle,c.outlineWidth,c.outlineColor,a.getAttribute('aria-label')]})()")
        chk('R-8 la píldora enfocada con teclado muestra un contorno visible sobre el encabezado oscuro', fo[0] != 'none' and fo[1] not in ('0px', ''), fo)
        # móvil / tableta con menú en cajón
        for w in (768, 390, 360, 320):
            m2 = await b.new_page(viewport={'width': w, 'height': 800}); await prepare(m2, u); await m2.goto(u + '#pacing'); await m2.wait_for_timeout(500)
            mr = await m2.evaluate("""()=>{const r=e=>e.getBoundingClientRect();const st=r(document.getElementById('topbar-status')),brand=r(document.querySelector('.topbar__brand')),h=r(document.querySelector('.app-header')),nav=r(document.getElementById('app-nav'));
              const it=[...document.getElementById('topbar-status').children].map(e=>{const b=r(e);return b.right<=innerWidth+0.5&&b.left>=0&&b.height>=24});
              return {sw:document.documentElement.scrollWidth-innerWidth,below:st.top>=brand.bottom-1,hdrBottom:Math.round(h.bottom),navTop:Math.round(nav.top),allInside:it.every(Boolean),n:it.length}}""")
            chk(f'R-8 {w}px: las píldoras van en una fila bajo la marca, caben en pantalla (sin desborde), son tocables y el cajón del menú empieza justo bajo el encabezado', mr['sw'] <= 0 and mr['below'] and mr['allInside'] and mr['n'] == 3 and abs(mr['hdrBottom'] - mr['navTop']) <= 1, mr)
            await m2.close()
        wide = []
        for w in (1920, 1440, 1280, 1100, 1025, 900):
            m3 = await b.new_page(viewport={'width': w, 'height': 800}); await prepare(m3, u); await m3.goto(u + '#pacing'); await m3.wait_for_timeout(400)
            r3 = await m3.evaluate("""()=>{const r=e=>e.getBoundingClientRect();const st=r(document.getElementById('topbar-status')),bell=r(document.querySelector('.topbar__actions .icon-btn')),br=r(document.querySelector('.topbar__brand'));
              return {sw:document.documentElement.scrollWidth-innerWidth,noOverlap:st.right<=bell.left+0.5&&st.left>=br.right-0.5,h:Math.round(r(document.querySelector('.app-header')).height)}}""")
            if not (r3['sw'] <= 0 and r3['noOverlap'] and r3['h'] == 56): wide.append((w, r3))
            await m3.close()
        chk('R-8 escritorio 900–1920 px: las píldoras no se solapan con la marca ni con las notificaciones, sin desborde y el encabezado conserva sus 56 px', not wide, wide)

        # ---------- R-2 · arrastrar y soltar ----------
        await q.goto(u + '#carga'); await q.wait_for_timeout(500)
        await q.evaluate("""()=>{window.__states=[];const el=document.querySelector('.upload-card .upload-card__state');window.__el=el;
          new MutationObserver(()=>window.__states.push(el.dataset.state)).observe(el,{attributes:true,attributeFilter:['data-state']});}""")
        before = await q.evaluate("[FP.app.state.staging.items.length, document.querySelector('.upload-card .upload-card__state').dataset.state, document.querySelector('.upload-card .upload-card__state').textContent]")
        dz = """(kind)=>{const card=document.querySelector('.upload-card');const dt=new DataTransfer();
           const csv='fecha,canal,venta,pedidos,volumen\\n2026-09-01,Ecommerce,1000,10,100\\n2026-09-02,App,2000,20,200\\n';dt.items.add(new File([csv],'arrastrado.csv',{type:'text/csv'}));
           const e=new DragEvent(kind,{bubbles:true,cancelable:true,dataTransfer:dt});card.querySelector('.panel__body').dispatchEvent(e);return e.defaultPrevented}"""
        prev = await q.evaluate(dz, 'dragover'); await q.wait_for_timeout(100)
        drag = await q.evaluate("[document.querySelector('.upload-card .upload-card__state').dataset.state, document.querySelector('.upload-card .upload-card__state').textContent]")
        chk('R-2 al arrastrar un archivo sobre la tarjeta: estado «arrastrando» con texto visible, y el navegador no abre el archivo (preventDefault)', prev is True and drag[0] == 'dragging' and 'Suelta' in drag[1], (prev, drag))
        await q.evaluate("""()=>{const card=document.querySelector('.upload-card');const e=new DragEvent('dragleave',{bubbles:true,cancelable:true,relatedTarget:document.body});card.querySelector('.panel__body').dispatchEvent(e)}""")
        await q.wait_for_timeout(100)
        left = await q.evaluate("[document.querySelector('.upload-card .upload-card__state').dataset.state, document.querySelector('.upload-card .upload-card__state').textContent]")
        chk('R-2 al salir de la tarjeta sin soltar, vuelve al estado y texto anteriores', left[0] == before[1] and left[1] == before[2], (before, left))
        await q.evaluate(dz, 'drop'); await q.wait_for_timeout(1200)
        after = await q.evaluate("[FP.app.state.staging.items.length, document.querySelector('.upload-card .upload-card__state').dataset.state, document.querySelector('.upload-card .upload-card__state').textContent, window.__states]")
        chk('R-2 al soltar, el archivo entra a «en revisión» (nada se importa) y la tarjeta pasa por «cargando» y regresa a su estado', after[0] == before[0] + 1 and 'loading' in after[3] and after[1] == before[1] and after[2] == before[2], (before, after))
        st = await q.evaluate("[document.querySelector('#staging').innerText.includes('arrastrado.csv'), FP.app.state.store.plan.batches.length]")
        chk('R-2 el archivo soltado aparece en la revisión por su nombre y no se guardó ningún lote', st[0] is True and st[1] >= 0, st)
        await q.goto(u + '#carga'); await q.wait_for_timeout(300)
        outside = await q.evaluate("""()=>{const dt=new DataTransfer();dt.items.add(new File(['x'],'x.csv'));const e=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt});document.querySelector('#staging').dispatchEvent(e);return [e.defaultPrevented,e.dataTransfer.dropEffect]}""")
        chk('R-2 fuera de una tarjeta de carga el arrastre se rechaza (dropEffect none), sin abrir el archivo', outside[0] is True and outside[1] == 'none', outside)
        btn = await q.evaluate("[document.querySelectorAll('.upload-card').length, document.querySelectorAll('.upload-card input[type=file][data-action=\"pick-files\"]').length, [...document.querySelectorAll('.upload-card')].filter(c=>/arrastrar y soltar/i.test(c.innerText)).length]")
        chk('R-2 el botón «Seleccionar CSV» se conserva en cada tarjeta (vía con teclado) y cada una anuncia que admite arrastrar', btn[0] >= 4 and btn[0] == btn[1] == btn[2], btn)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_i:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
