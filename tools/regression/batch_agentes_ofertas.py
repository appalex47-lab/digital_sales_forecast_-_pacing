"""Arquitecto de Ofertas (agente de promociones): panel, hallazgos con datos de ejemplo, preguntas sugeridas y móvil. Uso: python3 batch_agentes_ofertas.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:600] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
U = f'http://127.0.0.1:{port}/index.html'
READY = "window.FP && FP.app && FP.app.state && !document.getElementById('boot')"
async def body(q): return await q.evaluate("(document.getElementById('ag-body')||{innerText:''}).innerText")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': 1400, 'height': 900})
        q = await c.new_page(); errs = []; q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#promociones'); await q.wait_for_function(READY, timeout=60000)
        await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())"); await q.wait_for_timeout(800)
        # 1. Sin ofertas ni promociones
        await q.click('#ag-fab'); await q.wait_for_selector('#ag-panel:not([hidden])'); await q.wait_for_timeout(1200)
        t = await body(q)
        chk('A1 en Promociones el panel abre en el Arquitecto de Ofertas', await q.evaluate("document.querySelector('.ag-tab[aria-pressed=true]').dataset.id") == 'arquitecto', t[:120])
        chk('A2 sin ofertas ni promociones: lo explica y manda a Promociones', 'Todavía no hay ofertas ni promociones' in t and await q.evaluate("!!document.querySelector('#ag-body a[href=\"#promociones\"]')") and not await q.evaluate("!!document.querySelector('.ag-card .ag-pp')"), t[:200])
        await q.keyboard.press('Escape')
        # 2. Con datos de ejemplo
        await q.evaluate("FP.app.state.pm.actor='Persona A'; FP.app.render()")
        await q.click('[data-action="dm-load"]'); await q.wait_for_timeout(1000)
        for _ in range(240):
            if 'Cargando' not in (await q.evaluate("(FP.app.state.sm.msg||{}).text||''")): break
            await q.wait_for_timeout(500)
        await q.evaluate("FP.agents.runner.clearCache()")
        await q.click('#ag-fab'); await q.wait_for_selector('#ag-panel:not([hidden])'); await q.wait_for_timeout(3500)
        t = await body(q)
        print('--- cuerpo del panel con datos de ejemplo ---\n' + t[:1800])
        cards = await q.evaluate("[...document.querySelectorAll('#ag-body .ag-card h3')].map(h=>h.innerText)")
        chk('B1 con datos de ejemplo el panel no queda vacío: hallazgos o «nada pide atención»', len(cards) >= 1, cards)
        chk('B2 chip de alcance y de IA visibles; el cuerpo no promete margen', 'Promociones y ofertas' in t and 'Sin IA' in t and not any(x in t.lower() for x in ['margen de', 'rentabilidad de']), t[:200])
        chk('B3 las tarjetas usan la misma estructura que los otros agentes (prioridad, responsable, Ver más)', await q.evaluate("(()=>{const c=document.querySelector('#ag-body .ag-card[data-id]'); return !c || (!!c.querySelector('.ag-pp')&&!!c.querySelector('[data-ag=more]'))})()"))
        if await q.evaluate("!!document.querySelector('#ag-body .ag-card[data-id]')"):
            await q.evaluate("document.querySelector('#ag-body [data-ag=more]').click()"); await q.wait_for_timeout(200)
            det = await q.evaluate("document.querySelector('#ag-body .ag-card[data-id]').innerText")
            chk('B4 el detalle trae cifras, hipótesis a validar, acción y límites', all(x in det.lower() for x in ['cifras', 'hipótesis', 'acción']) and ('qué no puedo afirmar' in det.lower() or 'muestra' in det.lower()), det[-900:])
            chk('B5 ningún texto usa lenguaje causal', not any(x in det.lower() for x in ['la causa es', 'se debe a', 'esto demuestra']))
        # 3. Preguntas sugeridas (IA simulada)
        await q.evaluate("FP.cohereConnection.isConfigured = () => true; FP.agentPanel.refresh(false)"); await q.wait_for_timeout(1500)
        chips = await q.evaluate("[...document.querySelectorAll('.ag-chips .ag-chip')].map(c=>c.innerText)")
        chk('C1 en escritorio se ven las 5 preguntas sugeridas, siempre visibles', len(chips) == 5 and chips[0].startswith('¿Qué campañas se pisan') and chips[4].startswith('¿Cómo cayó la conversión'), chips)
        await q.click('.ag-chips .ag-chip >> nth=2'); await q.wait_for_timeout(300)
        chk('C2 tocar una pregunta la pone en el campo', await q.evaluate("document.getElementById('ag-q').value") == chips[2], chips[2])
        h = await q.evaluate("Math.min(...[...document.querySelectorAll('.ag-chips .ag-chip')].map(c=>c.getBoundingClientRect().height))")
        chk('C3 cada pregunta mide al menos 44 px', h >= 44, h)
        await q.keyboard.press('Escape')
        # 4. Móvil: 3 preguntas
        await q.set_viewport_size({'width': 390, 'height': 844}); await q.wait_for_timeout(400)
        await q.click('#ag-fab'); await q.wait_for_selector('#ag-panel:not([hidden])'); await q.wait_for_timeout(1500)
        chips = await q.evaluate("[...document.querySelectorAll('.ag-chips .ag-chip')].map(c=>c.innerText)")
        chk('D1 en móvil se ven solo 3 preguntas: campañas que se pisan, campaña que va peor y ofertas que vencen', len(chips) == 3 and 'se pisan' in chips[0] and 'va peor' in chips[1] and 'vencen' in chips[2], chips)
        ov = await q.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        chk('D2 sin scroll horizontal en móvil', ov <= 1, ov)
        # 5. Inicio: la línea suma al Arquitecto y abre en su pestaña cuando es el que más encontró
        await q.keyboard.press('Escape'); await q.set_viewport_size({'width': 1400, 'height': 900})
        await q.evaluate("location.hash='#inicio'"); await q.wait_for_timeout(800)
        await q.evaluate("FP.agents.runner.clearCache(); FP.agentLauncher.refreshBadge()"); await q.wait_for_timeout(5000)
        sm = await q.evaluate("FP.agentPanel.summary()")
        ln = await q.evaluate("(()=>{const l=document.getElementById('ag-line'); return l?l.innerText:null})()")
        chk('F1 en Inicio la línea incluye los hallazgos del Arquitecto de Ofertas', sm['ofertas'] > 0 and bool(ln) and 'El Arquitecto de Ofertas encontró' in ln, (sm, ln))
        chk('F2 el contador del botón suma los tres agentes', await q.evaluate("(document.querySelector('.ag-badge')||{}).innerText") == str(sm['total']), sm)
        if ln:
            await q.click('#ag-line [data-ag-line=open]'); await q.wait_for_selector('#ag-panel:not([hidden])'); await q.wait_for_timeout(1500)
            first = await q.evaluate("document.querySelector('.ag-tab[aria-pressed=true]').dataset.id")
            chk('F3 «Abrir en Asistentes» abre en el agente que más encontró', first == ('arquitecto' if sm['ofertas'] > sm['n'] else 'analista'), (first, sm))
        chk('E1 sin errores de consola ni excepciones', not errs, errs[:3])
        await b.close()
    print('\nFIN ' + ('OK' if not fails else f'{len(fails)} FALLAS'))
asyncio.run(main())
