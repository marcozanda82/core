/**
 * Aggregatore puro routine sonno (P6.2).
 * Classificazione feriale/weekend sulla mattina di risveglio (nightEndedOn).
 * Non interpreta Δ durata come debito/recupero.
 */

import {
  bedtimeFromLinearOffset,
  bedtimeLinearOffset,
} from '../normalize/focusDateUtils.js';
import { resolveSleepRoutineThresholds } from './sleepRoutineConfig.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';

export const SLEEP_ROUTINE_RELIABILITY = Object.freeze({
  reliable: 'reliable',
  insufficient_evidence: 'insufficient_evidence',
  partial: 'partial',
});

/**
 * @param {number[]} values
 * @returns {number[]}
 */
function sortedFinite(values) {
  return values
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
}

/**
 * @param {number[]} sorted
 * @returns {number|null}
 */
export function medianOfSorted(sorted) {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Quartili tipo Tukey (mediana delle metà).
 * @param {number[]} sorted
 * @returns {{ q1: number|null, q3: number|null, iqr: number|null }}
 */
export function quartilesOfSorted(sorted) {
  const n = sorted.length;
  if (n === 0) return { q1: null, q3: null, iqr: null };
  if (n === 1) return { q1: sorted[0], q3: sorted[0], iqr: 0 };
  const mid = Math.floor(n / 2);
  const lower = sorted.slice(0, mid);
  const upper = n % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = medianOfSorted(lower);
  const q3 = medianOfSorted(upper);
  if (q1 == null || q3 == null) return { q1, q3, iqr: null };
  return { q1, q3, iqr: Math.round((q3 - q1) * 1000) / 1000 };
}

/** @param {number|null} v */
function roundH(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 1000) / 1000;
}

/**
 * Statistiche lineari su ore (wake / durata).
 * @param {number[]} values
 */
export function linearHourStats(values) {
  const sorted = sortedFinite(values);
  const med = medianOfSorted(sorted);
  const { q1, q3, iqr } = quartilesOfSorted(sorted);
  return {
    n: sorted.length,
    median: roundH(med),
    q1: roundH(q1),
    q3: roundH(q3),
    iqr: iqr == null ? null : roundH(iqr),
  };
}

/**
 * Statistiche bedtime con wrap mezzanotte (offset lineare → wrap).
 * @param {number[]} bedtimeHours
 */
export function bedtimeHourStats(bedtimeHours) {
  const linear = bedtimeHours
    .map((h) => bedtimeLinearOffset(h))
    .filter((v) => v != null);
  const stats = linearHourStats(linear);
  return {
    n: stats.n,
    median: stats.median == null ? null : bedtimeFromLinearOffset(stats.median),
    q1: stats.q1 == null ? null : bedtimeFromLinearOffset(stats.q1),
    q3: stats.q3 == null ? null : bedtimeFromLinearOffset(stats.q3),
    iqr: stats.iqr,
    _linearMedian: stats.median,
  };
}

/**
 * Differenza circolare ore (b − a) in (−12, 12].
 * @param {number|null} a
 * @param {number|null} b
 */
export function circularHourDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let d = Number(b) - Number(a);
  // Modulo positivo (JS % può essere negativo).
  d = ((d % 24) + 24) % 24;
  if (d > 12) d -= 24;
  return roundH(d);
}

/**
 * @param {object} night
 * @param {'wakeTime'|'hours'|'bedtime'} field
 * @param {{
 *   acceptCalculatedBedtime?: boolean,
 *   acceptAmbiguousBedtime?: boolean,
 * }} [opts]
 */
function nightNumeric(night, field, opts = {}) {
  const m = night?.[field];
  if (!m || m.value == null || !Number.isFinite(Number(m.value))) return null;
  if (m.provenance === FOCUS_PROVENANCE.missing) return null;
  if (field === 'bedtime') {
    if (m.provenance === FOCUS_PROVENANCE.calculated && !opts.acceptCalculatedBedtime) {
      return null;
    }
    if (m.provenance === FOCUS_PROVENANCE.ambiguous && opts.acceptAmbiguousBedtime === false) {
      return null;
    }
  }
  return Number(m.value);
}

/**
 * @param {object[]} nights
 * @param {'weekday'|'weekend'|null} segment
 * @param {'wakeTime'|'hours'|'bedtime'} field
 * @param {object} [opts]
 */
function collectValues(nights, segment, field, opts) {
  return nights
    .filter((n) => n.available && (!segment || n.segment === segment))
    .map((n) => nightNumeric(n, field, opts))
    .filter((v) => v != null);
}

/**
 * @param {object} thresholds
 * @param {number} weekdayN
 * @param {number} weekendN
 * @param {number} windowDays
 */
