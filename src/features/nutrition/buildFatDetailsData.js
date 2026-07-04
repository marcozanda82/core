import { computeTotali, DEFAULT_TARGETS, getTargetForNutrient, MEAL_ORDER, TARGETS } from '../../useBiochimico';

const LEGACY_MEAL_TO_BUCKET = {
  merenda1: 'colazione',
  colazione: 'colazione',
  snack: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  spuntino: 'snack',
  pranzo: 'pranzo',
  cena: 'cena',
};

const MEAL_BUCKET_META = {
  colazione: { label: 'Colazione', color: '#fde047' },
  snack: { label: 'Spuntini', color: '#22d3ee' },
  pranzo: { label: 'Pranzo', color: '#f97316' },
  cena: { label: 'Cena', color: '#818cf8' },
};

/**
 * @param {string | null | undefined} mealType
 * @returns {string}
 */
function bucketMealType(mealType) {
  const base = String(mealType || '').split('_')[0];
  return LEGACY_MEAL_TO_BUCKET[base] || (MEAL_ORDER.includes(base) ? base : 'pranzo');
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number}
 */
function readItemFatGrams(item) {
  return safeNum(item.fatTotal ?? item.fatTot ?? item.fat ?? item.grassi);
}

/**
 * @param {number} value
 * @returns {number}
 */
function round1(value) {
  return Math.round(safeNum(value) * 10) / 10;
}

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @returns {number}
 */
function resolveFatTarget(userTargets) {
  const fromUser = safeNum(userTargets?.fatTotal ?? userTargets?.fat);
  if (fromUser > 0) return fromUser;
  return safeNum(DEFAULT_TARGETS.fatTotal ?? TARGETS.macro.fatTotal) || 60;
}

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @param {number} fatTarget
 * @returns {{ fatSat: number, fatTrans: number, fatMono: number, fatPoly: number }}
 */
function resolveFractionTargets(userTargets, fatTarget) {
  const fatSat = safeNum(userTargets?.fatSat) || safeNum(getTargetForNutrient('fatSat')) || round1(fatTarget / 3);
  const fatTrans = safeNum(userTargets?.fatTrans) || safeNum(getTargetForNutrient('fatTrans')) || 2;
  const unsaturatedPool = Math.max(0, fatTarget - fatSat);
  const fatMono =
    safeNum(userTargets?.fatMono) ||
    safeNum(getTargetForNutrient('fatMono')) ||
    round1(unsaturatedPool * 0.55);
  const fatPoly =
    safeNum(userTargets?.fatPoly) ||
    safeNum(getTargetForNutrient('fatPoly')) ||
    round1(unsaturatedPool * 0.45);

  return { fatSat, fatTrans, fatMono, fatPoly };
}

/**
 * @param {Array<Record<string, unknown>>} dailyLog
 * @returns {Record<string, number>}
 */
function aggregateFatByMealBucket(dailyLog) {
  /** @type {Record<string, number>} */
  const byMeal = {};
  MEAL_ORDER.forEach((meal) => {
    byMeal[meal] = 0;
  });

  (dailyLog || []).forEach((item) => {
    if (item?.type !== 'food' && item?.type !== 'recipe') return;
    const bucket = bucketMealType(item.mealType);
    byMeal[bucket] = (byMeal[bucket] || 0) + readItemFatGrams(item);
  });

  return byMeal;
}

/**
 * @param {Record<string, number>} byMeal
 * @param {number} totalFat
 * @returns {Array<{ label: string, pct: number, color: string, grams: number }>}
 */
function buildMealDistribution(byMeal, totalFat) {
  const entries = MEAL_ORDER.map((key) => {
    const grams = round1(byMeal[key] || 0);
    const meta = MEAL_BUCKET_META[key];
    return {
      label: meta.label,
      color: meta.color,
      grams,
      pct: 0,
    };
  }).filter((entry) => entry.grams > 0);

  if (totalFat <= 0 || entries.length === 0) {
    return MEAL_ORDER.map((key) => ({
      label: MEAL_BUCKET_META[key].label,
      color: MEAL_BUCKET_META[key].color,
      grams: 0,
      pct: 0,
    }));
  }

  return entries.map((entry) => ({
    ...entry,
    pct: Math.round((entry.grams / totalFat) * 100),
  }));
}

/**
 * Costruisce il payload per FatDetailsSheet dal diario odierno.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @returns {{
 *   total: { current: number, target: number },
 *   saturated: { current: number, target: number },
 *   trans: { current: number, target: number },
 *   monounsaturated: { current: number, target: number },
 *   polyunsaturated: { current: number, target: number },
 *   omega3: number,
 *   omega6: number,
 *   meals: Array<{ label: string, pct: number, color: string, grams: number }>,
 * }}
 */
export function buildFatDetailsData(dailyLog, userTargets) {
  const log = dailyLog || [];
  const totali = computeTotali(log);

  let fatTotalCurrent = safeNum(totali.fatTotal);
  if (fatTotalCurrent <= 0) {
    fatTotalCurrent = log.reduce((sum, item) => {
      if (item?.type !== 'food' && item?.type !== 'recipe') return sum;
      return sum + readItemFatGrams(item);
    }, 0);
  }

  const fatTarget = resolveFatTarget(userTargets);
  const fractionTargets = resolveFractionTargets(userTargets, fatTarget);

  const saturatedCurrent = round1(totali.fatSat);
  const transCurrent = round1(totali.fatTrans);
  const monoCurrent = round1(totali.fatMono);
  const polyCurrent = round1(totali.fatPoly);
  const omega3Current = round1(totali.omega3);
  const omega6Current = round1(totali.omega6);

  const byMeal = aggregateFatByMealBucket(log);
  const meals = buildMealDistribution(byMeal, fatTotalCurrent);

  return {
    total: { current: round1(fatTotalCurrent), target: round1(fatTarget) },
    saturated: { current: saturatedCurrent, target: round1(fractionTargets.fatSat) },
    trans: { current: transCurrent, target: round1(fractionTargets.fatTrans) },
    monounsaturated: { current: monoCurrent, target: round1(fractionTargets.fatMono) },
    polyunsaturated: { current: polyCurrent, target: round1(fractionTargets.fatPoly) },
    omega3: omega3Current,
    omega6: omega6Current,
    meals,
  };
}

export const EMPTY_FAT_DETAILS_DATA = buildFatDetailsData([], null);
