/**
 * events.js — Entidades de eventos comerciales e hitos.
 *
 * Fase 0: creación, validación y consulta por fecha.
 * El motor de impacto (impactWeight → pesos de estacionalidad) llega después.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const Cal = () => FP.calendar;
  const M = () => FP.metrics;

  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /** Evento con rango de fechas (Hot Sale, Buen Fin, campaña…). */
  function createEvent({ id = null, name, startDate, endDate = null, type = 'commercial_event',
    channels = null, impactWeight = null, notes = '' }) {
    const end = endDate || startDate;
    const ev = {
      id: id || `${slug(name)}-${String(startDate).slice(0, 4)}`,
      name, startDate, endDate: end, type,
      channels,            // null = todos los canales
      impactWeight: M().toNumberOrNull(impactWeight),
      notes
    };
    const errors = validateEvent(ev);
    if (errors.length) throw new Error(errors.join(' '));
    return ev;
  }

  function validateEvent(ev) {
    const errors = [];
    if (!ev.name) errors.push('El evento necesita nombre.');
    if (!Cal().isValidISODate(ev.startDate)) errors.push('startDate inválida.');
    if (!Cal().isValidISODate(ev.endDate)) errors.push('endDate inválida.');
    if (ev.startDate && ev.endDate && ev.endDate < ev.startDate) errors.push('endDate es anterior a startDate.');
    if (!C().eventTypes.includes(ev.type)) errors.push(`Tipo de evento inválido: "${ev.type}".`);
    if (ev.channels && !ev.channels.every((c) => C().channelIds.includes(c))) errors.push('Canal inválido en evento.');
    return errors;
  }

  /** Hito puntual (lanzamiento, cambio de precios, caída de sitio…). */
  function createMilestone({ id = null, date, title, description = '', type = 'milestone', channel = null, impact = null }) {
    if (!Cal().isValidISODate(date)) throw new Error('Fecha de hito inválida.');
    if (!title) throw new Error('El hito necesita título.');
    if (channel && !C().channelIds.includes(channel)) throw new Error('Canal inválido en hito.');
    return { id: id || `${date}-${slug(title)}`, date, type, title, description, channel, impact };
  }

  const isDateInEvent = (date, ev) => date >= ev.startDate && date <= ev.endDate;
  const appliesToChannel = (ev, channel) => !ev.channels || !channel || ev.channels.includes(channel);

  function eventsOnDate(events, date, channel = null) {
    return events.filter((e) => isDateInEvent(date, e) && appliesToChannel(e, channel));
  }
  function milestonesOnDate(milestones, date, channel = null) {
    return milestones.filter((m) => m.date === date && (!m.channel || !channel || m.channel === channel));
  }

  FP.events = { createEvent, validateEvent, createMilestone, isDateInEvent, eventsOnDate, milestonesOnDate };
})(typeof window !== 'undefined' ? window : globalThis);
