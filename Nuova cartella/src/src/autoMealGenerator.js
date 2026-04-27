/**
 * Pasto realistico in 1 tap: cronologia, recency/frequenza, unit system + override.
 */

import { categorizeFood, FOOD_CATEGORY_CARBO, FOOD_CATEGORY_GRASSO, FOOD_CATEGORY_PROTEINA } from './coreEngine';
import { buildFoodUnits } from './foodUnits';
import {
  resolveFoodWithUnits,
  computeGrams,
  UNIT_TYPES,
  naturalUnitLabelIt,
} from './smartFoodUnits';

/** Normalizza mealType (app italiano + API english). */
export function normalizeAutoMealType(mealType) {
  const s = String(mealType || '').toLowerCase();
  if (s === 'breakfast' || s.includes('colaz')) return 'colazione';
  if (s === 'lunch' || s.includes('pranz')) return 'pranzo';
  if (s === 'dinner' || s.includes('cen')) return 'cena';
  if (s === 'snack' || s.includes('spunt') || s.includes('merend')) return 'snack';
  return '';
}

/**
 * @param {Array<{ type?: string, mealType?: string, foods?: Array<{ id?: string }> }>} history
 */
export function buildUserProfile(history) {
  const freq = {};
  const mealPrefs = {};

  (history || []).forEach((meal) => {
    const mt = normalizeAutoMealType(meal?.type ?? meal?.mealType);
    if (!mt) return;
    (meal?.foods || []).forEach((food) => {
      const id = String(food?.id ?? food?.foodDbKey ?? '').trim();
      if (!id) return;
      freq[id] = (freq[id] || 0) + 1;
      if (!mealPrefs[mt]) mealPrefs[mt] = {};
      mealPrefs[mt][id] = (mealPrefs[mt][id] || 0) + 1;
    });
  });

  return { freq, mealPrefs };
}

/**
 * Cronologia “light” da voci recenti (stesso schema freq / mealPrefs).
 * @param {Array<{ id?: string, mealType?: string, count?: number, usageCount?: number }>} entries
 */
export function buildUserProfileFromRecentEntries(entries) {
  const freq = {};
  const mealPrefs = {};

  (entries || []).forEach((e) => {
    const id = String(e?.id ?? '').trim();
    const mt = normalizeAutoMealType(e?.mealType);
    if (!id || !mt) return;
    const c = Math.max(1, Math.floor(Number(e.count ?? e.usageCount) || 1));
    freq[id] = (freq[id] || 0) + c;
    if (!mealPrefs[mt]) mealPrefs[mt] = {};
    mealPrefs[mt][id] = (mealPrefs[mt][id] || 0) + c;
  });

  return { freq, mealPrefs };
}

export function mergeUserProfiles(a, b) {
  const freq = { ...(a?.freq || {}) };
  const mealPrefs = { ...(a?.mealPrefs || {}) };
  Object.entries(b?.freq || {}).forEach(([id, n]) => {
    freq[id] = (freq[id] || 0) + Number(n) || 0;
  });
  Object.entries(b?.mealPrefs || {}).forEach(([mt, bucket]) => {
    if (!mealPrefs[mt]) mealPrefs[mt] = {};
    Object.entries(bucket || {}).forEach(([id, n]) => {
      mealPrefs[mt][id] = (mealPrefs[mt][id] || 0) + Number(n) || 0;
    });
  });
  return { freq, mealPrefs };
}

export function buildLastUsedMapFromHistory(history) {
  const map = {};
  (history || []).forEach((meal) => {
    const t = Number(meal?.timestamp ?? meal?.savedAt ?? meal?.at ?? meal?.lastUsedAt) || 0;
    const ts = t > 0 ? t : Date.now();
    (meal?.foods || []).forEach((food) => {
      const id = String(food?.id ?? food?.foodDbKey ?? '').trim();
      if (!id) return;
      map[id] = Math.max(map[id] || 0, ts);
    });
  });
  return map;
}

export function buildLastUsedMapFromRecentEntries(entries) {
  const map = {};
  (entries || []).forEach((e) => {
    const id = String(e?.id ?? '').trim();
    if (!id) return;
    const lu = Number(e.lastUsedAt ?? e.lastUsed) || 0;
    map[id] = Math.max(map[id] || 0, lu);
  });
  return map;
}

