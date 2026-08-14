import { addDays } from '../../calendarDateUtils.js';
import { getLogFromStoricoTree, getTodayString, TRACKER_STORICO_KEY } from '../../coreEngine.jsx';

/** Stati predittivi proattivi (saluto guidato). */
export const PREDICTIVE_STATE = Object.freeze({
  IDLE: 'IDLE',
  MORNING_ROUTINE: 'MORNING_ROUTINE',
  LUNCH_APPROACHING: 'LUNCH_APPROACHING',
  WORKOUT_WINDOW: 'WORKOUT_WINDOW',
  EVENING_REVIEW: 'EVENING_REVIEW',
});

const DEFAULT_LOOKBACK_DAYS = 14;

/** Finestre orologio (ore decimali) — fallback se lo storico è scarso. */
export const CLOCK_WINDOWS = Object.freeze({
  MORNING: Object.freeze({ start: 5, end: 11.5, defaultHour: 7.5 }),
  LUNCH: Object.freeze({ start: 11.5, end: 15.5, defaultHour: 13 }),
  EVENING: Object.freeze({ start: 17, end: 24, defaultHour: 20 }),
});

/** Finestre di prossimità alle medie abitudinarie (ore decimali). */
const PROXIMITY = Object.freeze({
  LUNCH: 1.25,
  WORKOUT: 1.0,
  EVENING: 1.5,
});

/**
 * @param {number} decimalHour
 * @returns {boolean}
 */
export function isMorningClockWindow(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return false;
  return h >= CLOCK_WINDOWS.MORNING.start && h < CLOCK_WINDOWS.MORNING.end;
}

/**
 * @param {number} decimalHour
 * @returns {boolean}
 */
export function isLunchClockWindow(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return false;
  return h >= CLOCK_WINDOWS.LUNCH.start && h < CLOCK_WINDOWS.LUNCH.end;
}

/**
 * @param {number} decimalHour
 * @returns {boolean}
 */
export function isEveningClockWindow(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return false;
  return h >= CLOCK_WINDOWS.EVENING.start && h < CLOCK_WINDOWS.EVENING.end;
}

const MEAL_TYPE_RE = {
  colazione: /\bcolaz/i,
  pranzo: /\bpranzo\b/i,
  cena: /\bcena\b/i,
  snack: /\b(?:snack|spuntino|merenda)\b/i,
};

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function extractDecimalHour(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n < 24) return n;
  return null;
}

/**
 * @param {object | null | undefined} entry
 * @returns {number | null}
 */
export function entryDecimalHour(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const direct = extractDecimalHour(entry.time ?? entry.mealTime);
  if (direct != null) return direct;

  const iso = entry.completedAt || entry.loggedAt || entry.timestamp;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    }
  }
  return null;
}

/**
 * @param {object} entry
 * @returns {string | null}
 */
function entryMealType(entry) {
  const raw = String(entry?.mealType || '').trim().toLowerCase();
  if (raw) return raw;
  const desc = String(entry?.desc || entry?.name || '').toLowerCase();
  for (const [type, re] of Object.entries(MEAL_TYPE_RE)) {
    if (re.test(desc)) return type;
  }
  return null;
}

function isFoodLike(entry) {
  const type = String(entry?.type || '').toLowerCase();
  return type === 'food' || type === 'recipe' || type === 'meal' || type === 'single';
}

function isStimulant(entry) {
  return String(entry?.type || '').toLowerCase() === 'stimulant';
}

function isWorkout(entry) {
  return String(entry?.type || '').toLowerCase() === 'workout';
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
function meanDecimalHour(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Distanza circolare tra due ore decimali (0–24).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function circularHourDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 24 - diff);
}

/**
 * @param {object} fullHistory
 * @param {string} dateStr
 * @returns {{ log: object[], manual: object[], combined: object[] }}
 */
export function collectDayEntries(fullHistory, dateStr) {
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const log = getLogFromStoricoTree(tree, dateStr) || [];
  const node = tree[TRACKER_STORICO_KEY(dateStr)];
  const manual = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
  return { log, manual, combined: [...log, ...manual] };
}

