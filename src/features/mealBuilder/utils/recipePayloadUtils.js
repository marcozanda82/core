import { getComboFoodItems } from './comboFoodUtils';
import { isRecipeRow } from './recipeDraftUtils';

export function computeMacrosFromIngredients(ingredients) {
  let totalWeight = 0;
  let totalKcal = 0;
  let totalP = 0;
  let totalC = 0;
  let totalF = 0;

  (ingredients || []).forEach((item) => {
    const weight = Number(item?.weight ?? item?.qta) || 0;
    totalWeight += weight;
    totalKcal += Number(item?.kcal ?? item?.cal) || 0;
    totalP += Number(item?.prot) || 0;
    totalC += Number(item?.carb) || 0;
    totalF += Number(item?.fat ?? item?.fatTotal) || 0;
  });

  if (totalWeight <= 0) totalWeight = 100;

  const factor = 100 / totalWeight;

  return {
    totalWeight: Math.round(totalWeight),
    kcal: Math.round(totalKcal * factor),
    prot: Math.round(totalP * factor * 10) / 10,
    carb: Math.round(totalC * factor * 10) / 10,
    fatTotal: Math.round(totalF * factor * 10) / 10,
    servingKcal: Math.round(totalKcal),
    servingP: Math.round(totalP * 10) / 10,
    servingC: Math.round(totalC * 10) / 10,
    servingF: Math.round(totalF * 10) / 10,
  };
}

export function buildMonolithicDraftPayload({
  name,
  foodDbKey,
  row,
  servingWeight,
  isRecipe = true,
  customImage = null,
  comboId = null,
}) {
  const desc = String(name || row?.desc || 'Ricetta').trim() || 'Ricetta';
  const weight = Math.max(1, Math.round(Number(servingWeight) || 100));
  const per100 = {
    kcal: Math.round(Number(row?.kcal ?? row?.cal) || 0),
    prot: Number(row?.prot) || 0,
    carb: Number(row?.carb) || 0,
    fat: Number(row?.fatTotal ?? row?.fat) || 0,
  };
  const ratio = weight / 100;

  return {
    type: 'food',
    desc,
    name: desc,
    label: desc,
    foodDbKey,
    isRecipe,
    comboId,
    customImage,
    defaultUnitWeight: weight,
    totalWeight: weight,
    row: {
      ...row,
      desc,
      kcal: per100.kcal,
      cal: per100.kcal,
      prot: per100.prot,
      carb: per100.carb,
      fat: per100.fat,
      fatTotal: per100.fat,
      isRecipe: true,
    },
    qta: weight,
    weight,
    unit: 'g',
    selectedUnit: 'g',
    multiplier: weight,
    qtyLabel: `${weight}g`,
    kcal: Math.round(per100.kcal * ratio),
    cal: Math.round(per100.kcal * ratio),
    prot: Math.round(per100.prot * ratio * 10) / 10,
    carb: Math.round(per100.carb * ratio * 10) / 10,
    fat: Math.round(per100.fat * ratio * 10) / 10,
    fatTotal: Math.round(per100.fat * ratio * 10) / 10,
  };
}

export function buildComboDraftPayload(combo) {
  const items = getComboFoodItems(combo);
  if (items.length === 0) return null;

  const macros = computeMacrosFromIngredients(items);
  const id = String(combo?.id ?? combo?.signature ?? 'combo').trim() || 'combo';
  const name = String(combo?.name ?? 'Combo pasto').trim() || 'Combo pasto';

  return buildMonolithicDraftPayload({
    name,
    foodDbKey: `recipe:${id}`,
    comboId: id,
    customImage: combo?.customImage || null,
    servingWeight: macros.totalWeight,
    row: {
      desc: name,
      kcal: macros.kcal,
      cal: macros.kcal,
      prot: macros.prot,
      carb: macros.carb,
      fat: macros.fatTotal,
      fatTotal: macros.fatTotal,
      isRecipe: true,
    },
  });
}

export function buildRecipeDraftPayloadFromDb(recipeKey, entry) {
  if (!recipeKey || !entry || !isRecipeRow(entry)) return null;

  const name = String(entry.desc ?? entry.name ?? '').trim();
  const ingredients = Array.isArray(entry.ingredients) ? entry.ingredients : [];
  if (!name) return null;

  const macros = ingredients.length > 0
    ? computeMacrosFromIngredients(ingredients)
    : {
        totalWeight: 100,
        kcal: Math.round(Number(entry.kcal ?? entry.cal) || 0),
        prot: Number(entry.prot) || 0,
        carb: Number(entry.carb) || 0,
        fatTotal: Number(entry.fatTotal ?? entry.fat) || 0,
      };

  return buildMonolithicDraftPayload({
    name,
    foodDbKey: String(recipeKey).trim(),
    customImage: entry.customImage || null,
    servingWeight: macros.totalWeight,
    row: {
      desc: name,
      kcal: macros.kcal,
      cal: macros.kcal,
      prot: macros.prot,
      carb: macros.carb,
      fat: macros.fatTotal,
      fatTotal: macros.fatTotal,
      isRecipe: true,
      ingredients,
    },
  });
}

export function buildRecipeDraftPayloadFromSearchResult(result, personalDb) {
  if (!result) return null;
  const key = String(result.key ?? result.id ?? '').trim();
  const row = result.row || personalDb?.[key];
  if (key && row) return buildRecipeDraftPayloadFromDb(key, row);
  if (result.ingredients) {
    return buildComboDraftPayload({
      id: key,
      name: result.desc || result.name,
      ingredients: result.ingredients,
    });
  }
  return null;
}
