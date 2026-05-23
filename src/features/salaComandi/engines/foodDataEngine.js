import { TARGETS, getDefaultNutrientValue } from '../../../useBiochimico';
import { buildFoodUnits, enrichPortionItemWithDbUnits } from '../../../foodUnits';

const DB_META_KEYS = new Set([
  'id', 'isRecipe', 'type', 'desc', 'name', 'ingredients', 'units', 'defaultUnit',
  'category', 'foodDbKey', 'unitStep', 'defaultQty', 'barcode', 'image', 'row',
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
 * Stima euristica per 100g quando il nutriente manca nel DB.
 * NON usa getDefaultNutrientValue: quella funzione restituisce quote-pasto (es. fibre 30/4 = 7.5g).
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

/** Stima scalata sulla porzione (sempre da valori per 100g). */
function scaledNutrientEstimate(nutrientKey, foodDesc, qta, fullHistory) {
  return (getAverageEstimate({ nutrientKey, foodDesc, fullHistory }) / 100) * qta;
}

/**
 * Fallback solo se il DB non ha fornito la chiave (null/undefined). Mai sovrascrivere 0.
 */
function fillMissingNutrientOnItem(item, k, nome, qta, fullHistory, macroKeys, dbProvidedKeys) {
  if (dbProvidedKeys?.has(k)) return;
  if (item[k] !== undefined && item[k] !== null) return;

  if (macroKeys.includes(k)) {
    const scaled = scaledNutrientEstimate(k, nome, qta, fullHistory);
    item[k] = Number.isFinite(scaled) ? scaled : 0;
    return;
  }

  const micro = getDefaultNutrientValue(k, fullHistory);
  item[k] = micro ?? 0;
}

/**
 * Estrazione dati alimento da DB con fallback stime e unità.
 */
export function estraiDatiFoodDb({
  nome,
  qta,
  pastoType,
  preferredDbKey,
  foodDb,
  fullHistory,
}) {
  const foodItem = Object.assign(
    { id: Date.now() + Math.random(), type: 'food', mealType: pastoType, desc: nome, qta, weight: qta, kcal: 0, cal: 0 },
    ...Object.keys(TARGETS).flatMap((g) => Object.keys(TARGETS[g]).map((k) => ({ [k]: undefined })))
  );
  const dbKey =
    preferredDbKey != null && foodDb?.[preferredDbKey] != null
      ? preferredDbKey
      : Object.keys(foodDb || {}).find((k) => foodDb?.[k]?.desc?.toLowerCase()?.includes(String(nome || '').toLowerCase()));
  if (dbKey) {
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
      };
      const dbProvided = applyDbNutrientsToPortionItem(recipeItem, dbF, qta);
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        fillMissingNutrientOnItem(recipeItem, k, nome, qta, fullHistory, macroKeys, dbProvided);
      }));
      recipeItem.kcal = recipeItem.kcal ?? recipeItem.cal ?? 0;
      recipeItem.cal = recipeItem.cal ?? recipeItem.kcal;
      return recipeItem;
    }
    foodItem.foodDbKey = dbKey;
    const dbProvided = applyDbNutrientsToPortionItem(foodItem, dbF, qta);
    foodItem.kcal = foodItem.kcal ?? foodItem.cal ?? 0;
    foodItem.cal = foodItem.cal ?? foodItem.kcal;
    const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
    Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
      fillMissingNutrientOnItem(foodItem, k, nome, qta, fullHistory, macroKeys, dbProvided);
    }));
    if (foodItem.kcal == null) {
      const scaledKcal = scaledNutrientEstimate('kcal', nome, qta, fullHistory);
      foodItem.kcal = scaledKcal ?? getDefaultNutrientValue('kcal', fullHistory);
    }
    return enrichPortionItemWithDbUnits(foodItem, dbF, dbKey);
  }

  const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
  foodItem.kcal = scaledNutrientEstimate('kcal', nome, qta, fullHistory) ?? getDefaultNutrientValue('kcal', fullHistory);
  foodItem.cal = foodItem.kcal;
  foodItem.prot = scaledNutrientEstimate('prot', nome, qta, fullHistory) ?? getDefaultNutrientValue('prot', fullHistory);
  foodItem.carb = scaledNutrientEstimate('carb', nome, qta, fullHistory) ?? getDefaultNutrientValue('carb', fullHistory);
  foodItem.fatTotal = scaledNutrientEstimate('fatTotal', nome, qta, fullHistory) ?? getDefaultNutrientValue('fatTotal', fullHistory);
  Object.values(TARGETS).forEach((g) => Object.keys(g || {}).forEach((k) => {
    fillMissingNutrientOnItem(foodItem, k, nome, qta, fullHistory, macroKeys, new Set());
  }));
  const { units, defaultUnit, category } = buildFoodUnits({ desc: nome }, '');
  return { ...foodItem, units, defaultUnit, category };
}