export function mergeLastUsedMaps(a, b) {
  const out = { ...a };
  Object.entries(b || {}).forEach(([id, t]) => {
    out[id] = Math.max(out[id] || 0, Number(t) || 0);
  });
  return out;
}

export function scoreFood(foodId, profile, mealType, lastUsedMap) {
  const id = String(foodId || '').trim();
  const mt = normalizeAutoMealType(mealType);
  const freqScore = profile?.freq?.[id] || 0;
  const mealScore = mt && profile?.mealPrefs?.[mt]?.[id] != null ? profile.mealPrefs[mt][id] : 0;

  const lastUsed = lastUsedMap?.[id] || 0;
  const recencyScore = Date.now() - lastUsed;

  return freqScore * 2 + mealScore * 3 + (1 / (recencyScore + 1)) * 100000;
}

function simpleHash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function caloriesForGrams(row, grams) {
  const k100 = Number(row?.kcal ?? row?.cal) || 0;
  const g = Number(grams) || 0;
  return Math.round((k100 * g) / 100);
}

/** Quantità iniziale per unità logica. */
export function suggestQuantity(resolvedFood) {
  const u = resolvedFood?.unit;
  const gpu = Number(resolvedFood?.gramsPerUnit) || 100;
  switch (u) {
    case UNIT_TYPES.SLICE:
      return 2;
    case UNIT_TYPES.PACKAGE:
      return 1;
    case UNIT_TYPES.PORTION:
      return 1;
    case UNIT_TYPES.TABLESPOON:
    case UNIT_TYPES.TEASPOON:
    case UNIT_TYPES.UNIT:
      return 1;
    case UNIT_TYPES.GRAM:
    default:
      return Math.max(1, Math.round(100 / Math.max(1, gpu)));
  }
}

function quantityStepForUnit(unit) {
  return unit === UNIT_TYPES.PORTION ? 0.25 : unit === UNIT_TYPES.GRAM ? 1 : 0.5;
}

function roundQuantityToStep(qty, unit) {
  const step = quantityStepForUnit(unit);
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return step;
  return Math.max(step, Math.round(q / step) * step);
}

export function buildPracticalDisplayLine(name, qty, unit, gramsPerUnit) {
  const displayName = String(name || '').trim() || 'Alimento';
  const gpu = Number(gramsPerUnit) || 0;
  const q = Number(qty) || 0;
  const g = Math.max(1, Math.round(computeGrams(q, gpu)));
  if (unit === UNIT_TYPES.GRAM) {
    return `${g} g ${displayName}`;
  }
  const lab = naturalUnitLabelIt(unit, q);
  const qStr =
    Number.isInteger(q) || Math.abs(q - Math.round(q)) < 1e-6
      ? String(Math.round(q))
      : String(q).replace(/\.?0+$/, '');
  return `${qStr} ${lab} ${displayName} (${g} g)`;
}

function collectCandidates(foodDb, recentEntries, effectiveMealType, maxScan = 480) {
  const ids = new Set();
  (recentEntries || []).forEach((e) => {
    const id = String(e?.id ?? '').trim();
    if (id) ids.add(id);
  });
  const keys = Object.keys(foodDb && typeof foodDb === 'object' ? foodDb : {});
  for (let i = 0; i < keys.length && ids.size < maxScan; i += 1) {
    ids.add(keys[i]);
  }
  const out = [];
  ids.forEach((id) => {
    const row = foodDb[id];
    if (!row || typeof row !== 'object') return;
    if (row.isRecipe === true || row.type === 'recipe') return;
    const desc = String(row.desc ?? row.name ?? '').trim();
    if (!desc) return;
    out.push({ id, row: { ...row, desc } });
  });
  return out;
}

function pickDiverseFoods(scoredRows, minItems, maxItems) {
  const picked = [];
  const macroCount = {};
  const seen = new Set();

  const tryPush = (item) => {
    if (picked.length >= maxItems) return false;
    const id = String(item.id).trim();
    if (!id || seen.has(id)) return false;
    const cat = categorizeFood(item.row);
    const n = macroCount[cat] || 0;
    if (picked.length >= minItems && n >= 2) return false;
    picked.push(item);
    seen.add(id);
    macroCount[cat] = n + 1;
    return true;
  };

  scoredRows.forEach((item) => tryPush(item));

  if (picked.length < minItems) {
    macroCount[FOOD_CATEGORY_CARBO] = 0;
    macroCount[FOOD_CATEGORY_PROTEINA] = 0;
    macroCount[FOOD_CATEGORY_GRASSO] = 0;
    picked.length = 0;
    seen.clear();
    scoredRows.forEach((item) => {
      if (picked.length >= maxItems) return;
      const id = String(item.id).trim();
      if (!id || seen.has(id)) return;
      picked.push(item);
      seen.add(id);
    });
  }

  return picked.slice(0, maxItems);
}

