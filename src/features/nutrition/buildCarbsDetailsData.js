import { computeTotali, DEFAULT_TARGETS, MEAL_ORDER, TARGETS } from '../../useBiochimico';

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

const SUGAR_KEYS = ['zuccheri', 'sugars', 'sugar'];

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
 * @param {number} value
 * @returns {number}
 */
function round1(value) {
  return Math.round(safeNum(value) * 10) / 10;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number}
 */
function readItemCarbGrams(item) {
  return safeNum(item.carb ?? item.carboidrati);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number}
 */
function readItemSugarGrams(item) {
  for (const key of SUGAR_KEYS) {
    if (item[key] == null || item[key] === '') continue;
    return safeNum(item[key]);
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number}
 */
function readItemFibreGrams(item) {
  return safeNum(item.fibre ?? item.fiber ?? item.fibreTotali);
}

/**
 * @param {Array<Record<string, unknown>>} log
 * @returns {{ carb: number, sugars: number, fibre: number }}
 */
function sumCarbFractionsFromLog(log) {
  let carb = 0;
  let sugars = 0;
  let fibre = 0;

  (log || []).forEach((item) => {
    if (item?.type !== 'food' && item?.type !== 'recipe') return;
    carb += readItemCarbGrams(item);
    sugars += readItemSugarGrams(item);
    fibre += readItemFibreGrams(item);
  });

  return { carb, sugars, fibre };
}

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @returns {number}
 */
function resolveCarbTarget(userTargets) {
  const fromUser = safeNum(userTargets?.carb);
  if (fromUser > 0) return fromUser;
  return safeNum(DEFAULT_TARGETS.carb ?? TARGETS.macro.carb) || 200;
}

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @param {number} carbTarget
 * @returns {{ sugars: number, fibre: number, starches: number }}
 */
function resolveFractionTargets(userTargets, carbTarget) {
  const sugarsTarget =
    safeNum(userTargets?.zuccheri ?? userTargets?.sugars ?? userTargets?.sugar) ||
    round1(carbTarget * 0.1);
  const fibreTarget =
    safeNum(userTargets?.fibre ?? userTargets?.fiber) ||
    safeNum(DEFAULT_TARGETS.fibre ?? TARGETS.macro.fibre) ||
    30;
  const starchesTarget = Math.max(0, round1(carbTarget - sugarsTarget - fibreTarget));

  return { sugars: sugarsTarget, fibre: fibreTarget, starches: starchesTarget };
}

/**
 * @param {Array<Record<string, unknown>>} dailyLog
 * @returns {Record<string, number>}
 */
function aggregateCarbsByMealBucket(dailyLog) {
  /** @type {Record<string, number>} */
  const byMeal = {};
  MEAL_ORDER.forEach((meal) => {
    byMeal[meal] = 0;
  });

  (dailyLog || []).forEach((item) => {
    if (item?.type !== 'food' && item?.type !== 'recipe') return;
    const bucket = bucketMealType(item.mealType);
    byMeal[bucket] = (byMeal[bucket] || 0) + readItemCarbGrams(item);
  });

  return byMeal;
}

/**
 * @param {Record<string, number>} byMeal
 * @param {number} totalCarbs
 * @returns {Array<{ label: string, pct: number, color: string, grams: number }>}
 */
function buildMealDistribution(byMeal, totalCarbs) {
  const entries = MEAL_ORDER.map((key) => {
    const grams = round1(byMeal[key] || 0);
    const meta = MEAL_BUCKET_META[key];
    return { label: meta.label, color: meta.color, grams, pct: 0 };
  }).filter((entry) => entry.grams > 0);

  if (totalCarbs <= 0 || entries.length === 0) {
    return MEAL_ORDER.map((key) => ({
      label: MEAL_BUCKET_META[key].label,
      color: MEAL_BUCKET_META[key].color,
      grams: 0,
      pct: 0,
    }));
  }

  return entries.map((entry) => ({
    ...entry,
    pct: Math.round((entry.grams / totalCarbs) * 100),
  }));
}

/**
 * Costruisce il payload per CarbsDetailsSheet dal diario odierno.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @param {Record<string, unknown> | null | undefined} userTargets
 */
export function buildCarbsDetailsData(dailyLog, userTargets) {
  const log = dailyLog || [];
  const totali = computeTotali(log);
  const logFractions = sumCarbFractionsFromLog(log);

  let carbTotal = safeNum(totali.carb);
  if (carbTotal <= 0) carbTotal = logFractions.carb;

  const sugarsTotal = logFractions.sugars;
  let fibreTotal = safeNum(totali.fibre);
  if (fibreTotal <= 0) fibreTotal = logFractions.fibre;

  const starchesTotal = Math.max(0, round1(carbTotal - sugarsTotal - fibreTotal));
  const netCarbs = Math.max(0, round1(carbTotal - fibreTotal));
  const fiberCarbRatio = carbTotal > 0 ? round1(fibreTotal / carbTotal) : 0;

  const carbTarget = resolveCarbTarget(userTargets);
  const fractionTargets = resolveFractionTargets(userTargets, carbTarget);

  const byMeal = aggregateCarbsByMealBucket(log);
  const meals = buildMealDistribution(byMeal, carbTotal);

  return {
    total: { current: round1(carbTotal), target: round1(carbTarget) },
    sugars: { current: round1(sugarsTotal), target: round1(fractionTargets.sugars) },
    starches: { current: starchesTotal, target: round1(fractionTargets.starches) },
    fibre: { current: round1(fibreTotal), target: round1(fractionTargets.fibre) },
    netCarbs,
    fiberCarbRatio,
    meals,
  };
}

export const EMPTY_CARBS_DETAILS_DATA = buildCarbsDetailsData([], null);
