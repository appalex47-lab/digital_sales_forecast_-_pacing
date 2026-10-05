"""«Tráfico y conversión» · parte 3 (cruce dispositivo × fuente/medio, tendencia semanal, «Simular en Recovery Center») y arreglos: avisos que se salían de la pantalla y reintento de Cohere en la Narrativa.
Datos de la parte 1: Uso: python3 batch_t.py <raiz>   Sale 1 si alguna falla.
Datos con resultado conocido (calculado aquí, aparte de la app): Móvil = mucho tráfico y CR bajo; Escritorio = estrella; Tableta = poco tráfico y CR alto;
Smart TV = poco volumen (CR 10 % que NO debe liderar rankings). Campañas con CR casi igual al total y poco volumen → «no concluyente»."""
import asyncio, sys, os, re, json, zlib, datetime as dt, threading, functools, http.server, socketserver
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
# (dimensión, segmento) → {mes: (sesiones, pedidos, AOV)}
SPEC = {('dispositivo', 'Móvil'): {9: (60000, 600, 1000), 8: (60000, 800, 1000)}, ('dispositivo', 'Escritorio'): {9: (35000, 1050, 1200), 8: (35000, 850, 1200)},
        ('dispositivo', 'Tableta'): {9: (4000, 200, 900), 8: (4000, 200, 900)}, ('dispositivo', 'Smart TV'): {9: (200, 20, 900), 8: (200, 20, 900)},
        ('campaña', 'cmp_a'): {9: (50000, 940, 1100), 8: (50000, 940, 1100)}, ('campaña', 'cmp_b'): {9: (1500, 29, 1100), 8: (1500, 29, 1100)},
        ('campaña', 'cmp_c'): {9: (47700, 901, 1100), 8: (47700, 901, 1100)}}
def days(m): return [dt.date(2026, 9, 1) + dt.timedelta(d) for d in range(30)] if m == 9 else [dt.date(2026, 8, 2) + dt.timedelta(d) for d in range(30)]
rows = []
for (dim, seg), per in SPEC.items():
    for m, (ses, ped, aov) in per.items():
        for i, d in enumerate(days(m)):
            sd = ses // 30 + (1 if i < ses % 30 else 0); pd_ = ped // 30 + (1 if i < ped % 30 else 0)
            rows.append(f'{d.isoformat()},ecommerce,{dim},{seg},{pd_ * aov},{pd_},{sd}')
CSV = 'fecha,canal,dimension,segmento,venta,pedidos,traffic_volume\n' + '\n'.join(rows) + '\n'
dev9 = {k[1]: v[9] for k, v in SPEC.items() if k[0] == 'dispositivo'}
T = sum(v[0] for v in dev9.values()); O = sum(v[1] for v in dev9.values()); crT = O / T
OPP = 60000 * (crT - 600 / 60000) * 1000
money = lambda v: f'${abs(v):,.0f}'
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
RG = rows()
def fmt(n): return f'"{n:,}"' if isinstance(n, int) and n >= 1000 else (f'"${n:,.2f}"' if isinstance(n, float) else str(n))
CSVG = ('# ----------------------------------------\n# Exploración libre\n# Propiedad: Prueba\n# 20260802-20260930\n# ----------------------------------------\n'
       'Fecha,Plataforma,Categoría de dispositivo,Fuente/medio de la sesión,Campaña de la sesión,Página de destino y cadena de consulta,Nuevo/Recurrente,Sesiones,Compras en comercio electrónico,Ingresos derivados de las compras,Total de usuarios,Usuarios nuevos\n'
       + '\n'.join(','.join([r[0], r[1], r[2], r[3], r[4], r[5], r[6], fmt(r[7]), str(r[8]), fmt(r[9]), fmt(r[10]), fmt(r[11])]) for r in RG)
       + '\nTotal,,,,,,,"999,999",999,"$999,999.00",1,1\n20260901,(not set),mobile,google / organic,(organic),/,new,"5,000",9,"$9,000.00",1,1\n')

