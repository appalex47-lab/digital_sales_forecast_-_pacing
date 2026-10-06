"""Higiene del sistema de diseño en las vistas ya migradas (Fase 9.x, §4.4).
Falla (exit 1) si en una vista migrada aparece: color hex fuera de design-system.css, style="..." (salvo lista blanca),
!important en el CSS del sistema, o una tabla sin la clase ds-table. Uso: python3 lint_design.py [raiz]"""
import re, sys, os
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# Vistas migradas (se amplía lote a lote)
MIGRATED = ['import-view', 'quality-view', 'data-view', 'seasonality-view', 'planning-view', 'planning-config-view', 'business-view', 'pacing-view', 'forecast-view', 'reforecast-view', 'diagnostic-view', 'product-view', 'recovery-center', 'scenario-view', 'action-plan-view', 'measure-view', 'narrative-view', 'settings-view', 'package-view', 'segments-view']
# style="..." permitido solo si es un valor dinámico imprescindible (p. ej. ancho de barra). archivo -> patrón justificado
STYLE_WHITELIST = {r'style="width:\$\{': 'ancho dinámico de una barra de progreso', r'style="--dot:': 'color de canal dinámico (variable CSS)'}
HEX = re.compile(r'#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])')
fails = []
def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
for v in MIGRATED:
    p = f'js/ui/{v}.js'
    if not os.path.exists(os.path.join(ROOT, p)): p = f'js/ui/guidance/{v}.js'   # las vistas de guía viven en js/ui/guidance
    if not os.path.exists(os.path.join(ROOT, p)): continue
    src = rd(p)
    for i, line in enumerate(src.splitlines(), 1):
        if line.strip().startswith(('//', '*', '/*')): continue
        m = HEX.search(re.sub(r'&#\d+;|href="#[^"]*"|\$\{[^}]*#[^}]*\}|\'#[a-z-]+\'|"#[a-z-]+"|`#[a-z-]+`|#\{', '', line))
        if m and 'rgba' not in line and 'aria' not in line and 'href' not in line:
            fails.append(f'{p}:{i}: color hex fuera de design-system.css → {m.group(0)}')
        if 'style="' in line and not any(re.search(w, line) for w in STYLE_WHITELIST):
            fails.append(f'{p}:{i}: style="…" inline no permitido')
    # toda tabla emitida debe usar el componente común
    for m in re.finditer(r'<table class="([^"]*)"', src):
        if 'ds-table' not in m.group(1): fails.append(f'{p}: <table class="{m.group(1)}"> sin ds-table')
    if re.search(r'<table(?![^>]*class=)', src): fails.append(f'{p}: <table> sin clase')
css = rd('css/design-system.css')
for i, line in enumerate(css.splitlines(), 1):
    if '!important' in line and not line.strip().startswith(('/*', '*')): fails.append(f'css/design-system.css:{i}: !important prohibido')
# hex dentro de design-system.css solo en la definición de tokens (--ds-*) o el shell heredado; se reportan los nuevos de la Etapa I-base
base = css.split('ETAPA I-base')[-1] if 'ETAPA I-base' in css else ''
for i, line in enumerate(base.splitlines(), 1):
    if HEX.search(line) and not re.match(r'\s*:root\s*\{[^}]*--ds-[a-z-]+:\s*#', line): fails.append(f'design-system.css (I-base) línea {i}: hex fuera de un token → {line.strip()[:70]}')
print('Vistas migradas revisadas:', ', '.join(MIGRATED))
for f in fails: print('✘', f)
print('RESULTADO lint_design:', 'OK' if not fails else f'{len(fails)} hallazgos')
sys.exit(1 if fails else 0)
