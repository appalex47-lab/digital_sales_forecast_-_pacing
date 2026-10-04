"""Compara dos instantáneas de recovery_snapshot.py y evalúa las sondas del lote Recovery Center.
Uso: python3 compare_recovery.py base.json nuevo.json [--allow-add]"""
import json, sys, re
from collections import Counter
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); fails = []; p = b['probe']
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
SIZE = re.compile(r'\d+(\.\d+)? (MB|GB|KB)')
words = lambda t: re.findall(r'\w+', SIZE.sub('<tam>', re.sub(r'(?i)sales navigator', 'revnavigator', t)).lower())
chk('Sin errores de consola / pageerror / preparación', not b['errors'], b['errors'][:2])
chk('Sin scroll horizontal del documento (1280 / 768 / 390)', all(v <= 0 for v in b['overflow'].values()), b['overflow'])
chk('Paridad del export action_plan_export con escenario, acción y medición', a['export'] == b['export'] and len(b['export']) == 1, (a['export'], b['export']))
chk('Tablas idénticas (filas, columnas y celdas)', a['tables'] == b['tables'], [(t['rows'], t['cols']) for t in b['tables']])
chk('Controles conservan id/name/data-action', a['controls'] == b['controls'], set(map(tuple, a['controls'])) ^ set(map(tuple, b['controls'])))
rem = Counter(words(a['text'])) - Counter(words(b['text'])); add = Counter(words(b['text'])) - Counter(words(a['text']))
if '--allow-removed' in sys.argv:   # palabras que pueden perder UNA aparición (p. ej. la etiqueta «Observado» de la tarjeta Actual, que ahora dice «Actual»)
    for w in sys.argv[sys.argv.index('--allow-removed') + 1].split(','):
        if rem.get(w, 0) >= 1: rem[w] -= 1
    rem = +rem
ok = (not rem and not add) if '--allow-add' not in sys.argv else not rem
chk('Texto (' + ('sin palabras eliminadas' if '--allow-add' in sys.argv else 'mismas palabras') + ')', ok, dict(rem))
if add: print(f'   · palabras nuevas = {sorted(add.elements())}')
chk('Sin controles sin nombre accesible nuevos', set(b['unnamed']) <= set(a['unnamed']), b['unnamed'])
T = p['tok']
chk('R1 escenario: todas las etiquetas «Simulado» son ds-badge--scenario (magenta, borde punteado), con texto', len(p['sim']) >= 4 and all('ds-badge--scenario' in x['cls'] and x['color'] == T['scenario'] and x['bs'] == 'dashed' for x in p['sim']), [(x['cls'], x['color'], x['bs']) for x in p['sim']][:3])
chk('R2 escenario ≠ reforecast: el magenta de «Simulado» no es el violeta de Reforecast', T['scenario'] != T['reforecast'] and all(x['color'] != T['reforecast'] for x in p['sim']), (T, [x['color'] for x in p['sim']][:2]))
chk('R3 «Observado» usa ds-badge--observed / state-tag--observed (misma paleta: verde, continuo) y nunca el estilo del escenario', len(p['obs']) >= 1 and all(('ds-badge--observed' in x['cls'] or 'state-tag--observed' in x['cls']) and x['color'] == T['observed'] and x['bs'] == 'solid' for x in p['obs']), p['obs'])
chk('R4 el panel del simulador marca «simulación» con borde punteado del token de escenario', bool(p['panelSim']) and p['panelSim']['bl'].startswith('dashed') and p['panelSim']['blc'] == T['scenario'], p['panelSim'])
tags = {c['label'].split(' ')[0]: c['tag'] for c in p['gapCards']}
chk('R5 brecha: 6 métricas .metric-card; Plan / Actual / Forecast / Reforecast con etiqueta de estado y «Presión» sin ella', len(p['gapCards']) == 6 and tags.get('Plan') == 'Plan' and tags.get('Actual') == 'Actual' and tags.get('Forecast') in ('Forecast', '') and tags.get('Presión') == '', p['gapCards'])
chk('R6 simulador y escenarios guardados usan .metric-card (≥ 9: 6 del simulador + 3 de la suma)', p['simCards'] >= 9, p['simCards'])
chk('R7 todas las tablas usan ds-table', p['tablesNoDs'] == 0, p['tablesNoDs'])
th = dict((t[0], t[1]) for t in p['trackTh'])
chk('R8 seguimiento: Baseline / Escenario / Observado con estado propio (baseline, scenario, observed)', th.get('Baseline') == 'baseline' and th.get('Escenario Simulado') == 'scenario' and th.get('Observado Observado') == 'observed', th)
chk('R9 barras de cierre con tokens de estado: escenario rayado magenta; actual (token) y reforecast (token) distintos entre sí y del escenario', 'repeating-linear-gradient' in p['barScenario'][1] and T['scenario'] in p['barScenario'][1] and T['reforecast'] not in p['barScenario'][1] and p['barActual'][0] == T['actual'] and p['barReforecast'][0] == T['reforecast'] and T['actual'] != T['reforecast'], (p['barScenario'], p['barActual'], p['barReforecast'], T))
chk('R10 sin style="" inline (salvo el ancho dinámico de las barras)', not p['inlineStyle'], p['inlineStyle'])
chk('R11 se conserva la advertencia «simulación… no predicción» visible', p['warn'])
chk('R12 lectura del seguimiento: «consistente / no consistente», nunca «causó»', p['consist'] and all('onsistente' in c or 'Sin datos' in c for c in p['consist']) and not p['causal'], (p['consist'], p['causal']))
tr = {x[0]: x for x in p['tree']}
want = {'Brecha': 'ds-badge--fact', 'Driver': 'ds-badge--driver', 'Señal': 'ds-badge--signal', 'Hipótesis': 'ds-badge--hyp', 'Escenario': 'ds-badge--scenario', 'Impacto simulado': 'ds-badge--scenario', 'Resultado observado': 'ds-badge--observed'}
chk('R13 cadena de trazabilidad: Brecha→Driver→Señal→Hipótesis con badges de evidencia, Escenario/Impacto simulado en magenta punteado y Resultado observado en verde (todos con texto)', len(p['tree']) == 8 and all(k in tr and w in tr[k][1] for k, w in want.items()) and tr['Escenario'][3] == 'dashed' and tr['Resultado observado'][3] == 'solid' and tr['Escenario'][2] != tr['Resultado observado'][2], p['tree'])
print('\nRESULTADO recovery:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