function weekdayWeekendReliability(thresholds, weekdayN, weekendN, windowDays) {
  const reasons = [];
  if (weekdayN < thresholds.minWeekdayWakeNights) {
    reasons.push(`weekday_wake_nights_${weekdayN}_lt_${thresholds.minWeekdayWakeNights}`);
  }
  if (weekendN < thresholds.minWeekendWakeNights) {
    reasons.push(`weekend_wake_nights_${weekendN}_lt_${thresholds.minWeekendWakeNights}`);
  }
  if (windowDays < thresholds.preferredWindowDaysMin) {
    reasons.push(`window_days_${windowDays}_lt_${thresholds.preferredWindowDaysMin}`);
  }
  if (reasons.length > 0) {
    return {
      status: SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
      reasons,
    };
  }
  return {
    status: SLEEP_ROUTINE_RELIABILITY.reliable,
    reasons: [],
  };
}

/**
 * @param {{
 *   nights: object[],
 *   windowDays?: number,
 *   fromDate?: string|null,
 *   toDate?: string|null,
 *   thresholds?: object|null,
 *   acceptCalculatedBedtime?: boolean,
 * }} input
 */
/**
 * @param {object[]} nights
 * @param {object} bedOpts
 */
function buildSegmentStats(nights, bedOpts) {
  const wakeWeekday = linearHourStats(collectValues(nights, 'weekday', 'wakeTime'));
  const wakeWeekend = linearHourStats(collectValues(nights, 'weekend', 'wakeTime'));
  const wakeAll = linearHourStats(collectValues(nights, null, 'wakeTime'));
  const durationWeekday = linearHourStats(collectValues(nights, 'weekday', 'hours'));
  const durationWeekend = linearHourStats(collectValues(nights, 'weekend', 'hours'));
  const durationAll = linearHourStats(collectValues(nights, null, 'hours'));
  const bedtimeWeekday = bedtimeHourStats(collectValues(nights, 'weekday', 'bedtime', bedOpts));
  const bedtimeWeekend = bedtimeHourStats(collectValues(nights, 'weekend', 'bedtime', bedOpts));
  const bedtimeAll = bedtimeHourStats(collectValues(nights, null, 'bedtime', bedOpts));
  return {
    wake: {
      weekday: wakeWeekday,
      weekend: wakeWeekend,
      all: wakeAll,
      deltaWeekendMinusWeekdayH: (wakeWeekday.median != null && wakeWeekend.median != null)
        ? roundH(wakeWeekend.median - wakeWeekday.median)
        : null,
    },
    duration: {
      weekday: durationWeekday,
      weekend: durationWeekend,
      all: durationAll,
      deltaWeekendMinusWeekdayH: (
        durationWeekday.median != null && durationWeekend.median != null
      )
        ? roundH(durationWeekend.median - durationWeekday.median)
        : null,
      interpretationNote: 'Descriptive only — not sleep debt or recovery.',
    },
    bedtime: {
      weekday: stripLinear(bedtimeWeekday),
      weekend: stripLinear(bedtimeWeekend),
      all: stripLinear(bedtimeAll),
      deltaWeekendMinusWeekdayH: circularHourDelta(
        bedtimeWeekday.median,
        bedtimeWeekend.median,
      ),
    },
    regularity: {
      wakeWeekdayIqrH: wakeWeekday.iqr,
      wakeAllIqrH: wakeAll.iqr,
      bedtimeAllIqrH: bedtimeAll.iqr,
    },
  };
}

/**
 * @param {{
 *   nights: object[],
 *   windowDays?: number,
 *   fromDate?: string|null,
 *   toDate?: string|null,
 *   thresholds?: object|null,
 *   acceptCalculatedBedtime?: boolean,
 *   acceptAmbiguousBedtime?: boolean,
 * }} input
 */
