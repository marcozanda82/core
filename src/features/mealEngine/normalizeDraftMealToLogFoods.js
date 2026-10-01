import { isUnresolvedMealDraftItem } from '../../utils/mealDraftStatus.js';

/**
 * Adatta bozze FastMealLogger e McDrive/LiveMealTray a voci `food`
 * che `computeTotali` può sommare con le stesse regole del diario.
 *
 * Esclusi (regola ufficiale `isUnresolvedMealDraftItem`):
 * raw, pending, pending_enrichment, requires_disambiguation, processing, validating.
 *
 * `skipped` McDrive non è in quel set: se ha kcal, entra nei totali come farebbe il diario.
 */

function asDraftList(draftMeal) {
  if (draftMeal == null) return [];
  if (Array.isArray(draftMeal)) return draftMeal;
  if (Array.isArray(draftMeal.items)) return draftMeal.items;
  if (Array.isArray(draftMeal.foods)) return draftMeal.foods;
  return [];
}

function readKcal(item) {
  return Number(item?.kcal ?? item?.cal) || 0;
}

function readProt(item) {
  return Number(item?.prot ?? item?.pro ?? item?.proteine) || 0;
}

function readCarb(item) {
  return Number(item?.carb ?? item?.carbo ?? item?.cho ?? item?.carboidrati) || 0;
}

function readFat(item) {
  return Number(item?.fatTotal ?? item?.fat ?? item?.grassi) || 0;
}

export function isCountableDraftItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (isUnresolvedMealDraftItem(item)) return false;
  return true;
}

/**
 * @param {unknown} draftMeal
 * @returns {Array<{ type: 'food', kcal: number, prot: number, carb: number, fat: number, fatTotal: number }>}
 */
export function normalizeDraftMealToLogFoods(draftMeal) {
  return asDraftList(draftMeal)
    .filter(isCountableDraftItem)
    .map((item) => {
      const kcal = readKcal(item);
      const prot = readProt(item);
      const carb = readCarb(item);
      const fat = readFat(item);
      return {
        type: 'food',
        kcal,
        cal: kcal,
        prot,
        carb,
        fat,
        fatTotal: fat,
      };
    });
}
