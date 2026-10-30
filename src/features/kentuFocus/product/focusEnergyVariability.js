/**
 * Variabilità energetiva sui giorni recenti (media ≠ regolarità).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { buildFocusCompassDailyHistoryFromDiary } from './buildFocusCompassSignalsForDossier.js';

export const ENERGY_IRREGULAR_PCT = 0.15;
export const ENERGY_IRREGULAR_MIN_OUTLIER_DAYS = 3;
export const ENERGY_IRREGULAR_WINDOW_DAYS = 7;

/**
 * @param {number[]} values
 * @returns {number|null}
 */
export function populationStdev(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return nums.length === 1 ? 0 : null;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * @param {number[]} intakes
 * @param {number|null|undefined} targetKcal
 * @returns {object}
 */
export function computeEnergyIntakeVariability(intakes, targetKcal) {
  const values = (intakes || [])
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const target = Number(targetKcal);
  const hasTarget = Number.isFinite(target) && target > 0;
  const band = hasTarget ? target * ENERGY_IRREGULAR_PCT : null;

  let minIntakeKcal = null;
  let maxIntakeKcal = null;
  let meanIntakeKcal = null;
  let stdevKcal = null;
  let daysAboveBand = 0;
  let daysBelowBand = 0;

  if (values.length > 0) {
    minIntakeKcal = Math.min(...values);
    maxIntakeKcal = Math.max(...values);
    meanIntakeKcal = Math.round(values.reduce((s, n) => s + n, 0) / values.length);
    stdevKcal = populationStdev(values);
  }

  if (hasTarget && band != null) {
    const lo = target - band;
    const hi = target + band;
    for (const v of values) {
      if (v > hi) daysAboveBand += 1;
      else if (v < lo) daysBelowBand += 1;
    }
  }

  const daysBeyondBand = daysAboveBand + daysBelowBand;
  const stdevOverThreshold = hasTarget
    && stdevKcal != null
    && stdevKcal > target * ENERGY_IRREGULAR_PCT;
  const outliersOverThreshold = daysBeyondBand >= ENERGY_IRREGULAR_MIN_OUTLIER_DAYS;
  const irregular = Boolean(
    values.length >= 2
    && hasTarget
    && (outliersOverThreshold || stdevOverThreshold),
  );

  return {
    recordedDays: values.length,
    intakesKcal: values,
    minIntakeKcal,
    maxIntakeKcal,
    meanIntakeKcal,
    stdevKcal,
    targetKcal: hasTarget ? target : null,
    bandPct: ENERGY_IRREGULAR_PCT,
    daysAboveBand,
    daysBelowBand,
    daysBeyondBand,
    irregular,
    irregularReason: irregular
      ? (outliersOverThreshold && stdevOverThreshold
        ? 'outliers_and_stdev'
        : outliersOverThreshold
          ? 'outliers_ge_3'
          : 'stdev_over_15pct_target')
      : null,
  };
}

/**
 * Raccoglie introiti kcal sui giorni di calendario della finestra.
 * @param {{
 *   fullHistory: object,
 *   analysisDate: string,
 *   targetKcal?: number|null,
 *   periodId?: string,
 *   calendarDays?: number,
 *   excludeAnalysisDay?: boolean,
 * }} input
 * @returns {{ dates: string[], intakesKcal: number[], rows: object[] }}
 */
export function collectRecentEnergyIntakes(input) {
  const fullHistory = input?.fullHistory;
  const analysisDate = String(input?.analysisDate || '').trim();
  const target = input?.targetKcal;
  const periodId = String(input?.periodId || 'ieri').toLowerCase();
  const calendarDays = Math.max(
    1,
    Number(input?.calendarDays) || ENERGY_IRREGULAR_WINDOW_DAYS,
  );

  if (!fullHistory || !isIsoDateString(analysisDate)) {
    return { dates: [], intakesKcal: [], rows: [] };
  }

  // Ieri: 7 giorni PRIMA del giorno analisi (escluso). Settimana/mese: ultimi N inclusivi.
  const excludeAnalysisDay = input?.excludeAnalysisDay != null
    ? Boolean(input.excludeAnalysisDay)
    : periodId === 'ieri';
  const history = buildFocusCompassDailyHistoryFromDiary(
    fullHistory,
    analysisDate,
    target,
    Math.max(14, calendarDays + 2),
  );

  const minDate = excludeAnalysisDay
    ? addCalendarDays(analysisDate, -calendarDays)
    : addCalendarDays(analysisDate, -(calendarDays - 1));

  const rows = history.filter((d) => {
    if (!d || d.skipEnergyAverage || !Number.isFinite(Number(d.intakeKcal))) return false;
    if (excludeAnalysisDay && d.date === analysisDate) return false;
    return d.date >= minDate && d.date <= (excludeAnalysisDay
      ? addCalendarDays(analysisDate, -1)
      : analysisDate);
  });

  return {
    dates: rows.map((d) => d.date),
    intakesKcal: rows.map((d) => Math.round(Number(d.intakeKcal))),
    rows,
  };
}

/**
 * @param {{
 *   fullHistory?: object|null,
 *   analysisDate?: string,
 *   targetKcal?: number|null,
 *   periodId?: string,
 *   calendarDays?: number,
 *   excludeAnalysisDay?: boolean,
 *   intakesKcal?: number[]|null,
 * }} input
 */
export function assessEnergyIrregularity(input = {}) {
  let intakes = Array.isArray(input.intakesKcal) ? input.intakesKcal : null;
  let dates = [];
  if (!intakes) {
    const collected = collectRecentEnergyIntakes(input);
    intakes = collected.intakesKcal;
    dates = collected.dates;
  }
  const variability = computeEnergyIntakeVariability(intakes, input.targetKcal);
  return {
    ...variability,
    dates,
    windowDays: Number(input.calendarDays) || ENERGY_IRREGULAR_WINDOW_DAYS,
  };
}

/**
 * Sottotitolo card: escursione arrotondata alle centinaia.
 * @param {object|null|undefined} variability
 * @returns {string|null}
 */
export function formatEnergyExcursionSubtitle(variability) {
  const min = Number(variability?.minIntakeKcal);
  const max = Number(variability?.maxIntakeKcal);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lo = Math.round(min / 100) * 100;
  const hi = Math.round(max / 100) * 100;
  if (lo === hi) return `giorni intorno a ${lo} kcal`;
  return `giorni tra ${lo} e ${hi} kcal`;
}
