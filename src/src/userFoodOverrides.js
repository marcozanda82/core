/**
 * Override locali (CREA / food id): gramsPerUnit senza modificare il database CREA.
 * Struttura pronta per sync cloud / preferenze pasto.
 */

export const USER_FOOD_OVERRIDES_KEY = 'user_food_overrides';
export const USER_FOOD_OVERRIDES_EVENT = 'user-food-overrides-updated';

export function getUserFoodOverrides() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_FOOD_OVERRIDES_KEY) : null;
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveUserFoodOverrides(overrides) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_FOOD_OVERRIDES_KEY, JSON.stringify(overrides || {}));
    }
  } catch (_) {}
  dispatchUserFoodOverridesUpdated();
}

export function setFoodOverride(foodId, data) {
  const id = String(foodId || '').trim();
  if (!id) return;
  const overrides = getUserFoodOverrides();
  overrides[id] = {
    ...overrides[id],
    ...data,
    updatedAt: Date.now(),
  };
  saveUserFoodOverrides(overrides);
}

export function resetFoodOverride(foodId) {
  const id = String(foodId || '').trim();
  if (!id) return;
  const overrides = getUserFoodOverrides();
  delete overrides[id];
  saveUserFoodOverrides(overrides);
}

export function dispatchUserFoodOverridesUpdated() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(USER_FOOD_OVERRIDES_EVENT));
  } catch (_) {}
}

/** Solo lettura override gramsPerUnit (per buildFoodUnits, senza ciclo con resolveFood). */
export function getGramsPerUnitOverride(foodId) {
  const id = String(foodId || '').trim();
  if (!id) return null;
  const v = getUserFoodOverrides()[id]?.gramsPerUnit;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Unisce override utente su `gramsPerUnit` (priorità su CREA).
 * Usare ovunque si esponga un alimento (ricerca, inserimento, risoluzione porzioni).
 */
export function resolveFood(food) {
  if (!food || typeof food !== 'object') return food;
  const id = String(food.id ?? food.foodDbKey ?? '').trim();
  const overrides = getUserFoodOverrides();
  const override = id ? overrides[id] : null;

  const baseG =
    food.gramsPerUnit != null && Number.isFinite(Number(food.gramsPerUnit))
      ? Number(food.gramsPerUnit)
      : (food.defaultUnit?.grams != null && Number.isFinite(Number(food.defaultUnit.grams))
        ? Number(food.defaultUnit.grams)
        : undefined);

  const resolved =
    override?.gramsPerUnit != null && Number.isFinite(Number(override.gramsPerUnit))
      ? Number(override.gramsPerUnit)
      : (food.gramsPerUnit != null && Number.isFinite(Number(food.gramsPerUnit))
        ? Number(food.gramsPerUnit)
        : baseG);

  const out = { ...food };
  if (resolved != null && Number.isFinite(resolved)) {
    out.gramsPerUnit = resolved;
  }

  if (import.meta.env?.DEV && id && override?.gramsPerUnit != null) {
    // eslint-disable-next-line no-console
    console.log('[override]', id, '→', out.gramsPerUnit);
  }

  return out;
}
