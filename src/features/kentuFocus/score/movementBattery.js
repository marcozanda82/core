/**
 * Batteria del movimento — SSOT kds-5.
 *
 * B_t = d · B_{t-1} + charge_t
 * d = 2^(-1/3)  (dimezzamento ≈ 3 giorni → ≈ −20,6%/giorno senza cardio)
 * C = (150/7) / (1−d)
 * L = min(1, B / (0,8 · C))  → «piena» all'80% del regime continuo
 *
 * charge = minuti equivalenti (camminata ×1, vigoroso ×2, pesi 0)
 *         + check-in solo se il giorno non ha già cardio in diario (tetto 30 min).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { collectRecentWorkoutLogs } from '../../commandTerminal/context/recentWorkoutLogs.js';
import {
  classifyWorkoutByType,
  equivalentAerobicMinutes,
} from '../../commandTerminal/context/workoutMovement.js';
import { pillarStatusFromValue } from './scoreConfig.kds-3.js';

export const BATTERY_HALF_LIFE_DAYS = 3;
export const BATTERY_DECAY = 2 ** (-1 / BATTERY_HALF_LIFE_DAYS);
export const BATTERY_WEEKLY_TARGET_EQ_MIN = 150;
export const BATTERY_DAILY_TARGET_EQ_MIN = BATTERY_WEEKLY_TARGET_EQ_MIN / 7;
export const BATTERY_CAPACITY = BATTERY_DAILY_TARGET_EQ_MIN / (1 - BATTERY_DECAY);
/** Soglia «piena»: 80% del regime continuo. */
export const BATTERY_FULL_FRACTION = 0.8;
export const BATTERY_FULL_LEVEL = BATTERY_CAPACITY * BATTERY_FULL_FRACTION;
export const BATTERY_LOOKBACK_DAYS = 14;
/** Giorni minimi di storico prima che il movimento entri nel punteggio (calibrazione). */
export const BATTERY_READY_MIN_SPAN_DAYS = 7;
export const BATTERY_CHECKIN_CAP_MIN = 30;
export const BATTERY_ON_TRACK_MIN = 0.75;
export const BATTERY_ACTION_TARGET = 0.85;

export const BATTERY_DECAY_COPY = 'senza cardio si scarica di circa il 20% al giorno';

/**
 * @param {number} battery
 * @param {number} charge
 * @returns {number}
 */
export function stepBattery(battery, charge) {
  const b = Number.isFinite(battery) && battery > 0 ? battery : 0;
  const c = Number.isFinite(charge) && charge > 0 ? charge : 0;
  return b * BATTERY_DECAY + c;
}

/**
 * @param {number} battery
 * @returns {number} 0..1
 */
export function batteryLevel(battery) {
  const b = Number.isFinite(battery) && battery > 0 ? battery : 0;
  return Math.min(1, b / BATTERY_FULL_LEVEL);
}

/**
 * @param {number} level
 * @returns {'on_track'|'halfway'|'off_track'|'no_data'}
 */
export function batteryStatusFromLevel(level) {
  return pillarStatusFromValue(level);
}

/**
 * Minuti di charge da aggiungere domani per raggiungere un livello target.
 * @param {number} levelNow 0..1
 * @param {number} [targetLevel]
 * @returns {number}
 */
export function chargeMinutesToReach(levelNow, targetLevel = BATTERY_ACTION_TARGET) {
  const L = Number.isFinite(levelNow) ? Math.max(0, Math.min(1, levelNow)) : 0;
  const T = Number.isFinite(targetLevel) ? Math.max(0, Math.min(1, targetLevel)) : BATTERY_ACTION_TARGET;
  const needed = BATTERY_FULL_LEVEL * (T - L * BATTERY_DECAY);
  return Math.max(0, Math.round(needed));
}

/**
 * Livello domani se charge = 0.
 * @param {number} levelNow
 */
export function levelTomorrowIfIdle(levelNow) {
  const L = Number.isFinite(levelNow) ? Math.max(0, Math.min(1, levelNow)) : 0;
  return batteryLevel(L * BATTERY_FULL_LEVEL * BATTERY_DECAY);
}

/**
 * @param {object|null|undefined} entry
 * @returns {boolean}
 */
export function entryIsDiaryCardio(entry) {
  const kind = classifyWorkoutByType(entry).kind;
  return kind === 'walk' || kind === 'vigorous';
}

/**
 * Charge di un giorno: eq diary + check-in (cap 30) solo se niente cardio diary.
 * @param {string} date
 * @param {object|null|undefined} fullHistory
 * @param {object|null|undefined} movementCheckins
 * @returns {{ charge: number, diaryEq: number, checkInMin: number, usedCheckIn: boolean, hasDiaryCardio: boolean }}
 */
