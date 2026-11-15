/**
 * Costanza Forza — mm-1.
 * Giorni di forza, scia settimanale, copertura muscoli, «da quanto».
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { expandTrackerLogEntries } from '../normalize/expandTrackerDayLog.js';
import { classifyWorkoutByType } from '../../commandTerminal/context/workoutMovement.js';
import {
  COSTANZA_UI_GROUPS,
  DEFAULT_WEEKLY_GOAL_DAYS,
  FORCE_CI_GROUP_IDS,
  MUSCLE_IDS,
  MUSCLE_MAP_VERSION,
  WEEKLY_GOAL_CHOICES,
} from './muscleIds.mm-1.js';
import { resolveSessionChips, sessionMuscleWeights } from './muscleMap.mm-1.js';

export { MUSCLE_MAP_VERSION, DEFAULT_WEEKLY_GOAL_DAYS, WEEKLY_GOAL_CHOICES };

/**
 * @param {'coperto'|'toccato'|'vuoto'|string|null|undefined} status
 * @returns {number} 0–1
 */
export function coverageStatusTo01(status) {
  if (status === 'coperto') return 1;
  if (status === 'toccato') return 0.4;
  return 0;
}

/**
 * Fold gruppi Costanza → 5 pilastri cilindro (compat telemetria / widget).
 * @param {object|null|undefined} snap
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number }}
 */
export function costanzaSnapToPillarLevels01(snap) {
  const g = snap?.groups && typeof snap.groups === 'object' ? snap.groups : {};
  const s = (id) => coverageStatusTo01(g[id]?.status);
  return {
    legs: s('gambe'),
    chest: s('petto'),
    back_shoulders: Math.max(s('schiena'), s('spalle')),
    arms: s('braccia'),
    core: s('core'),
  };
}

/**
 * @param {{ fullHistory?: object|null, asOfDate?: string|null, weeklyGoalDays?: number }} [input]
 */
export function computeCostanzaPillarLevels01(input = {}) {
  const asOfDate = String(input.asOfDate || '').slice(0, 10);
  const snap = computeCostanzaForza({
    fullHistory: input.fullHistory || {},
    asOfDate,
    weeklyGoalDays: normalizeWeeklyGoalDays(input.weeklyGoalDays),
  });
  return costanzaSnapToPillarLevels01(snap);
}

function dayRawLog(fullHistory, dateKey) {
  const node = fullHistory?.[`trackerStorico_${dateKey}`];
  if (!node || typeof node !== 'object') return [];
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === 'object' && node.dati.log != null) return node.dati.log;
  return [];
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeWeeklyGoalDays(raw) {
  const n = Number(raw);
  if (WEEKLY_GOAL_CHOICES.includes(n)) return n;
  return DEFAULT_WEEKLY_GOAL_DAYS;
}

/**
 * Lunedì della settimana di calendario (lun–dom) che contiene `iso`.
 * @param {string} iso
 * @returns {string|null}
 */