/**
 * Analizza lo storico e calcola medie mobili delle finestre abitudinarie.
 *
 * @param {object} [fullHistory]
 * @param {{ lookbackDays?: number, anchorDate?: string }} [opts]
 * @returns {{
 *   sampleDays: number,
 *   fastBreakHour: number | null,
 *   lunchHour: number | null,
 *   workoutHour: number | null,
 *   dinnerHour: number | null,
 *   preferredWorkoutWeekdays: number[],
 *   workoutDayFrequency: Record<number, number>,
 * }}
 */
export function analyzeHabitWindows(fullHistory = {}, opts = {}) {
  const lookbackDays = Math.max(7, Math.min(14, Number(opts.lookbackDays) || DEFAULT_LOOKBACK_DAYS));
  const anchorDate = String(opts.anchorDate || getTodayString()).trim() || getTodayString();

  const fastBreakSamples = [];
  const lunchSamples = [];
  const workoutSamples = [];
  const dinnerSamples = [];
  const workoutWeekdayCounts = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, 0]));

  let sampleDays = 0;

  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const dateStr = addDays(anchorDate, -offset);
    const { combined } = collectDayEntries(fullHistory, dateStr);
    if (!combined.length) continue;

    sampleDays += 1;
    const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();

    const foodHours = combined.filter(isFoodLike).map(entryDecimalHour).filter((h) => h != null);
    const stimulantHours = combined.filter(isStimulant).map(entryDecimalHour).filter((h) => h != null);
    const fastBreakCandidates = [...foodHours, ...stimulantHours];
    if (fastBreakCandidates.length > 0) {
      fastBreakSamples.push(Math.min(...fastBreakCandidates));
    }

    const lunchHours = combined
      .filter(isFoodLike)
      .filter((e) => entryMealType(e) === 'pranzo')
      .map(entryDecimalHour)
      .filter((h) => h != null);
    if (lunchHours.length > 0) {
      lunchSamples.push(meanDecimalHour(lunchHours));
    }

    const dinnerHours = combined
      .filter(isFoodLike)
      .filter((e) => entryMealType(e) === 'cena')
      .map(entryDecimalHour)
      .filter((h) => h != null);
    if (dinnerHours.length > 0) {
      dinnerSamples.push(meanDecimalHour(dinnerHours));
    } else if (foodHours.length > 0) {
      const eveningFood = foodHours.filter((h) => h >= 18.5);
      if (eveningFood.length > 0) dinnerSamples.push(Math.max(...eveningFood));
    }

    const workoutHours = combined.filter(isWorkout).map(entryDecimalHour).filter((h) => h != null);
    if (workoutHours.length > 0) {
      workoutSamples.push(meanDecimalHour(workoutHours));
      workoutWeekdayCounts[dayOfWeek] = (workoutWeekdayCounts[dayOfWeek] || 0) + 1;
    }
  }

  const totalWorkoutDays = Object.values(workoutWeekdayCounts).reduce((a, b) => a + b, 0);
  const preferredWorkoutWeekdays = Object.entries(workoutWeekdayCounts)
    .filter(([, count]) => {
      if (totalWorkoutDays < 2) return count >= 1;
      return count >= 2 || count / totalWorkoutDays >= 0.25;
    })
    .sort((a, b) => b[1] - a[1])
    .map(([day]) => Number(day));

  return {
    sampleDays,
    fastBreakHour: meanDecimalHour(fastBreakSamples),
    lunchHour: meanDecimalHour(lunchSamples),
    workoutHour: meanDecimalHour(workoutSamples),
    dinnerHour: meanDecimalHour(dinnerSamples),
    preferredWorkoutWeekdays,
    workoutDayFrequency: workoutWeekdayCounts,
  };
}

/**
 * @param {object[]} combined
 * @param {string} mealType
 * @returns {boolean}
 */
function hasMealTypeToday(combined, mealType) {
  return combined.some((e) => isFoodLike(e) && entryMealType(e) === mealType);
}

function hasWorkoutToday(combined) {
  return combined.some(isWorkout);
}

function hasFastBreakToday(combined) {
  return combined.some((e) => isFoodLike(e) || isStimulant(e));
}

