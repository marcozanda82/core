function createWipItemId() {
  return `wip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMacros(macros = {}) {
  return {
    prot: Number(macros.prot ?? macros.pro ?? macros.protein) || 0,
    carbo: Number(macros.carb ?? macros.carbo ?? macros.carbs) || 0,
    fat: Number(macros.fat ?? macros.fatTotal) || 0,
  };
}

/**
 * Normalizza un alimento dichiarato dall'utente o dal parser.
 * @param {object} raw
 * @returns {object | null}
 */
export function declarationItemToWipAlimento(raw = {}) {
  const name = String(raw.foodName || raw.name || '').trim();
  const grams = Math.round(Number(raw.grams ?? raw.weight ?? raw.qta) || 0);
  if (!name || grams <= 0) return null;

  const macros = normalizeMacros(raw);
  const kcal = Math.round(Number(raw.kcal ?? raw.calories ?? raw.cal) || 0);

  return {
    id: createWipItemId(),
    type: 'food',
    name,
    desc: name,
    foodName: name,
    grams,
    weight: grams,
    qta: grams,
    selectedUnit: 'g',
    multiplier: grams,
    kcal,
    cal: kcal,
    prot: macros.prot,
    carbo: macros.carbo,
    fat: macros.fat,
    source: 'user_declaration',
  };
}

/**
 * Normalizza un suggerimento LLM (Smart Chip) in alimento WIP.
 * @param {object} suggestion
 * @returns {object | null}
 */
export function suggestionToWipAlimento(suggestion = {}) {
  const name = String(suggestion.name || suggestion.foodName || '').trim();
  const grams = Math.round(Number(suggestion.weight ?? suggestion.grams) || 0);
  if (!name || grams <= 0) return null;

  const macros = normalizeMacros(suggestion.macros || suggestion);
  const kcal = Math.round(Number(suggestion.calories ?? suggestion.kcal ?? suggestion.cal) || 0);

  return {
    id: createWipItemId(),
    type: 'food',
    name,
    desc: name,
    foodName: name,
    grams,
    weight: grams,
    qta: grams,
    selectedUnit: 'g',
    multiplier: grams,
    kcal,
    cal: kcal,
    prot: macros.prot,
    carbo: macros.carbo,
    fat: macros.fat,
    reason: String(suggestion.reason || '').trim() || null,
    source: 'llm_suggestion',
  };
}

/**
 * Chiave stabile per tracciare chip già aggiunti.
 * @param {object} suggestion
 * @param {number} [index]
 * @returns {string}
 */
export function buildSuggestionChipId(suggestion = {}, index = 0) {
  const name = String(suggestion.name || suggestion.foodName || '').trim().toLowerCase();
  const grams = Math.round(Number(suggestion.weight ?? suggestion.grams) || 0);
  return `${name}_${grams}_${index}`;
}

export function computeWipMealTotals(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item?.kcal ?? item?.cal) || 0),
      pro: acc.pro + (Number(item?.prot) || 0),
      carbo: acc.carbo + (Number(item?.carbo) || 0),
      fat: acc.fat + (Number(item?.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

/**
 * Serializza items WIP per prompt LLM.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function serializeWipMealItemsForPrompt(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    foodName: String(item?.foodName || item?.name || '').trim(),
    grams: Math.round(Number(item?.grams ?? item?.weight) || 0),
    kcal: Math.round(Number(item?.kcal ?? item?.cal) || 0),
    pro: Number(item?.prot) || 0,
    carbo: Number(item?.carbo) || 0,
    fat: Number(item?.fat) || 0,
  })).filter((item) => item.foodName && item.grams > 0);
}
