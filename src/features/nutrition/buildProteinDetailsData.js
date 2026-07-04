import {
  computeTotali,
  DEFAULT_TARGETS,
  getTargetForNutrient,
  MEAL_ORDER,
  TARGETS,
} from '../../useBiochimico';
import { readItemProteinGrams } from './calculateProteinReliability';

const BCAA_KEYS = ['leu', 'iso', 'val'];
const EAA_KEYS = Object.keys(TARGETS.amino);

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

function bucketMealType(mealType) {
  const base = String(mealType || '').split('_')[0];
  return LEGACY_MEAL_TO_BUCKET[base] || (MEAL_ORDER.includes(base) ? base : 'pranzo');
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value) {
  return Math.round(safeNum(value) * 10) / 10;
}

function resolveProteinTarget(userTargets) {
  const fromUser = safeNum(userTargets?.prot);
  if (fromUser > 0) return fromUser;
  return safeNum(DEFAULT_TARGETS.prot ?? TARGETS.macro.prot) || 150;
}

function resolveLeucineTargetMg(userTargets, proteinTargetG) {
  const custom = safeNum(userTargets?.leu);
  if (custom > 0) return custom;
  const fromSystem = safeNum(getTargetForNutrient('leu'));
  if (fromSystem > 0) return fromSystem;
  return Math.round(proteinTargetG * 80);
}

function resolveBcaaTargetMg(userTargets, proteinTargetG) {
  const fromKeys = BCAA_KEYS.reduce(
    (sum, key) => sum + (safeNum(userTargets?.[key]) || safeNum(getTargetForNutrient(key))),
    0,
  );
  if (fromKeys > 0) return fromKeys;
  const systemSum = BCAA_KEYS.reduce((sum, key) => sum + safeNum(TARGETS.amino[key]), 0);
  if (systemSum > 0) return systemSum;
  return Math.round(proteinTargetG * 200);
}

function resolveEaaTargetMg(userTargets, proteinTargetG) {
  const fromKeys = EAA_KEYS.reduce(
    (sum, key) => sum + (safeNum(userTargets?.[key]) || safeNum(getTargetForNutrient(key))),
    0,
  );
  if (fromKeys > 0) return fromKeys;
  const systemSum = EAA_KEYS.reduce((sum, key) => sum + safeNum(TARGETS.amino[key]), 0);
  if (systemSum > 0) return systemSum;
  return Math.round(proteinTargetG * 450);
}

function sumAminoKeysMg(totali, keys) {
  return keys.reduce((sum, key) => sum + safeNum(totali[key]), 0);
}

function aggregateProteinByMealBucket(dailyLog) {
  const byMeal = {};
  MEAL_ORDER.forEach((meal) => {
    byMeal[meal] = 0;
  });

  (dailyLog || []).forEach((item) => {
    if (item?.type !== 'food' && item?.type !== 'recipe') return;
    const bucket = bucketMealType(item.mealType);
    byMeal[bucket] = (byMeal[bucket] || 0) + readItemProteinGrams(item);
  });

  return byMeal;
}

function buildMealDistribution(byMeal, totalProtein) {
  const entries = MEAL_ORDER.map((key) => {
    const grams = round1(byMeal[key] || 0);
    const meta = MEAL_BUCKET_META[key];
    return { label: meta.label, color: meta.color, grams, pct: 0 };
  }).filter((entry) => entry.grams > 0);

  if (totalProtein <= 0 || entries.length === 0) {
    return MEAL_ORDER.map((key) => ({
      label: MEAL_BUCKET_META[key].label,
      color: MEAL_BUCKET_META[key].color,
      grams: 0,
      pct: 0,
    }));
  }

  return entries.map((entry) => ({
    ...entry,
    pct: Math.round((entry.grams / totalProtein) * 100),
  }));
}

export function buildProteinDetailsData(dailyLog, userTargets) {
  const log = dailyLog || [];
  const totali = computeTotali(log);

  let proteinTotal = safeNum(totali.prot);
  if (proteinTotal <= 0) {
    proteinTotal = log.reduce((sum, item) => {
      if (item?.type !== 'food' && item?.type !== 'recipe') return sum;
      return sum + readItemProteinGrams(item);
    }, 0);
  }

  const proteinTarget = resolveProteinTarget(userTargets);
  const leucineCurrent = round1(sumAminoKeysMg(totali, ['leu']));
  const bcaaCurrent = round1(sumAminoKeysMg(totali, BCAA_KEYS));
  const eaaCurrent = round1(sumAminoKeysMg(totali, EAA_KEYS));

  const byMeal = aggregateProteinByMealBucket(log);
  const meals = buildMealDistribution(byMeal, proteinTotal);

  return {
    total: { current: round1(proteinTotal), target: round1(proteinTarget) },
    leucine: {
      current: leucineCurrent,
      target: round1(resolveLeucineTargetMg(userTargets, proteinTarget)),
    },
    bcaa: {
      current: bcaaCurrent,
      target: round1(resolveBcaaTargetMg(userTargets, proteinTarget)),
    },
    eaa: {
      current: eaaCurrent,
      target: round1(resolveEaaTargetMg(userTargets, proteinTarget)),
    },
    meals,
  };
}

export const EMPTY_PROTEIN_DETAILS_DATA = buildProteinDetailsData([], null);