export function weekMondayOf(iso) {
  if (!isIsoDateString(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay(); // 0=dom … 6=sab
  const back = day === 0 ? 6 : day - 1;
  return addCalendarDays(iso, -back);
}

/**
 * Domenica della stessa settimana.
 * @param {string} monday
 * @returns {string|null}
 */
export function weekSundayOf(monday) {
  if (!isIsoDateString(monday)) return null;
  return addCalendarDays(monday, 6);
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
function datesInclusive(from, to) {
  if (!isIsoDateString(from) || !isIsoDateString(to) || from > to) return [];
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

/**
 * Sessioni di forza con chip/fallback, raggruppate per giorno.
 * @param {object|null|undefined} fullHistory
 * @param {string} asOfDate
 * @param {number} [lookbackDays=90]
 * @returns {Map<string, object[]>}
 */
export function strengthSessionsByDay(fullHistory, asOfDate, lookbackDays = 90) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  if (!isIsoDateString(asOfDate)) return map;
  const span = Math.max(1, Math.floor(Number(lookbackDays) || 90));
  const minDate = addCalendarDays(asOfDate, -(span - 1));
  const byId = new Map();
  let anonymous = 0;
  for (let back = 0; back < span; back += 1) {
    const dateKey = addCalendarDays(asOfDate, -back);
    if (dateKey < minDate) break;
    for (const entry of expandTrackerLogEntries(dayRawLog(fullHistory, dateKey))) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.isGhost === true) continue;
      const kind = String(entry.type || '').trim().toLowerCase();
      if (kind && kind !== 'workout') continue;
      const typed = { ...entry, type: 'workout', __dateKey: dateKey };
      if (classifyWorkoutByType(typed).kind !== 'strength') continue;
      if (resolveSessionChips(typed).length === 0) continue;
      const id = String(entry.id || entry.nodeId || '').trim();
      const key = id || `${dateKey}:anon:${anonymous}`;
      anonymous += 1;
      if (byId.has(key)) continue;
      byId.set(key, typed);
    }
  }
  for (const entry of byId.values()) {
    const day = String(entry.__dateKey || '').slice(0, 10);
    const list = map.get(day) || [];
    list.push(entry);
    map.set(day, list);
  }
  return map;
}

/**
 * @param {Map<string, object[]>} byDay
 * @returns {Set<string>}
 */
export function strengthDaySet(byDay) {
  return new Set(byDay.keys());
}

/**
 * Giorni di forza nella settimana lun–dom che contiene `asOfDate`.
 * @param {Set<string>} strengthDays
 * @param {string} asOfDate
 * @returns {{ monday: string, sunday: string, days: string[], count: number }}
 */
export function forceDaysInCalendarWeek(strengthDays, asOfDate) {
  const monday = weekMondayOf(asOfDate);
  const sunday = weekSundayOf(monday);
  const days = datesInclusive(monday, sunday).filter((d) => strengthDays.has(d) && d <= asOfDate);
  return { monday, sunday, days, count: days.length };
}

/**
 * Scia: settimane consecutive (chiuse) che hanno raggiunto l'obiettivo.
 * La settimana in corso non spezza la scia finché non è chiusa.
 * @param {Set<string>} strengthDays
 * @param {string} asOfDate
 * @param {number} weeklyGoal
 * @returns {number}
 */
export function computeWeekStreak(strengthDays, asOfDate, weeklyGoal) {
  const goal = normalizeWeeklyGoalDays(weeklyGoal);
  const thisMonday = weekMondayOf(asOfDate);
  if (!thisMonday) return 0;
  const thisSunday = weekSundayOf(thisMonday);
  const weekClosed = asOfDate >= thisSunday;

  let streak = 0;
  let monday = weekClosed ? thisMonday : addCalendarDays(thisMonday, -7);

  for (let i = 0; i < 52; i += 1) {
    const sunday = weekSundayOf(monday);
    const count = datesInclusive(monday, sunday).filter((d) => strengthDays.has(d)).length;
    if (count >= goal) {
      streak += 1;
      monday = addCalendarDays(monday, -7);
      continue;
    }
    break;
  }
  return streak;
}

/**
 * Somma pesi per muscolo in una finestra di giorni (inclusiva).
 * @param {Map<string, object[]>} byDay
 * @param {string} from
 * @param {string} to
 * @returns {Record<string, number>}
 */
export function sumMuscleWeightsInRange(byDay, from, to) {
  /** @type {Record<string, number>} */
  const sums = {};
  for (const id of MUSCLE_IDS) sums[id] = 0;
  for (const day of datesInclusive(from, to)) {
    for (const entry of byDay.get(day) || []) {
      const w = sessionMuscleWeights(entry);
      for (const [id, weight] of Object.entries(w)) {
        sums[id] = (sums[id] || 0) + weight;
      }
    }
  }
  return sums;
}

/**
 * Ultima data in cui il muscolo è stato ALLENATO (peso ≥ 1).
 * @param {Map<string, object[]>} byDay
 * @param {string} muscleId
 * @param {string} asOfDate
 * @returns {string|null}
 */
export function lastTrainedDate(byDay, muscleId, asOfDate) {
  const days = [...byDay.keys()].filter((d) => d <= asOfDate).sort().reverse();
  for (const day of days) {
    for (const entry of byDay.get(day) || []) {
      const w = sessionMuscleWeights(entry)[muscleId] || 0;
      if (w >= 1) return day;
    }
  }
  return null;
}

/**
 * @param {number} sum
 * @returns {'coperto'|'toccato'|'vuoto'}
 */
export function coverageStatusFromSum(sum) {
  const s = Number(sum) || 0;
  if (s >= 1) return 'coperto';
  if (s > 0) return 'toccato';
  return 'vuoto';
}

/**
 * Snapshot Costanza alla data.
 * @param {{
 *   fullHistory: object,
 *   asOfDate: string,
 *   weeklyGoalDays?: number,
 * }} input
 */
export function computeCostanzaForza(input) {
  const asOfDate = String(input?.asOfDate || '').slice(0, 10);
  const weeklyGoal = normalizeWeeklyGoalDays(input?.weeklyGoalDays);
  const byDay = strengthSessionsByDay(input?.fullHistory, asOfDate);
  const strengthDays = strengthDaySet(byDay);
  const week = forceDaysInCalendarWeek(strengthDays, asOfDate);
  const streak = computeWeekStreak(strengthDays, asOfDate, weeklyGoal);

  const windowFrom = addCalendarDays(asOfDate, -6);
  const sums7 = sumMuscleWeightsInRange(byDay, windowFrom, asOfDate);
  const lookback30From = addCalendarDays(asOfDate, -29);

  /** @type {Record<string, {
   *   status: 'coperto'|'toccato'|'vuoto',
   *   sum7: number,
   *   lastTrained: string|null,
   *   daysSinceTrained: number|null,
   *   neverIn30: boolean,
   * }>} */
  const muscles = {};
  for (const id of MUSCLE_IDS) {
    const sum7 = sums7[id] || 0;
    const last = lastTrainedDate(byDay, id, asOfDate);
    let daysSince = null;
    if (last) {
      const a = new Date(`${last}T12:00:00`);
      const b = new Date(`${asOfDate}T12:00:00`);
      daysSince = Math.round((b - a) / 86400000);
    }
    const trainedIn30 = last != null && last >= lookback30From;
    muscles[id] = {
      status: coverageStatusFromSum(sum7),
      sum7,
      lastTrained: last,
      daysSinceTrained: daysSince,
      neverIn30: !trainedIn30,
    };
  }

  /** @type {Record<string, { status: 'coperto'|'toccato'|'vuoto', muscleIds: string[] }>} */
  const groups = {};
  for (const g of COSTANZA_UI_GROUPS) {
    let best = 'vuoto';
    for (const mid of g.muscleIds) {
      const st = muscles[mid]?.status || 'vuoto';
      if (st === 'coperto') best = 'coperto';
      else if (st === 'toccato' && best === 'vuoto') best = 'toccato';
    }
    groups[g.id] = { status: best, muscleIds: [...g.muscleIds] };
  }

  const forceCiCovered = FORCE_CI_GROUP_IDS.filter((gid) => groups[gid]?.status === 'coperto').length;

  return {
    version: MUSCLE_MAP_VERSION,
    asOfDate,
    weeklyGoalDays: weeklyGoal,
    forceDaysThisWeek: week.count,
    forceDayDatesThisWeek: week.days,
    weekMonday: week.monday,
    weekSunday: week.sunday,
    weekStreak: streak,
    muscles,
    groups,
    forceCiCoveredCount: forceCiCovered,
    forceCiGroupTotal: FORCE_CI_GROUP_IDS.length,
    uiGroups: COSTANZA_UI_GROUPS,
  };
}
