"""Resume la salida de a11y_audit.py. Uso: python3 a11y_report.py <a11y.json> [--full]   Sale 1 si hay hallazgos (contraste, foco, táctil, estructura)."""
import json, sys, collections
R = json.load(open(sys.argv[1]))['views']; full = '--full' in sys.argv; fails = 0
def sect(t): print('\n== ' + t)
# contraste
c = collections.defaultdict(list)
for k, d in R.items():
    for x in d['contrast']: c[(x['el'], x['fg'], x['bg'], x['ratio'], x['need'])].append((k, x['text']))
sect(f'CONTRASTE real (AA): {len(c)} combinaciones bajo el mínimo')
for (el, fg, bg, ratio, need), v in sorted(c.items(), key=lambda t: t[0][3])[: (200 if full else 25)]:
    print(f'  {ratio}:1 (<{need}) {el}  {fg} sobre {bg}  · {len(v)} vistas · «{v[0][1]}»')
fails += len(c)
# foco
f = collections.Counter(); ftot = 0
for k, d in R.items():
    ftot += d['focus']['tested']
    for x in d['focus']['bad']: f[(x[0], x[1], x[2])] += 1
sect(f'FOCO visible con teclado: {ftot} controles probados, {sum(d["focus"]["badN"] for d in R.values())} sin contorno ≥ 2 px')
for (e, st, w), n in f.most_common(15 if not full else 60): print(f'  {e}  outline={st} {w}  · {n} veces')
fails += sum(d['focus']['badN'] for d in R.values())
# táctil
t = collections.Counter()
for k, d in R.items():
    for x in d.get('touch', []): t[(x[0], x[1], x[2])] += 1
sect(f'OBJETIVOS TÁCTILES en 390 px (< 44 × 44): {sum(t.values())} casos, {len(t)} tipos')
for (e, w, h), n in t.most_common(20 if not full else 100): print(f'  {e}  {w}×{h}  · {n} veces')
fails += sum(t.values())
# estructura
sect('ESTRUCTURA (1280, Analista)')
st = [(k.split('|')[0], d['struct']) for k, d in R.items() if 'struct' in d]
print('  lang:', {s['lang'] for _, s in st}, '| títulos distintos:', len({s['title'] for _, s in st}), 'de', len(st))
print('  skip-link:', {json.dumps(s['skip']) for _, s in st})
print('  h1 en el documento:', {s['h1Doc'] for _, s in st}, '| saltos de nivel de encabezado:', {v: s['levelSkips'] for v, s in st if s['levelSkips']})
print('  navs sin nombre:', {v: s['navsSinNombre'] for v, s in st if s.get('navsSinNombre')}, '| nombres:', {tuple(s['navNames']) for _, s in st})
print('  regiones:', {json.dumps(s['landmarks']) for _, s in st}); print('  aria-live:', {tuple(s['live']) for _, s in st})
bad_struct = [v for v, s in st if not s['skip'] or not s['skip']['firstTab'] or not s['skip']['target']] + [v + ':nav sin nombre' for v, s in st if s.get('navsSinNombre')] + [v + ':salto de encabezado' for v, s in st if s['levelSkips']] + ([] if len({s['title'] for _, s in st}) == len(st) else ['títulos repetidos'])
fails += len(bad_struct)
# color solo
sect('DEPENDE SOLO DEL COLOR')
co = collections.Counter()
for k, d in R.items():
    for x in d.get('coloronly', []): co[tuple(x)] += 1
for x, n in co.items(): print('  ', x, n)
fails += sum(co.values())
# tipografía y radios
sect('COHERENCIA (tamaños de letra y radios usados, 1280 Analista)')
fs, rad = collections.Counter(), collections.Counter()
for k, d in R.items():
    if 'styles' in d:
        for a, n in d['styles']['fs'].items(): fs[a] += n
        for a, n in d['styles']['rad'].items(): rad[a] += n
print('  tamaños:', dict(sorted(fs.items(), key=lambda t: float(t[0][:-2])))); print('  radios:', dict(sorted(rad.items(), key=lambda t: float(t[0].split()[0][:-2]))))
print('\nRESULTADO a11y:', 'OK' if not fails else f'{fails} hallazgos (contraste + foco + táctil + estructura + color solo)'); sys.exit(1 if fails else 0)
