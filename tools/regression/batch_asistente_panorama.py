"""v0.15.0 · Asistente de Análisis: «Panorama completo» y preguntas por nivel (escritorio y móvil), Cohere simulado.
Uso: python3 batch_asistente_panorama.py <raiz>"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
STUB = """()=>{ window.__sent=[]; FP.cohereConnection.isConfigured=()=>true;
  FP.cohereClient.chatJson=async(o)=>{ window.__sent.push(o.user); const ctx=JSON.parse(o.user).context; const lv=(ctx.panorama&&ctx.panorama.levels)||{};
    const cat=lv.category; let txt='Sin panorama.';
    if(cat&&cat.available&&cat.topDecliners.length){ const d=cat.topDecliners[0]; txt='En '+d.entity+' el '+'cambio fue de '+Math.abs(d.delta).toFixed(0)+' en el periodo.'; }
    return {ok:true,status:'ok',model:'m',text:JSON.stringify({answer:txt,evidence:[],nextQuestion:'',limitations:[]})}; } }"""
async def run(b, w, h, tag):
    u = f'http://127.0.0.1:{port}/index.html'
    q = await new_page(b, w, h)
    await q.goto(u + '#carga'); await q.wait_for_timeout(1200); await q.evaluate("document.querySelectorAll('dialog').forEach(d=>d.remove())")
    await load_products(q, u)
    await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-09', comparison='previous')
    await q.evaluate(STUB); await q.evaluate("FP.app.actions['an-assistant-toggle']()"); await q.wait_for_selector('.analysis-assistant__panel', timeout=5000)
    chk(f'{tag}1 aparece «✦ Panorama completo» y los 4 grupos de preguntas por nivel', await q.locator('.analysis-assistant__suggestion--primary').count() == 1 and await q.locator('.analysis-assistant__group').count() == 4)
    await q.evaluate("document.querySelectorAll('.analysis-assistant__group').forEach(d=>d.open=true)")
    ov = await q.evaluate("document.documentElement.scrollWidth - innerWidth"); chk(f'{tag}2 sin desborde horizontal ({ov}px)', ov <= 0, ov)
    small = await q.evaluate("[...document.querySelectorAll('.analysis-assistant__group summary')].filter(s=>s.getBoundingClientRect().height<40).length"); chk(f'{tag}3 los resúmenes de grupo son tocables (≥40 px)', small == 0, small)
    await q.click('.analysis-assistant__suggestion--primary'); await q.wait_for_timeout(300)
    chk(f'{tag}4 «Panorama completo» llena la pregunta', 'panorama' in (await q.input_value('#an-assistant-input')).lower())
    await q.click('[data-action="an-assistant-ask"]'); await q.wait_for_selector('.analysis-assistant__answer', timeout=15000)
    sent = json.loads((await q.evaluate("window.__sent"))[0]); pan = sent['context'].get('panorama')
    chk(f'{tag}5 el contexto enviado trae el panorama con los niveles', bool(pan) and set(pan['levels']) >= {'category', 'subcategory', 'product', 'state', 'city', 'branch', 'delivery'}, list((pan or {}).get('levels', {}).keys()))
    av = {k: v['available'] for k, v in pan['levels'].items()}
    chk(f'{tag}6 hay al menos un nivel con datos y los demás dicen por qué no', any(av.values()) and all(('note' in v) for v in pan['levels'].values() if not v['available']), av)
    ok_lv = [v for v in pan['levels'].values() if v['available']][0]
    chk(f'{tag}7 cada nivel con datos trae caídas, crecimientos, total y concentración', all(k in ok_lv for k in ['topDecliners', 'topGrowers', 'totalDelta', 'totalDeltaPct', 'top3ShareOfDecline', 'entities']) and all(k in ok_lv['topDecliners'][0] for k in ['deltaPct', 'sharePct']), list(ok_lv))
    chk(f'{tag}8 la respuesta con una cifra del panorama se acepta y se muestra', 'analysis-assistant__answer' in await q.evaluate("document.querySelector('.analysis-assistant__panel').innerHTML") and not await q.locator('.analysis-assistant .ds-alert--danger').count())
    # validación: cifra inventada contra el panorama
    v = await q.evaluate("""(()=>{const A=FP.cohereAnalysisAssistant,ctx=A.buildContext(FP.app.state);return FP.app._panoramaForTest?null:null})()""")
    # pregunta normal NO pide panorama
    await q.evaluate("FP.app.state.an.assistant={...FP.app.state.an.assistant,question:'¿Cuáles están creciendo?',panorama:false}; FP.app.actions['an-assistant-ask']()"); await q.wait_for_timeout(900)
    sent2 = json.loads((await q.evaluate("window.__sent"))[-1])
    chk(f'{tag}9 una pregunta normal no manda el panorama (contexto liviano)', 'panorama' not in sent2['context'])
    await q.evaluate("FP.app.state.an.assistant={...FP.app.state.an.assistant,question:'¿Qué sucursales concentran la caída?',panorama:false}; FP.app.actions['an-assistant-ask']()"); await q.wait_for_timeout(900)
    sent3 = json.loads((await q.evaluate("window.__sent"))[-1])
    chk(f'{tag}10 una pregunta por nivel (sucursal) manda el panorama aunque no se use el botón', 'panorama' in sent3['context'])
    r = await q.evaluate("""(()=>{const A=FP.cohereAnalysisAssistant;const ctx={panorama:{levels:{category:{topDecliners:[{entity:'X',delta:-12345.5}],top3ShareOfDecline:62.4}}}};
      return {ok:A.validateResponse({answer:'Categoría X cayó $12,345.5 y 3 concentran 62.4 % de la caída.',evidence:[]},ctx),bad:A.validateResponse({answer:'Categoría X cayó $99,999.',evidence:[]},ctx)}})()""")
    chk(f'{tag}11 las cifras del panorama se validan como el resto (cifra del panorama pasa; inventada no)', r['ok']['ok'] and not r['bad']['ok'], r)
    chk(f'{tag}12 sin errores de página', not q._errs, q._errs[:3])
    await q.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        await run(b, 1280, 900, 'D'); await run(b, 375, 740, 'M'); await b.close()
    print('RESULTADO batch_asistente_panorama:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
