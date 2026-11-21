/**
 * Copertura micronutrienti sul diario: distingue "0 perché manca il dato"
 * da "0 perché misurato".
 */

import { TARGETS, readLogItemNutrient } from './computeTotaliCore.js';
import { isUnresolvedMealDraftItem } from './mealDraftStatus.js';
import {
  MIN_NUTRIENT_GRAMS_COVERAGE,
  summarizeNutrientTotalByGrams,
} from './nutrientTotalCoverage.js';

export const HOME_VITAMIN_KEYS = Object.freeze(Object.keys(TARGETS.vit || {}));
export const HOME_MINERAL_KEYS = Object.freeze(['na', 'k', 'ca', 'mg', 'fe', 'zn']);

function isFoodLike(item) {
  if (!item || typeof item !== 'object') return false;
  if (isUnresolvedMealDraftItem(item)) return false;
  const t = String(item.type || 'food').toLowerCase();
  return t === 'food' || t === 'recipe' || !item.type;
}

function foodGrams(item) {
  const n = Number(item?.grams ?? item?.qta ?? item?.weight ?? item?.qty);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasFiniteNutrient(item, key) {
  const direct = item?.[key];
  if (direct != null && Number.isFinite(Number(direct))) return true;
  if (key === 'vitB2' && item?.b2 != null && Number.isFinite(Number(item.b2))) return true;
  if (key === 'vitB6' && item?.b6 != null && Number.isFinite(Number(item.b6))) return true;
  if (key === 'fibre' && (
    (item?.fibreTotali != null && Number.isFinite(Number(item.fibreTotali)))
    || (item?.fiber != null && Number.isFinite(Number(item.fiber)))
  )) return true;
  if (key === 'na' && item?.sale != null && Number.isFinite(Number(item.sale)) && Number(item.sale) > 0) {
    return true;
  }
  return false;
}

/**
 * Totale nutriente a grammi: null se copertura &lt; 70% dei grammi.
 * @param {unknown[]} dailyLog
 * @param {string} key
 */
export function nutrientTotalWithCoverage(dailyLog, key) {
  const foods = (Array.isArray(dailyLog) ? dailyLog : []).filter(isFoodLike);
  return summarizeNutrientTotalByGrams(foods, {
    getGrams: foodGrams,
    getValue: (item) => readLogItemNutrient(item, key),
    minCoverage: MIN_NUTRIENT_GRAMS_COVERAGE,
  });
}

/**
 * @param {unknown[]} dailyLog
 * @param {string[]} keys
 * @param {{ minCoverage?: number }} [opts]
 * @returns {{ complete: boolean, coverage: number, foodCount: number, reportedCount: number }}
 */
export function nutrientKeysCoverage(dailyLog, keys, opts = {}) {
  const minCoverage = Number.isFinite(opts.minCoverage) ? opts.minCoverage : 0.35;
  const foods = (Array.isArray(dailyLog) ? dailyLog : []).filter(isFoodLike);
  const foodCount = foods.length;
  if (foodCount === 0) {
    return { complete: false, coverage: 0, foodCount: 0, reportedCount: 0 };
  }
  let reportedSlots = 0;
  let totalSlots = 0;
  for (const food of foods) {
    for (const key of keys) {
      totalSlots += 1;
      if (hasFiniteNutrient(food, key)) reportedSlots += 1;
    }
  }
  const coverage = totalSlots > 0 ? reportedSlots / totalSlots : 0;
  return {
    complete: coverage >= minCoverage,
    coverage,
    foodCount,
    reportedCount: reportedSlots,
  };
}

export function vitaminsDataComplete(dailyLog) {
  return nutrientKeysCoverage(dailyLog, HOME_VITAMIN_KEYS).complete;
}

export function mineralsDataComplete(dailyLog) {
  // Na/K: non mostrare il rapporto se il sodio ha copertura grammi insufficiente.
  const na = nutrientTotalWithCoverage(dailyLog, 'na');
  if (na.coverage.known + na.coverage.missing === 0) return false;
  if (na.incomplete) return false;
  return nutrientKeysCoverage(dailyLog, HOME_MINERAL_KEYS, { minCoverage: 0.25 }).complete;
}
