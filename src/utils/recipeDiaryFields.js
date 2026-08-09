/**
 * Compat ricetta diario: garantisce isRecipe + ingredients top-level
 * senza modificare `type` né creare `row` se assente.
 *
 * - Se c'è row.ingredients e manca ingredients top-level → copia in top-level
 * - Se c'è solo ingredients top-level → lascia così (non crea row)
 * - isRecipe: true se ingredients (ovunque) o type==='recipe' o già isRecipe
 */
export function ensureRecipeDiaryFields(entry) {
  if (!entry || typeof entry !== 'object') return entry;

  const topIngs = Array.isArray(entry.ingredients) && entry.ingredients.length > 0
    ? entry.ingredients
    : null;
  const rowIngs = entry.row
    && Array.isArray(entry.row.ingredients)
    && entry.row.ingredients.length > 0
      ? entry.row.ingredients
      : null;

  const ingredients = topIngs || rowIngs;
  const shouldFlag =
    entry.isRecipe === true
    || entry.type === 'recipe'
    || Boolean(ingredients);

  if (!shouldFlag) return entry;

  const next = { ...entry, isRecipe: true };
  if (!topIngs && rowIngs) {
    next.ingredients = rowIngs;
  }
  return next;
}
