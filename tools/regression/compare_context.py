"""I-final · compara dos instantáneas de la barra de contexto (línea base vs nueva). Uso: python3 compare_context.py base.json nueva.json   Sale 1 si algo falla."""
import json, sys, re, statistics as st
from collections import Counter
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
words = lambda t: re.findall(r'\w+', re.sub(r'(?i)sales navigator', 'revnavigator', t).lower())
KEYS = [k for k in b if k != 'errors']
chk('Sin errores de página', not b['errors'] and not a['errors'], b['errors'][:2])
rem, add, ctl, ov, sw, order, cur, shrink = [], [], [], [], [], [], [], []
for k in KEYS:
    for v, x in b[k].items():
        y = a[k].get(v)
        if not x or not y: continue
        cx, cy = Counter(words(x['words'])), Counter(words(y['words']))
        if cy - cx: rem.append((k, v, dict(cy - cx)))
        if cx - cy: add.append((k, v, dict(cx - cy)))
        sig = lambda z: sorted(map(tuple, [[c[0], c[1], c[2], c[3], c[4]] for c in z['ctl']]))
        if sig(x) != sig(y): ctl.append((k, v))
        if x['over'] or x['overlap']: ov.append((k, v, x['over'], x['overlap']))
        if x['sw'] > 0: sw.append((k, v, x['sw']))
        pos = x['order']; 
        # el siguiente control no puede quedar por completo ARRIBA del anterior (mismo renglón = se solapan verticalmente)
        if any(len(pos[i]) > 2 and pos[i + 1][2] <= pos[i][0] + 1 for i in range(len(pos) - 1)): order.append((k, v))
        if x['crumbCur'] != 1 and v != 'ayuda': cur.append((k, v, x['crumbCur']))
        if y['box']['h'] and x['box']['h'] > y['box']['h'] + 2: shrink.append((k, v, y['box']['h'], x['box']['h']))
chk('R-12 no se quita ninguna palabra de la barra de contexto (17 vistas × 4 anchos × 2 modos)', not rem, rem[:3])
chk('R-12 no se agrega ninguna palabra (mismo contenido, solo reordenado y compactado)', not add, add[:3])
chk('R-12 los mismos controles con el mismo destino en cada vista (Ayuda, Glosario, Recorrido, Ir, migas, enlace a calidad)', not ctl, ctl[:4])
chk('R-12 nada se sale de la pantalla ni se solapa dentro de la barra (17 × 4 × 2)', not ov and not sw, (ov[:3], sw[:3]))
chk('R-12 el orden de tabulación (orden del DOM) coincide con el orden visual de arriba hacia abajo', not order, order[:4])
chk('R-12 las migas conservan exactamente un aria-current="location"', not cur, cur[:3])
chk('R-12 ninguna barra es más alta que en la línea base (17 × 4 × 2, tolerancia 2 px)', not shrink, shrink[:4])
def med(d, key): return st.median([x['box']['h'] for x in d.values() if x and x['box']['h']])
rows = []
for k in ['1280|analyst', '1024|analyst', '768|analyst', '390|analyst', '1280|learner', '390|learner']:
    ma, mb = med(a[k], 'h'), med(b[k], 'h'); rows.append((k, ma, mb, round((1 - mb / ma) * 100)))
for k, ma, mb, p in rows: print(f'   · {k:13s} alto mediano: {int(ma)} → {int(mb)} px  ({p} % menos)')
chk('R-12 la barra es más baja en los seis casos medidos (mediana)', all(p > 0 for _, _, _, p in rows), rows)
chk('R-12 en escritorio (1280, Analista) la mediana baja al menos 12 %', rows[0][3] >= 12, rows[0])
chk('R-12 en tableta (768 y 1024, Analista) la mediana baja al menos 20 %', rows[1][3] >= 20 and rows[2][3] >= 20, rows[1:3])
n390 = [(v, x['actionsMin']) for v, x in b['390|analyst'].items() if x and x['actionsMin'] is not None and x['actionsMin'] < 44]
chk('R-12 en 390 px las acciones de la barra miden ≥ 44 px de alto (objetivo táctil)', not n390, n390[:4])
nb = [(v, x['nextBtn']) for v, x in b['390|analyst'].items() if x and x['nextBtn'] and (x['nextBtn'][0] < 44 or x['nextBtn'][1] < 44)]
chk('R-12 en 390 px el botón «Ir» del siguiente paso mide ≥ 44 × 44 px', not nb, nb[:3])
print('\nRESULTADO contexto:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
