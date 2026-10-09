"""Análisis · detalle (drill): no se queda «Cargando…», lee los datos en pocas pasadas y da las MISMAS cifras que el método anterior
(agregados independientes por rango). Uso: python3 -I batch_drill.py <raiz>."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
WAIT = "(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending})()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        # ---- D1 equivalencia con el método anterior (un agregado por cada dato) ----
        OLD = """async (ent)=>{const an=FP.app.state.an,ci=an.comparisonInfo,PS=FP.productStore;const out={};
          const tot=async(r,ch,f)=>{const m=await PS.aggregate({from:r.from,to:r.to,channel:ch,groupBy:'total',filter:f});let s=0;m.forEach(a=>{const x=PS.finalize(a,null);s+=x&&x.revenue&&Number.isFinite(x.revenue.value)?x.revenue.value:0});return s};
          const f={product:ent};out.cur=await tot(ci.current,'total',f);out.base=await tot(ci.baseline,'total',f);out.ch={};
          for(const c of FP.analysisContext.channelIds()){out.ch[c]=[await tot(ci.current,c,f),await tot(ci.baseline,c,f)]}
          const kids=await PS.aggregate({from:ci.current.from,to:ci.current.to,channel:'total',groupBy:'sku',filter:f});out.kids={};kids.forEach((a,k)=>{const x=PS.finalize(a,null);out.kids[k]=x&&x.revenue&&Number.isFinite(x.revenue.value)?x.revenue.value:0});return out}"""
        ents = await q.evaluate("FP.app.state.an.rows.map(r=>r.entity)")
        bad = []
        for e in ents:
            await q.evaluate("e=>FP.app.actions['an-select']({dataset:{entity:e,source:'tabla'}})", e); await q.wait_for_function(WAIT, timeout=30000)
            new = await q.evaluate("(()=>{const x=FP.app.state.an.drill.data;return {cur:x.summary.current,base:x.summary.baseline,ch:Object.fromEntries(x.byChannel.map(c=>[c.channel,[c.current,c.baseline]])),kids:Object.fromEntries(x.children.rows.map(r=>[r.key,r.current]))}})()")
            old = await q.evaluate(OLD, e)
            ok = abs(new['cur'] - old['cur']) < 0.01 and abs(new['base'] - old['base']) < 0.01 and all(abs(new['ch'][c][0] - old['ch'][c][0]) < 0.01 and abs(new['ch'][c][1] - old['ch'][c][1]) < 0.01 for c in old['ch']) and all(abs(new['kids'].get(k, 0) - v) < 0.01 for k, v in old['kids'].items() if v > 0)
            if not ok: bad.append((e, new, old))
        chk('D1 total, base, desglose por canal y SKUs del detalle = método anterior (agregados independientes) en todos los productos', not bad, bad[:1])
        # ---- D2 lecturas: ≈2 pasadas en vez de ~15 ----
        await q.evaluate("window.__gets=0;const g=FP.idb.get;FP.idb.get=function(db,s,k){if(s==='productDays')window.__gets++;return g.apply(this,arguments)};null")
        await q.evaluate("FP.app.actions['an-select']({dataset:{entity:FP.app.state.an.rows[0].entity,source:'tabla'}})"); await q.wait_for_function(WAIT, timeout=30000)
        gets = await q.evaluate("window.__gets"); blocks = await q.evaluate("(()=>{const ci=FP.app.state.an.comparisonInfo;return FP.productStore.keysIn({from:ci.current.from,to:ci.current.to,channel:'total'}).then(a=>FP.productStore.keysIn({from:ci.baseline.from,to:ci.baseline.to,channel:'total'}).then(b=>a.length+b.length))})()")
        chk('D2 el detalle lee cada bloque día × canal UNA vez (actual + comparación + registros del SKU si aplica), no ~15 veces', gets <= blocks, (gets, blocks))
        # ---- D3 total (KPI) y niveles más profundos: cifras = suma de hijos; byPeriod con valores ----
        await q.evaluate("FP.app.actions['an-drill-total']({dataset:{source:'kpi'}})"); await q.wait_for_function(WAIT, timeout=30000)
        x = await q.evaluate("FP.app.state.an.drill.data")
        chk('D3 detalle del total: Σ canales = total y detalle temporal con valores', abs(sum(c['current'] for c in x['byChannel']) - x['summary']['current']) < 0.5 and len([p for p in x['byPeriod'] if p['value'] is not None]) >= 6, (x['summary'], x['byPeriod'][:2]))
        await q.evaluate("FP.app.actions['an-drill-down']({dataset:{level:'category',key:'Cardio'}})"); await q.wait_for_function(WAIT, timeout=30000)
        y = await q.evaluate("FP.app.state.an.drill.data"); truth = sum(r[6] for r in ROWS if r[4] == 'Cardio' and '2026-10-01' <= r[0] <= '2026-10-05')
        mm = {}
        for r in ROWS:
            if r[4] == 'Cardio': mm[r[0][:7]] = mm.get(r[0][:7], 0) + r[6]
        okp = all(abs((p['value'] or 0) - mm.get(p['key'], 0)) < 0.5 for p in y['byPeriod'] if p['key'] <= '2026-10')
        chk('D4 nivel más profundo (Total › Categoría Cardio): venta actual y detalle temporal por mes = cálculo aparte', abs(y['summary']['current'] - truth) < 0.5 and okp, (y['summary']['current'], truth))
        # ---- D5 sin contexto: no se queda cargando, dice por qué ----
        await q.evaluate("(()=>{const a=FP.app.state.an;a.drill={scope:'entity',entity:'X',source:'tabla',path:[],loading:true,data:null,error:null};const c=a.context;a._c=c;a.context=null;FP.app.actions['an-drill-retry']()})()"); await q.wait_for_timeout(300)
        s = await q.evaluate("(()=>{const d=FP.app.state.an.drill;return {loading:d.loading,error:d.error}})()")
        chk('D5 sin contexto de análisis el detalle muestra un mensaje en vez de quedarse cargando', s['loading'] is False and s['error'] and 'contexto' in s['error'], s)
        await q.evaluate("FP.app.state.an.context=FP.app.state.an._c;null"); del q._errs[:]   # el error de panel de arriba lo provoca la propia prueba (contexto anulado a propósito)
        # ---- D6 error de lectura → mensaje + Reintentar → funciona ----
        await q.evaluate("window.__orig=FP.productStore.aggregateScan;FP.productStore.aggregateScan=()=>Promise.reject(new Error('fallo simulado'));null")
        await q.evaluate("FP.app.actions['an-select']({dataset:{entity:FP.app.state.an.rows[0].entity,source:'tabla'}})"); await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&d.error})()", timeout=30000)
        txt = await q.evaluate("document.getElementById('an-drill').innerText")
        chk('D6 si la lectura falla se ve el motivo y el botón «Reintentar» (no «Cargando…»)', 'fallo simulado' in txt and 'Reintentar' in txt and 'Cargando detalle' not in txt, txt[:200])
        await q.evaluate("FP.productStore.aggregateScan=window.__orig;null"); await q.click('#an-drill [data-action="an-drill-retry"]'); await q.wait_for_function(WAIT, timeout=30000)
        ok = await q.evaluate("(()=>{const d=FP.app.state.an.drill;return !d.error&&!!d.data&&d.data.summary.current>0})()")
        chk('D7 «Reintentar» carga el detalle correctamente', ok)
        # ---- D8 lectura lenta → salida de emergencia con aviso (tiempo de espera reducido para la prueba) ----
        await q.evaluate("FP.app.state.an.drillTimeoutMs=1500;FP.productStore.aggregateScan=()=>new Promise(()=>{});null")
        await q.evaluate("FP.app.actions['an-select']({dataset:{entity:FP.app.state.an.rows[0].entity,source:'tabla'}})"); await q.wait_for_timeout(2500)
        st = await q.evaluate("(()=>{const d=FP.app.state.an.drill;return {l:d.loading,e:d.error,t:document.getElementById('an-drill').innerText}})()")
        chk('D8 si una lectura nunca termina, a los pocos segundos se avisa y se ofrece reintentar (no queda «Cargando…» para siempre)', st['l'] is False and st['e'] and 'Reintentar' in st['t'], st)
        await q.evaluate("FP.productStore.aggregateScan=window.__orig;FP.app.state.an.drillTimeoutMs=0;null")
        chk('D9 sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_drill:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
