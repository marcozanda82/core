/**
 * Media, copertura e scie di un periodo. Puro.
 * La copertura è i giorni con dati sui giorni passati.
 * Un giorno non confermato entra con peso 0,8.
 * La scia cammina su tutti i giorni passati, così un buco può interromperla.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { computeDayScore } from './computeDayScore.js';
import {
  PERIOD_RULES,
  SCORE_VERSION,
  isPeriodDataStatus,
  periodDayWeight,
} from './scoreConfig.kds-3.js';

const ON_TRACK_DAY_SCORE = PERIOD_RULES.onTrackMinScore;
const PERIOD_COVERAGE_MIN = PERIOD_RULES.minCoverage;
const STREAK_MAX_PAUSE_DAYS = 1;
const STREAK_MIN_DAYS = PERIOD_RULES.minPublishedStreak;
const STREAK_PAUSE_SCORE_MIN = PERIOD_RULES.breakBelowScore;

/**
 * @param {string} from
 * @param {string} to
 * @param {object} context come computeDayScore, con today
 */
export function computePeriodScore(from, to, context = {}) {
  const days = [];
  const precomputed = context.precomputedDays && typeof context.precomputedDays === 'object'
    ? context.precomputedDays
    : null;
  const allowFallback = context.allowComputeFallback !== false;
  if (isIsoDateString(from) && isIsoDateString(to) && from <= to) {
    let cursor = from;
    while (cursor <= to && days.length < 400) {
      let scored = precomputed?.[cursor] || null;
      if (!scored && allowFallback) scored = computeDayScore(cursor, context);
      if (!scored) {
        scored = { score: null, dayStatus: cursor >= context.today ? 'future' : 'hole' };
      }
      const past = isPastDay(cursor, context.today, scored.dayStatus);
      days.push({
        date: cursor,
        score: scored.score,
        dayStatus: scored.dayStatus,
        past,
      });
      cursor = addCalendarDays(cursor, 1);
    }
  }

  const pastDays = days.filter((day) => day.past);
  const eligible = pastDays.filter(
    (day) => day.score != null && isPeriodDataStatus(day.dayStatus),
  );
  const coverage = pastDays.length === 0
    ? 0
    : round3(eligible.length / pastDays.length);
  const weight = eligible.reduce((sum, day) => sum + periodDayWeight(day.dayStatus), 0);
  const score = coverage < PERIOD_COVERAGE_MIN || eligible.length === 0 || weight === 0
    ? null
    : round3(eligible.reduce((sum, day) => sum + day.score * periodDayWeight(day.dayStatus), 0) / weight);

  const onTrackDays = pastDays.filter(
    (day) => day.score != null && day.score >= ON_TRACK_DAY_SCORE,
  ).length;
  const streaks = collectStreaks(pastDays);

  return {
    version: SCORE_VERSION,
    from,
    to,
    score,
    coverage,
    pastDays: pastDays.length,
    eligibleDays: eligible.length,
    onTrackDays,
    longestStreak: streaks.reduce((max, streak) => Math.max(max, streak.length), 0),
    streaks,
  };
}

function collectStreaks(pastDays) {
  /** @type {{ from: string, to: string, length: number }[]} */
  const streaks = [];
  /** @type {{ date: string, kind: 'on'|'pause' }[]} */
  let run = [];
  let pauses = 0;

  const close = () => {
    const onDays = run.filter((item) => item.kind === 'on');
    if (onDays.length >= STREAK_MIN_DAYS) {
      streaks.push({
        from: onDays[0].date,
        to: onDays[onDays.length - 1].date,
        length: onDays.length,
      });
    }
    run = [];
    pauses = 0;
  };

  for (const day of pastDays) {
    if (day.score != null && day.score >= ON_TRACK_DAY_SCORE) {
      run.push({ date: day.date, kind: 'on' });
      continue;
    }
    const pausesStreak = day.score != null
      && day.score >= STREAK_PAUSE_SCORE_MIN
      && day.score < ON_TRACK_DAY_SCORE;
    if (pausesStreak && run.some((item) => item.kind === 'on') && pauses < STREAK_MAX_PAUSE_DAYS) {
      pauses += 1;
      run.push({ date: day.date, kind: 'pause' });
      continue;
    }
    close();
  }
  close();
  return streaks;
}

function isPastDay(date, today, dayStatus) {
  if (isIsoDateString(today)) return date < today;
  return dayStatus !== 'future' && dayStatus !== 'in_progress';
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
