"""Fase 5 · Recovery y Reforecast: resultado y brecha arriba; filtros, archivos, restricciones y detalle plegados sin perder datos.
Uso: python3 batch_rr5.py <raiz>"""
import asyncio, sys, os, threading, functools, http.server, socketserver, datetime as dt, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:500] if d != '' and not ok else '')); (fails.append(n) if not ok else None)
DAYS = [dt.date(2026, 8, 1) + dt.timedelta(days=i) for i in range(53)]            # 1-ago … 22-sep
CH = ['ecommerce', 'app', 'whatsapp', 'llamadas']
def vals(ch, d):
    r = random.Random(f'{ch}|{d}'); k = {'ecommerce': 1.0, 'app': .6, 'whatsapp': .3, 'llamadas': .2}[ch]
    sep = d.month == 9
    t = round(4000 * k * (0.82 if sep else 1.0) * (0.9 + .2 * r.random())); cr = (0.021 if ch == 'ecommerce' else 0.03) * (1.12 if sep else 1.0) * (0.95 + .1 * r.random())
    o = max(1, round(t * cr)); aov = 410 * (1.06 if sep else 1.0) * (0.95 + .1 * r.random()); return t, o, round(o * aov, 2)
ACT = 'fecha,canal,venta,pedidos,traffic_volume\n' + '\n'.join(f'{d},{c},{vals(c, d)[2]},{vals(c, d)[1]},{vals(c, d)[0] if c in ("ecommerce", "app") else ""}' for d in DAYS for c in CH) + '\n'
def truth(ch):
    a = [vals(ch, d) for d in DAYS if d.month == 8 and d.day <= 22]; b = [vals(ch, d) for d in DAYS if d.month == 9]
    T0, O0, R0 = (sum(x[i] for x in a) for i in range(3)); T1, O1, R1 = (sum(x[i] for x in b) for i in range(3))
    c0, c1, k0, k1 = O0 / T0, O1 / T1, R0 / O0, R1 / O1
    return dict(traffic=(T1 - T0) * c0 * k0, cr=T1 * (c1 - c0) * k0, aov=T1 * c1 * (k1 - k0), delta=R1 - R0, R0=R0, R1=R1)
SEG = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(
    f'{d},ecommerce,landing,{s},{o * (400 if d.month == 8 else 340)},{o},{t}' for d in DAYS for s, t, o in
    [('/home', 900 if d.month == 8 else 700, 30), ('/ofertas', 500, 15), ('/raro', 100 if d.month == 8 else 600, 0)]) + '\n'