function scaleQuantitiesToTarget(foods, targetCalories) {
  const t = Number(targetCalories);
  if (!Number.isFinite(t) || t <= 0) return foods;
  let total = foods.reduce((s, f) => s + (Number(f.calories) || 0), 0);
  if (total <= 0) return foods;
  const factor = t / total;
  return foods.map((f) => {
    const rawQ = Number(f.quantity) * factor;
    const q = roundQuantityToStep(rawQ, f.unit);
    const grams = Math.max(1, Math.round(computeGrams(q, f.gramsPerUnit)));
    const calories = caloriesForGrams(f._row, grams);
    return {
      ...f,
      quantity: q,
      grams,
      calories,
      displayLine: buildPracticalDisplayLine(f.name, q, f.unit, f.gramsPerUnit),
    };
  });
}

/**
 * @param {object} params
 * @param {string} params.mealType
 * @param {number} [params.targetCalories]
 * @param {Array} [params.userHistory]
 * @param {Array} [params.recentFoodEntries]
 * @param {Record<string, object>} params.foodDb
 * @param {string[]} [params.excludeFoodIds]
 * @param {number} [params.varietyOffset] — incrementa a ogni rigenera
 * @param {number} [params.minItems]
 * @param {number} [params.maxItems]
 */
export function generatePracticalMeal(params) {
  const {
    mealType,
    targetCalories,
    userHistory = [],
    recentFoodEntries = [],
    foodDb,
    excludeFoodIds = [],
    varietyOffset = 0,
    minItems = 2,
    maxItems = 4,
  } = params;

  const mt = normalizeAutoMealType(mealType);
  const exclude = new Set((excludeFoodIds || []).map((x) => String(x).trim()).filter(Boolean));

  const profile = mergeUserProfiles(
    buildUserProfile(userHistory),
    buildUserProfileFromRecentEntries(recentFoodEntries)
  );
  const lastUsedMap = mergeLastUsedMaps(
    buildLastUsedMapFromHistory(userHistory),
    buildLastUsedMapFromRecentEntries(recentFoodEntries)
  );

  const candidates = collectCandidates(foodDb, recentFoodEntries, mt, 520);
  const limMin = Math.max(2, Math.min(6, Math.floor(Number(minItems) || 2)));
  const limMax = Math.max(limMin, Math.min(6, Math.floor(Number(maxItems) || 4)));

  const scored = candidates
    .map(({ id, row }) => {
      if (!id || exclude.has(id)) return null;
      const s = scoreFood(id, profile, mt || 'snack', lastUsedMap) + simpleHash(`${id}:${varietyOffset}`) * 1e-6;
      return { id, row, score: s };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const picked = pickDiverseFoods(scored, limMin, limMax);

  const foods = picked.map(({ id, row }) => {
    const { units, defaultUnit } = buildFoodUnits(row, id);
    const resolved = resolveFoodWithUnits({
      ...row,
      id,
      desc: row.desc,
      name: row.desc,
      defaultUnit,
      units,
    });
    const qty = suggestQuantity(resolved);
    const grams = Math.max(1, Math.round(computeGrams(qty, resolved.gramsPerUnit)));
    const calories = caloriesForGrams(row, grams);
    const name = String(row.desc ?? row.name ?? id).trim();
    return {
      id,
      name,
      quantity: qty,
      unit: resolved.unit,
      gramsPerUnit: resolved.gramsPerUnit,
      grams,
      calories,
      displayLine: buildPracticalDisplayLine(name, qty, resolved.unit, resolved.gramsPerUnit),
      _row: row,
    };
  });

  const scaled = scaleQuantitiesToTarget(foods, targetCalories).map(({ _row, ...rest }) => rest);

  const totalCalories = scaled.reduce((s, f) => s + (Number(f.calories) || 0), 0);

  return {
    foods: scaled,
    totalCalories,
    displayLines: scaled.map((f) => f.displayLine),
  };
}
