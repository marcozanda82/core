import { TARGETS } from '../../../useBiochimico';
import { buildFoodUnits, enrichPortionItemWithDbUnits } from '../../../foodUnits';
import { normalizeSearchText, searchFoodsDetailed } from '../../../foodSearch.js';

export const FOOD_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  NEEDS_RESOLUTION: 'NEEDS_RESOLUTION',
});

const DB_META_KEYS = new Set([
  'id', 'isRecipe', 'type', 'desc', 'name', 'ingredients', 'units', 'defaultUnit',
  'category', 'foodDbKey', 'unitStep', 'defaultQty', 'barcode', 'image', 'row',
  // Health / NOVA labels (non sono nutrienti /100g)
  'novaScore', 'inflammationFactor', 'hasSaturatedFats',
]);

/**
 * Legge un numero dal DB (/100g). `0` è valido. `undefined` = chiave assente o non numerica.
 */
export function parseDbNumeric(raw) {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t.toLowerCase() === 'tr') return undefined;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Copia nutrienti DB → porzione. Restituisce le chiavi esplicitamente fornite (incluso fibre: 0).
 */
export function applyDbNutrientsToPortionItem(item, dbRow, qta) {
  const provided = new Set();
  if (!item || !dbRow || typeof dbRow !== 'object') return provided;
  const factor = Number(qta) / 100;
  if (!Number.isFinite(factor)) return provided;

  const assignPer100 = (canonKey, per100) => {
    if (per100 === undefined) return;
    item[canonKey] = per100 * factor;
    provided.add(canonKey);
    if (canonKey === 'fat' || canonKey === 'fatTotal') {
      provided.add('fat');
      provided.add('fatTotal');
    }
    if (canonKey === 'kcal' || canonKey === 'cal') {
      provided.add('kcal');
      provided.add('cal');
    }
  };

  Object.keys(dbRow).forEach((k) => {
    if (DB_META_KEYS.has(k)) return;
    assignPer100(k, parseDbNumeric(dbRow[k]));
  });

  const fibrePer100 = parseDbNumeric(dbRow.fibre) ?? parseDbNumeric(dbRow.fiber);
  if (fibrePer100 !== undefined) {
    assignPer100('fibre', fibrePer100);
  }

  return provided;
}

/**
 * Stima euristica per 100g — SOLO per flussi espliciti di stima utente (form manuale / provisional).
 * NON usata da estraiDatiFoodDb / resolver automatico (tolleranza zero).
 */
export function getAverageEstimate({ nutrientKey, foodDesc = '', fullHistory }) {
  void fullHistory;
  const desc = String(foodDesc || '').toLowerCase();
  const isProteico = /pollo|carne|pesce|tonno|salmone|manzo|petto|bresaola|prosciutto|uovo|tofu|legum|fagiol|ceci|lenticch|proteina|merluzz|nasello|baccal/.test(desc);
  const isCarboidrato = /pasta|pane|riso|patata|cereal|pizza|biscott|dolce|zucchero|miele|frutta|banana|mela/.test(desc);
  const isGrasso = /olio|avocado|frutta secca|mandorla|noci|semi|burro/.test(desc);
  if (nutrientKey === 'prot') return isProteico ? 18 : (isCarboidrato ? 6 : 10);
  if (nutrientKey === 'carb') return isCarboidrato ? 45 : (isProteico ? 2 : 15);
  if (nutrientKey === 'fatTotal' || nutrientKey === 'fat') return isGrasso ? 15 : (isProteico ? 5 : 8);
  if (nutrientKey === 'kcal' || nutrientKey === 'cal') {
    const p = getAverageEstimate({ nutrientKey: 'prot', foodDesc, fullHistory });
    const c = getAverageEstimate({ nutrientKey: 'carb', foodDesc, fullHistory });
    const f = getAverageEstimate({ nutrientKey: 'fatTotal', foodDesc, fullHistory });
    return Math.round((p * 4 + c * 4 + f * 9)) || 120;
  }
  if (nutrientKey === 'fibre' || nutrientKey === 'fiber') {
    return isCarboidrato ? 3 : 0;
  }
  if (nutrientKey === 'omega3') return isProteico ? 0.5 : 0.3;
  if (nutrientKey === 'mg') return 25;
  return 0;
}

/**
 * Chiavi TARGETS mancanti → 0 (niente stime automatiche).
 */
function zeroFillMissingNutrients(item, dbProvidedKeys) {
  if (!item) return;
  Object.keys(TARGETS).forEach((g) => {
    Object.keys(TARGETS[g] || {}).forEach((k) => {
      if (dbProvidedKeys?.has(k)) return;
      if (item[k] !== undefined && item[k] !== null) return;
      item[k] = 0;
    });
  });
  if (item.kcal == null) item.kcal = item.cal ?? 0;
  if (item.cal == null) item.cal = item.kcal ?? 0;
  if (item.fat == null && item.fatTotal != null) item.fat = item.fatTotal;
  if (item.fatTotal == null && item.fat != null) item.fatTotal = item.fat;
}

