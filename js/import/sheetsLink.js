/**
 * sheetsLink.js — Google Sheets por enlace publicado (opción A).
 *
 * Una pestaña publicada en la web como CSV es una URL pública de solo lectura. Este módulo:
 *   1) valida y normaliza el enlace que pega la persona (solo https://docs.google.com/spreadsheets/…),
 *   2) lo lee con fetch (sin credenciales) y distingue los fallos típicos (no publicado, HTML en vez de CSV, red/CORS),
 *   3) lo entrega como texto/File para que entre por la MISMA ruta de importación de siempre
 *      (revisión → mapeo → validación → confirmar). No valida ni traduce datos: eso sigue siendo de la importación.
 *
 * No guarda tokens ni claves; lo único que se recuerda es el enlace (ver app.js).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const HOST = 'docs.google.com';

  /**
   * Normaliza el enlace pegado.
   * Devuelve { ok:true, csvUrl, kind:'published'|'shared', gid } o { ok:false, error }.
   *  - published: …/spreadsheets/d/e/<id>/pub?…  (Archivo → Compartir → Publicar en la web → CSV)
   *  - shared: …/spreadsheets/d/<id>/edit#gid=N  (enlace de «cualquier persona con el enlace»; comparte TODO el libro)
   */
  function normalize(input) {
    const raw = String(input || '').trim();
    if (!raw) return { ok: false, error: 'Pega el enlace de la pestaña publicada.' };
    let u;
    try { u = new URL(raw); } catch (e) { return { ok: false, error: 'Eso no parece un enlace. Cópialo completo, empezando con https://docs.google.com/…' }; }
    if (u.protocol !== 'https:' || u.hostname !== HOST || !u.pathname.startsWith('/spreadsheets/d/')) {
      return { ok: false, error: 'Solo se aceptan enlaces de Google Sheets (https://docs.google.com/spreadsheets/…).' };
    }
    const gidFrom = () => {
      const q = u.searchParams.get('gid'); if (q !== null && /^\d+$/.test(q)) return q;
      const m = /(?:^|[#&])gid=(\d+)/.exec(u.hash || ''); return m ? m[1] : null;
    };
    // Publicado en la web: /spreadsheets/d/e/<id>/pub o /pubhtml
    const pub = /^\/spreadsheets\/d\/e\/([^/]+)\/(pub|pubhtml)$/.exec(u.pathname);
    if (pub) {
      const gid = gidFrom();
      const out = new URL(`https://${HOST}/spreadsheets/d/e/${pub[1]}/pub`);
      if (gid !== null) out.searchParams.set('gid', gid);
      out.searchParams.set('single', 'true'); out.searchParams.set('output', 'csv');
      return { ok: true, csvUrl: out.toString(), kind: 'published', gid };
    }
    // Enlace de edición/compartido: /spreadsheets/d/<id>/(edit|view|…)
    const shr = /^\/spreadsheets\/d\/([^/]+)(?:\/.*)?$/.exec(u.pathname);
    if (shr && shr[1] !== 'e') {
      const gid = gidFrom();
      const out = new URL(`https://${HOST}/spreadsheets/d/${shr[1]}/export`);
      out.searchParams.set('format', 'csv'); if (gid !== null) out.searchParams.set('gid', gid);
      return { ok: true, csvUrl: out.toString(), kind: 'shared', gid };
    }
    return { ok: false, error: 'No reconozco ese enlace de Google Sheets. Usa Archivo → Compartir → Publicar en la web, elige la pestaña, formato CSV y copia el enlace.' };
  }

  const HELP_FALLBACK = 'Alternativa: en Google Sheets usa Archivo → Descargar → CSV y súbelo con «Seleccionar CSV».';

  /** ¿Parece una página web (login, error) en vez de un CSV? */
  function looksLikeHtml(text) {
    const head = String(text || '').slice(0, 600).toLowerCase();
    return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/.test(head);
  }

  /**
   * Lee el CSV. `fetchImpl` permite probarlo sin red.
   * Devuelve { ok:true, text, rows } o { ok:false, error }.
   */
  async function fetchCsv(csvUrl, opts) {
    const f = (opts && opts.fetchImpl) || (root.fetch ? root.fetch.bind(root) : null);
    if (!f) return { ok: false, error: 'Este navegador no puede leer enlaces. ' + HELP_FALLBACK };
    let res;
    try { res = await f(csvUrl, { method: 'GET', credentials: 'omit', redirect: 'follow', cache: 'no-store' }); }
    catch (e) {
      return { ok: false, error: 'El navegador no pudo leer el enlace (sin conexión, o Google/el navegador lo bloqueó). Revisa que la pestaña esté publicada. ' + HELP_FALLBACK };
    }
    if (!res.ok) {
      const why = res.status === 404 ? 'No existe o ya no está publicada (Google respondió 404).'
        : res.status === 401 || res.status === 403 ? 'No tienes acceso: la pestaña no está publicada en la web o requiere iniciar sesión.'
          : `Google respondió ${res.status}.`;
      return { ok: false, error: `${why} ${HELP_FALLBACK}` };
    }
    let text = '';
    try { text = await res.text(); } catch (e) { return { ok: false, error: 'No se pudo leer la respuesta. ' + HELP_FALLBACK }; }
    if (looksLikeHtml(text)) {
      return { ok: false, error: 'Google devolvió una página web en vez de datos: la pestaña no está publicada como CSV o pide iniciar sesión. En Sheets: Archivo → Compartir → Publicar en la web → elige la pestaña → CSV. ' + HELP_FALLBACK };
    }
    text = text.replace(/^﻿/, '');
    const rows = text ? text.split(/\r?\n/).filter((l) => l.trim() !== '').length : 0;
    if (rows < 2) return { ok: false, error: 'La pestaña llegó vacía o solo con encabezados. Revisa que tenga datos y que sea la pestaña correcta.' };
    return { ok: true, text, rows };
  }

  /** Nombre de archivo para la revisión: «Google Sheets · <etiqueta>.csv». */
  function fileName(label, type) {
    const base = String(label || '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 60) || type;
    return `Google Sheets - ${base}.csv`;
  }

  FP.sheetsLink = { normalize, fetchCsv, looksLikeHtml, fileName, HOST };
})(typeof window !== 'undefined' ? window : globalThis);
