/**
 * USDA FoodData Central — ricerca secondaria (non sostituisce CREA).
 * In caso di errore o chiave assente restituisce [] senza propagare eccezioni.
 */

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

function getApiKey() {
  try {
    return String(import.meta.env?.VITE_USDA_API_KEY || '').trim() || 'DEMO_KEY';
  } catch {
    return 'DEMO_KEY';
  }
}

function nutrientValue(foodNutrients, nutrientId) {
  const list = Array.isArray(foodNutrients) ? foodNutrients : [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    const id = n?.nutrientId ?? n?.nutrient?.id
      ?? (n?.nutrientNumber != null ? Number(n.nutrientNumber) : undefined);
    if (Number(id) === Number(nutrientId)) {
      const v = Number(n?.value ?? n?.amount);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}

/** Nutrient IDs FDC: Energy 1008, Protein 1003, Carbs 1005, Fat 1004 */
function mapUsdaFoodToRow(food) {
  const fdcId = food?.fdcId ?? food?.id;
  const desc = String(food?.description || food?.lowercaseDescription || '').trim();
  if (!fdcId || !desc) return null;

  const nutrients = food?.foodNutrients || [];
  let kcal = nutrientValue(nutrients, 1008);
  if (!kcal) {
    const kj = nutrientValue(nutrients, 1062);
    if (kj) kcal = kj / 4.184;
  }
  const prot = nutrientValue(nutrients, 1003);
  const carb = nutrientValue(nutrients, 1005);
  const fat = nutrientValue(nutrients, 1004);

  return {
    id: `USDA_${fdcId}`,
    desc,
    name: desc,
    kcal: Math.round(kcal * 10) / 10,
    prot: Math.round(prot * 10) / 10,
    carb: Math.round(carb * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    gramsPerUnit: 100,
    defaultUnit: 'g',
    foodSource: 'USDA',
  };
}

/**
 * @param {string} query
 * @param {{ signal?: AbortSignal, pageSize?: number }} [opts]
 * @returns {Promise<Array<{ id: string, name: string, row: object }>>}
 */
export async function searchUSDAFoods(query, opts = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const pageSize = Math.min(25, Math.max(5, Number(opts.pageSize) || 12));

  try {
    const key = getApiKey();
    const url = `${FDC_SEARCH_URL}?api_key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, pageSize }),
      signal: opts.signal,
    });
    if (!res.ok) return [];

    const data = await res.json();
    const foods = Array.isArray(data?.foods) ? data.foods : [];
    const out = [];

    for (let i = 0; i < foods.length; i += 1) {
      const row = mapUsdaFoodToRow(foods[i]);
      if (!row) continue;
      out.push({
        id: row.id,
        name: row.desc,
        row,
      });
    }
    return out;
  } catch {
    return [];
  }
}
