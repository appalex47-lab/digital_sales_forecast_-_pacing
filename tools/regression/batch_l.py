"""Inicio · datos primero (R-13 «Preparación de datos» en el orden del recorrido, R-14 estado vacío alineado, nota del histórico opcional,
R-15 modo «solo plan»). Uso: python3 batch_l.py <raiz>   Sale 1 si alguna falla."""
import asyncio, sys, os, threading, functools, http.server, socketserver, itertools, json
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
HOME = """()=>{const h=document.getElementById('home');const now=h.querySelector('[aria-labelledby="h-now"]');
 const li=[...h.querySelectorAll('.readiness__list li')].map(l=>({t:l.innerText.replace(/\\s+/g,' ').trim(),done:l.classList.contains('is-done'),badge:!!l.querySelector('.ds-badge'),hint:!!l.querySelector('.readiness__hint'),ir:!!l.querySelector('a')}));
 return {pct:h.querySelector('.readiness__bar')?.getAttribute('aria-valuenow'),li,empty:!!now?.querySelector('.ds-empty'),
  steps:[...(now?.querySelectorAll('.empty__next li')||[])].map(l=>l.innerText.replace(/\\s+/g,' ').trim()),
  notes:[...(now?.querySelectorAll('.empty__next .field__hint')||[])].map(p=>p.innerText.trim()),
  cta:(now?.querySelector('.empty__next .btn')||{}).innerText||null,ctaView:(now?.querySelector('.empty__next .btn')||{dataset:{}}).dataset.view||null,
  cards:[...(now?.querySelectorAll('.metric-card')||[])].map(c=>({tag:(c.querySelector('.state-tag')||{}).innerText||'',label:(c.querySelector('.metric-card__label')||{}).innerText||'',val:(c.querySelector('.metric-card__value')||{}).innerText||'',cmp:(c.querySelector('.metric-card__compare')||{}).innerText||''})),
  msgs:[...(now?.querySelectorAll('.headline li')||[])].map(l=>l.innerText),
  order:[...h.querySelectorAll('section.ds-card:not(.home-sum)')].map(x=>x.getAttribute('aria-labelledby'))}}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        A = await q.evaluate(HOME)
        lab = [x['t'] for x in A['li']]
        want = ['Histórico cargado (mejora la estacionalidad)', 'Venta real cargada', 'Cobertura reciente de venta real', 'Meta anual definida', 'Plan distribuido', 'Sin errores de calidad']
        chk('R-13 «Preparación de datos» sigue el orden del recorrido: 1 Histórico, 2 Venta real, 3 Cobertura, 4 Meta anual, 5 Plan, 6 Sin errores de calidad', len(lab) == 6 and all(lab[i].replace('— ', '').startswith(want[i]) for i in range(6)), lab)
        chk('R-13 se conservan las etiquetas «recomendado» (histórico, cobertura, calidad) y los enlaces «Ir» de cada paso pendiente', [x['badge'] for x in A['li']] == [True, False, True, False, False, True] and all(x['ir'] for x in A['li']), [(x['badge'], x['ir']) for x in A['li']])
        chk('R-13 el histórico lleva la nota «Opcional: si tu empresa no tiene histórico, puedes continuar sin él.» mientras falta', A['li'][0]['hint'] and 'Opcional: si tu empresa no tiene histórico, puedes continuar sin él.' in A['li'][0]['t'] and not any(x['hint'] for x in A['li'][1:]), A['li'][0])
        # el porcentaje no cambia con el orden: 64 combinaciones contra la fórmula (pesos 15/20/30/15/10/10 y tope de 45 % sin venta real)
        bad = await q.evaluate("""()=>{const bad=[];const W={targets:15,plan:20,actual:30,coverage:15,historical:10,quality:10};const yr=FP.app.state.year;
          for(let m=0;m<64;m++){const f={targets:!!(m&1),plan:!!(m&2),actual:!!(m&4),coverage:!!(m&8),historical:!!(m&16),quality:!!(m&32)};
            const s={year:yr,actual:{countedDays:f.actual?(f.coverage?1000:1):0},targets:{defined:f.targets},plan:{original:f.plan,imported:false},data:{historical:f.historical?5:0,quality:f.quality?'ready':'invalid'}};
            const r=FP.contextEngine.dataReadiness(s);let e=Object.keys(W).reduce((a,k)=>a+((k==='coverage'?(f.actual&&f.coverage):f[k])?W[k]:0),0);if(!f.actual)e=Math.min(e,45);
            if(r.percent!==e)bad.push([m,r.percent,e]);}return bad}""")
        chk('R-13 el porcentaje de preparación es idéntico al de antes en las 64 combinaciones (el orden no cambia pesos ni semáforo)', not bad, bad[:4])
        # estado vacío alineado
        chk('R-14 el estado vacío de «¿Qué está pasando?» lista los 4 pasos en el mismo orden: histórico, venta real, meta, plan', A['empty'] and len(A['steps']) == 4 and A['steps'][0].startswith('Cargar el histórico') and A['steps'][1].startswith('Cargar la venta real') and A['steps'][2].startswith('Capturar la meta') and A['steps'][3].startswith('Guardar el plan'), A['steps'])
        chk('R-14 el histórico aparece como «opcional» y con la nota de que se puede continuar sin él', 'opcional' in A['steps'][0] and any('si tu empresa no tiene, puedes continuar sin él' in n for n in A['notes']), (A['steps'][:1], A['notes']))
        chk('R-14 el botón lleva al primer paso OBLIGATORIO que falta (venta real → Carga de datos), no al opcional', A['ctaView'] == 'carga' and 'Carga de datos' in (A['cta'] or ''), (A['cta'], A['ctaView']))
        chk('R-14 el orden de las tarjetas de Inicio sin datos no cambia (siguiente paso + preparación → recorrido → qué está pasando)', A['order'] == ['h-next', 'h-ready', 'h-flow', 'h-now'], A['order'])
        # con venta real cargada pero sin meta ni plan: el paso 2 queda hecho y el botón pasa a la meta
        await q.goto(u + '#resumen'); await q.wait_for_timeout(300)
        # solo meta
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(500)
        except Exception: pass
        await q.goto(u + '#inicio'); await q.wait_for_timeout(600)
        B = await q.evaluate(HOME)
        chk('R-14 con solo la meta capturada: ese paso se marca ✓, el botón pasa a la venta real y sigue el estado vacío (no hay plan)', B['empty'] and B['steps'][2].startswith('✓') and B['ctaView'] == 'carga', (B['steps'], B['ctaView']))
        # meta + plan, sin venta real → «solo plan»
        await q.goto(u + '#plan'); await q.wait_for_timeout(500)
        for a in ('plan-preview', 'plan-save'):
            await q.click(f'[data-action="{a}"]'); await q.wait_for_timeout(900)
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        C = await q.evaluate(HOME)
        labels = [c['label'] for c in C['cards']]
        chk('R-15 con plan pero sin venta real, Inicio ya muestra algo: 5 tarjetas del plan (meta del periodo, pedidos, volumen, CR, AOV) con etiqueta «Plan»', not C['empty'] and labels == ['Meta del periodo', 'Pedidos del plan', 'Volumen del plan', 'CR del plan', 'AOV del plan'] and all(c['tag'] == 'Plan' for c in C['cards']), (labels, [c['tag'] for c in C['cards']]))
        chk('R-15 la meta del periodo es la del plan y, sin histórico, pedidos/volumen/CR/AOV muestran «—» con «Sin histórico: el plan no lo proyecta»', C['cards'][0]['val'].startswith('$261') and all(c['val'] == '—' and 'Sin histórico' in c['cmp'] for c in C['cards'][1:]), C['cards'])
        chk('R-15 el mensaje dice que aún no hay venta real y qué falta; ya no aparecen «forecast … 0.0 %» ni presiones de recuperación absurdas', any('Todavía no hay venta real' in m for m in C['msgs']) and any('Carga la venta real' in m for m in C['msgs']) and not any(('0.0 %' in m or '296' in m or 'reforecast requiere' in m.lower()) for m in C['msgs']), C['msgs'])
        bar = await q.evaluate("document.getElementById('ux-context').innerText.replace(/\\s+/g,' ')")
        chk('R-15 la barra de contexto de Inicio tampoco dice «el forecast proyecta cerrar 0.0 %»: dice que aún no hay venta real y qué se está viendo', 'Todavía no hay venta real: aquí ves lo que plantea tu plan' in bar and 'forecast actual proyecta' not in bar and '0.0 %' not in bar, bar[:220])
        chk('R-15 en modo «solo plan» los pasos que faltan siguen arriba (siguiente paso + preparación primero), como sin datos', C['order'][:2] == ['h-next', 'h-ready'], C['order'])
        chk('R-15 la preparación marca meta y plan ✓ y el porcentaje es 35 %', C['pct'] == '35' and C['li'][3]['done'] and C['li'][4]['done'], (C['pct'], [x['done'] for x in C['li']]))
        # con venta real (datos de prueba): Inicio completo como siempre
        await q.goto(u + '#resumen'); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1400)
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        D = await q.evaluate(HOME)
        chk('R-15 con venta real Inicio vuelve al modo completo (7 tarjetas: venta acumulada, meta acumulada, gap, cumplimiento, forecast, gap forecast, presión) y las tarjetas de datos van primero', len(D['cards']) == 7 and D['cards'][0]['label'] == 'Venta acumulada' and D['order'] == ['h-flow', 'h-now', 'h-ready', 'h-next'], (len(D['cards']), D['order']))
        chk('R-13 con datos de prueba (venta real y plan, sin histórico) se ve la nota del histórico y ✓ en venta real, meta y plan', D['li'][0]['hint'] and D['li'][1]['done'] and D['li'][3]['done'] and D['li'][4]['done'], [(x['done'], x['hint']) for x in D['li']])
        # otras vistas: su lista de requisitos no cambió
        await q.goto(u + '#carga'); await q.wait_for_timeout(300)
        req = await q.evaluate("['pacing','plan','reforecast','narrativa','diagnostico','recovery','estacionalidad'].map(v=>[v,FP.contextEngine.requirements(v,FP.contextEngine.collectStatus(FP.app.state)).map(r=>r.key+(r.optional?'*':'')).join()])")
        chk('R-14 los requisitos de las demás vistas no cambian (siguen sin pasos opcionales marcados)', all('*' not in r[1] for r in req) and dict(req)['pacing'] == 'targets,plan,actual' and dict(req)['plan'] == 'targets,historical', req)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_l:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
