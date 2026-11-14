/**
 * Rapporto del mattino: prima apertura del giorno, periodi da generare, orario della notifica.
 * Nessun I/O. I test coprono solo queste funzioni.
 */

import { addCalendarDays, focusMonthName, isIsoDateString } from '../normalize/focusDateUtils.js';

export const DEFAULT_NOTIFICATION_CLOCK = '08:00';
export const DAY_NOTIFICATION_TEXT = 'Com\'è andata ieri? Il tuo Focus ti aspetta.';
export const WEEK_NOTIFICATION_TEXT = 'La tua settimana è pronta da leggere';

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isFirstOpenOfDay(lastOpenDate, today) {
  if (!isIsoDateString(today)) return false;
  return lastOpenDate !== today;
}

/** @returns {Array<'ieri'|'settimana'|'mese'>} */
export function periodsToGenerate(today) {
  if (!isIsoDateString(today)) return [];
  const periods = ['ieri'];
  if (weekday(today) === 1) periods.push('settimana');
  if (Number(today.slice(8, 10)) === 1) periods.push('mese');
  return periods;
}

export function morningNotification(today) {
  if (!isIsoDateString(today)) {
    return { periodId: 'ieri', text: DAY_NOTIFICATION_TEXT };
  }
  if (Number(today.slice(8, 10)) === 1) {
    const previous = addCalendarDays(`${today.slice(0, 8)}01`, -1);
    const month = focusMonthName(previous) || 'mese';
    return { periodId: 'mese', text: `Ecco com'è andato ${month}` };
  }
  if (weekday(today) === 1) {
    return { periodId: 'settimana', text: WEEK_NOTIFICATION_TEXT };
  }
  return { periodId: 'ieri', text: DAY_NOTIFICATION_TEXT };
}

/**
 * Una sola generazione automatica per periodo e dataVersion.
 * Un fallimento non si ripete nello stesso giorno: ci riprova alla prima apertura successiva.
 */
export function autoGenerationDecision(record, key, today) {
  const previous = record?.auto?.[key];
  if (!previous) return 'run';
  if (previous.status === 'done') return 'skip';
  if (previous.status === 'failed' && previous.on === today) return 'skip';
  return 'run';
}

export function autoGenerationKey(periodId, dataVersion) {
  return `${periodId}|${String(dataVersion || '')}`;
}

/** Mediana. Con un numero pari di valori, la media dei due centrali. */
export function medianNumber(values) {
  const nums = (values || []).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Orario della notifica. `override` è un orario scelto in Impostazioni ("HH:MM").
 * Altrimenti 30 minuti dopo la mediana degli orari di risveglio, o le 8:00.
 * @param {{ wakeHours?: number[], override?: string|null }} input
 */
export function notificationClock(input = {}) {
  const override = String(input.override || '').trim();
  if (CLOCK_RE.test(override)) return override;
  const median = medianNumber(input.wakeHours);
  if (median == null) return DEFAULT_NOTIFICATION_CLOCK;
  return clockFromDecimalHour(median + 0.5);
}

export function shouldSendNotification({ enabled, focusOpenedOn, today }) {
  if (enabled === false) return false;
  if (focusOpenedOn && focusOpenedOn === today) return false;
  return true;
}

/** @param {number} hour ore decimali */
export function clockFromDecimalHour(hour) {
  if (!Number.isFinite(hour)) return DEFAULT_NOTIFICATION_CLOCK;
  const wrapped = ((hour % 24) + 24) % 24;
  const total = Math.round(wrapped * 60) % (24 * 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}
