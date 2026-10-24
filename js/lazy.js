/**
 * lazy.js — Carga bajo demanda de módulos que no hacen falta para abrir la app (Fase A).
 *
 * index.html sigue siendo la única lista de archivos (ARCHITECTURE.md): un módulo diferido se declara allí como
 *   <script src="js/…?v=…" type="text/plain" data-lazy="nombre"></script>
 * El navegador NO descarga ni ejecuta un script con type="text/plain". FP.lazy.load('nombre') crea los <script> reales,
 * en el mismo orden en que aparecen en index.html, y resuelve cuando el último terminó de cargar.
 *
 * Módulos diferidos hoy: 'selftest' (pruebas del motor) y 'storagetests' (pruebas de almacenamiento).
 * Nunca lanza de forma síncrona: devuelve una promesa. Si un archivo falla, la promesa se rechaza y un nuevo intento vuelve a cargarlo.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const inflight = {};   // nombre → promesa (carga en curso o ya terminada)

  function declared(name) {
    return Array.from(root.document.querySelectorAll('script[type="text/plain"][data-lazy]'))
      .filter((t) => t.getAttribute('data-lazy') === name);
  }

  function inject(src) {
    return new Promise((resolve, reject) => {
      const s = root.document.createElement('script');
      s.src = src;
      s.async = false;   // conserva el orden
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      root.document.head.appendChild(s);
    });
  }

  /** Carga (una sola vez) los scripts diferidos de `name`. */
  function load(name) {
    if (inflight[name]) return inflight[name];
    const tags = declared(name);
    if (!tags.length) return Promise.reject(new Error(`Módulo diferido no declarado en index.html: ${name}`));
    const p = tags.reduce((chain, t) => chain.then(() => inject(t.getAttribute('src'))), Promise.resolve());
    inflight[name] = p.catch((e) => { delete inflight[name]; throw e; });
    return inflight[name];
  }

  FP.lazy = { load };
})(typeof window !== 'undefined' ? window : globalThis);
