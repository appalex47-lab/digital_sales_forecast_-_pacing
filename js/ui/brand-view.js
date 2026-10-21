/**
 * brand-view.js — «Marca de la presentación» (Configuración → Negocio). Solo pinta el borrador (state.brand) y una vista previa.
 * La paleta sale del logo en el navegador; la persona elige color principal y acento. No calcula cifras de negocio.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const esc = (v) => H().esc(v);
  const B = () => FP.brand;

  function mini(d, cover, small) {
    const b = { main: d.main || '#1F5FD6', accent: d.accent || B().FALLBACK_ACCENT }, bg = B().coverBg(cover, b), deco = B().coverDeco(cover, b), light = cover === 'light';
    const t = B().tones(b), logo = d.logo ? `<span class="brand-pv__chip"${light ? ' style="border:1px solid #DFE5F0"' : ''}><img src="${d.logo.dataUrl}" alt=""></span>` : '';
    return `<div class="brand-pv brand-pv--cover${small ? ' brand-pv--thumb' : ''}" style="background:${bg};color:${light ? '#14233B' : '#fff'}">${deco || ''}
      ${small ? '' : `${logo}<div class="brand-pv__eye" style="color:${light ? t.accText : t.acc}">REPORTE EJECUTIVO</div><div class="brand-pv__ttl">Ventas digitales: avance del mes y cierre estimado</div><div class="brand-pv__rule" style="background:${t.acc}"></div>`}</div>`;
  }
  function preview(d) {
    const main = d.main || '#1F5FD6', acc = d.accent || B().FALLBACK_ACCENT, text = B().textTone(main);
    const logo = d.logo ? `<img src="${d.logo.dataUrl}" alt="Logo">` : '';
    return `${mini(d, d.cover || 'chart', false)}
      <div class="brand-pv brand-pv--slide"><div class="brand-pv__eye" style="color:${text}">DESEMPEÑO COMERCIAL</div><div class="brand-pv__st">El mes va por encima del plan</div>
        <div class="brand-pv__k"><span style="border-top:3px solid ${text}"><i>Venta real</i><b style="color:${text}">$21.3M</b></span><span style="border-top:3px solid #DCE3EE"><i>Plan</i><b>$20.4M</b></span><span style="border-top:3px solid ${acc}"><i>Cierre</i><b>$35.8M</b></span></div>
        <div class="brand-pv__foot">${logo ? `<span class="brand-pv__sm">${logo}</span>` : ''}Total digital<span style="margin-left:auto">3</span></div></div>`;
  }
  /** Miniaturas de los 6 fondos de portada; «Gráfica ascendente» usa un dibujo propio porque el de siempre es el de la presentación. */
  function covers(d) {
    const cur = B().coverId(d.cover);
    return `<div class="brand__covers" role="radiogroup" aria-label="Fondo de la portada">${B().COVERS.map((c) => `<button type="button" role="radio" aria-checked="${c.id === cur}" class="brand-cv${c.id === cur ? ' is-sel' : ''}" data-action="brand-cover" data-id="${c.id}">${c.id === 'chart' ? chartThumb(d) : mini(d, c.id, true)}<span>${esc(c.label)}</span></button>`).join('')}</div>`;
  }
  function chartThumb(d) {
    const b = { main: d.main || '#1F5FD6', accent: d.accent || B().FALLBACK_ACCENT };
    return `<div class="brand-pv brand-pv--cover brand-pv--thumb" style="background:${B().coverBg('chart', b)}"><svg class="rp-deco rp-deco--bg" viewBox="0 0 640 420" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><g fill="#fff" opacity=".1"><rect x="410" y="170" width="34" height="250"/><rect x="460" y="220" width="34" height="200"/><rect x="510" y="270" width="34" height="150"/><rect x="560" y="120" width="34" height="300"/></g><polyline points="330,360 420,300 500,320 590,190" fill="none" stroke="#7d92d8" stroke-width="5"/></svg></div>`;
  }

  function render(state) {
    const host = document.getElementById('brand-body'); if (!host) return;
    const b = state.brand || { draft: {}, sel: null }, d = b.draft || {}, pal = d.palette || [];
    const saved = Boolean(b.saved);
    const swatch = (c, i) => `<button type="button" class="brand-sw${b.sel === i ? ' is-sel' : ''}" data-action="brand-sel" data-i="${i}" aria-pressed="${b.sel === i}" aria-label="Color ${esc(c)}"><i style="background:${c}"></i><b>${esc(c)}</b><span>${c === d.main ? 'Principal' : c === d.accent ? 'Acento' : '&nbsp;'}</span></button>`;
    const low = d.main && B().contrast(d.main, '#FFFFFF') < 4.5;
    host.innerHTML = `
      ${b.error ? `<p class="issues issues--block" role="alert">${esc(b.error)}</p>` : ''}
      <div class="brand">
        <div class="brand__col">
          <h5 class="brand__h">1 · Logo</h5>
          <div class="brand__logo">
            <div class="brand__drop">${d.logo ? `<img src="${d.logo.dataUrl}" alt="Logo cargado">` : '<span>Sin logo</span>'}</div>
            <div><p class="brand__name">${d.logo ? `<b>${esc(d.logo.name)}</b> · ${d.logo.w}×${d.logo.h}` : 'Sube el logo de tu negocio'}</p>
              <p class="field__hint">PNG o JPG, hasta 2 MB. Mejor con fondo transparente. Se reduce a un tamaño ligero antes de guardarse.</p>
              <div class="btn-row"><label class="btn btn--primary file-btn">${d.logo ? 'Cambiar logo' : 'Subir logo'}<input type="file" accept="image/png,image/jpeg" data-action="brand-file"></label>
              ${d.logo ? '<button type="button" class="btn btn--quiet" data-action="brand-remove-logo">Quitar logo</button>' : ''}</div></div>
          </div>
          <h5 class="brand__h">2 · Paleta propuesta desde tu logo <span class="field__hint">ignora blanco, transparente y grises</span></h5>
          ${pal.length ? `<div class="brand__sws">${pal.map(swatch).join('')}</div>
            <div class="btn-row"><button type="button" class="btn" data-action="brand-role" data-role="main" ${b.sel === null || b.sel === undefined ? 'disabled' : ''}>Usar el color elegido como principal</button>
            <button type="button" class="btn" data-action="brand-role" data-role="accent" ${b.sel === null || b.sel === undefined ? 'disabled' : ''}>Usar el color elegido como acento</button></div>`
            : '<p class="field__hint">Sube un logo para proponer una paleta, o escribe tus colores abajo.</p>'}
          <h5 class="brand__h">3 · Fondo de la portada <span class="field__hint">usa los colores de tu marca</span></h5>
          ${covers(d)}
          <div class="brand__hex"><label>Principal <input type="text" value="${esc(d.main || '')}" maxlength="7" placeholder="#RRGGBB" data-action="brand-hex" data-role="main" aria-label="Color principal en hexadecimal"></label>
            <label>Acento <input type="text" value="${esc(d.accent || '')}" maxlength="7" placeholder="#RRGGBB" data-action="brand-hex" data-role="accent" aria-label="Color de acento en hexadecimal"></label></div>
          ${low ? `<p class="brand__warn" role="status">▲ El principal tiene contraste ${B().contrast(d.main, '#FFFFFF').toFixed(1)} : 1 con texto blanco (mínimo 4.5). En los textos se usará un tono más oscuro (${esc(B().textTone(d.main))}); el color elegido se queda en barras, bordes y portada.</p>` : ''}
          <p class="field__hint">Fijos, no cambian con la marca: el rojo y el verde de «resta» y «suma», y los grises de las tablas.</p>
          <div class="btn-row">
            <button type="button" class="btn btn--primary" data-action="brand-save" ${d.main || d.logo ? '' : 'disabled'}>Guardar marca</button>
            <button type="button" class="btn" data-action="brand-reset" ${d.logo ? '' : 'disabled'}>Restablecer colores desde el logo</button>
            ${saved ? '<button type="button" class="btn btn--quiet" data-action="brand-clear">Quitar marca (volver al aspecto original)</button>' : ''}
          </div>
          <p class="field__hint">${b.dirty ? 'Hay cambios sin guardar.' : saved ? 'Marca guardada. Con la sincronización de equipo encendida, tu equipo la recibe; si no, se guarda solo en este navegador.' : 'Sin marca guardada: la presentación usa su aspecto original.'}</p>
        </div>
        <div class="brand__col"><h5 class="brand__h">Vista previa en vivo</h5>${preview(d)}
          <p class="field__hint">Logo grande en la portada y pequeño en el pie de cada lámina. Sobre fondo oscuro va dentro de un recuadro claro.</p></div>
      </div>`;
  }

  FP.brandView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
