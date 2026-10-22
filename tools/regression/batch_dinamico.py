"""Fase 15.2 · redacción dinámica: los textos siguen a los datos. Se reconstruye el reporte con la entrada alterada (sin tocar fórmulas
de producción: solo se cambian valores de entrada y se mantienen coherentes sus campos derivados) y se verifica que titulares,
resumen y cierre digan lo mismo que los resultados. Corre: python3 batch_dinamico.py <raíz>"""
import sys, json, re
from ed_common import *
ok = bad = 0
def chk(n, c, d=''):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n, '|', str(d)[:700])
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
# Construye el reporte con una entrada alterada. spec: scale{canal:factor}, setGap{canal:'plan' => actual=plan}, planNull, counted0, swapDrag, noDrag
JS = """(spec)=>{const i=JSON.parse(JSON.stringify(window.__edIn));const CH=['ecommerce','app','whatsapp','llamadas'];
 const per=(S,fn)=>{if(!S)return;if(S.annual)fn(S.annual);(S.months||[]).forEach(fn);(S.weeks||[]).forEach(fn)};
 const key=(o)=>o.key||'annual';
 const setA=(o,a)=>{const t=o&&o.toDate&&o.toDate.revenue;if(!t||typeof t.actual!=='number')return;t.actual=a;if(typeof t.plan==='number'){t.gap=t.actual-t.plan;t.gapPct=t.plan?t.gap/t.plan:null;t.compliance=t.plan?t.actual/t.plan:null}};
 CH.forEach(c=>{const f=spec.scale&&spec.scale[c];const eq=spec.eqPlan&&spec.eqPlan.includes(c);per(i.run.channels[c],(o)=>{const t=o.toDate&&o.toDate.revenue;if(!t||typeof t.actual!=='number')return;if(eq&&typeof t.plan==='number')setA(o,t.plan);else if(f!=null)setA(o,t.actual*f)})});
 if(spec.gapEq){per(i.run.channels[spec.gapEq[0]],(o)=>{const t=o.toDate&&o.toDate.revenue;if(t&&typeof t.plan==='number')setA(o,t.plan+spec.gapEq[2])});per(i.run.channels[spec.gapEq[1]],(o)=>{const t=o.toDate&&o.toDate.revenue;if(t&&typeof t.plan==='number')setA(o,t.plan+spec.gapEq[2])})}
 const sums={};CH.forEach(c=>per(i.run.channels[c],(o)=>{const t=o.toDate&&o.toDate.revenue;if(t&&typeof t.actual==='number')sums[key(o)]=(sums[key(o)]||0)+t.actual}));
 per(i.run.total,(o)=>{if(sums[key(o)]!=null)setA(o,sums[key(o)])});
 if(spec.planNull){per(i.run.total,(o)=>{const t=o.toDate&&o.toDate.revenue;if(t){t.plan=null;t.gap=null;t.gapPct=null;t.compliance=null}});CH.forEach(c=>per(i.run.channels[c],(o)=>{const t=o.toDate&&o.toDate.revenue;if(t){t.plan=null;t.gap=null;t.gapPct=null;t.compliance=null}}))}
 if(spec.counted0){per(i.run.total,(o)=>{if('countedDays' in o)o.countedDays=0})}
 if(spec.drv&&i.diag&&i.diag.level1Drivers){const M={traffic:'trafficVolume',cr:'conversionRate',aov:'aov'};let s=0;i.diag.level1Drivers.forEach(x=>{const k=Object.keys(M).find(z=>M[z]===x.driver);if(k&&spec.drv[k]!=null){x.contribution=spec.drv[k]}s+=x.contribution});if(i.diag.gap){i.diag.gap.abs=s;if(i.diag.gap.baseline)i.diag.gap.pct=s/i.diag.gap.baseline}}
 if(spec.swapDrag&&i.focusData&&i.focusData.category&&i.focusData.category.priorities){const d=i.focusData.category.priorities.drag;if(d&&d.length>1)[d[0],d[1]]=[d[1],d[0]]}
 if(spec.noDrag&&i.focusData&&i.focusData.category&&i.focusData.category.priorities){i.focusData.category.priorities.drag=[]}
 if(spec.addAll&&i.trend&&i.trend.priorities){const P=i.trend.priorities;P.all=(P.all||[]).slice();['drag','compensate'].forEach(k=>{for(let n=0;n<(spec.addAll[k]||0);n++)P.all.push({type:k,impact:k==='drag'?-1:1,entity:'x'+k+n})})}
 if(spec.cutoff)i.run.cutoff=spec.cutoff;
 if(spec.missing!=null)CH.concat(['total']).forEach(c=>{const S=c==='total'?i.run.total:i.run.channels[c];if(S&&S.annual)S.annual.missingActualDays=spec.missing});
 const r=FP.reportBuilder.build.__orig(i);const g=id=>r.pages.find(p=>p.id===id)||{};
 const pc=g('pacing');const rows=((pc.tables||[])[0]||{rows:[]}).rows;
 return {ids:r.pages.filter(p=>p.status==='included').map(p=>p.id),pac:{st:pc.status,h:pc.headline||'',mon:pc.monthLabel||'',period:pc.periodLabel||''},rows:rows.map(x=>({ch:x.channel,gap:x.gap,tot:!!x._total,real:x.real})),
   kreal:((pc.kpis||[]).find(k=>k.id==='real')||{}).value,
   cover:g('cover').headline||'',
   drv:{st:g('drivers').status,h:g('drivers').headline||'',title:(g('drivers').status==='included'?FP.reportCopy.title(g('drivers'),r):'')||'',rows:(((g('drivers').tables||[])[0]||{rows:[]}).rows||[]).map(x=>[x.driver,x.contribution])},
   trN:{h:g('trends').headline||'',kd:((g('trends').kpis||[]).find(k=>k.id==='drag')||{}).sub||'',kc:((g('trends').kpis||[]).find(k=>k.id==='comp')||{}).sub||'',td:((g('trends').tables||[])[0]||{}).total,tc:((g('trends').tables||[])[1]||{}).total,rows:((g('trends').tables||[])[0]||{rows:[]}).rows.length},
   sumNotes:(g('summary').items||[]).map(x=>x.note||'').join(' | '),trCtx:g('trends').ctx||'',cvH:g('customers').headline||'',
   sumTitle:(FP.reportCopy.title(g('summary'),r)||''),clH:(FP.reportCopy.title(g('closing'),r)||''),
   sumN:g('summary').narrative||'',sumT:(g('summary').items||[]).map(x=>x.title).join(' | '),sumH:g('summary').headline||'',
   cl:(g('closing').blocks||[]).map(b=>({t:b.title,big:b.big,u:b.unit,x:b.text,l:(b.list||[]).map(z=>z.name)})),clSt:g('closing').status,
   all:JSON.stringify(r.pages.filter(p=>p.status==='included').map(p=>[p.headline,p.question,p.narrative,(p.blocks||[]).map(b=>b.text),(p.notes||[])]))}}"""
