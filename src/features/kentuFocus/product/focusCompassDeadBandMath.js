/**
 * Formule dead-band / vettore allineate a metabolicDirectionEngine.js
 * (estratte senza React/coreEngine per riuso Node + Vite).
 * Non copia il quadrante né lo score.
 */

const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

const METABOLIC_ENERGY_DEADBAND_MIN_KCAL = 75;
const METABOLIC_ENERGY_DEADBAND_TDEE_FRAC = 0.04;
const METABOLIC_ENERGY_DEADBAND_MAX_KCAL = 125;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} [referenceTdee]
 */
export function computeEnergyDeadBandHalfWidthKcal(referenceTdee = 2000) {
  const tdee = Number(referenceTdee);
  if (!Number.isFinite(tdee) || tdee <= 0) return METABOLIC_ENERGY_DEADBAND_MIN_KCAL;
  const fromPct = Math.abs(tdee) * METABOLIC_ENERGY_DEADBAND_TDEE_FRAC;
  return Math.min(
    METABOLIC_ENERGY_DEADBAND_MAX_KCAL,
    Math.max(METABOLIC_ENERGY_DEADBAND_MIN_KCAL, fromPct),
  );
}

/**
 * @param {number} kcalBalance
 * @param {number} [referenceTdee]
 */
export function applyEnergyDeadBandToKcalBalance(kcalBalance, referenceTdee = 2000) {
  const half = computeEnergyDeadBandHalfWidthKcal(referenceTdee);
  const kb = Number(kcalBalance) || 0;
  if (Math.abs(kb) <= half) {
    return { adjusted: 0, deadBandApplied: true, halfWidthKcal: half };
  }
  return { adjusted: kb, deadBandApplied: false, halfWidthKcal: half };
}

/**
 * @param {Array<{ date?: string }>} days
 * @param {string} [excludeDate] — esclude oggi calendario se noto
 */
function excludeToday(days, excludeDate) {
  if (!excludeDate) return days || [];
  return (days || []).filter((e) => e?.date !== excludeDate);
}

/**
 * @param {Array<object>} days
 * @param {'1d'|'7d'|'14d'|'30d'} timeframe
 * @param {string|null} [excludeDate]
 */
export function getMetabolicDirectionWindowSlice(days, timeframe = '7d', excludeDate = null) {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safeDays = excludeToday(days, excludeDate);
  if (!safeDays.length) return [];
  return safeDays.length <= windowDays ? safeDays : safeDays.slice(-windowDays);
}

/**
 * @param {Array<object>} dailyHistory
 * @param {string} timeframe
 * @param {number} [referenceTdee]
 * @param {string|null} [excludeDate]
 */
export function computeOutsideEnergyDeadbandDayFraction(
  dailyHistory,
  timeframe,
  referenceTdee = 2000,
  excludeDate = null,
) {
  const slice = getMetabolicDirectionWindowSlice(dailyHistory, timeframe, excludeDate)
    .filter((d) => d && Number.isFinite(Number(d.kcalBalance)) && !d.skipEnergyAverage);
  if (!slice.length) return 0;
  const half = computeEnergyDeadBandHalfWidthKcal(referenceTdee);
  let n = 0;
  for (const d of slice) {
    if (Math.abs(Number(d.kcalBalance) || 0) > half) n += 1;
  }
  return n / slice.length;
}

/**
 * @param {{ kcalBalance: number, trainingLoad: number }} day
 * @param {number} [referenceTdee]
 */
function normalizeMetabolicDay(day, referenceTdee = 2000) {
  const { adjusted } = applyEnergyDeadBandToKcalBalance(day.kcalBalance, referenceTdee);
  const x = clamp(adjusted / 500, -1, 1);
  const y = clamp((Number(day.trainingLoad) || 0) / 100, 0, 1);
  return { x, y };
}

/**
 * @param {Array<object>} days
 * @param {string} timeframe
 * @param {number} [referenceTdee]
 * @param {string|null} [excludeDate]
 */
export function computeMetabolicEngineTargetVec(
  days,
  timeframe = '7d',
  referenceTdee = 2000,
  excludeDate = null,
) {
  const windowDays = TIMEFRAME_DAY_WINDOW[timeframe] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safeDays = getMetabolicDirectionWindowSlice(days, timeframe, excludeDate)
    .filter((d) => d && Number.isFinite(Number(d.kcalBalance)) && !d.skipEnergyAverage);
  const slice = safeDays.length <= windowDays ? safeDays : safeDays.slice(-windowDays);
  if (!slice.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const d of slice) {
    const v = normalizeMetabolicDay(d, referenceTdee);
    sx += v.x;
    sy += v.y;
  }
  let x = sx / slice.length;
  let y = sy / slice.length;
  if (x > 0 && y < 0.3) y *= 0.72;
  if (x < 0 && y > 0.8) y *= 0.94;
  return { x, y };
}
