/**
 * Stato del giorno. Puro: niente UI, niente Firebase.
 * Il colore e il giudizio non vivono qui.
 */

import { getTrackerDayNode } from '../kentuFocus/lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../kentuFocus/normalize/normalizeFoodEvents.js';
import {
  resolveFocusMealIdentity,
  resolveFoodClockHourDetailed,
} from '../kentuFocus/normalize/focusMealSlots.js';
import { computeTotali } from '../../utils/computeTotaliCore.js';
import { addCalendarDays, isIsoDateString } from '../kentuFocus/normalize/focusDateUtils.js';
import { finiteEpoch, isIsoDate, normalizeDayStatusRecord } from './dayStatusRecord.js';

export const DAY_STATUSES = Object.freeze([
  'future',
  'in_progress',
  'closed',
  'unconfirmed',
  'hole',
  'paused',
  'late',
  'approximate',
]);

const MAIN_MEALS = new Set(['colazione', 'pranzo', 'cena']);
const REGISTERED_TYPES = new Set(['food', 'recipe', 'meal', 'sleep', 'workout']);
/** Ore dopo la fine del giorno civile oltre le quali il recupero è "late". */
export const LATE_AFTER_HOURS = 48;
/** Soglia dei buchi evidenti: sotto metà obiettivo. */
export const GAP_ENERGY_RATIO = 0.5;
/** Un pasto con orario strettamente dopo le 17 non è un buco di cena. */
export const GAP_EVENING_HOUR = 17;

/**
 * @param {string} date YYYY-MM-DD
 * @param {{
 *   today: string,
 *   fullHistory?: object|null,
 *   records?: Record<string, object>|null,
 *   record?: object|null,
 *   targetKcal?: number|null,
 * }} context
 * @returns {typeof DAY_STATUSES[number]|null}
 */
export function getDayStatus(date, context = {}) {
  if (!isIsoDate(date) || !isIsoDateString(date)) return null;
  const today = String(context.today || '').slice(0, 10);
  if (!isIsoDate(today)) return null;

  const record = normalizeDayStatusRecord(
    context.record !== undefined
      ? context.record
      : context.records?.[date],
  );
  if (record?.paused) return 'paused';
  if (date > today) return 'future';
  if (date === today) return 'in_progress';
  if (record?.approximate) return 'approximate';

  const dayNode = getTrackerDayNode(context.fullHistory, date);
  if (isLoggedLate(date, dayNode, record)) return 'late';
  if (record?.confirmed) return 'closed';
  if (dayHasRegistration(dayNode)) return 'unconfirmed';
  return 'hole';
}

/**
 * Buchi evidenti, senza giudizio.
 * @param {string} date
 * @param {{
 *   fullHistory?: object|null,
 *   targetKcal?: number|null,
 * }} context
 */
export function detectDayGaps(date, context = {}) {
  const empty = {
    date: isIsoDate(date) ? date : null,
    hasGaps: false,
    reasons: [],
    mainMeals: [],
    mainMealCount: 0,
    lastMealHour: null,
    kcal: 0,
    targetKcal: finiteTarget(context.targetKcal),
    energyRatio: null,
    hasFood: false,
  };
  if (!isIsoDate(date)) return empty;

  const dayNode = getTrackerDayNode(context.fullHistory, date);
  const foods = foodEntries(dayNode);
  const mainMeals = [...new Set(
    foods
      .map((item) => resolveFocusMealIdentity(item).canonicalMealType)
      .filter((meal) => MAIN_MEALS.has(meal)),
  )];
  const hours = foods
    .map((item) => resolveFoodClockHourDetailed(item, dayNode?.mealTimes).hour)
    .filter((hour) => hour != null && Number.isFinite(hour));
  const lastMealHour = hours.length ? Math.max(...hours) : null;
  const kcal = Math.round(Number(computeTotali(foods).kcal) || 0);
  const targetKcal = finiteTarget(context.targetKcal);
  const energyRatio = targetKcal != null && targetKcal > 0
    ? Math.round((kcal / targetKcal) * 1000) / 1000
    : null;

  const reasons = [];
  if (foods.length > 0 && mainMeals.length === 1) reasons.push('singleMainMeal');
  if (foods.length > 0 && (lastMealHour == null || lastMealHour <= GAP_EVENING_HOUR)) {
    reasons.push('noMealAfter17');
  }
  if (foods.length > 0 && energyRatio != null && energyRatio < GAP_ENERGY_RATIO) {
    reasons.push('lowEnergy');
  }

  return {
    date,
    hasGaps: reasons.length > 0,
    reasons,
    mainMeals,
    mainMealCount: mainMeals.length,
    lastMealHour,
    kcal,
    targetKcal,
    energyRatio,
    hasFood: foods.length > 0,
  };
}

