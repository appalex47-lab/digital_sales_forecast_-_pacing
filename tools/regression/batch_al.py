"""Configuración con desplegables. Uso: python3 batch_al.py <raiz>
AL-1 las 11 secciones son desplegables, todas cerradas al entrar, cada una con título (h3) y resumen a la vista; AL-2 expandir y contraer todo; AL-3 el estado abierto/cerrado
se conserva al repintar la pantalla y al recibir cambios; AL-4 los enlaces del índice abren y enfocan la sección; AL-5 teclado (Enter y Espacio) y objetivo táctil; AL-6 los resúmenes
reflejan el estado real (modo, API key, consultas, columnas aprendidas, equivalencias, fuentes); AL-7 sin desborde de 320 a 1920 px y orden de encabezados."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver
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
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
IDS = ['st-adv', 'st-estado', 'st-modo', 'st-otras', 'st-fuentes', 'st-equivalencias', 'st-almacenamiento', 'st-ia', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad', 'st-negocio']
SEC = "(()=>[...document.querySelectorAll('#view-ajustes details.stacc')].map(d=>({id:d.id,open:d.open,title:((d.querySelector('summary h3')||{}).textContent||'').trim(),meta:((d.querySelector('.stacc__meta')||{}).textContent||'').trim()})))()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'; await prepare(q, u)
        await q.goto(u + '#ajustes'); await q.wait_for_selector('#st-fuentes', state='attached', timeout=20000); await q.wait_for_timeout(300)
        sec = await q.evaluate(SEC)
        chk('AL-1 Configuración tiene 12 desplegables (Opciones avanzadas que agrupa a las demás, Estado, Modo, Otras preferencias, Fuentes, Equivalencias, Almacenamiento, Conexión con Cohere, Qué se envió, Lo aprendido, Datos personales y Negocio)', sorted(x['id'] for x in sec) == sorted(IDS), [x['id'] for x in sec])
        chk('AL-1 todos entran cerrados y cada uno trae su título y un resumen visible aunque esté cerrado', all(not x['open'] and x['title'] and x['meta'] for x in sec), [(x['id'], x['open'], bool(x['meta'])) for x in sec])
        order = [x['id'] for x in sec]
        chk('AL-1 el orden es Básico (Estado, Modo, Negocio, Conexión con Cohere) y luego Avanzado (Otras preferencias, Datos, IA)', order == ['st-estado', 'st-modo', 'st-negocio', 'st-ia', 'st-adv', 'st-otras', 'st-fuentes', 'st-equivalencias', 'st-almacenamiento', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad'], order)
        groups = await q.evaluate("[...document.querySelectorAll('#view-ajustes .stgroup--page')].map(x=>x.textContent.trim())")
        chk('AL-1 los grupos se anuncian con su rótulo: Básico, Negocio, Avanzado, Datos e IA', groups == ['Básico · Herramienta', 'Negocio', 'Avanzado', 'Datos', 'Inteligencia artificial'], groups)
        h = await q.evaluate("(()=>{const v=document.getElementById('view-ajustes');const hs=[...v.querySelectorAll('h1,h2,h3,h4,h5')];let prev=0,jump=0;hs.forEach(x=>{const n=+x.tagName[1];if(prev&&n>prev+1)jump++;prev=n});return {jump,h2:v.querySelectorAll('h2').length}})()")
        chk('AL-7 los encabezados no saltan de nivel (h2 de la pantalla, h3 de cada desplegable) ni abierto ni cerrado', h['jump'] == 0 and h['h2'] == 1, h)
        # ---- AL-6 resúmenes ----
        meta = {x['id']: x['meta'] for x in sec}
        chk('AL-6 los resúmenes dicen el estado real: modo Analista, sin API key, 0 consultas, 0 columnas aprendidas, 0 equivalencias, fuentes con datos y negocio sin configurar', meta['st-modo'] == 'Analista' and 'Sin API key' in meta['st-ia'] and meta['st-ia-log'].startswith('0 consultas') and meta['st-ia-aprendido'].startswith('0 columnas') and meta['st-equivalencias'].startswith('0 equivalencias') and 'fuentes con datos' in meta['st-fuentes'] and 'Sin configurar' in meta['st-negocio'] and 'motor operativo' in meta['st-estado'], meta)
        await q.evaluate("FP.app.state.dx.apiKey='k'; FP.importer.setLearnedMappings({monto_vendido:'revenue',importe:'revenue'}); FP.app.state.settings.piiColumns=['a']; FP.app.actions['ux-mode']({dataset:{value:'learner'}})"); await q.wait_for_timeout(300)
        await q.goto(u + '#ajustes'); await q.wait_for_timeout(400)
        m2 = {x['id']: x['meta'] for x in await q.evaluate(SEC)}
        chk('AL-6 los resúmenes se actualizan: Aprendiz, API key en uso, 2 columnas aprendidas y 1 marcada a mano', m2['st-modo'] == 'Aprendiz' and 'API key en uso' in m2['st-ia'] and m2['st-ia-aprendido'].startswith('2 columnas') and m2['st-ia-privacidad'].startswith('1 columna marcada'), m2)
        # ---- AL-2 expandir y contraer ----
        await q.click('[data-action="st-expand-all"]'); await q.wait_for_timeout(250)
        chk('AL-2 «Expandir todo» abre las 12 secciones, incluida Negocio (que vive en el HTML)', all(x['open'] for x in await q.evaluate(SEC)))
        await q.click('[data-action="st-collapse-all"]'); await q.wait_for_timeout(250)
        chk('AL-2 «Contraer todo» las cierra todas', all(not x['open'] for x in await q.evaluate(SEC)))
        # ---- AL-3 recordar estado al repintar ----
        await q.click('#st-adv > summary'); await q.click('#st-ia > summary'); await q.click('#st-fuentes > summary'); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['ux-mode']({dataset:{value:'analyst'}})"); await q.wait_for_timeout(300)
        op = {x['id']: x['open'] for x in await q.evaluate(SEC)}
        chk('AL-3 lo que abriste sigue abierto cuando la pantalla se repinta (aquí, al cambiar el modo de uso) y lo demás sigue cerrado', op['st-adv'] and op['st-ia'] and op['st-fuentes'] and not op['st-modo'] and not op['st-estado'], op)
        await q.goto(u + '#carga'); await q.wait_for_timeout(300); await q.goto(u + '#ajustes'); await q.wait_for_timeout(400)
        op2 = {x['id']: x['open'] for x in await q.evaluate(SEC)}
        chk('AL-3 también al salir de Configuración y volver', op2['st-ia'] and op2['st-fuentes'] and not op2['st-estado'], op2)
        await q.click('[data-action="st-collapse-all"]'); await q.click('#st-negocio > summary'); await q.wait_for_timeout(250)
        await q.evaluate("FP.app.actions['ux-mode']({dataset:{value:'learner'}})"); await q.wait_for_timeout(300)
        chk('AL-3 Negocio (bloque del HTML) conserva su estado abierto al repintar', (await q.evaluate("document.getElementById('st-negocio').open")) is True)
        await q.click('[data-action="st-collapse-all"]'); await q.wait_for_timeout(200)
        # ---- AL-4 enlaces ----
        for target in ('st-ia-aprendido', 'st-negocio'):
            await q.click(f'a[data-jump="{target}"]'); await q.wait_for_timeout(300)
            r = await q.evaluate(f"(()=>{{const d=document.getElementById('{target}');return {{open:d.open,top:Math.round(d.getBoundingClientRect().top),fin:scrollY+innerHeight>=document.documentElement.scrollHeight-2,focus:document.activeElement===d||d.contains(document.activeElement)}}}})()")
            chk(f'AL-4 el enlace del índice a «{target}» abre la sección, la deja arriba de la pantalla (o al final si la página ya no da más) y le da el foco', r['open'] and (r['top'] < 260 or r['fin']) and r['focus'], r)
        await q.click('[data-action="st-collapse-all"]'); await q.wait_for_timeout(200)
        # ---- AL-5 teclado y táctil ----
        await q.focus('#st-modo > summary'); await q.keyboard.press('Enter'); await q.wait_for_timeout(150); a = await q.evaluate("document.getElementById('st-modo').open")
        await q.keyboard.press('Space'); await q.wait_for_timeout(150); b2 = await q.evaluate("document.getElementById('st-modo').open")
        chk('AL-5 con el teclado, Enter abre el desplegable y Espacio lo cierra', a is True and b2 is False, (a, b2))
        await q.set_viewport_size({'width': 390, 'height': 900}); await q.wait_for_timeout(300)
        tg = await q.evaluate("[...document.querySelectorAll('#view-ajustes summary.stacc__sum')].filter(s=>s.checkVisibility({contentVisibilityAuto:true,visibilityProperty:true})).map(s=>{const r=s.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})")
        chk('AL-5 en celular (390 px) cada encabezado visible mide al menos 44 × 44 px para tocarlo', all(w >= 44 and h_ >= 44 for w, h_ in tg) and len(tg) == 5, tg)
        # ---- AL-7 desborde ----
        bad = []
        for state_ in ('cerrado', 'abierto'):
            await q.click('[data-action="st-expand-all"]' if state_ == 'abierto' else '[data-action="st-collapse-all"]'); await q.wait_for_timeout(200)
            for w in (1920, 1440, 1280, 1100, 768, 600, 390, 360, 320):
                await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(200)
                x = await q.evaluate("document.documentElement.scrollWidth-innerWidth")
                if x > 0: bad.append((state_, w, x))
        chk('AL-7 sin desborde de página de 320 a 1920 px, con todo cerrado y con todo abierto', not bad, bad)
        chk('Sin errores de página', not errs, errs[:2])
        await c.close(); await b.close()
    print('\nRESULTADO batch_al:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
