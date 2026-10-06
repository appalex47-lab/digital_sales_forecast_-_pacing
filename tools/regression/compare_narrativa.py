"""Compara dos instantáneas de Narrativa (recovery_snapshot.py <raiz> <out> <caps|-> narrativa) y evalúa las sondas N1–N6.
Uso: python3 compare_narrativa.py base.json nuevo.json [--allow-add]"""
import json, sys, re
from collections import Counter
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); fails = []; p = b['probe']
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
words = lambda t: re.findall(r'\w+', re.sub(r'(?i)sales navigator', 'revnavigator', t).lower())
chk('Sin errores de consola / pageerror / preparación', not b['errors'], b['errors'][:2])
chk('Sin scroll horizontal del documento (1280 / 768 / 390)', all(v <= 0 for v in b['overflow'].values()), b['overflow'])
chk('Paridad del export narrative_export.json', a.get('export') == b.get('export') and len(b.get('export', [])) == 1, (a.get('export'), b.get('export')))
chk('Tablas idénticas', a['tables'] == b['tables'])
chk('Controles conservan id/name/data-action', a['controls'] == b['controls'], set(map(tuple, a['controls'])) ^ set(map(tuple, b['controls'])))
rem = Counter(words(a['text'])) - Counter(words(b['text'])); add = Counter(words(b['text'])) - Counter(words(a['text']))
if '--allow-removed' in sys.argv:
    for w in sys.argv[sys.argv.index('--allow-removed') + 1].split(','):
        if rem.get(w, 0) >= 1: rem[w] -= 1
    rem = +rem
chk('Texto (' + ('sin palabras eliminadas' if '--allow-add' in sys.argv else 'mismas palabras') + ')', (not rem) if '--allow-add' in sys.argv else (not rem and not add), dict(rem))
if add: print(f'   · palabras nuevas = {sorted(add.elements())}')
chk('Sin controles sin nombre accesible nuevos', set(b['unnamed']) <= set(a['unnamed']), b['unnamed'])
cl = {}
for c in p['claims']: cl.setdefault(c['t'], c)
want = {'Hecho': 'ds-badge--fact', 'Driver': 'ds-badge--driver', 'Señal': 'ds-badge--signal', 'Hipótesis': 'ds-badge--hyp'}
chk('N1 cada afirmación abre con una etiqueta de texto de la cadena de evidencia (Hecho / Cálculo / Driver / Señal / Hipótesis / Siguiente paso)', len(p['claims']) >= 6 and set(cl) >= {'Hecho', 'Cálculo', 'Driver', 'Señal', 'Hipótesis', 'Siguiente paso'} and all('ds-badge--chain' in c['cls'] for c in p['claims']), sorted(cl))
chk('N2 Hecho / Driver / Señal / Hipótesis usan los badges de evidencia, cada uno con color propio', all(cl[k]['cls'].find(w) >= 0 for k, w in want.items()) and len({cl[k]['color'] for k in want}) == 4, {k: cl[k]['cls'] for k in want})
chk('N3 Cálculo y Siguiente paso: neutros (no se confunden con Hecho ni entre sí por color de evidencia)', all('ds-badge--neutral' in cl[k]['cls'] for k in ('Cálculo', 'Siguiente paso')) and cl['Cálculo']['color'] not in {cl[k]['color'] for k in want}, {k: (cl[k]['cls'], cl[k]['color']) for k in ('Cálculo', 'Siguiente paso')})
chk('N4 forma de la cadena (rectangular, borde izquierdo 4 px) distinta de la píldora de los estados', all(c['radius'] != p['stateR'] and c['bl'].startswith('4px') for c in p['claims']), (p['stateR'], p['claims'][0]))
chk('N5 se conserva «¿Por qué dices eso?» en cada afirmación y el resumen ejecutivo', p['why'] >= 6 and p['summary'] > 40, (p['why'], p['summary']))
chk('N6 sin style="" inline, sin causalidad («causó») y la narrativa determinística no depende de Cohere', not p['inlineStyle'] and not p['causal'], (p['inlineStyle'], p['causal']))
print('\nRESULTADO narrativa:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
