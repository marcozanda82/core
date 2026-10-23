/**
 * Segnali strutturati routine sonno (P6.2).
 * Predisposti per editoriale futuro — nessuna selezione articoli / memoria persistente.
 */

import { SLEEP_ROUTINE_RELIABILITY } from './aggregateSleepRoutine.js';
import { resolveSleepRoutineThresholds } from './sleepRoutineConfig.js';

/**
 * @param {{
 *   aggregate: object,
 *   fromDate?: string|null,
 *   toDate?: string|null,
 *   thresholds?: object|null,
 * }} input
 * @returns {object[]}
 */
export function buildSleepRoutineSignals(input) {
  const agg = input.aggregate;
  if (!agg) return [];
  const thresholds = resolveSleepRoutineThresholds(input.thresholds || agg.thresholds);
  const period = {
    from: input.fromDate || agg.coverage?.fromDate || null,
    to: input.toDate || agg.coverage?.toDate || null,
    windowDays: agg.coverage?.windowDays ?? null,
  };
  const coverage = agg.coverage || {};

  /** @type {object[]} */
  const signals = [];

  signals.push(stableWeekdayWakeSignal(agg, thresholds, period, coverage));
  signals.push(weekendWakeShiftSignal(agg, thresholds, period, coverage));
  signals.push(regularityChangeSignal(agg, thresholds, period, coverage));
  signals.push(bedtimeShiftSignal(agg, thresholds, period, coverage));
  signals.push(durationSegmentDeltaSignal(agg, thresholds, period, coverage));

  return signals;
}

/**
 * @param {string} topicId
 * @param {object} base
 */
function signal(topicId, base) {
  return {
    topicId,
    id: `sig_${topicId}`,
    observedPeriod: base.observedPeriod,
    coverage: base.coverage,
    reliability: base.reliability,
    support: base.support,
    publishable: Boolean(base.publishable),
    publishReason: base.publishReason || null,
    withholdReason: base.withholdReason || null,
    /** Hint anti-ripetizione futura (nessuna scrittura ora). */
    antiRepeatHint: {
      topicId,
      cooldownSuggestedDays: base.cooldownSuggestedDays ?? 7,
    },
  };
}

/** Preferisce aggregati ordinary per claim forti. */
function ordinaryOrAll(agg) {
  return agg.ordinary || {
    wake: agg.wake,
    duration: agg.duration,
    bedtime: agg.bedtime,
    regularity: agg.regularity,
  };
}

function stableWeekdayWakeSignal(agg, thresholds, period, coverage) {
  const ord = ordinaryOrAll(agg);
  const rel = agg.reliability?.wakeDispersion;
  const iqr = ord.regularity?.wakeWeekdayIqrH;
  const median = ord.wake?.weekday?.median;
  const n = ord.wake?.weekday?.n ?? 0;
  const reliable = rel?.status === SLEEP_ROUTINE_RELIABILITY.reliable;
  const stable = reliable && iqr != null && iqr <= thresholds.stableWakeIqrMaxH && median != null;
  return signal('sleep_wake_weekday_stable', {
    observedPeriod: period,
    coverage: {
      wakeWeekdayN: n,
      nightsLogged: coverage.nightsLogged,
      windowDays: coverage.windowDays,
    },
    reliability: reliable
      ? SLEEP_ROUTINE_RELIABILITY.reliable
      : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    support: {
      medianWakeWeekdayH: median,
      iqrWakeWeekdayH: iqr,
      stableWakeIqrMaxH: thresholds.stableWakeIqrMaxH,
      n,
    },
    publishable: stable,
    publishReason: stable
      ? `weekday_wake_iqr_${iqr}_le_${thresholds.stableWakeIqrMaxH}`
      : null,
    withholdReason: stable
      ? null
      : (!reliable
        ? (rel?.reasons || ['insufficient_weekday_sample']).join(';')
        : iqr == null
          ? 'missing_iqr'
          : `iqr_${iqr}_gt_${thresholds.stableWakeIqrMaxH}`),
    cooldownSuggestedDays: 10,
  });
}

function weekendWakeShiftSignal(agg, thresholds, period, coverage) {
  const ord = ordinaryOrAll(agg);
  const rel = agg.reliability?.weekdayWeekendCompare;
  const delta = ord.wake?.deltaWeekendMinusWeekdayH;
  const reliable = rel?.status === SLEEP_ROUTINE_RELIABILITY.reliable;
  const significant = reliable
    && delta != null
    && Math.abs(delta) >= thresholds.weekendWakeDeltaMinH;
  return signal('sleep_wake_weekend_vs_weekday', {
    observedPeriod: period,
    coverage: {
      wakeWeekdayN: ord.wake?.weekday?.n ?? 0,
      wakeWeekendN: ord.wake?.weekend?.n ?? 0,
      ordinaryNightsLogged: coverage.ordinaryNightsLogged,
      anomalyFraction: coverage.anomalyFraction,
      windowDays: coverage.windowDays,
    },
    reliability: reliable
      ? SLEEP_ROUTINE_RELIABILITY.reliable
      : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    support: {
      medianWakeWeekdayH: ord.wake?.weekday?.median ?? null,
      medianWakeWeekendH: ord.wake?.weekend?.median ?? null,
      deltaWeekendMinusWeekdayH: delta,
      weekendWakeDeltaMinH: thresholds.weekendWakeDeltaMinH,
    },
    publishable: significant,
    publishReason: significant
      ? `abs_delta_${Math.abs(delta)}_ge_${thresholds.weekendWakeDeltaMinH}`
      : null,
    withholdReason: significant
      ? null
      : (!reliable
        ? (rel?.reasons || ['insufficient_segment_sample']).join(';')
        : delta == null
          ? 'missing_delta'
          : `abs_delta_${Math.abs(delta)}_lt_${thresholds.weekendWakeDeltaMinH}`),
    cooldownSuggestedDays: 7,
  });
}