export function aggregateSleepRoutine(input) {
  const thresholds = resolveSleepRoutineThresholds(input.thresholds);
  const nights = Array.isArray(input.nights) ? input.nights : [];
  const fromDate = input.fromDate || (nights[0]?.nightEndedOn ?? null);
  const toDate = input.toDate || (nights[nights.length - 1]?.nightEndedOn ?? null);
  const windowDays = Number.isFinite(input.windowDays)
    ? Number(input.windowDays)
    : nights.length;
  const acceptCalculatedBedtime = input.acceptCalculatedBedtime !== false;
  const acceptAmbiguousBedtime = input.acceptAmbiguousBedtime !== false;
  const bedOpts = { acceptCalculatedBedtime, acceptAmbiguousBedtime };

  const logged = nights.filter((n) => n.available);
  // Se timingClass assente (serie legacy), tratta come ordinary.
  const ordinaryForClaims = nights.filter((n) => {
    if (!n.available) return false;
    if (n.timingClass == null && n.timing == null) return true;
    return n.timingClass === 'ordinary' || n.timing?.useInStrongRegularity === true;
  });
  const unusualN = logged.filter((n) => n.timingClass === 'unusual').length;
  const ambiguousTimingN = logged.filter((n) => n.timingClass === 'ambiguous').length;
  const anomalyN = unusualN + ambiguousTimingN;
  const anomalyFraction = logged.length > 0
    ? Math.round((anomalyN / logged.length) * 1000) / 1000
    : 0;

  const allStats = buildSegmentStats(nights, bedOpts);
  const ordinaryStats = buildSegmentStats(ordinaryForClaims, bedOpts);

  const weekdayNights = logged.filter((n) => n.segment === 'weekday');
  const weekendNights = logged.filter((n) => n.segment === 'weekend');

  const wwRelAll = weekdayWeekendReliability(
    thresholds,
    allStats.wake.weekday.n,
    allStats.wake.weekend.n,
    windowDays,
  );
  const wwRelOrdinary = weekdayWeekendReliability(
    {
      ...thresholds,
      minWeekdayWakeNights: thresholds.minOrdinaryWeekdayWakeNights,
      minWeekendWakeNights: thresholds.minOrdinaryWeekendWakeNights,
    },
    ordinaryStats.wake.weekday.n,
    ordinaryStats.wake.weekend.n,
    windowDays,
  );

  /** Confronti forti usano ordinary; anomalie elevate → insufficient. */
  let wwRel = { ...wwRelOrdinary };
  if (anomalyFraction > thresholds.maxAnomalyFractionForStrongClaims) {
    wwRel = {
      status: SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
      reasons: [
        ...wwRel.reasons,
        `anomaly_fraction_${anomalyFraction}_gt_${thresholds.maxAnomalyFractionForStrongClaims}`,
      ],
    };
  }

  const dispersionRel = ordinaryStats.wake.weekday.n >= thresholds.minNightsForDispersion
    && anomalyFraction <= thresholds.maxAnomalyFractionForStrongClaims
    ? {
      status: SLEEP_ROUTINE_RELIABILITY.reliable,
      reasons: [],
    }
    : {
      status: SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
      reasons: [
        ordinaryStats.wake.weekday.n < thresholds.minNightsForDispersion
          ? `ordinary_weekday_wake_nights_${ordinaryStats.wake.weekday.n}_lt_${thresholds.minNightsForDispersion}`
          : `anomaly_fraction_${anomalyFraction}_gt_${thresholds.maxAnomalyFractionForStrongClaims}`,
      ],
    };

  const bedtimeRecordedN = nights.filter(
    (n) => n.bedtime?.provenance === FOCUS_PROVENANCE.recorded && n.bedtime?.value != null,
  ).length;
  const bedtimeCalculatedN = nights.filter(
    (n) => n.bedtime?.provenance === FOCUS_PROVENANCE.calculated && n.bedtime?.value != null,
  ).length;
  const bedtimeAmbiguousN = nights.filter(
    (n) => n.bedtime?.provenance === FOCUS_PROVENANCE.ambiguous && n.bedtime?.value != null,
  ).length;

  const shift = computeBedtimeAndRegularityShift(ordinaryForClaims, thresholds, bedOpts);

  const coverage = {
    windowDays,
    fromDate,
    toDate,
    calendarNights: nights.length,
    nightsLogged: logged.length,
    nightsMissing: nights.length - logged.length,
    weekdayNightsLogged: weekdayNights.length,
    weekendNightsLogged: weekendNights.length,
    ordinaryNightsLogged: ordinaryForClaims.length,
    unusualNights: unusualN,
    ambiguousTimingNights: ambiguousTimingN,
    anomalyFraction,
    wakeWeekdayN: allStats.wake.weekday.n,
    wakeWeekendN: allStats.wake.weekend.n,
    ordinaryWakeWeekdayN: ordinaryStats.wake.weekday.n,
    ordinaryWakeWeekendN: ordinaryStats.wake.weekend.n,
    bedtimeRecordedN,
    bedtimeCalculatedN,
    bedtimeAmbiguousN,
    coverageRatio: nights.length > 0
      ? Math.round((logged.length / nights.length) * 1000) / 1000
      : 0,
  };

  return {
    convention: {
      segmentBy: 'wake_morning_nightEndedOn',
      weekday: 'lun-ven',
      weekend: 'sab-dom',
      note: 'Notte conclusa il giorno della sveglia; non confondere notte del venerdì con risveglio del venerdì.',
      strongClaimsUse: 'ordinary_timing_nights_only',
    },
    thresholds: { ...thresholds },
    coverage,
    /** Aggregati su tutte le notti (inclusi orari unusual conservati). */
    wake: allStats.wake,
    duration: allStats.duration,
    bedtime: {
      ...allStats.bedtime,
      acceptCalculatedBedtime,
      acceptAmbiguousBedtime,
    },
    regularity: allStats.regularity,
    /** Aggregati esclusi unusual/ambiguous — per regolarità e confronti forti. */
    ordinary: {
      wake: ordinaryStats.wake,
      duration: ordinaryStats.duration,
      bedtime: {
        ...ordinaryStats.bedtime,
        acceptCalculatedBedtime,
        acceptAmbiguousBedtime,
      },
      regularity: ordinaryStats.regularity,
      nightsUsed: ordinaryForClaims.length,
    },
    anomalies: {
      unusualNights: unusualN,
      ambiguousTimingNights: ambiguousTimingN,
      anomalyFraction,
      retainedInSeries: true,
      note: 'Registrazioni atipiche conservate; escluse dai confronti forti di regolarità.',
    },
    shift,
    reliability: {
      weekdayWeekendCompare: wwRel,
      weekdayWeekendCompareAll: wwRelAll,
      wakeDispersion: dispersionRel,
      bedtimeShift: shift.bedtimeReliability,
      regularityChange: shift.regularityReliability,
    },
  };
}