/**
 * @param {string} from
 * @param {string} to
 * @param {object} context stesso contesto di getDayStatus, incluso targetKcal se serve altrove
 */
export function getCoverage(from, to, context = {}) {
  const blank = {
    from: isIsoDate(from) ? from : null,
    to: isIsoDate(to) ? to : null,
    days: 0,
    registered: 0,
    confirmed: 0,
    holes: 0,
    pauses: 0,
    byStatus: emptyByStatus(),
  };
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return blank;

  const byStatus = emptyByStatus();
  let registered = 0;
  let confirmed = 0;
  let holes = 0;
  let pauses = 0;
  let days = 0;
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const status = getDayStatus(date, context);
    if (!status) continue;
    days += 1;
    byStatus[status] += 1;
    if (status === 'hole') holes += 1;
    if (status === 'paused') pauses += 1;
    if (status === 'closed' || status === 'unconfirmed' || status === 'late' || status === 'approximate') {
      registered += 1;
    }
    const record = normalizeDayStatusRecord(context.records?.[date] ?? (
      context.record && date === context.recordDate ? context.record : null
    ));
    if (status === 'closed' || record?.confirmed === true) confirmed += 1;
  }

  return {
    from,
    to,
    days,
    registered,
    confirmed,
    holes,
    pauses,
    byStatus,
  };
}

/**
 * Fine del giorno civile + 48 ore, in ora locale.
 * @param {string} date
 * @returns {number}
 */
export function lateThresholdMs(date) {
  const end = new Date(`${addCalendarDays(date, 1)}T00:00:00`);
  return end.getTime() + LATE_AFTER_HOURS * 60 * 60 * 1000;
}

function isLoggedLate(date, dayNode, record) {
  if (record?.loggedLateAt != null) return true;
  const earliest = earliestLogEpoch(dayNode);
  if (earliest == null) return false;
  return earliest > lateThresholdMs(date);
}

function earliestLogEpoch(dayNode) {
  let min = null;
  for (const item of collectDayLogForNutrition(dayNode)) {
    const stamp = finiteEpoch(item?.loggedAt ?? item?.createdAt ?? item?.timestamp);
    if (stamp == null) continue;
    if (min == null || stamp < min) min = stamp;
  }
  return min;
}

function dayHasRegistration(dayNode) {
  if (!dayNode || typeof dayNode !== 'object') return false;
  if (dayNode.isIntentionalFast === true) return true;
  return collectDayLogForNutrition(dayNode).some((item) => {
    const type = String(item?.type || '').toLowerCase();
    if (REGISTERED_TYPES.has(type)) return true;
    if (!type && (item?.kcal != null || item?.cal != null || item?.desc || item?.name)) return true;
    return false;
  });
}

function foodEntries(dayNode) {
  return collectDayLogForNutrition(dayNode).filter((item) => {
    const type = String(item?.type || 'food').toLowerCase();
    return type === 'food' || type === 'recipe';
  });
}

function finiteTarget(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function emptyByStatus() {
  return {
    future: 0,
    in_progress: 0,
    closed: 0,
    unconfirmed: 0,
    hole: 0,
    paused: 0,
    late: 0,
    approximate: 0,
  };
}
