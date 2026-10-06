"""Compara dos instantáneas de Medir (recovery_snapshot.py <raiz> <out> <caps> medir) y evalúa las sondas M1–M7.
Uso: python3 compare_measure.py base.json nuevo.json [--allow-add]"""
import json, sys, re
from collections import Counter
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); fails = []; p = b['probe']
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
words = lambda t: re.findall(r'\w+', re.sub(r'(?i)sales navigator', 'revnavigator', t).lower())
chk('Sin errores de consola / pageerror / preparación', not b['errors'], b['errors'][:2])
chk('Sin scroll horizontal del documento (1280 / 768 / 390)', all(v <= 0 for v in b['overflow'].values()), b['overflow'])
chk('Tablas idénticas (filas, columnas y celdas)', a['tables'] == b['tables'], [(t['rows'], t['cols']) for t in b['tables']])
chk('Controles conservan id/name/data-action', a['controls'] == b['controls'], set(map(tuple, a['controls'])) ^ set(map(tuple, b['controls'])))
rem = Counter(words(a['text'])) - Counter(words(b['text'])); add = Counter(words(b['text'])) - Counter(words(a['text']))
chk('Texto (' + ('sin palabras eliminadas' if '--allow-add' in sys.argv else 'mismas palabras') + ')', (not rem) if '--allow-add' in sys.argv else (not rem and not add), dict(rem))
if add: print(f'   · palabras nuevas = {sorted(add.elements())}')
chk('Sin controles sin nombre accesible nuevos', set(b['unnamed']) <= set(a['unnamed']), b['unnamed'])
T = p['tok']; nd = {n['kind']: n for n in p['nodes']}
chk('M1 cadena trazable: 10 nodos con Plan → … → Resultado observado, cada uno con etiqueta de texto', len(p['nodes']) == 10 and [n['kind'] for n in p['nodes']] == ['Plan', 'Forecast', 'Brecha', 'Driver', 'Señal', 'Hipótesis', 'Escenario', 'Acción', 'Impacto simulado', 'Resultado observado'], [n['kind'] for n in p['nodes']])
chk('M2 Brecha / Driver / Señal / Hipótesis con los badges de evidencia (fact / driver / signal / hyp) y Acción neutro', all(w in nd[k]['badge'] for k, w in {'Brecha': 'ds-badge--fact', 'Driver': 'ds-badge--driver', 'Señal': 'ds-badge--signal', 'Hipótesis': 'ds-badge--hyp', 'Acción': 'ds-badge--neutral'}.items()) and len({nd[k]['color'] for k in ('Brecha', 'Driver', 'Señal', 'Hipótesis')}) == 4, {k: nd[k]['badge'] for k in ('Brecha', 'Driver', 'Señal', 'Hipótesis', 'Acción')})
chk('M3 Escenario e Impacto simulado: etiqueta de estado «Escenario» magenta punteada; Resultado observado: «Observado» verde continuo; Plan y Forecast con su estado', nd['Escenario']['stateText'] == 'Escenario' and nd['Impacto simulado']['stateText'] == 'Escenario' and nd['Escenario']['bs'] == 'dashed' and nd['Escenario']['color'] == T['scenario'] and nd['Resultado observado']['stateText'] == 'Observado' and nd['Resultado observado']['bs'] == 'solid' and nd['Resultado observado']['color'] == T['observed'] and nd['Plan']['stateText'] == 'Plan' and nd['Forecast']['stateText'] == 'Forecast' and nd['Forecast']['bs'] == 'dashed', {k: (v['stateText'], v['bs'], v['color']) for k, v in nd.items()})
chk('M4 escenario ≠ observado ≠ reforecast (colores distintos)', len({T['scenario'], T['observed'], T['reforecast']}) == 3 and nd['Escenario']['color'] != nd['Resultado observado']['color'], T)
sc = dict(p['th']).get('Impacto simulado')
chk('M5 «Impacto simulado»: encabezado con estado scenario y cada celda con el badge «Simulado» (magenta punteado)', sc == 'scenario' and p['simCells'] and all(c and c['t'].lower() == 'simulado' and 'ds-badge--scenario' in c['cls'] and c['bs'] == 'dashed' and c['color'] == T['scenario'] for c in p['simCells']), (dict(p['th']), p['simCells']))
chk('M6 todas las tablas usan ds-table y no hay style="" inline', p['tablesNoDs'] == 0 and not p['inlineStyle'], (p['tablesNoDs'], p['inlineStyle']))
chk('M7 lectura «consistente / no consistente»: nunca «causó»; se conserva «no establece causalidad»', not p['causal'] and p['mxNote'] and any('onsistente' in c for c in p['consist']), (p['causal'], p['mxNote'], p['consist']))
print('\nRESULTADO medir:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