function regularityChangeSignal(agg, thresholds, period, coverage) {
  const rel = agg.reliability?.regularityChange;
  const delta = agg.shift?.wakeWeekdayIqrDeltaH;
  const reliable = rel?.status === SLEEP_ROUTINE_RELIABILITY.reliable;
  // Miglioramento = IQR recente più basso (delta negativo)
  const improved = reliable
    && delta != null
    && delta <= -thresholds.regularityImproveMinH;
  return signal('sleep_wake_regularity_change', {
    observedPeriod: period,
    coverage: {
      recentWindowNights: agg.shift?.recentWindowNights ?? 0,
      previousWindowNights: agg.shift?.previousWindowNights ?? 0,
      windowDays: coverage.windowDays,
    },
    reliability: reliable
      ? SLEEP_ROUTINE_RELIABILITY.reliable
      : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    support: {
      wakeWeekdayIqrRecentH: agg.shift?.wakeWeekdayIqrRecentH ?? null,
      wakeWeekdayIqrPreviousH: agg.shift?.wakeWeekdayIqrPreviousH ?? null,
      wakeWeekdayIqrDeltaH: delta,
      regularityImproveMinH: thresholds.regularityImproveMinH,
      direction: delta == null ? null : (delta < 0 ? 'more_regular' : delta > 0 ? 'less_regular' : 'stable'),
    },
    publishable: improved,
    publishReason: improved
      ? `iqr_improved_by_${Math.abs(delta)}_ge_${thresholds.regularityImproveMinH}`
      : null,
    withholdReason: improved
      ? null
      : (!reliable
        ? (rel?.reasons || ['insufficient_shift_sample']).join(';')
        : delta == null
          ? 'missing_iqr_delta'
          : `no_significant_regularity_improvement`),
    cooldownSuggestedDays: 14,
  });
}

function bedtimeShiftSignal(agg, thresholds, period, coverage) {
  const rel = agg.reliability?.bedtimeShift;
  const shiftH = agg.shift?.bedtimeShiftH;
  const reliable = rel?.status === SLEEP_ROUTINE_RELIABILITY.reliable;
  const significant = reliable
    && shiftH != null
    && Math.abs(shiftH) >= thresholds.bedtimeShiftMinH;
  return signal('sleep_bedtime_shift_recent', {
    observedPeriod: period,
    coverage: {
      bedtimeRecordedN: coverage.bedtimeRecordedN,
      bedtimeCalculatedN: coverage.bedtimeCalculatedN,
      bedtimeAmbiguousN: coverage.bedtimeAmbiguousN,
      acceptCalculatedBedtime: agg.bedtime?.acceptCalculatedBedtime ?? true,
      windowDays: coverage.windowDays,
    },
    reliability: reliable
      ? SLEEP_ROUTINE_RELIABILITY.reliable
      : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    support: {
      bedtimeRecentMedianH: agg.shift?.bedtimeRecentMedian ?? null,
      bedtimePreviousMedianH: agg.shift?.bedtimePreviousMedian ?? null,
      bedtimeShiftH: shiftH,
      bedtimeShiftMinH: thresholds.bedtimeShiftMinH,
    },
    publishable: significant,
    publishReason: significant
      ? `abs_bedtime_shift_${Math.abs(shiftH)}_ge_${thresholds.bedtimeShiftMinH}`
      : null,
    withholdReason: significant
      ? null
      : (!reliable
        ? (rel?.reasons || ['insufficient_bedtime_sample']).join(';')
        : shiftH == null
          ? 'missing_shift'
          : `abs_shift_${Math.abs(shiftH)}_lt_${thresholds.bedtimeShiftMinH}`),
    cooldownSuggestedDays: 10,
  });
}

function durationSegmentDeltaSignal(agg, thresholds, period, coverage) {
  const ord = ordinaryOrAll(agg);
  const rel = agg.reliability?.weekdayWeekendCompare;
  const delta = ord.duration?.deltaWeekendMinusWeekdayH;
  const reliable = rel?.status === SLEEP_ROUTINE_RELIABILITY.reliable;
  const significant = reliable
    && delta != null
    && Math.abs(delta) >= thresholds.durationDeltaMinH;
  return signal('sleep_duration_weekend_vs_weekday', {
    observedPeriod: period,
    coverage: {
      weekdayNightsLogged: coverage.weekdayNightsLogged,
      weekendNightsLogged: coverage.weekendNightsLogged,
      ordinaryNightsLogged: coverage.ordinaryNightsLogged,
      windowDays: coverage.windowDays,
    },
    reliability: reliable
      ? SLEEP_ROUTINE_RELIABILITY.reliable
      : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
    support: {
      medianDurationWeekdayH: ord.duration?.weekday?.median ?? null,
      medianDurationWeekendH: ord.duration?.weekend?.median ?? null,
      deltaWeekendMinusWeekdayH: delta,
      durationDeltaMinH: thresholds.durationDeltaMinH,
      interpretationNote: ord.duration?.interpretationNote || agg.duration?.interpretationNote || null,
    },
    publishable: significant,
    publishReason: significant
      ? `abs_duration_delta_${Math.abs(delta)}_ge_${thresholds.durationDeltaMinH}`
      : null,
    withholdReason: significant
      ? null
      : (!reliable
        ? (rel?.reasons || ['insufficient_segment_sample']).join(';')
        : delta == null
          ? 'missing_delta'
          : `abs_delta_${Math.abs(delta)}_lt_${thresholds.durationDeltaMinH}`),
    cooldownSuggestedDays: 7,
  });
}
