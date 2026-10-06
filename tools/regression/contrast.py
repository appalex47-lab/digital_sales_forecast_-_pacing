"""Contraste WCAG AA de los pares texto/fondo de los tokens --ds-* (Fase 9.x, §4.3/Etapa J).
Uso: python3 contrast.py [raiz]. Sale 1 si algún par requerido no llega a AA."""
import re, sys, os
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
css = open(os.path.join(ROOT, 'css/design-system.css'), encoding='utf-8').read()
T = {m.group(1): m.group(2).upper() for m in re.finditer(r'--ds-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', css)}
def lum(h):
    c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + .05) / (lb + .05)
PAIRS = [('text', 'surface', 4.5), ('text', 'bg', 4.5), ('text-2', 'surface', 4.5), ('text-2', 'surface-2', 4.5), ('text-muted', 'surface', 4.5), ('text-muted', 'bg', 4.5),
         ('accent', 'surface', 4.5), ('accent', 'accent-soft', 4.5), ('on-accent', 'accent', 4.5), ('on-accent', 'accent-hover', 4.5),
         ('success', 'success-soft', 4.5), ('warning', 'warning-soft', 4.5), ('danger', 'danger-soft', 4.5), ('info', 'info-soft', 4.5),
         ('plan', 'plan-soft', 4.5), ('actual', 'actual-soft', 4.5), ('forecast', 'forecast-soft', 4.5), ('reforecast', 'reforecast-soft', 4.5),
         ('scenario', 'scenario-soft', 4.5), ('observed', 'observed-soft', 4.5),
         ('fact', 'fact-soft', 4.5), ('driver', 'driver-soft', 4.5), ('signal', 'signal-soft', 4.5), ('hyp', 'hyp-soft', 4.5),
         ('accent', 'surface', 3.0, 'foco/UI'), ('focus-dark', 'nav', 3.0, 'foco sobre header'), ('control-border', 'surface', 3.0, 'borde de control'), ('control-border', 'bg', 3.0, 'borde de control')]
# Etapa J · pares con los tokens antiguos --c-* (styles.css) y con el encabezado oscuro: también deben llegar a AA
css_legacy = open(os.path.join(ROOT, 'css/styles.css'), encoding='utf-8').read()
L = {m.group(1): m.group(2).upper() for m in re.finditer(r'--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', css_legacy)}
T.update({'c-' + k: v for k, v in L.items()})
T.update({'white': '#FFFFFF', 'hdr-soft': '#DCE6FA', 'hdr-muted': '#B9C7E4'})
PAIRS += [('c-ink', 'c-surface', 4.5), ('c-ink', 'c-paper', 4.5), ('c-ink-soft', 'c-surface', 4.5), ('c-muted', 'c-surface', 4.5), ('c-muted', 'c-paper', 4.5),
          ('c-accent', 'c-surface', 4.5), ('c-accent', 'c-accent-soft', 4.5), ('c-accent-ink', 'c-accent', 4.5),
          ('c-ok', 'c-ok-soft', 4.5), ('c-warn', 'c-warn-soft', 4.5), ('c-err', 'c-err-soft', 4.5), ('c-na', 'c-na-soft', 4.5), ('c-na', 'c-surface', 4.5),
          ('c-ok', 'c-surface', 4.5), ('c-warn', 'c-surface', 4.5), ('c-err', 'c-surface', 4.5),
          ('white', 'nav', 4.5, 'texto del encabezado'), ('hdr-soft', 'nav', 4.5, 'etiqueta de fase'), ('hdr-muted', 'nav', 4.5, 'marcador del buscador'),
          ('white', 'success', 4.5, 'texto blanco sobre estado'), ('white', 'actual', 4.5, 'paso del recorrido'), ('white', 'forecast', 4.5, 'paso del recorrido'),
          ('white', 'reforecast', 4.5, 'paso del recorrido'), ('white', 'scenario', 4.5, 'paso del recorrido'), ('white', 'observed', 4.5, 'paso del recorrido'), ('white', 'accent', 4.5, 'paso del recorrido')]
bad = 0; print(f"{'texto':<14}{'fondo':<16}{'razón':>7}  requerido  resultado")
for p in PAIRS:
    fg, bg, need = p[0], p[1], p[2]
    if fg not in T or bg not in T: print(f'{fg:<14}{bg:<16}  (token no definido)'); continue
    r = cr(T[fg], T[bg]); ok = r >= need; bad += (not ok)
    print(f"{fg:<14}{bg:<16}{r:>6.2f}:1  ≥{need:<8}{'✔' if ok else '✘'} {p[3] if len(p) > 3 else ''}")
print('RESULTADO contraste:', 'OK' if not bad else f'{bad} pares bajo AA')
sys.exit(1 if bad else 0)