MSG = '1 archivo en revisión. ga4_export_septiembre_2026_todas_las_plataformas.csv: export de GA4 convertido (12,345 filas de GA4 → 45,678 filas de segmentos; 3 filas sin fecha o con otra plataforma se omitieron). Nada se ha importado todavía.'
async def load_csv(q, u, csv):
    await q.goto(u + '#carga'); await q.wait_for_selector('input[data-action="pick-files"][data-type="segments"]', state='attached')
    await q.set_input_files('input[data-action="pick-files"][data-type="segments"]', files=[{'name': 'seg.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}])
    await q.wait_for_selector('[data-action="commit-staged"]:not([disabled])', timeout=60000); await q.click('[data-action="commit-staged"]')
    await q.wait_for_function("document.querySelectorAll('#view-carga .staging__head').length === 0", timeout=60000)
async def setctx(q, u, key='2026-09'):
    await q.goto(u + '#segmentos'); await q.wait_for_timeout(400)
    for k, v in (('periodType', 'month'), ('periodKey', key), ('channel', 'total')):
        await q.evaluate(f"FP.app.actions['dx-setting']({{dataset:{{key:'{k}'}},value:'{v}'}})"); await q.wait_for_timeout(200)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'; errs = []
        # ---------- V-1 avisos ----------
        bad = []
        for w in (1920, 1280, 1024, 768, 390, 320):
            q = await b.new_page(viewport={'width': w, 'height': 800}); q.on('pageerror', lambda e: errs.append(str(e)))
            await q.goto(u + '#carga'); await q.wait_for_timeout(400); await q.evaluate(f"FP.ui.toast({json.dumps(MSG)})"); await q.wait_for_timeout(350)
            r = await q.evaluate("""()=>{const t=document.getElementById('toast').getBoundingClientRect();const n=document.getElementById('app-nav').getBoundingClientRect();const nav=innerWidth>860?Math.round(n.right):null;return {l:Math.round(t.left),r:Math.round(t.right),b:Math.round(t.bottom),w:innerWidth,h:innerHeight,nav}}""")
            if r['l'] < 0 or r['r'] > r['w'] or r['b'] > r['h'] or (r['nav'] is not None and r['l'] < r['nav']): bad.append((w, r))
            await q.close()
        chk('V-1 un aviso largo queda dentro de la pantalla y no tapa el menú lateral, de 320 a 1920 px', not bad, bad)
        q = await b.new_page(viewport={'width': 1280, 'height': 900}); q.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q, u)
        # ---------- V-2 reintento de Cohere (respuesta simulada) ----------
        await q.goto(u + '#narrativa'); await q.wait_for_timeout(1000)
        JS = """async(mode)=>{const n=FP.app.state.nx.narrative;const nums=[...FP.cohereNarrative.allowedNumbers(n)];const ok=nums.find(x=>/\\./.test(x))||nums[0];
          const bad={summary:`Vamos ${ok} y faltan 38.1 puntos.`,narrative:'Detalle con 38.1.',missingInfo:[]};const good={summary:`Vamos ${ok}.`,narrative:'Detalle sin cifras nuevas.',missingInfo:[]};
          let calls=0;const sent=[];const fetchImpl=async(url,opt)=>{calls++;sent.push(JSON.parse(opt.body).messages[1].content);const body=(mode==='fix'&&calls===2)?good:bad;
          return {ok:true,status:200,json:async()=>({message:{content:[{type:'text',text:JSON.stringify(body)}]}})}};
          const r=await FP.cohereNarrative.narrate(n,{apiKey:'k',fetchImpl});return {ok:r.ok,retried:r.retried,calls,errors:r.errors,asked:(sent[1]||'').includes('38.1')}}"""
        fx = await q.evaluate(JS, 'fix'); rp = await q.evaluate(JS, 'bad')
        chk('V-2 Cohere: si inventa una cifra (38.1) se le pide una vez quitarla diciéndole cuál; si la quita, el texto se muestra', fx['ok'] and fx['retried'] and fx['calls'] == 2 and fx['asked'], fx)
        chk('V-2 si la repite, sigue rechazado (la validación no se relaja) y el aviso explica que fue un cálculo propio y que se reintentó', not rp['ok'] and rp['calls'] == 2 and any('repitió el problema al reintentar' in e for e in rp['errors']), rp)
        rules = await q.evaluate("FP.cohereNarrative.SYSTEM_RULES")
        chk('V-2 la instrucción a Cohere prohíbe calcular diferencias, complementos, sumas o porcentajes nuevos', 'No calcules diferencias, complementos' in rules, rules[-300:])
        # ---------- V-3 cruce dispositivo × fuente/medio (GA4) ----------
        await load_csv(q, u, CSVG); await setctx(q, u)
        dims = await q.evaluate("[...document.querySelectorAll('#sg-dim option')].map(o=>o.innerText)")
        chk('V-3 el CSV de GA4 trae ahora la dimensión cruzada «Dispositivo × Fuente/medio» (al final de la lista)', dims[-1] == 'Dispositivo × Fuente/medio' and len(dims) == 7, dims)
        await q.select_option('#sg-dim', 'device_source'); await q.wait_for_timeout(500)
        TAB = """[...document.querySelectorAll('#view-segmentos table[aria-label*="tráfico y conversión"] tbody tr')].map(r=>[...r.cells].filter((c,i)=>i!==1).map(c=>c.innerText.trim()))"""
        rows_ = await q.evaluate(TAB); row = [r for r in rows_ if r[0] == 'Móvil · google / cpc']
        sel = [r for r in RG if '20260901' <= r[0] <= '20260930' and r[2] == 'mobile' and r[3] == 'google / cpc']
        exp = sum(r[7] for r in sel)
        num = lambda s_: float(re.sub(r'[^0-9.\-]', '', s_) or 'nan')
        chk(f'V-3 «Móvil · google / cpc» suma {exp:,} sesiones en septiembre (calculado aparte del CSV)', bool(row) and abs(num(row[0][1]) - exp) < 0.5, (row[:1], exp, [r[0] for r in rows_][:6]))
        # ---------- V-4 tendencia semanal (datos de la parte 1) ----------
        q2 = await b.new_page(viewport={'width': 1280, 'height': 900}); q2.on('pageerror', lambda e: errs.append(str(e)))
        await prepare(q2, u); await load_csv(q2, u, CSV); await setctx(q2, u); await q2.select_option('#sg-dim', 'device'); await q2.wait_for_timeout(500)
        tr = await q2.evaluate("""Object.fromEntries([...document.querySelectorAll('table[aria-label="Tendencia semanal del CR"] tbody tr')].map(r=>[r.cells[0].innerText.trim(), [r.cells[1].querySelector('svg')?'svg':'', r.cells[4].innerText.trim()]]))""")
        chk('V-4 tendencia semanal: Móvil «A la baja» (1.33 % → 1.00 %), Escritorio «Al alza» (2.43 % → 3.00 %), Tableta «Sin cambio claro»; con minigráfica; Smart TV (poco volumen) no aparece', tr.get('Móvil') == ['svg', 'A la baja'] and tr.get('Escritorio') == ['svg', 'Al alza'] and tr.get('Tableta') == ['svg', 'Sin cambio claro'] and 'Smart TV' not in tr, tr)
        # ---------- V-5 simular en Recovery Center ----------
        btn = await q2.evaluate("""(()=>{const b=document.querySelector('[data-action="seg-simulate"]');return b?[b.dataset.label,b.dataset.rel]:null})()""")
        dO = 60000 * (crT - 0.01); rel = dO / O * 100
        chk(f'V-5 la oportunidad de Móvil trae «Simular» con su equivalente en el canal: +{rel:.4f} % de CR (pedidos extra ÷ pedidos totales)', bool(btn) and btn[0] == 'Móvil' and abs(float(btn[1]) - rel) < 0.0005, (btn, rel))
        await q2.click('[data-action="seg-simulate"]'); await q2.wait_for_timeout(1200)
        st = await q2.evaluate("({hash:location.hash, d:FP.app.state.rc.draft, s:{ch:FP.app.state.rc.settings.channel,pt:FP.app.state.rc.settings.periodType,pk:FP.app.state.rc.settings.periodKey,ap:FP.app.state.rc.settings.applyTo}, toast:document.getElementById('toast').innerText})")
        chk('V-5 «Simular» abre Recovery Center con el mismo canal y periodo, el escenario precargado (CR relativo) y un aviso que explica la equivalencia', st['hash'] == '#recovery' and st['d']['crMode'] == 'pct' and abs(st['d']['crValue'] - rel) < 0.0005 and 'Móvil' in st['d']['name'] and st['s']['ch'] == 'total' and st['s']['pk'] == '2026-09' and 'Escenario precargado' in st['toast'], st)
        # ---------- V-6 desborde ----------
        await q2.goto(u + '#segmentos'); await q2.wait_for_timeout(400); bad = []
        for w in (1920, 1440, 1280, 1100, 768, 390):
            await q2.set_viewport_size({'width': w, 'height': 900}); await q2.select_option('#sg-dim', 'device'); await q2.wait_for_timeout(300)
            r = await q2.evaluate("({doc:document.documentElement.scrollWidth-innerWidth, tabs:[...document.querySelectorAll('#view-segmentos .table-wrap')].map(x=>x.scrollWidth-x.clientWidth)})")
            if r['doc'] > 0 or (w >= 1100 and any(x > 1 for x in r['tabs'])): bad.append((w, r))
        chk('V-6 sin desborde de página de 390 a 1920 px y tablas sin scroll horizontal en escritorio (con las columnas nuevas)', not bad, bad)
        chk('Sin errores de página', not errs, errs[:2])
        await b.close()
    print('\nRESULTADO batch_v:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
