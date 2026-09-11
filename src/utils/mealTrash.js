import { stripUndefined } from './firebasePayloadUtils';

export const MEAL_TRASH_TTL_MS = 24 * 60 * 60 * 1000;
export const MEAL_TRASH_TOAST_MS = 4500;

export function mealTrashDbPath(uid) {
  return `users/${String(uid || '').trim()}/trash_meals`;
}

export function isMealTrashFresh(item, now = Date.now()) {
  const deletedAt = Number(item?.deletedAt);
  if (!Number.isFinite(deletedAt) || deletedAt <= 0) return false;
  return (now - deletedAt) < MEAL_TRASH_TTL_MS;
}

export function formatMealTrashRemaining(deletedAt, now = Date.now()) {
  const left = MEAL_TRASH_TTL_MS - (now - Number(deletedAt || 0));
  if (!Number.isFinite(left) || left <= 0) return 'Scaduto';
  const hours = Math.floor(left / (60 * 60 * 1000));
  if (hours >= 1) return hours === 1 ? 'Scade tra 1 ora' : `Scade tra ${hours} ore`;
  const mins = Math.max(1, Math.round(left / 60000));
  return mins === 1 ? 'Scade tra 1 minuto' : `Scade tra ${mins} minuti`;
}

export function serializeTrashFood(food) {
  if (!food || typeof food !== 'object') return null;
  try {
    return stripUndefined(JSON.parse(JSON.stringify(food)));
  } catch {
    const name = String(food.foodName || food.name || food.desc || '').trim();
    if (!name) return null;
    return stripUndefined({
      id: food.id != null ? String(food.id) : undefined,
      type: food.type || 'food',
      mealType: food.mealType,
      mealTime: food.mealTime,
      name,
      desc: name,
      qta: food.qta ?? food.weight ?? food.grams,
      weight: food.weight ?? food.qta ?? food.grams,
      kcal: food.kcal ?? food.cal,
      prot: food.prot,
      carb: food.carb,
      fat: food.fat ?? food.fatTotal,
      status: food.status,
    });
  }
}

export function buildTrashMealRecord({
  foods = [],
  slotKey = '',
  mealType = '',
  mealTime = 12,
  label = 'Pasto',
  date = '',
  deletedAt = Date.now(),
} = {}) {
  const serializedFoods = (Array.isArray(foods) ? foods : [])
    .map(serializeTrashFood)
    .filter(Boolean);
  if (serializedFoods.length === 0) return null;
  const ts = Number(deletedAt) || Date.now();
  return {
    id: `trash_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    deletedAt: ts,
    date: String(date || ''),
    slotKey: String(slotKey || ''),
    mealType: String(mealType || ''),
    mealTime: Number.isFinite(Number(mealTime)) ? Number(mealTime) : 12,
    label: String(label || 'Pasto'),
    foods: serializedFoods,
  };
}

export function listFreshTrashMeals(raw, now = Date.now()) {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list
    .filter((item) => item && typeof item === 'object' && isMealTrashFresh(item, now))
    .sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0));
}

export function collectExpiredTrashIds(raw, now = Date.now()) {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list
    .filter((item) => item?.id && !isMealTrashFresh(item, now))
    .map((item) => String(item.id));
}

export function trashFoodIds(entry) {
  return (Array.isArray(entry?.foods) ? entry.foods : [])
    .map((food) => (food?.id != null ? String(food.id) : ''))
    .filter(Boolean);
}
