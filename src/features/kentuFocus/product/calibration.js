/**
 * Taratura: finché non ci sono 14 giorni con dati (pause e buchi esclusi),
 * al massimo 28 giorni di calendario. Poi la linea di partenza è il riferimento.
 * Senza data di registrazione, la finestra parte dal primo giorno con dati.
 */

import { addCalendarDays, formatFocusHoursIt, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { expandTrackerLogEntries } from '../normalize/expandTrackerDayLog.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { equivalentAerobicMinutes } from '../../commandTerminal/context/workoutMovement.js';
import { STRENGTH_CURVE } from '../score/scoreConfig.kds-2.js';

export const CALIBRATION_DAYS = 14;
export const CALIBRATION_MAX_CALENDAR_DAYS = 28;
export const BASELINE_SPARSE_THRESHOLD = 10;
const OUTSIDE_BAND = 0.15;

function isoDate(value) {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match && isIsoDateString(match[0]) ? match[0] : null;
}

function dayEntries(fullHistory, date) {
  const node = getTrackerDayNode(fullHistory, date);
  return expandTrackerLogEntries(node?.log || node?.dati?.log || []);
}

function isPaused(date, dayStatus) {
  const row = dayStatus?.[date];
  return Boolean(row?.paused || row?.status === 'paused');
}

function dayHasData(fullHistory, date) {
  for (const entry of dayEntries(fullHistory, date)) {
    const type = String(entry?.type || '').toLowerCase();
    if (type === 'food' || type === 'recipe') return true;
    if (type === 'workout' || type === 'cardio' || type === 'activity') return true;
    if (type === 'sleep' && Number(entry.hours) > 0) return true;
  }
  return false;
}

/** Giorno utile alla taratura: ha dati e non è in pausa. */
export function countsAsCalibrationDay(fullHistory, date, dayStatus) {
  if (!date || isPaused(date, dayStatus)) return false;
  return dayHasData(fullHistory, date);
}

export function dataDates(fullHistory, dayStatus = null) {
  if (!fullHistory || typeof fullHistory !== 'object') return [];
  return Object.keys(fullHistory)
    .map((key) => {
      const match = key.match(/^trackerStorico_(\d{4}-\d{2}-\d{2})$/);
      return match ? match[1] : null;
    })
    .filter((date) => date && countsAsCalibrationDay(fullHistory, date, dayStatus))
    .sort();
}

function scanWindow({ start, today, fullHistory, dayStatus }) {
  const dates = [];
  let dataDays = 0;
  let calendarDays = 0;
  let completedOn = null;
  for (let date = start; date <= today; date = addCalendarDays(date, 1)) {
    dates.push(date);
    calendarDays += 1;
    if (countsAsCalibrationDay(fullHistory, date, dayStatus)) dataDays += 1;
    if (dataDays >= CALIBRATION_DAYS || calendarDays >= CALIBRATION_MAX_CALENDAR_DAYS) {
      completedOn = date;
      break;
    }
  }
  return { dates, dataDays, calendarDays, completedOn };
}

export function resolveCalibration({ today, registeredAt, fullHistory, dayStatus = null }) {
  const registered = isoDate(registeredAt);
  const first = dataDates(fullHistory, dayStatus)[0] || null;
  const start = registered || first;
  if (!start || !isIsoDateString(today) || start > today) {
    return {
      active: false,
      day: null,
      total: CALIBRATION_DAYS,
      start: null,
      source: null,
      baselineDue: false,
      dataDays: 0,
      calendarDays: 0,
      sparse: false,
    };
  }

  const scan = scanWindow({ start, today, fullHistory, dayStatus });
  const reachedData = scan.dataDays >= CALIBRATION_DAYS;
  const hitCalendarCap = scan.calendarDays >= CALIBRATION_MAX_CALENDAR_DAYS;

  if (!registered) {
    return {
      active: false,
      day: Math.min(scan.dataDays, CALIBRATION_DAYS) || null,
      total: CALIBRATION_DAYS,
      start: first,
      end: scan.completedOn || today,
      source: 'first-data',
      baselineDue: Boolean(first),
      dataDays: scan.dataDays,
      calendarDays: scan.calendarDays,
      sparse: scan.dataDays < BASELINE_SPARSE_THRESHOLD,
    };
  }

  const stillLearning = !reachedData && !hitCalendarCap;
  return {
    active: stillLearning,
    day: Math.min(scan.dataDays, CALIBRATION_DAYS),
    total: CALIBRATION_DAYS,
    start: registered,
    end: scan.completedOn || (stillLearning ? null : today),
    source: 'registration',
    baselineDue: !stillLearning,
    dataDays: scan.dataDays,
    calendarDays: scan.calendarDays,
    sparse: !stillLearning && scan.dataDays < BASELINE_SPARSE_THRESHOLD,
  };
}

function mealKcal(entry) {
  return Number(entry?.kcal ?? entry?.cal) || 0;
}

function lastHour(entries) {
  const hours = entries
    .map((entry) => Number(entry?.mealTime ?? entry?.time))
    .filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 24);
  return hours.length ? Math.max(...hours) : null;
}

