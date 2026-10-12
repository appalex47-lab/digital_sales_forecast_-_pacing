"""Alertas de pacing con etiquetas por tipo (riesgo, faltan datos, por encima del plan, mejora, tendencia). Uso: python3 batch_alertas.py <raiz>"""
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
INJECT = """(()=>{const r=FP.app.state.fc.run;r.alerts=[
 {type:'gap_improving',severity:'info',category:'improving',message:'Ecommerce: mejora'},
 {type:'recent_vs_cumulative',severity:'info',category:'trend',message:'Llamadas: tendencia'},
 {type:'forecast_gap',severity:'attention',category:'above',message:'Total digital: arriba'},
 {type:'missing_actual',severity:'attention',category:'data',message:'Total digital: faltan'},
 {type:'forecast_gap',severity:'attention',category:'risk',message:'WhatsApp: riesgo forecast'},
 {type:'gap_growing',severity:'attention',category:'risk',message:'App: riesgo racha'},
 {type:'x',severity:'attention',message:'Sin categoría (alerta antigua)'}];FP.app.render()})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        await q.goto(u + '#pacing'); await q.wait_for_timeout(1500)
        cats = await q.evaluate("FP.app.state.fc.run.alerts.map(a=>a.category)")
        chk('A1 el motor asigna categoría a cada alerta real', len(cats) > 0 and all(cats), cats)
        t0 = await q.evaluate("[...document.querySelectorAll('#fc-alerts li .pill')].map(e=>e.textContent.trim())")
        chk('A2 sin venta real las alertas dicen «Faltan datos», no «Atención»', t0 and all(x == 'Faltan datos' for x in t0), t0)
        await q.evaluate(INJECT); await q.wait_for_timeout(400)
        labs = await q.evaluate("[...document.querySelectorAll('#fc-alerts li .pill')].map(e=>e.textContent.trim())")
        chk('A3 orden: Riesgo, Faltan datos, Por encima del plan, Mejora, Tendencia (y la antigua al final)', labs == ['Riesgo', 'Riesgo', 'Faltan datos', 'Por encima del plan', 'Mejora', 'Tendencia', 'Atención'], labs)
        cls = await q.evaluate("[...document.querySelectorAll('#fc-alerts li .pill')].map(e=>e.className)")
        chk('A4 los colores acompañan al significado: riesgo en rojo, buenas noticias en verde, datos en naranja, tendencia neutra', 'error' in cls[0] and 'warning' in cls[2] and 'ok' in cls[3] and 'ok' in cls[4] and 'na' in cls[5], cls)
        chk('A5 una sola etiqueta «Riesgo» no se mezcla con las buenas noticias (no hay «Atención» para lo bueno)', 'Atención' not in labs[:6], labs)
        h = await q.evaluate("(document.querySelector('#fc-alerts .field__hint')||{}).innerText")
        chk('A6 hay leyenda que explica cada etiqueta que aparece', all(x in h for x in ('Riesgo =', 'Faltan datos =', 'Por encima del plan =', 'Mejora =', 'Tendencia =')), h)
        r = await q.evaluate("""(()=>{const cfg={alerts:{streakDays:5,recentVsCumulative:0.05,forecastGapPct:0.03},recentWindow:'w28',windows:{w28:{label:'28 días'}}};
          const mk=(g,m)=>({days:[],indices:{ytd:{revenue:{value:null}},w28:{revenue:{value:null}}},annual:{forecastGap:{revenue:{gapPct:g,gap:g*100}}},missingActualDays:m});
          const neg=FP.forecastEngine.buildAlerts(mk(-0.244,0),'WhatsApp','whatsapp',cfg), pos=FP.forecastEngine.buildAlerts(mk(0.209,2),'Total','total',cfg);
          return {neg:neg.map(a=>[a.category,a.message]),pos:pos.map(a=>[a.category,a.message])}})()""")
        chk('A7 forecast bajo el plan = riesgo, sin doble negativo; sobre el plan = «por encima»; días sin venta = datos', r['neg'][0][0] == 'risk' and '24.4 % debajo' in r['neg'][0][1] and '-24.4' not in r['neg'][0][1] and r['pos'][0][0] == 'above' and '20.9 % arriba' in r['pos'][0][1] and r['pos'][1][0] == 'data', r)
        chk('A8 sin errores de página', not errs, errs)
        await b.close()
    print('RESULTADO batch_alertas: ' + ('OK' if not fails else 'FALLAS: ' + ', '.join(fails)))
asyncio.run(main())