/** @param {object} stats */
function stripLinear(stats) {
  const { _linearMedian, ...rest } = stats;
  return rest;
}

/**
 * @param {object[]} nights
 * @param {object} thresholds
 * @param {object} bedOpts
 */
function computeBedtimeAndRegularityShift(nights, thresholds, bedOpts) {
  const logged = nights.filter((n) => n.available);
  const recentDays = thresholds.recentShiftWindowDays;
  const recent = logged.slice(-recentDays);
  const previous = logged.slice(Math.max(0, logged.length - recentDays * 2), -recentDays);

  const recentBed = bedtimeHourStats(
    recent.map((n) => nightNumeric(n, 'bedtime', bedOpts)).filter((v) => v != null),
  );
  const prevBed = bedtimeHourStats(
    previous.map((n) => nightNumeric(n, 'bedtime', bedOpts)).filter((v) => v != null),
  );

  const bedtimeDeltaH = (recentBed._linearMedian != null && prevBed._linearMedian != null)
    ? roundH(recentBed._linearMedian - prevBed._linearMedian)
    : null;

  const bedtimeOk = recentBed.n >= thresholds.minNightsForBedtimeShift
    && prevBed.n >= thresholds.minNightsForBedtimeShift;

  const recentWakeWd = linearHourStats(
    recent.filter((n) => n.segment === 'weekday')
      .map((n) => nightNumeric(n, 'wakeTime'))
      .filter((v) => v != null),
  );
  const prevWakeWd = linearHourStats(
    previous.filter((n) => n.segment === 'weekday')
      .map((n) => nightNumeric(n, 'wakeTime'))
      .filter((v) => v != null),
  );
  const iqrDeltaH = (recentWakeWd.iqr != null && prevWakeWd.iqr != null)
    ? roundH(recentWakeWd.iqr - prevWakeWd.iqr)
    : null;
  const regularityOk = recentWakeWd.n >= thresholds.minNightsForDispersion
    && prevWakeWd.n >= thresholds.minNightsForDispersion;

  return {
    recentWindowNights: recent.length,
    previousWindowNights: previous.length,
    bedtimeRecentMedian: recentBed.median,
    bedtimePreviousMedian: prevBed.median,
    bedtimeShiftH: bedtimeDeltaH,
    wakeWeekdayIqrRecentH: recentWakeWd.iqr,
    wakeWeekdayIqrPreviousH: prevWakeWd.iqr,
    wakeWeekdayIqrDeltaH: iqrDeltaH,
    bedtimeReliability: bedtimeOk
      ? { status: SLEEP_ROUTINE_RELIABILITY.reliable, reasons: [] }
      : {
        status: SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
        reasons: [
          `recent_bedtime_n_${recentBed.n}_prev_${prevBed.n}_need_${thresholds.minNightsForBedtimeShift}`,
        ],
      },
    regularityReliability: regularityOk
      ? { status: SLEEP_ROUTINE_RELIABILITY.reliable, reasons: [] }
      : {
        status: SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
        reasons: [
          `recent_weekday_wake_n_${recentWakeWd.n}_prev_${prevWakeWd.n}_need_${thresholds.minNightsForDispersion}`,
        ],
      },
  };
}
