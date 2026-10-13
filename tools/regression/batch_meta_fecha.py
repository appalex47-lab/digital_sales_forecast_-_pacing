"""Fecha estimada de cumplimiento de meta en Inicio, tabla de meses y gráfica acumulada. Uso: python3 batch_meta_fecha.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:380] if d and not ok else ''))
    if not ok: fails.append(n)
async def run(width):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        q = await b.new_page(viewport={'width': width, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 7, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(800)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})()")
        async def load(kind, gid):
            name, text = await q.evaluate("(id)=>{const g=FP.mockCsv.GENERATED.find(x=>x.id===id);return [g.fileName,g.text()]}", gid)
            await q.goto(u + '#carga'); await q.wait_for_selector(f'input[data-action="pick-files"][data-type="{kind}"]', state='attached')
            await q.set_input_files(f'input[data-action="pick-files"][data-type="{kind}"]', files=[{'name': name, 'mimeType': 'text/csv', 'buffer': text.encode()}])
            await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=120000); await q.click('[data-action="commit-staged"]')
            await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length===0", timeout=120000); await q.wait_for_timeout(500)
        for k, g in [('historical', 'gen-hist-2025'), ('historical', 'gen-hist-2026'), ('plan', 'gen-plan-2026'), ('actual', 'gen-actual-sep')]: await load(k, g)
        await q.goto(u + '#inicio'); await q.reload(); await q.wait_for_timeout(2000)
        home = await q.evaluate("(()=>{const e=document.querySelector('.home-key__goal');return e?{t:e.innerText,d:e.dataset.goalDate,s:e.dataset.goal}:null})()")
        # fecha calculada de forma independiente: primer día en que el acumulado del forecast diario llega a la meta anual
        ind = await q.evaluate("""()=>{const run=FP.app.state.fc.run;const se=run.total;let c=0;const goal=se.annual.plan.revenue;
          for(const d of se.days){c+=d.forecast.revenue;if(c+0.005>=goal)return {date:d.date,goal,cum:c}} return {date:null,goal,cum:c}}""")
        chk(f'M1[{width}] Inicio muestra la línea de meta del año', bool(home) and 'meta del año' in home['t'], home)
        chk(f'M2[{width}] la fecha de Inicio coincide con el cálculo independiente', bool(home) and (home['d'] or None) == ind['date'], (home, ind))
        chk(f'M3[{width}] se rotula como estimado cuando es proyección', bool(home) and home['s'] == 'projected' and 'estimado' in home['t'], home)
        await q.goto(u + '#pacing'); await q.reload(); await q.wait_for_timeout(2000)
        await q.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await q.wait_for_timeout(300)
        cells = await q.evaluate("[...document.querySelectorAll('#fc-periods tbody tr')].map(tr=>({n:tr.firstElementChild.innerText.trim(),s:(tr.querySelector('[data-goal]')||{dataset:{}}).dataset.goal,d:(tr.querySelector('[data-goal]')||{dataset:{}}).dataset.goalDate,t:(tr.querySelector('[data-goal]')||{innerText:''}).innerText}))")
        chk(f'M4[{width}] la tabla tiene 13 filas con columna de meta (12 meses + año)', len(cells) == 13 and all(c['s'] for c in cells), cells)
        chk(f'M5[{width}] la fila del año coincide con Inicio', cells[-1]['d'] == (home or {}).get('d'), cells[-1])
        mes = await q.evaluate("""()=>{const se=FP.app.state.fc.run.total;return se.months.map(m=>{let c=0,hit=null;for(const d of se.days){if(d.date<m.firstDate||d.date>m.lastDate)continue;c+=d.forecast.revenue;if(hit===null&&c+0.005>=m.plan.revenue)hit=d.date}return {k:m.key,hit,att:c/m.plan.revenue}})}""")
        ok = all((c['d'] or None) == m['hit'] for c, m in zip(cells[:12], mes))
        chk(f'M6[{width}] cada mes coincide con el cálculo independiente', ok, list(zip(cells[:12], mes)))
        chk(f'M7[{width}] meses que no llegan dicen «No se cumplió» (pasados) y traen su fecha vacía', all((c['s'] in ('missed', 'not_reached')) == (m['hit'] is None) for c, m in zip(cells[:12], mes)))
        chk(f'M8[{width}] meses pasados dicen «cumplida» y futuros «estimado»', all(('cumplida' in c['t']) for c, m in zip(cells[:9], mes[:9]) if c['s'] == 'reached') and all('estimado' in c['t'] for c in cells[9:]), cells)
        note = await q.evaluate("(document.querySelector('[data-goal-note]')||{innerText:''}).innerText")
        chk(f'M9[{width}] la gráfica muestra la nota y el marcador de meta', 'meta del año' in note and await q.evaluate("!!document.querySelector('[data-marker=goal]')"), note)
        chk(f'M10[{width}] sin desbordamiento horizontal', not await q.evaluate("document.documentElement.scrollWidth>innerWidth"))
        # métrica no aditiva: sin columna ni marcador
        await q.evaluate("FP.app.state.fc.metric='conversionRate';FP.app.render&&FP.app.render()"); await q.wait_for_timeout(800)
        na = await q.evaluate("({col:!!document.querySelector('#fc-periods [data-goal]'),mk:!!document.querySelector('[data-marker=goal]')})")
        chk(f'M11[{width}] métricas no aditivas no muestran fecha de meta', not na['col'] and not na['mk'], na)
        chk(f'M12[{width}] sin errores de página', not errs, errs)
        await b.close()
async def main():
    await run(1280); await run(375)
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
