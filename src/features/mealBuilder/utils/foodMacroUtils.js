export function getPer100Macros(food) {
  const row = food?.row || food || {};
  return {
    kcal:
      Number(row.baseKcal ?? row.kcal ?? row.cal ?? food?.baseKcal ?? food?.kcal ?? food?.cal) || 0,
    prot: Number(row.baseP ?? row.prot ?? food?.baseP ?? food?.prot) || 0,
    carb: Number(row.baseC ?? row.carb ?? food?.baseC ?? food?.carb) || 0,
    fat:
      Number(
        row.baseF ?? row.fatTotal ?? row.fat ?? food?.baseF ?? food?.fatTotal ?? food?.fat,
      ) || 0,
  };
}

export function resolveUnitName(food) {
  if (food?.unitName != null && String(food.unitName).trim() !== '') {
    return String(food.unitName).trim();
  }
  const defaultUnit = food?.defaultUnit ?? food?.row?.defaultUnit;
  if (defaultUnit?.label) return String(defaultUnit.label).trim();
  return '';
}

export function resolveDefaultUnitWeight(food, fallback = 100) {
  const explicit = Number(food?.defaultUnitWeight ?? food?.defaultServingWeight);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const defaultUnit = food?.defaultUnit ?? food?.row?.defaultUnit;
  if (defaultUnit && Number(defaultUnit.grams) > 0) {
    return Number(defaultUnit.grams);
  }

  const units = food?.units ?? food?.row?.units;
  if (Array.isArray(units) && units[0] && Number(units[0].grams) > 0) {
    return Number(units[0].grams);
  }

  return fallback;
}

export function computeMacrosForWeight(per100, weight) {
  const w = Math.max(0, Number(weight) || 0);
  const ratio = w / 100;

  return {
    kcal: Math.round(per100.kcal * ratio),
    prot: Math.round(per100.prot * ratio * 10) / 10,
    carb: Math.round(per100.carb * ratio * 10) / 10,
    fat: Math.round(per100.fat * ratio * 10) / 10,
  };
}

export function computeMacrosForUnit(per100, unitWeight) {
  return computeMacrosForWeight(per100, unitWeight);
}

export function buildBaseMacroFields(per100) {
  return {
    baseKcal: Math.round(Number(per100.kcal) || 0),
    baseP: Math.round((Number(per100.prot) || 0) * 10) / 10,
    baseC: Math.round((Number(per100.carb) || 0) * 10) / 10,
    baseF: Math.round((Number(per100.fat) || 0) * 10) / 10,
  };
}

export function applyPer100ToRow(row, per100) {
  const base = buildBaseMacroFields(per100);
  return {
    ...row,
    kcal: base.baseKcal,
    cal: base.baseKcal,
    prot: base.baseP,
    carb: base.baseC,
    fatTotal: base.baseF,
    fat: base.baseF,
    ...base,
  };
}