/**
 * Match DB: preferredKey → uguaglianza case-insensitive su desc/name → top hit search.
 * Niente `.includes` lasco (evita match spurî).
 */
export function findFoodDbKey(foodDb, nome, preferredDbKey = null) {
  if (preferredDbKey != null && foodDb?.[preferredDbKey] != null) {
    return preferredDbKey;
  }

  const needle = normalizeSearchText(nome);
  if (!needle || !foodDb || typeof foodDb !== 'object') return null;

  const entries = Object.entries(foodDb);
  for (let i = 0; i < entries.length; i += 1) {
    const [key, food] = entries[i];
    const descNorm = normalizeSearchText(food?.desc);
    const nameNorm = normalizeSearchText(food?.name);
    if (descNorm === needle || nameNorm === needle) return key;
  }

  const hits = searchFoodsDetailed(foodDb, nome, {
    limit: 1,
    includeUserHistory: false,
  });
  const top = hits[0];
  if (!top) return null;
  // Accetta solo match forti (exact/prefix 100 o word-boundary 75+)
  if (Number(top.strictScore) >= 75) return top.id;
  return null;
}

function buildUnresolvedFoodItem({ nome, qta, pastoType }) {
  const foodItem = Object.assign(
    {
      id: Date.now() + Math.random(),
      type: 'food',
      mealType: pastoType,
      desc: nome,
      name: nome,
      qta,
      weight: qta,
      kcal: 0,
      cal: 0,
      prot: 0,
      carb: 0,
      fat: 0,
      fatTotal: 0,
      foodDbKey: null,
      status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    },
    ...Object.keys(TARGETS).flatMap((g) => Object.keys(TARGETS[g]).map((k) => ({ [k]: 0 }))),
  );
  const { units, defaultUnit, category } = buildFoodUnits({ desc: nome }, '');
  return { ...foodItem, units, defaultUnit, category };
}

/**
 * Estrazione dati alimento da DB. Tolleranza zero: niente stime medie automatiche.
 * Match assente → macronutrienti 0 + status NEEDS_RESOLUTION.
 */
export function estraiDatiFoodDb({
  nome,
  qta,
  pastoType,
  preferredDbKey,
  foodDb,
  fullHistory,
}) {
  void fullHistory;
  const dbKey = findFoodDbKey(foodDb, nome, preferredDbKey);
  if (!dbKey) {
    return buildUnresolvedFoodItem({ nome, qta, pastoType });
  }

  const dbF = foodDb[dbKey];
  if (dbF.isRecipe && Array.isArray(dbF.ingredients) && dbF.ingredients.length > 0) {
    const factor = qta / 100;
    const ingredients = dbF.ingredients.map((ing) => {
      const w0 = Number(ing.weight) || 0;
      const wf = w0 > 0 ? Math.max(5, Math.round(w0 * factor)) / w0 : factor;
      return {
        ...ing,
        weight: Math.max(5, Math.round(w0 * factor)),
        kcal: Math.max(0, Math.round((Number(ing.kcal) || 0) * wf)),
        prot: Math.max(0, Math.round((Number(ing.prot) || 0) * wf * 10) / 10),
        carb: Math.max(0, Math.round((Number(ing.carb) || 0) * wf * 10) / 10),
        fat: Math.max(0, Math.round((Number(ing.fat) || 0) * wf * 10) / 10),
      };
    });
    const recipeItem = {
      id: `recipe_${Date.now()}`,
      type: 'recipe',
      mealType: pastoType,
      desc: dbF.desc || nome,
      name: dbF.desc || nome,
      qta,
      weight: qta,
      unitStep: 50,
      kcal: ((Number(dbF.kcal) || 0) * qta) / 100,
      cal: ((Number(dbF.kcal) || 0) * qta) / 100,
      prot: ((Number(dbF.prot) || 0) * qta) / 100,
      carb: ((Number(dbF.carb) || 0) * qta) / 100,
      fat: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
      fatTotal: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
      ingredients,
      foodDbKey: dbKey,
      status: FOOD_RESOLUTION_STATUS.RESOLVED,
    };
    const dbProvided = applyDbNutrientsToPortionItem(recipeItem, dbF, qta);
    zeroFillMissingNutrients(recipeItem, dbProvided);
    return recipeItem;
  }

  const foodItem = Object.assign(
    {
      id: Date.now() + Math.random(),
      type: 'food',
      mealType: pastoType,
      desc: nome,
      qta,
      weight: qta,
      kcal: 0,
      cal: 0,
      foodDbKey: dbKey,
      status: FOOD_RESOLUTION_STATUS.RESOLVED,
    },
    ...Object.keys(TARGETS).flatMap((g) => Object.keys(TARGETS[g]).map((k) => ({ [k]: undefined }))),
  );
  const dbProvided = applyDbNutrientsToPortionItem(foodItem, dbF, qta);
  zeroFillMissingNutrients(foodItem, dbProvided);
  foodItem.desc = dbF.desc || foodItem.desc || nome;
  foodItem.name = dbF.desc || dbF.name || nome;
  return enrichPortionItemWithDbUnits(foodItem, dbF, dbKey);
}
