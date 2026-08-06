/**
 * Apprendimento alimenti utente: porzione → valori /100g → persistenza DB personale.
 */

function roundMacro(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * @param {{ kcal?: number, pro?: number, carbo?: number, fat?: number }} portionMacros
 * @param {number} grams
 * @returns {{ kcal: number, prot: number, carb: number, fat: number, fatTotal: number }}
 */
export function portionMacrosToPer100(portionMacros, grams) {
  const g = Math.max(1, Math.round(Number(grams) || 0));
  const factor = 100 / g;
  const kcal = Math.round((Number(portionMacros?.kcal) || 0) * factor);
  const prot = roundMacro((Number(portionMacros?.pro) || 0) * factor);
  const carb = roundMacro((Number(portionMacros?.carbo) || 0) * factor);
  const fat = roundMacro((Number(portionMacros?.fat) || 0) * factor);
  return {
    kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
  };
}

/**
 * @param {{
 *   foodName: string,
 *   grams: number,
 *   kcal: number,
 *   pro?: number,
 *   carbo?: number,
 *   fat?: number,
 *   source?: string,
 *   labelImageUri?: string | null,
 * }} args
 */
export function buildLearnedFoodEntryPer100({
  foodName,
  grams,
  kcal,
  pro = 0,
  carbo = 0,
  fat = 0,
  source = 'manual_resolution',
  labelImageUri = null,
}) {
  const desc = String(foodName || '').trim();
  if (!desc) return null;

  const per100 = portionMacrosToPer100({ kcal, pro, carbo, fat }, grams);
  const entry = {
    desc,
    name: desc,
    ...per100,
    isRecipe: false,
    learnedSource: String(source || 'manual_resolution'),
    userLearned: true,
  };
  if (labelImageUri) {
    entry.pendingLabelImageUri = String(labelImageUri);
  }
  return entry;
}

/**
 * @param {(entry: object) => Promise<{ key: string, row?: object } | void>} saveToFoodDb
 * @param {ReturnType<typeof buildLearnedFoodEntryPer100>} entryPer100
 */
export async function persistLearnedFoodToDatabase(saveToFoodDb, entryPer100) {
  if (!entryPer100?.desc) {
    throw new Error('missing_food_name');
  }
  if (typeof saveToFoodDb !== 'function') {
    throw new Error('save_food_db_not_configured');
  }
  const saved = await saveToFoodDb(entryPer100);
  const foodDbKey = saved?.key != null ? String(saved.key) : null;
  if (!foodDbKey) {
    throw new Error('save_food_db_no_key');
  }
  return {
    foodDbKey,
    row: saved?.row && typeof saved.row === 'object' ? saved.row : entryPer100,
  };
}

/**
 * Risolve macro porzione dopo apprendimento (preferisce DB se disponibile).
 * @param {import('../utils/foodResolver.js').resolveFoodItemForProposal} resolveFn
 */
export function resolveLearnedPortionAfterSave(
  resolveFoodItemForProposal,
  foodName,
  grams,
  foodDbKey,
  context,
) {
  if (typeof resolveFoodItemForProposal !== 'function') return null;
  return resolveFoodItemForProposal(foodName, grams, {
    ...context,
    preferredDbKey: foodDbKey,
  });
}