/**
 * Incrocia orario attuale + abitudini + log di oggi → stato predittivo.
 *
 * @param {{
 *   fullHistory?: object,
 *   dailyLog?: object[],
 *   manualNodes?: object[],
 *   anchorDate?: string,
 *   now?: Date,
 *   lookbackDays?: number,
 * }} [opts]
 * @returns {{
 *   state: string,
 *   habits: ReturnType<typeof analyzeHabitWindows>,
 *   decimalHour: number,
 *   weekday: number,
 *   confidence: number,
 *   matchedWindow: string | null,
 *   distanceHours: number | null,
 *   hasLunchToday: boolean,
 *   hasWorkoutToday: boolean,
 *   hasFastBreakToday: boolean,
 *   hasDinnerToday: boolean,
 * }}
 */
export function getCurrentPredictiveContext(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const anchorDate = String(opts.anchorDate || getTodayString()).trim() || getTodayString();
  const decimalHour = now.getHours() + now.getMinutes() / 60;
  const weekday = now.getDay();

  const habits = analyzeHabitWindows(opts.fullHistory || {}, {
    lookbackDays: opts.lookbackDays,
    anchorDate,
  });

  const todayCombined = [
    ...(Array.isArray(opts.dailyLog) ? opts.dailyLog : []),
    ...(Array.isArray(opts.manualNodes) ? opts.manualNodes : []),
  ];

  const base = {
    state: PREDICTIVE_STATE.IDLE,
    habits,
    decimalHour,
    weekday,
    confidence: 0,
    matchedWindow: null,
    distanceHours: null,
    hasLunchToday: hasMealTypeToday(todayCombined, 'pranzo'),
    hasWorkoutToday: hasWorkoutToday(todayCombined),
    hasFastBreakToday: hasFastBreakToday(todayCombined),
    hasDinnerToday: hasMealTypeToday(todayCombined, 'cena'),
  };

  // Morning Routine: priorità assoluta nella prima finestra utile del giorno.
  if (isMorningClockWindow(decimalHour) && !base.hasFastBreakToday) {
    const habitHour = habits.fastBreakHour;
    const distance = habitHour != null
      ? circularHourDistance(decimalHour, habitHour)
      : Math.abs(decimalHour - CLOCK_WINDOWS.MORNING.defaultHour);
    return {
      ...base,
      state: PREDICTIVE_STATE.MORNING_ROUTINE,
      confidence: habitHour != null ? Math.max(0.55, 1 - distance / 4) : 0.7,
      matchedWindow: 'morning',
      distanceHours: distance,
    };
  }

  /** @type {Array<{ state: string, hour: number | null, proximity: number, window: string }>} */
  const candidates = [];

  if (!base.hasLunchToday && (habits.lunchHour != null || isLunchClockWindow(decimalHour))) {
    candidates.push({
      state: PREDICTIVE_STATE.LUNCH_APPROACHING,
      hour: habits.lunchHour ?? CLOCK_WINDOWS.LUNCH.defaultHour,
      proximity: habits.lunchHour != null ? PROXIMITY.LUNCH : 2.0,
      window: 'lunch',
    });
  }

  const isPreferredWorkoutDay = habits.preferredWorkoutWeekdays.length === 0
    || habits.preferredWorkoutWeekdays.includes(weekday);

  if (habits.workoutHour != null && !base.hasWorkoutToday && isPreferredWorkoutDay) {
    candidates.push({
      state: PREDICTIVE_STATE.WORKOUT_WINDOW,
      hour: habits.workoutHour,
      proximity: PROXIMITY.WORKOUT,
      window: 'workout',
    });
  }

  if (!base.hasDinnerToday && (habits.dinnerHour != null || isEveningClockWindow(decimalHour))) {
    candidates.push({
      state: PREDICTIVE_STATE.EVENING_REVIEW,
      hour: habits.dinnerHour ?? CLOCK_WINDOWS.EVENING.defaultHour,
      proximity: habits.dinnerHour != null ? PROXIMITY.EVENING : 3.5,
      window: 'dinner',
    });
  }

  let best = null;
  for (const candidate of candidates) {
    if (candidate.hour == null) continue;
    const distance = circularHourDistance(decimalHour, candidate.hour);
    if (distance > candidate.proximity) continue;
    if (!best || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }

  if (!best) return base;

  const confidence = Math.max(0.35, 1 - best.distance / best.proximity);

  return {
    ...base,
    state: best.state,
    confidence,
    matchedWindow: best.window,
    distanceHours: best.distance,
  };
}
