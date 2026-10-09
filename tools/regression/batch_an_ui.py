"""Análisis · interfaz: desborde 320–1920 px, nombres accesibles, encabezados y contraste del contexto. Uso: python3 -I batch_an_ui.py <raiz>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from an_common import *
def lum(c):
    c = [x / 255 for x in c]; c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]; return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb); return (hi + 0.05) / (lo + 0.05)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox']); u = f'http://127.0.0.1:{port}/index.html'
        q = await new_page(b); await load_products(q, u)
        await open_an(q, u, level='product', channel='total', periodType='month', focusKey='2026-10', comparison='previous')
        await q.evaluate("FP.app.actions['an-drill']({dataset:{entity:'Alfa 10 mg',source:'patron'}})")
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data})()", timeout=60000)
        await q.evaluate("FP.app.actions['an-drill-down']({dataset:{level:'sku',key:'S01'}})")
        await q.wait_for_function("(()=>{const d=FP.app.state.an.drill;return d&&!d.loading&&!d.pending&&d.data&&d.data.records})()", timeout=60000); await q.wait_for_timeout(300)
        bad = []
        for w in (1920, 1440, 1280, 1100, 768, 600, 390, 360, 320):
            await q.set_viewport_size({'width': w, 'height': 900}); await q.wait_for_timeout(250)
            r = await q.evaluate("""(()=>{const doc=document.documentElement.scrollWidth-innerWidth;
              const out=[];document.querySelectorAll('#view-analisis .analysis-context,#view-analisis .drill,#view-analisis .metric--drill,#view-analisis #an-channel,#view-analisis .drill__crumbs').forEach(e=>{const r=e.getBoundingClientRect();if(r.right>innerWidth+1||r.left<-1)out.push(e.className||e.id)});
              return {doc,out:[...new Set(out)]}})()""")
            if r['doc'] > 0 or r['out']: bad.append((w, r))
        chk('UI-1 sin desborde horizontal (selector de canal, contexto, KPIs y detalle) de 320 a 1920 px', not bad, bad[:3])
        await q.set_viewport_size({'width': 1280, 'height': 900})
        a = await q.evaluate("""(()=>{const root=document.getElementById('view-analisis');
          const btn=[...root.querySelectorAll('button')].filter(x=>!(x.textContent.trim()||x.getAttribute('aria-label')||x.title)).length;
          const ctl=[...root.querySelectorAll('select,input,textarea')].filter(x=>!(x.labels&&x.labels.length)&&!x.getAttribute('aria-label')).map(x=>x.id);
          const hs=[...root.querySelectorAll('h2,h3,h4')].map(h=>+h.tagName[1]);let jumps=0;for(let i=1;i<hs.length;i++)if(hs[i]-hs[i-1]>1)jumps++;
          const tbl=[...root.querySelectorAll('#an-drill table')].filter(t=>!t.getAttribute('aria-label')&&!t.caption).length;
          const th=[...root.querySelectorAll('#an-drill table')].filter(t=>!t.querySelector('th')).length;
          return {btn,ctl,jumps,tbl,th}})()""")
        chk('UI-2 botones y controles con nombre accesible; tablas del detalle con nombre y encabezados', a['btn'] == 0 and a['ctl'] == [] and a['tbl'] == 0 and a['th'] == 0, a)
        chk('UI-3 sin saltos de nivel de encabezado en Análisis', a['jumps'] == 0, a)
        c = await q.evaluate("""(()=>{const e=document.querySelector('#view-analisis .analysis-context');const s=getComputedStyle(e);const eb=getComputedStyle(e.querySelector('b'));
          const parse=x=>x.match(/\\d+/g).slice(0,3).map(Number);return {fg:parse(s.color),bg:parse(s.backgroundColor),fs:parseFloat(s.fontSize),bfg:parse(eb.color)}})()""")
        chk('UI-4 contraste AA (≥ 4.5:1) del texto de la barra de contexto', ratio(c['fg'], c['bg']) >= 4.5 and ratio(c['bfg'], c['bg']) >= 4.5, (ratio(c['fg'], c['bg']), ratio(c['bfg'], c['bg'])))
        # teclado: se llega al selector de canal y se cambia con teclado
        await q.focus('#an-channel'); await q.keyboard.press('ArrowDown'); await q.wait_for_timeout(100)
        v = await q.evaluate("document.getElementById('an-channel').value")
        chk('UI-5 el selector de canal se opera con teclado', v in ('ecommerce', 'app', 'whatsapp', 'llamadas'), v)
        chk('Sin errores de página', not q._errs, q._errs[:3])
        await b.close()
    print('RESULTADO batch_an_ui:', 'OK' if not fails else 'FALLAS: ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
