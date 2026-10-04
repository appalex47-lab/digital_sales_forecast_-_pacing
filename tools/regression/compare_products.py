"""Compara dos instantáneas de products_snapshot.py (línea base vs nueva) y evalúa las sondas del lote de Producto.
Uso: python3 compare_products.py base.json nuevo.json [--allow-add]   (allow-add: pueden aparecer palabras nuevas, ninguna puede desaparecer)"""
import json, sys, re
from collections import Counter
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
SIZE = re.compile(r'\d+(\.\d+)? (MB|GB|KB)')  # estimación de almacenamiento del navegador: varía entre corridas (ruido del entorno)
words = lambda t: re.findall(r'\w+', SIZE.sub('<tam>', re.sub(r'(?i)sales navigator', 'revnavigator', t)).lower())
chk('Sin errores de consola / pageerror', not b['errors'], b['errors'][:2])
chk('Sin scroll horizontal del documento (1280 / 768 / 390)', all(v <= 0 for v in b['overflow'].values()), b['overflow'])
chk('Paridad del export de Producto con datos', a['export'] == b['export'] and len(b['export']) == 1, (a['export'], b['export']))
for st in ('root', 'drill', 'trace'):
    x, y = a.get(st), b.get(st)
    if x is None or y is None: chk(f'{st}: estado capturado en base y nueva (si falta, la prueba no cubre ese estado)', False, 'no capturado'); continue
    chk(f'{st}: tablas idénticas (filas, columnas y celdas)', x['tables'] == y['tables'], [(t['rows'], t['cols']) for t in y['tables']])
    if '--storage-moved' in sys.argv:   # el bloque «Almacenamiento» se mudó a Configuración: sus dos botones y su texto ya no están en Producto
        x = dict(x); x['controls'] = [c for c in x['controls'] if c[3] not in ('storage-tests', 'storage-retry')]
        x['text'] = re.sub(r'Almacenamiento Modo:.*?(?=Datos de productos)', '', x['text'])
        y = dict(y); y['controls'] = [c for c in y['controls'] if tuple(c) != ('A', '', '', '', '')]   # el enlace nuevo «Configuración de RevNavigator» (sin id ni acción)
    chk(f'{st}: controles conservan id/name/data-action', x['controls'] == y['controls'], set(map(tuple, x['controls'])) ^ set(map(tuple, y['controls'])))
    rem = Counter(words(x['text'])) - Counter(words(y['text'])); add = Counter(words(y['text'])) - Counter(words(x['text']))
    ok = (not rem and not add) if '--allow-add' not in sys.argv else not rem
    chk(f'{st}: texto (' + ('sin palabras eliminadas' if '--allow-add' in sys.argv else 'mismas palabras') + ')', ok, dict(rem))
    if add: print(f'   · {st}: palabras nuevas = {sorted(add.elements())}')
    chk(f'{st}: sin controles sin nombre accesible nuevos', set(y['unnamed']) <= set(x['unnamed']), y['unnamed'])
p = b['probe']
chk('P1 las 9 métricas (6 + 3) son .metric-card y conservan su estado de dato (Disponible/Parcial/…)', p['cards'] == 9 and p['cardsWithStatus'] == 9, (p['cards'], p['cardsWithStatus']))
chk('P2 todas las tablas de Producto usan ds-table', p['tablesNoDs'] == 0, p['tablesNoDs'])
g = p['geo']
chk('P3 la geografía es un bloque propio con tokens del sistema (leyenda, fondo surface-2, borde 1px --ds-border, radio, min-width 0)', bool(g) and g['legend'].startswith('Geografía') and g['bg'] == p['tok']['surface2'] and g['border'] == 'solid 1px' and g['borderColor'] == p['tok']['border'] and g['radius'] != '0px' and g['minw'] == '0px' and g['selects'] >= 1, g)
chk('P4 la geografía solo existe dentro de Producto y solo dentro de su bloque', p['geoOutside'] == 0 and p['geoInProductOutsideFieldset'] == 0 and not p['navHasGeo'], p)
chk('P5 estado de cada grupo (Crece / Cae / Estable / Nuevo / Sin venta) con texto en cada fila', p['growth'] == 0, p['growth'])
chk('P6 se conserva la arquitectura: «Empezar por» (Categoría…) y la ruta de migas', p['viewByHasCategoria'] and p['crumbs'], p)
chk('P7 la tabla de Producto (13 columnas) no se desborda a la derecha en escritorio (1280 px)', not p.get('tblOver'), p.get('tblOver'))
print('\nRESULTADO productos:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