money = lambda v: ('−' if round(v) < 0 else '+' if round(v) > 0 else '') + f'${abs(round(v)):,}'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); q = await b.new_page(viewport={'width': 1280, 'height': 900}); errs = []
        q.on('pageerror', lambda e: errs.append(str(e)[:300])); q.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' and 'Failed to load' not in m.text else None)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0))
        u = f'http://127.0.0.1:{port}/index.html'
        vis = lambda v: q.evaluate(f"(()=>{{const d=[...document.querySelectorAll('#view-{v} details.pacing-more')]; return {{n:d.length, shown:d.filter(x=>!x.hidden).length, open:d.filter(x=>x.open).length, layer:[...document.querySelectorAll('#view-{v} .home-layer')].some(x=>!x.hidden)}}}})()")
        # X0 · sin datos: no hay «Ver más» vacíos
        for v in ['reforecast', 'recovery']:
            await q.goto(u + '#' + v); await q.wait_for_timeout(900)
            r = await vis(v); chk(f'X0 sin datos «{v}»: ningún «Ver más» vacío ni etiqueta suelta', r['shown'] == 0 and not r['layer'], r)
        await prepare(q, u)
        top = lambda sel: q.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); return e? e.getBoundingClientRect().top + window.scrollY : null}})()")
        # ---------- Reforecast ----------
        await q.goto(u + '#reforecast'); await q.wait_for_selector('#rf-summary .metric-card', timeout=60000); await q.wait_for_timeout(700)
        o = {k: await top(s) for k, s in [('summary', '#rf-summary'), ('channels', '#rf-channels'), ('recovery', '#rf-recovery'), ('controls', '#rf-controls'), ('chart', '#rf-chart'), ('more', '#view-reforecast .pacing-more')]}
        chk('X1 Reforecast: resultado → por canal → escenario de recuperación → ajustes → gráfico → «Ver más»', all(v is not None for v in o.values()) and o['summary'] < o['channels'] < o['recovery'] < o['controls'] < o['chart'] < o['more'], o)
        r = await vis('reforecast')
        chk('X2 Reforecast: 4 «Ver más» (periodos, drivers, auditoría, versiones) cerrados', r['n'] == 4 and r['shown'] == 4 and r['open'] == 0 and r['layer'], r)
        v = await q.evaluate("(()=>({sum:document.querySelector('#rf-summary').checkVisibility(), ctl:document.querySelector('#rf-horizon').checkVisibility(), met:document.querySelectorAll('#view-reforecast [data-action=rf-metric]').length, per:document.querySelector('#rf-periods').checkVisibility()}))()")
        chk('X3 Reforecast: resultado y ajustes se ven sin abrir nada (5 métricas); el detalle no', v['sum'] and v['ctl'] and v['met'] == 5 and not v['per'], v)
        n = await q.evaluate("(()=>{document.querySelectorAll('#view-reforecast details.pacing-more').forEach(d=>d.open=true); return {per:document.querySelectorAll('#rf-periods tbody tr').length, drv:document.querySelector('#rf-drivers').textContent.trim().length, aud:document.querySelector('#rf-audit').textContent.trim().length, ver:!!document.querySelector('[data-action=rf-export]') && document.querySelector('#rf-versions').textContent.trim().length}})()")
        chk('X4 Reforecast abierto: tabla de periodos (13 filas), drivers, auditoría y versiones con «Exportar reforecast_export.json»', n['per'] == 13 and n['drv'] > 20 and n['aud'] > 20 and n['ver'], n)
        gap_rf = await q.evaluate("(()=>{const c=[...document.querySelectorAll('#rf-summary .metric-card')].find(x=>/Gap forecast/.test(x.querySelector('dt').innerText)); return c? c.querySelector('.metric-card__value').innerText.trim():null})()")
        await q.goto(u + '#pacing'); await q.wait_for_selector('#fc-kpis .metric-card', timeout=60000); await q.wait_for_timeout(600)
        gap_pc = await q.evaluate("(()=>{const c=[...document.querySelectorAll('#fc-kpis .metric-card')].find(x=>/Gap forecast/.test(x.querySelector('dt').innerText)); return c? c.querySelector('.metric-card__value').innerText.trim():null})()")
        chk('X5 el «Gap forecast» de Reforecast = el de Pacing (dos cálculos de la app que deben coincidir)', gap_rf is not None and gap_rf == gap_pc, (gap_rf, gap_pc))
        # ---------- Recovery Center ----------
        await q.goto(u + '#recovery'); await q.wait_for_selector('#rc-simulator select', timeout=60000); await q.wait_for_timeout(900)
        o = {k: await top(s) for k, s in [('ctx', '#rc-context'), ('gap', '#rc-gap'), ('sim', '#rc-simulator'), ('saved', '#rc-saved'), ('lib', '#rc-library'), ('plan', '#rc-plan'), ('track', '#rc-tracking'), ('more', '#view-recovery .pacing-more')]}
        chk('X6 Recovery Center: filtros → brecha → simulador → escenarios → catálogo → plan → seguimiento → «Ver más»', all(v is not None for v in o.values()) and o['ctx'] < o['gap'] < o['sim'] < o['saved'] < o['lib'] < o['plan'] < o['track'] < o['more'], o)
        r = await vis('recovery')
        chk('X7 Recovery Center: 3 «Ver más» (archivos y restricciones, inverso, trazabilidad) cerrados', r['n'] == 3 and r['shown'] == 3 and r['open'] == 0 and r['layer'], r)
        f = await q.evaluate("(()=>({ch:document.querySelector('#rc-ch').checkVisibility(), apply:document.querySelector('#rc-apply').checkVisibility(), pt:document.querySelectorAll('#view-recovery [data-action=rc-ptype]').length, file:document.querySelector('[data-action=rc-import]').checkVisibility(), exp:document.querySelector('[data-action=rc-export]').checkVisibility()}))()")
        chk('X8 Recovery Center: canal, periodo y «Aplicar a» se ven; importar y exportar quedan plegados', f['ch'] and f['apply'] and f['pt'] == 5 and not f['file'] and not f['exp'], f)
        n = await q.evaluate("(()=>{document.querySelectorAll('#view-recovery details.pacing-more').forEach(d=>d.open=true); const e=document.querySelector('#rc-extra'); return {imp:e.querySelectorAll('input[data-action=rc-import]').length, exp:e.querySelectorAll('[data-action=rc-export]').length, cmp:!!e.querySelector('#rc-cmp'), cons:e.querySelectorAll('[data-action=rc-constraint]').length, inv:document.querySelector('#rc-inverse').textContent.trim().length, tree:document.querySelector('#rc-tree').textContent.trim().length}})()")
        chk('X9 Recovery Center abierto: 2 importaciones, exportar, diagnóstico de origen, 4 restricciones, inverso y trazabilidad', n['imp'] == 2 and n['exp'] == 1 and n['cmp'] and n['cons'] == 4 and n['inv'] > 20 and n['tree'] > 20, n)
        # cambiar un filtro conserva lo abierto
        await q.select_option('#rc-apply', 'future'); await q.wait_for_timeout(600)
        op = await q.evaluate("document.querySelectorAll('#view-recovery details.pacing-more[open]').length")
        chk('X10 al cambiar un filtro, lo que la persona abrió sigue abierto', op == 3, op)
        await q.evaluate("document.querySelectorAll('#view-recovery details.pacing-more, #view-reforecast details.pacing-more').forEach(d=>d.open=false)")
        chk('Sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print(f'\n{len(fails)} FALLAN' if fails else '\nOK'); sys.exit(1 if fails else 0)