DIR = {'below': r'por debajo', 'above': r'por encima', 'line': r'en línea'}
def dirs(txt): return {k for k, v in DIR.items() if re.search(v, txt)}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await boot(b); await generate(q)
        async def run(spec): return await q.evaluate(JS, spec)
        base = await run({})
        tot0 = next(r for r in base['rows'] if r['tot'])
        chk('DX-0 hay filas por canal y total en el escenario base', len([r for r in base['rows'] if not r['tot']]) >= 3 and tot0, base['rows'])
        # ---- estabilidad: mismos datos, mismos textos; un campo ajeno no cambia nada
        again = await run({})
        chk('DX-1 mismos datos → mismos textos', again['all'] == base['all'])
        # ---- resultado negativo / positivo / neutral del total
        for name, spec, want in [('negativo (todo ×0.7)', {'scale': {c: 0.7 for c in CH}}, 'below'), ('positivo (todo ×1.5)', {'scale': {c: 1.5 for c in CH}}, 'above'), ('neutral (real = plan)', {'eqPlan': CH}, 'line')]:
            r = await run(spec)
            texts = {'pacing': r['pac']['h'], 'resumen-narrativa': re.split(r'\.\s', r['sumN'])[0], 'resumen-hallazgo': r['sumT'].split(' | ')[0]}
            for k, v in texts.items():
                d = dirs(v)
                chk(f'DX-2 {name}: {k} expresa «{want}» y no el opuesto', want in d and len(d) == 1, v)
            c0 = r['cl'][0]['x'] if r['cl'] else ''
            sg = {'below': '(−$', 'above': '(+$', 'line': '($0)'}[want]
            chk(f'DX-2 {name}: el cierre muestra la diferencia con el signo correcto {sg}', sg in c0 or (want == 'line' and '$0' in c0), c0)
            if want == 'above': chk(f'DX-2 {name}: no hay «peor canal» (ninguno queda bajo su plan)', 'principal área de atención es' not in r['sumN'] or not [x for x in r['rows'] if not x['tot'] and x['gap'] < 0], r['sumN'])
            if want == 'below': chk(f'DX-2 {name}: no se nombra «canal que más sobresale» (ninguno supera su plan)', 'es el canal que más sobresale' not in r['sumN'], r['sumN'])
            if want == 'line': chk(f'DX-2 {name}: sin canal que sobresalga ni rezagado', 'canal que más sobresale' not in r['sumN'] and 'canal más rezagado' not in ' '.join(c['x'] or '' for c in r['cl']), r['sumN'])
        # ---- cambia el canal que ocupa el primer lugar
        chans = [r for r in base['rows'] if not r['tot']]
        top = max(chans, key=lambda r: r['gap'])['ch']
        low = min(chans, key=lambda r: r['gap'])['ch']
        r1 = await run({'scale': {c: 1.0 for c in CH}}); chk('DX-3 control: escala 1.0 no cambia el mejor canal', (top in r1['sumN']) or ('sobresale' not in r1['sumN']), r1['sumN'])
        # subir mucho un canal que NO es el mejor → ahora es el mejor y el texto lo nombra
        other = next(c for c in CH if FP_LABEL(c) != top)
        r2 = await run({'scale': {other: 4.0}})
        best2 = max([x for x in r2['rows'] if not x['tot']], key=lambda x: x['gap'])
        chk('DX-3 cambia el canal líder → la narrativa nombra al nuevo líder', f"{best2['ch']} es el canal que más sobresale" in r2['sumN'], (best2['ch'], r2['sumN'][:300]))
        chk('DX-3 el cierre («Qué suma») nombra al mismo canal líder', best2['ch'] in ' '.join((c['x'] or '') + ' '.join(c['l']) for c in r2['cl'] if c['t'] in ('Qué suma', 'Qué sobresalió')), r2['cl'])
        if best2['ch'] != top: chk('DX-3 el líder anterior ya no aparece como el que más sobresale', f"{top} es el canal que más sobresale" not in r2['sumN'], r2['sumN'][:300])
        # bajar mucho el canal líder → deja de ser el que sobresale
        topk = next(c for c in CH if FP_LABEL(c) == top)
        r3 = await run({'scale': {topk: 0.05}})
        chk('DX-3 el líder cae por debajo del plan → ya no se dice que sobresale', f"{top} es el canal que más sobresale" not in r3['sumN'], r3['sumN'][:300])
        # ---- empate de brechas entre dos canales: determinista y sin romper
        rt1 = await run({'gapEq': ['app', 'whatsapp', 1000]}); rt2 = await run({'gapEq': ['app', 'whatsapp', 1000]})
        chk('DX-4 empate entre dos canales: mismo texto en dos corridas y nombra uno solo', rt1['all'] == rt2['all'] and len(re.findall(r'es el canal que más sobresale', rt1['sumN'])) <= 1, rt1['sumN'][:260])
        # ---- sin plan: no se afirma cumplimiento
        rn = await run({'planNull': True})
        txt = rn['pac']['h'] + ' ' + rn['sumN'] + ' ' + ' '.join(c['x'] or '' for c in rn['cl'])
        chk('DX-5 sin plan: ningún texto afirma estar por encima/debajo del plan ni «canal que sobresale»', not re.search(r'por (encima|debajo) del plan|canal que más sobresale|canal más rezagado', txt), txt[:300])
        chk('DX-5 sin plan: se dice qué falta (plan esperado a la fecha)', 'plan esperado a la fecha' in txt, txt[:300])

        chk('DX-5 sin plan: el cierre no afirma que ningún canal supera su plan', 'Ningún canal supera' not in ' '.join(c['x'] or '' for c in rn['cl']), [c['x'] for c in rn['cl']])
        # ---- datos insuficientes: sin días contados
        ri = await run({'counted0': True})
        txt = ri['sumN'] + ' ' + ' '.join(c['x'] or '' for c in ri['cl']) + ' ' + ri['sumT']
        chk('DX-6 sin días contados: no se conserva ninguna afirmación contra el plan', not re.search(r'por (encima|debajo) del plan|en línea con el plan', txt) or ri['pac']['st'] == 'included', (ri['pac'], txt[:300]))
        # ---- cambia la entidad que más resta (evolución)
        base_first = re.search(r'(?:pesa en la caída es|atención es) ([^:.,]+)', base['sumN'])
        rs = await run({'swapDrag': True}); rd = await run({'noDrag': True})
        chk('DX-7 el control sí nombra una entidad que concentra la caída', 'concentra' in base['sumT'] or 'lo que más pesa es' in base['sumN'], base['sumT'])
        chk('DX-7 sin entidades que restar: el resumen ya no habla de «lo que más pesa en la caída» ni «concentra»', 'lo que más pesa es' not in rd['sumN'] and 'concentra' not in rd['sumT'], rd['sumN'][:300])
        ent0 = re.search(r'lo que más pesa es ([^:]+):', base['sumN'])
        ent1 = re.search(r'(?:lo que más pesa es ([^:]+):|área de atención es ([^,]+),)', rs['sumN'])
        chk('DX-7 cambia la entidad principal → el resumen nombra la nueva y no la anterior', ent0 and ent1 and (ent1.group(1) or ent1.group(2)) != ent0.group(1) and ent0.group(1) not in rs['sumN'] + rs['sumT'], (ent0 and ent0.group(1), ent1 and ent1.groups()))
        chk('DX-7 los importes del resumen usan un solo formato abreviado ($6.26K, no $6,260)', not re.search(r'\$\d{1,3},\d{3}\b', rs['sumN']), rs['sumN'][-200:])


        # ---- relación entre factores (tráfico, conversión, ticket): el texto sigue al signo y al peso de cada uno
        d0 = await run({})
        chk('DX-11 titulares: el resumen y el cierre nombran la dimensión (canal / categoría / factor…) de lo que priorizan', re.search(r'la atención está en (la|el) (categoría|subcategoría|producto|canal|factor|sku|ciudad|sucursal|estado)', base['sumH'] + ' ' + base['sumTitle']) is not None or 'la atención está' not in (base['sumH'] + base['sumTitle']), base['sumTitle'] + base['sumH'])
        chk('DX-11 el cierre dice qué dimensión conviene revisar primero', 'conviene revisar primero' not in base['clH'] or re.search(r'conviene revisar primero (la|el) (categoría|subcategoría|producto|canal|factor|sku|ciudad|sucursal|estado)', base['clH']) is not None, base['clH'])
        chk('DX-11 el método de proyección no se repite en la narrativa y en la nota del mismo resumen', not ('depende del método' in base['sumN'] and 'depende del método' in base['sumNotes']), (base['sumN'][-160:], base['sumNotes'][:160]))
        chk('DX-11 periodos de la comparación sin abreviar ni confundir mes en curso con semana', not re.search(r'\b[A-Z][a-z]{2} (\d{4}|\d{1,2}\s*[–-]\s*\d{1,2})\b', base['trCtx']), base['trCtx'])
        chk('DX-11 el titular de clientes no usa «va al N %» ambiguo', 'el mes va al' not in base['cvH'], base['cvH'])
        chk('DX-11 signo negativo tipográfico en porcentajes de las láminas', not re.search(r'(?<![\w−])-\d+(\.\d+)? %', base['all'] + base['sumN']), base['all'][:200])
        chk('DX-10 hay diagnóstico de factores en el escenario base', d0['drv']['st'] == 'included' and len(d0['drv']['rows']) == 3, d0['drv'])
        NAMES = {'Tráfico': ('el tráfico', 'Tráfico'), 'Conversión': ('la conversión', 'Conversión'), 'Ticket': ('el ticket promedio', 'Ticket')}
        async def drv(spec, label):
            r = await run({'drv': spec}); rows = r['drv']['rows']; h = r['drv']['h']; ti = r['drv']['title']
            main = max(rows, key=lambda x: abs(x[1]))[0]
            chk(f'DX-10 {label}: el titular nombra como mayor aporte a «{main}»', NAMES[main][0] in h, (rows, h))
            pos = [x[0] for x in rows if x[1] > 0]; neg = [x[0] for x in rows if x[1] < 0]
            if pos and neg and ti:
                # todo nombre positivo aparece antes de «suma(n)», todo negativo antes de «resta(n)»
                m = re.match(r'(.*?) (?:suma|suman) y (.*?) (?:resta|restan);', ti)
                chk(f'DX-10 {label}: el título separa lo que suma ({[NAMES[x][1] for x in pos]}) de lo que resta ({[NAMES[x][1] for x in neg]})', m and all(NAMES[x][1].lower() in m.group(1).lower() for x in pos) and all(NAMES[x][1].lower() in m.group(2).lower() for x in neg), ti)
            if not neg and ti: chk(f'DX-10 {label}: sin factores que resten el título no dice que algo resta', ' resta' not in ti, ti)
            if not pos and ti: chk(f'DX-10 {label}: sin factores que sumen el título no dice que algo suma', ' suma' not in ti, ti)
            return r
        await drv({'traffic': -7e6, 'cr': 8e6, 'aov': -3e5}, 'conversión compensa la caída de tráfico')
        await drv({'traffic': 7e6, 'cr': -8e6, 'aov': 3e5}, 'se invierte: tráfico suma y conversión resta')
        await drv({'traffic': 1e6, 'cr': 2e6, 'aov': 3e6}, 'los tres suman')
        await drv({'traffic': -1e6, 'cr': -2e6, 'aov': -3e6}, 'los tres restan')
        await drv({'traffic': -5e6, 'cr': -1e5, 'aov': 9e6}, 'ticket compensa y es el mayor')
        # ---- períodos: el texto habla del período realmente mostrado
        mon0 = base['pac']['mon'].split(' ')[0].lower() if base['pac']['mon'] else ''
        chk('DX-8 base: la narrativa nombra el mes del pacing', mon0 and mon0 in base['sumN'].lower(), (mon0, base['sumN'][:200]))
        chk('DX-9 el resumen y el cierre no abrevian el mes («Sep 2026» / «Sep 21–27»): usan el nombre completo', not re.search(r'\b(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic) (\d{4}|\d{1,2}\s*[–-])', base['sumN'] + ' ' + base['sumT'] + ' ' + ' '.join(c['x'] or '' for c in base['cl'])), base['sumN'][:300])
        # ---- DX-12 · totales reales de productos que restan y suman (no el tope de 12 del motor)
        n0 = lambda s: int(re.match(r'\d+', s).group(0)) if re.match(r'\d+', s or '') else 0
        tr0 = base['trN']; a3 = await run({'addAll': {'drag': 5, 'compensate': 3}}); tr3 = a3['trN']
        chk('DX-12 el total de la tarjeta, de la tabla y del titular coinciden', tr0['td'] == n0(tr0['kd']) and tr0['tc'] == n0(tr0['kc']) and f"{tr0['td']} " in tr0['h'].replace('\xa0', ' '), tr0)
        chk('DX-12 al haber más elementos en el análisis completo, el total sube en las tres partes (no se queda en el tope)', n0(tr3['kd']) == n0(tr0['kd']) + 5 and n0(tr3['kc']) == n0(tr0['kc']) + 3 and tr3['td'] == tr0['td'] + 5 and tr3['tc'] == tr0['tc'] + 3 and f"{tr3['td']} " in tr3['h'], (tr0, tr3))
        chk('DX-12 las filas visibles de la tabla siguen siendo las mismas (solo cambia el conteo)', tr3['rows'] == tr0['rows'], (tr0['rows'], tr3['rows']))
        chk('DX-10 sin errores de redacción conocidos: «superóron», «frente a el», mes abreviado con año, sentido del plan diario', not re.search(r'superóron|frente a el |(?<!\d )\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}\b', base['all'] + base['sumN']) and not ('no una predicción' in base['all'] and 'no una proyección' in base['sumN'] and 'no una predicción' in base['sumN']), base['sumN'][:400])
        chk('DX-8 base: el título de portada nombra el mes y su forma (cerrado → solo el mes y año, abierto → «al corte») coincide con el corte', mon0 in base['cover'].lower() and ((re.search(r': \w+ \d{4}$', base['cover']) and 'al corte' not in base['cover']) or ('al corte' in base['cover'] and 'acumulado' in base['cover'])), base['cover'])
        yr0 = str(int(re.search(r'\d{4}', json.dumps(base['cover'])) .group(0))) if re.search(r'\d{4}', base['cover']) else '2026'
        mm = {'enero':'01','febrero':'02','marzo':'03','abril':'04','mayo':'05','junio':'06','julio':'07','agosto':'08','septiembre':'09','octubre':'10','noviembre':'11','diciembre':'12'}[mon0]
        ky = await q.evaluate("window.__edIn.run.year")
        ab = await run({'cutoff': f'{ky}-{mm}-10'}); ce = await run({'cutoff': f'{ky}-{mm}-28'}); cz = await run({'cutoff': f'{ky}-12-31'})
        chk('DX-8 mes abierto (corte a mitad de mes): «acumulado … al corte y cierre estimado»', 'acumulado de ' + mon0 in ab['cover'].lower() and 'al corte y cierre estimado' in ab['cover'], ab['cover'])
        chk('DX-8 mes cerrado (corte ≥ fin de mes): solo el mes, sin «al corte» ni «acumulado»', mon0 + ' ' + str(ky) in cz['cover'].lower() and 'resultados' not in cz['cover'] and 'al corte' not in cz['cover'] and 'acumulado' not in cz['cover'], cz['cover'])

        # mes sin datos de pacing (agosto en los datos de prueba): no se conserva ninguna conclusión contra el plan
        await month_prev(q); await generate(q); pv = await run({})
        mon1 = (re.search(r'(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)', pv['cover'].lower()) or [None, ''])[1]
        chk('DX-8 otro mes: el título de portada nombra el nuevo mes', mon1 and mon1 != mon0, (mon0, mon1, pv['cover']))
        txt = pv['sumN'] + ' ' + pv['sumT'] + ' ' + ' '.join(c['x'] or '' for c in pv['cl'])
        chk('DX-6 período sin pacing: ninguna afirmación contra el plan ni cifras del mes anterior', pv['pac']['st'] != 'included' and not re.search(r'por (encima|debajo) del plan|en línea con el plan', txt) and mon0 not in txt.lower(), (pv['pac']['st'], txt[:240]))
        chk('DX-6 período sin pacing: el reporte se construye sin errores y sin textos rotos', not re.search(r'undefined|NaN|\[object', pv['all']), pv['all'][:200])
        await q.evaluate("(()=>{Object.assign(FP.app.state.dx.settings,{periodType:'year',periodKey:String(FP.app.state.year)});FP.app.state.dx.run=null})()")
        await generate(q); yr = await run({})
        chk('DX-8 período anual (corte antes de fin de año): «acumulado 2026 al corte» y ya no nombra el mes', 'acumulado' in yr['cover'] and 'al corte' in yr['cover'] and mon0 not in yr['cover'].lower(), yr['cover'])
        yc = await run({'cutoff': f'{ky}-12-31', 'missing': 0}); ym = await run({'cutoff': f'{ky}-12-31', 'missing': 12})
        chk('DX-8 año completo (corte fin de año, sin días faltantes): sin «al corte»', yc['cover'].endswith(f': {ky}') and 'al corte' not in yc['cover'], yc['cover'])
        chk('DX-8 año con días sin dato: vuelve «al corte»', 'al corte' in ym['cover'], ym['cover'])
        chk('DX-8 período anual: la narrativa habla del negocio (no de un mes) y no nombra el mes anterior', 'el negocio' in yr['sumN'] and mon0 not in yr['sumN'].lower(), yr['sumN'][:260])
        for k, v in [('base', base['sumN']), ('año', yr['sumN'])]:
            chk(f'DX-9 {k}: el mes no aparece con mayúscula tras una coma', not re.search(r', (Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) 20\d\d', v), v[:200])
        await b.close()
    print(f'{ok} ok / {bad} fail'); sys.exit(1 if bad else 0)
def FP_fmt(v): return ''
def FP_LABEL(c): return {'ecommerce': 'Ecommerce', 'app': 'App', 'whatsapp': 'WhatsApp', 'llamadas': 'Llamadas'}[c]
asyncio.run(main())
