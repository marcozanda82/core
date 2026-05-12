/**
 * Drilldown nutrienti: breakdown percentuale per alimento (pure, no React).
 *
 * @typedef {object} NutrientContributionItem
 * @property {string} foodId
 * @property {string} foodName
 * @property {number} consumedQuantity — grammi o unità pasto; 1 se porzione implicita
 * @property {number} nutrientAmount — quantità del nutriente per quella voce diario
 * @property {number} contributionPct — 0 se totalNutrientAmount === 0
 */

/**
 * Ordine di lettura sulle singole voci diario (alias da campo food).
 * Chiave logica dopo normalizzazione (es. `sugars` → zuccheri / sugars / sugar).
 */
const READ_KEYS_BY_LOGICAL = {
  kcal: ['kcal', 'cal'],
  prot: ['prot'],
  fibre: ['fibre'],
  na: ['na'],
  k: ['k'],
  sugars: ['zuccheri', 'sugars', 'sugar'],
  fatSat: ['fatSat'],
  carb: ['carb'],
  fatTotal: ['fatTotal', 'fat'],
};

/** Alias comuni → chiave logica interna (coerente con READ_KEYS_BY_LOGICAL). */
const NUTRIENT_KEY_ALIASES = {
  protein: 'prot',
  fiber: 'fibre',
  fibres: 'fibre',
  sodium: 'na',
  potassium: 'k',
  sugars: 'sugars',
  sugar: 'sugars',
  zuccheri: 'sugars',
  saturatedfat: 'fatSat',
  saturated_fat: 'fatSat',
  cal: 'kcal',
};

const QTY_KEYS = ['qty', 'weight', 'grams', 'quantity', 'portionGrams'];

/**
 * @param {unknown} nutrientKey
 * @returns {string}
 */
function normalizeNutrientKey(nutrientKey) {
  const raw = String(nutrientKey ?? '').trim();
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/-/g, '').replace(/_/g, '');
  const aliased = NUTRIENT_KEY_ALIASES[compact];
  if (aliased) return aliased;
  for (const logical of Object.keys(READ_KEYS_BY_LOGICAL)) {
    if (logical.toLowerCase().replace(/_/g, '') === compact) return logical;
  }
  return raw;
}

/**
 * Quantità consumata: primo campo positivo finito; se assente → 1 (una riga diario senza massa esplicita).
 * Esplicito ≤ 0 → voce esclusa dal breakdown.
 *
 * @param {Record<string, unknown>} food
 * @returns {{ ok: true, qty: number } | { ok: false }}
 */
function resolveConsumedQuantity(food) {
  let anyExplicit = false;
  for (const key of QTY_KEYS) {
    if (!(key in food) || food[key] == null || food[key] === '') continue;
    anyExplicit = true;
    const n = Number(food[key]);
    if (!Number.isFinite(n)) return { ok: false };
    if (n <= 0) return { ok: false };
    return { ok: true, qty: n };
  }
  if (anyExplicit) return { ok: false };
  return { ok: true, qty: 1 };
}

/**
 * @param {Record<string, unknown>} food
 * @param {string} logicalKey
 * @returns {number}
 */
function readNutrientAmount(food, logicalKey) {
  const keys = READ_KEYS_BY_LOGICAL[logicalKey] ?? [logicalKey];
  for (const prop of keys) {
    if (!(prop in food)) continue;
    const v = food[prop];
    if (v != null && typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * @param {Record<string, unknown>} food
 * @param {number} index
 * @returns {string}
 */
function resolveFoodId(food, index) {
  const id = food.id ?? food.foodId ?? food.dbKey;
  if (id != null && String(id).trim() !== '') return String(id);
  return `row:${index}`;
}

/**
 * @param {Record<string, unknown>} food
 * @returns {string}
 */
function resolveFoodName(food) {
  const n = food.name ?? food.desc ?? food.label;
  const s = String(n ?? '').trim();
  return s || 'Alimento';
}

/**
 * @param {unknown[]} foods
 * @param {string} nutrientKey — es. protein, fiber, sodium, potassium, sugars, saturatedFat, kcal (o chiavi canoniche prot, fibre, …)
 * @returns {{
 *   nutrientKey: string,
 *   totalNutrientAmount: number,
 *   items: NutrientContributionItem[],
 * }}
 */
export function computeNutrientContributionBreakdown(foods, nutrientKey) {
  const list = Array.isArray(foods) ? foods : [];
  const logicalKey = normalizeNutrientKey(nutrientKey);
  const reportedKey = String(nutrientKey ?? '').trim() || logicalKey;

  if (!logicalKey) {
    return { nutrientKey: reportedKey, totalNutrientAmount: 0, items: [] };
  }

  /** @type {{ food: Record<string, unknown>, foodId: string, foodName: string, consumedQuantity: number, nutrientAmount: number }[]} */
  const rows = [];

  list.forEach((raw, index) => {
    if (raw == null || typeof raw !== 'object') return;
    const food = /** @type {Record<string, unknown>} */ (raw);
    const qtyRes = resolveConsumedQuantity(food);
    if (!qtyRes.ok) return;

    const nutrientAmount = readNutrientAmount(food, logicalKey);
    if (!Number.isFinite(nutrientAmount)) return;
    if (nutrientAmount <= 0) return;

    rows.push({
      food,
      foodId: resolveFoodId(food, index),
      foodName: resolveFoodName(food),
      consumedQuantity: qtyRes.qty,
      nutrientAmount,
    });
  });

  const totalNutrientAmount = rows.reduce((s, r) => s + r.nutrientAmount, 0);

  const items = rows
    .map((r) => ({
      foodId: r.foodId,
      foodName: r.foodName,
      consumedQuantity: r.consumedQuantity,
      nutrientAmount: r.nutrientAmount,
      contributionPct:
        totalNutrientAmount > 0 ? (r.nutrientAmount / totalNutrientAmount) * 100 : 0,
    }))
    .sort((a, b) => b.nutrientAmount - a.nutrientAmount)
    .map((row) => ({
      ...row,
      nutrientAmount: Math.round(row.nutrientAmount * 10000) / 10000,
      contributionPct: Math.round(row.contributionPct * 100) / 100,
    }));

  const roundedTotal = Math.round(totalNutrientAmount * 10000) / 10000;

  return {
    nutrientKey: reportedKey,
    totalNutrientAmount: roundedTotal,
    items,
  };
}
