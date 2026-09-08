import { TRACKER_STORICO_KEY, normalizeLogData } from '../coreEngine';
import { parseDecimalHourFromValue } from '../features/salaComandi/utils/mealConsumedTime';
import {
  normalizeTrackerDayLog,
  resolveOvernightCarryMeal,
  shiftDateStr,
} from './dayTrackingStatus';
import { isFastingBreakerItem } from './fastingBreakRules';

/** Sotto questa soglia un intervallo non conta come finestra di digiuno. */
export const MIN_FASTING_INTERVAL_HOURS = 0.25;

/**
 * @param {unknown} hour
 * @returns {number | null}
 */
function clampMealHour(hour) {
  const n = Number(hour);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(24, n));
}

/**
 * @param {object} item
 * @param {object | null | undefined} mealTimesObj
 * @returns {number | null}
 */
export function resolveFastingBreakerHour(item, mealTimesObj = null) {
  const fromItem = parseDecimalHourFromValue(item?.mealTime)
    ?? parseDecimalHourFromValue(item?.time);
  const clampedItem = clampMealHour(fromItem);
  if (clampedItem != null) return Math.round(clampedItem * 60) / 60;

  if (item?.mealType != null && mealTimesObj) {
    const fromSlot = parseDecimalHourFromValue(mealTimesObj[item.mealType]);
    const clampedSlot = clampMealHour(fromSlot);
    if (clampedSlot != null) return Math.round(clampedSlot * 60) / 60;
  }
  return null;
}

/**
 * Orari unici (al minuto) dei pasti che rompono il digiuno, in ordine.
 * @param {unknown} log
 * @param {object | null | undefined} mealTimesObj
 * @returns {number[]}
 */
export function collectSortedFastingBreakerHours(log, mealTimesObj = null) {
  const hours = [];
  const list = normalizeLogData(normalizeTrackerDayLog(log));
  for (const item of list) {
    if (!isFastingBreakerItem(item)) continue;
    const hour = resolveFastingBreakerHour(item, mealTimesObj);
    if (hour == null) continue;
    hours.push(hour);
  }
  return [...new Set(hours)].sort((a, b) => a - b);
}

/**
 * @param {string} dayKey
 * @param {number} decimalHour
 * @returns {number | null}
 */
function decimalHourToMs(dayKey, decimalHour) {
  if (!dayKey) return null;
  const hour = clampMealHour(decimalHour);
  if (hour == null) return null;
  const base = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  base.setHours(h, m, 0, 0);
  return base.getTime();
}

/**
 * @param {{ startDate: string, startHour: number, endDate: string, endHour: number }} interval
 * @returns {number}
 */
export function hoursForFastingInterval(interval) {
  const startMs = decimalHourToMs(interval?.startDate, interval?.startHour);
  const endMs = decimalHourToMs(interval?.endDate, interval?.endHour);
  if (startMs == null || endMs == null || endMs <= startMs) return 0;
  return (endMs - startMs) / 3600000;
}

/**
 * @param {number} hours
 * @returns {string}
 */
