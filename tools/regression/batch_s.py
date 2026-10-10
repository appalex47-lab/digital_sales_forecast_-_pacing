"""Fase 11 · pieza 2: traductor del CSV de GA4 a Segmentos. Uso: python3 batch_s.py <raiz>   Sale 1 si alguna falla.
S-1 se detecta y convierte el CSV de GA4 tal cual (comentarios «#», encabezados en español, fecha AAAAMMDD, números con comas).
S-2 web → Ecommerce; Android + iOS → App; filas sin fecha (totales) o con otra plataforma se omiten.
S-3 cada dimensión se suma por día, canal y segmento: en «Tráfico y conversión» sesiones, compras, ingresos, CR y AOV coinciden con
    sumas calculadas aparte del archivo de la prueba; fuente/medio se separa en Fuente y Medio; «(not set)» → «Sin dato (not set)».
S-4 los usuarios no se usan; el Diagnóstico ya no lista esas dimensiones como «no disponibles»; la tarjeta y la vista lo explican."""
import asyncio, sys, os, re, json, datetime as dt, zlib, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
h = functools.partial(Q, directory=ROOT); socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d) if d and not ok else ''))
    if not ok: fails.append(n)
PLAT = ['web', 'Android', 'iOS']; DEV = ['mobile', 'desktop', 'tablet']; SM = ['google / organic', 'google / cpc', '(direct) / (none)', 'facebook / paid_social']
CAMP = ['(organic)', 'buen_fin_2026', '(not set)', '(direct)']; LAND = ['/', '/medicamentos/glp1', '/no-route']; NR = ['new', 'returning']
def rows():
    out = []; d = dt.date(2026, 8, 2)
    while d <= dt.date(2026, 9, 30):
        for i, (p, dv, sm, cp, ld, nr) in enumerate([(PLAT[k % 3], DEV[(k // 2) % 3], SM[k % 4], CAMP[(k + 1) % 4], LAND[(k // 3) % 3], NR[k % 2]) for k in range(8)]):
            h_ = zlib.crc32(f'{d}{i}'.encode())
            ses = 800 + h_ % 2500; ped = h_ % 40; rev = round(ped * (900 + h_ % 300) + 0.37, 2) if ped else 0
            out.append((d.strftime('%Y%m%d'), p, dv, sm, cp, ld, nr, ses, ped, rev, ses - 3, ses + 5))
        d += dt.timedelta(days=1)
    return out
R = rows()
def fmt(n): return f'"{n:,}"' if isinstance(n, int) and n >= 1000 else (f'"${n:,.2f}"' if isinstance(n, float) else str(n))
CSV = ('# ----------------------------------------\n# Exploración libre\n# Propiedad: Prueba\n# 20260802-20260930\n# ----------------------------------------\n'
       'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras,Total de usuarios,Usuarios nuevos\n'
       + '\n'.join(','.join([r[0], r[1], r[2], r[3], r[4], r[5], r[6], fmt(r[7]), str(r[8]), fmt(r[9]), fmt(r[10]), fmt(r[11])]) for r in R)
       + '\nTotal,,,,,,,"999,999",999,"$999,999.00",1,1\n20260901,(not set),mobile,google / organic,(organic),/,new,"5,000",9,"$9,000.00",1,1\n')
CANAL = {'web': 'ecommerce', 'Android': 'app', 'iOS': 'app'}
def expect(col, val, ch=None, frm='20260901', to='20260930'):
    sel = [r for r in R if frm <= r[0] <= to and (ch is None or CANAL[r[1]] == ch) and col(r) == val]
    ses = sum(r[7] for r in sel); ped = sum(r[8] for r in sel); rev = sum(r[9] for r in sel)
    return {'traffic': ses, 'orders': ped, 'revenue': rev, 'cr': ped / ses if ses else None, 'aov': rev / ped if ped else None}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); u = f'http://127.0.0.1:{port}/index.html'
        errs = []; q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
        card = await q.evaluate("[...document.querySelectorAll('.upload-card')].find(c=>/Segmentos/.test(c.innerText)).innerText")
        chk('S-4 la tarjeta de Segmentos dice que acepta el CSV de GA4 tal cual, que no usa usuarios y cómo muestra «(not set)»', 'CSV exportado de GA4' in card and 'usuarios no se usan' in card and 'Sin dato (not set)' in card, card[:200])
        await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'ga4_export.csv', 'mimeType': 'text/csv', 'buffer': CSV.encode()}])
        await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000)
        toast = await q.evaluate("[...document.querySelectorAll('.toast, [role=status]')].map(t=>t.innerText).join(' | ')")
        await q.click('[data-action="commit-staged"]'); await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
        n_in = len(R)
        chk('S-1 se detecta como GA4 y se convierte (aviso con filas de GA4 → filas de segmentos); los totales y la plataforma «(not set)» se omiten', f'{n_in} filas de GA4' in toast and '2 filas sin fecha o con otra plataforma se omitieron' in toast, toast[:300])
        recs = await q.evaluate("[...FP.dataStore.resolveLatest(FP.app.state.store,'segments').values()].map(r=>[r.date,r.channel,r.dimension,r.segment])")
        chk('S-2 solo canales Ecommerce y App (web → Ecommerce; Android + iOS → App)', sorted({r[1] for r in recs}) == ['app', 'ecommerce'], sorted({r[1] for r in recs}))
        await q.goto(u + '#segmentos'); await q.wait_for_timeout(600)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodType'},value:'month'})"); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'periodKey'},value:'2026-09'})"); await q.wait_for_timeout(200)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'channel'},value:'total'})"); await q.wait_for_timeout(600)
        dims = await q.evaluate("[...document.querySelectorAll('#sg-dim option')].map(o=>o.innerText)")
        chk('S-3 la vista lista las 6 dimensiones (fuente/medio separada en Fuente y Medio) más el cruce Dispositivo × Fuente/medio', dims == ['Dispositivo', 'Fuente', 'Medio', 'Campaña', 'Landing', 'Tipo de cliente', 'Dispositivo × Fuente/medio'], dims)
        # la tabla principal (no la de oportunidad); la columna «Cuadrante» se omite para leer las cifras por posición
        TAB = "[...document.querySelectorAll('#view-segmentos table[aria-label*=\"tráfico y conversión\"] tbody tr')].map(r=>[...r.cells].filter((c,i)=>!(i===1&&r.closest('table').tHead.rows[0].cells[1].innerText.trim()==='Cuadrante')).map(c=>c.innerText.trim()))"
        num = lambda s: float(re.sub(r'[^0-9.\-]', '', s.replace('−', '-')) or 'nan')
        bad = []
        checks = [('device', 'Móvil', lambda r: r[2], 'mobile'), ('device', 'Escritorio', lambda r: r[2], 'desktop'), ('source', 'google', lambda r: r[3].split('/')[0].strip(), 'google'),
                  ('medium', 'cpc', lambda r: r[3].split('/')[1].strip(), 'cpc'), ('campaign', 'Sin dato (not set)', lambda r: r[4], '(not set)'), ('campaign', 'buen_fin_2026', lambda r: r[4], 'buen_fin_2026'),
                  ('landing', '/medicamentos/glp1', lambda r: r[5], '/medicamentos/glp1'), ('customer_type', 'Nuevo', lambda r: r[6], 'new'), ('customer_type', 'Recurrente', lambda r: r[6], 'returning')]
        for dim, seg, col, raw in checks:
            await q.select_option('#sg-dim', dim); await q.wait_for_timeout(300)
            rows_ = await q.evaluate(TAB); row = [r for r in rows_ if r[0] == seg]
            ex = expect(col, raw)
            if not row: bad.append((dim, seg, 'no aparece', [r[0] for r in rows_])); continue
            r = row[0]
            ok = abs(num(r[1]) - ex['traffic']) < 0.5 and abs(num(r[4]) - ex['orders']) < 0.5 and abs(num(r[8]) - ex['revenue']) < 1 and abs(num(r[5]) / 100 - ex['cr']) < 0.0001
            if not ok: bad.append((dim, seg, r, ex))
        chk('S-3 septiembre, Total: sesiones, compras, ingresos y CR por segmento coinciden con sumas calculadas aparte del CSV (9 segmentos de 6 dimensiones)', not bad, bad[:2])
        await q.select_option('#sg-dim', 'campaign'); await q.wait_for_timeout(300)
        segs = [r[0] for r in await q.evaluate(TAB)]
        chk('S-3 «(not set)» aparece como «Sin dato (not set)» y no queda ningún «(not set)» crudo', 'Sin dato (not set)' in segs and '(not set)' not in segs, segs)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'channel'},value:'app'})"); await q.wait_for_timeout(600)
        await q.select_option('#sg-dim', 'device'); await q.wait_for_timeout(300)
        r = [x for x in await q.evaluate(TAB) if x[0] == 'Móvil'][0]; ex = expect(lambda r: r[2], 'mobile', ch='app')
        chk('S-2 canal App = Android + iOS (Móvil en App coincide con la suma de esas dos plataformas)', abs(num(r[1]) - ex['traffic']) < 0.5 and abs(num(r[8]) - ex['revenue']) < 1, (r, ex))
        page = await q.evaluate("document.getElementById('view-segmentos').innerText")
        chk('S-4 los usuarios no aparecen y la vista explica que WhatsApp y Llamadas no tienen datos por segmento', 'usuarios' not in page.lower().replace('los usuarios no se usan', '') and 'WhatsApp y Llamadas no tienen datos por segmento' in page, page[-300:])
        await q.goto(u + '#diagnostico'); await q.wait_for_timeout(800)
        # contra plan, los segmentos se comparan con el mismo periodo del año anterior (sin datos en esta prueba); contra el periodo anterior sí aplican
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'channel'},value:'total'})"); await q.wait_for_timeout(300)
        await q.evaluate("FP.app.actions['dx-setting']({dataset:{key:'comparison'},value:'actual_vs_previous'})"); await q.wait_for_timeout(1000)
        tree = await q.evaluate("document.querySelectorAll('#view-diagnostico details.dx-more').forEach(d=>d.open=true); document.getElementById('dx-tree').innerText")
        chk('S-4 el Diagnóstico (Actual vs periodo anterior) ya usa esas dimensiones: no lista Dispositivo, Fuente, Medio, Campaña, Landing ni Tipo de cliente como «no disponibles»', not any(w in tree.split('No disponible en los datos actuales:')[-1].split('.')[0] for w in ('Dispositivo', 'Fuente', 'Medio', 'Campaña', 'Landing', 'Tipo de cliente')), tree[-300:])
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_s:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
