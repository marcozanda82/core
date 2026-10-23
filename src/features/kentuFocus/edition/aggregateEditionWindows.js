/**
 * Aggregati prospettici settimana / mese (P6.5 + P6.5.1).
 * Nessuna I/O; asOfDate iniettato; niente copertura fittizia su date future.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { countInclusiveCalendarDays } from './editionCalendar.js';
import {
  FOCUS_VERIFICATION_STATUS,
  resolveVerificationStatus,
} from './editionVerification.js';

/**
 * @param {number[]} values
 */
function averageOrNull(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/**
 * @param {object[]} briefs
 * @param {string} fromDate
 * @param {string} toDate
 */
export function filterBriefsByCalendarDate(briefs, fromDate, toDate) {
  return (Array.isArray(briefs) ? briefs : []).filter(
    (b) => b?.date && b.date >= fromDate && b.date <= toDate,
  );
}

/**
 * @param {object[]} briefs
 * @param {string} fromDate
 * @param {string} toDate
 */
export function filterBriefsBySleepWake(briefs, fromDate, toDate) {
  return (Array.isArray(briefs) ? briefs : []).filter((b) => {
    const wake = b?.sleep?.nightEndedOn;
    return wake && wake >= fromDate && wake <= toDate;
  });
}

/** @param {object} brief */
export function briefHasObservation(brief) {
  if (!brief) return false;
  return Boolean(
    brief.hasFood
    || brief.hasWorkout
    || (brief.sleepAvailable && brief.sleep?.hours != null)
    || (brief.body?.weightKg != null),
  );
}

/**
 * Copertura temporale rigorosa.
 *
 * - daysElapsed: giorni calendario ≤ asOfDate nella finestra
 * - daysWithNode: brief in serie su giorni elapsed (anche vuoti)
 * - daysObserved: giorni con almeno una registrazione
 * - daysFuture: giorni > asOfDate (mai “osservati” / mai “completi”)
 *
 * @param {object[]} briefs
 * @param {string} fromDate
 * @param {string} toDate
 * @param {{
 *   seriesFrom?: string|null,
 *   seriesTo?: string|null,
 *   asOfDate?: string|null,
 *   publicationDate?: string|null,
 *   presetHint?: string|null,
 *   forceSimulation?: boolean,
 * }} [ctx]
 */
export function assessWindowCoverage(briefs, fromDate, toDate, ctx = {}) {
  const calendarDays = countInclusiveCalendarDays(fromDate, toDate);
  const asOfDate = isIsoDateString(ctx.asOfDate) ? ctx.asOfDate : null;
  const seriesFrom = ctx.seriesFrom || null;
  const seriesTo = ctx.seriesTo || null;

  const byDate = new Map();
  for (const b of Array.isArray(briefs) ? briefs : []) {
    if (b?.date && b.date >= fromDate && b.date <= toDate) {
      byDate.set(b.date, b);
    }
  }

  let daysElapsed = 0;
  let daysFuture = 0;
  let daysWithNode = 0;
  let daysObserved = 0;
  let cursor = fromDate;
  while (cursor <= toDate) {
    const isFuture = asOfDate ? cursor > asOfDate : false;
    if (isFuture) {
      daysFuture += 1;
    } else {
      daysElapsed += 1;
      const brief = byDate.get(cursor);
      if (brief) {
        daysWithNode += 1;
        if (briefHasObservation(brief)) daysObserved += 1;
      }
    }
    cursor = addCalendarDays(cursor, 1);
  }

  const truncated = Boolean(
    (seriesFrom && isIsoDateString(seriesFrom) && seriesFrom > fromDate)
    || (seriesTo && isIsoDateString(seriesTo) && seriesTo < toDate && (!asOfDate || seriesTo < asOfDate)),
  );
  const temporalComplete = Boolean(
    asOfDate
    && toDate <= asOfDate
    && daysFuture === 0
    && !truncated
    && daysWithNode >= daysElapsed
    && daysElapsed === calendarDays,
  );

  const verificationStatus = resolveVerificationStatus({
    publicationDate: ctx.publicationDate || toDate,
    asOfDate: asOfDate || toDate,
    windowToDate: toDate,
    temporalComplete,
    truncated: truncated || daysFuture > 0,
    presetHint: ctx.presetHint || null,
    forceSimulation: Boolean(ctx.forceSimulation),
  });

  const periodQuality = verificationStatus === FOCUS_VERIFICATION_STATUS.historical_real
    ? 'complete'
    : (verificationStatus === FOCUS_VERIFICATION_STATUS.future_unverified
      || verificationStatus === FOCUS_VERIFICATION_STATUS.fixture_simulation)
      ? 'future_unverified'
      : (daysElapsed > 0 ? 'partial' : 'empty');

  return {
    fromDate,
    toDate,
    asOfDate,
    calendarDays,
    daysElapsed,
    daysFuture,
    daysWithNode,
    daysObserved,
    /** @deprecated alias: nodi in serie su giorni elapsed — NON usare come “osservato” */
    daysPresent: daysWithNode,
    daysInSeries: byDate.size,
    daysMissing: Math.max(0, daysElapsed - daysWithNode),
    truncated: truncated || daysFuture > 0,
    seriesFrom,
    seriesTo,
    temporalComplete,
    complete: temporalComplete,
    presentedAsComplete: temporalComplete
      && verificationStatus === FOCUS_VERIFICATION_STATUS.historical_real,
    periodQuality,
    verificationStatus,
    note: 'Nodo presente ≠ osservazione; data futura ≠ giornata osservata.',
  };
}

/**
 * @param {object[]} historyDayBriefs
 * @param {object} window
 * @param {object} [ctx]
 */
export function aggregateEditionPeriod(historyDayBriefs, window, ctx = {}) {
  if (!window?.fromDate || !window?.toDate) {
    return null;
  }
  const fromDate = window.fromDate;
  const toDate = window.toDate;
  const asOfDate = isIsoDateString(ctx.asOfDate) ? ctx.asOfDate : null;
  const sleepFrom = window.sleepWakeFrom || fromDate;
  const sleepTo = window.sleepWakeTo || toDate;
  // Risvegli futuri esclusi dall’aggregato
  const effectiveSleepTo = asOfDate && sleepTo > asOfDate ? asOfDate : sleepTo;
  const effectiveDayTo = asOfDate && toDate > asOfDate ? asOfDate : toDate;

  const coverage = assessWindowCoverage(historyDayBriefs, fromDate, toDate, ctx);
  const dayBriefs = filterBriefsByCalendarDate(historyDayBriefs, fromDate, effectiveDayTo)
    .filter((b) => !asOfDate || b.date <= asOfDate);
  const sleepBriefs = filterBriefsBySleepWake(historyDayBriefs, sleepFrom, effectiveSleepTo)
    .filter((b) => b.sleepAvailable && b.sleep?.hours != null)
    .filter((b) => !asOfDate || (b.sleep?.nightEndedOn || '') <= asOfDate);

  const foodDays = dayBriefs.filter((b) => b.hasFood);
  const workoutDays = dayBriefs.filter((b) => b.hasWorkout);
  const strengthDays = dayBriefs.filter(
    (b) => (b.activity?.strengthSessionCount || 0) > 0,
  );
  const aerobicDays = dayBriefs.filter(
    (b) => (b.activity?.aerobicMinutes || b.activity?.cardioMinutes || 0) > 0,
  );

  const nutrition = {
    avgKcal: averageOrNull(foodDays.map((b) => b.nutrition?.kcal)),
    avgProteinG: averageOrNull(foodDays.map((b) => b.nutrition?.proteinG)),
    daysWithFood: foodDays.length,
    daysWithoutFoodLog: dayBriefs.length - foodDays.length,
    domainCoverageRatio: coverage.daysElapsed > 0
      ? Math.round((foodDays.length / coverage.daysElapsed) * 1000) / 1000
      : 0,
  };

  const sleep = {
    avgHours: averageOrNull(sleepBriefs.map((b) => b.sleep.hours)),
    nightsLogged: sleepBriefs.length,
    sleepWakeFrom: sleepFrom,
    sleepWakeTo: effectiveSleepTo,
    domainCoverageRatio: coverage.daysElapsed > 0
      ? Math.round((sleepBriefs.length / coverage.daysElapsed) * 1000) / 1000
      : 0,
    note: 'Aggregato su date di risveglio ≤ asOfDate; assenza di notte ≠ insonnia.',
  };

  const activity = {
    workoutDaysLogged: workoutDays.length,
    strengthDaysLogged: strengthDays.length,
    aerobicDaysLogged: aerobicDays.length,
    domainCoverageRatio: coverage.daysElapsed > 0
      ? Math.round((workoutDays.length / coverage.daysElapsed) * 1000) / 1000
      : 0,
    zeroLoggedWorkoutsMeans: 'no_workout_events_found',
    noAerobicMeans: 'no_aerobic_labeled_minutes_not_physical_inactivity',
  };

  const solidDomains = [];
  if (nutrition.daysWithFood >= 4 && nutrition.avgKcal != null) solidDomains.push('nutrition');
  if (sleep.nightsLogged >= 4 && sleep.avgHours != null) solidDomains.push('sleep');
  if (activity.strengthDaysLogged >= 2 || activity.workoutDaysLogged >= 3) {
    solidDomains.push('activity');
  }

  const aggregatesAvailable = solidDomains.length >= 1 && coverage.daysElapsed > 0;
  const futureBlocked = coverage.verificationStatus === FOCUS_VERIFICATION_STATUS.future_unverified
    || coverage.verificationStatus === FOCUS_VERIFICATION_STATUS.fixture_simulation
    || coverage.daysFuture > 0
    || (asOfDate && toDate > asOfDate);

  /** Solido per aggregati — NON implica storia pubblicabile. */
  const evidenceSolid = aggregatesAvailable
    && !futureBlocked
    && coverage.daysObserved >= Math.ceil(Math.max(coverage.daysElapsed, 1) * 0.35);

  return {
    label: window.label || 'period',
    fromDate,
    toDate,
    coverage,
    nutrition,
    sleep,
    activity,
    solidDomains,
    aggregatesAvailable,
    evidenceSolid,
    /** @deprecated: usare evidenceSolid + story gate; non auto-pubblica */
    centerpieceEligible: evidenceSolid && !futureBlocked,
    futureBlocked,
    limitations: [
      'Giorno senza log ≠ comportamento assente',
      'Nodo presente ≠ osservazione registrata',
      'Data futura ≠ giornata osservata',
      'Assenza aerobica etichettata ≠ inattività fisica',
      'Niente conclusioni corporee da misure fuori finestra',
      'Fibre: non giudicare se fonte inattendibile',
    ],
  };
}

/**
 * Confronto trasparente tra due aggregati.
 * Non etichetta mai come «mese precedente» una finestra mobile non solare.
 *
 * @param {object|null} current
 * @param {object|null} previous
 * @param {{ intendedLabel?: string }} [opts]
 */
export function compareEditionPeriods(current, previous, opts = {}) {
  if (!current || !previous) {
    return {
      available: false,
      reason: 'missing_period',
      comparisonKind: null,
      label: null,
      deltas: null,
    };
  }
  if (current.futureBlocked || previous.futureBlocked) {
    return {
      available: false,
      reason: 'future_or_unverified_window',
      comparisonKind: null,
      label: null,
      deltas: null,
    };
  }
  if (
    current.coverage?.periodQuality === 'empty'
    || previous.coverage?.periodQuality === 'empty'
  ) {
    return {
      available: false,
      reason: 'empty_period',
      comparisonKind: null,
      label: null,
      deltas: null,
    };
  }

  const curDays = current.coverage?.daysElapsed || current.coverage?.calendarDays || 0;
  const prevDays = previous.coverage?.daysElapsed || previous.coverage?.calendarDays || 0;
  if (curDays === 0 || prevDays === 0) {
    return {
      available: false,
      reason: 'zero_elapsed_days',
      comparisonKind: null,
      label: null,
      deltas: null,
    };
  }
  if (Math.abs(curDays - prevDays) > 2) {
    return {
      available: false,
      reason: 'window_length_mismatch',
      comparisonKind: null,
      label: null,
      deltas: null,
      currentWindow: { from: current.fromDate, to: current.toDate, daysElapsed: curDays },
      previousWindow: { from: previous.fromDate, to: previous.toDate, daysElapsed: prevDays },
    };
  }

  const curObsRatio = curDays > 0 ? (current.coverage.daysObserved || 0) / curDays : 0;
  const prevObsRatio = prevDays > 0 ? (previous.coverage.daysObserved || 0) / prevDays : 0;
  if (curObsRatio < 0.35 || prevObsRatio < 0.35) {
    return {
      available: false,
      reason: 'insufficient_homogeneous_coverage',
      comparisonKind: null,
      label: null,
      deltas: null,
      currentWindow: describeWindowForComparison(current),
      previousWindow: describeWindowForComparison(previous),
    };
  }

  const isCalendarMonthPair = Boolean(
    opts.intendedLabel === 'prev_calendar_month'
    && looksLikeFullCalendarMonth(current.fromDate, current.toDate)
    && looksLikeFullCalendarMonth(previous.fromDate, previous.toDate)
    && current.coverage?.temporalComplete
    && previous.coverage?.temporalComplete,
  );

  const comparisonKind = isCalendarMonthPair
    ? 'calendar_month_vs_prior_calendar_month'
    : 'equal_length_prior_window';
  const label = isCalendarMonthPair
    ? 'mese_solare_precedente'
    : 'finestra_equivalente_precedente';

  const delta = (a, b) => {
    if (a == null || b == null) return null;
    return Math.round((a - b) * 100) / 100;
  };
  const rel = (a, b) => {
    if (a == null || b == null || b === 0) return null;
    return Math.round(((a - b) / Math.abs(b)) * 1000) / 1000;
  };

  const dAbs = {
    avgKcal: delta(current.nutrition?.avgKcal, previous.nutrition?.avgKcal),
    avgProteinG: delta(current.nutrition?.avgProteinG, previous.nutrition?.avgProteinG),
    avgSleepHours: delta(current.sleep?.avgHours, previous.sleep?.avgHours),
    strengthDaysLogged: delta(
      current.activity?.strengthDaysLogged,
      previous.activity?.strengthDaysLogged,
    ),
    workoutDaysLogged: delta(
      current.activity?.workoutDaysLogged,
      previous.activity?.workoutDaysLogged,
    ),
  };
  const dRel = {
    avgKcal: rel(current.nutrition?.avgKcal, previous.nutrition?.avgKcal),
    avgProteinG: rel(current.nutrition?.avgProteinG, previous.nutrition?.avgProteinG),
    avgSleepHours: rel(current.sleep?.avgHours, previous.sleep?.avgHours),
    strengthDaysLogged: rel(
      current.activity?.strengthDaysLogged,
      previous.activity?.strengthDaysLogged,
    ),
    workoutDaysLogged: rel(
      current.activity?.workoutDaysLogged,
      previous.activity?.workoutDaysLogged,
    ),
  };

  return {
    available: true,
    reason: null,
    comparisonKind,
    label,
    interpretativeLimit: isCalendarMonthPair
      ? 'Confronto fra mesi solari completi con copertura osservata sufficiente.'
      : 'Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente. '
        + 'Differenze di conteggio possono riflettere copertura diversa, non solo comportamento.',
    comparabilityCriteria: {
      minObservedRatio: 0.35,
      maxLengthDiffDays: 2,
      bothElapsedAligned: Math.abs(curDays - prevDays) <= 2,
    },
    currentWindow: describeWindowForComparison(current),
    previousWindow: describeWindowForComparison(previous),
    previousFrom: previous.fromDate,
    previousTo: previous.toDate,
    deltas: dAbs,
    relativeDeltas: dRel,
    domainCoverage: {
      current: {
        nutrition: current.nutrition?.domainCoverageRatio,
        sleep: current.sleep?.domainCoverageRatio,
        activity: current.activity?.domainCoverageRatio,
      },
      previous: {
        nutrition: previous.nutrition?.domainCoverageRatio,
        sleep: previous.sleep?.domainCoverageRatio,
        activity: previous.activity?.domainCoverageRatio,
      },
    },
  };
}

/** @param {object} agg */
function describeWindowForComparison(agg) {
  return {
    from: agg.fromDate,
    to: agg.toDate,
    calendarDays: agg.coverage?.calendarDays ?? null,
    daysElapsed: agg.coverage?.daysElapsed ?? null,
    daysWithNode: agg.coverage?.daysWithNode ?? null,
    daysObserved: agg.coverage?.daysObserved ?? null,
    verificationStatus: agg.coverage?.verificationStatus ?? null,
    nutritionDays: agg.nutrition?.daysWithFood ?? null,
    sleepNights: agg.sleep?.nightsLogged ?? null,
    strengthDays: agg.activity?.strengthDaysLogged ?? null,
  };
}

/**
 * @param {string} from
 * @param {string} to
 */
function looksLikeFullCalendarMonth(from, to) {
  if (!isIsoDateString(from) || !isIsoDateString(to)) return false;
  if (from.slice(8, 10) !== '01') return false;
  if (from.slice(0, 7) !== to.slice(0, 7)) return false;
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  return to === `${from.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/**
 * @param {{ fromDate: string, toDate: string, label?: string }} window
 */
export function previousEqualLengthWindow(window) {
  if (!window?.fromDate || !window?.toDate) return null;
  const days = countInclusiveCalendarDays(window.fromDate, window.toDate);
  if (days <= 0) return null;
  const prevTo = addCalendarDays(window.fromDate, -1);
  const prevFrom = addCalendarDays(prevTo, -(days - 1));
  if (!isIsoDateString(prevFrom) || !isIsoDateString(prevTo)) return null;
  return {
    fromDate: prevFrom,
    toDate: prevTo,
    sleepWakeFrom: prevFrom,
    sleepWakeTo: prevTo,
    label: `${window.label || 'period'}_prev_equal_length`,
  };
}

/**
 * @param {object[]} historyDayBriefs
 * @param {object} editionWindows
 * @param {{
 *   seriesFrom?: string,
 *   seriesTo?: string,
 *   asOfDate?: string,
 *   presetHint?: string,
 *   forceSimulation?: boolean,
 * }} [ctx]
 */
export function buildEditionPerspective(historyDayBriefs, editionWindows, ctx = {}) {
  if (!editionWindows?.ok) {
    return {
      editionKind: null,
      asOfDate: ctx.asOfDate || null,
      verificationStatus: FOCUS_VERIFICATION_STATUS.unevaluable,
      evaluable: { daily: false, weekCenterpiece: false, monthCenterpiece: false },
      week: null,
      month: null,
      notes: ['edition_windows_invalid'],
    };
  }

  const briefs = Array.isArray(historyDayBriefs) ? historyDayBriefs : [];
  const spanCtx = {
    seriesFrom: ctx.seriesFrom || null,
    seriesTo: ctx.seriesTo || null,
    asOfDate: ctx.asOfDate || null,
    publicationDate: editionWindows.publicationDate,
    presetHint: ctx.presetHint || null,
    forceSimulation: Boolean(ctx.forceSimulation),
  };

  /** @type {object|null} */
  let week = null;
  /** @type {object|null} */
  let month = null;

  if (editionWindows.week) {
    const aggregate = aggregateEditionPeriod(briefs, editionWindows.week, spanCtx);
    const prevWin = previousEqualLengthWindow(editionWindows.week);
    const prevAgg = prevWin
      ? aggregateEditionPeriod(briefs, prevWin, spanCtx)
      : null;
    const comparison = compareEditionPeriods(aggregate, prevAgg, {
      intendedLabel: 'week_sun_sat',
    });
    week = {
      window: editionWindows.week,
      aggregate,
      comparison,
      priorWindow: prevWin,
      priorAggregate: prevAgg,
    };
  }

  if (editionWindows.month) {
    const aggregate = aggregateEditionPeriod(briefs, editionWindows.month, spanCtx);
    const prevWin = previousEqualLengthWindow(editionWindows.month);
    const prevAgg = prevWin
      ? aggregateEditionPeriod(briefs, prevWin, spanCtx)
      : null;
    const comparison = compareEditionPeriods(aggregate, prevAgg, {
      intendedLabel: 'prev_calendar_month',
    });
    month = {
      window: editionWindows.month,
      aggregate,
      comparison,
      priorWindow: prevWin,
      priorAggregate: prevAgg,
    };
  }

  const editionVerification = resolveVerificationStatus({
    publicationDate: editionWindows.publicationDate,
    asOfDate: spanCtx.asOfDate || editionWindows.publicationDate,
    windowToDate: editionWindows.month?.toDate || editionWindows.week?.toDate || null,
    temporalComplete: Boolean(
      (month?.aggregate?.coverage?.temporalComplete)
      || (week?.aggregate?.coverage?.temporalComplete && !editionWindows.month),
    ),
    truncated: Boolean(
      month?.aggregate?.coverage?.truncated || week?.aggregate?.coverage?.truncated,
    ),
    presetHint: spanCtx.presetHint,
    forceSimulation: spanCtx.forceSimulation,
  });

  const weekEvidence = Boolean(week?.aggregate?.evidenceSolid && !week?.aggregate?.futureBlocked);
  const monthEvidence = Boolean(month?.aggregate?.evidenceSolid && !month?.aggregate?.futureBlocked);

  return {
    editionKind: editionWindows.editionKind,
    publicationDate: editionWindows.publicationDate,
    analysisDate: editionWindows.analysisDate,
    lastCompletedNight: editionWindows.lastCompletedNight,
    asOfDate: spanCtx.asOfDate,
    verificationStatus: editionVerification,
    windows: {
      week: editionWindows.week,
      month: editionWindows.month,
      perspectiveFrom: editionWindows.perspectiveFrom,
      perspectiveTo: editionWindows.perspectiveTo,
    },
    week,
    month,
    evaluable: {
      daily: editionVerification !== FOCUS_VERIFICATION_STATUS.future_unverified
        || editionVerification === FOCUS_VERIFICATION_STATUS.fixture_simulation,
      weekCenterpiece: weekEvidence,
      monthCenterpiece: monthEvidence,
      weekComparison: Boolean(week?.comparison?.available),
      monthComparison: Boolean(month?.comparison?.available),
    },
    futureHistoryLoadHints: editionWindows.futureHistoryLoadHints,
    notes: [
      week?.aggregate?.futureBlocked ? 'week_future_or_unverified' : null,
      month?.aggregate?.futureBlocked ? 'month_future_or_unverified' : null,
      week && !weekEvidence ? 'week_evidence_not_solid' : null,
      month && !monthEvidence ? 'month_evidence_not_solid' : null,
      week?.comparison && !week.comparison.available
        ? `week_comparison_${week.comparison.reason}`
        : null,
      month?.comparison && !month.comparison.available
        ? `month_comparison_${month.comparison.reason}`
        : null,
      month?.comparison?.available && month.comparison.comparisonKind === 'equal_length_prior_window'
        ? 'month_comparison_is_equal_length_window_not_calendar_month'
        : null,
    ].filter(Boolean),
  };
}
