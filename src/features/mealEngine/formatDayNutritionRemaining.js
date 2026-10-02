function absDisplay(value, unit) {
  const n = Math.abs(Number(value) || 0);
  if (unit === 'kcal') return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

/**
 * Presentazione remaining firmato. Non modifica i numeri del Projection Engine.
 * @param {number} remaining
 * @param {{ unit?: string, capitalize?: boolean }} [opts]
 * @returns {{ kind: 'under'|'met'|'over', text: string }}
 */
export function formatSignedRemainingLabel(remaining, opts = {}) {
  const unit = opts.unit || 'g';
  const n = Number(remaining);
  if (!Number.isFinite(n) || n === 0) {
    return { kind: 'met', text: 'Target raggiunto' };
  }
  const qty = absDisplay(n, unit);
  if (n > 0) {
    const verb = opts.positiveVerb
      || (opts.capitalize === true ? 'Restano' : 'restano');
    return { kind: 'under', text: `${verb} ${qty} ${unit}` };
  }
  return { kind: 'over', text: `+${qty} ${unit} rispetto al target` };
}

export function dayNutritionProjectionTitle(mealType) {
  const slot = String(mealType || '').toLowerCase().split('_')[0];
  return slot === 'cena' ? 'Proiezione di fine giornata' : 'Dopo questo pasto';
}

export function isDinnerMealSlot(mealType) {
  return String(mealType || '').toLowerCase().split('_')[0] === 'cena';
}

/** Etichetta del riferimento slot (non è un limite). */
export function slotReferenceHeading(mealType) {
  return isDinnerMealSlot(mealType) ? 'Per chiudere oggi' : 'Riferimento pasto';
}

export function formatSlotReferenceHint(mealType, value, unit = 'kcal') {
  const n = unit === 'kcal' ? Math.round(Number(value) || 0) : (Number(value) || 0);
  const qty = unit === 'kcal' ? String(n) : (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
  if (isDinnerMealSlot(mealType) && unit === 'kcal') {
    return `${qty} kcal disponibili`;
  }
  if (unit === 'kcal') return `Riferimento ${qty} kcal`;
  return `Riferimento ${qty} g`;
}

export function hasCountableProjectedMeal(projection) {
  const meal = projection?.meal;
  if (!meal || typeof meal !== 'object') return false;
  return (Number(meal.kcal) || 0) !== 0
    || (Number(meal.prot) || 0) !== 0
    || (Number(meal.carb) || 0) !== 0
    || (Number(meal.fat) || 0) !== 0;
}
