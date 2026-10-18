/**
 * Soglie configurabili per copertura storica per dominio.
 * Nessun giudizio di salute — solo affidabilità campionaria.
 */

/** @typedef {'none'|'empty_window'|'insufficient'|'ok'} FocusCoverageSufficiency */

export const FOCUS_COVERAGE_THRESHOLDS = Object.freeze({
  d7: Object.freeze({
    windowDays: 7,
    thinBelowRatio: 0.5,
    minDaysForTrend: 3,
  }),
  d30: Object.freeze({
    windowDays: 30,
    thinBelowRatio: 0.4,
    minDaysForTrend: 10,
  }),
  d90: Object.freeze({
    windowDays: 90,
    thinBelowRatio: 0.3,
    minDaysForTrend: 20,
    /** d90 disponibile solo se almeno questi giorni sono presenti nell'input. */
    minInputDaysToEnable: 45,
  }),
});

/**
 * @param {number} daysWithData
 * @param {number} windowDays
 * @param {{ thinBelowRatio: number, minDaysForTrend: number }} thresholds
 */
export function evaluateDomainCoverage(daysWithData, windowDays, thresholds) {
  const safeDays = Math.max(0, Number(daysWithData) || 0);
  const safeWindow = Math.max(1, Number(windowDays) || 1);
  const coverageRatio = Math.min(1, safeDays / safeWindow);

  /** @type {FocusCoverageSufficiency} */
  let sufficiency = 'ok';
  if (safeDays === 0) {
    sufficiency = 'none';
  } else if (
    safeDays < thresholds.minDaysForTrend
    || coverageRatio < thresholds.thinBelowRatio
  ) {
    sufficiency = 'insufficient';
  }

  return {
    daysWithData: safeDays,
    windowDays: safeWindow,
    coverageRatio: Math.round(coverageRatio * 1000) / 1000,
    sufficiency,
    trendComparable: sufficiency === 'ok',
  };
}
