/**
 * mock-products.js — Archivos de prueba de productos (solo QA; Fases 8.1 y 8.1.1).
 * Dos archivos como los reales: venta (estado, sucursal, tipo de entrega) y funnel GA4 (sin dimensiones).
 * Pasan por el mismo flujo que un archivo real (vista previa, mapeo, validación, confirmación).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const CATS = [
    ['Medicamentos', ['Analgésicos', 'Antigripales', 'Gastrointestinal']], ['Dermocosmética', ['Protección solar', 'Antiedad', 'Limpieza facial']],
    ['Cuidado personal', ['Higiene bucal', 'Desodorantes', 'Cuidado capilar']], ['Bebés', ['Pañales', 'Fórmulas', 'Toallitas']],
    ['Vitaminas', ['Multivitamínicos', 'Minerales']], ['Crónicos', ['Diabetes', 'Hipertensión', 'Colesterol']],
    ['Alta especialidad', ['Oncología', 'Biológicos']], ['Nutrición', ['Suplementos', 'Alimentos especiales']]
  ];
  const STATES = ['Ciudad de México', 'Estado de México', 'Jalisco', 'Nuevo León', 'Puebla', 'Guanajuato', 'Querétaro', 'Veracruz', 'Yucatán', 'Baja California'];
  /** Fase 8.4: región y ciudades de prueba por estado. */
  const REGION = { 'Ciudad de México': 'Centro', 'Estado de México': 'Centro', Puebla: 'Centro', Guanajuato: 'Bajío', Querétaro: 'Bajío', Jalisco: 'Occidente',
    'Nuevo León': 'Norte', 'Baja California': 'Norte', Veracruz: 'Sureste', Yucatán: 'Sureste' };
  const CITIES = { 'Ciudad de México': ['Benito Juárez', 'Coyoacán'], 'Estado de México': ['Toluca', 'Naucalpan'], Jalisco: ['Guadalajara', 'Zapopan'],
    'Nuevo León': ['Monterrey', 'San Pedro'], Puebla: ['Puebla'], Guanajuato: ['León'], Querétaro: ['Querétaro'], Veracruz: ['Veracruz', 'Xalapa'],
    Yucatán: ['Mérida'], 'Baja California': ['Tijuana', 'Mexicali'] };

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function catalog(n, seed = 5) {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const [cat, subs] = CATS[i % CATS.length];
      const sub = subs[Math.floor(r() * subs.length)];
      const price = cat === 'Alta especialidad' ? 2500 + r() * 9000 : cat === 'Crónicos' ? 300 + r() * 900 : 60 + r() * 600;
      return { sku: `SKU${String(700000 + i)}`, product: `${sub} ${i + 1}`, category: cat, subcategory: sub, brand: `Lab ${1 + (i % 25)}`,
        price: Math.round(price * 100) / 100, views: 20 + Math.floor(r() * 400), cr: 0.01 + r() * 0.05 };
    });
  }

  /** 100 sucursales repartidas en 10 estados. */
  const branches = () => Array.from({ length: 100 }, (_, i) => {
    const state = STATES[i % STATES.length], cities = CITIES[state], city = cities[Math.floor(i / STATES.length) % cities.length];
    return { id: `SUC-${String(i + 1).padStart(3, '0')}`, name: `Sucursal ${city} ${Math.floor(i / STATES.length) + 1}`, state, city, region: REGION[state] };
  });

  /**
   * Venta y funnel diarios. En septiembre: Dermocosmética recibe más vistas pero su paso vista → carrito cae
   * (patrón de funnel); Vitaminas crece en tráfico; en Jalisco la venta a domicilio baja 25 %.
   * @returns { sales: csv, funnel: csv }
   */
  function generate({ from = '2026-08-01', to = '2026-09-22', skus = 600, channels = ['ecommerce', 'app', 'whatsapp', 'llamadas'], seed = 9 } = {}) {
    const cat = catalog(skus), br = branches();
    const r = rng(seed);
    const sales = ['fecha,canal,sku,codigo_producto,producto,marca,categoria,subcategoria,presentacion,region,estado,ciudad,sucursal,nombre_sucursal,tipo_entrega,venta,pedidos,unidades'];
    const funnel = ['fecha,canal,sku,vistas_ficha,agregados_carrito,inicio_checkout,compras_ga4'];
    const chW = { ecommerce: 1, app: 0.8, whatsapp: 0.35, llamadas: 0.25 };
    for (let d = from; d <= to; d = FP.calendar.addDays(d, 1)) {
      const sep = d >= '2026-09-01';
      channels.forEach((ch) => cat.forEach((c) => {
        let views = Math.round(c.views * chW[ch] * (0.8 + r() * 0.4));
        let cart = 0.12 + r() * 0.04;
        if (sep && c.category === 'Dermocosmética') { views = Math.round(views * 1.15); cart *= 0.7; }
        if (sep && c.category === 'Vitaminas') views = Math.round(views * 1.3);
        const add = Math.round(views * cart), begin = Math.round(add * (0.55 + r() * 0.1));
        const orders = Math.round(begin * (c.cr / 0.066) * (0.85 + r() * 0.3));
        const web = ch === 'ecommerce' || ch === 'app';
        if (web) funnel.push(`${d},${ch},${c.sku},${views},${add},${begin},${Math.round(orders * (1 + r() * 0.4) * 0.9)}`);
        // Reparte los pedidos del SKU-día entre sucursales y tipo de entrega (un renglón por combinación)
        let left = orders;
        const rows = new Map();
        while (left > 0) {
          const b = br[Math.floor(r() * br.length)];
          const o = Math.min(left, 1 + Math.floor(r() * 3));
          left -= o;
          const dom = r() < 0.6;
          if (sep && dom && b.state === 'Jalisco' && r() < 0.25) continue;
          const k = `${b.id}|${dom}`;
          const x = rows.get(k) || { b, dom, o: 0, u: 0, rev: 0 };
          const units = o + Math.round(o * r() * 0.6);
          x.o += o; x.u += units; x.rev += units * c.price * (0.95 + r() * 0.1);
          rows.set(k, x);
        }
        rows.forEach((x) => sales.push(`${d},${ch},${c.sku},EAN${c.sku.slice(3)},${c.product},${c.brand},${c.category},${c.subcategory},Caja,${x.b.region},${x.b.state},${x.b.city},${x.b.id},${x.b.name},${x.dom ? 'domicilio' : 'recoleccion'},${Math.round(x.rev * 100) / 100},${x.o},${x.u}`));
      }));
    }
    return { sales: sales.join('\n'), funnel: funnel.join('\n') };
  }

  /** Caso de calidad de venta: duplicado exacto, conflicto, estado y entrega inválidos, sin sucursal, faltantes, negativos. */
  function qualityCase() {
    const h = 'fecha,canal,sku,producto,categoria,subcategoria,estado,sucursal,tipo_entrega,venta,pedidos,unidades';
    return [h,
      '2026-09-20,ecommerce,SKU1,Multi A,Vitaminas,Multivitamínicos,Jalisco,SUC-001,domicilio,1000,10,12',
      '2026-09-20,ecommerce,SKU1,Multi A,Vitaminas,Multivitamínicos,Jalisco,SUC-001,domicilio,1000,10,12',
      '2026-09-20,ecommerce,SKU1,Multi A,Vitaminas,Multivitamínicos,Jalisco,SUC-001,domicilio,1500,15,16',
      '2026-09-20,ecommerce,SKU1,Multi A,Vitaminas,Multivitamínicos,JAL,SUC-001,Recoger en sucursal,500,5,5',
      '2026-09-20,app,SKU2,Zinc B,Vitaminas,Minerales,CDMX,SUC-010,Envío a domicilio,,4,4',
      '2026-09-20,app,SKU3,Zinc C,Vitaminas,Minerales,Edo. Méx.,SUC-011,pickup,abc,2,2',
      '2026-09-20,app,SKU4,Sin categoría,,,Nuevo León,SUC-020,domicilio,200,0,0',
      '2026-09-20,app,SKU5,Zinc D,Vitaminas,Minerales,Puebla,SUC-030,domicilio,-50,1,1',
      '2026-09-20,app,SKU6,Zinc E,Vitaminas,Minerales,Narnia,SUC-031,domicilio,100,1,1',
      '2026-09-20,app,SKU7,Zinc F,Vitaminas,Minerales,Puebla,,domicilio,100,1,1',
      '2026-09-20,app,SKU8,Zinc G,Vitaminas,Minerales,Puebla,SUC-032,dron,100,1,1',
      '2026-09-20,marketplace,SKU9,Zinc H,Vitaminas,Minerales,Puebla,SUC-032,domicilio,100,1,1'
    ].join('\n');
  }

  /** Caso de geografía (Fase 8.4): completa, parcial, sin geografía, huérfanos e inconsistencias padre/hijo. */
  function geoCase() {
    const h = 'fecha,canal,sku,producto,categoria,region,estado,ciudad,sucursal,nombre_sucursal,tipo_entrega,venta,pedidos,unidades';
    return [h,
      '2026-09-20,ecommerce,G1,Prod G1,Vitaminas,Occidente,Jalisco,Guadalajara,025,Sucursal Guadalajara Centro,recoleccion,1000,10,12',
      '2026-09-20,ecommerce,G1,Prod G1,Vitaminas,Occidente,Jalisco,Zapopan,025,Sucursal Guadalajara Centro,domicilio,500,5,5',
      '2026-09-20,ecommerce,G2,Prod G2,Vitaminas,Occidente,Jalisco,Guadalajara,,,domicilio,300,3,3',
      '2026-09-20,ecommerce,G3,Prod G3,Vitaminas,,,,,,,200,2,2',
      '2026-09-20,app,G4,Prod G4,Vitaminas,Centro,Jalisco,Guadalajara,026,Sucursal Chapultepec,recoleccion,100,1,1',
      '2026-09-20,app,G5,Prod G5,Vitaminas,Centro,CDMX,Coyoacán,027,Sucursal Guadalajara Centro,recoleccion,100,1,1',
      '2026-09-20,app,G6,Prod G6,Vitaminas,Norte,Narnia,Ciudad X,028,Sucursal Narnia,recoleccion,100,1,1',
      '2026-09-20,app,G7,Prod G7,Vitaminas,Norte,Nuevo León,Monterrey,029,Sucursal Norte,recoleccion,100,1,1',
      '2026-09-20,app,G7,Prod G7,Vitaminas,Norte,Coahuila,Saltillo,029,Sucursal Norte,recoleccion,50,1,1'
    ].join('\n');
  }

  FP.mockProducts = { catalog, branches, generate, qualityCase, geoCase, CATS, STATES, REGION, CITIES };
})(typeof window !== 'undefined' ? window : globalThis);
