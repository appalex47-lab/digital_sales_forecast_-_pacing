import asyncio, json, sys
from playwright.async_api import async_playwright
CAP="window.__dl=[];(()=>{const o=FP.exporter.download;FP.exporter.download=(n,obj)=>{window.__dl.push([n,JSON.stringify(obj)]);};})();"
async def get(root):
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(); url=f'file://{root}/index.html'
        await pg.goto(url+'#resumen'); await pg.wait_for_timeout(900)
        await pg.evaluate("document.querySelectorAll('#view-resumen details.rs-more').forEach(d=>d.open=true)"); await pg.click('[data-action="generate-mock"]'); await pg.wait_for_timeout(1500)
        await pg.goto(url+'#pacing'); await pg.wait_for_timeout(700); await pg.evaluate(CAP)
        await pg.click('[data-action="fc-export"]'); await pg.wait_for_timeout(500)
        d=await pg.evaluate("window.__dl[0][1]"); await b.close(); return json.loads(d)
def walk(a,b,path=''):
    out=[]
    if type(a)!=type(b): return [(path,str(a)[:60],str(b)[:60])]
    if isinstance(a,dict):
        for k in set(a)|set(b):
            if k not in a or k not in b: out.append((path+'/'+k,'missing' if k not in a else 'present','missing' if k not in b else 'present'))
            else: out+=walk(a[k],b[k],path+'/'+k)
    elif isinstance(a,list):
        if len(a)!=len(b): return [(path,'len%d'%len(a),'len%d'%len(b))]
        for i,(x,y) in enumerate(zip(a,b)): out+=walk(x,y,f'{path}[{i}]')
    elif a!=b: out.append((path,str(a)[:60],str(b)[:60]))
    return out
async def main():
    a=await get('/home/claude/orig'); b=await get('/home/claude/app')
    d=walk(a,b); print(len(d),'diferencias'); [print(x) for x in d[:8]]
asyncio.run(main())
