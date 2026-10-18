/**
 * Aggregatore puro finestre storiche d7 / d30 / d90 a calendario.
 * Input: day brief normalizzati (nessuna I/O).
 */

import { alignBriefsToCalendarWindow } from './calendarWindow.js';
import {
  evaluateDomainCoverage,
  FOCUS_COVERAGE_THRESHOLDS,
} from './focusCoverageConfig.js';

/**
 * @param {number[]} values
 * @returns {number|null}
 */
function averageOrNull(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/**
 * @param {object[]} windowBriefs — lunghezza = giorni di calendario
 * @param {keyof typeof FOCUS_COVERAGE_THRESHOLDS} windowKey
 * @param {{ briefsReceived?: number }} [meta]
 */
export function aggregateHistoryWindow(windowBriefs, windowKey, meta = {}) {
  const thresholds = FOCUS_COVERAGE_THRESHOLDS[windowKey];
  const windowDays = thresholds.windowDays;
  const briefs = Array.isArray(windowBriefs) ? windowBriefs : [];

  const foodDays = briefs.filter((b) => b.hasFood);
  const sleepDays = briefs.filter((b) => b.sleepAvailable && b.sleep?.hours != null);
  const workoutDays = briefs.filter((b) => b.hasWorkout);
  const weighIns = briefs.filter((b) => b.body?.weightKg != null);

  const nutritionCoverage = evaluateDomainCoverage(foodDays.length, windowDays, thresholds);
  const sleepCoverage = evaluateDomainCoverage(sleepDays.length, windowDays, thresholds);
  const activityCoverage = evaluateDomainCoverage(workoutDays.length, windowDays, thresholds);
  const bodyCoverage = evaluateDomainCoverage(weighIns.length, windowDays, thresholds);

  const cardioMinutesTotal = workoutDays.reduce((acc, b) => {
    const m = b.activity?.cardioMinutes;
    return acc + (typeof m === 'number' && Number.isFinite(m) ? m : 0);
  }, 0);

  const weights = weighIns.map((b) => b.body.weightKg);
  let weightDeltaKg = null;
  let lastWeightKg = null;
  if (weights.length >= 1) {
    lastWeightKg = weights[weights.length - 1];
    if (weights.length >= 2) {
      weightDeltaKg = Math.round((lastWeightKg - weights[0]) * 100) / 100;
    }
  }

  const nutrition = {
    avgKcal: averageOrNull(foodDays.map((b) => b.nutrition.kcal)),
    avgProteinG: averageOrNull(foodDays.map((b) => b.nutrition.proteinG)),
    avgCarbG: averageOrNull(foodDays.map((b) => b.nutrition.carbG)),
    avgFatG: averageOrNull(foodDays.map((b) => b.nutrition.fatG)),
    avgFiberG: averageOrNull(foodDays.map((b) => b.nutrition.fiberG)),
    daysWithFood: foodDays.length,
    /**
     * Giorni di calendario nella finestra senza alcuna registrazione alimentare.
     * Non implica digiuno o “non ha mangiato”.
     */
    daysWithoutFoodLog: briefs.length - foodDays.length,
    /** @deprecated alias esplicito — stesso significato di daysWithoutFoodLog */
    daysWithoutFood: briefs.length - foodDays.length,
  };

  const sleep = {
    avgHours: averageOrNull(sleepDays.map((b) => b.sleep.hours)),
    nightsLogged: sleepDays.length,
    nightsMissing: briefs.length - sleepDays.length,
  };

  const activity = {
    /**
     * Giorni con almeno un workout registrato.
     * 0 ≠ “inattività”: assenza di log non è prova di riposo o sedentarietà.
     */
    workoutDaysLogged: workoutDays.length,
    workoutDays: workoutDays.length,
    avgWorkoutKcal: averageOrNull(
      workoutDays
        .map((b) => b.activity?.workoutKcal)
        .filter((v) => v != null),
    ),
    cardioMinutesTotal: Math.round(cardioMinutesTotal * 10) / 10,
    zeroLoggedWorkoutsMeans: 'no_workout_events_found',
  };

  const body = {
    weightDeltaKg,
    lastWeightKg,
    nWeighIns: weighIns.length,
  };

  return {
    nutrition,
    sleep,
    activity,
    body,
    sampleSize: briefs.length,
    calendarDays: windowDays,
    briefsReceived: meta.briefsReceived ?? briefs.filter((b) => !b.calendarPlaceholder).length,
    coverage: {
      nutrition: nutritionCoverage,
      sleep: sleepCoverage,
      activity: activityCoverage,
      body: bodyCoverage,
    },
    coverageRatio: Math.round(
      (
        (nutritionCoverage.coverageRatio
          + sleepCoverage.coverageRatio
          + activityCoverage.coverageRatio) / 3
      ) * 1000,
    ) / 1000,
  };
}

/**
 * @param {object} currentWin
 * @param {object} prevWin
 * @param {'nutrition'|'sleep'|'activity'} domain
 * @param {string} avgKey path under domain object on window
 */
function domainDelta(currentWin, prevWin, domain, avgKey) {
  const curCov = currentWin.coverage?.[domain];
  const prevCov = prevWin.coverage?.[domain];
  if (!curCov?.trendComparable || !prevCov?.trendComparable) {
    return {
      comparable: false,
      reason: 'insufficient_coverage_on_one_or_both_sides',
      delta: null,
    };
  }
  const cur = currentWin[domain]?.[avgKey];
  const prev = prevWin[domain]?.[avgKey];
  if (cur == null || prev == null) {
    return { comparable: false, reason: 'missing_averages', delta: null };
  }
  return {
    comparable: true,
    reason: null,
    delta: Math.round((cur - prev) * 100) / 100,
    current: cur,
    previous: prev,
  };
}

/**
 * Confronti d7 vs prev7 (serve calendario 14g) e d30 vs prev30 (serve 60g).
 * @param {object[]} dayBriefs
 * @param {string} analysisDate
 */
export function buildHistoryComparisons(dayBriefs, analysisDate) {
  const aligned14 = alignBriefsToCalendarWindow(dayBriefs, analysisDate, 14);
  const prev7Briefs = aligned14.briefs.slice(0, 7);
  const cur7Briefs = aligned14.briefs.slice(7);
  const cur7 = aggregateHistoryWindow(cur7Briefs, 'd7', { briefsReceived: cur7Briefs.filter((b) => !b.calendarPlaceholder).length });
  const prev7 = aggregateHistoryWindow(prev7Briefs, 'd7', { briefsReceived: prev7Briefs.filter((b) => !b.calendarPlaceholder).length });

  const calendarSpan14Ok = aligned14.calendarDays === 14;
  const d7vsPrev7 = {
    requiredCalendarDays: 14,
    calendarSpanOk: calendarSpan14Ok,
    available: calendarSpan14Ok
      && cur7.coverage.nutrition.trendComparable
      && prev7.coverage.nutrition.trendComparable,
    nutritionKcal: domainDelta(cur7, prev7, 'nutrition', 'avgKcal'),
    nutritionProteinG: domainDelta(cur7, prev7, 'nutrition', 'avgProteinG'),
    sleepHours: domainDelta(cur7, prev7, 'sleep', 'avgHours'),
  };
  if (!d7vsPrev7.available) {
    d7vsPrev7.unavailableReason = !calendarSpan14Ok
      ? 'need_14_calendar_days'
      : 'insufficient_coverage_both_sides';
  }

  const aligned60 = alignBriefsToCalendarWindow(dayBriefs, analysisDate, 60);
  const prev30Briefs = aligned60.briefs.slice(0, 30);
  const cur30Briefs = aligned60.briefs.slice(30);
  const cur30 = aggregateHistoryWindow(cur30Briefs, 'd30', {
    briefsReceived: cur30Briefs.filter((b) => !b.calendarPlaceholder).length,
  });
  const prev30 = aggregateHistoryWindow(prev30Briefs, 'd30', {
    briefsReceived: prev30Briefs.filter((b) => !b.calendarPlaceholder).length,
  });

  const calendarSpan60Ok = aligned60.calendarDays === 60;
  const d30vsPrev30 = {
    requiredCalendarDays: 60,
    calendarSpanOk: calendarSpan60Ok,
    available: calendarSpan60Ok
      && cur30.coverage.nutrition.trendComparable
      && prev30.coverage.nutrition.trendComparable,
    nutritionKcal: domainDelta(cur30, prev30, 'nutrition', 'avgKcal'),
    nutritionProteinG: domainDelta(cur30, prev30, 'nutrition', 'avgProteinG'),
    sleepHours: domainDelta(cur30, prev30, 'sleep', 'avgHours'),
  };
  if (!d30vsPrev30.available) {
    d30vsPrev30.unavailableReason = !calendarSpan60Ok
      ? 'need_60_calendar_days'
      : 'insufficient_coverage_both_sides';
  }

  return { d7_vs_prev7: d7vsPrev7, d30_vs_prev30: d30vsPrev30 };
}

/**
 * @param {object[]} dayBriefs
 * @param {{ analysisDate: string }} opts
 */
export function buildHistoryWindows(dayBriefs, opts = {}) {
  const analysisDate = opts.analysisDate;
  if (!analysisDate) {
    throw new Error('buildHistoryWindows: analysisDate obbligatoria per allineamento calendario');
  }

  const aligned7 = alignBriefsToCalendarWindow(dayBriefs, analysisDate, FOCUS_COVERAGE_THRESHOLDS.d7.windowDays);
  const aligned30 = alignBriefsToCalendarWindow(dayBriefs, analysisDate, FOCUS_COVERAGE_THRESHOLDS.d30.windowDays);

  const d7 = aggregateHistoryWindow(aligned7.briefs, 'd7', { briefsReceived: aligned7.briefsReceived });
  const d30 = aggregateHistoryWindow(aligned30.briefs, 'd30', { briefsReceived: aligned30.briefsReceived });

  const d90Thresholds = FOCUS_COVERAGE_THRESHOLDS.d90;
  const aligned90 = alignBriefsToCalendarWindow(dayBriefs, analysisDate, d90Thresholds.windowDays);
  const inputSpanDays = aligned90.briefsReceived;
  const d90Enabled = inputSpanDays >= d90Thresholds.minInputDaysToEnable;

  let d90;
  if (d90Enabled) {
    d90 = {
      ...aggregateHistoryWindow(aligned90.briefs, 'd90', { briefsReceived: aligned90.briefsReceived }),
      available: true,
    };
  } else {
    d90 = {
      nutrition: {},
      sleep: {},
      activity: {},
      body: {},
      sampleSize: d90Thresholds.windowDays,
      calendarDays: d90Thresholds.windowDays,
      briefsReceived: aligned90.briefsReceived,
      coverageRatio: 0,
      coverage: {
        nutrition: evaluateDomainCoverage(0, d90Thresholds.windowDays, d90Thresholds),
        sleep: evaluateDomainCoverage(0, d90Thresholds.windowDays, d90Thresholds),
        activity: evaluateDomainCoverage(0, d90Thresholds.windowDays, d90Thresholds),
        body: evaluateDomainCoverage(0, d90Thresholds.windowDays, d90Thresholds),
      },
      available: false,
    };
  }

  const comparisons = buildHistoryComparisons(dayBriefs, analysisDate);

  return { d7, d30, d90, comparisons };
}

/**
 * @param {{ d7: object, d30: object, d90: object }} history
 */
export function deriveHistoryThinFlags(history) {
  const d30Nut = history?.d30?.coverage?.nutrition;
  const d90 = history?.d90;
  return {
    historyThin30: !d30Nut || d30Nut.sufficiency !== 'ok',
    historyThin90: !d90?.available || d90?.coverage?.nutrition?.sufficiency !== 'ok',
  };
}
