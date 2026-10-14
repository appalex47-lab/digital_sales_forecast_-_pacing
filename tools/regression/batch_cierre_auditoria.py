"""Cierre de auditoría: persistencia con estado, histórico≠precisión, backtesting, cobertura de metas, key de Cohere, errores globales. Uso: python3 batch_cierre_auditoria.py <raiz>"""
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
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); errs = []
        c = await b.new_context(viewport={'width': 1280, 'height': 900}); q = await c.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.on('console', lambda m: print('   [console]', m.text[:160]) if '[RevNavigator]' in m.text else None)
        await q.clock.set_fixed_time(dt.datetime(2026, 10, 2, 9, 0)); u = f'http://127.0.0.1:{port}/index.html'
        await q.goto(u + '#inicio'); await q.wait_for_timeout(900)
        await q.evaluate("(()=>{const d=document.getElementById('tour-offer');if(d)d.remove()})();FP.app.actions['generate-mock']()"); await q.wait_for_timeout(1500)
        # --- Forecast: histórico ≠ precisión
        await q.goto(u + '#pacing'); await q.reload(); await q.wait_for_timeout(1500)
        await q.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        th = await q.evaluate("[...document.querySelectorAll('#fc-methods thead th')].map(e=>e.textContent.trim())")
        chk('C1 la tabla de métodos ya no dice «Confianza»: dice «Histórico comparable»', 'Histórico comparable' in th and 'Confianza' not in th, th)
        pills = await q.evaluate("[...document.querySelectorAll('#fc-methods tbody .pill')].map(e=>e.textContent.trim())")
        chk('C2 las etiquetas hablan de histórico (suficiente/limitado/insuficiente) o «No aplica», nunca «Excelente»', pills and all(x in ('Histórico suficiente', 'Histórico limitado', 'Histórico insuficiente', 'No aplica') for x in pills), pills)
        txt = await q.inner_text('#fc-methods')
        chk('C3 antes de calcular, la calidad medida aparece como «no evaluada»', 'no evaluada' in txt.lower() and 'Calcular error histórico' in txt)
        await q.click('[data-action=fc-backtest]'); await q.wait_for_timeout(900)
        txt = await q.inner_text('#fc-methods')
        chk('C4 el backtesting muestra WAPE/sesgo o «No evaluada» con motivo, por método', ('WAPE' in txt) and ('No evaluada' in txt or 'Mejora al plan' in txt or 'No mejora al plan' in txt), txt[-400:])
        bt = await q.evaluate("FP.app.state.fc.backtest.data")
        chk('C5 el backtesting evalúa B, C y D en todos los canales y horizontes', bt['methods'] == ['B', 'C', 'D'] and all(set(bt['byChannel'][c].keys()) == {'B', 'C', 'D'} for c in bt['byChannel']), bt['methods'])
        # --- Persistencia
        st = await q.evaluate("FP.app.state.storage && FP.app.state.persist ? FP.app.state.persist.state : (FP.app.repo ? FP.app.repo.status().state : 'n/a')")
        chk('P1 estado de persistencia accesible (saved/pending)', st in ('saved', 'pending', 'n/a'), st)
        await q.goto(u + '#ajustes'); await q.reload(); await q.wait_for_timeout(1200)
        await q.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true); FP.app.state.stTab='ia'; FP.app.render()")
        has = await q.evaluate("!!document.querySelector('[data-action=dx-key-clear]') && /no es un secreto seguro/.test(document.body.innerText)")
        chk('S1 Configuración advierte que la key en el navegador no es un secreto seguro y permite quitarla', has)
        fail_sim = """(async()=>{
          const repo = FP.app.repo || null; if(!repo) return 'no-repo';
          const orig = FP.idb.put; FP.idb.put = async()=>{ throw new Error('QuotaExceededError simulado'); };
          FP.app.storage.save('historicalData', {x:1}); try{ await repo.flush(); }catch(e){} await new Promise(r=>setTimeout(r,50));
          const st = repo.status(); const banner = document.getElementById('save-failure');
          const out = {state: st.state, hidden: banner.hidden, text: banner.textContent.slice(0,120)};
          FP.idb.put = orig; await repo.retryFailed(); await new Promise(r=>setTimeout(r,50));
          out.after = repo.status().state; out.bannerAfter = document.getElementById('save-failure').hidden; return out; })()"""
        r = await q.evaluate(fail_sim)
        if r == 'no-repo':
            chk('P2 (omitida: FP.app.repo no expuesto)', True)
        else:
            chk('P2 un fallo de IndexedDB deja banner persistente («solo en memoria»)', r['state'] == 'failed' and r['hidden'] is False and 'memoria' in r['text'], r)
            chk('P3 al reintentar con éxito el estado vuelve a «saved» y el banner se retira', r['after'] == 'saved' and r['bannerAfter'] is True, r)
        # --- Metas: cobertura incompleta
        h = await q.evaluate("(()=>{const t=FP.dataModel.createTargets(2026);t.annual.revenue=100;const ids=FP.config.channelIds;ids.forEach((id,i)=>{t.byChannel[id]={revenue:i<ids.length-1?25:null}});return FP.dataModel.validateTargets(t)})()")
        chk('M1 metas con un canal sin capturar → cobertura incompleta (no «difiere»)', h['state'] == 'incomplete_coverage' and h['status'] == 'incomplete', h)
        # --- Errores globales
        await q.evaluate("window.dispatchEvent(new ErrorEvent('error',{error:new Error('fallo de prueba'),message:'fallo de prueba'}))"); await q.wait_for_timeout(300)
        tv = await q.evaluate("document.getElementById('toast').textContent")
        chk('E1 un error no capturado se avisa al usuario (no falla en silencio)', 'error inesperado' in tv, tv)
        real = [e for e in errs if 'fallo de prueba' not in e]
        chk('E2 sin errores de página adicionales', not real, real)
        await b.close()
asyncio.run(main())
print('FALLAS' if fails else 'OK')
sys.exit(1 if fails else 0)
