import { isUnresolvedMealDraftItem } from '../../utils/mealDraftStatus.js';

/** Slot nutrizionali del Meal Engine, in ordine di giornata. */
export const NUTRITIONAL_MEAL_SLOTS = Object.freeze(['colazione', 'pranzo', 'snack', 'cena']);

const NUTRITIONAL_SLOT_ALIAS = {
  colazione: 'colazione',
  merenda1: 'colazione',
  breakfast: 'colazione',
  pranzo: 'pranzo',
  lunch: 'pranzo',
  snack: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  spuntino: 'snack',
  cena: 'cena',
  dinner: 'cena',
};

/**
 * @param {unknown} type
 * @returns {'colazione'|'pranzo'|'snack'|'cena'|null}
 */
export function toNutritionalMealSlot(type) {
  const str = String(type || '');
  const base = str.includes('_') ? str.split('_')[0] : str;
  const key = base.toLowerCase().trim();
  const canon = NUTRITIONAL_SLOT_ALIAS[key] || key;
  return NUTRITIONAL_MEAL_SLOTS.includes(canon) ? canon : null;
}

function isLoggedFoodEntry(entry) {
  if (!entry || (entry.type !== 'food' && entry.type !== 'recipe')) return false;
  if (isUnresolvedMealDraftItem(entry)) return false;
  return true;
}

/**
 * Slot canonici in cui esiste almeno un alimento risolto.
 * Più record nello stesso slot (stesso pranzo, orari diversi) contano una sola volta.
 *
 * @param {unknown[]} log
 * @returns {Set<string>}
 */
export function listCompletedNutritionalSlots(log) {
  const seen = new Set();
  for (const entry of log || []) {
    if (!isLoggedFoodEntry(entry)) continue;
    const slot = toNutritionalMealSlot(entry.mealType);
    if (slot) seen.add(slot);
  }
  return seen;
}

/**
 * Slot ancora da usare: dal pasto corrente in poi, esclusi quelli già completati.
 * Gli slot precedenti non registrati si considerano saltati e non assorbono budget.
 *
 * @param {unknown[]} log
 * @param {unknown} currentMealType
 * @returns {number}
 */
export function countRemainingNutritionalSlots(log, currentMealType) {
  const completed = listCompletedNutritionalSlots(log);
  const current = toNutritionalMealSlot(currentMealType) || 'pranzo';
  const currentIdx = NUTRITIONAL_MEAL_SLOTS.indexOf(current);
  let remaining = 0;
  for (let i = 0; i < NUTRITIONAL_MEAL_SLOTS.length; i++) {
    if (i < currentIdx) continue;
    const slot = NUTRITIONAL_MEAL_SLOTS[i];
    if (completed.has(slot)) continue;
    remaining += 1;
  }
  return Math.max(1, remaining);
}