export function dayMovementCharge(date, fullHistory, movementCheckins = null) {
  if (!isIsoDateString(date)) {
    return { charge: 0, diaryEq: 0, checkInMin: 0, usedCheckIn: false, hasDiaryCardio: false };
  }
  const { all } = collectRecentWorkoutLogs(fullHistory || {}, [], date);
  let diaryEq = 0;
  let hasDiaryCardio = false;
  for (const entry of all) {
    if (String(entry?.__dateKey || '').slice(0, 10) !== date) continue;
    const eq = equivalentAerobicMinutes(entry);
    if (eq > 0) {
      diaryEq += eq;
      hasDiaryCardio = true;
    } else if (entryIsDiaryCardio(entry)) {
      hasDiaryCardio = true;
    }
  }

  let checkInMin = 0;
  let usedCheckIn = false;
  if (!hasDiaryCardio) {
    const raw = movementCheckins?.[date] ?? null;
    const minutes = typeof raw === 'number' ? raw : Number(raw?.minutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      checkInMin = Math.min(BATTERY_CHECKIN_CAP_MIN, minutes);
      usedCheckIn = checkInMin > 0;
    }
  }

  return {
    charge: diaryEq + (usedCheckIn ? checkInMin : 0),
    diaryEq: Math.round(diaryEq * 10) / 10,
    checkInMin,
    usedCheckIn,
    hasDiaryCardio,
  };
}

/**
 * Serie di charge su lookback che termina su `date` (incluso).
 * @returns {Array<{ date: string, charge: number, diaryEq: number, usedCheckIn: boolean }>}
 */
export function chargeSeriesEnding(date, fullHistory, movementCheckins = null, lookback = BATTERY_LOOKBACK_DAYS) {
  if (!isIsoDateString(date)) return [];
  const n = Math.max(1, Math.round(Number(lookback) || BATTERY_LOOKBACK_DAYS));
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = addCalendarDays(date, -i);
    const row = dayMovementCharge(day, fullHistory, movementCheckins);
    out.push({
      date: day,
      charge: row.charge,
      diaryEq: row.diaryEq,
      usedCheckIn: row.usedCheckIn,
    });
  }
  return out;
}

/**
 * Simula la batteria da una lista di charge (ordine cronologico).
 * @param {number[]} charges
 * @param {number} [startBattery]
 */
export function simulateBattery(charges, startBattery = 0) {
  let B = Number.isFinite(startBattery) && startBattery > 0 ? startBattery : 0;
  const levels = [];
  const batteries = [];
  for (const c of charges) {
    B = stepBattery(B, c);
    batteries.push(B);
    levels.push(batteryLevel(B));
  }
  return { battery: B, level: batteryLevel(B), levels, batteries };
}

/**
 * Primo giorno con nodo trackerStorico_*.
 * @param {object|null|undefined} fullHistory
 */
export function firstTrackerDate(fullHistory) {
  if (!fullHistory || typeof fullHistory !== 'object') return null;
  let first = null;
  for (const key of Object.keys(fullHistory)) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (!isIsoDateString(date)) continue;
    if (!first || date < first) first = date;
  }
  return first;
}

/**
 * Calibrazione semplice: il movimento non entra finché non ci sono
 * almeno 7 giorni di calendario dal primo giorno di diario alla data del punteggio.
 * (alternativa warm-start scartata: più fragile e inventa carica.)
 *
 * @param {object|null|undefined} fullHistory
 * @param {string} date
 * @param {object} [context]
 */
export function isMovementBatteryReady(fullHistory, date, context = {}) {
  if (context.calibration?.active === true || context.calibrating === true) return false;
  if (context.movementBatteryReady === false) return false;
  if (context.movementBatteryReady === true) return true;
  if (!isIsoDateString(date)) return false;
  const first = firstTrackerDate(fullHistory);
  if (!first || first > date) return false;
  let span = 0;
  for (let d = first; d <= date; d = addCalendarDays(d, 1)) {
    span += 1;
    if (span >= BATTERY_READY_MIN_SPAN_DAYS) return true;
  }
  return span >= BATTERY_READY_MIN_SPAN_DAYS;
}

/**
 * Stato batteria al termine di `date`.
 * @returns {{
 *   ready: boolean,
 *   level: number|null,
 *   battery: number,
 *   status: string,
 *   charge: number,
 *   diaryEq: number,
 *   usedCheckIn: boolean,
 *   decay: number,
 *   fullLevel: number,
 *   capacity: number,
 *   lookbackDays: number,
 *   series: Array<object>,
 *   fillPercent: number|null,
 *   copy: string,
 * }}
 */
