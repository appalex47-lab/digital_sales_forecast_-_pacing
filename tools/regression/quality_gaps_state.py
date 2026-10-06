"""Réplica del caso del usuario (Calidad de datos con huecos por canal), cargada por la vía real de la app (archivos CSV en «Carga de datos»).
Histórico 2024-01-01 → 2025-12-31 (731 días × 4 canales): App empieza el 2024-02-29 (59 días sin App), WhatsApp y Llamadas sin fila el 2024-06-15
→ 2,863 filas, 60 fechas con algún canal faltante. Venta real 2026-01-01 → 2026-09-28 (271 días): Llamadas sin fila del 2026-03-10 al 14
→ 1,079 filas, 5 fechas con algún canal faltante. Todas las celdas son válidas (sin advertencias de fila)."""
import datetime as dt, zlib

def _days(a, b):
    d = dt.date.fromisoformat(a); e = dt.date.fromisoformat(b)
    while d <= e:
        yield d.isoformat(); d += dt.timedelta(days=1)

CH = [('Ecommerce', 300, 4200), ('App', 110, 3300), ('WhatsApp', 25, 5000), ('Llamadas', 40, 5000)]   # (canal, pedidos/día, ticket)

def csv_text(start, end, skip):
    rows = ['fecha,canal,venta,pedidos,traffic_volume']
    for d in _days(start, end):
        for ch, orders, ticket in CH:
            if skip(d, ch): continue
            o = orders + (zlib.crc32((d + ch).encode()) % 7); vol = o * (20 if ch == 'Ecommerce' else 12 if ch == 'App' else 8)
            rows.append(f'{d},{ch},{o * ticket},{o},{vol}')
    return '\n'.join(rows) + '\n'

HIST = csv_text('2024-01-01', '2025-12-31', lambda d, ch: (ch == 'App' and d < '2024-02-29') or (ch in ('WhatsApp', 'Llamadas') and d == '2024-06-15'))
REAL = csv_text('2026-01-01', '2026-09-28', lambda d, ch: ch == 'Llamadas' and '2026-03-10' <= d <= '2026-03-14')

async def load(q, url):
    """Carga histórico y venta real con los botones reales y deja la app en Calidad de datos."""
    await q.goto(url + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="historical"]', state='attached')
    for typ, name, text in (('historical', 'historico.csv', HIST), ('actual', 'venta_real.csv', REAL)):
        await q.set_input_files(f'input[data-action="pick-files"][data-type="{typ}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode('utf-8')}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
        await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
    await q.goto(url + '#calidad'); await q.wait_for_timeout(900)
