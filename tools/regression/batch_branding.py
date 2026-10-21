"""Marca de la presentación: paleta desde el logo, guardado, logo en portada y pie del PDF, contraste y quitar marca. Corre: python3 batch_branding.py <raíz> [ruta_logo.png]"""
import sys, asyncio, os
from an_common import *
U = f'http://127.0.0.1:{port}/index.html'
LOGO = sys.argv[2] if len(sys.argv) > 2 else None
SHOT = os.environ.get('RN_SHOT')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); q = await new_page(b, 1280, 900)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        # --- funciones puras ---
        r = await q.evaluate("""(()=>{const B=FP.brand;const px=[];const add=(r,g,b,n)=>{for(let i=0;i<n;i++)px.push(r,g,b,255)};
          add(255,255,255,5000);add(36,60,140,800);add(235,108,46,500);add(20,20,20,300);add(128,128,128,300);for(let i=0;i<400;i++)px.push(10,10,10,0);
          const pal=B.paletteFromPixels(px,5);return {pal,roles:B.pickRoles(pal),c:B.contrast('#000000','#FFFFFF'),tt:B.textTone('#F2A33A'),ttc:B.contrast(B.textTone('#F2A33A'),'#FFFFFF')}})()""")
        chk('BR-1 la paleta ignora blanco, negro, gris y transparente', len(r['pal']) == 2, r['pal'])
        chk('BR-2 principal legible sobre blanco y acento de otro tono', r['roles']['main'] and r['roles']['accent'] and r['roles']['main'] != r['roles']['accent'], r['roles'])
        chk('BR-3 contraste negro/blanco = 21 y el tono de texto de un color claro cumple 4.5', abs(r['c'] - 21) < 0.01 and r['ttc'] >= 4.5, r)
        tb = await q.evaluate("(()=>{const w=100,h=100,d=new Uint8ClampedArray(w*h*4).fill(255);for(let y=40;y<60;y++)for(let x=10;x<90;x++){const i=(y*w+x)*4;d[i]=30;d[i+1]=60;d[i+2]=140;}return FP.brand.trimBox(d,w,h)})()")
        chk('BR-15 el recorte quita los márgenes blancos del logo (deja el dibujo con margen mínimo)', tb['w'] < 90 and tb['w'] >= 80 and tb['h'] < 30 and tb['h'] >= 20, tb)
        # --- pantalla de configuración ---
        await q.goto(U + '#negocio'); await q.wait_for_selector('#brand-body .brand')
        chk('BR-4 Configuración → Negocio muestra «Marca de la presentación» sin marca guardada', 'Sin marca guardada' in await q.inner_text('#brand-body'))
        if LOGO:
            await q.set_input_files('input[data-action="brand-file"]', LOGO); await q.wait_for_selector('#brand-body .brand-sw', timeout=15000)
            st = await q.evaluate("({pal:FP.app.state.brand.draft.palette,main:FP.app.state.brand.draft.main,acc:FP.app.state.brand.draft.accent,len:FP.app.state.brand.draft.logo.dataUrl.length})")
            chk('BR-5 al subir el logo se propone una paleta de 2 a 5 colores con principal y acento', 2 <= len(st['pal']) <= 5 and st['main'] and st['acc'] and st['main'] != st['acc'], st)
            chk('BR-6 el logo guardado queda ligero (< 450 KB)', st['len'] < 450000, st['len'])
            dm = await q.evaluate("({w:FP.app.state.brand.draft.logo.w,h:FP.app.state.brand.draft.logo.h})")
            chk('BR-6b el logo se recorta a su dibujo (apaisado, no el lienzo cuadrado)', dm['w'] > dm['h'] * 1.5, dm)
            ok = await q.evaluate("FP.brand.contrast(FP.brand.textTone(FP.app.state.brand.draft.main),'#FFFFFF')>=4.5")
            chk('BR-7 el texto con el color principal cumple contraste 4.5', ok)
            if SHOT: await (await q.query_selector('#st-negocio')).screenshot(path=os.path.join(SHOT, 'brand_cfg.png'))
        else:
            await q.evaluate("(()=>{const s=FP.app.state.brand;s.draft={logo:{dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',w:1,h:1,name:'x.png'},palette:['#243C8C','#EB6C2E'],main:'#243C8C',accent:'#EB6C2E'};s.dirty=true})()")
        await q.evaluate("document.querySelector('[data-action=\"brand-save\"]') || 0")
        await q.evaluate("FP.app.actions && 0")
        await q.click('[data-action="brand-save"]'); await q.wait_for_timeout(300)
        sv = await q.evaluate("(()=>{const e=FP.app.storage?FP.app.storage.load('reportBrand'):null;return {saved:FP.app.state.brand.saved,active:!!FP.brand.active(),style:!!document.getElementById('rp-brand-style')}})()")
        chk('BR-8 guardar aplica la marca (hoja de estilo activa)', sv['saved'] and sv['active'] and sv['style'], sv)
        # --- presentación con logo ---
        await load_products(q, U)
        await q.goto(U + '#resumen'); await q.wait_for_selector('#view-resumen:not([hidden])')
        await q.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await q.click('[data-action="generate-mock"]'); await q.wait_for_timeout(1500)
        await q.goto(U + '#presentacion'); await q.wait_for_selector('[data-action="rp-generate"]'); await q.click('[data-action="rp-generate"]'); await q.wait_for_timeout(300)
        if await q.query_selector('[data-action="rp-gap-go"]'): await q.click('[data-action="rp-gap-go"]')
        await q.wait_for_function("FP.app.state.rp.status==='ready'||FP.app.state.rp.status==='error'", timeout=120000)
        await q.evaluate("FP.reportView.mountPrint(FP.app.state.rp.report,{exclude:[],tags:false})"); await q.emulate_media(media='print')
        m = await q.evaluate("""(()=>{const h=document.querySelector('#rp-print-host');return {cover:h.querySelectorAll('[data-page=cover] img.rp-logo-l').length,foot:h.querySelectorAll('.rp-page:not(.rp-page--cover) .rp-foot img.rp-logo-s').length,pages:h.querySelectorAll('.rp-page:not(.rp-page--cover)').length,
          ov:[...h.querySelectorAll('.rp-page')].filter(p=>{const b=p.querySelector('.rp-body');return b&&b.scrollHeight>b.clientHeight+1}).map(p=>p.getAttribute('data-page')),
          blue:getComputedStyle(h.querySelector('.rp-page')).getPropertyValue('--blue').trim(),red:getComputedStyle(h.querySelector('.rp-page')).getPropertyValue('--red').trim()}})()""")
        chk('BR-9 portada con logo grande y cada lámina con logo pequeño en el pie', m['cover'] == 1 and m['foot'] == m['pages'] and m['pages'] > 3, m)
        cv = await q.evaluate("(()=>{const c=document.querySelector('#rp-print-host [data-page=cover]');return {brand:c.querySelector('.rp-brand').innerText.trim(),by:(c.querySelector('.rp-cover__by')||{}).innerText||null,sub:c.querySelector('.rp-cover__sub').innerText}})()")
        chk('BR-9b con logo, la portada no repite texto junto al logo y firma «RevNavigator» abajo a la izquierda', cv['brand'] == '' and cv['by'] == 'RevNavigator', cv)
        chk('BR-10 el color principal cambia y el rojo de «resta» sigue fijo', m['blue'].upper() != '#1F5FD6' and m['red'].upper() == '#C0392B', m)
        chk('BR-11 ninguna lámina desborda con el logo en el pie', m['ov'] == [], m['ov'])
        if SHOT:
            for pid in ('cover', 'pacing'):
                el = await q.query_selector(f'#rp-print-host [data-page={pid}]')
                if el: await el.screenshot(path=os.path.join(SHOT, f'brand_{pid}.png'))
        # --- quitar la marca ---
        await q.emulate_media(media='screen'); await q.evaluate('FP.reportView.unmountPrint()')
        await q.goto(U + '#negocio'); await q.wait_for_selector('[data-action="brand-clear"]')
        q.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await q.click('[data-action="brand-clear"]'); await q.wait_for_timeout(300)
        z = await q.evaluate("({active:!!FP.brand.active(),style:!!document.getElementById('rp-brand-style'),saved:FP.app.state.brand.saved})")
        chk('BR-12 quitar la marca devuelve el aspecto original', not z['active'] and not z['style'] and not z['saved'], z)
        # --- validación de hex y de archivo ---
        await q.fill('input[data-role="main"]', 'rojo'); await q.dispatch_event('input[data-role="main"]', 'change'); await q.wait_for_timeout(200)
        chk('BR-13 un hex inválido se rechaza con mensaje', 'hexadecimal' in await q.inner_text('#brand-body'))
        e = await q.evaluate("FP.brand.normalize({logo:{dataUrl:'data:text/html;base64,AAAA'},main:'#12345'})")
        chk('BR-14 una marca con logo no imagen o color inválido no se acepta', e is None, e)
        await b.close()
asyncio.run(main())
print(f'\n{len(passed)} ok / {len(fails)} fallos'); sys.exit(1 if fails else 0)
