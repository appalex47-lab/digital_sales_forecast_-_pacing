"""Infra común de pruebas del módulo Análisis (canal, comparaciones, drill-down).
Genera un dataset determinista de 4 canales y calcula la verdad aparte, en Python."""
import asyncio, sys, os, json, datetime as dt, threading, functools, http.server, socketserver, random
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []; passed = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:600] if (d != '' and not ok) else ''))
    (passed if ok else fails).append(n)
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
# (sku, producto, categoria, subcategoria, factor por canal)
PRODS = [
    ('S01', 'Alfa 10 mg', 'Cardio', 'Estatinas', dict(ecommerce=1.0, app=0.6, whatsapp=0.3, llamadas=0.2)),
    ('S02', 'Beta 20 mg', 'Cardio', 'Estatinas', dict(ecommerce=0.8, app=0.5, whatsapp=0.2, llamadas=0.1)),
    ('S03', 'Gamma 5 mg', 'Diabetes', 'Insulinas', dict(ecommerce=1.2, app=0.7, whatsapp=0.4, llamadas=0.3)),
    ('S04', 'Delta 1 g', 'Diabetes', 'Orales', dict(ecommerce=0.5, app=0.4, whatsapp=0.2, llamadas=0.1)),
    ('S05', 'Épsilon Nutri', 'Nutrición', 'Líquidos', dict(ecommerce=0.9, app=0.3, whatsapp=0.5, llamadas=0.0)),   # sin ventas por Llamadas
    ('S06', 'Zeta Sachet', 'Nutrición', 'Polvos', dict(ecommerce=0.7, app=0.0, whatsapp=0.1, llamadas=0.4)),       # sin ventas en App
    ('S07', 'Eta Nuevo', 'Nutrición', 'Líquidos', dict(ecommerce=1.0, app=0.5, whatsapp=0.3, llamadas=0.2)),       # solo desde 2026-10-01
    ('S08', 'Theta Cae', 'Cardio', 'Otros', dict(ecommerce=1.1, app=0.6, whatsapp=0.3, llamadas=0.3)),             # cae mes a mes
]
D0 = dt.date(2025, 9, 1); D1 = dt.date(2026, 10, 5)
def value(sku, ch, d, f):
    r = random.Random(f'{sku}|{ch}|{d.isoformat()}')
    months = (d.year - 2025) * 12 + d.month - 9          # 0 = sep-2025
    base = 1000 * f * (1 + 0.02 * months) * (1 + 0.15 * (d.weekday() == 5)) * (0.9 + 0.2 * r.random())
    if sku == 'S08': base *= max(0.15, 1 - 0.07 * months)
    if sku == 'S04' and d >= dt.date(2026, 10, 1): base *= 2.2
    return round(base, 2)
def build():
    rows = []; days = (D1 - D0).days + 1
    for i in range(days):
        d = D0 + dt.timedelta(days=i)
        for sku, nm, cat, sub, fac in PRODS:
            if sku == 'S07' and d < dt.date(2026, 10, 1): continue
            for ch in CH:
                f = fac[ch]
                if f <= 0: continue
                if ch == 'llamadas' and d.weekday() == 6: continue          # llamadas no opera domingo
                if ch == 'app' and sku == 'S03' and d.year == 2026 and d.month == 10: continue   # S03 sin venta App en octubre
                v = value(sku, ch, d, f); ped = max(1, int(v // 350)); uni = ped * 2
                rows.append((d.isoformat(), ch, sku, nm, cat, sub, v, ped, uni))
    return rows
ROWS = build()
def csv_text():
    return 'fecha,canal,sku,producto,categoria,subcategoria,venta,pedidos,unidades\n' + '\n'.join(','.join(str(x) for x in r) for r in ROWS) + '\n'
def truth(frm, to, ch=None, key=None):
    """Venta por entidad (key: sku|product|category|channel|total) en [frm,to] y canal ch (None = Σ canales)."""
    out = {}
    for d, c, sku, nm, cat, sub, v, p, u in ROWS:
        if d < frm or d > to or (ch and c != ch): continue
        k = {'product': nm, 'sku': sku, 'category': cat, 'subcategory': sub, 'channel': c, 'total': 'Total'}[key or 'total']
        out[k] = out.get(k, 0) + v
    return out
def tot(frm, to, ch=None): return sum(truth(frm, to, ch).values())
async def new_page(b, w=1280, h=900):
    c = await b.new_context(viewport={'width': w, 'height': h}); q = await c.new_page(); errs = []
    q.on('pageerror', lambda e: errs.append(str(e)[:300])); q.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0)); q._errs = errs
    return q
async def load_products(q, u):
    await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="products"]', state='attached')
    await q.set_input_files('input[data-action="pick-files"][data-type="products"]', files=[{'name': 'productos4.csv', 'mimeType': 'text/csv', 'buffer': csv_text().encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000); await q.click('[data-action="commit-staged"]')
    await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=120000); await q.wait_for_timeout(800)
async def open_an(q, u, **st):
    st.setdefault("metric", "revenue"); st.setdefault("periodCount", 12); st.setdefault("months", st["periodCount"])
    """Abre Análisis con el estado dado y espera a que termine de calcular ESE estado."""
    await q.goto(u + '#analisis'); await q.wait_for_function("window.FP && FP.app && FP.app.state && FP.productStore && FP.productStore.available()", timeout=30000)
    await q.wait_for_function("!FP.app.state.an.loading", timeout=90000)
    await q.evaluate("s=>{const a=FP.app.state.an;Object.assign(a,s,{rows:[],key:null,error:null});FP.app.actions['an-clear-selection']()}", st)
    await q.wait_for_function("(()=>{const a=FP.app.state.an;return !a.loading && a.key!==null && (a.share||a.error)})()", timeout=90000); await q.wait_for_timeout(300)
    er = await q.evaluate("FP.app.state.an.error")
    if er: print('   !! an.error =', er, st)
