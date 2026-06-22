import {
  computeMacrosForUnit,
  getPer100Macros,
  resolveDefaultUnitWeight,
} from './foodMacroUtils';

export function resolveFoodIdentityKey(food) {
  if (food?.foodDbKey != null && String(food.foodDbKey).trim() !== '') {
    return `db:${String(food.foodDbKey).trim()}`;
  }
  const desc = String(food?.desc ?? food?.name ?? food?.label ?? '').trim().toLowerCase();
  if (desc) return `desc:${desc}`;
  if (food?.key != null && String(food.key).trim() !== '') {
    return `key:${String(food.key).trim()}`;
  }
  return null;
}

export function findDraftItemForFood(draftFoods, food) {
  const identity = resolveFoodIdentityKey(food);
  if (!identity) return null;
  return (draftFoods || []).find((item) => resolveFoodIdentityKey(item) === identity) ?? null;
}

export function getFoodUnitWeight(food, fallback = 100) {
  return resolveDefaultUnitWeight(food, fallback);
}

export function computeDraftQtyMultiplier(draftItem, unitWeight) {
  if (!draftItem || !unitWeight) return 0;
  const currentWeight = Number(draftItem.weight ?? draftItem.qta) || 0;
  if (currentWeight <= 0) return 0;
  return Math.max(1, Math.round(currentWeight / unitWeight));
}

export function getDraftQtyForFood(draftFoods, food, unitWeight) {
  const draftItem = findDraftItemForFood(draftFoods, food);
  return computeDraftQtyMultiplier(draftItem, unitWeight);
}

export function getDefaultUnitKcal(food) {
  const per100 = getPer100Macros(food);
  const unitWeight = getFoodUnitWeight(food);
  const portion = computeMacrosForUnit(per100, unitWeight);
  return Math.round(portion.kcal);
}

export function getTileDisplayStats(qty, defaultUnitWeight, defaultUnitKcal) {
  const safeQty = Number(qty) || 0;
  const unitWeight = Number(defaultUnitWeight) || 0;
  const unitKcal = Number(defaultUnitKcal) || 0;

  return {
    displayWeight: Math.round(safeQty > 0 ? safeQty * unitWeight : unitWeight),
    displayKcal: Math.round(safeQty > 0 ? safeQty * unitKcal : unitKcal),
  };
}
