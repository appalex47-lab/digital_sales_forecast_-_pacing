"""Fase 1b: «—» de Pacing con motivo (sin datos / no calculable / no aplica / cero real) y «Lo esencial» en tres niveles sin duplicidades.
Uso: python3 -I batch_fase1b_na_esencial.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start()
U = f'http://127.0.0.1:{s.server_address[1]}/index.html'
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:400] if d and not ok else ''))
    if not ok: fails.append(n)
KINDS = {'sin-datos', 'no-calculable', 'no-aplica'}
async def setup(b, scen, vp):
    mob = vp['width'] < 500
    c = await b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); q = await c.new_page(); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:150]))
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); await q.goto(U + '#resumen'); await q.wait_for_timeout(700)
    await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove());FP.app.actions['generate-mock']()"); await q.wait_for_timeout(900)
    if scen != 'sinplan':
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
        except Exception: pass
        await q.goto(U + '#plan'); await q.wait_for_timeout(600)
        for a in ['plan-preview', 'plan-save']:
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass
    if scen == 'cero':
        await q.evaluate("(()=>{FP.app.state.store.actual.records.forEach(r=>{if(r.metrics.revenue)r.metrics.revenue.value=0});FP.app.state.fc.run=null;FP.app.state.rf.run=null})()")
    return c, q, errs
NA = """(()=>{const v=document.getElementById('view-pacing');const bare=[...v.querySelectorAll('td')].filter(t=>t.textContent.trim()==='—'&&!t.querySelector('.na')).length;
 const nas=[...v.querySelectorAll('.na')];const bad=nas.filter(e=>!['sin-datos','no-calculable','no-aplica'].includes(e.dataset.na)||!e.dataset.why||e.getAttribute('title')!==e.dataset.why||e.getAttribute('aria-label')!==e.dataset.why||e.tabIndex!==0).length;
 const card=l=>{const d=[...v.querySelectorAll('.metric-card')].find(x=>x.querySelector('.metric-card__label')&&x.querySelector('.metric-card__label').textContent.trim().startsWith(l));return d?{t:d.querySelector('.metric-card__value').textContent.trim(),na:!!d.querySelector('.metric-card__value .na'),kind:(d.querySelector('.metric-card__value .na')||{dataset:{}}).dataset.na}:null};
 return {bare,n:nas.length,bad,kinds:[...new Set(nas.map(e=>e.dataset.na))],meta:card('Meta del año')||card('Plan del año'),actual:card('Actual a la fecha'),cumpl:card('Cumplimiento'),gap:card('Gap a la fecha'),fc:card('Forecast de cierre')}})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); allerr = []
        D = {}
        for scen in ('sinplan', 'conplan', 'cero'):
            c, q, errs = await setup(b, scen, {'width': 1280, 'height': 900}); await q.goto(U + '#pacing'); await q.wait_for_timeout(900)
            D[scen] = await q.evaluate(NA); allerr += errs; await c.close()
        for scen, r in D.items():
            chk(f'P-1 [{scen}] ningún «—» de Pacing queda sin motivo y cada uno es accesible (foco, título y etiqueta iguales, tipo válido)', r['bare'] == 0 and r['bad'] == 0 and r['n'] > 0 or (r['n'] == 0 and r['bare'] == 0), r)
        chk('P-2 sin plan: «Meta del año» es «—» con motivo «sin datos» (no se convierte en cero)', D['sinplan']['meta'] and D['sinplan']['meta']['na'] and D['sinplan']['meta']['kind'] == 'sin-datos', D['sinplan'])
        chk('P-3 con plan: dato válido mayor que cero se muestra como número, sin «—»', D['conplan']['meta'] and not D['conplan']['meta']['na'] and D['conplan']['meta']['t'].startswith('$') and D['conplan']['actual']['t'].startswith('$') and not D['conplan']['actual']['na'], D['conplan'])
        chk('P-4 venta real igual a cero (cálculo válido): «$0» y «0.0 %», no «—»', D['cero']['actual']['t'] == '$0' and not D['cero']['actual']['na'] and not D['cero']['cumpl']['na'] and D['cero']['cumpl']['t'].startswith('0'), D['cero'])
        chk('P-5 los tres tipos de motivo aparecen cuando corresponde (sin datos, no calculable, no aplica)', {'sin-datos', 'no-calculable', 'no-aplica'} <= set(D['sinplan']['kinds']) | set(D['conplan']['kinds']), (D['sinplan']['kinds'], D['conplan']['kinds']))
        chk('P-6 con real faltante el cálculo dice «no calculable» (no cero)', D['sinplan']['fc'] and D['sinplan']['fc']['na'] and D['sinplan']['fc']['kind'] == 'no-calculable', D['sinplan']['fc'])
        # móvil y teclado
        c, q, errs = await setup(b, 'conplan', {'width': 375, 'height': 740}); await q.goto(U + '#pacing'); await q.wait_for_timeout(900)
        await q.evaluate("document.querySelectorAll('#view-pacing details').forEach(d=>d.open=true)"); await q.wait_for_timeout(300)
        el = q.locator('#view-pacing .na:visible').first
        await el.scroll_into_view_if_needed(); why = await el.get_attribute('data-why')
        await el.tap(); await q.wait_for_timeout(300)
        tt = await q.evaluate("(()=>{const t=document.getElementById('toast');return {txt:t.textContent,vis:getComputedStyle(t).display!=='none'&&getComputedStyle(t).visibility!=='hidden'}})()")
        chk('P-7 [375] un toque en «—» muestra el motivo', why in tt['txt'] and tt['vis'], (why, tt))
        ov = await q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth")
        chk('P-8 [375] sin scroll horizontal de página en Pacing', ov); allerr += errs; await c.close()
        c, q, errs = await setup(b, 'conplan', {'width': 1280, 'height': 900}); await q.goto(U + '#pacing'); await q.wait_for_timeout(900)
        await q.evaluate("document.querySelectorAll('#view-pacing details').forEach(d=>d.open=true)"); await q.wait_for_timeout(300)
        el = q.locator('#view-pacing .na:visible').first; why = await el.get_attribute('data-why')
        await el.focus(); await q.keyboard.press('Enter'); await q.wait_for_timeout(300)
        t = await q.evaluate("document.getElementById('toast').textContent")
        chk('P-9 [1280] con el teclado (foco + Enter) se lee el motivo', why in t, (why, t)); allerr += errs; await c.close()
        # ---- Inicio: Lo esencial ----
        for tag, vp in (('375', {'width': 375, 'height': 740}), ('1280', {'width': 1280, 'height': 900})):
            c, q, errs = await setup(b, 'conplan', vp); await q.goto(U + '#inicio'); await q.wait_for_timeout(900); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
            r = await q.evaluate("""(()=>{const k=document.querySelector('.home-key'),n=document.getElementById('nbs'),a=document.getElementById('att');const t=e=>e?Math.round(e.getBoundingClientRect().top+scrollY):null;const g=s=>k.querySelector(s);
              return {real:g('[data-key-real]')&&g('[data-key-real]').textContent,plan:g('[data-key-plan]')&&g('[data-key-plan]').textContent,gap:g('[data-key-gap]')&&g('[data-key-gap]').textContent,big:g('.home-key__big')&&g('.home-key__big').textContent,
              motors:[...k.querySelectorAll('[data-key=why] [data-cmp]')].map(e=>e.dataset.cmp),summary:!!g('[data-key=summary]'),sumTxt:g('[data-key=summary]')?g('[data-key=summary]').textContent:'',todo:!!g('[data-key=todo]'),
              order:[t(k),t(n),t(a)],ovf:document.documentElement.scrollWidth>document.documentElement.clientWidth}})()""")
            chk(f'I-1 [{tag}] «Lo esencial» conserva venta acumulada, meta acumulada, brecha $ y %, y cumplimiento', all(r[x] and r[x] != '—' for x in ('real', 'plan', 'gap', 'big')), r)
            chk(f'I-2 [{tag}] los tres motores (volumen, CR, ticket) con su Plan → Real', sorted(r['motors']) == ['aov', 'conversionRate', 'trafficVolume'], r['motors'])
            chk(f'I-3 [{tag}] hay resumen ejecutivo dinámico y no atribuye causas (dice que es un cálculo/lo confirma en Diagnóstico)', r['summary'] and 'meta acumulada' in r['sumTxt'] and ('no una causa' in r['sumTxt'] or 'no se puede determinar' in r['sumTxt']), r['sumTxt'])
            chk(f'I-4 [{tag}] ya no se repite «¿Qué hago hoy?» dentro de Lo esencial', r['todo'] is False)
            chk(f'I-5 [{tag}] orden: Tu siguiente mejor paso → Qué necesita atención → detalle de Lo esencial (en «Ver más»)', r['order'][1] < r['order'][2] < r['order'][0], r['order'])
            d = await q.evaluate("""(()=>{const nb=document.querySelector('#nbs [data-action=route-go].btn--primary');const step=document.getElementById('nbs').dataset.step;const same=[...document.querySelectorAll('#att [data-action=route-go]')].filter(b=>b.dataset.step===step).length;const dupNote=document.querySelectorAll('#att [data-is-next-step]').length;return {step,nbBtn:!!nb,sameBtnsInAtt:same,dupNote}})()""")
            chk(f'I-6 [{tag}] el hallazgo que ya es el siguiente paso no repite su botón (solo remite al paso)', d['sameBtnsInAtt'] == 0, d)
            chk(f'I-7 [{tag}] sin scroll horizontal de página en Inicio', not r['ovf'])
            if tag == '375':
                await q.select_option('#home select >> nth=0', 'ecommerce'); await q.wait_for_timeout(700)
                sub = await q.evaluate("document.querySelector('.home-key .ds-card__sub').textContent")
                chk('I-8 [375] cambiar el canal actualiza Lo esencial (canal en el encabezado del bloque)', 'Ecommerce' in sub, sub)
            allerr += errs; await c.close()
        chk('E-1 sin errores JavaScript', not allerr, allerr[:3])
        await b.close()
    print('\nFALLAS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
