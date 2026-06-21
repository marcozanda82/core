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
  const weight = Number(food?.qta ?? food?.weight) || 0;
  return weight > 0 ? weight : fallback;
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
  return Math.round(Number(food?.kcal ?? food?.cal) || 0);
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
