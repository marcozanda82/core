const SLEEP_LEARNING_STORAGE_KEY = 'kentu_sleep_learning_v1';
const COMFORT_HALF_WIDTH_H = 0.5;
const LEARNING_STEP_H = 5 / 60;
const LEARNING_MIN_WEEKLY_SAMPLES = 3;

/**
 * @typedef {{ ideal: number, min: number, max: number }} SleepTargetRange
 */

/**
 * @returns {{ personalOffsetHours: number, feedbackLog: Array<object>, lastAdjustmentWeek: string | null }}
 */
function defaultLearningState() {
  return { personalOffsetHours: 0, feedbackLog: [], lastAdjustmentWeek: null };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function persistLearningState(state) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SLEEP_LEARNING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @returns {{ personalOffsetHours: number, feedbackLog: Array<object>, lastAdjustmentWeek: string | null }}
 */
export function loadSleepLearningState() {
  if (typeof localStorage === 'undefined') return defaultLearningState();
  try {
    const raw = localStorage.getItem(SLEEP_LEARNING_STORAGE_KEY);
    if (!raw) return defaultLearningState();
    const parsed = JSON.parse(raw);
    return {
      personalOffsetHours: Number(parsed?.personalOffsetHours) || 0,
      feedbackLog: Array.isArray(parsed?.feedbackLog) ? parsed.feedbackLog : [],
      lastAdjustmentWeek: parsed?.lastAdjustmentWeek ?? null,
    };
  } catch {
    return defaultLearningState();
  }
}

/**
 * @param {SleepTargetRange} range
 * @param {number} hoursSlept
 * @returns {'inside' | 'below' | 'above'}
 */
export function classifySleepVsRange(hoursSlept, range) {
  const slept = Number(hoursSlept);
  if (!Number.isFinite(slept) || slept <= 0) return 'below';
  if (slept >= range.min && slept <= range.max) return 'inside';
  return slept < range.min ? 'below' : 'above';
}

function pruneFeedbackLog(log, days = 14) {
  const cutoff = Date.now() - days * 86400000;
  return log.filter((e) => {
    const ts = Date.parse(e?.date);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

/**
 * Regola il target personale di ±5 min a settimana se il pattern soggettivo è coerente.
 *
 * @param {{ personalOffsetHours: number, feedbackLog: Array<object>, lastAdjustmentWeek: string | null }} state
 * @returns {{ personalOffsetHours: number, feedbackLog: Array<object>, lastAdjustmentWeek: string | null, adjusted: boolean }}
 */
export function runWeeklySleepLearningAdjustment(state) {
  const weekKey = getIsoWeekKey();
  if (state.lastAdjustmentWeek === weekKey) {
    return { ...state, adjusted: false };
  }

  const weekStart = Date.now() - 7 * 86400000;
  const weekEntries = state.feedbackLog.filter((e) => Date.parse(e?.date) >= weekStart);

  const restedOutsideBelow = weekEntries.filter(
    (e) => e.feltRested && e.position === 'below',
  ).length;
  const restedOutsideAbove = weekEntries.filter(
    (e) => e.feltRested && e.position === 'above',
  ).length;
  const tiredInside = weekEntries.filter(
    (e) => !e.feltRested && e.position === 'inside',
  ).length;

  let offset = state.personalOffsetHours;
  let adjusted = false;

  if (restedOutsideBelow >= LEARNING_MIN_WEEKLY_SAMPLES) {
    offset -= LEARNING_STEP_H;
    adjusted = true;
  } else if (tiredInside >= LEARNING_MIN_WEEKLY_SAMPLES) {
    offset += LEARNING_STEP_H;
    adjusted = true;
  } else if (restedOutsideAbove >= LEARNING_MIN_WEEKLY_SAMPLES) {
    offset += LEARNING_STEP_H;
    adjusted = true;
  }

  offset = Math.max(-0.5, Math.min(0.5, offset));

  const result = {
    personalOffsetHours: round2(offset),
    feedbackLog: pruneFeedbackLog(state.feedbackLog),
    lastAdjustmentWeek: adjusted ? weekKey : state.lastAdjustmentWeek,
    adjusted,
  };

  if (adjusted) {
    persistLearningState({
      personalOffsetHours: result.personalOffsetHours,
      feedbackLog: result.feedbackLog,
      lastAdjustmentWeek: result.lastAdjustmentWeek,
    });
  }

  return result;
}

/**
 * @param {{ hoursSlept: number, range: SleepTargetRange, feltRested: boolean }} payload
 * @returns {{ personalOffsetHours: number, feedbackLog: Array<object>, lastAdjustmentWeek: string | null, adjusted: boolean }}
 */
export function recordSleepRestedFeedback({ hoursSlept, range, feltRested }) {
  const state = loadSleepLearningState();
  const position = classifySleepVsRange(hoursSlept, range);
  const day = todayKey();

  const withoutToday = state.feedbackLog.filter((e) => e.day !== day);
  const entry = {
    day,
    date: new Date().toISOString(),
    hoursSlept: Number(hoursSlept) || 0,
    ideal: range.ideal,
    min: range.min,
    max: range.max,
    feltRested: Boolean(feltRested),
    position,
  };

  const next = {
    ...state,
    feedbackLog: pruneFeedbackLog([...withoutToday, entry]),
  };

  const adjusted = runWeeklySleepLearningAdjustment(next);
  persistLearningState({
    personalOffsetHours: adjusted.personalOffsetHours,
    feedbackLog: adjusted.feedbackLog,
    lastAdjustmentWeek: adjusted.lastAdjustmentWeek,
  });

  return adjusted;
}

/**
 * Target ore di sonno continuo in funzione dell'età + offset personale appreso.
 * Restituisce una zona di comfort di 1h totale (ideal ± 0.5h).
 *
 * Formula base: max(7.0, 8.5 − 0.015 × max(0, age − 18))
 *
 * @param {number | null | undefined} age
 * @param {number} [personalOffsetHours]
 * @returns {SleepTargetRange}
 */
export function calculateTargetSleepHours(age, personalOffsetHours = 0) {
  const a = Number(age);
  const safeAge = Number.isFinite(a) && a >= 0 ? a : 30;
  const adultOffset = Math.max(0, safeAge - 18);
  const base = Math.max(7.0, 8.5 - 0.015 * adultOffset);
  const offset = Number(personalOffsetHours) || 0;
  const ideal = round2(base + offset);
  return {
    ideal,
    min: round2(ideal - COMFORT_HALF_WIDTH_H),
    max: round2(ideal + COMFORT_HALF_WIDTH_H),
  };
}

/**
 * Penalità metabolica graduata: nessuna penalità severa dentro il range o entro 30 min dall'ideale.
 *
 * @param {number} hoursSlept
 * @param {SleepTargetRange | number} targetRange
 * @param {number} [recoveryScore]
 * @returns {number} moltiplicatore 1.0 – 1.3
 */
export function computeAgeAdjustedMetabolicPenalty(hoursSlept, targetRange, recoveryScore = 0) {
  const slept = Number(hoursSlept);
  const range = targetRange;

  if (!range || !Number.isFinite(range.ideal)) return 1.08;

  if (!Number.isFinite(slept) || slept <= 0) return 1.08;

  const qualityFactor = Math.max(0, (100 - (Number(recoveryScore) || 0)) / 100);
  const nearIdeal = Math.abs(slept - range.ideal) <= COMFORT_HALF_WIDTH_H;
  const inRange = slept >= range.min && slept <= range.max;

  if (inRange || nearIdeal) {
    const raw = 1 + qualityFactor * 0.04;
    return Math.round(Math.max(1, Math.min(1.08, raw)) * 1000) / 1000;
  }

  const distFromRange = slept < range.min
    ? range.min - slept
    : slept - range.max;

  const growth = Math.min(0.28, (distFromRange / 2) * 0.22);
  const raw = 1 + growth + qualityFactor * 0.06;
  return Math.round(Math.max(1, Math.min(1.3, raw)) * 1000) / 1000;
}

/**
 * @param {number} hoursSlept
 * @param {SleepTargetRange} range
 * @returns {'good' | 'warn' | 'bad'}
 */
export function sleepRangeTone(hoursSlept, range) {
  const slept = Number(hoursSlept);
  if (!Number.isFinite(slept) || slept <= 0) return 'bad';

  const position = classifySleepVsRange(slept, range);
  if (position === 'inside') return 'good';

  const edge = position === 'below' ? range.min : range.max;
  const dist = Math.abs(slept - edge);
  if (dist <= 0.25) return 'warn';
  return 'bad';
}

/**
 * @param {number} pct 0–100+
 * @returns {'good' | 'warn' | 'bad'}
 */
export function sleepProgressTone(pct) {
  if (pct >= 90) return 'good';
  if (pct >= 75) return 'warn';
  return 'bad';
}

/**
 * @param {'good' | 'warn' | 'bad'} tone
 * @returns {string}
 */
export function toneColor(tone) {
  if (tone === 'good') return '#34d399';
  if (tone === 'warn') return '#fbbf24';
  return '#f87171';
}

/**
 * @param {number} hours
 * @returns {string}
 */
export function formatSleepHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins <= 0) return `${h.toFixed(1)}h`;
  return `${whole}h ${mins}m`;
}

/**
 * @param {number} age
 * @param {SleepTargetRange} range
 * @returns {string}
 */
export function formatSleepTargetInfoNote(age, range) {
  const a = Number(age);
  const ageLabel = Number.isFinite(a) && a >= 0
    ? (Number.isInteger(a) ? String(a) : a.toFixed(1))
    : '—';
  return `Range ideale per la tua età (${ageLabel} anni): ${range.min.toFixed(1)}–${range.max.toFixed(1)}h · centro ${range.ideal.toFixed(1)}h`;
}

/**
 * Feedback morbido rispetto al range di tolleranza.
 *
 * @param {number} hoursSlept
 * @param {SleepTargetRange} range
 * @returns {string}
 */
export function describeSleepAlignment(hoursSlept, range) {
  const slept = Number(hoursSlept);
  if (!Number.isFinite(slept) || slept <= 0) {
    return 'Registra il sonno per calibrare il tuo fabbisogno';
  }

  const position = classifySleepVsRange(slept, range);

  if (position === 'inside') {
    return 'Sei all\'interno del tuo range di recupero naturale';
  }

  const edge = position === 'below' ? range.min : range.max;
  const dist = Math.abs(slept - edge);

  if (dist <= 0.25) {
    return position === 'below'
      ? 'Sei appena al di sotto del tuo margine di tolleranza'
      : 'Sei appena al di sopra del tuo margine di tolleranza';
  }

  if (dist <= 0.75) {
    return position === 'below'
      ? 'Recupero un po\' sotto il range — ascolta il corpo nelle prossime notti'
      : 'Sonno generoso oltre il range — va bene se ti senti riposato';
  }

  return position === 'below'
    ? 'Sei lontano dal range di comfort — priorità al riposo'
    : 'Molto oltre il range abituale — verifica la qualità del sonno';
}

/**
 * Posizione normalizzata 0–100 per visualizzazione a fascia.
 *
 * @param {number} hoursSlept
 * @param {SleepTargetRange} range
 * @param {number} [paddingHours=1]
 * @returns {{ markerPct: number, bandStartPct: number, bandEndPct: number, viewMin: number, viewMax: number }}
 */
export function computeSleepBandLayout(hoursSlept, range, paddingHours = 1) {
  const viewMin = Math.max(4, range.min - paddingHours);
  const viewMax = range.max + paddingHours;
  const span = viewMax - viewMin || 1;

  const toPct = (h) => Math.max(0, Math.min(100, ((h - viewMin) / span) * 100));

  return {
    markerPct: toPct(Number(hoursSlept) || range.ideal),
    bandStartPct: toPct(range.min),
    bandEndPct: toPct(range.max),
    viewMin,
    viewMax,
  };
}

/**
 * @param {number} deviation signed hours (slept - ideal)
 * @returns {string}
 */
export function formatSleepDeviation(deviation) {
  const d = Number(deviation);
  if (!Number.isFinite(d)) return '';
  if (Math.abs(d) < 0.05) return 'In linea col target';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}h rispetto al centro`;
}

/**
 * @param {string} day YYYY-MM-DD
 * @returns {boolean | null}
 */
export function getTodaySleepRestedFeedback(day = todayKey()) {
  const state = loadSleepLearningState();
  const entry = state.feedbackLog.find((e) => e.day === day);
  return entry ? Boolean(entry.feltRested) : null;
}
