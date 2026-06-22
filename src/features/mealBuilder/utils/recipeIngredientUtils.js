import { computeMacrosForWeight, getPer100Macros } from './foodMacroUtils';
import { roundToOneDecimal } from './numberFormatUtils';

export function normalizeIngredient(ing, index) {
  const desc = String(ing?.desc ?? ing?.name ?? 'Ingrediente').trim() || 'Ingrediente';
  const weight = roundToOneDecimal(Number(ing?.weight ?? ing?.qta) || 100);
  const kcal = Math.round(Number(ing?.kcal ?? ing?.cal) || 0);
  const prot = Math.round((Number(ing?.prot) || 0) * 10) / 10;
  const carb = Math.round((Number(ing?.carb) || 0) * 10) / 10;
  const fat = Math.round((Number(ing?.fatTotal ?? ing?.fat) || 0) * 10) / 10;

  return {
    id: ing?.id ?? `ing_${index}`,
    desc,
    name: desc,
    weight,
    qta: weight,
    kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
    foodDbKey: ing?.foodDbKey ?? null,
    row: ing?.row ?? null,
  };
}

export function scaleIngredientMacros(ing, newWeight) {
  const oldWeight = Number(ing.weight) || 0;
  const weight = roundToOneDecimal(newWeight);
  if (oldWeight <= 0 || weight <= 0) return { ...ing, weight, qta: weight };

  const ratio = weight / oldWeight;
  return {
    ...ing,
    weight,
    qta: weight,
    kcal: Math.round(ing.kcal * ratio),
    prot: Math.round(ing.prot * ratio * 10) / 10,
    carb: Math.round(ing.carb * ratio * 10) / 10,
    fat: Math.round(ing.fat * ratio * 10) / 10,
    fatTotal: Math.round(ing.fat * ratio * 10) / 10,
  };
}

export function buildIngredientFromSearchResult(result, weight = 100) {
  const safeWeight = roundToOneDecimal(Math.max(1, Number(weight) || 100));
  const name = String(result?.desc || result?.name || 'Ingrediente').trim() || 'Ingrediente';
  const per100 = getPer100Macros({ row: result?.row, ...result });
  const portion = computeMacrosForWeight(per100, safeWeight);

  return normalizeIngredient(
    {
      id: `ing_${Date.now()}_${result?.id || Math.random().toString(36).slice(2)}`,
      desc: name,
      name,
      weight: safeWeight,
      kcal: portion.kcal,
      prot: portion.prot,
      carb: portion.carb,
      fat: portion.fat,
      fatTotal: portion.fat,
      foodDbKey: result?._source === 'personal' ? (result.key || result.id) : undefined,
      row: result?.row,
    },
    0,
  );
}
