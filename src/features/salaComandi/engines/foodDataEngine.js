import { TARGETS, getDefaultNutrientValue } from '../../../useBiochimico';
import { buildFoodUnits, enrichPortionItemWithDbUnits } from '../../../foodUnits';

/**
 * Stima media verosimile per nutriente mancante (mai 0: usa contesto nome o media).
 */
export function getAverageEstimate({ nutrientKey, foodDesc = '', fullHistory }) {
  const desc = String(foodDesc || '').toLowerCase();
  const isProteico = /pollo|carne|pesce|tonno|salmone|manzo|petto|bresaola|prosciutto|uovo|tofu|legum|fagiol|ceci|lenticch|proteina/.test(desc);
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
  const def = getDefaultNutrientValue(nutrientKey, fullHistory);
  return def > 0 ? def : (nutrientKey === 'fibre' ? 3 : nutrientKey === 'omega3' ? 0.3 : nutrientKey === 'mg' ? 25 : 10);
}

/**
 * Estrazione dati alimento da DB con fallback stime e unità.
 * Mantiene la stessa catena di fallback di SalaComandi.
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
      Object.keys(dbF || {}).forEach((k) => {
        if (typeof dbF[k] === 'number' && k !== 'id' && k !== 'kcal' && k !== 'cal' && !['prot', 'carb', 'fatTotal', 'fat'].includes(k)) {
          recipeItem[k] = (dbF[k] / 100) * qta;
        }
      });
      const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
      Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
        if (recipeItem[k] == null || recipeItem[k] === 0) {
          recipeItem[k] = macroKeys.includes(k)
            ? (getAverageEstimate({ nutrientKey: k, foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue(k, fullHistory)
            : getDefaultNutrientValue(k, fullHistory);
        }
      }));
      recipeItem.kcal = recipeItem.kcal || recipeItem.cal || 0;
      recipeItem.cal = recipeItem.cal ?? recipeItem.kcal;
      return recipeItem;
    }
    foodItem.foodDbKey = dbKey;
    Object.keys(dbF || {}).forEach((k) => {
      if (typeof dbF[k] === 'number' && k !== 'id') foodItem[k] = (dbF[k] / 100) * qta;
    });
    foodItem.kcal = foodItem.kcal || foodItem.cal || 0;
    foodItem.cal = foodItem.cal ?? foodItem.kcal;
    const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
    Object.keys(TARGETS).forEach((g) => Object.keys(TARGETS[g]).forEach((k) => {
      if (foodItem[k] == null || foodItem[k] === 0) {
        foodItem[k] = macroKeys.includes(k)
          ? (getAverageEstimate({ nutrientKey: k, foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue(k, fullHistory)
          : getDefaultNutrientValue(k, fullHistory);
      }
    }));
    if (!foodItem.kcal || foodItem.kcal === 0) {
      foodItem.kcal = (getAverageEstimate({ nutrientKey: 'kcal', foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue('kcal', fullHistory);
    }
    return enrichPortionItemWithDbUnits(foodItem, dbF, dbKey);
  }

  const macroKeys = ['kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fibre'];
  foodItem.kcal = (getAverageEstimate({ nutrientKey: 'kcal', foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue('kcal', fullHistory);
  foodItem.cal = foodItem.kcal;
  foodItem.prot = (getAverageEstimate({ nutrientKey: 'prot', foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue('prot', fullHistory);
  foodItem.carb = (getAverageEstimate({ nutrientKey: 'carb', foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue('carb', fullHistory);
  foodItem.fatTotal = (getAverageEstimate({ nutrientKey: 'fatTotal', foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue('fatTotal', fullHistory);
  Object.values(TARGETS).forEach((g) => Object.keys(g || {}).forEach((k) => {
    if (foodItem[k] == null) {
      foodItem[k] = macroKeys.includes(k)
        ? (getAverageEstimate({ nutrientKey: k, foodDesc: nome, fullHistory }) / 100) * qta || getDefaultNutrientValue(k, fullHistory)
        : getDefaultNutrientValue(k, fullHistory);
    }
  }));
  const { units, defaultUnit, category } = buildFoodUnits({ desc: nome }, '');
  return { ...foodItem, units, defaultUnit, category };
}
