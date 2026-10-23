/**
 * Plausibilità orari sonno (P6.3).
 * Conserva sempre la registrazione; non corregge il diario.
 * Distingue ordinary / unusual / ambiguous.
 */

import { bedtimeLinearOffset, wrap24 } from './focusDateUtils.js';

/** @typedef {'ordinary'|'unusual'|'ambiguous'} SleepTimingClass */

export const SLEEP_TIMING_CLASS = Object.freeze({
  ordinary: 'ordinary',
  unusual: 'unusual',
  ambiguous: 'ambiguous',
});

export const DEFAULT_SLEEP_TIMING_THRESHOLDS = Object.freeze({
  /** Finestra tipica sveglia mattutina (ore decimali). */
  ordinaryWakeMinH: 4,
  ordinaryWakeMaxH: 11.5,
  /**
   * Bedtime “ordinario” in offset lineare (20 = 20:00, 30 = 06:00 del giorno dopo).
   * Fuori range → orario atipico, non cancellato.
   */
  ordinaryBedtimeLinearMinH: 20,
  ordinaryBedtimeLinearMaxH: 30,
  /** Durata plausibile per sonno principale. */
  minPlausibleDurationH: 3,
  maxPlausibleDurationH: 14,
  /** Tolleranza match durata vs span bedtime→wake (ore). */
  durationSpanToleranceH: 0.35,
});

/**
 * @param {Partial<typeof DEFAULT_SLEEP_TIMING_THRESHOLDS>|null|undefined} overrides
 */
export function resolveSleepTimingThresholds(overrides) {
  return Object.freeze({
    ...DEFAULT_SLEEP_TIMING_THRESHOLDS,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  });
}

/**
 * Span bedtime→wake in ore (wrap 24h).
 * @param {number|null} bedtimeH
 * @param {number|null} wakeH
 */
export function sleepSpanHours(bedtimeH, wakeH) {
  if (!Number.isFinite(bedtimeH) || !Number.isFinite(wakeH)) return null;
  let d = Number(wakeH) - Number(bedtimeH);
  if (d < 0) d += 24;
  return Math.round(d * 1000) / 1000;
}

/**
 * @param {{
 *   wakeTime?: number|null,
 *   bedtime?: number|null,
 *   hours?: number|null,
 *   available?: boolean,
 * }} night
 * @param {Partial<typeof DEFAULT_SLEEP_TIMING_THRESHOLDS>} [thresholdOverrides]
 */
export function classifySleepTiming(night, thresholdOverrides) {
  const t = resolveSleepTimingThresholds(thresholdOverrides);
  const wake = Number.isFinite(night?.wakeTime) ? wrap24(night.wakeTime) : null;
  const bedtime = Number.isFinite(night?.bedtime) ? wrap24(night.bedtime) : null;
  const hours = Number.isFinite(night?.hours) ? Number(night.hours) : null;

  if (!night?.available && hours == null && wake == null) {
    return {
      timingClass: SLEEP_TIMING_CLASS.ordinary,
      reasons: ['no_sleep_data'],
      ordinaryWake: null,
      ordinaryBedtime: null,
      durationPlausible: null,
      spanMatchesDuration: null,
      keepInSeries: true,
      useInStrongRegularity: false,
    };
  }

  const ordinaryWake = wake != null
    && wake >= t.ordinaryWakeMinH
    && wake <= t.ordinaryWakeMaxH;
  const bedLinear = bedtime != null ? bedtimeLinearOffset(bedtime) : null;
  const ordinaryBedtime = bedLinear != null
    && bedLinear >= t.ordinaryBedtimeLinearMinH
    && bedLinear <= t.ordinaryBedtimeLinearMaxH;
  const durationPlausible = hours != null
    && hours >= t.minPlausibleDurationH
    && hours <= t.maxPlausibleDurationH;

  const span = sleepSpanHours(bedtime, wake);
  const spanMatchesDuration = span != null && hours != null
    ? Math.abs(span - hours) <= t.durationSpanToleranceH
    : null;

  /** @type {string[]} */
  const reasons = [];
  if (wake != null && !ordinaryWake) reasons.push('wake_outside_ordinary_window');
  if (bedtime != null && !ordinaryBedtime) reasons.push('bedtime_outside_ordinary_window');
  if (hours != null && !durationPlausible) reasons.push('duration_outside_plausible_range');
  if (spanMatchesDuration === false) reasons.push('duration_span_mismatch');

  let timingClass = SLEEP_TIMING_CLASS.ordinary;
  if (reasons.length === 0) {
    timingClass = SLEEP_TIMING_CLASS.ordinary;
  } else if (
    // Sonno diurno coerente: orari fuori finestra ma durata ≈ span → unusual, non cancellare
    (wake != null && !ordinaryWake)
    && durationPlausible
    && spanMatchesDuration === true
  ) {
    timingClass = SLEEP_TIMING_CLASS.unusual;
    reasons.push('possible_legitimate_day_sleep');
  } else if (
    spanMatchesDuration === false
    || (hours != null && !durationPlausible)
    || (wake != null && !ordinaryWake && spanMatchesDuration == null)
  ) {
    timingClass = SLEEP_TIMING_CLASS.ambiguous;
  } else if (!ordinaryWake || !ordinaryBedtime) {
    timingClass = SLEEP_TIMING_CLASS.unusual;
  }

  const useInStrongRegularity = timingClass === SLEEP_TIMING_CLASS.ordinary;

  return {
    timingClass,
    reasons,
    ordinaryWake,
    ordinaryBedtime,
    durationPlausible,
    spanMatchesDuration,
    spanHours: span,
    thresholds: t,
    keepInSeries: true,
    useInStrongRegularity,
  };
}
