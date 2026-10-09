"""Pruebas específicas de la Etapa H (estados, métricas, métodos sin destacar, cadena de evidencia).
Uso: python3 batch_h.py <raiz> <vista[,vista...]>   Sale 1 si alguna falla. Se ejecuta ANTES y DESPUÉS de cada lote."""
import asyncio, sys, os, threading, functools, http.server, socketserver, json
from playwright.async_api import async_playwright
ROOT, VIEWS = os.path.abspath(sys.argv[1]), (sys.argv[2] if len(sys.argv) > 2 else 'inicio,pacing,reforecast,diagnostico,narrativa').split(',')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]
fails = []
def chk(name, ok, det=''):
    print(('✔ ' if ok else '✘ ') + name + (' — ' + str(det) if det and not ok else '')); 
    if not ok: fails.append(name)

# Estilo calculado de una etiqueta de estado: (color, fondo, estilo de borde)
STYLE_JS = """(sel)=>{const e=document.querySelector(sel);if(!e)return null;const c=getComputedStyle(e);
 return {t:e.innerText.trim(),color:c.color,bg:c.backgroundColor,bs:c.borderTopStyle,br:c.borderTopLeftRadius}}"""
async def main():
    srv, port = serve(); url = f'http://127.0.0.1:{port}/index.html'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page()
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(url + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1300)
        try: await q.click('[data-action="sample-targets"]', timeout=1500); await q.wait_for_timeout(400)
        except Exception: pass
        await q.goto(url + '#plan'); await q.wait_for_timeout(600)
        for a in ['plan-preview', 'plan-save']:
            try: await q.click(f'[data-action="{a}"]', timeout=2000); await q.wait_for_timeout(800)
            except Exception: pass

        # H-0 (transversal): las etiquetas de estado no se repiten entre conceptos y siempre llevan texto
        await q.goto(url + '#inicio'); await q.wait_for_timeout(500)
        await q.evaluate("""()=>{const d=document.createElement('div');d.id='__probe';document.body.appendChild(d);
          d.innerHTML=['plan','actual','forecast','reforecast','scenario','observed'].map(k=>`<span class="state-tag state-tag--${k}">${k}</span>`).join('');}""")
        st = {}
        for k in ['plan', 'actual', 'forecast', 'reforecast', 'scenario', 'observed']:
            st[k] = await q.evaluate(STYLE_JS, f'#__probe .state-tag--{k}')
        sig = {k: (v['color'], v['bg']) for k, v in st.items()}
        chk('H-0 Plan≠Actual≠Forecast≠Reforecast≠Scenario≠Observed (color+fondo únicos)', len(set(sig.values())) == 6, sig)
        chk('H-0 Forecast y Scenario con borde punteado/discontinuo (no solo color)', st['forecast']['bs'] in ('dashed', 'dotted') and st['scenario']['bs'] in ('dashed', 'dotted'), {k: st[k]['bs'] for k in st})
        chk('H-0 la etiqueta de estado lleva texto', all(st[k]['t'] for k in st))
        ds = await q.evaluate("""()=>{const o={};for(const k of ['plan','actual','forecast','reforecast','scenario','observed']){const d=document.createElement('span');d.className='ds-badge ds-badge--'+k;d.textContent=k;document.body.appendChild(d);const c=getComputedStyle(d);o[k]=[c.color,c.backgroundColor];}return o}""")
        chk('H-0 .state-tag usa la misma paleta que .ds-badge (un solo lenguaje de estados)', all(sig[k] == tuple(ds[k]) for k in sig), {k: (sig[k], ds[k]) for k in sig if sig[k] != tuple(ds[k])})
        # líneas de gráfica: mismos colores que los tokens de estado
        tok = await q.evaluate("""()=>{const r=getComputedStyle(document.documentElement);const o={};
          for(const k of ['plan','actual','forecast','reforecast']){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');const l=document.createElementNS('http://www.w3.org/2000/svg','path');
            l.setAttribute('class','chart-line chart-line--'+k);s.appendChild(l);document.body.appendChild(s);
            const probe=document.createElement('i');probe.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(probe);
            o[k]=[getComputedStyle(l).stroke,getComputedStyle(probe).color];}return o}""")
        chk('H-0 líneas de gráfica (plan/actual/forecast/reforecast) usan los tokens de estado', all(v[0] == v[1] for v in tok.values()), tok)

        if 'pacing' in VIEWS:
            await q.goto(url + '#pacing'); await q.wait_for_timeout(700)
            n = await q.evaluate("document.querySelectorAll('#fc-kpis .metric-card').length")
            chk('H-pacing 6 métricas del total como .metric-card (valor, variación, referencia)', n == 6, n)
            tags = await q.evaluate("[...document.querySelectorAll('#fc-kpis .metric-card .state-tag')].map(e=>e.innerText.trim())")
            chk('H-pacing métricas etiquetadas Plan / Actual / Forecast con texto', all(t in tags for t in ['Plan', 'Actual', 'Forecast']), tags)
            th = await q.evaluate("[...document.querySelectorAll('#fc-channels th[data-state]')].map(e=>[e.dataset.state,e.innerText.replace(/\\s+/g,' ').replace('?','').trim()])")
            chk('H-pacing encabezados de Plan / Actual / Forecast marcados por estado', {t[0] for t in th} >= {'plan', 'actual', 'forecast'}, th)
            band = await q.evaluate("""()=>{const o={};document.querySelectorAll('#fc-channels th[data-state]').forEach(e=>{const c=getComputedStyle(e);o[e.dataset.state]=[c.borderTopStyle,c.borderTopColor]});return o}""")
            chk('H-pacing banda de Forecast punteada y de Plan/Actual continua (patrón, no solo color)', band.get('forecast', ['', ''])[0] == 'dashed' and band.get('plan', ['', ''])[0] == 'solid' and band.get('actual', ['', ''])[0] == 'solid', band)
            chk('H-pacing colores de banda distintos entre Plan, Actual y Forecast', len({v[1] for v in band.values()}) == len(band) and len(band) >= 3, band)
            m = await q.evaluate("""()=>{const rows=[...document.querySelectorAll('#fc-methods tbody tr')];const bg=rows.map(r=>getComputedStyle(r.cells[0]).backgroundColor);return {n:rows.length,uniq:[...new Set(bg)].length,enUso:rows.filter(r=>/en uso/.test(r.innerText)).length}}""")
            chk('H-pacing métodos de forecast: ninguna fila destacada (mismo fondo) y «en uso» solo como texto', m['n'] >= 4 and m['uniq'] == 1 and m['enUso'] == 1, m)
            txt = await q.evaluate("document.getElementById('view-pacing').innerText")
            chk('H-pacing ningún método se declara «mejor/recomendado/óptimo»', not any(w in txt.lower() for w in ['mejor método', 'recomendado', 'método óptimo', 'best']), '')
        if 'reforecast' in VIEWS:
            await q.goto(url + '#reforecast'); await q.wait_for_timeout(800)
            cards = await q.evaluate("[...document.querySelectorAll('#rf-summary .metric-card')].map(c=>({tag:(c.querySelector('.state-tag')||{}).innerText||'',label:(c.querySelector('dt')||{}).innerText||'',valColor:getComputedStyle(c.querySelector('.metric-card__value')).color}))")
            chk('H-reforecast 7 métricas como .metric-card', len(cards) == 7, len(cards))
            tags = [c['tag'].strip() for c in cards]
            chk('H-reforecast etiquetas de estado con texto: Plan, Actual, Forecast y Reforecast', all(t in tags for t in ['Plan', 'Actual', 'Forecast', 'Reforecast']), tags)
            press = [c for c in cards if c['label'].strip().startswith('Presión')]
            body = await q.evaluate("getComputedStyle(document.body).color")
            chk('H-reforecast «Presión de recuperación» es descriptiva: sin etiqueta de estado ni color de semáforo', len(press) == 1 and press[0]['tag'] == '' and press[0]['valColor'] == cards[0]['valColor'], press)
            fills = await q.evaluate("""()=>{const r=getComputedStyle(document.documentElement);const tok=k=>{const i=document.createElement('i');i.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(i);return getComputedStyle(i).color};
              const f=k=>{const e=document.querySelector('#rf-summary .closure-bar__fill--'+k);return e?getComputedStyle(e).backgroundColor:null};
              return {plan:[f('plan'),tok('plan')],forecast:[f('forecast'),tok('forecast')],reforecast:[f('reforecast'),tok('reforecast')]}}""")
            chk('H-reforecast barras de cierre Plan / Forecast / Reforecast usan los tokens de estado', all(v[0] == v[1] for v in fills.values()) and len({v[0] for v in fills.values()}) == 3, fills)
            probe = await q.evaluate("""()=>{const r=getComputedStyle(document.documentElement);const tok=k=>{const i=document.createElement('i');i.style.color=r.getPropertyValue('--ds-'+k);document.body.appendChild(i);return getComputedStyle(i).color};
              const mk=k=>{const t=document.createElement('span');t.className='closure-bar__track';const e=document.createElement('span');e.className='closure-bar__fill closure-bar__fill--'+k;e.style.width='50%';t.appendChild(e);document.body.appendChild(t);const c=getComputedStyle(e);return [c.backgroundColor,c.backgroundImage]};
              return {actual:[mk('actual')[0],tok('actual')],scenarioImg:mk('scenario')[1],scenarioTok:tok('scenario'),reforecastTok:tok('reforecast')}}""")
            chk('H-reforecast barra «actual» es teal (token) y «escenario» usa magenta punteado, no el violeta de reforecast', probe['actual'][0] == probe['actual'][1] and 'repeating-linear-gradient' in probe['scenarioImg'] and probe['scenarioTok'] in probe['scenarioImg'] and probe['reforecastTok'] not in probe['scenarioImg'], probe)
            th = await q.evaluate("[...new Set([...document.querySelectorAll('#rf-channels th[data-state]')].map(e=>e.dataset.state))]")
            chk('H-reforecast encabezados por estado en «Por canal» (plan, actual, forecast, reforecast)', set(th) >= {'plan', 'actual', 'forecast', 'reforecast'}, th)
            band = await q.evaluate("""()=>{const o={};document.querySelectorAll('#rf-channels th[data-state]').forEach(e=>{const c=getComputedStyle(e);o[e.dataset.state]=[c.borderTopStyle,c.borderTopColor]});return o}""")
            chk('H-reforecast bandas con patrón distinto: Forecast punteada, Reforecast doble, Plan/Actual continuas', band.get('forecast', ['',''])[0] == 'dashed' and band.get('reforecast', ['',''])[0] == 'double' and band.get('plan', ['',''])[0] == 'solid', band)
            txt = await q.evaluate("document.getElementById('view-reforecast').innerText.toLowerCase()")
            rt = await q.evaluate("""()=>{const v=document.getElementById('view-reforecast');const e=v.querySelector('.explainer summary');const t=v.querySelector('.state-tag--reforecast');const c=t?getComputedStyle(t):null;
              const r=getComputedStyle(document.documentElement).getPropertyValue('--ds-reforecast').trim();const i=document.createElement('i');i.style.color=r;document.body.appendChild(i);
              return {title:e?e.innerText.trim():'',badge:t?t.innerText.trim():'',same:c?c.color===getComputedStyle(i).color:false}}""")
            chk('H-reforecast «Forecast no es reforecast» visible como título del explicador y badge «Reforecast» en el violeta del token', rt['title'] == 'Forecast no es reforecast' and rt['badge'] == 'Reforecast' and rt['same'], rt)
            chk('H-reforecast se conserva «lo esperado es el forecast» / «el plan nunca cambia»', 'lo esperado es el forecast' in txt and 'el plan nunca cambia' in txt)
        if 'diagnostico' in VIEWS:
            await q.goto(url + '#diagnostico'); await q.wait_for_timeout(600)
            # el mes por defecto es el mes en curso; el 1.º de mes no tiene días con real: se fija el último mes con venta real (prueba independiente de la fecha)
            last = await q.evaluate("(FP.app.state.store.actual.records.map(r=>r.date).sort().pop()||'').slice(0,7)")
            if last: await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'periodKey'}},value:'{last}'}})"); await q.wait_for_timeout(900)
            chain = await q.evaluate("""()=>{const o={};document.querySelectorAll('#view-diagnostico .ds-badge--chain').forEach(e=>{const k=[...e.classList].find(c=>/^ds-badge--(fact|driver|signal|hyp)$/.test(c));if(!k)return;const c=getComputedStyle(e);
              (o[k.replace('ds-badge--','')]=o[k.replace('ds-badge--','')]||[]).push({t:e.innerText.trim(),color:c.color,bg:c.backgroundColor,r:c.borderTopLeftRadius,bl:c.borderLeftWidth+' '+c.borderLeftStyle})});return o}""")
            words = {k: {x['t'] for x in v} for k, v in chain.items()}
            chk('H-dx cadena Hecho → Driver → Señal → Hipótesis con badges fact/driver/signal/hyp y texto', words.get('fact') == {'Hecho'} and words.get('driver') == {'Driver'} and words.get('signal') == {'Señal'} and words.get('hyp') == {'Hipótesis'}, words)
            sig = {k: (v[0]['color'], v[0]['bg']) for k, v in chain.items()}
            chk('H-dx los 4 eslabones de la cadena tienen color propio (Hecho≠Driver≠Señal≠Hipótesis)', len(sig) == 4 and len(set(sig.values())) == 4, sig)
            state_r = await q.evaluate("(()=>{const e=document.createElement('span');e.className='ds-badge ds-badge--actual';document.body.appendChild(e);return getComputedStyle(e).borderTopLeftRadius})()")
            chk('H-dx la cadena de evidencia no se confunde con los estados: forma distinta (rectangular con borde izquierdo grueso, no píldora)', all(v[0]['r'] != state_r and v[0]['bl'].startswith('4px') for v in chain.values()) and len(chain) == 4, {'estado': state_r, 'cadena': {k: (v[0]['r'], v[0]['bl']) for k, v in chain.items()}})
            steps = await q.evaluate("""()=>[...document.querySelectorAll('#dx-why .why-steps__n')].map(e=>{const k=[...e.classList].find(c=>/--(fact|driver|signal|hyp)$/.test(c))||'';return [e.innerText.trim(),k.replace('why-steps__n--',''),getComputedStyle(e).borderTopColor]})""")
            chk('H-dx pasos 1–4 de «¿Por qué…?» marcados como fact / driver / signal / hyp con color distinto', [x[1] for x in steps[:4]] == ['fact', 'driver', 'signal', 'hyp'] and len({x[2] for x in steps[:4]}) == 4 and all(x[1] == '' for x in steps[4:]), steps)
            cards = await q.evaluate("[...document.querySelectorAll('#dx-result .metric-card')].map(c=>({tag:((c.querySelector('.state-tag')||{}).innerText||'').trim(),label:c.querySelector('dt').innerText.replace('?','').trim()}))")
            chk('H-dx resultado: 3 métricas como .metric-card y Actual/Plan (o su referencia) con etiqueta de estado', len(cards) == 3 and sum(1 for c in cards if c['tag']) >= 2, cards)
            rows = await q.evaluate("""()=>[...document.querySelectorAll('#dx-level1 tbody tr')].map(r=>[r.cells[4].innerText.trim(),r.cells[6].innerText.trim()])""")
            chk('H-dx contribuciones con signo Y texto (no solo color): cada driver trae «+»/«−» y su etiqueta', len(rows) >= 3 and all((x[0][:1] in '+−' or not any(ch.isdigit() and ch != '0' for ch in x[0])) and x[1] in ('Contribución negativa', 'Offset positivo', 'Sin efecto') for x in rows), rows)
            tb = await q.evaluate("[...document.querySelectorAll('#view-diagnostico table')].filter(t=>!t.classList.contains('ds-table')).length")
            chk('H-dx todas las tablas usan ds-table', tb == 0, tb)
        # H-X (transversal): «Aprender más» de cada vista es el acordeón plano del design system (con chevron y aria nativo de <details>)
        await q.goto(url + '#pacing'); await q.wait_for_timeout(600)
        acc = await q.evaluate("""()=>{const ex=document.querySelector('.explainer');if(ex)ex.open=true;const d=document.querySelector('.explainer details');if(!d)return null;return {cls:d.className,chev:!!d.querySelector('summary .ds-accordion__chev'),body:!!d.querySelector('.ds-accordion__body'),
          summary:d.querySelector('summary').innerText.trim(),rows:d.querySelectorAll('.help-entry__row').length}}""")
        chk('H-X «Aprender más» usa ds-accordion + ds-accordion--plain con chevron y cuerpo', bool(acc) and 'ds-accordion--plain' in acc['cls'] and 'ds-accordion ' in acc['cls'] + ' ' and acc['chev'] and acc['body'] and acc['summary'].startswith('Aprender más') and acc['rows'] >= 3, acc)
        # H-X móvil: a 768 y 390 px el título del acordeón usa casi todo el ancho (antes una regla móvil lo dejaba en 36 px: una palabra por línea)
        for w in (768, 390):
            await q.set_viewport_size({'width': w, 'height': 900})
            for vw in ('pacing', 'ayuda'):
                await q.goto(url + '#' + vw); await q.wait_for_timeout(600)
                g = await q.evaluate("""()=>{const ex=document.querySelector('.app-main:not([hidden]) details.explainer');if(ex)ex.open=true;const d=document.querySelector('.app-main:not([hidden]) details.ds-accordion--plain');if(!d)return null;d.open=true;const s=d.querySelector('summary');const sp=s.firstElementChild;
                  const b=s.getBoundingClientRect(),t=sp.getBoundingClientRect(),c=d.querySelector('.ds-accordion__chev');
                  return {summaryW:Math.round(b.width),textW:Math.round(t.width),lines:Math.round(t.height/parseFloat(getComputedStyle(sp).lineHeight||20)),chevInside:c?(c.getBoundingClientRect().right<=b.right+1&&c.getBoundingClientRect().left>=b.left):false}}""")
                chk(f'H-X {vw} a {w}px: el título del acordeón plano ocupa el ancho (≥ 60 % del resumen), cabe en ≤ 3 líneas y el chevron queda dentro', bool(g) and g['textW'] >= 0.6 * g['summaryW'] and g['lines'] <= 3 and g['chevInside'], g)
        await q.set_viewport_size({'width': 1280, 'height': 900})
        if 'narrativa' in VIEWS:
            await q.goto(url + '#narrativa'); await q.wait_for_timeout(800)
            st = {}
            for name, ai in {'busy': "{status:'busy',actions:[],errors:[]}", 'error': "{status:'unavailable',errors:['Sin conexión con Cohere.']}", 'ok': "{status:'ok',errors:[],result:{summary:'Resumen de prueba.',narrative:'Párrafo uno.\\n\\nPárrafo dos.',missingInfo:[]}}"}.items():
                st[name] = await q.evaluate("""(ai)=>{FP.app.state.nx.ai=eval('('+ai+')');FP.narrativeView.render(FP.app.state);const b=document.getElementById('nx-ai');
                  const l=b.querySelector('.ds-loading'),a=b.querySelector('.ds-alert');
                  return {loading:l?{t:l.innerText.trim(),role:l.getAttribute('role'),spin:getComputedStyle(l,'::before').content!=='none'}:null,
                          alert:a?{cls:a.className,role:a.getAttribute('role'),t:a.innerText.trim(),bg:getComputedStyle(a).backgroundColor}:null,text:b.innerText.replace(/\\s+/g,' ').trim().slice(0,160),chip:!!b.querySelector('.chip')}}""", ai)
            chk('H-narr espera: «Redactando con Cohere…» con .ds-loading y role="status"', bool(st['busy']['loading']) and st['busy']['loading']['t'].startswith('Redactando con Cohere') and st['busy']['loading']['role'] == 'status' and st['busy']['loading']['spin'], st['busy'])
            chk('H-narr error: aviso con .ds-alert--danger, role="alert" y el mismo texto; aclara que la narrativa determinística sigue disponible', bool(st['error']['alert']) and 'ds-alert--danger' in st['error']['alert']['cls'] and st['error']['alert']['role'] == 'alert' and 'Análisis con IA no disponible' in st['error']['alert']['t'] and 'no depende de Cohere' in st['error']['alert']['t'], st['error'])
            chk('H-narr generado: se conserva «Redacción de Cohere» validada, sin estilo de alerta ni de carga', 'Redacción de Cohere' in st['ok']['text'] and st['ok']['chip'] and not st['ok']['alert'] and not st['ok']['loading'], st['ok'])
            soft = await q.evaluate("""()=>{const e=document.querySelector('#nx-summary .chip--soft');if(!e)return null;const c=getComputedStyle(e);return {w:c.borderTopWidth,st:c.borderTopStyle}}""")
            chk('H-narr los chips «no disponible» (— Hipótesis / — Producto) tienen contorno fino de 1 px, no un borde grueso que destaque más que los «✓»', soft is None or soft['w'] == '1px', soft)
            danger_bg = await q.evaluate("(()=>{const e=document.createElement('div');e.className='ds-alert ds-alert--danger';document.body.appendChild(e);return getComputedStyle(e).backgroundColor})()")
            chk('H-narr el error usa el rojo de peligro del sistema (no el ámbar de advertencia)', st['error']['alert'] and st['error']['alert']['bg'] == danger_bg, (st['error']['alert'] or {}).get('bg'))
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_h:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
