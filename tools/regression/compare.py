"""Compara dos salidas de battery.py (línea base vs nueva). Falla (exit 1) ante cualquier regresión funcional.
Uso: python3 compare.py base.json nuevo.json [--allow-text VISTA,VISTA]  (allow-text: vistas cuyo texto puede cambiar)"""
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
allow = set(); allow_add = set()
if '--allow-text' in sys.argv: allow = set(sys.argv[sys.argv.index('--allow-text') + 1].split(','))
# --allow-add: vistas donde pueden APARECER palabras nuevas (p. ej. la etiqueta de estado de un badge) pero ninguna puede desaparecer
if '--allow-add' in sys.argv: allow_add = set(sys.argv[sys.argv.index('--allow-add') + 1].split(','))
# vistas que no existían en la base (p. ej. «ajustes»): T2/T8/T9/T10 se aplican, pero no hay contra qué comparar tablas, controles ni texto
NEW = [v for v in b['views'] if v not in a['views']]
GONE = [v for v in a['views'] if v not in b['views']]
if GONE: print('  · vistas que ya no existen como vista propia:', GONE)
for _k in ('text', 'tables', 'controls'):
    for _v in NEW: b[_k].pop(_v, None)
if NEW: print('  · vistas nuevas (sin base para comparar tablas/controles/texto):', NEW)
allow_ctl = set(sys.argv[sys.argv.index('--allow-controls') + 1].split(',')) if '--allow-controls' in sys.argv else set()   # vistas cuyos controles pueden cambiar (p. ej. un control que se mudó a otra vista)
fails = []
def chk(name, ok, det=''):
    print(('✔ ' if ok else '✘ ') + name + (' — ' + det if det and not ok else ''))
    if not ok: fails.append(name)
chk('T1 selfTest', b['selftest']['passed'] == b['selftest']['total'] and b['selftest'] == a['selftest'], f"{a['selftest']} vs {b['selftest']}")
chk('T2 vistas visibles', all(b['views'].values()), str([k for k, v in b['views'].items() if not v]))
chk('T3 errores de consola', not b['errors'], str(b['errors'][:3]))
chk('T4 paridad de exports', a['exports'] == b['exports'], str({k: (a['exports'].get(k), b['exports'].get(k)) for k in b['exports'] if a['exports'].get(k) != b['exports'].get(k)}))
chk('T5 persistencia', b['persist'] is True)
chk('T6 modos (solo Aprendiz y Analista, sin botones de modo en el encabezado)', b['modes'].get('topButtons') == 0 and b['modes']['learner'] == [True, False] and b['modes']['analyst'] == [False, False] and 'exec' not in b['modes'], str(b['modes']))
newov = {k: v for k, v in b['overflow'].items() if k not in a['overflow']}
chk('T7 sin scroll horizontal nuevo', not newov, str(newov))
chk('T8 navegación (1 aria-current)', all(v[0] == 1 for v in b['nav'].values()), str({k: v for k, v in b['nav'].items() if v[0] != 1}))
chk('T9 sin controles sin nombre nuevos', all(set(b['unnamed'][v]) <= set(a['unnamed'].get(v, [])) for v in b['unnamed']),
    str({v: sorted(set(b['unnamed'][v]) - set(a['unnamed'].get(v, []))) for v in b['unnamed'] if set(b['unnamed'][v]) - set(a['unnamed'].get(v, []))}))
chk('T10 sin foco invisible nuevo', all(set(b['focus'][v]['bad']) <= set(a['focus'].get(v, {}).get('bad', [])) for v in b['focus']),
    str({v: sorted(set(b['focus'][v]['bad']) - set(a['focus'].get(v, {}).get('bad', []))) for v in b['focus'] if set(b['focus'][v]['bad']) - set(a['focus'].get(v, {}).get('bad', []))}))
# tablas: mismas filas, columnas y valores
allow_tbl = set(sys.argv[sys.argv.index('--allow-tables') + 1].split(',')) if '--allow-tables' in sys.argv else set()   # vistas cuyas tablas se reorganizaron a propósito
td = {v: (a['tables'][v] != b['tables'][v]) for v in b['tables'] if v in a['tables'] and v not in allow_tbl}
chk('Tablas idénticas (filas, columnas y celdas)', not any(td.values()), str([v for v, x in td.items() if x]))
# controles: mismos id / name / data-action (ignora los de la barra global que no cambian)
cd = {}
for v in b['controls']:
    sa = {tuple(x) for x in a['controls'][v]}; sb = {tuple(x) for x in b['controls'][v]}
    if sa != sb and v not in allow_ctl: cd[v] = {'quitados': sorted(sa - sb)[:5], 'nuevos': sorted(sb - sa)[:5]}
    elif sa != sb: print(f'  · {v}: controles cambian (permitido): quitados={sorted(sa - sb)[:6]} nuevos={sorted(sb - sa)[:6]}')
chk('Controles conservan id/name/data-action (sin ajustes nuevos)', not cd, str(cd))
# texto: mismas palabras (reorganizar no elimina contenido)
import re
SIZE = re.compile(r'\d+(\.\d+)? (MB|GB|KB)')   # cuota de almacenamiento que estima el navegador: varía entre corridas (ruido del entorno, no contenido)
def words(t): return sorted(re.findall(r'\w+', SIZE.sub('<tam>', re.sub(r'(?i)sales navigator', 'revnavigator', t)).lower()))   # el renombre a RevNavigator no cuenta como texto cambiado
from collections import Counter
def removed(v): return sorted((Counter(words(a['text'][v])) - Counter(words(b['text'][v]))).elements())
def added(v): return sorted((Counter(words(b['text'][v])) - Counter(words(a['text'][v]))).elements())
tx = [v for v in b['text'] if v not in allow and v not in allow_add and words(a['text'][v]) != words(b['text'][v])]
chk('Texto: mismas palabras en cada vista', not tx, str(tx))
rm = {v: removed(v) for v in allow_add if v in b['text'] and removed(v)}
chk('Texto (vistas con --allow-add): no se elimina ninguna palabra', not rm, str(rm))
for v in sorted(allow_add):
    if v in b['text']: print(f'  · {v}: palabras nuevas = {added(v)}')
print('\nRESULTADO:', 'TODO EN VERDE' if not fails else 'FALLAS: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
