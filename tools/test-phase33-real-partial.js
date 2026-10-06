import csv, datetime, math
from pathlib import Path
p=Path('/mnt/data/analisis/Venta Productos 2026.csv')
with p.open(encoding='utf-8-sig',newline='') as f:
    rows=list(csv.DictReader(f))
# Normalize BOM that the fixture itself carries in the first header.
rows=[{('fecha' if k.startswith('\ufeff') or k.startswith('ï»¿') else k):v for k,v in r.items()} for r in rows]
for r in rows: r['fecha']=datetime.datetime.strptime(r['fecha'],'%d/%m/%Y').date(); r['venta']=float(r['venta'] or 0)
name='GARDASIL 9 0.5 mL SUS INY JPRELL CAJ C/1'
def total(a,b): return sum(r['venta'] for r in rows if r['producto']==name and a<=r['fecha']<=b)
oct4=total(datetime.date(2026,10,1),datetime.date(2026,10,4))
sep4=total(datetime.date(2026,9,1),datetime.date(2026,9,4))
sepfull=total(datetime.date(2026,9,1),datetime.date(2026,9,30))
checks=[
 ('CSV real disponible',p.exists()),
 ('actual 1–4 oct = 317,982.00',abs(oct4-317982.0)<.01),
 ('base comparable 1–4 sep = 330,095.60',abs(sep4-330095.6)<.01),
 ('septiembre completo = 2,410,606.40',abs(sepfull-2410606.4)<.01),
 ('delta correcto 1–4 vs 1–4 = -12,113.60',abs((oct4-sep4)+12113.6)<.01),
 ('delta incorrecto vs mes completo detectado',abs((oct4-sepfull)+2092624.4)<.01),
]
for n,o in checks: print(('PASS ' if o else 'FAIL ')+n)
print(f'REAL GARDASIL: 1–4 oct ${oct4:,.2f} | 1–4 sep ${sep4:,.2f} | sep completo ${sepfull:,.2f}')
print(f'Delta comparable: ${oct4-sep4:,.2f} | Delta contra mes completo: ${oct4-sepfull:,.2f}')
if not all(o for _,o in checks): raise SystemExit(1)