export function formatFastingHoursLabel(hours) {
  const raw = Math.max(0, Number(hours) || 0);
  const totalMinutes = Math.round(raw * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/**
 * @param {number} decimalHour
 * @param {(hour: number) => string} [decimalToTimeStr]
 * @returns {string}
 */
export function formatFastingClock(decimalHour, decimalToTimeStr) {
  if (typeof decimalToTimeStr === 'function') {
    const label = decimalToTimeStr(Number(decimalHour));
    if (label) return label;
  }
  const hour = clampMealHour(decimalHour);
  if (hour == null) return '—';
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatItalianDayMonth(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/**
 * Sottotitolo "Dalle 21:00 di ieri alle 11:30 di oggi".
 * @param {{
 *   mode?: string,
 *   startDate?: string | null,
 *   startHour?: number | null,
 *   endDate?: string | null,
 *   endHour?: number | null,
 * }} summary
 * @param {string} selectedDate
 * @param {(hour: number) => string} [decimalToTimeStr]
 * @returns {string | null}
 */
export function formatFastingRangeLabel(summary, selectedDate, decimalToTimeStr) {
  const startDate = String(summary?.startDate || '').trim();
  const endDate = String(summary?.endDate || '').trim();
  const startHour = Number(summary?.startHour);
  const endHour = Number(summary?.endHour);
  if (!startDate || !Number.isFinite(startHour)) return null;

  const startClock = formatFastingClock(startHour, decimalToTimeStr);
  const yesterday = shiftDateStr(selectedDate, -1);

  if (summary?.mode === 'in_progress') {
    if (startDate === selectedDate) return `Dall'ultimo pasto alle ${startClock}`;
    if (startDate === yesterday) return `Dall'ultimo pasto alle ${startClock} di ieri`;
    return `Dall'ultimo pasto alle ${startClock} del ${formatItalianDayMonth(startDate)}`;
  }

  if (!endDate || !Number.isFinite(endHour)) return null;
  const endClock = formatFastingClock(endHour, decimalToTimeStr);

  if (startDate === endDate) {
    return `Dalle ${startClock} alle ${endClock}`;
  }
  if (startDate === yesterday && endDate === selectedDate) {
    return `Dalle ${startClock} di ieri alle ${endClock} di oggi`;
  }
  return `Dalle ${startClock} del ${formatItalianDayMonth(startDate)} alle ${endClock}`;
}

/**
 * Digiuno massimo completato nel giorno selezionato.
 * Un intervallo Pasto A → Pasto B è attribuito alla data di Pasto B.
 *
 * @param {{
 *   selectedDate?: string,
 *   dayLog?: unknown,
 *   fullHistory?: object | null,
 *   mealTimesObj?: object | null,
 *   isToday?: boolean,
 *   currentHour?: number,
 * }} options
 * @returns {{
 *   mode: 'completed' | 'in_progress' | 'empty',
 *   hours: number,
 *   startDate: string | null,
 *   startHour: number | null,
 *   endDate: string | null,
 *   endHour: number | null,
 * }}
 */
export function computeMaxCompletedFastForDate({
  selectedDate,
  dayLog,
  fullHistory = null,
  mealTimesObj = null,
  isToday = false,
  currentHour = 12,
} = {}) {
  const empty = {
    mode: 'empty',
    hours: 0,
    startDate: null,
    startHour: null,
    endDate: null,
    endHour: null,
  };

  const dateStr = String(selectedDate || '').trim();
  if (!dateStr) return empty;

  const historyNode = fullHistory?.[TRACKER_STORICO_KEY(dateStr)];
  const times = mealTimesObj || historyNode?.mealTimes || null;
  const log = dayLog !== undefined ? dayLog : historyNode?.log;
  const meals = collectSortedFastingBreakerHours(log, times);

  const pushInterval = (list, startDate, startHour, endDate, endHour) => {
    const interval = { startDate, startHour, endDate, endHour };
    const hours = hoursForFastingInterval(interval);
    if (hours < MIN_FASTING_INTERVAL_HOURS) return;
    list.push({ ...interval, hours });
  };

  if (meals.length === 0) {
    if (!isToday) return empty;
    const carry = resolveOvernightCarryMeal(fullHistory, dateStr);
    if (!carry) return empty;
    const nowHour = clampMealHour(currentHour) ?? 12;
    const hours = hoursForFastingInterval({
      startDate: carry.sourceDate,
      startHour: carry.lastMealTime,
      endDate: dateStr,
      endHour: nowHour,
    });
    if (hours < MIN_FASTING_INTERVAL_HOURS) return empty;
    return {
      mode: 'in_progress',
      hours,
      startDate: carry.sourceDate,
      startHour: carry.lastMealTime,
      endDate: dateStr,
      endHour: nowHour,
    };
  }

  const intervals = [];
  const carry = resolveOvernightCarryMeal(fullHistory, dateStr);
  if (carry) {
    pushInterval(
      intervals,
      carry.sourceDate,
      carry.lastMealTime,
      dateStr,
      meals[0],
    );
  }
  for (let i = 1; i < meals.length; i += 1) {
    pushInterval(intervals, dateStr, meals[i - 1], dateStr, meals[i]);
  }

  if (intervals.length === 0) return empty;

  let best = intervals[0];
  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i].hours > best.hours) best = intervals[i];
  }

  return {
    mode: 'completed',
    hours: best.hours,
    startDate: best.startDate,
    startHour: best.startHour,
    endDate: best.endDate,
    endHour: best.endHour,
  };
}
