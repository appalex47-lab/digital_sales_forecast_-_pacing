"""Recovery Center: bloque «Estado por canal» (meta sana pero gap en canales). Uso: python3 -I batch_rc_estado_canales.py <raiz>"""
import asyncio, sys, os, datetime as dt, threading, functools, http.server, socketserver
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recovery_state import prepare
from playwright.async_api import async_playwright
ROOT = os.path.abspath(sys.argv[1])
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start(); port = s.server_address[1]
fails = []
def chk(n, ok, d=''):
    print(('✔ ' if ok else '✘ ') + n + (' — ' + str(d)[:420] if d and not ok else ''))
    if not ok: fails.append(n)
INJ = """(st)=>{const rc=FP.app.state.rc; rc.chStatus=st; FP.recoveryCenter.render(FP.app.state);}"""
def ch(id, label, plan, fc, sc=0, ac=0):
    gap = plan - fc
    return {'id': id, 'label': label, 'valid': True, 'plan': plan, 'forecast': fc, 'gap': gap, 'pct': gap / plan, 'scenarios': sc, 'actions': ac}
def mk(total, chs, ptype='month'):
    wg = sorted([c for c in chs if c['gap'] > 0], key=lambda c: -c['gap']); hl = sorted([c for c in chs if not c['gap'] > 0], key=lambda c: c['gap'])
    return {'total': total, 'withGap': wg, 'healthy': hl, 'gapSum': sum(c['gap'] for c in wg), 'periodType': ptype, 'periodLabel': 'Octubre 2026'}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        for tag, vw in [('D', 1280), ('M', 390)]:
            q = await (await b.new_context(viewport={'width': vw, 'height': 900})).new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
            r = await prepare(q, u); chk(f'{tag}0 partida', r == 'ok', r)
            await q.select_option('#rc-pkey', '2026-10'); await q.wait_for_timeout(1200)
            real = await q.evaluate("(()=>{const s=FP.app.state.rc.chStatus; return s?{n:s.withGap.length, ids:s.withGap.map(x=>x.id), gaps:s.withGap.map(x=>x.gap), hid:document.getElementById('rc-status-panel').hidden, total:s.total&&s.total.gap}:null})()")
            print('   real:', real)
            chk(f'{tag}1 el estado por canal se calcula con los datos reales', real is not None, real)
            # Cruce: el gap de cada tarjeta = la brecha que muestra el Recovery al elegir ese canal
            if real and real['n']:
                for cid, g in zip(real['ids'], real['gaps']):
                    await q.select_option('#rc-ch', cid); await q.wait_for_timeout(900)
                    gb = await q.evaluate("FP.app.state.rc.base.gap.gapBefore")
                    chk(f'{tag}2 gap de {cid} coincide con su brecha ({round(g)} vs {round(gb)})', abs(g - gb) < 1, [g, gb])
                await q.select_option('#rc-ch', 'total'); await q.wait_for_timeout(900)
            # Casos controlados
            A = ch('app', 'App', 9260000, 8140000, 1, 2); W = ch('whatsapp', 'WhatsApp', 3620000, 3280000); E = ch('ecommerce', 'Ecommerce', 5430000, 6040000); L = ch('llamadas', 'Llamadas', 1420000, 1430000)
            tot_ok = {'id': 'total', 'label': 'Total digital', 'valid': True, 'plan': 18200000, 'forecast': 18900000, 'gap': -700000, 'pct': -0.038}
            await q.evaluate(INJ, mk(tot_ok, [A, W, E, L]))
            t = await q.evaluate("({hid:document.getElementById('rc-status-panel').hidden, txt:document.getElementById('rc-status').innerText, cards:[...document.querySelectorAll('#rc-status .rcs__card')].map(c=>c.dataset.channel)})")
            chk(f'{tag}3 total sano + 2 canales con gap: aviso «sana, pero hay gap en 2 canales»', not t['hid'] and 'sana' in t['txt'].lower() and '2 canales' in t['txt'] and 'meta del mes' in t['txt'].lower(), t['txt'][:200])
            chk(f'{tag}4 tarjetas ordenadas por gap en pesos (App antes que WhatsApp), sanos aparte', t['cards'] == ['app', 'whatsapp'] and 'Ecommerce' in t['txt'] and 'Llamadas' in t['txt'], t)
            chk(f'{tag}5 botones: «Ver plan de App» (tiene escenario/acciones) y «Crear plan de WhatsApp»', 'Ver plan de App' in t['txt'] and 'Crear plan de WhatsApp' in t['txt'], t['txt'])
            tot_bad = {**tot_ok, 'gap': 500000, 'forecast': 17700000}
            await q.evaluate(INJ, mk(tot_bad, [A, W, E, L]))
            t = await q.inner_text('#rc-status'); chk(f'{tag}6 total con gap: el aviso lo dice distinto', 'con gap' in t.lower() and 'Gap en canales' in t, t[:160])
            await q.evaluate(INJ, mk(tot_ok, [E, L]))
            t = await q.inner_text('#rc-status'); chk(f'{tag}7 sin gap en ningún canal: «Todos los canales alcanzan su plan»', 'Todos los canales alcanzan su plan' in t and 'Falta' not in t, t[:160])
            # un canal elegido sin gap: el bloque se oculta; con gap: se queda
            await q.evaluate("FP.app.state.rc.settings.channel='ecommerce'")
            await q.evaluate(INJ, mk(tot_ok, [E, L])); chk(f'{tag}8 canal individual y ningún gap: bloque oculto', await q.evaluate("document.getElementById('rc-status-panel').hidden"))
            await q.evaluate("FP.app.state.rc.settings.channel='ecommerce'")
            await q.evaluate(INJ, mk(tot_ok, [A, W, E, L])); chk(f'{tag}9 canal individual con gaps en otros: el bloque sigue visible', not await q.evaluate("document.getElementById('rc-status-panel').hidden"))
            # botón: cambia el filtro Canal
            await q.evaluate("FP.app.state.rc.settings.channel='total'")
            await q.evaluate(INJ, mk(tot_ok, [A, W, E, L]))
            await q.evaluate("document.querySelector('#rc-status [data-channel=app] [data-action=rc-open-channel]').click()"); await q.wait_for_timeout(1500)
            v = await q.evaluate("({sel:document.getElementById('rc-ch').value, st:FP.app.state.rc.settings.channel})")
            chk(f'{tag}10 «Ver plan de App» cambia el filtro Canal a App', v['sel'] == 'app' and v['st'] == 'app', v)
            ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}11 sin desborde horizontal ({ov}px)', ov <= 1, ov)
            await q.context.close()
        chk('E sin errores de página', not errs, errs[:3])
        await b.close()
asyncio.run(main())
print('\nFALLAS:', fails or 'ninguna'); sys.exit(1 if fails else 0)