export function computeMovementBattery(date, fullHistory, context = {}) {
  const checkins = context.movementCheckins || context.walkEstimates || null;
  const ready = isMovementBatteryReady(fullHistory, date, context);
  const series = chargeSeriesEnding(date, fullHistory, checkins, BATTERY_LOOKBACK_DAYS);
  const sim = simulateBattery(series.map((row) => row.charge), 0);
  const today = series[series.length - 1] || { charge: 0, diaryEq: 0, usedCheckIn: false };
  const level = ready ? round3(sim.level) : null;
  const status = level == null ? 'no_data' : batteryStatusFromLevel(level);

  return {
    ready,
    level,
    battery: round3(sim.battery),
    status,
    charge: round3(today.charge),
    diaryEq: today.diaryEq,
    usedCheckIn: Boolean(today.usedCheckIn),
    decay: BATTERY_DECAY,
    fullLevel: round3(BATTERY_FULL_LEVEL),
    capacity: round3(BATTERY_CAPACITY),
    lookbackDays: BATTERY_LOOKBACK_DAYS,
    series,
    fillPercent: level == null ? null : Math.round(level * 100),
    copy: BATTERY_DECAY_COPY,
  };
}

/**
 * Cilindro movimento kds-5.
 */
export function scoreMovimentoBattery(date, fullHistory, context = {}) {
  const bat = computeMovementBattery(date, fullHistory, context);
  if (!bat.ready || bat.level == null) {
    return {
      status: 'no_data',
      keyFact: 'in calibrazione',
      signals: ['battery_calibrating'],
      value: null,
      battery: bat,
    };
  }
  const pct = Math.round(bat.level * 100);
  const signals = [];
  if (bat.usedCheckIn) signals.push('walk_estimated');
  if (bat.diaryEq > 0) signals.push('diary_movement');
  signals.push('movement_battery');
  return {
    status: bat.status,
    keyFact: `batteria ${pct}% · ${BATTERY_DECAY_COPY}`,
    signals,
    value: bat.level,
    acuteValue: null,
    weeklyEquivalentMinutes: Math.round(
      bat.series.reduce((sum, row) => sum + row.diaryEq, 0),
    ),
    battery: bat,
  };
}

/**
 * Frase d'azione: ricarica solo se L < 0,75 o scende sotto 0,75 domani senza cardio.
 * @returns {{ phrase: string, minutes: number, targetLevel: number }|null}
 */
export function movementBatteryAction(levelNow, options = {}) {
  const L = Number(levelNow);
  if (!Number.isFinite(L)) return null;
  const tomorrowIdle = levelTomorrowIfIdle(L);
  const needsCharge = L < BATTERY_ON_TRACK_MIN || tomorrowIdle < BATTERY_ON_TRACK_MIN;
  if (!needsCharge) return null;
  if (options.strengthDay === true && L >= BATTERY_ON_TRACK_MIN) return null;

  const target = options.targetLevel ?? BATTERY_ACTION_TARGET;
  const minutes = chargeMinutesToReach(L, target);
  if (!(minutes > 0)) return null;
  const runMin = Math.max(1, Math.round(minutes / 2));
  const pct = Math.round(target * 100);
  return {
    minutes,
    targetLevel: target,
    unit: 'min',
    minimum: minutes,
    phrase: `${minutes} minuti di camminata domani riportano la batteria al ${pct}% (oppure circa ${runMin} min di corsa)`,
  };
}

/**
 * Aggregati periodo: media, minimo, eq totali.
 * @param {string} from
 * @param {string} to
 * @param {object} fullHistory
 * @param {object} [context]
 */
export function movementBatteryPeriodStats(from, to, fullHistory, context = {}) {
  if (!isIsoDateString(from) || !isIsoDateString(to) || from > to) {
    return { mean: null, min: null, totalEq: 0, days: 0, levels: [] };
  }
  const levels = [];
  let totalEq = 0;
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const bat = computeMovementBattery(date, fullHistory, context);
    const dayCharge = dayMovementCharge(date, fullHistory, context.movementCheckins);
    totalEq += dayCharge.diaryEq + (dayCharge.usedCheckIn ? dayCharge.checkInMin : 0);
    if (bat.ready && bat.level != null) levels.push(bat.level);
  }
  if (levels.length === 0) {
    return { mean: null, min: null, totalEq: Math.round(totalEq), days: 0, levels };
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const min = Math.min(...levels);
  return {
    mean: round3(mean),
    min: round3(min),
    totalEq: Math.round(totalEq),
    days: levels.length,
    levels,
  };
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
