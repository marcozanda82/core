import { flattenDraftFoodsForSave } from './recipeGroupUtils';

export function isRecipeRow(row) {
  return row?.isRecipe === true || row?.type === 'recipe';
}

/** Converte un ingrediente salvato in ricetta → voce bozza FastMealLogger. */
export function ingredientToDraftItem(ing, index, personalDb) {
  const desc = String(ing.desc ?? ing.name ?? 'Ingrediente').trim() || 'Ingrediente';
  const weight = Number(ing.weight ?? ing.qta) || 100;
  const kcal = Number(ing.kcal ?? ing.cal) || 0;
  const prot = Number(ing.prot) || 0;
  const carb = Number(ing.carb) || 0;
  const fat = Number(ing.fatTotal ?? ing.fat) || 0;

  const foodDbKey = ing.foodDbKey ?? ing.key ?? undefined;
  const dbRow = foodDbKey && personalDb?.[foodDbKey] && !isRecipeRow(personalDb[foodDbKey])
    ? personalDb[foodDbKey]
    : null;

  const ratio = weight > 0 ? 100 / weight : 1;
  const row = dbRow ?? ing.row ?? {
    desc,
    kcal: Math.round(kcal * ratio),
    prot: Math.round(prot * ratio * 10) / 10,
    carb: Math.round(carb * ratio * 10) / 10,
    fatTotal: Math.round(fat * ratio * 10) / 10,
  };

  return {
    type: 'food',
    desc,
    name: desc,
    foodDbKey,
    row,
    units: row.units ?? ing.units,
    defaultUnit: row.defaultUnit ?? ing.defaultUnit,
    qta: weight,
    weight,
    unit: 'g',
    selectedUnit: ing.selectedUnit || 'g',
    multiplier: Number(ing.multiplier) || weight,
    qtyLabel: ing.qtyLabel || `${weight}g`,
    kcal: Math.round(kcal),
    cal: Math.round(kcal),
    prot: Math.round(prot * 10) / 10,
    carb: Math.round(carb * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fatTotal: Math.round(fat * 10) / 10,
    id: ing.id != null ? String(ing.id) : undefined,
    _recipeIngredientIndex: index,
  };
}

export function draftFoodsToRecipeIngredients(draftFoods) {
  return flattenDraftFoodsForSave(draftFoods).map((f) => ({
    name: String(f.desc ?? f.name ?? 'Ingrediente').trim() || 'Ingrediente',
    desc: String(f.desc ?? f.name ?? 'Ingrediente').trim() || 'Ingrediente',
    weight: Number(f.weight ?? f.qta) || 100,
    kcal: Math.round(Number(f.kcal ?? f.cal) || 0),
    prot: Math.round((Number(f.prot) || 0) * 10) / 10,
    carb: Math.round((Number(f.carb) || 0) * 10) / 10,
    fat: Math.round((Number(f.fatTotal ?? f.fat) || 0) * 10) / 10,
    foodDbKey: f.foodDbKey,
  }));
}

export function draftFoodsToRecipePayload(draftFoods) {
  const ingredients = draftFoodsToRecipeIngredients(draftFoods);
  return {
    kcal: ingredients.reduce((acc, item) => acc + item.kcal, 0),
    prot: Math.round(ingredients.reduce((acc, item) => acc + item.prot, 0) * 10) / 10,
    carb: Math.round(ingredients.reduce((acc, item) => acc + item.carb, 0) * 10) / 10,
    fatTotal: Math.round(ingredients.reduce((acc, item) => acc + item.fat, 0) * 10) / 10,
    ingredients,
  };
}

export function fetchRecipesFromDb(personalDb) {
  if (!personalDb || typeof personalDb !== 'object') return [];

  const out = [];
  Object.entries(personalDb).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object' || !isRecipeRow(entry)) return;

    const name = String(entry.desc ?? entry.name ?? '').trim();
    if (!name) return;

    const ingredients = Array.isArray(entry.ingredients) ? entry.ingredients : [];
    if (ingredients.length === 0) return;

    const totalKcal = ingredients.reduce((acc, ing) => acc + (Number(ing.kcal) || 0), 0);

    out.push({
      key,
      id: key,
      name,
      desc: name,
      ingredients,
      kcal: Math.round(totalKcal),
      ingredientCount: ingredients.length,
      row: entry,
    });
  });

  out.sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return out;
}