function sleepHours(fullHistory, date) {
  try {
    const publicationDate = addCalendarDays(date, 1);
    const node = getTrackerDayNode(fullHistory, publicationDate);
    const night = normalizeSleepNight(node, { publicationDate, lastMealHour: null });
    const hours = Number(night?.sleep?.hours?.value);
    return hours > 0 ? hours : null;
  } catch {
    return null;
  }
}

function movementMinutes(fullHistory, date, checkins) {
  let diary = 0;
  for (const entry of dayEntries(fullHistory, date)) {
    const type = String(entry?.type || '').toLowerCase();
    if (type !== 'workout' && type !== 'cardio' && type !== 'activity') continue;
    diary += equivalentAerobicMinutes(entry);
  }
  if (diary > 0) return diary;
  const raw = checkins?.[date];
  const minutes = Number(raw?.minutes ?? raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function strengthCounts(fullHistory, dates) {
  const counts = { parte_alta: 0, parte_bassa: 0 };
  for (const date of dates) {
    const pack = normalizeWorkoutEvents(getTrackerDayNode(fullHistory, date));
    for (const workout of pack?.activity?.workouts || []) {
      if (workout?.activityKind?.value !== 'strength') continue;
      const recorded = Array.isArray(workout?.muscleGroups?.value) ? workout.muscleGroups.value : [];
      const upper = STRENGTH_CURVE.macros.parte_alta || [];
      const lower = STRENGTH_CURVE.macros.parte_bassa || [];
      const total = recorded.includes(STRENGTH_CURVE.totalBodyGroup);
      if (total || recorded.some((group) => upper.includes(group))) counts.parte_alta += 1;
      if (total || recorded.some((group) => lower.includes(group))) counts.parte_bassa += 1;
    }
  }
  return counts;
}

function windowDates(calibration, fullHistory, dayStatus) {
  if (!calibration?.start) return [];
  const end = calibration.end
    || addCalendarDays(calibration.start, CALIBRATION_MAX_CALENDAR_DAYS - 1);
  const dates = [];
  let dataDays = 0;
  let calendarDays = 0;
  for (let date = calibration.start; date <= end; date = addCalendarDays(date, 1)) {
    dates.push(date);
    calendarDays += 1;
    if (countsAsCalibrationDay(fullHistory, date, dayStatus)) dataDays += 1;
    if (dataDays >= CALIBRATION_DAYS || calendarDays >= CALIBRATION_MAX_CALENDAR_DAYS) break;
  }
  return dates;
}

export function buildBaseline({
  fullHistory,
  registeredAt,
  today,
  targetKcal,
  checkins,
  dayStatus = null,
}) {
  const calibration = resolveCalibration({ today, registeredAt, fullHistory, dayStatus });
  if (!calibration.baselineDue) return null;
  const dates = windowDates(calibration, fullHistory, dayStatus);
  if (dates.length === 0) return null;

  const meals = [];
  const lastMeals = [];
  const sleeps = [];
  let movement = 0;
  for (const date of dates) {
    const entries = dayEntries(fullHistory, date).filter((entry) => {
      const type = String(entry?.type || '').toLowerCase();
      return type === 'food' || type === 'recipe';
    });
    const kcal = Math.round(entries.reduce((sum, entry) => sum + mealKcal(entry), 0));
    if (kcal > 0) {
      meals.push(kcal);
      const hour = lastHour(entries);
      if (hour != null) lastMeals.push(hour);
    }
    const slept = sleepHours(fullHistory, date);
    if (slept) sleeps.push(slept);
    movement += movementMinutes(fullHistory, date, checkins);
  }

  const target = Number(targetKcal);
  const outsideDays = target > 0
    ? meals.filter((kcal) => Math.abs(kcal - target) / target > OUTSIDE_BAND).length
    : 0;
  const mean = (list) => (list.length ? list.reduce((sum, item) => sum + item, 0) / list.length : null);
  const span = Math.max(dates.length, 1);

  return {
    version: 1,
    from: dates[0],
    to: dates[dates.length - 1],
    source: calibration.source,
    meanKcal: mean(meals) == null ? null : Math.round(mean(meals)),
    outsideDays,
    daysWithMeals: meals.length,
    meanSleepHours: mean(sleeps) == null ? null : Math.round(mean(sleeps) * 10) / 10,
    weeklyMovementMinutes: Math.round((movement * 7) / span),
    strength: strengthCounts(fullHistory, dates),
    meanLastMealHour: mean(lastMeals) == null ? null : Math.round(mean(lastMeals) * 10) / 10,
    coverageDays: meals.length,
    windowDays: dates.length,
    sparse: Boolean(calibration.sparse) || meals.length < BASELINE_SPARSE_THRESHOLD,
    includesCheckins: true,
  };
}

function clock(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return null;
  const total = Math.round(value * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  if (m === 0) return `le ${h}`;
  return `le ${h}:${String(m).padStart(2, '0')}`;
}

export function baselineWords(row) {
  if (!row) return [];
  const kcal = Number(row.meanKcal);
  const outside = Number(row.outsideDays) || 0;
  const sleep = formatFocusHoursIt(row.meanSleepHours);
  const move = Math.round(Number(row.weeklyMovementMinutes) || 0);
  const upper = Number(row.strength?.parte_alta) || 0;
  const lower = Number(row.strength?.parte_bassa) || 0;
  const meal = clock(row.meanLastMealHour);
  const daysWord = outside === 1 ? 'giorno' : 'giorni';
  const upperWord = upper === 1 ? 'sessione' : 'sessioni';
  const lines = [];
  if (row.sparse) {
    lines.push('Basata su pochi giorni: si aggiornerà.');
  }
  lines.push(
    Number.isFinite(kcal) && kcal > 0
      ? `Pasti intorno a ${kcal} kcal, con ${outside} ${daysWord} fuori fascia.`
      : 'Pasti ancora poco registrati.',
    sleep ? `Sonno medio ${sleep}.` : 'Sonno ancora poco registrato.',
    `Movimento circa ${move} minuti a settimana.`,
    `Forza: parte alta ${upper} ${upperWord}, parte bassa ${lower}.`,
    meal ? `Ultimo pasto verso ${meal}.` : 'Orario dell’ultimo pasto non ancora chiaro.',
    `Pasti registrati in ${row.daysWithMeals || row.coverageDays || 0} giorni su ${row.windowDays || CALIBRATION_DAYS}.`,
    'Da qui in poi i confronti sono rispetto alla tua partenza.',
  );
  return lines;
}
