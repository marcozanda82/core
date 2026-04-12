/**
 * Learns from saved meals over time: typical item counts per meal type,
 * preferred foods per slot, and macro category mix — used to adapt automatic suggestions.
 */

import { categorizeFood } from './coreEngine';

export const MEAL_SUGGESTION_HABITS_KEY = 'meal_suggestion_habits_v1';
export const MEAL_SUGGESTION_HABITS_EVENT = 'meal-suggestion-habits-updated';

const MAX_FOOD_IDS_PER_BUCKET = 100;
const MIN_SAMPLES_FOR_ADAPTIVE = 3;

function normalizeMealType(value) {
  const meal = String(value || '').trim().toLowerCase();
  if (meal.includes('colazione')) return 'colazione';
  if (meal.includes('pranzo')) return 'pranzo';
  if (meal.includes('cena')) return 'cena';
  if (meal.includes('snack') || meal.includes('spuntino')) return 'snack';
  return '';
}

function normalizeFoodRef(food) {
  if (!food || typeof food !== 'object') return null;
  const name = String(food.name ?? food.desc ?? '').trim();
  const id = String(food.foodDbKey ?? food.id ?? name).trim();
  if (!id || !name) return null;
  return { id, name, raw: food };
}

function loadRaw() {
  try {
    const parsed = JSON.parse(
      typeof localStorage !== 'undefined' ? localStorage.getItem(MEAL_SUGGESTION_HABITS_KEY) || '{}' : '{}'
    );
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistRaw(raw) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MEAL_SUGGESTION_HABITS_KEY, JSON.stringify(raw));
    }
  } catch (_) {}
}

function pruneFoodIds(foodIds) {
  const entries = Object.entries(foodIds || {});
  if (entries.length <= MAX_FOOD_IDS_PER_BUCKET) return foodIds;
  entries.sort((a, b) => (Number(b[1]?.count) || 0) - (Number(a[1]?.count) || 0));
  const next = {};
  entries.slice(0, MAX_FOOD_IDS_PER_BUCKET).forEach(([k, v]) => {
    next[k] = v;
  });
  return next;
}

export function loadMealSuggestionHabits() {
  const raw = loadRaw();
  if (!raw.byMealType || typeof raw.byMealType !== 'object') {
    return { byMealType: {} };
  }
  return raw;
}

export function dispatchMealSuggestionHabitsUpdated() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(MEAL_SUGGESTION_HABITS_EVENT));
  } catch (_) {}
}

/**
 * Call when a meal is saved (same moment as co-occurrence).
 * @param {Array<object>} foods - Diary meal line items
 * @param {string} mealTypeSlot
 * @param {Record<string, object>} foodDb - optional, improves categorization
 */
export function recordMealSuggestionHabits(foods, mealTypeSlot, foodDb = {}) {
  const mealType = normalizeMealType(mealTypeSlot);
  if (!mealType || !Array.isArray(foods) || foods.length === 0) return;

  const refs = [];
  const seen = new Set();
  foods.forEach((f) => {
    const r = normalizeFoodRef(f);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id);
    refs.push(r);
  });
  const itemCount = refs.length;

  const raw = loadRaw();
  if (!raw.byMealType || typeof raw.byMealType !== 'object') raw.byMealType = {};

  const bucket = raw.byMealType[mealType] && typeof raw.byMealType[mealType] === 'object'
    ? {
      mealCountSamples: Number(raw.byMealType[mealType].mealCountSamples) || 0,
      itemCountSum: Number(raw.byMealType[mealType].itemCountSum) || 0,
      foodIds: { ...(raw.byMealType[mealType].foodIds || {}) },
      categoryTotals: { ...(raw.byMealType[mealType].categoryTotals || {}) },
    }
    : {
      mealCountSamples: 0,
      itemCountSum: 0,
      foodIds: {},
      categoryTotals: {},
    };

  bucket.mealCountSamples += 1;
  bucket.itemCountSum += itemCount;
  bucket.lastUpdated = Date.now();

  refs.forEach(({ id, name, raw: row }) => {
    const prev = bucket.foodIds[id] || { count: 0, name };
    prev.count = (Number(prev.count) || 0) + 1;
    if (name) prev.name = name;
    bucket.foodIds[id] = prev;

    const dbRow = foodDb[id] && typeof foodDb[id] === 'object' ? foodDb[id] : row;
    const cat = categorizeFood(dbRow || {});
    bucket.categoryTotals[cat] = (Number(bucket.categoryTotals[cat]) || 0) + 1;
  });

  bucket.foodIds = pruneFoodIds(bucket.foodIds);
  raw.byMealType[mealType] = bucket;
  persistRaw(raw);
  dispatchMealSuggestionHabitsUpdated();
}

/**
 * Target and bounds for how many distinct foods to suggest in a meal (from saved history).
 */
export function getAdaptiveMealBounds(mealType, habits) {
  const mt = normalizeMealType(mealType) || mealType;
  const snack = mt === 'snack';
  const defaultMin = snack ? 1 : 2;
  const defaultMax = snack ? 4 : 5;
  const defaultTarget = snack ? 2 : 3;

  const b = habits?.byMealType?.[mt];
  const n = Number(b?.mealCountSamples) || 0;
  if (!b || n < MIN_SAMPLES_FOR_ADAPTIVE) {
    return { min: defaultMin, max: defaultMax, target: defaultTarget };
  }

  const avg = Number(b.itemCountSum) / n;
  let target = Math.round(avg);
  target = Math.max(defaultMin, Math.min(6, target));
  const min = Math.max(1, target - 1);
  const max = Math.min(8, target + 1);
  return { min, max, target };
}

export function getMealTypeFoodPreferenceCount(mealType, foodId, habits) {
  const mt = normalizeMealType(mealType) || mealType;
  const id = String(foodId ?? '').trim();
  if (!mt || !id) return 0;
  return Number(habits?.byMealType?.[mt]?.foodIds?.[id]?.count) || 0;
}

export function getMealTypeCategoryTotals(mealType, habits) {
  const mt = normalizeMealType(mealType) || mealType;
  return { ...(habits?.byMealType?.[mt]?.categoryTotals || {}) };
}
