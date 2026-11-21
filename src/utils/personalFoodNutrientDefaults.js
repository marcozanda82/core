/**
 * Policy DB personale: nessun nutriente inventato.
 * Se manca, resta assente/null — non usare target giornaliero / 4.
 */

export const UNKNOWN_SODIUM_KEYS = Object.freeze(['na', 'sale', 'sodium']);

/**
 * @deprecated Non riempire più i mancanti. Tenuta per call-site esistenti: no-op.
 * @param {Record<string, unknown>} entry
 * @returns {Record<string, unknown>}
 */
export function fillMissingPersonalFoodNutrients(entry) {
  // Intenzionale: non chiamare getDefaultNutrientValue su alcun nutriente.
  return entry;
}
