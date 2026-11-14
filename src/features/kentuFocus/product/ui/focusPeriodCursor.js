/**
 * Ultimo periodo completo, e lo spostamento di una freccia.
 * Il periodo in corso è la freccia successiva.
 */

import { addCalendarDays, isIsoDateString } from '../../normalize/focusDateUtils.js';

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/**
 * @param {'ieri'|'settimana'|'mese'} periodId
 * @param {string} today
 * @param {number} cursor 0 = ultimo completo, 1 = in corso
 */
export function focusPeriodWindow(periodId, today, cursor = 0) {
  const base = lastComplete(periodId, today);
  return shiftWindow(periodId, base, cursor, today);
}

function lastComplete(periodId, today) {
  if (periodId === 'settimana') {
    const current = weekOf(today);
    return current.to < today ? current : shiftWeek(current, -1);
  }
  if (periodId === 'mese') {
    const current = monthOf(today);
    return current.to < today ? current : shiftMonth(current, -1);
  }
  return { from: addCalendarDays(today, -1), to: addCalendarDays(today, -1) };
}

function shiftWindow(periodId, base, cursor, today) {
  const steps = Number.isFinite(cursor) ? Math.round(cursor) : 0;
  let window = base;
  if (periodId === 'settimana') window = shiftWeek(base, steps);
  else if (periodId === 'mese') window = shiftMonth(base, steps);
  else window = { from: addCalendarDays(base.from, steps), to: addCalendarDays(base.to, steps) };

  const inProgress = window.from <= today && window.to >= today;
  const analysisDate = inProgress ? today : window.to;
  return {
    periodId,
    from: window.from,
    to: window.to,
    analysisDate,
    inProgress,
    label: periodLabel(periodId, window.from, window.to, today),
  };
}

export function weekOf(iso) {
  const date = atNoon(iso);
  const mondayOffset = (date.getDay() + 6) % 7;
  const from = addCalendarDays(iso, -mondayOffset);
  return { from, to: addCalendarDays(from, 6) };
}

function shiftWeek(window, steps) {
  return {
    from: addCalendarDays(window.from, steps * 7),
    to: addCalendarDays(window.to, steps * 7),
  };
}

export function monthOf(iso) {
  const [year, month] = iso.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0));
  return { from, to: last.toISOString().slice(0, 10) };
}

function shiftMonth(window, steps) {
  const [year, month] = window.from.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + steps, 1));
  return monthOf(next.toISOString().slice(0, 10));
}

function periodLabel(periodId, from, to, today) {
  if (periodId === 'mese') {
    const date = atNoon(from);
    const name = MONTHS[date.getMonth()];
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.getFullYear()}`;
  }
  if (periodId === 'settimana') {
    return `${dayMonth(from, from.slice(5, 7) !== to.slice(5, 7))} – ${dayMonth(to, true)}`;
  }
  const date = atNoon(from);
  const body = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (from === today) return `Oggi · ${body}`;
  if (from === addCalendarDays(today, -1)) return `Ieri · ${body}`;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function dayMonth(iso, withMonth) {
  const date = atNoon(iso);
  if (!withMonth) return String(date.getDate());
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function atNoon(iso) {
  return new Date(`${iso}T12:00:00`);
}

export function cursorForDay(today, date) {
  const yesterday = addCalendarDays(today, -1);
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${yesterday}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function datesBetween(from, to) {
  const dates = [];
  if (!isIsoDateString(from) || !isIsoDateString(to) || from > to) return dates;
  for (let cursor = from; cursor <= to && dates.length < 400; cursor = addCalendarDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}
